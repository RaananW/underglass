/**
 * Strata deferred forms React check page (`ui-deferred-forms-react.html`): `Slider` with `form="wheel"`, `RadioGroup` with `form="selector"` and `Display` / `TextField`
 * with `segments` from `@underglass/ui/react`, in plain React, with no Underglass. `[data-contract]` containers render the anatomy pages' form examples
 * (`slider.md`, `radio.md`, `display.md`, section 11); the panel below holds a controlled wheel, an uncontrolled wheel with a ref, `className`, `style` and an
 * attribute, a flush slider, a disabled wheel in a Field; a controlled selector, an uncontrolled one with a ref, a nine-radio selector (drawn as a bank by the
 * documented rule), a selector whose labels are too long (a bank), one whose radios a component renders (a bank), a disabled selector, a flush group and a group
 * whose `form` names a form owner; and the segments displays (an output, a TextField display, one without the look). `?mode=plain|flush|legacy` renders `#probe`
 * instead: a Slider, a RadioGroup and a Display with no form, with `form="flush"` (and `segments={false}`) and as the contract markup they had before the forms (the
 * flush checks compare the three, pixel for pixel). `window.strataDeferredBinding` exposes the state for `tests/browser/ui-deferred-forms-bindings.test.mjs`;
 * `ui-deferred-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Display, Field, Radio, RadioGroup, Slider, TextField } from "@underglass/ui/react";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");

const modes = ["Mix", "Solo", "Mute", "Bypass"].map(label => <Radio key={label} value={label.toLowerCase()}>{label}</Radio>);
const routes = Array.from({ length: 9 }, (_, index) => <Radio key={index} value={`r${index + 1}`}>{`Out ${index + 1}`}</Radio>);
/** A component that renders a radio: a binding cannot read its label, so a selector of these is drawn as a bank. */
const Custom = ({ value, children }: { value: string; children: ReactNode }) => <Radio value={value}>{children}</Radio>;

/** What the controls were before the forms: the contract markup of their anatomy pages. */
const legacy = {
  slider: `<input type="range" class="ug-slider" data-strata-face="groove" id="legacy-slider" min="0" max="100" value="40">`,
  radio: `<fieldset class="ug-radio-group" id="legacy-radio"><legend class="ug-radio-group__legend">Mode</legend><label class="ug-radio"><input class="ug-radio__input" data-strata-face="well" type="radio" name="legacy-mode" value="mix" checked><span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">Mix</span></label><label class="ug-radio"><input class="ug-radio__input" data-strata-face="well" type="radio" name="legacy-mode" value="solo"><span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span><span class="ug-radio__label">Solo</span></label></fieldset>`,
  display: `<span class="ug-display ug-display--output" data-strata-form="display"><span class="ug-display__object" aria-hidden="true"><span class="ug-display__bezel" data-strata-face="groove"><span class="ug-display__window" data-strata-face="flat"></span></span></span><output class="ug-display__text" id="legacy-display" aria-label="Clock">12:34</output></span>`,
};

function Probe() {
  const flushed = mode === "flush";
  return (
    <main>
      <section className="ug-panel" data-strata-face="raised" aria-label="Probe" style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
        {mode === "legacy" ? (
          <>
            <div id="probe-slider" dangerouslySetInnerHTML={{ __html: legacy.slider }} />
            <div id="probe-radio" dangerouslySetInnerHTML={{ __html: legacy.radio }} />
            <div id="probe-display" dangerouslySetInnerHTML={{ __html: legacy.display }} />
          </>
        ) : (
          <>
            <div id="probe-slider">{flushed ? <Slider form="flush" id="legacy-slider" min={0} max={100} defaultValue={40} /> : <Slider id="legacy-slider" min={0} max={100} defaultValue={40} />}</div>
            <div id="probe-radio">
              <RadioGroup legend="Mode" id="legacy-radio" name="legacy-mode" defaultValue="mix" {...(flushed ? { form: "flush" } : {})}><Radio value="mix">Mix</Radio><Radio value="solo">Solo</Radio></RadioGroup>
            </div>
            <div id="probe-display"><Display id="legacy-display" label="Clock" {...(flushed ? { segments: false } : {})}>12:34</Display></div>
          </>
        )}
      </section>
    </main>
  );
}

function App() {
  const [gain, setGain] = useState(40);
  const [selected, setSelected] = useState("solo");
  const panRef = useRef<HTMLInputElement>(null);
  const groupRef = useRef<HTMLFieldSetElement>(null);
  window.strataDeferredBinding = { gain: () => gain, setGain, mode: () => selected, setMode: setSelected, changes: () => [...changes], refs: { get pan() { return panRef.current!; }, get group() { return groupRef.current!; } } };
  return (
    <main>
      <div data-contract="slider.md#wheel" hidden><Slider form="wheel" id="gain-example" name="gain" aria-label="Gain" defaultValue={40} marks={[0, 50, 100]} /></div>
      <div data-contract="radio.md#selector" hidden><RadioGroup form="selector" legend="Mode" name="mode-example" defaultValue="solo">{modes}</RadioGroup></div>
      <div data-contract="display.md#segments" hidden><Display segments id="clock-example" label="Clock">12:34</Display></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Deferred forms" style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
        <form id="owner-form" />
        <Field label="Gain" controlId="gain"><Slider form="wheel" value={gain} onChange={event => { changes.push(`gain ${event.target.value}`); setGain(Number(event.target.value)); }} unit=" dB" marks={[0, 50, 100]} /></Field>
        <Field label="Pan" controlId="pan"><Slider ref={panRef} form="wheel" name="pan" defaultValue={75} marks={[0, 25, 50, 75, 100]} travel={80} sweep={120} className="extra" style={{ marginRight: "4px" }} data-testid="pan" /></Field>
        <Field label="Flat" controlId="flat"><Slider form="flush" defaultValue={60} /></Field>
        <Field label="Locked" controlId="locked" disabled><Slider form="wheel" defaultValue={30} /></Field>
        <RadioGroup ref={groupRef} form="selector" id="mode" legend="Mode" name="mode" value={selected} onChange={value => { changes.push(`mode ${value}`); setSelected(value); }}>{modes}</RadioGroup>
        <RadioGroup form="selector" id="free" legend="Free" name="free" defaultValue="mute" className="extra" style={{ marginRight: "4px" }} data-testid="free" help="Pick one.">{modes}</RadioGroup>
        <RadioGroup form="selector" id="route" legend="Route" name="route" defaultValue="r3">{routes}</RadioGroup>
        <RadioGroup form="selector" id="long" legend="Long" name="long" defaultValue="a"><Radio value="a">A rather long label</Radio><Radio value="b">Short</Radio></RadioGroup>
        <RadioGroup form="selector" id="custom" legend="Custom" name="custom" defaultValue="b"><Custom value="a">One</Custom><Custom value="b">Two</Custom></RadioGroup>
        <RadioGroup form="selector" id="locked-group" legend="Locked" name="locked-group" defaultValue="mute" disabled>{modes}</RadioGroup>
        <RadioGroup form="selector" id="small" legend="Small" name="small" size="small" defaultValue="mix">{modes}</RadioGroup>
        <RadioGroup form="selector" id="bad" legend="Invalid" name="bad" error="Pick one." defaultValue="mix">{modes}</RadioGroup>
        <RadioGroup form="flush" id="flat-group" legend="Flat" name="flat-group" defaultValue="mix"><Radio value="mix">Mix</Radio><Radio value="solo">Solo</Radio></RadioGroup>
        <RadioGroup form="owner-form" id="owned" legend="Owned" name="owned" defaultValue="mix"><Radio value="mix">Mix</Radio><Radio value="solo">Solo</Radio></RadioGroup>
        <Display segments id="clock" label="Clock">12:34</Display>
        <Display segments backlight="warning" id="readout" label="Level" live="off">{"-18.5 dB"}</Display>
        <Field label="Frequency" controlId="freq"><TextField form="display" segments defaultValue="440.0" /></Field>
        <Display id="plainout" label="Plain">12:34 Hz</Display>
      </section>
      <p id="gain-read">Gain {gain}</p>
    </main>
  );
}

declare global {
  interface Window { strataDeferredBinding: { gain(): number; setGain(value: number): void; mode(): string; setMode(value: string): void; changes(): string[]; refs: { pan: HTMLInputElement; group: HTMLFieldSetElement } } }
}
createRoot(document.getElementById("root")!).render(mode ? <Probe /> : <App />);
