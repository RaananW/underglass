/**
 * Strata JogWheel React check page (`ui-jog-wheel-react.html`): `JogWheel` from `@underglass/ui/react` in plain React, with no
 * Underglass. `[data-contract]` renders the anatomy page's two markup examples; the panel below holds a controlled wheel, an
 * uncontrolled one with a ref, `className`, `style` and an attribute, a detented one with a `format`, a vertical one that does not wrap,
 * and one in a Field. `window.strataJogBinding` exposes the state for `tests/browser/ui-jog-wheel-bindings.test.mjs`;
 * `ui-jog-wheel-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Field, JogWheel } from "@underglass/ui/react";

const changes: number[] = [];

function App() {
  const [frame, setFrame] = useState(12);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.strataJogBinding = { frame: () => frame, setFrame, changes: () => [...changes], refs: { root: root.current!, input: input.current! } };
  });
  return (
    <main>
      <div data-contract="jog-wheel:0" hidden><JogWheel label="Shuttle" id="shuttle" name="shuttle" min={0} max={99} defaultValue={12} unit=" fr" /></div>
      <div data-contract="jog-wheel:1" hidden><JogWheel label="Tune" id="tune" min={-12} max={12} turn={12} detents wrap={false} drag="vertical" defaultValue={0} unit=" st" size="small" /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Jog wheels" style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        <JogWheel label="Frame" id="frame" min={0} max={99} value={frame} onValueChange={value => { changes.push(value); setFrame(value); }} unit=" fr" />
        <JogWheel ref={root} inputRef={input} label="Offset" id="offset" min={-50} max={50} defaultValue={10} resetValue={0} className="extra" style={{ marginRight: 4 }} data-testid="offset" />
        <JogWheel label="Scrub" id="scrub" min={0} max={11} turn={12} detents defaultValue={3} format={value => `Mark ${value} of 11`} />
        <JogWheel label="Tuner" id="tuner" min={-12} max={12} wrap={false} drag="vertical" defaultValue={0} unit=" st" size="small" />
        <Field help="Turn to set the pitch.">
          <JogWheel label="Pitch" min={0} max={23} defaultValue={5} size="large" />
        </Field>
      </section>
      <p id="frame-read">Frame {frame} fr</p>
    </main>
  );
}

declare global {
  interface Window { strataJogBinding: { frame(): number; setFrame(value: number): void; changes(): number[]; refs: { root: HTMLElement; input: HTMLInputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
