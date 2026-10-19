/**
 * Entry for `ui-deferred-forms.html`: the three deferred hardware forms of the Instrument plan's everyday table in plain contract markup, with
 * `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root,
 * presented on the GPU by `attachStrataGpu`. `window.strataDeferredProbe` is the hook for `tests/browser/ui-deferred-forms.test.mjs`.
 * - the Slider's `wheel` form (`slider.md` section 11): `#gain` and `#pan` (thumbwheels, three printed marks), `#flatslider` (the flush groove slider), `#locked` (a
 *   disabled wheel);
 * - the RadioGroup's `selector` form (`radio.md` section 11): `#mode` (four radios), `#route` (nine radios asked as a selector: drawn as a bank by the documented rule),
 *   `#flatradio` (the flush group) and `#lockedradio` (a disabled selector);
 * - the Display's `segments` look (`display.md` section 11): `#clock` and `#readout` (outputs), `#freq` (a TextField display), `#plainout` (a display without the look).
 * - `?dom` starts in the CSS presentation; `?level=objects` and `?level=instrument` present the page at those levels.
 * - `?plain` puts the panel in the page's flow with no Underglass at all (the mobile and preference checks).
 * - `?flush` renders the wheels, the selectors and the segments displays in their flush markup, the look they had before the forms.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const flush = params.has("flush");

const fraction = (value: number, min = 0, max = 100) => Math.round(((value - min) / (max - min)) * 10000) / 10000;
const field = (id: string, label: string, control: string) => `<div class="ug-field" id="${id}-field"><label class="ug-field__label" for="${id}">${label}</label>${control}</div>`;

/** A Slider as a thumbwheel (the Fader's track with a ridged roller), or flush: the groove slider. */
function slider({ id, label, value, disabled, marks = [0, 50, 100], flat }: { id: string; label: string; value: number; disabled?: boolean; marks?: number[]; flat?: boolean }) {
  const off = disabled ? " disabled" : "";
  if (flush || flat) return field(id, label, `<input class="ug-slider" data-strata-face="groove" type="range" id="${id}" name="${id}" min="0" max="100" step="1" value="${value}"${off}>`);
  const printed = marks.map(mark => `<span class="ug-fader__mark" data-strata-value="${mark}" style="--strata-fader-at: ${fraction(mark)};">${mark}</span>`).join("");
  return field(id, label, `<div class="ug-fader ug-fader--horizontal ug-fader--wheel" data-strata-form="wheel" style="--strata-fader-value: ${fraction(value)};"><div class="ug-fader__track"><span class="ug-fader__scale" aria-hidden="true">${printed}</span><span class="ug-fader__slot" data-strata-face="groove" aria-hidden="true"></span><span class="ug-fader__carriage ug-fader__wheel" data-strata-face="raised" aria-hidden="true"><span class="ug-fader__ridges"></span></span><input class="ug-fader__input" type="range" id="${id}" name="${id}" min="0" max="100" step="1" value="${value}" data-strata-default="${value}"${off}></div></div>`);
}

interface Option { value: string; label: string; disabled?: boolean }
/** A RadioGroup as a selector (2 to 8 radios of at most 12 characters), as a bank when it does not fit, or flush. */
function radios({ id, legend, form, options, value, disabled }: { id: string; legend: string; form?: "selector" | "bank"; options: Option[]; value: string; disabled?: boolean }) {
  const off = disabled ? " disabled" : "";
  const drawn = flush || !form ? undefined : form === "bank" || options.length > 8 || options.some(option => option.label.length > 12) ? "bank" : "selector";
  const input = (option: Option, className: string, extra = "") => `<input class="${className}"${extra} type="radio" name="${id}" value="${option.value}" id="${id}-${option.value}"${option.value === value ? " checked" : ""}${option.disabled ? " disabled" : ""}>`;
  let body = "";
  if (drawn === "selector") {
    const index = Math.max(0, options.findIndex(option => option.value === value));
    const at = (position: number) => Math.round((options.length > 1 ? position / (options.length - 1) : 0.5) * 10000) / 10000;
    const marks = options.map((option, position) => `<label class="ug-rotary__mark" data-strata-value="${option.value}" data-strata-selected="${option.value === value}"${option.disabled ? ' data-strata-disabled="true"' : ""} style="--strata-rotary-at: ${at(position)};"><span class="ug-rotary__tick" aria-hidden="true"></span><span class="ug-rotary__text">${input(option, "ug-rotary__radio")}${option.label}</span></label>`).join("");
    const legendList = options.map(option => `<li data-strata-selected="${option.value === value}">${option.label}</li>`).join("");
    body = `<div class="ug-rotary ug-rotary--group" style="--strata-rotary-value: ${at(index)};"><div class="ug-rotary__dial"><span class="ug-rotary__scale">${marks}</span><span class="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-rotary__cap" data-strata-face="raised"><span class="ug-rotary__pointer"></span></span></span></div><ol class="ug-rotary__legend" aria-hidden="true">${legendList}</ol></div>`;
  } else if (drawn === "bank") {
    body = `<div class="ug-bank__plinth" data-strata-face="raised">${options.map(option => `<label class="ug-radio"><span class="ug-push ug-latch ug-latch--bank">${input(option, "ug-radio__input")}<span class="ug-push__object" aria-hidden="true"><span class="ug-push__led-socket"></span><span class="ug-push__led"></span></span><span class="ug-push__cap" data-strata-face="raised"><span class="ug-radio__label">${option.label}</span></span></span></label>`).join("")}</div>`;
  } else {
    body = options.map(option => `<label class="ug-radio">${input(option, "ug-radio__input", ' data-strata-face="well"')}<span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">${option.label}</span></label>`).join("");
  }
  return `<fieldset class="ug-radio-group" id="${id}-group"${drawn ? ` data-strata-form="${drawn}"` : ""}${off}><legend class="ug-radio-group__legend">${legend}</legend>${body}</fieldset>`;
}

/** A Display (a read-only output or a TextField's input), with the segments look or without. */
function display({ id, label, text, input, segments }: { id: string; label: string; text: string; input?: boolean; segments?: boolean }) {
  const look = segments && !flush ? ' data-strata-segments="seven"' : "";
  const object = `<span class="ug-display__object" aria-hidden="true"><span class="ug-display__bezel" data-strata-face="groove"><span class="ug-display__window" data-strata-face="flat"></span></span></span>`;
  return input
    ? field(id, label, `<span class="ug-display ug-display--input" data-strata-form="display"${look}>${object}<input class="ug-display__text" id="${id}" name="${id}" value="${text}"></span>`)
    : `<span class="ug-display ug-display--output" data-strata-form="display"${look}>${object}<output class="ug-display__text" id="${id}" aria-label="${label}">${text}</output></span>`;
}

const mode: Option[] = [{ value: "mix", label: "Mix" }, { value: "solo", label: "Solo" }, { value: "mute", label: "Mute" }, { value: "bypass", label: "Bypass" }];
const route: Option[] = Array.from({ length: 9 }, (_, index) => ({ value: `r${index + 1}`, label: `Out ${index + 1}` }));
const flat: Option[] = [{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }, { value: "c", label: "Gamma" }];

const markup = `
  <h2 id="def-title" style="margin:0 0 12px;font-size:18px">Channel</h2>
  <div class="row" id="def-row-1">
    ${slider({ id: "gain", label: "Gain", value: 40 })}
    ${slider({ id: "pan", label: "Pan", value: 75, marks: [0, 25, 50, 75, 100] })}
  </div>
  <div class="row" id="def-row-2">
    ${slider({ id: "flatslider", label: "Flat", value: 60, flat: true })}
    ${slider({ id: "locked", label: "Locked", value: 30, disabled: true })}
  </div>
  <div class="row" id="def-row-3">
    ${radios({ id: "mode", legend: "Mode", form: "selector", options: mode, value: "solo" })}
    ${radios({ id: "route", legend: "Route", form: "selector", options: route, value: "r3" })}
  </div>
  <div class="row" id="def-row-4">
    ${radios({ id: "flatradio", legend: "Flat", options: flat, value: "b" })}
    ${radios({ id: "lockedradio", legend: "Locked", form: "selector", options: mode, value: "mute", disabled: true })}
  </div>
  <div class="row" id="def-row-5">
    ${display({ id: "clock", label: "Clock", text: "12:34", segments: true })}
    ${display({ id: "readout", label: "Level", text: "-18.5 dB", segments: true })}
  </div>
  <div class="row" id="def-row-6">
    ${display({ id: "freq", label: "Frequency", text: "440.0", input: true, segments: true })}
    ${display({ id: "plainout", label: "Plain", text: "12:34 Hz" })}
  </div>
  <p class="read" id="def-read">No changes yet</p>`;

const events: { id: string; type: string; value: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "def-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "def-title");
  section.innerHTML = markup;
  const read = section.querySelector("#def-read")!;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const target = event.target as HTMLInputElement;
    if (!(target instanceof HTMLInputElement) || (target.type !== "range" && target.type !== "radio")) return;
    const id = target.type === "radio" ? target.name : target.id;
    events.push({ id, type, value: target.value });
    if (type === "change") read.textContent = `${id} is ${target.value}`;
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
window.strataDeferredProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { attachStrataFeedback(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataDeferredProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void;
    feedback(options: StrataFeedbackOptions): void; instrument(): unknown;
    state(): Record<string, unknown> | undefined; counts(): Counts | undefined;
  } }
}
