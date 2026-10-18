/**
 * The Switch's hardware forms at the Relief and Objects levels (anatomy page `switch.md`, *Forms*): the scene entries
 * the GPU helper writes for the parts of a `.ug-switch[data-strata-form]`, from their laid-out boxes, so they follow the
 * CSS throw (`--strata-switch-t`, transitioned on the form's spring) frame by frame. Every part is drawn inside the
 * native input's box, its cast shadow included: each part stands only as high as its box lets its shadow (2.8) reach,
 * hovered, under the scene's light. Hits stay on the input, which no part covers for input (`pointer-events: none`).
 * - **slide:** the slot a groove; the block a raised face (Relief) or a slab (Objects); the lit flag a flat face, so the
 *   GPU shows its captured accent unshaded.
 * - **rocker and wall:** the bezel or plate a raised face or a slab; the paddle's two halves raised faces or slabs on
 *   it, the raised end standing taller than the pressed one in proportion to the throw, so the tilt reads as the
 *   halves' bevels and shadows (the CSS draws the paddle head-on in face mode); the flag or dot a flat face.
 * - **bat:** the nut and bushing raised faces or slabs; the lever's shaft (its head-on projection, scaled by
 *   `sin θ`) a raised face; the ball a knob face (Relief) or a dome in the knob's colour (Objects).
 * Parts never take focus: the focus ring is the input's CSS outline, captured content.
 */
import type { SceneEntry, SceneFace, SceneState } from "../tokens/scene.ts";
import { fittedHeight, isSwitchForm } from "../shared/switch-forms.ts";

type Box = [number, number, number, number];

/** What the helper gives the switch forms for one element. */
export interface SwitchFormContext {
  /** The element's box in the panel, and its radius. */
  rect: Box;
  radius: number;
  /** The element's state, from its input. */
  state: SceneState;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the switch stands on (Objects). */
  base: number;
  /** An element's box in the panel. */
  rectOf(element: Element): Box;
  /** The material name for an element's face (its role's, or the one it names). */
  material(element: Element, face: SceneFace): string;
  /** The knob role's material name and the `knob` colour (`#rrggbb`), for the moving parts and the ball's dome. */
  knob: { material: string; colour: string };
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a cap by a quarter). */
  hoverHeight: number;
  /** `elevation.well`, the slot's depth. */
  well: number;
  /** Collects the elements drawn as domes, whose own CSS paint the helper hides. */
  domes?: Set<Element>;
}

/** The heights each part would like at Relief and Objects, px, before its shadow is fitted to the box. */
export const switchReliefHeights = { block: 3, bezel: 1, plate: 1.5, nut: 1.5, bushing: 3, shaft: 3, ball: 4, raised: 4, pressed: 1.5 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The scene entries for one element of a switch form, or undefined when `element` is not a part of one (the helper
 * then handles it as usual). A part whose box is empty (the bat's shaft at mid-throw) gives no entries.
 */
export function switchFormEntries(element: Element, context: SwitchFormContext): SceneEntry[] | undefined {
  const root = element.closest(".ug-switch[data-strata-form]");
  const form = root?.getAttribute("data-strata-form");
  if (!root || !isSwitchForm(form) || !element.closest(".ug-switch__object")) return undefined;
  const input = root.querySelector<HTMLInputElement>(":scope > .ug-switch__input");
  if (!input) return undefined;
  const box = context.rectOf(input), [x, y, width, height] = context.rect;
  if (width <= 0.25 || height <= 0.25) return [];
  const t = Math.min(1, Math.max(0, Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-switch-t")) || (input.checked ? 1 : 0)));
  const state: SceneState = { hover: !!context.state.hover, pressed: !!context.state.pressed, disabled: !!context.state.disabled };
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  // Hover lifts a primitive by `hoverHeight` and an object's cap by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const fit = (wanted: number) => round(fittedHeight(wanted * lift, margins, context.light) / lift);
  const faceOf = element.getAttribute("data-strata-face") as SceneFace | null;
  const metal = (element: Element) => (element.closest("[data-strata-material]") && root.contains(element.closest("[data-strata-material]")) ? context.material(element, "raised") : context.knob.material);
  const raised = (wanted: number, base: number, material: string): SceneEntry => {
    const rise = fit(wanted);
    return context.objects
      ? { object: "slab", rect: context.rect, radius: context.radius, height: Math.max(0.25, rise), base, taper: round(Math.min(rise, 3)), material, state }
      : { face: "raised", rect: context.rect, radius: context.radius, height: rise, material, state };
  };
  if (element.matches(".ug-switch__slot")) return [{ face: "groove", rect: context.rect, radius: context.radius, height: context.well, material: context.material(element, "groove"), state: { disabled: state.disabled } }];
  // A lit flag or dot: flat, so its captured colour is drawn unlit (Rendering Model 2.3), at full strength when on.
  if (element.matches(".ug-switch__flag")) return [{ face: "flat", rect: context.rect, radius: context.radius, height: 0, material: context.material(element, "flat"), state: { disabled: state.disabled } }];
  if (element.matches(".ug-switch__block")) return [raised(switchReliefHeights.block, context.base, metal(element))];
  if (element.matches(".ug-switch__bezel, .ug-switch__plate, .ug-switch__nut")) {
    const wanted = element.matches(".ug-switch__bezel") ? switchReliefHeights.bezel : element.matches(".ug-switch__plate") ? switchReliefHeights.plate : switchReliefHeights.nut;
    return [raised(wanted, context.base, metal(element))];
  }
  // What a part stands on at the Objects level: the bezel, plate or nut under it, at its fitted height.
  const under = (selector: string, wanted: number) => {
    const part = root.querySelector(selector);
    if (!part || !context.objects) return context.base;
    const [ux, uy, uw, uh] = context.rectOf(part);
    const room = { left: ux - box[0], top: uy - box[1], right: box[0] + box[2] - ux - uw, bottom: box[1] + box[3] - uy - uh };
    return round(context.base + Math.max(0.25, fittedHeight(wanted * lift, room, context.light) / lift));
  };
  if (element.matches(".ug-switch__bushing")) return [raised(switchReliefHeights.bushing, under(".ug-switch__nut", switchReliefHeights.nut), metal(element))];
  if (element.matches(".ug-switch__facet")) {
    // The paddle tips: the raised end stands taller than the pressed one. On presses the top (On) end in.
    const on = element.matches(".ug-switch__facet--on"), share = on ? t : 1 - t;
    const wanted = switchReliefHeights.raised + (switchReliefHeights.pressed - switchReliefHeights.raised) * share;
    const base = form === "rocker" ? under(".ug-switch__bezel", switchReliefHeights.bezel) : under(".ug-switch__plate", switchReliefHeights.plate);
    // At Relief a height is above the face, so the halves stand over the bezel or plate.
    const floor = context.objects ? 0 : form === "rocker" ? switchReliefHeights.bezel : switchReliefHeights.plate;
    return [raised(Math.max(wanted, floor + 0.5), base, metal(element))];
  }
  if (element.matches(".ug-switch__lever")) return [raised(switchReliefHeights.shaft, under(".ug-switch__nut", switchReliefHeights.nut), metal(element))];
  if (element.matches(".ug-switch__ball")) {
    const rise = fit(switchReliefHeights.ball);
    if (!context.objects) return [{ face: "knob", rect: context.rect, radius: Math.min(width, height) / 2, height: rise, material: metal(element), state }];
    context.domes?.add(element);
    return [{ object: "knob", rect: context.rect, height: Math.max(0.25, rise), base: under(".ug-switch__nut", switchReliefHeights.nut), material: metal(element), colour: context.knob.colour, bounds: box, state }];
  }
  return faceOf ? [] : undefined;
}
