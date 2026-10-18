/**
 * Unit tests for the `instrument` material's scene (`packages/core/src/instrument.ts`, Rendering Model 2D): validation
 * with precise errors, profile geometry, poses clamped at their stops, the containment check over the whole travel
 * (the stage-corner drift case, I0.2's box rule, a binding at mid-travel), casters, kinds and the face's step-down
 * scene. Pure data, no browser; `tests/browser/core-instrument.test.mjs` proves the decoded pixels. Run with
 * `npm run test:unit`.
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
const instrument = await import("../../packages/core/src/instrument.ts");
const { validateMaterial } = await import("../../packages/core/src/effects.ts");
sourceImports.deregister();
const {
  validateInstrumentScene, profileGeometry, partMatrix, poseAt, transform, containmentFrontier, checkContainment, boxMargin, cameraDistance,
  drift, partCaster, partKinds, instrumentStructure, boundsInside, instrumentLayout, sameGeometry, instrumentFaceScene, similarity, roundedBoxDistance, posedVertices,
} = instrument;

const knobProfile = (radius, height) => ({ type: "lathe", segments: 48,
  points: [[radius, 0, 1, 0], [radius, height - 1.2, 1, 0], [radius - 1.2, height, 0.7, 0.7], [0, height, 0, 1]] });
/** A minimal valid scene: one knob (a turning cap with a pointer) and one key with a captured cap. */
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
const material = value => ({ kind: "instrument", scene: value, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });

test("a valid scene validates to a normalized copy without mutating its input", () => {
  const input = scene({ objects: scene().objects.map(object => ({ ...object })) });
  input.objects[0].t = 3;
  const before = JSON.stringify(input);
  const result = validateInstrumentScene(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.objects[0].t, 1, "t is clamped to the travel's stop");
  assert.equal(result.objects[1].t, 0, "t defaults to 0");
  assert.deepEqual(result.objects[1].bounds, { rect: [100, 20, 50, 34], radius: 0 }, "bounds default to the rect");
  assert.equal(result.objects[1].relief.face, "raised", "the default Relief primitive is a raised box");
  assert.deepEqual(result.objects[1].relief.rect, [100, 20, 50, 34]);
  assert.equal(result.light.intensity, 1.6);
  assert.equal(result.light.ambient, 0, "the fill is 0: the studio is the fill");
  assert.equal(result.profiles.cap.segments, 48);
  assert.equal(result.materials.metal.base.direct, 1);
  assert.deepEqual(result.objects[0].parts[1].pose.from, { travel: 0, slide: [0, 0], turn: -135, tilt: 0, axis: 0, pivot: [0, 8, 0] });
  // Through the material: the descriptor validates the scene.
  assert.equal(validateMaterial(material(input)).scene.objects.length, 2);
});

test("scene validation reports the first problem with its path", () => {
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
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], kind: "custom" }] }] }), /objects\[0\].parts\[0\].kind custom parts need core work item 5/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], kind: "knob" }] }] }), /objects\[0\].parts\[0\].kind requires one of cap, skirt/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], profile: "nope" }] }] }), /objects\[0\].parts\[0\].profile requires one of the scene's profiles/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], material: "nope" }] }] }), /objects\[0\].parts\[0\].material requires one of the scene's materials/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[1], pose: { from: { axis: 0 }, to: { axis: 90 } } }] }] }), /objects\[0\].parts\[0\].pose.to.axis must equal pose.from.axis/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], pose: { from: { turn: 0 }, to: { turn: 1000 } } }] }] }), /objects\[0\].parts\[0\].pose.to.turn requires a number in -720..720/],
    [scene({ objects: [{ ...scene().objects[1], parts: [{ ...scene().objects[1].parts[0], pose: { from: {}, to: { turn: 10 } } }] }] }), /objects\[0\].parts\[0\].captured is only for parts that travel/],
    [scene({ objects: [scene().objects[0], { ...scene().objects[1], id: "knob" }] }), /objects\[1\].id "knob" is not unique/],
    [scene({ objects: [{ ...scene().objects[1], relief: { face: "bulge", rect: [0, 0, 1, 1], height: 1, material: "face" } }] }), /objects\[0\].relief.face requires one of raised/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], emitter: 0 }] }] }), /objects\[0\].parts\[0\].emitter requires an index into emitters/],
    [scene({ primitives: Array.from({ length: 255 }, () => scene().primitives[0]) }), /primitives and objects together exceed 256/],
    [scene({ objects: [{ ...scene().objects[0], parts: [{ ...scene().objects[0].parts[0], colour: "#fff" }] }] }), /objects\[0\].parts\[0\].colour is not a field/],
    [scene({ materials: { ...scene().materials, metal: { base: { colour: "white" } } } }), /materials.metal.base.colour requires a #rrggbb colour/],
    [scene({ shadow: { strength: 0.2, map: { size: 1024 } } }), /shadow.map.size requires 2048 or 4096/],
    [scene({ protected: [[0, 0, -1, 4]] }), /protected\[0\] requires \[x, y, width, height\]/],
  ];
  for (const [value, expected] of cases) assert.throws(() => validateInstrumentScene(value), expected);
  // The parts cap of the format (the 2,048 budget is the renderer's, a step-down, not an error).
  const many = Array.from({ length: 129 }, (_, index) => ({ id: `o${index}`, rect: [0, 0, 10, 10], parts: Array.from({ length: 64 }, () => ({ kind: "cap", profile: "cap", at: [5, 5, 0], material: "metal" })) }));
  assert.throws(() => validateInstrumentScene(scene({ primitives: [], objects: many })), /objects hold more than 8192 parts/);
  const budget = validateInstrumentScene(scene({ primitives: [], objects: many.slice(0, 33) }));
  assert.equal(budget.objects.reduce((sum, object) => sum + object.parts.length, 0), 2112, "a scene above the 2,048 budget still validates");
  // Later items' fields are accepted and kept.
  const later = validateInstrumentScene(scene({ emitters: [{ position: [45, 45, 10], colour: [1, 0.6, 0.2], strength: 4, radius: 60 }], protected: "extent",
    post: { taa: true }, shadow: { strength: 0.24, map: { size: 2048 } } }));
  assert.equal(later.emitters[0].reach, "outset");
  assert.equal(later.emitters[0].face, 1);
  assert.equal(later.feather, 4);
  assert.deepEqual(later.post, { smaa: true, bloom: true, taa: true, contact: false, ssgi: false });
  assert.deepEqual(later.shadow.map, { size: 2048, bias: 1.95, darkness: 0.1 });
});

test("profiles resolve to the triangles the format describes", () => {
  const lathe = profileGeometry(knobProfile(18, 14));
  assert.equal(lathe.positions.length / 3, 4 * 49, "one ring of segments + 1 vertices per profile point");
  assert.equal(lathe.indices.length, 3 * 2 * 48 * 3, "two triangles per segment and band");
  for (let index = 0; index < lathe.positions.length; index += 3) {
    const r = Math.hypot(lathe.positions[index], lathe.positions[index + 1]);
    assert.ok(r <= 18 + 1e-6 && lathe.positions[index + 2] >= 0 && lathe.positions[index + 2] <= 14 + 1e-6);
    assert.ok(Math.abs(Math.hypot(lathe.normals[index], lathe.normals[index + 1], lathe.normals[index + 2]) - 1) < 1e-6, "unit normals");
  }
  const prism = profileGeometry({ type: "prism", width: 30, length: 42, radius: 3, height: 12, taper: 2.5, chamfer: 1 });
  const xs = [], ys = [], zs = [];
  for (let index = 0; index < prism.positions.length; index += 3) { xs.push(prism.positions[index]); ys.push(prism.positions[index + 1]); zs.push(prism.positions[index + 2]); }
  assert.deepEqual([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(value => Math.round(value * 1e6) / 1e6), [-15, 15, -21, 21], "the base is width by length");
  assert.equal(Math.max(...zs), 12);
  // The top is inset by taper + chamfer: every vertex at the full height lies 3.5 px inside the base outline.
  for (let index = 0; index < xs.length; index++) if (zs[index] === 12) assert.ok(Math.abs(xs[index]) <= 11.5 + 1e-6 && Math.abs(ys[index]) <= 17.5 + 1e-6);
  const extrude = profileGeometry({ type: "extrude", outline: [[-10, 0], [10, 0], [6, 4], [-6, 4]], width: 8 });
  const ey = [];
  for (let index = 1; index < extrude.positions.length; index += 3) ey.push(extrude.positions[index]);
  assert.deepEqual([Math.min(...ey), Math.max(...ey)], [-4, 4], "the outline is extruded across its width along y");
  assert.equal(extrude.indices.length % 3, 0);
  assert.equal(profileGeometry(knobProfile(18, 14)), lathe, "geometry is cached per parameter set");
});

test("every profile winds its triangles against their outward normals, the way Lite's front faces wind", () => {
  // Lite's double-sided PBR flips the normal of a back face; a prism or extrude wound the other way was drawn dark.
  const shapes = [knobProfile(18, 14), { type: "prism", width: 30, length: 42, radius: 3, height: 12, taper: 0.6, chamfer: 2 },
    { type: "extrude", outline: [[-25, 0], [25, 0], [25, 3], [0, 5], [-25, 3]], width: 28 }, { type: "extrude", outline: [[-25, 3], [0, 5], [25, 3], [25, 0], [-25, 0]], width: 28 },
    { type: "lathe", points: [[27, 0, 1, 0], [27, 3, 1, 0], [27, 3, 0, 1], [22, 3, 0, 1], [22, 3, -1, 0], [22, 0, -1, 0]], segments: 32 }];
  for (const shape of shapes) {
    const { positions: p, normals: n, indices } = profileGeometry(shape);
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
    assert.ok(checked > 0);
  }
});

test("poses mix between their stops, clamp at them, and stay rigid", () => {
  const value = validateInstrumentScene(scene());
  const pointer = value.objects[0].parts[1];
  assert.deepEqual(poseAt(pointer, -2), poseAt(pointer, 0), "t below 0 is the first stop");
  assert.deepEqual(poseAt(pointer, 7), poseAt(pointer, 1), "t above 1 is the last stop");
  assert.equal(poseAt(pointer, 0.25).turn, -67.5);
  // Clockwise as seen (y down): a quarter turn takes +x to +y.
  const turn = partMatrix({ kind: "cap", profile: "p", at: [0, 0, 0], material: "m", pose: { from: { turn: 90 }, to: { turn: 90 } } }, 0);
  assert.deepEqual(transform(turn, 1, 0, 0).map(n => Math.round(n * 1e9) / 1e9), [0, 1, 0]);
  // A positive tilt about the x axis (axis 0) raises the side at axis + 90° (+y).
  const tilt = partMatrix({ kind: "lever", profile: "p", at: [0, 0, 0], material: "m", pose: { from: { tilt: 30 }, to: { tilt: 30 } } }, 0);
  assert.ok(transform(tilt, 0, 1, 0)[2] > 0.49);
  // The pivot stays put, and the placement is rigid (no scale, no shear).
  const pivoted = partMatrix({ kind: "lever", profile: "p", at: [10, 20, 3], material: "m", pose: { from: { tilt: 25, axis: 30, pivot: [0, 0, 5] }, to: { tilt: 25, axis: 30, pivot: [0, 0, 5] } } }, 0);
  assert.deepEqual(transform(pivoted, 0, 0, 5).map(n => Math.round(n * 1e9) / 1e9), [10, 20, 8]);
  for (const column of [0, 1, 2]) assert.ok(Math.abs(Math.hypot(pivoted[column * 4], pivoted[column * 4 + 1], pivoted[column * 4 + 2]) - 1) < 1e-12);
  // Travel and slide translate.
  const slid = partMatrix({ kind: "carriage", profile: "p", at: [5, 5, 0], material: "m", pose: { from: { slide: [0, 0] }, to: { slide: [0, 80], travel: -2 } } }, 0.5);
  assert.deepEqual(transform(slid, 0, 0, 0), [5, 45, -1]);
});

test("the camera rule and I0.2's box rule give the probes' numbers", () => {
  const stage = { width: 1920, height: 1080 }, r = Math.hypot(1920, 1080) / 2;
  assert.ok(Math.abs(drift(r, 14.8, 2400) - 6.83) < 0.01, "I0.1: the pointer's drift at the corner is 6.83 px");
  assert.equal(boxMargin(14.8), 8, "I0.2: knob cap and pointer margin 8");
  assert.equal(boxMargin(8), 5, "I0.2: knob skirt margin 5");
  assert.equal(cameraDistance(stage, [{ height: 14.8, inset: 9 }, { height: 8, inset: 4.5 }]), 2400, "I0.1: 2,400 at 1920 × 1080");
  assert.ok(cameraDistance({ width: 3840, height: 2160 }, [{ height: 14.8, inset: 9 }]) > 2400, "a larger stage raises D");
});

/** One object: a knob cap of radius 18 and height `h` in a square box with `margin` on every side, at stage point (x, y). */
function knobAt(x, y, h, margin) {
  const side = 36 + 2 * margin;
  return { id: "k", rect: [x - side / 2, y - side / 2, side, side], bounds: { rect: [x - side / 2, y - side / 2, side, side], radius: 0 }, t: 0,
    parts: [{ kind: "cap", profile: "cap", at: [x, y, 0], material: "metal", pose: { from: { turn: -135 }, to: { turn: 135 } } }] };
}
const placement = (distance = 2400) => ({ matrix: { a: 1, b: 0, c: 0, d: 0 + 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance });

test("containment holds for a box sized by the rule, and fails in a stage corner with a smaller box", () => {
  const profiles = { cap: knobProfile(18, 14.8) };
  const margin = boxMargin(14.8);
  // At the exact top-left corner of a 1920 × 1080 stage, 1 px in.
  const corner = knobAt(1 + 18 + margin, 1 + 18 + margin, 14.8, margin);
  const ok = checkContainment(corner, profiles, containmentFrontier(corner, profiles), placement());
  assert.equal(ok.contained, true, `the rule's box contains the cap at the corner: ${JSON.stringify(ok)}`);
  assert.ok(ok.inset >= 0.5);
  // Four px less margin: contained at the centre, not at the corner (the stage-corner drift case). The rule is
  // conservative (it takes the whole radial drift on each axis), so a little less than its margin still passes.
  const tight = margin - 4;
  const centre = knobAt(960, 540, 14.8, tight);
  assert.equal(checkContainment(centre, profiles, containmentFrontier(centre, profiles), placement()).contained, true, "drift is 0 at the vanishing point");
  const cornered = knobAt(1 + 18 + tight, 1 + 18 + tight, 14.8, tight);
  const failed = checkContainment(cornered, profiles, containmentFrontier(cornered, profiles), placement());
  assert.equal(failed.contained, false);
  assert.equal(failed.exact, true, "the frontier bound failed, so every vertex was projected");
  assert.equal(failed.part, 0);
  assert.ok(failed.inset < 0.5, `the binding vertex's inset is reported: ${failed.inset}`);
  // The exact projection agrees with projecting the binding vertex by hand.
  const vertices = posedVertices(cornered.parts[0], profiles.cap, 0);
  let least = Infinity;
  for (let index = 0; index < vertices.length; index += 3) {
    const k = 2400 / (2400 - vertices[index + 2]);
    least = Math.min(least, -roundedBoxDistance(960 + (vertices[index] - 960) * k, 540 + (vertices[index + 1] - 540) * k, cornered.bounds.rect, 0));
  }
  assert.ok(failed.inset <= least + 1e-9, "the whole travel includes the stop");
  // Moving the layer (its similarity) moves the verdict with it: the same object translated to the centre is contained.
  const moved = { ...placement(), matrix: { a: 1, b: 0, c: 0, d: 1, e: 960 - cornered.parts[0].at[0], f: 540 - cornered.parts[0].at[1], scale: 1 } };
  assert.equal(checkContainment(cornered, profiles, containmentFrontier(cornered, profiles), moved).contained, true);
});

test("containment samples the whole travel: a part that binds at mid-travel fails although both stops pass", () => {
  // A 3 × 3 × 30 px lever on a pivot at its base, tilting ±40° about the x axis: tallest (most drift) at mid-travel.
  const profiles = { lever: { type: "prism", width: 3, length: 3, height: 30, radius: 0, taper: 0, chamfer: 0 } };
  const at = [40, 40, 0];
  const lever = { id: "bat", rect: [28, 12, 24, 56], bounds: { rect: [28, 12, 24, 56], radius: 0 }, t: 0,
    parts: [{ kind: "lever", profile: "lever", at, material: "m", pose: { from: { tilt: -40 }, to: { tilt: 40 } } }] };
  const frontier = containmentFrontier(lever, profiles);
  assert.ok(frontier.steps >= 32);
  const result = checkContainment(lever, profiles, frontier, placement());
  // The stops alone: the lever's top leans along y, lower, and its drift at the corner (vanishing point far away) is smaller.
  const stopsOnly = [0, 1].map(t => {
    const vertices = posedVertices(lever.parts[0], profiles.lever, t);
    let least = Infinity;
    for (let index = 0; index < vertices.length; index += 3) {
      const k = 2400 / (2400 - vertices[index + 2]);
      least = Math.min(least, -roundedBoxDistance(960 + (vertices[index] - 960) * k, 540 + (vertices[index + 1] - 540) * k, lever.bounds.rect, 0));
    }
    return least;
  });
  assert.ok(stopsOnly.every(inset => inset >= 0.5), `both stops pass: ${stopsOnly}`);
  assert.equal(result.contained, false, `mid-travel binds: ${JSON.stringify(result)}`);
});

test("casters, kinds, structure and the face's step-down scene", () => {
  const value = validateInstrumentScene(scene());
  const cap = value.objects[0].parts[0];
  const caster = partCaster(cap, value.profiles.cap, 0.5);
  assert.deepEqual(caster.rect.map(n => Math.round(n * 1000) / 1000), [27, 27, 36, 36], "the footprint of a lathe of radius 18 at (45, 45)");
  assert.equal(Math.round(caster.radius * 1000) / 1000, 18);
  assert.equal(Math.round(caster.height * 1000) / 1000, 7, "at the part's mean height");
  // A sliding prism's caster follows its pose.
  const slid = partCaster({ kind: "carriage", profile: "p", at: [10, 10, 0], material: "m", pose: { from: { slide: [0, 0] }, to: { slide: [0, 40] } } },
    { type: "prism", width: 10, length: 6, radius: 2, height: 4 }, 0.5);
  assert.deepEqual(slid.rect.map(n => Math.round(n * 1000) / 1000), [5, 27, 10, 6]);
  assert.equal(slid.radius, 2);
  assert.equal(partCaster({ ...cap, caster: null }, value.profiles.cap, 0), null);
  assert.deepEqual(partCaster({ ...cap, caster: { rect: [1, 2, 3, 4], radius: 1, height: 2 } }, value.profiles.cap, 0).rect, [1, 2, 3, 4]);
  const kinds = partKinds(value);
  assert.deepEqual(kinds.map(kind => [kind.profile, kind.material, kind.captured, kind.instances.length]), [["cap", "metal", false, 1], ["pointer", "metal", false, 1], ["keyTop", "cap", true, 1]]);
  // A pose (t) or a state changes no structure; a new profile does.
  const moved = validateInstrumentScene({ ...scene(), objects: scene().objects.map(object => ({ ...object, t: 0.9 })) });
  assert.equal(instrumentStructure(moved), instrumentStructure(value));
  const resized = validateInstrumentScene(scene({ profiles: { ...scene().profiles, cap: knobProfile(19, 14) } }));
  assert.notEqual(instrumentStructure(resized), instrumentStructure(value));
  // More objects of the same kinds keep the structure (the meshes) and change the layout (the instances).
  const more = validateInstrumentScene(scene({ objects: [...scene().objects, { ...scene().objects[0], id: "knob2", rect: [200, 20, 50, 50] }] }));
  assert.equal(instrumentStructure(more), instrumentStructure(value));
  assert.notEqual(instrumentLayout(more), instrumentLayout(value));
  assert.equal(sameGeometry(moved, value), true, "t is not geometry");
  assert.equal(sameGeometry(more, value), false);
  const shifted = validateInstrumentScene({ ...scene(), objects: scene().objects.map((object, index) => (index ? object : { ...object, parts: object.parts.map(part => ({ ...part, at: [part.at[0] + 1, part.at[1], part.at[2]] })) })) });
  assert.equal(sameGeometry(shifted, value), false, "a part's anchor is geometry");
  const face = instrumentFaceScene(value, [1]);
  assert.equal(face.version, 1);
  assert.equal(face.primitives.length, 2);
  assert.deepEqual(face.primitives[1], value.objects[1].relief, "the stepped-down object's Relief primitive follows the face's own");
  assert.equal(instrumentFaceScene(value, [1]), face, "cached per step-down set");
  assert.equal(instrumentFaceScene(value, []).primitives.length, 1);
});

test("the layer's matrix must be a similarity", () => {
  // DOMMatrix-shaped values (Node has no DOMMatrix): rotation by 30° and scale 1.5, then the cases a mesh cannot follow.
  const c = Math.cos(Math.PI / 6) * 1.5, s = Math.sin(Math.PI / 6) * 1.5;
  const result = similarity({ a: c, b: s, c: -s, d: c, e: 10, f: 20, is2D: true });
  assert.ok(result && Math.abs(result.scale - 1.5) < 1e-9);
  assert.equal(similarity({ a: 2, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true }), undefined, "non-uniform scale");
  assert.equal(similarity({ a: 1, b: 0, c: 0.2, d: 1, e: 0, f: 0, is2D: true }), undefined, "shear");
  assert.equal(similarity({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0, is2D: true }), undefined, "a mirror");
  assert.equal(similarity({ a: 1, b: 0, c: 0, d: 0.94, e: 0, f: 0, is2D: false }), undefined, "a tilt");
});

test("containment follows the layer's similarity, sunk parts, rounded bounds and the camera plane", () => {
  const profiles = { cap: knobProfile(18, 14.8) };
  const margin = boxMargin(14.8);
  // The rule's box near the stage corner passes; the same layer rotated by 90° about the stage centre and scaled 1.5×
  // keeps it inside (the box scales with the layer, drift is measured on the canvas).
  const corner = knobAt(1 + 18 + margin, 1 + 18 + margin, 14.8, margin);
  const frontier = containmentFrontier(corner, profiles);
  const turned = { matrix: { a: 0, b: 1, c: -1, d: 0, e: 960 + 540, f: 540 - 960, scale: 1 }, vanish: [960, 540], distance: 2400 };
  assert.equal(checkContainment(corner, profiles, frontier, turned).contained, true, "rotated about the vanishing point");
  const scaled = { matrix: { a: 1.5, b: 0, c: 0, d: 1.5, e: 960 - 1.5 * 960, f: 540 - 1.5 * 540, scale: 1.5 }, vanish: [960, 540], distance: 2400 };
  const scaledResult = checkContainment(corner, profiles, frontier, scaled);
  assert.equal(scaledResult.contained, false, "scaled 1.5× about the centre, the corner knob lands past the canvas corner and its drift grows");
  // A sunk part drifts towards the vanishing point (by r·|h|/(D − h)); its frontier is kept apart from raised parts.
  const sunk = { ...corner, parts: [{ ...corner.parts[0], at: [corner.parts[0].at[0], corner.parts[0].at[1], -15] }] };
  const sunkFrontier = containmentFrontier(sunk, profiles);
  assert.ok(sunkFrontier.parts[0].some(pair => pair.height < 0), "below-face heights keep their own frontier");
  assert.equal(checkContainment(sunk, profiles, sunkFrontier, placement()).contained, true);
  // Rounded bounds: a square cap fits a square box but not a fully round one of the same size.
  const square = { cap: { type: "prism", width: 30, length: 30, radius: 0, height: 2 } };
  const boxed = { id: "s", rect: [945, 525, 30, 30], bounds: { rect: [940, 520, 40, 40], radius: 0 }, t: 0, parts: [{ kind: "cap", profile: "cap", at: [960, 540, 0], material: "m" }] };
  assert.equal(checkContainment(boxed, square, containmentFrontier(boxed, square), placement()).contained, true);
  const roundBox = { ...boxed, bounds: { rect: [940, 520, 40, 40], radius: 20 } };
  const round = checkContainment(roundBox, square, containmentFrontier(roundBox, square), placement());
  assert.equal(round.contained, false, "the square's corners leave a round bounds");
  assert.ok(round.overshoot > 0);
  // A part at or past the camera plane can never be contained.
  const tall = { cap: { type: "prism", width: 2, length: 2, radius: 0, height: 2400 } };
  const pole = { id: "p", rect: [950, 530, 20, 20], bounds: { rect: [950, 530, 20, 20], radius: 0 }, t: 0, parts: [{ kind: "pivot", profile: "cap", at: [960, 540, 0], material: "m" }] };
  const behind = checkContainment(pole, tall, containmentFrontier(pole, tall), placement());
  assert.equal(behind.contained, false);
  assert.equal(behind.inset, -Infinity);
});

test("an object's bounds must lie inside its layer's box", () => {
  const value = validateInstrumentScene(scene());
  assert.equal(boundsInside(value.objects[0], value.extent), true);
  assert.equal(boundsInside({ ...value.objects[0], bounds: { rect: [380, 20, 40, 40], radius: 0 } }, value.extent), false, "past the right edge");
  assert.equal(boundsInside({ ...value.objects[0], bounds: { rect: [-1, 20, 40, 40], radius: 0 } }, value.extent), false, "past the left edge");
  assert.equal(boundsInside({ ...value.objects[0], bounds: { rect: [360.4, 20, 40, 40], radius: 0 } }, value.extent), true, "within half a pixel of the edge");
  // The light and the environment are part of the structure: a change rebuilds the scene.
  const relit = validateInstrumentScene(scene({ light: { azimuth: 200, elevation: 41 } }));
  assert.notEqual(instrumentStructure(relit), instrumentStructure(value));
  const brighter = validateInstrumentScene(scene({ environment: { source: "studio", strength: 0.4 } }));
  assert.notEqual(instrumentStructure(brighter), instrumentStructure(value));
});
