/**
 * Strata Lamp and StatusLight React check page (`ui-lamp-react.html`): `Lamp` and `StatusLight` from
 * `@underglass/ui/react`, in plain React, with no Underglass. `[data-contract]` renders the anatomy pages' markup examples
 * (`lamp.md` two, `status-light.md` three); the panel below holds a controlled toggle lamp, an uncontrolled one with a
 * ref, `className`, `style` and an attribute, a reversed one in a Field, an invalid one, a disabled one, a momentary one
 * with a ref and a click count, a lamp whose `form` names its form owner (the native attribute), and StatusLights: an
 * image, a shown label with a blink, a live `<output>` whose label and state a button changes, and an assertive one.
 * `window.strataLampBinding` exposes the state for `tests/browser/ui-lamp-bindings.test.mjs`; `ui-lamp-vue.html` mirrors it
 * element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Field, Lamp, StatusLight } from "@underglass/ui/react";

const changes: boolean[] = [];

function App() {
  const [mains, setMains] = useState(false);
  const [link, setLink] = useState({ label: "Link up", lit: true });
  const [clicks, setClicks] = useState(0);
  const arm = useRef<HTMLInputElement>(null), talk = useRef<HTMLButtonElement>(null), light = useRef<HTMLElement>(null);
  useEffect(() => {
    window.strataLampBinding = { mains: () => mains, setMains, changes: () => [...changes], clicks: () => clicks, link: () => link,
      refs: { arm: arm.current!, talk: talk.current!, light: light.current! } };
  });
  return (
    <main>
      <div data-contract="lamp:0" hidden><Lamp colour="success" name="link">Link</Lamp></div>
      <div data-contract="lamp:1" hidden><Lamp momentary colour="danger" name="talk">Talk</Lamp></div>
      <div data-contract="status-light:0" hidden><StatusLight label="Link up" colour="success" /></div>
      <div data-contract="status-light:1" hidden><StatusLight label="Recording" colour="danger" blink="normal" showLabel /></div>
      <div data-contract="status-light:2" hidden><StatusLight label="Disconnected" colour="accent" lit={false} live /></div>
      <form id="settings" aria-label="Settings" />
      <section className="ug-panel" data-strata-face="raised" aria-label="Lamps" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <Lamp id="mains" checked={mains} onChange={event => { changes.push(event.target.checked); setMains(event.target.checked); }}>Mains</Lamp>
        <Lamp id="arm" ref={arm} defaultChecked colour="accent" size="small" className="extra" style={{ marginRight: 4 }} data-testid="arm">Armed</Lamp>
        <Field help="Lights the hall."><Lamp id="hall" reverse colour="warning">Hall</Lamp></Field>
        <Lamp id="fault" invalid colour="danger">Fault</Lamp>
        <Lamp id="locked" disabled defaultChecked>Locked</Lamp>
        <Lamp id="talk" ref={talk} momentary colour="success" onClick={() => setClicks(count => count + 1)} data-testid="talk">Talk</Lamp>
        <Lamp id="muted" momentary disabled>Muted</Lamp>
        <Lamp id="owned" form="settings" name="owned" colour="info">Owned</Lamp>
      </section>
      <section className="ug-panel" data-strata-face="raised" aria-label="Lights" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 12 }}>
        <StatusLight id="link" label={link.label} lit={link.lit} colour="success" />
        <StatusLight id="rec" label="Recording" colour="danger" blink="fast" showLabel ref={light} className="extra" style={{ marginRight: 4 }} data-testid="rec" />
        <StatusLight id="sync" label={link.label} live showLabel colour="accent" />
        <StatusLight id="alert" label="Disk full" live="assertive" colour="danger" size="large" />
      </section>
      <button id="change" type="button" onClick={() => setLink({ label: "Link down", lit: false })}>Drop the link</button>
      <p id="mains-read">Mains {mains ? "engaged" : "clear"}</p>
    </main>
  );
}

declare global {
  interface Window { strataLampBinding: { mains(): boolean; setMains(value: boolean): void; changes(): boolean[]; clicks(): number; link(): { label: string; lit: boolean };
    refs: { arm: HTMLInputElement; talk: HTMLButtonElement; light: HTMLElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
