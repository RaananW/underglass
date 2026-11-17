/**
 * Browser entry of the preview home page (`next.html`). The page is already in the HTML (`prerender.tsx`), with its
 * stylesheet inlined (`inline-css.ts`), so the first frame needs no script. This entry only decides what to load:
 *
 * - `gpu.tsx` where the deck can run: the Underglass runtime hydrates the stage and starts GPU presentation.
 * - `dom.tsx` everywhere else: React alone hydrates the same markup. The runtime and its engine, two thirds of the
 *   page's JavaScript, are never downloaded.
 *
 * The deck can run in a browser with the APIs. A phone or a tablet has them too in Chrome, but the deck needs a wide
 * window and theirs cannot grow, so a narrow one with a coarse pointer takes the React-only path. A desktop window
 * can be made wider, so it loads the runtime at any width.
 */
import "./next.css";
import { detectSupport } from "../support";

const wide = matchMedia("(min-width: 1180px)").matches, coarse = matchMedia("(pointer: coarse)").matches;
void (detectSupport() === "likely" && (wide || !coarse) ? import("./gpu") : import("./dom"));
