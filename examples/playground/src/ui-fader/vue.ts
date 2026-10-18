/**
 * Strata Fader Vue check page (`ui-fader-vue.html`): `Fader` from `@underglass/ui/vue` in plain Vue, with no Underglass.
 * It mirrors `ui-fader-react.html` element for element: the anatomy page's markup example, a `v-model` fader, an
 * uncontrolled one with a ref, `class`, `style` and an attribute, a horizontal one with a `format` and labelled marks,
 * and a detented one in a Field, exposed through `window.strataFaderBinding` for
 * `tests/browser/ui-fader-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Fader, Field } from "@underglass/ui/vue";

const changes: number[] = [];

const App = defineComponent({
  setup() {
    const volume = ref(40);
    const send = ref<{ root: HTMLElement; input: HTMLInputElement }>();
    onMounted(() => {
      window.strataFaderBinding = { volume: () => volume.value, setVolume: value => { volume.value = value; }, changes: () => [...changes], refs: { root: send.value!.root, input: send.value!.input } };
    });
    return () => h("main", [
      h("div", { "data-contract": "fader.md", hidden: true }, [h(Fader, { label: "Level", id: "level", name: "level", min: -60, max: 6, defaultValue: 0, unit: " dB", marks: [6, 0, -20, -40, -60] })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Faders", style: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "20px" } }, [
        h(Fader, { label: "Volume", id: "volume", min: 0, max: 100, modelValue: volume.value, unit: "%", "onUpdate:modelValue": (value: number) => { changes.push(value); volume.value = value; } }),
        h(Fader, { ref: send, label: "Send", id: "send", min: 0, max: 10, defaultValue: 6, resetValue: 0, class: "extra", style: { marginRight: "4px" }, "data-testid": "send" }),
        h(Fader, { label: "Pan", id: "pan", orientation: "horizontal", min: -50, max: 50, defaultValue: 10, marks: [{ value: -50, label: "L" }, { value: 0, label: "C" }, { value: 50, label: "R" }],
          format: (value: number) => (value === 0 ? "Centre" : value < 0 ? `${-value} left` : `${value} right`) }),
        h(Field, { help: "Slide to set the trim." }, { default: () => h(Fader, { label: "Trim", min: -12, max: 12, detents: 5, defaultValue: 0, size: "small" }) }),
      ]),
      h("p", { id: "volume-read" }, `Volume ${volume.value}%`),
    ]);
  },
});

declare global {
  interface Window { strataFaderBinding: { volume(): number; setVolume(value: number): void; changes(): number[]; refs: { root: HTMLElement; input: HTMLInputElement } } }
}
createApp(App).mount("#root");
