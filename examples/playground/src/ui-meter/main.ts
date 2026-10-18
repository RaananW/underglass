/**
 * Entry for `ui-meter.html`: Strata Meters in plain contract markup (anatomy page `meter.md`) with `@underglass/ui/css` and
 * the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an
 * Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataMeterProbe` is the hook for
 * `tests/browser/ui-meter.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the windows and the LED segments as parts,
 *   the needle on its spring).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it.
 * Five meters: a level bar (`#level`, 16 segments, zones from `low` 70 / `high` 90 / `optimum` 0, in %), an eight-segment gain
 * bar (`#gain`, 0 to 10, no zones), a bar that holds its peak (`#hold`), a VU needle meter (`#vu`, −20 to 3 dB, a red zone from
 * 0 dB) and a bare needle meter (`#temp`, 0 to 100). `probe.set(id, value)` writes a meter's value as a script does. `?many=3` adds
 * three more bars at full scale (`#many-1`…), past core's 64 emitters a layer. `?bare=window` draws the layer without its glass windows (the tests' reference).
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, driveStrataMeter, releaseStrataMeter } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";
import { bareController } from "./bare.ts";
import { meterMarkup, type MeterSpec } from "./markup.ts";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const specs: MeterSpec[] = [
  { id: "level", label: "Level", form: "bar", value: 50, min: 0, max: 100, low: 70, high: 90, optimum: 0, unit: " %", marks: [0, 25, 50, 75, 100] },
  { id: "gain", label: "Gain", form: "bar", value: 2.5, min: 0, max: 10, segments: 8, marks: [0, 5, 10] },
  { id: "hold", label: "Hold", form: "bar", value: 40, min: 0, max: 100, peak: true, marks: [0, 50, 100] },
  { id: "vu", label: "VU", form: "needle", value: -6, min: -20, max: 3, high: 0, unit: " dB", marks: [-20, -10, -5, 0, 3] },
  { id: "temp", label: "Warmth", form: "needle", value: 50, min: 0, max: 100, marks: [0, 50, 100] },
];
const many = Math.min(20, Number(params.get("many")) || 0);
// A taller frame for `?many`, so every extra bar lies on the canvas.
if (many) host("frame").style.height = `${640 + many * 90}px`;
const markup = `
  <h2 id="meter-title" style="margin:0 0 12px;font-size:18px">Panel</h2>
  <p class="note" id="note">Text beside the meters keeps its contrast: the light is limited over it.</p>
  <div class="meters" id="meter-row">${specs.map(meterMarkup).join("")}</div>
  <p class="read" id="meter-read">Level 50 %, gain 2.5</p>
  ${many ? `<div class="meters" id="many">${Array.from({ length: many }, (_, index) => meterMarkup({ id: `many-${index + 1}`, label: `More ${index + 1}`, form: "bar", value: 100, min: 0, max: 100, marks: [0, 50, 100] })).join("")}</div>` : ""}`;

let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "meter-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "meter-title");
  // A whole number of px in both directions, so the layer's capture maps 1:1 onto the canvas (the tests compare text pixel for pixel).
  if (!many) section.style.height = "480px";
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

/** Writes a meter's value as a script does: the property, which the browser reflects as the `value` attribute. */
const set = (id: string, value: number) => { (document.getElementById(id) as HTMLMeterElement).value = value; };

window.strataMeterProbe = {
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
  interface Window { strataMeterProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; set(id: string, value: number): void;
    drive(id: string, value: number, interval?: number): void; release(id: string): void;
    state(): Record<string, unknown> | undefined;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
