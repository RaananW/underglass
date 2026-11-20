/**
 * Carousel (anatomy page `carousel.md`), the WAI-ARIA Carousel pattern without rotation: one slide shown at a time,
 * stepped by Previous and Next (wrapping) or picked by a key. `showStrataSlide` updates the markup; `attachStrataCarousels`
 * runs the buttons for plain HTML and Astro (through `attachStrata`) and reports `strata-slide` from the carousel.
 */

import { acquireStrataDelegate, type StrataDelegateScope } from "./delegate.ts";

/** The slide a carousel button leads to from the current one, or undefined when it is not a carousel button. */
export function strataSlideTarget(button: Element, current: number, count: number): number | undefined {
  if (!count) return undefined;
  if (button.matches(".ug-carousel__previous")) return (current - 1 + count) % count;
  if (button.matches(".ug-carousel__next")) return (current + 1) % count;
  if (button.matches(".ug-carousel__key")) {
    const keys = [...(button.closest(".ug-carousel__picker")?.querySelectorAll(".ug-carousel__key") ?? [])];
    const at = keys.indexOf(button);
    return at >= 0 ? at : undefined;
  }
  return undefined;
}

/** The index of the carousel's shown slide. */
export function strataSlideIndex(carousel: Element): number {
  return Math.max(0, [...carousel.querySelectorAll(":scope > .ug-carousel__slides > .ug-carousel__slide")].findIndex(slide => !slide.hasAttribute("hidden")));
}

/** Shows slide `index` of `carousel`: the others are hidden, and its picker key is current. */
export function showStrataSlide(carousel: Element, index: number): void {
  carousel.querySelectorAll(":scope > .ug-carousel__slides > .ug-carousel__slide").forEach((slide, at) => slide.toggleAttribute("hidden", at !== index));
  carousel.querySelectorAll(".ug-carousel__picker > .ug-carousel__key").forEach((key, at) => {
    if (at === index) key.setAttribute("aria-current", "true");
    else key.removeAttribute("aria-current");
  });
}

/** Runs every `.ug-carousel` in `doc` from its markup, once, and reports `strata-slide` (`detail.index`). */
export function attachStrataCarousels(doc: Document = document): () => void {
  return acquireStrataDelegate(doc, installCarousels);
}

function installCarousels(doc: Document, scope: StrataDelegateScope): void {
  scope.listen(doc, "click", event => {
    const button = (event.target as Element | null)?.closest?.(".ug-carousel button");
    const carousel = button?.closest(".ug-carousel");
    if (!button || !carousel || event.defaultPrevented || (button as HTMLButtonElement).disabled) return;
    const count = carousel.querySelectorAll(":scope > .ug-carousel__slides > .ug-carousel__slide").length;
    const index = strataSlideTarget(button, strataSlideIndex(carousel), count);
    if (index === undefined) return;
    showStrataSlide(carousel, index);
    carousel.dispatchEvent(new CustomEvent("strata-slide", { bubbles: true, detail: { index } }));
  });
}
