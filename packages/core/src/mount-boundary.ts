/**
 * The mount boundary: owns the single persistent framework root container and moves it between the
 * ordinary DOM host and the GPU output canvas without remounting. Created by the renderer in
 * `renderer.ts` so GPU admission and recovery keep the original controls and framework state.
 */
import { CONTAINER_CLASS } from "./hosts.js";

/** Hosts and mount callback for `createMountBoundary`. */
export interface MountBoundaryOptions {
  /** @deprecated Unused: native capture happens on `outputCanvas`. Accepted for compatibility and removed on dispose. */
  captureHost?: HTMLCanvasElement;
  /** Owning output canvas; in GPU mode the root container lives inside it. */
  outputCanvas: HTMLCanvasElement;
  /** Holds the root container in ordinary DOM mode. */
  ordinaryHost: HTMLElement;
  /**
   * Adopts the prerendered root container in `ordinaryHost` (written by `canvasHostsMarkup`) instead of
   * creating one, for a `mount` that hydrates it. The host must then hold exactly that container.
   */
  hydrate?: boolean;
  /** Creates the persistent framework root in `container` and returns its synchronous unmount callback. */
  mount(container: HTMLDivElement): () => void;
}

/**
 * Creates the adapter-owned root container inside `ordinaryHost`, calls `mount` once to create the
 * persistent framework root there, and returns controls to move that same container between the
 * ordinary host and the output canvas with `moveBefore`, which preserves DOM state so the original
 * controls and framework state survive the move. Throws if the hosts are not distinct, connected,
 * same-document siblings, or are not empty. `dispose` unmounts and requires the container to be back
 * in the ordinary host.
 *
 * With `hydrate`, the container is the prerendered one already in `ordinaryHost`: it is adopted, not
 * created, so `mount` can hydrate the markup inside it and the prerendered elements stay the original
 * ones. If `mount` throws, the prerendered container is left in place.
 */
export function createMountBoundary(options: MountBoundaryOptions) {
  const { captureHost, outputCanvas, ordinaryHost } = options;
  const document = ordinaryHost.ownerDocument;
  // Checked at creation and again by `assertMovable`, in case the hosts were detached or moved since.
  function validateDestinations() {
    if (captureHost === outputCanvas || ordinaryHost === captureHost || ordinaryHost === outputCanvas
      || [captureHost ?? outputCanvas, outputCanvas, ordinaryHost].some(node => node.ownerDocument !== document || !node.isConnected)
      || !ordinaryHost.parentElement || captureHost && captureHost.parentElement !== ordinaryHost.parentElement
      || outputCanvas.parentElement !== ordinaryHost.parentElement) {
      throw new Error("Mount boundary requires distinct connected same-document sibling hosts");
    }
  }
  validateDestinations();
  if (captureHost?.childNodes.length || outputCanvas.childNodes.length) {
    throw new Error("Mount boundary requires empty adapter-owned hosts");
  }
  let container: HTMLDivElement;
  if (options.hydrate) {
    // Whitespace and comments beside the container are tolerated, as they are between the hosts; any other node is not adapter-owned.
    const foreign = [...ordinaryHost.childNodes].some(node => node.nodeType === 3 ? !!node.nodeValue!.trim() : node.nodeType !== 1 && node.nodeType !== 8);
    const prerendered = ordinaryHost.firstElementChild;
    if (foreign || ordinaryHost.childElementCount !== 1 || !(prerendered instanceof HTMLDivElement) || !prerendered.classList.contains(CONTAINER_CLASS)) {
      throw new Error("Hydration requires the ordinary host to hold exactly the prerendered root container written by canvasHostsMarkup");
    }
    container = prerendered;
  } else {
    if (ordinaryHost.childNodes.length) throw new Error("Mount boundary requires empty adapter-owned hosts");
    container = document.createElement("div");
    container.className = CONTAINER_CLASS;
    ordinaryHost.append(container); // Adapter-owned, before the persistent framework root is created.
  }
  let unmount: () => void;
  try { unmount = options.mount(container); }
  catch (error) { if (!options.hydrate) container.remove(); throw error; }
  let disposed = false;
  // Throws unless a state-preserving move is possible right now; moves nothing.
  function assertMovable() {
    if (disposed) throw new Error("Mount boundary is disposed");
    validateDestinations();
    if (container.parentElement !== ordinaryHost && container.parentElement !== outputCanvas) {
      throw new Error("Root container left the adapter-owned destinations");
    }
    if (typeof ordinaryHost.moveBefore !== "function" || typeof outputCanvas.moveBefore !== "function") {
      throw new Error("State-preserving Element.moveBefore unavailable");
    }
  }
  function moveTo(destination: HTMLElement) {
    if (disposed) throw new Error("Mount boundary is disposed");
    if (container.parentElement === destination) return false;
    assertMovable();
    destination.moveBefore(container, null);
    return true;
  }
  return {
    container,
    assertMovable,
    // Both return true when the container moved and false when it was already at the destination.
    moveToCapture: () => moveTo(outputCanvas),
    moveToDOM: () => moveTo(ordinaryHost),
    dispose() {
      if (disposed) return;
      if (container.parentElement !== ordinaryHost) throw new Error("Recover to ordinary DOM before unmounting");
      unmount();
      container.remove();
      disposed = true;
    },
  };
}
