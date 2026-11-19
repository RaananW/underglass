/**
 * Browser suite for issue #331 on `policy-frames.html` (`examples/playground/src/demo/policy-frames-demo.tsx`, driven
 * through `window.policyProbe`): the presentation-contract policy and each owned animation's source check run once a
 * frame, not two, three or N+1 times, and still catch a violation in the frame they caught it in before.
 *
 * The counts come from `state().metrics.policyPasses` (full policy passes) and `state().metrics.ownershipChecks`
 * (owned-animation source checks), sampled by a frame callback asked for after the motion's own, so each sample
 * follows exactly one frame of the motion. GPU stays active throughout, the layers move on the canvas and real clicks
 * land on the moved native buttons. The recovery tests write a violation from a frame callback that runs after core's
 * callback of that frame, after its policy pass, and require that no GPU frame is drawn after the write.
 *
 * Layer geometry: row layers `owned-i` (red, y 20) and `free-i` (blue, y 220) start at x = 20 + 200 i, 110 x 110.
 * Reports go to the `policy-frames` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("policy-frames");
const red = [240, 30, 60, 255], blue = [30, 100, 220, 255], white = [255, 255, 255, 255];
/** Writes one named JSON report into this suite's evidence directory. */
async function save(name, report) {
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/${name}.json`, JSON.stringify(report, null, 2));
}
/** Opens the fixture with `owned` owned layers (and `extra` query flags) and waits for GPU admission. */
async function ready(page, owned = 3, extra = "") {
  await page.goto(`/policy-frames.html?owned=${owned}${extra}`);
  await page.waitForFunction(() => window.policyProbe?.state().mode === "gpu");
  await page.evaluate(() => window.policyProbe.settle());
}
/** Screenshots `#frame` and returns a sampler `(x, y) => [r, g, b, a]` in frame CSS pixels. */
async function snap(page, name) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 820;
  return (x, y) => { const offset = (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4; return [...png.data.subarray(offset, offset + 4)]; };
}
/** Clicks the native button of layer `id` at its moved position (60 px right of its start) and checks the count. */
async function clickMoved(page, id, x, y) {
  const frame = await page.locator("#frame").boundingBox();
  await page.mouse.click(frame.x + x + 60 + 20, frame.y + y + 18);
  await expect(page.locator(`#${id}-button`)).toHaveText(`${id} 1`);
}
/** Per-frame differences of the sampled counters, after dropping the first `skip` frames (the start's own draws). */
function deltas(samples, skip = 3) {
  const result = [];
  for (let index = skip + 1; index < samples.length; index++) {
    const now = samples[index], before = samples[index - 1];
    result.push({ passes: now.passes - before.passes, checks: now.checks - before.checks, frames: now.frames - before.frames });
  }
  return result;
}

test("the clock runs one policy pass and one source check per owned animation a frame, with GPU active", async ({ page }) => {
  await ready(page, 3);
  const report = await page.evaluate(async () => {
    const probe = window.policyProbe;
    const read = () => {
      const state = probe.state();
      return { passes: state.metrics.policyPasses, checks: state.metrics.ownershipChecks, frames: state.metrics.gpuFrames, mode: state.mode,
        x: state.layers.find(layer => layer.id === "owned-0").transform.x ?? 0, controllerFrames: state.runtimeResources.controllerFrames };
    };
    for (const motion of probe.motions) motion.play();
    // Asked for after the clock's frame: each sample follows one clock tick.
    const samples = await new Promise(resolve => {
      const samples = [];
      const watch = () => { samples.push(read()); if (samples.length > 40) resolve(samples); else requestAnimationFrame(watch); };
      requestAnimationFrame(watch);
    });
    for (const motion of probe.motions) { motion.pause(); motion.seek(1000); }
    await probe.settle();
    return { samples, after: read() };
  });
  const perFrame = deltas(report.samples);
  await save("clock", { ...report, perFrame });
  expect(report.samples.every(sample => sample.mode === "gpu")).toBe(true);
  expect(report.after.mode).toBe("gpu");
  // Every frame of the window is a clock frame that draws once.
  expect(perFrame.map(delta => delta.frames).join("")).toBe("1".repeat(perFrame.length));
  expect(perFrame.map(delta => delta.passes).join(""), "policy passes per frame").toBe("1".repeat(perFrame.length));
  expect(perFrame.map(delta => delta.checks).join(), "source checks per frame (three owned animations)").toBe(Array(perFrame.length).fill(3).join());
  // The motion advanced while it was counted, and the layers are drawn where the seek left them (x + 60).
  expect(report.samples.at(-1).x).not.toBe(report.samples[3].x);
  const pixels = await snap(page, "clock-moved");
  for (let index = 0; index < 3; index++) {
    expect(pixels(20 + index * 200 + 60 + 100, 120), `owned-${index} drawn at its new position`).toEqual(red);
    expect(pixels(20 + index * 200 + 30, 120), `owned-${index} left its old position`).toEqual(white);
  }
  await clickMoved(page, "owned-0", 20, 20);
  expect((await page.evaluate(() => window.policyProbe.state())).mode).toBe("gpu");
});

test("a transition group of four layers runs one policy pass in its frame callback and one in the draw", async ({ page }) => {
  await ready(page, 0);
  const report = await page.evaluate(async () => {
    const probe = window.policyProbe;
    const read = () => {
      const state = probe.state();
      return { passes: state.metrics.policyPasses, checks: state.metrics.ownershipChecks, frames: state.metrics.gpuFrames, mode: state.mode,
        x: state.layers.find(layer => layer.id === "free-3").transform.x ?? 0, controllerFrames: state.runtimeResources.controllerFrames,
        declarativeMotions: state.runtimeResources.declarativeMotions };
    };
    const handles = probe.controller.transitionGroup([0, 1, 2, 3].map(index => ({ id: `free-${index}`,
      motion: { keyframes: [{ offset: 0 }, { offset: 1, x: 60 }], timing: { duration: 1200 } } })));
    const samples = await new Promise(resolve => {
      const samples = [];
      const watch = () => { samples.push(read()); if (samples.length > 40) resolve(samples); else requestAnimationFrame(watch); };
      requestAnimationFrame(watch);
    });
    const results = await Promise.all(handles.map(handle => handle.finished));
    await probe.settle();
    return { samples, results, after: read() };
  });
  const perFrame = deltas(report.samples);
  await save("transition-group", { ...report, perFrame });
  expect(report.samples.every(sample => sample.mode === "gpu")).toBe(true);
  expect(report.results).toEqual(Array(4).fill({ status: "completed", reason: "Finished" }));
  expect(perFrame.map(delta => delta.frames).join("")).toBe("1".repeat(perFrame.length));
  // One pass for the four transitions (it was four, one each), one in the frame's draw.
  expect(perFrame.map(delta => delta.passes).join(""), "policy passes per frame").toBe("2".repeat(perFrame.length));
  // One shared frame callback for the group (it was four) plus at most the pending draw frame.
  expect(Math.max(...report.samples.slice(3).map(sample => sample.controllerFrames))).toBeLessThanOrEqual(2);
  expect(report.samples.slice(3).every(sample => sample.declarativeMotions === 4)).toBe(true);
  expect(report.samples.at(-1).x).toBeGreaterThan(report.samples[3].x);
  expect(report.after).toMatchObject({ mode: "gpu", controllerFrames: 0, declarativeMotions: 0 });
  const pixels = await snap(page, "group-moved");
  for (let index = 0; index < 4; index++) {
    expect(pixels(20 + index * 200 + 60 + 100, 320), `free-${index} drawn at its new position`).toEqual(blue);
    expect(pixels(20 + index * 200 + 30, 320), `free-${index} left its old position`).toEqual(white);
  }
  await clickMoved(page, "free-2", 420, 220);
  expect((await page.evaluate(() => window.policyProbe.state())).mode).toBe("gpu");
});

test("a group member whose own motion breaks the policy is cancelled with the reason, the others by the recovery", async ({ page }) => {
  // The free layers clip their overflow (`?clip`). free-3 tilts, which a clipped layer cannot do on the GPU; free-0
  // only moves. Both are sampled in one frame callback, but the reason goes to the transition whose sample broke the
  // policy, as when each had a callback of its own; the recovery cancels the other.
  await ready(page, 0, "&clip");
  const report = await page.evaluate(async () => {
    const probe = window.policyProbe;
    const before = probe.state().metrics.gpuFrames;
    const handles = probe.controller.transitionGroup([{ id: "free-0", motion: { keyframes: [{ offset: 0 }, { offset: 1, x: 60 }], timing: { duration: 400 } } },
      { id: "free-3", motion: { keyframes: [{ offset: 0 }, { offset: 1, tiltX: 20 }], timing: { duration: 400 } } }]);
    const results = await Promise.all(handles.map(handle => handle.finished));
    const state = probe.state();
    return { results, mode: state.mode, reason: state.reason, framesDrawn: state.metrics.gpuFrames - before,
      transforms: state.layers.filter(layer => layer.id.startsWith("free-")).map(layer => ({ id: layer.id, ...layer.transform })) };
  });
  await save("group-violation", report);
  expect(report.mode).toBe("dom");
  expect(report.reason).toMatch(/^(Error: Tilted layers with clipped content require a flat transform|Tilted layers require proven projective native hit testing: free-3)/);
  expect(report.results).toEqual([{ status: "cancelled", reason: "DOM recovery" }, { status: "cancelled", reason: report.reason }]);
  expect(report.framesDrawn).toBeGreaterThan(0);
  // Cancelled transitions return their layers to where they started.
  expect(report.transforms.every(layer => !layer.x && !layer.tiltX)).toBe(true);
  // The original controls work in ordinary DOM.
  await page.locator("#free-3-button").click();
  await expect(page.locator("#free-3-button")).toHaveText("free-3 1");
});

/**
 * Starts `begin` (which starts the motion and returns what the test awaits), then asks for a frame callback behind
 * the motion's own: in its fifth frame it calls `write` after core's callback of that frame has run its policy pass.
 * Returns the counters just before the write, in a microtask queued right after it (after the mutation observer's
 * callback and a draw queued by the write), and two frames later.
 */
async function violate(page, owned, begin, write) {
  await ready(page, owned);
  return page.evaluate(async ({ begin, write }) => {
    const probe = window.policyProbe;
    const read = () => { const state = probe.state(); return { mode: state.mode, reason: state.reason, frames: state.metrics.gpuFrames, passes: state.metrics.policyPasses }; };
    const started = new Function("probe", begin)(probe);
    const report = await new Promise(resolve => {
      let count = 0, written;
      const writer = () => {
        count++;
        if (count === 5) {
          const before = read();
          new Function("probe", write)(probe);
          queueMicrotask(() => { written = { before, microtask: read() }; });
        }
        if (count === 7) resolve({ ...written, later: read() });
        else requestAnimationFrame(writer);
      };
      requestAnimationFrame(writer);
    });
    const outcome = started?.finished ? await started.finished : undefined;
    return { ...report, outcome };
  }, { begin, write });
}

test("an inline transform written during a transition is recovered before another GPU frame", async ({ page }) => {
  const report = await violate(page, 0,
    `return probe.controller.transition("free-1", { keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 60000 } });`,
    `document.getElementById("free-1").style.transform = "translate(3px, 0px)";`);
  await save("transition-inline-transform", report);
  expect(report.before.mode).toBe("gpu");
  expect(report.microtask.mode, "recovered in the task of the write").toBe("dom");
  expect(report.microtask.reason).toContain("Presentation declaration ownership changed: transform");
  expect(report.later.frames, "no GPU frame after the write").toBe(report.before.frames);
  expect(report.outcome).toEqual({ status: "cancelled", reason: "DOM recovery" });
});

test("an inline transform written during owned playback is recovered before another GPU frame", async ({ page }) => {
  const report = await violate(page, 1, `probe.motions[0].play();`,
    `document.getElementById("owned-0").style.transform = "translate(3px, 0px)";`);
  await save("owned-inline-transform", report);
  expect(report.before.mode).toBe("gpu");
  expect(report.microtask.mode, "recovered in the task of the write").toBe("dom");
  expect(report.microtask.reason).toMatch(/^CSS ownership validation failed: .*Presentation declaration ownership changed: transform/);
  expect(report.later.frames, "no GPU frame after the write").toBe(report.before.frames);
});

test("keyframes changed under an owned animation are caught by the next frame's check, before it draws", async ({ page }) => {
  const report = await violate(page, 1, `probe.motions[0].play();`,
    `probe.motions[0].nativeAnimation.effect.setKeyframes([{ transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 }, { transform: "translate(90px, 0px) rotate(0deg) scale(1)", opacity: 1 }]);`);
  await save("owned-keyframes", report);
  expect(report.before.mode).toBe("gpu");
  // Nothing observes keyframes: the next clock frame's source check finds the change before that frame draws.
  expect(report.later.mode).toBe("dom");
  expect(report.later.reason).toMatch(/^Animation ownership failure: .*modified while GPU-owned/);
  expect(report.later.frames, "no GPU frame after the write").toBe(report.before.frames);
});

test("keyframes changed under an owned animation are caught by a draw later in the same frame", async ({ page }) => {
  // The write also starts a transition on another layer, which asks for a draw in this frame: that draw's own pass
  // must check the owned source again, not reuse the clock frame's verdict.
  const report = await violate(page, 1, `probe.motions[0].play();`,
    `probe.motions[0].nativeAnimation.effect.setKeyframes([{ transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 }, { transform: "translate(90px, 0px) rotate(0deg) scale(1)", opacity: 1 }]);
     probe.controller.transition("free-0", { keyframes: [{ offset: 0 }, { offset: 1, x: 30 }], timing: { duration: 60000 } });`);
  await save("owned-keyframes-draw", report);
  expect(report.before.mode).toBe("gpu");
  expect(report.later.mode).toBe("dom");
  expect(report.later.reason).toMatch(/^CSS ownership validation failed: .*modified while GPU-owned/);
  expect(report.later.frames, "no GPU frame after the write").toBe(report.before.frames);
});
