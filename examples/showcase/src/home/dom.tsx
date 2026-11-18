/**
 * The preview home page where the deck cannot run (`main.ts` decides): a browser without the APIs. React
 * alone hydrates the prerendered stage, in the root container the Underglass hosts were served with, and the page stays
 * the flow in ordinary DOM. Nothing of Underglass is loaded: the same components are simply an ordinary React page.
 */
import { hydrateRoot } from "react-dom/client";
import { flowIndex, markRail, note } from "./flow";
import { Stage } from "./page";

hydrateRoot(document.querySelector("#stage .app-container")!, <Stage base={import.meta.env.BASE_URL} />);

// The readout's switch stays disabled, as served; it says why.
const reason = "GPU presentation needs Chrome or Edge 157 or later. This is the same page as ordinary DOM.";
note(reason);
document.getElementById("deck-switch")!.title = reason;

// The side scale marks the section in the window.
let frame = 0, marked = -1;
const mark = () => { frame = 0; const now = flowIndex(); if (now !== marked) markRail(marked = now); };
addEventListener("scroll", () => { frame ||= requestAnimationFrame(mark); }, { passive: true });
addEventListener("resize", () => { frame ||= requestAnimationFrame(mark); });
mark();
