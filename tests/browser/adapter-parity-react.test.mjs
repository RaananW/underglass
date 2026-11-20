/**
 * Browser suite for `adapter-parity-react.html` (`window.reactParity`, from
 * `examples/playground/src/demo/adapter-parity-react.tsx`): the React adapter behaves as the Vue one does where the
 * two had drifted apart (issue #282). Each case runs under GPU and proves GPU stays active, the canvas shows fresh
 * pixels and a real pointer click lands on the native control. Tests marked `strict` use the Vite dev server (React
 * StrictMode); the others use the preview build. Frame coordinates are CSS pixels at DPR 1 in the 640x420 `#frame`.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("adapter-parity");
const colours = { red: [240, 30, 60, 255], blue: [20, 120, 220, 255], green: [20, 200, 90, 255], white: [255, 255, 255, 255] };
/**
 * Collects console warnings and errors and uncaught page errors, except Chrome's notice that WebGPU ignores
 * `powerPreference` on Windows (crbug.com/369219127), which every GPU page logs there.
 */
function watch(page) {
  const messages = [];
  page.on("console", message => {
    if ((message.type() === "warning" || message.type() === "error") && !/powerPreference/.test(message.text())) messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", error => messages.push(`pageerror: ${error.message}`));
  return messages;
}
const state = page => page.evaluate(() => window.reactParity.state());
const settle = page => page.evaluate(() => window.reactParity.settle());
/** Screenshots `#frame` (saved under the evidence directory) and returns the RGBA at (x, y). */
async function pixel(page, name, { x, y }) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/react-${name}.png` }));
  const offset = (y * png.width + x) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}
/** Opens the page (dev server with StrictMode when `strict`) and enables GPU presentation. */
async function ready(page, strict) {
  await page.goto(strict ? `${developmentURL}/adapter-parity-react.html?strict` : "/adapter-parity-react.html");
  await page.waitForFunction(() => window.reactParity);
  const admission = await page.evaluate(() => window.reactParity.controller.enable());
  expect(admission.mode, admission.reason).toBe("gpu");
  await settle(page);
}
/** A real pointer click at the centre of `selector`, after checking the browser hits that element there. */
async function click(page, selector) {
  const centre = await page.locator(selector).evaluate(node => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  expect(await page.evaluate(({ x, y }) => `#${document.elementFromPoint(x, y)?.id}`, centre)).toBe(selector);
  await page.mouse.click(centre.x, centre.y);
}

// `decorative` going from `undefined` to `false` names the same enrollment, as Vue's `!!decorative` already treats it:
// no release and re-enrollment, no registry change, no recapture.
for (const strict of [false, true]) test(`React useSurfaceRef keeps its enrollment when decorative goes undefined to false strict=${strict}`, async ({ page }) => {
  const messages = watch(page);
  await ready(page, strict);
  const before = await state(page);
  const point = { x: 200, y: 130 };
  expect(await pixel(page, `decorative-${strict}`, point)).toEqual(colours.red);
  await page.evaluate(() => window.reactParity.setDecorative(false));
  await settle(page);
  const after = await state(page);
  expect(after.mode, after.reason).toBe("gpu");
  expect(after.enrolls).toEqual([]);
  expect(after.registryRevision).toBe(before.registryRevision);
  expect(after.metrics.uploads).toBe(before.metrics.uploads);

  // The layer is still the same live, GPU-presented original: a real click lands and its new colour reaches the canvas.
  await click(page, "#plain-button");
  await expect.poll(async () => (await state(page)).plainColour).toBe("blue");
  await settle(page);
  const clicked = await state(page);
  expect(clicked.mode, clicked.reason).toBe("gpu");
  expect(clicked.metrics.uploads).toBeGreaterThan(after.metrics.uploads);
  expect(await pixel(page, `decorative-${strict}-clicked`, point)).toEqual(colours.blue);
  expect(messages).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/react-decorative-${strict}.json`, JSON.stringify({
    reactVersion: before.reactVersion, before: { revision: before.registryRevision, uploads: before.metrics.uploads },
    after: { revision: after.registryRevision, uploads: after.metrics.uploads, enrolls: after.enrolls }, messages,
  }, null, 2));
});

// `useSurfaceRef` reads the origin of the last commit, never of a render React discarded. A transition that changes
// the origin suspends, so React renders it but does not commit it; a new element then enrolls (in a commit that does
// not render the hook's component) with the committed origin. When the transition commits, the layer takes its origin,
// and an origin changed in the same commit as a new element is the one that element enrolls with.
for (const strict of [false, true]) test(`React useSurfaceRef enrolls with the committed origin, not a discarded render's strict=${strict}`, async ({ page }) => {
  const messages = watch(page);
  await ready(page, strict);
  const pivot = async () => (await state(page)).layers.find(layer => layer.id === "pivot");
  expect((await pivot()).origin).toBe("center");
  await page.evaluate(() => window.reactParity.discardOrigin({ x: 1, y: 1 }));
  await expect.poll(async () => (await state(page)).rendered.origin).toEqual({ x: 1, y: 1 });
  expect((await state(page)).committed.origin).toBe("center");

  await page.evaluate(() => window.reactParity.replacePivot());
  await settle(page);
  const replaced = await state(page);
  expect(replaced.mode, replaced.reason).toBe("gpu");
  // StrictMode (React 19) replays a new element's ref callback, so it may enroll twice; each enrollment carries the same origin.
  expect(replaced.enrolls.length === 1 || strict).toBe(true);
  expect(new Set(replaced.enrolls.map(entry => JSON.stringify(entry)))).toEqual(new Set([JSON.stringify({ id: "pivot", origin: "center" })]));
  expect(replaced.layers.find(layer => layer.id === "pivot").origin).toBe("center");
  // The new element is the live layer: a real click on its button lands, and the canvas shows the change.
  const point = { x: 390, y: 130 };
  expect(await pixel(page, `origin-${strict}-replaced`, point)).toEqual(colours.green);
  await click(page, "#pivot-button");
  await expect.poll(async () => (await state(page)).pivotColour).toBe("blue");
  await settle(page);
  const clicked = await state(page);
  expect(clicked.mode, clicked.reason).toBe("gpu");
  expect(clicked.metrics.uploads).toBeGreaterThan(replaced.metrics.uploads);
  expect(await pixel(page, `origin-${strict}-clicked`, point)).toEqual(colours.blue);

  // The transition commits: its origin now applies, in place.
  await page.evaluate(() => window.reactParity.resume());
  await expect.poll(async () => (await state(page)).committed.origin).toEqual({ x: 1, y: 1 });
  expect((await pivot()).origin).toEqual({ x: 1, y: 1 });
  // One commit with a new origin and a new element: the element enrolls with that origin.
  await page.evaluate(() => window.reactParity.replaceWithOrigin("top-left"));
  await settle(page);
  const together = await state(page);
  expect(together.mode, together.reason).toBe("gpu");
  const added = together.enrolls.slice(replaced.enrolls.length);
  expect(added.length === 1 || strict).toBe(true);
  expect(new Set(added.map(entry => JSON.stringify(entry)))).toEqual(new Set([JSON.stringify({ id: "pivot", origin: "top-left" })]));
  expect(together.layers.find(layer => layer.id === "pivot").origin).toBe("top-left");
  expect(await pixel(page, `origin-${strict}-together`, point)).toEqual(colours.blue);
  await click(page, "#pivot-button");
  await expect.poll(async () => (await state(page)).pivotColour).toBe("green");
  await settle(page);
  expect((await state(page)).mode).toBe("gpu");
  expect(await pixel(page, `origin-${strict}-together-clicked`, point)).toEqual(colours.green);
  expect(messages).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/react-origin-${strict}.json`, JSON.stringify({ reactVersion: together.reactVersion, enrolls: together.enrolls, messages }, null, 2));
});

// `Presence` calls the `onComplete` of the last commit, never of a render React discarded: a transition that changes
// the handler suspends while the exit runs, and the exit's completion goes to the committed handler. A handler changed
// by a commit while a transition runs is the one called when it ends.
for (const strict of [false, true]) test(`React Presence calls the committed onComplete, not a discarded render's strict=${strict}`, async ({ page }) => {
  const messages = watch(page);
  await ready(page, strict);
  const badge = { x: 500, y: 60 };
  expect(await pixel(page, `presence-${strict}`, badge)).toEqual(colours.green);
  await page.evaluate(() => window.reactParity.setPresent(false));
  await page.evaluate(() => window.reactParity.discardLabel("discarded"));
  await expect.poll(async () => (await state(page)).rendered.label).toBe("discarded");
  expect((await state(page)).committed.label).toBe("initial");
  await expect.poll(async () => (await state(page)).completions.length, { timeout: 5000 }).toBe(1);
  const exited = await state(page);
  expect(exited.completions).toEqual([{ label: "initial", status: "completed" }]);
  expect(exited.badge).toBe(false);
  await settle(page);
  expect((await state(page)).mode).toBe("gpu");
  expect(await pixel(page, `presence-${strict}-exited`, badge)).toEqual([250, 200, 20, 255]);

  // The transition commits; then the enter's handler is replaced by a commit while the enter runs.
  await page.evaluate(() => window.reactParity.resume());
  await expect.poll(async () => (await state(page)).committed.label).toBe("discarded");
  await page.evaluate(() => window.reactParity.setPresent(true));
  await page.evaluate(() => window.reactParity.setLabel("latest"));
  await expect.poll(async () => (await state(page)).completions.length, { timeout: 5000 }).toBe(2);
  const entered = await state(page);
  expect(entered.completions[1]).toEqual({ label: "latest", status: "completed" });
  await settle(page);
  expect((await state(page)).mode).toBe("gpu");
  expect(await pixel(page, `presence-${strict}-entered`, badge)).toEqual(colours.green);
  // Native hits still land on the GPU-presented layers.
  await click(page, "#plain-button");
  await expect.poll(async () => (await state(page)).plainColour).toBe("blue");
  await settle(page);
  expect(await pixel(page, `presence-${strict}-clicked`, { x: 200, y: 130 })).toEqual(colours.blue);
  expect((await state(page)).mode).toBe("gpu");
  expect(messages).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/react-presence-${strict}.json`, JSON.stringify({ reactVersion: entered.reactVersion, completions: entered.completions, messages }, null, 2));
});
