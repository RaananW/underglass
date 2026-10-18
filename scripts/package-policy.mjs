/**
 * The exact file allowlists of the packed `@underglass/react`, `@underglass/core` and `@underglass/vue` archives.
 *
 * Not run directly: imported by `package-consumer.mjs` (`npm run test:package`), `release-validation.mjs`,
 * `worker-validation.mjs` and `tests/unit/package.unit.test.mjs`, which compare `npm pack --json` file
 * lists against them. Takes no flags or environment and writes nothing; a mismatch throws an assertion error.
 */
import assert from "node:assert/strict";

// Each package emits one ES module per package export.
const entries = ["index", "build", "experimental-worker", "worker-thread"].map(name => `dist/library/${name}.js`);
// Base names of the emitted `dist/library/*.d.ts` declaration files. A module that starts or stops
// emitting a declaration must be reflected here, or pack validation fails.
const coreDeclarations = [
  "admission", "affine", "animation", "build", "compiled", "compiler", "composition", "css-animation",
  "device-lifecycle", "effects", "emitters", "enrollment", "hosts", "index", "instrument", "instrument-assets", "instrument-gltf", "instrument-mesh", "instrument-pass", "instrument-post", "module", "motion",
  "mount-boundary", "native", "publication", "relief", "renderer", "ripple", "runtime", "stage", "timeline", "viewport",
  "experimental-worker", "worker-thread", "worker-protocol",
];
const reactDeclarations = ["build", "experimental-worker", "index", "react", "worker-thread"];
/** Sorted package-relative paths that every packed `@underglass/react` archive must contain, and nothing else. */
export const packageFiles = [
  "package.json", "README.md", "LICENSE", "CHANGELOG.md", "docs/distribution.md", ...entries,
  ...reactDeclarations.map(name => `dist/library/${name}.d.ts`),
].sort();
/** Sorted package-relative paths that every packed `@underglass/core` archive must contain, and nothing else. */
export const corePackageFiles = [
  "package.json", "README.md", "LICENSE", "CHANGELOG.md", ...entries,
  ...coreDeclarations.map(name => `dist/library/${name}.d.ts`),
].sort();

/** Sorted package-relative paths that every packed `@underglass/vue` archive must contain, and nothing else. */
export const vuePackageFiles = ["package.json", "README.md", "LICENSE", "CHANGELOG.md", "dist/library/index.js", "dist/library/index.d.ts"].sort();

/**
 * Asserts that `files` (the `files` array of an `npm pack --json` result, entries with `path` and `size`)
 * lists exactly `expected` (by default the `@underglass/react` allowlist) and that every member has a
 * positive byte size.
 */
export function validatePackageContents(files, expected = packageFiles) {
  assert.deepEqual(files.map(file => file.path).sort(), expected, "Package contents must match the exact distribution allowlist");
  for (const file of files) assert.ok(Number.isSafeInteger(file.size) && file.size > 0, `Invalid packed size: ${file.path}`);
}
