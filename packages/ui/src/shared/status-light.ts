/**
 * The StatusLight (anatomy page `status-light.md`; design language section 3 and 14): the three forms of its native
 * markup, the blink tempos, and the model every binding renders from, so all of them write identical markup.
 *
 * - **`img`** (the default): `<span role="img" aria-label="Connected">` with the lens inside, `aria-hidden`. The label
 *   names the state; the light itself is decoration.
 * - **`text`** (`showLabel`): `<span>` with the lens and the label as visible text.
 * - **`live`** (`live`): `<output>`, whose implicit role `status` is a polite live region, with the lens and the label
 *   as text (visually hidden unless `showLabel`): changing the label names the change to a screen reader. `live` may be
 *   `"assertive"` for `aria-live="assertive"`.
 */
import type { StrataLampColour } from "./lamp.ts";

/**
 * The decorative object of a StatusLight, in paint order: the `socket`, the dark disc printed under the lens at every level
 * (so an unlit LED is a dark glass dome on any faceplate), and the `lens`, a knob face, the emitter's part.
 */
export const statusLightMarkup: { className: string; face?: "knob" }[] = [{ className: "ug-status-light__socket" }, { className: "ug-status-light__lens", face: "knob" }];

/** The blink tempos (`blink.*`): the period of one full on-off cycle, ms. */
export const blinkTempos = ["slow", "normal", "fast"] as const;
export type StrataBlink = (typeof blinkTempos)[number];
export const blinkPeriods: Record<StrataBlink, number> = { slow: 1600, normal: 1000, fast: 400 };
/** The most flashes a second a light may make (WCAG 2.3.1): the period is never under a third of a second. */
export const MAX_FLASHES_PER_SECOND = 3;
/** Flashes a second at a period, ms. */
export const flashesPerSecond = (period: number) => 1000 / period;
/** Whether `value` names a blink tempo. */
export const isBlink = (value: unknown): value is StrataBlink => (blinkTempos as readonly unknown[]).includes(value);

export type StatusLightForm = "img" | "text" | "live";
export type StatusLive = boolean | "polite" | "assertive";

export interface StatusLightInput {
  label: string;
  colour?: StrataLampColour;
  /** Lit or unlit; lit by default. */
  lit?: boolean;
  blink?: StrataBlink;
  /** Shows the label as text beside the lens. */
  showLabel?: boolean;
  /** A live region: an `<output>` that names changes. */
  live?: StatusLive;
}

/** What a binding renders for a StatusLight. */
export interface StatusLightModel {
  form: StatusLightForm;
  /** The root's tag. */
  tag: "span" | "output";
  /** The root's class names. */
  classes: string[];
  /** The root's attributes (strings only; absent when not set). */
  attrs: Record<string, string>;
  /** Whether the label is text in the markup (`text` and `live`), not an `aria-label`. */
  text: boolean;
}

/** The form a StatusLight takes from its props. */
export function statusLightForm({ showLabel, live }: Pick<StatusLightInput, "showLabel" | "live">): StatusLightForm {
  if (live) return "live";
  return showLabel ? "text" : "img";
}

/** The model of a StatusLight: tag, classes and attributes (the Strata props are added by the binding). */
export function statusLightModel(input: StatusLightInput): StatusLightModel {
  const form = statusLightForm(input);
  const attrs: Record<string, string> = {};
  if (input.colour) attrs["data-strata-colour"] = input.colour;
  if (input.lit === false) attrs["data-strata-lit"] = "false";
  if (input.blink) attrs["data-strata-blink"] = input.blink;
  if (form === "img") { attrs.role = "img"; attrs["aria-label"] = input.label; }
  if (form === "live" && input.live === "assertive") attrs["aria-live"] = "assertive";
  return {
    form, tag: form === "live" ? "output" : "span",
    classes: ["ug-status-light", ...(form === "live" && !input.showLabel ? ["ug-status-light--bare"] : [])],
    attrs, text: form !== "img",
  };
}
