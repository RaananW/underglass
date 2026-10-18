/**
 * The Lamp (anatomy page `lamp.md`; design language section 3, *Emitters*, and section 6, the Instrument object table):
 * the colour roles a lens takes, the decorative markup every binding renders for it, the box its native control takes,
 * the colours of its lens lit and unlit, and the emitter a lit lens carries. Shared by the React, Vue and Astro
 * bindings, the plain-DOM behaviour, the GPU helper and the tests, so all of them agree.
 *
 * A lens is lit by `--strata-lit` (0 unlit, 1 lit), a registered number the recipe sets from the native state and a
 * StatusLight's `blink` animates; the GPU helper reads it frame by frame, so every presentation follows one number.
 */

/** The colour roles a Lamp or StatusLight may take (`colour`): `glowOn` is the lamp's own, the rest are the status roles. */
export const lampColours = ["glowOn", "accent", "success", "warning", "danger", "info"] as const;
export type StrataLampColour = (typeof lampColours)[number];
/** Whether `value` names one of the lens colours. */
export const isLampColour = (value: unknown): value is StrataLampColour => (lampColours as readonly unknown[]).includes(value);

/** One decorative element of a lamp's object: its class and its Relief marker. */
export interface LampPart {
  className: string;
  face?: "raised" | "knob";
}

/**
 * The lamp's object, inside `<span class="ug-lamp__object" aria-hidden="true">`, in paint order. Every part is
 * decoration: `pointer-events: none`, so every press lands on the native control, whose box covers the whole object.
 * - `bezel`: the ring round the lens (a raised face);
 * - `socket`: the dark disc under the lens, printed on the face at every level, so the unlit lens is a dark glass dome
 *   at the Instrument level (the glass refracts the page under it) and the lit lens only adds light;
 * - `lens`: the glass over the lamp (a knob face), the emitter's part.
 */
export const lampMarkup: LampPart[] = [
  { className: "ug-lamp__bezel", face: "raised" },
  { className: "ug-lamp__socket" },
  { className: "ug-lamp__lens", face: "knob" },
];

/** The lens diameter per `size` (`size.lamp.*`), CSS px. */
export const lampLens = { small: 20, medium: 28, large: 36 } as const;
/** The room round the lens in the native control's box: the bezel (4 px each side) and the bloom's halo (10 px each side). */
export const LAMP_ROOM = 28;
/** The bezel's ring width, px. */
export const LAMP_BEZEL = 4;
/** The native control's box for a lens, a square: the lens, its bezel and the room for the halo. */
export const lampBox = (lens: number) => lens + LAMP_ROOM;

/** The StatusLight's lens diameter per `size` (`size.statusLight.*`), CSS px. */
export const statusLightLens = { small: 8, medium: 10, large: 14 } as const;
/** The room round a StatusLight's lens in its box: the bloom's halo, 8 px each side. */
export const STATUS_LIGHT_ROOM = 16;
export const statusLightBox = (lens: number) => lens + STATUS_LIGHT_ROOM;

const channel = (value: number) => Math.min(255, Math.max(0, Math.round(value)));
const hexOf = ([r, g, b]: readonly number[]) => `#${[r, g, b].map(value => channel(value!).toString(16).padStart(2, "0")).join("")}`;
const rgbOf = (hex: string): [number, number, number] => {
  const digits = hex.replace("#", "");
  const full = digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits.slice(0, 6);
  return [0, 2, 4].map(at => Number.parseInt(full.slice(at, at + 2), 16) || 0) as [number, number, number];
};
/** `share` of `b` over `a`, per channel, as `#rrggbb` (CSS `color-mix(in srgb, a, b share)`). */
export const mixHex = (a: string, b: string, share: number): string => {
  const [ar, ag, ab] = rgbOf(a), [br, bg, bb] = rgbOf(b);
  return hexOf([ar + (br - ar) * share, ag + (bg - ag) * share, ab + (bb - ab) * share]);
};

/** The unlit lens's glass: the role colour at 16% over this dark glass, the recipe's `--_off`. */
export const LENS_GLASS = "#15171b";
/**
 * A lens's colours from its role colour (`#rrggbb`): `on`, lit (the role mixed 18% towards white, the recipe's
 * `--_on`), `off`, unlit (the role at 16% over dark glass), and `light`, the emitter's colour, the role scaled so its
 * brightest channel is 1 (a role colour is chosen to carry text on a lit face, a light is chosen to be bright).
 */
export function lensColours(role: string): { on: string; off: string; light: [number, number, number] } {
  const [r, g, b] = rgbOf(role), top = Math.max(r, g, b, 1);
  return { on: mixHex(role, "#ffffff", 0.18), off: mixHex(LENS_GLASS, role, 0.16), light: [r / top, g / top, b / top].map(value => Math.round(value * 1000) / 1000) as [number, number, number] };
}

/** One emitter (design language section 3; Rendering Model 2D.4), in the panel's CSS px: what the GPU helper hands core. */
export interface LampEmitter {
  position: [number, number, number];
  colour: [number, number, number];
  strength: number;
  radius: number;
  reach?: "outset" | "layer";
  face?: number;
}
/** What a lamp or an LED reads from `emitter.lamp.*` and `emitter.led.*`: reach and height in lens diameters. */
export interface EmitterTokens { radius: number; height: number; strength: number }
/** The reference lens each kind's `strength` is for, px. */
export const emitterReference = { lamp: 28, led: 10 } as const;
/** The premium tokens' defaults (`emitter.lamp.*`, `emitter.led.*`, `emitter.guardFeather`). */
export const emitterDefaults: { lamp: EmitterTokens; led: EmitterTokens; guardFeather: number } = {
  lamp: { radius: 6, height: 0.7, strength: 3200 }, led: { radius: 6, height: 0.8, strength: 520 }, guardFeather: 4,
};

const fixed = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The emitter of a lens `lens` px across centred at (`x`, `y`): `height` and `radius` in lens diameters, `strength` for
 * the reference lens and scaled by the square of the lens (so a larger lens throws the same pool, larger), times `lit`
 * (0–1). An unlit or disabled lens keeps its place with strength 0, so the emitters' order never depends on the state.
 */
export function lensEmitter(kind: "lamp" | "led", centre: readonly [number, number], lens: number, lit: number, roleColour: string, tokens: EmitterTokens = emitterDefaults[kind]): LampEmitter {
  const scale = (lens / emitterReference[kind]) ** 2;
  return {
    position: [fixed(centre[0]), fixed(centre[1]), fixed(tokens.height * lens)],
    colour: lensColours(roleColour).light,
    strength: fixed(Math.min(1, Math.max(0, lit)) * tokens.strength * scale),
    radius: fixed(tokens.radius * lens),
    reach: "outset", face: 1,
  };
}
