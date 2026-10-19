/**
 * Strata Keypad Vue check page (`ui-keypad-vue.html`): `Keypad` and `KeypadKey` from `@underglass/ui/vue` in plain Vue, with no
 * Underglass. It mirrors `ui-keypad-react.html` element for element: the anatomy page's two examples, a 3-column keypad with a second
 * legend on some keys, a disabled key, a disabled keypad and a shifted one, exposed through `window.strataKeypadBinding` for
 * `tests/browser/ui-keypad-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h } from "vue";
import { Keypad, KeypadKey } from "@underglass/ui/vue";

const clicks: string[] = [];
const shift = (text: string) => ({ shift: () => text });

const App = defineComponent({
  setup() {
    window.strataKeypadBinding = { clicks: () => [...clicks], refs: { get two() { return document.getElementById("two") as HTMLButtonElement; }, get dial() { return document.getElementById("dial") as HTMLFieldSetElement; } } };
    return () => h("main", [
      h("div", { "data-contract": "keypad.md", hidden: true }, [h(Keypad, { label: "Dial", columns: 3 }, { default: () => [
        h(KeypadKey, { name: "digit", value: "1" }, { default: () => "1" }),
        h(KeypadKey, { name: "digit", value: "2" }, { default: () => "2", ...shift("ABC") }),
        h(KeypadKey, { name: "digit", value: "3", disabled: true }, { default: () => "3", ...shift("DEF") }),
      ] })]),
      h("div", { "data-contract": "keypad.md#2", hidden: true }, [h(Keypad, { "aria-label": "Hex entry", columns: 2, shifted: true }, { default: () => [
        h(KeypadKey, { value: "a" }, { default: () => "A", ...shift("10") }),
        h(KeypadKey, { value: "b" }, { default: () => "B", ...shift("11") }),
      ] })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Keypads", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" } }, [
        h(Keypad, { id: "dial", label: "Dial", columns: 3, class: "extra", style: { marginRight: "4px" }, "data-testid": "dial" }, { default: () => [
          h(KeypadKey, { id: "two", value: "2", class: "extra", "data-testid": "two", onClick: () => clicks.push("two") }, { default: () => "2", ...shift("ABC") }),
          h(KeypadKey, { id: "three", value: "3", onClick: () => clicks.push("three") }, { default: () => "3", ...shift("DEF") }),
          h(KeypadKey, { id: "four", value: "4", disabled: true }, { default: () => "4" }),
          h(KeypadKey, { id: "five", value: "5", "aria-label": "Five", onClick: () => clicks.push("five") }, { default: () => "5" }),
        ] }),
        h(Keypad, { id: "locked", label: "Locked", columns: 2, disabled: true, size: "small" }, { default: () => [
          h(KeypadKey, { id: "locked-a", value: "a" }, { default: () => "A" }),
          h(KeypadKey, { id: "locked-b", value: "b" }, { default: () => "B" }),
        ] }),
        h(Keypad, { id: "hex", "aria-label": "Hex", columns: 2, shifted: true, size: "small" }, { default: () => [
          h(KeypadKey, { id: "hex-a", value: "a", onClick: () => clicks.push("hex-a") }, { default: () => "A", ...shift("10") }),
          h(KeypadKey, { id: "hex-b", value: "b", onClick: () => clicks.push("hex-b") }, { default: () => "B", ...shift("11") }),
          h(KeypadKey, { id: "hex-c", value: "c", onClick: () => clicks.push("hex-c") }, { default: () => "C", ...shift("12") }),
        ] }),
      ]),
    ]);
  },
});

declare global {
  interface Window { strataKeypadBinding: { clicks(): string[]; refs: { two: HTMLButtonElement; dial: HTMLFieldSetElement } } }
}
createApp(App).mount("#root");
