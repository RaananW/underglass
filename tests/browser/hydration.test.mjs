/**
 * Browser suite for prerendering and hydration through the React adapter, on `core-hydration.html`
 * (`window.hydrationProbe`). The page's frame holds markup that Node rendered when the playground was built
 * (`prerenderCanvasApp` with `renderToString`, no DOM), so this is a real server render reconciled by a real client. It
 * proves that:
 *
 * - the served HTML holds the application, and shows it laid out without JavaScript;
 * - `mountCanvasApp` with `hydrate` attaches to the served elements instead of replacing them, synchronously, with
 *   nothing for React to recover from, and the application then works;
 * - those same elements are GPU-presented with fresh pixels and native hits, and come back to ordinary DOM;
 * - a server/client mismatch falls back to a client render that still works and still reaches the GPU;
 * - hydration is refused without the prerendered hosts, and a client render is refused into them.
 *
 * Specimen: `primary` rgb(240,30,60) at (40,40) 260x200 holding the Count button and an input, `enrolled`
 * rgb(30,110,230) at (340,40) enrolled by ref, and the decorative `art` rgb(20,150,90), on a white 640x420 frame.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("hydration");
const red = [240, 30, 60], blue = [30, 110, 230], green = [20, 150, 90];
const layers = ["primary", "enrolled", "art"];
const kept = { count: true, primary: true, enrolled: true, art: true };

const probe = (page, method, ...args) => page.evaluate(([name, values]) => window.hydrationProbe[name](...values), [method, args]);
/** The colour at a point of the frame (CSS px from its top left); the screenshot is kept as evidence. */
async function framePixel(page, x, y, name) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 640, offset = (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}
const near = (a, b, tolerance = 3) => a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
/** Collects what must stay empty: uncaught errors and console errors (React reports hydration problems there). */
function watch(page) {
  const problems = [];
  page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
  page.on("console", message => { if (message.type() === "error") problems.push(`console: ${message.text()}`); });
  return problems;
}

test("the served page holds the application and shows it without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  try {
    const response = await page.goto("/core-hydration.html");
    const html = await response.text();
    expect(html).toContain('<div data-underglass-host="ordinary"');
    expect(html).toMatch(/<div class="app-container"[^>]*><section id="primary" drawable=""/);
    expect(html).toContain("Enrolled by ref");
    // The overlay has no prerendered markup, and its host is empty.
    expect(html).not.toContain("In the overlay host");
    expect(html).toContain('<div data-underglass-host="overlay"></div>');
    await expect(page.locator("#count")).toHaveText("Count 0");
    await expect(page.getByLabel("Name")).toBeVisible();
    // Laid out by the prerendered styles alone.
    expect(near(await framePixel(page, 280, 220, "no-javascript"), red)).toBe(true);
    expect(near(await framePixel(page, 560, 140, "no-javascript"), blue)).toBe(true);
    expect(near(await framePixel(page, 560, 360, "no-javascript"), green)).toBe(true);
    expect(near(await framePixel(page, 620, 20, "no-javascript"), [255, 255, 255])).toBe(true);
  } finally { await context.close(); }
});

for (const dpr of [1, 2]) test(`hydration keeps the served elements, and they are GPU-presented, DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const problems = watch(page);
  try {
    await page.goto("/core-hydration.html?manual");
    await page.waitForFunction(() => window.hydrationProbe);
    // As served: the markup is there, and no application is attached to it yet.
    await expect(page.locator("#count")).toHaveText("Count 0");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 0");
    await page.getByLabel("Name").fill("typed before hydration");

    // Hydration attaches to the served elements, in the same task as the mount.
    const mounted = await probe(page, "mount");
    expect(mounted.same).toEqual(kept);
    expect(mounted.container).toBe(true);
    expect(mounted.layersAtMount).toEqual(layers);
    expect(mounted.recoverable).toEqual([]);
    expect(mounted.overlay).toBe("overlay");
    await expect(page.getByLabel("Name")).toHaveValue("typed before hydration");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");

    // GPU presentation draws those elements: fresh pixels, native hits, and the same nodes inside the canvas.
    const gpu = await probe(page, "enable");
    expect(gpu.mode, gpu.reason).toBe("gpu");
    expect(gpu.same).toEqual(kept);
    expect(near(await framePixel(page, 280, 220, `gpu-dpr${dpr}`), red)).toBe(true);
    expect(near(await framePixel(page, 560, 140, `gpu-dpr${dpr}`), blue)).toBe(true);
    expect(near(await framePixel(page, 560, 360, `gpu-dpr${dpr}`), green)).toBe(true);
    const box = await probe(page, "box", "count");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("#count")).toHaveText("Count 2");
    await expect(page.getByLabel("Name")).toHaveValue("typed before hydration");
    expect(await page.evaluate(() => document.querySelector("#count").closest("canvas") !== null)).toBe(true);

    const dom = await probe(page, "disable");
    expect(dom.mode).toBe("dom");
    expect(dom.same).toEqual(kept);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 3");
    expect(problems).toEqual([]);
  } finally { await page.close(); }
});

test("a mismatch with the served markup falls back to a client render that still reaches the GPU", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/core-hydration.html?label=Clicks");
  await page.waitForFunction(() => window.hydrationProbe);
  await expect(page.locator("#count")).toHaveText("Clicks 0");
  const report = await probe(page, "report");
  // React reports the mismatch as recoverable and renders on the client; the adapter-owned container is kept.
  expect(report.recoverable.length).toBeGreaterThan(0);
  expect(report.container).toBe(true);
  expect(report.layersAtMount).toEqual(layers);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Clicks 1");
  const gpu = await probe(page, "enable");
  expect(gpu.mode, gpu.reason).toBe("gpu");
  expect(near(await framePixel(page, 280, 220, "mismatch-gpu"), red)).toBe(true);
  const box = await probe(page, "box", "count");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#count")).toHaveText("Clicks 2");
  expect(errors).toEqual([]);
});

test("hydration needs the prerendered hosts, and a client render refuses them", async ({ page }) => {
  await page.goto("/core-hydration.html");
  await page.waitForFunction(() => window.hydrationProbe);
  const faults = await probe(page, "faults");
  expect(faults.hydrateEmpty).toMatch(/Hydration requires the ordinary host to hold exactly the prerendered root container/);
  expect(faults.renderPrerendered).toMatch(/Mount boundary requires empty adapter-owned hosts/);
  expect(faults.missingHost).toMatch(/Prerendered canvas hosts must be exactly/);
  expect(faults.strayElement).toMatch(/Prerendered canvas hosts must be exactly/);
  expect(faults.valid).toBe("accepted");
  expect(faults.module).toBe(true);
  // The page's own application is untouched by the refused mounts.
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
});
