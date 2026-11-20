/**
 * Entry for `adapter-parity-vue.html`: the places where the Vue adapter must behave as the React one does, under GPU.
 * `window.adapterParity` drives it from `tests/browser/adapter-parity-vue.test.mjs`.
 *
 * Layer `styled` (a `Surface` at (20, 20), 200x120, red) is given a `style`, and so are the `Box` (`#styled-box`,
 * 80x40 at (30, 30), blue or green) and the `NativeScroll` (80x30 at (30, 70)) inside it, the way a JavaScript caller
 * or a cast would pass one: none of them applies it, and Vue warns in development. `#styled-button` swaps the box's
 * appearance between blue and green.
 */
import { defineComponent, h, ref } from "vue";
import { mountCanvasApp, Surface, Box, NativeScroll, type CanvasController } from "@underglass/vue";

const colours = { red: "rgb(240, 30, 60)", blue: "rgb(20, 120, 220)", green: "rgb(20, 200, 90)", yellow: "rgb(250, 200, 20)" };
const boxColour = ref<"blue" | "green">("blue");
// Props passed around the typed API, as plain JavaScript or a cast would.
const untyped = (props: Record<string, unknown>) => props as object;

const App = defineComponent({
  setup() {
    return () => [
      h(Surface, {
        id: "styled", class: "styled-layer", layout: { x: 20, y: 20, width: 200, height: 120, padding: 10 },
        appearance: { background: colours.red }, ...untyped({ style: { backgroundColor: "rgb(250, 0, 250)" } }),
      }, () => [
        h(Box, { id: "styled-box", layout: { width: 80, height: 40 }, appearance: { background: colours[boxColour.value] }, ...untyped({ style: { backgroundColor: colours.yellow } }) }),
        h(NativeScroll, { id: "styled-scroll", layout: { width: 80, height: 30 }, ...untyped({ style: "background-color: rgb(250, 200, 20)" }) }, () => h("span", "Scroll")),
        h("button", { id: "styled-button", type: "button", onClick: () => { boxColour.value = boxColour.value === "blue" ? "green" : "blue"; } }, "Swap"),
      ]),
    ];
  },
});

/** Compile-time checks: a typed `style` is rejected on `Surface`, `Box` and `NativeScroll`, as React's prop types reject it. */
export function rejectedStyleTypes() {
  // @ts-expect-error `style` is not an authored Surface prop.
  h(Surface, { id: "typed", style: { color: "red" } });
  // @ts-expect-error `style` is not an authored Box prop.
  h(Box, { style: { color: "red" } });
  // @ts-expect-error `style` is not an authored NativeScroll prop.
  h(NativeScroll, { style: "color: red" });
}

const host = (id: string) => document.getElementById(id)!;
const controller: CanvasController = mountCanvasApp({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
}, App);

const probe = {
  controller,
  state: () => ({ ...controller.state(), boxColour: boxColour.value }),
  settle: () => controller.settle(),
};
declare global { interface Window { adapterParity: typeof probe } }
window.adapterParity = probe;
