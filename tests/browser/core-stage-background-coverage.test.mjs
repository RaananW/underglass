/**
 * Coverage beyond one opaque card for the GPU stage background (issue #134; the base suite is
 * `core-stage-background.test.mjs`), on decoded pixels at DPR 1 and 2:
 * - a half-transparent layer over a dark page is the premultiplied source-over of its colour onto the page colour, through
 *   runtime theme changes;
 * - content updates on a dark page show fresh layer pixels across the whole layer and leave the stage alone, GPU on, native
 *   hits intact;
 * - lit panels (emitters at the Relief, Objects and Instrument levels, `instrument-emitters-core.html`) on the bare page
 *   (`?bare=1`: no stage layer, the page's own background) against the same scene over an opaque stage layer of the page's
 *   colour. The face pool multiplies what is on the canvas by `1 + E` and the instrument composite adds its halo, and
 *   neither may draw a bright ring at rounded or antialiased edges (premultiplied rgb above alpha is composited
 *   additively): no pixel of a panel's edge band is more than 2 levels brighter than the reference, lamps on.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const healthy = /^Current content=drawable owning WebGPU canvas/;
const COLOURS = { dark: [18, 20, 28], light: [222, 225, 230], none: [255, 255, 255] };
const viewport = { width: 800, height: 500 };

async function open(browser, dpr, theme, extra = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(`/core-stage-background.html?theme=${theme}${extra}`);
  await page.waitForFunction(() => window.stageBackground, null, { timeout: 60000 });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => {
    const api = await window.stageBackground.ready, value = api[name];
    return typeof value === "function" ? value(...args) : value;
  }, { name, args });
  await call("settle");
  return { context, page, errors, call };
}
const shot = async page => PNG.sync.read(await page.screenshot());
const pixel = (png, x, y, dpr) => { const offset = (Math.floor(y * dpr) * png.width + Math.floor(x * dpr)) * 4; return [...png.data.subarray(offset, offset + 3)]; };
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))));
async function gpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}
/** Stage pixels (outside the card) of the whole viewport equal `colour`. */
function expectStage(png, colour, dpr, label) {
  const wrong = [];
  for (let x = 2; x < viewport.width; x += 97) for (let y = 2; y < viewport.height; y += 83) {
    if (x < 360 && y < 260) continue;
    const got = pixel(png, x, y, dpr);
    if (got.some((value, index) => Math.abs(value - colour[index]) > 1)) wrong.push({ x, y, got });
  }
  expect(wrong, `${label}: every stage pixel is ${colour}`).toEqual([]);
}
/** Premultiplied source-over of a straight colour at `alpha` onto the page colour, as the compositor shows it. */
const over = (colour, alpha, page) => colour.map((value, index) => Math.round(value * alpha + page[index] * (1 - alpha)));

for (const dpr of [1, 2]) {
  test(`a half-transparent layer over a dark page is the premultiplied source-over of its colour onto the page, through theme changes (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr, "dark", "&alpha=0.5");
    try {
      await gpu(call, "alpha");
      const card = await call("box", "card");
      for (const theme of ["dark", "light", "none", "dark"]) {
        await call("theme", theme);
        await frames(page);
        const png = await shot(page);
        expectStage(png, COLOURS[theme], dpr, `${theme} stage`);
        const expected = over([200, 40, 40], 0.5, COLOURS[theme]);
        for (const [dx, dy] of [[250, 150], [200, 120], [270, 40], [40, 170]]) {
          const actual = pixel(png, card.x + dx, card.y + dy, dpr);
          expect(actual.every((value, index) => Math.abs(value - expected[index]) <= 2), `${theme}: ${actual} is 50% of 200,40,40 over the page, ${expected}`).toBe(true);
        }
        await gpu(call, `alpha after ${theme}`);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`content updates on the dark page show fresh layer pixels across the layer and leave the stage alone (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr, "dark");
    try {
      const start = await gpu(call, "dark");
      const card = await call("box", "card");
      const grid = [[250, 150], [200, 120], [270, 40], [40, 170], [290, 190], [150, 100]];
      let captures = start.captures;
      for (const colour of [[40, 160, 60], [40, 40, 200], [220, 180, 20]]) {
        await call("paint", `rgb(${colour})`);
        await call("settle");
        const png = await shot(page);
        for (const [dx, dy] of grid) expect(pixel(png, card.x + dx, card.y + dy, dpr), `fresh pixel at ${dx},${dy} after painting ${colour}`).toEqual(colour);
        expectStage(png, COLOURS.dark, dpr, `stage after painting ${colour}`);
        const counts = await gpu(call, `after painting ${colour}`);
        expect(counts.captures, `painting ${colour} is captured`).toBeGreaterThan(captures);
        captures = counts.captures;
      }
      const button = await call("box", "press");
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
      expect(await call("clicks"), "a native click still lands after the updates").toBe(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

async function lit(browser, level, bare, dpr, theme) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`/instrument-emitters-core.html?level=${level}&theme=${theme}&bare=${bare}&pointer=0`);
  await page.waitForFunction(() => window.emittersCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.emittersCore.ready)[name](...args), { name, args });
  await call("settle");
  const lamps = await call("lamps");
  await call("setLamps", Object.fromEntries(lamps.map(lamp => [lamp.id, true])));
  const counts = await call("counts");
  const panels = await call("panels");
  const png = PNG.sync.read(await page.screenshot());
  await context.close();
  return { png, panels, counts, errors };
}
for (const dpr of [1, 2]) for (const theme of ["dark", "light"]) for (const level of ["relief", "objects", "instrument"]) {
  test(`lit panels on the bare ${theme} page have no bright edge ring or halo against the same scene over a stage layer, at ${level} (DPR ${dpr})`, async ({ browser }) => {
    const stage = await lit(browser, level, 0, dpr, theme), bare = await lit(browser, level, 1, dpr, theme);
    for (const run of [stage, bare]) {
      expect(run.counts.mode, run.counts.reason).toBe("gpu");
      expect(run.counts.reason).toMatch(healthy);
      expect(run.errors).toEqual([]);
    }
    let compared = 0, worst = { excess: 0 };
    for (const id of ["a", "b", "c"]) {
      const box = stage.panels[id];
      const x0 = Math.round(box.x * dpr), y0 = Math.round(box.y * dpr), x1 = Math.round((box.x + box.width) * dpr), y1 = Math.round((box.y + box.height) * dpr);
      for (let y = y0 - 3; y < y1 + 3; y++) for (let x = x0 - 3; x < x1 + 3; x++) {
        if (x >= x0 + 4 * dpr && x < x1 - 4 * dpr && y >= y0 + 4 * dpr && y < y1 - 4 * dpr) continue;
        const cx = x / dpr, cy = y / dpr;
        // This panel's edge band, not where another panel (or its glow) lies.
        if (["a", "b", "c"].some(other => other !== id && cx >= stage.panels[other].x - 20 && cx <= stage.panels[other].x + stage.panels[other].width + 20
          && cy >= stage.panels[other].y - 20 && cy <= stage.panels[other].y + stage.panels[other].height + 20)) continue;
        const offset = (y * stage.png.width + x) * 4;
        const excess = Math.max(...[0, 1, 2].map(channel => bare.png.data[offset + channel] - stage.png.data[offset + channel]));
        compared++;
        if (excess > worst.excess) worst = { excess, panel: id, x: x - x0, y: y - y0, stage: [...stage.png.data.subarray(offset, offset + 3)], bare: [...bare.png.data.subarray(offset, offset + 3)] };
      }
    }
    expect(compared).toBeGreaterThan(1000);
    expect(worst.excess, `brightest pixel of the bare edge band over the stage-layer reference: ${JSON.stringify(worst)}`).toBeLessThanOrEqual(2);
  });
}
