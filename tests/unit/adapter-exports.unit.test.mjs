/**
 * The public export lists of the React and Vue adapters, read from their entry sources (issue #282). The two main
 * entries must export the same names, of the same kind, except for the differences listed here on purpose, so a name
 * added to one adapter alone fails until it is added to the other or listed as deliberate. No adapter entry may
 * re-export with `export *`, so a new export of `@underglass/core` never widens an adapter's API unnoticed; the React
 * subpath entries are pinned name by name.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { moduleExports, exportLists, wildcardExports } from "../helpers/module-exports.mjs";

const root = resolve(import.meta.dirname, "../..");
const core = {
  "@underglass/core": "index.ts", "@underglass/core/build": "build.ts",
  "@underglass/core/experimental-worker": "experimental-worker.ts", "@underglass/core/experimental-worker/thread": "worker-thread.ts",
};
const resolveCore = specifier => core[specifier] && resolve(root, "packages/core/src", core[specifier]);
const entries = {
  react: resolve(root, "packages/react/src/index.ts"),
  reactBuild: resolve(root, "packages/react/src/build.ts"),
  reactWorker: resolve(root, "packages/react/src/experimental-worker.tsx"),
  reactThread: resolve(root, "packages/react/src/worker-thread.ts"),
  vue: resolve(root, "packages/vue/src/index.ts"),
};
const exportsOf = file => moduleExports(file, resolveCore);

/**
 * The deliberate differences between the main entries. React: `GPUHost` (the context provider; Vue provides the
 * runtime from `mountCanvasApp` by injection), prerendering (`prerenderCanvasApp` and the `canvasHostsMarkup` it
 * builds on; the Vue adapter has no prerender or hydration path) and the props interfaces of its function
 * components. Vue: the `SurfaceRef` callback type (React's hook returns React's `RefCallback`). Options that exist
 * in one adapter only (`strict`, `createRoot`, `hydrateRoot`, `flushSync` in React, `configure` in Vue) are fields
 * of the `MountCanvasOptions` both export.
 */
const reactOnly = { GPUHost: "value", prerenderCanvasApp: "value", canvasHostsMarkup: "value", SurfaceProps: "type", BoxProps: "type", PresenceProps: "type" };
const vueOnly = { SurfaceRef: "type" };

test("the React and Vue main entries export the same names, except the deliberate differences", () => {
  const react = exportsOf(entries.react), vue = exportsOf(entries.vue);
  const only = (from, other) => Object.fromEntries([...from].filter(([name]) => !other.has(name)));
  assert.deepEqual(only(react, vue), reactOnly, "names only @underglass/react exports");
  assert.deepEqual(only(vue, react), vueOnly, "names only @underglass/vue exports");
  for (const [name, kind] of react) if (vue.has(name)) assert.equal(vue.get(name), kind, `${name} is a ${kind} in React but a ${vue.get(name)} in Vue`);
});

test("the adapters share the core runtime exports a user needs without importing @underglass/core", () => {
  for (const entry of [entries.react, entries.vue]) {
    const { values, types } = exportLists(exportsOf(entry));
    for (const name of ["createCanvasHosts", "EnrollmentError", "defineEffect", "mountApplicationModule", "mountCanvasApp", "Surface", "Box", "NativeScroll", "NativeOverlay", "Presence", "useSurfaceRef", "useGPUHost", "useNativeOverlayHost"]) {
      assert.ok(values.includes(name), `${entry} exports ${name}`);
    }
    for (const name of ["CanvasController", "LayerDefinition", "LocalApplicationModule", "EnrollmentOptions", "MountCanvasOptions", "TransitionResult"]) {
      assert.ok(types.includes(name), `${entry} exports type ${name}`);
    }
  }
});

test("no adapter entry re-exports with export *", () => {
  for (const [name, file] of Object.entries(entries)) assert.deepEqual(wildcardExports(file), [], `${name} (${file})`);
});

test("the React subpath entries export exactly their listed names", () => {
  assert.deepEqual(exportLists(exportsOf(entries.reactBuild)), {
    values: ["affine", "compileTimeline", "compositionShader", "layerShader", "parseTransform", "workerCompositorProgram"],
    types: ["CompiledAnimation", "CompiledProgramSet"],
  });
  assert.deepEqual(exportLists(exportsOf(entries.reactThread)), { values: ["startWorkerCompositor"], types: [] });
  assert.deepEqual(exportLists(exportsOf(entries.reactWorker)), {
    values: ["WorkerCanvasController", "WorkerSurface", "mountWorkerCanvasApp"],
    types: ["WorkerAnimation", "WorkerMountOptions", "WorkerProgram", "WorkerStats", "WorkerSurfaceProps"],
  });
});
