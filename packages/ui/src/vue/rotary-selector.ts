/**
 * RotarySelector for Vue 3 (anatomy page `rotary-selector.md`): a native `<select>` over a printed dial, one hard detent per
 * option, the options' labels printed round the knob, and the selector's legend printed under it. Attributes and listeners
 * (`class` and `style` included) fall through to the `.ug-rotary` root; the component exposes `root` and `select`. The round
 * pointer behaviour is `attachStrataRotarySelectors` from `@underglass/ui/dom`, attached once when a selector mounts; keys,
 * type-ahead and the native popup are the select's own. Use `v-model`, or `defaultValue` uncontrolled. Field-aware, as Select is.
 */
import { defineComponent, h, onMounted, ref, useId, type PropType } from "vue";
import { attachStrataRotarySelectors } from "../dom/rotary-selector.ts";
import { rotaryModel, type RotaryOption } from "../shared/rotary-selector.ts";
import { strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const RotarySelector = defineComponent({
  name: "StrataRotarySelector",
  props: {
    /** The legend printed under the dial; it names the select. */
    label: { type: String, required: true },
    /** The positions: one detent and one printed label each, in order round the dial. */
    options: { type: Array as PropType<readonly RotaryOption[]>, required: true },
    /** The value (an option's `value`); use `v-model`. */
    modelValue: { type: String, default: undefined },
    /** Initial value when uncontrolled; the first enabled option by default. */
    defaultValue: { type: String, default: undefined },
    /** The cap's turn from the first to the last position in degrees; the `knob.sweep` token (270) by default. */
    sweep: { type: Number, default: undefined },
    /** The select's id; generated when absent. */
    id: { type: String, default: undefined },
    name: { type: String, default: undefined },
    form: { type: String, default: undefined },
    required: { type: Boolean, default: undefined },
    invalid: { type: Boolean, default: false },
    disabled: { type: Boolean, default: undefined },
    ...strataProps,
  },
  emits: { "update:modelValue": (value: string) => typeof value === "string" },
  setup(props, { emit, expose }) {
    const field = useFieldControl();
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const own = ref(props.defaultValue ?? props.modelValue ?? props.options.find(option => !option.disabled)?.value);
    const root = ref<HTMLElement>(), select = ref<HTMLSelectElement>();
    expose({ root, select });
    onMounted(() => attachStrataRotarySelectors());
    return () => {
      const current = props.modelValue ?? own.value;
      const model = rotaryModel({ options: props.options, value: current, sweep: props.sweep });
      const control = field?.value;
      const selectId = props.id ?? control?.id ?? `rotary-${generated}`;
      const selected = model.marks[model.index]?.value ?? "";
      return h("div", { ref: root, class: "ug-rotary", style: model.style, ...strataAttributes(props) }, [
        h("div", { class: "ug-rotary__dial" }, [
          h("span", { class: "ug-rotary__scale", "aria-hidden": "true" }, model.marks.map(mark =>
            h("span", { key: mark.value, class: "ug-rotary__mark", "data-strata-value": mark.value, "data-strata-selected": String(mark.selected),
              ...(mark.disabled ? { "data-strata-disabled": "true" } : {}), style: mark.style }, [
              h("span", { class: "ug-rotary__tick" }), h("span", { class: "ug-rotary__text" }, mark.text),
            ]))),
          h("span", { class: "ug-rotary__skirt", "data-strata-face": "raised", "aria-hidden": "true" }, [
            h("span", { class: "ug-rotary__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-rotary__pointer" })]),
          ]),
          h("select", {
            ref: select, class: "ug-rotary__select", id: selectId, name: props.name, form: props.form,
            required: props.required ?? control?.required,
            ...(props.invalid || control?.["aria-invalid"] ? { "aria-invalid": "true" } : {}),
            ...(control?.["aria-describedby"] ? { "aria-describedby": control["aria-describedby"] } : {}),
            disabled: props.disabled ?? control?.disabled,
            onChange: (event: Event) => {
              const next = (event.target as HTMLSelectElement).value;
              if (props.modelValue === undefined) own.value = next;
              emit("update:modelValue", next);
            },
          }, props.options.map(option => h("option", { key: option.value, value: option.value, disabled: option.disabled, selected: option.value === selected }, option.label))),
        ]),
        h("ol", { class: "ug-rotary__legend", "aria-hidden": "true" }, model.marks.map(mark => h("li", { key: mark.value, "data-strata-selected": String(mark.selected) }, mark.text))),
        h("label", { class: "ug-rotary__label", for: selectId }, props.label),
      ]);
    };
  },
});
