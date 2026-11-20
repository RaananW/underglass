/**
 * The single Underglass React tree behind every example. `main.tsx` mounts `Demo` with
 * `mountCanvasApp`; each example is a set of `Surface` layers that is swapped in place, so the
 * runtime, the shared GPU compositor and the persistent art layer from `scene.tsx` live on across
 * examples. Each example is its own chunk (`examples.ts`): `Demo` loads the next one before it swaps it
 * in, so the tree never suspends and the current example stays on stage while the next one loads.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Surface } from "@underglass/react";
import type { ExampleId } from "./catalog";
import { loadExample, loadedExample } from "./examples";
import { Backdrop, type BackdropTheme } from "./shared";
import { ART, SceneProvider, useArt } from "./scene";

// Which backdrop scenery each example gets (see `Backdrop` in `shared.tsx`).
const themes: Record<ExampleId, BackdropTheme> = { layers: "postcard", motion: "deck", effects: "lab", presence: "notices", tasks: "tasks", pond: "pond", fluent: "fluent", compare: "compare", strata: "strata", instrument: "strata" };

/**
 * One React root for every example. Switching examples swaps the enrolled
 * <Surface> set inside the same runtime and shared compositor; the decorative
 * art layer persists and only changes its layout and content. `id` must already be loaded
 * (`loadExample`) when the root mounts.
 */
export function Demo({ id, onReady, onStage }: { id: ExampleId; onReady(change: (id: ExampleId) => void): void; onStage(id: ExampleId): void }) {
  // `selected` can change after mount: `main.tsx` calls the function handed over by `onReady` when the
  // URL changes, which loads the example and then swaps it without remounting the root or the runtime.
  const [selected, setSelected] = useState(id);
  // Only the latest request is swapped in, so a quick second switch wins over a slower first load.
  const latest = useRef(id);
  useEffect(() => {
    onReady(next => {
      latest.current = next;
      loadExample(next).then(() => { if (latest.current === next) setSelected(next); },
        error => console.error(`Showcase example "${next}" failed to load`, error));
    });
  }, [onReady]);
  const Example = loadedExample(selected)!;
  // Paint order is DOM order: the backdrop first, then the persistent art layer, then the example's
  // own layers. The `key` on each example makes React reset its local state when you switch.
  return <SceneProvider>
    <StageForm id={selected} onStage={onStage} />
    {/* The Instrument gallery and the home page's scene have a wall or sky of their own and a fluid stage: the
        fixed-size backdrop is not rendered. */}
    {selected !== "instrument" && <Backdrop theme={themes[selected]} />}
    <SceneArt />
    <Example key={selected} />
  </SceneProvider>;
}

/**
 * Gives the stage the form of the example on it (`onStage`), in the commit that swaps the example in: the old example keeps
 * its stage while the next one loads (the Instrument gallery's wall is laid out by its fluid stage, and collapsed to no
 * height without it, which left GPU mode). It is the first child, so its layout effect runs after React removed the old
 * example and before the new example's layers enroll.
 */
function StageForm({ id, onStage }: { id: ExampleId; onStage(id: ExampleId): void }) {
  useLayoutEffect(() => onStage(id), [id, onStage]);
  return null;
}

/** The persistent decorative layer: inert, aria-hidden and never interactive. */
// Until an example publishes its art with `useSceneArt`, the layer keeps a default box (the
// postcard landscape's position), so it stays enrolled under a stable id.
function SceneArt() {
  const art = useArt();
  return <Surface id={ART} decorative layout={art?.layout ?? { x: 378, y: 330, width: 350, height: 346, overflow: "hidden" }}
    appearance={art?.appearance}>{art?.content}</Surface>;
}
