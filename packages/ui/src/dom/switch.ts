/**
 * Switch forms (anatomy page `switch.md`, *Forms*; design language section 12, *Snaps*): the behaviour a hardware form
 * adds to the native `<input type="checkbox" role="switch">`, for plain HTML, Astro and the React and Vue bindings
 * alike. The input is a transparent box over the object's whole travel, so the browser does nearly everything:
 * - **Click anywhere** on the object is a click on the input: the native toggle. Space toggles, as native; Enter does
 *   not, as on the plain switch. The label row toggles it too.
 * - **Drag past centre:** a press that moves more than `switchTapSlop` px throws the switch only if it is released past
 *   the box's centre on the other stop's side (right for a slide, up for the others to turn it on); a drag that stays
 *   on its own side leaves it where it was, as a lever springs back short of centre. The change is the native one, a
 *   click on the input, so `input` and `change` fire as usual and the state changes once; the throw itself (the snap)
 *   is visual, the CSS transition on `--strata-switch-t`.
 * - **Feedback:** every throw plays `snap` and pulses where feedback is on (`dom/feedback.ts`), off by default.
 * Every listener is delegated. The one event it stops is the click a drag ends with when it was held short of centre
 * (stopped at the document in the capture phase, so no framework sees a toggle that did not happen); nothing else on
 * the native event path is blocked or changed.
 */
import { listenForStrataFeedback, strataFeedback } from "./feedback.ts";

const formInputs = ".ug-switch[data-strata-form] > .ug-switch__input";
/** A press that moves less than this, in px, is a click. */
export const switchTapSlop = 4;

interface Press { input: HTMLInputElement; x: number; y: number; moved: boolean; checked: boolean; decision?: "throw" | "hold"; clicked?: boolean }

/** Whether a press released at (`x`, `y`) has crossed the box's centre towards the other stop of a switch now `checked`. */
export function pastCentre(form: string | null, box: { left: number; top: number; width: number; height: number }, x: number, y: number, checked: boolean): boolean {
  if (form === "slide") { const centre = box.left + box.width / 2; return checked ? x < centre : x > centre; }
  const centre = box.top + box.height / 2;
  return checked ? y > centre : y < centre;
}

const attached = new WeakSet<Document>();

/**
 * Runs every `.ug-switch[data-strata-form]` in `doc`, present and future, through delegated listeners, once per
 * document. `attachStrata` calls it; the React and Vue bindings call it when a form switch mounts.
 */
export function attachStrataSwitches(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  listenForStrataFeedback(doc);
  const presses = new Map<number, Press>();
  let ended: Press | undefined;
  const formInput = (target: EventTarget | null) => {
    const input = (target as Element | null)?.closest?.(formInputs);
    return input instanceof HTMLInputElement && !input.disabled ? input : undefined;
  };

  doc.addEventListener("pointerdown", event => {
    const input = formInput(event.target);
    if (!input || event.button !== 0 || !event.isPrimary) return;
    presses.set(event.pointerId, { input, x: event.clientX, y: event.clientY, moved: false, checked: input.checked });
    // Keep the drag on the input when it leaves the box, so its release (and the click) still reach it.
    try { input.setPointerCapture(event.pointerId); } catch { /* not capturable: the release may land elsewhere */ }
  });
  doc.addEventListener("pointermove", event => {
    const press = presses.get(event.pointerId);
    if (press && !press.moved && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= switchTapSlop) press.moved = true;
  });
  doc.addEventListener("pointerup", event => {
    const press = presses.get(event.pointerId);
    presses.delete(event.pointerId);
    if (!press || !press.moved) return;
    const form = press.input.closest(".ug-switch")?.getAttribute("data-strata-form") ?? null;
    press.decision = pastCentre(form, press.input.getBoundingClientRect(), event.clientX, event.clientY, press.checked) ? "throw" : "hold";
    ended = press;
    // A drag may end with no click (a touch drag never makes one): a throw then clicks the input itself, once.
    setTimeout(() => {
      if (ended === press) ended = undefined;
      if (press.decision === "throw" && !press.clicked && press.input.checked === press.checked && !press.input.disabled) press.input.click();
    }, 0);
  });
  doc.addEventListener("pointercancel", event => { presses.delete(event.pointerId); });
  // The click a drag ends with: a throw lets the native toggle happen, a hold cancels it (the checkbox stays as it was).
  doc.addEventListener("click", event => {
    const input = formInput(event.target);
    const press = ended;
    if (!input || !press || press.input !== input) return;
    press.clicked = true;
    ended = undefined;
    // A held lever is not an activation: nothing else sees this click, and the checkbox stays as it was.
    if (press.decision === "hold") { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  doc.addEventListener("change", event => {
    const input = (event.target as Element | null)?.closest?.(formInputs);
    if (input) strataFeedback(input, "snap");
  });
}
