/**
 * Unit tests for the release configuration: `.changeset/config.json` and the publishing metadata of every
 * library package under `packages/`. See `docs/releasing.md`. Run from the repository root with
 * `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";

const config = JSON.parse(await readFile(".changeset/config.json", "utf8"));
const libraries = await Promise.all((await readdir("packages")).sort().map(async directory => ({
  directory: `packages/${directory}`,
  manifest: JSON.parse(await readFile(`packages/${directory}/package.json`, "utf8")),
})));

// Every library releases in one fixed group, so the packages always share one version.
test("every library package is in the one fixed version group and shares its version", () => {
  assert.equal(config.fixed.length, 1);
  assert.deepEqual([...config.fixed[0]].sort(), libraries.map(({ manifest }) => manifest.name).sort());
  const versions = new Set(libraries.map(({ manifest }) => manifest.version));
  assert.equal(versions.size, 1, `Library versions differ: ${[...versions]}`);
  assert.deepEqual(config.linked, []);
});

// Adapters and the compiler pin exactly the core they were released with; ranges could pull in a second core.
test("internal dependencies pin the current version exactly", () => {
  const names = new Set(libraries.map(({ manifest }) => manifest.name));
  for (const { manifest } of libraries) {
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (names.has(name)) assert.equal(range, manifest.version, `${manifest.name} -> ${name}`);
    }
  }
});

// Packages stay private until publication is decided; versioning still runs, but nothing is tagged.
test("private packages are versioned but not tagged, and the example apps are never released", async () => {
  assert.deepEqual(config.privatePackages, { version: true, tag: false });
  assert.equal(config.access, "public");
  assert.equal(config.baseBranch, "main");
  for (const directory of ["examples/playground", "examples/showcase"]) {
    const manifest = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
    assert.ok(config.ignore.includes(manifest.name), `${manifest.name} must be ignored`);
    assert.equal(manifest.private, true);
    // A pinned version would stop resolving to the workspace once the libraries are versioned.
    for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
      if (name.startsWith("@underglass/")) assert.equal(range, "*", `${manifest.name} -> ${name}`);
    }
  }
});

// What npm needs to publish each package publicly with provenance, and what consumers see on the registry.
test("every library package carries complete publishing metadata and a shipped changelog", async () => {
  for (const { directory, manifest } of libraries) {
    assert.equal(manifest.license, "Apache-2.0", manifest.name);
    assert.ok(manifest.description, `${manifest.name} description`);
    assert.deepEqual(manifest.repository, { type: "git", url: "git+https://github.com/RaananW/underglass.git", directory });
    assert.deepEqual(manifest.publishConfig, { access: "public", provenance: true });
    assert.ok(manifest.files.includes("CHANGELOG.md"), `${manifest.name} must ship its changelog`);
    for (const file of ["README.md", "LICENSE", "CHANGELOG.md"]) await access(`${directory}/${file}`);
    assert.match(await readFile(`${directory}/CHANGELOG.md`, "utf8"), new RegExp(`^# ${manifest.name.replace("/", "\\/")}\\n`));
  }
});

// The Release workflow publishes every non-private package whose version is not on npm, so which packages
// are public is a decision, recorded here. `@underglass/ui` stays private until its publication is decided
// (docs/releasing.md, "Publishing @underglass/ui"); removing its flag must be a deliberate change to this test.
test("exactly the four public packages are publishable; the Strata package stays private", () => {
  const publishable = libraries.filter(({ manifest }) => manifest.private !== true).map(({ manifest }) => manifest.name).sort();
  assert.deepEqual(publishable, ["@underglass/core", "@underglass/css-compiler", "@underglass/react", "@underglass/vue"]);
  assert.equal(libraries.find(({ manifest }) => manifest.name === "@underglass/ui").manifest.private, true);
  for (const { manifest } of libraries.filter(({ manifest }) => manifest.private !== true)) {
    assert.ok(manifest.author, `${manifest.name} author`);
    assert.ok(manifest.homepage && manifest.bugs?.url, `${manifest.name} homepage and bugs`);
    assert.ok(manifest.keywords?.length, `${manifest.name} keywords`);
  }
});
