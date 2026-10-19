/**
 * Surfaces for the Phase I1 prototype's Instrument level (`instrument-mesh.ts`), carried over from probe I0.4
 * (`ui-probes/instrument-materials.ts`, `ui-probes/instrument-environment.ts`; docs/ui-library/instrument-phase0.md,
 * I0.4 and the I1 second iteration):
 * - **Environment:** I0.4's studio generated in code (`loadStudio`), rotated with `setEnvironmentRotation` so its
 *   softbox lies at the key light (`studioRotation`), and a per-layer **capture probe** (`createCaptureProbe`): the
 *   layer's own capture as a local environment cube, so metal reflects the faceplate print and its neighbours. The cube
 *   is refreshed when the layer's capture is uploaded or replaced, never per frame. `enablePbrLocalCubemap` runs before
 *   the studio loads, as Lite requires.
 * - **PBR recipes:** brushed metal with I0.4's grain normal map (hairlines along u) and anisotropy, clear-coated lacquer,
 *   gold through its base colour, chrome and polished aluminium; every reflective material takes the capture probe.
 * - **Glass** (`glassMaterial`): a capture-refraction ShaderMaterial with the reflection built in, not a Lite PBR shell
 *   (I0.4's shell added about 0 on flat glass, so its glass read as invisible). Per pixel:
 *   - **transmission:** the view ray is refracted into the glass (Snell, ior 1.5, one index per colour channel for
 *     dispersion), travels to the glass's flat bottom, refracts out and lands on the face plane, where the layer's
 *     capture is read (bilinear). A domed cap is a real plano-convex lens, so print under its centre is magnified; a
 *     steep rim refracts towards total internal reflection at the bottom and goes dark. Light inside the glass is
 *     absorbed along its path (a thickness tint);
 *   - **reflection:** Schlick Fresnel (`f0` from the ior) weights the reflected ray's radiance: rays towards the face
 *     meet the polished skirt the cap stands on (a mirror of the studio) or the faceplate (the capture at the hit point,
 *     the exact local capture a box-projected cube approximates); rays away from it see the studio, evaluated in the
 *     shader from the same function the `.hdr` is generated from (Lite 1.33's ShaderMaterial binds 2D textures only,
 *     not a cube);
 *   - **display pane** (`mode.x` 1): flat glass is exactly the capture texel (I0.4's displacement against a flat pane,
 *     zero where the pane is flat), and inside the protected text rect the shader returns the texel unconditionally.
 *     Outside it the design language's top finish zone puts a reflection band (3–26% of the window) and a dark horizon
 *     line (24–32%) on the glass, and the pane's bevel refracts the window's edge with a darker, tinted rim.
 * Throwaway prototype code.
 */
import {
  createDynamicTexture, createPbrMaterial, createShaderMaterial, enablePbrLocalCubemap, loadHdrEnvironment, enableShaderMaterialInstanceWorld, setEnvironmentRotation,
  setPbrAnisotropy, setPbrClearCoat, setPbrLocalEnvironment, setShaderTexture, setShaderUniform, updateDynamicTexture,
  type EngineContext, type EnvironmentTextures, type HemisphericLight, type Material, type PbrMaterialProps, type ShaderMaterial, type Texture2D,
} from "@babylonjs/lite";
import { createCaptureProbe, studioHdr, studioRotation, studioTokens, towardsLight, type CaptureProbe, type KeyLight } from "../ui-probes/instrument-environment.ts";
import type { InstrumentLayer } from "../ui-probes/instrument-harness.ts";
import type { MaterialRecipe } from "./instrument-tokens.ts";

type Rgb = readonly [number, number, number];
const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export const linear = ([r, g, b]: Rgb): [number, number, number, number] => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];

/** Deterministic values, so every run draws the same grain. */
function seeded(seed: number) { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/**
 * I0.4's `grain` layer: a hairline normal map generated in code. Grooves run along u (around a lathe, along x on a
 * plate), one random depth per row with a slow drift along u, so the lines are not ruled.
 */
let grainCanvas: HTMLCanvasElement | undefined;
function grainTexture(engine: EngineContext, strength: number) {
  const width = 512, height = 512;
  const texture = createDynamicTexture(engine, width, height, { addressModeU: "repeat", addressModeV: "repeat", mipMaps: true });
  // Generated once per page (a rebuild must not block the main thread long enough for core's successor deadline).
  if (grainCanvas) { updateDynamicTexture(engine, texture, grainCanvas, { invertY: false }); return texture; }
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width, height });
  const context = canvas.getContext("2d")!, image = context.createImageData(width, height);
  const random = seeded(7), rows = Array.from({ length: height }, () => random() * 2 - 1);
  const groove = rows.map((_, row) => (rows[(row + height - 1) % height]! + 2 * rows[row]! + rows[(row + 1) % height]!) / 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tilt = strength * (groove[y]! + 0.25 * Math.sin((x / width) * Math.PI * 6 + y * 0.37));
    const length = Math.hypot(tilt, 1), offset = (y * width + x) * 4;
    image.data[offset] = 128; image.data[offset + 1] = Math.round((tilt / length) * 127 + 128); image.data[offset + 2] = Math.round((1 / length) * 127 + 128); image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  grainCanvas = canvas;
  updateDynamicTexture(engine, texture, canvas, { invertY: false });
  return texture;
}

// ---- Glass ----

const glassVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) worldPos: vec3<f32>, @location(1) normal: vec3<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world = getFinalWorld(input);
  let position = world * vec4<f32>(input.position, 1.0);
  out.position = shaderSystem.projection * (shaderSystem.view * position);
  out.worldPos = position.xyz;
  out.normal = (world * vec4<f32>(input.normal, 0.0)).xyz;
  return out;
}`;
// The room is the character's (`studio.*`): the shader is written when a layer's surfaces are built, not when the module loads.
const glassFragmentFor = (s = studioTokens) => /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) worldPos: vec3<f32>, @location(1) normal: vec3<f32> };
fn srgbToLinear(c: vec3<f32>) -> vec3<f32> { return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045)); }
fn linearToSrgb(c: vec3<f32>) -> vec3<f32> { let x = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0)); return select(1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - 0.055, x * 12.92, x <= vec3<f32>(0.0031308)); }
fn ramp(e0: f32, e1: f32, x: f32) -> f32 { let k = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return k * k * (3.0 - 2.0 * k); }
fn loadCapture(texel: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(capture));
  return textureLoad(capture, clamp(texel, vec2<i32>(0), size - vec2<i32>(1)), 0);
}
// Bilinear capture at a continuous capture coordinate (device px from the layer's top-left), linear colour.
fn captureAt(c: vec2<f32>) -> vec3<f32> {
  let p = c - vec2<f32>(0.5);
  let i = vec2<i32>(floor(p));
  let f = p - floor(p);
  let a = mix(loadCapture(i).rgb, loadCapture(i + vec2<i32>(1, 0)).rgb, f.x);
  let b = mix(loadCapture(i + vec2<i32>(0, 1)).rgb, loadCapture(i + vec2<i32>(1, 1)).rgb, f.x);
  return srgbToLinear(mix(a, b, f.y));
}
// The face plane (z = 0) at world xy: canvas px (y down), device px, then the layer's capture.
fn faceAt(xy: vec2<f32>) -> vec3<f32> {
  let stage = shaderUniforms.stage;
  return captureAt(vec2<f32>(xy.x + stage.x, stage.y - xy.y) * stage.z - shaderUniforms.origin.xy);
}
fn rotateY(v: vec3<f32>, angle: f32) -> vec3<f32> { let c = cos(angle); let s = sin(angle); return vec3<f32>(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
fn angleTo(a: vec3<f32>, b: vec3<f32>) -> f32 { return acos(clamp(dot(a, b), -1.0, 1.0)); }
// I0.4's studio (instrument-environment.ts, studioRadiance) in a world direction: the environment rotation turns the
// canonical studio so its key softbox lies at the key light, as Lite's lookup does for the PBR materials.
fn studio(w: vec3<f32>) -> vec3<f32> {
  let d = rotateY(normalize(w), shaderUniforms.glass.w);
  let ly = shaderUniforms.light.x;
  let lr = shaderUniforms.light.y;
  var value = ${s.floor} + (${s.ceiling} - ${s.floor}) * ramp(-0.35, 0.65, d.y);
  value += ${s.key} * ramp(${s.keyRadius + s.keySoftness}, ${s.keyRadius}, angleTo(d, vec3<f32>(0.0, ly, -lr)));
  value += ${s.fill} * 0.5 * ramp(${s.fillRadius + 0.3}, ${s.fillRadius}, angleTo(d, vec3<f32>(0.0, -0.35, ${Math.sqrt(1 - 0.35 * 0.35)})));
  value += ${s.front} * ramp(${s.frontRadius + 0.4}, ${s.frontRadius}, angleTo(d, vec3<f32>(0.0, 0.0, -1.0)));
  value += ${s.strip} * ramp(${s.stripLow - 0.04}, ${s.stripLow}, d.y) * ramp(${s.stripHigh + 0.04}, ${s.stripHigh}, d.y);
  return value * vec3<f32>(0.97, 0.99, 1.0);
}
// Transmission for one index of refraction: into the glass, down to its flat bottom, out, onto the face. Returns the
// face colour where the ray lands and the path length inside the glass (negative: total internal reflection).
fn through(p: vec3<f32>, d: vec3<f32>, n: vec3<f32>, eta: f32) -> vec4<f32> {
  let t1 = refract(d, n, 1.0 / eta);
  let bottom = -shaderUniforms.mode.y;
  let s = max(bottom - p.z, 0.0) / max(t1.z, 1e-3);
  let q = p + t1 * s;
  let t2 = refract(t1, vec3<f32>(0.0, 0.0, -1.0), eta);
  if (dot(t2, t2) < 0.25) { return vec4<f32>(0.0, 0.0, 0.0, -1.0); }
  let f = q + t2 * (-q.z / max(t2.z, 1e-3));
  return vec4<f32>(faceAt(f.xy), s);
}
// I0.4's pane displacement: the ray refracted through n against the ray refracted through a flat pane, on the face.
fn shift(d: vec3<f32>, n: vec3<f32>, eta: f32, depth: f32) -> vec2<f32> {
  let tn = refract(d, n, eta);
  let tf = refract(d, vec3<f32>(0.0, 0.0, -1.0), eta);
  return tn.xy * (depth / max(tn.z, 0.15)) - tf.xy * (depth / max(tf.z, 0.15));
}
// Radiance along a reflected ray from p: towards the face it meets the polished skirt (a mirror of the studio) or the
// faceplate; away from it, the studio.
fn reflected(p: vec3<f32>, r: vec3<f32>) -> vec3<f32> {
  if (r.z <= 1e-3) { return studio(r); }
  let skirt = shaderUniforms.skirt;
  if (skirt.w > 0.0) {
    let g = p + r * (max(-skirt.z - p.z, 0.0) / r.z);
    if (length(g.xy - skirt.xy) <= skirt.w) { return shaderUniforms.skirtTint.rgb * studio(vec3<f32>(r.x, r.y, -r.z)); }
  }
  return faceAt((p + r * (-p.z / r.z)).xy);
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let pixel = input.position.xy;
  let base = vec2<i32>(floor(pixel - shaderUniforms.origin.xy));
  let mode = shaderUniforms.mode;
  let pane = mode.x > 0.5;
  // The display's protected text rect (device px on the canvas): exactly the capture texel, always.
  let guard = shaderUniforms.protect;
  if (pane && all(pixel >= guard.xy) && all(pixel <= guard.zw)) { return vec4<f32>(loadCapture(base).rgb, 1.0); }
  let p = input.worldPos;
  let d = normalize(p - shaderUniforms.camera.xyz);
  var n = normalize(input.normal);
  if (dot(n, d) > 0.0) { n = -n; }
  let ior = shaderUniforms.glass.x;
  let spread = shaderUniforms.glass.y;
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  let cosine = clamp(-dot(d, n), 0.0, 1.0);
  let fresnel = f0 + (1.0 - f0) * pow(1.0 - cosine, 5.0);
  let tint = shaderUniforms.tint;
  var transmitted: vec3<f32>;
  var path = 0.0;
  if (pane) {
    let flat = n.z < -0.99999;
    let window = shaderUniforms.window;
    let v = (pixel.y - window.y) / max(window.w - window.y, 1.0);
    // The top finish zone: a reflection band from 3% that fades towards 26% (a ceiling seen in the glass), brighter
    // towards the key light’s side, over a thin dark horizon line.
    let u = (pixel.x - window.x) / max(window.z - window.x, 1.0);
    let band = mode.z * ramp(0.03, 0.06, v) * (1.0 - ramp(0.06, 0.26, v)) * (1.25 - 0.6 * u);
    let horizon = mode.w * (ramp(0.25, 0.27, v) - ramp(0.28, 0.31, v));
    // Flat glass outside the finish zone is the plain capture texel.
    if (flat && band <= 0.0 && horizon <= 0.0) { return vec4<f32>(loadCapture(base).rgb, 1.0); }
    let depth = max(-p.z, 0.0);
    let dpr = shaderUniforms.stage.z;
    let sr = shift(d, n, 1.0 / (ior - spread), depth) * vec2<f32>(dpr, -dpr);
    let sg = shift(d, n, 1.0 / ior, depth) * vec2<f32>(dpr, -dpr);
    let sb = shift(d, n, 1.0 / (ior + spread), depth) * vec2<f32>(dpr, -dpr);
    let at = vec2<f32>(base) + vec2<f32>(0.5);
    transmitted = vec3<f32>(captureAt(at + sr).r, captureAt(at + sg).g, captureAt(at + sb).b);
    // A tilted bevel is seen through more glass: darker and tinted.
    path = (1.0 - clamp(-n.z, 0.0, 1.0)) * 12.0;
    var colour = transmitted * exp(-(vec3<f32>(1.0) - tint.rgb) * tint.w * path);
    colour = mix(colour, reflected(p, reflect(d, n)) * shaderUniforms.glass.z, max(fresnel - f0, 0.0));
    colour = colour * (1.0 - horizon) + vec3<f32>(0.86, 0.9, 0.95) * band;
    return vec4<f32>(linearToSrgb(colour), 1.0);
  }
  let red = through(p, d, n, ior - spread);
  let green = through(p, d, n, ior);
  let blue = through(p, d, n, ior + spread);
  // Total internal reflection at the bottom: the ray stays in the glass and sees the dark interior.
  // (Decided on the green channel for all three, so the rim does not sparkle where one channel crosses the critical angle.)
  let trapped = green.w < 0.0;
  transmitted = select(vec3<f32>(red.r, green.g, blue.b), vec3<f32>(0.015, 0.015, 0.018), trapped);
  path = max(green.w, 0.0);
  let absorbed = transmitted * exp(-(vec3<f32>(1.0) - tint.rgb) * tint.w * path);
  var colour = (1.0 - fresnel) * absorbed + fresnel * reflected(p, reflect(d, n)) * shaderUniforms.glass.z;
  if (shaderUniforms.light.z > 0.5 && shaderUniforms.light.z < 1.5) { colour = reflected(p, reflect(d, n)); }
  if (shaderUniforms.light.z > 1.5) { colour = vec3<f32>(fresnel); }
  return vec4<f32>(linearToSrgb(colour), 1.0);
}`;

export interface GlassOptions {
  /** Height of the glass's flat bottom above the face (CSS px). */
  bottom: number;
  /** A display pane: flat glass is the capture, with the finish zone outside the protected text rect. */
  pane?: { band: number; horizon: number };
  /** The polished skirt the glass stands on (layer-local centre, its top height and radius) and its tint (linear). */
  skirt?: { x: number; y: number; height: number; radius: number; tint: Rgb };
}

/** Everything the layer's surfaces share: environment, probe, grain, and the glass materials that follow the capture. */
export interface LayerSurfaces {
  studio: EnvironmentTextures; probe: CaptureProbe; rotation: number;
  pbr(recipe: MaterialRecipe, options?: { direction?: [number, number]; polished?: boolean; environment?: number; direct?: number; grain?: boolean }): Material;
  ink(colour: Rgb, roughness?: number): Material;
  glass(name: string, options: GlassOptions): ShaderMaterial;
  /** Sets the display pane's window and protected rect (canvas device px). */
  setPane(material: ShaderMaterial, window: [number, number, number, number], protect: [number, number, number, number]): void;
  /** Follows the layer's capture into the glass and refreshes the probe when the capture changed; call before each frame. */
  follow(texture: (Texture2D & { texture?: GPUTexture }) | undefined, origin: Float32Array, uploads: number): void;
  refreshes(): number;
}

let cubemapReady: Promise<void> | undefined;
/** I0.4's studio `.hdr`, generated once per key light. */
const studioFiles = new Map<string, Uint8Array>();
async function loadStudio(scene: InstrumentLayer["scene"], light: KeyLight) {
  const key = `${light.azimuth},${light.elevation},${JSON.stringify(studioTokens)}`;
  if (!studioFiles.has(key)) studioFiles.set(key, studioHdr(light));
  const url = URL.createObjectURL(new Blob([studioFiles.get(key)! as BlobPart], { type: "image/vnd.radiance" }));
  try { return await loadHdrEnvironment(scene, url, { faceSize: 256, skipSkybox: true, skipGround: true }); } finally { URL.revokeObjectURL(url); }
}

/**
 * The surfaces of one layer scene: loads the studio (rotated to the key light, hemispheric fill off), creates the
 * capture probe and the grain map, and returns the material factories.
 */
export async function createSurfaces(layer: InstrumentLayer, options: { light: KeyLight; reflections: number; glassEnvironment: number; stage: { width: number; height: number }; distance: number }): Promise<LayerSurfaces> {
  cubemapReady ??= enablePbrLocalCubemap();
  await cubemapReady;
  const surface = layer.scene.surface as unknown as { engine: EngineContext; canvas: HTMLCanvasElement };
  const engine = surface.engine, device = (surface.canvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const studio = await loadStudio(layer.scene, options.light);
  const rotation = studioRotation(options.light);
  setEnvironmentRotation(layer.scene, rotation);
  // Loading an environment resets image processing, which the captured face needs off.
  layer.scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
  // The studio is the fill: the harness's hemispheric light gives a normal-incidence specular that whitens face-on metal.
  for (const light of layer.scene.lights) if ((light as { lightType?: string }).lightType === "hemispheric") (light as HemisphericLight).intensity = 0;
  const panel = layer.element, width = panel.offsetWidth, height = panel.offsetHeight;
  const [left, top] = layer.world(0, 0), [right, bottom] = layer.world(width, height);
  const dpr = window.devicePixelRatio;
  const probe = createCaptureProbe(device, studio, { size: 512, rotation, dpr, panel: { minX: left, maxX: right, minY: bottom, maxY: top },
    captureHeight: Math.max(width, height) / 2, reach: 50000, offsetX: options.stage.width / 2 - layer.origin.x, offsetY: options.stage.height / 2 - layer.origin.y });
  probe.refresh(undefined, false);
  const grain = grainTexture(engine, 0.15);

  const cache = new Map<string, Material>();
  const pbr: LayerSurfaces["pbr"] = (recipe, extra = {}) => {
    const direction = extra.direction ?? [1, 0], polished = extra.polished ?? false;
    const grained = extra.grain ?? true;
    const key = `${recipe.label}:${direction}:${polished}:${extra.environment ?? 1}:${extra.direct ?? "-"}:${grained}`;
    if (!cache.has(key)) {
      const brushed = recipe.brush > 0 && !polished;
      const material = createPbrMaterial({ baseColorFactor: linear(recipe.colour), metallicFactor: recipe.metallic, roughnessFactor: polished ? Math.min(recipe.roughness, 0.06) : recipe.roughness,
        doubleSided: true, environmentIntensity: recipe.environment * options.reflections * (extra.environment ?? 1), directIntensity: extra.direct ?? recipe.direct,
        ...(brushed && grained ? { normalTexture: grain, normalTextureScale: 1 } : {}) });
      if (brushed) setPbrAnisotropy(material, { isEnabled: true, intensity: recipe.brush, direction });
      if (recipe.coat > 0) setPbrClearCoat(material, { isEnabled: true, intensity: recipe.coat, roughness: recipe.coatRoughness, indexOfRefraction: 1.5 });
      setPbrLocalEnvironment(material, probe.environment, probe.projection);
      cache.set(key, material as unknown as Material);
    }
    return cache.get(key)!;
  };
  const ink: LayerSurfaces["ink"] = (colour, roughness = 0.7) => {
    const key = `ink:${colour}:${roughness}`;
    if (!cache.has(key)) cache.set(key, createPbrMaterial({ baseColorFactor: linear(colour), metallicFactor: 0, roughnessFactor: roughness, doubleSided: true, environmentIntensity: 0.4 }) as unknown as Material);
    return cache.get(key)!;
  };
  const placeholder = createDynamicTexture(engine, 1, 1);
  const glasses: ShaderMaterial[] = [];
  const [, ly] = towardsLight(options.light);
  const glass: LayerSurfaces["glass"] = (name, glassOptions) => {
    const skirt = glassOptions.skirt, at = skirt ? layer.world(skirt.x, skirt.y) : [0, 0];
    const material = createShaderMaterial({ name, vertexSource: glassVertex, fragmentSource: glassFragmentFor(), attributes: ["position", "normal"],
      uniforms: ["world", "view", "projection",
        { name: "origin", type: "vec4<f32>", defaultValue: [0, 0, 0, 0] },
        { name: "stage", type: "vec4<f32>", defaultValue: [options.stage.width / 2, options.stage.height / 2, dpr, 0] },
        { name: "camera", type: "vec4<f32>", defaultValue: [0, 0, -options.distance, 0] },
        { name: "glass", type: "vec4<f32>", defaultValue: [1.5, 0.02, options.reflections * options.glassEnvironment, rotation] },
        { name: "tint", type: "vec4<f32>", defaultValue: [0.84, 0.93, 0.9, 0.03] },
        { name: "mode", type: "vec4<f32>", defaultValue: [glassOptions.pane ? 1 : 0, glassOptions.bottom, glassOptions.pane?.band ?? 0, glassOptions.pane?.horizon ?? 0] },
        { name: "skirt", type: "vec4<f32>", defaultValue: skirt ? [at[0]!, at[1]!, skirt.height, skirt.radius] : [0, 0, 0, 0] },
        { name: "skirtTint", type: "vec4<f32>", defaultValue: skirt ? [...linear(skirt.tint).slice(0, 3), 0] : [0, 0, 0, 0] },
        { name: "light", type: "vec4<f32>", defaultValue: [ly, Math.sqrt(Math.max(0, 1 - ly * ly)), Number(new URLSearchParams(location.search).get("glassDebug") ?? 0), 0] },
        { name: "window", type: "vec4<f32>", defaultValue: [0, 0, 1, 1] },
        { name: "protect", type: "vec4<f32>", defaultValue: [-1, -1, -1, -1] }],
      samplers: ["capture"], backFaceCulling: !!glassOptions.pane });
    enableShaderMaterialInstanceWorld(material);
    setShaderTexture(material, "capture", placeholder as never);
    glasses.push(material);
    return material;
  };
  let bound: unknown, originKey = "", uploadsSeen = -2, refreshedWith: unknown;
  return {
    studio, probe, rotation, pbr, ink, glass,
    setPane(material, window, protect) { setShaderUniform(material, "window", window); setShaderUniform(material, "protect", protect); },
    follow(texture, origin, uploads) {
      if (texture && texture !== bound) { for (const material of glasses) setShaderTexture(material, "capture", texture as never); bound = texture; }
      const key = `${origin[0]},${origin[1]}`;
      if (key !== originKey) { for (const material of glasses) setShaderUniform(material, "origin", [origin[0]!, origin[1]!, 0, 0]); originKey = key; }
      if (texture?.texture && (uploads !== uploadsSeen || texture !== refreshedWith)) { probe.refresh(texture.texture, true); uploadsSeen = uploads; refreshedWith = texture; }
    },
    refreshes: () => probe.refreshes(),
  };
}
export type { PbrMaterialProps };
