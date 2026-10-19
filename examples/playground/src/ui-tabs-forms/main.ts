/**
 * Entry for `ui-tabs-forms.html`: the Tabs' rail form in plain contract markup (anatomy page `tabs.md`, section 11) with `@underglass/ui/css` and the
 * plain-DOM behaviour (`attachStrata` from `@underglass/ui/dom`), in a Strata panel that is a direct child of an Underglass root, presented on the GPU
 * by `attachStrataGpu`. `window.strataTabsProbe` is the hook for `tests/browser/ui-tabs-forms.test.mjs`.
 * - `?dom` starts in the CSS presentation; `?level=objects` presents the page at the Objects level, and `?level=instrument` at the Instrument level
 *   (core's `instrument` material: the rail's plinth, each tab's key and its LED lens as parts).
 * - `?plain` puts the panel in the page's flow with no Underglass at all, as a plain HTML page uses it (the mobile and preference checks).
 * - `?flush` renders the same tabs in their flush markup (a groove under flat tabs), the look they had before the form.
 * Tabs `#acct` (a rail: Profile selected, Security, Billing disabled, Alerts), `#manual` (a rail with manual activation), `#side` (a vertical rail) and
 * `#flat` (flush), each with a panel per tab.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrata } from "@underglass/ui/dom";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
const flush = params.has("flush");

interface Tab { value: string; label: string; disabled?: boolean }
const tabs: Tab[] = [{ value: "profile", label: "Profile" }, { value: "security", label: "Security" }, { value: "billing", label: "Billing", disabled: true }, { value: "alerts", label: "Alerts" }];
const bodies: Record<string, string> = { profile: "Your name and photo.", security: "Your password and two-step sign-in.", billing: "Your plan and invoices.", alerts: "What we email you." };

/** A Tabs' contract markup: a rail (a plinth tablist, a key and an LED per tab) or the flush groove and indicators. */
function tabsHtml({ id, label, selected, rail, orientation = "horizontal", activation = "automatic" }: { id: string; label: string; selected: string; rail: boolean; orientation?: "horizontal" | "vertical"; activation?: "automatic" | "manual" }) {
  const list = tabs.map(tab => {
    const on = tab.value === selected;
    const inside = rail
      ? `<span class="ug-tab__led" data-strata-face="knob" aria-hidden="true"></span><span class="ug-tab__cap" data-strata-face="raised"><span class="ug-tab__label">${tab.label}</span></span>`
      : `<span class="ug-tab__label">${tab.label}</span><span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>`;
    return `<button class="ug-tab" type="button" role="tab" id="${id}-tab-${tab.value}" aria-selected="${on}" aria-controls="${id}-panel-${tab.value}"${on ? "" : ' tabindex="-1"'}${tab.disabled ? " disabled" : ""}>${inside}</button>`;
  }).join("");
  const panels = tabs.map(tab => `<div class="ug-tabs__panel" role="tabpanel" id="${id}-panel-${tab.value}" aria-labelledby="${id}-tab-${tab.value}" tabindex="0"${tab.value === selected ? "" : " hidden"}><p style="margin:0">${bodies[tab.value]}</p></div>`).join("");
  return `<div class="ug-tabs${orientation === "vertical" ? " ug-tabs--vertical" : ""}"${rail ? ' data-strata-form="rail"' : ""} id="${id}"><div class="ug-tabs__list" role="tablist" aria-label="${label}"${orientation === "vertical" ? ' aria-orientation="vertical"' : ""}${activation === "manual" ? ' data-strata-activation="manual"' : ""}${rail ? ' data-strata-face="raised"' : ""}>${rail ? "" : '<span class="ug-tabs__rail" data-strata-face="groove" aria-hidden="true"></span>'}${list}</div>${panels}</div>`;
}

const markup = `
  <h2 id="tf-title" style="margin:0 0 12px;font-size:18px">Account</h2>
  <div class="group"><h3>Rail</h3>${tabsHtml({ id: "acct", label: "Account", selected: "profile", rail: !flush })}</div>
  <div class="group"><h3>Rail, manual activation</h3>${tabsHtml({ id: "manual", label: "Manual", selected: "profile", rail: !flush, activation: "manual" })}</div>
  <div class="group"><h3>Rail, vertical</h3>${tabsHtml({ id: "side", label: "Side", selected: "security", rail: !flush, orientation: "vertical" })}</div>
  <div class="group"><h3>Flush</h3>${tabsHtml({ id: "flat", label: "Flat", selected: "alerts", rail: false })}</div>`;

const changes: string[] = [];
let panel!: HTMLElement;
let strata: StrataGpu | undefined;

/** Builds the panel and wires its event log. */
function build(): HTMLElement {
  const section = document.createElement("section");
  section.className = "ug-panel";
  section.id = "tf-panel";
  section.setAttribute("data-strata-face", "raised");
  section.setAttribute("data-strata-elevation", "floating");
  section.setAttribute("aria-labelledby", "tf-title");
  section.innerHTML = markup;
  section.addEventListener("strata-tab-change", event => { changes.push((event.target as Element).id); });
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

type Counts = { mode: string; captures: number; uploads: number; geometryUpdates: number };
window.strataTabsProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  changes: () => [...changes], clearChanges: () => { changes.length = 0; },
  state: () => controller?.state() as unknown as Record<string, unknown> | undefined,
  counts: () => {
    const state = controller?.state() as unknown as { mode: string; metrics: { captures: number; uploads: number; geometryUpdates: number } } | undefined;
    return state ? { mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates } : undefined;
  },
};
declare global {
  interface Window { strataTabsProbe: {
    controller: CanvasController | undefined; panel(): HTMLElement; scene(): ReturnType<StrataGpu["scene"]>; refresh(): void;
    changes(): string[]; clearChanges(): void; state(): Record<string, unknown> | undefined; counts(): Counts | undefined;
  } }
}
