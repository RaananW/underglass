/**
 * SegmentedControl for Vue 3 (anatomy page `segmented-control.md`): native radios in a `<fieldset>` named by its
 * `<legend>`, each visually hidden over its key on one plinth. Use `v-model` (or `defaultValue`); arrow keys, Tab and
 * Space stay native.
 */
import { defineComponent, h, onMounted, onUpdated, useId, type PropType } from "vue";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { bankMarkup, latchForm, nativeForm } from "../shared/latching-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export const SegmentedControl = defineComponent({
  name: "StrataSegmentedControl",
  props: {
    /** Names the group, as the `<legend>`. */
    label: { type: String, required: true },
    /** Hides the legend visually; it still names the group. */
    hideLabel: { type: Boolean, default: false },
    /** Two to five short options. */
    options: { type: Array as PropType<readonly SegmentedOption[]>, required: true },
    /** The radios' shared `name`; generated when absent. */
    name: { type: String, default: undefined },
    /** The selection; use `v-model`. */
    modelValue: { type: String, default: undefined },
    /** Initial selection when uncontrolled. */
    defaultValue: { type: String, default: undefined },
    /**
     * The form (anatomy page `segmented-control.md`, *Latching forms*): `latching`, interlocking latching buttons on one plinth, the
     * selected one down with its LED lit; `flush`, or absent, is the look it had before. Any other string is the native `form` attribute.
     */
    form: { type: String as PropType<"latching" | "flush" | (string & {})>, default: undefined },
    /** The LEDs' colour of a latching control. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    ...strataProps,
  },
  emits: { "update:modelValue": (value: string) => typeof value === "string" },
  setup(props, { emit }) {
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    // A latching key is held down while it is pressed and plays its feedback (`dom/push-button.ts`), once per document.
    onMounted(() => { if (latchForm(props.form)) attachStrataPushButtons(); });
    onUpdated(() => { if (latchForm(props.form)) attachStrataPushButtons(); });
    return () => {
      const name = props.name ?? `segmented-${generated}`;
      const latching = latchForm(props.form), owner = nativeForm(props.form, "latching");
      const inputOf = (option: SegmentedOption) => h("input", {
        class: "ug-segmented__input", type: "radio", name, value: option.value, disabled: option.disabled || undefined,
        // Controlled: the checked property. Uncontrolled: the checked attribute (the default selection), as in HTML.
        ...(props.modelValue !== undefined ? { checked: props.modelValue === option.value } : props.defaultValue === option.value ? { "^checked": "" } : {}),
        onChange: (event: Event) => { if ((event.target as HTMLInputElement).checked) emit("update:modelValue", option.value); },
      });
      return h("fieldset", { class: "ug-segmented", ...strataAttributes(props), ...(latching ? { "data-strata-form": latching } : {}), ...(owner !== undefined ? { form: owner } : {}) }, [
        h("legend", { class: classes("ug-segmented__legend", props.hideLabel && "ug-segmented__legend--hidden") }, props.label),
        h("div", { class: classes("ug-segmented__plinth", latching && "ug-bank__plinth"), ...(latching ? { "data-strata-face": "raised" } : {}) }, props.options.map(option => h("label", { key: option.value, class: "ug-segmented__item" }, latching ? [
          h("span", { class: "ug-push ug-latch ug-latch--bank", ...(props.colour ? { "data-strata-colour": props.colour } : {}) }, [
            inputOf(option),
            h("span", { class: "ug-push__object ug-latch__object", "aria-hidden": "true" }, bankMarkup.map(part => h("span", { class: part.className, "data-strata-face": part.face }))),
            h("span", { class: "ug-push__cap ug-segmented__key", "data-strata-face": "raised" }, option.label),
          ]),
        ] : [
          inputOf(option),
          h("span", { class: "ug-segmented__key", "data-strata-face": "raised" }, option.label),
        ]))),
      ]);
    };
  },
});
