/**
 * Strata Pad Vue check page (`ui-pad-vue.html`): `Pad` and `PadGrid` from `@underglass/ui/vue` in plain Vue, with no Underglass. It
 * mirrors `ui-pad-react.html` element for element: the anatomy page's three examples, a momentary pad, a `v-model:pressed` latching
 * pad, an uncontrolled one, a disabled one of each kind, a pad with an icon and a `velocity` listener, and a plain Button, exposed
 * through `window.strataPadBinding` for `tests/browser/ui-pad-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, ref } from "vue";
import { Button, Pad, PadGrid } from "@underglass/ui/vue";

const clicks: string[] = [];
const changes: boolean[] = [];
const velocities: [number, string][] = [];

const App = defineComponent({
  setup() {
    const loop = ref(false);
    window.strataPadBinding = { loop: () => loop.value, setLoop: value => { loop.value = value; }, clicks: () => [...clicks], changes: () => [...changes], velocities: () => [...velocities], refs: { get kick() { return document.getElementById("kick") as HTMLButtonElement; } } };
    return () => h("main", [
      h("div", { "data-contract": "pad.md", hidden: true }, [h(Pad, { colour: "danger", name: "kick", value: "1" }, { default: () => "Kick" })]),
      h("div", { "data-contract": "pad.md#2", hidden: true }, [h(Pad, { latching: true, colour: "accent" }, { default: () => "Loop" })]),
      h("div", { "data-contract": "pad.md#3", hidden: true }, [h(PadGrid, { label: "Drum pads", columns: 2 }, { default: () => [h(Pad, null, { default: () => "Snare" }), h(Pad, { colour: "success" }, { default: () => "Hat" })] })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Pads", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" } }, [
        h(PadGrid, { label: "Rack", columns: 3, id: "rack", class: "extra", size: "small" }, { default: () => [
          h(Pad, { id: "kick", colour: "danger", class: "extra", style: { marginRight: "4px" }, "data-testid": "kick", onClick: () => clicks.push("kick"), onVelocity: (velocity: number, source: string) => velocities.push([velocity, source]) }, { default: () => "Kick" }),
          h(Pad, { id: "snare", colour: "accent", onClick: () => clicks.push("snare") }, {
            icon: () => h("svg", { viewBox: "0 0 16 16", width: 16, height: 16, "aria-hidden": "true" }, [h("circle", { cx: 8, cy: 8, r: 6 })]),
            default: () => "Snare",
          }),
          h(Pad, { id: "loop", latching: true, colour: "warning", pressed: loop.value, "onUpdate:pressed": (value: boolean) => { changes.push(value); loop.value = value; } }, { default: () => "Loop" }),
          h(Pad, { id: "arm", latching: true, colour: "info", defaultPressed: true }, { default: () => "Arm" }),
          h(Pad, { id: "locked", disabled: true }, { default: () => "Locked" }),
          h(Pad, { id: "armed-locked", latching: true, defaultPressed: true, disabled: true }, { default: () => "Armed" }),
        ] }),
        h(Button, { id: "plain", onClick: () => clicks.push("plain") }, { default: () => "Plain" }),
      ]),
      h("p", { id: "loop-read" }, `Loop ${loop.value ? "on" : "off"}`),
    ]);
  },
});

declare global {
  interface Window { strataPadBinding: { loop(): boolean; setLoop(value: boolean): void; clicks(): string[]; changes(): boolean[]; velocities(): [number, string][]; refs: { kick: HTMLButtonElement } } }
}
createApp(App).mount("#root");
