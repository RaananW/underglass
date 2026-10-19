/**
 * Display for Vue 3 (anatomy page `display.md`): a read-only glass window in a bezel over a native `<output>`, backlit. The
 * text is the slot, printed under the glass; `<output>` is a polite live region natively, so a changed value is announced once
 * (`live="off"` for a value that changes faster than it can be read, `"assertive"` for an urgent one). It is never submitted
 * with a form: a value that must submit is a TextField with `form="display"` and `readonly`. Attributes and listeners reach the
 * `<output>`; `class` and `style` go on the display's root; the component exposes `output`. A value that changes at frame rate
 * goes through `driveStrataDisplay` from `@underglass/ui/dom`.
 */
import { defineComponent, h, ref, type PropType } from "vue";
import { displayAttributes, displayClasses, type StrataDisplayBacklight, type StrataDisplayLive } from "../shared/display.ts";
import { displayObject } from "./fields.ts";
import { classes, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

export const Display = defineComponent({
  name: "StrataDisplay",
  inheritAttrs: false,
  props: {
    /** The accessible name (`aria-label`); leave it out when `aria-labelledby` or a `<label for>` names the display. */
    label: { type: String, default: undefined },
    /** How a changed value is announced: `off`, `polite` (the native default, no attribute) or `assertive`. */
    live: { type: String as PropType<StrataDisplayLive>, default: undefined },
    /** The backlight: a colour role (`glowOn` by default) or `off`. */
    backlight: { type: String as PropType<StrataDisplayBacklight>, default: undefined },
    /** The backlight is lit by default; `false` switches it off. */
    lit: { type: Boolean, default: undefined },
    ...strataProps,
  },
  setup(props, { attrs, slots, expose }) {
    const field = useFieldControl();
    const output = ref<HTMLOutputElement | null>(null);
    expose({ output });
    return () => {
      const { class: className, style, ...rest } = attrs;
      return h("span", { class: classes(...displayClasses(true), className as string), style, ...strataAttributes(props), ...displayAttributes({ backlight: props.backlight, lit: props.lit }) }, [
        displayObject(),
        h("output", { ref: output, class: "ug-display__text", ...(field?.value.id ? { id: field.value.id } : {}), ...(field?.value["aria-describedby"] ? { "aria-describedby": field.value["aria-describedby"] } : {}),
          ...(props.label !== undefined ? { "aria-label": props.label } : {}), ...(props.live === "off" || props.live === "assertive" ? { "aria-live": props.live } : {}), ...rest }, slots.default?.()),
      ]);
    };
  },
});
