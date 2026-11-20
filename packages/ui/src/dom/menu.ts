/**
 * Menu (anatomy page `menu.md`), the WAI-ARIA Menu Button pattern over the native Popover API. The browser toggles a
 * `.ug-menu` from its `popovertarget` button, closes it on Escape or a click outside and returns focus; this adds the
 * rest: focus moves to the first item on opening (the last when Up opened it), the arrow keys, Home, End and a typed
 * letter move between items, choosing an item closes the menu, Tab closes it, and a disabled item does nothing. One set
 * of document listeners (`attachStrataMenus`); `attachStrata` and the React and Vue bindings call it.
 */

import { acquireStrataDelegate, type StrataDelegateScope } from "./delegate.ts";

const item = "[role='menuitem']";

/** The menu's items, in order. */
function itemsOf(menu: Element): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(item)].filter(entry => entry.closest(".ug-menu") === menu && !entry.closest("[hidden]"));
}

/** The item `key` moves to from `from`, or undefined when it is not a menu key. */
export function strataMenuTarget(from: Element, key: string): HTMLElement | undefined {
  const menu = from.closest(".ug-menu");
  if (!menu) return undefined;
  const items = itemsOf(menu), at = items.indexOf(from as HTMLElement);
  if (!items.length) return undefined;
  if (key === "ArrowDown") return items[(at + 1) % items.length];
  if (key === "ArrowUp") return items[(at - 1 + items.length) % items.length];
  if (key === "Home") return items[0];
  if (key === "End") return items[items.length - 1];
  if (key.length === 1 && /\S/.test(key)) {
    const letter = key.toLocaleLowerCase();
    for (let step = 1; step <= items.length; step++) {
      const next = items[(at + step) % items.length]!;
      if ((next.textContent ?? "").trim().toLocaleLowerCase().startsWith(letter)) return next;
    }
  }
  return undefined;
}

/** The menu a button opens, if it opens one. */
function menuOf(button: Element): HTMLElement | null {
  const id = button.getAttribute("popovertarget");
  const menu = id ? button.ownerDocument.getElementById(id) : null;
  return menu?.matches(".ug-menu") ? menu : null;
}

/** Attaches the menu behaviour to `doc` once; later calls do nothing. */
export function attachStrataMenus(doc: Document = document): () => void {
  return acquireStrataDelegate(doc, installMenus);
}

function installMenus(doc: Document, scope: StrataDelegateScope): void {
  // Which item a menu focuses when it opens: the last when Up opened it, else the first.
  const openAt = new WeakMap<Element, "first" | "last">();
  scope.listen(doc, "keydown", event => {
    const target = event.target as Element | null;
    if (!target || event.altKey || event.ctrlKey || event.metaKey) return;
    const menu = target.closest?.(".ug-menu") as HTMLElement | null;
    if (!menu) {
      // On the button: Down and Up open the menu, at its first or last item.
      const opened = target.matches?.("button[popovertarget]") ? menuOf(target) : null;
      if (!opened || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
      event.preventDefault();
      openAt.set(opened, event.key === "ArrowUp" ? "last" : "first");
      // `source` makes the button the menu's anchor and the place focus returns to, as a click would.
      if (!opened.matches(":popover-open")) (opened.showPopover as (options?: { source?: HTMLElement }) => void).call(opened, { source: target as HTMLElement });
      return;
    }
    if (event.key === "Tab") { menu.hidePopover(); return; }
    const next = strataMenuTarget(target, event.key);
    if (next) { event.preventDefault(); next.focus(); }
  });
  scope.listen(doc, "toggle", event => {
    const menu = event.target as HTMLElement;
    if (!menu.matches?.(".ug-menu") || (event as ToggleEvent).newState !== "open") return;
    const items = itemsOf(menu);
    (openAt.get(menu) === "last" ? items[items.length - 1] : items[0])?.focus();
    openAt.delete(menu);
  }, true);
  // A disabled item does nothing: its click is stopped before any other listener sees it.
  scope.listen(doc, "click", event => {
    const entry = (event.target as Element | null)?.closest?.(`.ug-menu ${item}`);
    if (entry?.getAttribute("aria-disabled") === "true") { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  // After the item's own listeners: choosing it closes the menu (focus returns to the button) and is reported.
  scope.listen(doc, "click", event => {
    const entry = (event.target as Element | null)?.closest?.<HTMLElement>(`.ug-menu ${item}`);
    const menu = entry?.closest<HTMLElement>(".ug-menu");
    if (!entry || !menu) return;
    entry.dispatchEvent(new CustomEvent("strata-select", { bubbles: true, detail: { index: itemsOf(menu).indexOf(entry) } }));
    if (menu.matches(":popover-open")) menu.hidePopover();
  });
}
