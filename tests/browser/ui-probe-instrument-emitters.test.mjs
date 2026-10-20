/**
 * Instrument probe I0.3, emitters and the pointer light, on `ui-probe-instrument-emitters.html` (`window.emitterProbe`;
 * see docs/ui-library/instrument.md, Phase I0, and the page's header for how the light is drawn). At 1920 × 1080 the
 * test checks that:
 * - a lit lamp lights the captured face around it, the parts near it (the clustered lights on the Instrument level's
 *   meshes) and the page past its panel's edge (decoded pixels, lamp on against lamp off), at the Relief, Objects and
 *   Instrument levels, on the light and dark themes;
 * - the contrast guard holds: the decoded WCAG contrast of the label and the caption beside the brightest lamp stays at
 *   least 4.5:1 with the lamp off and on, and the emitter light changes their pixels by at most `interior.max` (one
 *   8-bit level of rounding allowed); the same frame without the guard is measured for comparison;
 * - native hits on every visible control are the same with every lamp off and on;
 * - the pointer light, driven by real mouse input across the three panels for 300 frames at 60 fps, causes no capture,
 *   no upload and no hit-geometry update, and GPU presentation stays on, at Relief, Objects and Instrument, DPR 1 and 2;
 *   it fades out over `motion.fast` when the pointer leaves, and at once under reduced motion;
 * - the cost of 0 to 256 emitters on one 1920 × 1080 layer (the light pass, tiled and as one loop over every emitter, and
 *   the clustered lights of a mesh scene covering the layer), at DPR 1 and 2, from Lite's per-task GPU timings;
 * - `prefers-contrast: more` turns the emitters off and a lit lens is flat colour; under `forced-colors: active` GPU
 *   presentation is admitted and stays on (core's admission marker opts out of forced colours, #133) and the native lamps work.
 * Reports and screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const levels = ["relief", "objects", "instrument"];

async function open(browser, { dpr = 1, level = "instrument", theme = "light", ...emulation } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr, ...emulation });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(`/ui-probe-instrument-emitters.html?level=${level}&theme=${theme}`);
  await page.waitForFunction(() => window.emitterProbe);
  const error = await page.evaluate(async () => { try { await window.emitterProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.emitterProbe.ready)[name](...args), { name, args });
  const stillGpu = async label => {
    const counts = await call("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
    return counts;
  };
  return { context, page, errors, call, stillGpu };
}
const save = async (name, report) => { await mkdir(directory, { recursive: true }); await writeFile(`${directory}/${name}.json`, JSON.stringify(report, null, 2)); };
const visibleHits = async call => {
  const controls = await call("controls");
  const points = controls.map(control => ({ x: control.x + control.width / 2, y: control.y + control.height / 2 }));
  return { ids: controls.map(control => control.id), hits: await call("hits", points) };
};

test("I0.3 lamps light the face, nearby parts and the page past the edge; the guard keeps AA; hits unchanged", async ({ browser }) => {
  test.setTimeout(600000);
  const { context, page, errors, call, stillGpu } = await open(browser);
  const report = { browser: browser.version(), userAgent: await call("browser"), tokens: await call("tokens"), clustered: await call("clustered"), protectedRects: await call("protectedRects"), runs: [] };
  try {
    await stillGpu("start");
    for (const theme of ["light", "dark"]) {
      await call("setTheme", theme);
      for (const level of levels) {
        await call("setLevel", level);
        const counts = await stillGpu(`${level} ${theme}`);
        // The brightest lamp, beside its label, near panel C's left edge (over panel B); and C's corner lamp near its
        // bottom edge (over the stage).
        const power = await call("pool", "c-lamp", { x: -1, y: 0 });
        const corner = await call("pool", "c-corner", { x: 0, y: 1 });
        const contrast = await call("contrast", ["c-lamp-label", "c-lamp-caption"], "c-lamp");
        // Hits with every lamp off and on.
        for (const lamp of await call("lamps")) await call("setLamp", lamp.id, false);
        const hitsOff = await visibleHits(call);
        for (const lamp of await call("lamps")) await call("setLamp", lamp.id, true);
        await call("settle");
        const hitsOn = await visibleHits(call);
        await page.screenshot({ path: `${directory}/emitters-${level}-${theme}.png` });
        const end = await stillGpu(`${level} ${theme} after lamps`);
        const run = { theme, level, power, corner, contrast, hitsOff, hitsOn, geometryUpdates: end.geometryUpdates - counts.geometryUpdates };
        report.runs.push(run);

        // The pool on the face: strong at one lens diameter, fading with distance.
        const ring = distance => power.face.filter(point => point.distance === distance).map(point => point.gain);
        expect(Math.max(...ring(28)), `${level} ${theme}: pool at one diameter`).toBeGreaterThan(10);
        expect(Math.max(...ring(42)), `${level} ${theme}: pool at 1.5 diameters`).toBeGreaterThan(3);
        expect(Math.max(...ring(84), 0), `${level} ${theme}: pool fades by 3 diameters`).toBeLessThan(Math.max(...ring(28)));
        // Past the panel's edge: the pool lands on panel B beneath panel C's outset.
        const past = power.past.filter(point => point.distance <= 20);
        for (const point of past) expect(point.beneath, `${level} ${theme}: ${point.distance} px past C's edge is panel B`).toBe("b");
        expect(Math.min(...past.map(point => point.gain)), `${level} ${theme}: light past the panel's edge`).toBeGreaterThan(2);
        // Past the bottom edge onto the stage: visible on the dark stage (the light stage is white and cannot brighten).
        if (theme === "dark") expect(Math.min(...corner.past.filter(point => point.distance <= 12).map(point => point.gain)), `${level}: light on the stage past the edge`).toBeGreaterThan(1.5);
        // Nearby objects: at the Instrument level the lamp's bezel and the LED and key near it are lit by the clustered lights.
        if (level === "instrument") {
          expect(Math.max(...power.parts.filter(part => part.id === "c-lamp").map(part => part.gain)), `${theme}: the lamp's bezel is lit`).toBeGreaterThan(10);
          expect(Math.max(...power.parts.filter(part => part.id === "c-key").map(part => part.gain)), `${theme}: the key near the lamp is lit`).toBeGreaterThan(2);
        }
        // The guard: AA with the lamp off and on, and the text's pixels change by at most interior.max.
        for (const sample of contrast) {
          expect(sample.off.ratio, `${level} ${theme}: ${sample.id} with the lamp off`).toBeGreaterThanOrEqual(4.5);
          expect(sample.on.ratio, `${level} ${theme}: ${sample.id} beside the lit lamp`).toBeGreaterThanOrEqual(4.5);
          expect(sample.excessLevels, `${level} ${theme}: ${sample.id} changes beyond interior.max (levels)`).toBeLessThanOrEqual(1);
        }
        // Hits are unchanged by the light.
        expect(hitsOn.ids).toEqual(hitsOff.ids);
        expect(hitsOff.hits, `${level} ${theme}: native hits land on every control`).toEqual(hitsOff.ids);
        expect(hitsOn.hits, `${level} ${theme}: native hits with every lamp lit`).toEqual(hitsOff.hits);
        expect(run.geometryUpdates, `${level} ${theme}: the light changes no hit geometry`).toBe(0);
      }
    }
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await save("emitters-lamps", report);
    await context.close();
  }
});

for (const dpr of [1, 2]) test(`I0.3 pointer light crosses three panels for 300 frames with no capture or hit-geometry update DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(600000);
  const { context, page, errors, call, stillGpu } = await open(browser, { dpr, theme: "dark" });
  const report = { dpr, browser: browser.version(), preferences: await call("preferences"), runs: [] };
  try {
    expect(report.preferences.fine, "the pointer light needs a fine pointer").toBe(true);
    const panels = await call("panels");
    // Left to right across the stage, A, B (where it overlaps A and C) and C, at 45% of the height.
    const y = 1080 * 0.45, path = index => ({ x: 40 + (1840 * index) / 299, y: y + 30 * Math.sin(index / 25) });
    for (const level of levels) {
      await call("setLevel", level);
      for (const lamp of await call("lamps")) await call("setLamp", lamp.id, true);
      await page.mouse.move(path(0).x, path(0).y);
      await call("settle");
      const hitsBefore = await visibleHits(call);
      await call("resetPointerStats");
      const before = await stillGpu(`${level} before`);
      // Real mouse input, one move per 16.7 ms.
      const started = performance.now(), crossed = new Set();
      for (let index = 0; index < 300; index++) {
        const point = path(index);
        await page.mouse.move(point.x, point.y);
        for (const [id, box] of Object.entries(panels)) if (id !== "stage" && point.x > box.x && point.x < box.x + box.width && point.y > box.y && point.y < box.y + box.height) crossed.add(id);
        const wait = started + ((index + 1) * 1000) / 60 - performance.now();
        if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const after = await stillGpu(`${level} after`);
      const stats = await call("pointerStats");
      // The light under the pointer, on panel B's face clear of text: with the pointer light and without it.
      const probe = { x: panels.b.x + panels.b.width * 0.5, y: panels.b.y + panels.b.height * 0.8 };
      await page.mouse.move(probe.x, probe.y);
      await call("settle");
      const [lit] = await call("pixels", [probe]);
      await call("setPointer", false);
      await call("settle");
      const [unlit] = await call("pixels", [probe]);
      await call("setPointer", true);
      const hitsAfter = await visibleHits(call);
      if (level === "instrument") await page.screenshot({ path: `${directory}/emitters-pointer-dpr${dpr}.png` });
      const run = { level, frames: 300, seconds: (performance.now() - started) / 1000, crossed: [...crossed], captures: after.captures - before.captures, uploads: after.uploads - before.uploads,
        geometryUpdates: after.geometryUpdates - before.geometryUpdates, gpuFrames: after.gpuFrames - before.gpuFrames, stats, probe, lit, unlit, hitsBefore, hitsAfter };
      report.runs.push(run);
      expect(run.crossed.sort(), `${level}: the path crosses the three panels`).toEqual(["a", "b", "c"]);
      expect(run.captures, `${level}: the pointer light needs no capture`).toBe(0);
      expect(run.uploads, `${level}: the pointer light needs no upload`).toBe(0);
      expect(run.geometryUpdates, `${level}: the pointer light changes no hit geometry`).toBe(0);
      expect(stats.updates, `${level}: the light is rewritten about once per frame`).toBeGreaterThanOrEqual(270);
      expect(stats.intervals.p50, `${level}: updates run at 60 fps`).toBeLessThan(20);
      expect(lit[0] + lit[1] + lit[2], `${level}: the pointer light lights the face under it`).toBeGreaterThan(unlit[0] + unlit[1] + unlit[2] + 9);
      expect(hitsAfter.hits).toEqual(hitsBefore.hits);
      expect(hitsAfter.hits).toEqual(hitsAfter.ids);
    }
    // The fade: out over motion.fast when the pointer leaves, back when it returns.
    await call("pointerLeave");
    report.fadeOut = await call("pointerFade", 12);
    await page.mouse.move(960, 500);
    report.fadeIn = await call("pointerFade", 12);
    const fast = (await call("tokens")).pointer.fade;
    expect(report.fadeOut[0], "the fade starts from the lit pointer").toBeGreaterThan(0);
    expect(report.fadeOut.at(-1), `faded out within ${fast} ms`).toBe(0);
    expect(report.fadeOut.filter(value => value > 0 && value < 1).length, "the fade passes through in-between values").toBeGreaterThan(2);
    expect(report.fadeIn.at(-1)).toBe(1);
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await save(`emitters-pointer-dpr${dpr}`, report);
    await context.close();
  }
});

test("I0.3 pointer light has no fade under reduced motion", async ({ browser }) => {
  const { context, page, errors, call } = await open(browser, { reducedMotion: "reduce" });
  try {
    await page.mouse.move(960, 500);
    await call("pointerFade", 3);
    await call("pointerLeave");
    const out = await call("pointerFade", 2);
    expect(out[0], "off on the next frame").toBe(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test("I0.3 cost per emitter count on one 1920 x 1080 layer, DPR 1 and 2", async ({ browser }) => {
  test.setTimeout(600000);
  const report = { browser: browser.version(), runs: [] };
  try {
    for (const dpr of [1, 2]) {
      const { context, errors, call, stillGpu } = await open(browser, { dpr });
      try {
        for (const tiles of [true, false]) for (const count of [0, 1, 4, 16, 64, 256]) {
          const run = await call("cost", count, 180, tiles);
          report.runs.push(run);
          expect(run.mode, `${count} emitters DPR${dpr}: GPU stays on`).toBe("gpu");
          expect(run.timing, "Lite's per-task GPU timings are available").toBe("available");
          expect(run.lightPass.samples).toBeGreaterThan(90);
          if (count > 0) expect(run.meshScene.samples).toBeGreaterThan(90);
          expect(run.captures, "emitters need no capture").toBe(0);
        }
        await stillGpu(`DPR${dpr} end`);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    }
    // The recommended budget: 64 emitters on a full-screen layer stay within 3 ms of GPU time at DPR 2 (the tiled light
    // pass and the clustered mesh scene together, medians; single-frame spikes are recorded in p95), and tiling keeps
    // the light pass from growing with every emitter on every pixel.
    const find = (dpr, count, tiled) => report.runs.find(run => run.dpr === dpr && run.count === count && run.tiled === tiled);
    const at64 = find(2, 64, true);
    expect(at64.lightPass.p50 + at64.meshScene.p50, "64 emitters at DPR 2").toBeLessThan(3);
    expect(find(2, 256, true).lightPass.p50, "tiles: 256 emitters at DPR 2").toBeLessThan(find(2, 256, false).lightPass.p50 / 2);
  } finally {
    await save("emitters-cost", report);
  }
});

test("I0.3 prefers-contrast more turns emitters off and a lit lens is flat", async ({ browser }) => {
  test.setTimeout(300000);
  const report = {};
  try {
    for (const [name, emulation] of [["contrast-more", { contrast: "more" }]]) {
      const { context, page, errors, call, stillGpu } = await open(browser, emulation);
      try {
        const preferences = await call("preferences");
        expect(preferences.emitters, `${name}: emitters are off`).toBe(false);
        const power = await call("pool", "c-lamp", { x: -1, y: 0 });
        const corner = await call("pool", "c-corner", { x: 0, y: 1 });
        await call("setLamp", "c-lamp", true);
        await call("settle");
        await page.screenshot({ path: `${directory}/emitters-${name}.png` });
        const lens = await call("pixels", [-3, 0, 3].flatMap(dx => [-3, 0, 3].map(dy => ({ x: power.centre.x + dx, y: power.centre.y + dy }))));
        report[name] = { preferences, emitters: await call("emitters"), power, corner, lens, counts: await stillGpu(name) };
        const gains = [...power.face, ...power.past, ...corner.past].map(point => Math.abs(point.gain));
        expect(Math.max(...gains), `${name}: no emitter light on the face or past the edge`).toBeLessThanOrEqual(1);
        for (const layer of report[name].emitters) expect(layer.lit, `${name}: ${layer.layer} draws no emitter`).toEqual([]);
        // Instrument level: the lit lens is one flat, unlit colour (no highlight, no shading) across its middle.
        for (const pixel of lens) for (const channel of [0, 1, 2]) expect(Math.abs(pixel[channel] - lens[4][channel]), `lens pixel ${pixel} against ${lens[4]}`).toBeLessThanOrEqual(2);
        expect(lens[4][0] - lens[4][2], "the flat lens keeps its colour").toBeGreaterThan(100);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    }
  } finally {
    await save("emitters-preferences", report);
  }
});

test("I0.3 forced colors: GPU stays admitted and the native lamps still work", async ({ browser }) => {
  // Core's functional admission marker opts out of forced colours (#133), so GPU presentation starts under forced
  // colours and stays on (the content is still presented in forced colours). The native lamp is found by native hit
  // testing and toggles under real pointer input.
  const { context, page, call, stillGpu } = await open(browser, { forcedColors: "active" });
  const report = {};
  try {
    report.forced = await page.evaluate(() => matchMedia("(forced-colors: active)").matches);
    expect(report.forced).toBe(true);
    report.counts = await stillGpu("forced colors");
    const box = await page.locator("#c-lamp").boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    expect((await call("hits", [point]))[0], "native hit finds the lamp").toBe("c-lamp");
    await page.mouse.click(point.x, point.y);
    report.checked = await page.evaluate(() => document.getElementById("c-lamp").checked);
    expect(report.checked, "the native lamp toggles").toBe(true);
    await stillGpu("after the click");
    await page.screenshot({ path: `${directory}/emitters-forced-colors.png` });
  } finally {
    await save("emitters-forced-colors", report);
    await context.close();
  }
});
