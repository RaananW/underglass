/**
 * The `instrument` material's mesh pass (Rendering Model 2D, `docs/ui-library/instrument-phase2.md`): one Babylon Lite
 * scene per instrument layer on core's shared engine, drawn right after that layer's own pass. `renderer.ts` creates
 * one controller (`createInstrumentController`) per engine and calls it from its frame: `frame` validates budgets and
 * containment, starts builds and writes every instance in the same frame as the layer's geometry; `contexts` names the
 * scene that draws after a layer's pass; `afterFrame` reads GPU timings and finishes a build's first frame.
 *
 * Each layer scene has the stage camera (at the canvas centre, `D` away, mapping the face plane one CSS px to one CSS
 * px), the key light, an optional diffuse fill, the studio environment and two render tasks into the layer's pass
 * target (colour loaded, never cleared):
 * - `face`: one quad per object that darkens the face by its parts' analytic shadows (the Relief formula, 2.8);
 * - `parts`: the parts (PBR, thin-instanced per kind, GPU-culled) and the captured caps, with the scene's own depth
 *   buffer cleared every frame, after a clip mask when the layer is clipped.
 * Core work item 3 moves `parts` to an offscreen target with a clipped composite; `face` stays.
 *
 * World axes are Lite's (y up, +z away from the viewer, the stage centre at the origin). Instance matrices map
 * part-local px to world: the canvas conversion, times the layer's similarity (with z scaled alike), times the part's
 * placement. Every resource belongs to its scene (`onSceneDispose`) or to the controller (the grain map), and is
 * released after a queue fence or device loss, as superseded compositions are.
 */
import {
  addClusteredLightContainer, addMeshToTask, addTask, addToScene, createClusteredLightContainer, createClusteredPointLight, createDirectionalLight,
  createDynamicTexture, createFreeCamera, createHemisphericLight, markClusteredLightContainerDirty,
  createMeshFromData, createPbrMaterial, createRenderTarget, createRenderTask, createSceneContext, createShaderMaterial, createStorageBuffer,
  disposeScene, disposeStorageBuffer, enableAsyncShaderPipelineCompilation, enableShaderMaterialInstanceWorld, enableThinInstanceGpuCulling,
  flushThinInstances, getRenderTaskGpuTimings, markMaterialUboDirty, isGpuTimingSupported, loadHdrEnvironment, onSceneDispose, registerScene, releaseTexture,
  setEnvironmentRotation, setPbrAnisotropy, setPbrClearCoat, setPbrEmissive, setPbrIridescence, setPbrMetallicReflectance, setPbrSheen,
  setMeshVisible, setRenderTaskGpuTimingEnabled, setShaderStorageBuffer, setShaderTexture, setShaderUniform, setThinInstanceCount, setThinInstances,
  unregisterScene, updateDynamicTexture, updateStorageBuffer, vec3,
  type ClusteredLightContainer, type DynamicTexture2D, type EngineContext, type FreeCamera, type Material, type Mesh, type PbrMaterialProps, type RenderingContext,
  type SceneContext, type ShaderMaterial, type StorageBuffer,
} from "@babylonjs/lite";
import { DEFAULT_FEATHER, EMITTERS_PER_LAYER, GUARD_CELLS, guardCells, layerGuard, PROTECTED_PER_LAYER, shadowScales, type Guard, type LayerEmitters } from "./emitters.js";
import {
  boundsInside, checkContainment, containmentFrontier, containmentKey, instrumentFaceScene, instrumentLayout, instrumentPartCount, instrumentStructure, multiply, partCaster, partKinds,
  partMatrix, profileBounds, profileGeometry, sameGeometry, similarity, INSTRUMENT_CASTERS_PER_OBJECT, INSTRUMENT_KINDS_CEILING, INSTRUMENT_KINDS_PER_LAYER, INSTRUMENT_OBJECTS, INSTRUMENT_PARTS_PER_LAYER,
  INSTRUMENT_PARTS_PER_STAGE, STUDIO_DEFAULTS, type Containment, type ContainmentFrontier, type InstrumentCaster, type InstrumentObject,
  type InstrumentProfile, type InstrumentRecipe, type InstrumentScene, type Matrix, type PartKind, type StudioTokens,
} from "./instrument.js";

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
  reason: "containment" | "budget" | "compile" | "pending" | "order-unavailable" | "transform";
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
  taskNames: string[];
  registered: boolean;
  /** The clustered light container (a scene with `emitters`), and how many of its lights are lit. */
  lights?: ClusteredLightContainer;
  litLights: number;
}
interface Stage { width: number; height: number; dpr: number }
interface LayerState {
  id: string;
  slot: number;
  pass?: Pass;
  structure?: string;
  /** The build in flight: its structure and a token that tells a superseded build to dispose its scene. */
  building?: { structure: string; token: object };
  failed?: { structure: string; reason: string };
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
  /** @internal Tests only: `beforeBuild` may delay (or never resolve) a layer's build, to prove the build deadline. */
  testHook?: { beforeBuild?(layerId: string): Promise<void> | void };
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

  /** Builds a layer's scene; resolves once it is registered (pipelines prepared) or rejects. */
  async function build(state: LayerState, scene: InstrumentScene, structure: string): Promise<Pass> {
    const label = `instrument:${state.id}`;
    const sceneContext = createSceneContext(engine, { defaultRenderTask: false });
    let registered = false;
    try {
      sceneContext.name = label;
      sceneContext.imageProcessing = { ...sceneContext.imageProcessing, exposure: 1, contrast: 1, toneMappingEnabled: false };
      const camera = createFreeCamera(vec3(0, 0, -scene.camera.distance), vec3(0, 0, 0));
      sceneContext.camera = camera;
      // Lite's light direction is the way light travels, in world axes; the scene's light points towards the light.
      const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
      const towards: [number, number, number] = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
      addToScene(sceneContext, createDirectionalLight([-towards[0], -towards[1], -towards[2]], scene.light.intensity ?? 1.6));
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
      setEnvironmentRotation(sceneContext, Math.atan2(towards[0], -towards[2]));
      const pass = createPass(state, sceneContext, camera, scene, structure);
      if (!asyncPipelines) { enableAsyncShaderPipelineCompilation(engine); asyncPipelines = true; }
      await registerScene(sceneContext);
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

  /** Creates the tasks, materials, kinds, casters and caps of one scene; `update` writes them every frame. */
  function createPass(state: LayerState, sceneContext: SceneContext, camera: FreeCamera, scene: InstrumentScene, structure: string): Pass {
    const label = `instrument:${state.id}`;
    const depth = createRenderTarget({ lbl: `${label}:depth`, dFormat: "depth24plus-stencil8", samples: 1, size: engine });
    const faceTask = createRenderTask({ name: `${label}:face`, rt: engine.scRT, clr: false, autoMirror: false }, engine, sceneContext);
    const partsTask = createRenderTask({ name: `${label}:parts`, rt: engine.scRT, depth, clr: false, autoMirror: false }, engine, sceneContext);
    addTask(sceneContext, faceTask);
    addTask(sceneContext, partsTask);
    const add = (task: typeof faceTask, mesh: Mesh) => { addToScene(sceneContext, mesh); addMeshToTask(task, mesh); };
    const storage: StorageBuffer[] = [];
    onSceneDispose(sceneContext, () => { for (const buffer of storage.splice(0)) disposeStorageBuffer(buffer); });
    const kinds = partKinds(scene);
    const capacityOf = (count: number) => Math.min(INSTRUMENT_PARTS_PER_LAYER, Math.max(256, 2 ** Math.ceil(Math.log2(Math.max(1, count) * 2))));
    // Uniforms every shader material shares: canvas → layer px (the inverse similarity) and the frame.
    const shared = (): ShaderMaterial[] => materials;
    const materials: ShaderMaterial[] = [];

    // PBR materials from the recipes (decision 4 of the note), one per material name the kinds use, and a blended twin
    // for fractional layer opacity (decision 7).
    const pbr = new Map<string, PbrMaterialProps>(), blended = new Map<string, PbrMaterialProps>();
    const pbrOf = (name: string, blend = false) => {
      const cache = blend ? blended : pbr;
      let material = cache.get(name);
      if (material) return material;
      material = recipeMaterial(scene.materials[name]!, scene, blend ? `${name}:blended` : name);
      if (blend) { material.alphaBlend = true; material.alpha = 1; }
      cache.set(name, material);
      return material;
    };

    // Parts: one thin-instanced mesh per kind. Captured kinds take the cap shader instead of PBR.
    const caps: { material: ShaderMaterial; buffer: StorageBuffer; data: Float32Array; dirty: boolean }[] = [];
    const meshes = kinds.map((kind, index) => {
      const geometry = profileGeometry(scene.profiles[kind.profile]!);
      const mesh = createMeshFromData(engine, `${label}:kind${index}`, geometry.positions, geometry.normals, geometry.indices, geometry.uvs);
      const capacity = capacityOf(kind.instances.length), matrices = new Float32Array(capacity * 16);
      setThinInstances(mesh, matrices, capacity);
      setThinInstanceCount(mesh, kind.instances.length);
      let cap: (typeof caps)[number] | undefined;
      let twin: Mesh | undefined;
      if (kind.captured) {
        const data = new Float32Array(capacity * 4);
        const buffer = createStorageBuffer(engine, data, `${label}:caps${index}`);
        storage.push(buffer);
        const material = createShaderMaterial({ name: `${label}:caps${index}`, vertexSource: capVertex, fragmentSource: capFragment, attributes: ["position"],
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
      } else {
        mesh.material = pbrOf(kind.material) as unknown as Material;
        // Lite culls thin instances on the GPU; caps index their storage by instance, so they are not culled.
        enableThinInstanceGpuCulling(mesh);
        // The blended twin draws the same instances while the layer's opacity is fractional. Lite builds a swapped
        // material's renderable asynchronously and outside explicit tasks, so the twin is built with the scene instead.
        twin = createMeshFromData(engine, `${label}:kind${index}:blended`, geometry.positions, geometry.normals, geometry.indices, geometry.uvs);
        setThinInstances(twin, matrices, capacity);
        setThinInstanceCount(twin, kind.instances.length);
        twin.material = pbrOf(kind.material, true) as unknown as Material;
        enableThinInstanceGpuCulling(twin);
        setMeshVisible(twin, false);
        add(partsTask, twin);
      }
      add(partsTask, mesh);
      return { kind, mesh, twin, matrices, capacity, cap, count: kind.instances.length };
    });

    // Face shadows (I0.5 (a)): one quad per object, up to 8 casters each from a storage buffer, darkest wins.
    // Every object the format allows: adding objects updates in place, without a rebuild.
    const objectCapacity = INSTRUMENT_OBJECTS;
    const quad = createMeshFromData(engine, `${label}:shadows`, new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1]),
      new Uint32Array([0, 1, 2, 0, 2, 3]), new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]));
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
    const shade = createShaderMaterial({ name: `${label}:shadows`, vertexSource: shadowVertex, fragmentSource: shadowFragment, attributes: ["position"],
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

    // The clip mask: the nearest depth outside the layer's clip, no colour, before every part.
    const mask = createMeshFromData(engine, `${label}:clip`, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), new Float32Array([0, 0, -1, 0, 0, -1, 0, 0, -1]),
      new Uint32Array([0, 1, 2]), new Float32Array([0, 0, 1, 0, 0, 1]));
    const clipMaterial = createShaderMaterial({ name: `${label}:clip`, vertexSource: maskVertex, fragmentSource: maskFragment, attributes: ["position"],
      uniforms: ["world", "view", "projection", ...frameUniforms],
      // Opaque (drawn first, by `renderOrder`) although it has a blend: Lite would otherwise count it as transparent.
      needAlphaBlending: false, blend: keep, depthWrite: true, depthCompare: "always", backFaceCulling: false });
    materials.push(clipMaterial);
    mask.material = clipMaterial as unknown as Material;
    mask.renderOrder = -1000;
    setMeshVisible(mask, false);
    add(partsTask, mask);

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
    let opacityApplied = 1;
    let boundTexture: DynamicTexture2D | undefined = options.texture(state.id);
    const lastT = new Float64Array(objectCapacity).fill(Number.NaN);
    // Profiles are part of the structure, so their bounds hold for the scene's life.
    const bounds = new Map<string, ReturnType<typeof profileBounds>>();
    const boundsOf = (name: string, current: InstrumentScene) => {
      let value = bounds.get(name);
      if (!value) { value = profileBounds(current.profiles[name]!); bounds.set(name, value); }
      return value;
    };

    const pass: Pass = {
      scene: sceneContext, camera, structure, registered: false, lights, litLights: 0,
      taskNames: [`${label}:face`, `${label}:parts`],
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
        for (const material of shared()) {
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
        // The clip mask runs only when the clip cuts the layer's box.
        const full = input.clip.x <= 0 && input.clip.y <= 0 && input.clip.x + input.clip.width >= input.extent.width && input.clip.y + input.clip.height >= input.extent.height;
        // Lite records opaque draws in a bundle: visibility goes through `setMeshVisible`, which re-records it.
        setMeshVisible(mask, !full);
        // Opacity: 0 draws no part; 1 draws them opaque; between, Lite's material alpha (decision 7 of the note).
        const visible = input.opacity > 0, fractional = visible && input.opacity < 1;
        for (const entry of meshes) {
          setMeshVisible(entry.mesh, visible && (!fractional || !!entry.cap));
          if (entry.twin) setMeshVisible(entry.twin, fractional);
        }
        setMeshVisible(quad, visible);
        if (fractional && input.opacity !== opacityApplied) {
          for (const material of blended.values()) { material.alpha = input.opacity; markMaterialUboDirty(material as unknown as Material); }
          opacityApplied = input.opacity;
        }
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
        let drawn = 0;
        for (const entry of meshes) {
          entry.kind = kinds.get(entry.kind.key) ?? { ...entry.kind, instances: [] };
          const count = entry.kind.instances.length;
          let dirty = all || count !== entry.count;
          entry.kind.instances.forEach(({ object, part }, index) => {
            if (!hidden.has(object)) drawn++;
            if (entry.cap) {
              const factor = hidden.has(object) ? 0 : capFactor(current, current.objects[object]!.parts[part]!);
              if (entry.cap.data[index * 4] !== Math.fround(factor)) { entry.cap.data[index * 4] = factor; entry.cap.dirty = true; }
            }
            if (!all && !moved[object]) return;
            dirty = true;
            const target = entry.matrices.subarray(index * 16, index * 16 + 16);
            if (hidden.has(object)) { target.fill(0); return; }
            const entryObject = current.objects[object]!, placement = multiply(world, partMatrix(entryObject.parts[part]!, entryObject.t ?? 0));
            for (let k = 0; k < 16; k++) target[k] = placement[k]!;
          });
          if (count !== entry.count) { setThinInstanceCount(entry.mesh, count); if (entry.twin) setThinInstanceCount(entry.twin, count); entry.count = count; }
          if (dirty) { flushThinInstances(entry.mesh); if (entry.twin) flushThinInstances(entry.twin); }
          if (entry.cap?.dirty) { updateStorageBuffer(engine, entry.cap.buffer, entry.cap.data); entry.cap.dirty = false; }
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
          const casters = object.parts.flatMap(part => {
            if (part.glass) return [];
            const caster = partCaster(part, current.profiles[part.profile]!, object.t ?? 0, boundsOf(part.profile, current));
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
        const building = Promise.resolve(options.testHook?.beforeBuild?.(state.id)).then(() => build(state, scene, structure));
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
            state.failed = { structure, reason };
            console.error(`Underglass instrument layer ${state.id} is drawn at the Relief level: ${reason}`);
            options.requestDraw();
          }
        } catch (error) {
          clearTimeout(timer);
          compile.failures++;
          if (timedOut) { compile.timeouts++; void building.then(retirePass, () => undefined); }
          if (state.building?.token === token) {
            state.building = undefined;
            state.failed = { structure, reason: String(error) };
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
  }

  /** The containment of one object at the layer's current placement, cached by its geometry and the placement. */
  function contain(state: LayerState, scene: InstrumentScene, object: InstrumentObject, placementKey: string, placement: Parameters<typeof checkContainment>[3]) {
    // The frontier depends on the object relative to its bounds only, so identical controls share it.
    const bounds = object.bounds ?? { rect: object.rect, radius: 0 };
    const [bx, by] = bounds.rect;
    const relative: InstrumentObject = { ...object, rect: [object.rect[0] - bx, object.rect[1] - by, object.rect[2], object.rect[3]],
      bounds: { rect: [0, 0, bounds.rect[2], bounds.rect[3]], radius: bounds.radius ?? 0 },
      parts: object.parts.filter(part => !part.glass).map(part => ({ ...part, at: [part.at[0] - bx, part.at[1] - by, part.at[2]] })) };
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
    const stage = options.stage();
    const present = new Set(inputs.map(input => input.id));
    for (const [id, state] of layers) if (!present.has(id) || !inputs.find(input => input.id === id)?.scene) drop(state);
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
      const structure = `${instrumentStructure(scene)}`;
      const matrix = similarity(input.matrix);
      // Whole-layer step-downs, in the order of the note's ladder.
      let whole: SteppedDown[] | undefined, status: Status = "stepped-down";
      if (orderUnavailable) whole = all(scene, "order-unavailable", orderUnavailable);
      else if (!matrix) whole = all(scene, "transform", "the layer's matrix is not a similarity (rotation, uniform scale and translation)");
      else if (parts > INSTRUMENT_PARTS_PER_LAYER) whole = all(scene, "budget", `${parts} parts in the layer, above ${INSTRUMENT_PARTS_PER_LAYER}`);
      else if (kinds.length > INSTRUMENT_KINDS_CEILING) whole = all(scene, "budget", `${kinds.length} part kinds in the layer, above ${INSTRUMENT_KINDS_CEILING}`);
      else if (stageParts + parts > INSTRUMENT_PARTS_PER_STAGE) whole = all(scene, "budget", `${stageParts + parts} parts on the stage, above ${INSTRUMENT_PARTS_PER_STAGE}`);
      else if (state.failed?.structure === structure) { whole = all(scene, "compile", state.failed.reason); status = "failed"; }
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
      const placementKey = `${matrix!.a},${matrix!.b},${matrix!.c},${matrix!.d},${matrix!.e},${matrix!.f},${stage.width},${stage.height},${scene.camera.distance},${input.extent.width},${input.extent.height}`;
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
          const drawnParts = object.parts.filter(part => !part.glass);
          stepped.push(index);
          steppedDown.push({ object: object.id, reason: "containment", part: drawnParts[result.part]?.kind ?? "", inset: Math.round(result.inset * 100) / 100,
            overshoot: Math.round(result.overshoot * 100) / 100 });
        });
        state.stepped = stepped;
        state.steppedDown = steppedDown;
      }
      state.checked = { scene, placementKey, structure };
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
    for (const state of layers.values()) {
      if (!state.pass || state.status !== "ready") continue;
      const names = state.pass.taskNames, tasks = snapshot.tasks.filter(task => names.includes(task.name));
      if (!tasks.length) continue;
      const total = tasks.reduce((sum, task) => sum + task.durationMs, 0);
      state.gpu.last = total;
      if (state.gpu.samples.length === 256) state.gpu.samples.shift();
      state.gpu.samples.push(total);
      state.gpu.total++;
      options.onMeasure?.({ kind: "instrumentGpuMs", at: performance.now(), durationMs: total, phase: "content", layerId: state.id });
    }
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
        // The parts' clustered lights: whether the scene has them, and how many the emitters lit this frame.
        lights: { clustered: !!state.pass?.lights, lit: state.pass?.lights && state.status === "ready" ? state.pass.litLights : 0 },
        gpu: { lastMs: state.gpu.last, p50Ms: percentile(state.gpu.samples, 0.5), p95Ms: percentile(state.gpu.samples, 0.95), samples: state.gpu.samples.length, total: state.gpu.total } })),
      stage: { parts: [...layers.values()].reduce((sum, state) => sum + state.drawnParts, 0), budget: INSTRUMENT_PARTS_PER_STAGE },
      budgets: { partsPerLayer: INSTRUMENT_PARTS_PER_LAYER, partsPerStage: INSTRUMENT_PARTS_PER_STAGE, kindsPerLayer: INSTRUMENT_KINDS_PER_LAYER, kindsCeiling: INSTRUMENT_KINDS_CEILING },
      timing: { ...timing },
      compile: { ...compile, building: !!gate },
      order: orderUnavailable ?? "core",
      resources: { scenes: scenes.size, retiring: retirements.size, grain: grain ? 1 : 0 },
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
      if (grain) { releaseTexture(grain); grain = undefined; }
    },
  };
}
export type InstrumentController = ReturnType<typeof createInstrumentController>;

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
// A captured cap: the layer pass's own sampling of the capture (premultiplied bilinear, exact on the pixel grid), with
// the solid cap's interior factor (per instance, from `caps`).
const capVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
@vertex fn mainVertex(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  out.slot = instance;
  return out;
}`;
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
  return vec4<f32>(min(sample.rgb * factor, vec3<f32>(1.0)), sample.a * shaderUniforms.frame.y);
}`;
// Face shadows (2.8): per object quad, up to 8 casters `(centre, half size)`, `(radius, height)`; the darkest wins.
const shadowVertex = capVertex;
const shadowFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) @interpolate(flat) slot: u32 };
${localWGSL}
fn roundedBox(q: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
  let radius = min(r, min(half.x, half.y));
  let a = abs(q) - half + vec2<f32>(radius);
  return length(max(a, vec2<f32>(0.0))) + min(max(a.x, a.y), 0.0) - radius;
}
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
// The clip mask: a screen triangle at the nearest depth (reverse-Z: 1), discarded inside the clip.
const maskVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = vec4<f32>(input.position.xy, 1.0, 1.0);
  return out;
}`;
const maskFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
${localWGSL}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  if (insideClip(layerLocal(input.position.xy))) { discard; }
  return vec4<f32>(0.0);
}`;
/** Straight-alpha source-over, as the layer pass blends. */
const straightAlpha: GPUBlendState = { color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
/** Darkens what is beneath by the fragment's alpha and leaves its alpha. */
const darken: GPUBlendState = { color: { srcFactor: "zero", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" } };
/** Writes no colour. */
const keep: GPUBlendState = { color: { srcFactor: "zero", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" } };

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
