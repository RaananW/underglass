/**
 * Custom parts, the geometry half (core work item 5, `docs/ui-library/instrument-phase2.md`): the `mesh` profile of the
 * Instrument scene format (Rendering Model 2D.2), validated, normalised to core's winding convention and measured. This
 * module has no GPU and no DOM and does not import `instrument.ts` at run time. A mesh is either inline (the triangles
 * are in the scene) or a reference to a glB/glTF (`instrument-assets.ts` loads it, `instrument-gltf.ts` reads it); either
 * way the triangles that end up here are what is drawn and what containment checks.
 *
 * Coordinates are a profile's own: part-local px, x right, y down, z up from the face, the origin at the centre of the
 * part's base.
 */

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

/** A part's triangles in part-local px, with normals and UVs (the parametric builders' output, and a mesh's). */
export interface PartGeometry { positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array }

/** Vertices per mesh profile. */
export const INSTRUMENT_MESH_VERTICES = 16384;
/** Triangles per mesh profile (a closed mesh has about twice as many triangles as vertices). */
export const INSTRUMENT_MESH_TRIANGLES = 32768;
/** The largest coordinate of a mesh vertex, px. */
export const INSTRUMENT_MESH_COORDINATE = 1e4;
/** Drawn triangles of custom parts (instances times triangles) per layer; above it the last objects step down (`budget`). */
export const INSTRUMENT_CUSTOM_TRIANGLES_PER_LAYER = 1_000_000;

/** A glB/glTF reference: a URL core fetches, or the file's bytes; `mesh` names a glTF mesh (or the node holding it). */
export type InstrumentMeshSource = { url: string; mesh?: string; data?: undefined } | { data: ArrayBuffer; mesh?: string; url?: undefined };
/** A `mesh` profile (2D.2): inline triangles or a reference to a glB/glTF. */
export interface InstrumentMeshProfile {
  type: "mesh";
  /** Inline: flat `x, y, z`. */
  positions?: ArrayLike<number>;
  /** Inline: flat normals, or `"compute"` to derive smooth normals from the triangles. */
  normals?: ArrayLike<number> | "compute";
  /** Inline: a triangle list into the vertices. */
  indices?: ArrayLike<number>;
  /** Inline: flat `u, v`; omitted, planar from `x` and `y` over the mesh's box. */
  uvs?: ArrayLike<number>;
  /** A reference instead of inline data. */
  source?: InstrumentMeshSource;
  /** A reference: glTF units to part-local px (default 1). */
  scale?: number;
  /** A reference: added after the axis change and the scale (default `[0, 0, 0]`). */
  offset?: Vec3;
  /** The declared box in part-local px: required on a reference, verified against the vertices. */
  bounds?: { low: Vec3; high: Vec3 };
  /** The default `pose.pivot` of a part of this profile whose pose gives none. */
  pivot?: Vec3;
  /** Set by validation: what identifies the mesh in structure keys and caches. */
  id?: string;
}
/** A validated mesh profile. */
export type MeshProfile = InstrumentMeshProfile & { id: string };

const fail = (path: string, rule: string): never => { throw new Error(`Instrument scene ${path} ${rule}`); };
const isList = (value: unknown): value is ArrayLike<number> => Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView));
const finite = (value: unknown, path: string, limit = INSTRUMENT_MESH_COORDINATE): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) fail(path, `requires a finite number within ±${limit}`);
  return value as number;
};
const triple = (value: unknown, path: string, limit = INSTRUMENT_MESH_COORDINATE): Vec3 => {
  if (!Array.isArray(value) || value.length !== 3) fail(path, "requires 3 numbers");
  return (value as unknown[]).map((entry, index) => finite(entry, `${path}[${index}]`, limit)) as Vec3;
};
const known = (value: Record<string, unknown>, path: string, allowed: readonly string[]) => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${path}.${key}`, "is not a field of a mesh profile");
};
const record = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "requires an object");
  return value as Record<string, unknown>;
};

// ---------------------------------------------------------------------------------------------------------------------
// Geometry state: a mesh profile's triangles live beside the profile, not in it, so the profile stays a small value.

const geometries = new WeakMap<object, PartGeometry>();
/** A mesh profile's triangles: inline ones from validation, a reference's once the store has loaded it. */
export const meshGeometry = (shape: object): PartGeometry | undefined => geometries.get(shape);
const placeholders = new WeakMap<object, PartGeometry>();
/**
 * What stands for a reference's triangles until its file is loaded: a triangle with no area whose corners span the declared
 * box, so a mesh built from it (and its culling bounds) already covers where the real one will draw. Nothing is written to
 * it as an instance until the file is there.
 */
export function placeholderGeometry(shape: object, bounds: { low: Vec3; high: Vec3 } | undefined): PartGeometry {
  let geometry = placeholders.get(shape);
  if (!geometry) {
    const { low, high } = bounds ?? { low: [0, 0, 0] as Vec3, high: [0, 0, 0] as Vec3 };
    geometry = { positions: new Float32Array([...low, ...high, ...high]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2]) };
    placeholders.set(shape, geometry);
  }
  return geometry;
}
/** Hands a reference its loaded triangles (or takes them away). */
export function setMeshGeometry(shape: object, geometry: PartGeometry | undefined) {
  if (geometry) geometries.set(shape, geometry); else geometries.delete(shape);
}
/** The bytes of a geometry. */
export const geometryBytes = (geometry: PartGeometry) => geometry.positions.byteLength + geometry.normals.byteLength + geometry.uvs.byteLength + geometry.indices.byteLength;

// ---------------------------------------------------------------------------------------------------------------------
// Validation.

const buffers = new WeakMap<ArrayBuffer, number>();
let bufferCount = 0;
const bufferId = (buffer: ArrayBuffer) => { let id = buffers.get(buffer); if (id === undefined) { id = ++bufferCount; buffers.set(buffer, id); } return id; };
/** What an input profile was validated to, by the identity of its arrays: updates hand core the same arrays every frame. */
const references = new WeakMap<object, { key: string; result: MeshProfile }>();
/** URL references by what they say, so an application that rebuilds its scene's profiles keeps one profile per reference. */
const urlProfiles = new Map<string, MeshProfile>();
const validated = new WeakMap<object, { normals: unknown; indices: unknown; uvs: unknown; rest: string; result: MeshProfile }[]>();

const hash = (...arrays: ArrayBufferView[]): string => {
  let h = 0x811c9dc5;
  for (const view of arrays) {
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    for (let index = 0; index < bytes.length; index++) { h ^= bytes[index]!; h = Math.imul(h, 0x01000193); }
    h ^= 0xff; h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
};
const withJson = <T extends object>(result: T, json: object): T => {
  Object.defineProperty(result, "toJSON", { value: () => json, enumerable: false });
  return result;
};

/**
 * Validates a `mesh` profile and returns its normalised copy, with the inline triangles built and checked (or, for a
 * reference, its identity). Throws on the first problem with its path and the rule. Cached by the identity of the input
 * arrays: a profile passed again with the same arrays is not validated again.
 */
export function validateMeshProfile(value: Record<string, unknown>, at: string): MeshProfile {
  known(value, at, ["type", "positions", "normals", "indices", "uvs", "source", "scale", "offset", "bounds", "pivot", "id"]);
  const boundsIn = value.bounds === undefined ? undefined : record(value.bounds, `${at}.bounds`);
  if (boundsIn) known(boundsIn, `${at}.bounds`, ["low", "high"]);
  const bounds = boundsIn ? { low: triple(boundsIn.low, `${at}.bounds.low`), high: triple(boundsIn.high, `${at}.bounds.high`) } : undefined;
  if (bounds) for (let axis = 0; axis < 3; axis++) if (bounds.low[axis]! > bounds.high[axis]!) fail(`${at}.bounds`, "requires low to be at most high on every axis");
  const pivot = value.pivot === undefined ? undefined : triple(value.pivot, `${at}.pivot`);

  if (value.source !== undefined) {
    for (const field of ["positions", "normals", "indices", "uvs"]) if (value[field] !== undefined) fail(`${at}.${field}`, "is for inline meshes, and this one has a source");
    const source = record(value.source, `${at}.source`);
    known(source, `${at}.source`, ["url", "data", "mesh"]);
    if ((source.url === undefined) === (source.data === undefined)) fail(`${at}.source`, "requires a url or data (an ArrayBuffer), not both");
    if (source.url !== undefined && (typeof source.url !== "string" || !source.url || source.url.length > 2048)) fail(`${at}.source.url`, "requires a non-empty string of at most 2048 characters");
    if (source.data !== undefined && !(source.data instanceof ArrayBuffer)) fail(`${at}.source.data`, "requires an ArrayBuffer");
    if (source.mesh !== undefined && (typeof source.mesh !== "string" || !source.mesh || source.mesh.length > 128)) fail(`${at}.source.mesh`, "requires a non-empty string of at most 128 characters");
    if (!bounds) fail(`${at}.bounds`, "is required on a reference: declare the mesh's box in part-local px, which core verifies against the loaded vertices");
    const scale = value.scale === undefined ? 1 : finite(value.scale, `${at}.scale`, 1e6);
    if (!(scale >= 1e-6)) fail(`${at}.scale`, "requires a number in 1e-6..1e6");
    const offset = value.offset === undefined ? ([0, 0, 0] as Vec3) : triple(value.offset, `${at}.offset`);
    const where = source.url !== undefined ? `url:${source.url as string}` : `buffer:${bufferId(source.data as ArrayBuffer)}`;
    const id = `${where}|${(source.mesh as string | undefined) ?? ""}|${scale}|${offset.join(",")}`;
    // The same input gives the same profile object, so what the store attached to it stays attached across updates.
    const key = JSON.stringify([id, bounds, pivot]);
    const again = source.url !== undefined ? urlProfiles.get(key) : references.get(value)?.key === key ? references.get(value)!.result : undefined;
    if (again) return again;
    const result: MeshProfile = { type: "mesh", id, source: source.url !== undefined ? { url: source.url as string, ...(source.mesh !== undefined ? { mesh: source.mesh as string } : {}) }
      : { data: source.data as ArrayBuffer, ...(source.mesh !== undefined ? { mesh: source.mesh as string } : {}) }, scale, offset, bounds: bounds!, ...(pivot ? { pivot } : {}) };
    if (source.url !== undefined) { if (urlProfiles.size >= 256) urlProfiles.clear(); urlProfiles.set(key, result); } else references.set(value, { key, result });
    return withJson(result, { type: "mesh", id, bounds, pivot });
  }

  // Inline.
  for (const field of ["scale", "offset"]) if (value[field] !== undefined) fail(`${at}.${field}`, "is for a reference: an inline mesh is already in part-local px");
  if (!isList(value.positions)) fail(`${at}.positions`, "requires a list of numbers (x, y, z per vertex)");
  const rest = JSON.stringify([bounds, pivot, value.normals === "compute"]);
  const cached = validated.get(value.positions as object)?.find(entry => entry.normals === value.normals && entry.indices === value.indices && entry.uvs === value.uvs && entry.rest === rest);
  if (cached) return cached.result;
  const list = value.positions as ArrayLike<number>;
  if (list.length < 9 || list.length % 3 !== 0) fail(`${at}.positions`, "requires a multiple of 3 numbers, at least one triangle's worth");
  if (list.length / 3 > INSTRUMENT_MESH_VERTICES) fail(`${at}.positions`, `holds ${list.length / 3} vertices, above the ${INSTRUMENT_MESH_VERTICES} a mesh may have`);
  const positions = new Float32Array(list.length);
  for (let index = 0; index < list.length; index++) positions[index] = finite(list[index], `${at}.positions[${index}]`);
  const count = positions.length / 3;
  if (!isList(value.indices)) fail(`${at}.indices`, "requires a list of vertex indices (three per triangle)");
  const ins = value.indices as ArrayLike<number>;
  if (ins.length < 3 || ins.length % 3 !== 0) fail(`${at}.indices`, "requires a multiple of 3 indices");
  if (ins.length / 3 > INSTRUMENT_MESH_TRIANGLES) fail(`${at}.indices`, `holds ${ins.length / 3} triangles, above the ${INSTRUMENT_MESH_TRIANGLES} a mesh may have`);
  const indices = new Uint32Array(ins.length);
  for (let index = 0; index < ins.length; index++) {
    const entry = ins[index];
    if (typeof entry !== "number" || !Number.isInteger(entry) || entry < 0 || entry >= count) fail(`${at}.indices[${index}]`, `requires an integer below the vertex count (${count})`);
    indices[index] = entry as number;
  }
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle]!, b = indices[triangle + 1]!, c = indices[triangle + 2]!;
    if (a === b || b === c || a === c) fail(`${at}.indices[${triangle}]`, `names a degenerate triangle (${a}, ${b}, ${c}): a triangle may not repeat a vertex`);
  }
  let normals: Float32Array | undefined;
  if (value.normals === undefined) fail(`${at}.normals`, 'is missing: give one normal per vertex, or set normals: "compute" to derive them from the triangles');
  else if (value.normals !== "compute") {
    if (!isList(value.normals)) fail(`${at}.normals`, 'requires a list of numbers, or "compute"');
    const nin = value.normals as ArrayLike<number>;
    if (nin.length !== positions.length) fail(`${at}.normals`, `requires ${positions.length} numbers (one normal per vertex), got ${nin.length}`);
    normals = new Float32Array(nin.length);
    for (let vertex = 0; vertex < count; vertex++) {
      const x = finite(nin[vertex * 3], `${at}.normals[${vertex * 3}]`, 1e6), y = finite(nin[vertex * 3 + 1], `${at}.normals[${vertex * 3 + 1}]`, 1e6), z = finite(nin[vertex * 3 + 2], `${at}.normals[${vertex * 3 + 2}]`, 1e6);
      const length = Math.hypot(x, y, z);
      if (!(length > 1e-9)) fail(`${at}.normals[${vertex * 3}]`, "names a normal of length 0");
      normals[vertex * 3] = x / length; normals[vertex * 3 + 1] = y / length; normals[vertex * 3 + 2] = z / length;
    }
  }
  let uvs: Float32Array | undefined;
  if (value.uvs !== undefined) {
    if (!isList(value.uvs)) fail(`${at}.uvs`, "requires a list of numbers (u, v per vertex)");
    const uin = value.uvs as ArrayLike<number>;
    if (uin.length !== count * 2) fail(`${at}.uvs`, `requires ${count * 2} numbers (one u, v per vertex), got ${uin.length}`);
    uvs = new Float32Array(uin.length);
    for (let index = 0; index < uin.length; index++) uvs[index] = finite(uin[index], `${at}.uvs[${index}]`, 1e6);
  }
  const geometry = buildGeometry(positions, normals, indices, uvs);
  if (bounds) {
    const box = geometryBox(geometry);
    for (let vertex = 0; vertex < count; vertex++) for (let axis = 0; axis < 3; axis++) {
      const slack = slackOf(bounds, axis), v = geometry.positions[vertex * 3 + axis]!;
      if (v < bounds.low[axis]! - slack || v > bounds.high[axis]! + slack) {
        fail(`${at}.bounds`, `does not hold the mesh: vertex ${vertex} is ${v} on axis ${"xyz"[axis]}, outside ${bounds.low[axis]}..${bounds.high[axis]} (the mesh spans ${box.low[axis]}..${box.high[axis]})`);
      }
    }
  }
  const id = `inline:${hash(geometry.positions, geometry.indices, geometry.normals, geometry.uvs)}`;
  const result: MeshProfile = { type: "mesh", id, positions: geometry.positions, normals: geometry.normals, indices: geometry.indices, uvs: geometry.uvs,
    ...(bounds ? { bounds } : {}), ...(pivot ? { pivot } : {}) };
  withJson(result, { type: "mesh", id, bounds, pivot });
  setMeshGeometry(result, geometry);
  const entries = validated.get(value.positions as object) ?? [];
  entries.push({ normals: value.normals, indices: value.indices, uvs: value.uvs, rest, result });
  if (entries.length > 8) entries.shift();
  validated.set(value.positions as object, entries);
  return result;
}

/** The slack a declared box allows on `axis`: 1/1000 of its size plus 0.01 px. */
const slackOf = (bounds: { low: Vec3; high: Vec3 }, axis: number) => (bounds.high[axis]! - bounds.low[axis]!) * 0.001 + 0.01;

/** Whether a loaded geometry's vertices lie inside a declared box (with the slack); the first offender otherwise. */
export function checkDeclaredBounds(geometry: PartGeometry, bounds: { low: Vec3; high: Vec3 }): string | undefined {
  for (let vertex = 0; vertex < geometry.positions.length / 3; vertex++) for (let axis = 0; axis < 3; axis++) {
    const v = geometry.positions[vertex * 3 + axis]!, slack = slackOf(bounds, axis);
    if (v < bounds.low[axis]! - slack || v > bounds.high[axis]! + slack) {
      const box = geometryBox(geometry);
      return `the mesh leaves its declared bounds: vertex ${vertex} is ${v} on axis ${"xyz"[axis]}, outside ${bounds.low[axis]}..${bounds.high[axis]} (it spans ${box.low[axis]}..${box.high[axis]}); check the asset and its scale`;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------------
// Geometry: normals, winding, UVs.

/** The box of a geometry's vertices. */
export function geometryBox(geometry: PartGeometry): { low: Vec3; high: Vec3 } {
  const low: Vec3 = [Infinity, Infinity, Infinity], high: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < geometry.positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) { const v = geometry.positions[index + axis]!; if (v < low[axis]!) low[axis] = v; if (v > high[axis]!) high[axis] = v; }
  }
  return { low, high };
}

/**
 * Builds a part's geometry from raw triangles under core's winding convention: in the part's axes `(b − a) × (c − a)`
 * points against the outward normal (see `profileGeometry`). Given normals decide the winding of every triangle. Without
 * them, a closed mesh whose signed volume says it is wound the other way is reversed, and the smooth normals are the
 * area-weighted sum of the triangles' outward directions; an open mesh keeps its authored winding. Missing UVs are planar
 * over the box in `x` and `y`.
 */
export function buildGeometry(positions: Float32Array, normalsIn: Float32Array | undefined, indicesIn: Uint32Array, uvsIn?: Float32Array): PartGeometry {
  const count = positions.length / 3, indices = new Uint32Array(indicesIn);
  const cross = (a: number, b: number, c: number): Vec3 => {
    const e1x = positions[b * 3]! - positions[a * 3]!, e1y = positions[b * 3 + 1]! - positions[a * 3 + 1]!, e1z = positions[b * 3 + 2]! - positions[a * 3 + 2]!;
    const e2x = positions[c * 3]! - positions[a * 3]!, e2y = positions[c * 3 + 1]! - positions[a * 3 + 1]!, e2z = positions[c * 3 + 2]! - positions[a * 3 + 2]!;
    return [e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x];
  };
  let normals = normalsIn;
  if (!normals) {
    if (isClosed(indices, count)) {
      // The signed volume (Σ a · (b × c) / 6) is positive when `(b − a) × (c − a)` points outward: the other way from ours.
      let volume = 0;
      for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t]!, b = indices[t + 1]!, c = indices[t + 2]!;
        volume += positions[a * 3]! * (positions[b * 3 + 1]! * positions[c * 3 + 2]! - positions[b * 3 + 2]! * positions[c * 3 + 1]!)
          + positions[a * 3 + 1]! * (positions[b * 3 + 2]! * positions[c * 3]! - positions[b * 3]! * positions[c * 3 + 2]!)
          + positions[a * 3 + 2]! * (positions[b * 3]! * positions[c * 3 + 1]! - positions[b * 3 + 1]! * positions[c * 3]!);
      }
      if (volume > 0) for (let t = 0; t < indices.length; t += 3) { const b = indices[t + 1]!; indices[t + 1] = indices[t + 2]!; indices[t + 2] = b; }
    }
    normals = new Float32Array(positions.length);
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t]!, b = indices[t + 1]!, c = indices[t + 2]!, [x, y, z] = cross(a, b, c);
      for (const vertex of [a, b, c]) { normals[vertex * 3] = normals[vertex * 3]! - x; normals[vertex * 3 + 1] = normals[vertex * 3 + 1]! - y; normals[vertex * 3 + 2] = normals[vertex * 3 + 2]! - z; }
    }
    for (let vertex = 0; vertex < count; vertex++) {
      const x = normals[vertex * 3]!, y = normals[vertex * 3 + 1]!, z = normals[vertex * 3 + 2]!, length = Math.hypot(x, y, z);
      if (length > 1e-12) { normals[vertex * 3] = x / length; normals[vertex * 3 + 1] = y / length; normals[vertex * 3 + 2] = z / length; }
      else { normals[vertex * 3] = 0; normals[vertex * 3 + 1] = 0; normals[vertex * 3 + 2] = 1; }
    }
  }
  // Every triangle against its vertices' normals, whatever order it was authored in.
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]!, b = indices[t + 1]!, c = indices[t + 2]!, [x, y, z] = cross(a, b, c);
    const along = x * (normals[a * 3]! + normals[b * 3]! + normals[c * 3]!) + y * (normals[a * 3 + 1]! + normals[b * 3 + 1]! + normals[c * 3 + 1]!)
      + z * (normals[a * 3 + 2]! + normals[b * 3 + 2]! + normals[c * 3 + 2]!);
    if (along > 0) { indices[t + 1] = c; indices[t + 2] = b; }
  }
  let uvs = uvsIn;
  if (!uvs) {
    const box = geometryBox({ positions, normals, uvs: new Float32Array(0), indices });
    const sx = Math.max(1e-6, box.high[0] - box.low[0]), sy = Math.max(1e-6, box.high[1] - box.low[1]);
    uvs = new Float32Array(count * 2);
    for (let vertex = 0; vertex < count; vertex++) { uvs[vertex * 2] = (positions[vertex * 3]! - box.low[0]) / sx; uvs[vertex * 2 + 1] = (positions[vertex * 3 + 1]! - box.low[1]) / sy; }
  }
  return { positions, normals, uvs, indices };
}

/** Whether every directed edge of the triangle list occurs once and its reverse once: a closed, consistently wound mesh. */
function isClosed(indices: Uint32Array, count: number): boolean {
  const edges = new Map<number, number>();
  const key = (a: number, b: number) => a * count + b;
  for (let t = 0; t < indices.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const id = key(indices[t + k]!, indices[t + (k + 1) % 3]!);
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  for (const [id, times] of edges) {
    if (times !== 1) return false;
    const a = Math.floor(id / count), b = id % count;
    if (edges.get(key(b, a)) !== 1) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------------
// The footprint (face casters, 2D.7).

/** A geometry's xy convex hull (counter-clockwise points, `x, y` pairs), its box, and how round it is (0 square, 1 a disc). */
export interface Footprint { hull: Float64Array; low: Vec3; high: Vec3; roundness: number }
const footprints = new WeakMap<PartGeometry, Footprint>();
export function meshFootprint(geometry: PartGeometry): Footprint {
  let result = footprints.get(geometry);
  if (result) return result;
  const count = geometry.positions.length / 3, order = Array.from({ length: count }, (_, index) => index);
  const px = (index: number) => geometry.positions[index * 3]!, py = (index: number) => geometry.positions[index * 3 + 1]!;
  order.sort((a, b) => px(a) - px(b) || py(a) - py(b));
  const turn = (o: number, a: number, b: number) => (px(a) - px(o)) * (py(b) - py(o)) - (py(a) - py(o)) * (px(b) - px(o));
  const chain: number[] = [];
  for (const side of [order, [...order].reverse()]) {
    const start = chain.length;
    for (const index of side) {
      while (chain.length >= start + 2 && turn(chain[chain.length - 2]!, chain[chain.length - 1]!, index) <= 0) chain.pop();
      chain.push(index);
    }
    chain.pop();
  }
  const hull = new Float64Array(chain.length * 2);
  chain.forEach((index, at) => { hull[at * 2] = px(index); hull[at * 2 + 1] = py(index); });
  const box = geometryBox(geometry);
  let area = 0;
  for (let at = 0; at < chain.length; at++) {
    const next = (at + 1) % chain.length;
    area += hull[at * 2]! * hull[next * 2 + 1]! - hull[next * 2]! * hull[at * 2 + 1]!;
  }
  const bbox = (box.high[0] - box.low[0]) * (box.high[1] - box.low[1]);
  const ratio = bbox > 1e-9 ? Math.min(1, Math.abs(area) / 2 / bbox) : 1;
  result = { hull, low: box.low, high: box.high, roundness: Math.min(1, Math.max(0, (1 - ratio) / (1 - Math.PI / 4))) };
  footprints.set(geometry, result);
  return result;
}

/**
 * The tallest face caster whose shadow stays inside `box` (the Fader's rule, `faderCasterHeight`): the shadow of a caster
 * `h` high is its rectangle shifted by `−light · h` and softened over `1.5 h + 1` (the shader of 2.8). Each side gives
 * `a − c · h ≥ 0`, so the cap is closed-form. 0 when even a flat shadow leaves the box.
 */
export function capCasterHeight(rect: Box, height: number, box: Box, light: [number, number]): number {
  let cap = height;
  const sides: [number, number][] = [
    [rect[0] - box[0] - 1, light[0] + 1.5], [box[0] + box[2] - (rect[0] + rect[2]) - 1, -light[0] + 1.5],
    [rect[1] - box[1] - 1, light[1] + 1.5], [box[1] + box[3] - (rect[1] + rect[3]) - 1, -light[1] + 1.5],
  ];
  for (const [room, rate] of sides) {
    if (room < 0) return 0;
    if (rate > 1e-9) cap = Math.min(cap, room / rate);
  }
  return cap;
}
