/**
 * TreeView (anatomy page `tree-view.md`), the WAI-ARIA Tree View pattern: one tab stop (a roving `tabindex`), and the
 * item each key moves to, opens, closes or selects. `strataTreeAction` decides; `attachStrataTrees` applies it to the
 * markup for plain HTML and Astro (through `attachStrata`), while the React and Vue bindings apply it to their state.
 */

import { acquireStrataDelegate, type StrataDelegateScope } from "./delegate.ts";

const item = "[role='treeitem']";

/** The tree's items that are shown: those with no closed parent item. */
export function visibleStrataTreeItems(tree: Element): HTMLElement[] {
  return [...tree.querySelectorAll<HTMLElement>(item)].filter(entry => {
    for (let parent = entry.parentElement?.closest<HTMLElement>(item); parent && tree.contains(parent); parent = parent.parentElement?.closest<HTMLElement>(item)) {
      if (parent.getAttribute("aria-expanded") !== "true") return false;
    }
    return true;
  });
}

/** The item a tree's tab stop belongs on: the selected item when it is shown, else the first item. */
export function strataTreeTabStop(tree: Element): HTMLElement | undefined {
  const shown = visibleStrataTreeItems(tree);
  return shown.find(entry => entry.getAttribute("aria-selected") === "true") ?? shown[0];
}

/** Makes `current` the tree's one tab stop: `tabindex="0"` on it, and `-1` on every other item. */
export function rovingStrataTree(tree: Element, current: Element): void {
  for (const entry of tree.querySelectorAll(item)) entry.setAttribute("tabindex", entry === current ? "0" : "-1");
}

/** What a key does: an item to focus, an item to open or close, or an item to select. */
export interface StrataTreeAction {
  focus?: HTMLElement;
  expand?: { item: HTMLElement; open: boolean };
  select?: HTMLElement;
}

/** What `key` does on the focused `entry`, by the pattern; undefined when it is not a tree key. */
export function strataTreeAction(entry: HTMLElement, key: string): StrataTreeAction | undefined {
  const tree = entry.closest("[role='tree']");
  if (!tree) return undefined;
  const shown = visibleStrataTreeItems(tree), at = shown.indexOf(entry);
  const rtl = getComputedStyle(tree).direction === "rtl";
  const inward = rtl ? "ArrowLeft" : "ArrowRight", outward = rtl ? "ArrowRight" : "ArrowLeft";
  const parent = entry.hasAttribute("aria-expanded"), open = entry.getAttribute("aria-expanded") === "true";
  switch (key) {
    case "ArrowDown": return shown[at + 1] ? { focus: shown[at + 1] } : {};
    case "ArrowUp": return shown[at - 1] ? { focus: shown[at - 1] } : {};
    case "Home": return { focus: shown[0] };
    case "End": return { focus: shown[shown.length - 1] };
    case inward:
      if (parent && !open) return { expand: { item: entry, open: true } };
      if (parent && open) { const child = entry.querySelector<HTMLElement>(`:scope > [role='group'] > ${item}`); return child ? { focus: child } : {}; }
      return {};
    case outward: {
      if (parent && open) return { expand: { item: entry, open: false } };
      const up = entry.parentElement?.closest<HTMLElement>(item);
      return up && tree.contains(up) ? { focus: up } : {};
    }
    case "Enter":
    case " ":
      return { select: entry };
    default:
      return undefined;
  }
}

/**
 * Runs every `.ug-tree` in `doc` from its markup, once: keys and clicks move the tab stop, set `aria-expanded` and
 * `aria-selected`, and dispatch `strata-expand` (`detail.open`) and `strata-select` from the item.
 */
export function attachStrataTrees(doc: Document = document): () => void {
  return acquireStrataDelegate(doc, installTrees);
}

function installTrees(doc: Document, scope: StrataDelegateScope): void {
  const apply = (action: StrataTreeAction) => {
    if (action.expand) {
      action.expand.item.setAttribute("aria-expanded", String(action.expand.open));
      action.expand.item.dispatchEvent(new CustomEvent("strata-expand", { bubbles: true, detail: { open: action.expand.open } }));
    }
    if (action.select) {
      const tree = action.select.closest("[role='tree']")!;
      for (const entry of tree.querySelectorAll(item)) entry.setAttribute("aria-selected", String(entry === action.select));
      action.select.dispatchEvent(new CustomEvent("strata-select", { bubbles: true }));
    }
    const focus = action.focus ?? action.select;
    if (focus) { rovingStrataTree(focus.closest("[role='tree']")!, focus); focus.focus(); }
  };
  scope.listen(doc, "keydown", event => {
    const entry = (event.target as Element | null)?.closest?.<HTMLElement>(`.ug-tree ${item}`);
    if (!entry || event.target !== entry || event.altKey || event.ctrlKey || event.metaKey) return;
    const action = strataTreeAction(entry, event.key);
    if (!action) return;
    event.preventDefault();
    apply(action);
  });
  scope.listen(doc, "click", event => {
    const target = event.target as Element | null;
    const row = target?.closest?.(".ug-tree .ug-tree__row");
    const entry = row?.parentElement;
    if (!row || !entry?.matches(item)) return;
    if (target!.closest(".ug-tree__toggle")) apply({ expand: { item: entry, open: entry.getAttribute("aria-expanded") !== "true" }, focus: entry });
    else apply({ select: entry });
  });
  // A tree's first tab stop, before any key: the selected item, or the first.
  scope.listen(doc, "focusin", event => {
    const tree = (event.target as Element | null)?.closest?.(".ug-tree");
    if (tree && !tree.querySelector(`${item}[tabindex='0']`)) { const stop = strataTreeTabStop(tree); if (stop) rovingStrataTree(tree, stop); }
  });
}
