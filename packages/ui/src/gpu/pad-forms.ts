/**
 * The Pad and the Keypad at the Relief and Objects levels (anatomy pages `pad.md`, `keypad.md`): the scene entries the GPU helper
 * writes for the cap of a `button.ug-pad`, for the cap of a keypad key and for a keypad's plinth, from their laid-out boxes. A pad's
 * glow and socket are not entries: their paint is captured content (CSS, `--strata-lit`), and their light is the emitter the helper
 * adds for each pad (`gpu/pad-keypad.ts`). Each part stands only as high as its box lets its cast shadow (2.8) reach, hovered, so
 * nothing it draws leaves the native control's box; hits stay on the button, which no part covers for input (`pointer-events: none`).
 * - **cap:** a raised face (Relief) or a key (Objects) the shape of the cap, a rounded square, in the control's own material, with the
 *   brushed finish. A held or latched pad is pressed: Relief sinks the face, Objects travels the key. A keypad's keys stand on the
 *   plinth's top.
 * - **plinth** (`.ug-keypad__plinth`): a raised face or a slab in the `knob` metal, fitted to the keypad's box.
 * Parts never take focus: the focus ring is the CSS outline round the glow or the cap, captured content.
 */
import type { SceneEntry, SceneState } from "../tokens/scene.ts";
import { fittedRoundHeight } from "../shared/push-button.ts";

type Box = [number, number, number, number];

/** What the helper gives the pad and keypad parts for one element. */
export interface PadFormContext {
  /** The element's box in the panel, and its state, from the control. */
  rect: Box;
  state: SceneState;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the part stands on (Objects). */
  base: number;
  /** The native control's box (a pad's or key's button, a keypad's fieldset): every part, its shadow included, stays inside it. */
  box: Box;
  /** The part's corner radius as laid out; a stadium (half the shorter side) where it is larger. */
  radius: number;
  /** The material name for an element's face (its role's, or the one it names), and the knob metal's (a plinth). */
  material(element: Element, face: "raised"): string;
  knob: string;
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a cap by a quarter). */
  hoverHeight: number;
  /** `object.keyTravel`, how far an Objects key sinks. */
  keyTravel: number;
}

/** The heights the parts would like at Relief and Objects, px, before their shadows are fitted to the box. */
export const padReliefHeights = { cap: 4, key: 8, plinth: 2 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The scene entries for a pad's cap, a keypad key's cap or a keypad's plinth, or undefined when `element` is none of them (the helper
 * then handles it as usual). A part whose box is empty gives no entries.
 */
export function padFormEntries(element: Element, context: PadFormContext): SceneEntry[] | undefined {
  const isCap = element.matches(".ug-pad__cap, .ug-keypad__cap"), isPlinth = element.matches(".ug-keypad__plinth");
  if (!isCap && !isPlinth) return undefined;
  const [x, y, width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const state: SceneState = { hover: !!context.state.hover, pressed: !!context.state.pressed, disabled: !!context.state.disabled };
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  // Hover lifts a primitive by `hoverHeight` and an object's cap by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const fit = (wanted: number) => round(fittedRoundHeight(wanted * lift, margins, context.light) / lift);
  const radius = Math.min(context.radius, Math.min(width, height) / 2);
  if (isPlinth) {
    const rise = fit(padReliefHeights.plinth), material = context.knob, plain = { hover: state.hover, disabled: state.disabled };
    return [context.objects
      ? { object: "slab", rect: context.rect, radius, height: Math.max(0.25, rise), base: context.base, taper: round(Math.min(Math.max(0.25, rise), 3)), material, state: plain }
      : { face: "raised", rect: context.rect, radius, height: rise, material, state: plain }];
  }
  const material = context.material(element, "raised"), finish = element.getAttribute("data-strata-finish") !== "off";
  if (!context.objects) return [{ face: "raised", rect: context.rect, radius, height: fit(padReliefHeights.cap), material, finish, state }];
  const rise = Math.max(0.25, fit(padReliefHeights.key)), travel = round(Math.min(context.keyTravel, rise * 0.75));
  return [{ object: "key", rect: context.rect, radius, height: rise, base: round(context.base), taper: round(Math.min(rise, 3)), travel, material, finish, state }];
}
