/**
 * Gauge (anatomy page `gauge.md`): the behaviour a Gauge adds to its native `<meter>`. A Gauge is a Meter with a round
 * dial (`.ug-meter.ug-gauge`), so it is kept in step by the same observer as a Meter's (`dom/meter.ts`): the value reaches the
 * dial as `--strata-meter-value`, and the needle follows it on `spring.gauge` (a CSS transition in the CSS presentation, a
 * spring on uniforms at the Instrument level). These names are the Gauge's own entry points to that behaviour.
 */
import { attachStrataMeters, syncStrataMeter } from "./meter.ts";

/** Runs every `.ug-gauge` (and every Meter) in `doc` through the meter observer, once per document. `attachStrata` calls it. */
export const attachStrataGauges = (doc: Document = document): void => attachStrataMeters(doc);
/** Brings a gauge's needle up to date with its native `<meter>` (what the observer does on every change). */
export const syncStrataGauge = (native: HTMLMeterElement): void => syncStrataMeter(native);
