/**
 * Browser suite for a media change that alters a panel's layout under an Instrument scene built a frame earlier
 * (issue 156), on `core-scene-media-change.html`: one enrolled panel with a border on an inner box that a media
 * preference removes, so the panel is 20 px shorter, and a knob on its bottom-right corner whose bounds end on the old
 * box's edge. The page rebuilds the scene as the Strata GPU helper does (a `ResizeObserver` and a `MutationObserver` wake a
 * frame), so core's own `ResizeObserver` reconciles and draws first, with the scene built for the old layout.
 * - Per media preference (`prefers-contrast: more`, `forced-colors: active`, `prefers-color-scheme: dark`) and at DPR 1
 *   and 2: GPU stays on across the change and back; every draw from the change on, read in the task that made it (the
 *   output canvas is cleared after presenting), has nothing stepped down and the knob's parts in it (its lacquer cap's dark
 *   pixels, which the Relief knob does not have), so no composited frame shows the object at Relief; the layer is drawn as
 *   parts with nothing stepped down at the end; the border's pixels change (fresh) in the change and back.
 * - Containment still holds: a scene that is new, or built for the layout it is checked against, whose bounds leave the
 *   layer's box is stepped down, with its reason, and returns to parts when the bounds are inside.
 * Screenshots go to the `core-scene-media-change` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("core-scene-media-change");
const media = [
  { name: "prefers-contrast: more", page: "contrast", on: { contrast: "more" }, off: { contrast: "no-preference" } },
  { name: "forced-colors: active", page: "forced", on: { forcedColors: "active" }, off: { forcedColors: "none" } },
  { name: "prefers-color-scheme: dark", page: "scheme", on: { colorScheme: "dark" }, off: { colorScheme: "light" } },
];

/** Opens the page, and installs the tap: every GPU submit queues one read of the knob's box, in the task that made it. */
async function open(browser, dpr, query) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__watch = false;
    const submit = GPUQueue.prototype.submit;
    let queued = false;
    GPUQueue.prototype.submit = function (...args) {
      const result = submit.apply(this, args);
      if (window.__watch && !queued) { queued = true; queueMicrotask(() => { queued = false; window.__tap?.(); }); }
      return result;
    };
  });
  await page.goto(`/core-scene-media-change.html${query}`);
  await page.waitForFunction(() => window.mediaChange, null, { timeout: 30000 });
  await page.evaluate(() => window.mediaChange.settle());
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__draws = [];
    const t0 = performance.now();
    let frames = 0;
    const count = () => { frames++; requestAnimationFrame(count); };
    requestAnimationFrame(count);
    window.__tap = () => {
      const api = window.mediaChange, layer = api.instrument().layers[0], edge = document.getElementById("mc-edge").getBoundingClientRect();
      const { data } = api.pixels({ x: edge.left - 30, y: edge.top - 30, width: 124, height: 124 });
      let dark = 0;
      for (let at = 0; at < data.length; at += 4) if ((data[at] + data[at + 1] + data[at + 2]) / 3 < 90) dark++;
      window.__draws.push({ at: performance.now() - t0, frame: frames, mode: api.state().mode, status: layer.status, stepped: layer.steppedDown.map(entry => `${entry.object}: ${entry.reason}`),
        warnings: [...layer.warnings], height: api.panel().offsetHeight, dark });
    };
  });
  return { context, page, errors };
}
const draws = page => page.evaluate(() => window.__draws);
const state = page => page.evaluate(() => ({ mode: window.mediaChange.state().mode, layer: window.mediaChange.instrument().layers[0], height: window.mediaChange.panel().offsetHeight }));
/** Waits until the layer is drawn as parts and the frames have caught up. */
async function settled(page) {
  await page.waitForFunction(() => window.mediaChange.instrument().layers[0].status === "ready" && window.mediaChange.instrument().layers[0].steppedDown.length === 0, null, { timeout: 10000 });
  await page.evaluate(async () => { await window.mediaChange.controller.settle(); for (let index = 0; index < 4; index++) await new Promise(requestAnimationFrame); });
}
/** A 4 × 4 px patch of the screen at a client point, as its mean red, green and blue. */
async function patch(page, name, x, y) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.screenshot({ path: `${evidence}/${name}.png`, clip: { x, y, width: 4, height: 4 } }));
  const mean = [0, 0, 0];
  for (let at = 0; at < png.data.length; at += 4) for (let channel = 0; channel < 3; channel++) mean[channel] += png.data[at + channel] / (png.data.length / 4);
  return mean.map(Math.round);
}
/** Where the inner box's border is, in the layout with it: inside the panel, under its heading. */
const borderPoint = page => page.evaluate(() => { const box = document.getElementById("mc-flow").getBoundingClientRect(); return { x: box.left + 3, y: box.top + 120 }; });

for (const dpr of [1, 2]) for (const preference of media) {
  test(`${preference.name} at DPR ${dpr} changes the layout with no frame at Relief, GPU on and fresh pixels`, async ({ browser }) => {
    test.setTimeout(120000);
    const { context, page, errors } = await open(browser, dpr, `?media=${preference.page}`);
    const point = await borderPoint(page);
    const before = await patch(page, `${preference.page}-dpr${dpr}-before`, point.x, point.y);
    expect(before[2] - before[0], "the border is blue before").toBeGreaterThan(100);
    const rebuilds = await page.evaluate(() => window.mediaChange.rebuilds());
    const steady = await state(page);
    expect(steady.layer.status).toBe("ready");
    expect(steady.layer.steppedDown).toEqual([]);
    // The knob's parts in its box, measured in the draw of a rebuilt scene, are the reference for "parts drawn".
    await page.evaluate(() => { window.__watch = true; window.__draws.length = 0; window.mediaChange.rebuild(); });
    await page.waitForTimeout(300);
    const reference = (await draws(page)).filter(draw => draw.stepped.length === 0).at(-1);
    expect(reference, "a draw with the parts").toBeTruthy();

    // The change: the panel is 20 px shorter.
    await page.evaluate(() => { window.__draws.length = 0; });
    await page.emulateMedia(preference.on);
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 204, null, { timeout: 10000 });
    await settled(page);
    await page.waitForTimeout(300);
    const changed = await draws(page);
    const after = await patch(page, `${preference.page}-dpr${dpr}-after`, point.x, point.y);
    const end = await state(page);
    console.log(`${preference.name} DPR ${dpr}: ${changed.length} draws; stepped ${changed.filter(draw => draw.stepped.length).length}; dark ${changed.map(draw => draw.dark).join(",")} (reference ${reference.dark}); frames ${changed.map(draw => draw.frame).join(",")}; rebuilds ${await page.evaluate(() => window.mediaChange.rebuilds()) - rebuilds}; warnings ${JSON.stringify([...new Set(changed.flatMap(draw => draw.warnings))])}`);
    expect(changed.length, "the change was drawn").toBeGreaterThan(0);
    expect(changed.every(draw => draw.height === 204), "every draw is of the new layout").toBe(true);
    expect(changed.filter(draw => draw.stepped.length).map(draw => draw.stepped), "no draw steps an object down").toEqual([]);
    expect(changed.filter(draw => draw.mode !== "gpu"), "GPU stays on in every draw").toEqual([]);
    expect(changed.filter(draw => draw.status !== "ready"), "the layer is drawn as parts in every draw").toEqual([]);
    expect(Math.min(...changed.map(draw => draw.dark)), "the knob's parts are in the box in every draw").toBeGreaterThan(reference.dark * 0.5);
    expect(end.mode).toBe("gpu");
    expect(end.layer.status).toBe("ready");
    expect(end.layer.steppedDown).toEqual([]);
    expect(end.layer.warnings, "no warning once the scene is rebuilt").toEqual([]);
    expect(after[2] - after[0], "fresh pixels: the border is gone (the panel's face is there)").toBeLessThan(40);

    // And back: the panel grows by 20 px.
    await page.evaluate(() => { window.__draws.length = 0; });
    await page.emulateMedia(preference.off);
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 224, null, { timeout: 10000 });
    await settled(page);
    await page.waitForTimeout(300);
    const back = await draws(page);
    const restored = await patch(page, `${preference.page}-dpr${dpr}-back`, point.x, point.y);
    expect(back.filter(draw => draw.stepped.length || draw.mode !== "gpu" || draw.status !== "ready"), "no stepped-down or non-GPU draw growing back").toEqual([]);
    expect(restored[2] - restored[0], "the border is back").toBeGreaterThan(100);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("a scene whose bounds leave the layer's box is still stepped down, with its reason, and is drawn as parts when it is inside", async ({ browser }) => {
  test.setTimeout(120000);
  const { context, page, errors } = await open(browser, 1, "?media=contrast&hold=1");
  await page.evaluate(() => { window.__watch = true; });
  // A new scene whose edge knob's bounds lie 30 px past the box: stepped down at once, the other knob still parts.
  await page.evaluate(() => window.mediaChange.leave(30));
  await page.waitForFunction(() => window.mediaChange.instrument().layers[0].steppedDown.length > 0, null, { timeout: 5000 });
  let layer = (await state(page)).layer;
  expect(layer.steppedDown.map(entry => [entry.object, entry.reason, entry.detail])).toEqual([["mc-edge", "containment", "its bounds leave the layer's box"]]);
  expect((await state(page)).mode).toBe("gpu");
  // The same scene after a layout change stays stepped down (it was judged for the layout it was built for, and it left that).
  await page.emulateMedia({ contrast: "more" });
  await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 204, null, { timeout: 10000 });
  await page.waitForTimeout(300);
  layer = (await state(page)).layer;
  expect(layer.steppedDown.map(entry => entry.object), "the scene that left its box is still stepped down").toEqual(["mc-edge"]);
  // A scene built from the new layout, inside the box, is drawn as parts.
  await page.evaluate(() => window.mediaChange.rebuild());
  await settled(page);
  expect((await state(page)).layer.steppedDown).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

test("a scene its producer does not rebuild keeps its parts under the layout it was built for, with a warning that names both boxes", async ({ browser }) => {
  test.setTimeout(120000);
  const { context, page, errors } = await open(browser, 1, "?media=contrast&hold=1");
  await page.evaluate(() => { window.__watch = true; });
  await page.emulateMedia({ contrast: "more" });
  await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 204, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  const { mode, layer } = await state(page);
  expect(mode).toBe("gpu");
  expect(layer.status).toBe("ready");
  expect(layer.steppedDown, "the scene was accepted for the layout it was built for").toEqual([]);
  expect(layer.warnings).toEqual(["layout: the scene was built for 320 × 224 px and the layer is 320 × 204; its step-downs stand until the next scene"]);
  // The next scene, built from the layout, replaces the verdict and the warning goes.
  await page.evaluate(() => window.mediaChange.rebuild());
  await settled(page);
  expect((await state(page)).layer.warnings).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
