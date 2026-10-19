/**
 * Entry for `ui-structural-forms.html`: the Strata structural forms in plain contract markup (anatomy pages `slider.md`, `card.md`,
 * `panel.md`, `dialog.md` and `drawer.md`, *Hardware forms* and *Plate and tray forms*) with `@underglass/ui/css` and the plain-DOM
 * behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root, presented on the
 * GPU by `attachStrataGpu`. `window.strataStructureProbe` is the hook for `tests/browser/ui-structural-forms.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the page at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: the knobs, faders, plates, trays and keys as parts).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks);
 *   the Dialog and the Drawer then open over the viewport.
 * - `?flush` renders the same controls in their flush markup (no `data-strata-form`), the look they had before the forms.
 * - `?panel=tray` makes the main panel a tray panel (a wrapper round what follows its title), `?panel=flush` a flush one; a plate panel by default.
 * - `?bare` shrinks the main panel to a small one at the bottom of the stage (GPU needs a layer to present), so the rest of the stage is empty for the Dialogs.
 * - `openPair()` opens two Dialogs side by side, identical but for their form (a plate on the left, a flush one on the right), over one scrim, so a
 *   test compares one against the other at the same instant of the same motion.
 * Sliders `#sl-knob` (a knob, 0–100), `#sl-fader` (a fader, −12 to 12 in 5 detents) and `#sl-flush` (the groove slider); Cards `#card-plate`,
 * `#card-tray` and `#card-flush`, each with a button; the Dialog `#sf-dialog` (a plate, with a knob slider and two buttons) and the Drawer
 * `#sf-drawer` (a tray on the end edge, with a fader slider and a button), opened by the probe or by the buttons above.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata, showStrataDialog, type DialogHandle } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const flush = params.has("flush");
const panelForm = flush || params.get("panel") === "flush" ? undefined : params.get("panel") === "tray" ? "tray" : "plate";
const fraction = (value: number, min: number, max: number) => Math.round(((value - min) / (max - min)) * 10000) / 10000;
const minus = (value: number) => (value < 0 ? `−${-value}` : String(value));
const attr = (name: string, value: string | undefined) => (value === undefined ? "" : ` ${name}="${value}"`);

/** A Slider as a knob (`ug-knob` markup round the Slider's own input), a fader (`ug-fader`, horizontal) or the groove slider, in a Field. */
function slider({ id, label, form, min, max, step, value, unit, marks, detents }: { id: string; label: string; form?: "knob" | "fader"; min: number; max: number; step: number; value: number; unit: string; marks?: [number, string][]; detents?: boolean }) {
  const formed = flush ? undefined : form;
  const input = (cls: string) => `<input class="${cls}" type="range" id="${id}" name="${id}" min="${min}" max="${max}" step="${step}" value="${value}"${formed ? ` data-strata-default="${value}" data-strata-unit="${unit}" aria-valuetext="${minus(value)}${unit}"` : ` data-strata-face="groove" aria-valuetext="${minus(value)}${unit}"`}>`;
  const scale = (cls: string) => `<span class="${cls}__scale" aria-hidden="true">${(marks ?? []).map(([at, text]) => `<span class="${cls}__mark" data-strata-value="${at}" style="--strata-${cls.slice(3)}-at: ${fraction(at, min, max)};">${text}</span>`).join("")}</span>`;
  let control: string;
  if (!formed) control = input("ug-slider");
  else if (formed === "knob") control = `<div class="ug-knob${detents ? " ug-knob--detented" : ""}" data-strata-form="knob" style="--strata-knob-value: ${fraction(value, min, max)};"><div class="ug-knob__dial">${scale("ug-knob")}<span class="ug-knob__skirt" data-strata-face="raised" aria-hidden="true"><span class="ug-knob__cap" data-strata-face="raised"><span class="ug-knob__pointer"></span></span></span>${input("ug-knob__input")}</div></div>`;
  else control = `<div class="ug-fader ug-fader--horizontal${detents ? " ug-fader--detented" : ""}" data-strata-form="fader" style="--strata-fader-value: ${fraction(value, min, max)};"><div class="ug-fader__track">${scale("ug-fader")}<span class="ug-fader__slot" data-strata-face="groove" aria-hidden="true"></span><span class="ug-fader__carriage" data-strata-face="raised" aria-hidden="true"><span class="ug-fader__grip"></span></span>${input("ug-fader__input")}</div></div>`;
  return `<div class="ug-field" id="${id}-field"><label class="ug-field__label" for="${id}">${label}</label>${control}</div>`;
}
/** A Card's contract markup, a plate, a tray or flush. */
function card({ id, title, form, body }: { id: string; title: string; form?: "plate" | "tray"; body: string }) {
  const formed = flush ? undefined : form;
  return `<article class="ug-card" id="${id}" data-strata-face="raised"${attr("data-strata-form", formed)} aria-labelledby="${id}-title"><h3 class="ug-card__title" id="${id}-title">${title}</h3>`
    + `<div class="ug-card__body"${formed === "tray" ? ' data-strata-face="well"' : ""}><p style="margin:0">${body}</p></div>`
    + `<div class="ug-card__footer"><button type="button" class="ug-button" data-strata-face="raised" id="${id}-button"><span class="ug-button__label">Save</span></button></div></article>`;
}
const marks100: [number, string][] = Array.from({ length: 6 }, (_, index) => [index * 20, String(index * 20)]);
const trim: [number, string][] = [-12, -6, 0, 6, 12].map(value => [value, minus(value)]);

const titled = `<h2 id="sf-title" style="margin:0 0 12px;font-size:18px">Rack</h2>`;
const content = `
  <p class="note" id="sf-note">Plates and trays keep their text where it was: the rim stands inside the box.</p>
  <div class="sliders" id="sf-sliders">
    ${slider({ id: "sl-knob", label: "Drive", form: "knob", min: 0, max: 100, step: 1, value: 40, unit: "%", marks: marks100 })}
    ${slider({ id: "sl-fader", label: "Trim", form: "fader", min: -12, max: 12, step: 6, value: 0, unit: " dB", marks: trim })}
    ${slider({ id: "sl-flush", label: "Mix", min: 0, max: 100, step: 1, value: 60, unit: "%" })}
  </div>
  <div class="cards" id="sf-cards">
    ${card({ id: "card-plate", title: "Plate card", form: "plate", body: "A machined plate with an edge break." })}
    ${card({ id: "card-tray", title: "Tray card", form: "tray", body: "The body sits in a recessed tray." })}
    ${card({ id: "card-flush", title: "Flush card", body: "The card of before." })}
  </div>`;
const markup = params.has("bare") ? '<h2 id="sf-title" style="margin:0;font-size:12px">.</h2>' : panelForm === "tray" ? `${titled}<div class="ug-panel__tray" data-strata-face="well">${content}</div>` : `${titled}${content}`;

let panel!: HTMLElement;
let root!: HTMLElement;
let strata: StrataGpu | undefined;
const events: { id: string; type: string; value: string }[] = [];
let overlay: { panel: HTMLElement; handle: DialogHandle } | undefined;
const closes: string[] = [];

/** Builds the main panel. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "sf-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "sf-title");
  if (panelForm) section.setAttribute("data-strata-form", panelForm);
  section.innerHTML = markup;
  for (const type of ["input", "change"]) section.addEventListener(type, event => {
    const input = event.target as HTMLInputElement;
    if (input.type === "range") events.push({ id: input.id, type, value: input.value });
  });
  return section;
}

/**
 * Opens the Dialog (a plate with a knob and two buttons) or the Drawer (a tray on the end edge with a fader and a button) as a top-level
 * panel of the root, as the bindings do with `container`: the scrim and the panel are root children, so `attachStrataGpu` presents each as
 * its own GPU panel. The Drawer closes on a click outside it.
 */
function open(kind: "dialog" | "drawer" = "dialog") {
  const scrim = document.createElement("div");
  scrim.className = "ug-scrim";
  scrim.setAttribute("aria-hidden", "true");
  const section = document.createElement("section");
  section.className = kind === "dialog" ? "ug-panel ug-dialog" : "ug-panel ug-drawer ug-drawer--end";
  section.id = `sf-${kind}`;
  section.tabIndex = -1;
  const form = flush ? undefined : kind === "dialog" ? "plate" : "tray";
  for (const [name, value] of [["role", "dialog"], ["aria-modal", "true"], ["aria-labelledby", `sf-${kind}-title`], ["data-strata-face", "raised"], ["data-strata-elevation", "modal"], ["data-strata-form", form]] as const) if (value) section.setAttribute(name, value);
  section.innerHTML = kind === "dialog"
    ? `<h2 class="ug-dialog__title" id="sf-dialog-title">Output stage</h2>
      <div class="ug-dialog__body"><p style="margin:0 0 8px">Set the level before you go on.</p>${slider({ id: "dl-knob", label: "Level", form: "knob", min: 0, max: 10, step: 1, value: 4, unit: "", marks: [[0, "0"], [5, "5"], [10, "10"]] })}</div>
      <div class="ug-dialog__actions">
        <button type="button" class="ug-button" data-strata-face="raised" id="sf-dialog-cancel"><span class="ug-button__label">Cancel</span></button>
        <button type="button" class="ug-button ug-button--accent" data-strata-face="raised" id="sf-dialog-ok"><span class="ug-button__label">Apply</span></button>
      </div>`
    : `<h2 class="ug-drawer__title" id="sf-drawer-title">Channel</h2>
      <div class="ug-drawer__body"><p style="margin:0 0 8px">A click outside the drawer closes it.</p>${slider({ id: "dr-fader", label: "Gain", form: "fader", min: 0, max: 10, step: 1, value: 3, unit: "", marks: [[0, "0"], [5, "5"], [10, "10"]] })}</div>
      <div class="ug-drawer__actions">
        <button type="button" class="ug-button" data-strata-face="raised" id="sf-drawer-done"><span class="ug-button__label">Done</span></button>
      </div>`;
  (root ?? document.body).append(scrim, section);
  const close = async (reason: string) => {
    closes.push(reason);
    await overlay?.handle.close();
    scrim.remove(); section.remove();
    overlay = undefined;
  };
  const handle = showStrataDialog(section, { onClose: reason => void close(reason), closeOnScrim: kind === "drawer" });
  for (const button of section.querySelectorAll("button")) button.addEventListener("click", () => void close(button.id.replace(`sf-${kind}-`, "")));
  overlay = { panel: section, handle };
}
/** Two identical Dialogs over one scrim, a plate at the left and a flush one at the right (`?bare`), opened in one task so they move together. */
function openPair() {
  const scrim = document.createElement("div");
  scrim.className = "ug-scrim";
  scrim.setAttribute("aria-hidden", "true");
  const sections = ([["plate", 20], [undefined, 340]] as const).map(([form, left]) => {
    const section = document.createElement("section");
    section.className = "ug-panel ug-dialog";
    section.id = form ? "pair-plate" : "pair-flush";
    section.tabIndex = -1;
    section.style.cssText = `inset: 40px auto auto ${left}px; margin: 0; width: 280px; height: auto;`;
    for (const [name, value] of [["role", "dialog"], ["aria-modal", "true"], ["aria-labelledby", `${section.id}-title`], ["data-strata-face", "raised"], ["data-strata-elevation", "modal"], ["data-strata-form", form]] as const) if (value) section.setAttribute(name, value);
    section.innerHTML = `<h2 class="ug-dialog__title" id="${section.id}-title">Output stage</h2>
      <div class="ug-dialog__body"><p style="margin:0 0 8px">Set the level.</p>${slider({ id: `${section.id}-knob`, label: "Level", form: "knob", min: 0, max: 10, step: 1, value: 4, unit: "", marks: [[0, "0"], [5, "5"], [10, "10"]] })}</div>
      <div class="ug-dialog__actions"><button type="button" class="ug-button" data-strata-face="raised" id="${section.id}-ok"><span class="ug-button__label">Apply</span></button></div>`;
    return section;
  });
  root.append(scrim, ...sections);
  const handles = sections.map(section => showStrataDialog(section, { onClose: () => undefined }));
  pair = { sections, handles, scrim };
}
let closing: Promise<void> | undefined;
let pair: { sections: HTMLElement[]; handles: DialogHandle[]; scrim: HTMLElement } | undefined;
host("open-dialog").addEventListener("click", () => open("dialog"));
host("open-drawer").addEventListener("click", () => open("drawer"));

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
    root = container;
    panel = build();
    // `?bare`: a small panel at the bottom of the stage (a layer is needed for GPU to present), so the rest of the stage is empty.
    Object.assign(panel.style, compileStyle(params.has("bare") ? { x: 20, y: 740, width: 60 } : { x: 20, y: 20, width: 600 }, {}, true));
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

type Counts = { mode: string; captures: number; uploads: number; geometryUpdates: number };
window.strataStructureProbe = {
  controller, panel: () => panel, scene: (element?: HTMLElement) => strata?.scene(element ?? panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
  open, openPair, overlay: () => overlay?.panel, closes: () => [...closes],
  closePair: async () => { if (!pair) return; await Promise.all(pair.handles.map(handle => handle.close())); pair.scrim.remove(); for (const section of pair.sections) section.remove(); pair = undefined; },
  closeOverlay: async () => { await overlay?.handle.close(); overlay?.panel.previousElementSibling?.remove(); overlay?.panel.remove(); overlay = undefined; },
  /** Starts closing the overlay without waiting for the leave motion; `closed()` resolves once it has left and been removed. */
  beginClose: () => { const current = overlay; if (!current) return; closing = current.handle.close().then(() => { current.panel.previousElementSibling?.remove(); current.panel.remove(); if (overlay === current) overlay = undefined; }); },
  closed: () => closing ?? Promise.resolve(),
  setSlider: (id: string, value: number) => {
    const input = document.getElementById(id) as HTMLInputElement;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  },
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataStructureProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(element?: HTMLElement): ReturnType<StrataGpu["scene"]>; refresh(): void;
    events(): { id: string; type: string; value: string }[]; clearEvents(): void;
    open(kind?: "dialog" | "drawer"): void; openPair(): void; closePair(): Promise<void>; overlay(): HTMLElement | undefined; closes(): string[]; closeOverlay(): Promise<void>; beginClose(): void; closed(): Promise<void>;
    setSlider(id: string, value: number): void;
    state(): Record<string, unknown> | undefined; counts(): Counts | undefined;
  } }
}
