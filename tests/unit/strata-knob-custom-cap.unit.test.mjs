/**
 * The helper's custom slot (`packages/ui/src/gpu/instrument.ts`, core work item 5): `customPart`, `profileKey` and the
 * knob's `customCap`, checked with core's own validator. A knob with no `customCap` is the premium knob it always was.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { customPart, knobObject, premiumMaterials, profileKey } from "../../packages/ui/src/gpu/instrument.ts";

const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, profileGeometry, meshReady } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = profileKey(name, shape); profiles[key] ??= shape; return key; } }; };
const input = (extra = {}) => ({ id: "volume", box: [20, 20, 140, 140], skirt: 64, cap: 52, t: 0.62, sweep: 270, scale: 1, state: { hover: false, disabled: false }, relief: { height: 3, material: "knobCap" }, ...extra });
const cap = { source: { url: "/custom/parts.glb", mesh: "Cap" }, bounds: { low: [-18.5, -18.5, 0], high: [18.5, 18.5, 10.6] }, scale: 1.4 };
const sceneOf = ({ profiles }, object) => ({
  format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
  extent: { width: 400, height: 300 }, backdrop: "#e7e8ea", light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 },
  interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
  materials: { ...premiumMaterials, matte: { base: { roughness: 0.6 } } },
  primitives: [{ face: "raised", rect: [0, 0, 400, 300], radius: 12, height: 8, material: "matte" }], profiles, objects: [object],
});

test("a knob with no custom cap is the premium knob: skirt, cap, chamfer, pointer", () => {
  const { profile } = registry();
  const object = knobObject(input(), profile);
  assert.deepEqual(object.parts.map(part => part.kind), ["skirt", "cap", "chamfer", "pointer"]);
  assert.ok(object.parts.every(part => !part.profile.includes("mesh")));
});

test("a custom cap replaces the cap, its chamfer and the pointer, stands on the skirt and turns with the value", () => {
  const { profile, profiles } = registry();
  const object = knobObject(input({ customCap: cap }), profile);
  assert.deepEqual(object.parts.map(part => part.kind), ["skirt", "cap"]);
  const part = object.parts[1];
  assert.equal(part.material, "knobCap", "the part's role gives its material: themes and characters apply");
  assert.deepEqual(part.at, [90, 90, 2.5], "on the skirt");
  assert.deepEqual(part.pose, { from: { turn: -135 }, to: { turn: 135 } });
  assert.equal(profiles[part.profile].type, "mesh");
  assert.deepEqual(profiles[part.profile].source, { url: "/custom/parts.glb", mesh: "Cap" });
  // Core takes it: a scene validates, the reference is not loaded yet (nothing is drawn for it), and a loaded mesh would be checked.
  const scene = validateInstrumentScene(sceneOf({ profiles }, object));
  assert.equal(meshReady(scene.profiles[part.profile]), false);
  assert.equal(profileGeometry(scene.profiles[part.profile]).positions.length, 9, "a placeholder until core has the file");
});

test("customPart: a named part keeps its kind, the default is custom, and buffers are told apart in the profile key", () => {
  const { profile, profiles } = registry();
  const part = customPart({ ...cap, at: [1, 2, 3], material: "knobCap", caster: null }, profile);
  assert.equal(part.kind, "custom");
  assert.equal(part.caster, null);
  assert.equal(customPart({ ...cap, at: [1, 2, 3], material: "knobCap", kind: "cap" }, profile).kind, "cap");
  const a = new ArrayBuffer(8), b = new ArrayBuffer(8);
  const shape = buffer => ({ type: "mesh", source: { data: buffer, mesh: "Cap" }, bounds: cap.bounds });
  assert.notEqual(profileKey("custom-Cap", shape(a)), profileKey("custom-Cap", shape(b)));
  assert.equal(profileKey("custom-Cap", shape(a)), profileKey("custom-Cap", shape(a)));
  assert.equal(Object.keys(profiles).length, 1, "the same reference is one profile");
});

test("the custom cap carries the built-in cap, chamfer and pointer as its stand-in, so a failed file shows the standard knob", () => {
  const { profile } = registry();
  const standard = knobObject(input(), profile).parts.slice(1);
  const custom = knobObject(input({ customCap: cap }), profile).parts[1];
  assert.deepEqual(custom.fallback, standard);
  const r = registry(), object = knobObject(input({ customCap: cap }), r.profile);
  const validated = validateInstrumentScene(sceneOf(r, object));
  assert.deepEqual(validated.objects[0].parts.map(p => [p.kind, !!p.fallbackFor]), [["skirt", false], ["cap", true], ["chamfer", true], ["pointer", true], ["cap", false]]);
});
