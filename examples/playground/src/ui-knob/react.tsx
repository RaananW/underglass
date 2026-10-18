/**
 * Strata Knob React check page (`ui-knob-react.html`): `Knob` from `@underglass/ui/react` in plain React, with no
 * Underglass. `[data-contract="knob.md"]` renders the anatomy page's markup example; the panel below holds a controlled
 * knob, an uncontrolled one with a ref, `className`, `style` and an attribute, one with a `format`, and one in a Field.
 * `window.strataKnobBinding` exposes the state for `tests/browser/ui-knob-bindings.test.mjs`; `ui-knob-vue.html`
 * mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Field, Knob } from "@underglass/ui/react";

const changes: number[] = [];

function App() {
  const [level, setLevel] = useState(40);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.strataKnobBinding = { level: () => level, setLevel, changes: () => [...changes], refs: { root: root.current!, input: input.current! } };
  });
  return (
    <main>
      <div data-contract="knob.md" hidden><Knob label="Gain" id="gain" name="gain" min={-12} max={12} detents={5} defaultValue={0} unit=" dB" /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Knobs" style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <Knob label="Level" id="level" min={0} max={100} value={level} onValueChange={value => { changes.push(value); setLevel(value); }} unit="%" />
        <Knob ref={root} inputRef={input} label="Pan" id="pan" min={-50} max={50} defaultValue={10} resetValue={0} className="extra" style={{ marginRight: 4 }} data-testid="pan" />
        <Knob label="Mix" id="mix" min={0} max={10} step={0.5} defaultValue={7} marks={[0, { value: 5, label: "Half" }, 10]} format={value => `Mix ${value} of 10`} />
        <Field help="Turn to set the drive.">
          <Knob label="Drive" min={1} max={11} detents={11} defaultValue={3} size="small" />
        </Field>
      </section>
      <p id="level-read">Level {level}%</p>
    </main>
  );
}

declare global {
  interface Window { strataKnobBinding: { level(): number; setLevel(value: number): void; changes(): number[]; refs: { root: HTMLElement; input: HTMLInputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
