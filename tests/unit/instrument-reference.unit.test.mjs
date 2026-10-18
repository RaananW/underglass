/**
 * Unit tests for the reference implementation of the Strata Rendering Model's Instrument part (part 2D, version 4) as
 * `@underglass/ui/tokens` ships it (`instrument.ts`), its conformance suite (`instrument-4.json`) and the premium
 * character (`characters/premium.json`): validation accepts core's scenes and refuses the documented bad ones with
 * their paths; containment follows the box rule, the stage-corner drift case and the mid-travel binding of I0.2; glass
 * keeps a flat pane's texel, magnifies on the dome and leaves protected text alone; the studio's softbox lies at the key
 * light; hand-computed values for the face pool, the guard and a binding vertex; and the committed suite is what the
 * reference produces. When core's `instrument.ts` is in the tree, its normalized copies are compared with the
 * reference's. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import {
  boxForTravel, buildInstrumentConformance, capturedFrom, createStrataTheme, drift, emitterTerm, faceFactor, glassSample, instrumentCases,
  instrumentFaceScene, instrumentSettings, lightVector, objectContained, partHit, partShadow, partTerms, posedVertices, profileMesh, project,
  shadeFace, shadePoint, studioHdr, studioRadiance, studioRotation, validateInstrumentScene, applyVariant, bindingVertex, cameraDistance, shadePart,
  strataTokens,
} from "../../packages/ui/src/tokens/index.ts";

const committed = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/instrument-4.json", import.meta.url), "utf8"));
const coreSource = new URL("../../packages/core/src/instrument.ts", import.meta.url);

const knobProfile = (radius, height) => ({ type: "lathe", segments: 48,
  points: [[radius, 0, 1, 0], [radius, height - 1.2, 1, 0], [radius - 1.2, height, 0.7, 0.7], [0, height, 0, 1]] });
/** Core's minimal valid scene (`tests/unit/instrument.unit.test.mjs` on core's Instrument work): a knob and a key with a captured cap. */
function scene(overrides = {}) {
  return {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 0.8 },
    extent: { width: 400, height: 200 }, outset: { top: 8, right: 8, bottom: 8, left: 8 }, backdrop: "#e7e8ea",
    light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 },
    interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 },
    focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: { face: { base: { roughness: 0.6 } }, metal: { base: { colour: "#ecedf0", metallic: 1, roughness: 0.3 }, brush: { strength: 0.9 } }, cap: { base: { roughness: 1 } } },
    primitives: [{ face: "raised", rect: [0, 0, 400, 200], radius: 12, height: 6, material: "face" }],
    profiles: { cap: knobProfile(18, 14), pointer: { type: "prism", width: 2, length: 10, radius: 0.5, height: 1, taper: 0.2 },
      keyTop: { type: "prism", width: 40, length: 24, radius: 4, height: 6, taper: 2, chamfer: 0.5 } },
    objects: [
      { id: "knob", rect: [20, 20, 50, 50], t: 0.5, parts: [
        { kind: "cap", profile: "cap", at: [45, 45, 0], material: "metal", pose: { from: { turn: -135 }, to: { turn: 135 } } },
        { kind: "pointer", profile: "pointer", at: [45, 37, 14], material: "metal", pose: { from: { turn: -135, pivot: [0, 8, 0] }, to: { turn: 135, pivot: [0, 8, 0] } } },
      ] },
      { id: "key", rect: [100, 20, 50, 34], parts: [
        { kind: "cap", profile: "keyTop", at: [125, 37, 0], material: "cap", captured: true, pose: { from: {}, to: { travel: -2.5 } } },
      ] },
    ],
    ...overrides,
  };
}
const later = () => scene({ emitters: [{ position: [45, 45, 10], colour: [1, 0.6, 0.2], strength: 4, radius: 60 }], protected: "extent",
  post: { taa: true }, shadow: { strength: 0.24, map: { size: 2048 } } });

test("validation accepts core's scenes and returns its normalized copy", () => {
  const input = scene({ objects: scene().objects.map(object => ({ ...object })) });
  input.objects[0].t = 3;
  const before = JSON.stringify(input);
  const result = validateInstrumentScene(input);
  assert.equal(JSON.stringify(input), before, "the input is not mutated");
  assert.equal(result.objects[0].t, 1, "t is clamped to the travel's stop");
  assert.equal(result.objects[1].t, 0);
  assert.deepEqual(result.objects[1].bounds, { rect: [100, 20, 50, 34], radius: 0 });
  assert.equal(result.objects[1].relief.face, "raised", "the default Relief primitive is a raised box over the bounds");
  assert.equal(result.light.intensity, 1.6);
  assert.equal(result.light.ambient, 0, "the fill defaults to 0: the studio is the fill (core's default)");
  assert.equal(result.profiles.cap.segments, 48);
  assert.equal(result.materials.metal.base.direct, 1);
  const extra = validateInstrumentScene(later());
  assert.deepEqual([extra.emitters[0].reach, extra.emitters[0].face, extra.feather], ["outset", 1, 4]);
  assert.deepEqual(extra.post, { smaa: true, bloom: true, taa: true, contact: false, ssgi: false });
  assert.deepEqual(extra.shadow.map, { size: 2048, bias: 1.95, darkness: 0.1 });
  // Every case of the suite, and every variant, is a valid scene.
  for (const entry of instrumentCases()) {
    validateInstrumentScene(entry.scene);
    for (const variant of entry.variants) validateInstrumentScene(applyVariant(entry.scene, variant));
  }
  // The parts cap of the format is 8,192; the 2,048 budget is a renderer's step-down, not an error.
  const many = Array.from({ length: 33 }, (_, index) => ({ id: `o${index}`, rect: [0, 0, 10, 10], parts: Array.from({ length: 64 }, () => ({ kind: "cap", profile: "cap", at: [5, 5, 0], material: "metal" })) }));
  assert.equal(validateInstrumentScene(scene({ primitives: [], objects: many })).objects.length, 33);
});

test("validation refuses the documented bad scenes with their paths", () => {
  const knob = scene().objects[0], key = scene().objects[1];
  const cases = [
    [scene({ version: 3 }), /version 4 strata-scene with kind "instrument"/],
    [scene({ kind: "relief" }), /kind "instrument"/],
    [scene({ camera: undefined }), /Instrument scene camera requires an object/],
    [scene({ camera: { distance: 50, vanish: [0, 0] } }), /camera.distance requires a number in 100/],
    [scene({ environment: { source: "none", strength: 1 } }), /environment.source requires "studio"/],
    [scene({ profiles: { ...scene().profiles, cap: { type: "mesh", positions: [] } } }), /profiles.cap.type mesh needs core work item 5/],
    [scene({ profiles: { ...scene().profiles, cap: { type: "cone" } } }), /profiles.cap.type requires one of lathe, prism, extrude/],
    [scene({ profiles: { ...scene().profiles, keyTop: { type: "prism", width: 10, length: 10, height: 4, taper: 3, chamfer: 2 } } }), /profiles.keyTop.taper and chamfer must leave a top/],
    [scene({ profiles: { ...scene().profiles, cap: { type: "lathe", points: [[1, 0, 0, 0], [0, 1, 0, 1]] } } }), /profiles.cap.points\[0\] requires a non-zero normal/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], kind: "custom" }] }] }), /objects\[0\].parts\[0\].kind custom parts need core work item 5/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], kind: "knob" }] }] }), /objects\[0\].parts\[0\].kind requires one of cap, skirt/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], profile: "nope" }] }] }), /objects\[0\].parts\[0\].profile requires one of the scene's profiles/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], material: "nope" }] }] }), /objects\[0\].parts\[0\].material requires one of the scene's materials/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[1], pose: { from: { axis: 0 }, to: { axis: 90 } } }] }] }), /objects\[0\].parts\[0\].pose.to.axis must equal pose.from.axis/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], pose: { from: { turn: 0 }, to: { turn: 1000 } } }] }] }), /objects\[0\].parts\[0\].pose.to.turn requires a number in -720..720/],
    [scene({ objects: [{ ...key, parts: [{ ...key.parts[0], pose: { from: {}, to: { turn: 10 } } }] }] }), /objects\[0\].parts\[0\].captured is only for parts that travel/],
    [scene({ objects: [knob, { ...key, id: "knob" }] }), /objects\[1\].id "knob" is not unique/],
    [scene({ objects: [{ ...key, relief: { face: "bulge", rect: [0, 0, 1, 1], height: 1, material: "face" } }] }), /objects\[0\].relief.face requires one of raised/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], emitter: 0 }] }] }), /objects\[0\].parts\[0\].emitter requires an index into emitters/],
    [scene({ primitives: Array.from({ length: 255 }, () => scene().primitives[0]) }), /primitives and objects together exceed 256/],
    [scene({ objects: [{ ...knob, parts: [{ ...knob.parts[0], colour: "#fff" }] }] }), /objects\[0\].parts\[0\].colour is not a field/],
    [scene({ materials: { ...scene().materials, metal: { base: { colour: "white" } } } }), /materials.metal.base.colour requires a #rrggbb colour/],
    [scene({ shadow: { strength: 0.2, map: { size: 1024 } } }), /shadow.map.size requires 2048 or 4096/],
    [scene({ protected: [[0, 0, -1, 4]] }), /protected\[0\] requires \[x, y, width, height\]/],
    [scene({ primitives: [{ object: "key", rect: [0, 0, 4, 4], height: 1, material: "face" }] }), /primitives\[0\].object requires a version 2 or 3 scene/],
    [scene({ outset: { top: 200, right: 0, bottom: 0, left: 0 } }), /outset.top requires a number in 0..128/],
  ];
  for (const [value, expected] of cases) assert.throws(() => validateInstrumentScene(value), expected);
  const many = Array.from({ length: 129 }, (_, index) => ({ id: `o${index}`, rect: [0, 0, 10, 10], parts: Array.from({ length: 64 }, () => ({ kind: "cap", profile: "cap", at: [5, 5, 0], material: "metal" })) }));
  assert.throws(() => validateInstrumentScene(scene({ primitives: [], objects: many })), /objects hold more than 8192 parts/);
  // The error names its path and rule as fields too.
  try { validateInstrumentScene(scene({ camera: { distance: 50, vanish: [0, 0] } })); } catch (error) { assert.deepEqual([error.path, error.name], ["camera.distance", "InstrumentSceneError"]); }
});

test("core's validation and the reference agree, scene for scene (when core's instrument material is in the tree)", { skip: !existsSync(coreSource) && "packages/core/src/instrument.ts is not on this branch yet (core's Instrument material, PR 4)" }, async () => {
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
      return next(specifier, context);
    },
  });
  const core = await import(coreSource.href);
  hooks.deregister();
  for (const value of [scene(), later(), ...instrumentCases().map(entry => entry.scene)]) {
    assert.deepEqual(JSON.parse(JSON.stringify(validateInstrumentScene(value))), JSON.parse(JSON.stringify(core.validateInstrumentScene(value))));
  }
  // The same triangles, whatever their winding: each triangle's three indices as a sorted triple, in order.
  const triples = indices => Array.from({ length: indices.length / 3 }, (_, t) => [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]].sort((a, b) => a - b).join(","));
  for (const shape of shapes) {
    const ours = profileMesh(shape), theirs = core.profileGeometry(shape);
    assert.deepEqual(triples(ours.indices), triples(theirs.indices), `the same triangles (${shape.type})`);
    assert.ok(ours.positions.every((value, index) => Math.abs(value - theirs.positions[index]) < 1e-5));
    assert.ok(ours.normals.every((value, index) => Math.abs(value - theirs.normals[index]) < 1e-5));
  }
});

/** One shape of each profile type, an extrude in both outline orders and a lathe with an inward wall. */
const shapes = [knobProfile(18, 14), { type: "prism", width: 30, length: 42, radius: 3, height: 12, taper: 0.6, chamfer: 2 },
  { type: "extrude", outline: [[-25, 0], [25, 0], [25, 3], [0, 5], [-25, 3]], width: 28 }, { type: "extrude", outline: [[-25, 3], [0, 5], [25, 3], [25, 0], [-25, 0]], width: 28 },
  { type: "lathe", points: [[27, 0, 1, 0], [27, 3, 1, 0], [27, 3, 0, 1], [22, 3, 0, 1], [22, 3, -1, 0], [22, 0, -1, 0]], segments: 32 }];

test("every triangle winds against its outward normals (2D.2, Normals and winding)", () => {
  for (const shape of shapes) {
    const { positions: p, normals: n, indices } = profileMesh(shape);
    let checked = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const e1 = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]), e2 = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (Math.hypot(...cross) < 1e-9) continue;
      const normal = [0, 1, 2].map(k => n[a * 3 + k] + n[b * 3 + k] + n[c * 3 + k]);
      assert.ok(cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0, `${shape.type} triangle ${t / 3} winds with its normal`);
      checked++;
    }
    assert.ok(checked > 0, shape.type);
  }
});

test("profiles and poses: core's triangles, rigid placements clamped at the stops", () => {
  const lathe = profileMesh(knobProfile(18, 14));
  assert.equal(lathe.positions.length / 3, 4 * 49, "one ring of segments + 1 vertices per profile point");
  assert.equal(lathe.indices.length, 3 * 2 * 48 * 3);
  const creased = profileMesh({ type: "lathe", points: [[10, 0, 1, 0], [10, 4, 1, 0], [10, 4, 0, 1], [0, 4, 0, 1]], segments: 8 });
  assert.deepEqual([...new Set(creased.groups)], [0, 1], "a repeated point is a crease: the band after it is a new group");
  const value = validateInstrumentScene(scene());
  const pointer = value.objects[0].parts[1];
  const at = t => [...posedVertices(pointer, value.profiles.pointer, t)].slice(0, 3);
  assert.deepEqual(at(-2), at(0), "t below 0 is the first stop");
  assert.deepEqual(at(7), at(1), "t above 1 is the last stop");
  // The pointer turns about the knob's axis: its distance from (45, 45) is the same at every t.
  for (const t of [0, 0.3, 1]) { const [x, y] = at(t); assert.ok(Math.abs(Math.hypot(x - 45, y - 45) - Math.hypot(at(0.5)[0] - 45, at(0.5)[1] - 45)) < 1e-9); }
});

test("the camera rule, drift and the box rule give I0.1 and I0.2's numbers", () => {
  const camera = { distance: 2400, vanish: [960, 540] };
  // I0.1: the pointer at 14.8 px in the stage's corner drifts 6.83 px.
  assert.ok(Math.abs(drift(camera, [0, 0, 14.8]) - 6.83) < 0.01);
  // I0.2's margins: ceil(drift(h_max) + 1) at 1920 × 1080 and D = 2,400 (knob cap and pointer 8, skirt 5).
  const box = height => boxForTravel({ id: "b", rect: [0, 0, 10, 10], parts: [{ kind: "cap", profile: "p", at: [0, 0, 0], material: "m" }] },
    { p: { type: "prism", width: 4, length: 4, height } }).margin;
  assert.deepEqual([box(14.8), box(8), box(6)], [8, 5, 4]);
  // A binding vertex's projection, by hand: the cap's rim vertex nearest the box's edge, projected through the camera.
  const object = knobAt(1 + 18 + 8, 1 + 18 + 8, 8), profiles = { cap: knobProfile(18, 14.8) };
  const [binding] = bindingVertex(object, profiles);
  assert.ok(Math.abs(binding.inset - 8) < 1e-6, `the rim lies 8 px inside the box orthographically (${binding.inset})`);
  const projected = project(camera, binding.point), k = 2400 / (2400 - binding.point[2]);
  assert.ok(Math.abs(projected[0] - (960 + (binding.point[0] - 960) * k)) < 1e-9 && Math.abs(projected[1] - (540 + (binding.point[1] - 540) * k)) < 1e-9);
  assert.equal(cameraDistance({ width: 1920, height: 1080 }, [object], profiles), 2400, "the floor at 1920 × 1080");
  assert.ok(cameraDistance({ width: 3840, height: 2160 }, [knobAt(960, 540, 3)], profiles) > 2400, "a larger stage and a tighter box raise D");
});

/** A knob cap of radius 18 in a square box with `margin` on every side, at stage point (x, y). */
function knobAt(x, y, margin) {
  const side = 36 + 2 * margin;
  return { id: "k", rect: [x - side / 2, y - side / 2, side, side], bounds: { rect: [x - side / 2, y - side / 2, side, side], radius: 0 }, t: 0,
    parts: [{ kind: "cap", profile: "cap", at: [x, y, 0], material: "metal", pose: { from: { turn: -135 }, to: { turn: 135 } } }] };
}
const stage = profiles => ({ camera: { distance: 2400, vanish: [960, 540] }, profiles, extent: { width: 1920, height: 1080 } });

test("containment over the whole travel: the box rule, the stage-corner drift case and a mid-travel binding (I0.2)", () => {
  const profiles = { cap: knobProfile(18, 14.8) };
  const corner = knobAt(1 + 18 + 8, 1 + 18 + 8, 8);
  const ok = objectContained(corner, stage(profiles));
  assert.equal(ok.contained, true, `the box rule's margin contains the cap at the stage's corner (${ok.closest.inset})`);
  // Four px less margin: contained at the vanishing point, where drift is 0, but not in the corner.
  assert.equal(objectContained(knobAt(960, 540, 4), stage(profiles)).contained, true);
  const cornered = objectContained(knobAt(1 + 18 + 4, 1 + 18 + 4, 4), stage(profiles));
  assert.equal(cornered.contained, false);
  assert.equal(cornered.reason, "vertex");
  assert.ok(Math.abs(cornered.closest.inset + 1.4425) < 1e-3, `core's exact projection gives −1.4425 px here (${cornered.closest.inset})`);
  // A lever on a pivot at its base tilting ±40° about x: tallest (most drift) at mid-travel, where it binds.
  const lever = { lever: { type: "prism", width: 3, length: 3, height: 30, radius: 0, taper: 0, chamfer: 0 } };
  const bat = { id: "bat", rect: [28, 12, 24, 56], bounds: { rect: [28, 12, 24, 56], radius: 0 }, t: 0,
    parts: [{ kind: "lever", profile: "lever", at: [40, 40, 0], material: "m", pose: { from: { tilt: -40 }, to: { tilt: 40 } } }] };
  const result = objectContained(bat, stage(lever));
  assert.equal(result.contained, false);
  assert.ok(Math.abs(result.closest.t - 0.5) <= 0.05, `the closest approach is at mid-travel (t = ${result.closest.t})`);
  for (const t of [0, 1]) assert.equal(objectContained({ ...bat, parts: [{ ...bat.parts[0], pose: { from: { tilt: t ? 40 : -40 }, to: { tilt: t ? 40 : -40 } } }] }, stage(lever)).contained, true, "each stop alone passes");
  // Bounds past the layer's box step the object down whatever its parts do.
  assert.equal(objectContained({ ...knobAt(960, 540, 8), bounds: { rect: [1900, 0, 40, 40], radius: 0 } }, stage(profiles)).reason, "layer");
  // The suite's bat binds at mid-travel too, and every contained check's objects are contained.
  const switches = committed.cases.find(entry => entry.name === "switches").checks.find(check => check.kind === "contained");
  assert.equal(switches.reference.bat.t, 0.5);
});

test("the face pool, part shadows and the guard, by hand (2D.4)", () => {
  // E = I · colour · cos θ / (π d²) · clamp(1 − (d² / R²)², 0, 1)², for a point straight below the emitter and one beside it.
  const emitter = { position: [0, 0, 20], colour: [1, 0.5, 0.25], strength: 3200, radius: 168 };
  const below = emitterTerm(emitter, [0, 0, 0], [0, 0, 1]);
  const window = (1 - (400 / 168 ** 2) ** 2) ** 2;
  assert.ok(Math.abs(below[0] - (3200 / (Math.PI * 400)) * window) < 1e-9);
  assert.ok(Math.abs(below[1] - below[0] * 0.5) < 1e-12);
  const beside = emitterTerm(emitter, [15, 0, 0], [0, 0, 1]);
  assert.ok(Math.abs(beside[0] - 3200 * (20 / 25) / (Math.PI * 625) * (1 - (625 / 168 ** 2) ** 2) ** 2) < 1e-9);
  assert.deepEqual(emitterTerm(emitter, [0, 0, 30], [0, 0, 1]), [0, 0, 0], "no light from behind");
  // The guard: inside a protected rect, k · Φ stays within 1 ± m whatever the pool; outside it Φ is the pool itself.
  const lamp = instrumentCases().find(entry => entry.name === "lamp"), value = validateInstrumentScene(lamp.scene), captured = capturedFrom(lamp.capture);
  const inside = faceFactor(value, captured, 143.5, 49.5), m = value.interior.max;
  assert.ok(inside.unguarded[0] > 1 + m, "the lamp's pool alone would brighten the label by more than interior.max");
  for (const channel of inside.factor) assert.ok(channel * inside.k <= 1 + m + 1e-12 && channel * inside.k >= 1 - m - 1e-12);
  const outside = faceFactor(value, captured, 200.5, 87.5);
  assert.deepEqual(outside.factor, outside.unguarded);
  assert.ok(Math.abs(outside.factor[0] - (1 + outside.light[0])) < 1e-12, "no part shadow below the lamp: Φ = 1 + Eᶠ");
  // The face's colour is the layer's result times Φ, clamped.
  const face = instrumentFaceScene(value), base = shadePoint(face, captured, 40.5, 50.5), factor = faceFactor(value, captured, 40.5, 50.5).factor;
  assert.deepEqual(shadeFace(value, captured, 40.5, 50.5), base.map((c, i) => Math.min(1, c * factor[i])));
  // Part shadows on the face: 2.8's formula on each caster's rounded box at its height; outside every caster, none.
  const knob = validateInstrumentScene(instrumentCases().find(entry => entry.name === "knob").scene);
  assert.ok(partShadow(knob, 175.5, 172.5) > 0.01, "the knob's skirt and cap shadow the dial towards the lower right");
  assert.equal(partShadow(knob, 255.5, 30.5), 0);
});

test("glass: a flat pane is the texel, the dome magnifies, protected text is untouched (2D.6)", () => {
  const entry = instrumentCases().find(item => item.name === "glass"), value = validateInstrumentScene(entry.scene), captured = capturedFrom(entry.capture);
  // A window's flat region outside its finish zone: zero displacement, the capture texel exactly.
  for (const [x, y] of [[160.5, 56.5], [120.5, 48.5]]) {
    const hit = partHit(value, x, y), sample = glassSample(value, captured, hit, x, y);
    assert.equal(hit.normal[2], 1);
    assert.equal(sample.exact, true);
    for (const read of sample.reads) assert.deepEqual(read, [x, y], "δ = 0 where the glass is flat");
    assert.deepEqual(sample.colour, captured(x, y).slice(0, 3));
  }
  // Text under the window is exact inside its protected rects grown by 2 px, even where the glass is not flat.
  const bevelled = { ...value, protected: [[18, 18, 30, 30]] }, edge = partHit(bevelled, 20.5, 40.5);
  assert.ok(edge.normal[2] < 0.999, "the window's bevel");
  assert.deepEqual(glassSample(bevelled, captured, edge, 20.5, 40.5).colour, captured(20.5, 40.5).slice(0, 3));
  // The lens magnifies the printed hub under its centre: reads move less than the screen points.
  const at = x => glassSample(value, captured, partHit(value, x, 142.5), x, 142.5).reads[1][0];
  const magnification = 6 / (at(123.5) - at(117.5));
  assert.ok(magnification > 1.3 && magnification < 2, `×${magnification.toFixed(2)} at the dome's centre (the prototype measured ×1.46)`);
  // Near the rim facing the vanishing point the ray meets the flat bottom beyond the critical angle: the dark interior.
  let internal = 0;
  for (let x = 136.5; x < 146; x += 0.25) { const hit = partHit(value, x, 142.5); if (hit?.part === 1 && glassSample(value, captured, hit, x, 142.5).internal) internal++; }
  assert.ok(internal > 0, "total internal reflection at the lens's rim");
  // Dispersion spreads the three channels' reads apart; without it they coincide.
  const flank = partHit(value, 100.5, 142.5), spread = glassSample(value, captured, flank, 100.5, 142.5).reads;
  assert.ok(Math.abs(spread[0][0] - spread[2][0]) > 0.01);
  const plain = validateInstrumentScene(applyVariant(entry.scene, entry.variants.find(variant => variant.name === "no-dispersion")));
  const same = glassSample(plain, captured, partHit(plain, 100.5, 142.5), 100.5, 142.5).reads;
  assert.deepEqual(same[0], same[2]);
});

test("the studio's softbox lies at the key light, in radiance and in the image (2D.5)", () => {
  // The softbox alone (every other studio term 0) is a plateau with a soft edge, so where it lies is its centroid.
  const softbox = { fill: 0, front: 0, strip: 0, floor: 0, ceiling: 0 };
  const angle = (u, v) => (Math.acos(Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / Math.hypot(...u) / Math.hypot(...v))) * 180) / Math.PI;
  for (const light of [{ azimuth: 323, elevation: 41 }, { azimuth: 135, elevation: 30 }, { azimuth: 60, elevation: 70 }]) {
    const L = lightVector(light.azimuth, light.elevation);
    assert.ok(studioRadiance(L, {}, light)[2] > 12, "the softbox at full strength on L");
    // The radiance, over the whole sphere on a 0.5° grid.
    const radiance = [0, 0, 0];
    for (let i = 0; i < 360; i++) for (let j = 0; j < 720; j++) {
      const theta = ((i + 0.5) / 360) * Math.PI, phi = ((j + 0.5) / 720) * 2 * Math.PI, w = [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
      const weight = studioRadiance(w, softbox, light)[2] * Math.sin(theta);
      for (let k = 0; k < 3; k++) radiance[k] += w[k] * weight;
    }
    assert.ok(angle(radiance, L) < 1, `the radiance's softbox lies within 1° of L for ${light.azimuth}°/${light.elevation}° (${angle(radiance, L).toFixed(3)}°)`);
    // The image, decoded, its texels turned by studioRotation into the model's axes.
    const width = 1024, height = 512, bytes = studioHdr(softbox, light, width);
    let offset = new TextDecoder().decode(bytes.subarray(0, 64)).indexOf(`+X ${width}\n`) + `+X ${width}\n`.length;
    const theta = studioRotation(light), image = [0, 0, 0];
    for (let y = 0; y < height; y++) {
      offset += 4;
      const channels = [0, 1, 2, 3].map(() => { const out = []; while (out.length < width) { const count = bytes[offset++]; out.push(...bytes.subarray(offset, offset + count)); offset += count; } return out; });
      const polar = ((y + 0.5) / height) * Math.PI;
      for (let x = 0; x < width; x++) {
        const value = channels[2][x] ? (channels[2][x] + 0.5) * 2 ** (channels[3][x] - 136) : 0, longitude = ((x + 0.5) / width - 0.5) * 2 * Math.PI;
        const c = [Math.sin(polar) * Math.sin(longitude), Math.cos(polar), Math.sin(polar) * Math.cos(longitude)];
        const w = [c[0] * Math.cos(theta) - c[2] * Math.sin(theta), c[1], c[0] * Math.sin(theta) + c[2] * Math.cos(theta)], model = [w[0], -w[1], -w[2]];
        for (let k = 0; k < 3; k++) image[k] += model[k] * value * Math.sin(polar);
      }
    }
    assert.ok(angle(image, L) < 1, `the image's softbox lies within 1° of L for ${light.azimuth}°/${light.elevation}° (${angle(image, L).toFixed(3)}°)`);
  }
});

test("the reference shading: the map keeps darkness of the key term, emitters add light, the quadrature has converged (2D.5)", () => {
  const entry = instrumentCases().find(item => item.name === "shadows"), value = validateInstrumentScene(entry.scene);
  const hit = partHit(value, 104.5, 77.5), part = value.objects[hit.object].parts[hit.part];
  const lit = partTerms(value, part, hit.point, hit.normal, { shadowed: false, samples: 256 }), dark = partTerms(value, part, hit.point, hit.normal, { shadowed: true, samples: 256 });
  dark.key.forEach((term, i) => assert.ok(Math.abs(term - 0.1 * lit.key[i]) < 1e-12, "σ = map.darkness"));
  assert.deepEqual(dark.env, lit.env, "the map never touches the environment term");
  // Doubling the quadrature changes no channel by a level at the suite's sampled points.
  for (const name of ["knob", "presets", "light-direction"]) {
    const item = committed.cases.find(entry => entry.name === name), check = item.checks.find(entry => entry.kind === "sampled");
    const variant = item.variants.find(entry => entry.name === check.variant), scene = validateInstrumentScene(applyVariant(item.scene, variant));
    for (const sample of check.samples.slice(0, 3)) {
      const [x, y] = [Math.floor(sample.at[0]) + 0.5, Math.floor(sample.at[1]) + 0.5], spot = partHit(scene, x, y), piece = scene.objects[spot.object].parts[spot.part];
      const a = shadePart(scene, piece, spot.point, spot.normal, { samples: 2048 }), b = shadePart(scene, piece, spot.point, spot.normal, { samples: 4096 });
      assert.ok(a.every((channel, i) => Math.abs(channel - b[i]) * 255 < 1), `${name} at ${sample.at}: ${a} against ${b}`);
    }
  }
});

test("the premium character: it resolves, keeps every invariant and reports its provisional values (design language section 19)", () => {
  const theme = createStrataTheme({ character: "premium" });
  assert.deepEqual(theme.issues, []);
  assert.equal(theme.character.name, "premium");
  assert.ok(theme.character.provisional.includes("spring.knob.stiffness") && theme.character.provisional.includes("emitter.lamp.strength"));
  assert.ok(!theme.character.provisional.includes("knob.cap.height"), "v2's confirmed values are not provisional");
  const source = theme.toJSON();
  assert.equal(source.knob.skirt.diameter.$value, "64px");
  assert.deepEqual(source.knob.cap.height.$extensions["dev.underglass.strata"].anchors, [9.6, 16, 25.6], "heights scale 0.6, 1 and 1.6 with depth");
  assert.equal(source.form.switch.$value, "slide");
  assert.equal(source.material.roles.plate.$extensions["dev.underglass.strata"].themes.dark, "gunmetal");
  assert.ok(theme.css().includes("--strata-knob-skirt-diameter: 64px;"));
  // The application's theme overrides any of its tokens; a value outside a token's range is reported.
  assert.equal(createStrataTheme({ character: "premium", tokens: { "knob.sweep": 300 } }).toJSON().knob.sweep.$value, 300);
  assert.match(createStrataTheme({ character: "premium", tokens: { "knob.sweep": 400 } }).issues[0].message, /above the maximum 330/);
  // What a character may not set is reported and not applied.
  const rogue = { $extensions: { "dev.underglass.strata": { character: { name: "rogue", provisional: [] } } },
    light: { azimuth: { $type: "number", $value: 10 } }, elevation: { raised: { $type: "dimension", $value: "1px" } },
    colour: { accent: { $type: "color", $value: "#000000" }, glowOn: { $type: "color", $value: "#ff0000", $extensions: { "dev.underglass.strata": { themes: { light: "#ff0000", dark: "#ff0000", contrast: "#ff0000", "contrast-dark": "#ff0000" } } } } },
    target: { min: { $type: "dimension", $value: "10px" } }, studio: { key: { $type: "number", $value: 20 } } };
  const refused = createStrataTheme({ character: rogue });
  assert.deepEqual(refused.issues.map(issue => issue.path), ["light.azimuth", "elevation.raised", "colour.accent", "target.min"]);
  assert.equal(refused.toJSON().light.azimuth.$value, 323, "the one light is untouched");
  assert.equal(refused.toJSON().colour.glowOn.$value, "#ff0000", "glowOn is a character's to set");
  assert.deepEqual(createStrataTheme({ character: rogue }, { scoped: true }).issues.map(issue => issue.path).slice(-1), ["studio.key"], "a scoped character's studio is reported");
  assert.match(createStrataTheme({ character: "nope" }).issues[0].message, /is not a Strata character/);
  // The scene settings it resolves: the key light, no fill, the studio, the map's defaults and the presets' Instrument column.
  const settings = instrumentSettings(strataTokens, { character: "premium", theme: "dark" });
  assert.deepEqual(settings.light, { azimuth: 323, elevation: 41, intensity: 1.6, ambient: 0 });
  assert.deepEqual(settings.shadow.map, { size: 4096, bias: 1.95, darkness: 0.1 });
  assert.deepEqual(settings.materials.metal, { base: { colour: "#eff0f1", roughness: 0.3, metallic: 1, direct: 1 }, brush: { strength: 0.9, direction: "circular" }, grain: { kind: "hairline", strength: 0.15 } });
  assert.equal(settings.materials.emissive.emissive.colour, "#ff9228");
  assert.equal(settings.roles.plate, "gunmetal");
  assert.equal(settings.environment.studio.key, 12);
});

test("the committed instrument-4.json is what the reference implementation produces", () => {
  const built = JSON.parse(JSON.stringify(buildInstrumentConformance()));
  assert.deepEqual(committed, built, "run npm run build:conformance --workspace @underglass/ui");
  assert.equal(committed.tolerance.sampled, 12);
  assert.match(committed.status, /provisional/);
  assert.deepEqual(committed.scales, [1, 2]);
  const kinds = new Set(committed.cases.flatMap(entry => entry.checks.map(check => check.kind)));
  assert.deepEqual([...kinds].sort(), ["contained", "exact", "presence", "ratio", "relief", "sampled", "unchanged"]);
  for (const entry of committed.cases) for (const check of entry.checks) for (const sample of check.samples ?? []) {
    if (sample.expect) assert.deepEqual(Object.keys(sample.expect), ["1", "2"], `${entry.name}: every expectation at both scales`);
  }
});
