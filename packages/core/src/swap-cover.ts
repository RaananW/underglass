/**
 * Holds the last presented ordinary-DOM frame on screen across the first-admission swap (issue #202), for a few frames.
 *
 * The swap moves the root into the owning canvas, which removes it from the ordinary DOM. Its pixels first exist in the
 * canvas's paint event, and on the tested Chromium build a WebGPU draw made in the paint event is presented one frame
 * later (docs/architecture.md, "Seamless first admission"), so one or two frames would show neither the DOM nor the
 * GPU output. A same-document view transition holds the old frame, the browser's snapshot of the DOM frame the user was
 * already looking at, over the live document until the first complete GPU frame has been presented: the transition's
 * pseudo-elements are paused at their start (old image opaque, new image transparent), so the live document renders
 * underneath, and `skipTransition()` then shows it in the next frame.
 *
 * This is a bounded hold, not a stale cover: it lasts the swap only (about three frames), has a hard upper bound
 * (`HOLD_MAX_MS`) after which it ends whatever happens, and `release()` ends it at once (every failure, cancellation and
 * recovery path calls it). Nothing here draws, clones or substitutes content.
 */

/** Outcome of `swapUnderCover`. */
export interface SwapCover {
  /** `view-transition`: the DOM frame is held until `release` or the hard bound. `none`: no cover; the swap ran directly. */
  readonly kind: "view-transition" | "none";
  /** Why there is no cover (`kind: "none"`). */
  readonly reason?: string;
  /** Resolves once `swap` has run (inside the transition's update callback when covered); rejects with its error. */
  readonly swapped: Promise<void>;
  /** Ends the hold and removes the injected style. Idempotent; call it in every outcome. */
  release(): void;
}

interface ViewTransitionLike {
  readonly ready: Promise<void>;
  readonly finished: Promise<void>;
  readonly updateCallbackDone?: Promise<void>;
  skipTransition(): void;
}
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
  activeViewTransition?: ViewTransitionLike | null;
};

/** How long the update callback may take to run before the swap runs without a cover (it needs one rendering opportunity). */
const CALLBACK_DEADLINE_MS = 1000;
/** Hard upper bound of the hold, from the call: about 30 frames at 60 Hz; the normal hold is about three frames. */
export const HOLD_MAX_MS = 500;
const HOLD_STYLE = `
::view-transition { pointer-events: none !important; }
::view-transition-group(*), ::view-transition-image-pair(*), ::view-transition-old(*), ::view-transition-new(*) {
  animation-play-state: paused !important; animation-delay: 0s !important; animation-duration: 3600s !important; pointer-events: none !important;
}`;

/**
 * Runs `swap` (a synchronous DOM change) so that the frame presented before it stays on screen until `release()` (at most
 * `HOLD_MAX_MS`). Uses a same-document view transition when the browser has one, can say whether another is running
 * (`document.activeViewTransition`) and none is (a running one belongs to the application and is never skipped); otherwise
 * runs `swap` at once with no cover. `swap` may throw: `swapped` rejects.
 */
export function swapUnderCover(doc: Document, swap: () => void): SwapCover {
  const viewDoc = doc as ViewTransitionDocument;
  const direct = (reason: string): SwapCover => {
    const swapped = new Promise<void>((resolve, reject) => { try { swap(); resolve(); } catch (error) { reject(error); } });
    swapped.catch(() => undefined);
    return { kind: "none", reason, swapped, release() {} };
  };
  if (typeof viewDoc.startViewTransition !== "function") return direct("document.startViewTransition is unavailable");
  if (!("activeViewTransition" in viewDoc)) return direct("the browser cannot report a running view transition, which would be interrupted");
  if (doc.visibilityState !== "visible") return direct("the document is not visible");
  if (viewDoc.activeViewTransition) return direct("the application's own view transition is running");
  // A constructed stylesheet needs no `style-src` allowance, unlike an inline <style> element.
  let sheet: CSSStyleSheet | undefined;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(HOLD_STYLE);
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch { return direct("the hold style could not be adopted"); }
  const removeSheet = () => {
    if (!sheet) return;
    const own = sheet;
    sheet = undefined;
    try { doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter(candidate => candidate !== own); } catch { /* document gone */ }
  };
  let ran = false, released = false;
  let transition: ViewTransitionLike | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined, bound: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    if (released) return;
    released = true;
    clearTimeout(deadline); clearTimeout(bound);
    try { transition?.skipTransition(); } catch { /* already finished */ }
    // Skipping finishes the transition, which removes its pseudo-elements; the style goes once `finished` settles (below)
    // so the paused animations never run, or at once when there is no transition.
    if (!transition) removeSheet();
  };
  const swapped = new Promise<void>((resolve, reject) => {
    const run = () => {
      if (ran) return;
      ran = true;
      clearTimeout(deadline);
      try { swap(); resolve(); } catch (error) { reject(error); throw error; }
    };
    try {
      transition = viewDoc.startViewTransition!(run);
      deadline = setTimeout(run, CALLBACK_DEADLINE_MS);
      bound = setTimeout(end, HOLD_MAX_MS);
    } catch (error) {
      removeSheet();
      if (!ran) { ran = true; try { swap(); resolve(); } catch (swapError) { reject(swapError); } }
      else reject(error);
    }
  });
  swapped.catch(() => undefined);
  // The page may skip the transition, or the update callback may throw: those promises reject, which is not an error here.
  transition?.ready.catch(() => undefined);
  transition?.updateCallbackDone?.catch(() => undefined);
  transition?.finished.then(removeSheet, removeSheet);
  return { kind: transition ? "view-transition" : "none", swapped, release: end };
}
