/**
 * The first render of the adapters' own React roots (`mountCanvasApp`, `mountWorkerCanvasApp`): it is committed
 * synchronously, and when it throws, the mount throws.
 */

/** The root option the adapter gives its own React root: where React 19 sends an error no error boundary caught. */
export interface FirstRenderOptions { onUncaughtError(error: unknown): void }

/**
 * Calls `start` inside `flush`, so the root it creates has committed its first render when this returns, and
 * returns the root's unmount callback. When that render throws, the root is unmounted and the error thrown here.
 * React 18 throws it from `flush`. React 19 only reports it, to the root's `onUncaughtError`: pass the `options`
 * `start` receives to the root, and an error raised while mounting is kept and thrown here, so a failed mount is
 * not an empty root behind a working controller; a later one is reported with `reportError`, as React does by
 * default. A root created without them (one the caller injected) keeps React's behaviour. An error that an error
 * boundary in the tree catches goes to `onCaughtError`, which stays React's, and does not fail the mount.
 */
export function mountRoot(flush: (work: () => void) => void, start: (options: FirstRenderOptions) => { unmount(): void }): () => void {
  let failure: { error: unknown } | undefined, mounting = true, root: { unmount(): void } | undefined;
  // Under StrictMode or a retry React can report more than once; the first error is the cause.
  const options = { onUncaughtError(error: unknown) { if (!mounting) reportError(error); else failure ??= { error }; } };
  try { flush(() => { root = start(options); }); }
  catch (error) { root?.unmount(); throw error; }
  finally { mounting = false; }
  if (failure) { root?.unmount(); throw failure.error; }
  const mounted = root!;
  return () => mounted.unmount();
}
