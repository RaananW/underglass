/**
 * A small glTF 2.0 reader for custom parts (core work item 5, `docs/ui-library/instrument-phase2.md`): one named mesh of a
 * glB, or of a glTF with embedded buffers, as the triangles of a part. It reads positions, normals, UVs (`TEXCOORD_0`) and
 * indices of `TRIANGLES` primitives and the transforms of the nodes that place the mesh, and nothing else: materials,
 * textures, cameras, lights, animations and morph targets are ignored (the part takes its look from the scene's recipe),
 * and Draco, meshopt, quantization, sparse accessors, external buffers and skins are refused with a reason. Every accessor
 * count is checked against the part caps before an array is allocated or a byte is read. No GPU, no DOM, no network: `instrument-assets.ts`
 * brings the bytes.
 *
 * Axes: glTF is right-handed, y up, +z towards the viewer. A vertex `(gx, gy, gz)` becomes `(gx, gz, gy) · scale + offset`
 * in the part's frame (x right, y down, z up from the face): the model stands on the face with its front towards the
 * bottom of the screen. The change of handedness reverses the winding; `buildGeometry` puts every triangle right.
 */
import { buildGeometry, INSTRUMENT_MESH_COORDINATE, INSTRUMENT_MESH_TRIANGLES, INSTRUMENT_MESH_VERTICES, type PartGeometry } from "./instrument-mesh.js";

type Vec3 = [number, number, number];
/** A file that cannot be a part: the message is the reason `state()` reports. */
export class GltfError extends Error {}

/** What the reader is asked for: the mesh by name, and the fit into part-local px. */
export interface GltfRequest { mesh?: string; scale: number; offset: Vec3 }

const COMPONENT_BYTES: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
/** Required extensions the reader cannot honour: the triangles would not be the file's. */
const UNSUPPORTED = ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_mesh_quantization", "KHR_gaussian_splatting", "EXT_mesh_gpu_instancing"];
const MAX_DEPTH = 64;

interface Gltf {
  asset?: { version?: string };
  extensionsRequired?: string[];
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { name?: string; mesh?: number; skin?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { name?: string; primitives?: { attributes?: Record<string, number>; indices?: number; mode?: number; extensions?: Record<string, unknown> }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType?: number; normalized?: boolean; count?: number; type?: string; sparse?: unknown }[];
  bufferViews?: { buffer?: number; byteOffset?: number; byteLength?: number; byteStride?: number }[];
  buffers?: { uri?: string; byteLength?: number }[];
}

/** Reads the mesh `request.mesh` (or the file's only one) of a glB/glTF as a part's geometry; throws `GltfError`. */
export function readGltf(bytes: ArrayBuffer, request: GltfRequest): PartGeometry {
  const { gltf, binary } = parseContainer(bytes);
  if (!gltf.asset || typeof gltf.asset.version !== "string" || !gltf.asset.version.startsWith("2")) throw new GltfError("the file is not glTF 2.0");
  for (const name of gltf.extensionsRequired ?? []) if (UNSUPPORTED.includes(name)) throw new GltfError(`the file requires ${name}, which custom parts do not support`);
  const buffers = (gltf.buffers ?? []).map((buffer, index) => {
    if (buffer.uri === undefined) {
      if (index !== 0 || !binary) throw new GltfError(`buffer ${index} has no data: only the glB binary chunk or a data: URI can supply it`);
      return binary;
    }
    return dataUri(buffer.uri, index);
  });

  // The node that places the mesh, with its world matrix.
  const nodes = gltf.nodes ?? [], meshes = gltf.meshes ?? [];
  const roots = gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? nodes.map((_, index) => index).filter(index => !nodes.some(node => node.children?.includes(index)));
  const found: { index: number; matrix: Float64Array }[] = [];
  const visit = (index: number, parent: Float64Array, depth: number, trail: Set<number>) => {
    const node = nodes[index];
    if (!node) throw new GltfError(`node ${index} does not exist`);
    if (depth > MAX_DEPTH || trail.has(index)) throw new GltfError("the node hierarchy is too deep or loops");
    const world = multiply(parent, local(node));
    if (node.mesh !== undefined) found.push({ index, matrix: world });
    trail.add(index);
    for (const child of node.children ?? []) visit(child, world, depth + 1, trail);
    trail.delete(index);
  };
  for (const root of roots) visit(root, identity(), 0, new Set());
  const named = (entry: { index: number }) => nodes[entry.index]!.name === request.mesh || meshes[nodes[entry.index]!.mesh!]?.name === request.mesh;
  const candidates = request.mesh === undefined ? found : found.filter(named);
  if (!candidates.length) {
    const names = found.map(entry => meshes[nodes[entry.index]!.mesh!]?.name ?? nodes[entry.index]!.name ?? `mesh ${nodes[entry.index]!.mesh}`);
    throw new GltfError(request.mesh === undefined ? "the file has no mesh" : `the file has no mesh or node named "${request.mesh}" (it has: ${names.join(", ") || "none"})`);
  }
  if (request.mesh === undefined && candidates.length > 1) {
    throw new GltfError(`the file has ${candidates.length} meshes (${candidates.map(entry => meshes[nodes[entry.index]!.mesh!]?.name ?? `#${nodes[entry.index]!.mesh}`).join(", ")}): name one with source.mesh`);
  }
  const { index, matrix } = candidates[0]!, node = nodes[index]!, mesh = meshes[node.mesh!];
  if (!mesh) throw new GltfError(`mesh ${node.mesh} does not exist`);
  if (node.skin !== undefined) throw new GltfError("the mesh is skinned; custom parts do not support skinning");
  if (!mesh.primitives?.length) throw new GltfError("the mesh has no primitives");

  // Primitive by primitive: counts first, then the data.
  const nat = (value: unknown, label: string, fallback?: number): number => {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new GltfError(`${label} is not a non-negative integer`);
    return value;
  };
  // Every count is checked against the caps before any array is allocated or any byte is read.
  const accessor = (id: number, types: string[], components: number[], what: string, max = INSTRUMENT_MESH_VERTICES) => {
    const entry = gltf.accessors?.[id];
    if (!entry) throw new GltfError(`${what}: accessor ${id} does not exist`);
    if (entry.sparse !== undefined) throw new GltfError(`${what}: sparse accessors are not supported`);
    if (!types.includes(entry.type ?? "")) throw new GltfError(`${what}: expected ${types.join(" or ")}, got ${entry.type}`);
    if (!components.includes(entry.componentType ?? 0)) throw new GltfError(`${what}: component type ${entry.componentType} is not supported (quantized or integer data)`);
    if (entry.normalized) throw new GltfError(`${what}: normalized integer data is not supported`);
    if (nat(entry.count, `${what}: the count`) < 1) throw new GltfError(`${what}: the count is not a positive integer`);
    if (entry.count! > max) throw new GltfError(`${what}: ${entry.count} elements, above the ${max} a custom part may have`);
    return entry as { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string };
  };
  const read = (id: number, types: string[], components: number[], what: string, max?: number): Float64Array => {
    const entry = accessor(id, types, components, what, max), n = TYPE_COMPONENTS[entry.type]!, size = COMPONENT_BYTES[entry.componentType]!;
    const out = new Float64Array(entry.count * n);
    if (entry.bufferView === undefined) return out;
    const view = gltf.bufferViews?.[entry.bufferView];
    if (!view || view.buffer === undefined || !buffers[view.buffer]) throw new GltfError(`${what}: its buffer view is missing`);
    const buffer = buffers[view.buffer]!, viewStart = nat(view.byteOffset, `${what}: byteOffset`, 0), stride = nat(view.byteStride, `${what}: byteStride`, 0) || n * size;
    const start = viewStart + nat(entry.byteOffset, `${what}: accessor byteOffset`, 0), length = nat(view.byteLength, `${what}: byteLength`, Number.MAX_SAFE_INTEGER);
    const end = start + stride * (entry.count - 1) + n * size;
    if (end > buffer.byteLength || end > viewStart + length) throw new GltfError(`${what}: it reads past its buffer`);
    const data = new DataView(buffer);
    for (let element = 0; element < entry.count; element++) for (let c = 0; c < n; c++) {
      const at = start + element * stride + c * size;
      const value = entry.componentType === 5126 ? data.getFloat32(at, true) : entry.componentType === 5125 ? data.getUint32(at, true) : entry.componentType === 5123 ? data.getUint16(at, true) : data.getUint8(at);
      if (!Number.isFinite(value)) throw new GltfError(`${what}: element ${element} is not finite`);
      out[element * n + c] = value;
    }
    return out;
  };

  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  let withNormals = true, withUvs = true, vertices = 0;
  const normalMatrix = inverseTranspose(matrix);
  for (const [number, primitive] of mesh.primitives.entries()) {
    const what = `primitive ${number}`;
    if ((primitive.mode ?? 4) !== 4) throw new GltfError(`${what}: mode ${primitive.mode} is not supported (triangle lists only)`);
    for (const extension of Object.keys(primitive.extensions ?? {})) if (UNSUPPORTED.includes(extension)) throw new GltfError(`${what} uses ${extension}, which custom parts do not support`);
    const attributes = primitive.attributes ?? {};
    if (attributes.POSITION === undefined) throw new GltfError(`${what} has no POSITION`);
    const count = accessor(attributes.POSITION, ["VEC3"], [5126], `${what} POSITION`).count;
    vertices += count;
    if (vertices > INSTRUMENT_MESH_VERTICES) throw new GltfError(`the mesh has ${vertices} vertices or more, above the ${INSTRUMENT_MESH_VERTICES} a custom part may have`);
    const triangles = primitive.indices !== undefined ? accessor(primitive.indices, ["SCALAR"], [5121, 5123, 5125], `${what} indices`, INSTRUMENT_MESH_TRIANGLES * 3).count / 3 : count / 3;
    if (!Number.isInteger(triangles)) throw new GltfError(`${what}: the index count is not a multiple of 3`);
    if (indices.length / 3 + triangles > INSTRUMENT_MESH_TRIANGLES) throw new GltfError(`the mesh has more than ${INSTRUMENT_MESH_TRIANGLES} triangles, the most a custom part may have`);
    // The other attributes must name as many elements as POSITION before anything is allocated for them.
    for (const [name, type] of [["NORMAL", "VEC3"], ["TEXCOORD_0", "VEC2"]] as const) {
      if (attributes[name] === undefined) continue;
      if (accessor(attributes[name]!, [type], [5126], `${what} ${name}`).count !== count) throw new GltfError(`${what}: its attributes disagree on the vertex count (${name})`);
    }
    const position = read(attributes.POSITION, ["VEC3"], [5126], `${what} POSITION`);
    const normal = attributes.NORMAL !== undefined ? read(attributes.NORMAL, ["VEC3"], [5126], `${what} NORMAL`) : undefined;
    const uv = attributes.TEXCOORD_0 !== undefined ? read(attributes.TEXCOORD_0, ["VEC2"], [5126], `${what} TEXCOORD_0`) : undefined;
    const base = positions.length / 3;
    for (let vertex = 0; vertex < count; vertex++) {
      // The glTF point, through the node, then the part's axes: (x, y, z) -> (x, z, y), scaled and offset.
      const [x, y, z] = apply(matrix, position[vertex * 3]!, position[vertex * 3 + 1]!, position[vertex * 3 + 2]!);
      const px = x * request.scale + request.offset[0], py = z * request.scale + request.offset[1], pz = y * request.scale + request.offset[2];
      // Same range as inline meshes: a node matrix or a scale that overflows is refused, not drawn.
      if (![px, py, pz].every(value => Number.isFinite(value) && Math.abs(value) <= INSTRUMENT_MESH_COORDINATE)) {
        throw new GltfError(`${what}: vertex ${vertex} is at (${px}, ${py}, ${pz}) after the node's transform and the fit: positions must be finite and within ±${INSTRUMENT_MESH_COORDINATE}`);
      }
      positions.push(px, py, pz);
      if (normal) {
        const [nx, ny, nz] = apply3(normalMatrix, normal[vertex * 3]!, normal[vertex * 3 + 1]!, normal[vertex * 3 + 2]!), length = Math.hypot(nx, ny, nz);
        if (!(length > 1e-12) || !Number.isFinite(length)) throw new GltfError(`${what}: normal ${vertex} is zero or not finite`);
        normals.push(nx / length, nz / length, ny / length);
      }
      if (uv) uvs.push(uv[vertex * 2]!, uv[vertex * 2 + 1]!);
    }
    withNormals &&= !!normal; withUvs &&= !!uv;
    const order = primitive.indices !== undefined ? read(primitive.indices, ["SCALAR"], [5121, 5123, 5125], `${what} indices`, INSTRUMENT_MESH_TRIANGLES * 3) : undefined;
    for (let t = 0; t < triangles; t++) {
      const [a, b, c] = order ? [order[t * 3]!, order[t * 3 + 1]!, order[t * 3 + 2]!] : [t * 3, t * 3 + 1, t * 3 + 2];
      if (a >= count || b >= count || c >= count) throw new GltfError(`${what}: index ${Math.max(a, b, c)} is past its ${count} vertices`);
      // A file may carry triangles that repeat a vertex; they draw nothing, so they are dropped.
      if (a !== b && b !== c && a !== c) indices.push(base + a, base + b, base + c);
    }
  }
  if (!indices.length) throw new GltfError("the mesh has no triangles");
  const finalNormals = withNormals ? new Float32Array(normals) : undefined;
  return buildGeometry(new Float32Array(positions), finalNormals, new Uint32Array(indices), withUvs ? new Float32Array(uvs) : undefined);
}

function parseContainer(bytes: ArrayBuffer): { gltf: Gltf; binary?: ArrayBuffer } {
  if (bytes.byteLength < 12) throw new GltfError("the file is too short to be glTF");
  const view = new DataView(bytes);
  if (view.getUint32(0, true) === 0x46546c67) {
    if (view.getUint32(4, true) !== 2) throw new GltfError("the glB is not version 2");
    const total = Math.min(view.getUint32(8, true), bytes.byteLength);
    let offset = 12, json: Gltf | undefined, binary: ArrayBuffer | undefined;
    while (offset + 8 <= total) {
      const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), start = offset + 8;
      if (start + length > total) throw new GltfError("a glB chunk runs past the end of the file");
      if (type === 0x4e4f534a && !json) json = parseJson(new Uint8Array(bytes, start, length));
      else if (type === 0x004e4942 && !binary) binary = bytes.slice(start, start + length);
      offset = start + ((length + 3) & ~3);
    }
    if (!json) throw new GltfError("the glB has no JSON chunk");
    return { gltf: json, binary };
  }
  const head = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 64));
  if (!head.some(byte => byte === 0x7b)) throw new GltfError("the file is neither a glB nor a glTF");
  return { gltf: parseJson(new Uint8Array(bytes)) };
}
function parseJson(bytes: Uint8Array): Gltf {
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("not an object");
    return value as Gltf;
  } catch (error) { throw new GltfError(`the glTF JSON is malformed: ${String(error)}`); }
}
function dataUri(uri: string, index: number): ArrayBuffer {
  const match = /^data:[^,]*;base64,(.*)$/s.exec(uri);
  if (!match) throw new GltfError(`buffer ${index} is external (${uri.slice(0, 40)}): embed it as a data: URI or use a glB`);
  const text = atob(match[1]!), out = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at++) out[at] = text.charCodeAt(at);
  return out.buffer;
}

// 4 × 4 column-major matrices, as glTF stores them.
const identity = () => { const m = new Float64Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function multiply(a: Float64Array, b: Float64Array) {
  const m = new Float64Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
    m[column * 4 + row] = sum;
  }
  return m;
}
function local(node: NonNullable<Gltf["nodes"]>[number]) {
  if (node.matrix) {
    if (node.matrix.length !== 16 || node.matrix.some(value => !Number.isFinite(value))) throw new GltfError("a node matrix is malformed");
    return Float64Array.from(node.matrix);
  }
  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [], [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [], [sx = 1, sy = 1, sz = 1] = node.scale ?? [];
  if ([tx, ty, tz, qx, qy, qz, qw, sx, sy, sz].some(value => !Number.isFinite(value))) throw new GltfError("a node transform is not finite");
  const length = Math.hypot(qx, qy, qz, qw) || 1, x = qx / length, y = qy / length, z = qz / length, w = qw / length, m = identity();
  m[0] = (1 - 2 * (y * y + z * z)) * sx; m[1] = 2 * (x * y + z * w) * sx; m[2] = 2 * (x * z - y * w) * sx;
  m[4] = 2 * (x * y - z * w) * sy; m[5] = (1 - 2 * (x * x + z * z)) * sy; m[6] = 2 * (y * z + x * w) * sy;
  m[8] = 2 * (x * z + y * w) * sz; m[9] = 2 * (y * z - x * w) * sz; m[10] = (1 - 2 * (x * x + y * y)) * sz;
  m[12] = tx; m[13] = ty; m[14] = tz;
  return m;
}
const apply = (m: Float64Array, x: number, y: number, z: number): Vec3 =>
  [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
const apply3 = (m: Float64Array, x: number, y: number, z: number): Vec3 =>
  [m[0]! * x + m[3]! * y + m[6]! * z, m[1]! * x + m[4]! * y + m[7]! * z, m[2]! * x + m[5]! * y + m[8]! * z];
/** The normal matrix: the transpose of the inverse of the upper 3 × 3, column-major. */
function inverseTranspose(m: Float64Array): Float64Array {
  const a = m[0]!, b = m[4]!, c = m[8]!, d = m[1]!, e = m[5]!, f = m[9]!, g = m[2]!, h = m[6]!, i = m[10]!;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!(Math.abs(det) > 1e-18)) throw new GltfError("a node's transform is singular");
  // Cofactors of the row-major [[a b c] [d e f] [g h i]] are the inverse transpose, row-major; store column-major.
  const cof = [e * i - f * h, -(d * i - f * g), d * h - e * g, -(b * i - c * h), a * i - c * g, -(a * h - b * g), b * f - c * e, -(a * f - c * d), a * e - b * d];
  const out = new Float64Array(9);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) out[column * 3 + row] = cof[row * 3 + column]! / det;
  return out;
}
