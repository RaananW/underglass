/**
 * `@underglass/react/experimental-worker/thread`: the framework-neutral worker side of the
 * experimental worker compositor, re-exported from `@underglass/core/experimental-worker/thread`
 * (see `docs/worker.md`). The React main-thread controller is in `experimental-worker.tsx`.
 * Named, not `export *`, so a new export of the core entry does not join this one unnoticed.
 */
export { startWorkerCompositor } from "@underglass/core/experimental-worker/thread";
