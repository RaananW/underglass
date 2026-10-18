/**
 * Generates the glB fixtures of the custom-parts tests and the playground page (`examples/playground/public/custom/`),
 * so their provenance is this file: every vertex is computed here, nothing is downloaded or authored elsewhere, and the
 * output is deterministic (`tests/unit/instrument-mesh.unit.test.mjs` regenerates it in memory and compares it with the
 * committed bytes). Run `node scripts/make-custom-fixture.mjs` to rewrite them.
 *
 * `parts.glb` holds one scene with five meshes, in glTF's axes (right-handed, y up, +z towards the viewer), units of
 * CSS px, each standing on y = 0 with its base centred on the origin:
 * - `Cap`: a fluted knob cap, radius 18, height 10, a 1.4 px chamfer; smooth normals and UVs;
 * - `Lever`: a bar 60 long (x), 8 wide (z), 6 high, with normals; a pivot at one end is the part's job;
 * - `Block`: a 24 × 24 × 6 box with **no NORMAL attribute** (core computes them, and must wind it right);
 * - `Slab`: a plate 140 × 140 × 4, larger than any control it is meant to be refused in;
 * - `Dense`: a ribbed dome with about 2,500 vertices, for the parse and upload timings.
 * `malformed.glb` is a glB whose JSON chunk is cut short.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const round = value => Math.round(value * 1e5) / 1e5;
const normalise = ([x, y, z]) => { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; };

/** Orients every triangle counter-clockwise seen from outside (glTF's front face) by its vertices' normals. */
function orient(positions, normals, indices) {
  const out = [];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const p = index => positions.slice(index * 3, index * 3 + 3), n = index => normals.slice(index * 3, index * 3 + 3);
    const e1 = [0, 1, 2].map(k => p(b)[k] - p(a)[k]), e2 = [0, 1, 2].map(k => p(c)[k] - p(a)[k]);
    const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const along = [0, 1, 2].reduce((sum, k) => sum + cross[k] * (n(a)[k] + n(b)[k] + n(c)[k]), 0);
    out.push(a, along >= 0 ? b : c, along >= 0 ? c : b);
  }
  return out;
}

/** A solid of revolution about y: rings of `[radius, height, normalRadius, normalY, fluted]`, flutes on the marked rings. */
function lathe(rings, segments, flutes = 0, depth = 0) {
  const positions = [], normals = [], uvs = [], indices = [];
  rings.forEach(([r, y, nr, ny, fluted], ring) => {
    for (let step = 0; step <= segments; step++) {
      const angle = (step / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      const wave = fluted && flutes ? 1 + depth * Math.cos(flutes * angle) : 1;
      // d(ln r) / d(angle): the surface tilts along the flute, so the normal gains a tangential part.
      const slope = fluted && flutes ? (-depth * flutes * Math.sin(flutes * angle)) / wave : 0;
      positions.push(round(r * wave * cos), round(y), round(r * wave * sin));
      const n = normalise([nr * cos + slope * nr * sin, ny, nr * sin - slope * nr * cos]);
      normals.push(round(n[0]), round(n[1]), round(n[2]));
      uvs.push(round(step / segments), round(ring / (rings.length - 1)));
    }
  });
  for (let ring = 0; ring + 1 < rings.length; ring++) for (let step = 0; step < segments; step++) {
    const a = ring * (segments + 1) + step, b = a + segments + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { positions, normals, uvs, indices: orient(positions, normals, indices) };
}

/** An axis-aligned box `w` (x) by `d` (z) by `h` (y), standing on y = 0, with flat faces (24 vertices). */
function box(w, d, h, withNormals = true) {
  const positions = [], normals = [], uvs = [], indices = [];
  const hx = w / 2, hz = d / 2;
  const faces = [
    [[0, 1, 0], [[-hx, h, -hz], [hx, h, -hz], [hx, h, hz], [-hx, h, hz]]],
    [[0, -1, 0], [[-hx, 0, hz], [hx, 0, hz], [hx, 0, -hz], [-hx, 0, -hz]]],
    [[0, 0, 1], [[-hx, 0, hz], [-hx, h, hz], [hx, h, hz], [hx, 0, hz]]],
    [[0, 0, -1], [[hx, 0, -hz], [hx, h, -hz], [-hx, h, -hz], [-hx, 0, -hz]]],
    [[1, 0, 0], [[hx, 0, hz], [hx, h, hz], [hx, h, -hz], [hx, 0, -hz]]],
    [[-1, 0, 0], [[-hx, 0, -hz], [-hx, h, -hz], [-hx, h, hz], [-hx, 0, hz]]],
  ];
  for (const [normal, corners] of faces) {
    const start = positions.length / 3;
    corners.forEach((corner, at) => { positions.push(...corner); normals.push(...normal); uvs.push(at === 1 || at === 2 ? 1 : 0, at >= 2 ? 1 : 0); });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const mesh = { positions, normals, uvs, indices: orient(positions, normals, indices) };
  return withNormals ? mesh : { ...mesh, normals: undefined };
}

/** A dome of `rings` latitude rings with `ribs` radial ribs on its surface: the dense mesh. */
function dome(radius, height, rings, segments, ribs) {
  const profile = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = (ring / rings) * (Math.PI / 2), n = normalise([height * Math.cos(t), radius * Math.sin(t), 0]);
    profile.push([radius * Math.cos(t), height * Math.sin(t), n[0], n[1], true]);
  }
  return lathe(profile, segments, ribs, 0.015);
}

function cap() {
  const R = 18, H = 10, c = 1.4, d = 0.014;
  return lathe([
    [R, 0, 1, 0, true], [R, H - c, 1, 0, true], [R, H - c, Math.SQRT1_2, Math.SQRT1_2, false], [R - c, H, Math.SQRT1_2, Math.SQRT1_2, false],
    [R - c, H, 0, 1, false], [R * 0.5, H + 0.35, 0.05, 1, false], [0, H + 0.5, 0, 1, false],
  ], 64, 24, d);
}

/** Packs meshes into one glB: a node per mesh, one buffer, a view and an accessor per attribute. */
export function glb(meshes) {
  const chunks = [], views = [], accessors = [];
  let length = 0;
  const add = (array, target, type, componentType, count, extras = {}) => {
    const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    views.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, target });
    accessors.push({ bufferView: views.length - 1, componentType, count, type, ...extras });
    chunks.push(bytes);
    const pad = (4 - (bytes.length % 4)) % 4;
    if (pad) chunks.push(Buffer.alloc(pad));
    length += bytes.length + pad;
    return accessors.length - 1;
  };
  const json = { asset: { version: "2.0", generator: "underglass scripts/make-custom-fixture.mjs" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [] };
  for (const [name, mesh] of Object.entries(meshes)) {
    const positions = Float32Array.from(mesh.positions);
    const low = [0, 1, 2].map(k => Math.min(...mesh.positions.filter((_, at) => at % 3 === k))), high = [0, 1, 2].map(k => Math.max(...mesh.positions.filter((_, at) => at % 3 === k)));
    const attributes = { POSITION: add(positions, 34962, "VEC3", 5126, positions.length / 3, { min: low, max: high }) };
    if (mesh.normals) attributes.NORMAL = add(Float32Array.from(mesh.normals), 34962, "VEC3", 5126, mesh.normals.length / 3);
    attributes.TEXCOORD_0 = add(Float32Array.from(mesh.uvs), 34962, "VEC2", 5126, mesh.uvs.length / 2);
    const wide = mesh.positions.length / 3 > 65535;
    const indices = add(wide ? Uint32Array.from(mesh.indices) : Uint16Array.from(mesh.indices), 34963, "SCALAR", wide ? 5125 : 5123, mesh.indices.length);
    json.meshes.push({ name, primitives: [{ attributes, indices, mode: 4 }] });
    json.nodes.push({ name: `${name}Node`, mesh: json.meshes.length - 1 });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  json.buffers = [{ byteLength: length }];
  json.bufferViews = views;
  json.accessors = accessors;
  let text = JSON.stringify(json);
  text += " ".repeat((4 - (text.length % 4)) % 4);
  const body = Buffer.concat(chunks), jsonBytes = Buffer.from(text);
  const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
  header.write("glTF", 0, "ascii"); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + body.length, 8);
  jsonHeader.writeUInt32LE(jsonBytes.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(body.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBytes, binHeader, body]);
}

/** The fixtures by file name. */
export function fixtures() {
  const lever = box(60, 8, 6);
  const parts = glb({ Cap: cap(), Lever: lever, Block: box(24, 24, 6, false), Slab: box(140, 140, 4), Dense: dome(20, 8, 40, 60, 28) });
  // A glB whose JSON chunk claims more bytes than the file has.
  const malformed = Buffer.from(parts.subarray(0, 12 + 8 + 40));
  malformed.writeUInt32LE(malformed.length, 8);
  malformed.writeUInt32LE(4000, 12);
  return { "parts.glb": parts, "malformed.glb": malformed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "playground", "public", "custom");
  mkdirSync(directory, { recursive: true });
  for (const [name, bytes] of Object.entries(fixtures())) {
    writeFileSync(join(directory, name), bytes);
    console.log(`${name}: ${bytes.length} bytes`);
  }
}
