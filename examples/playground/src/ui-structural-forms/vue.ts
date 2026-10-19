/**
 * Strata structural forms Vue check page (`ui-structural-forms-vue.html`): `Slider`, `Card`, `Panel`, `Dialog` and `Drawer` from
 * `@underglass/ui/vue` with `form`, in plain Vue, with no Underglass. It mirrors `ui-structural-forms-react.html` element for element:
 * the anatomy pages' form examples, a `v-model` knob slider, an uncontrolled fader with a ref, `class`, `style` and an attribute, a
 * slider in a Field, a slider whose `form` names its form owner, plate and tray Cards and Panels, and the Dialog and Drawer opened by
 * `window.strataStructureBinding.open(...)`, exposed for `tests/browser/ui-structural-forms-bindings.test.mjs`. `?mode=plain|flush|legacy`
 * renders `#probe` as the React page does.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Button, Card, Dialog, Drawer, Field, Panel, Slider } from "@underglass/ui/vue";

const changes: number[] = [];
const mode = new URLSearchParams(location.search).get("mode");

/** What the three controls were before the forms: the contract markup of `slider.md`, `card.md` and `panel.md`. */
const legacy = `
  <input type="range" class="ug-slider" data-strata-face="groove" min="0" max="100" step="1" value="40" aria-label="Mix">
  <article class="ug-card" data-strata-face="raised" aria-labelledby="card-title"><h3 class="ug-card__title" id="card-title">Card</h3><div class="ug-card__body"><p>Body</p></div><div class="ug-card__footer"><button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Save</span></button></div></article>
  <section class="ug-panel" data-strata-face="raised" data-strata-elevation="floating" aria-labelledby="panel-title"><h2 id="panel-title">Panel</h2><p>Content</p></section>`.replace(/>\s+</g, "><");

const save = () => h("button", { type: "button", class: "ug-button", "data-strata-face": "raised" }, [h("span", { class: "ug-button__label" }, "Save")]);

/** The same controls as `legacy`, through the bindings, with `form` as given (none, or `flush`). */
const flushControls = (form?: "flush") => [
  h(Slider, { form, "aria-label": "Mix", min: 0, max: 100, step: 1, defaultValue: 40 }),
  h(Card, { form, title: "Card" }, { default: () => h("p", "Body"), footer: save }),
  h(Panel, { form, title: "Panel" }, { default: () => h("p", "Content") }),
];

const App = defineComponent({
  setup() {
    const drive = ref(40), shown = ref<"dialog" | "drawer" | "none">("none"), contracts = ref(false);
    onMounted(() => {
      window.strataStructureBinding = { drive: () => drive.value, setDrive: value => { drive.value = value; }, changes: () => [...changes], open: which => { shown.value = which; }, contracts: open => { contracts.value = open; },
        refs: { knob: document.getElementById("wet") as HTMLInputElement, fader: document.getElementById("trim") as HTMLInputElement, card: document.getElementById("card-plate")!, panel: document.getElementById("panel-plate")! } };
    });
    return () => {
      if (mode === "legacy") return h("main", [h("div", { id: "probe", innerHTML: legacy })]);
      if (mode === "plain" || mode === "flush") return h("main", [h("div", { id: "probe" }, flushControls(mode === "flush" ? "flush" : undefined))]);
      return h("main", [
        h("div", { "data-contract": "slider.md#2", hidden: true }, [h(Slider, { form: "knob", id: "drive-example", name: "drive", "aria-label": "Drive", marks: [0, 50, 100], defaultValue: 40 })]),
        h("div", { "data-contract": "slider.md#3", hidden: true }, [h(Slider, { form: "fader", id: "trim-example", name: "trim", "aria-label": "Trim", min: -12, max: 12, step: 6, detents: 5, marks: [-12, 0, 12], defaultValue: 0, unit: " dB" })]),
        h("div", { "data-contract": "card.md#2", hidden: true }, [h(Card, { form: "plate", titleId: "plate-card-title", title: "Plate" }, { default: () => "A machined plate." })]),
        h("div", { "data-contract": "card.md#3", hidden: true }, [h(Card, { form: "tray", titleId: "tray-card-title", title: "Tray" }, { default: () => "The body sits in a tray." })]),
        h("div", { "data-contract": "panel.md#2", hidden: true }, [h(Panel, { form: "plate", titleId: "plate-panel-title", title: "Plate" }, { default: () => "Content" })]),
        h("div", { "data-contract": "panel.md#3", hidden: true }, [h(Panel, { form: "tray", titleId: "tray-panel-title", title: "Tray" }, { default: () => "Content" })]),
        h("div", { "data-contract": "dialog.md#3" }, [h(Dialog, { open: contracts.value, container: '[data-contract="dialog.md#3"]', form: "plate", title: "Discard changes?", titleId: "discard-title", description: "Your edits will be lost.", descriptionId: "discard-description" }, {
          actions: () => h(Button, { "data-strata-close": "" }, { default: () => "Keep editing" }),
        })]),
        h("div", { "data-contract": "drawer.md#3" }, [h(Drawer, { open: contracts.value, container: '[data-contract="drawer.md#3"]', form: "tray", title: "Filters", titleId: "filters-title", description: "Narrow the list.", descriptionId: "filters-description" }, {
          actions: () => h(Button, { "data-strata-close": "" }, { default: () => "Done" }),
        })]),
        h("form", { id: "owner", "aria-label": "Owner" }),
        h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Structural forms", style: { display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "20px" } }, [
          h(Slider, { form: "knob", id: "drive", name: "drive", "aria-label": "Drive", marks: [0, 50, 100], modelValue: drive.value, unit: "%", "onUpdate:modelValue": (value: number) => { changes.push(value); drive.value = value; } }),
          h(Slider, { form: "fader", id: "trim", "aria-label": "Trim", min: -12, max: 12, step: 6, detents: 5, defaultValue: 0, unit: " dB", class: "extra", style: { marginRight: "4px" }, "data-testid": "trim" }),
          h(Field, { help: "Mixes the dry signal." }, { default: () => h(Slider, { form: "knob", id: "wet", min: 0, max: 10, defaultValue: 3, size: "small" }) }),
          h(Slider, { form: "owner", id: "owned", name: "owned", "aria-label": "Owned", min: 0, max: 10, defaultValue: 5 }),
          h(Slider, { form: "flush", id: "flat", "aria-label": "Flat", defaultValue: 60 }),
          h(Card, { form: "plate", id: "card-plate", title: "Plate card", class: "extra", style: { marginRight: "4px" }, "data-testid": "card" }, { default: () => "A machined plate.", footer: save }),
          h(Card, { form: "tray", id: "card-tray", title: "Tray card" }, { default: () => "The body sits in a tray." }),
          h(Card, { form: "flush", id: "card-flush", title: "Flush card" }, { default: () => "The card of before." }),
          h(Panel, { form: "plate", id: "panel-plate", title: "Plate panel", class: "extra", style: { marginRight: "4px" }, "data-testid": "panel" }, { default: () => h("p", "Content") }),
          h(Panel, { form: "tray", id: "panel-tray", title: "Tray panel" }, { default: () => h("p", "Content") }),
          h(Panel, { form: "flush", id: "panel-flush", title: "Flush panel" }, { default: () => h("p", "Content") }),
        ]),
        h("p", { id: "drive-read" }, `Drive ${drive.value}%`),
        h(Dialog, { open: shown.value === "dialog", form: "plate", title: "Output stage", id: "dialog-plate", "data-testid": "dialog", onClose: () => { shown.value = "none"; } }, {
          default: () => h(Slider, { form: "knob", id: "dialog-level", "aria-label": "Level", marks: [0, 10], min: 0, max: 10, defaultValue: 4 }),
          actions: () => h("button", { type: "button", class: "ug-button", "data-strata-face": "raised", "data-strata-close": "", onClick: () => { shown.value = "none"; } }, [h("span", { class: "ug-button__label" }, "Close")]),
        }),
        h(Drawer, { open: shown.value === "drawer", form: "tray", title: "Channel", id: "drawer-tray", "data-testid": "drawer", closeOnScrim: true, onClose: () => { shown.value = "none"; } }, {
          default: () => h(Slider, { form: "fader", id: "drawer-gain", "aria-label": "Gain", min: 0, max: 10, defaultValue: 3 }),
          actions: () => h("button", { type: "button", class: "ug-button", "data-strata-face": "raised", onClick: () => { shown.value = "none"; } }, [h("span", { class: "ug-button__label" }, "Done")]),
        }),
      ]);
    };
  },
});

declare global {
  interface Window { strataStructureBinding: { drive(): number; setDrive(value: number): void; changes(): number[]; open(which: "dialog" | "drawer" | "none"): void; contracts(open: boolean): void; refs: { knob: HTMLInputElement; fader: HTMLInputElement; card: HTMLElement; panel: HTMLElement } } }
}
createApp(App).mount("#root");
