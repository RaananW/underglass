/**
 * Strata Meter and Gauge Vue check page (`ui-meter-vue.html`): `Meter` and `Gauge` from `@underglass/ui/vue`, in plain Vue,
 * with no Underglass. It mirrors `ui-meter-react.html` element for element: the anatomy pages' markup examples, a bar whose
 * value a button changes (and a held peak), a needle meter with a `format`, a gauge with a ref, `class`, `style` and an
 * attribute, and a bar with no `unit`, exposed through `window.strataMeterBinding` for `tests/browser/ui-meter-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Gauge, Meter } from "@underglass/ui/vue";

const App = defineComponent({
  setup() {
    const level = ref(30);
    const bar = ref<{ root: HTMLElement; meter: HTMLMeterElement }>(), dial = ref<{ root: HTMLElement }>();
    onMounted(() => {
      window.strataMeterBinding = { level: () => level.value, setLevel: value => { level.value = value; }, refs: { meter: bar.value!.meter, root: bar.value!.root, gauge: dial.value!.root } };
    });
    return () => h("main", [
      h("div", { "data-contract": "meter:0", hidden: true }, [h(Meter, { id: "level", label: "Level", value: 62, low: 70, high: 90, optimum: 0, segments: 8, unit: " %", marks: 3 })]),
      h("div", { "data-contract": "meter:1", hidden: true }, [h(Meter, { id: "vu", label: "VU", value: -6, min: -20, max: 3, high: 0, form: "needle", unit: " dB", marks: [-20, -10, 0, 3] })]),
      h("div", { "data-contract": "gauge:0", hidden: true }, [h(Gauge, { id: "temperature", label: "Temperature", value: 72, max: 120, low: 20, high: 100, unit: " °C", marks: 5 })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Meters", style: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "12px" } }, [
        h(Meter, { id: "bar", ref: bar, label: "Bar", value: level.value, low: 70, high: 90, optimum: 0, unit: " %", peak: true, class: "extra", style: { marginRight: "4px" }, "data-testid": "bar", size: "small" }),
        h(Meter, { id: "needle", label: "Needle", form: "needle", value: level.value, min: 0, max: 100, format: (value: number) => `${value} of 100` }),
        h(Gauge, { id: "dial", ref: dial, label: "Dial", value: level.value, max: 100, high: 80, unit: " bar", class: "extra", style: { marginRight: "4px" }, "data-testid": "dial" }),
        h(Meter, { id: "plain", label: "Plain", value: 5, max: 10, segments: 10 }),
      ]),
      h("button", { id: "raise", type: "button", onClick: () => { level.value = 80; } }, "Raise"),
      h("button", { id: "lower", type: "button", onClick: () => { level.value = 10; } }, "Lower"),
    ]);
  },
});

declare global {
  interface Window { strataMeterBinding: { level(): number; setLevel(value: number): void; refs: { meter: HTMLMeterElement; root: HTMLElement; gauge: HTMLElement } } }
}
createApp(App).mount("#root");
