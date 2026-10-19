/**
 * Keypad and KeypadKey for Vue 3 (anatomy page `keypad.md`): a native `<fieldset>` of `<button>`s, machined square caps with a printed
 * legend on one polished plinth. `label` is the fieldset's `<legend>` (or give `aria-label`); `columns` (3 by default) lays the keys out;
 * `shifted` prints each key's `shift` legend large and its first legend small, below it (the application decides when the keypad is
 * shifted). Attributes and listeners fall through to the fieldset. A `KeypadKey`'s default slot is its printed legend, `shift` an
 * optional second, smaller legend; a key's name is its printed legends (give `aria-label` to say otherwise); other attributes
 * (`value`, `name`, `disabled`) and listeners fall through to the native button. A `disabled` keypad disables every key. The keys are
 * one tab stop and the arrow keys move between them (the grid pattern, `attachStrataKeypads`).
 */
import { defineComponent, h, onMounted, onUpdated, type PropType } from "vue";
import { attachStrataKeypads } from "../dom/keypad.ts";
import { gridStyle } from "../shared/pad.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export const Keypad = defineComponent({
  name: "StrataKeypad",
  inheritAttrs: false,
  props: {
    /** The group's name, printed above the keys as the fieldset's legend. */
    label: { type: String, default: undefined },
    /** The columns (3 by default). */
    columns: { type: Number, default: undefined },
    /** Print each key's `shift` legend large. */
    shifted: { type: Boolean, default: false },
    ...strataProps,
  },
  setup(props, { attrs, slots }) {
    onMounted(() => attachStrataKeypads());
    return () => {
      const { class: className, style, ...rest } = attrs;
      const columns = gridStyle("keypad", props.columns);
      return h("fieldset", {
        class: classes("ug-keypad", className as string | undefined), ...(props.shifted ? { "data-strata-shifted": "true" } : {}), ...strataAttributes(props),
        style: columns && style ? [columns, style] : columns ?? style, ...rest,
      }, [
        props.label !== undefined && h("legend", { class: "ug-keypad__legend" }, props.label),
        h("div", { class: "ug-keypad__plinth", "data-strata-face": "raised" }, slots.default?.()),
      ]);
    };
  },
});

export const KeypadKey = defineComponent({
  name: "StrataKeypadKey",
  props: {
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    ...strataProps,
  },
  setup(props, { slots }) {
    onMounted(() => attachStrataKeypads());
    onUpdated(() => attachStrataKeypads());
    return () => h("button", { type: props.type, class: "ug-keypad__key", ...strataAttributes(props) }, [
      h("span", { class: "ug-keypad__cap", "data-strata-face": "raised" }, [
        h("span", { class: "ug-keypad__print" }, slots.default?.()),
        slots.shift && h("span", { class: "ug-keypad__shift" }, slots.shift()),
      ]),
    ]);
  },
});
