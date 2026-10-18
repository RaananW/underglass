/**
 * Entry for `ui-knob.html`: Strata Knobs in plain contract markup (anatomy page `knob.md`) with `@underglass/ui/css` and
 * the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an
 * Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataKnobProbe` is the hook for
 * `tests/browser/ui-knob.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the knobs and the Reset key as parts).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and
 *   preference checks).
 * Two knobs, Volume (0–100, step 1, printed 0 to 10, "%") and Gain (−12 to 12 dB in five detents), and a Reset button
 * that returns both to their defaults. Every `input` and `change` event is recorded; `feedback(options)` sets the page's feedback
 * options (off by default).
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const fraction = (value: number, min: number, max: number) => Math.round(((value - min) / (max - min)) * 10000) / 10000;
const minus = (value: number) => (value < 0 ? `−${-value}` : String(value));

/** One knob's contract markup, as a plain HTML author writes it. */
function knob({ id, label, min, max, step, value, unit, marks, detented }: { id: string; label: string; min: number; max: number; step: number; value: number; unit: string; marks: [number, string][]; detented?: boolean }) {
  return `<div class="ug-knob${detented ? " ug-knob--detented" : ""}" id="${id}-knob" style="--strata-knob-value: ${fraction(value, min, max)};">
    <div class="ug-knob__dial">
      <span class="ug-knob__scale" aria-hidden="true">${marks.map(([at, text]) => `<span class="ug-knob__mark" data-strata-value="${at}" style="--strata-knob-at: ${fraction(at, min, max)};">${text}</span>`).join("")}</span>
      <span class="ug-knob__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-knob__cap" data-strata-face="raised"><span class="ug-knob__pointer"></span></span></span>
      <input class="ug-knob__input" type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}" data-strata-default="${value}" data-strata-unit="${unit}" aria-valuetext="${minus(value)}${unit}">
    </div>
    <label class="ug-knob__label" for="${id}">${label}</label>
  </div>`;
}

const markup = `
  <h2 id="knob-title" style="margin:0 0 12px;font-size:18px">Channel</h2>
  <form class="knobs" id="knob-form">
    ${knob({ id: "volume", label: "Volume", min: 0, max: 100, step: 1, value: 62, unit: "%", marks: Array.from({ length: 11 }, (_, index) => [index * 10, String(index)]) })}
    ${knob({ id: "gain", label: "Gain", min: -12, max: 12, step: 6, value: 0, unit: " dB", detented: true, marks: [-12, -6, 0, 6, 12].map(value => [value, minus(value)]) })}
  </form>
  <p class="read" id="knob-read">Volume 62%, gain 0 dB</p>
  <button type="button" class="ug-button" data-strata-face="raised" id="knob-reset"><span class="ug-button__label">Reset</span></button>`;

const events: { id: string; type: string; value: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "knob-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "knob-title");
  section.innerHTML = markup;
  const read = section.querySelector("#knob-read")!;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const input = event.target as HTMLInputElement;
    events.push({ id: input.id, type, value: input.value });
    read.textContent = `Volume ${section.querySelector<HTMLInputElement>("#volume")!.getAttribute("aria-valuetext")}, gain ${section.querySelector<HTMLInputElement>("#gain")!.getAttribute("aria-valuetext")}`;
  });
  section.querySelector("#knob-reset")!.addEventListener("click", () => {
    for (const input of section.querySelectorAll<HTMLInputElement>(".ug-knob__input")) {
      input.value = input.getAttribute("data-strata-default") ?? input.defaultValue;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
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
    Object.assign(panel.style, compileStyle({ x: 40, y: 30, width: 460 }, {}, true));
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

window.strataKnobProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { attachStrataFeedback(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataKnobProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void;
    instrument(): unknown; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
