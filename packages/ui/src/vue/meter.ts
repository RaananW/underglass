/**
 * Meter for Vue 3 (anatomy page `meter.md`): a native `<meter>` (role `meter`, a read-only measurement) under a bar of LED
 * segments lit from its value, or a needle on a printed arc (`form="needle"`), with its legend printed under the window.
 * The zones come from `low`, `high` and `optimum`, as the browser reads them; `unit` or `format` gives `aria-valuetext`.
 * Attributes and listeners (`class` and `style` included) fall through to the `.ug-meter` root; the component exposes
 * `root` and `meter`. The value reaches the drawing through `attachStrataMeters` from `@underglass/ui/dom`, attached once
 * when a meter mounts; a changed `value` is all it takes. `Gauge` (a round dial) renders the same markup.
 */
import { defineComponent, h, onMounted, ref, useId, type PropType, type Ref, type VNode } from "vue";
import { attachStrataMeters } from "../dom/meter.ts";
import { meterModel, type MeterMark, type MeterModel, type StrataMeterForm } from "../shared/meter.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

/** The props every meter and gauge takes. */
export const meterProps = {
  /** The legend printed under the window; it names the meter. */
  label: { type: String, required: true as const },
  /** The measurement. */
  value: { type: Number, required: true as const },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  /** The upper bound of the low region, as the native meter's `low`. */
  low: { type: Number, default: undefined },
  /** The lower bound of the high region, as the native meter's `high`. */
  high: { type: Number, default: undefined },
  /** The best value, as the native meter's `optimum`. */
  optimum: { type: Number, default: undefined },
  /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
  marks: { type: [Number, Array] as PropType<number | readonly (number | MeterMark)[]>, default: undefined },
  /** A unit for `aria-valuetext`, appended as written (" dB", "%"). */
  unit: { type: String, default: undefined },
  /** `aria-valuetext` for a value, instead of the number and `unit`. */
  format: { type: Function as PropType<(value: number) => string>, default: undefined },
  /** The native meter's id; generated when absent. */
  id: { type: String, default: undefined },
  ...strataProps,
};

/** The drawn object of a meter or gauge: decoration, no pointer, lying over the native meter. */
function meterObject(model: MeterModel): VNode {
  const marks = model.marks.map(mark => h("span", { key: mark.value, class: "ug-meter__mark", "data-strata-value": String(mark.value), style: mark.style }, mark.text));
  if (model.form === "bar") {
    return h("span", { class: "ug-meter__object", "aria-hidden": "true" }, [
      h("span", { class: "ug-meter__window", "data-strata-face": "well" }, [
        h("span", { class: "ug-meter__segments" }, model.segments.map((segment, index) => h("span", { key: index, class: "ug-meter__segment", "data-strata-face": "knob", "data-strata-zone": segment.zone, style: segment.style }))),
        h("span", { class: "ug-meter__scale" }, marks),
      ]),
    ]);
  }
  return h("span", { class: "ug-meter__object", "aria-hidden": "true" }, [
    h("span", { class: "ug-meter__bezel", "data-strata-face": "raised" }, [
      h("span", { class: "ug-meter__window", "data-strata-face": "well" }, [
        h("span", { class: "ug-meter__zones" }),
        h("span", { class: "ug-meter__scale" }, marks),
        h("span", { class: "ug-meter__needle" }),
        h("span", { class: "ug-meter__hub", "data-strata-face": "knob" }),
      ]),
    ]),
  ]);
}

/** The props of a meter or gauge as the model reads them, and the pieces a render needs. */
export function renderMeter(props: Record<string, any>, form: StrataMeterForm | "dial", generated: string, refs: { root: Ref<HTMLElement | undefined>; meter: Ref<HTMLMeterElement | undefined> }): VNode {
  const model = meterModel({ value: props.value, min: props.min, max: props.max, low: props.low, high: props.high, optimum: props.optimum, form, segments: props.segments,
    marks: props.marks, unit: props.unit, format: props.format, peak: props.peak });
  const inputId = props.id ?? `meter-${generated}`;
  return h("div", { ref: refs.root, class: classes("ug-meter", ...model.classes), style: model.style, ...strataAttributes(props) }, [
    h("div", { class: "ug-meter__body" }, [
      meterObject(model),
      h("meter", {
        ref: refs.meter, class: "ug-meter__native", id: inputId, min: model.native.min, max: model.native.max, value: model.native.value,
        ...(model.native.low !== undefined ? { low: model.native.low } : {}),
        ...(model.native.high !== undefined ? { high: model.native.high } : {}),
        ...(model.native.optimum !== undefined ? { optimum: model.native.optimum } : {}),
        ...(props.unit !== undefined && !props.format ? { "data-strata-unit": props.unit } : {}),
        ...(model.valueText !== undefined ? { "aria-valuetext": model.valueText } : {}),
      }, model.valueText ?? String(model.native.value)),
    ]),
    h("label", { class: "ug-meter__label", for: inputId }, props.label),
  ]);
}

export const Meter = defineComponent({
  name: "StrataMeter",
  props: {
    ...meterProps,
    /** `bar` (the default: LED segments behind a glass window) or `needle` (a needle on a printed arc). */
    form: { type: String as PropType<StrataMeterForm>, default: "bar" },
    /** A bar's segments; 16 by default. */
    segments: { type: Number, default: undefined },
    /** A bar holds its highest lit segment, and lets it fall (`meter.peakHold`, `meter.peakDecay`). */
    peak: { type: Boolean, default: false },
  },
  setup(props, { expose }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const root = ref<HTMLElement>(), meter = ref<HTMLMeterElement>();
    expose({ root, meter });
    onMounted(() => attachStrataMeters());
    return () => renderMeter(props, props.form, generated, { root, meter });
  },
});
