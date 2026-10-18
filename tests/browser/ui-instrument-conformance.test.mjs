/**
 * Browser suite for core's `instrument` material against the Strata Rendering Model's Instrument conformance suite,
 * version 4 (`packages/ui/conformance/instrument-4.json`), on decoded GPU pixels, at DPR 1 and 2, on
 * `instrument-conformance.html` (`window.instrumentConformance`, from `examples/playground/src/demo/instrument-conformance.ts`).
 * Each case's capture is painted as plain DOM in an enrolled layer placed so the canvas centre (core's camera) is the
 * scene's vanishing point, and the scene (and each variant) becomes the layer's material. Every check kind is run:
 * - `contained`: at each t, parts on (casters off) against no objects; every changed pixel's centre inside some bounds;
 * - `exact` (within tolerance.exact) and `sampled` (within tolerance.sampled, the reference calibrated to Lite, 2D.5 and
 *   2D.10) at the device pixel floor(at · dpr);
 * - `unchanged`: identical pixels in every listed variant; `presence`: the share of part pixels a feature changes;
 * - `ratio`: mapped shadow against the map off; `relief`: the objects are stepped down and reported.
 * A check that needs a part of 2D that core does not draw yet (glass: core work item 4,
 * `docs/ui-library/instrument-phase2.md`) is run and recorded as
 * `pending` with the item it waits for, and is not asserted. Every other check is. The pass rate per check kind, the
 * worst deviations and every sample go to the `ui-instrument-conformance` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-instrument-conformance");
const suite = JSON.parse(await readFile(new URL("../../packages/ui/conformance/instrument-4.json", import.meta.url), "utf8"));
const healthy = /^Current content=drawable owning WebGPU canvas/;
const viewport = { width: 1920, height: 1080 };

/** A variant's dotted paths applied to a copy of a scene (the suite's `applyVariant`). */
function applyVariant(scene, variant) {
  const copy = structuredClone(scene);
  for (const [path, value] of Object.entries(variant?.set ?? {})) {
    const keys = path.split(".");
    let node = copy;
    for (const key of keys.slice(0, -1)) { if (typeof node[key] !== "object" || node[key] === null) node[key] = {}; node = node[key]; }
    node[keys.at(-1)] = structuredClone(value);
  }
  return copy;
}
const variantOf = (entry, name) => (!name || name === "base" ? entry.scene : applyVariant(entry.scene, entry.variants.find(variant => variant.name === name)));
const hex = value => [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16));
const deviation = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
/** Signed distance to a rounded box `[x, y, w, h]`, negative inside. */
function boxDistance(x, y, [left, top, width, height], radius = 0) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const qx = Math.abs(x - left - width / 2) - width / 2 + r, qy = Math.abs(y - top - height / 2) - height / 2 + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
const boundsOf = object => object.bounds ?? { rect: object.rect, radius: 0 };

/**
 * The core work item a check waits for, or undefined when core draws everything it needs: glass and the page (item 4).
 * Emitters and the guard's face factor (item 2), the shadow map and the post chain (item 3) are drawn.
 */
function pending(entry, check, sample) {
  const scene = variantOf(entry, check.variant);
  if (check.kind === "presence") {
    if (/dispersion|lens|window/.test(check.feature)) return "glass (core item 4)";
    return undefined;
  }
  if (sample?.source === "glass") return "glass (core item 4)";
  if (check.kind === "sampled") {
    const object = scene.objects.find(item => item.id === sample.object), part = object.parts[sample.part];
    if (part.glass) return "glass (core item 4)";
  }
  return undefined;
}

async function open(browser, dpr) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto("/instrument-conformance.html");
  await page.waitForFunction(() => window.instrumentConformance, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  return { context, page, errors };
}
/** The viewport as decoded pixels, with a sampler of layer-local device pixels. */
async function shot(page, origin, dpr, path) {
  const png = PNG.sync.read(await page.screenshot(path ? { path } : {}));
  const ox = Math.round(origin.x * dpr), oy = Math.round(origin.y * dpr);
  const at = (px, py) => { const offset = ((oy + py) * png.width + ox + px) * 4; return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]; };
  return { png, at, ox, oy };
}

for (const dpr of [1, 2]) {
  test(`core's instrument material against the Strata Rendering Model, version 4, on decoded GPU pixels, DPR ${dpr}`, async ({ browser }) => {
    test.setTimeout(600000);
    const { context, page, errors } = await open(browser, dpr);
    await mkdir(evidence, { recursive: true });
    const results = [];
    const record = (entry, check, extra) => { const result = { case: entry.name, kind: check.kind, variant: check.variant, ...extra }; results.push(result); return result; };
    const pixelOf = at => [Math.floor(at[0] * dpr), Math.floor(at[1] * dpr)];
    for (const entry of suite.cases) {
      const shown = await page.evaluate(([entry, scene]) => window.instrumentConformance.show(entry, scene), [entry, entry.scene]);
      expect(shown.mode, `${entry.name}: GPU presentation (${shown.reason})`).toBe("gpu");
      expect(shown.reason, `${entry.name}: no fallback`).toMatch(healthy);
      const shots = new Map();
      const render = async (name, scene, file) => {
        if (shots.has(name)) return shots.get(name);
        const state = await page.evaluate(scene => window.instrumentConformance.update(scene), scene);
        expect(state.mode, `${entry.name} ${name}: GPU presentation stays on (${state.reason})`).toBe("gpu");
        const value = { ...(await shot(page, state.origin, dpr, file ? `${evidence}/${entry.name}-${file}-dpr${dpr}.png` : undefined)), state };
        shots.set(name, value);
        return value;
      };
      const variant = name => render(name ?? "base", variantOf(entry, name), name ?? "base");
      const extent = entry.scene.extent, white = entry.scene.backdrop.toLowerCase() === "#ffffff";
      const compare = async (check, sample, expected, tolerance) => {
        const reason = pending(entry, check, sample);
        const inside = sample.at[0] >= 0 && sample.at[1] >= 0 && sample.at[0] <= extent.width && sample.at[1] <= extent.height;
        // Outside the extent the page shows under the outset; the suite renders over the backdrop (as objects-2's test).
        if (!inside && !white) return record(entry, check, { at: sample.at, note: sample.note, skipped: "the page shows through the outset" });
        const { at } = await variant(check.variant), [px, py] = pixelOf(sample.at), actual = at(px, py), d = deviation(actual, hex(expected));
        return record(entry, check, { at: sample.at, note: sample.note, source: sample.source, object: sample.object, expected, actual, deviation: d, pass: d <= tolerance, ...(reason ? { pending: reason } : {}) });
      };
      for (const check of entry.checks) {
        if (check.kind === "exact") for (const sample of check.samples) await compare(check, sample, sample.expect[String(dpr)], suite.tolerance.exact);
        if (check.kind === "sampled") for (const sample of check.samples) await compare(check, sample, sample.expect[String(dpr)], suite.tolerance.sampled);
        if (check.kind === "relief") {
          const { state } = await variant();
          for (const { id } of check.objects) {
            const reported = (state.layer?.steppedDown ?? []).find(item => item.object === id);
            record(entry, check, { object: id, reported: reported ?? null, pass: !!reported });
          }
          for (const sample of check.samples) await compare(check, sample, sample.expect[String(dpr)], suite.tolerance.exact);
        }
        if (check.kind === "contained") {
          // Parts on (every caster off, so face shadows do not count) against no objects at all.
          const base = variantOf(entry, check.variant), quiet = { ...base, objects: base.objects.map(object => ({ ...object, parts: object.parts.map(part => ({ ...part, caster: null })) })) };
          const empty = await render(`${check.variant ?? "base"}:empty`, { ...base, objects: [] });
          for (const t of check.t) {
            const posed = { ...quiet, objects: quiet.objects.map(object => (check.objects.includes(object.id) ? { ...object, t } : object)) };
            const on = await render(`${check.variant ?? "base"}:t${t}`, posed, `t${t}`);
            let changed = 0, outside = 0;
            const samples = [];
            for (let py = 0; py < Math.ceil(extent.height * dpr); py++) for (let px = 0; px < Math.ceil(extent.width * dpr); px++) {
              const a = on.at(px, py), b = empty.at(px, py);
              if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
              changed++;
              const x = (px + 0.5) / dpr, y = (py + 0.5) / dpr;
              if (posed.objects.every(object => boxDistance(x, y, boundsOf(object).rect, boundsOf(object).radius) > 0)) { outside++; if (samples.length < 10) samples.push([x, y]); }
            }
            record(entry, check, { t, changed, outside, outsideSamples: samples, pass: outside === 0 && changed > 0 });
          }
        }
        if (check.kind === "unchanged") {
          const renders = [];
          for (const name of check.variants) renders.push(await variant(name === "base" ? undefined : name));
          let compared = 0, differing = 0;
          for (const [x, y, w, h] of check.rects) for (let py = Math.ceil(y * dpr); py < Math.floor((y + h) * dpr); py++) for (let px = Math.ceil(x * dpr); px < Math.floor((x + w) * dpr); px++) {
            compared++;
            const first = renders[0].at(px, py);
            if (renders.some(item => deviation(item.at(px, py), first) > 0)) differing++;
          }
          record(entry, check, { variants: check.variants, compared, differing, pass: differing === 0 && compared > 0 });
        }
        if (check.kind === "presence") {
          const reason = pending(entry, check);
          const on = await variant(), off = await variant(check.variant), empty = await render("base:empty", { ...entry.scene, objects: [] });
          const object = entry.scene.objects.find(item => item.id === check.object), bounds = boundsOf(object);
          let parts = 0, changed = 0, outside = 0;
          // An emitter lights the face as well as the parts (2D.4), so turning it off changes the face outside the object's
          // bounds by design: for emitter light, the share on the parts is asserted and the face is recorded.
          const light = /emitter/.test(check.feature);
          for (let py = 0; py < Math.ceil(extent.height * dpr); py++) for (let px = 0; px < Math.ceil(extent.width * dpr); px++) {
            const x = (px + 0.5) / dpr, y = (py + 0.5) / dpr, a = on.at(px, py), b = off.at(px, py);
            if (boxDistance(x, y, bounds.rect, bounds.radius) > 0) { if (entry.scene.objects.every(item => boxDistance(x, y, boundsOf(item).rect, boundsOf(item).radius) > 0) && deviation(a, b) > 0) outside++; continue; }
            if (deviation(a, empty.at(px, py)) === 0) continue;
            parts++;
            if (deviation(a, b) >= check.levels) changed++;
          }
          const share = parts ? changed / parts : 0;
          record(entry, check, { feature: check.feature, parts, share: Math.round(share * 1000) / 1000, required: check.share, outside, pass: share >= check.share && (outside === 0 || light), ...(reason ? { pending: reason } : {}) });
        }
        if (check.kind === "ratio") {
          const reason = pending(entry, check), on = await variant(), off = await variant(check.variant);
          for (const sample of check.samples) {
            const [px, py] = pixelOf(sample.at), a = on.at(px, py), b = off.at(px, py);
            const pass = sample.shadowed ? a.every((value, index) => value <= check.ratio * b[index]) : deviation(a, b) <= check.lit;
            record(entry, check, { at: sample.at, shadowed: sample.shadowed, on: a, off: b, pass, ...(reason ? { pending: reason } : {}) });
          }
        }
      }
    }
    // The pass rate per check kind, asserted and pending apart, and the worst deviations.
    const kinds = {};
    for (const result of results) {
      if (result.skipped) { (kinds[result.kind] ??= { passed: 0, failed: 0, pending: 0, pendingPassed: 0, skipped: 0 }).skipped++; continue; }
      const kind = (kinds[result.kind] ??= { passed: 0, failed: 0, pending: 0, pendingPassed: 0, skipped: 0 });
      if (result.pending) { kind.pending++; if (result.pass) kind.pendingPassed++; } else if (result.pass) kind.passed++; else kind.failed++;
    }
    const worst = kind => results.filter(result => result.kind === kind && !result.skipped && result.deviation !== undefined).sort((a, b) => b.deviation - a.deviation).slice(0, 10);
    const summary = { dpr, kinds, worstSampled: worst("sampled"), worstExact: worst("exact"), failures: results.filter(result => !result.pending && !result.skipped && !result.pass) };
    await writeFile(`${evidence}/report-dpr${dpr}.json`, JSON.stringify({ tolerance: suite.tolerance, summary, results }, null, 2));
    console.log(`instrument-4 at DPR ${dpr}: ${JSON.stringify(kinds)}`);
    expect(errors, "no page errors").toEqual([]);
    expect(summary.failures, `checks core draws everything for must pass (report-dpr${dpr}.json)`).toEqual([]);
    await context.close();
  });
}
