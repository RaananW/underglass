/**
 * Core's no-op mutation rule (issue #181) on plain DOM, for `tests/browser/core-mutation-noop.test.mjs`. One enrolled layer
 * `#card` with a swatch (`style` and `class` drive its pixels), a text node and a list. `window.mutationNoop.ready` resolves
 * with the test API: writes that change nothing, writes that change something and the in-between cases, one per call.
 */
import { createCanvasHosts, mountApplicationModule, type CanvasController } from "@underglass/core";

const frame = document.getElementById("frame")!;
const status = document.getElementById("status")!;
const RED = "background: rgb(200, 40, 40);", GREEN = "background: rgb(40, 160, 60);";
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, text?: string) => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
let card!: HTMLElement;
const controller: CanvasController = mountApplicationModule({ ...createCanvasHosts(frame), budgets: { layers: 4, pixels: 4_000_000 },
  onStatusChange: (value: { mode: string; reason: string }) => { status.textContent = `${value.mode}: ${value.reason}`; } }, { mount({ container, enroll }) {
  card = make("section", { id: "card", "aria-label": "Card" });
  card.setAttribute("drawable", "");
  const list = make("div", { id: "list" });
  list.append(make("span"));
  card.append(make("h2", {}, "No-op mutations"), make("div", { id: "swatch", class: "", style: RED, "data-tick": "0" }), make("span", { id: "text" }, "steady"), list);
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
type Metrics = { captures: number; uploads: number; mutationsIgnored: number; perLayer: Record<string, { captures: number; mutationsIgnored: number }> };
const counts = () => {
  const value = controller.state() as unknown as { mode: string; reason: string; metrics: Metrics };
  return { mode: value.mode, reason: value.reason, captures: value.metrics.captures, uploads: value.metrics.uploads,
    mutationsIgnored: value.metrics.mutationsIgnored, layer: { ...value.metrics.perLayer.card } };
};
const clientBox = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };
const swatch = () => document.getElementById("swatch")!;
const text = () => document.getElementById("text")!.firstChild as Text;
await settle();

declare global { interface Window { mutationNoop: { ready: Promise<unknown> } } }
window.mutationNoop = { ready: Promise.resolve({
  dpr: devicePixelRatio, settle, counts, state: () => controller.state(),
  box: (id: string) => clientBox(document.getElementById(id)!),
  /** Per frame, `frames` times: write the value the element already has through `kind` (attribute, style, class, text). */
  async same(kind: "attribute" | "style" | "class" | "text", frames: number) {
    for (let index = 0; index < frames; index++) {
      if (kind === "attribute") swatch().setAttribute("data-tick", "0");
      else if (kind === "style") swatch().setAttribute("style", swatch().getAttribute("style")!);
      else if (kind === "class") swatch().setAttribute("class", swatch().getAttribute("class") ?? "");
      else text().data = text().data;
      await nextFrame();
    }
  },
  /** Writes through to a different value, one write. */
  change: (kind: "style" | "class" | "text" | "unset" | "set") => {
    if (kind === "style") swatch().setAttribute("style", GREEN);
    else if (kind === "class") swatch().classList.add("hot");
    else if (kind === "text") text().data = "changed";
    else if (kind === "unset") swatch().removeAttribute("data-tick");
    else swatch().setAttribute("data-new", "1");
  },
  /** Restores the swatch and text to their initial state (the test settles after). */
  reset: () => { swatch().setAttribute("style", RED); swatch().className = ""; swatch().setAttribute("data-tick", "0"); swatch().removeAttribute("data-new"); text().data = "steady"; },
  /** One task: the style goes A -> B (-> C) -> A (or stays at the last value), so one observer batch holds every record. */
  batch: (steps: string[]) => { for (const value of steps) swatch().setAttribute("style", value); },
  append: () => { document.getElementById("list")!.append(make("span")); },
  /** Re-appends the first child at the end: same nodes, new order. */
  reorder: () => { const list = document.getElementById("list")!; list.append(list.firstElementChild!); },
  colours: { red: RED, green: GREEN, blue: "background: rgb(40, 40, 200);" },
}) };
