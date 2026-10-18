/**
 * Entry for `ui-status-light.html`: Strata StatusLights in plain contract markup (anatomy page `status-light.md`) with
 * `@underglass/ui/css` and the plain-DOM helper (`setStrataStatusLight` from `@underglass/ui/dom`), in a Strata panel that
 * is a direct child of an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataStatusProbe` is the
 * hook for `tests/browser/ui-status-light.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the LEDs' glass lenses as parts, with
 *   their emitters).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it.
 * An image-form light lit (`#link`) and unlit (`#idle`), a steady one with its label shown (`#power`), three blinking ones
 * (`#rec` normal, `#warn` fast, `#slow` slow), and two live regions: `#sync` with its label shown and `#disk` with none.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, setStrataStatusLight, type StatusLightUpdate } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const object = `<span class="ug-status-light__object" aria-hidden="true"><span class="ug-status-light__socket"></span><span class="ug-status-light__lens" data-strata-face="knob"></span></span>`;
/** One StatusLight's contract markup, as a plain HTML author writes it. */
function light(id: string, label: string, { colour = "", lit = true, blink = "", form = "img", size = "" }: { colour?: string; lit?: boolean; blink?: string; form?: "img" | "text" | "live" | "bare"; size?: string } = {}) {
  const attrs = `id="${id}"${colour ? ` data-strata-colour="${colour}"` : ""}${lit ? "" : ` data-strata-lit="false"`}${blink ? ` data-strata-blink="${blink}"` : ""}${size ? ` data-strata-size="${size}"` : ""}`;
  if (form === "img") return `<span class="ug-status-light" ${attrs} role="img" aria-label="${label}">${object}</span>`;
  if (form === "text") return `<span class="ug-status-light" ${attrs}>${object}<span class="ug-status-light__text">${label}</span></span>`;
  return `<output class="ug-status-light${form === "bare" ? " ug-status-light--bare" : ""}" ${attrs}>${object}<span class="ug-status-light__text">${label}</span></output>`;
}

const markup = `
  <h2 id="led-title" style="margin:0 0 12px;font-size:18px">Rack</h2>
  <p class="note" id="note">Text beside the lights keeps its contrast: the light is limited over it.</p>
  <div class="leds" id="led-row">
    ${light("link", "Link up", { colour: "success" })}${light("idle", "Link idle", { colour: "success", lit: false })}${light("power", "Power", { colour: "glowOn", form: "text" })}
    ${light("rec", "Recording", { colour: "danger", blink: "normal", form: "text" })}${light("warn", "Overheating", { colour: "warning", blink: "fast", form: "text" })}${light("slow", "Standing by", { colour: "info", blink: "slow", form: "text" })}
  </div>
  <div class="leds" id="live-row">
    ${light("sync", "Synced", { colour: "accent", form: "live" })}${light("disk", "Disk healthy", { colour: "success", form: "bare" })}
    ${light("big", "Large", { colour: "success", size: "large" })}${light("tiny", "Small", { colour: "danger", size: "small" })}
  </div>`;

let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "led-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "led-title");
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
  strata = attachStrataGpu(controller, { level: level === "objects" || level === "instrument" ? level : undefined });
  host("enable").addEventListener("click", () => void controller!.enable());
  host("disable").addEventListener("click", () => void controller!.disable());
  if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());
}

window.strataStatusProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  set: (id, update) => !!setStrataStatusLight(document.getElementById(id)!, update),
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataStatusProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    set(id: string, update: StatusLightUpdate): boolean;
    state(): Record<string, unknown> | undefined;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
