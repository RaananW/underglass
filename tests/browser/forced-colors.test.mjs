/**
 * Browser suite for GPU presentation under `forced-colors: active` on `integration.html`
 * (`window.integrationProbe`; issue #133). Core's functional admission probe reads two marker colours back from
 * the GPU output; forced colours recolour every element that does not opt out, so the probe must opt out
 * (`forced-color-adjust: none`) or admission fails and the page never leaves native DOM. User content must not
 * opt out: it is captured as the browser paints it, so under GPU it must still appear in the forced system
 * colours. The context starts with forced colours already active (the admission-time case, which the
 * `forced-colors` media changes after admission in `dynamic.test.mjs` and others do not cover).
 *
 * Proves: admission succeeds, the mode stays `gpu` with no fallback reason, the output shows the forced system
 * colours (not the authored red, green or blue), a content update is fresh GPU pixels, and native hits reach the
 * original controls, including after a layout move. The forced-colours emulation is Playwright's
 * `forcedColors: "active"`; Chromium's palette there is Canvas white, CanvasText black.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const directory = evidenceDirectory("forced-colors");
const save = async (name, data) => { await mkdir(directory, { recursive: true }); await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2)); };
const state = page => page.evaluate(() => window.integrationProbe.state());

/** Decoded `#frame` screenshot (DPR 1) and a reader for frame-local CSS pixels. */
async function frame(page) {
  const png = PNG.sync.read(await page.locator("#frame").screenshot());
  return { png, at: (x, y) => [...png.data.subarray((Math.floor(y) * png.width + Math.floor(x)) * 4, (Math.floor(y) * png.width + Math.floor(x)) * 4 + 4)] };
}
/** Frame-local box of `selector`. */
const box = (page, selector) => page.evaluate(selector => {
  const rect = document.querySelector(selector).getBoundingClientRect(), origin = document.querySelector("#frame").getBoundingClientRect();
  return { x: rect.x - origin.x, y: rect.y - origin.y, width: rect.width, height: rect.height };
}, selector);
/** Counts pixels in a frame-local rectangle that satisfy `test`, and returns a checksum of the rectangle. */
function scan(png, rect, test) {
  let matches = 0, sum = 0;
  for (let y = Math.floor(rect.y); y < Math.ceil(rect.y + rect.height); y++) for (let x = Math.floor(rect.x); x < Math.ceil(rect.x + rect.width); x++) {
    const i = (y * png.width + x) * 4, [r, g, b] = [png.data[i], png.data[i + 1], png.data[i + 2]];
    if (test(r, g, b)) matches++;
    sum = (sum * 31 + r * 7 + g * 3 + b) >>> 0;
  }
  return { matches, sum };
}

test("GPU admits and presents under forced colours: forced system colours, fresh pixels, native hits", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, forcedColors: "active" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  const report = { browser: browser.version() };
  try {
    await page.goto("/integration.html");
    await page.waitForFunction(() => window.integrationProbe);
    expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    // Admission happened with forced colours already active.
    await page.waitForFunction(() => { const s = window.integrationProbe.state(); return s.mode === "gpu" && !s.initializing && !s.transitioning; }, undefined, { timeout: 15000 });
    await page.evaluate(() => window.integrationProbe.settle());
    const admitted = await state(page);
    expect(admitted.mode).toBe("gpu");
    expect(admitted.reason).toMatch(/^Current content=drawable owning WebGPU canvas/);
    expect(admitted.admission.intent).toBe("enabled");
    expect(admitted.metrics.admission.attempts).toBe(1);
    expect(admitted.metrics.admission.last.gpuPixels, "marker pixels read back unrecoloured").toEqual([[207, 37, 83, 255], [31, 179, 113, 255]]);
    expect(await page.locator("#status").textContent()).not.toMatch(/unavailable|incorrect marker/i);

    // The system colours of this emulation, resolved by the page itself.
    const system = await page.evaluate(() => {
      const resolve = (value, property) => { const node = document.createElement("div"); node.style[property] = value; document.body.append(node); const out = getComputedStyle(node)[property]; node.remove(); return out; };
      return { canvas: resolve("Canvas", "backgroundColor"), text: resolve("CanvasText", "color") };
    });
    expect(system).toEqual({ canvas: "rgb(255, 255, 255)", text: "rgb(0, 0, 0)" });
    report.system = system;

    // The output shows forced colours: the authored red panel (rgb(240,30,60)) is Canvas, its text and borders
    // are CanvasText, and no authored saturated colour survives anywhere in the layers.
    const before = await frame(page);
    expect(before.at(55, 345), "inside the authored red panel: forced Canvas, not red").toEqual([255, 255, 255, 255]);
    expect(before.at(400, 330), "inside the authored blue replacement: forced Canvas, not blue").toEqual([255, 255, 255, 255]);
    const everything = { x: 0, y: 0, width: before.png.width, height: before.png.height };
    const authored = (r, g, b) => (r > 200 && g < 80 && b < 120) || (g > 150 && r < 60 && b < 140) || (b > 180 && r < 80 && g < 140);
    expect(scan(before.png, everything, authored).matches, "no authored red, green or blue pixels").toBe(0);
    const counter = await box(page, "#count");
    const dark = (r, g, b) => r < 40 && g < 40 && b < 40;
    const painted = scan(before.png, counter, dark);
    expect(painted.matches, "button text and border are CanvasText black").toBeGreaterThan(40);
    report.before = { panel: before.at(55, 345), darkInButton: painted.matches };

    // Native hits are correct: the original controls are hit, and a real click reaches the React handler.
    const hit = selector => page.evaluate(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest(selector) === document.querySelector(selector);
    }, selector);
    expect(await hit("#count")).toBe(true);
    expect(await hit("#save")).toBe(true);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await page.evaluate(() => window.integrationProbe.settle());

    // Pixels are fresh: the updated label is in the GPU output, still forced colours, still GPU.
    const after = await frame(page);
    const updated = scan(after.png, counter, dark);
    expect(updated.sum, "button pixels changed with the content").not.toBe(painted.sum);
    expect(updated.matches).toBeGreaterThan(40);
    expect(scan(after.png, everything, authored).matches).toBe(0);
    const clicked = await state(page);
    expect(clicked.mode).toBe("gpu");
    expect(clicked.metrics.admission.attempts, "no re-admission").toBe(1);
    expect(clicked.metrics.captures, "the update was captured").toBeGreaterThan(admitted.metrics.captures);

    // A layout move keeps GPU, repaints, and moves the native hit geometry with the pixels.
    await page.evaluate(() => window.integrationProbe.layout({ left: 50 }));
    await page.evaluate(() => window.integrationProbe.settle());
    const moved = await box(page, "#count");
    expect(moved.x).toBeGreaterThan(counter.x + 10);
    expect(await hit("#count")).toBe(true);
    const shifted = await frame(page);
    expect(scan(shifted.png, moved, dark).matches, "label painted at the new position").toBeGreaterThan(40);
    expect(scan(shifted.png, { ...counter, width: 20 }, dark).matches, "nothing left at the old position").toBe(0);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 2");
    const final = await state(page);
    expect(final.mode).toBe("gpu");
    expect(final.metrics.admission.attempts).toBe(1);
    await page.locator("#frame").screenshot({ path: `${directory}/forced-colors-gpu.png` });
    report.final = { mode: final.mode, attempts: final.metrics.admission.attempts, captures: final.metrics.captures };
    expect(errors).toEqual([]);
  } finally {
    await save("forced-colors-gpu", report);
    await context.close();
  }
});
