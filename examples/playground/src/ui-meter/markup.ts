/**
 * The plain contract markup of a Meter or Gauge (anatomy pages `meter.md`, `gauge.md`), as an HTML author writes it by hand:
 * the pages of `ui-meter.html` and `ui-gauge.html` use it, so the tests run on what a plain page contains. It restates the
 * zone rule of the HTML standard and the numbers of the markup (it imports nothing from `@underglass/ui`).
 */
export interface MeterSpec {
  id: string;
  label: string;
  form: "bar" | "needle" | "dial";
  value: number;
  min: number;
  max: number;
  low?: number;
  high?: number;
  optimum?: number;
  segments?: number;
  /** The printed marks: values, or [value, text]. */
  marks: (number | [number, string])[];
  unit?: string;
  peak?: boolean;
  size?: "small" | "medium" | "large";
}

const minus = (value: number) => (value < 0 ? `−${-value}` : String(value));
const fixed = (value: number) => Math.round(value * 10000) / 10000;
const fraction = (value: number, { min, max }: { min: number; max: number }) => fixed(Math.min(1, Math.max(0, (value - min) / (max - min))));

/** The zone (good, warn, bad) of a value by the native meter's rule. */
function zone(value: number, spec: MeterSpec): "good" | "warn" | "bad" {
  const low = Math.max(spec.min, spec.low ?? spec.min), high = Math.min(spec.max, Math.max(low, spec.high ?? spec.max)), optimum = spec.optimum ?? (spec.min + spec.max) / 2;
  const region = (v: number) => (v < low ? 0 : v > high ? 2 : 1);
  return (["good", "warn", "bad"] as const)[Math.abs(region(value) - region(optimum))]!;
}

export function meterMarkup(spec: MeterSpec): string {
  const { id, label, form, value, min, max, low, high, optimum, unit, peak, size } = spec;
  const count = spec.segments ?? 16;
  const text = `${minus(value)}${unit ?? ""}`;
  const marks = spec.marks.map(mark => { const [at, label] = typeof mark === "number" ? [mark, minus(mark)] : mark; return `<span class="ug-meter__mark" data-strata-value="${at}" style="--strata-meter-at: ${fraction(at, spec)};">${label}</span>`; }).join("");
  let style = `--strata-meter-value: ${fraction(value, spec)};`;
  if (form === "bar") style += ` --strata-meter-count: ${count};`;
  else { if (low !== undefined) style += ` --strata-meter-lo: ${fraction(low, spec)};`; if (high !== undefined) style += ` --strata-meter-hi: ${fraction(high, spec)};`; }
  const native = `<meter class="ug-meter__native" id="${id}" min="${min}" max="${max}" value="${value}"${low !== undefined ? ` low="${low}"` : ""}${high !== undefined ? ` high="${high}"` : ""}${optimum !== undefined ? ` optimum="${optimum}"` : ""}${unit !== undefined ? ` data-strata-unit="${unit}" aria-valuetext="${text}"` : ""}>${text}</meter>`;
  const root = `class="ug-meter ug-meter--${form}${form === "bar" && peak ? " ug-meter--peak" : ""}${form === "dial" ? " ug-gauge" : ""}"${size ? ` data-strata-size="${size}"` : ""} style="${style}"`;
  const segments = Array.from({ length: count }, (_, index) => `<span class="ug-meter__segment" data-strata-face="knob" data-strata-zone="${zone(min + ((index + 0.5) / count) * (max - min), spec)}" style="--_i: ${index};"></span>`).join("");
  const object = form === "bar"
    ? `<span class="ug-meter__object" aria-hidden="true"><span class="ug-meter__window" data-strata-face="well"><span class="ug-meter__segments">${segments}</span><span class="ug-meter__scale">${marks}</span></span></span>`
    : `<span class="ug-meter__object" aria-hidden="true"><span class="ug-meter__bezel" data-strata-face="raised"><span class="ug-meter__window" data-strata-face="well"><span class="ug-meter__zones"></span><span class="ug-meter__scale">${marks}</span><span class="ug-meter__needle"></span><span class="ug-meter__hub" data-strata-face="knob"></span></span></span></span>`;
  return `<div ${root}><div class="ug-meter__body">${object}${native}</div><label class="ug-meter__label" for="${id}">${label}</label></div>`;
}
