/**
 * Browser suite for the Select forms (anatomy page `select.md`, section 11) on `ui-select-forms.html` (`window.strataSelectProbe`): plain contract
 * markup with `@underglass/ui/css` and the plain-DOM behaviour, in a Strata panel, with `#wave` (a selector), `#preset` (a display), `#size` (flush),
 * `#many` and `#grouped` (asked as selectors, drawn as displays by the rule) and `#locked` (a disabled selector).
 * - Plain DOM: the native selects and their semantics are unchanged (the accessibility snapshot of the forms page equals the flush page's, the step buttons
 *   are not in the tree or the tab order); keys, `input` and `change` events and form data are native; no listener of ours cancels a press on a display or its
 *   keys (the native list is the browser's), and the selector takes the pointer as the RotarySelector does; the step buttons step through `selectedIndex`
 *   with one `input` and one `change`, stop at the ends and skip nothing enabled; the rule (more than eight options, an optgroup) draws a display.
 * - Touch (390 px) and 320 px: no horizontal overflow, targets of at least 24 px, a tap on a printed label and on a step button works; 200% text.
 * - Preferences: axe in light, dark, face mode, forced colours and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is the documented one; the parts change pixels only inside their native
 *   elements' boxes (lights off), the lights only within their reach; native hits are the DOM's; a change changes pixels in its control's box only, and its
 *   captures are counted; 40 held frames of a step button are 0 captures, 0 uploads and 0 hit-geometry updates at the Instrument level; the backlight keeps
 *   protected text within the guard.
 * - The accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page; flush on the GPU is the scene of before.
 * Screenshots go to the `ui-select-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-select-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];

const value = (page, id) => page.locator(`#${id}`).evaluate(select => select.value);
const events = page => page.evaluate(() => window.strataSelectProbe.events());
const clear = page => page.evaluate(() => window.strataSelectProbe.clearEvents());
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const step = (page, id, n) => page.locator(`.ug-field:has(#${id}) .ug-select-display__step[data-strata-step="${n}"]`).click();

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-select-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataSelectProbe);
  return { context, page, errors };
}

test("the native selects and their semantics are unchanged: the accessibility snapshot of every form equals the flush page's, and the step buttons are out of the tree and the tab order", async ({ browser }) => {
  const forms = await plain(browser, { reducedMotion: "reduce" });
  const flush = await plain(browser, { reducedMotion: "reduce" }, "&flush");
  const snapshot = page => page.locator("#sel-panel").ariaSnapshot();
  const formed = await snapshot(forms.page), flat = await snapshot(flush.page);
  expect(formed, "the accessibility snapshot of the selector and the displays is the flush one").toBe(flat);
  for (const name of ["Wave", "Preset", "Size", "Channel", "Sound", "Locked"]) expect(formed).toContain(`combobox "${name}"`);
  expect(await forms.page.evaluate(() => ({
    decoration: [...document.querySelectorAll(".ug-rotary__scale, .ug-rotary__skirt, .ug-rotary__legend, .ug-display__object, .ug-select-display__step")].every(element => element.getAttribute("aria-hidden") === "true"),
    steps: [...document.querySelectorAll(".ug-select-display__step")].map(button => [button.tabIndex, button.getAttribute("aria-hidden")]).every(([tab, hidden]) => tab === -1 && hidden === "true"),
    selects: ["wave", "preset", "size", "many", "grouped", "locked"].map(id => { const select = document.getElementById(id); return [select.tagName, select.name, select.labels[0]?.textContent, select.closest("[data-strata-form]")?.dataset.strataForm ?? null]; }),
  }))).toEqual({ decoration: true, steps: true, selects: [["SELECT", "wave", "Wave", "selector"], ["SELECT", "preset", "Preset", "display"], ["SELECT", "size", "Size", null], ["SELECT", "many", "Channel", "display"], ["SELECT", "grouped", "Sound", "display"], ["SELECT", "locked", "Locked", "selector"]] });
  // Tab goes from one select to the next, never to a step button.
  await forms.page.locator("#preset").focus();
  await forms.page.keyboard.press("Tab");
  expect(await forms.page.evaluate(() => document.activeElement.id), "the next tab stop after the Preset display is the Size select").toBe("size");
  await forms.page.keyboard.press("Shift+Tab");
  expect(await forms.page.evaluate(() => document.activeElement.id)).toBe("preset");
  expect(forms.errors).toEqual([]);
  await forms.context.close();
  await flush.context.close();
});

test("keys, events and form data are native in every form; the selector takes the pointer and a display does not cancel it; the buttons step through the select's own selectedIndex", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, { reducedMotion: "reduce" });
  // Keys: the native select's, one `input` and one `change` each, in the selector, the display, the rule's displays and the flush select.
  for (const [id, first, second] of [["wave", "square", "saw"], ["preset", "glass-bell", "warm-pad"], ["size", "l", "m"], ["many", "ch4", "ch3"], ["grouped", "b2", "b1"]]) {
    await page.locator(`#${id}`).focus();
    await clear(page);
    await page.keyboard.press("ArrowDown");
    expect(await value(page, id), `${id}: ArrowDown`).toBe(first);
    await page.keyboard.press("ArrowUp");
    expect(await value(page, id), `${id}: ArrowUp`).toBe(second);
    expect((await events(page)).filter(event => event.id === id).map(event => event.type), `${id}: input then change for every key`).toEqual(["input", "change", "input", "change"]);
  }
  await page.locator("#wave").focus();
  await page.keyboard.press("End");
  expect(await value(page, "wave")).toBe("square");
  await page.keyboard.press("Home");
  expect(await value(page, "wave")).toBe("sine");
  await page.keyboard.press("s");
  expect(await value(page, "wave"), "type-ahead: the next option beginning with s").toBe("saw");
  // The dial follows every change: the pointer's turn (`--strata-rotary-value`) and the selected print.
  expect(await page.evaluate(() => { const root = document.getElementById("wave").closest(".ug-rotary"); return [root.style.getPropertyValue("--strata-rotary-value"), [...root.querySelectorAll(".ug-rotary__mark")].map(mark => mark.dataset.strataSelected)]; })).toEqual(["0.6667", ["false", "false", "true", "false"]]);
  // Form data: the selects take part in a form through their names and values.
  const data = await page.evaluate(() => {
    const owner = Object.assign(document.createElement("form"), { id: "owner" });
    document.body.append(owner);
    for (const id of ["wave", "preset", "size", "many", "grouped", "locked"]) document.getElementById(id).setAttribute("form", "owner");
    return Object.fromEntries(new FormData(owner));
  });
  expect(data).toEqual({ wave: "saw", preset: "warm-pad", size: "m", many: "ch3", grouped: "b1" });
  // The native list: no listener of ours cancels a press on a display (the browser opens its list), or the keys that open it; the selector takes the pointer itself, as the RotarySelector does.
  await page.evaluate(() => { window.cancelled = []; window.addEventListener("pointerdown", event => window.cancelled.push([event.target.closest("select")?.id ?? event.target.closest("button")?.className ?? "", event.defaultPrevented])); window.addEventListener("keydown", event => { if (event.target.id === "preset" && (event.key === "ArrowDown" || event.key === "F4")) window.cancelled.push(["key " + event.key, event.defaultPrevented]); }); });
  await page.mouse.move(...centre(await page.locator("#preset").boundingBox()));
  await page.mouse.down();
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.mouse.click(...centre(await page.locator("#wave").boundingBox()));
  await page.locator("#preset").focus();
  await page.keyboard.press("Alt+ArrowDown");
  await page.keyboard.press("Escape");
  await page.keyboard.press("F4");
  await page.keyboard.press("Escape");
  const cancelled = await page.evaluate(() => window.cancelled);
  expect(cancelled.find(([name]) => name === "preset"), "a press on the display is not cancelled: the browser opens its list").toEqual(["preset", false]);
  expect(cancelled.find(([name]) => name === "wave"), "a press on the selector is the selector's own (the popup never opens from a press)").toEqual(["wave", true]);
  const keys = cancelled.filter(([name]) => name.startsWith("key"));
  expect(keys.length, "the keys that open the list were pressed").toBeGreaterThanOrEqual(2);
  expect(keys.every(([, prevented]) => prevented === false), "no key that opens the list is cancelled").toBe(true);
  // The buttons step through `selectedIndex`: next, next, back, with one `input` and one `change` each; no wrap at either end; focus lands on the select.
  await page.locator("#preset").selectOption("init");
  await clear(page);
  await step(page, "preset", -1);
  expect(await value(page, "preset"), "no wrap at the start").toBe("init");
  expect((await events(page)).filter(event => event.id === "preset"), "nothing fires where nothing changes").toEqual([]);
  await step(page, "preset", 1);
  await step(page, "preset", 1);
  expect(await value(page, "preset")).toBe("glass-bell");
  expect((await events(page)).filter(event => event.id === "preset").map(event => `${event.type}:${event.value}`)).toEqual(["input:warm-pad", "change:warm-pad", "input:glass-bell", "change:glass-bell"]);
  expect(await page.evaluate(() => document.activeElement.id), "the select takes the focus after a step, so the arrow keys carry on").toBe("preset");
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "preset")).toBe("sub-bass");
  for (let index = 0; index < 5; index++) await step(page, "preset", 1);
  expect(await value(page, "preset"), "no wrap at the end").toBe("strings");
  // A step crosses optgroups and skips a disabled option.
  await step(page, "grouped", 1);
  await step(page, "grouped", 1);
  expect(await value(page, "grouped")).toBe("b2");
  expect(await page.evaluate(() => { const select = document.getElementById("many"); select.options[3].disabled = true; select.value = "ch3"; return null; })).toBeNull();
  await step(page, "many", 1);
  expect(await value(page, "many"), "ch4 is disabled: the next enabled option").toBe("ch5");
  // A disabled select takes no step and no key, and does not submit.
  await expect(page.locator("#locked")).toBeDisabled();
  expect(await page.evaluate(() => [...document.querySelectorAll("#locked-field .ug-select-display__step")].length)).toBe(0);
  // The selector is round: a vertical drag turns it, the wheel steps it, a press on a printed label sets it, a tap on the cap steps it.
  const wave = await page.locator("#wave").boundingBox();
  const [wx, wy] = centre(wave);
  await page.locator("#wave").selectOption("sine");
  await page.mouse.move(wx, wy);
  await page.mouse.down();
  await page.mouse.move(wx, wy - 140, { steps: 10 });
  await page.mouse.up();
  expect(await value(page, "wave"), "a 140 px drag up (200 per sweep of three steps) moves two positions").toBe("saw");
  await page.mouse.move(wx, wy);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "wave"), "a wheel notch down").toBe("tri");
  const label = await page.locator(".ug-rotary", { has: page.locator("#wave") }).locator(".ug-rotary__text").filter({ hasText: /^Square$/ }).boundingBox();
  await page.mouse.click(...centre(label));
  expect(await value(page, "wave"), "a click on a printed label").toBe("square");
  expect(errors).toEqual([]);
  await context.close();
});

test("the documented rule: up to eight short options without an optgroup are a selector, anything else a display; a flush select is the key with a chevron", async ({ browser }) => {
  const { context, page } = await plain(browser);
  expect(await page.evaluate(() => ({
    roots: ["wave", "preset", "size", "many", "grouped", "locked"].map(id => document.getElementById(id).closest("[data-strata-form]")?.className ?? null),
    flush: [document.getElementById("size").className, document.getElementById("size").getAttribute("data-strata-face")],
  }))).toEqual({ roots: ["ug-rotary", "ug-display ug-display--input ug-select-display__window", null, "ug-display ug-display--input ug-select-display__window", "ug-display ug-display--input ug-select-display__window", "ug-rotary"], flush: ["ug-select", "raised"] });
  await context.close();
});

// ---- Layout, touch and preferences ----

for (const width of [390, 320]) test(`at ${width} px the forms reflow without overflow, a tap on a printed label and on a step button works, and at 200% text nothing is lost`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const measure = () => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-rotary, .ug-select-display, .ug-field, .ug-panel")].map(element => { const box = element.getBoundingClientRect(); return { id: element.id || element.className, left: box.left, right: box.right }; }),
    targets: [...document.querySelectorAll(".ug-rotary__select, .ug-display__text, .ug-select-display__step, .ug-select")].map(element => { const box = element.getBoundingClientRect(); return [element.id || element.className, box.width, box.height]; }),
    clipped: [...document.querySelectorAll(".ug-field__label")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className) }));
  let layout = await measure();
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) { expect(box.left, box.id).toBeGreaterThanOrEqual(-0.5); expect(box.right, box.id).toBeLessThanOrEqual(width + 0.5); }
  for (const [id, w, h] of layout.targets) { expect(w, `${id}: width`).toBeGreaterThanOrEqual(24); expect(h, `${id}: height`).toBeGreaterThanOrEqual(24); }
  expect(layout.clipped).toEqual([]);
  // A tap on a printed label sets the selector, a tap on a step button steps the display (touch pointer events).
  await page.locator("#wave").scrollIntoViewIfNeeded();
  const numeral = await page.locator("#wave").evaluate(select => { const roots = select.closest(".ug-rotary"), mark = [...roots.querySelectorAll(".ug-rotary__text")].find(text => /^(Sine|1)$/.test(text.textContent) || getComputedStyle(text).fontSize === "0px"); const box = (mark ?? roots.querySelector(".ug-rotary__text")).getBoundingClientRect(); return [box.left + box.width / 2, box.top + box.height / 2]; });
  await page.touchscreen.tap(...numeral);
  expect(["sine", "saw", "tri", "square"]).toContain(await value(page, "wave"));
  await page.locator("#preset").scrollIntoViewIfNeeded();
  const before = await value(page, "preset");
  const button = await page.locator('.ug-field:has(#preset) .ug-select-display__step[data-strata-step="1"]').boundingBox();
  await page.touchscreen.tap(...centre(button));
  expect(await value(page, "preset"), "a tap on the next button steps").not.toBe(before);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  layout = await measure();
  expect(layout.scrollWidth, "200% text: no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) expect(box.right, `200%: ${box.id}`).toBeLessThanOrEqual(width + 0.5);
  expect(layout.clipped).toEqual([]);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, ${layout.boxes.length} boxes inside, ${layout.targets.length} targets at least 24 px, 200% text whole`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("the forms pass axe in light, dark, face mode, forced colours and more contrast, and forced colours and more contrast draw them", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#sel-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("sel-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#sel-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("sel-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await page.evaluate(() => ({ skirt: getComputedStyle(document.querySelector(".ug-rotary__skirt")).borderTopColor, cap: getComputedStyle(document.querySelector(".ug-select-display__step .ug-push__cap")).borderTopWidth,
    bezel: getComputedStyle(document.querySelector(".ug-display__bezel")).borderTopWidth, shadow: getComputedStyle(document.querySelector(".ug-display__bezel")).boxShadow }));
  expect(forced.skirt, "the selector's skirt is drawn in a system colour").toMatch(/^rgb\(/);
  expect([forced.cap, forced.bezel, forced.shadow]).toEqual(["1px", "1px", "none"]);
  const forcedResult = await new AxeBuilder({ page }).include("#sel-panel").withTags(tags).analyze();
  expect(summary(forcedResult.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const contrast = await new AxeBuilder({ page }).include("#sel-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-select-forms.html${query}`);
  await page.waitForFunction(() => window.strataSelectProbe && window.strataSelectProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataSelectProbe.scene() !== undefined);
  await page.evaluate(() => window.strataSelectProbe.controller.settle());
  if (query.includes("level=instrument")) await built(page);
}
/** At the Instrument level: every instrument layer built (not pending), so its parts are drawn. */
const built = page => page.waitForFunction(() => {
  const instrument = window.strataSelectProbe.state()?.instrument;
  return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
}, null, { timeout: 30000 });
const mode = page => page.evaluate(() => window.strataSelectProbe.controller.state().mode);
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const layers = await page.evaluate(() => window.strataSelectProbe.state().instrument.layers);
  for (const layer of layers) {
    expect(layer.status, `${label}: ${layer.id} is drawn as parts`).toBe("ready");
    expect(layer.steppedDown, `${label}: ${layer.id}: nothing is stepped down to Relief`).toEqual([]);
  }
}
/** The `#frame` decoded, after the CSS transitions, the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    const probe = window.strataSelectProbe;
    await new Promise(resolve => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 40 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    probe.refresh(); await probe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await probe.controller.settle();
  }, wait);
  await built(page);
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, split into those inside the `allowed` boxes (frame CSS px) and outside them. */
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
/** Boxes in frame CSS px. */
const inFrame = (page, selector) => page.evaluate(selector => [...document.querySelectorAll(selector)].map(element => {
  const frame = document.getElementById("frame").getBoundingClientRect(), box = element.getBoundingClientRect();
  return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id || element.closest("button")?.className || element.className };
}), selector);
/**
 * A change confined to `box`: no pixel outside it, bar the edge pixels of other native elements' own boxes (at the Instrument level a handful of
 * pixels on the top edge of a neighbouring step button's bezel flip when another object's pose changes: counted and bounded, never outside a native box).
 */
function confined(before, after, box, natives, label) {
  const own = difference(before, after, [box]), stray = difference(before, after, [box, ...natives]);
  expect(stray.outside, `${label}: no pixel changes outside the native boxes (${JSON.stringify(stray.outsideSamples)})`).toBe(0);
  expect(own.outside, `${label}: at most 8 CSS px of edge pixels of other native boxes change (${JSON.stringify(own.outsideSamples)})`).toBeLessThanOrEqual(8 * (before.width / 640) ** 2);
  return own;
}
const grow = (box, by) => ({ ...box, x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by });
const counts = page => page.evaluate(() => window.strataSelectProbe.counts());
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
/** The scene of the panel: its version, kind, emitters, protected rects and outset, the faces, and the objects with their parts and bounds. */
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataSelectProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  return { version: scene.version, kind: scene.kind, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), bounds: object.bounds })),
    panel: [panel.left, panel.top] };
});
/** The parts' own paint hidden or shown: the rotary's skirt, the displays' objects and the buttons' objects (the caps' text stays), lights off. */
const decoration = (page, hidden) => page.evaluate(hidden => {
  for (const element of document.querySelectorAll(".ug-rotary__skirt, .ug-display__object, .ug-push__object")) element.style.visibility = hidden ? "hidden" : "";
  for (const root of document.querySelectorAll(".ug-display")) root.setAttribute("data-strata-lit", "false");
}, hidden);

for (const dpr of [1, 2]) for (const level of levels) test(`the Select forms at ${level} (DPR ${dpr}): the scene, the parts and their boxes, containment, the lights, hits, a change's pixels and captures`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // The native hits in DOM mode, over a grid on the panel (every 6 px), to compare.
  await page.goto("/ui-select-forms.html?dom");
  await page.waitForFunction(() => window.strataSelectProbe);
  const hitGrid = () => page.evaluate(() => {
    const panel = document.getElementById("sel-panel").getBoundingClientRect(), out = [];
    for (let y = panel.top + 3; y < panel.bottom - 3; y += 6) for (let x = panel.left + 3; x < panel.right - 3; x += 6) { const hit = document.elementFromPoint(x, y); const control = hit?.closest("select, button") ?? hit; out.push(hit && document.getElementById("sel-panel").contains(hit) ? `${control.tagName}.${control.className}#${control.id}` : "outside"); }
    return out;
  });
  const domHits = await hitGrid();
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version, "a version 4 scene: it has lights").toBe(4);
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // The lights: one backlight per display (up to 6 emitters along its window), the step buttons' rings (one each, unlit at rest), nothing for the selector.
  const lit = scene.emitters.filter(emitter => emitter.strength > 0).length, total = scene.emitters.length;
  expect(total, "the displays' backlights and the step buttons' rings are the scene's lights").toBeGreaterThanOrEqual(8);
  expect(lit, "the displays are backlit, the rings dark").toBeGreaterThanOrEqual(3);
  if (level === "instrument") {
    const ids = scene.objects.map(object => object.id);
    expect(ids, "the selector, the three displays and eight step buttons are objects (the disabled selector too)").toEqual(expect.arrayContaining(["wave", "locked", "preset", "many", "grouped"]));
    expect(scene.objects.find(object => object.id === "wave").parts.map(part => part.split(":")[0]), "the selector is the Knob's parts").toEqual(["skirt", "cap", "chamfer", "pointer"]);
    expect(scene.objects.filter(object => object.parts.some(part => /^bezel:displayBezel/.test(part)) && object.parts.some(part => /^window:displayGlass/.test(part))).length, "three displays: a polished bezel and a glass pane each").toBe(3);
    expect(scene.objects.filter(object => object.parts.some(part => /^plinth:key /.test(part)) && object.parts.some(part => /^lens:/.test(part))).length, "six step buttons: a bezel, a ring lens, a body and a captured cap each").toBe(6);
  } else {
    expect(scene.faces.includes("groove") || level === "objects", "the displays' bezels are grooves at Relief and slabs at Objects").toBe(true);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${total} emitters (${lit} lit), ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects (${scene.objects.map(object => object.id).join(", ")})` : ""}`);

  // The same native hits as the DOM, everywhere on the panel.
  const gpuHits = await hitGrid();
  expect(gpuHits.length).toBe(domHits.length);
  expect(domHits.filter(hit => /ug-rotary__select|ug-display__text|ug-push|ug-select\b/.test(hit)).length, "the grid reaches the controls").toBeGreaterThan(60);
  expect(gpuHits.filter((hit, index) => domHits[index] !== "outside" && hit !== domHits[index]), "native hits are the DOM's").toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${domHits.filter(hit => hit !== "outside").length} native hits on the panel, 0 differ from the DOM's`);

  // Containment: the parts' pixels (lights off) lie inside their native elements' boxes, against the same page with the parts' paint hidden.
  await ready(page, `?level=${level}`);
  const boxes = [...await inFrame(page, ".ug-rotary__select"), ...await inFrame(page, ".ug-display__text"), ...await inFrame(page, "button.ug-select-display__step"), ...await inFrame(page, "#size")];
  await decoration(page, true);
  const bare = await frame(page, `${level}-dpr${dpr}-bare`);
  await decoration(page, false);
  const shown = await frame(page, `${level}-dpr${dpr}-parts`);
  const parts = difference(shown, bare, boxes);
  expect(parts.inside, "the parts are drawn").toBeGreaterThan(2500 * dpr * dpr);
  expect(parts.outside, `no part pixel outside a native box (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: parts: ${parts.inside} px inside the native boxes, ${parts.outside} outside`);
  await healthy(page, "parts", level);

  // The lights: the backlights on against off change pixels only within the emitters' reach (the scene's outset), and the protected text keeps the guard.
  await page.evaluate(() => { for (const root of document.querySelectorAll(".ug-display")) root.setAttribute("data-strata-lit", "false"); });
  const off = await frame(page, `${level}-dpr${dpr}-light-off`);
  await page.evaluate(() => { for (const root of document.querySelectorAll(".ug-display")) root.removeAttribute("data-strata-lit"); });
  const on = await frame(page, `${level}-dpr${dpr}-light-on`);
  const reach = scene.outset.top;
  const roots = await inFrame(page, ".ug-display");
  const lights = difference(off, on, roots.map(box => grow(box, reach)));
  expect(lights.inside, "the backlights light the bezels and the face round the displays").toBeGreaterThan(300 * dpr * dpr);
  expect(lights.outside, `no light beyond the emitters' reach of ${reach} px (${JSON.stringify(lights.outsideSamples)})`).toBe(0);
  const texts = await inFrame(page, ".ug-display__text");
  let worst = 0;
  for (const box of texts) worst = Math.max(worst, excess(off, on, { x: box.x + 24, y: box.y + 14, width: box.width - 66, height: box.height - 28 }, dpr));
  console.log(`DPR ${dpr} ${level}: backlight: ${lights.inside} px within reach ${reach}, ${lights.outside} beyond; ${texts.length} text windows, worst change beyond the guard ${worst} levels`);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  const bezel = texts.map(box => median(Array.from({ length: 8 }, (_, at) => gain(off, on, { x: box.x + 24 + (at / 7) * (box.width - 48), y: box.y + 7 }, dpr))));
  if (level !== "objects") expect(median(bezel), "the bezel is lit").toBeGreaterThan(0.5);
  await healthy(page, "lights", level);

  // A change: the selector's pointer turns (its box changes, nothing else), a display's text changes (its box changes, nothing else, the backlight constant).
  await ready(page, `?level=${level}`);
  const [waveRoot] = await inFrame(page, "#wave-field .ug-rotary"), [presetRoot] = await inFrame(page, "#preset-field .ug-select-display");
  // The page's own readout says what changed: it is not what is measured.
  await page.evaluate(() => { document.getElementById("sel-read").style.visibility = "hidden"; });
  const before = await frame(page, `${level}-dpr${dpr}-value-before`);
  const again = await frame(page, `${level}-dpr${dpr}-value-again`);
  const noise = difference(before, again, []);
  console.log(`DPR ${dpr} ${level}: two settled frames differ by ${noise.outside} px ${JSON.stringify(noise.outsideSamples)}`);
  const start = await counts(page);
  await page.evaluate(() => window.strataSelectProbe.setSelect("wave", "square"));
  const turned = await frame(page, `${level}-dpr${dpr}-wave-square`);
  const afterWave = await counts(page);
  const natives = [...await inFrame(page, ".ug-rotary__select"), ...await inFrame(page, ".ug-display__text"), ...await inFrame(page, "button.ug-select-display__step"), ...await inFrame(page, "#size")];
  const waveChange = confined(before, turned, waveRoot, natives, "selector");
  expect(waveChange.inside, "the selector's pointer turned").toBeGreaterThan(40);
  await page.evaluate(() => window.strataSelectProbe.setSelect("preset", "sub-bass"));
  const typed = await frame(page, `${level}-dpr${dpr}-preset-sub-bass`);
  const afterPreset = await counts(page);
  const presetChange = confined(turned, typed, presetRoot, natives, "display");
  expect(presetChange.inside, "the display's text changed").toBeGreaterThan(100);
  console.log(`DPR ${dpr} ${level}: selector snap: ${waveChange.inside} px in its box, ${waveChange.outside} outside, ${afterWave.captures - start.captures} captures, ${afterWave.uploads - start.uploads} uploads, ${afterWave.geometryUpdates - start.geometryUpdates} hit-geometry updates; display text: ${presetChange.inside} px in its box, ${presetChange.outside} outside, ${afterPreset.captures - afterWave.captures} captures, ${afterPreset.uploads - afterWave.uploads} uploads, ${afterPreset.geometryUpdates - afterWave.geometryUpdates} hit-geometry updates`);
  expect(afterWave.geometryUpdates - start.geometryUpdates, "a change is no hit-geometry update").toBe(0);
  expect(afterPreset.geometryUpdates - afterWave.geometryUpdates, "a text change is no hit-geometry update").toBe(0);
  await healthy(page, "change", level);

  if (level === "instrument") {
    // The selector's snap is a uniform update: the pointer turns on `spring.detent` frame by frame, and only the native change is captured.
    const run = await page.evaluate(async () => {
      const probe = window.strataSelectProbe, next = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 5; index++) await next();
      const first = probe.counts();
      let extra = 0, previous = first, changes = 0, moved = 0, last = probe.scene().objects.find(object => object.id === "wave").t;
      for (let index = 0; index < 90; index++) {
        if (index % 30 === 0) { probe.setSelect("wave", ["sine", "saw", "square"][(index / 30) % 3]); changes++; }
        await next();
        const now = probe.counts(), t = probe.scene().objects.find(object => object.id === "wave").t;
        if (index % 30 > 1) extra += now.captures - previous.captures;
        if (t !== last) moved++;
        last = t; previous = now;
      }
      const end = probe.counts();
      return { changes, moved, extra, captures: end.captures - first.captures, uploads: end.uploads - first.uploads, geometryUpdates: end.geometryUpdates - first.geometryUpdates };
    });
    console.log(`DPR ${dpr} ${level}: 90 frames, ${run.changes} snaps, ${run.moved} frames turning, ${run.captures} captures (${run.extra} in turning frames), ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates`);
    expect(run.moved, "the pointer turns on most frames after a snap").toBeGreaterThan(30);
    expect(run.extra, "turning frames cause no capture").toBe(0);
    expect(run.captures, "at most one capture per native change").toBeLessThanOrEqual(run.changes);
    expect(run.geometryUpdates, "no hit-geometry update").toBe(0);
    // A step button held for 40 frames: its ring's light and its cap's throw are uniform writes.
    const button = await page.locator('.ug-field:has(#preset) .ug-select-display__step[data-strata-step="-1"]').boundingBox();
    await page.mouse.move(...centre(button));
    await page.mouse.down();
    await page.waitForTimeout(500);
    const held = await page.evaluate(async () => {
      const probe = window.strataSelectProbe, next = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 4; index++) await next();
      const first = probe.counts();
      for (let index = 0; index < 40; index++) await next();
      const last = probe.counts();
      return { captures: last.captures - first.captures, uploads: last.uploads - first.uploads, geometryUpdates: last.geometryUpdates - first.geometryUpdates };
    });
    await page.mouse.up();
    console.log(`DPR ${dpr} ${level}: step button held 40 frames: ${held.captures} captures, ${held.uploads} uploads, ${held.geometryUpdates} hit-geometry updates`);
    expect(held, "40 held frames: no capture, no upload, no hit-geometry update").toEqual({ captures: 0, uploads: 0, geometryUpdates: 0 });
    await healthy(page, "held", level);
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("a real click on a step button at every level gives fresh pixels in the display's box and the select's new value, with GPU on", async ({ browser }) => {
  test.setTimeout(300000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await page.evaluate(() => { document.getElementById("sel-read").style.visibility = "hidden"; });
    const [presetRoot] = await inFrame(page, "#preset-field .ug-select-display .ug-display"), [row] = await inFrame(page, "#preset-field .ug-select-display");
    const before = await frame(page, `${level}-click-before`);
    await page.locator('.ug-field:has(#preset) .ug-select-display__step[data-strata-step="1"]').click();
    await page.mouse.move(2, 2);
    const after = await frame(page, `${level}-click-after`);
    expect(await value(page, "preset")).toBe("glass-bell");
    // The new label is fresh pixels in the display's window; the select has the focus now (its ring is round the bezel), so the row's box and the ring's width are the room.
    const natives = [...await inFrame(page, ".ug-rotary__select"), ...await inFrame(page, ".ug-display__text"), ...await inFrame(page, "button.ug-select-display__step"), ...await inFrame(page, "#size")];
    const label = difference(before, after, [presetRoot]), changed = difference(before, after, [grow(row, 8), ...natives]);
    console.log(`${level}: a real click on next: ${label.inside} px changed in the display's box, ${changed.inside} in its row, ${changed.outside} outside`);
    expect(label.inside, "fresh pixels: the new label").toBeGreaterThan(100);
    expect(changed.outside, `nothing outside the row changes (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    await healthy(page, `click ${level}`, level);
  }
  await context.close();
});

test("the accessibility snapshot is the same in DOM and GPU modes at every level, and axe passes on the GPU page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-select-forms.html?dom");
  await page.waitForFunction(() => window.strataSelectProbe);
  const act = async () => { await page.locator("#wave").focus(); await page.keyboard.press("ArrowUp"); await step(page, "preset", 1); };
  await act();
  const dom = await page.locator("#sel-panel").ariaSnapshot();
  expect(dom).toContain('combobox "Wave"');
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    expect(await page.locator("#sel-panel").ariaSnapshot(), level).toBe(dom);
    await healthy(page, level, level);
    const { violations } = await new AxeBuilder({ page }).include("#sel-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
  await context.close();
});

test("flush on the GPU is the scene of before: no rotary or display object, no step button, GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const level of levels) {
    await ready(page, `?flush&level=${level}`);
    const scene = await sceneOf(page);
    expect(scene.emitters, `${level}: no lights: nothing here is a lamp`).toBeUndefined();
    if (level === "instrument") expect(scene.objects ?? [], "no object: a flush select is a Relief key").toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll(".ug-rotary, .ug-display, .ug-select-display, .ug-push").length)).toBe(0);
    await healthy(page, `flush ${level}`, level);
  }
  await context.close();
});
