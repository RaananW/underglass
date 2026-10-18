/**
 * The Lamp and the StatusLight at the Relief and Objects levels (anatomy pages `lamp.md`, `status-light.md`): the scene
 * entries the GPU helper writes for the parts of a `.ug-lamp` and a `.ug-status-light`, from their laid-out boxes. A
 * lens is lit by `--strata-lit` (0–1, set from the native state, animated by a StatusLight's blink), which the helper
 * reads each frame, so the lens follows the CSS; the light itself is the lens's emitter (`gpu/index.ts` collects them).
 * - **bezel:** a raised face (Relief) or a ring (Objects, a `bezel` object) round the lens, standing only as high as the
 *   input's box lets its cast shadow (2.8) reach, hovered;
 * - **lens:** a `ring` face as wide as the lens (Relief: its arc is the lens's own colour, unlit, drawn over the socket
 *   printed on the face, so a light turning on or blinking changes no captured pixel) or a dome in that colour (Objects),
 *   standing only as high as its box lets its cast shadow reach.
 *   Lit, the material is the `glowOn` role's (emissive); unlit, the `lens` role's (glass).
 * Parts never take focus: the focus ring is the CSS outline round the bezel, captured content. Hits stay on the native
 * control, which no part covers for input (`pointer-events: none`).
 */
import type { SceneEntry, SceneFace, SceneState } from "../tokens/scene.ts";
import { fittedHeight } from "../shared/switch-forms.ts";
import { LAMP_BEZEL, lensColours, mixHex } from "../shared/lamp.ts";

type Box = [number, number, number, number];

/** What the helper gives the lamp parts for one element. */
export interface LampFormContext {
  /** The element's box in the panel, and its state, from the lamp's control. */
  rect: Box;
  state: SceneState;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the lamp stands on (Objects). */
  base: number;
  /** The object's box (a lamp's input, which it covers, or a StatusLight's object): every part, its shadow included, stays inside it. */
  box: Box;
  /** The lens colour: the role's `#rrggbb`, and how lit it is now (0–1). */
  role: string;
  lit: number;
  /** The material name for a role (`lens` unlit, `glowOn` lit) or the element's own `data-strata-material`. */
  material(element: Element, role: "bezel" | "lens" | "glowOn", face: SceneFace): string;
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a cap by a quarter). */
  hoverHeight: number;
  /** Collects the elements drawn as domes, whose own CSS paint the helper hides. */
  domes?: Set<Element>;
}

/** The heights the parts would like at Relief and Objects, px, before the bezel's shadow is fitted to the box. */
export const lampReliefHeights = { bezel: 3, lens: 0.3 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/** The lens's colour now: the unlit glass to the lit colour by `lit` (the recipe's `--_glass`). */
export function lensColourAt(role: string, lit: number): string {
  const { on, off } = lensColours(role);
  return mixHex(off, on, Math.min(1, Math.max(0, lit)));
}

/**
 * The scene entries for one part of a lamp or StatusLight, or undefined when `element` is not one (the helper then
 * handles it as usual). A part whose box is empty gives no entries.
 */
export function lampFormEntries(element: Element, context: LampFormContext): SceneEntry[] | undefined {
  const isBezel = element.matches(".ug-lamp__bezel"), isLens = element.matches(".ug-lamp__lens, .ug-status-light__lens, .ug-meter__segment");
  if (!isBezel && !isLens) return undefined;
  const [x, y, width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const state: SceneState = { hover: !!context.state.hover, disabled: !!context.state.disabled };
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  // Hover lifts a primitive by `hoverHeight` and an object's cap by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const radius = Math.min(width, height) / 2;
  if (isBezel) {
    const rise = round(fittedHeight(lampReliefHeights.bezel * lift, margins, context.light) / lift), material = context.material(element, "bezel", "raised");
    return [context.objects
      ? { object: "bezel", rect: context.rect, radius, height: Math.max(0.25, rise), base: context.base, taper: round(Math.min(Math.max(0.25, rise), 3)), width: LAMP_BEZEL, material, state }
      : { face: "raised", rect: context.rect, radius, height: rise, material, state }];
  }
  const colour = lensColourAt(context.role, context.lit), lit = context.lit >= 0.5;
  const material = context.material(element, lit ? "glowOn" : "lens", "knob");
  context.domes?.add(element);
  if (!context.objects) return [{ face: "ring", rect: context.rect, height: 0, material, state: { disabled: state.disabled }, ring: { thickness: round(radius), start: 0, sweep: 360, colour } }];
  // The dome stands on the face inside the bezel's ring, as high as its box lets its cast shadow reach (2.8).
  const rise = round(fittedHeight(lampReliefHeights.lens * Math.min(width, height) * lift, margins, context.light) / lift);
  return [{ object: "knob", rect: context.rect, height: Math.max(0.25, rise), base: context.base, material, colour, bounds: box, state }];
}
