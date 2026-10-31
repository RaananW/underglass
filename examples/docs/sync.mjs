/**
 * Regenerates `src/content/docs/` from the repository's `docs/` folder (see `pages.mjs`). Runs before
 * `astro dev` and `astro build`; the output is not committed. Fails when a published file is missing or
 * has no `# title`.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { outputFile, routes, toPage } from "./pages.mjs";

const docs = fileURLToPath(new URL("../../docs/", import.meta.url));
const output = fileURLToPath(new URL("src/content/docs/", import.meta.url));
const map = routes(await readdir(join(docs, "ui-library/components")));

await rm(output, { recursive: true, force: true });
for (const [source, route] of map) {
  const file = join(output, outputFile(route));
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, toPage(await readFile(join(docs, source), "utf8"), source, map));
}
console.log(`Synced ${map.size} documentation pages from docs/`);
