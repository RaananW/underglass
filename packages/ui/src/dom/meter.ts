/**
 * Meter and Gauge (anatomy pages `meter.md`, `gauge.md`): the behaviour that keeps their drawn object in step with the
 * native `<meter>` they lie over, for plain HTML, Astro and the React and Vue bindings alike. A meter is read-only: it
 * takes no pointer and no keys, so this is all there is.
 * - The value reaches the drawing as one number, `--strata-meter-value` on the `.ug-meter` root (0 at `min`, 1 at `max`),
 *   kept in step with the meter's `value`, `min` and `max`. A change of the `value` attribute or property (a script, a
 *   framework, an audio level at frame rate) is all it takes; it is observed, not polled.
 * - With `data-strata-unit` on the meter, its `aria-valuetext` follows the value ("−18 dB", with U+2212).
 * - A bar's segments take their zone from `low`, `high` and `optimum` (`data-strata-zone` on each), so a change of those
 *   attributes recolours them.
 * - A bar with a peak (`ug-meter--peak`) holds its highest segment lit for `meter.peakHold`, then lets it fall at
 *   `meter.peakDecay` of the range a second (`--strata-meter-peak-index`, the held segment; written only when it changes).
 * Under the GPU the Instrument level reads the native meter itself, frame by frame, and draws the segments and the needle
 * as parts on uniforms, so a live value never recaptures its layer; these variables then feed only the CSS presentation.
 * One observer and no listener on the native event path: nothing is blocked or changed.
 */
import { advancePeak, meterBounds, meterFraction, meterValueText, peakDefaults, peakIndex, segmentZones, type PeakState, type PeakTokens } from "../shared/meter.ts";

const roots = ".ug-meter";
const watched = ["value", "min", "max", "low", "high", "optimum", "data-strata-unit"];

/** The meter's range as the browser reads it. */
function rangeOf(native: HTMLMeterElement) {
  const read = (name: string) => (native.hasAttribute(name) ? Number.parseFloat(native.getAttribute(name)!) : undefined);
  const finite = (value: number | undefined) => (value !== undefined && Number.isFinite(value) ? value : undefined);
  return { min: finite(read("min")) ?? 0, max: finite(read("max")) ?? 1, low: finite(read("low")), high: finite(read("high")), optimum: finite(read("optimum")) };
}

/** `meter.peakHold` and `meter.peakDecay` as resolved on a root, so themes and scopes apply. */
function peakTokens(root: Element): PeakTokens {
  const style = getComputedStyle(root);
  const raw = style.getPropertyValue("--strata-meter-peak-hold").trim(), amount = Number.parseFloat(raw), decay = Number.parseFloat(style.getPropertyValue("--strata-meter-peak-decay"));
  const hold = raw.endsWith("ms") ? amount : raw.endsWith("s") ? amount * 1000 : amount;
  return { hold: Number.isFinite(hold) ? hold : peakDefaults.hold, decay: Number.isFinite(decay) ? decay : peakDefaults.decay };
}

const peaks = new WeakMap<Element, { state?: PeakState; frame: number }>();

/** Sets or clears one custom property, only when it differs. */
function setProperty(root: HTMLElement, name: string, value: string | undefined) {
  if (value === undefined) { if (root.style.getPropertyValue(name)) root.style.removeProperty(name); }
  else if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
}

/**
 * Brings a meter's or gauge's drawn state up to date with its native `<meter>`: the value (`--strata-meter-value` on the
 * root), its `aria-valuetext` when it names a unit, a bar's zones and its held peak. The behaviour does this whenever
 * the meter's attributes change; call it after changing a value from script if observers are not running.
 */
export function syncStrataMeter(native: HTMLMeterElement): void {
  const root = native.closest<HTMLElement>(roots);
  if (!root) return;
  const range = rangeOf(native), bounds = meterBounds(range);
  const value = Math.min(bounds.max, Math.max(bounds.min, Number.parseFloat(native.getAttribute("value") ?? "0") || 0));
  const fraction = Math.round(meterFraction(value, bounds) * 10000) / 10000;
  setProperty(root, "--strata-meter-value", String(fraction));
  const unit = native.getAttribute("data-strata-unit");
  if (unit !== null) {
    const text = meterValueText(value, unit);
    if (native.getAttribute("aria-valuetext") !== text) native.setAttribute("aria-valuetext", text);
  }
  const segments = [...root.querySelectorAll<HTMLElement>(".ug-meter__segment")];
  if (segments.length) {
    const zones = segmentZones(segments.length, range);
    segments.forEach((segment, index) => { if (segment.getAttribute("data-strata-zone") !== zones[index]) segment.setAttribute("data-strata-zone", zones[index]!); });
  }
  if (root.matches(".ug-meter--peak") && segments.length) holdPeak(root, fraction, segments.length);
}

/** Moves a bar's held peak to where `fraction` leaves it now, and keeps frames coming while it falls. */
function holdPeak(root: HTMLElement, fraction: number, count: number) {
  const held = peaks.get(root) ?? { frame: 0 };
  peaks.set(root, held);
  cancelAnimationFrame(held.frame);
  const step = (now: number) => {
    const next = advancePeak(held.state, fraction, now, peakTokens(root));
    held.state = next.state;
    const index = peakIndex(next.value, count);
    setProperty(root, "--strata-meter-peak-index", index >= 0 ? String(index) : undefined);
    held.frame = next.falling && root.isConnected ? requestAnimationFrame(step) : 0;
  };
  step(performance.now());
}

const attached = new WeakSet<Document>();

/** Runs every `.ug-meter` (meters and gauges) in `doc`, present and future, through one observer, once per document. `attachStrata` calls it. */
export function attachStrataMeters(doc: Document = document): void {
  if (attached.has(doc)) return;
  attached.add(doc);
  const all = (root: ParentNode) => root.querySelectorAll<HTMLMeterElement>(`${roots} meter.ug-meter__native`);
  const syncAll = (root: ParentNode) => { for (const native of all(root)) syncStrataMeter(native); };
  syncAll(doc);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes") {
        const target = record.target as Element;
        if (target instanceof HTMLMeterElement && target.matches("meter.ug-meter__native")) syncStrataMeter(target);
      } else for (const node of record.addedNodes) if (node instanceof Element) { if (node.matches("meter.ug-meter__native") && node instanceof HTMLMeterElement) syncStrataMeter(node); syncAll(node); }
    }
  });
  observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: watched });
}
