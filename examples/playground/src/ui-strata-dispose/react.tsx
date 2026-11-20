/**
 * Strata delegate disposal, React check page (`ui-strata-dispose-react.html`): a page whose faders and knobs are mounted and unmounted from
 * outside, so `tests/browser/ui-strata-dispose.test.mjs` can watch the document-level listeners (the blocking `wheel` ones) come and go.
 * `window.strataDisposeProbe.set(faders, knobs)` renders that many of each; `?strict` renders them under `StrictMode`, which mounts
 * every effect twice in development. `ui-strata-dispose-vue.html` mirrors it.
 */
import "@underglass/ui/css";
import { StrictMode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Fader, Knob } from "@underglass/ui/react";

let setCounts: (counts: [number, number]) => void = () => undefined;

function App() {
  const [[faders, knobs], set] = useState<[number, number]>([0, 0]);
  useEffect(() => { setCounts = set; });
  return (
    <main>
      <section className="ug-panel" data-strata-face="raised" aria-label="Controls" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {Array.from({ length: faders }, (_, index) => <Fader key={`fader-${index}`} label={`Fader ${index}`} id={`fader-${index}`} min={0} max={100} defaultValue={50} />)}
        {Array.from({ length: knobs }, (_, index) => <Knob key={`knob-${index}`} label={`Knob ${index}`} id={`knob-${index}`} min={0} max={100} defaultValue={50} />)}
      </section>
    </main>
  );
}

const app = <App />;
createRoot(document.getElementById("root")!).render(new URLSearchParams(location.search).has("strict") ? <StrictMode>{app}</StrictMode> : app);

window.strataDisposeProbe = {
  set: async (faders, knobs) => {
    flushSync(() => setCounts([faders, knobs]));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  },
};

declare global {
  interface Window { strataDisposeProbe: { set(faders: number, knobs: number): Promise<void> } }
}
