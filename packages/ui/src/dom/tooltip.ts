/**
 * Tooltip (anatomy page `tooltip.md`), the WAI-ARIA Tooltip pattern: a `.ug-tooltip` (`role="tooltip"`,
 * `popover="manual"`) named by a trigger's `aria-describedby` is shown 300 ms after the pointer rests on the trigger or
 * at once on keyboard focus, placed beside the trigger in the viewport, kept while the pointer is on the trigger or
 * the tooltip (WCAG 1.4.13), and hidden when both are left, focus leaves, or Escape is pressed. One delegated set of
 * listeners per document (`attachStrataTooltips`); `attachStrata` and the React and Vue bindings call it.
 */

import { acquireStrataDelegate, type StrataDelegateScope } from "./delegate.ts";

const showDelay = 300, hideDelay = 100, gap = 8, margin = 4;

interface TipState { hovered: boolean; focused: boolean; timer?: ReturnType<typeof setTimeout>; trigger?: HTMLElement }
const states = new WeakMap<HTMLElement, TipState>();
const stateOf = (tip: HTMLElement) => { let state = states.get(tip); if (!state) states.set(tip, state = { hovered: false, focused: false }); return state; };

/** The tooltip a trigger is described by, if any. */
function tooltipOf(trigger: Element): HTMLElement | undefined {
  for (const id of (trigger.getAttribute("aria-describedby") ?? "").split(/\s+/)) {
    const tip = id ? trigger.ownerDocument.getElementById(id) : null;
    if (tip?.matches(".ug-tooltip[role='tooltip']")) return tip;
  }
  return undefined;
}
const triggerFrom = (target: EventTarget | null) => (target as Element | null)?.closest?.<HTMLElement>("[aria-describedby]") ?? undefined;

/** Places the open tooltip above its trigger (below when there is no room, or preferred), inside the viewport. */
function place(tip: HTMLElement, trigger: HTMLElement) {
  const anchor = trigger.getBoundingClientRect(), box = tip.getBoundingClientRect();
  const view = trigger.ownerDocument.documentElement;
  const below = tip.getAttribute("data-strata-placement") === "bottom" || anchor.top - box.height - gap < margin;
  const top = below ? Math.min(anchor.bottom + gap, view.clientHeight - box.height - margin) : anchor.top - box.height - gap;
  const left = Math.min(Math.max(anchor.left + anchor.width / 2 - box.width / 2, margin), view.clientWidth - box.width - margin);
  tip.style.top = `${Math.round(top)}px`;
  tip.style.left = `${Math.round(left)}px`;
  tip.toggleAttribute("data-strata-below", below);
}

/** Shows `tip` for `trigger` now. */
export function showStrataTooltip(trigger: HTMLElement, tip: HTMLElement): void {
  const state = stateOf(tip);
  clearTimeout(state.timer);
  state.trigger = trigger;
  if (!tip.matches(":popover-open")) tip.showPopover();
  place(tip, trigger);
}

/** Hides `tip` now. */
export function hideStrataTooltip(tip: HTMLElement): void {
  const state = stateOf(tip);
  clearTimeout(state.timer);
  state.hovered = state.focused = false;
  if (tip.matches(":popover-open")) tip.hidePopover();
}

/** Shows or hides after `delay`, from the hover and focus state. */
function settle(tip: HTMLElement, trigger: HTMLElement | undefined, delay: number) {
  const state = stateOf(tip);
  clearTimeout(state.timer);
  const open = state.hovered || state.focused;
  if (open === tip.matches(":popover-open") && (!open || state.trigger === trigger)) return;
  state.timer = setTimeout(() => {
    if (stateOf(tip).hovered || stateOf(tip).focused) showStrataTooltip(trigger ?? state.trigger!, tip);
    else if (tip.matches(":popover-open")) tip.hidePopover();
  }, delay);
}

/** Attaches the tooltip behaviour to `doc` once; later calls do nothing. */
export function attachStrataTooltips(doc: Document = document): () => void {
  return acquireStrataDelegate(doc, installTooltips);
}

function installTooltips(doc: Document, scope: StrataDelegateScope): void {
  scope.listen(doc, "pointerover", event => {
    const target = event.target as Element | null;
    const hoveredTip = target?.closest?.<HTMLElement>(".ug-tooltip");
    if (hoveredTip) { stateOf(hoveredTip).hovered = true; settle(hoveredTip, stateOf(hoveredTip).trigger, 0); return; }
    const trigger = triggerFrom(target), tip = trigger && tooltipOf(trigger);
    if (!trigger || !tip) return;
    stateOf(tip).hovered = true;
    settle(tip, trigger, tip.matches(":popover-open") ? 0 : showDelay);
  });
  scope.listen(doc, "pointerout", event => {
    const from = event.target as Element | null, to = event.relatedTarget as Element | null;
    const tip = from?.closest?.<HTMLElement>(".ug-tooltip") ?? (triggerFrom(from) && tooltipOf(triggerFrom(from)!));
    if (!tip) return;
    // Still on the trigger or the tooltip: nothing changes.
    const trigger = stateOf(tip).trigger ?? triggerFrom(from);
    if (to && (tip.contains(to) || trigger?.contains(to))) return;
    stateOf(tip).hovered = false;
    settle(tip, trigger, hideDelay);
  });
  scope.listen(doc, "focusin", event => {
    const trigger = triggerFrom(event.target), tip = trigger && tooltipOf(trigger);
    if (!trigger || !tip || !trigger.matches(":focus-visible")) return;
    stateOf(tip).focused = true;
    showStrataTooltip(trigger, tip);
  });
  scope.listen(doc, "focusout", event => {
    const trigger = triggerFrom(event.target), tip = trigger && tooltipOf(trigger);
    if (!tip) return;
    stateOf(tip).focused = false;
    settle(tip, trigger, 0);
  });
  scope.listen(doc, "keydown", event => {
    if (event.key !== "Escape") return;
    for (const tip of doc.querySelectorAll<HTMLElement>(".ug-tooltip:popover-open")) hideStrataTooltip(tip);
  });
  // A scroll or resize moves the trigger: an open tooltip follows it.
  const follow = () => { for (const tip of doc.querySelectorAll<HTMLElement>(".ug-tooltip:popover-open")) { const trigger = stateOf(tip).trigger; if (trigger) place(tip, trigger); } };
  const view = doc.defaultView;
  if (view) {
    scope.listen(view, "scroll", follow, { capture: true, passive: true });
    scope.listen(view, "resize", follow);
  }
  // The listeners that would hide an open tooltip are gone: hide them now, and drop their pending timers.
  scope.onRelease(() => { for (const tip of doc.querySelectorAll<HTMLElement>(".ug-tooltip")) if (states.has(tip)) hideStrataTooltip(tip); });
}
