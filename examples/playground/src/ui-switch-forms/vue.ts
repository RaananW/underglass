/**
 * Strata Switch forms Vue check page (`ui-switch-forms-vue.html`): `Switch` from `@underglass/ui/vue` with `form`, in
 * plain Vue, with no Underglass. It mirrors `ui-switch-forms-react.html` element for element: the anatomy page's Forms
 * markup example, a `v-model` slide, an uncontrolled bat with a ref, `class`, `style` and an attribute, a reversed wall
 * in a Field, a disabled rocker and a Strata switch whose `form` names its form owner, exposed through
 * `window.strataSwitchBinding` for `tests/browser/ui-switch-forms-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Field, Switch } from "@underglass/ui/vue";

const changes: boolean[] = [];

const App = defineComponent({
  setup() {
    const bypass = ref(false);
    const arm = ref<{ input: HTMLInputElement }>();
    onMounted(() => {
      window.strataSwitchBinding = { bypass: () => bypass.value, setBypass: value => { bypass.value = value; }, changes: () => [...changes], refs: { input: arm.value!.input } };
    });
    return () => h("main", [
      h("div", { "data-contract": "switch.md#2", hidden: true }, [h(Switch, { form: "rocker", name: "power" }, { default: () => "Power" })]),
      h("form", { id: "settings", "aria-label": "Settings" }),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Switches", style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px" } }, [
        h(Switch, { form: "slide", id: "bypass", modelValue: bypass.value, "onUpdate:modelValue": (value: boolean) => { changes.push(value); bypass.value = value; } }, { default: () => "Bypass" }),
        h(Switch, { form: "bat", id: "arm", ref: arm, checked: true, class: "extra", style: { marginRight: "4px" }, "data-testid": "arm" }, { default: () => "Arm" }),
        h(Field, { help: "Lights the hall." }, { default: () => h(Switch, { form: "wall", id: "hall", reverse: true }, { default: () => "Hall" }) }),
        h(Switch, { form: "rocker", id: "heater", disabled: true }, { default: () => "Heater" }),
        h(Switch, { form: "settings", id: "wifi", name: "wifi" }, { default: () => "Wi-Fi" }),
      ]),
      h("p", { id: "bypass-read" }, `Bypass ${bypass.value ? "engaged" : "clear"}`),
    ]);
  },
});

declare global {
  interface Window { strataSwitchBinding: { bypass(): boolean; setBypass(value: boolean): void; changes(): boolean[]; refs: { input: HTMLInputElement } } }
}
createApp(App).mount("#root");
