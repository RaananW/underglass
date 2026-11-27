/**
 * Points `examples/starter` at the library version that `changeset version` just wrote: its
 * `@underglass/react` range becomes `^<packages/react version>`, in `package.json` and in the lockfile's
 * root entry. Run by `npm run version-packages`. See docs/releasing.md ("The starter").
 *
 * The lockfile's resolved `node_modules/@underglass/react` entry is NOT touched here: the new version is not
 * on npm until the release publishes, so it cannot be resolved yet. After the release publishes, run
 * `npm install` in `examples/starter` and commit the lockfile.
 */
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), "utf8"));
const write = (path, value) => writeFile(new URL(path, root), `${JSON.stringify(value, null, 2)}\n`);

const { version } = await read("packages/react/package.json");
const range = `^${version}`;

const manifest = await read("examples/starter/package.json");
manifest.dependencies["@underglass/react"] = range;
await write("examples/starter/package.json", manifest);

const lock = await read("examples/starter/package-lock.json");
lock.packages[""].dependencies["@underglass/react"] = range;
await write("examples/starter/package-lock.json", lock);

console.log(`examples/starter now depends on @underglass/react ${range}`);
