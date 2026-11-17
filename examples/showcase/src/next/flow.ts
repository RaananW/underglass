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
