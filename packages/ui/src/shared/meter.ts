/**
 * Meter and Gauge (anatomy pages `meter.md`, `gauge.md`; design language section 6, the Instrument object table, and
 * section 12, *Springs, detents and snaps*): the value maths, the zones, the segments, the printed scale and the
 * markup data every binding renders, shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU
 * helper and the tests, so all of them agree.
 *
 * A Meter or Gauge is a native `<meter>` (role `meter`, a read-only measurement with `min`, `max`, `low`, `high` and
 * `optimum`). The drawn object lies over it: a bar of LED segments (`bar`), or a needle on a printed arc (`needle`, and a
 * Gauge, whose dial is round). The value reaches the drawing as one number, `--strata-meter-value` (0 at `min`, 1 at
 * `max`), so a value change is a uniform update on the GPU and never a capture at the Instrument level.
 */
import { faderNumber, faderValueText } from "./fader.ts";
import { switchSpringCurve, type SwitchSpring } from "./switch-forms.ts";

/** A Meter's forms: a bar of LED segments, or a needle on a printed arc. */
export const meterForms = ["bar", "needle"] as const;
export type StrataMeterForm = (typeof meterForms)[number];
/** Whether `value` names one of the Meter's forms. */
export const isMeterForm = (value: unknown): value is StrataMeterForm => (meterForms as readonly unknown[]).includes(value);

/** The segments a bar has by default (design language section 6: 16†, I0.1), and the most it may have. */
export const meterDefaults = { segments: 16, minSegments: 2, maxSegments: 32, marks: { bar: 5, needle: 3, dial: 5 } } as const;

/** A printed mark on the scale: a tick and a numeral at `value`, reading `label` (the value by default). */
export interface MeterMark {
  value: number;
  label?: string;
}

/** A native meter's attributes as the HTML standard reads them (`min`, `max`, `low`, `high`, `optimum`). */
export interface MeterRange {
  min: number;
  max: number;
  low?: number;
  high?: number;
  optimum?: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** A number without floating-point noise: `0.30000000000000004` → `0.3`. */
const tidy = (value: number) => Number(value.toFixed(6));

/**
 * The range the browser works with: `max` at least `min`, `low` and `high` within them (`low` at least `min`, `high` at
 * most `max` and at least `low`) and `optimum` within them, each defaulting as the HTML standard says (`low` the minimum,
 * `high` the maximum, `optimum` the middle).
 */
export function meterBounds({ min, max, low, high, optimum }: MeterRange): Required<MeterRange> {
  const top = Math.max(min, max), lowest = clamp(low ?? min, min, top);
  return { min, max: top, low: lowest, high: clamp(high ?? top, lowest, top), optimum: clamp(optimum ?? (min + top) / 2, min, top) };
}

/** Where `value` sits along the range, 0–1 (0 at the minimum). */
export function meterFraction(value: number, { min, max }: Pick<MeterRange, "min" | "max">): number {
  return max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
}

/** The zone of a value (HTML standard, *meter*): the region of `optimum` is good, the next one is suboptimal, the far one is the worst. */
export type MeterZone = "good" | "warn" | "bad";
export const meterZones: readonly MeterZone[] = ["good", "warn", "bad"];
/** The colour role a zone takes (`colour.success`, `colour.warning`, `colour.danger`). */
export const meterZoneRoles: Record<MeterZone, "success" | "warning" | "danger"> = { good: "success", warn: "warning", bad: "danger" };

/** Which of the three regions (below `low`, between, above `high`) holds `value`. */
const regionOf = (value: number, { low, high }: Required<MeterRange>) => (value < low ? 0 : value > high ? 2 : 1);

/** The zone `value` is in, by the native meter's rule. */
export function meterZone(value: number, range: MeterRange): MeterZone {
  const bounds = meterBounds(range);
  return meterZones[Math.abs(regionOf(value, bounds) - regionOf(bounds.optimum, bounds))]!;
}

/** The segment count within the limits (a whole number from 2 to 32), 16 by default. */
export function meterSegmentCount(segments?: number): number {
  return segments === undefined || !Number.isFinite(segments) ? meterDefaults.segments : clamp(Math.round(segments), meterDefaults.minSegments, meterDefaults.maxSegments);
}

/**
 * How many segments are lit at `fraction` of the range: segment `i` (from 0) is lit when `fraction · count − i − ½ > 0`, so
 * half the range lights half the segments and nothing lights none. The CSS computes the same with one `clamp()` per segment.
 */
export function segmentsLit(fraction: number, count: number): number {
  return clamp(Math.ceil(clamp(fraction, 0, 1) * count - 0.5 - 1e-9), 0, count);
}

/** The zone of each segment: the zone of the value at the middle of the share of the range it stands for. */
export function segmentZones(count: number, range: MeterRange): MeterZone[] {
  const { min, max } = meterBounds(range);
  return Array.from({ length: count }, (_, index) => meterZone(min + ((index + 0.5) / count) * (max - min), range));
}

// ---- Peak hold -------------------------------------------------------------------------------------------------------

/** A held peak: where it was set (0–1) and when (ms). */
export interface PeakState { value: number; time: number }
/** The peak tokens (`meter.peakHold`, `meter.peakDecay`): the hold in ms, the fall in shares of the range a second. */
export interface PeakTokens { hold: number; decay: number }
export const peakDefaults: PeakTokens = { hold: 600, decay: 0.5 };

/**
 * The held peak at `now` (ms) for a signal at `fraction`: a signal that reaches the peak resets it; otherwise it stays
 * for `hold` ms and then falls `decay` of the range a second, never below the signal. Returns the new state, the peak's
 * place (0–1) and whether it is still above the signal (the caller needs another frame while it is).
 */
export function advancePeak(state: PeakState | undefined, fraction: number, now: number, tokens: PeakTokens = peakDefaults): { state: PeakState; value: number; falling: boolean } {
  const signal = clamp(fraction, 0, 1);
  if (!state || signal >= state.value) return { state: { value: signal, time: now }, value: signal, falling: false };
  const fall = (Math.max(0, now - state.time - tokens.hold) / 1000) * tokens.decay, value = Math.max(signal, state.value - fall);
  if (value <= signal) return { state: { value: signal, time: now }, value: signal, falling: false };
  return { state, value, falling: true };
}

/** The index (from 0) of the segment a peak at `fraction` holds lit, or −1 for none. */
export const peakIndex = (fraction: number, count: number) => segmentsLit(fraction, count) - 1;

/** The premium tokens' defaults for a lit segment's emitter (`emitter.segment.*`): reach and height in lens diameters; the strength is for a 10 px lens. */
export const segmentEmitterDefaults = { radius: 3, height: 0.8, strength: 260 } as const;

// ---- Springs ---------------------------------------------------------------------------------------------------------

/** `spring.meter` and `spring.gauge` (design language section 12): a needle's position `t`, per unit mass. */
export const meterSprings: Record<"meter" | "gauge", SwitchSpring> = { meter: { stiffness: 360, damping: 28 }, gauge: { stiffness: 160, damping: 20 } };
/** A needle's spring as the CSS transition the recipe uses: a duration and a `linear()` easing through the spring's samples. */
export const meterSpringCurve = (kind: "meter" | "gauge") => switchSpringCurve(meterSprings[kind]);

// ---- The printed scale -----------------------------------------------------------------------------------------------

/** A mark's numeral and style: where it sits along the range (`--strata-meter-at`, 0–1 to four places). */
export interface MeterMarkModel { value: number; text: string; style: string }

/**
 * The printed marks: `marks` as given (numbers, or values with labels), or that many evenly spaced from `min` to `max`.
 * By default a bar prints 5 (the ends and the quarters), a needle meter 3 and a gauge 5.
 */
export function meterMarks(range: MeterRange, marks: number | readonly (number | MeterMark)[] | undefined, fallback: number): MeterMarkModel[] {
  const { min, max } = meterBounds(range), count = marks ?? fallback;
  const list: readonly (number | MeterMark)[] = typeof count === "number"
    ? count < 1 ? [] : count === 1 ? [min] : Array.from({ length: Math.round(count) }, (_, index) => tidy(min + ((max - min) * index) / (Math.round(count) - 1)))
    : count;
  return list.map(mark => (typeof mark === "number" ? { value: mark } : mark)).filter(mark => mark.value >= min && mark.value <= max)
    .map(mark => ({ value: mark.value, text: mark.label ?? faderNumber(mark.value), style: `--strata-meter-at: ${Math.round(meterFraction(mark.value, { min, max }) * 10000) / 10000};` }));
}

/** The meter's `aria-valuetext` for a unit: the value followed by `unit` as written (" dB", "%"). */
export const meterValueText = (value: number, unit: string) => faderValueText(value, unit);

/** The root's style: where the value sits (`--strata-meter-value`, 0–1 to four places), the segment count, and the zones of a dial. */
export function meterStyle(value: number, range: MeterRange, extra: { count?: number; low?: boolean; high?: boolean } = {}): string {
  const bounds = meterBounds(range), fixed = (n: number) => Math.round(n * 10000) / 10000;
  let style = `--strata-meter-value: ${fixed(meterFraction(value, bounds))};`;
  if (extra.count !== undefined) style += ` --strata-meter-count: ${extra.count};`;
  // A dial prints a red zone below `low` and above `high`, when the author gave them.
  if (extra.low) style += ` --strata-meter-lo: ${fixed(meterFraction(bounds.low, bounds))};`;
  if (extra.high) style += ` --strata-meter-hi: ${fixed(meterFraction(bounds.high, bounds))};`;
  return style;
}

/** The attributes of the native `<meter>`: only the ones the author gave, as the browser reads them. */
export interface MeterNative {
  min: number;
  max: number;
  value: number;
  low?: number;
  high?: number;
  optimum?: number;
}

/** Everything a binding needs to render a Meter's or Gauge's markup, from its props. */
export interface MeterModel {
  form: StrataMeterForm | "dial";
  /** The root's classes, after `ug-meter`. */
  classes: string[];
  /** The root's `style` attribute. */
  style: string;
  native: MeterNative;
  /** The segments of a bar, each with its zone and style (`--_i`, its index). */
  segments: { zone: MeterZone; style: string }[];
  /** The printed marks, each with its `style` and the text it prints. */
  marks: MeterMarkModel[];
  /** The native meter's `aria-valuetext`, when a unit or a format gives one. */
  valueText?: string;
  /** Whether the bar holds a peak. */
  peak: boolean;
}

export interface MeterModelInput {
  value: number;
  min?: number;
  max?: number;
  low?: number;
  high?: number;
  optimum?: number;
  /** `bar` (the default) or `needle`; a Gauge is a dial. */
  form?: StrataMeterForm | "dial";
  /** A bar's segments: 16 by default. */
  segments?: number;
  marks?: number | readonly (number | MeterMark)[];
  unit?: string;
  format?: (value: number) => string;
  /** A bar holds the highest segment lit, and lets it fall (`meter.peakHold`, `meter.peakDecay`). */
  peak?: boolean;
}

/** The markup data for a Meter (`form` bar or needle) or a Gauge (`form` dial): 0–100 unless given (the native meter's own default is 0–1). */
export function meterModel({ value, min = 0, max = 100, low, high, optimum, form = "bar", segments, marks, unit, format, peak }: MeterModelInput): MeterModel {
  const range: MeterRange = { min, max, low, high, optimum }, bounds = meterBounds(range);
  const current = clamp(value, bounds.min, bounds.max), count = meterSegmentCount(segments);
  const bar = form === "bar";
  return {
    form, classes: [`ug-meter--${form}`, ...(bar && peak ? ["ug-meter--peak"] : []), ...(form === "dial" ? ["ug-gauge"] : [])],
    style: meterStyle(current, range, { ...(bar ? { count } : {}), low: !bar && low !== undefined, high: !bar && high !== undefined }),
    native: { min, max: bounds.max, value: current, ...(low !== undefined ? { low: bounds.low } : {}), ...(high !== undefined ? { high: bounds.high } : {}), ...(optimum !== undefined ? { optimum: bounds.optimum } : {}) },
    segments: bar ? segmentZones(count, range).map((zone, index) => ({ zone, style: `--_i: ${index};` })) : [],
    marks: meterMarks(range, marks, meterDefaults.marks[form]),
    ...(format ? { valueText: format(current) } : unit !== undefined ? { valueText: meterValueText(current, unit) } : {}),
    peak: bar && !!peak,
  };
}

/** The rotation of a needle at position `t` (0–1) about its pivot, degrees: 0 points up at the middle of the sweep. */
export const needleTurn = (t: number, sweep: number) => (clamp(t, 0, 1) - 0.5) * sweep;

/** The needle's numbers (px, at 50% depth; heights scale with depth): the blade, its tail behind the pivot and the hub. */
export const needleGeometry = { width: 2.2, height: 2.4, tail: 12, hubRadius: 6, hubHeight: 4, bezel: 5, bezelHeight: 3 } as const;
