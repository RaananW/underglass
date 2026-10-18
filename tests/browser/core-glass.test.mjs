/**
 * Core's Instrument glass and capture probe (core work item 4, `docs/ui-library/instrument-phase2.md`) on
 * `instrument-glass-core.html` (`window.glassCore`, from `examples/playground/src/instrument-glass-core/page.ts`): a display
 * window over stripes and text, three glass lens knobs over printed target rings, a chrome knob that reflects the page, a
 * glass plate over a checkerboard and a lamp with a glass lens, on one enrolled panel. At DPR 1 and 2 it checks that:
 * - **refraction is visible:** the printed ring seen through a clear lens is magnified (its radius along a diagonal, where
 *   no bar crosses it, against its nominal radius), and the glass differs from the same parts drawn as an opaque lacquer;
 * - **the Fresnel edge and the studio reflection are drawn:** with the glass reflection on against off, the lens rim gains
 *   levels while its centre barely changes, and a measured share of the lens changes;
 * - **text under and beside glass is within the guard:** text under the window is the capture texel (0 mismatched pixels
 *   against the layer drawn without objects), prints beside the glass change by at most `interior.max` with the part
 *   shadows and the lamp's light on, and the display's text keeps its contrast;
 * - **containment and hits:** with the parts on against off (shadows and light off) no pixel changes outside a control's
 *   rounded box, and native hits on changed pixels find their control;
 * - **nothing is recaptured:** 300 frames with the pointer moving and the knobs posed take no capture, upload, geometry
 *   update or probe refresh; typing into the display refreshes the probe exactly once per capture;
 * - **the probe reflects the page:** the chrome knob with the page probe differs from the studio alone, inside its box;
 * - GPU stays on and nothing is stepped down throughout; a probe that fails to build (`?failProbe=1`) leaves the studio
 *   alone, and a glass that fails to build (`?failGlass=1`) leaves the face showing through, both diagnosed, GPU on;
 * - GPU costs per stage and the probe's build and refresh cost (medians and 95th percentiles; the RTX 3080's clocks are
 *   demand-driven, so they are upper bounds).
 * Reports and screenshots go to the `core-glass` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-glass");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;
const MAX = Math.ceil(0.04 * 255) + 1;

function rounded(point, box) {
  const radius = Math.min(box.radius ?? 0, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
const luminance = (data, offset) => 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const relative = rgb => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const contrast = (a, b) => { const [hi, lo] = [relative(a), relative(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const percentile = (values, q) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null; };

async function open(browser, dpr, query = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(`/instrument-glass-core.html${query}`);
  await page.waitForFunction(() => window.glassCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.glassCore.ready)[name](...args), { name, args });
  return { context, page, errors, warnings, call };
}
const shot = async (page, path) => PNG.sync.read(await page.screenshot(path ? { path } : {}));
async function stillGpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  const instrument = await call("instrument");
  expect(instrument.layers.map(layer => [layer.id, layer.status, layer.steppedDown.length]), `${label}: the layer is ready, nothing stepped down`).toEqual([["glass", "ready", 0]]);
  return instrument;
}
const same = (a, b, offset) => a.data[offset] === b.data[offset] && a.data[offset + 1] === b.data[offset + 1] && a.data[offset + 2] === b.data[offset + 2];
/** Device pixels of a client rect. */
const device = (box, dpr) => ({ x0: Math.ceil(box.x * dpr), y0: Math.ceil(box.y * dpr), x1: Math.floor((box.x + box.width) * dpr), y1: Math.floor((box.y + box.height) * dpr) });
function diffIn(a, b, box, dpr) {
  const r = device(box, dpr);
  let compared = 0, mismatched = 0, max = 0;
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    const offset = (y * a.width + x) * 4;
    compared++;
    const d = Math.max(Math.abs(a.data[offset] - b.data[offset]), Math.abs(a.data[offset + 1] - b.data[offset + 1]), Math.abs(a.data[offset + 2] - b.data[offset + 2]));
    if (d > 0) mismatched++;
    max = Math.max(max, d);
  }
  return { compared, mismatched, max };
}

for (const dpr of [1, 2]) {
  test(`core's glass and capture probe, DPR ${dpr}`, async ({ browser }) => {
    test.setTimeout(600000);
    await mkdir(directory, { recursive: true });
    const { context, page, errors, warnings, call } = await open(browser, dpr);
    const report = { dpr };
    const instrument = await stillGpu(call, "start");
    expect(instrument.layers[0].probe.status, "the page probe is built").toBe("on");
    expect(instrument.layers[0].glass.status, "the glass is built").toBe("on");
    const controls = await call("controls"), labels = await call("labels"), patterns = await call("patterns");
    const box = id => controls.find(control => control.id === id);
    report.state = { probe: instrument.layers[0].probe, build: instrument.compile.lastBuildMs, probes: instrument.probes };

    // ---- The look, and the layer without objects as the reference.
    await call("set", { lights: false, casters: false });
    const on = await shot(page, `${directory}/glass-dpr${dpr}.png`);
    await call("set", { objects: false });
    const off = await shot(page, `${directory}/face-dpr${dpr}.png`);
    await call("set", { objects: true });

    // Refraction: the printed ring seen through the clear lens (K2). Its blue band lies at radius 9.5 px from the centre; along
    // the diagonal no bar crosses it, so the first blue pixel from the centre is the ring's radius as drawn.
    const diagonal = (image, control) => {
      const cx = (control.x + control.width / 2) * dpr, cy = (control.y + control.height / 2) * dpr;
      for (let step = 2; step < 30 * dpr; step++) {
        const x = Math.round(cx + step / Math.SQRT2), y = Math.round(cy + step / Math.SQRT2), offset = (y * image.width + x) * 4;
        const [r, g, b] = [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
        if (b > 150 && b - r > 90) return step / dpr;
      }
      return null;
    };
    const seen = diagonal(on, box("k2")), plain = diagonal(off, box("k2"));
    report.refraction = { nominalRingRadius: 9.5, plainRadius: plain, throughLens: seen, magnification: seen && plain ? seen / plain : null };
    expect(plain, "the ring on the face (no glass) lies near its nominal radius").toBeGreaterThan(7);
    expect(plain).toBeLessThan(11.5);
    expect(seen, "the ring seen through the lens exists").not.toBeNull();
    expect(seen / plain, "the lens magnifies what lies under it (the ring's radius grows by at least 25%)").toBeGreaterThan(1.25);
    expect(seen / plain, "but not beyond reason").toBeLessThan(2.2);
    // Glass against the same parts as an opaque lacquer.
    await call("set", { glass: false });
    const frosted = await shot(page, `${directory}/frost-dpr${dpr}.png`);
    await call("set", { glass: true });
    const against = ["k1", "k2", "k3", "plate", "display", "lamp"].map(id => [id, diffIn(on, frosted, box(id), dpr)]);
    report.againstNonGlass = Object.fromEntries(against.map(([id, value]) => [id, value]));
    for (const [id, value] of against) expect(value.mismatched / value.compared, `${id}: the glass differs from the non-glass look`).toBeGreaterThan(0.15);

    // The Fresnel edge and the studio reflection: reflection on against off.
    await call("set", { reflection: 0 });
    const noReflection = await shot(page);
    await call("set", { reflection: 1.5 });
    const ring = (image, control, from, to) => {
      const cx = (control.x + control.width / 2) * dpr, cy = (control.y + control.height / 2) * dpr;
      let sum = 0, count = 0;
      for (let y = Math.floor(cy - to * dpr); y <= Math.ceil(cy + to * dpr); y++) for (let x = Math.floor(cx - to * dpr); x <= Math.ceil(cx + to * dpr); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / dpr;
        if (d < from || d > to) continue;
        sum += luminance(image.data, (y * image.width + x) * 4); count++;
      }
      return sum / count;
    };
    const edge = { on: ring(on, box("k2"), 17, 22), off: ring(noReflection, box("k2"), 17, 22) }, centre = { on: ring(on, box("k2"), 0, 6), off: ring(noReflection, box("k2"), 0, 6) };
    let changed = 0, total = 0;
    { const r = device(box("k2"), dpr); for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const cx = (box("k2").x + 50) * dpr, cy = (box("k2").y + 50) * dpr;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 23 * dpr) continue;
      total++; if (!same(on, noReflection, (y * on.width + x) * 4)) changed++;
    } }
    report.fresnel = { edgeOn: edge.on, edgeOff: edge.off, edgeGain: edge.on - edge.off, centreOn: centre.on, centreOff: centre.off, centreGain: centre.on - centre.off, lensPixelsChanged: changed / total };
    expect(edge.on - edge.off, "the Fresnel edge: the rim gains levels from the reflection").toBeGreaterThan(12);
    expect(edge.on - centre.on, "the Fresnel edge is brighter than the centre by a measured margin (levels)").toBeGreaterThan(40);
    expect(changed / total, "the studio and the stand are reflected over a measured share of the lens").toBeGreaterThan(0.2);

    // A window: flat glass is the capture, its bevel (refraction, Fresnel and the studio) is not.
    const plateBox = box("plate"), flatBox = { x: plateBox.x + 20, y: plateBox.y + plateBox.height * 0.4, width: plateBox.width - 40, height: plateBox.height * 0.4 };
    const bevel = { top: 0, count: 0 };
    // The pane stands 3 px inside its control's box (the box rule's margin) and its chamfer is 2.5 px wide: the band 3 to 6 px in.
    { const r = device(plateBox, dpr); for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const depth = -rounded({ x: (x + 0.5) / dpr, y: (y + 0.5) / dpr }, plateBox);
      if (depth < 3 || depth > 6) continue;
      const offset = (y * on.width + x) * 4; bevel.top += Math.abs(luminance(on.data, offset) - luminance(off.data, offset)); bevel.count++;
    } }
    const flat = diffIn(on, off, flatBox, dpr);
    report.window = { flat, bevelMeanChange: bevel.top / bevel.count };
    expect(flat.mismatched, "a window's flat region outside its finish zone is the capture texel").toBe(0);
    expect(bevel.top / bevel.count, "a window's bevel refracts and reflects: it changes the edge").toBeGreaterThan(6);

    // ---- Text: under the window it is the capture texel; beside the glass, within the guard.
    const text = patterns.text, windowText = diffIn(on, off, text, dpr);
    report.textUnderGlass = windowText;
    expect(windowText.compared).toBeGreaterThan(1000);
    expect(windowText.mismatched, "text under the display window: 0 mismatched pixels against the layer without objects").toBe(0);
    const inkSamples = [], fieldSamples = [];
    { const r = device(text, dpr); for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const offset = (y * on.width + x) * 4, rgb = [on.data[offset], on.data[offset + 1], on.data[offset + 2]];
      if (rgb[1] > 200) inkSamples.push(rgb); else if (rgb[1] < 60) fieldSamples.push(rgb);
    } }
    const ratio = contrast(inkSamples[0], fieldSamples[0]);
    report.displayContrast = ratio;
    expect(ratio, "the display's text keeps its contrast through the glass").toBeGreaterThan(7);
    // Light and shadows on: the prints change by at most interior.max.
    await call("set", { lights: true, casters: true });
    const lit = await shot(page);
    await call("set", { objects: false });
    const litOff = await shot(page);
    await call("set", { objects: true });
    const prints = labels.map(label => [label.id, diffIn(lit, litOff, label, dpr)]);
    report.printsBesideGlass = Object.fromEntries(prints.map(([id, value]) => [id, value.max]));
    for (const [id, value] of prints) expect(value.max, `print ${id} beside the glass: within the guard (interior.max)`).toBeLessThanOrEqual(MAX);
    const litText = diffIn(lit, litOff, text, dpr);
    expect(litText.mismatched, "text under the window with the lamp and shadows on: still the capture").toBe(0);
    // A lit lamp glows through its glass.
    await call("setLamp", false);
    const dark = await shot(page);
    await call("setLamp", true);
    const lamp = box("lamp"), lampCentre = { x: lamp.x + lamp.width / 2, y: lamp.y + lamp.height / 2, width: 1, height: 1 };
    const lampLit = ring(lit, lamp, 0, 8), lampDark = ring(dark, lamp, 0, 8);
    report.lamp = { lit: lampLit, unlit: lampDark };
    expect(lampLit - lampDark, "a lit lamp's glass glows").toBeGreaterThan(30);
    void lampCentre;

    // ---- Containment and hits: parts on against off (light and shadows off), outside every control nothing changes.
    await call("set", { lights: false, casters: false });
    const containment = { changed: 0, outside: 0, outsideSamples: [], hitSamples: 0, hitMismatches: 0 };
    const candidates = [];
    const clientPoint = (x, y) => ({ x: (x + 0.5) / dpr, y: (y + 0.5) / dpr });
    for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
      const offset = (y * on.width + x) * 4;
      if (same(on, off, offset)) continue;
      containment.changed++;
      const point = clientPoint(x, y), owners = controls.filter(control => rounded(point, control) <= 0);
      if (!owners.length) { containment.outside++; if (containment.outsideSamples.length < 8) containment.outsideSamples.push(point); }
      else if ((x * 31 + y * 17) % 97 === 0) candidates.push({ point, id: owners[0].id });
    }
    const hits = await call("hits", candidates.map(candidate => candidate.point));
    candidates.forEach((candidate, index) => { containment.hitSamples++; if (hits[index] !== candidate.id) containment.hitMismatches++; });
    report.containment = containment;
    expect(containment.changed, "the parts drew").toBeGreaterThan(5000);
    expect(containment.outside, `0 changed pixels outside the control boxes (${JSON.stringify(containment.outsideSamples)})`).toBe(0);
    expect(containment.hitSamples).toBeGreaterThan(50);
    expect(containment.hitMismatches, "native hits on drawn pixels find their control").toBe(0);

    // ---- The page probe: the chrome knob with and without it.
    await call("set", { page: false });
    const studioOnly = await shot(page, `${directory}/studio-only-dpr${dpr}.png`);
    await call("set", { page: true });
    const pageOn = await shot(page, `${directory}/page-dpr${dpr}.png`);
    const reflection = diffIn(pageOn, studioOnly, box("chrome"), dpr), elsewhere = diffIn(pageOn, studioOnly, patterns.stripes, dpr);
    report.pageProbe = { chrome: reflection, stripes: elsewhere };
    expect(reflection.mismatched, "the chrome knob reflects the page: its pixels differ from the studio alone").toBeGreaterThan(200 * dpr * dpr);
    expect(elsewhere.mismatched, "the page probe changes parts only: the display's stripes (a face) are the same").toBe(0);

    // ---- Nothing is recaptured; a capture refreshes the probe exactly once.
    await stillGpu(call, "before idle");
    const pointer = (async () => { for (let index = 0; index < 60; index++) { await page.mouse.move(100 + index * 12, 100 + (index % 9) * 40); await page.waitForTimeout(8); } })();
    const idle = await call("idle", 300);
    await pointer;
    report.idle = idle;
    expect(idle.mode).toBe("gpu");
    expect({ captures: idle.captures, uploads: idle.uploads, geometryUpdates: idle.geometryUpdates, probeRefreshes: idle.probeRefreshes }, "300 frames with the pointer moving: no capture, upload, geometry update or probe refresh").toEqual({ captures: 0, uploads: 0, geometryUpdates: 0, probeRefreshes: 0 });
    expect(idle.gpuFrames, "the frames were drawn").toBeGreaterThan(100);
    const refreshesBefore = (await call("instrument")).probes.refreshes, countsBefore = await call("counts");
    await call("retext", "441.00 Hz  -3 dB");
    const countsAfter = await call("counts"), refreshesAfter = (await call("instrument")).probes.refreshes;
    report.refresh = { uploads: countsAfter.uploads - countsBefore.uploads, probeRefreshes: refreshesAfter - refreshesBefore };
    expect(countsAfter.uploads - countsBefore.uploads, "typing recaptured the panel").toBeGreaterThanOrEqual(1);
    // Uploads may coalesce (the browser paints once for several changes) but a refresh never outnumbers them.
    expect(refreshesAfter - refreshesBefore, "a probe rebuild per capture refresh").toBeGreaterThanOrEqual(1);
    expect(refreshesAfter - refreshesBefore).toBeLessThanOrEqual(countsAfter.uploads - countsBefore.uploads);
    await stillGpu(call, "after retext");
    // A moved layer re-renders the probe's content (the projection box is fixed at registration): once per move.
    const movedBefore = (await call("instrument")).probes.refreshes;
    await call("move", 24, 16);
    await page.waitForTimeout(300);
    const movedAfter = (await call("instrument")).probes.refreshes;
    report.moved = { probeRefreshes: movedAfter - movedBefore };
    expect(movedAfter - movedBefore, "a move refreshes the probe").toBeGreaterThanOrEqual(1);
    expect(movedAfter - movedBefore).toBeLessThanOrEqual(2);
    await call("move", 0, 0);
    await stillGpu(call, "after move");

    // ---- A viewport resize and a DPR change mid-run: GPU on, the probe follows, text under the window stays the capture texel.
    const exactText = async label => {
      await call("set", { lights: false, casters: false });
      const shown = await shot(page);
      await call("set", { objects: false });
      const bare = await shot(page);
      await call("set", { objects: true });
      const result = diffIn(shown, bare, (await call("patterns")).text, dpr);
      expect(result.compared, label).toBeGreaterThan(1000);
      expect(result.mismatched, `${label}: text under the window is the capture texel`).toBe(0);
      return result;
    };
    const refreshesNow = async () => (await call("instrument")).probes.refreshes;
    const beforeResize = await refreshesNow();
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 1600);
    await page.waitForTimeout(300);
    await call("settle");
    await stillGpu(call, "after a resize");
    const afterResize = await refreshesNow();
    report.resize = { probeRefreshes: afterResize - beforeResize, text: await exactText("after a resize") };
    expect(afterResize - beforeResize, "a resize refreshes the probe").toBeGreaterThan(0);
    await page.setViewportSize(viewport);
    await page.waitForFunction(width => window.innerWidth === width, viewport.width);
    await page.waitForTimeout(300);
    await call("settle");
    const cdp = await context.newCDPSession(page), other = dpr === 1 ? 2 : 1, beforeDpr = await refreshesNow();
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: other, mobile: false });
    await page.waitForFunction(value => window.devicePixelRatio === value, other);
    await call("render");
    await page.waitForTimeout(300);
    await stillGpu(call, "after a DPR change");
    expect((await refreshesNow()) - beforeDpr, "a DPR change refreshes the probe").toBeGreaterThan(0);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: dpr, mobile: false });
    await page.waitForFunction(value => window.devicePixelRatio === value, dpr);
    await call("render");
    await page.waitForTimeout(300);
    await stillGpu(call, "after the DPR change back");
    report.dprChange = { probeRefreshes: (await refreshesNow()) - beforeDpr, text: await exactText("after a DPR change and back") };
    await cdp.detach();
    const loud = warnings.filter(message => !/powerPreference/.test(message));
    expect(loud, "no WebGPU or other warnings through the resize and the DPR change").toEqual([]);

    // ---- Costs: per stage (headless p50 and p95, 300 frames of poses), the glass against the same parts without glass.
    const stages = async label => {
      await call("idle", 300);
      const instrument = await call("instrument"), layer = instrument.post.layers[0];
      return { label, layerP50: instrument.layers[0].gpu.p50Ms, layerP95: instrument.layers[0].gpu.p95Ms, stages: Object.fromEntries(Object.entries(layer.gpu).map(([name, value]) => [name, [value.p50Ms, value.p95Ms]])),
        probe: instrument.layers[0].probe, build: instrument.compile.lastBuildMs };
    };
    report.costs = { glass: await stages("glass on") };
    await call("set", { glass: false });
    report.costs.noGlass = await stages("glass as lacquer");
    await call("set", { glass: true, page: false });
    report.costs.noPage = await stages("no page probe");
    await call("set", { page: true });
    // Probe refresh cost: twenty captures.
    for (let index = 0; index < 20; index++) await call("retext", `44${index}.00 Hz`);
    const probe = (await call("instrument")).layers[0].probe;
    report.probeRefresh = probe;
    console.log(`core-glass DPR ${dpr}: ${JSON.stringify(report)}`);

    await writeFile(`${directory}/report-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await stillGpu(call, "end");
    expect(errors, "no page errors").toEqual([]);
    await context.close();
  });
}

test("a probe that cannot be built leaves the studio alone, GPU on", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, errors, call } = await open(browser, 1, "?failProbe=1");
  const instrument = await stillGpu(call, "failProbe");
  expect(instrument.layers[0].probe.status).toBe("failed");
  expect(instrument.layers[0].probe.reason).toMatch(/test hook fails the capture probe/);
  expect(instrument.layers[0].glass.status, "the glass is unaffected").toBe("on");
  expect(instrument.probes.live).toBe(0);
  await call("set", { lights: false, casters: false });
  const failed = await shot(page), controls = await call("controls");
  const reference = await open(browser, 1, "?page=off");
  await reference.call("set", { lights: false, casters: false });
  const studio = await shot(reference.page);
  const chrome = diffIn(failed, studio, controls.find(control => control.id === "chrome"), 1);
  expect(chrome.mismatched, "the chrome knob looks as it does with the page off").toBe(0);
  const lens = diffIn(failed, studio, controls.find(control => control.id === "k2"), 1);
  expect(lens.mismatched, "the glass is drawn the same").toBe(0);
  expect(errors.filter(error => !/page probe was left out/.test(error))).toEqual([]);
  await reference.context.close();
  await context.close();
});

test("a glass that cannot be built leaves the face showing through, GPU on", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, errors, call } = await open(browser, 1, "?failGlass=1");
  const instrument = await stillGpu(call, "failGlass");
  expect(instrument.layers[0].glass).toMatchObject({ status: "fallback" });
  expect(instrument.layers[0].glass.error).toMatch(/test hook fails the glass material/);
  expect(instrument.layers[0].probe.status, "the probe is unaffected").toBe("on");
  await call("set", { lights: false, casters: false });
  const shown = await shot(page, `${directory}/fallback.png`), controls = await call("controls"), patterns = await call("patterns");
  await call("set", { objects: false });
  const face = await shot(page);
  expect(diffIn(shown, face, patterns.text, 1).mismatched, "the display's text is the plain capture").toBe(0);
  const plate = diffIn(shown, face, controls.find(control => control.id === "plate"), 1);
  expect(plate.mismatched, "the plate's glass is left out: the face shows through").toBe(0);
  expect(errors.filter(error => !/glass was left out|test hook/.test(error))).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) {
  test(`the reflection is Fresnel-weighted: no index contrast, no reflection, DPR ${dpr}`, async ({ browser }) => {
    test.setTimeout(300000);
    const { context, page, call } = await open(browser, dpr);
    const k2 = (await call("controls")).find(control => control.id === "k2");
    await call("set", { lights: false, casters: false, page: false });
    const gain = async ior => {
      await call("set", { ior, reflection: 1.5 });
      const on = await shot(page);
      await call("set", { reflection: 0 });
      const off = await shot(page);
      const band = (image, from, to) => {
        const cx = (k2.x + k2.width / 2) * dpr, cy = (k2.y + k2.height / 2) * dpr;
        let sum = 0, count = 0;
        for (let y = Math.floor(cy - to * dpr); y <= Math.ceil(cy + to * dpr); y++) for (let x = Math.floor(cx - to * dpr); x <= Math.ceil(cx + to * dpr); x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / dpr;
          if (d >= from && d <= to) { sum += luminance(image.data, (y * image.width + x) * 4); count++; }
        }
        return sum / count;
      };
      return { rim: band(on, 17, 22) - band(off, 17, 22), centre: band(on, 0, 6) - band(off, 0, 6) };
    };
    const glass = await gain(1.5), air = await gain(1.0);
    console.log(`fresnel control DPR ${dpr}: ${JSON.stringify({ glass, air })}`);
    await writeFile(`${directory}/fresnel-dpr${dpr}.json`, JSON.stringify({ glass, air }, null, 2));
    // With an index of 1, F0 is 0 and only Schlick's angle term (1 - cos)^5 is left: nothing at normal incidence (the centre) and
    // a gain towards grazing angles (the rim), which is the Fresnel edge on its own: the rim gains at least 3 times the centre.
    // With an index of 1.5 the centre gains too (F0 = 4% of a bright studio, 1.5 times), so the glass's rim is 1.2 times its
    // centre, not 3: the 3x contrast is the angle term's alone, and it is there.
    expect(glass.rim, "glass: the reflection gains levels at the rim").toBeGreaterThan(10);
    expect(Math.abs(air.centre), "index 1: no reflection at the centre").toBeLessThan(1);
    expect(air.rim, "index 1: the rim gains at least 3 times the centre (the angle term alone)").toBeGreaterThanOrEqual(3 * Math.max(1, Math.abs(air.centre)));
    expect(glass.centre, "index 1.5: the centre's F0 reflection exists").toBeGreaterThan(5);
    await context.close();
  });

  test(`moving a layer refreshes its probe at a bounded rate, and once more when it settles, DPR ${dpr}`, async ({ browser }) => {
    test.setTimeout(300000);
    const { context, page, errors, call } = await open(browser, dpr);
    await call("set", { lights: false, casters: false });
    await call("settle");
    const run = await call("drag", 60);
    // At most one refresh per 100 ms while it moves, plus the first: the bound is floor(elapsed / 100) + 1.
    const bound = Math.floor(run.elapsedMs / 100) + 1;
    console.log(`drag DPR ${dpr}: ${JSON.stringify({ ...run, bound })}`);
    expect(run.refreshes, `${run.frames} frames of movement over ${Math.round(run.elapsedMs)} ms: at most ${bound} refreshes`).toBeLessThanOrEqual(bound);
    expect(run.refreshes).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(400);
    await call("settle");
    const settled = (await call("instrument")).probes.refreshes;
    await page.waitForTimeout(400);
    expect((await call("instrument")).probes.refreshes, "nothing refreshes once it has settled").toBe(settled);
    await stillGpu(call, "after the drag");
    // The final pixels equal a fresh build at the same place.
    const dragged = await shot(page, `${directory}/dragged-dpr${dpr}.png`), controls = await call("controls"), chrome = controls.find(control => control.id === "chrome");
    const fresh = await open(browser, dpr);
    await fresh.call("set", { lights: false, casters: false });
    await fresh.call("move", run.x, run.y);
    const reference = await shot(fresh.page);
    const same = diffIn(dragged, reference, chrome, dpr);
    console.log(`drag final against fresh DPR ${dpr}: ${JSON.stringify(same)}`);
    expect(same.max, "the chrome knob after the drag equals a fresh build at the same place (a sub-texel quantum may differ by a level or two)").toBeLessThanOrEqual(2);
    expect(errors).toEqual([]);
    await fresh.context.close();
    await context.close();
  });

  test(`text under a window over a translucent capture is the capture texel, DPR ${dpr}`, async ({ browser }) => {
    test.setTimeout(300000);
    const { context, page, call } = await open(browser, dpr);
    await call("set", { lights: false, casters: false, translucent: true });
    const on = await shot(page, `${directory}/translucent-dpr${dpr}.png`);
    await call("set", { objects: false });
    const bare = await shot(page);
    const patterns = await call("patterns");
    const text = diffIn(on, bare, patterns.text, dpr);
    console.log(`translucent text DPR ${dpr}: ${JSON.stringify(text)}`);
    { const o = (Math.floor((patterns.text.y + 4) * dpr) * on.width + Math.floor((patterns.text.x + 4) * dpr)) * 4; console.log(`translucent sample DPR ${dpr}: on ${[...on.data.subarray(o, o + 3)]} bare ${[...bare.data.subarray(o, o + 3)]}`); }
    expect(text.compared).toBeGreaterThan(1000);
    expect(text.max, "text and field under the window equal the capture within 1 level").toBeLessThanOrEqual(1);
    await stillGpu(call, "translucent");
    await context.close();
  });
}

test("a refresh that throws turns the page off, rebuilds the layer without it and frees the cube", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, errors, call } = await open(browser, 1);
  const before = await stillGpu(call, "before");
  expect(before.probes.bytes).toBeGreaterThan(16e6);
  await call("setFailRefresh", true);
  await call("retext", "442.00 Hz");
  await page.waitForTimeout(500);
  await call("settle");
  const instrument = await stillGpu(call, "after a failed refresh");
  expect(instrument.layers[0].probe.status).toBe("failed");
  expect(instrument.layers[0].probe.reason).toMatch(/test hook fails the probe refresh/);
  expect(instrument.probes.live, "no probe is left").toBe(0);
  expect(instrument.probes.bytes, "the cube is released").toBe(0);
  expect(instrument.layers[0].glass.status, "the glass is unaffected").toBe("on");
  expect(errors.filter(error => !/page probe was turned off/.test(error))).toEqual([]);
  await context.close();
});

test("a glass left out casts no face shadow", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, call } = await open(browser, 1, "?failGlass=1");
  await call("set", { lights: false, casters: true });
  const shown = await shot(page);
  await call("set", { objects: false });
  const bare = await shot(page);
  const plate = (await call("controls")).find(control => control.id === "plate");
  const around = { x: plate.x - 14, y: plate.y - 14, width: plate.width + 28, height: plate.height + 28 };
  const diff = diffIn(shown, bare, around, 1);
  console.log(`fallback plate surroundings: ${JSON.stringify(diff)}`);
  expect(diff.mismatched, "the plate's window is not drawn, so it casts nothing on the face around it").toBe(0);
  await context.close();
});
