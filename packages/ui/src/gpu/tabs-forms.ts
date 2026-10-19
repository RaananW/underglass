/**
 * The Tabs' rail form at the Relief and Objects levels (anatomy page `tabs.md`, section 11): the scene entries the GPU helper writes for the
 * cap of a rail tab (`.ug-tab__cap`), from its laid-out box. The tablist is the plinth (a raised face, which the helper's general path draws
 * as a raised face at Relief and a slab at Objects, in the `knob` metal), and the LED above each cap is the indicator lens the helper draws
 * for every LED (`gpu/indicator-forms.ts`, `gpu/lamp-forms.ts`), on the plinth.
 * - **cap:** a raised face (Relief) or a key standing on the plinth (Objects), in the key's own material with the brushed finish, the shape of
 *   the cap. A selected tab, or one held, is pressed: Relief sinks the face, Objects travels the key. It stands only as high as the room round
 *   it in the tab's box lets its cast shadow (2.8) reach, hovered, so nothing it draws leaves the native `<button role="tab">`; hits stay on
 *   the button, which no part covers for input (`pointer-events: none` is not even needed: the cap is inside it).
 * Parts never take focus: the focus ring is the CSS outline round the cap, captured content.
 */
import type { SceneEntry, SceneFace, SceneState } from "../tokens/scene.ts";
import { fittedHeight } from "../shared/switch-forms.ts";

type Box = [number, number, number, number];

/** What the helper gives the cap of a rail tab. */
export interface TabFormContext {
  /** The cap's box in the panel, and its corner radius. */
  rect: Box;
  radius: number;
  /** The tab's `<button role="tab">`: the native element, whose box holds the cap, its LED and the room for its shadow. */
  tab: Element;
  /** The native button's box in the panel: every part, its shadow included, stays inside it. */
  box: Box;
  /** Whether the element is at the Objects level (or above it): its cap becomes a key. */
  objects: boolean;
  /** The height of the surface the key stands on (Objects): the plinth's top. */
  base: number;
  material(element: Element, face: SceneFace): string;
  light: { azimuth: number; elevation: number };
  /** `state.hoverHeight` (Relief hover multiplies heights by it; Objects raises a key by a quarter). */
  hoverHeight: number;
  /** `object.keyTravel`, how far an Objects key sinks. */
  keyTravel: number;
}

/** The heights the cap would like at Relief and Objects, px, before its shadow is fitted to the tab's box. */
export const tabReliefHeights = { cap: 4, key: 8 } as const;

const round = (value: number) => Math.round(value * 100) / 100;

/** A rail tab's state from its native button: hover, held or selected (pressed), disabled. */
export function tabState(tab: Element): SceneState {
  const preview = (tab.getAttribute("data-strata-preview") ?? "").split(/\s+/);
  return {
    hover: tab.matches(":hover") || preview.includes("hover"),
    pressed: tab.matches(":active:not([data-strata-down='false']), [data-strata-down='true'], [aria-selected='true']") || preview.includes("active"),
    disabled: tab.matches(":disabled, [aria-disabled='true']"),
  };
}

/**
 * The scene entries for the cap of a rail tab, or undefined when `element` is not one (the helper then handles it as usual). A cap whose box
 * is empty gives no entries.
 */
export function tabFormEntries(element: Element, context: TabFormContext): SceneEntry[] | undefined {
  if (!element.matches(".ug-tab__cap")) return undefined;
  const [x, y, width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const state = tabState(context.tab);
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  // Hover lifts a primitive by `hoverHeight` and an object's key by a quarter: a hovered part's shadow is fitted at that height.
  const lift = !state.hover ? 1 : context.objects ? 1.25 : Math.max(1, context.hoverHeight);
  const fit = (wanted: number) => round(fittedHeight(wanted * lift, margins, context.light) / lift);
  const radius = Math.min(context.radius, Math.min(width, height) / 2), material = context.material(element, "raised");
  if (!context.objects) return [{ face: "raised", rect: context.rect, radius, height: fit(tabReliefHeights.cap), material, finish: true, state }];
  const rise = Math.max(0.25, fit(tabReliefHeights.key)), travel = round(Math.min(context.keyTravel, rise * 0.75));
  return [{ object: "key", rect: context.rect, radius, height: rise, base: round(context.base), taper: round(Math.min(rise, 3)), travel, material, finish: true, bounds: box, state }];
}
