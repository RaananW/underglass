/**
 * Vercel Web Analytics for the showcase: page views (each example is its own URL, so switching examples
 * counts as a page view) and the custom events below. Only builds made on Vercel load it
 * (`__VERCEL_ANALYTICS__`, set in `vite.config.ts`); anywhere else `startAnalytics` and `track` do nothing.
 * Vercel Web Analytics sets no cookies. No event carries anything a visitor typed, searched or filmed:
 * only example ids, runtime modes and the status line's headline.
 */
import { inject, track as send } from "@vercel/analytics";
import type { ExampleId } from "./catalog";

declare const __VERCEL_ANALYTICS__: boolean;
/** Whether this build sends analytics (the page footer says so when it does). */
export const analyticsEnabled = __VERCEL_ANALYTICS__;

/**
 * The custom events and their properties.
 * - `GPU Enable`: a press of **Enable experimental GPU** and what admission decided (`result` is the
 *   resulting mode, `status` the status line's headline), with the up-front browser guess (`support`).
 * - `GPU Lost`: GPU mode ended without the visitor asking (a revocation or fallback), with its headline.
 * - `Studio Action`: **Use ordinary DOM** or **Dispose example**.
 * - `GPU Help`: the help panel was used (`action`: the preview image, a copied flag or the Canary link).
 * - `Outbound Link`: a link to the source or the npm package (`target`).
 */
export interface Events {
  "GPU Enable": { example: ExampleId; result: string; status: string; support: string };
  "GPU Lost": { example: ExampleId; status: string };
  "Studio Action": { example: ExampleId; action: "disable" | "dispose" };
  "GPU Help": { example: ExampleId; action: "preview" | "copy-flag" | "canary" };
  "Outbound Link": { target: "github" | "npm" };
}

/** Loads the analytics script, once, when this build is a Vercel build. */
export function startAnalytics() {
  if (analyticsEnabled) inject({ mode: "production", framework: "react" });
}

/** Sends one custom event. Strings are cut to 120 characters (an unrecognised runtime reason is its own headline). */
export function track<Name extends keyof Events>(name: Name, properties: Events[Name]) {
  if (!analyticsEnabled) return;
  send(name, Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 120) : value])));
}
