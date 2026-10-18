/**
 * StatusLight (anatomy page `status-light.md`): changing a light's state in plain DOM, keeping it valid. A StatusLight
 * needs no behaviour of its own (its blink is CSS, off under reduced motion); this sets what changes, the way the
 * bindings render it:
 * - `label` is the `aria-label` of a light that is an image (`role="img"`), and the text of one that shows or announces
 *   it (`.ug-status-light__text`; an `<output>` names the change to a screen reader as the text changes);
 * - `lit` is `data-strata-lit="false"` when unlit, absent when lit;
 * - `colour` and `blink` are `data-strata-colour` and `data-strata-blink`, removed with `null`.
 * A light's meaning is its label: colour and blink never carry it alone.
 */
import type { StrataLampColour } from "../shared/lamp.ts";
import type { StrataBlink } from "../shared/status-light.ts";

export interface StatusLightUpdate {
  label?: string;
  lit?: boolean;
  colour?: StrataLampColour | null;
  blink?: StrataBlink | null;
}

/** Updates the StatusLight `element` is, or is inside. Returns it, or undefined when there is none. */
export function setStrataStatusLight(element: Element, update: StatusLightUpdate): HTMLElement | undefined {
  const root = element.closest<HTMLElement>(".ug-status-light");
  if (!root) return undefined;
  if (update.label !== undefined) {
    const text = root.querySelector(".ug-status-light__text");
    if (text) text.textContent = update.label; else root.setAttribute("aria-label", update.label);
  }
  if (update.lit !== undefined) { if (update.lit) root.removeAttribute("data-strata-lit"); else root.setAttribute("data-strata-lit", "false"); }
  for (const [name, value] of [["colour", update.colour], ["blink", update.blink]] as const) {
    if (value === undefined) continue;
    if (value === null) root.removeAttribute(`data-strata-${name}`); else root.setAttribute(`data-strata-${name}`, value);
  }
  return root;
}
