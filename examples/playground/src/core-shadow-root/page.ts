/**
 * Core mounted inside an open shadow root, as a page that hosts its demos in shadow DOM does, for
 * `tests/browser/core-shadow-root.test.mjs`. The light DOM holds only `#shadow-host`; its shadow root holds the stylesheet, the
 * frame with the output canvas and two enrolled layers: `#card` (a heading, a swatch, a counter button and a text field) and
 * `#guarded` (a plain box that a shadow-root rule pins with `opacity: 1 !important`). `window.shadowCore.ready` resolves with the
 * test API.
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController } from "@underglass/core";

type Rgb = [number, number, number];
const GREEN: Rgb = [40, 160, 60], BLUE: Rgb = [40, 40, 200];
const css = (rgb: Rgb) => `rgb(${rgb.join(",")})`;
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

const shadow = document.getElementById("shadow-host")!.attachShadow({ mode: "open" });
shadow.innerHTML = `<style>
  #frame { position: absolute; inset: 0; }
  #card { position: absolute; left: 40px; top: 40px; width: 280px; height: 200px; box-sizing: border-box; padding: 16px;
    background: rgb(233, 235, 239); border-radius: 12px; }
  #card h2 { margin: 0 0 12px; font-size: 15px; }
  #swatch { width: 120px; height: 48px; margin: 0 0 12px; background: ${css(GREEN)}; }
  #press { display: block; width: 120px; height: 32px; margin: 0 0 8px; }
  #field { width: 200px; }
  #guarded { position: absolute; left: 400px; top: 40px; width: 160px; height: 120px; background: rgb(233, 235, 239); border-radius: 12px; }
  #guarded { transform-origin: 0 0; opacity: 1 !important; }
</style><div id="frame"></div>`;
const frame = shadow.getElementById("frame")!;
const status = document.getElementById("status")!;
let presses = 0;
let card!: HTMLElement, guarded!: HTMLElement, swatch!: HTMLElement, button!: HTMLButtonElement, field!: HTMLInputElement;

const controller: CanvasController = mountApplicationModule({ ...createCanvasHosts(frame), budgets: { layers: 4, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.textContent = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  card = document.createElement("section");
  card.id = "card"; card.setAttribute("aria-label", "Card"); card.setAttribute("drawable", "");
  const heading = document.createElement("h2"); heading.textContent = "Inside a shadow root";
  swatch = document.createElement("div"); swatch.id = "swatch";
  button = document.createElement("button"); button.id = "press"; button.type = "button"; button.textContent = "Pressed 0";
  button.addEventListener("click", () => { presses++; button.textContent = `Pressed ${presses}`; });
  field = document.createElement("input"); field.id = "field"; field.setAttribute("aria-label", "Text");
  card.append(heading, swatch, button, field);
  guarded = document.createElement("section");
  guarded.id = "guarded"; guarded.setAttribute("aria-label", "Guarded"); guarded.setAttribute("drawable", "");
  guarded.style.transform = "none"; guarded.style.opacity = "1";
  container.append(card, guarded);
  const releaseCard = enroll({ id: "card", element: card, layout: {}, transform: {} });
  const releaseGuarded = enroll({ id: "guarded", element: guarded, layout: {}, transform: {}, preserveStyles: true });
  return () => { releaseCard(); releaseGuarded(); container.replaceChildren(); };
} });

const settle = async () => { await controller.settle(); for (let index = 0; index < 4; index++) await nextFrame(); };
const clientBox = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };

declare global { interface Window { shadowCore: { ready: Promise<unknown> } } }
window.shadowCore = { ready: Promise.resolve({
  settle, state: () => controller.state(), enable: () => controller.enable(), disable: () => controller.disable(),
  colours: { GREEN, BLUE },
  /** Client boxes of the shadow-root elements, in their untransformed layout. */
  box: (id: string) => clientBox(shadow.getElementById(id)!),
  /** What hit testing finds at a client point, as `document` sees it (retargeted to the shadow host) and as the shadow root sees it. */
  hit(x: number, y: number) { return { document: document.elementFromPoint(x, y)?.id ?? null, shadow: shadow.elementFromPoint(x, y)?.id ?? null }; },
  presses: () => presses, field: () => field.value, focused: () => shadow.activeElement?.id ?? null,
  async recolour(rgb: Rgb) { swatch.style.background = css(rgb); await settle(); },
  async move(x: number, y: number) { controller.setTransform("card", { x, y }); await settle(); },
  /** Tries to hand a WAAPI animation of `#guarded` to core; returns the refusal message, or null when core took it (then released). */
  async ownGuarded() {
    const source = guarded.animate([{ transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 }, { transform: "translate(40px, 0px) rotate(0deg) scale(1)", opacity: 0.5 }],
      { duration: 1000, fill: "both" });
    source.pause();
    try { const playback = controller.ownAnimation("guarded", source); await playback.release(); return null; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
    finally { source.cancel(); }
  },
}) };
await controller.enable();
