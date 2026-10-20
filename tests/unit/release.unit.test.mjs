/**
 * Unit tests for the release-root, dependency-copy, browser-pin, React peer and requested-lane checks in
 * `scripts/release-policy.mjs`. Uses temp directories and (where permitted) symlinks or junctions; tests
 * that need them skip on Windows without symlink privilege. Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { symlinkOrSkip } from "../helpers/symlink.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { copyDependencies, assertPhysicalTree, assertRuntimePeer, assertRequestedLane, prepareReleaseRoot,
  assertBrowserIdentity, qualifiedBrowser } from "../../scripts/release-policy.mjs";

test("rejected release roots create no external children or sentinel changes", async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-release-root-unit-"));
  try {
    const workspace = join(root, "workspace"), outside = join(root, "owned-outside");
    await mkdir(join(workspace, "evidence"), { recursive: true });
    await mkdir(outside);
    await writeFile(join(outside, "sentinel"), "sealed sentinel");
    if (!await symlinkOrSkip(t, outside, join(workspace, "evidence", "alias"), "junction")) return;
    await assert.rejects(prepareReleaseRoot(workspace, join(workspace, "evidence", "alias", "newdir")), /targets refused/);
    await assert.rejects(readFile(join(outside, "newdir")), { code: "ENOENT" });
    await assert.rejects(prepareReleaseRoot(workspace, join(workspace, "..", "owned-outside", "escape")), /targets refused/);
    await assert.rejects(readFile(join(outside, "escape")), { code: "ENOENT" });
    await symlinkOrSkip(t, outside, join(workspace, "evidence", "phase14"), "junction");
    await assert.rejects(prepareReleaseRoot(workspace), /ancestor symlink refused/);
    assert.equal(await readFile(join(outside, "sentinel"), "utf8"), "sealed sentinel");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("both browser lanes require recorded exact product and revision when the pin is required; mismatch exits failure", () => {
  const previous = process.env.CANVAS_REQUIRE_BROWSER_PIN;
  process.env.CANVAS_REQUIRE_BROWSER_PIN = "1";
  try { runPinned(); } finally {
    if (previous === undefined) delete process.env.CANVAS_REQUIRE_BROWSER_PIN; else process.env.CANVAS_REQUIRE_BROWSER_PIN = previous;
  }
});
test("unpinned runs record the actual browser identity without enforcing the historical pin", () => {
  const previous = process.env.CANVAS_REQUIRE_BROWSER_PIN;
  delete process.env.CANVAS_REQUIRE_BROWSER_PIN;
  try {
    const actual = { product: "Chrome/999.0.0.0", revision: "@newer" };
    assert.deepEqual(assertBrowserIdentity(actual), { pinEnforced: false, actual, qualifiedBrowser });
  } finally { if (previous !== undefined) process.env.CANVAS_REQUIRE_BROWSER_PIN = previous; }
});
// Checks a matching identity passes, then that mismatches throw in-process and exit 1 in a child process.
function runPinned() {
  assertBrowserIdentity(qualifiedBrowser);
  for (const actual of [{ ...qualifiedBrowser, revision: "@different" }, { ...qualifiedBrowser, product: "Chrome/154.0.0.0" },
    { product: "Chrome/157.0.8099.0", revision: "@94bcda4759263b9a241f5008a68e753c2ebe3081" }]) {
    assert.throws(() => assertBrowserIdentity(actual), /actual=.*expected=/);
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      `import {assertBrowserIdentity} from ${JSON.stringify(new URL("../../scripts/release-policy.mjs", import.meta.url).href)}; assertBrowserIdentity(${JSON.stringify(actual)});`],
    { encoding: "utf8", env: { ...process.env, CANVAS_REQUIRE_BROWSER_PIN: "1" } });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Browser identity mismatch: actual=.*expected=/);
  }
}

test("release dependency copies are physical and exclude optimizer outputs", async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-release-unit-"));
  try {
    const source = join(root, "source"), target = join(root, "target");
    await mkdir(join(source, "react"), { recursive: true });
    await writeFile(join(source, "react", "index.js"), "original");
    for (const cache of [".vite", ".vite-temp", ".bin"]) {
      await mkdir(join(source, cache));
      await writeFile(join(source, cache, "sealed"), "do not execute");
    }
    await copyDependencies(source, target);
    await assertPhysicalTree(target);
    await assert.rejects(readFile(join(target, ".vite", "sealed")), { code: "ENOENT" });
    await assert.rejects(readFile(join(target, ".vite-temp", "sealed")), { code: "ENOENT" });
    await writeFile(join(target, "react", "index.js"), "changed");
    assert.equal(await readFile(join(source, "react", "index.js"), "utf8"), "original");
    if (!await symlinkOrSkip(t, join(source, "react"), join(source, "alias"), "junction")) return;
    await assert.rejects(copyDependencies(source, join(root, "rejected")), /symlink refused/);
    await symlinkOrSkip(t, source, join(root, "root-alias"), "junction");
    await assert.rejects(copyDependencies(join(root, "root-alias"), join(root, "bad")), /ancestor symlink refused/);
    await assert.rejects(copyDependencies(join(source, "react"), join(root, "root-alias", "bad")), /ancestor symlink refused/);
    await assert.rejects(assertPhysicalTree(source), /symlink refused/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("release peer assertions fail closed including real production ReactDOM18 suffix", () => {
  assertRuntimePeer({ react: "18.3.1", reactDOM: "18.3.1-next-f1338f8080-20240426" }, "18.3.1");
  assertRuntimePeer({ react: "19.3.1", reactDOM: "19.3.1" }, "19.3.1");
  assert.throws(() => assertRuntimePeer({ react: "19.3.1", reactDOM: "19.3.1" }, "18.3.1"), /React peer mismatch/);
  assert.throws(() => assertRuntimePeer({ react: "18.3.1", reactDOM: "18.3.1-other" }, "18.3.1"), /ReactDOM peer mismatch/);
});

test("only verified current workspace links are excluded from physical execution copies", async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-workspace-copy-unit-"));
  try {
    await mkdir(join(root, "packages/react"), { recursive: true });
    await mkdir(join(root, "examples/playground"), { recursive: true });
    await mkdir(join(root, "examples/showcase"), { recursive: true });
    await mkdir(join(root, "node_modules/@underglass"), { recursive: true });
    if (!await symlinkOrSkip(t, join(root, "packages/react"), join(root, "node_modules/@underglass/react"), "junction")) return;
    await symlinkOrSkip(t, join(root, "examples/playground"), join(root, "node_modules/@underglass/playground"), "junction");
    await symlinkOrSkip(t, join(root, "examples/showcase"), join(root, "node_modules/@underglass/showcase"), "junction");
    await copyDependencies(join(root, "node_modules"), join(root, "copied"));
    await assertPhysicalTree(join(root, "copied"));
    await assert.rejects(readFile(join(root, "copied/@underglass/react/package.json")), { code: "ENOENT" });
    await assert.rejects(readFile(join(root, "copied/@underglass/showcase/package.json")), { code: "ENOENT" });
    await rm(join(root, "node_modules/@underglass/react"));
    await symlinkOrSkip(t, join(root, "examples/playground"), join(root, "node_modules/@underglass/react"), "junction");
    await assert.rejects(copyDependencies(join(root, "node_modules"), join(root, "rejected")), /Unexpected workspace alias/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("requested native admission cannot pass through useful DOM fallback", () => {
  assertRequestedLane("dom", { mode: "dom", reason: "GPU not enabled" });
  assertRequestedLane("native", { mode: "gpu" });
  assert.throws(() => assertRequestedLane("native", { mode: "dom", reason: "unproven clip" }), /native pilot mode failed/);
});
