/**
 * Puts the documentation site into the built showcase, so one output directory serves underglass.dev and
 * underglass.dev/docs. Runs last in `npm run build:site` (the Vercel build and CI), after the showcase and
 * `examples/docs` are built.
 *
 * Checks the documentation build first: no symlinks, no local paths, private keys or source-map references in
 * text files, and every link to a page under `/docs` (with its `#anchor`, and same-page anchors) resolves to a
 * built page and heading. Then replaces `examples/showcase/dist/docs` with a copy of `examples/docs/dist`.
 * A failed check exits non-zero and so fails the build. Writes only `examples/showcase/dist/docs`.
 */
import assert from "node:assert/strict";
import { cp, lstat, readdir, readFile, rm } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { assertPhysicalPath } from "./release-policy.mjs";

const docs = resolve("examples/docs/dist");
const showcase = resolve("examples/showcase/dist");
const base = "/docs";
await assertPhysicalPath(docs);
await assertPhysicalPath(showcase);

// Pagefind's index and Wasm files are binary; everything else the build writes is text.
const text = new Set([".html", ".js", ".css", ".json", ".xml", ".svg", ".txt"]);
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
for (const name of all) {
  if (!text.has(extname(name))) continue;
  const content = await readFile(join(docs, name), "utf8");
  // The refusal of `check-showcase-assets.mjs` without `evidence/phase`: the pages are committed docs, and some
  // name evidence folders in test commands and link to committed records there.
  assert.ok(!/\/Users\/|session-state|PRIVATE KEY|sourceMappingURL/.test(content), `Private or mapped documentation file refused: ${name}`);
  if (name.endsWith(".html")) pages.set(name, content);
}

/** The page file a `/docs/...` path names: `/docs` is `index.html`, `/docs/a/b` is `a/b/index.html`. */
const pageFile = path => path === base ? "index.html" : `${path.slice(base.length + 1)}/index.html`;
const ids = new Map([...pages].map(([name, html]) => [name, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]))]));
const broken = [];
for (const [name, html] of pages) {
  for (const [, href] of html.matchAll(/\shref="([^"]+)"/g)) {
    const [path, anchor] = href.replace(/&amp;/g, "&").split("#");
    // Same-page anchors and links to other `/docs` pages; files with an extension (CSS, the sitemap) are not pages.
    if (path && (!(path === base || path.startsWith(`${base}/`)) || extname(path))) continue;
    const target = path ? pageFile(decodeURI(path)) : name;
    if (!pages.has(target)) broken.push(`${name}: ${href} (no page)`);
    else if (anchor && anchor !== "_top" && !ids.get(target).has(decodeURIComponent(anchor))) broken.push(`${name}: ${href} (no heading)`);
  }
}
assert.deepEqual(broken, [], `Broken documentation links:\n${broken.join("\n")}`);
assert.ok(pages.has("index.html"), "The documentation site requires its home page");

const output = join(showcase, "docs");
await rm(output, { recursive: true, force: true });
await cp(docs, output, { recursive: true });
console.log(`Documentation site: ${pages.size} pages, ${all.length} files copied to ${relative(".", output)}`);
