/**
 * The GPU stage takes the page's own background (issue #134), for `tests/browser/core-stage-background.test.mjs`. One enrolled
 * layer `#card` with a button on a page whose background `window.stageBackground.theme(...)` switches at runtime ("dark",
 * "light" or "none": no page background at all, which the browser paints white).
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController } from "@underglass/core";

const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
let clicks = 0;
document.documentElement.dataset.theme = new URLSearchParams(location.search).get("theme") ?? "dark";
const controller: CanvasController = mountApplicationModule({ ...createCanvasHosts(frame), budgets: { layers: 4, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.textContent = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  const card = document.createElement("section");
  // ?alpha=0.5: the card is half transparent, so the page shows through it.
  const alpha = new URLSearchParams(location.search).get("alpha");
  if (alpha) card.style.background = `rgb(200 40 40 / ${alpha})`;
  card.id = "card"; card.setAttribute("drawable", ""); card.setAttribute("aria-label", "Card");
  const button = document.createElement("button");
  button.id = "press"; button.textContent = "Press";
  button.addEventListener("click", () => { clicks++; });
  card.append(button);
  container.append(card);
  const release = enroll({ id: "card", element: card, layout: {}, transform: {} });
  return () => { release(); container.replaceChildren(); };
} });
await controller.enable();

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
async function settle() {
  await controller.settle();
  for (let index = 0; index < 4; index++) await nextFrame();
}
await settle();
const box = (id: string) => { const rect = document.getElementById(id)!.getBoundingClientRect(); return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }; };

declare global { interface Window { stageBackground: { ready: Promise<unknown> } } }
window.stageBackground = { ready: Promise.resolve({
  settle, box, clicks: () => clicks,
  counts: () => {
    const value = controller.state() as unknown as { mode: string; reason: string; metrics: { captures: number; uploads: number } };
    return { mode: value.mode, reason: value.reason, captures: value.metrics.captures, uploads: value.metrics.uploads };
  },
  /** Switches the page's background; "none" removes it. */
  /** Sets the card's background (a content update the layer must show with fresh pixels). */
  paint: (css: string) => { document.getElementById("card")!.style.background = css; },
  theme: (name: "dark" | "light" | "none") => {
    if (name === "none") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = name;
  },
}) };
