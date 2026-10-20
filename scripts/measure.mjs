/**
 * Serial production measurement of the playground performance fixture (`performance.html`) and of the
 * todo app's pixel latency: DOM versus GPU presentation, static, affine and ripple variants, 2/4/8 layers,
 * DPR 1 and 2, three repetitions each, plus a native-input window and a checkbox-to-pixels latency run.
 *
 * Invoked as `npm run measure` (which builds first) or `node scripts/measure.mjs --smoke` for a quick
 * single-repetition pass (one DPR, two layers, 500 ms windows). It starts `vite preview` itself on
 * `CANVAS_MEASURE_PORT` (default 5287) and refuses to run if something already serves that port, so the
 * build under test is the one just built. The browser comes from `browserLaunchOptions`.
 *
 * Output: `<evidence root>/performance/performance.json` (`performance-smoke.json` with `--smoke`),
 * rewritten after every run so a crash keeps earlier results; `completed: true` marks a finished report.
 * Times are CPU and wall-clock only (GPU execution time is not measured). Any failed assertion throws and
 * exits non-zero. Evidence is sanitized on exit.
 */
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { evidenceDirectory } from "../tests/helpers/evidence.mjs";
import { taskPixelLatency } from "./interaction-contract.mjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";

// `--smoke` shrinks every dimension of the matrix for a fast sanity run.
const smoke = process.argv.includes("--smoke");
const port = Number(process.env.CANVAS_MEASURE_PORT ?? 5287);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid measurement preview port");
const url = `http://127.0.0.1:${port}`;
const directory = evidenceDirectory("performance");
const filename = `${directory}/performance${smoke ? "-smoke" : ""}.json`;
await mkdir(directory, { recursive: true });
try {
  // Nothing may answer on the port yet. Only a refused connection lets the run continue; anything else
  // could mean a stale or unknown build is being measured.
  await fetch(url);
  throw new Error(`Measurement port ${port} already serves a page; refusing to reuse an unknown build`);
} catch (error) {
  if (error.cause?.code !== "ECONNREFUSED") throw error;
}
// Run Vite's preview through this Node process directly, as elsewhere in the harness, to avoid shell shims.
const vite = fileURLToPath(new URL("./bin/vite.js", import.meta.resolve("vite/package.json")));
const server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"], detached: false,
});
let serverOutput = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { serverOutput += data; });
let browser;
// Summary statistics for a list of numbers. Median and p95 use the nearest-rank method; an empty list
// yields nulls.
function distribution(values) {
  if (!values.length) return { count: 0, total: 0, median: null, p95: null, min: null, max: null };
  const ordered = [...values].sort((a, b) => a - b);
  return { count: values.length, total: values.reduce((sum, n) => sum + n, 0),
    median: ordered[Math.ceil(ordered.length * 0.5) - 1], p95: ordered[Math.ceil(ordered.length * 0.95) - 1],
    min: ordered[0], max: ordered.at(-1) };
}
// Per-counter difference between two state snapshots of the fixture's metrics.
function delta(before, after) {
  return Object.fromEntries(["captures", "pixelCopies", "pixelReadbacks", "uploads", "uploadBytes", "gpuFrames", "geometryUpdates", "paintNotifications"]
    .map(key => [key, after.metrics[key] - before.metrics[key]]));
}
// After dispose the controller must report mode `disposed` and every tracked resource count at zero.
function zero(state) {
  assert.equal(state.mode, "disposed");
  assert(Object.values(state.resources).every(value => value === 0), "Retired core resources must be zero");
  assert(Object.values(state.runtimeResources).every(value => value === 0), "Retired runtime resources must be zero");
}
// Reduces one raw run to the reported figures: work counters, RAF interval statistics, an estimate of
// missed refresh slots, CPU sample statistics and per-layer capture and upload rates. The refresh budget is
// the run's own warmup median RAF interval, so a slot estimate is relative to that display, not a fixed
// 60 Hz.
function summary(run) {
  const budget = distribution(run.warmup.intervals).median;
  const d = delta(run.measurement.before, run.measurement.after);
  return { dpr: run.dpr, layers: run.layers, variant: run.variant, repetition: run.repetition,
    durationMs: run.measurement.durationMs, work: d,
    actualReactCommits: run.measurement.after.commits - run.measurement.before.commits,
    rafMs: distribution(run.measurement.intervals),
    estimatedMissedRefreshSlots: budget ? run.measurement.intervals.reduce((sum, dt) => sum + Math.max(0, Math.round(dt / budget) - 1), 0) : null,
    warmupRefreshBudgetMs: budget,
    cpuSamples: Object.fromEntries(["captureMs", "readbackCompareMs", "uploadMs", "frameWorkMs", "frameIntervalsMs"].map(kind =>
      [kind, distribution(run.measurement.samples.filter(sample => sample.kind === kind).map(sample => sample.durationMs))])),
    perLayer: run.measurement.after.layers.map(layer => {
      const b = run.measurement.before.metrics.perLayer[layer.id], a = run.measurement.after.metrics.perLayer[layer.id];
      const captures = (a?.captures ?? 0) - (b?.captures ?? 0), uploads = (a?.uploads ?? 0) - (b?.uploads ?? 0);
      const readbacks = run.measurement.samples.filter(sample => sample.kind === "readbackCompareMs" && sample.layerId === layer.id).length;
      return { id: layer.id, captures, pixelCopies: captures, pixelReadbacks: readbacks, uploads, captureHz: captures / (run.measurement.durationMs / 1000),
        uploadHz: uploads / (run.measurement.durationMs / 1000), uploadRGBABytes: uploads * layer.width * layer.height * 4 };
    }),
  };
}
// Persists the whole report so far.
async function save(report) {
  await writeFile(filename, JSON.stringify(report, null, 2));
}
try {
  // Wait up to 15 s for the preview server to serve the fixture page.
  const deadline = Date.now() + 15000;
  while (true) {
    try { const response = await fetch(`${url}/performance.html`); if (response.ok) break; }
    catch (error) { if (error.cause?.code !== "ECONNREFUSED") throw error; }
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Measurement preview failed: ${serverOutput}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch(browserLaunchOptions());
  const cdp = await browser.newBrowserCDPSession();
  const system = await cdp.send("SystemInfo.getInfo");
  // Record the browser build, its command line and the GPU so results can be compared across machines.
  const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine"),
    gpu: system.gpu.devices.map(({ vendorString, deviceString }) => ({ vendorString, deviceString })),
    renderer: system.gpu.auxAttributes?.glRenderer, gpuExecutionTimestampMs: null,
    dependencies: JSON.parse(await readFile("package.json", "utf8")), build: "Vite production, react-dom/profiling; installed browser headless, single serial writer" };
  await cdp.detach();
  // `method` states what each number means and does not mean; it is written into the report next to the data.
  const report = { environment, method: {
    requestedWindowMs: smoke ? 500 : 2000, warmupMs: 500, repetitions: smoke ? 1 : 3,
    timer: "performance.now, real wall-clock/rAF, no deterministic timeline advance",
    samples: "Opt-in synchronous operation sink records every event in finite measurement window, not retained last256 telemetry; all raw rAF intervals included",
    gpuTiming: "CPU submit/uniform/capture/copy/readback/compare times, not GPU execution; GPU timestamp unavailable, null",
    missed: "sum(max(0,round(interval / that run warmup median)-1)); estimated refresh slots, not observed compositor drops",
    memory: "RGBA8 capacities from dimensions and owned texture/staging/comparison counts; excludes browser, driver, engine, MSAA, swapchain and extra native copies",
    latency: "Real original checkbox click -> changed task-row pixels; screenshots poll outside performance windows; interval bounds include automation/readback uncertainty",
    isolation: "Matched viewport900x750, same browser/hardware/content; contexts differ only DPR, declared variant/count; variant order rotated each repetition; serial engine lifetimes",
    inputWorkload: "Separate 1000ms window: five native controlled-input replacements, 80ms spacing; includes automation/wait time, not a maximum throughput benchmark",
  }, runs: [], latency: [], latencyRetirements: [] };
  // The variant order is rotated each repetition, so no variant is always run first.
  const variants = ["dom-static", "gpu-static", "dom-affine", "gpu-affine", "gpu-ripple"];
  for (const dpr of smoke ? [1] : [1, 2]) for (const layers of smoke ? [2] : [2, 4, 8]) {
    for (let repetition = 0; repetition < report.method.repetitions; repetition++) {
      const order = [...variants.slice(repetition), ...variants.slice(0, repetition)];
      for (const variant of order) {
        // A fresh context per run, so each run starts with no engine, cache or listener left from the last.
        const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
        const page = await context.newPage(), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        try {
          await page.goto(`${url}/performance.html?layers=${layers}&variant=${variant}`);
          await page.waitForFunction(() => window.measurement, null, { timeout: 10000 });
          assert.equal(await page.evaluate(() => window.measurement.version), "19.3.1");
          // The warmup window yields the refresh-interval baseline used by `summary`; the measurement window follows.
          const warmup = await page.evaluate(() => window.measurement.collect(500));
          const measurement = await page.evaluate(ms => window.measurement.collect(ms), report.method.requestedWindowMs);
          assert.equal(measurement.after.mode, variant.startsWith("gpu") ? "gpu" : "dom");
          assert.equal(measurement.after.layers.length, layers);
          // Input window: five real edits of the native input, 80 ms apart, while metrics are collected. Each edit
          // must produce exactly one React commit and, in GPU variants, at least one upload.
          const beforeInput = PNG.sync.read(await page.locator("#frame").screenshot());
          const inputWindow = page.evaluate(() => window.measurement.collect(1000));
          for (let edit = 0; edit < 5; edit++) {
            await page.getByLabel("Native input", { exact: true }).fill(`edit-${edit}`);
            await page.waitForTimeout(80);
          }
          const inputMeasurement = await inputWindow;
          assert.equal(inputMeasurement.after.commits - inputMeasurement.before.commits, 5);
          assert.equal(inputMeasurement.after.mode, measurement.after.mode);
          if (variant.startsWith("gpu")) assert(inputMeasurement.after.metrics.uploads - inputMeasurement.before.metrics.uploads >= 5);
          await page.locator("#measurement-input").evaluate(node => node.blur());
          await page.evaluate(() => window.measurement.settle());
          const afterInput = PNG.sync.read(await page.locator("#frame").screenshot());
          // The edits must visibly change the fixture output, so a stale presented image cannot pass.
          const changedInputBytes = afterInput.data.reduce((total, value, index) => total + Number(value !== beforeInput.data[index]), 0);
          assert(changedInputBytes > 50, "Actual native edits must change decoded fixture output");
          const estimates = await page.evaluate(() => {
            const s = window.measurement.state(), bytes = s.layers.reduce((sum, layer) => sum + layer.width * layer.height * 4, 0);
            const output = document.querySelector("#output"), capture = document.querySelector("#capture");
            return { textureRGBABytes: s.resources.textures ? bytes : 0, stagingRGBABytes: s.resources.stagingCanvases ? bytes : 0,
              comparisonRGBABytes: s.resources.comparisonBuffers ? bytes : 0,
              declaredUniformBytes: s.resources.engines ? 16 + s.layers.length * 160 : 0,
              declaredUniformBuffers: s.resources.engines ? 1 : 0,
              outputBitmapCapacityRGBABytes: output.width * output.height * 4,
              captureBitmapCapacityRGBABytes: capture.width * capture.height * 4 };
          });
          const startup = await page.evaluate(() => ({ startupMs: window.measurement.startupMs }));
          let inputVsDOMBytes = null;
          // For static variants, disable GPU and compare the plain DOM rendering with the GPU output; the byte
          // difference is recorded, not asserted (text rasterization can differ at DPR 2).
          if (variant.endsWith("static")) {
            await page.evaluate(() => window.measurement.disable());
            const domInput = PNG.sync.read(await page.locator("#frame").screenshot());
            inputVsDOMBytes = domInput.data.reduce((total, value, index) => total + Number(value !== afterInput.data[index]), 0);
            assert.equal(domInput.width, afterInput.width);
            assert.equal(domInput.height, afterInput.height);
          }
          const retired = await page.evaluate(() => window.measurement.dispose());
          zero(retired); assert.deepEqual(errors, []);
          const run = { dpr, layers, variant, repetition, startup, warmup, measurement, inputMeasurement,
            changedInputBytes, inputVsDOMBytes,
            rasterComparison: "Static-only cross-presentation comparison; DPR2 native capture text can differ from ordinary DOM rasterization. Animated variants are not compared at distinct times.",
            estimates, retired, errors };
          run.summary = summary(run);
          run.inputSummary = summary({ ...run, measurement: inputMeasurement });
          report.runs.push(run);
          await save(report);
          console.log(`${dpr}x ${layers} ${variant} r${repetition + 1}: ${Math.round(measurement.durationMs)}ms, ${run.summary.rafMs.median}/${run.summary.rafMs.p95}ms RAF; ${run.summary.work.gpuFrames} GPU submissions`);
        } finally { await context.close(); }
      }
    }
  }
  // Latency runs: the todo app in DOM and in GPU mode, measured from a native click to changed task-row pixels.
  for (const dpr of smoke ? [1] : [1, 2]) for (const gpu of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 950 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    try {
      await page.goto(`${url}/todo.html`);
      await page.waitForFunction(() => window.todoProbe);
      if (gpu) await page.evaluate(() => window.todoProbe.controller().enable());
      assert.equal(await page.evaluate(() => window.todoProbe.state().mode), gpu ? "gpu" : "dom");
      report.latency.push(...await taskPixelLatency(page, dpr, gpu, smoke ? 2 : 10));
      const retired = await page.evaluate(() => window.todoProbe.dispose());
      zero(retired); assert.equal(retired.transition.timers, 0); assert.equal(retired.demoListeners, 0);
      report.latencyRetirements.push({ dpr, gpu, retired, measurementListenerRemoved: true });
    } finally { await context.close(); }
  }
  report.completed = true;
  await save(report);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", resolve); });
  await import("./sanitize-evidence.mjs");
}
