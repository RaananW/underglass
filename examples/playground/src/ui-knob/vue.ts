/**
 * Strata Knob Vue check page (`ui-knob-vue.html`): `Knob` from `@underglass/ui/vue` in plain Vue, with no Underglass.
 * It mirrors `ui-knob-react.html` element for element: the anatomy page's markup example, a `v-model` knob, an
 * uncontrolled one with a ref, `class`, `style` and an attribute, one with a `format`, and one in a Field, exposed
 * through `window.strataKnobBinding` for `tests/browser/ui-knob-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Field, Knob } from "@underglass/ui/vue";

const changes: number[] = [];

const App = defineComponent({
  setup() {
    const level = ref(40);
    const pan = ref<{ root: HTMLElement; input: HTMLInputElement }>();
    onMounted(() => {
      window.strataKnobBinding = { level: () => level.value, setLevel: value => { level.value = value; }, changes: () => [...changes], refs: { root: pan.value!.root, input: pan.value!.input } };
    });
    return () => h("main", [
      h("div", { "data-contract": "knob.md", hidden: true }, [h(Knob, { label: "Gain", id: "gain", name: "gain", min: -12, max: 12, detents: 5, defaultValue: 0, unit: " dB" })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Knobs", style: { display: "flex", flexWrap: "wrap", gap: "20px" } }, [
        h(Knob, { label: "Level", id: "level", min: 0, max: 100, modelValue: level.value, unit: "%", "onUpdate:modelValue": (value: number) => { changes.push(value); level.value = value; } }),
        h(Knob, { ref: pan, label: "Pan", id: "pan", min: -50, max: 50, defaultValue: 10, resetValue: 0, class: "extra", style: { marginRight: "4px" }, "data-testid": "pan" }),
        h(Knob, { label: "Mix", id: "mix", min: 0, max: 10, step: 0.5, defaultValue: 7, marks: [0, { value: 5, label: "Half" }, 10], format: (value: number) => `Mix ${value} of 10` }),
        h(Field, { help: "Turn to set the drive." }, { default: () => h(Knob, { label: "Drive", min: 1, max: 11, detents: 11, defaultValue: 3, size: "small" }) }),
      ]),
      h("p", { id: "level-read" }, `Level ${level.value}%`),
    ]);
  },
});

declare global {
  interface Window { strataKnobBinding: { level(): number; setLevel(value: number): void; changes(): number[]; refs: { root: HTMLElement; input: HTMLInputElement } } }
}
createApp(App).mount("#root");
