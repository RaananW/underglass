// Pre-build step for the worker fixture, run by `scripts/worker-validation.mjs` in the fixture directory
// against the installed package. It checks the package's public surface and writes `program.json`, the
// prebuilt compositor shader and binding layout that `main.tsx` hands to the worker.
import { workerCompositorProgram } from "@underglass/react/build";
import * as runtime from "@underglass/react";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
// The public runtime surface, by name: a change here is an API change.
assert.deepEqual(Object.keys(runtime).sort(), ["Box", "EnrollmentError", "GPUHost", "NativeOverlay", "NativeScroll", "Presence", "Surface",
  "canvasHostsMarkup", "createCanvasHosts", "defineEffect", "mountApplicationModule", "mountCanvasApp", "prerenderCanvasApp", "useGPUHost", "useNativeOverlayHost", "useSurfaceRef"]);
// The worker entries (the React adapter's and the core primitives they build on) must not ship the
// main-thread shader builder or private engine fields.
for (const name of ["@underglass/react", "@underglass/core"]) for (const entry of ["experimental-worker", "experimental-worker/thread"]) {
  assert.doesNotMatch(await readFile(new URL(import.meta.resolve(`${name}/${entry}`)), "utf8"),
    /compositionShader|fn effectFragment|private _device/);
}
// Capacity 8 matches the largest layer count the fixture mounts.
await writeFile(new URL("./program.json", import.meta.url), JSON.stringify(workerCompositorProgram(8)) + "\n");
