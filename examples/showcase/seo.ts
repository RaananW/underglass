/**
 * Search and social metadata for the showcase build. `seo()` is a Vite plugin (see `vite.config.ts`):
 * after the bundle is written it turns the built `index.html` into one page per URL (`index.html` for
 * the home page, `examples/<id>.html` for each example), each with its own title, description,
 * canonical URL, Open Graph and Twitter card, JSON-LD and a `<noscript>` summary with links to every
 * page, and writes `sitemap.xml`, `robots.txt` and `404.html`. The dev server gets the home page's head.
 *
 * `index.html` marks where the tags go with `<!-- seo:head -->` and `<!-- seo:body -->`. Canonical,
 * sitemap and social URLs always use `site.origin` (underglass.dev), whatever `base` the build has, so a
 * copy served elsewhere (GitHub Pages) points search engines at the canonical site.
 * `tests/unit/showcase.unit.test.mjs` checks the generated tags.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { examples, pageMeta, previews, site, type ExampleId } from "./src/catalog.ts";

/** A social card image: an absolute URL and its size in pixels. */
export interface SocialImage { url: string; width: number; height: number; alt: string }

/** The site-wide social card in `public/og.jpg`. */
export const defaultImage: SocialImage = {
  url: `${site.origin}/og.jpg`, width: 1200, height: 630,
  alt: "Underglass: real React controls, painted by the GPU. Native inputs in one shared WebGPU compositor.",
};

/** Escapes text for an HTML attribute value or text node. */
const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The canonical absolute URL of the home page (no id) or an example page. */
export const canonical = (id?: ExampleId) => `${site.origin}/${pageMeta(id).path}`;

/** The JSON-LD graph of a page: the site and the software on the home page, a page with breadcrumbs for an example. */
export function structuredData(id?: ExampleId) {
  const website = { "@type": "WebSite", "@id": `${site.origin}/#website`, url: `${site.origin}/`, name: site.name,
    description: site.description, inLanguage: "en" };
  const author = { "@type": "Person", name: site.author.name, url: site.author.url };
  if (!id) {
    return { "@context": "https://schema.org", "@graph": [website, { "@type": "SoftwareSourceCode", "@id": `${site.origin}/#software`,
      name: site.name, description: site.description, url: `${site.origin}/`, codeRepository: site.repository,
      license: "https://www.apache.org/licenses/LICENSE-2.0", programmingLanguage: ["TypeScript", "WGSL"],
      runtimePlatform: "Web browser", keywords: "React, WebGPU, HTML-in-Canvas, GPU, UI framework", author }] };
  }
  const { title, description } = pageMeta(id), example = examples.find(entry => entry.id === id)!;
  return { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", "@id": canonical(id), url: canonical(id), name: title, description, inLanguage: "en",
      isPartOf: { "@id": `${site.origin}/#website` }, about: { "@id": `${site.origin}/#software` } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: site.name, item: `${site.origin}/` },
      { "@type": "ListItem", position: 2, name: example.title, item: canonical(id) }] },
  ] };
}

/** The tags that replace `<!-- seo:head -->` for the home page (no id) or an example page. */
export function headTags(id: ExampleId | undefined, image: SocialImage) {
  const { title, description } = pageMeta(id), url = canonical(id);
  // `<` is escaped so that no string in the data can close the script element.
  const json = JSON.stringify(structuredData(id)).replace(/</g, "\\u003c");
  return [
    `<title>${html(title)}</title>`,
    `<meta name="description" content="${html(description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta name="robots" content="index, follow, max-image-preview:large">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${site.name}">`,
    `<meta property="og:locale" content="en_US">`,
    `<meta property="og:title" content="${html(title)}">`,
    `<meta property="og:description" content="${html(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image.url}">`,
    `<meta property="og:image:width" content="${image.width}">`,
    `<meta property="og:image:height" content="${image.height}">`,
    `<meta property="og:image:alt" content="${html(image.alt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${html(title)}">`,
    `<meta name="twitter:description" content="${html(description)}">`,
    `<meta name="twitter:image" content="${image.url}">`,
    `<meta name="twitter:image:alt" content="${html(image.alt)}">`,
    `<script type="application/ld+json">${json}</script>`,
  ].join("\n    ");
}

/** What a browser without JavaScript (and a crawler that does not run it) sees: the page's heading and links to every page. */
export function noscriptBody(id: ExampleId | undefined, base: string) {
  const { description } = pageMeta(id);
  const links = examples.map(example => `<li><a href="${base}examples/${example.id}">${html(example.title)}</a>: ${html(example.summary)}</li>`);
  return `<noscript><main><h1>${html(id ? examples.find(example => example.id === id)!.title : site.title)}</h1><p>${html(description)}</p>`
    + `<p>The live examples need JavaScript. <a href="${base}">Underglass home</a> · <a href="${site.docs}">Documentation</a> · <a href="${site.repository}">Source on GitHub</a></p>`
    + `<h2>Examples</h2><ul>${links.join("")}</ul></main></noscript>`;
}

/** `sitemap.xml`: the home page and every example page. */
export function sitemap() {
  const urls = [canonical(), ...examples.map(example => canonical(example.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map(url => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
}

/** `robots.txt`: everything may be crawled; names the showcase's sitemap and the documentation site's (`examples/docs`). */
export const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\nSitemap: ${site.docs}/sitemap-index.xml\n`;

/** `404.html`: a small static page, not indexed, with links back into the site. */
export function notFoundPage(base: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex">
    <title>Page not found | Underglass</title>
    <link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
    <style>
      :root { color-scheme: dark; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; background: #0d0b1a; color: #f4f0ff; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; }
      main { max-width: 520px; } h1 { font-size: 40px; margin: 0 0 12px; } p { color: #cdc6e2; line-height: 1.6; } a { color: #a48cff; }
    </style>
  </head>
  <body>
    <main><h1>Page not found</h1><p>There is nothing at this address. <a href="${base}">Go to the Underglass home page</a>
      or pick one of the <a href="${base}#examples">live examples</a>.</p></main>
  </body>
</html>
`;
}

/** Vite plugin: writes the per-page HTML, sitemap, robots and 404 files after the bundle (see the file comment). */
export function seo(): Plugin {
  let base = "/", outDir = "dist";
  return {
    name: "underglass-showcase-seo",
    configResolved(config) { base = config.base; outDir = resolve(config.root, config.build.outDir); },
    // The dev server shows the home page's tags on every route.
    transformIndexHtml: { order: "pre", handler: (source, context) => context.server
      ? source.replace("<!-- seo:head -->", headTags(undefined, defaultImage)).replace("<!-- seo:body -->", noscriptBody(undefined, base)) : source },
    async writeBundle(_options, bundle) {
      const template = await readFile(join(outDir, "index.html"), "utf8");
      if (!template.includes("<!-- seo:head -->") || !template.includes("<!-- seo:body -->")) throw new Error("index.html lost its seo markers");
      // An example with a GPU preview uses it (Vite's hashed copy) as its social card.
      const image = (id: ExampleId): SocialImage => {
        const name = previews[id];
        const asset = name && Object.values(bundle).find(file => file.type === "asset" && file.originalFileNames.some(path => path.endsWith(`previews/${name}.jpg`)));
        const title = examples.find(example => example.id === id)!.title;
        return asset ? { url: `${site.origin}/${asset.fileName}`, width: 1041, height: 700, alt: `${title} in GPU mode, captured in Chrome Canary` } : defaultImage;
      };
      const page = (id?: ExampleId) => template.replace("<!-- seo:head -->", headTags(id, id ? image(id) : defaultImage)).replace("<!-- seo:body -->", noscriptBody(id, base));
      await mkdir(join(outDir, "examples"), { recursive: true });
      for (const example of examples) await writeFile(join(outDir, `examples/${example.id}.html`), page(example.id));
      await writeFile(join(outDir, "index.html"), page());
      await writeFile(join(outDir, "sitemap.xml"), sitemap());
      await writeFile(join(outDir, "robots.txt"), robots());
      await writeFile(join(outDir, "404.html"), notFoundPage(base));
    },
  };
}
