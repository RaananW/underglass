/**
 * Browser suite for the JogWheel (anatomy page `jog-wheel.md`) on `ui-jog-wheel.html` (`window.strataJogProbe`): plain contract
 * markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel. Shuttle (0–99 frames, 24 steps a
 * turn, wrapping), Scrub (0–11, detented, 12 steps a turn, wrapping) and Tune (−12 to 12, small, a vertical drag, not wrapping).
 * - Plain DOM (`?plain`), real input: a circular drag turns the wheel by the pointer's angle and steps the value as the angle passes
 *   each step, through the wrap in both directions with the angle never turning back; the vertical drag; Shift's fine rate; taps on the
 *   upper and lower half (the single-pointer alternative); the wheel without scrolling the page; native keys and the wrap at both ends;
 *   the double-click reset; `aria-valuetext` with units; `input` and `change`.
 * - Inertia: a flick coasts and stops; every `input` is one native step, at most `jog.maxRate` a second, and `change` fires once; a slow
 *   release, reduced motion and a key do not coast or stop it at once; a detented wheel settles on a detent.
 * - Touch at 390 and 320 px: taps and a circular touch drag through pointer events of type touch; reflow, 200% text.
 * - Preferences: axe in light, dark, face mode, forced colours and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is the documented one; the parts draw inside the dials
 *   only (0 px outside) through a whole turn; native hits land on the input (0 mismatches); a turn changes pixels in the dial only; 300 frames
 *   of a flick add no hit-geometry update and no capture beyond the native `input` events, with the dimple moving and the native value
 *   stepping with the angle; reduced motion has no inertia and puts the dimple at its step at once; the accessibility snapshot is the same
 *   in DOM and GPU modes and axe passes on the GPU page.
 * - Feedback: off by default; a detented wheel ticks once per step crossed, a wheel without detents never.
 * Screenshots go to the `ui-jog-wheel` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-jog-wheel");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];

const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const angle = (page, id) => page.evaluate(id => window.strataJogProbe.angle(id), id);
const events = page => page.evaluate(() => window.strataJogProbe.events());
const clear = page => page.evaluate(() => window.strataJogProbe.clearEvents());
const rad = degrees => (degrees * Math.PI) / 180;
/** The wheel's input box and its centre. */
async function dial(page, id) {
  const box = await page.locator(`#${id}`).boundingBox();
  return { box, cx: box.x + box.width / 2, cy: box.y + box.height / 2 };
}
/** A circular drag about the wheel's centre at radius `r`, from `from` to `to` degrees (0 at the top, clockwise), in `steps` moves, `pause` ms between them, held still for `hold` ms before the button comes up (so it is not a flick: pass 0 for one). */
async function circle(page, id, from, to, { r = 40, steps = 30, pause = 0, shift = false, release = true, hold = 150, sample = true } = {}) {
  const c = await dial(page, id), at = degrees => [c.cx + r * Math.sin(rad(degrees)), c.cy - r * Math.cos(rad(degrees))];
  await page.mouse.move(...at(from));
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  const samples = [];
  for (let step = 1; step <= steps; step++) {
    await page.mouse.move(...at(from + ((to - from) * step) / steps));
    if (pause) await page.waitForTimeout(pause);
    if (sample) samples.push([await value(page, id), await angle(page, id)]);
  }
  if (hold) await page.waitForTimeout(hold);
  if (release) await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
  return samples;
}
/** A vertical drag from the wheel's centre. */
async function vertical(page, id, dy, { shift = false, steps = 12 } = {}) {
  const c = await dial(page, id);
  await page.mouse.move(c.cx, c.cy);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(c.cx, c.cy + dy, { steps });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
/** Writes a wheel's value as a script does (the wheel follows by the shorter way round). */
const script = (page, id, to) => page.evaluate(([id, to]) => { const input = document.getElementById(id); input.value = String(to); input.dispatchEvent(new Event("input", { bubbles: true })); }, [id, to]);
/** elementFromPoint over a grid on the dial (inset 0.5 px): every hit must be the input. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const input = document.getElementById(id), box = input.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== input) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);
/** The page's trace of every `input` and `change` event with its time, from now on. */
const trace = page => page.evaluate(() => { window.trace = []; if (window.tracing) return; window.tracing = true; for (const type of ["input", "change"]) document.addEventListener(type, event => window.trace.push([type, performance.now(), Number(event.target.value)]), true); });
const traced = page => page.evaluate(() => window.trace.splice(0));
/** Waits until no `input` has come for `quiet` ms (a coasting wheel has stopped), at most `limit` ms. */
const stopped = (page, quiet = 500, limit = 8000) => page.evaluate(([quiet, limit]) => new Promise(resolve => {
  const begun = performance.now(); let last = performance.now();
  document.addEventListener("input", () => { last = performance.now(); }, true);
  const check = () => { const now = performance.now(); if (now - last >= quiet || now - begun >= limit) resolve(now - begun); else setTimeout(check, 50); };
  check();
}), [quiet, limit]);

async function plain(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-jog-wheel.html?plain");
  await page.waitForFunction(() => window.strataJogProbe);
  return { context, page, errors };
}

test("a jog wheel behaves round in plain DOM: circular and vertical drags, the wrap, taps, the wheel, keys, reset and its value text", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  const shuttle = page.locator("#shuttle"), tune = page.locator("#tune");
  await expect(shuttle).toHaveRole("slider");
  await expect(shuttle).toHaveAccessibleName("Shuttle");
  await expect(shuttle).toHaveAttribute("aria-valuetext", "12 fr");
  await expect(tune).toHaveAttribute("aria-valuetext", "0 st");
  expect([await value(page, "shuttle"), await angle(page, "shuttle"), await value(page, "scrub"), await angle(page, "scrub"), await value(page, "tune"), await angle(page, "tune")]).toEqual([12, 180, 0, 0, 0, 180]);
  // The boxes: the wheel + 32 (128 at medium, 96 at small), and every point of them is the input.
  const boxes = {};
  for (const id of ["shuttle", "scrub", "tune"]) {
    const box = await page.locator(`#${id}`).boundingBox();
    boxes[id] = [box.width, box.height];
    expect((await hits(page, id)).misses, `${id}: hits over the dial`).toEqual([]);
  }
  expect(boxes).toEqual({ shuttle: [128, 128], scrub: [128, 128], tune: [96, 96] });
  const wheel = await page.locator("#shuttle-jog .ug-jog-wheel__wheel").boundingBox();
  expect([wheel.width, wheel.height]).toEqual([96, 96]);

  // A circular drag, a quarter turn clockwise from the top: the value takes 6 steps (15° each) and the angle 90°, one `input` a step, one `change`.
  await clear(page);
  await circle(page, "shuttle", 0, 90);
  expect(await value(page, "shuttle")).toBe(18);
  expect(await angle(page, "shuttle")).toBeCloseTo(270, 0);
  const quarter = await events(page);
  expect(quarter.filter(event => event.type === "input").map(event => Number(event.value))).toEqual([13, 14, 15, 16, 17, 18]);
  expect(quarter.filter(event => event.type === "change")).toEqual([{ id: "shuttle", type: "change", value: "18" }]);
  await expect(shuttle).toHaveAttribute("aria-valuetext", "18 fr");
  expect(await page.locator("#shuttle-jog .ug-jog-wheel__turn").evaluate(element => getComputedStyle(element).rotate)).toMatch(/^270(\.\d+)?deg$/);
  // Half a turn the other way: 12 steps back.
  await circle(page, "shuttle", 90, -90);
  expect(await value(page, "shuttle")).toBe(6);
  expect(await angle(page, "shuttle")).toBeCloseTo(90, 0);
  // Shift is ten times finer: 90° of pointer turns the wheel 9°, which is 7 steps from the origin (99° / 15 = 6.6).
  await circle(page, "shuttle", 0, 90, { shift: true });
  expect(await value(page, "shuttle")).toBe(7);
  expect(await angle(page, "shuttle")).toBeCloseTo(99, 0);
  // A drag from anywhere on the wheel turns it by the pointer's own angle (here at radius 20, from the right side).
  await circle(page, "shuttle", 90, 180, { r: 20 });
  expect(await value(page, "shuttle")).toBe(13);

  // The wrap: a script's jump takes the shorter way round (97 from 13 is 16 steps back), then a drag of 120° clockwise passes 99 → 0 with the angle
  // growing all the way, one native step each, and 120° back passes 0 → 99 with it falling: it never turns back.
  await script(page, "shuttle", 97);
  expect(await value(page, "shuttle")).toBe(97);
  expect(await angle(page, "shuttle")).toBe((13 - 16) * 15);
  await clear(page);
  const up = await circle(page, "shuttle", 0, 120, { steps: 40 });
  expect(up.at(-1)[0]).toBe(5);
  expect(up.at(-1)[1]).toBeCloseTo(-45 + 120, 0);
  for (let index = 1; index < up.length; index++) expect(up[index][1], `the angle never falls while turning up (${index})`).toBeGreaterThanOrEqual(up[index - 1][1] - 1e-6);
  const through = (await events(page)).filter(event => event.type === "input").map(event => Number(event.value));
  expect(through).toEqual([98, 99, 0, 1, 2, 3, 4, 5]);
  await clear(page);
  const down = await circle(page, "shuttle", 120, 0, { steps: 40 });
  expect(down.at(-1)[0]).toBe(97);
  expect(down.at(-1)[1]).toBeCloseTo(-45, 0);
  for (let index = 1; index < down.length; index++) expect(down[index][1], `the angle never rises while turning down (${index})`).toBeLessThanOrEqual(down[index - 1][1] + 1e-6);
  expect((await events(page)).filter(event => event.type === "input").map(event => Number(event.value))).toEqual([4, 3, 2, 1, 0, 99, 98, 97]);

  // Tune is dragged vertically (240 px a turn, up clockwise) and does not wrap: it stops at its ends, its angle at its first and last steps.
  await vertical(page, "tune", -120);
  expect(await value(page, "tune")).toBe(12);
  expect(await angle(page, "tune")).toBeCloseTo(360, 0);
  await vertical(page, "tune", -120);
  expect(await value(page, "tune"), "no wrap: it stops at its end").toBe(12);
  expect(await angle(page, "tune")).toBeCloseTo(360, 0);
  await vertical(page, "tune", 240);
  expect(await value(page, "tune")).toBe(-12);
  expect(await angle(page, "tune")).toBeCloseTo(0, 0);
  await vertical(page, "tune", 240, { shift: true });
  expect(await value(page, "tune"), "a tenth with Shift: a 36° turn up from the bottom is 2 steps").toBe(-12);
  await vertical(page, "tune", -240, { shift: true });
  expect(await value(page, "tune")).toBe(-10);
  await expect(tune).toHaveAttribute("aria-valuetext", "−10 st");

  // Taps (WCAG 2.5.7): the upper half of the box steps up one step, the lower half down; under the tap slop a drag is still a tap.
  const s = await dial(page, "shuttle");
  await page.mouse.click(s.cx, s.cy - 30);
  expect(await value(page, "shuttle")).toBe(98);
  await page.mouse.click(s.cx, s.cy + 30);
  await page.mouse.click(s.cx, s.cy + 55);
  expect(await value(page, "shuttle")).toBe(96);
  await page.mouse.click(s.cx - 60, s.cy - 5, { delay: 20 });
  expect(await value(page, "shuttle")).toBe(97);
  await circle(page, "shuttle", 0, 2, { steps: 2, r: 40 });
  expect(await value(page, "shuttle"), "a press under jog.tapSlop (4 px) is a tap, not a drag").toBe(98);

  // The wheel: a notch up is a step up, and the page does not scroll over the wheel; elsewhere it scrolls as usual.
  await page.mouse.move(s.cx, s.cy);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "shuttle")).toBe(97);
  expect(await page.evaluate(() => window.scrollY), "the page does not scroll over a wheel").toBe(0);
  await page.mouse.move(400, 20);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Keys are native, and at an end of a wrapping wheel the key that would go past it goes round, the angle going on.
  await shuttle.focus();
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "shuttle")).toBe(98);
  await page.keyboard.press("End");
  expect(await value(page, "shuttle")).toBe(99);
  const before = await angle(page, "shuttle");
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "shuttle"), "ArrowUp past the last value goes round").toBe(0);
  expect(await angle(page, "shuttle")).toBe(before + 15);
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "shuttle"), "ArrowDown past the first goes round").toBe(99);
  expect(await angle(page, "shuttle")).toBe(before);
  await page.keyboard.press("ArrowRight");
  expect(await value(page, "shuttle")).toBe(0);
  await page.keyboard.press("ArrowLeft");
  expect(await value(page, "shuttle")).toBe(99);
  await page.keyboard.press("PageUp");
  expect(await value(page, "shuttle"), "PageUp at the last value goes round").toBe(0);
  await page.keyboard.press("PageDown");
  expect(await value(page, "shuttle"), "PageDown at the first value goes round").toBe(99);
  await page.keyboard.press("Home");
  expect(await value(page, "shuttle")).toBe(0);
  expect(await angle(page, "shuttle"), "Home from the end takes the shorter way round, one step").toBe(before + 15);
  await page.keyboard.press("PageUp");
  expect(await value(page, "shuttle"), "a Page key within the range is the native one").toBeGreaterThan(1);
  await tune.focus();
  await page.keyboard.press("End");
  expect(await value(page, "tune")).toBe(12);
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "tune"), "a wheel that does not wrap stops at its end").toBe(12);
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "tune")).toBe(11);

  // Double-click returns to the default; the value text and the readout follow.
  await page.mouse.dblclick(s.cx, s.cy - 20);
  expect(await value(page, "shuttle")).toBe(12);
  await expect(shuttle).toHaveAttribute("aria-valuetext", "12 fr");
  await expect(page.locator("#jog-read")).toContainText("Shuttle 12 fr");
  // Disabled: no pointer behaviour.
  await page.evaluate(() => { document.getElementById("shuttle").disabled = true; });
  await page.mouse.click(s.cx, s.cy - 30);
  expect(await value(page, "shuttle")).toBe(12);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("a flick coasts and stops: one native step per input, at most jog.maxRate a second, one change when it rests; slow releases, reduced motion and keys do not coast on", async ({ browser }) => {
  test.setTimeout(120000);
  const { context, page } = await plain(browser);
  await trace(page);
  // A flick: 200° in 10 moves of 8 ms, released as it goes. No samples between the moves: two round trips to the page after the last
  // move could take the release past the wheel's 80 ms under load, which is a slow release (it stays where it was let go, below).
  await page.evaluate(() => {
    window.flickGap = undefined; let last = 0;
    const move = event => { last = event.timeStamp; };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", event => { window.flickGap = event.timeStamp - last; document.removeEventListener("pointermove", move, true); }, { capture: true, once: true });
  });
  await circle(page, "shuttle", 0, 200, { steps: 10, pause: 8, hold: 0, sample: false });
  const released = await page.evaluate(() => performance.now());
  await stopped(page);
  // `change` comes when the wheel rests, a little after its last step.
  await page.waitForFunction(() => window.trace.some(event => event[0] === "change"), null, { timeout: 10000 });
  const flick = await traced(page);
  const inputs = flick.filter(event => event[0] === "input"), changes = flick.filter(event => event[0] === "change");
  const after = inputs.filter(event => event[1] > released);
  expect(after.length, `the wheel keeps turning after it is let go (released ${(await page.evaluate(() => window.flickGap)).toFixed(1)} ms after the last move)`).toBeGreaterThan(5);
  expect(changes.length, "one change, when it comes to rest").toBe(1);
  expect(changes[0][1], "after the last step").toBeGreaterThanOrEqual(inputs.at(-1)[1]);
  expect(changes[0][2]).toBe(await value(page, "shuttle"));
  // Every input is one native step clockwise (mod the 100 values), and the value is the angle's step.
  const diffs = inputs.map((event, index) => (event[2] - (index ? inputs[index - 1][2] : 12) + 100) % 100);
  expect(new Set(diffs), "one native step per input event").toEqual(new Set([1]));
  const rest = await angle(page, "shuttle");
  expect(await value(page, "shuttle")).toBe(((Math.round(rest / 15) % 100) + 100) % 100);
  // The rate: no second holds more than jog.maxRate (240) steps.
  let busiest = 0;
  for (const event of inputs) busiest = Math.max(busiest, inputs.filter(other => other[1] >= event[1] && other[1] < event[1] + 1000).length);
  expect(busiest).toBeLessThanOrEqual(240);
  const ran = after.length, seconds = (inputs.at(-1)[1] - released) / 1000;
  console.log(`a flick (200° in 10 moves of 8 ms): ${inputs.length} steps (${ran} after the release, over ${seconds.toFixed(2)} s, at most ${busiest} in a second), angle ${rest.toFixed(1)}°, one change`);

  // The release speed is held to the rate the page can take: a fling at 20,000°/s steps at most 3,600°/s / 15 = 240 a second, and per frame no more than the frame's share (4 at 60 a second).
  const run = await page.evaluate(async () => {
    const probe = window.strataJogProbe, frame = () => new Promise(requestAnimationFrame);
    probe.muteReadout(true);
    const stamps = [], frames = []; let count = 0;
    const listener = () => { count++; stamps.push(performance.now()); };
    document.addEventListener("input", listener, true);
    let previous = performance.now(), lastCount = 0, widest = 0;
    probe.fling("scrub", 20000);
    probe.fling("shuttle", 20000);
    // Frames are timed by their animation-frame timestamps, the clock the wheel's allowance runs on: `performance.now()` read after
    // the wheels' steps of the frame moves with how long those took, and under load measured a 31 ms frame as 19 ms.
    for (let index = 0; index < 90; index++) { const now = await frame(); frames.push(now - previous); const gained = count - lastCount; widest = Math.max(widest, gained / 2); previous = now; lastCount = count; }
    document.removeEventListener("input", listener, true);
    return { steps: count, widest, slowest: Math.max(...frames), frames: frames.length };
  });
  console.log(`fling at 20,000°/s: ${run.steps} steps over ${run.frames} frames, at most ${run.widest} a frame per wheel, slowest frame ${run.slowest.toFixed(1)} ms`);
  expect(run.widest, "a frame takes no more than its share of 240 steps a second").toBeLessThanOrEqual(Math.ceil((240 * run.slowest) / 1000) + 1);
  await stopped(page, 600, 15000);
  await traced(page);
  await page.evaluate(() => window.strataJogProbe.muteReadout(false));

  // A slow release does not coast: held still for 250 ms before the button comes up.
  await circle(page, "shuttle", 0, 100, { steps: 20, pause: 8, hold: 250 });
  await trace(page);
  await page.waitForTimeout(700);
  const slow = (await traced(page)).filter(event => event[0] === "input");
  expect(slow.length, "a wheel let go slowly stops where it is").toBe(0);
  // A key stops a coasting wheel at once, and it is not set going again.
  await page.evaluate(() => window.strataJogProbe.fling("shuttle", 2400));
  await page.waitForTimeout(150);
  const stoppedAt = await page.evaluate(() => performance.now());
  await page.locator("#shuttle").focus();
  await page.keyboard.press("ArrowUp");
  const stopTime = await page.evaluate(() => performance.now());
  await page.waitForTimeout(600);
  const keyed = await traced(page);
  const late = keyed.filter(event => event[0] === "input" && event[1] > stopTime + 5);
  expect(late.length, "no step after the key").toBe(0);
  expect(keyed.filter(event => event[0] === "change").length, "the coast ended with its change").toBeGreaterThanOrEqual(1);
  console.log(`a key ${(stopTime - stoppedAt).toFixed(0)} ms into a coast stops it: ${late.length} steps after it`);
  // A fling is the same coasting as a flick; a detented wheel (Scrub, 30° a step) settles on a detent.
  await page.evaluate(() => window.strataJogProbe.fling("scrub", 700));
  await stopped(page, 700, 15000);
  const settled = await angle(page, "scrub");
  expect(settled % 30, `Scrub comes to rest on a detent: ${settled}°`).toBe(0);
  expect(await value(page, "scrub")).toBe(((Math.round(settled / 30) % 12) + 12) % 12);
  await context.close();

  // Reduced motion: a flick does not coast, and neither does a fling.
  const reduced = await plain(browser, { reducedMotion: "reduce" });
  await trace(reduced.page);
  await circle(reduced.page, "shuttle", 0, 200, { steps: 10, pause: 8, hold: 0 });
  const stoppedAtRelease = await reduced.page.evaluate(() => performance.now());
  await reduced.page.waitForTimeout(900);
  const calm = await traced(reduced.page);
  expect(calm.filter(event => event[0] === "input" && event[1] > stoppedAtRelease).length, "reduced motion: no inertia").toBe(0);
  expect(calm.filter(event => event[0] === "change").length).toBe(1);
  expect(await reduced.page.evaluate(() => window.strataJogProbe.fling("shuttle", 2400))).toBe(false);
  expect(await value(reduced.page, "shuttle")).toBe(Math.round((await angle(reduced.page, "shuttle")) / 15) % 100);
  await reduced.context.close();
});

test("a detented wheel settles its dimple on each step and ticks once per step crossed once feedback is on; a wheel without detents never ticks; nothing plays by default", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  await context.addInitScript(() => { window.pulses = []; Object.defineProperty(navigator, "vibrate", { configurable: true, value: pattern => { window.pulses.push(pattern); return true; } }); });
  const page = await context.newPage();
  await page.goto("/ui-jog-wheel.html?plain");
  await page.waitForFunction(() => window.strataJogProbe);
  const pulses = () => page.evaluate(() => window.pulses.splice(0));
  // Off by default: a drag across three detents pulses nothing, and the angle is quantised to 30° (Scrub's step) while it moves.
  const quantised = await circle(page, "scrub", 0, 100, { steps: 25 });
  const quick = { steps: 20, sample: false };
  expect(await value(page, "scrub")).toBe(3);
  expect(quantised.every(([, turned]) => turned % 30 === 0), "a detented wheel's angle stands on its steps").toBe(true);
  expect(await pulses()).toEqual([]);
  // Haptics on for the page: each step the visitor takes is one 5 ms tick, whether dragged, keyed or tapped; a jump is one change, one tick.
  await page.evaluate(() => window.strataJogProbe.feedback({ haptics: true }));
  await circle(page, "scrub", 0, 100, quick);
  expect(await value(page, "scrub")).toBe(6);
  expect(await pulses(), "three steps crossed, three ticks").toEqual([5, 5, 5]);
  await page.locator("#scrub").focus();
  await page.keyboard.press("ArrowUp");
  expect(await pulses()).toEqual([5]);
  await page.keyboard.press("Home");
  expect(await value(page, "scrub")).toBe(0);
  expect(await pulses(), "a jump across several steps is one change, one tick").toEqual([5]);
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "scrub"), "the wheel goes round").toBe(11);
  expect(await pulses()).toEqual([5]);
  const c = await dial(page, "scrub");
  await page.mouse.click(c.cx, c.cy - 30);
  expect(await pulses(), "a tap is one step, one tick").toEqual([5]);
  // A wheel without detents never ticks, and a drag ticks per step, not per move.
  await circle(page, "shuttle", 0, 90, quick);
  await page.locator("#shuttle").focus();
  await page.keyboard.press("ArrowUp");
  expect(await pulses()).toEqual([]);
  await context.close();
});

test("touch at 390 px: taps step and a circular touch drag turns the wheel, through pointer events of type touch, with no page scroll", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-jog-wheel.html?plain");
  await page.waitForFunction(() => window.strataJogProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  const c = await dial(page, "shuttle");
  await page.touchscreen.tap(c.cx, c.cy - 30);
  expect(await value(page, "shuttle"), "a tap on the upper half").toBe(13);
  await page.touchscreen.tap(c.cx, c.cy + 30);
  await page.touchscreen.tap(c.cx, c.cy + 30);
  expect(await value(page, "shuttle"), "and the lower half").toBe(11);
  // A circular touch drag, a quarter turn clockwise at radius 40.
  const client = await context.newCDPSession(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const at = degrees => ({ x: c.cx + 40 * Math.sin(rad(degrees)), y: c.cy - 40 * Math.cos(rad(degrees)) });
  await touch("touchStart", [at(0)]);
  for (let step = 1; step <= 18; step++) await touch("touchMove", [at(step * 5)]);
  await touch("touchEnd", []);
  expect(await value(page, "shuttle")).toBe(17);
  expect(await angle(page, "shuttle")).toBeCloseTo(255, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  // The vertical wheel by touch.
  const t = await dial(page, "tune");
  await touch("touchStart", [{ x: t.cx, y: t.cy }]);
  for (let step = 1; step <= 12; step++) await touch("touchMove", [{ x: t.cx, y: t.cy - step * 5 }]);
  await touch("touchEnd", []);
  expect(await value(page, "tune"), "60 px up is a quarter turn, 6 steps").toBe(6);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the wheels reflow with no horizontal overflow, 24 px targets and readable print`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-jog-wheel.html?plain");
  await page.waitForFunction(() => window.strataJogProbe);
  const layout = await page.evaluate(() => {
    const boxes = selector => [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height }; });
    return { scrollWidth: document.documentElement.scrollWidth, inputs: boxes(".ug-jog-wheel__input"), print: boxes(".ug-jog-wheel__label"),
      clipped: [...document.querySelectorAll(".ug-jog-wheel__label")].filter(label => label.scrollWidth > label.clientWidth + 0.5).length };
  });
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const input of layout.inputs) expect(Math.min(input.width, input.height)).toBeGreaterThanOrEqual(24);
  for (const box of [...layout.inputs, ...layout.print]) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  expect(layout.clipped).toBe(0);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest input ${Math.min(...layout.inputs.map(input => Math.min(input.width, input.height)))} px`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the legends wrap without loss and the wheels stay whole", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-jog-wheel.html?plain");
  await page.waitForFunction(() => window.strataJogProbe);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    wheels: [...document.querySelectorAll(".ug-jog-wheel")].map(root => { const dial = root.querySelector(".ug-jog-wheel__dial").getBoundingClientRect(), label = root.querySelector(".ug-jog-wheel__label"), box = label.getBoundingClientRect();
      return { dial: [dial.width, dial.height], labelLeft: box.left, labelRight: box.right, clipped: label.scrollWidth > label.clientWidth + 1 }; }) }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  for (const wheel of layout.wheels) { expect(wheel.clipped).toBe(false); expect(wheel.labelLeft).toBeGreaterThanOrEqual(0); expect(wheel.labelRight).toBeLessThanOrEqual(320); }
  expect(layout.wheels.map(wheel => wheel.dial)).toEqual([[128, 128], [128, 128], [96, 96]]);
  console.log(`200% text: scrollWidth ${layout.scrollWidth}, dials ${layout.wheels.map(wheel => wheel.dial.join("x")).join(", ")}`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the wheels pass axe in light and dark, draw a visible control under forced colours and more contrast, and settle at once under reduced motion", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#jog-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("jog-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#jog-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("jog-panel").removeAttribute("data-strata-mode"); });
    await mkdir(evidence, { recursive: true });
    await page.locator("#jog-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  // The detent overshoots over motion.fast; the continuous wheel follows at once.
  expect(await page.locator("#scrub-jog .ug-jog-wheel__turn").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0.12s");
  expect(await page.locator("#shuttle-jog .ug-jog-wheel__turn").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  // The input's thumb is not drawn (a thumb that moves with the value would be paint).
  expect(await page.evaluate(() => {
    const find = rules => { for (const rule of rules) { if (rule.selectorText?.includes("ug-jog-wheel__input") && rule.selectorText.includes("-webkit-slider-thumb")) return rule.style.display; if (rule.cssRules) { const inner = find(rule.cssRules); if (inner) return inner; } } return undefined; };
    for (const sheet of document.styleSheets) { try { const found = find(sheet.cssRules); if (found) return found; } catch { /* a cross-origin sheet */ } }
    return undefined;
  })).toBe("none");

  await page.emulateMedia({ forcedColors: "active" });
  const forced = await new AxeBuilder({ page }).include("#jog-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe under forced colours").toEqual([]);
  const styles = await page.locator("#shuttle-jog").evaluate(root => {
    const style = selector => getComputedStyle(root.querySelector(selector));
    return { wheel: [style(".ug-jog-wheel__wheel").borderTopStyle, style(".ug-jog-wheel__wheel").borderTopWidth], recess: style(".ug-jog-wheel__well").borderTopStyle,
      dimple: style(".ug-jog-wheel__dimple").backgroundColor, canvas: style(".ug-jog-wheel__wheel").backgroundColor };
  });
  expect(styles.wheel).toEqual(["solid", "1px"]);
  expect(styles.recess).toBe("solid");
  expect(styles.dimple, "the dimple is CanvasText on Canvas").not.toBe(styles.canvas);
  const png = PNG.sync.read(await page.locator("#shuttle-jog .ug-jog-wheel__dial").screenshot({ path: `${evidence}/forced-colors.png` }));
  const luma = index => 0.2126 * png.data[index] + 0.7152 * png.data[index + 1] + 0.0722 * png.data[index + 2];
  let dark = 0, light = 0;
  for (let index = 0; index < png.data.length; index += 4) { if (luma(index) < 60) dark++; else if (luma(index) > 200) light++; }
  expect(dark, "CanvasText ink in the dial (the edges and the dimple)").toBeGreaterThan(300);
  expect(light).toBeGreaterThan(5000);
  await page.locator("#shuttle").focus();
  await page.keyboard.press("ArrowUp");
  expect(await page.locator("#shuttle-jog .ug-jog-wheel__well").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const more = await page.locator("#shuttle-jog").evaluate(root => ({ wheel: getComputedStyle(root.querySelector(".ug-jog-wheel__wheel")).borderTopWidth, dimple: getComputedStyle(root.querySelector(".ug-jog-wheel__dimple")).borderTopWidth }));
  expect(Number.parseFloat(more.wheel)).toBeGreaterThanOrEqual(1);
  expect(Number.parseFloat(more.dimple)).toBeGreaterThanOrEqual(1);
  const contrast = await new AxeBuilder({ page }).include("#jog-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await page.emulateMedia({ contrast: "no-preference", reducedMotion: "reduce" });
  expect(await page.locator("#scrub-jog .ug-jog-wheel__turn").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-jog-wheel.html${query}`);
  await page.waitForFunction(() => window.strataJogProbe && window.strataJogProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataJogProbe.scene() !== undefined);
  await page.evaluate(() => window.strataJogProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => { const instrument = window.strataJogProbe.instrument(); return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status === "ready")); }, null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataJogProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataJogProbe.instrument().layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** Waits until the scene stops changing (every spring at rest). */
const settled = page => page.evaluate(async () => {
  const probe = window.strataJogProbe;
  let previous = "", same = 0;
  for (let index = 0; index < 240 && same < 4; index++) {
    probe.refresh(); await probe.controller.settle();
    await new Promise(requestAnimationFrame);
    const now = JSON.stringify(probe.scene());
    same = now === previous ? same + 1 : 0; previous = now;
  }
  return same >= 4;
});
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(150);
  expect(await settled(page), `${name}: the scene settles`).toBe(true);
  await page.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); await window.strataJogProbe.controller.settle(); });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, inside and outside the `allowed` boxes (frame CSS px), and the changed points. */
function difference(a, b, allowed, { points = false } = {}) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [], changed = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(box => px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height)) { inside++; if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples, changed };
}
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id }; });
}, selector);
/** Native hits on frame points: how many land on a wheel's input. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches(".ug-jog-wheel__input")) mismatches++;
  return { total: points.length, mismatches };
}, points);
const dialsHidden = (page, hidden) => page.evaluate(hidden => { for (const dial of document.querySelectorAll(".ug-jog-wheel__dial")) dial.style.visibility = hidden ? "hidden" : ""; }, hidden);
const counts = page => page.evaluate(() => window.strataJogProbe.counts());
/** What the scene says about the wheels: its kind and its entries or objects. */
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataJogProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, primitives: scene.primitives,
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), pose: object.parts.map(part => part.pose), bounds: object.bounds.rect, caster: object.parts.map(part => part.caster),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id))[index]) < 0.01) })),
    boxes: Object.fromEntries(["shuttle", "scrub", "tune"].map(id => [id, { input: rectOf(document.getElementById(id)), wheel: rectOf(document.querySelector(`#${id}-jog .ug-jog-wheel__wheel`)), well: rectOf(document.querySelector(`#${id}-jog .ug-jog-wheel__well`)) }])) };
});

for (const dpr of [1, 2]) for (const level of levels) test(`the wheels at ${level} (DPR ${dpr}): the scene, containment through a whole turn, hits, and a turn changes the dial only`, async ({ browser }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  const dimpleWells = [];
  if (level === "instrument") {
    expect(scene).toMatchObject({ version: 4, kind: "instrument", camera: 2400 });
    const wheels = scene.objects.filter(object => object.id !== "jog-reset");
    expect(wheels.map(object => object.id)).toEqual(["shuttle", "scrub", "tune"]);
    for (const object of wheels) {
      expect(object.close, `${object.id}: bounds are the input's box`).toBe(true);
      expect(object.parts).toEqual(["collar:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "grip:jogDimple"]);
      expect(object.pose[3]).toMatchObject({ from: { turn: 0 }, to: { turn: 360 } });
      expect(object.caster[3], "the dimple casts nothing").toBe(null);
    }
    // t is the angle's place in a turn: Shuttle 180° (12 steps of 15°), Scrub 0°, Tune 180° (12 of 24 steps).
    expect(wheels.map(object => object.t)).toEqual([0.5, 0, 0.5]);
    expect(scene.objects.find(object => object.id === "jog-reset").parts[0]).toMatch(/^plinth:key /);
    // Casters: the collar and the cap keep their shadows in the box (core's own, or this footprint at the height that fits).
    const margins = await page.evaluate(() => window.strataJogProbe.scene().objects.filter(object => object.id !== "jog-reset").map(object => object.parts.slice(0, 2).map(part => part.caster ? part.caster.height : null)));
    console.log(`DPR ${dpr} instrument: wheel casters (collar, cap) ${JSON.stringify(margins[0])}, tune ${JSON.stringify(margins[2])}`);
    const materials = await page.evaluate(() => Object.keys(window.strataJogProbe.scene().materials));
    for (const name of ["knobSkirt", "knobCap", "knobChamfer", "jogDimple"]) expect(materials, name).toContain(name);
    expect(materials.length, "within core's 16 materials").toBeLessThanOrEqual(16);
  } else {
    const wells = scene.primitives.filter(entry => (level === "relief" ? entry.face === "well" : entry.object === "well"));
    const discs = scene.primitives.filter(entry => (level === "relief" ? entry.face === "raised" && entry.radius === entry.rect[2] / 2 && entry.rect[2] >= 64 : entry.object === "slab" && entry.radius === entry.rect[2] / 2 && entry.rect[2] >= 64));
    expect(wells.length, "a recess and a dimple per wheel").toBe(6);
    expect(discs.length, "a disc per wheel").toBe(3);
    for (const id of ["shuttle", "scrub", "tune"]) {
      const { well, wheel } = scene.boxes[id];
      expect(wells.some(entry => entry.rect.every((v, index) => Math.abs(v - well[index]) < 0.6)), `${id}: the recess is a well`).toBe(true);
      expect(discs.some(entry => entry.rect.every((v, index) => Math.abs(v - wheel[index]) < 0.6)), `${id}: the wheel is a disc`).toBe(true);
    }
    dimpleWells.push(...wells.filter(entry => entry.rect[2] < 30));
    expect(dimpleWells.length).toBe(3);
    if (level === "objects") {
      const slab = discs.find(entry => entry.rect[2] === 96), well = wells.find(entry => entry.rect[2] === 104), dimple = dimpleWells[0];
      expect(slab.base, "the wheel stands on the recess's floor").toBe(round(well.base - well.height));
      expect(dimple.base, "the dimple is sunk from the wheel's top").toBeCloseTo(slab.base + slab.height, 1);
    }
  }
  await healthy(page, "start", level);
  // The CSS paint of the dimple is hidden at every level, the wheel's only at Instrument.
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-jog-wheel__dimple")].every(element => element.hasAttribute("data-strata-dome")))).toBe(true);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-jog-wheel__wheel")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(level === "instrument" ? 3 : 0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.primitives.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every dial.
  for (const id of ["shuttle", "scrub", "tune"]) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the dial`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: 3 dials × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment through a whole turn: at 0°, 90°, 180°, 270° and 345° (Shuttle's value 0, 6, 12, 18 and 23) every object pixel lies inside a dial,
  // against the same page with the dials hidden, and native hits on those pixels find a wheel's input. At Instrument at three depths.
  const dials = await inFrame(page, ".ug-jog-wheel__input");
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const depth of depths) {
    await page.evaluate(depth => { if (depth === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(depth)); }, depth);
    const label = depth === null ? "0.5" : String(depth);
    for (const turned of depth === null ? [0, 6, 12, 18, 23] : [0, 12]) {
      await script(page, "shuttle", turned); await script(page, "scrub", (turned % 12)); await script(page, "tune", -12 + (turned % 25));
      await dialsHidden(page, true);
      const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-${turned}-bare`);
      await dialsHidden(page, false);
      const shown = await frame(page, `${level}-dpr${dpr}-depth${label}-${turned}-shown`);
      const parts = difference(shown, bare, dials, { points: true });
      expect(parts.inside, `depth ${label}, step ${turned}: the wheels are drawn`).toBeGreaterThan(2000 * dpr * dpr);
      expect(parts.outside, `depth ${label}, step ${turned}: no pixel outside a dial (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
      const hit = await hitsOn(page, parts.changed);
      expect(hit.mismatches, `depth ${label}, step ${turned}: native hits on object pixels`).toBe(0);
      console.log(`DPR ${dpr} ${level}: depth ${label}, shuttle at ${turned * 15}°: ${parts.inside} px inside the dials, ${parts.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
    }
    await healthy(page, `depth ${label}`, level);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));

  // A turn changes pixels in the dial only (and the readout, which prints the value): real drags, taps and keys.
  const allowed = [...dials, ...(await inFrame(page, "#jog-read"))];
  await script(page, "shuttle", 12); await script(page, "scrub", 0); await script(page, "tune", 0);
  let before = await frame(page, `${level}-dpr${dpr}-start`);
  const c = await dial(page, "shuttle");
  const turns = [
    ["a quarter turn", async () => { await circle(page, "shuttle", 0, 90); }, 18],
    ["a tap", async () => { await page.mouse.click(c.cx, c.cy - 30); }, 19],
    ["a key", async () => { await page.locator("#shuttle").focus(); await page.keyboard.press("ArrowDown"); }, 18],
    ["a half turn back through the wrap", async () => { await script(page, "shuttle", 99); await circle(page, "shuttle", 0, 90); }, 5],
  ];
  for (const [name, act, expected] of turns) {
    await act();
    expect(await value(page, "shuttle"), name).toBe(expected);
    const after = await frame(page, `${level}-dpr${dpr}-${name.replace(/\W+/g, "-")}`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${name}: the dial changes`).toBeGreaterThan(20);
    expect(changed.outside, `${name}: nothing changes outside the dial (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`DPR ${dpr} ${level}: ${name} → ${expected}: ${changed.inside} px changed in the dial, ${changed.outside} outside`);
    await healthy(page, name, level);
    before = after;
  }
  expect(errors).toEqual([]);
  await context.close();
});
const round = number => Math.round(number * 1000) / 1000;

for (const dpr of [1, 2]) for (const level of levels) test(`300 frames of a flick at ${level} (DPR ${dpr}): GPU stays on, no hit-geometry update, no capture beyond the input events, the dimple turns and the value steps with the angle`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await healthy(page, "start", level);
  await page.evaluate(() => window.strataJogProbe.muteReadout(true));
  await settled(page);
  const run = await page.evaluate(async () => {
    const probe = window.strataJogProbe, frame = () => new Promise(requestAnimationFrame), input = document.getElementById("shuttle");
    // The dimple's place: at Instrument the object's t, otherwise the well on the wheel (the scene's 20 px wells).
    const dimple = () => { const scene = probe.scene(); return scene.objects ? scene.objects.find(object => object.id === "shuttle").t : scene.primitives.filter(entry => (entry.face ?? entry.object) === "well" && entry.rect[2] < 30).map(entry => `${entry.rect[0]},${entry.rect[1]}`).join("|"); };
    for (let index = 0; index < 8; index++) await frame();
    const start = probe.counts(), first = Number(input.value), firstAngle = probe.angle("shuttle");
    let inputs = 0, steps = 0, frameInputs = 0, last = first;
    document.addEventListener("input", event => { inputs++; frameInputs++; const now = Number(event.target.value); steps += ((now - last + 150) % 100) - 50; last = now; }, true);
    probe.fling("shuttle", 2400);
    let moving = 0, previous = dimple(), calm = 3, before = start, lastInput = -1;
    const rows = [];
    for (let index = 0; index < 300; index++) {
      frameInputs = 0;
      await frame();
      const next = dimple(), now = probe.counts();
      if (next !== previous) moving++;
      previous = next;
      // A capture is one the input events ask for (in their frame or the next two); the turning frames in between add none.
      calm = frameInputs ? 0 : calm + 1;
      if (frameInputs) lastInput = index;
      rows.push([calm > 2 ? now.captures - before.captures : 0, index]);
      before = now;
    }
    // While it turns: none in a calm frame; when it comes to rest the DOM gets its angle and its value text and `change` fires, one capture.
    const extra = rows.filter(([, index]) => index < lastInput).reduce((sum, [captures]) => sum + captures, 0), atRest = rows.filter(([, index]) => index >= lastInput).reduce((sum, [captures]) => sum + captures, 0);
    const end = probe.counts();
    return { skipped: end.inputCapturesSkipped - start.inputCapturesSkipped, atRest, first, firstAngle, last: Number(input.value), angle: probe.angle("shuttle"), inputs, steps, moving, extra, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  });
  console.log(`DPR ${dpr} ${level}: 300 frames of a flick: ${run.skipped} input captures skipped, ${run.inputs} steps (${run.first} → ${run.last}, angle ${run.firstAngle}° → ${run.angle.toFixed(1)}°), the dimple moved on ${run.moving} frames, ${run.captures} captures (${run.extra} in turning frames with no input event of their own, ${run.atRest} when it came to rest), ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates`);
  expect(run.mode).toBe("gpu");
  expect(run.geometryUpdates, "no hit-geometry update").toBe(0);
  expect(run.moving, "the dimple turns on most of the frames the wheel coasts").toBeGreaterThan(50);
  expect(run.inputs, "the native value steps").toBeGreaterThan(20);
  expect(run.steps, "one native step each, clockwise").toBe(run.inputs);
  expect(run.last).toBe(((Math.round(run.angle / 15) % 100) + 100) % 100);
  expect(run.extra, "the turning frames between the events add no capture").toBe(0);
  expect(run.atRest, "the angle, the value text and `change` at rest are one capture").toBeLessThanOrEqual(2);
  // The wheel's input is marked `data-underglass-gpu-value` (the GPU draws the dimple, the thumb is never painted): its input events capture nothing (#167).
  expect(run.skipped, "every input event of the flick was skipped by core").toBe(run.inputs);
  // The helper marks the input with the dome (before the flick), so the 49 input events capture nothing and only the angle and value text written at rest remain: 1 capture (36 to 38 before, #167).
  expect(run.atRest, "the angle, the value text and `change` at rest are one capture").toBe(1);
  expect(run.captures, "only the write at rest is captured").toBe(1);
  expect(run.uploads).toBeLessThanOrEqual(run.captures + 1);
  await healthy(page, "after the flick", level);
  await context.close();
});

test("under reduced motion the dimple is on its step in the first scene at the Instrument level, and a wheel does not coast", async ({ browser }) => {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion });
    const page = await context.newPage();
    await ready(page, "?level=instrument");
    await page.locator("#shuttle").focus();
    const first = await page.evaluate(async () => {
      const probe = window.strataJogProbe, input = document.getElementById("shuttle");
      input.value = "30"; input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise(requestAnimationFrame);
      probe.refresh();
      return { t: probe.scene().objects.find(object => object.id === "shuttle").t, fling: probe.fling("shuttle", 2400) };
    });
    // 30 steps of 15° is 450°: a quarter into the second turn (t 0.25); the first scene after the change is there at once, or still on its way.
    console.log(`${reducedMotion}: the first scene after the change: t ${first.t}, fling ${first.fling}`);
    if (reducedMotion === "reduce") { expect(first.t).toBe(0.25); expect(first.fling, "no inertia").toBe(false); }
    else { expect(first.fling).toBe(true); expect(first.t).not.toBe(0.25); }
    await healthy(page, reducedMotion, "instrument");
    await context.close();
  }
});

test("the jog wheel page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-jog-wheel.html?dom");
  await page.waitForFunction(() => window.strataJogProbe);
  const act = async () => { await page.locator("#shuttle").focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.locator("#tune").focus(); await page.keyboard.press("ArrowDown"); };
  await act();
  const dom = await page.locator("#jog-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#jog-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('slider "Shuttle"');
    expect(gpu).toContain('slider "Tune"');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#jog-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
});

test("the input's mark goes with the dimple's dome: detaching the helper mid-flick removes it, and the next input captures again", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await ready(page);
  await page.evaluate(() => window.strataJogProbe.muteReadout(true));
  await settled(page);
  const run = await page.evaluate(async () => {
    const probe = window.strataJogProbe, frame = () => new Promise(requestAnimationFrame), input = document.getElementById("shuttle");
    const marked = () => input.hasAttribute("data-underglass-gpu-value");
    const before = marked();
    let inputs = 0;
    document.addEventListener("input", () => { inputs++; }, true);
    probe.fling("shuttle", 2400);
    for (let index = 0; index < 20; index++) await frame();
    const turning = { marked: marked(), inputs, skipped: probe.counts().inputCapturesSkipped, captures: probe.counts().captures };
    probe.detach();
    const gone = marked();
    for (let index = 0; index < 4; index++) await frame();
    const at = { inputs, skipped: probe.counts().inputCapturesSkipped, captures: probe.counts().captures };
    for (let index = 0; index < 60; index++) await frame();
    const end = { inputs, skipped: probe.counts().inputCapturesSkipped, captures: probe.counts().captures };
    return { before, turning, gone, at, end };
  });
  console.log(`mark ${run.before} at start, ${run.turning.marked} while turning (${run.turning.inputs} inputs, ${run.turning.skipped} skipped, ${run.turning.captures} captures); after detach ${run.gone}; ${run.end.inputs - run.at.inputs} more inputs: ${run.end.skipped - run.at.skipped} skipped, ${run.end.captures - run.at.captures} captures`);
  expect(run.before, "marked while the GPU draws the dimple, before any input").toBe(true);
  expect(run.turning.skipped, "its inputs were skipped while marked").toBe(run.turning.inputs);
  expect(run.gone, "the mark went with the dome").toBe(false);
  expect(run.end.inputs - run.at.inputs, "the wheel kept coasting").toBeGreaterThan(0);
  expect(run.end.skipped - run.at.skipped, "no input is skipped once the mark is gone").toBe(0);
  await context.close();
});
