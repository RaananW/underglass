/**
 * Strata Fader React check page (`ui-fader-react.html`): `Fader` from `@underglass/ui/react` in plain React, with no
 * Underglass. `[data-contract="fader.md"]` renders the anatomy page's markup example; the panel below holds a
 * controlled fader, an uncontrolled one with a ref, `className`, `style` and an attribute, a horizontal one with a
 * `format` and labelled marks, and a detented one in a Field. `window.strataFaderBinding` exposes the state for
 * `tests/browser/ui-fader-bindings.test.mjs`; `ui-fader-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Fader, Field } from "@underglass/ui/react";

const changes: number[] = [];

function App() {
  const [volume, setVolume] = useState(40);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.strataFaderBinding = { volume: () => volume, setVolume, changes: () => [...changes], refs: { root: root.current!, input: input.current! } };
  });
  return (
    <main>
      <div data-contract="fader.md" hidden><Fader label="Level" id="level" name="level" min={-60} max={6} defaultValue={0} unit=" dB" marks={[6, 0, -20, -40, -60]} /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Faders" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 20 }}>
        <Fader label="Volume" id="volume" min={0} max={100} value={volume} onValueChange={value => { changes.push(value); setVolume(value); }} unit="%" />
        <Fader ref={root} inputRef={input} label="Send" id="send" min={0} max={10} defaultValue={6} resetValue={0} className="extra" style={{ marginRight: 4 }} data-testid="send" />
        <Fader label="Pan" id="pan" orientation="horizontal" min={-50} max={50} defaultValue={10} marks={[{ value: -50, label: "L" }, { value: 0, label: "C" }, { value: 50, label: "R" }]}
          format={value => (value === 0 ? "Centre" : value < 0 ? `${-value} left` : `${value} right`)} />
        <Field help="Slide to set the trim.">
          <Fader label="Trim" min={-12} max={12} detents={5} defaultValue={0} size="small" />
        </Field>
      </section>
      <p id="volume-read">Volume {volume}%</p>
    </main>
  );
}

declare global {
  interface Window { strataFaderBinding: { volume(): number; setVolume(value: number): void; changes(): number[]; refs: { root: HTMLElement; input: HTMLInputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
