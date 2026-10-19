/**
 * The JogWheel at the Relief and Objects levels (anatomy page `jog-wheel.md`): the scene entries the GPU helper writes for the
 * parts of a `.ug-jog-wheel`, from their laid-out boxes. The dimple turns with `--strata-jog-angle`, so its box is read from
 * the layout each frame (a CSS transition on a detented wheel is followed frame by frame): the wheel's turn is a change of
 * the scene's primitives, never of the captured content, so a spin recaptures nothing.
 * - **well:** the bearing recess in the face, a well (Relief) or a sunk disc (Objects) a little wider than the wheel;
 * - **wheel:** a raised disc (Relief) or a round slab standing on the recess's floor (Objects), only as high as its box lets
 *   its cast shadow (2.8) reach, hovered;
 * - **dimple:** a small well on the wheel's face, wherever the angle has put it.
 * Parts never take focus: the focus ring is the CSS outline round the recess, captured content. Hits stay on the native input,
 * which no part covers for input (`pointer-events: none`).
 */
import type { SceneEntry, SceneFace, SceneState } from "../tokens/scene.ts";
import { fittedHeight } from "../shared/switch-forms.ts";

type Box = [number, number, number, number];

/** What the helper gives the jog wheel's parts for one element. */
export interface JogFormContext {
  /** The element's box in the panel, and the wheel input's (every part, its shadow included, stays inside it). */
  rect: Box;
  box: Box;
  /** The input's state: hover and disabled. */
  state: SceneState;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the wheel's recess is sunk in. */
  base: number;
  /** An element's box in the panel. */
  rectOf(element: Element): Box;
  /** The material name for an element's face (its role's, or the one it names). */
  material(element: Element, face: SceneFace): string;
  /** The knob role's material name, for the wheel. */
  knob: string;
  /** `elevation.well`, the recess's depth. */
  well: number;
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a cap by a quarter). */
  hoverHeight: number;
  /** Collects the elements drawn as domes, whose own CSS paint the helper hides. */
  domes?: Set<Element>;
}

/** The heights the parts would like at Relief and Objects, px, before the wheel's shadow is fitted to the box. */
export const jogReliefHeights = { wheel: 5, dimple: 1.2 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The scene entries for one element of a jog wheel, or undefined when `element` is not a part of one (the helper then handles it
 * as usual). A part whose box is empty gives no entries. The dimple is drawn with the wheel (its entry follows the wheel's).
 */
export function jogWheelFormEntries(element: Element, context: JogFormContext): SceneEntry[] | undefined {
  const root = element.closest(".ug-jog-wheel");
  if (!root || !element.matches(".ug-jog-wheel__well, .ug-jog-wheel__wheel, .ug-jog-wheel__dimple")) return undefined;
  const [, , width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const state: SceneState = { hover: !!context.state.hover, disabled: !!context.state.disabled };
  const radius = Math.min(width, height) / 2;
  // The wheel's own box decides how high it may stand (the dimple is on it): its margins to the input's box.
  const wheel = root.querySelector(".ug-jog-wheel__wheel"), [wx, wy, ww, wh] = wheel ? context.rectOf(wheel) : context.rect;
  const margins = { left: wx - box[0], top: wy - box[1], right: box[0] + box[2] - wx - ww, bottom: box[1] + box[3] - wy - wh };
  // Hover lifts a primitive by `hoverHeight` and an object's cap by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const depth = Math.max(0.5, context.well);
  if (element.matches(".ug-jog-wheel__well")) {
    return [context.objects
      ? { object: "well", rect: context.rect, radius, height: depth, base: context.base, taper: round(Math.min(depth, 3)), material: context.material(element, "well"), state: { disabled: state.disabled } }
      : { face: "well", rect: context.rect, radius, height: depth, material: context.material(element, "well"), state: { disabled: state.disabled } }];
  }
  // The wheel's rise, fitted; at the Objects level it stands on the recess's floor.
  const rise = round(fittedHeight(jogReliefHeights.wheel * lift, margins, context.light) / lift);
  const floor = round(context.base - depth);
  if (element.matches(".ug-jog-wheel__wheel")) {
    return [context.objects
      ? { object: "slab", rect: context.rect, radius, height: Math.max(0.25, rise), base: floor, taper: round(Math.min(Math.max(0.25, rise), 3)), material: context.knob, state }
      : { face: "raised", rect: context.rect, radius, height: rise, material: context.knob, state }];
  }
  // The dimple: a small well on the wheel's face (Objects: sunk from the wheel's top).
  context.domes?.add(element);
  const dimple = Math.min(jogReliefHeights.dimple, Math.max(0.25, rise / 2));
  return [context.objects
    ? { object: "well", rect: context.rect, radius, height: dimple, base: round(floor + Math.max(0.25, rise)), taper: 0.5, material: context.material(element, "well"), state: { disabled: state.disabled } }
    : { face: "well", rect: context.rect, radius, height: dimple, material: context.material(element, "well"), state: { disabled: state.disabled } }];
}
