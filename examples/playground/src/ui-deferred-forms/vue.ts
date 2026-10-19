/**
 * Strata deferred forms Vue check page (`ui-deferred-forms-vue.html`): `Slider` with `form="wheel"`, `RadioGroup` with `form="selector"` and `Display` / `TextField` with
 * `segments` from `@underglass/ui/vue`, in plain Vue, with no Underglass. It mirrors `ui-deferred-forms-react.html` element for element (the anatomy pages' form examples,
 * the live panel, `?mode=plain|flush|legacy` for the flush checks) and exposes `window.strataDeferredBinding` for `tests/browser/ui-deferred-forms-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, ref } from "vue";
import { Display, Field, Radio, RadioGroup, Slider, TextField } from "@underglass/ui/vue";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");

const radio = (value: string, label: string) => h(Radio, { key: value, value }, { default: () => label });
const modes = () => ["Mix", "Solo", "Mute", "Bypass"].map(label => radio(label.toLowerCase(), label));
const routes = () => Array.from({ length: 9 }, (_, index) => radio(`r${index + 1}`, `Out ${index + 1}`));
/** A component that renders a radio: a binding cannot read its label, so a selector of these is drawn as a bank. */
const Custom = defineComponent({ props: { value: { type: String, required: true } }, setup: (props, { slots }) => () => h(Radio, { value: props.value }, { default: () => slots.default?.() }) });

/** What the controls were before the forms: the contract markup of their anatomy pages. */
const legacy = {
  slider: `<input type="range" class="ug-slider" data-strata-face="groove" id="legacy-slider" min="0" max="100" value="40">`,
  radio: `<fieldset class="ug-radio-group" id="legacy-radio"><legend class="ug-radio-group__legend">Mode</legend><label class="ug-radio"><input class="ug-radio__input" data-strata-face="well" type="radio" name="legacy-mode" value="mix" checked><span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">Mix</span></label><label class="ug-radio"><input class="ug-radio__input" data-strata-face="well" type="radio" name="legacy-mode" value="solo"><span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">Solo</span></label></fieldset>`,
  display: `<span class="ug-display ug-display--output" data-strata-form="display"><span class="ug-display__object" aria-hidden="true"><span class="ug-display__bezel" data-strata-face="groove"><span class="ug-display__window" data-strata-face="flat"></span></span></span><output class="ug-display__text" id="legacy-display" aria-label="Clock">12:34</output></span>`,
};

const Probe = defineComponent({
  setup() {
    const flushed = mode === "flush";
    return () => h("main", [
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Probe", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" } }, mode === "legacy" ? [
        h("div", { id: "probe-slider", innerHTML: legacy.slider }), h("div", { id: "probe-radio", innerHTML: legacy.radio }), h("div", { id: "probe-display", innerHTML: legacy.display }),
      ] : [
        h("div", { id: "probe-slider" }, [h(Slider, { ...(flushed ? { form: "flush" } : {}), id: "legacy-slider", min: 0, max: 100, defaultValue: 40 })]),
        h("div", { id: "probe-radio" }, [h(RadioGroup, { ...(flushed ? { form: "flush" } : {}), legend: "Mode", id: "legacy-radio", name: "legacy-mode", defaultValue: "mix" }, { default: () => [radio("mix", "Mix"), radio("solo", "Solo")] })]),
        h("div", { id: "probe-display" }, [h(Display, { id: "legacy-display", label: "Clock", ...(flushed ? { segments: false } : {}) }, { default: () => "12:34" })]),
      ]),
    ]);
  },
});

const App = defineComponent({
  setup() {
    const gain = ref(40), selected = ref("solo");
    window.strataDeferredBinding = { gain: () => gain.value, setGain: value => { gain.value = value; }, mode: () => selected.value, setMode: value => { selected.value = value; }, changes: () => [...changes],
      refs: { get pan() { return document.getElementById("pan") as HTMLInputElement; }, get group() { return document.getElementById("mode") as HTMLFieldSetElement; } } };
    return () => h("main", [
      h("div", { "data-contract": "slider.md#wheel", hidden: true }, [h(Slider, { form: "wheel", id: "gain-example", name: "gain", "aria-label": "Gain", defaultValue: 40, marks: [0, 50, 100] })]),
      h("div", { "data-contract": "radio.md#selector", hidden: true }, [h(RadioGroup, { form: "selector", legend: "Mode", name: "mode-example", defaultValue: "solo" }, { default: modes })]),
      h("div", { "data-contract": "display.md#segments", hidden: true }, [h(Display, { segments: true, id: "clock-example", label: "Clock" }, { default: () => "12:34" })]),
      h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Deferred forms", style: { display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" } }, [
        h("form", { id: "owner-form" }),
        h(Field, { label: "Gain", controlId: "gain" }, { default: () => h(Slider, { form: "wheel", modelValue: gain.value, unit: " dB", marks: [0, 50, 100], "onUpdate:modelValue": (value: number) => { changes.push(`gain ${value}`); gain.value = value; } }) }),
        h(Field, { label: "Pan", controlId: "pan" }, { default: () => h(Slider, { form: "wheel", name: "pan", defaultValue: 75, marks: [0, 25, 50, 75, 100], travel: 80, sweep: 120, class: "extra", style: { marginRight: "4px" }, "data-testid": "pan" }) }),
        h(Field, { label: "Flat", controlId: "flat" }, { default: () => h(Slider, { form: "flush", defaultValue: 60 }) }),
        h(Field, { label: "Locked", controlId: "locked", disabled: true }, { default: () => h(Slider, { form: "wheel", defaultValue: 30 }) }),
        h(RadioGroup, { form: "selector", id: "mode", legend: "Mode", name: "mode", modelValue: selected.value, "onUpdate:modelValue": (value: string) => { changes.push(`mode ${value}`); selected.value = value; } }, { default: modes }),
        h(RadioGroup, { form: "selector", id: "free", legend: "Free", name: "free", defaultValue: "mute", class: "extra", style: { marginRight: "4px" }, "data-testid": "free", help: "Pick one." }, { default: modes }),
        h(RadioGroup, { form: "selector", id: "route", legend: "Route", name: "route", defaultValue: "r3" }, { default: routes }),
        h(RadioGroup, { form: "selector", id: "long", legend: "Long", name: "long", defaultValue: "a" }, { default: () => [radio("a", "A rather long label"), radio("b", "Short")] }),
        h(RadioGroup, { form: "selector", id: "custom", legend: "Custom", name: "custom", defaultValue: "b" }, { default: () => [h(Custom, { value: "a" }, { default: () => "One" }), h(Custom, { value: "b" }, { default: () => "Two" })] }),
        h(RadioGroup, { form: "selector", id: "locked-group", legend: "Locked", name: "locked-group", defaultValue: "mute", disabled: true }, { default: modes }),
        h(RadioGroup, { form: "selector", id: "small", legend: "Small", name: "small", size: "small", defaultValue: "mix" }, { default: modes }),
        h(RadioGroup, { form: "selector", id: "bad", legend: "Invalid", name: "bad", error: "Pick one.", defaultValue: "mix" }, { default: modes }),
        h(RadioGroup, { form: "flush", id: "flat-group", legend: "Flat", name: "flat-group", defaultValue: "mix" }, { default: () => [radio("mix", "Mix"), radio("solo", "Solo")] }),
        h(RadioGroup, { form: "owner-form", id: "owned", legend: "Owned", name: "owned", defaultValue: "mix" }, { default: () => [radio("mix", "Mix"), radio("solo", "Solo")] }),
        h(Display, { segments: true, id: "clock", label: "Clock" }, { default: () => "12:34" }),
        h(Display, { segments: true, backlight: "warning", id: "readout", label: "Level", live: "off" }, { default: () => "-18.5 dB" }),
        h(Field, { label: "Frequency", controlId: "freq" }, { default: () => h(TextField, { form: "display", segments: true, value: "440.0" }) }),
        h(Display, { id: "plainout", label: "Plain" }, { default: () => "12:34 Hz" }),
      ]),
      h("p", { id: "gain-read" }, `Gain ${gain.value}`),
    ]);
  },
});

declare global {
  interface Window { strataDeferredBinding: { gain(): number; setGain(value: number): void; mode(): string; setMode(value: string): void; changes(): string[]; refs: { pan: HTMLInputElement; group: HTMLFieldSetElement } } }
}
createApp(mode ? Probe : App).mount("#root");
