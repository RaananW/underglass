/**
 * Packs layer state into uniform buffers and generates the WGSL that composites layers. Each layer
 * is described by a fixed block of 14 vec4s (see `BLOCK`): the inverse transform, extent, opacity,
 * ripple, up to three effects, the clip, the material and the inverse's projective row. The uploaded inverse layer matrix maps each output
 * pixel back into layer-local space, where the shader applies compiled motion and effects, then samples the
 * captured texture. `renderer.ts` draws one pass per layer (`layerShader`/`layerUniforms`);
 * `compositionShader`/`compositionUniforms` is the single-pass variant. Effect packing is in
 * `effects.ts` and compiled motion in `compiled.ts`.
 */
import type { EffectWrapperOptions } from "@babylonjs/lite";
import { homography, invertRows, validateGeometry } from "./native.js";
import type { Ripple } from "./ripple.js";
import { effectUniforms, isSceneMaterial, materialUniforms, MATERIAL_INTERIOR_CEILING, type EffectDescriptor, type ApplicationEffect, type MaterialDescriptor } from "./effects.js";
import { LAYER_BLOCK_FLOATS, LAYER_PASS_FLOATS, type CompiledMotion } from "./compiled.js";
import { RELIEF_VEC4S, reliefWGSL } from "./relief.js";

/**
 * What the compositor reads from a layer. Optional members are absent for layers without that
 * feature. Coordinates are CSS pixels; `matrix()` maps layer-local to canvas space.
 */
interface CompositeLayer {
  matrix(): DOMMatrix;
  /** Visible region in layer-local pixels; the optional matrix is the layer's canvas-space matrix. */
  clip?(matrix?: DOMMatrixReadOnly): { x: number; y: number; width: number; height: number } | undefined;
  opacity(): number;
  extent: { width: number; height: number };
  /** Captured texture size (`pixel*`) against the layer's CSS size, when they differ. */
  contentExtent?: { width: number; height: number; pixelWidth: number; pixelHeight: number };
  ripple?(): Ripple | undefined;
  effects?(): readonly EffectDescriptor[];
  effectsEnabled?(): boolean;
  /** The layer's persistent material, applied before its effect chain. */
  material?(): MaterialDescriptor | undefined;
  /** Present while a compiled CSS animation drives the layer inside the shader. */
  compiledMotion?(): CompiledMotion | undefined;
}

/** Uniform floats per layer block (14 vec4s): inverse matrix + grid, extent/opacity, ripple, 3 effects, clip, material, projective row. */
const BLOCK = LAYER_BLOCK_FLOATS;
/** vec4s per layer block. */
const BLOCK_VEC4S = BLOCK / 4;

/**
 * What a layer pass is built with beyond the plain layer program: its effect chain's custom definition, and its
 * material, either a custom definition or the built-in relief (which adds the relief uniform binding). Interned by
 * `passShaders`, so passes built for the same combination compare with `===`.
 */
export interface PassShaders { readonly effect?: ApplicationEffect; readonly material?: ApplicationEffect; readonly relief: boolean }
const interned = new Map<ApplicationEffect | undefined, Map<ApplicationEffect | "relief" | undefined, PassShaders>>();
/** The interned combination for `effect` and `material`, or undefined when the pass needs neither. */
export function passShaders(effect?: ApplicationEffect, material?: ApplicationEffect | "relief"): PassShaders | undefined {
  if (!effect && !material) return undefined;
  let row = interned.get(effect);
  if (!row) interned.set(effect, row = new Map());
  let shaders = row.get(material);
  if (!shaders) row.set(material, shaders = Object.freeze({ effect, material: material === "relief" ? undefined : material, relief: material === "relief" }));
  return shaders;
}

/**
 * The rectangle a layer pass draws, in layer-local CSS px: the clipped layer box, grown by a relief material's
 * shadow outset on every side the clip does not cut, so shadows never spill out of a viewport that clips the layer.
 */
export function drawRectangle(clip: { x: number; y: number; width: number; height: number }, extent: { width: number; height: number },
  outset?: { top: number; right: number; bottom: number; left: number }) {
  const low = { x: Math.max(0, clip.x), y: Math.max(0, clip.y) };
  const high = { x: Math.min(extent.width, clip.x + clip.width), y: Math.min(extent.height, clip.y + clip.height) };
  return {
    x0: outset && low.x <= 0 ? -outset.left : low.x, y0: outset && low.y <= 0 ? -outset.top : low.y,
    x1: outset && high.x >= extent.width ? extent.width + outset.right : high.x,
    y1: outset && high.y >= extent.height ? extent.height + outset.bottom : high.y,
  };
}

/** Writes one layer's 14-vec4 uniform block at `offset` and returns its canvas-space matrix and clip. */
function writeLayerBlock(values: Float32Array, offset: number, layer: CompositeLayer, shift: number, customIndex: number, compiled: boolean,
  materialIndex = -1) {
  // Compiled motion is evaluated in the shader, so the matrix only carries the motion's origin.
  const motion = compiled ? layer.compiledMotion?.() : undefined;
  const base = motion ? new DOMMatrix().translate(motion.origin.x, motion.origin.y) : layer.matrix();
  // `shift` is a horizontal canvas-space offset applied to the whole layer.
  const matrix = new DOMMatrix().translate(shift, 0).multiply(base);
  validateGeometry(matrix, layer.extent);
  // The shader maps canvas -> layer-local, so it needs the inverse: the 2D rows of an affine matrix, or the inverse
  // homography of a tilted one (its third row divides).
  const inverse = matrix.is2D ? matrix.inverse() : undefined;
  const rows = matrix.is2D ? undefined : invertRows(homography(matrix));
  const content = layer.contentExtent ?? { width: layer.extent.width, height: layer.extent.height,
    pixelWidth: layer.extent.width, pixelHeight: layer.extent.height };
  // vec4 0-1: inverse rows plus texels per CSS pixel; vec4 2: extent, opacity, custom effect slot
  // (the worker's decorative shader reads that `.w` as its opacity-preset flag, 1 or -1);
  // vec4 3: ripple amplitude, ripple time (wrapped to keep f32 precision) and captured pixel size.
  // With compiled motion the uniform opacity is 1; the shader applies the animated opacity instead.
  values.set([
    ...(inverse ? [inverse.a, inverse.c, inverse.e] : rows![0]), content.pixelWidth / Math.max(1, content.width),
    ...(inverse ? [inverse.b, inverse.d, inverse.f] : rows![1]), content.pixelHeight / Math.max(1, content.height),
    layer.extent.width, layer.extent.height, motion ? 1 : layer.opacity(), customIndex,
    layer.ripple?.()?.amplitude ?? 0, (layer.ripple?.()?.seconds ?? 0) % 1000, content.pixelWidth, content.pixelHeight,
  ], offset);
  // vec4 4-9: the effect chain, left empty while effects are disabled for the layer.
  values.set(effectUniforms(layer.effectsEnabled?.() === false ? [] : layer.effects?.()), offset + 16);
  // vec4 10: clip rectangle in layer-local pixels; defaults to the whole content.
  const clip = layer.clip?.(new DOMMatrix().translate(shift, 0).multiply(layer.matrix())) ?? { x: 0, y: 0, width: content.width, height: content.height };
  values.set([clip.x, clip.y, clip.width, clip.height], offset + 40);
  // vec4 11-12: the material, applied before the effect chain.
  const material = layer.material?.();
  values.set(materialUniforms(material, materialIndex), offset + 44);
  // Relief passes read the drawn rectangle from vec4 12; hits keep using the clip alone.
  const draw = drawRectangle(clip, layer.extent, isSceneMaterial(material) && material.scene.format === "strata-scene" ? material.scene.outset : undefined);
  if (isSceneMaterial(material)) values.set([draw.x0, draw.y0, draw.x1, draw.y1], offset + 48);
  // vec4 13: the inverse's projective row, (0, 0, 1) for an affine layer.
  values.set([...(rows ? rows[2] : [0, 0, 1]), 0], offset + 52);
  return { matrix, clip, motion, draw };
}

/**
 * Uniforms for the single-pass compositor: a 4-float header (`dpr`, `tint`), then `capacity` layer
 * blocks, then (when `compiled`) one 4-float motion slot per layer. `custom` lists the registered
 * custom effects; each block stores its layer's index into it, or -1 when none applies.
 */
export function compositionUniforms(layers: CompositeLayer[], dpr: number, shift = 0, tint = 0, capacity = layers.length,
  custom: readonly (ApplicationEffect | undefined)[] = [], compiled = false) {
  const values = new Float32Array(4 + capacity * (compiled ? BLOCK + 4 : BLOCK));
  values.set([dpr, tint, 0, 0]);
  layers.forEach((layer, index) => {
    const { motion } = writeLayerBlock(values, 4 + index * BLOCK, layer, shift,
      custom.indexOf(layer.effects?.().find(value => value.kind === "custom")?.definition), compiled);
    if (compiled) values.set([motion ? motion.index + 1 : 0, motion?.phase ?? 0, 0, 0], 4 + capacity * BLOCK + index * 4);
  });
  return values;
}

/**
 * WGSL block for one layer: samples `layer${index}`, applies compiled motion and
 * effects, and hands the straight-alpha `sample` with its coverage-weighted alpha
 * to `emit`. Its uniforms start at `state[base]`; `playback` is the compiled slot.
 */
function layerBody(index: number, base: number, playback: number | undefined, custom: readonly (ApplicationEffect | undefined)[],
  decorativeAnimation: boolean, emit: (alpha: string) => string, materials: readonly (ApplicationEffect | undefined)[] = [], relief = false) {
  return `{
      // Canvas to layer-local through the inverse homography; the third row is (0, 0, 1) for an affine layer.
      var local = vec2f(dot(state[${base}].xyz, vec3f(p, 1.0)),
        dot(state[${base + 1}].xyz, vec3f(p, 1.0))) / dot(state[${base + 13}].xyz, vec3f(p, 1.0));
      var compiledOpacity = 1.0;
      ${playback !== undefined ? `let playback = state[${playback}];
      if (playback.x > 0.0) {
        let motion = compiled_sample(u32(playback.x), playback.y);
        let delta = local - motion.position;
        let angle = motion.rotation * 0.017453292519943295;
        local = vec2f(cos(angle) * delta.x + sin(angle) * delta.y,
          -sin(angle) * delta.x + cos(angle) * delta.y) / motion.scale;
        compiledOpacity = motion.opacity;
      }` : ""}
      let extent = state[${base + 2}].xy;
      let clip = state[${base + 10}];
      // Analytic edge coverage: distance (in output pixels) from the pixel centre to the
      // nearest layer/clip edge. Axis-aligned layers on the pixel grid get exactly 0 or 1,
      // so untransformed output is unchanged; rotated/scaled edges are antialiased.
      let low = max(vec2f(0.0), clip.xy);
      let high = min(extent, clip.xy + clip.zw);
      // Layer units per output pixel along each local axis (exact for affine maps).
      let footprint = max(vec2f(length(vec2f(dpdx(local.x), dpdy(local.x))), length(vec2f(dpdx(local.y), dpdy(local.y)))), vec2f(1e-6));
      let inside = min(local - low, high - local) / footprint;
      let coverage = clamp(min(inside.x, inside.y) + 0.5, 0.0, 1.0);
      // A relief material also draws its shadow outset: drawCoverage covers the grown rectangle, and the captured
      // alpha is scaled so that layer pixels keep their coverage while outset pixels hold no content.
      var drawCoverage = coverage;
      ${relief ? `if (state[${base + 11}].x == 2.0) {
        let draw = state[${base + 12}];
        let inDraw = min(local - draw.xy, draw.zw - local) / footprint;
        drawCoverage = max(coverage, clamp(min(inDraw.x, inDraw.y) + 0.5, 0.0, 1.0));
      }` : ""}
      if (drawCoverage > 0.0) {
        let wave = state[${base + 3}];
        var redAt = warp(local, extent, wave.x, wave.y);
        var greenAt = redAt;
        var blueAt = redAt;
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${base + 4}u + operation * 2u];
          let parameters = state[${base + 5}u + operation * 2u];
          if (control.x == 1.0) {
            redAt = warp(redAt, extent, parameters.x, control.y);
            greenAt = warp(greenAt, extent, parameters.x, control.y);
            blueAt = warp(blueAt, extent, parameters.x, control.y);
          }
          if (control.x == 2.0) {
            let delta = vec2f(parameters.x * cos(control.y * 3.0), parameters.x * sin(control.y * 3.0)) * edge(greenAt, extent);
            redAt += delta;
            blueAt -= delta;
          }
        }
        let grid = vec2f(state[${base}].w, state[${base + 1}].w);
        let captured = wave.zw;
        let red = filtered(layer${index}, sampler${index}, redAt * grid, captured);
        let green = filtered(layer${index}, sampler${index}, greenAt * grid, captured);
        let blue = filtered(layer${index}, sampler${index}, blueAt * grid, captured);
        var sample = vec4f(red.r, green.g, blue.b, green.a);
        ${materials.some(Boolean) ? `// The material: one brightness factor per point, from the material on a neutral input (never the
        // captured colour), within interior.max, so text and its face change together (Strata Rendering Model 2.9).
        let materialControl = state[${base + 11}];
        if (materialControl.x == 1.0) {
          var lit = vec4f(0.5, 0.5, 0.5, 1.0);
          ${materials.map((definition, materialIndex) => definition
            ? `if (materialControl.z == ${materialIndex}.0) { lit = material${materialIndex}(vec4f(0.5, 0.5, 0.5, 1.0), local, extent, 0.0, state[${base + 12}]); }`
            : "").join("\n          ")}
          let budget = min(materialControl.y, ${MATERIAL_INTERIOR_CEILING.toFixed(2)});
          let factor = clamp(2.0 * dot(lit.rgb, vec3f(0.2126, 0.7152, 0.0722)), 1.0 - budget, 1.0 + budget);
          sample = vec4f(min(sample.rgb * factor, vec3f(1.0)), sample.a);
        }` : ""}
        ${relief ? `// The built-in relief material (Strata Rendering Model), shading the scene in the relief binding.
        if (state[${base + 11}].x == 2.0) { sample = reliefShade(local, vec4f(sample.rgb, sample.a * coverage / drawCoverage)); }` : ""}
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${base + 4}u + operation * 2u];
          let parameters = state[${base + 5}u + operation * 2u];
          if (control.x == 3.0) {
            let noise = fract(sin(dot(floor(local) + vec2f(control.y * parameters.y), vec2f(12.9898, 78.233))) * 43758.5453);
            let alpha = select(select(smoothstep(parameters.x - 0.03, parameters.x + 0.03, noise), 1.0, parameters.x == 0.0), 0.0, parameters.x == 1.0);
            sample.a *= alpha;
          }
          ${custom.map((definition, customIndex) => definition
            ? `if (control.x == 4.0 && state[${base + 2}].w == ${customIndex}.0) { sample = clamp(custom${customIndex}(sample, local, extent, control.y, parameters), vec4f(0.0), vec4f(1.0)); }`
            : "").join("\n")}
        }
        ${decorativeAnimation ? `if (state[${base + 2}].w == 1.0) {
          sample.a *= 1.0 - 0.65 * (1.0 - abs(2.0 * fract(state[0].z / 2.0) - 1.0));
        }` : ""}
        ${emit(`sample.a * state[${base + 2}].z * compiledOpacity * drawCoverage`)}
      }
    }\n`;
}

/** WGSL functions for the application's custom effects (or materials), named `${prefix}${index}` to match `layerBody`. */
function customDeclarations(custom: readonly (ApplicationEffect | undefined)[], prefix = "custom") {
  return custom.map((definition, index) => definition
    ? `fn ${prefix}${index}(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f { ${definition.wgsl} }\n` : "").join("");
}

/** Shared WGSL helpers: edge falloff, the ripple `warp` and premultiplied bilinear `filtered` sampling. */
const helpers = `
      fn edge(local: vec2f, extent: vec2f) -> f32 { return smoothstep(0.0, 16.0, min(min(local.x, local.y), min(extent.x - local.x, extent.y - local.y))); }
      fn warp(local: vec2f, extent: vec2f, amplitude: f32, seconds: f32) -> vec2f {
        let delta = local - extent * 0.5;
        return local + delta / max(length(delta), 1.0) * sin(length(delta) * 0.18 - seconds * 4.0) * amplitude * edge(local, extent);
      }
      fn premultipliedTexel(layer: texture_2d<f32>, tap: sampler, texel: vec2f) -> vec4f {
        let value = textureSampleLevel(layer, tap, texel / vec2f(textureDimensions(layer)), 0.0);
        return vec4f(value.rgb * value.a, value.a);
      }
      // Bilinear filtering in premultiplied space over the straight-alpha native capture,
      // so transparent neighbours do not darken antialiased edges. Pixel-aligned samples
      // have zero fractional weight and return the exact texel.
      fn filtered(layer: texture_2d<f32>, tap: sampler, texel: vec2f, captured: vec2f) -> vec4f {
        let position = clamp(texel, vec2f(0.5), captured - vec2f(0.5)) - vec2f(0.5);
        let base = floor(position);
        let weight = position - base;
        let low = base + vec2f(0.5);
        let high = min(base + vec2f(1.5), max(captured - vec2f(0.5), vec2f(0.5)));
        let value = mix(
          mix(premultipliedTexel(layer, tap, low), premultipliedTexel(layer, tap, vec2f(high.x, low.y)), weight.x),
          mix(premultipliedTexel(layer, tap, vec2f(low.x, high.y)), premultipliedTexel(layer, tap, high), weight.x), weight.y);
        return select(vec4f(0.0), vec4f(value.rgb / value.a, value.a), value.a > 1e-5);
      }`;

/**
 * One fullscreen pass compositing `count` layers over white. Used by the
 * experimental worker compositor; the main renderer draws one pass per layer.
 */
export function compositionShader(count: number, custom: readonly (ApplicationEffect | undefined)[] = [], compiledWGSL?: string, decorativeAnimation = false): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL"> {
  // Per layer: texture and sampler at bindings 2i and 2i+1; the uniform buffer follows at 2*count.
  const bindings: NonNullable<EffectWrapperOptions["bindings"]> = [];
  let declarations = (compiledWGSL ?? "") + customDeclarations(custom);
  let body = "";
  for (let index = 0; index < count; index++) {
    bindings.push({ binding: index * 2, kind: "texture", name: `layer${index}` },
      { binding: index * 2 + 1, kind: "sampler", textureBinding: `layer${index}` });
    declarations += `@group(0) @binding(${index * 2}) var layer${index}: texture_2d<f32>;
      @group(0) @binding(${index * 2 + 1}) var sampler${index}: sampler;\n`;
    // State layout in vec4s: [0] header, then 13 per layer, then (compiled only) one motion slot per layer.
    body += layerBody(index, 1 + index * BLOCK_VEC4S, compiledWGSL ? 1 + count * BLOCK_VEC4S + index : undefined, custom, decorativeAnimation,
      alpha => `color = mix(color, sample.rgb, ${alpha});`);
  }
  // Header floats (4) plus one block per layer, plus 4 floats per layer when compiled motion is present.
  bindings.push({ binding: count * 2, kind: "uniform", uniformByteLength: (4 + count * (compiledWGSL ? BLOCK + 4 : BLOCK)) * 4 });
  return {
    bindings,
    // `state` holds the header vec4 followed by the layer blocks (and compiled slots).
    fragmentWGSL: `${declarations}${helpers}
      @group(0) @binding(${count * 2}) var<uniform> state: array<vec4f, ${1 + count * (compiledWGSL ? BLOCK_VEC4S + 1 : BLOCK_VEC4S)}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        var color = vec3f(1.0);
        ${body}
        return vec4f(mix(color, color.bgr, state[0].y), 1.0);
      }`,
  };
}

/** Per-layer pass uniforms: header, bounding box, frame size, one layer block, compiled slot. */
// Header floats: dpr, tint, 2 spare; bounding box x0,y0,x1,y1; frame width, height, 2 spare.
const LAYER_HEADER = 12;
if (LAYER_PASS_FLOATS !== LAYER_HEADER + BLOCK + 4) throw new Error("Per-layer uniform layout mismatch");
/** GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT; literal so the shader can be generated outside a browser. */
const VERTEX_AND_FRAGMENT = 3;
/** GPUShaderStage.FRAGMENT. */
const FRAGMENT = 2;
/** Straight-alpha source-over onto the premultiplied output: the GPU equivalent of mix(dst, src, alpha). */
export const layerBlend: GPUBlendState = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/**
 * Shader for drawing one layer as its own blended pass. The vertex stage emits a
 * single triangle covering the layer's canvas-space bounding box, so a layer only
 * shades the pixels it can touch; fragments outside the layer are discarded.
 */
export function layerShader(custom?: ApplicationEffect, compiledWGSL?: string, material?: ApplicationEffect | "relief"): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL" | "vertexWGSL"> {
  const definitions = custom ? [custom] : [];
  const relief = material === "relief";
  const materials = material && material !== "relief" ? [material] : [];
  return {
    bindings: [
      { binding: 0, kind: "texture", name: "layer0" },
      { binding: 1, kind: "sampler", textureBinding: "layer0" },
      { binding: 2, kind: "uniform", uniformByteLength: LAYER_PASS_FLOATS * 4, visibility: VERTEX_AND_FRAGMENT },
      ...(relief ? [{ binding: 3, kind: "uniform" as const, uniformByteLength: RELIEF_VEC4S * 16, visibility: FRAGMENT }] : []),
    ],
    vertexWGSL: `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
      @vertex fn effectFullscreenVertex(@builtin(vertex_index) vertex: u32) -> EffectVertexOutput {
        // state[1]: layer bounding box (x0, y0, x1, y1) and state[2].xy: frame size, in CSS pixels.
        let bounds = state[1];
        let size = max(state[2].xy, vec2f(1.0));
        let corner = vec2f(f32(vertex == 1u), f32(vertex == 2u)) * 2.0;
        let at = bounds.xy + corner * (bounds.zw - bounds.xy);
        var output: EffectVertexOutput;
        output.position = vec4f(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
        output.uv = corner;
        return output;
      }`,
    fragmentWGSL: `${compiledWGSL ?? ""}${customDeclarations(definitions)}${customDeclarations(materials, "material")}${relief ? reliefWGSL : ""}
      @group(0) @binding(0) var layer0: texture_2d<f32>;
      @group(0) @binding(1) var sampler0: sampler;${helpers}
      @group(0) @binding(2) var<uniform> state: array<vec4f, ${LAYER_PASS_FLOATS / 4}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        ${layerBody(0, LAYER_HEADER / 4, compiledWGSL ? (LAYER_HEADER + BLOCK) / 4 : undefined, definitions, false,
          alpha => `let rgb = mix(sample.rgb, sample.bgr, state[0].y);
        return vec4f(rgb, ${alpha});`, materials, relief)}
        discard;
        return vec4f(0.0);
      }`,
  };
}

/**
 * Uniforms for one layer pass. Also returns the pass's canvas-space bounding box
 * (padded for antialiasing, clamped to the frame) used by its vertex stage.
 */
export function layerUniforms(layer: CompositeLayer, dpr: number, frame: { width: number; height: number }, shift = 0, tint = 0,
  shaders?: PassShaders, compiled = false) {
  const values = new Float32Array(LAYER_PASS_FLOATS);
  // The per-layer pass only binds its own custom effect and material, so each slot is 0 when it matches and -1 otherwise.
  const definition = layer.effects?.().find(value => value.kind === "custom")?.definition;
  const assigned = layer.material?.();
  const material = assigned?.kind === "custom" ? assigned.definition : undefined;
  const { matrix, motion, draw } = writeLayerBlock(values, LAYER_HEADER, layer, shift, shaders?.effect && definition === shaders.effect ? 0 : -1, compiled,
    shaders?.material && material === shaders.material ? 0 : -1);
  if (compiled) values.set([motion ? motion.index + 1 : 0, motion?.phase ?? 0, 0, 0], LAYER_HEADER + BLOCK);
  // Compiled motion moves the layer inside the shader, so it may cover the whole frame.
  const corners = motion ? [] : [[draw.x0, draw.y0], [draw.x1, draw.y0], [draw.x0, draw.y1], [draw.x1, draw.y1]]
    .map(([x, y]) => { const point = matrix.transformPoint({ x: x!, y: y! }); return { x: point.x / point.w, y: point.y / point.w }; });
  // Pixels of padding so antialiased edges are not cut off by the bounding triangle.
  const pad = 2;
  const bounds = motion ? [0, 0, frame.width, frame.height] : [
    Math.max(0, Math.min(...corners.map(point => point.x)) - pad), Math.max(0, Math.min(...corners.map(point => point.y)) - pad),
    Math.min(frame.width, Math.max(...corners.map(point => point.x)) + pad), Math.min(frame.height, Math.max(...corners.map(point => point.y)) + pad),
  ];
  values.set([dpr, tint, 0, 0, ...bounds, frame.width, frame.height, 0, 0]);
  return values;
}
