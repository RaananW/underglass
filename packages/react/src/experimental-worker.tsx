/**
 * Main-thread side of the experimental worker compositor (`@underglass/react/experimental-worker`;
 * see `docs/worker.md`). React, layout and native capture stay on the main thread: the controller
 * captures each enrolled `WorkerSurface` as an element snapshot, transfers the snapshots to an
 * application-owned module worker (`worker-thread.ts`) that uploads and composites them on an
 * `OffscreenCanvas`, and keeps native hit geometry fixed on the original elements. Messages are
 * defined in `worker-protocol.ts`. It is separate from the default `CanvasRuntime`.
 */
import { createContext, useContext, useLayoutEffect, useRef, StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { compileStyle, type Appearance, type Layout } from "@underglass/core";
import {
  LAYER_BLOCK_FLOATS, decorative as isDecorative, capabilities, enableDrawable, validateAppliedGeometry, waitForPaint, type DrawableCanvas,
  validateWorkerProgram, type WorkerProgram, type WorkerAnimation, type WorkerSnapshot,
  type WorkerFrame, type WorkerRequest, type WorkerResponse, type WorkerStats,
} from "@underglass/core/experimental-worker";
import { mountRoot } from "./first-render.js";

export type { WorkerProgram, WorkerAnimation, WorkerStats } from "@underglass/core/experimental-worker";
/** Options for `mountWorkerCanvasApp`. */
export interface WorkerMountOptions {
  /** Empty host for the original React root in ordinary DOM mode. */
  ordinaryHost: HTMLElement;
  /** Empty host in which the adapter creates its own canvas; it is not a pretransferred canvas. */
  canvasHost: HTMLElement;
  /** Surface width in CSS pixels (positive integer; at most 2,000,000 pixels with `height`). */
  width: number;
  /** Surface height in CSS pixels. */
  height: number;
  /** Prebuilt shader program from `workerCompositorProgram`; its capacity bounds the layer count. */
  program: WorkerProgram;
  /** Creates the application's module worker, which must call `startWorkerCompositor`. */
  createWorker(): Worker;
  /** Receives the controller state as a JSON string after enable, disable, dispose and failures. */
  onStatus(message: string): void;
  /** Wraps the tree in `StrictMode`. */
  strict?: boolean;
}
// One enrolled `WorkerSurface`: `slot` is its texture/uniform slot in the worker program,
// `fallback` the DOM-mode CSS animation for the opacity preset, `geometryKey` the last geometry
// applied to the canvas, and `controls` the last measured bounds of its interactive descendants.
interface Enrollment {
  element: HTMLElement;
  slot: number;
  id: string;
  animation: WorkerAnimation;
  decorative: boolean;
  layout: Required<Pick<Layout, "x" | "y" | "width" | "height">>;
  fallback?: Animation;
  geometryKey?: string;
  controls?: Map<Element, number[]>;
}
const Context = createContext<WorkerCanvasController | null>(null);
/** Props of `WorkerSurface`. */
export interface WorkerSurfaceProps {
  /** Unique layer ID. */
  id: string;
  /** Rectangle in CSS pixels, contained in the surface; a non-decorative surface cannot change it while enrolled. */
  layout: Pick<Layout, "x" | "y" | "width" | "height" | "padding">;
  appearance?: Appearance;
  /** Inert, aria-hidden, noninteractive decoration; the only kind that may animate. */
  decorative?: boolean;
  /** Decorative animation preset run by the worker; requires `decorative`. */
  animation?: WorkerAnimation;
  children?: ReactNode;
}
/**
 * A top-level layer of the worker compositor: renders one original `<section>` at a fixed position
 * and enrolls it with the controller from `mountWorkerCanvasApp`. Throws outside that mount or for
 * an invalid layout, or an animation on a non-decorative surface.
 */
export function WorkerSurface({ id, layout, appearance, decorative = false, animation = "none", children }: WorkerSurfaceProps) {
  const controller = useContext(Context);
  if (!controller) throw new Error("WorkerSurface requires mountWorkerCanvasApp");
  const element = useRef<HTMLElement>(null);
  const key = JSON.stringify(layout);
  controller.validateSurface(id, layout, decorative, animation);
  useLayoutEffect(() => { element.current!.inert = decorative; }, [decorative]);
  useLayoutEffect(() => controller.enroll(id, element.current!, layout, decorative, animation),
    [controller, id, key, decorative, animation]);
  return <section ref={element} id={id} {...{ drawable: "" }} aria-hidden={decorative || undefined}
    style={compileStyle(layout, appearance, true)}>{children}</section>;
}

/**
 * Owns the worker, the output canvas and the DOM/GPU mode of one worker-compositor mount, and is
 * the object returned by `mountWorkerCanvasApp`. Modes: `dom` (original DOM shown), `admitting`
 * (functional probe passed, first frames publishing), `gpu`, `restoring` (publication stopped, DOM being
 * restored) and `disposed`. `enable`, `disable` and `dispose` are serialized through one queue.
 */
export class WorkerCanvasController {
  private canvas: DrawableCanvas | undefined;
  private worker: Worker | undefined;
  private mode: "dom" | "admitting" | "gpu" | "restoring" | "disposed" = "dom";
  private reason = "Experimental worker backend; explicit enable required";
  private readonly layers = new Map<string, Enrollment>();
  private readonly fixedLayouts = new Map<string, Enrollment["layout"]>();
  private readonly pending = new Map<number, { type: WorkerRequest["type"]; resolve(response: WorkerResponse): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout> }>();
  // Request IDs; the worker echoes the ID, which `pending` uses to match replies.
  private nextID = 0;
  // At most one frame is in flight and one newer frame waits in `mailbox`; a newer capture replaces
  // an unsent one, so the queue never grows.
  private inflight: Promise<WorkerResponse> | undefined;
  private mailbox: WorkerFrame | undefined;
  private latest: WorkerStats | undefined;
  private lifecycle = Promise.resolve();
  // Bumped whenever publication stops or restarts, so an interrupted `enable` can detect it was superseded.
  private epoch = 0;
  private disposed = false;
  /** True once the worker acknowledged init; before that its queue was never used and it can be terminated at once. */
  private workerReady = false;
  private paintRequested = false;
  private captures = 0;
  private droppedSnapshots = 0;
  private transfers = 0;
  private paintNotifications = 0;
  private readonly paintElements: string[][] = [];
  private readonly removers: (() => void)[] = [];
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)");
  private readonly forced = matchMedia("(forced-colors: active)");
  // Fires on a devicePixelRatio change; the media query is re-created for the new ratio each time.
  private resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
  private readonly resolutionChanged = () => {
    this.resolution.removeEventListener("change", this.resolutionChanged);
    this.resolution = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.resolution.addEventListener("change", this.resolutionChanged);
    this.invalidate();
  };
  private readonly resize: ResizeObserver;
  private readonly mutation: MutationObserver;
  // Live-resource counters reported by `state()`.
  private readonly resources = { roots: 1, workers: 0, canvases: 0, listeners: 0, observers: 2, snapshots: 0, requests: 0 };
  private unmount: (() => void) | undefined;
  private paintListener: EventListener | undefined;

  // Created by `mountWorkerCanvasApp`; `container` is the adapter-owned persistent root container.
  // The observers and listeners below request a new capture through `invalidate`. `mount` creates the React root
  // once they are attached and returns its unmount callback; if it throws, they are released again.
  constructor(private readonly options: WorkerMountOptions, readonly container: HTMLDivElement, mount?: (controller: WorkerCanvasController) => () => void) {
    validateWorkerProgram(options.program);
    if (![options.width, options.height].every(value => Number.isInteger(value) && value > 0)
      || options.width * options.height > 2_000_000) throw new Error("Invalid worker surface extent");
    if (typeof options.createWorker !== "function" || typeof options.onStatus !== "function") throw new Error("Worker factory and status callback required");
    this.resize = new ResizeObserver(() => this.invalidate());
    this.mutation = new MutationObserver(() => this.invalidate());
    this.resize.observe(container);
    this.mutation.observe(container, { subtree: true, childList: true, characterData: true, attributes: true });
    for (const name of ["input", "focusin", "focusout", "scroll"]) this.listen(container, name, () => this.invalidate(), true);
    this.listen(document, "visibilitychange", () => {
      this.clock();
      if (!document.hidden) { this.paintRequested = false; this.invalidate(); }
    });
    this.listen(this.reduced, "change", () => { this.clock(); this.invalidate(); });
    this.listen(this.forced, "change", () => { this.clock(); this.invalidate(); });
    this.listen(window, "resize", () => this.invalidate());
    this.resolution.addEventListener("change", this.resolutionChanged);
    this.resources.listeners++;
    this.removers.push(() => { this.resolution.removeEventListener("change", this.resolutionChanged); this.resources.listeners--; });
    if (mount) {
      // Nothing has started a worker or a canvas yet, so the release is synchronous.
      try { this.unmount = mount(this); }
      catch (error) { this.release(); throw error; }
    }
  }
  /** Registers the callback that unmounts the React root. `mountWorkerCanvasApp` passes it to the constructor instead. */
  attachUnmount(unmount: () => void) { this.unmount = unmount; }
  // Marks the controller disposed and releases the layers, observers and listeners; the worker and canvas are already stopped.
  private release() {
    this.disposed = true; this.layers.clear(); this.fixedLayouts.clear();
    this.resize.disconnect(); this.mutation.disconnect(); this.resources.observers = 0;
    for (const remove of this.removers.splice(0)) remove();
    this.resources.roots = 0; this.mode = "disposed";
  }
  // Adds a listener and records its removal for `dispose`.
  private listen(target: EventTarget, name: string, listener: EventListener, capture = false) {
    target.addEventListener(name, listener, capture);
    this.resources.listeners++;
    this.removers.push(() => { target.removeEventListener(name, listener, capture); this.resources.listeners--; });
  }
  // Reports the current state to `onStatus`.
  private status() { this.options.onStatus(JSON.stringify(this.state())); }
  /** Snapshot of the mode, reason, counters, resource counts and last worker statistics. */
  state() {
    return { mode: this.mode, reason: this.reason, captures: this.captures, transfers: this.transfers,
      droppedSnapshots: this.droppedSnapshots, queuedBatches: Number(!!this.mailbox), inflightBatches: Number(!!this.inflight),
      resources: { ...this.resources }, worker: this.latest && structuredClone(this.latest), enrolledLayers: this.layers.size,
      paintNotifications: this.paintNotifications, paintElements: this.paintElements.map(elements => [...elements]) };
  }
  /**
   * Validates a surface during render and returns its rectangle. Throws for a non-decorative
   * animation, a rectangle outside the surface, or a change to the fixed geometry of a
   * non-decorative surface that is already enrolled.
   */
  validateSurface(id: string, layout: WorkerSurfaceProps["layout"], decorative: boolean, animation: WorkerAnimation) {
    if (!id || !["none", "opacity", "ripple"].includes(animation) || animation !== "none" && !decorative) {
      throw new Error("Worker animation is restricted to decorative surfaces; native control geometry is fixed");
    }
    const rect = { x: layout.x ?? 0, y: layout.y ?? 0, width: layout.width ?? 0, height: layout.height ?? 0 };
    if (!Object.values(rect).every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > this.options.width || rect.y + rect.height > this.options.height) throw new Error("Invalid contained worker layer extent");
    const fixed = this.fixedLayouts.get(id);
    if (fixed && (decorative || Object.keys(fixed).some(key => Reflect.get(fixed, key) !== Reflect.get(rect, key)))) {
      throw new Error(`Worker essential geometry must remain fixed: ${id}`);
    }
    return rect;
  }
  /**
   * Enrolls a surface element in the first free slot of the program and returns its release
   * function. Throws if the element is not a direct child of the root, the ID is a duplicate, a
   * decorative element is not inert/aria-hidden/noninteractive, or the program capacity is exceeded.
   * While in DOM mode the opacity preset runs as a CSS animation instead.
   */
  enroll(id: string, element: HTMLElement, layout: WorkerSurfaceProps["layout"], decorative: boolean, animation: WorkerAnimation) {
    if (this.disposed || !id || this.layers.has(id) || element.parentElement !== this.container) {
      throw new Error("Worker surfaces require distinct direct-root originals");
    }
    const rect = this.validateSurface(id, layout, decorative, animation);
    if (decorative && !isDecorative(element)) throw new Error(`Worker decoration must be inert, aria-hidden and noninteractive: ${id}`);
    const slot = Array.from({ length: this.options.program.capacity }, (_, index) => index)
      .find(index => ![...this.layers.values()].some(layer => layer.slot === index));
    if (slot === undefined) throw new Error("Prebuilt worker layer capacity exceeded");
    const layer: Enrollment = { id, element, slot, layout: rect, decorative, animation };
    if (!decorative) this.fixedLayouts.set(id, rect);
    if (animation === "opacity") layer.fallback = element.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
      { duration: 2000, iterations: Infinity, easing: "linear" });
    if (this.mode !== "dom" || this.reduced.matches || this.forced.matches) layer.fallback?.pause();
    this.layers.set(id, layer);
    this.resize.observe(element);
    this.invalidate();
    return () => {
      if (this.layers.get(id) !== layer) return;
      if (this.canvas && element.isConnected && element.closest("canvas") === this.canvas) this.canvas.clearElementGeometry(element);
      layer.fallback?.cancel();
      this.layers.delete(id);
      this.fixedLayouts.delete(id);
      this.resize.unobserve(element);
      this.invalidate();
    };
  }
  // Runs lifecycle operations (enable, disable, dispose, failure cleanup) one after another,
  // continuing even if an earlier one failed.
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.lifecycle.then(operation);
    this.lifecycle = task.then(() => undefined, () => undefined);
    return task;
  }
  // Posts a message and resolves with the worker's reply for the same ID. Rejects after 10 seconds
  // (unless `timeout` is false) or if posting fails. `transferred` runs once posting has succeeded,
  // which is when ownership of the transferred objects has moved to the worker.
  private request(data: WorkerRequest, transfer: Transferable[] = [], timeout = true, transferred?: () => void) {
    const worker = this.worker;
    if (!worker) return Promise.reject(new Error("Worker unavailable"));
    return new Promise<WorkerResponse>((resolve, reject) => {
      const timer = timeout ? setTimeout(() => {
        this.pending.delete(data.id);
        this.resources.requests--;
        reject(new Error(`Worker ${data.type} reply timed out`));
      }, 10_000) : undefined;
      this.pending.set(data.id, { type: data.type, resolve, reject, timer });
      this.resources.requests++;
      try { worker.postMessage(data, transfer); transferred?.(); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(data.id); this.resources.requests--;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  // Drops the waiting frame and releases its snapshots, counting them as dropped.
  private closeMailbox() {
    if (!this.mailbox) return;
    for (const { image } of this.mailbox.images) { image.close(); this.resources.snapshots--; this.droppedSnapshots++; }
    this.mailbox = undefined;
  }
  // Sends the waiting frame if none is in flight, then repeats when the worker has replied.
  private pump() {
    if (this.inflight || !this.mailbox || this.mode !== "gpu" && this.mode !== "admitting") return;
    const frame = this.mailbox;
    this.mailbox = undefined;
    let transferred = false;
    const current = this.request(frame, frame.images.map(({ image }) => image), true, () => {
      transferred = true;
      this.transfers += frame.images.length;
      this.resources.snapshots -= frame.images.length;
    });
    this.inflight = current;
    void current.then(() => {
      if (this.inflight === current) this.inflight = undefined;
      this.pump();
    }, error => {
      // postMessage failures leave transfer ownership with the sender.
      if (!transferred) for (const { image } of frame.images) { image.close(); this.resources.snapshots--; }
      if (this.inflight === current) this.inflight = undefined;
      this.fail(error);
    });
  }
  /** Backing-store scale: the device ratio, reduced only as far as needed to fit the pixel budget (DPR 1 always fits). */
  private backing() {
    const { width: w, height: h } = this.options;
    let dpr = devicePixelRatio;
    if (!(dpr > 0) || !Number.isFinite(dpr)) dpr = 1;
    if (Math.round(w * dpr) * Math.round(h * dpr) > 2_000_000) dpr = Math.min(dpr, Math.sqrt(2_000_000 / (w * h)));
    let width = Math.max(1, Math.round(w * dpr)), height = Math.max(1, Math.round(h * dpr));
    while (width * height > 2_000_000) { dpr *= 0.999; width = Math.max(1, Math.floor(w * dpr)); height = Math.max(1, Math.floor(h * dpr)); }
    return { dpr, width, height };
  }
  /**
   * Captures every enrolled layer and queues one frame for the worker. Throws (and the caller
   * fails the controller) if a layer is no longer a connected child of the canvas, has an unsupported
   * style or contents, or an essential control moved. Applies native geometry only when it changed.
   */
  private publish() {
    const canvas = this.canvas;
    if (!canvas || this.mode !== "gpu" && this.mode !== "admitting") return;
    const actualDPR = devicePixelRatio;
    const { dpr, width, height } = this.backing();
    // Uniform block: 4 header floats (the first is the pixel ratio), then LAYER_BLOCK_FLOATS per layer slot.
    const uniforms = new Float32Array(4 + this.options.program.capacity * LAYER_BLOCK_FLOATS);
    uniforms[0] = dpr;
    const images: WorkerFrame["images"] = [];
    try {
      if ([...this.container.children].some(element => ![...this.layers.values()].some(layer => layer.element === element))) {
        throw new Error("Unenrolled worker root content");
      }
      for (const layer of this.layers.values()) {
        if (!layer.element.isConnected || layer.element.closest("canvas") !== canvas
          || layer.element.getAnimations({ subtree: true }).some(animation => animation !== layer.fallback)) {
          throw new Error(`Worker source ownership changed: ${layer.id}`);
        }
        if (layer.decorative && !isDecorative(layer.element)) throw new Error(`Worker decoration became interactive: ${layer.id}`);
        if (layer.element.querySelector('dialog,[popover],[contenteditable]:not([contenteditable="false"]),select,input[type="file"],input[type="color"],input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]')) {
          throw new Error(`Unsupported worker editable/top-layer/native-picker boundary: ${layer.id}`);
        }
        const style = getComputedStyle(layer.element);
        if (style.transform !== "none" || style.filter !== "none" || style.mixBlendMode !== "normal"
          || Math.abs(parseFloat(style.width) - layer.layout.width) > 0.1
          || Math.abs(parseFloat(style.height) - layer.layout.height) > 0.1) throw new Error(`Unsupported worker presentation: ${layer.id}`);
        if (!layer.decorative) {
          const root = layer.element.getBoundingClientRect();
          const controls = new Map<Element, number[]>();
          for (const element of layer.element.querySelectorAll('button,input,textarea,a[href],[tabindex],[role]')) {
            const bounds = element.getBoundingClientRect();
            const rect = [bounds.x - root.x, bounds.y - root.y, bounds.width, bounds.height];
            const previous = layer.controls?.get(element);
            if (previous?.some((value, index) => Math.abs(value - rect[index]!) > 0.1)) {
              throw new Error(`Worker essential descendant geometry changed: ${layer.id}`);
            }
            controls.set(element, rect);
          }
          layer.controls = controls;
        }
        const extent = canvas.getElementImageDefaultSize(layer.element);
        const matrix = new DOMMatrix().translate(layer.layout.x, layer.layout.y);
        const geometryKey = JSON.stringify([layer.layout, extent, actualDPR]);
        if (geometryKey !== layer.geometryKey) {
          canvas.updateElementGeometry(layer.element, { canvasTransform: matrix, canvasClip: { x: 0, y: 0, width: layer.layout.width, height: layer.layout.height } });
          layer.geometryKey = geometryKey;
        }
        validateAppliedGeometry(canvas, layer.element, matrix);
        // Fill this layer's block: inverse transform of the translation to (x, y) plus texels per CSS
        // pixel, extent, opacity 1, the opacity-preset selector (1, or -1 for none), ripple amplitude
        // (off under reduced motion or forced colors), then the captured pixel size and the clip.
        const w = Math.ceil(extent.width), h = Math.ceil(extent.height), at = 4 + layer.slot * LAYER_BLOCK_FLOATS;
        uniforms.set([1, 0, -layer.layout.x, w / layer.layout.width, 0, 1, -layer.layout.y, h / layer.layout.height,
          layer.layout.width, layer.layout.height, 1, layer.animation === "opacity" ? 1 : -1,
          layer.animation === "ripple" && !this.reduced.matches && !this.forced.matches ? 6 : 0, 0, w, h], at);
        uniforms.set([0, 0, layer.layout.width, layer.layout.height], at + 40);
        // The inverse's projective row: worker layers are never tilted.
        uniforms.set([0, 0, 1, 0], at + 52);
        const image = canvas.captureElementImage(layer.element) as WorkerSnapshot;
        images.push({ slot: layer.slot, width: w, height: h, image });
        this.resources.snapshots++; this.captures++;
      }
      // A full newest batch replaces the previous unsent batch, never an unbounded queue.
      this.closeMailbox();
      this.mailbox = { type: "frame", id: ++this.nextID, width, height, uniforms, images };
      this.pump();
    } catch (error) {
      for (const { image } of images) { image.close(); this.resources.snapshots--; }
      throw error;
    }
  }
  /** Requests a native paint, whose `paint` event triggers a new capture. Coalesces repeated calls. */
  invalidate() {
    if (!this.canvas || this.paintRequested || this.mode !== "gpu" && this.mode !== "admitting") return;
    this.paintRequested = true;
    this.canvas.requestPaint();
  }
  // Syncs animation state: DOM-mode fallback animations play only in DOM mode without reduced
  // motion or forced colors; in GPU mode the worker is told whether the page is visible and reduced.
  private clock() {
    for (const layer of this.layers.values()) {
      if (this.mode === "dom" && !this.reduced.matches && !this.forced.matches) layer.fallback?.play();
      else {
        layer.fallback?.pause();
        if (layer.fallback && (this.reduced.matches || this.forced.matches)) layer.fallback.currentTime = 0;
      }
    }
    if (!this.worker || this.mode !== "gpu" && this.mode !== "admitting") return;
    void this.request({ type: "clock", id: ++this.nextID, playing: !document.hidden, reduced: this.reduced.matches || this.forced.matches })
      .catch(error => this.fail(error));
  }
  // Records the failure, stops publishing and tears the worker down; the original DOM is restored.
  private fail(error: unknown) {
    this.reason = `Worker failure: ${String(error)}`;
    console.error(this.reason);
    this.suspendPublication();
    void this.serialize(() => this.stop()).catch(failure => {
      this.reason += `; cleanup pending: ${String(failure)}`;
      console.error(this.reason); this.status();
    });
    this.status();
  }
  // Stops accepting and sending frames (invalidating any in-progress `enable`) without touching the worker.
  private suspendPublication() {
    this.epoch++;
    if (!this.disposed) this.mode = "restoring";
    this.closeMailbox();
    if (this.canvas && this.paintListener) {
      this.canvas.removeEventListener("paint", this.paintListener);
      this.paintListener = undefined; this.resources.listeners--;
    }
  }
  // Returns the original root container to the ordinary host, shows it and hides the canvas host.
  private restoreDOM() {
    this.epoch++;
    if (!this.disposed) this.mode = "dom";
    this.closeMailbox();
    this.options.ordinaryHost.style.display = "block";
    for (const layer of this.layers.values()) {
      if (this.canvas && layer.element.isConnected && layer.element.closest("canvas") === this.canvas) this.canvas.clearElementGeometry(layer.element);
      layer.geometryKey = undefined;
    }
    if (this.container.parentElement !== this.options.ordinaryHost) this.options.ordinaryHost.moveBefore(this.container, null);
    this.options.canvasHost.style.display = "none";
    this.options.ordinaryHost.style.display = "block";
    for (const layer of this.layers.values()) if (!this.reduced.matches && !this.forced.matches) layer.fallback?.play();
  }
  // Tears down the GPU side: waits for the worker to acknowledge `stop`, restores DOM, then
  // terminates the worker and removes the canvas.
  private async stop() {
    // Wait for the frame in flight to settle before stopping the worker.
    if (this.inflight) await this.inflight.catch(() => undefined);
    if (this.worker && this.workerReady) {
      // A healthy queue must acknowledge its fence and disposal; timeout is not permission to destroy it.
      try { await this.request({ type: "stop", id: ++this.nextID }); }
      catch (error) {
        this.reason = `Worker cleanup pending; original ownership retained: ${String(error)}`;
        this.status();
        throw error;
      }
    }
    this.restoreDOM();
    // Wait two animation frames after restoring the DOM before removing the canvas.
    if (this.canvas?.isConnected && !document.hidden) {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }
    if (this.worker) {
      // A worker that never acknowledged init (load failure, CSP, syntax error) never used its queue: terminate immediately.
      this.worker.terminate(); this.worker = undefined; this.resources.workers = 0; this.workerReady = false;
      this.resources.listeners -= 3;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer); this.pending.delete(id); this.resources.requests--;
        pending.reject(new Error("Worker terminated"));
      }
    }
    if (this.canvas && this.paintListener) {
      this.canvas.removeEventListener("paint", this.paintListener);
      this.paintListener = undefined; this.resources.listeners--;
    }
    this.canvas?.remove(); this.canvas = undefined; this.resources.canvases = 0;
    this.paintRequested = false;
  }
  /**
   * Requests GPU presentation. Creates the canvas and worker, runs a functional admission probe
   * (an 8x8 element captured, uploaded and read back from the worker's output), then moves the root
   * container into the canvas. Resolves with the resulting state (`mode` is `gpu`, or `dom` with the
   * refusal `reason`); an admission failure is reported through that state rather than thrown.
   */
  enable() {
    return this.serialize(async () => {
      if (this.disposed) throw new Error("Worker runtime disposed");
      if (this.mode === "gpu") return this.state();
      await this.stop();
      const epoch = ++this.epoch;
      try {
        if (!this.layers.size) throw new Error("Worker admission requires enrolled layers");
        if (!navigator.gpu || typeof this.options.ordinaryHost.moveBefore !== "function") throw new Error("WebGPU/state-preserving moveBefore unavailable");
        const canvas = document.createElement("canvas") as DrawableCanvas;
        const detected = capabilities(canvas);
        if (!detected.available || typeof canvas.captureElementImage !== "function" || typeof canvas.transferControlToOffscreen !== "function") {
          throw new Error(`Worker native capture unavailable: ${detected.missing.join(", ")}`);
        }
        enableDrawable(canvas);
        const backing = this.backing();
        canvas.width = backing.width; canvas.height = backing.height;
        canvas.style.cssText = `display:block;width:${this.options.width}px;height:${this.options.height}px`;
        this.options.canvasHost.append(canvas); this.canvas = canvas; this.resources.canvases = 1;
        this.options.canvasHost.style.display = "block";
        const worker = this.options.createWorker();
        this.worker = worker; this.resources.workers = 1; this.workerReady = false;
        this.resources.listeners += 3;
        worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
          if (worker !== this.worker) return;
          if (data.stats) this.latest = data.stats;
          const pending = this.pending.get(data.id);
          if (pending) {
            clearTimeout(pending.timer); this.pending.delete(data.id); this.resources.requests--;
            const expected = pending.type === "init" ? "ready" : pending.type === "stop" ? "stopped" : pending.type === "lose" ? "stats" : pending.type;
            if (data.type === "error") pending.reject(new Error(data.error));
            else if (data.type !== expected) pending.reject(new Error(`Invalid worker ${pending.type} response: ${data.type}`));
            else pending.resolve(data);
          } else if (data.type === "error" || data.type === "lost") this.fail(data.error);
        };
        const rejectRequests = (message: string) => {
          if (worker !== this.worker) return;
          for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer); pending.reject(new Error(message)); this.pending.delete(id); this.resources.requests--;
          }
          this.fail(message);
        };
        worker.onerror = event => { event.preventDefault(); rejectRequests(event.message || "Worker script failed to load or threw"); };
        worker.onmessageerror = () => rejectRequests("Worker message deserialization failed");
        const offscreen = canvas.transferControlToOffscreen();
        await this.request({ type: "init", id: ++this.nextID, canvas: offscreen, program: this.options.program }, [offscreen]);
        this.workerReady = true;
        // Functional admission: a solid 8x8 element goes through capture, transfer, upload and readback.
        const probe = document.createElement("div");
        probe.setAttribute("drawable", ""); probe.style.cssText = "position:absolute;width:8px;height:8px;background:rgb(240,30,60)";
        canvas.append(probe);
        try {
          await waitForPaint(canvas);
          const image = canvas.captureElementImage(probe) as WorkerSnapshot;
          const extent = canvas.getElementImageDefaultSize(probe);
          const uniforms = new Float32Array(4 + this.options.program.capacity * LAYER_BLOCK_FLOATS);
          uniforms[0] = backing.dpr;
          uniforms.set([1, 0, 0, extent.width / 8, 0, 1, 0, extent.height / 8, 8, 8, 1, -1, 0, 0, extent.width, extent.height], 4);
          // The clip of slot 0: header 4 plus block offset 40.
          uniforms.set([0, 0, 8, 8], 4 + 40);
          uniforms.set([0, 0, 1, 0], 4 + 52);
          let transferred = false;
          try {
            const response = await this.request({ type: "frame", id: ++this.nextID, probe: true, width: canvas.width, height: canvas.height,
              uniforms, images: [{ slot: 0, width: Math.ceil(extent.width), height: Math.ceil(extent.height), image }] }, [image], true,
              () => { transferred = true; });
            if (response.pixels !== 1) throw new Error("Worker capture readback not acknowledged");
          } catch (error) { if (!transferred) image.close(); throw error; }
        } finally { probe.remove(); }
        if (epoch !== this.epoch) throw new Error("Worker admission cancelled");
        for (const layer of this.layers.values()) {
          layer.fallback?.pause();
          if (layer.fallback) layer.fallback.currentTime = 0;
        }
        // `moveBefore` is the state-preserving move; the root container is not re-created.
        canvas.moveBefore(this.container, null);
        this.options.ordinaryHost.style.display = "none";
        this.mode = "admitting";
        // A `paint` event republishes. When it lists its changed elements, it is skipped unless it was
        // requested or a changed element is inside (or contains) an enrolled layer.
        this.paintListener = event => {
          const requested = this.paintRequested;
          this.paintRequested = false;
          const changed: unknown = Reflect.get(event, "changedElements");
          this.paintNotifications++;
          if (Array.isArray(changed)) {
            if (this.paintElements.length === 16) this.paintElements.shift();
            this.paintElements.push(changed.map(element => element instanceof Element ? element.id || element.tagName : String(element)));
            if (!requested && !changed.some(element => element instanceof Element && [...this.layers.values()]
              .some(layer => layer.element.contains(element) || element.contains(layer.element)))) return;
          }
          try { this.publish(); } catch (error) { this.fail(error); }
        };
        canvas.addEventListener("paint", this.paintListener);
        this.resources.listeners++;
        await waitForPaint(canvas);
        await this.settle();
        if (epoch !== this.epoch || this.mode !== "admitting") throw new Error("Worker admission interrupted");
        this.mode = "gpu"; this.reason = "Experimental worker GPU; fixed native geometry; decorative animation only";
        this.clock(); this.status();
      } catch (error) {
        this.reason = `Worker admission refused: ${String(error)}`;
        console.error(this.reason);
        this.suspendPublication(); await this.stop(); this.status();
      }
      return this.state();
    });
  }
  /** Resolves when no paint is requested and no frame is queued or in flight. Throws if the page is hidden mid-wait. */
  async settle() {
    await Promise.resolve();
    while (this.paintRequested || this.inflight || this.mailbox) {
      if (this.paintRequested && this.canvas) {
        if (document.hidden) throw new Error("Worker settle requires visible native paint");
        await waitForPaint(this.canvas);
      }
      if (this.inflight) await this.inflight;
      this.pump();
    }
  }
  /** Refreshes the worker's counters and returns the state. */
  async statistics() {
    if (this.worker) await this.request({ type: "stats", id: ++this.nextID });
    return this.state();
  }
  /** Test hook: destroys the worker's GPU device to exercise the loss path. Requires active GPU mode. */
  async simulateDeviceLoss() {
    if (this.mode !== "gpu") throw new Error("Device loss requires active worker GPU");
    await this.request({ type: "lose", id: ++this.nextID });
  }
  /** Caller-owned switch back to the original DOM; the worker is stopped and the canvas removed. */
  disable() {
    this.reason = "Explicit worker disable; original DOM retained";
    this.suspendPublication();
    return this.serialize(async () => { await this.stop(); this.status(); return this.state(); });
  }
  /** Stops the worker, unmounts the React root and removes the container. Idempotent. */
  dispose() {
    this.suspendPublication();
    return this.serialize(async () => {
      if (this.disposed) return this.state();
      await this.stop();
      this.disposed = true; this.unmount?.();
      this.container.remove(); this.release();
      this.reason = "Worker and original root disposed";
      this.status(); return this.state();
    });
  }
}
/**
 * Explicit bootstrap for the worker compositor: validates that the hosts are distinct, empty,
 * connected and in this document, creates the adapter-owned root container, renders `children`
 * (which use `WorkerSurface`) synchronously and returns the controller. The app starts in ordinary
 * DOM; call `enable()` to request worker GPU presentation. Throws for invalid hosts or options, and
 * when the first render throws (unless an error boundary in `children` catches it): the root is then
 * unmounted and the controller's observers and listeners released before the error is rethrown.
 */
export function mountWorkerCanvasApp(options: WorkerMountOptions, children: ReactNode): WorkerCanvasController {
  if (!options.ordinaryHost.isConnected || !options.canvasHost.isConnected
    || options.ordinaryHost.ownerDocument !== document || options.canvasHost.ownerDocument !== document
    || options.ordinaryHost === options.canvasHost || options.ordinaryHost.childNodes.length || options.canvasHost.childNodes.length) {
    throw new Error("Worker adapter requires distinct empty connected same-document hosts");
  }
  const container = document.createElement("div");
  container.style.cssText = `position:relative;width:${options.width}px;height:${options.height}px`;
  options.ordinaryHost.append(container);
  try {
    return new WorkerCanvasController(options, container, controller => {
      const tree = <Context.Provider value={controller}>{children}</Context.Provider>;
      return mountRoot(flushSync, rootOptions => {
        const root = createRoot(container, rootOptions as Parameters<typeof createRoot>[1]);
        root.render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
        return root;
      });
    });
  } catch (error) { container.remove(); throw error; }
}
