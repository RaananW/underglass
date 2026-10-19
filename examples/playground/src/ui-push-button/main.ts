/**
 * Entry for `ui-push-button.html`: Strata PushButton forms in plain contract markup (anatomy pages `button.md` and
 * `toggle-button.md`, *Push-button forms*) with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from
 * `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root, presented on the GPU by
 * `attachStrataGpu`. `window.strataPushProbe` is the hook for `tests/browser/ui-push-button.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and
 *   `?level=instrument` at the Instrument level (core's `instrument` material: the push buttons as a bezel, a glass ring and a
 *   travelling captured cap, and the plain Button as a key).
 * - `?keys=N` adds N plain Buttons, each in its own colour (a key body each at the Instrument level), so the panel passes the helper's
 *   key-body and push-button material rules (`INSTRUMENT_KEY_BODY_MATERIALS`, `INSTRUMENT_PUSH_MATERIALS`).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and
 *   preference checks).
 * Momentary buttons Record (danger) and Talk, latching buttons Mute (warning) and 48 V (info, latched), a disabled one of each,
 * a momentary Send that submits a form, and a plain Button and ToggleButton beside them. Every click is recorded; `?sound`,
 * `?haptics` and `?muted` set the page's feedback options (off by default) and `feedback(options)` changes them.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, attachStrataFeedback, type StrataFeedbackOptions } from "@underglass/ui/dom";
import { attachStrataGpu, INSTRUMENT_KEY_BODY_MATERIALS, INSTRUMENT_PUSH_MATERIALS, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;

const object = (led: boolean) => `<span class="ug-push__object" aria-hidden="true"><span class="ug-push__bezel" data-strata-face="raised"></span><span class="ug-push__socket"></span><span class="ug-push__ring"></span>${led ? '<span class="ug-push__led-socket"></span><span class="ug-push__led"></span>' : ""}</span>`;

/** A momentary push button's contract markup. */
function momentary({ id, label, colour, disabled, type = "button", name }: { id: string; label: string; colour?: string; disabled?: boolean; type?: string; name?: string }) {
  return `<button type="${type}" class="ug-button ug-push" id="${id}" data-strata-form="momentary"${colour ? ` data-strata-colour="${colour}"` : ""}${name ? ` name="${name}" value="1"` : ""}${disabled ? " disabled" : ""}>${object(false)}<span class="ug-push__cap" data-strata-face="raised"><span class="ug-button__label">${label}</span></span></button>`;
}
/** A latching push button's contract markup. */
function latching({ id, label, colour, pressed, disabled }: { id: string; label: string; colour?: string; pressed?: boolean; disabled?: boolean }) {
  return `<button type="button" class="ug-toggle-button ug-push" id="${id}" data-strata-form="latching"${colour ? ` data-strata-colour="${colour}"` : ""} aria-pressed="${!!pressed}"${disabled ? " disabled" : ""}>${object(true)}<span class="ug-push__cap" data-strata-face="raised"><span class="ug-toggle-button__label">${label}</span></span></button>`;
}

const markup = `
  <h2 id="push-title" style="margin:0 0 12px;font-size:18px">Transport</h2>
  <div class="row" id="push-row" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center">
    ${momentary({ id: "record", label: "Record", colour: "danger" })}
    ${momentary({ id: "talk", label: "Talk" })}
    ${latching({ id: "mute", label: "Mute", colour: "warning" })}
    ${latching({ id: "phantom", label: "48 V", colour: "info", pressed: true })}
    ${momentary({ id: "locked", label: "Locked", disabled: true })}
    ${latching({ id: "latched-off", label: "Armed", pressed: true, disabled: true })}
  </div>
  <form id="push-form" style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin:16px 0 0">
    ${momentary({ id: "send", label: "Send", type: "submit", name: "send", colour: "success" })}
    <button type="button" class="ug-button" data-strata-face="raised" id="plain"><span class="ug-button__label">Plain</span></button>
    <button type="button" class="ug-toggle-button" data-strata-face="raised" id="plain-toggle" aria-pressed="false"><span class="ug-toggle-button__label">Plain toggle</span></button>
  </form>
  <p class="read" id="push-read">No clicks yet</p>
  <pre id="push-data"></pre>`;

const events: { id: string; type: string }[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Replaces the page's extra plain Buttons (`?keys=N`, and `setKeys(n)` in the probe) by `count` of them, each in its own colour. */
function addKeys(section: HTMLElement, count: number) {
  section.querySelectorAll("[id^=key-]").forEach(key => key.remove());
  for (let index = 0; index < count; index++) {
    const key = document.createElement("button");
    key.type = "button"; key.className = "ug-button"; key.id = `key-${index}`; key.setAttribute("data-strata-face", "raised");
    key.style.backgroundColor = `hsl(${Math.round(index * 360 / count)} 60% 55%)`;
    key.innerHTML = `<span class="ug-button__label">K${index}</span>`;
    section.querySelector("#push-form")!.append(key);
  }
}

/** Builds the panel and wires its readout and event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "push-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "push-title");
  section.innerHTML = markup;
  addKeys(section, Number(params.get("keys") ?? 0));
  const read = section.querySelector("#push-read")!;
  for (const type of ["click", "strata-pressed-change"]) section.addEventListener(type, event => {
    const button = (event.target as Element).closest("button");
    if (!button) return;
    events.push({ id: button.id, type });
    if (type === "click") read.textContent = `${button.id} clicked; mute ${section.querySelector("#mute")!.getAttribute("aria-pressed")}, 48 V ${section.querySelector("#phantom")!.getAttribute("aria-pressed")}`;
  });
  const form = section.querySelector<HTMLFormElement>("#push-form")!;
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data: Record<string, string> = {};
    new FormData(form, event.submitter).forEach((value, key) => { data[key] = String(value); });
    section.querySelector("#push-data")!.textContent = JSON.stringify(data);
    events.push({ id: "push-form", type: "submit" });
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

window.strataPushProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  feedback: (options: StrataFeedbackOptions) => { feedback.update(options); },
  instrument: () => (controller?.state() as unknown as { instrument: unknown } | undefined)?.instrument,
  state: () => controller?.state(),
  diagnostics: () => strata?.diagnostics(panel),
  setKeys: (count: number) => addKeys(panel, count),
  rules: { keyBody: INSTRUMENT_KEY_BODY_MATERIALS, push: INSTRUMENT_PUSH_MATERIALS },
  counts: () => { const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined; },
};
declare global {
  interface Window { strataPushProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string }[]; clearEvents(): void;
    setKeys(count: number): void; rules: { keyBody: number; push: number }; diagnostics(): ReturnType<StrataGpu["diagnostics"]> | undefined; instrument(): unknown; state(): ReturnType<CanvasController["state"]> | undefined; feedback(options: StrataFeedbackOptions): void; counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
