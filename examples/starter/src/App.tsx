import { useState } from "react";
import { Surface, useGPUHost } from "@underglass/react";

export function App() {
  const gpu = useGPUHost(); // the controller: motion by layer id (the effect is set in main.tsx)
  const [text, setText] = useState("Hello, GPU");
  const [count, setCount] = useState(0);

  // GPU motion: this only updates a matrix. React does not re-render and nothing is repainted.
  const wiggle = () => gpu.transition("card", {
    keyframes: [{ offset: 0 }, { offset: 0.5, rotation: -4, scaleX: 1.04, scaleY: 1.04 }, { offset: 1 }],
    timing: { duration: 450, easing: "ease-out" },
  });

  return (
    <>
      {/* Decorative: inert, aria-hidden, no controls. Only such layers may carry effects. */}
      <Surface id="art" decorative layout={{ x: 0, y: 0, width: 720, height: 420, overflow: "hidden" }}>
        <div className="art"><i /><i /><i /></div>
      </Surface>

      {/* An interactive layer. These are ordinary React elements: typing, focus and clicks reach them natively. */}
      <Surface id="card" origin="center" className="card"
        layout={{ x: 160, y: 60, width: 400, height: 300, padding: 28, direction: "column", gap: 14 }}
        appearance={{ background: "rgba(255, 255, 255, 0.92)", color: "#1d1b26", radius: 24 }}>
        <label htmlFor="message">Type something</label>
        <input id="message" value={text} onChange={event => setText(event.target.value)} />
        <output className="echo">{text || "..."}</output>
        <button onClick={() => { setCount(count + 1); wiggle(); }}>Clicked {count} times</button>
      </Surface>
    </>
  );
}
