/**
 * Core's `input` capture rule (issue #167) on plain DOM, for `tests/browser/core-input-capture.test.mjs`. One enrolled
 * layer `#card` with two range inputs and a readout:
 * - `#plain`: an ordinary range with a visible native thumb (its `input` events must capture);
 * - `#marked`: a range with no native paint (thumb and track hidden), whose value is drawn by the GPU: the page moves a
 *   light (`handle.setEmitters`, the uniform path) across the card with it. It carries `data-underglass-gpu-value`, which
 *   the test can toggle (`mark`);
 * - `#readout`: text the `#marked` handler writes into the DOM when `writeReadout(true)` (the mutation observer must still
 *   capture it).
 * `window.inputCapture.ready` resolves with the test API.
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController, type MaterialHandle } from "@underglass/core";

const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
let card!: HTMLElement;
let handle: MaterialHandle | undefined;
let writeReadout = false;

const hosts = createCanvasHosts(frame);
const controller: CanvasController = mountApplicationModule({ ...hosts, budgets: { layers: 4, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.textContent = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  card = make("section", { id: "card", "aria-label": "Card" });
  card.setAttribute("drawable", "");
  const plain = make("div", { class: "row" });
  plain.append(make("input", { type: "range", id: "plain", min: "0", max: "100", value: "20", "aria-label": "Plain" }), make("span", {}, "plain"));
  const marked = make("div", { class: "row" });
  marked.append(make("input", { type: "range", id: "marked", min: "0", max: "100", value: "0", "data-underglass-gpu-value": "", "aria-label": "Marked" }), make("span", { id: "readout" }, "0"));
  card.append(make("h2", {}, "Input capture"), plain, marked);
  container.append(card);
  const release = enroll({ id: "card", element: card, layout: {}, transform: {} });
  return () => { release(); container.replaceChildren(); };
} });

const light = (fraction: number) => [{ position: [30 + fraction * 380, 230, 30] as [number, number, number], colour: [1, 0.9, 0.7] as [number, number, number], strength: 60000, radius: 260, reach: "layer" as const, face: 1 }];
const scene = () => ({
  format: "strata-scene" as const, version: 4 as const,
  extent: { width: card.offsetWidth, height: card.offsetHeight }, outset: { top: 0, right: 0, bottom: 0, left: 0 },
  backdrop: "#dee1e6", light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" as const }, shadow: { strength: 0.24 },
  interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
  materials: { face: { base: { roughness: 1 } } }, primitives: [], protected: [] as [number, number, number, number][], feather: 0, emitters: light(0),
});
handle = controller.setMaterial("card", { kind: "relief", scene: scene(), bounds: "layer", interaction: "material", media: "identity", fallback: "static" } as never);
await controller.enable();

const marked = document.getElementById("marked") as HTMLInputElement, readout = document.getElementById("readout")!;
marked.addEventListener("input", () => {
  handle?.setEmitters(light(Number(marked.value) / 100));
  if (writeReadout) readout.textContent = marked.value;
});

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
async function settle() {
  await controller.settle();
  for (let index = 0; index < 4; index++) await nextFrame();
}
type Metrics = { captures: number; uploads: number; gpuFrames: number; geometryUpdates: number; inputCapturesSkipped: number; perLayer: Record<string, { captures: number; inputCapturesSkipped: number }> };
const counts = () => {
  const value = controller.state() as unknown as { mode: string; reason: string; metrics: Metrics };
  return { mode: value.mode, reason: value.reason, captures: value.metrics.captures, uploads: value.metrics.uploads, gpuFrames: value.metrics.gpuFrames, geometryUpdates: value.metrics.geometryUpdates,
    inputCapturesSkipped: value.metrics.inputCapturesSkipped, layer: { ...value.metrics.perLayer.card } };
};
const clientBox = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
const setValue = (input: HTMLInputElement, value: number) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(value));
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
await settle();

declare global { interface Window { inputCapture: { ready: Promise<unknown> } } }
window.inputCapture = { ready: Promise.resolve({
  dpr: devicePixelRatio, settle, counts, state: () => controller.state(),
  box: (id: string) => clientBox(document.getElementById(id)!),
  mark: (on: boolean) => { if (on) marked.setAttribute("data-underglass-gpu-value", ""); else marked.removeAttribute("data-underglass-gpu-value"); },
  /** The `#marked` handler writes its value into `#readout` (a DOM change), or not. */
  writeReadout: (on: boolean) => { writeReadout = on; },
  /** One `input` event per animation frame on `id`, `frames` times, the value sweeping `from`..`to`; resolves when the last frame is done. */
  async sweep(id: string, frames: number, from: number, to: number) {
    const input = document.getElementById(id) as HTMLInputElement;
    for (let index = 0; index < frames; index++) {
      setValue(input, Math.round(from + ((to - from) * index) / Math.max(1, frames - 1)));
      await nextFrame();
    }
  },
}) };
