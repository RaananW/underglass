/**
 * The `instrument` material's mesh pass (Rendering Model 2D, `docs/ui-library/instrument-phase2.md`): one Babylon Lite
 * scene per instrument layer on core's shared engine, drawn right after that layer's own pass. `renderer.ts` creates
 * one controller (`createInstrumentController`) per engine and calls it from its frame: `frame` validates budgets and
 * containment, starts builds and writes every instance in the same frame as the layer's geometry; `contexts` names the
 * scene that draws after a layer's pass; `afterFrame` reads GPU timings and finishes a build's first frame.
 *
 * Each layer scene has the stage camera (at the canvas centre, `D` away, mapping the face plane one CSS px to one CSS
 * px), the key light (with its PCF shadow map, Lite's `shadow` task), an optional diffuse fill, the studio environment
 * and the post chain (core work item 3, `instrument-post.ts` for its settings), in task order:
 * - `face`: one quad per object that darkens the face by its parts' analytic shadows (the Relief formula, 2.8), straight
 *   onto the swapchain;
 * - `mask`: the clip mask, 1 where a pixel centre lies inside a drawn object's `bounds` and the layer's clip;
 * - `parts`: the PBR parts (thin-instanced per kind, GPU-culled) into the shared mesh target, cleared transparent, with
 *   its own depth;
 * - `taa`, `contact`, `ssgi`, `smaa` (the ones the scene turns on), then `emitters` and `bloom` (flat glow copies of the
 *   lit lenses, bloomed);
 * - `caps`: the captured caps into their own target, depth-tested against the parts;
 * - `composite`: one effect onto the swapchain over the layer's rectangle: `α · [caps + (1 − caps.a) · (parts + halo) · mask]`,
 *   premultiplied, so the layer's opacity applies to its meshes as a group.
 * The targets are shared by every instrument layer of the engine: each layer's chain runs to its composite before the
 * next layer's scene starts.
 *
 * World axes are Lite's (y up, +z away from the viewer, the stage centre at the origin). Instance matrices map
 * part-local px to world: the canvas conversion, times the layer's similarity (with z scaled alike), times the part's
 * placement. Every resource belongs to its scene (`onSceneDispose`) or to the controller (the grain map), and is
 * released after a queue fence or device loss, as superseded compositions are.
 */
import {
  addClusteredLightContainer, addMeshToTask, addTask, addToScene, createBloomPostProcessTask, createClusteredLightContainer, createClusteredPointLight, createDirectionalLight,
  createDynamicTexture, createEffectRenderTask, createEffectWrapper, createFreeCamera, createHemisphericLight, createPcfDirectionalShadowGenerator, markClusteredLightContainerDirty,
  createMeshFromData, createPbrMaterial, createRenderTask, createSceneContext, createScreenSpaceContactShadowsPostProcessTask,
  createScreenSpaceGlobalIlluminationPostProcessTask, createShaderMaterial, createSmaaPostProcessTask, createStorageBuffer, createSurfaceRenderTargetTexture, createTaaPostProcessTask,
  disposeEffectWrapper, disposeRenderTargetTexture, onRenderTargetTextureResize, disposeScene, disposeStorageBuffer, enableAsyncShaderPipelineCompilation, enableShaderMaterialInstanceWorld, enableThinInstanceGpuCulling,
  flushThinInstances, getRenderTaskGpuTimings, isGpuTimingSupported, loadHdrEnvironment, onSceneDispose, registerScene, registerSceneWithShadowSupport, releaseTexture,
  setEffectTexture, setEffectUniforms, setEnvironmentRotation, setPbrAnisotropy, setPbrClearCoat, setPbrEmissive, setPbrIridescence, setPbrMetallicReflectance, setPbrSheen,
  setMeshVisible, setRenderTaskGpuTimingEnabled, setShaderStorageBuffer, setShaderTexture, setShaderUniform, setShadowTaskCasterMeshes, setThinInstanceCount, setThinInstances,
  resizeMeshGeometry, unregisterScene, updateDynamicTexture, updateStorageBuffer, vec3, withSampledDepthTexture,
  type ClusteredLightContainer, type DirectionalLight, type DynamicTexture2D, type EngineContext, type FreeCamera, type Material, type Mesh, type PbrMaterialProps,
  type RenderingContext, type RenderTargetTextureResult, type RenderTask, type SceneContext, type ShaderMaterial, type ShadowGenerator, type StorageBuffer, type Task,
} from "@babylonjs/lite";
import { DEFAULT_FEATHER, EMITTERS_PER_LAYER, GUARD_CELLS, guardCells, layerGuard, PROTECTED_PER_LAYER, shadowScales, type Guard, type LayerEmitters } from "./emitters.js";
import { createAssetStore } from "./instrument-assets.js";
import { INSTRUMENT_CUSTOM_TRIANGLES_PER_LAYER, meshGeometry, type MeshProfile } from "./instrument-mesh.js";
import {
  boundsInside, checkContainment, containmentFrontier, containmentKey, customParts, instrumentFaceScene, instrumentLayout, instrumentPartCount, instrumentStructure, meshReady, meshReferences,
  multiply, partCaster, partDrawn, partKinds,
  partMatrix, profileBounds, profileGeometry, sameGeometry, similarity, INSTRUMENT_CASTERS_PER_OBJECT, INSTRUMENT_KINDS_CEILING, INSTRUMENT_KINDS_PER_LAYER, INSTRUMENT_OBJECTS, INSTRUMENT_PARTS_PER_LAYER,
  INSTRUMENT_PARTS_PER_STAGE, STUDIO_DEFAULTS, type Containment, type ContainmentFrontier, type InstrumentCaster, type InstrumentObject,
  type InstrumentProfile, type InstrumentRecipe, type InstrumentScene, type Matrix, type PartKind, type StudioTokens,
} from "./instrument.js";
import {
  compositeRect, settledAll, INSTRUMENT_CONTRAST, INSTRUMENT_EXPOSURE, liteMapBias, mapSettings, mapWindow, partGlow, placedBox, postFlags, postStructure, POST_SETTINGS,
  POST_STAGE_BUDGET_MS, POST_STAGES, type PostStage,
} from "./instrument-post.js";

/** A build that has not finished in this long steps its layer down (`compile`); GPU stays on. */
export const INSTRUMENT_BUILD_DEADLINE_MS = 10000;
/**
 * The longest a successor composition's 1.5 s deadline waits for a running mesh build (the compile gate) before it
 * starts anyway. Measured on Canary 158.0.8110.0 (RTX 3080): a start with three instrument layers is ready in
 * 0.88–1.33 s and a racing successor waited 323–717 ms, so 3 s is two to three times the measured need. A hung build
 * then holds every layer's frames (core skips frames while a successor is pending) for at most 3 s, and a successor
 * that still cannot compile falls back, diagnosed, after 3 s + 1.5 s; the build's own deadline stays 10 s.
 */
export const INSTRUMENT_SUCCESSOR_DEFERRAL_MS = 3000;

/** @internal Tests only (see `InstrumentControllerOptions.testHook`). */
export interface InstrumentTestHook {
  beforeBuild?(layerId: string): Promise<void> | void;
  failStage?(layerId: string, stage: PostStage | "composite"): boolean;
  /** Makes a scene's registration fail (after its chain is built), with (`minimal`) or without its optional stages. */
  failRegistration?(layerId: string, minimal: boolean): boolean;
  /** Makes a build fail before registration with an ordinary error (as a mesh or shader would), with or without its optional stages. */
  failBuild?(layerId: string, minimal: boolean): boolean;
}
/** The chain's target, mask or composite could not be built: the layer steps down with `post`. */
class PostBuildError extends Error {}
/** A scene's registration failed (its pipelines did not prepare), as opposed to an error while building it. */
class RegistrationError extends Error {}
/** The shared targets (decision 1 of item 3): formats per name; `mesh` also has a sampled depth. */
type TargetName = "mesh" | "ping" | "pong" | "mask" | "caps" | "emitters" | "glow";
const TARGET_FORMATS: Record<TargetName, { format: GPUTextureFormat; dFormat?: GPUTextureFormat }> = {
  mesh: { format: "rgba16float", dFormat: "depth24plus" }, ping: { format: "rgba16float" }, pong: { format: "rgba16float" }, mask: { format: "r8unorm" },
  caps: { format: "rgba8unorm" }, emitters: { format: "rgba8unorm" }, glow: { format: "rgba8unorm" },
};
const transparent = { r: 0, g: 0, b: 0, a: 0 };
/** The task suffixes and the stage each one's GPU time counts for (the emitter target's draw counts for bloom). */
const TASK_STAGES: Record<string, string> = { face: "face", mask: "mask", parts: "parts", taa: "taa", contact: "contact", ssgi: "ssgi", smaa: "smaa",
  emitters: "bloom", bloom: "bloom", caps: "caps", composite: "composite" };

/** What the renderer hands the controller for one presented layer, every frame. */
export interface InstrumentLayerInput {
  id: string;
  /** The layer's material when it is `instrument`, else undefined (the controller then drops the layer's scene). */
  scene: InstrumentScene | undefined;
  /** Layer-local CSS px to canvas CSS px, as drawn (including the renderer's diagnostic shift). */
  matrix: DOMMatrix;
  /** The layer's clip, layer-local CSS px. */
  clip: { x: number; y: number; width: number; height: number };
  extent: { width: number; height: number };
  opacity: number;
  /** The layer's capture and its grid, for captured caps (as the layer pass samples it). */
  texture: DynamicTexture2D;
  content: { width: number; height: number; pixelWidth: number; pixelHeight: number };
  /** The emitters the layer draws this frame (the budget's choice, `emitters.ts`): the parts' clustered lights. */
  lights?: LayerEmitters;
}
/** Why an object is drawn as its Relief primitive. */
export interface SteppedDown {
  object: string;
  reason: "containment" | "budget" | "compile" | "pending" | "order-unavailable" | "transform" | "post";
  part?: string;
  /** The smallest projected inset of the binding vertex, canvas px (negative: outside `bounds`). */
  inset?: number;
  /** How far the binding vertex lies past `bounds`, canvas px. */
  overshoot?: number;
  detail?: string;
}
type Status = "ready" | "pending" | "stepped-down" | "failed";

/** GPU time samples: the last 256, the latest, and how many were taken in all. */
interface Timing { samples: number[]; last: number | null; total: number }
/** One layer's mesh scene and what drives it. */
interface Pass {
  scene: SceneContext;
  camera: FreeCamera;
  structure: string;
  /** Whether these kinds (by key) and this many objects fit the scene's meshes and capacities. */
  capacityOk(kinds: ReadonlyMap<string, PartKind>, objects: number): boolean;
  /**
   * Writes one frame; `changed`: the geometry or the step-downs changed, so every instance is rewritten. `guard`: the
   * layer's protected rects with their shadow caps, which scale the face shadows inside them.
   */
  update(input: InstrumentLayerInput, scene: InstrumentScene, hidden: ReadonlySet<number>, stage: Stage, kinds: ReadonlyMap<string, PartKind>, changed: boolean, guard: Guard): number;
  /** The prefix of every task the scene names (`instrument:<layer>:`); Lite's map task is `shadow`. */
  prefix: string;
  registered: boolean;
  /** The clustered light container (a scene with `emitters`), and how many of its lights are lit. */
  lights?: ClusteredLightContainer;
  litLights: number;
  post: PassPost;
}
/** A stage's status: `idle` is bloom on a frame with no lit lens (its tasks off). */
type StageStatus = { status: "on" | "off" | "failed" | "idle"; error?: string };
/** One layer's post chain: its stages, its map and its GPU time per stage. */
interface PassPost {
  stages: Record<PostStage, StageStatus>;
  map?: { size: number; bias: number; biasPx: number; darkness: number; window: number; casters: number; renders: number; timedRenders: number; generator: ShadowGenerator };
  gpu: Map<string, Timing>;
  /** Lit lenses this frame. */
  lit: number;
  lenses: number;
  caps: number;
}
interface Stage { width: number; height: number; dpr: number }
interface LayerState {
  id: string;
  slot: number;
  pass?: Pass;
  structure?: string;
  /** The build in flight: its structure and a token that tells a superseded build to dispose its scene. */
  building?: { structure: string; token: object };
  /** A failed build; `post`: the chain's target, mask or composite could not be built (the `post` step-down). */
  failed?: { structure: string; reason: string; post?: boolean; size: string };
  status: Status;
  stepped: number[];
  steppedDown: SteppedDown[];
  warnings: string[];
  parts: number;
  drawnParts: number;
  kinds: number;
  objects: number;
  frontiers: Map<string, ContainmentFrontier>;
  exact: Map<string, Containment>;
  gpu: Timing;
  /** The part kinds of the current layout. */
  layout?: string;
  kindMap?: Map<string, PartKind>;
  /** The scene and placement the step-downs were last decided for. */
  checked?: { scene: InstrumentScene; placementKey: string; structure: string };
  /** The scene as of the last frame, for the custom parts' diagnostics. */
  scene?: InstrumentScene;
}

export interface InstrumentControllerOptions {
  engine: EngineContext;
  queue: GPUQueue;
  /** Resolves on device loss; superseded scenes are then released without a fence. */
  lost: Promise<unknown>;
  stage(): Stage;
  /** The layer's current capture texture, bound to captured caps before their scene registers. */
  texture(id: string): DynamicTexture2D | undefined;
  /** Core's frame entry point: a finished build asks for a frame. */
  requestDraw(): void;
  /** The successor preparation in flight, if any; a build waits for it (the compile policy). */
  preparation(): Promise<void> | undefined;
  /**
   * @internal Tests only: `beforeBuild` may delay (or never resolve) a layer's build, to prove the build deadline;
   * `failStage` makes a stage's creation throw (a post stage, or `composite` for the chain itself), to prove the `post`
   * diagnostics.
   */
  testHook?: InstrumentTestHook;
  /** Whether Lite's task timings must stay on when the last instrument layer leaves (the renderer's face pools use them). */
  keepTiming?(): boolean;
  onMeasure?(sample: { kind: "instrumentGpuMs"; at: number; durationMs: number; phase: "content"; layerId: string }): void;
}

/** sRGB `#rrggbb` to linear. */
const linear = (hex: string): [number, number, number] => [1, 3, 5].map(index => {
  const c = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}) as [number, number, number];
const percentile = (values: readonly number[], q: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
};

/**
 * Creates the instrument controller of one engine. It never throws from `frame`: a layer it cannot draw as parts is
 * stepped down to its Relief primitives, with the reason in `state()`.
 */
export function createInstrumentController(options: InstrumentControllerOptions) {
  const { engine, queue } = options;
  const layers = new Map<string, LayerState>();
  // Custom parts' files (core work item 5): loaded outside any frame; a finished load asks for a frame.
  const assets = createAssetStore({ onChange: () => options.requestDraw() });
  // Every scene the controller has registered and not yet retired: the order guard keeps only these and core's own.
  const scenes = new Set<RenderingContext>();
  const retirements = new Set<Promise<void>>();
  let slots = 0;
  let disposed = false;
  let orderUnavailable: string | undefined;
  // The compile policy: builds run one at a time; `gate` is the build in flight, from its start (after any successor
  // preparation) to the GPU queue having caught up with its registration.
  let chain: Promise<void> = Promise.resolve();
  let gate: Promise<void> | undefined;
  const compile = { builds: 0, failures: 0, deferredDeadlines: 0, deferredMs: 0, lastBuildMs: null as number | null, lastWarmupMs: null as number | null,
    waitedForPreparationMs: 0, timeouts: 0, warmupTimeouts: 0 };
  let timing: { status: string; supported: boolean; frameIndex: number; enabled: boolean } = { status: "disabled", supported: isGpuTimingSupported(engine), frameIndex: 0, enabled: false };
  let grain: DynamicTexture2D | undefined;
  const studios = new Map<string, Uint8Array>();
  let asyncPipelines = false;
  // The post chain's targets, shared by every instrument layer (decision 1 of item 3), allocated on first use.
  const targets = new Map<TargetName, RenderTargetTextureResult>();
  // A resize or a DPR change replaces the targets' textures when the first scene re-records; each composite then binds
  // the new ones (an effect keeps the views it was given until its textures are set again).
  const rebinds = new Set<() => void>();
  // Shadow map textures released with their scenes, and any that could not be (N3 of the review).
  const mapTextures = { destroyed: 0, missing: 0 };
  // Builds running (from the build's start to its end, a retry and a timed-out build included): the shared targets are
  // never released under one, since its scene may hold their handles or allocate them again.
  let inFlight = 0;
  function target(name: TargetName): RenderTargetTextureResult {
    let result = targets.get(name);
    if (!result) {
      result = createSurfaceRenderTargetTexture(engine, { lbl: `underglass-instrument:${name}`, ...TARGET_FORMATS[name], samples: 1, size: engine },
        name === "mesh" ? withSampledDepthTexture : undefined);
      targets.set(name, result);
      onRenderTargetTextureResize(result, () => { for (const rebind of rebinds) rebind(); });
    }
    return result;
  }

  /** The hairline `grain` normal map (I0.4): grooves along u, one random depth per row with a slow drift, at strength 0.5. */
  function grainTexture(): DynamicTexture2D {
    if (grain) return grain;
    const size = 256, canvas = new OffscreenCanvas(size, size), context = canvas.getContext("2d")!, image = context.createImageData(size, size);
    let state = 7;
    const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rows = Array.from({ length: size }, () => random() * 2 - 1);
    const groove = rows.map((_, row) => (rows[(row + size - 1) % size]! + 2 * rows[row]! + rows[(row + 1) % size]!) / 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const tilt = 0.5 * (groove[y]! + 0.25 * Math.sin((x / size) * Math.PI * 6 + y * 0.37));
      const length = Math.hypot(tilt, 1), offset = (y * size + x) * 4;
      image.data[offset] = 128; image.data[offset + 1] = Math.round((tilt / length) * 127 + 128);
      image.data[offset + 2] = Math.round((1 / length) * 127 + 128); image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    grain = createDynamicTexture(engine, size, size, { addressModeU: "repeat", addressModeV: "repeat", mipMaps: true });
    updateDynamicTexture(engine, grain, canvas, { invertY: false });
    return grain;
  }

  /** The studio as a Radiance image, generated once per light height and tokens (I0.4's generator). */
  function studioImage(ly: number, tokens: StudioTokens): Uint8Array {
    const key = JSON.stringify([ly, tokens]);
    let image = studios.get(key);
    if (!image) { if (studios.size >= 4) studios.clear(); image = studioHdr(ly, tokens); studios.set(key, image); }
    return image;
  }

  /**
   * Builds a layer's scene; resolves once it is registered (pipelines prepared) or rejects. `minimal` (the reason) builds
   * the chain without its optional stages, after a registration with them failed (decision 13 of item 3).
   */
  async function build(state: LayerState, scene: InstrumentScene, structure: string, minimal?: string): Promise<Pass> {
    const label = `instrument:${state.id}`;
    const sceneContext = createSceneContext(engine, { defaultRenderTask: false });
    let registered = false;
    try {
      sceneContext.name = label;
      const camera = createFreeCamera(vec3(0, 0, -scene.camera.distance), vec3(0, 0, 0));
      sceneContext.camera = camera;
      // Lite's light direction is the way light travels, in world axes; the scene's light points towards the light.
      const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
      const towards: [number, number, number] = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
      const key = createDirectionalLight([-towards[0], -towards[1], -towards[2]], scene.light.intensity ?? 1.6);
      // The PCF map (decision 9 of item 3): built with the light, before any part (a receiver built without a generator
      // keeps that state, I0.5). The light stands on the stage centre's ray towards itself, its depth window centred on
      // the stage; Lite's bias is a share of the window.
      const map = mapSettings(scene);
      let mapState: PassPost["map"];
      if (map) {
        const window = mapWindow(options.stage()), distance = window + 1024;
        key.position.set(towards[0] * distance, towards[1] * distance, towards[2] * distance);
        const generator = createPcfDirectionalShadowGenerator(engine, key, { mapSize: map.size, bias: liteMapBias(map.bias, window), darkness: map.darkness,
          orthoMinZ: distance - window, orthoMaxZ: distance + window });
        key.shadowGenerator = generator;
        mapState = { ...map, biasPx: map.bias, bias: liteMapBias(map.bias, window), window, casters: 0, renders: 0, timedRenders: 0, generator };
        // Lite 1.33 has no public disposal for a generator's map: its depth texture (64 MB at 4,096²) is released with the
        // scene through the internal field. If a Lite version renames it, that is counted and reported once, not leaked silently.
        onSceneDispose(sceneContext, () => {
          const texture = (generator as { _depthTexture?: GPUTexture })._depthTexture;
          if (texture && typeof texture.destroy === "function") { texture.destroy(); mapTextures.destroyed++; return; }
          mapTextures.missing++;
          if (mapTextures.missing === 1) console.warn("Underglass instrument: a shadow map's texture could not be released (Babylon Lite's generator has no _depthTexture); it is left to garbage collection");
        });
      }
      addToScene(sceneContext, key);
      // 2D.5: the fill is diffuse only and 0 unless the scene sets it; the studio is the fill.
      if ((scene.light.ambient ?? 0) > 0) {
        const fill = createHemisphericLight([0, 0, -1], scene.light.ambient);
        fill.specularColor = [0, 0, 0];
        addToScene(sceneContext, fill);
      }
      // The studio, rotated about the screen's vertical so its softbox lies at the key light (I0.4: 0.40° measured).
      const tokens = { ...STUDIO_DEFAULTS, ...scene.environment.studio };
      const url = URL.createObjectURL(new Blob([studioImage(towards[1], tokens) as BlobPart], { type: "image/vnd.radiance" }));
      try { await loadHdrEnvironment(sceneContext, url, { faceSize: 256, skipSkybox: true, skipGround: true }); }
      finally { URL.revokeObjectURL(url); }
      // The output transform, explicitly (decision 15 of item 3): the loader sets exactly these as a side effect (L2).
      Object.assign(sceneContext.imageProcessing, { exposure: INSTRUMENT_EXPOSURE, contrast: INSTRUMENT_CONTRAST, toneMappingEnabled: false });
      setEnvironmentRotation(sceneContext, Math.atan2(towards[0], -towards[2]));
      const pass = createPass(state, sceneContext, camera, scene, structure, key, mapState, minimal);
      if (!asyncPipelines) { enableAsyncShaderPipelineCompilation(engine); asyncPipelines = true; }
      if (options.testHook?.failBuild?.(state.id, !!minimal)) throw new Error(`the test hook fails the build${minimal ? " of the minimal chain" : ""}`);
      // Every task of the chain is in the frame graph now, so registration prepares their pipelines inside this build.
      try {
        if (options.testHook?.failRegistration?.(state.id, !!minimal)) throw new Error(`the test hook fails the registration${minimal ? " of the minimal chain" : ""}`);
        await (mapState ? registerSceneWithShadowSupport : registerScene)(sceneContext);
      } catch (error) { throw new RegistrationError(String(error)); }
      registered = true;
      scenes.add(sceneContext);
      pass.registered = true;
      return pass;
    } catch (error) {
      if (registered) unregisterScene(sceneContext);
      // Nothing was submitted with this scene, so its resources are idle.
      try { disposeScene(sceneContext); } catch (disposal) { console.error("Underglass instrument scene disposal failed", disposal); }
      throw error;
    }
  }

  /**
   * Creates the tasks, materials, kinds, casters, caps, lenses and the post chain of one scene, in task order;
   * `update` writes them every frame. `minimal` leaves the optional stages out (reported failed with that reason).
   */
  function createPass(state: LayerState, sceneContext: SceneContext, camera: FreeCamera, scene: InstrumentScene, structure: string, key: DirectionalLight,
    mapState: PassPost["map"], minimal?: string): Pass {
    const label = `instrument:${state.id}`;
    const hook = options.testHook?.failStage;
    const flags = postFlags(scene);
    const stages = Object.fromEntries(POST_STAGES.map(name => [name, { status: flags[name] ? "on" : "off" }])) as Record<PostStage, StageStatus>;
    const post: PassPost = { stages, map: mapState, gpu: new Map(), lit: 0, lenses: 0, caps: 0 };
    // The chain's mandatory pieces (the target, the mask, the composite): without them the parts cannot be drawn safely,
    // so a failure steps the layer down with `post`.
    const mandatory = <T>(what: string, make: () => T): T => {
      try {
        if (hook?.(state.id, "composite")) throw new Error("the test hook fails the chain");
        return make();
      } catch (error) { throw new PostBuildError(`Instrument post chain ${what} could not be built: ${String(error)}`); }
    };
    const mesh = mandatory("target", () => target("mesh")), maskTarget = mandatory("mask", () => target("mask"));
    const faceTask = createRenderTask({ name: `${label}:face`, rt: engine.scRT, clr: false, autoMirror: false }, engine, sceneContext);
    const maskTask = createRenderTask({ name: `${label}:mask`, rt: maskTarget.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, sceneContext);
    const partsTask = createRenderTask({ name: `${label}:parts`, rt: mesh.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, sceneContext);
    addTask(sceneContext, faceTask);
    addTask(sceneContext, maskTask);
    addTask(sceneContext, partsTask);
    const add = (task: RenderTask, mesh: Mesh) => { addToScene(sceneContext, mesh); addMeshToTask(task, mesh); };
    const storage: StorageBuffer[] = [];
    onSceneDispose(sceneContext, () => { for (const buffer of storage.splice(0)) disposeStorageBuffer(buffer); });
    const kinds = partKinds(scene);
    const capacityOf = (count: number) => Math.min(INSTRUMENT_PARTS_PER_LAYER, Math.max(256, 2 ** Math.ceil(Math.log2(Math.max(1, count) * 2))));
    // Uniforms every shader material shares: canvas → layer px (the inverse similarity) and the frame.
    const materials: ShaderMaterial[] = [];

    // PBR materials from the recipes (decision 4 of the note), one per material name the kinds use.
    const pbr = new Map<string, PbrMaterialProps>();
    const pbrOf = (name: string) => {
      let material = pbr.get(name);
      if (!material) { material = recipeMaterial(scene.materials[name]!, scene, name); pbr.set(name, material); }
      return material;
    };

    // Lenses (parts flagged `emitter`) are drawn again into the emitter target as flat glow copies, and the captured
    // caps into the caps target after the chain. Both tasks are created now (their meshes are added with the kinds) and
    // put in the frame graph in their place below.
    const lensKinds = kinds.filter(kind => !kind.captured && kind.instances.some(({ object, part }) => scene.objects[object]!.parts[part]!.emitter !== undefined));
    let emitterTask: RenderTask | undefined, bloomTask: Task | undefined;
    if (flags.bloom && !lensKinds.length) stages.bloom = { status: "idle" };
    if (flags.bloom && lensKinds.length) {
      if (minimal) stages.bloom = { status: "failed", error: minimal };
      else {
        try {
          if (hook?.(state.id, "bloom")) throw new Error("the test hook fails bloom");
          const emitters = target("emitters"), glow = target("glow");
          emitterTask = createRenderTask({ name: `${label}:emitters`, rt: emitters.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, sceneContext);
          bloomTask = createBloomPostProcessTask({ name: `${label}:bloom`, sourceTexture: emitters.rt, targetTexture: glow.rt, ...POST_SETTINGS.bloom }, engine, sceneContext);
        } catch (error) { emitterTask = undefined; stages.bloom = { status: "failed", error: String(error) }; console.error(`Underglass instrument layer ${state.id}: bloom left out: ${String(error)}`); }
      }
    }
    const capsTarget = kinds.some(kind => kind.captured) ? mandatory("caps target", () => target("caps")) : undefined;
    // The caps test their depth against the parts' (the mesh target's depth, loaded): a part in front of a cap hides it.
    const capsTask = capsTarget ? createRenderTask({ name: `${label}:caps`, rt: capsTarget.rt, depth: mesh.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, sceneContext) : undefined;

    // Parts: one thin-instanced mesh per kind. Captured kinds take the cap shader instead of PBR.
    const caps: { material: ShaderMaterial; buffer: StorageBuffer; data: Float32Array; dirty: boolean }[] = [];
    const casters: Mesh[] = [];
    const meshes = kinds.map((kind, index) => {
      const geometry = profileGeometry(scene.profiles[kind.profile]!);
      const mesh = createMeshFromData(engine, `${label}:kind${index}`, geometry.positions, geometry.normals, geometry.indices, geometry.uvs);
      const capacity = capacityOf(kind.instances.length), matrices = new Float32Array(capacity * 16);
      setThinInstances(mesh, matrices, capacity);
      setThinInstanceCount(mesh, kind.instances.length);
      let cap: (typeof caps)[number] | undefined;
      let lens: { mesh: Mesh; buffer: StorageBuffer; data: Float32Array; dirty: boolean } | undefined;
      // The world box of each instance (NaN when hidden): their union is the kind's bounds for the map's fit.
      const boxes = new Float64Array(capacity * 6).fill(Number.NaN);
      const local = profileBounds(scene.profiles[kind.profile]!);
      const boundMin: [number, number, number] = [0, 0, 0], boundMax: [number, number, number] = [0, 0, 0];
      if (kind.captured) {
        const data = new Float32Array(capacity * 4);
        const buffer = createStorageBuffer(engine, data, `${label}:caps${index}`);
        storage.push(buffer);
        const material = createShaderMaterial({ name: `${label}:caps${index}`, vertexSource: slotVertex, fragmentSource: capFragment, attributes: ["position"],
          uniforms: ["world", "view", "projection", ...frameUniforms], samplers: ["capture"], storageBuffers: [{ name: "caps", type: "array<vec4<f32>>" }],
          needAlphaBlending: true, blend: straightAlpha, depthWrite: true, backFaceCulling: false });
        enableShaderMaterialInstanceWorld(material);
        setShaderStorageBuffer(material, "caps", buffer);
        materials.push(material);
        cap = { material, buffer, data, dirty: true };
        caps.push(cap);
        // Lite builds the material's bind group at registration, so the capture is bound now and rebound per frame.
        const texture = options.texture(state.id);
        if (!texture) throw new Error(`Layer ${state.id} has no capture to bind to its captured caps`);
        setShaderTexture(material, "capture", texture as never);
        mesh.material = material as unknown as Material;
        add(capsTask!, mesh);
      } else {
        mesh.material = pbrOf(kind.material) as unknown as Material;
        // Every PBR part casts into the map and receives from it (2D.7); its bounds are published below.
        mesh.receiveShadows = !!mapState;
        mesh.boundMin = boundMin;
        mesh.boundMax = boundMax;
        casters.push(mesh);
        // Lite culls thin instances on the GPU; caps and glow copies index their storage by instance, so they are not culled.
        enableThinInstanceGpuCulling(mesh);
        add(partsTask, mesh);
        if (emitterTask && lensKinds.includes(kind)) {
          const glow = createMeshFromData(engine, `${label}:kind${index}:glow`, geometry.positions, geometry.normals, geometry.indices, geometry.uvs);
          setThinInstances(glow, matrices, capacity);
          setThinInstanceCount(glow, kind.instances.length);
          const data = new Float32Array(capacity * 4);
          const buffer = createStorageBuffer(engine, data, `${label}:glow${index}`);
          storage.push(buffer);
          const material = createShaderMaterial({ name: `${label}:glow${index}`, vertexSource: slotVertex, fragmentSource: glowFragment, attributes: ["position"],
            uniforms: ["world", "view", "projection", ...frameUniforms], storageBuffers: [{ name: "glows", type: "array<vec4<f32>>" }],
            needAlphaBlending: false, depthWrite: false, backFaceCulling: false });
          enableShaderMaterialInstanceWorld(material);
          setShaderStorageBuffer(material, "glows", buffer);
          materials.push(material);
          glow.material = material as unknown as Material;
          add(emitterTask, glow);
          lens = { mesh: glow, buffer, data, dirty: true };
        }
      }
      return { kind, mesh, matrices, capacity, cap, lens, boxes, local, boundMin, boundMax, count: kind.instances.length, shapeKey: shapeKeyOf(scene.profiles[kind.profile]!) };
    });
    if (mapState) {
      setShadowTaskCasterMeshes(mapState.generator, casters);
      mapState.casters = casters.length;
    }
    post.lenses = lensKinds.length;
    post.caps = caps.length;

    // Face shadows (I0.5 (a)): one quad per object, up to 8 casters each from a storage buffer, darkest wins.
    // Every object the format allows: adding objects updates in place, without a rebuild.
    const objectCapacity = INSTRUMENT_OBJECTS;
    const square = (name: string) => createMeshFromData(engine, name, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]),
      new Uint32Array([0, 1, 2, 0, 2, 3]), new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]));
    const quad = square(`${label}:shadows`);
    const quads = new Float32Array(objectCapacity * 16);
    setThinInstances(quad, quads, objectCapacity);
    const casterData = new Float32Array(objectCapacity * INSTRUMENT_CASTERS_PER_OBJECT * 8);
    const casterBuffer = createStorageBuffer(engine, casterData, `${label}:casters`);
    storage.push(casterBuffer);
    // The guard (item 2): the protected rects and, per rect, the scale that keeps the face shadows inside it within
    // the rect's shadow cap together.
    // Layout: (rects, feather, protected box, 0), (extent), then per rect (rect, (scale, ·)), then a scale per extent cell.
    const guardData = new Float32Array((2 + 2 * PROTECTED_PER_LAYER + GUARD_CELLS.x * GUARD_CELLS.y) * 4);
    const guardBuffer = createStorageBuffer(engine, guardData, `${label}:guard`);
    storage.push(guardBuffer);
    const shade = createShaderMaterial({ name: `${label}:shadows`, vertexSource: slotVertex, fragmentSource: shadowFragment, attributes: ["position"],
      uniforms: ["world", "view", "projection", ...frameUniforms, { name: "light", type: "vec4<f32>", defaultValue: [0, 0, 1, 0] }],
      storageBuffers: [{ name: "shapes", type: "array<vec4<f32>>" }, { name: "guard", type: "array<vec4<f32>>" }], needAlphaBlending: true, blend: darken, depthWrite: false, backFaceCulling: false });
    enableShaderMaterialInstanceWorld(shade);
    setShaderStorageBuffer(shade, "shapes", casterBuffer);
    setShaderStorageBuffer(shade, "guard", guardBuffer);
    // Each object's face-shadow reach (layer px: left, top, right, bottom), for the guard's count of shadows per rect.
    const reaches = new Float64Array(objectCapacity * 4);
    let guardFor: Guard | undefined, guardFeather = -1, guardStrength = -1;
    materials.push(shade);
    quad.material = shade as unknown as Material;
    add(faceTask, quad);

    // The clip mask (decision 4 of item 3): per drawn object a quad over its bounds whose fragment keeps the pixels whose
    // centre lies inside the rounded box and the layer's clip. It replaces item 1's depth clip mask.
    const plates = square(`${label}:mask`);
    const plateMatrices = new Float32Array(objectCapacity * 16);
    setThinInstances(plates, plateMatrices, objectCapacity);
    const boxData = new Float32Array(objectCapacity * 8);
    const boxBuffer = createStorageBuffer(engine, boxData, `${label}:boxes`);
    storage.push(boxBuffer);
    const maskMaterial = mandatory("mask", () => createShaderMaterial({ name: `${label}:mask`, vertexSource: slotVertex, fragmentSource: maskFragment, attributes: ["position"],
      uniforms: ["world", "view", "projection", ...frameUniforms], storageBuffers: [{ name: "boxes", type: "array<vec4<f32>>" }],
      needAlphaBlending: false, depthWrite: false, backFaceCulling: false }));
    enableShaderMaterialInstanceWorld(maskMaterial);
    setShaderStorageBuffer(maskMaterial, "boxes", boxBuffer);
    materials.push(maskMaterial);
    plates.material = maskMaterial as unknown as Material;
    add(maskTask, plates);

    // The optional stages on the mesh target, in order (TAA first: it jitters the parts task; SMAA last), each into the
    // next ping-pong target. A stage that throws is left out and reported (decision 13 of item 3).
    let source = mesh, flip = false;
    const direction = key.direction, length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const travel = { x: direction.x / length, y: direction.y / length, z: direction.z / length };
    const stage = (name: Exclude<PostStage, "bloom">, make: (input: RenderTargetTextureResult, output: RenderTargetTextureResult) => Task) => {
      if (!flags[name]) return;
      if (minimal) { stages[name] = { status: "failed", error: minimal }; return; }
      try {
        if (hook?.(state.id, name)) throw new Error(`the test hook fails ${name}`);
        const output = target(flip ? "pong" : "ping");
        addTask(sceneContext, make(source, output));
        source = output;
        flip = !flip;
      } catch (error) { stages[name] = { status: "failed", error: String(error) }; console.error(`Underglass instrument layer ${state.id}: ${name} left out: ${String(error)}`); }
    };
    stage("taa", (input, output) => createTaaPostProcessTask({ name: `${label}:taa`, sourceTexture: input.rt, sourceRenderTask: partsTask, targetTexture: output.rt, ...POST_SETTINGS.taa }, engine, sceneContext));
    stage("contact", (input, output) => createScreenSpaceContactShadowsPostProcessTask({ name: `${label}:contact`, sourceTexture: input.rt, depthTexture: mesh.rt, camera,
      lightDirection: travel, targetTexture: output.rt, composition: "multiply", ...POST_SETTINGS.contact }, engine, sceneContext));
    stage("ssgi", (input, output) => createScreenSpaceGlobalIlluminationPostProcessTask({ name: `${label}:ssgi`, sourceTexture: input.rt, depthTexture: mesh.rt, camera,
      targetTexture: output.rt, composition: "additive", ...POST_SETTINGS.ssgi }, engine, sceneContext));
    stage("smaa", (input, output) => createSmaaPostProcessTask({ name: `${label}:smaa`, sourceTexture: input.rt, targetTexture: output.rt, ...POST_SETTINGS.smaa }, engine, sceneContext));
    if (emitterTask && bloomTask) { addTask(sceneContext, emitterTask); addTask(sceneContext, bloomTask); }
    if (capsTask) addTask(sceneContext, capsTask);

    // The composite (decisions 3, 5 and 6 of item 3): over the layer's rectangle, premultiplied. Unused inputs read the
    // mask, gated off by the flags.
    const composite = mandatory("composite", () => createEffectWrapper(engine, { name: `${label}:composite`, vertexWGSL: compositeWGSL.vertex, fragmentWGSL: compositeWGSL.fragment,
      blend: premultiplied, bindings: [{ binding: 0, kind: "uniform", uniformByteLength: COMPOSITE_VEC4S * 16, visibility: 3 }, { binding: 1, kind: "texture", name: "parts" },
        { binding: 2, kind: "texture", name: "mask" }, { binding: 3, kind: "texture", name: "caps" }, { binding: 4, kind: "texture", name: "glow" },
        { binding: 5, kind: "texture", name: "emitters" }] }));
    onSceneDispose(sceneContext, () => disposeEffectWrapper(composite));
    const bind = () => {
      setEffectTexture(composite, "parts", source.texture);
      setEffectTexture(composite, "mask", maskTarget.texture);
      setEffectTexture(composite, "caps", (capsTarget ?? maskTarget).texture);
      setEffectTexture(composite, "glow", (emitterTask ? target("glow") : maskTarget).texture);
      setEffectTexture(composite, "emitters", (emitterTask ? target("emitters") : maskTarget).texture);
    };
    rebinds.add(bind);
    onSceneDispose(sceneContext, () => { rebinds.delete(bind); });
    mandatory("composite", () => {
      bind();
      addTask(sceneContext, createEffectRenderTask({ name: `${label}:composite`, effect: composite, target: engine.scRT, clear: false }, engine, sceneContext));
    });
    const compositeData = new Float32Array(COMPOSITE_VEC4S * 4);
    let compositeKey = "";

    // Emitters on the parts: one clustered container of 64 point lights, created after every mesh is in the scene (Lite
    // wires the PBR materials present when the container is added, and bakes its capacity then). Unused lights stay at
    // intensity 0, which Lite skips; the drawn emitters are written into them every frame.
    let lights: ClusteredLightContainer | undefined;
    if (scene.emitters !== undefined) {
      lights = createClusteredLightContainer();
      for (let slot = 0; slot < EMITTERS_PER_LAYER; slot++) createClusteredPointLight(lights, { position: [0, 0, 1e6], diffuse: [0, 0, 0], range: 1, intensity: 0 });
      addClusteredLightContainer(sceneContext, lights);
    }

    let lastStage = "", lastWorld = "", lastHidden = "";
    let boundTexture: DynamicTexture2D | undefined = options.texture(state.id);
    const lastT = new Float64Array(objectCapacity).fill(Number.NaN);
    // Bounds are cached per geometry (`profileBounds`), so a mesh reference's follow its file when it arrives.
    const boundsOf = (name: string, current: InstrumentScene) => profileBounds(current.profiles[name]!);

    const pass: Pass = {
      scene: sceneContext, camera, structure, registered: false, lights, litLights: 0, prefix: `${label}:`, post,
      capacityOk: (next, objects) => [...next.values()].every(kind => kind.key === "glass" || meshes.some(entry => entry.kind.key === kind.key && kind.instances.length <= entry.capacity))
        && objects <= objectCapacity,
      update(input, current, hidden, stage, kinds, changed, guard) {
        // The camera: `D` from the scene, its field of view mapping the face plane one CSS px to one CSS px.
        const stageKey = `${stage.width},${stage.height},${current.camera.distance}`;
        if (stageKey !== lastStage) {
          const D = current.camera.distance;
          camera.position.set(0, 0, -D);
          // Near enough for any part up to 0.95 D tall (taller ones cannot stay in their box); reverse-Z keeps the precision.
          camera.nearPlane = D / 20; camera.farPlane = D * 2;
          camera.fov = 2 * Math.atan(stage.height / 2 / D);
          lastStage = stageKey;
        }
        const m = similarity(input.matrix)!;
        // Canvas (x right, y down, z up) to Lite's world (y up, +z away), times the layer's similarity (z scaled alike).
        const world = new Float64Array([m.a, -m.b, 0, 0, m.c, -m.d, 0, 0, 0, 0, -m.scale, 0, m.e - stage.width / 2, stage.height / 2 - m.f, 0, 1]);
        const det = m.a * m.d - m.b * m.c;
        // Inverse similarity rows (canvas → layer px), the frame (dpr, opacity) and the clip, shared by the shader materials.
        const inverse = [m.d / det, -m.c / det, (m.c * m.f - m.d * m.e) / det, 0, -m.b / det, m.a / det, (m.b * m.e - m.a * m.f) / det, 0];
        const content = input.content;
        const grid = [content.pixelWidth / Math.max(1, content.width), content.pixelHeight / Math.max(1, content.height)];
        for (const material of materials) {
          setShaderUniform(material, "inverseX", inverse.slice(0, 4));
          setShaderUniform(material, "inverseY", inverse.slice(4, 8));
          setShaderUniform(material, "frame", [stage.dpr, input.opacity, grid[0]!, grid[1]!]);
          setShaderUniform(material, "clip", [input.clip.x, input.clip.y, input.clip.width, input.clip.height]);
          setShaderUniform(material, "captured", [content.pixelWidth, content.pixelHeight, current.interior.max, 0]);
        }
        if (boundTexture !== input.texture) {
          for (const cap of caps) setShaderTexture(cap.material, "capture", input.texture as never);
          boundTexture = input.texture;
        }
        const L = lightVector(current);
        setShaderUniform(shade, "light", [L[0] / L[2], L[1] / L[2], current.shadow.strength, 0]);
        // Lite records opaque draws in a bundle: visibility goes through `setMeshVisible`, which re-records it. The parts
        // always draw into the target; the composite applies the opacity (decision 6 of item 3).
        setMeshVisible(quad, input.opacity > 0);
        // What moved since the last frame: everything when the geometry, the step-downs or the layer's placement did,
        // otherwise the objects whose `t` changed (poses), so a frame of poses rewrites only what it poses.
        const worldKey = `${m.a},${m.b},${m.c},${m.d},${m.e},${m.f},${stage.width},${stage.height}`;
        const hiddenKey = [...hidden].join(",");
        const all = changed || worldKey !== lastWorld || hiddenKey !== lastHidden;
        lastWorld = worldKey; lastHidden = hiddenKey;
        const moved = new Uint8Array(current.objects.length);
        current.objects.forEach((object, index) => {
          const t = object.t ?? 0;
          if (all || lastT[index] !== t) { moved[index] = 1; lastT[index] = t; }
        });
        // Instances: every part of every object not stepped down, placed at its `t`.
        let drawn = 0, castersMoved = false, lit = 0;
        for (const entry of meshes) {
          entry.kind = kinds.get(entry.kind.key) ?? { ...entry.kind, instances: [] };
          const count = entry.kind.instances.length;
          // A custom part's file arrives after the scene was built: its mesh takes the real triangles in place
          // (`resizeMeshGeometry` keeps the mesh, its material and its place in the shadow map), and its instances are
          // written from that frame on. Until then (and if it fails) the kind is empty: no instance is written.
          const shape = current.profiles[entry.kind.profile]!, shapeKey = shapeKeyOf(shape);
          const rewrite = all || shapeKey !== entry.shapeKey;
          const live = meshReady(shape);
          if (shapeKey !== entry.shapeKey) {
            const geometry = profileGeometry(shape);
            for (const target of [entry.mesh, entry.lens?.mesh]) {
              if (!target) continue;
              resizeMeshGeometry(engine, target, geometry.positions, geometry.normals, geometry.indices, geometry.uvs);
            }
            entry.mesh.boundMin = entry.boundMin; entry.mesh.boundMax = entry.boundMax;
            entry.local = profileBounds(shape);
            entry.shapeKey = shapeKey;
          }
          let dirty = rewrite || count !== entry.count;
          entry.kind.instances.forEach(({ object, part }, index) => {
            if (!hidden.has(object) && live) drawn++;
            if (entry.cap) {
              const factor = hidden.has(object) ? 0 : capFactor(current, current.objects[object]!.parts[part]!);
              if (entry.cap.data[index * 4] !== Math.fround(factor)) { entry.cap.data[index * 4] = factor; entry.cap.dirty = true; }
            }
            if (entry.lens) {
              // The glow of a lit lens (decision 8 of item 3): its emitter's state is live (`setEmitters`), so it is read every frame.
              const glow = hidden.has(object) || input.opacity <= 0 ? undefined : partGlow(current, current.objects[object]!.parts[part]!);
              const value = glow?.lit ? [glow.colour[0], glow.colour[1], glow.colour[2], 1] : [0, 0, 0, 0];
              if (glow?.lit) lit++;
              for (let channel = 0; channel < 4; channel++) {
                if (entry.lens.data[index * 4 + channel] !== Math.fround(value[channel]!)) { entry.lens.data[index * 4 + channel] = value[channel]!; entry.lens.dirty = true; }
              }
            }
            if (!rewrite && !moved[object]) return;
            dirty = true;
            const target = entry.matrices.subarray(index * 16, index * 16 + 16);
            if (hidden.has(object) || !live) { target.fill(0); entry.boxes.fill(Number.NaN, index * 6, index * 6 + 6); return; }
            const entryObject = current.objects[object]!, placement = multiply(world, partMatrix(entryObject.parts[part]!, entryObject.t ?? 0));
            for (let k = 0; k < 16; k++) target[k] = placement[k]!;
            if (!entry.cap) placedBox(placement, entry.local.low, entry.local.high, entry.boxes.subarray(index * 6, index * 6 + 6));
          });
          if (count !== entry.count) {
            setThinInstanceCount(entry.mesh, count);
            if (entry.lens) setThinInstanceCount(entry.lens.mesh, count);
            entry.boxes.fill(Number.NaN, count * 6);
            entry.count = count;
          }
          if (dirty) {
            flushThinInstances(entry.mesh);
            if (entry.lens) flushThinInstances(entry.lens.mesh);
            if (!entry.cap) {
              // The kind's bounds: the union of its placed instances, written in place (Lite fits the map to them).
              const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
              for (let index = 0; index < count; index++) {
                if (Number.isNaN(entry.boxes[index * 6]!)) continue;
                for (let axis = 0; axis < 3; axis++) { low[axis] = Math.min(low[axis]!, entry.boxes[index * 6 + axis]!); high[axis] = Math.max(high[axis]!, entry.boxes[index * 6 + 3 + axis]!); }
              }
              for (let axis = 0; axis < 3; axis++) {
                entry.boundMin[axis] = Number.isFinite(low[axis]!) ? low[axis]! : 0;
                entry.boundMax[axis] = Number.isFinite(high[axis]!) ? high[axis]! : 0;
              }
              castersMoved = true;
            }
          }
          if (entry.cap?.dirty) { updateStorageBuffer(engine, entry.cap.buffer, entry.cap.data); entry.cap.dirty = false; }
          if (entry.lens?.dirty) { updateStorageBuffer(engine, entry.lens.buffer, entry.lens.data); entry.lens.dirty = false; }
        }
        // A kind with no placed instance takes the others' box, so it never stretches the map's fit to the origin.
        if (castersMoved) {
          const placed = meshes.filter(entry => !entry.cap && entry.kind.instances.some((_, index) => !Number.isNaN(entry.boxes[index * 6]!)));
          for (const entry of meshes) {
            if (entry.cap || placed.includes(entry) || !placed.length) continue;
            for (let axis = 0; axis < 3; axis++) { entry.boundMin[axis] = placed[0]!.boundMin[axis]!; entry.boundMax[axis] = placed[0]!.boundMax[axis]!; }
          }
          // Lite re-renders the map in a frame its casters' instances changed (and only then): counted here.
          if (post.map) post.map.renders++;
        }
        // Bloom: its tasks run only on frames with a lit lens.
        post.lit = lit;
        const blooming = !!emitterTask && lit > 0;
        if (emitterTask && bloomTask) {
          emitterTask.executionEnabled = blooming;
          bloomTask.executionEnabled = blooming;
          stages.bloom = { status: blooming ? "on" : "idle" };
        }
        // Casters: per object, the darkest of up to 8 rounded boxes, and a quad over the bounds and the shadows' reach.
        const reachPerPx = Math.hypot(L[0], L[1]) / L[2];
        let castersDirty = false;
        current.objects.forEach((object, index) => {
          if (index >= objectCapacity || !moved[index]) return;
          castersDirty = true;
          casterData.fill(0, index * INSTRUMENT_CASTERS_PER_OBJECT * 8, (index + 1) * INSTRUMENT_CASTERS_PER_OBJECT * 8);
          quads.fill(0, index * 16, index * 16 + 16);
          reaches.fill(0, index * 4, index * 4 + 4);
          if (hidden.has(index)) return;
          const limit = { box: (object.bounds ?? { rect: object.rect }).rect, light: [L[0] / L[2], L[1] / L[2]] as [number, number] };
          const casters = object.parts.flatMap(part => {
            if (!partDrawn(part, current.profiles)) return [];
            const caster = partCaster(part, current.profiles[part.profile]!, object.t ?? 0, boundsOf(part.profile, current), limit);
            return caster && caster.height > 0 ? [caster] : [];
          }).sort((a, b) => b.height - a.height).slice(0, INSTRUMENT_CASTERS_PER_OBJECT);
          if (!casters.length) return;
          let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
          casters.forEach((caster: InstrumentCaster, at) => {
            const [x, y, w, h] = caster.rect, reach = reachPerPx * caster.height + 1.5 * caster.height + 2;
            left = Math.min(left, x - reach); top = Math.min(top, y - reach); right = Math.max(right, x + w + reach); bottom = Math.max(bottom, y + h + reach);
            casterData.set([x + w / 2, y + h / 2, w / 2, h / 2, caster.radius, caster.height, 0, 0], (index * INSTRUMENT_CASTERS_PER_OBJECT + at) * 8);
          });
          const box = multiply(world, new Float64Array([(right - left) / 2, 0, 0, 0, 0, (bottom - top) / 2, 0, 0, 0, 0, 1, 0, (left + right) / 2, (top + bottom) / 2, 0, 1]));
          for (let k = 0; k < 16; k++) quads[index * 16 + k] = box[k]!;
          reaches.set([left, top, right, bottom], index * 4);
        });
        if (all) { casterData.fill(0, current.objects.length * INSTRUMENT_CASTERS_PER_OBJECT * 8); quads.fill(0, current.objects.length * 16); }
        if (castersDirty || all) { flushThinInstances(quad); updateStorageBuffer(engine, casterBuffer, casterData); }
        if (all) reaches.fill(0, current.objects.length * 4);
        // The clip mask's plates: each drawn object's bounds (they follow the layout, not the poses).
        if (all) {
          plateMatrices.fill(0);
          boxData.fill(0);
          current.objects.forEach((object, index) => {
            if (index >= objectCapacity || hidden.has(index)) return;
            const { rect: [x, y, w, h], radius = 0 } = object.bounds ?? { rect: object.rect, radius: 0 };
            boxData.set([x + w / 2, y + h / 2, w / 2, h / 2, radius, 0, 0, 0], index * 8);
            // One px wider than the box on every side, so the fragment, not the raster, decides its edge.
            const box = multiply(world, new Float64Array([w / 2 + 1, 0, 0, 0, 0, h / 2 + 1, 0, 0, 0, 0, 1, 0, x + w / 2, y + h / 2, 0, 1]));
            for (let k = 0; k < 16; k++) plateMatrices[index * 16 + k] = box[k]!;
          });
          flushThinInstances(plates);
          updateStorageBuffer(engine, boxBuffer, boxData);
        }
        // The composite's rectangle, the opacity and what it reads this frame.
        const rect = compositeRect(m, input.extent, stage) ?? [0, 0, 0, 0];
        const next = [...rect, stage.width, stage.height, stage.dpr, 0, input.opacity, blooming ? 1 : 0, capsTarget ? 1 : 0, 0];
        const nextKey = next.join(",");
        if (nextKey !== compositeKey) { compositeData.set(next); setEffectUniforms(composite, compositeData); compositeKey = nextKey; }
        // The guard: inside each protected rect (or each cell of a protected box), the objects whose shadows reach it
        // share its shadow cap (`shadowScales`, `emitters.ts`).
        const feather = current.feather ?? DEFAULT_FEATHER, strength = current.shadow.strength;
        if (guard !== guardFor || castersDirty || all || feather !== guardFeather || strength !== guardStrength) {
          guardData.fill(0);
          guardData.set([guard.rects.length, feather, guard.extent ? 1 : 0, 0, current.extent.width, current.extent.height, 0, 0], 0);
          shadowScales(guard.rects, reaches, current.objects.length, feather, strength).forEach((scale, at) => {
            const { rect } = guard.rects[at]!;
            guardData.set([rect.x0, rect.y0, rect.x1, rect.y1, scale, 0, 0, 0], (2 + 2 * at) * 4);
          });
          if (guard.cells) {
            const cells = guardCells(current.extent).map((rect, at) => ({ rect, ...guard.cells![at]! }));
            shadowScales(cells, reaches, current.objects.length, feather, strength).forEach((scale, at) => guardData.set([scale], (2 + 2 * PROTECTED_PER_LAYER + at) * 4));
          }
          updateStorageBuffer(engine, guardBuffer, guardData);
          guardFor = guard; guardFeather = feather; guardStrength = strength;
        }
        // Emitters on the parts: the drawn ones in the clustered lights, in world units (the layer's scale on range and,
        // squared, on intensity, so the falloff in layer px is the face pool's).
        if (lights) {
          const drawnLights = input.opacity > 0 ? input.lights?.drawn ?? [] : [];
          let dirty = false;
          lights.pointLights.forEach((light, slot) => {
            const emitter = drawnLights[slot]?.emitter;
            if (!emitter) { if (light.intensity !== 0) { light.intensity = 0; dirty = true; } return; }
            const [x, y, z] = emitter.position;
            const position: [number, number, number] = [m.a * x + m.c * y + m.e - stage.width / 2, stage.height / 2 - (m.b * x + m.d * y + m.f), -m.scale * z];
            const range = emitter.radius * m.scale, intensity = emitter.strength * m.scale * m.scale;
            if (light.position[0] !== position[0] || light.position[1] !== position[1] || light.position[2] !== position[2]) { light.position = position; dirty = true; }
            if (light.range !== range || light.intensity !== intensity) { light.range = range; light.intensity = intensity; dirty = true; }
            if (light.diffuse.some((value, channel) => value !== emitter.colour[channel])) { light.diffuse = [...emitter.colour]; dirty = true; }
          });
          if (dirty) markClusteredLightContainerDirty(lights);
          pass.litLights = drawnLights.length;
        }
        return drawn;
      },
    };
    return pass;
  }

  /** A Lite PBR material from a recipe (decision 4 of the note). */
  function recipeMaterial(recipe: InstrumentRecipe, scene: InstrumentScene, name: string): PbrMaterialProps {
    const base = recipe.base ?? {};
    const material = createPbrMaterial({ name, baseColorFactor: [...linear(base.colour ?? "#ffffff"), 1], metallicFactor: base.metallic ?? 0,
      roughnessFactor: base.roughness ?? 1, doubleSided: true, directIntensity: base.direct ?? 1, environmentIntensity: scene.environment.strength } as Partial<PbrMaterialProps>);
    if ((recipe.coat?.strength ?? 0) > 0) setPbrClearCoat(material, { isEnabled: true, intensity: recipe.coat!.strength, roughness: recipe.coat!.roughness, indexOfRefraction: recipe.coat!.ior });
    // `reflectance` tints the dielectric F0 only (I0.4): a metal's colour is its base colour.
    if (recipe.reflectance) setPbrMetallicReflectance(material, { color: linear(recipe.reflectance.tint ?? "#ffffff"), f0Factor: recipe.reflectance.f0 ?? 1 });
    if ((recipe.emissive?.strength ?? 0) > 0) setPbrEmissive(material, linear(recipe.emissive!.colour ?? "#ffffff").map(value => value * recipe.emissive!.strength!) as [number, number, number]);
    if ((recipe.sheen?.strength ?? 0) > 0) setPbrSheen(material, { isEnabled: true, color: linear(recipe.sheen!.colour ?? "#ffffff"), roughness: recipe.sheen!.roughness, intensity: recipe.sheen!.strength });
    if ((recipe.iridescence?.strength ?? 0) > 0) setPbrIridescence(material, { isEnabled: true, intensity: recipe.iridescence!.strength, maximumThickness: recipe.iridescence!.thickness });
    // Brushed metal: anisotropy along the UVs (u around a lathe, x across a prism's top) with the hairline grain map,
    // without which anisotropy barely reads (I0.4).
    if ((recipe.brush?.strength ?? 0) > 0) {
      setPbrAnisotropy(material, { isEnabled: true, intensity: recipe.brush!.strength, direction: recipe.brush!.direction === "radial" ? [0, 1] : [1, 0] });
    }
    if ((recipe.grain?.strength ?? 0) > 0) {
      material.normalTexture = grainTexture() as never;
      material.normalTextureScale = recipe.grain!.strength! / 0.5;
    }
    return material;
  }

  /** Steps every object of a layer down, with one reason. */
  const all = (scene: InstrumentScene, reason: SteppedDown["reason"], detail?: string): SteppedDown[] =>
    scene.objects.map(object => ({ object: object.id, reason, ...(detail ? { detail } : {}) }));

  /** Starts (or queues) a build of `scene` for `state`, one at a time, after any successor preparation. */
  function startBuild(state: LayerState, scene: InstrumentScene, structure: string) {
    const token = {};
    state.building = { structure, token };
    const run = chain.then(async () => {
      if (disposed || state.building?.token !== token) return;
      // The compile policy: wait for core's successor preparation, so its 1.5 s deadline is not spent on our pipelines.
      // The wait is bounded, so successors arriving one after another cannot starve the build.
      const waited = performance.now();
      for (let preparation = options.preparation(); preparation && performance.now() - waited < INSTRUMENT_BUILD_DEADLINE_MS; preparation = options.preparation()) {
        await Promise.race([preparation.catch(() => undefined), new Promise(resolve => setTimeout(resolve, Math.max(0, INSTRUMENT_BUILD_DEADLINE_MS - (performance.now() - waited))))]);
      }
      compile.waitedForPreparationMs += performance.now() - waited;
      if (disposed || state.building?.token !== token) return;
      // The gate: only now, while this build registers its scene and the GPU compiles its pipelines, does a new
      // successor's deadline wait (a queued build never holds one; the renderer also caps the wait).
      let release!: () => void;
      const ownGate: Promise<void> = new Promise<void>(resolve => { release = () => { if (gate === ownGate) gate = undefined; resolve(); }; });
      gate = ownGate;
      const started = performance.now();
      compile.builds++;
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let timedOut = false;
        // A test hook may delay the build; it runs inside the build deadline like the build itself.
        // A registration that fails with optional stages on is retried once with the chain's mandatory pieces only
        // (decision 13 of item 3); a failure of those is the `post` step-down.
        const optional = POST_STAGES.some(name => postFlags(scene)[name]);
        inFlight++;
        // The hook runs inside the chain, so a hook that throws ends this build like any failure (and `inFlight` with it).
        const building = Promise.resolve().then(() => options.testHook?.beforeBuild?.(state.id)).then(() => build(state, scene, structure).catch(error => {
          // With no optional stage the chain already is the minimal one: its registration failing is `post` too.
          if (error instanceof RegistrationError && !optional) throw new PostBuildError(`Instrument post chain could not be registered: ${error.message}`);
          if (!(error instanceof RegistrationError) || !optional || disposed || state.building?.token !== token) throw error;
          console.error(`Underglass instrument layer ${state.id}: its post chain failed to register; building it without its optional stages: ${error.message}`);
          // Only the mandatory chain is left: its registration failing is the `post` step-down; any other error (a mesh,
          // a shader) stays `compile`. Either way the reason names the cause.
          return build(state, scene, structure, `registration failed with the optional stages on: ${error.message}`).catch(minimal => {
            throw minimal instanceof RegistrationError ? new PostBuildError(`Instrument post chain could not be registered without its optional stages: ${minimal.message}`) : minimal;
          });
        }));
        // Once the build has ended (its scene registered and handed over or retired, or failed), a stage with no layer left
        // releases the targets.
        void building.then(() => undefined, () => undefined).finally(() => { inFlight--; scheduleRelease(); });
        try {
          const pass = await Promise.race([building, new Promise<never>((_, reject) => {
            timer = setTimeout(() => { timedOut = true; reject(new Error(`Instrument scene build timed out after ${INSTRUMENT_BUILD_DEADLINE_MS} ms`)); }, INSTRUMENT_BUILD_DEADLINE_MS);
          })]);
          clearTimeout(timer);
          compile.lastBuildMs = performance.now() - started;
          if (disposed || state.building?.token !== token) { retirePass(pass); return; }
          if (state.pass) retirePass(state.pass);
          state.pass = pass;
          state.structure = structure;
          state.building = undefined;
          state.failed = undefined;
          options.requestDraw();
          // The gate stays closed until the GPU queue has caught up with the registration (its pipelines compiled), at
          // most the build deadline; no drawn frame is needed, so a pending successor cannot hold it.
          const warming = performance.now();
          let wait: ReturnType<typeof setTimeout> | undefined;
          const caughtUp = await Promise.race([queue.onSubmittedWorkDone().then(() => true, () => true),
            new Promise<false>(resolve => { wait = setTimeout(() => resolve(false), INSTRUMENT_BUILD_DEADLINE_MS); })]);
          clearTimeout(wait);
          compile.lastWarmupMs = performance.now() - warming;
          if (!caughtUp && state.pass === pass && !disposed) {
            // The GPU did not catch up with the registration within the deadline: a GPU-side hang after the scene
            // registered. Diagnosed like a build timeout: the scene is retired and the layer drawn at Relief.
            compile.warmupTimeouts++;
            retirePass(pass);
            state.pass = undefined;
            state.structure = undefined;
            const reason = `Instrument scene warm-up timed out after ${INSTRUMENT_BUILD_DEADLINE_MS} ms: the GPU queue did not catch up with its registration`;
            state.failed = { structure, reason, size: sizeKey() };
            console.error(`Underglass instrument layer ${state.id} is drawn at the Relief level: ${reason}`);
            options.requestDraw();
          }
        } catch (error) {
          clearTimeout(timer);
          compile.failures++;
          if (timedOut) { compile.timeouts++; void building.then(retirePass, () => undefined); }
          if (state.building?.token === token) {
            state.building = undefined;
            state.failed = { structure, reason: String(error), size: sizeKey(), ...(error instanceof PostBuildError ? { post: true } : {}) };
            console.error(`Underglass instrument layer ${state.id} is drawn at the Relief level: ${String(error)}`);
            options.requestDraw();
          }
        }
      } finally { release(); }
    });
    chain = run.catch(() => undefined);
  }

  /** Takes a scene off the surface now and releases it after a queue fence (or device loss). */
  function retirePass(pass: Pass) {
    scenes.delete(pass.scene);
    if (pass.registered) { unregisterScene(pass.scene); pass.registered = false; }
    const release = () => { try { disposeScene(pass.scene); } catch (error) { console.error("Underglass instrument scene disposal failed", error); } };
    const fence = Promise.race([queue.onSubmittedWorkDone(), options.lost.then(() => undefined)]).then(release, error => {
      console.error("Underglass instrument retirement fence failed; retaining the scene until device loss", error);
      return options.lost.then(release);
    }).finally(() => { retirements.delete(fence); });
    retirements.add(fence);
    scheduleRelease();
  }
  /** The canvas size a failed build is tied to: on another size (a resize, a DPR change) it is tried again. */
  function sizeKey() {
    const stage = options.stage();
    return `${stage.width}x${stage.height}@${stage.dpr}`;
  }

  /** The containment of one object at the layer's current placement, cached by its geometry and the placement. */
  function contain(state: LayerState, scene: InstrumentScene, object: InstrumentObject, placementKey: string, placement: Parameters<typeof checkContainment>[3]) {
    // The frontier depends on the object relative to its bounds only, so identical controls share it.
    const bounds = object.bounds ?? { rect: object.rect, radius: 0 };
    const [bx, by] = bounds.rect;
    const relative: InstrumentObject = { ...object, rect: [object.rect[0] - bx, object.rect[1] - by, object.rect[2], object.rect[3]],
      bounds: { rect: [0, 0, bounds.rect[2], bounds.rect[3]], radius: bounds.radius ?? 0 },
      parts: object.parts.filter(part => partDrawn(part, scene.profiles)).map(part => ({ ...part, at: [part.at[0] - bx, part.at[1] - by, part.at[2]] })) };
    if (!relative.parts.length) return { contained: true, part: 0, inset: Infinity, overshoot: 0, exact: false } satisfies Containment;
    const key = containmentKey(relative, scene.profiles as Record<string, InstrumentProfile>);
    let frontier = state.frontiers.get(key);
    if (!frontier) {
      if (state.frontiers.size > 512) state.frontiers.clear();
      frontier = containmentFrontier(relative, scene.profiles);
      state.frontiers.set(key, frontier);
    }
    const local = { ...placement, matrix: { ...placement.matrix, e: placement.matrix.e + placement.matrix.a * bx + placement.matrix.c * by, f: placement.matrix.f + placement.matrix.b * bx + placement.matrix.d * by } };
    const result = checkContainment(relative, scene.profiles, frontier, local);
    if (!result.exact) return result;
    const exactKey = `${key}|${placementKey}|${bx},${by}`;
    const cached = state.exact.get(exactKey);
    if (cached) return cached;
    if (state.exact.size > 1024) state.exact.clear();
    state.exact.set(exactKey, result);
    return result;
  }

  /**
   * One frame: for each presented layer (paint order), decides what is drawn as parts and writes it. Runs inside core's
   * `draw()`, after native geometry, so instances move in the same frame as the layer.
   */
  function frame(inputs: readonly InstrumentLayerInput[]) {
    if (disposed) return;
    const stage = options.stage(), size = sizeKey();
    const present = new Set(inputs.map(input => input.id));
    for (const [id, state] of layers) if (!present.has(id) || !inputs.find(input => input.id === id)?.scene) drop(state);
    // Custom parts' files: a reference seen for the first time starts loading (outside this frame), a loaded one hands its
    // profile the triangles, and one no scene references any more is let go.
    assets.begin();
    for (const input of inputs) if (input.scene) assets.bind(input.scene);
    assets.end();
    let stageParts = 0;
    for (const input of inputs) {
      const scene = input.scene;
      if (!scene) continue;
      let state = layers.get(input.id);
      if (!state) {
        state = { id: input.id, slot: ++slots, status: "pending", stepped: [], steppedDown: [], warnings: [], parts: 0, drawnParts: 0, kinds: 0, objects: 0,
          frontiers: new Map(), exact: new Map(), gpu: { samples: [], last: null, total: 0 } };
        layers.set(input.id, state);
      }
      // The kinds and their instances follow the layout (each part's kind in order), so poses reuse them.
      const layout = instrumentLayout(scene);
      if (state.layout !== layout || !state.kindMap) {
        state.kindMap = new Map(partKinds(scene).map(kind => [kind.key, kind]));
        state.layout = layout;
      }
      const kindMap = state.kindMap, kinds = [...kindMap.values()], parts = kinds.reduce((sum, kind) => sum + kind.instances.length, 0);
      Object.assign(state, { parts: instrumentPartCount(scene), kinds: kinds.length, objects: scene.objects.length, warnings: [] as string[] });
      if (kinds.length > INSTRUMENT_KINDS_PER_LAYER) state.warnings.push(`kinds: ${kinds.length} part kinds (draw calls), above about ${INSTRUMENT_KINDS_PER_LAYER}`);
      if (scene.objects.some(object => object.parts.some(part => part.glass))) state.warnings.push("glass: glass parts are not drawn until core work item 4");
      // The chain's flags, its map and the map's window on this stage, and which kinds have lenses, are structure too
      // (`postStructure`): a stage that outgrows the window rebuilds the scene.
      const lensKinds = kinds.filter(kind => !kind.captured && kind.instances.some(({ object, part }) => scene.objects[object]?.parts[part]?.emitter !== undefined)).map(kind => kind.key);
      const structure = `${instrumentStructure(scene)}|${postStructure(scene, stage, lensKinds)}`;
      const matrix = similarity(input.matrix);
      // A failed build is retried once the canvas size changes (a transient failure, a target that could not be sized).
      if (state.failed && state.failed.size !== size) state.failed = undefined;
      // Whole-layer step-downs, in the order of the note's ladder.
      let whole: SteppedDown[] | undefined, status: Status = "stepped-down";
      if (orderUnavailable) whole = all(scene, "order-unavailable", orderUnavailable);
      else if (!matrix) whole = all(scene, "transform", "the layer's matrix is not a similarity (rotation, uniform scale and translation)");
      else if (parts > INSTRUMENT_PARTS_PER_LAYER) whole = all(scene, "budget", `${parts} parts in the layer, above ${INSTRUMENT_PARTS_PER_LAYER}`);
      else if (kinds.length > INSTRUMENT_KINDS_CEILING) whole = all(scene, "budget", `${kinds.length} part kinds in the layer, above ${INSTRUMENT_KINDS_CEILING}`);
      else if (stageParts + parts > INSTRUMENT_PARTS_PER_STAGE) whole = all(scene, "budget", `${stageParts + parts} parts on the stage, above ${INSTRUMENT_PARTS_PER_STAGE}`);
      else if (state.failed?.structure === structure) { whole = all(scene, state.failed.post ? "post" : "compile", state.failed.reason); status = "failed"; }
      // A different structure needs a new scene; the old one is taken off at once so no frame shows stale parts.
      if (!whole && (!state.pass || state.structure !== structure || !state.pass.capacityOk(kindMap, scene.objects.length))) {
        if (state.pass) { retirePass(state.pass); state.pass = undefined; state.structure = undefined; }
        if (state.building?.structure !== structure) startBuild(state, scene, structure);
        whole = all(scene, "pending");
        status = "pending";
      }
      if (whole) {
        state.status = status;
        state.stepped = scene.objects.map((_, index) => index);
        state.steppedDown = whole;
        state.drawnParts = 0;
        state.checked = undefined;
        continue;
      }
      stageParts += parts;
      // Containment over the whole travel, at this placement; unchanged geometry at an unchanged placement (poses only)
      // keeps the last verdict.
      const placement = { matrix: matrix!, vanish: [stage.width / 2, stage.height / 2] as [number, number], distance: scene.camera.distance };
      // Which references have their triangles is part of the verdict: a file that arrives is checked in the frame it does.
      const placementKey = `${matrix!.a},${matrix!.b},${matrix!.c},${matrix!.d},${matrix!.e},${matrix!.f},${stage.width},${stage.height},${scene.camera.distance},${input.extent.width},${input.extent.height},${meshReferences(scene).map(reference => (meshReady(reference.shape) ? 1 : 0)).join("")}`;
      const reuse = state.checked && state.checked.placementKey === placementKey && state.checked.structure === structure && sameGeometry(state.checked.scene, scene);
      if (!reuse) {
        const stepped: number[] = [], steppedDown: SteppedDown[] = [];
        scene.objects.forEach((object, index) => {
          // Bounds past the layer's box would let parts cover other content, whatever the clip: never drawn as parts.
          if (!boundsInside(object, input.extent)) {
            stepped.push(index);
            steppedDown.push({ object: object.id, reason: "containment", detail: "its bounds leave the layer's box" });
            return;
          }
          const result = contain(state!, scene, object, placementKey, placement);
          if (result.contained) return;
          const drawnParts = object.parts.filter(part => partDrawn(part, scene.profiles));
          stepped.push(index);
          steppedDown.push({ object: object.id, reason: "containment", part: drawnParts[result.part]?.kind ?? "", inset: Math.round(result.inset * 100) / 100,
            overshoot: Math.round(result.overshoot * 100) / 100 });
        });
        // The triangle budget of custom parts: past it the last objects holding any step down, until the layer fits.
        const done = new Set(stepped);
        const triangles = scene.objects.map((object, index) => (done.has(index) ? 0 : object.parts.reduce((sum, part) => {
          const shape = scene.profiles[part.profile]!;
          return sum + (shape.type === "mesh" && partDrawn(part, scene.profiles) ? profileGeometry(shape).indices.length / 3 : 0);
        }, 0)));
        let total = triangles.reduce((sum, value) => sum + value, 0);
        for (let index = scene.objects.length - 1; index >= 0 && total > INSTRUMENT_CUSTOM_TRIANGLES_PER_LAYER; index--) {
          if (!triangles[index]) continue;
          total -= triangles[index]!;
          stepped.push(index);
          steppedDown.push({ object: scene.objects[index]!.id, reason: "budget", detail: `${triangles[index]} custom triangles; the layer's custom parts are limited to ${INSTRUMENT_CUSTOM_TRIANGLES_PER_LAYER}` });
        }
        // Back in scene order, as the face lists the objects it draws at Relief.
        const order = stepped.map((_, at) => at).sort((a, b) => stepped[a]! - stepped[b]!);
        state.stepped = order.map(at => stepped[at]!);
        state.steppedDown = order.map(at => steppedDown[at]!);
      }
      state.checked = { scene, placementKey, structure };
      state.scene = scene;
      const changed = !reuse || state.status !== "ready";
      state.status = "ready";
      // The guard is bounded on the face as drawn: the primitives and the objects at Relief this frame.
      const guard = layerGuard(instrumentFaceScene(scene, state.stepped), scene.protected);
      state.drawnParts = state.pass!.update(input, scene, new Set(state.stepped), stage, kindMap, changed, guard);
    }
  }

  /** Forgets a layer whose material is no longer `instrument` (or that left): its scene is retired. */
  function drop(state: LayerState) {
    if (state.pass) retirePass(state.pass);
    state.pass = undefined;
    state.building = undefined;
    layers.delete(state.id);
    // The last instrument layer gone: Lite's task timings are turned off again, unless the face pools still read them.
    if (!layers.size && timing.enabled) {
      timing.enabled = false; timing.status = "disabled";
      if (!options.keepTiming?.()) void setRenderTaskGpuTimingEnabled(engine, false).catch(() => undefined);
    }
    // ... and the shared targets are released once every retired scene that read them is gone (`scheduleRelease`).
    scheduleRelease();
  }
  /**
   * Releases the shared targets when no instrument layer, no build and no registered scene is left, after every retired
   * scene's fence; called when a layer leaves, a build ends and a scene retires, so whichever comes last releases them.
   */
  function scheduleRelease() {
    const idle = () => !disposed && !layers.size && !inFlight && !scenes.size;
    if (!idle() || !targets.size) return;
    void settledAll(retirements).then(() => { if (idle() && targets.size) releaseTargets(); });
  }
  /** Releases the shared targets; a later layer allocates them again. Every scene that read them is gone. */
  function releaseTargets() {
    for (const result of targets.values()) {
      try { disposeRenderTargetTexture(result); } catch (error) { console.error("Underglass instrument target disposal failed", error); }
    }
    targets.clear();
  }

  /** The contexts to draw right after layer `id`'s pass: its scene, when it is drawn as parts. */
  function contexts(id: string): RenderingContext[] {
    const state = layers.get(id);
    return state?.pass && state.status === "ready" ? [state.pass.scene] : [];
  }

  /** After a submitted frame: finishes builds' first frames and reads the GPU timings. */
  function afterFrame() {
    if (!layers.size) return;
    if (!timing.enabled && timing.supported) {
      timing.enabled = true;
      void setRenderTaskGpuTimingEnabled(engine, true).then(result => { timing.status = result.status; }, error => { timing.status = `error: ${String(error)}`; });
    }
    if (!timing.enabled) return;
    const snapshot = getRenderTaskGpuTimings(engine);
    timing.status = snapshot.status;
    if (snapshot.status !== "available" || snapshot.frameIndex === timing.frameIndex) return;
    timing.frameIndex = snapshot.frameIndex;
    const record = (entry: Timing, value: number) => {
      entry.last = value;
      if (entry.samples.length === 256) entry.samples.shift();
      entry.samples.push(value);
      entry.total++;
    };
    for (const state of layers.values()) {
      if (!state.pass || state.status !== "ready") continue;
      const { prefix, post } = state.pass;
      // The layer's tasks by stage (decision 14 of item 3); Lite's map task is `shadow`, the task right before the face.
      const perStage = new Map<string, number>();
      snapshot.tasks.forEach((task, at) => {
        let stage: string | undefined;
        if (task.name.startsWith(prefix)) stage = TASK_STAGES[task.name.slice(prefix.length)];
        else if (task.name === "shadow" && snapshot.tasks[at + 1]?.name === `${prefix}face` && snapshot.tasks[at + 1]!.index === task.index + 1) stage = "map";
        if (stage) perStage.set(stage, (perStage.get(stage) ?? 0) + task.durationMs);
      });
      if (!perStage.size) continue;
      if (perStage.has("map") && post.map) post.map.timedRenders++;
      const total = [...perStage.values()].reduce((sum, value) => sum + value, 0);
      for (const [stage, value] of perStage) {
        let entry = post.gpu.get(stage);
        if (!entry) { entry = { samples: [], last: null, total: 0 }; post.gpu.set(stage, entry); }
        record(entry, value);
      }
      record(state.gpu, total);
      options.onMeasure?.({ kind: "instrumentGpuMs", at: performance.now(), durationMs: total, phase: "content", layerId: state.id });
    }
  }
  /** `state().instrument.post`: per layer the stages, the map and the GPU time per stage; the shared targets. */
  function postState() {
    const timingOf = (entry: Timing) => ({ lastMs: entry.last, p50Ms: percentile(entry.samples, 0.5), p95Ms: percentile(entry.samples, 0.95), samples: entry.samples.length, total: entry.total });
    return {
      budgetMs: POST_STAGE_BUDGET_MS,
      targets: Object.fromEntries([...targets].map(([name, result]) => [name, { format: TARGET_FORMATS[name].format, width: result.texture.width, height: result.texture.height }])),
      layers: [...layers.values()].filter(state => state.pass).map(state => {
        const post = state.pass!.post, map = post.map;
        return {
          id: state.id, stages: Object.fromEntries(Object.entries(post.stages).map(([name, value]) => [name, { ...value }])),
          map: map ? { size: map.size, biasPx: map.biasPx, bias: map.bias, darkness: map.darkness, window: map.window, casters: map.casters, renders: map.renders, timedRenders: map.timedRenders } : null,
          lenses: post.lenses, lit: post.lit, caps: post.caps,
          gpu: Object.fromEntries([...post.gpu].map(([stage, entry]) => [stage, timingOf(entry)])),
        };
      }),
    };
  }

  return {
    frame, contexts, afterFrame,
    /** The face's step-down list for layer `id` (object indices), or undefined when it has no instrument state. */
    stepped: (id: string) => layers.get(id)?.stepped,
    /** Every scene the controller owns; the order guard keeps them and core's own contexts only. */
    scenes: () => scenes,
    /** The build in flight, for the successor deadline (the compile policy). */
    gate: () => gate,
    /** Records a successor deadline that waited for a build. */
    deferred: (milliseconds: number) => { compile.deferredDeadlines++; compile.deferredMs += milliseconds; },
    /** The order guard failed: every instrument layer steps down from the next frame. */
    orderFailed: (reason: string) => {
      if (!orderUnavailable) console.error(`Underglass instrument draw order unavailable: ${reason}`);
      orderUnavailable = reason;
      // Off the surface at once, so the frame about to render does not draw parts in the wrong order, and every object
      // at Relief in that same frame (the renderer orders contexts before it writes the face's uniforms).
      for (const state of layers.values()) {
        if (state.pass?.registered) { unregisterScene(state.pass.scene); state.pass.registered = false; }
        const scene = state.checked?.scene;
        if (!scene) continue;
        state.status = "stepped-down";
        state.stepped = scene.objects.map((_, index) => index);
        state.steppedDown = all(scene, "order-unavailable", reason);
        state.drawnParts = 0;
        state.checked = undefined;
      }
    },
    retirements: () => [...retirements],
    active: () => layers.size > 0,
    state: () => ({
      layers: [...layers.values()].map(state => ({ id: state.id, status: state.status, objects: state.objects, parts: state.parts, drawnParts: state.drawnParts,
        kinds: state.kinds, steppedDown: state.steppedDown.map(entry => ({ ...entry })), warnings: [...state.warnings],
        // Custom parts (core work item 5): each part whose profile is a mesh, and whether its triangles are there.
        customParts: state.scene ? customParts(state.scene).map(({ object, part, profile }) => {
          const shape = state.scene!.profiles[profile] as MeshProfile;
          const info = shape.source ? assets.info(shape) : { status: "ready" as const, vertices: profileGeometry(shape).positions.length / 3, triangles: profileGeometry(shape).indices.length / 3 };
          return { object: state.scene!.objects[object]!.id, part, profile, source: shape.source ? (shape.source.url ?? "buffer") : "inline", ...info };
        }) : [],
        // The parts' clustered lights: whether the scene has them, and how many the emitters lit this frame.
        lights: { clustered: !!state.pass?.lights, lit: state.pass?.lights && state.status === "ready" ? state.pass.litLights : 0 },
        gpu: { lastMs: state.gpu.last, p50Ms: percentile(state.gpu.samples, 0.5), p95Ms: percentile(state.gpu.samples, 0.95), samples: state.gpu.samples.length, total: state.gpu.total } })),
      stage: { parts: [...layers.values()].reduce((sum, state) => sum + state.drawnParts, 0), budget: INSTRUMENT_PARTS_PER_STAGE },
      budgets: { partsPerLayer: INSTRUMENT_PARTS_PER_LAYER, partsPerStage: INSTRUMENT_PARTS_PER_STAGE, kindsPerLayer: INSTRUMENT_KINDS_PER_LAYER, kindsCeiling: INSTRUMENT_KINDS_CEILING,
        customTrianglesPerLayer: INSTRUMENT_CUSTOM_TRIANGLES_PER_LAYER },
      assets: assets.state(),
      timing: { ...timing },
      compile: { ...compile, building: !!gate },
      order: orderUnavailable ?? "core",
      resources: { scenes: scenes.size, retiring: retirements.size, grain: grain ? 1 : 0, targets: targets.size, mapTextures: { ...mapTextures } },
      post: postState(),
    }),
    /** Releases everything at once; the caller has fenced the GPU or the device is lost. */
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const state of layers.values()) {
        if (state.pass) {
          if (state.pass.registered) unregisterScene(state.pass.scene);
          try { disposeScene(state.pass.scene); } catch (error) { console.error("Underglass instrument scene disposal failed", error); }
        }
      }
      layers.clear();
      scenes.clear();
      assets.dispose();
      if (grain) { releaseTexture(grain); grain = undefined; }
      // The shared targets go after every scene that reads them.
      releaseTargets();
    },
  };
}
export type InstrumentController = ReturnType<typeof createInstrumentController>;

/** What a kind's mesh was built from: a mesh profile's identity and whether it has its triangles yet (custom parts). */
function shapeKeyOf(shape: InstrumentProfile): string {
  return shape.type === "mesh" ? `${shape.id}|${meshGeometry(shape) ? 1 : 0}` : "";
}
/** The light vector of 2.1 (layer axes, y down): towards the light. */
function lightVector(scene: InstrumentScene): [number, number, number] {
  const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
}
/** A captured cap's interior factor (2B.4 and 2.9): hover lift, press sink, coat and gloss, within `interior.max`. */
function capFactor(scene: InstrumentScene, part: InstrumentScene["objects"][number]["parts"][number]): number {
  const material = scene.materials[part.material] ?? {}, state = part.state ?? {}, m = scene.interior.max;
  const offsets = scene.state.hoverLift * (state.hover ? 1 : 0) - scene.state.pressSink * (state.pressed ? 1 : 0)
    + (material.coat?.strength ?? 0) * 0.02 + (1 - (material.base?.roughness ?? 1)) * 0.01;
  return state.disabled ? 1 : 1 + Math.min(m, Math.max(-m, offsets));
}

// Shader materials. `inverseX`/`inverseY` map canvas CSS px to layer px; `frame` is (dpr, opacity, texels per CSS px).
const frameUniforms = [
  { name: "inverseX", type: "vec4<f32>" as const, defaultValue: [1, 0, 0, 0] },
  { name: "inverseY", type: "vec4<f32>" as const, defaultValue: [0, 1, 0, 0] },
  { name: "frame", type: "vec4<f32>" as const, defaultValue: [1, 1, 1, 1] },
  { name: "clip", type: "vec4<f32>" as const, defaultValue: [0, 0, 1e6, 1e6] },
  { name: "captured", type: "vec4<f32>" as const, defaultValue: [1, 1, 0.04, 0] },
];
const localWGSL = /* wgsl */ `
fn layerLocal(position: vec2<f32>) -> vec2<f32> {
  let p = vec3<f32>(position / shaderUniforms.frame.x, 1.0);
  return vec2<f32>(dot(shaderUniforms.inverseX.xyz, p), dot(shaderUniforms.inverseY.xyz, p));
}
fn insideClip(local: vec2<f32>) -> bool {
  let clip = shaderUniforms.clip;
  return all(local >= clip.xy) && all(local <= clip.xy + clip.zw);
}`;
// Every thin-instanced shader material: the instance index as its slot into a storage buffer.
const slotVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
@vertex fn mainVertex(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  out.slot = instance;
  return out;
}`;
const roundedBoxWGSL = /* wgsl */ `
fn roundedBox(q: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
  let radius = min(r, min(half.x, half.y));
  let a = abs(q) - half + vec2<f32>(radius);
  return length(max(a, vec2<f32>(0.0))) + min(max(a.x, a.y), 0.0) - radius;
}`;
// A captured cap: the layer pass's own sampling of the capture (premultiplied bilinear, exact on the pixel grid), with
// the solid cap's interior factor (per instance, from `caps`). Drawn into the caps target, straight alpha over its
// transparent clear (so premultiplied there); the composite applies the layer's opacity.
const capFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
${localWGSL}
fn premultipliedTexel(texel: vec2<f32>) -> vec4<f32> {
  let value = textureLoad(capture, vec2<i32>(floor(texel)), 0);
  return vec4<f32>(value.rgb * value.a, value.a);
}
fn filtered(texel: vec2<f32>, captured: vec2<f32>) -> vec4<f32> {
  let position = clamp(texel, vec2<f32>(0.5), captured - vec2<f32>(0.5)) - vec2<f32>(0.5);
  let base = floor(position);
  let weight = position - base;
  let low = base + vec2<f32>(0.5);
  let high = min(base + vec2<f32>(1.5), max(captured - vec2<f32>(0.5), vec2<f32>(0.5)));
  let value = mix(mix(premultipliedTexel(low), premultipliedTexel(vec2<f32>(high.x, low.y)), weight.x),
    mix(premultipliedTexel(vec2<f32>(low.x, high.y)), premultipliedTexel(high), weight.x), weight.y);
  return select(vec4<f32>(0.0), vec4<f32>(value.rgb / value.a, value.a), value.a > 1e-5);
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let local = layerLocal(input.position.xy);
  if (!insideClip(local)) { discard; }
  let sample = filtered(local * shaderUniforms.frame.zw, shaderUniforms.captured.xy);
  let factor = caps[input.slot].x;
  return vec4<f32>(min(sample.rgb * factor, vec3<f32>(1.0)), sample.a);
}`;
// Face shadows (2.8): per object quad, up to 8 casters `(centre, half size)`, `(radius, height)`; the darkest wins.
const shadowFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
${localWGSL}
${roundedBoxWGSL}
// The guard's weight of a box given by its corners: 1 inside, easing to 0 over the feather outside it.
fn guardWeight(p: vec2<f32>, rect: vec4<f32>, feather: f32) -> f32 {
  let half = (rect.zw - rect.xy) * 0.5;
  let d = abs(p - (rect.xy + half)) - half;
  let t = clamp((length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0)) / max(feather, 1e-6), 0.0, 1.0);
  return 1.0 - t * t * (3.0 - 2.0 * t);
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let p = layerLocal(input.position.xy);
  if (!insideClip(p)) { discard; }
  var s = 0.0;
  for (var i = 0u; i < ${INSTRUMENT_CASTERS_PER_OBJECT}u; i++) {
    let a = shapes[(input.slot * ${INSTRUMENT_CASTERS_PER_OBJECT}u + i) * 2u];
    let b = shapes[(input.slot * ${INSTRUMENT_CASTERS_PER_OBJECT}u + i) * 2u + 1u];
    let h = b.y;
    if (h <= 0.0) { continue; }
    let q = p - a.xy;
    let shifted = roundedBox(q + shaderUniforms.light.xy * h, a.zw, b.x);
    s = max(s, shaderUniforms.light.z * (1.0 - smoothstep(-0.5 * h, 1.5 * h + 1.0, shifted)) * smoothstep(-1.0, 0.5, roundedBox(q, a.zw, b.x)));
  }
  // The guard (2D.4): inside a protected rect the shadow is scaled to its share of the rect's shadow cap, easing back
  // to full strength over the feather outside it.
  let header = guard[0];
  for (var k = 0u; k < u32(header.x); k++) {
    let rect = guard[2u + 2u * k];
    s *= mix(1.0, guard[3u + 2u * k].x, guardWeight(p, rect, header.y));
  }
  // A protected box: the scale of p's cell, easing off over the feather outside the box.
  if (header.z > 0.5) {
    let extent = guard[1].xy;
    let size = max(extent / vec2<f32>(${GUARD_CELLS.x}.0, ${GUARD_CELLS.y}.0), vec2<f32>(1e-6));
    let cell = clamp(vec2<i32>(floor(p / size)), vec2<i32>(0), vec2<i32>(${GUARD_CELLS.x - 1}, ${GUARD_CELLS.y - 1}));
    s *= mix(1.0, guard[${2 + 2 * PROTECTED_PER_LAYER}u + u32(cell.y) * ${GUARD_CELLS.x}u + u32(cell.x)].x, guardWeight(p, vec4<f32>(0.0, 0.0, extent), header.y));
  }
  return vec4<f32>(0.0, 0.0, 0.0, s * shaderUniforms.frame.y);
}`;
// The clip mask (decision 4 of item 3): 1 where the pixel's centre lies inside the object's bounds (`boxes`: centre and
// half size, then the radius) and inside the layer's clip, in layer px; nothing elsewhere.
const maskFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
${localWGSL}
${roundedBoxWGSL}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let p = layerLocal(input.position.xy);
  let a = boxes[input.slot * 2u];
  let b = boxes[input.slot * 2u + 1u];
  if (!insideClip(p) || a.z <= 0.0 || roundedBox(p - a.xy, a.zw, b.x) > 0.0) { discard; }
  return vec4<f32>(1.0);
}`;
// A lens's glow in the emitter target (decision 8 of item 3): its colour while its emitter is lit, nothing otherwise
// (alpha 0 in `glows`), and nothing outside the layer's clip.
const glowFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
${localWGSL}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let glow = glows[input.slot];
  if (glow.a <= 0.0 || !insideClip(layerLocal(input.position.xy))) { discard; }
  return vec4<f32>(glow.rgb, 1.0);
}`;
/** The composite's uniform: the rectangle (CSS px), (canvas width, height, dpr, ·), (opacity, bloom, caps, ·). */
const COMPOSITE_VEC4S = 3;
// The composite (decisions 3, 5 and 6 of item 3), over the layer's rectangle: `α · [caps + (1 − caps.a) · (parts + halo) · mask]`,
// the halo `max(bloom − source, 0)`, premultiplied. Every input is read at its own texel: the targets are the canvas's size.
const compositeWGSL = {
  vertex: /* wgsl */ `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn effectFullscreenVertex(@builtin(vertex_index) vertex: u32) -> EffectVertexOutput {
  let bounds = composite[0];
  let size = max(composite[1].xy, vec2f(1.0));
  let corner = vec2f(f32(vertex == 1u), f32(vertex == 2u)) * 2.0;
  let at = bounds.xy + corner * (bounds.zw - bounds.xy);
  var output: EffectVertexOutput;
  output.position = vec4f(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
  output.uv = corner;
  return output;
}`,
  fragment: /* wgsl */ `@group(0) @binding(0) var<uniform> composite: array<vec4f, ${COMPOSITE_VEC4S}>;
@group(0) @binding(1) var parts: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var caps: texture_2d<f32>;
@group(0) @binding(4) var glow: texture_2d<f32>;
@group(0) @binding(5) var emitters: texture_2d<f32>;
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
  let texel = vec2i(floor(input.position.xy));
  let flags = composite[2];
  var colour = textureLoad(parts, texel, 0);
  if (flags.y > 0.5) {
    colour = vec4f(colour.rgb + max(textureLoad(glow, texel, 0).rgb - textureLoad(emitters, texel, 0).rgb, vec3f(0.0)), colour.a);
  }
  colour = vec4f(min(colour.rgb, vec3f(1.0)), clamp(colour.a, 0.0, 1.0)) * textureLoad(mask, texel, 0).r;
  if (flags.z > 0.5) {
    let cap = textureLoad(caps, texel, 0);
    colour = cap + (1.0 - cap.a) * colour;
  }
  return colour * flags.x;
}`,
};
/** Straight-alpha source-over, as the layer pass blends. */
const straightAlpha: GPUBlendState = { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
/** Premultiplied source-over: the composite (a halo with colour and no coverage adds light). */
const premultiplied: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
/** Darkens what is beneath by the fragment's alpha and leaves its alpha. */
const darken: GPUBlendState = { color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" } };

/**
 * The studio (design language section 4, rendering model 2D.5) as a Radiance `.hdr` (RLE scanlines of literal runs),
 * 512 × 256, authored in a canonical frame with the key at longitude 0 and at the light's height `ly`; `setEnvironmentRotation`
 * turns it to the light's azimuth. Ported from the I0.4 probe (`instrument-environment.ts`), which measured Lite 1.33's
 * layout: file column longitude `l` lands at the direction `(sin l, ·, cos l)`, the first row is +y.
 */
export function studioHdr(ly: number, tokens: StudioTokens, width = 512): Uint8Array {
  const height = width / 2;
  // The canonical key direction (y up, +z away): the light's own height above the screen's horizon (`ly`, the world
  // y of the direction towards the light), at longitude 0; the rotation about y then brings it to the light.
  const key: [number, number, number] = [0, ly, -Math.sqrt(Math.max(0, 1 - ly * ly))];
  const smooth = (edge0: number, edge1: number, value: number) => { const k = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return k * k * (3 - 2 * k); };
  const fillDirection: [number, number, number] = [0, -0.35, Math.sqrt(1 - 0.35 * 0.35)];
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const runs = Math.ceil(width / 128), rowBytes = 4 + 4 * (width + runs);
  const bytes = new Uint8Array(header.length + height * rowBytes);
  bytes.set(header);
  let offset = header.length;
  const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  for (let row = 0; row < height; row++) {
    const polar = ((row + 0.5) / height) * Math.PI;
    for (let column = 0; column < width; column++) {
      const longitude = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
      const x = Math.sin(polar) * Math.sin(longitude), y = Math.cos(polar), z = Math.sin(polar) * Math.cos(longitude);
      const angle = (a: [number, number, number]) => Math.acos(Math.min(1, Math.max(-1, a[0] * x + a[1] * y + a[2] * z)));
      let value = tokens.floor + (tokens.ceiling - tokens.floor) * smooth(-0.35, 0.65, y);
      value += tokens.key * smooth(tokens.keyRadius + 0.1, tokens.keyRadius, angle(key));
      value += tokens.fill * smooth(0.85, 0.55, angle(fillDirection)) * 0.5;
      value += tokens.front * smooth(1.3, 0.9, angle([0, 0, -1]));
      value += tokens.strip * smooth(0.16, 0.2, y) * smooth(0.38, 0.34, y);
      const r = value * 0.97, g = value * 0.99, b = value, peak = Math.max(r, g, b);
      if (peak < 1e-32) { for (const channel of channels) channel[column] = 0; continue; }
      const exponent = Math.floor(Math.log2(peak)) + 1, scale = 256 / 2 ** exponent;
      channels[0]![column] = Math.min(255, Math.floor(r * scale)); channels[1]![column] = Math.min(255, Math.floor(g * scale));
      channels[2]![column] = Math.min(255, Math.floor(b * scale)); channels[3]![column] = exponent + 128;
    }
    bytes.set([2, 2, width >> 8, width & 255], offset);
    offset += 4;
    for (const channel of channels) for (let start = 0; start < width; start += 128) {
      const count = Math.min(128, width - start);
      bytes[offset++] = count;
      bytes.set(channel.subarray(start, start + count), offset);
      offset += count;
    }
  }
  return bytes.subarray(0, offset);
}
export type { Matrix };
