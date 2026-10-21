/**
 * Unit tests for the structure of `.github/workflows/release.yml` (see `docs/releasing.md`): publishing works
 * without a self-hosted GPU runner, runs the GPU suite when one exists, and a failed GPU run blocks the publish.
 * Run from the repository root with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(".github/workflows/release.yml", "utf8");
// The text of one top-level job: from `  name:` at two spaces to the next job or the end of the file.
const job = name => workflow.match(new RegExp(`^  ${name}:\\n([\\s\\S]*?)(?=^  [a-z-]+:\\n|(?![\\s\\S]))`, "m"))?.[1] ?? assert.fail(`job ${name}`);

test("the pack job no longer requires the GPU runner", () => {
  assert.doesNotMatch(job("pack"), /GPU_RUNNER/);
  assert.doesNotMatch(workflow, /Require the GPU runner/);
});

test("the GPU job runs only when a runner is configured and has a timeout for the long suite", () => {
  const gpu = job("gpu");
  assert.match(gpu, /if: needs\.select-mode\.outputs\.mode == 'publish' && vars\.GPU_RUNNER == 'true'/);
  assert.match(gpu, /runs-on: \[self-hosted, gpu\]/);
  assert.ok(Number(gpu.match(/timeout-minutes: (\d+)/)?.[1]) >= 150, "the suite takes about 1.5 hours");
});

// A skipped `gpu` (no runner) must not skip the publish, and a failed or cancelled `gpu` must block it.
test("publish needs a successful pack and a gpu job that succeeded or was skipped, never failed or cancelled", () => {
  const publish = job("publish");
  assert.match(publish, /needs: \[pack, gpu\]/);
  const condition = publish.match(/^    if: (.+)$/m)?.[1];
  assert.equal(condition, "always() && needs.pack.result == 'success' && (needs.gpu.result == 'success' || needs.gpu.result == 'skipped')");
  assert.doesNotMatch(condition, /failure|cancelled/);
});

// Changesets packs the workspaces in parallel; a prepack rebuild per package raced core's rebuild against the
// adapters' type checks (#210). The job builds everything first, so the pack must run without lifecycle scripts.
test("the pack step runs without lifecycle scripts after react's prepare step", () => {
  const pack = job("pack");
  assert.match(pack, /- name: Pack packages[\s\S]*?npm_config_ignore_scripts: "true"/);
  assert.ok(pack.indexOf("prepare-package.mjs") > -1 && pack.indexOf("prepare-package.mjs") < pack.indexOf("- name: Pack packages"),
    "react's docs/distribution.md copy runs before the pack");
});

// "Published" from Changesets means npm accepted the upload, not that the version is installable.
test("the publish job verifies every version is live on npm after publishing", () => {
  const publish = job("publish");
  assert.ok(publish.indexOf("node scripts/verify-published.mjs") > publish.indexOf("changesets/action/publish@"),
    "verification runs after the publish step");
});
