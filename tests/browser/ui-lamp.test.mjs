/**
 * Browser suite for the Lamp (anatomy page `lamp.md`) on `ui-lamp.html` (`window.strataLampProbe`): plain contract
 * markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel. Toggle lamps off and
 * on in the glow colour and the status roles, small and large, a disabled lit one, a reversed one, a momentary one, a
 * disabled momentary one and one at the panel's edge.
 * - Plain DOM (`?plain`), real input: a click on the lamp's box and on its label toggles it once (one `input`, one
 *   `change`); Space toggles and Enter does not; form data follows `checked`; a disabled lamp stays; `--strata-lit` is 1
 *   for a lit lamp and 0 for a disabled one; every box is the lens plus 28 px and at least 24; a grid of
 *   `elementFromPoint` over every box finds the control.
 * - A momentary lamp is a button, with its lens and label inside it, whose `aria-pressed` is true from the pointer or Space
 *   or Enter going down on it (its label included) to going up, and lights while it is: real mouse, keys, a press on the label,
 *   a release elsewhere, a focus change while a key is down, a disabled one that never lights; one native `click` each.
 * - Touch (390 px) and 320 px: taps toggle, a held touch lights a momentary lamp, no horizontal overflow, every box at
 *   least 24 px, labels whole; at 200% text the labels wrap without loss.
 * - Preferences: axe in light, dark, face mode, forced colours (the lens is Canvas, Highlight when lit) and more contrast;
 *   reduced motion changes nothing about a lamp.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is version 4 with an emitter per lens in
 *   document order, its strength from the lens and the state, the protected rects of every label, and the documented parts
 *   (a bezel and a lens; at Instrument core's `instrument` material with a glass lens carrying its emitter); with every lamp
 *   off, every pixel the objects draw lies inside a lamp's box, and native hits on them find the control; 0 hit mismatches
 *   over every box; turning a lamp on changes pixels in its box and lights the face past its edge within its reach, none
 *   beyond it, and the label beside it stays within the guard; a real click gives fresh pixels with GPU on and no
 *   hit-geometry update; hover and disabled reach the parts; past 64 emitters a layer the rest are dropped with the diagnostic.
 * - Instrument preferences: more contrast turns every emitter off and prints the lit lens flat; reduced transparency makes
 *   the lens an opaque dome.
 * - Feedback (`click`, opt-in): off by default, created after the first gesture, a toggle and a press each play it once,
 *   pulses only for the visitor's own input and not under reduced motion, muted is silent.
 * - The accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page.
 * Screenshots go to the `ui-lamp` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-lamp");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** The toggle lamps, their state at load and their lens in px (`size.lamp.*`). */
const toggles = { mains: [false, 28], standby: [true, 28], link: [false, 28], fault: [true, 28], armed: [true, 20], tuner: [false, 36], locked: [true, 28], aux: [false, 28], edge: [true, 28] };
const momentary = ["talk", "muted"];
const lampIds = [...Object.keys(toggles), ...momentary];
const colours = { mains: "#ff9228", standby: "#ff9228", link: "#15803d", fault: "#c42b2b", armed: "#2563eb", tuner: "#2563eb", locked: "#ff9228", aux: "#b45309", talk: "#15803d", muted: "#ff9228", edge: "#c42b2b" };
const lensOf = { ...Object.fromEntries(Object.entries(toggles).map(([id, [, lens]]) => [id, lens])), talk: 28, muted: 28 };
const boxOf = id => lensOf[id] + 28;

const checked = (page, id) => page.locator(`#${id}`).evaluate(input => input.checked);
const pressed = (page, id) => page.locator(`#${id}`).getAttribute("aria-pressed");
const events = page => page.evaluate(() => window.strataLampProbe.events());
const clear = page => page.evaluate(() => window.strataLampProbe.clearEvents());
const lit = (page, id) => page.locator(`#${id}`).evaluate(input => Number(getComputedStyle(input.closest(".ug-lamp")).getPropertyValue("--strata-lit")));
const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
/** One toggle's events: exactly one `input` and one `change` (the click is recorded too). */
const one = (id, state) => [{ id, type: "click", checked: state }, { id, type: "input", checked: state }, { id, type: "change", checked: state }];
/** elementFromPoint over a grid on a lamp's box (inset 0.5 px): every hit must be the control. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  // A toggle lamp's box is its input's; a momentary lamp's is its object's, inside the button, which every pixel of it hits.
  const input = document.getElementById(id), box = (input.matches(".ug-lamp--momentary") ? input.querySelector(".ug-lamp__object") : input).getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== input) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-lamp.html?plain${query}`);
  await page.waitForFunction(() => window.strataLampProbe);
  return { context, page, errors };
}

test("a toggle lamp is a native switch: click, label, Space, one input and one change, form data, disabled, lit state and boxes", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  for (const [id, [on, lens]] of Object.entries(toggles)) {
    const input = page.locator(`#${id}`);
    await expect(input, `${id}: role`).toHaveRole("switch");
    await expect(input).toHaveAccessibleName({ mains: "Mains", standby: "Standby", link: "Link", fault: "Fault", armed: "Armed", tuner: "Tuner", locked: "Locked", aux: "Aux", edge: "Edge" }[id]);
    expect(await checked(page, id)).toBe(on);
    const box = await input.boundingBox();
    expect([box.width, box.height], `${id}: the box is the lens (${lens}) plus 28 px`).toEqual([lens + 28, lens + 28]);
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
    // Lit by its state; a disabled lamp is unlit.
    expect(await lit(page, id), `${id}: --strata-lit`).toBe(on && id !== "locked" ? 1 : 0);
    const grid = await hits(page, id);
    expect(grid.misses, `${id}: hits over the box`).toEqual([]);
  }
  // A click on the box (centre, then a corner) and on the label toggles once each.
  await clear(page);
  const mains = await page.locator("#mains").boundingBox();
  await page.mouse.click(...centreOf(mains));
  expect(await checked(page, "mains")).toBe(true);
  expect(await events(page)).toEqual(one("mains", true));
  expect(await lit(page, "mains")).toBe(1);
  await clear(page);
  await page.mouse.click(mains.x + 1, mains.y + 1);
  expect(await checked(page, "mains"), "a click in the box's corner").toBe(false);
  expect(await events(page)).toEqual(one("mains", false));
  await clear(page);
  await page.locator(".ug-lamp", { has: page.locator("#link") }).locator(".ug-lamp__label").click();
  expect(await checked(page, "link"), "a click on the label").toBe(true);
  expect((await events(page)).filter(event => event.type === "change")).toEqual([{ id: "link", type: "change", checked: true }]);
  // A reversed lamp: its label first, the DOM order kept.
  const aux = page.locator(".ug-lamp", { has: page.locator("#aux") });
  const [auxLabel, auxBox] = [await aux.locator(".ug-lamp__label").boundingBox(), await page.locator("#aux").boundingBox()];
  expect(auxLabel.x + auxLabel.width, "the label is before the lamp").toBeLessThanOrEqual(auxBox.x + 1);
  // Space toggles, Enter does not.
  await clear(page);
  await page.locator("#tuner").focus();
  await page.keyboard.press("Space");
  expect(await checked(page, "tuner")).toBe(true);
  await page.keyboard.press("Enter");
  expect(await checked(page, "tuner"), "Enter does not toggle").toBe(true);
  expect((await events(page)).filter(event => event.type === "change")).toHaveLength(1);
  // Form data follows checked; a disabled lamp is not in it.
  expect(await page.evaluate(() => [...new FormData(document.getElementById("lamp-form")).keys()].sort())).toEqual(["fault", "armed", "link", "standby", "tuner"].sort());
  // Disabled: no toggle.
  await clear(page);
  await page.locator("#locked").click({ force: true });
  expect(await checked(page, "locked")).toBe(true);
  expect(await events(page)).toEqual([]);
  // The readout follows the toggles.
  await expect(page.locator("#lamp-read")).toHaveText(/\d of 6 lit/);
  expect(errors).toEqual([]);
  await context.close();
});

test("a momentary lamp is a button that lights while it is held: pointer, Space, Enter and its label, released anywhere", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  const talk = page.locator("#talk");
  await expect(talk).toHaveRole("button");
  await expect(talk).toHaveAccessibleName("Talk");
  expect(await pressed(page, "talk")).toBe("false");
  expect(await lit(page, "talk")).toBe(0);
  const box = await talk.boundingBox(), object = await talk.locator(".ug-lamp__object").boundingBox();
  expect([object.width, object.height], "the object's box is the lens plus 28 px").toEqual([56, 56]);
  expect(box.width, "the button holds its label").toBeGreaterThan(object.width + 10);
  expect(object.x).toBeGreaterThanOrEqual(box.x);
  // The mouse: lit from down to up, one native click.
  await clear(page);
  await page.mouse.move(...centreOf(box));
  await page.mouse.down();
  expect(await pressed(page, "talk")).toBe("true");
  expect(await lit(page, "talk"), "lit while held").toBe(1);
  await page.mouse.up();
  expect(await pressed(page, "talk")).toBe("false");
  expect(await lit(page, "talk")).toBe(0);
  expect((await events(page)).filter(event => event.type === "click")).toHaveLength(1);
  // Released elsewhere: it lets go, and there is no click.
  await clear(page);
  await page.mouse.move(...centreOf(box));
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.up();
  expect(await pressed(page, "talk")).toBe("false");
  expect((await events(page)).filter(event => event.type === "click")).toHaveLength(0);
  // Its label is inside the button: pressing it lights the lamp, and releasing on it clicks the button once.
  await clear(page);
  const label = await talk.locator(".ug-lamp__label").boundingBox();
  await page.mouse.move(...centreOf(label));
  await page.mouse.down();
  expect(await pressed(page, "talk"), "pressing the label lights the lamp").toBe("true");
  await page.mouse.up();
  expect(await pressed(page, "talk")).toBe("false");
  expect((await events(page)).filter(event => event.type === "click")).toHaveLength(1);
  // Keys: Space and Enter hold it from down to up.
  for (const key of ["Space", "Enter"]) {
    await clear(page);
    await talk.focus();
    await page.keyboard.down(key);
    expect(await pressed(page, "talk"), `${key} down`).toBe("true");
    await page.keyboard.up(key);
    expect(await pressed(page, "talk"), `${key} up`).toBe("false");
    expect((await events(page)).filter(event => event.type === "click"), `${key}: one click`).toHaveLength(1);
  }
  // Focus moving away while a key is down lets go.
  await talk.focus();
  await page.keyboard.down("Space");
  expect(await pressed(page, "talk")).toBe("true");
  await page.locator("#mains").focus();
  expect(await pressed(page, "talk"), "blur releases").toBe("false");
  await page.keyboard.up("Space");
  // A disabled one never lights.
  await page.locator("#muted").click({ force: true });
  const muted = await page.locator("#muted").boundingBox();
  await page.mouse.move(...centreOf(muted));
  await page.mouse.down();
  expect(await pressed(page, "muted")).toBe("false");
  expect(await lit(page, "muted")).toBe(0);
  await page.mouse.up();
  expect(errors).toEqual([]);
  await context.close();
});

for (const width of [390, 320]) test(`at ${width} px the lamps reflow without overflow, every box is at least 24 px, and touch toggles and holds`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-lamp__object")].map(object => { const box = object.getBoundingClientRect(); return { id: object.closest(".ug-lamp").querySelector(":scope > .ug-lamp__input")?.id ?? object.closest(".ug-lamp").id, left: box.left, right: box.right, width: box.width, height: box.height }; }),
    labels: [...document.querySelectorAll(".ug-lamp__label")].map(label => { const box = label.getBoundingClientRect(); return { left: box.left, right: box.right, clipped: label.scrollWidth > label.clientWidth + 1 }; }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) { expect(Math.min(box.width, box.height), `${box.id}: target size`).toBeGreaterThanOrEqual(24); expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  for (const label of layout.labels) { expect(label.left).toBeGreaterThanOrEqual(0); expect(label.right).toBeLessThanOrEqual(width); expect(label.clipped).toBe(false); }
  // A tap toggles; a held touch lights a momentary lamp.
  const client = await context.newCDPSession(page);
  await page.locator("#mains").scrollIntoViewIfNeeded();
  const mains = await page.locator("#mains").boundingBox();
  await page.touchscreen.tap(...centreOf(mains));
  expect(await checked(page, "mains"), "tap").toBe(true);
  await page.locator("#talk").scrollIntoViewIfNeeded();
  const talk = await page.locator("#talk").boundingBox();
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: talk.x + talk.width / 2, y: talk.y + talk.height / 2 }] });
  await page.waitForTimeout(60);
  expect(await pressed(page, "talk"), "a held touch lights it").toBe("true");
  expect(await lit(page, "talk")).toBe(1);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(60);
  expect(await pressed(page, "talk")).toBe("false");
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest box ${Math.min(...layout.boxes.map(box => Math.min(box.width, box.height)))} px, ${layout.boxes.length} lamps`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the labels wrap without loss and nothing overflows", async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width: 320, height: 800 } });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
    document.documentElement.style.setProperty("--strata-control-font", `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--strata-control-font")) * 2}px`);
  });
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    labels: [...document.querySelectorAll(".ug-lamp__label")].map(label => ({ text: label.textContent, right: label.getBoundingClientRect().right, clipped: label.scrollWidth > label.clientWidth + 1 })) }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  for (const label of layout.labels) { expect(label.right, label.text).toBeLessThanOrEqual(320); expect(label.clipped, label.text).toBe(false); }
  console.log(`200% text: scrollWidth ${layout.scrollWidth}, ${layout.labels.length} labels whole`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the lamp passes axe in light, dark, face mode, forced colours and more contrast, and forced colours draw it", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#lamp-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("lamp-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#lamp-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("lamp-panel").removeAttribute("data-strata-mode"); });
  }
  // Forced colours: a Canvas lens in a CanvasText ring, Highlight when lit, GrayText when disabled.
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const colours = await page.evaluate(() => Object.fromEntries(["mains", "standby", "locked"].map(id => {
    const lamp = document.getElementById(id).closest(".ug-lamp"), lens = getComputedStyle(lamp.querySelector(".ug-lamp__lens")), bezel = getComputedStyle(lamp.querySelector(".ug-lamp__bezel"));
    return [id, { lens: lens.backgroundColor, lensBorder: lens.borderTopColor, glow: lens.boxShadow, bezel: bezel.borderTopColor }];
  })));
  expect(colours.standby.lens, "lit lens is Highlight").not.toBe(colours.mains.lens);
  expect(colours.mains.glow, "no glow").toBe("none");
  expect(colours.locked.lensBorder, "a disabled lamp's lens is edged in GrayText").not.toBe(colours.mains.lensBorder);
  const forced = await new AxeBuilder({ page }).include("#lamp-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const more = await page.evaluate(() => { const lens = getComputedStyle(document.getElementById("standby").closest(".ug-lamp").querySelector(".ug-lamp__lens")); return { border: lens.borderTopWidth, glow: lens.boxShadow }; });
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(parseFloat(more.border)).toBeGreaterThanOrEqual(1);
  const contrast = await new AxeBuilder({ page }).include("#lamp-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-lamp.html${query}`);
  await page.waitForFunction(() => window.strataLampProbe && window.strataLampProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataLampProbe.scene() !== undefined);
  await page.evaluate(() => window.strataLampProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => window.strataLampProbe.state().instrument?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataLampProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataLampProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataLampProbe.refresh(); await window.strataLampProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataLampProbe.controller.settle();
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
    const box = element.getBoundingClientRect(), lamp = element.closest(".ug-lamp");
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id || (lamp?.matches(".ug-lamp--momentary") ? lamp.id : lamp?.querySelector(":scope > .ug-lamp__input")?.id) };
  });
}, selector);
/** Native hits on frame points: how many land on a lamp's control. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches(".ug-lamp__input, .ug-lamp--momentary")) mismatches++;
  return { total: points.length, mismatches };
}, points);
/** Sets every toggle lamp's state (the real property and the events a user's click fires). */
const setLamps = (page, state) => page.evaluate(state => {
  for (const [id, on] of Object.entries(state)) {
    const input = document.getElementById(id);
    if (input.checked === on) continue;
    input.checked = on;
    input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}, state);
const allOff = Object.fromEntries(Object.keys(toggles).map(id => [id, false]));
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-lamp__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
const depth = (page, value) => page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
const counts = page => page.evaluate(() => window.strataLampProbe.counts());
const pixel = (png, point, dpr) => { const offset = (Math.floor(point.y * dpr) * png.width + Math.floor(point.x * dpr)) * 4; return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]; };
const gain = (off, on, point, dpr) => { const a = pixel(off, point, dpr), b = pixel(on, point, dpr); return (b[0] + b[1] + b[2] - a[0] - a[1] - a[2]) / 3; };
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
/** The largest change of any channel inside `rect` beyond `1 ± m` times the reference (8-bit levels). */
function excess(reference, lit, rect, dpr, m = 0.04) {
  let worst = 0, pixels = 0;
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * reference.width + x) * 4;
    pixels++;
    for (let channel = 0; channel < 3; channel++) { const value = reference.data[offset + channel], next = lit.data[offset + channel]; worst = Math.max(worst, next - value * (1 + m), value * (1 - m) - next); }
  }
  return { levels: Math.round(worst * 100) / 100, pixels };
}
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataLampProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, feather: scene.feather, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), primitives: scene.primitives, objects: scene.objects?.map(object => ({ id: object.id, parts: object.parts.map(part => `${part.kind}:${part.material}`), emitters: object.parts.map(part => part.emitter), glass: object.parts.map(part => part.glass),
      state: object.parts[0].state, casters: object.parts.map(part => part.caster === undefined ? "own" : part.caster === null ? "none" : part.caster.height),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id).closest(".ug-lamp").querySelector(".ug-lamp__object"))[index]) < 0.01) })),
    // The text runs of every label, the note, the readout and the title (what the guard protects).
    labels: [...document.querySelectorAll(".ug-lamp__label, #note, #lamp-read, #lamp-title")].flatMap(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(box => [box.left - panel.left, box.top - panel.top, box.width, box.height]);
    }) };
});

for (const dpr of [1, 2]) for (const level of levels) test(`the lamps at ${level} (DPR ${dpr}): the scene, the emitters, containment, hits, the light and the guard`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  const lenses = await page.evaluate(() => document.querySelectorAll(".ug-lamp__lens").length);
  expect(lenses).toBe(lampIds.length);
  expect(scene.version, "version 4").toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // One emitter per lens, in document order; strength from the lens and the state (a disabled lamp is unlit).
  const order = await page.evaluate(() => [...document.querySelectorAll(".ug-lamp")].map(lamp => (lamp.matches(".ug-lamp--momentary") ? lamp : lamp.querySelector(":scope > .ug-lamp__input")).id));
  expect(scene.emitters).toHaveLength(order.length);
  scene.emitters.forEach((emitter, index) => {
    const id = order[index], on = id in toggles ? toggles[id][0] && id !== "locked" : false, lens = lensOf[id];
    expect(emitter.strength, `${id}: strength`).toBeCloseTo(on ? 3200 * (lens / 28) ** 2 : 0, 2);
    expect(emitter.radius, `${id}: reach ${lens * 6}`).toBeCloseTo(lens * 6, 2);
    expect(emitter.position[2], `${id}: height 0.7 lens`).toBeCloseTo(0.7 * lens, 2);
    expect(Math.max(...emitter.colour), `${id}: colour at full brightness`).toBe(1);
    expect(emitter.reach).toBe("outset");
  });
  expect(scene.feather).toBe(4);
  // Every label, the note and the title are protected, whole.
  const protectedRects = scene.protected;
  expect(Array.isArray(protectedRects)).toBe(true);
  for (const label of scene.labels) expect(protectedRects.some(rect => rect[0] <= label[0] + 0.5 && rect[1] <= label[1] + 0.5 && rect[0] + rect[2] >= label[0] + label[2] - 0.5 && rect[1] + rect[3] >= label[1] + label[3] - 0.5), `a protected rect covers the text at ${label.map(Math.round)}`).toBe(true);
  expect(scene.outset.top, "the emitters' outset").toBeGreaterThanOrEqual(48);
  if (level === "instrument") {
    expect(scene.objects.map(object => object.id)).toEqual(order);
    scene.objects.forEach((object, index) => {
      const id = order[index];
      expect(object.parts, `${id}: parts`).toEqual(["bezel:lampBezel", `lens:lens ${colours[id]}`]);
      expect(object.emitters, `${id}: the lens's emitter`).toEqual([undefined, index]);
      expect(object.glass).toEqual([undefined, "lens"]);
      expect(object.close, `${id}: bounds are the control's box`).toBe(true);
    });
    expect(scene.objects.find(object => object.id === "locked").state).toEqual({ hover: false, disabled: true });
    // The parts never depend on the state: the same names whether the lamp is off or on.
    expect(new Set(scene.objects.map(object => object.parts[0])).size).toBe(1);
  } else {
    const wanted = level === "relief" ? { bezel: "raised", lens: "ring" } : { bezel: "bezel", lens: "knob" };
    for (const kind of Object.values(wanted)) expect(scene.faces.filter(face => face === kind).length, `${kind} entries`).toBeGreaterThanOrEqual(lampIds.length);
    // At Relief the lens is a ring face as wide as the lens (a disc), in its own colour; at Objects a dome.
    const rings = scene.primitives.filter(entry => entry.face === "ring");
    expect(rings).toHaveLength(level === "relief" ? lampIds.length : 0);
    expect(rings.every(entry => entry.ring.thickness === entry.rect[2] / 2 && entry.ring.sweep === 360 && /^#[0-9a-f]{6}$/.test(entry.ring.colour))).toBe(true);
  }
  await healthy(page, "start", level);
  // The CSS paint of the lens the GPU draws is hidden; the socket under it stays.
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-lamp__lens")].filter(element => !element.hasAttribute("data-strata-dome")).length)).toBe(0);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-lamp__socket")].filter(element => getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)").length)).toBe(0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters, ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of lampIds) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${lampIds.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment: with every lamp off (no light), the objects draw inside the boxes only, and hits on their pixels find a control.
  await setLamps(page, allOff);
  const boxes = await inFrame(page, ".ug-lamp__object");
  const readout = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#lamp-read"))[0]);
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await depth(page, value);
    const label = value === null ? "0.5" : String(value);
    await objectsHidden(page, true);
    const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-bare`);
    await objectsHidden(page, false);
    const drawn = difference(await frame(page, `${level}-dpr${dpr}-depth${label}-off`), bare, [...boxes, readout], { points: true });
    expect(drawn.inside, `depth ${label}: the objects are drawn`).toBeGreaterThan(1500 * dpr * dpr);
    expect(drawn.outside, `depth ${label}: no object pixel outside a box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
    const hit = await hitsOn(page, drawn.changed.filter(([x, y]) => !(x >= readout.x && x <= readout.x + readout.width && y >= readout.y && y <= readout.y + readout.height)));
    expect(hit.mismatches, `depth ${label}: native hits on object pixels`).toBe(0);
    await healthy(page, `depth ${label}`, level);
    console.log(`DPR ${dpr} ${level}: depth ${label}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
  }
  await depth(page, null);

  // Turning a lamp on: its box changes, the face past its edge is lit within its reach and not beyond it, and its neighbours' text keeps the guard.
  const off = await frame(page, `${level}-dpr${dpr}-all-off`);
  await setLamps(page, { mains: true });
  const on = await frame(page, `${level}-dpr${dpr}-mains-on`);
  const mains = boxes.find(box => box.id === "mains"), centre = { x: mains.x + mains.width / 2, y: mains.y + mains.height / 2 }, reach = 6 * 28;
  const lit1 = difference(off, on, [mains, readout, { cx: centre.x, cy: centre.y, radius: reach + 3 }], { points: false });
  const inBox = difference(off, on, [mains]);
  expect(inBox.inside, "the lamp's box changes").toBeGreaterThan(150 * dpr * dpr);
  expect(lit1.outside, `nothing changes beyond the lamp's reach (${JSON.stringify(lit1.outsideSamples)})`).toBe(0);
  const panelBox = (await inFrame(page, "#lamp-panel"))[0];
  // The text runs in the frame's px (the scene's are the panel's).
  const texts = scene.labels.map(label => [label[0] + panelBox.x, label[1] + panelBox.y, label[2], label[3]]), controls = boxes;
  const pointOk = point => !texts.some(box => point.x >= box[0] - 12 && point.x <= box[0] + box[2] + 12 && point.y >= box[1] - 12 && point.y <= box[1] + box[3] + 12) && !controls.some(box => point.x >= box.x - 3 && point.x <= box.x + box.width + 3 && point.y >= box.y - 3 && point.y <= box.y + box.height + 3);
  const ring = {};
  for (const scale of [1.5, 2, 3]) {
    const gains = [];
    for (let step = 0; step < 48; step++) {
      const angle = (step / 48) * 2 * Math.PI, point = { x: centre.x + Math.cos(angle) * 28 * scale, y: centre.y + Math.sin(angle) * 28 * scale };
      if (point.x < panelBox.x + 8 || point.y < panelBox.y + 8 || point.x > panelBox.x + panelBox.width - 8 || point.y > panelBox.y + panelBox.height - 8) continue;
      if (!pointOk(point)) continue;
      gains.push(gain(off, on, point, dpr));
    }
    ring[scale] = { points: gains.length, median: median(gains) };
  }
  console.log(`DPR ${dpr} ${level}: mains on: ${inBox.inside} px in its box; face gain at 1.5 / 2 / 3 lens diameters: ${JSON.stringify(ring)}; changed within reach ${lit1.inside}, beyond ${lit1.outside}`);
  expect(ring[1.5].points, "sample points at 1.5 diameters").toBeGreaterThan(4);
  expect(ring[1.5].median, "the face is lit at 1.5 diameters").toBeGreaterThan(2);
  expect(ring[2].median, "and at 2").toBeGreaterThan(0.5);
  expect(ring[1.5].median).toBeGreaterThan(ring[3].median ?? -1);
  // The labels near it: the whole change (the light, the relief and the part shadows together) stays within the guard.
  let worst = 0, checkedText = 0;
  for (const label of texts) {
    if (Math.hypot(label[0] + label[2] / 2 - centre.x, label[1] + label[3] / 2 - centre.y) > reach) continue;
    // The readout prints the count the toggle changed: its pixels are text, not light.
    if (label[0] < readout.x + readout.width && label[0] + label[2] > readout.x && label[1] < readout.y + readout.height && label[1] + label[3] > readout.y) continue;
    const result = excess(off, on, { x: label[0], y: label[1], width: label[2], height: label[3] }, dpr);
    worst = Math.max(worst, result.levels); checkedText++;
  }
  console.log(`DPR ${dpr} ${level}: ${checkedText} text rects within reach, worst change beyond the guard ${worst} levels`);
  expect(checkedText).toBeGreaterThan(1);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "mains on", level);
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`a real click on a lamp at ${level} gives fresh pixels with GPU on, no hit-geometry update, and hover and disabled reach the scene`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  // The readout prints the count a toggle changes: its text is captured too, so it is out of this measure of the lamp's own.
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#lamp-read"))[0]);
  await page.evaluate(() => { document.getElementById("lamp-read").style.visibility = "hidden"; });
  const boxes = await inFrame(page, ".ug-lamp__object");
  const before = await frame(page, `${level}-click-before`);
  const start = await counts(page);
  const link = await page.locator("#link").boundingBox();
  await page.mouse.click(...centreOf(link));
  expect(await checked(page, "link")).toBe(true);
  const after = await frame(page, `${level}-click-after`, { wait: 400 });
  const end = await counts(page);
  const link1 = boxes.find(box => box.id === "link"), centre = { cx: link1.x + link1.width / 2, cy: link1.y + link1.height / 2, radius: 6 * 28 + 3 };
  const changed = difference(before, after, [link1, read, centre]);
  console.log(`${level}: a click: ${changed.inside} px changed, ${changed.outside} outside its reach; ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.geometryUpdates - start.geometryUpdates} hit-geometry updates`);
  expect(changed.inside, "fresh pixels").toBeGreaterThan(300);
  expect(changed.outside, `no stale or stray pixels (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
  expect(end.mode).toBe("gpu");
  expect(end.geometryUpdates - start.geometryUpdates, "no hit-geometry update").toBe(0);
  // A real click is captured as it goes down and as it comes up (as the Switch forms' is); the lights are uniforms, not captures.
  expect(end.captures - start.captures, "a real click is captured at most as it goes down, as it comes up, and once more").toBeLessThanOrEqual(3);
  // A native change alone (a keyboard toggle, a script) is captured at most once.
  const scripted = await page.evaluate(async () => {
    const probe = window.strataLampProbe, next = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 6; index++) await next();
    const first = probe.counts(), input = document.getElementById("fault");
    input.checked = !input.checked; input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let index = 0; index < 30; index++) await next();
    const last = probe.counts();
    return { captures: last.captures - first.captures, geometryUpdates: last.geometryUpdates - first.geometryUpdates };
  });
  console.log(`${level}: a native change: ${scripted.captures} capture, ${scripted.geometryUpdates} hit-geometry updates`);
  expect(scripted.captures, "a native change is captured at most once").toBeLessThanOrEqual(1);
  expect(scripted.geometryUpdates).toBe(0);
  await healthy(page, "click", level);
  // Hover and disabled reach the parts; pressing does not sink them.
  const stateOf = id => page.evaluate(([id, level]) => {
    const scene = window.strataLampProbe.scene();
    if (level === "instrument") return scene.objects.find(object => object.id === id).parts.map(part => part.state);
    const lamp = document.getElementById(id).closest(".ug-lamp"), panel = window.strataLampProbe.panel().getBoundingClientRect(), bezel = lamp.querySelector(".ug-lamp__bezel").getBoundingClientRect();
    return scene.primitives.filter(entry => entry.rect && Math.abs(entry.rect[0] - (bezel.left - panel.left)) < 0.5 && Math.abs(entry.rect[1] - (bezel.top - panel.top)) < 0.5).map(entry => entry.state);
  }, [id, level]);
  const settle = () => page.evaluate(async () => { window.strataLampProbe.refresh(); await window.strataLampProbe.controller.settle(); });
  await page.mouse.move(2, 2);
  await settle();
  expect((await stateOf("mains")).every(state => !state.hover && !state.disabled)).toBe(true);
  await page.mouse.move(...centreOf(await page.locator("#mains").boundingBox()));
  await settle();
  expect((await stateOf("mains")).every(state => state.hover === true && !state.disabled), "hover").toBe(true);
  await page.mouse.down();
  await settle();
  expect((await stateOf("mains")).every(state => state.hover === true && !state.pressed && !state.disabled), "pressing does not sink it").toBe(true);
  await page.mouse.up();
  expect((await stateOf("locked")).every(state => state.disabled === true), "disabled").toBe(true);
  await healthy(page, "states", level);
  await context.close();
});

test("a momentary lamp lights its emitter while held, on the GPU, and lets go with the button", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  const strength = () => page.evaluate(async () => { window.strataLampProbe.refresh(); await new Promise(requestAnimationFrame); const scene = window.strataLampProbe.scene(); const index = [...document.querySelectorAll(".ug-lamp")].findIndex(lamp => lamp.id === "talk"); return scene.emitters[index].strength; });
  expect(await strength()).toBe(0);
  const box = await page.locator("#talk").boundingBox();
  await page.mouse.move(...centreOf(box));
  await page.mouse.down();
  expect(await strength(), "lit while pressed").toBeCloseTo(3200, 1);
  await page.mouse.up();
  expect(await strength(), "dark when released").toBe(0);
  await healthy(page, "momentary", "instrument");
  await context.close();
});

test("past 64 emitters a layer the farthest are dropped with the diagnostic, and GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  for (const level of levels) {
    const page = await context.newPage();
    await ready(page, `?level=${level}&many=70`);
    const lenses = await page.evaluate(() => document.querySelectorAll(".ug-lamp__lens").length);
    const state = await page.evaluate(() => window.strataLampProbe.state());
    const lamps = state.emitters.layers[0];
    const litCount = await page.evaluate(() => [...document.querySelectorAll(".ug-lamp__input")].filter(input => input.checked && !input.disabled).length);
    console.log(`${level}: ${lenses} lenses, ${lamps.lit} lit, ${lamps.drawn.length} drawn, ${lamps.dropped.length} dropped`);
    expect(lamps.lit).toBe(litCount);
    expect(litCount).toBeGreaterThan(64);
    expect(lamps.drawn, "the budget is 64 a layer").toHaveLength(64);
    expect(lamps.dropped.length, "the rest are dropped").toBe(litCount - 64);
    expect(state.mode).toBe("gpu");
    await healthy(page, level, level);
    await page.close();
  }
  await context.close();
});

test("under more contrast the Instrument lamps have no light and print the lit lens flat; under reduced transparency the lens is an opaque dome", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0), "every emitter is off").toBe(true);
  const sockets = await page.evaluate(() => Object.fromEntries(["mains", "standby"].map(id => [id, getComputedStyle(document.getElementById(id).closest(".ug-lamp").querySelector(".ug-lamp__socket")).backgroundColor])));
  expect(sockets.standby, "a lit lamp's socket is its lit colour, flat").not.toBe(sockets.mains);
  // A change of media changes the scene's structure here (the emitters, the lens): the layer is drawn at Relief with reason `pending`
  // (GPU on) while the successor scene builds, then as parts. Wait for it before judging. (A change of layout alone no longer steps an
  // object down: `core-scene-media-change.test.mjs`, issue 156.)
  await page.waitForFunction(() => window.strataLampProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataLampProbe.refresh());
  scene = await sceneOf(page);
  expect(scene.objects.every(object => object.parts[1].startsWith("lens:lensOpaque ")), "opaque lenses").toBe(true);
  expect(scene.objects.every(object => object.glass[1] === undefined), "no glass").toBe(true);
  expect(scene.emitters.some(emitter => emitter.strength > 0), "the lamps still give light").toBe(true);
  // A change of media changes the scene's structure here (the emitters, the lens): the layer is drawn at Relief with reason `pending`
  // (GPU on) while the successor scene builds, then as parts. Wait for it before judging. (A change of layout alone no longer steps an
  // object down: `core-scene-media-change.test.mjs`, issue 156.)
  await page.waitForFunction(() => window.strataLampProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the lamp page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-lamp.html?dom");
  await page.waitForFunction(() => window.strataLampProbe);
  const act = async () => { await page.locator("#mains").focus(); await page.keyboard.press("Space"); await page.locator("#fault").focus(); await page.keyboard.press("Space"); };
  await act();
  const dom = await page.locator("#lamp-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#lamp-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('switch "Mains" [checked]');
    expect(gpu).toContain('switch "Fault"');
    expect(gpu).toContain('button "Talk"');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#lamp-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
});

// ---- Feedback ----

/** Wraps the audio and vibration APIs, counting contexts, resumes, sources started and pulses. */
const instrument = () => {
  window.feedbackLog = { contexts: 0, resumes: 0, played: 0, pulses: [] };
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) { super(...args); window.feedbackLog.contexts++; }
    resume() { window.feedbackLog.resumes++; return super.resume(); }
    createBufferSource() {
      const source = super.createBufferSource(), start = source.start.bind(source);
      source.start = (...args) => { window.feedbackLog.played++; return start(...args); };
      return source;
    }
  };
  Object.defineProperty(Navigator.prototype, "vibrate", { configurable: true, value: pattern => { window.feedbackLog.pulses.push(pattern); return true; } });
};
async function feedbackPage(browser, query, options = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  await page.goto(`/ui-lamp.html?plain${query}`);
  await page.waitForFunction(() => window.strataLampProbe);
  return { context, page };
}
const log = page => page.evaluate(() => ({ ...window.feedbackLog, pulses: [...window.feedbackLog.pulses] }));
const click = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); };

test("feedback is off by default: real toggles and presses create no audio and pulse nothing", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "");
  for (const id of ["mains", "link", "talk"]) await click(page, id);
  await page.locator("#tuner").focus();
  await page.keyboard.press("Space");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  console.log("off by default: 4 real actions, 0 audio contexts, 0 sounds, 0 pulses");
  await context.close();
});

test("with sound on, audio waits for the first gesture on a lamp, then each toggle and each press plays its click once", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "&sound");
  expect((await log(page)).contexts, "nothing before a gesture").toBe(0);
  await page.locator("#mains").evaluate(input => input.click());
  await page.waitForTimeout(60);
  expect(await log(page), "a scripted toggle is no gesture").toMatchObject({ contexts: 0, played: 0 });
  await page.mouse.click(5, 5);
  expect((await log(page)).contexts, "a gesture elsewhere creates nothing").toBe(0);
  await click(page, "link");
  let now = await log(page);
  expect(now.contexts, "the first gesture on a lamp creates the context").toBe(1);
  expect(now.resumes).toBeGreaterThanOrEqual(1);
  expect(now.played, "its toggle plays once").toBe(1);
  await click(page, "fault");
  expect((await log(page)).played).toBe(2);
  // A momentary lamp plays as it goes down, not again as it comes up.
  const box = await page.locator("#talk").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await log(page)).played, "the press").toBe(3);
  await page.mouse.up();
  await page.waitForTimeout(60);
  now = await log(page);
  expect(now.played, "no sound on release").toBe(3);
  expect(now.contexts, "one context for all of them").toBe(1);
  // The label's press plays too, and the native event path is unchanged: one change per toggle.
  expect((await page.evaluate(() => window.strataLampProbe.events().filter(event => event.type === "change").length))).toBe(3);
  console.log(`sound on: ${now.contexts} context, ${now.played} clicks for 2 toggles and 1 press`);
  await context.close();
});

test("with haptics on a real action pulses 8 ms, a scripted one does not, reduced motion stops pulses, and muted is silent", async ({ browser }) => {
  const haptics = await feedbackPage(browser, "&haptics");
  await click(haptics.page, "link");
  expect((await log(haptics.page)).pulses, "a real toggle pulses the click's 8 ms").toEqual([8]);
  await haptics.page.locator("#mains").evaluate(input => input.click());
  expect((await log(haptics.page)).pulses, "a scripted one does not").toEqual([8]);
  await haptics.context.close();
  const reduced = await feedbackPage(browser, "&haptics", { reducedMotion: "reduce" });
  await click(reduced.page, "link");
  expect((await log(reduced.page)).pulses, "none under reduced motion").toEqual([]);
  await reduced.context.close();
  const muted = await feedbackPage(browser, "&sound&haptics&muted");
  await click(muted.page, "link");
  expect(await log(muted.page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  await muted.context.close();
});
