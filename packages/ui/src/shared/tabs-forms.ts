/**
 * The Tabs' hardware form (anatomy page `tabs.md`, section 11; design language sections 3, 6 and 12): `form="rail"`, the tabs as latching
 * keys on one rail, each with an LED above it that lights while its tab is selected, the panel the faceplate under them. The name, and the
 * decorative markup every binding renders for it. Shared by the React, Vue and Astro bindings, the GPU helper and the tests, so all of
 * them agree.
 *
 * The WAI-ARIA Tabs pattern is untouched: the tablist, the native `<button role="tab">`s, the panels, `aria-selected`, `aria-controls`,
 * the roving tabindex, the arrow keys and the automatic or manual activation are what they were. The form is decoration inside each tab
 * (a cap that carries the label, and an LED lens above it) and a plinth that is the tablist itself.
 */

/** The name that keeps today's look: reserved, never a native attribute (a `<div>` has no `form`). */
export const TABS_FLUSH = "flush";
/** The Tabs' form that is drawn: the tabs as keys on a rail. */
export type StrataTabsForm = "rail";

/** The form a Tabs takes from its `form` prop: `rail`, or none (`flush` and any other string are today's flat tabs). */
export const tabsForm = (form: unknown): StrataTabsForm | undefined => (form === "rail" ? "rail" : undefined);

/** One decorative element of a rail tab: its class and its Relief marker. */
export interface TabPart { className: string; face: "raised" | "knob" }

/**
 * A rail tab's markup, inside its `<button role="tab">`: the LED lens (above the cap, on the rail's plinth: a `knob` face at Relief, a lens
 * with an emitter at Objects and Instrument, lit by `--strata-lit`, 1 while the tab is selected) and the cap, which carries the label
 * (`<span class="ug-tab__label">`) and is the key: a raised face at Relief, a key that travels at Objects, a body with a captured cap at
 * Instrument. The tablist is the plinth: `data-strata-face="raised"` on it, and no `.ug-tabs__rail` groove and no `.ug-tab__indicator`.
 */
export const tabLed: TabPart = { className: "ug-tab__led", face: "knob" };
export const tabCap: TabPart = { className: "ug-tab__cap", face: "raised" };

/** The room above a cap for its LED, and round the caps on the plinth, CSS px (`ug-tabs[data-strata-form="rail"]`). */
export const TAB_LED_ROOM = 12;
export const TAB_PLINTH_PAD = 6;
/** The LED lens's diameter, CSS px. */
export const TAB_LED = 6;
/** The key's travel at 50% depth while selected (latched), as a share of the held travel: the push button's 0.45. */
export const TAB_LATCHED = 0.45;
