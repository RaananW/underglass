/**
 * The live demonstration in the "Transitions" section of the preview home page: two panels in the same place, and
 * controls beside them that turn one into the other with any of the deck's changes, by a slider or on the clock.
 *
 * This module is the demonstration's state, shared by the React tree (`page.tsx`: the controls and the panels) and the
 * deck's driver (`deck.ts`, which draws it on the GPU). It imports nothing of Underglass, so it is also what runs the
 * demonstration in ordinary DOM, where the panels simply swap at the middle.
 *
 * `t` is how far the first panel has turned into the second: 0 shows the first, 1 the second. On the GPU both panels
 * are layers; between 0 and 1 the first is the leaving layer of the chosen change and the second the arriving one, so
 * scrubbing the slider back and forth is scrubbing the change. Both panels go on running meanwhile: each has a clock
 * that counts while the demonstration is in use.
 */

/** The changes on offer, in the order of `transitions.ts` (`kind` is an index into it). */
export const demoKinds = ["burn", "tilt", "water", "scan", "iris", "mosaic", "exposure"] as const;
/** The section the demonstration is in, and its two panels' ids (the first is the section's own specimen). */
export const demoPanels = { section: "transitions", first: "transitions-figure", second: "transitions-second" } as const;

export interface DemoState {
  /** 0 shows the first panel, 1 the second. */
  t: number;
  kind: number;
  /** A visitor has used the controls: the panels' clocks count from then on. */
  started: boolean;
  /** The deck says the section is at rest on stage (always true in ordinary DOM): the clocks count only then. */
  live: boolean;
  /** GPU presentation is on: both panels are drawn, and hidden or shown by their matrices, not by a class. */
  gpu: boolean;
  /** `play` is running the change on the clock. */
  playing: boolean;
}

let state: DemoState = { t: 0, kind: 0, started: false, live: true, gpu: false, playing: false };
const listeners = new Set<() => void>();
export const demoStore = {
  get: () => state,
  set(patch: Partial<DemoState>) {
    if ((Object.keys(patch) as (keyof DemoState)[]).every(key => state[key] === patch[key])) return;
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
    tick();
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

/** The panel that is hidden outright: the second while `t` is 0, the first once it is 1. */
export const demoHidden = (id: string) => id === demoPanels.second ? state.t <= 0 : id === demoPanels.first ? state.t >= 1 : false;

let frame = 0;
/** Runs the change to the other panel on the clock: about a second, or at once with reduced motion. */
export function demoPlay() {
  cancelAnimationFrame(frame);
  const from = state.t, to = from < 0.5 ? 1 : 0;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { demoStore.set({ t: to, started: true, playing: false }); return; }
  const began = performance.now(), ms = 1300 * Math.abs(to - from);
  demoStore.set({ started: true, playing: true });
  const step = (now: number) => {
    const progress = Math.min(1, (now - began) / ms), eased = progress * progress * (3 - 2 * progress);
    demoStore.set({ t: Math.round((from + (to - from) * eased) * 1000) / 1000, playing: progress < 1 });
    if (progress < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}
/** The slider moved: `t` follows it, and a change on the clock stops. */
export function demoScrub(t: number) {
  cancelAnimationFrame(frame);
  demoStore.set({ t: Math.min(1, Math.max(0, t)), started: true, playing: false });
}

/** Ends a change part way through: the nearer panel is shown. The deck calls it when the section leaves its rest. */
export function demoSettle() {
  cancelAnimationFrame(frame);
  demoStore.set({ t: state.t >= 0.5 ? 1 : 0, playing: false });
}

// The clocks: every element marked `data-demo-clock` shows the time the demonstration has been running, in tenths of a
// second. They count only once a visitor has used the controls and while the section is on stage, so a page nobody
// touches repaints nothing.
let elapsed = 0, last = 0, timer: ReturnType<typeof setInterval> | undefined;
function tick() {
  const run = state.started && state.live && typeof document !== "undefined" && !document.hidden;
  if (run && timer === undefined) {
    last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      elapsed += now - last; last = now;
      const tenths = Math.floor(elapsed / 100), text = `${String(Math.floor(tenths / 600)).padStart(2, "0")}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
      for (const clock of document.querySelectorAll("[data-demo-clock]")) if (clock.textContent !== text) clock.textContent = text;
    }, 100);
  } else if (!run && timer !== undefined) { clearInterval(timer); timer = undefined; }
}
if (typeof document !== "undefined") document.addEventListener("visibilitychange", tick);
