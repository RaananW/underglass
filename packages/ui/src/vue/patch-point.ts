/**
 * PatchPoint and PatchBay for Vue 3 (anatomy page `patch-point.md`): a jack in a washer over a native `<input type="checkbox">`
 * (connected when checked) in its label row, or, with `button`, a `<button aria-pressed>` with its jack and label inside it,
 * connected while pressed. `class` and `style` go on the row (the button, for a button PatchPoint), every other attribute and
 * listener on the native control, which the component exposes as `input`. `v-model` is a boolean on a checkbox PatchPoint. `led` adds
 * a StatusLight lens that lights while the jack is connected. A button PatchPoint's toggle and the opt-in feedback are
 * `attachStrataPatchPoints` from `@underglass/ui/dom`, attached once when a jack mounts. PatchBay is a `<fieldset>` of PatchPoints on
 * one plinth, named by its `legend`.
 */
import { defineComponent, h, mergeProps, onMounted, ref, type PropType } from "vue";
import { attachStrataPatchPoints } from "../dom/patch-point.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { patchBayModel, patchLedMarkup, patchPointMarkup } from "../shared/patch-point.ts";
import { classes, splitAttrs, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const PatchPoint = defineComponent({
  name: "StrataPatchPoint",
  inheritAttrs: false,
  props: {
    /** Whether a checkbox PatchPoint is connected; use `v-model`. */
    modelValue: { type: Boolean, default: undefined },
    /** A `<button aria-pressed>` instead of a checkbox: connected while pressed. */
    button: { type: Boolean, default: false },
    /** For a button PatchPoint, whether it is connected (`aria-pressed`); not pressed by default. */
    connected: { type: Boolean, default: false },
    /** An LED under the jack, lit while it is connected: `true` for the `success` colour, or a colour role. */
    led: { type: [Boolean, String] as PropType<boolean | StrataLampColour>, default: false },
    invalid: { type: Boolean, default: false },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | HTMLButtonElement | null>(null);
    expose({ input });
    onMounted(() => attachStrataPatchPoints());
    return () => {
      const colour = props.led === true ? "success" : props.led || undefined;
      const parts = [
        h("span", { class: "ug-patch-point__object", "aria-hidden": "true" }, patchPointMarkup.map(part => h("span", { class: part.className, ...(part.face ? { "data-strata-face": part.face } : {}) }))),
        ...(props.led ? [h("span", { class: "ug-status-light ug-patch-point__led", "aria-hidden": "true", ...(colour ? { "data-strata-colour": colour } : {}) }, [
          h("span", { class: "ug-status-light__object", "aria-hidden": "true" }, patchLedMarkup.map(part => h("span", { class: part.className, ...(part.face ? { "data-strata-face": part.face } : {}) }))),
        ])] : []),
        h("span", { class: "ug-patch-point__label" }, slots.default?.()),
      ];
      const attributes = strataAttributes(props);
      const { row, control } = splitAttrs(attrs);
      const rowClasses = (extra?: unknown) => classes("ug-patch-point", props.button && "ug-patch-point--button", extra as string);
      if (props.button) {
        const { required: _required, ...fieldButton } = field?.value ?? { id: undefined };
        // The whole attribute set goes on the button: it is the row and the control.
        return h("button", mergeProps({ ref: input, type: "button", "aria-pressed": props.connected ? "true" : "false", ...attributes, ...fieldButton, ...(props.invalid ? { "aria-invalid": "true" } : {}) },
          { ...control, class: rowClasses(row.class), style: row.style }), parts);
      }
      return h("label", { ...row, class: rowClasses(row.class), ...attributes }, [
        h("input", mergeProps({
          ref: input, class: "ug-patch-point__input", type: "checkbox", ...field?.value,
          ...(props.invalid ? { "aria-invalid": "true" } : {}),
          ...(props.modelValue !== undefined ? { checked: props.modelValue } : {}),
          onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
        }, control)),
        ...parts,
      ]);
    };
  },
});

export const PatchBay = defineComponent({
  name: "StrataPatchBay",
  props: {
    /** The legend, which names the group. */
    legend: { type: String, required: true },
    /** Fixed columns; as many as fit by default. */
    columns: { type: Number, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    return () => {
      const model = patchBayModel({ columns: props.columns });
      return h("fieldset", { class: "ug-patch-bay", "data-strata-face": "raised", ...strataAttributes(props), ...(model.style ? { style: model.style } : {}) }, [
        h("legend", { class: "ug-patch-bay__legend" }, props.legend),
        h("div", { class: "ug-patch-bay__jacks" }, slots.default?.()),
      ]);
    };
  },
});
