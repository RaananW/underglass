/**
 * Probe for a presentation-like page (`ui-probe-deck-stage.html`, `tests/browser/ui-probe-deck-stage.test.mjs`): one
 * document with two layouts. In ordinary DOM it is a **flow**: four sections, one viewport each, down a tall track. With
 * GPU presentation it is a **deck**: the stage sticks to the viewport (`position: sticky`) while the track scrolls past,
 * and the document's scroll position drives the change from one section to the next. Both layouts are the same height,
 * so a section's place in the flow is its rest position in the deck. It answers what the planned underglass.dev home
 * page depends on (`docs/showcase-deck-probe.md`):
 *
 * - GPU presentation stays on while the page scrolls through the pinned stage, into it and out of it.
 * - A scroll-scrubbed change only writes matrices (`setTransform`, with a tilt) and effect parameters (`handle.update` on an
 *   `interaction: "inert"` chain with custom WGSL), so nothing is recaptured while it runs.
 * - Sections can be enrolled only while they are on stage. `?park=unenroll` (the default) keeps every section in the
 *   document and enrolls the current one and the one arriving; `?park=unmount` renders only those two in the deck.
 * - Native hits land on the section on stage, and never on a parked one. Focus moving into a parked section brings it
 *   on stage.
 * - The layout changes from flow to deck before `enable()` and back after a return to ordinary DOM, at the same scroll
 *   position and with the same React state.
 *
 * `?snap` turns on scroll snapping per section, and `?hud` shows a fixed status box over the stage (both for a look in a
 * real window). The test drives `window.deckProbe`.
 */
import { useState, type CSSProperties } from "react";
import { createRoot, flushSync } from "../demo/react-root";
import { createCanvasHosts, defineEffect, mountCanvasApp, useSurfaceRef, type CanvasController, type EffectHandle, type Transform } from "@underglass/react";

const query = new URLSearchParams(location.search);
const parking: "unenroll" | "unmount" = query.get("park") === "unmount" ? "unmount" : "unenroll";
/** One flat, known colour per section's panel, for the pixel checks. */
export const colours = ["rgb(200, 40, 60)", "rgb(40, 160, 90)", "rgb(40, 90, 220)", "rgb(230, 150, 20)"];
const count = colours.length;
/** A section is at rest within this many CSS px of its place: a scroll offset is rounded to device pixels. */
const restPx = 2;

/** Materialises a layer out of value noise with a lit rim: `amount` 1 is fully gone, 0 is an exact identity. */
const materialise = defineEffect({
  name: "probe-deck-materialise",
  parameters: { amount: { min: 0, max: 1.1 }, grain: { min: 4, max: 64 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let cell = local / parameters.y;
    let i = floor(cell);
    let f = fract(cell);
    let u = f * f * (3.0 - 2.0 * f);
    let a = fract(sin(dot(i, vec2f(12.9898, 78.233))) * 43758.5453);
    let b = fract(sin(dot(i + vec2f(1.0, 0.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let c = fract(sin(dot(i + vec2f(0.0, 1.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let d = fract(sin(dot(i + vec2f(1.0, 1.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let noise = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    let amount = parameters.x;
    let live = smoothstep(0.0, 0.04, amount);
    let keep = smoothstep(amount - 0.012, amount + 0.012, noise);
    let rim = (1.0 - smoothstep(amount, amount + 0.1, noise)) * keep * live;
    return vec4f(min(color.rgb + vec3f(0.25, 0.85, 1.0) * rim, vec3f(1.0)), color.a * mix(1.0, keep, live));`,
});
const inert = { bounds: "layer", interaction: "inert", media: "identity", fallback: "static" } as const;
const decorative = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" } as const;

/**
 * What the stage shows. In the flow (`deck` false) every section is laid out down the track and none is enrolled. In the
 * deck, `from` is the section at rest or leaving and `to` the one arriving (none at rest).
 */
interface View { deck: boolean; from: number; to: number | null }
let view: View = { deck: false, from: 0, to: null };
let showView!: (value: View) => void;

/** One section: a copy layer (heading, text, a link) and a panel layer (a counting button and an input). */
function Section({ index, live, deck }: { index: number; live: boolean; deck: boolean }) {
  const [presses, setPresses] = useState(0);
  const copy = useSurfaceRef<HTMLDivElement>({ id: `copy-${index}`, origin: "center" });
  const panel = useSurfaceRef<HTMLDivElement>({ id: `panel-${index}`, origin: "center" });
  const parked = deck && !live ? " parked" : "";
  // The flow places each section one viewport further down the track; the deck stacks them all on the stage.
  const row = { "--row": deck ? 0 : index } as CSSProperties;
  return <>
    <div ref={live ? copy : undefined} id={`copy-${index}`} className={`copy${parked}`} style={row}>
      <h2>Section {index + 1}</h2>
      <p>Real text in a real element. <a id={`link-${index}`} href={`#section-${index + 1}`}>A link in section {index + 1}</a></p>
    </div>
    <div ref={live ? panel : undefined} id={`panel-${index}`} className={`panel${parked}`} style={{ ...row, background: colours[index] }}>
      <button id={`count-${index}`} type="button" onClick={() => setPresses(value => value + 1)}>Count {index + 1}: {presses}</button>
      <input id={`input-${index}`} aria-label={`Text in section ${index + 1}`} defaultValue="" />
    </div>
  </>;
}
function App() {
  const [shown, setShown] = useState<View>(view);
  showView = setShown;
  const backdrop = useSurfaceRef<HTMLDivElement>({ id: "backdrop", decorative: true });
  const live = (index: number) => shown.deck && (index === shown.from || index === shown.to);
  return <>
    <div ref={backdrop} id="backdrop" className="backdrop" aria-hidden="true" inert style={{ pointerEvents: "none" }}><i /><b>one stage</b></div>
    {colours.map((_, index) => shown.deck && parking === "unmount" && !live(index) ? null
      : <Section key={index} index={index} live={live(index)} deck={shown.deck} />)}
  </>;
}

const track = document.querySelector<HTMLElement>("#track")!, frame = document.querySelector<HTMLElement>("#frame")!;
const status = document.querySelector<HTMLElement>("#status")!;
track.style.height = `${count * 100}vh`;
for (let index = 0; index < count; index++) {
  const point = document.createElement("div");
  point.className = "snap-point"; point.style.top = `${index * 100}vh`;
  track.append(point);
}
if (query.has("snap")) document.documentElement.classList.add("snap");
const hud = query.has("hud") ? document.body.appendChild(Object.assign(document.createElement("pre"), { id: "hud" })) : undefined;

/** True while `lifecycle` runs an action, so a status change inside it is not taken for a lost GPU. */
let acting = false;
const { outputCanvas, ordinaryHost, overlayHost } = createCanvasHosts(frame);
const controller: CanvasController = mountCanvasApp({
  outputCanvas, ordinaryHost, overlayHost, createRoot, flushSync, budgets: { layers: 32, pixels: 6_000_000 },
  onStatusChange(value) {
    status.textContent = `${value.mode}: ${value.reason}`;
    // GPU presentation ended by itself: the page is the flow again.
    if (value.mode === "dom" && view.deck && !acting) queueMicrotask(() => { if (!acting && !gpu()) layout(false); });
  },
}, <App />);

/** Errors from the driver's controller calls (a refused transform, a refused effect): the test expects none. */
const errors: string[] = [];
/** Frames in which the arriving panel's effect chain could not be attached yet. */
let effectRetries = 0;
let arriving: EffectHandle | undefined, water: EffectHandle | undefined;
const gpu = () => controller.state().mode === "gpu";
const enrolled = (id: string) => controller.state().layers.some(layer => layer.id === id);
function transform(id: string, value: Transform) {
  if (!enrolled(id)) return;
  try { controller.setTransform(id, value); } catch (error) { errors.push(`setTransform ${id}: ${String(error)}`); }
}
/** The document offset of the track's top. */
const trackTop = () => track.getBoundingClientRect().top + scrollY;
/** Where the scroll position is in the track: the section at or before it, and the progress (0..1) toward the next. */
function place() {
  const px = Math.min((count - 1) * innerHeight, Math.max(0, scrollY - trackTop()));
  const from = Math.min(count - 1, Math.floor((px + restPx) / innerHeight));
  const past = px - from * innerHeight;
  const t = past <= restPx || from === count - 1 ? 0 : Math.min(1, past / innerHeight);
  return { progress: px / innerHeight, from, to: t > 0 ? from + 1 : null, t };
}
/** Ends the current pair's poses and effects, before the pair changes or the stage comes to rest. */
function release() {
  try { arriving?.cancel(); } catch { /* already ended */ }
  arriving = undefined;
  for (const index of [view.from, view.to]) if (index !== null) { transform(`copy-${index}`, {}); transform(`panel-${index}`, {}); }
}
/** Shows `next` (a no-op when nothing changed), ending the poses of the sections that leave the stage first. */
function show(next: View) {
  if (next.deck === view.deck && next.from === view.from && next.to === view.to) return;
  release();
  view = next;
  flushSync(() => showView(view));
}
/** Changes between the flow and the deck. The scroll position stays: both are the same height. */
function layout(deck: boolean) {
  document.documentElement.classList.toggle("deck", deck);
  const { from, to } = place();
  show({ deck, from, to: deck ? to : null });
  dirty = true;
}
/** Poses the pair for progress `t` (0..1) between `from` and `to`. Only matrices and effect parameters are written. */
function pose(t: number) {
  const { from, to } = view;
  if (to === null || !gpu()) return false;
  transform(`copy-${from}`, { x: -60 * t, opacity: 1 - t });
  transform(`panel-${from}`, { tiltX: 50 * t, y: -40 * t, scaleX: 1 - 0.2 * t, scaleY: 1 - 0.2 * t, opacity: 1 - t * t, perspective: 900 });
  transform(`copy-${to}`, { y: 80 * (1 - t), opacity: t });
  let pending = false;
  if (!arriving && enrolled(`panel-${to}`)) {
    try {
      const handle = controller.setEffects(`panel-${to}`, [
        { kind: "ripple", parameters: { amplitude: 0 }, time: { seconds: 0, playing: false }, ...inert },
        { kind: "custom", definition: materialise, parameters: { amount: 1, grain: 22 }, time: { seconds: 0 }, ...inert },
      ]);
      arriving = handle;
      void handle.finished.then(() => { if (arriving === handle) arriving = undefined; });
    } catch (error) {
      if (/idle DOM or admitted GPU|mount has not completed/.test(String(error))) effectRetries++;
      else errors.push(`setEffects panel-${to}: ${String(error)}`);
    }
  }
  if (arriving) {
    transform(`panel-${to}`, {});
    try { arriving.update([{ amplitude: 8 * (1 - t) }, { amount: 1 - t, grain: 22 }]); } catch { arriving = undefined; }
  } else {
    // Until the chain is attached the panel is held unseen, so it never shows whole before it materialises.
    transform(`panel-${to}`, { opacity: 0 });
    pending = true;
  }
  if (!water) {
    try {
      const handle = controller.setEffects("backdrop", [{ kind: "ripple", parameters: { amplitude: 0 }, time: { seconds: 0, playing: false }, ...decorative }]);
      water = handle;
      void handle.finished.then(() => { if (water === handle) water = undefined; });
    } catch { pending = true; }
  }
  try { water?.update([{ amplitude: Math.round(600 * Math.sin(Math.PI * t)) / 100 }]); } catch { water = undefined; }
  return pending;
}
/** Reads the scroll position, changes the pair when it crosses a section, and poses the pair. Returns true while work is pending. */
function update() {
  const { progress, from, to, t } = place();
  if (view.deck) show({ deck: true, from, to });
  if (!view.deck || to === null) { try { water?.update([{ amplitude: 0 }]); } catch { water = undefined; } }
  const pending = view.deck ? pose(t) : false;
  if (hud) {
    const state = controller.state();
    hud.textContent = `${state.mode} ${view.deck ? "deck" : "flow"}  p ${progress.toFixed(3)}  ${from}${to === null ? "" : ` -> ${to}`}\ncaptures ${state.metrics.captures}  frames ${state.metrics.gpuFrames}\nlayers ${state.layers.map(layer => layer.id).join(" ")}`;
  }
  return pending;
}
let dirty = true, busy = false;
addEventListener("scroll", () => { dirty = true; }, { passive: true });
addEventListener("resize", () => { dirty = true; });
function loop() {
  if (dirty || busy) { dirty = false; busy = update(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// Focus moving into a parked section (Tab, a screen reader, find-in-page) brings that section on stage.
document.addEventListener("focusin", event => {
  const index = Number((event.target as Element).closest?.(".copy, .panel")?.id.split("-")[1]);
  if (view.deck && Number.isInteger(index) && index !== view.from && index !== view.to) scrollTo(0, trackTop() + index * innerHeight);
});

const frames = async (n = 2) => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
/** Waits until the driver has nothing pending and the runtime has presented what it was given. */
async function idle() {
  await frames(2);
  for (let attempt = 0; attempt < 200 && (dirty || busy); attempt++) await frames(1);
  await controller.settle();
  await frames(2);
}
function snapshot() {
  const state = controller.state();
  return { progress: place().progress, deck: view.deck, from: view.from, to: view.to, mode: state.mode, reason: state.reason, captures: state.metrics.captures,
    perLayer: Object.fromEntries(Object.entries(state.metrics.perLayer).map(([id, layer]) => [id, layer.captures])),
    gpuFrames: state.metrics.gpuFrames, layers: state.layers.map(layer => layer.id), effects: state.decorativeEffects.map(effect => effect.id),
    errors: [...errors], effectRetries, parking, scrollY, dirty, busy };
}
/** `enable` lays the page out as the deck first and returns to the flow if admission refuses; `disable` ends in the flow. */
async function lifecycle(operation: "enable" | "disable") {
  acting = true;
  try {
    if (operation === "enable") layout(true);
    await controller[operation]();
    if (!gpu()) layout(false);
  } finally { acting = false; }
  dirty = true;
  await idle();
  return snapshot();
}
document.querySelector("#enable")!.addEventListener("click", () => void lifecycle("enable"));
document.querySelector("#disable")!.addEventListener("click", () => void lifecycle("disable"));

declare global { interface Window { deckProbe: unknown } }
window.deckProbe = {
  enable: () => lifecycle("enable"), disable: () => lifecycle("disable"), state: () => controller.state(), snapshot, idle, colours, count,
  /** Scrolls to progress `p` through the track (plus `offset` CSS px) and waits for the stage to settle there. */
  async go(p: number, offset = 0) {
    scrollTo(0, trackTop() + p * innerHeight + offset);
    dirty = true;
    await idle();
    return snapshot();
  },
  /** Scrolls the document to `y` (outside or inside the track) and waits for the stage to settle. */
  async scroll(y: number) { scrollTo(0, y); dirty = true; await idle(); return snapshot(); },
  /** The viewport box of an element, or null when it is not in the document. */
  box(id: string) { const box = document.getElementById(id)?.getBoundingClientRect(); return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null; },
};
