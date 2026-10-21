/**
 * Browser suite that stresses GPU ownership under races and environment changes, on `integration.html`
 * (`integrationProbe`), `performance.html` (`measurement`), `todo.html` (`todoProbe`) and `effects.html`
 * (`effectsProbe`), at DPR 1 and 2 on the preview build. It proves that React layer moves, reorders, additions,
 * removals and resizes keep GPU active with the original native controls (identity, value, selection, focus),
 * that pending captures and admissions never reveal stale or blank frames, that a DPR change is reconciled
 * without losing native hits, that native paint, hover and rapid edits reach the canvas, and that disposal
 * always returns every resource counter to zero. Several tests hold or inject browser calls to force a race;
 * the `fixture` or `limit` text in each `hardening` evidence report states what was synthetic.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

// Evidence directory for JSON reports and screenshots.
const directory = evidenceDirectory("hardening");
async function save(name, value) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2));
}
/** Asserts that every GPU and runtime resource counter in a dispose report is zero. */
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
}
/**
 * Opens `integration.html` (`?dom` skips the automatic enable), waits for GPU unless `dom`, then waits 900 ms and
 * drains scheduled work so the page is quiet before the test starts racing it.
 */
async function ready(page, dom = false) {
  await page.goto(`/integration.html?${dom ? "dom" : ""}`);
  await page.waitForFunction(() => window.integrationProbe && !window.integrationProbe.state().initializing);
  if (!dom) await page.waitForFunction(() => window.integrationProbe.state().mode === "gpu");
  await page.waitForTimeout(900);
  await page.evaluate(() => window.integrationProbe.settle());
}
/** Waits for a completed fallback to DOM: engine released, no transition running and the output hidden. */
async function recovered(page) {
  await page.waitForFunction(() => {
    const state = window.integrationProbe.state();
    return state.mode === "dom" && !state.initializing && !state.transitioning && state.resources.engines === 0;
  });
  expect(await page.locator("#output").evaluate(node => node.hidden)).toBe(true);
}
/**
 * Screenshots `#frame` (saved as evidence) and returns the RGBA of frame-local CSS pixel (x, y), scaling by the
 * screenshot-to-CSS ratio. The `dpr` argument is only informational.
 */
async function pixels(page, name, dpr, x, y) {
  await mkdir(directory, { recursive: true });
  const width = await page.locator("#frame").evaluate(node => node.getBoundingClientRect().width);
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
  const scale = png.width / width;
  expect(scale).toBeGreaterThan(0);
  const offset = (Math.floor(y * scale) * png.width + Math.floor(x * scale)) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}

// Every test below runs at DPR 1 and 2 on fresh pages.
for (const dpr of [1, 2]) {
  // Five structural operations are each applied while a 60 s transition runs. Right after the commit the mode
  // is still GPU (and, for move, reorder and remove, the newest layout generation has already been submitted),
  // then the original input, root and layers keep identity, value, selection and focus, the number of captured
  // layers is right, and the primary layer pixel (55, 345) is still red. The pixels are the owning GPU output, not
  // an ordinary-DOM reference.
  test(`same-size moves, React reorder/add/remove, resize and native continuity DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await ready(page);
      await page.locator("#name").fill("retained-phase9");
      await page.locator("#name").focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      await page.evaluate(() => {
        window.originalInput = document.querySelector("#name");
        window.originalRoot = document.querySelector(".app-container");
        window.originalStage = document.querySelector("#stage");
        window.originalReplacement = document.querySelector("#replacement");
      });
      const observations = [];
      for (const operation of ["move", "reorder", "add", "remove", "resize"]) {
        const postcommit = await page.evaluate(async operation => {
          const probe = window.integrationProbe;
          // Keep a long motion running so the change lands while GPU owns the presentation.
          window.activeTransition = probe.transition({ keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 } });
          if (operation === "move") probe.layout({ left: 50 });
          if (operation === "reorder") probe.reorder();
          if (operation === "add") probe.extra(2);
          if (operation === "remove") probe.extra(0);
          if (operation === "resize") probe.layout({ left: 50, width: 310 });
          await Promise.resolve();
          return probe.state();
        }, operation);
        expect(postcommit.mode).toBe("gpu");
        if (operation === "move" || operation === "reorder" || operation === "remove") {
          expect(postcommit.publication.submittedGeneration).toBe(postcommit.publication.generation);
        }
        await page.evaluate(() => window.integrationProbe.settle());
        await page.evaluate(() => window.activeTransition.cancel());
        const continuity = await page.evaluate(async () => ({
          input: window.originalInput === document.querySelector("#name"),
          root: window.originalRoot === document.querySelector(".app-container"),
          stage: window.originalStage === document.querySelector("#stage"),
          replacement: window.originalReplacement === document.querySelector("#replacement"),
          value: document.querySelector("#name").value,
          selection: [document.querySelector("#name").selectionStart, document.querySelector("#name").selectionEnd],
          focus: document.activeElement.id,
          transition: await window.activeTransition.finished,
          order: [...document.querySelector(".app-container").children].map(node => node.id),
          state: window.integrationProbe.state(),
        }));
        expect(continuity.input && continuity.root && continuity.stage && continuity.replacement).toBe(true);
        expect(continuity.value).toBe("retained-phase9");
        expect(continuity.selection).toEqual([0, 1]);
        expect(continuity.focus).toBe("name");
        expect(continuity.transition.status).toBe("cancelled");
        expect(continuity.state.mode).toBe("gpu");
        // Three layers captured, or five after `extra(2)` adds two.
        expect(continuity.state.publication.captures).toHaveLength(operation === "add" ? 5 : 3);
        if (operation === "reorder") expect(continuity.order.indexOf("replacement")).toBeLessThan(continuity.order.indexOf("stage"));
        const gpuPixel = await pixels(page, `layout-${operation}-gpu-before-action-${dpr}`, dpr, 55, 345);
        expect(gpuPixel).toEqual([240, 30, 60, 255]);
        const admitted = await page.evaluate(() => window.integrationProbe.state());
        expect(admitted.mode).toBe("gpu");
        expect(admitted.metrics.admission.last.gpuPixels).toHaveLength(2);
        expect(await pixels(page, `layout-${operation}-gpu-${dpr}`, dpr, 55, 345)).toEqual(gpuPixel);
        await page.locator("#save").click();
        await expect(page.locator("#saved")).toHaveText("retained-phase9");
        await page.locator("#name").focus();
        await page.keyboard.press("Home");
        await page.keyboard.press("Shift+ArrowRight");
        observations.push({ operation, postcommit, continuity, admitted, gpuPixel,
          pixelProvenance: "Decoded owning GPU output; not an ordinary-DOM/native-capture reference" });
      }
      await page.locator("#dialog-open").focus();
      await page.keyboard.press("Space");
      await expect(page.locator("#dialog-input")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator("#dialog-open")).toBeFocused();
      const disposed = await page.evaluate(() => window.integrationProbe.dispose());
      zero(disposed);
      await save(`dynamic-${dpr}`, { observations, disposed });
    } finally { await page.close(); }
  });

  // Changing DPR through CDP must resize the output to the new ratio (640x420 CSS pixels times DPR) with GPU
  // still active, the same original input, and native hits and pixels still correct.
  test(`actual CDP DPR replacement with original native hits DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    const cdp = await page.context().newCDPSession(page);
    try {
      await ready(page);
      await page.evaluate(() => { window.originalInput = document.querySelector("#name"); });
      const nextDPR = dpr === 1 ? 2 : 1;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 750, deviceScaleFactor: nextDPR, mobile: false });
      await page.waitForFunction(value => window.devicePixelRatio === value, nextDPR);
      // CDP can omit resolution/resize events; normal drawing reconciles DPR.
      await page.evaluate(() => window.integrationProbe.render());
      await page.evaluate(() => window.integrationProbe.settle());
      const reentered = await page.evaluate(() => window.integrationProbe.state());
      expect(reentered.mode).toBe("gpu");
      const geometry = await page.evaluate(() => ({ same: window.originalInput === document.querySelector("#name"),
        dpr: window.devicePixelRatio, width: document.querySelector("#output").width, height: document.querySelector("#output").height,
        state: window.integrationProbe.state() }));
      expect(geometry.same).toBe(true);
      expect(geometry.width).toBe(640 * nextDPR);
      expect(geometry.height).toBe(420 * nextDPR);
      await page.locator("#name-label").click();
      await expect(page.locator("#name")).toBeFocused();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("DPR replacement native hit");
      await page.locator("#save").click();
      await expect(page.locator("#saved")).toHaveText("DPR replacement native hit");
      expect(await pixels(page, `dpr-replacement-${dpr}`, nextDPR, 35, 345)).toEqual([240, 30, 60, 255]);
      const disposed = await page.evaluate(() => window.integrationProbe.dispose());
      zero(disposed);
      await save(`dpr-replacement-${dpr}`, { fixture: "CDP emulated DPR change; not a physical display move", geometry, disposed });
    } finally { await page.close(); }
  });

  // Admission is cancelled while its readback screenshot is queued: a layout change, an extra layer and an
  // explicit disable are injected from the geometry callback. The queued readback must still be drained (none
  // left), the output hidden, no engine or cleanup left behind, and a later enable must succeed.
  test(`cancelled admission drains a queued public screenshot while hidden DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await ready(page, true);
      const result = await page.evaluate(async () => {
        const host = document.querySelector("#output");
        const original = host.getElementTransform;
        let queued = false;
        window.queuedCancellation = undefined;
        host.getElementTransform = function(element) {
          const result = original.call(this, element);
          if (!queued && element.parentElement === host) {
            queued = true;
            queueMicrotask(() => {
              const before = window.integrationProbe.state();
              window.integrationProbe.layout({ width: 310 });
              window.integrationProbe.extra(1);
              void window.integrationProbe.disable();
              window.queuedCancellation = { before, after: window.integrationProbe.state(),
                hidden: document.querySelector("#output").hidden };
            });
          }
          return result;
        };
        const admission = await window.integrationProbe.enable();
        host.getElementTransform = original;
        await window.integrationProbe.settle();
        return { admission, cancellation: window.queuedCancellation, final: window.integrationProbe.state() };
      });
      expect(result.cancellation.before.resources.probeReadbacks).toBe(1);
      expect(result.cancellation.hidden).toBe(true);
      expect(result.cancellation.after.mode).toBe("dom");
      expect(result.final.resources.probeReadbacks).toBe(0);
      expect(result.final.resources.pendingCleanups).toBe(0);
      expect(result.final.resources.engines).toBe(0);
      expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
      const disposed = await page.evaluate(() => window.integrationProbe.dispose());
      zero(disposed);
      await save(`queued-readback-cancel-${dpr}`, { result, disposed,
        fixture: "Synthetic native geometry callback schedules real layout cancellation after public screenshot request; hidden public rendered frames service genuine readback." });
    } finally { await page.close(); }
  });

  // The `paint` event is swallowed so a capture stays pending while the layout changes to a resized layer. The
  // previous complete GPU output must stay on screen (output visible, `.app-container` still parented to it) and
  // the successor must upload new content once the held paint is released.
  test(`pending native capture retains complete GPU output before resized successor DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await ready(page);
      await page.evaluate(() => {
        const host = document.querySelector("#output");
        const original = host.requestPaint.bind(host);
        const hold = event => event.stopImmediatePropagation();
        host.addEventListener("paint", hold, true);
        host.requestPaint = () => {};
        window.restorePaint = () => { host.removeEventListener("paint", hold, true); host.requestPaint = original; original(); };
        window.originalInput = document.querySelector("#name");
        window.integrationProbe.render();
      });
      await page.waitForFunction(() => window.integrationProbe.state().resources.paintWaits === 1);
      const before = await page.evaluate(() => window.integrationProbe.state());
      const barrier = await page.evaluate(async () => {
        window.integrationProbe.layout({ left: 50, width: 310 });
        await Promise.resolve();
        return { state: window.integrationProbe.state(), hidden: document.querySelector("#output").hidden,
          sameInput: window.originalInput === document.querySelector("#name"), parent: document.querySelector(".app-container").parentElement.id };
      });
      expect(barrier.state.mode).toBe("gpu");
      expect(barrier.hidden).toBe(false);
      expect(barrier.sameInput).toBe(true);
      expect(barrier.parent).toBe("output");
      await page.evaluate(() => window.restorePaint());
      await page.evaluate(() => window.integrationProbe.settle());
      const retired = await page.evaluate(() => window.integrationProbe.state());
      expect(retired.metrics.uploads).toBeGreaterThan(before.metrics.uploads);
      expect(retired.mode).toBe("gpu");
      const disposed = await page.evaluate(() => window.integrationProbe.dispose());
      zero(disposed);
      await save(`pending-capture-${dpr}`, { fixture: "Held public requestPaint/event delivery; synthetic cancellation race, not native invalidation suppression in production", before, barrier, retired, disposed });
    } finally { await page.close(); }
  });

  // Holds the real `GPUBuffer.mapAsync` of the admission readback while reorder, replace x2 and move arrive.
  // During the wait the ordinary DOM is still presented (mode `dom`, `initializing`; the root is in the ordinary host and the
  // canvas is displayed but invisible, #202). The stale admission result is not shown; the newer generation is admitted. Then six extra layers exceed the layer-count admission budget, which
  // falls back to DOM with a diagnosed reason, and removing them lets an explicit enable succeed.
  test(`pending admission generation, rapid replacements and layer budget DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await ready(page, true);
      await page.evaluate(() => {
        const original = GPUBuffer.prototype.mapAsync;
        const held = new Promise(resolve => { window.releaseReadback = resolve; });
        GPUBuffer.prototype.mapAsync = function(...args) { window.readbackStarted = true; return original.apply(this, args).then(() => held); };
        window.restoreReadback = () => { GPUBuffer.prototype.mapAsync = original; };
        window.attempt = window.integrationProbe.enable();
      });
      await page.waitForFunction(() => window.readbackStarted);
      const barrier = await page.evaluate(async () => {
        window.integrationProbe.reorder();
        window.integrationProbe.replace();
        window.integrationProbe.replace();
        window.integrationProbe.layout({ left: 50 });
        await Promise.resolve();
        return { state: window.integrationProbe.state(), hidden: document.querySelector("#output").hidden,
          opacity: document.querySelector("#output").style.opacity, parent: document.querySelector(".app-container").parentElement.id };
      });
      expect(barrier.state.mode, barrier.state.reason).toBe("dom");
      expect(barrier.state.initializing).toBe(true);
      expect(barrier.hidden).toBe(false);
      expect(barrier.opacity).toBe("0");
      expect(barrier.parent).not.toBe("output");
      await page.evaluate(() => { window.restoreReadback(); window.releaseReadback(); });
      const stale = await page.evaluate(() => window.attempt);
      expect(stale.mode).toBe("gpu");
      await page.evaluate(() => window.integrationProbe.settle());
      await page.evaluate(() => window.integrationProbe.extra(6));
      await recovered(page);
      const refused = await page.evaluate(() => window.integrationProbe.enable());
      expect(refused.mode).toBe("dom");
      expect(refused.reason).toMatch(/Layer-count admission budget/);
      await page.locator("#count").click();
      await expect(page.locator("#count")).toHaveText("Count 1");
      await page.evaluate(() => window.integrationProbe.extra(0));
      expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
      const disposed = await page.evaluate(() => window.integrationProbe.dispose());
      zero(disposed);
      await save(`pending-admission-${dpr}`, { fixture: "Actual public mapAsync held after real mapping; stale admission never shown", barrier, stale, refused, disposed });
    } finally { await page.close(); }
  });

  // Uses the 8-layer GPU performance fixture: hover styling, typing, selection and ten rapid `fill()` edits must
  // reach the canvas. Paint events are recorded. A manual `requestPaint()` with no attribution must recapture
  // every layer (at least 8 captures for the 8 layers). Finally the GPU screenshot is compared with the DOM one:
  // both must show the expected background colour (245, 196, 41) at frame pixel (60, 200); the number of
  // differing bytes is only recorded.
  test(`root-attributed native paint, hover, selection, styles and rapid edits DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await page.goto("/performance.html?layers=8&variant=gpu-static");
      await page.waitForFunction(() => window.measurement);
      await page.evaluate(() => {
        const sheet = document.createElement("style");
        // Adds a hover style so a real mouse hover must change the canvas pixels.
        sheet.textContent = "#measurement-input:hover { background: rgb(20,200,90) }";
        document.head.append(sheet);
        window.paintAttribution = [];
        document.querySelector("#output").addEventListener("paint", event => {
          if (window.paintAttribution.length < 128) window.paintAttribution.push({
            constructor: event.constructor.name, changedElements: event.changedElements?.map(node => ({
              id: node.id, tag: node.tagName, persistentRoot: node === document.querySelector(".app-container"),
            })),
          });
        });
      });
      await page.mouse.move(850, 700);
      const beforeHover = PNG.sync.read(await page.locator("#frame").screenshot());
      await page.locator("#measurement-input").hover();
      const hovered = PNG.sync.read(await page.locator("#frame").screenshot());
      expect(hovered.data.equals(beforeHover.data)).toBe(false);
      await page.locator("#measurement-input").click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("native-edits");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      expect(await page.locator("#measurement-input").evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual([0, 1]);
      for (let edit = 0; edit < 10; edit++) await page.locator("#measurement-input").fill(`rapid-${edit}`);
      await page.mouse.move(850, 700);
      await page.locator("#measurement-input").evaluate(node => node.blur());
      await page.evaluate(async () => {
        document.querySelector("#measurement-input").style.letterSpacing = "2px";
        document.querySelector('label[for="measurement-input"]').style.fontFamily = "monospace";
        await document.fonts.ready;
      });
      await page.waitForTimeout(300);
      const beforeUnknown = await page.evaluate(() => window.measurement.state());
      await page.evaluate(() => document.querySelector("#output").requestPaint());
      await page.waitForTimeout(300);
      const afterUnknown = await page.evaluate(() => window.measurement.state());
      expect(afterUnknown.metrics.captures - beforeUnknown.metrics.captures).toBeGreaterThanOrEqual(8);
      expect(await page.locator("#measurement-input").inputValue()).toBe("rapid-9");
      expect(afterUnknown.mode).toBe("gpu");
      await mkdir(directory, { recursive: true });
      const png = await page.locator("#frame").screenshot({ path: `${directory}/native-edit-${dpr}.png` });
      expect(PNG.sync.read(png).data.equals(beforeHover.data)).toBe(false);
      await page.evaluate(() => window.measurement.disable());
      const dom = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/native-edit-dom-${dpr}.png` }));
      const gpu = PNG.sync.read(png);
      const differingBytes = dom.data.reduce((sum, value, index) => sum + Number(value !== gpu.data[index]), 0);
      expect(gpu.width).toBe(dom.width);
      expect(gpu.height).toBe(dom.height);
      for (const image of [gpu, dom]) {
        const offset = (200 * dpr * image.width + 60 * dpr) * 4;
        expect([...image.data.subarray(offset, offset + 4)]).toEqual([245, 196, 41, 255]);
      }
      const attribution = await page.evaluate(() => window.paintAttribution);
      // Current paint delivery does not promise the former changedElements field.
      expect(attribution.length).toBeGreaterThan(0);
      const disposed = await page.evaluate(() => window.measurement.dispose());
      zero(disposed);
      await save(`native-paint-${dpr}`, { attribution, beforeUnknown, afterUnknown, differingBytes, disposed,
        limit: "Native root attribution cannot safely identify only the edited layer. Unknown payload test is synthetic; normal root-wide invalidation remains enabled. DPR2 native capture text rasterization is not pixel-equivalent to ordinary DOM text." });
    } finally { await page.close(); }
  });

  // On the TODO app: form entry, a checkbox toggled with Space and a title edited with the keyboard. Switching to
  // DOM and back must preserve the title's selection and focus, and a modal delete confirmation hides the list.
  test(`TODO native form, task state, keyboard selection and DPR geometry DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await page.goto("/todo.html");
      await page.waitForFunction(() => window.todoProbe);
      expect((await page.evaluate(() => window.todoProbe.controller().enable())).mode).toBe("gpu");
      await page.getByLabel("New task", { exact: true }).fill("Phase9 native");
      await page.getByLabel("New task", { exact: true }).press("Enter");
      await page.getByLabel("Complete task 3", { exact: true }).focus();
      await page.keyboard.press("Space");
      await expect(page.getByLabel("Complete task 3", { exact: true })).toBeChecked();
      const title = page.getByLabel("Task 3 title", { exact: true });
      await title.fill("Native task DPR");
      await title.press("Home");
      await title.press("Shift+ArrowRight");
      const before = await title.evaluate(node => [node.selectionStart, node.selectionEnd]);
      const gpu = await page.evaluate(() => window.todoProbe.state());
      await page.evaluate(() => window.todoProbe.controller().disable());
      expect(await title.evaluate(node => [node.selectionStart, node.selectionEnd])).toEqual(before);
      await expect(title).toBeFocused();
      await expect(title).toHaveValue("Native task DPR");
      expect((await page.evaluate(() => window.todoProbe.controller().enable())).mode).toBe("gpu");
      await page.getByLabel("Delete task 3", { exact: true }).click();
      // The modal confirmation hides the task list from assistive technology (getByRole excludes aria-hidden).
      await expect(page.getByRole("dialog", { name: "Delete task?" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Task 3 title", exact: true })).toHaveCount(0);
      const disposed = await page.evaluate(() => window.todoProbe.dispose());
      zero(disposed);
      await save(`todo-native-${dpr}`, { gpu, before, disposed });
    } finally { await page.close(); }
  });

  // Effects with continuous layout change: with a ripple, chromatic effect and a motion running, moving the art
  // element must keep GPU and the output visible. Cancelling ends them with `cancelled`; reduced motion refuses
  // to play an effect; forced colors keeps GPU and the title input stays editable.
  test(`effects/native overlay, media and continuous active-effect layout DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await page.goto("/effects.html");
      await page.waitForFunction(() => window.effectsProbe?.state().mode === "gpu" && !window.effectsProbe.state().initializing);
      await page.locator("#title").fill("Phase9 poster");
      await page.locator("#save").click();
      await expect(page.locator("#saved")).toHaveText("Phase9 poster");
      await page.locator("#dialog-open").focus();
      await page.keyboard.press("Space");
      await expect(page.locator("#dialog-input")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator("#dialog-open")).toBeFocused();
      const barrier = await page.evaluate(async () => {
        const probe = window.effectsProbe;
        window.originalTitle = document.querySelector("#title");
        window.dynamicEffect = probe.apply([probe.descriptor("ripple", .4, true), probe.descriptor("chromatic", .4, true)]);
        window.dynamicMotion = probe.controller().transition("art", {
          keyframes: [{ offset: 0 }, { offset: 1, x: 10 }], timing: { duration: 60000 },
        });
        document.querySelector("#art").style.left = "340px";
        await Promise.resolve();
        return { state: probe.state(), hidden: document.querySelector("#output").hidden };
      });
      expect(barrier.state.mode).toBe("gpu");
      expect(barrier.hidden).toBe(false);
      const outcomes = await page.evaluate(async () => {
        window.dynamicEffect.cancel(); window.dynamicMotion.cancel();
        return { effect: await window.dynamicEffect.finished, motion: await window.dynamicMotion.finished,
          same: window.originalTitle === document.querySelector("#title") };
      });
      expect(outcomes.effect.status).toBe("cancelled");
      expect(outcomes.motion.status).toBe("cancelled");
      expect(outcomes.same).toBe(true);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const refusal = await page.evaluate(() => {
        try { window.effectsProbe.apply([window.effectsProbe.descriptor("ripple", 0, true)]).play(); }
        catch (error) { return String(error); }
      });
      expect(refusal).toMatch(/reduced motion/i);
      await page.emulateMedia({ forcedColors: "active" });
      await page.waitForFunction(() => window.effectsProbe.state().mode === "gpu");
      await page.locator("#title").fill("Usable forced colors");
      const disposed = await page.evaluate(() => window.effectsProbe.dispose());
      zero(disposed);
      await save(`effects-native-${dpr}`, { barrier, outcomes, refusal, disposed });
    } finally { await page.close(); }
  });
}
