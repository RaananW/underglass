/**
 * The deck's driver for the preview home page: plain DOM code beside the React tree (`page.tsx`), built on what
 * `docs/showcase-deck-probe.md` proved.
 *
 * The page is one document with two layouts. The **flow** is ordinary DOM: the sections follow each other down the
 * page. The **deck** is the GPU presentation: `html.deck` makes the stage stick to the window (`next.css`) while a
 * track scrolls past, and the scroll position decides what is on stage. The deck is the flow with the crossing from
 * one section to the next replaced by a change:
 *
 * - A section taller than the stage (on a phone, or in a short window) **pans**: while the scroll position is inside
 *   the section's own length, the section moves up the stage as the flow would scroll it, by its matrix. After that
 *   comes one window of scrolling for the change to the next section. A section that fits the stage has no pan, only
 *   the change.
 * - At each end of a change is a **rest band**: there one section is alone on stage and interactive. Between the bands
 *   the two sections are both on stage and `pose` runs the change between them (`transitions.ts`: one per boundary).
 *   Only matrices (`setTransform`) and effect parameters (`handle.update`) are written, so neither panning nor
 *   scrolling through a change captures anything. Nothing in the document changes during a change either: a layer
 *   that is not seen is shrunk away by its matrix, so that it takes no click meant for the layer under it.
 * - Only the sections on stage are enrolled as layers (`controller.enroll`). The view (`view.ts`) tells React which to
 *   park, inside `flushSync`, so a change starts in the frame its sections are enrolled.
 * - The layout changes to the deck before `enable()` and back to the flow whenever the mode returns to `dom` (a
 *   refusal, `disable()`, a lost GPU). The section in the window, and how far it has scrolled, stay the same.
 * - A custom effect's shader is compiled when it is first used, which stalls the page for a few frames. So after the
 *   deck has started, each change's chain is put once on an empty layer in the stage's corner, in idle moments, and
 *   the first scroll into a change finds its shader ready (`warm`).
 * - A link to a section and the paging keys (Page Up, Page Down, Space, Home, End) **jump**: the stage changes straight
 *   from the section on it to the one asked for, in about a second, with one change, however many sections lie
 *   between. The scroll position is set to the target at once and the change runs on the clock, so a jump over five
 *   sections does not race through five changes. Scrolling during a jump ends it. Focus moving into a parked section
 *   brings that section on stage at once.
 * - A decorative layer under the sections carries a light that follows the pointer (`light.ts`).
 */
import { flushSync } from "react-dom";
import type { CanvasController, CanvasStatus, EffectHandle, Transform } from "@underglass/react";
import { flowIndex, holdTravel, travelAt, travelNow } from "./flow";
import { createLight, LIGHT_ID } from "./light";
import { figureId } from "./page";
import { fade, slide, transitions, type StageLayer, type Transition } from "./transitions";
import { flow, viewStore, type View } from "./view";

/** The part of a change's scroll length, at each end, where one section is at rest. */
const band = 0.14;
/** How long a jump's change takes, ms; with reduced motion it is a short fade. */
const jumpMs = 950, calmJumpMs = 320;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Where the page is in the deck: the section at rest or leaving, the one arriving (null at rest), the progress of the
 * change between them, and how far each has panned up the stage, CSS px.
 */
export interface Place { from: number; to: number | null; t: number; panFrom: number; panTo: number }

export interface Deck {
  /** Lays the page out as the deck and enables GPU presentation. Resolves to whether the deck is on. */
  start(): Promise<boolean>;
  /** Returns to ordinary DOM and the flow. */
  stop(): Promise<void>;
  /** Brings a section on stage: at once, or with `smooth` by a jump in the deck and a smooth scroll in the flow. */
  go(index: number, smooth?: boolean): void;
  /** Waits until the driver has nothing pending and the runtime has presented what it was given (for tests). */
  idle(): Promise<void>;
  /** Where the page is, as the deck reads it. */
  place(): Place;
  /** The deck's lengths, CSS px: how far each section pans, and the scroll offset in the track at which each starts (for tests). */
  lengths(): { pans: number[]; starts: number[]; change: number } | null;
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
  /** The element as long as the scroll range of the sections; the pin and the stage are inside it. */
  track: HTMLElement;
  /** Called when another section becomes the current one. */
  onChange(current: number): void;
  /** Called when a change between two sections starts, with its name, and with null when the stage comes to rest. */
  onTransition?(name: string | null): void;
}): Deck {
  const root = document.documentElement, count = ids.length;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"), stacked = matchMedia("(max-width: 920px)");
  const pin = track.firstElementChild as HTMLElement;
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
  const trackTop = () => track.getBoundingClientRect().top + scrollY;

  /**
   * The deck's lengths, CSS px. `stage` is the stage's height and `change` the scroll length of a change (one window).
   * Section `i` starts at `start[i]` in the track, pans for `pan[i]` (how much taller than the stage it is, with its
   * margins) and is followed by a change. `end` is where the last section has panned out: the track's scroll range.
   */
  interface Lengths { stage: number; change: number; pan: number[]; start: number[]; end: number; top: Map<string, number> }
  let lengths: Lengths | undefined;
  /**
   * Measures the deck (only in the deck's layout). Parked sections are laid out for the measurement, and nothing is
   * painted meanwhile. Where the specimen is under its text (a narrow window), each specimen is told the height of
   * the text above it (`--above`): in the deck every section lies in one grid cell, so that cannot come from the grid.
   */
  function measure(): Lengths {
    root.classList.add("measuring");
    try {
      const container = element(parts[0]!.text).offsetParent as HTMLElement;
      const stage = container.clientHeight, change = pin.clientHeight, top = new Map<string, number>();
      const pan = parts.map(part => {
        const text = element(part.text), figure = part.figure ? element(part.figure) : null;
        if (figure) {
          const above = stacked.matches ? `${text.offsetHeight}px` : "";
          if (figure.style.getPropertyValue("--above") !== above) { if (above) figure.style.setProperty("--above", above); else figure.style.removeProperty("--above"); }
        }
        let bottom = 0;
        for (const layer of figure ? [text, figure] : [text]) {
          top.set(layer.id, layer.offsetTop);
          bottom = Math.max(bottom, layer.offsetTop + layer.offsetHeight + parseFloat(getComputedStyle(layer).marginBottom));
        }
        return Math.max(0, Math.ceil(bottom - stage));
      });
      const start: number[] = [];
      let at = 0;
      for (const length of pan) { start.push(at); at += length + change; }
      const end = start[count - 1]! + pan[count - 1]!;
      // The pin sticks while the track scrolls past it: the track is the scroll range and one window more.
      track.style.setProperty("--track", `${end + change}px`);
      return { stage, change, pan, start, end, top };
    } finally { root.classList.remove("measuring"); }
  }
  const measured = () => lengths ??= measure();

  /** Where the scroll position is, in a form that survives a resize: the section, how much of its pan is done (0 to 1), and how much of the change after it (null while it pans). */
  let where = { index: 0, panned: 0, changed: null as number | null };
  /**
   * A jump in progress: the stage is changing between `low` and `high` on the clock (toward `high` when `forward`),
   * with the scroll position already at the target's start. `pan` is how far the section it started from had panned.
   */
  let jump: { low: number; high: number; forward: boolean; target: number; began: number; ms: number; offset: number; travelFrom: number; pan: number } | undefined;
  /** Ends a jump where it is: the scroll position decides again, and the background follows it again. */
  function endJump() { if (jump) { jump = undefined; holdTravel(null); } }
  /** Where the page is in the deck: by the clock during a jump, by the scroll position otherwise. */
  function place(): Place {
    if (jump) {
      const progress = clamp((performance.now() - jump.began) / jump.ms), eased = progress * progress * (3 - 2 * progress);
      if (progress < 1) {
        // The background's rings travel with the change, not all at once with the scroll position.
        holdTravel(jump.travelFrom + (travelAt(jump.offset) - jump.travelFrom) * eased);
        // The section the jump started from stays where it had panned to; the target arrives at its top.
        return { from: jump.low, to: jump.high, t: jump.forward ? eased : 1 - eased, panFrom: jump.forward ? jump.pan : 0, panTo: jump.forward ? 0 : jump.pan };
      }
      endJump();
    }
    const { change, pan, start, end } = measured();
    const offset = clamp(scrollY - trackTop(), 0, end);
    let index = count - 1;
    while (index > 0 && offset < start[index]!) index--;
    const within = offset - start[index]!, room = pan[index]!;
    if (within <= room || index === count - 1) {
      where = { index, panned: room ? Math.min(1, within / room) : 0, changed: null };
      return { from: index, to: null, t: 0, panFrom: Math.min(within, room), panTo: 0 };
    }
    const changed = (within - room) / change;
    where = { index, panned: 1, changed };
    if (changed <= band) return { from: index, to: null, t: 0, panFrom: room, panTo: 0 };
    if (changed >= 1 - band) return { from: index + 1, to: null, t: 0, panFrom: 0, panTo: 0 };
    return { from: index, to: index + 1, t: (changed - band) / (1 - 2 * band), panFrom: room, panTo: 0 };
  }
  /** How far the two sections on stage have panned, from the last `place`. */
  let pans = { from: 0, to: 0 };
  /** In the deck, the section that reads as the current one: the one arriving from the middle of a change on. */
  let front = 0;
  const current = () => view.deck ? front : flowIndex();
  /** How far the current section has panned (0 in the flow's terms: its row's top is at the top of the window). */
  const panned = () => view.deck ? (front === view.from ? pans.from : pans.to) : 0;
  /** In the flow, the document offset of the top of a section's row: its text starts its top margin below that. */
  function flowTop(index: number) {
    const text = element(parts[index]!.text);
    return scrollY + text.getBoundingClientRect().top - parseFloat(getComputedStyle(text).marginTop);
  }
  /** The document offset at which a section starts: in the deck where it is at rest at its top, in the flow its row's top. The two layouts give a section the same length, so this plus a pan is the same place in both. */
  const offset = (index: number) => view.deck ? trackTop() + measured().start[index]! : Math.max(0, Math.round(flowTop(index)));
  function go(index: number, smooth = false) {
    const target = clamp(index, 0, count - 1), top = offset(target);
    // In the deck a smooth move is a jump: one change from the section on stage to the target, on the clock.
    if (smooth && view.deck && gpu() && target !== front) {
      const travelFrom = travelNow();
      jump = { low: Math.min(front, target), high: Math.max(front, target), forward: target > front, target, began: performance.now(), ms: reduced.matches ? calmJumpMs : jumpMs,
        offset: top, travelFrom, pan: panned() };
      holdTravel(travelFrom);
      scrollTo({ top, behavior: "instant" });
    } else {
      if (view.deck) endJump();
      scrollTo({ top, behavior: smooth && !view.deck && !reduced.matches ? "smooth" : "instant" });
    }
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
  /** The section at rest and its pan as last written to its layers, so that a frame with nothing new writes nothing. */
  let rested = "";
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
    rested = "";
    // In the flow nothing is enrolled, so there is nothing to release.
    if (!view.deck) return;
    for (const index of [view.from, view.to]) if (index !== null) for (const id of layers(index)) {
      if (!staying.has(id)) { transform(id, { opacity: 0 }); continue; }
      try { handles?.get(id)?.cancel(); } catch { /* already ended */ }
      transform(id, {});
    }
  }
  /**
   * Describes the change for the two sections now on stage (none at rest): each layer where it rests, which for a
   * section that has panned is that much further up the stage.
   */
  function prepare() {
    const { from, to } = view;
    if (!view.deck || to === null) { change = undefined; onTransition?.(null); return; }
    const describe = (index: number, leaving: boolean) => layers(index).map((id, part): StageLayer => {
      const layer = element(id), stage = layer.offsetParent as HTMLElement;
      return { id, leaving, figure: part === 1, x: layer.offsetLeft, y: layer.offsetTop - Math.round(leaving ? pans.from : pans.to), width: layer.offsetWidth, height: layer.offsetHeight,
        stageWidth: stage.clientWidth, stageHeight: stage.clientHeight };
    });
    const described = [...describe(from, true), ...describe(to, false)];
    // Two neighbours change as their boundary does; a jump over several sections uses the change that leads into the further one.
    let transition = reduced.matches ? fade : transitions[to - 1] ?? fade;
    // A change that tilts needs every layer inside the stage: the stage cuts a flat layer off at its edge, but not a tilted one.
    if (transition.needsRoom && !described.every(layer => layer.y >= 0 && layer.y + layer.height <= layer.stageHeight)) transition = slide;
    change = { transition, layers: described, handles: new Map() };
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
  /** The light under the sections, and the call that ends its layer's enrolment while the deck is on. */
  const light = createLight(controller, element(LIGHT_ID), () => reduced.matches, errors);
  let endLight: (() => void) | undefined;
  /** Changes between the flow and the deck, keeping section `index` in the window, scrolled `pan` px past its start. */
  function layout(deck: boolean, index: number, pan: number) {
    root.classList.toggle("deck", deck);
    endJump();
    lengths = undefined;
    if (!deck) { light.end(); try { endLight?.(); } catch { /* the runtime is gone */ } endLight = undefined; track.style.removeProperty("--track"); }
    pans = { from: 0, to: 0 };
    show(deck ? { deck, from: index, to: null } : flow);
    if (deck && !endLight) { try { endLight = controller.enroll(element(LIGHT_ID), { id: LIGHT_ID, decorative: true, origin: "top-left" }); } catch (error) { errors.push(`enroll ${LIGHT_ID}: ${String(error)}`); } }
    front = index;
    scrollTo({ top: offset(index) + (deck ? clamp(pan, 0, measured().pan[index]!) : Math.max(0, pan)), behavior: "instant" });
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
      // The change's own movement is on top of where the section has panned to.
      const pan = Math.round(layer.leaving ? pans.from : pans.to);
      transform(layer.id, pan ? { ...value, y: (value.y ?? 0) - pan } : value);
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
  /** Reads where the page is, changes what is on stage when it crosses into or out of a rest band, and poses it. */
  let reported = -1;
  function update() {
    if (view.deck) {
      const { from, to, t, panFrom, panTo } = place();
      pans = { from: panFrom, to: panTo };
      show({ deck: true, from, to });
      front = to !== null && t >= 0.5 ? to : from;
      // A jump runs on the clock: it needs every frame until it has arrived.
      if (pose(t) || jump) schedule();
      if (to === null) {
        // At rest the section is where its pan puts it: moved by its matrix, on whole pixels, as the flow scrolls.
        const pan = Math.round(panFrom), key = `${from}:${pan}`;
        if (key !== rested && gpu()) { rested = key; for (const id of layers(from)) transform(id, pan ? { y: -pan } : {}); }
        if (warm === "no") void warmUp();
      }
      // With reduced motion an effect draws nothing, so the light is left off.
      if (gpu() && endLight && !reduced.matches && light.frame()) schedule();
    }
    const now = current();
    if (now !== reported) onChange(reported = now);
  }
  let frame = 0;
  function schedule() { frame ||= requestAnimationFrame(() => { frame = 0; update(); }); }

  async function start() {
    if (view.deck || acting) return view.deck;
    acting = true;
    try {
      const before = scrollY, index = flowIndex(), pan = before - flowTop(index);
      layout(true, index, pan);
      mode = (await controller.enable()).mode;
      // Refused: the flow again, exactly where it was.
      if (!gpu()) { layout(false, index, pan); scrollTo({ top: before, behavior: "instant" }); }
    } finally { acting = false; }
    schedule();
    return view.deck;
  }
  async function stop() {
    if (acting) return;
    acting = true;
    try {
      const index = current(), pan = panned();
      mode = (await controller.disable()).mode;
      if (view.deck) layout(false, index, pan);
    } finally { acting = false; }
    schedule();
  }
  /** GPU presentation ended by itself (a lost device, a diagnosed fallback): the page is the flow again. */
  function modeChanged(next: CanvasStatus["mode"]) {
    mode = next;
    if (view.deck && !acting) queueMicrotask(() => { if (view.deck && !acting && !gpu()) layout(false, current(), panned()); });
    schedule();
  }

  addEventListener("scroll", () => {
    // Scrolling during a jump takes the stage back: the jump ends and the scroll position decides again.
    if (jump && Math.abs(scrollY - jump.offset) > 2) endJump();
    schedule();
  }, { passive: true });
  addEventListener("pointermove", () => { if (view.deck && light.behind()) schedule(); }, { passive: true });
  addEventListener("resize", () => {
    // In a window of another size the sections have other lengths: the page stays at the same place in the deck,
    // panned as far through its section, or as far through the change after it.
    if (view.deck) {
      const kept = where;
      lengths = undefined;
      const { start, pan, change: length } = measured();
      if (jump) jump.offset = trackTop() + start[jump.target]!;
      scrollTo({ top: jump ? jump.offset : trackTop() + start[kept.index]! + (kept.changed === null ? kept.panned * pan[kept.index]! : pan[kept.index]! + kept.changed * length), behavior: "instant" });
    }
    schedule();
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
    if (view.deck && section) go(Number(section.dataset.section), true);
  });
  // Focus moving into a parked section (Tab, a screen reader) brings that section on stage, panned so that what took
  // the focus is on the stage too.
  document.addEventListener("focusin", event => {
    const target = event.target as HTMLElement, layer = target.closest?.<HTMLElement>("[data-section]");
    const index = Number(layer?.dataset.section ?? NaN);
    if (!view.deck || !layer || !Number.isInteger(index) || index === view.from || index === view.to) return;
    const { stage, pan, top } = measured();
    const inside = target.getBoundingClientRect().top - layer.getBoundingClientRect().top + (top.get(layer.id) ?? 0);
    endJump();
    scrollTo({ top: offset(index) + clamp(inside - stage * 0.35, 0, pan[index]!), behavior: "instant" });
    schedule();
  });
  const paging = () => reduced.matches ? "instant" as const : "smooth" as const;
  // Paging keys page through a section that is taller than the stage, and from its end (or start) jump to the next
  // section (or the one before). A control that uses the key itself keeps it.
  addEventListener("keydown", event => {
    if (!view.deck || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as Element).closest?.("input, select, textarea, button, a, summary, [contenteditable], [tabindex]")) return;
    const forward = event.key === "PageDown" || (event.key === " " && !event.shiftKey), back = event.key === "PageUp" || (event.key === " " && event.shiftKey);
    const now = current();
    if ((forward || back) && view.to === null && !jump) {
      const { stage, pan } = measured(), left = forward ? pan[now]! - pans.from : pans.from;
      if (left > 8) { event.preventDefault(); scrollBy({ top: (forward ? 1 : -1) * Math.min(stage * 0.85, left), behavior: paging() }); return; }
    }
    const next = forward ? now + 1 : back ? now - 1 : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
    if (next === null) return;
    event.preventDefault();
    // At the last section the page scrolls on to the footer as usual.
    if (next >= count) scrollTo({ top: document.documentElement.scrollHeight, behavior: paging() });
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
  return { start, stop, go, idle, warmed, modeChanged, errors,
    place: () => view.deck ? place() : { from: flowIndex(), to: null, t: 0, panFrom: 0, panTo: 0 },
    lengths: () => view.deck ? { pans: [...measured().pan], starts: [...measured().start], change: measured().change } : null };
}
