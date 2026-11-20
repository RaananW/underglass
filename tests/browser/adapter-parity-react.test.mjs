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
