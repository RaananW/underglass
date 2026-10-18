/**
 * Browser suite for the Gauge (anatomy page `gauge.md`) on `ui-gauge.html` (`window.strataGaugeProbe`): plain contract markup
 * with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel. A temperature gauge (0 to 120 °C,
 * red zones below 20 and above 100), a small pressure gauge (0 to 10 bar, a red zone above 8) and a large speed dial (0 to 200).
 * - Plain DOM (`?plain`): role `meter`, the name, `value`, `min`, `max`, `low`, `high` and `aria-valuetext`; the needle's turn
 *   through the 240° sweep at 0, 25, 50, 75 and 100% (at once under reduced motion, on `spring.gauge` otherwise); the red zones'
 *   edges; every box and every size as documented, and a grid of `elementFromPoint` over each finds the meter.
 * - 390 and 320 px: no horizontal overflow; 200% text keeps every numeral inside the dial.
 * - Preferences: axe in light, dark, face mode, forced colours (a CanvasText needle) and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; at Instrument the scene is version 4 with a bezel, a window,
 *   a needle on `spring.gauge` and a hub per gauge; at 0, 25, 50, 75 and 100% of the range the parts draw inside the boxes only (0 px
 *   outside) and native hits on them find the meter; a value change changes pixels in the box only; the printed scale under the
 *   glass is the capture's own colour; 300 frames of a live value add no capture, upload or hit-geometry update while the needle
 *   moves on its spring; reduced motion puts the needle on its target at once; the accessibility snapshot is the same in DOM and
 *   GPU modes.
 * Screenshots go to the `ui-gauge` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-gauge");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** Each gauge's name, range, value and box in px (the dial plus 24). */
const gauges = {
  temp: { name: "Temperature", min: 0, max: 120, value: 72, box: 184 },
  pressure: { name: "Pressure", min: 0, max: 10, value: 3, box: 144 },
  speed: { name: "Speed", min: 0, max: 200, value: 100, box: 224 },
};
const ids = Object.keys(gauges);
const set = (page, id, value) => page.evaluate(([id, value]) => window.strataGaugeProbe.set(id, value), [id, value]);
/** Writes every gauge's value at `share` percent of its own range. */
const setAll = (page, share) => page.evaluate(([share, spec]) => { for (const [id, gauge] of Object.entries(spec)) window.strataGaugeProbe.set(id, gauge.min + (share / 100) * (gauge.max - gauge.min)); }, [share, gauges]);
const turn = (page, id) => page.locator(`#${id}`).evaluate(native => getComputedStyle(native.closest(".ug-meter").querySelector(".ug-meter__needle")).rotate);
/** elementFromPoint over a grid on a gauge's box (inset 0.5 px): every hit must be the native meter. */
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
  await page.goto(`/ui-gauge.html?plain${query}`);
  await page.waitForFunction(() => window.strataGaugeProbe);
  return { context, page, errors };
}

test("a gauge is a native <meter>: role, name, value, range, zones, aria-valuetext, the needle's turn through the sweep, the red zones and its box", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, { reducedMotion: "reduce" });
  for (const id of ids) {
    const native = page.locator(`#${id}`);
    await expect(native, `${id}: role`).toHaveRole("meter");
    await expect(native).toHaveAccessibleName(gauges[id].name);
    const box = await native.boundingBox();
    expect([box.width, box.height], `${id}: a square the dial plus 24 px`).toEqual([gauges[id].box, gauges[id].box]);
    expect((await hits(page, id)).misses, `${id}: hits over the box`).toEqual([]);
    // The dial is the size's diameter, in a bezel 12 px wider.
    const dial = await page.locator(`#${id}`).evaluate(native => { const window = native.closest(".ug-meter").querySelector(".ug-meter__window").getBoundingClientRect(), bezel = native.closest(".ug-meter").querySelector(".ug-meter__bezel").getBoundingClientRect(); return [window.width, bezel.width]; });
    expect(dial, `${id}: the window and the bezel`).toEqual([gauges[id].box - 24, gauges[id].box - 12]);
  }
  expect(await page.locator("#temp").evaluate(native => [native.value, native.min, native.max, native.low, native.high])).toEqual([72, 0, 120, 20, 100]);
  await expect(page.locator("#temp")).toHaveAttribute("aria-valuetext", "72 °C");
  await expect(page.locator("#pressure")).toHaveAttribute("aria-valuetext", "3 bar");
  await expect(page.locator("#speed")).not.toHaveAttribute("aria-valuetext", /.*/);
  // The red zones' edges, as shares of the range; none where `low` or `high` is not given.
  const zonesOf = id => page.locator(`#${id}`).evaluate(native => { const style = native.closest(".ug-meter").style; return [style.getPropertyValue("--strata-meter-lo"), style.getPropertyValue("--strata-meter-hi")]; });
  expect(await zonesOf("temp")).toEqual(["0.1667", "0.8333"]);
  expect(await zonesOf("pressure")).toEqual(["", "0.8"]);
  expect(await zonesOf("speed")).toEqual(["", ""]);
  // The needle: 0 at the minimum's end of the 240° sweep, the middle at the top, a share of the range turns it by that share of 240°.
  const turns = {};
  for (const share of [0, 25, 50, 75, 100]) {
    await setAll(page, share);
    turns[share] = [await turn(page, "temp"), await turn(page, "pressure"), await turn(page, "speed")];
    for (const turned of turns[share]) expect(turned).toBe(`${(share / 100 - 0.5) * 240}deg`);
    await expect(page.locator("#temp")).toHaveAttribute("aria-valuetext", `${(share / 100) * 120} °C`);
  }
  console.log(`the needle's turn at 0, 25, 50, 75 and 100%: ${JSON.stringify(Object.fromEntries(Object.entries(turns).map(([share, [temp]]) => [share, temp])))}`);
  // A value outside the range is held to it.
  await set(page, "temp", 900);
  expect(await page.locator("#temp").evaluate(native => native.value)).toBe(120);
  expect(await turn(page, "temp")).toBe("120deg");
  expect(errors).toEqual([]);
  await context.close();
});

test("a gauge's needle follows its value on spring.gauge, and at once under reduced motion", async ({ browser }) => {
  const trace = async options => {
    const { context, page } = await plain(browser, options);
    const run = await page.evaluate(async () => {
      const root = document.getElementById("temp").closest(".ug-meter"), read = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-meter-t"));
      const t0 = read();
      window.strataGaugeProbe.set("temp", 120);
      // The behaviour is a microtask: let it write the value before the first read.
      await Promise.resolve();
      const first = read(), samples = [];
      for (let index = 0; index < 24; index++) { await new Promise(resolve => setTimeout(resolve, 20)); samples.push(read()); }
      return { t0, first, samples };
    });
    await context.close();
    return run;
  };
  const moving = await trace({});
  console.log(`the gauge's needle: first ${moving.first}, then every 20 ms ${JSON.stringify(moving.samples.map(sample => Math.round(sample * 1000) / 1000))}`);
  expect(moving.t0).toBeCloseTo(0.6, 3);
  expect(moving.first, "the first frame has not got there").toBeLessThan(0.99);
  const inFlight = moving.samples.filter(sample => sample > moving.t0 + 0.01 && sample < 0.99);
  expect(inFlight.length, "in flight for most of a third of a second").toBeGreaterThanOrEqual(8);
  expect(moving.samples.every((sample, index) => index === 0 || sample >= moving.samples[index - 1] - 1e-9), "monotonic up to the stop").toBe(true);
  expect(Math.max(...moving.samples), "clamped at the stop").toBeLessThanOrEqual(1);
  expect(moving.samples.at(-1), "at rest on the value").toBe(1);
  expect((await trace({ reducedMotion: "reduce" })).first, "reduced motion: at the target in the first frame").toBe(1);
});
for (const width of [390, 320]) test(`at ${width} px the gauges reflow without overflow and every numeral stays inside its dial`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    gauges: [...document.querySelectorAll(".ug-meter")].map(root => {
      const native = root.querySelector("meter"), window = root.querySelector(".ug-meter__window").getBoundingClientRect(), box = native.getBoundingClientRect(), centre = [window.left + window.width / 2, window.top + window.height / 2];
      return { id: native.id, left: box.left, right: box.right, width: box.width, radius: window.width / 2,
        marks: [...root.querySelectorAll(".ug-meter__mark")].map(mark => { const range = document.createRange(); range.selectNodeContents(mark); const r = range.getBoundingClientRect(); return { corners: [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => Math.hypot(x - centre[0], y - centre[1])) }; }) };
    }),
    labels: [...document.querySelectorAll(".ug-meter__label")].map(label => { const box = label.getBoundingClientRect(); return { left: box.left, right: box.right, clipped: label.scrollWidth > label.clientWidth + 1 }; }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.gauges) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right, `${box.id}: inside the viewport`).toBeLessThanOrEqual(width);
    for (const mark of box.marks) for (const corner of mark.corners) expect(corner, `${box.id}: a numeral's corner is inside the dial`).toBeLessThanOrEqual(box.radius);
  }
  for (const label of layout.labels) { expect(label.left).toBeGreaterThanOrEqual(0); expect(label.right).toBeLessThanOrEqual(width); expect(label.clipped).toBe(false); }
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, widest gauge ${Math.max(...layout.gauges.map(box => box.width))} px, ${layout.gauges.length} gauges`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the numerals stay inside their dial and nothing overflows", async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width: 320, height: 900 } });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    gauges: [...document.querySelectorAll(".ug-meter")].map(root => {
      const window = root.querySelector(".ug-meter__window").getBoundingClientRect(), centre = [window.left + window.width / 2, window.top + window.height / 2];
      return { id: root.querySelector("meter").id, radius: window.width / 2, marks: [...root.querySelectorAll(".ug-meter__mark")].map(mark => { const range = document.createRange(); range.selectNodeContents(mark); const r = range.getBoundingClientRect(); return { text: mark.textContent, far: Math.max(...[[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => Math.hypot(x - centre[0], y - centre[1]))) }; }) };
    }),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  let worst = 0;
  for (const box of layout.gauges) for (const mark of box.marks) { worst = Math.max(worst, mark.far / box.radius); expect(mark.far, `${box.id} ${mark.text}: inside the dial`).toBeLessThanOrEqual(box.radius); }
  console.log(`200% text: scrollWidth ${layout.scrollWidth}, ${layout.gauges.length} gauges, the farthest numeral corner at ${(worst * 100).toFixed(0)}% of the dial's radius`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the gauges pass axe in light, dark, face mode, forced colours and more contrast, and forced colours draw them", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#gauge-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("gauge-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#gauge-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("gauge-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const colours = await page.evaluate(() => {
    const root = document.getElementById("temp").closest(".ug-meter"), needle = getComputedStyle(root.querySelector(".ug-meter__needle")), zone = getComputedStyle(root.querySelector(".ug-meter__zones"));
    return { needle: needle.backgroundColor, text: getComputedStyle(document.getElementById("note")).color, zones: zone.backgroundImage.includes("gradient"), edge: getComputedStyle(root.querySelector(".ug-meter__window")).borderTopColor };
  });
  expect(colours.needle, "the needle is CanvasText").toBe(colours.text);
  expect(colours.zones, "the red zones are a CanvasText band").toBe(true);
  expect(colours.edge).toBe(colours.text);
  const forced = await new AxeBuilder({ page }).include("#gauge-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const needle = await page.evaluate(() => ({ needle: getComputedStyle(document.getElementById("temp").closest(".ug-meter").querySelector(".ug-meter__needle")).backgroundColor, text: getComputedStyle(document.getElementById("note")).color }));
  expect(needle.needle, "more contrast: the needle takes the text colour").toBe(needle.text);
  const contrast = await new AxeBuilder({ page }).include("#gauge-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-gauge.html${query}`);
  await page.waitForFunction(() => window.strataGaugeProbe && window.strataGaugeProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataGaugeProbe.scene() !== undefined);
  await page.evaluate(() => window.strataGaugeProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => window.strataGaugeProbe.state().instrument?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataGaugeProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataGaugeProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name, { wait = 250, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataGaugeProbe.refresh(); await window.strataGaugeProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataGaugeProbe.controller.settle();
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
    if (allowed.some(region => px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) { inside++; if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
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
/** Native hits on frame points: how many land on a native meter. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches("meter.ug-meter__native")) mismatches++;
  return { total: points.length, mismatches };
}, points);
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-meter__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataGaugeProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), primitives: scene.primitives,
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => part.kind), materials: [...new Set(object.parts.map(part => part.material))], pose: object.parts.map(part => part.pose), glass: object.parts.map(part => part.glass),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id))[index]) < 0.01) })) };
});

for (const dpr of [1, 2]) for (const level of levels) test(`the gauges at ${level} (DPR ${dpr}): the scene, containment over the value range, hits and fresh pixels`, async ({ browser }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version, level === "instrument" ? "version 4" : "no lights: version 1 or 2").toBe(level === "instrument" ? 4 : level === "relief" ? 1 : 2);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  expect(scene.emitters, "a gauge has no light").toBeUndefined();
  if (level === "instrument") {
    expect(scene.objects.map(object => object.id)).toEqual(ids);
    for (const object of scene.objects) {
      expect(object.parts, `${object.id}: parts`).toEqual(["window", "bezel", "needle", "pivot"]);
      expect(object.materials).toEqual(["meterGlass", "knobSkirt", "knobInk", "knobCap"]);
      expect(object.glass[0]).toBe("window");
      expect(object.pose[2], "the needle turns through 240°, up at the middle").toEqual({ from: { turn: -210 }, to: { turn: 30 } });
      expect(object.close, `${object.id}: bounds are the meter's box`).toBe(true);
    }
    expect(scene.objects.map(object => Math.round(object.t * 10000) / 10000)).toEqual([0.6, 0.3, 0.5]);
  } else {
    // Relief: a raised bezel, a well window and a hub knob per gauge; Objects: a slab, a well object and a dome.
    const wanted = level === "relief" ? { well: "well", raised: "raised" } : { well: "well", raised: "slab" };
    expect(scene.faces.filter(face => face === wanted.well), "windows").toHaveLength(3);
    expect(scene.faces.filter(face => face === wanted.raised).length, "bezels (and the panel)").toBeGreaterThanOrEqual(4);
    expect(scene.faces.filter(face => face === "knob"), "a hub per gauge").toHaveLength(3);
  }
  await healthy(page, "start", level);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-meter__needle")].filter(element => element.hasAttribute("data-strata-dome")).length), "the CSS needle is hidden where the GPU draws it").toBe(level === "instrument" ? 3 : 0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of ids) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment over the value range: every gauge at 0, 25, 50, 75 and 100% (at three depths at Instrument): every object pixel lies inside a native box, against the same
  // page with the objects hidden, and native hits on those pixels find a meter.
  const boxes = await inFrame(page, "meter.ug-meter__native");
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
    const label = value === null ? "0.5" : String(value);
    for (const share of value === null ? [0, 25, 50, 75, 100] : [0, 100]) {
      await setAll(page, share);
      await objectsHidden(page, true);
      const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-${share}-bare`);
      await objectsHidden(page, false);
      const shown = await frame(page, `${level}-dpr${dpr}-depth${label}-${share}-shown`);
      const parts = difference(shown, bare, boxes, { points: true });
      expect(parts.inside, `depth ${label}, ${share}%: the objects are drawn`).toBeGreaterThan(3000 * dpr * dpr);
      expect(parts.outside, `depth ${label}, ${share}%: no object pixel outside a box (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
      const hit = await hitsOn(page, parts.changed);
      expect(hit.mismatches, `depth ${label}, ${share}%: native hits on object pixels`).toBe(0);
      console.log(`DPR ${dpr} ${level}: depth ${label}, gauges at ${share}%: ${parts.inside} px inside the boxes, ${parts.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
    }
    await healthy(page, `depth ${label}`, level);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));

  // A value change changes pixels in its gauge's box only.
  await setAll(page, 0);
  let before = await frame(page, `${level}-dpr${dpr}-value-0`);
  for (const share of [25, 50, 75, 100]) {
    await setAll(page, share);
    const after = await frame(page, `${level}-dpr${dpr}-value-${share}`, { wait: 500 });
    const changed = difference(before, after, boxes);
    expect(changed.inside, `${share}%: the needle moved`).toBeGreaterThan(100 * dpr * dpr);
    expect(changed.outside, `${share}%: nothing changes outside the boxes (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`DPR ${dpr} ${level}: all gauges to ${share}%: ${changed.inside} px changed in the boxes, ${changed.outside} outside`);
    before = after;
    await healthy(page, `value ${share}`, level);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) the printed scale under the glass keeps the capture's own colour exactly, and a gauge's needle does not change it`, async ({ browser }) => {
  test.setTimeout(240000);
  const shoot = async (kind, share, name) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    let png;
    if (kind === "dom") {
      await page.goto("/ui-gauge.html?dom");
      await page.waitForFunction(() => window.strataGaugeProbe);
      await page.addStyleTag({ content: ".ug-meter__needle { visibility: hidden !important; }" });
      await page.evaluate(() => { document.getElementById("gauge-panel").setAttribute("data-strata-mode", "face"); });
      await setAll(page, share);
      await page.waitForTimeout(300);
      await mkdir(evidence, { recursive: true });
      png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/instrument-dpr${dpr}-text-${name}.png` }));
    } else {
      await ready(page, "?level=instrument");
      await setAll(page, share);
      png = await frame(page, `instrument-dpr${dpr}-text-${name}`, { wait: 700 });
    }
    const marks = await page.evaluate(() => { const frame = document.getElementById("frame").getBoundingClientRect(); return [...document.querySelectorAll(".ug-meter__mark")].map(mark => { const range = document.createRange(); range.selectNodeContents(mark); const box = range.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, at: Number(mark.style.getPropertyValue("--strata-meter-at")) }; }); });
    await context.close();
    return { png, marks };
  };
  // Pixels of the numerals' text boxes: those that are the DOM's faceplate colour, with no ink within 2 px of them, must be that colour under the glass, to a level.
  const faceplate = (a, b, marks, colour) => {
    let plain = 0, tinted = 0, glyphs = 0;
    const isColour = (png, x, y) => { const at = (y * png.width + x) * 4; return [0, 1, 2].every(channel => png.data[at + channel] === colour[channel]); };
    for (const mark of marks) for (let y = Math.floor(mark.y * dpr); y < Math.ceil((mark.y + mark.height) * dpr); y++) for (let x = Math.floor(mark.x * dpr); x < Math.ceil((mark.x + mark.width) * dpr); x++) {
      const index = (y * a.width + x) * 4;
      if (a.data[index] < 160) glyphs++;
      // A faceplate pixel of the DOM's, with no ink within 2 px of it (the DOM and the capture place a glyph's edge a fraction of a pixel apart).
      let far = true;
      for (let dy = -2; dy <= 2 && far; dy++) for (let dx = -2; dx <= 2 && far; dx++) if (!isColour(b, x + dx, y + dy)) far = false;
      if (far) { plain++; if ([0, 1, 2].some(channel => Math.abs(a.data[index + channel] - colour[channel]) > 1)) tinted++; }
    }
    return { plain, tinted, glyphs };
  };
  const dom = await shoot("dom", 50, "dom"), glass = await shoot("glass", 50, "glass");
  const first = dom.marks[0], index = ((Math.floor(first.y * dpr) + 1) * dom.png.width + Math.floor(first.x * dpr) - 3) * 4, colour = [...dom.png.data.subarray(index, index + 3)];
  // At 50% every needle points up through the dial's top numeral (the one at 0.5 of the range): the numerals it does not cross are compared.
  const clear = glass.marks.filter(mark => mark.at !== 0.5);
  const result = faceplate(glass.png, dom.png, clear, colour);
  console.log(`instrument DPR ${dpr}: the gauges' printed scale under the glass: ${clear.length} numerals, ${result.glyphs} dark glyph px, ${result.plain} faceplate px (the DOM's ${colour}), ${result.tinted} more than a level off under the glass`);
  expect(result.glyphs, "there is text to compare").toBeGreaterThan(300);
  expect(result.plain, "there is faceplate to compare").toBeGreaterThan(400);
  expect(result.tinted, "the faceplate under the glass is the capture's colour, to the level").toBe(0);
  // The needle at another value: every numeral it does not cross is pixel for pixel the same under the glass.
  const other = await shoot("glass", 100, "glass-100");
  // The needle at 100% points down to the right, through the numerals at 1 of the range, and its tail up to the left: the numerals at 0, 0.25 and 0.75 are never crossed.
  const apart = glass.marks.filter(mark => mark.at === 0 || mark.at === 0.25 || mark.at === 0.75);
  let changed = 0, compared = 0;
  for (const mark of apart) for (let y = Math.floor(mark.y * dpr); y < Math.ceil((mark.y + mark.height) * dpr); y++) for (let x = Math.floor(mark.x * dpr); x < Math.ceil((mark.x + mark.width) * dpr); x++) {
    const at = (y * glass.png.width + x) * 4;
    compared++;
    if (glass.png.data[at] !== other.png.data[at] || glass.png.data[at + 1] !== other.png.data[at + 1] || glass.png.data[at + 2] !== other.png.data[at + 2]) changed++;
  }
  console.log(`instrument DPR ${dpr}: the needle at 50% against 100%: ${changed} of ${compared} px of the ${apart.length} numerals it never crosses differ`);
  expect(apart.length).toBeGreaterThan(3);
  expect(changed, "the needle disturbs only the numerals it passes").toBe(0);
});

test("300 frames of a live value at the Instrument level add no capture, upload or hit-geometry update, and the needles move on spring.gauge", async ({ browser }) => {
  test.setTimeout(240000);
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    await ready(page, "?level=instrument");
    await healthy(page, "start", "instrument");
    const sweeping = await page.evaluate(async () => {
      const probe = window.strataGaugeProbe, frame = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 8; index++) await frame();
      const start = probe.counts(), object = id => probe.scene().objects.find(entry => entry.id === id);
      let moved = 0, previous = object("temp").t, overshoot = 0, lag = 0;
      for (let index = 0; index < 300; index++) {
        const wave = 0.5 + 0.5 * Math.sin(index / 12);
        probe.drive("temp", 120 * wave, 0); probe.drive("pressure", 10 * (0.5 + 0.5 * Math.cos(index / 9)), 0); probe.drive("speed", 200 * (index % 80 < 40 ? 0 : 1), 0);
        await frame();
        const next = object("temp").t;
        if (next !== previous) moved++;
        overshoot = Math.max(overshoot, next - 1, -next);
        lag = Math.max(lag, Math.abs(next - wave));
        previous = next;
      }
      const end = probe.counts();
      return { moved, overshoot, lag, native: document.getElementById("temp").getAttribute("value"), captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
    });
    console.log(`instrument DPR ${dpr}: 300 frames of a live value, the needle moved on ${sweeping.moved} of them (lagging its value by up to ${sweeping.lag.toFixed(3)} of the range, overshoot past a stop ${sweeping.overshoot}), ${sweeping.captures} captures, ${sweeping.uploads} uploads, ${sweeping.geometryUpdates} hit-geometry updates`);
    expect(sweeping.mode).toBe("gpu");
    expect(sweeping.moved, "the needle moves on most frames").toBeGreaterThan(200);
    expect(sweeping.lag, "a needle on a spring trails its value").toBeGreaterThan(0.01);
    expect(sweeping.overshoot, "the spring is clamped at the stops").toBe(0);
    expect(sweeping.native, "the native value was not written").toBe("72");
    expect(sweeping.captures, "no capture").toBe(0);
    expect(sweeping.uploads, "no upload").toBe(0);
    expect(sweeping.geometryUpdates, "no hit-geometry update").toBe(0);
    await healthy(page, "after the sweep", "instrument");
    await context.close();
  }
});

for (const level of ["relief", "objects"]) test(`300 frames of a sweeping value at ${level}: GPU stays on, the needle is captured content and no hit geometry changes`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  const sweeping = await page.evaluate(async () => {
    const probe = window.strataGaugeProbe, temp = document.getElementById("temp"), frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 8; index++) await frame();
    const start = probe.counts();
    for (let index = 0; index < 300; index++) { temp.value = 120 * (0.5 + 0.5 * Math.sin(index / 12)); await frame(); }
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
      const probe = window.strataGaugeProbe;
      probe.set("temp", 120); probe.set("speed", 0);
      await new Promise(requestAnimationFrame);
      probe.refresh();
      const object = id => probe.scene().objects.find(entry => entry.id === id);
      return { temp: object("temp").t, speed: object("speed").t };
    });
    console.log(`${reducedMotion}: the first scene after the change: temp t ${first.temp}, speed t ${first.speed}`);
    if (reducedMotion === "reduce") expect(first).toEqual({ temp: 1, speed: 0 });
    else { expect(first.temp, "in flight towards 1").toBeLessThan(1); expect(first.temp).toBeGreaterThan(0.6); expect(first.speed).toBeLessThan(0.5); }
    await expect(async () => { expect(await page.evaluate(() => window.strataGaugeProbe.scene().objects.find(entry => entry.id === "temp").t)).toBe(1); }).toPass({ timeout: 4000 });
    await healthy(page, reducedMotion, "instrument");
    await context.close();
  }
});

test("the gauge page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-gauge.html?dom");
  await page.waitForFunction(() => window.strataGaugeProbe);
  const act = () => page.evaluate(() => { window.strataGaugeProbe.set("temp", 90); window.strataGaugeProbe.set("pressure", 7); });
  await act();
  const dom = await page.locator("#gauge-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#gauge-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('meter "Temperature"');
    expect(gpu).toContain('meter "Pressure"');
    await healthy(page, `${level} after writes`, level);
    const { violations } = await new AxeBuilder({ page }).include("#gauge-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
});
