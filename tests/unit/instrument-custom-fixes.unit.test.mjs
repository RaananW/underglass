/**
 * The review's fixes to custom parts: the glB reader's caps and number checks, NaN-safe bounds, the byte cap on bytes in hand, no
 * per-frame serialization of profiles, stand-ins (`fallback`) and the per-store ownership of loaded triangles. Each test fails on the
 * code before its fix.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fixtures } from "../../scripts/make-custom-fixture.mjs";

const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const instrument = await import("../../packages/core/src/instrument.ts");
const mesh = await import("../../packages/core/src/instrument-mesh.ts");
const { readGltf } = await import("../../packages/core/src/instrument-gltf.ts");
const { createAssetStore } = await import("../../packages/core/src/instrument-assets.ts");
sourceImports.deregister();
const { validateInstrumentScene, profileBounds, profileGeometry, partDrawn, meshReady } = instrument;

const request = { mesh: "m", scale: 1, offset: [0, 0, 0] };
/** A glTF with one triangle in an embedded buffer, then `mutate` to craft a defect. */
const gltf = mutate => {
  const positions = new Float32Array([1, 1, 1, 2, 1, 1, 1, 2, 1]), normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const bytes = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(normals.buffer)]);
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: "n", mesh: 0 }],
    meshes: [{ name: "m", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, mode: 4 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" }],
    bufferViews: [{ buffer: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }],
    buffers: [{ byteLength: 72, uri: `data:application/octet-stream;base64,${bytes.toString("base64")}` }] };
  mutate?.(json);
  return new TextEncoder().encode(JSON.stringify(json)).buffer;
};

test("the reader refuses an attribute count before allocating for it, and numeric fields that are not non-negative integers", () => {
  assert.equal(readGltf(gltf(), request).indices.length, 3, "the unmodified file reads");
  const before = process.memoryUsage().arrayBuffers;
  assert.throws(() => readGltf(gltf(json => { json.accessors[1].count = 1e9; }), request), /NORMAL: 1000000000 elements, above the 16384/);
  assert.throws(() => readGltf(gltf(json => { json.accessors[1].count = 5; }), request), /attributes disagree on the vertex count \(NORMAL\)/);
  assert.throws(() => readGltf(gltf(json => { json.meshes[0].primitives[0].attributes.TEXCOORD_0 = 2; json.accessors.push({ bufferView: 0, componentType: 5126, count: 1e9, type: "VEC2" }); }), request), /TEXCOORD_0: 1000000000 elements/);
  assert.ok(process.memoryUsage().arrayBuffers - before < 50e6, "no gigabyte array was allocated");
  for (const [mutate, label] of [[json => { json.bufferViews[0].byteOffset = "4"; }, /byteOffset is not a non-negative integer/], [json => { json.bufferViews[0].byteStride = -1; }, /byteStride is not a non-negative integer/],
    [json => { json.bufferViews[0].byteLength = 1.5; }, /byteLength is not a non-negative integer/], [json => { json.accessors[0].byteOffset = -4; }, /accessor byteOffset is not a non-negative integer/],
    [json => { json.accessors[0].count = "3"; }, /the count is not a non-negative integer/]]) assert.throws(() => readGltf(gltf(mutate), request), label);
  // Indices have their own cap, from the accessor, before the read.
  assert.throws(() => readGltf(gltf(json => { json.meshes[0].primitives[0].indices = 2; json.accessors.push({ bufferView: 0, componentType: 5125, count: 1e9, type: "SCALAR" }); }), request), /1000000000 elements, above the 98304/);
});

test("NaN and overflow cannot pass: declared bounds, node matrices, normals", () => {
  const geometry = { positions: new Float32Array([0, 0, 0, Number.NaN, 0, 0, 1, 1, 1]), normals: new Float32Array(9), uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2]) };
  assert.match(mesh.checkDeclaredBounds(geometry, { low: [-1, -1, -1], high: [2, 2, 2] }), /vertex 1 is NaN/);
  assert.throws(() => readGltf(gltf(json => { json.nodes[0].scale = [1e30, 1e30, 1e30]; }), request), /after the node's transform and the fit: positions must be finite and within ±10000/);
  assert.throws(() => readGltf(gltf(json => { json.nodes[0].matrix = [1e308, 0, 0, 0, 0, 1e308, 0, 0, 0, 0, 1e308, 0, 0, 0, 0, 1]; }), request), /positions must be finite/);
  assert.throws(() => readGltf(gltf(), { ...request, scale: 1e6 }), /positions must be finite and within/, "a scale that pushes it out of range");
  // A zero normal is refused (it used to pass as length 1 and light as NaN).
  const zero = gltf();
  const text = new TextDecoder().decode(zero), json = JSON.parse(text);
  const bytes = Buffer.concat([Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer), Buffer.alloc(36)]);
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.toString("base64")}`;
  assert.throws(() => readGltf(new TextEncoder().encode(JSON.stringify(json)).buffer, request), /normal 0 is zero or not finite/);
});

const base = () => ({
  format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 0.8 },
  extent: { width: 400, height: 200 }, backdrop: "#e7e8ea", light: { azimuth: 323, elevation: 41 }, bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 },
  interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
  materials: { face: { base: { roughness: 0.6 } }, metal: { base: {} } }, primitives: [{ face: "raised", rect: [0, 0, 400, 200], radius: 12, height: 8, material: "face" }], profiles: {}, objects: [] });
const reference = (url = "/a.glb", meshName = "Cap") => ({ type: "mesh", source: { url, mesh: meshName }, bounds: { low: [-19, -19, 0], high: [19, 19, 11] } });
function scene(extra = {}, profile = reference()) {
  const s = base();
  s.profiles = { piece: profile, disc: { type: "lathe", segments: 12, points: [[10, 0, 1, 0], [10, 4, 1, 0], [0, 4, 0, 1]] }, bar: { type: "prism", width: 6, length: 6, height: 2 }, ...extra };
  const rect = [0, 0, 200, 200];
  s.objects = [{ id: "o", rect, bounds: { rect, radius: 0 }, t: 0, parts: [{ kind: "cap", profile: "piece", at: [100, 100, 0], material: "metal",
    fallback: [{ kind: "cap", profile: "disc", at: [100, 100, 0], material: "metal" }, { kind: "pointer", profile: "bar", at: [100, 100, 4], material: "metal", caster: null }] }] }];
  return s;
}
const network = files => { const log = []; return { log, fetch: async url => { log.push(url); const f = files[url]; return f ? new Response(f, { status: 200, headers: { "content-length": String(f.length) } }) : new Response("no", { status: 404 }); } }; };
const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
const frame = async (store, ...scenes) => { store.begin(); for (const s of scenes) store.bind(s); store.end(); await settle(); };

test("bytes in hand are held to the file cap like a download", async () => {
  const bytes = fixtures()["parts.glb"], buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const store = createAssetStore({ onChange() {}, fileBytes: 1000 });
  const s = validateInstrumentScene(scene({}, { type: "mesh", source: { data: buffer, mesh: "Lever" }, bounds: { low: [-30, -4, 0], high: [30, 4, 6] } }));
  await frame(store, s); await frame(store, s);
  const info = store.info(s.profiles.piece);
  assert.equal(info.status, "failed");
  assert.match(info.error, /the file is 133808 bytes, above the 1000 a custom part's file may have/);
  store.dispose();
});

test("a profile is not serialized per call: bounds and geometry come from the shape object", () => {
  const s = validateInstrumentScene(scene());
  const shape = s.profiles.disc;
  profileBounds(shape);
  const original = JSON.stringify;
  let calls = 0;
  JSON.stringify = (...args) => { calls++; return original(...args); };
  try { for (let i = 0; i < 500; i++) { profileBounds(shape); profileGeometry(shape); } } finally { JSON.stringify = original; }
  assert.equal(calls, 0, "no stringify across 500 repeated calls for the same shape");
  // and a shape seen for the first time serializes at most once
  const fresh = validateInstrumentScene(scene({ disc: { type: "lathe", segments: 14, points: [[9, 0, 1, 0], [9, 4, 1, 0], [0, 4, 0, 1]] } })).profiles.disc;
  JSON.stringify = (...args) => { calls++; return original(...args); };
  try { for (let i = 0; i < 50; i++) profileBounds(fresh); } finally { JSON.stringify = original; }
  assert.equal(calls, 1);
});

test("a fallback expands into stand-ins shown until the mesh is there, and validated scenes validate again", () => {
  const s = validateInstrumentScene(scene());
  const parts = s.objects[0].parts;
  assert.deepEqual(parts.map(p => [p.kind, p.profile, !!p.fallbackFor]), [["cap", "disc", true], ["pointer", "bar", true], ["cap", "piece", false]]);
  assert.deepEqual([0, 1, 2].map(i => partDrawn(s.objects[0], i, s.profiles)), [true, true, false], "the stand-ins while the mesh is not there");
  const geometry = mesh.buildGeometry(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), undefined, new Uint32Array([0, 1, 2]));
  mesh.setMeshGeometry(s.profiles.piece, geometry);
  assert.equal(meshReady(s.profiles.piece), true);
  assert.deepEqual([0, 1, 2].map(i => partDrawn(s.objects[0], i, s.profiles)), [false, false, true], "the mesh replaces them, never both");
  const again = validateInstrumentScene(s);
  assert.equal(again.objects[0].parts.length, 3, "re-validation does not expand twice");
  assert.equal(instrument.instrumentPartCount(s), 3);
  // refusals
  const bad = scene();
  bad.objects[0].parts[0].fallback = [{ kind: "cap", profile: "piece", at: [1, 1, 0], material: "metal" }];
  assert.throws(() => validateInstrumentScene(bad), /fallback\[0\]\.profile requires a parametric profile/);
  const plain = scene({}, { type: "prism", width: 5, length: 5, height: 2 });
  assert.throws(() => validateInstrumentScene(plain), /fallback is only for custom parts/);
});

test("triangles belong to the store that loaded them: another store reloads, and eviction frees them", async () => {
  const files = { "/a.glb": fixtures()["parts.glb"] };
  const net = network(files);
  const a = createAssetStore({ fetch: net.fetch, onChange() {} });
  const s = validateInstrumentScene(scene());
  await frame(a, s); await frame(a, s);
  assert.equal(meshReady(s.profiles.piece), true);
  // A second store (another engine, or a controller enabled again) sees a profile that is not loaded for it.
  const b = createAssetStore({ fetch: net.fetch, onChange() {} });
  b.begin(); b.bind(s); b.end();
  assert.equal(meshReady(s.profiles.piece), false, "the first store's triangles are not drawn by the second");
  assert.equal(b.info(s.profiles.piece).status, "loading");
  await settle();
  b.begin(); b.bind(s); b.end();
  assert.equal(meshReady(s.profiles.piece), true);
  assert.equal(net.log.length, 2, "it fetched for itself");
  a.dispose(); b.dispose();
  assert.equal(meshReady(s.profiles.piece), false, "disposing a store takes its triangles back");
  // Eviction frees the triangles with the entry: a budget that holds one mesh, two shapes in turn.
  const store = createAssetStore({ fetch: net.fetch, onChange() {}, budgetBytes: 150_000 });
  const dense = validateInstrumentScene(scene({}, { ...reference("/a.glb", "Dense"), bounds: { low: [-21, -21, 0], high: [21, 21, 9] } }));
  const cap = validateInstrumentScene(scene({}, reference("/a.glb", "Cap")));
  await frame(store, dense); await frame(store, dense);
  assert.equal(store.state().bytes, 137632);
  assert.equal(meshReady(dense.profiles.piece), true);
  await frame(store);
  await frame(store, cap); await frame(store, cap);
  assert.equal(store.state().evictions, 1);
  assert.equal(store.state().bytes, 23776, "the evicted entry's bytes are gone");
  assert.equal(meshReady(dense.profiles.piece), false, "and so is its geometry, off the profile");
  assert.equal(meshReady(cap.profiles.piece), true);
  store.dispose();
});
