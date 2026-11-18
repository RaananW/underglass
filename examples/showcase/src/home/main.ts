/**
 * Browser entry of the preview home page (`next.html`). The page is already in the HTML (`prerender.tsx`), with its
 * stylesheet inlined (`inline-css.ts`), so the first frame needs no script. This entry only decides what to load:
 *
 * - `gpu.tsx` in a browser with the APIs GPU presentation needs, at any window size (the deck runs on a phone too): the
 *   Underglass runtime hydrates the stage and starts GPU presentation.
 * - `dom.tsx` everywhere else: React alone hydrates the same markup. The runtime and its engine, two thirds of the
 *   page's JavaScript, are never downloaded.
 *
 * In a build that sends analytics it also starts them, as a chunk of their own (`track.ts`).
 */
import "./home.css";
import { detectSupport } from "../support";
import { startHomeAnalytics } from "./track";

const support = detectSupport();
void (support === "likely" ? import("./gpu") : import("./dom"));
startHomeAnalytics(support);
