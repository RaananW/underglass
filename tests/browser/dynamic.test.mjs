/**
 * Browser suite for dynamic structure on `integration.html` (`window.integrationProbe`, from
 * `examples/playground/src/demo/integration-demo.tsx`): React layers are added, removed, reordered, moved and
 * resized, the DPR changes, and admission, device and environment events arrive while GPU presents. It proves
 * that GPU ownership survives supported structural changes (no revoke, no re-admission), that pending captures
 * and pending admission never reveal stale or blank output, that the original native controls keep identity,
 * value, selection and focus, and that explicit disable/dispose and genuine failures are respected and leave
 * nothing live. Fixtures that fake a condition (held GPU fences, a held `requestAdapter`, injected capture
 * errors, emulated media or DPR) say so in the `fixture` field of the `dynamic` evidence reports.
 *
 * Query flags: `dom` skips the automatic initial enable; `auto` selects `admissionPolicy: "automatic"`, a
 * compatibility option that behaves like the default `explicit` policy except that a diagnosed recovery
 * latches admission intent to `blocked` until an explicit `enable()`.
 */
import { chromium } from "@playwright/test";
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { previewURL } from "../helpers/urls.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";

// Evidence directory for JSON reports.
const directory = evidenceDirectory("dynamic");
async function save(name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
const state = page => page.evaluate(() => window.integrationProbe.state());
/**
 * Waits until the probe is in `mode`, no initialization or transition is running, and (for `dom`) the engine
 * has been released, then drains scheduled capture and draw work.
 */
async function settled(page, mode) {
  await page.waitForFunction(mode => {
    const s = window.integrationProbe.state();
    return s.mode === mode && !s.initializing && !s.transitioning
      && (mode !== "dom" || s.resources.engines === 0);
  }, mode);
  await page.evaluate(() => window.integrationProbe.settle());
}
/**
 * Opens the page with the automatic initial enable skipped (`?dom`), records the browser identity, asserts
 * that admission intent starts disabled, then enables GPU explicitly and waits for it. With `automatic` the page
 * is loaded with `?auto` (`admissionPolicy: "automatic"`).
 */
async function ready(page, automatic = true) {
  const cdp = await page.context().newCDPSession(page);
  const metadata = { identity: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
  await cdp.detach();
  await page.goto(`/integration.html?dom${automatic ? "&auto" : ""}`);
  await page.waitForFunction(() => window.integrationProbe);
  expect((await state(page)).admission.intent).toBe("disabled");
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await settled(page, "gpu");
  return metadata;
}
/** Disposes the probe and asserts that every GPU and runtime resource counter is zero; returns the report. */
async function zero(page) {
  const retired = await page.evaluate(() => window.integrationProbe.dispose());
  expect(Object.values(retired.resources).every(n => n === 0)).toBe(true);
  expect(Object.values(retired.runtimeResources).every(n => n === 0)).toBe(true);
  return retired;
}
/**
 * Reads one pixel of the `#frame` screenshot at frame-local CSS pixel (x, y). The default (55, 345) lies inside
 * the red primary layer, rgb(240, 30, 60). The screenshot is scaled by its pixel ratio to find the pixel.
 */
async function color(page, x = 55, y = 345) {
  const width = await page.locator("#frame").evaluate(node => node.getBoundingClientRect().width);
  const png = PNG.sync.read(await page.locator("#frame").screenshot());
  const scale = png.width / width;
  const offset = (Math.floor(y * scale) * png.width + Math.floor(x * scale)) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}
/**
 * Puts the native controls into a known state (typed value, a one-character selection, a second input) and
 * remembers the original input and root so `continuity` can prove they are never replaced.
 */
async function native(page) {
  await page.locator("#name-label").click();
  await expect(page.locator("#name")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("retained");
  await page.keyboard.press("Home"); await page.keyboard.press("Shift+ArrowRight");
  await page.locator("#card-input").fill("native");
  await page.locator("#name").focus();
  await page.keyboard.press("Home"); await page.keyboard.press("Shift+ArrowRight");
  await page.evaluate(() => {
    window.originalInput = document.querySelector("#name");
    window.originalRoot = document.querySelector(".app-container");
  });
}
/** Asserts the original input and root are still in place with the same value, selection and focus. */
async function continuity(page) {
  const result = await page.evaluate(() => ({
    sameInput: window.originalInput === document.querySelector("#name"), sameRoot: window.originalRoot === document.querySelector(".app-container"),
    value: document.querySelector("#name").value, native: document.querySelector("#card-input").value,
    focus: document.activeElement.id, selection: [document.querySelector("#name").selectionStart, document.querySelector("#name").selectionEnd],
    state: window.integrationProbe.state(),
  }));
  expect(result.sameInput && result.sameRoot).toBe(true);
  expect(result.value).toBe("retained"); expect(result.native).toBe("native");
  expect(result.selection).toEqual([0, 1]); expect(result.focus).toBe("name");
  return result;
}

// Delays every GPU queue fence (`onSubmittedWorkDone`) until the test releases it. A structural change then
// creates a successor engine while the old one waits for cleanup; an explicit disable at that point must fall
// back to DOM but keep the healthy resources alive behind the pending fence instead of destroying them.
test("successor retirement and explicit disable retain healthy resources behind a bounded fence", async ({ page }) => {
  const metadata = await ready(page);
  await native(page);
  await page.evaluate(() => {
    const original = GPUQueue.prototype.onSubmittedWorkDone;
    const held = new Promise(resolve => { window.releaseSuccessorFence = resolve; });
    GPUQueue.prototype.onSubmittedWorkDone = function(...args) {
      return original.apply(this, args).then(() => held);
    };
    window.restoreSuccessorFence = () => { GPUQueue.prototype.onSubmittedWorkDone = original; };
    window.integrationProbe.extra(1);
  });
  await page.evaluate(() => window.integrationProbe.settle());
  const successor = await state(page);
  expect(successor.mode).toBe("gpu");
  expect(successor.resources.pendingCleanups).toBeGreaterThan(0);
  // A declarative motion can still be started and cancelled while the fence is pending.
  const motion = await page.evaluate(async () => {
    const transition = window.integrationProbe.transition({
      keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 },
    });
    transition.cancel();
    return transition.finished;
  });
  expect(motion.status).toBe("cancelled");
  const retired = await page.evaluate(() => window.integrationProbe.disable());
  expect(retired.mode).toBe("dom");
  expect(retired.resources.pendingCleanups).toBeGreaterThan(0);
  expect(retired.resources.engines).toBe(1);
  // The diagnosed reason names the pending cleanup; the engine is retained until the fence completes.
  expect(retired.reason).toMatch(/cleanup pending/);
  await continuity(page);
  // Releasing the fence lets the retained resources be freed.
  await page.evaluate(() => { window.restoreSuccessorFence(); window.releaseSuccessorFence(); });
  await page.waitForFunction(() => window.integrationProbe.state().resources.pendingCleanups === 0);
  const disposed = await zero(page);
  await save("successor-retirement-fence", { metadata, successor, motion, retired, disposed });
});

// The three tests in this loop run at DPR 1 and 2.
for (const dpr of [1, 2]) {
  // With a 60 s transition running, three structural changes (add and reorder plus move, resize, remove) are
  // applied. Right after each commit the output is still visible and GPU; afterwards the original controls are
  // intact and the red pixel is still painted. Admission attempts must not increase: the changes are coalesced
  // into the running GPU session rather than triggering new admissions.
  test(`opt-in coalesces structural changes during motion with original native hits DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      const metadata = await ready(page); await native(page);
      const before = await state(page), observations = [];
      for (const operation of ["add-order-position", "size-frame", "remove"]) {
        const barrier = await page.evaluate(operation => {
          const p = window.integrationProbe;
          window.dynamicMotion = p.transition({ keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 } });
          if (operation === "add-order-position") { p.extra(2); p.reorder(); p.layout({ left: 50 }); }
          if (operation === "size-frame") { p.layout({ left: 50, width: 310 }); document.querySelector("#frame").style.width = "660px"; }
          if (operation === "remove") p.extra(0);
          return { state: p.state(), hidden: document.querySelector("#output").hidden };
        }, operation);
        // Right after the commit the output is still visible and presenting GPU.
        expect(barrier.hidden).toBe(false);
        expect(barrier.state.mode).toBe("gpu");
        await settled(page, "gpu");
        const retained = await continuity(page);
        await page.evaluate(() => window.dynamicMotion.cancel());
        expect((await page.evaluate(() => window.dynamicMotion.finished)).status).toBe("cancelled");
        expect(await color(page)).toEqual([240, 30, 60, 255]);
        await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("retained");
        await page.locator("#name-label").click(); await expect(page.locator("#name")).toBeFocused();
        await page.keyboard.press("Home"); await page.keyboard.press("Shift+ArrowRight");
        observations.push({ operation, barrier, retained });
      }
      const after = await state(page);
      // No re-admission happened for any of the structural changes.
      expect(after.admission.attempts - before.admission.attempts).toBe(0);
      expect(after.metrics.admission.attempts).toBe(1);
      const retired = await zero(page);
      await save(`structural-${dpr}`, { metadata, before, after, observations, retired });
    } finally { await page.close(); }
  });

  // Part 1: the `paint` event is swallowed, so a requested capture stays pending. A structural change during
  // the wait must leave the previously presented pixels on screen (no blank frame), upload nothing and skip the
  // incomplete frame. Part 2: during a real admission readback a layout change arrives (injected from the
  // geometry callback); the barrier must show the still-presented DOM (mode `dom`, initializing) and the stale generation
  // must never be revealed.
  test(`held capture and queued admission readback never reveal retired generations DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      const metadata = await ready(page); await native(page);
      await page.evaluate(() => {
        const host = document.querySelector("#output");
        const original = host.requestPaint.bind(host), hold = event => event.stopImmediatePropagation();
        // Swallow paint events and `requestPaint` so the pending capture cannot complete until `restorePaint()`.
        host.addEventListener("paint", hold, true); host.requestPaint = () => {};
        window.restorePaint = () => { host.removeEventListener("paint", hold, true); host.requestPaint = original; original(); };
        window.integrationProbe.render();
      });
      await page.waitForFunction(() => window.integrationProbe.state().resources.paintWaits === 1);
      const before = await state(page);
      const barrier = await page.evaluate(() => {
        window.integrationProbe.layout({ left: 50, width: 310 }); window.integrationProbe.extra(1);
        return { state: window.integrationProbe.state(), hidden: document.querySelector("#output").hidden,
          parent: document.querySelector(".app-container").parentElement.id };
      });
      expect(barrier.hidden).toBe(false); expect(barrier.parent).toBe("output");
      expect(barrier.state.metrics.uploads).toBe(before.metrics.uploads);
      const retainedPixels = PNG.sync.read(await page.locator("#frame").screenshot());
      const ratio = retainedPixels.width / 640;
      const retainedColor = (x, y) => {
        const offset = (Math.floor(y * ratio) * retainedPixels.width + Math.floor(x * ratio)) * 4;
        return [...retainedPixels.data.subarray(offset, offset + 4)];
      };
      // The retained frame still shows the red primary layer and the green stationary layer.
      expect(retainedColor(55, 345)).toEqual([240, 30, 60, 255]);
      expect(retainedColor(400, 200)).toEqual([20, 200, 90, 255]);
      const held = await state(page);
      expect(held.mode).toBe("gpu");
      expect(held.metrics.gpuFrames).toBe(before.metrics.gpuFrames);
      // The incomplete frame was skipped rather than drawn blank.
      expect(held.metrics.incompleteFramesSkipped).toBeGreaterThan(before.metrics.incompleteFramesSkipped);
      await page.evaluate(() => window.restorePaint());
      await settled(page, "gpu"); await continuity(page);
      await page.evaluate(() => window.integrationProbe.disable());
      await settled(page, "dom");
      const result = await page.evaluate(async () => {
        const host = document.querySelector("#output"), original = host.getElementTransform;
        let queued = false;
        // The first geometry read of a child queues a microtask that changes layout while the admission readback is
        // still outstanding.
        host.getElementTransform = function(element) {
          const matrix = original.call(this, element);
          if (!queued && element.parentElement === host) {
            queued = true;
            queueMicrotask(() => {
              window.beforeQueued = window.integrationProbe.state();
              window.integrationProbe.layout({ left: 50, width: 300 }); window.integrationProbe.extra(2);
              window.queuedBarrier = { state: window.integrationProbe.state(), hidden: document.querySelector("#output").hidden };
            });
          }
          return matrix;
        };
        const admission = await window.integrationProbe.enable();
        host.getElementTransform = original;
        return { admission, before: window.beforeQueued, barrier: window.queuedBarrier, style: document.querySelector("#library").getAttribute("style") };
      });
      expect(result.before.resources.probeReadbacks).toBe(1);
      // The probe runs with the ordinary DOM presented (#202), so the mode is still `dom`.
      expect(result.barrier.state.mode).toBe("dom");
      expect(result.barrier.state.initializing).toBe(true);
      expect(result.admission.mode, `${result.admission.reason}; ${result.style}`).toBe("gpu");
      await settled(page, "gpu"); await continuity(page);
      expect(await color(page)).toEqual([240, 30, 60, 255]);
      const retired = await zero(page);
      await save(`pending-${dpr}`, { metadata, fixture: "Synthetic public-paint hold and native geometry callback coalescing; actual queued public readback/fences", before, barrier, held, result, retired });
    } finally { await page.close(); }
  });

  // A DPR change (emulated through CDP) keeps GPU and resizes the output to 640 CSS pixels x the new ratio.
  // After an explicit disable, later structural changes must not re-admit even with the automatic policy.
  test(`DPR changes and disabled automatic intent stay generation-safe DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    const cdp = await page.context().newCDPSession(page);
    try {
      const metadata = await ready(page); await native(page);
      const next = dpr === 1 ? 2 : 1;
      // No resize event is dispatched here; a render is requested so the new DPR is reconciled.
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 750, deviceScaleFactor: next, mobile: false });
      await page.evaluate(() => window.integrationProbe.render());
      await settled(page, "gpu"); const retained = await continuity(page);
      expect(await page.locator("#output").evaluate(node => node.width)).toBe(640 * next);
      await page.evaluate(() => { window.integrationProbe.extra(1); window.disabled = window.integrationProbe.disable(); });
      await page.evaluate(() => window.disabled); await settled(page, "dom");
      const disabled = await state(page);
      await page.evaluate(() => { window.integrationProbe.extra(2); window.integrationProbe.layout({ width: 310 }); });
      // Quiet period: no new admission attempt may start.
      await page.waitForTimeout(150);
      expect((await state(page)).metrics.admission.attempts).toBe(disabled.metrics.admission.attempts);
      expect((await state(page)).admission.intent).toBe("disabled");
      const retired = await zero(page);
      await save(`dpr-disabled-${dpr}`, { metadata, fixture: "CDP emulated DPR, not physical display movement", retained, disabled, retired });
    } finally { await page.close(); }
  });
}

// Under the default `explicit` policy supported layout changes are reconciled in GPU without any admission
// attempt.
test("default explicit policy reconciles supported layout without reentry", async ({ page }) => {
  const metadata = await ready(page, false);
  await page.evaluate(() => window.integrationProbe.extra(1)); await settled(page, "gpu");
  const before = await state(page); await page.waitForTimeout(150); const after = await state(page);
  expect(after.admission.policy).toBe("explicit"); expect(after.admission.attempts).toBe(0);
  expect(after.metrics.admission.attempts).toBe(before.metrics.admission.attempts);
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await save("explicit", { metadata, before, after, retired: await zero(page) });
});

// A held `requestAdapter` keeps public engine initialization pending. Layout changes during the wait are
// absorbed (GPU ends up admitted), while an explicit disable or dispose issued during the wait wins at once (the
// wait is cancelled; a disposed surface has no output): no GPU is presented afterwards and the late engine is disposed.
for (const operation of ["layout", "disable", "dispose"]) {
  test(`pending public engine initialization respects ${operation}`, async ({ page }) => {
    const metadata = await ready(page); await native(page);
    await page.evaluate(() => window.integrationProbe.disable()); await settled(page, "dom");
    await page.evaluate(() => {
      const gpu = navigator.gpu, original = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async options => {
        window.adapterWaiting = true;
        await new Promise(resolve => { window.releaseAdapter = resolve; });
        gpu.requestAdapter = original;
        return original(options);
      };
      window.pendingEnable = window.integrationProbe.enable();
    });
    await page.waitForFunction(() => window.adapterWaiting);
    const pending = await state(page); expect(pending.resources.pendingEngines).toBe(1);
    await page.evaluate(operation => {
      if (operation === "layout") { window.integrationProbe.extra(1); window.integrationProbe.layout({ left: 50 }); }
      if (operation === "disable") window.finalIntent = window.integrationProbe.disable();
      if (operation === "dispose") window.finalIntent = window.integrationProbe.dispose();
    }, operation);
    if (operation === "dispose") {
      // A pending engine request no longer holds dispose hostage: it settles at once and removes the canvas,
      // and the late engine is disposed when the held adapter is released.
      await page.evaluate(() => window.finalIntent);
      expect(await page.locator("#output").count()).toBe(0);
      expect((await state(page)).mode).toBe("disposed");
    } else expect(await page.locator("#output").evaluate(node => node.hidden)).toBe(true);
    await page.evaluate(() => window.releaseAdapter());
    await page.evaluate(() => window.pendingEnable);
    if (operation === "layout") { await settled(page, "gpu"); await continuity(page); }
    else {
      await page.evaluate(() => window.finalIntent);
      expect((await state(page)).admission.intent).toBe("disabled");
      await page.waitForTimeout(150); expect((await state(page)).mode).toBe(operation === "dispose" ? "disposed" : "dom");
    }

    await save(`pending-engine-${operation}`, { metadata, pending, after: await state(page),
      retired: operation === "dispose" ? await state(page) : await zero(page),
      fixture: "Held public requestAdapter call; not a real slow/failed device" });
    expect(Object.values((await state(page)).resources).every(n => n === 0)).toBe(true);
    expect(Object.values((await state(page)).runtimeResources).every(n => n === 0)).toBe(true);
  });
}

// A tab hidden while a slow engine request is pending must not revoke GPU: ordinary DOM stays presented when the
// engine lands, and admission continues when the document is visible again, ending on GPU with fresh pixels and
// the original native controls (synthetic `document.hidden`, not a genuine background tab).
test("a tab hidden during a slow engine request continues to GPU when visible again", async ({ page }) => {
  const metadata = await ready(page); await native(page);
  await page.evaluate(() => window.integrationProbe.disable()); await settled(page, "dom");
  await page.evaluate(() => {
    const gpu = navigator.gpu, original = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async options => {
      window.adapterWaiting = true;
      await new Promise(resolve => { window.releaseAdapter = resolve; });
      gpu.requestAdapter = original;
      return original(options);
    };
    window.pendingEnable = window.integrationProbe.enable();
  });
  await page.waitForFunction(() => window.adapterWaiting);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.releaseAdapter();
  });
  await page.waitForFunction(() => /until the document is visible/.test(window.integrationProbe.state().reason));
  const waiting = await state(page);
  expect(waiting.mode).toBe("dom");
  expect(waiting.resources.pendingEngines).toBe(0);
  expect(await page.locator("#output").evaluate(node => node.hidden)).toBe(true);
  await page.waitForTimeout(300);
  expect((await state(page)).mode).toBe("dom");
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  expect((await page.evaluate(() => window.pendingEnable)).mode).toBe("gpu");
  await settled(page, "gpu");
  const continued = await state(page);
  expect(continued.admission.intent).toBe("enabled");
  expect(await color(page)).toEqual([240, 30, 60, 255]);
  await continuity(page);
  await page.locator("#name-label").click();
  await expect(page.locator("#name")).toBeFocused();
  await save("hidden-during-slow-init", { metadata, waiting, continued, retired: await zero(page) });
});

// App code that changes a layer every frame (a requestAnimationFrame loop, as animation libraries and live
// charts do) re-dirties it after every capture, so a paint is always requested. Admission and settle() must
// still finish once the paint they waited for completes, and the presented pixels must keep up with the loop.
test("admission and settle complete while app code changes a layer every frame", async ({ page }) => {
  await page.goto("/integration.html?dom");
  await page.waitForFunction(() => window.integrationProbe);
  // `#saved` sits inside the enrolled `#library` layer, next to the native `#save` button.
  await page.evaluate(() => {
    const target = document.querySelector("#saved");
    Object.assign(target.style, { display: "inline-block", width: "60px", height: "24px" });
    window.updates = 0;
    window.stopUpdates = false;
    const tick = () => {
      if (window.stopUpdates) { target.style.background = "rgb(20, 200, 40)"; return; }
      window.updates++;
      target.style.background = `rgb(${window.updates * 7 % 256}, 40, 160)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const enabled = await page.evaluate(() => window.integrationProbe.enable());
  expect(enabled.mode, enabled.reason).toBe("gpu");
  await page.evaluate(() => window.integrationProbe.settle());
  const box = await page.evaluate(() => {
    const frame = document.querySelector("#frame").getBoundingClientRect(), saved = document.querySelector("#saved").getBoundingClientRect();
    return { x: saved.x - frame.x + saved.width / 2, y: saved.y - frame.y + saved.height / 2 };
  });
  // The layer is presented (not a blank frame): the loop's colour has green 40 and blue 160. Fresh pixels while
  // the loop runs: the presented colour keeps changing.
  const first = await color(page, box.x, box.y);
  expect(Math.abs(first[1] - 40)).toBeLessThanOrEqual(2); expect(Math.abs(first[2] - 160)).toBeLessThanOrEqual(2);
  await page.waitForTimeout(250);
  const second = await color(page, box.x, box.y);
  expect(first.slice(0, 3)).not.toEqual(second.slice(0, 3));
  expect((await state(page)).metrics.gpuFrames).toBeGreaterThan(0);
  // Native hits on the continuously re-captured layer reach the original controls.
  expect(await page.evaluate(() => {
    const button = document.querySelector("#save").getBoundingClientRect();
    return document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.id;
  })).toBe("save");
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  const running = await state(page);
  expect(running.mode).toBe("gpu");
  // Once the loop stops on a known colour, settle() presents it.
  await page.evaluate(() => { window.stopUpdates = true; });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.integrationProbe.settle());
  const final = await color(page, box.x, box.y);
  for (const [actual, expected] of final.slice(0, 3).map((value, index) => [value, [20, 200, 40][index]])) expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2);
  expect((await state(page)).mode).toBe("gpu");
  await save("continuous-updates", { enabled, running, updates: await page.evaluate(() => window.updates), first, second, final, retired: await zero(page) });
});

// Reduced motion is not a reason to revoke GPU: ownership stays and no new admission happens.
test("reduced motion preserves structural GPU ownership without new admission", async ({ page }) => {
  const metadata = await ready(page);
  await page.evaluate(() => {
    window.integrationProbe.extra(1);
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await settled(page, "gpu");
  const held = await state(page);
  expect(held.admission.intent).toBe("enabled"); expect(held.admission.pending).toBe(false);
  expect(held.metrics.admission.attempts).toBe(1);
  await page.waitForTimeout(150); expect((await state(page)).admission.attempts).toBe(held.admission.attempts);
  await page.emulateMedia({ reducedMotion: "no-preference" }); await settled(page, "gpu");
  await save("inflight-media", { metadata, held, retired: await zero(page), fixture: "Emulated reduced motion; no new engine/admission" });
});

// Each refusal below (editable boundary, injected capture error, destroyed device) ends in DOM with intent
// `blocked`. After that, later layout changes must not retry admission; only an explicit `enable()` does.
// Forced colors alone must not revoke GPU.
test("policy/media/fault/loss refusal latches until explicit enable", async ({ page }) => {
  const metadata = await ready(page);
  await page.emulateMedia({ forcedColors: "active" }); await settled(page, "gpu");
  const forced = await state(page); expect(forced.admission.intent).toBe("enabled");
  await page.emulateMedia({ forcedColors: "none" });
  await page.evaluate(() => window.integrationProbe.extra(1)); await page.waitForTimeout(150);
  expect((await state(page)).metrics.admission.attempts).toBe(forced.metrics.admission.attempts);
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await page.evaluate(() => document.querySelector("#replacement").setAttribute("contenteditable", "plaintext-only"));
  await settled(page, "dom"); const editable = await state(page);
  await page.evaluate(() => document.querySelector("#replacement").setAttribute("contenteditable", "FALSE"));
  await page.waitForTimeout(150); expect((await state(page)).admission.intent).toBe("blocked");
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await page.evaluate(() => {
    const original = GPUQueue.prototype.drawElementImageToTexture;
    GPUQueue.prototype.drawElementImageToTexture = () => { throw new Error("Injected capture error"); };
    window.restoreCapture = () => { GPUQueue.prototype.drawElementImageToTexture = original; };
    window.integrationProbe.render();
  });
  await settled(page, "dom"); const failed = await state(page);
  await page.evaluate(() => { window.restoreCapture(); window.integrationProbe.extra(2); });
  await page.waitForTimeout(150); expect((await state(page)).admission.intent).toBe("blocked");
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await page.evaluate(() => {
    // Capture the configured device so the test can destroy it, which the page sees as device loss.
    const configure = GPUCanvasContext.prototype.configure;
    GPUCanvasContext.prototype.configure = function(options) { window.dynamicDevice = options.device; return configure.call(this, options); };
  });
  await page.evaluate(() => window.integrationProbe.disable());
  expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
  await page.evaluate(() => window.dynamicDevice.destroy()); await settled(page, "dom");
  const loss = await state(page); expect(loss.admission.intent).toBe("blocked");
  await page.waitForTimeout(150); expect((await state(page)).metrics.admission.attempts).toBe(loss.metrics.admission.attempts);
  await save("refusal-latches", { metadata, forced, editable, failed, loss, retired: await zero(page),
    fixture: "Emulated media, injected native capture error and public configured-device destroy; not physical loss/accessibility proof" });
});

// Synthetic `document.hidden` (not a real background tab): while hidden, no re-admission frames run, and
// disposing during that state cancels pending work and releases everything.
test("healthy GPU publication pauses while hidden and unmount cancels pending work", async ({ page }) => {
  const metadata = await ready(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.integrationProbe.extra(1)); await settled(page, "gpu");
  const reduced = await state(page); expect(reduced.admission.pending).toBe(false);
  await page.waitForTimeout(150); expect((await state(page)).admission.attempts).toBe(reduced.admission.attempts);
  await page.emulateMedia({ reducedMotion: "no-preference" }); await settled(page, "gpu");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.integrationProbe.extra(2);
  });
  const hidden = await state(page);
  expect(hidden.mode).toBe("gpu");
  expect(hidden.runtimeResources.readmissionFrames).toBe(0);
  await page.evaluate(() => {
    delete document.hidden; document.dispatchEvent(new Event("visibilitychange"));
    window.disposed = window.integrationProbe.dispose();
  });
  const retired = await page.evaluate(() => window.disposed);
  expect(Object.values(retired.resources).every(n => n === 0)).toBe(true);
  expect(Object.values(retired.runtimeResources).every(n => n === 0)).toBe(true);
  await page.waitForTimeout(150); expect((await state(page)).mode).toBe("disposed");
  await save("environment-dispose", { metadata, reduced, hidden, retired, fixture: "Synthetic document.hidden change, not genuine background-tab proof" });
});

// Chrome launched without the HTML-in-Canvas flags: enabling is refused with a diagnosed `blocked` intent, no
// admission is retried on later changes, and the original controls stay usable.
test("opt-in without native flags refuses useful DOM once and retains real controls", async () => {
  const browser = await chromium.launch(browserLaunchOptions({ native: false }));
  try {
    const page = await browser.newPage();
    const cdp = await page.context().newCDPSession(page);
    const metadata = { identity: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
    await page.goto(`${previewURL}/integration.html?dom&auto`); await page.waitForFunction(() => window.integrationProbe);
    const admission = await page.evaluate(() => window.integrationProbe.enable());
    expect(admission.mode).toBe("dom"); expect(admission.admission.intent).toBe("blocked");
    await page.evaluate(() => { window.integrationProbe.extra(1); window.integrationProbe.reorder(); });
    await page.waitForTimeout(150); expect((await state(page)).admission.attempts).toBe(0);
    await page.locator("#name").fill("native");
    await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("native");
    await save("no-flags", { metadata, admission, retired: await zero(page) });
  } finally { await browser.close(); }
});
