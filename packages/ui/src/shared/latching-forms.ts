/**
 * The latching forms of the everyday controls (anatomy pages `checkbox.md`, `radio.md` and `segmented-control.md`, *Latching
 * forms*; design language sections 6 and 12): a Checkbox as a small latching square button (`form="latching"`), a RadioGroup as
 * a preset bank (`form="bank"`) and a SegmentedControl as interlocking latching buttons on one plinth (`form="latching"`).
 * Their names, the decorative markup every binding renders for them, the numbers of their boxes and the lights they take from
 * the native state. Shared by the React, Vue and Astro bindings, the plain-DOM behaviour, the GPU helper and the tests, so all
 * of them agree. They reuse the PushButton's machinery (`shared/push-button.ts`): the same host class, `--strata-lit`,
 * `--strata-led` and `--strata-push-t`, the same spring, the same emitters.
 *
 * The native control stays the control: the `<input>` covers its key's whole box (an invisible overlay), so every press and every
 * key lands on it, and the key is decoration that follows its `checked` and `indeterminate` state.
 */
import { PUSH_GAP, PUSH_RIM, PUSH_RING, type PushPart } from "./push-button.ts";

/** The name that keeps today's look: reserved on every control that has a latching form, never the native `form` attribute. */
export const FLUSH_FORM = "flush";

/** The Checkbox's latching form and the SegmentedControl's. */
export type StrataLatchForm = "latching";
/** The RadioGroup's latching form: a preset bank. */
export type StrataBankForm = "bank";

/** The form a Checkbox or SegmentedControl takes from its `form` prop: `latching`, or none (`flush` and any other string are not forms). */
export const latchForm = (form: unknown): StrataLatchForm | undefined => (form === "latching" ? "latching" : undefined);
/** The form a RadioGroup takes from its `form` prop: `bank`, or none. */
export const bankForm = (form: unknown): StrataBankForm | undefined => (form === "bank" ? "bank" : undefined);
/**
 * The value to leave as the native `form` attribute (the id of a form owner) once the form names are taken out: `flush` and the
 * control's own form names are not form owners; any other string is, as before.
 */
export const nativeForm = (form: unknown, own: "latching" | "bank"): string | undefined => (typeof form === "string" && form !== FLUSH_FORM && form !== own ? form : undefined);

/**
 * A Checkbox's key object, inside `<span class="ug-push__object" aria-hidden="true">`, in paint order: the push
 * button's bezel, socket and lit ring (a square key, so the same shapes with a small corner radius). The cap
 * (`<span class="ug-push__cap" data-strata-face="raised"><span class="ug-checkbox__mark">`) follows the object.
 */
export const checkboxMarkup: PushPart[] = [{ className: "ug-push__bezel", face: "raised" }, { className: "ug-push__socket" }, { className: "ug-push__ring" }];
/**
 * A bank key's object (Radio in a bank, a SegmentedControl's segment): the LED's socket and lens on the plinth above the cap.
 * The cap (`<span class="ug-push__cap" data-strata-face="raised">`, holding the label) follows the object. A bank key has no
 * bezel and no ring: the plinth is the single frame, and the LED shows the key that is down.
 */
export const bankMarkup: PushPart[] = [{ className: "ug-push__led-socket" }, { className: "ug-push__led" }];

/** The room round a Checkbox's cap: the 0.6 gap, the 2 px ring, the 4.4 px bezel and 4 px for the bloom's halo. */
export const LATCH_HALO = 4;
/** The Checkbox's box (a square): the cap (`size.indicator.*`: 16, 20, 24 px) plus its room (22 px). */
export const latchBox = (cap: number) => cap + 2 * (PUSH_GAP + PUSH_RING + PUSH_RIM + LATCH_HALO);
/** A bank key's room: 6 px round its cap (so neighbours touch and the hit areas leave no gap), and the strip above it for the LED. */
export const BANK_MARGIN = 6, BANK_LED_ROOM = 14;
/** The plinth's padding, and the fieldset's round the plinth in a bank (room for the plinth's shadow inside the native group's box). */
export const BANK_PLINTH_PAD = 2, BANK_FIELDSET_PAD = 8;

/** The numbers a latching key takes from its native control (`--strata-lit`, `--strata-led`, `--strata-push-t`). */
export interface LatchNumbers { lit: number; led: number; t: number }
/** Where an indeterminate checkbox's cap stands along the travel, and how lit its ring is: half way between up and latched. */
export const LATCH_MIXED = { t: 0.2, lit: 0.5 } as const;

/**
 * The numbers of a latching key now. Held (the pointer or a key down on it): the cap all the way down and the ring lit. Checked: the
 * ring and the LED lit, the cap at 0.45 of its travel. Indeterminate: the ring and LED half lit, the cap at 0.2 and a dash printed on
 * it. Disabled: never lit and never held, but a checked one keeps its place, so a selected disabled radio is still the one that is down.
 */
export function latchNumbers(state: { checked: boolean; indeterminate?: boolean; held?: boolean; disabled?: boolean }): LatchNumbers {
  if (state.disabled) return { lit: 0, led: 0, t: state.checked && !state.indeterminate ? 0.45 : 0 };
  if (state.held) return { lit: 1, led: state.checked ? 1 : 0, t: 1 };
  if (state.indeterminate) return { lit: LATCH_MIXED.lit, led: LATCH_MIXED.lit, t: LATCH_MIXED.t };
  return state.checked ? { lit: 1, led: 1, t: 0.45 } : { lit: 0, led: 0, t: 0 };
}
