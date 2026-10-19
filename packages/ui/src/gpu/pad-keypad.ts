/**
 * The Pad and the Keypad in the GPU helper's scene (anatomy pages `pad.md`, `keypad.md`): the parts of both read from the page, at every
 * level. A lit pad's light is an emitter (`collectPads`, before the faces are walked, so the emitters' order is the pads' order in the
 * document and never depends on the state); at the Relief and Objects levels each cap and a keypad's plinth is a scene entry
 * (`pad-forms.ts`); at the Instrument level the helper draws a pad as a glass rim, a body and a captured cap, a keypad as a polished
 * plinth and a body with a captured cap per key (`instrument-pad.ts`), the cap on the CSS throw (`--strata-push-t`, `spring.button`), and
 * the parts of the page that those objects replace are claimed here (their CSS paint is hidden, and their Relief primitives are not
 * written). A press is a uniform write, not a capture: the numbers are read frame by frame as the CSS transitions have them.
 * The helper's own state reader knows the push buttons' parts; these parts read their control's state here.
 */
import type { SceneEntry, SceneState } from "../tokens/scene.ts";
import type { LampEmitter } from "../shared/lamp.ts";
import { padEmitter, padEmitterDefaults, padPosition, type PadEmitterTokens } from "../shared/pad.ts";
import { padFormEntries } from "./pad-forms.ts";
import { keyObject, keypadHeight, keypadPlinthHeight, keypadPlinthObject, padHeight, padMaterials, padMaterialsOf, padObject } from "./instrument-pad.ts";
import type { InstrumentObject, InstrumentProfile, InstrumentRecipe } from "./instrument.ts";

type Box = [number, number, number, number];

/** What the helper's own functions give this module. */
export interface PadHelpers {
  hex(value: string): string;
  reader(element: Element): { number(path: string, fallback?: number): number };
  rectWithin(element: Element, panel: HTMLElement): Box;
  radiusOf(element: Element, width: number): number;
}

/** The lamp info a lit pad adds to the panel's lights (the helper's `LampInfo`, which this is structurally). */
export interface PadLight {
  kind: "lamp" | "led";
  role: string;
  lit: number;
  lens: number;
  index: number;
  box: Box;
  control: HTMLElement;
  feather: number;
}

/** A visible pad now: its role colour and its emitter's place in the scene's `emitters`. */
interface PadInfo { role: string; emitter: number }
/** The pads and keys of a panel that its Instrument scene draws as objects, collected as the face is walked. */
interface Claims { pads: Map<HTMLElement, PadInfo>; instrumentPads: Set<HTMLElement>; keys: Set<HTMLElement>; plinths: Set<HTMLElement> }
const claims = new WeakMap<HTMLElement, Claims>();

/** The parts' control state, from the native button (parts never take focus). */
function stateOf(root: Element): SceneState & { pressed: boolean; hover: boolean; disabled: boolean } {
  const preview = (root.getAttribute("data-strata-preview") ?? "").split(/\s+/);
  return {
    hover: root.matches(":hover") || preview.includes("hover"),
    pressed: root.matches(":active:not([data-strata-down='false']), [aria-pressed='true'], [data-strata-down='true']") || preview.includes("active"),
    disabled: root.matches(":disabled, [aria-disabled='true']"),
  };
}

/** A registered 0–1 number as the page has it now (`--strata-lit`, `--strata-push-t`); `fallback` where it is not set. */
function numberOf(style: CSSStyleDeclaration, name: string, fallback: number): number {
  const read = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(read) ? Math.min(1, Math.max(0, read)) : fallback;
}

/**
 * Starts a panel's claims over and adds every visible pad's emitter (and its `lamps` entry, so the panel takes the lights, their outset
 * and their feather as a lamp's), lit by the `--strata-lit` the stylesheet has it now: held or latched. More contrast turns the light off.
 */
export function collectPads(panel: HTMLElement, context: { emitters: LampEmitter[]; lamps: Map<HTMLElement, PadLight>; max: number; moreContrast: boolean; guardFeather: number; helpers: PadHelpers }): Claims {
  const mine: Claims = { pads: new Map(), instrumentPads: new Set(), keys: new Set(), plinths: new Set() };
  claims.set(panel, mine);
  const { helpers, emitters } = context;
  for (const root of panel.querySelectorAll<HTMLElement>("button.ug-pad")) {
    const cap = root.querySelector<HTMLElement>(".ug-pad__cap"), glow = root.querySelector<HTMLElement>(".ug-pad__glow");
    if (!cap || !glow || emitters.length >= context.max || !root.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    const capBox = helpers.rectWithin(cap, panel), side = Math.min(capBox[2], capBox[3]);
    if (side <= 0) continue;
    const style = getComputedStyle(root), tokens = helpers.reader(root), lit = numberOf(style, "--strata-lit", 0);
    const role = helpers.hex(style.getPropertyValue("--_c").trim() || "#ff9228");
    const own: PadEmitterTokens = { radius: tokens.number("emitter.pad.radius", padEmitterDefaults.radius), height: tokens.number("emitter.pad.height", padEmitterDefaults.height),
      strength: tokens.number("emitter.pad.strength", padEmitterDefaults.strength) };
    mine.pads.set(root, { role, emitter: emitters.length });
    context.lamps.set(root, { kind: "lamp", role, lit, lens: side, index: emitters.length, box: helpers.rectWithin(root, panel), control: root, feather: tokens.number("emitter.guardFeather", context.guardFeather) });
    emitters.push(padEmitter([capBox[0] + capBox[2] / 2, capBox[1] + capBox[3] / 2], side, context.moreContrast ? 0 : lit, role, own));
  }
  return mine;
}

/** What the helper gives the pad and keypad entries for one element. */
export interface PadEntriesContext {
  /** The element is at the Objects level (or above), in a layer that is not Instrument. */
  objects: boolean;
  base: number;
  rect: Box;
  helpers: PadHelpers;
  material(element: Element, face: "raised"): string;
  knob: string;
  light: { azimuth: number; elevation: number };
  hoverHeight: number;
  keyTravel: number;
}

/**
 * The scene entries for one element of a pad or a keypad at Relief and Objects, or undefined when `element` is not a part of either (the
 * helper then handles it as usual).
 */
export function padKeypadEntries(element: Element, panel: HTMLElement, context: PadEntriesContext): SceneEntry[] | undefined {
  const owner = element.matches(".ug-pad__cap") ? element.closest("button.ug-pad") : element.matches(".ug-keypad__cap") ? element.closest("button.ug-keypad__key")
    : element.matches(".ug-keypad__plinth") ? element.closest("fieldset.ug-keypad") : null;
  if (!owner) return undefined;
  const plinth = element.matches(".ug-keypad__plinth");
  return padFormEntries(element, { rect: context.rect, state: plinth ? {} : stateOf(owner), objects: context.objects, base: context.base, box: context.helpers.rectWithin(owner, panel),
    radius: context.helpers.radiusOf(element, context.rect[2]), material: context.material, knob: context.knob, light: context.light, hoverHeight: context.hoverHeight, keyTravel: context.keyTravel });
}

/**
 * At the Instrument level, claims `element` if it is a part the pad or keypad objects replace: the cap of a pad or of a key, and a
 * keypad's plinth. Their CSS paint is hidden (`domes`) while the objects are drawn; a pad's glow goes with its cap.
 */
export function claimPadKeypad(element: Element, panel: HTMLElement, domes?: Set<Element>): boolean {
  const mine = claims.get(panel);
  if (!mine) return false;
  if (element.matches(".ug-pad__cap")) {
    const root = element.closest<HTMLElement>("button.ug-pad");
    if (!root || !mine.pads.has(root)) return false;
    mine.instrumentPads.add(root);
    domes?.add(root);
    const glow = root.querySelector(".ug-pad__glow");
    if (glow) domes?.add(glow);
    return true;
  }
  if (element.matches(".ug-keypad__cap")) {
    const root = element.closest<HTMLElement>("button.ug-keypad__key");
    if (!root) return false;
    mine.keys.add(root);
    domes?.add(root);
    return true;
  }
  if (element.matches(".ug-keypad__plinth")) {
    mine.plinths.add(element as HTMLElement);
    domes?.add(element);
    return true;
  }
  return false;
}

/** What the helper gives the Instrument objects of the pads and keypads of a panel. */
export interface PadObjectsContext {
  scale: number;
  light: { azimuth: number; elevation: number };
  raised: number;
  opaque: boolean;
  profile: (name: string, shape: InstrumentProfile) => string;
  materials: Record<string, InstrumentRecipe>;
  /** The scene's material layers by name (the helper's, for the face colour's roughness and coat) and the name `materialFor` gives an element's face. */
  layers: Record<string, { base?: { roughness?: number; metallic?: number }; coat?: Record<string, number> }>;
  materialFor(element: Element, face: "raised"): string;
  use(name: string): string;
  idOf(element: Element, prefix: string): string;
  /** Whether the scene has room for another object (core's budget). */
  room(): boolean;
  helpers: PadHelpers;
  domes?: Set<Element>;
  /** Pushed where an object cannot be drawn (no room for its material): the Relief primitive instead. */
  entries: SceneEntry[];
}

/** The Instrument objects of a panel's claimed pads and keypads, and the tallest point of their parts. */
export function padKeypadObjects(panel: HTMLElement, context: PadObjectsContext): { objects: InstrumentObject[]; tallest: number } {
  const mine = claims.get(panel), objects: InstrumentObject[] = [];
  let tallest = 0;
  if (!mine) return { objects, tallest };
  const { helpers, scale, light } = context;
  const bodyOf = (cap: HTMLElement, owner: HTMLElement, box: Box, radius: number): string | undefined => {
    const colour = helpers.hex(getComputedStyle(cap).backgroundColor), name = `key ${colour}`;
    if (!context.materials[name] && Object.keys(context.materials).length >= 12) {
      context.entries.push({ face: "raised", rect: box, radius, height: context.raised, material: context.materialFor(cap, "raised"), state: stateOf(owner) } as SceneEntry);
      return undefined;
    }
    const layers = context.layers[context.materialFor(cap, "raised")];
    context.materials[name] ??= { base: { colour, roughness: layers?.base?.roughness ?? 0.45, metallic: layers?.base?.metallic ?? 0 }, coat: { ...layers?.coat } };
    return name;
  };
  // A keypad's plinths first, then its keys: the group's native box holds the plinth and its shadow.
  for (const plinth of mine.plinths) {
    const group = plinth.closest<HTMLElement>("fieldset") ?? plinth, box = helpers.rectWithin(group, panel), at = helpers.rectWithin(plinth, panel);
    if (at[2] <= 0 || at[3] <= 0 || !context.room()) continue;
    context.materials.pushBezel ??= padMaterials.pushBezel;
    objects.push(keypadPlinthObject({ id: context.idOf(group, "keypad"), box, plinth: at, radius: helpers.radiusOf(plinth, at[2]), scale, state: { hover: false, pressed: false, disabled: false }, light,
      relief: { height: context.raised, material: context.use("keyCap") } }, context.profile) as unknown as InstrumentObject);
    tallest = Math.max(tallest, keypadHeight(scale));
  }
  for (const root of mine.keys) {
    const cap = root.querySelector<HTMLElement>(".ug-keypad__cap"), box = helpers.rectWithin(root, panel);
    if (!cap || box[2] <= 0 || box[3] <= 0 || !context.room()) continue;
    const capBox = helpers.rectWithin(cap, panel), radius = helpers.radiusOf(root, box[2]), state = stateOf(root);
    const material = bodyOf(cap, root, box, radius);
    if (!material) continue;
    const disabled = state.disabled, read = Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-push-t"));
    const t = disabled ? 0 : Number.isFinite(read) ? read : padPosition({ held: root.matches(":active:not([data-strata-down='false']), [data-strata-down='true']"), latched: false, disabled });
    objects.push(keyObject({ id: context.idOf(root, "key"), box, cap: capBox, radii: { box: radius, cap: helpers.radiusOf(cap, capBox[2]) }, base: root.closest(".ug-keypad__plinth") ? keypadPlinthHeight(scale) : 0, scale, t,
      material, state, light, relief: { height: context.raised, material: context.use("keyCap") } }, context.profile) as unknown as InstrumentObject);
    tallest = Math.max(tallest, keypadHeight(scale));
  }
  for (const root of mine.instrumentPads) {
    const info = mine.pads.get(root), cap = root.querySelector<HTMLElement>(".ug-pad__cap"), glow = root.querySelector<HTMLElement>(".ug-pad__glow"), box = helpers.rectWithin(root, panel);
    if (!info || !cap || !glow || box[2] <= 0 || box[3] <= 0 || !context.room()) continue;
    const capBox = helpers.rectWithin(cap, panel), glowBox = helpers.rectWithin(glow, panel), radius = helpers.radiusOf(root, box[2]), state = stateOf(root);
    const material = bodyOf(cap, root, box, radius);
    if (!material) continue;
    // The throw's position as the CSS transition has it this frame, the same number the Relief and Objects levels follow.
    const read = Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-push-t"));
    const t = state.disabled ? 0 : Number.isFinite(read) ? read : padPosition({ held: root.matches(":active:not([data-strata-down='false']), [data-strata-down='true']"), latched: root.getAttribute("aria-pressed") === "true", disabled: false });
    const input = { id: context.idOf(root, "pad"), box, glow: glowBox, cap: capBox, radii: { box: radius, glow: helpers.radiusOf(glow, glowBox[2]), cap: helpers.radiusOf(cap, capBox[2]) }, scale,
      role: info.role, emitter: info.emitter, t, material, opaque: context.opaque, state, light, relief: { height: context.raised, material: context.use("keyCap") } };
    objects.push(padObject(input, context.profile) as unknown as InstrumentObject);
    Object.assign(context.materials, padMaterialsOf(input));
    tallest = Math.max(tallest, padHeight(scale));
  }
  return { objects, tallest };
}
