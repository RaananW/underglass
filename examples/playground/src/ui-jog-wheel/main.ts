/**
 * Entry for `ui-jog-wheel.html`: Strata JogWheels in plain contract markup (anatomy page `jog-wheel.md`) with `@underglass/ui/css` and
 * the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root,
 * presented on the GPU by `attachStrataGpu`. `window.strataJogProbe` is the hook for `tests/browser/ui-jog-wheel.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: the wheels as parts and the Reset key).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks).
 * Three wheels: Shuttle (0–99 frames, 24 steps a turn, wrapping, medium), Scrub (0–11, detented, 12 steps a turn, wrapping, medium) and
 * Tune (−12 to 12 semitones, a small wheel dragged vertically, not wrapping), and a Reset button that returns all three to their
 * defaults. Every `input` and `change` event is recorded; `feedback(options)` sets the page's feedback options (off by default).
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, flingStrataJogWheel, liveStrataJog, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";
import { jogMarkup, type JogSpec } from "./markup.ts";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const specs: JogSpec[] = [
  { id: "shuttle", label: "Shuttle", value: 12, min: 0, max: 99, unit: " fr" },
  { id: "scrub", label: "Scrub", value: 0, min: 0, max: 11, turn: 12, detents: true },
  { id: "tune", label: "Tune", value: 0, min: -12, max: 12, wrap: false, vertical: true, unit: " st", size: "small" },
];
const markup = `
  <h2 id="jog-title" style="margin:0 0 12px;font-size:18px">Transport</h2>
  <form class="wheels" id="jog-form">${specs.map(jogMarkup).join("")}</form>
  <p class="read" id="jog-read">Shuttle 12 fr, scrub 0, tune 0 st</p>
  <button type="button" class="ug-button" data-strata-face="raised" id="jog-reset"><span class="ug-button__label">Reset</span></button>`;

const events: { id: string; type: string; value: string }[] = [];
/** A page's own handler that writes to the DOM recaptures its layer at each step: `muteReadout(true)` stops the readout, for the tests that count captures. */
let readoutMuted = false;
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "jog-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "jog-title");
  section.innerHTML = markup;
  const read = section.querySelector("#jog-read")!;
  const text = (id: string) => section.querySelector<HTMLInputElement>(`#${id}`)!.getAttribute("aria-valuetext") ?? section.querySelector<HTMLInputElement>(`#${id}`)!.value;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const input = event.target as HTMLInputElement;
    events.push({ id: input.id, type, value: input.value });
    if (!readoutMuted) read.textContent = `Shuttle ${text("shuttle")}, scrub ${text("scrub")}, tune ${text("tune")}`;
  });
  section.querySelector("#jog-reset")!.addEventListener("click", () => {
    for (const input of section.querySelectorAll<HTMLInputElement>(".ug-jog-wheel__input")) {
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

window.strataJogProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(), detach: () => strata?.detach(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { attachStrataFeedback(options); },
  muteReadout: (muted: boolean) => { readoutMuted = muted; },
  fling: (id: string, velocity: number) => flingStrataJogWheel(document.getElementById(id) as HTMLInputElement, velocity),
  angle: (id: string) => { const root = (document.getElementById(id) as HTMLElement).closest<HTMLElement>(".ug-jog-wheel")!; return liveStrataJog(root) ?? Number.parseFloat(root.style.getPropertyValue("--strata-jog-angle")); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number; inputCapturesSkipped: number } } | undefined;
    return state ? { mode: state.mode, inputCapturesSkipped: state.metrics.inputCapturesSkipped, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataJogProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; detach(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void; muteReadout(muted: boolean): void; fling(id: string, velocity: number): boolean; angle(id: string): number;
    instrument(): unknown; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; inputCapturesSkipped: number; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
