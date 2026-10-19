/**
 * Strata PushButton Vue check page (`ui-push-button-vue.html`): `Button` and `ToggleButton` with their push-button forms from
 * `@underglass/ui/vue` in plain Vue, with no Underglass. It mirrors `ui-push-button-react.html` element for element: the anatomy
 * pages' push-button examples, a momentary Button, a `v-model:pressed` latching ToggleButton, an uncontrolled one, a disabled one of
 * each, a Button whose `form` names a form owner and a plain Button, exposed through `window.strataPushBinding` for
 * `tests/browser/ui-push-button-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, ref } from "vue";
import { Button, ToggleButton } from "@underglass/ui/vue";

const clicks: string[] = [];
const changes: boolean[] = [];

const App = defineComponent({
  setup() {
    const mute = ref(false);
    window.strataPushBinding = { mute: () => mute.value, setMute: value => { mute.value = value; }, clicks: () => [...clicks], changes: () => [...changes], refs: { get talk() { return document.getElementById("talk") as HTMLButtonElement; } } };
    return () => h("main", [
      h("div", { "data-contract": "button.md#2", hidden: true }, [h(Button, { form: "momentary", colour: "danger" }, { default: () => "Record" })]),
      h("div", { "data-contract": "toggle-button.md#2", hidden: true }, [h(ToggleButton, { form: "latching", colour: "warning", defaultPressed: true }, { default: () => "Mute" })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Push buttons", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" } }, [
        h(Button, { form: "momentary", id: "talk", class: "extra", style: { marginRight: "4px" }, "data-testid": "talk", onClick: () => clicks.push("talk") }, { default: () => "Talk" }),
        h(Button, { form: "momentary", variant: "accent", id: "go", onClick: () => clicks.push("go") }, { default: () => "Go" }),
        h(ToggleButton, { form: "latching", id: "mute", pressed: mute.value, "onUpdate:pressed": (value: boolean) => { changes.push(value); mute.value = value; } }, { default: () => "Mute" }),
        h(ToggleButton, { form: "latching", id: "phantom", colour: "info", defaultPressed: true }, { default: () => "48 V" }),
        h(Button, { form: "momentary", id: "locked", disabled: true }, { default: () => "Locked" }),
        h(ToggleButton, { form: "latching", id: "armed", defaultPressed: true, disabled: true }, { default: () => "Armed" }),
        h(Button, { form: "settings", id: "owned", onClick: () => clicks.push("owned") }, { default: () => "Owned" }),
        h(Button, { id: "plain", onClick: () => clicks.push("plain") }, { default: () => "Plain" }),
      ]),
      h("p", { id: "mute-read" }, `Mute ${mute.value ? "on" : "off"}`),
    ]);
  },
});

declare global {
  interface Window { strataPushBinding: { mute(): boolean; setMute(value: boolean): void; clicks(): string[]; changes(): boolean[]; refs: { talk: HTMLButtonElement } } }
}
createApp(App).mount("#root");
