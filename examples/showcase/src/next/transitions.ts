/**
 * The changes between the sections of the preview home page's deck (`deck.ts`): one per boundary, each a different
 * thing the GPU can do to a live page. The driver calls `frame` with the progress of the change (0 at the leaving
 * section's rest band, 1 at the arriving one's) for each layer on stage, and writes what it returns: a transform
 * (`setTransform`) and, where the change has a `chain`, the parameters of the layer's effect chain (`handle.update`).
 * Neither repaints a layer, so scrolling through a change captures nothing.
 *
 * - **tilt** is matrices only: the layers stay interactive while they move, so a control can be clicked mid-change.
 * - The others put an effect chain on each layer (`interaction: "inert"`: the content takes no input until the chain
 *   ends, at the next rest). **burn**, **scan**, **iris** and **mosaic** hand over along a field in stage coordinates:
 *   the two sections stay in place and the field hides one exactly where it shows the other. **water** and
 *   **exposure** hand over in the middle.
 * - **scan**, **iris** and **mosaic** also move pixels, with a custom displacement before the colour function: the
 *   scan's bar is a glass rod that magnifies what it crosses, the iris opens behind a shock wave that bends the page
 *   around its rim, and the mosaic's tiles turn over, each squeezing to a line and opening again as the next section.
 *
 * A custom effect is a colour function (colour and alpha) or a displacement (which position of the layer a pixel is
 * drawn from, inside the layer's own box). Each takes up to four parameters, and is written so that the ends of the
 * change are exact: the leaving layer untouched at 0 and gone at 1, the arriving one the reverse.
 */
import { defineEffect, type EffectDescriptor, type Transform } from "@underglass/react";

/** A layer on stage during a change. Its box is its place at rest, in CSS px from the stage's top left corner. */
export interface StageLayer {
  id: string;
  /** Whether its section is the one leaving or the one arriving. */
  leaving: boolean;
  /** A section's text, or its specimen (the cover is one layer, a text). */
  figure: boolean;
  x: number; y: number; width: number; height: number;
  /** The stage's size, CSS px. */
  stageWidth: number; stageHeight: number;
}
/** What a layer is given for one frame of a change. */
export interface Pose { transform: Transform; parameters?: Record<string, number>[] }
export interface Transition {
  /** Shown in the readout while the change runs. */
  name: string;
  /** The change tilts a layer, so every layer must be inside the stage: the driver runs `slide` instead where one is not. */
  needsRoom?: boolean;
  /** The effect chain the layer carries through the change; without it the change is matrices only. */
  chain?(layer: StageLayer): EffectDescriptor[];
  frame(t: number, layer: StageLayer): Pose;
}

const inert = { bounds: "layer", interaction: "inert", media: "identity", fallback: "static" } as const;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ease = (value: number) => value * value * (3 - 2 * value);
/** Rounds for a parameter or a transform, so float noise never fails a range check. */
const round = (value: number) => Math.round(value * 1000) / 1000;
/** 0 for the leaving layer, 1 for the arriving one: the `side` parameter of the masks. */
const side = (layer: StageLayer) => layer.leaving ? 0 : 1;
const still: Transform = {};
/** One custom operation of a chain. */
const operation = (definition: ReturnType<typeof defineEffect>, parameters: Record<string, number>): EffectDescriptor =>
  ({ kind: "custom", definition, parameters, time: { seconds: 0 }, ...inert });
/** A custom effect as the only operation of a chain. */
const custom = (definition: ReturnType<typeof defineEffect>, parameters: Record<string, number>): EffectDescriptor[] => [operation(definition, parameters)];

/** Value noise over `p` (two octaves), as WGSL statements that leave the result in `n`. `local` plus the origin is the stage position. */
const noise = `
    let p = (local + parameters.zw) / 26.0;
    let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
    let h = vec2f(12.9898, 78.233);
    let a = mix(mix(fract(sin(dot(i, h)) * 43758.5453), fract(sin(dot(i + vec2f(1.0, 0.0), h)) * 43758.5453), u.x),
                mix(fract(sin(dot(i + vec2f(0.0, 1.0), h)) * 43758.5453), fract(sin(dot(i + vec2f(1.0, 1.0), h)) * 43758.5453), u.x), u.y);
    let q = p * 2.7 + vec2f(5.2, 1.3);
    let j = floor(q); let g = fract(q); let v = g * g * (3.0 - 2.0 * g);
    let b = mix(mix(fract(sin(dot(j, h)) * 43758.5453), fract(sin(dot(j + vec2f(1.0, 0.0), h)) * 43758.5453), v.x),
                mix(fract(sin(dot(j + vec2f(0.0, 1.0), h)) * 43758.5453), fract(sin(dot(j + vec2f(1.0, 1.0), h)) * 43758.5453), v.x), v.y);
    let n = a * 0.7 + b * 0.3;`;

/** Burns a layer away along a noise front with a glowing edge; `side` 1 keeps what `side` 0 has lost. */
const burn = defineEffect({
  name: "next-burn",
  parameters: { amount: { min: 0, max: 1 }, side: { min: 0, max: 1 }, originX: { min: -8192, max: 8192 }, originY: { min: -8192, max: 8192 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `${noise}
    let d = n - (parameters.x * 1.24 - 0.12);
    let unburnt = smoothstep(-0.012, 0.012, d);
    let keep = mix(unburnt, 1.0 - unburnt, parameters.y);
    let ember = (1.0 - smoothstep(0.0, 0.07, abs(d))) * (1.0 - parameters.y);
    return vec4f(mix(color.rgb, vec3f(1.0, 0.42, 0.18), ember), color.a * keep);`,
});
/** A bar of light crosses the stage: `side` 0 is kept below it, `side` 1 above it. `edge` is the bar's height on the stage. */
const scan = defineEffect({
  name: "next-scan",
  parameters: { edge: { min: -8192, max: 8192 }, side: { min: 0, max: 1 }, originY: { min: -8192, max: 8192 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let d = local.y + parameters.z - parameters.x;
    let below = smoothstep(-1.0, 1.0, d);
    let keep = mix(below, 1.0 - below, parameters.y);
    let light = exp(-abs(d) * 0.05);
    return vec4f(color.rgb + vec3f(1.0, 0.5, 0.32) * light * 0.9, color.a * keep);`,
});
/**
 * The scan's bar as a glass rod: within `ROD` px of the bar each side is drawn from nearer the bar, so the page is
 * magnified up to 2.6 times where the bar crosses it. Each side samples its own side, so the handover stays on the bar.
 */
const ROD = 40;
const rod = defineEffect({
  name: "next-rod",
  parameters: { edge: { min: -8192, max: 8192 }, originY: { min: -8192, max: 8192 } },
  geometry: "displacement", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let d = local.y + parameters.y - parameters.x;
    let r = clamp(d / ${ROD}.0, -1.0, 1.0);
    let bend = 1.0 - r * r;
    return vec2f(local.x, local.y - d * 0.62 * bend * bend);`,
});
/** An aperture opens from a point: `side` 0 is kept outside it, `side` 1 inside. The centre is in the layer's own pixels. */
const iris = defineEffect({
  name: "next-iris",
  parameters: { radius: { min: 0, max: 8192 }, side: { min: 0, max: 1 }, centreX: { min: -8192, max: 8192 }, centreY: { min: -8192, max: 8192 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let d = distance(local, parameters.zw) - parameters.x;
    let outside = smoothstep(-1.0, 1.0, d);
    let keep = mix(outside, 1.0 - outside, parameters.y);
    let ring = exp(-abs(d) * 0.07) * step(0.5, parameters.x);
    return vec4f(color.rgb + vec3f(1.0, 0.5, 0.32) * ring * 0.8, color.a * keep);`,
});
/**
 * The iris's rim as a shock wave: within `WAVE` px of the rim each side is drawn from nearer the rim, by `strength`
 * (0 is no wave). Each side samples its own side, so the handover stays on the rim.
 */
const WAVE = 56;
const wave = defineEffect({
  name: "next-wave",
  parameters: { radius: { min: 0, max: 8192 }, strength: { min: 0, max: 1 }, centreX: { min: -8192, max: 8192 }, centreY: { min: -8192, max: 8192 } },
  geometry: "displacement", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let v = local - parameters.zw;
    let rho = max(length(v), 0.001);
    let d = rho - parameters.x;
    let r = clamp(d / ${WAVE}.0, -1.0, 1.0);
    let bend = 1.0 - r * r;
    return local - v / rho * d * parameters.y * bend * bend;`,
});
/**
 * The tiles of the mosaic, `TILE` px squares of the stage, turn over one after the other along a diagonal: as WGSL
 * statements that leave a tile's column and row in `cell` and how far it has turned (0..1) in `turn`.
 */
const TILE = 72;
const turning = `
    let cell = floor((local + parameters.zw) / ${TILE}.0);
    let order = fract(sin(dot(cell, vec2f(12.9898, 78.233))) * 43758.5453) * 0.35 + fract((cell.x + cell.y) * 0.047) * 0.65;
    let turn = clamp((parameters.x * 1.6 - order) / 0.6, 0.0, 1.0);
    let facing = abs(cos(turn * 3.14159265));`;
/**
 * A tile turns about its vertical middle: it is squeezed to a line, then opens again. `side` 0 is on its front (the
 * first half of the turn) and `side` 1 on its back; the other half of the time a side draws nothing.
 */
const flip = defineEffect({
  name: "next-flip",
  parameters: { amount: { min: 0, max: 1 }, side: { min: 0, max: 1 }, originX: { min: -8192, max: 8192 }, originY: { min: -8192, max: 8192 } },
  geometry: "displacement", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `${turning}
    let middle = (cell.x + 0.5) * ${TILE}.0 - parameters.z;
    let x = middle + (local.x - middle) / max(facing, 0.001);
    if ((turn < 0.5) != (parameters.y < 0.5) || abs(x - middle) > ${TILE / 2}.0) { return vec2f(-65536.0); }
    return vec2f(x, local.y);`,
});
/**
 * The light on a turning tile: it darkens as it turns away, with a glint as it passes edge on. While a tile turns,
 * the side that shows also draws its face under the content, a faint card, so that a tile of bare text reads as a tile.
 */
const mosaic = defineEffect({
  name: "next-mosaic",
  parameters: { amount: { min: 0, max: 1 }, side: { min: 0, max: 1 }, originX: { min: -8192, max: 8192 }, originY: { min: -8192, max: 8192 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `${turning}
    let moving = step(0.001, turn) * step(turn, 0.999);
    let middle = (cell.x + 0.5) * ${TILE}.0 - parameters.z;
    let shows = f32((turn < 0.5) == (parameters.y < 0.5)) * step(abs(local.x - middle), ${TILE / 2}.0 * facing);
    let face = 0.34 * sin(turn * 3.14159265) * moving * shows;
    let alpha = color.a + face * (1.0 - color.a);
    let lit = color.rgb * (0.4 + 0.6 * facing) * color.a + vec3f(0.2, 0.21, 0.25) * (0.3 + 0.7 * facing) * face * (1.0 - color.a);
    let glint = pow(1.0 - facing, 4.0) * moving * 0.6;
    return vec4f(lit / max(alpha, 0.0001) + vec3f(1.0, 0.5, 0.32) * glint, alpha);`,
});
/**
 * The layer is overexposed until nothing is left of it: `amount` 0 is the layer, 1 is gone. The light multiplies what
 * is there, so the type burns out first and a dark panel only lifts.
 */
const exposure = defineEffect({
  name: "next-exposure",
  parameters: { amount: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let e = parameters.x;
    let gain = smoothstep(0.0, 0.8, e);
    let lit = min(color.rgb * (1.0 + 9.0 * gain) + vec3f(0.5, 0.24, 0.14) * gain * gain, vec3f(1.0));
    return vec4f(lit, color.a * (1.0 - smoothstep(0.45, 1.0, e)));`,
});

/** The parameters of a mask whose field is in stage coordinates. */
const field = (amount: number, layer: StageLayer) => ({ amount: round(clamp(amount)), side: side(layer), originX: round(layer.x), originY: round(layer.y) });

/**
 * The changes, by the section that leaves: `transitions[0]` is the change from the cover to the second section.
 */
export const transitions: readonly Transition[] = [
  { name: "burn",
    chain: layer => custom(burn, field(0, layer)),
    frame: (t, layer) => ({ transform: still, parameters: [field(ease(t), layer)] }) },

  // The texts change places in turn, so they never read through each other. The specimens overlap: the one leaving
  // tilts back into the stage (a tilted layer is not clipped by the stage, so it rises no further than the room above
  // it) while the next comes up over it, flat, from below.
  { name: "tilt", needsRoom: true,
    frame(t, layer) {
      if (!layer.figure) {
        const out = clamp(t / 0.5), into = clamp((t - 0.5) / 0.5);
        return { transform: layer.leaving ? { y: round(-48 * ease(out)), opacity: round(1 - out) } : { y: round(56 * (1 - ease(into))), opacity: round(into) } };
      }
      if (layer.leaving) {
        const back = ease(clamp(t / 0.75)), rise = Math.max(0, Math.min(56, layer.y - 8));
        return { transform: { y: round(-rise * back), tiltX: round(50 * back), scaleX: round(1 - 0.18 * back), scaleY: round(1 - 0.18 * back),
          opacity: round(1 - clamp((t - 0.35) / 0.4)), perspective: 1000 } };
      }
      const up = ease(clamp((t - 0.2) / 0.8));
      return { transform: { y: round(180 * (1 - up)), scaleX: round(0.94 + 0.06 * up), scaleY: round(0.94 + 0.06 * up), opacity: round(clamp((t - 0.2) / 0.3)) } };
    } },

  // The leaving section goes under water: it ripples and its colours part as it fades, and the next one settles out
  // of the same water. The ripple runs on its own clock, so the water keeps moving when the scroll stops.
  { name: "water",
    chain: () => [
      { kind: "ripple", parameters: { amplitude: 0 }, time: { seconds: 0, playing: true }, ...inert },
      { kind: "chromatic", parameters: { displacement: 0 }, time: { seconds: 0, playing: false }, ...inert },
    ],
    frame(t, layer): Pose {
      const depth = layer.leaving ? ease(clamp(t / 0.62)) : 1 - ease(clamp((t - 0.38) / 0.62));
      return { transform: { opacity: round(1 - depth), scaleX: round(1 + 0.03 * depth), scaleY: round(1 + 0.03 * depth) },
        parameters: [{ amplitude: round(12 * depth) }, { displacement: round(10 * depth) }] };
    } },

  // The bar starts and ends its own reach outside the stage, so that neither end of the change bends anything.
  { name: "scan",
    chain: layer => [operation(rod, { edge: -ROD, originY: round(layer.y) }), operation(scan, { edge: -ROD, side: side(layer), originY: round(layer.y) })],
    frame(t, layer): Pose {
      const edge = round(-ROD + (layer.stageHeight + 2 * ROD) * t), originY = round(layer.y);
      return { transform: still, parameters: [{ edge, originY }, { edge, side: side(layer), originY }] };
    } },

  // The wave rises as the iris opens and has died away when its rim has left the stage.
  { name: "iris",
    chain: layer => { const centreX = round(layer.stageWidth / 2 - layer.x), centreY = round(layer.stageHeight / 2 - layer.y);
      return [operation(wave, { radius: 0, strength: 0, centreX, centreY }), operation(iris, { radius: 0, side: side(layer), centreX, centreY })]; },
    frame(t, layer): Pose {
      const radius = round(ease(t) * (Math.hypot(layer.stageWidth, layer.stageHeight) / 2 + 24));
      const centreX = round(layer.stageWidth / 2 - layer.x), centreY = round(layer.stageHeight / 2 - layer.y);
      return { transform: still, parameters: [{ radius, strength: round(0.72 * clamp(t * 6) * clamp((1 - t) * 5)), centreX, centreY }, { radius, side: side(layer), centreX, centreY }] };
    } },

  { name: "mosaic",
    chain: layer => [operation(flip, field(0, layer)), operation(mosaic, field(0, layer))],
    frame: (t, layer) => ({ transform: still, parameters: [field(t, layer), field(t, layer)] }) },

  // Light floods the leaving section until it is gone, at the middle, and the next one comes out of the same light.
  { name: "exposure",
    chain: layer => custom(exposure, { amount: layer.leaving ? 0 : 1 }),
    frame: (t, layer) => ({ transform: still, parameters: [{ amount: round(layer.leaving ? clamp(t / 0.5) : 1 - clamp((t - 0.5) / 0.5)) }] }) },
];

/**
 * The tilt's stand-in where a section is taller than the stage, or has panned: matrices only and flat, so the stage
 * may cut the layers off. The texts change places in turn and the specimens cross, one sinking as the next comes up.
 */
export const slide: Transition = {
  name: "slide",
  frame(t, layer) {
    if (!layer.figure) {
      const out = clamp(t / 0.5), into = clamp((t - 0.5) / 0.5);
      return { transform: layer.leaving ? { y: round(-48 * ease(out)), opacity: round(1 - out) } : { y: round(56 * (1 - ease(into))), opacity: round(into) } };
    }
    if (layer.leaving) {
      const away = ease(clamp(t / 0.7));
      return { transform: { y: round(-64 * away), scaleX: round(1 - 0.06 * away), scaleY: round(1 - 0.06 * away), opacity: round(1 - clamp((t - 0.25) / 0.4)) } };
    }
    const up = ease(clamp((t - 0.2) / 0.8));
    return { transform: { y: round(140 * (1 - up)), scaleX: round(0.94 + 0.06 * up), scaleY: round(0.94 + 0.06 * up), opacity: round(clamp((t - 0.2) / 0.3)) } };
  },
};

/** With reduced motion every change is this one: the sections fade, one after the other, and nothing moves. */
export const fade: Transition = {
  name: "fade",
  frame: (t, layer) => ({ transform: { opacity: round(layer.leaving ? 1 - clamp(t / 0.5) : clamp((t - 0.5) / 0.5)) } }),
};
