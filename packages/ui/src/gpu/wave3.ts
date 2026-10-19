/**
 * The JogWheel and the PatchPoint in the GPU helper's scene (anatomy pages `jog-wheel.md`, `patch-point.md`): the parts of both read
 * from the page, at every level. At the Relief and Objects levels each part is a scene entry (`jog-forms.ts`, `patch-forms.ts`); at
 * the Instrument level the helper draws a wheel and a jack as an object of parts (`instrument-jog.ts`, `instrument-patch.ts`), the
 * wheel's dimple turned by its accumulated angle on a spring, the plug seated by the native state on `spring.patch`, and the parts
 * of the page that the object replaces are claimed here (their CSS paint is hidden, and their Relief primitives are not written).
 * A PatchPoint's optional LED is an ordinary StatusLight lens: the helper's lamp wiring draws it, lit while the jack is connected.
 */
import type { SceneEntry, SceneFace, SceneState } from "../tokens/scene.ts";
import { jogWheelFormEntries } from "./jog-forms.ts";
import { patchPointFormEntries } from "./patch-forms.ts";
import { dimpleOf, jogHeight, jogMaterials, jogWheelObject } from "./instrument-jog.ts";
import { patchHeight, patchMaterials, patchPointObject } from "./instrument-patch.ts";
import { followSpring, type FollowContext } from "./instrument-follow.ts";
import { knobSprings, premiumMaterials, type InstrumentObject, type InstrumentProfile, type InstrumentRecipe } from "./instrument.ts";
import { jogDefaults, jogIndex, jogStepAngle } from "../shared/jog-wheel.ts";
import { liveStrataJog } from "../dom/jog-wheel.ts";
import { patchSpring } from "../shared/patch-point.ts";

type Box = [number, number, number, number];

/** The wheels and jacks of a panel that its Instrument scene draws as objects, collected as the face is walked. */
export interface Wave3Claims { jogWheels: Set<HTMLElement>; patchPoints: Set<HTMLElement> }
const claims = new WeakMap<HTMLElement, Wave3Claims>();

/** Starts a panel's claims over: a scene is built from scratch each time. */
export function resetWave3(panel: HTMLElement): Wave3Claims {
  const fresh = { jogWheels: new Set<HTMLElement>(), patchPoints: new Set<HTMLElement>() };
  claims.set(panel, fresh);
  return fresh;
}

/** What the helper gives the wave 3 parts for one element. */
export interface Wave3Context {
  /** The element is at the Instrument level in an Instrument layer: the wheel and the jack are objects of parts. */
  instrument: boolean;
  /** The element is at the Objects level (or above it), in a layer that is not Instrument. */
  objects: boolean;
  /** The height of the surface the control stands on (Objects). */
  base: number;
  rect: Box;
  rectOf(element: Element): Box;
  states(element: Element): SceneState;
  material(element: Element, face: SceneFace): string;
  /** The knob role's material name and the `knob` colour. */
  knob: { material: string; colour: string };
  well: number;
  light: { azimuth: number; elevation: number };
  hoverHeight: number;
  domes?: Set<Element>;
  /** The springs of the Instrument parts and of the dimple at Relief and Objects: the time, reduced motion, the springs kept between scenes and the ones still moving. */
  follow: FollowContext;
}

/**
 * The accumulated angle a wheel stands at (degrees): the one the behaviour keeps while it moves it (`liveStrataJog`), else the root's
 * `--strata-jog-angle`, else the value's step. It is the target of the wheel's spring; nothing here is written to the DOM.
 */
function wheelAngle(root: HTMLElement, input: HTMLInputElement): number {
  const live = liveStrataJog(root);
  if (live !== undefined) return live;
  const style = getComputedStyle(root), read = Number.parseFloat(style.getPropertyValue("--strata-jog-angle"));
  if (Number.isFinite(read)) return read;
  const turn = Number.parseFloat(style.getPropertyValue("--strata-jog-turn")) || jogDefaults.turn, max = Number.parseFloat(input.max);
  return jogIndex(Number(input.value), { min: Number.parseFloat(input.min) || 0, max: Number.isFinite(max) ? max : 100, step: Number.parseFloat(input.step) || 1 }) * jogStepAngle(turn);
}
/** The spring a wheel follows its angle on: the detent spring for a detented wheel, the knob's otherwise. */
const wheelSpring = (root: Element) => (root.matches(".ug-jog-wheel--detented") ? knobSprings.detent : knobSprings.knob);

/** Whether a wheel's input is hovered (or previewed), for its parts; a wheel is one control, whose input covers it. */
function jogState(input: HTMLInputElement): SceneState {
  return { hover: input.matches(":hover") || (input.getAttribute("data-strata-preview") ?? "").split(/\s+/).includes("hover"), disabled: input.disabled };
}

/**
 * The scene entries for one element of a jog wheel or a patch point, an empty list for a part the Instrument object replaces
 * (claimed for `wave3Objects`), or undefined when `element` is not a part of either (the helper then handles it as usual).
 */
export function wave3Entries(element: Element, panel: HTMLElement, context: Wave3Context): SceneEntry[] | undefined {
  const wheel = element.closest<HTMLElement>(".ug-jog-wheel");
  if (wheel && element.matches(".ug-jog-wheel__well, .ug-jog-wheel__wheel, .ug-jog-wheel__dimple")) {
    const input = wheel.querySelector<HTMLInputElement>(".ug-jog-wheel__input");
    if (!input) return undefined;
    if (context.instrument) {
      // The recess stays a well on the face; the wheel and its dimple are the object's.
      if (element.matches(".ug-jog-wheel__well")) return undefined;
      claims.get(panel)?.jogWheels.add(wheel);
      context.domes?.add(element);
      return [];
    }
    // The dimple is where the angle puts it (on its spring), not where the layout has it: nothing is written to the DOM while the wheel turns.
    let rect = context.rect;
    if (element.matches(".ug-jog-wheel__dimple")) {
      const wheelBox = context.rectOf(wheel.querySelector(".ug-jog-wheel__wheel") ?? element), size = Math.min(context.rect[2], context.rect[3]);
      const angle = (followSpring(input, wheelAngle(wheel, input), wheelSpring(wheel), context.follow, { tolerance: 0.01 }) * Math.PI) / 180, at = dimpleOf(wheelBox[2]).at;
      rect = [wheelBox[0] + wheelBox[2] / 2 + at * Math.sin(angle) - size / 2, wheelBox[1] + wheelBox[3] / 2 - at * Math.cos(angle) - size / 2, context.rect[2], context.rect[3]];
    }
    return jogWheelFormEntries(element, { rect, box: context.rectOf(input), state: jogState(input), objects: context.objects, base: context.base, rectOf: context.rectOf,
      material: context.material, knob: context.knob.material, well: context.well, light: context.light, hoverHeight: context.hoverHeight, domes: context.domes });
  }
  const jack = element.closest<HTMLElement>(".ug-patch-point");
  if (jack && element.matches(".ug-patch-point__washer, .ug-patch-point__jack, .ug-patch-point__plug")) {
    const control = jack.matches("button") ? jack.querySelector<HTMLElement>(".ug-patch-point__object") : jack.querySelector<HTMLElement>(":scope > .ug-patch-point__input");
    if (!control) return undefined;
    if (context.instrument) {
      claims.get(panel)?.patchPoints.add(jack);
      // The washer, the plug and the cable's stub are the object's, hidden or not at this moment (a toggle must not paint them for a frame);
      // the jack's hole stays printed on the face, so it has no primitive.
      for (const part of jack.querySelectorAll(".ug-patch-point__washer, .ug-patch-point__plug, .ug-patch-point__stub")) context.domes?.add(part);
      return [];
    }
    return patchPointFormEntries(element, { rect: context.rect, box: context.rectOf(control), state: context.states(element), objects: context.objects, base: context.base, rectOf: context.rectOf,
      knob: context.knob, well: { material: context.material(element, "well"), depth: context.well }, light: context.light, hoverHeight: context.hoverHeight, domes: context.domes });
  }
  return undefined;
}

/** What `wave3Objects` needs of the Instrument scene being built. */
export interface Wave3ObjectContext extends FollowContext {
  scale: number;
  light: { azimuth: number; elevation: number };
  raised: number;
  /** Objects and primitives already in the scene, and the most the format takes. */
  room(): boolean;
  rectOf(element: Element): Box;
  states(element: Element): SceneState;
  idOf(element: Element, prefix: string): string;
  profile(name: string, shape: InstrumentProfile): string;
  materials: Record<string, InstrumentRecipe>;
}

const use = (materials: Record<string, InstrumentRecipe>, ...names: string[]) => {
  for (const name of names) {
    const recipe = premiumMaterials[name] ?? (jogMaterials as Record<string, InstrumentRecipe>)[name] ?? (patchMaterials as Record<string, InstrumentRecipe>)[name];
    if (recipe) materials[name] ??= recipe;
  }
};

/**
 * The Instrument objects of the wheels and jacks the face walk claimed, and the tallest point of their parts for the layer's outset.
 * A wheel's dimple turns on its accumulated angle (`--strata-jog-angle`, kept by the plain-DOM behaviour) on the knob's spring (the
 * detent spring for a detented wheel); a jack's plug is seated by `checked` (or `aria-pressed`) on `spring.patch`. Both are
 * uniform updates: no recapture.
 */
export function wave3Objects(panel: HTMLElement, context: Wave3ObjectContext): { objects: InstrumentObject[]; tallest: number } {
  const objects: InstrumentObject[] = [], found = claims.get(panel);
  let tallest = 0;
  if (!found) return { objects, tallest };
  for (const root of found.jogWheels) {
    const input = root.querySelector<HTMLInputElement>(".ug-jog-wheel__input"), wheel = root.querySelector(".ug-jog-wheel__wheel");
    if (!input || !wheel || !context.room()) continue;
    const box = context.rectOf(input), size = context.rectOf(wheel)[2];
    if (box[2] <= 0 || box[3] <= 0 || size <= 0) continue;
    const angle = followSpring(input, wheelAngle(root, input), wheelSpring(root), context, { tolerance: 0.01 });
    const state = jogState(input);
    objects.push(jogWheelObject({ id: context.idOf(input, "jog"), box, size, angle, scale: context.scale, state: { hover: !!state.hover, disabled: !!state.disabled }, light: context.light, relief: { height: context.raised, material: "knobSkirt" } }, context.profile) as unknown as InstrumentObject);
    use(context.materials, "knobSkirt", "knobCap", "knobChamfer", "jogDimple");
    tallest = Math.max(tallest, jogHeight(context.scale));
  }
  for (const root of found.patchPoints) {
    const button = root.matches("button"), washer = root.querySelector(".ug-patch-point__washer");
    const control = button ? root.querySelector<HTMLElement>(".ug-patch-point__object") : root.querySelector<HTMLElement>(":scope > .ug-patch-point__input");
    if (!control || !washer || !context.room()) continue;
    const box = context.rectOf(control), size = context.rectOf(washer)[2];
    if (box[2] <= 0 || box[3] <= 0 || size <= 0) continue;
    const connected = button ? root.getAttribute("aria-pressed") === "true" : (control as HTMLInputElement).checked;
    const t = followSpring(button ? root : control, connected ? 1 : 0, patchSpring, context, { limits: [0, 1] });
    const state = context.states(washer);
    objects.push(patchPointObject({ id: context.idOf(button ? root : control, "patch"), box, size, t, scale: context.scale, state: { hover: !!state.hover, disabled: !!state.disabled }, light: context.light,
      relief: { height: context.raised, material: "knobCap" } }, context.profile) as unknown as InstrumentObject);
    use(context.materials, "knobCap", "knobSkirt", "knobInk", "patchCable");
    tallest = Math.max(tallest, patchHeight(size, context.scale));
  }
  return { objects, tallest };
}
