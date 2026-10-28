/**
 * Browser suite for animation ownership on the playground page `paired.html` (`paired-demo.tsx`), driven
 * through `window.pairedProbe`. `example=css` enrolls plain DOM sections (`#legacy`) whose animation comes
 * from a CSS rule; `example=typed` uses `Surface` components (`#authored`) with an authored Web Animation.
 * `strict` loads the Vite development server with React StrictMode. A second, decorative layer
 * (`*-art`) carries a ripple effect.
 *
 * The runtime can take ownership of a source animation of transform and opacity while GPU is on: it seeks
 * the source (detached, paused) and presents its values as GPU matrices, then restores the original
 * declarations and phase on release, disable, failure or device loss. The suite proves that GPU pixels
 * match the browser's own computed animation values, that GPU stays active while motion runs without
 * React commits or captures, that unsupported or conflicting authored styles are rejected atomically
 * with a diagnosis, and that the original root, controls and native state survive every exit path.
 * Reports and screenshots go to the `animation` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";

import { evidenceDirectory } from "../helpers/evidence.mjs";
const directory = evidenceDirectory("animation");
/** Writes one named JSON report into this suite's evidence directory. */
async function save(name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
/** Opens `paired.html` for `example` ("css" or "typed"); the probe starts in ordinary DOM until `enable()`. */
async function ready(page, example = "typed", strict = false) {
  await page.goto(`${strict ? developmentURL : ""}/paired.html?example=${example}${strict ? "&strict" : ""}`);
  await page.waitForFunction(() => window.pairedProbe && document.querySelector("#counter"));
}
/** Screenshots `#frame` and returns the decoded PNG plus `at(x, y)`, the RGBA at frame-local pixel (x, y). */
async function pixels(page, name) {
  await mkdir(directory, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
  return { png, at(x, y) { const offset = (Math.round(y) * png.width + Math.round(x)) * 4; return [...png.data.subarray(offset, offset + 4)]; } };
}
/** Asserts that disposal released every GPU and runtime resource, animation owner and demo listener. */
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
  expect(state.demoListeners).toBe(0);
}

// Authored declarations written after ownership began (opacity, !important, removal, transform-origin,
// individual `translate`/`rotate`/`scale`, an unrelated property, a React-driven opacity, and edits on
// the unowned art layer) must survive every way ownership ends: release, disable, or a failure that
// falls back to DOM. The restored inline style must equal what the author last wrote, not the value
// captured when ownership started. The "unrelated" case must not cause a fallback by itself.
for (const example of ["css", "typed"]) test(`later authored declarations survive release, disable and failure ${example}`, async ({ page }) => {
  const reports = [];
  for (const path of ["release", "disable", "failure"]) for (const fault of ["opacity", "important", "removal", "transform-removal", "origin", "priority", "translate", "rotate", "scale", "unrelated", "unowned-opacity", "unowned-removal", ...(example === "css" ? ["react"] : [])]) {
    await ready(page, example);
    await page.evaluate(() => {
      window.originalRoot = window.pairedProbe.controller().container;
      window.originalInput = document.querySelector("#name");
    });
    expect((await page.evaluate(() => window.pairedProbe.enable())).mode).toBe("gpu");
    const expected = await page.evaluate(fault => {
      const element = document.getElementById(fault.startsWith("unowned-") ? window.pairedProbe.state().artId : window.pairedProbe.state().id);
      if (fault === "opacity") element.style.setProperty("opacity", "0.4");
      if (fault === "important") element.style.setProperty("opacity", "0.4", "important");
      if (fault === "removal") element.style.removeProperty("opacity");
      if (fault === "transform-removal") element.style.removeProperty("transform");
      if (fault === "origin") element.style.setProperty("transform-origin", "10px 20px", "important");
      if (fault === "priority") element.style.setProperty("opacity", "1");
      if (fault === "translate") element.style.translate = "30px";
      if (fault === "rotate") element.style.rotate = "10deg";
      if (fault === "scale") element.style.scale = "0.9";
      if (fault === "unrelated") element.style.color = "rgb(10, 20, 30)";
      if (fault === "unowned-opacity") element.style.opacity = "0.4";
      if (fault === "unowned-removal") element.style.removeProperty("opacity");
      if (fault === "react") window.pairedProbe.reactPresentation(0.4);
      // The inline property each fault touches, so the same property can be compared after ownership ends.
      const property = ({ removal: "opacity", important: "opacity", react: "opacity", priority: "opacity",
        "transform-removal": "transform", origin: "transform-origin", unrelated: "color",
        "unowned-opacity": "opacity", "unowned-removal": "opacity" })[fault] ?? fault;
      return { property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) };
    }, fault);
    if (path === "release") await page.evaluate(() => window.pairedProbe.playback().release());
    if (path === "disable") await page.evaluate(() => window.pairedProbe.disable());
    if (path === "failure" && fault === "unrelated") {
      expect((await page.evaluate(() => window.pairedProbe.state())).mode).toBe("gpu");
      await page.evaluate(() => window.pairedProbe.disable());
    }
    await page.waitForFunction(() => window.pairedProbe.state().mode === "dom");
    const result = await page.evaluate(({ expected, fault }) => {
      const element = document.getElementById(fault.startsWith("unowned-") ? window.pairedProbe.state().artId : window.pairedProbe.state().id);
      return { state: window.pairedProbe.state(),
        declaration: { property: expected.property, value: element.style.getPropertyValue(expected.property), priority: element.style.getPropertyPriority(expected.property) },
        same: window.originalRoot === window.pairedProbe.controller().container && window.originalInput === document.querySelector("#name") };
    }, { expected, fault });
    expect(result.declaration, `${example}/${path}/${fault}`).toEqual(expected);
    expect(result.same).toBe(true);
    expect(result.state.runtimeResources.animationOwners).toBe(0);
    if (path === "failure" && fault !== "unrelated") expect(result.state.reason).toMatch(/ownership|declaration|transform/i);
    await page.locator("#counter").click();
    await expect(page.locator("#counter")).toHaveText("Count 1");
    await page.locator("#name").fill("preserved-write");
    await page.locator("#name").press("Enter");
    await expect(page.locator("#saved")).toHaveText("preserved-write");
    const disposed = await page.evaluate(() => window.pairedProbe.dispose());
    zero(disposed);
    reports.push({ path, fault, expected, result, disposed });
  }
  await save(`later-declarations-${example}`, reports);
});

// If admission fails after React re-authored the presentation, the later React opacity must remain
// rather than being overwritten by the values saved when the lease began.
test("admission failure preserves later React presentation rather than original lease values", async ({ page }) => {
  await ready(page, "css");
  await page.evaluate(() => {
    const draw = GPUQueue.prototype.drawElementImageToTexture;
    let changed = false;
    GPUQueue.prototype.drawElementImageToTexture = function(...args) {
      draw.apply(this, args);
      if (!changed) {
        changed = true;
        queueMicrotask(() => window.pairedProbe.reactPresentation(0.4));
      }
      throw new Error("Injected admission failure after later React presentation");
    };
  });
  const recovered = await page.evaluate(() => window.pairedProbe.enable());
  expect(recovered.mode).toBe("dom");
  expect(await page.locator("#legacy").evaluate(element => element.style.opacity)).toBe("0.4");
  expect(recovered.runtimeResources.animationOwners).toBe(0);
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("later-react-admission-failure", { recovered, disposed });
});

// Public numeric motion (`createMotion`): invalid keyframes (scale 0) are rejected without touching the
// element; a motion owned before admission survives disable(); once GPU is on, the motion drives
// pixels at the sought time, then release hands the phase back to a native animation on the same element
// (visible as identical DOM pixels), and disposing the motion cancels it while a replacement keeps the
// shared source alive until it is disposed too.
test("public numeric motion owns pixels, native behavior, DOM phase and source lifetime", async ({ page }) => {
  await ready(page);
  const invalid = await page.evaluate(async () => {
    await window.pairedProbe.motion().dispose();
    const controller = window.pairedProbe.controller(), id = window.pairedProbe.state().id;
    const element = document.getElementById(id), before = element.style.cssText;
    let error;
    try { controller.createMotion(id, { keyframes: [{ offset: 0 }, { offset: 1, scaleX: 0 }], timing: { duration: 1000 } }); } catch (failure) { error = String(failure); }
    return { error, before, after: element.style.cssText, animations: element.getAnimations().length, state: controller.state() };
  });
  expect(invalid.error).toBeTruthy();
  expect(invalid.before).toBe(invalid.after);
  expect(invalid.animations).toBe(0);
  expect(invalid.state.runtimeResources.nativeMotions).toBe(0);
  const beforeAdmission = await page.evaluate(async () => {
    const controller = window.pairedProbe.controller(), id = window.pairedProbe.state().id;
    const handle = controller.createMotion(id, { keyframes: [{ offset: 0 }, { offset: 1 }], timing: { duration: 1000 } });
    handle.own();
    document.getElementById(id).style.opacity = "0.4";
    await controller.disable();
    await controller.disable();
    const value = document.getElementById(id).style.opacity;
    await handle.dispose();
    controller.setTransform(id, {});
    return { value, state: controller.state() };
  });
  expect(beforeAdmission.value).toBe("0.4");
  expect(beforeAdmission.state.runtimeResources.nativeMotions).toBe(0);
  await page.evaluate(async () => {
    const controller = window.pairedProbe.controller();
    window.numericMotion = controller.createMotion(window.pairedProbe.state().id, {
      keyframes: [{ offset: 0 }, { offset: 1, x: 70, y: 20, rotation: 10, scaleX: 0.85, scaleY: 0.85, opacity: 0.5 }],
      timing: { duration: 1000, delay: 100, direction: "alternate", iterations: Infinity, fill: "both" },
    });
    window.numericMotion.seek(100);
    window.numericMotion.own();
    await controller.enable();
    window.numericMotion.seek(600);
    await controller.settle();
  });
  // Sought at 600 ms with delay 100 ms and duration 1000 ms, the animation is halfway: opacity 0.75 over
  // white gives about (244,86,109) for the red layer, sampled at frame pixel (190,220). Tolerance 2 per
  // channel covers blend rounding.
  const gpu = (await pixels(page, "numeric-motion-gpu")).at(190, 220);
  [244, 86, 109].forEach((value, index) => expect(Math.abs(gpu[index] - value)).toBeLessThanOrEqual(2));
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  const released = await page.evaluate(async () => {
    await window.numericMotion.release();
    const source = window.numericMotion.nativeAnimation;
    return { playback: window.numericMotion.state(), target: source.effect.target === document.getElementById(window.pairedProbe.state().id), state: window.pairedProbe.state() };
  });
  expect(released.target).toBe(true);
  expect(released.playback.sourceTime).toBe(600);
  expect(released.state.runtimeResources.nativeMotions).toBe(1);
  expect((await pixels(page, "numeric-motion-dom")).at(190, 220)).toEqual(gpu);
  const sourceDisposed = await page.evaluate(async () => {
    await window.numericMotion.dispose();
    const controller = window.pairedProbe.controller(), id = window.pairedProbe.state().id;
    const replacement = controller.createMotion(id, { keyframes: [{ offset: 0 }, { offset: 1 }], timing: { duration: 1000 } });
    await window.numericMotion.dispose();
    const retained = controller.state().runtimeResources.nativeMotions;
    await replacement.dispose();
    return { retained, canceled: window.numericMotion.nativeAnimation.playState, state: controller.state() };
  });
  expect(sourceDisposed.retained).toBe(1);
  expect(sourceDisposed.canceled).toBe("idle");
  expect(sourceDisposed.state.runtimeResources.nativeMotions).toBe(0);
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("numeric-motion", { invalid, beforeAdmission, gpu, released, sourceDisposed, disposed });
});

// Seeking the owned source (detached and paused by the runtime) must give deterministic pixels at
// 100/600/1100/1600 ms, while the original controls keep working. Release restores the same animation
// effect at the same time.
for (const example of ["css", "typed"]) test(`transactional ${example} source, deterministic pixels and original native state`, async ({ page }) => {
  await ready(page, example);
  await page.evaluate(() => {
    window.originalRoot = window.pairedProbe.controller().container;
    window.originalInput = document.querySelector("#name");
    document.getElementById(window.pairedProbe.state().id).style.setProperty("transform-origin", "0px 0px", "important");
  });
  const original = await page.evaluate(() => window.pairedProbe.state());
  expect((await page.evaluate(() => window.pairedProbe.enable())).mode).toBe("gpu");
  const observations = [];
  for (const time of [100, 600, 1100, 1600]) {
    const state = await page.evaluate(time => window.pairedProbe.seek(time), time);
    // Progress through the opacity 1 -> 0.5 keyframes: start, midpoint, end, and midpoint again at 1600 ms.
    const fraction = time === 100 ? 0 : time === 1100 ? 1 : 0.5;
    expect(state.source.detached).toBe(true);
    expect(state.source.state).toBe("paused");
    expect(state.source.time).toBe(time);
    expect(state.source.transform).toBe("none");
    expect(state.source.opacity).toBe("1");
    expect(state.layers.find(layer => layer.id === state.id).transform.opacity).toBe(1 - fraction * 0.5);
    const image = await pixels(page, `${example}-${time}`);
    // The marker follows the layer's 70 px translation; expected colour is the red layer at `alpha` over
    // white, within 2 per channel.
    const marker = image.at(170 + fraction * 70, 220);
    const alpha = 1 - fraction * 0.5;
    marker.slice(0, 3).forEach((value, index) => expect(Math.abs(value - ([240, 30, 60][index] * alpha + 255 * (1 - alpha)))).toBeLessThanOrEqual(2));
    observations.push({ time, state, marker });
  }
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  await page.locator("label").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("same-native");
  await page.keyboard.press("Enter");
  await expect(page.locator("#saved")).toHaveText("same-native");
  const released = await page.evaluate(async () => { await window.pairedProbe.playback().release(); return window.pairedProbe.state(); });
  expect(released.source.sameEffect).toBe(true);
  expect(released.source.time).toBe(1600);
  expect(released.source.state).toBe("paused");
  // Typed React commits re-author the top-left style without the injected
  // priority; release preserves that current declaration rather than reviving it.
  expect(released.source.declarations).toBe(example === "typed"
    ? original.source.declarations.replace("0px 0px !important", "0px 0px") : original.source.declarations);
  expect(released.source.opacity).toBe("0.75");
  expect(await page.evaluate(() => window.originalRoot === window.pairedProbe.controller().container && window.originalInput === document.querySelector("#name"))).toBe(true);
  await expect(page.locator("#name")).toHaveValue("same-native");
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save(`source-${example}`, { original, observations, released, disposed });
});

// Sources the GPU path cannot reproduce exactly (extra properties, percentages, steps easing, singular
// matrices, additive composite, authored origin, !important or stylesheet overrides, imports,
// `@scope`, overlapping animations, individual transform properties) must be refused by
// `ownAnimation` with an error, leaving styles, time, play state and effect unchanged and no owner.
test("unsupported and precedence/conflicting source rejection is atomic", async ({ page }) => {
  const reports = [];
  for (const fault of ["property", "percentage", "steps", "singular", "composite", "origin", "important", "stylesheet-important", "stylesheet-import", "stylesheet-scope", "overlap", "individual"]) {
    await ready(page);
    const result = await page.evaluate(fault => {
      const source = window.pairedProbe.source(), element = document.getElementById(window.pairedProbe.state().id);
      const effect = source.effect;
      if (fault === "property") effect.setKeyframes([{ transform: "none", opacity: 1, color: "red" }, { transform: "none", opacity: 0.5, color: "blue" }]);
      if (fault === "percentage") effect.setKeyframes([{ transform: "translate(0%, 0px) rotate(0deg) scale(1)", opacity: 1 }, { transform: "translate(10%, 0px) rotate(0deg) scale(1)", opacity: 0.5 }]);
      if (fault === "steps") effect.updateTiming({ easing: "steps(2)" });
      if (fault === "singular") {
        effect.setKeyframes([{ transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 }, { transform: "translate(10px, 0px) rotate(0deg) scale(0.01)", opacity: 0.5 }]);
        effect.updateTiming({ easing: "cubic-bezier(0.2,-2,0.8,3)" });
      }
      if (fault === "composite") effect.composite = "add";
      if (fault === "origin") element.style.transformOrigin = "50% 50%";
      if (fault === "important") element.style.setProperty("opacity", "0.4", "important");
      if (fault === "stylesheet-important") {
        const style = document.createElement("style");
        style.textContent = `#${element.id} { transform: none !important; opacity: 1 !important; }`;
        document.head.append(style);
      }
      if (fault === "stylesheet-import" || fault === "stylesheet-scope") {
        const style = document.createElement("style");
        style.textContent = fault === "stylesheet-import"
          // An imported sheet is inspected (or, if unreadable, caught by computed-style verification).
          ? `@import url("data:text/css,${encodeURIComponent(`#${element.id} { opacity: 1 !important; }`)}");`
          : `@scope (body) { #${element.id} { opacity: 1 !important; } }`;
        document.head.append(style);
      }
      if (fault === "overlap") { const other = element.animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 1000, fill: "both" }); other.pause(); }
      if (fault === "individual") element.style.translate = "1px";
      const before = { styles: element.style.cssText, time: source.currentTime, state: source.playState };
      let error;
      try { window.pairedProbe.controller().ownAnimation(window.pairedProbe.state().id, source); } catch (failure) { error = String(failure); }
      return { fault, error, before, after: { styles: element.style.cssText, time: source.currentTime, state: source.playState }, same: source.effect === effect,
        owners: window.pairedProbe.state().runtimeResources.animationOwners };
    }, fault);
    expect(result.error).toBeTruthy();
    expect(result.after).toEqual(result.before);
    expect(result.same).toBe(true);
    expect(result.owners).toBe(0);
    reports.push(result);
    zero(await page.evaluate(() => window.pairedProbe.dispose()));
  }
  // Same checks for CSS-rule provenance: a keyframe using a variable, or an !important override, is rejected.
  for (const fault of ["variable", "important", "stylesheet-important"]) {
    await ready(page, "css");
    const result = await page.evaluate(fault => {
      const { keyframes } = window.pairedProbe.cssProvenance();
      const element = document.getElementById("legacy"), source = window.pairedProbe.source(), effect = source.effect;
      if (fault === "variable") {
        element.style.setProperty("--distance", "70px");
        keyframes.cssRules[1].style.transform = "translate(var(--distance), 20px) rotate(10deg) scale(0.85)";
      } else if (fault === "important") element.style.setProperty("opacity", "0.4", "important");
      else {
        const style = document.createElement("style");
        style.textContent = "#legacy { transform: none !important; opacity: 1 !important; }";
        document.head.append(style);
      }
      const before = element.style.cssText;
      let error;
      try { window.pairedProbe.controller().ownCSSAnimation("legacy", window.pairedProbe.cssProvenance()); } catch (failure) { error = String(failure); }
      return { fault, error, before, after: element.style.cssText, same: source.effect === effect, frames: effect.getKeyframes() };
    }, fault);
    expect(result.error).toBeTruthy();
    expect(result.before).toBe(result.after);
    expect(result.same).toBe(true);
    reports.push(result);
    zero(await page.evaluate(() => window.pairedProbe.dispose()));
  }
  await save("atomic-rejections", reports);
});

// The decorative ripple changes only its own 200x200 region (more than 3000 pixels differ per step),
// leaves the essential content untouched, matches the DOM when amplitude is 0, and never alters native
// geometry. Then 300 owned frames (advance(300)) must cost zero React commits, captures, copies,
// readbacks and uploads, and a later React commit must recapture.
for (const example of ["css", "typed"]) for (const strict of [false, true]) test(`decorative refraction and 300 zero-work owned frames ${example} strict=${strict}`, async ({ page }) => {
  await ready(page, example, strict);
  const domImage = (await pixels(page, `ripple-${example}-${strict}-dom`)).png.data;
  expect((await page.evaluate(() => window.pairedProbe.enable())).mode).toBe("gpu");
  await page.evaluate(() => window.pairedProbe.seek(600));
  const originalGeometry = await page.evaluate(() => window.pairedProbe.state().layers);
  const images = [];
  for (const effect of [{ amplitude: 0, seconds: 0 }, { amplitude: 8, seconds: 0 }, { amplitude: 8, seconds: 0.7 }]) {
    await page.evaluate(async value => {
      window.pairedProbe.controller().setRipple(window.pairedProbe.state().artId, value);
      await window.pairedProbe.controller().settle();
    }, effect);
    const image = await pixels(page, `ripple-${example}-${strict}-${images.length}`);
    images.push(image.png.data);
    const geometry = await page.evaluate(() => window.pairedProbe.state().layers);
    expect(geometry).toEqual(originalGeometry);
  }
  // Counts pixels whose RGB differs inside `area` (frame-local); the frame is 640 CSS pixels wide at DPR 1.
  function differences(a, b, area) {
    let changed = 0;
    for (let y = area.y; y < area.y + area.height; y++) for (let x = area.x; x < area.x + area.width; x++) {
      const offset = (y * 640 + x) * 4;
      if (a[offset] !== b[offset] || a[offset + 1] !== b[offset + 1] || a[offset + 2] !== b[offset + 2]) changed++;
    }
    return changed;
  }
  const decorative = { x: 380, y: 60, width: 200, height: 200 }, essential = { x: 0, y: 0, width: 360, height: 350 };
  const changed = [differences(images[0], images[1], decorative), differences(images[1], images[2], decorative)];
  expect(differences(domImage, images[0], decorative)).toBe(0);
  changed.forEach(value => expect(value).toBeGreaterThan(3000));
  expect(differences(images[0], images[2], essential)).toBe(0);
  const cdp = await page.context().newCDPSession(page);
  const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
  await cdp.detach();
  await page.locator("h1").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.pairedProbe.controller().settle());
  const interval = await page.evaluate(async () => {
    const before = window.pairedProbe.state();
    const frames = await window.pairedProbe.controller().advance(300);
    return { before, after: window.pairedProbe.state(), frames };
  });
  expect(interval.frames.after.metrics.gpuFrames - interval.frames.before.metrics.gpuFrames).toBe(300);
  expect(interval.after.commits.count).toBe(interval.before.commits.count);
  for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(interval.after.metrics[key]).toBe(interval.before.metrics[key]);
  expect(interval.after.metrics.admission).toEqual(interval.before.metrics.admission);
  expect(interval.after.source.detached).toBe(true);
  // 300 frames are expected to advance the source by 5000 ms and the ripple by 5 s.
  expect(interval.after.source.time).toBeCloseTo(interval.before.source.time + 5000, 6);
  expect(interval.after.decorativeEffects[0].seconds).toBeCloseTo(interval.before.decorativeEffects[0].seconds + 5, 6);
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  const dirty = await page.evaluate(async () => { await window.pairedProbe.controller().settle(); return window.pairedProbe.state(); });
  expect(dirty.metrics.captures).toBeGreaterThan(interval.after.metrics.captures);
  expect(dirty.metrics.perLayer[dirty.artId].uploads).toBeGreaterThanOrEqual(interval.after.metrics.perLayer[dirty.artId].uploads);
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save(`ripple-motion-${example}-${strict}`, { environment, originalGeometry, changed, interval, dirty, disposed });
});

// Twenty enable/seek/disable rounds must restore the original declarations and the same animation effect
// every time, and leave no owners, frames, replacement sources or GPU resources behind.
for (const example of ["css", "typed"]) test(`twenty ownership/release transactions preserve source declarations ${example}`, async ({ page }) => {
  await ready(page, example);
  const original = await page.evaluate(() => window.pairedProbe.state().source.declarations);
  const cycles = [];
  for (let index = 0; index < 20; index++) {
    const active = await page.evaluate(() => window.pairedProbe.enable());
    expect(active.mode).toBe("gpu");
    expect(active.runtimeResources.animationOwners).toBe(1);
    expect(active.runtimeResources.decorativeEffects).toBe(1);
    await page.evaluate(time => window.pairedProbe.seek(time), 100 + index * 20);
    const retired = await page.evaluate(() => window.pairedProbe.disable());
    expect(retired.source.declarations).toBe(original);
    expect(retired.source.sameEffect).toBe(true);
    expect(retired.source.time).toBe(100 + index * 20);
    expect(retired.runtimeResources.animationOwners).toBe(0);
    expect(retired.runtimeResources.cssReplacementSources).toBe(0);
    expect(retired.runtimeResources.decorativeEffects).toBe(0);
    expect(retired.runtimeResources.controllerFrames).toBe(0);
    for (const key of ["engines", "textures", "effects", "renderers", "stagingCanvases", "pendingCleanups", "probeReadbacks"]) expect(retired.resources[key]).toBe(0);
    expect(await page.evaluate(() => document.querySelector("#counter").getAnimations().length === 0
      && document.getElementById(window.pairedProbe.state().id).getAnimations().length === 1)).toBe(true);
    cycles.push({ index, active, retired });
  }
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save(`ownership-cycles-${example}`, { cycles, disposed });
});

// Playback control under GPU (play, pause, seek), reduced motion pausing playback, and a real device
// destroy while playing: the logical source phase must be restored to a running native animation at or
// after the time reached.
test("play/pause/seek, reduced motion and actual device loss restore logical source phase", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.pairedProbe.enable());
  await page.evaluate(() => { window.pairedProbe.playback().play(); window.pairedProbe.controller().setRipple(window.pairedProbe.state().artId, { amplitude: 8, seconds: 0, playing: true }); });
  await page.waitForTimeout(150);
  const played = await page.evaluate(() => window.pairedProbe.state());
  expect(played.playback.milliseconds).toBeGreaterThan(100);
  await page.evaluate(() => {
    window.pairedProbe.playback().pause();
    const state = window.pairedProbe.state();
    window.pairedProbe.controller().setRipple(state.artId, { amplitude: 8, seconds: state.decorativeEffects[0].seconds });
  });
  const paused = await page.evaluate(() => window.pairedProbe.state());
  await page.waitForTimeout(100);
  expect((await page.evaluate(() => window.pairedProbe.state())).playback.milliseconds).toBe(paused.playback.milliseconds);
  await page.evaluate(() => window.pairedProbe.seek(600));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(50);
  expect((await page.evaluate(() => window.pairedProbe.state())).playback.playing).toBe(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => window.pairedProbe.playback().play());
  const lossAt = await page.evaluate(() => {
    const state = window.pairedProbe.state();
    document.querySelector("#output").getContext("webgpu").getConfiguration().device.destroy();
    return state;
  });
  await page.waitForFunction(() => window.pairedProbe.state().mode === "dom" && !window.pairedProbe.state().transitioning);
  const recovered = await page.evaluate(() => window.pairedProbe.state());
  expect(recovered.metrics.deviceLossCount).toBe(1);
  expect(recovered.source.sameEffect).toBe(true);
  expect(recovered.source.state).toBe("running");
  expect(recovered.source.time).toBeGreaterThanOrEqual(lossAt.playback.milliseconds);
  expect(recovered.runtimeResources.animationOwners).toBe(0);
  expect(recovered.runtimeResources.decorativeEffects).toBe(0);
  await page.evaluate(() => { window.pairedProbe.source().pause(); window.pairedProbe.source().currentTime = 600; });
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("playback-loss", { played, paused, lossAt, recovered, disposed, lossKind: "Explicit configured-device destruction, not physical GPU-reset proof" });
});

// While the source is GPU-owned, direct transforms, ripples on the owned layer, out-of-range ripple
// amplitude and re-owning must all throw, and the previous layers and effects must be unchanged.
test("owned-source conflict and interactive ripple rejection preserve prior state", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.pairedProbe.enable());
  const rejected = await page.evaluate(() => {
    const controller = window.pairedProbe.controller(), before = window.pairedProbe.state(), errors = [];
    for (const operation of [() => controller.setTransform(before.id, { x: 5 }),
      () => controller.setRipple(before.id, { amplitude: 8, seconds: 0 }),
      () => controller.setRipple(before.artId, { amplitude: 100, seconds: 0 }),
      () => controller.ownAnimation(before.id, window.pairedProbe.source())]) {
      try { operation(); } catch (error) { errors.push(String(error)); }
    }
    return { before, after: window.pairedProbe.state(), errors };
  });
  expect(rejected.errors).toHaveLength(4);
  expect(rejected.after.layers).toEqual(rejected.before.layers);
  expect(rejected.after.decorativeEffects).toEqual(rejected.before.decorativeEffects);
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("owned-conflicts", { ...rejected, disposed });
});

// Editing the CSS keyframes rule that was translated to GPU makes the translation stale. The runtime
// must fall back to DOM with a "provenance changed" diagnosis instead of presenting changed values.
test("CSS source-rule mutation falls back instead of translating a changed dependency", async ({ page }) => {
  await ready(page, "css");
  await page.evaluate(() => window.pairedProbe.enable());
  await page.evaluate(() => {
    window.pairedProbe.cssProvenance().keyframes.cssRules[1].style.setProperty("opacity", "0.2");
    window.pairedProbe.playback().play();
  });
  await page.waitForFunction(() => window.pairedProbe.state().mode === "dom" && !window.pairedProbe.state().transitioning);
  const recovered = await page.evaluate(() => window.pairedProbe.state());
  expect(recovered.reason).toContain("provenance changed");
  expect(recovered.source.detached).toBe(false);
  expect(recovered.runtimeResources.animationOwners).toBe(0);
  await page.evaluate(() => { window.pairedProbe.source().pause(); window.pairedProbe.source().currentTime = 100; });
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  zero(await page.evaluate(() => window.pairedProbe.dispose()));
  await save("changed-css-rule", recovered);
});

// Oracle test: for each easing and direction, record the browser's own computed transform, opacity and
// progress for the source at sample times, then require the GPU matrices and pixels to agree. The
// `+ 40` and `+ 50` convert the computed transform (relative to the layer) to frame coordinates by
// adding the layer's position. The layer-local point (150,220) is mapped through the matrix for the
// pixel check. Tolerances: matrix 1e-3, opacity 4 digits, colour 2 per channel.
test("native WAAPI oracle: standard and overshoot easing, alternate boundaries, GPU pixels", async ({ page }) => {
  await ready(page);
  const records = [];
  for (const easing of ["linear", "ease", "ease-in", "ease-out", "ease-in-out", "cubic-bezier(0.3,0.1,0.7,0.9)", "cubic-bezier(0.2,-2,0.8,3)"]) {
    for (const direction of ["normal", "alternate"]) {
      const times = [0, 100, 204, 400, 600, 996, 1100, 1600, 2100];
      const native = await page.evaluate(({ easing, direction, times }) => {
        const source = window.pairedProbe.source();
        source.effect.updateTiming({ easing, direction, iterations: 2 });
        source.pause();
        const samples = times.map(time => {
          source.currentTime = time;
          const element = document.getElementById(window.pairedProbe.state().id);
          const matrix = new DOMMatrix(getComputedStyle(element).transform);
          return { time, progress: source.effect.getComputedTiming().progress,
            matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e + 40, matrix.f + 50], opacity: Number(getComputedStyle(element).opacity) };
        });
        source.currentTime = 100;
        return samples;
      }, { easing, direction, times });
      expect((await page.evaluate(() => window.pairedProbe.enable())).mode).toBe("gpu");
      const samples = [];
      for (const expected of native) {
        const actual = await page.evaluate(time => window.pairedProbe.seek(time), expected.time);
        const layer = actual.layers.find(layer => layer.id === actual.id);
        layer.matrix.forEach((value, index) => expect(Math.abs(value - expected.matrix[index]), JSON.stringify({ easing, direction, time: expected.time, index, value, native: expected.matrix[index] })).toBeLessThan(1e-3));
        expect(layer.transform.opacity).toBeCloseTo(expected.opacity, 4);
        const matrix = layer.matrix, x = matrix[0] * 150 + matrix[2] * 220 + matrix[4], y = matrix[1] * 150 + matrix[3] * 220 + matrix[5];
        const image = await pixels(page, `oracle-${records.length}-${expected.time}`);
        const color = image.at(x, y);
        color.slice(0, 3).forEach((value, index) => expect(Math.abs(value - ([240, 30, 60][index] * expected.opacity + 255 * (1 - expected.opacity)))).toBeLessThanOrEqual(2));
        samples.push({ expected, actual: { matrix: layer.matrix, opacity: layer.transform.opacity, source: actual.source }, color });
      }
      const restored = await page.evaluate(() => window.pairedProbe.disable());
      expect(restored.source.sameEffect).toBe(true);
      expect(restored.source.time).toBe(2100);
      records.push({ easing, direction, samples, restored });
    }
  }
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("native-easing-oracle", { records, sampleCount: records.reduce((sum, record) => sum + record.samples.length, 0), disposed });
});

// disable() while GPU cleanup cannot complete (queue fence never resolves): the owned source must be
// restored to DOM immediately, before the GPU resources are released by an actual device loss.
test("owned source restoration precedes indefinitely pending healthy GPU cleanup", async ({ page }) => {
  await ready(page, "css");
  const original = await page.evaluate(() => window.pairedProbe.state().source.declarations);
  await page.evaluate(() => window.pairedProbe.enable());
  await page.evaluate(() => window.pairedProbe.seek(600));
  await page.evaluate(() => {
    window.deviceFixture = document.querySelector("#output").getContext("webgpu").getConfiguration().device;
    window.deviceFixture.queue.onSubmittedWorkDone = () => new Promise(() => {});
  });
  const retained = await page.evaluate(() => window.pairedProbe.disable());
  expect(retained.mode).toBe("dom");
  expect(retained.resources.pendingCleanups).toBe(1);
  expect(retained.resources.engines).toBe(1);
  expect(retained.source.declarations).toBe(original);
  expect(retained.source.time).toBe(600);
  expect(retained.runtimeResources.animationOwners).toBe(0);
  expect(retained.runtimeResources.cssReplacementSources).toBe(0);
  expect(retained.runtimeResources.decorativeEffects).toBe(0);
  for (const action of ["enable", "dispose"]) {
    expect(await page.evaluate(async action => {
      try { await window.pairedProbe[action](); } catch (error) { return String(error); }
    }, action)).toMatch(/pending|idle ordinary DOM/i);
  }
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  await page.evaluate(() => window.deviceFixture.destroy());
  await page.waitForFunction(() => window.pairedProbe.state().resources.pendingCleanups === 0);
  const active = await page.evaluate(() => window.pairedProbe.enable());
  expect(active.mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("owned-pending-cleanup", { fixture: "Synthetic indefinitely pending healthy queue; subsequent explicit destruction delivers actual loss", retained, active, disposed });
});

// If admission is refused (capture made a no-op), the owned source and declarations are restored
// and the same controls stay usable.
test("admission refusal restores owned source and same usable controls", async ({ page }) => {
  await ready(page, "css");
  const original = await page.evaluate(() => {
    window.rootFixture = window.pairedProbe.controller().container;
    window.inputFixture = document.querySelector("#name");
    GPUQueue.prototype.drawElementImageToTexture = () => {};
    return window.pairedProbe.state().source.declarations;
  });
  const refused = await page.evaluate(() => window.pairedProbe.enable());
  expect(refused.mode).toBe("dom");
  expect(refused.source.declarations).toBe(original);
  expect(refused.source.sameEffect).toBe(true);
  expect(refused.source.detached).toBe(false);
  expect(refused.runtimeResources.animationOwners).toBe(0);
  expect(refused.runtimeResources.decorativeEffects).toBe(0);
  expect(refused.resources.engines).toBe(0);
  expect(await page.evaluate(() => window.rootFixture === window.pairedProbe.controller().container && window.inputFixture === document.querySelector("#name"))).toBe(true);
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  await page.locator("#name").fill("refused-original");
  await page.keyboard.press("Enter");
  await expect(page.locator("#saved")).toHaveText("refused-original");
  zero(await page.evaluate(() => window.pairedProbe.dispose()));
  await save("owned-admission-refusal", refused);
});

// A fake hidden document pauses playback and resumes it without catching up; mutating the live
// effect timing while GPU-owned makes the runtime fall back with a "modified while GPU-owned" reason.
test("live effect mutation and synthetic visibility pause respect source ownership", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.pairedProbe.enable());
  await page.evaluate(() => window.pairedProbe.playback().play());
  await page.waitForTimeout(100);
  const hidden = await page.evaluate(() => {
    window.hiddenFixture = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.hiddenFixture });
    document.dispatchEvent(new Event("visibilitychange"));
    return window.pairedProbe.state();
  });
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.pairedProbe.state())).playback.milliseconds).toBe(hidden.playback.milliseconds);
  const resumed = await page.evaluate(() => {
    window.hiddenFixture = false;
    document.dispatchEvent(new Event("visibilitychange"));
    return window.pairedProbe.state();
  });
  expect(resumed.playback.milliseconds).toBe(hidden.playback.milliseconds);
  await page.waitForTimeout(50);
  const visible = await page.evaluate(() => window.pairedProbe.state());
  expect(visible.playback.milliseconds - hidden.playback.milliseconds).toBeLessThan(100);
  await page.evaluate(() => window.pairedProbe.source().effect.updateTiming({ easing: "ease" }));
  await page.waitForFunction(() => window.pairedProbe.state().mode === "dom" && !window.pairedProbe.state().transitioning);
  const recovered = await page.evaluate(() => window.pairedProbe.state());
  expect(recovered.reason).toContain("modified while GPU-owned");
  expect(recovered.source.detached).toBe(false);
  expect(recovered.runtimeResources.animationOwners).toBe(0);
  zero(await page.evaluate(() => window.pairedProbe.dispose()));
  await save("owned-visibility-mutation", { fixture: "Synthetic document.hidden getter; not actual background-tab certification", hidden, resumed, visible, recovered });
});

// Same oracle comparison as above for a three-keyframe animation with per-keyframe easing and an
// overall easing.
test("three-frame per-keyframe easing agrees with native presentation and actual pixels", async ({ page }) => {
  await ready(page);
  const times = [100, 300, 500, 600, 900, 1100];
  const native = await page.evaluate(times => {
    const source = window.pairedProbe.source();
    source.effect.setKeyframes([
      { offset: 0, transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1, easing: "ease-in" },
      { offset: 0.4, transform: "translate(20px, 8px) rotate(2deg) scale(0.95)", opacity: 0.8, easing: "cubic-bezier(0.2,-0.2,0.8,1.2)" },
      { offset: 1, transform: "translate(70px, 20px) rotate(10deg) scale(0.85)", opacity: 0.5 },
    ]);
    source.effect.updateTiming({ easing: "ease-in-out", iterations: 1, direction: "normal" });
    const samples = times.map(time => {
      source.currentTime = time;
      const style = getComputedStyle(document.getElementById(window.pairedProbe.state().id)), matrix = new DOMMatrix(style.transform);
      return { time, matrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e + 40, matrix.f + 50], opacity: Number(style.opacity) };
    });
    source.currentTime = 100;
    return samples;
  }, times);
  expect((await page.evaluate(() => window.pairedProbe.enable())).mode).toBe("gpu");
  const samples = [];
  for (const expected of native) {
    const actual = await page.evaluate(time => window.pairedProbe.seek(time), expected.time);
    const layer = actual.layers.find(layer => layer.id === actual.id), m = layer.matrix;
    m.forEach((value, index) => expect(Math.abs(value - expected.matrix[index])).toBeLessThan(1e-3));
    expect(layer.transform.opacity).toBeCloseTo(expected.opacity, 4);
    const color = (await pixels(page, `keyframe-${expected.time}`)).at(m[0] * 150 + m[2] * 220 + m[4], m[1] * 150 + m[3] * 220 + m[5]);
    color.slice(0, 3).forEach((value, index) => expect(Math.abs(value - ([240, 30, 60][index] * expected.opacity + 255 * (1 - expected.opacity)))).toBeLessThanOrEqual(2));
    samples.push({ expected, actual: { matrix: m, opacity: layer.transform.opacity }, color });
  }
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("per-keyframe-easing", { samples, disposed });
});

// Touching `paired-demo.tsx` triggers real Vite HMR. The old controller must restore the source and
// release its resources before the replacement; HMR is a new root lifetime. The file's timestamp is
// restored afterwards.
test("real paired-demo HMR serializes ownership restoration and retired resource cleanup", async ({ page }) => {
  const path = "examples/playground/src/demo/paired-demo.tsx", original = await stat(path), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "css", true);
  await page.evaluate(() => window.pairedProbe.enable());
  await page.evaluate(() => { window.oldPaired = window.pairedProbe; });
  let restored = false;
  try {
    await utimes(path, original.atime, new Date());
    await page.waitForFunction(() => window.pairedProbe !== window.oldPaired && window.pairedProbe.state().mode === "dom");
    const retired = await page.evaluate(() => window.oldPaired.state());
    zero(retired);
    expect(retired.source.sameEffect).toBe(true);
    await page.evaluate(() => window.pairedProbe.enable());
    await page.locator("#counter").click();
    await expect(page.locator("#counter")).toHaveText("Count 1");
    await page.evaluate(() => { window.secondPaired = window.pairedProbe; });
    await utimes(path, original.atime, original.mtime);
    restored = true;
    await page.waitForFunction(() => window.pairedProbe !== window.secondPaired && window.pairedProbe.state().mode === "dom");
    const second = await page.evaluate(() => window.secondPaired.state());
    zero(second);
    const disposed = await page.evaluate(() => window.pairedProbe.dispose());
    zero(disposed);
    expect(errors).toEqual([]);
    await save("paired-hmr", { fixture: "Real timestamp-only Vite HMR; unchanged contents/timestamp restored. New root lifetime, not state continuity.", retired, second, disposed, errors });
  } finally {
    if (!restored) await utimes(path, original.atime, original.mtime);
  }
});

// With no owned animation, only the decorative ripple, switching on reduced motion must render the
// decorative layer at identity: its region equals the plain DOM baseline pixel for pixel.
test("effect-only reduced motion immediately renders decorative identity", async ({ page }) => {
  await ready(page);
  const baseline = (await pixels(page, "effect-only-dom")).png.data;
  const active = await page.evaluate(async () => {
    window.pairedProbe.source().cancel();
    const controller = window.pairedProbe.controller();
    await controller.enable();
    controller.setRipple(window.pairedProbe.state().artId, { amplitude: 8, seconds: 0.7 });
    await controller.settle();
    return window.pairedProbe.state();
  });
  expect(active.mode).toBe("gpu");
  expect(active.runtimeResources.animationOwners).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForFunction(frames => window.pairedProbe.state().metrics.gpuFrames > frames, active.metrics.gpuFrames);
  const identity = (await pixels(page, "effect-only-reduced")).png.data;
  // Every pixel of the region is compared, then asserted once: an expect per pixel (40,000) took most of the test's time (#94).
  const differing = [];
  for (let y = 60; y < 260; y++) for (let x = 380; x < 580; x++) {
    const offset = (y * 640 + x) * 4;
    if ([0, 1, 2, 3].some(channel => identity[offset + channel] !== baseline[offset + channel])) differing.push({ x, y, reduced: [...identity.subarray(offset, offset + 4)], dom: [...baseline.subarray(offset, offset + 4)] });
  }
  expect(differing.slice(0, 5), `${differing.length} pixels differ from the DOM baseline`).toEqual([]);
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("effect-only-reduced-motion", { active, disposed });
});

test("typed motion is created, owned and freeze-released while GPU stays active", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => window.pairedProbe.motion().dispose());
  // The page helper would own its demo motion; enable the controller directly.
  expect((await page.evaluate(() => window.pairedProbe.controller().enable())).mode).toBe("gpu");
  const owned = await page.evaluate(async () => {
    const controller = window.pairedProbe.controller(), id = window.pairedProbe.state().id;
    const element = document.getElementById(id);
    window.liveMotion = controller.createMotion(id, {
      keyframes: [{ offset: 0 }, { offset: 1, x: 70, y: 20, rotation: 10, scaleX: 0.85, scaleY: 0.85, opacity: 0.5 }],
      timing: { duration: 1000, delay: 100, direction: "alternate", iterations: Infinity, fill: "both" },
    });
    window.liveMotion.own();
    window.liveMotion.seek(600);
    await controller.settle();
    const style = element.style;
    return { state: controller.state(), declarations: [style.getPropertyValue("transform"), style.getPropertyPriority("transform"), style.getPropertyValue("opacity")] };
  });
  // No DOM round-trip: GPU admission is unchanged and the layer keeps GPU-owned declarations.
  expect(owned.state.mode).toBe("gpu");
  expect(owned.state.metrics.admission.passes).toBe(1);
  expect(owned.state.runtimeResources.animationOwners).toBe(1);
  expect(owned.declarations).toEqual(["none", "important", "1"]);
  // Same descriptor and phase as the DOM-acquired oracle above.
  const live = (await pixels(page, "live-ownership-gpu")).at(190, 220);
  [244, 86, 109].forEach((value, index) => expect(Math.abs(live[index] - value)).toBeLessThanOrEqual(2));
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 1");
  const frozen = await page.evaluate(async () => {
    const controller = window.pairedProbe.controller();
    const before = controller.state().layers.find(layer => layer.id === window.pairedProbe.state().id).transform;
    await window.liveMotion.release({ freeze: true });
    await controller.settle();
    const state = controller.state();
    return { before, after: state.layers.find(layer => layer.id === window.pairedProbe.state().id).transform, state,
      playback: window.liveMotion.nativeAnimation.playState };
  });
  expect(frozen.state.mode).toBe("gpu");
  expect(frozen.state.runtimeResources.animationOwners).toBe(0);
  expect(frozen.state.runtimeResources.nativeMotions).toBe(0);
  expect(frozen.playback).toBe("idle");
  expect(frozen.after).toEqual(frozen.before);
  expect((await pixels(page, "live-ownership-frozen")).at(190, 220)).toEqual(live);
  // A React commit with unchanged props keeps the frozen pose.
  await page.locator("#counter").click();
  await expect(page.locator("#counter")).toHaveText("Count 2");
  await page.evaluate(() => window.pairedProbe.controller().settle());
  expect((await pixels(page, "live-ownership-after-commit")).at(190, 220)).toEqual(live);
  // A refused live acquisition restores GPU presentation atomically.
  const refused = await page.evaluate(async () => {
    const controller = window.pairedProbe.controller(), id = window.pairedProbe.state().id;
    const element = document.getElementById(id);
    controller.setTransform(id, {});
    await controller.settle();
    const rogue = new Animation(new KeyframeEffect(element, [{ transform: "none", opacity: 1, color: "red" }, { transform: "none", opacity: 0.5, color: "blue" }], 1000), document.timeline);
    rogue.pause();
    let error;
    try { controller.ownAnimation(id, rogue); } catch (failure) { error = String(failure); }
    rogue.cancel();
    await controller.settle();
    const style = element.style;
    return { error, state: controller.state(), declarations: [style.getPropertyValue("transform"), style.getPropertyPriority("transform"), style.getPropertyValue("opacity"), style.getPropertyPriority("opacity")] };
  });
  expect(refused.error).toMatch(/complete transform\/opacity/);
  expect(refused.state.mode).toBe("gpu");
  expect(refused.state.runtimeResources.animationOwners).toBe(0);
  expect(refused.declarations).toEqual(["none", "important", "1", "important"]);
  const disposed = await page.evaluate(() => window.pairedProbe.dispose());
  zero(disposed);
  await save("live-ownership", { owned, live, frozen, refused, disposed });
});
