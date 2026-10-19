/**
 * Entry for `ui-pad.html`: Strata Pads in plain contract markup (anatomy page `pad.md`) with `@underglass/ui/css` and the plain-DOM
 * behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root, presented
 * on the GPU by `attachStrataGpu`. `window.strataPadProbe` is the hook for `tests/browser/ui-pad.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: each pad a glass rim with an emitter, a body and a captured cap).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference
 *   checks).
 * - `?grid16` shows a 4 × 4 grid of small pads in place of the rack (the budget and the 320 px checks).
 * The rack: momentary pads Kick (danger), Snare (accent) and Hat (success), latching pads Loop (warning) and Arm (info, latched), a
 * disabled one, a momentary Send that submits a form, and a plain Button beside it. Every click, toggle and velocity is recorded;
 * `?sound`, `?haptics` and `?muted` set the page's feedback options (off by default) and `feedback(options)` changes them.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const object = '<span class="ug-pad__object" aria-hidden="true"><span class="ug-pad__socket"></span><span class="ug-pad__glow"></span></span>';

/** A pad's contract markup. */
function pad({ id, label, colour, latching, pressed, disabled, type = "button", name }: { id: string; label: string; colour?: string; latching?: boolean; pressed?: boolean; disabled?: boolean; type?: string; name?: string }) {
  return `<button type="${type}" class="ug-pad" id="${id}"${colour ? ` data-strata-colour="${colour}"` : ""}${latching ? ` aria-pressed="${!!pressed}"` : ""}${name ? ` name="${name}" value="1"` : ""}${disabled ? " disabled" : ""}>${object}<span class="ug-pad__cap" data-strata-face="raised"><span class="ug-pad__label">${label}</span></span></button>`;
}

const roles = ["danger", "accent", "success", "warning"];
const rack = `
  <h2 id="pad-title" style="margin:0 0 12px;font-size:18px">Drum rack</h2>
  <div class="ug-pad-grid" id="pad-grid" role="group" aria-label="Drums" style="--strata-pad-columns: 3; gap: 12px;">
    ${pad({ id: "kick", label: "Kick", colour: "danger" })}
    ${pad({ id: "snare", label: "Snare", colour: "accent" })}
    ${pad({ id: "hat", label: "Hat", colour: "success" })}
    ${pad({ id: "loop", label: "Loop", colour: "warning", latching: true })}
    ${pad({ id: "arm", label: "Arm", colour: "info", latching: true, pressed: true })}
    ${pad({ id: "locked", label: "Locked", disabled: true })}
  </div>
  <form id="pad-form" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin:16px 0 0">
    ${pad({ id: "send", label: "Send", type: "submit", name: "send", colour: "success" })}
    <button type="button" class="ug-button" data-strata-face="raised" id="plain"><span class="ug-button__label">Plain</span></button>
  </form>
  <p class="read" id="pad-read">No hits yet</p>
  <pre id="pad-data"></pre>`;

/** Sixteen small pads: four rows of four roles; the sixth and the eleventh latch, the last is disabled. */
const sixteen = `
  <h2 id="pad-title" style="margin:0 0 12px;font-size:18px">Sixteen</h2>
  <div class="ug-pad-grid" id="pad-grid" role="group" aria-label="Sixteen pads" data-strata-size="small" style="--strata-pad-columns: 4;">
    ${Array.from({ length: 16 }, (_, index) => pad({ id: `p${index + 1}`, label: `P${index + 1}`, colour: roles[Math.floor(index / 4)], latching: index === 5 || index === 10, pressed: index === 10, disabled: index === 15 })).join("")}
  </div>
  <p class="read" id="pad-read">No hits yet</p>
  <pre id="pad-data"></pre>`;

const events: { id: string; type: string; detail?: unknown }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "pad-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "pad-title");
  section.innerHTML = params.has("grid16") ? sixteen : rack;
  const read = section.querySelector("#pad-read")!;
  for (const type of ["click", "strata-pressed-change", "strata-pad-velocity"]) section.addEventListener(type, event => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    events.push({ id: button.id, type, ...(type === "strata-pad-velocity" ? { detail: (event as CustomEvent).detail } : {}) });
    if (type === "click") read.textContent = `${button.id} hit; loop ${section.querySelector("#loop, #p6")?.getAttribute("aria-pressed")}`;
  });
  const form = section.querySelector<HTMLFormElement>("#pad-form");
  form?.addEventListener("submit", event => {
    event.preventDefault();
    const data: Record<string, string> = {};
    new FormData(form, event.submitter).forEach((value, key) => { data[key] = String(value); });
    section.querySelector("#pad-data")!.textContent = JSON.stringify(data);
    events.push({ id: "pad-form", type: "submit" });
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

// `?sound`, `?haptics` and `?muted` set the page's feedback options; without them each control's `feedback.*` tokens decide (off by default).
const feedback = attachStrataFeedback({ sound: params.has("sound") ? true : undefined, haptics: params.has("haptics") ? true : undefined, muted: params.has("muted") });

window.strataPadProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { feedback.update(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  state: () => controller?.state(),
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataPadProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; detail?: unknown }[]; clearEvents(): void;
    instrument(): unknown; state(): ReturnType<CanvasController["state"]> | undefined; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
