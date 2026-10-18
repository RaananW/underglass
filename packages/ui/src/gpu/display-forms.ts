/**
 * The Display at the Relief and Objects levels (anatomy pages `display.md`, `text-field.md` section 11): the scene entries
 * the GPU helper writes for the bezel and the window of a `.ug-display`, from their laid-out boxes. The native element covers
 * the whole display, so both parts lie inside its box and nothing they draw leaves it.
 * - **bezel:** a groove face at Relief (a recessed frame round the window) and a slab at Objects standing only as high as
 *   the box lets its cast shadow (2.8) reach (a display takes no hover: the shadow does not move);
 * - **window:** a flat face (height 0) over the bezel, at both levels: the text is printed on it, captured with the face, so
 *   it is the DOM's own pixels. The window's backlight is an emitter (`shared/display.ts`), never a captured colour that changes.
 * Parts never take focus: the focus ring is the CSS outline round the bezel, captured content. Hits stay on the native
 * element, which no part covers for input (`pointer-events: none`).
 */
import type { SceneEntry, SceneFace } from "../tokens/scene.ts";
import { fittedHeight } from "../shared/switch-forms.ts";

type Box = [number, number, number, number];

/** What the helper gives the display parts for one element. */
export interface DisplayFormContext {
  /** The element's box in the panel, and its corner radius. */
  rect: Box;
  radius: number;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the display stands on (Objects). */
  base: number;
  /** The native element's box: every part, its shadow included, stays inside it. */
  box: Box;
  /** The groove's depth (`elevation.well`) and the bezel's height (`elevation.raised`), and the Objects taper. */
  well: number;
  raised: number;
  taper: number;
  /** Whether the native element is disabled. */
  disabled: boolean;
  material(element: Element, face: SceneFace): string;
  light: { azimuth: number; elevation: number };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The scene entries for the bezel or the window of a display, or undefined when `element` is neither (the helper then
 * handles it as usual). A part whose box is empty gives no entries.
 */
export function displayFormEntries(element: Element, context: DisplayFormContext): SceneEntry[] | undefined {
  const isBezel = element.matches(".ug-display__bezel"), isWindow = element.matches(".ug-display__window");
  if (!isBezel && !isWindow) return undefined;
  const [x, y, width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const radius = Math.min(context.radius, Math.min(width, height) / 2), state = { disabled: context.disabled };
  if (isWindow) return [{ face: "flat", rect: context.rect, radius, height: 0, material: context.material(element, "flat"), state }];
  if (!context.objects) return [{ face: "groove", rect: context.rect, radius, height: context.well, material: context.material(element, "groove"), state }];
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  const rise = Math.max(0.25, round(fittedHeight(context.raised, margins, context.light)));
  return [{ object: "slab", rect: context.rect, radius, height: rise, base: context.base, taper: round(Math.min(rise, context.taper)), material: context.material(element, "raised"), state }];
}
