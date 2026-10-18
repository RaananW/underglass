/**
 * Knob (anatomy page `knob.md`): the value and angle maths and the markup data shared by the bindings and the plain-DOM
 * behaviour. A knob is a native `<input type="range">` over a printed dial; its sweep is centred on the top, angles are
 * in degrees, 0 at the top and clockwise, and the bottom gap goes to the nearer end (design language section 14,
 * Instrument controls).
 */

/** A printed mark on the dial: a tick and a numeral at `value`, reading `label` (the value by default). */
export interface KnobMark {
  value: number;
  label?: string;
}

/** The knob's interaction tokens (`knob.*`, design language section 14); the defaults are I0.7's and v2's. */
export interface KnobTokens {
  /** The cap's turn from minimum to maximum, degrees. */
  sweep: number;
  /** Vertical drag for a full sweep, CSS px. */
  dragPx: number;
  /** The drag rate while Shift is held. */
  fine: number;
  /** A press that moves less than this, in CSS px, is a tap. */
  tapSlop: number;
  /** A ring click within this many degrees of a printed numeral sets exactly its value. */
  snap: number;
}
export const knobDefaults: KnobTokens = { sweep: 270, dragPx: 200, fine: 0.1, tapSlop: 4, snap: 2 };

/** A range's bounds and step: `step` defaults to 1, as the native input's does. */
export interface KnobRange {
  min: number;
  max: number;
  step?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A number without floating-point noise: `0.30000000000000004` → `0.3`. */
const tidy = (value: number) => Number(value.toFixed(6));

/** The step a detented knob takes: its range over `detents − 1` (design language section 12). */
export function knobDetentStep(min: number, max: number, detents: number): number {
  return tidy((max - min) / Math.max(1, Math.round(detents) - 1));
}

/** Where `value` sits along the range, 0–1. */
export function knobFraction(value: number, { min, max }: KnobRange): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/** The cap's angle at `value`, degrees from the top, clockwise. */
export function knobAngle(value: number, range: KnobRange, sweep = knobDefaults.sweep): number {
  return tidy((knobFraction(value, range) - 0.5) * sweep);
}

/** A tap's and a wheel notch's step: the input's `step`, at least 1% of the range, so taps reach every value a drag can. */
export function knobNotch({ min, max, step = 1 }: KnobRange): number {
  return Math.max(step > 0 ? step : 1, (max - min) / 100);
}

/**
 * The value at screen angle `theta` on the printed scale. A click within `snap` degrees of a printed mark sets exactly
 * its value (a numeral's box sits on whole pixels, about 0.5° off its true angle); a click in the bottom gap goes to
 * the nearer end.
 */
export function knobValueAtAngle(theta: number, range: KnobRange, { sweep = knobDefaults.sweep, snap = knobDefaults.snap, marks = [] as readonly number[] } = {}): number {
  const { min, max } = range, half = sweep / 2;
  // Angles past ±180° are the same direction; the input is always within −180–180.
  const angle = ((((theta + 180) % 360) + 360) % 360) - 180;
  let nearest: number | undefined, distance = Infinity;
  for (const value of marks) {
    const off = Math.abs(knobAngle(value, range, sweep) - angle);
    if (off <= snap && off < distance) { nearest = value; distance = off; }
  }
  if (nearest !== undefined) return nearest;
  const fraction = angle > half ? 1 : angle < -half ? 0 : (angle + half) / sweep;
  return tidy(min + fraction * (max - min));
}

/** Where a press landed on the dial, relative to its centre: on the skirt or cap (`cap`: a tap steps), or on the ring. */
export function knobRegion(dx: number, dy: number, skirtRadius: number): { cap: boolean; upper: boolean; theta: number } {
  return { cap: Math.hypot(dx, dy) < skirtRadius, upper: dy < 0, theta: (Math.atan2(dx, -dy) * 180) / Math.PI };
}

/**
 * The value after a vertical move of `dy` CSS px from `from` (up is negative, and raises it): a full sweep per `dragPx`,
 * times `fine` with Shift, clamped to the range but not snapped to the step.
 */
export function knobDrag(from: number, dy: number, range: KnobRange, { dragPx = knobDefaults.dragPx, fine = knobDefaults.fine, shift = false } = {}): number {
  return clamp(from - (dy / dragPx) * (range.max - range.min) * (shift ? fine : 1), range.min, range.max);
}

/** A number as printed on a scale or spoken: no floating-point noise, a true minus sign (U+2212) when negative. */
export function knobNumber(value: number): string {
  const text = String(Math.abs(tidy(value)));
  return value < 0 && text !== "0" ? `−${text}` : text;
}

/** The input's `aria-valuetext` for a unit: the value followed by `unit` as written (" dB", "%"). */
export function knobValueText(value: number, unit: string): string {
  return `${knobNumber(value)}${unit}`;
}

/**
 * The printed marks: `marks` as given (numbers, or values with labels), or that many evenly spaced from `min` to
 * `max`. By default a detented knob with at most 12 positions prints one per detent, every other knob 11.
 */
export function knobMarks(range: KnobRange, marks?: number | readonly (number | KnobMark)[], detents?: number): KnobMark[] {
  const { min, max } = range;
  const count = marks ?? (detents && detents <= 12 ? Math.round(detents) : 11);
  const list: readonly (number | KnobMark)[] = typeof count === "number"
    ? count < 1 ? [] : count === 1 ? [min] : Array.from({ length: Math.round(count) }, (_, index) => tidy(min + ((max - min) * index) / (Math.round(count) - 1)))
    : count;
  return list.map(mark => (typeof mark === "number" ? { value: mark } : mark)).filter(mark => mark.value >= min && mark.value <= max);
}

/** The root's style: where the value sits (`--strata-knob-value`, 0–1 to four places) and a sweep other than the token's. */
export function knobStyle(value: number, range: KnobRange, sweep?: number): string {
  const fraction = Math.round(knobFraction(value, range) * 10000) / 10000;
  return `--strata-knob-value: ${fraction};${sweep !== undefined ? ` --strata-knob-sweep: ${sweep};` : ""}`;
}

/** A mark's style: where it sits along the sweep (`--strata-knob-at`, 0–1 to four places). */
export function knobMarkStyle(value: number, range: KnobRange): string {
  return `--strata-knob-at: ${Math.round(knobFraction(value, range) * 10000) / 10000};`;
}

/** Everything a binding needs to render a knob's markup, from its props. */
export interface KnobModel {
  min: number;
  max: number;
  step: number;
  detented: boolean;
  /** The root's `style` attribute. */
  style: string;
  /** The printed marks, each with its `style` and the text it prints. */
  marks: { value: number; text: string; style: string }[];
  /** The input's `aria-valuetext`, when a unit or a format gives one. */
  valueText?: string;
}

export interface KnobModelInput {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  detents?: number;
  sweep?: number;
  marks?: number | readonly (number | KnobMark)[];
  unit?: string;
  format?: (value: number) => string;
}

/** The markup data for a knob (anatomy page `knob.md`): 0–100 in steps of 1 unless given. */
export function knobModel({ value, min = 0, max = 100, step, detents, sweep, marks, unit, format }: KnobModelInput): KnobModel {
  const detented = detents !== undefined && detents >= 2;
  const range = { min, max, step: detented ? knobDetentStep(min, max, detents) : step ?? 1 };
  return {
    min, max, step: range.step, detented,
    style: knobStyle(value, range, sweep),
    marks: knobMarks(range, marks, detented ? detents : undefined).map(mark => ({ value: mark.value, text: mark.label ?? knobNumber(mark.value), style: knobMarkStyle(mark.value, range) })),
    ...(format ? { valueText: format(value) } : unit !== undefined ? { valueText: knobValueText(value, unit) } : {}),
  };
}

/**
 * Whether a detented knob's pointer, which last stood at `before` (a fraction of the range, 0-1), passes a detent on the
 * way to `value`: the detent each sits at (`step` apart, from `min`) differs. The Fader's rule (`dom/fader.ts`).
 */
export function knobDetentsCrossed(before: number, value: number, range: KnobRange): boolean {
  const { min, max, step = 1 } = range;
  if (!(max > min) || !(step > 0)) return false;
  const detent = (fraction: number) => Math.round((fraction * (max - min)) / step);
  return detent(before) !== detent(knobFraction(value, range));
}
