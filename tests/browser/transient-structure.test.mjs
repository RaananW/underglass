/**
 * Browser suite for issue #262 on `transient-structure.html` (`examples/playground/src/demo/transient-structure-demo.tsx`,
 * driven through `window.transientProbe`): a layer that is detached or zero-sized for a task, as a React commit leaves it
 * until its passive effects run, is decided at the next frame boundary rather than at once. GPU stays active, the layer
 * that left is gone from the canvas, the one that came back is drawn with its new pixels, and real clicks land on the
 * native controls. A layer that is still detached or zero-sized at the frame boundary falls back with the same reason as
 * before, in the first frame after the commit, and no GPU frame is drawn after the commit.
 *
 * `act(action)` makes the change in a task right after a frame (or, for `frame-zero`, inside a frame callback) and samples
 * the runtime after each of the next seven frames, in a task posted from that frame's callback: after the frame was
 * presented. `committed` is the frame count at which the page's own mutation observer saw the change.
 *
 * Layers, 110 x 110 at y 20: `stay-0` red (x 20), `stay-1` blue (x 220), `passive` green or purple (x 420, enrolled and
 * released in passive effects), `collapse` amber or teal (x 620, hidden by the page). Reports go to the
 * `transient-structure` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("transient-structure");
const red = [240, 30, 60, 255], blue = [30, 100, 220, 255], green = [20, 160, 80, 255], purple = [130, 40, 200, 255];
const amber = [250, 170, 20, 255], teal = [20, 170, 170, 255], white = [255, 255, 255, 255];
/** Writes one named JSON report into this suite's evidence directory. */
async function save(name, report) {
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/${name}.json`, JSON.stringify(report, null, 2));
}
/** Opens the fixture and waits for GPU admission. */
async function ready(page) {
  await page.goto("/transient-structure.html");
  await page.waitForFunction(() => window.transientProbe?.state().mode === "gpu");
  await page.evaluate(() => window.transientProbe.settle());
}
/** Makes one change (see the demo's `act`), then settles. */
async function act(page, action) {
  const report = await page.evaluate(action => window.transientProbe.act(action), action);
  await page.evaluate(() => window.transientProbe.settle());
  return { ...report, after: await page.evaluate(() => { const state = window.transientProbe.state();
    return { mode: state.mode, reason: state.reason, layers: state.layers.map(layer => layer.id), metrics: { deferredStructure: state.metrics.deferredStructure,
      heldDraws: state.metrics.heldDraws, gpuFrames: state.metrics.gpuFrames }, controllerFrames: state.runtimeResources.controllerFrames }; }) };
}
/** Screenshots `#frame` and returns a sampler `(x, y) => [r, g, b, a]` in frame CSS pixels. */
async function snap(page, name) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 820;
  return (x, y) => { const offset = (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4; return [...png.data.subarray(offset, offset + 4)]; };
}
/** Clicks, with the real mouse, the native button in the top-left corner of the layer at `x` and checks its new text. */
async function click(page, x, id, text) {
  const frame = await page.locator("#frame").boundingBox();
  await page.mouse.click(frame.x + x + 20, frame.y + 20 + 18);
  await expect(page.locator(`#${id}-button`)).toHaveText(text);
}
/** The checks every transient case shares: the change was made, held for the frame boundary and GPU stayed active. */
function stayedOnGPU(report) {
  expect(report.committed, "the change was committed").toBeDefined();
  for (const sample of report.samples) expect(sample.mode, `frame ${sample.frame}: ${sample.reason}`).toBe("gpu");
  expect(report.after.mode, report.after.reason).toBe("gpu");
  // The runtime saw the transient state and held it: this is what the test exercises.
  expect(report.after.metrics.deferredStructure - report.before.deferredStructure, "transient observations held").toBeGreaterThanOrEqual(1);
  // A frame was drawn after it (the frame that decided, and the paint of new content).
  expect(report.after.metrics.gpuFrames).toBeGreaterThan(report.committedFrames);
  expect(report.after.controllerFrames).toBe(0);
}
/** The checks every persistent case shares: the first frame after the commit is ordinary DOM with `reason`, and no GPU frame was drawn after the commit. */
function fellBack(report, reason, sameFrame = false) {
  expect(report.committed, "the change was committed").toBeDefined();
  const after = report.samples.filter(sample => sameFrame ? sample.frame >= report.committed : sample.frame > report.committed);
  expect(after.length).toBeGreaterThan(0);
  for (const sample of after) {
    expect(sample.mode, `frame ${sample.frame}`).toBe("dom");
    expect(sample.reason).toBe(reason);
    expect(sample.gpuFrames, `frame ${sample.frame}: no GPU frame after the commit`).toBe(report.committedFrames);
  }
}

test("a layer whose element React removes before its passive release leaves membership, and GPU stays active", async ({ page }) => {
  await ready(page);
  const report = await act(page, "remove");
  await save("remove", report);
  stayedOnGPU(report);
  expect(report.after.layers).toEqual(["stay-0", "stay-1", "collapse"]);
  const pixels = await snap(page, "remove");
  expect(pixels(475, 100), "the removed layer is gone from the canvas").toEqual(white);
  expect(pixels(75, 100)).toEqual(red);
  expect(pixels(275, 100)).toEqual(blue);
  expect(pixels(675, 100)).toEqual(amber);
  await click(page, 220, "stay-1", "stay-1 1");
  await click(page, 20, "stay-0", "stay-0 1");
  expect((await page.evaluate(() => window.transientProbe.state())).mode).toBe("gpu");
});

test("a layer hidden for a task and shown again by the next effect keeps GPU and is drawn with its new pixels", async ({ page }) => {
  await ready(page);
  const report = await act(page, "collapse");
  await save("collapse", report);
  stayedOnGPU(report);
  expect(report.after.layers).toEqual(["stay-0", "stay-1", "passive", "collapse"]);
  const pixels = await snap(page, "collapse");
  // The return changed its colour (amber to teal): the canvas shows the new pixels.
  expect(pixels(675, 100), "the layer that came back is drawn with its new colour").toEqual(teal);
  expect(pixels(475, 100)).toEqual(green);
  await click(page, 620, "collapse", "collapse 1");
  await click(page, 420, "passive", "passive g0 1");
  expect((await page.evaluate(() => window.transientProbe.state())).mode).toBe("gpu");
});

test("a key swap that remounts the same layer id in one commit keeps GPU and hits the new element", async ({ page }) => {
  await ready(page);
  const report = await act(page, "swap");
  await save("swap", report);
  stayedOnGPU(report);
  expect(report.after.layers).toEqual(["stay-0", "stay-1", "passive", "collapse"]);
  const pixels = await snap(page, "swap");
  expect(pixels(475, 100), "the remounted layer is drawn with the new generation's colour").toEqual(purple);
  expect(pixels(75, 100)).toEqual(red);
  // The new instance: its own counter, from 0.
  await click(page, 420, "passive", "passive g1 1");
  await click(page, 220, "stay-1", "stay-1 1");
  expect((await page.evaluate(() => window.transientProbe.state())).mode).toBe("gpu");
});

test("a layer that stays detached past the frame boundary falls back in the first frame, with the reason", async ({ page }) => {
  await ready(page);
  const report = await act(page, "detach");
  await save("detach", report);
  fellBack(report, "Detached enrolled layer: passive");
  // Ordinary DOM keeps the original controls working.
  await page.locator("#stay-0-button").click();
  await expect(page.locator("#stay-0-button")).toHaveText("stay-0 1");
  await page.evaluate(() => window.transientProbe.releaseLeaked());
});

test("a layer that stays zero-sized past the frame boundary falls back in the first frame, with the reason", async ({ page }) => {
  await ready(page);
  const report = await act(page, "zero");
  await save("zero", report);
  fellBack(report, "Zero-sized layer: collapse");
  await page.locator("#stay-1-button").click();
  await expect(page.locator("#stay-1-button")).toHaveText("stay-1 1");
});

test("a layer hidden inside a frame callback is decided in that frame, before it is presented", async ({ page }) => {
  // The page's own frame callback commits the change after the runtime's callbacks of that frame have run, so there is
  // no later frame boundary before the frame is presented: the native paint of the same frame decides it.
  await ready(page);
  const report = await act(page, "frame-zero");
  await save("frame-zero", report);
  expect(report.committed).toBe(1);
  fellBack(report, "Zero-sized layer: collapse", true);
});
