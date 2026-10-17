/**
 * Unit tests for emitters (`packages/core/src/emitters.ts`, Rendering Model 2D.4, `docs/ui-library/instrument-phase2.md`
 * item 2): the scene fields on every level (version 4 only), the budget (64 per layer, the farthest by reach dropped),
 * the tile masks, the guard's bounds of the relief factor per protected rect, the packed emitter block and the cheap
 * `setEmitters` path (`withEmitters`). Pure data, no browser; `tests/browser/core-emitters.test.mjs` proves the decoded
 * pixels. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) {
      return next(specifier.replace(/\.js$/, ".ts"), context);
    }
    return next(specifier, context);
  },
});
const emitters = await import("../../packages/core/src/emitters.ts");
const { validateReliefScene, reliefUniforms, RELIEF_VEC4S, RELIEF_EMITTER_BASE, reliefWGSL } = await import("../../packages/core/src/relief.ts");
const { validateInstrumentScene, instrumentStructure } = await import("../../packages/core/src/instrument.ts");
const { validateMaterial, withEmitters } = await import("../../packages/core/src/effects.ts");
sourceImports.deregister();
const { selectEmitters, tileMasks, layerGuard, interiorBounds, packEmitters, reachMargin, validateLight, EMITTERS_PER_LAYER, EMITTER_BLOCK_VEC4S, EMITTER_TILES,
  EMITTER_LIGHTS, EMITTER_TILE_BASE, EMITTER_RECTS, EMITTER_CAPS, POOL_VEC4S, poolWGSL } = emitters;

const lamp = (x, y, overrides = {}) => ({ position: [x, y, 20], colour: [1, 0.72, 0.38], strength: 3200, radius: 168, ...overrides });
/** A version 4 relief scene: a raised face, a key on it, and the light fields. */
function relief(overrides = {}) {
  return {
    format: "strata-scene", version: 4, extent: { width: 400, height: 200 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#e7e8ea",
    light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 },
    interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 },
    focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: { face: { base: { roughness: 1 } }, satin: { base: { roughness: 0.5 } } },
    primitives: [{ face: "raised", rect: [0, 0, 400, 200], radius: 14, height: 6, material: "face" }, { face: "raised", rect: [300, 40, 60, 30], radius: 6, height: 4, material: "satin" }],
    emitters: [lamp(40, 40)], protected: [[70, 30, 80, 16]],
    ...overrides,
  };
}

test("version 4 carries emitters, protected rects and the feather at every level; earlier versions refuse them", () => {
  const scene = validateReliefScene(relief());
  assert.equal(scene.version, 4);
  assert.equal(scene.kind, "relief");
  assert.deepEqual(scene.emitters[0], { position: [40, 40, 20], colour: [1, 0.72, 0.38], strength: 3200, radius: 168, reach: "outset", face: 1 });
  assert.equal(scene.feather, 4, "the feather defaults to 4 px");
  assert.deepEqual(scene.protected, [[70, 30, 80, 16]]);
  // A version 1 scene refuses them; a version 4 relief scene without a camera is the relief material's, with one the objects material's.
  assert.throws(() => validateReliefScene({ ...relief(), version: 1 }), /emitters, protected and feather are only in version 4/);
  assert.throws(() => validateReliefScene(relief(), "objects"), /Objects material requires a version 2 or 3 strata-scene \(or version 4 with a camera\)/);
  const objects = validateReliefScene(relief({ camera: { distance: 2400, vanish: [200, 100] }, environment: { source: "studio", strength: 0.6 },
    primitives: [...relief().primitives, { object: "puck", rect: [20, 20, 40, 40], height: 6, colour: "#ffaa3c", material: "satin" }] }), "objects");
  assert.equal(objects.version, 4);
  assert.equal(objects.camera.distance, 2400);
  assert.equal(objects.emitters.length, 1);
  assert.throws(() => validateReliefScene(relief({ camera: { distance: 2400, vanish: [0, 0] } })), /Relief material requires a version 1 strata-scene \(or version 4 without a camera\)/);
  assert.throws(() => validateReliefScene(relief({ kind: "instrument" })), /kind requires "relief"/);
  // A version 4 relief scene with no emitters packs exactly as its version 1 equivalent.
  const plain = relief(); delete plain.emitters; delete plain.protected;
  const v1 = reliefUniforms(validateReliefScene({ ...plain, version: 1 })), v4 = reliefUniforms(validateReliefScene(plain));
  assert.deepEqual([...v4], [...v1]);
  assert.equal(v4.length, RELIEF_VEC4S * 4);
  assert.equal(RELIEF_VEC4S, RELIEF_EMITTER_BASE + EMITTER_BLOCK_VEC4S, "the emitter block closes the relief binding");
  assert.ok(RELIEF_VEC4S * 16 <= 65536, "the relief binding fits a 64 KB uniform binding");
  assert.ok(POOL_VEC4S * 16 <= 65536);
  // Precise errors.
  const cases = [
    [relief({ emitters: [lamp(0, 0, { colour: [2, 0, 0] })] }), /emitters\[0\].colour\[0\] requires a number in 0..1/],
    [relief({ emitters: [lamp(0, 0, { radius: 0 })] }), /emitters\[0\].radius requires a number/],
    [relief({ emitters: [lamp(0, 0, { reach: "stage" })] }), /emitters\[0\].reach requires one of outset, layer/],
    [relief({ emitters: [lamp(0, 0, { glow: 1 })] }), /emitters\[0\].glow is not a field/],
    [relief({ emitters: Array.from({ length: 1025 }, () => lamp(0, 0)) }), /emitters requires an array of at most 1024/],
    [relief({ feather: 17 }), /feather requires a number in 0..16/],
    [relief({ protected: [[0, 0, -1, 4]] }), /protected\[0\] requires \[x, y, width, height\]/],
    [relief({ protected: "box" }), /protected requires "extent" or an array/],
  ];
  for (const [value, expected] of cases) assert.throws(() => validateReliefScene(value), expected);
  // The format takes up to 1,024 emitters and 4,096 rects: the budget is the renderer's, never a validation error.
  assert.equal(validateReliefScene(relief({ emitters: Array.from({ length: 80 }, (_, index) => lamp(index * 4, 40)) })).emitters.length, 80);
  assert.equal(validateReliefScene(relief({ protected: Array.from({ length: 65 }, () => [0, 0, 4, 4]) })).protected.length, 65);
  assert.deepEqual(validateLight({}, "x"), {}, "a scene without the fields has none");
});

test("an Instrument scene's emitters field is part of its structure; the values are not", () => {
  const base = { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 200, height: 100 }, backdrop: "#e7e8ea", light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: { face: { base: { roughness: 1 } } }, primitives: [], profiles: { pin: { type: "prism", width: 4, length: 4, height: 2 } },
    objects: [{ id: "a", rect: [10, 10, 20, 20], parts: [{ kind: "pivot", profile: "pin", at: [20, 20, 0], material: "face" }] }] };
  const none = validateInstrumentScene(base), empty = validateInstrumentScene({ ...base, emitters: [] }), lit = validateInstrumentScene({ ...base, emitters: [lamp(20, 20)] });
  assert.notEqual(instrumentStructure(none), instrumentStructure(empty), "the clustered container is structure");
  assert.equal(instrumentStructure(empty), instrumentStructure(lit), "emitter values update in place");
  assert.equal(empty.feather, 4);
  // More than 64 emitters validate (the renderer's budget drops the rest).
  assert.equal(validateInstrumentScene({ ...base, emitters: Array.from({ length: 65 }, () => lamp(20, 20)) }).emitters.length, 65);
});

test("the budget keeps the 64 emitters with the most reach into the layer and reports the rest", () => {
  const rect = { x0: -48, y0: -48, x1: 448, y1: 248 };
  assert.equal(reachMargin(lamp(200, 100), rect), Math.sqrt(168 ** 2 - 400), "inside the rectangle the margin is the horizontal reach");
  assert.ok(Math.abs(reachMargin(lamp(600, 100), rect) - (Math.sqrt(168 ** 2 - 400) - 152)) < 1e-9);
  // 80 lamps in a row from inside to far outside, plus a dark one and one out of reach.
  const list = Array.from({ length: 80 }, (_, index) => lamp(300 + index * 3.5, 100));
  list.push(lamp(100, 100, { strength: 0 }), lamp(5000, 100));
  const result = selectEmitters(list, rect);
  assert.equal(result.total, 82);
  assert.equal(result.lit, 81);
  assert.equal(result.outOfReach, 1);
  assert.equal(result.drawn.length, EMITTERS_PER_LAYER);
  assert.equal(result.dropped.length, 16);
  assert.deepEqual(result.dropped.map(entry => entry.index), Array.from({ length: 16 }, (_, index) => 64 + index), "the farthest by reach are dropped, farthest last");
  assert.ok(result.dropped.every((entry, index) => index === 0 || entry.margin <= result.dropped[index - 1].margin));
  assert.deepEqual(result.drawn.map(entry => entry.index), Array.from({ length: 64 }, (_, index) => index), "the drawn keep scene order");
  // 64 draw, the 65th is dropped; ties keep scene order.
  const tie = Array.from({ length: 65 }, () => lamp(200, 100));
  assert.deepEqual(selectEmitters(tie, rect).dropped.map(entry => entry.index), [64]);
  assert.equal(selectEmitters(undefined, rect).drawn.length, 0);
});

test("tile masks bin each drawn emitter into the 16 × 9 tiles its reach meets", () => {
  const rect = { x0: 0, y0: 0, x1: 1600, y1: 900 };
  const drawn = [{ emitter: lamp(50, 50, { radius: 40, position: [50, 50, 0] }) }, { emitter: lamp(1550, 850, { radius: 30, position: [1550, 850, 0] }) }];
  for (let index = 2; index < 40; index++) drawn.push({ emitter: lamp(800, 450, { radius: 1e-3, position: [800, 450, 0] }) });
  const masks = tileMasks(drawn, rect);
  assert.equal(masks.length, EMITTER_TILES.x * EMITTER_TILES.y * 4);
  const tile = (x, y) => [...masks.subarray((y * 16 + x) * 4, (y * 16 + x) * 4 + 4)];
  assert.equal(tile(0, 0)[0] & 1, 1, "the corner lamp lights its tile");
  assert.equal(tile(1, 1)[0] & 1, 0, "and not a tile its reach misses");
  assert.equal(tile(15, 8)[0] & 2, 2);
  assert.equal(tile(8, 4)[2] & (1 << (39 - 32)), 1 << 7, "emitter 39 is bit 7 of the third mask");
  assert.ok(masks.every(value => value <= 0xffff));
});

test("the guard bounds the relief factor per protected rect and caps light and shadow so the product stays within interior.max", () => {
  const scene = validateReliefScene(relief({ protected: [[70, 30, 80, 16], [310, 45, 40, 20], [300, 160, 40, 20]] }));
  const m = scene.interior.max;
  // On the matte face (roughness 1) the factor is 1 unless a cast shadow can reach.
  const plain = interiorBounds(scene, { x0: 70, y0: 30, x1: 150, y1: 46 });
  assert.deepEqual(plain, [1, 1]);
  // On the satin key (roughness 0.5): +0.005.
  const key = interiorBounds(scene, { x0: 310, y0: 45, x1: 350, y1: 65 });
  assert.ok(Math.abs(key[1] - 1.005) < 1e-12);
  // Below the key, inside its shadow's reach: k may be as low as 1 − min(strength, m).
  const shaded = interiorBounds(scene, { x0: 300, y0: 70, x1: 340, y1: 90 });
  assert.ok(Math.abs(shaded[0] - (1 - m)) < 1e-12);
  const guard = layerGuard(scene, scene.protected);
  assert.equal(guard.rects.length, 3);
  assert.equal(guard.extent, false);
  assert.ok(Math.abs(guard.rects[0].light - m) < 1e-12, "plain face: light capped at m");
  assert.ok(Math.abs(guard.rects[0].shadow - m) < 1e-12, "and part shadows at m");
  assert.ok(Math.abs(guard.rects[1].light - ((1 + m) / 1.005 - 1)) < 1e-12);
  for (const { rect, light, shadow } of guard.rects) {
    const [low, high] = interiorBounds(scene, rect);
    assert.ok(high * (1 + light) <= 1 + m + 1e-12 && low * (1 - shadow) >= 1 - m - 1e-12, "k · (1 ± cap) within 1 ± m");
  }
  assert.equal(layerGuard(scene, scene.protected), guard, "cached per face scene and list");
  // More than 64 rects, or "extent": the whole box.
  const many = layerGuard(scene, Array.from({ length: 70 }, () => [0, 0, 4, 4]));
  assert.deepEqual([many.extent, many.overflow, many.rects.length], [true, 6, 1]);
  assert.deepEqual(many.rects[0].rect, { x0: 0, y0: 0, x1: 400, y1: 200 });
  assert.equal(layerGuard(scene, "extent").extent, true);
  assert.equal(layerGuard(scene, undefined).rects.length, 0);
});

test("the emitter block packs the drawn emitters, the guard and the tiles where the shaders read them", () => {
  const scene = validateReliefScene(relief({ emitters: [lamp(40, 40), lamp(200, 100, { reach: "layer", face: 0.3 })] }));
  const rect = { x0: -48, y0: -48, x1: 448, y1: 248 };
  const light = selectEmitters(scene.emitters, rect), guard = layerGuard(scene, scene.protected);
  const out = new Float32Array(RELIEF_VEC4S * 4).fill(7);
  packEmitters(out, RELIEF_EMITTER_BASE * 4, light, guard, rect, scene.feather, scene.interior.max, 0.5);
  const at = (vec4) => [...out.subarray((RELIEF_EMITTER_BASE + vec4) * 4, (RELIEF_EMITTER_BASE + vec4) * 4 + 4)];
  assert.deepEqual(at(0), [2, 4, 1, Math.fround(0.04)]);
  assert.deepEqual(at(1), [-48, -48, 31, Math.fround(296 / 9)]);
  assert.deepEqual(at(EMITTER_RECTS), [70, 30, 150, 46]);
  assert.deepEqual(at(EMITTER_CAPS).map(value => Math.round(value * 1e6) / 1e6), [0.04, 0.04, 0, 0]);
  assert.deepEqual(at(EMITTER_LIGHTS), [40, 40, 20, 168]);
  assert.deepEqual(at(EMITTER_LIGHTS + 1), [1600, Math.fround(1152), Math.fround(608), 1], "colour × strength × opacity, face share");
  assert.deepEqual(at(EMITTER_LIGHTS + 2), [200, 100, 20, -168], "a layer-reach emitter has a negative radius");
  assert.equal(at(EMITTER_LIGHTS + 3)[3], Math.fround(0.3));
  assert.ok(at(EMITTER_TILE_BASE).some(value => value > 0));
  assert.equal(out[(RELIEF_EMITTER_BASE - 1) * 4 + 3], 7, "nothing before the block is touched");
  // At opacity 0 nothing is drawn.
  packEmitters(out, RELIEF_EMITTER_BASE * 4, light, guard, rect, scene.feather, scene.interior.max, 0);
  assert.equal(at(0)[0], 0);
  // The shaders read the same block.
  assert.match(reliefWGSL, /fn reliefLamp/);
  assert.match(poolWGSL.fragment, /fn lampTile/);
});

test("setEmitters swaps a version 4 scene's emitters in place, validating only the list", () => {
  const policy = { bounds: "layer", interaction: "material", media: "identity", fallback: "static" };
  const material = validateMaterial({ ...policy, kind: "relief", scene: relief() });
  const scene = material.scene;
  const packed = reliefUniforms(scene);
  const next = withEmitters(material, [lamp(100, 100), lamp(120, 100, { reach: "layer" })]);
  assert.equal(next, material);
  assert.equal(next.scene, scene, "the same scene object: its caches stay");
  assert.equal(reliefUniforms(scene), packed, "no repack");
  assert.equal(scene.emitters.length, 2);
  assert.equal(scene.emitters[1].reach, "layer");
  assert.throws(() => withEmitters(material, [lamp(0, 0, { strength: -1 })]), /emitters\[0\].strength requires a number/);
  // A scene without the field gets a new validated scene.
  const bare = relief(); delete bare.emitters;
  const plain = validateMaterial({ ...policy, kind: "relief", scene: bare });
  const lit = withEmitters(plain, [lamp(1, 1)]);
  assert.notEqual(lit.scene, plain.scene);
  assert.equal(lit.scene.emitters.length, 1);
  // Version 1 scenes and other materials refuse it.
  const v1 = { ...bare, version: 1 }; delete v1.protected;
  assert.throws(() => withEmitters(validateMaterial({ ...policy, kind: "relief", scene: v1 }), []), /setEmitters requires a version 4/);
});
