/**
 * RotarySelector (anatomy page `rotary-selector.md`): the round behaviour of a native `<select>` over a printed dial, for
 * plain HTML, Astro and the React and Vue bindings alike (design language sections 6 and 12; the Knob's model, probe I0.7).
 * One hard detent per `<option>`, spread evenly over the sweep, the cap turning to the selected one. A native select opens
 * its popup on a press, so the selector takes the pointer itself, as the Knob does:
 * - `pointerdown` is cancelled, so the browser never opens the popup from a press; the selector focuses its select and
 *   captures the pointer. Mouse, pen and touch take the same path (the select is `touch-action: none`, and its
 *   `touchstart` is cancelled).
 * - **Drag:** vertical, `knob.dragPx` per full sweep, times `knob.fine` while Shift is held, snapping to the nearest enabled
 *   option; a press that moves less than `knob.tapSlop` is a tap.
 * - **Ring click-to-set:** a tap outside the skirt selects the option nearest the pressed angle (0° at the top, clockwise
 *   over the sweep; the bottom gap goes to the nearer end). A printed label is on the ring, so a click on it selects it.
 * - **Cap tap,** the single-pointer alternative (WCAG 2.5.7): a tap on the skirt or the cap steps to the next enabled option
 *   on its upper half and the previous one on its lower half.
 * - **Wheel:** one blocking document-level listener finds the selector under the pointer with `elementFromPoint` and steps one
 *   option, so the page does not scroll over a selector. Ctrl+wheel (zoom) is left to the browser.
 * - **Keys** are the select's own: the arrows, Home, End and type-ahead change the option, and Alt+Down, F4 or Space open the
 *   native popup, which stays the browser's (drawn from the options, in the overlay host).
 * Every change goes through the select's `selectedIndex`, then `input` and `change` fire, as a native choice does, so forms and
 * framework bindings see native events. On every `input`, the cap's angle (`--strata-rotary-value` on the root) and the
 * selected print follow the option, and a changed option plays `tick` through `strataFeedback` (sound and haptics, both off
 * unless the page or scope turns them on).
 *
 * A RadioGroup's `selector` form (`radio.md`, section 11) is the same dial over native radios (`.ug-rotary--group`): the radios are the
 * control (a click on a printed position is a click on its radio, the arrows are the group's) and sit at their marks, so the dial itself has
 * only the gestures the radios do not cover, all ending in a radio's own `click()` (a native check, `input` and `change`):
 * - a click on the ring that is not on a printed label checks the radio nearest the pressed angle; a click on the skirt or cap steps to the
 *   next enabled radio on its upper half and the previous one on its lower half (the single-pointer alternative);
 * - the wheel over the dial steps one radio, with the page not scrolling;
 * - on every `change` the cap's angle (`--strata-rotary-value`) follows the checked radio and a changed radio plays `tick`.
 * A group has no checked radio until one is checked: its cap rests at the first position.
 */
import { rotaryDefaults, rotaryDrag, rotaryFraction, rotaryIndexAtAngle, rotaryNearest, rotaryStep, type RotaryOption, type RotaryTokens } from "../shared/rotary-selector.ts";
import { knobRegion } from "../shared/knob.ts";
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";

const selects = ".ug-rotary__select";
const radios = ".ug-rotary__radio";

/** A radio selector's radios as the maths sees them (the radios' values and whether each is disabled), and the checked one's index (-1 when none). */
const radiosOf = (root: Element) => [...root.querySelectorAll<HTMLInputElement>(radios)];
const radioOptions = (all: readonly HTMLInputElement[]): RotaryOption[] => all.map(radio => ({ value: radio.value, label: radio.value, disabled: radio.disabled }));

/** Brings a radio selector's cap up to date with its checked radio (`--strata-rotary-value` on the `.ug-rotary` root). Call it after checking a radio from script without an event. */
export function syncStrataRadioSelector(radio: HTMLInputElement): void {
  const root = radio.closest<HTMLElement>(".ug-rotary--group");
  if (!root) return;
  const all = radiosOf(root), index = Math.max(0, all.findIndex(item => item.checked));
  const fraction = String(Math.round(rotaryFraction(index, all.length) * 10000) / 10000);
  if (root.style.getPropertyValue("--strata-rotary-value") !== fraction) root.style.setProperty("--strata-rotary-value", fraction);
}

/** Checks radio `index` of a group as a click does (native: `input` and `change` fire); false when it changes nothing. */
function check(all: readonly HTMLInputElement[], index: number): boolean {
  const radio = all[index];
  if (!radio || radio.disabled || radio.checked) return false;
  radio.focus({ preventScroll: true });
  radio.click();
  return true;
}

/** The select's options as the maths sees them. */
const optionsOf = (select: HTMLSelectElement): RotaryOption[] => [...select.options].map(option => ({ value: option.value, label: option.text, disabled: option.disabled }));

/** The selector's `knob.*` tokens as resolved on its root, so themes and scopes apply. */
function tokensOf(root: Element): RotaryTokens {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: number) => { const value = Number.parseFloat(style.getPropertyValue(name)); return Number.isFinite(value) ? value : fallback; };
  return {
    sweep: read("--strata-knob-sweep", rotaryDefaults.sweep), dragPx: read("--strata-knob-drag-px", rotaryDefaults.dragPx),
    fine: read("--strata-knob-fine", rotaryDefaults.fine), tapSlop: read("--strata-knob-tap-slop", rotaryDefaults.tapSlop), snap: read("--strata-knob-snap", rotaryDefaults.snap),
  };
}

/** Selects option `index` and fires `input` and `change`, as a native choice does; false when it changes nothing. */
function commit(select: HTMLSelectElement, index: number): boolean {
  if (index < 0 || index >= select.options.length || index === select.selectedIndex || select.options[index]!.disabled) return false;
  select.selectedIndex = index;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Brings a selector's drawn state up to date with its select: the cap's angle (`--strata-rotary-value` on the `.ug-rotary`
 * root) and the selected position's print (`data-strata-selected` on its mark and its legend entry). The behaviour does this on
 * every `input` and `change`; call it after setting `value` or `selectedIndex` from script without one.
 */
export function syncStrataRotarySelector(select: HTMLSelectElement): void {
  const root = select.closest<HTMLElement>(".ug-rotary");
  if (!root) return;
  const count = select.options.length, index = Math.max(0, select.selectedIndex);
  const fraction = String(Math.round(rotaryFraction(index, count) * 10000) / 10000);
  if (root.style.getPropertyValue("--strata-rotary-value") !== fraction) root.style.setProperty("--strata-rotary-value", fraction);
  root.querySelectorAll(".ug-rotary__mark, .ug-rotary__legend > li").forEach((item, at) => {
    const position = at % Math.max(1, count), selected = String(position === index);
    if (item.getAttribute("data-strata-selected") !== selected) item.setAttribute("data-strata-selected", selected);
  });
}

interface Gesture { select: HTMLSelectElement; root: Element; x: number; y: number; last: number; raw: number; moved: boolean; tokens: RotaryTokens }

const attached = new WeakSet<Document>();

/**
 * Runs every `.ug-rotary` in `doc`, present and future, through delegated listeners (one of them the blocking
 * document-level wheel listener), once per document. `attachStrata` calls it; the React and Vue bindings call it when a
 * selector mounts.
 */
export function attachStrataRotarySelectors(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  const gestures = new Map<number, Gesture>();
  const selectOf = (target: EventTarget | null) => {
    const select = (target as Element | null)?.closest?.(selects);
    return select instanceof HTMLSelectElement && !select.disabled ? select : undefined;
  };

  doc.addEventListener("pointerdown", event => {
    const select = selectOf(event.target);
    const root = select?.closest(".ug-rotary");
    if (!select || !root || event.button !== 0 || !event.isPrimary || event.defaultPrevented) return;
    // Cancelled: the browser would open the popup. Focus and the keyboard stay native.
    event.preventDefault();
    select.focus({ preventScroll: true });
    try { select.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    gestures.set(event.pointerId, { select, root, x: event.clientX, y: event.clientY, last: event.clientY, raw: Math.max(0, select.selectedIndex), moved: false, tokens: tokensOf(root) });
  });
  // A touch would otherwise scroll or open the select by itself: cancelling `touchstart` leaves it to the pointer events.
  doc.addEventListener("touchstart", event => { if (selectOf(event.target)) event.preventDefault(); }, { passive: false });
  doc.addEventListener("pointermove", event => {
    const gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < gesture.tokens.tapSlop) return;
    gesture.moved = true;
    // Each move adds its own height at the current rate, so Shift can change the rate mid-drag; the unsnapped position is kept.
    const count = gesture.select.options.length;
    gesture.raw = rotaryDrag(gesture.raw, event.clientY - gesture.last, count, { dragPx: gesture.tokens.dragPx, fine: gesture.tokens.fine, shift: event.shiftKey });
    gesture.last = event.clientY;
    commit(gesture.select, rotaryNearest(gesture.raw, optionsOf(gesture.select)));
  });
  const end = (event: PointerEvent, cancelled: boolean) => {
    const gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    gestures.delete(event.pointerId);
    const { select, root, moved, tokens } = gesture;
    if (cancelled || moved) return;
    // No drag: the single-pointer alternative. The ring selects the pressed angle's option; the skirt and cap step.
    const box = select.getBoundingClientRect(), skirt = root.querySelector(".ug-rotary__skirt")?.getBoundingClientRect();
    const where = knobRegion(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), skirt && skirt.width > 0 ? skirt.width / 2 : 32);
    const options = optionsOf(select);
    commit(select, where.cap ? rotaryStep(select.selectedIndex, where.upper ? 1 : -1, options) : rotaryIndexAtAngle(where.theta, options, tokens.sweep));
  };
  doc.addEventListener("pointerup", event => end(event, false));
  doc.addEventListener("pointercancel", event => end(event, true));

  // The wheel: notches up step to the next option. Fine-grained wheels (touchpads) add up to a notch before stepping.
  let wheelSelect: HTMLSelectElement | undefined, wheelGroup: Element | undefined, wheelSum = 0, wheelTime = 0;
  doc.addEventListener("wheel", event => {
    if (event.ctrlKey) return;
    const under = doc.elementFromPoint(event.clientX, event.clientY);
    const group = under?.closest(".ug-rotary--group");
    const select = selectOf(under?.closest(".ug-rotary__dial")?.querySelector(selects) ?? null);
    if (!select && group && !group.closest("fieldset:disabled")) {
      if (!under?.closest(".ug-rotary__dial")) return;
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
      if (group !== wheelGroup || event.timeStamp - wheelTime > 400) wheelSum = 0;
      wheelGroup = group; wheelTime = event.timeStamp;
      wheelSum += (event.deltaY || event.deltaX) * scale;
      if (Math.abs(wheelSum) < 50) return;
      const direction = wheelSum < 0 ? 1 : -1;
      wheelSum = 0;
      const all = radiosOf(group);
      check(all, rotaryStep(all.findIndex(item => item.checked), direction, radioOptions(all)));
      return;
    }
    if (!select) return;
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
    const delta = (event.deltaY || event.deltaX) * scale;
    if (select !== wheelSelect || event.timeStamp - wheelTime > 400) wheelSum = 0;
    wheelSelect = select; wheelTime = event.timeStamp;
    wheelSum += delta;
    if (Math.abs(wheelSum) < 50) return;
    const direction = wheelSum < 0 ? 1 : -1;
    wheelSum = 0;
    commit(select, rotaryStep(select.selectedIndex, direction, optionsOf(select)));
  }, { passive: false });

  // Keys, the wheel, drags, taps and the native popup all end in `input` and `change`: the dial follows the option. In the
  // capture phase, so the page's own listeners already see the new state. A changed option ticks (feedback, off by default).
  doc.addEventListener("input", event => {
    const select = (event.target as Element | null)?.closest?.(selects);
    if (!(select instanceof HTMLSelectElement)) return;
    const root = select.closest<HTMLElement>(".ug-rotary");
    const before = Number.parseFloat(root?.style.getPropertyValue("--strata-rotary-value") ?? "");
    const count = select.options.length;
    if (Number.isFinite(before) && count > 1 && Math.round(before * (count - 1)) !== select.selectedIndex) strataFeedback(select, "tick");
    syncStrataRotarySelector(select);
  }, true);
  doc.addEventListener("change", event => {
    const target = event.target as Element | null, select = target?.closest?.(selects);
    if (select instanceof HTMLSelectElement) syncStrataRotarySelector(select);
    const radio = target?.closest?.(radios);
    if (radio instanceof HTMLInputElement && radio.checked) {
      // The cap's last place, read before it follows, against the checked radio: a changed position ticks.
      const root = radio.closest<HTMLElement>(".ug-rotary--group"), before = Number.parseFloat(root?.style.getPropertyValue("--strata-rotary-value") ?? ""), all = root ? radiosOf(root) : [];
      if (Number.isFinite(before) && all.length > 1 && Math.round(before * (all.length - 1)) !== all.indexOf(radio)) strataFeedback(radio, "tick");
      syncStrataRadioSelector(radio);
    }
  }, true);

  // A radio selector's dial: a click on the ring that no printed label (no radio) took checks the radio at the pressed angle; on the skirt or the cap it steps.
  doc.addEventListener("click", event => {
    const target = event.target as Element | null, dial = target?.closest<HTMLElement>(".ug-rotary--group .ug-rotary__dial");
    if (!dial || target?.closest(radios) || event.defaultPrevented || event.button !== 0) return;
    const root = dial.closest<HTMLElement>(".ug-rotary--group")!;
    if (root.closest("fieldset:disabled")) return;
    const all = radiosOf(root), options = radioOptions(all), box = dial.getBoundingClientRect(), skirt = root.querySelector(".ug-rotary__skirt")?.getBoundingClientRect();
    const where = knobRegion(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), skirt && skirt.width > 0 ? skirt.width / 2 : 32);
    const current = all.findIndex(item => item.checked);
    check(all, where.cap ? rotaryStep(current, where.upper ? 1 : -1, options) : rotaryIndexAtAngle(where.theta, options, tokensOf(root).sweep));
  });
}
