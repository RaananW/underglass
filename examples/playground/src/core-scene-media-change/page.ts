/**
 * A media preference that changes a panel's layout under an Instrument scene, on plain DOM with core's `instrument` material,
 * for `tests/browser/core-scene-media-change.test.mjs` (issue 156). One enrolled panel with a border that a media preference
 * removes from an inner box (`?media=contrast|forced|scheme`, default `contrast`), so the panel is 20 px shorter, and a knob at its
 * bottom-right corner whose bounds end on the new box's edge. The scene is rebuilt as the Strata GPU helper rebuilds its own:
 * a `ResizeObserver` on the panel and a `MutationObserver` on the root wake a frame, and the frame rebuilds the scene from the
 * layout it reads then. `?hold=1` never rebuilds (a producer that does not follow the layout); `?sync=1` also rebuilds in the media query's `change` listener, for the ordering experiments.
 *
 * `window.mediaChange` is the test API (`state`, `instrument`, `scene`, `panel`, `rebuilds`, `settle`, `pixels`).
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type InstrumentScene, type MaterialHandle } from "@underglass/core";
import { panelScene, themes } from "../instrument-core/scene.ts";

const params = new URLSearchParams(location.search);
const media = params.get("media") ?? "contrast";
document.documentElement.dataset.media = media;
const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const stage = () => ({ width: frame.clientWidth, height: frame.clientHeight });
const query = matchMedia(media === "forced" ? "(forced-colors: active)" : media === "scheme" ? "(prefers-color-scheme: dark)" : "(prefers-contrast: more)");

let panel!: HTMLElement;
const hosts = createCanvasHosts(frame);
const controller: CanvasController = mountApplicationModule({ ...hosts, budgets: { layers: 4, pixels: 4_000_000 } }, { mount({ container, enroll }) {
  panel = document.createElement("section");
  panel.id = "mc-panel"; panel.className = "mc-panel"; panel.setAttribute("drawable", ""); panel.setAttribute("aria-label", "panel");
  panel.innerHTML = `<h2>Panel</h2><div id="mc-flow"></div>`;
  for (const id of ["mc-near", "mc-edge"]) {
    const input = document.createElement("input");
    Object.assign(input, { type: "range", min: "0", max: "100", value: id === "mc-near" ? "30" : "70", id });
    input.setAttribute("aria-label", id); input.dataset.part = "knob";
    panel.append(input);
  }
  container.append(panel);
  const release = enroll({ id: panel.id, element: panel, layout: {}, transform: {} });
  return () => { release(); container.replaceChildren(); };
} });

let scene!: InstrumentScene, handle: MaterialHandle | undefined, rebuilds = 0;
/** Builds the scene from the layout as it is now and hands it to core. */
function rebuild() {
  rebuilds++;
  scene = panelScene(panel, themes.light, stage(), new Set(), { casters: true, objects: true });
  if (handle?.state().active) handle.update(scene);
  else handle = controller.setMaterial(panel.id, { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
}
let wake = 0;
const schedule = () => { if (!wake) wake = requestAnimationFrame(() => { wake = 0; rebuild(); }); };
const hold = params.get("hold") === "1";
if (!hold) new ResizeObserver(schedule).observe(panel);
if (!hold) new MutationObserver(schedule).observe(panel.parentElement!, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
if (params.get("sync") === "1") query.addEventListener("change", rebuild);
rebuild();

type State = ReturnType<CanvasController["state"]> & { instrument: { layers: { id: string; status: string; steppedDown: { object: string; reason: string; detail?: string }[] }[] } | null };
const state = () => controller.state() as unknown as State;
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
/** Waits for core to settle and the layer to be drawn as parts, then three frames. */
async function settle(timeout = 20000) {
  const deadline = performance.now() + timeout;
  for (;;) {
    await controller.settle();
    const layer = state().instrument?.layers.find(entry => entry.id === panel.id);
    if (layer?.status === "ready") break;
    if (performance.now() > deadline) throw new Error(`The layer did not settle: ${layer?.status}`);
    await nextFrame();
  }
  for (let index = 0; index < 3; index++) await nextFrame();
  status.textContent = `core-scene-media-change: ${media}\n${JSON.stringify(state().instrument?.layers)}`;
}
await controller.enable();
rebuild();
await settle();

/** The output canvas's pixels in a client rectangle now (the last presented frame), as RGBA bytes at the canvas's own resolution. */
function pixels(rect: { x: number; y: number; width: number; height: number }) {
  const canvas = hosts.outputCanvas, ratio = canvas.width / canvas.clientWidth;
  const copy = new OffscreenCanvas(Math.max(1, Math.round(rect.width * ratio)), Math.max(1, Math.round(rect.height * ratio)));
  const context = copy.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(canvas, Math.round(rect.x * ratio), Math.round(rect.y * ratio), copy.width, copy.height, 0, 0, copy.width, copy.height);
  return { width: copy.width, height: copy.height, data: Array.from(context.getImageData(0, 0, copy.width, copy.height).data) };
}
/** Hands core a scene built from the current layout, with the edge knob's bounds moved `by` px right (past the layer's edge). */
function leave(by: number) {
  const next = panelScene(panel, themes.light, stage(), new Set(), { casters: true, objects: true });
  const edge = next.objects.find(object => object.id === "mc-edge")!;
  edge.bounds = { rect: [edge.rect[0] + by, edge.rect[1], edge.rect[2], edge.rect[3]], radius: edge.rect[2] / 2 };
  scene = next;
  handle!.update(next);
}
window.mediaChange = {
  controller, state, instrument: () => state().instrument, panel: () => panel, scene: () => scene, rebuilds: () => rebuilds, settle, pixels, rebuild, leave,
  canvas: () => hosts.outputCanvas, query: () => query.matches,
};
declare global {
  interface Window { mediaChange: { controller: CanvasController; state(): State; instrument(): State["instrument"]; panel(): HTMLElement; scene(): InstrumentScene; rebuilds(): number;
    settle(): Promise<void>; rebuild(): void; leave(by: number): void; pixels(rect: { x: number; y: number; width: number; height: number }): { width: number; height: number; data: number[] };
    canvas(): HTMLCanvasElement; query(): boolean } }
}
