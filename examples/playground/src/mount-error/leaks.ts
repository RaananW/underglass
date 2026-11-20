/**
 * Counts what a mount into `hosts` could leave behind, for the first-render error pages (`mount-error.html` for
 * React, `vue-mount-error.html` for Vue). Call it once, before the first mount: from then on it tracks
 *
 * - the root containers the runtime appends to the ordinary host;
 * - observers that observe something and were not disconnected since;
 * - listeners on the window, the document, media queries and the three hosts.
 */
import type { CanvasHosts } from "@underglass/core";

export function watchMounts(frame: HTMLElement, hosts: CanvasHosts) {
  // Root containers, recorded as the runtime appends them. Created before the observer counting below starts.
  const containers: HTMLDivElement[] = [];
  const added = new MutationObserver(records => record(records));
  added.observe(frame, { childList: true, subtree: true });
  function record(records: MutationRecord[]) {
    for (const entry of records) for (const node of entry.addedNodes) if (node instanceof HTMLDivElement && entry.target === hosts.ordinaryHost) containers.push(node);
  }

  // Observers that observe something and were not disconnected since.
  const observing = new Set<object>();
  for (const Observer of [MutationObserver, ResizeObserver, IntersectionObserver] as { prototype: { observe(...args: unknown[]): void; disconnect(): void } }[]) {
    const { observe, disconnect } = Observer.prototype;
    Observer.prototype.observe = function (this: object, ...args: unknown[]) { observing.add(this); return observe.apply(this, args); };
    Observer.prototype.disconnect = function (this: object) { observing.delete(this); return disconnect.call(this); };
  }
  // Listeners on the targets a runtime or a framework root outside its container could hold on to.
  const listening: { target: EventTarget; type: string; listener: unknown; capture: boolean }[] = [];
  const watched = (target: EventTarget) => target === window || target === document || target instanceof MediaQueryList
    || target === hosts.outputCanvas || target === hosts.ordinaryHost || target === hosts.overlayHost;
  const capture = (options: unknown) => typeof options === "boolean" ? options : !!(options as { capture?: boolean } | undefined)?.capture;
  const find = (target: EventTarget, type: string, listener: unknown, options: unknown) => listening.findIndex(entry =>
    entry.target === target && entry.type === type && entry.listener === listener && entry.capture === capture(options));
  const { addEventListener, removeEventListener } = EventTarget.prototype;
  EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) {
    if (listener && watched(this) && find(this, type, listener, options) < 0) listening.push({ target: this, type, listener, capture: capture(options) });
    return addEventListener.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | EventListenerOptions) {
    const index = find(this, type, listener, options);
    if (index >= 0) listening.splice(index, 1);
    return removeEventListener.call(this, type, listener, options);
  };
  const described = (target: EventTarget) => target === window ? "window" : target === document ? "document"
    : target instanceof MediaQueryList ? `media ${target.media}` : `host ${(target as Element).getAttribute("data-underglass-host") ?? (target as Element).tagName}`;

  return {
    /** Every root container the runtime has appended so far, oldest first. */
    containers() { record(added.takeRecords()); return containers; },
    /** The hosts' markup, and the observers and listeners now held. */
    snapshot: () => ({
      hosts: [hosts.outputCanvas, hosts.ordinaryHost, hosts.overlayHost].map(host => host.outerHTML),
      frameChildren: frame.childNodes.length,
      observers: observing.size,
      listeners: listening.map(entry => `${described(entry.target)} ${entry.type}`).sort(),
    }),
  };
}
