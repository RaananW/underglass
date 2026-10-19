/**
 * The indicator forms at the GPU levels (anatomy pages `rating.md`, `badge.md`, `progress-bar.md`, `spinner.md`, *Indicator form*):
 * the lenses of a Rating's lamps, a Badge's LED, a ProgressBar's segments and a Spinner's ring are the Lamp's and the StatusLight's
 * lens: a `ring` face at Relief, a dome at Objects, a glass lens with an emitter at the Instrument level (`lamp-forms.ts`,
 * `instrument-lamp.ts`), lit by `--strata-lit` read from the lens each frame, so a chase, a hover preview or a value change is a
 * uniform write. This module says which element is a lens, which native control it belongs to, and where its light comes from; the
 * helper (`index.ts`) collects them with the Meter's segments and draws them as it draws those.
 */

/** Every indicator lens, by class. */
export const INDICATOR_LENS = ".ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress__segment";

/** Where an indicator lens's light comes from: the Lamp's tokens (`emitter.lamp.*`), the LED's (`emitter.led.*`) or a segment's (`emitter.segment.*`). */
export type IndicatorEmitter = "lamp" | "led" | "segment";

/** An indicator lens's place in its component. */
export interface IndicatorPlace {
  kind: "rating" | "badge" | "spinner" | "progress";
  /** The component's root. */
  root: HTMLElement;
  /** The native control the lens belongs to (a Rating's radio, a Badge's or Spinner's `<span>`, the `<progress>`). */
  control: HTMLElement;
  /** The element whose box holds the lens and the room for its halo: every part, its shadow included, stays inside it. */
  box: HTMLElement;
  /**
   * The lens's own room only, its diameter plus 8 px each side, inside `box`, where text shares the box (a Badge's pill): the glow and the
   * bloom are clipped to the object's box, so a box that held the text would let the bloom wash over it.
   */
  tight?: boolean;
  emitter: IndicatorEmitter;
}

/** The place of `lens` in its component, or undefined when it is not one of an indicator form's lenses. */
export function indicatorOf(lens: Element): IndicatorPlace | undefined {
  const find = (selector: string) => lens.closest<HTMLElement>(selector);
  if (lens.matches(".ug-rating__lens")) {
    const root = find(".ug-rating"), control = find(".ug-rating__item")?.querySelector<HTMLElement>(".ug-rating__input");
    return root && control ? { kind: "rating", root, control, box: control, emitter: "lamp" } : undefined;
  }
  if (lens.matches(".ug-badge__lens")) {
    const root = find(".ug-badge");
    return root ? { kind: "badge", root, control: root, box: root, tight: true, emitter: "led" } : undefined;
  }
  if (lens.matches(".ug-spinner__lens")) {
    const root = find(".ug-spinner"), ring = find(".ug-spinner__ring");
    return root && ring ? { kind: "spinner", root, control: root, box: ring, emitter: "led" } : undefined;
  }
  if (lens.matches(".ug-progress__segment")) {
    const root = find(".ug-progress-bar"), control = root?.querySelector<HTMLElement>(":scope > .ug-progress");
    return root && control ? { kind: "progress", root, control, box: control, emitter: "segment" } : undefined;
  }
  return undefined;
}

/** The lens's room: `rect` grown by 8 px each side (`INDICATOR_ROOM` / 2), held inside `within`. */
export function roomAround(rect: readonly number[], within: readonly number[]): [number, number, number, number] {
  const half = 8, left = Math.max(within[0]!, rect[0]! - half), top = Math.max(within[1]!, rect[1]! - half);
  return [left, top, Math.min(within[0]! + within[2]!, rect[0]! + rect[2]! + half) - left, Math.min(within[1]! + within[3]!, rect[1]! + rect[3]! + half) - top];
}

/** A disabled Rating keeps its lit lenses, dimmed (its stars keep their fill at 38%), so what it is set to is still said; they throw 30% of the light. */
export const DISABLED_LIGHT = 0.3;
