/**
 * The PatchPoint at the Relief and Objects levels (anatomy page `patch-point.md`): the scene entries the GPU helper writes for the
 * parts of a `.ug-patch-point`, from their laid-out boxes. Every part is drawn inside the native control's box, its cast shadow
 * included: each stands only as high as its box lets its shadow (2.8) reach, hovered, under the scene's light.
 * - **washer:** a raised disc (Relief) or a round slab (Objects) in the knob's metal;
 * - **jack:** the hole, a well (Relief) or a pit sunk into the washer (Objects); its dark floor is printed on the face;
 * - **plug:** shown only while the jack is connected (it is `visibility: hidden` otherwise, so the helper never sees it), a knob face
 *   (Relief) or a dome standing on the hole's floor (Objects). The cable's stub beside it is printed on the page.
 * Parts never take focus: the focus ring is the CSS outline round the washer, captured content. Hits stay on the native control,
 * which no part covers for input (`pointer-events: none`).
 */
import type { SceneEntry, SceneState } from "../tokens/scene.ts";
import { fittedHeight } from "../shared/switch-forms.ts";

type Box = [number, number, number, number];

/** What the helper gives the patch point's parts for one element. */
export interface PatchFormContext {
  /** The element's box in the panel; the control's box (every part, its shadow included, stays inside it). */
  rect: Box;
  box: Box;
  state: SceneState;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the jack stands on. */
  base: number;
  /** The washer's box in the panel. */
  rectOf(element: Element): Box;
  /** The material name for the knob role (the washer, the plug) and for a well. */
  knob: { material: string; colour: string };
  well: { material: string; depth: number };
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a cap by a quarter). */
  hoverHeight: number;
  /** Collects the elements drawn as domes, whose own CSS paint the helper hides. */
  domes?: Set<Element>;
}

/** The heights the parts would like at Relief and Objects, px, before their shadows are fitted to the box. */
export const patchReliefHeights = { washer: 2, plug: 5 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/** The scene entries for one element of a patch point, or undefined when `element` is not a part of one. A part with no box gives none. */
export function patchPointFormEntries(element: Element, context: PatchFormContext): SceneEntry[] | undefined {
  const root = element.closest(".ug-patch-point");
  if (!root || !element.matches(".ug-patch-point__washer, .ug-patch-point__jack, .ug-patch-point__plug")) return undefined;
  const [, , width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const state: SceneState = { hover: !!context.state.hover, disabled: !!context.state.disabled };
  const radius = Math.min(width, height) / 2;
  const washer = root.querySelector(".ug-patch-point__washer"), [wx, wy, ww, wh] = washer ? context.rectOf(washer) : context.rect;
  const margins = { left: wx - box[0], top: wy - box[1], right: box[0] + box[2] - wx - ww, bottom: box[1] + box[3] - wy - wh };
  // Hover lifts a primitive by `hoverHeight` and an object's cap by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const rise = round(fittedHeight(patchReliefHeights.washer * lift, margins, context.light) / lift);
  const top = round(context.base + Math.max(0.25, rise));
  const pit = Math.min(context.well.depth, Math.max(0.25, rise) * 0.75);
  if (element.matches(".ug-patch-point__washer")) {
    return [context.objects
      ? { object: "slab", rect: context.rect, radius, height: Math.max(0.25, rise), base: context.base, taper: round(Math.min(Math.max(0.25, rise), 3)), material: context.knob.material, state }
      : { face: "raised", rect: context.rect, radius, height: rise, material: context.knob.material, state }];
  }
  if (element.matches(".ug-patch-point__jack")) {
    return [context.objects
      ? { object: "well", rect: context.rect, radius, height: pit, base: top, taper: 0.5, material: context.well.material, state: { disabled: state.disabled } }
      : { face: "well", rect: context.rect, radius, height: Math.min(context.well.depth, 2), material: context.well.material, state: { disabled: state.disabled } }];
  }
  // The plug: a dome in the knob's metal, on the hole's floor at the Objects level.
  context.domes?.add(element);
  const dome = round(fittedHeight(patchReliefHeights.plug * lift, margins, context.light) / lift);
  return [context.objects
    ? { object: "knob", rect: context.rect, height: Math.max(0.25, dome), base: round(top - pit), material: context.knob.material, colour: context.knob.colour, bounds: box, state }
    : { face: "knob", rect: context.rect, radius, height: dome, material: context.knob.material, state }];
}
