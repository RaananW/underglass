/**
 * Unit tests that read the repository's `package.json` and lock files to check workspace layout, release
 * identity and React peer versions. Reads files relative to the repository root, so run from the root with
 * `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the release identity belongs only to the library workspaces, not the tooling root", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  const core = JSON.parse(await readFile("packages/core/package.json", "utf8"));
  const library = JSON.parse(await readFile("packages/react/package.json", "utf8"));
  const playground = JSON.parse(await readFile("examples/playground/package.json", "utf8"));
  assert.equal(root.private, true);
  assert.equal(root.exports, undefined);
  assert.equal(root.files, undefined);
  assert.equal(root.devDependencies["@radix-ui/react-dialog"], undefined);
  assert.equal(root.devDependencies["@babylonjs/lite-gl"], undefined);
  assert.match(root.scripts.prepack, /Tooling root is not the release package/);
  assert.deepEqual(root.workspaces, ["packages/core", "packages/react", "packages/vue", "packages/css-compiler", "packages/ui", "examples/playground", "examples/showcase", "examples/docs"]);
  assert.equal(core.name, "@underglass/core");
  assert.deepEqual(Object.keys(core.exports), [".", "./build", "./experimental-worker", "./experimental-worker/thread"]);
  assert.equal(library.name, "@underglass/react");
  assert.equal(library.version, core.version);
  assert.deepEqual(Object.keys(library.exports), [".", "./build", "./experimental-worker", "./experimental-worker/thread"]);
  // The example apps are never released and take whatever library version the workspace holds.
  assert.equal(playground.private, true);
  assert.equal(playground.dependencies[library.name], "*");
});

// The core runtime must stay framework-neutral, and every adapter must share it rather than bundle a copy.
test("the core package has no framework dependency and each adapter depends on it", async () => {
  const core = JSON.parse(await readFile("packages/core/package.json", "utf8"));
  const library = JSON.parse(await readFile("packages/react/package.json", "utf8"));
  const vue = JSON.parse(await readFile("packages/vue/package.json", "utf8"));
  assert.equal(core.peerDependencies, undefined);
  for (const name of Object.keys(core.dependencies)) assert.doesNotMatch(name, /^(react|react-dom|vue|svelte|solid-js)$/);
  assert.deepEqual(library.dependencies, { [core.name]: core.version });
  // The Vue adapter has exactly one framework peer, Vue, and no React.
  assert.equal(vue.name, "@underglass/vue");
  assert.equal(vue.version, core.version);
  assert.deepEqual(Object.keys(vue.exports), ["."]);
  assert.deepEqual(vue.dependencies, { [core.name]: core.version });
  assert.deepEqual(vue.peerDependencies, { vue: "^3.5.0" });
});

// Framework-neutral sources must never import a UI framework: core imports none, the Vue adapter only Vue.
test("core sources import no UI framework and the Vue adapter imports no React", async () => {
  const { readdir } = await import("node:fs/promises");
  for (const [directory, forbidden] of [["packages/core/src", /from "(react|react-dom|vue)(\/[^"]*)?"/], ["packages/vue/src", /from "(react|react-dom)(\/[^"]*)?"/]]) {
    for (const file of await readdir(directory)) {
      assert.doesNotMatch(await readFile(`${directory}/${file}`, "utf8"), forbidden, `${directory}/${file}`);
    }
  }
});

// The root lock pins React 19.3.1 and the React 18 fixture lock pins 18.3.1; each library's own lock entry must match its package.json.
test("both committed lock lanes retain distinct actual React peer ownership", async () => {
  const root = JSON.parse(await readFile("package-lock.json", "utf8")).packages;
  const react18 = JSON.parse(await readFile("fixtures/react18/package-lock.json", "utf8")).packages;
  assert.equal(root["node_modules/react"].version, "19.3.1");
  assert.equal(root["node_modules/react-dom"].version, "19.3.1");
  assert.equal(react18["node_modules/react"].version, "18.3.1");
  assert.equal(react18["node_modules/react-dom"].version, "18.3.1");
  assert.deepEqual(root["node_modules/@underglass/core"], { resolved: "packages/core", link: true });
  assert.deepEqual(root["node_modules/@underglass/react"], { resolved: "packages/react", link: true });
  assert.deepEqual(root["node_modules/@underglass/playground"], { resolved: "examples/playground", link: true });
  for (const directory of ["packages/core", "packages/react", "packages/vue", "packages/css-compiler"]) {
    const library = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
    assert.equal(root[directory].version, library.version);
    assert.deepEqual(root[directory].dependencies, library.dependencies);
    assert.deepEqual(root[directory].peerDependencies, library.peerDependencies);
  }
});
