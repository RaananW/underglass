/**
 * Raw probe for issue #184, no Underglass core: which `<canvas>` variants inside a `drawable` element are in the snapshot that
 * `drawElementImage` draws. `window.canvasCapture.run()` builds one `drawable` layer holding every variant on a plain
 * `content="drawable"` output canvas, draws the layer into a 2D read-back canvas on the `paint` event and reports, per variant, the
 * snapshot pixel at its centre next to the pixel the variant's own bitmap holds (read back through the canvas API). Used by
 * `tests/browser/core-canvas-content.test.mjs`; the results are the evidence recorded in `docs/upstream/canvas-in-drawable.md`.
 */
export {};
type Rgb = [number, number, number];
const BACKGROUND: Rgb = [233, 235, 239];
const RED: Rgb = [200, 40, 40], GREEN: Rgb = [40, 160, 60], BLUE: Rgb = [40, 40, 200], YELLOW: Rgb = [230, 200, 20];
const css = (rgb: Rgb) => `rgb(${rgb.join(",")})`;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

type Variant = { id: string; column: number; row: number; expected: Rgb; later?: Rgb; node: HTMLElement | undefined };
const variants: Variant[] = [];
const cell = (parent: HTMLElement, id: string, expected: Rgb, later?: Rgb) => {
  const index = variants.length, holder = document.createElement("div");
  holder.className = "cell"; holder.id = `cell-${id}`;
  holder.style.left = `${10 + (index % 8) * 76}px`; holder.style.top = `${10 + Math.floor(index / 8) * 46}px`;
  parent.append(holder);
  variants.push({ id, column: index % 8, row: Math.floor(index / 8), expected, later, node: undefined });
  return holder;
};
const canvas2d = (fill: Rgb, options?: CanvasRenderingContext2DSettings) => {
  const node = document.createElement("canvas");
  node.className = "v"; node.width = 60; node.height = 30;
  const context = node.getContext("2d", options)!;
  context.fillStyle = css(fill); context.fillRect(0, 0, 60, 30);
  return { node, context };
};
const webgl = (preserve: boolean) => {
  const node = document.createElement("canvas");
  node.className = "v"; node.width = 60; node.height = 30;
  const gl = node.getContext("webgl", { preserveDrawingBuffer: preserve })!;
  gl.clearColor(YELLOW[0] / 255, YELLOW[1] / 255, YELLOW[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT);
  return node;
};

function build(layer: HTMLElement, only?: string[], reverse = false) {
  const queue: Array<() => void> = [];
  const add = (id: string, expected: Rgb, make: () => HTMLElement, later?: Rgb) => {
    if (only && !only.includes(id)) return;
    queue.push(() => {
      const holder = cell(layer, id, expected, later), node = make();
      holder.append(node); variants.find(variant => variant.id === id)!.node = node;
    });
  };
  // 1. fill, 2. drawImage from another canvas, 3. fill then a second fill after a frame
  add("2d-fill", RED, () => canvas2d(RED).node);
  add("2d-drawImage", BLUE, () => { const { node, context } = canvas2d([0, 0, 0]); context.drawImage(canvas2d(BLUE).node, 0, 0); return node; });
  add("2d-after-frame", RED, () => canvas2d(RED).node, GREEN);
  add("webgl", YELLOW, () => webgl(false));
  add("webgl-preserve", YELLOW, () => webgl(true));
  add("2d-read-frequently", RED, () => canvas2d(RED, { willReadFrequently: true }).node);
  add("img-of-toDataURL", RED, () => { const node = document.createElement("img"); node.className = "v"; node.alt = ""; node.src = canvas2d(RED).node.toDataURL(); return node; });
  add("offscreen", RED, () => {
    const node = document.createElement("canvas"); node.className = "v"; node.width = 60; node.height = 30;
    const context = node.transferControlToOffscreen().getContext("2d")!; context.fillStyle = css(RED); context.fillRect(0, 0, 60, 30);
    return node;
  });
  add("nested-drawable-canvas", RED, () => {
    const node = document.createElement("canvas") as HTMLCanvasElement & { content: string };
    node.className = "v"; node.width = 60; node.height = 30; node.content = "drawable";
    const context = node.getContext("2d")!; context.fillStyle = css(RED); context.fillRect(0, 0, 60, 30);
    return node;
  });
  add("nested-canvas-holding-canvas", RED, () => {
    const outer = document.createElement("canvas") as HTMLCanvasElement & { content: string };
    outer.className = "v"; outer.width = 60; outer.height = 30; outer.content = "drawable";
    const inner = document.createElement("div"); inner.setAttribute("drawable", ""); inner.style.cssText = "width:60px;height:30px;";
    inner.append(canvas2d(RED).node); outer.append(inner);
    return outer;
  });
  add("deep-2d", RED, () => { const a = document.createElement("div"), b = document.createElement("div"); a.append(b); b.append(canvas2d(RED).node); return a; });
  add("hidden-then-shown-2d", RED, () => { const { node } = canvas2d(RED); node.style.visibility = "hidden"; return node; });
  for (const job of reverse ? queue.reverse() : queue) job();
}

/** The pixel at the centre of `node`'s cell in `data`, a layer-sized RGBA snapshot. */
const centre = (variant: Variant, data: ImageData): Rgb => {
  const x = 10 + variant.column * 76 + 30, y = 10 + variant.row * 46 + 15, offset = (y * data.width + x) * 4;
  return [data.data[offset]!, data.data[offset + 1]!, data.data[offset + 2]!];
};
const near = (a: Rgb, b: Rgb, tolerance = 6) => a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);

const steps: string[] = [];
async function run(only?: string[], reverse = false) {
  variants.length = 0;
  document.body.replaceChildren();
  steps.push("start");
  const out = document.createElement("canvas") as HTMLCanvasElement & { content: string; requestPaint(): void };
  out.id = "out"; out.width = 640; out.height = 240; out.content = "drawable";
  const layer = document.createElement("div");
  layer.id = "layer"; layer.setAttribute("drawable", "");
  out.append(layer); document.body.append(out);
  build(layer, only, reverse); steps.push("built");
  const context = out.getContext("2d", { willReadFrequently: true })! as CanvasRenderingContext2D & { drawElementImage(element: Element, x: number, y: number): void };
  const sample = () => new Promise<ImageData>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no paint event")), 4000);
    out.addEventListener("paint", () => { clearTimeout(timer); context.clearRect(0, 0, 640, 240); context.drawElementImage(layer, 0, 0); resolve(context.getImageData(0, 0, 640, 240)); }, { once: true });
    out.requestPaint();
  });
  await frame(); await frame(); steps.push("frames");
  const first = await sample(); steps.push("first");
  // Redraw: the after-frame variant gets its second fill, the hidden one is shown.
  await frame();
  const later = variants.find(variant => variant.id === "2d-after-frame")?.node as HTMLCanvasElement | undefined;
  if (later) { later.getContext("2d")!.fillStyle = css(GREEN); later.getContext("2d")!.fillRect(0, 0, 60, 30); }
  const hidden = variants.find(variant => variant.id === "hidden-then-shown-2d")?.node; if (hidden) hidden.style.visibility = "visible";
  await frame(); await frame(); steps.push("frames");
  const second = await sample();
  // The variant's own bitmap, the "DOM pixels": a 2D read-back of the canvas (drawImage) or the image.
  const own = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const bitmap = (node: HTMLElement): Rgb | "unreadable" => {
    try {
      own.canvas.width = 60; own.canvas.height = 30; own.clearRect(0, 0, 60, 30);
      own.drawImage((node instanceof HTMLCanvasElement || node instanceof HTMLImageElement ? node : node.querySelector("canvas")!), 0, 0, 60, 30);
      const p = own.getImageData(30, 15, 1, 1).data; return [p[0]!, p[1]!, p[2]!];
    } catch { return "unreadable"; }
  };
  return variants.map(variant => {
    const afterwards = variant.later ?? variant.expected;
    const snapshotFirst = centre(variant, first), snapshotSecond = centre(variant, second);
    return { id: variant.id, expected: variant.expected, expectedLater: afterwards, ownBitmap: bitmap(variant.node!),
      snapshotFirst, snapshotSecond, capturesFirst: near(snapshotFirst, variant.expected), capturesSecond: near(snapshotSecond, afterwards),
      blank: near(snapshotSecond, BACKGROUND) };
  });
}

declare global { interface Window { canvasCapture: { run: typeof run; background: Rgb; steps: string[] } } }
window.canvasCapture = { run, background: BACKGROUND, steps };
