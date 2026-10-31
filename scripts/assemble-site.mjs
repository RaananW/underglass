/**
 * Puts the documentation site into the built showcase, so one output directory serves underglass.dev and
 * underglass.dev/docs. Runs last in `npm run build:site` (the Vercel build and CI), after the showcase and
 * `examples/docs` are built.
 *
 * Checks the documentation build first: no symlinks, no local paths, private keys or source-map references in
 * text files, and every link to a page under `/docs` (with its `#anchor`, and same-page anchors) resolves to a
 * built page and heading. The links checked are the HTML pages' `href`s and the Markdown links of the pages'
 * Markdown copies, `llms.txt` and `llms-full.txt`; a link to a file under `/docs` must name a built file.
 * Every URL in the documentation's sitemap must be a built page.
 *
 * Then replaces `examples/showcase/dist/docs` with a copy of `examples/docs/dist`, copies `llms.txt` to the site
 * root, where agents look for it, and adds the documentation pages to the showcase's `sitemap.xml`, so the one
 * sitemap `robots.txt` names lists the whole site. A failed check exits non-zero and so fails the build. Writes
 * only `examples/showcase/dist/docs`, `examples/showcase/dist/llms.txt` and `examples/showcase/dist/sitemap.xml`.
 */
import assert from "node:assert/strict";
import { cp, lstat, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { assertPhysicalPath } from "./release-policy.mjs";

const docs = resolve("examples/docs/dist");
const showcase = resolve("examples/showcase/dist");
const base = "/docs";
await assertPhysicalPath(docs);
await assertPhysicalPath(showcase);

// Pagefind's index and Wasm files are binary; everything else the build writes is text.
const text = new Set([".html", ".js", ".css", ".json", ".xml", ".svg", ".txt", ".md"]);
const origin = "https://underglass.dev";
/** Every file under `directory`, as paths relative to it with `/` separators. */
async function files(directory, prefix = "") {
  const found = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.equal((await lstat(join(directory, name))).isSymbolicLink(), false, `Documentation symlink refused: ${name}`);
    if (entry.isDirectory()) found.push(...await files(directory, name));
    else found.push(name);
  }
  return found;
}

const all = await files(docs);
const pages = new Map();
const markdown = new Map();
for (const name of all) {
  if (!text.has(extname(name))) continue;
  const content = await readFile(join(docs, name), "utf8");
  // The refusal of `check-showcase-assets.mjs` without `evidence/phase`: the pages are committed docs, and some
  // name evidence folders in test commands and link to committed records there.
  assert.ok(!/\/Users\/|session-state|PRIVATE KEY|sourceMappingURL/.test(content), `Private or mapped documentation file refused: ${name}`);
  if (name.endsWith(".html")) pages.set(name, content);
  else if (/\.(?:md|txt)$/.test(name)) markdown.set(name, content);
}

/** The page file a `/docs/...` path names: `/docs` is `index.html`, `/docs/a/b` is `a/b/index.html`. */
const pageFile = path => path === base ? "index.html" : `${path.slice(base.length + 1)}/index.html`;
const ids = new Map([...pages].map(([name, html]) => [name, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]))]));
const built = new Set(all);
const broken = [];
/** Checks one link found in `name`; `samePage` is the page a bare `#anchor` names (Markdown files have none). */
function check(name, href, samePage) {
  const [path, anchor] = href.split("#");
  // Links that leave `/docs` are not checked.
  if (path ? !(path === base || path.startsWith(`${base}/`)) : !samePage) return;
  // A file with an extension (CSS, the sitemap, a Markdown copy) must be built.
  if (extname(path)) {
    if (!built.has(decodeURI(path).slice(base.length + 1))) broken.push(`${name}: ${href} (no file)`);
    return;
  }
  const target = path ? pageFile(decodeURI(path)) : samePage;
  if (!pages.has(target)) broken.push(`${name}: ${href} (no page)`);
  else if (anchor && anchor !== "_top" && !ids.get(target).has(decodeURIComponent(anchor))) broken.push(`${name}: ${href} (no heading)`);
}
for (const [name, html] of pages) {
  for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) check(name, href.replace(/&amp;/g, "&"), name);
}
for (const [name, content] of markdown) {
  for (const [, href] of content.matchAll(/\]\((\S+?)\)/g)) check(name, href.startsWith(`${origin}/`) ? href.slice(origin.length) : href);
}
assert.deepEqual(broken, [], `Broken documentation links:\n${broken.join("\n")}`);
assert.ok(pages.has("index.html"), "The documentation site requires its home page");
assert.ok(markdown.has("llms.txt") && markdown.has("llms-full.txt"), "The documentation site requires llms.txt and llms-full.txt");

/** The `<loc>` URLs of a sitemap or sitemap index. */
const locs = xml => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
// Starlight's sitemap lists the home page as `/docs/`, which redirects to `/docs`: the canonical URL has no slash.
const docsHome = [`<loc>${origin}${base}/</loc>`, `<loc>${origin}${base}</loc>`];
const sitemaps = locs(await readFile(join(docs, "sitemap-index.xml"), "utf8")).map(url => {
  assert.ok(url.startsWith(`${origin}${base}/`) && built.has(url.slice(origin.length + base.length + 1)), `Documentation sitemap missing: ${url}`);
  return url.slice(origin.length + base.length + 1);
});
const docsUrls = [];
for (const name of sitemaps) {
  for (const url of locs((await readFile(join(docs, name), "utf8")).replace(...docsHome))) {
    assert.ok(url.startsWith(`${origin}${base}`) && pages.has(pageFile(url.slice(origin.length))), `Documentation sitemap URL is not a page: ${url}`);
    docsUrls.push(url);
  }
}
assert.equal(docsUrls.length, pages.size, "The documentation sitemap lists every page");

const output = join(showcase, "docs");
await rm(output, { recursive: true, force: true });
await cp(docs, output, { recursive: true });
for (const name of sitemaps) await writeFile(join(output, name), (await readFile(join(docs, name), "utf8")).replace(...docsHome));
await cp(join(docs, "llms.txt"), join(showcase, "llms.txt"));
// The showcase's own URLs (any `/docs` ones from an earlier run dropped), then the documentation pages.
const sitemap = join(showcase, "sitemap.xml");
const urls = [...locs(await readFile(sitemap, "utf8")).filter(url => !url.startsWith(`${origin}${base}`)), ...docsUrls];
await writeFile(sitemap, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  urls.map(url => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`);
console.log(`Documentation site: ${pages.size} pages, ${all.length} files copied to ${relative(".", output)}; llms.txt at the site root; sitemap.xml lists ${urls.length} URLs`);
