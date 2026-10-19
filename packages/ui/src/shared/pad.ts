/**
 * The Pad and the Keypad (anatomy pages `pad.md` and `keypad.md`; design language section 6, the Instrument object table, and
 * section 12): the decorative markup every binding renders for them, the numbers of their boxes, the travel of their caps, the
 * emitter of a lit pad, the velocity of a press and the keys of the grid pattern. Shared by the React, Vue and Astro bindings, the
 * plain-DOM behaviour, the GPU helper and the tests, so all of them agree.
 *
 * A Pad is a native `<button>` (momentary, or latching with `aria-pressed`) drawn as a square soft cap in a grid, lit from below:
 * the same two registered numbers as the PushButton light and move it, `--strata-lit` (0 unlit, 1 lit) and `--strata-push-t` (the
 * cap's travel, 1 held, 0.45 latched), which the recipe sets from the native state and the GPU helper reads frame by frame. A Keypad
 * is a `<fieldset>` of native `<button>`s, machined square caps with a printed legend on one polished plinth, with `--strata-push-t`
 * alone (a key has no light).
 */
import { lensColours, type LampEmitter } from "./lamp.ts";
import { pushSpring } from "./push-button.ts";

/** One decorative element of a pad's object: its class and its Relief marker. */
export interface PadPart {
  className: string;
  face?: "raised";
}

/**
 * The pad's object, inside `<span class="ug-pad__object" aria-hidden="true">`, in paint order. Every part is decoration:
 * `pointer-events: none`, so every press lands on the native `<button>`, whose box covers the whole object.
 * - `socket`: the dark well the cap stands in (the cap's side plus a 3 px rim), printed on the face at every level, so an unlit
 *   pad is dark glass at the Instrument level;
 * - `glow`: the lit rim round the cap (the emitter's part at Relief and Objects, hidden at the Instrument level, where the cap's
 *   body is the glass lens).
 * The cap (`<span class="ug-pad__cap" data-strata-face="raised">`, holding the icon and the label) follows the object.
 */
export const padMarkup: PadPart[] = [{ className: "ug-pad__socket" }, { className: "ug-pad__glow" }];

/** The cap's side per `size` (`size.pad.*`), CSS px. */
export const padCap = { small: 48, medium: 64, large: 80 } as const;
/** The room round the cap in the button's box, per side: the 3 px rim the glow shows and 6 px for the halo and the cap's shadow. */
export const PAD_RIM = 3, PAD_HALO = 6;
export const PAD_ROOM = 2 * (PAD_RIM + PAD_HALO);
/** The pad's box (a square when its label is short): the cap plus its room (82 at medium). */
export const padBox = (cap: number) => cap + PAD_ROOM;
/** The cap's corner radius, in cap sides. */
export const PAD_RADIUS = 0.22;

/** The cap's travel at 50% depth, px (`pad.travel`): held down, and latched. */
export const padTravel = { held: 3, latched: 1.35 } as const;
/** Where a latched cap stands along its held travel, 0–1: 0.45, as the PushButton's. */
export const PAD_LATCHED = padTravel.latched / padTravel.held;
/** The cap's height and its taper and chamfer at 50% depth, px (`pad.cap`), and the thickness of the captured label. */
export const padGeometry = { cap: 5, taper: 0.6, chamfer: 1.5, label: 1 } as const;
/** `spring.button`, as the PushButton's. */
export const padSpring = pushSpring;

/** Where a pad's cap stands along its travel, 0–1: 1 held down, `PAD_LATCHED` latched, 0 up; a disabled one never moves. */
export function padPosition(state: { held: boolean; latched: boolean; disabled: boolean }): number {
  if (state.disabled) return 0;
  return state.held ? 1 : state.latched ? PAD_LATCHED : 0;
}

/** What a pad's emitter reads from `emitter.pad.*`: reach and height in cap sides, strength for the reference pad. */
export interface PadEmitterTokens { radius: number; height: number; strength: number }
/** The premium tokens' defaults. */
export const padEmitterDefaults: PadEmitterTokens = { radius: 3, height: 0.25, strength: 3600 };
/** The reference cap `padEmitterDefaults.strength` is for. */
export const PAD_REFERENCE = 64;

const fixed = (value: number) => Math.round(value * 1000) / 1000;

/**
 * A lit pad's emitter: a point light over the cap's centre (`cap` px across), `height` and `radius` in cap sides, `strength` for
 * the reference pad scaled by the square of the cap, times `lit` (0–1). An unlit pad keeps its place with strength 0, so the
 * emitters' order never depends on the state.
 */
export function padEmitter(centre: readonly [number, number], cap: number, lit: number, roleColour: string, tokens: PadEmitterTokens = padEmitterDefaults): LampEmitter {
  return {
    position: [fixed(centre[0]), fixed(centre[1]), fixed(tokens.height * cap)],
    colour: lensColours(roleColour).light,
    strength: fixed(Math.min(1, Math.max(0, lit)) * tokens.strength * (cap / PAD_REFERENCE) ** 2),
    radius: fixed(tokens.radius * cap),
    reach: "outset", face: 1,
  };
}

/** Where a press's velocity comes from: the pointer's pressure, where the hardware reports it; else where on the cap it lands; the keys. */
export type PadVelocitySource = "pressure" | "position" | "keyboard";
/** The lowest velocity a press at the very edge of the cap gives. */
export const PAD_SOFTEST = 0.25;

/**
 * The velocity of a press, 0–1 (optional: nothing depends on it). A pen or a finger on hardware that reports force gives its
 * `pressure`; a pressure of exactly 0.5 is what a pointer without pressure sensing reports, so it is not taken as one. Otherwise the
 * place on the cap decides: the middle gives 1 and the edge `PAD_SOFTEST` (the farther of the two axes counts, so a corner is as soft
 * as an edge). The keys give 1. Rounded to two places.
 */
export function padVelocity(press: { pointerType?: string; pressure?: number; x?: number; y?: number; box?: { left: number; top: number; width: number; height: number } }): { velocity: number; source: PadVelocitySource } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const { pointerType, pressure, x, y, box } = press;
  if (pointerType && pointerType !== "mouse" && pressure !== undefined && pressure > 0 && pressure !== 0.5) return { velocity: round(Math.min(1, pressure)), source: "pressure" };
  if (x === undefined || y === undefined || !box || box.width <= 0 || box.height <= 0) return { velocity: 1, source: "keyboard" };
  const dx = Math.abs(x - (box.left + box.width / 2)) / (box.width / 2), dy = Math.abs(y - (box.top + box.height / 2)) / (box.height / 2);
  return { velocity: round(1 - (1 - PAD_SOFTEST) * Math.min(1, Math.max(dx, dy))), source: "position" };
}

/** The columns of a grid, as the style attribute the bindings write (`--strata-pad-columns`, `--strata-keypad-columns`). */
export const gridStyle = (name: "pad" | "keypad", columns: number | undefined): string | undefined =>
  columns !== undefined && Number.isFinite(columns) && columns >= 1 ? `--strata-${name}-columns: ${Math.floor(columns)};` : undefined;

/** The key cap's side per `size` (`size.keypad.*`), CSS px. */
export const keypadCap = { small: 36, medium: 44, large: 52 } as const;
/** The room round a key's cap in its box, per side (so its shadow stays in the box and neighbours' targets nearly touch), the gap between boxes. */
export const KEYPAD_ROOM = 6, KEYPAD_GAP = 0;
/** A key's box (a square): the cap plus its room (56 at medium, over the 44 px a touch target should be). */
export const keypadBox = (cap: number) => cap + 2 * KEYPAD_ROOM;
/** The plinth's padding round the keys, and the fieldset's round the plinth (room for the plinth's shadow inside the group's box). */
export const KEYPAD_PLINTH_PAD = 2, KEYPAD_FIELD_PAD = 12;
/** A key cap's travel at 50% depth, px (`keypad.travel`), its height, taper and chamfer, the plinth's height and the label's thickness. */
export const keypadTravel = 2.5;
export const keypadGeometry = { cap: 6, taper: 0.6, chamfer: 2, plinth: 2.4, label: 1 } as const;

/** The shape of a grid of controls in document order: its columns, how many controls it holds and which can be focused. */
export interface GridShape {
  columns: number;
  count: number;
  /** Right-to-left text: left and right swap. */
  rtl?: boolean;
  /** Whether the control at an index can be focused (not disabled). */
  enabled?: (index: number) => boolean;
}

/**
 * The index the grid pattern's key moves focus to from `from`, or undefined when the key is not a grid key (or nothing enabled lies
 * that way). The arrows move one control along the row or one row along the column, not wrapping, skipping disabled controls in
 * that direction; Home and End move to the first and last enabled control of the row, Control+Home and Control+End to the first and
 * last of the grid. The last row may be short: Down from a column it lacks stops where it is.
 */
export function gridTarget(from: number, key: string, shape: GridShape, ctrl = false): number | undefined {
  const { columns, count } = shape, enabled = shape.enabled ?? (() => true);
  if (columns < 1 || count < 1 || from < 0 || from >= count) return undefined;
  const ok = (index: number) => index >= 0 && index < count && enabled(index);
  const first = (indices: number[]) => indices.find(ok);
  const rowStart = Math.floor(from / columns) * columns, rowEnd = Math.min(count, rowStart + columns) - 1;
  /** The indices from `a` to `b` inclusive, stepping `toward`; none when `a` is already past `b`. */
  const range = (a: number, b: number, toward: 1 | -1 = a <= b ? 1 : -1) => (toward === 1 ? a > b : a < b) ? [] : Array.from({ length: Math.abs(b - a) + 1 }, (_, step) => a + toward * step);
  switch (key) {
    case "ArrowLeft": case "ArrowRight": {
      const forward = (key === "ArrowRight") !== !!shape.rtl;
      return first(forward ? range(from + 1, rowEnd, 1) : range(from - 1, rowStart, -1));
    }
    case "ArrowDown": case "ArrowUp": {
      const down = key === "ArrowDown", line: number[] = [];
      for (let index = from + (down ? columns : -columns); index >= 0 && index < count; index += down ? columns : -columns) line.push(index);
      return first(line);
    }
    case "Home": return ctrl ? first(range(0, count - 1, 1)) : first(range(rowStart, rowEnd, 1));
    case "End": return ctrl ? first(range(count - 1, 0, -1)) : first(range(rowEnd, rowStart, -1));
    default: return undefined;
  }
}
