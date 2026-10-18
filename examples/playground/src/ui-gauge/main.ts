/**
 * Entry for `ui-gauge.html`: Strata Gauges in plain contract markup (anatomy page `gauge.md`) with `@underglass/ui/css` and
 * the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an
 * Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataGaugeProbe` is the hook for
 * `tests/browser/ui-gauge.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the bezels, windows, needles and hubs as
 *   parts, the needles on `spring.gauge`).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it.
 * Three gauges: a temperature gauge (`#temp`, 0 to 120 °C, red zones below 20 and above 100), a pressure gauge (`#pressure`,
 * 0 to 10 bar, a red zone above 8, small) and a plain speed dial (`#speed`, 0 to 200, large). `probe.set(id, value)` writes
 * a gauge's value as a script does.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, driveStrataMeter, releaseStrataMeter } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";
import { bareController } from "../ui-meter/bare.ts";
import { meterMarkup, type MeterSpec } from "../ui-meter/markup.ts";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const specs: MeterSpec[] = [
  { id: "temp", label: "Temperature", form: "dial", value: 72, min: 0, max: 120, low: 20, high: 100, unit: " °C", marks: [0, 30, 60, 90, 120] },
  { id: "pressure", label: "Pressure", form: "dial", value: 3, min: 0, max: 10, high: 8, unit: " bar", marks: [0, 5, 10], size: "small" },
  { id: "speed", label: "Speed", form: "dial", value: 100, min: 0, max: 200, marks: [0, 50, 100, 150, 200], size: "large" },
];
const markup = `
  <h2 id="gauge-title" style="margin:0 0 12px;font-size:18px">Panel</h2>
  <p class="note" id="note">Text beside the gauges keeps its contrast.</p>
  <div class="gauges" id="gauge-row">${specs.map(meterMarkup).join("")}</div>
  <p class="read" id="gauge-read">Temperature 72 °C</p>`;

let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "gauge-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "gauge-title");
  section.innerHTML = markup;
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
  strata = attachStrataGpu(params.get("bare") === "window" ? bareController(controller) : controller, { level: level === "objects" || level === "instrument" ? level : undefined });
  host("enable").addEventListener("click", () => void controller!.enable());
  host("disable").addEventListener("click", () => void controller!.disable());
  if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());
}

/** Writes a gauge's value as a script does: the property, which the browser reflects as the `value` attribute. */
const set = (id: string, value: number) => { (document.getElementById(id) as HTMLMeterElement).value = value; };

window.strataGaugeProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(), set,
  drive: (id: string, value: number, interval?: number) => driveStrataMeter(document.getElementById(id) as HTMLMeterElement, value, interval === undefined ? {} : { interval }),
  release: (id: string) => releaseStrataMeter(document.getElementById(id) as HTMLMeterElement),
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataGaugeProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; set(id: string, value: number): void;
    drive(id: string, value: number, interval?: number): void; release(id: string): void;
    state(): Record<string, unknown> | undefined;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
