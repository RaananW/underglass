/**
 * JogWheel for Vue 3 (anatomy page `jog-wheel.md`): a native `<input type="range">` over a large flat wheel with a finger dimple, with
 * its legend printed under it. An endless encoder: the value steps and, with `wrap` (the default), goes round at the ends, while the
 * dimple turns on an accumulated angle that is not the value. Attributes and listeners (`class` and `style` included) fall through to
 * the `.ug-jog-wheel` root; the component exposes `root` and `input`. The round behaviour is `attachStrataJogWheels` from
 * `@underglass/ui/dom`, attached once when a wheel mounts; keys are native. Use `v-model`, or `defaultValue` uncontrolled. Field-aware,
 * as Slider is.
 */
import { defineComponent, h, nextTick, onMounted, ref, useId, watch, type PropType } from "vue";
import { attachStrataJogWheels, syncStrataJogWheel } from "../dom/jog-wheel.ts";
import { jogDefaults, jogInitialAngle, jogStyle, jogWheelModel } from "../shared/jog-wheel.ts";
import { strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const JogWheel = defineComponent({
  name: "StrataJogWheel",
  props: {
    /** The legend printed under the wheel; it names the input. */
    label: { type: String, required: true },
    /** The value; use `v-model`. */
    modelValue: { type: Number, default: undefined },
    /** Initial value when uncontrolled; `min` by default. */
    defaultValue: { type: Number, default: undefined },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 99 },
    step: { type: Number, default: 1 },
    /** Steps in one turn of the wheel; the `jog.turn` token (24) by default. */
    turn: { type: Number, default: jogDefaults.turn },
    /** Soft detents: the dimple settles on each step, which ticks where feedback is on. */
    detents: { type: Boolean, default: false },
    /** The value goes round at the ends (the default); `false` stops it at them. */
    wrap: { type: Boolean, default: true },
    /** `circular` (the default) or `vertical` (a turn per `jog.dragPx`). */
    drag: { type: String as PropType<"circular" | "vertical">, default: "circular" },
    /** A unit for `aria-valuetext`, appended as written (" fr", "%"). */
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
    // The wheel's angle starts at the initial value's step and is kept from there by the behaviour: it is not a function of the value.
    const start = jogStyle(jogInitialAngle(initial, { min: props.min, max: props.max, step: props.step }, props.turn), props.turn);
    const root = ref<HTMLElement>(), input = ref<HTMLInputElement>();
    expose({ root, input });
    onMounted(() => attachStrataJogWheels());
    // A value the parent sets (a controlled change, a reset) moves the wheel by the shorter way round.
    watch(() => props.modelValue ?? own.value, () => { void nextTick(() => { if (input.value) syncStrataJogWheel(input.value); }); });
    return () => {
      const current = props.modelValue ?? own.value;
      const model = jogWheelModel({ value: current, min: props.min, max: props.max, step: props.step, turn: props.turn, detents: props.detents, wrap: props.wrap, drag: props.drag, unit: props.unit, format: props.format });
      const control = field?.value;
      const inputId = props.id ?? control?.id ?? `jog-${generated}`;
      return h("div", { ref: root, class: ["ug-jog-wheel", model.detented && "ug-jog-wheel--detented"], style: start, ...(model.vertical ? { "data-strata-drag": "vertical" } : {}), ...strataAttributes(props) }, [
        h("div", { class: "ug-jog-wheel__dial" }, [
          h("span", { class: "ug-jog-wheel__well", "data-strata-face": "well", "aria-hidden": "true" }),
          h("span", { class: "ug-jog-wheel__wheel", "data-strata-face": "raised", "aria-hidden": "true" }, [
            h("span", { class: "ug-jog-wheel__turn" }, [h("span", { class: "ug-jog-wheel__dimple", "data-strata-face": "well" })]),
          ]),
          h("input", {
            ref: input, class: "ug-jog-wheel__input", type: "range", id: inputId, name: props.name, form: props.form,
            min: model.min, max: model.max, step: model.step,
            // The value attribute reflects the value, as React's does; the property controls it.
            "^value": String(current), value: current,
            "data-strata-default": String(props.resetValue ?? initial),
            ...(model.wrap ? { "data-strata-wrap": "true" } : {}),
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
        h("label", { class: "ug-jog-wheel__label", for: inputId }, props.label),
      ]);
    };
  },
});
