/**
 * Code-splitting for the examples: each example's component is its own chunk, loaded the first time it is
 * opened (Fluent UI, Strata and Babylon Lite only download for the examples that use them). `main.tsx`
 * loads the opening example before it mounts the Underglass root, and `Demo` (`demos.tsx`) loads the next
 * one before it swaps it in, so nothing inside the root ever suspends: the current example stays on stage,
 * GPU-presented, until the next one is ready.
 */
import type { ComponentType } from "react";
import type { ExampleId } from "./catalog";

const loaders: Record<ExampleId, () => Promise<ComponentType>> = {
  layers: () => import("./postcard").then(module => module.PostcardStudio),
  motion: () => import("./deck").then(module => module.CardDeck),
  effects: () => import("./lab").then(module => module.ShaderLab),
  presence: () => import("./notices").then(module => module.NotificationStack),
  tasks: () => import("./tasks").then(module => module.Tasks),
  pond: () => import("./pond").then(module => module.WebcamPond),
  fluent: () => import("./fluent").then(module => module.FluentBoard),
  compare: () => import("./compare").then(module => module.Compare),
  strata: () => import("./strata").then(module => module.StrataGallery),
  instrument: () => import("./instrument").then(module => module.InstrumentGallery),
};

// One promise per example, kept so a second request reuses the first load; a failed load is forgotten so
// the next request retries it. The resolved components are kept for synchronous use in render.
const pending = new Map<ExampleId, Promise<ComponentType>>();
const loaded = new Map<ExampleId, ComponentType>();

/** Loads an example's component (once) and resolves with it. */
export function loadExample(id: ExampleId): Promise<ComponentType> {
  let promise = pending.get(id);
  if (!promise) {
    promise = loaders[id]().then(component => { loaded.set(id, component); return component; },
      error => { pending.delete(id); throw error; });
    pending.set(id, promise);
  }
  return promise;
}

/** The component of an example that has finished loading, else `undefined`. */
export const loadedExample = (id: ExampleId) => loaded.get(id);
