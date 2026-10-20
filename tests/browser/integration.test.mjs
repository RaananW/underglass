/**
 * Browser suite for the library integration on `integration.html` (`window.integrationProbe`, from
 * `examples/playground/src/demo/integration-demo.tsx`): React `ref` enrollment of layers, `Presence` enter and
 * exit, declarative motion (`transition`, `group`), a Radix dialog in the native overlay host, and the
 * fallback and recovery paths. It proves that enrolled layers are GPU-presented with fresh pixels while the
 * original React controls keep identity, value, selection and focus; that invalid enrollments and motion are
 * refused atomically; that motion needs no React commit, capture or upload; and that device loss, HMR, missing
 * browser flags and disposal leave a usable original DOM and zero live resources. Tests marked `strict` use
 * the Vite dev server (React StrictMode); the others use the preview build. Fixed frame coordinates: the red
 * `library` layer around (55, 345), the green layer/card around (400, 200) on a 640x420 frame at DPR 1.
 */
import { chromium } from "@playwright/test";
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL, previewURL } from "../helpers/urls.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";

import { evidenceDirectory } from "../helpers/evidence.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";
// Evidence directory for JSON reports and screenshots.
const evidence = evidenceDirectory("integration");
async function save(name, data) {
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/${name}.json`, JSON.stringify(data, null, 2));
}
/**
 * Opens `integration.html` (dev server with `?strict` when `strict`; `?dom` skips the automatic enable), waits for
 * GPU unless `dom`, then waits 300 ms and drains scheduled work.
 */
async function ready(page, strict = false, dom = false) {
  await page.goto(`${strict ? developmentURL : ""}/integration.html?${strict ? "strict&" : ""}${dom ? "dom" : ""}`);
  await page.waitForFunction(() => window.integrationProbe && !window.integrationProbe.state().initializing);
  if (!dom) await page.waitForFunction(() => window.integrationProbe.state().mode === "gpu");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.integrationProbe.settle());
}
/** Asserts that disposal left no GPU, runtime or demo-listener resources. */
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
  expect(state.demoListeners).toBe(0);
}
/**
 * Screenshots `#frame` (saved as evidence) and returns the RGBA at screenshot pixel (x, y). The coordinates are
 * used as-is, so they equal CSS pixels only at DPR 1, which is what the tests using it run at.
 */
async function pixel(page, name, x = 400, y = 200) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const i = (y * png.width + x) * 4;
  return [...png.data.subarray(i, i + 4)];
}

// Three layers enrolled through refs. Admission verified two marker colours from the GPU output only. Native
// typing, Enter, selection, a Radix dialog in the overlay host (outside the captured container) and focus
// return all work on the original elements, including across an explicit disable and enable. Re-rendering
// uploads new pixels, and an authored style set on a layer (opacity .7) survives disable.
for (const strict of [false, true]) test(`ref enrollment and original Radix native semantics strict=${strict}`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, strict);
  const initial = await page.evaluate(() => {
    window.originalInput = document.querySelector("#name");
    window.originalRoot = window.originalInput.closest(".app-container");
    window.originalRefs = window.integrationProbe.refs();
    return window.integrationProbe.state();
  });
  const originalPixels = PNG.sync.read(await page.locator("#frame").screenshot());
  expect(initial.reactVersion).toBe(process.env.CANVAS_EXPECT_REACT_VERSION ?? "19.3.1");
  expect(initial.runtimeResources.enrolledLayers).toBe(3);
  expect(initial.resources.engines).toBe(1);
  expect(initial.metrics.admission.last.nativePixels).toEqual([]);
  // Marker colours read back by admission from the GPU output.
  expect(initial.metrics.admission.last.gpuPixels).toEqual([[207, 37, 83, 255], [31, 179, 113, 255]]);
  await page.locator("#name-label").click();
  await expect(page.locator("#name")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("library-native");
  await page.keyboard.press("Enter");
  await expect(page.locator("#saved")).toHaveText("library-native");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  const selection = await page.evaluate(() => {
    const input = document.querySelector("#name");
    return [input.selectionStart, input.selectionEnd];
  });
  await page.evaluate(() => window.integrationProbe.disable());
  expect(await page.evaluate(() => window.originalInput === document.querySelector("#name") && window.originalRoot === document.querySelector(".app-container"))).toBe(true);
  expect(await page.evaluate(() => [document.querySelector("#name").selectionStart, document.querySelector("#name").selectionEnd])).toEqual(selection);
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await page.locator("#dialog-open").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#dialog")).toBeVisible();
  await expect(page.locator("#dialog-input")).toBeFocused();
  expect(await page.evaluate(() => document.querySelector("#overlay").contains(document.querySelector("#dialog")) && !document.querySelector(".app-container").contains(document.querySelector("#dialog")))).toBe(true);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("retained overlay");
  await page.keyboard.press("Tab");
  await expect(page.locator("#dialog-close")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#dialog-input")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dialog")).toHaveCount(0);
  await expect(page.locator("#dialog-open")).toBeFocused();
  await page.locator("#dialog-open").click();
  await page.locator("#dialog-close").click();
  await expect(page.locator("#dialog-open")).toBeFocused();
  await page.evaluate(() => window.integrationProbe.render());
  expect(await page.evaluate(() => window.originalRefs.every((ref, i) => ref === window.integrationProbe.refs()[i]))).toBe(true);
  const changed = await page.evaluate(() => window.integrationProbe.state());
  expect(changed.metrics.uploads).toBeGreaterThan(initial.metrics.uploads);
  await page.evaluate(() => window.integrationProbe.settle());
  const changedPixels = PNG.sync.read(await page.locator("#frame").screenshot());
  let changedBytes = 0;
  for (let i = 0; i < originalPixels.data.length; i++) if (originalPixels.data[i] !== changedPixels.data[i]) changedBytes++;
  // The edited and re-rendered content must visibly change the canvas.
  expect(changedBytes).toBeGreaterThan(100);
  const authored = await page.evaluate(async () => {
    const element = document.querySelector("#library");
    // An authored inline style is application-owned and must be left alone.
    element.style.opacity = ".7";
    await new Promise(resolve => setTimeout(resolve, 300));
    await window.integrationProbe.disable();
    return { opacity: element.style.opacity, background: getComputedStyle(element).backgroundColor, state: window.integrationProbe.state() };
  });
  expect(authored.opacity).toBe("0.7");
  expect(authored.background).toBe("rgb(240, 30, 60)");
  expect(authored.state.mode).toBe("dom");
  const disposed = await page.evaluate(() => window.integrationProbe.dispose());
  zero(disposed);
  expect(errors).toEqual([]);
  await save(`native-${strict}`, { initial, selection, changed, changedBytes, authored, disposed, errors });
});

// Eight times the original `#replacement` element is replaced by React. The old element must be retired
// (disconnected, no `drawable` attribute), exactly one original remains, GPU stays active with no new
// admission, three layers stay captured, and both layer colours are still painted at the right pixels.
for (const dpr of [1, 2]) test(`original Replace ref actions retain GPU ownership DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await ready(page);
    const cdp = await page.context().newCDPSession(page);
    const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
    await cdp.detach();
    const observations = [];
    for (let index = 0; index < 8; index++) {
      await page.evaluate(() => { window.replacedOriginal = document.querySelector("#replacement"); });
      await page.locator("#replace").click();
      await expect(page.locator("#replacement")).toHaveText(`Original ref ${index + 1}`);
      await page.evaluate(() => window.integrationProbe.settle());
      const state = await page.evaluate(() => ({ ...window.integrationProbe.state(),
        retired: !window.replacedOriginal.isConnected && !window.replacedOriginal.hasAttribute("drawable"),
        owner: document.querySelector(".app-container").parentElement.id, originals: document.querySelectorAll("#replacement").length }));
      expect(state.mode, state.reason).toBe("gpu"); expect(state.retired).toBe(true);
      expect(state.owner).toBe("output"); expect(state.originals).toBe(1);
      expect(state.metrics.admission.attempts).toBe(1);
      expect(state.publication.captures).toHaveLength(3);
      await page.locator("#count").click(); await expect(page.locator("#count")).toHaveText(`Count ${index + 1}`);
      const png = PNG.sync.read(await page.locator("#frame").screenshot());
      const ratio = png.width / 640;
      for (const [x, y, expected] of [[55, 345, [240, 30, 60, 255]], [400, 200, [20, 200, 90, 255]]]) {
        const offset = (Math.floor(y * ratio) * png.width + Math.floor(x * ratio)) * 4;
        expect([...png.data.subarray(offset, offset + 4)]).toEqual(expected);
      }
      observations.push(state);
    }
    zero(await page.evaluate(() => window.integrationProbe.dispose()));
    await save(`replacement-${dpr}`, { environment, observations, limitation: "Decoded source screenshots/trusted actions; physical display continuity remains unqualified" });
  } finally { await page.close(); }
});

// Invalid enrollments (nested, foreign, detached, duplicate and bad id) each throw a coded error without
// changing the element or the registry. After a React replace, the old element is cleaned up, and twenty
// StrictMode lifetimes retire cleanly.
test("atomic ref refusal, replacement, authored attribute cleanup and twenty retired lifetimes", async ({ page }) => {
  await ready(page, true);
  const atomic = await page.evaluate(() => {
    const before = window.integrationProbe.state();
    const rejected = [];
    for (const [element, id] of [[document.querySelector("#name"), "nested"], [document.body, "foreign"], [document.createElement("div"), "detached"], [document.querySelector("#library"), "duplicate"], [document.querySelector("#replacement"), "library"]]) {
      const markup = element.outerHTML;
      try { window.integrationProbe.enroll(element, id); } catch (error) { rejected.push({ code: error.code, unchanged: markup === element.outerHTML }); }
    }
    return { before, after: window.integrationProbe.state(), rejected };
  });
  expect(atomic.rejected.map(value => value.code)).toEqual(["nested-element", "foreign-element", "foreign-element", "duplicate-element", "invalid-id"]);
  expect(atomic.rejected.every(value => value.unchanged)).toBe(true);
  expect(atomic.after.registryRevision).toBe(atomic.before.registryRevision);
  await page.evaluate(() => { window.oldRefElement = document.querySelector("#replacement"); window.integrationProbe.replace(); });
  await page.evaluate(() => window.integrationProbe.settle());
  expect((await page.evaluate(() => window.integrationProbe.state())).mode).toBe("gpu");
  expect(await page.evaluate(() => window.oldRefElement !== document.querySelector("#replacement") && !window.oldRefElement.hasAttribute("drawable") && !window.oldRefElement.isConnected)).toBe(true);
  const lifetimes = [];
  for (let index = 0; index < 20; index++) {
    const cycle = await page.evaluate(() => window.integrationProbe.cycle());
    zero(cycle.retired);
    expect(cycle.active.runtimeResources.enrolledLayers).toBe(3);
    expect(cycle.active.resources.engines).toBe(1);
    lifetimes.push(cycle);
  }
  zero(await page.evaluate(() => window.integrationProbe.dispose()));
  await save("enrollment", { atomic, lifetimes });
});

// Presence exit and re-entry on the green card. Mid-exit the canvas shows a partially faded card (red channel
// between 20 and 255); interrupting the exit restores the full card; after exit the frame is white. Then a
// 60 s transition runs for 300 animation frames without commits, captures, copies, readbacks or uploads, and
// a native edit afterwards still uploads fresh pixels.
for (const strict of [false, true]) test(`single-subtree exit pixels, interruption and settled 300 frames strict=${strict}`, async ({ page }) => {
  await ready(page, strict);
  expect(await pixel(page, `presence-${strict}-entered`)).toEqual([20, 200, 90, 255]);
  await page.evaluate(() => { window.originalCard = document.querySelector("#card"); window.integrationProbe.show(false); });
  await page.waitForTimeout(250);
  expect(await page.locator("#card").count()).toBe(1);
  const exiting = await pixel(page, `presence-${strict}-exiting`, 440, 200);
  expect(exiting[0]).toBeGreaterThan(20);
  expect(exiting[0]).toBeLessThan(255);
  await page.evaluate(() => window.integrationProbe.show(true));
  expect(await page.evaluate(() => window.originalCard === document.querySelector("#card"))).toBe(true);
  await page.waitForTimeout(1000);
  expect(await pixel(page, `presence-${strict}-interrupted`)).toEqual([20, 200, 90, 255]);
  // Rapidly toggle presence six times (40 ms apart) to stress interrupted exits and entries.
  for (let index = 0; index < 6; index++) { await page.evaluate(value => window.integrationProbe.show(value), index % 2 === 1); await page.waitForTimeout(40); }
  await page.waitForTimeout(1000);
  expect(await page.locator("#card").count()).toBe(1);
  const interval = await page.evaluate(async () => {
    const probe = window.integrationProbe;
    window.longTransition = probe.transition({ keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 60000 } });
    await new Promise(resolve => setTimeout(resolve, 300));
    await probe.settle();
    const before = probe.state();
    for (let index = 0; index < 300; index++) await new Promise(resolve => requestAnimationFrame(resolve));
    const after = probe.state();
    window.longTransition.cancel();
    const result = await window.longTransition.finished;
    return { before, after, result };
  });
  for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(interval.after.metrics[key]).toBe(interval.before.metrics[key]);
  expect(interval.after.commits.count).toBe(interval.before.commits.count);
  expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBeGreaterThanOrEqual(300);
  expect(interval.after.metrics.admission).toEqual(interval.before.metrics.admission);
  expect(interval.result.status).toBe("cancelled");
  await page.evaluate(() => window.integrationProbe.show(false));
  await expect(page.locator("#card")).toHaveCount(0);
  expect(await pixel(page, `presence-${strict}-exited`)).toEqual([255, 255, 255, 255]);
  await page.evaluate(() => window.integrationProbe.show(true));
  await page.waitForTimeout(250);
  const entering = await pixel(page, `presence-${strict}-entering`, 440, 200);
  expect(entering[0]).toBeGreaterThan(20);
  expect(entering[0]).toBeLessThan(255);
  await page.waitForTimeout(1000);
  expect(await pixel(page, `presence-${strict}-reentered`)).toEqual([20, 200, 90, 255]);
  await page.locator("#card-input").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("affine native hit");
  await page.locator("h1").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.integrationProbe.settle());
  const changed = await page.evaluate(() => window.integrationProbe.state());
  expect(changed.metrics.uploads).toBeGreaterThan(interval.after.metrics.uploads);
  const disposed = await page.evaluate(() => window.integrationProbe.dispose());
  zero(disposed);
  await save(`presence-${strict}`, { exiting, entering, interval, changed, disposed });
});

// Motion API contract: a new transition replaces the running one (outcome `Replaced`) without a jump in the
// layer's transform; durations above 60 s and infinite iterations are rejected; cancelling twice is harmless;
// a competing native animation on the element is refused. Reduced motion skips the exit animation, and
// after an explicit disable presence still works on the plain DOM.
test("bounded timing, replacement outcome, conflicts, reduced motion and DOM recovery", async ({ page }) => {
  await ready(page);
  const outcomes = await page.evaluate(async () => {
    const probe = window.integrationProbe;
    const descriptor = { keyframes: [{ offset: 0 }, { offset: 1, x: 40, opacity: .5 }], timing: { duration: 800, delay: 100 } };
    const a = probe.transition(descriptor);
    await new Promise(resolve => setTimeout(resolve, 350));
    const before = probe.state().layers.find(layer => layer.id === "stage").transform;
    const b = probe.transition({ ...descriptor, keyframes: [{ offset: 0 }, { offset: 1 }] });
    const after = probe.state().layers.find(layer => layer.id === "stage").transform;
    const invalid = [];
    for (const timing of [{ duration: 60001 }, { duration: 1000, iterations: Infinity }]) {
      try { probe.transition({ ...descriptor, timing }); } catch (error) { invalid.push(String(error)); }
    }
    b.cancel();
    b.cancel();
    const cancelledTransform = probe.state().layers.find(layer => layer.id === "stage").transform;
    const native = document.querySelector("#stage").animate([{ opacity: 1 }, { opacity: .5 }], { duration: 10000 });
    let conflict;
    try { probe.transition(descriptor); } catch (error) { conflict = String(error); }
    native.cancel();
    return { before, after, cancelledTransform, invalid, conflict, a: await a.finished, b: await b.finished, state: probe.state() };
  });

  expect(outcomes.before).toEqual(outcomes.after);
  expect(outcomes.cancelledTransform).toEqual(outcomes.before);
  expect(outcomes.a).toEqual({ status: "cancelled", reason: "Replaced" });
  expect(outcomes.b).toEqual({ status: "cancelled", reason: "Cancelled" });
  expect(outcomes.invalid).toHaveLength(2);
  expect(outcomes.conflict).toContain("competing");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.integrationProbe.show(false));
  await expect(page.locator("#card")).toHaveCount(0);
  await page.evaluate(() => window.integrationProbe.show(true));
  await expect(page.locator("#card")).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => window.integrationProbe.show(false));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.integrationProbe.disable());
  await expect(page.locator("#card")).toHaveCount(0);
  await page.evaluate(() => window.integrationProbe.show(true));
  await page.waitForTimeout(1000);
  expect(await pixel(page, "presence-dom")).toEqual([20, 200, 90, 255]);
  await page.locator("#name").fill("DOM recovered");
  await page.locator("#save").click();
  await expect(page.locator("#saved")).toHaveText("DOM recovered");
  const fallback = await page.evaluate(() => window.integrationProbe.state());
  expect(fallback.runtimeResources.declarativeMotions).toBe(0);
  zero(await page.evaluate(() => window.integrationProbe.dispose()));
  await save("transition-outcomes", { outcomes, fallback });
});

// Destroys the configured GPU device while an exit animation is running. The page falls back to DOM with the
// original input and its value, finishes the exit, then a fresh explicit enable is admitted again.
test("actual device loss interrupts presence, preserves native controls and permits fresh admission", async ({ page }) => {
  await ready(page);
  await page.locator("#name").fill("loss retained");
  await page.evaluate(() => {
    window.retainedInput = document.querySelector("#name");
    window.integrationProbe.show(false);
  });
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector("#output").getContext("webgpu").getConfiguration().device.destroy());
  await page.waitForFunction(() => window.integrationProbe.state().mode === "dom" && !window.integrationProbe.state().transitioning);
  await expect(page.locator("#card")).toHaveCount(0);
  expect(await page.evaluate(() => window.retainedInput === document.querySelector("#name"))).toBe(true);
  await expect(page.locator("#name")).toHaveValue("loss retained");
  await page.locator("#save").click();
  await expect(page.locator("#saved")).toHaveText("loss retained");
  const recovered = await page.evaluate(() => window.integrationProbe.state());
  expect(recovered.runtimeResources.declarativeMotions).toBe(0);
  expect(recovered.metrics.deviceLossCount).toBe(1);
  await page.evaluate(() => window.integrationProbe.show(true));
  await page.waitForTimeout(1000);
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.integrationProbe.dispose());
  zero(disposed);
  await save("presence-loss", { fixture: "Public configured-device destruction, not physical driver-reset evidence", recovered, disposed });
});

// A group of two motions starts from one epoch with the second staggered by 200 ms (ends 500 and 700). An
// invalid member rejects the whole group and leaves the state untouched.
test("coordinated motion shares one epoch, staggers bounded starts and rejects groups atomically", async ({ page }) => {
  await ready(page);
  const report = await page.evaluate(async () => {
    const probe = window.integrationProbe;
    const motion = { keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 500 } };
    const group = probe.group([{ id: "stage", motion }, { id: "replacement", motion }], 200);
    const initial = probe.state();
    let rejected;
    try { probe.group([{ id: "stage", motion }, { id: "replacement", motion: { ...motion, timing: { duration: 60001 } } }]); }
    catch (error) { rejected = String(error); }
    const afterRejection = probe.state();
    await new Promise(resolve => setTimeout(resolve, 100));
    const staggered = probe.state();
    const result = await Promise.all(group.map(handle => handle.finished));
    return { initial, afterRejection, rejected, staggered, result };
  });
  expect(report.initial.declarativeMotion[0].start).toBe(report.initial.declarativeMotion[1].start);
  expect(report.initial.declarativeMotion.map(motion => motion.end)).toEqual([500, 700]);
  expect(report.afterRejection.declarativeMotion).toEqual(report.initial.declarativeMotion);
  expect(report.staggered.layers.find(layer => layer.id === "stage").transform.x).toBeGreaterThan(0);
  expect(report.staggered.layers.find(layer => layer.id === "replacement").transform.x).toBe(0);
  expect(report.result.every(result => result.status === "completed")).toBe(true);
  zero(await page.evaluate(() => window.integrationProbe.dispose()));
  await save("coordinated", report);
});

// A held motion with translation, rotation and scale. The matrix stored for the layer must equal the matrix
// reported by the browser (`getElementTransform`), and a real click at the transformed position of the input
// must focus it and accept typing.
test("nonidentity declarative motion applies actual affine native input geometry", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const frame = { x: 25, y: 10, rotation: 8, scaleX: .85, scaleY: .9 };
    window.affineTransition = window.integrationProbe.transition({
      keyframes: [{ ...frame, offset: 0 }, { ...frame, offset: 1 }], timing: { duration: 60000 },
    });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => window.integrationProbe.settle());
  const geometry = await page.evaluate(() => {
    const state = window.integrationProbe.state();
    const layer = state.layers.find(layer => layer.id === "stage");
    const native = state.transforms.find(item => item.id === "stage").matrix;
    const matrix = new DOMMatrix(layer.matrix);
    const input = document.querySelector("#card-input");
    const element = document.querySelector("#stage");
    let x = 0, y = 0;
    for (let node = input; node && node !== element; node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; }
    const hit = matrix.transformPoint({ x: x + input.offsetWidth / 2, y: y + input.offsetHeight / 2 });
    const frame = document.querySelector("#frame").getBoundingClientRect();
    return { mode: state.mode, matrix: layer.matrix, native: [native[0], native[1], native[4], native[5], native[12], native[13]],
      hit: { x: frame.x + hit.x, y: frame.y + hit.y } };
  });
  expect(geometry.mode).toBe("gpu");
  // Compare the 2D affine entries (a, b, c, d, e, f) with a tolerance of 1e-5.
  geometry.matrix.forEach((value, index) => expect(Math.abs(value - geometry.native[index])).toBeLessThanOrEqual(1e-5));
  await page.mouse.click(geometry.hit.x, geometry.hit.y);
  await expect(page.locator("#card-input")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("original affine input");
  await expect(page.locator("#card-input")).toHaveValue("original affine input");
  const cancelled = await page.evaluate(async () => { window.affineTransition.cancel(); return window.affineTransition.finished; });
  expect(cancelled.status).toBe("cancelled");
  zero(await page.evaluate(() => window.integrationProbe.dispose()));
  await save("affine-transition", { geometry, cancelled });
});

// In DOM mode, starting a group is refused when author CSS overrides the element's presentation
// (transform-origin, `scale`, an opacity override through `:has`): each attempt must throw and leave
// declarations, layers, motions and resources exactly as before. An already running motion
// continues untouched. The variants cover a pre-existing motion and reduced motion.
for (const { existing, reduced } of [
  { existing: false, reduced: false }, { existing: true, reduced: false }, { existing: false, reduced: true },
]) test(`DOM group presentation preparation is transactional existing=${existing} reduced=${reduced}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
  await ready(page, true, true);
  const report = await page.evaluate(async ({ existing, reduced }) => {
    const probe = window.integrationProbe;
    const motion = { keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 800 } };
    const stage = document.querySelector("#stage"), replacement = document.querySelector("#replacement");
    const original = existing ? probe.transition({ ...motion, timing: { duration: 2000 } }) : undefined;
    let outcome;
    if (original) original.finished.then(result => { outcome = result; });
    if (existing) await new Promise(resolve => setTimeout(resolve, 100));
    const attempts = [];
    for (const rule of [
      "#replacement { transform-origin: 50% 50% !important; }",
      "#replacement[style] { transform-origin: 50% 50% !important; }",
      "#replacement { scale: 2; }",
      "#replacement[style] { scale: 2; }",
      "body:has(#replacement[style]) #stage { opacity: .4 !important; }",
      ...(reduced ? ['#replacement[style*="30"] { transform-origin: 50% 50% !important; }'] : []),
    ]) {
      const style = document.createElement("style");
      style.textContent = rule;
      document.head.append(style);
      const before = probe.state();
      const declarations = [stage.getAttribute("style"), replacement.getAttribute("style")];
      let reason;
      try { probe.group([{ id: "stage", motion }, { id: "replacement", motion }]); }
      catch (error) { reason = String(error); }
      const after = probe.state();
      attempts.push({ rule, before, after, declarations, afterDeclarations: [stage.getAttribute("style"), replacement.getAttribute("style")], reason, outcome });
      style.remove();
    }
    await new Promise(resolve => setTimeout(resolve, 150));
    const later = probe.state();
    const unresolved = outcome === undefined;
    original?.cancel();
    const result = original ? await original.finished : undefined;
    const disposed = await probe.dispose();
    return { existing, reduced, attempts, later, unresolved, result, disposed };
  }, { existing, reduced });
  await save(`group-preparation-${existing}${reduced ? "-reduced" : ""}`, report);
  for (const attempt of report.attempts) {
    expect(attempt.reason).toBeTruthy();
    expect(attempt.afterDeclarations).toEqual(attempt.declarations);
    expect(attempt.after.layers).toEqual(attempt.before.layers);
    expect(attempt.after.declarativeMotion).toEqual(attempt.before.declarativeMotion);
    expect(attempt.after.runtimeResources).toEqual(attempt.before.runtimeResources);
    expect(attempt.outcome).toBeUndefined();
  }
  expect(report.attempts[1].reason).toContain("overridden");
  expect(report.later.runtimeResources.declarativeMotions).toBe(existing ? 1 : 0);
  expect(report.unresolved).toBe(true);
  if (existing) {
    expect(report.later.layers.find(layer => layer.id === "stage").transform.x).toBeGreaterThan(report.attempts[0].before.layers.find(layer => layer.id === "stage").transform.x);
    expect(report.result).toEqual({ status: "cancelled", reason: "Cancelled" });
  }
  zero(report.disposed);
});

// An `!important` author declaration taking over a property during a motion cancels it (`ownership changed`)
// without overwriting the author value. A group is refused while `!important` CSS is present. Unmounting the
// Presence parent mid-exit cancels the motion and no stale callbacks fire.
test("DOM declaration conflicts and Presence parent unmount cancel without stale callbacks", async ({ page }) => {
  await ready(page, true, true);
  const conflict = await page.evaluate(async () => {
    const probe = window.integrationProbe;
    const handle = probe.transition({ keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 800 } });
    document.querySelector("#stage").style.setProperty("opacity", ".7", "important");
    const result = await handle.finished;
    return { result, opacity: document.querySelector("#stage").style.opacity, priority: document.querySelector("#stage").style.getPropertyPriority("opacity"), state: probe.state() };
  });
  expect(conflict.result.status).toBe("cancelled");
  expect(conflict.result.reason).toContain("ownership changed");
  expect(conflict.opacity).toBe("0.7");
  expect(conflict.priority).toBe("important");
  expect(conflict.state.runtimeResources.declarativeMotions).toBe(0);
  await page.evaluate(() => document.querySelector("#stage").style.removeProperty("opacity"));
  const refused = await page.evaluate(() => {
    const probe = window.integrationProbe;
    const before = probe.state();
    const style = document.createElement("style");
    style.textContent = "#replacement { opacity: .5 !important; }";
    document.head.append(style);
    const motion = { keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 800 } };
    let reason;
    try { probe.group([{ id: "stage", motion }, { id: "replacement", motion }]); }
    catch (error) { reason = String(error); }
    const after = probe.state();
    style.remove();
    return { before, after, reason };
  });
  expect(refused.reason).toContain("important");
  expect(refused.after.layers).toEqual(refused.before.layers);
  expect(refused.after.runtimeResources.declarativeMotions).toBe(0);
  await page.evaluate(() => window.integrationProbe.show(false));
  await page.waitForTimeout(100);
  const before = await page.evaluate(() => window.integrationProbe.state());
  expect(before.runtimeResources.declarativeMotions).toBe(1);
  await page.evaluate(() => window.integrationProbe.unmountPresence());
  await expect(page.locator("#card")).toHaveCount(0);
  await page.waitForTimeout(1000);
  const unmounted = await page.evaluate(() => window.integrationProbe.state());
  expect(unmounted.runtimeResources.declarativeMotions).toBe(0);
  expect(unmounted.results).toEqual(before.results);
  expect(unmounted.runtimeResources.enrolledLayers).toBe(3);
  const authored = await page.evaluate(async () => {
    const element = document.querySelector("#replacement");
    element.setAttribute("drawable", "later app value");
    const disposed = await window.integrationProbe.dispose();
    return { drawable: element.getAttribute("drawable"), disposed };
  });
  expect(authored.drawable).toBe("later app value");
  zero(authored.disposed);
  await save("unmount-and-declarations", { conflict, refused, before, unmounted, authored });
});

// Touching the demo source triggers a real Vite HMR; the previous probe, its refs and its presence lifetime
// must be fully retired and the new module admitted again. The file times are restored afterwards.
test("real development HMR retires the prior ref and presence lifetime", async ({ page }) => {
  await ready(page, true);
  await page.evaluate(() => { window.oldProbe = window.integrationProbe; window.integrationProbe.show(false); });
  const path = "examples/playground/src/demo/integration-demo.tsx";
  const original = await stat(path);
  try {
    await utimes(path, original.atime, new Date());
    await page.waitForFunction(() => window.integrationProbe !== window.oldProbe && window.integrationProbe.state().mode === "gpu");
    const retired = await page.evaluate(() => window.oldProbe.state());
    zero(retired);
    const active = await page.evaluate(() => window.integrationProbe.state());
    expect(active.runtimeResources.enrolledLayers).toBe(3);
    zero(await page.evaluate(() => window.integrationProbe.dispose()));
    await save("hmr", { retired, active });
  } finally { await utimes(path, original.atime, original.mtime); }
});

// Launched without the HTML-in-Canvas flags: the page stays in ordinary DOM mode and the controls and dialog
// remain fully usable.
test("installed Chrome without experimental flags keeps usable original library DOM", async () => {
  const browser = await chromium.launch(browserLaunchOptions({ native: false }));
  const page = await browser.newPage({ viewport: { width: 900, height: 750 } });
  try {
    const cdp = await browser.newBrowserCDPSession();
    const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
    await page.goto(`${previewURL}/integration.html`);
    await page.waitForFunction(() => window.integrationProbe && !window.integrationProbe.state().initializing);
    expect((await page.evaluate(() => window.integrationProbe.state())).mode).toBe("dom");
    await page.locator("#name").fill("ordinary library");
    await page.locator("#save").click();
    await expect(page.locator("#saved")).toHaveText("ordinary library");
    await page.locator("#dialog-open").click();
    await expect(page.locator("#dialog-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#dialog-open")).toBeFocused();
    const state = await page.evaluate(() => window.integrationProbe.state());
    zero(await page.evaluate(() => window.integrationProbe.dispose()));
    await save("no-flags", { state, environment });
  } finally { await browser.close(); }
});
