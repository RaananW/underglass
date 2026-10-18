/**
 * Knob for Vue 3 (anatomy page `knob.md`): a native `<input type="range">` over a printed dial, with its legend printed
 * under it. Attributes and listeners (`class` and `style` included) fall through to the `.ug-knob` root; the component
 * exposes `root` and `input`. The round pointer behaviour is `attachStrataKnobs` from `@underglass/ui/dom`, attached
 * once when a knob mounts; keys are native. Use `v-model`, or `defaultValue` uncontrolled. Field-aware, as Slider is.
 */
import { defineComponent, h, onMounted, ref, useId, type PropType } from "vue";
import { attachStrataKnobs } from "../dom/knob.ts";
import { knobModel, type KnobMark } from "../shared/knob.ts";
import { strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const Knob = defineComponent({
  name: "StrataKnob",
  props: {
    /** The legend printed under the dial; it names the input. */
    label: { type: String, required: true },
    /** The value; use `v-model`. */
    modelValue: { type: Number, default: undefined },
    /** Initial value when uncontrolled; `min` by default. */
    defaultValue: { type: Number, default: undefined },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    /** 1 by default; a detented knob's step is its range over `detents − 1`. */
    step: { type: Number, default: undefined },
    /** Makes the knob stepped: this many positions, each a detent the cap settles on. */
    detents: { type: Number, default: undefined },
    /** The cap's turn from minimum to maximum in degrees; the `knob.sweep` token (270) by default. */
    sweep: { type: Number, default: undefined },
    /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
    marks: { type: [Number, Array] as PropType<number | readonly (number | KnobMark)[]>, default: undefined },
    /** A unit for `aria-valuetext`, appended as written (" dB", "%"). */
    unit: { type: String, default: undefined },
    /** `aria-valuetext` for a value, instead of the number and `unit`. */
    format: { type: Function as PropType<(value: number) => string>, default: undefined },
    /** The value a double-click returns to; the initial value by default. */
    resetValue: { type: Number, default: undefined },
    /** The input's id; generated when absent. */
    id: { type: String, default: undefined },
    name: { type: String, default: undefined },
    form: { type: String, default: undefined },
    disabled: { type: Boolean, default: undefined },
    ...strataProps,
  },
  emits: { "update:modelValue": (value: number) => typeof value === "number" },
  setup(props, { emit, expose }) {
    const field = useFieldControl();
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const own = ref(props.defaultValue ?? props.modelValue ?? props.min);
    const initial = props.modelValue ?? props.defaultValue ?? props.min;
    const root = ref<HTMLElement>(), input = ref<HTMLInputElement>();
    expose({ root, input });
    onMounted(() => attachStrataKnobs());
    return () => {
      const current = props.modelValue ?? own.value;
      const model = knobModel({ value: current, min: props.min, max: props.max, step: props.step, detents: props.detents, sweep: props.sweep, marks: props.marks, unit: props.unit, format: props.format });
      const control = field?.value;
      const inputId = props.id ?? control?.id ?? `knob-${generated}`;
      return h("div", { ref: root, class: ["ug-knob", model.detented && "ug-knob--detented"], style: model.style, ...strataAttributes(props) }, [
        h("div", { class: "ug-knob__dial" }, [
          h("span", { class: "ug-knob__scale", "aria-hidden": "true" }, model.marks.map(mark =>
            h("span", { key: mark.value, class: "ug-knob__mark", "data-strata-value": String(mark.value), style: mark.style }, mark.text))),
          h("span", { class: "ug-knob__skirt", "data-strata-face": "raised", "aria-hidden": "true" }, [
            h("span", { class: "ug-knob__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-knob__pointer" })]),
          ]),
          h("input", {
            ref: input, class: "ug-knob__input", type: "range", id: inputId, name: props.name, form: props.form,
            min: model.min, max: model.max, step: model.step,
            // The value attribute reflects the value, as React's does; the property controls it.
            "^value": String(current), value: current,
            "data-strata-default": String(props.resetValue ?? initial),
            ...(props.unit !== undefined && !props.format ? { "data-strata-unit": props.unit } : {}),
            ...(model.valueText !== undefined ? { "aria-valuetext": model.valueText } : {}),
            ...(control?.["aria-describedby"] ? { "aria-describedby": control["aria-describedby"] } : {}),
            disabled: props.disabled ?? control?.disabled,
            onInput: (event: Event) => {
              const next = Number((event.target as HTMLInputElement).value);
              if (props.modelValue === undefined) own.value = next;
              emit("update:modelValue", next);
            },
          }),
        ]),
        h("label", { class: "ug-knob__label", for: inputId }, props.label),
      ]);
    };
  },
});
