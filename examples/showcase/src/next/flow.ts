/**
 * What both paths of the preview home page share (`gpu.tsx`, `dom.tsx`): which section is in the window in the flow,
 * the side scale's mark for it, and the readout's note.
 */
import { sections } from "./page";

export const ids: readonly string[] = sections.map(section => section.id);

/** The section in the middle of the window, in the flow. */
export function flowIndex() {
  const middle = innerHeight / 2;
  let best = 0, distance = Infinity;
  ids.forEach((id, index) => {
    const box = document.getElementById(id)!.getBoundingClientRect();
    const away = middle < box.top ? box.top - middle : middle > box.bottom ? middle - box.bottom : 0;
    if (away < distance) { distance = away; best = index; }
  });
  return best;
}

const marks = ids.map(id => document.querySelector<HTMLAnchorElement>(`.rail a[href="#${id}"]`));
/** Marks section `current` on the side scale. */
export function markRail(current: number) {
  marks.forEach((mark, index) => { if (index === current) mark?.setAttribute("aria-current", "true"); else mark?.removeAttribute("aria-current"); });
}

/** Says, for a screen reader and as the switch's tooltip, why the stage is ordinary DOM (an empty string when it is not). */
export function note(message: string) {
  const element = document.getElementById("deck-note")!;
  if (element.textContent !== message) element.textContent = message;
}

const backdrop = document.getElementById("backdrop");
let travelled = -1, held: number | null = null;
/** How far down the page a scroll offset is: 0 at the top of the page, 1 at its end. */
export function travelAt(top: number) {
  const range = document.documentElement.scrollHeight - innerHeight;
  return range > 0 ? Math.min(1, Math.max(0, top / range)) : 0;
}
/** Moves the background's rings with the page, or to a held value. Only the backdrop's own style changes. */
export function travel() {
  const now = Math.round((held ?? travelAt(scrollY)) * 1000) / 1000;
  if (now !== travelled) backdrop?.style.setProperty("--travel", String(travelled = now));
}
/** Holds the rings at `value` whatever the scroll position (a jump moves them on the clock), or with null lets them follow it again. */
export function holdTravel(value: number | null) { held = value; travel(); }
export const travelNow = () => Math.max(0, travelled);
let travelFrame = 0;
addEventListener("scroll", () => { travelFrame ||= requestAnimationFrame(() => { travelFrame = 0; travel(); }); }, { passive: true });
addEventListener("resize", () => { travelFrame ||= requestAnimationFrame(() => { travelFrame = 0; travel(); }); });
travel();
