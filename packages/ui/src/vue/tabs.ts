/**
 * Tabs, TabList, Tab and TabPanel for Vue 3 (anatomy page `tabs.md`): the WAI-ARIA Tabs pattern. `Tabs` holds the
 * selection (`v-model`, or `defaultValue`) and the ids; `TabList` takes the arrow keys, Home and End
 * (`strataTabTarget` from `@underglass/ui/dom`), moving focus and, with automatic activation, selecting. Attributes
 * and listeners fall through to each part's root element.
 */
import { computed, defineComponent, h, inject, provide, ref, useId, type ComputedRef, type InjectionKey, type PropType } from "vue";
import { strataTabTarget, type TabsActivation } from "../dom/tabs.ts";
import { tabCap, tabLed, tabsForm, type StrataTabsForm } from "../shared/tabs-forms.ts";
import { classes, strataAttributes, strataProps } from "./shared.ts";

interface TabsContext {
  id: string;
  value?: string;
  select(value: string): void;
  orientation: "horizontal" | "vertical";
  activation: TabsActivation;
  form?: StrataTabsForm;
}

const tabsKey: InjectionKey<ComputedRef<TabsContext>> = Symbol("strata-tabs");

function useTabs(part: string): ComputedRef<TabsContext> {
  const context = inject(tabsKey, undefined);
  if (!context) throw new Error(`<${part}> must be inside <Tabs>`);
  return context;
}

export const Tabs = defineComponent({
  name: "StrataTabs",
  props: {
    /** The base of the tab and panel ids (`{id}-tab-{value}`, `{id}-panel-{value}`); generated when absent. */
    id: { type: String, default: undefined },
    /** The selected tab's value; use `v-model`. */
    modelValue: { type: String, default: undefined },
    defaultValue: { type: String, default: undefined },
    orientation: { type: String as PropType<"horizontal" | "vertical">, default: "horizontal" },
    activation: { type: String as PropType<TabsActivation>, default: "automatic" },
    /**
     * `rail`: the tabs as latching keys on one rail, each with an LED that lights while its tab is selected, the panel the faceplate under
     * them (anatomy page `tabs.md`, section 11); the WAI-ARIA Tabs pattern is unchanged. `flush` and no form are the flat tabs over a groove;
     * a `<div>` has no native `form` attribute, so no other string is used.
     */
    form: { type: String as PropType<StrataTabsForm | "flush" | (string & {})>, default: undefined },
    ...strataProps,
  },
  emits: ["update:modelValue"],
  setup(props, { slots, emit }) {
    const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const own = ref(props.defaultValue);
    const selected = computed(() => (props.modelValue !== undefined ? props.modelValue : own.value));
    provide(tabsKey, computed(() => ({
      id: props.id ?? `tabs-${generated}`, value: selected.value, orientation: props.orientation, activation: props.activation, form: tabsForm(props.form),
      select: (value: string) => {
        if (value === selected.value) return;
        if (props.modelValue === undefined) own.value = value;
        emit("update:modelValue", value);
      },
    })));
    return () => h("div", { class: classes("ug-tabs", props.orientation === "vertical" && "ug-tabs--vertical"), ...(tabsForm(props.form) ? { "data-strata-form": "rail" } : {}), ...strataAttributes(props) }, slots.default?.());
  },
});

export const TabList = defineComponent({
  name: "StrataTabList",
  props: {
    /** The tablist's accessible name (`aria-label`); or give `aria-labelledby`. */
    label: { type: String, default: undefined },
  },
  setup(props, { slots }) {
    const tabs = useTabs("TabList");
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const from = (event.target as Element).closest("[role='tab']");
      const target = from && strataTabTarget(from, event.key);
      if (!target) return;
      event.preventDefault();
      target.focus();
      // A click selects it, through the Tab's own handler.
      if (tabs.value.activation === "automatic") target.click();
    };
    return () => h("div", {
      class: "ug-tabs__list", role: "tablist", "aria-label": props.label,
      "aria-orientation": tabs.value.orientation === "vertical" ? "vertical" : undefined,
      "data-strata-activation": tabs.value.activation === "manual" ? "manual" : undefined, ...(tabs.value.form ? { "data-strata-face": "raised" } : {}), onKeydown: keydown,
    }, [!tabs.value.form && h("span", { class: "ug-tabs__rail", "data-strata-face": "groove", "aria-hidden": "true" }), slots.default?.()]);
  },
});

export const Tab = defineComponent({
  name: "StrataTab",
  props: {
    value: { type: String, required: true },
  },
  setup(props, { slots }) {
    const tabs = useTabs("Tab");
    return () => {
      const { id, value } = tabs.value, selected = value === props.value;
      return h("button", {
        class: "ug-tab", type: "button", role: "tab", id: `${id}-tab-${props.value}`, "aria-selected": String(selected),
        "aria-controls": `${id}-panel-${props.value}`, tabindex: selected ? undefined : "-1",
        onClick: (event: MouseEvent) => { if (!event.defaultPrevented) tabs.value.select(props.value); },
      }, tabs.value.form
        ? [h("span", { class: tabLed.className, "data-strata-face": tabLed.face, "aria-hidden": "true" }), h("span", { class: tabCap.className, "data-strata-face": tabCap.face }, [h("span", { class: "ug-tab__label" }, slots.default?.())])]
        : [h("span", { class: "ug-tab__label" }, slots.default?.()), h("span", { class: "ug-tab__indicator", "data-strata-face": "mark", "aria-hidden": "true" })]);
    };
  },
});

export const TabPanel = defineComponent({
  name: "StrataTabPanel",
  props: {
    value: { type: String, required: true },
  },
  setup(props, { slots }) {
    const tabs = useTabs("TabPanel");
    return () => {
      const { id, value } = tabs.value;
      return h("div", {
        class: "ug-tabs__panel", role: "tabpanel", id: `${id}-panel-${props.value}`, "aria-labelledby": `${id}-tab-${props.value}`,
        tabindex: "0", hidden: value !== props.value,
      }, slots.default?.());
    };
  },
});
