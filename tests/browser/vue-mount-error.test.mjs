/**
 * Browser suite for a first render that fails inside the Vue adapter's `mountCanvasApp`, on `vue-mount-error.html`
 * (`examples/playground/src/mount-error/vue-page.ts`, `window.mountErrorProbe`). Every mount goes into the same
 * hosts, and every test runs on Vue's production build and on its development build, which treat an unhandled
 * error differently (the first only logs it, the second throws in the middle of the patch). It proves that:
 *
 * - a render function, a `setup` or a mounted hook that throws makes the mount throw that error, and leaves no Vue
 *   app, no root container, no observer, no listener and no change to the hosts behind it, and no uncaught error
 *   or logged error later;
 * - the same holds when Vue's mount itself throws (an element name the DOM refuses), where the components already
 *   rendered still have hooks in Vue's queue;
 * - a healthy mount into the same hosts afterwards works, and is GPU-presented with fresh pixels and native hits;
 * - an `onErrorCaptured` hook inside the application that stops the error leaves an ordinary mount;
 * - the application's own `errorHandler` does not get the first-render error, and gets a later one;
 * - without such a handler, an error after the mount is reported as Vue does by default.
 *
 * Specimen: `primary` rgb(240,30,60) at (40,40) 260x200 holding the Count and Break buttons, on a white 640x420 frame.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("vue-mount-error");
const red = [240, 30, 60];
const firstRender = /The application failed in its first render/;
const afterMount = /The application failed after its mount/;

const probe = (page, method, ...args) => page.evaluate(([name, values]) => window.mountErrorProbe[name](...values), [method, args]);
/** Opens the page on the production build, or on the development server, and collects uncaught and logged errors. */
async function open(page, development) {
  const reported = [];
  page.on("pageerror", error => reported.push(error.message));
  page.on("console", message => { if (message.type() === "error") reported.push(message.text()); });
  await page.goto(`${development ? developmentURL : ""}/vue-mount-error.html`);
  await page.waitForFunction(() => window.mountErrorProbe);
  return reported;
}
/** The colour at a point of the frame (CSS px from its top left); the screenshot is kept as evidence. */
async function framePixel(page, x, y, name) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 640, offset = (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}
const near = (a, b, tolerance = 3) => a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
/** The mount threw `error`, and left no app, container, observer, listener or host change behind. */
function nothingLeft(report, error = firstRender) {
  expect(report.mountError).toMatch(error);
  expect(report.mounted).toBe(false);
  expect(report.statuses).toBe(0);
  expect(report.containers).toEqual([{ connected: false, vueApp: false }]);
  expect(report.after).toEqual(report.before);
}
/** Clicks an element of the application with the mouse, wherever it is presented. */
async function click(page, id) {
  const box = await probe(page, "box", id);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
/** A mounted application reaches the GPU: fresh pixels from the canvas, and a native click that counts. Then it is disposed. */
async function reachesGPU(page, name, before) {
  const gpu = await probe(page, "enable");
  expect(gpu.mode, gpu.reason).toBe("gpu");
  expect(gpu.canvas).toBe(true);
  expect(near(await framePixel(page, 280, 220, name), red)).toBe(true);
  await click(page, "count");
  await expect(page.locator("#count")).toHaveText("Count 1");
  const disposed = await probe(page, "dispose");
  expect(disposed.observers).toBe(before.observers);
  expect(disposed.listeners).toEqual(before.listeners);
}
/** The same hosts take a healthy mount after a failed one, and it reaches the GPU. */
async function healthyAfter(page, name, failed) {
  const healthy = await probe(page, "attempt", "healthy");
  expect(healthy.mountError).toBe(null);
  expect(healthy.layers).toEqual(["primary"]);
  expect(healthy.containers).toEqual([{ connected: true, vueApp: true }]);
  await reachesGPU(page, name, failed.before);
}

for (const development of [false, true]) {
  const build = development ? "development" : "production";

  for (const kind of ["throws", "setup", "mounted"]) test(`a first render that fails (${kind}) makes the mount throw and leaves nothing behind, ${build}`, async ({ page }) => {
    const reported = await open(page, development);
    const failed = await probe(page, "attempt", kind);
    nothingLeft(failed);
    await healthyAfter(page, `after-${kind}-${build}`, failed);
    // Vue neither logged the error nor threw it later from its queue: the caller of the mount got it, once.
    expect(reported).toEqual([]);
  });

  test(`a mount that Vue itself throws from leaves nothing behind, and nothing of it runs into the next mount, ${build}`, async ({ page }) => {
    const reported = await open(page, development);
    const failed = await probe(page, "attempt", "element");
    nothingLeft(failed, /1refused/);
    // The failed application's `Surface` had rendered, so its registration is still in Vue's queue. The next
    // mount flushes that queue: the registration must not throw into it, and the new layer must register.
    await healthyAfter(page, `after-element-${build}`, failed);
    expect(reported).toEqual([]);
  });

  test(`an onErrorCaptured hook that stops the first-render error leaves an ordinary mount, ${build}`, async ({ page }) => {
    const reported = await open(page, development);
    const caught = await probe(page, "attempt", "caught");
    expect(caught.mountError).toBe(null);
    expect(caught.mounted).toBe(true);
    // The hook sets reactive state, so Vue renders the fallback in its next update.
    await expect(page.locator("#fallback")).toHaveText("The boundary caught it");
    expect(caught.layers).toEqual(["primary"]);
    expect(caught.containers).toEqual([{ connected: true, vueApp: true }]);
    await reachesGPU(page, `caught-${build}`, caught.before);
    expect(reported).toEqual([]);
  });

  test(`the application's own errorHandler does not get the first-render error and gets a later one, ${build}`, async ({ page }) => {
    const reported = await open(page, development);
    const failed = await probe(page, "attempt", "throws", true);
    nothingLeft(failed);
    expect(failed.handled).toEqual([]);
    const healthy = await probe(page, "attempt", "healthy", true);
    expect(healthy.mountError).toBe(null);
    await click(page, "break");
    await expect.poll(() => probe(page, "handled")).toEqual([expect.stringMatching(afterMount)]);
    // The mount stays, and its controller can be disposed.
    expect((await probe(page, "state")).mode).toBe("dom");
    await probe(page, "dispose");
    expect(reported).toEqual([]);
  });

  test(`without an errorHandler, an error after the mount is reported as Vue does, ${build}`, async ({ page }) => {
    const reported = await open(page, development);
    const healthy = await probe(page, "attempt", "healthy");
    expect(healthy.mountError).toBe(null);
    await click(page, "break");
    // Vue's production build logs it; its development build throws it from the update.
    await expect.poll(() => reported.some(message => afterMount.test(message))).toBe(true);
    expect((await probe(page, "state")).mode).toBe("dom");
    await probe(page, "dispose");
  });
}
