/**
 * Checkbox, Switch, RadioGroup and Radio for Vue 3 (anatomy pages `checkbox.md`, `switch.md`, `radio.md`). Each
 * control sits in its label row: `class` and `style` go on the row, every other attribute and listener on the native
 * input. `v-model` works on Checkbox and Switch (a boolean) and on RadioGroup (the selected value).
 */
import { Comment, Fragment, Text, computed, defineComponent, h, inject, mergeProps, onMounted, onUpdated, provide, ref, useId, type ComputedRef, type InjectionKey, type PropType, type VNode, type VNodeChild } from "vue";
import { attachStrataPushButtons } from "../dom/push-button.ts";
import { attachStrataRotarySelectors } from "../dom/rotary-selector.ts";
import { attachStrataSwitches } from "../dom/switch.ts";
import { bankMarkup, checkboxMarkup, latchForm, nativeForm } from "../shared/latching-forms.ts";
import { radioAt, radioForm, radioFormFor, radioOwner, radioSelectorModel, type RadioOption, type StrataRadioForm } from "../shared/radio-forms.ts";
import { optionLabel } from "../shared/select-forms.ts";
import type { StrataLampColour } from "../shared/lamp.ts";
import { isSwitchForm, switchFormMarkup, type StrataSwitchForm, type SwitchPart } from "../shared/switch-forms.ts";
import { classes, splitAttrs, strataAttributes, strataProps, useFieldControl } from "./shared.ts";

const choiceProps = {
  modelValue: { type: Boolean, default: undefined },
  invalid: { type: Boolean, default: false },
  ...strataProps,
};

export const Checkbox = defineComponent({
  name: "StrataCheckbox",
  inheritAttrs: false,
  props: {
    ...choiceProps,
    /** The mixed state, set as a property on every render; a click clears it, as native. */
    indeterminate: { type: Boolean, default: false },
    /**
     * The form (anatomy page `checkbox.md`, *Latching forms*): `latching`, a small latching square button whose ring lights when it is
     * checked; `flush`, or absent, is the look it had before. Any other string is the native `form` attribute, as before.
     */
    form: { type: String as PropType<"latching" | "flush" | (string & {})>, default: undefined },
    /** The lit ring's colour of a latching checkbox. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    const sync = () => { if (input.value) input.value.indeterminate = props.indeterminate; };
    // A latching key is held down while it is pressed and plays its feedback (`dom/push-button.ts`), once per document.
    const attach = () => { if (latchForm(props.form)) attachStrataPushButtons(); };
    onMounted(() => { sync(); attach(); });
    onUpdated(() => { sync(); attach(); });
    expose({ input });
    return () => {
      const { row, control } = splitAttrs(attrs);
      const latching = latchForm(props.form), owner = nativeForm(props.form, "latching");
      const native = h("input", mergeProps({
        ref: input, class: "ug-checkbox__input", ...(latching ? {} : { "data-strata-face": "well" }), type: "checkbox", ...field?.value,
        ...(props.invalid ? { "aria-invalid": "true" } : {}),
        ...(owner !== undefined ? { form: owner } : {}),
        ...(props.modelValue !== undefined ? { checked: props.modelValue } : {}),
        onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
      }, control));
      if (latching) return h("label", { ...row, class: classes("ug-checkbox", row.class as string), ...strataAttributes(props), "data-strata-form": latching }, [
        h("span", { class: "ug-push ug-latch ug-latch--key", ...(props.colour ? { "data-strata-colour": props.colour } : {}) }, [
          native,
          h("span", { class: "ug-push__object", "aria-hidden": "true" }, checkboxMarkup.map(part => h("span", { class: part.className, "data-strata-face": part.face }))),
          h("span", { class: "ug-push__cap", "data-strata-face": "raised", "aria-hidden": "true" }, [h("span", { class: "ug-checkbox__mark" })]),
        ]),
        h("span", { class: "ug-checkbox__label" }, slots.default?.()),
      ]);
      return h("label", { ...row, class: classes("ug-checkbox", row.class as string), ...strataAttributes(props) }, [
        native,
        h("span", { class: "ug-checkbox__mark", "data-strata-face": "mark", "aria-hidden": "true" }),
        h("span", { class: "ug-checkbox__label" }, slots.default?.()),
      ]);
    };
  },
});

export const Switch = defineComponent({
  name: "StrataSwitch",
  inheritAttrs: false,
  props: {
    ...choiceProps,
    /** The label before the track; the DOM order stays. */
    reverse: { type: Boolean, default: false },
    /**
     * The hardware form (anatomy page `switch.md`, *Forms*): `slide`, `rocker`, `bat` or `wall`. Absent, it is the Strata
     * switch. Any other string is the native `form` attribute (the id of the input's form owner), as before.
     */
    form: { type: String as PropType<StrataSwitchForm | (string & {})>, default: undefined },
  },
  emits: ["update:modelValue"],
  setup(props, { attrs, slots, emit, expose }) {
    const field = useFieldControl();
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    // A hardware form throws on a drag past centre and plays its feedback (`dom/switch.ts`), once per document.
    onMounted(() => { if (isSwitchForm(props.form)) attachStrataSwitches(); });
    onUpdated(() => { if (isSwitchForm(props.form)) attachStrataSwitches(); });
    const parts = (list: SwitchPart[]): VNode[] => list.map(part => h("span", { class: part.className, ...(part.face ? { "data-strata-face": part.face } : {}) }, part.children ? parts(part.children) : undefined));
    return () => {
      const { row, control } = splitAttrs(attrs);
      const hardware = isSwitchForm(props.form) ? props.form : undefined;
      return h("label", { ...row, class: classes("ug-switch", props.reverse && "ug-switch--reverse", row.class as string), ...strataAttributes(props), ...(hardware ? { "data-strata-form": hardware } : {}) }, [
        h("input", mergeProps({
          ref: input, class: "ug-switch__input", ...(hardware ? {} : { "data-strata-face": "well" }), type: "checkbox", role: "switch", ...field?.value,
          ...(props.form !== undefined && !hardware ? { form: props.form } : {}),
          ...(props.invalid ? { "aria-invalid": "true" } : {}),
          ...(props.modelValue !== undefined ? { checked: props.modelValue } : {}),
          onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).checked),
        }, control)),
        hardware
          ? h("span", { class: "ug-switch__object", "aria-hidden": "true" }, parts(switchFormMarkup[hardware]))
          : h("span", { class: "ug-switch__knob", "data-strata-face": "knob", "aria-hidden": "true" }),
        h("span", { class: "ug-switch__label" }, slots.default?.()),
      ]);
    };
  },
});

interface GroupContext {
  name: string;
  value?: string;
  defaultValue?: string;
  invalid: boolean;
  required: boolean;
  bank: boolean;
  colour?: StrataLampColour;
  /** `selector`: the group is a rotary selector, and its radios are printed round the dial at their positions. */
  selector?: { positions: ReadonlyMap<string, number>; count: number };
  select: (value: string) => void;
}

const groupKey: InjectionKey<ComputedRef<GroupContext>> = Symbol("strata-radio-group");

/** The text of a node, or undefined where it is not plain text. */
function textOf(node: unknown): string | undefined {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) { const parts = node.map(textOf); return parts.some(part => part === undefined) ? undefined : parts.join(""); }
  if (typeof node === "object" && (node as VNode).type === Text) return textOf((node as VNode).children);
  return undefined;
}

/** The radios a group's slot holds (through fragments), or undefined when one cannot be read: a child that is not a `Radio`, or a label that is not plain text. */
function readRadios(nodes: VNodeChild): RadioOption[] | undefined {
  const options: RadioOption[] = [];
  let readable = true;
  const walk = (children: unknown) => {
    for (const child of Array.isArray(children) ? children : [children]) {
      if (child === null || child === undefined || typeof child === "boolean") continue;
      if (typeof child === "string" || typeof child === "number") { if (String(child).trim()) readable = false; continue; }
      const node = child as VNode;
      if (node.type === Comment) continue;
      if (node.type === Text) { if (String(node.children ?? "").trim()) readable = false; continue; }
      if (node.type === Fragment) { walk(node.children); continue; }
      const props = (node.props ?? {}) as { value?: unknown; disabled?: unknown };
      if (node.type === Radio && typeof props.value === "string") {
        const slot = (node.children as { default?: () => unknown } | null)?.default, text = textOf(typeof slot === "function" ? slot() : node.children);
        if (text === undefined) { readable = false; continue; }
        options.push({ value: props.value, label: optionLabel(text), ...(props.disabled !== undefined && props.disabled !== false ? { disabled: true } : {}) });
      } else readable = false;
    }
  };
  walk(nodes);
  return readable ? options : undefined;
}

export const RadioGroup = defineComponent({
  name: "StrataRadioGroup",
  props: {
    /** The question, rendered as the `<legend>`. */
    legend: { type: String, required: true },
    name: { type: String, default: undefined },
    /** The selected value; use `v-model`. */
    modelValue: { type: String, default: undefined },
    defaultValue: { type: String, default: undefined },
    help: { type: String, default: undefined },
    error: { type: String, default: undefined },
    required: { type: Boolean, default: false },
    errorPrefix: { type: String, default: "Error:" },
    /**
     * The form (anatomy page `radio.md`, section 11): `bank`, a preset bank of interlocking latching buttons on one plinth; `selector`, the
     * RotarySelector's dial over the same native radios (2 to 8 radios of at most 12 characters, otherwise it is drawn as a `bank`; the `Radio`s
     * must be direct children with a plain-text label). `flush`, or absent, is the look it had before. Any other string is the native `form`
     * attribute of the fieldset, as before.
     */
    form: { type: String as PropType<StrataRadioForm | "flush" | (string & {})>, default: undefined },
    /** A selector's turn from the first to the last radio in degrees; the `knob.sweep` token (270) by default. */
    sweep: { type: Number, default: undefined },
    /** The LEDs' colour of a bank. */
    colour: { type: String as PropType<StrataLampColour>, default: undefined },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { slots, emit }) {
    const generated = useId();
    const name = computed(() => props.name ?? `radio-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`);
    const own = ref<string | undefined>(props.defaultValue);
    // The form actually drawn, from the radios the slot holds (`radioFormFor`): a selector that does not fit is a bank.
    let options: RadioOption[] | undefined;
    const drawnOf = (children: VNodeChild) => {
      const asked = radioForm(props.form);
      options = asked === "selector" ? readRadios(children) : undefined;
      return radioFormFor(asked, options);
    };
    let drawn: StrataRadioForm | undefined = radioForm(props.form);
    // Read fresh on every access (not a cached computed): the radios render after the group has worked out which form it draws, which the slot can change.
    provide(groupKey, { get value() { return context(); } } as unknown as ComputedRef<GroupContext>);
    const context = (): GroupContext => ({
      name: name.value, value: drawn === "selector" ? props.modelValue ?? own.value : props.modelValue, defaultValue: drawn === "selector" ? undefined : props.defaultValue, invalid: !!props.error, required: props.required,
      bank: drawn === "bank", colour: props.colour,
      ...(drawn === "selector" && options ? { selector: { positions: new Map(options.map((option, index) => [option.value, index])), count: options.length } } : {}),
      select: (value: string) => { own.value = value; emit("update:modelValue", value); },
    });
    // A bank's keys are held down while they are pressed and play their feedback (`dom/push-button.ts`); a selector's dial has its own behaviour; both once per document.
    const attach = () => { if (drawn === "bank") attachStrataPushButtons(); if (drawn === "selector") attachStrataRotarySelectors(); };
    onMounted(attach);
    onUpdated(attach);
    return () => {
      const describedBy = [props.help ? `${name.value}-help` : undefined, props.error ? `${name.value}-error` : undefined].filter(Boolean).join(" ") || undefined;
      const children = slots.default?.();
      drawn = drawnOf(children);
      const owner = radioOwner(props.form);
      const current = props.modelValue ?? own.value;
      const model = drawn === "selector" && options ? radioSelectorModel(options, current, props.sweep) : undefined;
      return h("fieldset", { class: "ug-radio-group", "aria-describedby": describedBy, ...strataAttributes(props), ...(drawn ? { "data-strata-form": drawn } : {}), ...(owner !== undefined ? { form: owner } : {}) }, [
        h("legend", { class: "ug-radio-group__legend" }, props.legend),
        drawn === "bank" ? h("div", { class: "ug-bank__plinth", "data-strata-face": "raised" }, children) : model
          ? h("div", { class: "ug-rotary ug-rotary--group", style: model.style }, [
            h("div", { class: "ug-rotary__dial" }, [
              h("span", { class: "ug-rotary__scale" }, children),
              h("span", { class: "ug-rotary__skirt", "data-strata-face": "raised", "aria-hidden": "true" }, [h("span", { class: "ug-rotary__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-rotary__pointer" })])]),
            ]),
            h("ol", { class: "ug-rotary__legend", "aria-hidden": "true" }, model.marks.map(mark => h("li", { key: mark.value, "data-strata-selected": String(current === mark.value) }, mark.text))),
          ])
          : children,
        props.help && h("p", { class: "ug-field__help", id: `${name.value}-help` }, props.help),
        props.error && h("p", { class: "ug-field__error", id: `${name.value}-error` }, `${props.errorPrefix} ${props.error}`),
      ]);
    };
  },
});

export const Radio = defineComponent({
  name: "StrataRadio",
  inheritAttrs: false,
  props: {
    value: { type: String, required: true },
    ...strataProps,
  },
  setup(props, { attrs, slots, expose }) {
    const group = inject(groupKey, undefined);
    const input = ref<HTMLInputElement | null>(null);
    expose({ input });
    return () => {
      const { row, control } = splitAttrs(attrs);
      const context = group?.value;
      // Controlled: the checked property. Uncontrolled: the checked attribute (the default selection), as in HTML.
      const selection = context?.value !== undefined ? { checked: context.value === props.value }
        : context?.defaultValue === props.value ? { "^checked": "" } : {};
      const native = h("input", mergeProps({
        ref: input, class: context?.selector ? "ug-rotary__radio" : "ug-radio__input", ...(context?.bank || context?.selector ? {} : { "data-strata-face": "well" }), type: "radio", name: context?.name, value: props.value,
        ...(context?.required ? { required: true } : {}), ...(context?.invalid ? { "aria-invalid": "true" } : {}),
        ...selection,
        onChange: (event: Event) => { if ((event.target as HTMLInputElement).checked) context?.select(props.value); },
      }, control));
      // A radio of a selector: its label printed round the dial at its position, the input an invisible overlay on the print.
      if (context?.selector) return h("label", { ...row, class: classes("ug-rotary__mark", row.class as string), style: [radioAt(context.selector.positions.get(props.value) ?? 0, context.selector.count), row.style as never],
        "data-strata-value": props.value, "data-strata-selected": String(context.value === props.value), ...(control.disabled !== undefined && control.disabled !== false ? { "data-strata-disabled": "true" } : {}), ...strataAttributes(props) }, [
        h("span", { class: "ug-rotary__tick", "aria-hidden": "true" }),
        h("span", { class: "ug-rotary__text" }, [native, slots.default?.()]),
      ]);
      // A key of a preset bank: the input over the key, the LED on the plinth, the label printed on the cap.
      if (context?.bank) return h("label", { ...row, class: classes("ug-radio", row.class as string), ...strataAttributes(props) }, [
        h("span", { class: "ug-push ug-latch ug-latch--bank", ...(context.colour ? { "data-strata-colour": context.colour } : {}) }, [
          native,
          h("span", { class: "ug-push__object", "aria-hidden": "true" }, bankMarkup.map(part => h("span", { class: part.className, "data-strata-face": part.face }))),
          h("span", { class: "ug-push__cap", "data-strata-face": "raised" }, [h("span", { class: "ug-radio__label" }, slots.default?.())]),
        ]),
      ]);
      return h("label", { ...row, class: classes("ug-radio", row.class as string), ...strataAttributes(props) }, [
        native,
        h("span", { class: "ug-radio__dot", "data-strata-face": "knob", "aria-hidden": "true" }),
        h("span", { class: "ug-radio__label" }, slots.default?.()),
      ]);
    };
  },
});
