/**
 * Lamp (anatomy page `lamp.md`): the behaviour a Lamp adds to its native control, for plain HTML, Astro and the React
 * and Vue bindings alike.
 * - **A toggle lamp** (`<input type="checkbox" role="switch">`) needs none: click, Space and its label are native, and
 *   its state is `checked`. Enter does not toggle, as on the Switch.
 * - **A momentary lamp** (`<button class="ug-lamp ug-lamp--momentary" aria-pressed>`, with its object and its label
 *   inside it) lights while it is pressed: `aria-pressed` is `"true"` from the pointer going down on the button or Space or
 *   Enter going down on it, to the pointer going up anywhere, the key going up, the pointer being cancelled or the
 *   button losing focus. The click is the native one, so a form or a listener sees an ordinary button.
 * - **Feedback:** a lamp plays `click` where feedback is on (`dom/feedback.ts`, off by default): a toggle on its change,
 *   a momentary lamp as it goes down.
 * Every listener is delegated and passive: nothing on the native event path is blocked or changed.
 */
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";

const momentary = "button.ug-lamp--momentary";
const toggles = ".ug-lamp:not(.ug-lamp--momentary) > .ug-lamp__input";

/** The momentary lamp's button around `target`, if it is enabled. */
function buttonOf(target: EventTarget | null): HTMLButtonElement | undefined {
  const button = (target as Element | null)?.closest?.(momentary);
  return button instanceof HTMLButtonElement && !button.disabled ? button : undefined;
}

const attached = new WeakSet<Document>();

/**
 * Runs every `.ug-lamp` in `doc`, present and future, through delegated listeners, once per document. `attachStrata`
 * calls it; the React and Vue bindings call it when a lamp mounts.
 */
export function attachStrataLamps(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  /** The pointers holding a lamp down, and the keys. */
  const pointers = new Map<number, HTMLButtonElement>(), keys = new Map<HTMLButtonElement, string>();
  const held = (button: HTMLButtonElement) => keys.has(button) || [...pointers.values()].includes(button);
  const set = (button: HTMLButtonElement, on: boolean) => {
    if (button.getAttribute("aria-pressed") === String(on)) return;
    button.setAttribute("aria-pressed", String(on));
    if (on) strataFeedback(button, "click");
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
    const button = event.target instanceof HTMLButtonElement && event.target.matches(momentary) && !event.target.disabled ? event.target : undefined;
    if (!button || event.repeat || (event.key !== " " && event.key !== "Enter")) return;
    keys.set(button, event.key);
    set(button, true);
  }, { capture: true, passive: true });
  doc.addEventListener("keyup", event => {
    const button = event.target instanceof HTMLButtonElement ? event.target : undefined;
    if (!button || !keys.has(button) || (event.key !== " " && event.key !== "Enter")) return;
    keys.delete(button);
    if (!held(button)) set(button, false);
  }, { capture: true, passive: true });
  // A button that loses focus, or a page that is hidden, lets go.
  doc.addEventListener("focusout", event => {
    const button = event.target instanceof HTMLButtonElement ? event.target : undefined;
    if (!button?.matches(momentary)) return;
    keys.delete(button);
    if (!held(button)) set(button, false);
  }, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") releaseAll(); }, { passive: true });
  doc.addEventListener("change", event => {
    const input = (event.target as Element | null)?.closest?.(toggles);
    if (input) strataFeedback(input, "click");
  }, { passive: true });
}
