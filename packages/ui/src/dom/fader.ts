/**
 * Fader (anatomy page `fader.md`): the behaviour a native `<input type="range">` fader adds to the browser's own, for
 * plain HTML, Astro and the React and Vue bindings alike (design language section 14, Instrument controls; probes
 * I0.2 and I0.7). The input is transparent and covers the whole track (the slot and the printed scale); its thumb is
 * the carriage's travel footprint, so the browser does the rest:
 * - **Drag** is the native thumb's: a press on the drawn carriage is a press on the thumb, and the value follows the
 *   pointer one to one (mouse, pen and touch; the input is `touch-action: pan-x`, or `pan-y` when horizontal, so a
 *   drag along the travel never scrolls the page).
 * - **Click-to-set** is the native track click: a press anywhere else on the track (the slot or the scale) puts the
 *   carriage's centre under the pointer. The thumb is longer than the carriage (its margins hold the carriage's
 *   shadow), so a tap on that margin, where the browser starts a drag instead, sets the value on release the same way.
 *   A tap released within `fader.snap` px of a printed mark sets exactly the mark's value (a numeral's box sits on
 *   whole pixels). A tap on the carriage itself changes nothing.
 * - **Wheel:** one blocking document-level listener finds the fader under the pointer with `elementFromPoint` (a
 *   listener on the input is unreliable inside the canvas subtree, I0.7) and steps a notch (`step`, at least 1% of
 *   the range), so the page does not scroll over a fader. Ctrl+wheel (zoom) is left to the browser.
 * - **Double-click** returns to `data-strata-default`, or the input's default value. **Keys** stay native.
 * Every change goes through the input's `value`, firing `input` and, at the end of a gesture, `change`, so forms and
 * framework bindings see native events. On every `input`, the carriage (`--strata-fader-value` on the root) and, when
 * the input has `data-strata-unit`, its `aria-valuetext` follow the value, and a detented fader's carriage passing a
 * detent plays `tick` through `strataFeedback` (sound and haptics, both off unless the page or scope turns them on).
 */
import { faderDefaults, faderFraction, faderGeometry, faderNotch, faderSnap, faderValueAt, faderValueText, type FaderRange } from "../shared/fader.ts";
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";

const faderInputs = ".ug-fader__input";

/** The native value setter: setting `value` through it is seen by framework value trackers (React's) as a user edit. */
const setNative = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value); else input.value = value;
};

function rangeOf(input: HTMLInputElement): Required<FaderRange> {
  const min = Number.parseFloat(input.min), max = Number.parseFloat(input.max), step = Number.parseFloat(input.step);
  return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 100, step: step > 0 ? step : 1 };
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
 * Brings a fader's drawn state up to date with its input's value: the carriage (`--strata-fader-value` on the
 * `.ug-fader` root) and, when the input names a unit (`data-strata-unit`), its `aria-valuetext`. The behaviour does
 * this on every `input` event; call it after setting `value` from script without one.
 */
export function syncStrataFader(input: HTMLInputElement): void {
  const root = input.closest<HTMLElement>(".ug-fader");
  if (!root) return;
  const value = Number(input.value), fraction = String(Math.round(faderFraction(value, rangeOf(input)) * 10000) / 10000);
  if (root.style.getPropertyValue("--strata-fader-value") !== fraction) root.style.setProperty("--strata-fader-value", fraction);
  const unit = input.getAttribute("data-strata-unit");
  if (unit !== null) {
    const text = faderValueText(value, unit);
    if (input.getAttribute("aria-valuetext") !== text) input.setAttribute("aria-valuetext", text);
  }
}

/** The value a double-click returns to. */
function resetOf(input: HTMLInputElement): number {
  const value = Number.parseFloat(input.getAttribute("data-strata-default") ?? input.defaultValue);
  return Number.isFinite(value) ? value : rangeOf(input).min;
}

/** A fader's `fader.snap`, as resolved on its root, so themes and scopes apply. */
function snapOf(root: Element): number {
  const value = Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-fader-snap"));
  return Number.isFinite(value) ? value : faderDefaults.snap;
}

interface Press { input: HTMLInputElement; x: number; y: number; before: string }

const attached = new WeakSet<Document>();

/**
 * Runs every `.ug-fader` in `doc`, present and future, through delegated listeners (one of them the blocking
 * document-level wheel listener), once per document. `attachStrata` calls it; the React and Vue bindings call it when
 * a fader mounts.
 */
export function attachStrataFaders(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  const presses = new Map<number, Press>();
  const faderInput = (target: EventTarget | null) => {
    const input = (target as Element | null)?.closest?.(faderInputs);
    return input instanceof HTMLInputElement && input.type === "range" && !input.disabled ? input : undefined;
  };

  // The press itself is the browser's (thumb drag or track click). A tap is finished on release: within `fader.snap`
  // of a printed mark it sets exactly the mark's value, and on the thumb's margin round the carriage (where the
  // browser starts a drag rather than a track click) it sets the value there, as a track click does. A tap on the
  // carriage itself changes nothing.
  doc.addEventListener("pointerdown", event => {
    const input = faderInput(event.target);
    if (input && event.button === 0 && event.isPrimary) presses.set(event.pointerId, { input, x: event.clientX, y: event.clientY, before: input.value });
  });
  doc.addEventListener("pointerup", event => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    const root = press?.input.closest(".ug-fader");
    if (!press || !root || Math.hypot(event.clientX - press.x, event.clientY - press.y) >= faderGeometry.tapSlop) return;
    const carriage = root.querySelector(".ug-fader__carriage")?.getBoundingClientRect();
    if (carriage && press.x >= carriage.left && press.x <= carriage.right && press.y >= carriage.top && press.y <= carriage.bottom) return;
    const vertical = !root.matches(".ug-fader--horizontal"), box = press.input.getBoundingClientRect();
    // The slot runs 3 px past each end of the carriage centre's travel.
    const slot = root.querySelector(".ug-fader__slot")?.getBoundingClientRect();
    const travel = slot ? (vertical ? slot.height : slot.width) - 6 : (vertical ? box.height : box.width) - faderGeometry.along - 2 * faderGeometry.margin;
    const marks = [...root.querySelectorAll(".ug-fader__mark[data-strata-value]")].map(mark => {
      const rect = mark.getBoundingClientRect();
      return { value: Number(mark.getAttribute("data-strata-value")), at: vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2 };
    }).filter(mark => Number.isFinite(mark.value));
    const value = faderSnap(vertical ? press.y : press.x, marks, snapOf(root))
      ?? (press.input.value === press.before ? faderValueAt(vertical ? press.y - box.top : press.x - box.left, vertical ? box.height : box.width, travel, rangeOf(press.input), vertical ? "vertical" : "horizontal") : undefined);
    // The browser fires its own `change` on release; a snap is one more change, after it.
    if (value !== undefined && commit(press.input, value)) finish(press.input);
  });
  doc.addEventListener("pointercancel", event => { presses.delete(event.pointerId); });

  doc.addEventListener("dblclick", event => {
    const input = faderInput(event.target);
    if (input && commit(input, resetOf(input))) finish(input);
  });

  // The wheel: notches up (or right) raise the value. Fine-grained wheels (touchpads) add up to a notch before stepping.
  let wheelInput: HTMLInputElement | undefined, wheelSum = 0, wheelTime = 0;
  doc.addEventListener("wheel", event => {
    if (event.ctrlKey) return;
    const under = doc.elementFromPoint(event.clientX, event.clientY);
    const input = faderInput(under?.closest(".ug-fader__track")?.querySelector(faderInputs) ?? null);
    if (!input) return;
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
    const delta = (event.deltaY || -event.deltaX) * scale;
    if (input !== wheelInput || event.timeStamp - wheelTime > 400) wheelSum = 0;
    wheelInput = input; wheelTime = event.timeStamp;
    wheelSum += delta;
    if (Math.abs(wheelSum) < 50) return;
    const direction = wheelSum < 0 ? 1 : -1;
    wheelSum = 0;
    if (commit(input, Number(input.value) + direction * faderNotch(rangeOf(input)))) finish(input);
  }, { passive: false });

  // Keys, drags, track clicks, the wheel and the reset all end in an `input` event: the carriage follows the value. In
  // the capture phase, so the page's own listeners already see the new value text.
  doc.addEventListener("input", event => {
    const input = (event.target as Element | null)?.closest?.(faderInputs);
    if (!(input instanceof HTMLInputElement)) return;
    // A detented carriage passing a detent ticks (feedback, off by default): the carriage's last place, read before it
    // follows, against the new value, in detents.
    const root = input.closest(".ug-fader");
    if (root?.matches(".ug-fader--detented")) {
      const { min, max, step } = rangeOf(input), before = Number.parseFloat(root instanceof HTMLElement ? root.style.getPropertyValue("--strata-fader-value") : "");
      const detent = (fraction: number) => Math.round((fraction * (max - min)) / step);
      if (Number.isFinite(before) && max > min && detent(before) !== detent(faderFraction(Number(input.value), { min, max }))) strataFeedback(input, "tick");
    }
    syncStrataFader(input);
  }, true);
}
