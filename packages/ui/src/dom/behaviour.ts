/**
 * Plain-DOM behaviour for Strata markup rendered without a framework binding (plain HTML, Astro, server templates),
 * where native elements need help (design language section 18). One delegated listener per root:
 * - a `.ug-toggle-button` or a filter chip (`.ug-chip[aria-pressed]`) toggles `aria-pressed` on click (and Enter or Space, which click a button natively), and
 *   dispatches a bubbling `strata-pressed-change` event with `{ pressed }`;
 * - a click on a Strata button with `aria-disabled="true"` is stopped before any other listener sees it, so the
 *   control stays focusable without activating;
 * - a checkbox with `data-strata-indeterminate` gets the `indeterminate` property, which has no attribute;
 * - a click on `[data-strata-open="id"]` shows the Dialog or Drawer with that id (`showStrataDialog`), and a click on a
 *   `[data-strata-close]` inside an open one closes it;
 * - a click on a chip's remove button dispatches a bubbling `strata-remove` event from the chip, and one on a
 *   MessageBar's dismiss button a bubbling `strata-dismiss` event from the bar;
 * - Tooltips: `attachStrataTooltips` shows and hides every `.ug-tooltip` named by a trigger's `aria-describedby`;
 * - Switch forms: `attachStrataSwitches` throws a `.ug-switch[data-strata-form]` on a drag past centre and plays its feedback (anatomy page `switch.md`);
 * - Popovers: `attachStrataPopovers` places a `.ug-popover` opened from inside an Underglass layer with script;
 * - Trees: `attachStrataTrees` runs every `.ug-tree` from its markup (keys, clicks, `strata-expand` and `strata-select`);
 * - Faders: `attachStrataFaders` gives every `.ug-fader` its carriage, wheel, mark and reset behaviour (anatomy page `fader.md`);
 * - Carousels: `attachStrataCarousels` runs every `.ug-carousel`'s buttons and reports `strata-slide`;
 * - Menus: `attachStrataMenus` runs the Menu Button pattern's keys, and reports `strata-select` from a chosen item;
 * - Knobs: `attachStrataKnobs` gives every `.ug-knob` its round pointer, wheel and reset behaviour (anatomy page `knob.md`);
 * - Lamps: `attachStrataLamps` lights a momentary `.ug-lamp` while it is pressed and plays opt-in feedback (anatomy page `lamp.md`);
 * - Meters and Gauges: `attachStrataMeters` keeps every `.ug-meter`'s drawn value, zones, `aria-valuetext` and held peak in step with its native `<meter>` (anatomy pages `meter.md`, `gauge.md`);
 * - Progress bars: `attachStrataProgress` keeps every segment-meter `.ug-progress-bar`'s drawn value in step with its native `<progress>` (anatomy page `progress-bar.md`);
 * - Toolbars: the first time focus enters one, its controls get a roving tabindex (one tab stop), and the arrow keys,
 *   Home and End move between them;
 * - Tabs: a click on a tab selects it, and the arrow keys, Home and End move between tabs and select them (only move,
 *   with `data-strata-activation="manual"` on the tablist, until Enter or Space clicks the tab).
 * The React and Vue bindings do the same themselves, so they need none of this (a knob's binding attaches its behaviour).
 */
import { showStrataDialog, type DialogHandle } from "./dialog.ts";
import { selectStrataTab, strataTabsActivation, strataTabTarget } from "./tabs.ts";
import { rovingStrataToolbar, strataToolbarTarget } from "./toolbar.ts";
import { attachStrataTooltips } from "./tooltip.ts";
import { attachStrataSwitches } from "./switch.ts";
import { attachStrataPopovers } from "./popover.ts";
import { attachStrataTrees } from "./tree.ts";
import { attachStrataFaders } from "./fader.ts";
import { attachStrataCarousels } from "./carousel.ts";
import { attachStrataMenus } from "./menu.ts";
import { attachStrataKnobs } from "./knob.ts";
import { attachStrataLamps } from "./lamp.ts";
import { attachStrataMeters } from "./meter.ts";
import { attachStrataProgress } from "./progress.ts";

const attached = new WeakMap<Document | HTMLElement, () => void>();

/** The detail of a `strata-pressed-change` event. */
export interface PressedChange {
  pressed: boolean;
}

/** The plain-markup dialogs this module has opened, by panel. */
const opened = new WeakMap<HTMLElement, DialogHandle>();

const buttons = ".ug-button, .ug-icon-button, .ug-toggle-button, .ug-chip";
const toggles = ".ug-toggle-button, .ug-chip[aria-pressed]";

/** Sets `indeterminate` on every marked checkbox inside `root` (including ones added later, on the next call). */
function applyIndeterminate(root: Document | HTMLElement) {
  for (const input of root.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-strata-indeterminate]")) {
    input.indeterminate = true;
    // The mark is a one-time initial state: a click clears it natively, and it must not come back.
    input.removeAttribute("data-strata-indeterminate");
  }
}

/**
 * Attaches the behaviour to `root` (the document by default) and returns a function that detaches it. Calling it
 * again for the same root re-applies the initial states and keeps one listener.
 */
export function attachStrata(root: Document | HTMLElement = document): () => void {
  applyIndeterminate(root);
  attachStrataTooltips(root instanceof Document ? root : root.ownerDocument);
  attachStrataSwitches(root instanceof Document ? root : root.ownerDocument);
  attachStrataPopovers(root instanceof Document ? root : root.ownerDocument);
  attachStrataTrees(root instanceof Document ? root : root.ownerDocument);
  attachStrataFaders(root instanceof Document ? root : root.ownerDocument);
  attachStrataCarousels(root instanceof Document ? root : root.ownerDocument);
  attachStrataMenus(root instanceof Document ? root : root.ownerDocument);
  attachStrataKnobs(root instanceof Document ? root : root.ownerDocument);
  attachStrataLamps(root instanceof Document ? root : root.ownerDocument);
  attachStrataMeters(root instanceof Document ? root : root.ownerDocument);
  attachStrataProgress(root instanceof Document ? root : root.ownerDocument);
  const existing = attached.get(root);
  if (existing) return existing;
  const block = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.(buttons);
    if (button && button.getAttribute("aria-disabled") === "true") { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const toggle = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.(toggles);
    if (!button || event.defaultPrevented || button.getAttribute("aria-disabled") === "true" || (button as HTMLButtonElement).disabled) return;
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    button.dispatchEvent(new CustomEvent<PressedChange>("strata-pressed-change", { bubbles: true, detail: { pressed } }));
  };
  const open = (event: Event) => {
    const opener = (event.target as Element | null)?.closest?.("[data-strata-open]");
    const panel = opener && document.getElementById(opener.getAttribute("data-strata-open") ?? "");
    if (!panel || event.defaultPrevented || opener.getAttribute("aria-disabled") === "true" || (opener as HTMLButtonElement).disabled) return;
    opened.set(panel, showStrataDialog(panel, { onClose: () => void opened.get(panel)?.close(), closeOnScrim: panel.hasAttribute("data-strata-close-on-scrim") }));
  };
  const close = (event: Event) => {
    const closer = (event.target as Element | null)?.closest?.("[data-strata-close]");
    const panel = closer?.closest<HTMLElement>(".ug-dialog, .ug-drawer");
    if (panel && !panel.hidden) void opened.get(panel)?.close();
  };
  const remove = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.(".ug-chip__remove");
    const chip = button?.closest(".ug-chip");
    if (chip && !event.defaultPrevented && !(button as HTMLButtonElement).disabled) chip.dispatchEvent(new CustomEvent("strata-remove", { bubbles: true }));
  };
  const dismiss = (event: Event) => {
    const bar = (event.target as Element | null)?.closest?.(".ug-message-bar__dismiss")?.closest(".ug-message-bar");
    if (bar && !event.defaultPrevented) bar.dispatchEvent(new CustomEvent("strata-dismiss", { bubbles: true }));
  };
  const tab = (event: Event) => {
    const target = (event.target as Element | null)?.closest?.<HTMLElement>(".ug-tabs__list [role='tab']");
    if (target && !event.defaultPrevented && !(target as HTMLButtonElement).disabled) selectStrataTab(target);
  };
  const tabKey = (event: KeyboardEvent) => {
    const from = (event.target as Element | null)?.closest?.(".ug-tabs__list [role='tab']");
    const target = from && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey ? strataTabTarget(from, event.key) : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
    if (strataTabsActivation(target.closest("[role='tablist']")!) === "automatic") selectStrataTab(target);
  };
  const toolbarFocus = (event: Event) => {
    const target = event.target as Element | null, toolbar = target?.closest?.(".ug-toolbar");
    if (toolbar && target !== toolbar) rovingStrataToolbar(toolbar, target!);
  };
  const toolbarKey = (event: KeyboardEvent) => {
    const from = event.target as Element | null;
    const target = from?.closest?.(".ug-toolbar") && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey ? strataToolbarTarget(from!, event.key) : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  root.addEventListener("click", block, true);
  root.addEventListener("focusin", toolbarFocus);
  root.addEventListener("keydown", toolbarKey as EventListener);
  root.addEventListener("click", tab);
  root.addEventListener("click", remove);
  root.addEventListener("click", dismiss);
  root.addEventListener("keydown", tabKey as EventListener);
  root.addEventListener("click", open);
  root.addEventListener("click", close);
  root.addEventListener("click", toggle);
  const detach = () => {
    root.removeEventListener("click", block, true);
    root.removeEventListener("focusin", toolbarFocus);
    root.removeEventListener("keydown", toolbarKey as EventListener);
    root.removeEventListener("click", toggle);
    root.removeEventListener("click", open);
    root.removeEventListener("click", close);
    root.removeEventListener("click", tab);
    root.removeEventListener("click", remove);
    root.removeEventListener("click", dismiss);
    root.removeEventListener("keydown", tabKey as EventListener);
    attached.delete(root);
  };
  attached.set(root, detach);
  return detach;
}
