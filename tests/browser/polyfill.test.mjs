/**
 * `state().htmlInCanvas` names the HTML-in-Canvas implementation admission tested: `native` in Canary with the
 * flags, and `polyfill` when `@underglass/html-in-canvas-polyfill` stands in for the API in Canary with
 * HTML-in-Canvas switched off. On the polyfill, GPU mode must still be admitted with fresh pixels and real hits
 * on the original controls (docs/guide/polyfill.md).
 */
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { PNG } from "pngjs";
import { test, expect } from "../helpers/current-browser.mjs";
import { previewURL } from "../helpers/urls.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";

const polyfill = createRequire(import.meta.url).resolve("@underglass/html-in-canvas-polyfill/iife");
const state = page => page.evaluate(() => window.integrationProbe.state());

test("native admission reports the browser's own HTML-in-Canvas", async ({ page }) => {
  await page.goto(`${previewURL}/integration.html?dom`); await page.waitForFunction(() => window.integrationProbe);
  expect((await state(page)).htmlInCanvas).toBeNull();
  const admitted = await page.evaluate(() => window.integrationProbe.enable());
  expect(admitted.mode, admitted.reason).toBe("gpu");
  expect(admitted.htmlInCanvas).toBe("native");
});

test("admission on the polyfill reports it and keeps fresh pixels and real hits", async () => {
  const browser = await chromium.launch(browserLaunchOptions({ native: false }));
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 1 });
    const errors = []; page.on("pageerror", error => errors.push(String(error)));
    await page.goto(`${previewURL}/integration.html?dom`); await page.waitForFunction(() => window.integrationProbe);
    expect(await page.evaluate(() => typeof HTMLCanvasElement.prototype.requestPaint)).toBe("undefined");
    await page.addScriptTag({ path: polyfill });
    expect(await page.evaluate(() => window.HTMLInCanvasPolyfill.getStatus().polyfilled)).toBe(true);
    const admitted = await page.evaluate(() => window.integrationProbe.enable());
    expect(admitted.mode, admitted.reason).toBe("gpu");
    expect(admitted.htmlInCanvas).toBe("polyfill");
    // A real click at Save's centre lands on the original button, and the presented pixels follow the saved value.
    // The polyfill paints a few frames late, so each capture waits for the value, a settle and 600 ms.
    const output = page.locator("canvas#output");
    const save = async value => {
      await page.locator("#name").fill(value);
      const box = await page.locator("#save").boundingBox();
      const centre = [box.x + box.width / 2, box.y + box.height / 2];
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, centre)).toBe("save");
      await page.mouse.click(...centre);
      await expect(page.locator("#saved")).toHaveText(value);
      await page.evaluate(() => window.integrationProbe.settle()); await page.waitForTimeout(600);
      return PNG.sync.read(await output.screenshot());
    };
    // Short values: the saved text must stay inside the library layer, or GPU mode rightly ends on overflow.
    const first = await save("WWWWWW"), second = await save("iiiiii");
    let changed = 0;
    for (let offset = 0; offset < first.data.length; offset += 4) {
      if (first.data.subarray(offset, offset + 4).some((value, index) => value !== second.data[offset + index])) changed++;
    }
    expect(changed).toBeGreaterThan(100);
    expect((await state(page)).mode).toBe("gpu");
    // The implementation is read at each admission: after a DOM round trip it is still the polyfill.
    await page.evaluate(() => window.integrationProbe.disable());
    const again = await page.evaluate(() => window.integrationProbe.enable());
    expect(again.mode, again.reason).toBe("gpu");
    expect(again.htmlInCanvas).toBe("polyfill");
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
