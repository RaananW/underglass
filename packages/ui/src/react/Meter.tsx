/**
 * Meter (anatomy page `meter.md`): a native `<meter>` (role `meter`, a read-only measurement) under a bar of LED segments
 * lit from its value, or a needle on a printed arc (`form="needle"`), with its legend printed under the window. The
 * zones come from `low`, `high` and `optimum`, as the browser reads them; `unit` or `format` gives `aria-valuetext`.
 * The ref and `className`, `style` and other attributes reach the `.ug-meter` root; `meterRef` reaches the native meter.
 * The value reaches the drawing through `attachStrataMeters` from `@underglass/ui/dom`, attached once when a meter
 * mounts; a changed `value` is all it takes, so a live level can drive it at frame rate. `Gauge` (a round dial) renders
 * the same markup.
 */
import { forwardRef, useEffect, useId, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { attachStrataMeters } from "../dom/meter.ts";
import { meterModel, type MeterMark, type MeterModel, type StrataMeterForm } from "../shared/meter.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface MeterProps extends Omit<HTMLAttributes<HTMLDivElement>, "children" | "id">, StrataProps {
  /** The legend printed under the window; it names the meter. */
  label: ReactNode;
  /** The measurement. */
  value: number;
  /** 0 by default. */
  min?: number;
  /** 100 by default. */
  max?: number;
  /** The upper bound of the low region, as the native meter's `low`. */
  low?: number;
  /** The lower bound of the high region, as the native meter's `high`. */
  high?: number;
  /** The best value, as the native meter's `optimum`: the region it is in is good, the next suboptimal, the far one worst. */
  optimum?: number;
  /** `bar` (the default: LED segments behind a glass window) or `needle` (a needle on a printed arc). */
  form?: StrataMeterForm;
  /** A bar's segments; 16 by default. */
  segments?: number;
  /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
  marks?: number | readonly (number | MeterMark)[];
  /** A unit for `aria-valuetext`, appended as written (" dB", "%"). */
  unit?: string;
  /** `aria-valuetext` for a value, instead of the number and `unit`. */
  format?: (value: number) => string;
  /** A bar holds its highest lit segment, and lets it fall (`meter.peakHold`, `meter.peakDecay`). */
  peak?: boolean;
  /** The native meter's id; generated when absent. */
  id?: string;
  /** A ref to the native `<meter>`. */
  meterRef?: Ref<HTMLMeterElement>;
}

/** `--name: value;` declarations as a React style object. */
const styleOf = (declarations: string): CSSProperties =>
  Object.fromEntries(declarations.split(";").map(rule => rule.split(":").map(part => part.trim())).filter(([name]) => name).map(([name, value]) => [name, value])) as CSSProperties;

/** The drawn object of a meter or gauge: decoration, no pointer, lying over the native meter. */
function MeterObject({ model }: { model: MeterModel }) {
  const marks = model.marks.map(mark => <span key={mark.value} className="ug-meter__mark" data-strata-value={String(mark.value)} style={styleOf(mark.style)}>{mark.text}</span>);
  if (model.form === "bar") {
    return (
      <span className="ug-meter__object" aria-hidden="true">
        <span className="ug-meter__window" data-strata-face="well">
          <span className="ug-meter__segments">
            {model.segments.map((segment, index) => <span key={index} className="ug-meter__segment" data-strata-face="knob" data-strata-zone={segment.zone} style={styleOf(segment.style)} />)}
          </span>
          <span className="ug-meter__scale">{marks}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="ug-meter__object" aria-hidden="true">
      <span className="ug-meter__bezel" data-strata-face="raised">
        <span className="ug-meter__window" data-strata-face="well">
          <span className="ug-meter__zones" />
          <span className="ug-meter__scale">{marks}</span>
          <span className="ug-meter__needle" />
          <span className="ug-meter__hub" data-strata-face="knob" />
        </span>
      </span>
    </span>
  );
}

/** The markup of a Meter (`form` bar or needle) or a Gauge (`form` dial). */
export const MeterRoot = forwardRef<HTMLDivElement, Omit<MeterProps, "form"> & { form: StrataMeterForm | "dial" }>(function MeterRoot(
  { label, value, min, max, low, high, optimum, form, segments, marks, unit, format, peak, id, meterRef, size, material, level, className, style, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const inputId = id ?? `meter-${generated}`;
  const model = meterModel({ value, min, max, low, high, optimum, form, segments, marks, unit, format, peak });
  useEffect(() => attachStrataMeters(), []);
  return (
    <div ref={ref} className={classes("ug-meter", ...model.classes, className)} {...strataAttributes({ size, material, level })} style={{ ...styleOf(model.style), ...style }} {...rest}>
      <div className="ug-meter__body">
        <MeterObject model={model} />
        <meter
          ref={meterRef}
          className="ug-meter__native"
          id={inputId}
          min={model.native.min}
          max={model.native.max}
          value={model.native.value}
          {...(model.native.low !== undefined ? { low: model.native.low } : {})}
          {...(model.native.high !== undefined ? { high: model.native.high } : {})}
          {...(model.native.optimum !== undefined ? { optimum: model.native.optimum } : {})}
          {...(unit !== undefined && !format ? { "data-strata-unit": unit } : {})}
          {...(model.valueText !== undefined ? { "aria-valuetext": model.valueText } : {})}
        >{model.valueText ?? String(model.native.value)}</meter>
      </div>
      <label className="ug-meter__label" htmlFor={inputId}>{label}</label>
    </div>
  );
});

export const Meter = forwardRef<HTMLDivElement, MeterProps>(function Meter({ form = "bar", ...props }, ref) {
  return <MeterRoot ref={ref} form={form} {...props} />;
});
