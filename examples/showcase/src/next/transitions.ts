/**
 * The changes between the sections of the preview home page's deck (`deck.ts`): one per boundary, each a different
 * thing the GPU can do to a live page. The driver calls `frame` with the progress of the change (0 at the leaving
 * section's rest band, 1 at the arriving one's) for each layer on stage, and writes what it returns: a transform
 * (`setTransform`) and, where the change has a `chain`, the parameters of the layer's effect chain (`handle.update`).
 * Neither repaints a layer, so scrolling through a change captures nothing.
 *
 * - **tilt** is matrices only: the layers stay interactive while they move, so a control can be clicked mid-change.
 * - The others put an effect chain on each layer (`interaction: "inert"`: the content takes no input until the chain
 *   ends, at the next rest). **burn**, **scan**, **iris** and **mosaic** are masks: the two sections stay in place and
 *   the same field, in stage coordinates, hides one exactly where it shows the other. **water** and **exposure** hand
 *   over in the middle.
 *
 * A custom effect changes colour and alpha only, takes up to four parameters, and is written so that the ends of the
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
/** A custom effect as the only operation of a chain. */
const custom = (definition: ReturnType<typeof defineEffect>, parameters: Record<string, number>): EffectDescriptor[] =>
  [{ kind: "custom", definition, parameters, time: { seconds: 0 }, ...inert }];

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
/** Tiles of the stage change hands one by one, each lit just before it goes. */
const mosaic = defineEffect({
  name: "next-mosaic",
  parameters: { amount: { min: 0, max: 1 }, side: { min: 0, max: 1 }, originX: { min: -8192, max: 8192 }, originY: { min: -8192, max: 8192 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let cell = floor((local + parameters.zw) / 36.0);
    let order = fract(sin(dot(cell, vec2f(12.9898, 78.233))) * 43758.5453) * 0.55 + fract((cell.x + cell.y) * 0.031) * 0.45;
    let d = order - (parameters.x * 1.2 - 0.1);
    let waiting = step(0.0, d);
    let keep = mix(waiting, 1.0 - waiting, parameters.y);
    let next = (1.0 - smoothstep(0.0, 0.06, d)) * waiting * (1.0 - parameters.y);
    return vec4f(color.rgb + vec3f(1.0, 0.5, 0.32) * next * 0.5, color.a * keep);`,
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

  { name: "scan",
    chain: layer => custom(scan, { edge: -40, side: side(layer), originY: round(layer.y) }),
    frame: (t, layer) => ({ transform: still, parameters: [{ edge: round(-40 + (layer.stageHeight + 80) * t), side: side(layer), originY: round(layer.y) }] }) },

  { name: "iris",
    chain: layer => custom(iris, { radius: 0, side: side(layer), centreX: round(layer.stageWidth / 2 - layer.x), centreY: round(layer.stageHeight / 2 - layer.y) }),
    frame: (t, layer) => ({ transform: still, parameters: [{ radius: round(ease(t) * (Math.hypot(layer.stageWidth, layer.stageHeight) / 2 + 24)), side: side(layer),
      centreX: round(layer.stageWidth / 2 - layer.x), centreY: round(layer.stageHeight / 2 - layer.y) }] }) },

  { name: "mosaic",
    chain: layer => custom(mosaic, field(0, layer)),
    frame: (t, layer) => ({ transform: still, parameters: [field(t, layer)] }) },

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
