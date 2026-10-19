/**
 * Pad and PadGrid for Vue 3 (anatomy page `pad.md`): a native `<button>` drawn as a square soft cap lit from below, in a grid. A `Pad`
 * is momentary (lit and down while it is held) or, with `latching`, a toggle (`aria-pressed`, lit and resting at 0.45 of its travel
 * while on): `v-model:pressed`, or `defaultPressed` uncontrolled. `colour` is the glow's role (`glowOn`, amber, by default). The `icon`
 * slot is an optional decorative icon before the label. Attributes and listeners fall through to the native button. The optional press
 * velocity (0–1: the pointer's pressure where the hardware reports it, else where on the cap the press lands, the keys 1) comes in the
 * `velocity` event with its source; nothing depends on it. A `PadGrid` is the `<div role="group">` the pads stand in: `columns` (4 by
 * default) and `label` (its accessible name); inside it the pads are one tab stop and the arrow keys move between them (the grid
 * pattern, `attachStrataPads`).
 */
import { defineComponent, h, onMounted, onUpdated, ref, type PropType } from "vue";
import { attachStrataPads, type PadVelocity } from "../dom/pad.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { gridStyle, padMarkup } from "../shared/pad.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

const blocked = (value: unknown) => value === true || value === "true";

export const Pad = defineComponent({
  name: "StrataPad",
  props: {
    /** The glow's colour: `glowOn` (amber) by default, or a status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    /** A latching pad: a toggle (`aria-pressed`) that stays down and lit while on. */
    latching: { type: Boolean, default: false },
    /** Controlled state of a latching pad; use `v-model:pressed`. */
    pressed: { type: Boolean, default: undefined },
    defaultPressed: { type: Boolean, default: false },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    ...strataProps,
  },
  emits: {
    "update:pressed": (pressed: boolean) => typeof pressed === "boolean",
    velocity: (velocity: number, source: PadVelocity["source"]) => typeof velocity === "number" && typeof source === "string",
  },
  setup(props, { attrs, slots, emit, expose }) {
    const own = ref(props.defaultPressed), button = ref<HTMLButtonElement | null>(null);
    expose({ button });
    // A pad is held down while it is pressed, reports its velocity, plays its feedback and runs the grid keys (`dom/pad.ts`), once per document.
    onMounted(() => attachStrataPads());
    onUpdated(() => attachStrataPads());
    const listen = (event: Event) => { const { velocity, source } = (event as CustomEvent<PadVelocity>).detail; emit("velocity", velocity, source); };
    return () => {
      const current = props.pressed ?? own.value;
      return h("button", {
        ref: button, type: props.type, class: classes("ug-pad"),
        ...(props.colour ? { "data-strata-colour": props.colour } : {}),
        ...(props.latching ? { "aria-pressed": String(current) } : {}),
        ...strataAttributes(props),
        onClickCapture: (event: MouseEvent) => { if (blocked(attrs["aria-disabled"])) { event.preventDefault(); event.stopImmediatePropagation(); } },
        "onStrata-pad-velocity": listen,
        onClick: (event: MouseEvent) => {
          if (!props.latching || event.defaultPrevented) return;
          if (props.pressed === undefined) own.value = !current;
          emit("update:pressed", !current);
        },
      }, [
        h("span", { class: "ug-pad__object", "aria-hidden": "true" }, padMarkup.map(part => h("span", { class: part.className, "data-strata-face": part.face }))),
        h("span", { class: "ug-pad__cap", "data-strata-face": "raised" }, [
          slots.icon && h("span", { class: "ug-pad__icon", "aria-hidden": "true" }, slots.icon()),
          h("span", { class: "ug-pad__label" }, slots.default?.()),
        ]),
      ]);
    };
  },
});

export const PadGrid = defineComponent({
  name: "StrataPadGrid",
  props: {
    /** The grid's accessible name. */
    label: { type: String, required: true },
    /** The columns (4 by default). */
    columns: { type: Number, default: undefined },
    ...strataProps,
  },
  setup(props, { slots }) {
    onMounted(() => attachStrataPads());
    return () => h("div", { class: classes("ug-pad-grid"), role: "group", "aria-label": props.label, ...strataAttributes(props), style: gridStyle("pad", props.columns) }, slots.default?.());
  },
});
