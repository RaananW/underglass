/**
 * Unit tests for layer materials in `packages/core/src/effects.ts` and `composition.ts`: validation, uniform
 * packing, the per-layer uniform layout and the generated shader's contrast guard. Pure data checks, no
 * browser; `tests/browser/material.test.mjs` proves the decoded pixels. Run with `npm run test:unit`.
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
const { defineEffect, validateMaterial, materialUniforms, MATERIAL_INTERIOR_CEILING } = await import("../../packages/core/src/effects.ts");
const { layerShader, passShaders, drawRectangle } = await import("../../packages/core/src/composition.ts");
const { reliefDegraded, reliefUniforms, validateReliefScene, RELIEF_VEC4S } = await import("../../packages/core/src/relief.ts");
const { LAYER_PASS_FLOATS } = await import("../../packages/core/src/compiled.ts");
sourceImports.deregister();

const definition = defineEffect({ name: "unit-material", parameters: { strength: { min: -1, max: 1 }, tint: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"], wgsl: "return color * (1.0 + parameters.x);" });
const material = { kind: "custom", definition, parameters: { tint: 0.5, strength: 0.25 }, interior: { max: 0.04 },
  bounds: "layer", interaction: "material", media: "identity", fallback: "static" };

test("a material validates its policy, schema and interior budget without mutating input", () => {
  const original = JSON.stringify(material);
  const valid = validateMaterial(material);
  assert.equal(JSON.stringify(material), original);
  assert.deepEqual(Object.keys(valid.parameters), ["strength", "tint"], "schema order");
  assert.equal(MATERIAL_INTERIOR_CEILING, 0.1);
  for (const bad of [{ ...material, interaction: "decorative" }, { ...material, interaction: "inert" }, { ...material, bounds: "expand" },
    { ...material, kind: "ripple" }, { ...material, definition: { ...definition } }, { ...material, parameters: { strength: 0 } },
    { ...material, parameters: { strength: 2, tint: 0 } }, { ...material, interior: { max: 0.11 } }, { ...material, interior: { max: -0.01 } },
    { ...material, interior: undefined }]) assert.throws(() => validateMaterial(bad));
});

test("a material packs into two vec4s: control (code, budget, slot) and parameters", () => {
  assert.deepEqual([...materialUniforms(undefined, 0)], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...materialUniforms(validateMaterial(material), 0)].map(value => Math.round(value * 1e6) / 1e6), [1, 0.04, 0, 0, 0.25, 0.5, 0, 0]);
  assert.equal(materialUniforms(validateMaterial(material), -1)[2], -1);
});

test("the per-layer block has 14 vec4s: the material after the clip, then the projective row", () => {
  assert.equal(LAYER_PASS_FLOATS, 12 + 56 + 4);
  const shader = layerShader(undefined, undefined, definition);
  assert.equal(shader.bindings.at(-1).uniformByteLength, LAYER_PASS_FLOATS * 4);
  assert.match(shader.fragmentWGSL, /array<vec4f, 18>/);
  // Header 3 vec4s, then the block: the material control is block vec4 11, its parameters vec4 12.
  assert.match(shader.fragmentWGSL, /let materialControl = state\[14\];/);
  assert.match(shader.fragmentWGSL, /material0\(vec4f\(0\.5, 0\.5, 0\.5, 1\.0\), local, extent, 0\.0, state\[15\]\)/);
});

test("the shader's guard takes one factor from a neutral input, within the budget and the hard ceiling", () => {
  const { fragmentWGSL } = layerShader(undefined, undefined, definition);
  assert.match(fragmentWGSL, /fn material0\(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f\) -> vec4f \{ return color \* \(1\.0 \+ parameters\.x\); \}/);
  assert.match(fragmentWGSL, /let budget = min\(materialControl\.y, 0\.10\);/);
  assert.match(fragmentWGSL, /let factor = clamp\(2\.0 \* dot\(lit\.rgb, vec3f\(0\.2126, 0\.7152, 0\.0722\)\), 1\.0 - budget, 1\.0 \+ budget\);/);
  // The captured sample is only ever scaled by that factor; it is never passed to the material.
  assert.match(fragmentWGSL, /sample = vec4f\(min\(sample\.rgb \* factor, vec3f\(1\.0\)\), sample\.a\);/);
  assert.doesNotMatch(fragmentWGSL, /material0\(sample/);
  // The material runs before the effect chain's colour operations.
  assert.ok(fragmentWGSL.indexOf("materialControl") < fragmentWGSL.indexOf("control.x == 3.0"));
  // Without a material definition the pass carries no material code at all.
  assert.doesNotMatch(layerShader().fragmentWGSL, /materialControl/);
});

test("a pass's custom definitions are interned, so equal pairs compare by identity", () => {
  const effect = defineEffect({ ...definition, name: "unit-effect" });
  assert.equal(passShaders(), undefined);
  assert.equal(passShaders(effect, definition), passShaders(effect, definition));
  assert.notEqual(passShaders(effect, definition), passShaders(effect));
  assert.deepEqual(passShaders(undefined, definition), { effect: undefined, displacement: undefined, material: definition, relief: false });
  const both = layerShader(effect, undefined, definition).fragmentWGSL;
  assert.match(both, /fn custom0\(/);
  assert.match(both, /fn material0\(/);
});

// The built-in relief material takes the Strata scene format, so every conformance scene must pass core's check.
test("core's relief material accepts every conformance scene and refuses broken ones by path", async () => {
  const { readFileSync } = await import("node:fs");
  const suite = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/relief-1.json", import.meta.url), "utf8"));
  const relief = { kind: "relief", bounds: "layer", interaction: "material", media: "identity", fallback: "static" };
  for (const entry of suite.cases) {
    const valid = validateMaterial({ ...relief, scene: entry.scene });
    assert.equal(valid.scene.primitives.length, entry.scene.primitives.length, entry.name);
  }
  const scene = suite.cases.find(entry => entry.name === "ring").scene;
  const broken = (change, pattern) => { const copy = structuredClone(scene); change(copy); assert.throws(() => validateMaterial({ ...relief, scene: copy }), pattern); };
  broken(copy => { copy.version = 2; }, /version 1 strata-scene/);
  broken(copy => { copy.interior.max = 0.2; }, /interior\.max/);
  broken(copy => { copy.bevel.profile = "ogee"; }, /bevel\.profile/);
  broken(copy => { copy.primitives[0].face = "bump"; }, /primitives\[0\]\.face/);
  broken(copy => { copy.primitives[0].material = "chrome"; }, /primitives\[0\]\.material/);
  broken(copy => { delete copy.primitives[1].ring; }, /primitives\[1\]\.ring/);
  broken(copy => { copy.primitives[0].ring = copy.primitives[1].ring; }, /only for the ring face/);
  broken(copy => { copy.primitives = Array.from({ length: 257 }, () => copy.primitives[0]); }, /at most 256/);
  broken(copy => { for (let index = 0; index < 17; index++) copy.materials[`m${index}`] = {}; }, /more than 16 materials/);
  assert.deepEqual([...materialUniforms(validateMaterial({ ...relief, scene }), -1)].slice(0, 2).map(value => Math.round(value * 1e6) / 1e6), [2, 0.04]);
});

test("the relief binding packs derived values per primitive, and relief passes add binding 3", async () => {
  const { readFileSync } = await import("node:fs");
  const suite = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/relief-1.json", import.meta.url), "utf8"));
  const scene = validateReliefScene(suite.cases.find(entry => entry.name === "button-states").scene);
  const values = reliefUniforms(scene);
  assert.equal(values.length, RELIEF_VEC4S * 4);
  assert.ok(RELIEF_VEC4S * 16 <= 65536, "fits WebGPU's guaranteed uniform binding size");
  assert.equal(reliefUniforms(scene), values, "packed once per scene object");
  const primitive = index => [...values.slice((6 + 16 * 2 + index * 6) * 4, (6 + 16 * 2 + (index + 1) * 6) * 4)].map(value => Math.round(value * 1e4) / 1e4);
  // Header: light vector, then bevel width 6, gain 0.55, quarter-round, strength 0.24, interior 0.04, counts.
  assert.deepEqual([...values.slice(3, 8)].map(value => Math.round(value * 1e4) / 1e4), [6, 0.55, 0, 0.24, 0.04]);
  assert.deepEqual([...values.slice(17, 19)], [5, 7]);
  // The hovered button (index 2): band 6, cast height 3 × 1.6; the pressed one 3 × 0.25; the disabled one nothing.
  assert.deepEqual(primitive(2).slice(4, 12), [8, 6, 4.8, 0, 1, 0, 0, 0]);
  assert.deepEqual(primitive(3).slice(5, 7), [6, 0.75]);
  assert.deepEqual(primitive(4).slice(5, 12), [0, 0, 0, 0, 0, 0, 1]);
  const shader = layerShader(undefined, undefined, "relief");
  assert.deepEqual(shader.bindings.at(-1), { binding: 3, kind: "uniform", uniformByteLength: RELIEF_VEC4S * 16, visibility: 2 });
  assert.match(shader.fragmentWGSL, /fn reliefShade\(p: vec2f, captured: vec4f\) -> vec4f/);
  assert.match(shader.fragmentWGSL, /if \(state\[14\]\.x == 2\.0\) \{ sample = reliefShade\(local, vec4f\(sample\.rgb, sample\.a \* coverage \/ drawCoverage\)\); \}/);
  // The drawn rectangle (block vec4 12) extends coverage into the shadow outset, and the pass emits with it.
  assert.match(shader.fragmentWGSL, /let draw = state\[15\];/);
  assert.match(shader.fragmentWGSL, /\* compiledOpacity \* drawCoverage\);/);
  assert.doesNotMatch(layerShader().fragmentWGSL, /let draw = /);
  assert.equal(passShaders(undefined, "relief"), passShaders(undefined, "relief"));
  assert.deepEqual(passShaders(undefined, "relief"), { effect: undefined, displacement: undefined, material: undefined, relief: true });
});

test("a relief outset grows the drawn rectangle only on sides the clip does not cut", () => {
  const extent = { width: 200, height: 120 }, outset = { top: 10, right: 20, bottom: 30, left: 40 };
  // Unclipped: every side grows; hits keep the clip.
  assert.deepEqual(drawRectangle({ x: 0, y: 0, width: 200, height: 120 }, extent, outset), { x0: -40, y0: -10, x1: 220, y1: 150 });
  // Without an outset (any non-relief layer) the rectangle is the clipped box, exactly as before.
  assert.deepEqual(drawRectangle({ x: 0, y: 0, width: 200, height: 120 }, extent), { x0: 0, y0: 0, x1: 200, y1: 120 });
  // A viewport cutting the left and bottom sides: those stay cut, the others grow.
  assert.deepEqual(drawRectangle({ x: 30, y: -5, width: 400, height: 90 }, extent, outset), { x0: 30, y0: -10, x1: 220, y1: 85 });
});

// The objects material takes version 2 scenes: every Objects conformance scene must pass core's check.
test("core's objects material accepts every Objects conformance scene, packs objects and reports Relief equivalents", async () => {
  const { readFileSync } = await import("node:fs");
  const suite = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/objects-2.json", import.meta.url), "utf8"));
  const objects = { kind: "objects", bounds: "layer", interaction: "material", media: "identity", fallback: "static" };
  for (const entry of suite.cases) {
    const valid = validateMaterial({ ...objects, scene: entry.scene });
    assert.equal(valid.scene.primitives.length, entry.scene.primitives.length, entry.name);
    assert.deepEqual(reliefDegraded(valid.scene).map(item => item.index), entry.name === "relief-equivalents" ? [1, 2] : [], entry.name);
  }
  const scene = suite.cases.find(entry => entry.name === "switch").scene;
  const broken = (change, pattern) => { const copy = structuredClone(scene); change(copy); assert.throws(() => validateMaterial({ ...objects, scene: copy }), pattern); };
  broken(copy => { copy.version = 1; }, /version 2 or 3 strata-scene/);
  broken(copy => { delete copy.camera; }, /camera/);
  broken(copy => { copy.primitives[2].object = "lever"; }, /primitives\[2\]\.object/);
  broken(copy => { delete copy.primitives[2].colour; }, /primitives\[2\]\.colour/);
  broken(copy => { copy.primitives[1].travel = 2; }, /travel is only for keys and marks/);
  // A relief material refuses objects; an objects material refuses version 1.
  assert.throws(() => validateMaterial({ ...objects, kind: "relief", scene: { ...scene, version: 1, camera: undefined, environment: undefined } }), /version 2 or 3 scene/);
  assert.deepEqual([...materialUniforms(validateMaterial({ ...objects, scene }), -1)].slice(0, 2).map(value => Math.round(value * 1e6) / 1e6), [2, 0.04]);

  // Packing: the camera and environment in the header; the well a solid (code 7) with its heights; the knob a dome (9).
  const values = reliefUniforms(validateReliefScene(scene, 2));
  assert.deepEqual([...values.slice(20, 24)].map(value => Math.round(value * 1e4) / 1e4), [1600, -100, 32, 0.6]);
  const entry = index => [...values.slice((6 + 16 * 2 + index * 6) * 4, (6 + 16 * 2 + (index + 1) * 6) * 4)].map(value => Math.round(value * 1e4) / 1e4);
  assert.deepEqual(entry(1).slice(4, 8), [14, 2, 0, 7]);
  assert.deepEqual(entry(1).slice(14, 16), [8, 5]);
  assert.deepEqual(entry(2).slice(4, 8), [12, 12, 10, 9]);
  assert.deepEqual(entry(2).slice(14, 16), [5, 15]);
  // The Relief equivalents: the knob packs as a relief knob (face 3) keeping its colour (flag 2); the key as raised.
  const fallback = suite.cases.find(item => item.name === "relief-equivalents").scene;
  const packed = reliefUniforms(validateReliefScene(fallback, 2));
  const at = index => [...packed.slice((6 + 16 * 2 + index * 6) * 4, (6 + 16 * 2 + (index + 1) * 6) * 4)];
  assert.equal(at(1)[7], 3);
  assert.equal(at(1)[23], 2);
  assert.equal(at(2)[7], 0);
  assert.ok(RELIEF_VEC4S * 16 <= 65536);
});

// The stage material takes version 3 stage scenes; objects scenes of version 3 may carry an environment map.
test("core's stage material accepts every stage scene of the Scene suite, and objects pack environment maps", async () => {
  const { readFileSync } = await import("node:fs");
  const { STAGE_VEC4S } = await import("../../packages/core/src/stage.ts");
  const suite = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/scene-3.json", import.meta.url), "utf8"));
  const policy = { bounds: "layer", interaction: "material", media: "identity", fallback: "static" };
  for (const entry of suite.cases) {
    const kind = entry.scene.format === "strata-stage" ? "stage" : "objects";
    assert.equal(validateMaterial({ ...policy, kind, scene: entry.scene }).kind, kind, entry.name);
  }
  const particles = suite.cases.find(entry => entry.name === "particles").scene;
  const broken = (change, pattern) => { const copy = structuredClone(particles); change(copy); assert.throws(() => validateMaterial({ ...policy, kind: "stage", scene: copy }), pattern); };
  broken(copy => { copy.version = 2; }, /version 3 strata-stage/);
  broken(copy => { copy.particles[0].shape = "star"; }, /particles\[0\]\.shape/);
  broken(copy => { copy.particles = Array.from({ length: 257 }, () => copy.particles[0]); }, /at most 256/);
  // Packing: the stage flag in vec4 4.w, the count, and particles farthest first (the z = 10 card before z = 40).
  assert.ok(STAGE_VEC4S <= RELIEF_VEC4S);
  const stage = reliefUniforms(validateMaterial({ ...policy, kind: "stage", scene: particles }).scene);
  assert.deepEqual([stage[18], stage[19]], [6, 1]);
  const z = index => stage[(6 + index * 6) * 4 + 2];
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(z), [10, 20, 20, 20, 20, 40]);
  assert.equal(materialUniforms(validateMaterial({ ...policy, kind: "stage", scene: particles }), -1)[0], 2);
  // An environment map: flag 2 in vec4 4.w, and its grid after the primitives.
  const mapped = suite.cases.find(entry => entry.name === "environment-map").scene;
  const values = reliefUniforms(validateReliefScene(mapped, "objects"));
  assert.equal(values[19], 2);
  assert.equal(values[(6 + 16 * 2 + 256 * 6) * 4 + 7 * 32], Math.fround(1.2));
  assert.ok(RELIEF_VEC4S * 16 <= 65536);
  // A version 2 scene may not name a map.
  assert.throws(() => validateMaterial({ ...policy, kind: "objects", scene: { ...mapped, version: 2 } }), /environment\.source/);
});
