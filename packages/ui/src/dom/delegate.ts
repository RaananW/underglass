/**
 * The shared shape of every `attachStrata*` delegate: its listeners (and anything else it holds) belong to a document, are
 * added by the first attach for that document and removed when the last disposer for it has run.
 */

/** What an `install` function registers its listeners and cleanups with, so the last release can undo them. */
export interface StrataDelegateScope {
  /** Adds the listener now and removes it, with the same options, on the last release. */
  listen<K extends keyof DocumentEventMap>(target: Document, type: K, listener: (event: DocumentEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  listen<K extends keyof WindowEventMap>(target: Window, type: K, listener: (event: WindowEventMap[K]) => void, options?: boolean | AddEventListenerOptions): void;
  /** Runs `cleanup` on the last release, after the listeners are removed, newest first (timers, frames, observers, shared references). */
  onRelease(cleanup: () => void): void;
}

interface Delegate { count: number; listeners: Array<() => void>; cleanups: Array<() => void> }

const delegates = new WeakMap<Document, Map<unknown, Delegate>>();

/**
 * Attaches the delegate `install` to `doc`, reference-counted: the first attach for a document runs `install` (which adds the
 * listeners through `scope`), a later attach only takes a reference, and the returned disposer gives its reference back. The last
 * disposer for the document removes the listeners and runs the cleanups. A disposer is idempotent: a second call releases
 * nothing. `install` is the delegate's identity, so it must be one function per delegate (a module-level constant).
 */
export function acquireStrataDelegate(doc: Document, install: (doc: Document, scope: StrataDelegateScope) => void): () => void {
  let byInstall = delegates.get(doc);
  if (!byInstall) delegates.set(doc, byInstall = new Map());
  let delegate = byInstall.get(install);
  if (!delegate) {
    const made: Delegate = delegate = { count: 0, listeners: [], cleanups: [] };
    byInstall.set(install, made);
    const scope: StrataDelegateScope = {
      listen(target: EventTarget, type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) {
        target.addEventListener(type, listener, options);
        made.listeners.push(() => target.removeEventListener(type, listener, options));
      },
      onRelease(cleanup) { made.cleanups.push(cleanup); },
    };
    try { install(doc, scope); } catch (error) { release(byInstall, install, made, true); throw error; }
  }
  const held = delegate;
  held.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--held.count === 0) release(byInstall, install, held, false);
  };
}

function release(byInstall: Map<unknown, Delegate>, install: unknown, delegate: Delegate, quiet: boolean): void {
  if (byInstall.get(install) === delegate) byInstall.delete(install);
  // The listeners first (so nothing can run the delegate again), then the cleanups, newest first; one failing does not keep the others from running.
  let failure: unknown, failed = false;
  for (const cleanup of [...delegate.listeners, ...delegate.cleanups.reverse()]) {
    try { cleanup(); } catch (error) { if (!failed) { failed = true; failure = error; } }
  }
  delegate.listeners = [];
  delegate.cleanups = [];
  if (failed && !quiet) throw failure;
}

/** Runs several disposers as one (for a delegate that is built from others), each once. */
export function combineStrataDisposers(...disposers: Array<() => void>): () => void {
  return () => { for (const dispose of disposers) dispose(); };
}
