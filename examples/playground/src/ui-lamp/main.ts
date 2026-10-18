/**
 * Entry for `ui-lamp.html`: Strata Lamps in plain contract markup (anatomy page `lamp.md`) with `@underglass/ui/css` and
 * the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an
 * Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataLampProbe` is the hook for
 * `tests/browser/ui-lamp.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the lamps' bezels and glass lenses as parts,
 *   with their emitters).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it.
 * - `?sound`, `?haptics` and `?muted` set the page's feedback options (`attachStrataFeedback`); without them each
 *   control's `feedback.*` tokens decide (off by default).
 * Toggle lamps off and on in the glow colour and the status roles (`#mains`, `#standby`, `#link`, `#fault`, `#armed` small,
 * `#tuner` large), a disabled lit one (`#locked`), a reversed one (`#aux`), a momentary one (`#talk`), a disabled momentary
 * one (`#muted`) and one at the panel's edge (`#edge`). Every `input`, `change` and `click` event is recorded. `?many=70` adds 70
 * more lit lamps (`#many-1`…), past core's 64 emitters a layer.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const object = `<span class="ug-lamp__object" aria-hidden="true"><span class="ug-lamp__bezel" data-strata-face="raised"></span><span class="ug-lamp__socket"></span><span class="ug-lamp__lens" data-strata-face="knob"></span></span>`;
/** One lamp's contract markup, as a plain HTML author writes it. */
function lamp(id: string, label: string, { checked = false, disabled = false, colour = "", momentary = false, reverse = false, size = "" } = {}) {
  const row = `class="ug-lamp${momentary ? " ug-lamp--momentary" : ""}${reverse ? " ug-lamp--reverse" : ""}"${colour ? ` data-strata-colour="${colour}"` : ""}${size ? ` data-strata-size="${size}"` : ""}`;
  // A momentary lamp is the button itself, with its object and label inside it.
  if (momentary) return `<button ${row} type="button" id="${id}" name="${id}" aria-pressed="false"${disabled ? " disabled" : ""}>${object}<span class="ug-lamp__label">${label}</span></button>`;
  return `<label ${row}><input class="ug-lamp__input" type="checkbox" role="switch" id="${id}" name="${id}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}>${object}<span class="ug-lamp__label">${label}</span></label>`;
}

const many = Math.min(200, Number(params.get("many")) || 0);
// A taller frame for `?many`, so every lamp lies on the canvas.
if (many) host("frame").style.height = "1000px";
const markup = `
  <h2 id="lamp-title" style="margin:0 0 12px;font-size:18px">Panel</h2>
  <p class="note" id="note">Text beside the lamps keeps its contrast: the light is limited over it.</p>
  <form class="lamps" id="lamp-form">
    ${lamp("mains", "Mains")}${lamp("standby", "Standby", { checked: true })}${lamp("link", "Link", { colour: "success" })}${lamp("fault", "Fault", { colour: "danger", checked: true })}
    ${lamp("armed", "Armed", { colour: "accent", checked: true, size: "small" })}${lamp("tuner", "Tuner", { colour: "info", size: "large" })}
    ${lamp("locked", "Locked", { checked: true, disabled: true })}${lamp("aux", "Aux", { reverse: true, colour: "warning" })}${lamp("talk", "Talk", { momentary: true, colour: "success" })}${lamp("muted", "Muted", { momentary: true, disabled: true })}
  </form>
  <p class="read" id="lamp-read">2 of 6 lit</p>
  <div id="edge-row">${lamp("edge", "Edge", { colour: "danger", checked: true })}</div>
  ${many ? `<div class="lamps" id="many">${Array.from({ length: many }, (_, index) => lamp(`many-${index + 1}`, String(index + 1), { checked: true, colour: "success", size: "small" })).join("")}</div>` : ""}`;

type LampEvent = { id: string; type: string; checked?: boolean; pressed?: string | null };
const events: LampEvent[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "lamp-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "lamp-title");
  // Room under the lamps for the one at the edge, which lies over the panel's corner.
  section.style.position = "relative";
  section.style.paddingBottom = "84px";
  section.innerHTML = markup;
  const read = section.querySelector("#lamp-read")!;
  for (const type of ["input", "change", "click"]) section.addEventListener(type, event => {
    const input = (event.target as Element).closest?.(".ug-lamp__input, .ug-lamp--momentary") as HTMLInputElement | HTMLButtonElement | null;
    if (!input) return;
    events.push({ id: input.id, type, ...(input instanceof HTMLInputElement ? { checked: input.checked } : { pressed: input.getAttribute("aria-pressed") }) });
    const lit = ["mains", "standby", "link", "fault", "armed", "tuner"].filter(id => section.querySelector<HTMLInputElement>(`#${id}`)!.checked).length;
    read.textContent = `${lit} of 6 lit`;
  });
  return section;
}

const feedback = attachStrataFeedback({ sound: params.has("sound") ? true : undefined, haptics: params.has("haptics") ? true : undefined, muted: params.has("muted") });
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

window.strataLampProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; }, feedback,
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataLampProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): LampEvent[]; clearEvents(): void; feedback: ReturnType<typeof attachStrataFeedback>;
    state(): Record<string, unknown> | undefined;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
