/**
 * Field, TextField, TextArea, Select and Slider for Vue 3 (anatomy pages `field.md`, `text-field.md`, `text-area.md`,
 * `select.md`, `slider.md`). Field provides its control's id, description and state; each control applies them before
 * its own attributes. Controls support `v-model` and also work uncontrolled.
 */
import { computed, defineComponent, h, mergeProps, onMounted, provide, ref, useId, watch, type PropType } from "vue";
import { attachStrataFaders } from "../dom/fader.ts";
import { attachStrataKnobs } from "../dom/knob.ts";
import type { FaderMark } from "../shared/fader.ts";
import type { KnobMark } from "../shared/knob.ts";
import { sliderForm, sliderFormModel, sliderNumber, sliderOwner } from "../shared/slider-forms.ts";
import { classes, fieldKey, strataAttributes, strataProps, useFieldControl, type FieldControl } from "./shared.ts";

export const Field = defineComponent({
  name: "StrataField",
  props: {
    /** The label; leave it out for a control that carries its own label (Checkbox, Switch). */
    label: { type: String, default: undefined },
    help: { type: String, default: undefined },
    /** An error message, prefixed with `errorPrefix`; also marks the control invalid. */
    error: { type: String, default: undefined },
    /** The control's id; generated when absent. Set it here, not on the control. */
    controlId: { type: String, default: undefined },
    required: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    requiredLabel: { type: String, default: "(required)" },
    errorPrefix: { type: String, default: "Error:" },
  },
  setup(props, { slots }) {
    const generated = useId();
    const id = computed(() => props.controlId ?? `field-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`);
    const control = computed<FieldControl>(() => {
      const describedBy = [props.help ? `${id.value}-help` : undefined, props.error ? `${id.value}-error` : undefined].filter(Boolean).join(" ");
      return {
        id: id.value,
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        ...(props.error ? { "aria-invalid": "true" as const } : {}),
        ...(props.required ? { required: true } : {}),
        ...(props.disabled ? { disabled: true } : {}),
      };
    });
    provide(fieldKey, control);
    return () => h("div", { class: "ug-field" }, [
      props.label !== undefined && h("label", { class: "ug-field__label", for: id.value }, props.required ? `${props.label} ${props.requiredLabel}` : props.label),
      slots.default?.(),
      props.help && h("p", { class: "ug-field__help", id: `${id.value}-help` }, props.help),
      props.error && h("p", { class: "ug-field__error", id: `${id.value}-error` }, `${props.errorPrefix} ${props.error}`),
    ]);
  },
});

/** `v-model` support: a controlled value when `modelValue` is set, the native value otherwise. */
const model = <T>(props: { modelValue?: T }, emit: (event: "update:modelValue", value: T) => void, read: (target: HTMLInputElement) => T) => ({
  ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
  onInput: (event: Event) => emit("update:modelValue", read(event.target as HTMLInputElement)),
});

export const TextField = defineComponent({
  name: "StrataTextField",
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: undefined },
    invalid: { type: Boolean, default: false },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    return () => {
      // Own props merged with the fallthrough attributes: listeners chain, and the caller's other attributes win.
      const { class: className, ...rest } = attrs;
      const native = mergeProps({ ...field?.value, ...(props.invalid ? { "aria-invalid": "true" } : {}), ...model(props, emit, target => target.value), ref: input }, rest);
      if (!slots.icon) return h("input", { "data-strata-face": "well", ...strataAttributes(props), ...native, class: classes("ug-text-field", className as string) });
      return h("span", { class: "ug-text-field__wrap", "data-strata-face": "well", ...strataAttributes(props) }, [
        h("span", { class: "ug-text-field__icon", "aria-hidden": "true" }, slots.icon()),
        h("input", { ...native, class: classes("ug-text-field__input", className as string) }),
      ]);
    };
  },
});

export const TextArea = defineComponent({
  name: "StrataTextArea",
  props: {
    modelValue: { type: String, default: undefined },
    invalid: { type: Boolean, default: false },
    rows: { type: Number, default: 3 },
    resize: { type: String as PropType<"vertical" | "none" | "both" | "horizontal">, default: "vertical" },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const field = useFieldControl();
    return () => h("textarea", {
      class: "ug-text-area", "data-strata-face": "well", rows: props.rows, ...strataAttributes(props), ...field?.value,
      ...(props.invalid ? { "aria-invalid": "true" } : {}),
      ...(props.resize !== "vertical" ? { style: { resize: props.resize } } : {}),
      ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
      onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLTextAreaElement).value),
    });
  },
});

export const Select = defineComponent({
  name: "StrataSelect",
  props: {
    modelValue: { type: String, default: undefined },
    /** Initial value when uncontrolled. */
    defaultValue: { type: String, default: undefined },
    invalid: { type: Boolean, default: false },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { slots, emit }) {
    const field = useFieldControl();
    const element = ref<HTMLSelectElement | null>(null);
    // Options are children, so the value is applied once they exist.
    onMounted(() => { const value = props.modelValue ?? props.defaultValue; if (value !== undefined && element.value) element.value.value = value; });
    return () => h("select", {
      ref: element, class: "ug-select", "data-strata-face": "raised", ...strataAttributes(props), ...field?.value,
      ...(props.invalid ? { "aria-invalid": "true" } : {}),
      ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
      onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
    }, slots.default?.());
  },
});

export const Slider = defineComponent({
  name: "StrataSlider",
  inheritAttrs: false,
  props: {
    modelValue: { type: Number, default: undefined },
    /** Initial value when uncontrolled, written as the `value` attribute. */
    defaultValue: { type: Number, default: undefined },
    /**
     * `knob` or `fader` draws the same native input as the Knob's or the Fader's object (the Fader's horizontal); `flush` and no form
     * are the groove slider, and `wheel` is reserved. Any other string is the native `form` attribute (the id of a form owner), as before.
     * With a form, `class` and `style` reach the drawn root and every other attribute the input.
     */
    form: { type: String, default: undefined },
    /** A form's printed scale: a count of evenly spaced marks, or the marks' values (with labels). */
    marks: { type: [Number, Array] as PropType<number | readonly (number | KnobMark | FaderMark)[]>, default: undefined },
    /** A form's stepped positions, each a detent. */
    detents: { type: Number, default: undefined },
    /** A knob's turn from minimum to maximum in degrees; the `knob.sweep` token (270) by default. */
    sweep: { type: Number, default: undefined },
    /** A fader's carriage travel in CSS px; the size's `size.fader` by default. */
    travel: { type: Number, default: undefined },
    /** A form's unit for `aria-valuetext`, appended as written (" dB", "%"). */
    unit: { type: String, default: undefined },
    /** A form's `aria-valuetext` for a value, instead of the number and `unit`. */
    format: { type: Function as PropType<(value: number) => string>, default: undefined },
    /** The value a form's double-click returns to; the initial value by default. */
    resetValue: { type: Number, default: undefined },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { emit, attrs }) {
    const field = useFieldControl();
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const own = ref(sliderNumber(props.defaultValue ?? props.modelValue ?? attrs.min, 0));
    const initial = own.value;
    const attach = () => { const formed = sliderForm(props.form); if (formed === "knob") attachStrataKnobs(); else if (formed === "fader") attachStrataFaders(); };
    onMounted(attach);
    watch(() => props.form, attach);
    return () => {
      const { id, "aria-describedby": describedBy, disabled } = field?.value ?? {};
      const formed = sliderForm(props.form);
      if (!formed) {
        const owner = sliderOwner(props.form);
        return h("input", mergeProps({
          type: "range", class: "ug-slider", "data-strata-face": "groove", ...strataAttributes(props),
          ...(field ? { id, "aria-describedby": describedBy, disabled } : {}),
          ...(owner ? { form: owner } : {}),
          ...(props.defaultValue !== undefined ? { "^value": String(props.defaultValue) } : {}),
          ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
          onInput: (event: Event) => emit("update:modelValue", Number((event.target as HTMLInputElement).value)),
        }, attrs));
      }
      const { class: rootClass, style: rootStyle, id: ownId, disabled: ownDisabled, min, max, step, ...inputAttrs } = attrs as Record<string, unknown>;
      const low = sliderNumber(min, 0), current = props.modelValue ?? own.value;
      const model = sliderFormModel(formed, { value: current, min: low, max: sliderNumber(max, 100), step: step !== undefined ? sliderNumber(step, 1) : undefined,
        marks: props.marks, detents: props.detents, sweep: props.sweep, travel: props.travel, unit: props.unit, format: props.format });
      const knob = formed === "knob", part = knob ? "knob" : "fader";
      const control = h("input", mergeProps({
        class: `ug-${part}__input`, type: "range", id: (ownId as string | undefined) ?? id ?? `slider-${generated}`, min: model.min, max: model.max, step: model.step,
        // The value attribute reflects the value, as React's does; the property controls it.
        "^value": String(current), value: current,
        "data-strata-default": String(props.resetValue ?? initial),
        ...(props.unit !== undefined && !props.format ? { "data-strata-unit": props.unit } : {}),
        ...(model.valueText !== undefined ? { "aria-valuetext": model.valueText } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        disabled: (ownDisabled as boolean | undefined) ?? disabled,
        onInput: (event: Event) => {
          const next = Number((event.target as HTMLInputElement).value);
          if (props.modelValue === undefined) own.value = next;
          emit("update:modelValue", next);
        },
      }, inputAttrs));
      const scale = model.marks.map(mark => h("span", { key: mark.value, class: `ug-${part}__mark`, "data-strata-value": String(mark.value), style: mark.style }, mark.text));
      return h("div", { class: [...model.rootClass, rootClass], style: [model.style, rootStyle as never], "data-strata-form": formed, ...strataAttributes(props) }, [
        knob
          ? h("div", { class: "ug-knob__dial" }, [
            h("span", { class: "ug-knob__scale", "aria-hidden": "true" }, scale),
            h("span", { class: "ug-knob__skirt", "data-strata-face": "raised", "aria-hidden": "true" }, [h("span", { class: "ug-knob__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-knob__pointer" })])]),
            control,
          ])
          : h("div", { class: "ug-fader__track" }, [
            h("span", { class: "ug-fader__scale", "aria-hidden": "true" }, scale),
            h("span", { class: "ug-fader__slot", "data-strata-face": "groove", "aria-hidden": "true" }),
            h("span", { class: "ug-fader__carriage", "data-strata-face": "raised", "aria-hidden": "true" }, [h("span", { class: "ug-fader__grip" })]),
            control,
          ]),
      ]);
    };
  },
});
