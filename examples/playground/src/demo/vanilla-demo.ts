/**
 * Plain-DOM application on `@underglass/core` alone, with no UI framework: `mountApplicationModule` gives
 * the app the adapter-owned container, the app builds its own original controls there and updates them with
 * ordinary DOM writes, and `controller.enroll` turns its two direct-root sections into GPU layers. Styles
 * come from `compileStyle`, applied with `Object.assign(element.style, ...)`. It renders the shared
 * framework-adapter app and exposes `window.frameworkProbe` for `tests/helpers/framework-contract.mjs`; with `?cases`
 * it also renders the case layers that `frameworkCases` drives (see `framework-probe.ts`).
 */
import { compileStyle, createCanvasHosts, mountApplicationModule, type CanvasController, type Layout, type Appearance, type LayerDefinition } from "@underglass/core";
import {
  caseColor, caseGeometry, caseId, changed, initialCase, withCases,
  type CaseLayer, type CaseLayerState, type CaseProbe, type LayerChange, type SecondMount,
} from "./framework-probe";

let mounts = 0, cleanups = 0;
let count = 0, swatch: "blue" | "yellow" = "blue";
const swatches = { blue: "rgb(20, 120, 220)", yellow: "rgb(250, 200, 20)" };
// Releases of the enrolled layers, by id.
const enrolled = new Map<string, () => void>();

// Creates an element with attributes, compiled typed styles and children.
function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, children: (Node | string)[] = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}
// A direct-root layer section, positioned and styled from typed layout and appearance.
function layer(id: string, layout: Layout, appearance: Appearance, children: (Node | string)[]) {
  const section = element("section", { id }, children);
  Object.assign(section.style, compileStyle(layout, appearance, true));
  return section;
}

const text = element("strong", { id: "text" }, ["Original native controls"]);
const counter = element("button", { id: "count", type: "button" }, ["Count 0"]);
const name = element("input", { id: "name", "aria-label": "Name", value: "original" });
const toggle = element("button", { id: "toggle", type: "button" }, ["Swap color"]);
const sample = element("div", { id: "swatch" });
sample.style.cssText = `position:absolute;right:12px;bottom:12px;width:60px;height:40px;background:${swatches.blue}`;
const column = element("div", {}, [text, counter, name, toggle]);
Object.assign(column.style, compileStyle({ direction: "column", gap: 8 }));
const panel = layer("panel", { x: 20, y: 20, width: 280, height: 220, padding: 12 }, { background: "rgb(240,30,60)", color: "black" }, [column, sample]);
const sideButton = element("button", { id: "side-button", type: "button" }, ["Side"]);
const side = layer("side", { x: 340, y: 20, width: 160, height: 100, padding: 8 }, { background: "rgb(20,200,90)" }, [sideButton]);
const extra = layer("extra", { x: 520, y: 20, width: 80, height: 40 }, { background: "rgb(38,104,215)" }, ["Extra"]);

// Ordinary DOM updates: the runtime notices them itself, no framework commit is involved.
const increment = () => { count++; counter.textContent = `Count ${count}`; };
counter.addEventListener("click", increment);
sideButton.addEventListener("click", increment);
toggle.addEventListener("click", () => {
  swatch = swatch === "blue" ? "yellow" : "blue";
  sample.style.background = swatches[swatch];
});

const host = (id: string) => document.getElementById(id)!;
// The module's raw layer registration, kept from `mount` for the `surface` case layer.
let register!: (layer: LayerDefinition) => () => void;
const controller: CanvasController = mountApplicationModule({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
}, { mount({ container, enroll }) {
  register = enroll;
  container.append(panel, side);
  mounts++;
  // Unmount, called once by disposal: release the layers, then remove the app's elements.
  return () => {
    for (const release of enrolled.values()) release();
    enrolled.clear();
    container.replaceChildren();
    cleanups++;
  };
} });
// Ref enrollment of the original sections, now that they are direct children of the persistent root.
for (const section of [panel, side]) enrolled.set(section.id, controller.enroll(section, { id: section.id }));

// The case layers of `?cases` (see `framework-probe.ts`): `ref` is enrolled with `controller.enroll`, `surface` with
// the module's `enroll`, the raw registration a layer component makes. The app writes its DOM, then enrolls.
const scene = { ref: initialCase(), surface: initialCase() };
const caseElements: Partial<Record<CaseLayer, HTMLElement>> = {};
// The case layer's content: its counting button, or a plain label while decorative.
function caseContent(kind: CaseLayer, state: CaseLayerState) {
  if (state.decorative) return element("span", {}, ["decorative"]);
  let clicks = 0;
  const label = `${kind} g${state.generation}`;
  const button = element("button", { id: `${kind}-button`, type: "button" }, [`${label} 0`]);
  button.addEventListener("click", () => { clicks++; button.textContent = `${label} ${clicks}`; });
  return button;
}
// Writes the state's colour, decorative attributes and content to the element.
function paintCase(kind: CaseLayer, node: HTMLElement, state: CaseLayerState) {
  node.style.background = caseColor(state);
  node.inert = state.decorative;
  if (state.decorative) node.setAttribute("aria-hidden", "true"); else node.removeAttribute("aria-hidden");
  // A decorative layer component also takes its pointer events away, as `Surface` does.
  if (kind === "surface") node.style.pointerEvents = state.decorative ? "none" : "";
  node.replaceChildren(caseContent(kind, state));
}
function createCase(kind: CaseLayer, state: CaseLayerState) {
  const { x, y, width, height } = caseGeometry[kind];
  // A layer component renders its section `drawable`; `controller.enroll` marks it itself.
  const node = kind === "ref" ? element("section", { id: "ref-layer" }) : element("section", { drawable: "" });
  Object.assign(node.style, compileStyle({ x, y, width, height, padding: 8 }, { color: "white", fontSize: 12 }, true));
  paintCase(kind, node, state);
  return node;
}
function enrollCase(kind: CaseLayer, node: HTMLElement, state: CaseLayerState) {
  const id = caseId(kind, state);
  if (kind === "surface") node.id = id;
  enrolled.set(`case:${kind}`, kind === "ref" ? controller.enroll(node, { id, decorative: state.decorative })
    : register({ id, element: node, layout: { ...caseGeometry.surface, padding: 8 }, transform: {}, decorative: state.decorative }));
}
const releaseCase = (kind: CaseLayer) => { enrolled.get(`case:${kind}`)?.(); enrolled.delete(`case:${kind}`); };
if (withCases) for (const kind of ["ref", "surface"] as const) {
  const node = caseElements[kind] = createCase(kind, scene[kind]);
  controller.container.append(node);
  enrollCase(kind, node, scene[kind]);
}
/** Applies one change in one task, in the order a framework commit does: release, write the DOM, enroll. */
async function changeLayer(kind: CaseLayer, change: LayerChange) {
  const previous = scene[kind], next = scene[kind] = changed(previous, change);
  const node = caseElements[kind];
  if (previous.mounted) releaseCase(kind);
  if (change === "unmount") { node?.remove(); delete caseElements[kind]; return; }
  if (change === "mount" || change === "swap") {
    const replacement = caseElements[kind] = createCase(kind, next);
    if (node) node.replaceWith(replacement); else controller.container.append(replacement);
  } else if (change === "rename") node!.style.background = caseColor(next); // The same element and content.
  else paintCase(kind, node!, next);
  enrollCase(kind, caseElements[kind]!, next);
}
function Throws(): never { throw new Error("The application failed in its first render"); }
let secondHosts: ReturnType<typeof createCanvasHosts> | undefined;
async function mountSecond(kind: "throws" | "healthy"): Promise<SecondMount> {
  const frame = host("second");
  secondHosts ??= createCanvasHosts(frame);
  const before = frame.innerHTML;
  let error: string | null = null, second: CanvasController | undefined;
  try {
    second = mountApplicationModule({ ...secondHosts }, { mount({ container, enroll }) {
      const section = layer("second", { x: 10, y: 10, width: 100, height: 60 }, { background: "rgb(240,30,60)" }, ["Second"]);
      section.setAttribute("drawable", "");
      container.append(section);
      // The module's own first render: building the rest of its DOM throws, so it removes what it created.
      if (kind === "throws") { section.remove(); Throws(); }
      const release = enroll({ id: "second", element: section, layout: { x: 10, y: 10, width: 100, height: 60 }, transform: {} });
      return () => { release(); section.remove(); };
    } });
  } catch (caught) { error = String(caught); }
  const after = frame.innerHTML, layers = second?.state().layers.map(entry => entry.id) ?? [];
  await second?.dispose();
  return { error, mounted: !!second, layers, before, after };
}

const originalRoot = controller.container, originalInput = name;
// Plain DOM has no `Presence`, so the probe has no `presence`.
const probe: CaseProbe = {
  controller,
  state: () => ({
    ...controller.state(), framework: "vanilla", count, name: name.value, swatch, mounts, cleanups,
    sameRoot: controller.container === originalRoot, sameInput: document.getElementById("name") === originalInput,
  }),
  // Structural updates: append or remove a direct-root section and enroll or release it.
  async addLayer() {
    controller.container.append(extra);
    enrolled.set("extra", controller.enroll(extra, { id: "extra" }));
  },
  async removeLayer() {
    enrolled.get("extra")?.();
    enrolled.delete("extra");
    extra.remove();
  },
  get cases() { return { ref: { ...scene.ref }, surface: { ...scene.surface }, completions: [] }; },
  changeLayer,
  mountSecond,
  async dispose() {
    await controller.dispose();
    return probe.state();
  },
};
window.frameworkProbe = probe;
for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", probe.dispose]] as const) {
  host(id).addEventListener("click", () => { void operation().catch(error => { host("status").textContent = String(error); }); });
}
