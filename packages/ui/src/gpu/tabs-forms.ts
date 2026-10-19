/**
 * The Tabs' rail form at the GPU levels (anatomy page `tabs.md`, section 11): the mapping onto the keys-on-a-plinth construction of the latching
 * bank (`gpu/push-forms.ts` at Relief and Objects, `gpu/instrument-bank.ts` at the Instrument level), which draws the RadioGroup's bank and the
 * SegmentedControl's latching form. The rail adds no parts of its own; it says which element is which:
 * - the **plinth** is the tablist (`.ug-tabs[data-strata-form="rail"] > .ug-tabs__list`), the native element itself, so it has no room round it
 *   and casts no shadow of its own (`flush`);
 * - each **key** is a tab (`<button role="tab">`, the native element: its box holds the cap, the LED and the room for the key's shadow), its
 *   **cap** the `.ug-tab__cap`, which carries the label, and its **LED** the `.ug-tab__led` above the cap, on the plinth;
 * - the selected tab, or one held, is **down**: a latched key (`aria-selected`, `--strata-push-t` 0.45) or a held one (1).
 * Hits stay on the native button, which no part covers for input. Parts never take focus: the focus ring is the CSS outline round the cap,
 * captured content.
 */
import type { SceneState } from "../tokens/scene.ts";

/** The tablist of a rail Tabs: the plinth. */
export const RAIL_LIST = ".ug-tabs[data-strata-form='rail'] > .ug-tabs__list";
/** A rail Tabs' tab, the native button every part of a key is inside. */
export const RAIL_TAB = ".ug-tabs[data-strata-form='rail'] .ug-tab";

/** A rail tab's state from its native button: hover, held or selected (pressed), disabled. */
export function tabState(tab: Element): SceneState {
  const preview = (tab.getAttribute("data-strata-preview") ?? "").split(/\s+/);
  return {
    hover: tab.matches(":hover") || preview.includes("hover"),
    pressed: tab.matches(":active:not([data-strata-down='false']), [data-strata-down='true'], [aria-selected='true']") || preview.includes("active"),
    disabled: tab.matches(":disabled, [aria-disabled='true']"),
  };
}

/** A rail tab's key's place along its travel now, 0–1: the CSS throw (`--strata-push-t`: 0.45 selected, 1 held), or the state's when it is not yet read. */
export function tabPosition(read: number, state: SceneState): number {
  return Math.min(1, Math.max(0, state.disabled && !state.pressed ? 0 : Number.isFinite(read) ? read : state.pressed ? 0.45 : 0));
}
