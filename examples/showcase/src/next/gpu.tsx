/**
 * The preview home page where the deck can run (`main.ts` decides). The build has already rendered the page
 * (`prerender.tsx`): the header, the side scale and the footer as static markup, and the stage as a prerendered
 * Underglass root. This adopts the stage's hosts and hydrates the application in them, so the served elements are the
 * ones the GPU later draws.
 *
 * It then starts the deck's driver (`deck.ts`) and wires the static controls: the readout in the header (how the stage
 * is drawn, and its switch) and the side scale's mark for the section in the window. The deck starts by itself; a
 * visitor who switches it off stays in the flow for the rest of the session.
 */
import { createCanvasHosts, mountCanvasApp, type CanvasStatus } from "@underglass/react";
import { detectSupport, explain } from "../support";
import { createDeck, type Deck } from "./deck";
import { ids, markRail, note } from "./flow";
import { Stage } from "./page";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const switcher = $<HTMLButtonElement>("deck-switch"), modeText = $("deck-mode"), figures = $("deck-figures");
/** Remembers that the visitor switched the deck off, for this tab. */
const preference = { get off() { try { return sessionStorage.getItem("underglass-deck") === "off"; } catch { return false; } },
  set off(value: boolean) { try { if (value) sessionStorage.setItem("underglass-deck", "off"); else sessionStorage.removeItem("underglass-deck"); } catch { /* no storage */ } } };

let status: CanvasStatus | undefined;
// The runtime reports its first status while it mounts, before the driver exists.
let driver: Deck | undefined;
const controller = mountCanvasApp({
  ...createCanvasHosts($("stage")), hydrate: true,
  // Four layers at most are on stage (two sections of two), each as tall as its section: the budget covers them on a
  // phone's dense display, where a section is several screens of pixels.
  budgets: { layers: 16, pixels: 16_000_000 },
  onStatusChange(value) {
    const lost = status?.mode === "gpu" && value.mode === "dom" && !/^Explicit disable/.test(value.reason);
    status = value; driver?.modeChanged(value.mode);
    if (driver) render();
    if (lost) recover(value.reason);
  },
}, <Stage base={import.meta.env.BASE_URL} />);
const deck = driver = createDeck({ controller, ids, track: $("track"), onChange(current) {
  markRail(current);
  if (driver) render();
}, onTransition(name) {
  // The readout names the change while it runs.
  const label = $("deck-change");
  label.hidden = name === null;
  if (name !== null) label.textContent = name;
} });

const support = detectSupport();
/** Why GPU presentation is not on, in a sentence, or an empty string. */
let reason = support === "likely" ? "" : "GPU presentation needs Chrome or Edge 157 or later. This is the same page as ordinary DOM.";
/** Fills the readout: the mode, and on the GPU what the stage holds and costs. */
function render() {
  const state = controller.state(), on = state.mode === "gpu";
  // Why the deck cannot start, when it is off: the browser, or a window it does not fit.
  const blocked = on || support === "likely" ? null : reason;
  switcher.setAttribute("aria-pressed", String(on));
  switcher.disabled = blocked !== null;
  modeText.textContent = on ? "GPU" : "Ordinary DOM";
  switcher.title = on ? "Switch to ordinary DOM" : blocked ?? "Switch to GPU presentation";
  figures.hidden = !on;
  if (on) {
    const work = state.metrics.frameWorkMs.slice(-30);
    $("deck-layers").textContent = String(state.layers.length);
    $("deck-captures").textContent = String(state.metrics.captures);
    $("deck-frame").textContent = work.length ? (work.reduce((sum, value) => sum + value, 0) / work.length).toFixed(1) : "0.0";
  }
  note(on ? "" : blocked ?? reason);
}
/**
 * GPU presentation ended by itself (a lost device, a paint that timed out): the page is the flow in ordinary DOM by
 * now. It is started again after a moment, twice at most in half a minute, so that a GPU that keeps failing is left
 * alone.
 */
const recoveries: number[] = [];
function recover(why: string) {
  console.info(`GPU presentation ended: ${why}`);
  reason = explain(why).title;
  const now = performance.now();
  while (recoveries.length && now - recoveries[0]! > 30_000) recoveries.shift();
  if (recoveries.length >= 2 || preference.off) return;
  recoveries.push(now);
  setTimeout(() => { if (!preference.off && status?.mode === "dom") void start(); }, 900);
}
async function start() {
  if (support !== "likely") { render(); return; }
  let on = await deck.start();
  // An admission check that timed out (a busy machine, a tab that was just opened) is tried once more.
  if (!on && /timed out/.test(status?.reason ?? "")) on = await deck.start();
  // A refusal is explained in plain words; the runtime's own reason stays in the console.
  reason = on ? "" : explain(status?.reason ?? "").title;
  if (!on) console.info(`GPU presentation was refused: ${status?.reason ?? "unknown"}`);
  render();
}
switcher.addEventListener("click", () => {
  const on = controller.state().mode === "gpu";
  preference.off = on;
  void (on ? deck.stop().then(render) : start());
});
// The figures change while the stage is idle too (a caret blinking is a capture), so they are read twice a second.
setInterval(() => { if (status?.mode === "gpu" && !document.hidden) render(); }, 500);
// The deck comes back by itself when a window that was too small for it grows, unless the visitor switched it off.
let resized = 0;
addEventListener("resize", () => {
  clearTimeout(resized);
  resized = window.setTimeout(() => { if (!preference.off && controller.state().mode !== "gpu") void start(); else render(); }, 200);
});
if (!preference.off) void start(); else render();

declare global { interface Window { nextDeck: unknown } }
// For the site's checks (`scripts/showcase-validation.mjs`).
window.nextDeck = { state: () => controller.state(), place: deck.place, go: (index: number) => { deck.go(index); return deck.idle(); }, idle: deck.idle,
  start: () => deck.start().then(() => deck.idle()), stop: () => deck.stop().then(() => deck.idle()), lengths: deck.lengths, warmed: deck.warmed, errors: deck.errors };
