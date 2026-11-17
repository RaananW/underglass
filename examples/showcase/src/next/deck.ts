/**
 * The deck's driver for the preview home page: plain DOM code beside the React tree (`page.tsx`), built on what
 * `docs/showcase-deck-probe.md` proved.
 *
 * The page is one document with two layouts. The **flow** is ordinary DOM: the sections follow each other down the
 * page. The **deck** is the GPU presentation: `html.deck` makes the stage stick to the window (`next.css`) while a track
 * one window tall per section scrolls past, and the scroll position decides what is on stage.
 *
 * - Around each section's place in the track is a **rest band**: there the section is alone on stage, untransformed
 *   and interactive. Between two bands the two sections are both on stage and `pose` runs the change between them
 *   (`transitions.ts`: one per boundary). Only matrices (`setTransform`) and effect parameters (`handle.update`) are
 *   written, so scrolling through a change captures nothing. Nothing in the document changes during a change
 *   either: a layer that is not seen is shrunk away by its matrix, so that it takes no click meant for the layer
 *   under it.
 * - Only the sections on stage are enrolled as layers (`controller.enroll`). The view (`view.ts`) tells React which to
 *   park, inside `flushSync`, so a change starts in the frame its sections are enrolled.
 * - The layout changes to the deck before `enable()` and back to the flow whenever the mode returns to `dom` (a
 *   refusal, `disable()`, a lost GPU). The section in the window stays the same across both changes.
 * - A custom effect's shader is compiled when it is first used, which stalls the page for a few frames. So after the
 *   deck has started, each change's chain is put once on an empty layer in the stage's corner, in idle moments, and
 *   the first scroll into a change finds its shader ready (`warm`).
 * - Links to a section, focus moving into a parked section, and Page Up, Page Down, Space, Home and End bring that
 *   section on stage.
 *
 * The deck needs a wide window in which every section fits the stage; otherwise the page stays the flow.
 */
import { flushSync } from "react-dom";
import type { CanvasController, CanvasStatus, EffectHandle, Transform } from "@underglass/react";
import { flowIndex } from "./flow";
import { figureId } from "./page";
import { fade, transitions, type StageLayer, type Transition } from "./transitions";
import { flow, viewStore, type View } from "./view";

/** The part of a step, on each side of a section's place, where that section is at rest. */
const band = 0.14;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export interface Deck {
  /** Lays the page out as the deck and enables GPU presentation. Resolves to whether the deck is on. */
  start(): Promise<boolean>;
  /** Returns to ordinary DOM and the flow. */
  stop(): Promise<void>;
  /** Why the deck cannot run in this window now, or null when it can. */
  blocked(): string | null;
  /** Scrolls to a section, in either layout. */
  go(index: number, smooth?: boolean): void;
  /** Waits until the driver has nothing pending and the runtime has presented what it was given (for tests). */
  idle(): Promise<void>;
  /** The scroll position as the deck reads it: the section at rest or leaving, the one arriving, and the progress between them. */
  place(): { from: number; to: number | null; t: number };
  /** Resolves when the changes' shaders have been compiled ahead of use, or at once when they will not be (for tests). */
  warmed(): Promise<void>;
  /** Tell the driver the runtime status changed (`onStatusChange`): a mode that fell back to `dom` returns the page to the flow. */
  modeChanged(mode: CanvasStatus["mode"]): void;
  /** Errors from the driver's controller calls: none are expected. */
  errors: string[];
}

export function createDeck({ controller, ids, track, onChange, onTransition }: {
  controller: CanvasController;
  /** The sections' ids in page order; a section's layers are `id` and, where it has a specimen of its own, `figureId(id)`. */
  ids: readonly string[];
  /** The element as tall as the scroll range of the sections; the stage is inside it. */
  track: HTMLElement;
  /** Called when another section becomes the current one. */
  onChange(current: number): void;
  /** Called when a change between two sections starts, with its name, and with null when the stage comes to rest. */
  onTransition?(name: string | null): void;
}): Deck {
  const root = document.documentElement, count = ids.length;
  const wide = matchMedia("(min-width: 1180px)"), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const errors: string[] = [];
  /** True while `start` or `stop` runs, so a status change inside them is not taken for a lost GPU. */
  let acting = false;
  let view = flow;
  const element = (id: string) => document.getElementById(id)!;
  /** Each section's layers: its text and, where the section has one of its own, its specimen. */
  const parts = ids.map(id => ({ text: id, figure: document.getElementById(figureId(id)) ? figureId(id) : null }));
  const layers = (index: number) => { const { text, figure } = parts[index]!; return figure ? [text, figure] : [text]; };
  /** The runtime's mode, kept from its status reports: `state()` copies every metric and measures every layer, so the frame loop never calls it. */
  let mode = controller.state().mode;
  const gpu = () => mode === "gpu";

  /** One window of scrolling per section. */
  const step = () => innerHeight;
  const trackTop = () => track.getBoundingClientRect().top + scrollY;
  /** Where the scroll position is in the deck's track. */
  function place() {
    const position = clamp((scrollY - trackTop()) / step(), 0, count - 1);
    const nearest = Math.round(position);
    if (Math.abs(position - nearest) <= band) return { from: nearest, to: null, t: 0 };
    const from = Math.floor(position);
    return { from, to: from + 1, t: clamp((position - from - band) / (1 - 2 * band)) };
  }
  /** In the deck, the section that reads as the current one: the one arriving from the middle of a change on. */
  let front = 0;
  const current = () => view.deck ? front : flowIndex();
  /**
   * The document offset at which a section is in place: at rest in the deck, and in the flow the top of its row (a
   * section starts its top margin below that). Where the deck fits, every row of the flow is one window tall, so the
   * flow and the deck put each section at the same offset and at the same place in the window (`next.css`).
   */
  function offset(index: number) {
    if (view.deck) return trackTop() + index * step();
    const text = element(parts[index]!.text);
    return Math.max(0, Math.round(scrollY + text.getBoundingClientRect().top - parseFloat(getComputedStyle(text).marginTop)));
  }
  function go(index: number, smooth = false) {
    scrollTo({ top: offset(clamp(index, 0, count - 1)), behavior: smooth && !reduced.matches ? "smooth" : "instant" });
    schedule();
  }

  /**
   * Writes a layer's transform (a layer `show` could not enrol is skipped: its error is already recorded). A
   * layer at opacity 0 still takes native hits where it lies, so it is drawn at a hundredth of its size instead.
   */
  function transform(id: string, value: Transform) {
    if (!enrolled.has(id)) return;
    if (value.opacity !== undefined && value.opacity <= 0) value = { opacity: 0, scaleX: 0.01, scaleY: 0.01 };
    try { controller.setTransform(id, value); } catch (error) { errors.push(`setTransform ${id}: ${String(error)}`); }
  }
  /** The change between the two sections on stage: its layers at rest, and the effect chains they carry. */
  let change: { transition: Transition; layers: StageLayer[]; handles: Map<string, EffectHandle> } | undefined;
  /**
   * Ends the change on stage, before its sections change or come to rest. A layer that stays on stage (`staying`)
   * has its effect ended and its pose undone: it is then as it rests. A layer that leaves the stage is hidden
   * instead, and keeps its effect until its enrolment ends. The GPU goes on drawing it for a frame or more after
   * that, until the stage without it is ready, and an undone pose would show it whole for that long: a flash of the
   * section that had just gone.
   */
  function release(staying: ReadonlySet<string>) {
    const handles = change?.handles;
    change = undefined;
    // In the flow nothing is enrolled, so there is nothing to release.
    if (!view.deck) return;
    for (const index of [view.from, view.to]) if (index !== null) for (const id of layers(index)) {
      if (!staying.has(id)) { transform(id, { opacity: 0 }); continue; }
      try { handles?.get(id)?.cancel(); } catch { /* already ended */ }
      transform(id, {});
    }
  }
  /** Describes the change for the two sections now on stage (none at rest). Their layers are untransformed: measured as they rest. */
  function prepare() {
    const { from, to } = view;
    if (!view.deck || to === null) { change = undefined; onTransition?.(null); return; }
    const describe = (index: number, leaving: boolean) => layers(index).map((id, part): StageLayer => {
      const layer = element(id), stage = layer.offsetParent as HTMLElement;
      return { id, leaving, figure: part === 1, x: layer.offsetLeft, y: layer.offsetTop, width: layer.offsetWidth, height: layer.offsetHeight,
        stageWidth: stage.clientWidth, stageHeight: stage.clientHeight };
    });
    change = { transition: reduced.matches ? fade : transitions[from] ?? fade, layers: [...describe(from, true), ...describe(to, false)], handles: new Map() };
    onTransition?.(change.transition.name);
  }
  /** The layers enrolled now, each with the call that ends its enrolment. */
  const enrolled = new Map<string, () => void>();
  /**
   * Shows `next` (a no-op when nothing changed). The sections that leave the stage are released and their layers'
   * enrolment ended; React then parks them and unparks the ones arriving, and those are enrolled, all in this task,
   * so a change starts in the frame its sections are on stage.
   */
  function show(next: View) {
    if (next.deck === view.deck && next.from === view.from && next.to === view.to) return;
    const wanted = new Set(next.deck ? [next.from, next.to].flatMap(index => index === null ? [] : layers(index)) : []);
    release(wanted);
    for (const [id, end] of enrolled) if (!wanted.has(id)) { end(); enrolled.delete(id); }
    view = next;
    flushSync(() => viewStore.set(next));
    for (const id of wanted) {
      if (enrolled.has(id)) continue;
      try { enrolled.set(id, controller.enroll(element(id), { id, origin: "center" })); } catch (error) { errors.push(`enroll ${id}: ${String(error)}`); }
    }
    prepare();
  }
  /** Changes between the flow and the deck, keeping section `index` in the window. */
  function layout(deck: boolean, index: number) {
    root.classList.toggle("deck", deck);
    show(deck ? { deck, from: index, to: null } : flow);
    front = index;
    scrollTo({ top: offset(index), behavior: "instant" });
    schedule();
  }
  /**
   * Runs the change between the two sections on stage at progress `t`: each layer gets its transform and, where the
   * change has effects, its chain's parameters. A chain is attached on the first frame the runtime takes it; until
   * then an arriving layer is held unseen, so it never shows whole before its effect does. Returns true while a chain
   * is still to be attached.
   */
  function pose(t: number) {
    if (!change || !gpu()) return false;
    const { transition, handles } = change;
    let pending = false;
    for (const layer of change.layers) {
      if (!enrolled.has(layer.id)) continue;
      let handle = handles.get(layer.id);
      if (transition.chain && !handle) {
        try {
          const attached = controller.setEffects(layer.id, transition.chain(layer));
          handles.set(layer.id, handle = attached);
          void attached.finished.then(() => { if (change?.handles.get(layer.id) === attached) change.handles.delete(layer.id); });
        } catch (error) {
          // Not ready for effects in this frame (admission or a swap is in progress): tried again in the next.
          if (/idle DOM or admitted GPU|mount has not completed/.test(String(error))) pending = true;
          else errors.push(`setEffects ${layer.id}: ${String(error)}`);
        }
      }
      if (transition.chain && !handle) { if (!layer.leaving) transform(layer.id, { opacity: 0 }); continue; }
      const { transform: value, parameters } = transition.frame(t, layer);
      transform(layer.id, value);
      if (parameters && handle) { try { handle.update(parameters); } catch (error) { handles.delete(layer.id); errors.push(`update ${layer.id}: ${String(error)}`); } }
    }
    return pending;
  }
  /**
   * Compiles the changes' shaders ahead of their first use: each chain is put on the empty layer `deck-warm` for as
   * long as the runtime takes to present it, one per idle moment. Started when the deck is at rest, and started again
   * from the next rest if GPU presentation ended or was busy meanwhile. With reduced motion no change has a chain.
   */
  let warm: "no" | "running" | "done" = "no";
  const warmWaiters: (() => void)[] = [];
  async function warmUp() {
    if (warm !== "no" || !view.deck || !gpu()) return;
    if (reduced.matches) { warm = "done"; for (const done of warmWaiters.splice(0)) done(); return; }
    warm = "running";
    const layer = element("deck-warm"), stage = layer.offsetParent as HTMLElement | null;
    let end: (() => void) | undefined, complete = false;
    try {
      end = controller.enroll(layer, { id: layer.id });
      const stand: StageLayer = { id: layer.id, leaving: true, figure: false, x: 0, y: 0, width: 16, height: 16, stageWidth: stage?.clientWidth ?? 16, stageHeight: stage?.clientHeight ?? 16 };
      for (const transition of transitions) {
        if (!transition.chain) continue;
        await new Promise<void>(resolve => { if ("requestIdleCallback" in window) requestIdleCallback(() => resolve(), { timeout: 600 }); else setTimeout(resolve, 100); });
        if (!view.deck || !gpu()) return;
        const handle = controller.setEffects(layer.id, transition.chain(stand));
        await controller.settle();
        try { handle.cancel(); } catch { /* ended with GPU presentation */ }
      }
      complete = true;
    } catch (error) {
      // Busy with admission or a swap: tried again from the next rest. Anything else is the driver's error.
      if (!/idle DOM or admitted GPU|mount has not completed/.test(String(error))) { errors.push(`warm: ${String(error)}`); complete = true; }
    } finally {
      try { end?.(); } catch { /* the runtime is gone */ }
      warm = complete ? "done" : "no";
      if (complete) for (const done of warmWaiters.splice(0)) done();
    }
  }
  const warmed = () => warm === "done" ? Promise.resolve() : new Promise<void>(resolve => { warmWaiters.push(resolve); });
  /** Reads the scroll position, changes what is on stage when it crosses into or out of a band, and poses it. */
  let reported = -1;
  function update() {
    if (view.deck) {
      const { from, to, t } = place();
      show({ deck: true, from, to });
      front = to !== null && t >= 0.5 ? to : from;
      if (pose(t)) schedule();
      if (to === null && warm === "no") void warmUp();
    }
    const now = current();
    if (now !== reported) onChange(reported = now);
  }
  let frame = 0;
  function schedule() { frame ||= requestAnimationFrame(() => { frame = 0; update(); }); }

  /**
   * A section fits when each of its layers, with its margins, is no taller than the stage: the window under the
   * header. Measured in either layout: the layers have the same sizes in both, and the flow's top margin is the
   * deck's plus the header (`next.css`).
   */
  function blocked() {
    if (!wide.matches) return "GPU presentation needs a wider window.";
    const header = parseFloat(getComputedStyle(root).getPropertyValue("--header"));
    const tall = ids.some((_, index) => layers(index).some(id => {
      const layer = element(id), style = getComputedStyle(layer);
      return parseFloat(style.marginTop) + (view.deck ? header : 0) + layer.offsetHeight + parseFloat(style.marginBottom) > innerHeight;
    }));
    return tall ? "GPU presentation needs a taller window." : null;
  }
  async function start() {
    if (view.deck || acting || blocked()) return view.deck;
    acting = true;
    try {
      const index = flowIndex();
      layout(true, index);
      mode = (await controller.enable()).mode;
      if (!gpu()) layout(false, index);
    } finally { acting = false; }
    schedule();
    return view.deck;
  }
  async function stop() {
    if (acting) return;
    acting = true;
    try {
      const index = current();
      mode = (await controller.disable()).mode;
      if (view.deck) layout(false, index);
    } finally { acting = false; }
    schedule();
  }
  /** GPU presentation ended by itself (a lost device, a diagnosed fallback): the page is the flow again. */
  function modeChanged(next: CanvasStatus["mode"]) {
    mode = next;
    if (view.deck && !acting) queueMicrotask(() => { if (view.deck && !acting && !gpu()) layout(false, current()); });
    schedule();
  }

  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", () => {
    // A window the deck no longer fits returns to the flow; the caller decides whether to start again later.
    if (view.deck && blocked()) void stop();
    // The track is one window per section, so a section at rest is at another offset in a window of another height.
    else if (view.deck && view.to === null) go(view.from);
    else schedule();
  });
  // The preference decides which change runs: the one on stage starts over as the other.
  reduced.addEventListener("change", () => { if (change) { release(new Set(enrolled.keys())); prepare(); } schedule(); });
  // A link to a place in the page: in the deck its target is stacked on the stage, so the driver scrolls to its section.
  document.addEventListener("click", event => {
    const link = (event.target as Element).closest?.<HTMLAnchorElement>("a[href^='#']");
    if (!link || !view.deck || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const section = document.getElementById(link.hash.slice(1))?.closest<HTMLElement>("[data-section]");
    if (!section) return;
    event.preventDefault();
    history.pushState(null, "", link.hash);
    go(Number(section.dataset.section), true);
  });
  // Back and forward between links followed in the deck.
  addEventListener("popstate", () => {
    const section = document.getElementById(location.hash.slice(1))?.closest<HTMLElement>("[data-section]");
    if (view.deck && section) go(Number(section.dataset.section));
  });
  // Focus moving into a parked section (Tab, a screen reader) brings that section on stage.
  document.addEventListener("focusin", event => {
    const index = Number((event.target as Element).closest?.<HTMLElement>("[data-section]")?.dataset.section ?? NaN);
    if (view.deck && Number.isInteger(index) && index !== view.from && index !== view.to) go(index);
  });
  // Paging keys move by one section, to its rest position. A control that uses the key itself keeps it.
  addEventListener("keydown", event => {
    if (!view.deck || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as Element).closest?.("input, select, textarea, button, a, summary, [contenteditable], [tabindex]")) return;
    const now = current();
    const next = event.key === "PageDown" || (event.key === " " && !event.shiftKey) ? now + 1
      : event.key === "PageUp" || (event.key === " " && event.shiftKey) ? now - 1
        : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    // At the last section the page scrolls on to the footer as usual.
    if (next >= count) scrollTo({ top: document.documentElement.scrollHeight, behavior: reduced.matches ? "instant" : "smooth" });
    else go(next, true);
  });

  const frames = async (n: number) => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); };
  async function idle() {
    await frames(2);
    for (let attempt = 0; attempt < 200 && (frame || acting); attempt++) await frames(1);
    await controller.settle();
    await frames(2);
  }
  schedule();
  return { start, stop, blocked, go, idle, warmed, modeChanged, place: () => view.deck ? place() : { from: flowIndex(), to: null, t: 0 }, errors };
}
