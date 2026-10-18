/**
 * Entry for `ui-switch-forms.html`: the Switch's hardware forms in plain contract markup (anatomy page `switch.md`,
 * *Forms*) with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata
 * panel that is a direct child of an Underglass root, presented on the GPU by `attachStrataGpu`.
 * `window.strataSwitchProbe` is the hook for `tests/browser/ui-switch-forms.test.mjs` and `ui-switch-forms-feedback`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level.
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it.
 * - `?sound`, `?haptics` and `?muted` set the page's feedback options (`attachStrataFeedback`); without them each
 *   control's `feedback.*` tokens decide (off by default).
 * Each form off and on (`#slide-off`, `#slide-on`, … `#wall-on`), the Strata switch (`#plain`) and a disabled bat
 * (`#locked`). Every `input` and `change` event is recorded.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

/** Each form's decorative parts, as the anatomy page writes them. */
const objects: Record<string, string> = {
  slide: `<span class="ug-switch__slot" data-strata-face="groove"></span><span class="ug-switch__flag" data-strata-face="flat"></span><span class="ug-switch__block" data-strata-face="raised"><span class="ug-switch__grip"></span></span>`,
  rocker: `<span class="ug-switch__bezel" data-strata-face="raised"></span><span class="ug-switch__paddle"><span class="ug-switch__facet ug-switch__facet--on" data-strata-face="raised"></span><span class="ug-switch__facet ug-switch__facet--off" data-strata-face="raised"></span><span class="ug-switch__flag" data-strata-face="flat"></span></span>`,
  bat: `<span class="ug-switch__nut" data-strata-face="raised"></span><span class="ug-switch__bushing" data-strata-face="raised"></span><span class="ug-switch__lever" data-strata-face="raised"></span><span class="ug-switch__ball" data-strata-face="knob"></span>`,
  wall: `<span class="ug-switch__plate" data-strata-face="raised"></span><span class="ug-switch__paddle"><span class="ug-switch__facet ug-switch__facet--on" data-strata-face="raised"></span><span class="ug-switch__facet ug-switch__facet--off" data-strata-face="raised"></span><span class="ug-switch__flag" data-strata-face="flat"></span></span>`,
};
/** One form switch's contract markup, as a plain HTML author writes it. */
const formSwitch = (form: string, id: string, label: string, { checked = false, disabled = false } = {}) =>
  `<label class="ug-switch" data-strata-form="${form}"><input class="ug-switch__input" type="checkbox" role="switch" id="${id}" name="${id}"${checked ? " checked" : ""}${disabled ? " disabled" : ""}><span class="ug-switch__object" aria-hidden="true">${objects[form]}</span><span class="ug-switch__label">${label}</span></label>`;

const markup = `
  <h2 id="switch-title" style="margin:0 0 12px;font-size:18px">Panel</h2>
  <form class="forms" id="switch-form">
    ${formSwitch("slide", "slide-off", "Bypass")}${formSwitch("rocker", "rocker-off", "Power")}${formSwitch("bat", "bat-off", "Arm")}${formSwitch("wall", "wall-off", "Hall")}
    ${formSwitch("slide", "slide-on", "Monitor", { checked: true })}${formSwitch("rocker", "rocker-on", "Heater", { checked: true })}${formSwitch("bat", "bat-on", "Pump", { checked: true })}${formSwitch("wall", "wall-on", "Porch", { checked: true })}
    <label class="ug-switch"><input class="ug-switch__input" data-strata-face="well" type="checkbox" role="switch" id="plain" name="plain"><span class="ug-switch__knob" data-strata-face="knob" aria-hidden="true"></span><span class="ug-switch__label">Wi-Fi</span></label>
    ${formSwitch("bat", "locked", "Locked", { disabled: true })}
    <p id="switch-read">4 of 8 on</p>
  </form>`;

const events: { id: string; type: string; checked: boolean }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "switch-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "switch-title");
  section.innerHTML = markup;
  const read = section.querySelector("#switch-read")!;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const input = event.target as HTMLInputElement;
    events.push({ id: input.id, type, checked: input.checked });
    const on = ["slide-off", "rocker-off", "bat-off", "wall-off", "slide-on", "rocker-on", "bat-on", "wall-on"].filter(id => section.querySelector<HTMLInputElement>(`#${id}`)!.checked).length;
    read.textContent = `${on} of 8 on`;
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
  strata = attachStrataGpu(controller, { level: params.get("level") === "objects" ? "objects" : undefined });
  host("enable").addEventListener("click", () => void controller!.enable());
  host("disable").addEventListener("click", () => void controller!.disable());
  if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());
}

window.strataSwitchProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; }, feedback,
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataSwitchProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; checked: boolean }[]; clearEvents(): void; feedback: ReturnType<typeof attachStrataFeedback>;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
