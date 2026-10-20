/**
 * Core's canvas mark through the React adapter (issue #184), for `tests/browser/core-canvas-content.test.mjs`. Two `Surface` layers hold
 * `<canvas>` elements that React renders, one with a `content` prop the test changes while GPU is on (`window.canvasReact.setContent`),
 * so the author-value path runs through React's own attribute writes, and shows or hides each layer (a layer released while its
 * element is unmounted by React).
 */
import { useEffect, useRef, useState } from "react";
import { createRoot, flushSync } from "../demo/react-root";
import { mountCanvasApp, Surface, type CanvasController } from "@underglass/react";

let controller!: CanvasController;
let setContentProp!: (value: string | undefined) => void;
let setFirst!: (value: boolean) => void;
let setSecond!: (value: boolean) => void;

function draw(canvas: HTMLCanvasElement | null, fill: string) {
  if (!canvas) return;
  const context = canvas.getContext("2d")!;
  context.fillStyle = fill; context.fillRect(0, 0, canvas.width, canvas.height);
}
function App() {
  const [content, setContent] = useState<string | undefined>("fallback");
  const [first, setFirstState] = useState(true);
  const [second, setSecondState] = useState(true);
  setContentProp = setContent; setFirst = setFirstState; setSecond = setSecondState;
  const main = useRef<HTMLCanvasElement>(null);
  useEffect(() => { draw(main.current, "rgb(200, 40, 40)"); }, []);
  return <>
    {first && <Surface id="first" layout={{ x: 20, y: 20, width: 200, height: 120, padding: 10 }} appearance={{ background: "rgb(233, 235, 239)" }}>
      <canvas id="main" ref={main} width={60} height={30} {...(content === undefined ? {} : { content })} style={{ display: "block", width: 60, height: 30 }} />
    </Surface>}
    {second && <Surface id="second" layout={{ x: 260, y: 20, width: 200, height: 120, padding: 10 }} appearance={{ background: "rgb(233, 235, 239)" }}>
      <canvas id="second-canvas" width={60} height={30} style={{ display: "block", width: 60, height: 30 }} />
      <button id="second-button" type="button">Second</button>
    </Surface>}
  </>;
}

controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!,
  overlayHost: document.querySelector<HTMLElement>("#overlay")!,
  createRoot, flushSync,
  onStatus(message) { document.querySelector<HTMLElement>("#status")!.textContent = message; },
}, <App />);

const attribute = (id: string) => document.getElementById(id)?.getAttribute("content") ?? null;
const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
declare global { interface Window { canvasReact: unknown } }
window.canvasReact = {
  enable: () => controller.enable(), disable: () => controller.disable(), state: () => controller.state(),
  /** Changes the React `content` prop of `#main` (undefined removes the attribute) and lets React and core settle. */
  async setContent(value: string | undefined) { flushSync(() => setContentProp(value)); await controller.settle(); await frames(); },
  async showFirst(value: boolean) { flushSync(() => setFirst(value)); await controller.settle(); await frames(); },
  async showSecond(value: boolean) { flushSync(() => setSecond(value)); await controller.settle(); await frames(); },
  attribute, frames,
  box: (id: string) => { const b = document.getElementById(id)!.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; },
};
