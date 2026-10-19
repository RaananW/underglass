/**
 * PatchPoint and PatchBay (anatomy pages `patch-point.md`): the decorative markup every binding renders for a jack, the sizes
 * of its washer and box, the spring of its plug and the model of a PatchBay, shared by the React, Vue and Astro bindings, the
 * plain-DOM behaviour, the GPU helper and the tests, so all of them agree.
 *
 * A PatchPoint is a native `<input type="checkbox">` (connected or not) or, where the page says so, a `<button aria-pressed>`, in a
 * label row with a jack in a washer: a recessed hole and, when connected, a plug standing out of it with a short cable. A PatchBay
 * is a `<fieldset>` of PatchPoints on one plinth.
 */

/** One decorative element of a jack: its class and its Relief marker. */
export interface PatchPart {
  className: string;
  face?: "raised" | "well" | "knob";
}

/**
 * The jack's object, inside `<span class="ug-patch-point__object" aria-hidden="true">`, in paint order. Every part is decoration:
 * `pointer-events: none`, so every press lands on the native control, whose box covers the whole object.
 * - `washer`: the turned ring the jack is mounted in (a raised face);
 * - `jack`: the hole in it, printed dark on the face at every level (a well face, so the GPU recesses it);
 * - `stub`: the cable's stub beside the plug, printed on the page where the GPU draws no cable (it has no face);
 * - `plug`: the plug standing out of the hole, shown only while the jack is connected (a knob face).
 */
export const patchPointMarkup: PatchPart[] = [
  { className: "ug-patch-point__washer", face: "raised" },
  { className: "ug-patch-point__jack", face: "well" },
  { className: "ug-patch-point__stub" },
  { className: "ug-patch-point__plug", face: "knob" },
];

/** A PatchPoint's optional LED is a StatusLight lens (decorative, `aria-hidden`), lit while the jack is connected. */
export const patchLedMarkup: { className: string; face?: "knob" }[] = [{ className: "ug-status-light__socket" }, { className: "ug-status-light__lens", face: "knob" }];

/** The washer's diameter per `size` (`size.patchPoint.*`), CSS px. */
export const patchWasher = { small: 28, medium: 36, large: 44 } as const;
/** The room round the washer in the native control's box, each side: its shadow and the perspective. */
export const PATCH_ROOM = 10;
/** The native control's box for a washer, a square: the washer and the room. */
export const patchPointBox = (washer: number) => washer + 2 * PATCH_ROOM;

/** `spring.patch` (design language section 12): a plug seating in its jack, position `t` per unit mass. */
export const patchSpring = { stiffness: 1100, damping: 60 };

/** Everything a binding needs to render a PatchBay's root, from its props. */
export interface PatchBayModel {
  /** The root's `style` attribute, when it names its columns. */
  style?: string;
}

/** The markup data for a PatchBay (anatomy page `patch-point.md`). */
export function patchBayModel({ columns }: { columns?: number }): PatchBayModel {
  return columns !== undefined && Math.round(columns) >= 1 ? { style: `--strata-patch-columns: ${Math.round(columns)};` } : {};
}
