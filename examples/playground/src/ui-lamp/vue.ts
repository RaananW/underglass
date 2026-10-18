/**
 * Strata Lamp and StatusLight Vue check page (`ui-lamp-vue.html`): `Lamp` and `StatusLight` from `@underglass/ui/vue`, in
 * plain Vue, with no Underglass. It mirrors `ui-lamp-react.html` element for element: the anatomy pages' markup examples,
 * a `v-model` toggle lamp, an uncontrolled one with a ref, `class`, `style` and an attribute, a reversed one in a Field,
 * an invalid one, a disabled one, a momentary one with a ref and a click count, a lamp whose `form` names its form owner,
 * and StatusLights, exposed through `window.strataLampBinding` for `tests/browser/ui-lamp-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Field, Lamp, StatusLight } from "@underglass/ui/vue";

const changes: boolean[] = [];

const App = defineComponent({
  setup() {
    const mains = ref(false), link = ref({ label: "Link up", lit: true }), clicks = ref(0);
    const arm = ref<{ input: HTMLInputElement }>(), talk = ref<{ input: HTMLButtonElement }>(), light = ref<{ $el: HTMLElement }>();
    onMounted(() => {
      window.strataLampBinding = { mains: () => mains.value, setMains: value => { mains.value = value; }, changes: () => [...changes], clicks: () => clicks.value, link: () => ({ ...link.value }),
        refs: { arm: arm.value!.input, talk: talk.value!.input, light: light.value!.$el } };
    });
    const text = (label: string) => ({ default: () => label });
    return () => h("main", [
      h("div", { "data-contract": "lamp:0", hidden: true }, [h(Lamp, { colour: "success", name: "link" }, text("Link"))]),
      h("div", { "data-contract": "lamp:1", hidden: true }, [h(Lamp, { momentary: true, colour: "danger", name: "talk" }, text("Talk"))]),
      h("div", { "data-contract": "status-light:0", hidden: true }, [h(StatusLight, { label: "Link up", colour: "success" })]),
      h("div", { "data-contract": "status-light:1", hidden: true }, [h(StatusLight, { label: "Recording", colour: "danger", blink: "normal", showLabel: true })]),
      h("div", { "data-contract": "status-light:2", hidden: true }, [h(StatusLight, { label: "Disconnected", colour: "accent", lit: false, live: true })]),
      h("form", { id: "settings", "aria-label": "Settings" }),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Lamps", style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" } }, [
        h(Lamp, { id: "mains", modelValue: mains.value, "onUpdate:modelValue": (value: boolean) => { changes.push(value); mains.value = value; } }, text("Mains")),
        h(Lamp, { id: "arm", ref: arm, checked: true, colour: "accent", size: "small", class: "extra", style: { marginRight: "4px" }, "data-testid": "arm" }, text("Armed")),
        h(Field, { help: "Lights the hall." }, { default: () => h(Lamp, { id: "hall", reverse: true, colour: "warning" }, text("Hall")) }),
        h(Lamp, { id: "fault", invalid: true, colour: "danger" }, text("Fault")),
        h(Lamp, { id: "locked", disabled: true, checked: true }, text("Locked")),
        h(Lamp, { id: "talk", ref: talk, momentary: true, colour: "success", onClick: () => { clicks.value++; }, "data-testid": "talk" }, text("Talk")),
        h(Lamp, { id: "muted", momentary: true, disabled: true }, text("Muted")),
        h(Lamp, { id: "owned", form: "settings", name: "owned", colour: "info" }, text("Owned")),
      ]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Lights", style: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginTop: "12px" } }, [
        h(StatusLight, { id: "link", label: link.value.label, lit: link.value.lit, colour: "success" }),
        h(StatusLight, { id: "rec", label: "Recording", colour: "danger", blink: "fast", showLabel: true, ref: light, class: "extra", style: { marginRight: "4px" }, "data-testid": "rec" }),
        h(StatusLight, { id: "sync", label: link.value.label, live: true, showLabel: true, colour: "accent" }),
        h(StatusLight, { id: "alert", label: "Disk full", live: "assertive", colour: "danger", size: "large" }),
      ]),
      h("button", { id: "change", type: "button", onClick: () => { link.value = { label: "Link down", lit: false }; } }, "Drop the link"),
      h("p", { id: "mains-read" }, `Mains ${mains.value ? "engaged" : "clear"}`),
    ]);
  },
});

declare global {
  interface Window { strataLampBinding: { mains(): boolean; setMains(value: boolean): void; changes(): boolean[]; clicks(): number; link(): { label: string; lit: boolean };
    refs: { arm: HTMLInputElement; talk: HTMLButtonElement; light: HTMLElement } } }
}
createApp(App).mount("#root");
