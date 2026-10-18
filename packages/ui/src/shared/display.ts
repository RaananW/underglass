/**
 * The Display (anatomy pages `display.md`, `text-field.md` section 11; design language section 3, *Emitters*, and section 6,
 * the Instrument object table): the TextField's `display` form and the read-only `<output>` Display. The backlight roles, the
 * decorative markup every binding renders for the window and its bezel, the emitters of the backlight, and the shape of the
 * glass over the printed text. Shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU helper and the
 * tests, so all of them agree.
 *
 * The native element is the control and covers the whole display, bezel included, so every pixel of the object lies inside
 * its box and every press lands on it: an `<input>` (typing, selection, caret, IME and autofill are the browser's) or a
 * read-only `<output>`. The bezel and the window are decoration under it (`pointer-events: none`), and the text is the
 * native element's own, captured with the face and printed under the glass. A backlight is lit by `--strata-lit` (0 unlit,
 * 1 lit), a registered number the recipe sets from the display's state; the GPU helper reads it frame by frame, so every
 * presentation follows one number.
 */
import { lampColours, mixHex, type LampEmitter, type StrataLampColour } from "./lamp.ts";

/** The forms a TextField takes besides the plain well: a glass window in a bezel. */
export const textForms = ["display"] as const;
export type StrataTextForm = (typeof textForms)[number];
/** Whether `value` names one of the TextField's forms (any other `form` value is the native form owner's id). */
export const isTextForm = (value: unknown): value is StrataTextForm => (textForms as readonly unknown[]).includes(value);

/** The backlight roles a display may take: the Lamp's colour roles, or `off`. A display with none is backlit in `glowOn`. */
export const displayBacklights = [...lampColours, "off"] as const;
export type StrataDisplayBacklight = StrataLampColour | "off";
/** The backlight a display has when it names none. */
export const defaultBacklight: StrataLampColour = "glowOn";
/** Whether `value` names a backlight role (or `off`). */
export const isDisplayBacklight = (value: unknown): value is StrataDisplayBacklight => (displayBacklights as readonly unknown[]).includes(value);

/** How a read-only display announces a changed value: `<output>` is a polite live region natively, so `off` is the one to ask for. */
export type StrataDisplayLive = "off" | "polite" | "assertive";

/** One decorative element of a display's object: its class and its Relief marker. */
export interface DisplayPart {
  className: string;
  face: "groove" | "flat";
}
/**
 * The display's object, inside `<span class="ug-display__object" aria-hidden="true">`, in paint order. Every part is
 * decoration: `pointer-events: none`, under the native element, which covers the whole display.
 * - `bezel`: the frame round the window (a groove face at Relief, a slab at Objects, a polished part at Instrument);
 * - `window`: the glass over the printed text (a flat face at Relief and Objects, the glass pane at Instrument).
 * The window is a child of the bezel, so the markup nests as the box does.
 */
export const displayMarkup: { bezel: DisplayPart; window: DisplayPart } = {
  bezel: { className: "ug-display__bezel", face: "groove" },
  window: { className: "ug-display__window", face: "flat" },
};

/** The attributes a display's root carries from its props: the form, the backlight role and whether the backlight is lit. */
export function displayAttributes({ backlight, lit }: { backlight?: StrataDisplayBacklight; lit?: boolean }): Record<string, string> {
  const attributes: Record<string, string> = { "data-strata-form": "display" };
  if (backlight !== undefined && isDisplayBacklight(backlight)) attributes["data-strata-backlight"] = backlight;
  if (lit === false) attributes["data-strata-lit"] = "false";
  return attributes;
}

/** The classes of the root: `--output` for a read-only display, `--input` for the TextField's form. */
export const displayClasses = (output: boolean) => ["ug-display", output ? "ug-display--output" : "ug-display--input"];

/** The room round the bezel in the display's box, for its cast shadow (the box rule), px. */
export const DISPLAY_ROOM = 4;
/** The bezel's width, px (`display.bezel.width`). */
export const DISPLAY_BEZEL = 7;
/** The window's corner radius, px. */
export const DISPLAY_WINDOW_RADIUS = 4;

/** What the backlight reads from `emitter.display.*`: reach and height in window heights, strength for the reference window. */
export interface DisplayEmitterTokens { radius: number; height: number; strength: number }
/** The reference window each `strength` is for, px high (the control's height at medium). */
export const displayEmitterReference = 36;
/** The premium tokens' defaults (`emitter.display.*`). */
export const displayEmitterDefaults: DisplayEmitterTokens = { radius: 3, height: 0.5, strength: 1400 };
/** The most emitters one display carries: a long window is lit along its length by one per window-height-and-a-half. */
export const MAX_DISPLAY_EMITTERS = 6;

const fixed = (value: number) => Math.round(value * 1000) / 1000;

/** How many emitters light a window `width` by `height`: one per two heights of length, from 1 to `MAX_DISPLAY_EMITTERS`. */
export const displayEmitterCount = (width: number, height: number) => Math.min(MAX_DISPLAY_EMITTERS, Math.max(1, Math.round(width / Math.max(1, height * 2))));

/** The backlight's light colour for a role colour (`#rrggbb`): the role scaled so its brightest channel is 1. */
export function backlightColour(role: string): [number, number, number] {
  const digits = role.replace("#", ""), full = digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map(at => Number.parseInt(full.slice(at, at + 2), 16) || 0) as [number, number, number], top = Math.max(r, g, b, 1);
  return [r / top, g / top, b / top].map(value => Math.round(value * 1000) / 1000) as [number, number, number];
}

/**
 * The backlight of the window `window` (x, y, width, height, panel px): `displayEmitterCount` emitters along its length,
 * each `height` window-heights over the face and reaching `radius` window-heights, their `strength` (for the reference
 * window) shared between them and scaled with the square of the window's height, times `lit` (0–1). An unlit or disabled
 * display keeps its emitters, at strength 0, so their order never depends on the state.
 */
export function displayEmitters(window: readonly [number, number, number, number], lit: number, roleColour: string, tokens: DisplayEmitterTokens = displayEmitterDefaults): LampEmitter[] {
  const [x, y, width, height] = window, count = displayEmitterCount(width, height), scale = (height / displayEmitterReference) ** 2;
  const colour = backlightColour(roleColour), strength = fixed(Math.min(1, Math.max(0, lit)) * tokens.strength * scale / Math.sqrt(count));
  return Array.from({ length: count }, (_, index): LampEmitter => ({
    position: [fixed(x + (width * (index + 0.5)) / count), fixed(y + height / 2), fixed(tokens.height * height)],
    colour, strength, radius: fixed(tokens.radius * height), reach: "outset", face: 1,
  }));
}

/** The tint a backlit window takes from its role, as a share of the colour over the field (static: it is part of the capture). */
export const BACKLIGHT_TINT = 0.1;
/** The window's field colour for a role colour and the field colour (`#rrggbb`), the CSS's `color-mix`. */
export const windowColour = (field: string, role: string) => mixHex(field, role, BACKLIGHT_TINT);
