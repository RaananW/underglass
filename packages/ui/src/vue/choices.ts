/**
 * Checkbox, Switch, RadioGroup and Radio for Vue 3 (anatomy pages `checkbox.md`, `switch.md`, `radio.md`). Each
 * control sits in its label row: `class` and `style` go on the row, every other attribute and listener on the native
 * input. `v-model` works on Checkbox and Switch (a boolean) and on RadioGroup (the selected value).
 */
import { computed, defineComponent, h, inject, mergeProps, onMounted, onUpdated, provide, ref, useId, type ComputedRef, type InjectionKey, type PropType, type VNode } from "vue";
import { attachStrataSwitches } from "../dom/switch.ts";
import { isSwitchForm, switchFormMarkup, type StrataSwitchForm, type SwitchPart } from "../shared/switch-forms.ts";
import { classes, splitAttrs, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

const choiceProps = {
  modelValue: { type: Boolean, default: undefined },
  invalid: { type: Boolean, default: false },
  ...strataProps,
};

export const Checkbox = defineComponent({
  name: "StrataCheckbox",
  inheritAttrs: false,
  props: {
    ...choiceProps,
    /** The mixed state, set as a property on every render; a click clears it, as native. */
    indeterminate: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    const sync = () => { if (input.value) input.value.indeterminate = props.indeterminate; };
    onMounted(sync);
    onUpdated(sync);
    expose({ input });
    return () => {
      const { row, control } = splitAttrs(attrs);
      return h("label", { ...row, class: classes("ug-checkbox", row.class as string), ...strataAttributes(props) }, [
        h("input", mergeProps({
          ref: input, class: "ug-checkbox__input", "data-strata-face": "well", type: "checkbox", ...field?.value,
          ...(props.invalid ? { "aria-invalid": "true" } : {}),
          ...(props.modelValue !== undefined ? { checked: props.modelValue } : {}),
          onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
        }, control)),
        h("span", { class: "ug-checkbox__mark", "data-strata-face": "mark", "aria-hidden": "true" }),
        h("span", { class: "ug-checkbox__label" }, slots.default?.()),
      ]);
    };
  },
});

export const Switch = defineComponent({
  name: "StrataSwitch",
  inheritAttrs: false,
  props: {
    ...choiceProps,
    /** The label before the track; the DOM order stays. */
    reverse: { type: Boolean, default: false },
    /**
     * The hardware form (anatomy page `switch.md`, *Forms*): `slide`, `rocker`, `bat` or `wall`. Absent, it is the Strata
     * switch. Any other string is the native `form` attribute (the id of the input's form owner), as before.
     */
    form: { type: String as PropType<StrataSwitchForm | (string & {})>, default: undefined },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    // A hardware form throws on a drag past centre and plays its feedback (`dom/switch.ts`), once per document.
    onMounted(() => { if (isSwitchForm(props.form)) attachStrataSwitches(); });
    onUpdated(() => { if (isSwitchForm(props.form)) attachStrataSwitches(); });
    const parts = (list: SwitchPart[]): VNode[] => list.map(part => h("span", { class: part.className, ...(part.face ? { "data-strata-face": part.face } : {}) }, part.children ? parts(part.children) : undefined));
    return () => {
      const { row, control } = splitAttrs(attrs);
      const hardware = isSwitchForm(props.form) ? props.form : undefined;
      return h("label", { ...row, class: classes("ug-switch", props.reverse && "ug-switch--reverse", row.class as string), ...strataAttributes(props), ...(hardware ? { "data-strata-form": hardware } : {}) }, [
        h("input", mergeProps({
          ref: input, class: "ug-switch__input", ...(hardware ? {} : { "data-strata-face": "well" }), type: "checkbox", role: "switch", ...field?.value,
          ...(props.form !== undefined && !hardware ? { form: props.form } : {}),
          ...(props.invalid ? { "aria-invalid": "true" } : {}),
          ...(props.modelValue !== undefined ? { checked: props.modelValue } : {}),
          onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
        }, control)),
        hardware
          ? h("span", { class: "ug-switch__object", "aria-hidden": "true" }, parts(switchFormMarkup[hardware]))
          : h("span", { class: "ug-switch__knob", "data-strata-face": "knob", "aria-hidden": "true" }),
        h("span", { class: "ug-switch__label" }, slots.default?.()),
      ]);
    };
  },
});

interface GroupContext {
  name: string;
  value?: string;
  defaultValue?: string;
  invalid: boolean;
  required: boolean;
  select: (value: string) => void;
}

const groupKey: InjectionKey<ComputedRef<GroupContext>> = Symbol("strata-radio-group");

export const RadioGroup = defineComponent({
  name: "StrataRadioGroup",
  props: {
    /** The question, rendered as the `<legend>`. */
    legend: { type: String, required: true },
    name: { type: String, default: undefined },
    /** The selected value; use `v-model`. */
    modelValue: { type: String, default: undefined },
    defaultValue: { type: String, default: undefined },
    help: { type: String, default: undefined },
    error: { type: String, default: undefined },
    required: { type: Boolean, default: false },
    errorPrefix: { type: String, default: "Error:" },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { slots, emit }) {
    const generated = useId();
    const name = computed(() => props.name ?? `radio-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`);
    provide(groupKey, computed(() => ({
      name: name.value, value: props.modelValue, defaultValue: props.defaultValue, invalid: !!props.error, required: props.required,
      select: (value: string) => emit("update:modelValue", value),
    })));
    return () => {
      const describedBy = [props.help ? `${name.value}-help` : undefined, props.error ? `${name.value}-error` : undefined].filter(Boolean).join(" ") || undefined;
      return h("fieldset", { class: "ug-radio-group", "aria-describedby": describedBy, ...strataAttributes(props) }, [
        h("legend", { class: "ug-radio-group__legend" }, props.legend),
        slots.default?.(),
        props.help && h("p", { class: "ug-field__help", id: `${name.value}-help` }, props.help),
        props.error && h("p", { class: "ug-field__error", id: `${name.value}-error` }, `${props.errorPrefix} ${props.error}`),
      ]);
    };
  },
});

export const Radio = defineComponent({
  name: "StrataRadio",
  inheritAttrs: false,
  props: {
    value: { type: String, required: true },
    ...strataProps,
  },
  setup(props, { attrs, slots, expose }) {
    const group = inject(groupKey, undefined);
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    return () => {
      const { row, control } = splitAttrs(attrs);
      const context = group?.value;
      // Controlled: the checked property. Uncontrolled: the checked attribute (the default selection), as in HTML.
      const selection = context?.value !== undefined ? { checked: context.value === props.value }
        : context?.defaultValue === props.value ? { "^checked": "" } : {};
      return h("label", { ...row, class: classes("ug-radio", row.class as string), ...strataAttributes(props) }, [
        h("input", mergeProps({
          ref: input, class: "ug-radio__input", "data-strata-face": "well", type: "radio", name: context?.name, value: props.value,
          ...(context?.required ? { required: true } : {}), ...(context?.invalid ? { "aria-invalid": "true" } : {}),
          ...selection,
          onChange: (event: Event) => { if ((event.target as HTMLInputElement).checked) context?.select(props.value); },
        }, control)),
        h("span", { class: "ug-radio__dot", "data-strata-face": "knob", "aria-hidden": "true" }),
        h("span", { class: "ug-radio__label" }, slots.default?.()),
      ]);
    };
  },
});
