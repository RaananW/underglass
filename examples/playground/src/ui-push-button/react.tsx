/**
 * Strata PushButton React check page (`ui-push-button-react.html`): `Button` and `ToggleButton` with their push-button forms from
 * `@underglass/ui/react` in plain React, with no Underglass. `[data-contract="button.md#2"]` and `[data-contract="toggle-button.md#2"]`
 * render the anatomy pages' push-button examples; the panel below holds a momentary Button, a controlled latching ToggleButton, an
 * uncontrolled one, a disabled one of each, a Button whose `form` names a form owner and a plain Button.
 * `window.strataPushBinding` exposes the state for `tests/browser/ui-push-button-bindings.test.mjs`; `ui-push-button-vue.html`
 * mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, ToggleButton } from "@underglass/ui/react";

const clicks: string[] = [];
const changes: boolean[] = [];

function App() {
  const [mute, setMute] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    window.strataPushBinding = { mute: () => mute, setMute, clicks: () => [...clicks], changes: () => [...changes], refs: { talk: ref.current! } };
  });
  return (
    <main>
      <div data-contract="button.md#2" hidden><Button form="momentary" colour="danger">Record</Button></div>
      <div data-contract="toggle-button.md#2" hidden><ToggleButton form="latching" colour="warning" defaultPressed>Mute</ToggleButton></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Push buttons" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <Button ref={ref} form="momentary" id="talk" className="extra" style={{ marginRight: 4 }} data-testid="talk" onClick={() => clicks.push("talk")}>Talk</Button>
        <Button form="momentary" variant="accent" id="go" onClick={() => clicks.push("go")}>Go</Button>
        <ToggleButton form="latching" id="mute" pressed={mute} onPressedChange={value => { changes.push(value); setMute(value); }}>Mute</ToggleButton>
        <ToggleButton form="latching" id="phantom" colour="info" defaultPressed>48 V</ToggleButton>
        <Button form="momentary" id="locked" disabled>Locked</Button>
        <ToggleButton form="latching" id="armed" defaultPressed disabled>Armed</ToggleButton>
        <Button form="settings" id="owned" onClick={() => clicks.push("owned")}>Owned</Button>
        <Button id="plain" onClick={() => clicks.push("plain")}>Plain</Button>
      </section>
      <p id="mute-read">Mute {mute ? "on" : "off"}</p>
    </main>
  );
}

declare global {
  interface Window { strataPushBinding: { mute(): boolean; setMute(value: boolean): void; clicks(): string[]; changes(): boolean[]; refs: { talk: HTMLButtonElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
