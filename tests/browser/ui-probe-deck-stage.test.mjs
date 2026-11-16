/**
 * Probe suite for a presentation-like page on `ui-probe-deck-stage.html` (`window.deckProbe`): one stage that sticks to
 * the viewport while a tall track scrolls past, with scroll position driving the change from one section to the next.
 * It is the evidence behind the underglass.dev home page design (`docs/showcase-deck-probe.md`), and proves on the
 * installed browser that:
 *
 * - a scroll-scrubbed change (a tilt, an inert custom-WGSL materialise and a decorative ripple) stays on the GPU and
 *   recaptures nothing while it runs;
 * - sections enrolled only while on stage (kept in the document, or rendered on demand) present fresh pixels, take native
 *   hits when they come to rest, are inert while they change, and keep their React state;
 * - GPU presentation survives scrolling into and out of the pinned range, fractional scroll offsets and a window resize;
 * - no presented frame is blank while the wheel scrolls through every section;
 * - ordinary DOM is a flowing page of the same height, and the layout changes to the deck and back at the same scroll
 *   position with the same React state;
 * - focus moving into a parked section brings it on stage.
 *
 * Specimen: a 1280x720 window. The backdrop holds a marker block rgb(90,60,200); each section has a copy layer and a
 * panel layer of one flat colour with a counting button and an input.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { startRecording } from "../helpers/frame-recorder.mjs";

const evidence = evidenceDirectory("ui-probe-deck-stage");
const colours = [[200, 40, 60], [40, 160, 90], [40, 90, 220], [230, 150, 20]];
const marker = [90, 60, 200];
const size = { width: 1280, height: 720 };
const report = {};

async function open(browser, { dpr = 1, query = "" } = {}) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: dpr });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-probe-deck-stage.html${query}`);
  await page.waitForFunction(() => window.deckProbe);
  return { page, errors };
}
/** Calls a method of the page's probe. */
const probe = (page, method, ...args) => page.evaluate(([name, values]) => window.deckProbe[name](...values), [method, args]);
/** The colour of the viewport at a CSS point; `name` also saves the screenshot as evidence. */
async function pixel(page, point, name) {
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.screenshot(name ? { path: `${evidence}/${name}.png` } : {}));
  const ratio = png.width / size.width;
  const offset = (Math.round(point.y * ratio) * png.width + Math.round(point.x * ratio)) * 4;
  return [...png.data.subarray(offset, offset + 3)];
}
const near = (a, b, tolerance = 3) => a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
const centre = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
/** A point of flat panel colour: clear of the button and the input, which sit at the panel's top left. */
const flat = box => ({ x: box.x + box.width - 30, y: box.y + box.height - 30 });
/** The id of the element a click at `point` would reach. */
const hit = (page, point) => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id ?? null, point);
/** Presses the section's button with a real click and expects its count. */
async function press(page, index, count) {
  const point = centre(await probe(page, "box", `count-${index}`));
  expect(await hit(page, point)).toBe(`count-${index}`);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator(`#count-${index}`)).toHaveText(`Count ${index + 1}: ${count}`);
}
async function enabled(page) {
  await probe(page, "go", 0);
  const state = await probe(page, "enable");
  expect(state.mode, state.reason).toBe("gpu");
  return state;
}

test.afterAll(async () => {
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2));
});

for (const dpr of [1, 2]) for (const park of ["unenroll", "unmount"]) test(`a scroll-scrubbed change stays on the GPU without recapture, DPR${dpr} park=${park}`, async ({ browser }) => {
  const { page, errors } = await open(browser, { dpr, query: `?park=${park}` });
  const tag = `dpr${dpr}-${park}`;
  try {
    await enabled(page);
    // At rest on the first section: its pixels, its button and its input.
    let state = await probe(page, "snapshot");
    expect(state.layers).toEqual(["backdrop", "copy-0", "panel-0"]);
    expect(near(await pixel(page, flat(await probe(page, "box", "panel-0")), `${tag}-rest-0`), colours[0])).toBe(true);
    await press(page, 0, 1);
    await page.locator("#input-0").click();
    await page.keyboard.type("typed");
    await expect(page.locator("#input-0")).toHaveValue("typed");
    // Parked sections stay in the document (unenroll) or are not rendered (unmount); either way they take no hit.
    expect(await page.locator("#count-1").count()).toBe(park === "unenroll" ? 1 : 0);
    if (park === "unenroll") expect(await page.getByRole("heading", { name: "Section 3" }).count()).toBe(1);

    // The change begins: the arriving section is enrolled and its panel carries the inert chain.
    const arrival = await page.evaluate(async () => {
      const started = performance.now();
      let frames = 0;
      scrollTo(0, scrollY + innerHeight * 0.5);
      for (; frames < 300; frames++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const now = window.deckProbe.snapshot();
        if (now.effects.includes("panel-1") && !now.busy && !now.dirty) break;
      }
      return { frames, ms: performance.now() - started };
    });
    report[`${tag}-arrival`] = arrival;
    state = await probe(page, "go", 0.5);
    expect(state.mode, state.reason).toBe("gpu");
    expect(state.errors).toEqual([]);
    expect(state.layers).toEqual(["backdrop", "copy-0", "panel-0", "copy-1", "panel-1"]);
    expect(state.effects).toEqual(expect.arrayContaining(["backdrop", "panel-1"]));
    await pixel(page, { x: 1, y: 1 }, `${tag}-half`);
    // Scrubbing forwards and backwards writes matrices and parameters only.
    // (A focused input's caret repaints its layer as it blinks, so focus leaves the input first.)
    await page.evaluate(() => document.activeElement?.blur());
    state = await probe(page, "go", 0.5);
    const captures = state.perLayer, trace = [{ p: 0.5, ...captures }];
    for (const p of [0.55, 0.6, 0.75, 0.9, 0.7, 0.9]) { state = await probe(page, "go", p); trace.push({ p, ...state.perLayer }); }
    report[`${tag}-scrub`] = trace;
    expect(state.mode, state.reason).toBe("gpu");
    expect(state.perLayer).toEqual(captures);
    expect(state.errors).toEqual([]);
    // While it changes, the arriving panel is inert: a click where its button is drawn reaches no button.
    const inertPoint = centre(await probe(page, "box", "count-1"));
    expect(await hit(page, inertPoint)).not.toMatch(/^count-/);
    await page.mouse.click(inertPoint.x, inertPoint.y);
    await expect(page.locator("#count-1")).toHaveText("Count 2: 0");
    await expect(page.locator("#count-0")).toHaveText("Count 1: 1");

    // At rest on the second section: fresh pixels and native hits, and the first is parked.
    state = await probe(page, "go", 1);
    expect(state).toMatchObject({ mode: "gpu", from: 1, to: null, errors: [] });
    expect(state.layers).toEqual(["backdrop", "copy-1", "panel-1"]);
    expect(state.effects).not.toContain("panel-1");
    expect(near(await pixel(page, flat(await probe(page, "box", "panel-1")), `${tag}-rest-1`), colours[1])).toBe(true);
    await press(page, 1, 1);

    // Back to the first section: the same React state where the section stayed in the document.
    state = await probe(page, "go", 0.4);
    expect(state).toMatchObject({ mode: "gpu", from: 0, to: 1, errors: [] });
    state = await probe(page, "go", 0);
    expect(state).toMatchObject({ mode: "gpu", from: 0, to: null, errors: [] });
    expect(near(await pixel(page, flat(await probe(page, "box", "panel-0"))), colours[0])).toBe(true);
    if (park === "unenroll") {
      await expect(page.locator("#input-0")).toHaveValue("typed");
      await press(page, 0, 2);
    } else await press(page, 0, 1);
    report[`${tag}-final`] = { captures: state.captures, gpuFrames: state.gpuFrames, effectRetries: state.effectRetries };
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test("the stage stays on the GPU scrolling into and out of the pinned range, and at fractional offsets", async ({ browser }) => {
  const { page, errors } = await open(browser);
  try {
    await enabled(page);
    // Above the track: the stage starts 320 px down the page and is cut by the bottom of the window.
    let state = await probe(page, "scroll", 0);
    expect(state).toMatchObject({ mode: "gpu", from: 0, to: null, errors: [] });
    expect(near(await pixel(page, flat(await probe(page, "box", "copy-0")), "above"), [32, 36, 56])).toBe(true);
    await press(page, 0, 1);
    // Half-way into the pin, at a fractional scroll offset.
    state = await probe(page, "scroll", 160.5);
    expect(state).toMatchObject({ mode: "gpu", from: 0, to: null, errors: [] });
    await press(page, 0, 2);
    // Pinned, half a pixel past a section's rest position.
    state = await probe(page, "go", 2, 0.5);
    expect(state).toMatchObject({ mode: "gpu", from: 2, to: null, errors: [] });
    expect(near(await pixel(page, flat(await probe(page, "box", "panel-2")), "fractional"), colours[2])).toBe(true);
    await press(page, 2, 1);
    // Past the end of the track: the stage has scrolled 100 px up out of the window.
    state = await probe(page, "go", 3, 100);
    expect(state).toMatchObject({ mode: "gpu", from: 3, to: null, errors: [] });
    expect((await probe(page, "box", "backdrop")).y).toBe(-100);
    expect(near(await pixel(page, flat(await probe(page, "box", "panel-3")), "below"), colours[3])).toBe(true);
    await press(page, 3, 1);
    // And back into the pin, mid-change, then at rest.
    state = await probe(page, "go", 2.5);
    expect(state).toMatchObject({ mode: "gpu", from: 2, to: 3, errors: [] });
    state = await probe(page, "go", 2);
    await press(page, 2, 2);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test("no presented frame is blank while the wheel scrolls through every section", async ({ browser }) => {
  const { page, errors } = await open(browser);
  try {
    await enabled(page);
    await page.mouse.move(640, 360);
    const recording = await startRecording(page, { ...size, dpr: 1 });
    // 3 sections of 720 px, 40 px at a time: the stage stays pinned the whole way.
    for (let step = 0; step < 54; step++) { await page.mouse.wheel(0, 40); await page.waitForTimeout(16); }
    await probe(page, "idle");
    const frames = await recording.stop();
    const state = await probe(page, "snapshot");
    expect(state).toMatchObject({ mode: "gpu", from: 3, to: null, errors: [] });
    expect(frames.length).toBeGreaterThan(20);
    // The backdrop's marker is under no section, so every frame shows it. Its ripple moves pixels by at most 6 px.
    const point = { x: size.width * 0.02 + 30, y: size.height * 0.04 + 12 };
    const missing = [];
    frames.forEach((frame, index) => {
      const png = PNG.sync.read(Buffer.from(frame.data, "base64")), ratio = png.width / size.width;
      const offset = (Math.round(point.y * ratio) * png.width + Math.round(point.x * ratio)) * 4;
      const colour = [...png.data.subarray(offset, offset + 3)];
      if (!near(colour, marker, 24)) missing.push({ index, colour });
    });
    report.wheel = { frames: frames.length, missing, captures: state.captures, gpuFrames: state.gpuFrames, effectRetries: state.effectRetries };
    expect(missing).toEqual([]);
    await press(page, 3, 1);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test("a window resize while pinned keeps GPU presentation and native hits", async ({ browser }) => {
  const { page, errors } = await open(browser);
  try {
    await enabled(page);
    await probe(page, "go", 1);
    await page.setViewportSize({ width: 1100, height: 650 });
    let state = await probe(page, "idle").then(() => probe(page, "snapshot"));
    expect(state.mode, state.reason).toBe("gpu");
    expect(state.errors).toEqual([]);
    state = await probe(page, "go", 1);
    expect(state).toMatchObject({ mode: "gpu", from: 1, to: null, errors: [] });
    const box = await probe(page, "box", "backdrop");
    // (A real window's scrollbar takes its width from the stage.)
    expect([box.width, box.height]).toEqual([await page.evaluate(() => document.documentElement.clientWidth), 650]);
    await press(page, 1, 1);
    state = await probe(page, "go", 1.5);
    expect(state).toMatchObject({ mode: "gpu", from: 1, to: 2, errors: [] });
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test("a fixed status box over the stage does not stop admission", async ({ browser }) => {
  const { page, errors } = await open(browser, { query: "?hud" });
  try {
    await enabled(page);
    await probe(page, "go", 1);
    await press(page, 1, 1);
    await expect(page.locator("#hud")).toContainText("gpu");
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test("ordinary DOM is a flowing page, and the deck starts and ends at the same place with the same state", async ({ browser }) => {
  const { page, errors } = await open(browser);
  try {
    // The flow: every section is laid out down the track, one window each, and works.
    let state = await probe(page, "go", 0);
    expect(state).toMatchObject({ mode: "dom", deck: false, errors: [] });
    expect((await probe(page, "box", "backdrop")).height).toBe(4 * size.height);
    for (const index of [0, 1, 2, 3]) expect((await probe(page, "box", `panel-${index}`)).y).toBeCloseTo((index + 0.22) * size.height, 0);
    await press(page, 0, 1);
    state = await probe(page, "go", 1);
    expect(near(await pixel(page, flat(await probe(page, "box", "panel-1")), "flow-1"), colours[1])).toBe(true);
    await press(page, 1, 1);
    await page.locator("#input-1").click();
    await page.keyboard.type("kept");
    // GPU starts from the section in view: the page becomes the deck without scrolling.
    const before = await probe(page, "box", "panel-1");
    state = await probe(page, "enable");
    expect(state.mode, state.reason).toBe("gpu");
    expect(state).toMatchObject({ deck: true, from: 1, to: null, scrollY: 320 + size.height, errors: [] });
    // (GPU presentation places a layer on whole pixels, so the box may move by a fraction of one.)
    const after = await probe(page, "box", "panel-1");
    for (const key of ["x", "y", "width", "height"]) expect(Math.abs(after[key] - before[key])).toBeLessThan(1);
    expect((await probe(page, "box", "backdrop")).height).toBe(size.height);
    expect(near(await pixel(page, flat(before), "deck-1"), colours[1])).toBe(true);
    await expect(page.locator("#input-1")).toHaveValue("kept");
    await press(page, 1, 2);
    state = await probe(page, "go", 2);
    await press(page, 2, 1);
    // Ordinary DOM again: the flow, at the same scroll position, with every count kept.
    state = await probe(page, "disable");
    expect(state).toMatchObject({ mode: "dom", deck: false, scrollY: 320 + 2 * size.height, errors: [] });
    expect((await probe(page, "box", "panel-2")).y).toBeCloseTo(0.22 * size.height, 0);
    await press(page, 2, 2);
    await probe(page, "go", 1);
    await expect(page.locator("#input-1")).toHaveValue("kept");
    await press(page, 1, 3);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});

test("focus moving into a parked section brings it on stage", async ({ browser }) => {
  const { page, errors } = await open(browser);
  try {
    await enabled(page);
    await page.locator("#input-0").click();
    // The next control in document order is the second section's link, which is parked.
    await page.keyboard.press("Tab");
    await probe(page, "idle");
    const state = await probe(page, "snapshot");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("link-1");
    expect(state).toMatchObject({ mode: "gpu", from: 1, to: null, errors: [] });
    expect(state.layers).toEqual(["backdrop", "copy-1", "panel-1"]);
    await press(page, 1, 1);
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});
