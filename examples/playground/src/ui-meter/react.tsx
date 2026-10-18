/**
 * Strata Meter and Gauge React check page (`ui-meter-react.html`): `Meter` and `Gauge` from `@underglass/ui/react`, in plain
 * React, with no Underglass. `[data-contract]` renders the anatomy pages' markup examples (`meter.md` two, `gauge.md` one);
 * the panel below holds a bar whose value a button changes (and a held peak), a needle meter with a `format`, a gauge with a
 * ref, `className`, `style` and an attribute, and a bar with no `unit`. `window.strataMeterBinding` exposes the state for
 * `tests/browser/ui-meter-bindings.test.mjs`; `ui-meter-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Gauge, Meter } from "@underglass/ui/react";

function App() {
  const [level, setLevel] = useState(30);
  const meter = useRef<HTMLMeterElement>(null), root = useRef<HTMLDivElement>(null), gauge = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.strataMeterBinding = { level: () => level, setLevel, refs: { meter: meter.current!, root: root.current!, gauge: gauge.current! } };
  });
  return (
    <main>
      <div data-contract="meter:0" hidden><Meter id="level" label="Level" value={62} low={70} high={90} optimum={0} segments={8} unit=" %" marks={3} /></div>
      <div data-contract="meter:1" hidden><Meter id="vu" label="VU" value={-6} min={-20} max={3} high={0} form="needle" unit=" dB" marks={[-20, -10, 0, 3]} /></div>
      <div data-contract="gauge:0" hidden><Gauge id="temperature" label="Temperature" value={72} max={120} low={20} high={100} unit=" °C" marks={5} /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Meters" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
        <Meter id="bar" ref={root} meterRef={meter} label="Bar" value={level} low={70} high={90} optimum={0} unit=" %" peak className="extra" style={{ marginRight: 4 }} data-testid="bar" size="small" />
        <Meter id="needle" label="Needle" form="needle" value={level} min={0} max={100} format={value => `${value} of 100`} />
        <Gauge id="dial" ref={gauge} label="Dial" value={level} max={100} high={80} unit=" bar" className="extra" style={{ marginRight: 4 }} data-testid="dial" />
        <Meter id="plain" label="Plain" value={5} max={10} segments={10} />
      </section>
      <button id="raise" type="button" onClick={() => setLevel(80)}>Raise</button>
      <button id="lower" type="button" onClick={() => setLevel(10)}>Lower</button>
    </main>
  );
}

declare global {
  interface Window { strataMeterBinding: { level(): number; setLevel(value: number): void; refs: { meter: HTMLMeterElement; root: HTMLElement; gauge: HTMLElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
