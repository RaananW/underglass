/**
 * Unit tests for the Instrument material cap (issue #173): core's validator accepts a scene naming up to
 * `INSTRUMENT_MATERIALS_CEILING` (64) materials and refuses more, keeping `INSTRUMENT_MATERIALS` (16) as the number a layer draws
 * with (the renderer steps a layer over it down, `tests/browser/core-instrument-materials.test.mjs`); the reference
 * implementation in `@underglass/ui/tokens` agrees with core. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import * as reference from "../../packages/ui/src/tokens/index.ts";

const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const core = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const scene = count => ({
  format: "strata-scene", version: 4, kind: "instrument",
  camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 0.8 },
  extent: { width: 400, height: 200 }, outset: { top: 8, right: 8, bottom: 8, left: 8 }, backdrop: "#e7e8ea",
  light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 },
  interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
  materials: { face: { base: { roughness: 0.6 } }, ...Object.fromEntries(Array.from({ length: count - 1 }, (_, index) => [`m${index}`, { base: { roughness: 0.5 } }])) },
  primitives: [{ face: "raised", rect: [0, 0, 400, 200], radius: 12, height: 6, material: "face" }], profiles: {}, objects: [],
});

test("the cap a layer draws with is 16 and the format refuses a scene past 64 materials, in core and in the reference", () => {
  for (const [name, validate, caps] of [["core", core.validateInstrumentScene, core], ["reference", reference.validateInstrumentScene, reference]]) {
    assert.equal(caps.INSTRUMENT_MATERIALS, 16, name);
    assert.equal(caps.INSTRUMENT_MATERIALS_CEILING, 64, name);
    for (const count of [16, 17, 64]) assert.equal(Object.keys(validate(scene(count)).materials).length, count, `${name}: ${count} materials are a valid scene`);
    assert.throws(() => validate(scene(65)), /materials holds more than 64 materials/, name);
  }
});

test("past the cap the Relief face binds only the materials its primitives use, so the stepped-down layer can be drawn", () => {
  const valid = core.validateInstrumentScene(scene(40));
  assert.deepEqual(Object.keys(core.instrumentFaceScene(valid, []).materials), ["face"]);
  // At or under the cap the face keeps every material, as before.
  assert.equal(Object.keys(core.instrumentFaceScene(core.validateInstrumentScene(scene(16)), []).materials).length, 16);
  // A scene whose primitives themselves use more than 16 is refused by the face's own rule.
  const wide = scene(20);
  wide.primitives = Object.keys(wide.materials).map(material => ({ face: "raised", rect: [0, 0, 40, 40], radius: 4, height: 4, material }));
  assert.throws(() => core.validateInstrumentScene(wide), /holds more than 16 materials/);
});
