/**
 * End-to-end validation of the public showcase (`examples/showcase`) as it would be published: builds it in
 * an isolated copy of the repository, checks the output files, serves the build under the `/underglass/`
 * base path and drives the gallery in a real browser in a DOM lane and a native (GPU) lane.
 *
 * Invoked as `npm run test:showcase`. Environment: `CANVAS_BROWSER_EXECUTABLE` (default Chrome Canary) and
 * `CANVAS_REQUIRE_BROWSER_PIN=1` (see `release-policy.mjs`). The native lane requires GPU admission to
 * succeed; the DOM lane requires that the examples stay usable without it, including with WebGPU hidden.
 *
 * Output: a new git-ignored `evidence/showcase/run-<uuid>/` directory with input hashes, command logs,
 * screenshots, `preview.log` and `result.json`. Prints one summary line and exits non-zero on any failure or
 * if an input file changed during the run.
 */
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { createServer } from "node:net";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { copyDependencies, assertBrowserIdentity, assertRuntimePeer, assertPhysicalPath, assertPhysicalTree, qualifiedBrowser } from "./release-policy.mjs";
import { devNull } from "../tests/helpers/process.mjs";

const root = resolve(".");
const sha = data => createHash("sha256").update(data).digest("hex");
// Run output goes under a git-ignored root and must not be reached through a symlink.
const parent = join(root, "evidence/showcase");
execFileSync("git", ["check-ignore", parent]);
await assertPhysicalPath(root);
await assertPhysicalPath(join(root, "evidence"));
try { await assertPhysicalPath(parent); } catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(parent, { recursive: true });
await assertPhysicalPath(parent);
const run = join(parent, `run-${randomUUID()}`);
await mkdir(run);
const tree = join(run, "workspace");
await mkdir(tree);
const result = { status: "running", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  qualifiedBrowser, commands: [], browsers: [], hosted: "NOT EXECUTED", directory: run };
// Every repository input (sources, scripts, tests, manifests, docs, workflow) is hashed up front and
// re-checked at the end, to prove the run did not modify what it validated.
const inputs = [];
// Hashes every file below the repository-relative `path`, skipping dependency and build folders.
async function inventory(path) {
  for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await inventory(file);
    else inputs.push({ path: file, sha256: sha(await readFile(join(root, file))) });
  }
}
for (const path of ["packages", "examples", "scripts", "tests"]) await inventory(path);
for (const path of ["package.json", "package-lock.json", "docs/distribution.md", "docs/showcase.md", ".github/workflows/showcase-pages.yml"]) {
  inputs.push({ path, sha256: sha(await readFile(join(root, path))) });
}
await writeFile(join(run, "inputs.json"), JSON.stringify(inputs, null, 2), { flag: "wx" });
// Runs a Node script in `cwd` with no user npm config and no browser download, saves its output as
// `<label>.log` and throws, with the output tail, when it exits non-zero.
async function command(args, cwd, label) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, npm_config_userconfig: devNull,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done); });
  await writeFile(join(run, `${label}.log`), output, { flag: "wx" });
  result.commands.push({ args, cwd, label, code });
  assert.equal(code, 0, `${label}: ${output.slice(-4000)}`);
}
let server;
let serverClosed;
let serverOutput = "";
try {
  // Build in a copy of the repository so the checkout is never written to.
  for (const path of ["packages", "examples", "scripts", "tests", "package.json", "package-lock.json", "docs/distribution.md", "docs/showcase.md",
    ".github/workflows/showcase-pages.yml"]) {
    await cp(join(root, path), join(tree, path), { recursive: true,
      filter: path => !["node_modules", "dist", "owned-vite-cache"].includes(basename(path)) });
  }
  await mkdir(join(tree, "fixtures/react18"), { recursive: true });
  for (const path of ["package.json", "package-lock.json"]) await cp(join(root, "fixtures/react18", path), join(tree, "fixtures/react18", path));
  await copyDependencies(join(root, "node_modules"), join(tree, "node_modules"));
  // npm keeps a dependency only one workspace uses in that workspace's own `node_modules` (the showcase's
  // `@vercel/analytics`).
  try { await copyDependencies(join(root, "examples/showcase/node_modules"), join(tree, "examples/showcase/node_modules")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  await assertPhysicalTree(tree);
  const vite = join(tree, "node_modules/vite/bin/vite.js");
  const tsc = join(tree, "node_modules/typescript/bin/tsc");
  const library = join(tree, "packages/react");
  const site = join(tree, "examples/showcase");
  await command(["--test", "tests/unit/showcase.unit.test.mjs", "tests/unit/workspace.unit.test.mjs", "tests/unit/release.unit.test.mjs"], tree, "focused-units");
  // Install a freshly built library into the copy's `node_modules` under its public package name, so the
  // showcase resolves it as a published package rather than a workspace link.
  async function publish(directory, name) {
    const installed = join(tree, "node_modules", name);
    await mkdir(installed, { recursive: true });
    await cp(join(directory, "package.json"), join(installed, "package.json"));
    await cp(join(directory, "dist"), join(installed, "dist"), { recursive: true });
  }
  // Core first: the React library's declarations resolve the installed core package.
  const coreLibrary = join(tree, "packages/core");
  await command([vite, "build"], coreLibrary, "core-build");
  await command([tsc, "-p", "tsconfig.json"], coreLibrary, "core-declarations");
  await publish(coreLibrary, "@underglass/core");
  await command([vite, "build"], library, "library-build");
  await command([tsc, "-p", "tsconfig.json"], library, "library-declarations");
  await publish(library, "@underglass/react");
  // The Strata gallery (`examples/strata`) uses `@underglass/ui`: its JavaScript, declarations and stylesheets.
  const ui = join(tree, "packages/ui");
  await command([vite, "build"], ui, "ui-build");
  await command([tsc, "-p", "tsconfig.json"], ui, "ui-declarations");
  await command(["scripts/build-css.mjs"], ui, "ui-css");
  await publish(ui, "@underglass/ui");
  await command([tsc, "--noEmit"], site, "showcase-types");
  await command([vite, "build"], site, "showcase-project-build");
  await command([join(tree, "scripts/check-showcase-assets.mjs")], site, "showcase-output-guard");
  const dist = join(site, "dist");
  // Re-check the published file set independently of the build-time guard (`check-showcase-assets.mjs`),
  // recording each file's size and hash.
  const assets = [];
  async function checkAssets(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) { assert.ok(name === "assets" || name === "examples", name); await checkAssets(path, `${name}/`); }
      else {
        // The pages and site files `seo.ts` writes, the icons and social card, hashed JS/CSS and the JPEG
        // previews of GPU mode shown to browsers that cannot run it.
        assert.ok(/^(?:(?:index|404)\.html|robots\.txt|sitemap\.xml|favicon\.svg|og\.jpg|apple-touch-icon\.png|examples\/[\w-]+\.html|assets\/[\w.-]+\.(?:js|css|jpg))$/.test(name),
          `Unexpected public asset: ${name}`);
        const bytes = await readFile(path);
        if (name.endsWith(".jpg")) assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, `Public image is not a JPEG: ${name}`);
        else if (name.endsWith(".png")) assert.equal(bytes.readUInt32BE(0), 0x89504e47, `Public image is not a PNG: ${name}`);
        else assert.ok(!/\/Users\/|session-state|evidence\/phase|PRIVATE KEY|sourceMappingURL/.test(bytes.toString()), `Private asset leak: ${name}`);
        assets.push({ path: name, bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  await checkAssets(dist);
  result.assets = assets;
  const html = await readFile(join(dist, "index.html"), "utf8");
  // The build must use the `/underglass/` Pages base path.
  assert.match(html, /\/underglass\/assets\//);
  // Find a free port by binding port 0 and releasing it, then serve the build with `vite preview`.
  const socket = createServer();
  await new Promise(done => socket.listen(0, "127.0.0.1", done));
  const port = socket.address().port;
  await new Promise(done => socket.close(done));
  server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: site, stdio: ["ignore", "pipe", "pipe"] });
  serverClosed = new Promise(done => server.once("close", done));
  for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { serverOutput += data; });
  result.preview = { pid: server.pid, port };
  const url = `http://127.0.0.1:${port}/underglass/`;
  for (let attempt = 0;; attempt++) {
    try { assert.equal((await fetch(url)).status, 200); break; }
    catch (error) { if (attempt === 99 || server.exitCode !== null) throw error; await new Promise(done => setTimeout(done, 100)); }
  }
  // Each example has its own page with its own title and canonical URL, and the site files are served.
  for (const example of ["motion", "strata"]) {
    const response = await fetch(`${url}examples/${example}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), new RegExp(`<link rel="canonical" href="https://underglass.dev/examples/${example}">`));
  }
  for (const file of ["sitemap.xml", "robots.txt", "favicon.svg", "og.jpg", "apple-touch-icon.png"]) assert.equal((await fetch(`${url}${file}`)).status, 200, file);
  // Every script and stylesheet the page references must be served.
  for (const asset of html.matchAll(/(?:src|href)="(\/underglass\/assets\/[^"]+)"/g)) {
    assert.equal((await fetch(`http://127.0.0.1:${port}${asset[1]}`)).status, 200);
  }
  // The same scenario runs twice: `dom` (no HTML-in-Canvas flags; the examples must stay on DOM) and
  // `native` (flags on; GPU must be admitted and the pixels must change as the examples run).
  for (const lane of ["dom", "native"]) {
    const executablePath = process.env.CANVAS_BROWSER_EXECUTABLE;
    result.executable = executablePath ? { path: executablePath, sha256: sha(await readFile(executablePath)) } : { channel: "chrome-canary" };
    const browser = await chromium.launch(browserLaunchOptions({ native: lane === "native" ? true : "none" }));
    const record = { lane, status: "running" };
    result.browsers.push(record);
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      record.actual = await cdp.send("Browser.getVersion");
      record.argv = await cdp.send("Browser.getBrowserCommandLine");
      await writeFile(join(run, `${lane}-actual.json`), JSON.stringify(record, null, 2), { flag: "wx" });
      assertBrowserIdentity(record.actual);
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      // The page exposes a `window.showcase` test hook (state, controller, React versions).
      await page.goto(`${url}examples/layers`);
      await page.waitForFunction(() => window.showcase);
      record.peer = await page.evaluate(() => ({ react: window.showcase.react, reactDOM: window.showcase.reactDOM }));
      assertRuntimePeer(record.peer, "19.3.1");
      await page.getByLabel("Find an example").fill("no matching term");
      await page.getByText("No matching examples. Try another search or category.").waitFor();
      await page.getByLabel("Find an example").fill("");
      await page.getByLabel("Category", { exact: true }).selectOption("Motion");
      assert.equal(await page.locator(".example-card").count(), 1);
      await page.getByLabel("Category", { exact: true }).selectOption("All");
      // Helpers: the example's reported state, a button inside the stage by exact label, and a settle that
      // flushes the controller then waits briefly for pending paints.
      const state = () => page.evaluate(() => window.showcase.state());
      const studioButton = name => page.locator(".stage button").filter({ hasText: new RegExp(`^${name}$`) });
      const settle = async () => { await page.evaluate(() => window.showcase.controller.settle()); await page.waitForTimeout(250); };
      if (lane === "native") {
        await page.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
        await page.waitForFunction(() => !window.showcase.state().initializing);
      }
      record.initial = await state();
      assert.equal(record.initial.mode, lane === "native" ? "gpu" : "dom", record.initial.reason);
      assert.ok(record.initial.reason.length > 0);
      // Save a wide title, then a narrow one. In the native lane the owning canvas pixels in the title area must
      // differ between the two screenshots, so a stale presented image cannot pass.
      const wideTitle = "W".repeat(32), narrowTitle = "I".repeat(32);
      await page.locator("#studio-title").fill(wideTitle);
      await studioButton("Save postcard").click();
      await settle();
      await page.locator("#saved-title").filter({ hasText: wideTitle }).waitFor();
      record.afterSave = await state();
      assert.equal(record.afterSave.mode, lane === "native" ? "gpu" : "dom", record.afterSave.reason);
      const output = page.locator(".stage .output");
      let first;
      if (lane === "native") first = PNG.sync.read(await output.screenshot({ path: join(run, "native-title-W.png") }));
      await page.locator("#studio-title").fill(narrowTitle);
      await studioButton("Save postcard").click();
      await settle();
      if (lane === "native") {
        const second = PNG.sync.read(await output.screenshot({ path: join(run, "native-title-I.png") }));
        let changed = 0;
        for (let y = 92; y < 160; y++) for (let x = 406; x < 700; x++) {
          const offset = (y * second.width + x) * 4;
          if (first.data.subarray(offset, offset + 4).some((v, i) => v !== second.data[offset + i])) changed++;
        }
        assert.ok(changed > 100, `Owning changed title pixels: ${changed}`);
        record.changedTitlePixels = changed;
      }
      assert.equal(await page.locator("#saved-title").innerText(), narrowTitle);
      assert.equal((await state()).mode, lane === "native" ? "gpu" : "dom");
      // disable() must keep the same original input element, its focus and its selection; then GPU is re-enabled.
      const title = page.locator("#studio-title");
      await title.focus();
      await title.evaluate(node => { window.showcaseOriginal = node; node.setSelectionRange(1, 3); });
      await page.evaluate(() => window.showcase.controller.disable());
      assert.deepEqual(await title.evaluate(node => ({ original: node === window.showcaseOriginal, value: node.value,
        focused: document.activeElement === node, selection: [node.selectionStart, node.selectionEnd] })),
      { original: true, value: narrowTitle, focused: true, selection: [1, 3] });
      if (lane === "native") { await page.evaluate(() => window.showcase.controller.enable()); assert.equal((await state()).mode, "gpu"); }
      await page.locator('.example-card[href$="/examples/motion"]').click();
      await studioButton("Play layer journey").waitFor();
      await settle();
      // Motion: compare the canvas before and after starting the journey, then over a 250 ms window require
      // presented GPU frames and an advancing layer transform with no new captures or uploads.
      let staticMotion;
      if (lane === "native") staticMotion = PNG.sync.read(await output.screenshot({ path: join(run, "native-motion-start.png") }));
      await studioButton("Play layer journey").click();
      await page.waitForTimeout(300);
      record.motion = await state();
      record.motionFeedback = await page.locator("#studio-feedback").innerText();
      assert.ok(record.motion.runtimeResources.declarativeMotions > 0, `Motion must have a real runtime owner: ${record.motionFeedback}`);
      assert.equal(record.motion.mode, lane === "native" ? "gpu" : "dom");
      const moving = record.motion.layers.find(layer => layer.id === "showcase-card").transform;
      assert.ok(Math.abs(moving.x ?? 0) > 1 || Math.abs(moving.y ?? 0) > 1 || Math.abs(moving.rotation ?? 0) > 1
        || Math.abs((moving.scaleX ?? 1) - 1) > .01, `Journey must move the card: ${JSON.stringify(moving)}`);
      if (lane === "native") {
        const animated = PNG.sync.read(await output.screenshot({ path: join(run, "native-motion-active.png") }));
        let changed = 0;
        for (let y = 36; y < 325; y++) for (let x = 350; x < 735; x++) {
          const offset = (y * animated.width + x) * 4;
          if (staticMotion.data.subarray(offset, offset + 4).some((v, i) => v !== animated.data[offset + i])) changed++;
        }
        assert.ok(changed > 100, `Owned motion changed output pixels: ${changed}`);
        record.changedMotionPixels = changed;
        await page.evaluate(() => window.showcase.controller.settle());
        record.motionWindow = await page.evaluate(async () => {
          const before = window.showcase.state(), started = performance.now();
          await new Promise(resolve => setTimeout(resolve, 250));
          return { before, after: window.showcase.state(), elapsedMs: performance.now() - started };
        });
        const { before, after } = record.motionWindow;
        assert.equal(after.mode, "gpu");
        assert.ok(after.metrics.gpuFrames > before.metrics.gpuFrames, "GPU motion must advance real frames");
        assert.notEqual(after.layers.find(layer => layer.id === "showcase-card").transform.x,
          before.layers.find(layer => layer.id === "showcase-card").transform.x, "Owned motion must advance the layer");
        for (const metric of ["captures", "uploads"]) {
          assert.equal(after.metrics[metric], before.metrics[metric], `Settled GPU-only motion must reuse ${metric}`);
        }
      }
      // Let the journey finish before moving to the next example.
      await page.waitForTimeout(1700);
      await page.locator('.example-card[href$="/examples/effects"]').click();
      await studioButton("Apply chromatic effect").waitFor();
      await settle();
      // Effects: the decorative layer must be inert and hidden from assistive tech, the original title input
      // must still be what a click at its centre hits, and the effect must change the canvas pixels.
      let staticArt;
      if (lane === "native") staticArt = PNG.sync.read(await output.screenshot({ path: join(run, "native-static-art.png") }));
      await studioButton("Apply chromatic effect").click();
      await settle();
      record.effect = await state();
      assert.equal(record.effect.mode, lane === "native" ? "gpu" : "dom");
      assert.ok(record.effect.runtimeResources.decorativeEffects > 0);
      assert.equal(await page.locator("#showcase-art").evaluate(node => node.inert && node.getAttribute("aria-hidden") === "true"), true);
      const hit = await title.evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
      assert.equal(hit, "studio-title");
      await title.evaluate(node => {
        node.addEventListener("click", event => { window.showcaseTrustedClick = event.isTrusted; }, { once: true });
      });
      const rect = await title.boundingBox();
      assert.ok(rect);
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Native edit!");
      assert.equal(await title.inputValue(), "Native edit!");
      assert.equal(await page.evaluate(() => window.showcaseTrustedClick), true);
      if (lane === "native") {
        const changedArt = PNG.sync.read(await output.screenshot({ path: join(run, "native-effect.png") }));
        let changed = 0;
        for (let y = 330; y < 480; y++) for (let x = 378; x < 728; x++) {
          const offset = (y * changedArt.width + x) * 4;
          if (staticArt.data.subarray(offset, offset + 4).some((v, i) => v !== changedArt.data[offset + i])) changed++;
        }
        assert.ok(changed > 50, `Real decorative shader changed pixels: ${changed}`);
        record.changedEffectPixels = changed;
      }
      await page.locator('.example-card[href$="/examples/tasks"]').click();
      await page.getByLabel("New task", { exact: true }).waitFor();
      await settle();
      await page.getByLabel("New task", { exact: true }).fill("Showcase task");
      await studioButton("Add task").click();
      await settle();
      assert.equal((await state()).mode, lane === "native" ? "gpu" : "dom");
      await page.getByLabel("Open task 1", { exact: true }).click();
      await page.getByLabel("Task notes", { exact: true }).fill("Local note");
      await studioButton("Save task").click();
      await settle();
      assert.match(await page.locator("#task-message").innerText(), /Saved/);
      if (lane === "native") await output.screenshot({ path: join(run, "native-tasks.png") });
      // Fluent release board: stock Fluent UI v9 controls, springs and transition effects on live layers.
      await page.locator('.example-card[href$="/examples/fluent"]').click();
      await page.getByRole("button", { name: "Add item", exact: true }).waitFor();
      const springTo = (id, x, y) => page.waitForFunction(([id, x, y]) => {
        const transform = window.showcase.state().layers.find(layer => layer.id === id)?.transform;
        return transform && Math.abs((transform.x ?? 0) - x) < .5 && Math.abs((transform.y ?? 0) - y) < .5 && Math.abs(transform.rotation ?? 0) < .01;
      }, [id, x, y], { timeout: 8000 });
      const fluentMode = async label => {
        const current = await state();
        assert.equal(current.mode, lane === "native" ? "gpu" : "dom", `${label}: ${current.reason}`);
        return current;
      };
      const quiet = () => page.waitForFunction(() => window.showcase.state().runtimeResources.transitionEffects === 0, null, { timeout: 8000 });
      // The opening cascade settles every card in its slot.
      await springTo("fluent-item-6", 0, 172);
      await settle();
      record.fluent = { initial: await fluentMode("opened") };
      // Fluent's own styles win over the showcase's base control styles.
      assert.equal(await page.getByRole("button", { name: "Add item", exact: true }).evaluate(node => getComputedStyle(node).borderTopLeftRadius), "4px");
      // A new card materialises while it springs out of the panel, then is an ordinary interactive card.
      await page.locator("#fluent-title").fill("Validation item");
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      await springTo("fluent-item-7", 0, 258);
      await quiet();
      // Inertness is inherited from the layer's direct child, so test the effective state.
      assert.equal(await page.locator("#fluent-item-7 .fui-Card").evaluate(node => node.matches("[inert], [inert] *")), false);
      let board;
      if (lane === "native") { await settle(); board = PNG.sync.read(await output.screenshot({ path: join(run, "native-fluent-board.png") })); }
      // The editor grows out of its card; its content is inert only while it materialises.
      await page.getByRole("button", { name: "Edit Release notes", exact: true }).click();
      await page.locator("#fluent-editor").waitFor();
      if (lane === "native") {
        await page.waitForFunction(() => document.querySelector("#fluent-editor form")?.matches("[inert] *") && window.showcase.state().runtimeResources.transitionEffects === 1, null, { timeout: 2000 });
        record.fluent.materialising = await fluentMode("editor materialising");
      }
      await page.waitForFunction(() => document.querySelector("#fluent-editor form")?.matches("[inert], [inert] *") === false, null, { timeout: 4000 });
      await quiet();
      await page.locator("#fluent-edit-title").fill("Validated release notes");
      await page.locator("#fluent-item-6").filter({ hasText: "Validated release notes" }).waitFor();
      if (lane === "native") {
        await settle();
        const edited = PNG.sync.read(await output.screenshot({ path: join(run, "native-fluent-editor.png") }));
        let changed = 0;
        for (let y = 196; y < 666; y++) for (let x = 470; x < 900; x++) {
          const offset = (y * edited.width + x) * 4;
          if (board.data.subarray(offset, offset + 4).some((v, i) => v !== edited.data[offset + i])) changed++;
        }
        assert.ok(changed > 20000, `Editor layer changed output pixels: ${changed}`);
        record.changedFluentEditorPixels = changed;
      }
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.locator("#fluent-editor").waitFor({ state: "detached", timeout: 4000 });
      // A Fluent menu opens in the adapter's overlay host, outside every layer.
      await page.getByRole("button", { name: "Actions for Validated release notes", exact: true }).click();
      await page.getByRole("menu").waitFor();
      assert.equal(await page.evaluate(() => !!document.querySelector(".stage .overlay [data-portal-node] [role=menu]")), true);
      await page.getByRole("menuitem", { name: "Move to Shipped" }).click();
      await springTo("fluent-item-6", 456, 86);
      // A pointer drag to the end of the next lane; pausing before release means no fling.
      const grip = await page.getByRole("button", { name: "Move Keyboard moves between lanes", exact: true }).boundingBox();
      assert.ok(grip);
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      for (let step = 1; step <= 12; step++) {
        await page.mouse.move(grip.x + grip.width / 2 + step * 19, grip.y + grip.height / 2 + step * 172 / 12);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(200);
      await page.mouse.up();
      await springTo("fluent-item-4", 228, 172);
      record.fluent.afterMoves = await fluentMode("after moves");
      // Native hits follow the moved card: its original menu button is under its new position.
      const menu = page.getByRole("button", { name: "Actions for Validated release notes", exact: true });
      const menuBox = await menu.boundingBox();
      assert.ok(menuBox);
      assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"),
        [menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2]), "Actions for Validated release notes");
      await page.mouse.click(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
      await page.getByRole("menu").waitFor();
      await page.keyboard.press("Escape");
      // Archiving burns the live card; meanwhile its content is inert and its own box catches clicks.
      const archived = page.locator("#fluent-item-5");
      await page.getByRole("button", { name: "Actions for Reduced-motion audit", exact: true }).click();
      await page.getByRole("menuitem", { name: "Archive" }).click();
      if (lane === "native") {
        await page.waitForFunction(() => window.showcase.state().runtimeResources.transitionEffects === 1, null, { timeout: 2000 });
        // Measured now, in view: opening the menu may have scrolled the page.
        assert.equal(await archived.evaluate(node => {
          node.scrollIntoView({ block: "center" });
          const box = node.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.id;
        }), "fluent-item-5");
        record.fluent.burning = await fluentMode("burning");
      }
      await archived.waitFor({ state: "detached", timeout: 6000 });
      // Releasing goes through a Fluent dialog in the overlay host; the shipped cards warp into the poster.
      await page.getByRole("button", { name: "Release…", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      assert.equal(await page.evaluate(() => !!document.querySelector(".stage .overlay [data-portal-node] [role=dialog]")), true);
      await page.getByRole("button", { name: "Release", exact: true }).click();
      await page.locator("#showcase-art").filter({ hasText: "2 released" }).first().waitFor({ timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector("[id='fluent-item-2'], [id='fluent-item-6']"));
      await quiet();
      record.fluent.released = await fluentMode("released");
      // GPU or CSS?: every comparison keeps the lane's mode. The colour map is the shader's work: the Underglass
      // pane is the raw grey capture in DOM and coloured on the GPU, frozen while paused and fresh while running.
      await page.locator('.example-card[href$="/examples/compare"]').click();
      const comparisonInputs = page.locator(".stage input[name=compare-scene]");
      await comparisonInputs.first().waitFor();
      const comparisons = await comparisonInputs.evaluateAll(inputs => inputs.map(input => input.value));
      assert.deepEqual(comparisons, ["glow", "ripple", "split", "burn", "cells", "glass"]);
      record.compare = {};
      // Both sides keep animating here: settle() finishes once the paint it waited for completes, even though the
      // CSS pane requests a new one every frame.
      for (const id of comparisons) {
        await page.locator(`.stage input[name=compare-scene][value=${id}]`).check();
        await settle();
        const current = await state();
        assert.equal(current.mode, lane === "native" ? "gpu" : "dom", `compare ${id}: ${current.reason}`);
        record.compare[id] = { mode: current.mode, decorativeEffects: current.runtimeResources.decorativeEffects };
      }
      await page.locator(".stage input[name=compare-scene][value=cells]").check();
      // Native hits: the centre of a comparison chip is its (transparent) original radio input.
      assert.equal(await page.locator(".stage input[name=compare-scene][value=glow]").evaluate(input => {
        const box = input.getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === input;
      }), true);
      // The Underglass heat map, inside the right pane (stage x 716..1003, y 112..567): mean channel spread and a copy.
      const heatMap = async name => {
        await settle();
        const image = PNG.sync.read(await page.locator(".stage").screenshot({ path: join(run, `${lane}-compare-${name}.png`) }));
        const pixels = [];
        let spread = 0;
        for (let y = 112; y < 567; y += 2) for (let x = 716; x < 1003; x += 2) {
          const index = (y * image.width + x) * 4, [r, g, b] = image.data.subarray(index, index + 3);
          spread += Math.max(r, g, b) - Math.min(r, g, b);
          pixels.push(r, g, b);
        }
        return { spread: spread / (pixels.length / 3), pixels };
      };
      const changed = (a, b) => a.pixels.filter((value, index) => Math.abs(value - b.pixels[index]) > 8).length;
      await page.locator(".stage input[name=compare-run][value=none]").check();
      const pausedA = await heatMap("paused-a");
      await page.waitForTimeout(500);
      const pausedB = await heatMap("paused-b");
      record.compare.heatMap = { spread: pausedA.spread, pausedChanged: changed(pausedA, pausedB) };
      assert.equal(record.compare.heatMap.pausedChanged, 0);
      if (lane === "native") {
        assert.ok(pausedA.spread > 40, `colour map applied: ${pausedA.spread}`);
        await page.locator(".stage input[name=compare-run][value=gpu]").check();
        const runningA = await heatMap("running-a");
        await page.waitForTimeout(700);
        const runningB = await heatMap("running-b");
        record.compare.heatMap.runningChanged = changed(runningA, runningB);
        assert.ok(record.compare.heatMap.runningChanged > 100, `running colour map is fresh: ${record.compare.heatMap.runningChanged}`);
        assert.equal((await state()).mode, "gpu");
      } else assert.ok(pausedA.spread < 12, `DOM shows the grey capture: ${pausedA.spread}`);
      await page.locator(".stage input[name=compare-run][value=both]").check();
      // Measure times idle, CSS only and (GPU only) Underglass only, then restores the Animate choice.
      await page.locator(".stage .meter-head button").click();
      await page.waitForFunction(() => document.querySelector(".stage .meter-head button")?.textContent === "Measure both", null, { timeout: 15000 });
      const result = (await page.locator(".stage .meter-result").innerText()).match(/idle ([\d.]+), CSS ([\d.]+)(?:, Underglass ([\d.]+))? ms/);
      assert.ok(result, "measurement shown");
      record.compare.measured = { idle: Number(result[1]), css: Number(result[2]), underglass: result[3] && Number(result[3]) };
      assert.ok(record.compare.measured.css > record.compare.measured.idle, `CSS heat map costs more than idle: ${JSON.stringify(record.compare.measured)}`);
      assert.equal(record.compare.measured.underglass !== undefined, lane === "native");
      if (lane === "dom") await page.locator("#compare-work").getByText("needs GPU mode").waitFor();
      assert.equal(await page.locator(".stage input[name=compare-run]:checked").getAttribute("value"), "both");
      assert.equal((await state()).mode, lane === "native" ? "gpu" : "dom");
      // GPU admits while app code changes a layer every frame: the ripple's CSS side moves an SVG filter from
      // requestAnimationFrame. This used to time out with "Native refresh did not settle".
      if (lane === "native") {
        await page.getByRole("button", { name: "Use ordinary DOM", exact: true }).click();
        await page.waitForFunction(() => window.showcase.state().mode === "dom");
        await page.locator(".stage input[name=compare-scene][value=ripple]").check();
        await page.locator(".stage").scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
        await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting");
        record.compare.enableWhileAnimating = await state();
        assert.equal(record.compare.enableWhileAnimating.mode, "gpu", record.compare.enableWhileAnimating.reason);
        assert.ok(record.compare.enableWhileAnimating.metrics.gpuFrames > 0);
      }
      record.beforeDispose = await state();
      assert.equal(record.beforeDispose.mode, lane === "native" ? "gpu" : "dom", record.beforeDispose.reason);
      // Explicit dispose must retire every GPU and runtime resource.
      await page.getByRole("button", { name: "Dispose example", exact: true }).click();
      await page.getByText("The example is disposed. Reload this page to start a fresh session.").waitFor();
      record.disposed = await state();
      assert.ok(Object.values(record.disposed.resources).every(value => value === 0));
      assert.ok(Object.values(record.disposed.runtimeResources).every(value => value === 0));
      // Deep links: opening `examples/effects` and reloading must show that example in DOM mode (GPU is opt-in).
      // An old `#/effects` link opens the same page and moves to its path.
      await page.goto("about:blank");
      await page.goto(`${url}#/effects`);
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal(await page.evaluate(() => location.pathname + location.hash), "/underglass/examples/effects");
      await page.goto("about:blank");
      await page.goto(`${url}examples/effects`);
      await studioButton("Apply chromatic effect").waitFor();
      await page.reload();
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal((await state()).mode, "dom");
      await page.locator('a[href="#about"]').click();
      assert.equal(await page.locator(".example-card[aria-current]").getAttribute("href"), "/underglass/examples/effects");
      await page.locator('a[href$="/examples/motion"].example-card').focus();
      await page.keyboard.press("Enter");
      await studioButton("Play layer journey").waitFor();
      // The studio's own picker switches examples in place, through the same hash route.
      assert.equal(await page.getByLabel("Example", { exact: true }).inputValue(), "motion");
      await page.getByLabel("Example", { exact: true }).selectOption("effects");
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal(await page.evaluate(() => location.pathname), "/underglass/examples/effects");
      assert.equal(await page.locator(".example-card[aria-current]").getAttribute("href"), "/underglass/examples/effects");
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(run, `${lane}-desktop.png`) });
      // Mobile viewport: no horizontal overflow and a single site header.
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobile = await mobileContext.newPage();
      await mobile.goto(`${url}examples/motion`);
      await mobile.waitForFunction(() => window.showcase);
      await mobile.waitForTimeout(300);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      record.mobile = await mobile.evaluate(() => ({ headers: document.querySelectorAll(".site-header").length,
        viewport: innerWidth, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      assert.equal(record.mobile.headers, 1);
      await mobile.screenshot({ path: join(run, `${lane}-mobile-viewport.png`) });
      await mobile.locator("#studio").scrollIntoViewIfNeeded();
      await mobile.waitForTimeout(300);
      await mobile.screenshot({ path: join(run, `${lane}-mobile-studio.png`) });
      await mobileContext.close();
      // Strata gallery, opened directly: its components render in the runtime's first, synchronous render, so
      // `useStrataGpu` must attach after the mount returns. Real keys and clicks drive the original controls.
      const strataContext = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
      const strata = await strataContext.newPage();
      strata.on("pageerror", error => errors.push(String(error)));
      await strata.goto(`${url}examples/strata`);
      await strata.waitForFunction(() => window.showcase && window.strataShowcase);
      await strata.locator(".stage").scrollIntoViewIfNeeded();
      const strataMode = async label => {
        const current = await strata.evaluate(() => window.showcase.state());
        assert.equal(current.mode, lane === "native" ? "gpu" : "dom", `strata ${label}: ${current.reason}`);
        return current;
      };
      const strataSettle = async () => { await strata.evaluate(() => window.showcase.controller.settle()); await strata.waitForTimeout(250); };
      if (lane === "native") {
        await strata.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
        await strata.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting");
      }
      record.strata = { initial: await strataMode("opened") };
      // On the GPU both panels are in face mode with a Relief scene; in ordinary DOM CSS keeps the relief.
      await strata.waitForFunction(native => [...document.querySelectorAll("#strata-bar, #strata-gallery")]
        .every(panel => (panel.getAttribute("data-strata-mode") === "face") === native), lane === "native");
      if (lane === "native") assert.equal(await strata.evaluate(() => window.strataShowcase.scene(document.getElementById("strata-gallery"))?.version), 1);
      // Tabs follow the arrow keys; the Inputs tab's field validates as it is typed in.
      await strata.getByRole("tab", { name: "Actions", exact: true }).focus();
      await strata.keyboard.press("ArrowRight");
      assert.equal(await strata.getByRole("tab", { name: "Inputs", exact: true }).getAttribute("aria-selected"), "true");
      await strata.getByText("Error: enter an address like name@example.com.").waitFor();
      await strata.locator("#strata-email").fill("ada@example.com");
      await strata.getByText("Error: enter an address like name@example.com.").waitFor({ state: "detached" });
      // A real click at Save's centre lands on the original button.
      await strata.getByRole("tab", { name: "Actions", exact: true }).click();
      await strataSettle();
      const strataSave = await strata.locator("#strata-save").boundingBox();
      assert.ok(strataSave);
      const saveCentre = [strataSave.x + strataSave.width / 2, strataSave.y + strataSave.height / 2];
      assert.equal(await strata.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.id, saveCentre), "strata-save");
      await strata.mouse.click(...saveCentre);
      await strata.locator("#strata-saves").filter({ hasText: "Saved 1 time" }).waitFor();
      await strataMode("after save");
      // The Structure tab (Tier C): a real click on Drafts in the NavigationRail lands on the original link and moves the
      // current destination.
      await strata.getByRole("tab", { name: "Structure", exact: true }).click();
      await strataSettle();
      const drafts = strata.getByRole("link", { name: "Drafts", exact: true });
      const draftsBox = await drafts.boundingBox();
      assert.ok(draftsBox);
      await strata.mouse.click(draftsBox.x + draftsBox.width / 2, draftsBox.y + draftsBox.height / 2);
      assert.equal(await drafts.getAttribute("aria-current"), "page");
      await strataMode("structure");
      await strata.getByRole("tab", { name: "Actions", exact: true }).click();
      await strataSettle();
      // The Objects level: the panel takes a version 2 scene, and the presented pixels change.
      const strataOutput = strata.locator(".stage .output");
      let strataRelief;
      if (lane === "native") strataRelief = PNG.sync.read(await strataOutput.screenshot({ path: join(run, "native-strata-relief.png") }));
      await strata.getByRole("button", { name: "Objects", exact: true }).click();
      assert.equal(await strata.evaluate(() => window.showcase.controller.container.getAttribute("data-strata-level")), "objects");
      await strataSettle();
      if (lane === "native") {
        await strata.waitForFunction(() => window.strataShowcase.scene(document.getElementById("strata-gallery"))?.version === 2);
        const strataObjects = PNG.sync.read(await strataOutput.screenshot({ path: join(run, "native-strata-objects.png") }));
        let changed = 0;
        for (let offset = 0; offset < strataObjects.data.length; offset += 4) {
          if (strataRelief.data.subarray(offset, offset + 4).some((value, index) => value !== strataObjects.data[offset + index])) changed++;
        }
        assert.ok(changed > 1000, `Objects level changed presented pixels: ${changed}`);
        record.strata.changedObjectsPixels = changed;
      }
      await strataMode("objects");
      // The Scene level adds Strata's lit backdrop, and Celebrate bursts confetti over the UI. With the dialog below, this is
      // the most the gallery captures (the showcase raises the pixel budget for it).
      await strata.getByRole("button", { name: "Scene", exact: true }).click();
      if (lane === "native") {
        await strata.waitForFunction(() => window.showcase.state().layers.some(layer => layer.id === "strata-backdrop"));
        await strata.getByRole("button", { name: "Celebrate", exact: true }).click();
        await strata.waitForFunction(() => window.showcase.state().layers.some(layer => layer.id === "strata-particles"));
      }
      record.strata.scene = await strataMode("scene");
      // The Dialog renders into the root as a panel of its own; Escape closes it and focus returns.
      await strata.getByRole("tab", { name: "Feedback", exact: true }).click();
      const openDialog = strata.getByRole("button", { name: "Open dialog", exact: true });
      await openDialog.click();
      const strataDialog = strata.getByRole("dialog", { name: "Discard changes?" });
      await strataDialog.waitFor();
      assert.equal(await strata.evaluate(() => document.getElementById("strata-dialog").parentElement === window.showcase.controller.container), true);
      if (lane === "native") await strata.waitForFunction(() => document.getElementById("strata-dialog").getAttribute("data-strata-mode") === "face");
      record.strata.dialog = await strataMode("dialog open");
      await strata.keyboard.press("Escape");
      await strataDialog.waitFor({ state: "detached" });
      assert.equal(await openDialog.evaluate(node => node === document.activeElement), true);
      // The Drawer closes on a click outside it.
      await strata.getByRole("button", { name: "Open drawer", exact: true }).click();
      const strataDrawer = strata.getByRole("dialog", { name: "Filters" });
      await strataDrawer.waitFor();
      await strataSettle();
      const stageBox = await strata.locator(".stage").boundingBox();
      await strata.mouse.click(stageBox.x + 120, stageBox.y + 400);
      await strataDrawer.waitFor({ state: "detached" });
      // A toast lives in the top layer, outside the stage, and leaves the panels on the GPU.
      await strata.getByRole("button", { name: "Show a toast", exact: true }).click();
      await strata.locator(".ug-toast").filter({ hasText: "Message sent." }).waitFor();
      assert.equal(await strata.evaluate(() => !document.querySelector(".stage").contains(document.querySelector(".ug-toast-region"))), true);
      record.strata.final = await strataMode("after overlays");
      if (lane === "native") await strataOutput.screenshot({ path: join(run, "native-strata-feedback.png") });
      await strataContext.close();
      // With `navigator.gpu` hidden, enabling GPU must fall back to DOM with a GPU reason and keep the user's input.
      if (lane === "dom") {
        const unsupported = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
        await unsupported.addInitScript(() => Object.defineProperty(navigator, "gpu", { get: () => undefined }));
        const fallback = await unsupported.newPage();
        await fallback.goto(url);
        await fallback.waitForFunction(() => window.showcase);
        await fallback.locator("#studio-title").fill("Retained fallback");
        await fallback.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
        await fallback.waitForFunction(() => !window.showcase.state().initializing);
        record.syntheticUnsupported = await fallback.evaluate(() => window.showcase.state());
        assert.equal(record.syntheticUnsupported.mode, "dom");
        assert.match(record.syntheticUnsupported.reason, /WebGPU|GPU/i);
        assert.equal(await fallback.locator("#studio-title").inputValue(), "Retained fallback");
        await unsupported.close();
      }
      assert.deepEqual(errors, []);
      record.status = "passed";
    } finally { await browser.close(); record.closed = true; }
  }
  // The showcase must also build with a root base path; only the built asset URLs are checked.
  await command([vite, "build", "--base", "/", "--outDir", "root-dist"], site, "showcase-root-build");
  assert.match(await readFile(join(site, "root-dist/index.html"), "utf8"), /"\/assets\//);
  result.status = "passed";
} catch (error) {
  result.status = "failed"; result.error = String(error); process.exitCode = 1;
  console.error(error);
} finally {
  // Always stop the preview server and save its log; then re-hash the inputs.
  if (server) { server.kill("SIGTERM"); await serverClosed; result.preview.closed = true; }
  await writeFile(join(run, "preview.log"), serverOutput, { flag: "wx" });
  result.inputsUnchanged = true;
  for (const input of inputs) if (sha(await readFile(join(root, input.path))) !== input.sha256) result.inputsUnchanged = false;
  if (!result.inputsUnchanged) { result.status = "failed"; process.exitCode = 1; }
  await writeFile(join(run, "result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(`Showcase: ${result.status}; ${run}`);
}
