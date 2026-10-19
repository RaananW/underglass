/**
 * Entry for `ui-indicator-forms.html`: the Strata indicator forms in plain contract markup (anatomy pages `rating.md`, `badge.md`,
 * `progress-bar.md` and `spinner.md`, *Indicator form*) with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata` from
 * `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root, presented on the GPU by `attachStrataGpu`.
 * `window.strataIndicatorProbe` is the hook for `tests/browser/ui-indicator-forms.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the panel at the Objects level, and `?level=instrument` at the
 *   Instrument level (core's `instrument` material: every lens a glass LED with its emitter).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks).
 * - `?flush` renders the same controls in their flush markup (no `data-strata-form`), the look they had before the indicator forms.
 * A Rating `#rate` (3 of 5) and a disabled one `#rate-off` (2 of 5); Badges `#b-count` (a count), `#b-ok`, `#b-warn`, `#b-bad` ("99+") and
 * `#b-info`; ProgressBars `#p-det` (40%, 12 segments) and `#p-ind` (indeterminate); Spinners `#s-md` (label shown) and `#s-sm`.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const flush = params.has("flush");
const attrs = (list: Record<string, string | boolean | undefined>) => Object.entries(list).filter(([, value]) => value !== undefined && value !== false).map(([key, value]) => (value === true ? ` ${key}` : ` ${key}="${value}"`)).join("");

/** A Rating's contract markup, lamps or flush. */
function rating({ id, label, checked, disabled, colour }: { id: string; label: string; checked: number; disabled?: boolean; colour?: string }) {
  const items = [1, 2, 3, 4, 5].map(score => `<label class="ug-rating__item"><input class="ug-rating__input" type="radio" name="${id}" value="${score}"${attrs({ checked: score === checked, disabled })}>`
    + `<span class="ug-rating__star" aria-hidden="true">${flush ? "" : '<span class="ug-rating__lens" data-strata-face="knob"></span>'}</span><span class="ug-rating__label">${score} ${score === 1 ? "star" : "stars"}</span></label>`).join("");
  return `<fieldset class="ug-rating" id="${id}"${flush ? "" : ` data-strata-form="lamps"${colour ? ` data-strata-colour="${colour}"` : ""}`}><legend class="ug-rating__legend">${label}</legend><div class="ug-rating__stars">${items}</div></fieldset>`;
}
/** A Badge's contract markup, LED or flush. */
function badge({ id, variant, content, full }: { id: string; variant?: string; content: string; full?: string }) {
  const lens = flush ? "" : '<span class="ug-badge__lens" data-strata-face="knob" aria-hidden="true"></span>';
  return `<span class="ug-badge${variant ? ` ug-badge--${variant}` : ""}" id="${id}" data-strata-face="flat"${flush ? "" : ' data-strata-form="led"'}>${lens}${content}${full ? `<span class="ug-badge__full"> (${full})</span>` : ""}</span>`;
}
/** A ProgressBar's contract markup, a segment meter or flush. */
function progress({ id, label, value, segments = 12 }: { id: string; label: string; value?: number; segments?: number }) {
  const native = `<progress class="ug-progress" id="${id}" aria-label="${label}"${value === undefined ? "" : ` value="${value}"`} max="100"></progress>`;
  if (flush) return native.replace("<progress class=\"ug-progress\"", '<progress class="ug-progress" data-strata-face="groove"');
  const fraction = value === undefined ? "" : ` --strata-progress-value: ${value / 100};`;
  const lenses = Array.from({ length: segments }, (_, index) => `<span class="ug-progress__segment" data-strata-face="knob" style="--_i: ${index};"></span>`).join("");
  return `<span class="ug-progress-bar" data-strata-form="meter" style="--strata-progress-count: ${segments};${fraction}">${native}<span class="ug-progress__object" aria-hidden="true"><span class="ug-progress__window" data-strata-face="groove"></span><span class="ug-progress__segments">${lenses}</span></span></span>`;
}
/** A Spinner's contract markup, a ring or flush. */
function spinner({ id, label, size, labelled }: { id: string; label: string; size: "sm" | "md" | "lg"; labelled?: boolean }) {
  const cls = `ug-spinner ug-spinner--${size}${labelled ? " ug-spinner--labelled" : ""}`;
  if (flush) return `<span class="${cls}" id="${id}" role="status" data-strata-face="ring"><span class="ug-spinner__arc" aria-hidden="true"></span><span class="ug-spinner__label">${label}</span></span>`;
  const lenses = Array.from({ length: 8 }, (_, index) => `<span class="ug-spinner__lens" data-strata-face="knob" style="--_i: ${index};"></span>`).join("");
  return `<span class="${cls}" id="${id}" role="status" data-strata-form="ring"><span class="ug-spinner__ring" aria-hidden="true">${lenses}</span><span class="ug-spinner__label">${label}</span></span>`;
}

const markup = `
  <h2 id="ind-title" style="margin:0 0 12px;font-size:18px">Status board</h2>
  <p class="note" id="ind-note">Text beside the lights keeps its contrast: the light is limited over it.</p>
  <div id="rating-row" style="display:flex;flex-wrap:wrap;gap:8px 32px;align-items:flex-start;margin-bottom:12px">
    ${rating({ id: "rate", label: "Your rating", checked: 3 })}${rating({ id: "rate-off", label: "Their rating", checked: 2, disabled: true })}
  </div>
  <div id="badge-row" style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;margin-bottom:12px">
    ${badge({ id: "b-count", content: "3" })}${badge({ id: "b-ok", variant: "success", content: "Active" })}${badge({ id: "b-warn", variant: "warning", content: "Low" })}
    ${badge({ id: "b-bad", variant: "danger", content: "99+", full: "120" })}${badge({ id: "b-info", variant: "info", content: "New" })}
  </div>
  <div id="bar-col" style="display:grid;gap:8px;margin-bottom:12px">
    ${progress({ id: "p-det", label: "Upload", value: 40 })}${progress({ id: "p-ind", label: "Waiting for the server" })}
  </div>
  <div id="spin-row" style="display:flex;flex-wrap:wrap;gap:8px 32px;align-items:center">
    ${spinner({ id: "s-md", label: "Loading", size: "md", labelled: true })}${spinner({ id: "s-sm", label: "Saving", size: "sm" })}
  </div>`;

let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "ind-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "ind-title");
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

window.strataIndicatorProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  setProgress: (id, value) => { const native = document.getElementById(id) as HTMLProgressElement; if (value === undefined) native.removeAttribute("value"); else native.value = value; },
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataIndicatorProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    setProgress(id: string, value: number | undefined): void;
    state(): Record<string, unknown> | undefined;
    counts(): { mode: string; captures: number; uploads: number; geometryUpdates: number } | undefined;
  } }
}
