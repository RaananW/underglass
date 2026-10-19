/**
 * The pointer as a light (docs/ui-library/instrument.md, "The pointer as a light"; design language section 3), for the
 * Instrument gallery. The Strata GPU helper does not own it yet: this module does what the plan says the helper will, as a
 * wrapper around the controller the helper is given. The wrapper hands the helper's scenes to core with one more emitter
 * in them, the pointer's, and writes only that emitter (`handle.setEmitters`, a uniform write: no recapture, no relayout,
 * no change to hit geometry) as the pointer moves and fades.
 *
 * - **One key light.** The pointer light is additive, never the key light: it has `reach: "layer"` (it lights the layer's
 *   own captured content) and `face: 0.3` (a share of its strength lights the face, the parts take it all).
 * - **The contrast guard.** Every layer protects its text runs (the scene's `protected`), so text under the light is
 *   capped at `interior.max`; the guard's feather is the pointer light's 10 px.
 * - **Off where it must be.** Only with a fine pointer; never under `prefers-contrast: more` or `forced-colors`;
 *   `prefers-reduced-motion` keeps it and removes its fade.
 * - **No meaning.** It changes no state; hover, focus and selection stay as they are.
 */
import type { StrataGpuController } from "@underglass/ui/gpu";

type Material = Parameters<StrataGpuController["setMaterial"]>[1];
type Handle = ReturnType<StrataGpuController["setMaterial"]>;
type Rect = [number, number, number, number];
/** One of core's emitters, in the layer's CSS px. */
interface Emitter { position: [number, number, number]; colour: [number, number, number]; strength: number; radius: number; reach?: "outset" | "layer"; face?: number }
/** The scene fields this module reads or adds; the rest passes through untouched. */
interface Scene { version: number; kind?: string; emitters?: Emitter[]; protected?: Rect[] | "extent"; feather?: number }

/** The premium tokens (`pointerLight.*`): the strength is the intensity on parts, `face` the share on the face, `fade` is `motion.fast` in ms. */
export const pointerTokens = { strength: 16000, radius: 360, height: 120, colour: [1, 0.95, 0.88] as [number, number, number], face: 0.3, feather: 10, fade: 120 };

/** The text a layer must keep readable: its text runs and its text fields, in the layer's own px, a little grown. */
function textRects(layer: HTMLElement): Rect[] | "extent" {
  const outer = layer.getBoundingClientRect(), scale = outer.width / Math.max(layer.offsetWidth, 1) || 1;
  const rects: Rect[] = [];
  const add = (box: DOMRect, grow = 2) => {
    if (box.width > 0 && box.height > 0) rects.push([(box.left - outer.left) / scale - grow, (box.top - outer.top) / scale - grow, box.width / scale + 2 * grow, box.height / scale + 2 * grow]);
  };
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT), range = document.createRange();
  for (let node = walker.nextNode(); node && rects.length <= 4096; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || !parent || parent.closest("option, script, style") || !parent.checkVisibility({ visibilityProperty: true })) continue;
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) add(box);
  }
  for (const field of layer.querySelectorAll("input[type=text], input[type=search], textarea, .ug-display__text")) {
    if (field.checkVisibility({ visibilityProperty: true })) add(field.getBoundingClientRect());
  }
  return rects.length > 4096 ? "extent" : rects;
}

export interface PointerLight {
  /** The controller to give the helper: the real one, with the pointer light in every scene it sets. */
  readonly controller: StrataGpuController;
  /** Turns the light on or off (it is also off, whatever this says, where the preferences or the device say so). */
  enable(on: boolean): void;
  /** Whether the light is lighting layers now. */
  active(): boolean;
  /** What the light has written: uniform writes and their interval and cost, for the gallery's measurements. */
  stats(): { writes: number; layers: number; active: boolean; alpha: number };
  /** Stops tracking the pointer and takes the light out of every scene. */
  dispose(): void;
}

/** Wraps `real` so that every scene the helper sets carries the pointer light. */
export function pointerLight(real: StrataGpuController): PointerLight {
  const layers = new Map<string, { id: string; element?: HTMLElement; handle: Handle; descriptor: Material; scene: Scene; own: Emitter[] }>();
  const elements = new Map<string, HTMLElement>();
  const state = { wanted: false, inside: false, x: -1e4, y: -1e4, alpha: 0, moved: false, writes: 0, frame: 0, last: 0 };
  const preferences = () => matchMedia("(pointer: fine)").matches && !matchMedia("(prefers-contrast: more)").matches && !matchMedia("(forced-colors: active)").matches;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const on = () => state.wanted && preferences();

  /** The pointer's emitter in `element`'s own px; `alpha` fades its strength. */
  const emitterFor = (element: HTMLElement): Emitter => {
    const box = element.getBoundingClientRect(), scale = box.width / Math.max(element.offsetWidth, 1) || 1;
    return { position: [(state.x - box.left) / scale, (state.y - box.top) / scale, pointerTokens.height], colour: pointerTokens.colour,
      strength: Math.round(pointerTokens.strength * state.alpha), radius: pointerTokens.radius, reach: "layer", face: pointerTokens.face };
  };
  /** The scene with the pointer's emitter, the guard's rects and the pointer's feather: a version 4 scene of the same material. */
  const lifted = (layer: { element?: HTMLElement; scene: Scene; own: Emitter[] }): Scene => {
    const element = layer.element!;
    const feather = Math.max(layer.scene.feather ?? 0, pointerTokens.feather);
    return { ...layer.scene, version: 4, emitters: [...layer.own, emitterFor(element)], protected: layer.scene.protected ?? textRects(element), feather };
  };
  /** What core is given for a layer now: its own descriptor, or the same with the pointer light in its scene. */
  const descriptorOf = (layer: { descriptor: Material; element?: HTMLElement; scene: Scene; own: Emitter[] }): Material =>
    (on() && layer.element ? { ...layer.descriptor, scene: lifted(layer) } : layer.descriptor) as Material;
  const apply = (layer: NonNullable<ReturnType<typeof layers.get>>) => {
    layer.element = elements.get(layer.id);
    if (on() && layer.element) layer.handle.update(lifted(layer) as never);
    else layer.handle.update(layer.scene as never);
  };
  /** The cheap path: the emitters alone, in every layer, as the pointer moves or fades. */
  const write = () => {
    for (const layer of layers.values()) {
      if (!layer.element?.isConnected || !layer.handle.setEmitters) continue;
      layer.handle.setEmitters([...layer.own, emitterFor(layer.element)]);
    }
    state.writes++;
  };

  const tick = (now: number) => {
    state.frame = requestAnimationFrame(tick);
    const dt = state.last ? now - state.last : 1000 / 60;
    state.last = now;
    if (!on()) return;
    const target = state.inside ? 1 : 0;
    let changed = state.moved && target > 0;
    state.moved = false;
    if (state.alpha !== target) {
      const step = reduced.matches ? 1 : dt / pointerTokens.fade;
      state.alpha = target > state.alpha ? Math.min(target, state.alpha + step) : Math.max(target, state.alpha - step);
      changed = true;
    }
    if (changed) write();
  };
  const move = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    state.x = event.clientX; state.y = event.clientY; state.inside = true; state.moved = true;
  };
  const leave = () => { state.inside = false; };

  const controller: StrataGpuController = {
    get container() { return real.container; },
    enroll(element, options) {
      elements.set(options.id, element);
      const release = real.enroll(element, options);
      return () => { elements.delete(options.id); release(); };
    },
    setMaterial(id, descriptor) {
      // A stage scene (the Scene level's decoration) has no pointer light; every other layer's does.
      const scene = descriptor.scene as unknown as Scene;
      if (descriptor.kind === "stage") return real.setMaterial(id, descriptor);
      const layer = { id, element: elements.get(id), descriptor, scene, own: scene.emitters ?? [] } as NonNullable<ReturnType<typeof layers.get>>;
      layer.handle = real.setMaterial(id, descriptorOf(layer));
      layers.set(id, layer);
      return {
        update(next) {
          // The helper's own scene replaces the stored one; its emitters (lamps, LEDs, rings) are the layer's own.
          layer.scene = next as unknown as Scene;
          layer.own = layer.scene.emitters ?? [];
          layer.descriptor = { ...layer.descriptor, scene: layer.scene } as Material;
          layer.element = elements.get(id);
          if (on() && layer.element) layer.handle.update(lifted(layer) as never);
          else layer.handle.update(next);
        },
        setEmitters(next) {
          layer.own = next as Emitter[];
          layer.scene = { ...layer.scene, emitters: next as Emitter[] };
          layer.element = elements.get(id);
          if (on() && layer.element && layer.handle.setEmitters) layer.handle.setEmitters([...layer.own, emitterFor(layer.element)]);
          else layer.handle.setEmitters?.(next);
        },
        cancel() { layers.delete(id); layer.handle.cancel(); },
      };
    },
    transition: (id, motion) => real.transition(id, motion),
    state: () => real.state(),
  };

  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  state.frame = requestAnimationFrame(tick);
  return {
    controller,
    enable(value) {
      if (state.wanted === value) return;
      state.wanted = value;
      if (!value) state.alpha = 0;
      // The scenes change shape (a version 4 scene with the light, or without): through `update`, in every layer.
      for (const layer of layers.values()) apply(layer);
    },
    active: on,
    stats: () => ({ writes: state.writes, layers: layers.size, active: on(), alpha: state.alpha }),
    dispose() {
      cancelAnimationFrame(state.frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      state.wanted = false;
      for (const layer of layers.values()) layer.handle.update(layer.scene as never);
      layers.clear();
    },
  };
}
