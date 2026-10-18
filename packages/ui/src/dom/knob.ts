/**
 * Knob (anatomy page `knob.md`): the round behaviour of a native `<input type="range">` over a printed dial, for plain
 * HTML, Astro and the React and Vue bindings alike (design language section 14, Instrument controls; probe I0.7 and
 * the I1 prototype's second iteration). A native range maps a press left to right, so a knob takes the pointer itself:
 * - `pointerdown` is cancelled, so the browser never sets the value from the pointer's x; the knob focuses its input
 *   and captures the pointer. Mouse, pen and touch take the same path (the input is `touch-action: none`, and a
 *   knob's `touchstart` is cancelled, since a touch would otherwise drive the native range by itself).
 * - **Drag:** vertical, `knob.dragPx` per full sweep, times `knob.fine` while Shift is held; a press that moves less
 *   than `knob.tapSlop` is a tap.
 * - **Ring click-to-set:** a tap outside the skirt sets the value by angle (0° at the top, clockwise over the sweep;
 *   the bottom gap goes to the nearer end), exactly a printed mark's value within `knob.snap` degrees of it.
 * - **Cap tap,** the single-pointer alternative (WCAG 2.5.7): a tap on the skirt or the cap steps a notch (`step`, at
 *   least 1% of the range) up on its upper half and down on its lower half.
 * - **Wheel:** one blocking document-level listener finds the knob under the pointer with `elementFromPoint` (a
 *   listener on the input is unreliable inside the canvas subtree, I0.7) and steps a notch, so the page does not
 *   scroll over a knob. Ctrl+wheel (zoom) is left to the browser.
 * - **Double-click** returns to `data-strata-default`, or the input's default value. **Keys** stay native.
 * Every change goes through the input's `value`, firing `input` and, at the end of a gesture, `change`, so forms and
 * framework bindings see native events. On every `input`, the knob's pointer angle (`--strata-knob-value` on its root)
 * and, when the input has `data-strata-unit`, its `aria-valuetext` follow the value.
 */
import { knobDefaults, knobDrag, knobFraction, knobNotch, knobRegion, knobValueAtAngle, knobValueText, type KnobRange, type KnobTokens } from "../shared/knob.ts";

const knobInputs = ".ug-knob__input";

/** The native value setter: setting `value` through it is seen by framework value trackers (React's) as a user edit. */
const setNative = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value); else input.value = value;
};

function rangeOf(input: HTMLInputElement): Required<KnobRange> {
  const min = Number.parseFloat(input.min), max = Number.parseFloat(input.max), step = Number.parseFloat(input.step);
  return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 100, step: step > 0 ? step : 1 };
}

/** The knob's `knob.*` tokens as resolved on its root, so themes and scopes apply. */
function tokensOf(root: Element): KnobTokens {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: number) => { const value = Number.parseFloat(style.getPropertyValue(name)); return Number.isFinite(value) ? value : fallback; };
  return {
    sweep: read("--strata-knob-sweep", knobDefaults.sweep), dragPx: read("--strata-knob-drag-px", knobDefaults.dragPx),
    fine: read("--strata-knob-fine", knobDefaults.fine), tapSlop: read("--strata-knob-tap-slop", knobDefaults.tapSlop), snap: read("--strata-knob-snap", knobDefaults.snap),
  };
}

/** Sets the value through the input (the browser snaps it to `step`), then dispatches `input` when it changed. */
function commit(input: HTMLInputElement, raw: number): boolean {
  const { min, max } = rangeOf(input), before = input.value;
  setNative(input, String(Math.min(max, Math.max(min, raw))));
  if (input.value === before) return false;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
const finish = (input: HTMLInputElement) => input.dispatchEvent(new Event("change", { bubbles: true }));

/**
 * Brings a knob's drawn state up to date with its input's value: the pointer angle (`--strata-knob-value` on the
 * `.ug-knob` root) and, when the input names a unit (`data-strata-unit`), its `aria-valuetext`. The behaviour does this
 * on every `input` event; call it after setting `value` from script without one.
 */
export function syncStrataKnob(input: HTMLInputElement): void {
  const root = input.closest<HTMLElement>(".ug-knob");
  if (!root) return;
  const value = Number(input.value), fraction = String(Math.round(knobFraction(value, rangeOf(input)) * 10000) / 10000);
  if (root.style.getPropertyValue("--strata-knob-value") !== fraction) root.style.setProperty("--strata-knob-value", fraction);
  const unit = input.getAttribute("data-strata-unit");
  if (unit !== null) {
    const text = knobValueText(value, unit);
    if (input.getAttribute("aria-valuetext") !== text) input.setAttribute("aria-valuetext", text);
  }
}

/** The values of a knob's printed marks, which a ring click near one sets exactly. */
const marksOf = (root: Element) => [...root.querySelectorAll(".ug-knob__mark[data-strata-value]")].map(mark => Number(mark.getAttribute("data-strata-value"))).filter(Number.isFinite);

/** The value a double-click returns to. */
function resetOf(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.getAttribute("data-strata-default") ?? input.defaultValue);
  return Number.isFinite(value) ? value : rangeOf(input).min;
}

interface Gesture { input: HTMLInputElement; root: Element; x: number; y: number; last: number; raw: number; moved: boolean; before: string; tokens: KnobTokens }

const attached = new WeakSet<Document>();

/**
 * Runs every `.ug-knob` in `doc`, present and future, through delegated listeners (one of them the blocking
 * document-level wheel listener), once per document. `attachStrata` calls it; the React and Vue bindings call it when
 * a knob mounts.
 */
export function attachStrataKnobs(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  const gestures = new Map<number, Gesture>();
  const knobInput = (target: EventTarget | null) => {
    const input = (target as Element | null)?.closest?.(knobInputs);
    return input instanceof HTMLInputElement && input.type === "range" && !input.disabled ? input : undefined;
  };

  doc.addEventListener("pointerdown", event => {
    const input = knobInput(event.target);
    const root = input?.closest(".ug-knob");
    if (!input || !root || event.button !== 0 || !event.isPrimary || event.defaultPrevented) return;
    // Cancelled: the browser would set the value from the pointer's x. Focus and the keyboard stay native.
    event.preventDefault();
    input.focus({ preventScroll: true });
    try { input.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    gestures.set(event.pointerId, { input, root, x: event.clientX, y: event.clientY, last: event.clientY, raw: Number(input.value), moved: false, before: input.value, tokens: tokensOf(root) });
  });
  // A touch drives a native range on its own (it sets the value from the touch's x, whatever the pointer events do):
  // cancelling `touchstart` leaves a touch to the pointer events above.
  doc.addEventListener("touchstart", event => { if (knobInput(event.target)) event.preventDefault(); }, { passive: false });
  doc.addEventListener("pointermove", event => {
    const gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < gesture.tokens.tapSlop) return;
    gesture.moved = true;
    // Each move adds its own height at the current rate, so Shift can change the rate mid-drag. The unsnapped value
    // is kept, so slow drags still move a coarse step.
    gesture.raw = knobDrag(gesture.raw, event.clientY - gesture.last, rangeOf(gesture.input), { dragPx: gesture.tokens.dragPx, fine: gesture.tokens.fine, shift: event.shiftKey });
    gesture.last = event.clientY;
    commit(gesture.input, gesture.raw);
  });
  const end = (event: PointerEvent, cancelled: boolean) => {
    const gesture = gestures.get(event.pointerId);
    if (!gesture) return;
    gestures.delete(event.pointerId);
    const { input, root, moved, before, tokens } = gesture;
    if (cancelled) return;
    if (moved) { if (input.value !== before) finish(input); return; }
    // No drag: the single-pointer alternative. The ring sets the value at the pressed angle; the skirt and cap step it.
    const box = input.getBoundingClientRect(), skirt = root.querySelector(".ug-knob__skirt")?.getBoundingClientRect();
    const where = knobRegion(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), skirt && skirt.width > 0 ? skirt.width / 2 : 32);
    const range = rangeOf(input);
    const changed = where.cap
      ? commit(input, Number(input.value) + (where.upper ? 1 : -1) * knobNotch(range))
      : commit(input, knobValueAtAngle(where.theta, range, { sweep: tokens.sweep, snap: tokens.snap, marks: marksOf(root) }));
    if (changed) finish(input);
  };
  doc.addEventListener("pointerup", event => end(event, false));
  doc.addEventListener("pointercancel", event => end(event, true));

  doc.addEventListener("dblclick", event => {
    const input = knobInput(event.target);
    if (input && commit(input, resetOf(input))) finish(input);
  });

  // The wheel: notches up raise the value. Fine-grained wheels (touchpads) add up to a notch before stepping.
  let wheelInput: HTMLInputElement | undefined, wheelSum = 0, wheelTime = 0;
  doc.addEventListener("wheel", event => {
    if (event.ctrlKey) return;
    const under = doc.elementFromPoint(event.clientX, event.clientY);
    const input = knobInput(under?.closest(".ug-knob__dial")?.querySelector(knobInputs) ?? null);
    if (!input) return;
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
    const delta = (event.deltaY || event.deltaX) * scale;
    if (input !== wheelInput || event.timeStamp - wheelTime > 400) wheelSum = 0;
    wheelInput = input; wheelTime = event.timeStamp;
    wheelSum += delta;
    if (Math.abs(wheelSum) < 50) return;
    const direction = wheelSum < 0 ? 1 : -1;
    wheelSum = 0;
    if (commit(input, Number(input.value) + direction * knobNotch(rangeOf(input)))) finish(input);
  }, { passive: false });

  // Keys, the wheel, drags and taps all end in an `input` event: the dial follows the value. In the capture phase, so
  // the page's own listeners already see the new value text.
  doc.addEventListener("input", event => {
    const input = (event.target as Element | null)?.closest?.(knobInputs);
    if (input instanceof HTMLInputElement) syncStrataKnob(input);
  }, true);
}
