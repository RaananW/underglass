/**
 * Shared guard helpers for the release, showcase, worker and compiler validation scripts: browser identity
 * pinning, symlink-free path and tree checks, a dependency-tree copier that refuses symlinks, and React
 * peer assertions.
 *
 * Not run directly. Imported by `release-validation.mjs`, `release-pilot.mjs`, `showcase-validation.mjs`,
 * `worker-validation.mjs`, `compiler-validation.mjs`, `package-consumer.mjs`, `react-matrix.mjs`, `check-showcase-assets.mjs` and
 * `tests/unit/release.unit.test.mjs`. Reads the `CANVAS_REQUIRE_BROWSER_PIN` environment variable; failed
 * checks throw assertion errors, which fail the importing script.
 */
import assert from "node:assert/strict";
import { cp, lstat, readdir, readFile, mkdir, realpath } from "node:fs/promises";
import { join, basename, resolve, dirname } from "node:path";

/** Entries of a `node_modules` tree that `copyDependencies` skips: tool caches, the `.bin` shims and npm's hidden lockfile. */
export const excludedDependencies = new Set([".vite", ".vite-temp", ".bin", ".package-lock.json"]);
/** The browser product and revision the release evidence was originally qualified against. */
export const qualifiedBrowser = Object.freeze({
  product: "Chrome/157.0.8100.0",
  revision: "@799dbe91dfe8604f0327d070ecd6d2792a7d3d63",
});

// The exact historical pin is enforced only when CANVAS_REQUIRE_BROWSER_PIN=1; otherwise the actual
// identity is returned so callers record it in their evidence (daily Canary updates must not fail the harness).
export function assertBrowserIdentity(actual) {
  if (process.env.CANVAS_REQUIRE_BROWSER_PIN !== "1") {
    return { pinEnforced: false, actual: { product: actual.product, revision: actual.revision }, qualifiedBrowser };
  }
  assert.deepEqual({ product: actual.product, revision: actual.revision }, qualifiedBrowser,
    `Browser identity mismatch: actual=${JSON.stringify(actual)} expected=${JSON.stringify(qualifiedBrowser)}`);
  return { pinEnforced: true, actual: { product: actual.product, revision: actual.revision }, qualifiedBrowser };
}

/**
 * Creates (if needed) and returns the release evidence directory `<workspace>/evidence/phase14`. Only that
 * exact root is accepted for `requestedRoot`, and neither it nor any ancestor may be a symlink, so a run
 * cannot write outside the checkout or into an archived evidence tree.
 */
export async function prepareReleaseRoot(workspace, requestedRoot = join(workspace, "evidence/phase14")) {
  const directory = join(resolve(workspace), "evidence/phase14");
  assert.equal(resolve(requestedRoot), directory, "Only the owned Phase14 root is allowed; escaping/old archive targets refused");
  await assertPhysicalPath(workspace);
  // Walk from the target up to the filesystem root. A missing path is fine (it is created below); only a
  // symlink is refused.
  for (let path = directory;; path = dirname(path)) {
    try {
      assert.equal((await lstat(path)).isSymbolicLink(), false, `Path ancestor symlink refused: ${path}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (dirname(path) === path) break;
  }
  await mkdir(directory, { recursive: true });
  await assertPhysicalPath(directory);
  return directory;
}

/** Asserts that `directory` and every ancestor up to the filesystem root is a real directory, not a symlink. */
export async function assertPhysicalPath(directory) {
  let path = resolve(directory);
  for (;;) {
    assert.equal((await lstat(path)).isSymbolicLink(), false, `Path ancestor symlink refused: ${path}`);
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
}

/**
 * Copies a `node_modules` tree from `source` to `destination` for an isolated validation workspace.
 * Skips `excludedDependencies`, drops the workspace-package aliases that npm links into `node_modules`
 * (after checking each points at the expected package directory), and refuses any other symlink.
 */
export async function copyDependencies(source, destination) {
  await assertPhysicalPath(source);
  await assertPhysicalPath(dirname(destination));
  await cp(source, destination, {
    recursive: true, force: true,
    filter: async path => {
      if (excludedDependencies.has(basename(path))) return false;
      // npm workspace aliases (package name -> repository directory) that may legitimately be symlinks.
      const workspace = { "@underglass/core": "packages/core", "@underglass/react": "packages/react", "@underglass/vue": "packages/vue", "@underglass/playground": "examples/playground",
        "@underglass/showcase": "examples/showcase", "@underglass/docs": "examples/docs", "@underglass/css-compiler": "packages/css-compiler", "@underglass/ui": "packages/ui" };
      for (const [name, target] of Object.entries(workspace)) {
        if (path === join(source, name) && (await lstat(path)).isSymbolicLink()) {
          assert.equal(await realpath(path), join(dirname(source), target), `Unexpected workspace alias: ${path}`);
          return false;
        }
      }
      assert.equal((await lstat(path)).isSymbolicLink(), false, `Dependency symlink refused: ${path}`);
      return true;
    },
  });
}

/** Asserts that `directory` and everything below it contains no symlink, so a writable tree stays self-contained. */
export async function assertPhysicalTree(directory) {
  assert.equal((await lstat(directory)).isSymbolicLink(), false, `Writable tree symlink refused: ${directory}`);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Writable tree symlink refused: ${path}`);
    if (entry.isDirectory()) await assertPhysicalTree(path);
  }
}

/**
 * Asserts the React and ReactDOM versions reported by the page match `expected`. React 18.3.1 also
 * accepts the `next` build string that its `react-dom` reports.
 */
export function assertRuntimePeer(actual, expected) {
  assert.equal(actual.react, expected, "Actual browser React peer mismatch");
  const dom = expected === "18.3.1" ? ["18.3.1", "18.3.1-next-f1338f8080-20240426"] : [expected];
  assert.ok(dom.includes(actual.reactDOM), `Actual browser ReactDOM peer mismatch: ${actual.reactDOM}`);
}

/** Asserts the runtime ended in the mode the lane asked for: `gpu` for the `native` lane, `dom` otherwise. */
export function assertRequestedLane(lane, state) {
  assert.equal(state.mode, lane === "native" ? "gpu" : "dom", `${lane} pilot mode failed: ${state.reason}`);
}

/** Returns the installed version of `name` under `<root>/node_modules`. */
export async function dependencyVersion(root, name) {
  return JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8")).version;
}
