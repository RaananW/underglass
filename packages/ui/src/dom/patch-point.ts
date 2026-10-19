/**
 * PatchPoint (anatomy page `patch-point.md`): the behaviour a PatchPoint adds to its native control, for plain HTML, Astro and the
 * React and Vue bindings alike.
 * - **A checkbox PatchPoint** (`<input type="checkbox">`, connected when checked) needs none: click, Space and its label are native,
 *   and its state is `checked`, which a form submits.
 * - **A button PatchPoint** (`<button class="ug-patch-point ug-patch-point--button" aria-pressed>`, with its jack and its label inside
 *   it) toggles `aria-pressed` on click (and Enter or Space, which click a button natively), as a ToggleButton does, and dispatches a
 *   bubbling `strata-pressed-change` event with `{ pressed }`. A click another listener has cancelled (`preventDefault`) does not toggle, and
 *   neither does one whose handler has already set `aria-pressed` itself (a page that keeps the state: the behaviour only reports it).
 * - **Feedback:** a jack plays `click` where feedback is on (`dom/feedback.ts`, off by default) as it is connected and `thunk` as it is
 *   disconnected: a plug seating, a plug pulled.
 * Every listener is delegated and passive: nothing on the native event path is blocked or changed.
 */
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";
import type { PressedChange } from "./behaviour.ts";

const buttons = "button.ug-patch-point--button";
const checkboxes = ".ug-patch-point > .ug-patch-point__input";

const attached = new WeakSet<Document>();
/** The `aria-pressed` each button had when its click began, before any handler of the page's ran. */
const began = new WeakMap<Element, string | null>();

/**
 * Runs every `.ug-patch-point` in `doc`, present and future, through delegated listeners, once per document. `attachStrata` calls it;
 * the React and Vue bindings call it when a PatchPoint mounts.
 */
export function attachStrataPatchPoints(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  doc.addEventListener("click", event => { const button = (event.target as Element | null)?.closest?.(buttons); if (button) began.set(button, button.getAttribute("aria-pressed")); }, { capture: true, passive: true });
  doc.addEventListener("click", event => {
    const button = (event.target as Element | null)?.closest?.(buttons);
    if (!(button instanceof HTMLButtonElement) || button.disabled || event.defaultPrevented || button.getAttribute("aria-disabled") === "true") return;
    // A page that keeps the state has set it already: report that, do not toggle it back.
    const was = began.get(button) ?? button.getAttribute("aria-pressed"), now = button.getAttribute("aria-pressed");
    const pressed = now !== was ? now === "true" : was !== "true";
    if (now !== String(pressed)) button.setAttribute("aria-pressed", String(pressed));
    strataFeedback(button, pressed ? "click" : "thunk");
    button.dispatchEvent(new CustomEvent<PressedChange>("strata-pressed-change", { bubbles: true, detail: { pressed } }));
  }, { passive: true });
  doc.addEventListener("change", event => {
    const input = (event.target as Element | null)?.closest?.(checkboxes);
    if (input instanceof HTMLInputElement) strataFeedback(input, input.checked ? "click" : "thunk");
  }, { passive: true });
}
