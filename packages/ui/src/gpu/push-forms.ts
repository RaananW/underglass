/**
 * The PushButton forms at the Relief and Objects levels (anatomy pages `button.md`, `toggle-button.md`): the scene entries the
 * GPU helper writes for the bezel and the cap of a `button.ug-push`, from their laid-out boxes. The lit ring and the LED are not
 * entries: their paint is captured content (CSS, `--strata-lit` and `--strata-led`), and their light is the emitter the helper
 * adds for each (`gpu/index.ts`). Each part stands only as high as its box lets its cast shadow (2.8) reach, hovered, so nothing
 * it draws leaves the native button's box; hits stay on the button, which no part covers for input (`pointer-events: none`).
 * - **bezel:** a raised face (Relief) or a slab (Objects) the shape of the bezel, a stadium, in the `knob` metal;
 * - **cap:** a raised face (Relief) or a key standing on the bezel's top (Objects) the shape of the cap, a pill, in the button's
 *   own material, with the brushed finish. A held or latched button is pressed: Relief sinks the face, Objects travels the key.
 * - **bank plinth** (the latching forms of the RadioGroup and the SegmentedControl, `.ug-bank__plinth`): a raised face or a slab in the `knob`
 *   metal, fitted to the native group's box; a bank key has no bezel, so its cap stands on the plinth's top.
 * Parts never take focus: the focus ring is the CSS outline round the bezel (the cap, in a bank), captured content.
 */
import type { SceneEntry, SceneFace, SceneState } from "../tokens/scene.ts";
import { fittedRoundHeight } from "../shared/push-button.ts";

type Box = [number, number, number, number];

/** What the helper gives the push button's parts for one element. */
export interface PushFormContext {
  /** The element's box in the panel, and its state, from the button. */
  rect: Box;
  state: SceneState;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the button stands on (Objects). */
  base: number;
  /** The native button's box: every part, its shadow included, stays inside it. */
  box: Box;
  /** The bezel's box (the cap stands on the bezel's top at the Objects level); a bank key has none. */
  bezel?: Box;
  /** The part's corner radius as laid out; a stadium (half the shorter side) where it is larger or absent. */
  radius?: number;
  /** The material name for an element's face (its role's, or the one it names). */
  material(element: Element, face: SceneFace): string;
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a cap by a quarter). */
  hoverHeight: number;
  /** `object.keyTravel`, how far an Objects key sinks. */
  keyTravel: number;
}

/** The heights the parts would like at Relief and Objects, px, before their shadows are fitted to the box. */
export const pushReliefHeights = { bezel: 2, cap: 4, key: 8, plinth: 2 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The scene entries for the bezel or the cap of a push button, or undefined when `element` is neither (the helper then handles
 * it as usual). A part whose box is empty gives no entries.
 */
export function pushFormEntries(element: Element, context: PushFormContext): SceneEntry[] | undefined {
  const isBezel = element.matches(".ug-push__bezel"), isCap = element.matches(".ug-push__cap"), isPlinth = element.matches(".ug-bank__plinth");
  if (!isBezel && !isCap && !isPlinth) return undefined;
  const [x, y, width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const state: SceneState = { hover: !!context.state.hover, pressed: !!context.state.pressed, disabled: !!context.state.disabled };
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  // Hover lifts a primitive by `hoverHeight` and an object's cap by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const fit = (wanted: number) => round(fittedRoundHeight(wanted * lift, margins, context.light) / lift);
  const stadium = Math.min(width, height) / 2, radius = Math.min(stadium, context.radius ?? stadium);
  if (isBezel || isPlinth) {
    const rise = fit(isPlinth ? pushReliefHeights.plinth : pushReliefHeights.bezel), material = context.material(element, "raised");
    return [context.objects
      ? { object: "slab", rect: context.rect, radius, height: Math.max(0.25, rise), base: context.base, taper: round(Math.min(Math.max(0.25, rise), 3)), material, state: { hover: state.hover, disabled: state.disabled } }
      : { face: "raised", rect: context.rect, radius, height: rise, material, state: { hover: state.hover, disabled: state.disabled } }];
  }
  const material = context.material(element, "raised"), finish = element.getAttribute("data-strata-finish") !== "off";
  if (!context.objects) return [{ face: "raised", rect: context.rect, radius, height: fit(pushReliefHeights.cap), material, finish, state }];
  const rise = Math.max(0.25, fit(pushReliefHeights.key)), travel = round(Math.min(context.keyTravel, rise * 0.75));
  // The key stands on the bezel's top, the surface the bezel's slab makes under it (its own fitted height, at rest).
  let under = 0;
  if (context.bezel) {
    const [bx, by, bw, bh] = context.bezel;
    under = Math.max(0.25, round(fittedRoundHeight(pushReliefHeights.bezel, { left: bx - box[0], top: by - box[1], right: box[0] + box[2] - bx - bw, bottom: box[1] + box[3] - by - bh }, context.light)));
  }
  return [{ object: "key", rect: context.rect, radius, height: rise, base: round(context.base + under), taper: round(Math.min(rise, 3)), travel, material, finish, state }];
}
