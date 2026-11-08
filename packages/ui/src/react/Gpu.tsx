/**
 * `useStrataGpu`: presents the Strata panels among an Underglass root's direct children on the GPU, for as long as
 * the calling component is mounted (`@underglass/ui/gpu`). Pass the controller from `mountCanvasApp` or `useGPUHost`; with
 * no controller the CSS presentation stays. It attaches in a microtask: a component rendered by `mountCanvasApp`'s
 * first, synchronous render runs its effects before the root exists (its `container` throws until the mount returns).
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { attachStrataGpu, type StrataGpu, type StrataGpuController, type StrataGpuOptions } from "../gpu/index.ts";

export function useStrataGpu(controller: StrataGpuController | null | undefined, options?: StrataGpuOptions): { current: StrataGpu | undefined } {
  const handle = useRef<StrataGpu | undefined>(undefined);
  const panels = options?.panels, poll = options?.poll, level = options?.level;
  useEffect(() => {
    if (!controller) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) handle.current = attachStrataGpu(controller, { panels, poll, level }); });
    return () => { cancelled = true; handle.current?.detach(); handle.current = undefined; };
  }, [controller, panels, poll, level]);
  // On unmount, detach before React removes the panels: the passive cleanup above runs after the removal, and the
  // runtime would meet a detached enrolled layer and leave GPU. Changes of controller or options still detach in the
  // passive cleanup, in order with the caller's other effects.
  useLayoutEffect(() => () => { handle.current?.detach(); handle.current = undefined; }, []);
  return handle;
}
