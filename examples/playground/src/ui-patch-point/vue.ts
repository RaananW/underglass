/**
 * Strata PatchPoint Vue check page (`ui-patch-point-vue.html`): `PatchPoint` and `PatchBay` from `@underglass/ui/vue` in plain Vue, with
 * no Underglass. It mirrors `ui-patch-point-react.html` element for element: the anatomy pages' markup examples, a `v-model` jack with an
 * LED, an uncontrolled one with a ref, `class`, `style` and an attribute, a button jack whose `connected` state the page keeps, one in a
 * Field, and a bay, exposed through `window.strataPatchBinding` for `tests/browser/ui-patch-point-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Field, PatchBay, PatchPoint } from "@underglass/ui/vue";

const changes: boolean[] = [];

const App = defineComponent({
  setup() {
    const link = ref(false);
    const pressed = ref(false);
    const extra = ref<{ input: HTMLInputElement }>();
    onMounted(() => {
      window.strataPatchBinding = { link: () => link.value, setLink: value => { link.value = value; }, pressed: () => pressed.value, changes: () => [...changes], refs: { input: extra.value!.input } };
    });
    return () => h("main", [
      h("div", { "data-contract": "patch-point:0", hidden: true }, [h(PatchPoint, { id: "out1", name: "out1", led: true }, () => "Out 1")]),
      h("div", { "data-contract": "patch-point:1", hidden: true }, [h(PatchPoint, { button: true, id: "ret1", connected: true, led: "warning" }, () => "Ret 1")]),
      h("div", { "data-contract": "patch-bay:0", hidden: true }, [h(PatchBay, { legend: "Outputs", columns: 2 }, () => [
        h(PatchPoint, { id: "bay1", name: "bay1" }, () => "Bay 1"),
        h(PatchPoint, { id: "bay2", name: "bay2", size: "small" }, () => "Bay 2"),
      ])]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Patch points", style: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "20px" } }, [
        h(PatchPoint, { id: "link", name: "link", led: true, modelValue: link.value, "onUpdate:modelValue": (value: boolean) => { changes.push(value); link.value = value; } }, () => "Link"),
        h(PatchPoint, { ref: extra, id: "extra", class: "extra", style: { marginRight: "4px" }, "data-testid": "extra", size: "large", led: "danger", checked: true }, () => "Extra"),
        h(PatchPoint, { button: true, id: "hold", connected: pressed.value, onClick: () => { pressed.value = !pressed.value; }, "data-testid": "hold" }, () => "Hold"),
        h(Field, { help: "Plug it in to route the signal." }, { default: () => h(PatchPoint, { id: "route" }, () => "Route") }),
        h(PatchBay, { legend: "Sends", id: "sends", class: "bay", style: { minWidth: "200px" }, "data-testid": "sends", columns: 3 }, () => [
          h(PatchPoint, { id: "send1" }, () => "Send 1"),
          h(PatchPoint, { id: "send2", checked: true, led: true }, () => "Send 2"),
          h(PatchPoint, { id: "send3", disabled: true }, () => "Send 3"),
        ]),
      ]),
      h("p", { id: "link-read" }, `Link ${link.value ? "patched" : "free"}`),
    ]);
  },
});

declare global {
  interface Window { strataPatchBinding: { link(): boolean; setLink(value: boolean): void; pressed(): boolean; changes(): boolean[]; refs: { input: HTMLInputElement } } }
}
createApp(App).mount("#root");
