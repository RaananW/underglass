/**
 * Keypad (anatomy page `keypad.md`): the behaviour a `fieldset.ug-keypad` adds to its native `<button>`s, for plain HTML, Astro and
 * the React and Vue bindings alike.
 * - **Held:** `data-strata-down` is `"true"` on a key from the pointer going down on it, or Space or Enter going down on it, to the
 *   pointer going up anywhere, the key going up, the pointer being cancelled, the key losing focus or the page being hidden, and
 *   `"false"` after that. A held key's cap is down. The click is the native one, so a form or a listener sees an ordinary button.
 * - **Feedback:** a key plays `click` as it goes down, once per press, where feedback is on (`dom/feedback.ts`, off by default).
 * - **Grid pattern:** the keys are one tab stop (a roving tabindex, applied the first time focus enters), and the arrow keys move
 *   one key along the row or one row along the column, Home and End to the ends of the row, Control+Home and Control+End to the ends
 *   of the keypad; nothing wraps (`dom/pad.ts` has the grid, which the Pad shares).
 * Every listener is delegated and passive except the grid's keys, which cancel only the keys they move focus with.
 */
import { attachStrataGrids, attachStrataHeldButtons } from "./pad.ts";

/**
 * Runs every `button.ug-keypad__key` in `doc`, present and future, through delegated listeners, once per document. `attachStrata`
 * calls it; the React and Vue bindings call it when a keypad mounts.
 */
export function attachStrataKeypads(doc: Document = document): void {
  attachStrataHeldButtons(doc, "button.ug-keypad__key");
  attachStrataGrids(doc);
}
