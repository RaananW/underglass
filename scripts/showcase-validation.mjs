/**
 * End-to-end validation of the public showcase (`examples/showcase`) as it would be published: builds it in
 * an isolated copy of the repository, checks the output files, serves the build under the `/underglass/`
 * base path and drives the gallery in a real browser in a DOM lane and a native (GPU) lane, then runs the
 * opt-in polyfill (`src/polyfill.ts`) in a polyfill lane with HTML-in-Canvas switched off.
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
/** The `sessionStorage` key where the showcase records a visitor's press of **DOM** (`src/main.tsx`). */
/** A half of an example page's presentation switch: `"GPU"` or `"DOM"`. */
const modeButton = (page, name) => page.locator(".mode-switch").getByRole("button", { name, exact: true });
const domChoiceKey = "underglass-showcase-dom";
/**
 * Waits for the showcase's automatic start (GPU mode on its own once the stage is in view) to finish: the startup
 * reason is gone and admission has settled. Asserts GPU, with the runtime's reason as the message.
 */
async function autoAdmission(page) {
  await page.waitForFunction(() => { const state = window.showcase.state();
    return !state.initializing && state.mode !== "admitting" && !/^Ordinary DOM startup/.test(state.reason); }, null, { timeout: 60000 });
  const state = await page.evaluate(() => window.showcase.state());
  assert.equal(state.mode, "gpu", `automatic start: ${state.reason}`);
  return state;
}
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
      if (entry.isDirectory()) { assert.ok(name === "assets" || name === "examples" || name === "thumbs", name); await checkAssets(path, `${name}/`); }
      else {
        // The pages and site files `seo.ts` writes, the icons and social card, hashed JS/CSS and the JPEG
        // previews of GPU mode shown to browsers that cannot run it.
        assert.ok(/^(?:(?:index|examples|404)\.html|robots\.txt|sitemap\.xml|favicon\.svg|og\.jpg|apple-touch-icon\.png|examples\/[\w-]+\.html|thumbs\/[\w-]+\.jpg|assets\/[\w.-]+\.(?:js|css|jpg))$/.test(name),
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
  // The examples' index is served with and without a trailing slash.
  for (const path of ["examples", "examples/"]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /<link rel="canonical" href="https:\/\/underglass\.dev\/examples">/, path);
  }
  for (const file of ["sitemap.xml", "robots.txt", "favicon.svg", "og.jpg", "apple-touch-icon.png"]) assert.equal((await fetch(`${url}${file}`)).status, 200, file);
  // Every script and stylesheet the page references must be served.
  for (const asset of html.matchAll(/(?:src|href)="(\/underglass\/assets\/[^"]+)"/g)) {
    assert.equal((await fetch(`http://127.0.0.1:${port}${asset[1]}`)).status, 200);
  }
  // The home page. Its content and its stylesheet are in the served HTML, inside prerendered Underglass hosts, with
  // the head a search engine and a social card need. As ordinary DOM it is a flowing page whose controls
  // work and which fits a desktop and a phone; where the deck cannot run, the Underglass runtime is never requested.
  // With GPU presentation it is a deck with a different change between each two sections, some of them shader effects
  // on the live layers: starting it changes no pixel of the stage, the stage stays in the window, the scroll position
  // changes the section on it, pixels are fresh, native hits land where a layer is drawn, and scrolling through a
  // change captures nothing.
  {
    const sectionIds = ["cover", "dom", "transitions", "motion", "shaders", "depth", "everywhere", "start"];
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const served = await response.text();
    assert.match(served, /<meta name="robots" content="index, follow, max-image-preview:large">/);
    assert.match(served, /<link rel="canonical" href="https:\/\/underglass\.dev\/">/);
    assert.match(served, /<meta property="og:image" content="https:\/\/underglass\.dev\/og\.jpg">/);
    assert.match(served, /"@type":"SoftwareSourceCode"/);
    assert.match(served, /<h1 id="cover-title">Real React controls\./);
    for (const id of sectionIds) assert.match(served, new RegExp(`<section class="slide-text slide-${id}" id="${id}"`), id);
    for (const host of ["output", "ordinary", "overlay"]) assert.match(served, new RegExp(`data-underglass-host="${host}"`), host);
    assert.match(served, /href="\/underglass\/examples\/instrument"/);
    assert.match(served, /<div id="backdrop" class="backdrop" aria-hidden="true">/);
    assert.match(served, /<figure class="specimen second unseen" id="transitions-second"/);
    // The first frame needs the HTML alone: the stylesheet is in it, and the one script it names only decides what to load.
    assert.doesNotMatch(served, /<link rel="stylesheet"/);
    assert.match(served, /<style>[^<]*--ground:/);
    const entry = /<script type="module" crossorigin src="(\/underglass\/assets\/[^"]+\.js)">/.exec(served);
    assert.ok(entry, "the page names its entry script");
    assert.ok((await (await fetch(`http://127.0.0.1:${port}${entry[1]}`)).text()).length < 4000, "the entry script is small");
    const sitemap = await (await fetch(`${url}sitemap.xml`)).text();
    for (const page of ["", "examples", "examples/instrument"]) assert.ok(sitemap.includes(`<loc>https://underglass.dev/${page}</loc>`), `the sitemap lists /${page}`);
    // Chrome's warning about a WebGPU option on Windows is not the page's.
    const watch = page => {
      const problems = [];
      page.on("pageerror", error => problems.push(`pageerror: ${error.message}`));
      page.on("console", message => { if ((message.type() === "error" || message.type() === "warning") && !/powerPreference option is currently ignored/.test(message.text())) problems.push(`${message.type()}: ${message.text()}`); });
      return problems;
    };
    const browser = await chromium.launch(browserLaunchOptions({ native: true }));
    try {
      const still = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 800 } });
      const stillPage = await still.newPage();
      await stillPage.goto(url);
      assert.equal(await stillPage.locator("h1").innerText(), "Real React controls.\nPainted by the GPU.");
      assert.equal(await stillPage.locator("main section").count(), 8);
      assert.equal(await stillPage.locator("#transitions").evaluate(node => node.getBoundingClientRect().height > 200), true, "without JavaScript the sections are laid out");
      await stillPage.screenshot({ path: join(run, "next-no-javascript.png") });
      await still.close();

      // Ordinary DOM: the visitor's choice is recorded, as the readout's switch does, so the deck does not start.
      for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 780 }]]) {
        const context = await browser.newContext({ viewport });
        await context.addInitScript(() => { try { sessionStorage.setItem("underglass-deck", "off"); } catch { /* opaque origin */ } });
        const page = await context.newPage();
        const problems = watch(page);
        await page.goto(url);
        await page.waitForFunction(() => window.homeDeck);
        await page.getByLabel("Name").fill("Grace");
        await page.getByRole("button", { name: "Press" }).click();
        assert.equal(await page.locator('.live-row [role="status"]').innerText(), "Hello, Grace. Pressed 1 time.");
        assert.equal(await page.getByLabel("Level").evaluate(input => input.closest("label").querySelector("output").textContent), "60");
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${name}: sideways scroll`);
        assert.equal(await page.evaluate(() => window.homeDeck.state().mode), "dom", `${name}: ordinary DOM`);
        assert.equal(await page.evaluate(() => document.documentElement.classList.contains("deck")), false, `${name}: the flow`);
        if (name === "desktop") {
          // The sections follow each other down the page, each in a row at least a window tall (a section is centred in
          // its row, so their tops are about a window apart), and the side scale marks the one in view.
          const tops = await page.evaluate(ids => ids.map(id => document.getElementById(id).getBoundingClientRect().top + scrollY), sectionIds);
          for (let index = 1; index < tops.length; index++) assert.ok(tops[index] - tops[index - 1] >= 600, `section ${sectionIds[index]} follows about a window below the one before`);
          assert.ok(tops.at(-1) >= 7 * 800 - 400, "the page is at least a window tall per section");
          await page.locator("#shaders").scrollIntoViewIfNeeded();
          await page.locator('.rail a[href="#shaders"][aria-current]').waitFor({ state: "attached" });
          assert.equal(await page.locator("#deck-switch").getAttribute("aria-pressed"), "false");
          // The background's rings travel down the page with the scroll position.
          await page.waitForFunction(() => Number(document.getElementById("backdrop").style.getPropertyValue("--travel")) > 0.3);
        }
        await page.screenshot({ path: join(run, `next-${name}.png`), fullPage: true });
        assert.deepEqual(problems, [], `${name}: the preview page reported problems`);
        await context.close();
      }

      // Where the deck cannot run, in a browser without the APIs, React alone hydrates the page and the Underglass runtime
      // is never requested. The whole page's scripts are then about a third of what the deck loads.
      const withoutApis = await chromium.launch(browserLaunchOptions({ native: false }));
      try {
        for (const [name, from, options] of [["no APIs", withoutApis, { viewport: { width: 1440, height: 900 } }],
          ["no APIs, phone", withoutApis, { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }]]) {
          const context = await from.newContext(options);
          const page = await context.newPage();
          const problems = watch(page);
          const scripts = [];
          page.on("response", response => { if (/\/assets\/[^/]+\.js$/.test(response.url())) scripts.push(response.body().then(body => body.length)); });
          await page.goto(url);
          await page.getByRole("button", { name: "Press" }).click();
          await page.locator('.live-row [role="status"]').filter({ hasText: "Pressed 1 time." }).waitFor();
          await page.getByLabel("Name").fill("Grace");
          assert.equal(await page.locator('.live-row [role="status"]').innerText(), "Hello, Grace. Pressed 1 time.");
          assert.equal(await page.evaluate(() => "homeDeck" in window), false, `${name}: the deck's driver is not loaded`);
          const bytes = (await Promise.all(scripts)).reduce((sum, size) => sum + size, 0);
          assert.ok(bytes > 100_000 && bytes < 400_000, `${name}: ${bytes} bytes of script (React and the page, not the runtime)`);
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${name}: sideways scroll`);
          if (name === "no APIs, phone") {
            // In one column the demonstration's controls lie above its panels, with ids of their own; the ones in the text are not shown.
            assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.getElementById("transitions-controls")).display !== "none", document.getElementById("demo-scrub").offsetParent === null,
              getComputedStyle(document.getElementById("cover-figure")).display !== "none"]), [true, true, true]);
            await page.locator("#demo-scrub-bar").fill("60");
            assert.deepEqual(await page.evaluate(() => ["transitions-figure", "transitions-second"].map(id => getComputedStyle(document.getElementById(id)).visibility)), ["hidden", "visible"]);
            await page.locator("#demo-scrub-bar").fill("0");
          }
          if (name === "no APIs") {
            // Where there are two columns the parts that are layers in one column only are not shown.
            assert.deepEqual(await page.evaluate(() => ["transitions-controls", "cover-figure"].map(id => getComputedStyle(document.getElementById(id)).display)), ["none", "none"]);
            // The live demonstration without the GPU: the panels swap at the middle of the slider, and their clocks count.
            await page.locator("#demo-scrub").fill("60");
            assert.deepEqual(await page.evaluate(() => ["transitions-figure", "transitions-second"].map(id => getComputedStyle(document.getElementById(id)).visibility)), ["hidden", "visible"]);
            assert.equal(await page.getByRole("button", { name: "burn", exact: true }).isDisabled(), true);
            await page.waitForFunction(() => document.querySelector("#transitions-second [data-demo-clock]").textContent !== "00:00.0");
            await page.locator("#demo-scrub").fill("0");
            assert.deepEqual(await page.evaluate(() => ["transitions-figure", "transitions-second"].map(id => getComputedStyle(document.getElementById(id)).visibility)), ["visible", "hidden"]);
            assert.equal(await page.locator("#deck-note").textContent(), "GPU presentation needs Chrome or Edge 157 or later. This is the same page as ordinary DOM.");
            assert.equal(await page.locator("#deck-switch").isDisabled(), true);
            await page.locator("#shaders").scrollIntoViewIfNeeded();
            await page.locator('.rail a[href="#shaders"][aria-current]').waitFor({ state: "attached" });
          }
          assert.deepEqual(problems, [], `${name}: the preview page reported problems`);
          await context.close();
        }
      } finally { await withoutApis.close(); }

      // GPU presentation: the deck.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const problems = watch(page);
      await page.goto(url);
      // The elements the page was served with, before the deck moves them into the canvas.
      await page.evaluate(() => { window.servedPress = document.querySelector(".live-row button"); });
      await page.waitForFunction(() => window.homeDeck?.state().mode === "gpu", null, { timeout: 30_000 });
      await page.evaluate(() => window.homeDeck.idle());
      const snapshot = () => page.evaluate(() => {
        const state = window.homeDeck.state();
        // The light under the sections is a layer with an effect of its own for as long as the deck is on: counted apart.
        return { mode: state.mode, reason: state.reason, layers: state.layers.map(layer => layer.id).filter(id => id !== "deck-light"), captures: state.metrics.captures,
          light: state.layers.some(layer => layer.id === "deck-light"),
          lamp: state.decorativeEffects.find(effect => effect.id === "deck-light")?.effects[0]?.parameters.lamp ?? null,
          perLayer: Object.fromEntries(Object.entries(state.metrics.perLayer).map(([id, layer]) => [id, layer.captures])),
          place: window.homeDeck.place(), deck: document.documentElement.classList.contains("deck"), errors: [...window.homeDeck.errors],
          effects: state.decorativeEffects.filter(effect => effect.id !== "deck-light").map(effect => `${effect.id}:${effect.effects.map(item => item.kind).join("+")}`),
          change: document.getElementById("deck-change").hidden ? null : document.getElementById("deck-change").textContent,
          canvasShown: !document.querySelector('[data-underglass-host="output"]').hidden, scrollY };
      });
      const go = index => page.evaluate(value => window.homeDeck.go(value), index);
      /** Scrolls to `position` sections down the track (1.5 is half way from the second section to the third). */
      const scrub = position => page.evaluate(value => { scrollTo({ top: value * innerHeight, behavior: "instant" }); return window.homeDeck.idle(); }, position);
      const status = () => page.locator('.live-row [role="status"]').innerText();

      // The changes' shaders are compiled ahead of use, on a layer of their own that is gone again afterwards.
      await page.evaluate(() => window.homeDeck.warmed().then(() => window.homeDeck.idle()));
      assert.ok(await page.evaluate(() => window.homeDeck.state().metrics.effectShaderCompilations) >= 5, "the custom effects are compiled before their first use");
      // It starts by itself, as the deck, with only the cover enrolled.
      let state = await snapshot();
      assert.deepEqual({ mode: state.mode, deck: state.deck, layers: state.layers, from: state.place.from, canvasShown: state.canvasShown, light: state.light },
        { mode: "gpu", deck: true, layers: ["cover"], from: 0, canvasShown: true, light: true }, state.reason);
      assert.equal(await page.locator("#deck-switch").getAttribute("aria-pressed"), "true");
      // The readout is filled twice a second: it counted the shader layer too until a moment ago.
      await page.locator("#deck-layers").filter({ hasText: /^2$/ }).waitFor();

      // The light under the sections follows the pointer: with the pointer on the stage the lamp comes on and the
      // background under it is brighter; with the pointer off the stage it goes out, and the stage is as it was.
      const spot = { x: 700, y: 800, width: 120, height: 60 };
      const brightness = async () => { const image = PNG.sync.read(await page.screenshot({ clip: spot })); let sum = 0; for (let offset = 0; offset < image.data.length; offset += 4) sum += image.data[offset] + image.data[offset + 1] + image.data[offset + 2]; return sum / (image.data.length / 4) / 3; };
      await page.mouse.move(30, 880);
      await page.waitForFunction(() => window.homeDeck.state().decorativeEffects.some(effect => effect.id === "deck-light"));
      const dark = await brightness();
      await page.mouse.move(760, 830, { steps: 6 });
      await page.waitForFunction(() => window.homeDeck.state().decorativeEffects.find(effect => effect.id === "deck-light")?.effects[0]?.parameters.lamp === 1);
      await page.evaluate(() => window.homeDeck.idle());
      const lit = await brightness();
      assert.ok(lit - dark > 6, `the lamp lights the background under the pointer (${dark.toFixed(1)} to ${lit.toFixed(1)})`);
      await page.mouse.move(30, 880);
      await page.waitForFunction(() => window.homeDeck.state().decorativeEffects.find(effect => effect.id === "deck-light")?.effects[0]?.parameters.lamp === 0);
      await page.evaluate(() => window.homeDeck.idle());
      assert.ok(Math.abs(await brightness() - dark) < 0.5, "the lamp is out with the pointer off the stage");
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById("pin")).position), "sticky");
      await page.screenshot({ path: join(run, "next-deck-cover.png") });

      // Into the first change, the burn: every layer on stage carries its effect chain and the readout names the
      // change. At the next rest the chains are gone, and the controls take input again (the click below).
      await scrub(0.5);
      state = await snapshot();
      assert.deepEqual([state.mode, state.effects, state.change, state.errors], ["gpu", ["cover:custom", "dom:custom", "dom-figure:custom"], "burn", []]);
      await page.screenshot({ path: join(run, "next-deck-burn.png") });

      // When a change ends, the section that left must not show again. The GPU still draws its layers for a frame or
      // more after they leave the stage, until the stage without them is ready, and they have to stay hidden for that
      // long. So every frame the browser presents is recorded while the page scrolls through a change: once the stage
      // shows the arriving section as it rests, no later frame may differ from that.
      const cast = await context.newCDPSession(page);
      const stageOf = image => { const part = new PNG({ width: 1350, height: 810 }); PNG.bitblt(image, part, 80, 80, 1350, 810, 0, 0); return part; };
      const apart = (a, b) => {
        let count = 0;
        for (let offset = 0; offset < a.data.length; offset += 4) if ([0, 1, 2].some(channel => Math.abs(a.data[offset + channel] - b.data[offset + channel]) > 40)) count++;
        return count / (a.width * a.height);
      };
      for (const [leaving, arriving] of [[0, 1], [1, 0], [1, 2]]) {
        await go(arriving);
        const rest = stageOf(PNG.sync.read(await page.screenshot()));
        await go(leaving);
        const frames = [];
        const onFrame = event => { frames.push(event.data); cast.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {}); };
        cast.on("Page.screencastFrame", onFrame);
        await cast.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 1440, maxHeight: 900 });
        await page.evaluate(async ([a, b]) => {
          for (let step = 0; step <= 45; step++) { scrollTo({ top: (a + (b - a) * step / 45) * innerHeight, behavior: "instant" }); await new Promise(resolve => requestAnimationFrame(resolve)); }
        }, [leaving, arriving]);
        await page.waitForTimeout(600);
        await cast.send("Page.stopScreencast");
        cast.off("Page.screencastFrame", onFrame);
        const distances = frames.map(data => apart(stageOf(PNG.sync.read(Buffer.from(data, "base64"))), rest));
        const arrived = distances.findIndex(distance => distance < 0.003);
        assert.ok(frames.length > 20 && arrived >= 0, `${leaving} to ${arriving}: ${frames.length} frames recorded, the change ended at frame ${arrived}`);
        const later = Math.max(0, ...distances.slice(arrived + 1));
        assert.ok(later < 0.003, `after the change from ${leaving} to ${arriving} a frame differs from the resting section in ${(later * 100).toFixed(2)}% of the stage: the section that left showed again`);
      }
      // When a change starts, a layer that rests hidden must not show. The third section has one, the second panel of
      // its demonstration, in the place of its specimen. The runtime holds the last complete frame while the arriving
      // layers are captured, so a pose written just before that is on screen for several frames. Every frame is
      // recorded while the page scrolls out of the section's rest: once the stage has left the look of its rest, it
      // may not come back to it, which is what a flash followed by the real start of the change looks like.
      {
        await go(2);
        const rest = stageOf(PNG.sync.read(await page.screenshot()));
        const frames = [];
        const onFrame = event => { frames.push(event.data); cast.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {}); };
        cast.on("Page.screencastFrame", onFrame);
        await cast.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 1440, maxHeight: 900 });
        await page.evaluate(async () => {
          const start = scrollY;
          for (let moved = 0; moved <= innerHeight * 0.3; moved += 6) { scrollTo({ top: start + moved, behavior: "instant" }); await new Promise(resolve => requestAnimationFrame(resolve)); }
        });
        await page.waitForTimeout(300);
        await cast.send("Page.stopScreencast");
        cast.off("Page.screencastFrame", onFrame);
        const distances = frames.map(data => apart(stageOf(PNG.sync.read(Buffer.from(data, "base64"))), rest));
        const left = distances.findIndex(distance => distance > 0.01);
        assert.ok(frames.length > 20 && left >= 0, `leaving the third section: ${frames.length} frames recorded, the change showed at frame ${left}`);
        const back = distances.slice(left + 1).findIndex(distance => distance < 0.002);
        assert.ok(back < 0, `leaving the third section, frame ${left} differs from the section at rest in ${(distances[left] * 100).toFixed(2)}% of the stage and frame ${left + 1 + back} does not: a hidden layer flashed before the change began`);
        await go(2);
      }
      await cast.detach();

      // The second section, at rest: its two layers. The controls are the served elements, the GPU draws what they
      // show now, and a real click lands on the button.
      await go(1);
      state = await snapshot();
      assert.deepEqual(state.layers, ["dom", "dom-figure"]);
      assert.deepEqual([state.effects, state.change], [[], null]);
      assert.equal(await page.evaluate(() => window.servedPress === document.querySelector(".live-row button")), true, "the served button is the one on stage");
      const statusBox = await page.locator('.live-row [role="status"]').boundingBox();
      const before = await page.screenshot({ clip: statusBox });
      await page.getByLabel("Name").fill("Grace");
      await page.getByRole("button", { name: "Press" }).click();
      assert.equal(await status(), "Hello, Grace. Pressed 1 time.");
      await page.evaluate(() => window.homeDeck.idle());
      assert.equal(before.equals(await page.screenshot({ clip: statusBox })), false, "the GPU drew the new text");
      // A parked section is not drawn and takes no hit, although it is stacked on the same place.
      assert.equal(await page.evaluate(() => { const box = document.querySelector(".live-row button").getBoundingClientRect();
        return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest("[data-section]")?.id; }), "dom-figure");
      await page.screenshot({ path: join(run, "next-deck-dom.png") });

      // Into the change to the third section: both sections are on stage, the leaving specimen is tilted, and a real
      // click still lands on its button where it is drawn.
      await page.evaluate(() => document.activeElement?.blur());
      await scrub(1.26);
      state = await snapshot();
      assert.deepEqual(state.layers, ["dom", "dom-figure", "transitions", "transitions-figure", "transitions-second"]);
      assert.equal(state.place.to, 2);
      const tilted = await page.evaluate(() => window.homeDeck.state().layers.find(layer => layer.id === "dom-figure").transform.tiltX);
      assert.ok(tilted > 2, `the leaving specimen is tilted (${tilted})`);
      await page.getByRole("button", { name: "Press" }).click();
      assert.equal(await status(), "Hello, Grace. Pressed 2 times.");
      await page.evaluate(() => document.activeElement?.blur());
      await page.screenshot({ path: join(run, "next-deck-change-early.png") });

      // Scrolling through the change, forwards and backwards and across its middle, captures nothing. (The pointer is
      // moved off the stage first: a control that passes under it changes its hover state, which is a repaint.)
      await page.mouse.move(30, 880);
      await scrub(1.3);
      const captures = (await snapshot()).perLayer;
      for (const position of [1.4, 1.5, 1.6, 1.7, 1.8, 1.6, 1.45, 1.3]) await scrub(position);
      state = await snapshot();
      assert.deepEqual(state.perLayer, captures, "scrolling through a change captured a layer");
      assert.deepEqual(state.errors, []);
      // (A screenshot hides the caret with a style of its own, which repaints the form: taken after the count.)
      await scrub(1.5);
      await page.screenshot({ path: join(run, "next-deck-change-middle.png") });
      // Past the middle the arriving section takes the pointer: the leaving one, unseen by now, is out of its way.
      await scrub(1.8);
      assert.equal(await page.evaluate(() => { const box = document.querySelector("#transitions h2").getBoundingClientRect();
        return document.elementFromPoint(box.x + 20, box.y + box.height / 2)?.closest("[data-section]")?.id; }), "transitions");

      // The live demonstration in the "Transitions" section: two panels in one place, each a layer of its own. At rest
      // the second is hidden. The slider scrubs the chosen change between them, both carrying its effect, and their
      // clocks count from the first use of the controls. At the end the second panel is the one shown, and its own
      // button takes a real click. Play runs the change back on the clock.
      await go(2);
      const panels = () => page.evaluate(() => {
        const layers = window.homeDeck.state().layers, shown = id => layers.find(layer => layer.id === id).transform.scaleX === 0.01 ? "hidden" : "shown";
        return [shown("transitions-figure"), shown("transitions-second")];
      });
      assert.deepEqual([(await snapshot()).layers, await panels()], [["transitions", "transitions-figure", "transitions-second"], ["shown", "hidden"]]);
      await page.getByRole("button", { name: "iris", exact: true }).click();
      await page.locator("#demo-scrub").fill("50");
      await page.evaluate(() => window.homeDeck.idle());
      state = await snapshot();
      assert.deepEqual([state.mode, state.effects, await panels(), state.errors], ["gpu", ["transitions-figure:custom+custom", "transitions-second:custom+custom"], ["shown", "shown"], []]);
      await page.waitForFunction(() => document.querySelector("#transitions-second [data-demo-clock]").textContent !== "00:00.0");
      await page.screenshot({ path: join(run, "next-deck-demo.png") });
      await page.getByRole("button", { name: "tilt", exact: true }).click();
      await page.evaluate(() => window.homeDeck.idle());
      assert.deepEqual([(await snapshot()).effects, await panels()], [[], ["shown", "shown"]], "another change, picked part way through, takes over");
      await page.locator("#demo-scrub").fill("100");
      await page.evaluate(() => window.homeDeck.idle());
      assert.deepEqual([(await snapshot()).effects, await panels()], [[], ["hidden", "shown"]]);
      await page.getByRole("button", { name: "Lap" }).click();
      assert.equal(await page.locator(".lap-row output").innerText(), "1 lap");
      await page.locator("#demo-play").click();
      await page.waitForFunction(() => document.getElementById("demo-scrub").value === "0");
      await page.evaluate(() => window.homeDeck.idle());
      assert.deepEqual([(await snapshot()).effects, await panels()], [[], ["shown", "hidden"]]);
      // Scrolling on part way through settles the demonstration: the next change runs with the panel that was nearer
      // showing and the other hidden, and the clocks stop.
      await page.locator("#demo-scrub").fill("40");
      await scrub(2.5);
      state = await snapshot();
      assert.deepEqual([state.mode, state.change, state.effects.length, await panels(), state.errors], ["gpu", "water", 4, ["shown", "hidden"], []]);
      const stopped = await page.locator("#transitions-second [data-demo-clock]").textContent();
      await page.waitForTimeout(350);
      assert.equal(await page.locator("#transitions-second [data-demo-clock]").textContent(), stopped, "the clocks stop when the section leaves its rest");
      await page.mouse.move(30, 880);

      // The change to the fifth section is a scan: a bar of light crosses the stage, with the arriving section above it
      // and the leaving one below. The mask is in stage coordinates and hides one section exactly where it shows the
      // other. The bar is also a glass rod, a displacement before the mask in each layer's chain, which magnifies the
      // page within 40 px of it and moves nothing further away: at the middle, the upper part of the stage is the
      // arriving section as it rests and the lower part the leaving one. Scrolling through it captures nothing either.
      const region = async (top, bottom) => PNG.sync.read(await page.screenshot({ clip: { x: 72, y: top, width: 1440 - 72, height: bottom - top } }));
      const differing = (a, b) => {
        let count = 0;
        for (let offset = 0; offset < a.data.length; offset += 4) if ([0, 1, 2].some(channel => Math.abs(a.data[offset + channel] - b.data[offset + channel]) > 24)) count++;
        return count / (a.width * a.height);
      };
      await go(3);
      const leavingLower = await region(570, 880);
      await go(4);
      const arrivingUpper = await region(90, 400);
      await scrub(3.5);
      state = await snapshot();
      assert.deepEqual([state.mode, state.effects, state.change, state.errors], ["gpu", ["motion:custom+custom", "motion-figure:custom+custom", "shaders:custom+custom", "shaders-figure:custom+custom"], "scan", []]);
      const scanUpper = differing(await region(90, 400), arrivingUpper), scanLower = differing(await region(570, 880), leavingLower);
      assert.ok(scanUpper < 0.002, `above the bar the stage is the arriving section (${scanUpper})`);
      assert.ok(scanLower < 0.002, `below the bar the stage is the leaving section (${scanLower})`);
      await page.screenshot({ path: join(run, "next-deck-scan.png") });
      const scanCaptures = (await snapshot()).perLayer;
      for (const position of [3.4, 3.6, 3.7, 3.45]) await scrub(position);
      state = await snapshot();
      assert.deepEqual(state.perLayer, scanCaptures, "scrolling through an effect change captured a layer");
      // Every other change runs too, and GPU presentation stays on through all of them.
      for (const [from, name] of [[2, "water"], [4, "iris"], [5, "mosaic"], [6, "exposure"]]) {
        await scrub(from + 0.5);
        state = await snapshot();
        assert.deepEqual([state.mode, state.effects.length, state.change, state.errors], ["gpu", 4, name, []], name);
        await page.screenshot({ path: join(run, `next-deck-${name}.png`) });
      }
      await go(1);
      assert.deepEqual((await snapshot()).effects, []);

      // A link jumps: one change, straight from the section on stage to the one asked for, on the clock. The scroll
      // position is the target's at once, only those two sections are on stage, and it takes about a second however
      // many sections lie between (scrolling through them would run four changes in that time).
      await go(0);
      const jumpBegan = Date.now();
      await page.locator('.rail a[href="#shaders"]').click();
      await page.waitForFunction(() => window.homeDeck.place().to === 4 && !document.getElementById("deck-change").hidden);
      state = await snapshot();
      assert.deepEqual([state.layers, state.change, state.scrollY, state.place.from], [["cover", "shaders", "shaders-figure"], "scan", 4 * 900, 0]);
      await page.waitForFunction(() => window.homeDeck.place().from === 4 && window.homeDeck.place().to === null);
      const jumpTook = Date.now() - jumpBegan;
      assert.ok(jumpTook > 800 && jumpTook < 3000, `the jump took ${jumpTook} ms`);
      // A paging key and focus moving into a parked section each bring that section on stage too.
      await page.locator('.rail a[href="#shaders"]').click();
      await page.waitForFunction(() => window.homeDeck.place().from === 4 && window.homeDeck.place().to === null);
      await page.evaluate(() => window.homeDeck.idle());
      state = await snapshot();
      assert.deepEqual(state.layers, ["shaders", "shaders-figure"]);
      await page.locator('.rail a[href="#shaders"][aria-current]').waitFor({ state: "attached" });
      assert.equal(new URL(page.url()).hash, "#shaders");
      await page.evaluate(() => document.activeElement?.blur());
      await page.keyboard.press("PageDown");
      await page.waitForFunction(() => window.homeDeck.place().from === 5 && window.homeDeck.place().to === null);
      await page.keyboard.press("Home");
      await page.waitForFunction(() => window.homeDeck.place().from === 0 && window.homeDeck.place().to === null);
      await page.evaluate(() => { document.querySelector("#start a").focus(); return window.homeDeck.idle(); });
      state = await snapshot();
      assert.deepEqual([state.place.from, state.layers], [7, ["start", "start-figure"]]);
      await page.screenshot({ path: join(run, "next-deck-start.png") });

      // The readout's switch returns to ordinary DOM: the flow again, with the same section in the window and the
      // form as it was. It switches back to the deck the same way.
      await go(1);
      await page.locator("#deck-switch").click();
      await page.waitForFunction(() => window.homeDeck.state().mode === "dom" && !document.documentElement.classList.contains("deck"));
      await page.evaluate(() => window.homeDeck.idle());
      assert.equal(await status(), "Hello, Grace. Pressed 2 times.");
      assert.equal(await page.getByLabel("Name").inputValue(), "Grace");
      assert.equal(await page.evaluate(() => window.servedPress === document.querySelector(".live-row button")), true);
      assert.equal(await page.evaluate(() => { const box = document.getElementById("dom").getBoundingClientRect(); return box.top >= 0 && box.bottom <= innerHeight; }), true, "the section is in the window in the flow");
      assert.equal(await page.locator("#deck-switch").getAttribute("aria-pressed"), "false");
      // Starting GPU presentation changes no pixel of the stage: every layer is where ordinary DOM had it, on whole
      // pixels, and its text is antialiased the same way. (The readout in the header does change: it is not compared.)
      const stageClip = { x: 72, y: 72, width: 1440 - 72, height: 900 - 72 };
      await page.evaluate(() => document.activeElement?.blur());
      const flowScroll = await page.evaluate(() => scrollY);
      const flowPixels = PNG.sync.read(await page.screenshot({ clip: stageClip, path: join(run, "next-stage-dom.png") }));
      await page.locator("#deck-switch").click();
      await page.waitForFunction(() => window.homeDeck.state().mode === "gpu", null, { timeout: 30_000 });
      await page.evaluate(() => { document.activeElement?.blur(); return window.homeDeck.idle(); });
      assert.equal(await page.evaluate(() => scrollY), flowScroll, "the scroll position is the same in the deck");
      const deckPixels = PNG.sync.read(await page.screenshot({ clip: stageClip, path: join(run, "next-stage-gpu.png") }));
      let changedPixels = 0;
      for (let offset = 0; offset < flowPixels.data.length; offset += 4) {
        if ([0, 1, 2].some(channel => Math.abs(flowPixels.data[offset + channel] - deckPixels.data[offset + channel]) > 24)) changedPixels++;
      }
      assert.ok(changedPixels <= flowPixels.width * flowPixels.height / 10_000, `starting GPU presentation changed ${changedPixels} pixels of the stage`);
      state = await snapshot();
      assert.deepEqual({ deck: state.deck, from: state.place.from, layers: state.layers, errors: state.errors }, { deck: true, from: 1, layers: ["dom", "dom-figure"], errors: [] });
      assert.equal(await status(), "Hello, Grace. Pressed 2 times.");
      // A resize keeps the place, part way through a change too: the track is one window per section, so the same place
      // is at another offset in a window of another height.
      await page.mouse.move(30, 880);
      await scrub(3.5);
      const placed = (await snapshot()).place;
      await page.setViewportSize({ width: 1500, height: 820 });
      await page.evaluate(() => window.homeDeck.idle());
      state = await snapshot();
      assert.deepEqual([state.mode, state.place.from, state.place.to], ["gpu", 3, 4]);
      assert.ok(Math.abs(state.place.t - placed.t) < 0.02, `the change is where it was (${placed.t} to ${state.place.t})`);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => window.homeDeck.idle());
      assert.ok(Math.abs((await snapshot()).place.t - placed.t) < 0.02);

      // GPU presentation that ends by itself (here the device is destroyed) returns the page to the flow in ordinary DOM,
      // and the page starts it again a moment later.
      await go(1);
      await page.evaluate(() => document.querySelector('[data-underglass-host="output"]').getContext("webgpu").getConfiguration().device.destroy());
      await page.waitForFunction(() => window.homeDeck.state().mode === "dom");
      await page.waitForFunction(() => window.homeDeck.state().mode === "gpu", null, { timeout: 30_000 });
      await page.evaluate(() => window.homeDeck.idle());
      state = await snapshot();
      assert.deepEqual({ deck: state.deck, from: state.place.from, layers: state.layers, errors: state.errors, losses: await page.evaluate(() => window.homeDeck.state().metrics.deviceLosses.length) },
        { deck: true, from: 1, layers: ["dom", "dom-figure"], errors: [], losses: 1 });
      assert.equal(await status(), "Hello, Grace. Pressed 2 times.");
      assert.deepEqual(problems.filter(problem => !/device (was )?(lost|destroyed)/i.test(problem)), [], "the deck reported problems");
      await context.close();

      // On a phone (emulated: one column at three device pixels per pixel, with touch) a section is two stops of the
      // deck, its text and then its specimen, so that each is a page that fits the screen: a change lands on a whole
      // page, with nothing to scroll after it. The cover's specimen and the demonstration's controls are layers of
      // their own there.
      {
        const phone = await browser.newContext({ viewport: { width: 384, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
        const phonePage = await phone.newPage();
        const phoneProblems = watch(phonePage);
        await phonePage.goto(url);
        await phonePage.waitForFunction(() => window.homeDeck?.state().mode === "gpu", null, { timeout: 30_000 });
        await phonePage.evaluate(() => window.homeDeck.warmed().then(() => window.homeDeck.idle()));
        const stops = await phonePage.evaluate(() => window.homeDeck.stops()), lengths = await phonePage.evaluate(() => window.homeDeck.lengths());
        assert.deepEqual(stops.map(stop => stop.ids.join("+")), ["cover", "cover-figure", "dom", "dom-figure", "transitions", "transitions-controls+transitions-figure+transitions-second",
          "motion", "motion-figure", "shaders", "shaders-figure", "depth", "depth-figure", "everywhere", "everywhere-figure", "start", "start-figure"]);
        assert.deepEqual(stops.map(stop => stop.section), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
        assert.deepEqual(lengths.pans, stops.map(() => 0), "phone: every page fits the screen, so none pans");
        const seen = () => phonePage.evaluate(() => {
          const state = window.homeDeck.state(), place = window.homeDeck.place();
          return { mode: state.mode, from: place.from, to: place.to, layers: state.layers.map(layer => layer.id).filter(layer => layer !== "deck-light"),
            effects: state.decorativeEffects.filter(effect => effect.id !== "deck-light").map(effect => `${effect.id}:${effect.effects.map(item => item.kind).join("+")}`),
            captures: Object.fromEntries(Object.entries(state.metrics.perLayer).map(([layer, counts]) => [layer, counts.captures])), errors: [...window.homeDeck.errors] };
        });
        const scrollTo = top => phonePage.evaluate(value => { scrollTo({ top: value, behavior: "instant" }); return window.homeDeck.idle(); }, top);
        // A text's page, then the change to its specimen's page (another of the deck's changes), then that page.
        await phonePage.evaluate(() => window.homeDeck.goStop(2));
        let now = await seen();
        assert.deepEqual([now.mode, now.from, now.to, now.layers, now.errors], ["gpu", 2, null, ["dom"], []]);
        await scrollTo(lengths.starts[2] + lengths.change * 0.4);
        const early = await seen();
        assert.deepEqual([early.mode, early.from, early.to, early.layers, early.effects.length, early.errors], ["gpu", 2, 3, ["dom", "dom-figure"], 2, []]);
        await scrollTo(lengths.starts[2] + lengths.change * 0.6);
        assert.deepEqual((await seen()).captures, early.captures, "phone: scrolling through a change captured a layer");
        await scrollTo(lengths.starts[3]);
        now = await seen();
        assert.deepEqual([now.from, now.to, now.layers, now.effects], [3, null, ["dom-figure"], []]);
        // The page's control takes a real tap.
        await phonePage.getByRole("button", { name: "Press" }).tap();
        assert.equal(await phonePage.locator('.live-row [role="status"]').innerText(), "Hello, Ada. Pressed 1 time.");
        await phonePage.screenshot({ path: join(run, "home-phone-page.png") });
        // The header lies over the stage's corner on a phone, where the browser check proves hits on a tilted layer:
        // the check passed all the same, and the header's links take the pointer again.
        assert.deepEqual(await phonePage.evaluate(() => [window.homeDeck.state().metrics.admission.last?.projective?.result, document.documentElement.classList.contains("checking"),
          getComputedStyle(document.querySelector(".top .brand")).pointerEvents]), ["proven", false, "auto"], "phone: tilted layers are proven, and the header is back");
        // So the change that leads into the "Transitions" section is the tilt, not a cut: the specimen leaving tilts back.
        await scrollTo(lengths.starts[3] + lengths.change * 0.4);
        const tilting = await phonePage.evaluate(() => { const state = window.homeDeck.state(), place = window.homeDeck.place();
          return { from: place.from, to: place.to, tilt: state.layers.find(layer => layer.id === "dom-figure")?.transform.tiltX ?? 0, change: document.getElementById("deck-change").textContent, errors: [...window.homeDeck.errors] }; });
        assert.deepEqual([tilting.from, tilting.to, tilting.change, tilting.errors], [3, 4, "tilt", []]);
        assert.ok(tilting.tilt > 5, `phone: the specimen leaving is tilted (${tilting.tilt})`);
        // The section's text has no panel beside it here: it says so, and its link leads to the panels' page.
        await phonePage.evaluate(() => window.homeDeck.goStop(4));
        const go = phonePage.locator("#transitions .demo-go");
        assert.deepEqual([await go.isVisible(), await phonePage.locator("#transitions .demo-title").innerText(), await phonePage.locator("#transitions .demo-kinds").isVisible()], [true, "TRY IT", false]);
        await go.tap();
        await phonePage.waitForFunction(() => { const place = window.homeDeck.place(); return place.from === 5 && place.to === null; }, null, { timeout: 5000 });
        await phonePage.evaluate(() => window.homeDeck.idle());
        assert.deepEqual([(await seen()).layers, (await seen()).errors], [["transitions-controls", "transitions-figure", "transitions-second"], []]);
        // The demonstration's page: its controls above its two panels. A tap picks a change, the slider scrubs it with
        // its effect on both panels, and at the end the second panel's own button takes a tap.
        await phonePage.evaluate(() => window.homeDeck.goStop(5));
        const shown = () => phonePage.evaluate(() => {
          const layers = window.homeDeck.state().layers, is = id => layers.find(layer => layer.id === id).transform.scaleX === 0.01 ? "hidden" : "shown";
          return [is("transitions-figure"), is("transitions-second")];
        });
        assert.deepEqual([(await seen()).layers, await shown()], [["transitions-controls", "transitions-figure", "transitions-second"], ["shown", "hidden"]]);
        await phonePage.locator("#transitions-controls").getByRole("button", { name: "iris", exact: true }).tap();
        await phonePage.locator("#demo-scrub-bar").fill("50");
        await phonePage.evaluate(() => window.homeDeck.idle());
        now = await seen();
        assert.deepEqual([now.mode, now.effects, await shown(), now.errors], ["gpu", ["transitions-figure:custom+custom", "transitions-second:custom+custom"], ["shown", "shown"], []]);
        await phonePage.screenshot({ path: join(run, "home-phone-demo.png") });
        await phonePage.locator("#demo-scrub-bar").fill("100");
        await phonePage.evaluate(() => window.homeDeck.idle());
        assert.deepEqual(await shown(), ["hidden", "shown"]);
        await phonePage.getByRole("button", { name: "Lap" }).tap();
        assert.equal(await phonePage.locator(".lap-row output").innerText(), "1 lap");
        await phonePage.locator("#demo-scrub-bar").fill("0");
        // A link to a section jumps to its first page.
        await phonePage.evaluate(() => window.homeDeck.goStop(0));
        await phonePage.getByRole("link", { name: "See the transitions" }).tap();
        await phonePage.waitForFunction(() => { const place = window.homeDeck.place(); return place.from === 4 && place.to === null; });
        // Ordinary DOM again: the same part of the page is at the top of the window, and every part is laid out.
        await phonePage.evaluate(() => window.homeDeck.goStop(7));
        await phonePage.evaluate(() => window.homeDeck.stop());
        const flowed = await phonePage.evaluate(() => ({ deck: document.documentElement.classList.contains("deck"), top: Math.round(document.getElementById("motion-figure").getBoundingClientRect().top),
          parked: document.querySelectorAll(".parked").length }));
        assert.ok(!flowed.deck && flowed.parked === 0 && flowed.top >= 0 && flowed.top <= 120, `phone: back in the flow the specimen is at the top of the window (${JSON.stringify(flowed)})`);
        assert.deepEqual(phoneProblems, [], "phone: the page reported problems");
        await phone.close();
      }

      // The deck runs at every window size. A stop taller than the stage pans: while the scroll position is inside its
      // own length it moves up the stage, by its matrix, exactly as the flow would scroll it, and the change to the
      // next stop comes after that. Checked in a short desktop window.
      for (const [name, options] of [["short window", { viewport: { width: 1280, height: 520 } }]]) {
        const tall = await browser.newContext(options);
        const tallPage = await tall.newPage();
        const tallProblems = watch(tallPage);
        await tallPage.goto(url);
        await tallPage.waitForFunction(() => window.homeDeck?.state().mode === "gpu", null, { timeout: 30_000 });
        await tallPage.evaluate(() => window.homeDeck.warmed().then(() => window.homeDeck.idle()));
        const lengths = await tallPage.evaluate(() => window.homeDeck.lengths());
        assert.ok(lengths.pans.some(pan => pan > 40), `${name}: some sections are taller than the stage (${lengths.pans})`);
        // The longest pan, of a section that is not the last: panned half way, then to its end.
        const index = lengths.pans.indexOf(Math.max(...lengths.pans.slice(0, -1)));
        const pan = lengths.pans[index], start = lengths.starts[index], id = sectionIds[index];
        const at = offset => tallPage.evaluate(async ([top, section]) => {
          scrollTo({ top, behavior: "instant" });
          await window.homeDeck.idle();
          const state = window.homeDeck.state(), place = window.homeDeck.place();
          return { mode: state.mode, from: place.from, to: place.to, pan: Math.round(place.panFrom), top: Math.round(document.getElementById(section).getBoundingClientRect().top),
            layers: state.layers.map(layer => layer.id).filter(layer => layer !== "deck-light"),
            captures: Object.fromEntries(Object.entries(state.metrics.perLayer).map(([layer, counts]) => [layer, counts.captures])), errors: [...window.homeDeck.errors] };
        }, [offset, id]);
        const top = await at(start);
        assert.deepEqual([top.mode, top.from, top.to, top.pan, top.errors], ["gpu", index, null, 0, []], name);
        const half = await at(start + Math.round(pan / 2));
        assert.deepEqual([half.from, half.to, half.pan], [index, null, Math.round(pan / 2)], `${name}: half way through the pan`);
        assert.equal(top.top - half.top, Math.round(pan / 2), `${name}: the section is drawn that much further up`);
        const end = await at(start + pan);
        assert.deepEqual([end.from, end.to, end.pan, top.top - end.top], [index, null, pan, pan], `${name}: at the end of the pan`);
        // Panning writes matrices: nothing is captured.
        assert.deepEqual(end.captures, top.captures, `${name}: panning captured a layer`);
        // The change to the next section starts from where the section has panned to.
        const changing = await at(start + pan + Math.round(lengths.change / 2));
        assert.deepEqual([changing.mode, changing.from, changing.to, changing.errors], ["gpu", index, index + 1, []], `${name}: the change after the pan`);
        // A control far down a tall section takes a real click, or tap, where panning has put it.
        const second = await tallPage.evaluate(() => window.homeDeck.lengths());
        await at(second.starts[1] + second.pans[1]);
        const press = tallPage.getByRole("button", { name: "Press" });
        if (name === "phone") await press.tap(); else await press.click();
        assert.equal(await tallPage.locator('.live-row [role="status"]').innerText(), "Hello, Ada. Pressed 1 time.", name);
        // Ordinary DOM is the same picture at the same scroll position: the flow scrolls a section as the deck pans it.
        // (The pointer is moved off the stage first: the lamp under it is drawn on the GPU only. On the phone the
        // browser's tap highlight on the button is given time to end.)
        if (name === "phone") await tallPage.waitForTimeout(700); else await tallPage.mouse.move(30, 400);
        await tallPage.waitForFunction(() => !window.homeDeck.state().decorativeEffects.some(effect => effect.id === "deck-light" && effect.effects[0].parameters.lamp > 0));
        await tallPage.evaluate(() => { document.activeElement?.blur(); return window.homeDeck.idle(); });
        const tallScroll = await tallPage.evaluate(() => Math.round(scrollY));
        const onGpu = PNG.sync.read(await tallPage.screenshot({ path: join(run, `next-${name.replace(" ", "-")}-gpu.png`) }));
        await tallPage.evaluate(() => window.homeDeck.stop());
        assert.equal(await tallPage.evaluate(() => Math.round(scrollY)), tallScroll, `${name}: the flow is at the same scroll position`);
        const inDom = PNG.sync.read(await tallPage.screenshot({ path: join(run, `next-${name.replace(" ", "-")}-dom.png`) }));
        // In the short window the header and the side scale are beside the stage, and the readout in the header changes.
        const skip = name === "phone" ? 0 : 72;
        let moved = 0;
        for (let y = skip; y < onGpu.height; y++) for (let x = skip; x < onGpu.width; x++) {
          const offset = (y * onGpu.width + x) * 4;
          if ([0, 1, 2].some(channel => Math.abs(onGpu.data[offset + channel] - inDom.data[offset + channel]) > 24)) moved++;
        }
        assert.ok(moved <= onGpu.width * onGpu.height / 10_000, `${name}: ${moved} pixels differ between the deck and the flow`);
        assert.deepEqual(tallProblems, [], `${name}: the page reported problems`);
        await tall.close();
      }

      // With reduced motion the deck still runs: the sections fade, and nothing is moved or tilted.
      const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
      const calmPage = await calm.newPage();
      const calmProblems = watch(calmPage);
      await calmPage.goto(url);
      await calmPage.waitForFunction(() => window.homeDeck?.state().mode === "gpu", null, { timeout: 30_000 });
      await calmPage.evaluate(() => { scrollTo({ top: 1.3 * innerHeight, behavior: "instant" }); return window.homeDeck.idle(); });
      assert.deepEqual(await calmPage.evaluate(() => [window.homeDeck.state().decorativeEffects.length, document.getElementById("deck-change").textContent]), [0, "fade"], "no effect with reduced motion");
      const calmLayers = await calmPage.evaluate(() => window.homeDeck.state().layers.filter(layer => layer.id !== "deck-light").map(layer => ({ id: layer.id, ...layer.transform })));
      assert.equal(calmLayers.length, 5);
      // A layer either fades in place or, unseen, is shrunk out of the pointer's way: none is moved or tilted.
      for (const layer of calmLayers) assert.deepEqual(Object.keys(layer).filter(key => !["id", "opacity", ...(layer.opacity === 0 ? ["scaleX", "scaleY"] : [])].includes(key)), [], `${layer.id} only fades`);
      assert.equal(await calmPage.evaluate(() => window.homeDeck.state().mode), "gpu");
      assert.deepEqual(calmProblems, [], "reduced motion reported problems");
      await calm.close();
    } finally { await browser.close(); }
    result.home = "passed";
  }
  // The same scenario runs twice: `dom` (no HTML-in-Canvas flags, and the visitor's DOM choice recorded, as
  // a press of **DOM** does; the examples must stay on DOM) and `native` (flags on; GPU starts by itself when the
  // stage is in view and the pixels must change as the examples run).
  for (const lane of ["dom", "native"]) {
    const executablePath = process.env.CANVAS_BROWSER_EXECUTABLE;
    result.executable = executablePath ? { path: executablePath, sha256: sha(await readFile(executablePath)) } : { channel: "chrome-canary" };
    const browser = await chromium.launch(browserLaunchOptions({ native: lane === "native" ? true : "none" }));
    const record = { lane, status: "running" };
    result.browsers.push(record);
    // Stable builds have shipped HTML-in-Canvas since 157, so without the recorded choice the page would start GPU by
    // itself in the DOM lane too.
    const laneContext = async options => {
      const context = await browser.newContext(options);
      // Init scripts also run on `about:blank`, where `sessionStorage` throws.
      if (lane === "dom") await context.addInitScript(key => { try { sessionStorage.setItem(key, "1"); } catch { /* opaque origin */ } }, domChoiceKey);
      return context;
    };
    try {
      const context = await laneContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
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
      // An example's page holds the example and the way around, not the gallery: its one card is the next example's.
      assert.equal(await page.locator(".example-card").count(), 1);
      assert.equal(await page.locator(".example-card").getAttribute("href"), "/underglass/examples/motion");
      assert.equal(await page.locator("h1").innerText(), "Postcard studio");
      assert.equal(await page.getByRole("link", { name: "All examples", exact: true }).getAttribute("href"), "/underglass/examples");
      // The stage starts in the first screen.
      assert.ok((await page.locator(".stage").boundingBox()).y < 400, "The stage starts in the first screen");
      // Helpers: the example's reported state, a button inside the stage by exact label, and a settle that
      // flushes the controller then waits briefly for pending paints.
      const state = () => page.evaluate(() => window.showcase.state());
      const studioButton = name => page.locator(".stage button").filter({ hasText: new RegExp(`^${name}$`) });
      const settle = async () => { await page.evaluate(() => window.showcase.controller.settle()); await page.waitForTimeout(250); };
      if (lane === "native") {
        // Nothing is pressed: GPU starts by itself once the stage is in view.
        await page.locator(".stage").scrollIntoViewIfNeeded();
        await autoAdmission(page);
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
      await page.getByLabel("Example", { exact: true }).selectOption("tasks");
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
      await page.getByLabel("Example", { exact: true }).selectOption("fluent");
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
        await modeButton(page, "DOM").click();
        await page.waitForFunction(() => window.showcase.state().mode === "dom");
        await page.locator(".stage input[name=compare-scene][value=ripple]").check();
        await page.locator(".stage").scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await modeButton(page, "GPU").click();
        await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting");
        record.compare.enableWhileAnimating = await state();
        assert.equal(record.compare.enableWhileAnimating.mode, "gpu", record.compare.enableWhileAnimating.reason);
        assert.ok(record.compare.enableWhileAnimating.metrics.gpuFrames > 0);
      }
      record.beforeDispose = await state();
      assert.equal(record.beforeDispose.mode, lane === "native" ? "gpu" : "dom", record.beforeDispose.reason);
      // Explicit dispose must retire every GPU and runtime resource.
      // The control that ends the session is behind the status line's Details.
      await page.locator(".diagnostic summary").click();
      await page.getByRole("button", { name: "Dispose example", exact: true }).click();
      await page.getByText("The example is disposed. Reload this page to start a fresh session.").waitFor();
      record.disposed = await state();
      assert.ok(Object.values(record.disposed.resources).every(value => value === 0));
      assert.ok(Object.values(record.disposed.runtimeResources).every(value => value === 0));
      // Deep links: opening `examples/effects` and reloading must show that example in DOM mode (the stage is below
      // the fold, and GPU waits for it to be in view).
      // An old `#/effects` link opens the same page and moves to its path.
      await page.goto("about:blank");
      await page.goto(`${url}#/effects`);
      await page.waitForURL(`${url}examples/effects`);
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal(await page.evaluate(() => location.pathname + location.hash), "/underglass/examples/effects");
      assert.equal(await page.title(), "Shader lab | Underglass examples");
      assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), "https://underglass.dev/examples/effects");
      await page.goto("about:blank");
      await page.goto(`${url}examples/effects`);
      await studioButton("Apply chromatic effect").waitFor();
      await page.reload();
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal((await state()).mode, "dom");
      // The bar's steps switch examples in place, from the keyboard too: the Card deck is before the Shader lab.
      assert.equal(await page.locator(".example-card").getAttribute("href"), "/underglass/examples/presence");
      await page.getByRole("link", { name: "Previous example: Card deck", exact: true }).focus();
      await page.keyboard.press("Enter");
      await studioButton("Play layer journey").waitFor();
      assert.equal(await page.evaluate(() => location.pathname), "/underglass/examples/motion");
      assert.equal(await page.locator("h1").innerText(), "Card deck");
      // The picker switches examples in place, through the same route.
      assert.equal(await page.getByLabel("Example", { exact: true }).inputValue(), "motion");
      await page.getByLabel("Example", { exact: true }).selectOption("effects");
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal(await page.evaluate(() => location.pathname), "/underglass/examples/effects");
      assert.equal(await page.locator(".example-card").getAttribute("href"), "/underglass/examples/presence");
      // Back in the history is the Card deck again, in place.
      await page.goBack();
      await studioButton("Play layer journey").waitFor();
      await page.goForward();
      await studioButton("Apply chromatic effect").waitFor();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(run, `${lane}-desktop.png`) });
      // Mobile viewport: no horizontal overflow, a single site header, the bar in one row and the stage in the first screen.
      const mobileContext = await laneContext({ viewport: { width: 390, height: 844 } });
      const mobile = await mobileContext.newPage();
      await mobile.goto(`${url}examples/motion`);
      await mobile.waitForFunction(() => window.showcase);
      await mobile.waitForTimeout(300);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      record.mobile = await mobile.evaluate(() => ({ headers: document.querySelectorAll(".site-header").length,
        viewport: innerWidth, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      assert.equal(record.mobile.headers, 1);
      record.mobile.bar = await mobile.evaluate(() => { const bar = document.querySelector(".studio-bar"), tops = [...bar.children].filter(child => child.checkVisibility()).map(child => Math.round(child.getBoundingClientRect().top + child.getBoundingClientRect().height / 2));
        return { height: Math.round(bar.getBoundingClientRect().height), rows: new Set(tops).size, stage: Math.round(document.querySelector(".stage").getBoundingClientRect().top + scrollY) }; });
      assert.equal(record.mobile.bar.rows, 1, `The bar is one row on a phone: ${JSON.stringify(record.mobile.bar)}`);
      assert.ok(record.mobile.bar.stage < 400, `The stage starts in a phone's first screen: ${record.mobile.bar.stage}`);
      await mobile.screenshot({ path: join(run, `${lane}-mobile-viewport.png`) });
      await mobile.locator("#studio").scrollIntoViewIfNeeded();
      await mobile.waitForTimeout(300);
      await mobile.screenshot({ path: join(run, `${lane}-mobile-studio.png`) });
      await mobileContext.close();
      // A visitor's press of **DOM** holds for the tab: after a reload GPU doesn't start by itself, even with the
      // stage in view, and a press of **GPU** clears the choice.
      if (lane === "native") {
        const choiceContext = await laneContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
        const choice = await choiceContext.newPage();
        choice.on("pageerror", error => errors.push(String(error)));
        await choice.goto(`${url}examples/layers`);
        await choice.waitForFunction(() => window.showcase);
        await choice.locator(".stage").scrollIntoViewIfNeeded();
        await autoAdmission(choice);
        await modeButton(choice, "DOM").click();
        await choice.waitForFunction(() => window.showcase.state().mode === "dom");
        assert.equal(await choice.evaluate(key => sessionStorage.getItem(key), domChoiceKey), "1");
        await choice.reload();
        await choice.waitForFunction(() => window.showcase);
        await choice.locator(".stage").scrollIntoViewIfNeeded();
        await choice.waitForTimeout(1500);
        record.domChoice = await choice.evaluate(() => window.showcase.state());
        assert.equal(record.domChoice.mode, "dom", record.domChoice.reason);
        assert.match(record.domChoice.reason, /^Ordinary DOM startup/);
        await modeButton(choice, "GPU").click();
        await choice.waitForFunction(() => { const state = window.showcase.state();
          return !state.initializing && state.mode !== "admitting" && !/^Ordinary DOM startup/.test(state.reason); });
        assert.equal((await choice.evaluate(() => window.showcase.state())).mode, "gpu");
        assert.equal(await choice.evaluate(key => sessionStorage.getItem(key), domChoiceKey), null);
        await choiceContext.close();
      }
      // The examples' index is the gallery: every example as a card with its picture, in the catalog's groups, and no
      // Underglass (there is nothing to enable). A card opens its example's page, and that page's bar leads back.
      for (const [name, options] of [["gallery", { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 }], ["gallery-phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
        const galleryContext = await laneContext(options);
        const gallery = await galleryContext.newPage();
        gallery.on("pageerror", error => errors.push(String(error)));
        await gallery.goto(`${url}examples`);
        await gallery.locator(".gallery-group").first().waitFor();
        const found = record[name] = await gallery.evaluate(async () => {
          const cards = [...document.querySelectorAll(".example-card")];
          const firstCard = Math.round(cards[0].getBoundingClientRect().top + scrollY);
          // A picture below the first screen loads as it comes near: each is brought into view before it is asked for.
          const pictures = [];
          for (const card of cards) { card.scrollIntoView(); const image = card.querySelector("img"); await image.decode().catch(() => undefined); pictures.push(image.naturalWidth); }
          scrollTo(0, 0);
          return { title: document.querySelector("h1").textContent, groups: [...document.querySelectorAll(".gallery-group h2")].map(heading => heading.textContent),
            cards: cards.map(card => card.getAttribute("href")), pictures, firstCard, runtime: typeof window.showcase, stages: document.querySelectorAll(".stage, canvas").length,
            columns: new Set(cards.slice(0, 3).map(card => Math.round(card.getBoundingClientRect().left))).size, overflow: document.documentElement.scrollWidth > innerWidth };
        });
        assert.equal(found.title, "Examples");
        assert.equal(await gallery.title(), "Live examples | Underglass");
        assert.deepEqual(found.groups, ["Start here", "Real controls at work", "Lit component libraries"]);
        assert.equal(found.cards.length, 10);
        assert.equal(new Set(found.cards).size, 10, "Every example has one card");
        assert.ok(found.cards.every(href => /^\/underglass\/examples\/[\w-]+$/.test(href)), JSON.stringify(found.cards));
        assert.ok(found.pictures.every(width => width > 0), `Every card has its picture: ${JSON.stringify(found.pictures)}`);
        assert.ok(found.firstCard < 700, `The first card is in the first screen: ${found.firstCard}`);
        assert.equal(found.runtime, "undefined", "The gallery runs no Underglass");
        assert.equal(found.stages, 0);
        assert.equal(found.columns, name === "gallery" ? 3 : 1);
        assert.equal(found.overflow, false);
        await gallery.screenshot({ path: join(run, `${lane}-${name}.png`) });
        // A card opens its example; the bar's link leads back to the gallery.
        await gallery.locator('.example-card[href$="/examples/compare"]').click();
        await gallery.waitForURL(`${url}examples/compare`);
        await gallery.waitForFunction(() => window.showcase);
        assert.equal(await gallery.locator("h1").innerText(), "GPU or CSS?");
        await gallery.getByRole("link", { name: "All examples", exact: true }).click();
        await gallery.waitForURL(`${url}examples`);
        await gallery.locator(".gallery-group").first().waitFor();
        await galleryContext.close();
      }
      // Strata gallery, opened directly: its components render in the runtime's first, synchronous render, so
      // `useStrataGpu` must attach after the mount returns. Real keys and clicks drive the original controls.
      const strataContext = await laneContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
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
      if (lane === "native") await autoAdmission(strata);
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
      // Leaving the gallery for another example in place: `useStrataGpu` must release its panels before React removes
      // them, or the runtime meets a detached enrolled layer and leaves GPU (it did, and the next example never
      // mounted). The next example must mount on the GPU, without Strata's layers, with fresh pixels and real hits.
      await strata.getByLabel("Example", { exact: true }).selectOption("layers");
      await strata.locator("#studio-title").waitFor();
      await strataSettle();
      record.strata.left = await strataMode("switched to layers");
      assert.deepEqual(record.strata.left.layers.map(layer => layer.id).filter(id => id.startsWith("strata")), []);
      const leftSave = async text => {
        await strata.locator("#studio-title").fill(text);
        const box = await strata.locator(".stage button").filter({ hasText: /^Save postcard$/ }).boundingBox();
        await strata.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await strata.locator("#saved-title").filter({ hasText: text }).waitFor();
        await strataSettle();
        if (lane === "native") return PNG.sync.read(await strataOutput.screenshot({ path: join(run, `native-strata-left-${text[0]}.png`) }));
      };
      const leftWide = await leftSave("W".repeat(32)), leftNarrow = await leftSave("I".repeat(32));
      if (lane === "native") {
        let changed = 0;
        for (let y = 92; y < 160; y++) for (let x = 406; x < 700; x++) {
          const offset = (y * leftNarrow.width + x) * 4;
          if (leftWide.data.subarray(offset, offset + 4).some((v, i) => v !== leftNarrow.data[offset + i])) changed++;
        }
        assert.ok(changed > 100, `Title pixels changed after leaving Strata: ${changed}`);
        record.strata.leftChangedTitlePixels = changed;
      }
      await strataMode("after leaving");
      await strataContext.close();
      // With `navigator.gpu` hidden, enabling GPU must fall back to DOM with a GPU reason and keep the user's input.
      if (lane === "dom") {
        const unsupported = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
        await unsupported.addInitScript(() => Object.defineProperty(navigator, "gpu", { get: () => undefined }));
        const fallback = await unsupported.newPage();
        await fallback.goto(`${url}examples/layers`);
        await fallback.waitForFunction(() => window.showcase);
        await fallback.locator("#studio-title").fill("Retained fallback");
        await modeButton(fallback, "GPU").click();
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
  // `polyfill`: HTML-in-Canvas switched off, so the help panel offers the opt-in polyfill (src/polyfill.ts). Its
  // button must download it only on the press, admit GPU on it with fresh pixels and real hits, say so on the
  // page, run Fluent with every card hit where it is drawn, and run Strata with its relief and a real tab click.
  {
    const browser = await chromium.launch(browserLaunchOptions({ native: false }));
    const record = { lane: "polyfill", status: "running" };
    result.browsers.push(record);
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      record.actual = await cdp.send("Browser.getVersion");
      assertBrowserIdentity(record.actual);
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      const scripts = [];
      page.on("request", request => { if (request.resourceType() === "script") scripts.push(request.url()); });
      const state = () => page.evaluate(() => window.showcase.state());
      await page.goto(`${url}examples/layers`);
      await page.waitForFunction(() => window.showcase);
      assert.equal(await page.evaluate(() => typeof HTMLCanvasElement.prototype.requestPaint), "undefined", "HTML-in-Canvas must be off in this lane");
      const before = scripts.length;
      await page.locator(".stage").scrollIntoViewIfNeeded();
      const startup = (await state()).reason;
      await page.getByRole("button", { name: "Run GPU mode on the polyfill", exact: true }).click();
      // The page stays in DOM while the polyfill chunk downloads, so wait for admission to report a new reason.
      await page.waitForFunction(startup => { const current = window.showcase.state();
        return current.reason !== startup && !current.initializing && current.mode !== "admitting"; }, startup);
      record.initial = await state();
      assert.equal(record.initial.mode, "gpu", record.initial.reason);
      assert.ok(scripts.length > before, "The polyfill chunk loads on the press");
      assert.equal(await page.locator(".mode-pill").innerText(), "GPU active · polyfill");
      await page.locator(".polyfill-note").getByText("Running on the HTML-in-Canvas polyfill.").waitFor();
      // Fresh pixels: the polyfill lags a few frames, so each screenshot waits for the saved title and then 600 ms.
      // The polyfill mirrors the canvas's class onto its host element, so the canvas is named by its tag.
      const output = page.locator(".stage canvas.output");
      const save = async text => {
        await page.locator("#studio-title").fill(text);
        // A real click at the button's centre must land on the original button through the polyfill's hit regions.
        const box = await page.locator(".stage button").filter({ hasText: /^Save postcard$/ }).boundingBox();
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.locator("#saved-title").filter({ hasText: text }).waitFor();
        await page.evaluate(() => window.showcase.controller.settle());
        await page.waitForTimeout(600);
        return PNG.sync.read(await output.screenshot({ path: join(run, `polyfill-title-${text[0]}.png`) }));
      };
      const first = await save("W".repeat(32)), second = await save("I".repeat(32));
      let changed = 0;
      for (let y = 92; y < 160; y++) for (let x = 406; x < 700; x++) {
        const offset = (y * second.width + x) * 4;
        if (first.data.subarray(offset, offset + 4).some((v, i) => v !== second.data[offset + i])) changed++;
      }
      assert.ok(changed > 100, `Polyfill changed title pixels: ${changed}`);
      record.changedTitlePixels = changed;
      assert.equal((await state()).mode, "gpu");
      // Fluent runs on it too. Its six cards share one layout box and are drawn in a grid; core locks each layer's
      // transform inline, which polyfill 0.1.0 couldn't override, so every click went to the last card. Each card's
      // title must be hit at its own centre, and a real click must open that card.
      await page.getByLabel("Example", { exact: true }).selectOption("fluent");
      await page.locator("#fluent-title").waitFor();
      await page.locator(".stage").scrollIntoViewIfNeeded();
      await modeButton(page, "GPU").click();
      await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting");
      record.fluent = await state();
      assert.equal(record.fluent.mode, "gpu", record.fluent.reason);
      await page.evaluate(() => window.showcase.controller.settle());
      const cardTitles = page.locator(".stage .fl-card-title");
      assert.ok(await cardTitles.count() >= 6, "The Fluent board shows its cards");
      const misses = await page.evaluate(() => [...document.querySelectorAll(".stage .fl-card-title")].filter(button => {
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return !hit || !(hit === button || button.contains(hit));
      }).map(button => button.getAttribute("aria-label")));
      assert.deepEqual(misses, [], "Every Fluent card title is hit where it is drawn");
      const firstCard = cardTitles.first();
      const cardName = (await firstCard.getAttribute("aria-label")).slice("Edit ".length);
      const cardBox = await firstCard.boundingBox();
      await page.mouse.click(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.locator("#fluent-editor").waitFor();
      assert.equal(await page.locator("#fluent-edit-title").inputValue(), cardName);
      assert.equal((await state()).mode, "gpu");
      // Strata runs on it from polyfill 0.4.0. Up to 0.2.0 the polyfill's host hid every drawn element from
      // `checkVisibility`, so Strata built no relief; each surface must have relief primitives, and a real click on
      // a gallery tab must select it.
      await page.getByLabel("Example", { exact: true }).selectOption("strata");
      await page.locator("#strata-gallery").waitFor();
      await page.locator(".stage").scrollIntoViewIfNeeded();
      await modeButton(page, "GPU").click();
      await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting");
      record.strata = await state();
      assert.equal(record.strata.mode, "gpu", record.strata.reason);
      await page.evaluate(() => window.showcase.controller.settle());
      const relief = Object.fromEntries((await state()).materials.map(material => [material.id, material.primitives]));
      assert.ok(relief["strata-bar"] > 0 && relief["strata-gallery"] > 0, `Strata builds relief on the polyfill: ${JSON.stringify(relief)}`);
      record.strataRelief = relief;
      const choices = page.locator("#strata-gallery [role=tab]").filter({ hasText: /^Choices$/ });
      const tabBox = await choices.boundingBox();
      await page.mouse.click(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
      await page.waitForFunction(() => [...document.querySelectorAll("#strata-gallery [role=tab]")]
        .some(tab => tab.textContent.trim() === "Choices" && tab.getAttribute("aria-selected") === "true"));
      assert.equal((await state()).mode, "gpu");
      // Back on an offered example, the ordinary Enable button runs on the installed polyfill.
      await page.getByLabel("Example", { exact: true }).selectOption("layers");
      await page.locator("#studio-title").waitFor();
      await modeButton(page, "GPU").click();
      await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting");
      record.reenabled = await state();
      assert.equal(record.reenabled.mode, "gpu", record.reenabled.reason);
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
