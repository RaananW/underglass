/**
 * The Instrument post chain's lifecycle (core work item 3, `docs/ui-library/instrument-phase2.md`, the review fixes) on
 * `instrument-post-core.html` (`window.postCore`):
 * - the last instrument layer leaving while the scenes still build (`?dropAt=ms`) leaves no shared target allocated and
 *   no failed build, GPU on;
 * - a registration that fails with the optional stages on is rebuilt once without them (`?failRegistration=optional`):
 *   the layers draw, the stages read failed with the registration's error; a failure of the minimal chain too
 *   (`?failRegistration=all`) is the `post` step-down, and it is retried once the canvas size changes (a DPR change);
 * - an instrument layer added and removed beside two live layers keeps the targets and draws nothing outside the
 *   controls, under reduced motion too; the targets are released when the last layer leaves.
 * Reports go to the `core-post` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-post");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;
const gpuWarning = /Destroyed|Invalid|validation/i;

async function open(browser, dpr, query = "") {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto(`/instrument-post-core.html${query}`);
  await page.waitForFunction(() => window.postCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.postCore.ready)[name](...args), { name, args });
  return { context, page, errors, warnings, call };
}
function rounded(point, box) {
  const radius = Math.min(box.radius ?? 0, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
async function counts(call) {
  const counts = await call("counts");
  expect(counts.mode, `GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, "no fallback").toMatch(healthy);
  return counts;
}
/** Parts on against the face only (face shadows off): changed pixels outside every drawn control's rounded box, more than a pixel from another panel's edge. */
async function outsideControls(call, page, dpr) {
  await call("setShadows", false);
  const on = PNG.sync.read(await page.screenshot());
  await call("setMeshes", false);
  const off = PNG.sync.read(await page.screenshot());
  await call("setMeshes", true);
  await call("setShadows", true);
  const controls = await call("controls"), panels = await call("panels");
  let changed = 0, outside = 0;
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
    changed++;
    const point = { x: (x + 0.5) / dpr, y: (y + 0.5) / dpr };
    if (!controls.some(control => rounded(point, control) <= 0) && Math.abs(rounded(point, panels.upper)) > 1) outside++;
  }
  return { changed, outside };
}

test("post chain: the last layer leaving while the scenes build leaves no target and no failed build", async ({ browser }) => {
  test.setTimeout(300000);
  await mkdir(directory, { recursive: true });
  const runs = [];
  for (const dropAt of [300, 600, 900, 1200, 1500]) {
    const { context, page, call, errors, warnings } = await open(browser, 1, `?dropAt=${dropAt}`);
    try {
      await page.waitForTimeout(3000);
      await call("settle");
      const post = await call("post"), instrument = await call("instrument"), state = await counts(call);
      const run = { dropAt, boot: await call("boot"), targets: Object.keys(post?.targets ?? {}), layers: instrument?.layers.length ?? 0, compile: instrument?.compile ?? null,
        mode: state.mode, warnings: warnings.filter(warning => gpuWarning.test(warning)), errors };
      runs.push(run);
      expect(run.layers, `dropAt ${dropAt}: no instrument layer left`).toBe(0);
      expect(run.targets, `dropAt ${dropAt}: no shared target left allocated`).toEqual([]);
      expect(run.compile?.failures ?? 0, `dropAt ${dropAt}: no build failed`).toBe(0);
      expect(run.warnings, `dropAt ${dropAt}: no WebGPU warning`).toEqual([]);
      expect(errors, `dropAt ${dropAt}: no page error`).toEqual([]);
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/lifecycle-drop.json`, JSON.stringify(runs, null, 2));
});

test("post chain: a failed registration is rebuilt without the optional stages, a failed minimal chain steps down with post and is retried after a DPR change", async ({ browser }) => {
  test.setTimeout(300000);
  await mkdir(directory, { recursive: true });
  const report = {};
  {
    const { context, call, errors } = await open(browser, 1, "?failRegistration=optional");
    try {
      await call("settle");
      await counts(call);
      const instrument = await call("instrument"), post = await call("post");
      report.optional = { layers: instrument.layers.map(layer => [layer.id, layer.status]), failures: instrument.compile.failures,
        stages: post.layers.map(layer => [layer.id, Object.fromEntries(Object.entries(layer.stages).map(([name, value]) => [name, value.status]))]), error: post.layers[0]?.stages.smaa.error };
      expect(report.optional.layers.map(([, status]) => status), "every layer draws its parts after the rebuild").toEqual(["ready", "ready", "ready"]);
      for (const layer of post.layers) {
        expect([layer.stages.smaa.status, layer.stages.bloom.status], `${layer.id}: SMAA and bloom read failed`).toEqual(["failed", "failed"]);
        expect(layer.stages.smaa.error, `${layer.id}: with the registration's error`).toMatch(/^registration failed with the optional stages on: .*test hook fails the registration/);
      }
      expect(errors.filter(error => !/post chain failed to register/.test(error)), "no other error").toEqual([]);
    } finally { await context.close(); }
  }
  {
    const { context, page, call } = await open(browser, 1, "?failRegistration=all");
    try {
      await call("settle");
      await counts(call);
      const failed = await call("instrument");
      report.all = { layers: failed.layers.map(layer => [layer.id, layer.status, [...new Set(layer.steppedDown.map(entry => entry.reason))]]), builds: failed.compile.builds };
      for (const layer of failed.layers) {
        expect(layer.status, `${layer.id}: failed, drawn at Relief`).toBe("failed");
        expect([...new Set(layer.steppedDown.map(entry => entry.reason))], `${layer.id}: a failed minimal chain is a post step-down`).toEqual(["post"]);
      }
      // The failure is no longer forced; a DPR change (the same CSS layout, so the same scene structure) retries it.
      await call("setFailRegistration", null);
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 2, mobile: false });
      await page.waitForFunction(() => window.devicePixelRatio === 2);
      await call("render");
      const canvas = await page.evaluate(() => [...document.querySelectorAll("canvas")].map(element => element.width));
      await counts(call);
      const retried = await call("instrument");
      report.all.afterDprChange = { canvas, layers: retried.layers.map(layer => [layer.id, layer.status]), builds: retried.compile.builds };
      expect(canvas, "the canvas follows the new DPR").toEqual([viewport.width * 2]);
      expect(retried.compile.builds, "the failed builds are retried").toBeGreaterThan(failed.compile.builds);
      expect(report.all.afterDprChange.layers.map(([, status]) => status), "and now every layer draws its parts").toEqual(["ready", "ready", "ready"]);
      await cdp.detach();
    } finally { await context.close(); }
  }
  await writeFile(`${directory}/lifecycle-registration.json`, JSON.stringify(report, null, 2));
});

test("post chain: a layer added and removed beside two live layers keeps the targets and the clip, under reduced motion too", async ({ browser }) => {
  test.setTimeout(300000);
  await mkdir(directory, { recursive: true });
  const { context, page, call, errors, warnings } = await open(browser, 1);
  const report = {};
  try {
    await call("settle");
    await counts(call);
    await call("cancel", "clipped");
    await counts(call);
    report.removed = { layers: (await call("instrument")).layers.map(layer => [layer.id, layer.status]), targets: Object.keys((await call("post")).targets), clip: await outsideControls(call, page, 1) };
    expect((await call("instrument")).layers.length, "the removed layer stays removed through the pixel check").toBe(2);
    expect(report.removed.layers, "the two live layers draw").toEqual([["lower", "ready"], ["upper", "ready"]]);
    expect(report.removed.targets.length, "the targets stay while layers use them").toBeGreaterThan(3);
    expect(report.removed.clip.outside, "nothing outside the controls").toBe(0);
    expect(report.removed.clip.changed, "the parts draw").toBeGreaterThan(10000);
    await call("restore", "clipped");
    await counts(call);
    report.restored = { layers: (await call("instrument")).layers.map(layer => [layer.id, layer.status]), clip: await outsideControls(call, page, 1) };
    expect(report.restored.layers.map(([, status]) => status), "the layer comes back").toEqual(["ready", "ready", "ready"]);
    expect(report.restored.clip.outside, "nothing outside the controls").toBe(0);
    expect(report.restored.clip.changed, "the restored layer draws its parts again").toBeGreaterThan(report.removed.clip.changed);
    // Reduced motion: the chain is unchanged and frames still draw.
    await page.emulateMedia({ reducedMotion: "reduce" });
    report.reduced = await call("idle", 30);
    await counts(call);
    report.reduced.clip = await outsideControls(call, page, 1);
    expect(report.reduced.gpuFrames, "frames draw under reduced motion").toBeGreaterThan(20);
    expect(report.reduced.clip.outside, "nothing outside the controls under reduced motion").toBe(0);
    // The last layer leaves: the targets are released.
    await call("setPlain", true);
    for (let tries = 0; tries < 50 && Object.keys((await call("post"))?.targets ?? {}).length; tries++) await page.waitForTimeout(100);
    report.released = Object.keys((await call("post"))?.targets ?? {});
    expect(report.released, "the targets are released with the last layer").toEqual([]);
    await counts(call);
    report.warnings = warnings.filter(warning => gpuWarning.test(warning));
    expect(report.warnings, "no WebGPU warning").toEqual([]);
    expect(errors, "no page error").toEqual([]);
  } finally {
    await writeFile(`${directory}/lifecycle-layers.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
