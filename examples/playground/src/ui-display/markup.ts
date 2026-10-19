/**
 * The plain contract markup of a Display (anatomy pages `display.md`, `text-field.md` section 11), as an HTML author writes it by hand:
 * the page of `ui-display.html` uses it, so the tests run on what a plain page contains. It imports nothing from `@underglass/ui`.
 */
export interface DisplaySpec {
  id: string;
  /** The label printed above, or an `aria-label` for an output. */
  label: string;
  /** `input` (the TextField's display form), `readonly` (an input that submits) or `output`. */
  kind: "input" | "readonly" | "output";
  value?: string;
  placeholder?: string;
  backlight?: string;
  lit?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  name?: string;
  type?: string;
  live?: "off" | "assertive";
  size?: "small" | "medium" | "large";
  /** The display root's width in px (236 by default). */
  width?: number;
}

const object = `<span class="ug-display__object" aria-hidden="true"><span class="ug-display__bezel" data-strata-face="groove"><span class="ug-display__window" data-strata-face="flat"></span></span></span>`;
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function displayMarkup(spec: DisplaySpec): string {
  const { id, label, kind, value, placeholder, backlight, lit, disabled, invalid, name, type, live, size, width } = spec;
  const root = `class="ug-display ug-display--${kind === "output" ? "output" : "input"}" data-strata-form="display"${backlight ? ` data-strata-backlight="${backlight}"` : ""}${lit === false ? ` data-strata-lit="false"` : ""}${size ? ` data-strata-size="${size}"` : ""}${width ? ` style="width: ${width}px"` : ""}`;
  if (kind === "output") return `<div class="field"${width ? ` style="width: ${width}px"` : ""}><span class="field-label" id="${id}-label">${escape(label)}</span><span ${root}>${object}<output class="ug-display__text" id="${id}" aria-labelledby="${id}-label"${live ? ` aria-live="${live}"` : ""}>${escape(value ?? "")}</output></span></div>`;
  const input = `<input class="ug-display__text" id="${id}" type="${type ?? "text"}"${name ? ` name="${name}"` : ""}${value !== undefined ? ` value="${escape(value)}"` : ""}${placeholder ? ` placeholder="${escape(placeholder)}"` : ""}${kind === "readonly" ? " readonly" : ""}${disabled ? " disabled" : ""}${invalid ? ` aria-invalid="true"` : ""} />`;
  return `<div class="field"${width ? ` style="width: ${width}px"` : ""}><label class="field-label" for="${id}">${escape(label)}</label><span ${root}>${object}${input}</span></div>`;
}
