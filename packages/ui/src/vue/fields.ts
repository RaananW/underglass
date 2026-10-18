/**
 * Field, TextField, TextArea, Select and Slider for Vue 3 (anatomy pages `field.md`, `text-field.md`, `text-area.md`,
 * `select.md`, `slider.md`). Field provides its control's id, description and state; each control applies them before
 * its own attributes. Controls support `v-model` and also work uncontrolled.
 */
import { computed, defineComponent, h, mergeProps, onMounted, provide, ref, useId, type PropType } from "vue";
import { displayAttributes, displayClasses, displayMarkup, isTextForm, type StrataDisplayBacklight } from "../shared/display.ts";
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

/** The decorative object of a display: a bezel with the window in it, under the native element. */
export const displayObject = () => h("span", { class: "ug-display__object", "aria-hidden": "true" }, [
  h("span", { class: displayMarkup.bezel.className, "data-strata-face": displayMarkup.bezel.face }, [
    h("span", { class: displayMarkup.window.className, "data-strata-face": displayMarkup.window.face }),
  ]),
]);

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
    /** `display`: a glass window in a bezel, backlit. Any other string is the native `form` attribute. */
    form: { type: String, default: undefined },
    /** A display's backlight: a colour role (`glowOn` by default) or `off`. */
    backlight: { type: String as PropType<StrataDisplayBacklight>, default: undefined },
    /** A display's backlight is lit by default; `false` switches it off. */
    lit: { type: Boolean, default: undefined },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    return () => {
      // Own props merged with the fallthrough attributes: listeners chain, and the caller's other attributes win.
      const { class: className, style, ...rest } = attrs;
      const display = isTextForm(props.form);
      const native = mergeProps({ ...field?.value, ...(props.invalid ? { "aria-invalid": "true" } : {}), ...(props.form !== undefined && !display ? { form: props.form } : {}), ...(display ? {} : { style }),
        ...model(props, emit, target => target.value), ref: input }, rest);
      if (display) {
        return h("span", { class: classes(...displayClasses(false), className as string), style, ...strataAttributes(props), ...displayAttributes({ backlight: props.backlight, lit: props.lit }) }, [
          displayObject(), h("input", { ...native, class: "ug-display__text" }),
        ]);
      }
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
  props: {
    modelValue: { type: Number, default: undefined },
    /** Initial value when uncontrolled, written as the `value` attribute. */
    defaultValue: { type: Number, default: undefined },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    const field = useFieldControl();
    return () => {
      const { id, "aria-describedby": describedBy, disabled } = field?.value ?? {};
      return h("input", {
        type: "range", class: "ug-slider", "data-strata-face": "groove", ...strataAttributes(props),
        ...(field ? { id, "aria-describedby": describedBy, disabled } : {}),
        ...(props.defaultValue !== undefined ? { "^value": String(props.defaultValue) } : {}),
        ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
        onInput: (event: Event) => emit("update:modelValue", Number((event.target as HTMLInputElement).value)),
      });
    };
  },
});
