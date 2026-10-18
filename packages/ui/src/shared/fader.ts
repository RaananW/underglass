/**
 * Fader (anatomy page `fader.md`): the value maths and the markup data shared by the bindings and the plain-DOM
 * behaviour. A fader is a native `<input type="range">`, vertical by default (`writing-mode: vertical-lr`,
 * `direction: rtl`, so the minimum is at the bottom), whose transparent thumb is the carriage's travel footprint: the
 * carriage's centre is the thumb's centre at every value (design language section 14, Instrument controls).
 */

/** A printed mark beside the slot: a tick and a numeral at `value`, reading `label` (the value by default). */
export interface FaderMark {
  value: number;
  label?: string;
}

/** A fader's direction of travel: vertical (the default, minimum at the bottom) or horizontal (minimum at the left). */
export type FaderOrientation = "vertical" | "horizontal";

/** The fader's interaction tokens (`fader.*`, design language section 14). */
export interface FaderTokens {
  /** A track click released within this many CSS px of a printed mark sets exactly its value. */
  snap: number;
}
export const faderDefaults: FaderTokens = { snap: 2 };

/**
 * The carriage and its box (design language section 6, the Instrument object table), CSS px: the carriage is 30 across
 * and 42 along the travel, in a band 46 across (8 on each side), with a 16 px margin beyond it at each stop (room for
 * its shadow on the face at the Instrument level), so the native thumb (the carriage's footprint) is 74 long. A press
 * that moves less than `tapSlop` is a tap (`knob.tapSlop`'s value).
 */
export const faderGeometry = { across: 30, along: 42, band: 46, margin: 16, slot: 5, grip: 1.6, tapSlop: 4 } as const;

/** A range's bounds and step: `step` defaults to 1, as the native input's does. */
export interface FaderRange {
  min: number;
  max: number;
  step?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A number without floating-point noise: `0.30000000000000004` → `0.3`. */
const tidy = (value: number) => Number(value.toFixed(6));

/** The step a detented fader takes: its range over `detents − 1`. */
export function faderDetentStep(min: number, max: number, detents: number): number {
  return tidy((max - min) / Math.max(1, Math.round(detents) - 1));
}

/** Where `value` sits along the range, 0–1 (0 at the minimum: the bottom of a vertical fader, the left of a horizontal one). */
export function faderFraction(value: number, { min, max }: FaderRange): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/** A wheel notch's step: the input's `step`, at least 1% of the range. */
export function faderNotch({ min, max, step = 1 }: FaderRange): number {
  return Math.max(step > 0 ? step : 1, (max - min) / 100);
}

/**
 * The carriage centre's offset from the start of the box along the travel, CSS px, at `fraction` of the range: half the
 * thumb from the end, and the travel between. A vertical fader runs from the bottom, so its offset is from the top.
 */
export function faderOffset(fraction: number, travel: number, orientation: FaderOrientation = "vertical"): number {
  const thumb = faderGeometry.along + 2 * faderGeometry.margin, along = clamp(fraction, 0, 1);
  return thumb / 2 + (orientation === "vertical" ? 1 - along : along) * travel;
}

/**
 * The value whose carriage centre is at `offset` CSS px from the start of a box `length` long along the travel (from
 * the top of a vertical fader, the left of a horizontal one), the carriage's centre travelling `travel` px between the
 * stops, clamped to the range and not snapped to the step: what a track click sets.
 */
export function faderValueAt(offset: number, length: number, travel: number, { min, max }: FaderRange, orientation: FaderOrientation = "vertical"): number {
  const thumb = length - travel;
  const along = travel > 0 ? clamp((offset - thumb / 2) / travel, 0, 1) : 0;
  return tidy(min + (orientation === "vertical" ? 1 - along : along) * (max - min));
}

/**
 * The printed mark a tap released at `position` lands on: the nearest whose centre (`at`, in the same CSS px) is
 * within `snap`, or none. The native track click puts the carriage's centre under the pointer; a numeral's box sits
 * on whole pixels, so a click on it can land a fraction of a step away, and the mark makes it exact.
 */
export function faderSnap(position: number, marks: readonly { value: number; at: number }[], snap = faderDefaults.snap): number | undefined {
  let nearest: number | undefined, distance = Infinity;
  for (const mark of marks) {
    const off = Math.abs(mark.at - position);
    if (off <= snap && off < distance) { nearest = mark.value; distance = off; }
  }
  return nearest;
}

/** A number as printed on a scale or spoken: no floating-point noise, a true minus sign (U+2212) when negative. */
export function faderNumber(value: number): string {
  const text = String(Math.abs(tidy(value)));
  return value < 0 && text !== "0" ? `−${text}` : text;
}

/** The input's `aria-valuetext` for a unit: the value followed by `unit` as written (" dB", "%"). */
export function faderValueText(value: number, unit: string): string {
  return `${faderNumber(value)}${unit}`;
}

/**
 * The printed marks: `marks` as given (numbers, or values with labels), or that many evenly spaced from `min` to
 * `max`. By default a detented fader with at most 12 positions prints one per detent, every other fader 5 (the ends
 * and the quarters).
 */
export function faderMarks(range: FaderRange, marks?: number | readonly (number | FaderMark)[], detents?: number): FaderMark[] {
  const { min, max } = range;
  const count = marks ?? (detents && detents <= 12 ? Math.round(detents) : 5);
  const list: readonly (number | FaderMark)[] = typeof count === "number"
    ? count < 1 ? [] : count === 1 ? [min] : Array.from({ length: Math.round(count) }, (_, index) => tidy(min + ((max - min) * index) / (Math.round(count) - 1)))
    : count;
  return list.map(mark => (typeof mark === "number" ? { value: mark } : mark)).filter(mark => mark.value >= min && mark.value <= max);
}

/** The root's style: where the value sits (`--strata-fader-value`, 0–1 to four places) and a travel other than the size's. */
export function faderStyle(value: number, range: FaderRange, travel?: number): string {
  const fraction = Math.round(faderFraction(value, range) * 10000) / 10000;
  return `--strata-fader-value: ${fraction};${travel !== undefined ? ` --strata-fader-travel: ${travel}px;` : ""}`;
}

/** A mark's style: where it sits along the travel (`--strata-fader-at`, 0–1 to four places). */
export function faderMarkStyle(value: number, range: FaderRange): string {
  return `--strata-fader-at: ${Math.round(faderFraction(value, range) * 10000) / 10000};`;
}

/** Everything a binding needs to render a fader's markup, from its props. */
export interface FaderModel {
  min: number;
  max: number;
  step: number;
  detented: boolean;
  vertical: boolean;
  /** The root's `style` attribute. */
  style: string;
  /** The printed marks, each with its `style` and the text it prints. */
  marks: { value: number; text: string; style: string }[];
  /** The input's `aria-valuetext`, when a unit or a format gives one. */
  valueText?: string;
}

export interface FaderModelInput {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  detents?: number;
  /** The travel in CSS px, instead of the size's (`size.fader`). */
  travel?: number;
  orientation?: FaderOrientation;
  marks?: number | readonly (number | FaderMark)[];
  unit?: string;
  format?: (value: number) => string;
}

/** The markup data for a fader (anatomy page `fader.md`): 0–100 in steps of 1, vertical, unless given. */
export function faderModel({ value, min = 0, max = 100, step, detents, travel, orientation = "vertical", marks, unit, format }: FaderModelInput): FaderModel {
  const detented = detents !== undefined && detents >= 2;
  const range = { min, max, step: detented ? faderDetentStep(min, max, detents) : step ?? 1 };
  return {
    min, max, step: range.step, detented, vertical: orientation !== "horizontal",
    style: faderStyle(value, range, travel),
    marks: faderMarks(range, marks, detented ? detents : undefined).map(mark => ({ value: mark.value, text: mark.label ?? faderNumber(mark.value), style: faderMarkStyle(mark.value, range) })),
    ...(format ? { valueText: format(value) } : unit !== undefined ? { valueText: faderValueText(value, unit) } : {}),
  };
}
