/**
 * Core's Instrument post chain and shadow map (core work item 3, `docs/ui-library/instrument-phase2.md`) on
 * `instrument-post-core.html` (`window.postCore`, from `examples/playground/src/instrument-post-core/page.ts`): 250 native
 * controls on two overlapping panels and a third clipped by an `overflow: hidden` viewport across a lit lamp, every cell
 * with a printed faceplate label, keys with captured labels and LEDs, lamps, bats over their plates and thin plates on
 * plinths. At DPR 1 and 2 it checks that:
 * - **text is never filtered:** faceplate prints and captured cap labels are pixel-identical with the default chain, with
 *   every stage off and with every stage on, and against core's plain pass (no material; lights off for that one, since
 *   the face pool lights the face by design);
 * - **the clip holds:** with the chain on (bloom halos included, every option too), no pixel changes outside a control's
 *   rounded box, the upper panel hides the lower panel's parts and the viewport cuts the clipped panel's; native hits on
 *   changed pixels find their control, and hits are the same with the chain on and off;
 * - **opacity is exact:** at 0.5 a layer's controls are the average of opacity 1 and 0 within 1 level;
 * - **the map:** it changes part pixels only (never the face), each thin plate's mapped shadow on its plinth is one
 *   connected component, each bat's lever and ball shade its plate; it renders 0 times over 120 still frames and once per
 *   pose change;
 * - GPU stays on through stage toggles, a resize, a DPR change, opacity, disable and enable, and 10 starts with a racing
 *   successor (`?race=1`); a stage that fails to build is left out (`?fail=smaa`), and a chain that cannot be built steps
 *   its layers down with `post` (`?fail=composite`);
 * - per-stage GPU costs over 300 animated frames (medians and 95th percentiles from Lite's task timings; the RTX 3080's
 *   clocks are demand-driven, so they are upper bounds).
 * Reports and screenshots go to the `core-post` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-post");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;
const OFF = { smaa: false, bloom: false, taa: false, contact: false, ssgi: false };
const ALL = { smaa: true, bloom: true, taa: true, contact: true, ssgi: true };

/** Signed distance from a client point to a rounded box, negative inside. */
function rounded(point, box) {
  const radius = Math.min(box.radius ?? 0, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
const inside = (point, box) => point.x >= box.x && point.y >= box.y && point.x <= box.x + box.width && point.y <= box.y + box.height;
const grow = (box, by) => ({ x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by });
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

async function open(browser, dpr, query = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(`/instrument-post-core.html${query}`);
  await page.waitForFunction(() => window.postCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.postCore.ready)[name](...args), { name, args });
  return { context, page, errors, warnings, call };
}
const shot = async (page, path) => PNG.sync.read(await page.screenshot(path ? { path } : {}));
async function stillGpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  const instrument = await call("instrument");
  expect(instrument.layers.map(layer => [layer.id, layer.status]), `${label}: every instrument layer is ready`).toEqual(instrument.layers.map(layer => [layer.id, "ready"]));
  return counts;
}
const same = (a, b, offset) => a.data[offset] === b.data[offset] && a.data[offset + 1] === b.data[offset + 1] && a.data[offset + 2] === b.data[offset + 2];

/** The text boxes no other panel (or its outset shadow) can reach: the upper panel's, the clipped panel's inside the viewport, the lower panel's clear of both. */
function visibleLabels(labels, panels) {
  return labels.filter(label => label.layer === "upper"
    || label.layer === "clipped" && inside({ x: label.x, y: label.y }, panels.viewport) && inside({ x: label.x + label.width, y: label.y + label.height }, panels.viewport)
    || label.layer === "lower" && !overlaps(grow(label, 24), panels.upper) && !overlaps(grow(label, 24), panels.viewport));
}
/** Device pixels of every label that differ between two frames. */
function labelDiff(a, b, labels, dpr) {
  let compared = 0, mismatched = 0, inked = 0;
  const samples = [], byKind = { print: 0, cap: 0 };
  for (const label of labels) {
    const colours = new Set();
    for (let y = Math.ceil(label.y * dpr); y < Math.floor((label.y + label.height) * dpr); y++) for (let x = Math.ceil(label.x * dpr); x < Math.floor((label.x + label.width) * dpr); x++) {
      const offset = (y * a.width + x) * 4;
      compared++;
      byKind[label.kind]++;
      colours.add(a.data[offset] * 65536 + a.data[offset + 1] * 256 + a.data[offset + 2]);
      if (!same(a, b, offset)) { mismatched++; if (samples.length < 6) samples.push({ id: label.id, x, y, a: [...a.data.subarray(offset, offset + 3)], b: [...b.data.subarray(offset, offset + 3)] }); }
    }
    if (colours.size > 2) inked++;
  }
  return { labels: labels.length, inked, compared, byKind, mismatched, samples };
}

/**
 * Parts on against off (the face only, with the same lights), face shadows off in both: every changed pixel must lie
 * in a control of the topmost panel there (within its clip); native hits on a sample of them must find the control.
 */
async function containment(call, page, dpr, name) {
  await call("setShadows", false);
  const on = await shot(page, `${directory}/${name}-on-dpr${dpr}.png`);
  await call("setMeshes", false);
  const off = await shot(page, `${directory}/${name}-off-dpr${dpr}.png`);
  await call("setMeshes", true);
  await call("setShadows", true);
  const controls = await call("controls"), panels = await call("panels"), straddled = await call("straddled");
  // Device px per client px of the screenshot: Playwright shoots at the context's scale, whatever a CDP override set.
  const px = on.width / (await page.evaluate(() => innerWidth));
  const band = 64, rows = new Map();
  for (const control of controls) for (let row = Math.floor(control.y / band); row <= Math.floor((control.y + control.height) / band); row++) {
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(control);
  }
  const result = { changed: 0, outside: 0, outsideSamples: [], lowerUnderUpper: 0, outsideClip: 0, lamps: { inside: 0 }, straddledLamp: { inside: 0, beyond: 0 } };
  const hitCandidates = [];
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (same(on, off, offset)) continue;
    result.changed++;
    const point = { x: (x + 0.5) / px, y: (y + 0.5) / px };
    const upperEdge = rounded(point, panels.upper), inViewport = inside(point, panels.viewport) && rounded(point, panels.clipped) <= 0;
    const top = inViewport ? "clipped" : upperEdge < -1 ? "upper" : upperEdge > 1 ? "lower" : undefined;
    let owner, distance = Infinity;
    for (const control of rows.get(Math.floor(point.y / band)) ?? []) {
      if (top && control.layer !== top) continue;
      const d = rounded(point, control);
      if (d < distance) { distance = d; owner = control; }
    }
    if (!owner || distance > 0) {
      result.outside++;
      if (result.outsideSamples.length < 20) result.outsideSamples.push({ ...point, distance, top, on: [...on.data.subarray(offset, offset + 3)], off: [...off.data.subarray(offset, offset + 3)] });
      if (top === "upper" && controls.some(control => control.layer === "lower" && rounded(point, control) <= 0)) result.lowerUnderUpper++;
      continue;
    }
    if (owner.layer === "clipped" && !inside(point, panels.viewport)) result.outsideClip++;
    if (owner.kind === "lamp") result.lamps.inside++;
    if (owner.id === straddled.clipped) result.straddledLamp[point.x <= panels.viewport.x + panels.viewport.width ? "inside" : "beyond"]++;
    // Within a pixel of the upper panel's or the viewport's edge either layer may own the pixel (shared antialiasing).
    const viewportEdge = rounded(point, { ...panels.viewport, radius: 0 });
    if (distance <= -1 && Math.abs(upperEdge) > 1 && Math.abs(viewportEdge) > 1) hitCandidates.push({ ...point, id: owner.id });
  }
  const step = Math.max(1, Math.floor(hitCandidates.length / 4000)), points = [];
  for (let index = 0; index < hitCandidates.length; index += step) points.push(hitCandidates[index]);
  const hits = await call("hits", points.map(point => ({ x: point.x, y: point.y })));
  const mismatches = points.filter((point, index) => hits[index] !== point.id);
  return { ...result, hitSamples: points.length, hitMismatches: mismatches.length, hitMismatchSamples: mismatches.slice(0, 10).map(point => ({ ...point, hit: hits[points.indexOf(point)] })) };
}
/** Hit-test points over every control (its centre and four inner points) and the face between them. */
function hitGrid(controls) {
  const points = [];
  for (const control of controls) {
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) points.push({ x: control.x + control.width * fx, y: control.y + control.height * fy });
    points.push({ x: control.x - 4, y: control.y + control.height / 2 });
  }
  return points;
}
/** Connected components of a set of device pixels, 8-neighbour: a one-pixel diagonal step is a continuous stroke. */
function components(set, width) {
  const seen = new Set(), sizes = [];
  for (const start of set) {
    if (seen.has(start)) continue;
    let size = 0;
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const at = stack.pop();
      size++;
      for (const next of [at - 1, at + 1, at - width, at + width, at - width - 1, at - width + 1, at + width - 1, at + width + 1]) if (set.has(next) && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}
const luminance = (png, offset) => png.data[offset] + png.data[offset + 1] + png.data[offset + 2];
/** Per stage, the sum over layers of the per-layer GPU p50 and p95 (ms), and per layer. */
function costs(post) {
  const stages = {};
  for (const layer of post.layers) for (const [stage, timing] of Object.entries(layer.gpu)) {
    stages[stage] ??= { p50: 0, p95: 0, layers: {} };
    stages[stage].p50 += timing.p50Ms ?? 0;
    stages[stage].p95 += timing.p95Ms ?? 0;
    stages[stage].layers[layer.id] = { p50: timing.p50Ms, p95: timing.p95Ms, samples: timing.samples };
  }
  for (const stage of Object.values(stages)) { stage.p50 = Math.round(stage.p50 * 1000) / 1000; stage.p95 = Math.round(stage.p95 * 1000) / 1000; }
  return stages;
}

for (const dpr of [1, 2]) test(`post chain: text safety, the clip, hits, exact opacity, the map and GPU on through changes DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(1200000);
  await mkdir(directory, { recursive: true });
  const report = { dpr, browser: browser.version() };
  const { context, page, errors, warnings, call } = await open(browser, dpr);
  try {
    await call("settle");
    await stillGpu(call, "start");
    const start = await call("post");
    report.start = start.layers.map(layer => ({ id: layer.id, stages: layer.stages, map: layer.map, lenses: layer.lenses, lit: layer.lit }));
    for (const layer of start.layers) {
      expect(layer.stages.smaa.status, `${layer.id}: SMAA on by default`).toBe("on");
      expect(layer.stages.bloom.status, `${layer.id}: bloom on with lit lenses`).toBe("on");
      expect(["taa", "contact", "ssgi"].map(name => layer.stages[name].status), `${layer.id}: the options off by default`).toEqual(["off", "off", "off"]);
      expect(layer.map.size, `${layer.id}: a 4,096 map`).toBe(4096);
    }
    expect((await call("instrument")).layers.every(layer => layer.steppedDown.length === 0), "no object steps down").toBe(true);

    // Text safety: the default chain, every stage off (and no map), every stage on, and the plain pass (lights off).
    const panels = await call("panels");
    const labels = visibleLabels(await call("labels"), panels);
    const chain = await shot(page, `${directory}/default-dpr${dpr}.png`);
    await call("setPost", OFF); await call("setMap", { darkness: 1 });
    await stillGpu(call, "every stage off");
    const off = await shot(page, `${directory}/off-dpr${dpr}.png`);
    await call("setPost", ALL); await call("setMap", undefined);
    await stillGpu(call, "every stage on");
    const all = await shot(page, `${directory}/all-dpr${dpr}.png`);
    await call("setPost", undefined);
    await call("setLights", false);
    const dark = await shot(page);
    await call("setPlain", true);
    const plain = await shot(page);
    // No instrument layer left: the shared targets are released (after the retired scenes' fences).
    for (let tries = 0; tries < 50 && Object.keys((await call("post"))?.targets ?? {}).length; tries++) await page.waitForTimeout(100);
    report.plainTargets = (await call("post"))?.targets ?? null;
    expect(Object.keys(report.plainTargets ?? {}), "no instrument layer: the shared targets are released").toEqual([]);
    await call("setPlain", false);
    await call("setLights", true);
    report.text = { offAgainstChain: labelDiff(chain, off, labels, dpr), allAgainstChain: labelDiff(chain, all, labels, dpr), chainAgainstPlain: labelDiff(dark, plain, labels, dpr) };
    for (const [name, diff] of Object.entries(report.text)) {
      expect(diff.inked, `${name}: the labels carry ink`).toBeGreaterThan(100);
      expect(diff.mismatched, `${name}: text pixels identical (${JSON.stringify(diff.samples)})`).toBe(0);
    }

    // The clip: parts, chain and halos inside the controls, the default chain and every stage on.
    await stillGpu(call, "after plain");
    report.clip = { chain: await containment(call, page, dpr, "clip") };
    await call("setPost", ALL);
    report.clip.all = await containment(call, page, dpr, "clip-all");
    await call("setPost", undefined);
    for (const [name, result] of Object.entries(report.clip)) {
      expect(result.changed, `${name}: the parts draw`).toBeGreaterThan(10000);
      expect(result.outside, `${name}: 0 pixels outside the controls (${JSON.stringify(result.outsideSamples.slice(0, 4))})`).toBe(0);
      expect(result.outsideClip, `${name}: 0 pixels past the viewport`).toBe(0);
      expect(result.lamps.inside, `${name}: lamps glow inside their boxes`).toBeGreaterThan(100);
      expect(result.straddledLamp.inside, `${name}: the straddled lamp draws inside the viewport`).toBeGreaterThan(50);
      expect(result.hitMismatches, `${name}: native hits on drawn pixels find their control`).toBe(0);
    }

    // Hits: the same with the chain on and every stage off.
    const points = hitGrid(await call("controls"));
    const hitsOn = await call("hits", points);
    await call("setPost", OFF);
    const hitsOff = await call("hits", points);
    await call("setPost", undefined);
    report.hits = { points: points.length, differing: hitsOn.filter((hit, index) => hit !== hitsOff[index]).length,
      centresOnTheirControl: (await call("controls")).filter((control, index) => hitsOn[index * 6] === control.id).length };
    expect(report.hits.differing, "hits unchanged by the chain").toBe(0);

    // Opacity: the meshes composite as one group over the layer's faded face (decision 6 of item 3). With every stage
    // off (no antialiasing, so every part pixel is covered or not) the reference at 0.5 is, on a part pixel, the average
    // of the part at opacity 1 and the face alone at 0.5, and elsewhere the face alone at 0.5. Lights and face shadows
    // off: the pool and the face shadows are face terms, not the group.
    await call("setLights", false); await call("setShadows", false); await call("setPost", OFF);
    const opacityFrames = {};
    for (const [name, opacity, meshes] of [["one", 1, true], ["face1", 1, false], ["faceHalf", 0.5, false], ["zero", 0, true], ["half", 0.5, true], ["back", 1, true]]) {
      await call("setMeshes", meshes, "upper");
      await call("setOpacity", "upper", opacity);
      await stillGpu(call, `opacity ${opacity}`);
      opacityFrames[name] = await shot(page, name === "half" ? `${directory}/opacity-half-dpr${dpr}.png` : undefined);
    }
    await call("setMeshes", true, "upper");
    await call("setLights", true); await call("setShadows", true); await call("setPost", undefined);
    {
      const { one, face1, faceHalf, zero, half, back } = opacityFrames;
      const upperControls = (await call("controls")).filter(control => control.layer === "upper");
      let compared = 0, partPixels = 0, worst = 0, over1 = 0, hiddenAtZero = 0, drawn = 0;
      const errorSamples = [];
      for (const control of upperControls) for (let y = Math.ceil(control.y * dpr); y < Math.floor((control.y + control.height) * dpr); y++) for (let x = Math.ceil(control.x * dpr); x < Math.floor((control.x + control.width) * dpr); x++) {
        // A captured cap shows the capture, so it equals the face: a key's inside (8 px clear of its box) is its cap; the
        // band between is left out.
        const offset = (y * one.width + x) * 4, point = { x: (x + 0.5) / dpr, y: (y + 0.5) / dpr }, differs = !same(one, face1, offset);
        const capZone = control.kind === "key" ? rounded(point, { ...grow(control, -8), radius: 2 }) <= 0 : false;
        if (control.kind === "key" && !differs && !capZone) continue;
        const part = differs || capZone;
        if (differs) drawn++;
        compared++;
        if (part) partPixels++;
        if (differs && !same(one, zero, offset)) hiddenAtZero++;
        for (let channel = 0; channel < 3; channel++) {
          const reference = part ? (one.data[offset + channel] + faceHalf.data[offset + channel]) / 2 : faceHalf.data[offset + channel];
          const error = Math.abs(half.data[offset + channel] - reference);
          worst = Math.max(worst, error);
          if (error > 1) { over1++; if (errorSamples.length < 12 && (x + y) % 7 === 0) errorSamples.push({ id: control.id, kind: control.kind, x, y, part, one: one.data[offset + channel], face1: face1.data[offset + channel], faceHalf: faceHalf.data[offset + channel], half: half.data[offset + channel], zero: zero.data[offset + channel] }); }
        }
      }
      let backChanged = 0;
      for (let offset = 0; offset < one.data.length; offset += 4) if (!same(one, back, offset)) backChanged++;
      // At opacity 0 the layer draws nothing: the frame is the lower layers' alone wherever the upper panel is.
      report.opacity = { compared, partPixels, drawn, hiddenAtZero, worstLevels: worst, over1, backChanged, errorSamples };
      expect(partPixels, "the upper panel's parts draw").toBeGreaterThan(1000);
      // A part pixel can match what lies beneath the panel by chance, so not every one changes.
      expect(hiddenAtZero, "opacity 0 hides the parts").toBeGreaterThan(0.95 * drawn);
      expect(over1, `opacity 0.5 matches the group blend within 1 level (worst ${worst})`).toBe(0);
      expect(backChanged, "back at opacity 1 the frame is the same").toBe(0);
    }
    await call("setMeshes", true);

    // The map: every stage off (so no stage blends a changed part into a face pixel), face shadows off; part coverage
    // from parts against the face only.
    await call("setPost", OFF); await call("setShadows", false);
    const parts = await shot(page, `${directory}/map-on-dpr${dpr}.png`);
    await call("setMeshes", false);
    const face = await shot(page);
    await call("setMeshes", true);
    await call("setMap", { darkness: 1 });
    const unmapped = await shot(page, `${directory}/map-off-dpr${dpr}.png`);
    await call("setMap", undefined);
    {
      const controls = await call("controls");
      let changed = 0, outsideParts = 0, outsideControls = 0;
      for (let offset = 0, index = 0; offset < parts.data.length; offset += 4, index++) {
        if (same(parts, unmapped, offset)) continue;
        changed++;
        if (same(parts, face, offset)) outsideParts++;
        const point = { x: (index % parts.width + 0.5) / dpr, y: (Math.floor(index / parts.width) + 0.5) / dpr };
        if (!controls.some(control => rounded(point, control) <= 0)) outsideControls++;
      }
      const cases = (await call("cases")).filter(entry => entry.layer === "upper" || entry.layer === "lower" && !overlaps(grow(entry.plate, 24), panels.upper) && !overlaps(grow(entry.plate, 24), panels.viewport));
      const darker = (box, exclude) => {
        const set = new Set();
        for (let y = Math.ceil(box.y * dpr); y < Math.floor((box.y + box.height) * dpr); y++) for (let x = Math.ceil(box.x * dpr); x < Math.floor((box.x + box.width) * dpr); x++) {
          if (exclude && inside({ x: (x + 0.5) / dpr, y: (y + 0.5) / dpr }, exclude)) continue;
          const offset = (y * parts.width + x) * 4;
          if (luminance(unmapped, offset) - luminance(parts, offset) >= 6) set.add(y * parts.width + x);
        }
        return set;
      };
      const thins = cases.filter(entry => entry.kind === "thin").map(entry => {
        // The plinth beside the thin plate (its top grown by 1 px is left out), inset 1 px from the plinth's edge.
        const shadow = darker(grow(entry.plate, -1), grow(entry.top, 1));
        const sizes = components(shadow, parts.width);
        return { id: entry.id, pixels: shadow.size, components: sizes.length, sizes: sizes.slice(0, 4), plinth: entry.plate, top: entry.top,
          ...(sizes.length > 1 ? { at: [...shadow].map(index => [index % parts.width, Math.floor(index / parts.width)]) } : {}) };
      });
      const bats = cases.filter(entry => entry.kind === "bat").map(entry => {
        const shadow = darker(grow(entry.plate, -1));
        return { id: entry.id, t: entry.t, pixels: shadow.size };
      });
      report.map = { changed, outsideParts, outsideControls, thins, bats };
      expect(changed, "the map changes part pixels").toBeGreaterThan(500);
      expect(outsideParts, "the map never changes a face pixel").toBe(0);
      expect(outsideControls, "the map changes nothing outside the controls").toBe(0);
      expect(thins.length, "thin plates checked").toBeGreaterThan(3);
      for (const thin of thins) expect([thin.id, thin.components], `${thin.id}: its mapped shadow is one connected component (${JSON.stringify(thin)})`).toEqual([thin.id, 1]);
      expect(bats.length, "bats checked").toBeGreaterThan(3);
      for (const bat of bats) expect(bat.pixels, `${bat.id}: the lever and ball shade the plate`).toBeGreaterThan(10 * dpr * dpr);
    }
    await call("setPost", undefined); await call("setShadows", true);

    // Re-render policy: 0 map renders over 120 still frames that are drawn; one per pose change.
    report.idle = await call("idle", 120);
    expect(report.idle.gpuFrames, "the still frames are drawn").toBeGreaterThan(100);
    expect(report.idle.captures, "still frames capture nothing").toBe(0);
    for (const layer of report.idle.map) {
      expect(layer.renders, `${layer.id}: no map render over 120 still frames`).toBe(0);
      expect(layer.timedRenders, `${layer.id}: no map pass timed over 120 still frames`).toBe(0);
    }
    {
      const bat = (await call("controls")).find(control => control.kind === "bat" && control.layer === "lower");
      const rendersOf = async () => Object.fromEntries((await call("post")).layers.map(layer => [layer.id, layer.map.renders]));
      const before = await rendersOf();
      for (let index = 0; index < 5; index++) await call("pose", bat.id, index % 2 ? 1 : 0.3);
      const after = await rendersOf();
      report.poseRenders = Object.fromEntries(Object.keys(after).map(id => [id, after[id] - before[id]]));
      expect(report.poseRenders, "one map render per pose change, on the posed layer only").toEqual({ lower: 5, upper: 0, clipped: 0 });
    }

    // Stage toggles, each an option on its own, then the defaults: GPU on, the stage built.
    report.toggles = {};
    for (const [name, post] of [["taa", { taa: true }], ["contact", { contact: true }], ["ssgi", { ssgi: true }], ["off", OFF], ["defaults", undefined]]) {
      const state = await call("setPost", post);
      await stillGpu(call, `stages ${name}`);
      report.toggles[name] = state.layers.map(layer => [layer.id, Object.fromEntries(Object.entries(layer.stages).map(([stage, value]) => [stage, value.status]))]);
      for (const layer of state.layers) expect(Object.values(layer.stages).some(value => value.status === "failed"), `${name}: no stage failed on ${layer.id}`).toBe(false);
      if (post?.taa || post?.contact || post?.ssgi) for (const layer of state.layers) expect(layer.stages[name].status, `${name} on`).toBe("on");
    }

    // Costs: 300 animated frames with the default chain, then with each option on.
    report.costs = {};
    for (const [name, post] of [["defaults", undefined], ["taa", { taa: true }], ["contact", { contact: true }], ["ssgi", { ssgi: true }]]) {
      await call("setPost", post);
      const run = await call("animate", 300);
      expect(run.mode, `${name}: GPU on while animating`).toBe("gpu");
      expect([run.captures, run.uploads, run.geometryUpdates], `${name}: poses capture nothing`).toEqual([0, 0, 0]);
      report.costs[name] = { run, stages: costs(await call("post")), layers: (await call("instrument")).layers.map(layer => ({ id: layer.id, p50: layer.gpu.p50Ms, p95: layer.gpu.p95Ms })) };
    }
    await call("setPost", undefined);

    // Resize and back, then a DPR change and back: GPU on, the targets follow the canvas.
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForFunction(() => window.innerWidth === 1600 && document.getElementById("lower").offsetWidth === 1568);
    await call("settle");
    await stillGpu(call, "after resize");
    report.resize = { targets: (await call("post")).targets, clip: await containment(call, page, dpr, "resize") };
    expect(report.resize.targets.mesh.width, "the mesh target follows the canvas").toBe(1600 * dpr);
    expect(report.resize.clip.outside, "after resize: 0 pixels outside").toBe(0);
    await page.setViewportSize(viewport);
    await page.waitForFunction(width => window.innerWidth === width && document.getElementById("lower").offsetWidth === width - 32, viewport.width);
    await call("settle");
    await stillGpu(call, "after resize back");
    const cdp = await context.newCDPSession(page);
    const other = dpr === 1 ? 2 : 1;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: other, mobile: false });
    await page.waitForFunction(value => window.devicePixelRatio === value, other);
    await call("render");
    await stillGpu(call, "after a DPR change");
    report.dprChange = { dpr: other, targets: (await call("post")).targets, canvas: await page.evaluate(() => [...document.querySelectorAll("canvas")].map(canvas => [canvas.width, canvas.height])) };
    expect(report.dprChange.targets.mesh.width, "the mesh target follows the new DPR").toBe(viewport.width * other);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: dpr, mobile: false });
    await page.waitForFunction(value => window.devicePixelRatio === value, dpr);
    await call("render");
    await stillGpu(call, "after the DPR change back");
    // Playwright shoots at the context's scale (it resamples a canvas drawn at an emulated DPR), so the pixel check runs
    // back at the context's DPR, after the targets were replaced twice.
    report.dprChange.back = await containment(call, page, dpr, "dpr-back");
    expect(report.dprChange.back.outside, "after a DPR change and back: 0 pixels outside").toBe(0);
    expect(report.dprChange.back.changed, "after a DPR change and back: the parts draw").toBeGreaterThan(10000);
    await cdp.detach();

    // Disable and enable: the targets go with the engine and come back.
    const disabled = await call("disable");
    report.disabled = { mode: disabled.mode, instrument: await call("instrument") };
    expect(report.disabled.instrument, "no instrument state without the engine").toBe(null);
    await call("enable");
    await stillGpu(call, "after enable");
    report.enabled = { targets: (await call("post")).targets };
    expect(Object.keys(report.enabled.targets).length, "targets back after enable").toBeGreaterThan(3);
    report.errors = errors;
    report.gpuWarnings = warnings.filter(warning => /Destroyed|Invalid|validation/i.test(warning));
    expect(errors, "no page errors").toEqual([]);
    expect(report.gpuWarnings, "no WebGPU warnings (a destroyed target in a submit, a validation error)").toEqual([]);
  } finally {
    report.errors ??= errors;
    await writeFile(`${directory}/report-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});

test("post chain: the start reaches GPU with every chain built, 10 times, while a successor races the pipelines", async ({ browser }) => {
  test.setTimeout(600000);
  await mkdir(directory, { recursive: true });
  const starts = [];
  for (let index = 0; index < 10; index++) {
    const dpr = index % 2 ? 2 : 1;
    const { context, call, errors } = await open(browser, dpr, "?race=1");
    try {
      const boot = await call("boot");
      const instrument = await call("instrument");
      starts.push({ dpr, ...boot, layers: instrument.layers.map(layer => [layer.id, layer.status]), compile: instrument.compile, errors: errors.length });
      expect(boot.mode, `start ${index}: GPU (${boot.reason})`).toBe("gpu");
      expect(boot.reason, `start ${index}: no fallback`).toMatch(healthy);
      expect(instrument.layers.every(layer => layer.status === "ready"), `start ${index}: every chain built`).toBe(true);
      expect(errors, `start ${index}: no errors`).toEqual([]);
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/starts.json`, JSON.stringify(starts, null, 2));
});

test("post chain: a stage that fails to build is left out, and a chain that cannot be built steps its layers down with post", async ({ browser }) => {
  test.setTimeout(300000);
  await mkdir(directory, { recursive: true });
  const report = {};
  {
    const { context, call } = await open(browser, 1, "?fail=smaa");
    try {
      await call("settle");
      await stillGpu(call, "SMAA fails");
      const post = await call("post");
      report.smaa = post.layers.map(layer => ({ id: layer.id, smaa: layer.stages.smaa, bloom: layer.stages.bloom.status }));
      for (const layer of post.layers) {
        expect(layer.stages.smaa.status, `${layer.id}: SMAA reported failed`).toBe("failed");
        expect(layer.stages.smaa.error, `${layer.id}: with its error`).toMatch(/test hook/);
        expect(layer.stages.bloom.status, `${layer.id}: the rest of the chain draws`).toBe("on");
      }
    } finally { await context.close(); }
  }
  {
    const { context, call } = await open(browser, 1, "?fail=composite");
    try {
      await call("settle");
      const counts = await call("counts");
      expect(counts.mode, `the chain fails: GPU stays on (${counts.reason})`).toBe("gpu");
      expect(counts.reason).toMatch(healthy);
      const instrument = await call("instrument");
      report.composite = instrument.layers.map(layer => ({ id: layer.id, status: layer.status, reasons: [...new Set(layer.steppedDown.map(entry => entry.reason))], detail: layer.steppedDown[0]?.detail }));
      for (const layer of instrument.layers) {
        expect(layer.status, `${layer.id}: failed, drawn at Relief`).toBe("failed");
        expect([...new Set(layer.steppedDown.map(entry => entry.reason))], `${layer.id}: the post reason`).toEqual(["post"]);
      }
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/failures.json`, JSON.stringify(report, null, 2));
});
