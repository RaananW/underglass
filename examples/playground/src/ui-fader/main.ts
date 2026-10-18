/**
 * Entry for `ui-fader.html`: Strata Faders in plain contract markup (anatomy page `fader.md`) with `@underglass/ui/css`
 * and the plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an
 * Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataFaderProbe` is the hook for
 * `tests/browser/ui-fader.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level.
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and
 *   preference checks).
 * Three faders: Level (vertical, −60 to 6 dB, printed every 10 dB and at 6), Send (vertical, 0–10 in five detents) and
 * Pan (horizontal, −50 to 50, printed L, C and R), and a Reset button that returns them to their defaults. Every
 * `input` and `change` event is recorded.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const fraction = (value: number, min: number, max: number) => Math.round(((value - min) / (max - min)) * 10000) / 10000;
const minus = (value: number) => (value < 0 ? `−${-value}` : String(value));

/** One fader's contract markup, as a plain HTML author writes it. */
function fader({ id, label, min, max, step, value, unit, marks, detented, horizontal }: { id: string; label: string; min: number; max: number; step: number; value: number; unit: string; marks: [number, string][]; detented?: boolean; horizontal?: boolean }) {
  return `<div class="ug-fader${horizontal ? " ug-fader--horizontal" : ""}${detented ? " ug-fader--detented" : ""}" id="${id}-fader" style="--strata-fader-value: ${fraction(value, min, max)};">
    <div class="ug-fader__track">
      <span class="ug-fader__scale" aria-hidden="true">${marks.map(([at, text]) => `<span class="ug-fader__mark" data-strata-value="${at}" style="--strata-fader-at: ${fraction(at, min, max)};">${text}</span>`).join("")}</span>
      <span class="ug-fader__slot" data-strata-face="groove" aria-hidden="true"></span>
      <span class="ug-fader__carriage" data-strata-face="raised" aria-hidden="true"><span class="ug-fader__grip"></span></span>
      <input class="ug-fader__input" type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}"${horizontal ? "" : ` aria-orientation="vertical"`} data-strata-default="${value}" data-strata-unit="${unit}" aria-valuetext="${minus(value)}${unit}">
    </div>
    <label class="ug-fader__label" for="${id}">${label}</label>
  </div>`;
}

const markup = `
  <h2 id="fader-title" style="margin:0 0 12px;font-size:18px">Channel</h2>
  <form class="faders" id="fader-form">
    ${fader({ id: "level", label: "Level", min: -60, max: 6, step: 1, value: 0, unit: " dB", marks: [6, 0, -10, -20, -30, -40, -50, -60].map(value => [value, minus(value)]) })}
    ${fader({ id: "send", label: "Send", min: 0, max: 10, step: 2.5, value: 5, unit: "", detented: true, marks: [0, 2.5, 5, 7.5, 10].map(value => [value, String(value)]) })}
    <div class="column">
      ${fader({ id: "pan", label: "Pan", min: -50, max: 50, step: 1, value: 0, unit: "", horizontal: true, marks: [[-50, "L"], [-25, "−25"], [0, "C"], [25, "25"], [50, "R"]] })}
      <p class="read" id="fader-read">Level 0 dB, send 5, pan 0</p>
      <button type="button" class="ug-button" data-strata-face="raised" id="fader-reset"><span class="ug-button__label">Reset</span></button>
    </div>
  </form>`;

const events: { id: string; type: string; value: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "fader-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "fader-title");
  section.innerHTML = markup;
  const read = section.querySelector("#fader-read")!;
  const text = (id: string) => { const input = section.querySelector<HTMLInputElement>(`#${id}`)!; return input.getAttribute("aria-valuetext") ?? input.value; };
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const input = event.target as HTMLInputElement;
    events.push({ id: input.id, type, value: input.value });
    read.textContent = `Level ${text("level")}, send ${text("send")}, pan ${text("pan")}`;
  });
  section.querySelector("#fader-reset")!.addEventListener("click", () => {
    for (const input of section.querySelectorAll<HTMLInputElement>(".ug-fader__input")) {
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
    Object.assign(panel.style, compileStyle({ x: 40, y: 24, width: 540 }, {}, true));
    container.append(panel);
    return () => container.replaceChildren();
  } });
  attachStrata();
  strata = attachStrataGpu(controller, { level: params.get("level") === "objects" ? "objects" : undefined });
  host("enable").addEventListener("click", () => void controller!.enable());
  host("disable").addEventListener("click", () => void controller!.disable());
  if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());
}

window.strataFaderProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataFaderProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
