/**
 * Strata JogWheel Vue check page (`ui-jog-wheel-vue.html`): `JogWheel` from `@underglass/ui/vue` in plain Vue, with no Underglass.
 * It mirrors `ui-jog-wheel-react.html` element for element: the anatomy page's markup example, a `v-model` wheel, an uncontrolled one
 * with a ref, `class`, `style` and an attribute, a detented one with a `format`, a vertical one that does not wrap, and one in a Field,
 * exposed through `window.strataJogBinding` for `tests/browser/ui-jog-wheel-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Field, JogWheel } from "@underglass/ui/vue";

const changes: number[] = [];

const App = defineComponent({
  setup() {
    const frame = ref(12);
    const offset = ref<{ root: HTMLElement; input: HTMLInputElement }>();
    onMounted(() => {
      window.strataJogBinding = { frame: () => frame.value, setFrame: value => { frame.value = value; }, changes: () => [...changes], refs: { root: offset.value!.root, input: offset.value!.input } };
    });
    return () => h("main", [
      h("div", { "data-contract": "jog-wheel.md", hidden: true }, [h(JogWheel, { label: "Shuttle", id: "shuttle", name: "shuttle", min: 0, max: 99, defaultValue: 12, unit: " fr" })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Jog wheels", style: { display: "flex", flexWrap: "wrap", gap: "20px" } }, [
        h(JogWheel, { label: "Frame", id: "frame", min: 0, max: 99, modelValue: frame.value, unit: " fr", "onUpdate:modelValue": (value: number) => { changes.push(value); frame.value = value; } }),
        h(JogWheel, { ref: offset, label: "Offset", id: "offset", min: -50, max: 50, defaultValue: 10, resetValue: 0, class: "extra", style: { marginRight: "4px" }, "data-testid": "offset" }),
        h(JogWheel, { label: "Scrub", id: "scrub", min: 0, max: 11, turn: 12, detents: true, defaultValue: 3, format: (value: number) => `Mark ${value} of 11` }),
        h(JogWheel, { label: "Tune", id: "tune", min: -12, max: 12, wrap: false, drag: "vertical", defaultValue: 0, unit: " st", size: "small" }),
        h(Field, { help: "Turn to set the pitch." }, { default: () => h(JogWheel, { label: "Pitch", min: 0, max: 23, defaultValue: 5, size: "large" }) }),
      ]),
      h("p", { id: "frame-read" }, `Frame ${frame.value} fr`),
    ]);
  },
});

declare global {
  interface Window { strataJogBinding: { frame(): number; setFrame(value: number): void; changes(): number[]; refs: { root: HTMLElement; input: HTMLInputElement } } }
}
createApp(App).mount("#root");
