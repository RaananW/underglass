/**
 * The indicator forms of the everyday controls (anatomy pages `rating.md`, `badge.md`, `progress-bar.md` and `spinner.md`,
 * *Indicator form*; design language sections 3 and 6): a Rating as a row of lamps (`form="lamps"`), a Badge as an LED pill
 * (`form="led"`), a ProgressBar as a segment meter (`form="meter"`) and a Spinner as a ring of LEDs (`form="ring"`). Their
 * names, the decorative markup every binding renders for them, the numbers of their boxes and the maths of the chase.
 * Shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU helper and the tests, so all of them agree.
 *
 * Each lens is the Lamp's and the StatusLight's: lit by `--strata-lit` (`shared/lamp.ts`), an emitter at every GPU level.
 * The native control stays the control (a Rating's radios, a ProgressBar's `<progress>`, a Badge's and a Spinner's `<span>`),
 * and the form is decoration over it that follows its state.
 */
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** The name that keeps today's look: reserved on every control that has an indicator form, never the native `form` attribute. */
export const INDICATOR_FLUSH = "flush";

/** The Rating's form: a row of lamps. */
export type StrataRatingForm = "lamps";
/** The Badge's form: an LED pill. */
export type StrataBadgeForm = "led";
/** The ProgressBar's form: a segment meter. */
export type StrataProgressForm = "meter";
/** The Spinner's form: a ring of LEDs. */
export type StrataSpinnerForm = "ring";

/** The form a Rating takes from its `form` prop: `lamps`, or none (`flush` and any other string are not forms). */
export const ratingForm = (form: unknown): StrataRatingForm | undefined => (form === "lamps" ? "lamps" : undefined);
/** The form a Badge takes from its `form` prop: `led`, or none. */
export const badgeForm = (form: unknown): StrataBadgeForm | undefined => (form === "led" ? "led" : undefined);
/** The form a ProgressBar takes from its `form` prop: `meter`, or none. */
export const progressForm = (form: unknown): StrataProgressForm | undefined => (form === "meter" ? "meter" : undefined);
/** The form a Spinner takes from its `form` prop: `ring`, or none. */
export const spinnerForm = (form: unknown): StrataSpinnerForm | undefined => (form === "ring" ? "ring" : undefined);
/**
 * The value to leave as the native `form` attribute (the id of a form owner) once the form names are taken out: `flush` and the
 * control's own form name are not form owners; any other string is, as before. Only a Rating (a `<fieldset>`) has one to leave.
 */
export const ratingOwner = (form: unknown): string | undefined => (typeof form === "string" && form !== INDICATOR_FLUSH && form !== "lamps" ? form : undefined);

/** One decorative element of an indicator: its class and its Relief marker. */
export interface IndicatorPart { className: string; face?: "knob" }

/** The lens inside a Rating's `.ug-rating__star` (the socket under it is the lens's own `::before`, printed on the face). */
export const ratingLampMarkup: IndicatorPart[] = [{ className: "ug-rating__lens", face: "knob" }];
/** The lens in front of a Badge's content. */
export const badgeLensMarkup: IndicatorPart = { className: "ug-badge__lens", face: "knob" };

/** The lens diameter of a Rating per `size` (`size.rating.*`), CSS px. */
export const ratingLens = { small: 12, medium: 16, large: 20 } as const;
/** The ring diameter of a Spinner per size (`size.spinner.*`), CSS px: the lenses' centres lie on it. */
export const spinnerRing = { small: 24, medium: 36, large: 52 } as const;
/** The room round a lens in its box: the bloom's halo, 8 px each side (the StatusLight's). */
export const INDICATOR_ROOM = 16;
/** A Rating item's box (a square): the lens plus its room, at least the target size. */
export const ratingBox = (lens: number, target = 24) => Math.max(target, lens + INDICATOR_ROOM);
/** A Spinner's ring box (a square): the ring plus the room. */
export const spinnerBox = (ring: number) => ring + INDICATOR_ROOM;
/** A Spinner's lens diameter: a fifth of the ring, at least 5 px (`max(5px, ring × 0.2)` in the stylesheet). */
export const spinnerLens = (ring: number) => Math.max(5, ring * 0.2);

/** How many lenses a ring has, and a bar has by default and at most and least. */
export const spinnerLenses = 8;
export const progressDefaults = { segments: 20, minSegments: 4, maxSegments: 32 } as const;

/** A Progress bar's segment count from its `segments` prop. */
export function progressSegmentCount(segments?: number): number {
  return Number.isFinite(segments) ? clamp(Math.round(segments!), progressDefaults.minSegments, progressDefaults.maxSegments) : progressDefaults.segments;
}
const fixed = (value: number) => Math.round(value * 10000) / 10000;

/**
 * A determinate bar's fraction, 0 to 1: `value` over `max` (1 by default, as the native `<progress>` reads it; the bindings pass their own 100), or
 * undefined while it is indeterminate (no `value`).
 */
export function progressFraction(value: number | undefined, max = 1): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  const top = Number.isFinite(max) && max > 0 ? max : 1;
  return fixed(clamp(value / top, 0, 1));
}

/** The root's style: the segment count and, while determinate, the value (`--strata-progress-value`, 0–1 to four places). */
export function progressStyle(fraction: number | undefined, count: number): string {
  return `--strata-progress-count: ${count};${fraction === undefined ? "" : ` --strata-progress-value: ${fraction};`}`;
}
/** A segment's (or a ring lens's) style: its index, `--_i`. */
export const lensStyle = (index: number) => `--_i: ${index};`;
/** The indices of a bar's segments, and of a ring's lenses. */
export const progressSegments = (count: number): number[] => Array.from({ length: count }, (_, index) => index);
export const spinnerLensIndices: number[] = progressSegments(spinnerLenses);

/**
 * The tempo of a chase, one full lap, in ms, held to the blink floor: a lens is lit once a lap, so a lap of 334 ms or more keeps it
 * to three flashes a second at most (WCAG 2.3.1). The stylesheet's `--strata-chase-*` come from `chase.*`; this is the check.
 */
export const MIN_CHASE_MS = 334;
export const chaseFlashesPerSecond = (lapMs: number) => 1000 / Math.max(lapMs, 1);
/** The chase tokens' defaults (`chase.spinner`, `chase.bar`), ms per lap. */
export const chaseDefaults = { spinner: 900, bar: 1600 } as const;

/** The chase keyframes' stops (`ug-chase` for a spinner, `ug-chase-bar` for a bar): the share of the lap and how lit the lens is there. */
export const chaseStops: Record<"spinner" | "bar", readonly (readonly [number, number])[]> = {
  spinner: [[0, 1], [0.12, 0.55], [0.3, 0.2], [0.55, 0], [1, 0]],
  bar: [[0, 1], [0.06, 0.5], [0.14, 0.15], [0.25, 0], [1, 0]],
};
/**
 * How lit a lens `index` of `count` is at `time` ms into a chase of `lap` ms: the lens lights at `index / count` of the lap and fades over
 * the keyframes' trail (`chaseStops`, linear between them). The test of the stylesheet and the model of the steady pattern's trail.
 */
export function chaseLit(index: number, count: number, time: number, lap: number, kind: "spinner" | "bar" = "spinner"): number {
  const phase = ((((time / lap) - index / count) % 1) + 1) % 1, stops = chaseStops[kind];
  for (let at = 1; at < stops.length; at++) {
    const from = stops[at - 1]!, to = stops[at]!;
    if (phase <= to[0]) return fixed(from[1] + ((to[1] - from[1]) * (phase - from[0])) / (to[0] - from[0]));
  }
  return 0;
}
/**
 * The steady pattern under `prefers-reduced-motion`: a spinner's comet stopped at lens 0 with a trail behind it (lit 1, 0.75, 0.5,
 * 0.25 for lenses 0, 7, 6, 5), and an indeterminate bar's every other segment lit. Nothing moves, and the status is still the label.
 */
export function steadyLit(kind: "spinner" | "bar", index: number, count: number): number {
  if (kind === "bar") return index % 2 === 0 ? 1 : 0;
  const behind = (count - index) % count;
  return behind <= 3 ? fixed(1 - behind * 0.25) : 0;
}
