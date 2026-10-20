/**
 * The GPU stage takes the page's own background (issue #134) on `core-stage-background.html` (`window.stageBackground`). The
 * output canvas is premultiplied and cleared to transparent, so what no layer covers is the page behind it. At DPR 1 and 2,
 * decoded pixels:
 * - a dark page keeps its background in GPU mode (every sampled pixel outside the layer equals the page background), and a
 *   light page keeps its own;
 * - a runtime theme change dark -> light -> dark shows the new colour on the next frame with GPU still on, no fallback and no
 *   new capture or upload (the layer did not change);
 * - a page with no background at all shows white, as the browser paints it behind a plain canvas;
 * - the layer itself keeps its pixels and a native click on its button still lands.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const viewport = { width: 800, height: 500 };
const healthy = /^Current content=drawable owning WebGPU canvas/;
const COLOURS = { dark: [18, 20, 28], light: [222, 225, 230], none: [255, 255, 255] };

async function open(browser, dpr, theme) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(`/core-stage-background.html?theme=${theme}`);
  await page.waitForFunction(() => window.stageBackground, null, { timeout: 60000 });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => {
    const api = await window.stageBackground.ready, value = api[name];
    return typeof value === "function" ? value(...args) : value;
  }, { name, args });
  await call("settle");
  return { context, page, errors, call };
}
const shot = async page => PNG.sync.read(await page.screenshot());
/** Sampled client points outside the card (and its 12 px corner), over the whole viewport. */
function stagePoints() {
  const points = [];
  for (let x = 2; x < viewport.width; x += 97) for (let y = 2; y < viewport.height; y += 83) {
    if (x < 360 && y < 260) continue;
    points.push([x, y]);
  }
  points.push([viewport.width - 1, viewport.height - 1], [0, 0], [380, 20], [20, 280]);
  return points;
}
const pixel = (png, x, y, dpr) => { const offset = (Math.floor(y * dpr) * png.width + Math.floor(x * dpr)) * 4; return [...png.data.subarray(offset, offset + 3)]; };
const expectStage = (png, colour, dpr, label) => {
  const wrong = stagePoints().map(([x, y]) => ({ x, y, got: pixel(png, x, y, dpr) })).filter(({ got }) => got.some((value, index) => Math.abs(value - colour[index]) > 1));
  expect(wrong, `${label}: every stage pixel is ${colour}`).toEqual([]);
};
async function gpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));

for (const dpr of [1, 2]) {
  for (const theme of ["dark", "light", "none"]) {
    test(`a ${theme} page keeps its background around the layer in GPU mode, and the layer and its hits are intact (DPR ${dpr})`, async ({ browser }) => {
      const { context, page, errors, call } = await open(browser, dpr, theme);
      try {
        await gpu(call, theme);
        const png = await shot(page);
        expectStage(png, COLOURS[theme], dpr, theme);
        const card = await call("box", "card");
        expect(pixel(png, card.x + 250, card.y + 150, dpr), "the layer's own pixels").toEqual([200, 40, 40]);
        const button = await call("box", "press");
        await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
        await frames(page);
        expect(await call("clicks"), "a native click on the layer's button lands").toBe(1);
        await page.mouse.click(card.x + card.width + 30, card.y + 30);
        expect(await call("clicks"), "a click on the stage misses the button").toBe(1);
        await gpu(call, `${theme} after clicks`);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  }

  test(`a runtime theme change shows the new colour on the next frame, GPU stays on and nothing is recaptured (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr, "dark");
    try {
      const start = await gpu(call, "dark");
      expectStage(await shot(page), COLOURS.dark, dpr, "dark");
      for (const theme of ["light", "dark", "none", "dark"]) {
        await call("theme", theme);
        await frames(page);
        expectStage(await shot(page), COLOURS[theme], dpr, `after ${theme}`);
        const counts = await gpu(call, `after ${theme}`);
        expect(counts.captures, `${theme}: no new capture`).toBe(start.captures);
        expect(counts.uploads, `${theme}: no new upload`).toBe(start.uploads);
      }
      const png = await shot(page);
      const card = await call("box", "card");
      expect(pixel(png, card.x + 250, card.y + 150, dpr), "the layer's own pixels").toEqual([200, 40, 40]);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
