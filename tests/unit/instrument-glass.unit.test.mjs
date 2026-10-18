/**
 * Unit tests for the Instrument level's glass and capture probe settings (`packages/core/src/instrument-glass.ts`,
 * `packages/core/src/capture-probe.ts`, Rendering Model 2D.5 and 2D.6, core work item 4): kind keys, the page cube's
 * settings, budget and refresh key, the glass constants and per-instance data, and the shaders' source. Pure data, no
 * browser; `tests/browser/core-glass.test.mjs` proves the decoded pixels. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, partKinds, partKindKey, instrumentStructure, STUDIO_DEFAULTS } = await import("../../packages/core/src/instrument.ts");
const glass = await import("../../packages/core/src/instrument-glass.ts");
const probe = await import("../../packages/core/src/capture-probe.ts");
sourceImports.deregister();

const lens = { type: "lathe", points: [[23, 0, 1, 0], [23, 2, 1, 0], [11, 18, 0.4, 0.9], [0, 22, 0, 1]], segments: 32 };
const window_ = { type: "prism", width: 100, length: 40, radius: 4, height: 2.4, chamfer: 2.2 };
function scene(overrides = {}) {
  return validateInstrumentScene({
    format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [200, 150] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 300 }, backdrop: "#e3e5e9", light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 },
    focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: { face: { base: { roughness: 1 } }, polished: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04 } },
      glass: { base: { roughness: 0.05 }, glass: { ior: 1.5, tint: "#d6ede6", absorption: 0.03, reflection: 1.5 }, dispersion: { strength: 0.2 } } },
    primitives: [{ face: "raised", rect: [0, 0, 400, 300], radius: 14, height: 6, material: "face" }],
    profiles: { lens, window: window_, stand: { type: "lathe", points: [[32, 0, 1, 0], [32, 2.5, 1, 0], [0, 2.5, 0, 1]], segments: 32 } },
    objects: [
      { id: "knob", rect: [40, 40, 100, 100], bounds: { rect: [40, 40, 100, 100], radius: 50 }, parts: [
        { kind: "skirt", profile: "stand", at: [90, 90, 0], material: "polished" },
        { kind: "lens", profile: "lens", at: [90, 90, 2.5], material: "glass", glass: "lens", stand: { radius: 32, colour: "#fafafb" }, caster: null }] },
      { id: "display", rect: [160, 40, 200, 60], bounds: { rect: [160, 40, 200, 60], radius: 8 }, t: 0.5, parts: [
        { kind: "window", profile: "window", at: [260, 70, 0], material: "glass", glass: "window", finish: { band: 0.4, horizon: 0.1 }, caster: null }] },
    ],
    ...overrides,
  });
}

test("glass parts are kinds of their own, keyed by their glass mode", () => {
  const s = scene();
  const kinds = partKinds(s);
  assert.deepEqual(kinds.map(kind => [kind.profile, kind.glass ?? null]), [["stand", null], ["lens", "lens"], ["window", "window"]]);
  assert.notEqual(partKindKey({ profile: "a", material: "m", glass: "lens" }), partKindKey({ profile: "a", material: "m" }));
  assert.notEqual(partKindKey({ profile: "a", material: "m", glass: "lens" }), partKindKey({ profile: "a", material: "m", glass: "window" }));
  // Adding a glass kind changes the structure (a mesh and a material); moving a glass part does not.
  const without = scene({ objects: s.objects.slice(0, 1).map(object => ({ ...object, parts: object.parts.slice(0, 1) })) });
  assert.notEqual(instrumentStructure(s), instrumentStructure(without));
});

test("the page cube's settings follow the model's defaults: on, 512, 300 px, a power of two", () => {
  assert.deepEqual(glass.pageSettings(scene()), { enabled: true, size: 512, height: 300 });
  assert.equal(glass.pageSettings(scene({ environment: { source: "studio", strength: 1, page: { enabled: false } } })).enabled, false);
  assert.deepEqual(glass.pageSettings({ environment: { source: "studio", strength: 1, page: { size: 700, height: 120 } } }), { enabled: true, size: 512, height: 120 });
  assert.equal(glass.pageSettings({ environment: { source: "studio", strength: 1, page: { size: 128 } } }).size, 128);
  assert.equal(glass.pageSettings({ environment: { source: "studio", strength: 1, page: { size: 1024 } } }).size, 1024);
});

test("a probe's memory and budget: 16.8 MB at 512 squared, four per stage", () => {
  assert.equal(probe.probeBytes(512), Array.from({ length: 10 }, (_, mip) => (512 >> mip) ** 2 * 8 * 6).reduce((a, b) => a + b, 0));
  assert.ok(Math.abs(probe.probeBytes(512) / 1e6 - 16.8) < 0.1);
  assert.equal(glass.INSTRUMENT_PROBES_PER_STAGE, 4);
});

test("a probe's placement key ignores sub-texel moves and its refreshes are throttled to 100 ms", () => {
  const m = { a: 1, b: 0, c: 0, d: 1, e: 40, f: 40 }, stage = { width: 1920, height: 1080 }, content = { pixelWidth: 800, pixelHeight: 600 }, extent = { width: 400, height: 300 };
  const quantum = glass.probeQuantum({ size: 512, height: 300 });
  assert.equal(quantum, (2 * 300 / 512) / 4, "a quarter of the cube's texel footprint on the face plane: 0.29 px");
  const key = (matrix = m, s = stage, c = content) => glass.probeKey(matrix, s, c, quantum, extent);
  assert.equal(key({ ...m }, { ...stage }, { ...content }), key(), "the same placement is the same key (poses, emitters and idle frames refresh nothing)");
  assert.equal(key({ ...m, e: 40 + quantum * 0.3 }), key(), "a move below a quarter texel keeps the key");
  // The bucket edge: the key rounds to the nearest multiple of the quantum, so the edge lies half a quantum from a multiple.
  const at = 40 / quantum, edge = (Math.floor(at) + 0.5) * quantum;
  assert.notEqual(key({ ...m, e: edge - quantum * 0.01 }), key({ ...m, e: edge + quantum * 0.01 }), "just below and just above a bucket edge are different keys");
  assert.equal(key({ ...m, e: edge + quantum * 0.01 }), key({ ...m, e: edge + quantum * 0.49 }), "and a whole bucket shares one");
  assert.notEqual(key({ ...m, e: 41 }), key(), "a move of a pixel");
  assert.notEqual(key({ ...m, a: 1.1, d: 1.1 }), key(), "a scale");
  assert.equal(key({ ...m, a: 1 + 1e-5 }), key(), "a scale change below a quarter texel across the layer");
  assert.notEqual(key(m, { width: 1600, height: 900 }), key(), "a resize");
  assert.notEqual(key(m, stage, { pixelWidth: 1600, pixelHeight: 1200 }), key(), "a DPR change");
  // Continuous movement: at most one refresh per interval, then one when it settles.
  let last = -Infinity, refreshes = 0;
  for (let frame = 0; frame < 60; frame++) { const now = frame * 17.5, { due } = glass.probeThrottle(now, last); if (due) { refreshes++; last = now; } }
  assert.ok(refreshes <= Math.floor(60 * 17.5 / glass.PROBE_REFRESH_INTERVAL_MS) + 1, `60 frames over 1.05 s: ${refreshes} refreshes`);
  assert.deepEqual(glass.probeThrottle(1100, 1000), { due: true, wait: 0 });
  assert.deepEqual(glass.probeThrottle(1030, 1000), { due: false, wait: 70 }, "the trailing refresh waits for the rest of the interval");
});

test("the glass constants hold the recipe, the studio and the light as the reference defines them", () => {
  const s = scene(), [g0, g1, g2, g3, g4] = glass.glassConstants(s, "glass", "lens");
  assert.deepEqual(g0, [1.5, 0.1 * 0.2, 0.03, 1.5], "ior, dispersion spread (0.1 per unit), absorption, reflection");
  assert.deepEqual(g1.map(v => Math.round(v * 255) / 255), [0xd6 / 255, 0xed / 255, 0xe6 / 255, 1], "a #rrggbb tint is its channels over 255, then the environment strength");
  assert.deepEqual(g2, [STUDIO_DEFAULTS.floor, STUDIO_DEFAULTS.ceiling, STUDIO_DEFAULTS.key, STUDIO_DEFAULTS.keyRadius]);
  assert.deepEqual(g3.slice(0, 3), [STUDIO_DEFAULTS.fill, STUDIO_DEFAULTS.front, STUDIO_DEFAULTS.strip]);
  assert.equal(g3[3], 1, "lens mode");
  assert.equal(glass.glassConstants(s, "glass", "window")[3][3], 0, "window mode");
  const a = (323 * Math.PI) / 180, e = (41 * Math.PI) / 180;
  assert.deepEqual(g4.slice(0, 3), [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)], "the light vector of 2.1 in layer axes");
  assert.deepEqual(glass.layerLight(s), g4.slice(0, 3));
  // Defaults when the recipe has no glass layer, and the studio tokens a scene overrides.
  const plain = scene({ environment: { source: "studio", strength: 0.5, studio: { key: 3 } } });
  const [d0, d1, d2] = glass.glassConstants(plain, "face", "window");
  assert.deepEqual(d0, [1.5, 0, 0.03, 1.5]);
  assert.deepEqual(d1, [0.84, 0.93, 0.9, 0.5]);
  assert.equal(d2[2], 3);
});

test("a glass instance carries its centre, stand and finish zone at the object's t", () => {
  const s = scene();
  const lensData = glass.glassInstance(s, 0, 1, s.profiles.lens);
  assert.deepEqual([...lensData.slice(0, 4)], [90, 90, 2.5, 32], "centre, base height and stand radius");
  assert.ok(Math.abs(lensData[4] - 0.955) < 0.01 && Math.abs(lensData[5] - 0.955) < 0.01 && Math.abs(lensData[6] - 0.955) < 0.01, "the stand's colour, linear");
  assert.equal(lensData[11], 1, "no finish on a lens (the default rect)");
  const windowData = glass.glassInstance(s, 1, 0, s.profiles.window);
  assert.deepEqual([...windowData.slice(0, 4)], [260, 70, 0, 0], "no stand");
  assert.deepEqual([...windowData.slice(8, 15)].map(v => Math.round(v * 100) / 100), [210, 50, 100, 40, 0.4, 0.1, 1], "the window's caster rect, its band and horizon, and the flag");
  // `finish: true` is the defaults; no finish is no zone.
  const defaults = scene({ objects: [{ ...s.objects[1], parts: [{ ...s.objects[1].parts[0], finish: true }] }] });
  assert.deepEqual([...glass.glassInstance(defaults, 0, 0, defaults.profiles.window).slice(12, 15)].map(v => Math.round(v * 100) / 100), [0.3, 0.25, 1]);
  const none = scene({ objects: [{ ...s.objects[1], parts: [{ ...s.objects[1].parts[0], finish: undefined }] }] });
  assert.equal(glass.glassInstance(none, 0, 0, none.profiles.window)[14], 0);
});

test("the glass and probe shaders are assembled from the pass's snippets", () => {
  const local = "fn layerLocal(position: vec2<f32>) -> vec2<f32> { return position; }\nfn insideClip(local: vec2<f32>) -> bool { return true; }";
  const main = glass.glassFragment(local, "main"), exact = glass.glassFragment(local, "exact");
  for (const source of [main, exact]) {
    assert.match(source, /fn studio\(/);
    assert.match(source, /fn windowExact\(/);
    assert.match(source, /fn filtered\(/, "the capture is sampled as the caps sample it");
    assert.doesNotMatch(source, /\$\{|undefined/, "no unsubstituted template text");
  }
  assert.match(main, /fn lens\(/);
  assert.match(exact, /if \(!windowExact\(s, p, input\.slot\)\) \{ discard; \}/, "the exact twin draws only where a window is exact");
  assert.match(glass.glassVertex, /out\.normal/);
  assert.match(glass.CAPTURE_WGSL, /fn premultipliedTexel/);
  assert.equal(glass.GLASS_VEC4S, 4);
  assert.deepEqual([...glass.INTERIOR], [0.015, 0.015, 0.018]);
});
