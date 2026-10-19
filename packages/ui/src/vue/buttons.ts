/**
 * Button, IconButton, ToggleButton, ButtonGroup and Link for Vue 3 (anatomy pages `button.md`, `icon-button.md`,
 * `toggle-button.md`, `button-group.md`, `link.md`). Attributes and listeners fall through to the native element.
 * `aria-disabled` blocks activation and keeps the control focusable.
 */
import { defineComponent, h, onMounted, onUpdated, ref, type PropType, type VNode } from "vue";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { buttonPushForm, pushMarkup, togglePushForm, type StrataPushForm } from "../shared/push-button.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

/** A push button's decorative object (`pushMarkup`): inside `<span class="ug-push__object" aria-hidden="true">`. */
const pushObject = (form: StrataPushForm): VNode =>
  h("span", { class: "ug-push__object", "aria-hidden": "true" }, pushMarkup(form).map(part => h("span", { class: part.className, "data-strata-face": part.face })));

const blocked = (value: unknown) => value === true || value === "true";

/** Stops a click on an `aria-disabled` control before any listener sees it. */
const guard = (attrs: Record<string, unknown>) => (event: MouseEvent) => {
  if (blocked(attrs["aria-disabled"])) { event.preventDefault(); event.stopImmediatePropagation(); }
};

export const Button = defineComponent({
  name: "StrataButton",
  props: {
    variant: { type: String as PropType<"secondary" | "accent" | "danger">, default: "secondary" },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    busy: { type: Boolean, default: false },
    /**
     * The push-button form (anatomy page `button.md`, *Push-button forms*): `momentary`, the same native button drawn as a
     * machined cap with a lit ring that lights while it is held. Absent, it is the Strata button. Any other string is the
     * native `form` attribute (the id of the button's form owner), as before.
     */
    form: { type: String as PropType<"momentary" | (string & {})>, default: undefined },
    /** The lit ring's colour of a push button: `glowOn` (amber) by default, or a status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    ...strataProps,
  },
  setup(props, { attrs, slots }) {
    // A push button is held down while it is pressed and plays its feedback (`dom/push-button.ts`), once per document.
    onMounted(() => { if (buttonPushForm(props.form)) attachStrataPushButtons(); });
    onUpdated(() => { if (buttonPushForm(props.form)) attachStrataPushButtons(); });
    return () => {
      const push = buttonPushForm(props.form);
      const content = [
        slots.icon && h("span", { class: "ug-button__icon", "aria-hidden": "true" }, slots.icon()),
        h("span", { class: "ug-button__label" }, slots.default?.()),
      ];
      return h("button", {
        type: props.type,
        class: classes("ug-button", push && "ug-push", props.variant !== "secondary" && `ug-button--${props.variant}`),
        ...(push ? { "data-strata-form": push, "data-strata-colour": props.colour } : { "data-strata-face": "raised" }),
        "aria-busy": props.busy ? "true" : undefined,
        ...strataAttributes(props),
        ...(props.form !== undefined && !push ? { form: props.form } : {}),
        onClickCapture: guard(attrs),
      }, push ? [pushObject(push), h("span", { class: "ug-push__cap", "data-strata-face": "raised" }, content)] : content);
    };
  },
});

export const IconButton = defineComponent({
  name: "StrataIconButton",
  props: {
    /** The accessible name; an icon-only button has no visible text. */
    label: { type: String, required: true },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    ...strataProps,
  },
  setup(props, { attrs, slots }) {
    return () => h("button", {
      type: props.type, class: "ug-icon-button", "data-strata-face": "raised", "aria-label": props.label,
      ...strataAttributes(props), onClickCapture: guard(attrs),
    }, [h("span", { class: "ug-icon-button__icon", "aria-hidden": "true" }, slots.default?.())]);
  },
});

export const ToggleButton = defineComponent({
  name: "StrataToggleButton",
  props: {
    /** Controlled state; use `v-model:pressed`. */
    pressed: { type: Boolean, default: undefined },
    defaultPressed: { type: Boolean, default: false },
    type: { type: String as PropType<"button" | "submit" | "reset">, default: "button" },
    /**
     * The push-button form (anatomy page `toggle-button.md`, *Push-button forms*): `latching`, the same native toggle drawn as
     * a machined cap that stays down while pressed in, with a lit ring and an LED. Absent, it is the Strata toggle button.
     * Any other string is the native `form` attribute (the id of the button's form owner), as before.
     */
    form: { type: String as PropType<"latching" | (string & {})>, default: undefined },
    /** The lit ring's and LED's colour of a push button: `glowOn` (amber) by default, or a status role. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    ...strataProps,
  },
  emits: { "update:pressed": (pressed: boolean) => typeof pressed === "boolean" },
  setup(props, { attrs, slots, emit }) {
    const own = ref(props.defaultPressed);
    onMounted(() => { if (togglePushForm(props.form)) attachStrataPushButtons(); });
    onUpdated(() => { if (togglePushForm(props.form)) attachStrataPushButtons(); });
    return () => {
      const current = props.pressed ?? own.value;
      const push = togglePushForm(props.form);
      const label = h("span", { class: "ug-toggle-button__label" }, slots.default?.());
      return h("button", {
        type: props.type, class: classes("ug-toggle-button", push && "ug-push"),
        ...(push ? { "data-strata-form": push, "data-strata-colour": props.colour } : { "data-strata-face": "raised" }), "aria-pressed": String(current),
        ...strataAttributes(props),
        ...(props.form !== undefined && !push ? { form: props.form } : {}),
        onClickCapture: guard(attrs),
        onClick: (event: MouseEvent) => {
          if (event.defaultPrevented) return;
          if (props.pressed === undefined) own.value = !current;
          emit("update:pressed", !current);
        },
      }, push ? [pushObject(push), h("span", { class: "ug-push__cap", "data-strata-face": "raised" }, [label])] : [label]);
    };
  },
});

export const ButtonGroup = defineComponent({
  name: "StrataButtonGroup",
  props: {
    /** The group's accessible name. */
    label: { type: String, required: true },
    orientation: { type: String as PropType<"horizontal" | "vertical">, default: "horizontal" },
    ...strataProps,
  },
  setup(props, { slots }) {
    return () => h("div", {
      class: classes("ug-button-group", props.orientation === "vertical" && "ug-button-group--vertical"),
      role: "group", "aria-label": props.label, "data-strata-face": "raised", ...strataAttributes(props),
    }, slots.default?.());
  },
});

export const Link = defineComponent({
  name: "StrataLink",
  props: {
    href: { type: String, required: true },
    /** A link that stands alone rather than inside a sentence: at least 24 by 24. */
    standalone: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => h("a", { class: classes("ug-link", props.standalone && "ug-link--standalone"), href: props.href }, slots.default?.());
  },
});
