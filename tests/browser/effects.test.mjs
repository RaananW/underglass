/**
 * Browser suite for decorative GPU effects (ripple, chromatic, dissolve and a custom WGSL effect) on
 * `effects.html` (`window.effectsProbe`, from `examples/playground/src/demo/effects-demo.tsx`). Pixels are
 * decoded from `#frame` screenshots of the owning GPU canvas. The suite proves that effects are deterministic
 * (zero-parameter identity, time, alpha, order, bounds), that they run as GPU-only work (300 frames without
 * React commits, captures, uploads or readbacks), that invalid chains are refused atomically, that handles and
 * descriptors behave as documented, and that failures (shader compile errors, pipeline validation, device loss,
 * pending fences, HMR) fall back to the same usable original DOM with a diagnosed reason and no leaked
 * resources. Tests with `strict` run on the Vite dev server (React StrictMode); the rest use the preview build.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
import { developmentURL } from "../helpers/urls.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
// One blended effect pass per enrolled layer (panel, art) plus the background clear pass.
const EFFECT_PASSES = 3;

// Evidence directory for JSON reports and screenshots.
const directory = evidenceDirectory("effects");
async function save(name, value) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2));
}
/**
 * Opens `effects.html` (dev server with `?strict` when `strict`; `?dom` skips the automatic enable), waits for
 * GPU, lets it settle for 300 ms, and cancels the page's default effect so tests start from neutral pixels.
 */
async function ready(page, strict = false, dom = false) {
  await page.goto(`${strict ? developmentURL : ""}/effects.html?${strict ? "strict&" : ""}${dom ? "dom" : ""}`);
  await page.waitForFunction(() => window.effectsProbe && !window.effectsProbe.state().initializing);
  if (!dom) await page.waitForFunction(() => window.effectsProbe.state().mode === "gpu");
  await page.waitForTimeout(300);
  await page.evaluate(async () => { window.effectsProbe.handle().cancel(); await window.effectsProbe.controller().settle(); });
}
/** Settles pending GPU work, then screenshots `#frame` (saved as evidence) and returns the decoded PNG. */
async function pixels(page, name) {
  await page.evaluate(() => window.effectsProbe.controller().settle());
  await mkdir(directory, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
}
/** Copies the RGBA bytes of a rectangle (frame pixels) so regions can be compared with `changed`. */
function region(png, x, y, width, height) {
  const result = [];
  for (let row = y; row < y + height; row++) result.push(...png.data.subarray((row * png.width + x) * 4, (row * png.width + x + width) * 4));
  return Buffer.from(result);
}
/** Counts the bytes that differ between two equal-length buffers. */
function changed(a, b) { return a.reduce((sum, value, index) => sum + (value !== b[index] ? 1 : 0), 0); }
/** SHA-256 hex digest, recorded in the evidence instead of the full pixel data. */
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
/** Asserts that disposal left no GPU, runtime or demo-listener resources. */
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
  expect(state.demoListeners).toBe(0);
}

// Regions of the 640-wide frame: the essential panel (24,30 260x330) and the decorated art (330,50 240x260),
// separated by a white gap. For each effect: zero parameters leave the pixels byte-identical to neutral;
// two times give different art pixels; the panel and the gap never change (bounds). Then full dissolve is
// fully transparent, effect order matters, and native edits and a dialog still work.
for (const strict of [false, true]) test(`decoded effect identity, time, alpha, order, bounds and original native app strict=${strict}`, async ({ page }) => {
  await ready(page, strict);
  const neutral = await pixels(page, `neutral-${strict}`);
  const essential = region(neutral, 24, 30, 260, 330);
  const art = region(neutral, 330, 50, 240, 260);
  const results = [];
  for (const kind of ["ripple", "chromatic", "dissolve", "custom"]) {
    await page.evaluate(kind => {
      const descriptor = window.effectsProbe.descriptor(kind);
      // Zero every parameter to build an identity version of the effect.
      for (const key of Object.keys(descriptor.parameters)) descriptor.parameters[key] = 0;
      window.effectsProbe.apply([descriptor]);
    }, kind);
    expect(changed((await pixels(page, `${kind}-identity-${strict}`)).data, neutral.data)).toBe(0);
    const images = [];
    for (const seconds of [.2, .9]) {
      await page.evaluate(({ kind, seconds }) => window.effectsProbe.apply([window.effectsProbe.descriptor(kind, seconds)]), { kind, seconds });
      const png = await pixels(page, `${kind}-${seconds}-${strict}`);
      // Effects on the art layer must not leak into the panel or into the gap between them.
      expect(region(png, 24, 30, 260, 330)).toEqual(essential);
      expect(region(png, 320, 40, 10, 280).every(value => value === 255)).toBe(true);
      const bytes = region(png, 330, 50, 240, 260);
      // The art must visibly change (more than 500 bytes), and differ between the two times.
      expect(changed(bytes, art)).toBeGreaterThan(500);
      images.push(bytes);
    }
    expect(changed(images[0], images[1])).toBeGreaterThan(500);
    results.push({ kind, hashes: images.map(hash), distinctBytes: changed(images[0], images[1]), essentialSha256: hash(essential) });
  }
  await page.evaluate(() => {
    // Dissolve at amount 1 removes the art entirely, leaving the white frame (alpha handling).
    const value = window.effectsProbe.descriptor("dissolve"); value.parameters.amount = 1;
    window.effectsProbe.apply([value]);
  });
  expect(region(await pixels(page, `transparent-${strict}`), 330, 50, 240, 260).every(value => value === 255)).toBe(true);
  // The same effects in a different order must give different pixels (the chain is applied in sequence).
  const orders = [];
  for (const kinds of [["ripple", "chromatic", "dissolve"], ["chromatic", "ripple", "dissolve"]]) {
    await page.evaluate(kinds => window.effectsProbe.apply(kinds.map(kind => window.effectsProbe.descriptor(kind, .7))), kinds);
    orders.push(region(await pixels(page, `order-${kinds[0]}-${strict}`), 330, 50, 240, 260));
  }
  expect(changed(orders[0], orders[1])).toBeGreaterThan(100);
  // Same for colour-changing effects (custom and dissolve).
  const colorOrders = [];
  for (const kinds of [["custom", "dissolve"], ["dissolve", "custom"]]) {
    await page.evaluate(kinds => window.effectsProbe.apply(kinds.map(kind => window.effectsProbe.descriptor(kind, .7))), kinds);
    colorOrders.push(region(await pixels(page, `color-order-${kinds[0]}-${strict}`), 330, 50, 240, 260));
  }
  expect(changed(colorOrders[0], colorOrders[1])).toBeGreaterThan(100);
  // Native keyboard editing and a native dialog still work on the original controls, and the edited text shows
  // up in the captured pixels (region 330,220 240x60).
  await page.locator("#title").click();
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("Native changed poster"); await page.keyboard.press("Enter");
  await expect(page.locator("#saved")).toHaveText("Native changed poster");
  await page.locator("#dialog-open").click(); await expect(page.locator("#dialog-input")).toBeFocused();
  await page.keyboard.type(" original"); await page.keyboard.press("Escape"); await expect(page.locator("#dialog-open")).toBeFocused();
  await page.locator("h1").click();
  const changedPixels = await pixels(page, `content-${strict}`);
  expect(changed(region(changedPixels, 330, 220, 240, 60), region(neutral, 330, 220, 240, 60))).toBeGreaterThan(50);
  const state = await page.evaluate(() => window.effectsProbe.state());
  expect(state.reactVersion).toBe(process.env.CANVAS_EXPECT_REACT_VERSION ?? "19.3.1");
  expect(state.resources.engines).toBe(1); expect(state.resources.effects).toBe(EFFECT_PASSES);
  // The single admission recorded GPU probe pixels and no native pixels.
  expect(state.metrics.admission.last.nativePixels).toEqual([]);
  expect(state.metrics.admission.last.gpuPixels).toHaveLength(2);
  const compileSamples = await page.evaluate(() => window.effectsProbe.samples().filter(sample => sample.kind === "effectCompileMs"));
  // Exactly one `effectCompileMs` sample is expected for the whole run.
  expect(compileSamples).toHaveLength(1);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save(`pixels-${strict}`, { results, orderHashes: orders.map(hash), orderDistinctBytes: changed(...orders),
    colorOrderHashes: colorOrders.map(hash), colorOrderDistinctBytes: changed(...colorOrders), compileSamples, state, disposed });
});

for (const strict of [false, true]) test(`300 real GPU frames, incremental non-equivalent work and content update strict=${strict}`, async ({ page }) => {
  test.setTimeout(120000);
  await ready(page, strict);
  // For neutral and each effect, advance 300 frames: they must all be GPU frames with no commit, capture, copy,
  // readback or upload, no re-admission and no new shader compilation.
  const intervals = [];
  for (const kind of ["neutral", "ripple", "chromatic", "dissolve", "custom"]) {
    await page.evaluate(kind => {
      window.effectsProbe.handle().cancel();
      if (kind !== "neutral") window.effectsProbe.apply([window.effectsProbe.descriptor(kind)]);
    }, kind);
    await page.waitForTimeout(300);
    const interval = await page.evaluate(async () => {
      const probe = window.effectsProbe;
      await probe.controller().settle(); probe.clearSamples();
      const commitsBefore = probe.state().commits.count;
      const interval = await probe.controller().advance(300);
      return { ...interval, commitsBefore, commitsAfter: probe.state().commits.count, samples: probe.samples() };
    });
    for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(interval.after.metrics[key]).toBe(interval.before.metrics[key]);
    expect(interval.commitsAfter).toBe(interval.commitsBefore);
    expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBe(300);
    expect(interval.after.metrics.admission).toEqual(interval.before.metrics.admission);
    expect(interval.after.metrics.effectShaderCompilations).toBe(interval.before.metrics.effectShaderCompilations);
    expect(interval.after.resources.effects).toBe(EFFECT_PASSES);
    intervals.push({ kind, ...interval });
  }
  // Declarative motion on top of two playing effects: another 300 real animation frames must again need no
  // commits, captures or uploads.
  const motion = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    probe.apply([probe.descriptor("ripple", 0, true), probe.descriptor("custom", 0, true)]);
    const transition = probe.controller().transition("art", { keyframes: [{ offset: 0 }, { offset: 1, x: 15 }], timing: { duration: 60000 } });
    await new Promise(resolve => setTimeout(resolve, 300)); await probe.controller().settle();
    const before = probe.state();
    for (let i = 0; i < 300; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const after = probe.state(); transition.cancel(); probe.handle().pause();
    return { before, after, result: await transition.finished };
  });
  for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(motion.after.metrics[key]).toBe(motion.before.metrics[key]);
  expect(motion.after.commits.count).toBe(motion.before.commits.count);
  expect(motion.after.metrics.gpuFrames - motion.before.metrics.gpuFrames).toBeGreaterThanOrEqual(300);
  expect(motion.after.metrics.admission).toEqual(motion.before.metrics.admission);
  const before = await pixels(page, `before-update-${strict}`);
  // A real content update must reach the canvas as changed pixels.
  await page.evaluate(() => window.effectsProbe.update("Changed captured content"));
  await page.waitForTimeout(200);
  const after = await pixels(page, `after-update-${strict}`);
  expect(changed(before.data, after.data)).toBeGreaterThan(50);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save(`independence-${strict}`, { claim: "Added non-equivalent effect work, not a DOM speedup; public CPU frame samples, GPU timestamps unavailable",
    intervals, motion, contentChangedBytes: changed(before.data, after.data), disposed });
});

// Five invalid operations (out-of-range parameter, a colour effect (dissolve) placed before a sampling effect (ripple), an effect on `panel`, a tampered custom
// definition, a non-finite seek) must each throw without changing any state. A descriptor is copied when
// applied, so mutating it later has no effect. Applying a new chain replaces the previous handle (`replaced`);
// using the stale handle throws.
test("whole-chain atomic refusal, immutable descriptors and precise stale-handle replacement", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    const first = probe.apply([probe.descriptor("ripple", .5)]);
    const before = probe.state();
    const failures = [];
    const bad = probe.descriptor("dissolve"); bad.parameters.amount = 2;
    for (const operation of [
      () => probe.apply([probe.descriptor("chromatic"), bad]),
      () => probe.apply([probe.descriptor("dissolve"), probe.descriptor("ripple")]),
      () => probe.controller().setEffects("panel", [probe.descriptor("ripple")]),
      () => probe.apply([{ ...probe.descriptor("custom"), definition: { ...probe.descriptor("custom").definition } }]),
      () => first.seek(Infinity),
    ]) { try { operation(); } catch (error) { failures.push(String(error)); } }
    const refused = probe.state();
    const descriptor = probe.descriptor("chromatic", .7);
    const next = probe.apply([descriptor]); descriptor.parameters.displacement = 100;
    first.cancel(); first.dispose();
    const current = next.state(); current.effects[0].parameters.displacement = 99;
    next.seek(.9); next.play(); next.pause();
    let stale; try { first.play(); } catch (error) { stale = String(error); }
    next.cancel(); next.dispose();
    return { before, refused, failures, first: await first.finished, next: await next.finished, immutable: current, nextState: next.state(), stale };
  });
  expect(result.failures).toHaveLength(5);
  expect(result.refused.decorativeEffects).toEqual(result.before.decorativeEffects);
  expect(result.refused.runtimeResources).toEqual(result.before.runtimeResources);
  expect(result.first.status).toBe("replaced"); expect(result.next.status).toBe("cancelled");
  expect(result.nextState.effects[0].parameters.displacement).toBe(8);
  expect(result.stale).toContain("no longer active");
  zero(await page.evaluate(() => window.effectsProbe.dispose()));
  await save("atomic-handles", result);
});

// Reduced motion keeps GPU but pins effects at identity and refuses `play()`. A synthetic `document.hidden`
// pauses effect time and frames. Forced colors must not revoke GPU. The shader is compiled only once.
test("reduced motion identity, synthetic visibility pause and forced-color GPU ownership", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const neutral = await pixels(page, "media-neutral");
  const initial = await page.evaluate(() => window.effectsProbe.state());
  expect(initial.metrics.effectShaderCompilations).toBe(1);
  const reduced = await page.evaluate(() => {
    const probe = window.effectsProbe; const handle = probe.apply([probe.descriptor("dissolve", .7, true)]);
    let error; try { handle.play(); } catch (value) { error = String(value); }
    return { state: handle.state(), error };
  });
  expect(reduced.state.effects[0].time.playing).toBe(false);
  expect(reduced.error).toContain("reduced motion");
  expect(changed((await pixels(page, "reduced-identity")).data, neutral.data)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => window.effectsProbe.apply([window.effectsProbe.descriptor("custom", .7)]));
  expect(changed((await pixels(page, "media-custom-resumed")).data, neutral.data)).toBeGreaterThan(500);
  expect((await page.evaluate(() => window.effectsProbe.state())).metrics.effectShaderCompilations).toBe(1);
  await page.evaluate(() => {
    window.effectsProbe.handle().play();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenBefore = await page.evaluate(() => window.effectsProbe.state());
  await page.waitForTimeout(200);
  const hiddenAfter = await page.evaluate(() => window.effectsProbe.state());
  expect(hiddenAfter.decorativeEffects).toEqual(hiddenBefore.decorativeEffects);
  expect(hiddenAfter.metrics.gpuFrames).toBe(hiddenBefore.metrics.gpuFrames);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await page.emulateMedia({ forcedColors: "active" });
  await page.evaluate(() => window.effectsProbe.controller().settle());
  const result = await page.evaluate(() => ({ mode: window.effectsProbe.state().mode, handle: window.effectsProbe.handle().state() }));
  expect(result.mode).toBe("gpu");
  await page.locator("#title").fill("Usable DOM"); await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("Usable DOM");
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("media", { initial, reduced, fixture: "Synthetic hidden getter/event, not real background throttling", hiddenBefore, hiddenAfter, result, disposed });
});

// A custom effect whose WGSL fails to compile is a diagnosed GPU failure: the output is hidden, the handle
// reports `fallback`, the original controls are untouched, and a later valid compile is admitted again.
test("trusted custom compiler failure has hidden output, usable original DOM and safe reentry", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    window.originalTitle = document.querySelector("#title");
    const failed = await window.effectsProbe.compile("return definitely_invalid_wgsl;");
    return { failed, handle: await window.effectsProbe.handle().finished, original: window.originalTitle === document.querySelector("#title"), hidden: document.querySelector("#output").hidden };
  });
  expect(result.failed.mode).toBe("dom"); expect(result.failed.reason).toContain("compilation failed");
  expect(result.original && result.hidden).toBe(true); expect(result.handle.status).toBe("fallback");
  expect(result.failed.resources.engines).toBe(0); expect(result.failed.resources.effects).toBe(0);
  await page.locator("#title").fill("After compiler failure"); await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("After compiler failure");
  const passed = await page.evaluate(() => window.effectsProbe.compile("return color;"));
  expect(passed.mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("compiler-failure", { ...result, passed, disposed });
});

// Three fixtures: (1) without `navigator.gpu`, applying a custom effect throws and leaves existing state
// alone; (2) a synthetic pipeline validation error from `popErrorScope` falls back to DOM; (3) the art element
// is resized during the first application so its content extends beyond the enrolled capture bounds, which is
// also a diagnosed fallback. Handles are retired on dispose.
test("unsupported capability and public pipeline validation failure preserve usable DOM and retire handles", async ({ page }) => {
  await ready(page);
  const capability = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    await probe.controller().disable();
    const handle = probe.apply([probe.descriptor("ripple", .5)]);
    const before = probe.state();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    let error;
    try { probe.apply([probe.descriptor("custom")]); } catch (value) { error = String(value); }
    delete navigator.gpu;
    return { before, after: probe.state(), active: handle.state().active, error };
  });
  expect(capability.error).toContain("requires WebGPU");
  expect(capability.active).toBe(true);
  expect(capability.after.decorativeEffects).toEqual(capability.before.decorativeEffects);
  const pipeline = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    probe.apply([probe.descriptor("custom")]);
    const original = GPUDevice.prototype.popErrorScope;
    let calls = 0;
    GPUDevice.prototype.popErrorScope = async function () {
      const result = await original.call(this);
      return ++calls === 2 ? new GPUValidationError("Synthetic first application pipeline validation failure") : result;
    };
    try {
      const state = await probe.controller().enable();
      return { state, result: await probe.handle().finished, hidden: document.querySelector("#output").hidden };
    } finally { GPUDevice.prototype.popErrorScope = original; }
  });
  expect(pipeline.state.mode).toBe("dom"); expect(pipeline.hidden).toBe(true);
  expect(pipeline.state.reason).toContain("pipeline validation failure");
  expect(pipeline.result.status).toBe("fallback");
  expect(pipeline.state.resources.engines).toBe(0);
  await page.locator("#title").fill("After pipeline failure");
  await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("After pipeline failure");
  const lateGeometry = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    probe.apply([probe.descriptor("custom")]);
    const original = GPUDevice.prototype.popErrorScope;
    let calls = 0;
    GPUDevice.prototype.popErrorScope = async function () {
      const result = await original.call(this);
      if (++calls === 2) document.querySelector("#art").style.width = "200px";
      return result;
    };
    try {
      const state = await probe.controller().enable();
      return { state, result: probe.handle().state(), hidden: document.querySelector("#output").hidden };
    } finally {
      GPUDevice.prototype.popErrorScope = original;
      document.querySelector("#art").style.removeProperty("width");
    }
  });
  expect(lateGeometry.state.mode).toBe("dom"); expect(lateGeometry.hidden).toBe(true);
  expect(lateGeometry.state.reason).toContain("Content extends beyond enrolled capture bounds");
  expect(lateGeometry.result.active).toBe(false);
  await page.evaluate(() => window.effectsProbe.compile("return color;"));
  const retirement = await page.evaluate(async () => {
    const handle = window.effectsProbe.handle();
    const disposed = await window.effectsProbe.dispose();
    return { disposed, result: await handle.finished };
  });
  expect(retirement.result.status).toBe("disposed"); zero(retirement.disposed);
  await save("capability-pipeline", { fixture: "Synthetic missing navigator capability, public error-scope failure and late geometry mutation; genuine WGSL failure tested separately", capability, pipeline, lateGeometry, retirement });
});

// Destroying the configured device falls back to DOM. Then twenty StrictMode lifetimes release everything,
// and touching the source file triggers a real Vite HMR whose old probe must be fully retired.
test("effects retire through public device loss, twenty StrictMode lifetimes and real HMR", async ({ page }) => {
  test.setTimeout(120000);
  await ready(page, true);
  const loss = await page.evaluate(async () => {
    window.effectsProbe.apply([window.effectsProbe.descriptor("custom", .4, true)]);
    window.originalTitle = document.querySelector("#title");
    document.querySelector("#output").getContext("webgpu").getConfiguration().device.destroy();
    await new Promise(resolve => setTimeout(resolve, 400));
    return { state: window.effectsProbe.state(), result: await window.effectsProbe.handle().finished, original: window.originalTitle === document.querySelector("#title") };
  });

  expect(loss.state.mode).toBe("dom"); expect(loss.result.status).toBe("fallback"); expect(loss.original).toBe(true);
  const cycles = [];
  for (let i = 0; i < 20; i++) {
    const cycle = await page.evaluate(() => window.effectsProbe.cycle()); zero(cycle.retired);
    expect(cycle.active.resources.effects).toBe(EFFECT_PASSES); expect(cycle.active.runtimeResources.decorativeEffects).toBe(1); cycles.push(cycle);
  }
  const old = await page.evaluate(() => { window.oldEffectsProbe = window.effectsProbe; return window.effectsProbe.state(); });
  const path = "examples/playground/src/demo/effects-demo.tsx";
  const before = await stat(path);
  try {
    // Updating the modification time makes the dev server hot-replace the module; the original times are
    // restored afterwards.
    await utimes(path, new Date(), new Date());
    await page.waitForFunction(() => window.oldEffectsProbe !== window.effectsProbe);
    await page.waitForFunction(() => window.effectsProbe.state().mode === "gpu");
    zero(await page.evaluate(() => window.oldEffectsProbe.state()));
  } finally { await utimes(path, before.atime, before.mtime); }
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("loss-hmr-retirement", { fixture: "Public configured-device destruction, not physical reset", loss, cycles, old, disposed });
});

// A delayed queue fence stands in for slow GPU work. A disable during the delay falls back to DOM but keeps
// the healthy engine (no device loss) until the fence is released; new effect work and dispose are refused
// meanwhile.
test("custom effects preserve a healthy pending fence until real completion without device destruction", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const probe = window.effectsProbe; probe.apply([probe.descriptor("custom", .8, true)]);
    window.device = document.querySelector("#output").getContext("webgpu").getConfiguration().device;
    const original = window.device.queue.onSubmittedWorkDone.bind(window.device.queue);
    window.releaseFence = undefined;
    window.device.queue.onSubmittedWorkDone = () => new Promise(resolve => { window.releaseFence = () => { window.device.queue.onSubmittedWorkDone = original; original().then(resolve); }; });
  });
  const retained = await page.evaluate(() => window.effectsProbe.controller().disable());
  expect(retained.resources.pendingCleanups).toBe(1); expect(retained.resources.engines).toBe(1); expect(retained.metrics.deviceLossCount).toBe(0);
  expect((await page.evaluate(() => window.effectsProbe.handle().finished)).status).toBe("fallback");
  const failures = await page.evaluate(async () => {
    const errors = [];
    for (const operation of [() => window.effectsProbe.apply([window.effectsProbe.descriptor("ripple")]), () => window.effectsProbe.dispose()]) {
      try { await operation(); } catch (error) { errors.push(String(error)); }
    }
    return errors;
  });
  expect(failures).toHaveLength(2);
  await page.locator("#title").fill("Healthy retained DOM");
  await page.evaluate(() => window.releaseFence());
  await page.waitForFunction(() => window.effectsProbe.state().resources.pendingCleanups === 0);
  const released = await page.evaluate(() => window.effectsProbe.state());
  expect(released.resources.engines).toBe(0); expect(released.metrics.deviceLossCount).toBe(0);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("healthy-fence", { fixture: "Synthetic delayed public fence; released by genuine queue completion, no destroy", retained, failures, released, disposed });
});

// Replacing the custom WGSL while GPU presents recompiles one shader without a new admission and changes
// pixels in the art. An invalid live definition becomes a diagnosed fallback with a usable original DOM.
test("a new custom definition compiles while GPU keeps presenting", async ({ page }) => {
  await ready(page);
  // A 40x20 box inside the art, used to check that the inverted colours are visible.
  const box = await page.evaluate(() => {
    const frame = document.querySelector("#frame").getBoundingClientRect(), art = document.querySelector("#art").getBoundingClientRect();
    return { x: Math.round(art.x - frame.x + art.width * 0.3), y: Math.round(art.y - frame.y + art.height * 0.3), width: 40, height: 20 };
  });
  const before = await pixels(page, "live-custom-before");
  const admitted = await page.evaluate(() => window.effectsProbe.state());
  // Invert colours: an obvious per-pixel change no CSS filter chain is needed to verify.
  const applied = await page.evaluate(async () => {
    window.effectsProbe.live("return vec4f(vec3f(1.0) - color.rgb, color.a);");
    const controller = window.effectsProbe.controller();
    for (let i = 0; i < 60 && (controller.state().publication.pending || controller.state().metrics.effectShaderCompilations === 0); i++) await new Promise(r => requestAnimationFrame(r));
    await controller.settle();
    return window.effectsProbe.state();
  });
  expect(applied.mode, applied.reason).toBe("gpu");
  expect(applied.metrics.admission.passes).toBe(admitted.metrics.admission.passes);
  expect(applied.metrics.effectShaderCompilations).toBe(admitted.metrics.effectShaderCompilations + 1);
  const after = await pixels(page, "live-custom-after");
  expect(changed(region(before, box.x, box.y, box.width, box.height), region(after, box.x, box.y, box.width, box.height))).toBeGreaterThan(1000);
  await page.locator("#title").fill("Live effect"); await page.locator("#save").click();
  await expect(page.locator("#saved")).toHaveText("Live effect");
  // An invalid live definition is still a diagnosed GPU failure with usable original DOM.
  const failed = await page.evaluate(async () => {
    window.effectsProbe.live("return definitely_invalid_wgsl;");
    await page_wait();
    async function page_wait() { for (let i = 0; i < 120 && window.effectsProbe.state().mode === "gpu"; i++) await new Promise(r => setTimeout(r, 25)); }
    return window.effectsProbe.state();
  });
  expect(failed.mode).toBe("dom");
  expect(failed.reason).toMatch(/compilation failed/);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("live-custom", { admitted: admitted.metrics.admission, applied: applied.metrics.effectShaderCompilations, failed: failed.reason });
});

test("transition effects run on an interactive layer: GPU stays on, content is inert, hits stay on the layer", async ({ page }) => {
  // A transition effect displaces a live layer's pixels, so its content must not take input
  // while it runs, and a click on it must not fall through to a control underneath.
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/runtime.html");
  await page.waitForFunction(() => window.runtimeProbe?.state().mode === "gpu" && !window.runtimeProbe.state().initializing);
  await page.locator("#third").click();
  await page.locator("#third-control").waitFor();
  // Put the third layer (later in DOM, so on top) exactly over the primary layer's Count button.
  await page.evaluate(async () => {
    const frame = document.querySelector("#frame").getBoundingClientRect(), count = document.querySelector("#count").getBoundingClientRect();
    window.runtimeProbe.transform("third-layer", { x: count.x - frame.x + count.width / 2 - 450, y: count.y - frame.y + count.height / 2 - 235 });
    window.transitionClicks = { third: 0 };
    document.querySelector("#third-control").addEventListener("click", () => window.transitionClicks.third++);
    await window.runtimeProbe.settle();
  });
  const frame = page.locator("#frame");
  const centre = await page.locator("#third-layer").evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const region = await page.locator("#third-layer").evaluate(node => {
    const r = node.getBoundingClientRect(), f = document.querySelector("#frame").getBoundingClientRect();
    return { x: Math.round(r.x - f.x), y: Math.round(r.y - f.y), width: Math.round(r.width), height: Math.round(r.height) };
  });
  const pixels = async name => {
    await page.evaluate(() => window.runtimeProbe.settle());
    await mkdir(directory, { recursive: true });
    const png = PNG.sync.read(await frame.screenshot({ path: `${directory}/${name}.png` }));
    return Array.from({ length: region.height * region.width }, (_, index) => {
      const x = region.x + index % region.width, y = region.y + Math.floor(index / region.width);
      return png.data.readUInt32BE((y * png.width + x) * 4);
    });
  };
  const differing = (a, b) => a.filter((value, index) => value !== b[index]).length;
  const before = await pixels("transition-before");
  const policy = { bounds: "layer", interaction: "inert", media: "identity", fallback: "static" };
  const started = await page.evaluate(policy => {
    window.transitionEffect = window.runtimeProbe.effects("third-layer", [
      { kind: "ripple", parameters: { amplitude: 6 }, time: { seconds: 0.4, playing: false }, ...policy },
      { kind: "dissolve", parameters: { amount: 0.55, speed: 0 }, time: { seconds: 0, playing: false }, ...policy }]);
    const state = window.runtimeProbe.state(), layer = document.querySelector("#third-layer");
    return { mode: state.mode, reason: state.reason, transitionEffects: state.runtimeResources.transitionEffects,
      boundaryInert: layer.inert, controlInert: document.querySelector("#third-control").inert };
  }, policy);
  expect(started.mode, started.reason).toBe("gpu");
  expect(started).toMatchObject({ transitionEffects: 1, boundaryInert: false, controlInert: true });
  const dissolving = await pixels("transition-dissolving");
  expect(differing(before, dissolving), "the effect changes the live layer pixels").toBeGreaterThan(200);
  // The click lands on the layer's own boundary: neither its control nor the Count button underneath reacts.
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, centre)).toBe("third-layer");
  const count = await page.locator("#count").innerText();
  await page.mouse.click(centre.x, centre.y);
  await page.keyboard.press("Enter");
  expect(await page.locator("#count").innerText()).toBe(count);
  expect(await page.evaluate(() => window.transitionClicks.third)).toBe(0);
  // Parameters animate per frame without recompiling.
  const revision = await page.evaluate(() => window.runtimeProbe.state().registryRevision);
  await page.evaluate(() => window.transitionEffect.update([{ amplitude: 0 }, { amount: 0.95, speed: 0 }]));
  const nearlyGone = await pixels("transition-updated");
  expect(differing(dissolving, nearlyGone)).toBeGreaterThan(200);
  expect(await page.evaluate(() => window.runtimeProbe.state().registryRevision)).toBe(revision);
  expect(await page.evaluate(() => { try { window.transitionEffect.update([{ amount: 1, speed: 0 }]); return "accepted"; } catch (error) { return String(error); } }))
    .toMatch(/one parameter set per operation/);
  // Application code making the content interactive ends the effect instead of revoking GPU.
  const broken = await page.evaluate(async () => {
    document.querySelector("#third-control").inert = false;
    const result = await window.transitionEffect.finished;
    const state = window.runtimeProbe.state();
    return { result, mode: state.mode, transitionEffects: state.runtimeResources.transitionEffects };
  });
  expect(broken).toEqual({ result: { status: "cancelled", reason: "Layer content became interactive during a transition effect" }, mode: "gpu", transitionEffects: 0 });
  // Cancelling restores the original pixels and native input.
  await page.evaluate(policy => {
    window.transitionEffect = window.runtimeProbe.effects("third-layer", [{ kind: "chromatic", parameters: { displacement: 8 }, time: { seconds: 0 }, ...policy }]);
  }, policy);
  expect(await page.locator("#third-control").evaluate(node => node.inert)).toBe(true);
  await page.evaluate(() => window.transitionEffect.cancel());
  expect(await page.evaluate(() => window.transitionEffect.finished)).toEqual({ status: "cancelled", reason: "Effect cancelled" });
  expect(differing(before, await pixels("transition-cancelled"))).toBe(0);
  const control = await page.locator("#third-control").boundingBox();
  await page.mouse.click(control.x + control.width / 2, control.y + control.height / 2);
  expect(await page.evaluate(() => window.transitionClicks.third)).toBe(1);
  // Returning to ordinary DOM ends a running transition effect and releases the content.
  const fallback = await page.evaluate(async policy => {
    const handle = window.runtimeProbe.effects("third-layer", [{ kind: "dissolve", parameters: { amount: 0.5, speed: 1 }, time: { seconds: 0, playing: true }, ...policy }]);
    await window.runtimeProbe.disable();
    return { result: await handle.finished, inert: document.querySelector("#third-control").inert };
  }, policy);
  expect(fallback).toEqual({ result: { status: "fallback", reason: "Ordinary DOM uses static original decoration" }, inert: false });
  // Decorative and transition interaction stay distinct.
  const refused = await page.evaluate(policy => {
    const failures = [];
    for (const [id, interaction] of [["third-layer", "decorative"], ["primary", "mixed"]]) {
      try {
        window.runtimeProbe.effects(id, interaction === "mixed"
          ? [{ kind: "ripple", parameters: { amplitude: 2 }, time: { seconds: 0 }, ...policy }, { kind: "dissolve", parameters: { amount: 0.2, speed: 0 }, time: { seconds: 0 }, ...policy, interaction: "decorative" }]
          : [{ kind: "ripple", parameters: { amplitude: 2 }, time: { seconds: 0 }, ...policy, interaction }]);
      } catch (error) { failures.push(String(error)); }
    }
    return failures;
  }, policy);
  expect(refused).toHaveLength(2);
  expect(refused[0]).toMatch(/decorative, inert, aria-hidden/);
  expect(refused[1]).toMatch(/share one interaction/);
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
  expect(errors).toEqual([]);
});
