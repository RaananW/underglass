/**
 * Renders the application of `core-hydration.html` to HTML. The playground's Vite config loads this module in Node
 * (no DOM) when it builds or serves the page and writes the result into the frame.
 */
import { renderToString } from "react-dom/server";
import { prerenderCanvasApp } from "@underglass/react";
import { App } from "./app";

export const prerender = () => prerenderCanvasApp(<App />, renderToString);
