/**
 * Lamp for Vue 3 (anatomy page `lamp.md`): a lens on a bezel over a native `<input type="checkbox" role="switch">` in
 * its label row, or, when `momentary`, a `<button aria-pressed>` with its lens and label inside it, lit while it is held.
 * `class` and `style` go on the row (the button, for a momentary lamp), every other attribute and listener on the native
 * control, which the component exposes as `input`. `v-model` is a boolean on a toggle lamp. A momentary lamp's press and
 * the opt-in feedback are `attachStrataLamps` from `@underglass/ui/dom`, attached once when a lamp mounts. The label
 * must not contain "on" or "off".
 */
import { defineComponent, h, mergeProps, onMounted, ref, type PropType } from "vue";
import { attachStrataLamps } from "../dom/lamp.ts";
import { lampMarkup, type StrataLampColour } from "../shared/lamp.ts";
import { classes, splitAttrs, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const Lamp = defineComponent({
  name: "StrataLamp",
  inheritAttrs: false,
  props: {
    /** Whether a toggle lamp is lit; use `v-model`. */
    modelValue: { type: Boolean, default: undefined },
    /** The lens colour: `glowOn` (amber) by default, or a status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    /** A momentary lamp: a button that is lit while it is pressed (`aria-pressed`), not a switch. */
    momentary: { type: Boolean, default: false },
    /** The label before the lamp; the DOM order stays. */
    reverse: { type: Boolean, default: false },
    invalid: { type: Boolean, default: false },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | HTMLButtonElement | null>(null);
    expose({ input });
    onMounted(() => attachStrataLamps());
    return () => {
      const parts = [
        h("span", { class: "ug-lamp__object", "aria-hidden": "true" }, lampMarkup.map(part => h("span", { class: part.className, ...(part.face ? { "data-strata-face": part.face } : {}) }))),
        h("span", { class: "ug-lamp__label" }, slots.default?.()),
      ];
      const attributes = { ...strataAttributes(props), ...(props.colour ? { "data-strata-colour": props.colour } : {}) };
      const { row, control } = splitAttrs(attrs);
      const rowClasses = (extra?: unknown) => classes("ug-lamp", props.momentary && "ug-lamp--momentary", props.reverse && "ug-lamp--reverse", extra as string);
      if (props.momentary) {
        const { required: _required, ...fieldButton } = field?.value ?? { id: undefined };
        // The whole attribute set goes on the button: it is the row and the control.
        return h("button", mergeProps({ ref: input, type: "button", "aria-pressed": "false", ...attributes, ...fieldButton, ...(props.invalid ? { "aria-invalid": "true" } : {}) },
          { ...control, class: rowClasses(row.class), style: row.style }), parts);
      }
      return h("label", { ...row, class: rowClasses(row.class), ...attributes }, [
        h("input", mergeProps({
          ref: input, class: "ug-lamp__input", type: "checkbox", role: "switch", ...field?.value,
          ...(props.invalid ? { "aria-invalid": "true" } : {}),
          ...(props.modelValue !== undefined ? { checked: props.modelValue } : {}),
          onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
        }, control)),
        ...parts,
      ]);
    };
  },
});
