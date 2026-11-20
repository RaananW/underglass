/**
 * Browser suite for `adapter-parity-vue.html` (`window.adapterParity`, from
 * `examples/playground/src/demo/adapter-parity-vue.ts`): the Vue adapter behaves as the React one does where the two
 * had drifted apart (issue #282). Each case runs under GPU and proves GPU stays active, the canvas shows fresh pixels
 * and a real pointer click lands on the native control. The page runs on the Vite dev server, where Vue's development
 * warnings are on. Frame coordinates are CSS pixels at DPR 1 in the 640x420 `#frame`.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("adapter-parity");
const colours = { red: [240, 30, 60, 255], blue: [20, 120, 220, 255], green: [20, 200, 90, 255] };
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
const state = page => page.evaluate(() => window.adapterParity.state());
/** Screenshots `#frame` (saved under the evidence directory) and returns the RGBA at each named point. */
async function pixels(page, name, points) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/vue-${name}.png` }));
  return Object.fromEntries(Object.entries(points).map(([key, { x, y }]) => {
    const offset = (y * png.width + x) * 4;
    return [key, [...png.data.subarray(offset, offset + 4)]];
  }));
}
/** Opens the page on the dev server and enables GPU presentation. */
async function ready(page) {
  await page.goto(`${developmentURL}/adapter-parity-vue.html`);
  await page.waitForFunction(() => window.adapterParity);
  const admission = await page.evaluate(() => window.adapterParity.controller.enable());
  expect(admission.mode, admission.reason).toBe("gpu");
  await page.evaluate(() => window.adapterParity.settle());
}

// `style` on `Surface`, `Box` and `NativeScroll` is rejected as React's prop types reject it: it is never applied, and
// Vue warns once for each component in development. Before, `Surface` dropped it silently while `Box` applied it.
test("Vue Surface, Box and NativeScroll reject style alike and warn, under GPU", async ({ page }) => {
  const messages = watch(page);
  await ready(page);
  const points = { surface: { x: 200, y: 130 }, box: { x: 70, y: 50 }, scroll: { x: 100, y: 85 } };
  const before = await pixels(page, "style-gpu", points);
  expect(before).toEqual({ surface: colours.red, box: colours.blue, scroll: colours.red });
  const section = await page.locator("#styled").evaluate(node => ({ className: node.className, background: node.style.backgroundColor }));
  expect(section).toEqual({ className: "styled-layer", background: "rgb(240, 30, 60)" });
  const warnings = messages.filter(message => /does not apply `style`/.test(message));
  expect(warnings.map(message => /(\w+) does not apply `style`/.exec(message)?.[1]).sort()).toEqual(["Box", "NativeScroll", "Surface"]);

  // A real click on the GPU-presented layer reaches the native button, and the update is presented with fresh pixels.
  const uploads = (await state(page)).metrics.uploads;
  await page.locator("#styled-button").click();
  await expect.poll(async () => (await state(page)).boxColour).toBe("green");
  await page.evaluate(() => window.adapterParity.settle());
  const after = await state(page);
  expect(after.mode, after.reason).toBe("gpu");
  expect(after.metrics.uploads).toBeGreaterThan(uploads);
  expect((await pixels(page, "style-gpu-swapped", points)).box).toEqual(colours.green);
  // Re-rendering does not warn again.
  expect(messages.filter(message => /does not apply `style`/.test(message))).toHaveLength(3);
  expect(messages.filter(message => !/does not apply `style`/.test(message))).toEqual([]);
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/vue-style.json`, JSON.stringify({ before, section, messages, after: { mode: after.mode, uploads: after.metrics.uploads } }, null, 2));
});
