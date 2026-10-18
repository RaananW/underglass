/**
 * The Instrument level's capture probe (Rendering Model 2D.5 `page`, `docs/ui-library/instrument-phase2.md`, core work
 * item 4): one cube texture per layer, filled on the GPU from the layer's own capture and the studio, so the layer's metals
 * and coats reflect its faceplate print and neighbouring controls. Ported from the I0.4 probe
 * (`examples/playground/src/ui-probes/instrument-environment.ts`), which measured it.
 *
 * From the capture point (the layer's centre when the scene was built, `height` px in front of the face plane), a texel's
 * direction either leaves the projection box through its back wall, the face plane, inside the layer's extent, where the
 * cube holds the captured colour (linear, weighted by the capture's alpha), or anywhere else, where it holds the studio at
 * that direction; the box's other walls are far away, so the studio stays at infinity. Mips 1 and up are a 5 x 5 Gaussian
 * blur chain in direction space. Lite binds the cube's view directly as the specular environment of the layer's PBR
 * materials (`setPbrLocalEnvironment`), so refreshing its texels updates them with no rebuild. Lite fixes the projection
 * box when a scene registers, so a layer that moves does not move the box: the cube's content follows the layer's current
 * placement instead (each refresh maps the box's back wall to the layer through its inverse similarity).
 *
 * Raw WebGPU on the canvas's configured device (the probe's textures and passes are not Lite's); Lite's types are used for
 * the environment it hands back.
 */
import type { EnvironmentTextures } from "@babylonjs/lite";

/** WebGPU flags by value (the DOM library declares the interfaces but not these namespaces). */
const TEXTURE_USAGE = { COPY_SRC: 0x01, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;
const BUFFER_USAGE = { MAP_READ: 0x01, COPY_SRC: 0x04, COPY_DST: 0x08, UNIFORM: 0x40, QUERY_RESOLVE: 0x200 } as const;
type Vec3 = [number, number, number];

const probeShader = /* wgsl */ `
struct Shared { boxMin: vec4f, boxMax: vec4f, centre: vec4f, inverseX: vec4f, inverseY: vec4f, stage: vec4f, content: vec4f };
struct Face { face: u32, size: f32, spread: f32, pad: f32 };
@group(0) @binding(0) var<uniform> probe: Shared;
@group(0) @binding(1) var<uniform> info: Face;
@group(0) @binding(2) var linearSampler: sampler;
@group(1) @binding(0) var capture: texture_2d<f32>;
@group(1) @binding(1) var studio: texture_cube<f32>;
@group(1) @binding(2) var previous: texture_cube<f32>;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[index], 0.0, 1.0);
}
// Cube face directions (WebGPU's layer order +X, -X, +Y, -Y, +Z, -Z), u right and v down across the face.
fn faceDirection(face: u32, texel: vec2f) -> vec3f {
  let u = texel.x / info.size * 2.0 - 1.0;
  let v = texel.y / info.size * 2.0 - 1.0;
  switch face {
    case 0u: { return normalize(vec3f(1.0, -v, -u)); }
    case 1u: { return normalize(vec3f(-1.0, -v, u)); }
    case 2u: { return normalize(vec3f(u, 1.0, v)); }
    case 3u: { return normalize(vec3f(u, -1.0, -v)); }
    case 4u: { return normalize(vec3f(u, -v, 1.0)); }
    default: { return normalize(vec3f(-u, -v, -1.0)); }
  }
}
fn rotateY(v: vec3f, angle: f32) -> vec3f { let c = cos(angle); let s = sin(angle); return vec3f(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
fn srgbToLinear(c: vec3f) -> vec3f { return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045)); }

// Mip 0: a stored direction s is read for the world direction rotateY(w, rotation) = s (Lite applies the environment
// rotation after the parallax correction). From the capture point, w leaves the box somewhere: through the face plane
// it sees the capture there, anywhere else the studio.
@fragment fn fill(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let s = faceDirection(info.face, position.xy);
  let w = rotateY(s, -probe.centre.w);
  var colour = textureSampleLevel(studio, linearSampler, s, 0.0).rgb;
  if (probe.content.z > 0.5 && w.z > 1e-5) {
    let c = probe.centre.xyz;
    let far = max((probe.boxMin.xyz - c) / w, (probe.boxMax.xyz - c) / w);
    let t = min(far.x, min(far.y, far.z));
    if (far.z <= t * 1.0001) {
      let hit = c + w * t;
      // World to canvas px to layer-local px (the inverse similarity), then to capture texels.
      let canvas = vec3f(hit.x + probe.stage.x, probe.stage.y - hit.y, 1.0);
      let local = vec2f(dot(probe.inverseX.xyz, canvas), dot(probe.inverseY.xyz, canvas));
      let texel = local * probe.stage.zw;
      let size = vec2f(textureDimensions(capture));
      if (all(texel >= vec2f(0.0)) && all(texel < probe.content.xy)) {
        let sample = textureSampleLevel(capture, linearSampler, texel / size, 0.0);
        colour = mix(colour, srgbToLinear(sample.rgb), sample.a);
      }
    }
  }
  return vec4f(colour, 1.0);
}
// Mip n: a 5 x 5 Gaussian over the previous mip in the plane tangent to the direction, about one texel of this mip
// wide, so each level is roughly the roughness Lite's lod mapping reads it for.
@fragment fn blur(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let s = faceDirection(info.face, position.xy);
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(s.y) > 0.99);
  let tx = normalize(cross(up, s));
  let ty = cross(s, tx);
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var i = -2; i <= 2; i++) {
    for (var j = -2; j <= 2; j++) {
      let o = vec2f(f32(i), f32(j));
      let k = exp(-dot(o, o) / 3.0);
      sum += textureSampleLevel(previous, linearSampler, normalize(s + (tx * o.x + ty * o.y) * info.spread), 0.0).rgb * k;
      weight += k;
    }
  }
  return vec4f(sum / weight, 1.0);
}
`;

export interface CaptureProbeOptions {
  /** Cube face size in texels (a power of two). */
  size: number;
  /** The environment rotation of the scene that uses the probe (`setEnvironmentRotation`). */
  rotation: number;
  /** The capture point's world x and y (Lite axes, canvas centre at the origin): the layer's centre when the scene is built. */
  anchor: [number, number];
  /** How far in front of the face the cube is captured (world units). */
  height: number;
  /** How far the projection box reaches beyond the anchor and towards the viewer. */
  reach?: number;
}
/** What a refresh needs to know of the layer's present placement and capture. */
export interface ProbeSource {
  /** The layer's capture texture. */
  capture: GPUTexture;
  /** Canvas CSS px to layer px (the inverse similarity's rows `[a, c, e, 0]` and `[b, d, f, 0]`). */
  inverse: [number[], number[]];
  /** Half the stage in CSS px, and the capture's texels per CSS px. */
  stage: { halfWidth: number; halfHeight: number; gridX: number; gridY: number };
  /** The used region of the capture, in texels. */
  content: { width: number; height: number };
}

/**
 * A cube environment filled from a layer's capture (see the module header). `environment` shares the studio's BRDF table,
 * sampler and irradiance; `projection` is what `setPbrLocalEnvironment` takes; `refresh` re-renders every face and mip from
 * the capture (or, with no source, from the studio only) as one submitted command buffer.
 */
export function createCaptureProbe(device: GPUDevice, studio: EnvironmentTextures, options: CaptureProbeOptions) {
  const { size } = options, reach = options.reach ?? 50000;
  const mipLevelCount = Math.log2(size) + 1;
  const format: GPUTextureFormat = "rgba16float";
  const cube = device.createTexture({ label: "underglass-capture-probe", size: [size, size, 6], format, mipLevelCount,
    usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC });
  const environment: EnvironmentTextures = { ...studio, specularCube: cube, specularCubeView: cube.createView({ dimension: "cube" }),
    lodGenerationScale: studio.lodGenerationScale ?? 0.8, lodGenerationOffset: 0 };
  // The capture point stands `height` in front of the face (Lite's +z is away from the viewer), on the anchor's line; the
  // box's back wall is the face plane z = 0, its other walls `reach` away.
  const [cx, cy] = options.anchor;
  const centre: Vec3 = [cx, cy, -options.height];
  const box = { minX: cx - reach, maxX: cx + reach, minY: cy - reach, maxY: cy + reach, minZ: -reach };
  const projection = { projectionPosition: [cx, cy, -reach / 2] as Vec3, capturePosition: centre, projectionSize: [2 * reach, 2 * reach, reach] as Vec3 };

  const module = device.createShaderModule({ label: "underglass-capture-probe", code: probeShader });
  const shared = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 2, buffer: { type: "uniform" } }, { binding: 1, visibility: 2, buffer: { type: "uniform" } }, { binding: 2, visibility: 2, sampler: {} },
  ] });
  const sources = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 2, texture: { sampleType: "float" } }, { binding: 1, visibility: 2, texture: { sampleType: "float", viewDimension: "cube" } },
    { binding: 2, visibility: 2, texture: { sampleType: "float", viewDimension: "cube" } },
  ] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [shared, sources] });
  const pipeline = (entryPoint: string) => device.createRenderPipeline({ label: `underglass-capture-probe-${entryPoint}`, layout,
    vertex: { module, entryPoint: "vertexMain" }, fragment: { module, entryPoint, targets: [{ format }] }, primitive: { topology: "triangle-list" } });
  const fill = pipeline("fill"), blur = pipeline("blur");
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "nearest", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const sharedBuffer = device.createBuffer({ size: 112, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
  const buffers: GPUBuffer[] = [sharedBuffer];
  // One uniform buffer, target view and bind group per face and mip.
  const passes: { mip: number; target: GPUTextureView; group: GPUBindGroup; previous?: GPUTextureView }[] = [];
  for (let mip = 0; mip < mipLevelCount; mip++) {
    const faceSize = size >> mip;
    for (let face = 0; face < 6; face++) {
      const buffer = device.createBuffer({ size: 16, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
      buffers.push(buffer);
      // `spread`: the tangent-plane step of the blur, about half a texel of this mip (a face spans 2 tangent units).
      const data = new ArrayBuffer(16);
      new Uint32Array(data, 0, 1)[0] = face;
      new Float32Array(data, 4, 3).set([faceSize, (2 / faceSize) * 0.6, 0]);
      device.queue.writeBuffer(buffer, 0, data);
      passes.push({ mip, target: cube.createView({ dimension: "2d", baseMipLevel: mip, mipLevelCount: 1, baseArrayLayer: face, arrayLayerCount: 1 }),
        group: device.createBindGroup({ layout: shared, entries: [{ binding: 0, resource: { buffer: sharedBuffer } }, { binding: 1, resource: { buffer } }, { binding: 2, resource: sampler }] }),
        previous: mip ? cube.createView({ dimension: "cube", baseMipLevel: mip - 1, mipLevelCount: 1 }) : undefined });
    }
  }
  const studioView = studio.specularCube.createView({ dimension: "cube" });
  // A 1 x 1 placeholder capture for the studio-only fill.
  const blank = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: TEXTURE_USAGE.TEXTURE_BINDING });
  const groups = new WeakMap<GPUTexture, GPUBindGroup[]>();
  const sourcesFor = (capture: GPUTexture) => {
    let list = groups.get(capture);
    if (!list) {
      const view = capture.createView();
      list = passes.map(pass => device.createBindGroup({ layout: sources, entries: [
        { binding: 0, resource: view }, { binding: 1, resource: studioView }, { binding: 2, resource: pass.previous ?? studioView },
      ] }));
      groups.set(capture, list);
    }
    return list;
  };
  // GPU time of a refresh, from timestamp queries when the device has them; one read at a time, never in the way of a frame.
  let timing: { querySet: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer; pending: boolean } | undefined;
  if (device.features.has("timestamp-query")) {
    timing = { querySet: device.createQuerySet({ type: "timestamp", count: 2 }), resolve: device.createBuffer({ size: 16, usage: BUFFER_USAGE.QUERY_RESOLVE | BUFFER_USAGE.COPY_SRC }),
      read: device.createBuffer({ size: 16, usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST }), pending: false };
    buffers.push(timing.resolve, timing.read);
  }
  const gpuMs: number[] = [];
  let refreshes = 0, destroyed = false;
  return {
    environment, projection, size, mipLevelCount, centre, bytes: probeBytes(size),
    refreshes: () => refreshes,
    /** The GPU time of the last refreshes, ms (up to 256, from timestamp queries; empty without them). */
    gpuMs: () => gpuMs,
    /** Re-renders the probe from `source` (none: the studio only). Encoded and submitted on its own, before the frame's work. */
    refresh(source: ProbeSource | undefined) {
      if (destroyed) return;
      const page = !!source;
      const layer = source?.inverse;
      device.queue.writeBuffer(sharedBuffer, 0, new Float32Array([
        box.minX, box.minY, box.minZ, 0, box.maxX, box.maxY, 0, 0, ...centre, options.rotation,
        ...(layer?.[0] ?? [1, 0, 0, 0]), ...(layer?.[1] ?? [0, 1, 0, 0]),
        source?.stage.halfWidth ?? 0, source?.stage.halfHeight ?? 0, source?.stage.gridX ?? 1, source?.stage.gridY ?? 1,
        source?.content.width ?? 0, source?.content.height ?? 0, page ? 1 : 0, 0,
      ]));
      const list = sourcesFor(source?.capture ?? blank);
      const encoder = device.createCommandEncoder({ label: "underglass-capture-probe" });
      const timed = timing && !timing.pending ? timing : undefined;
      passes.forEach((pass, index) => {
        const timestampWrites = timed && (index === 0 || index === passes.length - 1)
          ? { querySet: timed.querySet, ...(index === 0 ? { beginningOfPassWriteIndex: 0 } : {}), ...(index === passes.length - 1 ? { endOfPassWriteIndex: 1 } : {}) } : undefined;
        const render = encoder.beginRenderPass({ colorAttachments: [{ view: pass.target, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }], ...(timestampWrites ? { timestampWrites } : {}) });
        render.setPipeline(pass.mip ? blur : fill);
        render.setBindGroup(0, pass.group);
        render.setBindGroup(1, list[index]!);
        render.draw(3);
        render.end();
      });
      if (timed) { encoder.resolveQuerySet(timed.querySet, 0, 2, timed.resolve, 0); encoder.copyBufferToBuffer(timed.resolve, 0, timed.read, 0, 16); }
      device.queue.submit([encoder.finish()]);
      refreshes++;
      if (timed) {
        timed.pending = true;
        timed.read.mapAsync(BUFFER_USAGE.MAP_READ).then(() => {
          const [start, end] = new BigUint64Array(timed.read.getMappedRange().slice(0));
          timed.read.unmap();
          if (gpuMs.length === 256) gpuMs.shift();
          gpuMs.push(Number(end! - start!) / 1e6);
        }, () => undefined).finally(() => { timed.pending = false; });
      }
    },
    /** Releases the cube and the probe's buffers; the caller has fenced the GPU (or the device is lost). */
    dispose() {
      if (destroyed) return;
      destroyed = true;
      cube.destroy(); blank.destroy();
      for (const buffer of buffers) buffer.destroy();
      timing?.querySet.destroy();
    },
  };
}
export type CaptureProbe = ReturnType<typeof createCaptureProbe>;

/** GPU bytes of a page cube: `rgba16float`, six faces, a full mip chain. */
export function probeBytes(size: number): number {
  let bytes = 0;
  for (let face = size; face >= 1; face = Math.floor(face / 2)) bytes += face * face * 8 * 6;
  return bytes;
}
