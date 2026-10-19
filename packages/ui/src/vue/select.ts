/**
 * Select for Vue 3 (anatomy page `select.md`): a native `<select>`, Field-aware, with `v-model` or `defaultValue`. `form="selector"` draws the
 * same native select as a RotarySelector's dial and `form="display"` as a Display window with two step buttons (`select.md` section 11); the
 * select, its options, keys and list are the native ones in both. `flush` and no form are the key with a chevron.
 */
import { Comment, Fragment, Text, defineComponent, h, mergeProps, onMounted, onUpdated, ref, useId, type PropType, type VNode, type VNodeChild } from "vue";
import { attachStrataRotarySelectors } from "../dom/rotary-selector.ts";
import { attachStrataSelectDisplays } from "../dom/select-display.ts";
import { displayAttributes, displayClasses, displayMarkup } from "../shared/display.ts";
import { pushMarkup } from "../shared/push-button.ts";
import { optionLabel, selectDisplayClass, selectForm, selectFormFor, selectOwner, selectorModel, selectSteps, type SelectOption, type StrataSelectForm } from "../shared/select-forms.ts";
import { classes, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

/** The text of an `<option>`'s children, or undefined where it is not plain text. */
function textOf(node: unknown): string | undefined {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) { const parts = node.map(textOf); return parts.some(part => part === undefined) ? undefined : parts.join(""); }
  if (typeof node === "object" && (node as VNode).type === Text) return textOf((node as VNode).children);
  return undefined;
}

/** The `<option>`s a Select's slot holds (through fragments and optgroups), and whether any sits in an optgroup; no options when one cannot be read. */
function readOptions(nodes: VNodeChild): { options?: SelectOption[]; grouped: boolean } {
  const options: SelectOption[] = [];
  let grouped = false, readable = true;
  const walk = (children: unknown) => {
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === null || child === undefined || typeof child === "boolean") continue;
      if (typeof child === "string" || typeof child === "number") { if (String(child).trim()) readable = false; continue; }
      const node = child as VNode;
      if (node.type === Comment) continue;
      if (node.type === Text) { if (String(node.children ?? "").trim()) readable = false; continue; }
      if (node.type === Fragment) walk(node.children);
      else if (node.type === "optgroup") { grouped = true; walk(node.children); }
      else if (node.type === "option") {
        const text = textOf(node.children), props = (node.props ?? {}) as { value?: unknown; disabled?: unknown };
        if (text === undefined) { readable = false; continue; }
        const label = optionLabel(text);
        options.push({ value: props.value !== undefined && props.value !== null ? String(props.value) : label, label, ...(props.disabled !== undefined && props.disabled !== false ? { disabled: true } : {}) });
      } else readable = false;
    }
  };
  walk(nodes);
  return { ...(readable ? { options } : {}), grouped };
}

/** A step button of a Select's display: a momentary push button, out of the tab order and hidden from assistive technology (the select is the control). */
const stepButton = (step: -1 | 1, disabled: boolean | undefined) => h("button", {
  type: "button", class: classes("ug-button", "ug-push", selectSteps[step < 0 ? 0 : 1].className), tabindex: "-1", "aria-hidden": "true", "data-strata-form": "momentary", "data-strata-step": String(step), disabled,
}, [
  h("span", { class: "ug-push__object", "aria-hidden": "true" }, pushMarkup("momentary").map(part => h("span", { class: part.className, "data-strata-face": part.face }))),
  h("span", { class: "ug-push__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-select-display__glyph" })]),
]);

export const Select = defineComponent({
  name: "StrataSelect",
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: undefined },
    /** Initial value when uncontrolled. */
    defaultValue: { type: String, default: undefined },
    invalid: { type: Boolean, default: false },
    /**
     * `selector` draws the same native select as a RotarySelector's dial (up to eight short options, no optgroup; otherwise it is drawn as `display`);
     * `display` as a Display window with two step buttons. `flush` and no form are the key with a chevron, and a list box (`multiple`) is always that.
     * Any other string is the native `form` attribute (the id of a form owner), as before. With a form, `class` and `style` reach the drawn root and
     * every other attribute the select.
     */
    form: { type: String as PropType<StrataSelectForm | "flush" | (string & {})>, default: undefined },
    /** A selector's turn from the first to the last option in degrees; the `knob.sweep` token (270) by default. */
    sweep: { type: Number, default: undefined },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { slots, emit, attrs }) {
    const field = useFieldControl();
    const generated = (useId() ?? "").replace(/[^a-zA-Z0-9_-]/g, "");
    const element = ref<HTMLSelectElement | null>(null);
    const own = ref<string | undefined>(props.defaultValue);
    // Options are children, so the value is applied once they exist.
    onMounted(() => { const value = props.modelValue ?? props.defaultValue; if (value !== undefined && element.value) element.value.value = value; });
    // A selector may be drawn as a display (see `selectFormFor`), so a form asked for attaches both behaviours, once per document.
    const attach = () => { if (selectForm(props.form)) { attachStrataRotarySelectors(); attachStrataSelectDisplays(); } };
    // A selector's value is the select's property, set after its options exist (Vue's `value` prop would also write an attribute, which the markup has no use for).
    let shown: string | undefined;
    const apply = () => { if (shown !== undefined && element.value && element.value.value !== shown) element.value.value = shown; };
    onMounted(() => { attach(); apply(); });
    onUpdated(() => { attach(); apply(); });
    return () => {
      const children = slots.default?.();
      const asked = selectForm(props.form);
      const shape = asked ? readOptions(children) : { grouped: false };
      const drawn = selectFormFor(asked, { ...shape, list: attrs.multiple !== undefined && attrs.multiple !== false });
      if (!drawn) {
        const owner = selectOwner(props.form);
        return h("select", mergeProps({
          ref: element, class: "ug-select", "data-strata-face": "raised", ...strataAttributes(props), ...field?.value,
          ...(props.invalid ? { "aria-invalid": "true" } : {}),
          ...(owner ? { form: owner } : {}),
          ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
          onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
        }, attrs), children);
      }
      const { class: rootClass, style: rootStyle, id: ownId, disabled: ownDisabled, required: ownRequired, ...selectAttrs } = attrs as Record<string, unknown>;
      const control = field?.value;
      const disabled = (ownDisabled as boolean | undefined) ?? control?.disabled;
      if (drawn === "selector") {
        const options = shape.options!, current = props.modelValue ?? own.value;
        const model = selectorModel(options, current, props.sweep);
        const selected = model.marks[model.index]?.value ?? "";
        shown = selected;
        return h("div", { class: classes("ug-rotary", rootClass as string), style: [model.style, rootStyle as never], "data-strata-form": "selector", ...strataAttributes(props) }, [
          h("div", { class: "ug-rotary__dial" }, [
            h("span", { class: "ug-rotary__scale", "aria-hidden": "true" }, model.marks.map(mark =>
              h("span", { key: mark.value, class: "ug-rotary__mark", "data-strata-value": mark.value, "data-strata-selected": String(mark.selected),
                ...(mark.disabled ? { "data-strata-disabled": "true" } : {}), style: mark.style }, [
                h("span", { class: "ug-rotary__tick" }), h("span", { class: "ug-rotary__text" }, mark.text),
              ]))),
            h("span", { class: "ug-rotary__skirt", "data-strata-face": "raised", "aria-hidden": "true" }, [
              h("span", { class: "ug-rotary__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-rotary__pointer" })]),
            ]),
            h("select", mergeProps({
              ref: element, class: "ug-rotary__select", id: (ownId as string | undefined) ?? control?.id ?? `select-${generated}`,
              required: (ownRequired as boolean | undefined) ?? control?.required,
              ...(props.invalid || control?.["aria-invalid"] ? { "aria-invalid": "true" } : {}),
              ...(control?.["aria-describedby"] ? { "aria-describedby": control["aria-describedby"] } : {}),
              disabled,
              onChange: (event: Event) => {
                const next = (event.target as HTMLSelectElement).value;
                if (props.modelValue === undefined) own.value = next;
                emit("update:modelValue", next);
              },
            }, selectAttrs), children),
          ]),
          h("ol", { class: "ug-rotary__legend", "aria-hidden": "true" }, model.marks.map(mark => h("li", { key: mark.value, "data-strata-selected": String(mark.selected) }, mark.text))),
        ]);
      }
      return h("span", { class: classes(selectDisplayClass, rootClass as string), style: rootStyle as never, "data-strata-form": "display", ...strataAttributes(props) }, [
        stepButton(-1, disabled),
        h("span", { class: classes(...displayClasses(false), "ug-select-display__window"), ...displayAttributes({}) }, [
          h("span", { class: "ug-display__object", "aria-hidden": "true" }, [
            h("span", { class: displayMarkup.bezel.className, "data-strata-face": displayMarkup.bezel.face }, [
              h("span", { class: displayMarkup.window.className, "data-strata-face": displayMarkup.window.face }),
            ]),
          ]),
          h("select", mergeProps({
            ref: element, class: "ug-display__text ug-select-display__select", ...control, ...(ownId !== undefined ? { id: ownId as string } : {}), ...(ownRequired !== undefined ? { required: ownRequired as boolean } : {}),
            ...(props.invalid ? { "aria-invalid": "true" } : {}), disabled,
            ...(props.modelValue !== undefined ? { value: props.modelValue } : {}),
            onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
          }, selectAttrs), children),
        ]),
        stepButton(1, disabled),
      ]);
    };
  },
});
