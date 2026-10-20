/**
 * Strata Keypad React check page (`ui-keypad-react.html`): `Keypad` and `KeypadKey` from `@underglass/ui/react` in plain React, with no
 * Underglass. `[data-contract="keypad.md"]` and `"keypad.md#2"` render the anatomy page's two examples; the panel below holds a
 * 3-column keypad with a second legend on some keys, a disabled key, a disabled keypad, a shifted one and a ref. `window.strataKeypadBinding`
 * exposes the state for `tests/browser/ui-keypad-bindings.test.mjs`; `ui-keypad-vue.html` mirrors it element for element.
 */
import "@underglass/ui/css";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Keypad, KeypadKey } from "@underglass/ui/react";

const clicks: string[] = [];

function App() {
  const ref = useRef<HTMLButtonElement>(null), group = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    window.strataKeypadBinding = { clicks: () => [...clicks], refs: { two: ref.current!, dial: group.current! } };
  });
  return (
    <main>
      <div data-contract="keypad.md" hidden>
        <Keypad label="Dial" columns={3}>
          <KeypadKey name="digit" value="1">1</KeypadKey>
          <KeypadKey name="digit" value="2" shift="ABC">2</KeypadKey>
          <KeypadKey name="digit" value="3" shift="DEF" disabled>3</KeypadKey>
        </Keypad>
      </div>
      <div data-contract="keypad.md#2" hidden>
        <Keypad aria-label="Hex entry" columns={2} shifted>
          <KeypadKey value="a" shift="10">A</KeypadKey>
          <KeypadKey value="b" shift="11">B</KeypadKey>
        </Keypad>
      </div>
      <section className="ug-panel" data-strata-face="raised" aria-label="Keypads" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
        <Keypad ref={group} id="dial" label="Dial" columns={3} className="extra" style={{ marginRight: 4 }} data-testid="dial">
          <KeypadKey ref={ref} id="two" shift="ABC" value="2" className="extra" data-testid="two" onClick={() => clicks.push("two")}>2</KeypadKey>
          <KeypadKey id="three" shift="DEF" value="3" onClick={() => clicks.push("three")}>3</KeypadKey>
          <KeypadKey id="four" value="4" disabled>4</KeypadKey>
          <KeypadKey id="five" value="5" aria-label="5, five" onClick={() => clicks.push("five")}>5</KeypadKey>
        </Keypad>
        <Keypad id="locked" label="Locked" columns={2} disabled size="small">
          <KeypadKey id="locked-a" value="a">A</KeypadKey>
          <KeypadKey id="locked-b" value="b">B</KeypadKey>
        </Keypad>
        <Keypad id="hex" aria-label="Hex" columns={2} shifted size="small">
          <KeypadKey id="hex-a" value="a" shift="10" onClick={() => clicks.push("hex-a")}>A</KeypadKey>
          <KeypadKey id="hex-b" value="b" shift="11" onClick={() => clicks.push("hex-b")}>B</KeypadKey>
          <KeypadKey id="hex-c" value="c" shift="12" onClick={() => clicks.push("hex-c")}>C</KeypadKey>
        </Keypad>
      </section>
    </main>
  );
}

declare global {
  interface Window { strataKeypadBinding: { clicks(): string[]; refs: { two: HTMLButtonElement; dial: HTMLFieldSetElement } } }
}
createRoot(document.getElementById("root")!).render(<App />);
