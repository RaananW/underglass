/**
 * Core's `instrument` material (Rendering Model 2D, `docs/ui-library/instrument-phase2.md`) on `instrument-core.html`
 * (`window.instrumentCore`, from `examples/playground/src/instrument-core/page.ts`): three enrolled panels of native
 * controls at 1920 × 1080, the lower one filling the window, the upper one overlapping it across a lower knob, and a
 * third clipped by an `overflow: hidden` viewport across one of its knobs. Each panel's material is set through the
 * public `setMaterial`, and native state sets each object's `t`. At DPR 1 and 2 the test checks that:
 * - GPU presentation stays on, with no fallback, through setMaterial, poses, density 250, layout, opacity and theme
 *   changes; the start reaches GPU with every scene built, 10 times in a row, while a successor composition races the
 *   mesh pipelines (`?race=1`);
 * - every pixel the parts draw lies inside its own control's rounded box (pixel centres) and inside the layer's clip,
 *   the upper panel hides the lower panel's parts, and native hits on drawn pixels find their control;
 * - captured caps show their labels texel for texel against core's plain pass;
 * - layer opacity reaches the parts (0 hides them, 0.5 blends them) and the clip cuts them;
 * - 300 frames of poses cause 0 captures, 0 uploads and 0 hit-geometry updates;
 * - a part that cannot stay in its box (`?overshoot=1`) is drawn at the Relief level, with a diagnostic naming the
 *   object, the part and the overshoot, and nothing is drawn outside;
 * - the budget steps a layer down at 2,049 parts (not at 2,048), reported, with GPU on;
 * - Lite's per-task GPU timings are reported per layer.
 * Reports and screenshots go to the `core-instrument` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-instrument");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;

/** Signed distance from a client point to a rounded box, negative inside. */
function rounded(point, box) {
  const radius = Math.min(box.radius ?? 0, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
const inside = (point, box) => point.x >= box.x && point.y >= box.y && point.x <= box.x + box.width && point.y <= box.y + box.height;

async function open(browser, dpr, query = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(`/instrument-core.html${query}`);
  await page.waitForFunction(() => window.instrumentCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentCore.ready)[name](...args), { name, args });
  return { context, page, errors, warnings, call };
}
/** A decoded screenshot of the viewport. */
async function shot(page, path) {
  const png = PNG.sync.read(await page.screenshot(path ? { path } : {}));
  return png;
}
/** GPU on, no fallback, every instrument layer ready (or stepped down by design). */
async function stillGpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}

/**
 * Parts on against off (the face only), shadows off in both: every changed pixel must lie in a control of the topmost
 * panel at that pixel (within its clip), never a lower-panel part under the upper panel; native hits on a sample of
 * changed pixels must find their control. Objects in `relief` are drawn as relief primitives, whose antialiased edge
 * may reach 1 px past the box.
 */
async function meshDiff(call, page, dpr, name, relief = []) {
  await call("setShadows", false);
  await call("setMeshes", true);
  const on = await shot(page, `${directory}/${name}-on-dpr${dpr}.png`);
  await call("setMeshes", false);
  const off = await shot(page, `${directory}/${name}-off-dpr${dpr}.png`);
  await call("setMeshes", true);
  await call("setShadows", true);
  const controls = await call("controls"), panels = await call("panels"), straddled = await call("straddled");
  const band = 64, rows = new Map();
  for (const control of controls) for (let row = Math.floor(control.y / band); row <= Math.floor((control.y + control.height) / band); row++) {
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(control);
  }
  const result = { changed: 0, outside: 0, outsideSamples: [], maxDistance: -Infinity, lowerUnderUpper: 0, outsideClip: 0, upperOwn: 0,
    straddled: { upper: { covered: 0, uncovered: 0 }, clipped: { inside: 0, beyond: 0 } }, hitSamples: [] };
  const candidatesForHits = [];
  const straddledKnob = controls.find(control => control.id === straddled.upper);
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
    result.changed++;
    const point = { x: (x + 0.5) / dpr, y: (y + 0.5) / dpr };
    const upperEdge = rounded(point, panels.upper), inViewport = inside(point, panels.viewport) && rounded(point, panels.clipped) <= 0;
    // The topmost panel at this point (more than a pixel inside it); within a pixel of an edge either may draw.
    const top = inViewport ? "clipped" : upperEdge < -1 ? "upper" : upperEdge > 1 ? "lower" : undefined;
    // Under the upper panel, the crossed lower knob's box may show only the upper panel's own controls.
    if (straddledKnob && upperEdge < -1 && rounded(point, straddledKnob) <= 0
      && !controls.some(control => control.layer === "upper" && rounded(point, control) <= 0)) result.straddled.upper.covered++;
    let owner, distance = Infinity;
    for (const control of rows.get(Math.floor(point.y / band)) ?? []) {
      if (top && control.layer !== top) continue;
      const d = rounded(point, control);
      if (d < distance) { distance = d; owner = control; }
    }
    // An object drawn at the Relief level is a relief primitive: its edge is antialiased over half a pixel (part 2).
    const tolerance = owner && relief.includes(owner.id) ? 1 : 0;
    if (!owner || distance > tolerance) {
      result.outside++;
      if (result.outsideSamples.length < 20) result.outsideSamples.push({ ...point, distance, top, on: [...on.data.subarray(offset, offset + 4)], off: [...off.data.subarray(offset, offset + 4)] });
      if (top === "upper" && controls.some(control => control.layer === "lower" && rounded(point, control) <= 0)) result.lowerUnderUpper++;
      continue;
    }
    if (owner.layer === "clipped" && !inside(point, panels.viewport)) result.outsideClip++;
    result.maxDistance = Math.max(result.maxDistance, distance);
    if (top === "upper") result.upperOwn++;
    if (owner.id === straddled.upper && upperEdge > 1) result.straddled.upper.uncovered++;
    if (owner.id === straddled.clipped) result.straddled.clipped[point.x <= panels.viewport.x + panels.viewport.width ? "inside" : "beyond"]++;
    if (distance <= -1 && (top || Math.abs(upperEdge) > 1)) candidatesForHits.push({ ...point, id: owner.id });
  }
  const step = Math.max(1, Math.floor(candidatesForHits.length / 4000));
  const points = [];
  for (let index = 0; index < candidatesForHits.length; index += step) points.push(candidatesForHits[index]);
  const hits = await call("hits", points.map(point => ({ x: point.x, y: point.y })));
  const mismatches = points.filter((point, index) => hits[index] !== point.id).map((point, index) => ({ ...point, hit: hits[index] }));
  return { ...result, hitSampleCount: points.length, hitMismatches: mismatches.length, hitMismatchSamples: mismatches.slice(0, 10) };
}

/** Pixels of every visible key's label with the material on, against core's plain pass (no material). */
async function labelsAgainstPlain(call, page) {
  const on = await shot(page);
  await call("setPlain", true);
  const plain = await shot(page);
  await call("setPlain", false);
  const dpr = await page.evaluate(() => devicePixelRatio);
  const panels = await call("panels");
  const labels = (await call("labels")).filter(label => label.layer === "upper" || label.layer === "lower" && rounded({ x: label.x, y: label.y }, panels.upper) > 2
    && rounded({ x: label.x + label.width, y: label.y + label.height }, panels.upper) > 2 && rounded({ x: label.x + label.width, y: label.y }, panels.upper) > 2
    || label.layer === "clipped" && inside({ x: label.x + label.width, y: label.y }, panels.viewport));
  return labels.map(label => {
    let compared = 0, mismatched = 0;
    const colours = new Set(), samples = [];
    for (let y = Math.ceil(label.y * dpr); y < Math.floor((label.y + label.height) * dpr); y++) for (let x = Math.ceil(label.x * dpr); x < Math.floor((label.x + label.width) * dpr); x++) {
      const offset = (y * on.width + x) * 4;
      compared++;
      if (on.data[offset] !== plain.data[offset] || on.data[offset + 1] !== plain.data[offset + 1] || on.data[offset + 2] !== plain.data[offset + 2]) {
        mismatched++;
        if (samples.length < 4) samples.push({ x, y, on: [...on.data.subarray(offset, offset + 3)], plain: [...plain.data.subarray(offset, offset + 3)] });
      }
      colours.add(`${on.data[offset]},${on.data[offset + 1]},${on.data[offset + 2]}`);
    }
    return { id: label.id, compared, mismatched, colours: colours.size, samples };
  });
}
/** Pixels that differ between two screenshots inside `box` (client px). */
function changedIn(a, b, box, dpr) {
  let changed = 0, compared = 0;
  for (let y = Math.ceil(box.y * dpr); y < Math.floor((box.y + box.height) * dpr); y++) for (let x = Math.ceil(box.x * dpr); x < Math.floor((box.x + box.width) * dpr); x++) {
    const offset = (y * a.width + x) * 4;
    compared++;
    if (a.data[offset] !== b.data[offset] || a.data[offset + 1] !== b.data[offset + 1] || a.data[offset + 2] !== b.data[offset + 2]) changed++;
  }
  return { changed, compared };
}

for (const dpr of [1, 2]) test(`instrument material: GPU-presented parts, containment, hits, caps, opacity, clip, poses and budgets DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(900000);
  await mkdir(directory, { recursive: true });
  const report = { dpr, browser: browser.version() };
  const { context, page, errors, call } = await open(browser, dpr);
  try {
    report.boot = await call("boot");
    expect(report.boot.mode, `start: ${report.boot.reason}`).toBe("gpu");
    expect(report.boot.reason).toMatch(healthy);
    let instrument = await call("instrument");
    expect(instrument.layers.map(layer => [layer.id, layer.status])).toEqual([["lower", "ready"], ["upper", "ready"], ["clipped", "ready"]]);
    for (const layer of instrument.layers) expect(layer.steppedDown, `${layer.id}: nothing at the Relief level`).toEqual([]);
    await shot(page, `${directory}/start-dpr${dpr}.png`);

    // Containment, occlusion, the clip and hits on drawn pixels.
    const diff = await meshDiff(call, page, dpr, "mesh");
    report.meshDiff = diff;
    expect(diff.changed, "the parts draw").toBeGreaterThan(50000 * dpr * dpr);
    expect(diff.outside, `part pixels outside their control or under a covering panel: ${JSON.stringify(diff.outsideSamples.slice(0, 5))}`).toBe(0);
    expect(diff.lowerUnderUpper, "lower-panel parts showing through the upper panel").toBe(0);
    expect(diff.outsideClip, "clipped-panel parts beyond its viewport").toBe(0);
    expect(diff.upperOwn, "the upper panel's own parts draw over it").toBeGreaterThan(1000);
    expect(diff.straddled.upper.covered, "the crossed lower knob is hidden under the upper panel").toBe(0);
    expect(diff.straddled.upper.uncovered, "the crossed lower knob is drawn where it is uncovered").toBeGreaterThan(200);
    expect(diff.straddled.clipped.beyond, "the clipped knob draws nothing past the viewport").toBe(0);
    expect(diff.straddled.clipped.inside, "the clipped knob draws inside the viewport").toBeGreaterThan(100);
    expect(diff.hitSampleCount).toBeGreaterThan(1000);
    expect(diff.hitMismatches, `native hits on part pixels: ${JSON.stringify(diff.hitMismatchSamples)}`).toBe(0);
    await stillGpu(call, "after containment");

    // Captured caps: texel for texel against core's plain pass.
    const labels = await labelsAgainstPlain(call, page);
    report.labels = labels;
    expect(labels.length).toBeGreaterThan(5);
    for (const label of labels) {
      expect(label.mismatched, `${label.id}: label differs from the capture: ${JSON.stringify(label.samples)}`).toBe(0);
      expect(label.colours, `${label.id}: label has text`).toBeGreaterThan(8);
    }
    await stillGpu(call, "after the plain pass and back");

    // Native state drives poses: real pointer input on a knob, a switch and a key, through the parts.
    const controls = await call("controls"), panels = await call("panels");
    const free = controls.filter(control => control.layer === "lower" && rounded({ x: control.x + control.width / 2, y: control.y + control.height / 2 }, panels.upper) > control.width);
    const centre = control => ({ x: control.x + control.width / 2, y: control.y + control.height / 2 });
    const knob = free.find(control => control.kind === "knob"), toggle = free.find(control => control.kind === "switch"), key = free.find(control => control.kind === "key");
    const before = { knob: await call("value", knob.id), toggle: await call("value", toggle.id), key: await call("value", key.id) };
    await page.mouse.click(centre(knob).x + knob.width * 0.3, centre(knob).y);
    await page.mouse.click(centre(toggle).x, centre(toggle).y);
    await page.mouse.click(centre(key).x, centre(key).y);
    await call("settle");
    report.pointer = { before, after: { knob: await call("value", knob.id), toggle: await call("value", toggle.id), key: await call("value", key.id) } };
    expect(report.pointer.after.knob.value, "a click on the knob sets the native range input").not.toBe(before.knob.value);
    expect(report.pointer.after.toggle.checked, "a click on the switch toggles the native checkbox").toBe(!before.toggle.checked);
    expect(report.pointer.after.key.presses, "a click on the key presses the native button").toBe(before.key.presses + 1);
    await stillGpu(call, "after pointer input");

    // Poses only: 300 frames, no capture, no upload, no hit geometry.
    report.animate60 = await call("animate", 300);
    expect(report.animate60.mode).toBe("gpu");
    expect(report.animate60.captures, "poses need no capture").toBe(0);
    expect(report.animate60.uploads, "poses need no upload").toBe(0);
    expect(report.animate60.geometryUpdates, "poses leave hit geometry alone").toBe(0);
    expect(report.animate60.gpuFrames, "every animation frame is drawn").toBeGreaterThanOrEqual(290);

    // GPU timings, per layer, for the adjust policy.
    instrument = await call("instrument");
    report.timing = { status: instrument.timing, layers: instrument.layers.map(layer => ({ id: layer.id, ...layer.gpu })), compile: instrument.compile };
    expect(instrument.timing.supported).toBe(true);
    expect(instrument.timing.status).toBe("available");
    for (const layer of instrument.layers) {
      expect(layer.gpu.samples, `${layer.id}: GPU time samples`).toBeGreaterThan(10);
      expect(layer.gpu.p95Ms).toBeGreaterThan(0);
    }

    // Opacity: 0 hides the parts, 0.5 blends them; the face-only reference shows what the layer alone draws.
    const upperBox = panels.upper;
    const upperControls = controls.filter(control => control.layer === "upper");
    const opaque = await shot(page);
    await call("setOpacity", "upper", 0.5);
    const half = await shot(page, `${directory}/opacity-half-dpr${dpr}.png`);
    await call("setMeshes", false, "upper");
    const halfFace = await shot(page);
    await call("setMeshes", true, "upper");
    await call("setOpacity", "upper", 0);
    const none = await shot(page);
    await call("setMeshes", false, "upper");
    const noneFace = await shot(page);
    await call("setMeshes", true, "upper");
    await call("setOpacity", "upper", 1);
    const back = await shot(page);
    const sum = (a, b) => upperControls.reduce((total, control) => { const value = changedIn(a, b, control, dpr); return { changed: total.changed + value.changed, compared: total.compared + value.compared }; }, { changed: 0, compared: 0 });
    report.opacity = { halfAgainstOpaque: sum(half, opaque), halfAgainstFace: sum(half, halfFace), noneAgainstFace: changedIn(none, noneFace, upperBox, dpr), backAgainstOpaque: changedIn(back, opaque, upperBox, dpr) };
    expect(report.opacity.halfAgainstOpaque.changed, "opacity 0.5 changes the parts").toBeGreaterThan(1000);
    expect(report.opacity.halfAgainstFace.changed, "at opacity 0.5 the parts still draw").toBeGreaterThan(1000);
    expect(report.opacity.noneAgainstFace.changed, "at opacity 0 the parts draw nothing").toBe(0);
    expect(report.opacity.backAgainstOpaque.changed, "back at opacity 1 the frame is the same").toBe(0);
    await stillGpu(call, "after opacity");

    // A layout change: the upper panel moves; its parts move in the same frames and stay contained.
    await call("move", "upper", -60, 40);
    const moved = await meshDiff(call, page, dpr, "moved");
    report.moved = { changed: moved.changed, outside: moved.outside, lowerUnderUpper: moved.lowerUnderUpper, hitMismatches: moved.hitMismatches, hitSampleCount: moved.hitSampleCount, outsideSamples: moved.outsideSamples.slice(0, 5) };
    expect(moved.outside, `after a move: ${JSON.stringify(moved.outsideSamples.slice(0, 5))}`).toBe(0);
    expect(moved.hitMismatches).toBe(0);
    await call("move", "upper", 0, 0);
    await stillGpu(call, "after the layout change");

    // Fresh pixels: a new label reaches its captured cap.
    const relabelled = controls.find(control => control.layer === "upper" && control.kind === "key");
    const beforeLabel = await shot(page);
    await call("relabel", relabelled.id, "Z9");
    const afterLabel = await shot(page);
    report.relabel = changedIn(beforeLabel, afterLabel, relabelled, dpr);
    expect(report.relabel.changed, "the relabelled cap shows the new label").toBeGreaterThan(20);
    await stillGpu(call, "after a native content change");

    // The theme: new colours in the DOM and the materials, a rebuilt scene, GPU on.
    await call("theme", "dark");
    await shot(page, `${directory}/dark-dpr${dpr}.png`);
    instrument = await call("instrument");
    expect(instrument.layers.every(layer => layer.status === "ready")).toBe(true);
    await call("theme", "light");
    await stillGpu(call, "after the theme switch");

    // The budget: 2,048 parts draw; 2,049 step the layer down, reported, GPU on.
    const at = await call("budget", 2048);
    report.budget2048 = at.layers.find(layer => layer.id === "upper");
    expect(report.budget2048.status).toBe("ready");
    expect(report.budget2048.drawnParts).toBe(2048);
    const over = await call("budget", 2049);
    report.budget2049 = { ...over.layers.find(layer => layer.id === "upper"), steppedDown: over.layers.find(layer => layer.id === "upper").steppedDown.slice(0, 2) };
    expect(report.budget2049.status).toBe("stepped-down");
    expect(report.budget2049.steppedDown[0].reason).toBe("budget");
    expect(report.budget2049.steppedDown[0].detail).toContain("2049 parts in the layer, above 2048");
    const degraded = (await call("materials")).find(material => material.id === "upper").degraded;
    expect(degraded.length).toBeGreaterThan(0);
    await stillGpu(call, "over budget");
    await call("budget", null);

    // More objects of existing kinds update in place: no rebuild, no object at Relief.
    const buildsBefore = (await call("instrument")).compile.builds;
    await call("copies", 3);
    instrument = await call("instrument");
    report.copies = { builds: instrument.compile.builds - buildsBefore, lower: instrument.layers.find(layer => layer.id === "lower") };
    expect(report.copies.builds, "three more knobs need no rebuild").toBe(0);
    expect(report.copies.lower.status).toBe("ready");
    expect(report.copies.lower.steppedDown).toEqual([]);
    await call("copies", 0);

    // Bounds past the layer's box: the object is drawn at Relief and nothing reaches past the panel's edge.
    const lowerBox = panels.lower;
    const beside = { x: lowerBox.x + lowerBox.width, y: lowerBox.y, width: viewport.width - (lowerBox.x + lowerBox.width), height: lowerBox.height };
    const inBox = await shot(page);
    await call("outside", true);
    const outsideShot = await shot(page, `${directory}/outside-dpr${dpr}.png`);
    const outsideDegraded = (await call("materials")).find(material => material.id === "lower").degraded;
    report.outside = { degraded: outsideDegraded, beside: changedIn(inBox, outsideShot, beside, dpr) };
    expect(outsideDegraded).toEqual([{ object: "outside", reason: "containment", detail: "its bounds leave the layer's box" }]);
    expect(report.outside.beside.compared).toBeGreaterThan(0);
    expect(report.outside.beside.changed, "nothing is drawn past the layer's box").toBe(0);
    await call("outside", false);
    await stillGpu(call, "after bounds past the layer");

    // A new light rebuilds the scenes: the parts are relit, not only the face.
    const lit = await shot(page);
    const builds = (await call("instrument")).compile.builds;
    await call("relight", 200);
    const relit = await shot(page, `${directory}/relit-dpr${dpr}.png`);
    instrument = await call("instrument");
    const knobs = controls.filter(control => control.layer === "lower" && control.kind === "knob" && rounded({ x: control.x, y: control.y }, panels.upper) > control.width * 2);
    report.relight = { builds: instrument.compile.builds - builds, statuses: instrument.layers.map(layer => layer.status),
      knobPixels: knobs.reduce((total, control) => total + changedIn(lit, relit, control, dpr).changed, 0) };
    expect(report.relight.builds, "each layer is rebuilt with the new light").toBe(3);
    expect(report.relight.statuses).toEqual(["ready", "ready", "ready"]);
    expect(report.relight.knobPixels, "the knobs' parts are relit").toBeGreaterThan(1000);
    await call("relight", 323);

    // Lifecycle: scenes and retirements return to their counts after a rebuild, a cancel, disable and re-enable.
    const resources = async () => {
      await page.waitForFunction(async () => ((await window.instrumentCore.ready).instrument()?.resources.retiring ?? 0) === 0, null, { timeout: 15000 });
      return (await call("instrument"))?.resources ?? null;
    };
    report.lifecycle = { afterRebuild: await resources() };
    expect(report.lifecycle.afterRebuild).toMatchObject({ scenes: 3, retiring: 0 });
    await call("cancel", "upper");
    report.lifecycle.afterCancel = await resources();
    expect(report.lifecycle.afterCancel).toMatchObject({ scenes: 2, retiring: 0 });
    await call("restore", "upper");
    report.lifecycle.afterRestore = await resources();
    expect(report.lifecycle.afterRestore).toMatchObject({ scenes: 3, retiring: 0 });
    report.lifecycle.disabled = await call("disable");
    expect(report.lifecycle.disabled.mode).toBe("dom");
    expect(await call("instrument"), "disable releases every scene with the engine").toBeNull();
    report.lifecycle.enabled = await call("enable");
    expect(report.lifecycle.enabled.mode).toBe("gpu");
    report.lifecycle.afterEnable = await resources();
    expect(report.lifecycle.afterEnable).toMatchObject({ scenes: 3, retiring: 0 });
    instrument = await call("instrument");
    expect(instrument.layers.map(layer => layer.status)).toEqual(["ready", "ready", "ready"]);

    // Density 250: poses only for 300 frames.
    report.density = await call("setDensity", 250);
    await stillGpu(call, "250 controls");
    instrument = await call("instrument");
    expect(instrument.layers.every(layer => layer.status === "ready"), JSON.stringify(instrument.layers.map(layer => [layer.id, layer.status, layer.steppedDown.slice(0, 2)]))).toBe(true);
    await shot(page, `${directory}/density250-dpr${dpr}.png`);
    report.animate250 = await call("animate", 300);
    expect(report.animate250.captures, "250 controls: poses need no capture").toBe(0);
    expect(report.animate250.geometryUpdates, "250 controls: hit geometry unchanged").toBe(0);
    instrument = await call("instrument");
    report.timing250 = instrument.layers.map(layer => ({ id: layer.id, parts: layer.parts, kinds: layer.kinds, ...layer.gpu }));
    report.end = await stillGpu(call, "end");
    report.compile = instrument.compile;
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/report-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});

test("instrument material: a part that breaks its box is drawn at the Relief level, with the diagnostic", async ({ browser }) => {
  test.setTimeout(300000);
  const report = {};
  for (const dpr of [1, 2]) {
    const { context, page, errors, call } = await open(browser, dpr, "?overshoot=1");
    try {
      await stillGpu(call, "overshoot start");
      const lower = (await call("materials")).find(material => material.id === "lower");
      const stepped = lower.degraded;
      report[`dpr${dpr}`] = { degraded: stepped };
      expect(stepped.length).toBe(1);
      expect(stepped[0].object).toBe("lower-knob-0");
      expect(stepped[0].reason).toBe("containment");
      expect(stepped[0].part).toBe("pointer");
      expect(stepped[0].overshoot, "the overshoot past the box, in px").toBeGreaterThan(1);
      const diff = await meshDiff(call, page, dpr, "overshoot", stepped.map(entry => entry.object));
      report[`dpr${dpr}`].outside = diff.outside;
      expect(diff.outside, `nothing is drawn outside the boxes: ${JSON.stringify(diff.outsideSamples.slice(0, 6))}`).toBe(0);
      await stillGpu(call, "overshoot end");
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/overshoot.json`, JSON.stringify(report, null, 2));
});

test("instrument material: the start reaches GPU with every scene built, 10 times, while a successor races the pipelines", async ({ browser }) => {
  test.setTimeout(600000);
  const runs = [];
  for (let run = 0; run < 10; run++) {
    const { context, call, errors } = await open(browser, run % 2 ? 2 : 1, "?race=1");
    try {
      const boot = await call("boot"), instrument = await call("instrument"), counts = await call("counts");
      runs.push({ run, dpr: run % 2 ? 2 : 1, boot, mode: counts.mode, statuses: instrument.layers.map(layer => layer.status), compile: instrument.compile, errors });
      expect(counts.mode, `run ${run}: ${counts.reason}`).toBe("gpu");
      expect(counts.reason).toMatch(healthy);
      expect(instrument.layers.map(layer => layer.status)).toEqual(["ready", "ready", "ready"]);
      expect(instrument.compile.timeouts).toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/starts.json`, JSON.stringify(runs, null, 2));
  // The race path ran: a successor composition started while a mesh build held the compile gate.
  for (const run of runs) expect(run.compile.deferredDeadlines, `run ${run.run}: its successor deadline was deferred by a build`).toBeGreaterThanOrEqual(1);
});

test("instrument material: a build that hangs times out, its layer steps down, and a racing successor still publishes", async ({ browser }) => {
  test.setTimeout(300000);
  // `?hang=1`: core's internal test hook never lets the lower panel's first build finish; `?race=1`: a relief layer joins
  // right after enable, while that build holds the compile gate. The successor waits at most 3 s for it.
  const { context, page, call, errors, warnings } = await open(browser, 1, "?hang=1&race=1");
  try {
    const boot = await call("boot");
    await page.waitForFunction(async () => (await window.instrumentCore.ready).instrument()?.layers.find(layer => layer.id === "lower")?.status === "failed", null, { timeout: 30000 });
    await call("settle");
    const instrument = await call("instrument"), counts = await call("counts"), state = await call("state");
    const lower = instrument.layers.find(layer => layer.id === "lower");
    const report = { boot, compile: instrument.compile, statuses: instrument.layers.map(layer => [layer.id, layer.status]), lower: { status: lower.status, steppedDown: lower.steppedDown.slice(0, 1) },
      layers: state.layers.map(layer => layer.id), mode: counts.mode, reason: counts.reason };
    await writeFile(`${directory}/hang.json`, JSON.stringify(report, null, 2));
    expect(counts.mode, counts.reason).toBe("gpu");
    expect(counts.reason).toMatch(healthy);
    expect(lower.steppedDown[0]).toMatchObject({ reason: "compile" });
    expect(lower.steppedDown[0].detail).toContain("timed out after 10000 ms");
    expect(instrument.compile.timeouts).toBe(1);
    expect(instrument.layers.filter(layer => layer.id !== "lower").map(layer => layer.status)).toEqual(["ready", "ready"]);
    expect(state.layers.map(layer => layer.id), "the racing layer was published").toContain("extra");
    // The successor waited for the hung build only up to the 3 s ceiling, then compiled within its own 1.5 s deadline
    // (the hook holds the build in script, not the GPU) and was published, with no fallback; the build's own 10 s deadline
    // still stepped the lower layer down.
    expect(instrument.compile.deferredDeadlines, "the successor waited for the hung build").toBe(1);
    expect(instrument.compile.deferredMs, "for the 3 s ceiling, not the 10 s build deadline").toBeGreaterThan(2900);
    expect(instrument.compile.deferredMs).toBeLessThan(3500);
    expect(errors.filter(error => !error.includes("is drawn at the Relief level"))).toEqual([]);
    expect(warnings.some(warning => warning.includes("stopped waiting for an instrument scene build after 3000 ms")), "the ceiling, not the gate, released the successor").toBe(true);
  } finally { await context.close(); }
});

/**
 * Every profile type is lit alike: a lathe, a prism and an extrude in one matte material, each with a flat top facing
 * the viewer (`swatches`), must shade their tops within a few levels of each other, and never near black. A triangle
 * wound against Lite's front-face convention is shaded with its normal flipped by double-sided PBR, which once drew
 * every prism and extrude top near black (1–7 levels) while lathes were lit.
 */
for (const dpr of [1, 2]) test(`instrument material: prism and extrude tops are lit like a lathe's DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(120000);
  const { context, page, call, errors } = await open(browser, dpr, "?density=4");
  try {
    await stillGpu(call, "boot");
    const swatches = await call("swatches", true);
    await stillGpu(call, "swatches");
    const png = await shot(page, `${directory}/swatches-dpr${dpr}.png`);
    // The mean of a 7 × 7 patch of device pixels at each top's centre (the tops are 40 px across, drift a few px).
    const patch = ({ x, y }) => {
      const sum = [0, 0, 0];
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const offset = ((Math.round(y * dpr) + dy) * png.width + Math.round(x * dpr) + dx) * 4;
        for (let channel = 0; channel < 3; channel++) sum[channel] += png.data[offset + channel];
      }
      return sum.map(value => value / 49);
    };
    const tops = Object.fromEntries(swatches.map(swatch => [swatch.kind, patch(swatch)]));
    const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    await writeFile(`${directory}/swatches-dpr${dpr}.json`, JSON.stringify({ swatches, tops, luminance: Object.fromEntries(Object.entries(tops).map(([kind, rgb]) => [kind, luminance(rgb)])) }, null, 2));
    for (const [kind, rgb] of Object.entries(tops)) expect(luminance(rgb), `${kind} top is lit (${rgb.map(Math.round)})`).toBeGreaterThan(40);
    for (const kind of ["prism", "extrude"]) {
      const deviation = Math.max(...tops[kind].map((value, index) => Math.abs(value - tops.lathe[index])));
      expect(deviation, `${kind} top (${tops[kind].map(Math.round)}) against the lathe's (${tops.lathe.map(Math.round)})`).toBeLessThan(12);
    }
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
