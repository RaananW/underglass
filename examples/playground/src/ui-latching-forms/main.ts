/**
 * Entry for `ui-latching-forms.html`: the Strata latching forms in plain contract markup (anatomy pages `checkbox.md`, `radio.md` and
 * `segmented-control.md`, *Latching forms*) with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from
 * `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root, presented on the GPU by `attachStrataGpu`.
 * `window.strataLatchProbe` is the hook for `tests/browser/ui-latching-forms.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: the checkboxes as a bezel, a glass ring and a travelling captured cap, the bank and the
 *   segments as a plinth with keys and LEDs).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks).
 * - `?flush` renders the same controls in their flush markup (no `data-strata-form`), the look they had before the latching forms.
 * Checkboxes Monitor, Phantom (checked), Pad (mixed), a disabled one and a disabled checked one; a preset bank of Piano, Organ (selected),
 * Strings and a disabled Pad; a segmented control Day, Week (selected), Month; a form that submits their values. Every change is recorded;
 * `?sound`, `?haptics` and `?muted` set the page's feedback options (off by default) and `feedback(options)` changes them.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const flush = params.has("flush");

const keyObject = '<span class="ug-push__object ug-latch__object" aria-hidden="true"><span class="ug-push__bezel" data-strata-face="raised"></span><span class="ug-push__socket"></span><span class="ug-push__ring"></span></span>';
const bankObject = '<span class="ug-push__object ug-latch__object" aria-hidden="true"><span class="ug-push__led-socket"></span><span class="ug-push__led"></span></span>';
const attrs = (list: Record<string, string | boolean | undefined>) => Object.entries(list).filter(([, value]) => value !== undefined && value !== false).map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${value}"`)).join("");

/** A Checkbox's contract markup, latching or flush. */
function checkbox({ id, label, checked, disabled, name = "agree", colour }: { id: string; label: string; checked?: boolean; disabled?: boolean; name?: string; colour?: string }) {
  const input = `<input class="ug-checkbox__input"${flush ? ' data-strata-face="well"' : ""} type="checkbox" id="${id}" name="${name}" value="${id}"${attrs({ checked, disabled })}>`;
  if (flush) return `<label class="ug-checkbox">${input}<span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">${label}</span></label>`;
  return `<label class="ug-checkbox" data-strata-form="latching"><span class="ug-push ug-latch ug-latch--key"${colour ? ` data-strata-colour="${colour}"` : ""}>${input}${keyObject}<span class="ug-push__cap" data-strata-face="raised" aria-hidden="true"><span class="ug-checkbox__mark"></span></span></span><span class="ug-checkbox__label">${label}</span></label>`;
}
/** A radio of a RadioGroup, in a bank or flush. */
function radio({ id, label, checked, disabled }: { id: string; label: string; checked?: boolean; disabled?: boolean }) {
  const input = (face: boolean) => `<input class="ug-radio__input"${face ? ' data-strata-face="well"' : ""} type="radio" id="${id}" name="preset" value="${id}"${attrs({ checked, disabled })}>`;
  if (flush) return `<label class="ug-radio">${input(true)}<span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">${label}</span></label>`;
  return `<label class="ug-radio"><span class="ug-push ug-latch ug-latch--bank">${input(false)}${bankObject}<span class="ug-push__cap" data-strata-face="raised"><span class="ug-radio__label">${label}</span></span></span></label>`;
}
/** A segment of a SegmentedControl, latching or flush. */
function segment({ id, label, checked }: { id: string; label: string; checked?: boolean }) {
  const input = `<input class="ug-segmented__input" type="radio" id="${id}" name="range" value="${id}"${attrs({ checked })}>`;
  if (flush) return `<label class="ug-segmented__item">${input}<span class="ug-segmented__key" data-strata-face="raised">${label}</span></label>`;
  return `<label class="ug-segmented__item"><span class="ug-push ug-latch ug-latch--bank">${input}${bankObject}<span class="ug-push__cap ug-segmented__key" data-strata-face="raised">${label}</span></span></label>`;
}

const markup = `
  <h2 id="latch-title" style="margin:0 0 12px;font-size:18px">Channel strip</h2>
  <form id="latch-form">
    <div id="solo-row" style="margin-bottom:28px">${checkbox({ id: "cb-monitor", label: "Monitor" })}</div>
    <div id="check-row" style="display:flex;flex-wrap:wrap;gap:4px 24px;align-items:center">
      ${checkbox({ id: "cb-phantom", label: "Phantom", checked: true, colour: "info" })}
      ${checkbox({ id: "cb-mixed", label: "Pad group" })}
      ${checkbox({ id: "cb-locked", label: "Locked", disabled: true })}
      ${checkbox({ id: "cb-armed", label: "Armed", checked: true, disabled: true })}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:16px 32px;align-items:flex-start;margin-top:8px">
      <fieldset class="ug-radio-group" id="bank"${flush ? "" : ' data-strata-form="bank"'}>
        <legend class="ug-radio-group__legend">Preset</legend>
        ${flush ? "" : '<div class="ug-bank__plinth" data-strata-face="raised">'}
          ${radio({ id: "r-piano", label: "Piano" })}
          ${radio({ id: "r-organ", label: "Organ", checked: true })}
          ${radio({ id: "r-strings", label: "Strings" })}
          ${radio({ id: "r-pad", label: "Pad", disabled: true })}
        ${flush ? "" : "</div>"}
      </fieldset>
      <fieldset class="ug-segmented" id="range"${flush ? "" : ' data-strata-form="latching"'}>
        <legend class="ug-segmented__legend">Range</legend>
        <div class="ug-segmented__plinth"${flush ? "" : ' data-strata-face="raised"'}>
          ${segment({ id: "s-day", label: "Day" })}
          ${segment({ id: "s-week", label: "Week", checked: true })}
          ${segment({ id: "s-month", label: "Month" })}
        </div>
      </fieldset>
    </div>
    <p style="margin:12px 0 0"><button type="submit" class="ug-button" data-strata-face="raised" id="send"><span class="ug-button__label">Send</span></button>
      <button type="button" class="ug-button" data-strata-face="raised" id="plain"><span class="ug-button__label">Plain</span></button></p>
  </form>
  <p class="read" id="latch-read">No changes yet</p>
  <pre id="latch-data"></pre>`
  // The segmented plinth of the latching form is the bank's (one polished part).
  .replace('<div class="ug-segmented__plinth" data-strata-face="raised">', '<div class="ug-segmented__plinth ug-bank__plinth" data-strata-face="raised">');

const events: { id: string; type: string; checked?: boolean }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "latch-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "latch-title");
  section.innerHTML = markup;
  (section.querySelector("#cb-mixed") as HTMLInputElement).indeterminate = true;
  const read = section.querySelector("#latch-read")!;
  section.addEventListener("change", event => {
    const input = event.target as HTMLInputElement;
    events.push({ id: input.id, type: "change", checked: input.checked });
    read.textContent = `${input.id} ${input.checked ? "on" : "off"}`;
  });
  section.addEventListener("click", event => {
    const input = (event.target as Element).closest("input");
    if (input) events.push({ id: input.id, type: "click" });
  });
  const form = section.querySelector<HTMLFormElement>("#latch-form")!;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data: Record<string, string[]> = {};
    new FormData(form).forEach((value, key) => { (data[key] ??= []).push(String(value)); });
    section.querySelector("#latch-data")!.textContent = JSON.stringify(data);
    events.push({ id: "latch-form", type: "submit" });
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

window.strataLatchProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { feedback.update(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  state: () => controller?.state(),
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataLatchProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; checked?: boolean }[]; clearEvents(): void;
    instrument(): unknown; state(): ReturnType<CanvasController["state"]> | undefined; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
