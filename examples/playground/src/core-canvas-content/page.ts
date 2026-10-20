/**
 * A `<canvas>` inside a GPU-presented layer (issue #184), for `tests/browser/core-canvas-content.test.mjs`. Two enrolled layers:
 * `#probe` (320 x 200, filled with variants by `window.canvasContent.install`) and `#plain` (a text card beside it that never holds
 * a canvas). `window.canvasContent.ready` resolves with the test API.
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController } from "@underglass/core";

const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const RED: Rgb = [200, 40, 40], GREEN: Rgb = [40, 160, 60], BLUE: Rgb = [40, 40, 200], YELLOW: Rgb = [230, 200, 20];
type Rgb = [number, number, number];
const css = (rgb: Rgb) => `rgb(${rgb.join(",")})`;
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
let probe!: HTMLElement, plain!: HTMLElement;
let release: (() => void) | undefined;
let enrollProbe!: () => () => void;

const controller: CanvasController = mountApplicationModule({ ...createCanvasHosts(frame), budgets: { layers: 4, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.textContent = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  probe = document.createElement("section");
  probe.id = "probe"; probe.setAttribute("aria-label", "Probe"); probe.setAttribute("drawable", "");
  plain = document.createElement("section");
  plain.id = "plain"; plain.setAttribute("aria-label", "Plain"); plain.setAttribute("drawable", "");
  const heading = document.createElement("h2"); heading.textContent = "Plain card";
  const swatch = document.createElement("div"); swatch.id = "swatch";
  const button = document.createElement("button"); button.id = "plain-button"; button.type = "button"; button.textContent = "Press";
  plain.append(heading, swatch, button);
  container.append(probe, plain);
  const releasePlain = enroll({ id: "plain", element: plain, layout: {}, transform: {} });
  enrollProbe = () => enroll({ id: "probe", element: probe, layout: {}, transform: {} });
  release = enrollProbe();
  return () => { release?.(); releasePlain(); container.replaceChildren(); };
} });
await controller.enable();

const canvas2d = (fill: Rgb, settings?: CanvasRenderingContext2DSettings) => {
  const node = document.createElement("canvas");
  node.width = 60; node.height = 30;
  const context = node.getContext("2d", settings)!;
  context.fillStyle = css(fill); context.fillRect(0, 0, 60, 30);
  return node;
};
const canvasGl = (preserve: boolean) => {
  const node = document.createElement("canvas");
  node.width = 60; node.height = 30;
  const gl = node.getContext("webgl", { preserveDrawingBuffer: preserve })!;
  gl.clearColor(YELLOW[0] / 255, YELLOW[1] / 255, YELLOW[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  return node;
};
const svgImage = (fill: Rgb) => {
  const node = document.createElement("img");
  node.width = 60; node.height = 30; node.alt = "";
  node.src = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="30"><rect width="60" height="30" fill="${css(fill)}"/></svg>`);
  return node;
};
/** The variants a layer can hold, each 60 x 30 and absolutely placed by `install`. */
const makers: Record<string, () => HTMLElement> = {
  "2d": () => canvas2d(RED),
  "2d-blue": () => canvas2d(BLUE),
  "2d-read-frequently": () => canvas2d(RED, { willReadFrequently: true }),
  "webgl": () => canvasGl(false),
  "webgl-preserve": () => canvasGl(true),
  "img": () => svgImage(BLUE),
  "div": () => { const node = document.createElement("div"); node.style.background = css(GREEN); return node; },
  "offscreen": () => {
    const node = document.createElement("canvas"); node.width = 60; node.height = 30;
    const context = node.transferControlToOffscreen().getContext("2d")!; context.fillStyle = css(RED); context.fillRect(0, 0, 60, 30);
    return node;
  },
};
const place = (node: HTMLElement, index: number) => {
  node.style.cssText += `;position:absolute;display:block;width:60px;height:30px;left:${10 + (index % 4) * 76}px;top:${10 + Math.floor(index / 4) * 46}px`;
  node.setAttribute("data-slot", String(index));
  return node;
};
const settle = async () => { await controller.settle(); for (let index = 0; index < 4; index++) await nextFrame(); };
const clientBox = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
const nodes: HTMLElement[] = [];

declare global { interface Window { canvasContent: { ready: Promise<unknown> } } }
window.canvasContent = { ready: Promise.resolve({
  dpr: devicePixelRatio, settle, state: () => controller.state(),
  /** Replaces the probe layer's content with the named variants, in order, 4 per row; `contents` gives the author's own `content` attribute per slot. */
  async install(kinds: string[], contents: Array<string | null> = []) {
    probe.replaceChildren(); nodes.length = 0;
    kinds.forEach((kind, index) => {
      const node = place(makers[kind]!(), index);
      if (contents[index]) node.setAttribute("content", contents[index]!);
      nodes.push(node); probe.append(node);
    });
    await settle();
  },
  /** Appends one variant at the next slot. */
  async add(kind: string) { const node = place(makers[kind]!(), nodes.length); nodes.push(node); probe.append(node); await settle(); return nodes.length - 1; },
  /** Appends one variant without waiting: the caller counts frames. */
  appendOnly(kind: string) { const node = place(makers[kind]!(), nodes.length); nodes.push(node); probe.append(node); return nodes.length - 1; },
  /** The `content` attribute of a slot, null when absent. */
  content: (index: number) => nodes[index]!.getAttribute("content"),
  /** Resets a 2d canvas slot's size (clearing it) and fills it again. */
  async resize(index: number, fill: Rgb) {
    const node = nodes[index] as HTMLCanvasElement; node.width = 60; node.height = 30;
    const context = node.getContext("2d")!; context.fillStyle = css(fill); context.fillRect(0, 0, 60, 30); await settle();
  },
  /** Moves a slot's canvas out of the layer into the body (still in the document, no longer in a layer). */
  async leave(index: number) { document.body.append(nodes[index]!); await settle(); },
  /** Marks the probe layer for recapture (what the author calls after drawing an OffscreenCanvas-transferred canvas). */
  async invalidate() { controller.invalidate("probe"); await settle(); },
  dispose: () => controller.dispose(),
  /** A canvas outside every layer (in the page, beside the output canvas), drawn red. */
  outsideCanvas() {
    const node = canvas2d(RED);
    node.id = "outside"; node.style.cssText = "position:fixed;left:700px;top:60px;width:60px;height:30px";
    document.body.append(node);
  },
  async remove(index: number) { nodes[index]!.remove(); nodes[index] = document.createElement("span"); await settle(); },
  /** Fills a 2d canvas slot again. */
  async redraw(index: number, fill: Rgb) { const context = (nodes[index] as HTMLCanvasElement).getContext("2d")!; context.fillStyle = css(fill); context.fillRect(0, 0, 60, 30); await settle(); },
  setAttribute: (index: number, name: string, value: string | null) => { if (value === null) nodes[index]!.removeAttribute(name); else nodes[index]!.setAttribute(name, value); },
  slot: (index: number) => clientBox(nodes[index]!),
  box: (id: string) => clientBox(document.getElementById(id)!),
  /** Disables then enables GPU: the DOM presentation for pixel references. */
  disable: () => controller.disable(), enable: () => controller.enable(),
  colours: { RED, GREEN, BLUE, YELLOW },
}) };
