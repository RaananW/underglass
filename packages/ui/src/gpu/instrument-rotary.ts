/**
 * The RotarySelector at the Instrument level (anatomy page `rotary-selector.md`): the selector is the Knob's object
 * (`knobObject` in `gpu/instrument.ts`), its pointer turned to the selected option, so the only thing it needs of its own is how the
 * cap settles on a detent: `followSpring` moves its place along the sweep (0–1) on `spring.detent`, in fixed 4 ms steps, clamped at
 * the stops, instant under reduced motion, kept between scenes in the helper's `springs` and, while it moves, asking for another scene
 * (`moving`). It is the helper's `follow` for a range input with the target given, so a select (whose position is an option's place)
 * takes the same spring.
 */
import { advanceSpring, type KnobSpring } from "./instrument.ts";

/** Where `key`'s spring stands at `now` (ms) on its way to `target` (0–1), with `constants` (stiffness and damping per unit mass). */
export function followSpring(springs: WeakMap<Element, KnobSpring> | undefined, moving: Set<Element> | undefined, key: Element, target: number, constants: { stiffness: number; damping: number }, now: number, instant: boolean): number {
  if (!springs) return target;
  let spring = springs.get(key);
  if (!spring || instant) { spring = { t: target, v: 0, time: now }; springs.set(key, spring); }
  else {
    // A spring at rest starts one frame back, so the first frame after a change already moves.
    if (spring.v === 0 && spring.t === target) spring.time = now;
    else if (spring.v === 0 && now - spring.time > 50) spring.time = now - 16;
    if (!advanceSpring(spring, target, now, constants)) moving?.add(key);
  }
  return spring.t;
}
