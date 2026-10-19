/**
 * Core's `input` capture rule (issue #167) on `core-input-capture.html` (`window.inputCapture`, from
 * `examples/playground/src/core-input-capture/page.ts`): an `input` event captures its layer, because a native
 * control's value is not a DOM mutation, unless the element carries `data-underglass-gpu-value` (its presenter draws the
 * value itself and its native paint is hidden), in which case the event is counted (`inputCapturesSkipped`) and queues
 * nothing. At DPR 1 and 2, with decoded pixels:
 * - an unmarked range's `input` events capture and its thumb's pixels change (today's behaviour, unchanged);
 * - a marked range's `input` events over 300 frames cause 0 captures, 0 uploads and 0 hit-geometry updates while the
 *   GPU-drawn value (a light moved with `setEmitters`) changes the pixels in the card, GPU on, 300 events counted;
 * - a marked range whose handler writes text into a readout still captures (the mutation observer) and the readout's
 *   pixels are fresh after every change;
 * - a marked range that becomes unmarked captures again, and the skipped count stops.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const viewport = { width: 1280, height: 720 };
const healthy = /^Current content=drawable owning WebGPU canvas/;

async function open(browser, dpr) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto("/core-input-capture.html");
  await page.waitForFunction(() => window.inputCapture, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.inputCapture.ready)[name](...args), { name, args });
  return { context, page, errors, call };
}
const shot = async page => PNG.sync.read(await page.screenshot());
/** Mean luminance of a client rect. */
function meanLuminance(png, rect, dpr) {
  let sum = 0, count = 0;
  for (let y = Math.floor(rect.y * dpr); y < Math.ceil((rect.y + rect.height) * dpr); y++) for (let x = Math.floor(rect.x * dpr); x < Math.ceil((rect.x + rect.width) * dpr); x++) {
    const offset = (y * png.width + x) * 4;
    sum += png.data[offset] + png.data[offset + 1] + png.data[offset + 2]; count++;
  }
  return sum / Math.max(1, count) / 3;
}
/** Number of pixels of a client rect that differ between two screenshots, and the largest channel difference. */
function difference(a, b, rect, dpr) {
  let count = 0, largest = 0;
  for (let y = Math.floor(rect.y * dpr); y < Math.ceil((rect.y + rect.height) * dpr); y++) for (let x = Math.floor(rect.x * dpr); x < Math.ceil((rect.x + rect.width) * dpr); x++) {
    const offset = (y * a.width + x) * 4;
    const delta = Math.max(Math.abs(a.data[offset] - b.data[offset]), Math.abs(a.data[offset + 1] - b.data[offset + 1]), Math.abs(a.data[offset + 2] - b.data[offset + 2]));
    if (delta > 0) count++;
    largest = Math.max(largest, delta);
  }
  return { count, largest };
}
async function gpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}

for (const dpr of [1, 2]) {
  test(`an unmarked range input captures on every input event and its thumb's pixels change (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr);
    try {
      await call("settle");
      const before = await gpu(call, "start"), plain = await call("box", "plain"), card = await call("box", "card");
      const first = await shot(page);
      await page.focus("#plain");
      for (let index = 0; index < 10; index++) await page.keyboard.press("ArrowRight");
      await call("settle");
      const after = await gpu(call, "after the keys"), second = await shot(page);
      const thumb = difference(first, second, { x: plain.x, y: plain.y, width: plain.width, height: plain.height }, dpr);
      console.log(`DPR ${dpr} unmarked: ${after.captures - before.captures} captures, ${after.inputCapturesSkipped - before.inputCapturesSkipped} skipped, ${thumb.count} thumb pixels changed (largest step ${thumb.largest}); card ${JSON.stringify(card)}`);
      expect(after.captures - before.captures, "each input event captures (coalesced per frame)").toBeGreaterThanOrEqual(1);
      expect(after.inputCapturesSkipped - before.inputCapturesSkipped, "nothing skipped").toBe(0);
      expect(thumb.count, "the thumb moved and the capture shows it").toBeGreaterThan(50);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`a marked input's input events over 300 frames cause 0 captures while the GPU-drawn value moves the pixels (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr);
    try {
      await call("settle");
      const card = await call("box", "card");
      // Screenshots themselves ask for paints: count between them.
      const first = await shot(page);
      await call("settle");
      const start = await gpu(call, "start");
      await call("sweep", "marked", 300, 0, 100);
      await call("settle");
      const end = await gpu(call, "after the sweep"), second = await shot(page);
      const moved = difference(first, second, card, dpr);
      // The light starts at the card's left and ends at its right: the left strip darkens and the right strip brightens.
      const left = { x: card.x + 10, y: card.y + 190, width: 90, height: 70 }, right = { x: card.x + card.width - 100, y: card.y + 190, width: 90, height: 70 };
      const leftChange = meanLuminance(second, left, dpr) - meanLuminance(first, left, dpr), rightChange = meanLuminance(second, right, dpr) - meanLuminance(first, right, dpr);
      console.log(`DPR ${dpr} marked: 300 events, ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.inputCapturesSkipped - start.inputCapturesSkipped} skipped (layer ${end.layer.inputCapturesSkipped}), ${end.geometryUpdates - start.geometryUpdates} geometry updates, ${end.gpuFrames - start.gpuFrames} GPU frames, ${moved.count} card pixels changed`);
      expect(end.captures - start.captures, "no capture").toBe(0);
      expect(end.uploads - start.uploads, "no upload").toBe(0);
      expect(end.geometryUpdates - start.geometryUpdates, "no hit-geometry update").toBe(0);
      expect(end.inputCapturesSkipped - start.inputCapturesSkipped, "every event counted").toBe(300);
      expect(end.layer.inputCapturesSkipped, "counted on its layer").toBeGreaterThanOrEqual(300);
      expect(end.gpuFrames - start.gpuFrames, "the GPU kept drawing").toBeGreaterThan(100);
      expect(moved.count, "the light moved: pixels changed in the card through the uniform path").toBeGreaterThan(500);
      console.log(`DPR ${dpr} marked: left strip luminance ${leftChange.toFixed(1)}, right strip ${rightChange.toFixed(1)}`);
      expect(leftChange, "the light left the card's left").toBeLessThan(-3);
      expect(rightChange, "the light reached the card's right").toBeGreaterThan(3);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`a marked input whose handler writes DOM still captures through the mutation observer, with fresh pixels (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr);
    try {
      await call("writeReadout", true);
      await call("settle");
      const readout = await call("box", "readout");
      const start = await gpu(call, "start");
      let previous = await shot(page);
      const changed = [];
      for (const value of [17, 58, 83, 29]) {
        await call("sweep", "marked", 1, value, value);
        await call("settle");
        expect(await page.textContent("#readout")).toBe(String(value));
        const current = await shot(page);
        changed.push(difference(previous, current, readout, dpr).count);
        previous = current;
      }
      const end = await gpu(call, "end");
      console.log(`DPR ${dpr} marked with a readout: ${end.captures - start.captures} captures, ${end.inputCapturesSkipped - start.inputCapturesSkipped} skipped, readout pixels changed ${changed.join(", ")}`);
      expect(end.captures - start.captures, "the text write is captured").toBeGreaterThanOrEqual(4);
      expect(end.inputCapturesSkipped - start.inputCapturesSkipped, "the input events themselves were skipped").toBe(4);
      for (const count of changed) expect(count, "the readout's pixels are fresh after each change").toBeGreaterThan(20);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`a native repaint on a marked element reaches the GPU through the paint event, not an input capture (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call } = await open(browser, dpr);
    try {
      await call("settle");
      const marked = await call("box", "marked");
      await page.mouse.move(2, 2);
      await call("settle");
      const idle = await shot(page);
      const start = await gpu(call, "start");
      await page.mouse.move(marked.x + 150, marked.y + marked.height / 2);
      await call("settle");
      await page.waitForTimeout(400);
      await call("settle");
      const hovered = await gpu(call, "hovered");
      const after = await shot(page);
      await call("settle");
      const quiet = await gpu(call, "quiet");
      const hover = difference(idle, after, marked, dpr);
      // Inputs while hovered: skipped, and the hover paint stays.
      await call("sweep", "marked", 20, 10, 30);
      await call("settle");
      const swept = await gpu(call, "swept");
      console.log(`DPR ${dpr} hover on a marked range: ${hovered.captures - start.captures} captures from the paint event, ${hover.count} pixels fresh in its box, then 20 inputs: ${swept.captures - quiet.captures} captures, ${swept.inputCapturesSkipped - quiet.inputCapturesSkipped} skipped`);
      expect(hovered.captures - start.captures, "the hover repaint was captured").toBeGreaterThanOrEqual(1);
      expect(hovered.inputCapturesSkipped - start.inputCapturesSkipped, "no input event involved").toBe(0);
      expect(hover.count, "the hover colour is in the box").toBeGreaterThan(marked.width * marked.height * dpr * dpr * 0.5);
      expect(swept.captures - quiet.captures, "inputs capture nothing (the screenshot's own paint is counted before the baseline)").toBe(0);
      expect(swept.inputCapturesSkipped - quiet.inputCapturesSkipped).toBe(20);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`a marked input that becomes unmarked captures again, and the skipped count stops (DPR ${dpr})`, async ({ browser }) => {
    const { context, call, errors } = await open(browser, dpr);
    try {
      await call("settle");
      const start = await gpu(call, "start");
      await call("sweep", "marked", 20, 0, 40);
      await call("settle");
      const marked = await gpu(call, "marked");
      await call("mark", false);
      await call("settle");
      const unmarkedAt = await call("counts");
      await call("sweep", "marked", 20, 41, 90);
      await call("settle");
      const end = await gpu(call, "unmarked");
      console.log(`DPR ${dpr} unmark: marked ${marked.captures - start.captures} captures / ${marked.inputCapturesSkipped - start.inputCapturesSkipped} skipped; unmarked ${end.captures - unmarkedAt.captures} captures / ${end.inputCapturesSkipped - unmarkedAt.inputCapturesSkipped} skipped`);
      expect(marked.captures - start.captures).toBe(0);
      expect(marked.inputCapturesSkipped - start.inputCapturesSkipped).toBe(20);
      expect(end.inputCapturesSkipped - unmarkedAt.inputCapturesSkipped, "nothing skipped once unmarked").toBe(0);
      expect(end.captures - unmarkedAt.captures, "captures again").toBeGreaterThanOrEqual(5);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
