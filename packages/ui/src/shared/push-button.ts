/**
 * The PushButton forms (anatomy pages `button.md` and `toggle-button.md`, *Push-button forms*; design language section 6,
 * the Instrument object table, and section 12): `momentary` on the Button and `latching` on the ToggleButton. Their names,
 * the decorative markup every binding renders for them, the numbers of their box, the travel of their cap, the colours and
 * emitters of their lit ring and LED. Shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU helper and
 * the tests, so all of them agree.
 *
 * Both forms are the native `<button>` itself: a bezel, a lit ring and a machined cap that carries the label. The ring is lit
 * by `--strata-lit` and the LED (latching) by `--strata-led`, two registered numbers (0 unlit, 1 lit) the recipe sets from the
 * native state; the GPU helper reads them frame by frame, as it does a Lamp's.
 */
import { lensColours, type LampEmitter } from "./lamp.ts";
import { type SwitchSpring } from "./switch-forms.ts";

/** The push-button forms: `momentary` is the Button's, `latching` the ToggleButton's. */
export const pushForms = ["momentary", "latching"] as const;
export type StrataPushForm = (typeof pushForms)[number];

/** Whether `value` names one of the push-button forms (any other `form` value is the native form owner's id). */
export const isPushForm = (value: unknown): value is StrataPushForm => (pushForms as readonly unknown[]).includes(value);
/** The form a Button takes from its `form` prop: `momentary`, or none (any other string is the native `form` attribute). */
export const buttonPushForm = (form: unknown): "momentary" | undefined => (form === "momentary" ? "momentary" : undefined);
/** The form a ToggleButton takes from its `form` prop: `latching`, or none. */
export const togglePushForm = (form: unknown): "latching" | undefined => (form === "latching" ? "latching" : undefined);

/** One decorative element of a push button's object: its class and its Relief marker. */
export interface PushPart {
  className: string;
  face?: "raised";
}

/**
 * The object's parts inside `<span class="ug-push__object" aria-hidden="true">`, in paint order. Every part is decoration:
 * `pointer-events: none`, so every press lands on the native `<button>`, whose box covers the whole object.
 * - `bezel`: the ring-shaped frame round the lit ring (a raised face; polished metal at the Instrument level);
 * - `socket`: the dark band under the ring, printed on the face at every level, so the unlit ring is dark glass;
 * - `ring`: the lit ring (the emitter's part), a band between the bezel and the cap;
 * - latching only, `led-socket` and `led`: the small lens on the bezel's top edge that shows the latched state.
 * The cap (`<span class="ug-push__cap" data-strata-face="raised">`, holding the icon and the label) follows the object.
 */
export function pushMarkup(form: StrataPushForm): PushPart[] {
  const parts: PushPart[] = [{ className: "ug-push__bezel", face: "raised" }, { className: "ug-push__socket" }, { className: "ug-push__ring" }];
  if (form === "latching") parts.push({ className: "ug-push__led-socket" }, { className: "ug-push__led" });
  return parts;
}

/** The cap's height (and diameter, when the label is short) per `size` (`size.push.*`), CSS px. */
export const pushCap = { small: 32, medium: 40, large: 48 } as const;
/** The room round the cap in the button's box, per side: the 0.6 gap, the 2 px ring, the 4.4 px bezel and 5 px for the bloom's halo. */
export const PUSH_GAP = 0.6, PUSH_RING = 2, PUSH_RIM = 4.4, PUSH_HALO = 5;
export const PUSH_ROOM = 2 * (PUSH_GAP + PUSH_RING + PUSH_RIM + PUSH_HALO);
/** The button's box height (and its width, with a short label): the cap plus its room (64 at medium). */
export const pushBox = (cap: number) => cap + PUSH_ROOM;
/** The LED's lens diameter, and the lens's centre from the box's top edge (on the bezel's rim). */
export const PUSH_LED = 6;
export const PUSH_LED_AT = PUSH_HALO + PUSH_RIM / 2;

/** The cap's travel at 50% depth, px (`pushButton.travel`): held down, and latched. */
export const pushTravel = { held: 4, latched: 1.8 } as const;
/** Where a latched cap stands along its held travel, 0–1: 0.45. */
export const PUSH_LATCHED = pushTravel.latched / pushTravel.held;
/** The cap's height, the bezel's height and the ring's lift above the bezel at 50% depth, px (`pushButton.cap`, `pushButton.bezel`). */
export const pushGeometry = { cap: 6, taper: 0.6, chamfer: 2, bezel: 3.2, ring: 0.5, label: 1 } as const;

/** `spring.button` (design language section 12): 1,600 stiffness and 80 damping, critically damped. */
export const pushSpring: SwitchSpring = { stiffness: 1600, damping: 80 };

/** Where a push button's cap stands along its travel, 0–1: 1 held down, `PUSH_LATCHED` latched, 0 up; a disabled one never moves. */
export function pushPosition(state: { held: boolean; latched: boolean; disabled: boolean }): number {
  if (state.disabled) return 0;
  return state.held ? 1 : state.latched ? PUSH_LATCHED : 0;
}

/** What a push button's emitters read from `emitter.pushButton.*` (the ring) and `emitter.led.*` (the LED). */
export interface PushEmitterTokens { radius: number; height: number; strength: number }
/** The premium tokens' defaults: the ring's reach and height in cap diameters, its strength for the reference 40 px cap. */
export const pushEmitterDefaults: PushEmitterTokens = { radius: 4, height: 0.3, strength: 2400 };
/** The reference cap `pushEmitterDefaults.strength` is for. */
export const PUSH_REFERENCE = 40;

const fixed = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The ring's emitter: a point light over the cap's centre (`cap` px across), `height` and `radius` in cap diameters,
 * `strength` for the reference cap scaled by the square of the cap, times `lit` (0–1). An unlit ring keeps its place with
 * strength 0, so the emitters' order never depends on the state.
 */
export function ringEmitter(centre: readonly [number, number], cap: number, lit: number, roleColour: string, tokens: PushEmitterTokens = pushEmitterDefaults): LampEmitter {
  return {
    position: [fixed(centre[0]), fixed(centre[1]), fixed(tokens.height * cap)],
    colour: lensColours(roleColour).light,
    strength: fixed(Math.min(1, Math.max(0, lit)) * tokens.strength * (cap / PUSH_REFERENCE) ** 2),
    radius: fixed(tokens.radius * cap),
    reach: "outset", face: 1,
  };
}
