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
const { selectEmitters, tileMasks, layerGuard, interiorBounds, packEmitters, reachMargin, validateLight, shadowScales, castHeight, EMITTERS_PER_LAYER, EMITTER_BLOCK_VEC4S, EMITTER_TILES,
  EMITTER_LIGHTS, EMITTER_TILE_BASE, EMITTER_RECTS, EMITTER_CAPS, EMITTER_EXTENT, EMITTER_CELLS, POOL_VEC4S, poolWGSL } = emitters;

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
  // Text inside the key: the key's own shadow does not fall on it, and the face's drop shadow never falls inside the face.
  assert.equal(key[0], 1);
  // More than 64 rects, or "extent": the whole box, as 16 × 9 cells with caps of their own.
  const many = layerGuard(scene, Array.from({ length: 70 }, () => [0, 0, 4, 4]));
  assert.deepEqual([many.extent, many.overflow, many.rects.length, many.cells.length], [true, 6, 0, 144]);
  assert.equal(layerGuard(scene, "extent").extent, true);
  assert.equal(layerGuard(scene, undefined).rects.length, 0);
});

test("the guard bounds offsets by the largest stack, shadows by where they fall, and a protected box per cell", () => {
  const key = (x, y, extra = {}) => ({ face: "raised", rect: [x, y, 60, 30], radius: 6, height: 4, material: "satin", ...extra });
  const face = { face: "raised", rect: [0, 0, 400, 200], radius: 14, height: 6, material: "face" };
  // Two keys side by side: a rect over both is bounded by one key's offset, not their sum (the review's case: 1.01).
  const two = validateReliefScene(relief({ primitives: [face, key(40, 40), key(120, 40)], protected: [[50, 45, 120, 20]] }));
  assert.ok(Math.abs(interiorBounds(two, { x0: 50, y0: 45, x1: 170, y1: 65 })[1] - 1.005) < 1e-12, "two separate keys: k_hi 1.005");
  // A key on a satin plate: there the offsets may stack (the plate's beneath the key's edge).
  const stacked = validateReliefScene(relief({ primitives: [face, key(30, 30, { rect: [30, 30, 200, 100], radius: 10 }), key(60, 60)], protected: [[70, 65, 30, 10]] }));
  assert.deepEqual(interiorBounds(stacked, { x0: 70, y0: 65, x1: 100, y1: 75 }).map(value => Math.round(value * 1e6) / 1e6), [1, 1.005], "wholly inside the key: its offset replaces the plate's");
  assert.deepEqual(interiorBounds(stacked, { x0: 50, y0: 65, x1: 70, y1: 75 }).map(value => Math.round(value * 1e6) / 1e6), [0.96, 1.01], "across the key's edge: key and plate stack, and the key's shadow falls there");
  // A caster near a rect but not touching it still counts: its shadow reaches past its own box (second review).
  const single = validateReliefScene(relief({ primitives: [face, key(40, 40)] }));
  for (const [y0, expected] of [[70, [0.96, 1.005]], [72, [0.96, 1]], [75, [0.96, 1]], [90, [1, 1]]]) {
    assert.deepEqual(interiorBounds(single, { x0: 50, y0, x1: 90, y1: y0 + 10 }).map(value => Math.round(value * 1e6) / 1e6), expected, `a rect at y ${y0} below the key (its bottom at 70)`);
  }
  const square = validateReliefScene(relief({ primitives: [face, { face: "raised", rect: [100, 50, 40, 40], radius: 4, height: 4, material: "satin" }] }));
  assert.deepEqual(interiorBounds(square, { x0: 146, y0: 96, x1: 160, y1: 104 }).map(value => Math.round(value * 1e6) / 1e6), [0.96, 1], "the review's rect beside a raised key, in its shadow");
  // "extent" on one rounded raised face (the review's case: shadow cap 0): every cell keeps the full caps.
  const lone = validateReliefScene(relief({ primitives: [face], protected: "extent" }));
  const loneGuard = layerGuard(lone, "extent");
  assert.ok(loneGuard.cells.every(cell => Math.abs(cell.light - 0.04) < 1e-12 && Math.abs(cell.shadow - 0.04) < 1e-12), "a lone face: every cell keeps light and shadow caps of m");
  // Ten satin keys with "extent" (the review's case: light cap 0): no cell loses more than one key's offset.
  const ten = validateReliefScene(relief({ primitives: [face, ...Array.from({ length: 10 }, (_, index) => key(10 + (index % 5) * 76, 20 + Math.floor(index / 5) * 80))], protected: "extent" }));
  const tenGuard = layerGuard(ten, "extent");
  const lightest = Math.min(...tenGuard.cells.map(cell => cell.light)), darkest = Math.min(...tenGuard.cells.map(cell => cell.shadow));
  assert.ok(Math.abs(lightest - ((1.04 / 1.005) - 1)) < 1e-12, `ten keys: the smallest light cap is one key's (${lightest})`);
  assert.ok(darkest === 0, "cells inside a key's shadow on the face lose the shadow cap");
  assert.ok(tenGuard.cells.slice(7 * 16).every(cell => cell.shadow > 0 && Math.abs(cell.light - 0.04) < 1e-12), "cells clear of every key and its shadow keep both caps");
  assert.equal(tenGuard.cells.filter(cell => cell.shadow === 0).length, 91, "91 of 144 cells lie where a key's shadow may fall");
  // Overlapping protected rects keep their own caps; the shader applies the lower of the two where they overlap.
  const overlapping = layerGuard(validateReliefScene(relief({ primitives: [face, key(300, 40)], protected: [[290, 30, 40, 20], [310, 45, 40, 20]] })), [[290, 30, 40, 20], [310, 45, 40, 20]]);
  assert.deepEqual(overlapping.rects.map(({ light, shadow }) => [Math.round(light * 1e6) / 1e6, Math.round(shadow * 1e6) / 1e6]), [[0.034826, 0], [0.034826, 0.04]],
    "the first rect reaches past the key into its shadow; the second lies inside the key");
});

test("the guard uses the cast height the relief pass packs, in every state", () => {
  const state = { state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 } };
  const raised = (extra = {}) => ({ face: "raised", rect: [0, 0, 10, 10], height: 10, material: "x", ...extra });
  const key = (extra = {}) => ({ object: "key", rect: [0, 0, 10, 10], height: 10, travel: 2, material: "x", ...extra });
  assert.deepEqual([castHeight(state, raised()), castHeight(state, raised({ state: { hover: true } })), castHeight(state, raised({ state: { pressed: true } }))], [10, 16, 2.5]);
  assert.deepEqual([castHeight(state, key({ state: { pressed: true } })), castHeight(state, key({ state: { hover: true } })), castHeight(state, { object: "slab", rect: [0, 0, 10, 10], height: 10, material: "x", state: { pressed: true } })], [8, 12.5, 2.5],
    "a pressed key casts its height less its travel (8), not the press multiplier (2.5)");
  assert.equal(castHeight(state, raised({ state: { disabled: true } })), 0);
  assert.equal(castHeight(state, { face: "well", rect: [0, 0, 10, 10], height: 10, material: "x" }), 0);
});

test("each object's face shadow takes its share of a guarded area's shadow cap", () => {
  const areas = [{ rect: { x0: 0, y0: 0, x1: 100, y1: 20 }, light: 0.04, shadow: 0.04 }, { rect: { x0: 300, y0: 0, x1: 400, y1: 20 }, light: 0.04, shadow: 0 }];
  // Two objects reach the first area, none the second; one casts nothing.
  const reaches = new Float64Array([10, 10, 40, 40, 60, 5, 90, 30, 200, 200, 200, 200]);
  const [first, second] = shadowScales(areas, reaches, 3, 4, 0.24);
  const each = 1 - (1 - 0.04) ** (1 / 2);
  assert.ok(Math.abs(first - each / 0.24) < 1e-12);
  assert.ok((1 - first * 0.24) ** 2 >= 1 - 0.04 - 1e-12, "together within the cap");
  assert.equal(second, 0, "a cap of 0 takes every shadow there");
  assert.deepEqual(shadowScales([{ rect: areas[0].rect, light: 0.04, shadow: 0.5 }], reaches, 3, 4, 0.24), [1], "a cap above the strength leaves shadows whole");
});

test("the emitter block packs the drawn emitters, the guard and the tiles where the shaders read them", () => {
  const scene = validateReliefScene(relief({ emitters: [lamp(40, 40), lamp(200, 100, { reach: "layer", face: 0.3 })] }));
  const rect = { x0: -48, y0: -48, x1: 448, y1: 248 };
  const light = selectEmitters(scene.emitters, rect), guard = layerGuard(scene, scene.protected);
  const out = new Float32Array(RELIEF_VEC4S * 4).fill(7);
  const beneath = { rects: [{ x0: -40, y0: 10, x1: -2, y1: 24 }], overflow: false };
  packEmitters(out, RELIEF_EMITTER_BASE * 4, light, guard, beneath, rect, scene.extent, scene.feather, scene.interior.max);
  const at = (vec4) => [...out.subarray((RELIEF_EMITTER_BASE + vec4) * 4, (RELIEF_EMITTER_BASE + vec4) * 4 + 4)];
  assert.deepEqual(at(0), [2, 4, 2, Math.fround(0.04)], "two rects: the layer's own and the text beneath its outset");
  assert.deepEqual(at(1), [-48, -48, 31, Math.fround(296 / 9)]);
  assert.deepEqual(at(EMITTER_EXTENT), [0, 400, 200, 0]);
  assert.deepEqual(at(EMITTER_RECTS), [70, 30, 150, 46]);
  assert.deepEqual(at(EMITTER_CAPS).map(value => Math.round(value * 1e6) / 1e6), [0.04, 0.04, 0, 0]);
  assert.deepEqual(at(EMITTER_RECTS + 1), [-40, 10, -2, 24]);
  assert.deepEqual(at(EMITTER_CAPS + 1), [0, 0, 0, 0], "no light on a lower layer's text");
  assert.deepEqual(at(EMITTER_LIGHTS), [40, 40, 20, 168]);
  assert.deepEqual(at(EMITTER_LIGHTS + 1), [3200, Math.fround(2304), Math.fround(1216), 1], "colour × strength (the pool scales by opacity), face share");
  assert.deepEqual(at(EMITTER_LIGHTS + 2), [200, 100, 20, -168], "a layer-reach emitter has a negative radius");
  assert.equal(at(EMITTER_LIGHTS + 3)[3], Math.fround(0.3));
  assert.ok(at(EMITTER_TILE_BASE).some(value => value > 0));
  assert.equal(out[(RELIEF_EMITTER_BASE - 1) * 4 + 3], 7, "nothing before the block is touched");
  // A protected box: the cells' caps; text beneath that overflows protects the whole outset.
  const boxed = layerGuard(scene, "extent");
  packEmitters(out, RELIEF_EMITTER_BASE * 4, light, boxed, { rects: [], overflow: true }, rect, scene.extent, scene.feather, scene.interior.max);
  assert.deepEqual(at(EMITTER_EXTENT), [1, 400, 200, 1]);
  assert.equal(Math.round(at(EMITTER_CELLS)[0] * 1e6) / 1e6, 0.04);
  // Lower layers' text that does not fit is merged into its bounding box; with no room at all, the outset is dark.
  const many = { rects: Array.from({ length: 63 }, (_, index) => [index, 0, 1, 1]), extent: false, overflow: 0, cells: null };
  const crowded = { ...many, rects: many.rects.map(([x, y, w, h]) => ({ rect: { x0: x, y0: y, x1: x + w, y1: y + h }, light: 0.04, shadow: 0.04 })) };
  const lower = { rects: [{ x0: -40, y0: 0, x1: -30, y1: 10 }, { x0: -20, y0: 50, x1: -10, y1: 60 }], overflow: false };
  assert.deepEqual(packEmitters(out, RELIEF_EMITTER_BASE * 4, light, crowded, lower, rect, scene.extent, scene.feather, scene.interior.max), { beneath: 2, merged: true, overflow: false });
  assert.equal(at(0)[2], 64, "63 own rects and one merged");
  assert.deepEqual(at(EMITTER_RECTS + 63), [-40, 0, -10, 60]);
  const full = { ...crowded, rects: [...crowded.rects, crowded.rects[0]] };
  assert.deepEqual(packEmitters(out, RELIEF_EMITTER_BASE * 4, light, full, lower, rect, scene.extent, scene.feather, scene.interior.max), { beneath: 2, merged: false, overflow: true });
  assert.equal(at(0)[2], 64);
  assert.equal(at(EMITTER_EXTENT)[3], 1, "no room: the outset is dark");
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
