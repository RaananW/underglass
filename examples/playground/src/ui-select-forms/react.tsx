/**
 * Strata Select forms React check page (`ui-select-forms-react.html`): `Select` from `@underglass/ui/react` with `form`, in plain React, with no
 * Underglass. `[data-contract]` containers render the anatomy page's form examples (`select.md` section 11: a selector, a display); the panel
 * below holds a controlled selector, an uncontrolled display with a ref, `className`, `style` and an attribute, a selector of eleven options (drawn as
 * a display), a selector with optgroups and a Field's help (drawn as a display), a selector whose options a component renders (drawn as a display), a
 * disabled selector, a `multiple` select asked as a selector (a list box, flush), a select whose `form` names a form owner, and a flush select.
 * `?mode=plain|flush|legacy` renders `#probe` instead: a Select with no `form`, with `form="flush"`, and as the contract markup it had before the
 * forms (the flush checks compare the three, pixel for pixel). `window.strataSelectBinding` exposes the state for
 * `tests/browser/ui-select-forms-bindings.test.mjs`; `ui-select-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Field, Select } from "@underglass/ui/react";

const changes: string[] = [];
const mode = new URLSearchParams(location.search).get("mode");

const waves = [["sine", "Sine"], ["saw", "Saw"], ["square", "Square"]].map(([value, label]) => <option key={value} value={value}>{label}</option>);
const presets = ["Init", "Warm Pad", "Glass Bell", "Sub Bass"].map(label => <option key={label} value={label.toLowerCase().replace(/\s+/g, "-")}>{label}</option>);
const channels = Array.from({ length: 11 }, (_, index) => <option key={index} value={`ch${index + 1}`}>{`Ch ${index + 1}`}</option>);
/** A component that renders an option: a binding cannot read its label, so a selector of these is drawn as a display. */
const Custom = ({ value, children }: { value: string; children: ReactNode }) => <option value={value}>{children}</option>;

/** What the Select was before the forms: the contract markup of `select.md`. */
const legacy = `
  <select class="ug-select" data-strata-face="raised" id="legacy" name="size"><option value="s">Small</option><option value="m" selected>Medium</option><option value="l">Large</option></select>`;

function Probe() {
  const sizes = [<option key="s" value="s">Small</option>, <option key="m" value="m">Medium</option>, <option key="l" value="l">Large</option>];
  return (
    <main>
      <section className="ug-panel" data-strata-face="raised" aria-label="Probe" style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center" }}>
        {mode === "legacy" ? <div id="probe" dangerouslySetInnerHTML={{ __html: legacy }} />
          : <div id="probe">{mode === "flush" ? <Select form="flush" id="legacy" name="size" defaultValue="m">{sizes}</Select> : <Select id="legacy" name="size" defaultValue="m">{sizes}</Select>}</div>}
      </section>
    </main>
  );
}

function App() {
  const [wave, setWave] = useState("saw");
  const presetRef = useRef<HTMLSelectElement>(null);
  window.strataSelectBinding = { wave: () => wave, setWave, changes: () => [...changes], refs: { get preset() { return presetRef.current!; } } };
  return (
    <main>
      <div data-contract="select.md#selector" hidden><Select form="selector" id="wave-example" name="wave" aria-label="Wave" defaultValue="saw">{waves}</Select></div>
      <div data-contract="select.md#display" hidden><Select form="display" id="preset-example" name="preset" aria-label="Preset" defaultValue="warm-pad">{presets}</Select></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Select forms" style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
        <form id="owner-form" />
        <Field label="Wave" controlId="wave"><Select form="selector" value={wave} onChange={event => { changes.push(event.target.value); setWave(event.target.value); }}>{waves}</Select></Field>
        <Field label="Preset" controlId="preset"><Select ref={presetRef} form="display" name="preset" defaultValue="glass-bell" className="extra" style={{ marginRight: "4px" }} data-testid="preset">{presets}</Select></Field>
        <Field label="Channel" controlId="many"><Select form="selector" defaultValue="ch3">{channels}</Select></Field>
        <Field label="Sound" controlId="grouped" help="Pick a sound."><Select form="selector" defaultValue="b1"><optgroup label="Drums"><option value="a1">Kick</option><option value="a2">Snare</option></optgroup><optgroup label="Synth"><option value="b1">Bass</option></optgroup></Select></Field>
        <Field label="Custom" controlId="custom"><Select form="selector" defaultValue="b"><Custom value="a">One</Custom><Custom value="b">Two</Custom></Select></Field>
        <Field label="Locked" controlId="locked" disabled><Select form="selector" defaultValue="saw">{waves}</Select></Field>
        <Field label="Small" controlId="small"><Select form="selector" size="small" defaultValue="saw">{waves}</Select></Field>
        <Field label="List" controlId="list"><Select form="selector" multiple>{waves}</Select></Field>
        <Field label="Owned" controlId="owned"><Select form="owner-form" name="owned">{waves}</Select></Field>
        <Field label="Flat" controlId="flat"><Select form="flush">{waves}</Select></Field>
        <Field label="Plain" controlId="plain"><Select>{waves}</Select></Field>
      </section>
      <p id="wave-read">Wave {wave}</p>
    </main>
  );
}

declare global {
  interface Window { strataSelectBinding: { wave(): string; setWave(value: string): void; changes(): string[]; refs: { preset: HTMLSelectElement } } }
}
createRoot(document.getElementById("root")!).render(mode ? <Probe /> : <App />);
