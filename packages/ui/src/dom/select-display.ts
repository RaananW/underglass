/**
 * The Select's display form (anatomy page `select.md`, section 11): the behaviour of the two step buttons beside the display window, for
 * plain HTML, Astro and the React and Vue bindings alike. The select is the control and its keys and its list are the browser's; the buttons
 * are a pointer's way to step it without opening the list, so they are `aria-hidden` with `tabindex="-1"` (they duplicate the arrow keys,
 * and add nothing to the accessibility tree or the tab order).
 * - **Step:** a click on a `.ug-select-display__step` selects the next (`data-strata-step="1"`) or previous (`"-1"`) enabled option of the
 *   root's select, through its `selectedIndex`, then `input` and `change` fire, as a native choice does, so forms and framework bindings
 *   see native events. At the end of the list nothing changes and nothing fires (the select does not wrap).
 * - **Focus:** a press on a step button keeps the focus where it is (`mousedown` is cancelled), and the select takes the focus after the
 *   step, so the arrow keys continue from there.
 * - **Disabled:** a disabled select takes no step (the bindings also give the buttons `disabled`).
 * The held look of the button (the ring lit, the cap down) is the PushButton's own behaviour (`attachStrataPushButtons`, which this attaches).
 * Every listener is delegated.
 */
import { selectStepIndex } from "../shared/select-forms.ts";
import { attachStrataPushButtons } from "./push-button.ts";

const steps = ".ug-select-display__step";
const attached = new WeakSet<Document>();

/** The select a step button steps, in its display's root. */
const selectOf = (button: Element) => button.closest(".ug-select-display")?.querySelector<HTMLSelectElement>(".ug-display__text");

/** Selects the next enabled option of `select` in `direction` and fires `input` and `change`; false when it changes nothing. */
export function stepStrataSelect(select: HTMLSelectElement, direction: 1 | -1): boolean {
  if (select.disabled) return false;
  const to = selectStepIndex(select.selectedIndex, direction, [...select.options].map(option => option.disabled || option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled));
  if (to === select.selectedIndex) return false;
  select.selectedIndex = to;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Runs every `.ug-select-display__step` in `doc`, present and future, through delegated listeners, once per document. `attachStrata`
 * calls it; the React and Vue bindings call it when a display Select mounts.
 */
export function attachStrataSelectDisplays(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  attachStrataPushButtons(doc);
  // Cancelled, so the press does not move the focus off the select (or onto the button, which is not in the tab order).
  doc.addEventListener("mousedown", event => { if ((event.target as Element | null)?.closest?.(steps)) event.preventDefault(); });
  doc.addEventListener("click", event => {
    const button = (event.target as Element | null)?.closest?.<HTMLButtonElement>(steps);
    const select = button && selectOf(button);
    if (!button || !select || button.disabled || event.defaultPrevented) return;
    stepStrataSelect(select, Number(button.getAttribute("data-strata-step")) < 0 ? -1 : 1);
    if (doc.activeElement !== select && !select.disabled) select.focus({ preventScroll: true });
  });
}
