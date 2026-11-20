/**
 * Menu (anatomy page `menu.md`), the WAI-ARIA Menu Button pattern on the native Popover API: the `trigger` gets
 * `popovertarget` and `aria-haspopup="menu"`; the menu (`popover`, `role="menu"`) is portalled to `container`
 * (`document.body` by default), outside every Underglass layer. `attachStrataMenus` runs its keys and closes it when
 * an item is chosen.
 */
import { cloneElement, useEffect, useId, useState, version, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { combineStrataDisposers } from "../dom/delegate.ts";
import { attachStrataMenus } from "../dom/menu.ts";
import { attachStrataPopovers } from "../dom/popover.ts";
import { classes } from "./shared.ts";

export type MenuEntry = { label: ReactNode; onSelect?: () => void; disabled?: boolean } | "separator";

export interface MenuProps {
  /** The one button that opens it. */
  trigger: ReactElement;
  /** The menu's name. */
  label: string;
  items: readonly MenuEntry[];
  /** The menu's id; generated when absent. */
  id?: string;
  /** Prefer above the button. */
  placement?: "top" | "bottom";
  /** Where the menu is portalled; `document.body` by default. Never inside an Underglass layer. */
  container?: Element | null;
  className?: string;
}

// React 19 knows the Popover API's props; React 18 passes unknown lowercase attributes through.
const targetProp = Number(version.split(".")[0]) >= 19 ? "popoverTarget" : "popovertarget";

export function Menu({ trigger, label, items, id, placement = "bottom", container, className }: MenuProps) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const menuId = id ?? `menu-${generated}`;
  // The portal target exists only in the browser, after the first render.
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(container ?? document.body); return combineStrataDisposers(attachStrataMenus(), attachStrataPopovers()); }, [container]);
  const attributes = { className: classes("ug-menu", className), "data-strata-face": "raised", id: menuId, popover: "", role: "menu", "aria-label": label,
    "data-strata-placement": placement === "top" ? "top" : undefined };
  return (
    <>
      {cloneElement(trigger, { [targetProp]: menuId, "aria-haspopup": "menu" } as Record<string, unknown>)}
      {host && createPortal(
        <div {...(attributes as Record<string, unknown>)}>
          {items.map((entry, at) => entry === "separator"
            ? <hr key={at} className="ug-menu__separator" />
            : <button key={at} className="ug-menu__item" type="button" role="menuitem" tabIndex={-1} aria-disabled={entry.disabled ? "true" : undefined}
              onClick={entry.disabled ? undefined : entry.onSelect}>{entry.label}</button>)}
        </div>,
        host,
      )}
    </>
  );
}
