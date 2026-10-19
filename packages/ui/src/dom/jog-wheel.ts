/**
 * JogWheel (anatomy page `jog-wheel.md`): the round behaviour of a native `<input type="range">` over a large flat wheel,
 * for plain HTML, Astro and the React and Vue bindings alike (design language sections 12 and 14, Instrument controls). A
 * jog wheel is an endless encoder: the value steps by the input's `step` and, with `data-strata-wrap`, passes from `max` to
 * `min` and back, while the wheel's position is an **accumulated angle** (`--strata-jog-angle` on its root, degrees) that is
 * not the value and never turns back when the value wraps. A step is `360 / --strata-jog-turn` degrees.
 * - `pointerdown` is cancelled, so the browser never sets the value from the pointer's x; the wheel focuses its input and
 *   captures the pointer. Mouse, pen and touch take the same path (the input is `touch-action: none`, and `touchstart` is
 *   cancelled, since a touch would otherwise drive the native range by itself).
 * - **Circular drag:** the angle of the pointer about the wheel's centre turns the wheel by the same angle (times
 *   `jog.fine` with Shift); the value steps as the angle passes each step. `data-strata-drag="vertical"` on the root makes
 *   it the Knob's vertical drag instead, `jog.dragPx` a turn. A press that moves less than `jog.tapSlop` is a tap.
 * - **Tap,** the single-pointer alternative (WCAG 2.5.7): a tap on the upper half of the wheel's box steps up one step, on
 *   the lower half one step down, so no drag is ever required.
 * - **Wheel:** one blocking document-level listener finds the jog wheel under the pointer with `elementFromPoint` and steps one
 *   step a notch, so the page does not scroll over it. Ctrl+wheel (zoom) is left to the browser.
 * - **Inertia:** a drag released faster than `jog.flick` degrees a second keeps turning on `spring.jog`: friction slows it and, with
 *   detents, a soft pull to the nearest detent settles it. **The rule:** the value only ever changes by one native step per
 *   `input` event, each event as the angle passes a step; a gesture that passes several steps at once dispatches one event for
 *   each; a coasting wheel applies at most `jog.maxRate` steps a second (the release speed is held to it), so a page that can take
 *   one event a frame (60 a second) is never given more than `jog.maxRate / 60` steps in a frame. Under `prefers-reduced-motion`
 *   a released wheel stops where it was let go. `change` fires once, when the wheel comes to rest.
 * - **Keys** are the native range input's; at an end of a `wrap` wheel, the key that would go past it goes round instead
 *   (ArrowUp, ArrowRight and PageUp past `max` to `min`; ArrowDown, ArrowLeft and PageDown past `min` to `max`; the arrows swap in
 *   a right-to-left page). **Double-click** returns to `data-strata-default`, or the input's default value.
 * Every change goes through the input's `value`, firing `input` and `change`, so forms and framework bindings see native events.
 * **Where the GPU draws the dimple** (the helper marks it `data-strata-dome`), the angle of a drag or of coasting is kept in script
 * (`liveStrataJog`) and reaches the GPU as a bubbling `strata-jog-live` event, and nothing is written to the DOM while it moves: a
 * custom property written inside the layer recaptures it every frame, as a native value written by a script does. The input's thumb
 * is hidden for the same reason (a thumb moving with the value is paint), and `aria-valuetext` is held back until the wheel rests (an
 * attribute written inside the layer recaptures it too), so a flick adds no capture of its own. The angle and the value text are written
 * to the DOM (`--strata-jog-angle` for the CSS presentation) whenever the wheel comes to rest and for every change that is not a motion.
 * On every `input`, the wheel's angle follows the value (the shorter way round) and, when the input has `data-strata-unit`, its
 * `aria-valuetext`; a detented wheel (`.ug-jog-wheel--detented`) plays `tick` through `strataFeedback` once for each value change
 * (sound and haptics, both off unless the page or scope turns them on).
 */
import {
  angleDelta, coast, jogCount, jogDefaults, jogIndex, jogIndexOfSteps, jogLimit, jogSteps, jogStepAngle, jogAdvance, jogValueAt, jogWrap, pointerAngle, verticalAngle,
  type JogMotion, type JogRange, type JogTokens,
} from "../shared/jog-wheel.ts";
import { knobValueText } from "../shared/knob.ts";
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";

const jogInputs = ".ug-jog-wheel__input";

/** The native value setter: setting `value` through it is seen by framework value trackers (React's) as a user edit. */
const setNative = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value); else input.value = value;
};

function rangeOf(input: HTMLInputElement): Required<JogRange> {
  const min = Number.parseFloat(input.min), max = Number.parseFloat(input.max), step = Number.parseFloat(input.step);
  return { min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 100, step: step > 0 ? step : 1 };
}

/** The wheel's `jog.*` tokens as resolved on its root, so themes and scopes apply. */
function tokensOf(root: Element): JogTokens {
  const style = getComputedStyle(root);
  const read = (name: string, fallback: number) => { const value = Number.parseFloat(style.getPropertyValue(name)); return Number.isFinite(value) ? value : fallback; };
  return {
    turn: read("--strata-jog-turn", jogDefaults.turn), dragPx: read("--strata-jog-drag-px", jogDefaults.dragPx), fine: read("--strata-jog-fine", jogDefaults.fine),
    tapSlop: read("--strata-jog-tap-slop", jogDefaults.tapSlop), flick: read("--strata-jog-flick", jogDefaults.flick), maxRate: read("--strata-jog-max-rate", jogDefaults.maxRate),
  };
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const round2 = (value: number) => Math.round(value * 100) / 100;

/** The accumulated angle of each wheel, as the behaviour has it now (the DOM's `--strata-jog-angle` may be a step behind while the GPU draws a motion). */
const angles = new WeakMap<Element, number>();

/** The angle a wheel shows now (degrees, accumulated), as the behaviour keeps it, or undefined for a wheel it has not turned. */
export const liveStrataJog = (root: Element): number | undefined => angles.get(root);

/** The accumulated angle on a wheel's root: the one the behaviour keeps, or the inline `--strata-jog-angle`, or the computed one, or that of the value (a step each). */
function angleOf(root: HTMLElement, input: HTMLInputElement, turn: number): number {
  const kept = angles.get(root);
  if (kept !== undefined) return kept;
  const read = Number.parseFloat(root.style.getPropertyValue("--strata-jog-angle") || getComputedStyle(root).getPropertyValue("--strata-jog-angle"));
  return Number.isFinite(read) ? read : jogIndex(Number(input.value), rangeOf(input)) * jogStepAngle(turn);
}
/** Whether the GPU draws the wheel's dimple (the helper marks it), so the angle need not reach the DOM while it moves. */
const drawn = (root: HTMLElement) => root.querySelector(".ug-jog-wheel__dimple")?.hasAttribute("data-strata-dome") === true;
/**
 * Keeps a wheel's angle and shows it: in `--strata-jog-angle` for the CSS presentation, except for a `motion` (a drag move, a coasting
 * frame) of a wheel the GPU draws, which only wakes the helper (a bubbling event is no mutation, so nothing is recaptured).
 */
function writeAngle(root: HTMLElement, angle: number, motion = false, input?: HTMLInputElement) {
  const text = String(round2(angle));
  angles.set(root, Number(text));
  if (motion && drawn(root)) { (input ?? root).dispatchEvent(new CustomEvent("strata-jog-live", { bubbles: true })); return; }
  if (root.style.getPropertyValue("--strata-jog-angle") !== text) root.style.setProperty("--strata-jog-angle", text);
}
function writeText(input: HTMLInputElement) {
  const unit = input.getAttribute("data-strata-unit");
  if (unit === null) return;
  const text = knobValueText(Number(input.value), unit);
  if (input.getAttribute("aria-valuetext") !== text) input.setAttribute("aria-valuetext", text);
}

/** The wheels whose events the behaviour is dispatching itself (the angle already follows). */
const driving = new WeakSet<HTMLInputElement>();
/** The value each wheel's last `input` event left (a tick plays for a change). */
const seen = new WeakMap<HTMLInputElement, number>();

/** Sets the value to the one at `index` through the input and dispatches `input` when it changed. */
function setIndex(input: HTMLInputElement, index: number, own: boolean): boolean {
  const range = rangeOf(input), before = input.value;
  setNative(input, String(jogValueAt(index, range)));
  if (input.value === before) return false;
  if (own) driving.add(input);
  try { input.dispatchEvent(new Event("input", { bubbles: true })); } finally { if (own) driving.delete(input); }
  return true;
}
/** Sets a raw value (held to the range, snapped by the browser to `step`), dispatching `input` when it changed. */
function commit(input: HTMLInputElement, raw: number): boolean {
  const { min, max } = rangeOf(input), before = input.value;
  setNative(input, String(Math.min(max, Math.max(min, raw))));
  if (input.value === before) return false;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
const finish = (input: HTMLInputElement) => input.dispatchEvent(new Event("change", { bubbles: true }));
const wraps = (input: HTMLInputElement) => { const value = input.getAttribute("data-strata-wrap"); return value !== null && value !== "false"; };

/** Moves one native step (`dir` ±1), going round at the ends of a wrapping wheel; false at the end of one that does not. */
function stepBy(input: HTMLInputElement, dir: 1 | -1, own = false): boolean {
  const range = rangeOf(input), count = jogCount(range), index = jogIndex(Number(input.value), range);
  const next = wraps(input) ? jogWrap(index + dir, count) : Math.min(count - 1, Math.max(0, index + dir));
  return next !== index && setIndex(input, next, own);
}

/**
 * Brings a jog wheel's drawn state up to date with its input's value: the wheel's accumulated angle (`--strata-jog-angle` on the
 * `.ug-jog-wheel` root, advanced the shorter way round to the value) and, when the input names a unit (`data-strata-unit`), its
 * `aria-valuetext`. The behaviour does this on every `input` event; call it after setting `value` from script without one.
 */
export function syncStrataJogWheel(input: HTMLInputElement): void {
  const root = input.closest<HTMLElement>(".ug-jog-wheel");
  // A motion the GPU draws writes nothing to the DOM, `aria-valuetext` included (an attribute written inside the layer recaptures it); it is written when the wheel rests.
  if (!root || !driving.has(input) || !drawn(root)) writeText(input);
  if (!root || driving.has(input)) return;
  const range = rangeOf(input), turn = tokensOf(root).turn, wrap = wraps(input), angle = angleOf(root, input, turn);
  // Already on the value (a drag leaves the angle between steps): leave it be.
  if (jogIndexOfSteps(jogSteps(angle, jogStepAngle(turn)), jogCount(range), wrap) === jogIndex(Number(input.value), range)) return;
  writeAngle(root, jogAdvance(angle, Number(input.value), range, turn, wrap));
}

/** A drag: the wheel's angle from the press on, and the steps already applied. */
interface Gesture {
  input: HTMLInputElement; root: HTMLElement; x: number; y: number; cx: number; cy: number;
  /** The pointer's angle at its last move, the wheel's accumulated angle and the steps applied to the value. */
  last: number; lastY: number; angle: number; steps: number;
  moved: boolean; before: string; tokens: JogTokens; vertical: boolean; detented: boolean;
  /** The last moves, for the release speed. */
  samples: { time: number; angle: number }[];
}
/** A coasting wheel. */
interface Coasting { input: HTMLInputElement; root: HTMLElement; motion: JogMotion; steps: number; time: number; allowance: number; before: string; tokens: JogTokens; detented: boolean; frame: number }

const attached = new WeakSet<Document>();
/** The wheels coasting now, by input. */
const coasting = new Map<HTMLInputElement, Coasting>();

/** Where an angle puts the wheel: its steps, held to the ends of a wheel that does not wrap. */
function limits(input: HTMLInputElement, tokens: JogTokens) {
  const range = rangeOf(input), count = jogCount(range), stepAngle = jogStepAngle(tokens.turn), wrap = wraps(input);
  return { range, count, stepAngle, wrap, clamp: (angle: number) => (wrap ? angle : Math.min((count - 1) * stepAngle, Math.max(0, angle))) };
}

/**
 * Applies the steps between the steps already applied (`from`) and those the angle is at now: one native step and one `input`
 * event for each (more than `cap` at once go as a single jump). Returns the steps applied.
 */
function applySteps(input: HTMLInputElement, from: number, to: number, cap = 16): number {
  const count = jogCount(rangeOf(input)), wrap = wraps(input);
  if (to === from) return from;
  if (Math.abs(to - from) > cap) {
    setIndex(input, jogIndexOfSteps(to, count, wrap), true);
    return to;
  }
  const direction = to > from ? 1 : -1;
  let at = from;
  for (; at !== to; at += direction) if (!setIndex(input, jogIndexOfSteps(at + direction, count, wrap), true) && !wrap) break;
  return at;
}

function stopCoast(input: HTMLInputElement) {
  const run = coasting.get(input);
  if (!run) return;
  cancelAnimationFrame(run.frame);
  coasting.delete(input);
  writeAngle(run.root, run.detented ? run.steps * jogStepAngle(run.tokens.turn) : run.motion.a);
  writeText(input);
  if (input.value !== run.before) finish(input);
}

/**
 * Sets a jog wheel coasting from script at `velocity` degrees a second (clockwise positive), as a flick does: held to `jog.maxRate`
 * steps a second, slowed by `spring.jog`, and nothing under reduced motion. Returns whether it started.
 */
export function flingStrataJogWheel(input: HTMLInputElement, velocity: number): boolean {
  const root = input.closest<HTMLElement>(".ug-jog-wheel");
  if (!root || input.disabled || reduced() || !Number.isFinite(velocity) || velocity === 0) return false;
  stopCoast(input);
  const tokens = tokensOf(root), { stepAngle } = limits(input, tokens);
  const angle = angleOf(root, input, tokens.turn);
  const run: Coasting = { input, root, motion: { a: angle, v: jogLimit(velocity, stepAngle, tokens.maxRate) }, steps: jogSteps(angle, stepAngle), time: performance.now(), allowance: 0,
    before: input.value, tokens, detented: root.matches(".ug-jog-wheel--detented"), frame: 0 };
  coasting.set(input, run);
  run.frame = requestAnimationFrame(function tick(now) {
    if (!coasting.has(input)) return;
    if (!input.isConnected || input.disabled) { stopCoast(input); return; }
    const dt = Math.min(0.05, Math.max(0, (now - run.time) / 1000));
    run.time = now;
    const { clamp, stepAngle: unit } = limits(input, run.tokens);
    const rest = coast(run.motion, dt, unit, run.detented);
    const held = clamp(run.motion.a);
    // The ends of a wheel that does not wrap stop it.
    if (held !== run.motion.a) { run.motion.a = held; run.motion.v = 0; }
    const target = jogSteps(run.motion.a, unit);
    run.allowance += run.tokens.maxRate * dt;
    const room = Math.floor(run.allowance);
    const next = Math.abs(target - run.steps) <= room ? target : run.steps + Math.sign(target - run.steps) * room;
    run.allowance -= Math.abs(next - run.steps);
    run.steps = applySteps(input, run.steps, next, room || 1);
    writeAngle(run.root, run.detented ? run.steps * unit : run.motion.a, true, input);
    if ((rest || run.motion.v === 0) && run.steps === target) { stopCoast(input); return; }
    run.frame = requestAnimationFrame(tick);
  });
  return true;
}

/**
 * Runs every `.ug-jog-wheel` in `doc`, present and future, through delegated listeners (one of them the blocking document-level
 * wheel listener), once per document. `attachStrata` calls it; the React and Vue bindings call it when a jog wheel mounts.
 */
export function attachStrataJogWheels(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  const gestures = new Map<number, Gesture>();
  const wheelInput = (target: EventTarget | null) => {
    const input = (target as Element | null)?.closest?.(jogInputs);
    return input instanceof HTMLInputElement && input.type === "range" && !input.disabled ? input : undefined;
  };

  doc.addEventListener("pointerdown", event => {
    const input = wheelInput(event.target);
    const root = input?.closest<HTMLElement>(".ug-jog-wheel");
    if (!input || !root || event.button !== 0 || !event.isPrimary || event.defaultPrevented) return;
    // Cancelled: the browser would set the value from the pointer's x. Focus and the keyboard stay native.
    event.preventDefault();
    input.focus({ preventScroll: true });
    try { input.setPointerCapture(event.pointerId); } catch { /* the pointer is already gone */ }
    stopCoast(input);
    const tokens = tokensOf(root), box = input.getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const angle = angleOf(root, input, tokens.turn);
    gestures.set(event.pointerId, { input, root, x: event.clientX, y: event.clientY, cx, cy, last: pointerAngle(event.clientX - cx, event.clientY - cy), lastY: event.clientY, angle,
      steps: jogSteps(angle, jogStepAngle(tokens.turn)), moved: false, before: input.value, tokens, vertical: root.getAttribute("data-strata-drag") === "vertical", detented: root.matches(".ug-jog-wheel--detented"),
      samples: [{ time: event.timeStamp, angle }] });
  });
  // A touch drives a native range on its own (it sets the value from the touch's x, whatever the pointer events do):
  // cancelling `touchstart` leaves a touch to the pointer events above.
  doc.addEventListener("touchstart", event => { if (wheelInput(event.target)) event.preventDefault(); }, { passive: false });
  doc.addEventListener("pointermove", event => {
    const g = gestures.get(event.pointerId);
    if (!g) return;
    if (!g.moved && Math.hypot(event.clientX - g.x, event.clientY - g.y) < g.tokens.tapSlop) return;
    g.moved = true;
    const { clamp, stepAngle } = limits(g.input, g.tokens), fine = event.shiftKey ? g.tokens.fine : 1;
    if (g.vertical) {
      g.angle = clamp(verticalAngle(g.angle, event.clientY - g.lastY, { dragPx: g.tokens.dragPx, fine: g.tokens.fine, shift: event.shiftKey }));
      g.lastY = event.clientY;
    } else {
      const dx = event.clientX - g.cx, dy = event.clientY - g.cy;
      // Close to the centre the pointer's angle is meaningless: hold the wheel.
      if (Math.hypot(dx, dy) >= 6) {
        const now = pointerAngle(dx, dy);
        g.angle = clamp(g.angle + angleDelta(g.last, now) * fine);
        g.last = now;
      }
    }
    g.steps = applySteps(g.input, g.steps, jogSteps(g.angle, stepAngle));
    writeAngle(g.root, g.detented ? g.steps * stepAngle : g.angle, true, g.input);
    g.samples.push({ time: event.timeStamp, angle: g.angle });
    while (g.samples.length > 2 && event.timeStamp - g.samples[0]!.time > 100) g.samples.shift();
  });
  const end = (event: PointerEvent, cancelled: boolean) => {
    const g = gestures.get(event.pointerId);
    if (!g) return;
    gestures.delete(event.pointerId);
    const { input, root, moved, before } = g;
    if (cancelled) { if (moved) { writeAngle(root, g.detented ? g.steps * jogStepAngle(g.tokens.turn) : g.angle); writeText(input); } if (moved && input.value !== before) finish(input); return; }
    if (!moved) {
      // No drag: the single-pointer alternative. The upper half of the box steps up, the lower half down.
      const box = input.getBoundingClientRect();
      if (stepBy(input, event.clientY < box.top + box.height / 2 ? 1 : -1)) finish(input);
      return;
    }
    // A flick: the speed over the last 100 ms. Slower than `jog.flick`, or under reduced motion, the wheel stays where it was let go.
    const first = g.samples[0]!, last = g.samples[g.samples.length - 1]!;
    const seconds = Math.max(0.001, (last.time - first.time) / 1000), speed = (last.angle - first.angle) / seconds;
    const recent = event.timeStamp - last.time < 80;
    if (recent && Math.abs(speed) >= g.tokens.flick && flingStrataJogWheel(input, speed)) { const run = coasting.get(input); if (run) run.before = before; return; }
    writeAngle(root, g.detented ? g.steps * jogStepAngle(g.tokens.turn) : g.angle);
    writeText(input);
    if (input.value !== before) finish(input);
  };
  doc.addEventListener("pointerup", event => end(event, false));
  doc.addEventListener("pointercancel", event => end(event, true));

  doc.addEventListener("dblclick", event => {
    const input = wheelInput(event.target);
    if (!input) return;
    stopCoast(input);
    const value = Number.parseFloat(input.getAttribute("data-strata-default") ?? input.defaultValue);
    if (commit(input, Number.isFinite(value) ? value : rangeOf(input).min)) finish(input);
  });

  // Keys: native, except the ones that would go past an end of a wheel that wraps, which go round.
  doc.addEventListener("keydown", event => {
    const input = wheelInput(event.target);
    if (!input || !wraps(input) || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    stopCoast(input);
    const rtl = getComputedStyle(input).direction === "rtl";
    const up = event.key === "ArrowUp" || event.key === "PageUp" || event.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const down = event.key === "ArrowDown" || event.key === "PageDown" || event.key === (rtl ? "ArrowRight" : "ArrowLeft");
    if (!up && !down) return;
    const range = rangeOf(input), count = jogCount(range), index = jogIndex(Number(input.value), range);
    const atEnd = up ? index === count - 1 : index === 0;
    if (!atEnd || count < 2) return;
    event.preventDefault();
    if (setIndex(input, up ? 0 : count - 1, false)) finish(input);
  });

  // The wheel: notches up turn the wheel clockwise. Fine-grained wheels (touchpads) add up to a notch before stepping.
  let wheelTarget: HTMLInputElement | undefined, wheelSum = 0, wheelTime = 0;
  doc.addEventListener("wheel", event => {
    if (event.ctrlKey) return;
    const under = doc.elementFromPoint(event.clientX, event.clientY);
    const input = wheelInput(under?.closest(".ug-jog-wheel__dial")?.querySelector(jogInputs) ?? null);
    if (!input) return;
    event.preventDefault();
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1;
    const delta = (event.deltaY || event.deltaX) * scale;
    if (input !== wheelTarget || event.timeStamp - wheelTime > 400) wheelSum = 0;
    wheelTarget = input; wheelTime = event.timeStamp;
    wheelSum += delta;
    if (Math.abs(wheelSum) < 50) return;
    const direction = wheelSum < 0 ? 1 : -1;
    wheelSum = 0;
    stopCoast(input);
    if (stepBy(input, direction)) finish(input);
  }, { passive: false });

  // Keys, the wheel, taps and drags all end in an `input` event: the wheel follows the value. In the capture phase, so the
  // page's own listeners already see the new value text.
  doc.addEventListener("input", event => {
    const input = (event.target as Element | null)?.closest?.(jogInputs);
    if (!(input instanceof HTMLInputElement)) return;
    const value = Number(input.value), last = seen.get(input);
    seen.set(input, value);
    // A detented wheel ticks (feedback, off by default) for each change of the value: a step, or a jump of several, once.
    if (input.closest(".ug-jog-wheel")?.matches(".ug-jog-wheel--detented") && (last === undefined || last !== value)) strataFeedback(input, "tick");
    syncStrataJogWheel(input);
  }, true);
}
