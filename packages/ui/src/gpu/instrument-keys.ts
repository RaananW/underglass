/**
 * The material cap of the Strata GPU helper's Instrument scenes (issue #173), shared by every loop that draws a key-like object.
 *
 * Core draws an Instrument layer with at most 16 materials; a scene naming more is drawn at Relief as a whole. The helper keeps its
 * scenes under the cap with two rules (a key body of the button's own colour while the scene holds fewer than
 * `INSTRUMENT_KEY_BODY_MATERIALS`, a push button's parts while it holds fewer than `INSTRUMENT_PUSH_MATERIALS`) and a conversion at the
 * end of the scene: the later colours' key bodies become Relief keys until the scene fits.
 *
 * **Every key-like object must take part.** A loop that makes a key (a key body of a colour of its own, or a button with parts) does
 * three things with the registry it is handed (`createKeyRegistry`, held by `instrumentScene` and passed to the loops):
 * - tests its rule against `INSTRUMENT_KEY_BODY_MATERIALS` or `INSTRUMENT_PUSH_MATERIALS`, and when the rule says Relief, pushes its
 *   Relief entry and calls `keyAtRelief(element)` (the diagnostics and the once-per-panel warning name it);
 * - calls `registerKeyBody({ element, object, name, relief, height })` for each body whose material `name` is its own colour, so the
 *   conversion can trim it: `object` is the object it pushed, `relief` the raised face it becomes, `height` its contribution to the
 *   scene's tallest part (the loop then leaves that to the registry: do not also raise `tallest`).
 * A loop that does not register its bodies still works, but the scene cannot trim them and may pass core's cap.
 */
import type { ScenePrimitive } from "../tokens/scene.ts";
import type { InstrumentObject, InstrumentRecipe } from "./instrument.ts";

/** Core's cap on the materials of an Instrument layer (`INSTRUMENT_MATERIALS`, restated: the helper never imports core). */
export const STRATA_INSTRUMENT_MATERIAL_CAP = 16;
/** A key body of the button's own colour is added while the scene holds fewer materials than this; past it the button is a Relief key. */
export const INSTRUMENT_KEY_BODY_MATERIALS = 14;
/** A push button's parts (bezel, ring, cap body and up to four more materials) are added only below this many; past it the button is a Relief key. */
export const INSTRUMENT_PUSH_MATERIALS = 12;

/** What the helper reports of a panel's Instrument scene (`StrataGpu.diagnostics`). */
export interface StrataGpuDiagnostics {
  /** The materials the scene names and core's cap; past it core draws the layer at Relief (`state().instrument`). */
  materials: { count: number; cap: number };
  /** Ids of the buttons drawn as Relief keys because of the rules above or the conversion to fit the cap. */
  keysAtRelief: string[];
}

/** A key body the cap conversion may trim. */
export interface KeyBody {
  element: Element;
  /** The object the loop pushed to the scene's objects. */
  object: InstrumentObject;
  /** The body's material, named for its colour (`key #rrggbb`). */
  name: string;
  /** What the key becomes: its raised face. */
  relief: ScenePrimitive;
  /** The body's height plus one, for the scene's reach (the stage's tallest part). */
  height: number;
}

export interface KeyRegistry {
  /** The report of the scene being built. */
  report: StrataGpuDiagnostics;
  registerKeyBody(body: KeyBody): void;
  /** A button drawn as a Relief key instead of parts: named in the diagnostics. */
  keyAtRelief(element: Element): void;
  /** Turns the later colours' registered key bodies into Relief keys until `materials` holds at most the cap; returns the tallest remaining body. */
  trim(scene: { objects: InstrumentObject[]; entries: ScenePrimitive[]; materials: Record<string, InstrumentRecipe> }): number;
}

export function createKeyRegistry(): KeyRegistry {
  const bodies: KeyBody[] = [];
  const report: StrataGpuDiagnostics = { materials: { count: 0, cap: STRATA_INSTRUMENT_MATERIAL_CAP }, keysAtRelief: [] };
  const keyAtRelief = (element: Element) => { report.keysAtRelief.push(element.id || element.tagName.toLowerCase()); };
  return {
    report,
    keyAtRelief,
    registerKeyBody: body => { bodies.push(body); },
    trim({ objects, entries, materials }) {
      // The lamps' and push buttons' materials come after the key bodies, so a scene can still pass the cap (core draws the whole layer at Relief).
      for (const name of [...new Set(bodies.map(body => body.name))].reverse()) {
        if (Object.keys(materials).length <= STRATA_INSTRUMENT_MATERIAL_CAP) break;
        for (const body of bodies.filter(entry => entry.name === name)) {
          objects.splice(objects.indexOf(body.object), 1);
          entries.push(body.relief);
          keyAtRelief(body.element);
          bodies.splice(bodies.indexOf(body), 1);
        }
        if (!objects.some(object => object.parts.some(part => part.material === name))) delete materials[name];
      }
      return Math.max(0, ...bodies.map(body => body.height));
    },
  };
}
