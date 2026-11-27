/**
 * The deck's driver for the preview home page: plain DOM code beside the React tree (`page.tsx`), built on what
 * `docs/showcase-deck-probe.md` proved.
 *
 * The page is one document with two layouts. The **flow** is ordinary DOM: the sections follow each other down the
 * page. The **deck** is the GPU presentation: `html.deck` makes the stage stick to the window (`home.css`) while a
 * track scrolls past, and the scroll position decides what is on stage. The deck is the flow with the crossing from
 * one section to the next replaced by a change:
 *
 * - The deck is a row of **stops**, each one stage's worth of the page. Where the page has two columns a stop is a
 *   section: its text beside its specimen. Where it has one (a phone), a section is two stops, its text and then its
 *   specimen, so that each fits the screen and a change always lands on a whole page; the change between the two is
 *   another of the deck's.
 * - A stop taller than the stage (in a short window) **pans**: while the scroll position is inside the stop's own
 *   length, it moves up the stage as the flow would scroll it, by its matrix. After that comes one window of scrolling
 *   for the change to the next stop. A stop that fits the stage has no pan, only the change.
 * - At each end of a change is a **rest band**: there one section is alone on stage and interactive. Between the bands
 *   the two sections are both on stage and `pose` runs the change between them (`transitions.ts`: one per boundary).
 *   Only matrices (`setTransform`) and effect parameters (`handle.update`) are written, so neither panning nor
 *   scrolling through a change captures anything. Nothing in the document changes during a change either: a layer
 *   that is not seen is shrunk away by its matrix, so that it takes no click meant for the layer under it.
 * - Only the sections on stage are enrolled as layers (`controller.enroll`). The view (`view.ts`) tells React which to
 *   park, inside `flushSync`, so a change starts in the frame its sections are enrolled.
 * - The layout changes to the deck before `enable()` and back to the flow whenever the mode returns to `dom` (a
 *   refusal, `disable()`, a lost GPU). The section in the window, and how far it has scrolled, stay the same.
 * - `enable()` proves in the stage's top left corner that native hits follow a tilted layer. The header lies over that
 *   corner, so while the check runs the header takes no pointer (`html.checking`). Where the
 *   proof still fails, a change that tilts runs as the flat `slide`.
 * - A custom effect's shader is compiled when it is first used, which stalls the page for a few frames. So after the
 *   deck has started, each change's chain is put once on an empty layer in the stage's corner, in idle moments, and
 *   the first scroll into a change finds its shader ready (`warm`).
 * - A link to a section and the paging keys (Page Up, Page Down, Space, Home, End) **jump**: the stage changes straight
 *   from the section on it to the one asked for, in about a second, with one change, however many sections lie
 *   between. The scroll position is set to the target at once and the change runs on the clock, so a jump over five
 *   sections does not race through five changes. Scrolling during a jump ends it. Focus moving into a parked section
 *   brings that section on stage at once.
 * - The stage follows the scroll position, but runs a change in no less than `changeMs`: a fast scroll (a trackpad's
 *   fling) shows each change it passes, and the stage catches up when the scroll stops. A stage at rest that is two
 *   stops or more behind jumps to where the scroll is instead, as the paging keys do.
 * - A scroll of the visitor's that stops part way through a change, outside the rest bands, **settles**: after a short
 *   pause the page scrolls on to the next rest, or back where the change had barely begun, so the page comes to rest
 *   with a section that takes input. A scroll made by a script does not settle. The side scale's cursor shows which:
 *   lit on the section at rest, hollow while the stage changes (`flow.ts`).
 * - A decorative layer under the sections carries a light that follows the pointer (`light.ts`).
 * - The "Transitions" section holds a live demonstration (`demo.ts`): two panels in one place, each a layer, and
 *   controls that turn one into the other. While that section is at rest the driver poses the two panels from the
 *   demonstration's state, with the same changes it runs between sections.
 */
import { flushSync } from "react-dom";
import type { CanvasController, CanvasStatus, EffectHandle, Transform } from "@underglass/react";
import { demoHidden, demoPanels, demoSettle, demoStore } from "./demo";
import { flowIndex, holdTravel, travelAt, travelNow } from "./flow";
import { createLight, LIGHT_ID } from "./light";
import { fade, slide, transitions, type StageLayer, type Transition } from "./transitions";
import { flow, viewStore, type View } from "./view";

/** The part of a change's scroll length, at each end, where one section is at rest. */
const band = 0.14;
/** How long a jump's change takes, ms; with reduced motion it is a short fade. */
const jumpMs = 950, calmJumpMs = 320;
/** The shortest time a change takes on stage however fast the page scrolls, ms. */
const changeMs = 520;
/** How long after the visitor's last scrolling input a scroll that ends is still theirs (a fling runs on), ms. */
const gestureMs = 2500;
/** How long a scroll of the visitor's has to have stopped before a change it left part way is finished, ms. */
const pauseMs = 380;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * Where the page is in the deck: the stop at rest or leaving, the one arriving (null at rest), the progress of the
 * change between them, and how far each has panned up the stage, CSS px.
 */
export interface Place { from: number; to: number | null; t: number; panFrom: number; panTo: number }

export interface Deck {
  /** Lays the page out as the deck and enables GPU presentation. Resolves to whether the deck is on. */
  start(): Promise<boolean>;
  /** Returns to ordinary DOM and the flow. */
  stop(): Promise<void>;
  /** Brings a section on stage (its first stop): at once, or with `smooth` by a jump in the deck and a smooth scroll in the flow. */
  go(index: number, smooth?: boolean): void;
  /** Brings a stop on stage, at once (for tests). */
  goStop(index: number): void;
  /** The deck's stops: each one's section and layers (for tests). */
  stops(): { section: number; ids: string[] }[];
  /** Waits until the driver has nothing pending and the runtime has presented what it was given (for tests). */
  idle(): Promise<void>;
  /** Where the page is, as the deck reads it. */
  place(): Place;
  /** The deck's lengths, CSS px: how far each stop pans, and the scroll offset in the track at which each starts (for tests). */
  lengths(): { pans: number[]; starts: number[]; change: number } | null;
  /** Resolves when the changes' shaders have been compiled ahead of use, or at once when they will not be (for tests). */
  warmed(): Promise<void>;
  /** Tell the driver the runtime status changed (`onStatusChange`): a mode that fell back to `dom` returns the page to the flow. */
  modeChanged(mode: CanvasStatus["mode"]): void;
  /** Errors from the driver's controller calls: none are expected. */
  errors: string[];
}

export function createDeck({ controller, ids, track, onChange, onTransition, onPlace }: {
  controller: CanvasController;
  /** The sections' ids in page order. A section's layers are the root's children marked with its index (`data-section`). */
  ids: readonly string[];
  /** The element as long as the scroll range of the sections; the pin and the stage are inside it. */
  track: HTMLElement;
  /** Called when another section becomes the current one. */
  onChange(current: number): void;
  /** Called when a change between two sections starts, with its name, and with null when the stage comes to rest. */
  onTransition?(name: string | null): void;
  /** Called on every frame the deck draws, with the section at rest or leaving, the one arriving (null at rest) and the change's progress. */
  onPlace?(from: number, to: number | null, t: number): void;
}): Deck {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"), stacked = matchMedia("(max-width: 920px)");
  const pin = track.firstElementChild as HTMLElement;
  const errors: string[] = [];
  /** True while `start` or `stop` runs, so a status change inside them is not taken for a lost GPU. */
  let acting = false;
  let view = flow;
  const element = (id: string) => document.getElementById(id)!;
  /**
   * One stage's worth of the page: a section's layers, or in one column its text or its specimen (`first` is false for
   * the specimen's stop). A section's layers are the root's children marked with its index (`data-section`), in page
   * order: its text, then what belongs to its specimen (`data-part="figure"`: the specimen, a second panel in its place
   * and, in one column, the demonstration's controls above them). An element the layout does not show is no layer.
   */
  interface Stop { section: number; ids: string[]; first: boolean }
  const sectionElements = ids.map((_, index) => [...document.querySelectorAll<HTMLElement>(`.app-container > [data-section="${index}"]`)]);
  function buildStops(): Stop[] {
    return sectionElements.flatMap((all, section) => {
      const shown = all.filter(layer => getComputedStyle(layer).display !== "none");
      const text = shown.filter(layer => layer.dataset.part !== "figure").map(layer => layer.id), figure = shown.filter(layer => layer.dataset.part === "figure").map(layer => layer.id);
      return stacked.matches && text.length && figure.length ? [{ section, ids: text, first: true }, { section, ids: figure, first: false }] : [{ section, ids: [...text, ...figure], first: true }];
    });
  }
  let stops = buildStops(), builtStacked = stacked.matches;
  const layers = (index: number) => stops[index]!.ids;
  const firstStop = (section: number) => Math.max(0, stops.findIndex(stop => stop.section === section));
  /** The stop a layer is in, or the first stop of its section when the layout does not show it. */
  const stopOf = (layer: HTMLElement) => { const index = stops.findIndex(stop => stop.ids.includes(layer.id)); return index >= 0 ? index : firstStop(Number(layer.dataset.section)); };
  /** The view of the deck with these stops on stage. */
  const staged = (from: number, to: number | null): View => ({ deck: true, from, to, ids: to === null ? layers(from) : [...layers(from), ...layers(to)] });
  /** The runtime's mode, kept from its status reports: `state()` copies every metric and measures every layer, so the frame loop never calls it. */
  let mode = controller.state().mode;
  const gpu = () => mode === "gpu";
  /** Whether the last check proved that native hits follow a tilted layer: the runtime refuses a tilt without it. */
  let tilts = false;
  /** Takes the runtime's mode; the demonstration is told whether its panels are drawn by the GPU. */
  function took(next: CanvasStatus["mode"]) {
    mode = next;
    if (next !== "admitting") tilts = gpu() && controller.state().metrics.admission.last?.projective?.result === "proven";
    demoStore.set({ gpu: gpu() });
  }
  const trackTop = () => track.getBoundingClientRect().top + scrollY;

  /**
   * The deck's lengths, CSS px. `stage` is the stage's height and `change` the scroll length of a change (one window).
   * Stop `i` starts at `start[i]` in the track, pans for `pan[i]` (how much taller than the stage it is, with its
   * margins) and is followed by a change. `end` is where the last stop has panned out: the track's scroll range.
   */
  interface Lengths { stage: number; change: number; pan: number[]; start: number[]; end: number; top: Map<string, number> }
  let lengths: Lengths | undefined;
  /**
   * Measures the deck (only in the deck's layout). Parked layers are laid out for the measurement, and nothing is
   * painted meanwhile. In one column the demonstration's controls lie above its panels: each panel is told their
   * height (`--above`), because in the deck every layer lies in one grid cell and that cannot come from the grid.
   */
  function measure(): Lengths {
    root.classList.add("measuring");
    try {
      const container = element(layers(0)[0]!).offsetParent as HTMLElement;
      const stage = container.clientHeight, change = pin.clientHeight, top = new Map<string, number>();
      const give = (layer: HTMLElement, name: string, value: string) => {
        if (layer.style.getPropertyValue(name) !== value) { if (value) layer.style.setProperty(name, value); else layer.style.removeProperty(name); }
      };
      const pan = stops.map(stop => {
        const all = stop.ids.map(element), panels = all.filter(layer => layer.classList.contains("specimen")), bar = all.find(layer => layer.classList.contains("demo-bar"));
        for (const panel of panels) give(panel, "--above", stacked.matches && bar ? `${bar.offsetHeight + 12}px` : "");
        // A second panel in the specimen's place is at least as tall as the specimen: it covers it.
        for (const panel of panels.slice(1)) give(panel, "--match", `${panels[0]!.offsetHeight}px`);
        let bottom = 0;
        for (const layer of all) {
          top.set(layer.id, layer.offsetTop);
          bottom = Math.max(bottom, layer.offsetTop + layer.offsetHeight + parseFloat(getComputedStyle(layer).marginBottom));
        }
        return Math.max(0, Math.ceil(bottom - stage));
      });
      const start: number[] = [];
      let at = 0;
      for (const length of pan) { start.push(at); at += length + change; }
      const end = start[stops.length - 1]! + pan[stops.length - 1]!;
      // The pin sticks while the track scrolls past it: the track is the scroll range and one window more.
      track.style.setProperty("--track", `${end + change}px`);
      return { stage, change, pan, start, end, top };
    } finally { root.classList.remove("measuring"); }
  }
  const measured = () => lengths ??= measure();

  /** Where the scroll position is, in a form that survives a resize: the stop, how much of its pan is done (0 to 1), and how much of the change after it (null while it pans). */
  let where = { index: 0, panned: 0, changed: null as number | null };
  /**
   * A jump in progress: the stage is changing between `low` and `high` on the clock (toward `high` when `forward`),
   * with the scroll position already at the target's start. `pan` is how far the section it started from had panned.
   * A jump that `follows` was started by a fast scroll: the scroll position goes on moving, and does not end it.
   */
  let jump: { low: number; high: number; forward: boolean; target: number; began: number; ms: number; offset: number; travelFrom: number; pan: number; follows: boolean } | undefined;
  /** Starts a jump from stop `from`, panned by `pan`, to the start of stop `target` (document offset `top`). */
  function leap(from: number, target: number, pan: number, top: number, follows: boolean) {
    const travelFrom = travelNow();
    jump = { low: Math.min(from, target), high: Math.max(from, target), forward: target > from, target, began: performance.now(), ms: reduced.matches ? calmJumpMs : jumpMs,
      offset: top, travelFrom, pan, follows };
    holdTravel(travelFrom);
  }
  /** Ends a jump where it is: the scroll position decides again, and the background follows it again. */
  function endJump() { if (jump) { jump = undefined; holdTravel(null); } shown = null; }
  /**
   * The track offset the stage shows. It follows the scroll position, but no faster than one change in `changeMs`: a
   * fast scroll (a trackpad's fling) still shows each change it passes, and the stage catches up when it stops. Where
   * the stage, at rest, is two stops or more behind, it jumps to where the scroll is instead (`follows`), as the paging
   * keys do. Null: the stage is exactly where the scroll is.
   */
  let shown: number | null = null, shownAt = 0;
  /** True while the stage is behind the scroll position: the frame loop goes on. */
  let lagging = false;
  /** The stop whose start is at or before a track offset. */
  function stopAt(offset: number) {
    const { start } = measured();
    let index = stops.length - 1;
    while (index > 0 && offset < start[index]!) index--;
    return index;
  }
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
      // A jump that followed a scroll lands at its target's start, and the stage goes on from there toward the scroll.
      const landed = jump.follows ? measured().start[jump.target]! : null;
      endJump();
      shown = landed;
    }
    const { change, pan, start, end } = measured();
    const now = performance.now(), scrolled = clamp(scrollY - trackTop(), 0, end);
    if (shown === null || reduced.matches || !gpu()) shown = scrolled;
    else if (shown !== scrolled) {
      const step = change * Math.min(50, now - shownAt) / changeMs;
      shown = Math.abs(scrolled - shown) <= step ? scrolled : shown + Math.sign(scrolled - shown) * step;
    }
    shownAt = now;
    lagging = shown !== scrolled;
    const offset = shown;
    const index = stopAt(offset);
    const within = offset - start[index]!, room = pan[index]!;
    // At rest (in its pan or a rest band) and two stops or more behind the scroll: one change on the clock instead.
    const resting = within <= room + band * change ? index : index < stops.length - 1 && within >= room + (1 - band) * change ? index + 1 : null;
    if (lagging && resting !== null) {
      const target = stopAt(scrolled);
      if (Math.abs(target - resting) >= 2) {
        leap(resting, target, resting === index ? Math.min(within, room) : 0, trackTop() + start[target]!, true);
        return place();
      }
    }
    if (within <= room || index === stops.length - 1) {
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
  /** In the deck, the stop that reads as the current one: the one arriving from the middle of a change on. */
  let front = 0;
  /** In the flow, the stop whose part of the page the middle of the window is in. */
  function flowStop() {
    let index = 0;
    for (let stop = 1; stop < stops.length; stop++) if (flowTop(stop) <= scrollY + innerHeight / 2) index = stop;
    return index;
  }
  const current = () => view.deck ? front : flowStop();
  /** How far the current stop has panned (0 in the flow's terms: its top is at the top of the window). */
  const panned = () => view.deck ? (front === view.from ? pans.from : pans.to) : 0;
  /** In the flow, the document offset of the top of a stop: its first layer starts its top margin below that. */
  function flowTop(index: number) {
    const head = element(layers(index)[0]!);
    return scrollY + head.getBoundingClientRect().top - parseFloat(getComputedStyle(head).marginTop);
  }
  /** The document offset at which a stop starts: in the deck where it is at rest at its top, in the flow its top. */
  const offset = (index: number) => view.deck ? trackTop() + measured().start[index]! : Math.max(0, Math.round(flowTop(index)));
  function go(index: number, smooth = false) {
    const target = clamp(index, 0, stops.length - 1), top = offset(target);
    // In the deck a smooth move is a jump: one change from the section on stage to the target, on the clock.
    if (smooth && view.deck && gpu() && target !== front) {
      endJump();
      leap(front, target, panned(), top, false);
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
   *
   * The same holds for a layer that rests hidden (the demonstration's panel that is not showing): it is written
   * hidden here, never as it rests. The runtime draws at each write, and once `show` enrols the arriving layers it
   * holds the last complete frame until they are captured. A pose written here is in that frame; one written after
   * the enrolment is not seen until the hold ends, a few frames later.
   */
  function release(staying: ReadonlySet<string>) {
    const handles = change?.handles;
    change = undefined;
    rested = "";
    // In the flow nothing is enrolled, so there is nothing to release.
    if (!view.deck) return;
    for (const id of view.ids) {
      if (!staying.has(id)) { transform(id, { opacity: 0 }); continue; }
      try { handles?.get(id)?.cancel(); } catch { /* already ended */ }
      transform(id, demoHidden(id) ? { opacity: 0 } : {});
    }
  }
  /** A layer where it rests, which for a section that has panned by `pan` is that much further up the stage. */
  function describe(id: string, leaving: boolean, figure: boolean, pan: number): StageLayer {
    const layer = element(id), stage = layer.offsetParent as HTMLElement;
    return { id, leaving, figure, x: layer.offsetLeft, y: layer.offsetTop - Math.round(pan), width: layer.offsetWidth, height: layer.offsetHeight,
      stageWidth: stage.clientWidth, stageHeight: stage.clientHeight };
  }
  /**
   * The change to run between these layers: `wanted`, a fade with reduced motion, or the flat `slide` where the change
   * tilts and either a layer is not inside the stage (the stage cuts a flat layer off at its edge, but not a tilted
   * one) or this browser's check did not prove hits on a tilted layer.
   */
  function fitting(wanted: Transition | undefined, described: readonly StageLayer[]) {
    const transition = reduced.matches ? fade : wanted ?? fade;
    return transition.needsRoom && !(tilts && described.every(layer => layer.y >= 0 && layer.y + layer.height <= layer.stageHeight)) ? slide : transition;
  }
  /**
   * The change that leads into a stop: into a section's first stop, the one of the boundary before that section; into
   * its specimen's stop (one column), another of the deck's, chosen so that it differs from the two around it.
   */
  const changeInto = (index: number) => { const stop = stops[index]!; return transitions[stop.first ? stop.section - 1 : (stop.section + 4) % transitions.length]; };
  /** Describes the change for the two stops now on stage (none at rest). */
  function prepare() {
    const { from, to } = view;
    if (!view.deck || to === null) { change = undefined; onTransition?.(null); return; }
    const specimen = (id: string) => element(id).classList.contains("specimen");
    const described = [...layers(from).map(id => describe(id, true, specimen(id), pans.from)), ...layers(to).map(id => describe(id, false, specimen(id), pans.to))];
    // Two neighbours change as their boundary does; a jump over several stops uses the change that leads into the further one.
    change = { transition: fitting(changeInto(to), described), layers: described, handles: new Map() };
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
    if (next.deck === view.deck && next.from === view.from && next.to === view.to && next.ids.join() === view.ids.join()) return;
    // The demonstration's stop leaves its rest: a change part way through is settled, and its panels are the deck's again.
    if (view.deck && view.to === null && view.ids.includes(demoPanels.first)) { endDemo(); demoSettle(); }
    const wanted = new Set(next.ids);
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
    if (!deck) { light.end(); try { endLight?.(); } catch { /* the runtime is gone */ } endLight = undefined; track.style.removeProperty("--track"); endDemo(); demoStore.set({ live: true }); }
    pans = { from: 0, to: 0 };
    show(deck ? staged(index, null) : flow);
    if (deck && !endLight) { try { endLight = controller.enroll(element(LIGHT_ID), { id: LIGHT_ID, decorative: true, origin: "top-left" }); } catch (error) { errors.push(`enroll ${LIGHT_ID}: ${String(error)}`); } }
    front = index;
    scrollTo({ top: offset(index) + (deck ? clamp(pan, 0, measured().pan[index]!) : Math.max(0, pan)), behavior: "instant" });
    schedule();
  }
  /**
   * Gives one layer its place in a change at progress `t`: its transform, on top of where its section has panned to,
   * and, where the change has effects, its chain's parameters. The chain is attached on the first frame the runtime
   * takes it; until then an arriving layer is held unseen, so it never shows whole before its effect does. Returns
   * true while the chain is still to be attached.
   */
  function run(transition: Transition, handles: Map<string, EffectHandle>, layer: StageLayer, t: number, pan: number) {
    if (!enrolled.has(layer.id)) return false;
    let handle = handles.get(layer.id), pending = false;
    if (transition.chain && !handle) {
      try {
        const attached = controller.setEffects(layer.id, transition.chain(layer));
        handles.set(layer.id, handle = attached);
        void attached.finished.then(() => { if (handles.get(layer.id) === attached) handles.delete(layer.id); });
      } catch (error) {
        // Not ready for effects in this frame (admission or a swap is in progress): tried again in the next.
        if (/idle DOM or admitted GPU|mount has not completed/.test(String(error))) pending = true;
        else errors.push(`setEffects ${layer.id}: ${String(error)}`);
      }
    }
    if (transition.chain && !handle) { if (!layer.leaving) transform(layer.id, { opacity: 0 }); return pending; }
    const { transform: value, parameters } = transition.frame(t, layer);
    transform(layer.id, pan ? { ...value, y: (value.y ?? 0) - pan } : value);
    if (parameters && handle) { try { handle.update(parameters); } catch (error) { handles.delete(layer.id); errors.push(`update ${layer.id}: ${String(error)}`); } }
    return pending;
  }
  /** Runs the change between the two sections on stage at progress `t`. Returns true while a chain is still to be attached. */
  function pose(t: number) {
    if (!change || !gpu()) return false;
    let pending = false;
    for (const layer of change.layers) {
      // The demonstration's panel that is not showing stays hidden through the change.
      if (demoHidden(layer.id)) { transform(layer.id, { opacity: 0 }); continue; }
      if (run(change.transition, change.handles, layer, t, Math.round(layer.leaving ? pans.from : pans.to))) pending = true;
    }
    return pending;
  }
  /** The live demonstration: its section, and the chains its two panels carry while one is turning into the other. */
  const demoHandles = new Map<string, EffectHandle>();
  /** What the demonstration last drew: nothing is written while that has not changed. */
  let demoDrawn = "", demoKind = -1;
  function endDemo() {
    for (const handle of demoHandles.values()) { try { handle.cancel(); } catch { /* already ended */ } }
    demoHandles.clear();
    demoDrawn = ""; demoKind = -1;
  }
  /**
   * Draws the demonstration while its section is at rest, panned by `pan`: at either end one panel is shown and the
   * other hidden; between, the first is the leaving layer and the second the arriving one of the chosen change, at the
   * demonstration's `t`. Returns true while a chain is still to be attached.
   */
  function drawDemo(pan: number) {
    const { t, kind } = demoStore.get(), drawing = `${pan}:${t}:${kind}:${reduced.matches}`;
    if (drawing === demoDrawn) return false;
    const resting = pan ? { y: -pan } : {};
    if (t <= 0 || t >= 1) {
      endDemo();
      transform(demoPanels.first, t >= 1 ? { opacity: 0 } : resting);
      transform(demoPanels.second, t <= 0 ? { opacity: 0 } : resting);
      demoDrawn = drawing;
      return false;
    }
    const panels = [describe(demoPanels.first, true, true, pan), describe(demoPanels.second, false, true, pan)];
    // Another change was picked part way through: the chains of the one before end first.
    if (kind !== demoKind) { endDemo(); demoKind = kind; }
    const transition = fitting(transitions[kind], panels);
    let pending = false;
    for (const panel of panels) if (run(transition, demoHandles, panel, t, pan)) pending = true;
    if (!pending) demoDrawn = drawing;
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
      show(staged(from, to));
      front = to !== null && t >= 0.5 ? to : from;
      onPlace?.(stops[from]!.section, to === null ? null : stops[to]!.section, t);
      // A jump runs on the clock, and a stage behind the scroll catches up: each needs every frame until it has arrived.
      if (pose(t) || jump || lagging) schedule();
      const demo = layers(from).includes(demoPanels.first);
      demoStore.set({ live: to === null && demo });
      if (to === null) {
        // At rest the section is where its pan puts it: moved by its matrix, on whole pixels, as the flow scrolls.
        // The demonstration's two panels are posed by the demonstration.
        const pan = Math.round(panFrom), key = `${from}:${pan}`;
        if (key !== rested && gpu()) {
          rested = key; demoDrawn = "";
          for (const id of layers(from)) if (!demo || (id !== demoPanels.first && id !== demoPanels.second)) transform(id, pan ? { y: -pan } : {});
        }
        if (demo && gpu() && drawDemo(pan)) schedule();
        if (warm === "no") void warmUp();
      }
      // With reduced motion an effect draws nothing, so the light is left off.
      if (gpu() && endLight && !reduced.matches && light.frame()) schedule();
    }
    const now = view.deck ? stops[front]!.section : flowIndex();
    if (now !== reported) onChange(reported = now);
  }
  /**
   * The window crossed between one column and two: the stops are others. In the deck the stage is cleared and set
   * again with the first stop of the section it showed.
   */
  function restack() {
    if (stacked.matches === builtStacked) return;
    const section = stops[Math.min(view.deck ? where.index : 0, stops.length - 1)]!.section, deck = view.deck;
    if (deck) { endJump(); show(flow); }
    stops = buildStops(); builtStacked = stacked.matches;
    lengths = undefined; shown = null; pans = { from: 0, to: 0 };
    if (!deck) return;
    const index = firstStop(section);
    show(staged(index, null));
    front = index;
    where = { index, panned: 0, changed: null };
    scrollTo({ top: offset(index), behavior: "instant" });
  }
  let frame = 0;
  function schedule() { frame ||= requestAnimationFrame(() => { frame = 0; update(); }); }

  async function start() {
    if (view.deck || acting) return view.deck;
    acting = true;
    try {
      restack();
      const before = scrollY, index = flowStop(), pan = before - flowTop(index);
      layout(true, index, pan);
      // The check hit-tests a probe in the stage's corner: nothing of the header is to take those points.
      root.classList.add("checking");
      try { took((await controller.enable()).mode); } finally { root.classList.remove("checking"); }
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
      took((await controller.disable()).mode);
      if (view.deck) layout(false, index, pan);
    } finally { acting = false; }
    schedule();
  }
  /** GPU presentation ended by itself (a lost device, a diagnosed fallback): the page is the flow again. */
  function modeChanged(next: CanvasStatus["mode"]) {
    took(next);
    if (view.deck && !acting) queueMicrotask(() => { if (view.deck && !acting && !gpu()) layout(false, current(), panned()); });
    schedule();
  }

  /** When the visitor last gave scrolling input, and which way the page last scrolled (1 down, -1 up). */
  let inputAt = -Infinity, heading = 0, lastY = scrollY;
  /**
   * A scroll of the visitor's that stops part way through a change finishes it, or takes it back where it had barely
   * begun: the page comes to rest with one section on stage, which takes input. It waits for a pause (`pauseMs`): a
   * wheel ends a scroll at every notch. The stage runs the rest of the change no faster than `changeMs`. A scroll made
   * by a script, and one that stops in a rest band (the stage is at rest there), are left where they are.
   */
  let pause = 0;
  function settleSoon() { clearTimeout(pause); pause = window.setTimeout(settle, pauseMs); }
  function settle() {
    if (!view.deck || !gpu() || performance.now() - inputAt > gestureMs) return;
    if (jump) { settleSoon(); return; }
    const { change, pan, start, end } = measured(), scrolled = clamp(scrollY - trackTop(), 0, end), index = stopAt(scrolled);
    const within = scrolled - start[index]!, room = pan[index]!;
    if (index === stops.length - 1 || within <= room) return;
    const changed = (within - room) / change;
    if (changed <= band || changed >= 1 - band) return;
    const forward = heading < 0 ? changed > 0.7 : changed > 0.3;
    const top = trackTop() + (forward ? start[index + 1]! : start[index]! + room);
    if (Math.abs(top - scrollY) > 1) scrollTo({ top, behavior: reduced.matches ? "instant" : "smooth" });
  }
  // Scrolling input: a wheel or a trackpad, a finger, a scrolling key, and a press on the scrollbar (its target is the root).
  const scrollKeys = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", " ", "Home", "End"]);
  const scrolling = (event: Event) => {
    if (event.type === "keydown" && !scrollKeys.has((event as KeyboardEvent).key)) return;
    if (event.type === "pointerdown" && event.target !== root) return;
    inputAt = performance.now(); clearTimeout(pause);
  };
  for (const type of ["wheel", "touchmove", "keydown", "pointerdown"]) addEventListener(type, scrolling, { passive: true });
  addEventListener("scroll", () => {
    if (scrollY !== lastY) { heading = Math.sign(scrollY - lastY); lastY = scrollY; }
    clearTimeout(pause);
    // Scrolling during a jump takes the stage back: the jump ends and the scroll position decides again. A jump that
    // follows a fast scroll is not ended by it.
    if (jump && !jump.follows && Math.abs(scrollY - jump.offset) > 2) endJump();
    schedule();
  }, { passive: true });
  addEventListener("scrollend", settleSoon);
  addEventListener("pointermove", () => { if (view.deck && light.behind()) schedule(); }, { passive: true });
  addEventListener("resize", () => {
    // In a window of another size the sections have other lengths: the page stays at the same place in the deck,
    // panned as far through its section, or as far through the change after it.
    restack();
    if (view.deck) {
      const kept = where;
      lengths = undefined; shown = null;
      const { start, pan, change: length } = measured();
      if (jump) jump.offset = trackTop() + start[jump.target]!;
      scrollTo({ top: jump ? jump.offset : trackTop() + start[kept.index]! + (kept.changed === null ? kept.panned * pan[kept.index]! : pan[kept.index]! + kept.changed * length), behavior: "instant" });
    }
    schedule();
  });
  // The preference decides which change runs: the one on stage starts over as the other.
  reduced.addEventListener("change", () => { if (change) { release(new Set(enrolled.keys())); prepare(); } endDemo(); schedule(); });
  // The demonstration's controls moved: a frame draws it.
  demoStore.subscribe(schedule);
  // A link to a place in the page: in the deck its target is stacked on the stage, so the driver scrolls to its section.
  document.addEventListener("click", event => {
    const link = (event.target as Element).closest?.<HTMLAnchorElement>("a[href^='#']");
    if (!link || !view.deck || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const section = document.getElementById(link.hash.slice(1))?.closest<HTMLElement>("[data-section]");
    if (!section) return;
    event.preventDefault();
    history.pushState(null, "", link.hash);
    go(stopOf(section), true);
  });
  // Back and forward between links followed in the deck.
  addEventListener("popstate", () => {
    const section = document.getElementById(location.hash.slice(1))?.closest<HTMLElement>("[data-section]");
    if (view.deck && section) go(stopOf(section), true);
  });
  // Focus moving into a parked layer (Tab, a screen reader) brings its stop on stage, panned so that what took the
  // focus is on the stage too.
  document.addEventListener("focusin", event => {
    const target = event.target as HTMLElement, layer = target.closest?.<HTMLElement>(".app-container > [data-section]");
    if (!view.deck || !layer || view.ids.includes(layer.id)) return;
    const index = stopOf(layer);
    const { stage, pan, top } = measured();
    const inside = target.getBoundingClientRect().top - layer.getBoundingClientRect().top + (top.get(layer.id) ?? 0);
    endJump();
    scrollTo({ top: offset(index) + clamp(inside - stage * 0.35, 0, pan[index]!), behavior: "instant" });
    schedule();
  });
  const paging = () => reduced.matches ? "instant" as const : "smooth" as const;
  // Paging keys page through a stop that is taller than the stage, and from its end (or start) jump to the next stop
  // (or the one before). A control that uses the key itself keeps it.
  addEventListener("keydown", event => {
    if (!view.deck || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if ((event.target as Element).closest?.("input, select, textarea, button, a, summary, [contenteditable], [tabindex]")) return;
    const forward = event.key === "PageDown" || (event.key === " " && !event.shiftKey), back = event.key === "PageUp" || (event.key === " " && event.shiftKey);
    const now = current();
    if ((forward || back) && view.to === null && !jump) {
      const { stage, pan } = measured(), left = forward ? pan[now]! - pans.from : pans.from;
      if (left > 8) { event.preventDefault(); scrollBy({ top: (forward ? 1 : -1) * Math.min(stage * 0.85, left), behavior: paging() }); return; }
    }
    const next = forward ? now + 1 : back ? now - 1 : event.key === "Home" ? 0 : event.key === "End" ? stops.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    // At the last stop the page scrolls on to the footer as usual.
    if (next >= stops.length) scrollTo({ top: document.documentElement.scrollHeight, behavior: paging() });
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
  return { start, stop, idle, warmed, modeChanged, errors,
    go: (section, smooth) => go(firstStop(section), smooth), goStop: index => go(index),
    stops: () => stops.map(stop => ({ section: stop.section, ids: [...stop.ids] })),
    place: () => view.deck ? place() : { from: flowStop(), to: null, t: 0, panFrom: 0, panTo: 0 },
    lengths: () => view.deck ? { pans: [...measured().pan], starts: [...measured().start], change: measured().change } : null };
}
