/**
 * Entry for `ui-rotary-selector.html`: Strata RotarySelectors in plain contract markup (anatomy page `rotary-selector.md`) with
 * `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct
 * child of an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataRotaryProbe` is the hook for
 * `tests/browser/ui-rotary-selector.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the selectors as the knob's parts, the Reset
 *   key and the Apply push button as parts).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and
 *   preference checks).
 * Two selectors in a form: Filter (five positions: LP, HP, BP, Notch, Peak) and Source (four, the third disabled), a Reset key
 * that returns both to their first option, and a Submit key; the form's data is shown. Every `input` and `change` event is
 * recorded; `feedback(options)` sets the page's feedback options (off by default).
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, syncStrataRotarySelector, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const fraction = (index: number, count: number) => (count > 1 ? Math.round((index / (count - 1)) * 10000) / 10000 : 0.5);

interface Option { value: string; label: string; disabled?: boolean }

/** One selector's contract markup, as a plain HTML author writes it. */
function rotary({ id, label, options, selected }: { id: string; label: string; options: Option[]; selected: number }) {
  return `<div class="ug-rotary" id="${id}-rotary" style="--strata-rotary-value: ${fraction(selected, options.length)};">
    <div class="ug-rotary__dial">
      <span class="ug-rotary__scale" aria-hidden="true">${options.map((option, index) => `<span class="ug-rotary__mark" data-strata-value="${option.value}" data-strata-selected="${index === selected}"${option.disabled ? ' data-strata-disabled="true"' : ""} style="--strata-rotary-at: ${fraction(index, options.length)};"><span class="ug-rotary__tick"></span><span class="ug-rotary__text">${option.label}</span></span>`).join("")}</span>
      <span class="ug-rotary__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-rotary__cap" data-strata-face="raised"><span class="ug-rotary__pointer"></span></span></span>
      <select class="ug-rotary__select" id="${id}" name="${id}">${options.map((option, index) => `<option value="${option.value}"${option.disabled ? " disabled" : ""}${index === selected ? " selected" : ""}>${option.label}</option>`).join("")}</select>
    </div>
    <ol class="ug-rotary__legend" aria-hidden="true">${options.map((option, index) => `<li data-strata-selected="${index === selected}">${option.label}</li>`).join("")}</ol>
    <label class="ug-rotary__label" for="${id}">${label}</label>
  </div>`;
}

const markup = `
  <h2 id="rotary-title" style="margin:0 0 12px;font-size:18px">Channel</h2>
  <form class="dials" id="rotary-form" style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start">
    ${rotary({ id: "filter", label: "Filter", selected: 0, options: [{ value: "lp", label: "LP" }, { value: "hp", label: "HP" }, { value: "bp", label: "BP" }, { value: "notch", label: "Notch" }, { value: "peak", label: "Peak" }] })}
    ${rotary({ id: "source", label: "Source", selected: 1, options: [{ value: "mic", label: "Mic" }, { value: "line", label: "Line" }, { value: "aux", label: "Aux", disabled: true }, { value: "bus", label: "Bus" }] })}
  </form>
  <p class="read" id="rotary-read">Filter lp, source line</p>
  <p class="row" style="display:flex;gap:12px;margin:12px 0 0">
    <button type="button" class="ug-button" data-strata-face="raised" id="rotary-reset"><span class="ug-button__label">Reset</span></button>
    <button type="submit" class="ug-button" data-strata-face="raised" id="rotary-submit" form="rotary-form"><span class="ug-button__label">Submit</span></button>
  </p>
  <pre id="rotary-data"></pre>`;

const events: { id: string; type: string; value: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout, event log and form. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "rotary-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "rotary-title");
  section.innerHTML = markup;
  const read = section.querySelector("#rotary-read")!;
  const select = (id: string) => section.querySelector<HTMLSelectElement>(`#${id}`)!;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const target = event.target as HTMLSelectElement;
    events.push({ id: target.id, type, value: target.value });
    read.textContent = `Filter ${select("filter").value}, source ${select("source").value}`;
  });
  const form = section.querySelector<HTMLFormElement>("#rotary-form")!;
  form.addEventListener("submit", event => {
    event.preventDefault();
    section.querySelector("#rotary-data")!.textContent = JSON.stringify(Object.fromEntries(new FormData(form)));
  });
  section.querySelector("#rotary-reset")!.addEventListener("click", () => {
    for (const element of section.querySelectorAll<HTMLSelectElement>(".ug-rotary__select")) {
      element.selectedIndex = element.id === "source" ? 1 : 0;
      syncStrataRotarySelector(element);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
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
    Object.assign(panel.style, compileStyle({ x: 40, y: 30, width: 560 }, {}, true));
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

window.strataRotaryProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { attachStrataFeedback(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataRotaryProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void;
    instrument(): unknown; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
