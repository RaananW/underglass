/**
 * Strata Display React check page (`ui-display-react.html`): the TextField's `display` form and `Display` from `@underglass/ui/react`, in
 * plain React, with no Underglass. `[data-contract]` renders the anatomy page's markup examples (`display.md` three); the panel below holds
 * a Field with a controlled display (typing writes the state), an unlit read-only display with a ref, `className`, `style` and an attribute,
 * a `form` that is the native form owner's id, a readout of the state in a `Display` with `live="off"`, and a `Display` with a size. `window.strataDisplayBinding`
 * exposes the state for `tests/browser/ui-display-bindings.test.mjs`; `ui-display-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Display, Field, TextField } from "@underglass/ui/react";

function App() {
  const [text, setText] = useState("Hello");
  const [rate, setRate] = useState(60);
  const input = useRef<HTMLInputElement>(null), serial = useRef<HTMLInputElement>(null), output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    window.strataDisplayBinding = { text: () => text, rate: () => rate, setRate, refs: { input: input.current!, serial: serial.current!, output: output.current! } };
  });
  return (
    <main>
      <div data-contract="display:0" hidden><TextField id="note" form="display" backlight="accent" type="text" placeholder="Type here" /></div>
      <div data-contract="display:1" hidden><Display id="rate-contract" label="Frame rate" backlight="success">60 fps</Display></div>
      <div data-contract="display:2" hidden><TextField id="serial-contract" aria-label="Serial" form="display" backlight="off" lit={false} readOnly /></div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Displays" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 12 }}>
        <Field label="Name" help="Shown on the glass">
          <TextField ref={input} form="display" value={text} onChange={event => setText(event.target.value)} className="extra" style={{ marginRight: 4 }} data-testid="name" size="small" />
        </Field>
        <TextField id="serial" ref={serial} aria-label="Serial" form="display" readOnly lit={false} defaultValue="UG-2026-0042" />
        <TextField id="owner" aria-label="Owner" form="login-form" defaultValue="Plain" />
        <Display id="rate" ref={output} label="Frame rate" live="off" backlight="info" className="extra" style={{ marginRight: 4 }} data-testid="rate">{rate} fps</Display>
        <Display id="echo" label="Echo" size="large">{text}</Display>
      </section>
      <button id="faster" type="button" onClick={() => setRate(144)}>Faster</button>
      <button id="slower" type="button" onClick={() => setRate(30)}>Slower</button>
    </main>
  );
}

declare global {
  interface Window { strataDisplayBinding: { text(): string; rate(): number; setRate(value: number): void; refs: { input: HTMLInputElement; serial: HTMLInputElement; output: HTMLOutputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
