/**
 * StatusLight for Vue 3 (anatomy page `status-light.md`): a small lens that shows a state, named by its `label`. By
 * default a `<span role="img" aria-label>`; `showLabel` shows the label as text beside the lens; `live` makes it an
 * `<output>` (a polite live region, `"assertive"` for an assertive one), so a change of label names the change to a
 * screen reader. Attributes and listeners fall through to the root. `blink` is a tempo token, off under reduced motion:
 * a light's meaning is its label, never its colour or its blink.
 */
import { defineComponent, h, type PropType } from "vue";
import type { StrataLampColour } from "../shared/lamp.ts";
import { statusLightMarkup, statusLightModel, type StatusLive, type StrataBlink } from "../shared/status-light.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

export const StatusLight = defineComponent({
  name: "StrataStatusLight",
  props: {
    /** What the light says: its accessible name (or, shown or announced, its text). Required. */
    label: { type: String, required: true },
    /** The lens colour: `glowOn` (amber) by default, or a status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    /** Lit by default; `false` is an unlit lens. */
    lit: { type: Boolean, default: true },
    /** A tempo token (`slow`, `normal` or `fast`); a lit light only, and not under reduced motion. */
    blink: { type: String as PropType<StrataBlink>, default: undefined },
    /** Show the label as text beside the lens. */
    showLabel: { type: Boolean, default: false },
    /** An `<output>` live region that names changes of the label. */
    live: { type: [Boolean, String] as PropType<StatusLive>, default: undefined },
    ...strataProps,
  },
  setup(props) {
    return () => {
      const model = statusLightModel({ label: props.label, colour: props.colour, lit: props.lit, blink: props.blink, showLabel: props.showLabel, live: props.live });
      return h(model.tag, { class: classes(...model.classes), ...strataAttributes(props), ...model.attrs }, [
        h("span", { class: "ug-status-light__object", "aria-hidden": "true" }, statusLightMarkup.map(part => h("span", { class: part.className, "data-strata-face": part.face }))),
        model.text ? h("span", { class: "ug-status-light__text" }, props.label) : null,
      ]);
    };
  },
});
