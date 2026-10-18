/**
 * Strata Switch forms React check page (`ui-switch-forms-react.html`): `Switch` from `@underglass/ui/react` with `form`,
 * in plain React, with no Underglass. `[data-contract="switch.md#2"]` renders the anatomy page's Forms markup example;
 * the panel below holds a controlled slide, an uncontrolled bat with a ref, `className`, `style` and an attribute, a
 * reversed wall in a Field, a disabled rocker, and a Strata switch whose `form` names its form owner (the native
 * attribute). `window.strataSwitchBinding` exposes the state for `tests/browser/ui-switch-forms-bindings.test.mjs`;
 * `ui-switch-forms-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Field, Switch } from "@underglass/ui/react";

const changes: boolean[] = [];

function App() {
  const [bypass, setBypass] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.strataSwitchBinding = { bypass: () => bypass, setBypass, changes: () => [...changes], refs: { input: input.current! } };
  });
  return (
    <main>
      <div data-contract="switch.md#2" hidden><Switch form="rocker" name="power">Power</Switch></div>
      <form id="settings" aria-label="Settings" />
      <section className="ug-panel" data-strata-face="raised" aria-label="Switches" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
        <Switch form="slide" id="bypass" checked={bypass} onChange={event => { changes.push(event.target.checked); setBypass(event.target.checked); }}>Bypass</Switch>
        <Switch form="bat" id="arm" ref={input} defaultChecked className="extra" style={{ marginRight: 4 }} data-testid="arm">Arm</Switch>
        <Field help="Lights the hall."><Switch form="wall" id="hall" reverse>Hall</Switch></Field>
        <Switch form="rocker" id="heater" disabled>Heater</Switch>
        <Switch form="settings" id="wifi" name="wifi">Wi-Fi</Switch>
      </section>
      <p id="bypass-read">Bypass {bypass ? "engaged" : "clear"}</p>
    </main>
  );
}

declare global {
  interface Window { strataSwitchBinding: { bypass(): boolean; setBypass(value: boolean): void; changes(): boolean[]; refs: { input: HTMLInputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
