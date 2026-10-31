/**
 * The tasks example: the maintained task app from `examples/playground`, reused unchanged, with a
 * decorative poster beside it. Its own chunk (see `examples.ts`), loaded when the example is opened.
 */
import { useEffect, useMemo } from "react";
import { useGPUHost } from "@underglass/react";
import { TodoApp } from "../../playground/src/apps/todo/TodoApp";
import { taskTransitions } from "../../playground/src/apps/todo/transition";
import { useSceneArt } from "./scene";
import "../../playground/src/apps/todo/todo.css";

/**
 * The maintained task app from the playground, reused unchanged. `taskTransitions` turns task events
 * into pulses on a decorative layer; the cleanup below stops them when the example is left.
 */
export function Tasks() {
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
