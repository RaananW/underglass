/**
 * The Meter and the Gauge at the Relief and Objects levels (anatomy pages `meter.md`, `gauge.md`): the scene entries the
 * GPU helper writes for the window and the bezel of a `.ug-meter`, from their laid-out boxes. The segments are the Lamp's
 * LED lenses (`lamp-forms.ts`): a disc in the zone's colour, lit or dark, at Relief and a dome at Objects, each an emitter.
 * The needle, the scale and the zones are captured content on the window, as a Knob's pointer is, and the hub is a dome.
 * - **window:** a well sunk into the faceplate (Relief: a `well` face; Objects: a `well` object, so nothing it draws lies
 *   outside the box), with its printed scale on it;
 * - **bezel** (a Gauge's ring, a needle meter's frame): a raised face (Relief) or a slab (Objects) standing only as high as
 *   the box lets its cast shadow (2.8) reach, hovered or not (a meter takes no pointer).
 * Hits stay on the native meter, which no part covers for input (`pointer-events: none`).
 */
import type { SceneEntry, SceneFace } from "../tokens/scene.ts";
import { fittedHeight } from "../shared/switch-forms.ts";

type Box = [number, number, number, number];

/** What the helper gives the meter parts for one element. */
export interface MeterFormContext {
  /** The element's box in the panel, and its corner radius. */
  rect: Box;
  radius: number;
  /** Whether the element is at the Objects level (or above it): its parts become objects. */
  objects: boolean;
  /** The height of the surface the meter stands on (Objects). */
  base: number;
  /** The native meter's box: every part, its shadow included, stays inside it. */
  box: Box;
  /** The window's depth (`elevation.well`) and a bezel's height (`elevation.raised`), and the Objects taper. */
  well: number;
  raised: number;
  taper: number;
  material(element: Element, face: SceneFace): string;
  light: { azimuth: number; elevation: number };
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The scene entries for the window or bezel of a meter, or undefined when `element` is neither (the helper then handles it
 * as usual). A part whose box is empty gives no entries.
 */
export function meterFormEntries(element: Element, context: MeterFormContext): SceneEntry[] | undefined {
  const isWindow = element.matches(".ug-meter__window"), isBezel = element.matches(".ug-meter__bezel");
  if (!isWindow && !isBezel) return undefined;
  const [x, y, width, height] = context.rect, box = context.box;
  if (width <= 0.25 || height <= 0.25) return [];
  const radius = Math.min(context.radius, Math.min(width, height) / 2);
  if (isWindow) {
    const material = context.material(element, "well");
    if (!context.objects) return [{ face: "well", rect: context.rect, radius, height: context.well, material }];
    const depth = Math.max(1, context.well);
    return [{ object: "well", rect: context.rect, radius, height: depth, base: context.base, taper: Math.min(context.taper, depth), material }];
  }
  const margins = { left: x - box[0], top: y - box[1], right: box[0] + box[2] - x - width, bottom: box[1] + box[3] - y - height };
  const rise = round(fittedHeight(context.raised, margins, context.light)), material = context.material(element, "raised");
  return [context.objects
    ? { object: "slab", rect: context.rect, radius, height: Math.max(0.25, rise), base: context.base, taper: round(Math.min(Math.max(0.25, rise), context.taper)), material }
    : { face: "raised", rect: context.rect, radius, height: rise, material }];
}
