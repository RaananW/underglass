/**
 * Strata RotarySelector React check page (`ui-rotary-selector-react.html`): `RotarySelector` from `@underglass/ui/react` in
 * plain React, with no Underglass. `[data-contract="rotary-selector.md"]` renders the anatomy page's markup example; the panel
 * below holds a controlled selector, an uncontrolled one with a ref, `className`, `style` and an attribute, one in a Field, and a
 * disabled one. `window.strataRotaryBinding` exposes the state for `tests/browser/ui-rotary-selector-bindings.test.mjs`;
 * `ui-rotary-selector-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Field, RotarySelector } from "@underglass/ui/react";

const changes: string[] = [];
const modes = [{ value: "off", label: "Off" }, { value: "low", label: "Low" }, { value: "mid", label: "Mid" }, { value: "high", label: "High" }];
const tones = [{ value: "warm", label: "Warm" }, { value: "flat", label: "Flat" }, { value: "bright", label: "Bright" }];

function App() {
  const [mode, setMode] = useState("low");
  const root = useRef<HTMLDivElement>(null), select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    window.strataRotaryBinding = { mode: () => mode, setMode, changes: () => [...changes], refs: { root: root.current!, select: select.current! } };
  });
  return (
    <main>
      <div data-contract="rotary-selector.md" hidden>
        <RotarySelector label="Filter" id="filter" name="filter" options={[{ value: "lp", label: "LP" }, { value: "hp", label: "HP" }, { value: "bp", label: "BP", disabled: true }]} defaultValue="hp" />
      </div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Selectors" style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <RotarySelector label="Mode" id="mode" name="mode" options={modes} value={mode} onValueChange={value => { changes.push(value); setMode(value); }} />
        <RotarySelector ref={root} selectRef={select} label="Tone" id="tone" options={tones} defaultValue="flat" className="extra" style={{ marginRight: 4 }} data-testid="tone" />
        <Field help="Pick the input.">
          <RotarySelector label="Input" options={[{ value: "mic", label: "Mic" }, { value: "line", label: "Line" }]} size="small" />
        </Field>
        <RotarySelector label="Locked" id="locked" options={tones} defaultValue="bright" disabled />
      </section>
      <p id="mode-read">Mode {mode}</p>
    </main>
  );
}

declare global {
  interface Window { strataRotaryBinding: { mode(): string; setMode(value: string): void; changes(): string[]; refs: { root: HTMLElement; select: HTMLSelectElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
