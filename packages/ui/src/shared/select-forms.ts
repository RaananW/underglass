/**
 * The Select's hardware forms (anatomy page `select.md`, section 11; design language sections 6 and 12): a Select as a rotary selector
 * (`form="selector"`) or as a display with step buttons (`form="display"`). The names, the rule that decides which of the two a given
 * list of options can take, and the markup data every binding renders for them. Shared by the React, Vue and Astro bindings, the plain-DOM
 * behaviour, the GPU helper and the tests, so all of them agree.
 *
 * The Select's own `<select>` stays the control in both (its `name`, `form` owner, `value`, `required`, `id`, Field wiring, every native key,
 * type-ahead and the browser's own list). `selector` draws it as the RotarySelector's object (the markup of `RotarySelector`, classes
 * `ug-rotary__*`, without its printed legend title, which the Field's label replaces), so the behaviour (`attachStrataRotarySelectors`), the
 * CSS and the GPU helper at every level are the RotarySelector's, unchanged. `display` draws it as a Display (the Display's bezel, window and
 * backlight, the select's own text printed under the glass) between two momentary push buttons that step its value.
 */
import { rotaryModel, type RotaryModel, type RotaryOption } from "./rotary-selector.ts";

/** The name that keeps today's look: reserved, never the native `form` attribute. */
export const SELECT_FLUSH = "flush";
/** The Select's forms that are drawn: a rotary selector, and a display with step buttons. */
export type StrataSelectForm = "selector" | "display";
const reserved: readonly string[] = [SELECT_FLUSH, "selector", "display"];

/** The form a Select takes from its `form` prop: `selector` or `display`, or none (`flush` and any other string are not drawn forms). */
export const selectForm = (form: unknown): StrataSelectForm | undefined => (form === "selector" || form === "display" ? form : undefined);
/**
 * The value to leave as the native `form` attribute (the id of a form owner) once the form names are taken out: the reserved names are not
 * form owners; any other string is, as before.
 */
export const selectOwner = (form: unknown): string | undefined => (typeof form === "string" && !reserved.includes(form) ? form : undefined);

/** One option of the select: what a binding reads from its `<option>` children. */
export type SelectOption = RotaryOption;

/**
 * The most options a `selector` prints round its dial, and the longest label (in characters) it prints there. A dial's labels sit on a
 * 270 degree arc, which fits about eight short words; beyond that they collide, so the selector gives way to the display.
 */
export const SELECTOR_MAX_OPTIONS = 8;
export const SELECTOR_MAX_LABEL = 12;

/** What decides the form: the options a binding could read (none when it cannot read them all), and whether the select is a list box. */
export interface SelectShape {
  /** The `<option>`s in order; absent when the binding cannot read them (a custom component renders them, say). */
  options?: readonly SelectOption[];
  /** Whether any `<option>` sits in an `<optgroup>`. */
  grouped?: boolean;
  /** `multiple` or `size > 1`: a native list box, which no form draws. */
  list?: boolean;
}

/**
 * The form a Select is actually drawn as, from the form asked for and what the select holds (the documented rule, `select.md` section 11):
 * - a list box (`multiple`, `size > 1`) is always the flush control: the browser draws a list box and no form replaces it;
 * - `display` is `display`: it prints one label whatever the count, so it takes any list, optgroups included;
 * - `selector` is `selector` for up to `SELECTOR_MAX_OPTIONS` options with labels of at most `SELECTOR_MAX_LABEL` characters and no
 *   optgroup; otherwise it is drawn as `display`, which keeps the hardware face and scales to any list. So are options a binding cannot read
 *   (no labels to print round a dial), and a select with no option (nothing to select).
 * The result is what `data-strata-form` says.
 */
export function selectFormFor(form: StrataSelectForm | undefined, shape: SelectShape): StrataSelectForm | undefined {
  if (!form || shape.list) return undefined;
  if (form === "display") return "display";
  const options = shape.options;
  const fits = !!options && options.length > 0 && options.length <= SELECTOR_MAX_OPTIONS && !shape.grouped && options.every(option => option.label.length <= SELECTOR_MAX_LABEL);
  return fits ? "selector" : "display";
}

/** The data a `selector` form renders (the RotarySelector's, for the Select's options and value). */
export const selectorModel = (options: readonly SelectOption[], value: string | undefined, sweep?: number): RotaryModel => rotaryModel({ options, value, sweep });

/** The display form's step buttons, in order: the one that steps back and the one that steps forward. */
export const selectSteps = [{ step: -1, name: "previous", className: "ug-select-display__step ug-select-display__step--previous" }, { step: 1, name: "next", className: "ug-select-display__step ug-select-display__step--next" }] as const;

/** The classes of the display form's root, and of the Display inside it (the TextField's display markup, `--input`). */
export const selectDisplayClass = "ug-select-display";

/** The index of the option a step of `direction` from `from` selects: the next enabled option, or `from` at the end of the list. */
export function selectStepIndex(from: number, direction: 1 | -1, disabled: readonly boolean[]): number {
  for (let index = from + direction; index >= 0 && index < disabled.length; index += direction) if (!disabled[index]) return index;
  return from;
}

/** Reads an `<option>`'s label as the browser does: its text with the whitespace collapsed. */
export const optionLabel = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * The options of a server-rendered `<option>` run (an Astro slot): each `<option>`'s value (its attribute, or its text), label and disabled
 * state, and the value of the first one marked `selected`; `grouped` when an `<optgroup>` is among them. Anything that is not plain `<option>` text makes the options unreadable (undefined).
 */
export function parseOptionsHtml(html: string): { options: SelectOption[]; grouped: boolean; selected?: string } | undefined {
  const grouped = /<optgroup[\s>]/i.test(html);
  const options: SelectOption[] = [];
  const pattern = /<option\b([^>]*)>([\s\S]*?)<\/option\s*>/gi;
  const unescape = (text: string) => text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: "\"", "#39": "'", nbsp: " " })[name]!);
  let last = 0, selected: string | undefined;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    const between = html.slice(last, match.index).replace(/<\/?optgroup\b[^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
    if (between.trim()) return undefined;
    last = pattern.lastIndex;
    const [, attributes = "", inner = ""] = match;
    if (/</.test(inner)) return undefined;
    const label = optionLabel(unescape(inner)), value = /\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
    options.push({ value: value ? unescape(value[1] ?? value[2] ?? value[3] ?? "") : label, label, ...(/\bdisabled\b/i.test(attributes) ? { disabled: true } : {}) });
    if (selected === undefined && /\bselected\b/i.test(attributes)) selected = options[options.length - 1]!.value;
  }
  const rest = html.slice(last).replace(/<\/?optgroup\b[^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  return rest.trim() ? undefined : { options, grouped, ...(selected !== undefined ? { selected } : {}) };
}
