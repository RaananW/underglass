/**
 * The home page's scene: the stage at the top of the home page. The headline, its links and the glass panel's controls
 * are the original React elements on GPU-presented layers; the light, the colour and the ripples are drawn by the
 * shared compositor, on decorative layers only (effects never touch a layer with controls).
 *
 * - **The sky** (`hero-sky`, decorative) is a CSS night of colour blobs. Its custom shader (`heroSky`) turns its hue
 *   and lights it with a lamp that follows the pointer, with faint caustic rings around it.
 * - **The glass** (`hero-pane-art`, `hero-pane-code` and `hero-card-glass`, decorative) are translucent panes. Each
 *   carries a ripple (at rest, amplitude 0), a slight chromatic split and the `heroGlass` sheen: a glint and a
 *   streak that slide with the pointer, and an edge that lights on the side facing it. The two floating panes drift
 *   away from the pointer (`setTransform`, a uniform update: no recapture).
 * - **The copy** (`hero-copy`) and **the card** (`hero-card`) are interactive layers: the headline, the links and
 *   real range inputs and a button, whose values the shaders read every frame. The card sits on its glass slab.
 *
 * Pointer, scroll and the card's inputs only write effect parameters and transforms, so nothing is recaptured while
 * the light moves. Scrolling the stage out of view turns the colour; a click on the sky, or the card's button,
 * ripples the glass. The frame loop runs only on the GPU, with the stage in view and the page visible. Under
 * `prefers-reduced-motion` the lamp follows the pointer without easing and nothing drifts, leans or ripples.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { defineEffect, useGPUHost, useSurfaceRef, type EffectDescriptor, type EffectHandle } from "@underglass/react";
import { policy, useSceneArt } from "./scene";
import { useReducedMotion } from "./shared";

/**
 * The sky: a hue turn (`hue`, half turns) and a lamp at (`pointerX`, `pointerY`) in the layer's 0..1 space, `light`
 * its strength. Every term scales to identity at `hue` 0 and `light` 0.
 */
export const heroSky = defineEffect({
  name: "showcase-hero-sky",
  parameters: { pointerX: { min: -1, max: 2 }, pointerY: { min: -1, max: 2 }, hue: { min: 0, max: 2 }, light: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let uv = local / max(extent, vec2f(1.0));
    let aspect = extent.x / max(extent.y, 1.0);
    let turn = parameters.z * 3.14159;
    let axis = vec3f(0.57735);
    let cosine = cos(turn);
    let rotated = color.rgb * cosine + cross(axis, color.rgb) * sin(turn) + axis * dot(axis, color.rgb) * (1.0 - cosine);
    let offset = (uv - parameters.xy) * vec2f(aspect, 1.0);
    let distance = length(offset);
    let pool = exp(-distance * distance * 7.0);
    let rings = (0.5 + 0.5 * sin(distance * 52.0 - seconds * 2.4)) * exp(-distance * 4.5);
    let warm = vec3f(1.0, 0.7, 0.5);
    let cool = vec3f(0.5, 0.92, 1.0);
    let lamp = mix(warm, cool, 0.5 + 0.5 * sin(turn + 0.6));
    let lit = rotated + lamp * parameters.w * (pool * 0.42 + rings * 0.07);
    return vec4f(lit, color.a);`,
});

/**
 * The glass sheen: a glint at (`pointerX`, `pointerY`) in the pane's own 0..1 space, a double streak that slides with
 * it, and an edge lit on the side facing it, tinted by `hue` and scaled by `light`. Transparent pixels (outside the
 * pane's rounded shape) stay transparent.
 */
export const heroGlass = defineEffect({
  name: "showcase-hero-glass",
  parameters: { pointerX: { min: -1, max: 2 }, pointerY: { min: -1, max: 2 }, hue: { min: 0, max: 2 }, light: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let uv = local / max(extent, vec2f(1.0));
    let pointer = parameters.xy;
    let turn = parameters.z * 3.14159;
    let axis = vec3f(0.57735);
    let cosine = cos(turn);
    let rotated = color.rgb * cosine + cross(axis, color.rgb) * sin(turn) + axis * dot(axis, color.rgb) * (1.0 - cosine);
    let shape = vec2f(1.0, extent.y / max(extent.x, 1.0));
    let toward = (uv - pointer) * shape;
    let glint = exp(-dot(toward, toward) * 16.0);
    let along = (uv.x + uv.y * 0.6) - (pointer.x + pointer.y * 0.6);
    let streak = exp(-along * along * 70.0) * 0.6 + exp(-(along - 0.16) * (along - 0.16) * 300.0) * 0.4;
    let rim = min(min(uv.x, 1.0 - uv.x) * extent.x, min(uv.y, 1.0 - uv.y) * extent.y);
    let edge = 1.0 - smoothstep(0.0, 10.0, rim);
    let facing = clamp(1.1 - length(toward) * 1.2, 0.0, 1.0);
    let tint = mix(vec3f(1.0, 0.88, 0.74), vec3f(0.74, 0.95, 1.0), 0.5 + 0.5 * sin(turn + 0.6));
    let inside = step(0.02, color.a);
    let light = parameters.w * inside * (glint * 0.5 + streak * 0.32 + edge * facing * 0.55);
    return vec4f(rotated + tint * light, min(1.0, color.a + light * 0.4));`,
});

/**
 * The decorative glass layers and how far each drifts from the pointer (CSS px across the stage; 0 stays put). They
 * move but never turn: a stage taller than the viewport is clipped to it, and a clipped layer must stay axis-aligned.
 */
const glass = [
  { id: "hero-pane-art", depth: 18 },
  { id: "hero-pane-code", depth: 30 },
  { id: "hero-card-glass", depth: 0 },
] as const;
type GlassId = typeof glass[number]["id"];
const SKY = "hero-sky";
/** Where the lamp rests (stage 0..1) when no pointer is over the stage. */
const rest = { x: 0.72, y: 0.3 };
/** A ripple's starting amplitude (CSS px) and length (ms). */
const rippleAmplitude = 7, rippleMs = 1100;

/** Rounds a parameter for the effect's declared range, so tiny float noise never fails validation. */
const fit = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)) * 1e4) / 1e4;

/**
 * Keeps an effect chain on a layer and returns its handle: attached once the runtime takes effects, re-attached after
 * a return to ordinary DOM ends it (so the next admission compiles it again), and without the custom operation where
 * the browser has no WebGPU. `kinds` lists the operations the handle actually has, for `update`.
 */
function useChain(id: string, chain: () => EffectDescriptor[]) {
  const controller = useGPUHost();
  const handle = useRef<{ effect: EffectHandle; kinds: string[] } | undefined>(undefined);
  const build = useRef(chain);
  build.current = chain;
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const attach = (attempt = 0) => {
      if (!alive) return;
      try {
        let operations = build.current();
        let effect: EffectHandle;
        try { effect = controller.setEffects(id, operations); }
        catch (error) {
          if (!/requires WebGPU/.test(String(error))) throw error;
          operations = operations.filter(operation => operation.kind !== "custom");
          effect = controller.setEffects(id, operations);
        }
        handle.current = { effect, kinds: operations.map(operation => operation.kind) };
        void effect.finished.then(result => {
          if (result.status === "fallback" && alive && handle.current?.effect === effect) timer = setTimeout(attach, 0);
        });
      } catch (error) {
        // Not ready for effects yet (mount unfinished, or lifecycle work pending): try again shortly.
        if (attempt < 50 && /idle DOM or admitted GPU|mount has not completed/.test(String(error))) { timer = setTimeout(() => attach(attempt + 1), 100); return; }
        console.error(`Hero effect on ${id} was refused`, error);
      }
    };
    attach();
    return () => { alive = false; if (timer !== undefined) clearTimeout(timer); handle.current?.effect.dispose(); handle.current = undefined; };
  }, [controller, id]);
  return handle;
}

/** The sky's chain: a ripple at rest, then the sky shader. Its clock runs unless motion is reduced. */
const skyChain = (moving: boolean): EffectDescriptor[] => [
  { kind: "ripple", parameters: { amplitude: 0 }, time: { seconds: 0, playing: moving }, ...policy },
  { kind: "custom", definition: heroSky, parameters: { pointerX: rest.x, pointerY: rest.y, hue: 0, light: 0.5 }, time: { seconds: 0, playing: moving }, ...policy },
];
/** A pane's chain: a ripple at rest, a slight chromatic split (the glass's dispersion), then the sheen. */
const glassChain = (moving: boolean): EffectDescriptor[] => [
  { kind: "ripple", parameters: { amplitude: 0 }, time: { seconds: 0, playing: moving }, ...policy },
  { kind: "chromatic", parameters: { displacement: 1 }, time: { seconds: 0, playing: false }, ...policy },
  { kind: "custom", definition: heroGlass, parameters: { pointerX: 0.5, pointerY: 0.2, hue: 0, light: 0.5 }, time: { seconds: 0, playing: false }, ...policy },
];

/** Writes one frame's parameters to a chain, by operation kind; a retired handle is skipped. */
function write(handle: RefObject<{ effect: EffectHandle; kinds: string[] } | undefined>, values: { amplitude: number; pointerX: number; pointerY: number; hue: number; light: number }) {
  const current = handle.current;
  if (!current) return;
  const parameters = current.kinds.map((kind): Record<string, number> => kind === "ripple" ? { amplitude: fit(values.amplitude, 0, 12) }
    : kind === "chromatic" ? { displacement: 1 }
      : { pointerX: fit(values.pointerX, -1, 2), pointerY: fit(values.pointerY, -1, 2), hue: fit(values.hue, 0, 2), light: fit(values.light, 0, 1) });
  try { current.effect.update(parameters); } catch { /* retired between frames; the chain re-attaches itself */ }
}

/** The home page's scene. */
export function HeroScene() {
  const controller = useGPUHost();
  const reduced = useReducedMotion();
  // No art for this scene: the persistent art slot shrinks to one empty pixel, as the galleries' do.
  useSceneArt(() => ({ layout: { x: 0, y: 0, width: 1, height: 1, overflow: "hidden" }, content: null }), []);
  const skyRef = useSurfaceRef<HTMLDivElement>({ id: SKY, decorative: true });
  const artRef = useSurfaceRef<HTMLDivElement>({ id: "hero-pane-art", decorative: true });
  const codeRef = useSurfaceRef<HTMLDivElement>({ id: "hero-pane-code", decorative: true });
  // The slab, copy and card are also kept as elements, for measuring: during the root's first render they are not in
  // the document yet, so they cannot be looked up by id. Each callback is made once, so enrollment is not repeated.
  const slab = useRef<HTMLDivElement | null>(null), copy = useRef<HTMLDivElement | null>(null), card = useRef<HTMLDivElement | null>(null);
  const enrolSlab = useSurfaceRef<HTMLDivElement>({ id: "hero-card-glass", decorative: true });
  const enrolCopy = useSurfaceRef<HTMLDivElement>({ id: "hero-copy" });
  const enrolCard = useSurfaceRef<HTMLDivElement>({ id: "hero-card" });
  const slabRef = useCallback((element: HTMLDivElement | null) => { slab.current = element; enrolSlab(element); }, [enrolSlab]);
  const copyRef = useCallback((element: HTMLDivElement | null) => { copy.current = element; enrolCopy(element); }, [enrolCopy]);
  const cardRef = useCallback((element: HTMLDivElement | null) => { card.current = element; enrolCard(element); }, [enrolCard]);
  const sky = useChain(SKY, () => skyChain(!reduced));
  const handles: Record<GlassId, ReturnType<typeof useChain>> = {
    "hero-pane-art": useChain("hero-pane-art", () => glassChain(!reduced)),
    "hero-pane-code": useChain("hero-pane-code", () => glassChain(!reduced)),
    "hero-card-glass": useChain("hero-card-glass", () => glassChain(!reduced)),
  };
  // The card's controls: the light's strength and the colour, both read by the frame loop.
  const [light, setLight] = useState(70);
  const [colour, setColour] = useState(0);
  // Read by polling (below): during the root's first render the runtime has no state to give yet.
  const [gpu, setGpu] = useState(false);
  const settings = useRef({ light, colour, reduced });
  settings.current = { light, colour, reduced };
  // Set by the effect below: starts a ripple on the glass and the sky (a no-op in DOM or with reduced motion), and
  // schedules one frame (the card's inputs changed).
  const ripple = useRef<() => void>(() => {});
  const redraw = useRef<() => void>(() => {});

  // The stage's height is the content's (the canvas cannot size itself from what is in it): measured as the layout
  // changes and written as a custom property on the stage, as the Instrument gallery does. The card's glass slab is a
  // layer of its own (effects never go on a layer with controls), kept on the card's box.
  useLayoutEffect(() => {
    const text = copy.current!, panel = card.current!, glassSlab = slab.current!;
    let stage: HTMLElement | null = null;
    const measure = () => {
      stage ??= text.closest<HTMLElement>(".stage");
      if (!stage || !panel.offsetWidth) return;
      Object.assign(glassSlab.style, { left: `${panel.offsetLeft}px`, top: `${panel.offsetTop}px`, width: `${panel.offsetWidth}px`, height: `${panel.offsetHeight}px` });
      const bottom = Math.max(text.offsetTop + text.offsetHeight, panel.offsetTop + panel.offsetHeight);
      const wide = stage.clientWidth >= 760;
      // On a narrow stage the panes sit in a strip under the card (see the stylesheet), so the stage is taller by it.
      stage.style.setProperty("--hero-stage-height", `${Math.ceil(Math.max(bottom + (wide ? 64 : 40 + stage.clientWidth * 0.32), wide ? 560 : 0))}px`);
    };
    // The observer also reports the first size once the elements are attached, so the first render needs no lookup.
    const observer = new ResizeObserver(measure);
    observer.observe(text); observer.observe(panel);
    measure();
    return () => { observer.disconnect(); stage?.style.removeProperty("--hero-stage-height"); };
  }, []);

  // GPU mode can start or end at any time (the page starts it when the stage is in view): the card's note and the
  // frame loop follow it.
  // `live` mirrors it for the frame loop, which starts again when GPU mode does.
  const live = useRef(false);
  useEffect(() => {
    const poll = () => {
      let now = false;
      try { now = controller.state().mode === "gpu"; } catch { /* the mount has not completed yet */ }
      if (now === live.current) return;
      live.current = now; setGpu(now);
      if (now) redraw.current();
    };
    const timer = setInterval(poll, 100);
    return () => clearInterval(timer);
  }, [controller]);

  // Pointer, scroll and the frame loop. The pointer is followed for the scene's whole life, so a move made while GPU
  // mode is starting is not lost; only the frame loop waits for GPU mode. The stage is found once the scene is attached
  // (on the home page the first render happens before it is in the document).
  useEffect(() => {
    let stage: HTMLElement | null = null, finding = 0;
    const pointer = { x: rest.x, y: rest.y, inside: false };
    const lamp = { x: rest.x, y: rest.y, hover: 0 };
    const leans = new Map<GlassId, { x: number; y: number }>(glass.map(pane => [pane.id, { x: 0, y: 0 }]));
    let rippleStart = -Infinity, frame = 0, visible = true;
    const kick = () => { if (!frame && visible && live.current && stage) frame = requestAnimationFrame(tick); };
    // How far the stage has scrolled up out of view, 0..1.
    const scrolled = (box: DOMRect) => Math.min(1, Math.max(0, -box.top / Math.max(box.height * 0.85, 1)));
    function tick(now: number) {
      frame = 0;
      if (!stage || !live.current) return;
      const { light: strength, colour: tint, reduced: still } = settings.current;
      // The lamp eases toward the pointer, or drifts slowly round its resting place when no pointer is over the stage.
      const seconds = now / 1000;
      const target = pointer.inside ? pointer : still ? rest : { x: rest.x + 0.1 * Math.sin(seconds * 0.37), y: rest.y + 0.1 * Math.cos(seconds * 0.29) };
      const ease = still ? 1 : 0.14;
      lamp.x += (target.x - lamp.x) * ease;
      lamp.y += (target.y - lamp.y) * ease;
      lamp.hover += ((pointer.inside ? 1 : 0) - lamp.hover) * (still ? 1 : 0.08);
      const box = stage.getBoundingClientRect();
      const hue = Math.min(2, tint / 100 * 1.4 + scrolled(box) * 0.9);
      const level = strength / 100 * (0.55 + 0.45 * lamp.hover);
      const elapsed = now - rippleStart;
      const amplitude = still || elapsed > rippleMs ? 0 : rippleAmplitude * (1 - elapsed / rippleMs) ** 2;
      write(sky, { amplitude: amplitude * 0.5, pointerX: lamp.x, pointerY: lamp.y, hue, light: level });
      for (const pane of glass) {
        const element = document.getElementById(pane.id);
        if (!element) continue;
        // The pane's own 0..1 position of the lamp, from where it is drawn (getBoundingClientRect follows the transform).
        const rect = element.getBoundingClientRect();
        const x = (box.left + lamp.x * box.width - rect.left) / Math.max(rect.width, 1);
        const y = (box.top + lamp.y * box.height - rect.top) / Math.max(rect.height, 1);
        write(handles[pane.id], { amplitude, pointerX: x, pointerY: y, hue, light: level });
        if (!pane.depth || still) continue;
        const lean = leans.get(pane.id)!, goal = { x: (0.5 - lamp.x) * pane.depth, y: (0.5 - lamp.y) * pane.depth * 0.6 };
        if (Math.abs(goal.x - lean.x) + Math.abs(goal.y - lean.y) < 0.05) continue;
        lean.x = goal.x; lean.y = goal.y;
        controller.setTransform(pane.id, { x: Math.round(lean.x * 10) / 10, y: Math.round(lean.y * 10) / 10 });
      }
      // The drift and a running ripple need every frame; with reduced motion one frame per change is enough.
      if (!still || Math.abs(target.x - lamp.x) + Math.abs(target.y - lamp.y) > 0.001) kick();
    }
    const move = (event: PointerEvent) => {
      const box = stage!.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / box.width; pointer.y = (event.clientY - box.top) / box.height; pointer.inside = true;
      kick();
    };
    const leave = () => { pointer.inside = false; kick(); };
    ripple.current = () => { if (settings.current.reduced || !live.current) return; rippleStart = performance.now(); kick(); };
    redraw.current = kick;
    // A press on the sky (not on the copy or the card) ripples the glass.
    const press = (event: PointerEvent) => { if (!(event.target as Element).closest?.("#hero-copy, #hero-card")) ripple.current(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) kick(); });
    const find = () => {
      stage = copy.current?.closest<HTMLElement>(".stage") ?? null;
      if (!stage) { finding = requestAnimationFrame(find); return; }
      observer.observe(stage);
      stage.addEventListener("pointermove", move);
      stage.addEventListener("pointerleave", leave);
      stage.addEventListener("pointerdown", press);
      kick();
    };
    find();
    addEventListener("scroll", kick, { passive: true });
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(finding); observer.disconnect();
      stage?.removeEventListener("pointermove", move); stage?.removeEventListener("pointerleave", leave); stage?.removeEventListener("pointerdown", press);
      removeEventListener("scroll", kick);
      ripple.current = () => {}; redraw.current = () => {};
    };
    // The handles and settings are refs that stay the same objects for the life of the scene.
  }, [controller]);
  // The card's inputs changed: with reduced motion the loop is idle, so one more frame applies them.
  useEffect(() => { redraw.current(); }, [light, colour]);

  return <>
    <div ref={skyRef} id={SKY} className="hero-sky" aria-hidden="true" inert style={{ pointerEvents: "none" }}>
      <i className="blob blob-violet" /><i className="blob blob-coral" /><i className="blob blob-teal" /><i className="blob blob-gold" /><i className="stars" />
    </div>
    <div ref={artRef} id="hero-pane-art" className="hero-pane hero-pane-art" aria-hidden="true" inert style={{ pointerEvents: "none" }}>
      {/* A rotated layer must not clip itself (its clip would no longer be axis-aligned): the clip is on a child. */}
      <div className="pane-clip"><i className="sun" /><i className="hill hill-back" /><i className="hill hill-front" /></div>
      <span className="pane-label">ripple · chromatic · WGSL sheen</span>
    </div>
    <div ref={codeRef} id="hero-pane-code" className="hero-pane hero-pane-code" aria-hidden="true" inert style={{ pointerEvents: "none" }}>
      <code>&lt;Surface id="hero-copy"&gt;</code><code className="dim">  {"<h1>Real React controls…</h1>"}</code><code>&lt;/Surface&gt;</code>
    </div>
    <div ref={slabRef} id="hero-card-glass" className="hero-card-glass" aria-hidden="true" inert style={{ pointerEvents: "none" }} />
    <div ref={copyRef} id="hero-copy" className="hero-copy">
      <p className="hero-badge"><span className="dot" aria-hidden="true" />HTML-in-Canvas · WebGPU · React</p>
      <h1 id="hero-title">Real React controls.<br /><span className="hero-gradient">Painted by the GPU.</span></h1>
      <p className="hero-lede">Underglass draws your <em>original</em> React DOM into one shared WebGPU compositor through the browser's
        HTML-in-Canvas API. This header is one: the light follows your pointer, the colour turns as you scroll, and every link here is the real element.</p>
      <div className="hero-cta"><a className="cta primary" href="#examples">Explore the examples</a><a className="cta ghost" href="#how-it-works">How it works</a></div>
      <ul className="hero-notes" aria-label="Highlights"><li>Original React state</li><li>Native inputs and hits</li><li>One shared compositor</li><li>Ordinary DOM everywhere else</li></ul>
    </div>
    <div ref={cardRef} id="hero-card" className="hero-card" role="group" aria-labelledby="hero-card-title">
      <p className="hero-card-kicker">REAL INPUTS ON GLASS</p>
      <h2 id="hero-card-title">Bend the light</h2>
      <label className="hero-range"><span>Light</span><input type="range" min={0} max={100} value={light} onChange={event => setLight(Number(event.target.value))} /><output>{light}%</output></label>
      <label className="hero-range"><span>Colour</span><input type="range" min={0} max={100} value={colour} onChange={event => setColour(Number(event.target.value))} /><output>{Math.round(colour * 2.52)}°</output></label>
      <button type="button" className="hero-ripple" disabled={!gpu || reduced} onClick={() => ripple.current()}>Ripple the glass</button>
      <p className="hero-card-note">{gpu
        ? reduced ? "The shader reads these inputs every frame. Ripples are off: your system asks for reduced motion." : "The shader reads these inputs every frame. Click the sky to ripple it too."
        : "These inputs work in ordinary DOM too; the light, the colour and the ripples are drawn in GPU mode."}</p>
    </div>
  </>;
}
