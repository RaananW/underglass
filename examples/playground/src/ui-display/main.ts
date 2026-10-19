/**
 * Entry for `ui-display.html`: Strata Displays in plain contract markup (anatomy pages `display.md`, `text-field.md` section 11) with
 * `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel that is a direct child of an Underglass
 * root, presented on the GPU by `attachStrataGpu`. `window.strataDisplayProbe` is the hook for `tests/browser/ui-display.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: a polished bezel, a glass pane over the printed text, the backlight as emitters).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it.
 * Displays: `#name` (an editable display, backlit in the default `glowOn`, with a value), `#note` (editable, empty, `accent`), `#serial`
 * (a read-only input in a form, submitted), `#rate` (an `<output>`, `success`), `#level` (an `<output>` with `live="off"`, backlight
 * `off`), `#locked` (disabled) and `#bad` (invalid, `danger`); a plain TextField beside them (`#plain`) and a paragraph of text.
 * `?many=N` adds N more displays (past core's 64 emitters a layer). `?bare=window` draws the layer without its glass windows.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, driveStrataDisplay, releaseStrataDisplay } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";
import { bareController } from "./bare.ts";
import { displayMarkup, type DisplaySpec } from "./markup.ts";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const specs: DisplaySpec[] = [
  { id: "name", label: "Name", kind: "input", value: "Hello, glass 0123", name: "name" },
  { id: "note", label: "Note", kind: "input", placeholder: "Type here", backlight: "accent" },
  { id: "serial", label: "Serial", kind: "readonly", value: "UG-2026-0042", name: "serial", backlight: "info" },
  { id: "rate", label: "Frame rate", kind: "output", value: "60 fps", backlight: "success", width: 150 },
  { id: "level", label: "Level", kind: "output", value: "-18.0 dB", backlight: "off", live: "off", width: 120 },
  { id: "locked", label: "Locked", kind: "input", value: "Disabled", disabled: true },
  { id: "bad", label: "Invalid", kind: "input", value: "not an email", type: "text", invalid: true, backlight: "danger" },
];
const many = Math.min(20, Number(params.get("many")) || 0);
if (many) host("frame").style.height = `${700 + many * 80}px`;
const markup = `
  <h2 id="display-title" style="margin:0 0 12px;font-size:18px">Panel</h2>
  <p class="note" id="note-text">Text beside the displays keeps its contrast: the light is limited over it.</p>
  <form id="form" action="#" onsubmit="event.preventDefault(); document.getElementById('submitted').textContent = new URLSearchParams(new FormData(this)).toString();">
    <div class="displays" id="display-row">${specs.map(displayMarkup).join("")}
      <div class="field"><label class="field-label" for="plain">Plain</label><input class="ug-text-field" data-strata-face="well" id="plain" type="text" value="A plain text field" /></div>
    </div>
    <p><button class="ug-button" data-strata-face="raised" id="submit" type="submit">Submit</button> <output id="submitted" class="read"></output></p>
  </form>
  <p class="read" id="display-read">Rate 60 fps</p>
  ${many ? `<div class="displays" id="many">${Array.from({ length: many }, (_, index) => displayMarkup({ id: `many-${index + 1}`, label: `More ${index + 1}`, kind: "output", value: `Value ${index + 1}`, backlight: "info" })).join("")}</div>` : ""}`;

let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "display-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "display-title");
  // A whole number of px in both directions, so the layer's capture maps 1:1 onto the canvas (the tests compare text pixel for pixel).
  if (!many) section.style.height = "600px";
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

window.strataDisplayProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  /** Writes an output's text as a script does. */
  write: (id: string, text: string) => { document.getElementById(id)!.textContent = text; },
  drive: (id: string, text: string, interval?: number) => driveStrataDisplay(document.getElementById(id)!, text, interval === undefined ? {} : { interval }),
  release: (id: string) => releaseStrataDisplay(document.getElementById(id)!),
  /** Switches a display's backlight on or off (`data-strata-lit`). */
  light: (id: string, on: boolean) => { const root = document.getElementById(id)!.closest(".ug-display")!; if (on) root.removeAttribute("data-strata-lit"); else root.setAttribute("data-strata-lit", "false"); },
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataDisplayProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; write(id: string, text: string): void;
    drive(id: string, text: string, interval?: number): void; release(id: string): void; light(id: string, on: boolean): void;
    state(): Record<string, unknown> | undefined;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
