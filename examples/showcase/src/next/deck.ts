/**
 * The deck's driver for the preview home page: plain DOM code beside the React tree (`page.tsx`), built on what
 * `docs/showcase-deck-probe.md` proved.
 *
 * The page is one document with two layouts. The **flow** is ordinary DOM: the sections follow each other down the
 * page. The **deck** is the GPU presentation: `html.deck` makes the stage stick to the window (`next.css`) while a track
 * one window tall per section scrolls past, and the scroll position decides what is on stage.
 *
 * - Around each section's place in the track is a **rest band**: there the section is alone on stage, untransformed
 *   and interactive. Between two bands the two sections are both on stage and `pose` moves them. Only matrices are
 *   written (`setTransform`), so scrolling through a change captures nothing. Nothing in the document changes during
 *   a change either: a layer that is not seen is shrunk away by its matrix, so that it takes no click meant for the
 *   layer under it.
 * - Only the sections on stage are enrolled as layers. The view (`view.ts`) tells React which, inside `flushSync`, so a
 *   change starts in the frame its sections are enrolled.
 * - The layout changes to the deck before `enable()` and back to the flow whenever the mode returns to `dom` (a
 *   refusal, `disable()`, a lost GPU). The section in the window stays the same across both changes.
 * - Links to a section, focus moving into a parked section, and Page Up, Page Down, Space, Home and End bring that
 *   section on stage.
 *
 * The deck needs a wide window in which every section fits the stage; otherwise the page stays the flow.
 */
import { flushSync } from "react-dom";
import type { CanvasController, CanvasStatus, Transform } from "@underglass/react";
import { figureId } from "./page";
import { flow, viewStore, type View } from "./view";

/** The part of a step, on each side of a section's place, where that section is at rest. */
const band = 0.14;
/** The layers' vertical margins in the deck (`next.css`), CSS px: a section fits when its tallest layer plus these does. */
const deckMargins = 40;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const ease = (value: number) => value * value * (3 - 2 * value);
const round = (value: number) => Math.round(value * 100) / 100;

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
  /** Tell the driver the runtime status changed (`onStatusChange`): a mode that fell back to `dom` returns the page to the flow. */
  modeChanged(mode: CanvasStatus["mode"]): void;
  /** Errors from the driver's controller calls: none are expected. */
  errors: string[];
}

export function createDeck({ controller, ids, track, onChange }: {
  controller: CanvasController;
  /** The sections' ids in page order; a section's layers are `id` and, where it has a specimen of its own, `figureId(id)`. */
  ids: readonly string[];
  /** The element as tall as the scroll range of the sections; the stage is inside it. */
  track: HTMLElement;
  /** Called when another section becomes the current one. */
  onChange(current: number): void;
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
  /** The section in the middle of the window, in the flow. */
  function flowIndex() {
    const middle = innerHeight / 2;
    let best = 0, distance = Infinity;
    ids.forEach((id, index) => {
      const box = element(id).getBoundingClientRect();
      const away = middle < box.top ? box.top - middle : middle > box.bottom ? middle - box.bottom : 0;
      if (away < distance) { distance = away; best = index; }
    });
    return best;
  }
  /** In the deck, the section that reads as the current one: the one arriving from the middle of a change on. */
  let front = 0;
  const current = () => view.deck ? front : flowIndex();
  /** The document offset at which a section is in place: at rest in the deck, in the middle of the window in the flow. */
  function offset(index: number) {
    if (view.deck) return trackTop() + index * step();
    const boxes = layers(index).map(id => element(id).getBoundingClientRect());
    const top = Math.min(...boxes.map(box => box.top)), bottom = Math.max(...boxes.map(box => box.bottom));
    return Math.max(0, scrollY + (top + bottom) / 2 - innerHeight / 2);
  }
  function go(index: number, smooth = false) {
    scrollTo({ top: offset(clamp(index, 0, count - 1)), behavior: smooth && !reduced.matches ? "smooth" : "instant" });
    schedule();
  }

  /**
   * Writes a layer's transform. The layers of the view are enrolled when `show` returns, so every id here is one. A
   * layer at opacity 0 still takes native hits where it lies, so it is drawn at a hundredth of its size instead.
   */
  function transform(id: string, value: Transform) {
    if (value.opacity !== undefined && value.opacity <= 0) value = { opacity: 0, scaleX: 0.01, scaleY: 0.01 };
    try { controller.setTransform(id, value); } catch (error) { errors.push(`setTransform ${id}: ${String(error)}`); }
  }
  /** Ends the poses of the sections on stage, before they change or come to rest. */
  function release() {
    // In the flow nothing is enrolled, so there is nothing to release.
    if (view.deck) for (const index of [view.from, view.to]) if (index !== null) for (const id of layers(index)) transform(id, {});
  }
  /** Shows `next` (a no-op when nothing changed): the sections that leave the stage are released first. */
  function show(next: View) {
    if (next.deck === view.deck && next.from === view.from && next.to === view.to) return;
    release();
    view = next;
    flushSync(() => viewStore.set(next));
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
   * Poses the two sections on stage for progress `t` between them. The texts change places in turn: one is gone at
   * the middle, where the other starts, so they never read through each other. The specimens overlap: the one leaving
   * tilts back into the stage while the next rises over it. With reduced motion everything only fades.
   */
  function pose(t: number) {
    const { from, to } = view;
    if (to === null || !gpu()) return;
    const leaving = parts[from]!, arriving = parts[to]!;
    const textOut = clamp(t / 0.5), textIn = clamp((t - 0.5) / 0.5);
    if (reduced.matches) {
      for (const id of layers(from)) transform(id, { opacity: round(1 - textOut) });
      for (const id of layers(to)) transform(id, { opacity: round(textIn) });
      return;
    }
    transform(leaving.text, { y: round(-48 * ease(textOut)), opacity: round(1 - textOut) });
    transform(arriving.text, { y: round(56 * (1 - ease(textIn))), opacity: round(textIn) });
    if (leaving.figure) {
      // A tilted layer is not clipped by the stage, so it stays inside it: it rises no further than the room above it.
      const back = ease(clamp(t / 0.75)), rise = Math.max(0, Math.min(56, element(leaving.figure).offsetTop - 8));
      transform(leaving.figure, { y: round(-rise * back), tiltX: round(50 * back), scaleX: round(1 - 0.18 * back), scaleY: round(1 - 0.18 * back),
        opacity: round(1 - clamp((t - 0.35) / 0.4)), perspective: 1000 });
    }
    if (arriving.figure) {
      // Flat, so the stage may cut it off as it comes up from below.
      const up = ease(clamp((t - 0.2) / 0.8));
      transform(arriving.figure, { y: round(180 * (1 - up)), scaleX: round(0.94 + 0.06 * up), scaleY: round(0.94 + 0.06 * up), opacity: round(clamp((t - 0.2) / 0.3)) });
    }
  }
  /** Reads the scroll position, changes what is on stage when it crosses into or out of a band, and poses it. */
  let reported = -1;
  function update() {
    if (view.deck) {
      const { from, to, t } = place();
      show({ deck: true, from, to });
      front = to !== null && t >= 0.5 ? to : from;
      pose(t);
    }
    const now = current();
    if (now !== reported) onChange(reported = now);
  }
  let frame = 0;
  function schedule() { frame ||= requestAnimationFrame(() => { frame = 0; update(); }); }

  /** A section fits when its taller layer, with the deck's margins, is no taller than the stage will be. */
  function blocked() {
    if (!wide.matches) return "GPU presentation needs a wider window.";
    // The stage is the window under the header (`next.css`); measured in either layout, where the layers have the same widths.
    const room = innerHeight - parseFloat(getComputedStyle(root).getPropertyValue("--header")) - deckMargins;
    const tall = ids.find((_, index) => layers(index).some(layer => element(layer).offsetHeight > room));
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
  reduced.addEventListener("change", schedule);
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
  return { start, stop, blocked, go, idle, modeChanged, place: () => view.deck ? place() : { from: flowIndex(), to: null, t: 0 }, errors };
}
