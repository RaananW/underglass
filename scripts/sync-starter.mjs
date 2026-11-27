/**
 * Points `examples/starter` at the library version that `changeset version` just wrote: its
 * `@underglass/react` range becomes `^<packages/react version>`. Run by `npm run version-packages`.
 * The starter ships no lockfile (like other project templates), so the range is all there is to update.
 * See docs/releasing.md ("The starter").
 */
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));

const { version } = await read("packages/react/package.json");
const range = `^${version}`;

const manifest = await read("examples/starter/package.json");
manifest.dependencies["@underglass/react"] = range;
await writeFile(new URL("examples/starter/package.json", root), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`examples/starter now depends on @underglass/react ${range}`);
