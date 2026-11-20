/**
 * The shared browser contract for framework adapters over `@underglass/core`. Each adapter's playground
 * page (`vanilla.html` with plain DOM, `vue.html` with `@underglass/vue`, ...) renders the same small app
 * and exposes it as `window.frameworkProbe`; `frameworkContract` drives it with real pointer and keyboard
 * input and proves the GPU-first contract for that adapter: supported content, structure and transform
 * updates stay GPU-presented with fresh pixels and correct native hits, disable/enable keep the original
 * root and state, and disposal unmounts the framework root and releases every resource.
 *
 * The page app (all coordinates in the 640x420 `#frame`):
 * - layer `panel` at (20,20) 280x220, `rgb(240,30,60)`: `#text`, `#count` ("Count N"), `#name` input,
 *   `#toggle`, and `#swatch` (60x40, 12px from the panel's bottom-right corner) that `#toggle` swaps
 *   between `rgb(20,120,220)` and `rgb(250,200,20)`;
 * - layer `side` at (340,20) 160x100, `rgb(20,200,90)`, with `#side-button` that also increments the count;
 * - `frameworkProbe.addLayer()` / `removeLayer()` add and remove layer `extra` at (520,20) 80x40,
 *   `rgb(38,104,215)`, through the framework's own rendering.
 *
 * `frameworkCases` declares one more test per case, each on a fresh page opened with `?cases` under GPU, for the
 * structural changes a framework makes to a layer's identity: an element enrolled by ref (`useSurfaceRef`,
 * `controller.enroll`) or registered by the layer component (`Surface`, the module's `enroll`) unmounted and
 * remounted, replaced in one update by a new element with the same id (a `key` swap), renamed and made decorative;
 * a `Presence` unmounted mid-exit and flipped back mid-exit; and a second mount whose first render throws. The case
 * layers are described in `examples/playground/src/demo/framework-probe.ts`.
 */
import { test, expect } from "./current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

export const colors = {
  panel: [240, 30, 60, 255], side: [20, 200, 90, 255], extra: [38, 104, 215, 255],
  blue: [20, 120, 220, 255], yellow: [250, 200, 20, 255],
};
// Sample points in frame CSS pixels: empty panel background, swatch centre, side and extra backgrounds.
const points = { panel: { x: 30, y: 230 }, swatch: { x: 258, y: 208 }, side: { x: 490, y: 110 }, extra: { x: 590, y: 50 } };

/**
 * Screenshots `#frame` (saved as `<name>.png` under `directory`) and returns a sampler for frame CSS
 * points, scaled by the screenshot's own pixel ratio so it holds at any DPR.
 */
async function frame(page, directory, name) {
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
  const scale = png.width / 640;
  return ({ x, y }) => {
    const offset = (Math.floor(y * scale) * png.width + Math.floor(x * scale)) * 4;
    return [...png.data.subarray(offset, offset + 4)];
  };
}
// Solid colours composite exactly, but allow one unit for rounding in the GPU blend.
function expectColor(actual, expected, label) {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index]), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(1));
}
const state = page => page.evaluate(() => window.frameworkProbe.state());
const settle = page => page.evaluate(() => window.frameworkProbe.controller.settle());
// Frame-relative point to viewport coordinates.
async function viewport(page, point) {
  const box = await page.locator("#frame").boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
}

/**
 * Runs the whole contract on `path` at device pixel ratio `dpr`, writing screenshots and a JSON report to
 * `directory`. `framework` is the name the page reports in `state().framework`.
 */
export async function frameworkContract(browser, { path, framework, dpr, directory }) {
  await mkdir(directory, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const report = { framework, dpr };
  try {
    await page.goto(path);
    await page.waitForFunction(() => window.frameworkProbe);
    const startup = await state(page);
    expect(startup.framework).toBe(framework);
    expect(startup.mode).toBe("dom");
    expect(startup.layers.map(layer => layer.id)).toEqual(["panel", "side"]);
    const dom = await frame(page, directory, `${framework}-${dpr}-dom`);
    expectColor(dom(points.panel), colors.panel, "DOM panel");
    expectColor(dom(points.swatch), colors.blue, "DOM swatch");

    // Explicit admission: GPU must present the same pixels the DOM showed.
    const admission = await page.evaluate(() => window.frameworkProbe.controller.enable());
    expect(admission.mode, admission.reason).toBe("gpu");
    await settle(page);
    const gpu = await frame(page, directory, `${framework}-${dpr}-gpu`);
    for (const key of ["panel", "swatch", "side"]) expect(gpu(points[key]), key).toEqual(dom(points[key]));
    report.admission = await state(page);

    // A framework content update from a trusted click: GPU stays, the canvas uploads and shows fresh pixels.
    const beforeToggle = await state(page);
    await page.locator("#toggle").click();
    await settle(page);
    const toggled = await state(page);
    expect(toggled.mode, toggled.reason).toBe("gpu");
    expect(toggled.swatch).toBe("yellow");
    expect(toggled.metrics.uploads).toBeGreaterThan(beforeToggle.metrics.uploads);
    expectColor((await frame(page, directory, `${framework}-${dpr}-toggled`))(points.swatch), colors.yellow, "GPU swatch after update");

    // Native controls on both layers keep working and the framework state follows.
    await page.locator("#count").click();
    await page.locator("#side-button").click();
    await expect(page.locator("#count")).toHaveText("Count 2");
    await page.locator("#name").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`${framework} native`);
    const typed = await state(page);
    expect(typed.name).toBe(`${framework} native`);
    expect(typed.count).toBe(2);
    expect(typed.mode).toBe("gpu");

    // A transform moves pixels and native hit geometry together: the toggle's translated centre must be
    // the element the browser hits, and a trusted click there must reach it.
    await page.evaluate(() => window.frameworkProbe.controller.setTransform("panel", { x: 30, y: 10 }));
    await settle(page);
    const moved = { x: points.swatch.x + 30, y: points.swatch.y + 10 };
    expectColor((await frame(page, directory, `${framework}-${dpr}-translated`))(moved), colors.yellow, "translated swatch");
    const toggleCentre = await page.locator("#toggle").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, toggleCentre)).toBe("toggle");
    await page.mouse.click(toggleCentre.x, toggleCentre.y);
    await settle(page);
    expect((await state(page)).swatch).toBe("blue");
    expectColor((await frame(page, directory, `${framework}-${dpr}-translated-toggled`))(moved), colors.blue, "translated swatch after update");
    // A point inside the untranslated swatch (228..288, 188..228) but left of the translated one no longer
    // hits it.
    const stale = await viewport(page, { x: 240, y: 192 });
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, stale)).not.toBe("swatch");

    // A structural update through the framework adds and removes a layer without leaving GPU.
    await page.evaluate(() => window.frameworkProbe.addLayer());
    await settle(page);
    const added = await state(page);
    expect(added.mode, added.reason).toBe("gpu");
    expect(added.layers.map(layer => layer.id)).toEqual(["panel", "side", "extra"]);
    expectColor((await frame(page, directory, `${framework}-${dpr}-added`))(points.extra), colors.extra, "added layer");
    await page.evaluate(() => window.frameworkProbe.removeLayer());
    await settle(page);
    const removed = await state(page);
    expect(removed.mode, removed.reason).toBe("gpu");
    expect(removed.layers.map(layer => layer.id)).toEqual(["panel", "side"]);
    // No update since admission needed a new admission attempt.
    expect(removed.metrics.admission.attempts).toBe(report.admission.metrics.admission.attempts);
    report.updates = { toggled, typed, added, removed };

    // Explicit disable returns the same original root and controls with their state; re-enable admits again.
    await page.evaluate(() => window.frameworkProbe.controller.disable());
    const recovered = await state(page);
    expect(recovered.mode).toBe("dom");
    expect(recovered.sameRoot && recovered.sameInput).toBe(true);
    expect(recovered.name).toBe(`${framework} native`);
    expect(recovered.count).toBe(2);
    expect(recovered.mounts).toBe(startup.mounts);
    expect((await page.evaluate(() => window.frameworkProbe.controller.enable())).mode).toBe("gpu");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 3");
    await page.evaluate(() => window.frameworkProbe.controller.disable());

    // Disposal unmounts the framework root exactly once and releases every resource.
    const disposed = await page.evaluate(() => window.frameworkProbe.dispose());
    expect(Object.values(disposed.resources).every(value => value === 0), JSON.stringify(disposed.resources)).toBe(true);
    expect(Object.values(disposed.runtimeResources).every(value => value === 0), JSON.stringify(disposed.runtimeResources)).toBe(true);
    expect(disposed.mounts).toBe(1);
    expect(disposed.cleanups).toBe(1);
    expect(errors).toEqual([]);
    report.disposed = disposed;
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/${framework}-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await page.close();
  }
}

const caseColors = {
  base: [130, 40, 200, 255], swapped: [200, 40, 130, 255], renamed: [250, 170, 20, 255], decorative: [90, 90, 90, 255],
  stage: [20, 170, 170, 255], host: [220, 120, 20, 255], white: [255, 255, 255, 255],
};
// Each case layer's top-left corner (its native button is under (x + 20, y + 18)) and a sampled point of its
// background, clear of the button and of the 8px a mid-transition `Presence` layer has moved.
const caseLayers = {
  ref: { x: 340, y: 140, sample: { x: 470, y: 230 } }, surface: { x: 490, y: 140, sample: { x: 620, y: 230 } },
  stage: { x: 20, y: 270, sample: { x: 100, y: 380 } }, host: { x: 220, y: 270, sample: { x: 300, y: 380 } },
};
const firstRender = /The application failed in its first render/;
// React 18's development build reports the render error it replays, with this notice, before the mount rethrows it.
const react18Notice = /^console: The above error occurred in the <Throws> component/;
const ids = state => state.layers.map(layer => layer.id);

/**
 * Starts recording, after every frame, the runtime's mode and reason. Each sample is taken in a task posted from a
 * frame callback, so after that frame was presented; `stayedOnGPU` stops it.
 */
async function recordFrames(page) {
  await page.evaluate(() => {
    const samples = [];
    let active = true;
    const tick = () => {
      if (!active) return;
      setTimeout(() => { const state = window.frameworkProbe.controller.state(); samples.push({ mode: state.mode, reason: state.reason, gpuFrames: state.metrics.gpuFrames }); }, 0);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.contractFrames = () => { active = false; return samples; };
  });
}
/** Stops `recordFrames` and asserts that every frame since was GPU-presented and that GPU frames were drawn meanwhile. */
async function stayedOnGPU(page, label) {
  const samples = await page.evaluate(() => window.contractFrames());
  expect(samples.length, `${label}: frames recorded`).toBeGreaterThanOrEqual(2);
  for (const sample of samples) expect(sample.mode, `${label}, a frame left the GPU: ${sample.reason}`).toBe("gpu");
  expect(samples.at(-1).gpuFrames, `${label}: GPU frames drawn`).toBeGreaterThan(samples[0].gpuFrames);
  return samples.length;
}
const changeLayer = async (page, layer, change) => {
  await page.evaluate(([layer, change]) => window.frameworkProbe.changeLayer(layer, change), [layer, change]);
  await settle(page);
};
const presence = (page, target, change) => page.evaluate(([target, change]) => window.frameworkProbe.presence(target, change), [target, change]);
const cases = page => page.evaluate(() => window.frameworkProbe.cases);
/** Clicks, with the real mouse, where the frame shows the button of case layer `layer`, and checks the button's new text. */
async function clickCase(page, layer, text) {
  const { x, y } = caseLayers[layer];
  const point = await viewport(page, { x: x + 20, y: y + 18 });
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point), `the native hit under the ${layer} button`).toBe(`${layer}-button`);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(`#${layer}-button`)).toHaveText(text);
}
/** The sampled colour of case layer `layer` in a new screenshot `name`. */
async function caseColor(page, directory, name, layer) {
  return (await frame(page, directory, name))(caseLayers[layer].sample);
}
/**
 * The panel still works on the GPU: a real click on `#toggle` lands, the canvas uploads and shows the swatch's new
 * colour, and GPU stays active.
 */
async function panelResponds(page, directory, name) {
  const before = await state(page);
  const next = before.swatch === "blue" ? "yellow" : "blue";
  const centre = await page.locator("#toggle").evaluate(node => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, centre)).toBe("toggle");
  await page.mouse.click(centre.x, centre.y);
  await settle(page);
  const after = await state(page);
  expect(after.mode, after.reason).toBe("gpu");
  expect(after.swatch).toBe(next);
  expect(after.metrics.uploads).toBeGreaterThan(before.metrics.uploads);
  expectColor((await frame(page, directory, name))(points.swatch), colors[next], `${name}: swatch after a click`);
}
/** Asserts the `Presence` layer `layer` is mid-transition on the canvas: channel `channel` strictly between its rest value and white. */
async function midTransition(page, directory, name, layer, channel) {
  const value = await caseColor(page, directory, name, layer);
  expect(value[channel], `${name}: part-faded`).toBeGreaterThan(caseColors[layer][channel] + 2);
  expect(value[channel], `${name}: part-faded`).toBeLessThan(253);
  return value;
}

// The structural cases for one kind of layer: `ref` (enrolled by ref) or `surface` (registered by the layer component).
const layerCases = kind => {
  const what = kind === "ref" ? "an element enrolled by ref" : "a layer component's element";
  return [{
    id: `${kind}-unmount`, title: `${what} unmounted and mounted again keeps GPU, leaves the canvas and comes back`,
    async run({ page, directory, name }) {
      expectColor(await caseColor(page, directory, `${name}-start`, kind), caseColors.base, "before");
      await clickCase(page, kind, `${kind} g0 1`);
      const attempts = (await state(page)).metrics.admission.attempts;
      await recordFrames(page);
      await changeLayer(page, kind, "unmount");
      const gone = await state(page);
      expect(gone.mode, gone.reason).toBe("gpu");
      expect(ids(gone)).not.toContain(kind);
      await expect(page.locator(`#${kind}-button`)).toHaveCount(0);
      expectColor(await caseColor(page, directory, `${name}-unmounted`, kind), caseColors.white, "the unmounted layer is gone from the canvas");
      await panelResponds(page, directory, `${name}-unmounted-panel`);
      await changeLayer(page, kind, "mount");
      expect(ids(await state(page))).toContain(kind);
      expectColor(await caseColor(page, directory, `${name}-mounted`, kind), caseColors.base, "the mounted layer is drawn again");
      // A new element, with its own clicks from 0.
      await clickCase(page, kind, `${kind} g0 1`);
      const frames = await stayedOnGPU(page, "unmount and mount");
      expect((await state(page)).metrics.admission.attempts).toBe(attempts);
      return { frames };
    },
  }, {
    id: `${kind}-swap`, title: `${what} replaced by a new element with the same id in one update keeps GPU and hits the new element`,
    async run({ page, directory, name }) {
      await clickCase(page, kind, `${kind} g0 1`);
      const attempts = (await state(page)).metrics.admission.attempts;
      await recordFrames(page);
      await changeLayer(page, kind, "swap");
      const swapped = await state(page);
      expect(swapped.mode, swapped.reason).toBe("gpu");
      expect(ids(swapped).filter(id => id === kind)).toEqual([kind]);
      await expect(page.locator(`#${kind}-button`)).toHaveText(`${kind} g1 0`);
      expectColor(await caseColor(page, directory, `${name}-swapped`, kind), caseColors.swapped, "the new element's pixels");
      await clickCase(page, kind, `${kind} g1 1`);
      await panelResponds(page, directory, `${name}-swapped-panel`);
      const frames = await stayedOnGPU(page, "key swap");
      expect((await state(page)).metrics.admission.attempts).toBe(attempts);
      return { frames };
    },
  }, {
    id: `${kind}-rename`, title: `${what} whose id changes keeps GPU, its element and its state`,
    async run({ page, directory, name }) {
      await clickCase(page, kind, `${kind} g0 1`);
      const attempts = (await state(page)).metrics.admission.attempts;
      await recordFrames(page);
      await changeLayer(page, kind, "rename");
      const renamed = await state(page);
      expect(renamed.mode, renamed.reason).toBe("gpu");
      expect(ids(renamed)).toContain(`${kind}-renamed`);
      expect(ids(renamed)).not.toContain(kind);
      expectColor(await caseColor(page, directory, `${name}-renamed`, kind), caseColors.renamed, "the renamed layer's new pixels");
      // The same element and component state: the click count goes on.
      await clickCase(page, kind, `${kind} g0 2`);
      await panelResponds(page, directory, `${name}-renamed-panel`);
      const frames = await stayedOnGPU(page, "id change");
      expect((await state(page)).metrics.admission.attempts).toBe(attempts);
      return { frames };
    },
  }, {
    id: `${kind}-decorative`, title: `${what} made decorative and interactive again keeps GPU and its native hits`,
    async run({ page, directory, name }) {
      const attempts = (await state(page)).metrics.admission.attempts;
      await recordFrames(page);
      await changeLayer(page, kind, "decorate");
      const decorated = await state(page);
      expect(decorated.mode, decorated.reason).toBe("gpu");
      expect(ids(decorated)).toContain(kind);
      await expect(page.locator(`#${kind}-button`)).toHaveCount(0);
      expectColor(await caseColor(page, directory, `${name}-decorative`, kind), caseColors.decorative, "the decorative layer's pixels");
      await panelResponds(page, directory, `${name}-decorative-panel`);
      await changeLayer(page, kind, "undecorate");
      const restored = await state(page);
      expect(restored.mode, restored.reason).toBe("gpu");
      expectColor(await caseColor(page, directory, `${name}-interactive`, kind), caseColors.base, "the interactive layer's pixels");
      await clickCase(page, kind, `${kind} g0 1`);
      const frames = await stayedOnGPU(page, "decorative change");
      expect((await state(page)).metrics.admission.attempts).toBe(attempts);
      return { frames };
    },
  }];
};

const presenceCases = [{
  id: "presence-unmount", presence: true, title: "a Presence unmounted mid-exit ends its transition without a completion and keeps GPU",
  async run({ page, directory, name }) {
    expectColor(await caseColor(page, directory, `${name}-start`, "stage"), caseColors.stage, "before");
    await recordFrames(page);
    await presence(page, "stage", "hide");
    await page.waitForTimeout(600);
    const exiting = await midTransition(page, directory, `${name}-exiting`, "stage", 0);
    expect((await state(page)).runtimeResources.declarativeMotions).toBe(1);
    // The `Presence` goes, its enrolled section stays.
    await presence(page, "stage", "unmount");
    await expect(page.locator("#stage-card")).toHaveCount(0);
    expect((await state(page)).runtimeResources.declarativeMotions).toBe(0);
    // Past the end the exit would have had.
    await page.waitForTimeout(3000);
    const after = await state(page);
    expect(after.mode, after.reason).toBe("gpu");
    expect(ids(after)).toContain("stage");
    expectColor(await caseColor(page, directory, `${name}-removed`, "stage"), caseColors.white, "the card is gone from the canvas");
    expect((await cases(page)).completions).toEqual([]);
    await panelResponds(page, directory, `${name}-panel`);
    return { exiting, frames: await stayedOnGPU(page, "Presence unmount") };
  },
}, {
  id: "presence-unmount-layer", presence: true, title: "a Presence unmounted with its layer mid-exit reports no completion and keeps GPU",
  async run({ page, directory, name }) {
    expectColor(await caseColor(page, directory, `${name}-start`, "host"), caseColors.host, "before");
    await recordFrames(page);
    await presence(page, "host", "hide");
    await page.waitForTimeout(600);
    const exiting = await midTransition(page, directory, `${name}-exiting`, "host", 1);
    expect((await state(page)).runtimeResources.declarativeMotions).toBe(1);
    await presence(page, "host", "unmount");
    await expect(page.locator("#host")).toHaveCount(0);
    await page.waitForTimeout(3000);
    const after = await state(page);
    expect(after.mode, after.reason).toBe("gpu");
    expect(ids(after)).not.toContain("host");
    expect(after.runtimeResources.declarativeMotions).toBe(0);
    expectColor(await caseColor(page, directory, `${name}-removed`, "host"), caseColors.white, "the layer is gone from the canvas");
    expect((await cases(page)).completions).toEqual([]);
    await panelResponds(page, directory, `${name}-panel`);
    return { exiting, frames: await stayedOnGPU(page, "Presence unmount with its layer") };
  },
}, {
  id: "presence-flip", presence: true, title: "a Presence whose present flips back mid-exit enters again, reports one completion and keeps its hits",
  async run({ page, directory, name }) {
    await recordFrames(page);
    await presence(page, "stage", "hide");
    await page.waitForTimeout(600);
    const exiting = await midTransition(page, directory, `${name}-exiting`, "stage", 0);
    await presence(page, "stage", "show");
    await page.waitForTimeout(600);
    const entering = await midTransition(page, directory, `${name}-entering`, "stage", 0);
    // The exit it replaced is not reported; the enter is, once it ends.
    await expect.poll(async () => (await cases(page)).completions.length, { timeout: 8000 }).toBe(1);
    expect((await cases(page)).completions).toEqual([{ status: "completed", reason: "Finished", presence: "stage" }]);
    await settle(page);
    const after = await state(page);
    expect(after.mode, after.reason).toBe("gpu");
    expect(after.runtimeResources.declarativeMotions).toBe(0);
    expectColor(await caseColor(page, directory, `${name}-rest`, "stage"), caseColors.stage, "the card at rest");
    // At rest the card's native button is where the canvas shows it.
    await clickCase(page, "stage", "stage 1");
    await panelResponds(page, directory, `${name}-panel`);
    return { exiting, entering, frames: await stayedOnGPU(page, "present flipped back") };
  },
}];

const firstRenderCase = {
  id: "first-render-error", allowed: [firstRender, react18Notice],
  title: "a second mount whose first render throws makes the mount throw, leaves its hosts as they were and keeps the first app on the GPU",
  async run({ page, directory, name, report }) {
    await recordFrames(page);
    const failed = report.failed = await page.evaluate(() => window.frameworkProbe.mountSecond("throws"));
    expect(failed.error, "the mount threw the render's error").toMatch(firstRender);
    expect(failed.mounted).toBe(false);
    expect(failed.after, "the hosts are left as they were").toBe(failed.before);
    // The same hosts take a healthy mount, which the probe disposes again.
    const healthy = report.healthy = await page.evaluate(() => window.frameworkProbe.mountSecond("healthy"));
    expect(healthy.error).toBe(null);
    expect(healthy.mounted).toBe(true);
    expect(healthy.layers).toEqual(["second"]);
    await panelResponds(page, directory, `${name}-panel`);
    const count = await page.locator("#count").evaluate(node => { const rect = node.getBoundingClientRect(); return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; });
    await page.mouse.click(count.x, count.y);
    await expect(page.locator("#count")).toHaveText("Count 1");
    return { failed, healthy, frames: await stayedOnGPU(page, "failed second mount") };
  },
};

const allCases = [...layerCases("ref"), ...layerCases("surface"), ...presenceCases, firstRenderCase];

/**
 * Declares one test per case (see the top of this file) for the adapter page at `path`, at DPR 1, each on a fresh page
 * with `?cases` under GPU and ending with disable and disposal releasing every resource. Every case asserts that GPU
 * stayed active in every frame and needed no new admission, that the canvas shows the change, and that real clicks land
 * on the native controls the canvas shows. Screenshots and a JSON report per case go to `directory`.
 *
 * - `label` names the tests (default `framework`); `framework` is what the page reports in `state().framework`.
 * - `gaps` maps a case id to the defect that makes it fail on this adapter: that case is declared `test.fixme` with
 *   the defect as its annotation. With `CANVAS_CONTRACT_GAPS=run` it runs as an ordinary test instead.
 * - `inapplicable` maps a case id to why this adapter has no such case: it is declared skipped, with that reason.
 *   The `presence-*` cases need a page probe with `presence`.
 */
export function frameworkCases({ path, framework, label = framework, directory, gaps = {}, inapplicable = {} }) {
  const unknown = Object.keys({ ...gaps, ...inapplicable }).filter(id => !allCases.some(entry => entry.id === id));
  if (unknown.length) throw new Error(`Unknown framework contract cases: ${unknown.join(", ")}`);
  for (const entry of allCases) {
    const title = `${label}: ${entry.title}`;
    if (inapplicable[entry.id]) {
      test.skip(title, { annotation: { type: "inapplicable", description: inapplicable[entry.id] } }, () => {});
      continue;
    }
    const gap = gaps[entry.id];
    const declare = gap && process.env.CANVAS_CONTRACT_GAPS !== "run" ? test.fixme : test;
    declare(title, gap ? { annotation: { type: "gap", description: gap } } : {}, async ({ browser }) => {
      await mkdir(directory, { recursive: true });
      const name = `${label}-${entry.id}`.replace(/[^\w-]+/g, "-");
      const page = await browser.newPage({ viewport: { width: 900, height: 750 } });
      const errors = [];
      page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
      page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
      const report = { framework, label, case: entry.id };
      try {
        await page.goto(`${path}${path.includes("?") ? "&" : "?"}cases`);
        await page.waitForFunction(() => window.frameworkProbe);
        expect((await state(page)).framework).toBe(framework);
        if (entry.presence) expect(await page.evaluate(() => typeof window.frameworkProbe.presence), "the page has Presence").toBe("function");
        const admission = await page.evaluate(() => window.frameworkProbe.controller.enable());
        expect(admission.mode, admission.reason).toBe("gpu");
        await settle(page);
        report.result = await entry.run({ page, directory, name, report });
        // Explicit disable and disposal release everything, including what the case changed.
        await page.evaluate(() => window.frameworkProbe.controller.disable());
        const disposed = await page.evaluate(() => window.frameworkProbe.dispose());
        expect(Object.values(disposed.resources).every(value => value === 0), JSON.stringify(disposed.resources)).toBe(true);
        expect(Object.values(disposed.runtimeResources).every(value => value === 0), JSON.stringify(disposed.runtimeResources)).toBe(true);
        expect(errors.filter(message => !(entry.allowed ?? []).some(pattern => pattern.test(message)))).toEqual([]);
      } finally {
        report.errors = errors;
        await writeFile(`${directory}/${name}.json`, JSON.stringify(report, null, 2));
        await page.close();
      }
    });
  }
}
