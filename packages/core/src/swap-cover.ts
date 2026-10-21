/**
 * Keeps the presented ordinary-DOM frame on screen across the first-admission swap (issue #202).
 *
 * The swap moves the root into the owning canvas, which removes it from the ordinary DOM. Its pixels first exist in the
 * canvas's paint event, and on the tested Chromium build a WebGPU draw made in the paint event is presented one frame
 * later (docs/architecture.md, "Seamless first admission"), so one or two frames would show neither the DOM nor the
 * GPU output. A same-document view transition holds the old frame, a snapshot of the very DOM the user was looking at,
 * over the live document until the first complete GPU frame has been presented: its pseudo-elements are paused at their
 * start (old image opaque, new image transparent), so the live document renders underneath, and `skipTransition()` then
 * shows it in the next frame.
 *
 * Nothing here draws, clones or substitutes content: the held pixels are the browser's own snapshot of the DOM frame
 * that was already presented, and the hold lasts the swap only (a few frames), never an admission.
 */

/** Outcome of `swapUnderCover`. */
export interface SwapCover {
  /** `view-transition`: the DOM frame is held until `release`. `none`: no cover; the swap ran directly. */
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
  skipTransition(): void;
}
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransitionLike;
  activeViewTransition?: ViewTransitionLike | null;
};

/** How long the update callback may take to run before the swap runs without a cover (it needs one rendering opportunity). */
const CALLBACK_DEADLINE_MS = 1000;
const HOLD_STYLE = `
::view-transition { pointer-events: none !important; }
::view-transition-group(*), ::view-transition-image-pair(*), ::view-transition-old(*), ::view-transition-new(*) {
  animation-play-state: paused !important; animation-delay: 0s !important; animation-duration: 3600s !important; pointer-events: none !important;
}`;

/**
 * Runs `swap` (a synchronous DOM change) so that the frame presented before it stays on screen until `release()`. Uses a
 * same-document view transition when the browser has one and none is already running (a running one belongs to the
 * application and is never skipped); otherwise runs `swap` at once with no cover. `swap` may throw: `swapped` rejects.
 */
export function swapUnderCover(doc: Document, swap: () => void): SwapCover {
  const viewDoc = doc as ViewTransitionDocument;
  const direct = (reason: string): SwapCover => {
    const swapped = new Promise<void>((resolve, reject) => { try { swap(); resolve(); } catch (error) { reject(error); } });
    swapped.catch(() => undefined);
    return { kind: "none", reason, swapped, release() {} };
  };
  if (typeof viewDoc.startViewTransition !== "function") return direct("document.startViewTransition is unavailable");
  if (doc.visibilityState !== "visible") return direct("the document is not visible");
  if (viewDoc.activeViewTransition) return direct("the application's own view transition is running");
  const style = doc.createElement("style");
  style.textContent = HOLD_STYLE;
  style.setAttribute("data-underglass-swap-cover", "");
  let ran = false;
  let transition: ViewTransitionLike | undefined;
  let released = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const swapped = new Promise<void>((resolve, reject) => {
    const run = () => {
      if (ran) return;
      ran = true;
      clearTimeout(deadline);
      try { swap(); resolve(); } catch (error) { reject(error); throw error; }
    };
    try {
      (doc.head ?? doc.documentElement).append(style);
      transition = viewDoc.startViewTransition!(run);
      // The update callback needs a rendering opportunity; if none comes in time, swap without the cover.
      deadline = setTimeout(run, CALLBACK_DEADLINE_MS);
    } catch (error) {
      style.remove();
      if (!ran) { ran = true; try { swap(); resolve(); } catch (swapError) { reject(swapError); } }
      else reject(error);
    }
  });
  swapped.catch(() => undefined);
  const cleanup = () => { clearTimeout(deadline); style.remove(); };
  // The transition ends by itself if the page skips it; its promises reject then, which is not an error here.
  transition?.ready.catch(() => undefined);
  transition?.finished.then(cleanup, cleanup);
  return {
    kind: transition ? "view-transition" : "none",
    swapped,
    release() {
      if (released) return;
      released = true;
      clearTimeout(deadline);
      try { transition?.skipTransition(); } catch { /* already finished */ }
      // The style stays until the transition finishes (its pseudo-elements are removed with it), so skipping never
      // lets the paused animations run; `finished` settles right after the skip.
      if (!transition) cleanup();
    },
  };
}
