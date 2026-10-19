/**
 * Strata Select forms Vue check page (`ui-select-forms-vue.html`): `Select` from `@underglass/ui/vue` with `form`, in plain Vue, with no
 * Underglass. It mirrors `ui-select-forms-react.html` element for element: the anatomy page's form examples (`select.md` section 11), a
 * `v-model` selector, an uncontrolled display with a ref, `class`, `style` and an attribute, a selector of eleven options (drawn as a display), a selector
 * with optgroups and a Field's help, a selector whose options a component renders, a disabled selector, a `multiple` select asked as a selector, a select
 * whose `form` names a form owner, and a flush select, exposed through `window.strataSelectBinding` for
 * `tests/browser/ui-select-forms-bindings.test.mjs`. `?mode=plain|flush|legacy` renders `#probe` as the React page does.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, ref } from "vue";
import { Field, Select } from "@underglass/ui/vue";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");

const option = (value: string, label: string) => h("option", { key: value, value }, label);
const waves = () => [option("sine", "Sine"), option("saw", "Saw"), option("square", "Square")];
const presets = () => ["Init", "Warm Pad", "Glass Bell", "Sub Bass"].map(label => option(label.toLowerCase().replace(/\s+/g, "-"), label));
const channels = () => Array.from({ length: 11 }, (_, index) => option(`ch${index + 1}`, `Ch ${index + 1}`));
/** A component that renders an option: a binding cannot read its label, so a selector of these is drawn as a display. */
const Custom = defineComponent({ props: { value: { type: String, required: true } }, setup: (props, { slots }) => () => h("option", { value: props.value }, slots.default?.()) });

/** What the Select was before the forms: the contract markup of `select.md`. */
const legacy = `
  <select class="ug-select" data-strata-face="raised" id="legacy" name="size"><option value="s">Small</option><option value="m" selected>Medium</option><option value="l">Large</option></select>`;

const Probe = defineComponent({
  setup() {
    const sizes = () => [option("s", "Small"), option("m", "Medium"), option("l", "Large")];
    return () => h("main", [
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Probe", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" } }, [
        mode === "legacy" ? h("div", { id: "probe", innerHTML: legacy })
          : h("div", { id: "probe" }, [h(Select, { ...(mode === "flush" ? { form: "flush" } : {}), id: "legacy", name: "size", defaultValue: "m" }, { default: sizes })]),
      ]),
    ]);
  },
});

const App = defineComponent({
  setup() {
    const wave = ref("saw");
    window.strataSelectBinding = { wave: () => wave.value, setWave: value => { wave.value = value; }, changes: () => [...changes], refs: { get preset() { return document.getElementById("preset") as HTMLSelectElement; } } };
    return () => h("main", [
      h("div", { "data-contract": "select.md#selector", hidden: true }, [h(Select, { form: "selector", id: "wave-example", name: "wave", "aria-label": "Wave", defaultValue: "saw" }, { default: waves })]),
      h("div", { "data-contract": "select.md#display", hidden: true }, [h(Select, { form: "display", id: "preset-example", name: "preset", "aria-label": "Preset", defaultValue: "warm-pad" }, { default: presets })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Select forms", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" } }, [
        h("form", { id: "owner-form" }),
        h(Field, { label: "Wave", controlId: "wave" }, { default: () => h(Select, { form: "selector", modelValue: wave.value, "onUpdate:modelValue": (value: string) => { changes.push(value); wave.value = value; } }, { default: waves }) }),
        h(Field, { label: "Preset", controlId: "preset" }, { default: () => h(Select, { form: "display", name: "preset", defaultValue: "glass-bell", class: "extra", style: { marginRight: "4px" }, "data-testid": "preset" }, { default: presets }) }),
        h(Field, { label: "Channel", controlId: "many" }, { default: () => h(Select, { form: "selector", defaultValue: "ch3" }, { default: channels }) }),
        h(Field, { label: "Sound", controlId: "grouped", help: "Pick a sound." }, { default: () => h(Select, { form: "selector", defaultValue: "b1" }, { default: () => [
          h("optgroup", { label: "Drums" }, [option("a1", "Kick"), option("a2", "Snare")]), h("optgroup", { label: "Synth" }, [option("b1", "Bass")])] }) }),
        h(Field, { label: "Custom", controlId: "custom" }, { default: () => h(Select, { form: "selector", defaultValue: "b" }, { default: () => [h(Custom, { value: "a" }, { default: () => "One" }), h(Custom, { value: "b" }, { default: () => "Two" })] }) }),
        h(Field, { label: "Locked", controlId: "locked", disabled: true }, { default: () => h(Select, { form: "selector", defaultValue: "saw" }, { default: waves }) }),
        h(Field, { label: "Small", controlId: "small" }, { default: () => h(Select, { form: "selector", size: "small", defaultValue: "saw" }, { default: waves }) }),
        h(Field, { label: "List", controlId: "list" }, { default: () => h(Select, { form: "selector", multiple: true }, { default: waves }) }),
        h(Field, { label: "Owned", controlId: "owned" }, { default: () => h(Select, { form: "owner-form", name: "owned" }, { default: waves }) }),
        h(Field, { label: "Flat", controlId: "flat" }, { default: () => h(Select, { form: "flush" }, { default: waves }) }),
        h(Field, { label: "Plain", controlId: "plain" }, { default: () => h(Select, {}, { default: waves }) }),
      ]),
      h("p", { id: "wave-read" }, `Wave ${wave.value}`),
    ]);
  },
});

declare global {
  interface Window { strataSelectBinding: { wave(): string; setWave(value: string): void; changes(): string[]; refs: { preset: HTMLSelectElement } } }
}
createApp(mode ? Probe : App).mount("#root");
