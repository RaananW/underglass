/**
 * Mounts applications whose first render throws into the frame of `mount-error.html`, for
 * `tests/browser/mount-error.test.mjs` (`window.mountErrorProbe`), and reports what each mount left behind.
 *
 * Before any mount the page counts what a mount could leave: observers that observe and were not disconnected, and
 * listeners on the window, the document, media queries and the three hosts. The root containers the runtime creates are
 * recorded, so the page can tell whether React still holds a root in one. React's own one-time document listener is
 * added by a throwaway root first, so it is not counted against a mount.
 *
 * `attempt(kind, strict)` mounts into the same hosts every time:
 *
 * - `throws`: the application's first render throws;
 * - `caught`: an error boundary inside the application catches that throw, and the rest renders;
 * - `injected`: as `throws`, with `createRoot` passed in (React's own behaviour, not the adapter's);
 * - `healthy`: nothing throws. Its `Break` button makes a later render throw.
 */
import { Component, useState, version, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createCanvasHosts, mountCanvasApp, Surface, type CanvasController } from "@underglass/react";

declare global { interface Window { mountErrorProbe: unknown } }
type Kind = "throws" | "caught" | "injected" | "healthy";

// React adds one `selectionchange` listener to the document with its first root and never removes it.
createRoot(document.createElement("div")).unmount();

const frame = document.querySelector<HTMLElement>("#frame")!;
const hosts = createCanvasHosts(frame);
// Root containers, recorded as the runtime appends them. Created before the observer counting below starts.
const containers: Element[] = [];
const added = new MutationObserver(records => record(records));
added.observe(frame, { childList: true, subtree: true });
function record(records: MutationRecord[]) {
  for (const entry of records) for (const node of entry.addedNodes) if (node instanceof HTMLDivElement && entry.target === hosts.ordinaryHost) containers.push(node);
}

// Observers that observe something and were not disconnected since.
const observing = new Set<object>();
for (const Observer of [MutationObserver, ResizeObserver, IntersectionObserver] as { prototype: { observe(...args: unknown[]): void; disconnect(): void } }[]) {
  const { observe, disconnect } = Observer.prototype;
  Observer.prototype.observe = function (this: object, ...args: unknown[]) { observing.add(this); return observe.apply(this, args); };
  Observer.prototype.disconnect = function (this: object) { observing.delete(this); return disconnect.call(this); };
}
// Listeners on the targets a runtime or a React root outside its container could hold on to.
const listening: { target: EventTarget; type: string; listener: unknown; capture: boolean }[] = [];
const watched = (target: EventTarget) => target === window || target === document || target instanceof MediaQueryList
  || target === hosts.outputCanvas || target === hosts.ordinaryHost || target === hosts.overlayHost;
const capture = (options: unknown) => typeof options === "boolean" ? options : !!(options as { capture?: boolean } | undefined)?.capture;
const find = (target: EventTarget, type: string, listener: unknown, options: unknown) => listening.findIndex(entry =>
  entry.target === target && entry.type === type && entry.listener === listener && entry.capture === capture(options));
const { addEventListener, removeEventListener } = EventTarget.prototype;
EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
  if (listener && watched(this) && find(this, type, listener, options) < 0) listening.push({ target: this, type, listener, capture: capture(options) });
  return addEventListener.call(this, type, listener, options);
};
EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
  const index = find(this, type, listener, options);
  if (index >= 0) listening.splice(index, 1);
  return removeEventListener.call(this, type, listener, options);
};
const described = (target: EventTarget) => target === window ? "window" : target === document ? "document"
  : target instanceof MediaQueryList ? `media ${target.media}` : `host ${(target as Element).getAttribute("data-underglass-host") ?? (target as Element).tagName}`;

function Throws(): never { throw new Error("The application failed in its first render"); }
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p id="fallback">The boundary caught it</p> : this.props.children; }
}
function Breakable() {
  return <Surface id="primary" layout={{ x: 40, y: 40, width: 260, height: 200, padding: 16, direction: "column", gap: 8 }}
    appearance={{ background: "rgb(240, 30, 60)", color: "white" }}>
    <Counter />
  </Surface>;
}
function Counter() {
  const [count, setCount] = useState(0);
  const [broken, setBroken] = useState(false);
  if (broken) throw new Error("The application failed after its mount");
  return <>
    <button id="count" type="button" onClick={() => setCount(value => value + 1)}>Count {count}</button>
    <button id="break" type="button" onClick={() => setBroken(true)}>Break</button>
  </>;
}
const applications: Record<Kind, () => ReactNode> = {
  throws: () => <><Breakable /><Throws /></>,
  injected: () => <><Breakable /><Throws /></>,
  caught: () => <><Breakable /><Boundary><Throws /></Boundary></>,
  healthy: () => <Breakable />,
};

let controller: CanvasController | undefined;
let statuses = 0;
const snapshot = () => ({
  hosts: [hosts.outputCanvas, hosts.ordinaryHost, hosts.overlayHost].map(host => host.outerHTML),
  frameChildren: frame.childNodes.length,
  observers: observing.size,
  listeners: listening.map(entry => `${described(entry.target)} ${entry.type}`).sort(),
});
/** Mounts `kind` into the hosts and returns what the mount threw and what it left, against what was there before. */
function attempt(kind: Kind, strict = false) {
  if (controller) throw new Error("Dispose the mounted application first");
  record(added.takeRecords());
  const from = containers.length;
  const before = snapshot();
  statuses = 0;
  let mountError: string | null = null;
  try {
    controller = mountCanvasApp({
      ...hosts, strict, ...(kind === "injected" ? { createRoot } : {}),
      onStatusChange(status) { statuses++; document.querySelector("#status")!.textContent = `${status.mode}: ${status.reason}`; },
    }, applications[kind]());
  } catch (error) { mountError = String(error); }
  record(added.takeRecords());
  const after = snapshot();
  return {
    reactVersion: version, mountError, mounted: !!controller, statuses, before, after,
    // Each root container this mount created: whether it is still in the document and whether React still holds a root in it.
    containers: containers.slice(from).map(container => ({ connected: container.isConnected,
      reactRoot: Object.keys(container).some(key => key.startsWith("__reactContainer$") && (container as unknown as Record<string, unknown>)[key] != null) })),
    layers: controller?.state().layers.map(layer => layer.id) ?? [],
    fallback: document.querySelector("#fallback")?.textContent ?? null,
  };
}
const frames = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
async function enable() {
  const state = await controller!.enable();
  await controller!.settle();
  await frames();
  return { mode: state.mode, reason: state.reason, canvas: document.querySelector("#count")?.closest("canvas") === hosts.outputCanvas };
}
async function dispose() {
  await controller?.dispose();
  controller = undefined;
  await frames();
  record(added.takeRecords());
  return snapshot();
}
window.mountErrorProbe = { attempt, enable, dispose, snapshot,
  state: () => controller!.state(),
  box: (id: string) => { const rect = document.getElementById(id)!.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; } };
