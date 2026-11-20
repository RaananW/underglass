/**
 * Strata delegate disposal, Vue check page (`ui-strata-dispose-vue.html`): the page of `react.tsx`, with `Fader` and `Knob` from
 * `@underglass/ui/vue`, driven through `window.strataDisposeProbe.set(faders, knobs)` for `tests/browser/ui-strata-dispose.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { Fader, Knob } from "@underglass/ui/vue";

const counts = ref<[number, number]>([0, 0]);

const App = defineComponent({
  setup() {
    return () => h("main", [
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Controls", style: { display: "flex", gap: "20px", alignItems: "flex-start" } }, [
        ...Array.from({ length: counts.value[0] }, (_, index) => h(Fader, { key: `fader-${index}`, label: `Fader ${index}`, id: `fader-${index}`, min: 0, max: 100, defaultValue: 50 })),
        ...Array.from({ length: counts.value[1] }, (_, index) => h(Knob, { key: `knob-${index}`, label: `Knob ${index}`, id: `knob-${index}`, min: 0, max: 100, defaultValue: 50 })),
      ]),
    ]);
  },
});
createApp(App).mount("#root");

window.strataDisposeProbe = {
  set: async (faders, knobs) => {
    counts.value = [faders, knobs];
    await nextTick();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },
};

declare global {
  interface Window { strataDisposeProbe: { set(faders: number, knobs: number): Promise<void> } }
}
