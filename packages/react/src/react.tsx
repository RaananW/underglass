/**
 * React bindings for the default (non-worker) backend. `mountCanvasApp` creates the persistent React
 * root inside a `CanvasRuntime` mount boundary; `GPUHost` shares that runtime through context; and
 * `Surface`, `useSurfaceRef`, `Presence`, `Box`, `NativeScroll` and `NativeOverlay` register ordinary
 * React-rendered elements with the runtime. The components render plain DOM, so they work unchanged
 * when GPU presentation is off. The framework-neutral runtime in `@underglass/core` owns all GPU behaviour.
 */
import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, StrictMode, type HTMLAttributes, type ReactNode, type RefCallback } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot, hydrateRoot } from "react-dom/client";
import {
  CanvasRuntime, affine, pivot, compileStyle, canvasHostsMarkup, type CanvasController, type RuntimeOptions, type Transform, type TransformOrigin,
  type Layout, type Appearance, type EnrollmentOptions, type MotionDescriptor, type TransitionResult,
} from "@underglass/core";
import { mountRoot } from "./first-render.js";

// Carries the runtime from `GPUHost` to every component and hook below.
const Context = createContext<CanvasRuntime | null>(null);

/**
 * Provides `runtime` to the Underglass components below it. `mountCanvasApp` wraps the application
 * in this for you; use it directly only when you create the runtime yourself. Every commit asks
 * the runtime to reconcile.
 */
export function GPUHost({ runtime, children }: { runtime: CanvasRuntime; children: ReactNode }) {
  useLayoutEffect(() => runtime.requestReconcile());
  return <Context.Provider value={runtime}>{children}</Context.Provider>;
}
// Context lookup that fails loudly when a component is rendered outside `GPUHost`.
function useRuntime() {
  const runtime = useContext(Context);
  if (!runtime) throw new Error("Underglass components require GPUHost and the explicit mount adapter");
  return runtime;
}
/** Returns the controller (`CanvasController` from `@underglass/core`) of the enclosing `GPUHost`. Throws outside one. */
export function useGPUHost(): CanvasController { return useRuntime(); }
/**
 * Returns the adapter-owned overlay host for native dialogs and popovers, which stay outside the
 * captured tree. Throws when the mount supplied no `overlayHost`.
 */
export function useNativeOverlayHost(): HTMLElement {
  const host = useRuntime().overlayHost;
  if (!host) throw new Error("Native overlay requires the adapter-owned overlayHost");
  return host;
}
/**
 * Enrolls your own element (a callback ref) as a layer of the runtime without cloning it, so the
 * original React controls and state are kept. Attach the returned ref to a direct child of the
 * React root. The enrollment is released when the element detaches or `id`/`decorative` change;
 * `origin` updates in place. Throws `EnrollmentError` (from the runtime) when the element is refused.
 */
export function useSurfaceRef<T extends HTMLElement = HTMLElement>({ id, decorative, origin }: EnrollmentOptions): RefCallback<T> {
  const runtime = useRuntime();
  const originKey = JSON.stringify(origin ?? "top-left");
  const latestOrigin = useRef(origin);
  latestOrigin.current = origin;
  const attached = useRef<T | null>(null);
  const release = useRef<(() => void) | undefined>(undefined);
  const ref = useCallback((element: T | null) => {
    if (attached.current === element) return;
    release.current?.();
    release.current = undefined;
    attached.current = null;
    if (element) {
      release.current = runtime.enroll(element, { id, decorative, origin: latestOrigin.current });
      attached.current = element;
    }
  }, [runtime, id, decorative]);
  // React18 StrictMode replays effects but not callback refs.
  // So the effect below re-enrolls the element that is still attached after the replayed cleanup.
  useLayoutEffect(() => {
    if (attached.current && !release.current) release.current = runtime.enroll(attached.current, { id, decorative, origin: latestOrigin.current });
    return () => { release.current?.(); release.current = undefined; };
  }, [runtime, id, decorative]);
  useLayoutEffect(() => { if (release.current) runtime.setOrigin(id, latestOrigin.current); }, [runtime, id, originKey]);
  useLayoutEffect(() => runtime.requestReconcile());
  return ref;
}
/** Props of `Presence`. */
export interface PresenceProps {
  /** ID of the enrolled layer the enter and exit motion is applied to. */
  id: string;
  /** Whether the children should be mounted. Switching to false plays `exit` before unmounting. */
  present: boolean;
  /** Motion played when `present` changes to true. Content that is present on first render does not enter-animate. */
  enter: MotionDescriptor;
  /** Motion played when the children are removed; they unmount once it finishes. */
  exit: MotionDescriptor;
  children: ReactNode;
  /** Called with the result when an enter or exit ends; not called for a transition superseded by a newer one or by unmount. */
  onComplete?: (result: TransitionResult) => void;
}
/**
 * Mounts its children while `present`, and keeps them mounted until the exit transition on layer
 * `id` completes. `id` names an already-enrolled boundary that encloses `Presence` (for example a
 * `useSurfaceRef` element); `Presence` animates that boundary and does not enroll anything.
 */
export function Presence({ id, present, enter, exit, children, onComplete }: PresenceProps) {
  const runtime = useRuntime();
  const [retained, setRetained] = useState(present);
  const previous = useRef(present);
  const pending = useRef(false);
  const generation = useRef(0);
  const motion = useRef<ReturnType<CanvasRuntime["transition"]> | undefined>(undefined);
  const completion = useRef(onComplete);
  completion.current = onComplete;
  // The descriptors are compared by value so an inline object does not restart the effect each render.
  const enterKey = JSON.stringify(enter), exitKey = JSON.stringify(exit);
  // Layout effect: the enter sample is applied before the newly retained children first paint.
  useLayoutEffect(() => {
    if (previous.current !== present) pending.current = true;
    if (!pending.current) return;
    previous.current = present;
    if (present && !retained) { setRetained(true); return; }
    pending.current = false;
    if (!retained) return;
    const version = ++generation.current;
    const handle = runtime.transition(id, present ? enter : exit);
    motion.current = handle;
    void handle.finished.then(result => {
      if (motion.current === handle) motion.current = undefined;
      // A newer transition or an unmount superseded this one; ignore its completion.
      if (version !== generation.current) return;
      if (!present) setRetained(false);
      completion.current?.(result);
    });
  }, [runtime, id, present, retained, enterKey, exitKey]);
  // Layout-effect cleanup, so the transition ends inside the commit that removes the children, before React detaches
  // their DOM. Bumping `generation` there also drops a `finished` that the same commit resolved (releasing the layer's
  // enrollment cancels its transition) before that continuation, a microtask, can run. React also runs this cleanup
  // when Suspense hides this `Presence` and when StrictMode replays mount effects (no transition runs on mount); a
  // transition it interrupts is marked pending, so the effect above plays it again when the `Presence` is shown.
  useLayoutEffect(() => () => {
    generation.current++;
    const running = motion.current;
    motion.current = undefined;
    if (running) { pending.current = true; running.cancel(); }
  }, []);
  return retained ? <>{children}</> : null;
}
/** Props of `Surface`. Other HTML attributes are forwarded to the rendered `<section>`. */
export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "style" | "id"> {
  /** Unique layer ID used by the controller methods. */
  id: string;
  /** Position, size and flex layout compiled to browser styles. */
  layout?: Layout;
  /** Visual styling compiled to browser styles. */
  appearance?: Appearance;
  /** Numeric transform of the layer; applied in both GPU and ordinary DOM presentation. */
  transform?: Transform;
  /** Static pivot for `transform` rotation and scale, like CSS `transform-origin`. */
  origin?: TransformOrigin;
  /** Marks inert, aria-hidden, noninteractive decoration that effects may distort. */
  decorative?: boolean;
  /** Makes the surface's content inert. Decorative surfaces are always inert. */
  inert?: boolean;
}
/**
 * A top-level GPU layer: renders one native `<section>` (the original element, never a copy) and
 * registers it with the runtime. Its content is ordinary React and stays interactive through
 * native hit testing. `layout`, `transform` and `origin` updates are forwarded to the runtime in
 * layout effects so they land in the same commit.
 */
export function Surface({ id, layout = {}, appearance = {}, transform = {}, origin, decorative = false, inert = false, children, ...attributes }: SurfaceProps) {
  const runtime = useRuntime();
  const element = useRef<HTMLElement>(null);
  const layoutKey = JSON.stringify(layout);
  const transformKey = JSON.stringify(transform);
  const originKey = JSON.stringify(origin ?? "top-left");
  // Validate eagerly so a bad transform or origin throws during render rather than inside an effect.
  affine(transform);
  pivot(origin, { width: 1, height: 1 });
  useLayoutEffect(() => { element.current!.inert = decorative || inert; }, [decorative, inert]);
  // Re-registers only when `id` or `decorative` change; other updates go through the effects below.
  useLayoutEffect(() => runtime.register({ id, element: element.current!, layout, transform: { ...transform }, origin, decorative }), [runtime, id, decorative]);
  useLayoutEffect(() => runtime.setOrigin(id, origin), [runtime, id, originKey]);
  useLayoutEffect(() => runtime.update(id, layout, transform), [runtime, id, layoutKey, transformKey]);
  useLayoutEffect(() => runtime.requestReconcile());
  // The element keeps `transform-origin: 0 0`; the pivot requested through `origin` is baked into the
  // runtime's transform matrix (`affine`) instead of being applied by CSS.
  return <section {...attributes} aria-hidden={decorative ? true : attributes["aria-hidden"]}
    ref={element} id={id} {...{ drawable: "" }} style={{
    ...compileStyle(layout, appearance, true), transformOrigin: "0 0",
    ...(decorative ? { pointerEvents: "none" } : {}),
  }}>{children}</section>;
}
/** Props of `Box` and `NativeScroll`. */
export interface BoxProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  layout?: Layout;
  appearance?: Appearance;
}
/**
 * A styled `<div>` for content inside a `Surface`. It gets a `data-underglass-clipped` marker
 * attribute when its `overflow` clips.
 */
export function Box({ layout, appearance, ...attributes }: BoxProps) {
  return <div {...attributes} data-underglass-clipped={layout?.overflow && layout.overflow !== "visible" ? "" : undefined}
    style={compileStyle(layout, appearance)} />;
}
/** A `Box` that scrolls natively (`overflow: scroll`, marked `data-underglass-scroll`); the browser handles the scrolling. */
export function NativeScroll({ layout, ...attributes }: BoxProps) {
  return <Box {...attributes} layout={{ ...layout, overflow: "scroll" }} data-underglass-scroll="" />;
}
const neverChanges = () => () => {};
/**
 * Portals its children into the adapter-owned overlay host, outside the captured tree, so native
 * dialogs and popovers keep working. Throws when the mount supplied no `overlayHost`.
 *
 * An overlay has no prerendered markup (React cannot hydrate a portal): it renders nothing while the
 * tree is prerendered and while it hydrates, and mounts its portal right after.
 */
export function NativeOverlay({ children }: { children: ReactNode }) {
  const runtime = useRuntime();
  // The server snapshot is what React uses while prerendering and while hydrating.
  const mounted = useSyncExternalStore(neverChanges, () => true, () => false);
  if (!mounted) return null;
  if (!runtime.overlayHost) throw new Error("NativeOverlay requires the adapter-owned overlayHost");
  return createPortal(children, runtime.overlayHost);
}
/**
 * Stands in for the runtime while the tree is rendered ahead of time (`prerenderCanvasApp`). Rendering
 * needs none of it: layers register from refs and layout effects, which do not run there. Reading the
 * controller during render (`useGPUHost().state()`, for example) throws and names the method.
 */
const prerenderRuntime = new Proxy({}, {
  get(_target, key) {
    if (key === "requestReconcile") return () => {};
    if (key === "overlayHost" || typeof key === "symbol") return undefined;
    if (key === "container") throw new Error("Underglass controller.container is not available while prerendering; read it from an effect or an event handler");
    return () => { throw new Error(`Underglass controller.${key} is not available while prerendering; call it from an effect or an event handler`); };
  },
}) as CanvasRuntime;
/**
 * Renders the application ahead of time (on a server or in a build) and returns the HTML of the
 * adapter-owned hosts with it inside: write it as the only content of the sized frame element. Pass
 * React's own renderer as `render` (`renderToString` from `react-dom/server`), so this package never
 * imports it. In the browser, mount the same `children` with `createCanvasHosts(frame)` and
 * `mountCanvasApp({ ...hosts, hydrate: true }, children)`: React attaches to the prerendered elements,
 * and they are the ones GPU presentation later draws. `NativeOverlay` renders nothing here.
 */
export function prerenderCanvasApp(children: ReactNode, render: (tree: ReactNode) => string): string {
  return canvasHostsMarkup(render(<GPUHost runtime={prerenderRuntime}>{children}</GPUHost>));
}
/**
 * Options for `mountCanvasApp`: the runtime options minus `mount`, plus injectable React entry
 * points (for a second React copy or tests) and `strict` to wrap the tree in `StrictMode`.
 *
 * The adapter's own `createRoot` and `hydrateRoot` make `mountCanvasApp` throw when the first render
 * throws, which React 19 would otherwise only report. A `createRoot` or `hydrateRoot` you pass keeps
 * React's behaviour: with React 19 the mount then returns over an empty root, and the error goes to
 * that root's `onUncaughtError` (by default `reportError`).
 *
 * With `hydrate` (a runtime option), the hosts must be the prerendered ones (`prerenderCanvasApp`,
 * adopted by `createCanvasHosts`) and the tree is hydrated with `hydrateRoot` instead of rendered.
 * Pass your own `hydrateRoot` to give React options such as `onRecoverableError`.
 */
export type MountCanvasOptions = Omit<RuntimeOptions, "mount"> & {
  createRoot?: typeof createRoot;
  hydrateRoot?: (container: HTMLDivElement, tree: ReactNode) => { unmount(): void };
  flushSync?: typeof flushSync;
  strict?: boolean;
};
/**
 * Explicit bootstrap: creates the persistent React root inside the adapter-owned container, renders
 * `children` under `GPUHost` synchronously (or, with `hydrate`, hydrates the prerendered markup
 * there) and returns the controller. The app starts in ordinary DOM; call `enable()` to request GPU
 * presentation. If the first render throws (and no error boundary in `children` catches it), the root
 * is unmounted, the runtime releases what it attached and the error is rethrown; with an injected
 * `createRoot` or `hydrateRoot`, React 19 only reports it (see `MountCanvasOptions`).
 */
export function mountCanvasApp(options: MountCanvasOptions, children: ReactNode): CanvasController {
  return new CanvasRuntime({
    ...options,
    mount(container, runtime) {
      const host = <GPUHost runtime={runtime}>{children}</GPUHost>;
      const tree = options.strict ? <StrictMode>{host}</StrictMode> : host;
      // Rendering and hydration complete inside `flushSync`, so the layers are registered when the controller
      // is. A first render that throws makes this throw, unless the caller injected the root (see `mountRoot`).
      return mountRoot(options.flushSync ?? flushSync, rootOptions => {
        if (options.hydrate) {
          return options.hydrateRoot ? options.hydrateRoot(container, tree) : hydrateRoot(container, tree, rootOptions as Parameters<typeof hydrateRoot>[2]);
        }
        const root = options.createRoot ? options.createRoot(container) : createRoot(container, rootOptions as Parameters<typeof createRoot>[1]);
        root.render(tree);
        return root;
      });
    },
  });
}
