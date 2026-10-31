/**
 * Regenerates `src/content/docs/` from the repository's `docs/` folder (see `pages.mjs`). Runs before
 * `astro dev` and `astro build`; the output is not committed. Fails when a published file is missing or
 * has no `# title`.
 *
 * Also writes, into `public/` and so under `/docs` on the site, a Markdown copy of every page, `llms.txt`
 * and `llms-full.txt`. Everything in `public/` except the committed files below is generated and replaced.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { llmsFull, llmsIndex, outputFile, readPage, routes, site, toMarkdown, toPage } from "./pages.mjs";

const docs = fileURLToPath(new URL("../../docs/", import.meta.url));
const output = fileURLToPath(new URL("src/content/docs/", import.meta.url));
const assets = fileURLToPath(new URL("public/", import.meta.url));
const committed = new Set(["favicon.svg"]);
const map = routes(await readdir(join(docs, "ui-library/components")));

/** Writes `content` to `file`, creating its directory. */
async function write(file, content) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

await rm(output, { recursive: true, force: true });
for (const name of await readdir(assets)) {
  if (!committed.has(name)) await rm(join(assets, name), { recursive: true, force: true });
}
const pages = new Map();
for (const [source, route] of map) {
  const markdown = await readFile(join(docs, source), "utf8");
  const page = readPage(markdown, source, map, site);
  pages.set(route, page);
  await write(join(output, outputFile(route)), toPage(markdown, source, map));
  await write(join(assets, outputFile(route)), toMarkdown(page));
}
await write(join(assets, "llms.txt"), llmsIndex(map, pages));
await write(join(assets, "llms-full.txt"), llmsFull(map, pages));
console.log(`Synced ${map.size} documentation pages from docs/, with their Markdown copies, llms.txt and llms-full.txt`);
