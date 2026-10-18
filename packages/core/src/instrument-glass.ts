/**
 * The Instrument level's glass and the settings of its capture probe (Rendering Model 2D.5 and 2D.6,
 * `docs/ui-library/instrument-phase2.md`, core work item 4): the WGSL of the glass shader, the constants and per-instance
 * data it reads, and the pure rules `instrument-pass.ts` builds from. No Babylon Lite and no DOM.
 *
 * Glass is a custom shader, not Lite's transmission (L6 in `docs/upstream/babylon-lite.md`) and not a cube lookup (L12:
 * shader materials bind 2D textures only): per pixel it loads the layer's capture and traces 2D.6 exactly, in layer axes
 * (x right, y down, z up). A lens refracts in at its dome, down to its flat bottom, out and onto the face, one index per
 * colour channel; a window shifts the capture against a flat pane. Both add the Fresnel reflection of the studio (the
 * studio's definition, evaluated here), of the part's `stand` and of the face.
 */
import { partCaster, partMatrix, STUDIO_DEFAULTS, type InstrumentPart, type InstrumentProfile, type InstrumentScene, type StudioTokens } from "./instrument.js";

/** Floats per glass instance: four `vec4`s, see `glassInstance`. */
export const GLASS_VEC4S = 4;
/** The window's default finish zone (`finish: true`, and the validator's defaults for an object that omits a field). */
export const FINISH_DEFAULTS = { band: 0.3, horizon: 0.25 } as const;
/** Probes (page cubes) a stage holds: 16.8 MB each at the default size, so the rest of a stage's layers reflect the studio alone. */
export const INSTRUMENT_PROBES_PER_STAGE = 4;
/** The reference's total internal reflection colour (2D.6): the dark interior. */
export const INTERIOR = [0.015, 0.015, 0.018] as const;

/** The light vector of 2.1 (layer axes, y down): towards the light. */
export function layerLight(scene: Pick<InstrumentScene, "light">): [number, number, number] {
  const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
}
const srgbToLinear = (hex: string): [number, number, number] => [1, 3, 5].map(index => {
  const c = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}) as [number, number, number];

/**
 * The page cube a scene asks for (2D.5): on unless `environment.page.enabled` is false, `size` texels per face (a power of
 * two, 128..1024; the validator accepts any integer in that range, so it is rounded down to one) and captured `height` px
 * in front of the face plane.
 */
export function pageSettings(scene: Pick<InstrumentScene, "environment">): { enabled: boolean; size: number; height: number } {
  const page = scene.environment.page ?? {};
  const size = Math.max(128, Math.min(1024, 2 ** Math.floor(Math.log2(page.size ?? 512))));
  return { enabled: page.enabled !== false, size, height: page.height ?? 300 };
}
/**
 * What a probe's content depends on besides the capture itself: the layer's placement (its similarity and the stage), since
 * the projection box is fixed when the scene registers and the cube's content follows a layer that moves. A probe is
 * refreshed when this key, the capture's upload count or the capture texture changes, and at no other time.
 */
export function probeKey(matrix: { a: number; b: number; c: number; d: number; e: number; f: number }, stage: { width: number; height: number }, content: { pixelWidth: number; pixelHeight: number }): string {
  return `${matrix.a},${matrix.b},${matrix.c},${matrix.d},${matrix.e},${matrix.f}|${stage.width}x${stage.height}|${content.pixelWidth}x${content.pixelHeight}`;
}

/**
 * The constants of one glass material, five `vec4`s (`g0`..`g4`):
 * `g0` = (ior, spread, absorption, reflection); `g1` = (tint, environment strength); `g2` = (floor, ceiling, key, keyRadius);
 * `g3` = (fill, front, strip, mode: 0 window, 1 lens); `g4` = (the light vector, 0). `spread` is `Δ = 0.1 · dispersion`.
 */
export function glassConstants(scene: InstrumentScene, material: string, mode: "lens" | "window"): number[][] {
  const recipe = scene.materials[material] ?? {}, glass = { ior: 1.5, tint: [0.84, 0.93, 0.9] as number[] | string, absorption: 0.03, reflection: 1.5, ...recipe.glass };
  const tint = typeof glass.tint === "string" ? srgbToLinearChannels(glass.tint) : [...glass.tint];
  const studio: StudioTokens = { ...STUDIO_DEFAULTS, ...scene.environment.studio }, L = layerLight(scene);
  return [
    [glass.ior, 0.1 * (recipe.dispersion?.strength ?? 0), glass.absorption, glass.reflection],
    [tint[0]!, tint[1]!, tint[2]!, scene.environment.strength],
    [studio.floor, studio.ceiling, studio.key, studio.keyRadius],
    [studio.fill, studio.front, studio.strip, mode === "lens" ? 1 : 0],
    [L[0], L[1], L[2], 0],
  ];
}
/** A `#rrggbb` glass tint is its channels over 255, not decoded (2D.6, as the reference). */
const srgbToLinearChannels = (hex: string): number[] => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);

/**
 * One glass instance's data (four `vec4`s) at its object's `t`: `[centre x, y, base height z, stand radius]`,
 * `[stand colour (linear), 0]`, `[the window's caster rect: left, top, width, height]` (for the finish zone), and
 * `[finish band, finish horizon, 1 when the window has a finish zone, 0]`.
 */
export function glassInstance(scene: InstrumentScene, object: number, partIndex: number, profile: InstrumentProfile, bounds?: Parameters<typeof partCaster>[3], out = new Float32Array(GLASS_VEC4S * 4)): Float32Array {
  const entry = scene.objects[object]!, part: InstrumentPart = entry.parts[partIndex]!, t = entry.t ?? 0, m = partMatrix(part, t);
  out.fill(0);
  out.set([m[12]!, m[13]!, m[14]!, part.stand?.radius ?? 0], 0);
  if (part.stand) out.set(srgbToLinear(part.stand.colour), 4);
  out.set([0, 0, 1, 1], 8);
  if (part.glass === "window" && part.finish) {
    const finish = typeof part.finish === "object" ? { ...FINISH_DEFAULTS, ...part.finish } : FINISH_DEFAULTS;
    const caster = partCaster({ ...part, caster: undefined }, profile, t, bounds);
    if (caster) out.set([...caster.rect, finish.band ?? FINISH_DEFAULTS.band, finish.horizon ?? FINISH_DEFAULTS.horizon, 1, 0], 8);
  }
  return out;
}

/**
 * The capture as the layer pass and the captured caps sample it: premultiplied bilinear, exact on the pixel grid
 * (`captured` is the content's size in texels, `texel` the position in texels). Shared by the caps and the glass.
 */
export const CAPTURE_WGSL = /* wgsl */ `
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
}`;

/** The glass vertex stage: the instance index as its slot, and the world position and normal for the fragment. */
export const glassVertex = /* wgsl */ `struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(flat) slot: u32,
  @location(1) world: vec3<f32>,
  @location(2) normal: vec3<f32>,
};
@vertex fn mainVertex(input: VertexInput, @builtin(instance_index) instance: u32) -> VertexOutput {
  var out: VertexOutput;
  let world = getFinalWorld(input);
  let position = world * vec4<f32>(input.position, 1.0);
  out.position = shaderSystem.projection * (shaderSystem.view * position);
  out.slot = instance;
  out.world = position.xyz;
  out.normal = (world * vec4<f32>(input.normal, 0.0)).xyz;
  return out;
}`;

/**
 * The glass fragment stages (2D.6). `local` is the pass's `layerLocal`/`insideClip` snippet. `main` shades into the mesh
 * target (premultiplied); `exact` is the window's exact-only twin for the caps target: the capture texel (straight alpha)
 * where a window is exact, nothing elsewhere, so SMAA never reaches text under glass.
 */
export function glassFragment(local: string, entry: "main" | "exact"): string {
  return /* wgsl */ `${vertexOutputWGSL}
${local}
${CAPTURE_WGSL}
fn canvasToLayer(c: vec2<f32>) -> vec2<f32> {
  let p = vec3<f32>(c, 1.0);
  return vec2<f32>(dot(shaderUniforms.inverseX.xyz, p), dot(shaderUniforms.inverseY.xyz, p));
}
fn capture4(p: vec2<f32>) -> vec4<f32> { return filtered(p * shaderUniforms.frame.zw, shaderUniforms.captured.xy); }
fn lin3(c: vec3<f32>) -> vec3<f32> {
  return select(pow((c + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc3(c: vec3<f32>) -> vec3<f32> {
  let x = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
  return select(1.055 * pow(x, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055), x * 12.92, x <= vec3<f32>(0.0031308));
}
fn ss(edge0: f32, edge1: f32, x: f32) -> f32 {
  let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
fn angle(a: vec3<f32>, b: vec3<f32>) -> f32 { return acos(clamp(dot(a, b), -1.0, 1.0)); }
// The studio (2D.5) in layer axes, from its definition; \`g2\`..\`g4\` hold its tokens and the light vector.
fn studio(direction: vec3<f32>) -> vec3<f32> {
  let L = shaderUniforms.g4.xyz;
  let l = select(length(L.xz), 1.0, length(L.xz) == 0.0);
  let w = normalize(direction);
  let up = -w.y;
  let toFill = vec3<f32>(-0.937 * L.x / l, 0.35, -0.937 * L.z / l);
  let toFront = vec3<f32>(L.x / l, 0.0, L.z / l);
  let room = shaderUniforms.g2.x + (shaderUniforms.g2.y - shaderUniforms.g2.x) * ss(-0.35, 0.65, up);
  let value = room
    + shaderUniforms.g2.z * ss(shaderUniforms.g2.w + 0.1, shaderUniforms.g2.w, angle(w, L))
    + 0.5 * shaderUniforms.g3.x * ss(0.85, 0.55, angle(w, toFill))
    + shaderUniforms.g3.y * ss(1.3, 0.9, angle(w, toFront))
    + shaderUniforms.g3.z * ss(0.16, 0.2, up) * ss(0.38, 0.34, up);
  return vec3<f32>(value * 0.97, value * 0.99, value);
}
struct Surface { X: vec3<f32>, d: vec3<f32>, n: vec3<f32> };
// The surface point, the camera ray and the normal (turned towards the viewer) in layer axes, from the interpolated world
// position and normal and the layer's similarity (\`placement\` = half stage, scale, camera distance).
fn surfaceOf(input: VertexOutput) -> Surface {
  let place = shaderUniforms.placement;
  let X = vec3<f32>(canvasToLayer(vec2<f32>(input.world.x + place.x, place.y - input.world.y)), -input.world.z / place.z);
  let C = vec3<f32>(canvasToLayer(place.xy), place.w / place.z);
  let c = vec3<f32>(input.normal.x, -input.normal.y, -input.normal.z);
  var n = normalize(vec3<f32>(place.z * vec2<f32>(dot(shaderUniforms.inverseX.xy, c.xy), dot(shaderUniforms.inverseY.xy, c.xy)), c.z));
  let d = normalize(X - C);
  if (dot(n, d) > 0.0) { n = -n; }
  return Surface(X, d, n);
}
fn fresnel(d: vec3<f32>, n: vec3<f32>) -> f32 {
  let ior = shaderUniforms.g0.x;
  let f0 = ((ior - 1.0) / (ior + 1.0)) * ((ior - 1.0) / (ior + 1.0));
  return f0 + (1.0 - f0) * pow(1.0 - clamp(-dot(d, n), 0.0, 1.0), 5.0);
}
fn absorb(length: f32) -> vec3<f32> {
  return exp(-(vec3<f32>(1.0) - shaderUniforms.g1.xyz) * shaderUniforms.g0.z * length);
}
// The radiance along the reflected ray r from the surface point X (2D.6): the studio, the part's stand, or the face.
fn reflected(X: vec3<f32>, r: vec3<f32>, centre: vec4<f32>, standColour: vec3<f32>) -> vec3<f32> {
  if (r.z >= 0.0) { return studio(r); }
  if (centre.w > 0.0) {
    let s = (X.z - centre.z) / -r.z;
    let g = X.xy + r.xy * s;
    if (length(g - centre.xy) <= centre.w) { return standColour * studio(vec3<f32>(r.x, r.y, -r.z)); }
  }
  let hit = X.xy + r.xy * (X.z / -r.z);
  return lin3(capture4(hit).rgb);
}
fn protectedAt(p: vec2<f32>) -> bool {
  let header = guard[0];
  if (header.z > 0.5) { return true; }
  for (var k = 0u; k < u32(header.x); k++) {
    let r = guard[2u + 2u * k];
    if (p.x >= r.x - 2.0 && p.x <= r.z + 2.0 && p.y >= r.y - 2.0 && p.y <= r.w + 2.0) { return true; }
  }
  return false;
}
// A window's finish zone (2D.6): the band and the horizon at p, from the window's caster rect and finish amounts.
fn finishZone(p: vec2<f32>, rect: vec4<f32>, amounts: vec4<f32>) -> vec2<f32> {
  if (amounts.z < 0.5) { return vec2<f32>(0.0); }
  let v = (p.y - rect.y) / rect.w;
  let u = select((rect.x + rect.z - p.x) / rect.z, (p.x - rect.x) / rect.z, shaderUniforms.g4.x < 0.0);
  let band = amounts.x * ss(0.03, 0.06, v) * (1.0 - ss(0.06, 0.26, v)) * (1.25 - 0.6 * u);
  let horizon = amounts.y * (ss(0.25, 0.27, v) - ss(0.28, 0.31, v));
  return vec2<f32>(band, horizon);
}
// Whether a window pixel is the capture texel itself: inside the protected rects grown by 2 px, or flat outside its finish zone.
fn windowExact(s: Surface, p: vec2<f32>, slot: u32) -> bool {
  if (protectedAt(p)) { return true; }
  let zone = finishZone(p, glasses[slot * 4u + 2u], glasses[slot * 4u + 3u]);
  return s.n.z >= 0.99999 && zone.x <= 0.0 && zone.y <= 0.0 && glows[slot].a <= 0.0;
}
struct Path { read: vec2<f32>, len: f32, zero: f32 };
fn lensPath(s: Surface, b: f32, eta: f32) -> Path {
  let t1 = refract(s.d, s.n, 1.0 / eta);
  let len = (s.X.z - b) / max(-t1.z, 1e-3);
  let q = s.X + len * t1;
  let t2 = refract(t1, vec3<f32>(0.0, 0.0, 1.0), eta);
  let zero = t2.x == 0.0 && t2.y == 0.0 && t2.z == 0.0;
  let k = b / max(-t2.z, 1e-3);
  return Path(q.xy + t2.xy * k, len, select(0.0, 1.0, zero));
}
fn lens(s: Surface, slot: u32, glow: vec4<f32>) -> vec4<f32> {
  let centre = glasses[slot * 4u];
  let standColour = glasses[slot * 4u + 1u].rgb;
  let ior = shaderUniforms.g0.x;
  let spread = shaderUniforms.g0.y;
  let pr = lensPath(s, centre.z, ior - spread);
  let pg = lensPath(s, centre.z, ior);
  let pb = lensPath(s, centre.z, ior + spread);
  let internal = pg.zero > 0.5;
  let cr = capture4(pr.read);
  let cg = capture4(pg.read);
  let cb = capture4(pb.read);
  let f = fresnel(s.d, s.n);
  var T = lin3(vec3<f32>(cr.r, cg.g, cb.b));
  var transmitted = absorb(pg.len);
  var alpha = cg.a;
  if (internal) { T = vec3<f32>(${INTERIOR[0]}, ${INTERIOR[1]}, ${INTERIOR[2]}); transmitted = vec3<f32>(1.0); alpha = 1.0; }
  let R = reflected(s.X, reflect(s.d, s.n), centre, standColour);
  var value = (1.0 - f) * T * transmitted + f * shaderUniforms.g1.w * shaderUniforms.g0.w * R;
  // A lit lens glows through its glass (core work item 4): the glow colour inside it.
  if (glow.a > 0.0) { value += lin3(glow.rgb); alpha = 1.0; }
  alpha = mix(alpha, 1.0, f);
  return vec4<f32>(enc3(value) * alpha, alpha);
}
fn shiftOf(d: vec3<f32>, normal: vec3<f32>, eta: f32, z: f32) -> vec2<f32> {
  let t = refract(d, normal, eta);
  return t.xy * (z / max(-t.z, 0.15));
}
fn windowShade(s: Surface, p: vec2<f32>, slot: u32, glow: vec4<f32>) -> vec4<f32> {
  let centre = glasses[slot * 4u];
  let standColour = glasses[slot * 4u + 1u].rgb;
  let ior = shaderUniforms.g0.x;
  let spread = shaderUniforms.g0.y;
  let flat = vec3<f32>(0.0, 0.0, 1.0);
  let z = s.X.z;
  let er = 1.0 / (ior - spread);
  let eg = 1.0 / ior;
  let eb = 1.0 / (ior + spread);
  let cr = capture4(p + shiftOf(s.d, s.n, er, z) - shiftOf(s.d, flat, er, z));
  let cg = capture4(p + shiftOf(s.d, s.n, eg, z) - shiftOf(s.d, flat, eg, z));
  let cb = capture4(p + shiftOf(s.d, s.n, eb, z) - shiftOf(s.d, flat, eb, z));
  let T = lin3(vec3<f32>(cr.r, cg.g, cb.b));
  let f = max(fresnel(s.d, s.n) - fresnel(s.d, flat), 0.0);
  let transmitted = absorb(12.0 * (1.0 - s.n.z));
  let R = reflected(s.X, reflect(s.d, s.n), centre, standColour);
  var value = mix(T * transmitted, shaderUniforms.g1.w * shaderUniforms.g0.w * R, f);
  let zone = finishZone(p, glasses[slot * 4u + 2u], glasses[slot * 4u + 3u]);
  value = value * (1.0 - zone.y) + vec3<f32>(0.86, 0.9, 0.95) * zone.x;
  var alpha = mix(cg.a, 1.0, f);
  if (glow.a > 0.0) { value += lin3(glow.rgb); alpha = 1.0; }
  return vec4<f32>(enc3(value) * alpha, alpha);
}
${entry === "main" ? /* wgsl */ `
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let p = layerLocal(input.position.xy);
  if (!insideClip(p)) { discard; }
  let s = surfaceOf(input);
  let glow = glows[input.slot];
  if (shaderUniforms.g3.w > 0.5) { return lens(s, input.slot, glow); }
  if (windowExact(s, p, input.slot)) {
    let plain = capture4(p);
    return vec4<f32>(plain.rgb * plain.a, plain.a);
  }
  return windowShade(s, p, input.slot, glow);
}` : /* wgsl */ `
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let p = layerLocal(input.position.xy);
  if (!insideClip(p)) { discard; }
  let s = surfaceOf(input);
  if (!windowExact(s, p, input.slot)) { discard; }
  return capture4(p);
}`}`;
}
const vertexOutputWGSL = /* wgsl */ `struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) @interpolate(flat) slot: u32,
  @location(1) world: vec3<f32>,
  @location(2) normal: vec3<f32>,
};`;
