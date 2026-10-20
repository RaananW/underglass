/**
 * `CanvasRuntime`, the controller behind `mountCanvasApp`, `mountApplicationModule` and `useGPUHost()`.
 * It keeps the layer registry, turns each layer's `Transform` and static origin into the one canonical matrix
 * used for DOM CSS, GPU sampling and native hit geometry, and decides who writes each element's
 * transform/opacity declarations. It drives the one shared renderer (`renderer.ts`) and owns the observers,
 * listeners and RAF clocks for reconciliation, viewport geometry, visibility, reduced motion, controller
 * motion, declarative transitions, animation ownership and decorative effects.
 */
import { canonical, cssMatrix, DEFAULT_PERSPECTIVE, pivot, project, tilted, type Transform, type TransformOrigin } from "./affine.js";
import { createSurfaceRenderer, type SurfaceRendererOptions } from "./renderer.js";
import type { Layout } from "./compiler.js";
import type { MountBoundaryOptions } from "./mount-boundary.js";
import { DeclarationOwnership, prepareAnimation, rejectImportantPresentation, type AnimationPlayback } from "./animation.js";
import { validateCSSSource, type CSSAnimationSource } from "./css-animation.js";
import { decorative, interactive, validateRipple, type Ripple } from "./ripple.js";
import { reliefDegraded, type ReliefScene } from "./relief.js";
import type { StageScene } from "./stage.js";
import { effectNumber, isSceneMaterial, validateEffects, validateMaterial, withEmitters, type EffectDescriptor, type EffectHandle, type EffectResult, type MaterialDescriptor, type MaterialHandle } from "./effects.js";
import { compileMotion, type CoordinatedMotion, type MotionDescriptor, type MotionHandle, type TransitionHandle, type TransitionResult } from "./motion.js";
import { EnrollmentError, type EnrollmentOptions } from "./enrollment.js";
import { nativeEditingControl, nativeScrollKind } from "./native.js";
import { scrollOrigin, intersectViewport, localViewport, canvasContentOrigin, viewportContains, axisAligned, type ViewportRect } from "./viewport.js";
import { isNoOpMutation } from "./mutations.js";
import { validateCompiledPrograms, verifyCompiledAnimation, type CompiledAnimation } from "./compiled.js";

/** Upper bound for `budgets.layers`; each layer is one blended pass, so this only bounds per-frame work. */
const MAX_LAYERS = 64;
/** `"automatic"` is accepted for compatibility and behaves like `"explicit"`: initial and diagnosed reentry both require `enable()`. */
export type AdmissionPolicy = "explicit" | "automatic";

/**
 * Properties GPU presentation owns on an enrolled boundary (both CSS and camel-case `transformOrigin` keyframe
 * spellings); `"all"` covers `transition-property: all`.
 */
const presentationProperties = new Set(["transform", "opacity", "translate", "rotate", "scale", "transform-origin", "transformOrigin", "all"]);
/** Whether an animation drives a property that GPU presentation owns exclusively on the enrolled boundary. */
function animatesPresentation(animation: Animation) {
  if (typeof CSSTransition !== "undefined" && animation instanceof CSSTransition) return presentationProperties.has(animation.transitionProperty);
  const effect = animation.effect;
  // Keyframes of a non-`KeyframeEffect` cannot be inspected, so it is treated as a conflict.
  if (!(effect instanceof KeyframeEffect)) return true;
  return effect.getKeyframes().some(frame => Object.keys(frame).some(key => presentationProperties.has(key)));
}

/**
 * One enrolled layer as the runtime tracks it. `Surface` registers one directly, `enroll` builds one for an
 * original element, and `mountApplicationModule` passes module-supplied definitions to `register`.
 */
export interface LayerDefinition {
  /** Unique nonempty id; every controller call addresses the layer by it. */
  id: string;
  /** The original element; it must be connected inside the persistent root. */
  element: HTMLElement;
  /** Typed layout last supplied by React; only checked for zero size here. Ref enrollments use `{}`. */
  layout: Layout;
  /** Current transform; motion, transitions and animation ownership overwrite it while they run. */
  transform: Transform;
  /** Static pivot for rotation and scale; defaults to "top-left". */
  origin?: TransformOrigin;
  /**
   * Keeps authored CSS authoritative in ordinary DOM: the runtime writes presentation declarations only
   * while GPU presents and requires neutral authored transform/opacity. Set by `enroll`.
   */
  preserveStyles?: boolean;
  /** Inert, aria-hidden decoration; required before `setEffects` or `setRipple` may target the layer. */
  decorative?: boolean;
}
/** `CanvasRuntime` options. `mountCanvasApp` supplies `mount` itself and passes the rest through. */
export interface RuntimeOptions extends Omit<MountBoundaryOptions, "mount"> {
  /** Empty, connected sibling of `ordinaryHost` outside the root; the portal target of `NativeOverlay`. */
  overlayHost?: HTMLElement;
  /** Layer count (1..64) and captured-pixel budgets; the renderer's defaults apply when omitted. */
  budgets?: SurfaceRendererOptions["budgets"];
  /** Build-generated CSS compiler program set; validated on construction, used by `ownCompiledAnimation`. */
  compiled?: SurfaceRendererOptions["compiled"];
  /** Serialized JSON status; prefer `onStatusChange` for a structured value. */
  onStatus?(message: string): void;
  /** Structured renderer status, delivered on every status change. */
  onStatusChange?: SurfaceRendererOptions["onStatusChange"];
  /** Per-operation timing samples (capture, upload, frame work); the runtime retains none of them. */
  onMeasure?: SurfaceRendererOptions["onMeasure"];
  /** `"explicit"` (default) or `"automatic"`; both currently require `enable()` for entry and reentry. */
  admissionPolicy?: AdmissionPolicy;
  /**
   * Called once, synchronously during construction, with the stable adapter-owned container. It mounts one
   * persistent framework root (React, Vue, plain DOM, ...) there and returns that root's unmount, which final
   * disposal calls exactly once.
   */
  mount(container: HTMLDivElement, runtime: CanvasRuntime): () => void;
}

/**
 * The narrow controller every mount function returns (`mountApplicationModule`, and `mountCanvasApp` in
 * `@underglass/react`): enrollment, transforms, motion, effects and the `enable`/`disable`/`dispose`
 * lifecycle. See `docs/api.md`.
 */
export type CanvasController = Pick<CanvasRuntime, "container" | "enroll" | "transition" | "transitionGroup" | "setTransform" | "setOrigin" | "animate" | "enable" | "disable" | "dispose" | "invalidate" | "settle" | "state" | "ownAnimation" | "ownCSSAnimation" | "ownCompiledAnimation" | "createMotion" | "advance" | "setRipple" | "setEffects" | "setMaterial">;

/**
 * Runtime controller for one mounted application. Its public methods form the `CanvasController`, plus
 * `register`, `update`, `setOrigin`, `requestReconcile` and `overlayHost`, which framework adapters (the
 * React `Surface`, `useSurfaceRef` and `GPUHost`) call after each commit. After `dispose()` the mutating
 * methods throw `Runtime is disposed`.
 */
export class CanvasRuntime {
  /** The shared renderer; undefined only while its creation runs the synchronous mount callback. */
  private core: ReturnType<typeof createSurfaceRenderer> | undefined;
  /** Enrolled layers by id. Paint and hit order come from `ordered()`, not insertion order. */
  private readonly registry = new Map<string, LayerDefinition>();
  /** Teardown callbacks for listeners added through `listen`, run by `dispose()`. */
  private readonly removers: (() => void)[] = [];
  /** Watches the root (and the output canvas's ancestors' style/class) to dirty captures and cached policy. */
  private readonly mutation: MutationObserver;
  /** Watches the frame, every layer and the ancestors that can change layer geometry. */
  private readonly resize: ResizeObserver;
  /** `prefers-reduced-motion` query; keeps GPU but stops controller motion (see the `change` listener). */
  private readonly reduced = matchMedia("(prefers-reduced-motion: reduce)");
  /** `forced-colors` query; a change recaptures every layer because painted content changes. */
  private readonly forced = matchMedia("(forced-colors: active)");
  /** Pending coalesced `requestDraw` RAF id; 0 when none. */
  private drawFrame = 0;
  /** A light was written with `setEmitters` since the last draw (`requestDraw`'s lead frame). */
  private lightWritten = false;
  /** Someone other than a light asked for a draw since the last one (`requestDraw`). */
  private drawWanted = false;
  /** The RAF currently awaited by `animate`/`advance`, with the rejecter `cancelMotion` uses to interrupt it. */
  private motionFrame: { id: number; reject(error: Error): void } | undefined;
  /** `animate`/`advance` loops parked until the document becomes visible again. */
  private readonly visibilityWaiters = new Set<{ resolve(): void; reject(error: Error): void }>();
  /** Set once `dispose()` has finished; observers, listeners and schedulers then do nothing. */
  private stopped = false;
  /** True while `dispose()` awaits the renderer, so effects finish as `disposed` rather than `fallback`. */
  private disposalRequested = false;
  /** True while `animate` or `advance` drives frames; the shared clock and other motion stay off. */
  private moving = false;
  /** Bumped on membership changes and effect pass rebuilds; part of `sizeSignature()`. */
  private revision = 0;
  /** Set by `reconcileMembership` until its microtask runs the full `reconcile()`. */
  private membershipCommitPending = false;
  /** `sizeSignature()` last reconciled by the renderer; an unchanged signature only needs a redraw. */
  private admittedSize = "";
  // Admission bookkeeping reported by `state().admission`. No automatic retry runs in the current core, so
  // `readmissionPending` stays false and `automaticAttempts` stays 0; `admissionEpoch` lets `enable()`
  // ignore a result that a later `enable`/`disable`/`dispose` superseded.
  private admissionIntent: "disabled" | "enabled" | "blocked" = "disabled";
  private readmissionPending = false;
  private admissionEpoch = 0;
  private automaticAttempts = 0;
  private admissionReason = "Explicit enable required";
  /** The adapter-owned `app-container`; root-relative layer geometry is measured against it. */
  private rootContainer: HTMLElement | undefined;
  /** Removes the current device-pixel-ratio media-query listener (see `watchDPR`). */
  private releaseDPR: (() => void) | undefined;
  /** Per-layer leases for the `!important` neutral transform/opacity/origin written while GPU presents. */
  private readonly gpuDeclarations = new Map<string, DeclarationOwnership>();
  /**
   * Presentation properties an application rewrote while the runtime owned them. DOM presentation leaves
   * those untouched until the controller supplies a new transform; reported as `presentationOverrides`.
   */
  private readonly relinquishedDeclarations = new Map<string, ReturnType<DeclarationOwnership["restore"]>>();
  /**
   * Animation ownership per layer (`ownAnimation`, `ownCSSAnimation`, `ownCompiledAnimation`). `base` is the
   * transform restored when ownership ends; `check`/`restore`/`resources` come from CSS provenance and
   * `compiled` selects a build-generated program.
   */
  private readonly ownership = new Map<string, { lease: ReturnType<typeof prepareAnimation>; base: Transform; compiled?: CompiledAnimation; check?(): void; restore?(): void; resources?(): number }>();
  /** Managed native sources created by `createMotion`, whether or not they are currently owned. */
  private readonly motions = new Map<string, { source: Animation; handle: MotionHandle }>();
  /** Running declarative transitions (`transition`/`transitionGroup`), at most one per layer. */
  private readonly transitions = new Map<string, { finish(status: TransitionResult["status"], reason: string, transferred?: boolean): void; pause(): void; resume(): void; lease: DeclarationOwnership; start: number; end: number }>();
  /** Shared RAF clock for owned animation playback and effect time; `clockTime` is the last tick's timestamp. */
  private clockFrame = 0;
  private clockTime: number | undefined;
  /** Active effect chain per layer: decorative (`setEffects`/`setRipple`) or a transition effect on an interactive layer. */
  private readonly effects = new Map<string, { values: EffectDescriptor[]; transition: boolean; finish(result: EffectResult): void }>();
  /** Persistent material per layer (`setMaterial`), kept across DOM and GPU presentation. */
  private readonly materials = new Map<string, { value: MaterialDescriptor; finish(result: EffectResult): void }>();
  /** Last React-supplied transform per Surface, and one supplied while motion owned the layer. */
  private readonly reactTransforms = new Map<string, Transform>();
  private readonly deferredTransforms = new Map<string, Transform>();
  /** Set while a `requestReconcile` microtask is pending. */
  private reconcileQueued = false;
  /** Environment inputs mirrored from listeners; reported as `state().environment`. */
  private readonly environment = { visible: !document.hidden, reducedMotion: this.reduced.matches, forcedColors: this.forced.matches };
  /** Ledger of runtime-owned observers, listeners, frames and owners; reported as `state().runtimeResources`. */
  private readonly resources = { mutationObservers: 1, resizeObservers: 1, environmentListeners: 0, controllerFrames: 0, visibilityWaiters: 0, enrolledLayers: 0, animationOwners: 0, decorativeEffects: 0, transitionEffects: 0, materials: 0, nativeMotions: 0, declarativeMotions: 0, readmissionFrames: 0 };

  /**
   * Validates options, creates the renderer (which validates the hosts and calls `options.mount`
   * synchronously, starting in ordinary DOM) and installs observers and listeners. Throws before mounting
   * on invalid options; GPU stays off until `enable()`.
   */
  constructor(private readonly options: RuntimeOptions) {
    if (options.admissionPolicy !== undefined && options.admissionPolicy !== "explicit" && options.admissionPolicy !== "automatic") {
      throw new Error("Admission policy must be explicit or automatic");
    }
    if (options.overlayHost && (!options.overlayHost.isConnected
      || options.overlayHost.ownerDocument !== options.ordinaryHost.ownerDocument
      || options.overlayHost.parentElement !== options.ordinaryHost.parentElement
      || [options.captureHost, options.outputCanvas, options.ordinaryHost].includes(options.overlayHost)
      || options.overlayHost.childNodes.length)) throw new Error("Overlay must be an empty connected adapter-owned sibling outside the root");
    const budget = options.budgets;
    if (options.compiled) validateCompiledPrograms(options.compiled);
    if (budget && (!Number.isInteger(budget.layers) || budget.layers < 1 || budget.layers > MAX_LAYERS
      || !Number.isInteger(budget.pixels) || budget.pixels < 1)) throw new Error(`Invalid layer/pixel budgets; layer limit is 1..${MAX_LAYERS}`);
    // Root mutations dirty the containing layers' captures and invalidate cached structural policy. The
    // observer is also pointed at external ancestors' style/class later (see `refreshViewportGeometry`).
    this.mutation = new MutationObserver(records => {
      if (this.stopped) return;
      // A record that changed nothing (the same value written again) costs no capture, policy refresh or reconcile.
      const changed: MutationRecord[] = [];
      for (const record of records) {
        if (isNoOpMutation(record)) this.core?.ignoreMutation(record.target);
        else changed.push(record);
      }
      if (!changed.length) return;
      this.markCanvases();
      this.invalidatePolicy();
      for (const record of changed) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target && this.rootContainer?.contains(target)) this.core?.invalidate(target);
      }
      this.requestReconcile();
      this.checkPolicy();
    });
    // Observes the frame, every layer, the layers' ancestors up to the root and the output canvas's ancestors.
    this.resize = new ResizeObserver(() => {
      if (this.stopped || !this.core) return;
      this.invalidatePolicy();
      // A non-default origin is a fraction of the layer size; ordinary DOM bakes it
      // into the CSS matrix, so a resize must rewrite that matrix.
      if (this.core.phase() !== "gpu" && this.core.phase() !== "admitting"
        && [...this.registry.values()].some(layer => layer.origin && layer.origin !== "top-left")) this.presentation("dom");
      this.reconcile();
      this.checkPolicy();
    });
    try {
      // The renderer pulls everything it needs from these callbacks, so the registry stays the single
      // source of layers, size and policy. `mount` runs inside this call, before `this.core` is assigned:
      // layers registered by the first commit present as DOM until `enable()`.
      this.core = createSurfaceRenderer({
        ...options,
        mount: container => {
          this.rootContainer = container;
          Object.assign(container.style, { position: "relative", width: "100%", height: "100%" });
          return options.mount(container, this);
        },
        layers: () => this.ordered().map(layer => ({
          id: layer.id, element: layer.element,
          matrix: () => new DOMMatrix(Array.from(this.matrix(layer))),
          clip: matrix => this.viewportClip(layer, matrix),
          opacity: () => layer.transform.opacity ?? 1,
          effects: () => this.effects.get(layer.id)?.values ?? [],
          effectsEnabled: () => !this.reduced.matches,
          material: () => this.materials.get(layer.id)?.value,
          // Selects the build-generated program and its phase when a compiled CSS animation owns the layer.
          compiledMotion: () => {
            const owner = this.ownership.get(layer.id);
            return owner?.compiled ? { index: options.compiled!.animations.indexOf(owner.compiled),
              phase: owner.compiled.normalizeTime(owner.lease.playback.state().milliseconds), origin: this.origin(layer) } : undefined;
          },
        })),
        size: () => this.size(),
        nativeOrigin: () => this.ownerContentOrigin,
        policy: () => this.policy(),
        // Called by the renderer when it moves the root: to the output canvas at admission ("gpu") and back
        // on recovery, disable or disposal ("dom"). DOM recovery also hands owned animations back.
        presentation: mode => {
          if (mode === "dom") this.cancelTransitions("DOM recovery");
          this.cancelMotion();
          this.presentation(mode, true);
          if (mode === "gpu") this.admittedSize = this.sizeSignature();
        },
        isPaused: () => !this.environment.visible,
        isMoving: () => this.moving,
        onInterrupt: () => this.cancelMotion(),
        onRecovery: reason => this.recovered(reason),
      });
    } catch (error) {
      this.mutation.disconnect();
      this.resize.disconnect();
      this.resources.mutationObservers = this.resources.resizeObservers = 0;
      throw error;
    }
    this.mutation.observe(this.core.container, { subtree: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true, childList: true });
    // The hosts' shared parent is the frame whose client size is the output size (see `size()`).
    this.resize.observe(options.ordinaryHost.parentElement!);
    for (const layer of this.registry.values()) this.resize.observe(layer.element);
    // Hiding pauses scheduling and motion without revoking GPU; showing resumes it and refreshes captures.
    this.listen(document, "visibilitychange", () => {
      this.environment.visible = !document.hidden;
      if (!this.environment.visible) this.cancelReadmissionFrame();
      if (!this.environment.visible && this.drawFrame) {
        cancelAnimationFrame(this.drawFrame);
        this.drawFrame = 0;
        this.resources.controllerFrames--;
      }
      if (!this.environment.visible) this.core?.pause();
      if (!this.environment.visible) this.stopClock();
      // Hidden documents pause declarative motion; returning resumes it from the same progress.
      if (!this.environment.visible) for (const transition of this.transitions.values()) transition.pause();
      if (this.environment.visible) {
        for (const waiter of this.visibilityWaiters) waiter.resolve();
        this.visibilityWaiters.clear();
        this.resources.visibilityWaiters = 0;
        this.invalidatePolicy();
        this.core?.resume();
        for (const transition of [...this.transitions.values()]) transition.resume();
        this.requestDraw();
        this.startClock();
        this.scheduleReadmission();
      }
    });
    // Reduced motion keeps GPU: controller motion stops, transitions jump to their end state, and owned
    // playback and effect time pause.
    this.listen(this.reduced, "change", () => {
      this.environment.reducedMotion = this.reduced.matches;
      if (this.reduced.matches) this.cancelReadmissionFrame();
      if (this.reduced.matches) this.cancelMotion();
      if (this.reduced.matches) for (const transition of [...this.transitions.values()]) {
        try { transition.finish("completed", "Reduced motion"); }
        catch (error) { transition.finish("cancelled", String(error)); this.recover(`Reduced-motion completion failed: ${String(error)}`); }
      }
      if (this.reduced.matches) {
        for (const owner of this.ownership.values()) owner.lease.playback.pause();
        for (const effect of this.effects.values()) for (const value of effect.values) value.time.playing = false;
      }
      this.requestDraw();
      this.scheduleReadmission();
    });
    // Forced colors changes painted content only, so every layer is recaptured.
    this.listen(this.forced, "change", () => {
      this.environment.forcedColors = this.forced.matches;
      this.core?.invalidate();
      this.requestDraw();
    });
    this.listen(window, "resize", () => {
      this.invalidatePolicy();
      this.reconcile();
    });
    // Structural policy is cached; these events can change its inputs without a DOM mutation.
    for (const type of ["animationstart", "animationcancel", "animationend", "transitionrun", "transitioncancel", "transitionend", "input", "focusin", "focusout"]) {
      this.listen(this.core.container, type, () => this.invalidatePolicy(), true);
    }
    // Scroll does not bubble, so both listeners capture.
    this.listen(this.core.container, "scroll", event => { this.invalidatePolicy(); this.nativeScroll(event); }, true);
    // Document and external ancestor scrolling move the owner canvas and root together, so only the cached
    // owner-local projection is refreshed; captures and motion are left alone.
    this.listen(document, "scroll", event => {
      this.invalidatePolicy();
      const target = event.target;
      if (this.core?.phase() === "gpu" && (target === document
        || target === this.options.outputCanvas || target instanceof HTMLElement && this.externalAncestors.has(target))) {
        this.reconcileProjection();
      }
    }, true);
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
      this.listen(this.core.container, type, event => this.nativeComposition(event));
    }
    this.watchDPR();
    this.removers.push(() => this.releaseDPR?.());
  }

  /** The enrolled layer containing a native event's target, or undefined when it is outside every layer. */
  private nativeEventLayer(event: Event) {
    const target = event.target;
    if (!(target instanceof Element) || !target.isConnected || !this.core?.container.contains(target)) return;
    const layer = [...this.registry.values()].find(layer => layer.element.isConnected
      && layer.element.hasAttribute("drawable") && layer.element.contains(target));
    return layer ? { target, layer } : undefined;
  }
  /**
   * Native scroll inside the root while GPU presents or admits. Scrolling the root, an ancestor of a layer
   * or a layer itself moves layer geometry and clips, so it reconciles; scrolling inside a layer only needs a
   * fresh capture. Any other scroll target is outside the supported viewport contract and recovers to DOM.
   */
  private nativeScroll(event: Event) {
    if (this.stopped || this.core?.phase() !== "gpu" && this.core?.phase() !== "admitting") return;
    const source = this.nativeEventLayer(event);
    if (!source) {
      if (event.target === this.rootContainer || event.target instanceof HTMLElement
        && [...this.registry.values()].some(layer => event.target instanceof HTMLElement && event.target.contains(layer.element))) {
        this.reconcile();
        this.core?.invalidate();
        return;
      }
      this.recover("Scroll target is outside the bounded adapter-owned viewport contract");
      return;
    }
    const kind = nativeScrollKind(source.target, source.layer.element);
    if (kind === "enrolled-viewport") {
      this.reconcile();
      this.core?.invalidate(source.target);
      return;
    }
    // A descendant viewport changes native contents/hits, not the enrolled boundary's transform.
    this.checkPolicy();
    this.core?.invalidate(source.target);
  }
  /**
   * IME composition keeps GPU only for an eligible input/textarea inside a layer, whose capture is refreshed;
   * composition anywhere else in the root recovers to DOM.
   */
  private nativeComposition(event: Event) {
    if (this.stopped || this.core?.phase() !== "gpu" && this.core?.phase() !== "admitting") return;
    const source = this.nativeEventLayer(event);
    if (!source || !nativeEditingControl(source.target)) {
      this.recover("Native composition target is outside the enrolled input/textarea editing contract");
      return;
    }
    this.checkPolicy();
    this.core?.invalidate(source.target);
  }
  /** The adapter-owned native overlay host, if one was supplied; `NativeOverlay` portals into it. */
  get overlayHost() { return this.options.overlayHost; }
  /** The stable adapter-owned container holding the React root; it moves between hosts, never remounts. */
  get container() { return this.renderer().container; }
  /** The renderer, or a throw while the mount callback is still running inside its creation. */
  private renderer() {
    if (!this.core) throw new Error("Runtime mount has not completed");
    return this.core;
  }
  /** Throws `Runtime is disposed` once disposal finished or the renderer reached its disposed phase. */
  private assertLive() { if (this.stopped || this.core?.phase() === "disposed") throw new Error("Runtime is disposed"); }
  /** Output frame size in CSS pixels plus the current DPR; the frame is the hosts' shared parent. */
  private size() {
    const frame = this.options.ordinaryHost.parentElement!;
    return { width: frame.clientWidth, height: frame.clientHeight, dpr: window.devicePixelRatio };
  }
  /**
   * Everything that requires a full renderer reconcile (new capture extents or passes) rather than a redraw:
   * frame size, DPR, registry revision and each layer's order, size and position.
   */
  private sizeSignature() {
    return JSON.stringify({ ...this.size(), revision: this.revision,
      layers: this.ordered().map(layer => [layer.id, layer.element.offsetWidth, layer.element.offsetHeight, this.origin(layer)]) });
  }
  /** Layers in DOM order, which is both GPU paint order and native hit order. */
  private ordered() {
    return [...this.registry.values()].sort((a, b) =>
      a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  }
  /**
   * Layer-to-canvas matrix for `transform` (default: the layer's current one),
   * pivoted around the layer's static origin. `placed: false` omits the laid-out
   * position, giving the CSS `transform` used by ordinary DOM presentation.
   */
  private matrix(layer: LayerDefinition, transform: Transform = layer.transform, placed = true) {
    const around = pivot(layer.origin, { width: layer.element.offsetWidth, height: layer.element.offsetHeight });
    return canonical(transform, placed ? this.origin(layer) : undefined, around);
  }
  /**
   * The layer's laid-out position in root (canvas content) coordinates, net of ancestor scroll offsets;
   * cached by `refreshViewportGeometry`, measured directly before the first refresh.
   */
  private origin(layer: LayerDefinition) {
    return this.viewportGeometry.get(layer.element)?.origin ?? scrollOrigin(layer.element, this.rootContainer!);
  }
  /** Ancestors of the output canvas, observed for style/class changes and matched against scroll targets. */
  private externalAncestors = new Set<HTMLElement>();
  /** Output canvas border plus padding offset; native geometry is registered relative to its border box. */
  private ownerContentOrigin = { x: 0, y: 0 };
  /** Output canvas content-box size, compared with the frame by `canvasBoundsFrame`. */
  private ownerContentSize = { width: 0, height: 0 };
  /** Re-measures cached viewport geometry and redraws after document or external ancestor scrolling. */
  private reconcileProjection() {
    if (this.stopped || this.core?.phase() !== "gpu") return;
    try {
      this.refreshViewportGeometry();
      this.core.draw();
    } catch (error) {
      console.error("Underglass viewport projection failed", error);
      this.recover(`Native/GPU viewport projection failed: ${String(error)}`);
    }
  }
  /**
   * Per-layer cached geometry in root coordinates: `origin` and `extent` of the layer, `clip` intersected
   * from clipping ancestors, `own` for the layer's own overflow clip (layer-local), whether its content
   * overflows, and an `error` when an ancestor chain is outside the supported viewport contract.
   */
  private viewportGeometry = new WeakMap<HTMLElement, { origin: { x: number; y: number }; extent: { width: number; height: number }; clip?: ViewportRect; own?: ViewportRect; overflowing?: boolean; error?: string }>();
  /** Elements resize-observed as ancestors of a layer, or as the output canvas and its ancestors. */
  private viewportAncestors = new Set<HTMLElement>();
  /**
   * Recomputes `viewportGeometry`, the output canvas content box and the observed ancestor sets. It does
   * not throw for unsupported ancestor chains; it records them as errors that `viewportClip` throws later.
   */
  private refreshViewportGeometry() {
    const ancestors = new Set<HTMLElement>();
    const external = new Set<HTMLElement>();
    const owner = this.options.outputCanvas;
    const ownerStyle = getComputedStyle(owner);
    this.ownerContentOrigin = canvasContentOrigin(owner, ownerStyle);
    this.ownerContentSize = { width: owner.clientWidth - parseFloat(ownerStyle.paddingLeft) - parseFloat(ownerStyle.paddingRight),
      height: owner.clientHeight - parseFloat(ownerStyle.paddingTop) - parseFloat(ownerStyle.paddingBottom) };
    let externalError: string | undefined;
    // Overflow on the root element, and the body's when it propagates, applies to the viewport,
    // which always clips; it is no clip of an ancestor box. Modal scroll locks set it on one axis.
    const root = owner.ownerDocument.documentElement, rootStyle = getComputedStyle(root);
    const viewportOverflow = (node: HTMLElement) => node === root
      || node === owner.ownerDocument.body && rootStyle.overflowX === "visible" && rootStyle.overflowY === "visible";
    // The output canvas and its ancestors up to the document. The browser moves and clips the canvas with
    // its root together, so these only need to stay untransformed, LTR, unzoomed and rectangular.
    for (let node: HTMLElement | null = owner; node; node = node.parentElement) {
      ancestors.add(node);
      if (node !== owner) external.add(node);
      const style = getComputedStyle(node);
      if (style.transform !== "none" || style.rotate !== "none" || style.scale !== "none" || style.translate !== "none") {
        externalError = "Transformed external viewport ancestors are outside the axis-aligned framework contract";
      }
      if (style.direction !== "ltr" || style.writingMode !== "horizontal-tb" || Number(style.zoom) !== 1) {
        externalError = "RTL, writing mode or zoom is outside the bounded external viewport contract";
      }
      if (!viewportOverflow(node) && (style.overflowX === "visible") !== (style.overflowY === "visible")) {
        externalError = "Single-axis visible/clip external overflow is outside the bounded rectangular viewport contract";
      }
    }
    if ([...external].some(node => !this.externalAncestors.has(node))
      || [...this.externalAncestors].some(node => !external.has(node))) {
      // MutationObserver has no per-target unobserve: re-observe the root plus the new external chain.
      this.mutation.disconnect();
      this.mutation.observe(this.core!.container, { subtree: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true, childList: true });
      for (const node of external) this.mutation.observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ["style", "class"] });
      this.mutation.observe(owner, { attributes: true, attributeOldValue: true, attributeFilter: ["style", "class"] });
    }
    this.externalAncestors = external;
    for (const layer of this.registry.values()) {
      const origin = scrollOrigin(layer.element, this.rootContainer!);
      let clip: ViewportRect | undefined, own: ViewportRect | undefined, overflowing = false, error = externalError;
      for (let node: HTMLElement | null = layer.element; node; node = node.parentElement) {
        if (node !== layer.element) ancestors.add(node);
        const style = getComputedStyle(node);
        if ((style.overflowX === "visible") !== (style.overflowY === "visible")) {
          error = "Single-axis visible/clip overflow is outside the bounded rectangular viewport contract";
        }
        if (node !== layer.element && (style.transform !== "none" || style.rotate !== "none" || style.scale !== "none" || style.translate !== "none")) {
          error = "Transformed viewport ancestors are outside the axis-aligned framework contract";
        }
        if (style.overflowX !== "visible" || style.overflowY !== "visible") {
          const at = node === layer.element ? origin : node === this.rootContainer
            ? { x: 0, y: 0 } : scrollOrigin(node, this.rootContainer!);
          const rect = { x: at.x + node.clientLeft, y: at.y + node.clientTop,
            width: node.clientWidth, height: node.clientHeight };
          if (node === layer.element) {
            own = { x: 0, y: 0, width: node.offsetWidth, height: node.offsetHeight };
            overflowing = node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight;
          }
          else clip = clip ? intersectViewport(clip, rect) : rect;
        }
        if (node === this.rootContainer) break;
      }
      this.viewportGeometry.set(layer.element, { origin, extent: { width: layer.element.offsetWidth, height: layer.element.offsetHeight }, clip, own, overflowing, error });
    }
    for (const node of this.viewportAncestors) if (!ancestors.has(node)) this.resize.unobserve(node);
    for (const node of ancestors) if (!this.viewportAncestors.has(node)) this.resize.observe(node);
    this.viewportAncestors = ancestors;
  }
  /**
   * The clip the renderer applies to a layer, in layer-local coordinates, or undefined when no clip is needed
   * (fully inside the frame with no clipping ancestor, or a rotated layer with no own overflow clip). Throws the
   * geometry error recorded by `refreshViewportGeometry` for unsupported ancestor chains, which the policy check
   * turns into a recovery, and for rotated layers whose clipped content overflows.
   */
  private viewportClip(layer: LayerDefinition, matrix?: DOMMatrixReadOnly): ViewportRect | undefined {
    const geometry = this.viewportGeometry.get(layer.element);
    if (geometry?.error) throw new Error(geometry.error);
    let clip = geometry?.clip;
    const { width, height } = this.size();
    const frame = { x: 0, y: 0, width, height };
    const applied = matrix ?? new DOMMatrix(Array.from(this.matrix(layer)));
    if (!clip && !geometry?.own && geometry && viewportContains(applied, geometry.extent, frame)) return;
    // A rotated/skewed layer has no axis-aligned local frame clip. With no clipping
    // ancestor, the output canvas content box already bounds its GPU pixels and,
    // as proven at admission, its native hits, so only its own overflow clip remains.
    if (!clip && geometry && !axisAligned(applied) && this.canvasBoundsFrame()) {
      // A tilted layer has no rectangular clip at all (crbug.com/573454036, WICG html-in-canvas#186): only its own
      // box, uncut, has exact hits.
      if (!applied.is2D && geometry.own) throw new Error("Tilted layers with clipped content require a flat transform until projective canvasClip hit testing is fixed (WICG html-in-canvas#186)");
      // Chromium hit-tests a rotated canvasClip by its canvas-space bounding box (crbug.com/573454036), so a
      // clipped-away overflow would stay clickable; refuse rather than mismatch hits.
      if (geometry.own && geometry.overflowing) throw new Error("Rotated layers with clipped overflowing content require ordinary DOM");
      return geometry.own;
    }
    clip = clip ? intersectViewport(clip, frame) : frame;
    if (!applied.is2D) throw new Error("Tilted layers inside a clipping viewport require a flat transform until projective canvasClip hit testing is fixed (WICG html-in-canvas#186)");
    const local = localViewport(applied, clip);
    return geometry?.own ? intersectViewport(local, geometry.own) : local;
  }
  /** The canvas content box is the frame, and admission proved native hits stop at its edge. */
  private canvasBoundsFrame() {
    const { width, height } = this.size();
    return !!this.core?.frameBounded() && Math.abs(this.ownerContentSize.width - width) < 0.5
      && Math.abs(this.ownerContentSize.height - height) < 0.5;
  }
  /** GPU presentation owns the layer's transform/opacity/origin with important declarations. */
  private presentLayerGPU(layer: LayerDefinition) {
    let lease = this.gpuDeclarations.get(layer.id);
    if (!lease) {
      lease = this.ownership.get(layer.id)?.lease.presentation ?? new DeclarationOwnership(layer.element);
      this.gpuDeclarations.set(layer.id, lease);
    }
    lease.write("transform-origin", "0 0", "important");
    lease.write("transform", "none", "important");
    lease.write("opacity", "1", "important");
  }
  /**
   * Moves every layer's declarations to the given presentation. `"gpu"` writes the neutral important
   * declarations (the canvas draws the transform). `"dom"` releases those leases and writes the inline CSS
   * matrix and opacity, except for `preserveStyles` layers and animation-owned layers and for properties an
   * application rewrote meanwhile (`relinquishedDeclarations`). With `releaseOwnership` it also hands owned
   * animations back. Switching to `"dom"` always finishes all decorative effects, since ordinary DOM only shows
   * the original.
   */
  private presentation(mode: "dom" | "gpu", releaseOwnership = false) {
    this.invalidatePolicy();
    this.markCanvases(mode === "gpu");
    const restored = new Map<string, ReturnType<DeclarationOwnership["restore"]>>();
    const owned = new Set(this.ownership.keys());
    if (mode === "dom") {
      for (const [id, lease] of this.gpuDeclarations) {
        const lost = lease.restore();
        restored.set(id, lost);
        if (lost.size && this.registry.has(id)) this.relinquishedDeclarations.set(id, lost);
      }
      this.gpuDeclarations.clear();
      if (releaseOwnership) this.restoreOwnership();
    }
    for (const layer of this.registry.values()) {
      if (mode === "gpu") {
        this.presentLayerGPU(layer);
      } else if (layer.preserveStyles || owned.has(layer.id)) {
        continue;
      } else {
        const lost = restored.get(layer.id) ?? this.relinquishedDeclarations.get(layer.id);
        if (!lost?.has("transform-origin")) layer.element.style.setProperty("transform-origin", "0 0");
        if (!lost?.has("transform")) layer.element.style.setProperty("transform", cssMatrix(this.matrix(layer, layer.transform, false)));
        if (!lost?.has("opacity")) layer.element.style.setProperty("opacity", String(layer.transform.opacity ?? 1));
      }
    }
    if (mode === "dom") {
      for (const effect of [...this.effects.values()]) effect.finish(this.disposalRequested
        ? { status: "disposed", reason: "Runtime disposed" }
        : { status: "fallback", reason: "Ordinary DOM uses static original decoration" });
    }
  }
  /**
   * Presentation-contract check, called on every drawn frame. Ownership and
   * transform-dependent geometry are checked on every call; DOM/style-derived
   * structure is cached until a mutation, resize, scroll, animation, input or
   * membership event invalidates it, so steady GPU frames do not force style reads.
   */
  private policy(gpuGeometry = true): string | undefined {
    for (const layer of this.registry.values()) {
      try { const owner = this.ownership.get(layer.id); owner?.check?.(); owner?.lease.check(); this.transitions.get(layer.id)?.lease.check(); this.gpuDeclarations.get(layer.id)?.check(); }
      catch (error) { return `CSS ownership validation failed: ${String(error)}`; }
    }
    const phase = this.core?.phase();
    if (!this.structuralPolicy || this.structuralPolicy.phase !== phase) this.structuralPolicy = { phase, reason: this.structuralViolation() };
    if (this.structuralPolicy.reason) return this.structuralPolicy.reason;
    // GPU clip/extent geometry only constrains GPU presentation; ordinary DOM clips natively.
    if (!gpuGeometry) return undefined;
    const { width, height } = this.size();
    for (const layer of this.registry.values()) {
      const matrix = this.matrix(layer);
      let viewport: ViewportRect | undefined;
      try { viewport = this.viewportClip(layer); }
      catch (error) { return String(error); }
      const corners = [[0, 0], [layer.element.offsetWidth, 0], [0, layer.element.offsetHeight], [layer.element.offsetWidth, layer.element.offsetHeight]];
      let outside: boolean;
      try {
        outside = corners.some(([x, y]) => { const p = project(matrix, { x: x!, y: y! }); return p.x < 0 || p.y < 0 || p.x > width || p.y > height; });
      } catch (error) { return `${String(error)}: ${layer.id}`; }
      if (!viewport && !this.canvasBoundsFrame() && outside) return `Transformed layer requires unsupported outer clipping: ${layer.id}`;
      // A tilted layer needs browser-proven projective hit testing (admission's projective witnesses).
      if (tilted(layer.transform) && this.core?.phase() === "gpu" && !this.renderer().projectiveHits()) {
        return `Tilted layers require proven projective native hit testing: ${layer.id}`;
      }
    }
    return undefined;
  }
  /** Cached result of `structuralViolation()` for one renderer phase; cleared by `invalidatePolicy()`. */
  private structuralPolicy: { phase: string | undefined; reason: string | undefined } | undefined;
  /** Drops the cached structural policy so the next `policy()` call re-reads DOM and style. */
  private invalidatePolicy() { this.structuralPolicy = undefined; }
  /**
   * Style- and DOM-derived checks on every layer (editable/top-layer content, effects on non-decorative
   * content, competing animations, size, overflow, presentation declarations, stacking). Returns the first
   * violation as the diagnosed reason, or undefined. Expensive, so `policy()` caches it.
   */
  private structuralViolation(): string | undefined {
    const phase = this.core?.phase();
    const nativeBoundary = '[contenteditable]:not([contenteditable="false" i]), dialog, [popover]';
    const sources = new Set<Animation>([...this.motions.values()].map(motion => motion.source));
    for (const layer of this.registry.values()) {
      if (layer.element.isContentEditable || layer.element.matches(nativeBoundary) || layer.element.querySelector(nativeBoundary)) {
        return "Editable/top-layer boundaries require DOM or the explicit NativeOverlay boundary";
      }
      // Transition effects hold their layer's content inert themselves and end if it becomes interactive.
      const effect = this.effects.get(layer.id);
      if (effect && !effect.transition && !decorative(layer.element)) return `Effects are decorative/inert only: ${layer.id}; ordinary DOM required`;
      // Descendant animations repaint native content and are captured by the paint
      // event; only animations of the boundary's own GPU-owned presentation conflict.
      if (layer.element.getAnimations().some(animation => !sources.has(animation) && animatesPresentation(animation))) {
        return `Unowned/overlapping CSS/WAAPI animation requires explicit adapter: ${layer.id}`;
      }
      if (!layer.element.isConnected) return `Detached enrolled layer: ${layer.id}`;
      if (layer.layout.width === 0 || layer.layout.height === 0 || !layer.element.offsetWidth || !layer.element.offsetHeight) return `Zero-sized layer: ${layer.id}`;
      const style = getComputedStyle(layer.element);
      if ((layer.element.scrollWidth > layer.element.clientWidth || layer.element.scrollHeight > layer.element.clientHeight)
        && style.overflowX === "visible" && style.overflowY === "visible") {
        return `Content extends beyond enrolled capture bounds: ${layer.id}; ordinary DOM required`;
      }
      if (layer.preserveStyles && !this.ownership.has(layer.id) && !this.transitions.has(layer.id) && phase === "dom"
        && (style.transform !== "none" || style.opacity !== "1" || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none")) {
        return `Existing presentation needs explicit animation ownership or neutral styles: ${layer.id}`;
      }
      if ((phase === "gpu" || phase === "admitting")
        && (style.transform !== "none" || style.opacity !== "1" || style.transformOrigin !== "0px 0px"
          || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none")) {
        return `Exclusive GPU presentation declarations were changed: ${layer.id}; ordinary DOM required`;
      }
      if (style.zIndex !== "auto" && style.zIndex !== "0") {
        return "Custom stacking/clipping requires ordinary DOM";
      }
    }
    return undefined;
  }
  /** Canvases marked `content="drawable"` for capture, with the author's own `content` attribute (null: none) to give back. */
  private markedCanvases = new Map<HTMLCanvasElement, string | null>();
  /**
   * HTML-in-Canvas captures a nested `<canvas>` only when the canvas is itself `content="drawable"` (issue #184; otherwise it is the
   * layer background unless it is the first thing in its layer). While GPU presents (`active`, default: the phase is `gpu` or `admitting`)
   * every `<canvas>` inside an enrolled layer gets the mark, at admission and when one is added later; the author's value is
   * remembered and restored when GPU ends, or the canvas leaves every layer. The mark changes neither the canvas's layout, context,
   * bitmap, `toDataURL` nor hits (`tests/browser/core-canvas-content.test.mjs`).
   */
  private markCanvases(active = this.core?.phase() === "gpu" || this.core?.phase() === "admitting") {
    const live = new Set<HTMLCanvasElement>();
    if (active) {
      for (const layer of this.registry.values()) {
        for (const canvas of layer.element.querySelectorAll("canvas")) {
          live.add(canvas);
          if (!this.markedCanvases.has(canvas)) this.markedCanvases.set(canvas, canvas.getAttribute("content"));
          if (canvas.getAttribute("content") !== "drawable") canvas.setAttribute("content", "drawable");
        }
      }
    }
    for (const [canvas, original] of this.markedCanvases) {
      if (live.has(canvas)) continue;
      this.markedCanvases.delete(canvas);
      if (original === "drawable" || canvas.getAttribute("content") !== "drawable") continue;
      if (original === null) canvas.removeAttribute("content"); else canvas.setAttribute("content", original);
    }
  }
  /** Runs `policy()` and recovers to DOM with its reason when it reports a violation. Idle ordinary DOM is skipped. */
  private checkPolicy() {
    if (this.core?.phase() === "dom" && !this.ownership.size) return;
    const policy = this.policy();
    if (policy) this.recover(policy);
  }
  /** Clears the pending-readmission flag; no readmission frame is scheduled by the current core. */
  private cancelReadmissionFrame() {
    this.readmissionPending = false;
  }
  /**
   * Renderer callback after a diagnosed recovery. Under the `"automatic"` policy it records the reason and
   * marks admission blocked until an explicit `enable()`; otherwise it does nothing.
   */
  private recovered(reason: string) {
    if (this.options.admissionPolicy !== "automatic" || this.admissionIntent !== "enabled"
      || this.stopped || this.disposalRequested) return;
    this.admissionReason = reason;
    this.admissionIntent = "blocked";
    this.readmissionPending = false;
    this.cancelReadmissionFrame();
  }
  private scheduleReadmission() {
    // Kept as a lifecycle compatibility hook: healthy updates reconcile in the
    // existing engine; diagnosed failures always require explicit reentry.
  }
  /** Starts a diagnosed fallback to ordinary DOM without awaiting it; a failing recovery is logged and reported. */
  private recover(reason: string) {
    if (this.stopped || !this.core) return;
    void this.core.recover(reason).catch(error => {
      console.error("Underglass recovery failed", error);
      this.options.onStatus?.(`Underglass recovery failed: ${String(error)}`);
    });
  }
  /** Adds a listener and registers its removal for `dispose()`, keeping the resource ledger in step. */
  private listen(target: EventTarget, name: string, callback: EventListener, capture = false) {
    target.addEventListener(name, callback, capture);
    this.resources.environmentListeners++;
    this.removers.push(() => {
      target.removeEventListener(name, callback, capture);
      this.resources.environmentListeners--;
    });
  }
  /**
   * A `resolution` media query only matches one exact DPR, so each change reconciles and re-arms the watch
   * for the new value.
   */
  private watchDPR() {
    this.releaseDPR?.();
    const query = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const listener = () => {
      this.reconcile();
      this.watchDPR();
    };
    query.addEventListener("change", listener);
    this.resources.environmentListeners++;
    this.releaseDPR = () => {
      query.removeEventListener("change", listener);
      this.resources.environmentListeners--;
    };
  }
  /**
   * Adds a layer to the registry and returns an idempotent release. Throws if the runtime is disposed, the
   * transform/origin is invalid, the element is not connected inside the persistent root, the id is empty or
   * duplicate, or a `preserveStyles` element is not a direct root child. Release cancels the layer's
   * transition, effects and animation ownership and restores its declarations.
   */
  register(definition: LayerDefinition): () => void {
    this.assertLive();
    this.matrix(definition);
    if (!definition.element.isConnected || !this.rootContainer?.contains(definition.element)
      || definition.element.ownerDocument !== this.options.ordinaryHost.ownerDocument) {
      throw new Error("Surface must belong to the connected persistent root");
    }
    if (!definition.id || this.registry.has(definition.id)) throw new Error(`Duplicate/empty Surface id: ${definition.id}`);
    if (definition.preserveStyles && definition.element.parentElement !== this.rootContainer) throw new Error("Trusted existing-CSS enrollment must be a direct persistent-root child");
    this.registry.set(definition.id, definition);
    this.reactTransforms.set(definition.id, { ...definition.transform });
    this.invalidatePolicy();
    this.resources.enrolledLayers++;
    this.revision++;
    this.resize.observe(definition.element);
    this.presentation(this.core?.phase() === "gpu" || this.core?.phase() === "admitting" ? "gpu" : "dom");
    this.reconcileMembership();
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.transitions.get(definition.id)?.finish("cancelled", "Unenrolled");
      this.gpuDeclarations.get(definition.id)?.restore();
      this.gpuDeclarations.delete(definition.id);
      this.effects.get(definition.id)?.finish({ status: "disposed", reason: "Enrollment released" });
      this.materials.get(definition.id)?.finish({ status: "disposed", reason: "Enrollment released" });
      const owned = this.ownership.get(definition.id);
      if (owned) {
        owned.restore?.();
        owned.lease.restore();
        this.ownership.delete(definition.id);
        this.resources.animationOwners--;
      }
      this.resize.unobserve(definition.element);
      this.registry.delete(definition.id);
      this.invalidatePolicy();
      this.deferredTransforms.delete(definition.id);
      this.reactTransforms.delete(definition.id);
      this.relinquishedDeclarations.delete(definition.id);
      this.cancelNativeMotion(definition.id);
      this.resources.enrolledLayers--;
      this.revision++;
      this.reconcileMembership();
    };
  }
  /**
   * Ref-based enrollment of an original direct-root element (see `useSurfaceRef`): validates it, marks it
   * `drawable` for capture and registers it with `preserveStyles`. Throws `EnrollmentError` with a specific code
   * on failure. The returned release is idempotent and restores the element's previous `drawable` attribute.
   */
  enroll(element: HTMLElement, options: EnrollmentOptions): () => void {
    this.assertLive();
    if (typeof options.id !== "string" || !options.id.trim() || this.registry.has(options.id)) throw new EnrollmentError("invalid-id", `Duplicate/empty enrollment id: ${options.id}`);
    if (!(element instanceof HTMLElement) || !element.isConnected || element.ownerDocument !== this.options.ordinaryHost.ownerDocument || !this.rootContainer?.contains(element)) {
      throw new EnrollmentError("foreign-element", "Enrollment requires an original connected persistent-root element");
    }
    if ([...this.registry.values()].some(layer => layer.element === element)) throw new EnrollmentError("duplicate-element", "Element is already enrolled");
    if (element.parentElement !== this.rootContainer || [...this.registry.values()].some(layer => layer.element.contains(element) || element.contains(layer.element))) {
      throw new EnrollmentError("nested-element", "Ref enrollment requires a direct root child without nested enrolled elements");
    }
    if (options.decorative && !decorative(element)) throw new EnrollmentError("decorative-element", "Decorative enrollment requires authored inert, aria-hidden noninteractive content");
    const drawable = element.getAttribute("drawable");
    element.setAttribute("drawable", "");
    let release: () => void;
    try { release = this.register({ ...options, element, layout: {}, transform: {}, preserveStyles: true }); }
    catch (error) {
      if (drawable === null) element.removeAttribute("drawable"); else element.setAttribute("drawable", drawable);
      throw error;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      release();
      if (element.getAttribute("drawable") === "") {
        if (drawable === null) element.removeAttribute("drawable");
        else element.setAttribute("drawable", drawable);
      }
    };
  }
  /**
   * React-driven layout/transform update. While declarative motion or animation
   * ownership drives the transform, the React value becomes the resting
   * transform applied when that motion ends, instead of throwing inside a commit.
   */
  update(id: string, layout: Layout, transform: Transform) {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    this.matrix(layer, transform);
    const owner = this.ownership.get(id);
    const supplied = JSON.stringify(transform) !== JSON.stringify(this.reactTransforms.get(id) ?? {});
    this.reactTransforms.set(id, { ...transform });
    if (this.transitions.has(id)) { if (supplied) this.deferredTransforms.set(id, { ...transform }); }
    else if (owner) { if (supplied) owner.base = { ...transform }; }
    else {
      if (JSON.stringify(layer.transform) !== JSON.stringify(transform)) this.relinquishedDeclarations.delete(id);
      layer.transform = { ...transform };
    }
    layer.layout = layout;
    this.invalidatePolicy();
    this.reconcile();
    this.checkPolicy();
    if (this.core?.phase() !== "gpu" && this.core?.phase() !== "admitting") this.presentation("dom");
    this.core?.invalidate(layer.element);
    this.requestDraw();
  }
  /**
   * Controller call that replaces a layer's transform. Throws for an unknown layer, an invalid transform or a
   * layer owned by an animation or transition. In GPU mode it reconciles geometry; otherwise it rewrites the
   * DOM presentation.
   */
  setTransform(id: string, transform: Transform) {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    if (this.ownership.has(id) || this.transitions.has(id)) throw new Error("Transform is animation-owned; release or cancel first");
    this.matrix(layer, transform);
    if (tilted(transform) && this.core?.phase() === "gpu" && !this.renderer().projectiveHits()) {
      throw new Error("Tilt requires proven projective native hit testing on this browser; the layer keeps its transform");
    }
    this.relinquishedDeclarations.delete(id);
    layer.transform = { ...transform };
    this.checkPolicy();
    this.presentTransform();
  }
  /**
   * Presents a changed transform or origin. During admission the GPU already owns the
   * declarations and per-frame geometry updates would keep the native refresh from
   * settling, so only the value is recorded; admission draws the latest one, as it does
   * for declarative motion.
   */
  private presentTransform() {
    const phase = this.core?.phase();
    if (phase === "admitting") return;
    if (phase !== "gpu") this.presentation("dom");
    else this.reconcile();
  }
  /**
   * Changes the layer's static rotation/scale pivot. Applies immediately, also to a
   * running transition; animation-owned layers keep the source's top-left origin.
   */
  setOrigin(id: string, origin: TransformOrigin | undefined) {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    pivot(origin, { width: 1, height: 1 });
    if (JSON.stringify(origin ?? "top-left") === JSON.stringify(layer.origin ?? "top-left")) return;
    if (this.ownership.has(id) && origin !== undefined && origin !== "top-left") {
      throw new Error("Animation ownership uses the source animation's top-left origin; release it first");
    }
    layer.origin = typeof origin === "object" ? { x: origin.x, y: origin.y } : origin;
    this.matrix(layer);
    this.invalidatePolicy();
    this.checkPolicy();
    this.presentTransform();
  }
  /**
   * Schedules one coalesced RAF `draw()` while GPU presents and the document is visible. After a draw that carried a light
   * written with `setEmitters`, one more frame is asked for at once (a lead frame, which draws only if another light was
   * written by then): a writer that asks for its own next frame before writing (the usual idiom) would otherwise run
   * ahead of core's request in every frame, and core would draw every other frame. The lead frame keeps core's callback
   * after the writer's in each frame, so a light moved every frame is drawn every frame, in the frame it was written.
   */
  private requestDraw(lead = false) {
    // A request made while the lead frame is pending is folded into it, which then draws.
    if (!lead) this.drawWanted = true;
    if (this.stopped || this.drawFrame || !this.environment.visible || this.core?.phase() !== "gpu") return;
    this.resources.controllerFrames++;
    this.drawFrame = requestAnimationFrame(() => {
      this.drawFrame = 0;
      this.resources.controllerFrames--;
      if (lead && !this.lightWritten && !this.drawWanted) return;
      const written = this.lightWritten;
      this.lightWritten = false;
      this.drawWanted = false;
      try { this.core?.draw(); } catch (error) { this.recover(`Geometry/draw failure: ${String(error)}`); return; }
      if (written) this.requestDraw(true);
    });
  }
  /**
   * Coalesces reconciliation requests from one React commit (host, every Surface
   * and every enrolled ref) into a single reconcile in a microtask, which still
   * runs before the browser renders or dispatches the next input event.
   */
  requestReconcile() {
    if (this.reconcileQueued || this.stopped) return;
    this.reconcileQueued = true;
    queueMicrotask(() => {
      this.reconcileQueued = false;
      this.reconcile();
    });
  }
  /**
   * Applies registry, layout and transform changes while GPU presents or admits; does nothing in DOM. An
   * unchanged size signature only needs a draw, a changed one a full renderer reconcile. Errors recover to DOM.
   */
  reconcile() {
    if (this.stopped || !this.core || this.core.phase() !== "gpu" && this.core.phase() !== "admitting") return;
    try {
      this.refreshViewportGeometry();
      this.presentation("gpu");
      if (this.core.phase() === "admitting") { this.core.reconcileGeometry(); return; }
      if (this.membershipCommitPending) { this.core.reconcileGeometry(); return; }
      const signature = this.sizeSignature();
      if (signature === this.admittedSize) { this.core.draw(); return; }
      this.admittedSize = signature;
      this.core.reconcile();
    }
    catch (error) { console.error("Underglass reconciliation failed", error); this.recover(`Native/GPU reconciliation failed: ${String(error)}`); }
  }
  /**
   * After a layer joins or leaves the GPU registry, updates geometry at once and defers the full `reconcile()`
   * to one microtask, so several membership changes in the same commit share it.
   */
  private reconcileMembership() {
    if (this.stopped || this.core?.phase() !== "gpu") return;
    this.refreshViewportGeometry();
    this.core.reconcileGeometry();
    if (this.membershipCommitPending) return;
    this.membershipCommitPending = true;
    queueMicrotask(() => {
      this.membershipCommitPending = false;
      this.reconcile();
    });
  }
  /**
   * Interrupts controller-driven motion: stops the shared clock and the pending draw frame, and rejects the
   * RAF or visibility wait that `animate`/`advance` is awaiting.
   */
  private cancelMotion() {
    this.stopClock();
    if (this.drawFrame) {
      cancelAnimationFrame(this.drawFrame);
      this.drawFrame = 0;
      this.resources.controllerFrames--;
    }
    if (this.motionFrame) {
      cancelAnimationFrame(this.motionFrame.id);
      this.motionFrame.reject(new Error("Motion interrupted by lifecycle/media policy"));
      this.motionFrame = undefined;
      this.resources.controllerFrames--;
    }
    for (const waiter of this.visibilityWaiters) waiter.reject(new Error("Motion interrupted while hidden"));
    this.visibilityWaiters.clear();
    this.resources.visibilityWaiters = 0;
  }
  /**
   * GPU-only motion toward `target`. A number steps a fixed count of displayed
   * frames (refresh-rate dependent; kept for deterministic measurement); prefer
   * `{ duration }` in milliseconds, which interpolates by elapsed time.
   */
  async animate(id: string, target: Transform, length: number | { duration: number } = 300) {
    this.assertLive();
    canonical(target);
    const duration = typeof length === "object" ? length.duration : undefined;
    if (duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || duration > 60000)) throw new Error("Motion duration requires (0, 60000] ms");
    // With `{ duration }` progress comes from elapsed time and the loop ends when it reaches 1; the frame count
    // then acts only as the 10000-frame ceiling that also bounds numeric lengths.
    const frames = typeof length === "number" ? length : 10000;
    if (!Number.isInteger(frames) || frames < 1 || frames > 10000) throw new Error("Motion requires 1..10000 frames");
    await this.settle();
    if (this.moving || this.renderer().phase() !== "gpu" || this.reduced.matches) throw new Error("Motion requires idle GPU mode and no reduced-motion preference");
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    if (this.ownership.has(id) || this.transitions.has(id)) throw new Error("Transform is animation-owned; release or cancel first");
    const start = { ...layer.transform };
    const version = this.renderer().version();
    const before = this.state();
    this.moving = true;
    let elapsed = 0, previous: number | undefined;
    try {
      for (let index = 1; index <= frames; index++) {
        if (!this.environment.visible) {
          await new Promise<void>((resolve, reject) => {
            this.visibilityWaiters.add({ resolve, reject });
            this.resources.visibilityWaiters++;
          });
          previous = undefined;
        }
        // Re-armed every iteration; `motionFrame` lets `cancelMotion` reject this wait.
        const now = await new Promise<number>((resolve, reject) => {
          this.resources.controllerFrames++;
          const frame = requestAnimationFrame(time => {
            this.motionFrame = undefined;
            this.resources.controllerFrames--;
            resolve(time);
          });
          this.motionFrame = { id: frame, reject };
        });
        if (!this.environment.visible) { index--; continue; }
        if (this.renderer().phase() !== "gpu" || version !== this.renderer().version() || this.reduced.matches) throw new Error("Motion interrupted by renderer/media generation");
        // Hidden time is excluded: elapsed only advances between consecutive visible frames.
        if (previous !== undefined) elapsed += Math.min(100, now - previous);
        previous = now;
        const progress = duration === undefined ? index / frames : Math.min(1, elapsed / duration);
        const next = { ...start };
        for (const key of ["x", "y", "scaleX", "scaleY", "rotation", "opacity", "tiltX", "tiltY", "perspective"] as const) {
          if (target[key] !== undefined) {
            const from = start[key] ?? (key === "scaleX" || key === "scaleY" || key === "opacity" ? 1 : key === "perspective" ? DEFAULT_PERSPECTIVE : 0);
            next[key] = from + (target[key]! - from) * progress;
          }
        }
        canonical(next);
        layer.transform = next;
        const policy = this.policy();
        if (policy) { await this.renderer().recover(policy); throw new Error(policy); }
        this.renderer().draw();
        if (progress >= 1) break;
      }
    } finally { this.moving = false; this.scheduleReadmission(); }
    return { before, after: this.state() };
  }
  /**
   * Requests GPU admission and resolves with `state()`. Always a fresh, explicit admission: it re-measures
   * geometry, cancels transitions and invalidates cached policy first. A result superseded by a later
   * `enable`/`disable`/`dispose` is ignored; a refused admission records its reason in `state().admission`.
   */
  async enable() {
    this.assertLive();
    this.refreshViewportGeometry();
    this.invalidatePolicy();
    const epoch = ++this.admissionEpoch;
    this.admissionIntent = "enabled";
    this.readmissionPending = false;
    this.cancelReadmissionFrame();
    this.cancelTransitions("Fresh admission");
    this.admittedSize = this.sizeSignature();
    const result = await this.renderer().enable();
    if (epoch !== this.admissionEpoch) return this.state();
    if (result.mode === "gpu") { this.admittedSize = this.sizeSignature(); this.watchDPR(); }
    else if (!this.readmissionPending) { this.admissionIntent = "blocked"; this.admissionReason = result.reason; }
    this.scheduleReadmission();
    this.startClock();
    return this.state();
  }
  /** Caller-owned exit from GPU: cancels admission intent, transitions and motion, then recovers to ordinary DOM. */
  async disable() {
    this.admissionEpoch++;
    this.admissionIntent = "disabled";
    this.readmissionPending = false;
    this.admissionReason = "Explicit disable; fresh enable required";
    this.cancelReadmissionFrame();
    this.cancelTransitions("Disabled");
    this.cancelMotion();
    await this.renderer().disable();
    return this.state();
  }
  /**
   * Waits for already scheduled work: queued microtasks, the viewport projection, a pending controller draw
   * frame and then the renderer's own settle. It does not prevent later browser paints.
   */
  async settle() {
    await new Promise<void>(resolve => queueMicrotask(resolve));
    this.reconcileProjection();
    if (this.drawFrame) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    await this.renderer().settle();
  }
  /** Marks one layer (or all when `id` is omitted) for recapture. */
  invalidate(id?: string) { this.assertLive(); this.renderer().invalidate(id); }
  /**
   * Ends every animation ownership, returning each layer to its base transform. It restores all owners even
   * if some fail and then throws an `AggregateError` with the failures.
   */
  private restoreOwnership() {
    this.stopClock();
    const errors: unknown[] = [];
    for (const [id, owner] of this.ownership) {
      try { owner.restore?.(); } catch (error) { errors.push(error); }
      try { owner.lease.restore(); } catch (error) { errors.push(error); }
      const layer = this.registry.get(id);
      if (layer) {
        layer.transform = owner.base;
        const lost = owner.lease.presentation.restore();
        if (lost.size) this.relinquishedDeclarations.set(id, lost);
      }
    }
    this.ownership.clear();
    this.invalidatePolicy();
    this.resources.animationOwners = 0;
    for (const id of this.motions.keys()) if (!this.registry.has(id)) this.cancelNativeMotion(id);
    if (errors.length) throw new AggregateError(errors, "Animation ownership restoration failed");
  }
  /** Cancels and forgets the managed native animation `createMotion` made for a layer. */
  private cancelNativeMotion(id: string) {
    const motion = this.motions.get(id);
    if (!motion) return;
    motion.source.cancel();
    this.motions.delete(id);
    this.invalidatePolicy();
    this.resources.nativeMotions--;
  }
  /**
   * Creates a managed, paused WAAPI animation for a layer from typed numeric keyframes and returns its handle.
   * Only valid in idle ordinary DOM or active GPU, for a layer with no other animation source. Playback goes
   * to the native animation until `own()` hands it to the runtime for GPU presentation.
   */
  createMotion(id: string, descriptor: MotionDescriptor): MotionHandle {
    this.assertLive();
    const state = this.renderer().state();
    if (state.mode !== "dom" && state.mode !== "gpu" || state.initializing || state.transitioning || state.resources.pendingEngines
      || state.resources.pendingCleanups || state.resources.probeReadbacks) throw new Error("Create typed motion in idle ordinary DOM or active GPU");
    const layer = this.registry.get(id);
    if (!layer || this.motions.has(id) || this.ownership.has(id) || this.transitions.has(id) || layer.element.getAnimations({ subtree: true }).length) {
      throw new Error("Typed motion requires one enrolled layer without overlapping sources");
    }
    const compiled = compileMotion(descriptor);
    // Typed motion frames map one-to-one onto native keyframes; the animation stays paused until played or owned.
    const nativeFrames = compiled.frames.map(frame => ({
      offset: frame.offset, easing: frame.easing ?? "linear", transform: frame.transform, opacity: frame.opacity,
    }));
    const source = new Animation(new KeyframeEffect(layer.element, nativeFrames, compiled.timing), document.timeline);
    source.pause();
    source.currentTime = 0;
    const assertLive = () => {
      this.assertLive();
      if (this.motions.get(id)?.source !== source) throw new Error("Typed motion is disposed or unenrolled");
    };
    const owned = () => {
      const lease = this.ownership.get(id)?.lease;
      return lease?.source === source ? lease.playback : undefined;
    };
    const handle: MotionHandle = {
      nativeAnimation: source,
      own: () => { assertLive(); return owned() ?? this.ownAnimation(id, source); },
      play: () => { assertLive(); const playback = owned(); if (playback) playback.play(); else source.play(); },
      pause: () => { assertLive(); const playback = owned(); if (playback) playback.pause(); else source.pause(); },
      seek: time => {
        assertLive();
        compiled.timeline.sample(time);
        const playback = owned();
        if (playback) playback.seek(time); else source.currentTime = time;
      },
      release: async options => { await owned()?.release(options); },
      dispose: async () => {
        if (this.motions.get(id)?.source !== source) return;
        await owned()?.release();
        if (this.motions.get(id)?.source === source) this.cancelNativeMotion(id);
      },
      state: () => owned()?.state() ?? {
        milliseconds: Number(source.currentTime ?? 0), playing: source.playState === "running", released: true,
        sourceTime: source.currentTime, sourceState: source.playState,
        detached: source.effect instanceof KeyframeEffect && source.effect.target === null,
      },
    };
    this.motions.set(id, { source, handle });
    this.invalidatePolicy();
    this.resources.nativeMotions++;
    return handle;
  }
  /** Cancels every running declarative transition with the given reason. */
  private cancelTransitions(reason: string) {
    for (const transition of [...this.transitions.values()]) transition.finish("cancelled", reason);
  }
  /**
   * Validates a declarative transition without side effects and returns what `stageTransition` needs.
   * Throws when the renderer is busy, another owner competes for the layer, the descriptor is out of bounds
   * or authored CSS conflicts. A transition that replaces a running one restarts from the current transform.
   */
  private prepareTransition(id: string, descriptor: MotionDescriptor) {
    this.assertLive();
    const state = this.renderer().state();
    const layer = this.registry.get(id);
    if (!layer || state.initializing || state.transitioning || (state.resources.pendingCleanups && state.mode !== "gpu") || state.resources.probeReadbacks
      || this.moving || this.ownership.has(id) || this.motions.has(id) || layer.element.getAnimations().some(animatesPresentation)) {
      // Descendant animations only repaint native content; only boundary presentation animations compete.
      throw new Error("Declarative motion requires an idle enrolled boundary without competing animation owners");
    }
    // A replacing transition continues from the layer's current transform instead of jumping.
    const prior = this.transitions.get(id);
    const current = { ...layer.transform };
    // Validate the caller's descriptor itself, apart from the rewritten keyframes below.
    compileMotion(descriptor);
    const input = prior ? { ...descriptor, keyframes: [{ ...current, offset: 0 }, ...descriptor.keyframes.slice(1)] } : descriptor;
    const compiled = compileMotion(input);
    if (compiled.timeline.iterations !== 1 || compiled.timeline.direction !== "normal" || compiled.timeline.end > 60000) {
      throw new Error("Declarative transitions require one normal iteration and at most 60000ms including delay");
    }
    for (const frame of input.keyframes) this.matrix(layer, frame);
    if (state.mode === "dom") {
      rejectImportantPresentation(layer.element, true);
      const style = getComputedStyle(layer.element);
      if (style.translate !== "none" || style.rotate !== "none" || style.scale !== "none") {
        throw new Error("Declarative motion cannot compete with individual CSS transforms");
      }
    }
    this.gpuDeclarations.get(id)?.check();
    prior?.lease.check();
    return { layer, prior, compiled, base: current };
  }
  /** Runs a bounded declarative motion on one layer; the handle reports completion or cancellation. */
  transition(id: string, descriptor: MotionDescriptor): TransitionHandle {
    return this.startTransitions([{ id, prepared: this.prepareTransition(id, descriptor) }])[0]!;
  }
  /**
   * Starts 1..8 transitions on distinct layers sharing one start time, delaying item `n` by `n * stagger` ms. All items
   * are validated before any starts, so an invalid group leaves no side effects.
   */
  transitionGroup(items: readonly CoordinatedMotion[], stagger = 0): TransitionHandle[] {
    if (!Number.isFinite(stagger) || stagger < 0 || stagger > 1000 || items.length < 1 || items.length > 8
      || new Set(items.map(item => item.id)).size !== items.length) throw new Error("Coordinated motion requires 1..8 distinct ids and stagger in [0,1000]ms");
    const prepared = items.map((item, index) => this.prepareTransition(item.id, {
      ...item.motion, timing: { ...item.motion.timing, delay: (item.motion.timing.delay ?? 0) + index * stagger },
    }));
    return this.startTransitions(items.map((item, index) => ({ id: item.id, prepared: prepared[index]! })));
  }
  /**
   * Two-phase start: stage every transition, apply and validate the first frame of each, then commit them.
   * Any failure rolls all staged transitions back, which makes groups atomic.
   */
  private startTransitions(items: { id: string; prepared: ReturnType<CanvasRuntime["prepareTransition"]> }[]): TransitionHandle[] {
    const start = performance.now();
    const staged = items.map(({ id, prepared }) => this.stageTransition(id, prepared, start));
    try {
      for (const transition of staged) transition.prepare();
      for (const transition of staged) transition.validate();
    } catch (error) {
      for (const transition of staged) transition.rollback();
      throw error;
    }
    return staged.map(transition => transition.commit());
  }
  /**
   * Builds one transition's lifecycle (`prepare`, `validate`, `rollback`, `commit`) around a RAF loop that
   * samples the compiled timeline. In ordinary DOM it writes the CSS matrix and opacity itself and verifies
   * they were not overridden; in GPU mode it only updates the layer transform and requests a draw.
   */
  private stageTransition(id: string, { layer, prior, compiled, base }: ReturnType<CanvasRuntime["prepareTransition"]>, start: number) {
    const lease = new DeclarationOwnership(layer.element, prior?.lease);
    let frame = 0, done = false;
    let resolve!: (result: TransitionResult) => void;
    const finished = new Promise<TransitionResult>(complete => { resolve = complete; });
    const validate = (transform: Transform) => {
      lease.check();
      if (this.core?.phase() === "dom") {
        const style = getComputedStyle(layer.element);
        const expected = new DOMMatrix(Array.from(this.matrix(layer, transform, false))).toFloat64Array();
        const actual = new DOMMatrix(style.transform === "none" ? undefined : style.transform).toFloat64Array();
        if (style.transformOrigin !== "0px 0px" || style.translate !== "none" || style.rotate !== "none" || style.scale !== "none"
          || !actual.every((value, index) => Math.abs(value - expected[index]!) <= 1e-4 * Math.max(1, Math.abs(value)))
          || Math.abs(Number(style.opacity) - transform.opacity!) > 1e-4) {
          throw new Error("Declarative DOM presentation was overridden by authored CSS");
        }
      }
    };
    const sample = (time: number) => {
      lease.check();
      const transform = compiled.timeline.sample(time);
      if (this.core?.phase() === "dom") {
        lease.write("transform-origin", "0 0");
        lease.write("transform", cssMatrix(this.matrix(layer, transform, false)));
        lease.write("opacity", String(transform.opacity));
      }
      validate(transform);
      return transform;
    };
    const apply = (time: number) => { layer.transform = sample(time); this.requestDraw(); };
    const settleTransform = () => {
      // A transform React supplied during the motion becomes the resting state.
      const deferred = this.deferredTransforms.get(id);
      if (!deferred) return;
      this.deferredTransforms.delete(id);
      layer.transform = deferred;
      if (this.core?.phase() === "dom" && !layer.preserveStyles) this.presentation("dom");
    };
    const finish = (status: TransitionResult["status"], reason: string, transferred = false) => {
      if (done) return;
      if (status === "completed") apply(compiled.timeline.end);
      done = true;
      if (frame) { cancelAnimationFrame(frame); frame = 0; this.resources.controllerFrames--; }
      this.transitions.delete(id);
      this.invalidatePolicy();
      this.resources.declarativeMotions--;
      if (!transferred && (status === "cancelled" || layer.preserveStyles || this.core?.phase() !== "dom")) lease.restore();
      if (status === "cancelled" && !transferred) layer.transform = base;
      if (!transferred) settleTransform();
      this.requestDraw();
      resolve({ status, reason });
    };
    // Hiding the document pauses the transition; `resume` shifts `start` by the paused time so progress continues.
    let pausedAt: number | undefined;
    const pause = () => {
      if (done || pausedAt !== undefined) return;
      pausedAt = performance.now();
      if (frame) { cancelAnimationFrame(frame); frame = 0; this.resources.controllerFrames--; }
    };
    const resume = () => {
      if (done || pausedAt === undefined) return;
      start += performance.now() - pausedAt;
      pausedAt = undefined;
      const entry = this.transitions.get(id);
      if (entry) entry.start = start;
      if (!frame) schedule();
    };
    const tick = () => {
      frame = 0; this.resources.controllerFrames--;
      try {
        if (!this.environment.visible) { pause(); return; }
        const elapsed = performance.now() - start;
        apply(Math.min(elapsed, compiled.timeline.end));
        const policy = this.policy(this.core?.phase() !== "dom");
        if (policy) { finish("cancelled", policy); this.recover(policy); return; }
        if (elapsed >= compiled.timeline.end) finish("completed", "Finished");
        else schedule();
      } catch (error) {
        finish("cancelled", String(error));
        this.recover(`Declarative motion failed: ${String(error)}`);
      }
    };
    const schedule = () => { this.resources.controllerFrames++; frame = requestAnimationFrame(tick); };
    let initial: Transform;
    // Under reduced motion the transition jumps to its end state on commit instead of animating.
    const reduced = this.reduced.matches;
    return {
      prepare: () => { initial = sample(reduced ? compiled.timeline.end : 0); },
      validate: () => { validate(initial); },
      rollback: () => { lease.rollback(); },
      commit: (): TransitionHandle => {
        // `transferred`: the new transition inherits the prior one's declaration lease, so nothing is restored.
        prior?.finish("cancelled", "Replaced", true);
        layer.transform = initial;
        this.transitions.set(id, { finish, pause, resume, lease, start, end: compiled.timeline.end });
        this.invalidatePolicy();
        this.resources.declarativeMotions++;
        if (reduced) {
          done = true;
          this.transitions.delete(id);
          this.resources.declarativeMotions--;
          if (layer.preserveStyles || this.core?.phase() !== "dom") lease.restore();
          settleTransform();
          resolve({ status: "completed", reason: "Reduced motion" });
        } else if (this.environment.visible) schedule();
        else pausedAt = performance.now();
        this.requestDraw();
        return { finished, cancel: () => finish("cancelled", "Cancelled") };
      },
    };
  }
  /**
   * Takes ownership of a WAAPI animation on a layer so the runtime samples it for GPU presentation, and
   * returns its playback controls. CSS animations need `ownCSSAnimation` or `ownCompiledAnimation`.
   */
  ownAnimation(id: string, source: Animation): AnimationPlayback {
    if (source instanceof CSSAnimation) throw new Error("CSS animation requires explicit source-rule provenance");
    return this.acquireAnimation(id, source);
  }
  /** Owns a CSS animation whose stylesheet rule is identified by `provenance`; the source rule is validated and tracked. */
  ownCSSAnimation(id: string, provenance: CSSAnimationSource): AnimationPlayback {
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    const css = validateCSSSource(layer.element, provenance);
    return this.acquireAnimation(id, css.source, css.check, css.restore, css.resources);
  }
  /**
   * Owns the single matching running CSS animation as a build-generated program from `options.compiled`, which
   * the renderer evaluates on the GPU. Throws if the program or layer is unknown or the match is not exact.
   */
  ownCompiledAnimation(id: string, animationId: string): AnimationPlayback {
    const layer = this.registry.get(id);
    const compiled = this.options.compiled?.animations.find(animation => animation.id === animationId);
    if (!layer || !compiled) throw new Error("Unknown compiled animation or enrolled layer");
    const sources = layer.element.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName === compiled.name);
    if (sources.length !== 1) throw new Error("Compiled ownership requires exactly one active matching CSS animation");
    const source = sources[0]!;
    verifyCompiledAnimation(layer.element, source, compiled);
    return this.acquireAnimation(id, source, undefined, undefined, undefined, compiled);
  }
  /**
   * Shared ownership path for the `own*` methods: checks the renderer is idle and the layer is neutral and
   * unowned, acquires the animation lease and registers the owner. Works in ordinary DOM and in active GPU.
   */
  private acquireAnimation(id: string, source: Animation, check?: () => void, restore?: () => void, resources?: () => number, compiled?: CompiledAnimation): AnimationPlayback {
    this.assertLive();
    const state = this.renderer().state();
    if (state.mode !== "dom" && state.mode !== "gpu" || state.initializing || state.transitioning || state.resources.pendingEngines
      || state.resources.pendingCleanups || state.resources.probeReadbacks) {
      throw new Error("Prepare ownership in idle ordinary DOM or active GPU");
    }
    const live = state.mode === "gpu";
    const layer = this.registry.get(id);
    if (!layer || this.ownership.has(id) || this.transitions.has(id)) throw new Error("Unknown or already animation-owned layer");
    if (JSON.stringify(canonical(layer.transform)) !== JSON.stringify(canonical()) || (layer.transform.opacity ?? 1) !== 1) throw new Error("Animation requires neutral controller transform/opacity");
    if (layer.origin && layer.origin !== "top-left") throw new Error("Animation ownership uses the source animation's top-left origin; remove the layer origin first");
    const base = { ...layer.transform };
    // GPU presentation hides the source behind important declarations. Lift them for
    // the synchronous verification below: no rendering opportunity occurs before
    // presentLayerGPU writes them again, so nothing visible changes.
    if (live) {
      const lost = this.gpuDeclarations.get(id)?.restore();
      this.gpuDeclarations.delete(id);
      if (lost?.size) { this.presentLayerGPU(layer); throw new Error("GPU presentation declarations were changed; ordinary DOM required"); }
    }
    let lease: ReturnType<typeof prepareAnimation>;
    try {
      lease = prepareAnimation(layer.element, source, {
      validate: transform => { this.matrix(layer, transform); },
      apply: transform => {
        check?.();
        layer.transform = transform;
        if (this.core?.phase() === "dom") {
          lease.presentation.write("transform", cssMatrix(canonical(transform)));
          lease.presentation.write("opacity", String(transform.opacity));
        }
      },
      changed: () => { this.stopClock(); this.requestDraw(); this.startClock(); },
      release: options => options?.freeze ? this.freezeOwnership(id, lease) : this.disable(),
    }, compiled);
      lease.acquire();
    } catch (error) {
      if (live) this.presentLayerGPU(layer);
      throw error;
    }
    this.ownership.set(id, { lease, base, check, restore, resources, compiled });
    this.invalidatePolicy();
    this.resources.animationOwners++;
    if (live) {
      this.presentLayerGPU(layer);
      this.requestDraw();
      this.startClock();
    }
    return lease.playback;
  }
  /**
   * Ends one layer's ownership without leaving GPU: the layer keeps its last sampled
   * transform and the source is handed back and cancelled, so no unowned boundary
   * animation remains. CSS-provenance sources cannot be cancelled without changing
   * their stylesheet association, so they keep the surface-wide release.
   */
  private async freezeOwnership(id: string, lease: ReturnType<typeof prepareAnimation>) {
    this.assertLive();
    const owner = this.ownership.get(id);
    if (owner?.lease !== lease) return;
    if (owner.restore || owner.compiled) throw new Error("Freeze release supports WAAPI and typed-motion sources; CSS-provenance ownership uses release()");
    const layer = this.registry.get(id);
    const frozen = layer ? { ...layer.transform } : undefined;
    const live = this.core?.phase() === "gpu";
    this.stopClock();
    if (this.gpuDeclarations.get(id) === lease.presentation) this.gpuDeclarations.delete(id);
    lease.restore();
    lease.source.cancel();
    this.ownership.delete(id);
    this.resources.animationOwners--;
    if (this.motions.get(id)?.source === lease.source) this.cancelNativeMotion(id);
    this.invalidatePolicy();
    if (layer && frozen) {
      layer.transform = frozen;
      if (live) this.presentLayerGPU(layer);
      else this.presentation("dom");
    }
    this.requestDraw();
    this.startClock();
  }
  /** Cancels the shared RAF clock and forgets its last timestamp, so the next tick starts with a zero delta. */
  private stopClock() {
    if (this.clockFrame) { cancelAnimationFrame(this.clockFrame); this.clockFrame = 0; this.resources.controllerFrames--; }
    this.clockTime = undefined;
  }
  /**
   * Starts the shared RAF clock if something needs it: GPU is active, the document visible, motion not
   * reduced or driven by `animate`/`advance`, and an owned animation or effect is playing. Each tick advances
   * them by the elapsed time (capped at 100 ms), re-checks policy, draws and re-arms itself.
   */
  private startClock() {
    if (this.stopped || this.clockFrame || this.moving || !this.environment.visible || this.reduced.matches || this.core?.phase() !== "gpu"
      || ![...this.ownership.values()].some(owner => owner.lease.playback.state().playing)
        && ![...this.effects.values()].some(effect => effect.values.some(value => value.time.playing))) return;
    this.resources.controllerFrames++;
    this.clockFrame = requestAnimationFrame(time => {
      this.clockFrame = 0;
      this.resources.controllerFrames--;
      const delta = this.clockTime === undefined ? 0 : Math.min(100, time - this.clockTime);
      this.clockTime = time;
      try {
        for (const owner of this.ownership.values()) { owner.check?.(); owner.lease.tick(delta); }
        this.tickRipples(delta);
        const policy = this.policy();
        if (policy) this.recover(policy); else this.renderer().draw();
      } catch (error) { this.recover(`Animation ownership failure: ${String(error)}`); }
      this.startClock();
    });
  }
  /** Convenience over `setEffects` for one ripple; `null` clears the layer's effect ownership. */
  setRipple(id: string, value: Ripple | null) {
    if (value) {
      const ripple = validateRipple(value);
      this.setEffects(id, [{ kind: "ripple", parameters: { amplitude: ripple.amplitude }, time: { seconds: ripple.seconds, playing: ripple.playing },
        bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" }]);
    } else {
      this.assertLive();
      if (!this.registry.has(id)) throw new Error(`Unknown Surface: ${id}`);
      this.effects.get(id)?.finish({ status: "cancelled", reason: "setRipple cleared effect ownership" });
    }
  }
  /**
   * Validates and installs a decorative effect chain on a layer, replacing any previous one, and returns its
   * handle. The layer must be enrolled as decorative. Custom effects need WebGPU and may rebuild the layer's
   * pass. Ordinary DOM keeps only the static original, so effects finish as `fallback` there.
   */
  setEffects(id: string, descriptors: readonly EffectDescriptor[]): EffectHandle {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    const values = validateEffects(descriptors);
    const transition = values[0]!.interaction === "inert";
    if (transition) {
      if (layer.decorative) throw new Error("Decorative layers use decorative effect interaction");
      // The boundary keeps the layer's hit area while its content is inert, so a click on
      // displaced pixels lands on it instead of on a control in or under the layer.
      if (layer.element.matches(interactive)) throw new Error("Transition effects require a non-interactive layer boundary element");
    } else if (!layer.decorative || !decorative(layer.element)) throw new Error("Effects require explicit decorative, inert, aria-hidden noninteractive enrollment");
    const state = this.renderer().state();
    if (state.initializing || state.transitioning || state.resources.pendingEngines || (state.resources.pendingCleanups && state.mode !== "gpu") || state.resources.probeReadbacks) throw new Error("Effects require idle DOM or admitted GPU without pending lifecycle work");
    // A custom definition the layer's current pass was not built with gets a new pass: the
    // renderer compiles it as a successor and keeps presenting the previous frame until ready.
    let rebuild = false;
    for (const value of values) if (value.kind === "custom") {
      if (!navigator.gpu) throw new Error("Application effect requires WebGPU; original DOM remains usable");
      if (state.mode === "gpu" && !this.renderer().acceptsCustom(id, value.definition)) rebuild = true;
    }
    if (this.reduced.matches) for (const value of values) value.time.playing = false;
    let active = true;
    let unlock: (() => void) | undefined;
    let resolve!: (result: EffectResult) => void;
    const finished = new Promise<EffectResult>(done => { resolve = done; });
    const counter = transition ? "transitionEffects" : "decorativeEffects";
    const entry = { values, transition, finish: (result: EffectResult) => {
      if (!active) return;
      active = false;
      unlock?.();
      if (this.effects.get(id) === entry) { this.effects.delete(id); this.resources[counter]--; this.invalidatePolicy(); }
      resolve(result);
      this.stopClock(); this.requestDraw(); this.startClock();
    } };
    this.effects.get(id)?.finish({ status: "replaced", reason: "Validated successor acquired ownership" });
    this.effects.set(id, entry);
    this.invalidatePolicy();
    this.resources[counter]++;
    if (transition) unlock = lockContent(layer.element,
      () => entry.finish({ status: "cancelled", reason: "Layer content became interactive during a transition effect" }));
    if (rebuild) { this.revision++; this.reconcile(); }
    this.stopClock();
    this.requestDraw();
    this.startClock();
    const change = (operation: () => void) => {
      this.assertLive();
      if (!active || this.effects.get(id) !== entry) throw new Error("Effect handle is no longer active");
      operation(); this.stopClock(); this.requestDraw(); this.startClock();
    };
    return {
      finished, state: () => ({ active, effects: validateEffects(values) }),
      seek: seconds => { effectNumber(seconds, 0, 1e6, "Effect seconds"); change(() => { for (const value of values) value.time.seconds = seconds; }); },
      play: () => change(() => { if (this.reduced.matches) throw new Error("Effect playback is disabled by reduced motion"); for (const value of values) value.time.playing = true; }),
      pause: () => change(() => { for (const value of values) value.time.playing = false; }),
      update: parameters => {
        if (!Array.isArray(parameters) || parameters.length !== values.length) throw new Error("Effect update requires one parameter set per operation");
        const next = validateEffects(values.map((value, index) => ({ ...value, parameters: parameters[index]! }) as EffectDescriptor));
        change(() => next.forEach((value, index) => { values[index]!.parameters = value.parameters; }));
      },
      cancel: () => entry.finish({ status: "cancelled", reason: "Effect cancelled" }),
      dispose: () => entry.finish({ status: "disposed", reason: "Effect disposed" }),
    };
  }
  /**
   * Validates and installs a persistent material on any enrolled layer, interactive or decorative, replacing the
   * layer's previous material, and returns its handle. A material only changes how the layer's pixels are lit,
   * never where they are, so the layer keeps its native controls and input. Inside the layer the change is one
   * brightness factor per point within `interior.max`, the same for text and its face. The material persists
   * across DOM and GPU presentation (ordinary DOM shows the original). Custom materials need WebGPU, are refused
   * with compiled programs, and may rebuild the layer's pass.
   */
  setMaterial(id: string, descriptor: MaterialDescriptor): MaterialHandle {
    this.assertLive();
    const layer = this.registry.get(id);
    if (!layer) throw new Error(`Unknown Surface: ${id}`);
    const value = validateMaterial(descriptor);
    if (!navigator.gpu) throw new Error("Application material requires WebGPU; original DOM remains usable");
    if (this.options.compiled) throw new Error("Compiled programs do not include runtime materials");
    const state = this.renderer().state();
    if (state.initializing || state.transitioning || state.resources.pendingEngines || (state.resources.pendingCleanups && state.mode !== "gpu") || state.resources.probeReadbacks) throw new Error("Materials require idle DOM or admitted GPU without pending lifecycle work");
    // A definition the layer's current pass was not built with gets a new pass, compiled as a successor while
    // the previous frame keeps presenting.
    const rebuild = state.mode === "gpu" && !this.renderer().acceptsMaterial(id, isSceneMaterial(value) ? "relief" : value.definition);
    let active = true;
    let resolve!: (result: EffectResult) => void;
    const finished = new Promise<EffectResult>(done => { resolve = done; });
    const entry = { value, finish: (result: EffectResult) => {
      if (!active) return;
      active = false;
      if (this.materials.get(id) === entry) { this.materials.delete(id); this.resources.materials--; }
      resolve(result);
      this.requestDraw();
    } };
    this.materials.get(id)?.finish({ status: "replaced", reason: "Validated successor acquired ownership" });
    this.materials.set(id, entry);
    this.resources.materials++;
    if (rebuild) { this.revision++; this.reconcile(); }
    this.requestDraw();
    return {
      finished, state: () => ({ active, material: validateMaterial(entry.value) }),
      update: change => {
        this.assertLive();
        if (!active || this.materials.get(id) !== entry) throw new Error("Material handle is no longer active");
        entry.value = validateMaterial(isSceneMaterial(entry.value)
          ? { ...entry.value, scene: change as ReliefScene & StageScene }
          : { ...entry.value, parameters: change as Record<string, number> });
        this.requestDraw();
      },
      setEmitters: emitters => {
        this.assertLive();
        if (!active || this.materials.get(id) !== entry) throw new Error("Material handle is no longer active");
        entry.value = withEmitters(entry.value, emitters);
        this.lightWritten = true;
        this.requestDraw();
      },
      cancel: () => entry.finish({ status: "cancelled", reason: "Material cancelled" }),
      dispose: () => entry.finish({ status: "disposed", reason: "Material disposed" }),
    };
  }
  /** Advances playing effect time (or all when `force`), wrapping at 1000 seconds. */
  private tickRipples(milliseconds: number, force = false) {
    for (const effect of this.effects.values()) for (const value of effect.values) if (value.time.playing || force) value.time.seconds = (value.time.seconds + milliseconds / 1000) % 1000;
  }
  /**
   * Deterministic timeline stepping for measurement: advances owned animations and effects by a fixed
   * `milliseconds` per real displayed frame, even when paused, and returns `state()` before and after.
   * Requires idle GPU without reduced motion; a policy violation disables GPU and throws.
   */
  async advance(frames = 300, milliseconds = 1000 / 60) {
    this.assertLive();
    if (!Number.isInteger(frames) || frames < 1 || frames > 10000 || !Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 1000) throw new Error("Invalid bounded timeline advance");
    if (this.moving || this.renderer().phase() !== "gpu" || this.reduced.matches) throw new Error("Timeline advance requires idle GPU without reduced motion");
    this.stopClock();
    await this.settle();
    const before = this.state(), generation = this.renderer().version();
    this.moving = true;
    try {
      for (let index = 0; index < frames; index++) {
        if (!this.environment.visible) await new Promise<void>((resolve, reject) => {
          this.visibilityWaiters.add({ resolve, reject }); this.resources.visibilityWaiters++;
        });
        await new Promise<void>((resolve, reject) => {
          this.resources.controllerFrames++;
          const id = requestAnimationFrame(() => { this.motionFrame = undefined; this.resources.controllerFrames--; resolve(); });
          this.motionFrame = { id, reject };
        });
        if (!this.environment.visible) { index--; continue; }
        if (this.renderer().phase() !== "gpu" || generation !== this.renderer().version()) throw new Error("Timeline interrupted by renderer generation");
        for (const owner of this.ownership.values()) { owner.check?.(); owner.lease.tick(milliseconds, true); }
        this.tickRipples(milliseconds, true);
        const policy = this.policy();
        if (policy) { await this.disable(); throw new Error(policy); }
        this.renderer().draw();
      }
    } finally { this.moving = false; this.startClock(); }
    return { before, after: this.state() };
  }
  /** Renderer state extended with runtime diagnostics: environment, admission, layers, resource ledgers and owners. */
  state() {
    const renderer = this.renderer().state();
    return { ...renderer, environment: { ...this.environment }, registryRevision: this.revision,
      admission: { policy: this.options.admissionPolicy ?? "explicit", intent: this.admissionIntent,
        pending: this.readmissionPending, attempts: this.automaticAttempts, reason: this.admissionReason },
      layers: this.ordered().map(layer => ({ id: layer.id, width: layer.element.offsetWidth, height: layer.element.offsetHeight,
        matrix: this.matrix(layer), transform: { ...layer.transform }, ...(layer.origin ? { origin: layer.origin } : {}) })),
      runtimeResources: { ...this.resources, presentationOverrides: this.relinquishedDeclarations.size,
        cssReplacementSources: [...this.ownership.values()].reduce((sum, owner) => sum + (owner.resources?.() ?? 0), 0) }, moving: this.moving,
      animationOwnership: [...this.ownership].map(([id, owner]) => ({ id, ...owner.lease.playback.state() })),
      declarativeMotion: [...this.transitions].map(([id, motion]) => ({ id, start: motion.start, end: motion.end })),
      decorativeEffects: [...this.effects].map(([id, effect]) => {
        const ripple = effect.values.find(value => value.kind === "ripple");
        return { id, interaction: effect.values[0]!.interaction, amplitude: ripple?.parameters.amplitude ?? 0, seconds: ripple?.time.seconds ?? effect.values[0]!.time.seconds, playing: ripple?.time.playing ?? false,
          effects: effect.values.map(value => ({ kind: value.kind, parameters: { ...value.parameters }, time: { ...value.time } })) };
      }),
      materials: [...this.materials].map(([id, { value }]) => value.kind === "stage"
        ? { id, kind: value.kind, particles: value.scene.particles.length, backdrop: value.scene.backdrop !== undefined }
        : value.kind === "instrument"
        // Objects drawn at the Relief level, and why (containment, budget, compile, pending...), as the renderer last drew them.
        ? { id, kind: value.kind, primitives: value.scene.primitives.length, objects: value.scene.objects.length,
          parts: value.scene.objects.reduce((sum, object) => sum + object.parts.length, 0), interior: { ...value.scene.interior },
          degraded: renderer.instrument?.layers.find(layer => layer.id === id)?.steppedDown ?? [] }
        : isSceneMaterial(value)
        ? { id, kind: value.kind, primitives: value.scene.primitives.length, interior: { ...value.scene.interior },
          ...(value.kind === "objects" ? { degraded: reliefDegraded(value.scene) } : {}) }
        : { id, kind: value.kind, name: value.definition.name, parameters: { ...value.parameters }, interior: { ...value.interior } }),
      // Fixed values, not measured from live state.
      effectBudget: { passes: 1, operationsPerLayer: 3, extraTextures: 0, uniformBytesPerLayer: 160, gpuTimestampMs: null },
    };
  }
  /**
   * Final teardown: cancels intent, motion and transitions, disposes the renderer (which unmounts the React
   * root), then disconnects observers and listeners. Safe to call again; later calls return `state()`.
   */
  async dispose() {
    if (this.stopped) return this.state();
    this.admissionEpoch++;
    this.admissionIntent = "disabled";
    this.readmissionPending = false;
    this.cancelReadmissionFrame();
    this.cancelTransitions("Disposed");
    this.cancelMotion();
    this.disposalRequested = true;
    try { await this.renderer().dispose(); }
    finally { this.disposalRequested = false; }
    for (const material of [...this.materials.values()]) material.finish({ status: "disposed", reason: "Runtime disposed" });
    for (const id of this.motions.keys()) this.cancelNativeMotion(id);
    this.relinquishedDeclarations.clear();
    this.stopped = true;
    this.mutation.disconnect();
    this.resize.disconnect();
    this.viewportAncestors.clear();
    this.externalAncestors.clear();
    this.viewportGeometry = new WeakMap();
    this.resources.mutationObservers = this.resources.resizeObservers = 0;
    for (const remove of this.removers.splice(0)) remove();
    return this.state();
  }
}

/**
 * Makes an enrolled layer's content inert for a transition effect while the boundary keeps
 * its hit area. Children added meanwhile are locked too. Returns the release; `broken` runs
 * when application code makes locked content interactive again.
 */
function lockContent(boundary: HTMLElement, broken: () => void) {
  const owned = new Set<HTMLElement>();
  const lock = (node: Node) => { if (node instanceof HTMLElement && !node.inert) { node.inert = true; owned.add(node); } };
  for (const child of boundary.children) lock(child);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList" && record.target === boundary) record.addedNodes.forEach(lock);
      else if (record.type === "attributes" && record.target instanceof HTMLElement && owned.has(record.target) && !record.target.inert) {
        owned.delete(record.target);
        broken();
        return;
      }
    }
  });
  observer.observe(boundary, { childList: true, subtree: true, attributes: true, attributeFilter: ["inert"] });
  return () => {
    observer.disconnect();
    for (const node of owned) node.inert = false;
    owned.clear();
  };
}
