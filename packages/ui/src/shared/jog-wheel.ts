/**
 * JogWheel (anatomy page `jog-wheel.md`): the step, angle and inertia maths and the markup data shared by the bindings,
 * the plain-DOM behaviour and the GPU helper. A jog wheel is a native `<input type="range">` over a large flat wheel with
 * a finger dimple. It is an endless encoder: the value steps by the input's `step`, and with `wrap` it passes from `max`
 * to `min` and back, while the dimple's position is an **accumulated angle** that is not the value and never snaps back
 * when the value wraps. Angles are in degrees, clockwise, 0 at the top; one turn of the wheel is `turn` steps, so a step
 * is `360 / turn` degrees. The angle's origin is `min`: at angle 0 the wheel stands on the first value, and at `n` steps
 * from there on value index `n mod count` (or `n`, clamped, without `wrap`).
 */
import { knobNumber, knobValueText } from "./knob.ts";

/** The jog wheel's interaction tokens (`jog.*`, design language section 14); the defaults are the premium character's. */
export interface JogTokens {
  /** Steps in one turn of the wheel: a step is 360 over this many degrees. */
  turn: number;
  /** Vertical drag for one turn, CSS px (the alternative to a circular drag). */
  dragPx: number;
  /** The drag rate while Shift is held. */
  fine: number;
  /** A press that moves less than this, in CSS px, is a tap. */
  tapSlop: number;
  /** The release speed, degrees a second, under which a released wheel stops where it was let go. */
  flick: number;
  /** The most steps a second a coasting wheel applies, each one native step and one `input` event. */
  maxRate: number;
}
export const jogDefaults: JogTokens = { turn: 24, dragPx: 240, fine: 0.1, tapSlop: 4, flick: 180, maxRate: 240 };

/** `spring.jog` (design language section 12): the stiffness of the soft pull to the nearest detent and the friction, per unit mass. */
export const jogSpring = { stiffness: 40, damping: 3.2 };

/** A range's bounds and step: `step` defaults to 1, as the native input's does. */
export interface JogRange {
  min: number;
  max: number;
  step?: number;
}

/** A number without floating-point noise: `0.30000000000000004` → `0.3`. */
const tidy = (value: number) => Number(value.toFixed(6));

/** The number of values the range holds: `min`, `min + step`, up to the last one not over `max`. */
export function jogCount({ min, max, step = 1 }: JogRange): number {
  const size = step > 0 ? step : 1;
  return max > min ? Math.floor((max - min) / size + 1e-9) + 1 : 1;
}

/** The index of `value` in the range (0 for `min`), the nearest step, held to the range. */
export function jogIndex(value: number, range: JogRange): number {
  const size = (range.step ?? 1) > 0 ? range.step ?? 1 : 1;
  return Math.min(jogCount(range) - 1, Math.max(0, Math.round((value - range.min) / size)));
}

/** The value at index `index` (held to the range). */
export function jogValueAt(index: number, range: JogRange): number {
  const size = (range.step ?? 1) > 0 ? range.step ?? 1 : 1;
  return tidy(range.min + Math.min(jogCount(range) - 1, Math.max(0, index)) * size);
}

/** `index` taken into 0 … count − 1, going round. */
export const jogWrap = (index: number, count: number) => ((Math.round(index) % count) + count) % count;

/** An angle per step: 360 over the steps in a turn. */
export const jogStepAngle = (turn: number) => 360 / Math.max(1, turn);

/** The whole steps the wheel is at for an angle: `Math.round(angle / stepAngle)`. */
export const jogSteps = (angle: number, stepAngle: number) => Math.round(angle / stepAngle);

/**
 * The index a number of steps stands on: with `wrap` it goes round (steps past the last value come back to the first),
 * without it it stops at the ends.
 */
export const jogIndexOfSteps = (steps: number, count: number, wrap: boolean) => (wrap ? jogWrap(steps, count) : Math.min(count - 1, Math.max(0, steps)));

/**
 * The steps from index `from` to index `to`: with `wrap` the shorter way round (more than half the values is the other
 * way), otherwise the difference. A jump of exactly half the values keeps its sign.
 */
export function jogDelta(from: number, to: number, count: number, wrap: boolean): number {
  const difference = to - from;
  if (!wrap || Math.abs(difference) * 2 <= count) return difference;
  return difference - Math.sign(difference) * count;
}

/**
 * The angle after the value moved to `value`, from an angle that stood on the value before. The steps the angle was on say
 * which value the wheel showed; the shorter way to the new one is added. The angle always grows past a wrap: `max` to `min`
 * is one more step, never a turn back.
 */
export function jogAdvance(angle: number, value: number, range: JogRange, turn: number, wrap: boolean): number {
  const count = jogCount(range), stepAngle = jogStepAngle(turn);
  const steps = jogSteps(angle, stepAngle), before = jogIndexOfSteps(steps, count, wrap);
  return tidy2((steps + jogDelta(before, jogIndex(value, range), count, wrap)) * stepAngle);
}
/** An angle to two places. */
const tidy2 = (value: number) => Math.round(value * 100) / 100;

/** The angle a wheel starts at for `value`, before it has turned: the value's index in steps. */
export const jogInitialAngle = (value: number, range: JogRange, turn: number) => tidy2(jogIndex(value, range) * jogStepAngle(turn));

/** The shorter way from angle `from` to angle `to`, degrees, in (−180, 180]. */
export function angleDelta(from: number, to: number): number {
  const difference = ((((to - from + 180) % 360) + 360) % 360) - 180;
  return difference === -180 ? 180 : difference;
}

/** The angle of a point `(dx, dy)` from the wheel's centre, degrees clockwise from the top. */
export const pointerAngle = (dx: number, dy: number) => (Math.atan2(dx, -dy) * 180) / Math.PI;

/** The angle after a vertical move of `dy` CSS px (up is negative, and turns clockwise): a turn per `dragPx`, times `fine` with Shift. */
export const verticalAngle = (angle: number, dy: number, { dragPx = jogDefaults.dragPx, fine = jogDefaults.fine, shift = false } = {}) =>
  angle - (dy / dragPx) * 360 * (shift ? fine : 1);

/** One step of a flick's coasting wheel: its angle `a` and velocity `v` (degrees, degrees a second). */
export interface JogMotion { a: number; v: number }

/**
 * Advances a coasting wheel by `dt` seconds on `spring.jog`, in fixed 4 ms steps (at most 100 ms at a time): friction
 * (`damping`) slows it and, when `detented`, a soft pull (`stiffness`) draws it to the nearest detent, so it settles on one.
 * Returns whether it has come to rest (slower than `rest` degrees a second and, if detented, within 0.2° of a detent);
 * a detented wheel then sits exactly on its detent.
 */
export function coast(motion: JogMotion, dt: number, stepAngle: number, detented: boolean, { stiffness, damping } = jogSpring, rest = 6): boolean {
  const h = 0.004;
  let steps = Math.min(25, Math.max(0, Math.round(dt / h)));
  while (steps-- > 0) {
    const pull = detented ? stiffness * (motion.a - Math.round(motion.a / stepAngle) * stepAngle) : 0;
    motion.v += (-pull - damping * motion.v) * h;
    motion.a += motion.v * h;
  }
  const detent = Math.round(motion.a / stepAngle) * stepAngle;
  if (Math.abs(motion.v) < rest && (!detented || Math.abs(motion.a - detent) < 0.2)) {
    if (detented) motion.a = detent;
    motion.v = 0;
    return true;
  }
  return false;
}

/** The speed, degrees a second, of a wheel released at `v` held to the most steps a second it may apply. */
export const jogLimit = (v: number, stepAngle: number, maxRate: number) => Math.sign(v) * Math.min(Math.abs(v), stepAngle * maxRate);

/** The root's `style` attribute: the wheel's angle and its steps in a turn. */
export const jogStyle = (angle: number, turn: number) => `--strata-jog-angle: ${tidy2(angle)}; --strata-jog-turn: ${tidy(turn)};`;

/** Everything a binding needs to render a jog wheel's markup, from its props. */
export interface JogWheelModel {
  min: number;
  max: number;
  step: number;
  wrap: boolean;
  detented: boolean;
  /** Vertical drag instead of a circular one. */
  vertical: boolean;
  /** The root's `style` attribute. */
  style: string;
  /** The input's `aria-valuetext`, when a unit or a format gives one. */
  valueText?: string;
}

export interface JogWheelModelInput {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Steps in one turn; the `jog.turn` token (24) by default. */
  turn?: number;
  /** Soft detents: the dimple settles on each step, which ticks. */
  detents?: boolean;
  /** The value goes round at the ends (default true). */
  wrap?: boolean;
  drag?: "circular" | "vertical";
  unit?: string;
  format?: (value: number) => string;
}

/** The markup data for a jog wheel (anatomy page `jog-wheel.md`): 0–99 in steps of 1, wrapping, unless given. */
export function jogWheelModel({ value, min = 0, max = 99, step = 1, turn = jogDefaults.turn, detents = false, wrap = true, drag = "circular", unit, format }: JogWheelModelInput): JogWheelModel {
  const range = { min, max, step };
  return {
    min, max, step, wrap, detented: detents, vertical: drag === "vertical",
    style: jogStyle(jogInitialAngle(value, range, turn), turn),
    ...(format ? { valueText: format(value) } : unit !== undefined ? { valueText: knobValueText(value, unit) } : {}),
  };
}

export { knobNumber as jogNumber, knobValueText as jogValueText };
