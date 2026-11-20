/**
 * Browser suite for `presence-unmount.html` (`window.presenceProbe`, from
 * `examples/playground/src/demo/presence-unmount-demo.tsx`): a React `Presence` taken away while its transition runs,
 * under GPU. The `Presence` must end its transition inside the commit that removes it, before any passive effect, and
 * must never report a completion after it is gone. Each case then proves GPU is still active, the frame shows the
 * removal (fresh pixels, no stale card), and a real pointer click on the native button of the layer that stayed
 * lands and recolours it on the canvas.
 *
 * "default" updates are plain React updates from outside an event: React commits them in a task and runs their
 * passive effects in a later task, after the microtasks of the commit. "sync" updates commit in `flushSync`, whose
 * passive effects React runs at the end of the same commit. Tests marked `strict` use the Vite dev server (React
 * StrictMode); the others use the preview build. Frame coordinates (640x420 at DPR 1): the `keep` panel around
 * (200, 160), the green stage card around (390, 180), the purple host card around (590, 180).
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("presence-unmount");
async function save(name, data) {
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/${name}.json`, JSON.stringify(data, null, 2));
}
const white = [255, 255, 255, 255];
const cool = [30, 100, 220, 255];
const warm = [220, 120, 20, 255];
/**
 * Collects React's (and any other) console warnings and errors and uncaught page errors, except Chrome's notice that
 * WebGPU ignores `powerPreference` on Windows (crbug.com/369219127), which every GPU page logs there.
 */
function watch(page) {
  const messages = [];
  page.on("console", message => {
    if ((message.type() === "warning" || message.type() === "error") && !/powerPreference/.test(message.text())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", error => messages.push(`pageerror: ${error.message}`));
  return messages;
}
/** Opens the page (dev server with StrictMode when `strict`), waits for GPU, then for scheduled work to drain. */
async function ready(page, strict) {
  await page.goto(`${strict ? `${developmentURL}/presence-unmount.html?strict` : "/presence-unmount.html"}`);
  await page.waitForFunction(() => window.presenceProbe && !window.presenceProbe.state().initializing && window.presenceProbe.state().mode === "gpu");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.presenceProbe.settle());
  expect(await pixel(page, "keep-initial", 200, 160)).toEqual(cool);
}
/** Screenshots `#frame` and returns the RGBA at (x, y); CSS pixels at DPR 1. */
async function pixel(page, name, x, y) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const i = (y * png.width + x) * 4;
  return [...png.data.subarray(i, i + 4)];
}
/**
 * The contract after a removal: GPU still on, the removed card gone from the frame at (x, y), and a real click on the
 * `keep` panel's native button lands and its new colour reaches the canvas.
 */
async function stillPresented(page, name, x, y) {
  expect((await page.evaluate(() => window.presenceProbe.state())).mode).toBe("gpu");
  await expect.poll(() => pixel(page, `${name}-removed`, x, y)).toEqual(white);
  await page.locator("#recolour").click();
  await expect(page.locator("#recoloured")).toHaveText("warm");
  await expect.poll(() => pixel(page, `${name}-recoloured`, 200, 160)).toEqual(warm);
  const after = await page.evaluate(() => window.presenceProbe.state());
  expect(after.mode).toBe("gpu");
  expect(after.runtimeResources.declarativeMotions).toBe(0);
  return after;
}
/** Asserts the exit is running on the GPU: the card at (x, y) is part-faded, channel `channel` strictly between its ends. */
async function midExit(page, name, x, y, channel, from) {
  const value = await pixel(page, `${name}-exiting`, x, y);
  expect(value[channel]).toBeGreaterThan(from);
  expect(value[channel]).toBeLessThan(255);
  return value;
}

// The stage's `Presence` is unmounted mid-exit while its enrolled section stays. The transition is cancelled within
// the removing commit (the parent's layout effect already sees no running motion), and no completion follows.
for (const strict of [false, true]) for (const mode of ["default", "sync"]) {
  test(`Presence unmounted mid-exit ends its transition in the commit mode=${mode} strict=${strict}`, async ({ page }) => {
    const messages = watch(page);
    await ready(page, strict);
    await page.evaluate(mode => window.presenceProbe.showStage(false, mode), mode);
    await page.waitForTimeout(600);
    const exiting = await midExit(page, `stage-${mode}-${strict}`, 390, 180, 0, 20);
    expect((await page.evaluate(() => window.presenceProbe.state())).runtimeResources.declarativeMotions).toBe(1);
    await page.evaluate(mode => window.presenceProbe.unmountStage(mode), mode);
    await expect(page.locator("#stage-card")).toHaveCount(0);
    expect((await page.evaluate(() => window.presenceProbe.state())).atCommit.stage).toBe(0);
    // Past the end the exit would have had.
    await page.waitForTimeout(3000);
    const after = await stillPresented(page, `stage-${mode}-${strict}`, 390, 180);
    expect(after.completions).toEqual([]);
    expect(after.runtimeResources.enrolledLayers).toBe(3);
    expect(messages).toEqual([]);
    await save(`stage-${mode}-${strict}`, { exiting, after, messages });
  });
}

// The host section is unmounted together with its `Presence` mid-exit. Releasing the enrollment cancels the transition
// ("Unenrolled") inside the commit, so its `finished` promise is already resolved when the commit ends; its
// continuation, a microtask, must not report that cancellation as a completion of the unmounted `Presence`.
for (const strict of [false, true]) for (const mode of ["default", "sync"]) {
  test(`Presence unmounted with its layer mid-exit reports no completion mode=${mode} strict=${strict}`, async ({ page }) => {
    const messages = watch(page);
    await ready(page, strict);
    await page.evaluate(mode => window.presenceProbe.showHost(false, mode), mode);
    await page.waitForTimeout(600);
    const exiting = await midExit(page, `host-${mode}-${strict}`, 590, 180, 1, 40);
    await page.evaluate(mode => window.presenceProbe.unmountHost(mode), mode);
    await expect(page.locator("#host")).toHaveCount(0);
    expect((await page.evaluate(() => window.presenceProbe.state())).atCommit.host).toBe(0);
    await page.waitForTimeout(3000);
    const after = await stillPresented(page, `host-${mode}-${strict}`, 590, 180);
    expect(after.completions).toEqual([]);
    expect(after.runtimeResources.enrolledLayers).toBe(2);
    expect(messages).toEqual([]);
    await save(`host-${mode}-${strict}`, { exiting, after, messages });
  });
}

// `present` flips back mid-exit (the exit is replaced by the enter, which is not reported), then the `Presence` is
// unmounted mid-enter: the enter ends within the commit too, and neither motion reports a completion.
for (const strict of [false, true]) test(`present flipped back mid-exit, then unmounted mid-enter strict=${strict}`, async ({ page }) => {
  const messages = watch(page);
  await ready(page, strict);
  await page.evaluate(() => window.presenceProbe.showStage(false, "default"));
  await page.waitForTimeout(600);
  await page.evaluate(() => window.presenceProbe.showStage(true, "default"));
  await page.waitForTimeout(600);
  const entering = await midExit(page, `flip-${strict}`, 390, 180, 0, 20);
  expect((await page.evaluate(() => window.presenceProbe.state())).runtimeResources.declarativeMotions).toBe(1);
  await page.evaluate(() => window.presenceProbe.unmountStage("default"));
  await expect(page.locator("#stage-card")).toHaveCount(0);
  expect((await page.evaluate(() => window.presenceProbe.state())).atCommit.stage).toBe(0);
  await page.waitForTimeout(3000);
  const after = await stillPresented(page, `flip-${strict}`, 390, 180);
  expect(after.completions).toEqual([]);
  expect(messages).toEqual([]);
  await save(`flip-${strict}`, { entering, after, messages });
});

// A Suspense boundary hides the `Presence` mid-exit. React runs layout-effect cleanups when it hides content (and
// StrictMode replays them on mount), so the hide ends the exit within that commit; when the content is shown again
// the exit plays again from the start and the content then unmounts, with exactly one completion.
for (const strict of [false, true]) test(`Suspense hiding a Presence mid-exit replays the exit when shown strict=${strict}`, async ({ page }) => {
  const messages = watch(page);
  await ready(page, strict);
  await page.evaluate(() => window.presenceProbe.showStage(false, "sync"));
  await page.waitForTimeout(600);
  await midExit(page, `suspend-${strict}`, 390, 180, 0, 20);
  await page.evaluate(() => window.presenceProbe.suspend("sync"));
  await expect(page.locator("#fallback")).toBeVisible();
  const hidden = await page.evaluate(() => window.presenceProbe.state());
  expect(hidden.atCommit.hidden).toBe(0);
  expect(hidden.mode).toBe("gpu");
  await page.evaluate(() => window.presenceProbe.resume());
  await expect(page.locator("#fallback")).toHaveCount(0);
  await page.waitForTimeout(600);
  const replayed = await midExit(page, `suspend-${strict}-replayed`, 390, 180, 0, 20);
  await expect(page.locator("#stage-card")).toHaveCount(0, { timeout: 5000 });
  const after = await stillPresented(page, `suspend-${strict}`, 390, 180);
  expect(after.completions).toEqual([{ status: "completed", reason: "Finished", presence: "stage", mounted: true }]);
  expect(messages).toEqual([]);
  await save(`suspend-${strict}`, { hidden, replayed, after, messages });
});
