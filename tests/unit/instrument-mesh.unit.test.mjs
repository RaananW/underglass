/**
 * Unit tests for custom parts (`packages/core/src/instrument-mesh.ts`, `instrument-gltf.ts`, `instrument-assets.ts`, core
 * work item 5): the mesh profile's validator with its reasons and caps, the winding convention, containment on the real
 * vertices (a mesh larger than its box, a turning one), the caster and its cap, the glB reader on the committed fixture and
 * on crafted files, the fixture's provenance, and the asset store's cache, budget and failures with a fake `fetch`. Pure
 * data, no browser; `tests/browser/core-custom.test.mjs` proves the decoded pixels. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fixtures, glb } from "../../scripts/make-custom-fixture.mjs";

const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const instrument = await import("../../packages/core/src/instrument.ts");
const mesh = await import("../../packages/core/src/instrument-mesh.ts");
const { readGltf, GltfError } = await import("../../packages/core/src/instrument-gltf.ts");
const { createAssetStore } = await import("../../packages/core/src/instrument-assets.ts");
sourceImports.deregister();
const { validateInstrumentScene, profileGeometry, containmentFrontier, checkContainment, partCaster, partKinds, instrumentStructure, customParts, meshReady, partDrawn, partMatrix } = instrument;

/** A closed unit-ish box as raw inline arrays, wound the way glTF winds (counter-clockwise from outside, the other way from core). */
function boxArrays(w, d, h, { outward = true } = {}) {
  const hx = w / 2, hy = d / 2;
  const positions = [], indices = [];
  const faces = [[[-hx, -hy, 0], [hx, -hy, 0], [hx, hy, 0], [-hx, hy, 0]], [[-hx, -hy, h], [-hx, hy, h], [hx, hy, h], [hx, -hy, h]],
    [[-hx, -hy, 0], [-hx, -hy, h], [hx, -hy, h], [hx, -hy, 0]], [[hx, hy, 0], [hx, hy, h], [-hx, hy, h], [-hx, hy, 0]],
    [[hx, -hy, 0], [hx, -hy, h], [hx, hy, h], [hx, hy, 0]], [[-hx, hy, 0], [-hx, hy, h], [-hx, -hy, h], [-hx, -hy, 0]]];
  for (const corners of faces) {
    const start = positions.length / 3;
    for (const corner of corners) positions.push(...corner);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  if (!outward) for (let t = 0; t < indices.length; t += 3) [indices[t + 1], indices[t + 2]] = [indices[t + 2], indices[t + 1]];
  return { positions, indices };
}
/** The convention: `(b − a) × (c − a)` points against every vertex normal of its triangle. */
function windingErrors(geometry) {
  let wrong = 0;
  const { positions: p, normals: n, indices } = geometry;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const e1 = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]), e2 = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const along = [0, 1, 2].reduce((sum, k) => sum + cross[k] * (n[a * 3 + k] + n[b * 3 + k] + n[c * 3 + k]), 0);
    if (along > 1e-9) wrong++;
  }
  return wrong;
}

const base = () => ({
  format: "strata-scene", version: 4, kind: "instrument",
  camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 0.8 },
  extent: { width: 400, height: 200 }, outset: { top: 8, right: 8, bottom: 8, left: 8 }, backdrop: "#e7e8ea",
  light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 },
  interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 },
  focus: { colour: "#2563eb", width: 2, offset: 2 }, materials: { face: { base: { roughness: 0.6 } }, metal: { base: { colour: "#ecedf0", metallic: 1, roughness: 0.3 } } },
  primitives: [{ face: "raised", rect: [0, 0, 400, 200], radius: 14, height: 6, material: "face" }],
  profiles: {}, objects: [],
});
/** A scene with one object holding one custom part of `profile` at (100, 100), the object's box 80 × 80 around it. */
function withPart(profile, { pose, caster, kind = "custom", at = [100, 100, 0], rect = [60, 60, 80, 80] } = {}) {
  const scene = base();
  scene.profiles.piece = profile;
  scene.objects = [{ id: "one", rect, bounds: { rect, radius: 0 }, t: 0, parts: [{ kind, profile: "piece", at, material: "metal", ...(pose ? { pose } : {}), ...(caster !== undefined ? { caster } : {}) }] }];
  return scene;
}
const inlineBox = (w = 20, d = 20, h = 10, extra = {}) => ({ type: "mesh", ...boxArrays(w, d, h), normals: "compute", ...extra });

test("an inline mesh validates, keeps its triangles and is wound against its normals", () => {
  const scene = validateInstrumentScene(withPart(inlineBox()));
  const shape = scene.profiles.piece;
  assert.equal(shape.type, "mesh");
  assert.match(shape.id, /^inline:[0-9a-f]{8}$/);
  const geometry = profileGeometry(shape);
  assert.equal(geometry.positions.length, 72);
  assert.equal(geometry.indices.length, 36);
  assert.equal(geometry.uvs.length, 48, "planar UVs are made when none are given");
  assert.equal(windingErrors(geometry), 0);
  assert.deepEqual(customParts(scene), [{ object: 0, part: 0, profile: "piece" }]);
  assert.equal(meshReady(shape), true);
  assert.equal(partDrawn(scene.objects[0].parts[0], scene.profiles), true);
  // Computed normals of a closed box point out of it: the top's normal is +z, up from the face.
  const top = [...geometry.normals].filter((_, at) => at % 3 === 2 && geometry.positions[at] === 10).length;
  assert.ok(top >= 4, "the top's vertices face +z");
});

test("normals: given ones decide the winding, computed ones come from a closed mesh whichever way it is wound", () => {
  const outward = validateInstrumentScene(withPart(inlineBox())).profiles.piece, inward = validateInstrumentScene(withPart({ type: "mesh", ...boxArrays(20, 20, 10, { outward: false }), normals: "compute" })).profiles.piece;
  assert.equal(windingErrors(profileGeometry(outward)), 0);
  assert.equal(windingErrors(profileGeometry(inward)), 0);
  // A welded cube (closed: every edge shared) wound either way gets outward normals: the top's corners face up, the bottom's down.
  const corners = [[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 10], [10, 0, 10], [10, 10, 10], [0, 10, 10]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  for (const reversed of [false, true]) {
    const cube = quads.flatMap(([a, b, c, d]) => (reversed ? [a, c, b, a, d, c] : [a, b, c, a, c, d]));
    const welded = profileGeometry(validateInstrumentScene(withPart({ type: "mesh", positions: corners.flat(), indices: cube, normals: "compute" })).profiles.piece);
    assert.equal(windingErrors(welded), 0);
    for (let vertex = 0; vertex < 8; vertex++) assert.ok(welded.normals[vertex * 3 + 2] * (vertex < 4 ? -1 : 1) > 0.2, `corner ${vertex} faces away from the cube (reversed: ${reversed})`);
  }
  // Given normals decide: a quad wound clockwise from its +z normals is turned round.
  const quad = { type: "mesh", positions: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], indices: [0, 1, 2, 0, 2, 3] };
  const flipped = { ...quad, indices: [0, 2, 1, 0, 3, 2] };
  for (const profile of [quad, flipped]) assert.equal(windingErrors(profileGeometry(validateInstrumentScene(withPart(profile)).profiles.piece)), 0);
  // An open mesh with computed normals keeps its authored winding: a quad whose cross points up gets normals pointing down (core's convention).
  const open = { type: "mesh", positions: quad.positions, indices: quad.indices, normals: "compute" };
  const geometry = profileGeometry(validateInstrumentScene(withPart(open)).profiles.piece);
  assert.ok(geometry.normals[2] < 0, "against (b − a) × (c − a)");
  assert.equal(windingErrors(geometry), 0);
});

test("the validator refuses malformed geometry with a reason and a path", () => {
  const cases = [
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, NaN, 0], indices: [0, 1, 2], normals: "compute" }, /profiles.piece.positions\[7\] requires a finite number/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 1e9], indices: [0, 1, 2], normals: "compute" }, /profiles.piece.positions\[8\] requires a finite number within ±10000/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1], indices: [0, 1, 2], normals: "compute" }, /positions requires a multiple of 3/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 1], normals: "compute" }, /indices\[0\] names a degenerate triangle \(0, 1, 1\)/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 3], normals: "compute" }, /indices\[2\] requires an integer below the vertex count \(3\)/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2, 0], normals: "compute" }, /indices requires a multiple of 3/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, /normals is missing: give one normal per vertex, or set normals: "compute"/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [0, 0, 1] }, /normals requires 9 numbers/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: [0, 0, 1, 0, 0, 0, 0, 0, 1] }, /normals\[3\] names a normal of length 0/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: "compute", uvs: [0, 0] }, /uvs requires 6 numbers/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: "compute", bounds: { low: [0, 0, 0], high: [1, 0.5, 0] } }, /bounds does not hold the mesh: vertex 2 is 1 on axis y/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: "compute", bounds: { low: [1, 0, 0], high: [0, 1, 0] } }, /bounds requires low to be at most high/],
    [{ type: "mesh", positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2], normals: "compute", mesh: "x" }, /profiles.piece.mesh is not a field of a mesh profile/],
    [{ type: "mesh", source: { url: "a.glb" } }, /bounds is required on a reference/],
    [{ type: "mesh", source: { url: "a.glb", data: new ArrayBuffer(4) }, bounds: { low: [0, 0, 0], high: [1, 1, 1] } }, /source requires a url or data \(an ArrayBuffer\), not both/],
    [{ type: "mesh", source: { data: [1, 2] }, bounds: { low: [0, 0, 0], high: [1, 1, 1] } }, /source.data requires an ArrayBuffer/],
    [{ type: "mesh", source: { url: "a.glb" }, positions: [0], bounds: { low: [0, 0, 0], high: [1, 1, 1] } }, /positions is for inline meshes/],
    [{ type: "mesh", source: { url: "a.glb" }, scale: 0, bounds: { low: [0, 0, 0], high: [1, 1, 1] } }, /scale requires a number in 1e-6..1e6/],
    [{ type: "mesh", ...boxArrays(1, 1, 1), normals: "compute", scale: 2 }, /scale is for a reference/],
  ];
  for (const [profile, expected] of cases) assert.throws(() => validateInstrumentScene(withPart(profile)), expected, JSON.stringify(profile).slice(0, 90));
  // The part's own rules.
  assert.throws(() => validateInstrumentScene({ ...withPart(inlineBox()), objects: [{ ...withPart(inlineBox()).objects[0], parts: [{ ...withPart(inlineBox()).objects[0].parts[0], captured: true }] }] }), /captured is not for custom parts/);
  assert.throws(() => validateInstrumentScene(withPart({ type: "prism", width: 10, length: 10, height: 4 })), /profile of a custom part requires a profile of type "mesh"/);
  // Any kind may use a mesh profile (a custom cap replaces the built-in one).
  assert.doesNotThrow(() => validateInstrumentScene(withPart(inlineBox(), { kind: "cap" })));
});

test("the caps: vertices and triangles per mesh", () => {
  const side = 129, positions = [], indices = [];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) positions.push(x * 0.1, y * 0.1, 0);
  assert.equal(positions.length / 3, 16641, "a grid just above the 16,384 vertices");
  for (let y = 0; y + 1 < side; y++) for (let x = 0; x + 1 < side; x++) indices.push(y * side + x, y * side + x + 1, (y + 1) * side + x);
  assert.throws(() => validateInstrumentScene(withPart({ type: "mesh", positions, indices, normals: "compute" })), /positions holds 16641 vertices, above the 16384 a mesh may have/);
  const fine = 100, points = [], many = [];
  for (let y = 0; y < fine; y++) for (let x = 0; x < fine; x++) points.push(x * 0.1, y * 0.1, 0);
  for (let y = 0; y + 1 < fine; y++) for (let x = 0; x + 1 < fine; x++) many.push(y * fine + x, y * fine + x + 1, (y + 1) * fine + x, y * fine + x + 1, (y + 1) * fine + x + 1, (y + 1) * fine + x);
  assert.equal(many.length / 3, 19602);
  assert.doesNotThrow(() => validateInstrumentScene(withPart({ type: "mesh", positions: points, indices: many, normals: "compute" })), "19,602 triangles are under the cap");
  const over = [...many, ...many.slice(0, 3 * 13200)];
  assert.throws(() => validateInstrumentScene(withPart({ type: "mesh", positions: points, indices: over, normals: "compute" })), /indices holds 32802 triangles, above the 32768 a mesh may have/);
});

test("validating again with the same arrays is cached and gives the same profile", () => {
  const profile = inlineBox();
  const first = validateInstrumentScene(withPart(profile)), second = validateInstrumentScene(withPart({ ...profile }));
  assert.equal(first.profiles.piece, second.profiles.piece, "the same arrays: one validated profile");
  const copy = validateInstrumentScene(withPart({ ...profile, positions: [...profile.positions], indices: [...profile.indices] }));
  assert.notEqual(copy.profiles.piece, first.profiles.piece);
  assert.equal(copy.profiles.piece.id, first.profiles.piece.id, "equal content: equal identity, so no rebuild");
  assert.equal(instrumentStructure(copy), instrumentStructure(first));
  // A re-validated scene is accepted again (its profiles carry typed arrays and an id).
  assert.doesNotThrow(() => validateInstrumentScene(first));
  // The pivot is the default of a pose that gives none.
  const posed = validateInstrumentScene(withPart({ ...profile, pivot: [3, 4, 5] }, { pose: { from: { turn: 0 }, to: { turn: 90 } } }));
  assert.deepEqual(posed.objects[0].parts[0].pose.from.pivot, [3, 4, 5]);
  const given = validateInstrumentScene(withPart({ ...profile, pivot: [3, 4, 5] }, { pose: { from: { turn: 0, pivot: [1, 1, 0] }, to: { turn: 90, pivot: [1, 1, 0] } } }));
  assert.deepEqual(given.objects[0].parts[0].pose.from.pivot, [1, 1, 0]);
});

const placement = (scene, matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }) => ({ matrix, vanish: [960, 540], distance: scene.camera.distance });
function contained(scene, object = scene.objects[0]) {
  const frontier = containmentFrontier(object, scene.profiles);
  return checkContainment(object, scene.profiles, frontier, placement(scene));
}

test("containment runs on the mesh's vertices: a mesh larger than its box is refused, a smaller one passes", () => {
  const fits = validateInstrumentScene(withPart(inlineBox(40, 40, 10)));
  assert.equal(contained(fits).contained, true, "40 × 40 in an 80 × 80 box");
  const tooWide = validateInstrumentScene(withPart(inlineBox(100, 40, 10)));
  const result = contained(tooWide);
  assert.equal(result.contained, false, "100 wide in an 80 box");
  assert.ok(result.overshoot > 9.5, `overshoots by ${result.overshoot}`);
  // The box rule: height drifts a part outward; a tall mesh whose base touches the edge fails.
  const edge = validateInstrumentScene(withPart(inlineBox(79, 40, 30)));
  assert.equal(contained(edge).contained, false, "no margin left for the drift of a 30 px tall part");
  // A hollow part is checked on its vertices, not its declared box: a declared box that holds only part of it is refused at validation.
  assert.throws(() => validateInstrumentScene(withPart(inlineBox(100, 40, 10, { bounds: { low: [-10, -10, 0], high: [10, 10, 10] } }))), /bounds does not hold the mesh/);
});

test("containment sees a mesh turn: a long bar fits unturned and not at 90 degrees", () => {
  const bar = { type: "mesh", ...boxArrays(70, 10, 4), normals: "compute" };
  const wide = { rect: [60, 75, 80, 50] };
  const still = validateInstrumentScene(withPart(bar, wide));
  assert.equal(contained(still).contained, true, "70 × 10 in an 80 × 50 box");
  const turning = validateInstrumentScene(withPart({ ...bar, positions: [...bar.positions] }, { ...wide, pose: { from: { turn: 0 }, to: { turn: 90 } } }));
  const result = contained(turning);
  assert.equal(result.contained, false, "turned to 90° it is 10 × 70 in a box 50 high");
  assert.ok(result.overshoot > 9, `overshoots the box's top and bottom by ${result.overshoot}`);
  const half = validateInstrumentScene(withPart({ ...bar, positions: [...bar.positions] }, { ...wide, pose: { from: { turn: 0 }, to: { turn: 20 } } }));
  assert.equal(contained(half).contained, true, "20°: the corner reaches 35·sin20 + 5·cos20 = 16.7 < 25");
});

test("a pending reference is neither drawn nor checked, and a loaded one is checked on its vertices", () => {
  const reference = { type: "mesh", source: { url: "x.glb", mesh: "Cap" }, bounds: { low: [-18, -18, 0], high: [18, 18, 11] } };
  const scene = validateInstrumentScene(withPart(reference));
  const shape = scene.profiles.piece;
  assert.equal(meshReady(shape), false);
  assert.equal(partDrawn(scene.objects[0].parts[0], scene.profiles), false);
  assert.equal(profileGeometry(shape).positions.length, 9, "the placeholder is one triangle");
  assert.deepEqual([...profileGeometry(shape).positions], [-18, -18, 0, 18, 18, 11, 18, 18, 11], "spanning the declared box, with no area");
  const keyBefore = instrumentStructure(scene);
  const geometry = mesh.buildGeometry(new Float32Array(boxArrays(20, 20, 10).positions), undefined, new Uint32Array(boxArrays(20, 20, 10).indices));
  mesh.setMeshGeometry(shape, geometry);
  assert.equal(meshReady(shape), true);
  assert.equal(instrumentStructure(scene), keyBefore, "a load is not a structure change: no rebuild");
  assert.equal(partDrawn(scene.objects[0].parts[0], scene.profiles), true);
  assert.equal(profileGeometry(shape), geometry);
  // The containment key changes with readiness: the frontier is computed again with the real vertices.
  assert.notEqual(instrument.containmentKey(scene.objects[0], scene.profiles), instrument.containmentKey(scene.objects[0], { piece: { ...shape, id: shape.id } }) + "x");
});

test("the caster follows the mesh's footprint and keeps its shadow in the box", () => {
  // A disc-like mesh: a 24-gon prism.
  const sides = 24, positions = [], indices = [];
  for (let step = 0; step < sides; step++) { const angle = (step / sides) * Math.PI * 2; positions.push(Math.cos(angle) * 10, Math.sin(angle) * 10, 0, Math.cos(angle) * 10, Math.sin(angle) * 10, 8); }
  positions.push(0, 0, 0, 0, 0, 8);
  for (let step = 0; step < sides; step++) {
    const next = (step + 1) % sides;
    indices.push(step * 2, next * 2, step * 2 + 1, step * 2 + 1, next * 2, next * 2 + 1, sides * 2 + 1, step * 2 + 1, next * 2 + 1, sides * 2, next * 2, step * 2);
  }
  const disc = validateInstrumentScene(withPart({ type: "mesh", positions, indices, normals: "compute" }, { rect: [0, 0, 200, 200], at: [100, 100, 0] }));
  const part = disc.objects[0].parts[0], shape = disc.profiles.piece;
  const caster = partCaster(part, shape, 0);
  assert.ok(Math.abs(caster.rect[2] - 20) < 0.5 && Math.abs(caster.rect[3] - 20) < 0.5, `20 × 20 footprint, got ${caster.rect}`);
  assert.ok(caster.radius > 9, `a disc's radius is nearly half its width, got ${caster.radius}`);
  assert.ok(Math.abs(caster.height - 4) < 1e-6, "the mean height of 0..8");
  // A box is square.
  const square = validateInstrumentScene(withPart(inlineBox(20, 20, 8), { rect: [0, 0, 200, 200] }));
  assert.ok(partCaster(square.objects[0].parts[0], square.profiles.piece, 0).radius < 1);
  // The cap: a box 100 wide with the part at its left edge leaves room only for a short shadow.
  const light = [0.9, -0.9];
  const tight = partCaster(part, shape, 0, undefined, { box: [88, 90, 24, 24], light });
  assert.ok(tight === null || tight.height < caster.height, "the height is capped in a tight box");
  const room = partCaster(part, shape, 0, undefined, { box: [0, 0, 200, 200], light });
  assert.equal(room.height, caster.height, "uncapped when the box has room");
  // The cap is exact: at the capped height the shadow's reach meets the box.
  if (tight) {
    const [x, y, w, h] = tight.rect, reach = 1.5 * tight.height + 1;
    const edges = [x - light[0] * tight.height - reach, x + w - light[0] * tight.height + reach, y - light[1] * tight.height - reach, y + h - light[1] * tight.height + reach];
    assert.ok(edges[0] >= 88 - 1e-6 && edges[1] <= 112 + 1e-6 && edges[2] >= 90 - 1e-6 && edges[3] <= 114 + 1e-6, `the shadow ${edges} stays in 88..112 × 90..114`);
  }
  // An explicit caster is honoured as given.
  const explicit = { rect: [0, 0, 5, 5], radius: 0, height: 99 };
  assert.deepEqual(partCaster({ ...part, caster: explicit }, shape, 0, undefined, { box: [0, 0, 1, 1], light }), explicit);
  assert.equal(partCaster({ ...part, caster: null }, shape, 0), null);
});

test("the fixture is what the script makes, and the reader reads its meshes", () => {
  const committed = readFileSync(new URL("../../examples/playground/public/custom/parts.glb", import.meta.url));
  assert.ok(committed.equals(fixtures()["parts.glb"]), "examples/playground/public/custom/parts.glb is generated by scripts/make-custom-fixture.mjs");
  assert.ok(committed.length < 200 * 1024, `${committed.length} bytes`);
  const bytes = committed.buffer.slice(committed.byteOffset, committed.byteOffset + committed.byteLength);
  const request = { scale: 1, offset: [0, 0, 0] };
  const cap = readGltf(bytes, { ...request, mesh: "Cap" });
  assert.equal(cap.positions.length / 3, 7 * 65);
  assert.equal(cap.indices.length / 3, 6 * 64 * 2);
  const box = mesh.geometryBox(cap);
  assert.ok(Math.abs(box.high[2] - 10.5) < 1e-4 && Math.abs(box.low[2]) < 1e-4, "glTF y is the part's z (up from the face)");
  assert.ok(box.high[0] <= 18.4 && box.low[0] >= -18.4 && box.high[1] <= 18.4, "radius 18 plus the flutes");
  assert.equal(windingErrors(cap), 0, "every triangle is wound against its normals");
  const unit = Array.from({ length: cap.normals.length / 3 }, (_, at) => Math.hypot(cap.normals[at * 3], cap.normals[at * 3 + 1], cap.normals[at * 3 + 2]));
  assert.ok(unit.every(length => Math.abs(length - 1) < 1e-3));
  // The cap's top points up (+z in the part's axes).
  const topVertices = Array.from({ length: cap.positions.length / 3 }, (_, at) => at).filter(at => cap.positions[at * 3 + 2] > 10.4);
  assert.ok(topVertices.length > 0 && topVertices.every(at => cap.normals[at * 3 + 2] > 0.9));
  // The scale and the offset fit it.
  const scaled = readGltf(bytes, { mesh: "Cap", scale: 2, offset: [5, 6, 7] });
  const scaledBox = mesh.geometryBox(scaled);
  assert.ok(Math.abs(scaledBox.high[2] - (21 + 7)) < 1e-3 && Math.abs(scaledBox.low[0] - (-36.8 + 5)) < 1);
  // A mesh with no NORMAL: computed from a closed mesh, wound right, its top up.
  const block = readGltf(bytes, { ...request, mesh: "Block" });
  assert.equal(windingErrors(block), 0);
  const upFacing = Array.from({ length: block.positions.length / 3 }, (_, at) => at).filter(at => block.normals[at * 3 + 2] > 0.99);
  assert.equal(upFacing.length, 4, "the box's top (4 vertices) faces up");
  assert.ok(upFacing.every(at => Math.abs(block.positions[at * 3 + 2] - 6) < 1e-4), "...at its full height");
  assert.equal(Array.from({ length: block.positions.length / 3 }, (_, at) => at).filter(at => block.normals[at * 3 + 2] < -0.99).length, 4, "and its bottom faces down");
  // By node name, and the one-mesh rule.
  assert.equal(readGltf(bytes, { ...request, mesh: "LeverNode" }).indices.length / 3, 12);
  assert.throws(() => readGltf(bytes, request), /the file has 5 meshes \(Cap, Lever, Block, Slab, Dense\): name one with source.mesh/);
  assert.throws(() => readGltf(bytes, { ...request, mesh: "Nope" }), /no mesh or node named "Nope" \(it has: Cap, Lever, Block, Slab, Dense\)/);
  const dense = readGltf(bytes, { ...request, mesh: "Dense" });
  assert.equal(dense.positions.length / 3, 41 * 61);
  assert.equal(windingErrors(dense), 0);
  // Every triangle of every mesh is real (no repeated vertex).
  for (let t = 0; t < dense.indices.length; t += 3) assert.ok(dense.indices[t] !== dense.indices[t + 1] && dense.indices[t + 1] !== dense.indices[t + 2]);
});

test("the reader refuses what it cannot honour, with the reason, and caps before reading", () => {
  const ab = file => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const good = fixtures()["parts.glb"];
  const bytes = good.buffer.slice(good.byteOffset, good.byteOffset + good.byteLength);
  const request = { mesh: "Block", scale: 1, offset: [0, 0, 0] };
  assert.throws(() => readGltf(ab(fixtures()["malformed.glb"]), request), GltfError);
  assert.throws(() => readGltf(ab(fixtures()["malformed.glb"]), request), /a glB chunk runs past the end of the file/);
  assert.throws(() => readGltf(new ArrayBuffer(4), request), /too short/);
  assert.throws(() => readGltf(new TextEncoder().encode("not a model, just text of some length").buffer, request), /neither a glB nor a glTF/);
  assert.throws(() => readGltf(new TextEncoder().encode("{ broken json").buffer, request), /malformed/);
  /** A glTF (JSON with an embedded buffer) built by hand, to craft one defect at a time. */
  const gltf = (mutate, { count = 3 } = {}) => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0].slice(0, 9));
    const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "n", mesh: 0 }],
      meshes: [{ name: "m", primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
      accessors: [{ bufferView: 0, componentType: 5126, count, type: "VEC3" }], bufferViews: [{ buffer: 0, byteLength: positions.byteLength }],
      buffers: [{ byteLength: positions.byteLength, uri: `data:application/octet-stream;base64,${Buffer.from(positions.buffer).toString("base64")}` }] };
    mutate?.(json);
    return new TextEncoder().encode(JSON.stringify(json)).buffer;
  };
  const read = file => readGltf(file, { mesh: "m", scale: 1, offset: [0, 0, 0] });
  const triangle = read(gltf());
  assert.equal(triangle.indices.length, 3, "an embedded-buffer glTF without indices is read");
  assert.equal(windingErrors(triangle), 0);
  assert.throws(() => read(gltf(json => { json.extensionsRequired = ["KHR_draco_mesh_compression"]; })), /requires KHR_draco_mesh_compression/);
  assert.throws(() => read(gltf(json => { json.extensionsRequired = ["KHR_mesh_quantization"]; })), /requires KHR_mesh_quantization/);
  assert.throws(() => read(gltf(json => { json.nodes[0].skin = 0; })), /skinned/);
  assert.throws(() => read(gltf(json => { json.accessors[0].sparse = {}; })), /sparse accessors are not supported/);
  assert.throws(() => read(gltf(json => { json.accessors[0].componentType = 5122; })), /component type 5122 is not supported/);
  assert.throws(() => read(gltf(json => { json.meshes[0].primitives[0].mode = 5; })), /mode 5 is not supported/);
  assert.throws(() => read(gltf(json => { json.buffers[0].uri = "scene.bin"; })), /buffer 0 is external/);
  assert.throws(() => read(gltf(json => { json.accessors[0].count = 99; })), /it reads past its buffer/);
  assert.throws(() => read(gltf(json => { json.meshes[0].primitives[0].attributes = {}; })), /has no POSITION/);
  assert.throws(() => read(gltf(json => { json.asset.version = "1.0"; })), /not glTF 2.0/);
  assert.throws(() => read(gltf(json => { json.nodes[0].children = [0]; })), /too deep or loops/);
  // The caps come before any read: a count above the cap is refused though the buffer holds nothing like it.
  assert.throws(() => read(gltf(json => { json.accessors[0].count = 20000; })), /20000 vertices or more, above the 16384/);
  assert.throws(() => read(gltf(json => { json.meshes[0].primitives[0].indices = 1; json.accessors.push({ bufferView: 0, componentType: 5125, count: 3 * 40000, type: "SCALAR" }); })), /more than 32768 triangles/);
  // A hand-made glB with a binary chunk works the same as the fixture's.
  assert.equal(readGltf(bytes, request).indices.length / 3, 12);
  // A node transform places the mesh: translated 5 in glTF x, 2 in y.
  const moved = read(gltf(json => { json.nodes[0].translation = [5, 2, 0]; }));
  const box = mesh.geometryBox(moved);
  assert.ok(Math.abs(box.low[0] - 5) < 1e-6 && Math.abs(box.low[2] - 2) < 1e-6);
  void glb;
});

/** A fake `fetch`: files by URL, with a count of requests. */
function network(files, { delay = 0 } = {}) {
  const log = [];
  const fetch = async (url, { signal } = {}) => {
    log.push(url);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    signal?.throwIfAborted();
    const file = files[url];
    if (!file) return new Response("not found", { status: 404 });
    return new Response(file, { status: 200, headers: { "content-length": String(file.length) } });
  };
  return { fetch, log };
}
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const referenceScene = (url, meshName = "Cap", bounds = { low: [-19, -19, 0], high: [19, 19, 11] }, extra = {}) =>
  validateInstrumentScene(withPart({ type: "mesh", source: { url, mesh: meshName }, bounds, ...extra }, { rect: [0, 0, 200, 200], at: [100, 100, 0] }));

test("the asset store loads once, caches by identity, reports states and retries a failure only when asked again", async () => {
  const files = { "/a.glb": fixtures()["parts.glb"], "/bad.glb": fixtures()["malformed.glb"] };
  const net = network(files), changes = [];
  const store = createAssetStore({ fetch: net.fetch, onChange: () => changes.push(1) });
  // Loading, then ready; a frame's bind does not wait.
  const first = referenceScene("/a.glb");
  const shape = first.profiles.piece;
  store.begin(); store.bind(first); store.end();
  assert.equal(store.info(shape).status, "loading");
  assert.equal(meshReady(shape), false);
  await settle();
  assert.equal(changes.length, 1, "a finished load asks for a frame");
  store.begin(); store.bind(first); store.end();
  assert.equal(store.info(shape).status, "ready");
  assert.equal(store.info(shape).triangles, 768);
  assert.equal(meshReady(shape), true);
  // The same reference in another scene (another validated profile object): served from the cache, no second request.
  const second = referenceScene("/a.glb");
  store.begin(); store.bind(second); store.end();
  assert.equal(meshReady(second.profiles.piece), true);
  assert.equal(net.log.length, 1);
  assert.equal(store.state().hits, 1);
  // A different mesh of the same file is a different entry (and a fetch: files are not kept).
  const lever = referenceScene("/a.glb", "Lever", { low: [-30, -4, 0], high: [30, 4, 6] });
  store.begin(); store.bind(first); store.bind(lever); store.end();
  await settle();
  store.begin(); store.bind(first); store.bind(lever); store.end();
  assert.equal(store.info(lever.profiles.piece).status, "ready");
  assert.equal(store.state().entries.length, 2);
  // Failures: 404, a malformed file, a missing mesh; each keeps the part out with the reason and GPU-side nothing changes.
  const lost = referenceScene("/missing.glb"), bad = referenceScene("/bad.glb"), absent = referenceScene("/a.glb", "Ghost");
  store.begin(); for (const s of [first, lever, lost, bad, absent]) store.bind(s); store.end();
  await settle();
  store.begin(); for (const s of [first, lever, lost, bad, absent]) store.bind(s); store.end();
  assert.deepEqual([lost, bad, absent].map(s => store.info(s.profiles.piece).status), ["failed", "failed", "failed"]);
  assert.match(store.info(lost.profiles.piece).error, /HTTP 404/);
  assert.match(store.info(bad.profiles.piece).error, /a glB chunk runs past the end/);
  assert.match(store.info(absent.profiles.piece).error, /no mesh or node named "Ghost"/);
  const before = net.log.length;
  store.begin(); for (const s of [first, lever, lost, bad, absent]) store.bind(s); store.end();
  await settle();
  assert.equal(net.log.length, before, "a failure is kept while a scene references it: no refetch per frame");
  // Nobody references them any more: forgotten, so asking again retries.
  store.begin(); store.bind(first); store.bind(lever); store.end();
  assert.equal(store.state().entries.some(entry => entry.status === "failed"), false);
  store.begin(); store.bind(lost); store.end();
  await settle();
  assert.equal(net.log.length, before + 1, "retried after it had been dropped");
  store.dispose();
});

test("the asset store checks the declared box, the file size and the byte budget", async () => {
  const net = network({ "/a.glb": fixtures()["parts.glb"] });
  const store = createAssetStore({ fetch: net.fetch, onChange() {} });
  // A box that does not hold the loaded vertices: the profile fails and stays out.
  const wrong = referenceScene("/a.glb", "Cap", { low: [-5, -5, 0], high: [5, 5, 5] });
  store.begin(); store.bind(wrong); store.end();
  await settle();
  store.begin(); store.bind(wrong); store.end();
  const info = store.info(wrong.profiles.piece);
  assert.equal(info.status, "failed");
  assert.match(info.error, /the mesh leaves its declared bounds: vertex 0 is/);
  assert.equal(meshReady(wrong.profiles.piece), false);
  // A right box on the same entry works (the check is per profile, the entry is shared).
  const right = referenceScene("/a.glb");
  store.begin(); store.bind(wrong); store.bind(right); store.end();
  assert.equal(meshReady(right.profiles.piece), true);
  store.dispose();
  // A file over the size cap (by its header, and by its body).
  const small = createAssetStore({ fetch: net.fetch, onChange() {}, fileBytes: 1000 });
  const big = referenceScene("/a.glb");
  small.begin(); small.bind(big); small.end();
  await settle();
  assert.match(small.info(big.profiles.piece).error, /the file is \d+ bytes, above the 1000/);
  small.dispose();
  // The byte budget: the dome is 137,632 bytes and the cap 23,776. In 150,000 they do not fit together while both are in use.
  const cap = referenceScene("/a.glb"), dense = referenceScene("/a.glb", "Dense", { low: [-21, -21, 0], high: [21, 21, 9] });
  const budgeted = createAssetStore({ fetch: net.fetch, onChange() {}, budgetBytes: 150_000 });
  const frame = async (...scenes) => { budgeted.begin(); for (const s of scenes) budgeted.bind(s); budgeted.end(); await settle(); };
  await frame(dense); await frame(dense);
  assert.equal(budgeted.info(dense.profiles.piece).status, "ready");
  assert.equal(budgeted.state().bytes, 137632);
  await frame(dense, cap); await frame(dense, cap);
  assert.equal(budgeted.info(dense.profiles.piece).status, "ready");
  assert.equal(budgeted.info(cap.profiles.piece).status, "failed");
  assert.equal(budgeted.info(cap.profiles.piece).error, "the asset budget is spent: 23776 more bytes would pass 150000 (every cached mesh is in use)");
  // The dome is no longer used: the cap evicts it (least recently used, unreferenced) and loads.
  await frame();
  assert.equal(budgeted.state().entries.length, 1, "the failed cap was forgotten, the dome stays cached while there is room");
  await frame(cap); await frame(cap);
  assert.equal(budgeted.info(cap.profiles.piece).status, "ready");
  assert.equal(budgeted.state().evictions, 1);
  assert.deepEqual(budgeted.state().entries.map(entry => entry.status), ["ready"]);
  // Nothing to evict: one mesh over the whole budget fails.
  const tiny = createAssetStore({ fetch: net.fetch, onChange() {}, budgetBytes: 20_000 });
  tiny.begin(); tiny.bind(dense); tiny.end();
  await settle();
  assert.match(tiny.info(dense.profiles.piece).error, /the asset budget is spent/);
  for (const s of [budgeted, tiny]) s.dispose();
});

test("a buffer source loads without a request and is keyed by the buffer", async () => {
  const bytes = fixtures()["parts.glb"], buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const net = network({});
  const store = createAssetStore({ fetch: net.fetch, onChange() {} });
  const scene = validateInstrumentScene(withPart({ type: "mesh", source: { data: buffer, mesh: "Lever" }, bounds: { low: [-30, -4, 0], high: [30, 4, 6] } }));
  store.begin(); store.bind(scene); store.end();
  await settle();
  store.begin(); store.bind(scene); store.end();
  assert.equal(store.info(scene.profiles.piece).status, "ready");
  assert.equal(net.log.length, 0);
  const again = validateInstrumentScene(withPart({ type: "mesh", source: { data: buffer, mesh: "Lever" }, bounds: { low: [-30, -4, 0], high: [30, 4, 6] } }));
  assert.equal(again.profiles.piece.id, scene.profiles.piece.id);
  store.dispose();
});

test("kinds: a mesh profile with a material is one kind, shared by its parts", () => {
  const scene = base();
  scene.profiles.piece = inlineBox();
  const rect = [0, 0, 100, 100];
  scene.objects = [0, 1, 2].map(index => ({ id: `o${index}`, rect, parts: [{ kind: "custom", profile: "piece", at: [50, 50, 0], material: "metal" }] }));
  const checked = validateInstrumentScene(scene);
  const kinds = partKinds(checked);
  assert.equal(kinds.length, 1);
  assert.equal(kinds[0].instances.length, 3);
  void partMatrix;
});
