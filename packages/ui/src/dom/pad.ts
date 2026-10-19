/**
 * Pad (anatomy page `pad.md`) and the grid pattern the Pad and the Keypad share: the behaviour a `button.ug-pad` adds to the native
 * `<button>`, for plain HTML, Astro and the React and Vue bindings alike.
 * - **Held:** `data-strata-down` is `"true"` from the pointer going down on the pad, or Space or Enter going down on it, to the pointer
 *   going up anywhere, the key going up, the pointer being cancelled, the pad losing focus or the page being hidden, and `"false"` after
 *   that (it overrides a `:active` a touch can leave behind; with no script `:active` is the held state). A held pad is lit and its cap
 *   down; a latching pad's cap rests at 0.45 of the travel while latched (`aria-pressed`). The click is the native one, so a form or a
 *   listener sees an ordinary button; Enter and Space both activate it.
 * - **Velocity (optional):** at each press `data-strata-velocity` is set to a 0–1 number (`shared/pad.ts`, `padVelocity`: the pointer's
 *   pressure where the hardware reports it, else where on the cap the press lands, the keys 1) and a bubbling `strata-pad-velocity`
 *   event carries `{ velocity, source }`, before the click. Nothing depends on it.
 * - **Latching (plain DOM only):** `attachStrataPadLatches` toggles `aria-pressed` on a click and reports `strata-pressed-change`, as
 *   the ToggleButton's. The React and Vue bindings keep the state themselves.
 * - **Disabled:** a `disabled` or `aria-disabled` pad is never held and never lit; a click on an `aria-disabled` one is stopped before any other listener sees it.
 * - **Feedback:** a pad plays `click` as it goes down, once per press, where feedback is on (`dom/feedback.ts`, off by default).
 * - **Grid pattern:** in a `.ug-pad-grid` (and a keypad's plinth) the controls are one tab stop (a roving tabindex, applied the first
 *   time focus enters), and the arrow keys move one control along the row or one row along the column, Home and End to the ends of the
 *   row, Control+Home and Control+End to the ends of the grid; nothing wraps.
 * Every listener is delegated and passive except the grid's keys, which cancel only the keys they move focus with.
 */
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";
import { gridTarget, padVelocity } from "../shared/pad.ts";

/** The detail of a `strata-pad-velocity` event. */
export interface PadVelocity {
  velocity: number;
  source: "pressure" | "position" | "keyboard";
}

const pads = "button.ug-pad";
const grids = ".ug-pad-grid, .ug-keypad__plinth";
const controls = "button.ug-pad, button.ug-keypad__key";

/** The enabled button of `selector` around `target`. */
function buttonOf(target: EventTarget | null, selector: string): HTMLButtonElement | undefined {
  const button = (target as Element | null)?.closest?.(selector);
  return button instanceof HTMLButtonElement && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : undefined;
}

const held = new WeakMap<Document, Set<string>>();

/**
 * Holds every enabled button of `selector` in `doc` down (`data-strata-down`) while it is pressed, through delegated listeners, once per
 * document and selector, and plays `click` as it goes down. `down` runs as a button goes down, with the event that did it.
 */
export function attachStrataHeldButtons(doc: Document, selector: string, down?: (button: HTMLButtonElement, event: PointerEvent | KeyboardEvent) => void): void {
  const done = held.get(doc) ?? new Set<string>();
  held.set(doc, done);
  if (done.has(selector)) return;
  done.add(selector);
  listenForStrataFeedback(doc);
  // A click on an `aria-disabled` button is stopped before any other listener sees it, so it stays focusable without activating.
  doc.addEventListener("click", event => {
    const blocked = (event.target as Element | null)?.closest?.(selector);
    if (blocked?.getAttribute("aria-disabled") === "true") { event.preventDefault(); event.stopImmediatePropagation(); }
  }, { capture: true });
  /** The pointers holding a button down, and the keys. */
  const pointers = new Map<number, HTMLButtonElement>(), keys = new Map<HTMLButtonElement, string>();
  const isHeld = (button: HTMLButtonElement) => keys.has(button) || [...pointers.values()].includes(button);
  const set = (button: HTMLButtonElement, on: boolean, event?: PointerEvent | KeyboardEvent) => {
    if ((button.getAttribute("data-strata-down") === "true") === on) return;
    // Released is `"false"`, not absent: a touch can leave Chrome's `:active` on the button after it ends, and `"false"` overrides it.
    if (on && event) down?.(button, event);
    button.setAttribute("data-strata-down", String(on));
    if (on) strataFeedback(button, "click");
  };
  const releaseAll = () => {
    const buttons = new Set([...pointers.values(), ...keys.keys()]);
    pointers.clear(); keys.clear();
    for (const button of buttons) set(button, false);
  };
  doc.addEventListener("pointerdown", event => {
    const button = event.button === 0 && event.isPrimary ? buttonOf(event.target, selector) : undefined;
    if (!button) return;
    pointers.set(event.pointerId, button);
    set(button, true, event);
  }, { capture: true, passive: true });
  const up = (event: PointerEvent) => {
    const button = pointers.get(event.pointerId);
    pointers.delete(event.pointerId);
    if (button && !isHeld(button)) set(button, false);
  };
  doc.addEventListener("pointerup", up, { capture: true, passive: true });
  doc.addEventListener("pointercancel", up, { capture: true, passive: true });
  doc.addEventListener("keydown", event => {
    const button = event.target instanceof HTMLButtonElement ? buttonOf(event.target, selector) : undefined;
    if (!button || event.repeat || (event.key !== " " && event.key !== "Enter")) return;
    keys.set(button, event.key);
    set(button, true, event);
  }, { capture: true, passive: true });
  doc.addEventListener("keyup", event => {
    const button = event.target instanceof HTMLButtonElement ? event.target : undefined;
    if (!button || !keys.has(button) || (event.key !== " " && event.key !== "Enter")) return;
    keys.delete(button);
    if (!isHeld(button)) set(button, false);
  }, { capture: true, passive: true });
  // A button that loses focus, or a page that is hidden, lets go.
  doc.addEventListener("focusout", event => {
    const button = event.target instanceof HTMLButtonElement ? event.target : undefined;
    if (!button?.matches(selector)) return;
    keys.delete(button);
    if (!isHeld(button)) set(button, false);
  }, { capture: true, passive: true });
  doc.addEventListener("visibilitychange", () => { if (doc.visibilityState === "hidden") releaseAll(); }, { passive: true });
}

/** The controls of a grid that focus can move to, in document order: not disabled, not hidden. */
function controlsOf(grid: Element): HTMLButtonElement[] {
  return [...grid.querySelectorAll<HTMLButtonElement>(controls)].filter(control => control.closest(grids) === grid && !control.closest("[hidden]"));
}

/** The number of columns a grid lays out, from its resolved tracks. */
function columnsOf(grid: Element): number {
  const tracks = getComputedStyle(grid).gridTemplateColumns;
  return tracks && tracks !== "none" ? tracks.trim().split(/\s+/).length : 1;
}

/** Makes `current` the grid's one tab stop: `tabindex="0"` on it, and `-1` on every other enabled control. */
export function rovingStrataGrid(grid: Element, current: Element): void {
  for (const control of controlsOf(grid)) if (!control.disabled) control.setAttribute("tabindex", control === current ? "0" : "-1");
}

/**
 * The control that `key` moves focus to from `from`, or undefined when the key is not a grid key, belongs to a modified shortcut, or
 * nothing enabled lies that way (`gridTarget` in `shared/pad.ts` has the rules).
 */
export function strataGridTarget(from: Element, key: string, ctrl = false): HTMLButtonElement | undefined {
  const grid = from.closest(grids), control = from.closest(controls);
  if (!grid || !control) return undefined;
  const all = controlsOf(grid), at = all.indexOf(control as HTMLButtonElement);
  if (at < 0) return undefined;
  const target = gridTarget(at, key, { columns: columnsOf(grid), count: all.length, rtl: getComputedStyle(grid).direction === "rtl", enabled: index => !all[index]!.disabled }, ctrl);
  return target === undefined ? undefined : all[target];
}

const gridded = new WeakSet<Document>();

/** Runs the grid pattern for every `.ug-pad-grid` and keypad plinth in `doc`, present and future, once per document. */
export function attachStrataGrids(doc: Document = document): void {
  if (gridded.has(doc)) return;
  gridded.add(doc);
  doc.addEventListener("focusin", event => {
    const control = (event.target as Element | null)?.closest?.(controls), grid = control?.closest(grids);
    if (control && grid) rovingStrataGrid(grid, control);
  }, { passive: true });
  doc.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.altKey || event.metaKey || event.shiftKey) return;
    const from = event.target instanceof Element ? event.target.closest(controls) : null;
    if (!from || (event.ctrlKey && event.key !== "Home" && event.key !== "End")) return;
    const target = strataGridTarget(from, event.key, event.ctrlKey);
    if (!target) {
      // The key is a grid key even where nothing lies that way: it does not scroll the page.
      if (/^Arrow(Left|Right|Up|Down)$|^(Home|End)$/.test(event.key) && from.closest(grids)) event.preventDefault();
      return;
    }
    event.preventDefault();
    target.focus();
  });
}

/** The press's velocity, 0–1, written where the pad keeps it, and announced. */
function reportVelocity(button: HTMLButtonElement, event: PointerEvent | KeyboardEvent) {
  const cap = button.querySelector(".ug-pad__cap") ?? button, box = cap.getBoundingClientRect();
  const press = event instanceof PointerEvent ? padVelocity({ pointerType: event.pointerType, pressure: event.pressure, x: event.clientX, y: event.clientY, box }) : padVelocity({});
  button.setAttribute("data-strata-velocity", String(press.velocity));
  button.dispatchEvent(new CustomEvent<PadVelocity>("strata-pad-velocity", { bubbles: true, detail: press }));
}

/**
 * Runs every `button.ug-pad` in `doc`, present and future, through delegated listeners, once per document, with the grid pattern for
 * the pads in a grid. `attachStrata` calls it; the React and Vue bindings call it when a pad mounts.
 */
export function attachStrataPads(doc: Document = document): void {
  attachStrataHeldButtons(doc, pads, reportVelocity);
  attachStrataGrids(doc);
}

const latched = new WeakSet<Document>();

/**
 * Toggles `aria-pressed` on a click on a latching `button.ug-pad[aria-pressed]` and dispatches a bubbling `strata-pressed-change` with
 * `{ pressed }`, once per document. `attachStrata` calls it, for markup without a binding; the React and Vue bindings keep a pad's state
 * themselves and never call it.
 */
export function attachStrataPadLatches(doc: Document = document): void {
  if (latched.has(doc)) return;
  latched.add(doc);
  doc.addEventListener("click", event => {
    const button = (event.target as Element | null)?.closest?.("button.ug-pad[aria-pressed]") as HTMLButtonElement | null;
    if (!button || event.defaultPrevented || button.disabled || button.getAttribute("aria-disabled") === "true") return;
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    button.dispatchEvent(new CustomEvent("strata-pressed-change", { bubbles: true, detail: { pressed } }));
  });
}
