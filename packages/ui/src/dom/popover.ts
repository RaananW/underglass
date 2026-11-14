/**
 * Popover (anatomy page `popover.md`) and Menu placement. CSS anchor positioning places a `.ug-popover` or `.ug-menu` below the button that
 * opens it (its implicit anchor). When that button is inside an Underglass layer, it is laid out inside the output
 * `<canvas>` (HTML-in-Canvas `content="drawable"`), where anchor positioning does not follow the layer's drawn place
 * (Canary 158.0.8109.0: the popover lands offset by the layer's position). Such a popover is placed with script instead,
 * from the button's box, and follows scrolling and resizing. One delegated listener per document
 * (`attachStrataPopovers`); `attachStrata` and the React and Vue bindings call it.
 */

const gap = 4, margin = 4;
const attached = new WeakSet<Document>();

/** The button that opened `popover`: the source of its toggle, or the first `[popovertarget]` naming it. */
function invokerOf(popover: HTMLElement): HTMLElement | null {
  return popover.ownerDocument.querySelector<HTMLElement>(`[popovertarget="${CSS.escape(popover.id)}"]`);
}

/** Places `popover` below `invoker` (above when there is no room, or preferred), inside the viewport. */
export function placeStrataPopover(popover: HTMLElement, invoker: HTMLElement): void {
  popover.setAttribute("data-strata-anchor", "script");
  const anchor = invoker.getBoundingClientRect(), box = popover.getBoundingClientRect();
  const view = popover.ownerDocument.documentElement;
  const roomBelow = view.clientHeight - anchor.bottom - gap - margin >= box.height;
  const above = popover.getAttribute("data-strata-placement") === "top" ? anchor.top - gap - box.height >= margin : !roomBelow;
  const top = above ? anchor.top - gap - box.height : Math.min(anchor.bottom + gap, view.clientHeight - box.height - margin);
  const left = Math.min(Math.max(anchor.left, margin), view.clientWidth - box.width - margin);
  popover.style.top = `${Math.round(top)}px`;
  popover.style.left = `${Math.round(left)}px`;
}

/** Attaches popover placement to `doc` once; later calls do nothing. */
export function attachStrataPopovers(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  const scripted = new Map<HTMLElement, HTMLElement>();
  doc.addEventListener("toggle", event => {
    const popover = event.target as HTMLElement;
    if (!popover.matches?.(".ug-popover, .ug-menu")) return;
    if ((event as ToggleEvent).newState !== "open") { scripted.delete(popover); return; }
    const invoker = invokerOf(popover);
    if (invoker?.closest("canvas")) { scripted.set(popover, invoker); placeStrataPopover(popover, invoker); }
    else { popover.removeAttribute("data-strata-anchor"); popover.style.removeProperty("top"); popover.style.removeProperty("left"); }
  }, true);
  const follow = () => { for (const [popover, invoker] of scripted) if (popover.matches(":popover-open")) placeStrataPopover(popover, invoker); };
  doc.defaultView?.addEventListener("scroll", follow, { capture: true, passive: true });
  doc.defaultView?.addEventListener("resize", follow);
}
