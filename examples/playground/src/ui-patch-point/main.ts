/**
 * Entry for `ui-patch-point.html`: Strata PatchPoints and PatchBays in plain contract markup (anatomy page `patch-point.md`) with
 * `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of
 * an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataPatchProbe` is the hook for
 * `tests/browser/ui-patch-point.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: the washers, barrels and plugs as parts, the LEDs as lenses with emitters).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks).
 * Two bays in a form: Outputs, four checkbox jacks with LEDs (`out1` and `out3` connected, `out4` disabled), and Returns, two button jacks
 * (`ret1` pressed, `ret2` not) with none; and two loose jacks, a small `aux1` and a large `aux2` with a warning LED. Every `input`,
 * `change` and `strata-pressed-change` event is recorded; `feedback(options)` sets the page's feedback options (off by default).
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";
import { bayMarkup, patchMarkup } from "./markup.ts";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const markup = `
  <h2 id="patch-title" style="margin:0 0 12px;font-size:18px">Patch bay</h2>
  <form id="patch-form" style="display:flex;flex-direction:column;gap:12px">
    ${bayMarkup("outs", "Outputs", [
      { id: "out1", label: "Out 1", connected: true, led: true }, { id: "out2", label: "Out 2", led: true },
      { id: "out3", label: "Out 3", connected: true, led: true }, { id: "out4", label: "Out 4", led: true, disabled: true },
    ])}
    ${bayMarkup("rets", "Returns", [{ id: "ret1", label: "Ret 1", button: true, connected: true }, { id: "ret2", label: "Ret 2", button: true }], { columns: 2 })}
    <div style="display:flex;gap:20px;align-items:flex-start">${patchMarkup({ id: "aux1", label: "Aux 1", size: "small" })}${patchMarkup({ id: "aux2", label: "Aux 2", size: "large", led: "warning", connected: true })}</div>
  </form>
  <p class="read" id="patch-read" style="margin:12px 0 0;font-size:13px">Connected: out1, out3, ret1, aux2</p>
  <button type="button" class="ug-button" data-strata-face="raised" id="patch-reset"><span class="ug-button__label">Disconnect all</span></button>`;

const events: { id: string; type: string; value: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** The names of the connected jacks now. */
const connected = (section: Element) => [...section.querySelectorAll<HTMLElement>(".ug-patch-point")].filter(jack =>
  (jack.matches("button") ? jack.getAttribute("aria-pressed") === "true" : (jack.querySelector("input") as HTMLInputElement).checked)).map(jack => jack.matches("button") ? jack.id : jack.querySelector("input")!.id);

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "patch-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "patch-title");
  section.innerHTML = markup;
  const read = section.querySelector("#patch-read")!;
  const log = (type: string) => (event: Event) => {
    const target = event.target as HTMLElement;
    const id = target.matches("button") ? target.id : (target as HTMLInputElement).id;
    events.push({ id, type, value: target.matches("button") ? String(target.getAttribute("aria-pressed")) : String((target as HTMLInputElement).checked) });
    read.textContent = `Connected: ${connected(section).join(", ")}`;
  };
  section.addEventListener("input", log("input"));
  section.addEventListener("change", log("change"));
  section.addEventListener("strata-pressed-change", log("pressed"));
  section.querySelector("#patch-reset")!.addEventListener("click", () => {
    for (const input of section.querySelectorAll<HTMLInputElement>(".ug-patch-point__input")) if (input.checked && !input.disabled) input.click();
    for (const button of section.querySelectorAll<HTMLButtonElement>("button.ug-patch-point--button[aria-pressed='true']")) button.click();
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

window.strataPatchProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { attachStrataFeedback(options); },
  connected: () => connected(panel),
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataPatchProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void; connected(): string[]; state(): Record<string, unknown> | undefined;
    feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
