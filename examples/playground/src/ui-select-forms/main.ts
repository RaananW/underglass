/**
 * Entry for `ui-select-forms.html`: the Select's hardware forms in plain contract markup (anatomy page `select.md`, section 11) with
 * `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an
 * Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataSelectProbe` is the hook for `tests/browser/ui-select-forms.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the page at the Objects level, and `?level=instrument` at the Instrument
 *   level (core's `instrument` material: the selector's skirt, cap and pointer and the step buttons' bezels, rings and caps as parts, the displays'
 *   bezels and panes).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks).
 * - `?flush` renders the same selects in their flush markup (the key with a chevron), the look they had before the forms.
 * Selects `#wave` (a selector, four short options), `#preset` (a display, seven options), `#size` (flush, three options), `#many` (asked as a selector,
 * eleven options: drawn as a display by the documented rule), `#grouped` (asked as a selector, with optgroups: drawn as a display) and `#locked` (a
 * disabled selector), each in a Field.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const flush = params.has("flush");

interface Option { value: string; label: string; disabled?: boolean; group?: string }
const four4: Option[] = [{ value: "sine", label: "Sine" }, { value: "tri", label: "Tri" }, { value: "saw", label: "Saw" }, { value: "square", label: "Square" }];
const presets: Option[] = ["Init", "Warm Pad", "Glass Bell", "Sub Bass", "Pluck", "Choir", "Strings"].map(label => ({ value: label.toLowerCase().replace(/\s+/g, "-"), label }));
const sizes: Option[] = [{ value: "s", label: "Small" }, { value: "m", label: "Medium" }, { value: "l", label: "Large" }];
const many: Option[] = Array.from({ length: 11 }, (_, index) => ({ value: `ch${index + 1}`, label: `Ch ${index + 1}` }));
const grouped: Option[] = [{ value: "a1", label: "Kick", group: "Drums" }, { value: "a2", label: "Snare", group: "Drums" }, { value: "b1", label: "Bass", group: "Synth" }, { value: "b2", label: "Lead", group: "Synth" }];

const optionsHtml = (options: Option[], value: string) => {
  const html = (option: Option) => `<option value="${option.value}"${option.disabled ? " disabled" : ""}${option.value === value ? " selected" : ""}>${option.label}</option>`;
  const groups = [...new Set(options.map(option => option.group).filter(Boolean))];
  return groups.length ? groups.map(group => `<optgroup label="${group}">${options.filter(option => option.group === group).map(html).join("")}</optgroup>`).join("") : options.map(html).join("");
};
const fraction = (index: number, count: number) => Math.round((count > 1 ? index / (count - 1) : 0.5) * 10000) / 10000;
const step = (direction: -1 | 1, disabled: boolean) => `<button type="button" class="ug-button ug-push ug-select-display__step ug-select-display__step--${direction < 0 ? "previous" : "next"}" tabindex="-1" aria-hidden="true" data-strata-form="momentary" data-strata-step="${direction}"${disabled ? " disabled" : ""}><span class="ug-push__object" aria-hidden="true"><span class="ug-push__bezel" data-strata-face="raised"></span><span class="ug-push__socket"></span><span class="ug-push__ring"></span></span><span class="ug-push__cap" data-strata-face="raised"><span class="ug-select-display__glyph"></span></span></button>`;

/** A Select in a Field, as the flush key, a selector (up to eight short options, no optgroup) or a display, as `select.md` section 11 says it is drawn. */
function select({ id, label, form, options, value, disabled }: { id: string; label: string; form?: "selector" | "display"; options: Option[]; value: string; disabled?: boolean }) {
  const index = Math.max(0, options.findIndex(option => option.value === value));
  const drawn = flush || !form ? undefined : form === "display" || options.length > 8 || options.some(option => option.group || option.label.length > 12) ? "display" : "selector";
  const field = (control: string) => `<div class="ug-field" id="${id}-field"><label class="ug-field__label" for="${id}">${label}</label>${control}</div>`;
  const off = disabled ? " disabled" : "";
  if (!drawn) return field(`<select class="ug-select" data-strata-face="raised" id="${id}" name="${id}"${off}>${optionsHtml(options, value)}</select>`);
  if (drawn === "selector") {
    const marks = options.map((option, at) => `<span class="ug-rotary__mark" data-strata-value="${option.value}" data-strata-selected="${at === index}"${option.disabled ? ' data-strata-disabled="true"' : ""} style="--strata-rotary-at: ${fraction(at, options.length)};"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">${option.label}</span></span>`).join("");
    const legend = options.map((option, at) => `<li data-strata-selected="${at === index}">${option.label}</li>`).join("");
    return field(`<div class="ug-rotary" data-strata-form="selector" style="--strata-rotary-value: ${fraction(index, options.length)};"><div class="ug-rotary__dial"><span class="ug-rotary__scale" aria-hidden="true">${marks}</span><span class="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-rotary__cap" data-strata-face="raised"><span class="ug-rotary__pointer"></span></span></span><select class="ug-rotary__select" id="${id}" name="${id}"${off}>${optionsHtml(options, value)}</select></div><ol class="ug-rotary__legend" aria-hidden="true">${legend}</ol></div>`);
  }
  return field(`<span class="ug-select-display" data-strata-form="display">${step(-1, !!disabled)}<span class="ug-display ug-display--input ug-select-display__window" data-strata-form="display"><span class="ug-display__object" aria-hidden="true"><span class="ug-display__bezel" data-strata-face="groove"><span class="ug-display__window" data-strata-face="flat"></span></span></span><select class="ug-display__text ug-select-display__select" id="${id}" name="${id}"${off}>${optionsHtml(options, value)}</select></span>${step(1, !!disabled)}</span>`);
}

const markup = `
  <h2 id="sel-title" style="margin:0 0 12px;font-size:18px">Voice</h2>
  <div class="row" id="sel-row-1">
    ${select({ id: "wave", label: "Wave", form: "selector", options: four4, value: "saw" })}
    ${select({ id: "preset", label: "Preset", form: "display", options: presets, value: "warm-pad" })}
  </div>
  <div class="row" id="sel-row-2">
    ${select({ id: "size", label: "Size", options: sizes, value: "m" })}
    ${select({ id: "many", label: "Channel", form: "selector", options: many, value: "ch3" })}
  </div>
  <div class="row" id="sel-row-3">
    ${select({ id: "grouped", label: "Sound", form: "selector", options: grouped, value: "b1" })}
    ${select({ id: "locked", label: "Locked", form: "selector", options: four4, value: "tri", disabled: true })}
  </div>
  <p class="read" id="sel-read">No changes yet</p>`;

const events: { id: string; type: string; value: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "sel-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "sel-title");
  section.innerHTML = markup;
  const read = section.querySelector("#sel-read")!;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const target = event.target as HTMLSelectElement;
    if (!(target instanceof HTMLSelectElement)) return;
    events.push({ id: target.id, type, value: target.value });
    if (type === "change") read.textContent = `${target.id} is ${target.value}`;
  });
  return section;
}

let controller: CanvasController | undefined;
if (params.has("plain")) {
  document.body.classList.add("plain");
  host("frame").hidden = true;
  panel = build();
  host("frame").after(panel);
  attachStrata();
} else {
  controller = mountApplicationModule({
    outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
    onStatus: message => { host("status").textContent = message; },
    onStatusChange: () => strata?.refresh(),
  }, { mount({ container }) {
    panel = build();
    Object.assign(panel.style, compileStyle({ x: 20, y: 20, width: 600 }, {}, true));
    container.append(panel);
    return () => container.replaceChildren();
  } });
  attachStrata();
  const level = params.get("level");
  strata = attachStrataGpu(controller, { level: level === "objects" || level === "instrument" ? level : undefined });
  host("enable").addEventListener("click", () => void controller!.enable());
  host("disable").addEventListener("click", () => void controller!.disable());
  if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());
}

type Counts = { mode: string; captures: number; uploads: number; geometryUpdates: number };
window.strataSelectProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  /** Sets a select's value as script does, then fires `input` and `change`; the dial follows through the behaviour's listeners. */
  setSelect: (id: string, value: string) => {
    const element = document.getElementById(id) as HTMLSelectElement;
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  },
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataSelectProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void; setSelect(id: string, value: string): void;
    state(): Record<string, unknown> | undefined; counts(): Counts | undefined;
  } }
}
