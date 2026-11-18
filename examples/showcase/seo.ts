/**
 * Search and social metadata for the showcase build. `seo()` is a Vite plugin (see `vite.config.ts`).
 * After the bundle is written it gives the home page (`index.html`, already prerendered) its head, and turns
 * the built example studio (`examples.html`) into one page per URL: `examples.html` and `examples/index.html` for
 * the examples' index and `examples/<id>.html` for each example, each with its own title, description, canonical URL, Open
 * Graph and Twitter card, JSON-LD and a `<noscript>` summary with links to every page. It also writes
 * `sitemap.xml`, `robots.txt`, `llms.txt` and `404.html`. The dev server serves the studio under `/examples`.
 *
 * The pages mark where the tags go with `<!-- seo:head -->` and `<!-- seo:body -->`. Canonical,
 * sitemap and social URLs always use `site.origin` (underglass.dev), whatever `base` the build has, so a
 * copy served elsewhere (GitHub Pages) points search engines at the canonical site.
 * `tests/unit/showcase.unit.test.mjs` checks the generated tags.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import { examples, examplesPath, pageMeta, previews, site, type ExampleId } from "./src/catalog.ts";

/** A page of the site: the home page, an example's page, or (undefined) the examples' index. */
export type PageId = ExampleId | "home" | undefined;

/** A social card image: an absolute URL and its size in pixels. */
export interface SocialImage { url: string; width: number; height: number; alt: string }

/** The site-wide social card in `public/og.jpg`. */
export const defaultImage: SocialImage = {
  url: `${site.origin}/og.jpg`, width: 1200, height: 630,
  alt: "Underglass: real React controls, painted by the GPU. Native inputs in one shared WebGPU compositor.",
};

/** Escapes text for an HTML attribute value or text node. */
const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The canonical absolute URL of a page. */
export const canonical = (id?: PageId) => `${site.origin}/${pageMeta(id).path}`;

/** The JSON-LD graph of a page: the site and the software on the home page, a page with breadcrumbs for the examples. */
export function structuredData(id?: PageId) {
  const website = { "@type": "WebSite", "@id": `${site.origin}/#website`, url: `${site.origin}/`, name: site.name,
    description: site.description, inLanguage: "en" };
  const author = { "@type": "Person", name: site.author.name, url: site.author.url };
  if (id === "home") {
    return { "@context": "https://schema.org", "@graph": [website, { "@type": "SoftwareSourceCode", "@id": `${site.origin}/#software`,
      name: site.name, description: site.description, url: `${site.origin}/`, codeRepository: site.repository,
      license: "https://www.apache.org/licenses/LICENSE-2.0", programmingLanguage: ["TypeScript", "WGSL"],
      runtimePlatform: "Web browser", keywords: "React, WebGPU, HTML-in-Canvas, GPU, UI framework", author }] };
  }
  const { title, description } = pageMeta(id), example = examples.find(entry => entry.id === id);
  return { "@context": "https://schema.org", "@graph": [
    { "@type": id ? "WebPage" : "CollectionPage", "@id": canonical(id), url: canonical(id), name: title, description, inLanguage: "en",
      isPartOf: { "@id": `${site.origin}/#website` }, about: { "@id": `${site.origin}/#software` } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: site.name, item: `${site.origin}/` },
      { "@type": "ListItem", position: 2, name: "Examples", item: canonical() },
      ...(example ? [{ "@type": "ListItem", position: 3, name: example.title, item: canonical(id) }] : [])] },
  ] };
}

/** The tags that replace `<!-- seo:head -->` for a page. */
export function headTags(id: PageId, image: SocialImage) {
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
  return `<noscript><main><h1>${html(id ? examples.find(example => example.id === id)!.title : "Underglass live examples")}</h1><p>${html(description)}</p>`
    + `<p>The live examples need JavaScript. <a href="${base}">Underglass home</a> · <a href="${site.docs}">Documentation</a> · <a href="${site.repository}">Source on GitHub</a></p>`
    + `<h2>Examples</h2><ul>${links.join("")}</ul></main></noscript>`;
}

/** `sitemap.xml`: the home page, the examples' index and every example page. `npm run build:site` adds the documentation pages. */
export function sitemap() {
  const urls = [canonical("home"), canonical(), ...examples.map(example => canonical(example.id))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map(url => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
}

/** `robots.txt`: everything may be crawled; names the one sitemap, which lists the documentation pages too. */
export const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${site.origin}/sitemap.xml\n`;

/**
 * `llms.txt`: what the site is and where its parts are, as plain Markdown for a language model or an agent
 * (https://llmstxt.org). The home page's own text is in its HTML; this is the map.
 */
export function llms() {
  return `# ${site.name}

> ${site.description}

Underglass is an experimental GPU-first React framework (there is a Vue adapter, and the core runs without a framework). GPU presentation needs Chrome or Edge 157 or later; without it the same components are ordinary DOM in every browser.

## Start here

- [Home page](${site.origin}/): what it is, with live transitions on the page itself
- [Getting started](${site.docs}/guide/getting-started): install, mount a layer, enable the GPU
- [API reference](${site.docs}/reference/api)
- [Documentation](${site.docs})
- [Source on GitHub](${site.repository})
- [npm: @underglass/react](${site.npm})

## Live examples

${examples.map(example => `- [${example.title}](${canonical(example.id)}): ${example.summary}`).join("\n")}
`;
}

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
      :root { color-scheme: dark; font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif; background: #07080a; color: #eceef2; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; }
      main { max-width: 520px; } h1 { font-size: 40px; margin: 0 0 12px; letter-spacing: -.03em; } p { color: #a3aab6; line-height: 1.6; } a { color: #ff5a36; }
    </style>
  </head>
  <body>
    <main><h1>Page not found</h1><p>There is nothing at this address. <a href="${base}">Go to the Underglass home page</a>
      or pick one of the <a href="${base}examples">live examples</a>.</p></main>
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
    // The dev server: the home page gets its tags, the studio the examples' index's on every route under /examples.
    transformIndexHtml: { order: "pre", handler: (source, context) => context.server
      ? source.replace("<!-- seo:head -->", headTags(context.path.endsWith("examples.html") ? undefined : "home", defaultImage)).replace("<!-- seo:body -->", noscriptBody(undefined, base)) : source },
    // In development the studio's pages (`/examples`, `/examples/<id>`) are all `examples.html`.
    configureServer(server) {
      server.middlewares.use((request, _response, next) => {
        const path = (request.url ?? "").split("?")[0]!;
        if (path.startsWith(`${base}${examplesPath}`) && /^(?:\/[\w-]*)?$/.test(path.slice(base.length + examplesPath.length))) request.url = `${base}examples.html`;
        next();
      });
    },
    async writeBundle(_options, bundle) {
      const home = await readFile(join(outDir, "index.html"), "utf8");
      if (!home.includes("<!-- seo:head -->")) throw new Error("index.html lost its seo marker");
      const template = await readFile(join(outDir, "examples.html"), "utf8");
      if (!template.includes("<!-- seo:head -->") || !template.includes("<!-- seo:body -->")) throw new Error("examples.html lost its seo markers");
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
      // The examples' index is written twice, so that `/examples` serves it on every host: as the directory's own page
      // (a host that redirects to `/examples/`) and as `examples.html` (a host that tries the path with `.html`).
      await writeFile(join(outDir, "examples/index.html"), page());
      await writeFile(join(outDir, "examples.html"), page());
      await writeFile(join(outDir, "index.html"), home.replace("<!-- seo:head -->", headTags("home", defaultImage)));
      await writeFile(join(outDir, "sitemap.xml"), sitemap());
      await writeFile(join(outDir, "robots.txt"), robots());
      await writeFile(join(outDir, "llms.txt"), llms());
      await writeFile(join(outDir, "404.html"), notFoundPage(base));
    },
  };
}
