/**
 * The RadioGroup's hardware forms (anatomy page `radio.md`, section 11; design language sections 6 and 12): a preset bank (`form="bank"`, the
 * latching forms, `shared/latching-forms.ts`) or a rotary selector (`form="selector"`): the RotarySelector's dial over the group, one
 * detent per radio, the radios' own labels printed round it. The names, the rule that decides which of the two a group can take, and the
 * markup data every binding renders for the selector. Shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU helper
 * and the tests, so all of them agree.
 *
 * The native radios stay the control and sit on their printed labels: each `<input type="radio">` lies inside its label's text, an invisible
 * overlay of at least 24 CSS px, so a press on a printed position is a press on that radio, and Tab, the arrows and Space are the group's. The
 * dial (skirt, cap and pointer) is decoration (`aria-hidden`), turned to the checked radio. It is the RotarySelector's markup and CSS
 * (`ug-rotary__*`, with `ug-rotary--group` on the root) and the Knob's object at the Instrument level, so the Select's limits hold: a dial's
 * labels sit on a 270 degree arc, which fits about eight short words.
 */
import { rotaryFraction, rotaryModel, type RotaryModel, type RotaryOption } from "./rotary-selector.ts";
import { SELECTOR_MAX_LABEL, SELECTOR_MAX_OPTIONS } from "./select-forms.ts";

/** The name that keeps today's look: reserved, never the native `form` attribute. */
export const RADIO_FLUSH = "flush";
/** The RadioGroup's forms that are drawn: a preset bank, and a rotary selector. */
export type StrataRadioForm = "bank" | "selector";
const reserved: readonly string[] = [RADIO_FLUSH, "bank", "selector"];

/** The form a RadioGroup takes from its `form` prop: `bank` or `selector`, or none (`flush` and any other string are not drawn forms). */
export const radioForm = (form: unknown): StrataRadioForm | undefined => (form === "bank" || form === "selector" ? form : undefined);
/** The value to leave as the native `form` attribute (the id of a form owner): the reserved names are not form owners; any other string is, as before. */
export const radioOwner = (form: unknown): string | undefined => (typeof form === "string" && !reserved.includes(form) ? form : undefined);

/** One radio of the group: what a binding reads from its `Radio` children. */
export type RadioOption = RotaryOption;

/**
 * The form a RadioGroup is actually drawn as, from the form asked for and the radios it holds (the documented rule, `radio.md` section 11):
 * `bank` is `bank`; `selector` is `selector` for 2 to `SELECTOR_MAX_OPTIONS` radios whose labels are at most `SELECTOR_MAX_LABEL` characters, otherwise it is
 * drawn as `bank`, which keeps the hardware face and takes any group. So are radios a binding cannot read (a label that is not plain text, a child
 * that is not a radio: no label to print round a dial). `data-strata-form` says which.
 */
export function radioFormFor(form: StrataRadioForm | undefined, options: readonly RadioOption[] | undefined): StrataRadioForm | undefined {
  if (!form || form === "bank") return form;
  const fits = !!options && options.length >= 2 && options.length <= SELECTOR_MAX_OPTIONS && options.every(option => option.label.length > 0 && option.label.length <= SELECTOR_MAX_LABEL);
  return fits ? "selector" : "bank";
}

/** The data a `selector` group renders: the RotarySelector's, for the radios and the checked value (the cap rests at the first position when none is checked). */
export const radioSelectorModel = (options: readonly RadioOption[], value: string | undefined, sweep?: number): RotaryModel => rotaryModel({ options, value: value ?? undefined, sweep });

/** One radio's position style (`--strata-rotary-at`, 0–1): where its label is printed along the sweep. */
export const radioAt = (index: number, count: number) => `--strata-rotary-at: ${Math.round(rotaryFraction(index, count) * 10000) / 10000};`;
