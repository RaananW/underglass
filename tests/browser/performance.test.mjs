/**
 * Browser suite for the wall-clock performance fixture `performance.html`
 * (`examples/playground/src/demo/performance-demo.tsx`, driven through `window.measurement`). For each
 * variant (DOM or GPU, static, affine or ripple) it checks that the frame renders the expected pixel, that a
 * native input still accepts typing, that the sampling interval is internally consistent (one sample per
 * counted capture, upload or readback), and that disposal returns every resource counter to zero. It does not
 * assert timing thresholds; the interval is written to the `performance/fixtures` evidence directory.
 */
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "../helpers/evidence.mjs";

// Each variant writes its measured interval and retirement report here.
const evidence = evidenceDirectory("performance/fixtures");

for (const variant of ["dom-static", "gpu-static", "dom-affine", "gpu-affine", "gpu-ripple"]) {
  test(`wall-clock fixture validates rendering, sampling and cleanup: ${variant}`, async ({ page }) => {
    await page.goto(`/performance.html?layers=8&variant=${variant}`);
    await page.waitForFunction(() => window.measurement);
    const png = PNG.sync.read(await page.locator("#frame").screenshot());
    // Sample one pixel at (80, 110) in the `#frame` screenshot; the fixture paints a solid colour there.
    const offset = (110 * png.width + 80) * 4;
    const pixel = [...png.data.slice(offset, offset + 3)];
    // Affine variants are checked approximately (red and green channels at least 245 and 196, blue below 80);
    // the other variants must match exactly.
    if (variant.endsWith("affine")) {
      expect(pixel[0]).toBeGreaterThanOrEqual(245);
      expect(pixel[1]).toBeGreaterThanOrEqual(196);
      expect(pixel[2]).toBeLessThan(80);
    } else expect(pixel).toEqual([245, 196, 41]);
    await page.getByLabel("Native input", { exact: true }).fill("real");
    await expect(page.getByLabel("Native input", { exact: true })).toHaveValue("real");
    // Collect samples for at least 500 ms of wall-clock time.
    const interval = await page.evaluate(() => window.measurement.collect(500));
    expect(interval.durationMs).toBeGreaterThanOrEqual(500);
    expect(interval.intervals.length).toBeGreaterThan(5);
    expect(interval.samples.every(sample => Number.isFinite(sample.durationMs) && sample.durationMs >= 0)).toBe(true);
    // Every captured, uploaded or read-back frame must have produced exactly one timing sample.
    for (const [kind, counter] of [["captureMs", "captures"], ["uploadMs", "uploads"], ["readbackCompareMs", "pixelReadbacks"]]) {
      expect(interval.samples.filter(sample => sample.kind === kind).length).toBe(
        interval.after.metrics[counter] - interval.before.metrics[counter]);
    }
    expect(interval.after.mode).toBe(variant.startsWith("gpu") ? "gpu" : "dom");
    if (variant === "gpu-affine" || variant === "gpu-ripple") {
      // Animated GPU variants must keep presenting frames during the interval, one `frameWorkMs` sample per frame.
      expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBeGreaterThan(5);
      expect(interval.samples.filter(s => s.kind === "frameWorkMs").length).toBe(
        interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames);
      // The shared clock (owned animations, or the playing ripples) reports its own work as `frameTickMs`, one sample
      // per tick, apart from the frame it draws.
      const ticks = interval.samples.filter(s => s.kind === "frameTickMs").length;
      expect(ticks).toBeGreaterThan(5);
      expect(ticks).toBe(interval.after.metrics.timings.frameTickMs.count - interval.before.metrics.timings.frameTickMs.count);
    }
    // Disposal must release every GPU and runtime resource.
    const retired = await page.evaluate(() => window.measurement.dispose());
    expect(Object.values(retired.resources).every(value => value === 0)).toBe(true);
    expect(Object.values(retired.runtimeResources).every(value => value === 0)).toBe(true);
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/${variant}.json`, JSON.stringify({ interval, retired }, null, 2));
  });
}
