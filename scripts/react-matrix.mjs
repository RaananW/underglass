/**
 * Runs the behavior regression against a specific React peer: React 19 (the repository's own install) or
 * React 18 (the separately locked fixture in `fixtures/react18`).
 *
 * Invoked as `npm run test:react18` (isolated React 18 copy) and `npm run test:react19` (`--primary`: runs
 * `npm test` in the repository itself). Other arguments are forwarded to `test-browser.mjs` for the React 18
 * behavior run (suite file names, `--grep`). Environment: `CANVAS_EVIDENCE_ROOT`, and
 * `CANVAS_TEST_DEV_URL` / `CANVAS_TEST_PREVIEW_URL` (React 18 defaults: ports 5185 and 5186, so it does not
 * collide with the primary servers).
 *
 * The React 18 lane copies sources into `fixtures/react18/workspace/run-<uuid>`, overlays the fixture's
 * `node_modules` on a copy of the root ones, then runs units, the playground typecheck, a Vite build and a
 * fixed browser subset with `--max-failures=1`. Output: per-step logs and `matrix.json` under
 * `<evidence root>/react18` or `react19` (plus `reports` for React 18). Throws, exiting non-zero, when any
 * step fails or the root `package-lock.json` changed during the run. Evidence is sanitized on exit.
 */
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { evidenceRoot } from "../tests/helpers/evidence.mjs";
import { copyDependencies } from "./release-policy.mjs";
import { withPlatform } from "../tests/helpers/process.mjs";

const root = resolve(".");
const isPrimary = process.argv.includes("--primary");
// The primary lane works in place; the React 18 lane gets a fresh, disposable copy of the repository.
const destination = isPrimary ? root : resolve(`fixtures/react18/workspace/run-${randomUUID()}`);
const fixture = JSON.parse(await readFile("fixtures/react18/package.json", "utf8"));
const primary = JSON.parse(await readFile("package.json", "utf8"));
const playground = JSON.parse(await readFile("examples/playground/package.json", "utf8"));
const version = isPrimary ? primary.devDependencies.react : fixture.dependencies.react;
// The root lockfile is hashed so the run can prove it did not modify the primary dependency tree.
const lockBefore = createHash("sha256").update(await readFile("package-lock.json")).digest("hex");
// A digest of the library and playground sources, recorded in `matrix.json` to tie the evidence to the code tested.
const sourceHash = createHash("sha256");
// Folds each file's root-relative path and contents into `sourceHash`, in sorted order for stability.
async function hashSource(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await hashSource(path);
    else sourceHash.update(path.slice(root.length)).update(await readFile(path));
  }
}
await hashSource(resolve("examples/playground/src"));
await hashSource(resolve("packages/core/src"));
await hashSource(resolve("packages/react/src"));
const sourceSha256 = sourceHash.digest("hex");
// Copy the sources and test tooling, leaving out build output and dependency folders. `dist`,
// `node_modules` and the Vite cache are excluded so the copy builds and resolves independently.
if (!isPrimary) {
  await mkdir(destination, { recursive: true });
  // Copy every top-level repository entry except a small exclude list, so a unit test that starts reading a
  // new path (docs, .github, README, ...) works in the copy without this script being edited. `fixtures` gets
  // its own handling below, `evidence` is history recreated per run, and the rest is VCS or tool state.
  const excluded = new Set([".git", ".claude", "node_modules", "fixtures", "evidence", "dist", "test-results", "playwright-report", "owned-vite-cache"]);
  for (const entry of await readdir(root)) {
    if (excluded.has(entry)) continue;
    await cp(resolve(entry), resolve(destination, entry), {
      recursive: true, filter: path => !["dist", "node_modules", "owned-vite-cache"].includes(basename(path)),
    });
  }
  await mkdir(resolve(destination, "fixtures/react18"), { recursive: true });
  for (const path of ["package.json", "package-lock.json"]) await cp(resolve("fixtures/react18", path), resolve(destination, "fixtures/react18", path));
  await copyDependencies(resolve("node_modules"), resolve(destination, "node_modules"));
  // Overlay the fixture's React 18 packages on top of the root tools so React 18 resolves in the copy.
  await copyDependencies(resolve("fixtures/react18/node_modules"), resolve(destination, "node_modules"));
}
// Resolve the Radix Dialog integration dependency from the run workspace and check it is the exact version
// the playground pins, so the React 18 lane tests the same integration code as the primary one.
const fixtureRequire = createRequire(resolve(destination, "package.json"));
const dialogPackage = JSON.parse(await readFile(resolve(dirname(fixtureRequire.resolve("@radix-ui/react-dialog")), "../package.json"), "utf8"));
if (dialogPackage.version !== playground.dependencies["@radix-ui/react-dialog"]) throw new Error("Resolved Dialog integration dependency does not match its playground exact pin");
await mkdir(resolve(destination, "evidence"), { recursive: true });
// Per-lane evidence directory (`react18` or `react19`) under the shared evidence root.
const evidence = resolve(`${evidenceRoot}/react${isPrimary ? "19" : "18"}`);
await mkdir(evidence, { recursive: true });
// Runs one step in the workspace, streams its output to the console, saves it as `<name>.log` and throws
// when it exits non-zero. `CANVAS_EXPECT_REACT_VERSION` tells the browser suite which React it must observe.
async function run(command, args, name) {
  const child = spawn(...withPlatform(command, args, { cwd: destination, env: { ...process.env,
    CANVAS_EXPECT_REACT_VERSION: version, CANVAS_EVIDENCE_ROOT: evidenceRoot,
    ...(!isPrimary ? { CANVAS_TEST_DEV_URL: process.env.CANVAS_TEST_DEV_URL ?? "http://127.0.0.1:5185",
      CANVAS_TEST_PREVIEW_URL: process.env.CANVAS_TEST_PREVIEW_URL ?? "http://127.0.0.1:5186" } : {}) },
    stdio: ["ignore", "pipe", "pipe"] }));
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; process.stdout.write(data); });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", code => done(code)); });
  await writeFile(resolve(evidence, `${name}.log`), output);
  if (code !== 0) throw new Error(`React${version} ${name} failed (${code})`);
}
try {
  // Primary lane: the full `npm test` (unit tests, build and the whole browser suite) in the repository.
  if (isPrimary) await run("npm", ["test"], "full");
  else {
    // React 18 lane: unit tests, playground typecheck, production build, then the behavior subset of the
    // browser suite (stopping at the first failure). Any extra command-line arguments narrow that subset.
    const units = (await readdir(resolve(destination, "tests/unit"))).filter(path => path.endsWith(".unit.test.mjs")).map(path => `tests/unit/${path}`);
    await run(process.execPath, ["--test", ...units], "units");
    await run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "examples/playground/tsconfig.json"], "types");
    // The copy has no `dist`, and the playground imports Strata's built stylesheet, so write it first.
    await run(process.execPath, ["packages/ui/scripts/build-css.mjs"], "ui-css");
    await run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], "build");
    await run(process.execPath, ["scripts/test-browser.mjs", "runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "integration.test.mjs", "effects.test.mjs", "hardening.test.mjs", "dynamic.test.mjs", "native-editing.test.mjs", "viewport.test.mjs",
      ...process.argv.slice(2).filter(argument => argument !== "--primary"), "--max-failures=1"], "behavior");
    // Bring the copy's Playwright reports back into the real evidence tree.
    await cp(resolve(destination, evidenceRoot), resolve(evidence, "reports"), { recursive: true });
  }
  // The primary lockfile must be byte-identical after the run.
  const lockAfter = createHash("sha256").update(await readFile(resolve(root, "package-lock.json"))).digest("hex");
  if (lockBefore !== lockAfter) throw new Error("Primary dependency lockfile changed during compatibility validation");
  await writeFile(resolve(evidence, "matrix.json"), JSON.stringify({
    fixture: isPrimary ? "Primary pinned React19 project; full regression includes the same declared behavior suite" :
      "source copy, no implementation substitutions; independent resolution from declared fixture node_modules",
    versions: isPrimary ? primary : fixture,
    toolVersions: { ...primary.devDependencies, ...(!isPrimary ? fixture.devDependencies : {}) },
    behavior: ["runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "integration.test.mjs", "effects.test.mjs", "hardening.test.mjs", "dynamic.test.mjs", "native-editing.test.mjs", "viewport.test.mjs"],
    behaviorFilter: process.argv.slice(2).filter(argument => argument !== "--primary"),
    production: "Vite production + react-dom/profiling",
    development: `Actual Vite development React + StrictMode; ports ${process.env.CANVAS_TEST_DEV_URL ?? (isPrimary ? "5173" : "5185")} / ${process.env.CANVAS_TEST_PREVIEW_URL ?? (isPrimary ? "5174" : "5186")}`,
    executedReact: {
      production: JSON.parse(await readFile(resolve(destination, `${evidenceRoot}/runtime/independent-false.json`), "utf8")).initial.reactVersion,
      development: JSON.parse(await readFile(resolve(destination, `${evidenceRoot}/runtime/independent-true.json`), "utf8")).initial.reactVersion,
    },
    resolvedIntegration: { name: dialogPackage.name, version: dialogPackage.version, license: dialogPackage.license, peerDependencies: dialogPackage.peerDependencies },
    sourceRoot: "<workspace>/packages/core/src + packages/react/src + examples/playground/src", sourceSha256, primaryLockUnchanged: true, primaryLockSha256: lockAfter,
  }, null, 2));
} finally {
  // Always sanitize evidence, even after a failure; paths are resolved against the repository root.
  process.chdir(root);
  await import("./sanitize-evidence.mjs");
}
