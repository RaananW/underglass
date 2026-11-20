/**
 * Browser suite for a first render that throws inside `mountCanvasApp`, on `mount-error.html`
 * (`examples/playground/src/mount-error/page.tsx`, `window.mountErrorProbe`). Every mount goes into the same hosts.
 * It proves that:
 *
 * - a first render that throws makes the mount throw, on React 18 and 19 and under `StrictMode`, and leaves no
 *   React root, no root container, no observer, no listener and no change to the hosts behind it;
 * - a healthy mount into the same hosts afterwards works, and is GPU-presented with fresh pixels and native hits;
 * - an error boundary inside the application that catches the first-render error leaves an ordinary mount;
 * - an error after the mount is reported as React does by default, not thrown by the mount;
 * - a `createRoot` passed in keeps React's own behaviour (React 19 reports the error and the mount returns).
 *
 * Specimen: `primary` rgb(240,30,60) at (40,40) 260x200 holding the Count and Break buttons, on a white 640x420 frame.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("mount-error");
const red = [240, 30, 60];
const firstRender = /The application failed in its first render/;

const probe = (page, method, ...args) => page.evaluate(([name, values]) => window.mountErrorProbe[name](...values), [method, args]);
/** Opens the page (the development server, where `StrictMode` renders twice, when `development`) and collects uncaught errors. */
async function open(page, development = false) {
  const uncaught = [];
  page.on("pageerror", error => uncaught.push(error.message));
  await page.goto(`${development ? developmentURL : ""}/mount-error.html`);
  await page.waitForFunction(() => window.mountErrorProbe);
  return uncaught;
}
/** The colour at a point of the frame (CSS px from its top left); the screenshot is kept as evidence. */
async function framePixel(page, x, y, name) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 640, offset = (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}
const near = (a, b, tolerance = 3) => a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
/** The mount threw, and left no root, container, observer, listener or host change behind. */
function nothingLeft(report) {
  expect(report.mountError).toMatch(firstRender);
  expect(report.mounted).toBe(false);
  expect(report.statuses).toBe(0);
  expect(report.containers).toEqual([{ connected: false, reactRoot: false }]);
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

for (const strict of [false, true]) test(`a first render that throws makes the mount throw and leaves nothing behind, strict=${strict}`, async ({ page }) => {
  const uncaught = await open(page, strict);
  const failed = await probe(page, "attempt", "throws", strict);
  nothingLeft(failed);
  // React 19 does not report the error itself any more; React 18's development build replays the failed render and
  // reports that replay as an uncaught error, before the mount rethrows it.
  if (failed.reactVersion.startsWith("18.") && strict) expect(uncaught.every(message => firstRender.test(message))).toBe(true);
  else expect(uncaught).toEqual([]);
  // The same hosts take a healthy mount, and it reaches the GPU.
  const healthy = await probe(page, "attempt", "healthy", strict);
  expect(healthy.mountError).toBe(null);
  expect(healthy.layers).toEqual(["primary"]);
  expect(healthy.containers).toEqual([{ connected: true, reactRoot: true }]);
  await reachesGPU(page, `after-throw-strict-${strict}`, failed.before);
  expect(uncaught.filter(message => !firstRender.test(message))).toEqual([]);
});

for (const strict of [false, true]) test(`an error boundary that catches the first-render error leaves an ordinary mount, strict=${strict}`, async ({ page }) => {
  const uncaught = await open(page, strict);
  const caught = await probe(page, "attempt", "caught", strict);
  expect(caught.mountError).toBe(null);
  expect(caught.mounted).toBe(true);
  expect(caught.fallback).toBe("The boundary caught it");
  expect(caught.layers).toEqual(["primary"]);
  expect(caught.containers).toEqual([{ connected: true, reactRoot: true }]);
  if (!(caught.reactVersion.startsWith("18.") && strict)) expect(uncaught).toEqual([]);
  await reachesGPU(page, `caught-strict-${strict}`, caught.before);
});

test("an error after the mount is reported as React does, and the mount stays", async ({ page }) => {
  const uncaught = await open(page);
  const healthy = await probe(page, "attempt", "healthy");
  expect(healthy.mountError).toBe(null);
  await click(page, "break");
  await expect.poll(() => uncaught.some(message => /The application failed after its mount/.test(message))).toBe(true);
  // React unmounted the tree that threw; the controller is still there and can be disposed.
  await expect(page.locator("#count")).toHaveCount(0);
  expect((await probe(page, "state")).mode).toBe("dom");
  await probe(page, "dispose");
});

test("a createRoot passed in keeps React's own behaviour", async ({ page }) => {
  const uncaught = await open(page);
  const injected = await probe(page, "attempt", "injected");
  if (injected.reactVersion.startsWith("18.")) {
    // React 18 throws from flushSync, and the adapter unmounts the root and rethrows that.
    nothingLeft(injected);
  } else {
    // React 19 reports the error (by default with reportError) and leaves an empty mounted root.
    expect(injected.mountError).toBe(null);
    expect(injected.mounted).toBe(true);
    await expect.poll(() => uncaught.some(message => firstRender.test(message))).toBe(true);
    await probe(page, "dispose");
  }
});
