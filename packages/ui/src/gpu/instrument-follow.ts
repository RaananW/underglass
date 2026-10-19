/**
 * Springs for the Instrument parts whose position is not a fraction of a range (design language section 12): the JogWheel's
 * accumulated angle, which runs past 360° and has no stops, and a PatchPoint's seating, which follows a state. A knob's spring
 * (`advanceSpring` in `gpu/instrument.ts`) is clamped to 0–1; these are not, or are clamped to the stops they have. Both run in
 * fixed 4 ms steps (at most 100 ms at a time), so the same frames give the same positions, and both are kept between scenes in the
 * helper's `springs`, keyed by the element they belong to.
 */
import type { KnobSpring } from "./instrument.ts";

/** What a scene needs to advance a spring: the time (ms), whether motion is off, and where a spring that is still moving is noted. */
export interface FollowContext {
  now: number;
  instant: boolean;
  springs?: WeakMap<Element, KnobSpring>;
  moving?: Set<Element>;
}

/**
 * Advances a free spring (position `t`, velocity `v`) to `now` towards `target` and returns whether it is at rest: within
 * `tolerance` of the target and slower than `tolerance · 10` a second. Unclamped.
 */
export function advanceFree(spring: KnobSpring, target: number, now: number, { stiffness, damping }: { stiffness: number; damping: number }, tolerance = 1e-4): boolean {
  const dt = 0.004;
  let steps = Math.min(25, Math.max(0, Math.round((now - spring.time) / 4)));
  spring.time = now;
  while (steps-- > 0) {
    spring.v += (-stiffness * (spring.t - target) - damping * spring.v) * dt;
    spring.t += spring.v * dt;
  }
  if (Math.abs(spring.t - target) < tolerance && Math.abs(spring.v) < tolerance * 10) { spring.t = target; spring.v = 0; return true; }
  return false;
}

/**
 * Where `element`'s spring has `target` now. Without `springs` (a scene built on its own) the target itself; under reduced motion
 * the target at once. A spring that has not come to rest asks for another scene (`moving`). `limits` clamps the position (a
 * seating has stops, an angle none). The first scene a spring is seen in starts it at rest on the target.
 */
export function followSpring(element: Element, target: number, constants: { stiffness: number; damping: number }, context: FollowContext,
  { tolerance = 1e-4, limits }: { tolerance?: number; limits?: [number, number] } = {}): number {
  if (!context.springs) return target;
  let spring = context.springs.get(element);
  if (!spring || context.instant) { spring = { t: target, v: 0, time: context.now }; context.springs.set(element, spring); return target; }
  // A spring at rest starts one frame back, so the first frame after a change already moves.
  if (spring.v === 0 && spring.t === target) spring.time = context.now;
  else if (spring.v === 0 && context.now - spring.time > 50) spring.time = context.now - 16;
  const rests = advanceFree(spring, target, context.now, constants, tolerance);
  if (limits) {
    if (spring.t < limits[0]) { spring.t = limits[0]; spring.v = Math.max(0, spring.v); }
    if (spring.t > limits[1]) { spring.t = limits[1]; spring.v = Math.min(0, spring.v); }
  }
  if (!rests) context.moving?.add(element);
  return spring.t;
}
