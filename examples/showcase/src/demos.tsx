/**
 * The single Underglass React tree behind every example. `main.tsx` mounts `Demo` with
 * `mountCanvasApp`; each example is a set of `Surface` layers that is swapped in place, so the
 * runtime, the shared GPU compositor and the persistent art layer from `scene.tsx` live on across
 * examples. `Tasks` is the one example that reuses a component from `examples/playground`.
 */
import { useEffect, useMemo, useState } from "react";
import { Surface, useGPUHost } from "@underglass/react";
import { TodoApp } from "../../playground/src/apps/todo/TodoApp";
import { taskTransitions } from "../../playground/src/apps/todo/transition";
import type { ExampleId } from "./catalog";
import { Backdrop, type BackdropTheme } from "./shared";
import { ART, SceneProvider, useArt, useSceneArt } from "./scene";
import { PostcardStudio } from "./postcard";
import { CardDeck } from "./deck";
import { ShaderLab } from "./lab";
import { NotificationStack } from "./notices";
import { WebcamPond } from "./pond";
import { FluentBoard } from "./fluent";
import { Compare } from "./compare";
import { StrataGallery } from "./strata";
import { InstrumentGallery } from "./instrument";
import "../../playground/src/apps/todo/todo.css";

// Which backdrop scenery each example gets (see `Backdrop` in `shared.tsx`).
const themes: Record<ExampleId, BackdropTheme> = { layers: "postcard", motion: "deck", effects: "lab", presence: "notices", tasks: "tasks", pond: "pond", fluent: "fluent", compare: "compare", strata: "strata", instrument: "strata" };

/**
 * One React root for every example. Switching examples swaps the enrolled
 * <Surface> set inside the same runtime and shared compositor; the decorative
 * art layer persists and only changes its layout and content.
 */
export function Demo({ id, onReady }: { id: ExampleId; onReady(change: (id: ExampleId) => void): void }) {
  // `selected` can change after mount: `main.tsx` calls the setter handed over by `onReady` when the
  // hash changes, which swaps the example without remounting the root or the runtime.
  const [selected, setSelected] = useState(id);
  useEffect(() => { onReady(setSelected); }, [onReady]);
  // Paint order is DOM order: the backdrop first, then the persistent art layer, then the example's
  // own layers. The `key` on each example makes React reset its local state when you switch.
  return <SceneProvider>
    {/* The Instrument gallery has a wall of its own and a fluid stage: the fixed-size backdrop is not rendered. */}
    {selected !== "instrument" && <Backdrop theme={themes[selected]} />}
    <SceneArt />
    {selected === "layers" ? <PostcardStudio key="layers" />
      : selected === "motion" ? <CardDeck key="motion" />
        : selected === "effects" ? <ShaderLab key="effects" />
          : selected === "presence" ? <NotificationStack key="presence" />
            : selected === "pond" ? <WebcamPond key="pond" />
              : selected === "fluent" ? <FluentBoard key="fluent" />
                : selected === "compare" ? <Compare key="compare" />
                  : selected === "strata" ? <StrataGallery key="strata" />
                    : selected === "instrument" ? <InstrumentGallery key="instrument" />
                  : <Tasks key="tasks" />}
  </SceneProvider>;
}

/** The persistent decorative layer: inert, aria-hidden and never interactive. */
// Until an example publishes its art with `useSceneArt`, the layer keeps a default box (the
// postcard landscape's position), so it stays enrolled under a stable id.
function SceneArt() {
  const art = useArt();
  return <Surface id={ART} decorative layout={art?.layout ?? { x: 378, y: 330, width: 350, height: 346, overflow: "hidden" }}
    appearance={art?.appearance}>{art?.content}</Surface>;
}

/**
 * The maintained task app from the playground, reused unchanged. `taskTransitions` turns task events
 * into pulses on a decorative layer; the cleanup below stops them when the example is left.
 */
function Tasks() {
  const controller = useGPUHost();
  // One helper per controller, stopped on unmount so no pulse outlives the example.
  const transitions = useMemo(() => taskTransitions(controller), [controller]);
  // On unmount the decoration layer is already released, which ends its ripple; only the timer is left.
  useEffect(() => () => transitions.stop(false), [transitions]);
  useSceneArt(() => ({ layout: { x: 770, y: 40, width: 246, height: 620, overflow: "hidden" },
    appearance: { background: "rgb(20,70,48)", radius: 26 },
    content: <div className="tasks-poster"><span>Real inputs.</span><span>Real focus.</span><span>Real dialog.</span></div> }), []);
  // The maintained TodoApp is reused unchanged; only decorative scenery is added around it.
  return <TodoApp onTransition={transitions.pulse} />;
}
