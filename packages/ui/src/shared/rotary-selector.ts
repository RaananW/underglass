/**
 * RotarySelector (anatomy page `rotary-selector.md`): the position and angle maths and the markup data shared by the
 * bindings and the plain-DOM behaviour. A rotary selector is a native `<select>` over a printed dial: one hard detent per
 * `<option>`, spread evenly over the sweep, its label printed round the knob. Angles are in degrees, 0 at the top and
 * clockwise, the bottom gap goes to the nearer end (the Knob's rule, `shared/knob.ts`), and the cap turns to the selected
 * position on `spring.detent` (design language section 12).
 */
import { knobDefaults, knobDrag, type KnobTokens } from "./knob.ts";

/** One option of the selector, and so one printed position and one detent. */
export interface RotaryOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** The selector's interaction tokens are the Knob's (`knob.*`): the sweep, the drag, the fine rate, the tap slop and the snap. */
export type RotaryTokens = KnobTokens;
export const rotaryDefaults: RotaryTokens = knobDefaults;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const tidy = (value: number) => Number(value.toFixed(6));

/** Where option `index` of `count` sits along the sweep, 0–1: evenly from the first to the last; a lone option sits at the middle. */
export function rotaryFraction(index: number, count: number): number {
  return count > 1 ? tidy(clamp(index / (count - 1), 0, 1)) : 0.5;
}

/** The cap's angle at option `index` of `count`, degrees from the top, clockwise. */
export function rotaryAngle(index: number, count: number, sweep = rotaryDefaults.sweep): number {
  return tidy((rotaryFraction(index, count) - 0.5) * sweep);
}

/** The nearest option to `raw` (a position along 0 to `count − 1`) that is not disabled; ties go to the lower one. -1 when none is enabled. */
export function rotaryNearest(raw: number, options: readonly RotaryOption[]): number {
  let best = -1, distance = Infinity;
  options.forEach((option, index) => {
    const off = Math.abs(index - raw);
    if (!option.disabled && off < distance - 1e-9) { best = index; distance = off; }
  });
  return best;
}

/** The next enabled option after `from`, `direction` +1 or −1 (clockwise is +1), or `from` at the end of the sweep. */
export function rotaryStep(from: number, direction: 1 | -1, options: readonly RotaryOption[]): number {
  for (let index = from + direction; index >= 0 && index < options.length; index += direction) if (!options[index]!.disabled) return index;
  return from;
}

/**
 * The option at screen angle `theta` (0° at the top, clockwise): the angle's place along the sweep rounded to the nearest
 * enabled position. An angle in the bottom gap goes to the nearer end.
 */
export function rotaryIndexAtAngle(theta: number, options: readonly RotaryOption[], sweep = rotaryDefaults.sweep): number {
  const angle = ((((theta + 180) % 360) + 360) % 360) - 180, half = sweep / 2;
  const fraction = angle > half ? 1 : angle < -half ? 0 : (angle + half) / sweep;
  return rotaryNearest(fraction * (options.length - 1), options);
}

/** The raw position (0 to `count − 1`, not snapped) after a vertical move of `dy` CSS px from `from`: the Knob's drag over the positions. */
export function rotaryDrag(from: number, dy: number, count: number, { dragPx = rotaryDefaults.dragPx, fine = rotaryDefaults.fine, shift = false } = {}): number {
  return knobDrag(from, dy, { min: 0, max: Math.max(0, count - 1) }, { dragPx, fine, shift });
}

/** The root's style: where the cap stands (`--strata-rotary-value`, 0–1 to four places) and a sweep other than the token's. */
export function rotaryStyle(index: number, count: number, sweep?: number): string {
  return `--strata-rotary-value: ${Math.round(rotaryFraction(index, count) * 10000) / 10000};${sweep !== undefined ? ` --strata-knob-sweep: ${sweep};` : ""}`;
}
/** A position's style: where it sits along the sweep (`--strata-rotary-at`, 0–1 to four places). */
export function rotaryMarkStyle(index: number, count: number): string {
  return `--strata-rotary-at: ${Math.round(rotaryFraction(index, count) * 10000) / 10000};`;
}

/** Everything a binding needs to render a rotary selector's markup, from its props. */
export interface RotaryModel {
  /** The selected option's index (the first one when `value` matches none). */
  index: number;
  /** The root's `style` attribute. */
  style: string;
  /** The printed positions, each with its style and the text it prints, and whether it is the selected one. */
  marks: { value: string; text: string; style: string; disabled: boolean; selected: boolean }[];
}

export interface RotaryModelInput {
  options: readonly RotaryOption[];
  value: string | undefined;
  sweep?: number;
}

/** The markup data for a rotary selector (anatomy page `rotary-selector.md`). */
export function rotaryModel({ options, value, sweep }: RotaryModelInput): RotaryModel {
  const found = options.findIndex(option => option.value === value);
  const index = found >= 0 ? found : Math.max(0, options.findIndex(option => !option.disabled));
  return {
    index,
    style: rotaryStyle(index, options.length, sweep),
    marks: options.map((option, at) => ({ value: option.value, text: option.label, style: rotaryMarkStyle(at, options.length), disabled: !!option.disabled, selected: at === index })),
  };
}
