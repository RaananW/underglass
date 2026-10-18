/**
 * PushButton forms (anatomy pages `button.md` and `toggle-button.md`, *Push-button forms*): the behaviour `form="momentary"`
 * on a Button and `form="latching"` on a ToggleButton add to the native `<button>`, for plain HTML, Astro and the React and
 * Vue bindings alike.
 * - **Held:** `data-strata-down` is `"true"` from the pointer going down on the button, or Space or Enter going down on it, to
 *   the pointer going up anywhere, the key going up, the pointer being cancelled, the button losing focus or the page being
 *   hidden, and `"false"` after that (it overrides a `:active` a touch can leave behind; with no script `:active` is the held state). A momentary button's ring is lit and its cap down while it is held; a latching button's cap goes all the way down
 *   while held and rests at 0.45 of the travel while latched (`aria-pressed`, kept by the ToggleButton's own behaviour). The
 *   click is the native one, so a form or a listener sees an ordinary button; Enter and Space both activate it, as on any button.
 * - **Disabled:** a disabled or `aria-disabled` button is never held, never lit and never travels.
 * - **Feedback:** a push button plays `click` as it goes down, once per press, where feedback is on (`dom/feedback.ts`, off
 *   by default).
 * - **Latching forms** (anatomy pages `checkbox.md`, `radio.md`, `segmented-control.md`): the host of a Checkbox's key or a bank key
 *   (`.ug-latch`, a push button's host) is held down the same way while its native input is pressed, and a disabled input is never held.
 *   Their feedback is `click` once per real change of the input (`change` fires once for the radio that becomes checked, once per
 *   checkbox toggle, never for a script's assignment), not on the way down.
 * Every listener is delegated and passive: nothing on the native event path is blocked or changed.
 */
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";

const pushes = "button.ug-push, .ug-latch";

/** The enabled push button, or latching key, around `target`. */
function buttonOf(target: EventTarget | null): HTMLElement | undefined {
  const host = (target as Element | null)?.closest?.(pushes);
  if (host instanceof HTMLButtonElement) return !host.disabled && host.getAttribute("aria-disabled") !== "true" ? host : undefined;
  if (!(host instanceof HTMLElement)) return undefined;
  const input = host.querySelector(":scope > input");
  return input instanceof HTMLInputElement && !input.disabled ? host : undefined;
}
/** Whether `host` is a latching key (a Checkbox's or a bank key), not a button. */
const isLatch = (host: Element) => host.classList.contains("ug-latch");

const attached = new WeakSet<Document>();

/**
 * Runs every `button.ug-push` in `doc`, present and future, through delegated listeners, once per document. `attachStrata`
 * calls it; the React and Vue bindings call it when a push button mounts.
 */
export function attachStrataPushButtons(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  /** The pointers holding a button down, and the keys. */
  const pointers = new Map<number, HTMLElement>(), keys = new Map<HTMLElement, string>();
  const held = (button: HTMLElement) => keys.has(button) || [...pointers.values()].includes(button);
  const set = (button: HTMLElement, on: boolean) => {
    if ((button.getAttribute("data-strata-down") === "true") === on) return;
    // Released is `"false"`, not absent: a touch can leave Chrome's `:active` on the button after it ends, and `"false"` overrides it.
    button.setAttribute("data-strata-down", String(on));
    if (on && !isLatch(button)) strataFeedback(button, "click");
  };
  const releaseAll = () => {
    const buttons = new Set([...pointers.values(), ...keys.keys()]);
    pointers.clear(); keys.clear();
    for (const button of buttons) set(button, false);
  };
  doc.addEventListener("pointerdown", event => {
    const button = event.button === 0 && event.isPrimary ? buttonOf(event.target) : undefined;
    if (!button) return;
    pointers.set(event.pointerId, button);
    set(button, true);
  }, { capture: true, passive: true });
  const up = (event: PointerEvent) => {
    const button = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (button && !held(button)) set(button, false);
  };
  doc.addEventListener("pointerup", up, { capture: true, passive: true });
  doc.addEventListener("pointercancel", up, { capture: true, passive: true });
  doc.addEventListener("keydown", event => {
    const button = event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement ? buttonOf(event.target) : undefined;
    // Enter does nothing on a checkbox or a radio: only Space holds a latching key.
    if (!button || event.repeat || (event.key !== " " && event.key !== "Enter") || (isLatch(button) && event.key !== " ")) return;
    keys.set(button, event.key);
    set(button, true);
  }, { capture: true, passive: true });
  doc.addEventListener("keyup", event => {
    const button = event.target instanceof HTMLButtonElement ? event.target : event.target instanceof HTMLInputElement ? buttonOf(event.target) : undefined;
    if (!button || !keys.has(button) || (event.key !== " " && event.key !== "Enter")) return;
    keys.delete(button);
    if (!held(button)) set(button, false);
  }, { capture: true, passive: true });
  // A button that loses focus, or a page that is hidden, lets go.
  doc.addEventListener("focusout", event => {
    const button = event.target instanceof HTMLButtonElement ? event.target : event.target instanceof HTMLInputElement ? event.target.closest<HTMLElement>(".ug-latch") ?? undefined : undefined;
    if (!button?.matches(pushes)) return;
    keys.delete(button);
    if (!held(button)) set(button, false);
  }, { capture: true, passive: true });
  // A latching key plays its click once per real change of its input.
  doc.addEventListener("change", event => {
    const host = event.target instanceof HTMLInputElement ? event.target.closest(".ug-latch") : null;
    if (host && event.target === host.querySelector(":scope > input")) strataFeedback(host, "click");
  }, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") releaseAll(); }, { passive: true });
}
