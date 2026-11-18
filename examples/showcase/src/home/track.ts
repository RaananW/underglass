/**
 * Analytics for the home page (`../analytics.ts` has the events). The home page's first frame needs no script and its
 * entry is small, so nothing of analytics is in it: in a build that sends analytics (a Vercel build) the module is
 * loaded as a chunk of its own once the page's script runs; in every other build this file compiles to nothing.
 */
import type { Events } from "../analytics";
import type { Support } from "../support";

declare const __VERCEL_ANALYTICS__: boolean;

let loaded: Promise<typeof import("../analytics")> | undefined;
const load = () => loaded ??= import("../analytics");

/** Sends one custom event from the home page. */
export function homeTrack<Name extends keyof Events>(name: Name, properties: Events[Name]) {
  if (__VERCEL_ANALYTICS__) void load().then(analytics => analytics.track(name, properties), () => { /* blocked: nothing is sent */ });
}

/**
 * Starts analytics for the home page: the page view, `Browser Support` once per visit, and `Outbound Link` for the
 * links to the source and the npm package (the header and footer are static markup, so one listener serves them all).
 */
export function startHomeAnalytics(support: Support) {
  if (!__VERCEL_ANALYTICS__) return;
  void load().then(analytics => { analytics.startAnalytics(); analytics.trackSupport(support); }, () => { /* blocked: nothing is sent */ });
  document.addEventListener("click", event => {
    // By host, not by the catalog's addresses: the catalog is not in the page's entry script.
    const link = (event.target as Element).closest?.<HTMLAnchorElement>("a[href]"), host = link?.hostname ?? "";
    if (host === "github.com") homeTrack("Outbound Link", { target: "github" });
    else if (host === "www.npmjs.com") homeTrack("Outbound Link", { target: "npm" });
  });
}
