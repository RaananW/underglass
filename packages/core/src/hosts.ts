/**
 * Convenience scaffolding for the explicit mount boundary. Mount functions (`mountCanvasApp`,
 * `mountApplicationModule`) require empty, connected, same-document sibling hosts outside every
 * framework root; `createCanvasHosts` builds them inside an application-owned frame so callers do
 * not hand-write the host styles. A page rendered ahead of time writes the same hosts as HTML with
 * `canvasHostsMarkup`, and `createCanvasHosts` then adopts them instead of creating new ones.
 */

/** Marks a prerendered host with its role (`output`, `ordinary` or `overlay`), so `createCanvasHosts` can adopt it. */
const HOST = "data-underglass-host";
/** Both presentations fill the frame at the same origin, so DOM and GPU layouts coincide. */
const FILL = { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" } as const;
/** The class of the adapter-owned root container inside the ordinary host. */
export const CONTAINER_CLASS = "app-container";
/** The inline style the runtime gives the root container; the prerendered container carries the same. */
export const CONTAINER_STYLE = { position: "relative", width: "100%", height: "100%" } as const;
const css = (style: Record<string, string>) => Object.entries(style).map(([name, value]) => `${name}:${value}`).join(";");

/** The adapter-owned hosts returned by `createCanvasHosts`, ready to pass to a mount function. */
export interface CanvasHosts {
  /** Owning WebGPU output canvas; in GPU mode the original application root is moved inside it. */
  outputCanvas: HTMLCanvasElement;
  /** Holds the original application root before GPU admission and after recovery or `disable()`. */
  ordinaryHost: HTMLDivElement;
  /** Empty host for `NativeOverlay` portals; native dialogs and popovers stay outside capture. */
  overlayHost: HTMLDivElement;
  /** Removes the hosts; call only after the controller is disposed. */
  remove(): void;
}

/**
 * The adapter-owned hosts as HTML, for a page rendered ahead of time (on a server or in a build): the
 * hidden output canvas, the ordinary host holding the root container with `content` (the application's
 * markup, as HTML from the framework's server renderer), and the empty overlay host. Write it as the
 * only content of the sized frame element. In the browser, `createCanvasHosts(frame)` adopts these
 * elements and a mount with `hydrate: true` adopts the container, so the prerendered elements become
 * the application's original elements. Pure string work: safe to call without a DOM.
 */
export function canvasHostsMarkup(content = ""): string {
  return `<canvas ${HOST}="output" hidden style="${css(FILL)};pointer-events:none"></canvas>`
    + `<div ${HOST}="ordinary" style="${css(FILL)}"><div class="${CONTAINER_CLASS}" style="${css(CONTAINER_STYLE)}">${content}</div></div>`
    + `<div ${HOST}="overlay"></div>`;
}

/**
 * Creates the adapter-owned sibling hosts `mountCanvasApp` requires inside a
 * sized frame: the GPU output canvas, the ordinary DOM host and the native
 * overlay host. The output canvas is not `aria-hidden`: in GPU mode the
 * original controls live inside it and must stay in the accessibility tree.
 *
 * A frame that holds prerendered hosts (`canvasHostsMarkup`) keeps them: they are returned as they
 * are, with the prerendered application inside the ordinary host. Throws when the frame holds only
 * some of them, or another element or text beside them.
 */
export function createCanvasHosts(frame: HTMLElement): CanvasHosts {
  const document = frame.ownerDocument;
  if (!frame.isConnected) throw new Error("Canvas hosts require a connected frame");
  const hosts = (outputCanvas: HTMLCanvasElement, ordinaryHost: HTMLDivElement, overlayHost: HTMLDivElement): CanvasHosts =>
    ({ outputCanvas, ordinaryHost, overlayHost, remove() { outputCanvas.remove(); ordinaryHost.remove(); overlayHost.remove(); } });
  // The absolutely positioned hosts need a containing block; only a static frame is changed.
  const contain = () => { if (getComputedStyle(frame).position === "static") frame.style.position = "relative"; };
  const prerendered = [...frame.children].filter(node => node.hasAttribute(HOST));
  if (prerendered.length) {
    const role = (name: string) => prerendered.filter(node => node.getAttribute(HOST) === name);
    const [output, ordinary, overlay] = [role("output"), role("ordinary"), role("overlay")];
    // Whitespace and comments between the hosts are tolerated; any other node is not adapter-owned.
    const foreign = [...frame.childNodes].some(node => node.nodeType === 1 ? !prerendered.includes(node as Element)
      : node.nodeType === 3 ? !!node.nodeValue!.trim() : node.nodeType !== 8);
    const [canvas, host, portal] = [output[0], ordinary[0], overlay[0]];
    if (prerendered.length !== 3 || foreign || !(canvas instanceof HTMLCanvasElement) || !(host instanceof HTMLDivElement) || !(portal instanceof HTMLDivElement)) {
      throw new Error("Prerendered canvas hosts must be exactly the output canvas, the ordinary host and the overlay host written by canvasHostsMarkup");
    }
    contain();
    return hosts(canvas, host, portal);
  }
  const outputCanvas = document.createElement("canvas");
  const ordinaryHost = document.createElement("div");
  const overlayHost = document.createElement("div");
  for (const node of [outputCanvas, ordinaryHost]) Object.assign(node.style, FILL);
  // The renderer enables pointer events while GPU output is presented.
  outputCanvas.style.pointerEvents = "none";
  // Ordinary DOM is the initial presentation; admission reveals the canvas.
  outputCanvas.hidden = true;
  contain();
  frame.append(outputCanvas, ordinaryHost, overlayHost);
  return hosts(outputCanvas, ordinaryHost, overlayHost);
}
