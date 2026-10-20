/**
 * Browser suite for the low-level surface renderer (`createSurfaceRenderer`) on the playground page
 * `surface.html` (`window.surfaceProbe`), plus the native backend probe on `probe.html`. A captured
 * card and badge layer are composited on GPU; the same elements are also shown in ordinary DOM with a
 * differently coloured card (blue instead of red), so a sample at (30,225) tells which path is
 * presenting. The suite proves GPU pixels and native controls, GPU-only frames with no React commits or
 * captures, and recovery to the same original root and native state from startup faults, capture
 * errors, real device loss and stuck GPU queue fences. Production preview is the default; `strict`
 * uses the Vite development server with React StrictMode. JSON reports and screenshots go to the
 * `surface` evidence directory.
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

import { evidenceDirectory } from "../helpers/evidence.mjs";
import { developmentURL } from "../helpers/urls.mjs";
const evidence = evidenceDirectory("surface");
// Hash of the decoded RGBA pixels (not the PNG file bytes), for "did the pixels change" checks.
const hash = bytes => createHash("sha256").update(PNG.sync.read(bytes).data).digest("hex");
// RGBA of PNG pixel (x, y) in device pixels (this suite runs at DPR 1).
function pixel(bytes, x, y) {
  const png = PNG.sync.read(bytes);
  return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
}
// Opens `surface.html`, waits for GPU admission and a quiet period, then drains scheduled work.
async function ready(page, strict = false) {
  await page.goto(strict ? `${developmentURL}/surface.html?strict` : "/surface.html");
  await page.waitForFunction(() => window.surfaceProbe?.state().mode === "gpu" && !window.surfaceProbe.state().initializing);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.surfaceProbe.settle());
}
// Clicks the control, selects all and types, replacing its value with real keyboard input.
async function edit(page, id, value) {
  await page.locator(`#${id}`).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(value);
}
// Screenshots `.surface-frame` and saves it as evidence.
async function screenshot(page, name) {
  return page.locator(".surface-frame").screenshot({ path: `${evidence}/${name}.png` });
}

for (const strict of [false, true]) {
  test(`integrated native GPU pixels, controls, caching and stable-root recovery StrictMode=${strict}`, async ({ page, browser }) => {
    await mkdir(evidence, { recursive: true });
    const name = strict ? "development-strict" : "production";
    // The report records which browser executable or channel is under test.
    const report = { startedAt: new Date().toISOString(), strict, reactBuild: strict ? "development" : "production-profiling", executablePath: (test.info().project.use.launchOptions.executablePath ?? test.info().project.use.launchOptions.channel), errors: [], cycles: [] };
    page.on("pageerror", error => report.errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") report.errors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
    try {
      const cdp = await browser.newBrowserCDPSession();
      report.browser = await cdp.send("Browser.getVersion");
      report.commandLine = (await cdp.send("Browser.getBrowserCommandLine")).arguments.map(argument =>
        argument.replace(/\/(?:Users|private|var|tmp)\/[^\s]+/g, "<redacted-local-path>"));
      await ready(page, strict);
      report.initial = await page.evaluate(() => window.surfaceProbe.state());
      expect(report.initial.metrics.mounts).toBe(strict ? 2 : 1);
      expect(report.initial.metrics.cleanups).toBe(strict ? 1 : 0);
      expect(report.initial.metrics.reactCommits).toBeGreaterThan(0);
      expect(report.initial.metrics.commitEvents[0].phase).toBe("mount");
      expect(report.initial.metrics.commitEvents).toHaveLength(report.initial.metrics.reactCommits);
      expect(report.initial.resources.engines).toBe(1);
      expect(report.initial.resources.textures).toBe(2);
      const first = await screenshot(page, `${name}-initial`);
      report.initialPixels = { card: pixel(first, 30, 225), alpha: pixel(first, 270, 235) };
      // Card pixel is the red layer colour (240,30,60); the `alpha` sample at (270,235) is the expected blended pixel.
      expect(report.initialPixels).toEqual({ card: [240, 30, 60, 255], alpha: [130, 115, 75, 255] });
      // Nothing may be drawn into the capture host's own 2D bitmap: every alpha value must be 0.
      report.ownerBitmapBlank = await page.evaluate(() => {
        const host = document.querySelector("#capture-host");
        const data = host.getContext("2d").getImageData(0, 0, host.width, host.height).data;
        return data.every((value, index) => index % 4 !== 3 || value === 0);
      });
      expect(report.ownerBitmapBlank).toBe(true);
      await page.locator("#count").click();
      await page.locator("#badge").click();
      await expect(page.locator("#count")).toHaveText("Count 2");
      // A nested React update must cause exactly one commit.
      report.nestedCommitProbe = { before: (await page.evaluate(() => window.surfaceProbe.state())).metrics.reactCommits };
      await page.locator("#nested-count").click();
      await expect(page.locator("#nested-count")).toHaveText("Nested 1");
      report.nestedCommitProbe.after = (await page.evaluate(() => window.surfaceProbe.state())).metrics.reactCommits;
      expect(report.nestedCommitProbe.after - report.nestedCommitProbe.before).toBe(1);
      await edit(page, "controlled", "edited-native-GPU");
      await page.keyboard.press("Enter");
      await expect(page.locator("#submitted")).toHaveText("edited-native-GPU");
      report.editCommitProbe = (await page.evaluate(() => window.surfaceProbe.state())).metrics.reactCommits;
      expect(report.editCommitProbe).toBeGreaterThan(report.nestedCommitProbe.after);
      await edit(page, "uncontrolled", "native-kept");
      await page.locator("h1").click(); // No editable caret invalidation during GPU-only measurements.
      await page.waitForTimeout(200);
      await page.evaluate(() => window.surfaceProbe.settle());
      const edited = await screenshot(page, `${name}-edited`);
      expect(hash(edited)).not.toBe(hash(first));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.surfaceProbe.settle());
      // `frames(count, shift, shade)` runs `count` GPU-only frames (1-300) shifting layers by `shift` CSS px
      // and tinting by swapping colour channels by `shade` (0-1). Nothing may reach React or capture.
      report.gpuOnly = await page.evaluate(() => window.surfaceProbe.frames(300, 40, 1));
      expect(report.gpuOnly.after.reactCommits).toBe(report.gpuOnly.before.reactCommits);
      expect(report.gpuOnly.after.captures).toBe(report.gpuOnly.before.captures);
      expect(report.gpuOnly.after.pixelCopies).toBe(report.gpuOnly.before.pixelCopies);
      expect(report.gpuOnly.after.uploads).toBe(report.gpuOnly.before.uploads);
      expect(report.gpuOnly.after.gpuFrames - report.gpuOnly.before.gpuFrames).toBe(300);
      // Shifted by 40 px: the old card position is white and the card sits further right with red and blue swapped.
      const transformed = await screenshot(page, `${name}-shader-shift`);
      expect(pixel(transformed, 30, 225)).toEqual([255, 255, 255, 255]);
      expect(pixel(transformed, 70, 225)).toEqual([60, 30, 240, 255]);
      report.transformedPixels = { card: pixel(transformed, 70, 225), alpha: pixel(transformed, 310, 235) };
      expect(report.transformedPixels.alpha).toEqual([75, 115, 130, 255]);
      // Playwright dispatches real pointer events at the geometry-derived browser bounding box.
      await page.locator("#count").click();
      await page.locator("#badge").click();
      await expect(page.locator("#count")).toHaveText("Count 4");
      await page.locator("#controlled").click();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await page.keyboard.press("Shift+ArrowRight");
      await page.evaluate(() => {
        window.originalSurfaceContainer = document.querySelector(".app-container");
        window.originalSurfaceInput = document.querySelector("#controlled");
      });
      // Fall back to ordinary DOM: native geometry is reset to identity for both layers and every native
      // value, focus and selection must be carried over unchanged.
      report.beforeFallback = await page.evaluate(() => window.surfaceProbe.state());
      report.dom = await page.evaluate(() => window.surfaceProbe.disable());
      expect(report.dom.clearedGeometry).toEqual([{ id: "card-layer", identity: true }, { id: "badge-layer", identity: true }]);
      expect(report.dom.resources.engines).toBe(0);
      expect(report.dom.resources.textures).toBe(0);
      expect(report.dom.count).toBe("Count 4");
      expect(report.dom.nestedCount).toBe("Nested 1");
      expect(report.dom.controlled).toBe("edited-native-GPU");
      expect(report.dom.uncontrolled).toBe("native-kept");
      expect(report.dom.focus).toBe("controlled");
      expect(report.dom.selection).toEqual(report.beforeFallback.selection);
      // The ordinary DOM card is blue, which tells the DOM path from the GPU path.
      const dom = await screenshot(page, `${name}-ordinary-DOM`);
      expect(pixel(dom, 30, 225)).toEqual([30, 100, 220, 255]);
      await page.locator("#count").click();
      await edit(page, "controlled", "edited-in-DOM");
      await page.keyboard.press("Enter");
      await expect(page.locator("#submitted")).toHaveText("edited-in-DOM");
      await page.locator("#toggle").click();
      await expect(page.locator("#nested-count")).toHaveCount(0);
      await page.locator("#toggle").click();
      await expect(page.locator("#nested-count")).toHaveText("Nested 0");
      await page.locator("#nested-count").click();
      await page.locator("#controlled").click();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      report.beforeReentry = await page.evaluate(() => window.surfaceProbe.state());
      report.reentry = await page.evaluate(() => window.surfaceProbe.enable());
      expect(report.reentry.focus).toBe("controlled");
      expect(report.reentry.selection).toEqual(report.beforeReentry.selection);
      expect(report.reentry.controlled).toBe("edited-in-DOM");
      expect(report.reentry.uncontrolled).toBe("native-kept");
      await screenshot(page, `${name}-reentry`);
      await page.locator("#count").click();
      await expect(page.locator("#count")).toHaveText("Count 6");
      // Ten disable/enable rounds with a click in each state (+2 to the count per round, so 6 becomes 26);
      // the original container and input must remain the same nodes at the end.
      for (let cycle = 0; cycle < 10; cycle++) {
        const out = await page.evaluate(() => window.surfaceProbe.disable());
        await page.locator("#count").click();
        const back = await page.evaluate(() => window.surfaceProbe.enable());
        await page.locator("#count").click();
        expect(back.resources.engines).toBe(1);
        expect(out.resources.engines).toBe(0);
        expect(back.resources.snapshots).toBe(0);
        expect(back.uncontrolled).toBe("native-kept");
        report.cycles.push({ cycle, outCount: out.count, reentryCount: back.count, captures: back.metrics.captures, moves: back.metrics.moves });
      }
      expect(await page.evaluate(() => window.originalSurfaceContainer === document.querySelector(".app-container") && window.originalSurfaceInput === document.querySelector("#controlled"))).toBe(true);
      expect(await page.locator("#controlled").count()).toBe(1);
      await expect(page.locator("#count")).toHaveText("Count 26");
      report.final = await page.evaluate(() => window.surfaceProbe.dispose());
      expect(Object.values(report.final.resources).every(value => value === 0)).toBe(true);
      expect(report.final.metrics.cleanups).toBe(report.final.metrics.mounts);
      expect(report.final.metrics.commitEvents).toHaveLength(report.final.metrics.reactCommits);
      expect(await page.locator(".app-container input").count()).toBe(0);
      expect((await page.evaluate(() => window.surfaceProbe.dispose())).resources).toEqual(report.final.resources);
      expect(report.errors).toEqual([]);
      report.passed = true;
    } finally {
      report.finishedAt = new Date().toISOString();
      await writeFile(`${evidence}/${name}.json`, JSON.stringify(report, null, 2));
    }
  });
}

// Startup faults installed before the page scripts run (`addInitScript`): each removes or breaks one
// capability the GPU path needs. enable() must fail with a "GPU admission failed" diagnosis, keep the
// ordinary DOM usable and preserve typed input, and leave no GPU resources.
for (const fault of ["capture-unavailable", "no-gpu", "move-unavailable", "paint-timeout", "gpu-admission-rejected", "geometry-rejected", "null-configuration", "loss-observation-unavailable"]) {
  test(`surface startup keeps usable ordinary DOM: ${fault}`, async ({ page }) => {
    await page.addInitScript(fault => {
      // Current native capture is GPUQueue.drawElementImageToTexture on the owning output canvas.
      if (fault === "capture-unavailable") Object.defineProperty(GPUQueue.prototype, "drawElementImageToTexture", { value: undefined, configurable: true });
      if (fault === "no-gpu") Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
      if (fault === "move-unavailable") Object.defineProperty(Element.prototype, "moveBefore", { value: undefined, configurable: true });
      if (fault === "gpu-admission-rejected") Object.defineProperty(navigator.gpu, "requestAdapter", { value: async () => null, configurable: true });
      if (fault === "geometry-rejected") HTMLCanvasElement.prototype.updateElementGeometry = function () { throw new Error("Injected native geometry rejection"); };
      if (fault === "null-configuration") GPUCanvasContext.prototype.getConfiguration = () => null;
      if (fault === "loss-observation-unavailable") Object.defineProperty(GPUCanvasContext.prototype, "getConfiguration", { value: undefined, configurable: true });
      if (fault === "paint-timeout") {
        const add = HTMLCanvasElement.prototype.addEventListener;
        HTMLCanvasElement.prototype.addEventListener = function (type, ...args) {
          if (type !== "paint") return add.call(this, type, ...args);
        };
      }
    }, fault);
    await page.goto("/surface.html?dom");
    await page.waitForFunction(() => window.surfaceProbe && document.querySelector("#count"));
    await edit(page, "controlled", "initial-preserved");
    const result = await page.evaluate(() => window.surfaceProbe.enable());
    expect(result.mode).toBe("dom");
    expect(result.reason).toMatch(/GPU admission failed:/);
    expect(result.controlled).toBe("initial-preserved");
    expect(result.resources.engines).toBe(0);
    const image = await screenshot(page, "runtime-failure-ordinary-DOM");
    expect(pixel(image, 30, 225)).toEqual([30, 100, 220, 255]);
    expect(result.resources.roots).toBe(1);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    const final = await page.evaluate(() => window.surfaceProbe.dispose());
    expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/${fault}.json`, JSON.stringify({ result, final }, null, 2));
  });
}

// A capture error after GPU was active must return to the same root and keep both the controlled and
// uncontrolled input values, with the failure reason recorded and the engine released.
test("surface runtime capture failure recovers the original root and editing state", async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await ready(page);
  await edit(page, "uncontrolled", "native-survives-fault");
  await page.locator("h1").click();
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.originalSurfaceInput = document.querySelector("#controlled");
    GPUQueue.prototype.drawElementImageToTexture = () => { throw new Error("Injected capture failure"); };
  });
  await edit(page, "controlled", "recovered");
  await page.waitForFunction(() => window.surfaceProbe.state().mode === "dom");
  await expect(page.locator("#controlled")).toHaveValue("recovered");
  await expect(page.locator("#uncontrolled")).toHaveValue("native-survives-fault");
  expect(await page.evaluate(() => window.originalSurfaceInput === document.querySelector("#controlled"))).toBe(true);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  const result = await page.evaluate(() => window.surfaceProbe.state());
  expect(result.reason).toMatch(/Native publication failed: .*Injected capture failure/);
  expect(result.resources.engines).toBe(0);
  const final = await page.evaluate(() => window.surfaceProbe.dispose());
  expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
  await mkdir(evidence, { recursive: true });
  await screenshot(page, "runtime-failure-disposed");
  await writeFile(`${evidence}/runtime-capture-failure.json`, JSON.stringify({ result, final }, null, 2));
});

// The adapter request is held open by a test-controlled gate (`window.__openAdapter()` releases it), standing
// in for a slow or hung GPU process. A slow initialization is neither a GPU error nor missing support, so
// core only diagnoses it (a transient reason) and keeps ordinary DOM presented until the engine arrives.
async function gateAdapter(page) {
  await page.addInitScript(() => {
    const gpu = navigator.gpu;
    const request = gpu.requestAdapter.bind(gpu);
    const gate = new Promise(resolve => { window.__openAdapter = resolve; });
    gpu.requestAdapter = options => gate.then(() => request(options));
  });
}
// Starts `count` `enable()` calls without awaiting them; results land in `window.__results`.
async function startEnabling(page, count = 1) {
  await page.evaluate(count => {
    window.__results = [];
    for (let index = 0; index < count; index++) window.surfaceProbe.enable().then(state => window.__results.push(state));
  }, count);
}

// The 5 s deadline only diagnoses: ordinary DOM stays presented and interactive while the request is pending,
// the engine is adopted when it arrives, and the surface ends on GPU with fresh pixels and correct native hits.
// A second enable() queued behind the first resolves with the same GPU surface.
test("slow GPU initialization stays on DOM, then is adopted and ends on GPU", async ({ page }) => {
  test.setTimeout(90_000);
  await mkdir(evidence, { recursive: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await gateAdapter(page);
  await page.goto("/surface.html?dom");
  await page.waitForFunction(() => window.surfaceProbe && document.querySelector("#count"));
  await startEnabling(page, 2);
  await page.waitForFunction(() => /initialization slow/.test(window.surfaceProbe.state().reason), undefined, { timeout: 20_000 });
  const slow = await page.evaluate(() => window.surfaceProbe.state());
  expect(slow.mode).toBe("dom");
  expect(slow.initializing).toBe(true);
  expect(slow.reason).toContain("ordinary DOM stays presented and admission continues");
  expect(slow.resources.pendingEngines).toBe(1);
  expect(slow.resources.engines).toBe(0);
  expect(slow.metrics.admission.slowInits).toBe(1);
  // Ordinary DOM is what the user sees, and it is interactive.
  const waiting = await screenshot(page, "slow-init-ordinary-DOM");
  expect(pixel(waiting, 30, 225)).toEqual([30, 100, 220, 255]);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  await page.evaluate(() => window.__openAdapter());
  await page.waitForFunction(() => window.__results?.length === 2, undefined, { timeout: 20_000 });
  const results = await page.evaluate(() => window.__results);
  for (const result of results) expect(result.mode).toBe("gpu");
  await page.evaluate(() => window.surfaceProbe.settle());
  const adopted = await page.evaluate(() => window.surfaceProbe.state());
  expect(adopted.mode).toBe("gpu");
  expect(adopted.reason).not.toContain("initialization slow");
  expect(adopted.resources.engines).toBe(1);
  expect(adopted.resources.pendingEngines).toBe(0);
  expect(adopted.metrics.admission.engineMs).toBeGreaterThan(5000);
  expect(adopted.count).toBe("Count 1");
  const first = await screenshot(page, "slow-init-gpu");
  expect(pixel(first, 30, 225)).toEqual([240, 30, 60, 255]);
  // Native hit on the GPU-presented control commits to the same React state, and the pixels change.
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 2");
  await page.evaluate(() => window.surfaceProbe.settle());
  const second = await screenshot(page, "slow-init-gpu-after-click");
  expect(hash(second)).not.toBe(hash(first));
  expect(pixel(second, 30, 225)).toEqual([240, 30, 60, 255]);
  const final = await page.evaluate(() => window.surfaceProbe.state());
  expect(final.mode).toBe("gpu");
  expect(final.resources.engines).toBe(1);
  expect(errors).toEqual([]);
  const disposed = await page.evaluate(() => window.surfaceProbe.dispose());
  expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
  await writeFile(`${evidence}/slow-init-adopted.json`, JSON.stringify({ slow, adopted, final, disposed }, null, 2));
});

// A pending (hung) engine request never holds disable() or dispose() hostage: both settle at once and the
// late engine is disposed when it finally arrives. Re-entry is refused only while that request is outstanding.
for (const action of ["disable", "dispose"]) {
  test(`pending GPU initialization is cancelled promptly by ${action} and the late engine is disposed`, async ({ page }) => {
    await mkdir(evidence, { recursive: true });
    await gateAdapter(page);
    await page.goto("/surface.html?dom");
    await page.waitForFunction(() => window.surfaceProbe && document.querySelector("#count"));
    await startEnabling(page);
    await page.waitForFunction(() => window.surfaceProbe.state().resources.pendingEngines === 1);
    const cancelled = await page.evaluate(async action => {
      const started = performance.now();
      const state = await window.surfaceProbe[action]();
      return { ms: performance.now() - started, state };
    }, action);
    expect(cancelled.ms).toBeLessThan(2000);
    expect(cancelled.state.mode).toBe(action === "dispose" ? "disposed" : "dom");
    expect(cancelled.state.initializing).toBe(false);
    expect(cancelled.state.resources.pendingEngines).toBe(1);
    await page.waitForFunction(() => window.__results?.length === 1);
    // The cancelled enable() resolves with the DOM state it recovered to (disposal completes after it).
    expect((await page.evaluate(() => window.__results[0])).mode).toBe("dom");
    if (action === "disable") {
      expect(cancelled.state.reason).toMatch(/Explicit disable/);
      await expect(page.evaluate(() => window.surfaceProbe.enable())).rejects.toThrow("Previous engine admission has not settled");
      await page.locator("#count").click();
      await expect(page.locator("#count")).toHaveText("Count 1");
    }
    await page.evaluate(() => window.__openAdapter());
    await page.waitForFunction(() => window.surfaceProbe.state().resources.pendingEngines === 0);
    const late = await page.evaluate(() => window.surfaceProbe.state());
    expect(late.resources.engines).toBe(0);
    expect(late.mode).toBe(action === "dispose" ? "disposed" : "dom");
    if (action === "disable") {
      // With the late request settled, a fresh enable() reaches GPU.
      expect((await page.evaluate(() => window.surfaceProbe.enable())).mode).toBe("gpu");
      const final = await page.evaluate(() => window.surfaceProbe.dispose());
      expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
    } else expect(Object.values(late.resources).every(value => value === 0)).toBe(true);
    await writeFile(`${evidence}/pending-init-cancelled-by-${action}.json`, JSON.stringify({ cancelled, late }, null, 2));
  });
}

// Pixel staging through the owning canvas works on both public GPU backends (WebGPU, WebGL2) in
// `probe.html`: two real native layers captured, copied and uploaded, with the expected colours.
test("owning-canvas pixel staging transfers real native layers through both public backends", async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await page.goto("/probe.html");
  await page.waitForFunction(() => window.nativeProbe);
  const reports = [];
  for (const backend of ["webgpu", "webgl2"]) {
    const started = await page.evaluate(backend => window.nativeProbe.backend.start(backend, "owning-staged"), backend);
    const image = await page.locator("#backend-output").screenshot({ path: `${evidence}/native-${backend}.png` });
    expect(pixel(image, 55, 165)).toEqual([240, 30, 60, 255]);
    expect(pixel(image, 285, 55)).toEqual([20, 200, 90, 255]);
    expect(started.metrics.captures).toBe(2);
    expect(started.metrics.pixelCopies).toBe(2);
    expect(started.metrics.uploads).toBe(2);
    const disposed = await page.evaluate(() => window.nativeProbe.backend.dispose());
    expect(Object.values(disposed).every(value => value === 0)).toBe(true);
    reports.push({ backend, started, disposed });
  }
  await writeFile(`${evidence}/native-public-backends.json`, JSON.stringify(reports, null, 2));
});

// The configured GPU device is destroyed through the public API so the browser delivers a real loss.
// With `motion` a bounded GPU animation is in flight and must be interrupted. Either way the surface
// must return to the same DOM root with native values, focus and selection intact and no GPU
// resources, then re-enter GPU. Repeated losses are also exercised (production build with motion only).
for (const strict of [false, true]) {
  for (const motion of [false, true]) {
    test(`public device destruction delivers actual loss and preserves root StrictMode=${strict} motion=${motion}`, async ({ page }) => {
      await mkdir(evidence, { recursive: true });
      await ready(page, strict);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.locator("#count").click();
      await page.locator("#nested-count").click();
      await edit(page, "uncontrolled", "native-loss-kept");
      await edit(page, "controlled", "controlled-loss-kept");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.evaluate(() => {
        window.lossInput = document.querySelector("#controlled");
        window.lossContainer = document.querySelector(".app-container");
      });
      const before = await page.evaluate(() => window.surfaceProbe.state());
      if (motion) {
        await page.evaluate(() => {
          window.motionResult = window.surfaceProbe.frames(300, 40, 1).then(
            result => ({ result }), error => ({ interrupted: String(error) }));
        });
        await page.waitForFunction(frames => window.surfaceProbe.state().metrics.gpuFrames > frames + 2, before.metrics.gpuFrames);
      }
      const delivered = await page.evaluate(async () => {
        const device = document.querySelector("#gpu-output").getContext("webgpu").getConfiguration().device;
        device.destroy();
        const info = await device.lost;
        return { reason: info.reason, message: info.message, trigger: "public configured GPUDevice.destroy()" };
      });
      expect(delivered.reason).toBe("destroyed");
      await page.waitForFunction(() => {
        const state = window.surfaceProbe.state();
        return state.mode === "dom" && !state.transitioning && !state.moving && state.resources.engines === 0;
      });
      const recovered = await page.evaluate(() => window.surfaceProbe.state());
      expect(recovered.metrics.deviceLosses).toHaveLength(1);
      expect(recovered.metrics.deviceLosses[0].duringMotion).toBe(motion);
      expect(recovered.reason).toContain("GPU device lost");
      expect(recovered.clearedGeometry).toEqual([{ id: "card-layer", identity: true }, { id: "badge-layer", identity: true }]);
      for (const key of ["engines", "textures", "effects", "renderers", "stagingCanvases", "snapshots", "lossObservers", "pendingCleanups", "scheduledFrames", "paintWaits"]) expect(recovered.resources[key]).toBe(0);
      expect(recovered.metrics.mounts).toBe(before.metrics.mounts);
      expect(recovered.metrics.cleanups).toBe(before.metrics.cleanups);
      expect(recovered.controlled).toBe(before.controlled);
      expect(recovered.uncontrolled).toBe(before.uncontrolled);
      expect(recovered.nestedCount).toBe("Nested 1");
      expect(recovered.focus).toBe("controlled");
      expect(recovered.selection).toEqual(before.selection);
      expect(await page.evaluate(() => window.lossInput === document.querySelector("#controlled") && window.lossContainer === document.querySelector(".app-container"))).toBe(true);
      const image = await screenshot(page, `device-loss-${strict}-${motion}-DOM`);
      expect(pixel(image, 30, 225)).toEqual([30, 100, 220, 255]);
      await expect(page.locator("#diagnostics")).toContainText("GPU device lost");
      await page.locator("#count").click();
      await edit(page, "controlled", "after-device-loss");
      await page.keyboard.press("Enter");
      await expect(page.locator("#submitted")).toHaveText("after-device-loss");
      const reentered = await page.evaluate(() => window.surfaceProbe.enable());
      expect(reentered.mode).toBe("gpu");
      expect(reentered.resources.lossObservers).toBe(1);
      expect(reentered.uncontrolled).toBe("native-loss-kept");
      await page.waitForTimeout(100);
      const reentryImage = await screenshot(page, `device-loss-${strict}-${motion}-reentry`);
      expect(pixel(reentryImage, 30, 225)).toEqual([240, 30, 60, 255]);
      await page.locator("#count").click();
      await expect(page.locator("#count")).toHaveText("Count 3");
      const repeatedLosses = [];
      if (motion && !strict) {
        for (let cycle = 0; cycle < 2; cycle++) {
          await page.evaluate(() => document.querySelector("#gpu-output").getContext("webgpu").getConfiguration().device.destroy());
          await page.waitForFunction(() => window.surfaceProbe.state().mode === "dom" && window.surfaceProbe.state().resources.engines === 0);
          const dom = await page.evaluate(() => window.surfaceProbe.state());
          expect(dom.controlled).toBe("after-device-loss");
          expect(dom.nestedCount).toBe("Nested 1");
          const gpu = await page.evaluate(() => window.surfaceProbe.enable());
          expect(gpu.mode).toBe("gpu");
          repeatedLosses.push({ dom, gpu });
        }
      }
      const final = await page.evaluate(() => window.surfaceProbe.dispose());
      expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
      expect((await page.evaluate(() => window.surfaceProbe.dispose())).resources).toEqual(final.resources);
      const motionResult = motion ? await page.evaluate(() => window.motionResult) : null;
      if (motion) expect(motionResult.interrupted).toContain("interrupted");
      expect(errors).toEqual([]);
      await writeFile(`${evidence}/device-loss-${strict}-${motion}.json`, JSON.stringify({
        delivery: "actual device.lost after explicit destruction; not a physical GPU reset",
        reactBuild: strict ? "development StrictMode" : "production-profiling",
        before, delivered, recovered, reentered, repeatedLosses, final, motionResult, errors,
      }, null, 2));
    });
  }
}

// The queue fence never resolves (`pending`) or rejects (`rejected`) on a healthy device. The engine
// cannot be proven idle, so resources stay as pending cleanup instead of being torn down, lifecycle
// calls are refused, and only an actual device loss releases them.
for (const fence of ["pending", "rejected"]) {
  test(`healthy ${fence} fence retains resources until actual loss instead of unsafe teardown`, async ({ page }) => {
    await ready(page);
    await page.evaluate(fence => {
      const device = document.querySelector("#gpu-output").getContext("webgpu").getConfiguration().device;
      window.fenceDevice = device;
      device.queue.onSubmittedWorkDone = () => fence === "pending" ? new Promise(() => {}) : Promise.reject(new Error("Injected healthy fence rejection"));
    }, fence);
    const retained = await page.evaluate(() => window.surfaceProbe.disable());
    expect(retained.mode).toBe("dom");
    expect(retained.resources.engines).toBe(1);
    expect(retained.resources.pendingCleanups).toBe(1);
    expect(retained.metrics.deviceLosses).toHaveLength(0);
    expect(retained.metrics.fenceOutcomes.at(-1).kind).toBe(fence === "pending" ? "timeout" : "rejected");
    await expect(page.evaluate(() => window.surfaceProbe.enable())).rejects.toThrow("GPU cleanup pending");
    await expect(page.evaluate(() => window.surfaceProbe.dispose())).rejects.toThrow("GPU cleanup pending");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    const delivery = await page.evaluate(async () => {
      window.fenceDevice.destroy();
      const info = await window.fenceDevice.lost;
      return { reason: info.reason, message: info.message };
    });
    await page.waitForFunction(() => window.surfaceProbe.state().resources.pendingCleanups === 0);
    const cleaned = await page.evaluate(() => window.surfaceProbe.state());
    expect(cleaned.resources.engines).toBe(0);
    expect(cleaned.metrics.deviceLosses).toHaveLength(1);
    expect(cleaned.metrics.fenceOutcomes.at(-1).kind).toBe("device-lost");
    const reentered = await page.evaluate(() => window.surfaceProbe.enable());
    expect(reentered.mode).toBe("gpu");
    const final = await page.evaluate(() => window.surfaceProbe.dispose());
    expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
    await writeFile(`${evidence}/synthetic-fence-${fence}.json`, JSON.stringify({
      syntheticFault: `Healthy queue fence ${fence}; subsequent device destruction is real`,
      retained, delivery, cleaned, reentered, final,
    }, null, 2));
  });
}

// A slow but successful fence: pending cleanup is released on completion, outcome is "completed", and
// no device loss is recorded.
test("healthy delayed fence completion releases retained resources without inventing a device loss", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const queue = document.querySelector("#gpu-output").getContext("webgpu").getConfiguration().device.queue;
    const original = queue.onSubmittedWorkDone.bind(queue);
    queue.onSubmittedWorkDone = () => original().then(() => new Promise(resolve => { window.releaseHealthyFence = resolve; }));
  });
  const retained = await page.evaluate(() => window.surfaceProbe.disable());
  expect(retained.resources.pendingCleanups).toBe(1);
  expect(retained.metrics.deviceLosses).toHaveLength(0);
  await page.evaluate(() => window.releaseHealthyFence());
  await page.waitForFunction(() => window.surfaceProbe.state().resources.pendingCleanups === 0);
  const cleaned = await page.evaluate(() => window.surfaceProbe.state());
  expect(cleaned.resources.engines).toBe(0);
  expect(cleaned.metrics.fenceOutcomes.at(-1).kind).toBe("completed");
  const reentered = await page.evaluate(() => window.surfaceProbe.enable());
  await page.waitForTimeout(100);
  expect(reentered.mode).toBe("gpu");
  expect((await page.evaluate(() => window.surfaceProbe.state())).metrics.deviceLosses).toHaveLength(0);
  const final = await page.evaluate(() => window.surfaceProbe.dispose());
  expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
  await writeFile(`${evidence}/synthetic-healthy-delayed-fence.json`, JSON.stringify({
    syntheticFault: "Artificial CPU delay after actual healthy queue fence completion; no device loss",
    retained, cleaned, reentered, final,
  }, null, 2));
});

// The device is destroyed during admission: the paint request is held until the loss is delivered.
// Admission must fail to usable DOM and record the loss as during admission. Then queued
// enable/disable/enable are serialized: disable cancels the still-queued first enable, and the last
// enable admits.
test("actual destruction during admission recovers and queued lifecycle requests stay serial", async ({ page }) => {
  await page.goto("/surface.html?dom");
  await page.waitForFunction(() => window.surfaceProbe && document.querySelector("#controlled"));
  await edit(page, "controlled", "admission-kept");
  await page.evaluate(() => {
    // Paint requests and events belong to the owning output canvas.
    const host = document.querySelector("#gpu-output");
    const requestPaint = host.requestPaint.bind(host);
    const add = host.addEventListener.bind(host);
    const remove = host.removeEventListener.bind(host);
    const gated = new Map();
    let delivered = false;
    host.addEventListener = (type, listener, options) => {
      if (type !== "paint") return add(type, listener, options);
      const wrapped = event => {
        if (!delivered) return;
        if (typeof options === "object" && options.once) remove(type, wrapped, options);
        if (typeof listener === "function") listener.call(host, event);
        else listener.handleEvent(event);
      };
      gated.set(listener, wrapped);
      add(type, wrapped, typeof options === "object" ? { ...options, once: false } : options);
    };
    host.removeEventListener = (type, listener, options) => {
      remove(type, gated.get(listener) ?? listener, options);
      gated.delete(listener);
    };
    host.requestPaint = () => {
      const configuration = document.querySelector("#gpu-output").getContext("webgpu").getConfiguration();
      if (!configuration) throw new Error("Test fixture requires a configured WebGPU device");
      configuration.device.destroy();
      void configuration.device.lost.then(() => { delivered = true; requestPaint(); });
    };
    window.restorePaint = () => { host.requestPaint = requestPaint; host.addEventListener = add; host.removeEventListener = remove; };
  });
  const failed = await page.evaluate(() => window.surfaceProbe.enable());
  expect(failed.mode).toBe("dom");
  expect(failed.controlled).toBe("admission-kept");
  expect(failed.resources.engines).toBe(0);
  expect(failed.metrics.deviceLosses[0].duringAdmission).toBe(true);
  await page.evaluate(() => window.restorePaint());
  const results = await page.evaluate(() => Promise.all([
    window.surfaceProbe.enable(), window.surfaceProbe.disable(), window.surfaceProbe.enable(),
  ]));
  // Documented contract: an explicit disable cancels a still-queued admission intent;
  // the later enable is serialized after it and admits.
  expect(results.map(state => state.mode)).toEqual(["dom", "dom", "gpu"]);
  expect(results.map(state => state.resources.engines)).toEqual([0, 0, 1]);
  await page.waitForTimeout(100);
  expect((await page.evaluate(() => window.surfaceProbe.state())).mode).toBe("gpu");
  const final = await page.evaluate(() => window.surfaceProbe.dispose());
  expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
  await writeFile(`${evidence}/admission-loss-and-serialization.json`, JSON.stringify({
    fixture: "Actual configured-device destruction/loss delivery; synthetic gating of admission paint until loss delivery",
    failed, results, final,
  }, null, 2));
});

// `createMountBoundary` (imported from the dev server source) must reject disconnected, foreign
// document, shared canvas, nested and non-empty hosts before calling `mount`, without changing the DOM.
test("mount boundary guards reject invalid ownership/topology before mounting", async ({ page }) => {
  await page.goto(`${developmentURL}/surface.html?dom`);
  await page.waitForFunction(() => window.surfaceProbe && document.querySelector("#count"));
  const result = await page.evaluate(async () => {
    const { createMountBoundary } = await import("/src/mount-boundary.ts");
    const reports = [];
    for (const fault of ["disconnected", "foreign-document", "same-canvas", "nested", "nonempty"]) {
      const frame = document.createElement("div");
      const captureHost = document.createElement("canvas");
      const outputCanvas = document.createElement("canvas");
      const ordinaryHost = document.createElement("div");
      frame.append(captureHost, outputCanvas, ordinaryHost);
      document.body.append(frame);
      let mounts = 0;
      const options = { captureHost, outputCanvas, ordinaryHost, mount: () => { mounts++; return () => {}; } };
      if (fault === "disconnected") captureHost.remove();
      if (fault === "foreign-document") options.captureHost = document.implementation.createHTMLDocument().createElement("canvas");
      if (fault === "same-canvas") options.outputCanvas = captureHost;
      if (fault === "nested") ordinaryHost.append(captureHost);
      if (fault === "nonempty") ordinaryHost.textContent = "Existing original content";
      const original = ordinaryHost.innerHTML;
      try { createMountBoundary(options); reports.push({ fault, accepted: true }); }
      catch (error) { reports.push({ fault, error: String(error), mounts, unchanged: ordinaryHost.innerHTML === original }); }
      finally { frame.remove(); }
    }
    return reports;
  });
  for (const report of result) {
    expect(report.accepted).not.toBe(true);
    expect(report.mounts).toBe(0);
    expect(report.unchanged).toBe(true);
    expect(report.error).toContain("Mount boundary requires");
  }
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  const final = await page.evaluate(() => window.surfaceProbe.dispose());
  expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
  await writeFile(`${evidence}/mount-boundary-rejections.json`, JSON.stringify({ result, final }, null, 2));
});

// Delay delivery of the first device's `lost` promise until after a replacement engine is active:
// a stale loss from the old generation must not tear down the replacement.
test("late old-generation loss delivery cannot tear down a replacement engine", async ({ page }) => {
  await page.goto("/surface.html?dom");
  await page.waitForFunction(() => window.surfaceProbe && document.querySelector("#count"));
  await page.evaluate(() => {
    const context = document.querySelector("#gpu-output").getContext("webgpu");
    const original = context.getConfiguration.bind(context);
    let wrapped = false;
    context.getConfiguration = () => {
      const configuration = original();
      if (configuration && !wrapped) {
        wrapped = true;
        const actualLoss = configuration.device.lost;
        Object.defineProperty(configuration.device, "lost", {
          value: actualLoss.then(info => new Promise(resolve => { window.deliverOldLoss = () => resolve(info); })),
        });
      }
      return configuration;
    };
  });
  const first = await page.evaluate(() => window.surfaceProbe.enable());
  expect(first.mode).toBe("gpu");
  const disabled = await page.evaluate(() => window.surfaceProbe.disable());
  expect(disabled.resources.engines).toBe(0);
  await page.waitForFunction(() => typeof window.deliverOldLoss === "function");
  const replacement = await page.evaluate(() => window.surfaceProbe.enable());
  expect(replacement.mode).toBe("gpu");
  await page.evaluate(() => window.deliverOldLoss());
  await page.waitForTimeout(100);
  const afterLateDelivery = await page.evaluate(() => window.surfaceProbe.state());
  expect(afterLateDelivery.mode).toBe("gpu");
  expect(afterLateDelivery.resources.engines).toBe(1);
  expect(afterLateDelivery.resources.lossObservers).toBe(1);
  expect(afterLateDelivery.metrics.deviceLosses).toHaveLength(0);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  const final = await page.evaluate(() => window.surfaceProbe.dispose());
  expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
  await writeFile(`${evidence}/synthetic-late-generation-loss.json`, JSON.stringify({
    syntheticFault: "Delayed delivery of the actual old device loss caused by intentional engine disposal",
    first, disabled, replacement, afterLateDelivery, final,
  }, null, 2));
});

// Out-of-range `frames` arguments throw; after dispose(), enable() and frames() throw while dispose()
// stays idempotent.
test("invalid motion and disposed lifecycle calls fail explicitly without mutating the specimen", async ({ page }) => {
  await ready(page);
  for (const args of [[0, 40, 1], [301, 40, 1], [1.5, 40, 1], [1, 101, 1], [1, 40, 2], [1, null, 1]]) {
    const error = await page.evaluate(async args => {
      try { await window.surfaceProbe.frames(...args); return null; }
      catch (error) { return String(error); }
    }, args);
    expect(error).toContain("Invalid bounded GPU-frame parameters");
  }
  const final = await page.evaluate(() => window.surfaceProbe.dispose());
  await expect(page.evaluate(() => window.surfaceProbe.enable())).rejects.toThrow("disposed");
  await expect(page.evaluate(() => window.surfaceProbe.frames(1))).rejects.toThrow("idle active GPU surface");
  expect((await page.evaluate(() => window.surfaceProbe.dispose())).resources).toEqual(final.resources);
});

// Capture throws and, in a microtask, disposal is requested: queued recovery from the failure must not
// undo the final disposal.
test("queued capture-failure recovery cannot undo final disposal", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    GPUQueue.prototype.drawElementImageToTexture = () => {
      queueMicrotask(() => {
        void window.surfaceProbe.dispose().then(result => { window.raceDisposed = result; });
      });
      throw new Error("Injected capture failure concurrent with disposal");
    };
  });
  await page.locator("#count").click();
  await page.waitForFunction(() => window.raceDisposed);
  await page.waitForTimeout(100);
  const final = await page.evaluate(() => window.surfaceProbe.state());
  expect(final.mode).toBe("disposed");
  expect(final.reason).toContain("Disposed root");
  expect(Object.values(final.resources).every(value => value === 0)).toBe(true);
  expect(await page.locator(".app-container").count()).toBe(0);
  await writeFile(`${evidence}/synthetic-capture-disposal-race.json`, JSON.stringify({
    syntheticFault: "Capture exception queues disposal before automatic capture-failure recovery",
    final,
  }, null, 2));
});
