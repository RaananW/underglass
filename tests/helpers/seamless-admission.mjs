/**
 * Shared fixtures of the seamless-admission suites (`tests/browser/seamless-admission*.test.mjs`, issue #202): the two page
 * specs (the surface page and the heavy Instrument page), baselines, and recording `enable()` frame by frame.
 */
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { referencePoints, scoreFrame, startRecording } from "./frame-recorder.mjs";

export const healthy = /^Current content=drawable owning WebGPU canvas/;
// A frame shows the content when this share of the reference pixels holds a DOM or GPU baseline colour, and no region
// of the page (a layer, a panel) falls below `regionMin` (a frame missing one layer fails).
export const CONTENT = 0.9;
export const hash = bytes => createHash("sha256").update(PNG.sync.read(bytes).data).digest("hex");

export const surface = {
  name: "surface",
  viewport: { width: 700, height: 600 },
  regionMin: 0.85,
  open: async page => { await page.goto("/surface.html?dom"); await page.waitForFunction(() => window.surfaceProbe); await page.waitForTimeout(300); },
  enable: page => page.evaluate(() => window.surfaceProbe.enable().then(() => window.surfaceProbe.settle()).then(() => window.surfaceProbe.state())),
  disable: page => page.evaluate(() => window.surfaceProbe.disable()),
  state: page => page.evaluate(() => window.surfaceProbe.state()),
  /** Whether the page is in GPU presentation when it opens (it must be disabled before an admission is recorded). */
  startsInGpu: false,
};
export const heavy = {
  name: "instrument-post-core",
  viewport: { width: 1920, height: 1080 },
  // The post chain builds progressively for about half a second after admission (a few flat pixels still settling), so the
  // regions of this page are held to a lower bar; a panel missing from a frame empties its whole region.
  regionMin: 0.45,
  open: async page => {
    await page.goto("/instrument-post-core.html");
    await page.waitForFunction(() => window.postCore, null, { timeout: 60000 });
    await page.addStyleTag({ content: "#status { display: none !important; }" });
  },
  enable: page => page.evaluate(async () => { const api = await window.postCore.ready; await api.enable(); return api.counts(); }),
  disable: page => page.evaluate(async () => (await window.postCore.ready).disable()),
  state: page => page.evaluate(async () => (await window.postCore.ready).counts()),
  startsInGpu: true,
};

/** Opens the page in a fresh context at the DPR; `init` runs in every document before its scripts. */
export async function open(browser, spec, dpr, init) {
  const context = await browser.newContext({ viewport: spec.viewport, deviceScaleFactor: dpr });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await spec.open(page);
  return { page, errors, context };
}

/** The reference pixels of the page: one DOM screenshot and one GPU screenshot of the same layout. */
export async function baselines(browser, spec, dpr) {
  const { page, context } = await open(browser, spec, dpr);
  try {
    let dom, gpu;
    if (spec.startsInGpu) {
      await page.waitForTimeout(500); gpu = await page.screenshot();
      await spec.disable(page); await page.waitForTimeout(500); dom = await page.screenshot();
    } else {
      dom = await page.screenshot();
      await spec.enable(page); await page.waitForTimeout(500); gpu = await page.screenshot();
    }
    return { points: referencePoints(dom, gpu), dom, gpu };
  } finally { await context.close(); }
}

/** Scores the frames a recorder returned that were presented from `startedAt` (epoch ms) on. */
export const scoreFrames = (frames, startedAt, points) =>
  frames.filter(frame => frame.at >= startedAt - 100).map(frame => ({ at: Math.round(frame.at - startedAt), ...scoreFrame(frame, points) }));

/**
 * Records the frames from `enable()` until GPU has been active for a while. `prepare(page)` runs once the page is in DOM
 * presentation, before recording. Returns the scored frames, the enable result and the page state.
 */
export async function recordEnable(page, spec, dpr, points, prepare) {
  if (spec.startsInGpu) { await spec.disable(page); await page.waitForTimeout(500); }
  await prepare?.(page);
  const recorder = await startRecording(page, { ...spec.viewport, dpr });
  await page.waitForTimeout(400);
  const startedAt = await page.evaluate(() => Date.now());
  const result = await spec.enable(page).catch(error => ({ enableError: String(error) }));
  await page.waitForTimeout(600);
  const scored = scoreFrames(await recorder.stop(), startedAt, points);
  return { scored, result, state: await spec.state(page) };
}
/** The frames lacking the content: below the overall bar, or with a region (a layer, a panel) missing. */
export const blank = (scored, spec = surface) => scored.filter(frame => frame.match < CONTENT || frame.worst < spec.regionMin);
export const describe = (scored, spec = surface) => scored.map(frame =>
  `${!blank([frame], spec).length ? "ok" : frame.white > 0.5 ? "WHITE" : frame.black > 0.5 ? "BLACK" : "BAD"}(${frame.match.toFixed(2)}/${frame.worst.toFixed(2)})@${frame.at}`).join(" ");
