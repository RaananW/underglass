/**
 * Unit test for `examples/starter`, the standalone StackBlitz/degit starter: it installs the published
 * `@underglass/react`, so its range must cover the version in `packages/react` (kept in step by
 * `scripts/sync-starter.mjs`, see docs/releasing.md), and it must stay outside the root workspaces.
 * Run from the repository root with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const json = async path => JSON.parse(await readFile(path, "utf8"));
const parse = version => version.match(/^(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number);

// Caret semantics for the ranges the starter may use: ^X.Y.Z (X > 0: same major; 0.Y.Z: same minor) or an exact version.
function covers(range, version) {
  const wanted = parse(version);
  assert.ok(wanted, `Version ${version} is not plain X.Y.Z`);
  const base = parse(range.replace(/^\^/, ""));
  assert.ok(base, `Unsupported starter range ${range}; use ^X.Y.Z`);
  const differs = wanted.findIndex((part, index) => part !== base[index]);
  if (!range.startsWith("^")) return differs === -1;
  if (differs !== -1 && wanted[differs] < base[differs]) return false; // below the range's floor
  return base[0] > 0 ? wanted[0] === base[0] : wanted[0] === 0 && wanted[1] === base[1];
}

test("the starter's @underglass/react range covers the version in packages/react", async () => {
  const starter = await json("examples/starter/package.json");
  const react = await json("packages/react/package.json");
  const range = starter.dependencies["@underglass/react"];
  assert.ok(covers(range, react.version), `examples/starter asks for ${range} but packages/react is ${react.version}; run node scripts/sync-starter.mjs`);
  assert.ok(!covers("^0.6.0", "0.7.0") && !covers("^0.6.0", "0.5.9") && covers("^0.6.0", "0.6.3") && covers("^1.2.0", "1.9.0"));
});

test("the starter's lockfile asks for the same range and is not a workspace of the root", async () => {
  const starter = await json("examples/starter/package.json");
  const lock = await json("examples/starter/package-lock.json");
  assert.equal(lock.packages[""].dependencies["@underglass/react"], starter.dependencies["@underglass/react"]);
  const root = await json("package.json");
  assert.ok(!root.workspaces.some(path => path.startsWith("examples/starter")), "the starter must install standalone");
  assert.equal(starter.stackblitz.startCommand, "npm run dev");
});
