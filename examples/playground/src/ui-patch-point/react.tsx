/**
 * Strata PatchPoint React check page (`ui-patch-point-react.html`): `PatchPoint` and `PatchBay` from `@underglass/ui/react` in plain
 * React, with no Underglass. `[data-contract]` renders the anatomy page's markup examples (`patch-point.md` two, `patch-bay` one); the
 * panel below holds a controlled jack with an LED, an uncontrolled one with a ref, `className`, `style` and an attribute, a button jack
 * whose `connected` state the page keeps, one in a Field, and a bay. `window.strataPatchBinding` exposes the state for
 * `tests/browser/ui-patch-point-bindings.test.mjs`; `ui-patch-point-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Field, PatchBay, PatchPoint } from "@underglass/ui/react";

const changes: boolean[] = [];

function App() {
  const [link, setLink] = useState(false);
  const [pressed, setPressed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.strataPatchBinding = { link: () => link, setLink, pressed: () => pressed, changes: () => [...changes], refs: { input: input.current! } };
  });
  return (
    <main>
      <div data-contract="patch-point:0" hidden><PatchPoint id="out1" name="out1" led>Out 1</PatchPoint></div>
      <div data-contract="patch-point:1" hidden><PatchPoint button id="ret1" connected led="warning">Ret 1</PatchPoint></div>
      <div data-contract="patch-bay:0" hidden>
        <PatchBay legend="Outputs" columns={2}>
          <PatchPoint id="bay1" name="bay1">Bay 1</PatchPoint>
          <PatchPoint id="bay2" name="bay2" size="small">Bay 2</PatchPoint>
        </PatchBay>
      </div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Patch points" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 20 }}>
        <PatchPoint id="link" name="link" led checked={link} onChange={event => { changes.push(event.target.checked); setLink(event.target.checked); }}>Link</PatchPoint>
        <PatchPoint ref={input} id="extra" className="extra" style={{ marginRight: 4 }} data-testid="extra" size="large" led="danger" defaultChecked>Extra</PatchPoint>
        <PatchPoint button id="hold" connected={pressed} onClick={() => setPressed(value => !value)} data-testid="hold">Hold</PatchPoint>
        <Field help="Plug it in to route the signal.">
          <PatchPoint id="route">Route</PatchPoint>
        </Field>
        <PatchBay legend="Sends" id="sends" className="bay" style={{ minWidth: 200 }} data-testid="sends" columns={3}>
          <PatchPoint id="send1">Send 1</PatchPoint>
          <PatchPoint id="send2" defaultChecked led>Send 2</PatchPoint>
          <PatchPoint id="send3" disabled>Send 3</PatchPoint>
        </PatchBay>
      </section>
      <p id="link-read">Link {link ? "patched" : "free"}</p>
    </main>
  );
}

declare global {
  interface Window { strataPatchBinding: { link(): boolean; setLink(value: boolean): void; pressed(): boolean; changes(): boolean[]; refs: { input: HTMLInputElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
