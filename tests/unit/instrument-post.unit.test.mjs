/**
 * Unit tests for the Instrument post chain's pure parts (`packages/core/src/instrument-post.ts`, core work item 3 in
 * `docs/ui-library/instrument-phase2.md`): the flags and the map a scene resolves to, the map's depth window and its bias
 * in Lite's units, the glow a lens draws into the emitter target, the composite's rectangle, a placed part's world box
 * and what of the chain is structure. Pure data; `tests/browser/core-post.test.mjs` proves the decoded pixels.
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
const post = await import("../../packages/core/src/instrument-post.ts");
sourceImports.deregister();
const { postFlags, mapSettings, mapWindow, liteMapBias, partGlow, compositeRect, placedBox, postStructure, POST_DEFAULTS, MAP_DEFAULTS, INSTRUMENT_EXPOSURE, INSTRUMENT_CONTRAST } = post;

test("a scene's post flags take 2D.1's defaults: SMAA and bloom on, the options off", () => {
  assert.deepEqual(postFlags({}), { taa: false, contact: false, ssgi: false, smaa: true, bloom: true });
  assert.deepEqual(postFlags({ post: { smaa: false, taa: true } }), { taa: true, contact: false, ssgi: false, smaa: false, bloom: true });
  assert.deepEqual(POST_DEFAULTS, postFlags({ post: {} }));
});

test("the map takes 2D.7's defaults, and a darkness of 1 is no map", () => {
  assert.deepEqual(mapSettings({ shadow: { strength: 0.24 } }), { size: 4096, bias: 1.95, darkness: 0.1 });
  assert.deepEqual(mapSettings({ shadow: { strength: 0.24, map: { size: 2048 } } }), { size: 2048, bias: 1.95, darkness: 0.1 });
  assert.equal(mapSettings({ shadow: { strength: 0.24, map: { darkness: 1 } } }), null);
  assert.deepEqual(MAP_DEFAULTS, { size: 4096, bias: 1.95, darkness: 0.1 });
});

test("the depth window holds the stage and its bias converts world px to Lite's share of the window", () => {
  // 1920 × 1080: half-diagonal 1,101 px + 256 → 2,048, below the 4,096 floor.
  assert.equal(mapWindow({ width: 1920, height: 1080 }), 4096);
  assert.equal(mapWindow({ width: 1600, height: 900 }), 4096);
  // A stage whose half-diagonal passes 3,840 needs the next power of two.
  assert.equal(mapWindow({ width: 7000, height: 4000 }), 8192);
  // Lite offsets light-space depth by bias / 2 of a window 2 · R deep, so world px = bias · R.
  const R = mapWindow({ width: 1920, height: 1080 }), bias = liteMapBias(1.95, R);
  assert.ok(Math.abs(bias * R - 1.95) < 1e-12);
  assert.ok(Math.abs((bias / 2) * (2 * R) - 1.95) < 1e-12);
});

test("a lens glows in its material's emissive colour while its emitter gives light, and never without an emitter", () => {
  const materials = { lens: { emissive: { strength: 1, colour: "#ff8000" } }, dark: { base: { colour: "#202020" } } };
  const emitters = [{ position: [0, 0, 4], colour: [1, 0.6, 0.2], strength: 100, radius: 50 }, { position: [0, 0, 4], colour: [1, 1, 1], strength: 0, radius: 50 }];
  assert.equal(partGlow({ materials, emitters }, { material: "lens" }), undefined);
  const lit = partGlow({ materials, emitters }, { material: "lens", emitter: 0 });
  assert.equal(lit.lit, true);
  assert.deepEqual(lit.colour.map(value => Math.round(value * 255)), [255, 128, 0]);
  assert.equal(partGlow({ materials, emitters }, { material: "lens", emitter: 1 }).lit, false);
  // No emissive: the emitter's own colour; a stronger emissive clamps at 1.
  assert.deepEqual(partGlow({ materials, emitters }, { material: "dark", emitter: 0 }).colour, [1, 0.6, 0.2]);
  assert.deepEqual(partGlow({ materials: { hot: { emissive: { strength: 8, colour: "#808080" } } }, emitters }, { material: "hot", emitter: 0 }).colour.map(value => Math.round(value * 255)), [255, 255, 255]);
  // A colour of 0 gives no light.
  assert.equal(partGlow({ materials, emitters: [{ ...emitters[0], colour: [0, 0, 0] }] }, { material: "lens", emitter: 0 }).lit, false);
});

test("the composite covers the layer's box through its matrix, grown by 1 px and clamped to the canvas", () => {
  const stage = { width: 1920, height: 1080 };
  assert.deepEqual(compositeRect({ a: 1, b: 0, c: 0, d: 1, e: 100.4, f: 50 }, { width: 200, height: 100 }, stage), [99, 49, 302, 151]);
  assert.deepEqual(compositeRect({ a: 1, b: 0, c: 0, d: 1, e: -50, f: -20 }, { width: 200, height: 100 }, stage), [0, 0, 151, 81]);
  assert.equal(compositeRect({ a: 1, b: 0, c: 0, d: 1, e: 3000, f: 0 }, { width: 200, height: 100 }, stage), null);
  // A quarter turn: the box's corners bound it.
  const [x0, y0, x1, y1] = compositeRect({ a: 0, b: 1, c: -1, d: 0, e: 500, f: 500 }, { width: 200, height: 100 }, stage);
  assert.deepEqual([x0, y0, x1, y1], [399, 499, 501, 701]);
});

test("a placed part's world box bounds its corners through the placement", () => {
  const box = placedBox([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1], [-1, -2, 0], [1, 2, 5]);
  assert.deepEqual([...box], [9, 18, 30, 11, 22, 35]);
  // A quarter turn about z swaps the extents; a scale of 2 doubles them.
  const turned = placedBox([0, 2, 0, 0, -2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1], [-1, -2, 0], [1, 2, 5]);
  assert.deepEqual([...turned], [-4, -2, 0, 4, 2, 10]);
});

test("the chain's structure follows the flags, the map, its window and the lens kinds, not the order of the kinds", () => {
  const scene = { shadow: { strength: 0.24 }, post: undefined };
  const stage = { width: 1920, height: 1080 };
  const base = postStructure(scene, stage, ["b", "a"]);
  assert.equal(base, postStructure(scene, stage, ["a", "b"]));
  assert.notEqual(base, postStructure({ ...scene, post: { taa: true } }, stage, ["a", "b"]));
  assert.notEqual(base, postStructure({ ...scene, shadow: { strength: 0.24, map: { darkness: 1 } } }, stage, ["a", "b"]));
  assert.notEqual(base, postStructure(scene, { width: 7000, height: 4000 }, ["a", "b"]));
  assert.equal(base, postStructure(scene, { width: 1600, height: 900 }, ["a", "b"]));
  assert.notEqual(base, postStructure(scene, stage, ["a"]));
});

test("the output transform is the loader's and the Rendering Model's: exposure 0.8, contrast 1.2", () => {
  assert.equal(INSTRUMENT_EXPOSURE, 0.8);
  assert.equal(INSTRUMENT_CONTRAST, 1.2);
});
