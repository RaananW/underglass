/**
 * Strata latching forms React check page (`ui-latching-forms-react.html`): `Checkbox`, `RadioGroup` and `SegmentedControl` with their
 * latching forms from `@underglass/ui/react` in plain React, with no Underglass. `[data-contract="checkbox.md#2"]`,
 * `[data-contract="radio.md#2"]` and `[data-contract="segmented-control.md#2"]` render the anatomy pages' latching examples; the
 * panel below holds a controlled latching Checkbox, an uncontrolled one, a mixed one, a disabled one, a Checkbox whose `form` names a
 * form owner, a controlled preset bank and a controlled latching SegmentedControl.
 * `?mode=plain|flush|legacy` renders `#probe` instead: the same three controls with no `form`, with `form="flush"`, and as the
 * contract markup they had before the latching forms (the flush checks compare the three, pixel for pixel).
 * `window.strataLatchBinding` exposes the state for `tests/browser/ui-latching-forms-bindings.test.mjs`;
 * `ui-latching-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Checkbox, Radio, RadioGroup, SegmentedControl } from "@underglass/ui/react";

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

/** The same controls as `legacy`, through the bindings, with `form` as given (none, or `flush`). */
function Flush({ form }: { form?: "flush" }) {
  return (
    <>
      <Checkbox form={form}>Newsletter</Checkbox>
      <Checkbox form={form} id="legacy-on" defaultChecked>Terms</Checkbox>
      <Checkbox form={form} id="legacy-mixed" indeterminate>Pad group</Checkbox>
      <RadioGroup form={form} legend="Plan" name="plan" defaultValue="free"><Radio value="free">Free</Radio><Radio value="pro">Pro</Radio></RadioGroup>
      <SegmentedControl form={form} label="View" name="view" defaultValue="day" options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month", disabled: true }]} />
    </>
  );
}

function App() {
  const [monitor, setMonitor] = useState(false);
  const [preset, setPreset] = useState("organ");
  const [range, setRange] = useState("week");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.strataLatchBinding = { monitor: () => monitor, setMonitor, preset: () => preset, setPreset, range: () => range, setRange, changes: () => [...changes], refs: { monitor: ref.current! } };
  });
  useEffect(() => { const mixed = document.getElementById("legacy-mixed") as HTMLInputElement | null; if (mixed && mode === "legacy") mixed.indeterminate = true; }, []);
  if (mode === "legacy") return <main><div id="probe" dangerouslySetInnerHTML={{ __html: legacy }} /></main>;
  if (mode === "plain" || mode === "flush") return <main><div id="probe"><Flush form={mode === "flush" ? "flush" : undefined} /></div></main>;
  return (
    <main>
      <div data-contract="checkbox.md#2" hidden><Checkbox form="latching" colour="info">Phantom power</Checkbox></div>
      <div data-contract="radio.md#2" hidden>
        <RadioGroup legend="Preset" name="preset" form="bank"><Radio value="piano">Piano</Radio><Radio value="organ">Organ</Radio><Radio value="strings">Strings</Radio></RadioGroup>
      </div>
      <div data-contract="segmented-control.md#2" hidden><SegmentedControl label="View" name="view" form="latching" options={options} /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Latching forms">
        <form id="owner-form" />
        <Checkbox ref={ref} form="latching" id="monitor" className="extra" style={{ marginRight: 4 }} data-testid="monitor" checked={monitor} onChange={event => { changes.push(`monitor:${event.target.checked}`); setMonitor(event.target.checked); }}>Monitor</Checkbox>
        <Checkbox form="latching" colour="info" id="phantom" defaultChecked>Phantom</Checkbox>
        <Checkbox form="latching" id="mixed" indeterminate>Pad group</Checkbox>
        <Checkbox form="latching" id="locked" disabled>Locked</Checkbox>
        <Checkbox form="latching" id="armed" defaultChecked disabled>Armed</Checkbox>
        <Checkbox form="owner-form" id="owned">Owned</Checkbox>
        <Checkbox id="plain">Plain</Checkbox>
        <RadioGroup legend="Preset" name="preset-live" form="bank" colour="success" value={preset} onChange={value => { changes.push(`preset:${value}`); setPreset(value); }}>
          <Radio value="piano" id="r-piano">Piano</Radio><Radio value="organ" id="r-organ">Organ</Radio><Radio value="strings" id="r-strings">Strings</Radio><Radio value="pad" id="r-pad" disabled>Pad</Radio>
        </RadioGroup>
        <SegmentedControl label="Range" name="range-live" form="latching" value={range} onChange={value => { changes.push(`range:${value}`); setRange(value); }} options={options} />
        <RadioGroup legend="Owned bank" name="owned-bank" form="owner-form"><Radio value="a" id="owned-a">A</Radio></RadioGroup>
      </section>
      <p id="latch-read">Monitor {monitor ? "on" : "off"}, preset {preset}, range {range}</p>
    </main>
  );
}

declare global {
  interface Window { strataLatchBinding: { monitor(): boolean; setMonitor(value: boolean): void; preset(): string; setPreset(value: string): void; range(): string; setRange(value: string): void; changes(): string[]; refs: { monitor: HTMLInputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
