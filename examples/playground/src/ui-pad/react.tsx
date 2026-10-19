/**
 * Strata Pad React check page (`ui-pad-react.html`): `Pad` and `PadGrid` from `@underglass/ui/react` in plain React, with no
 * Underglass. `[data-contract="pad.md"]`, `"pad.md#2"` and `"pad.md#3"` render the anatomy page's three examples; the panel below
 * holds a momentary pad, a controlled latching pad, an uncontrolled one, a disabled one of each kind, a pad with an icon and a velocity
 * callback, and a plain Button. `window.strataPadBinding` exposes the state for `tests/browser/ui-pad-bindings.test.mjs`;
 * `ui-pad-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, Pad, PadGrid } from "@underglass/ui/react";

const clicks: string[] = [];
const changes: boolean[] = [];
const velocities: [number, string][] = [];

function App() {
  const [loop, setLoop] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    window.strataPadBinding = { loop: () => loop, setLoop, clicks: () => [...clicks], changes: () => [...changes], velocities: () => [...velocities], refs: { kick: ref.current! } };
  });
  return (
    <main>
      <div data-contract="pad.md" hidden><Pad colour="danger" name="kick" value="1">Kick</Pad></div>
      <div data-contract="pad.md#2" hidden><Pad latching colour="accent">Loop</Pad></div>
      <div data-contract="pad.md#3" hidden>
        <PadGrid label="Drum pads" columns={2}><Pad>Snare</Pad><Pad colour="success">Hat</Pad></PadGrid>
      </div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Pads" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <PadGrid label="Rack" columns={3} id="rack" className="extra" size="small">
          <Pad ref={ref} id="kick" colour="danger" className="extra" style={{ marginRight: 4 }} data-testid="kick" onClick={() => clicks.push("kick")} onVelocity={(velocity, source) => velocities.push([velocity, source])}>Kick</Pad>
          <Pad id="snare" colour="accent" icon={<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" /></svg>} onClick={() => clicks.push("snare")}>Snare</Pad>
          <Pad id="loop" latching colour="warning" pressed={loop} onPressedChange={value => { changes.push(value); setLoop(value); }}>Loop</Pad>
          <Pad id="arm" latching colour="info" defaultPressed>Arm</Pad>
          <Pad id="locked" disabled>Locked</Pad>
          <Pad id="armed-locked" latching defaultPressed disabled>Armed</Pad>
        </PadGrid>
        <Button id="plain" onClick={() => clicks.push("plain")}>Plain</Button>
      </section>
      <p id="loop-read">Loop {loop ? "on" : "off"}</p>
    </main>
  );
}

declare global {
  interface Window { strataPadBinding: { loop(): boolean; setLoop(value: boolean): void; clicks(): string[]; changes(): boolean[]; velocities(): [number, string][]; refs: { kick: HTMLButtonElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
