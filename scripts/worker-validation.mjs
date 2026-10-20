/**
 * Validation of the experimental worker presentation path (`@underglass/react/experimental-worker`, see
 * docs/worker.md). In an isolated copy of the repository it builds and packs `@underglass/core` and the
 * library, installs both packed archives, builds the fixture app in `fixtures/worker/app`, and runs functional proofs in a real
 * browser (pixels, native input, rollback, media and DPR changes, refusals, cancellation, disposal),
 * followed by a CSS / main-thread / worker timing comparison.
 *
 * Invoked as `npm run test:worker`. Flags: `--react18` (use the React 18.3.1 peer instead of 19.3.1),
 * `--functional-only` (skip the timing comparison). Environment: `CANVAS_WORKER_EXCLUSIVE=1` (only records
 * that the run was alone on the machine; run it that way for timing), `CANVAS_BROWSER_EXECUTABLE`,
 * `CANVAS_REQUIRE_BROWSER_PIN=1`.
 *
 * Output: a new `evidence/worker/run-<uuid>/` directory (path printed first) with command logs, screenshots
 * and `report.json`; a final JSON status line is printed. Sets a non-zero exit code on any failure. A 180 s
 * watchdog closes the browser if the proof hangs.
 */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join, basename, sep } from "node:path";
import { cpus, release } from "node:os";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { copyDependencies, assertPhysicalTree, assertPhysicalPath, assertBrowserIdentity, assertRuntimePeer } from "./release-policy.mjs";
import { validatePackageContents, packageFiles, corePackageFiles } from "./package-policy.mjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { withPlatform, devNull, tarArgs } from "../tests/helpers/process.mjs";

const root = resolve(".");
const peer = process.argv.includes("--react18") ? "18.3.1" : "19.3.1";
const functionalOnly = process.argv.includes("--functional-only");
await assertPhysicalPath(root);
const parent = join(root, "evidence/worker");
await mkdir(parent, { recursive: true });
await assertPhysicalPath(parent);
const run = join(parent, `run-${randomUUID()}`);
await mkdir(run);
console.log(run);
const tree = join(run, "workspace");
await mkdir(tree);
// Built up during the run and written to `report.json` in the `finally` block. `limits` states what the
// measurements do and do not show.
const report = { status: "running", peer, functionalOnly, startedAt: new Date().toISOString(),
  host: { platform: process.platform, arch: process.arch, release: release(), cpu: cpus()[0]?.model },
  exclusiveOwnedMeasurement: process.env.CANVAS_WORKER_EXCLUSIVE === "1",
  runtimePeers: [], commands: [], proof: [], benchmarks: [], limits: [
  "Experimental fixed interactive geometry; decorative animation only",
  "Worker/main rAF and CPU work are not physical presentation, GPU execution or input-to-photon",
  "Memory is texture-byte accounting only, not browser/driver/RSS",
  "One installed Canary/hardware environment; no production or manual acceptance",
  "CSS comparator is Underglass DOM fallback, not an unadopted no-framework app; external host activity uncontrolled",
] };
let browser, server, watchdog;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
// SHA-256 of the library sources, the worker fixture app and a few manifests and docs under `directory`. Compared
// for the checkout and for the copy, before and after, to show the copy is faithful and nothing moved.
async function inputs(directory) {
  const records = [];
  async function visit(path) {
    if (["node_modules", "dist", "program.json"].includes(basename(path))) return;
    const entries = await readdir(join(directory, path), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (["node_modules", "dist", "program.json"].includes(entry.name)) continue;
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else records.push({ path: child, sha256: hash(await readFile(join(directory, child))) });
    }
  }
  for (const path of ["packages/core/src", "packages/react/src", "fixtures/worker/app"]) await visit(path);
  for (const path of ["packages/react/package.json", "packages/react/README.md",
    "packages/react/vite.config.ts", "packages/core/package.json", "packages/core/README.md",
    "packages/core/vite.config.ts", "docs/distribution.md", "scripts/worker-validation.mjs",
    "package.json", "package-lock.json"]) records.push({ path, sha256: hash(await readFile(join(directory, path))) });
  return records;
}
// Runs a process in `cwd`, recording its status in the report and its output as `<label>.log`; throws
// with the output on failure.
async function command(executable, args, cwd, label) {
  let output = "";
  try {
    output = execFileSync(...withPlatform(executable, args, { cwd, encoding: "utf8",
      env: { ...process.env, npm_config_userconfig: devNull }, stdio: ["ignore", "pipe", "pipe"] }));
    report.commands.push({ label, status: "passed" });
    return output;
  } catch (error) {
    output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    report.commands.push({ label, status: "failed" });
    throw new Error(`${label}: ${output}`, { cause: error });
  } finally { await writeFile(join(run, `${label}.log`), output, { flag: "wx" }); }
}
// Number of pixels whose largest RGB channel difference exceeds 10, between two equally sized PNGs.
const changedPixels = (before, after) => {
  const a = PNG.sync.read(before), b = PNG.sync.read(after);
  assert.equal(a.width, b.width); assert.equal(a.height, b.height);
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) if (
    Math.max(...[0, 1, 2].map(channel => Math.abs(a.data[index + channel] - b.data[index + channel]))) > 10) changed++;
  return changed;
};
// Count, median, 95th percentile and maximum of a list of numbers (simple index-based percentiles).
const distribution = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, median: sorted[Math.floor(sorted.length / 2)] ?? null,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? null, maximum: sorted.at(-1) ?? null };
};
// Opens a fresh browser context on the served fixture for `variant` (`css`, `main`, `worker` or
// `worker-ripple`). `extra` is appended to the query string; `&absent=1` hides `navigator.gpu` before the
// page loads. Checks the browser identity and the React peer, and returns the context, page and the list
// of uncaught page errors.
async function open(variant, options = {}, extra = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 650 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") console.log("browser-error", message.text()); });
  const cdp = await context.newCDPSession(page);
  const actual = await cdp.send("Browser.getVersion");
  assertBrowserIdentity(actual);
  if (extra === "&absent=1") await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
  await page.goto(`http://127.0.0.1:${server.address().port}/?variant=${variant}${extra}`);
  await page.waitForFunction(() => window.workerFixture);
  const runtime = await page.evaluate(() => ({ react: workerFixture.version, reactDOM: workerFixture.domVersion }));
  assertRuntimePeer(runtime, peer);
  report.runtimePeers.push({ variant, ...runtime });
  return { context, page, errors, actual };
}
// Invokes a method of the fixture's `window.workerFixture` API in the page, failing after 20 s.
const call = (page, method, ...args) => page.evaluate(([method, args]) => Promise.race([
  window.workerFixture[method](...args),
  new Promise((_, reject) => setTimeout(() => reject(new Error(`Fixture ${method} timed out`)), 20_000)),
]), [method, args]);
// Enables GPU in the fixture and requires admission to succeed.
async function enable(page) {
  console.log("admitting", new URL(page.url()).search);
  const state = await call(page, "enable");
  assert.equal(state.mode, "gpu", JSON.stringify(state));
  await call(page, "settle");
  console.log("admitted");
}
try {
  report.inputs = await inputs(root);
  // Validate a copy of the repository, never the checkout itself.
  for (const path of ["packages", "tests", "fixtures/worker/app", "fixtures/react18/package-lock.json", "examples",
    "package.json", "package-lock.json", "scripts", "docs", "CONTRIBUTING.md"]) {
    await cp(join(root, path), join(tree, path), { recursive: true,
      filter: path => !["node_modules", "dist"].includes(basename(path)) });
  }
  await copyDependencies(join(root, "node_modules"), join(tree, "node_modules"));
  if (peer === "18.3.1") await copyDependencies(join(root, "fixtures/react18/node_modules"), join(tree, "node_modules"));
  await assertPhysicalTree(tree);
  assert.deepEqual(await inputs(tree), report.inputs, "Physical worker source inputs differ");
  const node = process.execPath, vite = join(tree, "node_modules/vite/bin/vite.js"), tsc = join(tree, "node_modules/typescript/bin/tsc");
  const library = join(tree, "packages/react"), coreLibrary = join(tree, "packages/core");
  const archiveDir = join(run, "archive"); await mkdir(archiveDir);
  // Pack a library and extract the archive into the copy's `node_modules`, so the fixture uses the
  // published file set rather than the workspace sources. Returns the archive record for the report.
  async function packAndInstall(directory, name, allowlist, label) {
    const packed = JSON.parse(await command("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", archiveDir], directory, `${label}-pack`))[0];
    validatePackageContents(packed.files, allowlist);
    const archive = join(archiveDir, packed.filename);
    const installed = join(tree, "node_modules", name); await mkdir(installed, { recursive: true });
    await command("tar", tarArgs(["-xzf", archive, "-C", installed, "--strip-components=1"], tree), tree, `${label}-extract`);
    return { sha256: hash(await readFile(archive)), bytes: packed.size, members: packed.files.length };
  }
  // Core first: the React build and declarations resolve the installed core package.
  await command(node, [vite, "build"], coreLibrary, "core-build");
  await command(node, [tsc, "-p", "tsconfig.json"], coreLibrary, "core-types");
  report.coreArchive = await packAndInstall(coreLibrary, "@underglass/core", corePackageFiles, "core-package");
  await command(node, [vite, "build"], library, "library-build");
  await command(node, [tsc, "-p", "tsconfig.json"], library, "library-types");
  await command(node, ["scripts/prepare-package.mjs"], library, "package-guide");
  report.archive = await packAndInstall(library, "@underglass/react", packageFiles, "package");
  const app = join(tree, "fixtures/worker/app");
  // The fixture precompiles its shader into `program.json` before the build; its size and capacity are
  // recorded in the report.
  await command(node, ["prepare.mjs"], app, "prebuild-shader");
  const literal = await readFile(join(app, "program.json"));
  report.program = { sha256: hash(literal), bytes: literal.length, capacity: JSON.parse(literal).capacity };
  await command(node, [vite, "build"], app, "fixture-production-build");
  await command(node, [tsc, "--noEmit", "--strict", "--module", "ESNext", "--moduleResolution", "Bundler", "--jsx", "react-jsx",
    "--resolveJsonModule", "--allowSyntheticDefaultImports", "--target", "ES2022", "main.tsx", "thread.ts"], app, "fixture-public-types");
  await command(node, ["--test", "tests/unit/worker.unit.test.mjs", "tests/unit/workspace.unit.test.mjs"], tree, "targeted-units");
  const assets = join(app, "dist");
  // Static server for the built fixture, confined to its `dist` directory.
  server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const path = resolve(assets, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!path.startsWith(assets + sep)) { response.writeHead(403).end(); return; }
      response.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html");
      response.end(await readFile(path));
    } catch (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500).end(String(error)); }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/`)).status, 200);
  browser = await chromium.launch(browserLaunchOptions({ headless: true }));
  report.actual = await (await browser.newBrowserCDPSession()).send("Browser.getVersion");
  report.browserCommandLine = await (await browser.newBrowserCDPSession()).send("Browser.getBrowserCommandLine");
  assertBrowserIdentity(report.actual);
  // Closing the browser makes any pending page call fail instead of hanging the run.
  watchdog = setTimeout(() => {
    report.watchdog = "Owned browser proof exceeded 180 seconds";
    void browser.close();
  }, 180_000);
  report.assets = await readdir(join(assets, "assets"));

  // Main proof, once per device pixel ratio, starting from reduced motion so the fixture is static.
  for (const dpr of [1, 2]) {
    const { context, page, errors } = await open("worker", { deviceScaleFactor: dpr, reducedMotion: "reduce" });
    const proof = { dpr }; report.proof.push(proof);
    try {
      assert.equal((await call(page, "state")).mode, "dom");
      await page.evaluate(() => {
        window.originalInput = document.getElementById("native-input");
        window.originalRoot = workerFixture.controller.container;
        window.trustedClicks = [];
        document.getElementById("save").addEventListener("click", event => window.trustedClicks.push(event.isTrusted));
      });
      await enable(page);
      console.log("editing", dpr);
      await page.locator("#native-input").fill("W".repeat(32));
      await call(page, "settle");
      const rect = await page.locator("#native-input").boundingBox();
      // Edit the original input with a wide and then a narrow string. The owning canvas pixels in the input's
      // box must change, so the live native input is really being presented.
      const glyphW = await page.screenshot({ clip: rect });
      await page.locator("#native-input").fill("I".repeat(32));
      await call(page, "settle");
      const glyphI = await page.screenshot({ clip: rect });
      proof.glyphPixels = changedPixels(glyphW, glyphI);
      assert.ok(proof.glyphPixels > 100, "Original live input must change owning canvas pixels");
      await writeFile(join(run, `dpr${dpr}-glyph-W.png`), glyphW, { flag: "wx" });
      await writeFile(join(run, `dpr${dpr}-glyph-I.png`), glyphI, { flag: "wx" });
      await page.locator("#save").click();
      assert.equal(await page.locator("#saved").textContent(), "I".repeat(32));
      assert.deepEqual(await page.evaluate(() => window.trustedClicks), [true]);
      assert.equal((await call(page, "state")).mode, "gpu");
      // Changing essential geometry on the fixed-geometry path is refused with a diagnostic and must leave the
      // state unchanged.
      const guarded = await call(page, "fixedGeometryGuard");
      assert.match(guarded.reason, /essential geometry must remain fixed/);
      assert.deepEqual(guarded.before, guarded.after);
      proof.fixedGeometryGuard = guarded.reason;
      // Structure changes (removing then restoring a layer) must keep GPU on.
      await call(page, "structure"); await call(page, "settle");
      assert.equal(await page.locator("#layer-7").count(), 0);
      assert.equal((await call(page, "state")).mode, "gpu");
      await call(page, "structure"); await call(page, "layout"); await call(page, "settle");
      assert.equal(await page.locator("#layer-7").count(), 1);
      assert.equal((await call(page, "state")).mode, "gpu");
      // disable() is caller-owned: it must keep the same input and root, with focus, value and selection.
      await page.locator("#native-input").focus();
      await page.evaluate(() => originalInput.setSelectionRange(3, 8));
      await call(page, "disable");
      console.log("disabled", dpr);
      assert.deepEqual(await page.evaluate(() => ({
        sameInput: originalInput === document.getElementById("native-input"), sameRoot: originalRoot === workerFixture.controller.container,
        focused: document.activeElement === originalInput, value: originalInput.value,
        selection: [originalInput.selectionStart, originalInput.selectionEnd],
      })), { sameInput: true, sameRoot: true, focused: true, value: "I".repeat(32), selection: [3, 8] });
      await page.keyboard.type("DOM");
      await enable(page);
      assert.equal(await page.evaluate(() => originalInput === document.getElementById("native-input")), true);
      await page.locator("#save").click();
      assert.match(await page.locator("#saved").textContent(), /DOM/);
      await page.locator("#enable").focus();
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await call(page, "settle");
      // With motion allowed, the worker must keep presenting frames while the main thread captures nothing
      // and React does not rerender.
      const before = await call(page, "state");
      const imageBefore = await page.locator("#frame").screenshot({ caret: "initial" });
      await page.waitForTimeout(280);
      const imageAfter = await page.locator("#frame").screenshot({ caret: "initial" });
      const after = await call(page, "state");
      proof.animation = { before, after };
      proof.motionPixels = changedPixels(imageBefore, imageAfter);
      assert.ok(proof.motionPixels > 500);
      assert.ok(after.worker.frames > before.worker.frames);
      assert.equal(after.captures, before.captures, "GPU-only frames must reuse captures");
      assert.equal(after.renders, before.renders, "GPU-only frames must not rerender React");
      // Reduced motion and forced colors pause the animation but must not revoke GPU.
      await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
      await call(page, "settle");
      await page.waitForTimeout(80);
      const paused = await call(page, "state");
      await page.waitForTimeout(120);
      const stillPaused = await call(page, "state");
      assert.equal(stillPaused.mode, "gpu");
      assert.equal(stillPaused.worker.frames, paused.worker.frames);
      proof.media = { paused, stillPaused };
      await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
      await call(page, "settle");
      // Synthetic hidden tab: the worker must stop producing frames while hidden and resume when visible,
      // still on GPU.
      await call(page, "visibility", true);
      await page.waitForTimeout(80);
      const hidden = await call(page, "state");
      await page.waitForTimeout(120);
      assert.equal((await call(page, "state")).worker.frames, hidden.worker.frames);
      await call(page, "visibility", false);
      await call(page, "settle"); await page.waitForTimeout(80);
      const visible = await call(page, "state");
      assert.equal(visible.mode, "gpu");
      assert.ok(visible.worker.frames > hidden.worker.frames);
      proof.syntheticVisibility = { hidden, visible };
      // Layout and device-pixel-ratio changes must not revoke GPU, and native editing must still change pixels
      // at the new density.
      await page.setViewportSize({ width: 1000, height: 700 }); await call(page, "settle");
      assert.equal((await call(page, "state")).mode, "gpu");
      const density = dpr === 1 ? 2 : 1;
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 700, deviceScaleFactor: density, mobile: false });
      await page.waitForFunction(value => devicePixelRatio === value, density);
      await call(page, "settle");
      await page.locator("#native-input").fill("W".repeat(32)); await call(page, "settle");
      const densityRect = await page.locator("#native-input").boundingBox();
      const densityW = await page.screenshot({ clip: densityRect, caret: "initial" });
      await page.locator("#native-input").fill("I".repeat(32)); await call(page, "settle");
      const densityI = await page.screenshot({ clip: densityRect, caret: "initial" });
      const densityPixels = changedPixels(densityW, densityI);
      assert.ok(densityPixels > 100);
      await page.locator("#save").click();
      assert.equal(await page.locator("#saved").textContent(), "I".repeat(32));
      assert.equal((await call(page, "state")).mode, "gpu");
      proof.emulatedDPRChange = { from: dpr, to: density, glyphPixels: densityPixels };
      proof.disposal = await call(page, "dispose");
      console.log("disposed", dpr);
      for (const value of Object.values(proof.disposal.resources)) assert.equal(value, 0);
      for (const value of Object.values(proof.disposal.worker.resources)) assert.equal(value, 0);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  // Genuine refusals (no WebGPU, worker construction failure) must fall back to DOM with a diagnosis, keep
  // the original input usable and dispose cleanly.
  for (const [extra, pattern] of [["&absent=1", /unavailable/], ["&fault=factory", /construction failure/]]) {
    const { context, page, errors } = await open("worker", {}, extra);
    try {
      const refusal = await call(page, "enable");
      assert.equal(refusal.mode, "dom"); assert.match(refusal.reason, pattern);
      await page.locator("#native-input").fill("usable fallback");
      await page.locator("#save").click(); assert.equal(await page.locator("#saved").textContent(), "usable fallback");
      report.proof.push({ refusal: refusal.reason, disposal: await call(page, "dispose") });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  {
    // Ripple variant: pixels move, and after a simulated device loss the controller falls back to DOM and a
    // new enable() brings GPU back.
    const { context, page, errors } = await open("worker-ripple");
    try {
      await enable(page);
      const a = await page.locator("#frame").screenshot({ caret: "initial" }); await page.waitForTimeout(280);
      const b = await page.locator("#frame").screenshot({ caret: "initial" });
      const delta = changedPixels(a, b); assert.ok(delta > 500);
      await writeFile(join(run, "ripple.png"), b, { flag: "wx" });
      await page.evaluate(() => workerFixture.controller.simulateDeviceLoss());
      await page.waitForFunction(() => workerFixture.controller.state().mode === "dom");
      await call(page, "disable"); await enable(page);
      report.proof.push({ ripplePixels: delta, deviceLossRecovered: true, disposal: await call(page, "dispose") });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  // Source faults injected after admission (animation ownership, newly interactive content, native picker,
  // descendant geometry, unenrolled content) must each end in DOM with the matching reason and a usable
  // original input.
  for (const [kind, reason] of [["animation", /ownership changed/], ["interactive", /became interactive/],
    ["picker", /native-picker boundary/], ["geometry", /descendant geometry changed/], ["unenrolled", /Unenrolled/]]) {
    const { context, page, errors } = await open("worker", { reducedMotion: "reduce" });
    try {
      await enable(page);
      await call(page, "sourceFault", kind);
      await page.waitForFunction(() => workerFixture.controller.state().mode === "dom");
      const refused = await call(page, "state"); assert.match(refused.reason, reason);
      await page.locator("#native-input").fill("original source remains usable");
      await page.locator("#save").click();
      assert.equal(await page.locator("#saved").textContent(), "original source remains usable");
      report.proof.push({ syntheticSourceFault: kind, refused, disposal: await call(page, "dispose") });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  {
    const { context, page, errors } = await open("worker");
    try {
      // Calling disable() while admission is in progress must cancel it without leaking a worker.
      const cancelled = await page.evaluate(async () => {
        const admission = workerFixture.enable();
        await new Promise(resolve => setTimeout(resolve, 0));
        const disabling = workerFixture.disable();
        await Promise.all([admission, disabling]);
        return workerFixture.state();
      });
      assert.equal(cancelled.mode, "dom");
      assert.equal(cancelled.resources.workers, 0);
      await enable(page);
      // Concurrent disable() and repeated dispose() calls must settle on `disposed` with zero resources.
      const disposed = await page.evaluate(async () => {
        await Promise.all([workerFixture.disable(), workerFixture.dispose(), workerFixture.dispose()]);
        return workerFixture.state();
      });
      assert.equal(disposed.mode, "disposed");
      for (const value of Object.values(disposed.resources)) assert.equal(value, 0);
      report.proof.push({ admissionCancellation: cancelled, concurrentDisposal: disposed });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  {
    const { context, page, errors } = await open("worker", {}, "&fault=stop-delay");
    try {
      await enable(page);
      // A worker that is slow to confirm stop makes disable() fail visibly. The controller must stay in
      // `restoring` with cleanup pending (resources still counted), then complete on retry.
      await assert.rejects(call(page, "disable"), /stop reply timed out/);
      const pending = await page.evaluate(() => workerFixture.controller.state());
      assert.equal(pending.mode, "restoring");
      assert.match(pending.reason, /cleanup pending/);
      assert.equal(pending.resources.workers, 1);
      assert.equal(pending.worker.resources.engines, 1);
      await page.waitForTimeout(1200);
      const recovered = await call(page, "disable");
      assert.equal(recovered.mode, "dom");
      assert.equal(recovered.resources.workers, 0);
      report.proof.push({ syntheticDelayedStop: pending, recovered, disposal: await call(page, "dispose") });
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  // Timing comparison: CSS animation, main-thread GPU and worker GPU, three repetitions with and without
  // main-thread contention, rotating the variant order each repetition. Interval and CPU statistics are
  // recorded; the only timing assertion is that the worker's summed rAF intervals are within 250 ms of the window.
  for (let repetition = 0; repetition < (functionalOnly ? 0 : 3); repetition++) for (const contention of [false, true]) {
    const variants = ["css", "main", "worker"];
    for (const variant of [...variants.slice(repetition), ...variants.slice(0, repetition)]) {
      const { context, page, errors } = await open(variant);
      try {
        if (variant !== "css") await enable(page);
        await page.waitForTimeout(500);
        const raw = await call(page, "collect", 2000, contention);
        const worker = raw.after.worker;
        const workerIntervals = worker?.frameIntervals.slice(raw.before.worker.frameIntervals.length) ?? [];
        const workerWork = worker?.frameWork.slice(raw.before.worker.frameWork.length) ?? [];
        const workerRAFMeasuredSpanMs = workerIntervals.reduce((sum, interval) => sum + interval, 0);
        if (variant === "worker") {
          assert.ok(workerIntervals.length > 0, "No measured worker rAF callbacks");
          assert.ok(Math.abs(workerRAFMeasuredSpanMs - raw.milliseconds) < 250,
            `Worker rAF span omits measurement time: ${workerRAFMeasuredSpanMs}/${raw.milliseconds}`);
        }
        report.benchmarks.push({ variant, repetition, contention, raw, mainRAF: distribution(raw.intervals),
          workerRAF: distribution(workerIntervals), workerRAFMeasuredSpanMs, workerCPU: distribution(workerWork),
          mainCPU: distribution(raw.operations.filter(value => value.kind === "frameWorkMs").map(value => value.durationMs)),
          captureCPU: distribution(raw.operations.filter(value => value.kind === "captureMs").map(value => value.durationMs)),
          uploadCPU: distribution(raw.operations.filter(value => value.kind === "uploadMs").map(value => value.durationMs)) });
        const disposed = await call(page, "dispose");
        if (variant === "worker") for (const value of Object.values(disposed.resources)) assert.equal(value, 0);
        assert.deepEqual(errors, []);
      } finally { await context.close(); }
    }
  }
  // The sources must be unchanged after the run, both in the copy and in the checkout.
  assert.deepEqual(await inputs(tree), report.inputs, "Worker execution source inputs changed");
  assert.deepEqual(await inputs(root), report.inputs, "Maintained worker source inputs changed");
  report.inputsUnchanged = true;
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = String(error.stack ?? error);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  if (server) await new Promise(done => server.close(done));
  report.helpersClosed = true;
  report.finishedAt = new Date().toISOString();
  await writeFile(join(run, "report.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ status: report.status, error: report.error, run }));
}
