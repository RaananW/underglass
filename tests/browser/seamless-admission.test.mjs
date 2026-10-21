/**
 * First GPU admission is seamless (issue #202): from `enable()` to `gpu`, every frame the compositor presents shows the
 * content, either the ordinary DOM or a complete GPU frame of it, never black, white or empty. Every frame is recorded
 * with a CDP screencast (`tests/helpers/frame-recorder.mjs`) and scored against reference pixels taken from one DOM and
 * one GPU baseline screenshot of the same page.
 *
 * - The surface page (`surface.html`) and a heavy Instrument page (`instrument-post-core.html`, 250 native controls, a
 *   post chain), at DPR 1 and 2, headless and headed (`--headed`): no blank frame, GPU active afterwards, fresh pixels after
 *   an update, native hits unchanged from the DOM's.
 * - Failures leave the DOM visible with no blank frame: a functional readback failure before the swap, and an upload
 *   failure after the swap (a GPU error, so a diagnosed fallback).
 * - The mechanics: the probe runs with the ordinary DOM presented and the canvas invisible but displayed (`opacity: 0`), the
 *   swap is one task, and the caller's inline `opacity`/`pointer-events` on the canvas are restored.
 * Reports go to the `seamless-admission` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { baselines, blank, describe, hash, healthy, heavy, open, recordEnable, surface } from "../helpers/seamless-admission.mjs";

const directory = evidenceDirectory("seamless-admission");

for (const dpr of [1, 2]) {
  for (const spec of [surface, heavy]) {
    test(`no blank frame from enable() to gpu: ${spec.name} DPR${dpr}`, async ({ browser }) => {
      test.setTimeout(240000);
      await mkdir(directory, { recursive: true });
      const { points } = await baselines(browser, spec, dpr);
      expect(points.length, "reference pixels found in the baselines").toBeGreaterThan(40);
      const report = { spec: spec.name, dpr, referencePoints: points.length, runs: [] };
      for (let run = 0; run < (spec === heavy ? 2 : 3); run++) {
        const { page, errors, context } = await open(browser, spec, dpr);
        try {
          const { scored, state } = await recordEnable(page, spec, dpr, points);
          report.runs.push({ frames: describe(scored, spec), mode: state.mode, reason: state.reason, cover: state.metrics?.admission?.cover, swapMs: state.metrics?.admission?.swapMs, admittingMs: state.metrics?.admission?.admittingMs, errors });
          expect(scored.length, "the screencast delivered frames").toBeGreaterThanOrEqual(5);
          expect(blank(scored, spec), `frames lacking the content: ${describe(scored, spec)}`).toEqual([]);
          // GPU is on afterwards, healthy, covered by the view transition.
          expect(state.mode, state.reason).toBe("gpu");
          expect(state.reason).toMatch(healthy);
          if (spec === surface) {
            expect(state.metrics.admission.cover).toBe("view-transition");
            expect(state.metrics.admission.swapMs).toBeGreaterThan(0);
            expect(state.metrics.admission.admittingMs).toBeGreaterThan(state.metrics.admission.swapMs);
          }
          expect(errors).toEqual([]);
        } finally { await context.close(); }
      }
      await writeFile(`${directory}/frames-${spec.name}-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    });
  }
}

test("surface: GPU stays active, pixels are fresh after an update and native hits are correct", async ({ browser }) => {
  const { page, errors, context } = await open(browser, surface, 1);
  try {
    const { scored, state } = await recordEnable(page, surface, 1, (await baselines(browser, surface, 1)).points);
    expect(blank(scored), describe(scored)).toEqual([]);
    expect(state.mode, state.reason).toBe("gpu");
    const before = hash(await page.screenshot());
    // A real mouse click lands on the control only if native hit geometry is right; the update must reach the pixels.
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await page.waitForTimeout(300);
    await page.evaluate(() => window.surfaceProbe.settle());
    const after = await page.evaluate(() => window.surfaceProbe.state());
    expect(after.mode, after.reason).toBe("gpu");
    expect(hash(await page.screenshot()), "fresh pixels after the update").not.toBe(before);
    expect(after.metrics.captures).toBeGreaterThan(state.metrics.captures);
    // Typing reaches the native input and the GPU frame.
    await page.locator("#controlled").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("seamless");
    await page.waitForTimeout(200);
    expect((await page.evaluate(() => window.surfaceProbe.state())).controlled).toBe("seamless");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("heavy Instrument page: GPU stays active, an update is fresh and native hits equal the DOM's", async ({ browser }) => {
  test.setTimeout(240000);
  const { page, errors, context } = await open(browser, heavy, 1);
  try {
    await page.waitForTimeout(500);
    await heavy.disable(page); await page.waitForTimeout(500);
    // Hits at the centre of 24 controls in ordinary DOM presentation, then again once GPU presents.
    const points = await page.evaluate(() => [...document.querySelectorAll("[data-part]")].filter((_, index) => index % 10 === 0).slice(0, 24).map(element => {
      const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }));
    const hits = () => page.evaluate(async points => (await window.postCore.ready).hits(points), points);
    const domHits = await hits();
    expect(domHits.filter(Boolean).length).toBeGreaterThan(10);
    const state = await heavy.enable(page);
    expect(state.mode, state.reason).toBe("gpu");
    expect(await hits(), "native hits match the ordinary DOM's").toEqual(domHits);
    const before = hash(await page.screenshot());
    await page.evaluate(async () => (await window.postCore.ready).setOpacity("upper", 0.4));
    await page.waitForTimeout(300);
    expect(hash(await page.screenshot()), "fresh pixels after an update").not.toBe(before);
    const after = await heavy.state(page);
    expect(after.mode, after.reason).toBe("gpu");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

// A failure at any point during admission leaves the ordinary DOM intact and visible, with no blank frame.
const failures = [
  { name: "a functional readback failure before the swap", reason: /readback failed|Functional GPU readback/i,
    inject: () => { const original = GPUBuffer.prototype.mapAsync; GPUBuffer.prototype.mapAsync = function() { return Promise.reject(new Error("injected readback failure")); }; return () => { GPUBuffer.prototype.mapAsync = original; }; } },
  { name: "an upload failure after the swap", reason: /Native publication failed|injected upload failure/i,
    inject: () => {
      // The probe's own capture is the first upload; every later one (the real layers, in the swap frame) fails.
      const original = GPUQueue.prototype.drawElementImageToTexture; let calls = 0;
      GPUQueue.prototype.drawElementImageToTexture = function(...args) { if (++calls > 1) throw new Error("injected upload failure"); return original.apply(this, args); };
      return () => { GPUQueue.prototype.drawElementImageToTexture = original; };
    } },
];
for (const failure of failures) {
  test(`a failure leaves the DOM visible with no blank frame: ${failure.name}`, async ({ browser }) => {
    const { points } = await baselines(browser, surface, 1);
    const { page, errors, context } = await open(browser, surface, 1);
    page.removeAllListeners("console");
    try {
      const { scored, state, result } = await recordEnable(page, surface, 1, points, async page => {
        await page.evaluate(`window.restoreFault = (${failure.inject.toString()})()`);
      });
      await writeFile(`${directory}/failure-${failure.name.replace(/\W+/g, "-")}.json`, JSON.stringify({ frames: describe(scored), mode: state.mode, reason: state.reason, result }, null, 2));
      expect(blank(scored), `${failure.name}: ${describe(scored)}`).toEqual([]);
      expect(state.mode).toBe("dom");
      expect(state.reason).toMatch(failure.reason);
      await page.evaluate(() => window.restoreFault());
      // The same original root is home in the ordinary host, visible and usable.
      expect(await page.evaluate(() => [document.querySelector("#ordinary-host").hidden, document.querySelector("#gpu-output").hidden,
        document.querySelector(".app-container").parentElement.id, document.querySelector("#gpu-output").style.opacity,
        document.querySelector("#gpu-output").style.pointerEvents])).toEqual([false, true, "ordinary-host", "", ""]);
      await page.locator("#count").click();
      await expect(page.locator("#count")).toHaveText("Count 1");
      // Explicit re-enable works afterwards.
      await page.evaluate(() => window.surfaceProbe.settle()).catch(() => undefined);
      const again = await page.evaluate(() => window.surfaceProbe.enable());
      expect(again.mode, again.reason).toBe("gpu");
      expect(errors.filter(message => !/injected|Underglass|GPU admission failed|readback|publication|Native/i.test(message))).toEqual([]);
    } finally { await context.close(); }
  });
}

test("the probe runs with the DOM presented and the canvas invisible; the caller's canvas styles are restored", async ({ browser }) => {
  const { page, context } = await open(browser, surface, 1);
  try {
    await page.evaluate(() => {
      const canvas = document.querySelector("#gpu-output");
      canvas.style.setProperty("opacity", "0.99");
      canvas.style.setProperty("pointer-events", "none");
      const original = GPUBuffer.prototype.mapAsync;
      const held = new Promise(resolve => { window.releaseReadback = resolve; });
      GPUBuffer.prototype.mapAsync = function(...args) { window.readbackStarted = true; return original.apply(this, args).then(() => held); };
      window.restoreReadback = () => { GPUBuffer.prototype.mapAsync = original; };
      window.attempt = window.surfaceProbe.enable();
    });
    await page.waitForFunction(() => window.readbackStarted);
    const during = await page.evaluate(() => {
      const canvas = document.querySelector("#gpu-output");
      const box = document.querySelector(".card").getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + 30, box.y + 40);
      return { mode: window.surfaceProbe.state().mode, initializing: window.surfaceProbe.state().initializing, hidden: canvas.hidden,
        opacity: getComputedStyle(canvas).opacity, pointer: getComputedStyle(canvas).pointerEvents, parent: document.querySelector(".app-container").parentElement.id,
        ordinaryHidden: document.querySelector("#ordinary-host").hidden, hitInOrdinary: !!hit?.closest("#ordinary-host") };
    });
    expect(during).toEqual({ mode: "dom", initializing: true, hidden: false, opacity: "0", pointer: "none", parent: "ordinary-host", ordinaryHidden: false, hitInOrdinary: true });
    // The DOM is usable meanwhile (a real click reaches the control).
    await page.locator("#count").click();
    await page.evaluate(() => { window.restoreReadback(); window.releaseReadback(); });
    const admitted = await page.evaluate(() => window.attempt);
    expect(admitted.mode, admitted.reason).toBe("gpu");
    expect(admitted.count).toBe("Count 1");
    expect(await page.evaluate(() => { const style = document.querySelector("#gpu-output").style; return [style.opacity, style.pointerEvents]; })).toEqual(["0.99", "auto"]);
    const disabled = await page.evaluate(() => window.surfaceProbe.disable());
    expect(disabled.mode).toBe("dom");
    expect(await page.evaluate(() => { const style = document.querySelector("#gpu-output").style; return [style.opacity, style.pointerEvents]; })).toEqual(["0.99", ""]); // pointer-events returns to the value it had when the renderer was created
  } finally { await context.close(); }
});
