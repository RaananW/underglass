/**
 * The asset store of custom parts (core work item 5, `docs/ui-library/instrument-phase2.md`): one per engine. It loads the
 * glB/glTF files that `mesh` profiles reference (a URL it fetches, or bytes it is given), reads them with
 * `instrument-gltf.ts`, and keeps the parsed triangles in a cache by the profile's identity (`url`, `mesh`, `scale`,
 * `offset`) under a byte budget. It never runs inside a frame: the controller's frame only calls `bind`, which starts a
 * load the first time it sees a reference and hands the profile its triangles once they are there; a finished load asks for
 * a frame. A reference that cannot be loaded is `failed` with the reason and the part stays out; nothing else is affected.
 *
 * No GPU and no Lite: the geometry on the GPU belongs to the layer's scene (`instrument-pass.ts`).
 */
import { readGltf, GltfError } from "./instrument-gltf.js";
import { checkDeclaredBounds, geometryBytes, meshGeometry, meshOwner, setMeshGeometry, type MeshProfile, type PartGeometry } from "./instrument-mesh.js";
import { meshReferences, type InstrumentScene } from "./instrument.js";

/** Parsed geometry the store keeps per engine; a load that would pass it with every entry referenced fails (`budget`). */
export const INSTRUMENT_ASSET_BYTES = 32 * 1024 * 1024;
/** The largest file a load accepts. */
export const INSTRUMENT_ASSET_FILE_BYTES = 8 * 1024 * 1024;
/** Live-or-dead refs an entry keeps before it prunes the dead ones. */
const SHAPE_REFS = 64;
/** A load that has not finished in this long fails. */
export const INSTRUMENT_ASSET_TIMEOUT_MS = 15000;

export type AssetStatus = "loading" | "ready" | "failed";
export interface AssetStoreOptions {
  /** A finished load: core draws a frame so the part appears in it. */
  onChange(): void;
  fetch?: typeof fetch;
  budgetBytes?: number;
  fileBytes?: number;
  timeoutMs?: number;
}
interface Entry {
  id: string;
  status: AssetStatus;
  geometry?: PartGeometry;
  error?: string;
  bytes: number;
  referenced: boolean;
  used: number;
  /** The profiles this entry's triangles were attached to: let go of when it is evicted. */
  shapes: WeakRef<object>[];
  attached: WeakSet<object>;
  /** Timings of the load, ms: the request (or 0 for bytes in hand) and the glTF read. */
  fetchMs?: number;
  parseMs?: number;
}

/** A reference's state for diagnostics: what it is, whether it has its triangles, and why not. */
export interface AssetInfo { status: AssetStatus; error?: string; vertices: number; triangles: number }

export function createAssetStore(options: AssetStoreOptions) {
  const entries = new Map<string, Entry>();
  const fetching = new Map<string, Promise<ArrayBuffer>>();
  const controllers = new Set<AbortController>();
  const budget = options.budgetBytes ?? INSTRUMENT_ASSET_BYTES, fileBytes = options.fileBytes ?? INSTRUMENT_ASSET_FILE_BYTES, timeout = options.timeoutMs ?? INSTRUMENT_ASSET_TIMEOUT_MS;
  // What each profile object was last checked against: its declared box against the entry's triangles.
  const checked = new WeakMap<object, { geometry: PartGeometry; error?: string }>();
  const seen = new WeakSet<object>();
  const stats = { loads: 0, hits: 0, failures: 0, evictions: 0 };
  let clock = 0, disposed = false, inFlight = 0;

  // This store's identity: a profile's triangles belong to the store that loaded them (a second engine, or a controller enabled again,
  // loads its own).
  const token = {};
  /** Takes an entry's triangles off the profiles they were attached to, so evicting it frees them. */
  function release(entry: Entry) {
    entry.attached = new WeakSet();
    for (const ref of entry.shapes.splice(0)) { const shape = ref.deref(); if (shape && meshOwner(shape) === token) setMeshGeometry(shape, undefined); }
  }
  const total = () => { let sum = 0; for (const entry of entries.values()) sum += entry.bytes; return sum; };
  /** Makes room for `bytes` by evicting the least recently used ready entries nobody references; false if it cannot. */
  function room(bytes: number): boolean {
    while (total() + bytes > budget) {
      let oldest: Entry | undefined;
      for (const entry of entries.values()) if (entry.status === "ready" && !entry.referenced && (!oldest || entry.used < oldest.used)) oldest = entry;
      if (!oldest) return false;
      release(oldest);
      entries.delete(oldest.id);
      stats.evictions++;
    }
    return true;
  }

  async function bytesOf(shape: MeshProfile): Promise<ArrayBuffer> {
    const source = shape.source!;
    if (source.data) { await Promise.resolve(); return source.data; }
    const url = source.url!;
    let pending = fetching.get(url);
    if (!pending) {
      pending = download(url).finally(() => fetching.delete(url));
      fetching.set(url, pending);
    }
    return pending;
  }
  async function download(url: string): Promise<ArrayBuffer> {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(new GltfError(`the load took longer than ${timeout} ms`)), timeout);
    try {
      let response: Response;
      try { response = await (options.fetch ?? fetch)(url, { signal: controller.signal }); }
      catch (error) { throw controller.signal.reason instanceof GltfError ? controller.signal.reason : new GltfError(`the request failed: ${String(error)}`); }
      if (!response.ok) throw new GltfError(`the request failed with HTTP ${response.status}`);
      // A server that answers an unknown path with its page (a single-page app's fallback) is not serving a model.
      if (/^text\/html\b/i.test(response.headers.get("content-type") ?? "")) throw new GltfError("the server answered with an HTML page, not a model (check the URL)");
      const length = Number(response.headers.get("content-length"));
      if (Number.isFinite(length) && length > fileBytes) throw new GltfError(`the file is ${length} bytes, above the ${fileBytes} a custom part's file may have`);
      if (!response.body) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength > fileBytes) throw new GltfError(`the file is ${buffer.byteLength} bytes, above the ${fileBytes} a custom part's file may have`);
        return buffer;
      }
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > fileBytes) { void reader.cancel().catch(() => undefined); throw new GltfError(`the file is larger than the ${fileBytes} bytes a custom part's file may have`); }
          chunks.push(value);
        }
      } catch (error) { throw controller.signal.reason instanceof GltfError ? controller.signal.reason : error; }
      const out = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) { out.set(chunk, at); at += chunk.byteLength; }
      return out.buffer;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }

  async function load(entry: Entry, shape: MeshProfile) {
    inFlight++;
    try {
      const started = performance.now();
      const bytes = await bytesOf(shape);
      if (disposed) return;
      // Bytes in hand are held to the same cap as a download.
      if (bytes.byteLength > fileBytes) throw new GltfError(`the file is ${bytes.byteLength} bytes, above the ${fileBytes} a custom part's file may have`);
      const fetched = performance.now();
      const geometry = readGltf(bytes, { ...(shape.source!.mesh !== undefined ? { mesh: shape.source!.mesh } : {}), scale: shape.scale ?? 1, offset: shape.offset ?? [0, 0, 0] });
      const size = geometryBytes(geometry);
      if (!room(size)) throw new GltfError(`the asset budget is spent: ${size} more bytes would pass ${budget} (every cached mesh is in use)`);
      entry.geometry = geometry; entry.bytes = size; entry.status = "ready"; stats.loads++;
      entry.fetchMs = fetched - started; entry.parseMs = performance.now() - fetched;
    } catch (error) {
      entry.status = "failed";
      entry.error = error instanceof GltfError ? error.message : `unexpected: ${String(error)}`;
      stats.failures++;
    } finally {
      inFlight--;
      if (!disposed) options.onChange();
    }
  }

  return {
    /** Starts the frame's references: none is marked in use until `bind` sees it. */
    begin() { for (const entry of entries.values()) entry.referenced = false; },
    /** The scene's references: starts a load for one the store has not seen, and hands every ready one its triangles. */
    bind(scene: InstrumentScene) {
      if (disposed) return;
      for (const { shape } of meshReferences(scene)) {
        let entry = entries.get(shape.id);
        if (!entry) {
          entry = { id: shape.id, status: "loading", bytes: 0, referenced: true, used: ++clock, shapes: [], attached: new WeakSet() };
          entries.set(shape.id, entry);
          void load(entry, shape);
        } else if (!seen.has(shape)) stats.hits++;
        seen.add(shape);
        entry.referenced = true; entry.used = ++clock;
        // Triangles another store attached are not this store's: until it has loaded the mesh itself the profile has none.
        if (entry.status !== "ready" || !entry.geometry) { if (meshOwner(shape) !== undefined && meshOwner(shape) !== token) setMeshGeometry(shape, undefined); continue; }
        let verdict = checked.get(shape);
        if (!verdict || verdict.geometry !== entry.geometry) {
          const error = checkDeclaredBounds(entry.geometry, shape.bounds!);
          verdict = { geometry: entry.geometry, ...(error ? { error } : {}) };
          checked.set(shape, verdict);
        }
        const wanted = verdict.error ? undefined : entry.geometry;
        if (meshGeometry(shape) !== wanted || (wanted && meshOwner(shape) !== token)) {
          setMeshGeometry(shape, wanted, token);
          if (wanted && !entry.attached.has(shape)) {
            // Each validated scene has fresh profile objects: remember a shape once, and drop the refs of dead ones past a small bound.
            entry.attached.add(shape);
            entry.shapes.push(new WeakRef(shape));
            if (entry.shapes.length > SHAPE_REFS) {
              entry.shapes = entry.shapes.filter(ref => ref.deref() !== undefined);
              // Still over (nothing has been collected yet): forget the oldest. They belong to scenes long gone; the owner check keeps them harmless.
              if (entry.shapes.length > 2 * SHAPE_REFS) entry.shapes.splice(0, entry.shapes.length - SHAPE_REFS);
            }
          }
        }
      }
    },
    /** Ends the frame's references: a failed entry nobody references is forgotten, so a scene that asks again retries. */
    end() { for (const [id, entry] of entries) if (!entry.referenced && entry.status === "failed") { release(entry); entries.delete(id); } },
    /** A reference's state, for `state().instrument`. */
    info(shape: MeshProfile): AssetInfo {
      const entry = entries.get(shape.id), verdict = checked.get(shape);
      if (!entry) return { status: "loading", vertices: 0, triangles: 0 };
      if (entry.status === "failed") return { status: "failed", error: entry.error!, vertices: 0, triangles: 0 };
      if (entry.status === "ready" && entry.geometry) {
        const detail = { vertices: entry.geometry.positions.length / 3, triangles: entry.geometry.indices.length / 3 };
        return verdict?.error ? { status: "failed", error: verdict.error, ...detail } : { status: "ready", ...detail };
      }
      return { status: "loading", vertices: 0, triangles: 0 };
    },
    state: () => ({
      entries: [...entries.values()].map(entry => ({ id: entry.id, status: entry.status, bytes: entry.bytes, referenced: entry.referenced, shapes: entry.shapes.length,
        ...(entry.fetchMs !== undefined ? { fetchMs: entry.fetchMs, parseMs: entry.parseMs } : {}), ...(entry.error ? { error: entry.error } : {}) })),
      bytes: total(), budgetBytes: budget, fileBytes, ...stats, inFlight,
    }),
    /** Aborts what is in flight and forgets everything. */
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      for (const entry of entries.values()) release(entry);
      entries.clear();
      fetching.clear();
    },
  };
}
export type AssetStore = ReturnType<typeof createAssetStore>;
