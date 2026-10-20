/**
 * The plain layer pass is exact against the capture (issue #159) on `instrument-glass-core.html`: an Instrument layer
 * with no primitives and no objects presents the captured text as the DOM paints it, and text under a glass window is
 * the same pixels. For each of DPR 1 and 2, light and dark, it compares per pixel, over the display's text run and the
 * faceplate prints:
 * - (a) the DOM's own rendering (`?dom=1`, no GPU),
 * - (b) the layer with no primitives and no objects (only the capture),
 * - (c) the layer with the face primitive and no objects (the face pass),
 * - (d) the same text under the display's glass window (the exact twin), with the whole chain on;
 * and histograms the differences by level and by pixel class (background, glyph interior, glyph edge). Reports go to
 * the `core-layer-exactness` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-layer-exactness");
const viewport = { width: 1920, height: 1080 };

async function open(browser, dpr, query) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(`/instrument-glass-core.html${query}`);
  await page.waitForFunction(() => window.glassCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.glassCore.ready)[name](...args), { name, args });
  return { context, page, errors, call };
}
const shot = async page => PNG.sync.read(await page.screenshot());

/** The rects compared (client px): the display's text run and the faceplate prints. */
async function textRects(call, kind) {
  const patterns = await call("patterns"), labels = await call("labels");
  return kind === "display" ? [patterns.text] : labels.filter(label => label.id.endsWith("print") || label.id === "beside" || label.id === "below").map(({ x, y, width, height }) => ({ x, y, width, height }));
}
/**
 * Per-pixel comparison of `shown` against the reference `ref` over `rects`: how many pixels differ, the largest channel
 * difference, a histogram by level, and the same split by the reference pixel's class (the rect's most common colour is
 * the background; the farthest pixels from it are glyph interiors; the rest are anti-aliased edges).
 */
function compare(shown, ref, rects, dpr) {
  const pixels = [];
  for (const rect of rects) {
    const x0 = Math.ceil(rect.x * dpr), y0 = Math.ceil(rect.y * dpr), x1 = Math.floor((rect.x + rect.width) * dpr), y1 = Math.floor((rect.y + rect.height) * dpr);
    const counts = new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * ref.width + x) * 4, key = `${ref.data[o]},${ref.data[o + 1]},${ref.data[o + 2]}`; counts.set(key, (counts.get(key) ?? 0) + 1); }
    const background = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
    let far = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const o = (y * ref.width + x) * 4; far = Math.max(far, Math.max(...[0, 1, 2].map(c => Math.abs(ref.data[o + c] - background[c])))); }
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const o = (y * ref.width + x) * 4, distance = Math.max(...[0, 1, 2].map(c => Math.abs(ref.data[o + c] - background[c])));
      const diff = Math.max(...[0, 1, 2].map(c => Math.abs(shown.data[o + c] - ref.data[o + c])));
      pixels.push({ diff, cls: distance === 0 ? "background" : distance >= far * 0.9 ? "glyph" : "edge" });
    }
  }
  const histogram = {}, byClass = { background: 0, glyph: 0, edge: 0 }, total = { background: 0, glyph: 0, edge: 0 };
  let mismatched = 0, max = 0;
  for (const { diff, cls } of pixels) {
    total[cls]++;
    if (diff > 0) { mismatched++; max = Math.max(max, diff); histogram[diff] = (histogram[diff] ?? 0) + 1; byClass[cls]++; }
  }
  return { compared: pixels.length, mismatched, max, histogram, mismatchedByClass: byClass, pixelsByClass: total };
}

const POSTS = {
  "chain off": { smaa: false, bloom: false },
  "SMAA only": { smaa: true, bloom: false },
  "bloom only": { smaa: false, bloom: true },
  default: undefined,
  "every stage": { taa: true, contact: true, ssgi: true, smaa: true, bloom: true },
};

for (const dpr of [1, 2]) for (const theme of ["light", "dark"]) {
  test(`the plain layer pass is the capture, and so is the text under a window: DPR ${dpr}, ${theme}`, async ({ browser }) => {
    test.setTimeout(300000);
    await mkdir(directory, { recursive: true });
    const query = theme === "dark" ? "?theme=dark" : "";
    const dom = await open(browser, dpr, `?dom=1${theme === "dark" ? "&theme=dark" : ""}`);
    await dom.page.waitForTimeout(500);
    const reference = await shot(dom.page);
    const display = await textRects(dom.call, "display"), prints = await textRects(dom.call, "prints");
    await dom.context.close();

    const { context, page, errors, call } = await open(browser, dpr, query);
    const quiet = { lights: false, casters: false };
    // (b) no primitives and no objects: only the capture goes through the layer pass. (c) the face primitive too.
    await call("set", { ...quiet, primitives: false, objects: false });
    const plain = await shot(page);
    await call("set", { ...quiet, primitives: true, objects: false });
    const face = await shot(page);
    const result = { dpr, theme, display: {}, prints: {}, windows: {} };
    result.display.plainVsDom = compare(plain, reference, display, dpr);
    // (d) the same text under the display's window (the exact twin), bisected over the post chain's stages: no stage changes a texel.
    for (const [name, post] of Object.entries(POSTS)) {
      await call("set", { ...quiet, primitives: false, objects: true, post });
      const under = await shot(page);
      result.windows[name] = { vsPlain: compare(under, plain, display, dpr), vsDom: compare(under, reference, display, dpr) };
      await call("set", { ...quiet, primitives: true, objects: true, post });
      result.windows[name].vsFace = compare(await shot(page), face, display, dpr);
    }
    result.display.faceVsPlain = compare(face, plain, display, dpr);
    result.prints.faceVsPlain = compare(face, plain, prints, dpr);
    result.prints.plainVsDom = compare(plain, reference, prints, dpr);
    const counts = await call("counts");
    expect(counts.mode, "GPU stays on").toBe("gpu");
    expect(counts.reason).toMatch(/^Current content=drawable owning WebGPU canvas/);
    await writeFile(`${directory}/exactness-dpr${dpr}-${theme}.json`, JSON.stringify(result, null, 2));
    console.log(`DPR ${dpr} ${theme}: display text vs the DOM's own rendering: ${result.display.plainVsDom.mismatched}/${result.display.plainVsDom.compared} differ (max ${result.display.plainVsDom.max}); faceplate prints vs the DOM: ${result.prints.plainVsDom.mismatched}/${result.prints.plainVsDom.compared}`);
    for (const [name, value] of Object.entries(result.windows)) console.log(`  window, ${name}: vs the plain layer ${value.vsPlain.mismatched} differ (max ${value.vsPlain.max}), vs the face pass ${value.vsFace.mismatched}, vs the DOM ${value.vsDom.mismatched}`);

    expect(result.display.plainVsDom.compared, "there is text to compare").toBeGreaterThan(10000);
    expect(result.display.plainVsDom.mismatchedByClass.background, "no background pixel of the text run differs from the DOM").toBe(0);
    if (dpr === 2) expect(result.display.plainVsDom.mismatched, "the plain layer is the DOM's own rendering of the text: 0 mismatches").toBe(0);
    expect(result.display.faceVsPlain.mismatched, "the face primitive leaves the text as the layer without primitives has it").toBe(0);
    expect(result.prints.faceVsPlain.mismatched, "the faceplate prints are the same with and without the face primitive").toBe(0);
    for (const [name, value] of Object.entries(result.windows)) {
      expect(value.vsPlain.mismatched, `text under the window (${name}) is the plain layer's pixels, 0 mismatches`).toBe(0);
      expect(value.vsFace.mismatched, `text under the window (${name}) is the face pass's pixels, 0 mismatches`).toBe(0);
      // Whatever the capture is against the DOM's paint (at DPR 1 the browser rasterizes captured text differently), the glass adds nothing to it.
      expect(value.vsDom.mismatched, `text under the window (${name}) differs from the DOM exactly as the plain layer does`).toBe(result.display.plainVsDom.mismatched);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}
