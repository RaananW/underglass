/**
 * Browser suite for a media change that alters a panel's layout under an Instrument scene built a frame earlier
 * (issue 156), on `core-scene-media-change.html`: one enrolled panel with a border on an inner box that a media
 * preference removes, so the panel is 20 px shorter, and a knob on its bottom-right corner whose bounds end on the old
 * box's edge. The page rebuilds the scene as the Strata GPU helper does (a `ResizeObserver` and a `MutationObserver` wake a
 * frame), so core's own `ResizeObserver` reconciles and draws first, with the scene built for the old layout.
 * - Per media preference (`prefers-contrast: more`, `forced-colors: active`, `prefers-color-scheme: dark`), at DPR 1 and 2,
 *   with the layer in place and with it moved by a sibling whose height the preference changes too (`?shift=1`): GPU stays on
 *   across the change and back; a draw during the change carried the `layout:` warning for the old box (so the race ran, and
 *   the test is not vacuous); no draw has anything stepped down; the knob's cap (near-black lacquer pixels, which the Relief
 *   knob and every panel colour lack) is in its box in every draw; no cap pixel lies below the new box (the composite is the
 *   new box plus 1 px); the layer ends as parts with no warning; the border's pixels change in the change and back.
 * - A box that grows never goes stale: no warning, nothing counted.
 * - Containment still holds: a scene whose bounds leave the layer's box is stepped down with `containment`, also after a
 *   layout change, and returns to parts when the next scene is inside.
 * - A producer that never rebuilds keeps the parts, clipped to the new box (DPR 1 and 2), with a warning and
 *   `layoutHeld` counts; a second box change in the window is still held to the first box, and returning to that box clears it.
 *
 * Baseline from this same test with the held verdict scratch-disabled (the code before the fix), Canary 158.0.8112.0: all 12 preference
 * × DPR × layer cases stepped the edge knob down (`containment`) in 2 draws, in place and moved alike, with 0 draws held; the two
 * producer-never-rebuilds tests failed (the scene was stepped down); after the fix, 0 stepped-down draws and 15 of 15 pass.
 * Screenshots go to the `core-scene-media-change` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("core-scene-media-change");
const media = [
  { name: "prefers-contrast: more", page: "contrast", on: { contrast: "more" }, off: { contrast: "no-preference" } },
  { name: "forced-colors: active", page: "forced", on: { forcedColors: "active" }, off: { forcedColors: "none" } },
  { name: "prefers-color-scheme: dark", page: "scheme", on: { colorScheme: "dark" }, off: { colorScheme: "light" } },
];
const OLD = "built for 320 × 224 px";

/** Opens the page, and installs the tap: every GPU submit queues one read of the knob's box, in the task that made it. */
async function open(browser, dpr, query) {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__watch = false;
    const submit = GPUQueue.prototype.submit;
    let queued = false;
    GPUQueue.prototype.submit = function (...args) {
      const result = submit.apply(this, args);
      if (window.__watch && !queued) { queued = true; queueMicrotask(() => { queued = false; window.__tap?.(); }); }
      return result;
    };
  });
  await page.goto(`/core-scene-media-change.html${query}`);
  await page.waitForFunction(() => window.mediaChange, null, { timeout: 30000 });
  await page.evaluate(() => window.mediaChange.settle());
  await page.evaluate(() => {
    window.__draws = [];
    window.__tap = () => {
      const api = window.mediaChange, layer = api.instrument().layers[0];
      const edge = document.getElementById("mc-edge").getBoundingClientRect(), panel = api.panel().getBoundingClientRect();
      // The cap: near-black pixels (the lacquer, about 30 of 255), opaque. Panels, the Relief knob and the stage are lighter.
      const count = rect => {
        const { data } = api.pixels(rect);
        let n = 0;
        for (let at = 0; at < data.length; at += 4) if (data[at + 3] > 200 && Math.max(data[at], data[at + 1], data[at + 2]) < 40) n++;
        return n;
      };
      window.__draws.push({ mode: api.state().mode, status: layer.status, stepped: layer.steppedDown.map(entry => `${entry.object}: ${entry.reason}`),
        warnings: [...layer.warnings], held: layer.layoutHeld.objects, heldFrames: layer.layoutHeld.frames, height: api.panel().offsetHeight,
        cap: count({ x: edge.left, y: edge.top, width: edge.width, height: edge.height }),
        // Below the new box (and its 1 px of composite): nothing of the layer's parts may be there.
        leak: count({ x: panel.left, y: panel.bottom + 3, width: panel.width, height: 40 }) });
    };
  });
  return { context, page, errors };
}
const draws = page => page.evaluate(() => window.__draws);
const clearDraws = page => page.evaluate(() => { window.__draws.length = 0; });
const state = page => page.evaluate(() => ({ mode: window.mediaChange.state().mode, layer: window.mediaChange.instrument().layers[0], height: window.mediaChange.panel().offsetHeight }));
const frames = (page, count = 4) => page.evaluate(async count => { await window.mediaChange.controller.settle(); for (let index = 0; index < count; index++) await new Promise(requestAnimationFrame); }, count);
/** Waits until the layer is drawn as parts with no warning (the next scene arrived) and the frames have caught up. */
async function settled(page) {
  await page.waitForFunction(() => { const layer = window.mediaChange.instrument().layers[0]; return layer.status === "ready" && layer.steppedDown.length === 0 && layer.warnings.length === 0; }, null, { timeout: 10000 });
  await frames(page);
}
/** Waits until a draw has been tapped (a diagnostic-driven wait: the draw of the change). */
const drawn = (page, count = 1) => page.waitForFunction(count => window.__draws.length >= count, count, { timeout: 10000 });
/** A 4 × 4 px patch of the screen at a client point, as its mean red, green and blue. */
async function patch(page, name, x, y) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.screenshot({ path: `${evidence}/${name}.png`, clip: { x, y, width: 4, height: 4 } }));
  const mean = [0, 0, 0];
  for (let at = 0; at < png.data.length; at += 4) for (let channel = 0; channel < 3; channel++) mean[channel] += png.data[at + channel] / (png.data.length / 4);
  return mean.map(Math.round);
}
/** Where the inner box's border is, in the layout with it. */
const borderPoint = page => page.evaluate(() => { const box = document.getElementById("mc-flow").getBoundingClientRect(); return { x: box.left + 3, y: box.top + 120 }; });
/** The knob's cap in its box when drawn as parts: the reference a draw is held to. */
async function reference(page) {
  await clearDraws(page);
  await page.evaluate(() => { window.__watch = true; window.mediaChange.rebuild(); });
  await drawn(page);
  await frames(page);
  const ref = (await draws(page)).filter(draw => draw.stepped.length === 0).at(-1);
  expect(ref, "a draw with the parts").toBeTruthy();
  expect(ref.cap, "the cap is there in the reference").toBeGreaterThan(300);
  return ref;
}

for (const dpr of [1, 2]) for (const preference of media) for (const layout of [{ name: "in place", query: "" }, { name: "moved by a sibling", query: "&shift=1" }]) {
  test(`${preference.name} at DPR ${dpr}, layer ${layout.name}: no frame at Relief, GPU on, fresh pixels`, async ({ browser }) => {
    test.setTimeout(120000);
    const { context, page, errors } = await open(browser, dpr, `?media=${preference.page}${layout.query}`);
    const point = await borderPoint(page);
    const before = await patch(page, `${preference.page}-dpr${dpr}${layout.query ? "-moved" : ""}-before`, point.x, point.y);
    expect(before[2] - before[0], "the border is blue before").toBeGreaterThan(100);
    expect((await state(page)).layer.steppedDown).toEqual([]);
    const ref = await reference(page);
    const top = await page.evaluate(() => window.mediaChange.panel().getBoundingClientRect().top);

    // The change: the panel is 20 px shorter (and, moved, 20 px higher).
    await clearDraws(page);
    await page.emulateMedia(preference.on);
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 204, null, { timeout: 10000 });
    await drawn(page);
    await settled(page);
    const changed = await draws(page);
    const after = await patch(page, `${preference.page}-dpr${dpr}${layout.query ? "-moved" : ""}-after`, point.x, point.y);
    const end = await state(page);
    if (layout.query) expect(await page.evaluate(() => window.mediaChange.panel().getBoundingClientRect().top), "the layer moved").toBeLessThan(top);
    console.log(`${preference.name} DPR ${dpr} ${layout.name}: ${changed.length} draws; stepped ${changed.filter(draw => draw.stepped.length).length}; held ${changed.filter(draw => draw.held).length} (draws ${changed.map(draw => draw.held).join("")}); cap ${changed.map(draw => draw.cap).join(",")} (reference ${ref.cap}); leak ${changed.map(draw => draw.leak).join(",")}`);
    expect(changed.some(draw => draw.warnings.some(warning => warning.includes(OLD)) && draw.held > 0), "a draw during the change held the scene built for the old box (the race ran)").toBe(true);
    expect(changed.every(draw => draw.height === 204), "every draw is of the new layout").toBe(true);
    expect(changed.filter(draw => draw.stepped.length).map(draw => draw.stepped), "no draw steps an object down").toEqual([]);
    expect(changed.filter(draw => draw.mode !== "gpu"), "GPU stays on in every draw").toEqual([]);
    expect(changed.filter(draw => draw.status !== "ready"), "the layer is drawn as parts in every draw").toEqual([]);
    // Measured: a held draw keeps 0.54 of the reference cap, the Relief knob 0.41 to 0.43 (the unfixed code); under a dark colour scheme the dark face
    // itself counts as cap pixels, so there the stepped-down check above is the guard.
    if (preference.page !== "scheme") expect(Math.min(...changed.map(draw => draw.cap)), "the knob's cap is in its box in every draw").toBeGreaterThan(ref.cap * 0.48);
    // A draw before the layout reached core (held 0, the layer still the old box: a forced-colors change recaptures first) is the old frame.
    expect(Math.max(...changed.filter(draw => draw.held > 0).map(draw => draw.leak)), "no part pixel below the new box in a draw of a held scene").toBe(0);
    expect(end.mode).toBe("gpu");
    expect(end.layer.status).toBe("ready");
    expect(end.layer.steppedDown).toEqual([]);
    expect(end.layer.warnings, "no warning once the scene is rebuilt").toEqual([]);
    expect(end.layer.layoutHeld.objects).toBe(0);
    expect(end.layer.layoutHeld.frames, "the held frames are counted").toBeGreaterThan(0);
    expect(after[2] - after[0], "fresh pixels: the border is gone (the panel's face is there)").toBeLessThan(40);

    // And back: the box grows by 20 px, which never goes stale.
    const heldBefore = end.layer.layoutHeld.frames;
    await clearDraws(page);
    await page.emulateMedia(preference.off);
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 224, null, { timeout: 10000 });
    await drawn(page);
    await settled(page);
    const back = await draws(page);
    const restored = await patch(page, `${preference.page}-dpr${dpr}${layout.query ? "-moved" : ""}-back`, point.x, point.y);
    expect(back.filter(draw => draw.stepped.length || draw.mode !== "gpu" || draw.status !== "ready" || draw.warnings.length), "growing back: parts, GPU, no warning").toEqual([]);
    expect(Math.max(...back.map(draw => draw.leak))).toBe(0);
    expect((await state(page)).layer.layoutHeld.frames, "a box that grows holds nothing").toBe(heldBefore);
    expect(restored[2] - restored[0], "the border is back").toBeGreaterThan(100);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("a scene whose bounds leave the layer's box is still stepped down, with its reason, also after a layout change, and is drawn as parts when the next scene is inside", async ({ browser }) => {
  test.setTimeout(120000);
  const { context, page, errors } = await open(browser, 1, "?media=contrast&hold=1");
  await page.evaluate(() => { window.__watch = true; });
  // A new scene whose edge knob's bounds lie 30 px past the box: stepped down at once, the other knob still parts.
  await page.evaluate(() => window.mediaChange.leave(30));
  await page.waitForFunction(() => window.mediaChange.instrument().layers[0].steppedDown.length > 0, null, { timeout: 5000 });
  let now = await state(page);
  expect(now.layer.steppedDown.map(entry => [entry.object, entry.reason, entry.detail])).toEqual([["mc-edge", "containment", "its bounds leave the layer's box"]]);
  expect(now.mode).toBe("gpu");
  // The same scene after a layout change stays stepped down: it was judged for the layout it was built for, and it left that.
  await page.emulateMedia({ contrast: "more" });
  await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 204, null, { timeout: 10000 });
  await frames(page);
  now = await state(page);
  expect(now.mode, "GPU stays on").toBe("gpu");
  expect(now.layer.steppedDown.map(entry => [entry.object, entry.reason]), "the scene that left its box is still stepped down").toEqual([["mc-edge", "containment"]]);
  expect(now.layer.layoutHeld.objects, "nothing is held for an object that was stepped down").toBe(0);
  // A scene built from the new layout, inside the box, is drawn as parts.
  await page.evaluate(() => window.mediaChange.rebuild());
  await settled(page);
  expect((await state(page)).layer.steppedDown).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) {
  test(`a scene its producer does not rebuild keeps its parts inside the new box at DPR ${dpr}; a second change is held to the first box, and returning to it clears the warning`, async ({ browser }) => {
    test.setTimeout(120000);
    const { context, page, errors } = await open(browser, dpr, "?media=contrast&hold=1");
    const ref = await reference(page);
    await clearDraws(page);
    await page.emulateMedia({ contrast: "more" });
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 204, null, { timeout: 10000 });
    await drawn(page);
    await frames(page);
    let now = await state(page);
    expect(now.mode).toBe("gpu");
    expect(now.layer.status).toBe("ready");
    expect(now.layer.steppedDown, "the scene was accepted for the layout it was built for").toEqual([]);
    expect(now.layer.warnings).toHaveLength(1);
    expect(now.layer.warnings[0]).toContain(OLD);
    expect(now.layer.warnings[0]).toContain("320 × 204");
    expect(now.layer.layoutHeld.objects).toBe(1);
    let frozen = await draws(page);
    expect(frozen.filter(draw => draw.stepped.length || draw.mode !== "gpu")).toEqual([]);
    expect(Math.min(...frozen.map(draw => draw.cap)), "the cropped cap is in the box").toBeGreaterThan(ref.cap * 0.3);
    expect(Math.max(...frozen.filter(draw => draw.held > 0).map(draw => draw.leak)), "the stale parts stay inside the new box").toBe(0);
    // A second change in the window (the box is 20 px shorter again): still held to the first box.
    await clearDraws(page);
    await page.evaluate(() => window.mediaChange.flow(150));
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 184, null, { timeout: 10000 });
    await drawn(page);
    await frames(page);
    now = await state(page);
    expect(now.layer.warnings[0]).toContain(OLD);
    expect(now.layer.warnings[0]).toContain("320 × 184");
    expect(now.layer.steppedDown).toEqual([]);
    frozen = await draws(page);
    expect(Math.max(...frozen.map(draw => draw.leak)), "inside the second box too").toBe(0);
    // Back at the box the scene was judged at: the verdict is current again, with no warning.
    await clearDraws(page);
    await page.emulateMedia({ contrast: "no-preference" });
    await page.evaluate(() => window.mediaChange.flow(170));
    await page.waitForFunction(() => window.mediaChange.panel().offsetHeight === 224, null, { timeout: 10000 });
    await drawn(page);
    await settled(page);
    now = await state(page);
    expect(now.layer.warnings).toEqual([]);
    expect(now.layer.steppedDown).toEqual([]);
    expect(now.layer.layoutHeld.objects).toBe(0);
    expect(errors).toEqual([]);
    await context.close();
  });
}
