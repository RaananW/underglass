/**
 * Opt-in GPU mode through `@underglass/html-in-canvas-polyfill`, for visitors whose browser has no native
 * HTML-in-Canvas. The site never loads it on its own: the help panel offers it, `installPolyfill` downloads
 * it on that press (its own chunk, so visitors with native support never fetch it) and admission then runs
 * against the polyfill exactly as it runs against the browser. A refused admission removes it again.
 *
 * The polyfill draws each element by serializing it into an image, so changes reach the GPU a few frames
 * late (about 50–125 ms in Chrome 156, against 15–21 ms natively) and some details differ (see its
 * LIMITATIONS.md). The page says so for as long as it is active. Only the examples measured to run well on
 * it are offered; `docs/showcase.md` records the measurements.
 */
import type { PolyfillStatus } from "@underglass/html-in-canvas-polyfill";
import type { ExampleId } from "./catalog";

export type { PolyfillStatus };

/** The polyfill's source and its own list of what it can't do. */
export const polyfillLinks = {
  repository: "https://github.com/RaananW/html-in-canvas-polyfill",
  limitations: "https://github.com/RaananW/html-in-canvas-polyfill/blob/main/docs/LIMITATIONS.md",
} as const;

/**
 * Examples not offered on the polyfill, with the reason shown to visitors. Every other example ran GPU mode on
 * it with correct native hits at 53–57 fps in Chrome 156 (2026-11-08, polyfill 0.2.0).
 */
export const polyfillExcluded: Partial<Record<ExampleId, string>> = {
  strata: "its gallery is one large layer, so the polyfill redraws all of it on every click, about a third of a second each time",
};

/** Whether `id` is offered on the polyfill. */
export const polyfillOffers = (id: ExampleId) => !(id in polyfillExcluded);

/**
 * Whether trying the polyfill can work in this browser at all: Underglass itself needs WebGPU and the
 * state-preserving `Element.moveBefore`, which the polyfill does not provide. Like `detectSupport`, this only
 * decides what the help panel offers; admission still decides.
 */
export const polyfillPossible = () => "gpu" in navigator && typeof (Element.prototype as { moveBefore?: unknown }).moveBefore === "function";

/** Downloads and installs the polyfill (once; it does nothing where the browser supports HTML-in-Canvas). */
export async function installPolyfill(): Promise<PolyfillStatus> {
  const { install } = await import("@underglass/html-in-canvas-polyfill");
  return install();
}

/** Removes the polyfill again, after a refused admission. */
export async function removePolyfill() {
  const { uninstall } = await import("@underglass/html-in-canvas-polyfill");
  uninstall();
}
