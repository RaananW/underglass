/**
 * Fader for Vue 3 (anatomy page `fader.md`): a native `<input type="range">` over a slot in the faceplate, its thumb the
 * drawn carriage, with a printed scale beside the slot and its legend printed under it. Attributes and listeners
 * (`class` and `style` included) fall through to the `.ug-fader` root; the component exposes `root` and `input`. Drag,
 * track clicks and keys are native; the carriage following the value, a tap snapping to a printed mark, the wheel and
 * the double-click reset are `attachStrataFaders` from `@underglass/ui/dom`, attached once when a fader mounts. Use
 * `v-model`, or `defaultValue` uncontrolled. Field-aware, as Slider is.
 */
import { defineComponent, h, onMounted, ref, useId, type PropType } from "vue";
import { attachStrataFaders } from "../dom/fader.ts";
import { faderModel, type FaderMark, type FaderOrientation } from "../shared/fader.ts";
import { strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const Fader = defineComponent({
  name: "StrataFader",
  props: {
    /** The legend printed under the track; it names the input. */
    label: { type: String, required: true },
    /** The value; use `v-model`. */
    modelValue: { type: Number, default: undefined },
    /** Initial value when uncontrolled; `min` by default. */
    defaultValue: { type: Number, default: undefined },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 100 },
    /** 1 by default; a detented fader's step is its range over `detents − 1`. */
    step: { type: Number, default: undefined },
    /** Makes the fader stepped: this many positions, each a detent the carriage settles on. */
    detents: { type: Number, default: undefined },
    /** `vertical` (the default: the minimum at the bottom) or `horizontal` (the minimum at the left). */
    orientation: { type: String as PropType<FaderOrientation>, default: undefined },
    /** The carriage centre's travel in CSS px; the size's `size.fader` (180 at medium) by default. */
    travel: { type: Number, default: undefined },
    /** The printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
    marks: { type: [Number, Array] as PropType<number | readonly (number | FaderMark)[]>, default: undefined },
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
    onMounted(() => attachStrataFaders());
    return () => {
      const current = props.modelValue ?? own.value;
      const model = faderModel({ value: current, min: props.min, max: props.max, step: props.step, detents: props.detents, travel: props.travel,
        orientation: props.orientation, marks: props.marks, unit: props.unit, format: props.format });
      const control = field?.value;
      const inputId = props.id ?? control?.id ?? `fader-${generated}`;
      return h("div", { ref: root, class: ["ug-fader", !model.vertical && "ug-fader--horizontal", model.detented && "ug-fader--detented"], style: model.style, ...strataAttributes(props) }, [
        h("div", { class: "ug-fader__track" }, [
          h("span", { class: "ug-fader__scale", "aria-hidden": "true" }, model.marks.map(mark =>
            h("span", { key: mark.value, class: "ug-fader__mark", "data-strata-value": String(mark.value), style: mark.style }, mark.text))),
          h("span", { class: "ug-fader__slot", "data-strata-face": "groove", "aria-hidden": "true" }),
          h("span", { class: "ug-fader__carriage", "data-strata-face": "raised", "aria-hidden": "true" }, [h("span", { class: "ug-fader__grip" })]),
          h("input", {
            ref: input, class: "ug-fader__input", type: "range", id: inputId, name: props.name, form: props.form,
            min: model.min, max: model.max, step: model.step,
            // The value attribute reflects the value, as React's does; the property controls it.
            "^value": String(current), value: current,
            ...(model.vertical ? { "aria-orientation": "vertical" } : {}),
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
        h("label", { class: "ug-fader__label", for: inputId }, props.label),
      ]);
    };
  },
});
