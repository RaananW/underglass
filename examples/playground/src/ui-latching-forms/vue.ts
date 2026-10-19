/**
 * Strata latching forms Vue check page (`ui-latching-forms-vue.html`): `Checkbox`, `RadioGroup` and `SegmentedControl` with their
 * latching forms from `@underglass/ui/vue` in plain Vue, with no Underglass. It mirrors `ui-latching-forms-react.html` element for
 * element: the anatomy pages' latching examples, a `v-model` latching Checkbox, an uncontrolled one, a mixed one, a disabled one, a
 * Checkbox whose `form` names a form owner, a `v-model` preset bank and a `v-model` latching SegmentedControl, and the `?mode=` probes
 * of the flush checks, exposed through `window.strataLatchBinding` for `tests/browser/ui-latching-forms-bindings.test.mjs`.
 */
import "@underglass/ui/css";
import { createApp, defineComponent, h, onMounted, ref } from "vue";
import { Checkbox, Radio, RadioGroup, SegmentedControl } from "@underglass/ui/vue";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");

const options = [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }];

/** What the three controls were before the latching forms: the contract markup of `checkbox.md`, `radio.md` and `segmented-control.md`. */
const legacy = `
  <label class="ug-checkbox"><input class="ug-checkbox__input" data-strata-face="well" type="checkbox"><span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">Newsletter</span></label>
  <label class="ug-checkbox"><input class="ug-checkbox__input" data-strata-face="well" type="checkbox" id="legacy-on" checked><span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">Terms</span></label>
  <label class="ug-checkbox"><input class="ug-checkbox__input" data-strata-face="well" type="checkbox" id="legacy-mixed"><span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">Pad group</span></label>
  <fieldset class="ug-radio-group"><legend class="ug-radio-group__legend">Plan</legend>
    <label class="ug-radio"><input class="ug-radio__input" data-strata-face="well" type="radio" name="plan" value="free" checked><span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">Free</span></label>
    <label class="ug-radio"><input class="ug-radio__input" data-strata-face="well" type="radio" name="plan" value="pro"><span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">Pro</span></label>
  </fieldset>
  <fieldset class="ug-segmented"><legend class="ug-segmented__legend">View</legend><div class="ug-segmented__plinth">
    <label class="ug-segmented__item"><input class="ug-segmented__input" type="radio" name="view" value="day" checked><span class="ug-segmented__key" data-strata-face="raised">Day</span></label>
    <label class="ug-segmented__item"><input class="ug-segmented__input" type="radio" name="view" value="week"><span class="ug-segmented__key" data-strata-face="raised">Week</span></label>
    <label class="ug-segmented__item"><input class="ug-segmented__input" type="radio" name="view" value="month" disabled><span class="ug-segmented__key" data-strata-face="raised">Month</span></label>
  </div></fieldset>`.replace(/>\s+</g, "><");

const text = (value: string) => ({ default: () => value });

/** The same controls as `legacy`, through the bindings, with `form` as given (none, or `flush`). */
const flush = (form?: "flush") => [
  h(Checkbox, { form }, text("Newsletter")),
  h(Checkbox, { form, id: "legacy-on", modelValue: true }, text("Terms")),
  h(Checkbox, { form, id: "legacy-mixed", indeterminate: true }, text("Pad group")),
  h(RadioGroup, { form, legend: "Plan", name: "plan", defaultValue: "free" }, { default: () => [h(Radio, { value: "free" }, text("Free")), h(Radio, { value: "pro" }, text("Pro"))] }),
  h(SegmentedControl, { form, label: "View", name: "view", defaultValue: "day", options: [{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }] }),
];

const App = defineComponent({
  setup() {
    const monitor = ref(false), preset = ref("organ"), range = ref("week");
    window.strataLatchBinding = {
      monitor: () => monitor.value, setMonitor: value => { monitor.value = value; }, preset: () => preset.value, setPreset: value => { preset.value = value; },
      range: () => range.value, setRange: value => { range.value = value; }, changes: () => [...changes],
      refs: { get monitor() { return document.getElementById("monitor") as HTMLInputElement; } },
    };
    onMounted(() => { const mixed = document.getElementById("legacy-mixed") as HTMLInputElement | null; if (mixed && mode === "legacy") mixed.indeterminate = true; });
    return () => {
      if (mode === "legacy") return h("main", [h("div", { id: "probe", innerHTML: legacy })]);
      if (mode === "plain" || mode === "flush") return h("main", [h("div", { id: "probe" }, flush(mode === "flush" ? "flush" : undefined))]);
      return h("main", [
        h("div", { "data-contract": "checkbox.md#2", hidden: true }, [h(Checkbox, { form: "latching", colour: "info" }, text("Phantom power"))]),
        h("div", { "data-contract": "radio.md#2", hidden: true }, [h(RadioGroup, { legend: "Preset", name: "preset", form: "bank" }, { default: () => [h(Radio, { value: "piano" }, text("Piano")), h(Radio, { value: "organ" }, text("Organ")), h(Radio, { value: "strings" }, text("Strings"))] })]),
        h("div", { "data-contract": "segmented-control.md#2", hidden: true }, [h(SegmentedControl, { label: "View", name: "view", form: "latching", options })]),
        h("section", { class: "ug-panel", "data-strata-face": "raised", "aria-label": "Latching forms" }, [
          h("form", { id: "owner-form" }),
          h(Checkbox, { form: "latching", id: "monitor", class: "extra", style: { marginRight: "4px" }, "data-testid": "monitor", modelValue: monitor.value,
            "onUpdate:modelValue": (value: boolean) => { changes.push(`monitor:${value}`); monitor.value = value; } }, text("Monitor")),
          h(Checkbox, { form: "latching", colour: "info", id: "phantom", modelValue: undefined, checked: true }, text("Phantom")),
          h(Checkbox, { form: "latching", id: "mixed", indeterminate: true }, text("Pad group")),
          h(Checkbox, { form: "latching", id: "locked", disabled: true }, text("Locked")),
          h(Checkbox, { form: "latching", id: "armed", checked: true, disabled: true }, text("Armed")),
          h(Checkbox, { form: "owner-form", id: "owned" }, text("Owned")),
          h(Checkbox, { id: "plain" }, text("Plain")),
          h(RadioGroup, { legend: "Preset", name: "preset-live", form: "bank", colour: "success", modelValue: preset.value, "onUpdate:modelValue": (value: string) => { changes.push(`preset:${value}`); preset.value = value; } },
            { default: () => [h(Radio, { value: "piano", id: "r-piano" }, text("Piano")), h(Radio, { value: "organ", id: "r-organ" }, text("Organ")), h(Radio, { value: "strings", id: "r-strings" }, text("Strings")), h(Radio, { value: "pad", id: "r-pad", disabled: true }, text("Pad"))] }),
          h(SegmentedControl, { label: "Range", name: "range-live", form: "latching", modelValue: range.value, "onUpdate:modelValue": (value: string) => { changes.push(`range:${value}`); range.value = value; }, options }),
          h(RadioGroup, { legend: "Owned bank", name: "owned-bank", form: "owner-form" }, { default: () => [h(Radio, { value: "a", id: "owned-a" }, text("A"))] }),
        ]),
        h("p", { id: "latch-read" }, `Monitor ${monitor.value ? "on" : "off"}, preset ${preset.value}, range ${range.value}`),
      ]);
    };
  },
});

declare global {
  interface Window { strataLatchBinding: { monitor(): boolean; setMonitor(value: boolean): void; preset(): string; setPreset(value: string): void; range(): string; setRange(value: string): void; changes(): string[]; refs: { monitor: HTMLInputElement } } }
}
createApp(App).mount("#root");
