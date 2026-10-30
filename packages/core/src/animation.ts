/**
 * Takes over a running CSS/WAAPI animation so the GPU presents it. `prepareAnimation` validates that
 * the source animation is simple enough to replay (one direct-target replace effect on transform and
 * opacity), then returns a lease that detaches the source, steps it with the runtime's clock and
 * restores it on release. `DeclarationOwnership` tracks the inline styles Underglass writes to the
 * element. Timing and keyframe maths live in `timeline.ts`; the runtime drives the lease.
 */
import { compileTimeline, parseTransform, type TimelineFrame } from "./timeline.js";
import { affine, type Transform } from "./affine.js";
import { verifyCompiledAnimation, type CompiledAnimation } from "./compiled.js";

/** Inline style properties Underglass may own on an animated element. */
const properties = ["transform", "opacity", "transform-origin"] as const;
/** Snapshot of the owned inline declarations (value and priority) currently on `element`. */
export function declarations(element: HTMLElement, includeAnimationName = false) {
  const names: readonly (typeof properties[number] | "animation-name")[] = includeAnimationName ? [...properties, "animation-name"] : properties;
  return names.map(name => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }));
}
/** Name of an inline declaration that `DeclarationOwnership` can write. */
type PresentationProperty = ReturnType<typeof declarations>[number]["name"];
/**
 * Records the element's inline presentation declarations before Underglass writes them, and puts
 * them back afterwards. If page code changes a declaration Underglass wrote, ownership of that
 * property is relinquished: it is no longer written or restored, and `check` throws so the caller
 * can return to ordinary DOM. A successor lease inherits its predecessor's saved values, so
 * `restore` returns the element to its state before the first lease.
 */
export class DeclarationOwnership {
  private readonly saved: ReturnType<typeof declarations>;
  private readonly initial;
  private readonly initialAttribute;
  private readonly written = new Map<PresentationProperty, { value: string; priority: string }>();
  private readonly relinquished = new Set<PresentationProperty>();
  constructor(private readonly element: HTMLElement, predecessor?: DeclarationOwnership, includeAnimationName = false) {
    this.initialAttribute = element.getAttribute("style");
    this.initial = declarations(element, includeAnimationName);
    this.saved = predecessor?.saved ?? this.initial;
  }
  // Marks any written property whose live value no longer matches what was written as relinquished.
  private inspect() {
    for (const [name, expected] of this.written) {
      if (this.element.style.getPropertyValue(name) !== expected.value
        || this.element.style.getPropertyPriority(name) !== expected.priority) this.relinquished.add(name);
    }
  }
  /** Throws if any written declaration was changed by someone else. */
  check() {
    this.inspect();
    if (this.relinquished.size) throw new Error(`Presentation declaration ownership changed: ${[...this.relinquished].join(", ")}`);
  }
  /** Sets an owned declaration (skipped if relinquished) and remembers the value to detect outside changes. */
  write(name: PresentationProperty, value: string, priority = "") {
    this.inspect();
    if (this.relinquished.has(name)) return;
    if (this.element.style.getPropertyValue(name) !== value || this.element.style.getPropertyPriority(name) !== priority) {
      this.element.style.setProperty(name, value, priority);
    }
    this.written.set(name, { value: this.element.style.getPropertyValue(name), priority: this.element.style.getPropertyPriority(name) });
  }
  /** Restores the saved declarations for every property written; returns the relinquished set. */
  restore() {
    return this.restoreDeclarations(this.saved);
  }
  /** Like `restore`, but to the state at construction, and removes the `style` attribute if it was absent. */
  rollback() {
    const lost = this.restoreDeclarations(this.initial);
    if (this.initialAttribute === null && !this.element.style.length) {
      // Flush lazy CSSOM attribute serialization before restoring attribute absence.
      this.element.getAttribute("style");
      this.element.removeAttribute("style");
    }
    return lost;
  }
  private restoreDeclarations(saved: ReturnType<typeof declarations>) {
    this.inspect();
    for (const { name, value, priority } of saved) {
      if (!this.written.has(name) || this.relinquished.has(name)) continue;
      if (value) this.element.style.setProperty(name, value, priority);
      else this.element.style.removeProperty(name);
    }
    this.written.clear();
    return this.relinquished;
  }
}
/** Callbacks the runtime supplies so an animation lease can drive and validate its layer. */
interface OwnershipHost {
  apply(transform: Transform): void;
  validate(transform: Transform): void;
  changed(): void;
  release(options?: ReleaseOptions): Promise<unknown>;
}
/** Options for releasing an animation back to the browser. */
export interface ReleaseOptions {
  /**
   * End ownership of this layer only and keep the current presentation: the layer
   * keeps its last sampled transform and the source animation is cancelled. GPU
   * presentation stays active. Without it, release returns the whole surface to
   * ordinary DOM and hands every owned source back to the browser.
   */
  freeze?: boolean;
}
/**
 * Playback controls for a GPU-owned animation. `seek` takes milliseconds on the animation's own
 * timeline; `state().detached` is true while the source animation is detached from its element.
 */
export interface AnimationPlayback {
  play(): void;
  pause(): void;
  seek(milliseconds: number): void;
  release(options?: ReleaseOptions): Promise<void>;
  state(): { milliseconds: number; playing: boolean; released: boolean; sourceTime: CSSNumberish | null; sourceState: AnimationPlayState; detached: boolean };
}

/**
 * Early diagnostic for stylesheet `!important` presentation overrides on the
 * element. This is a best-effort fast failure, not the guarantee: every sampled
 * DOM frame is verified against computed style, which catches any override this
 * scan cannot see (cross-origin sheets, nested or conditional rules, rules
 * beyond the scan budget).
 */
export function rejectImportantPresentation(element: HTMLElement, includeOrigin = false) {
  let visited = 0;
  const names = includeOrigin ? properties : ["transform", "opacity"] as const;
  // Selectors the element cannot be matched against (for example invalid ones) are ignored.
  const matches = (selector: string) => { try { return element.matches(selector); } catch { return false; } };
  // Bounded walk (depth 8, 8192 rules) so a huge stylesheet cannot stall enrollment.
  const inspect = (rules: CSSRuleList, depth: number, nested: boolean) => {
    if (depth > 8) return;
    for (const rule of rules) {
      if (++visited > 8192) return;
      if (rule instanceof CSSImportRule) {
        const imported = readable(rule.styleSheet);
        if (imported) inspect(imported, depth + 1, nested);
        continue;
      }
      // Nested style rules use relative selectors that cannot be matched directly.
      if (rule instanceof CSSStyleRule && !nested && matches(rule.selectorText)
        && names.some(name => rule.style.getPropertyPriority(name) === "important")) {
        throw new Error("Matching stylesheet important presentation overrides are unsupported");
      }
      if (rule instanceof CSSStyleRule && rule.cssRules.length) inspect(rule.cssRules, depth + 1, true);
      else if (rule instanceof CSSGroupingRule) inspect(rule.cssRules, depth + 1, nested);
    }
  };
  // Inside a shadow tree the rules that apply come from its shadow root's own sheets.
  const root = element.getRootNode();
  const scoped = root instanceof ShadowRoot ? [...root.styleSheets, ...root.adoptedStyleSheets] : [];
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets, ...scoped]) {
    const rules = readable(sheet);
    if (rules) inspect(rules, 0, false);
  }
}
function readable(sheet: CSSStyleSheet | null) {
  try { return sheet?.cssRules ?? undefined; } catch { return undefined; } // Cross-origin sheets are not inspectable.
}

/**
 * Validates `source` for GPU ownership and returns a lease for it. Throws when the animation is not
 * a single live replace-composite effect on `element` with document timing, rate 1, a top-left
 * origin, neutral inline transform/opacity and complete transform/opacity keyframes. With
 * `compiled`, the keyframes are instead checked against the build-time compiled description and
 * the CSS animation is suppressed through `animation-name` while owned. The lease's `acquire`
 * detaches the source and applies the first sample; `tick` advances time; `restore` reattaches it.
 */
export function prepareAnimation(element: HTMLElement, source: Animation, host: OwnershipHost, compiled?: CompiledAnimation) {
  if (!(source.effect instanceof KeyframeEffect) || source.effect.target !== element || source.effect.pseudoElement
    || source.playbackRate !== 1 || source.effect.composite !== "replace" || source.effect.iterationComposite !== "replace"
    || source.timeline !== document.timeline || source.playState === "idle" || source.currentTime === null || typeof source.currentTime !== "number") {
    throw new Error("Animation requires one live direct-target replace effect, numeric document timing and playbackRate 1");
  }
  if (element.getAnimations({ subtree: true }).some(animation => animation !== source)) throw new Error("Overlapping CSS/WAAPI ownership is unsupported");
  const computed = getComputedStyle(element);
  if (computed.transformOrigin !== "0px 0px" || computed.translate !== "none" || computed.rotate !== "none" || computed.scale !== "none") {
    throw new Error("Animation requires top-left origin and no individual transform dependencies");
  }
  // The inline values Underglass will write must start neutral so the first sample is the only change.
  const neutral = element.style.transform === "none" || /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(element.style.transform);
  if (!neutral || element.style.opacity !== "1" || element.style.getPropertyPriority("transform") || element.style.getPropertyPriority("opacity")) {
    throw new Error("Animation requires explicit neutral inline transform/opacity without important overrides");
  }
  rejectImportantPresentation(element);
  const effect = source.effect;
  const originalFrames = effect.getKeyframes();
  const frames: TimelineFrame[] = compiled ? [] : originalFrames.map(frame => {
    if (Object.keys(frame).some(key => !["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(key))
      || frame.composite !== "auto" && frame.composite !== "replace" || typeof frame.transform !== "string"
      || frame.opacity === undefined || frame.opacity === null) throw new Error("All frames must contain only complete transform/opacity replace values");
    return { offset: frame.computedOffset, transform: frame.transform, opacity: frame.opacity, easing: frame.easing };
  });
  const timing = effect.getTiming();
  if (typeof timing.duration !== "number" || timing.endDelay !== 0 || timing.iterationStart !== 0 || timing.fill !== "both"
    || timing.direction !== "normal" && timing.direction !== "alternate") throw new Error("Unsupported source animation timing/fill");
  if (compiled) verifyCompiledAnimation(element, source, compiled);
  const timeline = compiled ? {
    duration: compiled.timing.duration, delay: compiled.timing.delay,
    end: compiled.timing.delay + compiled.timing.duration * compiled.timing.iterations,
    sample: (time: number) => compiled.sample(time),
  } : compileTimeline(frames, { duration: timing.duration, delay: timing.delay, iterations: timing.iterations,
    direction: timing.direction, easing: timing.easing, fill: timing.fill });
  // Check every keyframe now so an unsupported transform is rejected before the GPU takes over.
  for (const frame of frames) host.validate(timeline.sample(frame.offset * timeline.duration + timeline.delay));
  let milliseconds = source.currentTime;
  host.validate(timeline.sample(milliseconds));
  const expected = affine(timeline.sample(milliseconds));
  // The browser's own rendering of the source must already match our sample, or the GPU would diverge from it.
  const applied = new DOMMatrix(computed.transform === "none" ? undefined : computed.transform);
  if (![applied.a, applied.b, applied.c, applied.d, applied.e, applied.f].every((value, index) =>
    Math.abs(value - expected[index]!) <= 1e-4 * Math.max(1, Math.abs(value)))
    || Math.abs(Number(computed.opacity) - timeline.sample(milliseconds).opacity!) > 1e-4) {
    throw new Error("Source effect is not visibly applied; stylesheet/important precedence or incompatible interpolation");
  }
  let playing = source.playState === "running";
  let released = false;
  const presentation = new DeclarationOwnership(element, undefined, !!compiled);
  // Fingerprint of the keyframes (transforms normalized) used to detect edits to the source effect.
  const signature = (frames: ComputedKeyframe[]) => JSON.stringify(frames.map(frame => ({
    ...frame, transform: typeof frame.transform !== "string" ? frame.transform
      : !compiled ? parseTransform(frame.transform) : (() => {
        const value = new DOMMatrix(frame.transform === "none" ? undefined : frame.transform);
        return [value.a, value.b, value.c, value.d, value.e, value.f];
      })(),
  })));
  const frameSignature = signature(originalFrames), timingSignature = JSON.stringify(timing);
  let expectedSourceTime: CSSNumberish | null = source.currentTime;
  const assertLive = () => { if (released) throw new Error("Animation ownership is released"); };
  // Throws if the source or the element's style was changed while the GPU owns the animation.
  const check = () => {
    presentation.check();
    const current = getComputedStyle(element);
    if (current.translate !== "none" || current.rotate !== "none" || current.scale !== "none" || current.transformOrigin !== "0px 0px") {
      throw new Error("Live individual transform/origin dependency requires ordinary DOM");
    }
    if (source.effect !== effect || effect.target !== null || source.playbackRate !== 1 || source.currentTime !== expectedSourceTime
      || effect.composite !== "replace" || effect.iterationComposite !== "replace"
      || signature(effect.getKeyframes()) !== frameSignature || JSON.stringify(effect.getTiming()) !== timingSignature) {
      throw new Error(`Source effect/target/timing was modified while GPU-owned: ${JSON.stringify({
        effectChanged: source.effect !== effect, targetDetached: effect.target === null,
        playbackRate: source.playbackRate, currentTime: source.currentTime, expectedSourceTime,
        framesChanged: signature(effect.getKeyframes()) !== frameSignature,
        timingChanged: JSON.stringify(effect.getTiming()) !== timingSignature,
      })}`);
    }
  };
  const apply = () => {
    check();
    source.currentTime = milliseconds;
    expectedSourceTime = source.currentTime;
    host.apply(timeline.sample(milliseconds));
  };
  let suppressed = false;
  // Gives the animation back to the browser at the current time and play state.
  const restoreSource = () => {
    if (compiled && suppressed) {
      source.cancel();
      const lost = presentation.restore();
      if (lost.has("animation-name") || !element.isConnected) return;
      const restored = element.getAnimations().filter(animation => animation instanceof CSSAnimation && animation.animationName === compiled.name);
      if (restored.length !== 1) throw new Error("Compiled CSS restoration requires one original stylesheet association");
      const animation = restored[0]!;
      verifyCompiledAnimation(element, animation, compiled);
      animation.currentTime = milliseconds;
      if (playing) animation.play(); else animation.pause();
    } else {
      presentation.restore();
      source.effect = effect;
      effect.target = element;
      source.currentTime = milliseconds;
      if (playing) source.play(); else source.pause();
    }
  };
  return {
    source,
    presentation,
    check,
    acquire() {
      try {
        if (compiled) {
          presentation.write("animation-name", "none");
          if (getComputedStyle(element).animationName !== "none") throw new Error("Compiled CSS animation suppression was overridden");
          suppressed = true;
        }
        source.pause();
        effect.target = null;
        if (compiled) {
          source.currentTime = milliseconds;
          expectedSourceTime = source.currentTime;
        }
        apply();
      } catch (error) {
        try { restoreSource(); }
        catch (cleanup) { throw new AggregateError([error, cleanup], "Animation acquisition and restoration failed"); }
        throw error;
      }
    },
    restore() {
      if (released) return;
      released = true;
      restoreSource();
    },
    tick(delta: number, force = false) {
      assertLive();
      if (playing || force) {
        milliseconds = Math.min(1e12, milliseconds + delta);
        apply();
        if (milliseconds >= timeline.end) playing = false;
      }
    },
    playback: {
      play() { assertLive(); playing = true; host.changed(); },
      pause() { assertLive(); playing = false; host.changed(); },
      seek(time: number) { assertLive(); const transform = timeline.sample(time); host.validate(transform); check(); milliseconds = time; apply(); host.changed(); },
      async release(options?: ReleaseOptions) { if (!released) await host.release(options); },
      state() { return { milliseconds, playing, released, sourceTime: source.currentTime, sourceState: source.playState, detached: effect.target === null }; },
    } satisfies AnimationPlayback,
  };
}
