/**
 * Strata RotarySelector Vue check page (`ui-rotary-selector-vue.html`): `RotarySelector` from `@underglass/ui/vue` in plain Vue,
 * with no Underglass. It mirrors `ui-rotary-selector-react.html` element for element: the anatomy page's markup example, a
 * `v-model` selector, an uncontrolled one with a ref, `class`, `style` and an attribute, one in a Field, and a disabled one,
 * exposed through `window.strataRotaryBinding` for `tests/browser/ui-rotary-selector-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Field, RotarySelector } from "@underglass/ui/vue";

const changes: string[] = [];
const modes = [{ value: "off", label: "Off" }, { value: "low", label: "Low" }, { value: "mid", label: "Mid" }, { value: "high", label: "High" }];
const tones = [{ value: "warm", label: "Warm" }, { value: "flat", label: "Flat" }, { value: "bright", label: "Bright" }];

const App = defineComponent({
  setup() {
    const mode = ref("low");
    const tone = ref<{ root: HTMLElement; select: HTMLSelectElement }>();
    onMounted(() => {
      window.strataRotaryBinding = { mode: () => mode.value, setMode: value => { mode.value = value; }, changes: () => [...changes], refs: { root: tone.value!.root, select: tone.value!.select } };
    });
    return () => h("main", [
      h("div", { "data-contract": "rotary-selector.md", hidden: true }, [
        h(RotarySelector, { label: "Filter", id: "filter", name: "filter", options: [{ value: "lp", label: "LP" }, { value: "hp", label: "HP" }, { value: "bp", label: "BP", disabled: true }], defaultValue: "hp" }),
      ]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Selectors", style: { display: "flex", flexWrap: "wrap", gap: "20px" } }, [
        h(RotarySelector, { label: "Mode", id: "mode", name: "mode", options: modes, modelValue: mode.value, "onUpdate:modelValue": (value: string) => { changes.push(value); mode.value = value; } }),
        h(RotarySelector, { ref: tone, label: "Tone", id: "tone", options: tones, defaultValue: "flat", class: "extra", style: { marginRight: "4px" }, "data-testid": "tone" }),
        h(Field, { help: "Pick the input." }, { default: () => h(RotarySelector, { label: "Input", options: [{ value: "mic", label: "Mic" }, { value: "line", label: "Line" }], size: "small" }) }),
        h(RotarySelector, { label: "Locked", id: "locked", options: tones, defaultValue: "bright", disabled: true }),
      ]),
      h("p", { id: "mode-read" }, `Mode ${mode.value}`),
    ]);
  },
});

declare global {
  interface Window { strataRotaryBinding: { mode(): string; setMode(value: string): void; changes(): string[]; refs: { root: HTMLElement; select: HTMLSelectElement } } }
}
createApp(App).mount("#root");
