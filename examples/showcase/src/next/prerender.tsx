/**
 * Renders the preview home page to HTML. The build loads this module in Node (`prerender.ts`, no DOM) and writes the
 * result into `next.html`, so the page's text is in the file a browser, a crawler or an agent is served.
 *
 * The header, the side scale and the footer are static markup. The stage is an Underglass root rendered ahead of time
 * (`prerenderCanvasApp`): its hosts and the application inside them, which `main.tsx` adopts and hydrates, so the
 * elements served here are the ones the GPU later draws.
 */
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { prerenderCanvasApp } from "@underglass/react";
import { Backdrop, Footer, Header, Rail, sections, Stage } from "./page";

export const prerender = (base: string) =>
  renderToStaticMarkup(<><Backdrop /><Header base={base} /><Rail /></>)
  // The track is as tall as the sections it holds; in the deck the pin keeps the stage in the window (`next.css`).
  + `<main id="track" style="--count:${sections.length}"><div id="pin"><div id="stage">${prerenderCanvasApp(<Stage base={base} />, renderToString)}</div></div></main>`
  + renderToStaticMarkup(<Footer />);
