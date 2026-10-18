/**
 * The Switch's hardware forms (anatomy page `switch.md`, *Forms*; design language section 6, the Instrument object
 * table, and section 12, *Springs, detents and snaps*): their names, the decorative markup every binding renders for
 * them, the box each one's native input takes, and the clamped spring their throw follows, sampled into the CSS
 * `linear()` easing the recipe uses. Shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU
 * helper and the tests, so all of them agree.
 */

/** The hardware forms of a Switch: a flush slide switch, a rocker, a bat-handle toggle and a wall switch. */
export const switchForms = ["slide", "rocker", "bat", "wall"] as const;
export type StrataSwitchForm = (typeof switchForms)[number];

/** Whether `value` names one of the hardware forms (any other `form` value is the native form owner's id). */
export const isSwitchForm = (value: unknown): value is StrataSwitchForm => (switchForms as readonly unknown[]).includes(value);

/** One decorative element of a form's object: its class, its Relief marker and its children. */
export interface SwitchPart {
  className: string;
  face?: "raised" | "groove" | "knob" | "flat";
  children?: SwitchPart[];
}

/**
 * Each form's object, inside `<span class="ug-switch__object" aria-hidden="true">`, in paint order. Every part is
 * decoration: `pointer-events: none`, so every press lands on the native input, whose box covers the whole travel.
 * - `slide`: the slot printed in the faceplate, the lit flag in its left half (shown when on), and the block;
 * - `rocker`: the bezel, and the paddle with its two facets and the lit flag on the On (top) end;
 * - `bat`: the nut and bushing, the lever's shaft and its ball;
 * - `wall`: the wall plate, and the paddle with its two halves and the lit dot near the On (top) end.
 */
export const switchFormMarkup: Record<StrataSwitchForm, SwitchPart[]> = {
  slide: [
    { className: "ug-switch__slot", face: "groove" },
    { className: "ug-switch__flag", face: "flat" },
    { className: "ug-switch__block", face: "raised", children: [{ className: "ug-switch__grip" }] },
  ],
  rocker: [
    { className: "ug-switch__bezel", face: "raised" },
    { className: "ug-switch__paddle", children: [
      { className: "ug-switch__facet ug-switch__facet--on", face: "raised" },
      { className: "ug-switch__facet ug-switch__facet--off", face: "raised" },
      { className: "ug-switch__flag", face: "flat" },
    ] },
  ],
  bat: [
    { className: "ug-switch__nut", face: "raised" },
    { className: "ug-switch__bushing", face: "raised" },
    { className: "ug-switch__lever", face: "raised" },
    { className: "ug-switch__ball", face: "knob" },
  ],
  wall: [
    { className: "ug-switch__plate", face: "raised" },
    { className: "ug-switch__paddle", children: [
      { className: "ug-switch__facet ug-switch__facet--on", face: "raised" },
      { className: "ug-switch__facet ug-switch__facet--off", face: "raised" },
      { className: "ug-switch__flag", face: "flat" },
    ] },
  ],
};

/**
 * The native input's box per form, CSS px (the I0.2 box rule, checked by core's containment check over the whole
 * travel at the reference stage's corners at every depth; `instrument-switch.ts`). Every box is at least
 * `target.min` (24) on each side, and it is the hit area at every pose.
 */
export const switchBoxes: Record<StrataSwitchForm, readonly [number, number]> = {
  slide: [64, 28],
  rocker: [54, 70],
  bat: [48, 92],
  wall: [66, 92],
};

/** A spring per unit mass (design language section 12). */
export interface SwitchSpring { stiffness: number; damping: number }
/** `spring.slide`, `spring.rocker`, `spring.bat` and `spring.wall` (section 12). */
export const switchSprings: Record<StrataSwitchForm, SwitchSpring> = {
  slide: { stiffness: 600, damping: 49 },
  rocker: { stiffness: 1200, damping: 58 },
  bat: { stiffness: 1400, damping: 45 },
  wall: { stiffness: 1200, damping: 58 },
};

/** The spring's fixed step, s. */
export const SPRING_STEP = 0.004;

/**
 * One fixed 4 ms step of a spring towards `target` (section 12): `v += (−stiffness · (t − target) − damping · v) · dt`,
 * `t += v · dt`, with `t` clamped to the stops 0–1 and the velocity into a stop dropped there, so an underdamped spring
 * overshoots only between the stops, never past one. Returns whether it rests (`|t − target| < 10⁻⁴`, `|v| < 10⁻³`),
 * and then sets it exactly on the target.
 */
export function stepSpring(state: { t: number; v: number }, target: number, spring: SwitchSpring): boolean {
  state.v += (-spring.stiffness * (state.t - target) - spring.damping * state.v) * SPRING_STEP;
  state.t += state.v * SPRING_STEP;
  if (state.t <= 0 || state.t >= 1) { state.t = Math.min(1, Math.max(0, state.t)); state.v = 0; }
  if (Math.abs(state.t - target) < 1e-4 && Math.abs(state.v) < 1e-3) { state.t = target; state.v = 0; return true; }
  return false;
}

/** A throw from one stop to the other: `t` after every 4 ms step, until the spring rests (at most 2 s). */
export function switchThrow(spring: SwitchSpring): number[] {
  const state = { t: 0, v: 0 }, samples = [0];
  for (let step = 0; step < 500; step++) {
    const rests = stepSpring(state, 1, spring);
    samples.push(state.t);
    if (rests) break;
  }
  return samples;
}

const fixed = (value: number, digits: number) => String(Number(value.toFixed(digits)));

/**
 * The throw as a CSS transition: its duration (ms) and a `linear()` easing through the spring's samples, at most 24 of
 * them, evenly in time. The recipe animates `--strata-switch-t` with it, so the CSS presentation and the Relief and
 * Objects presentations (which follow the CSS transition frame by frame) move on the same spring.
 */
export function switchSpringCurve(spring: SwitchSpring): { duration: number; easing: string } {
  const samples = switchThrow(spring), steps = samples.length - 1, stride = Math.max(1, Math.ceil(steps / 23));
  const stops: string[] = [];
  for (let index = 0; index <= steps; index += stride) stops.push(index === 0 ? "0" : `${fixed(samples[index]!, 4)} ${fixed((index / steps) * 100, 2)}%`);
  if (steps % stride) stops.push("1");
  else stops[stops.length - 1] = "1";
  return { duration: Math.round(steps * SPRING_STEP * 1000), easing: `linear(${stops.join(", ")})` };
}

/**
 * How far a face `height` px high may stand from its box's edges for its cast shadow to stay inside (Rendering Model
 * 2.8: the shadow is moved away from the light by `−L.xy / L.z · h` and softens out to `1.5 · h + 1` past the shape),
 * per side: the reach past the caster to the left, right, top and bottom, px, with the light at `azimuth` and
 * `elevation` degrees.
 */
export function shadowReach(height: number, light: { azimuth: number; elevation: number }) {
  const a = (light.azimuth * Math.PI) / 180, e = (light.elevation * Math.PI) / 180;
  const lx = Math.sin(a) * Math.cos(e), ly = -Math.cos(a) * Math.cos(e), lz = Math.sin(e);
  const ox = (-lx / lz) * height, oy = (-ly / lz) * height, soft = 1.5 * height + 1;
  return { left: Math.max(0, soft - ox), right: Math.max(0, soft + ox), top: Math.max(0, soft - oy), bottom: Math.max(0, soft + oy) };
}

/**
 * The tallest a face may stand at the Relief and Objects levels with its shadow inside its box: `margins` is how far
 * the face lies inside the box on each side, `wanted` the height it would like. Under the default light (323° / 41°)
 * the shadow reaches `2.42 · h + 1` down and `2.19 · h + 1` to the right.
 */
export function fittedHeight(wanted: number, margins: { left: number; right: number; top: number; bottom: number }, light: { azimuth: number; elevation: number }): number {
  let low = 0, high = wanted;
  const fits = (height: number) => { const reach = shadowReach(height, light); return reach.left <= margins.left && reach.right <= margins.right && reach.top <= margins.top && reach.bottom <= margins.bottom; };
  if (fits(wanted)) return wanted;
  if (!fits(0)) return 0;
  for (let step = 0; step < 24; step++) { const mid = (low + high) / 2; if (fits(mid)) low = mid; else high = mid; }
  return Math.round(low * 100) / 100;
}
