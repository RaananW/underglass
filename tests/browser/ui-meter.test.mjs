/**
 * Browser suite for the Meter (anatomy page `meter.md`) on `ui-meter.html` (`window.strataMeterProbe`): plain contract markup
 * with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel. A level bar (16 segments, zones
 * from `low` 70 / `high` 90 / `optimum` 0), a gain bar (8 segments), a bar that holds its peak, a VU needle meter with a red
 * zone from 0 dB and a bare needle meter.
 * - Plain DOM (`?plain`): role `meter`, the name, `value`, `min`, `max`, `low`, `high`, `optimum` and `aria-valuetext`; the lit
 *   segments at 0, 25, 50, 75 and 100 and their zones; a written `value` moves `--strata-meter-value` and the unit's text; a held
 *   peak stays and falls to the value; every box is as documented and a grid of `elementFromPoint` over it finds the meter;
 *   the needle follows its value on a spring (and at once under reduced motion).
 * - 390 and 320 px: no horizontal overflow, the numerals inside the window; 200% text keeps them inside and apart.
 * - Preferences: axe in light, dark, face mode, forced colours (a Highlight lit segment, a CanvasText needle) and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is version 4 with an emitter per segment in
 *   document order, its strength from the value and the zone's colour, the protected rects of every text and the documented
 *   parts; the parts draw inside the boxes only (0 px outside) over the whole value range and native hits on them find the
 *   meter; a value change changes pixels in the box and the light's reach only; the face is lit round a lit bar and protected
 *   text stays within the guard; at Instrument the printed scale under the glass is the capture itself; 300 frames of a
 *   sweeping value add no capture, upload or hit-geometry update while the needle moves on its spring; reduced motion puts the
 *   needle on its target at once; past 64 emitters the rest are dropped with the diagnostic; more contrast turns the lights off;
 *   the accessibility snapshot is the same in DOM and GPU modes.
 * Screenshots go to the `ui-meter` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-meter");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** Each meter's name, form, range and its box in px at 100% text (medium). */
const meters = {
  level: { name: "Level", form: "bar", min: 0, max: 100, box: [286.4, 58], segments: 16 },
  gain: { name: "Gain", form: "bar", min: 0, max: 10, box: [166.4, 58], segments: 8 },
  hold: { name: "Hold", form: "bar", min: 0, max: 100, box: [286.4, 58], segments: 16 },
  vu: { name: "VU", form: "needle", min: -20, max: 3, box: [264, 152] },
  temp: { name: "Warmth", form: "needle", min: 0, max: 100, box: [264, 152] },
};
const ids = Object.keys(meters), bars = ids.filter(id => meters[id].form === "bar"), needles = ids.filter(id => meters[id].form === "needle");
const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
const set = (page, id, value) => page.evaluate(([id, value]) => window.strataMeterProbe.set(id, value), [id, value]);
/** Writes every meter's value at `share` percent of its own range. */
const setAll = (page, share, only = ids, spec = meters) => page.evaluate(([share, only, spec]) => {
  for (const id of only) window.strataMeterProbe.set(id, spec[id].min + (share / 100) * (spec[id].max - spec[id].min));
}, [share, only, spec]);
/** How many of a meter's segments are lit now (the CSS's `--strata-lit`), and the zone letters. */
const lit = (page, id) => page.locator(`#${id}`).evaluate(native => [...native.closest(".ug-meter").querySelectorAll(".ug-meter__segment")].filter(segment => Number(getComputedStyle(segment).getPropertyValue("--strata-lit")) >= 0.5).length);
const zones = (page, id) => page.locator(`#${id}`).evaluate(native => [...native.closest(".ug-meter").querySelectorAll(".ug-meter__segment")].map(segment => segment.getAttribute("data-strata-zone")[0]).join(""));
const drawn = (page, id) => page.locator(`#${id}`).evaluate(native => native.closest(".ug-meter").style.getPropertyValue("--strata-meter-value"));
/** elementFromPoint over a grid on a meter's box (inset 0.5 px): every hit must be the native meter. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const native = document.getElementById(id), box = native.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== native) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-meter.html?plain${query}`);
  await page.waitForFunction(() => window.strataMeterProbe);
  return { context, page, errors };
}

test("a meter is a native <meter>: role, name, value, range, zones, aria-valuetext, the lit segments at 0 to 100% and their zones, and its box", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  for (const id of ids) {
    const native = page.locator(`#${id}`);
    await expect(native, `${id}: role`).toHaveRole("meter");
    await expect(native).toHaveAccessibleName(meters[id].name);
    const box = await native.boundingBox();
    expect(box.width, `${id}: the box's width`).toBeCloseTo(meters[id].box[0], 0);
    expect(box.height, `${id}: the box's height`).toBeCloseTo(meters[id].box[1], 0);
    const grid = await hits(page, id);
    expect(grid.misses, `${id}: hits over the box`).toEqual([]);
  }
  expect(await page.locator("#level").evaluate(native => [native.value, native.min, native.max, native.low, native.high, native.optimum])).toEqual([50, 0, 100, 70, 90, 0]);
  await expect(page.locator("#level")).toHaveAttribute("aria-valuetext", "50 %");
  await expect(page.locator("#vu")).toHaveAttribute("aria-valuetext", "−6 dB");
  await expect(page.locator("#gain")).not.toHaveAttribute("aria-valuetext", /.*/);
  // The zones: 11 good, 3 suboptimal, 2 worst for the level bar; one zone for the gain bar.
  expect(await zones(page, "level")).toBe("gggggggggggwwwbb");
  expect(await zones(page, "gain")).toBe("gggggggg");
  // The lit segments at 0, 25, 50, 75 and 100%, the drawing's value and the unit's text follow a written value.
  const litAt = {};
  for (const share of [0, 25, 50, 75, 100]) {
    await set(page, "level", share);
    litAt[share] = await lit(page, "level");
    expect(await drawn(page, "level"), `${share}%: the drawing's value`).toBe(String(share / 100));
    await expect(page.locator("#level")).toHaveAttribute("aria-valuetext", `${share} %`);
    await set(page, "gain", (share / 100) * 10);
    expect(await lit(page, "gain"), `gain at ${share}%`).toBe([0, 2, 4, 6, 8][share / 25]);
  }
  expect(litAt).toEqual({ 0: 0, 25: 4, 50: 8, 75: 12, 100: 16 });
  // Lit segments are the whole of a bar's value: the CSS and the model agree at every step.
  for (let value = 0; value <= 100; value += 7) { await set(page, "level", value); expect(await lit(page, "level"), `level ${value}`).toBe(Math.max(0, Math.ceil((value / 100) * 16 - 0.5 - 1e-9)) + 0); }
  // A value outside the range is held to it, as the browser does.
  await set(page, "level", 500);
  expect(await page.locator("#level").evaluate(native => native.value)).toBe(100);
  expect(await lit(page, "level")).toBe(16);
  // Rewriting the zones' attributes recolours the segments.
  await page.locator("#level").evaluate(native => { native.setAttribute("optimum", "100"); native.setAttribute("low", "30"); });
  await expect(async () => expect(await zones(page, "level")).toBe("bbbbbwwwwwwwwwgg")).toPass({ timeout: 2000 });
  expect(errors).toEqual([]);
  await context.close();
});

test("a bar's held peak stays lit for the hold and falls onto the value; a bar that does not hold has none", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const peak = id => page.locator(`#${id}`).evaluate(native => native.closest(".ug-meter").style.getPropertyValue("--strata-meter-peak-index"));
  expect(await peak("level"), "no peak, no held segment").toBe("");
  await set(page, "hold", 80);
  expect(await peak("hold")).toBe("12");
  await set(page, "hold", 20);
  // 20% lights 3 segments, and the held 13th stays lit.
  expect(await peak("hold")).toBe("12");
  expect(await lit(page, "hold"), "the value's segments and the held one").toBe(4);
  const start = Date.now();
  await page.waitForTimeout(300);
  expect(await peak("hold"), "still held after 300 ms").toBe("12");
  // It then falls half the range a second: 0.6 s hold, then (0.8 − 0.2) / 0.5 = 1.2 s.
  await expect(async () => expect(await peak("hold")).toBe("2")).toPass({ timeout: 6000 });
  console.log(`peak: held for ${Date.now() - start} ms at the longest, then fell onto the value's top segment (the 3rd)`);
  expect(await lit(page, "hold")).toBe(3);
  // A new maximum takes it up at once.
  await set(page, "hold", 100);
  expect(await peak("hold")).toBe("15");
  await context.close();
});

test("a needle follows its value on a spring, and at once under reduced motion", async ({ browser }) => {
  const trace = async options => {
    const { context, page } = await plain(browser, options);
    const read = () => page.evaluate(() => { const root = document.getElementById("vu").closest(".ug-meter"); return Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-meter-t")); });
    const t0 = await read();
    await set(page, "vu", 3);
    const first = await read();
    await page.waitForTimeout(50);
    const mid = await read();
    await page.waitForTimeout(500);
    const end = await read();
    await context.close();
    return { t0, first, mid, end };
  };
  const moving = await trace({});
  console.log(`the needle: ${JSON.stringify(moving)}`);
  expect(moving.t0).toBeCloseTo(0.6087, 3);
  expect(moving.first, "the first frame has not got there").toBeLessThan(0.99);
  expect(moving.mid, "in flight").toBeGreaterThan(moving.t0);
  expect(moving.mid).toBeLessThan(1.0001);
  expect(moving.end, "at rest on the value").toBe(1);
  const instant = await trace({ reducedMotion: "reduce" });
  expect(instant.first, "reduced motion: at the target in the first frame").toBe(1);
});

for (const width of [390, 320]) test(`at ${width} px the meters reflow without overflow and every numeral stays inside its window`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    meters: [...document.querySelectorAll(".ug-meter")].map(root => {
      const native = root.querySelector("meter"), window = root.querySelector(".ug-meter__window").getBoundingClientRect(), box = native.getBoundingClientRect();
      return { id: native.id, left: box.left, right: box.right, width: box.width, height: box.height, windowLeft: window.left, windowRight: window.right,
        marks: [...root.querySelectorAll(".ug-meter__mark")].map(mark => { const r = mark.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }),
        windowTop: window.top, windowBottom: window.bottom };
    }),
    labels: [...document.querySelectorAll(".ug-meter__label")].map(label => { const box = label.getBoundingClientRect(); return { left: box.left, right: box.right, clipped: label.scrollWidth > label.clientWidth + 1 }; }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.meters) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.id}: inside the viewport`).toBeLessThanOrEqual(width);
    for (const mark of box.marks) { expect(mark.left).toBeGreaterThanOrEqual(box.windowLeft - 1); expect(mark.right).toBeLessThanOrEqual(box.windowRight + 1); expect(mark.bottom).toBeLessThanOrEqual(box.windowBottom + 1); expect(mark.top).toBeGreaterThanOrEqual(box.windowTop - 1); }
  }
  for (const label of layout.labels) { expect(label.left).toBeGreaterThanOrEqual(0); expect(label.right).toBeLessThanOrEqual(width); expect(label.clipped).toBe(false); }
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, widest box ${Math.max(...layout.meters.map(box => box.width))} px, ${layout.meters.length} meters`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the numerals stay inside their window and apart, and nothing overflows", async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width: 320, height: 900 } });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    meters: [...document.querySelectorAll(".ug-meter")].map(root => {
      const window = root.querySelector(".ug-meter__window").getBoundingClientRect(), marks = [...root.querySelectorAll(".ug-meter__mark")].map(mark => { const range = document.createRange(); range.selectNodeContents(mark); const r = range.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, text: mark.textContent }; });
      return { id: root.querySelector("meter").id, left: window.left, right: window.right, top: window.top, bottom: window.bottom, marks };
    }),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  for (const box of layout.meters) {
    for (const mark of box.marks) { expect(mark.left, `${box.id} ${mark.text}`).toBeGreaterThanOrEqual(box.left - 1); expect(mark.right, `${box.id} ${mark.text}`).toBeLessThanOrEqual(box.right + 1); expect(mark.bottom, `${box.id} ${mark.text}`).toBeLessThanOrEqual(box.bottom + 1); expect(mark.top, `${box.id} ${mark.text}`).toBeGreaterThanOrEqual(box.top - 1); }
    // The numerals of a bar do not overlap one another.
    if (meters[box.id].form === "bar") for (let index = 1; index < box.marks.length; index++) expect(box.marks[index].left, `${box.id}: ${box.marks[index - 1].text} and ${box.marks[index].text} are apart`).toBeGreaterThanOrEqual(box.marks[index - 1].right - 0.5);
  }
  console.log(`200% text: scrollWidth ${layout.scrollWidth}, ${layout.meters.length} meters, every numeral inside its window`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the meters pass axe in light, dark, face mode, forced colours and more contrast, and forced colours draw them", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#meter-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("meter-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#meter-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("meter-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const colours = await page.evaluate(() => {
    const segments = [...document.getElementById("level").closest(".ug-meter").querySelectorAll(".ug-meter__segment")];
    const needle = getComputedStyle(document.getElementById("vu").closest(".ug-meter").querySelector(".ug-meter__needle"));
    return { litSegment: getComputedStyle(segments[0], "::after").backgroundColor, unlit: getComputedStyle(segments[15], "::after").backgroundColor, glow: getComputedStyle(segments[0]).boxShadow, needle: needle.backgroundColor, text: getComputedStyle(document.getElementById("note")).color };
  });
  expect(colours.litSegment, "a lit segment is Highlight, an unlit one Canvas").not.toBe(colours.unlit);
  expect(colours.glow, "no glow").toBe("none");
  expect(colours.needle, "the needle is CanvasText").toBe(colours.text);
  const forced = await new AxeBuilder({ page }).include("#meter-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const more = await page.evaluate(() => { const segment = getComputedStyle(document.getElementById("level").closest(".ug-meter").querySelector(".ug-meter__segment")); return { border: segment.borderTopWidth, glow: segment.boxShadow }; });
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(Number.parseFloat(more.border)).toBeGreaterThanOrEqual(1);
  const contrast = await new AxeBuilder({ page }).include("#meter-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

/** The mean of the 4 × 4 decoded px at a segment's centre in a full-viewport screenshot (DPR 1): a lit segment (the first) and an unlit one of the same zone. */
async function segmentPixels(page, id = "level") {
  const centres = await page.locator(`#${id}`).evaluate(native => [...native.closest(".ug-meter").querySelectorAll(".ug-meter__segment")].map(segment => { const box = segment.getBoundingClientRect(); return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2), Number(getComputedStyle(segment).getPropertyValue("--strata-lit")), segment.getAttribute("data-strata-zone")]; }));
  const png = PNG.sync.read(await page.screenshot());
  const mean = ([cx, cy]) => { const sum = [0, 0, 0]; for (let y = cy - 2; y < cy + 2; y++) for (let x = cx - 2; x < cx + 2; x++) for (let c = 0; c < 3; c++) sum[c] += png.data[(y * png.width + x) * 4 + c] / 16; return sum.map(value => Math.round(value * 10) / 10); };
  const litCentre = centres.find(centre => centre[2] >= 0.5), darkCentre = centres.find(centre => centre[2] < 0.5 && centre[3] === litCentre[3]);
  return { lit: mean(litCentre), dark: mean(darkCentre) };
}
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** The margin a lit segment's centre must beat an unlit one's by (8-bit luma): the glass is the lit colour, 18% towards white, against the 16% tint on #15171b. */
const LIT_MARGIN = 40;

test("in the plain CSS presentation a lit segment is brighter than an unlit one, in light and dark, and the state shows under more contrast and forced colours", async ({ browser }) => {
  const { context, page } = await plain(browser);
  await page.evaluate(() => document.getElementById("level").scrollIntoView());
  expect(await page.evaluate(() => document.getElementById("meter-panel").hasAttribute("data-strata-mode")), "no GPU, no face mode").toBe(false);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { lit, dark } = await segmentPixels(page);
    console.log(`CSS ${theme}: lit ${lit} (luma ${luma(lit).toFixed(1)}), unlit ${dark} (luma ${luma(dark).toFixed(1)})`);
    expect(luma(lit) - luma(dark), `${theme}: a lit segment is brighter than an unlit one`).toBeGreaterThan(LIT_MARGIN);
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ contrast: "more" });
  const more = await segmentPixels(page);
  console.log(`CSS more contrast: lit ${more.lit}, unlit ${more.dark}`);
  expect(luma(more.lit) - luma(more.dark), "more contrast: the state still shows").toBeGreaterThan(LIT_MARGIN);
  await page.emulateMedia({ contrast: "no-preference", forcedColors: "active" });
  const forced = await segmentPixels(page);
  console.log(`CSS forced colours: lit ${forced.lit}, unlit ${forced.dark}`);
  expect(Math.max(...forced.lit.map((value, channel) => Math.abs(value - forced.dark[channel]))), "forced colours: Highlight against Canvas").toBeGreaterThan(60);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-meter.html${query}`);
  await page.waitForFunction(() => window.strataMeterProbe && window.strataMeterProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataMeterProbe.scene() !== undefined);
  await page.evaluate(() => window.strataMeterProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => window.strataMeterProbe.state().instrument?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataMeterProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataMeterProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name, { wait = 250, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataMeterProbe.refresh(); await window.strataMeterProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataMeterProbe.controller.settle();
  }, wait);
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, inside and outside the `allowed` regions (frame CSS px), and the changed points. */
function difference(a, b, allowed, { points = false } = {}) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [], changed = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(region => region.radius !== undefined ? Math.hypot(px - region.cx, py - region.cy) <= region.radius : px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) { inside++; if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples, changed };
}
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id };
  });
}, selector);
/** The centres and diameters of every segment, in frame px. */
const segmentCentres = page => page.evaluate(() => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(".ug-meter__segment")].map(segment => { const box = segment.getBoundingClientRect(); return { cx: box.left - frame.left + box.width / 2, cy: box.top - frame.top + box.height / 2, id: segment.closest(".ug-meter").querySelector("meter").id }; });
});
/** Native hits on frame points: how many land on a native meter. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches("meter.ug-meter__native")) mismatches++;
  return { total: points.length, mismatches };
}, points);
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-meter__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
const counts = page => page.evaluate(() => window.strataMeterProbe.counts());
/** Waits until no emitter is lit: a bar that holds its peak lets it fall (0.6 s, then half the range a second) before the bars are dark. */
const quiet = page => page.waitForFunction(() => { window.strataMeterProbe.refresh(); return window.strataMeterProbe.scene().emitters.every(emitter => emitter.strength === 0); }, null, { timeout: 8000, polling: 100 });
const pixel = (png, point, dpr) => { const offset = (Math.floor(point.y * dpr) * png.width + Math.floor(point.x * dpr)) * 4; return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]; };
const gain = (off, on, point, dpr) => { const a = pixel(off, point, dpr), b = pixel(on, point, dpr); return (b[0] + b[1] + b[2] - a[0] - a[1] - a[2]) / 3; };
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
/** The largest change of any channel inside `rect` beyond `1 ± m` times the reference (8-bit levels). */
function excess(reference, changed, rect, dpr, m = 0.04) {
  let worst = 0;
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * reference.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) { const value = reference.data[offset + channel], next = changed.data[offset + channel]; worst = Math.max(worst, next - value * (1 + m), value * (1 - m) - next); }
  }
  return Math.round(worst * 100) / 100;
}
/** What the scene says: its kind, the lights, the protected rects, the faces and the objects with their parts. */
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataMeterProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, feather: scene.feather, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), primitives: scene.primitives,
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => part.kind), materials: [...new Set(object.parts.map(part => part.material))], glass: object.parts.map(part => part.glass), emitters: object.parts.map(part => part.emitter), pose: object.parts.map(part => part.pose),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id))[index]) < 0.01) })),
    texts: [...document.querySelectorAll("#meter-panel *")].flatMap(element => [...element.childNodes].filter(node => node.nodeType === 3 && node.textContent.trim()).flatMap(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(box => [box.left - panel.left, box.top - panel.top, box.width, box.height]);
    })) };
});

for (const dpr of [1, 2]) for (const level of levels) test(`the meters at ${level} (DPR ${dpr}): the scene, the emitters, containment over the value range, hits, the light and the guard`, async ({ browser }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  const segmentCount = bars.reduce((sum, id) => sum + meters[id].segments, 0);
  expect(scene.version, "version 4").toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // One emitter per segment, in document order; the level bar's first eight are lit (50% of 16), the colour the zone's.
  expect(scene.emitters).toHaveLength(segmentCount);
  const strengths = scene.emitters.map(emitter => emitter.strength);
  expect(strengths.slice(0, 16).filter(value => value > 0), "the level bar lights 8").toHaveLength(8);
  expect(strengths.slice(16, 24).filter(value => value > 0), "the gain bar (2.5 of 10) lights 2").toHaveLength(2);
  expect(strengths.slice(24, 40).filter(value => value > 0), "the hold bar (40%) lights 6").toHaveLength(6);
  for (const emitter of scene.emitters) {
    expect(emitter.radius, "reach 3 diameters").toBeCloseTo(30, 2);
    expect(emitter.position[2], "height 0.8 diameters").toBeCloseTo(8, 2);
    expect(emitter.reach).toBe("outset");
    expect(emitter.strength === 0 || Math.abs(emitter.strength - 260) < 0.01, "260 for the 10 px lens").toBe(true);
  }
  // The zone's colour: the green of the level bar's good zone, scaled to full brightness (0.164, 1, 0.477 for #15803d).
  expect(scene.emitters[0].colour).toEqual([0.164, 1, 0.477]);
  expect(scene.feather).toBe(4);
  // Every text is protected, whole.
  expect(Array.isArray(scene.protected)).toBe(true);
  for (const text of scene.texts) expect(scene.protected.some(rect => rect[0] <= text[0] + 0.5 && rect[1] <= text[1] + 0.5 && rect[0] + rect[2] >= text[0] + text[2] - 0.5 && rect[1] + rect[3] >= text[1] + text[3] - 0.5), `a protected rect covers the text at ${text.map(Math.round)}`).toBe(true);
  expect(scene.outset.top, "the emitters' outset").toBeGreaterThanOrEqual(48);
  if (level === "instrument") {
    expect(scene.objects.map(object => object.id)).toEqual(ids);
    for (const object of scene.objects) {
      expect(object.close, `${object.id}: bounds are the meter's box`).toBe(true);
      if (meters[object.id].form === "bar") {
        expect(object.parts, `${object.id}: parts`).toEqual(["window", ...Array(meters[object.id].segments).fill("segment")]);
        expect(object.materials).toEqual(["meterGlass"]);
        expect(object.glass).toEqual(["window", ...Array(meters[object.id].segments).fill("lens")]);
        expect(object.t, "no pose: the emitters light").toBe(0);
      } else {
        expect(object.parts, `${object.id}: parts`).toEqual(["window", "needle", "pivot"]);
        expect(object.pose[1]).toEqual({ from: { turn: -140 }, to: { turn: -40 } });
        expect(object.materials).toEqual(["meterGlass", "knobInk", "knobCap"]);
      }
    }
    // Each bar's emitters are its own, in document order.
    const level0 = scene.objects[0];
    expect(level0.emitters.slice(1)).toEqual(Array.from({ length: 16 }, (_, index) => index));
    expect(scene.objects[1].emitters.slice(1)).toEqual(Array.from({ length: 8 }, (_, index) => 16 + index));
    // The needle is a pose: the value's place, 0.6087 and 0.5.
    expect(scene.objects.find(object => object.id === "vu").t).toBeCloseTo(0.6087, 3);
    expect(scene.objects.find(object => object.id === "temp").t).toBe(0.5);
    // The glass pane is the scale's strip, and a layer of five meters uses five materials in all.
    const materials = await page.evaluate(() => Object.keys(window.strataMeterProbe.scene().materials));
    for (const name of ["meterGlass", "knobSkirt", "knobCap", "knobInk"]) expect(materials, name).toContain(name);
    expect(materials.length, "within core's 16 materials").toBeLessThanOrEqual(16);
  } else {
    // Relief: the window a well, a needle meter's bezel raised, a hub knob, a disc per segment; Objects: wells, slabs and domes.
    const wanted = level === "relief" ? { well: "well", raised: "raised", knob: "knob", ring: "ring" } : { well: "well", raised: "slab", knob: "knob" };
    expect(scene.faces.filter(face => face === wanted.well).length, "windows").toBeGreaterThanOrEqual(5);
    expect(scene.faces.filter(face => face === wanted.raised).length, "bezels").toBeGreaterThanOrEqual(2);
    const rings = scene.primitives.filter(entry => entry.face === "ring");
    expect(rings, "a disc per segment at Relief").toHaveLength(level === "relief" ? segmentCount : 0);
    expect(rings.every(entry => entry.ring.thickness === entry.rect[2] / 2 && entry.ring.sweep === 360 && /^#[0-9a-f]{6}$/.test(entry.ring.colour))).toBe(true);
    if (level === "objects") expect(scene.faces.filter(face => face === "knob").length, "a dome per segment and a hub per needle meter").toBe(segmentCount + 2);
  }
  await healthy(page, "start", level);
  // The CSS paint of the segments the GPU draws is hidden; their sockets stay, and so does the needle's at Relief and Objects.
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-meter__segment")].filter(element => !element.hasAttribute("data-strata-dome")).length)).toBe(0);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-meter__needle")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(level === "instrument" ? 2 : 0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters (${strengths.filter(value => value > 0).length} lit), ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of ids) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment over the value range. The bars at 0 (no light), the needles at 0, 25, 50, 75 and 100% (each resting on its value): every object pixel lies
  // inside a native box, against the same page with the objects hidden, and native hits on those pixels find a meter.
  const boxes = await inFrame(page, "meter.ug-meter__native");
  const centres = await segmentCentres(page);
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
    const label = value === null ? "0.5" : String(value);
    for (const share of value === null ? [0, 25, 50, 75, 100] : [0, 100]) {
      await setAll(page, 0, bars);
      await quiet(page);
      await setAll(page, share, needles);
      await objectsHidden(page, true);
      const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-${share}-bare`);
      await objectsHidden(page, false);
      const shown = await frame(page, `${level}-dpr${dpr}-depth${label}-${share}-shown`);
      const parts = difference(shown, bare, boxes, { points: true });
      expect(parts.inside, `depth ${label}, ${share}%: the objects are drawn`).toBeGreaterThan(2000 * dpr * dpr);
      expect(parts.outside, `depth ${label}, ${share}%: no object pixel outside a box (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
      const hit = await hitsOn(page, parts.changed);
      expect(hit.mismatches, `depth ${label}, ${share}%: native hits on object pixels`).toBe(0);
      console.log(`DPR ${dpr} ${level}: depth ${label}, needles at ${share}%: ${parts.inside} px inside the boxes, ${parts.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
    }
    await healthy(page, `depth ${label}`, level);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));

  // Lit bars: at each share the light lies within three segment diameters of a lit segment (and the parts, as above, in the boxes); a value change changes pixels
  // in the boxes and the light's reach only.
  const reachOf = lit => centres.filter(centre => lit.has(centre.id)).map(centre => ({ cx: centre.cx, cy: centre.cy, radius: 33 }));
  await setAll(page, 0);
  await quiet(page);
  let before = await frame(page, `${level}-dpr${dpr}-value-0`);
  for (const share of [25, 50, 75, 100]) {
    await setAll(page, share);
    const after = await frame(page, `${level}-dpr${dpr}-value-${share}`);
    const changed = difference(before, after, [...boxes, ...reachOf(new Set(bars))]);
    expect(changed.inside, `${share}%: the value change is drawn`).toBeGreaterThan(300 * dpr * dpr);
    expect(changed.outside, `${share}%: nothing changes outside the boxes and the light's reach (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`DPR ${dpr} ${level}: all meters to ${share}%: ${changed.inside} px changed in the boxes and reach, ${changed.outside} outside`);
    before = after;
    await healthy(page, `value ${share}`, level);
  }

  // The face is lit round a lit bar, and protected text stays within the guard. The level bar at 100% against 0%: points above the box's top edge, within the reach.
  await setAll(page, 0, bars);
  await quiet(page);
  const off = await frame(page, `${level}-dpr${dpr}-bars-off`);
  await setAll(page, 100, bars);
  const on = await frame(page, `${level}-dpr${dpr}-bars-on`);
  const panelBox = (await inFrame(page, "#meter-panel"))[0], levelBox = boxes.find(box => box.id === "level");
  const texts = scene.texts.map(text => [text[0] + panelBox.x, text[1] + panelBox.y, text[2], text[3]]);
  const clearOfText = point => !texts.some(box => point.x >= box[0] - 4 && point.x <= box[0] + box[2] + 4 && point.y >= box[1] - 4 && point.y <= box[1] + box[3] + 4);
  const above = [];
  for (let step = 0; step < 24; step++) {
    const point = { x: levelBox.x + 30 + (step / 23) * (levelBox.width - 60), y: levelBox.y - 4 };
    if (clearOfText(point)) above.push(gain(off, on, point, dpr));
  }
  console.log(`DPR ${dpr} ${level}: the level bar at 100%: face gain 4 px above its box, median ${median(above)} (${above.length} points)`);
  expect(above.length, "sample points above the bar").toBeGreaterThan(8);
  expect(median(above), "the face is lit past the bar's edge, within the outset").toBeGreaterThan(0.5);
  const lightedAt = await Promise.all([8, 14].map(async distance => { const points = []; for (let step = 0; step < 16; step++) points.push(gain(off, on, { x: levelBox.x + 40 + (step / 15) * (levelBox.width - 80), y: levelBox.y - distance }, dpr)); return [distance, median(points)]; }));
  console.log(`DPR ${dpr} ${level}: face gain above the box at 8 / 14 px: ${JSON.stringify(lightedAt)}`);
  expect(lightedAt[0][1]).toBeGreaterThan(lightedAt[1][1] - 0.001);
  let worst = 0, checkedText = 0;
  for (const text of texts) {
    // Text inside the reach of a lit segment: within 30 px of a segment centre.
    if (!centres.some(centre => Math.hypot(Math.max(Math.abs(centre.cx - (text[0] + text[2] / 2)) - text[2] / 2, 0), Math.max(Math.abs(centre.cy - (text[1] + text[3] / 2)) - text[3] / 2, 0)) <= 30)) continue;
    worst = Math.max(worst, excess(off, on, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr)); checkedText++;
  }
  console.log(`DPR ${dpr} ${level}: ${checkedText} text rects within reach of a segment, worst change beyond the guard ${worst} levels`);
  expect(checkedText).toBeGreaterThan(4);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "bars lit", level);
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) the printed scale under the glass is the capture itself: its faceplate is exact, and no pixel changes when the bars light`, async ({ browser }) => {
  test.setTimeout(240000);
  /** One frame: the layer at the Instrument level (with its windows, or without them and without any relief: `bare`), or the DOM's own flat rendering of the same page (`dom`). */
  const shoot = async (kind, share, name) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    let png;
    if (kind === "dom") {
      await page.goto("/ui-meter.html?dom");
      await page.waitForFunction(() => window.strataMeterProbe);
      // The capture's own content: the panel flat, as the GPU presents it, with the needles left out (they are parts on the GPU) and the peak let go.
      await page.addStyleTag({ content: ".ug-meter__needle { visibility: hidden !important; }" });
      await page.evaluate(() => { document.getElementById("meter-panel").setAttribute("data-strata-mode", "face"); });
      await setAll(page, share);
      await page.waitForTimeout(300);
      await mkdir(evidence, { recursive: true });
      png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/instrument-dpr${dpr}-text-${name}.png` }));
    } else {
      await ready(page, `?level=instrument${kind === "bare" ? "&bare=window" : ""}`);
      await setAll(page, share);
      await quiet(page).catch(() => {});
      png = await frame(page, `instrument-dpr${dpr}-text-${name}`, { wait: 700 });
    }
    const marks = await page.evaluate(() => { const frame = document.getElementById("frame").getBoundingClientRect(); return [...document.querySelectorAll(".ug-meter__mark")].map(mark => { const range = document.createRange(); range.selectNodeContents(mark); const box = range.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, bar: !!mark.closest(".ug-meter--bar") }; }); });
    const windows = kind === "dom" ? 0 : await page.evaluate(() => window.strataMeterProbe.scene().objects.filter(object => object.parts[0].kind === "window").length);
    const parts = kind === "dom" ? 0 : await page.evaluate(() => window.strataMeterProbe.state().instrument.layers[0].drawnParts);
    await context.close();
    return { png, marks, windows, parts };
  };
  /**
   * Pixels of two frames inside the numerals' text boxes: how many differ in any channel, the largest channel difference, how many are dark glyph pixels, and, of the pixels
   * that are plain faceplate in `b` (exactly `colour`), how many of `a`'s are more than a level from `colour` (the glyphs' faintest anti-aliasing is a level off between two rasterizations).
   */
  const compare = (a, b, marks, colour = [-1, -1, -1]) => {
    let compared = 0, mismatched = 0, glyphs = 0, max = 0, plain = 0, tinted = 0;
    for (const mark of marks) {
      const x0 = Math.floor(mark.x * dpr), x1 = Math.ceil((mark.x + mark.width) * dpr), y0 = Math.floor(mark.y * dpr), y1 = Math.ceil((mark.y + mark.height) * dpr);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const index = (y * a.width + x) * 4;
        compared++;
        const diff = Math.max(Math.abs(a.data[index] - b.data[index]), Math.abs(a.data[index + 1] - b.data[index + 1]), Math.abs(a.data[index + 2] - b.data[index + 2]));
        if (diff > 0) mismatched++;
        max = Math.max(max, diff);
        if (a.data[index] < 160) glyphs++;
        if ([0, 1, 2].every(channel => b.data[index + channel] === colour[channel])) { plain++; if ([0, 1, 2].some(channel => Math.abs(a.data[index + channel] - colour[channel]) > 1)) tinted++; }
      }
    }
    return { compared, mismatched, glyphs, max, plain, tinted };
  };
  const glass = await shoot("glass", 0, "glass"), dom = await shoot("dom", 0, "dom"), bare = await shoot("bare", 0, "bare");
  // The scene always has its five windows; the reference layer core draws has none of them (five parts fewer).
  expect(glass.windows).toBe(5);
  expect(bare.parts, "the reference layer has no window").toBe(glass.parts - 5);
  const bars = glass.marks.filter(mark => mark.bar), needleMarks = glass.marks.filter(mark => !mark.bar);
  expect(bars.length + needleMarks.length).toBeGreaterThan(15);
  // The faceplate under the glass is the capture's own colour, exactly: wherever the DOM's own rendering of the page is the panel's colour, the glass shows that colour, to the level
  // (no refraction, reflection, absorption or tint: the glass adds nothing to what is printed under it).
  const colour = await (async () => { const index = ((Math.floor(dom.marks[0].y * dpr) + 1) * dom.png.width + Math.floor(dom.marks[0].x * dpr) - 3) * 4; return [...dom.png.data.subarray(index, index + 3)]; })();
  const exact = compare(glass.png, dom.png, bars, colour), exactNeedles = compare(glass.png, dom.png, needleMarks, colour);
  console.log(`instrument DPR ${dpr}: bars' printed scale under the glass: ${bars.length} numerals, ${exact.compared} px compared (${exact.glyphs} dark glyph px): ${exact.plain} faceplate px (the DOM's ${colour}), ${exact.tinted} of them not exactly that under the glass; ${exact.mismatched} px differ from the DOM's own rendering of the text, by at most ${exact.max} levels`);
  console.log(`instrument DPR ${dpr}: needle meters': ${needleMarks.length} numerals, ${exactNeedles.compared} px compared: ${exactNeedles.plain} faceplate px, ${exactNeedles.tinted} not exact; ${exactNeedles.mismatched} differ from the DOM's, by at most ${exactNeedles.max} levels`);
  const layer = compare(glass.png, bare.png, bars), layerNeedles = compare(glass.png, bare.png, needleMarks);
  console.log(`instrument DPR ${dpr}: against the layer without windows and relief (the capture through the layer pass): bars ${layer.mismatched} of ${layer.compared} px differ, at most ${layer.max} levels; needle meters ${layerNeedles.mismatched} of ${layerNeedles.compared}, at most ${layerNeedles.max} levels`);
  // The numerals' ink (the glyphs and their anti-aliased edges: every pixel of the layer without windows that is not the faceplate) is the capture texel under the glass: 0 mismatched against that layer
  // (#159). What differs elsewhere inside a numeral's text box is the glass's own bevel and edge, which the text box's last rows reach: faceplate pixels, not text.
  const ink = (marks, faceplate) => {
    let compared = 0, mismatched = 0, bevel = 0;
    for (const mark of marks) {
      const x0 = Math.floor(mark.x * dpr), x1 = Math.ceil((mark.x + mark.width) * dpr), y0 = Math.floor(mark.y * dpr), y1 = Math.ceil((mark.y + mark.height) * dpr);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * glass.png.width + x) * 4, differs = [0, 1, 2].some(channel => glass.png.data[i + channel] !== bare.png.data[i + channel]);
        if ([0, 1, 2].every(channel => bare.png.data[i + channel] === faceplate[channel])) { if (differs) bevel++; continue; }
        compared++;
        if (differs) mismatched++;
      }
    }
    return { compared, mismatched, bevel };
  };
  const inkBars = ink(bars, colour);
  console.log(`instrument DPR ${dpr}: the bars' numerals' ink against the layer without windows: ${inkBars.mismatched} of ${inkBars.compared} px differ; ${inkBars.bevel} faceplate px of their text boxes are the glass's bevel`);
  expect(inkBars.compared, "there is ink to compare").toBeGreaterThan(300);
  expect(inkBars.mismatched, "the numerals under the glass are the layer's own pixels: 0 mismatches against the layer without windows").toBe(0);
  expect(exact.glyphs, "there is text to compare").toBeGreaterThan(300);
  expect(exact.plain, "there is faceplate to compare").toBeGreaterThan(1000);
  expect(exact.tinted, "the bars' faceplate under the glass is the capture's colour, to the level").toBe(0);
  // The needle meters' windows have the needle's part over them: its pixels are the only ones that are not the faceplate.
  expect(exactNeedles.tinted, "the needle meters' faceplate under the glass is the capture's colour except where the needle is").toBeLessThan(exactNeedles.plain * 0.06);
  // With the bars lit, the light spills over the face but never over the printed scale under the glass: the same pixels as with the bars dark, 0 mismatched.
  const lit = await shoot("glass", 100, "glass-lit");
  const spill = compare(glass.png, lit.png, bars);
  console.log(`instrument DPR ${dpr}: bars lit against dark: ${spill.compared} px of the numerals compared, ${spill.mismatched} mismatched`);
  expect(spill.mismatched, "the light never reaches the text under the glass").toBe(0);
});

test("300 frames of a live value at the Instrument level add no capture, upload or hit-geometry update, and the needle moves on its spring", async ({ browser }) => {
  test.setTimeout(240000);
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    await ready(page, "?level=instrument");
    await healthy(page, "start", "instrument");
    // `driveStrataMeter`: the value reaches the GPU as a uniform and a pose, and the native value is not written (interval 0).
    const sweeping = await page.evaluate(async () => {
      const probe = window.strataMeterProbe, frame = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 8; index++) await frame();
      const start = probe.counts(), object = id => probe.scene().objects.find(entry => entry.id === id);
      let moved = 0, previous = object("vu").t, overshoot = 0, lag = 0, litChanges = 0, lastLit = -1, target = 0;
      for (let index = 0; index < 300; index++) {
        const wave = 0.5 + 0.5 * Math.sin(index / 10);
        probe.drive("vu", -20 + 23 * wave, 0); probe.drive("level", 100 * (0.5 + 0.5 * Math.sin(index / 7)), 0); probe.drive("temp", 100 * (index % 60 < 30 ? 0 : 1), 0);
        target = wave;
        await frame();
        const next = object("vu").t;
        if (next !== previous) moved++;
        overshoot = Math.max(overshoot, next - 1, -next);
        lag = Math.max(lag, Math.abs(next - target));
        const litNow = probe.scene().emitters.slice(0, 16).filter(emitter => emitter.strength > 0).length;
        if (litNow !== lastLit) litChanges++;
        lastLit = litNow; previous = next;
      }
      const end = probe.counts();
      return { moved, overshoot, lag, litChanges, native: document.getElementById("vu").getAttribute("value"), captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
    });
    console.log(`instrument DPR ${dpr}: 300 frames of a live value, the needle moved on ${sweeping.moved} of them (lagging its value by up to ${sweeping.lag.toFixed(3)} of the range, overshoot past a stop ${sweeping.overshoot}), the level bar's lit count changed ${sweeping.litChanges} times, ${sweeping.captures} captures, ${sweeping.uploads} uploads, ${sweeping.geometryUpdates} hit-geometry updates`);
    expect(sweeping.mode).toBe("gpu");
    expect(sweeping.moved, "the needle moves on most frames").toBeGreaterThan(200);
    expect(sweeping.lag, "a needle on a spring trails its value").toBeGreaterThan(0.005);
    expect(sweeping.overshoot, "the spring is clamped at the stops").toBe(0);
    expect(sweeping.litChanges).toBeGreaterThan(20);
    expect(sweeping.native, "the native value was not written").toBe("-6");
    expect(sweeping.captures, "no capture").toBe(0);
    expect(sweeping.uploads, "no upload").toBe(0);
    expect(sweeping.geometryUpdates, "no hit-geometry update").toBe(0);
    await healthy(page, "after the sweep", "instrument");
    // Ending the drive writes the native value and its text, once.
    await page.evaluate(() => { for (const id of ["vu", "level", "temp"]) window.strataMeterProbe.release(id); });
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => ({ vu: document.getElementById("vu").value, level: document.getElementById("level").getAttribute("aria-valuetext"), temp: document.getElementById("temp").value }));
    console.log(`instrument DPR ${dpr}: released: ${JSON.stringify(after)}`);
    expect(after.temp).toBeGreaterThanOrEqual(0);
    expect(after.level).toMatch(/^\d+(\.\d+)? %$/);
    await healthy(page, "released", "instrument");
    await context.close();
  }
});

test("a live value's low-rate sync writes the native value about once an interval, and a bar needs no write at any level", async ({ browser }) => {
  test.setTimeout(240000);
  for (const level of levels) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
    const page = await context.newPage();
    await ready(page, `?level=${level}`);
    const run = await page.evaluate(async () => {
      const probe = window.strataMeterProbe, frame = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 8; index++) await frame();
      const start = probe.counts(), begun = performance.now();
      let writes = 0;
      const native = document.getElementById("level");
      new MutationObserver(records => { writes += records.length; }).observe(native, { attributes: true, attributeFilter: ["value"] });
      for (let index = 0; index < 150; index++) { probe.drive("level", 100 * (0.5 + 0.5 * Math.sin(index / 7)), 500); await frame(); }
      const seconds = (performance.now() - begun) / 1000, end = probe.counts();
      return { seconds, writes, captures: end.captures - start.captures, geometryUpdates: end.geometryUpdates - start.geometryUpdates };
    });
    console.log(`${level}: 150 frames (${run.seconds.toFixed(1)} s) of a live bar with a 500 ms sync: ${run.writes} native writes, ${run.captures} captures, ${run.geometryUpdates} hit-geometry updates`);
    expect(run.writes, "about one write per interval").toBeGreaterThanOrEqual(Math.floor(run.seconds / 0.5) - 1);
    expect(run.writes).toBeLessThanOrEqual(Math.ceil(run.seconds / 0.5) + 1);
    expect(run.captures, "only the syncs are captured").toBeLessThanOrEqual(run.writes + 1);
    expect(run.geometryUpdates).toBe(0);
    await healthy(page, level, level);
    await context.close();
  }
});

for (const level of ["relief", "objects"]) test(`300 frames of a sweeping value at ${level}: GPU stays on, the layer is refreshed by captures and no hit geometry changes`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  const sweeping = await page.evaluate(async () => {
    const probe = window.strataMeterProbe, vu = document.getElementById("vu"), frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 8; index++) await frame();
    const start = probe.counts();
    for (let index = 0; index < 300; index++) { vu.value = -20 + 23 * (0.5 + 0.5 * Math.sin(index / 10)); await frame(); }
    const end = probe.counts();
    return { captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  });
  console.log(`${level}: 300 frames: ${sweeping.captures} captures (the needle is captured content here), ${sweeping.uploads} uploads, ${sweeping.geometryUpdates} hit-geometry updates`);
  expect(sweeping.mode).toBe("gpu");
  expect(sweeping.geometryUpdates).toBe(0);
  await healthy(page, "after the sweep", level);
  await context.close();
});

test("at the Instrument level under reduced motion the needle is on its target in the first scene; otherwise it is in flight", async ({ browser }) => {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion });
    const page = await context.newPage();
    await ready(page, "?level=instrument");
    const first = await page.evaluate(async () => {
      const probe = window.strataMeterProbe;
      probe.set("vu", 3); probe.set("temp", 0);
      await new Promise(requestAnimationFrame);
      probe.refresh();
      const object = id => probe.scene().objects.find(entry => entry.id === id);
      return { vu: object("vu").t, temp: object("temp").t };
    });
    console.log(`${reducedMotion}: the first scene after the change: vu t ${first.vu}, temp t ${first.temp}`);
    if (reducedMotion === "reduce") expect(first).toEqual({ vu: 1, temp: 0 });
    else { expect(first.vu, "in flight towards 1").toBeLessThan(1); expect(first.vu).toBeGreaterThan(0.6087); expect(first.temp).toBeLessThan(0.5); }
    await expect(async () => { expect(await page.evaluate(() => window.strataMeterProbe.scene().objects.find(entry => entry.id === "vu").t)).toBe(1); }).toPass({ timeout: 4000 });
    await healthy(page, reducedMotion, "instrument");
    await context.close();
  }
});

test("past 64 emitters a layer the rest are dropped with the diagnostic, and GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  for (const level of levels) {
    const page = await context.newPage();
    await ready(page, `?level=${level}&many=4`);
    const lenses = await page.evaluate(() => document.querySelectorAll(".ug-meter__segment").length);
    const state = await page.evaluate(() => window.strataMeterProbe.state());
    const layer = state.emitters.layers[0];
    const litCount = await page.evaluate(() => [...document.querySelectorAll(".ug-meter__segment")].filter(segment => Number(getComputedStyle(segment).getPropertyValue("--strata-lit")) >= 0.5).length);
    console.log(`${level}: ${lenses} segments, ${layer.lit} lit, ${layer.drawn.length} drawn, ${layer.dropped.length} dropped`);
    expect(layer.lit).toBe(litCount);
    expect(litCount).toBeGreaterThan(64);
    expect(layer.drawn, "the budget is 64 a layer").toHaveLength(64);
    expect(layer.dropped.length, "the rest are dropped").toBe(litCount - 64);
    expect(state.mode).toBe("gpu");
    await healthy(page, level, level);
    await page.close();
  }
  await context.close();
});

test("under more contrast the Instrument segments have no light and print flat; under reduced transparency the lens is an opaque lacquer dome", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0), "every emitter is off").toBe(true);
  await page.waitForFunction(() => window.strataMeterProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataMeterProbe.refresh());
  scene = await sceneOf(page);
  const bar = scene.objects.find(object => object.id === "level");
  expect(bar.materials.some(name => name.startsWith("lensOpaque ")), "opaque lenses").toBe(true);
  expect(bar.glass.filter(glass => glass === "lens"), "no glass lens").toHaveLength(0);
  expect(scene.emitters.some(emitter => emitter.strength > 0), "the bars still give light").toBe(true);
  await page.waitForFunction(() => window.strataMeterProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the meter page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-meter.html?dom");
  await page.waitForFunction(() => window.strataMeterProbe);
  const act = () => page.evaluate(() => { window.strataMeterProbe.set("level", 75); window.strataMeterProbe.set("vu", -2); });
  await act();
  const dom = await page.locator("#meter-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#meter-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('meter "Level"');
    expect(gpu).toContain('meter "VU"');
    await healthy(page, `${level} after writes`, level);
    const { violations } = await new AxeBuilder({ page }).include("#meter-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
});

for (const level of levels) test(`at ${level} the CSS glass of a segment is hidden and its socket stays printed (the lit glass cannot show through the GPU lens)`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  expect(await mode(page), "GPU stays on").toBe("gpu");
  const paint = await page.evaluate(() => [...document.querySelectorAll(".ug-meter__segment")].map(segment => {
    const glass = getComputedStyle(segment, "::after"), socket = getComputedStyle(segment, "::before"), own = getComputedStyle(segment);
    return { glass: glass.backgroundImage, glassShadow: glass.boxShadow, ownBackground: own.backgroundImage, ownShadow: own.boxShadow, socket: socket.backgroundColor, lit: Number(own.getPropertyValue("--strata-lit")) };
  }));
  expect(paint.length).toBeGreaterThan(0);
  expect(paint.some(segment => segment.lit >= 0.5), "some segments are lit").toBe(true);
  for (const segment of paint) {
    expect(segment.glass, "the glass is hidden").toBe("none");
    expect(segment.glassShadow).toBe("none");
    expect(segment.ownBackground).toBe("none");
    expect(segment.ownShadow, "no glow").toBe("none");
    expect(segment.socket, "the socket stays").not.toBe("rgba(0, 0, 0, 0)");
  }
  await context.close();
});
