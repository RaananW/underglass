/**
 * Entry for `policy-frames.html`: the fixture of `tests/browser/policy-frames.test.mjs`, which counts the runtime's
 * policy passes and owned-animation source checks per frame (`state().metrics.policyPasses`, `ownershipChecks`).
 * `?owned=N` (0..3, default 3) red layers `owned-0..` on the top row carry a typed motion each (x 0 -> 60 px, 1000 ms,
 * alternating), owned before admission and paused until a test plays it; four blue layers `free-0..3` on the bottom row
 * are free for `transition`/`transitionGroup` (`?clip` makes them clip their overflow). Every layer holds a native button that counts its clicks. Layer `i` of a
 * row starts at x = 20 + 200 i (y 20 or 220) and is 110 x 110. `window.policyProbe` drives the page.
 */
import { useState } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, Surface, type MotionHandle } from "@underglass/react";

const params = new URLSearchParams(location.search);
const owned = Number(params.get("owned") ?? 3);
if (![0, 1, 2, 3].includes(owned)) throw new Error("Invalid owned layer count");
// `?clip`: the free layers clip their own overflow, so a tilt is a policy violation (a tilted clip has no exact hits).
const clip = params.has("clip");

// One layer: a solid square with a click counter in its top-left corner.
function Layer({ id, x, y, background }: { id: string; x: number; y: number; background: string }) {
  const [clicks, setClicks] = useState(0);
  return <Surface id={id} layout={{ x, y, width: 110, height: 110, padding: 8, ...(clip && id.startsWith("free-") ? { overflow: "hidden" as const } : {}) }}
    appearance={{ background, color: "black", fontSize: 12 }}>
    <button id={`${id}-button`} onClick={() => setClicks(value => value + 1)}>{id} {clicks}</button>
  </Surface>;
}
function App() {
  return <>
    {Array.from({ length: owned }, (_, index) => <Layer key={`owned-${index}`} id={`owned-${index}`} x={20 + index * 200} y={20} background="rgb(240,30,60)" />)}
    {Array.from({ length: 4 }, (_, index) => <Layer key={`free-${index}`} id={`free-${index}`} x={20 + index * 200} y={220} background="rgb(30,100,220)" />)}
  </>;
}
const controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.getElementById("ordinary")!, createRoot, flushSync,
  budgets: { layers: 8, pixels: 2_000_000 },
  onStatus: message => { document.getElementById("status")!.textContent = message.startsWith("{") ? JSON.parse(message).mode : message; },
}, <App />);
const motions: MotionHandle[] = [];
for (let index = 0; index < owned; index++) {
  const motion = controller.createMotion(`owned-${index}`, {
    keyframes: [{ offset: 0, x: 0 }, { offset: 1, x: 60 }],
    timing: { duration: 1000, iterations: 20, direction: "alternate", easing: "linear" },
  });
  motion.own();
  motions.push(motion);
}
const admitted = await controller.enable();
if (admitted.mode !== "gpu") throw new Error(`Admission failed: ${admitted.reason}`);
await controller.settle();
window.policyProbe = { controller, motions, state: () => controller.state(), settle: () => controller.settle(), dispose: () => controller.dispose() };
declare global { interface Window { policyProbe: {
  controller: typeof controller; motions: MotionHandle[];
  state(): ReturnType<typeof controller.state>; settle(): Promise<void>; dispose(): ReturnType<typeof controller.dispose>;
} } }
