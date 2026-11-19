/**
 * Vercel Web Analytics for the showcase: page views (the home page, and each example at its own URL, so switching
 * examples counts as a page view) and the custom events below. The example studio loads this module with its page;
 * the home page loads it as a chunk of its own, after its first frame (`home/track.ts`). Only builds made on Vercel load it
 * (`__VERCEL_ANALYTICS__`, set in `vite.config.ts`); anywhere else `startAnalytics` and `track` do nothing.
 * Vercel Web Analytics sets no cookies. No event carries anything a visitor typed, searched or filmed:
 * only example ids, runtime modes and the status line's headline.
 */
import { inject, track as send } from "@vercel/analytics";
import type { ExampleId } from "./catalog";
import type { Support } from "./support";

declare const __VERCEL_ANALYTICS__: boolean;
/** Whether this build sends analytics (the page footer says so when it does). */
export const analyticsEnabled = __VERCEL_ANALYTICS__;

/**
 * The custom events and their properties.
 * - `Browser Support`: once per visit, the page's up-front guess of whether this browser can run GPU
 *   mode (`detectSupport`): `likely`, `chrome-flags` or `unsupported`. Against `GPU Enable` it shows how
 *   many visitors could run GPU mode, how many tried and how many got it. It is a guess: only admission
 *   proves GPU mode works.
 * - `GPU Enable`: an admission and what it decided (`result` is the resulting mode, `status` the status
 *   line's headline), with the up-front browser guess (`support`), whether the browser's own API or the
 *   polyfill was admitted (`api`), so polyfilled runs never count as native ones, and what started it
 *   (`trigger`): `auto` when the stage came into view on a `likely` browser, `button` for a press of
 *   **Enable experimental GPU** (or **Run GPU mode on the polyfill**). On the home page (`example: "home"`) `auto` is
 *   the deck starting by itself (at load, after a lost GPU, or when a window grows) and `button` the header's switch;
 *   an automatic attempt that ends as the one before it did is not sent again.
 * - `GPU Lost`: GPU mode ended without the visitor asking (a revocation or fallback), with its headline and `api`.
 * - `Studio Action`: **Use ordinary DOM** or **Dispose example**; on the home page, the header's switch turned off.
 * - `Home Demo`: the home page's live demonstration was used: `Play` pressed (`play`) or the slider moved (`scrub`,
 *   once per change and page load), with the change picked (`kind`) and how the page was drawn (`presentation`).
 * - `GPU Help`: the help panel was used (`action`: the preview image, a copied flag, the Chrome download link
 *   (`download`; `canary` before 157 shipped HTML-in-Canvas) or the polyfill button).
 * - `Outbound Link`: a link to the source or the npm package (`target`).
 */
/** Which HTML-in-Canvas implementation GPU mode ran on: the browser's own, or the opt-in polyfill. */
export type Api = "native" | "polyfill";

/** Where an event happened: an example's page, or the home page. */
export type Page = ExampleId | "home";

export interface Events {
  "Browser Support": { support: Support };
  "GPU Enable": { example: Page; result: string; status: string; support: string; api: Api; trigger: "auto" | "button" };
  "GPU Lost": { example: Page; status: string; api: Api };
  "Studio Action": { example: Page; action: "disable" | "dispose" };
  "Home Demo": { kind: string; action: "play" | "scrub"; presentation: "gpu" | "dom" };
  "GPU Help": { example: ExampleId; action: "preview" | "copy-flag" | "download" | "polyfill" };
  "Outbound Link": { target: "github" | "npm" };
}

/** Loads the analytics script, once, when this build is a Vercel build. */
export function startAnalytics() {
  if (analyticsEnabled) inject({ mode: "production", framework: "react" });
}

/**
 * Sends `Browser Support` once per visit (the browser tab's session): later page loads in the same tab, such
 * as a reload, send nothing. Without session storage (a private window may refuse it) it sends once per load.
 */
export function trackSupport(support: Support) {
  if (!analyticsEnabled) return;
  try {
    if (sessionStorage.getItem("underglass-support-sent")) return;
    sessionStorage.setItem("underglass-support-sent", "1");
  } catch { /* No session storage: send once for this load. */ }
  track("Browser Support", { support });
}

/** Sends one custom event. Strings are cut to 120 characters (an unrecognised runtime reason is its own headline). */
export function track<Name extends keyof Events>(name: Name, properties: Events[Name]) {
  if (!analyticsEnabled) return;
  send(name, Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : value])));
}
