/**
 * Entry for `ui-keypad.html`: Strata Keypads in plain contract markup (anatomy page `keypad.md`) with `@underglass/ui/css` and the
 * plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root,
 * presented on the GPU by `attachStrataGpu`. `window.strataKeypadProbe` is the hook for `tests/browser/ui-keypad.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: a polished plinth object and, per key, a body and a captured cap).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference
 *   checks).
 * A 3-column Dial keypad (1 to 9, a disabled *, 0, and a submitting #, the second legends on 2 to 9) in a form, and a small shifted
 * 2-column Hex keypad. Every click is recorded; `?sound`, `?haptics` and `?muted` set the page's feedback options (off by default)
 * and `feedback(options)` changes them.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

/** A key's contract markup. */
function key({ id, legend, shift, value, disabled, type = "button", name = "digit" }: { id: string; legend: string; shift?: string; value: string; disabled?: boolean; type?: string; name?: string }) {
  return `<button type="${type}" class="ug-keypad__key" id="${id}" name="${name}" value="${value}"${disabled ? " disabled" : ""}><span class="ug-keypad__cap" data-strata-face="raised"><span class="ug-keypad__print">${legend}</span>${shift ? `<span class="ug-keypad__shift">${shift}</span>` : ""}</span></button>`;
}

const shifts = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"];
const markup = `
  <h2 id="key-title" style="margin:0 0 4px;font-size:18px">Entry</h2>
  <div style="display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start">
    <form id="key-form">
      <fieldset class="ug-keypad" id="dial" style="--strata-keypad-columns: 3;">
        <legend class="ug-keypad__legend">Dial</legend>
        <div class="ug-keypad__plinth" data-strata-face="raised">
          ${Array.from({ length: 9 }, (_, index) => key({ id: `key-${index + 1}`, legend: String(index + 1), shift: shifts[index] || undefined, value: String(index + 1) })).join("")}
          ${key({ id: "key-star", legend: "*", value: "*", disabled: true })}
          ${key({ id: "key-0", legend: "0", value: "0", shift: "+" })}
          ${key({ id: "key-hash", legend: "#", value: "#", type: "submit", name: "entry" })}
        </div>
      </fieldset>
    </form>
    <fieldset class="ug-keypad" id="hex" data-strata-shifted="true" data-strata-size="small" aria-label="Hex entry" style="--strata-keypad-columns: 2;">
      <div class="ug-keypad__plinth" data-strata-face="raised">
        ${key({ id: "hex-a", legend: "A", shift: "10", value: "a", name: "hex" })}
        ${key({ id: "hex-b", legend: "B", shift: "11", value: "b", name: "hex" })}
        ${key({ id: "hex-c", legend: "C", shift: "12", value: "c", name: "hex" })}
        ${key({ id: "hex-d", legend: "D", shift: "13", value: "d", name: "hex" })}
      </div>
    </fieldset>
  </div>
  <p class="read" id="key-read">No keys yet</p>
  <pre id="key-data"></pre>`;

const events: { id: string; type: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "key-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "key-title");
  section.innerHTML = markup;
  const read = section.querySelector("#key-read")!;
  section.addEventListener("click", event => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    events.push({ id: button.id, type: "click" });
    read.textContent = `${button.id} pressed`;
  });
  const form = section.querySelector<HTMLFormElement>("#key-form")!;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data: Record<string, string> = {};
    new FormData(form, event.submitter).forEach((value, name) => { data[name] = String(value); });
    section.querySelector("#key-data")!.textContent = JSON.stringify(data);
    events.push({ id: "key-form", type: "submit" });
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

window.strataKeypadProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { feedback.update(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  state: () => controller?.state(),
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataKeypadProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string }[]; clearEvents(): void;
    instrument(): unknown; state(): ReturnType<CanvasController["state"]> | undefined; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
