/**
 * Per-pixel shader effects for decorative layers: the public descriptor and handle types,
 * `defineEffect` for trusted application WGSL, whole-chain validation used by
 * `controller.setEffects`, and packing of a chain into the per-layer uniform block that
 * `composition.ts` writes and its shader reads. Effects never touch native capture or hit
 * geometry; ordinary DOM shows the layer's static original content instead.
 */
import { validateReliefScene, type ReliefScene } from "./relief.js";
import { validateStageScene, type StageScene } from "./stage.js";
import { validateInstrumentScene, type InstrumentScene } from "./instrument.js";
import { validateEmitters, type SceneEmitter } from "./emitters.js";

/** Effect clock: `seconds` is the effect time (0..1e6) and `playing` whether it advances each frame. */
export interface EffectTime { seconds: number; playing?: boolean }
/**
 * Fields every effect descriptor states explicitly: the effect stays inside the layer, applies
 * only to decorative content, leaves media as is and falls back to the static original in DOM.
 */
interface EffectPolicy {
  bounds: "layer";
  /**
   * "decorative": the layer is decorative enrollment (inert, aria-hidden, no controls).
   * "inert": any enrolled layer in a transition; the runtime makes its content inert while
   * the effect runs, so displaced pixels never meet a live control.
   */
  interaction: "decorative" | "inert";
  media: "identity";
  fallback: "static";
  time: EffectTime;
}
/** Inclusive numeric range for one custom-effect parameter. */
export interface ParameterRange { min: number; max: number }
/**
 * A trusted application color effect created by `defineEffect`. `wgsl` is the body of
 * `fn(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f`:
 * `color` is the layer's straight-alpha pixel, `local` its position and `extent` the layer size
 * in CSS pixels, and `parameters` holds the values in declaration order. It may change color and
 * alpha but not geometry. Never build `wgsl` from user input.
 */
export interface ApplicationEffect<P extends string = string> {
  /** 1..48 characters of lowercase letters, digits and hyphens, starting with a letter. */
  readonly name: string;
  /** 1..4 named parameters with their allowed ranges; order sets their `parameters` slot. */
  readonly parameters: Readonly<Record<P, ParameterRange>>;
  readonly geometry: "color";
  readonly bounds: "layer";
  readonly capabilities: readonly ["webgpu"];
  /** WGSL function body, at most 4096 characters. */
  readonly wgsl: string;
}
/**
 * One operation in a decorative layer's effect chain (1..3 operations, each kind once, sampling
 * effects `ripple`/`chromatic` before color effects `dissolve`/`custom`). Parameter ranges:
 * ripple `amplitude` 0..12 px, chromatic `displacement` 0..12 px, dissolve `amount` 0..1 and
 * `speed` 0..4; custom parameters use their definition's ranges.
 */
export type EffectDescriptor =
  | (EffectPolicy & { kind: "ripple"; parameters: { amplitude: number } })
  | (EffectPolicy & { kind: "chromatic"; parameters: { displacement: number } })
  | (EffectPolicy & { kind: "dissolve"; parameters: { amount: number; speed: number } })
  | (EffectPolicy & { kind: "custom"; definition: ApplicationEffect; parameters: Record<string, number> });
/**
 * How an effect chain ended: `cancelled` by its handle or by `setRipple`, `replaced` by a later `setEffects` on
 * the same layer, `disposed` by its handle, the runtime or release of the enrollment, or `fallback` when the surface
 * returned to ordinary DOM.
 */
export interface EffectResult { status: "cancelled" | "replaced" | "disposed" | "fallback"; reason: string }
/**
 * Handle for an active effect chain returned by `setEffects`. `seek`, `play` and `pause` apply
 * to every operation in the chain and never recompile; they throw once the chain has ended.
 */
export interface EffectHandle {
  /** Settles once, when the chain stops being active. */
  readonly finished: Promise<EffectResult>;
  state(): { active: boolean; effects: EffectDescriptor[] };
  /** Sets the effect time in seconds (0..1e6). */
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  /** Replaces each operation's parameters (same schema, same order) without recompiling. */
  update(parameters: readonly Record<string, number>[]): void;
  cancel(): void;
  dispose(): void;
}
// Definitions returned by `defineEffect`; custom descriptors must reference one of these, so an
// unvalidated or mutated look-alike object cannot reach the shader generator.
const definitions = new WeakSet<ApplicationEffect>();
/** Returns `value` when it is finite and within `min..max`; otherwise throws an error naming `name`. */
export function effectNumber(value: number, min: number, max: number, name: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} requires ${min}..${max}`);
  return value;
}
/**
 * Validates and freezes a trusted application color effect for use as a `custom` effect.
 * Checks the name, the declared policy fields, 1..4 bounded parameter ranges and a non-empty
 * WGSL body of at most 4096 characters; it does not compile the WGSL. Compilation happens on
 * the device when the effect is first applied, and a compile error returns the surface to
 * ordinary DOM with the compiler message as the reason.
 */
export function defineEffect<P extends string>(definition: ApplicationEffect<P>): ApplicationEffect<P> {
  if (!definition || !/^[a-z][a-z0-9-]{0,47}$/.test(definition.name)
    || definition.geometry !== "color" || definition.bounds !== "layer"
    || definition.capabilities.length !== 1 || definition.capabilities[0] !== "webgpu"
    || typeof definition.wgsl !== "string" || !definition.wgsl.trim() || definition.wgsl.length > 4096) {
    throw new Error("Application effect requires a named bounded trusted WGSL color function and WebGPU");
  }
  const entries = Object.entries<ParameterRange>(definition.parameters);
  if (!entries.length || entries.length > 4) throw new Error("Application effect requires 1..4 numeric parameters");
  for (const [name, range] of entries) {
    if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(name) || !Number.isFinite(range.min) || !Number.isFinite(range.max)
      || range.min > range.max || Math.max(Math.abs(range.min), Math.abs(range.max)) > 1e6) throw new Error("Invalid application effect parameter range");
  }
  // Deep-copy and freeze, so later changes to the caller's object cannot alter a registered definition.
  const parameters = Object.fromEntries(entries.map(([name, range]) => [name, Object.freeze({ ...range })])) as Record<P, ParameterRange>;
  const result = Object.freeze({ ...definition, parameters: Object.freeze(parameters), capabilities: Object.freeze(["webgpu"] as const) });
  definitions.add(result);
  return result;
}
/**
 * Validates a whole effect chain and returns normalized copies (parameters in schema order,
 * `playing` defaulted to false). Throws on the first problem, so an invalid chain changes
 * nothing. The runtime mutates the returned copies' `time` as the effect clock runs.
 */
export function validateEffects(values: readonly EffectDescriptor[]): EffectDescriptor[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 3) throw new Error("Effect chain requires 1..3 operations in declared order");
  const kinds = new Set<string>();
  let colorOnly = false;
  const interaction = values[0]?.interaction;
  return values.map(value => {
    if (!value || value.bounds !== "layer" || !["decorative", "inert"].includes(value.interaction) || value.media !== "identity"
      || value.fallback !== "static" || !value.time || !value.parameters) throw new Error("Effects require layer bounds, decorative or inert interaction, identity media and static DOM fallback");
    if (value.interaction !== interaction) throw new Error("Effect chain operations must share one interaction");
    if (kinds.has(value.kind)) throw new Error("Effect kinds may occur only once per chain");
    kinds.add(value.kind);
    // The shader resolves all sampling displacements before it samples the texture, then applies
    // color/alpha operations to that sample, so declared order must match.
    if (value.kind === "custom" || value.kind === "dissolve") colorOnly = true;
    else if (colorOnly) throw new Error("Sampling effects must precede color/alpha effects");
    const seconds = effectNumber(value.time.seconds, 0, 1e6, "Effect seconds");
    if (value.time.playing !== undefined && typeof value.time.playing !== "boolean") throw new Error("Effect playback must be boolean");
    let parameters: Record<string, number>;
    let names: string[];
    switch (value.kind) {
      case "ripple": names = ["amplitude"]; parameters = { amplitude: effectNumber(value.parameters.amplitude, 0, 12, "Ripple amplitude") }; break;
      case "chromatic": names = ["displacement"]; parameters = { displacement: effectNumber(value.parameters.displacement, 0, 12, "Chromatic displacement") }; break;
      case "dissolve": names = ["amount", "speed"]; parameters = { amount: effectNumber(value.parameters.amount, 0, 1, "Dissolve amount"), speed: effectNumber(value.parameters.speed, 0, 4, "Dissolve speed") }; break;
      case "custom":
        if (!definitions.has(value.definition)) throw new Error("Custom effects must come from defineEffect");
        names = Object.keys(value.definition.parameters);
        parameters = Object.fromEntries(names.map(name => [name, effectNumber(value.parameters[name]!, value.definition.parameters[name]!.min, value.definition.parameters[name]!.max, name)]));
        break;
      default: throw new Error("Unsupported effect kind");
    }
    if (Object.keys(value.parameters).length !== names.length || Object.keys(value.parameters).some(name => !names.includes(name))) throw new Error("Effect parameter keys must match the declared schema exactly");
    return { ...value, parameters, time: { seconds, playing: value.time.playing ?? false } } as EffectDescriptor;
  });
}
/**
 * Packs up to three effects into the 24 floats (six vec4s) of a layer's uniform block. Each
 * operation takes two vec4s: control `(kind code, seconds, 0, 0)` with codes ripple 1,
 * chromatic 2, dissolve 3, custom 4 (0 is an empty slot), then up to four parameters,
 * zero-padded. An empty chain yields all zeros, which the shader treats as no effect.
 */
export function effectUniforms(values: readonly EffectDescriptor[] = []) {
  const result = new Float32Array(24);
  values.forEach((value, index) => {
    // Custom parameters follow the definition's declared order, not the descriptor's key order.
    // Seconds wrap at 1000 so the f32 uniform keeps sub-frame resolution in long sessions.
    const parameters = value.kind === "custom" ? Object.keys(value.definition.parameters).map(name => value.parameters[name]!) : Object.values(value.parameters);
    result.set([{ ripple: 1, chromatic: 2, dissolve: 3, custom: 4 }[value.kind], value.time.seconds % 1000, 0, 0,
      ...parameters, ...Array(4 - parameters.length).fill(0)], index * 8);
  });
  return result;
}
/**
 * A persistent material on an enrolled layer, interactive or decorative. A material changes how the layer's
 * pixels are lit and never moves them, so the layer's content stays fully interactive. Inside the layer the
 * runtime keeps any change to one brightness factor per point within `interior.max`, the same for text and the
 * face around it, so no material can break text contrast (Strata Rendering Model, section 2.9).
 *
 * - `custom` evaluates the definition's WGSL on a neutral mid-grey input and takes the ratio of its luma to the
 *   input's as the factor; the captured colour itself never reaches it. The whole layer is guarded.
 * - `relief` is core's built-in implementation of the Strata Rendering Model: it shades the scene's relief
 *   primitives (bevels, wells, finishes, shadows, focus edges, ring arcs), guarding face interiors as section 2.9
 *   of the model defines. Its look is data; it needs no WGSL from the application.
 * - `objects` is the same material at the Objects level (the model's version 2): a scene whose back-to-front list also
 *   holds objects (keys, slabs, wells, knobs...), seen through its camera. Objects never take hits: one that would
 *   draw outside its control is drawn at the Relief level, and `state().materials` reports it.
 * - `stage` draws a stage scene (version 3) on a decorative layer: a lit backdrop and particles around the UI.
 * - `instrument` is the Instrument level (version 4, part 2D): the face is shaded as `relief`, and each object is built
 *   from parametric parts drawn as Babylon Lite meshes right after the layer, posed by native state. Parts never take
 *   hits: an object that would draw outside its bounds is drawn as its Relief primitive, and `state().materials`
 *   reports it (`docs/ui-library/instrument-phase2.md`).
 */
export type MaterialDescriptor = CustomMaterial | ReliefMaterial | ObjectsMaterial | StageMaterial | InstrumentMaterial;
/**
 * A material whose look is a Strata scene: `relief` (version 1), `objects` (versions 2 and 3), `stage` (version 3) or
 * `instrument` (version 4).
 */
export type SceneMaterial = ReliefMaterial | ObjectsMaterial | StageMaterial | InstrumentMaterial;
export const isSceneMaterial = (value: MaterialDescriptor | undefined): value is SceneMaterial =>
  value?.kind === "relief" || value?.kind === "objects" || value?.kind === "stage" || value?.kind === "instrument";
/** Fields every material declares: it stays in the layer, relights pixels in place, and DOM shows the original. */
interface MaterialPolicy {
  bounds: "layer";
  interaction: "material";
  media: "identity";
  fallback: "static";
}
/** A trusted application colour function, held to one brightness factor. */
export interface CustomMaterial extends MaterialPolicy {
  kind: "custom";
  definition: ApplicationEffect;
  parameters: Record<string, number>;
  /** The largest brightness change on the layer's interior: 0..0.1 (Strata's `interior.max`). */
  interior: { max: number };
}
/**
 * The built-in relief material: a Strata scene, version 1, or version 4 with emitters and protected text
 * (`docs/ui-library/rendering-model.md`).
 */
export interface ReliefMaterial extends MaterialPolicy {
  kind: "relief";
  scene: ReliefScene;
}
/** The built-in objects material: a Strata scene, version 2 or 3, or 4 with a camera, with objects (`docs/ui-library/rendering-model.md`, 2B). */
export interface ObjectsMaterial extends MaterialPolicy {
  kind: "objects";
  scene: ReliefScene;
}
/** The built-in stage material: a stage scene, version 3 (`docs/ui-library/rendering-model.md`, 2C), for decorative layers. */
export interface StageMaterial extends MaterialPolicy {
  kind: "stage";
  scene: StageScene;
}
/** The built-in instrument material: a Strata scene, version 4 with `kind: "instrument"` (`docs/ui-library/rendering-model.md`, 2D). */
export interface InstrumentMaterial extends MaterialPolicy {
  kind: "instrument";
  scene: InstrumentScene;
}
/**
 * Handle for a layer's material, returned by `setMaterial`. A material persists across DOM and GPU presentation
 * (ordinary DOM shows the original), and ends only when cancelled, disposed, replaced by a later `setMaterial`
 * on the same layer, or when its layer or the runtime is released.
 */
export interface MaterialHandle {
  /** Settles once, when the material stops applying. */
  readonly finished: Promise<EffectResult>;
  state(): { active: boolean; material: MaterialDescriptor };
  /**
   * Changes the material without recompiling: a custom material's parameters (same schema), or a relief
   * material's whole scene (states, rectangles, primitives added or removed). An instrument scene's poses, states and
   * layout update in place; new part kinds rebuild its mesh scene while the layer draws its objects at Relief.
   */
  update(change: Record<string, number> | ReliefScene | StageScene | InstrumentScene): void;
  /**
   * Replaces the emitters of a version 4 scene (`relief`, `objects` or `instrument`), the cheap path for a light that
   * moves every frame (the pointer light, a lamp turning on): only the list is validated, nothing else of the scene is
   * repacked or rebuilt, and the next frame writes the light's uniforms with no capture, upload or hit-geometry change.
   * A scene without an `emitters` field gets one through `update` instead (for an Instrument scene, one rebuild of its
   * mesh scene, for the parts' clustered lights). Throws for other materials, a list that is not valid, or one shorter
   * than a part's `emitter` index.
   */
  setEmitters(emitters: readonly SceneEmitter[]): void;
  cancel(): void;
  dispose(): void;
}
/**
 * Validates `emitters` for `value` and returns the material with them: in place (the same scene object, so every cache
 * keyed on it stays valid) when the scene already has an `emitters` field, else as a newly validated material.
 */
export function withEmitters(value: MaterialDescriptor, emitters: readonly SceneEmitter[]): MaterialDescriptor {
  if (!isSceneMaterial(value) || value.kind === "stage" || value.scene.version !== 4) throw new Error("setEmitters requires a version 4 relief, objects or instrument scene");
  const list = validateEmitters(emitters, value.kind === "instrument" ? "Instrument scene" : "Relief scene");
  if (value.kind === "instrument") {
    for (const [index, object] of value.scene.objects.entries()) for (const [at, part] of object.parts.entries()) {
      if (part.emitter !== undefined && part.emitter >= list.length) throw new Error(`Instrument scene objects[${index}].parts[${at}].emitter requires an index into emitters`);
    }
  }
  if (value.scene.emitters === undefined) return validateMaterial({ ...value, scene: { ...value.scene, emitters: list } } as MaterialDescriptor);
  (value.scene as { emitters?: SceneEmitter[] }).emitters = list;
  return value;
}
/** The hard ceiling on a material's interior change, matching the Strata token's validated range. */
export const MATERIAL_INTERIOR_CEILING = 0.1;
/** Validates a material and returns a normalized copy (parameters in schema order). Throws on the first problem. */
export function validateMaterial(value: MaterialDescriptor): MaterialDescriptor {
  if (!value || value.bounds !== "layer" || value.interaction !== "material" || value.media !== "identity" || value.fallback !== "static") {
    throw new Error("Materials require layer bounds, material interaction, identity media and static DOM fallback");
  }
  if (value.kind === "relief") return { ...value, scene: validateReliefScene(value.scene) };
  if (value.kind === "objects") return { ...value, scene: validateReliefScene(value.scene, "objects") };
  if (value.kind === "stage") return { ...value, scene: validateStageScene(value.scene) };
  if (value.kind === "instrument") return { ...value, scene: validateInstrumentScene(value.scene) };
  if (value.kind !== "custom") throw new Error("Unsupported material kind");
  if (!value.parameters || !value.interior) throw new Error("Custom materials require parameters and an interior budget");
  if (!definitions.has(value.definition)) throw new Error("Custom materials must come from defineEffect");
  const names = Object.keys(value.definition.parameters);
  if (Object.keys(value.parameters).length !== names.length || Object.keys(value.parameters).some(name => !names.includes(name))) throw new Error("Material parameter keys must match the declared schema exactly");
  const parameters = Object.fromEntries(names.map(name => [name, effectNumber(value.parameters[name]!, value.definition.parameters[name]!.min, value.definition.parameters[name]!.max, name)]));
  const max = effectNumber(value.interior.max, 0, MATERIAL_INTERIOR_CEILING, "Material interior.max");
  return { ...value, parameters, interior: { max } };
}
/**
 * Packs a material into the 8 floats (two vec4s) of a layer's uniform block: control `(kind code, interior max,
 * definition slot, 0)` with codes custom 1 and relief or objects 2 (0 is no material), then up to four parameters,
 * zero-padded. `slot` is the index of the material's definition among those the pass was built with, or -1. A
 * relief material's scene goes in its own binding (`reliefUniforms`).
 */
export function materialUniforms(value: MaterialDescriptor | undefined, slot: number) {
  const result = new Float32Array(8);
  if (!value) return result;
  if (value.kind === "stage") { result.set([2, 0, 0, 0]); return result; }
  if (isSceneMaterial(value)) { result.set([2, value.scene.interior.max, 0, 0]); return result; }
  const parameters = Object.keys(value.definition.parameters).map(name => value.parameters[name]!);
  result.set([1, Math.min(value.interior.max, MATERIAL_INTERIOR_CEILING), slot, 0, ...parameters, ...Array(4 - parameters.length).fill(0)]);
  return result;
}
