/**
 * Core's custom parts (`docs/ui-library/instrument-phase2.md`, core work item 5) on `instrument-custom-core.html`
 * (`window.customCore`, from `examples/playground/src/instrument-custom-core/page.ts`): one enrolled panel of twelve native
 * range inputs at 1920 × 1080, each with a base plate and a custom part: inline meshes (a bar that turns, a disc with its
 * own normals, a bar too long for its box), references to `public/custom/parts.glb` (`scripts/make-custom-fixture.mjs`: a
 * fluted cap, a lever that turns, a block with no normals in the file, a dense dome, a slab larger than its box) and three
 * files that fail on purpose. At DPR 1 and 2 the test checks that:
 * - GPU presentation stays on, with no fallback, through loads, failures, refusals, budgets and poses;
 * - every pixel a custom part draws lies inside its control's box over the whole travel (0 px outside, a turning bar and a
 *   turning lever included), native hits on drawn pixels find their control, and the captions (the contrast guard's text)
 *   are unchanged by the parts and their shadows;
 * - a block loaded without normals is lit like the parametric prism it imitates (its top is not black), whatever its winding;
 * - the face shadow of a mesh with no explicit caster stays inside its object's box (the Fader's rule), an explicit caster
 *   is honoured as given;
 * - the load lifecycle: while the file is held the layer is ready with its other parts drawn and no frame is blank or
 *   stepped down, the custom part appears when the file arrives (and only the boxes of the loaded parts change), the states
 *   go `loading` to `ready`, and a disable and enable loads them again;
 * - failures (a 404, a malformed glB, a mesh that leaves its declared box) leave the part out, report their reason and keep
 *   GPU on, with nothing drawn for them; a mesh larger than its travel box is refused with the containment diagnostic, not
 *   clipped;
 * - the caps: meshes over the vertex or triangle cap, with non-finite values, a degenerate triangle, no normals or a box that
 *   does not hold them are refused with the reason, and the scene in effect is untouched;
 * - the budgets: 2,048 parts draw, 2,049 step the layer down (`budget`); custom triangles over 1,000,000 step the last object
 *   down, deterministically;
 * - 300 frames of poses cause 0 captures, 0 uploads and 0 hit-geometry updates;
 * - the cost of 50 custom parts against 50 parametric ones of the same triangle count, and the fixture's load times.
 * Reports and screenshots go to the `core-custom` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-custom");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;
const inside = (point, box, grow = 0) => point.x >= box.x - grow && point.y >= box.y - grow && point.x <= box.x + box.width + grow && point.y <= box.y + box.height + grow;

async function open(browser, dpr, { query = "", routes } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    // The browser itself logs the 404 of the file that is missing on purpose; anything else is an error.
    if (message.type() === "error" && !/Failed to load resource.*404/.test(message.text())) errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") warnings.push(message.text());
  });
  // A 404 for the missing file (the preview server answers unknown paths with its page).
  await page.route("**/custom/nothing.glb", route => route.fulfill({ status: 404, body: "not found" }));
  if (routes) await routes(page);
  await page.goto(`/instrument-custom-core.html${query}`);
  await page.waitForFunction(() => window.customCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.customCore.ready)[name](...args), { name, args });
  return { context, page, errors, warnings, call };
}
const shot = async (page, path) => PNG.sync.read(await page.screenshot(path ? { path } : {}));
async function stillGpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}
const luminance = (r, g, b) => { const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };

/**
 * Per control, the pixels that differ between two screenshots: counts inside each control's box and outside every box
 * (`grow` px of slack for objects drawn at the Relief level, whose edge is antialiased).
 */
function diff(a, b, dpr, controls, panel, { relief = [] } = {}) {
  const result = { changed: 0, outside: 0, outsideSamples: [], byControl: Object.fromEntries(controls.map(control => [control.id, 0])), maxDelta: Object.fromEntries(controls.map(control => [control.id, 0])), candidates: [] };
  const x0 = Math.max(0, Math.floor((panel.x - 24) * dpr)), x1 = Math.min(a.width, Math.ceil((panel.x + panel.width + 24) * dpr));
  const y0 = Math.max(0, Math.floor((panel.y - 24) * dpr)), y1 = Math.min(a.height, Math.ceil((panel.y + panel.height + 24) * dpr));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const offset = (y * a.width + x) * 4;
    if (a.data[offset] === b.data[offset] && a.data[offset + 1] === b.data[offset + 1] && a.data[offset + 2] === b.data[offset + 2]) continue;
    result.changed++;
    const point = { x: (x + 0.5) / dpr, y: (y + 0.5) / dpr };
    const owner = controls.find(control => inside(point, control, relief.includes(control.id) ? 1 : 0));
    if (!owner) {
      result.outside++;
      if (result.outsideSamples.length < 12) result.outsideSamples.push({ ...point, a: [...a.data.subarray(offset, offset + 3)], b: [...b.data.subarray(offset, offset + 3)] });
      continue;
    }
    result.byControl[owner.id]++;
    result.maxDelta[owner.id] = Math.max(result.maxDelta[owner.id], Math.abs(a.data[offset] - b.data[offset]), Math.abs(a.data[offset + 1] - b.data[offset + 1]), Math.abs(a.data[offset + 2] - b.data[offset + 2]));
    // Hit candidates are strictly inside the box: a Relief edge may antialias 1 px past it.
    if (result.candidates.length < 100000 && inside(point, owner, 0)) result.candidates.push({ ...point, id: owner.id });
  }
  return result;
}
/** The mean colour of a square of device pixels around a client point. */
function mean(png, dpr, point, radius = 3) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.round(point.y * dpr) - radius; y <= Math.round(point.y * dpr) + radius; y++) for (let x = Math.round(point.x * dpr) - radius; x <= Math.round(point.x * dpr) + radius; x++) {
    const offset = (y * png.width + x) * 4;
    r += png.data[offset]; g += png.data[offset + 1]; b += png.data[offset + 2]; n++;
  }
  return [r / n, g / n, b / n];
}
const centre = control => ({ x: control.x + control.width / 2, y: control.y + control.height / 2 });
const GLB_BASED = ["c-cap", "c-lever", "c-block", "c-dense", "c-slab", "c-tall-cap", "c-lamp"];
const DRAWN = ["c-bar-inline", "c-disc-inline", "c-cap", "c-lever", "c-block", "c-dense", "c-prism-ref", "c-tall-cap", "c-lamp"];
const REFUSED = ["c-slab", "c-long-bar"];
const FAILED = ["c-missing", "c-malformed", "c-wrong-scale"];

for (const dpr of [1, 2]) {
  test.describe(`custom parts at DPR ${dpr}`, () => {
    test.describe.configure({ mode: "serial" });

    test(`drawn inside their boxes over the whole travel, hits exact, text unchanged (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(240000);
      await mkdir(directory, { recursive: true });
      const { context, errors, call, page } = await open(browser, dpr);
      try {
        const parts = await call("loaded");
        expect(parts.map(part => [part.object, part.status])).toEqual([["c-bar-inline", "ready"], ["c-disc-inline", "ready"], ["c-cap", "ready"], ["c-lever", "ready"], ["c-block", "ready"],
          ["c-dense", "ready"], ["c-slab", "ready"], ["c-long-bar", "ready"], ["c-missing", "failed"], ["c-malformed", "failed"], ["c-wrong-scale", "failed"], ["c-tall-cap", "ready"], ["c-lamp", "ready"]]);
        await stillGpu(call, "after the loads");
        const controls = await call("controls"), panel = await call("panel");
        // Parts only: no face shadows, so every changed pixel is a part.
        await call("setShadows", false);
        await call("poseAll", 0);
        const plates = await (async () => { await call("setCustom", false); const image = await shot(page); await call("setCustom", true); return image; })();
        const report = { dpr, poses: [] };
        const hitCandidates = [];
        let lit = null;
        for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
          await call("poseAll", t);
          const image = await shot(page, t === 0 || t === 0.5 || t === 1 ? `${directory}/parts-t${t}-dpr${dpr}.png` : undefined);
          const result = diff(image, plates, dpr, controls, panel, { relief: REFUSED });
          expect(result.outside, `t=${t}: pixels outside every control's box: ${JSON.stringify(result.outsideSamples)}`).toBe(0);
          // The parts that are drawn change pixels in their own box; failed parts change none, refused ones are drawn at Relief inside their box.
          for (const id of DRAWN) expect(result.byControl[id], `t=${t}: ${id} draws`).toBeGreaterThan(200);
          for (const id of FAILED) expect(result.byControl[id], `t=${t}: ${id} (a failed load) draws nothing`).toBe(0);
          report.poses.push({ t, changed: result.changed, outside: result.outside, byControl: result.byControl });
          hitCandidates.push(...result.candidates.filter((_, at) => at % Math.max(1, Math.floor(result.candidates.length / 600)) === 0));
          if (t === 0) lit = { image, controls };
        }
        // The block's top against the parametric prism it imitates (matte, 24 × 24 × 6 at travel 0): lit alike, not black.
        const block = controls.find(control => control.id === "c-block"), prism = controls.find(control => control.id === "c-prism-ref");
        const a = mean(lit.image, dpr, centre(block)), b = mean(lit.image, dpr, centre(prism));
        report.top = { block: a, prism: b };
        expect(Math.max(...a.map((value, at) => Math.abs(value - b[at]))), `the block's top ${a} against the prism's ${b}`).toBeLessThan(10);
        expect(luminance(...a)).toBeGreaterThan(0.25);
        // The inline disc brings its own normals and is wound the other way from core's convention: its top is lit like the prism's too.
        const disc = mean(lit.image, dpr, centre(controls.find(control => control.id === "c-disc-inline")));
        report.top.disc = disc;
        expect(Math.max(...disc.map((value, at) => Math.abs(value - b[at]))), `the disc's top ${disc} against the prism's ${b}`).toBeLessThan(10);
        // Native hits: the control under every sampled drawn pixel is its own.
        const points = hitCandidates.slice(0, 4000);
        const hits = await call("hits", points.map(point => ({ x: point.x, y: point.y })));
        const mismatches = points.filter((point, at) => hits[at] !== point.id);
        report.hits = { sampled: points.length, mismatches: mismatches.length };
        expect(mismatches.length, `native hits: ${JSON.stringify(mismatches.slice(0, 5))}`).toBe(0);
        expect(points.length).toBeGreaterThan(500);
        // Text: the captions and the heading, with the parts and their shadows on, against the plates alone.
        await call("setShadows", true);
        await call("poseAll", 0.5);
        const withParts = await shot(page, `${directory}/shadows-dpr${dpr}.png`);
        await call("setCustom", false);
        const without = await shot(page);
        await call("setCustom", true);
        const texts = await call("texts");
        let worst = 0, differing = 0, compared = 0;
        const ratio = (png, box) => {
          let lo = Infinity, hi = -Infinity;
          for (let y = Math.floor(box.y * dpr); y < Math.ceil((box.y + box.height) * dpr); y++) for (let x = Math.floor(box.x * dpr); x < Math.ceil((box.x + box.width) * dpr); x++) {
            const offset = (y * png.width + x) * 4, l = luminance(png.data[offset], png.data[offset + 1], png.data[offset + 2]);
            lo = Math.min(lo, l); hi = Math.max(hi, l);
          }
          return (hi + 0.05) / (lo + 0.05);
        };
        let ratioShift = 0;
        for (const text of texts) {
          for (let y = Math.floor(text.y * dpr); y < Math.ceil((text.y + text.height) * dpr); y++) for (let x = Math.floor(text.x * dpr); x < Math.ceil((text.x + text.width) * dpr); x++) {
            const offset = (y * withParts.width + x) * 4;
            compared++;
            const d = Math.max(Math.abs(withParts.data[offset] - without.data[offset]), Math.abs(withParts.data[offset + 1] - without.data[offset + 1]), Math.abs(withParts.data[offset + 2] - without.data[offset + 2]));
            if (d) differing++;
            worst = Math.max(worst, d);
          }
          ratioShift = Math.max(ratioShift, Math.abs(ratio(withParts, text) - ratio(without, text)));
        }
        report.text = { compared, differing, worstLevelDifference: worst, contrastShift: ratioShift };
        // The guard: inside protected text the face's whole change stays within interior.max (0.04 of 255 is 10.2 levels).
        expect(worst, `text pixels changed by up to ${worst} levels`).toBeLessThanOrEqual(11);
        expect(ratioShift, "the captions' contrast ratio shifts by less than 0.05").toBeLessThan(0.05);
        // The lamp: its lens is a custom part and its emitter's lens, so its glow copy took the file's triangles too: the bloom and the
        // clustered light are on and nothing of them is outside its box (the diff above covered the whole travel).
        const post = (await call("instrument")).post.layers[0];
        report.lamp = { lenses: post.lenses, lit: post.lit, bloom: post.stages.bloom, lights: (await call("instrument")).layers[0].lights };
        expect(post.lenses, "the lamp's kind is a lens").toBeGreaterThanOrEqual(1);
        expect(post.lit, "its emitter is lit").toBeGreaterThanOrEqual(1);
        expect(post.stages.bloom.status).toBe("on");
        expect(report.lamp.lights.clustered).toBe(true);
        await stillGpu(call, "after the poses");
        await writeFile(`${directory}/drawn-dpr${dpr}.json`, JSON.stringify(report, null, 2));
        expect(errors, "no page or console error").toEqual([]);
      } finally { await context.close(); }
    });

    test(`the face shadow of a mesh stays in its box, an explicit caster is honoured (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(180000);
      const { context, call, page } = await open(browser, dpr);
      try {
        await call("loaded");
        const controls = await call("controls"), panel = await call("panel");
        await call("poseAll", 0.5);
        await call("setCustom", false);
        const plates = await shot(page);
        await call("setCustom", true);
        await call("setShadows", true);
        const capped = await shot(page, `${directory}/caster-capped-dpr${dpr}.png`);
        // Parts and shadows together: nothing outside the boxes (refused objects are drawn at Relief with a 1 px edge).
        const result = diff(capped, plates, dpr, controls, panel, { relief: REFUSED });
        expect(result.outside, `shadows and parts outside the boxes: ${JSON.stringify(result.outsideSamples)}`).toBe(0);
        // An explicit caster is the application's: a tall one casts past the box.
        await call("setCaster", { rect: [0, 0, 40, 40], radius: 0, height: 30 });
        const explicit = await shot(page, `${directory}/caster-explicit-dpr${dpr}.png`);
        const loud = diff(explicit, plates, dpr, controls, panel, { relief: REFUSED });
        expect(loud.outside, "an explicit caster is honoured as given: its shadow leaves the box").toBeGreaterThan(0);
        await writeFile(`${directory}/caster-dpr${dpr}.json`, JSON.stringify({ dpr, cappedOutside: result.outside, explicitOutside: loud.outside }, null, 2));
        await stillGpu(call, "after the casters");
      } finally { await context.close(); }
    });

    test(`the load lifecycle: ready with the other parts while a file loads, the part appears when it arrives (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(240000);
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const { context, errors, call, page } = await open(browser, dpr, { routes: page => page.route("**/custom/parts.glb", async route => { await gate; await route.continue(); }) });
      try {
        // The page is up with the file held: GPU on, the layer ready, the inline parts drawn.
        const early = await call("instrument");
        const states = early.layers[0].customParts.map(part => [part.object, part.status]);
        expect(states.filter(([id]) => GLB_BASED.concat(["c-wrong-scale"]).includes(id)).map(([, status]) => status), "the held file's parts are loading").toEqual(Array(8).fill("loading"));
        expect(states.filter(([id]) => ["c-bar-inline", "c-disc-inline", "c-long-bar", "c-prism-ref"].includes(id)).every(([, status]) => status === "ready")).toBe(true);
        expect(early.layers[0].status, "ready, not pending: no part waits for a build").toBe("ready");
        expect(early.layers[0].steppedDown.map(entry => entry.object), "only the inline bar too long for its box is at Relief").toEqual(["c-long-bar"]);
        await stillGpu(call, "while the file is held");
        const controls = await call("controls"), panel = await call("panel");
        await call("setShadows", false);
        await call("poseAll", 0.25);
        const loading = await shot(page, `${directory}/loading-dpr${dpr}.png`);
        // Sample every frame through the arrival: the layer is ready and has parts in every frame, GPU frames keep coming.
        await page.evaluate(() => {
          window.samples = [];
          const tick = async () => {
            const api = await window.customCore.ready, layer = api.instrument().layers[0];
            window.samples.push({ status: layer.status, drawnParts: layer.drawnParts, stepped: layer.steppedDown.map(entry => `${entry.object}:${entry.reason}`), gpuFrames: api.counts().gpuFrames, mode: api.counts().mode });
            if (!window.stopSampling) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const framesBefore = (await call("counts")).gpuFrames;
        // Poses while the file is held: each is a drawn GPU frame with the other parts.
        for (let step = 1; step <= 8; step++) await call("pose", "c-bar-inline", step / 8);
        const during = await call("counts");
        expect(during.gpuFrames - framesBefore, "frames are drawn while the file is held").toBeGreaterThanOrEqual(8);
        expect(during.mode).toBe("gpu");
        release();
        const loadedParts = await call("loaded");
        await page.waitForTimeout(300);
        const samples = await page.evaluate(() => { window.stopSampling = true; return window.samples; });
        expect(loadedParts.filter(part => GLB_BASED.includes(part.object)).every(part => part.status === "ready")).toBe(true);
        expect(samples.length).toBeGreaterThan(20);
        expect(samples.every(sample => sample.status === "ready"), "ready in every frame of the arrival").toBe(true);
        expect(samples.every(sample => sample.mode === "gpu")).toBe(true);
        expect(Math.min(...samples.map(sample => sample.drawnParts)), "no frame with its other parts gone").toBeGreaterThanOrEqual(11);
        expect(samples.some(sample => sample.stepped.some(entry => /pending|compile|post/.test(entry))), "no object was stepped down for a build").toBe(false);
        expect(samples.at(-1).stepped.some(entry => entry === "c-slab:containment"), "the slab is refused once its triangles are known").toBe(true);
        await call("poseAll", 0.25);
        const after = await shot(page, `${directory}/loaded-dpr${dpr}.png`);
        // What changed between the frame before the file arrived and after: only the loaded parts' boxes (and the refused slab's relief), never the other controls.
        const report = { dpr };
        const change = diff(loading, after, dpr, controls, panel, { relief: REFUSED });
        expect(change.outside, "nothing changed outside the controls").toBe(0);
        for (const id of ["c-cap", "c-lever", "c-block", "c-dense", "c-slab", "c-tall-cap", "c-lamp"]) expect(change.byControl[id], `${id} appears`).toBeGreaterThan(100);
        // The other controls' parts are not redrawn differently. The key light's shadow map is fitted to its casters' box, which
        // grows with the new parts, so a shadow the map casts on a neighbour's plate may move by a texel: a few levels at most.
        report.arrival = { byControl: change.byControl, maxDelta: change.maxDelta };
        for (const id of ["c-bar-inline", "c-disc-inline", "c-prism-ref", "c-missing", "c-malformed", "c-wrong-scale"]) {
          expect(change.maxDelta[id], `${id} is not redrawn differently (${change.byControl[id]} px moved by up to ${change.maxDelta[id]} levels)`).toBeLessThanOrEqual(6);
        }
        // While loading, the loading controls showed exactly their base plates: no stale pixels, no blank box.
        await call("setCustom", false);
        const plates = await shot(page);
        await call("setCustom", true);
        const bare = diff(loading, plates, dpr, controls, panel, { relief: REFUSED });
        for (const id of [...GLB_BASED, "c-wrong-scale"]) expect(bare.byControl[id], `${id} was its plate while loading`).toBe(0);
        // The cost of the load, from the store.
        const assets = (await call("instrument")).assets;
        await writeFile(`${directory}/lifecycle-dpr${dpr}.json`, JSON.stringify({ ...report, samples: samples.length, assets }, null, 2));
        // A disable and an enable: the store goes with the controller and the parts load again (the file is served now).
        await call("disable");
        expect(await call("instrument"), "no instrument state while disabled").toBeNull();
        await call("enable");
        await call("loaded");
        await stillGpu(call, "after enable");
        const again = (await call("instrument")).layers[0].customParts.map(part => [part.object, part.status]);
        expect(again.find(([id]) => id === "c-cap")).toEqual(["c-cap", "ready"]);
        expect(errors, "no page or console error").toEqual([]);
      } finally { release?.(); await context.close(); }
    });

    test(`with no shadow map, a file's arrival changes no other control by a level (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(180000);
      // The arrival test above allows a few levels on the other controls: the key light's shadow map is fitted to its casters' box, which
      // grows with the new parts. Without the map (`?map=off`, a darkness of 1) the other controls are bit-identical, which proves it.
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      const { context, call, page } = await open(browser, dpr, { query: "?map=off", routes: page => page.route("**/custom/parts.glb", async route => { await gate; await route.continue(); }) });
      try {
        await call("setShadows", false);
        await call("poseAll", 0.25);
        const before = await shot(page);
        release();
        await call("loaded");
        await call("poseAll", 0.25);
        const after = await shot(page);
        const controls = await call("controls"), panel = await call("panel");
        const change = diff(before, after, dpr, controls, panel, { relief: REFUSED });
        for (const id of ["c-bar-inline", "c-disc-inline", "c-prism-ref", "c-missing", "c-malformed", "c-wrong-scale"]) expect(change.byControl[id], `${id} is bit-identical`).toBe(0);
        for (const id of GLB_BASED) expect(change.byControl[id], `${id} appears`).toBeGreaterThan(100);
        expect(change.outside).toBe(0);
        await stillGpu(call, "without a shadow map");
      } finally { release?.(); await context.close(); }
    });

    test(`failed loads leave the part out, report why and keep GPU on; a mesh larger than its box is refused (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(180000);
      const { context, errors, warnings, call, page } = await open(browser, dpr);
      try {
        const parts = await call("loaded");
        const by = Object.fromEntries(parts.map(part => [part.object, part]));
        expect(by["c-missing"].status).toBe("failed");
        expect(by["c-missing"].error).toMatch(/HTTP 404/);
        expect(by["c-malformed"].status).toBe("failed");
        expect(by["c-malformed"].error).toMatch(/a glB chunk runs past the end of the file/);
        expect(by["c-wrong-scale"].status).toBe("failed");
        expect(by["c-wrong-scale"].error).toMatch(/leaves its declared bounds: vertex 0 is [\d.]+ on axis x, outside -18.5..18.5/);
        await stillGpu(call, "with three failed parts");
        const instrument = await call("instrument");
        expect(instrument.layers[0].status).toBe("ready");
        expect(instrument.layers[0].steppedDown.map(entry => entry.object).sort(), "failed parts do not step their objects down").toEqual(["c-long-bar", "c-slab"]);
        expect(instrument.assets.failures).toBeGreaterThanOrEqual(2);
        // Containment refusal: named, measured, and nothing drawn past the box.
        const slab = instrument.layers[0].steppedDown.find(entry => entry.object === "c-slab");
        expect(slab).toMatchObject({ reason: "containment", part: "custom" });
        expect(slab.overshoot, "the 140 px slab overshoots its 100 px box").toBeGreaterThan(30);
        const longBar = instrument.layers[0].steppedDown.find(entry => entry.object === "c-long-bar");
        expect(longBar).toMatchObject({ reason: "containment", part: "custom" });
        expect(longBar.overshoot, "the 108 px bar turning in a 100 px box").toBeGreaterThan(5);
        const controls = await call("controls"), panel = await call("panel");
        await call("setShadows", false);
        await call("setCustom", false);
        const plates = await shot(page);
        await call("setCustom", true);
        const image = await shot(page, `${directory}/failures-dpr${dpr}.png`);
        const result = diff(image, plates, dpr, controls, panel, { relief: REFUSED });
        expect(result.outside, "a refused mesh is not clipped into the box, it is not drawn: nothing outside").toBe(0);
        for (const id of FAILED) expect(result.byControl[id], `${id}: nothing drawn for a failed part`).toBe(0);
        expect(result.byControl["c-cap"], "the other parts draw").toBeGreaterThan(200);
        // The other parts of the failed controls (their plates) are drawn: the box shows its plate, not the face.
        const plate = mean(image, dpr, { x: controls.find(control => control.id === "c-missing").x + 10, y: controls.find(control => control.id === "c-missing").y + 10 });
        expect(plate[0], "the plate's grey").toBeLessThan(170);
        expect(errors, "failures are reported in state, not thrown").toEqual([]);
        expect(warnings.filter(text => /WebGPU|validation/i.test(text)), "no WebGPU warning").toEqual([]);
        await writeFile(`${directory}/failures-dpr${dpr}.json`, JSON.stringify({ dpr, failed: FAILED.map(id => by[id]), steppedDown: instrument.layers[0].steppedDown }, null, 2));
      } finally { await context.close(); }
    });

    test(`caps and malformed geometry are refused with their reason and change nothing (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(180000);
      const { context, call } = await open(browser, dpr);
      try {
        await call("loaded");
        const before = JSON.stringify((await call("instrument")).layers[0].customParts);
        const cases = {
          vertices: /profiles\.bad\.positions holds 16900 vertices, above the 16384 a mesh may have/,
          triangles: /profiles\.bad\.indices holds 33000 triangles, above the 32768 a mesh may have/,
          nan: /profiles\.bad\.positions\[4\] requires a finite number/,
          degenerate: /profiles\.bad\.indices\[0\] names a degenerate triangle \(0, 1, 1\)/,
          normals: /profiles\.bad\.normals is missing/,
          bounds: /profiles\.bad\.bounds does not hold the mesh: vertex 1 is 40 on axis x/,
        };
        for (const [kind, expected] of Object.entries(cases)) {
          const outcome = await call("tryUpdate", kind);
          expect(outcome.error, `${kind}: refused with its reason`).toMatch(expected);
          await stillGpu(call, `after the ${kind} case`);
        }
        const after = await call("instrument");
        expect(JSON.stringify(after.layers[0].customParts), "the scene in effect is untouched").toBe(before);
        expect(after.layers[0].status).toBe("ready");
        expect(after.budgets.customTrianglesPerLayer).toBe(1_000_000);
      } finally { await context.close(); }
    });

    test(`budgets: 2,048 parts draw and 2,049 step the layer down; custom triangles over 1,000,000 step the last object down (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(240000);
      const { context, call, page } = await open(browser, dpr);
      try {
        await call("loaded");
        const base = (await call("instrument")).layers[0];
        const atLimit = (await call("budget", 2048)).layers[0];
        expect(atLimit.parts).toBe(2048);
        expect(atLimit.status).toBe("ready");
        expect(atLimit.steppedDown.every(entry => entry.reason === "containment"), "at 2,048 only the containment refusals").toBe(true);
        expect(atLimit.drawnParts).toBeGreaterThan(2048 - 8);
        await stillGpu(call, "at 2,048 parts");
        const over = (await call("budget", 2049)).layers[0];
        expect(over.status).toBe("stepped-down");
        expect(over.steppedDown.length).toBe(over.objects);
        expect(over.steppedDown.every(entry => entry.reason === "budget")).toBe(true);
        expect(over.steppedDown[0].detail).toMatch(/2049 parts in the layer, above 2048/);
        expect(over.drawnParts).toBe(0);
        await stillGpu(call, "at 2,049 parts");
        // Back under: drawn again, the custom parts included (their triangles were cached, not fetched again).
        const back = (await call("budget", null)).layers[0];
        expect(back.status).toBe("ready");
        expect(back.drawnParts).toBe(base.drawnParts);
        expect(back.customParts.filter(part => part.status === "ready").length).toBe(base.customParts.filter(part => part.status === "ready").length);
        // The triangle budget (1,000,000): the scene's own custom parts that are drawn, then copies of the dense mesh (4,800 triangles each).
        const own = back.customParts.filter(part => part.status === "ready" && !back.steppedDown.some(entry => entry.object === part.object)).reduce((sum, part) => sum + part.triangles, 0);
        const room = Math.floor((1_000_000 - own) / 4800);
        const fit = (await call("triangles", room)).layers[0];
        expect(fit.steppedDown.filter(entry => entry.reason === "budget"), `${own} + ${room} · 4800 = ${own + room * 4800} triangles fit`).toEqual([]);
        const spill = (await call("triangles", room + 1)).layers[0];
        const budgetSteps = spill.steppedDown.filter(entry => entry.reason === "budget");
        expect(own + (room + 1) * 4800, "one copy more is over the budget").toBeGreaterThan(1_000_000);
        expect(budgetSteps.map(entry => entry.object), "the last object steps down, deterministically").toEqual([`dense-${room}`]);
        expect(budgetSteps[0].detail).toMatch(/4800 custom triangles; the layer's custom parts are limited to 1000000/);
        expect(spill.status).toBe("ready");
        const again = (await call("triangles", room + 1)).layers[0];
        expect(again.steppedDown.filter(entry => entry.reason === "budget").map(entry => entry.object)).toEqual([`dense-${room}`]);
        await stillGpu(call, "at the triangle budget");
        await shot(page, `${directory}/budget-dpr${dpr}.png`);
        await writeFile(`${directory}/budget-dpr${dpr}.json`, JSON.stringify({ dpr, atLimit: { parts: atLimit.parts, drawn: atLimit.drawnParts }, over: { status: over.status, detail: over.steppedDown[0].detail }, triangles: { own, room, fit: own + room * 4800, spill: budgetSteps } }, null, 2));
      } finally { await context.close(); }
    });

    test(`300 frames of poses cause no capture, upload or geometry update, and the cost against parametric parts (DPR ${dpr})`, async ({ browser }) => {
      test.setTimeout(420000);
      const { context, errors, call } = await open(browser, dpr);
      try {
        await call("loaded");
        const posing = await call("animate", 300);
        expect(posing.captures, "captures").toBe(0);
        expect(posing.uploads, "uploads").toBe(0);
        expect(posing.geometryUpdates, "geometry updates").toBe(0);
        expect(posing.mode).toBe("gpu");
        expect(posing.gpuFrames).toBeGreaterThan(150);
        // 50 custom against 50 parametric parts of the same triangle count (768): the fixture's cap against its lathe.
        const measures = {};
        for (const kind of ["parametric", "custom", "parametric", "custom"]) {
          const instrument = await call("bench", kind, 50);
          const layer = instrument.layers[0];
          expect(layer.steppedDown, `${kind}: every part is contained`).toEqual([]);
          const result = await call("animate", 300);
          expect(result.captures + result.uploads + result.geometryUpdates).toBe(0);
          expect(result.mode).toBe("gpu");
          (measures[kind] ??= []).push({ ...result, parts: layer.drawnParts, kinds: layer.kinds, assets: kind === "custom" ? instrument.assets : undefined });
        }
        await call("grid");
        await call("loaded");
        await stillGpu(call, "after the bench");
        // The fixture's timings: the request and the read of the whole file, and the in-place upload of each mesh.
        const fixture = (await call("instrument")).assets;
        await writeFile(`${directory}/cost-dpr${dpr}.json`, JSON.stringify({ dpr, posing, measures, fixture }, null, 2));
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  });
}
