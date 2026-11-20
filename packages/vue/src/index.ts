/**
 * Public entry point of `@underglass/vue`: Vue 3 bindings over the framework-neutral `@underglass/core`
 * runtime. `mountCanvasApp` creates the one persistent Vue app inside the runtime's adapter-owned
 * container and provides the runtime to it; `Surface`, `Box`, `NativeScroll`, `NativeOverlay`, `Presence`
 * and `useSurfaceRef` register ordinary Vue-rendered elements with the runtime. The components render
 * plain DOM, so they work unchanged when GPU presentation is off. The core runtime owns all GPU behaviour.
 */
import {
  createApp, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, onUpdated, ref, shallowRef, toValue, warn, watch,
  Teleport, type App, type Component, type ComponentPublicInstance, type InjectionKey, type MaybeRefOrGetter, type PropType,
} from "vue";
import {
  CanvasRuntime, affine, pivot, compileStyle, type CanvasController, type RuntimeOptions, type Layout, type Appearance,
  type Transform, type TransformOrigin, type EnrollmentOptions, type MotionDescriptor, type TransitionHandle, type TransitionResult,
} from "@underglass/core";

export {
  createCanvasHosts, EnrollmentError, defineEffect,
} from "@underglass/core";
export type {
  CanvasController, CanvasHosts, EnrollmentOptions, EnrollmentErrorCode, Transform, TransformOrigin, Affine, Point,
  Layout, Appearance, AdmissionPolicy, RuntimeOptions, CanvasStatus, AnimationPlayback, ReleaseOptions, CSSAnimationSource,
  CompiledAnimation, CompiledProgramSet, Ripple, ApplicationEffect, ParameterRange, EffectDescriptor, EffectTime, EffectHandle,
  EffectResult, MaterialDescriptor, MaterialHandle, CustomMaterial, ReliefMaterial, ReliefScene, ReliefPrimitive, ReliefSceneMaterial, MotionKeyframe, MotionTiming, MotionDescriptor, MotionHandle, TransitionHandle, TransitionResult, CoordinatedMotion,
} from "@underglass/core";

// Carries the runtime from `mountCanvasApp` to every component and composable below.
const runtimeKey: InjectionKey<CanvasRuntime> = Symbol("underglass-runtime");

// Injection that fails loudly when a component is used outside an app mounted by `mountCanvasApp`.
function useRuntime(): CanvasRuntime {
  const runtime = inject(runtimeKey, null);
  if (!runtime) throw new Error("Underglass components require the app created by mountCanvasApp");
  return runtime;
}

/** Returns the controller of the enclosing Underglass app. Call it in `setup`; throws outside one. */
export function useGPUHost(): CanvasController { return useRuntime(); }

/**
 * Returns the adapter-owned overlay host for native dialogs and popovers, which stay outside the
 * captured tree. Call it in `setup`; throws when the mount supplied no `overlayHost`.
 */
export function useNativeOverlayHost(): HTMLElement {
  const host = useRuntime().overlayHost;
  if (!host) throw new Error("Native overlay requires the adapter-owned overlayHost");
  return host;
}

/** A template ref callback, as `useSurfaceRef` returns it: bind it with `:ref`. */
export type SurfaceRef = (element: Element | ComponentPublicInstance | null) => void;

/**
 * The element a template ref names: the element itself, or a component's root element (`$el`). Checked by
 * `nodeType`, as the core checks nodes, so an element of another realm (an iframe's) is not mistaken for
 * "no element"; anything else is returned as it is, for the runtime to refuse.
 */
function refElement(value: Element | ComponentPublicInstance): HTMLElement {
  if ((value as Node).nodeType !== 1 && "$el" in value) return (value.$el ?? value) as HTMLElement;
  return value as HTMLElement;
}

/**
 * Enrolls your own element (bind the returned callback with `:ref`) as a layer of the runtime without
 * cloning it, so the original Vue controls and state are kept. Bind it to a direct child of the app's
 * root, or to a component whose single root element is one (its `$el` is enrolled; it must keep that
 * root element while enrolled). The enrollment is released when the element unmounts or
 * `id`/`decorative` change; `origin` updates in place. `options` may be a ref or getter. Throws
 * `EnrollmentError` (from the runtime) when the element is refused, including a component whose root is
 * not one element and an element of another document or realm.
 */
export function useSurfaceRef(options: MaybeRefOrGetter<EnrollmentOptions>): SurfaceRef {
  const runtime = useRuntime();
  let attached: HTMLElement | null = null;
  let release: (() => void) | undefined;
  const enroll = () => {
    const { id, decorative, origin } = toValue(options);
    release = runtime.enroll(attached!, { id, decorative, origin });
  };
  const detach = () => { release?.(); release = undefined; };
  // Re-enroll when the identity changes; the origin updates in place.
  watch(() => { const { id, decorative } = toValue(options); return `${id}\u0000${!!decorative}`; }, () => {
    if (!attached) return;
    detach();
    enroll();
  }, { flush: "post" });
  watch(() => JSON.stringify(toValue(options).origin ?? "top-left"), () => {
    if (release) runtime.setOrigin(toValue(options).id, toValue(options).origin);
  }, { flush: "post" });
  onUpdated(() => runtime.requestReconcile());
  onBeforeUnmount(detach);
  // Vue calls a stable function ref on every patch of its element, so only a changed element re-enrolls.
  return element => {
    const next = element ? refElement(element) : null;
    if (next === attached) return;
    detach();
    attached = next;
    if (next) enroll();
    runtime.requestReconcile();
  };
}

/**
 * `style` is not an authored prop of `Surface`, `Box` or `NativeScroll`, as in React: their inline style is
 * compiled from the typed `layout` and `appearance`, and on a layer the runtime writes the presentation
 * declarations (`transform`, `opacity`, `transform-origin`) itself. Declaring it as a `never` prop makes a
 * typed `h()` call or template reject it, keeps it out of the fallthrough attributes, and lets the component
 * warn (in development) instead of dropping it unnoticed. Style the content with `class` or with elements
 * inside.
 */
const rejectedStyle = {
  /** Not supported: use `layout` and `appearance`, or `class`. */
  style: { type: null as unknown as PropType<never>, default: undefined },
};
/** Warns once per component instance, in development, that a `style` it was given is not applied. */
function styleWarning(component: string) {
  let warned = false;
  return (style: unknown) => {
    if (style === undefined || warned) return;
    warned = true;
    warn(`${component} does not apply \`style\`: its inline style comes from \`layout\` and \`appearance\`. Use \`class\` for other styles.`);
  };
}

/**
 * A top-level GPU layer: renders one native `<section>` (the original element, never a copy) and
 * registers it with the runtime. Its content is ordinary Vue and stays interactive through native hit
 * testing. `layout`, `transform` and `origin` updates are forwarded to the runtime after Vue patches
 * the DOM, in the same flush, so they land in the same GPU frame. Other attributes (`class`, `aria-*`,
 * `data-*`) and listeners fall through to the `<section>`. `style` is not accepted, as in React: the
 * layer's inline style comes from `layout` and `appearance`, and a `style` given anyway is not applied
 * (Vue warns in development).
 */
export const Surface = defineComponent({
  name: "UnderglassSurface",
  inheritAttrs: false,
  props: {
    ...rejectedStyle,
    /** Unique layer ID used by the controller methods. */
    id: { type: String, required: true },
    /** Position, size and flex layout compiled to browser styles. */
    layout: { type: Object as PropType<Layout>, default: () => ({}) },
    /** Visual styling compiled to browser styles. */
    appearance: { type: Object as PropType<Appearance>, default: () => ({}) },
    /** Numeric transform of the layer; applied in both GPU and ordinary DOM presentation. */
    transform: { type: Object as PropType<Transform>, default: () => ({}) },
    /** Static pivot for `transform` rotation and scale, like CSS `transform-origin`. */
    origin: { type: [String, Object] as PropType<TransformOrigin>, default: undefined },
    /** Marks inert, aria-hidden, noninteractive decoration that effects may distort. */
    decorative: { type: Boolean, default: false },
    /** Makes the surface's content inert. Decorative surfaces are always inert. */
    inert: { type: Boolean, default: false },
  },
  setup(props, { attrs, slots }) {
    const runtime = useRuntime();
    const element = shallowRef<HTMLElement | null>(null);
    let release: (() => void) | undefined;
    const register = () => {
      release = runtime.register({ id: props.id, element: element.value!, layout: props.layout,
        transform: { ...props.transform }, origin: props.origin, decorative: props.decorative });
    };
    const inert = () => { element.value!.inert = props.decorative || props.inert; };
    onMounted(() => { inert(); register(); runtime.requestReconcile(); });
    // Re-registers only when `id` or `decorative` change; other updates go through the watchers below.
    watch(() => [props.id, props.decorative], () => { release?.(); inert(); register(); }, { flush: "post" });
    watch(() => props.inert, inert, { flush: "post" });
    watch(() => JSON.stringify(props.origin ?? "top-left"), () => runtime.setOrigin(props.id, props.origin), { flush: "post" });
    watch(() => [JSON.stringify(props.layout), JSON.stringify(props.transform)],
      () => runtime.update(props.id, props.layout, props.transform), { flush: "post" });
    onUpdated(() => runtime.requestReconcile());
    onBeforeUnmount(() => { release?.(); release = undefined; });
    const checkStyle = styleWarning("Surface");
    return () => {
      // Validate eagerly so a bad transform or origin throws during render rather than inside a watcher.
      affine(props.transform);
      pivot(props.origin, { width: 1, height: 1 });
      checkStyle(props.style);
      // Vue re-applies every key of a style object on each patch, so the style below must never name the
      // presentation properties the runtime owns (`transform`, `opacity`, `transform-origin`): rewriting
      // them would drop the runtime's GPU declarations and revoke GPU. The runtime writes the element's
      // `transform-origin: 0 0` itself on registration; the pivot requested through `origin` is baked into
      // its transform matrix (`affine`). `^drawable` forces the attribute rather than a same-named DOM
      // property.
      return h("section", {
        ...attrs, ref: element, id: props.id, "^drawable": "",
        "aria-hidden": props.decorative ? "true" : attrs["aria-hidden"],
        style: { ...compileStyle(props.layout, props.appearance, true), ...(props.decorative ? { pointerEvents: "none" } : {}) },
      }, slots.default?.());
    };
  },
});

const boxProps = {
  /** Size, padding and flex layout compiled to browser styles; `x`/`y` are ignored for boxes. */
  layout: { type: Object as PropType<Layout>, default: undefined },
  /** Visual styling compiled to browser styles. */
  appearance: { type: Object as PropType<Appearance>, default: undefined },
  ...rejectedStyle,
};

/**
 * A styled `<div>` for content inside a `Surface`. It gets a `data-underglass-clipped` marker attribute
 * when its `overflow` clips. Other attributes and listeners fall through to the `<div>`; `style` is not
 * accepted, as on `Surface`.
 */
export const Box = defineComponent({
  name: "UnderglassBox",
  props: boxProps,
  setup(props, { slots }) {
    const checkStyle = styleWarning("Box");
    return () => {
      checkStyle(props.style);
      return h("div", {
        "data-underglass-clipped": props.layout?.overflow && props.layout.overflow !== "visible" ? "" : undefined,
        style: compileStyle(props.layout, props.appearance),
      }, slots.default?.());
    };
  },
});

/** A `Box` that scrolls natively (`overflow: scroll`, marked `data-underglass-scroll`); the browser handles the scrolling. */
export const NativeScroll = defineComponent({
  name: "UnderglassNativeScroll",
  props: boxProps,
  setup(props, { slots }) {
    const checkStyle = styleWarning("NativeScroll");
    return () => {
      checkStyle(props.style);
      return h(Box, { layout: { ...props.layout, overflow: "scroll" }, appearance: props.appearance, "data-underglass-scroll": "" }, slots);
    };
  },
});

/**
 * Teleports its content into the adapter-owned overlay host, outside the captured tree, so native
 * dialogs and popovers keep working. Throws when the mount supplied no `overlayHost`.
 */
export const NativeOverlay = defineComponent({
  name: "UnderglassNativeOverlay",
  setup(_, { slots }) {
    const runtime = useRuntime();
    if (!runtime.overlayHost) throw new Error("NativeOverlay requires the adapter-owned overlayHost");
    const host = runtime.overlayHost;
    return () => h(Teleport, { to: host }, slots.default?.() ?? []);
  },
});

/**
 * Mounts its content while `present`, and keeps it mounted until the exit transition on layer `id`
 * completes. `id` names an already-enrolled boundary that encloses `Presence` (for example a
 * `useSurfaceRef` element); `Presence` animates that boundary and does not enroll anything. Emits
 * `complete` with the result when an enter or exit ends, except for one superseded by a newer
 * transition or by unmount. Content that is present on first render does not enter-animate.
 */
export const Presence = defineComponent({
  name: "UnderglassPresence",
  props: {
    /** ID of the enrolled layer the enter and exit motion is applied to. */
    id: { type: String, required: true },
    /** Whether the content should be mounted. Switching to false plays `exit` before unmounting. */
    present: { type: Boolean, required: true },
    /** Motion played when `present` changes to true. */
    enter: { type: Object as PropType<MotionDescriptor>, required: true },
    /** Motion played when the content is removed; it unmounts once this finishes. */
    exit: { type: Object as PropType<MotionDescriptor>, required: true },
  },
  emits: { complete: (result: TransitionResult) => !!result },
  setup(props, { slots, emit }) {
    const runtime = useRuntime();
    const retained = ref(props.present);
    let generation = 0;
    let motion: TransitionHandle | undefined;
    watch(() => props.present, async present => {
      const version = ++generation;
      if (present && !retained.value) {
        retained.value = true;
        // Apply the enter sample once the newly retained content is in the DOM, before the browser paints.
        await nextTick();
        if (version !== generation) return;
      }
      if (!retained.value) return;
      const handle = runtime.transition(props.id, present ? props.enter : props.exit);
      motion = handle;
      void handle.finished.then(result => {
        // A newer transition or an unmount superseded this one; ignore its completion.
        if (version !== generation) return;
        if (!present) retained.value = false;
        emit("complete", result);
      });
    }, { flush: "post" });
    onBeforeUnmount(() => { generation++; motion?.cancel(); });
    return () => retained.value ? slots.default?.() : null;
  },
});

/**
 * Options for `mountCanvasApp`: the runtime options minus `mount`, plus `configure`, called with the new
 * Vue app before it mounts (install plugins, set `config.errorHandler`, ...).
 */
export type MountCanvasOptions = Omit<RuntimeOptions, "mount"> & { configure?: (app: App) => void };

/**
 * Explicit bootstrap: creates the one persistent Vue app from `root` (with optional root `props`) inside
 * the adapter-owned container, provides the runtime to it, mounts it synchronously and returns the
 * controller. The app starts in ordinary DOM; call `enable()` to request GPU presentation. Disposal
 * unmounts the app.
 */
export function mountCanvasApp(options: MountCanvasOptions, root: Component, props?: Record<string, unknown>): CanvasController {
  const { configure, ...runtimeOptions } = options;
  return new CanvasRuntime({
    ...runtimeOptions,
    mount(container, runtime) {
      const app = createApp(root, props);
      app.provide(runtimeKey, runtime);
      configure?.(app);
      app.mount(container);
      return () => app.unmount();
    },
  });
}
