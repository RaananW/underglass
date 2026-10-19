/**
 * Browser suite for the Dialog's depth entry and the Drawer's slide on the GPU (issue #165): a motion captures only what changes in the DOM.
 * `ui-structural-forms.html` (`window.strataStructureProbe`), a 2.4 s motion at DPR 1 and 2, plate and flush Dialog, tray and flush Drawer:
 * - GPU stays on for the whole open and close; the open makes 9 to 11 captures (the DOM changes the open really makes: the panel and the scrim
 *   enrolled, `inert`, focus, the form's first build), none of them in the middle of the motion; the close is as cheap. Before the fix the helper
 *   rewrote the scrim's `data-strata-mode` on every frame, a DOM mutation, and each one recaptured every layer: about 407 captures.
 * - A change made to the dialog's content in the middle of the motion is captured at once (never stale), and at rest the pixels are the new ones.
 * - Under reduced motion the layer snaps (no frame in flight) and costs the same few captures.
 * The layer's transform is applied by core as a pose each frame, which updates the native hit geometry once a frame by design (it must follow
 * the moving layer); the suite records that count and bounds it by the frames.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const SLOW = 2400;
/** What a 2.4 s open or close may capture: the measured 9 to 11, with room for a rebuild of the parts. */
const OPEN_CAPTURES = 14;

async function ready(page, query) {
  await page.goto(`/ui-structural-forms.html?${query}`);
  await page.waitForFunction(() => window.strataStructureProbe && window.strataStructureProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.evaluate(() => window.strataStructureProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => {
    const instrument = window.strataStructureProbe.state()?.instrument;
    return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
  }, null, { timeout: 30000 });
  await page.waitForTimeout(500);
}
/** Per frame for `duration` ms: the layer's opacity, the mode and the counters; the title of `id` is rewritten once at `when` ms. */
const sample = (page, id, duration, when = 0, change = "") => page.evaluate(async ([id, duration, when, change]) => {
  const probe = window.strataStructureProbe, out = [], begin = performance.now();
  let done = false;
  while (performance.now() - begin < duration) {
    await new Promise(requestAnimationFrame);
    if (change && !done && performance.now() - begin >= when) { done = true; document.querySelector(`#${id} h2`).textContent = change; }
    const state = probe.state(), layer = state.layers?.find(entry => entry.id === id);
    out.push({ at: Math.round(performance.now() - begin), opacity: layer?.transform?.opacity, mode: state.mode, captures: state.metrics.captures, uploads: state.metrics.uploads, geometry: state.metrics.geometryUpdates });
  }
  return out;
}, [id, duration, when, change]);
const counts = page => page.evaluate(() => window.strataStructureProbe.counts());
const delta = (a, b) => ({ captures: b.captures - a.captures, uploads: b.uploads - a.uploads, geometryUpdates: b.geometryUpdates - a.geometryUpdates });

for (const dpr of [1, 2]) for (const [kind, forms] of [["dialog", [["plate", ""], ["flush", "&flush"]]], ["drawer", [["tray", ""], ["flush", "&flush"]]]]) for (const [name, query] of forms) {
  test(`a ${name} ${kind} opens and closes on the GPU capturing only its DOM changes (DPR ${dpr}): GPU on, nothing captured mid-motion, a change made mid-motion is captured, pixels fresh at rest`, async ({ browser }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await ready(page, `level=instrument${query}`);
    await page.evaluate(ms => document.documentElement.style.setProperty("--strata-motion-slow", `${ms}ms`), SLOW);
    const id = `sf-${kind}`, title = `#${id} h2`;
    const start = await counts(page);
    await page.evaluate(kind => window.strataStructureProbe.open(kind), kind);
    // The title changes at 1.2 s, in the middle of the motion.
    const opening = await sample(page, id, SLOW + 700, 1200, "Changed mid-motion");
    const opened = await counts(page);
    const open = delta(start, opened);
    console.log(`DPR ${dpr} ${name} ${kind}: open ${JSON.stringify(open)} over ${opening.length} frames`);
    expect(opening.every(entry => entry.mode === "gpu"), "GPU stays on while opening").toBe(true);
    expect(opening.filter(entry => entry.opacity > 0 && entry.opacity < 1).length, "the motion is in flight over many frames").toBeGreaterThan(60);
    expect(opening.at(-1).opacity).toBe(1);
    // The open's DOM changes, and the one change the test makes: nothing else is captured.
    expect(open.captures, `captures over the open: ${open.captures}`).toBeLessThanOrEqual(OPEN_CAPTURES);
    expect(open.uploads).toBe(open.captures);
    // A stretch of the motion before the change (0.5 s to 1.1 s) captures nothing.
    const quiet = opening.filter(entry => entry.at >= 500 && entry.at <= 1100);
    expect(quiet.at(-1).captures - quiet[0].captures, "no capture between 0.5 s and 1.1 s of the motion").toBe(0);
    // The change made mid-motion is captured within a few frames, and nothing after it until the motion ends.
    const before = opening.filter(entry => entry.at < 1200).at(-1).captures;
    const after = opening.filter(entry => entry.at >= 1200 && entry.at <= 1500).at(-1).captures;
    expect(after - before, "the mid-motion change is captured").toBeGreaterThanOrEqual(1);
    expect(opening.at(-1).captures - after, "and no more is captured for the rest of the motion").toBeLessThanOrEqual(1);
    expect(open.geometryUpdates, "hit geometry follows the moving layer, at most once a frame").toBeLessThanOrEqual(opening.length + 5);
    // At rest: a change to the content is captured and its pixels are the new ones.
    const box = await page.locator(`#${id}`).boundingBox();
    const shot = async () => PNG.sync.read(await page.screenshot({ clip: box }));
    await page.mouse.move(2, 2);
    await page.evaluate(() => window.strataStructureProbe.controller.settle());
    const restBefore = await shot(), c0 = await counts(page);
    await page.evaluate(title => { document.querySelector(title).textContent = "Fresh at rest ABC"; }, title);
    await page.evaluate(async () => { for (let index = 0; index < 4; index++) await new Promise(requestAnimationFrame); await window.strataStructureProbe.controller.settle(); });
    const restAfter = await shot(), c1 = await counts(page);
    let changed = 0;
    for (let index = 0; index < restBefore.data.length; index += 4) if (Math.abs(restBefore.data[index] - restAfter.data[index]) + Math.abs(restBefore.data[index + 1] - restAfter.data[index + 1]) > 8) changed++;
    expect(c1.captures - c0.captures, "the content change at rest is captured").toBeGreaterThanOrEqual(1);
    expect(changed, "and the pixels at rest are the new ones").toBeGreaterThan(50);
    // At rest every native hit lands on the drawn button.
    const hit = await page.evaluate(kind => { const button = document.querySelector(`#sf-${kind} button`), rect = button.getBoundingClientRect(); return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest("button") === button; }, kind);
    expect(hit, "a native hit lands on the button").toBe(true);
    // Closing.
    const c2 = await counts(page);
    if (kind === "dialog") await page.evaluate(() => window.strataStructureProbe.beginClose()); else await page.mouse.click(40, 600);
    const closing = await sample(page, id, SLOW + 700);
    await page.evaluate(() => window.strataStructureProbe.closed?.());
    const closed = await counts(page), close = delta(c2, closed);
    console.log(`DPR ${dpr} ${name} ${kind}: close ${JSON.stringify(close)} over ${closing.length} frames`);
    expect(closing.every(entry => entry.mode === "gpu"), "GPU stays on while closing").toBe(true);
    expect(close.captures, `captures over the close: ${close.captures}`).toBeLessThanOrEqual(OPEN_CAPTURES);
    expect(await page.evaluate(() => window.strataStructureProbe.controller.state().mode)).toBe("gpu");
    expect(errors).toEqual([]);
    await context.close();
  });
}

for (const kind of ["dialog", "drawer"]) for (const query of ["", "&flush"]) {
  test(`under reduced motion a ${query ? "flush " : ""}${kind} snaps open on the GPU with the same few captures`, async ({ browser }) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await ready(page, `level=instrument${query}`);
    const start = await counts(page);
    await page.evaluate(kind => window.strataStructureProbe.open(kind), kind);
    const opening = await sample(page, `sf-${kind}`, 900);
    const open = delta(start, await counts(page));
    console.log(`reduced ${query || "form"} ${kind}: open ${JSON.stringify(open)} over ${opening.length} frames`);
    expect(opening.every(entry => entry.mode === "gpu"), "GPU stays on").toBe(true);
    expect(opening.filter(entry => entry.opacity > 0 && entry.opacity < 1).length, "no frame in flight").toBeLessThanOrEqual(3);
    expect(opening.at(-1).opacity).toBe(1);
    expect(open.captures).toBeLessThanOrEqual(OPEN_CAPTURES);
    await context.close();
  });
}
