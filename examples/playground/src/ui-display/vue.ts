/**
 * Strata Display Vue check page (`ui-display-vue.html`): the TextField's `display` form and `Display` from `@underglass/ui/vue`, in plain
 * Vue, with no Underglass. It mirrors `ui-display-react.html` element for element: the anatomy page's markup examples, a Field with a
 * controlled display, an unlit read-only display with a ref, `class`, `style` and an attribute, a `form` that is the native form owner's id, a readout of the state in a
 * `Display` with `live="off"`, and a `Display` with a size, exposed through `window.strataDisplayBinding` for `tests/browser/ui-display-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Display, Field, TextField } from "@underglass/ui/vue";

const App = defineComponent({
  setup() {
    const text = ref("Hello"), rate = ref(60);
    const input = ref<{ input: HTMLInputElement }>(), serial = ref<{ input: HTMLInputElement }>(), output = ref<{ output: HTMLOutputElement }>();
    onMounted(() => {
      window.strataDisplayBinding = { text: () => text.value, rate: () => rate.value, setRate: value => { rate.value = value; }, refs: { input: input.value!.input, serial: serial.value!.input, output: output.value!.output } };
    });
    return () => h("main", [
      h("div", { "data-contract": "display:0", hidden: true }, [h(TextField, { id: "note", form: "display", backlight: "accent", type: "text", placeholder: "Type here" })]),
      h("div", { "data-contract": "display:1", hidden: true }, [h(Display, { id: "rate-contract", label: "Frame rate", backlight: "success" }, () => "60 fps")]),
      h("div", { "data-contract": "display:2", hidden: true }, [h(TextField, { id: "serial-contract", "aria-label": "Serial", form: "display", backlight: "off", lit: false, readonly: true })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Displays", style: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px" } }, [
        h(Field, { label: "Name", help: "Shown on the glass" }, () => h(TextField, { ref: input, form: "display", modelValue: text.value, "onUpdate:modelValue": (value: string) => { text.value = value; }, class: "extra", style: { marginRight: "4px" }, "data-testid": "name", size: "small" })),
        h(TextField, { id: "serial", ref: serial, "aria-label": "Serial", form: "display", readonly: true, lit: false, value: "UG-2026-0042" }),
        h(TextField, { id: "owner", "aria-label": "Owner", form: "login-form", value: "Plain" }),
        h(Display, { id: "rate", ref: output, label: "Frame rate", live: "off", backlight: "info", class: "extra", style: { marginRight: "4px" }, "data-testid": "rate" }, () => `${rate.value} fps`),
        h(Display, { id: "echo", label: "Echo", size: "large" }, () => text.value),
      ]),
      h("button", { id: "faster", type: "button", onClick: () => { rate.value = 144; } }, "Faster"),
      h("button", { id: "slower", type: "button", onClick: () => { rate.value = 30; } }, "Slower"),
    ]);
  },
});

declare global {
  interface Window { strataDisplayBinding: { text(): string; rate(): number; setRate(value: number): void; refs: { input: HTMLInputElement; serial: HTMLInputElement; output: HTMLOutputElement } } }
}
createApp(App).mount("#root");
