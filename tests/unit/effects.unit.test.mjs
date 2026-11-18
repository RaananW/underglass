/**
 * Unit tests for effect validation and uniform packing in `packages/core/src/effects.ts`, plus the
 * evidence directory helper. Pure data checks, no browser. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { evidenceDirectory, validateEvidenceRoot } from "../helpers/evidence.mjs";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    return next(context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js") ? specifier.replace(/\.js$/, ".ts") : specifier, context);
  },
});
const { defineEffect, validateEffects, effectUniforms, validateMaterial } = await import("../../packages/core/src/effects.ts");
const { layerShader, passShaders } = await import("../../packages/core/src/composition.ts");
sourceImports.deregister();

// Shared fields of a valid effect; individual cases override one field to break it.
const common = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static", time: { seconds: 0 } };
const ripple = { ...common, kind: "ripple", parameters: { amplitude: 0 } };
const dissolve = { ...common, kind: "dissolve", parameters: { amount: .5, speed: 1 } };
test("entire effect chain validates order, finite ranges and exact policies without mutating input", () => {
  const original = JSON.stringify(ripple);
  assert.equal(validateEffects([ripple])[0].time.playing, false);
  assert.equal(JSON.stringify(ripple), original);
  for (const chain of [[], [ripple, ripple], [dissolve, ripple], [{ ...ripple, bounds: "expand" }],
    [{ ...ripple, parameters: { amplitude: Infinity } }], [{ ...ripple, parameters: { amplitude: 1, extra: 1 } }],
    [{ ...ripple, time: { seconds: -1 } }], [{ ...ripple, time: { seconds: 1, playing: 1 } }],
    [ripple, { ...dissolve, parameters: { amount: 2, speed: 0 } }]]) assert.throws(() => validateEffects(chain));
  assert.equal(effectUniforms(validateEffects([ripple, dissolve])).length, 24);
});
test("a chain declares one interaction: decorative or inert (transition), never mixed or unknown", () => {
  const inert = { ...common, interaction: "inert" };
  assert.deepEqual(validateEffects([{ ...inert, kind: "ripple", parameters: { amplitude: 4 } }, { ...inert, kind: "dissolve", parameters: { amount: .3, speed: 0 } }])
    .map(value => value.interaction), ["inert", "inert"]);
  assert.throws(() => validateEffects([{ ...inert, kind: "ripple", parameters: { amplitude: 4 } }, dissolve]), /share one interaction/);
  assert.throws(() => validateEffects([{ ...ripple, interaction: "interactive" }]), /decorative or inert interaction/);
});
test("trusted external definition freezes exact typed numeric schema and rejects fabricated definitions", () => {
  const definition = defineEffect({ name: "tint", geometry: "color", bounds: "layer", capabilities: ["webgpu"],
    parameters: { strength: { min: 0, max: 1 } }, wgsl: "return color;" });
  assert.ok(Object.isFrozen(definition) && Object.isFrozen(definition.parameters.strength));
  const value = { ...common, kind: "custom", definition, parameters: { strength: .5 } };
  assert.equal(validateEffects([value])[0].definition, definition);
  for (const bad of [{ ...value, definition: { ...definition } }, { ...value, parameters: {} },
    { ...value, parameters: { strength: 2 } }, { ...value, parameters: { strength: 1, rate: 1 } }]) assert.throws(() => validateEffects([bad]));
  assert.throws(() => defineEffect({ ...definition, capabilities: ["webgl"] }));
});
test("a displacement definition is a sampling operation: once per chain, before colour, never a material", () => {
  const base = { bounds: "layer", capabilities: ["webgpu"], parameters: { amount: { min: -64, max: 64 } } };
  const shift = defineEffect({ ...base, name: "shift", geometry: "displacement", wgsl: "return local + vec2f(parameters.x, 0.0);" });
  const other = defineEffect({ ...base, name: "other", geometry: "displacement", wgsl: "return local;" });
  const tint = defineEffect({ ...base, name: "tint", geometry: "color", wgsl: "return color;" });
  assert.throws(() => defineEffect({ ...base, name: "mesh", geometry: "vertex", wgsl: "return local;" }), /color or displacement/);
  const moved = { ...common, kind: "custom", definition: shift, parameters: { amount: 8 } };
  const tinted = { ...common, kind: "custom", definition: tint, parameters: { amount: 1 } };
  // One custom of each geometry may share a chain, with the built-in sampling operations on either side of the displacement.
  assert.deepEqual(validateEffects([ripple, moved, tinted]).map(value => value.kind), ["ripple", "custom", "custom"]);
  assert.equal(validateEffects([moved, { ...common, kind: "chromatic", parameters: { displacement: 2 } }, dissolve]).length, 3);
  assert.throws(() => validateEffects([tinted, moved]), /Sampling effects must precede/);
  assert.throws(() => validateEffects([dissolve, moved]), /Sampling effects must precede/);
  assert.throws(() => validateEffects([moved, { ...moved, definition: other }]), /only once per chain/);
  assert.throws(() => validateEffects([tinted, { ...tinted }]), /only once per chain/);
  assert.throws(() => validateEffects([{ ...moved, parameters: { amount: 65 } }]), /amount requires/);
  // Packing: a displacement is code 5 with its definition's slot beside the clock; a colour function stays code 4.
  const packed = effectUniforms(validateEffects([{ ...moved, time: { seconds: 3 } }, tinted]), 1);
  assert.deepEqual([...packed.slice(0, 5)], [5, 3, 1, 0, 8]);
  assert.deepEqual([...packed.slice(8, 13)], [4, 0, 0, 0, 1]);
  assert.equal(effectUniforms(validateEffects([moved]))[2], -1, "a pass that was not built with the definition never runs it");
  assert.throws(() => validateMaterial({ kind: "custom", definition: shift, parameters: { amount: 0 }, interior: { max: 0.05 },
    bounds: "layer", interaction: "material", media: "identity", fallback: "static" }), /color definition/);
});
test("the layer pass holds a displacement beside the colour function, in fixed slots", () => {
  const base = { bounds: "layer", capabilities: ["webgpu"], parameters: { amount: { min: 0, max: 1 } } };
  const shift = defineEffect({ ...base, name: "shift", geometry: "displacement", wgsl: "return local + vec2f(parameters.x, 0.0);" });
  const tint = defineEffect({ ...base, name: "tint", geometry: "color", wgsl: "return color;" });
  const plain = layerShader().fragmentWGSL;
  assert.ok(!plain.includes("displaced") && !plain.includes("fn custom"), "a pass without a displacement is the shader it was");
  assert.ok(!layerShader(tint).fragmentWGSL.includes("displaced"));
  const both = layerShader(tint, undefined, undefined, shift).fragmentWGSL;
  for (const part of [
    "fn custom0(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f { return color; }",
    "fn custom1(local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec2f { return local + vec2f(parameters.x, 0.0); }",
    "control.x == 5.0 && control.z == 1.0", "control.x == 4.0 && state[5].w == 0.0",
  ]) assert.ok(both.includes(part), part);
  const alone = layerShader(undefined, undefined, undefined, shift).fragmentWGSL;
  assert.ok(alone.includes("fn custom1(local: vec2f") && !alone.includes("fn custom0"));
  // Passes are interned by all three definitions.
  assert.equal(passShaders(tint, undefined, shift), passShaders(tint, undefined, shift));
  assert.notEqual(passShaders(tint, undefined, shift), passShaders(tint));
  assert.equal(passShaders(undefined, undefined, shift).displacement, shift);
  assert.equal(passShaders(), undefined);
});
test("normal evidence output is regenerable, not an accepted archive", () => {
  const directory = evidenceDirectory("effects");
  assert.equal(validateEvidenceRoot(directory), directory);
  assert.throws(() => evidenceDirectory("../phase7"));
});
