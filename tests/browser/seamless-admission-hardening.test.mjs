/**
 * Hardening of the seamless first admission (issue #202; the main suite is `seamless-admission.test.mjs`):
 * - negative control: with the held DOM frame unavailable (no `document.startViewTransition`) the recorder sees blank frames,
 *   so the zero-blank-frame results are not an artefact of a weak recording;
 * - cancellation between the swap and the first paint (`disable()`, `dispose()`, device loss): content-bearing frames
 *   throughout, the held frame ends at once, the DOM is interactive, resources are balanced;
 * - the hold has a hard bound even when nothing ends it;
 * - a click and key presses during the hold reach the real controls and show once it ends;
 * - a probe failure at the hit-test stage leaves the DOM visible with no blank frame;
 * - layer churn during the probe (the composition is prepared again) leaves the resources balanced.
 * Reports go to the `seamless-admission` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { startRecording } from "../helpers/frame-recorder.mjs";
import { baselines, blank, describe, hash, open, recordEnable, scoreFrames, surface } from "../helpers/seamless-admission.mjs";

const directory = evidenceDirectory("seamless-admission");

/** Swallows the output canvas's paint events once the root is inside it, so the first paint of the swap never arrives. */
const swallowFirstPaint = page => page.evaluate(() => {
  const host = document.querySelector("#gpu-output");
  window.swallow = event => { if (host.querySelector(".app-container")) event.stopImmediatePropagation(); };
  host.addEventListener("paint", window.swallow, true);
  window.releasePaint = () => { host.removeEventListener("paint", window.swallow, true); host.requestPaint(); };
});
const stateOf = page => page.evaluate(() => window.surfaceProbe.state());
const admitting = page => page.waitForFunction(() => window.surfaceProbe.state().mode === "admitting");
const afterFallback = async page => {
  await page.waitForFunction(() => { const state = window.surfaceProbe.state(); return state.mode === "dom" && !state.initializing && !state.transitioning && state.resources.engines === 0; });
};
/** The DOM is home, visible and usable, and no transition or hold style is left behind. */
async function expectDomHome(page) {
  expect(await page.evaluate(() => [document.querySelector("#ordinary-host").hidden, document.querySelector("#gpu-output").hidden,
    document.querySelector(".app-container").parentElement.id, document.activeViewTransition ?? null, document.adoptedStyleSheets.length,
    document.querySelector("#gpu-output").style.opacity])).toEqual([false, true, "ordinary-host", null, 0, ""]);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText(/Count [1-9]/);
}

test("negative control: without the held DOM frame the recorder sees blank frames (the test has power)", async ({ browser }) => {
  await mkdir(directory, { recursive: true });
  const { points } = await baselines(browser, surface, 1);
  const { page, context } = await open(browser, surface, 1, () => { Object.defineProperty(Document.prototype, "startViewTransition", { value: undefined, configurable: true }); });
  try {
    const { scored, state } = await recordEnable(page, surface, 1, points);
    await writeFile(`${directory}/negative-control.json`, JSON.stringify({ frames: describe(scored), cover: state.metrics.admission.cover }, null, 2));
    expect(state.mode, state.reason).toBe("gpu");
    expect(state.metrics.admission.cover).toBe("none");
    expect(blank(scored).length, `blank frames expected without the cover: ${describe(scored)}`).toBeGreaterThan(0);
  } finally { await context.close(); }
});

for (const action of ["disable", "dispose", "device loss"]) {
  test(`${action} between the swap and the first paint: content throughout, hold ended at once, DOM interactive`, async ({ browser }) => {
    const { points } = await baselines(browser, surface, 1);
    const { page, context } = await open(browser, surface, 1);
    try {
      await swallowFirstPaint(page);
      const recorder = await startRecording(page, { ...surface.viewport, dpr: 1 });
      await page.waitForTimeout(300);
      const startedAt = await page.evaluate(() => { window.attempt = window.surfaceProbe.enable().catch(error => ({ enableError: String(error) })); return Date.now(); });
      await admitting(page);
      const held = await page.evaluate(() => document.activeViewTransition !== null && document.activeViewTransition !== undefined);
      const before = Date.now();
      if (action === "disable") await page.evaluate(() => window.surfaceProbe.disable());
      else if (action === "dispose") await page.evaluate(() => window.surfaceProbe.dispose());
      else await page.evaluate(() => document.querySelector("#gpu-output").getContext("webgpu").getConfiguration().device.destroy());
      const result = await page.evaluate(() => window.attempt);
      const took = Date.now() - before;
      await page.waitForTimeout(400);
      // After dispose() the surface is gone by design (the root is unmounted): only the frames up to it count.
      const scored = scoreFrames(await recorder.stop(), startedAt, points).filter(frame => action !== "dispose" || frame.at < before - startedAt + 10);
      await writeFile(`${directory}/cancel-${action.replace(" ", "-")}.json`, JSON.stringify({ held, tookMs: took, frames: describe(scored), result: result.reason ?? result.enableError }, null, 2));
      expect(held, "the DOM frame was being held at the swap").toBe(true);
      expect(took, "enable() settles within a few frames of the cancellation, not at settle()'s 3 s deadline").toBeLessThan(1200);
      expect(scored.length).toBeGreaterThanOrEqual(3);
      expect(blank(scored), `${action}: ${describe(scored)}`).toEqual([]);
      if (action === "dispose") {
        const state = await stateOf(page);
        expect(state.mode).toBe("disposed");
        expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
        expect(await page.evaluate(() => [document.activeViewTransition ?? null, document.adoptedStyleSheets.length])).toEqual([null, 0]);
      } else {
        await afterFallback(page);
        await expectDomHome(page);
      }
    } finally { await context.close(); }
  });
}

test("the hold has a hard bound: it ends within 700 ms even when nothing else ends it", async ({ browser }) => {
  const { page, context } = await open(browser, surface, 1);
  try {
    await swallowFirstPaint(page);
    await page.evaluate(() => { window.attempt = window.surfaceProbe.enable().catch(error => ({ enableError: String(error) })); });
    await admitting(page);
    const started = Date.now();
    expect(await page.evaluate(() => !!document.activeViewTransition)).toBe(true);
    await page.waitForFunction(() => !document.activeViewTransition, null, { timeout: 2000, polling: 16 });
    const bound = Date.now() - started;
    expect(bound).toBeLessThan(700);
    expect(await page.evaluate(() => document.adoptedStyleSheets.length)).toBe(0);
    await writeFile(`${directory}/hold-bound.json`, JSON.stringify({ heldMs: bound }, null, 2));
    await page.evaluate(() => window.releasePaint());
    await page.evaluate(() => window.attempt);
  } finally { await context.close(); }
});

// The held frame is a view transition, and while one runs the browser's hit testing returns the document root: a pointer
// event that lands inside the hold (a few frames) is not delivered to the controls. Key presses go to the focused control and
// are kept. The swap never starts between a press and its release, so no click is split.
test("key presses during the hold reach the focused control and show once it ends; the hold's pointer limit is the documented one", async ({ browser }) => {
  const { page, context } = await open(browser, surface, 1);
  try {
    await page.locator("#controlled").click();
    await page.keyboard.press("ControlOrMeta+a");
    await swallowFirstPaint(page);
    await page.evaluate(() => { window.attempt = window.surfaceProbe.enable(); });
    await admitting(page);
    expect(await page.evaluate(() => !!document.activeViewTransition)).toBe(true);
    await page.keyboard.type("held");
    // Documented limit: a pointer event inside the hold targets the document root, not the control under it.
    const box = await page.locator("#count").boundingBox();
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, { x: box.x + 5, y: box.y + 5 })).toBe("HTML");
    await page.evaluate(() => window.releasePaint());
    const admitted = await page.evaluate(() => window.attempt);
    expect(admitted.mode, admitted.reason).toBe("gpu");
    expect(admitted.controlled).toBe("held");
    expect(admitted.focus).toBe("controlled");
    // Once the hold ends the controls take pointer input at their drawn position.
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    const before = hash(await page.screenshot());
    await page.locator("#count").click();
    await page.waitForTimeout(300);
    expect(hash(await page.screenshot()), "later updates are fresh too").not.toBe(before);
  } finally { await context.close(); }
});

test("a pointer pressed during admission delays the swap until it is released, so the click is not split", async ({ browser }) => {
  const { page, context } = await open(browser, surface, 1);
  try {
    const box = await page.locator("#count").boundingBox();
    await page.mouse.move(box.x + 8, box.y + 8);
    await page.evaluate(() => { window.attempt = window.surfaceProbe.enable(); });
    await page.mouse.down();
    // Probe and preparation finish, but the swap waits for the release (bounded at 1 s).
    await page.waitForTimeout(500);
    const waiting = await stateOf(page);
    expect(waiting.mode, "the swap has not started").toBe("dom");
    expect(waiting.initializing).toBe(true);
    await page.mouse.up();
    const admitted = await page.evaluate(() => window.attempt);
    expect(admitted.mode, admitted.reason).toBe("gpu");
    // The press and release both reached the DOM button: one click.
    expect(admitted.count).toBe("Count 1");
  } finally { await context.close(); }
});

test("a probe failure at the hit-test stage leaves the DOM visible with no blank frame", async ({ browser }) => {
  const { points } = await baselines(browser, surface, 1);
  const { page, context } = await open(browser, surface, 1);
  try {
    const { scored, state } = await recordEnable(page, surface, 1, points, page => page.evaluate(() => {
      const original = Document.prototype.elementFromPoint;
      Document.prototype.elementFromPoint = function() { return null; };
      window.restoreHits = () => { Document.prototype.elementFromPoint = original; };
    }));
    await writeFile(`${directory}/failure-hit-test.json`, JSON.stringify({ frames: describe(scored), mode: state.mode, reason: state.reason }, null, 2));
    expect(blank(scored), describe(scored)).toEqual([]);
    expect(state.mode).toBe("dom");
    expect(state.reason).toMatch(/hit testing|geometry|clip/i);
    await page.evaluate(() => window.restoreHits());
    await expectDomHome(page);
  } finally { await context.close(); }
});

test("layer churn during the probe prepares the composition again and leaves the resources balanced", async ({ browser }) => {
  const resources = state => Object.fromEntries(["textures", "effects", "renderers", "engines", "probeElements", "lightPasses", "scheduledFrames", "paintWaits"].map(key => [key, state.resources[key]]));
  async function admit(churn) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
    const page = await context.newPage();
    try {
      await page.goto("/integration.html?dom");
      await page.waitForFunction(() => window.integrationProbe && !window.integrationProbe.state().initializing);
      if (churn) {
        await page.evaluate(() => {
          const original = GPUBuffer.prototype.mapAsync;
          const held = new Promise(resolve => { window.releaseReadback = resolve; });
          GPUBuffer.prototype.mapAsync = function(...args) { window.readbackStarted = true; return original.apply(this, args).then(() => held); };
          window.restoreReadback = () => { GPUBuffer.prototype.mapAsync = original; };
          window.attempt = window.integrationProbe.enable();
        });
        await page.waitForFunction(() => window.readbackStarted);
        await page.evaluate(async () => {
          for (let round = 0; round < 3; round++) { window.integrationProbe.replace(); window.integrationProbe.reorder(); await new Promise(resolve => requestAnimationFrame(resolve)); }
          window.integrationProbe.layout({ left: 50 });
          window.restoreReadback(); window.releaseReadback();
        });
        await page.evaluate(() => window.attempt);
        await page.evaluate(() => window.integrationProbe.layout({ left: 0 }));
      } else await page.evaluate(() => window.integrationProbe.enable());
      await page.evaluate(() => window.integrationProbe.settle());
      await page.waitForFunction(() => window.integrationProbe.state().resources.pendingCleanups === 0);
      const state = await page.evaluate(() => window.integrationProbe.state());
      expect(state.mode, state.reason).toBe("gpu");
      return { resources: resources(state), layers: state.layers?.length ?? null };
    } finally { await context.close(); }
  }
  const plain = await admit(false), churned = await admit(true);
  await writeFile(`${directory}/layer-churn.json`, JSON.stringify({ plain, churned }, null, 2));
  expect(churned.resources).toEqual(plain.resources);
});

// The held frame is released after the GPU has finished the first draw and one more frame has passed (not on a timer); under
// CPU and GPU contention (busy worker threads, a second device submitting heavy work every few milliseconds) no frame is blank.
test("no blank frame under CPU and GPU load", async ({ browser }) => {
  test.setTimeout(120000);
  const { points } = await baselines(browser, surface, 1);
  const runs = [];
  for (let run = 0; run < 3; run++) {
    const { page, context } = await open(browser, surface, 1);
    try {
      const { scored, state } = await recordEnable(page, surface, 1, points, page => page.evaluate(async () => {
        const source = "let n = 0; for (;;) { n = Math.sqrt(n + 1.5) * 1.0001; }";
        window.spinners = Array.from({ length: Math.max(2, navigator.hardwareConcurrency - 1) }, () => new Worker(URL.createObjectURL(new Blob([source]))));
        const adapter = await navigator.gpu.requestAdapter(), device = await adapter.requestDevice();
        const buffer = device.createBuffer({ size: 64 * 1024 * 1024, usage: GPUBufferUsage.STORAGE });
        const module = device.createShaderModule({ code: "@group(0) @binding(0) var<storage, read_write> data: array<f32>; @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3u) { var v = data[id.x]; for (var i = 0u; i < 512u; i++) { v = sin(v + f32(i)) * 1.0001; } data[id.x] = v; }" });
        const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
        const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer } }] });
        window.loadTimer = setInterval(() => {
          const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
          pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(16384); pass.end();
          device.queue.submit([encoder.finish()]);
        }, 6);
      }));
      runs.push(describe(scored));
      expect(scored.length).toBeGreaterThanOrEqual(3);
      expect(blank(scored), `under load: ${describe(scored)}`).toEqual([]);
      expect(state.mode, state.reason).toBe("gpu");
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/under-load.json`, JSON.stringify({ runs }, null, 2));
});
