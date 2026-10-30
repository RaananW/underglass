/**
 * Browser suite for the indicator forms (anatomy pages `rating.md`, `badge.md`, `progress-bar.md`, `spinner.md`, *Indicator form*) on
 * `ui-indicator-forms.html` (`window.strataIndicatorProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM behaviour, in a
 * Strata panel. A Rating `#rate` (3 of 5) and a disabled one `#rate-off` (2 of 5), Badges `#b-count` (a count, neutral), `#b-ok`, `#b-warn`,
 * `#b-bad` ("99+"), `#b-info`, ProgressBars `#p-det` (40%, 12 segments) and `#p-ind` (indeterminate), Spinners `#s-md` (label shown) and `#s-sm`.
 * - Plain DOM: the native controls and their semantics are unchanged (the accessibility snapshot of the page equals the flush page's, every
 *   role, name, value and state); the lenses are hidden from assistive technology; a Rating lights up to its score, previews a hovered score
 *   half lit, follows the arrow keys and a click, and a disabled one keeps its score; a Badge's lens takes its variant's colour (a neutral one is
 *   dark glass) and a count keeps its number; a bar lights its segments from `value` and `max`, follows a changed value, and chases while
 *   indeterminate; a Spinner chases clockwise at the tempo token; no lens flashes more than three times a second; under reduced motion the
 *   ring is a steady comet and the bar a steady pattern; `flush` is the markup and the look of before.
 * - Touch (390 px) and 320 px: no horizontal overflow, labels whole; at 200% text nothing is lost.
 * - Preferences: axe in light, dark, face mode, forced colours and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is version 4 with an emitter per lens in document order
 *   (strength from the lens, the role and the state), the protected rects of every text, and the documented parts (at Instrument a glass lens
 *   with its emitter, bounded by its native control's box); with the lights off every pixel the parts draw lies inside a native box; a value
 *   change changes pixels in the bar's box and lights the face within its reach, none beyond, and the labels stay within the guard; native hits
 *   are the same as in DOM mode.
 * - Chase on the GPU: the emitters follow the CSS chase; 300 frames cause 0 captures, 0 uploads and 0 hit-geometry updates; the head's two
 *   positions differ in pixels; under reduced motion 0 frames change in 2 seconds.
 * - The accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page.
 * Screenshots go to the `ui-indicator-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-indicator-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
const LENS = ".ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress__segment";
const RATING_LENS = 16, LED = 10;
/** The lenses in document order: [id, count, kind]. */
const groups = [["rate", 5, "lamp"], ["rate-off", 5, "lamp"], ["b-count", 1, "led"], ["b-ok", 1, "led"], ["b-warn", 1, "led"], ["b-bad", 1, "led"], ["b-info", 1, "led"],
  ["p-det", 12, "segment"], ["p-ind", 12, "segment"], ["s-md", 8, "led"], ["s-sm", 8, "led"]];
const TOTAL = groups.reduce((sum, group) => sum + group[1], 0);
const startOf = id => { let at = 0; for (const group of groups) { if (group[0] === id) return at; at += group[1]; } return -1; };
/** The chase model (`chaseLit` in `shared/indicator-forms.ts`, the stops of `ug-chase` and `ug-chase-bar`). */
const stops = { spinner: [[0, 1], [0.12, 0.55], [0.3, 0.2], [0.55, 0], [1, 0]], bar: [[0, 1], [0.06, 0.5], [0.14, 0.15], [0.25, 0], [1, 0]] };
function chaseLit(index, count, time, lap, kind) {
  const phase = ((((time / lap) - index / count) % 1) + 1) % 1, list = stops[kind];
  for (let at = 1; at < list.length; at++) if (phase <= list[at][0]) return list[at - 1][1] + ((list[at][1] - list[at - 1][1]) * (phase - list[at - 1][0])) / (list[at][0] - list[at - 1][0]);
  return 0;
}

const lits = (page, selector) => page.locator(selector).evaluateAll(lenses => lenses.map(lens => Number(getComputedStyle(lens).getPropertyValue("--strata-lit"))));
async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-indicator-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataIndicatorProbe);
  return { context, page, errors };
}
/** The `--strata-lit` of each lens of `selector` and the first one's animation time, every animation frame for `frames` frames. */
const watch = (page, selector, frames) => page.evaluate(([selector, frames]) => new Promise(resolve => {
  const lenses = [...document.querySelectorAll(selector)], out = [];
  const frame = () => {
    const animation = lenses[0].getAnimations()[0];
    out.push({ time: animation ? Number(animation.currentTime) : null, lit: lenses.map(lens => Number(getComputedStyle(lens).getPropertyValue("--strata-lit"))), at: performance.now() });
    if (out.length < frames) requestAnimationFrame(frame); else resolve(out);
  };
  requestAnimationFrame(frame);
}), [selector, frames]);

test("the native controls and their semantics are unchanged: the accessibility snapshot of every form equals the flush page's, and the lenses are hidden from assistive technology", async ({ browser }) => {
  const forms = await plain(browser, { reducedMotion: "reduce" });
  const flush = await plain(browser, { reducedMotion: "reduce" }, "&flush");
  const snapshot = page => page.locator("#ind-panel").ariaSnapshot();
  const formed = await snapshot(forms.page), flat = await snapshot(flush.page);
  expect(formed, "the accessibility snapshot of the lamps, LEDs, segments and ring is the flush one").toBe(flat);
  expect(formed).toContain('group "Your rating"');
  expect(formed).toContain('radio "3 stars" [checked]');
  expect(formed).toContain("progressbar");
  expect(formed).toContain("status: Loading");
  // The lenses are decoration: their containers are hidden from assistive technology (or are the badge's empty span).
  expect(await forms.page.evaluate(lens => ({
    stars: [...document.querySelectorAll(".ug-rating__star")].every(star => star.getAttribute("aria-hidden") === "true"),
    badges: [...document.querySelectorAll(".ug-badge__lens")].every(lens => lens.getAttribute("aria-hidden") === "true"),
    bars: [...document.querySelectorAll(".ug-progress__object")].every(object => object.getAttribute("aria-hidden") === "true"),
    rings: [...document.querySelectorAll(".ug-spinner__ring")].every(ring => ring.getAttribute("aria-hidden") === "true"),
    focusable: document.querySelectorAll(lens).length && [...document.querySelectorAll(lens)].some(element => element.tabIndex >= 0),
  }), LENS)).toEqual({ stars: true, badges: true, bars: true, rings: true, focusable: false });
  // The native elements: a Rating is radios named by a legend, a Badge has no role, a bar is a progressbar, a Spinner a status.
  await expect(forms.page.getByRole("group", { name: "Your rating" })).toHaveCount(1);
  await expect(forms.page.getByRole("radio", { name: "3 stars" }).first()).toBeChecked();
  await expect(forms.page.getByRole("radio", { name: "1 star" }).nth(1)).toBeDisabled();
  expect(await forms.page.evaluate(() => [...document.querySelectorAll(".ug-badge")].map(badge => [badge.getAttribute("role"), badge.tabIndex, badge.textContent.trim()]))).toEqual(
    [[null, -1, "3"], [null, -1, "Active"], [null, -1, "Low"], [null, -1, "99+ (120)"], [null, -1, "New"]]);
  await expect(forms.page.getByRole("progressbar", { name: "Upload" })).toHaveJSProperty("value", 40);
  expect(await forms.page.evaluate(() => [document.getElementById("p-det").tagName, document.getElementById("p-det").position, document.getElementById("p-ind").hasAttribute("value"), document.getElementById("p-ind").position])).toEqual(["PROGRESS", 0.4, false, -1]);
  await expect(forms.page.getByRole("status").filter({ hasText: "Loading" })).toHaveCount(1);
  expect(await forms.page.evaluate(() => [...document.querySelectorAll(".ug-spinner")].map(spinner => [spinner.getAttribute("role"), spinner.getAttribute("aria-live"), spinner.querySelector(".ug-spinner__label").textContent])), "a status, its label the announcement").toEqual([["status", null, "Loading"], ["status", null, "Saving"]]);
  expect(forms.errors).toEqual([]);
  await forms.context.close();
  await flush.context.close();
});

test("a Rating lights its lamps up to the score, previews a hovered score half lit, follows keys and clicks, and a disabled one keeps its score", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, { reducedMotion: "reduce" });
  const rate = () => lits(page, "#rate .ug-rating__lens");
  expect(await rate(), "3 of 5 lit").toEqual([1, 1, 1, 0, 0]);
  expect(await lits(page, "#rate-off .ug-rating__lens"), "a disabled rating keeps its score").toEqual([1, 1, 0, 0, 0]);
  // Hover: the star under the pointer and the ones before it show half a lens, the rest of the row goes dark, as the stars do.
  await page.locator("#rate input[value='4']").hover();
  expect(await rate()).toEqual([0.55, 0.55, 0.55, 0.55, 0]);
  await page.mouse.move(2, 2);
  expect(await rate()).toEqual([1, 1, 1, 0, 0]);
  // A disabled rating has no preview.
  await page.locator("#rate-off input[value='4']").hover({ force: true });
  expect(await lits(page, "#rate-off .ug-rating__lens")).toEqual([1, 1, 0, 0, 0]);
  await page.mouse.move(2, 2);
  // A click sets the score and the keys move it (the radio group is native).
  await page.locator("#rate input[value='5']").click();
  await page.mouse.move(2, 2);
  expect(await rate()).toEqual([1, 1, 1, 1, 1]);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect(await rate(), "two arrow keys back: 3 lit").toEqual([1, 1, 1, 0, 0]);
  expect(await page.locator("#rate input:checked").getAttribute("value")).toBe("3");
  // The item is the lens plus 16 px (at least the target), a square; the colour is the lamp's amber.
  expect(await page.evaluate(() => ({ item: (box => [box.width, box.height])(document.querySelector("#rate .ug-rating__item").getBoundingClientRect()), lens: (box => [box.width, box.height])(document.querySelector("#rate .ug-rating__lens").getBoundingClientRect()),
    colour: getComputedStyle(document.querySelector("#rate .ug-rating__lens")).getPropertyValue("--_c").trim() }))).toEqual({ item: [32, 32], lens: [16, 16], colour: "#ff9228" });
  expect(errors).toEqual([]);
  await context.close();
});

test("a Badge's lens takes its variant's colour (a neutral one is dark glass) and a count keeps its number", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  const read = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".ug-badge")].map(badge => {
    const lens = badge.querySelector(".ug-badge__lens"), style = getComputedStyle(lens), box = badge.getBoundingClientRect();
    return [badge.id, { lit: Number(style.getPropertyValue("--strata-lit")), colour: style.getPropertyValue("--_c").trim(), lens: lens.getBoundingClientRect().width, height: box.height, text: badge.textContent.trim(), face: badge.getAttribute("data-strata-face") }];
  })));
  const colours = { "b-ok": "#15803d", "b-warn": "#b45309", "b-bad": "#c42b2b", "b-info": "#2563eb" };
  expect(read["b-count"].lit, "neutral: dark glass").toBe(0);
  for (const [id, colour] of Object.entries(colours)) { expect(read[id].lit, `${id}: lit`).toBe(1); expect(read[id].colour, `${id}: the variant's role`).toBe(colour); }
  for (const badge of Object.values(read)) { expect(badge.lens).toBe(10); expect(badge.height, "the pill is the lens plus 16 px").toBe(26); expect(badge.face).toBe("flat"); }
  expect(read["b-count"].text).toBe("3");
  expect(read["b-bad"].text, "99+ keeps the full count for assistive technology").toBe("99+ (120)");
  // The pill's plate is captured content that keeps the text's contrast.
  expect(await page.evaluate(() => { const badge = document.getElementById("b-ok"), style = getComputedStyle(badge); return [style.backgroundColor !== "rgba(0, 0, 0, 0)", style.color]; })).toEqual([true, expect.any(String)]);
  // `data-strata-colour` lights a neutral badge.
  await page.evaluate(() => document.getElementById("b-count").setAttribute("data-strata-colour", "info"));
  expect(await lits(page, "#b-count .ug-badge__lens")).toEqual([1]);
  await context.close();
});

test("a bar lights its segments from its value, follows a changed value, and an indeterminate bar chases", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  const det = () => lits(page, "#p-det ~ .ug-progress__object .ug-progress__segment");
  // 40% of 12 segments: segment i is lit when value · 12 − i − ½ is above 0, so 5.
  expect(await det()).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
  expect(await page.evaluate(() => document.querySelector("#p-det").closest(".ug-progress-bar").style.getPropertyValue("--strata-progress-value"))).toBe("0.4");
  for (const [value, count] of [[0, 0], [100, 12], [50, 6], [4, 0], [5, 1], [96, 12], [95, 11]]) {
    await page.evaluate(value => window.strataIndicatorProbe.setProgress("p-det", value), value);
    expect((await det()).filter(lit => lit === 1).length, `value ${value}: ${count} lit`).toBe(count);
  }
  // The max follows too.
  await page.evaluate(() => { const bar = document.getElementById("p-det"); bar.setAttribute("max", "10"); bar.value = 5; });
  expect((await det()).filter(lit => lit === 1).length, "5 of 10").toBe(6);
  // An indeterminate bar has no value; giving it one stops the chase, removing the value starts it again.
  const waiting = await page.evaluate(() => { const bar = document.getElementById("p-ind"); return [bar.hasAttribute("value"), bar.matches(":indeterminate"), bar.closest(".ug-progress-bar").style.getPropertyValue("--strata-progress-value")]; });
  expect(waiting).toEqual([false, true, ""]);
  expect(await lits(page, "#p-ind ~ .ug-progress__object .ug-progress__segment"), "under reduced motion a steady pattern: every other segment").toEqual(Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? 1 : 0)));
  await page.evaluate(() => window.strataIndicatorProbe.setProgress("p-ind", 100));
  expect(await lits(page, "#p-ind ~ .ug-progress__object .ug-progress__segment")).toEqual(Array(12).fill(1));
  await page.evaluate(() => window.strataIndicatorProbe.setProgress("p-ind", undefined));
  expect((await lits(page, "#p-ind ~ .ug-progress__object .ug-progress__segment")).filter(lit => lit === 1).length).toBe(6);
  await context.close();
});

test("a Spinner chases clockwise and a bar sweeps at their tempo tokens (as the model has them), no lens flashes more than three times a second, and a lens is lit once a lap", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const result = {};
  for (const [id, selector, lap, kind, count] of [["spinner", "#s-md .ug-spinner__lens", 900, "spinner", 8], ["bar", "#p-ind ~ .ug-progress__object .ug-progress__segment", 1600, "bar", 12]]) {
    const frames = await watch(page, selector, 160);
    expect(await page.locator(selector).first().evaluate(lens => lens.getAnimations().length), `${id}: one CSS animation`).toBe(1);
    // The CSS follows the model: the lens lights at index / count of the lap and fades over the trail.
    let worst = 0;
    for (const frame of frames) for (let index = 0; index < count; index++) worst = Math.max(worst, Math.abs(frame.lit[index] - chaseLit(index, count, frame.time, lap, kind)));
    expect(worst, `${id}: the stylesheet's chase follows the model`).toBeLessThan(0.02);
    // A lens flashes (rises to a head from dark) once a lap: rising edges per second per lens.
    const seconds = (frames.at(-1).at - frames[0].at) / 1000;
    let flashes = 0;
    for (let index = 0; index < count; index++) { let dark = true; for (const frame of frames) { if (frame.lit[index] <= 0.1) dark = true; else if (frame.lit[index] >= 0.9 && dark) { flashes++; dark = false; } } }
    result[id] = { seconds: Math.round(seconds * 100) / 100, worst: Math.round(worst * 1000) / 1000, perLens: Math.round((flashes / count / seconds) * 100) / 100 };
    expect(flashes / count / seconds, `${id}: flashes a second per lens`).toBeLessThanOrEqual(3);
    // Clockwise: a later lens is lit later in the lap, so the head moves from lens i to lens i + 1.
    const heads = frames.map(frame => frame.lit.indexOf(Math.max(...frame.lit)));
    const steps = heads.slice(1).map((head, at) => (head - heads[at] + count) % count);
    expect(Math.max(...steps), `${id}: the head only ever moves on (a frame may skip one lens)`).toBeLessThanOrEqual(2);
    expect(new Set(heads).size, `${id}: the head visits every lens`).toBe(count);
  }
  console.log(`chase: ${JSON.stringify(result)}`);
  // The tempos are the tokens: 900 ms (spinner) and 1,600 ms (bar), never under 334 ms (the computed value reads in seconds).
  expect(await page.evaluate(() => { const style = getComputedStyle(document.getElementById("s-md")); return [style.getPropertyValue("--strata-chase-spinner").trim(), style.getPropertyValue("--strata-chase-bar").trim()]; })).toEqual([".9s", "1.6s"]);
  // Eight lenses on the ring, at the ring's diameter, clockwise from the top.
  const ring = await page.evaluate(() => { const box = document.querySelector("#s-md .ug-spinner__ring").getBoundingClientRect(), cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    return { box: [box.width, box.height], lenses: [...document.querySelectorAll("#s-md .ug-spinner__lens")].map(lens => { const rect = lens.getBoundingClientRect(); return { size: Math.round(rect.width * 10) / 10, angle: Math.round(((Math.atan2(rect.left + rect.width / 2 - cx, -(rect.top + rect.height / 2 - cy)) * 180) / Math.PI + 360) % 360) % 360, radius: Math.round(Math.hypot(rect.left + rect.width / 2 - cx, rect.top + rect.height / 2 - cy) * 10) / 10 }; }) }; });
  expect(ring.box, "the ring is its diameter plus 16 px").toEqual([52, 52]);
  expect(ring.lenses.map(lens => lens.angle)).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
  for (const lens of ring.lenses) { expect(lens.radius).toBeCloseTo(18, 0); expect(lens.size).toBeCloseTo(7.2, 1); }
  await context.close();
});

test("under reduced motion nothing chases: the ring is a steady comet, the bar a steady pattern, the label is shown, and no animation runs", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const selector of ["#s-md .ug-spinner__lens", "#s-sm .ug-spinner__lens", "#p-ind ~ .ug-progress__object .ug-progress__segment"]) {
    const frames = await watch(page, selector, 90);
    expect(new Set(frames.map(frame => JSON.stringify(frame.lit))).size, `${selector}: no change in 90 frames`).toBe(1);
    expect(await page.locator(selector).first().evaluate(lens => lens.getAnimations().length), `${selector}: no animation`).toBe(0);
  }
  // The comet: lit 1 at lens 0 and 0.75, 0.5, 0.25 behind it (lenses 7, 6, 5), dark elsewhere.
  expect(await lits(page, "#s-md .ug-spinner__lens")).toEqual([1, 0, 0, 0, 0, 0.25, 0.5, 0.75]);
  for (const id of ["s-md", "s-sm"]) expect(await page.locator(`#${id} .ug-spinner__label`).evaluate(label => getComputedStyle(label).position), `${id}: the label is shown`).toBe("static");
  await context.close();
});

test("flush is the markup and the look of before: no form, no lens, the star, the pill, the groove and the arc", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, {}, "&flush");
  expect(await page.evaluate(() => ({
    forms: document.querySelectorAll("[data-strata-form]").length, lenses: document.querySelectorAll(".ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress__segment, .ug-progress-bar, .ug-spinner__ring").length,
    arcs: document.querySelectorAll(".ug-spinner__arc").length, faces: [...document.querySelectorAll("#b-ok, #p-det, #s-md")].map(element => element.getAttribute("data-strata-face")),
    star: (box => [box.width, box.height])(document.querySelector("#rate .ug-rating__star").getBoundingClientRect()), bar: (box => [box.width > 100, box.height])(document.getElementById("p-det").getBoundingClientRect()),
    // The arc turns (800 ms a turn), so its box is read before the transform: a bounding box widens with the angle (#182).
    badge: document.getElementById("b-ok").getBoundingClientRect().height, arc: document.querySelector("#s-md .ug-spinner__arc").offsetWidth,
  }))).toEqual({ forms: 0, lenses: 0, arcs: 2, faces: ["flat", "groove", "ring"], star: [24, 24], bar: [true, 8], badge: 20.390625, arc: 24 });
  // The same native behaviour as before.
  await page.locator("#rate input[value='5']").click();
  expect(await page.locator("#rate input:checked").getAttribute("value")).toBe("5");
  await page.screenshot({ path: `${evidence}/plain-flush.png` });
  expect(errors).toEqual([]);
  await context.close();
});

for (const width of [390, 320]) test(`at ${width} px the forms reflow without overflow, a tap sets the score, and at 200% text nothing is lost`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const measure = () => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-rating, .ug-badge, .ug-progress-bar, .ug-spinner")].map(element => { const box = element.getBoundingClientRect(); return { id: element.id, left: box.left, right: box.right }; }),
    segments: (box => [box.left, box.right])(document.querySelector("#p-det ~ .ug-progress__object .ug-progress__segments").getBoundingClientRect()),
    clipped: [...document.querySelectorAll(".ug-badge, .ug-spinner__label, .ug-rating__legend")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className) }));
  let layout = await measure();
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) { expect(box.left, box.id).toBeGreaterThanOrEqual(0); expect(box.right, box.id).toBeLessThanOrEqual(width); }
  expect(layout.clipped).toEqual([]);
  // A tap on a star sets the score (touch), and the lamps follow.
  await page.locator("#rate input[value='5']").tap();
  expect(await lits(page, "#rate .ug-rating__lens"), "a tap sets 5, no preview left lit").toEqual([1, 1, 1, 1, 1]);
  // Targets: every star is at least 24 px.
  expect(await page.evaluate(() => [...document.querySelectorAll("#rate .ug-rating__input")].every(input => { const box = input.getBoundingClientRect(); return box.width >= 24 && box.height >= 24; }))).toBe(true);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  layout = await measure();
  expect(layout.scrollWidth, "200% text: no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) expect(box.right, `200%: ${box.id}`).toBeLessThanOrEqual(width);
  expect(layout.clipped).toEqual([]);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, ${layout.boxes.length} indicators, 200% text whole`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("the forms pass axe in light, dark, face mode, forced colours and more contrast, and forced colours and more contrast draw them", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#ind-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("ind-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#ind-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("ind-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const colours = await page.evaluate(() => [...document.querySelectorAll("#rate .ug-rating__lens")].map(lens => { const glass = getComputedStyle(lens, "::after"); return { fill: glass.backgroundColor, border: glass.borderTopColor, glow: getComputedStyle(lens).boxShadow }; }));
  expect(colours[0].fill, "a lit lens is Highlight, an unlit one Canvas").not.toBe(colours[4].fill);
  expect(colours[0].glow, "no glow").toBe("none");
  const forcedResult = await new AxeBuilder({ page }).include("#ind-panel").withTags(tags).analyze();
  expect(summary(forcedResult.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const more = await page.evaluate(() => ({ glow: getComputedStyle(document.querySelector("#b-ok .ug-badge__lens")).boxShadow, socket: getComputedStyle(document.querySelector("#b-ok .ug-badge__lens"), "::before").backgroundColor, idle: getComputedStyle(document.querySelector("#b-count .ug-badge__lens"), "::before").backgroundColor }));
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(more.socket, "a lit lens's socket is its lit colour, flat").not.toBe(more.idle);
  const contrast = await new AxeBuilder({ page }).include("#ind-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-indicator-forms.html${query}`);
  await page.waitForFunction(() => window.strataIndicatorProbe && window.strataIndicatorProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataIndicatorProbe.scene() !== undefined);
  await page.evaluate(() => window.strataIndicatorProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => window.strataIndicatorProbe.state().instrument?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
async function healthy(page, label, level) {
  expect(await page.evaluate(() => window.strataIndicatorProbe.controller.state().mode), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataIndicatorProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataIndicatorProbe.refresh(); await window.strataIndicatorProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataIndicatorProbe.controller.settle();
  }, wait);
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
function difference(a, b, allowed) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(region => region.radius !== undefined ? Math.hypot(px - region.cx, py - region.cy) <= region.radius : px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) inside++;
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples };
}
const changedPixels = (a, b) => { let changed = 0; for (let index = 0; index < a.data.length; index += 4) if (a.data[index] !== b.data[index] || a.data[index + 1] !== b.data[index + 1] || a.data[index + 2] !== b.data[index + 2]) changed++; return changed; };
/** The boxes of the native controls in the frame: a Rating's radios, a Badge, a bar's `<progress>`, a Spinner's ring. */
const boxesOf = page => page.evaluate(() => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(".ug-rating__input, .ug-badge, .ug-progress-bar > progress, .ug-spinner__ring")].map(element => { const box = element.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.closest(".ug-rating, .ug-badge, .ug-progress-bar, .ug-spinner").id || element.id }; });
});
const pauseAt = (page, share) => page.evaluate(share => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = Number(animation.effect.getComputedTiming().duration) * share; } }, share);
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataIndicatorProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rel = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, feather: scene.feather, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), objects: scene.objects?.map(object => ({ id: object.id, parts: object.parts.map(part => `${part.kind}:${part.material}`), emitters: object.parts.map(part => part.emitter), glass: object.parts.map(part => part.glass), bounds: object.bounds.rect })),
    lenses: [...document.querySelectorAll(".ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress__segment")].map(lens => ({ rect: rel(lens), dome: lens.hasAttribute("data-strata-dome"), lit: Number(getComputedStyle(lens).getPropertyValue("--strata-lit")) })),
    controls: [...document.querySelectorAll(".ug-rating__input, .ug-badge, .ug-progress-bar > progress, .ug-spinner__ring")].map(element => ({ rect: rel(element), id: element.closest(".ug-rating, .ug-badge, .ug-progress-bar, .ug-spinner").id })),
    // The text runs only (not the lenses' boxes): the text nodes of every label, legend and pill.
    texts: [...document.querySelectorAll(".ug-rating__legend, .ug-badge, .ug-spinner__label, #ind-title, #ind-note")].flatMap(element => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), out = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim() || !node.parentElement.checkVisibility({ visibilityProperty: true })) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        for (const box of range.getClientRects()) if (box.width > 1 && box.height > 1) out.push([box.left - panel.left, box.top - panel.top, box.width, box.height]);
      }
      return out;
    }) };
});
const counts = page => page.evaluate(() => window.strataIndicatorProbe.counts());

for (const dpr of [1, 2]) for (const level of levels) test(`the forms at ${level} (DPR ${dpr}): the scene, the emitters, the parts, containment, a value's light and the guard, and the same hits as the DOM`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // The hits in DOM mode, over a grid on the panel (every 6 px), to compare.
  await page.goto("/ui-indicator-forms.html?dom");
  await page.waitForFunction(() => window.strataIndicatorProbe);
  const hitGrid = () => page.evaluate(() => {
    const panel = document.getElementById("ind-panel").getBoundingClientRect(), out = [];
    for (let y = panel.top + 3; y < panel.bottom - 3; y += 6) for (let x = panel.left + 3; x < panel.right - 3; x += 6) { const hit = document.elementFromPoint(x, y); out.push(hit && document.getElementById("ind-panel").contains(hit) ? `${hit.tagName}.${hit.className}#${hit.id}` : "outside"); }
    return out;
  });
  const domHits = await hitGrid();
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version).toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined).toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  expect(scene.emitters, "an emitter per lens").toHaveLength(TOTAL);
  expect(scene.lenses).toHaveLength(TOTAL);
  // Each emitter: at its lens's centre, the radius and height from the tokens, the strength from the lens, the role and the state.
  const tokens = { lamp: { radius: 6, height: 0.7, strength: 3200, reference: 28 }, led: { radius: 6, height: 0.8, strength: 520, reference: 10 }, segment: { radius: 3, height: 0.8, strength: 260, reference: 10 } };
  let at = 0;
  for (const [id, count, kind] of groups) for (let index = 0; index < count; index++, at++) {
    const emitter = scene.emitters[at], lens = scene.lenses[at], token = tokens[kind];
    const size = lens.rect[2], centre = [lens.rect[0] + lens.rect[2] / 2, lens.rect[1] + lens.rect[3] / 2];
    expect(emitter.position[0], `${id}[${index}]: x`).toBeCloseTo(centre[0], 1);
    expect(emitter.position[1], `${id}[${index}]: y`).toBeCloseTo(centre[1], 1);
    expect(emitter.position[2], `${id}[${index}]: height`).toBeCloseTo(token.height * size, 2);
    expect(emitter.radius, `${id}[${index}]: reach`).toBeCloseTo(token.radius * size, 2);
    expect(emitter.reach).toBe("outset");
    const steady = !["p-ind", "s-md", "s-sm"].includes(id);
    // A steady lens: exactly its state (a disabled rating's lenses throw 30%); a chasing one: as lit as the CSS has it, within a frame.
    const full = token.strength * (size / token.reference) ** 2, expected = lens.lit * full * (id === "rate-off" ? 0.3 : 1);
    if (steady) expect(emitter.strength, `${id}[${index}]: strength`).toBeCloseTo(expected, 1);
    else expect(emitter.strength, `${id}[${index}]: strength within the lens's full light`).toBeLessThanOrEqual(full + 0.01);
  }
  expect(scene.lenses.slice(0, 5).map(lens => lens.lit), "rate: 3 of 5").toEqual([1, 1, 1, 0, 0]);
  expect(scene.emitters.slice(0, 5).map(emitter => emitter.strength > 0), "rate: three lit lenses").toEqual([true, true, true, false, false]);
  expect(scene.emitters.slice(10, 15).map(emitter => emitter.strength > 0), "badges: a neutral one is dark, the others lit").toEqual([false, true, true, true, true]);
  expect(scene.emitters.slice(15, 27).map(emitter => emitter.strength > 0), "p-det: 5 of 12 lit").toEqual([...Array(5).fill(true), ...Array(7).fill(false)]);
  expect(scene.feather).toBe(4);
  expect(Array.isArray(scene.protected)).toBe(true);
  for (const text of scene.texts) expect(scene.protected.some(rect => rect[0] <= text[0] + 0.5 && rect[1] <= text[1] + 0.5 && rect[0] + rect[2] >= text[0] + text[2] - 0.5 && rect[1] + rect[3] >= text[1] + text[3] - 0.5), `a protected rect covers the text at ${text.map(Math.round)}`).toBe(true);
  if (level === "instrument") {
    expect(scene.objects, "an LED object per lens").toHaveLength(TOTAL);
    scene.objects.forEach((object, index) => {
      expect(object.parts.length, `${object.id}: one glass lens`).toBe(1);
      expect(object.parts[0]).toMatch(/^lens:lens #[0-9a-f]{6}$/);
      expect(object.emitters).toEqual([index]);
      expect(object.glass).toEqual(["lens"]);
      // Its bounds lie in its native control's box (the lens's own room, where text shares the box: a badge's pill).
      const [bx, by, bw, bh] = object.bounds;
      const control = scene.controls.find(({ rect: [x, y, w, h] }) => x - 0.01 <= bx && y - 0.01 <= by && x + w + 0.01 >= bx + bw && y + h + 0.01 >= by + bh);
      expect(control, `${object.id}: bounds lie in a native box`).toBeTruthy();
    });
    expect(scene.faces.filter(face => face === "knob" || face === "ring")).toEqual([]);
  } else {
    expect(scene.faces.filter(face => face === (level === "relief" ? "ring" : "knob")).length, "a ring or a dome per lens").toBe(TOTAL);
  }
  await healthy(page, "start", level);
  expect(scene.lenses.every(lens => lens.dome), "the CSS paint of every lens is hidden").toBe(true);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters, ${scene.protected.length} protected rects, outset ${scene.outset.top}${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // The same native hits as the DOM, everywhere on the panel.
  const gpuHits = await hitGrid();
  expect(gpuHits.length).toBe(domHits.length);
  expect(domHits.filter(hit => hit.includes("ug-rating__input") || hit.includes("ug-progress") || hit.includes("ug-badge") || hit.includes("ug-spinner")).length, "the grid reaches the controls").toBeGreaterThan(40);
  expect(gpuHits.filter((hit, index) => domHits[index] !== "outside" && hit !== domHits[index]), "native hits are the DOM's").toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${domHits.filter(hit => hit !== "outside").length} native hits on the panel, 0 differ from the DOM's`);
  await healthy(page, "hits", level);

  // Containment: with the lights off (more contrast: flat colour, no emitters), the parts draw inside their native boxes only.
  await page.emulateMedia({ contrast: "more", reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  await ready(page, `?level=${level}`);
  const boxes = await boxesOf(page);
  await page.addStyleTag({ content: `${LENS} { visibility: hidden !important; }` });
  const bare = await frame(page, `${level}-dpr${dpr}-bare`);
  await page.evaluate(() => { for (const style of [...document.querySelectorAll("style")].filter(style => style.textContent.includes("visibility: hidden !important"))) style.remove(); });
  const drawn = difference(await frame(page, `${level}-dpr${dpr}-off`), bare, boxes);
  expect(drawn.inside, "the lenses are drawn").toBeGreaterThan(300 * dpr * dpr);
  expect(drawn.outside, `no part pixel outside a native box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
  const off = await sceneOf(page);
  expect(off.emitters.every(emitter => emitter.strength === 0), "more contrast: every emitter is off").toBe(true);
  console.log(`DPR ${dpr} ${level}: lights off: ${drawn.inside} px inside the boxes, ${drawn.outside} outside`);
  await healthy(page, "lights off", level);
  await page.emulateMedia({ contrast: "no-preference" });

  // A value change: the bar's box changes, the face is lit within its reach and not beyond, and the labels keep the guard.
  await ready(page, `?level=${level}`);
  await page.evaluate(() => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 0; } });
  const before = await frame(page, `${level}-dpr${dpr}-value-40`);
  await page.evaluate(() => window.strataIndicatorProbe.setProgress("p-det", 90));
  const after = await frame(page, `${level}-dpr${dpr}-value-90`);
  const barBox = (await boxesOf(page)).find(box => box.id === "p-det"), panelFrame = await page.evaluate(() => { const frame = document.getElementById("frame").getBoundingClientRect(), box = document.getElementById("ind-panel").getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height }; });
  const reach = 3 * LED, lensCentres = scene.lenses.slice(15, 27).slice(5, 11).map(lens => ({ cx: panelFrame.x + lens.rect[0] + lens.rect[2] / 2, cy: panelFrame.y + lens.rect[1] + lens.rect[3] / 2, radius: reach + 3 }));
  const inBox = difference(before, after, [barBox]), within = difference(before, after, [barBox, ...lensCentres]);
  expect(inBox.inside, "the bar's box changes").toBeGreaterThan(60 * dpr * dpr);
  expect(within.outside, `nothing changes beyond the bar's box and the lit segments' reach (${JSON.stringify(within.outsideSamples)})`).toBe(0);
  const texts = scene.texts.map(text => [text[0] + panelFrame.x, text[1] + panelFrame.y, text[2], text[3]]);
  let worst = 0, checked = 0;
  for (const text of texts) {
    if (!lensCentres.some(centre => Math.hypot(text[0] + text[2] / 2 - centre.cx, text[1] + text[3] / 2 - centre.cy) <= reach + 20)) continue;
    worst = Math.max(worst, excess(before, after, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr)); checked++;
  }
  console.log(`DPR ${dpr} ${level}: value 40 to 90: ${inBox.inside} px in the bar's box, changed within reach ${within.inside}, beyond ${within.outside}; ${checked} text rects near it, worst change ${worst} levels`);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "value", level);

  // A score: the 4th and 5th lamps of the Rating light (3 to 5), each a lamp with the larger pool (reach 6 lens diameters); its box changes, the face is lit
  // within the reach and not beyond, and the legends and the badges' text around it keep the guard.
  await page.evaluate(() => { document.querySelector("#rate input[value='5']").checked = true; });
  const rated = await frame(page, `${level}-dpr${dpr}-score-5`);
  const stars = (await boxesOf(page)).filter(box => box.id === "rate").slice(3), starReach = 6 * RATING_LENS;
  const starCentres = stars.map(box => ({ cx: box.x + box.width / 2, cy: box.y + box.height / 2, radius: starReach + 3 }));
  const starBox = difference(after, rated, stars), starWithin = difference(after, rated, [...stars, ...starCentres]);
  expect(starBox.inside, "the lamps' boxes change").toBeGreaterThan(80 * dpr * dpr);
  expect(starWithin.outside, `nothing changes beyond the lamps' reach (${JSON.stringify(starWithin.outsideSamples)})`).toBe(0);
  let starWorst = 0, starChecked = 0;
  for (const text of texts) {
    if (!starCentres.some(centre => Math.hypot(text[0] + text[2] / 2 - centre.cx, text[1] + text[3] / 2 - centre.cy) <= starReach)) continue;
    starWorst = Math.max(starWorst, excess(after, rated, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr)); starChecked++;
  }
  console.log(`DPR ${dpr} ${level}: score 3 to 5: ${starBox.inside} px in the lamps' boxes, changed within reach ${starWithin.inside}, beyond ${starWithin.outside}; ${starChecked} text rects within reach, worst change ${starWorst} levels`);
  expect(starChecked, "text within the lamps' reach").toBeGreaterThan(0);
  expect(starWorst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "score", level);

  // A badge's lens lights (a neutral pill given a colour): the text on the same pill, 6 px from the lens, keeps the guard, and nothing beyond the reach changes.
  await page.evaluate(() => document.getElementById("b-count").setAttribute("data-strata-colour", "warning"));
  const lit = await frame(page, `${level}-dpr${dpr}-badge-lit`);
  const pill = (await boxesOf(page)).find(box => box.id === "b-count"), ledReach = 6 * LED;
  const pillCentre = { cx: pill.x + 17, cy: pill.y + pill.height / 2, radius: ledReach + 3 };
  const pillBox = difference(rated, lit, [pill]), pillWithin = difference(rated, lit, [pill, pillCentre]);
  expect(pillBox.inside, "the pill's box changes").toBeGreaterThan(30 * dpr * dpr);
  expect(pillWithin.outside, `nothing changes beyond the lens's reach (${JSON.stringify(pillWithin.outsideSamples)})`).toBe(0);
  const pillText = texts.filter(text => Math.abs(text[1] + text[3] / 2 - (pill.y + pill.height / 2)) < 8 && text[0] > pill.x && text[0] < pill.x + pill.width);
  // The text is 8 px from the lens, inside the guard's feather: the guard holds the face to 1 ± m (4%) of its own, so the text may move by up to twice that
  // between an unlit and a lit lens (shadows and light): what must hold is its contrast, which the guard exists to keep (WCAG 4.5:1), and that it loses no more than 10% of it.
  const pillBefore = pillText.map(text => contrastOf(rated, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr)), pillAfter = pillText.map(text => contrastOf(lit, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr));
  console.log(`DPR ${dpr} ${level}: a badge's lens lit: ${pillBox.inside} px in its box, changed within reach ${pillWithin.inside}, beyond ${pillWithin.outside}; ${pillText.length} text run on the pill, its contrast ${pillBefore.map(value => value.toFixed(2))} unlit, ${pillAfter.map(value => value.toFixed(2))} lit`);
  expect(pillText.length, "the pill's text").toBeGreaterThan(0);
  pillAfter.forEach((value, index) => { expect(value, "the text beside the lit lens keeps 4.5:1").toBeGreaterThanOrEqual(4.5); expect(value, "and loses no more than 10% of its contrast").toBeGreaterThanOrEqual(pillBefore[index] * 0.9); });
  await healthy(page, "badge", level);
  expect(errors).toEqual([]);
  await context.close();
});

/** The WCAG contrast ratio of a text run's rect: its lightest pixel against its darkest (the face against the glyphs, in the light theme). */
function contrastOf(png, rect, dpr) {
  let lowest = 1, highest = 0;
  const channel = value => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * png.width + x) * 4, luminance = 0.2126 * channel(png.data[offset]) + 0.7152 * channel(png.data[offset + 1]) + 0.0722 * channel(png.data[offset + 2]);
    lowest = Math.min(lowest, luminance); highest = Math.max(highest, luminance);
  }
  return (highest + 0.05) / (lowest + 0.05);
}
/** The worst excess, in levels, of `lit`'s pixels over `reference`'s within `rect`, beyond a share `m` of the reference's own value. */
function excess(reference, lit, rect, dpr, m = 0.04) {
  let worst = 0;
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * reference.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) { const value = reference.data[offset + channel], next = lit.data[offset + channel]; worst = Math.max(worst, next - value * (1 + m), value * (1 - m) - next); }
  }
  return Math.round(worst * 100) / 100;
}

for (const level of levels) test(`a chase at ${level}: the emitters follow the CSS, 300 frames add no capture, upload or hit-geometry update, and the head's two positions differ in pixels`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await frame(page, `${level}-chase-quiet`, { wait: 400 });
  // 300 frames: every frame's scene has the emitters as the CSS chase has them; nothing is captured or uploaded.
  const run = await page.evaluate(async ([spinnerFirst, barFirst]) => {
    const probe = window.strataIndicatorProbe, next = () => new Promise(requestAnimationFrame);
    const spinner = [...document.querySelectorAll("#s-md .ug-spinner__lens")], bar = [...document.querySelectorAll("#p-ind ~ .ug-progress__object .ug-progress__segment")];
    const groups = [[spinnerFirst, spinner, 520 * (7.2 / 10) ** 2], [barFirst, bar, 260]];
    for (let step = 0; step < 6; step++) await next();
    const start = probe.counts(), begin = performance.now(), heads = new Set();
    let disagree = 0, samples = 0, lateSteps = 0;
    for (let step = 0; step < 300; step++) {
      await next();
      const scene = probe.scene();
      for (const [first, lenses, full] of groups) lenses.forEach((lens, index) => {
        // The scene was built in a frame at most one behind the CSS: the two agree except at a lens's head, which jumps from dark to lit.
        const lit = scene.emitters[first + index].strength / full, css = Number(getComputedStyle(lens).getPropertyValue("--strata-lit"));
        samples++;
        if (Math.abs(lit - css) > 0.35) disagree++;
      });
      let head = 0;
      for (let index = 1; index < 8; index++) if (scene.emitters[spinnerFirst + index].strength > scene.emitters[spinnerFirst + head].strength) head = index;
      heads.add(head);
      const layer = probe.state().instrument?.layers?.[0];
      if (layer && (layer.steppedDown.length || layer.status !== "ready")) lateSteps++;
    }
    const end = probe.counts(), seconds = (performance.now() - begin) / 1000;
    return { frames: 300, seconds, disagree, samples, lateSteps, heads: heads.size, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  }, [startOf("s-md"), startOf("p-ind")]);
  console.log(`${level}: 300 frames in ${run.seconds.toFixed(2)} s: ${run.disagree} of ${run.samples} lens samples differ from the CSS by over a third, the ring's head visited ${run.heads} lenses, ${run.captures} captures, ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates, ${run.lateSteps} frames stepped down`);
  expect(run.disagree / run.samples, "the scene follows the CSS chase").toBeLessThanOrEqual(0.08);
  expect(run.mode).toBe("gpu");
  expect(run.captures, "no capture").toBe(0);
  expect(run.uploads, "no upload").toBe(0);
  expect(run.geometryUpdates, "no hit-geometry update").toBe(0);
  expect(run.lateSteps).toBe(0);
  expect(run.heads, "the scene's head goes all the way round the ring").toBe(8);
  await healthy(page, "chasing", level);
  // The head's two positions differ in pixels: pause the chase at the start of a lap, then half way round.
  const phase = async (name, share) => { await pauseAt(page, share); return frame(page, `${level}-chase-${name}`, { wait: 250 }); };
  const first = await phase("start", 0), half = await phase("half", 0.5);
  const boxes = await boxesOf(page);
  const regions = boxes.filter(box => box.id === "s-md" || box.id === "s-sm");
  const changes = difference(first, half, regions.map(region => ({ x: region.x - 40, y: region.y - 40, width: region.width + 80, height: region.height + 80 })));
  expect(changes.inside, "the two head positions differ near the rings").toBeGreaterThan(300);
  console.log(`${level}: head at the start vs half a lap: ${changes.inside} px differ near the rings, ${changes.outside} elsewhere (the bar's sweep)`);
  await context.close();
});

for (const level of levels) test(`under reduced motion the ring and the bar at ${level} are steady: 0 frames change in 2 seconds, and the comet is lit`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await frame(page, `${level}-still-0`, { wait: 400 });
  const shots = [];
  for (let step = 0; step < 6; step++) { await page.waitForTimeout(350); shots.push(await frame(page, `${level}-still-${step + 1}`, { wait: 0, move: false })); }
  const reference = await frame(page, `${level}-still-ref`, { wait: 0, move: false });
  for (const [index, shot] of shots.entries()) expect(changedPixels(reference, shot), `frame ${index + 1} of 6 over 2.1 s: 0 pixels changed`).toBe(0);
  const scene = await sceneOf(page);
  const comet = scene.emitters.slice(startOf("s-md"), startOf("s-md") + 8).map(emitter => Math.round((emitter.strength / (520 * (7.2 / 10) ** 2)) * 100) / 100);
  expect(comet, "the comet: lit 1 at lens 0 and 0.75, 0.5, 0.25 behind it").toEqual([1, 0, 0, 0, 0, 0.25, 0.5, 0.75]);
  console.log(`${level}: 6 frames over 2.1 s under reduced motion, 0 pixels changed; the comet ${JSON.stringify(comet)}`);
  await healthy(page, "reduced motion", level);
  await context.close();
});

test("the forms page keeps the accessibility snapshot of the DOM on every level, and passes axe", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-indicator-forms.html?dom");
  await page.waitForFunction(() => window.strataIndicatorProbe);
  const dom = await page.locator("#ind-panel").ariaSnapshot();
  expect(dom).toContain('group "Your rating"');
  expect(dom).toContain("status: Loading");
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    expect(await page.locator("#ind-panel").ariaSnapshot(), level).toBe(dom);
    await healthy(page, level, level);
    const { violations } = await new AxeBuilder({ page }).include("#ind-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
  await context.close();
});

test("flush on the GPU is the scene of before: no emitters, no lenses, a ring primitive for the spinner, GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const level of levels) {
    await ready(page, `?flush&level=${level}`);
    const scene = await sceneOf(page);
    expect(scene.emitters, `${level}: no emitters`).toBeUndefined();
    expect(scene.version, `${level}: not a light scene`).toBe({ relief: 1, objects: 2, instrument: 4 }[level] ?? 4);
    expect(scene.lenses).toEqual([]);
    expect(scene.faces.includes("ring") || level !== "relief", `${level}: the spinner's ring`).toBe(true);
    await healthy(page, `flush ${level}`, level);
  }
  await context.close();
});

test("under more contrast the Instrument forms have no emitters' light and a lit lens is flat; under reduced transparency the lens is an opaque dome", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0)).toBe(true);
  await page.waitForFunction(() => window.strataIndicatorProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataIndicatorProbe.refresh());
  scene = await sceneOf(page);
  expect(scene.objects.every(object => object.parts[0].startsWith("lens:lensOpaque ") && object.glass[0] === undefined)).toBe(true);
  expect(scene.emitters.some(emitter => emitter.strength > 0)).toBe(true);
  await page.waitForFunction(() => window.strataIndicatorProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the specimen's indicator panel keeps the LED pills' text at 4.5:1 in decoded pixels in every theme, and its lenses are lit by the roles", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-specimen.html");
  await page.waitForSelector("#indicator-title");
  for (const theme of ["light", "dark", "contrast", "contrast-dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const badges = page.locator("#indicator-title ~ .row .ug-badge");
    expect(await badges.count()).toBe(5);
    for (let index = 0; index < 5; index++) {
      const badge = badges.nth(index);
      await badge.scrollIntoViewIfNeeded();
      const clip = await badge.evaluate(element => { const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), range = document.createRange(); range.selectNodeContents(walker.nextNode()); const box = range.getClientRects()[0]; return { x: box.left, y: box.top, width: box.width, height: box.height }; });
      const shot = PNG.sync.read(await page.screenshot({ clip }));
      expect(contrastOf(shot, { x: 0, y: 0, width: clip.width, height: clip.height }, 1), `${theme}: badge ${index}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(await lits(page, "#indicator-title ~ .row .ug-badge__lens")).toEqual([0, 1, 1, 1, 1]);
  expect((await lits(page, "#spec-if-upload ~ .ug-progress__object .ug-progress__segment")).filter(lit => lit === 1).length).toBe(5);
  expect(await lits(page, "#indicator-title ~ .row .ug-rating__lens")).toEqual([1, 1, 1, 0, 0, 1, 1, 0]);
  await context.close();
});
