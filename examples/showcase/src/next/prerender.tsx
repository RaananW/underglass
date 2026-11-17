/**
 * Renders the preview home page to HTML. The build loads this module in Node (`prerender.ts`, no DOM) and writes the
 * result into `next.html`, so the page's text is in the file a browser, a crawler or an agent is served.
 */
import { renderToString } from "react-dom/server";
import { Page } from "./page";

export const prerender = (base: string) => renderToString(<Page base={base} />);
