/**
 * Vite plugin that writes a page's stylesheet into the page itself, so its first frame needs one request: the HTML.
 * Used for the preview home page (`next.html`), whose whole stylesheet is a few kilobytes. The stylesheet file is
 * dropped from the build when no other page or script refers to it.
 */
import type { Plugin } from "vite";

export function inlineCss(pages: readonly string[]): Plugin {
  return {
    name: "underglass-showcase-inline-css",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      for (const page of pages) {
        const html = bundle[page];
        if (html?.type !== "asset") throw new Error(`inline-css: ${page} is not in the build`);
        let source = String(html.source);
        const inlined: string[] = [];
        source = source.replace(/<link rel="stylesheet"[^>]*href="[^"]*\/(assets\/[^"]+\.css)"[^>]*>/g, (link, name: string) => {
          const css = bundle[name];
          if (css?.type !== "asset") throw new Error(`inline-css: ${name} is not in the build`);
          inlined.push(name);
          // A stylesheet cannot hold the text that would end the element.
          return `<style>${String(css.source).trim().replace(/<\/style/gi, "<\\/style")}</style>`;
        });
        if (!inlined.length) throw new Error(`inline-css: ${page} links no stylesheet`);
        html.source = source;
        for (const name of inlined) {
          const file = name.replace(/^assets\//, "");
          const used = Object.values(bundle).some(item => item !== html && (item.type === "chunk" ? item.code.includes(file)
            : /\.(?:html|css)$/.test(item.fileName) && String(item.source).includes(file)));
          if (!used) delete bundle[name];
        }
      }
    },
  };
}
