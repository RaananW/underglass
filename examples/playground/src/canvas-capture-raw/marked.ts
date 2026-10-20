/**
 * The mark (issue #184): `content="drawable"` set on the nested canvas itself. `window.canvasMarked.runMarked(kind, mode, arrangement)` puts
 * the canvas in a `drawable` layer of a plain `content="drawable"` output canvas, marks it before attaching it, after attaching it, or
 * after attaching it and then resizes (resets width and height) and redraws it, and reports what `drawElementImage` captured at its
 * centre. `markEffects` reports the mark's side effects on a canvas in a plain page. Used by `tests/browser/core-canvas-content.test.mjs`.
 */
export {};
type Rgb = [number, number, number];
const BACKGROUND: Rgb = [233, 235, 239];
const RED: Rgb = [200, 40, 40], GREEN: Rgb = [40, 160, 60], BLUE: Rgb = [40, 40, 200], YELLOW: Rgb = [230, 200, 20], MAGENTA: Rgb = [200, 20, 200];
const css = (rgb: Rgb) => `rgb(${rgb.join(",")})`;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const near = (a: Rgb, b: Rgb, tolerance = 6) => a.every((value, index) => Math.abs(value - b[index]!) <= tolerance);
type Mode = "before" | "after" | "resize";
type Kind = "2d-fill" | "2d-drawImage" | "2d-after-frame" | "webgl" | "webgl-preserve" | "2d-read-frequently" | "offscreen" | "deep" | "hidden-then-shown";
type Arrangement = "alone" | "after-div" | "after-img" | "last-of-three" | "insert-before";
type Marked = HTMLCanvasElement & { content: string };
type Item = { root: HTMLElement; canvas: HTMLCanvasElement; fill: Rgb; redraw(colour: Rgb): void };

const filled = (fill: Rgb) => {
  const canvas = document.createElement("canvas");
  canvas.width = 60; canvas.height = 30;
  const context = canvas.getContext("2d")!;
  context.fillStyle = css(fill); context.fillRect(0, 0, 60, 30);
  return canvas;
};
function make(kind: Kind): Item {
  const canvas = document.createElement("canvas");
  canvas.width = 60; canvas.height = 30;
  if (kind === "webgl" || kind === "webgl-preserve") {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: kind === "webgl-preserve" })!;
    const clear = (c: Rgb) => { gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(c[0] / 255, c[1] / 255, c[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
    clear(YELLOW);
    return { root: canvas, canvas, fill: YELLOW, redraw: clear };
  }
  if (kind === "offscreen") {
    const context = canvas.transferControlToOffscreen().getContext("2d")!;
    const paint = (c: Rgb) => { context.fillStyle = css(c); context.fillRect(0, 0, 60, 30); };
    paint(RED);
    return { root: canvas, canvas, fill: RED, redraw: paint };
  }
  const context = canvas.getContext("2d", kind === "2d-read-frequently" ? { willReadFrequently: true } : undefined)!;
  const paint = (c: Rgb) => { context.fillStyle = css(c); context.fillRect(0, 0, 60, 30); };
  if (kind === "2d-drawImage") { context.drawImage(filled(BLUE), 0, 0); return { root: canvas, canvas, fill: BLUE, redraw: paint }; }
  paint(RED);
  let root: HTMLElement = canvas;
  if (kind === "deep") { const a = document.createElement("div"), b = document.createElement("div"); a.append(b); b.append(canvas); root = a; }
  if (kind === "hidden-then-shown") canvas.style.visibility = "hidden";
  return { root, canvas, fill: RED, redraw: paint };
}

async function runMarked(kind: Kind, mode: Mode, arrangement: Arrangement) {
  document.body.replaceChildren();
  const out = document.createElement("canvas") as HTMLCanvasElement & { content: string; requestPaint(): void };
  out.width = 640; out.height = 240; out.content = "drawable"; out.style.cssText = "position:fixed;left:0;top:0;width:640px;height:240px";
  const layer = document.createElement("div");
  layer.setAttribute("drawable", ""); layer.style.cssText = `position:absolute;left:0;top:0;width:640px;height:240px;background:${css(BACKGROUND)}`;
  out.append(layer); document.body.append(out);
  const errors: string[] = [];
  const context = out.getContext("2d", { willReadFrequently: true })! as CanvasRenderingContext2D & { drawElementImage(element: Element, x: number, y: number): void };
  const targets: Array<{ name: string; item: Item; slot: number }> = [];
  const place = (node: HTMLElement, slot: number) => { node.style.position = "absolute"; node.style.left = `${10 + slot * 76}px`; node.style.top = "10px"; node.style.width = "60px"; node.style.height = "30px"; node.style.display = "block"; };
  const mark = (item: Item) => { try { (item.canvas as Marked).content = "drawable"; } catch (error) { errors.push(String(error)); } };
  const add = (name: string, slot: number, before?: HTMLElement) => {
    const item = make(name === "target" ? kind : "2d-fill");
    place(item.root, slot);
    if (item.root !== item.canvas) { item.canvas.style.display = "block"; item.canvas.style.width = "60px"; item.canvas.style.height = "30px"; }
    if (mode === "before") mark(item);
    if (before) layer.insertBefore(item.root, before); else layer.append(item.root);
    if (mode !== "before") mark(item);
    targets.push({ name, item, slot });
    return item;
  };
  if (arrangement === "after-div") { const d = document.createElement("div"); d.style.background = css(GREEN); place(d, 0); layer.append(d); add("target", 1); }
  else if (arrangement === "after-img") {
    const i = document.createElement("img");
    i.alt = ""; i.width = 60; i.height = 30; i.src = filled(BLUE).toDataURL(); place(i, 0); layer.append(i); await i.decode(); add("target", 1);
  } else if (arrangement === "last-of-three") { add("first", 0); add("second", 1); add("target", 2); }
  else if (arrangement === "insert-before") { const first = add("target", 1); add("inserted", 0, first.root); }
  else add("target", 0);
  const target = targets.find(t => t.name === "target")!;
  const sample = () => new Promise<ImageData>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no paint event")), 4000);
    out.addEventListener("paint", () => { clearTimeout(timer); context.clearRect(0, 0, 640, 240); context.drawElementImage(layer, 0, 0); resolve(context.getImageData(0, 0, 640, 240)); }, { once: true });
    out.requestPaint();
  });
  const at = (data: ImageData, slot: number): Rgb => { const o = (25 * data.width + 10 + slot * 76 + 30) * 4; return [data.data[o]!, data.data[o + 1]!, data.data[o + 2]!]; };
  await frame(); await frame();
  const first = await sample();
  await frame();
  let expected: Rgb = target.item.fill;
  if (mode === "resize") {
    try { target.item.canvas.width = 60; target.item.canvas.height = 30; } catch (error) { errors.push(String(error)); }
    target.item.redraw(MAGENTA);
    expected = MAGENTA;
  } else if (kind === "2d-after-frame") { target.item.redraw(GREEN); expected = GREEN; }
  if (kind === "hidden-then-shown") target.item.canvas.style.visibility = "visible";
  await frame(); await frame();
  const second = await sample();
  const snapshotFirst = at(first, target.slot), snapshotSecond = at(second, target.slot);
  return { kind, mode, arrangement, expectedFirst: target.item.fill, expectedSecond: expected, snapshotFirst, snapshotSecond,
    capturesFirst: near(snapshotFirst, target.item.fill), capturesSecond: near(snapshotSecond, expected), blank: near(snapshotSecond, BACKGROUND),
    others: targets.filter(t => t !== target).map(t => ({ name: t.name, second: at(second, t.slot), captures: near(at(second, t.slot), t.item.fill) })), errors };
}

/** The mark's side effects on a canvas in a plain page (no output canvas around it). */
async function markEffects(kind: "2d" | "webgl", withMark = true) {
  const canvas = document.createElement("canvas") as Marked;
  canvas.width = 60; canvas.height = 30; canvas.id = "side";
  canvas.style.cssText = "position:fixed;left:700px;top:60px;width:60px;height:30px;margin:3px;padding:2px;border:1px solid black;box-sizing:content-box";
  const context = kind === "2d" ? canvas.getContext("2d")! : canvas.getContext("webgl", { preserveDrawingBuffer: true })!;
  if (kind === "2d") { const c = context as CanvasRenderingContext2D; c.fillStyle = css(RED); c.fillRect(0, 0, 60, 30); }
  else { const gl = context as WebGLRenderingContext; gl.clearColor(RED[0] / 255, RED[1] / 255, RED[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  document.body.append(canvas);
  await frame();
  const rect = () => { const r = canvas.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
  const before = rect(), attribute = canvas.getAttribute("content");
  if (withMark) canvas.content = "drawable";
  await frame(); await frame();
  const after = rect();
  const same = (kind === "2d" ? canvas.getContext("2d") : canvas.getContext("webgl", { preserveDrawingBuffer: true })) === context;
  const image = new Image();
  image.src = canvas.toDataURL(); await image.decode();
  const reader = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  reader.canvas.width = 60; reader.canvas.height = 30; reader.drawImage(image, 0, 0);
  const p = reader.getImageData(30, 15, 1, 1).data;
  const hit = document.elementFromPoint(after[0]! + after[2]! / 2, after[1]! + after[3]! / 2) === canvas;
  return { kind, withMark, attributeBefore: attribute, contentAfter: canvas.content, rectBefore: before, rectAfter: after, sameContext: same,
    toDataURLPixel: [p[0], p[1], p[2]], hitOnCanvas: hit, clientCentre: [after[0]! + after[2]! / 2, after[1]! + after[3]! / 2] };
}

/**
 * Does a redraw of a marked canvas raise a `paint` event on its own (no `requestPaint`, no DOM change)? Draws three colours a few frames
 * apart and reports the paints each caused and the layer's pixel at each paint.
 */
async function paintsAfterRedraw(kind: "2d" | "2d-read-frequently" | "webgl" | "webgl-preserve" | "offscreen" | "bitmaprenderer") {
  document.body.replaceChildren();
  const out = document.createElement("canvas") as HTMLCanvasElement & { content: string };
  out.width = 300; out.height = 100; out.content = "drawable"; out.style.cssText = "position:fixed;left:0;top:0;width:300px;height:100px";
  const layer = document.createElement("div");
  layer.setAttribute("drawable", ""); layer.style.cssText = `position:absolute;left:0;top:0;width:300px;height:100px;background:${css(BACKGROUND)}`;
  const canvas = document.createElement("canvas") as Marked;
  canvas.width = 60; canvas.height = 30; canvas.content = "drawable"; canvas.style.cssText = "position:absolute;left:10px;top:10px;width:60px;height:30px;display:block";
  out.append(layer); layer.append(canvas); document.body.append(out);
  const context = out.getContext("2d", { willReadFrequently: true })! as CanvasRenderingContext2D & { drawElementImage(element: Element, x: number, y: number): void };
  let fill: (colour: Rgb) => void | Promise<void>;
  if (kind === "offscreen") { const g = canvas.transferControlToOffscreen().getContext("2d")!; fill = c => { g.fillStyle = css(c); g.fillRect(0, 0, 60, 30); }; }
  else if (kind === "webgl" || kind === "webgl-preserve") {
    const gl = canvas.getContext("webgl", { preserveDrawingBuffer: kind === "webgl-preserve" })!;
    fill = c => { gl.clearColor(c[0] / 255, c[1] / 255, c[2] / 255, 1); gl.clear(gl.COLOR_BUFFER_BIT); };
  } else if (kind === "bitmaprenderer") {
    const g = canvas.getContext("bitmaprenderer")!;
    fill = c => { const o = new OffscreenCanvas(60, 30), x = o.getContext("2d")!; x.fillStyle = css(c); x.fillRect(0, 0, 60, 30); g.transferFromImageBitmap(o.transferToImageBitmap()); };
  } else { const g = canvas.getContext("2d", kind === "2d-read-frequently" ? { willReadFrequently: true } : undefined)!; fill = c => { g.fillStyle = css(c); g.fillRect(0, 0, 60, 30); }; }
  const seen: Rgb[] = [];
  out.addEventListener("paint", () => {
    context.clearRect(0, 0, 300, 100); context.drawElementImage(layer, 0, 0);
    const p = context.getImageData(40, 25, 1, 1).data; seen.push([p[0]!, p[1]!, p[2]!]);
  });
  const paints: number[] = [];
  for (const colour of [RED, GREEN, BLUE]) {
    const before = seen.length;
    await fill(colour);
    for (let i = 0; i < 8; i++) await frame();
    paints.push(seen.length - before);
  }
  return { kind, paints, last: seen[seen.length - 1] ?? null, seen };
}

declare global { interface Window { canvasMarked: { runMarked: typeof runMarked; markEffects: typeof markEffects; paintsAfterRedraw: typeof paintsAfterRedraw } } }
window.canvasMarked = { runMarked, markEffects, paintsAfterRedraw };
