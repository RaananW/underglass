/**
 * Core's emitters and the pointer light (core work item 2, `docs/ui-library/instrument-phase2.md`) on
 * `instrument-emitters-core.html` (`window.emittersCore`, from `examples/playground/src/instrument-emitters-core/page.ts`):
 * a full-window stage layer and three overlapping panels with lamps beside labels, LEDs, keys, knobs and lit rings, at
 * the Relief, Objects and Instrument levels (`?level=`), with every material set through the public `setMaterial` and
 * the pointer light written each frame through `handle.setEmitters`. At DPR 1 and 2, at each level, the test checks
 * that:
 * - decoded pixels show the lamp's pool on the face (gain at one lens diameter and further), past the panel's edge onto
 *   the lower panel, and onto the dark stage past the corner lamp;
 * - the label and caption beside the brightest lamp keep a decoded WCAG contrast of at least 4.5:1 on both themes with
 *   the lamp off and on, and inside their protected rects the whole change against core's plain pass (the relief, the
 *   part shadows and the light together) stays within `interior.max`;
 * - native hits on every visible control are the same with the lamps off and on, with no hit-geometry update;
 * - at Relief and Objects the pointer light's highlight moves on a dome or bevel with the pointer (pixels change on the
 *   part), never inside protected text;
 * - the pointer light crossing three panels for 300 real mouse moves at 60 Hz causes 0 captures, 0 uploads and 0
 *   hit-geometry updates, with GPU on;
 * - the budget: 64 emitters draw, the 65th is dropped with the diagnostic, GPU on;
 * - the face pool's cost (and at Instrument the parts' clustered lights) with 0, 1, 16 and 64 emitters, from Lite's
 *   per-task GPU timings (medians; the RTX 3080's demand-driven clocks make them upper bounds);
 * - the face pools are released with the engine on disable and come back on enable.
 * Reports and screenshots go to the `core-emitters` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-emitters");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;
const levels = ["relief", "objects", "instrument"];
const m = 0.04;

async function open(browser, dpr, query = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(`/instrument-emitters-core.html${query}`);
  await page.waitForFunction(() => window.emittersCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.emittersCore.ready)[name](...args), { name, args });
  return { context, page, errors, call };
}
const shot = async (page, path) => PNG.sync.read(await page.screenshot(path ? { path } : {}));
async function stillGpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}
const pixel = (png, point, dpr) => { const offset = (Math.floor(point.y * dpr) * png.width + Math.floor(point.x * dpr)) * 4; return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]; };
const gain = (off, on, point, dpr) => { const a = pixel(off, point, dpr), b = pixel(on, point, dpr); return (b[0] + b[1] + b[2] - a[0] - a[1] - a[2]) / 3; };
const inside = (point, box, by = 0) => point.x >= box.x - by && point.y >= box.y - by && point.x <= box.x + box.width + by && point.y <= box.y + box.height + by;
/** Every pixel of a client rect (device px), as [r, g, b]. */
function region(png, rect, dpr) {
  const out = [];
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * png.width + x) * 4;
    out.push([png.data[offset], png.data[offset + 1], png.data[offset + 2]]);
  }
  return out;
}
const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
/** Decoded WCAG contrast of a text run: the glyph core (the extreme pixel) against the face (90th percentile the other way). */
function contrast(png, rect, dpr, dark) {
  const pixels = region(png, rect, dpr), lums = pixels.map(luminance), order = lums.map((_, index) => index).sort((a, b) => lums[a] - lums[b]);
  const text = pixels[dark ? order.at(-1) : order[0]], face = pixels[order[Math.floor(order.length * (dark ? 0.1 : 0.9))]];
  return { ratio: Math.round(ratio(luminance(text), luminance(face)) * 100) / 100, text, face };
}
/** The largest change of any channel inside `rect` beyond `1 ± m` times the reference (8-bit levels), and the largest relative change. */
function excess(reference, lit, rect, dpr) {
  const before = region(reference, rect, dpr), after = region(lit, rect, dpr);
  let worst = 0, relative = 0;
  before.forEach((values, index) => values.forEach((value, channel) => {
    const next = after[index][channel];
    worst = Math.max(worst, next - value * (1 + m), value * (1 - m) - next);
    if (value >= 32) relative = Math.max(relative, Math.abs(next / value - 1));
  }));
  return { levels: Math.round(worst * 100) / 100, relative: Math.round(relative * 10000) / 10000, pixels: before.length };
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
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

/** The lamp's pool: gains on the face around it (clear of text and controls) and past its panel's edge along `direction`. */
async function pool(call, page, dpr, lamp, direction, name) {
  await call("allOff");
  const off = await shot(page);
  await call("setLamps", { [lamp]: true });
  const on = await shot(page, `${directory}/${name}-dpr${dpr}.png`);
  const info = (await call("lamps")).find(entry => entry.id === lamp), panels = await call("panels"), panel = panels[info.layer];
  const texts = (await call("textRects"))[info.layer], controls = (await call("controls")).filter(control => control.layer === info.layer);
  const d = info.diameter, face = {};
  for (const scale of [1, 1.5, 2, 3]) {
    const gains = [];
    for (let step = 0; step < 24; step++) {
      const angle = (step / 24) * 2 * Math.PI, point = { x: info.centre.x + Math.cos(angle) * d * scale, y: info.centre.y + Math.sin(angle) * d * scale };
      if (!inside(point, { x: panel.x + 8, y: panel.y + 8, width: panel.width - 16, height: panel.height - 16 })) continue;
      if (texts.some(box => inside(point, box, 12)) || controls.some(box => inside(point, box, 3))) continue;
      gains.push({ ...point, gain: gain(off, on, point, dpr) });
    }
    const values = gains.map(entry => entry.gain);
    face[`${scale}d`] = { points: gains.length, median: median(values), max: values.length ? Math.max(...values) : null, samples: gains.slice(0, 6) };
  }
  // The lamp's own bezel ring, 9.5 px from its centre (at Instrument a part, lit by the clustered light only).
  const bezel = Array.from({ length: 8 }, (_, step) => gain(off, on, { x: info.centre.x + Math.cos((step / 8) * 2 * Math.PI) * 9.5, y: info.centre.y + Math.sin((step / 8) * 2 * Math.PI) * 9.5 }, dpr));
  const edge = direction.x < 0 ? { x: panel.x, y: info.centre.y } : direction.x > 0 ? { x: panel.x + panel.width, y: info.centre.y }
    : direction.y > 0 ? { x: info.centre.x, y: panel.y + panel.height } : { x: info.centre.x, y: panel.y };
  const hits = [2, 6, 12, 20, 32, 48].map(distance => ({ x: edge.x + direction.x * distance, y: edge.y + direction.y * distance }));
  const beneath = await call("hits", hits);
  const past = hits.map((point, index) => ({ distance: [2, 6, 12, 20, 32, 48][index], beneath: beneath[index], gain: Math.round(gain(off, on, point, dpr) * 100) / 100 }));
  await call("allOff");
  return { lamp, face, past, bezel: { median: median(bezel), min: Math.min(...bezel) } };
}

for (const dpr of [1, 2]) for (const level of levels) test(`emitters at ${level}: pools, guard, contrast, hits, highlights, the pointer run and the budget DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(600000);
  await mkdir(directory, { recursive: true });
  const report = { dpr, level, browser: browser.version() };
  const { context, page, errors, call } = await open(browser, dpr, `?level=${level}&pointer=0`);
  try {
    report.boot = await call("boot");
    expect(report.boot.mode, `start: ${report.boot.reason}`).toBe("gpu");
    expect(report.boot.reason).toMatch(healthy);
    if (level === "instrument") {
      const instrument = await call("instrument");
      expect(instrument.layers.map(layer => [layer.id, layer.status])).toEqual([["a", "ready"], ["b", "ready"], ["c", "ready"]]);
      expect(instrument.layers.every(layer => layer.lights.clustered), "every Instrument scene has its clustered lights").toBe(true);
    }

    // Pools: on the face, past C's left edge onto B (the brightest lamp), past C's bottom edge onto the stage (the corner lamp).
    report.pool = await pool(call, page, dpr, "c-lamp", { x: -1, y: 0 }, "pool-power");
    expect(report.pool.face["1d"].median, `the pool on the face at one lens diameter: ${JSON.stringify(report.pool.face)}`).toBeGreaterThanOrEqual(3);
    expect(report.pool.past[0].beneath).toBe("b");
    expect(report.pool.past[0].gain, `light past C's edge onto B: ${JSON.stringify(report.pool.past)}`).toBeGreaterThan(2);
    expect(report.pool.past[1].gain).toBeGreaterThan(1);
    if (level === "instrument") expect(report.pool.bezel.median, "the clustered light lights the lamp's bezel").toBeGreaterThan(3);
    await call("setTheme", "dark");
    report.poolDark = await pool(call, page, dpr, "c-lamp", { x: -1, y: 0 }, "pool-power-dark");
    report.stageDark = await pool(call, page, dpr, "c-corner", { x: 0, y: 1 }, "pool-corner-dark");
    expect(report.stageDark.past[0].beneath).toBe("stage");
    expect(report.stageDark.past[1].gain, `light past C's bottom edge onto the dark stage: ${JSON.stringify(report.stageDark.past)}`).toBeGreaterThan(1);
    await call("setTheme", "light");
    await stillGpu(call, "after the pools");

    // Contrast and the guard: the label and caption beside the brightest lamp, both themes, lamp off and on, against the
    // plain pass (the capture with no material).
    report.contrast = {};
    for (const theme of ["light", "dark"]) {
      await call("setTheme", theme);
      await call("allOff");
      await call("setPlain", true);
      const plain = await shot(page);
      await call("setPlain", false);
      await call("allOff");
      const off = await shot(page);
      await call("setLamps", { "c-lamp": true });
      const on = await shot(page, `${directory}/contrast-${theme}-dpr${dpr}.png`);
      report.contrast[theme] = {};
      for (const id of ["c-lamp-label", "c-lamp-caption"]) {
        const rect = await call("textBox", id);
        const entry = { off: contrast(off, rect, dpr, theme === "dark"), on: contrast(on, rect, dpr, theme === "dark"), plain: contrast(plain, rect, dpr, theme === "dark"),
          change: excess(plain, on, rect, dpr), lampChange: excess(off, on, rect, dpr) };
        report.contrast[theme][id] = entry;
        expect(entry.off.ratio, `${theme} ${id}: contrast with the lamp off`).toBeGreaterThanOrEqual(4.5);
        expect(entry.on.ratio, `${theme} ${id}: contrast with the lamp on`).toBeGreaterThanOrEqual(4.5);
        expect(entry.change.levels, `${theme} ${id}: the whole change inside the protected rect stays within interior.max (levels past 1 ± m): ${JSON.stringify(entry.change)}`).toBeLessThanOrEqual(1.5);
      }
      await call("allOff");
    }
    await call("setTheme", "light");
    await stillGpu(call, "after the contrast checks");

    // Native hits on every visible control, lamps off and on, with no hit-geometry update.
    const controls = (await call("controls")).filter(control => !control.covered);
    const centres = controls.map(control => ({ x: control.x + control.width / 2, y: control.y + control.height / 2 }));
    await call("allOff");
    const offHits = await call("hits", centres);
    const before = await call("counts");
    await call("setLamps", Object.fromEntries((await call("lamps")).map(entry => [entry.id, true])));
    const onHits = await call("hits", centres);
    const after = await call("counts");
    report.hits = { controls: controls.length, mismatches: onHits.filter((id, index) => id !== offHits[index]).length, own: offHits.filter((id, index) => id === controls[index].id).length,
      geometryUpdates: after.geometryUpdates - before.geometryUpdates };
    expect(report.hits.controls).toBeGreaterThan(12);
    expect(report.hits.mismatches, "hits are the same with the lamps on").toBe(0);
    expect(report.hits.own, "every visible control is hit at its centre").toBe(controls.length);
    expect(report.hits.geometryUpdates, "lamps leave hit geometry alone").toBe(0);
    await call("allOff");

    // The pointer light's highlight: face share 0, so only the specular term (Relief, Objects) or the clustered light on the
    // parts (Instrument) changes pixels; the pointer moves from one side of A's knob to the other.
    {
      await call("setPointer", { enabled: true, face: 0 });
      const knob = controls.find(control => control.id === "a-knob"), ring = controls.find(control => control.id === "a-ring");
      const at = async point => { await page.mouse.move(point.x, point.y); for (let index = 0; index < 4; index++) await page.evaluate(() => new Promise(requestAnimationFrame)); await call("settle"); return shot(page); };
      const first = await at({ x: knob.x - 60, y: knob.y - 60 });
      const second = await at({ x: knob.x + knob.width + 60, y: knob.y + knob.height + 60 });
      await page.screenshot({ path: `${directory}/highlight-${level}-dpr${dpr}.png` });
      // Text runs of A, less their 1 px rim: the REC label's box reaches under the lit ring part around its cap by a fraction of a pixel.
      const texts = (await call("textRects")).a.map(box => ({ x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 }));
      report.highlight = { knob: changedIn(first, second, knob, dpr), ring: changedIn(first, second, ring, dpr),
        text: texts.reduce((sum, box) => { const value = changedIn(first, second, box, dpr); return { changed: sum.changed + value.changed, compared: sum.compared + value.compared }; }, { changed: 0, compared: 0 }) };
      expect(report.highlight.knob.changed, "the highlight moves on the knob").toBeGreaterThan(20 * dpr * dpr);
      expect(report.highlight.text.compared).toBeGreaterThan(1000);
      expect(report.highlight.text.changed, "no highlight inside protected text").toBe(0);
      await call("setPointer", { enabled: false, face: 0.3 });
    }

    // The pointer light crossing the stage and three panels: 300 real mouse moves at 60 Hz.
    await call("setPointer", { enabled: true, face: 0.3 });
    const panels = await call("panels");
    const path = [{ x: 40, y: panels.a.y + panels.a.height / 2 }, { x: panels.a.x + panels.a.width * 0.3, y: panels.a.y + panels.a.height * 0.6 },
      { x: panels.b.x + panels.b.width * 0.5, y: panels.b.y + panels.b.height * 0.7 }, { x: panels.c.x + panels.c.width * 0.6, y: panels.c.y + panels.c.height * 0.5 }, { x: viewport.width - 30, y: viewport.height - 160 }];
    await page.mouse.move(path[0].x, path[0].y);
    await call("settle");
    const hitsBeforeRun = await call("hits", centres);
    await call("resetPointerStats");
    const runBefore = await call("counts");
    // Real mouse input, one move per 16.7 ms (the I0.3 probe's pacing).
    const started = performance.now(), crossed = new Set();
    for (let index = 0; index < 300; index++) {
      const along = (index / 299) * (path.length - 1), segment = Math.min(path.length - 2, Math.floor(along)), t = along - segment;
      const point = { x: path[segment].x + (path[segment + 1].x - path[segment].x) * t, y: path[segment].y + (path[segment + 1].y - path[segment].y) * t };
      await page.mouse.move(point.x, point.y);
      for (const id of ["a", "b", "c"]) if (inside(point, panels[id])) crossed.add(id);
      const wait = started + ((index + 1) * 1000) / 60 - performance.now();
      if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const runAfter = await call("counts");
    const seconds = (performance.now() - started) / 1000;
    const hitsAfterRun = await call("hits", centres);
    // The light under the pointer on B's face, clear of text, with the pointer light and without it (a screenshot asks the
    // browser for a paint with no attribution, which recaptures every layer, so every shot is taken after the run).
    const probe = { x: panels.b.x + panels.b.width * 0.5, y: panels.b.y + panels.b.height * 0.85 };
    await page.mouse.move(probe.x, probe.y);
    await call("settle");
    const litShot = await shot(page, `${directory}/pointer-${level}-dpr${dpr}.png`);
    await call("setPointer", { enabled: false });
    const unlitShot = await shot(page);
    report.pointerRun = { seconds: Math.round(seconds * 100) / 100, crossed: [...crossed].sort(), captures: runAfter.captures - runBefore.captures, uploads: runAfter.uploads - runBefore.uploads,
      geometryUpdates: runAfter.geometryUpdates - runBefore.geometryUpdates, gpuFrames: runAfter.gpuFrames - runBefore.gpuFrames, mode: runAfter.mode, stats: await call("pointerStats"),
      hitMismatches: hitsAfterRun.filter((id, index) => id !== hitsBeforeRun[index]).length, underPointer: { lit: pixel(litShot, probe, dpr), unlit: pixel(unlitShot, probe, dpr) } };
    expect(report.pointerRun.crossed, "the path crosses the three panels").toEqual(["a", "b", "c"]);
    expect(report.pointerRun.mode).toBe("gpu");
    expect(report.pointerRun.hitMismatches, "hits are unchanged by the pointer light").toBe(0);
    expect(gain(unlitShot, litShot, probe, dpr), `the pointer light lights the face under it: ${JSON.stringify(report.pointerRun.underPointer)}`).toBeGreaterThan(2);
    // Each layer lights its own content once: on B, a point in C's outset gains what its mirror image about the pointer
    // gains (C's pass must not add the pointer light to what lies beneath it).
    const outsetPoint = { x: panels.c.x - 24, y: probe.y }, mirror = { x: 2 * probe.x - outsetPoint.x, y: probe.y };
    report.pointerRun.once = { outset: gain(unlitShot, litShot, outsetPoint, dpr), mirror: gain(unlitShot, litShot, mirror, dpr), beneath: await call("hits", [outsetPoint, mirror]) };
    expect(report.pointerRun.once.beneath).toEqual(["b", "b"]);
    expect(report.pointerRun.once.mirror, "the pointer light reaches the mirror point").toBeGreaterThan(1);
    expect(Math.abs(report.pointerRun.once.outset - report.pointerRun.once.mirror), `the pointer light is applied once: ${JSON.stringify(report.pointerRun.once)}`).toBeLessThanOrEqual(1.5);
    expect(report.pointerRun.captures, "the pointer light needs no capture").toBe(0);
    expect(report.pointerRun.uploads, "the pointer light needs no upload").toBe(0);
    expect(report.pointerRun.geometryUpdates, "the pointer light leaves hit geometry alone").toBe(0);
    expect(report.pointerRun.stats.updates, "the light is written every frame the pointer moves").toBeGreaterThan(250);
    expect(report.pointerRun.gpuFrames).toBeGreaterThan(250);
    await call("setPointer", { enabled: false });
    await stillGpu(call, "after the pointer run");

    // The budget: 64 emitters draw, the 65th is dropped (reported), 80 drop 16; GPU on.
    const at64 = await call("setDensity", "b", 64), at65 = await call("setDensity", "b", 65), at80 = await call("setDensity", "b", 80);
    report.budget = { at64: { drawn: at64.drawn.length, dropped: at64.dropped }, at65: { drawn: at65.drawn.length, dropped: at65.dropped }, at80: { drawn: at80.drawn.length, dropped: at80.dropped.length, pass: at80.pass } };
    await page.screenshot({ path: `${directory}/density80-${level}-dpr${dpr}.png` });
    expect(report.budget.at64).toEqual({ drawn: 64, dropped: [] });
    expect(report.budget.at65.drawn).toBe(64);
    expect(report.budget.at65.dropped.map(entry => entry.index)).toEqual([64]);
    expect(report.budget.at80.drawn).toBe(64);
    expect(report.budget.at80.dropped).toBe(16);
    expect(report.budget.at80.pass).toBe("drawn");
    await stillGpu(call, "over the emitter budget");
    await call("setDensity", "b", null);

    // Cost: the stage's face pool (the whole window), and at Instrument panel B's pool and its parts' clustered lights.
    report.cost = [];
    for (const count of [0, 1, 16, 64]) {
      const stage = await call("cost", "stage", count);
      const entry = { count, stageLight: stage.light.p50, stageSamples: stage.light.samples, captures: stage.captures };
      if (level === "instrument") { const b = await call("cost", "b", count); Object.assign(entry, { bLight: b.light.p50, bMesh: b.mesh.p50, bMeshSamples: b.mesh.samples }); }
      report.cost.push(entry);
      expect(stage.drawn).toBe(count);
      expect(stage.mode).toBe("gpu");
    }
    const timing = (await call("emitters")).timing;
    report.timing = timing;
    expect(timing.status).toBe("available");
    expect(report.cost.find(entry => entry.count === 64).stageSamples, "the face pool's task timings arrive").toBeGreaterThan(20);

    // Lifecycle: disable releases every face pool with the engine; enable brings them back.
    report.disabled = await call("disable");
    expect(report.disabled.mode).toBe("dom");
    expect((await call("state")).resources.lightPasses, "no face pool outlives the engine").toBe(0);
    report.enabled = await call("enable");
    expect(report.enabled.mode).toBe("gpu");
    await call("setLamps", { "c-lamp": true });
    const lights = (await call("emitters")).layers.find(layer => layer.id === "c");
    expect(lights.pass).toBe("drawn");
    report.end = await stillGpu(call, "end");
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/report-${level}-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
