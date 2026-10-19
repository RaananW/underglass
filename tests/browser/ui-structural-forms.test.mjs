/**
 * Browser suite for the structural forms (anatomy pages `slider.md`, `card.md`, `panel.md`, `dialog.md`, `drawer.md`, *Hardware forms* and
 * *Plate and tray forms*) on `ui-structural-forms.html` (`window.strataStructureProbe`): plain contract markup with `@underglass/ui/css` and the
 * plain-DOM behaviour, in a Strata panel (a plate), with Sliders `#sl-knob`, `#sl-fader` and `#sl-flush`, Cards `#card-plate`, `#card-tray`
 * and `#card-flush`, and a Dialog (a plate) and a Drawer (a tray) the probe opens.
 * - Plain DOM: the native controls and their semantics are unchanged (the accessibility snapshot of the forms page equals the flush page's; a range's
 *   keys, `input` and `change` events and form data are native; a knob and a fader take their behaviour from the Knob's and the Fader's); a Dialog
 *   is modal (focus, inert background, Escape, the scrim) and a Drawer closes on the scrim; `flush` is the markup and the look of before; a tray
 *   Drawer slides and a flush one moves through depth (CSS), and neither moves under reduced motion.
 * - Touch (390 px) and 320 px: no horizontal overflow, targets of at least 24 px, a tap and a touch drag set the value, the Dialog fits; 200% text.
 * - Preferences: axe in light, dark, face mode, forced colours and more contrast, with the Dialog and the Drawer open.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is the documented one (at Instrument a rim and a wall of parts
 *   bounded by their elements' boxes, no emitters); the parts and the machined materials change pixels only inside their elements' boxes; a value
 *   change changes pixels in its control's box only and is a uniform update (0 captures, 0 uploads, 0 hit-geometry updates while the spring
 *   settles); native hits are the same as in DOM mode.
 * - The Dialog's rise and the Drawer's slide on the GPU, in slow motion: the plate rises monotonically from the chassis to its resting height and
 *   back, nothing is stepped down, GPU stays on, and the rise adds no capture, upload or hit-geometry update to the flush dialog's motion; a pair
 *   of dialogs (a plate and a flush one) differ in pixels only inside their own boxes at every sampled frame; the drawer slides in from its edge.
 * - The accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page.
 * Screenshots go to the `ui-structural-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-structural-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
const probe = "window.strataStructureProbe";

const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const events = page => page.evaluate(() => window.strataStructureProbe.events());
const clear = page => page.evaluate(() => window.strataStructureProbe.clearEvents());
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-structural-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataStructureProbe);
  return { context, page, errors };
}

test("the native controls and their semantics are unchanged: the accessibility snapshot of every form equals the flush page's, and the decoration is hidden from assistive technology", async ({ browser }) => {
  const forms = await plain(browser, { reducedMotion: "reduce" });
  const flush = await plain(browser, { reducedMotion: "reduce" }, "&flush");
  const snapshot = page => page.locator("#sf-panel").ariaSnapshot();
  const formed = await snapshot(forms.page), flat = await snapshot(flush.page);
  // The tray panel's wrapper is a div: it adds no role, so the snapshot is the flush one.
  expect(formed, "the accessibility snapshot of the knob, the fader, the plates and the trays is the flush one").toBe(flat);
  expect(formed).toContain('slider "Drive"');
  expect(formed).toContain('slider "Trim"');
  expect(formed).toContain('article "Plate card"');
  expect(formed).toContain('article "Tray card"');
  expect(await forms.page.evaluate(() => ({
    scales: [...document.querySelectorAll(".ug-knob__scale, .ug-fader__scale, .ug-knob__skirt, .ug-fader__slot, .ug-fader__carriage")].every(element => element.getAttribute("aria-hidden") === "true"),
    focusable: [...document.querySelectorAll(".ug-knob__skirt, .ug-fader__carriage, .ug-knob__scale, .ug-fader__scale")].some(element => element.tabIndex >= 0),
    rootsFocusable: [...document.querySelectorAll(".ug-knob, .ug-fader")].some(element => element.tabIndex >= 0),
  }))).toEqual({ scales: true, focusable: false, rootsFocusable: false });
  // The Slider's own input is the control, in the Field: the label names it, and it is a native range.
  await expect(forms.page.getByRole("slider", { name: "Drive" })).toHaveJSProperty("type", "range");
  expect(await forms.page.evaluate(() => ["sl-knob", "sl-fader"].map(id => { const input = document.getElementById(id); return [input.tagName, input.type, input.name, input.min, input.max, input.step, input.labels[0].textContent, input.className]; })))
    .toEqual([["INPUT", "range", "sl-knob", "0", "100", "1", "Drive", "ug-knob__input"], ["INPUT", "range", "sl-fader", "-12", "12", "6", "Trim", "ug-fader__input"]]);
  expect(forms.errors).toEqual([]);
  await forms.context.close();
  await flush.context.close();
});

test("a range's keys, events and form data are native in every form, a knob is round and a fader takes the track, and a disabled one does nothing", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, { reducedMotion: "reduce" });
  // Keys: the native range's, one `input` and one `change` each (`step` 1 for the knob, 6 for the fader).
  for (const [id, step, min, max] of [["sl-knob", 1, 0, 100], ["sl-fader", 6, -12, 12], ["sl-flush", 1, 0, 100]]) {
    await page.locator(`#${id}`).focus();
    const start = await value(page, id);
    await clear(page);
    await page.keyboard.press("ArrowRight");
    expect(await value(page, id), `${id}: ArrowRight`).toBe(start + step);
    await page.keyboard.press("ArrowDown");
    expect(await value(page, id), `${id}: ArrowDown`).toBe(start);
    await page.keyboard.press("End");
    expect(await value(page, id), `${id}: End`).toBe(max);
    await page.keyboard.press("Home");
    expect(await value(page, id), `${id}: Home`).toBe(min);
    await page.keyboard.press("PageUp");
    expect(await value(page, id), `${id}: PageUp is a larger step`).toBeGreaterThan(min);
    expect((await events(page)).filter(event => event.id === id).map(event => event.type), `${id}: input then change for every key`).toEqual(Array(5).fill(["input", "change"]).flat());
    await page.keyboard.press("Home");
  }
  // Their values are what the drawing says: the knob's pointer and the fader's carriage follow `input` (`--strata-knob-value`, `--strata-fader-value`).
  await page.locator("#sl-knob").focus();
  await page.keyboard.press("End");
  await page.locator("#sl-fader").focus();
  await page.keyboard.press("End");
  expect(await page.evaluate(() => [document.querySelector("#sl-knob").closest(".ug-knob").style.getPropertyValue("--strata-knob-value"), document.querySelector("#sl-fader").closest(".ug-fader").style.getPropertyValue("--strata-fader-value"),
    document.getElementById("sl-knob").getAttribute("aria-valuetext"), document.getElementById("sl-fader").getAttribute("aria-valuetext")])).toEqual(["1", "1", "100%", "12 dB"]);
  // Form data: the inputs take part in a form through the native `form` attribute, with their names and values.
  const data = await page.evaluate(() => {
    const owner = Object.assign(document.createElement("form"), { id: "owner" });
    document.body.append(owner);
    for (const id of ["sl-knob", "sl-fader", "sl-flush"]) document.getElementById(id).setAttribute("form", "owner");
    return Object.fromEntries(new FormData(owner));
  });
  expect(data).toEqual({ "sl-knob": "100", "sl-fader": "12", "sl-flush": "0" });
  // A disabled one ignores the keys and does not take part in the form.
  expect(await page.evaluate(() => { const input = document.getElementById("sl-knob"); input.disabled = true; input.focus(); const focused = document.activeElement === input; input.disabled = false; return [focused, new FormData(Object.assign(document.createElement("form"), { id: "x" })).has("sl-knob")]; }), "a disabled input takes no focus").toEqual([false, false]);
  // The knob is round: a vertical drag turns it, the wheel steps it, a double-click resets it; the fader is a track: a press sets the value under it.
  const knob = await page.locator("#sl-knob").boundingBox();
  const [kx, ky] = centre(knob);
  await page.mouse.move(kx, ky);
  await page.mouse.down();
  await page.mouse.move(kx, ky + 100, { steps: 10 });
  await page.mouse.up();
  expect(await value(page, "sl-knob"), "a 100 px drag down is half the knob's range, from 100").toBe(50);
  await page.mouse.move(kx, ky);
  await page.mouse.wheel(0, -100);
  expect(await value(page, "sl-knob"), "a wheel notch up").toBe(51);
  await page.mouse.dblclick(kx + 60, ky);
  expect(await value(page, "sl-knob"), "a double-click returns to the initial value").toBe(40);
  const slot = await page.locator("#sl-fader").evaluate(input => { const box = input.closest(".ug-fader").querySelector(".ug-fader__slot").getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
  await page.mouse.click(slot.x + slot.width * 0.75, slot.y + slot.height / 2);
  expect(await value(page, "sl-fader"), "a press at three quarters of the slot is 6").toBe(6);
  await page.mouse.click(slot.x + 1, slot.y + slot.height / 2);
  expect(await value(page, "sl-fader"), "a press at the start of the slot is the minimum").toBe(-12);
  expect(errors).toEqual([]);
  await context.close();
});

/** The overlay: opened by the probe over the plain page. */
const openOverlay = (page, kind) => page.evaluate(kind => window.strataStructureProbe.open(kind), kind);

test("a plate Dialog is modal: focus moves in and returns, the page behind is inert, Escape closes it, the scrim does not; a tray Drawer closes on the scrim", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, { reducedMotion: "reduce" });
  await page.locator("#open-dialog").focus();
  await openOverlay(page, "dialog");
  await page.waitForFunction(() => document.activeElement?.closest("#sf-dialog"));
  expect(await page.evaluate(() => {
    const dialog = document.getElementById("sf-dialog"), scrim = dialog.previousElementSibling;
    return { form: dialog.dataset.strataForm, role: dialog.getAttribute("role"), modal: dialog.getAttribute("aria-modal"), mainInert: document.querySelector("main").inert,
      focusInDialog: dialog.contains(document.activeElement), scrim: scrim.className, within: (box => box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight)(dialog.getBoundingClientRect()) };
  })).toEqual({ form: "plate", role: "dialog", modal: "true", mainInert: true, focusInDialog: true, scrim: "ug-scrim", within: true });
  // Tab stays inside: the knob, then the buttons, then round again.
  const order = [];
  for (let step = 0; step < 6; step++) { order.push(await page.evaluate(() => document.activeElement.id)); await page.keyboard.press("Tab"); }
  // The page behind is inert, so Tab goes round the dialog (through the browser's own UI, where `activeElement` is the document, between the last and the first).
  expect(order.every(id => ["dl-knob", "sf-dialog-cancel", "sf-dialog-ok", ""].includes(id)), `Tab never leaves the dialog: ${order}`).toBe(true);
  expect(order.slice(0, 3)).toEqual(["dl-knob", "sf-dialog-cancel", "sf-dialog-ok"]);
  // A click on the scrim does not close a dialog without `closeOnScrim`; the knob in the dialog takes its keys.
  await page.mouse.click(5, 5);
  expect(await page.evaluate(() => window.strataStructureProbe.closes())).toEqual([]);
  await page.locator("#dl-knob").focus();
  await page.keyboard.press("ArrowRight");
  expect(await value(page, "dl-knob")).toBe(5);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.strataStructureProbe.overlay());
  expect(await page.evaluate(() => ({ closes: window.strataStructureProbe.closes(), inert: document.querySelector("main").inert, focus: document.activeElement.id, left: document.querySelectorAll(".ug-dialog, .ug-scrim").length })))
    .toEqual({ closes: ["escape"], inert: false, focus: "open-dialog", left: 0 });
  // A tray Drawer closes on a click on the scrim.
  await openOverlay(page, "drawer");
  await page.waitForFunction(() => document.activeElement?.closest("#sf-drawer"));
  expect(await page.evaluate(() => document.getElementById("sf-drawer").dataset.strataForm)).toBe("tray");
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => !window.strataStructureProbe.overlay());
  expect(await page.evaluate(() => window.strataStructureProbe.closes())).toEqual(["escape", "scrim"]);
  expect(errors).toEqual([]);
  await context.close();
});

test("a tray Drawer slides out of its edge and a flush one moves through depth, in CSS; neither moves under reduced motion", async ({ browser }) => {
  const names = async (query, options) => {
    const { context, page } = await plain(browser, options, query);
    await openOverlay(page, "drawer");
    await page.waitForFunction(() => document.getElementById("sf-drawer"));
    const animations = await page.evaluate(() => document.getAnimations().filter(animation => animation.animationName?.startsWith("ug-panel-")).map(animation => animation.animationName));
    const side = await page.evaluate(() => { const box = document.getElementById("sf-drawer").getBoundingClientRect(); return [box.right, innerWidth]; });
    await page.waitForFunction(() => !document.getElementById("sf-drawer").dataset.strataMotion);
    await context.close();
    return { animations, rest: side };
  };
  expect((await names("")).animations, "a tray slides").toEqual(["ug-panel-slide-enter"]);
  expect((await names("&flush")).animations, "a flush drawer moves through depth, as before").toEqual(["ug-panel-enter"]);
  expect((await names("", { reducedMotion: "reduce" })).animations, "nothing moves under reduced motion").toEqual([]);
  // The slide starts a whole width off the edge it comes from (translate −100% of itself on the end side) and ends at rest.
  const { context, page } = await plain(browser, { viewport: { width: 900, height: 700 } });
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-motion-slow", "2000ms"));
  await openOverlay(page, "drawer");
  await page.waitForFunction(() => document.getElementById("sf-drawer"));
  const early = await page.evaluate(() => { const box = document.getElementById("sf-drawer").getBoundingClientRect(); return { left: box.left, width: box.width, opacity: Number(getComputedStyle(document.getElementById("sf-drawer")).opacity) }; });
  const edge = await page.evaluate(() => document.documentElement.clientWidth);
  expect(early.left, "early in the slide the drawer is mostly beyond the end edge").toBeGreaterThan(edge - early.width * 0.4);
  await page.waitForFunction(() => !document.getElementById("sf-drawer").dataset.strataMotion, null, { timeout: 8000 });
  expect(await page.evaluate(() => Math.round(document.getElementById("sf-drawer").getBoundingClientRect().right))).toBe(edge);
  await context.close();
});

test("flush is the markup and the look of before: no form, no tray wrapper, the card's body is not a well, and the sliders are the groove slider", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, {}, "&flush");
  expect(await page.evaluate(() => ({
    forms: document.querySelectorAll("[data-strata-form]").length, trays: document.querySelectorAll(".ug-panel__tray, .ug-card__body[data-strata-face='well']").length,
    knobs: document.querySelectorAll(".ug-knob, .ug-fader").length, sliders: [...document.querySelectorAll(".ug-slider")].map(input => input.getAttribute("data-strata-face")),
    cards: [...document.querySelectorAll(".ug-card")].map(card => card.getAttribute("data-strata-face")),
  }))).toEqual({ forms: 0, trays: 0, knobs: 0, sliders: ["groove", "groove", "groove"], cards: ["raised", "raised", "raised"] });
  await page.locator("#sl-flush").focus();
  await page.keyboard.press("ArrowRight");
  expect(await value(page, "sl-flush")).toBe(61);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/plain-flush.png` });
  expect(errors).toEqual([]);
  await context.close();
});

for (const width of [390, 320]) test(`at ${width} px the forms reflow without overflow, a tap and a touch drag set the value, the Dialog and the Drawer fit, and at 200% text nothing is lost`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const measure = () => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-knob, .ug-fader, .ug-card, .ug-panel, .ug-field")].map(element => { const box = element.getBoundingClientRect(); return { id: element.id || element.className, left: box.left, right: box.right }; }),
    targets: [...document.querySelectorAll(".ug-knob__input, .ug-fader__input")].map(input => { const box = input.getBoundingClientRect(); return [input.id, box.width, box.height]; }),
    clipped: [...document.querySelectorAll(".ug-card__title, .ug-field__label, .ug-card__body")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className) }));
  let layout = await measure();
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) { expect(box.left, box.id).toBeGreaterThanOrEqual(0); expect(box.right, box.id).toBeLessThanOrEqual(width + 0.5); }
  for (const [id, w, h] of layout.targets) { expect(w, `${id}: width`).toBeGreaterThanOrEqual(24); expect(h, `${id}: height`).toBeGreaterThanOrEqual(24); }
  expect(layout.clipped).toEqual([]);
  // A tap on a knob's numeral sets its value, a touch drag on the fader sets its value (touch pointer events).
  const numeral = await page.locator("#sl-knob").evaluate(input => { const mark = [...input.closest(".ug-knob").querySelectorAll(".ug-knob__mark")].find(mark => mark.textContent === "60").getBoundingClientRect(); return [mark.left + mark.width / 2, mark.top + mark.height / 2]; });
  await page.touchscreen.tap(...numeral);
  expect(await value(page, "sl-knob"), "a tap on 60").toBe(60);
  await page.locator("#sl-fader").scrollIntoViewIfNeeded();
  const slot = await page.locator("#sl-fader").evaluate(input => { const box = input.closest(".ug-fader").querySelector(".ug-fader__slot").getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
  await page.touchscreen.tap(slot.x + slot.width * 0.75, slot.y + slot.height / 2);
  expect(await value(page, "sl-fader"), "a tap at three quarters of the slot").toBe(6);
  // The Dialog and the Drawer fit the viewport.
  for (const kind of ["dialog", "drawer"]) {
    await openOverlay(page, kind);
    await page.waitForFunction(kind => document.activeElement?.closest(`#sf-${kind}`), kind);
    expect(await page.evaluate(kind => { const box = document.getElementById(`sf-${kind}`).getBoundingClientRect(); return { left: box.left >= -0.5, right: box.right <= innerWidth + 0.5, top: box.top >= -0.5, bottom: box.bottom <= innerHeight + 0.5, scroll: document.documentElement.scrollWidth <= innerWidth }; }, kind), `${kind} fits at ${width}`)
      .toEqual({ left: true, right: true, top: true, bottom: true, scroll: true });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !window.strataStructureProbe.overlay());
  }
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
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, ${layout.boxes.length} boxes inside, 200% text whole`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("the forms pass axe in light, dark, face mode, forced colours and more contrast, with the Dialog and the Drawer open, and forced colours and more contrast draw them", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#sf-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("sf-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#sf-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("sf-panel").removeAttribute("data-strata-mode"); });
    for (const kind of ["dialog", "drawer"]) {
      await openOverlay(page, kind);
      await page.waitForFunction(kind => document.activeElement?.closest(`#sf-${kind}`), kind);
      const open = await new AxeBuilder({ page }).include(`#sf-${kind}`).withTags(tags).analyze();
      expect(summary(open.violations), `axe, ${theme}, the ${kind}`).toEqual([]);
      await page.keyboard.press("Escape");
      if (kind === "drawer") await page.mouse.click(5, 5);
      await page.waitForFunction(() => !window.strataStructureProbe.overlay());
    }
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await page.evaluate(() => ({ tray: getComputedStyle(document.querySelector("#card-tray .ug-card__body")).borderTopColor, card: getComputedStyle(document.getElementById("card-plate")).borderTopColor,
    trayWidth: getComputedStyle(document.querySelector("#card-tray .ug-card__body")).borderTopWidth, shadow: getComputedStyle(document.getElementById("card-plate")).boxShadow, carriage: getComputedStyle(document.querySelector(".ug-fader__carriage")).borderTopColor }));
  expect(forced.tray, "the tray's wall is drawn in a system colour").toMatch(/^rgb\(/);
  expect(forced.trayWidth).toBe("1px");
  expect(forced.shadow, "no shadow").toBe("none");
  const forcedResult = await new AxeBuilder({ page }).include("#sf-panel").withTags(tags).analyze();
  expect(summary(forcedResult.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const contrast = await new AxeBuilder({ page }).include("#sf-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-structural-forms.html${query}`);
  await page.waitForFunction(() => window.strataStructureProbe && window.strataStructureProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataStructureProbe.scene() !== undefined);
  await page.evaluate(() => window.strataStructureProbe.controller.settle());
  if (query.includes("level=instrument")) await built(page);
}
/** At the Instrument level: every instrument layer built (not pending), so its parts are drawn. */
const built = page => page.waitForFunction(() => {
  const instrument = window.strataStructureProbe.state()?.instrument;
  return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
}, null, { timeout: 30000 });
const mode = page => page.evaluate(() => window.strataStructureProbe.controller.state().mode);
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const layers = await page.evaluate(() => window.strataStructureProbe.state().instrument.layers);
  for (const layer of layers) {
    expect(layer.status, `${label}: ${layer.id} is drawn as parts`).toBe("ready");
    expect(layer.steppedDown, `${label}: ${layer.id}: nothing is stepped down to Relief`).toEqual([]);
  }
}
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150 } = {}) {
  await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataStructureProbe.refresh(); await window.strataStructureProbe.controller.settle();
  }, wait);
  await built(page);
  await page.waitForFunction(() => {
    const probe = window.strataStructureProbe;
    probe.refresh();
    return (probe.scene()?.objects ?? []).filter(object => /^sl-/.test(object.id)).every(object => {
      const input = document.getElementById(object.id);
      return Math.abs(object.t - (input.value - input.min) / (input.max - input.min)) < 1e-6;
    });
  });
  await page.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); await window.strataStructureProbe.controller.settle(); });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, split into those inside the `allowed` boxes (frame CSS px) and outside them. */
function difference(a, b, allowed) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(box => px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height)) inside++;
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples };
}
/** Boxes in frame CSS px. */
const inFrame = (page, selector) => page.evaluate(selector => [...document.querySelectorAll(selector)].map(element => {
  const frame = document.getElementById("frame").getBoundingClientRect(), box = element.getBoundingClientRect();
  return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
}), selector);
const counts = page => page.evaluate(() => window.strataStructureProbe.counts());
/** The scene of a layer: its version, kind, objects with parts and bounds, and the primitives' faces. */
const sceneOf = (page, selector = "#sf-panel") => page.evaluate(selector => {
  const probe = window.strataStructureProbe, element = document.querySelector(selector), scene = probe.scene(element), panel = element.getBoundingClientRect();
  const rel = other => { const box = other.getBoundingClientRect(); return [box.left - panel.left, box.top - panel.top, box.width, box.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), materials: scene.primitives.map(entry => entry.material), heights: scene.primitives.map(entry => entry.height),
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), bounds: object.bounds, caster: object.parts.map(part => part.caster), pose: object.parts.map(part => part.pose) })),
    boxes: Object.fromEntries([...element.querySelectorAll("[id]")].map(other => [other.id, rel(other)])), whole: [0, 0, element.offsetWidth, element.offsetHeight] };
}, selector);

for (const dpr of [1, 2]) for (const level of levels) test(`the forms at ${level} (DPR ${dpr}): the scene, the parts and their boxes, containment, a value's pixels as a uniform update, and the same hits as the DOM`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // The hits in DOM mode, over a grid on the panel (every 6 px), to compare.
  await page.goto("/ui-structural-forms.html?dom");
  await page.waitForFunction(() => window.strataStructureProbe);
  const hitGrid = () => page.evaluate(() => {
    const panel = document.getElementById("sf-panel").getBoundingClientRect(), out = [];
    for (let y = panel.top + 3; y < panel.bottom - 3; y += 6) for (let x = panel.left + 3; x < panel.right - 3; x += 6) { const hit = document.elementFromPoint(x, y); out.push(hit && document.getElementById("sf-panel").contains(hit) ? `${hit.tagName}.${hit.className}#${hit.id}` : "outside"); }
    return out;
  });
  const domHits = await hitGrid();
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version).toBe(level === "relief" ? 1 : level === "objects" ? 2 : 4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  expect(scene.emitters, "no emitters: nothing here is a light").toBeUndefined();
  // The machined materials: the plate panel, the plate card and the Drawer's tray take the plate role (satin without a character); a tray's body is a well.
  expect(scene.materials[0], "the plate panel is machined").toBe("satin");
  const wells = scene.faces.filter(face => face === "well" || face === "bezel").length;
  if (level === "instrument") {
    expect(scene.objects.map(object => object.id)).toEqual(expect.arrayContaining(["sl-knob", "sl-fader", "sf-panel", "card-plate"]));
    const rims = scene.objects.filter(object => object.parts.length === 1 && /^(plate|bezel):/.test(object.parts[0]));
    expect(rims.map(object => [object.id, object.parts[0]]), "a rim for the panel and the plate card, a wall for the tray's body").toEqual([["sf-panel", "plate:plateEdge"], ["card-plate", "plate:plateEdge"], [rims[2].id, "bezel:trayWall"]]);
    for (const rim of rims) {
      expect(rim.t).toBe(1);
      expect(rim.caster, `${rim.id}: no face caster`).toEqual([null]);
      expect(rim.pose, `${rim.id}: fixed at its resting height`).toEqual([undefined]);
    }
    const box = id => id === "sf-panel" ? scene.whole : scene.boxes[id];
    for (const rim of rims.slice(0, 2)) expect(rim.bounds.rect.map(round2), `${rim.id}: bounded by its element's box`).toEqual(box(rim.id).map(round2));
    const tray = rims[2], body = scene.boxes["card-tray"];
    expect(tray.bounds.rect[0] >= body[0] && tray.bounds.rect[2] <= body[2], "the wall is bounded by the tray body, inside the card").toBe(true);
    // The knob and the fader are the Knob's and the Fader's parts, on the Slider's own input.
    expect(scene.objects.find(object => object.id === "sl-knob").parts).toEqual(["skirt:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "pointer:knobInk"]);
    expect(scene.objects.find(object => object.id === "sl-fader").parts).toEqual(["carriage:faderCap", "chamfer:faderChamfer", "cap:faderCap", "grip:faderInk"]);
    expect(scene.faces.filter(face => face === "knob" || face === "ring"), "only the groove slider's puck is a dome: the knob and the fader are parts").toEqual(["knob"]);
    expect(wells, "the tray's body is the well of the face").toBeGreaterThanOrEqual(1);
  } else {
    expect(wells, "the tray card's body is a well (with a bezel ring at Objects)").toBeGreaterThanOrEqual(1);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.faces.length} primitives${scene.objects ? `, ${scene.objects.length} objects (${scene.objects.map(object => object.id).join(", ")})` : ""}`);

  // The same native hits as the DOM, everywhere on the panel.
  const gpuHits = await hitGrid();
  expect(gpuHits.length).toBe(domHits.length);
  expect(domHits.filter(hit => hit.includes("ug-knob__input") || hit.includes("ug-fader__input") || hit.includes("ug-card")).length, "the grid reaches the controls").toBeGreaterThan(60);
  expect(gpuHits.filter((hit, index) => domHits[index] !== "outside" && hit !== domHits[index]), "native hits are the DOM's").toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${domHits.filter(hit => hit !== "outside").length} native hits on the panel, 0 differ from the DOM's`);

  // Containment: the cards' forms (the plate's rim and material, the tray's wall and body) change pixels only inside their cards (`?panel=flush`, so the
  // panel's own plate does not mask a leak): against the same page with the cards' forms taken away, nothing outside the plate card's box and the tray's body changes.
  await ready(page, `?level=${level}&panel=flush`);
  const boxes = [...await inFrame(page, "#card-plate"), ...await inFrame(page, "#card-tray .ug-card__body")];
  const formed = await frame(page, `${level}-dpr${dpr}-cards-formed`);
  await page.evaluate(() => { for (const element of document.querySelectorAll(".ug-card[data-strata-form]")) element.removeAttribute("data-strata-form"); });
  const bare = await frame(page, `${level}-dpr${dpr}-cards-bare`);
  const drawn = difference(formed, bare, boxes);
  expect(drawn.inside, "the plate and the tray are drawn").toBeGreaterThan(1500 * dpr * dpr);
  expect(drawn.outside, `no pixel of the cards' forms outside their boxes (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: cards' forms: ${drawn.inside} px inside the plate card and the tray's body, ${drawn.outside} outside`);
  await healthy(page, "cards", level);

  // The panel's plate: against a flush panel, nothing outside the panel's own box changes (its rim and material stay inside it, its shadow is the slab's).
  await ready(page, `?level=${level}`);
  const platePanel = await frame(page, `${level}-dpr${dpr}-panel-plate`);
  await ready(page, `?level=${level}&panel=flush`);
  const flushPanel = await frame(page, `${level}-dpr${dpr}-panel-flush`);
  const panelBox = await inFrame(page, "#sf-panel");
  const panelDiff = difference(platePanel, flushPanel, panelBox);
  expect(panelDiff.inside, "the panel's plate is drawn").toBeGreaterThan(300 * dpr * dpr);
  expect(panelDiff.outside, `nothing outside the panel's box changes (${JSON.stringify(panelDiff.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: panel's plate: ${panelDiff.inside} px inside the panel, ${panelDiff.outside} outside`);

  // A value change: the knob's box changes (the pointer turns), nothing else; for the fader the carriage slides. Then the springs settle with no capture,
  // upload or hit-geometry update.
  await ready(page, `?level=${level}`);
  await page.evaluate(() => { document.getElementById("sl-knob").focus(); });
  const [knobBox] = await inFrame(page, "#sl-knob"), [faderBox] = await inFrame(page, "#sl-fader");
  const knobRoot = (await inFrame(page, "#sl-knob-field .ug-knob"))[0], faderRoot = (await inFrame(page, "#sl-fader-field .ug-fader"))[0];
  const before = await frame(page, `${level}-dpr${dpr}-value-40`);
  await page.evaluate(() => window.strataStructureProbe.setSlider("sl-knob", 70));
  const turned = await frame(page, `${level}-dpr${dpr}-value-70`);
  const knobChange = difference(before, turned, [knobRoot]);
  expect(knobChange.inside, "the knob's pointer turned").toBeGreaterThan(20);
  expect(knobChange.outside, `no pixel changes outside the knob (${JSON.stringify(knobChange.outsideSamples)})`).toBe(0);
  await page.evaluate(() => window.strataStructureProbe.setSlider("sl-fader", 12));
  const slid = await frame(page, `${level}-dpr${dpr}-fader-12`);
  const faderChange = difference(turned, slid, [faderRoot]);
  expect(faderChange.inside, "the fader's carriage slid").toBeGreaterThan(100);
  expect(faderChange.outside, `no pixel changes outside the fader (${JSON.stringify(faderChange.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: knob 40 to 70: ${knobChange.inside} px in its box, ${knobChange.outside} outside; fader 0 to 12: ${faderChange.inside} px in its box, ${faderChange.outside} outside`);
  void knobBox; void faderBox;
  await healthy(page, "value", level);
  if (level === "instrument") {
    // A uniform update: a native change is captured by core in its frame or the next; the frames the springs then turn the pointer and slide the carriage
    // in add no capture, upload or hit-geometry update (the Knob's and the Fader's own measure).
    await page.evaluate(() => { document.getElementById("sl-flush").style.visibility = "hidden"; });
    await frame(page, `${level}-dpr${dpr}-quiet`);
    const run = await page.evaluate(async () => {
      const probe = window.strataStructureProbe, next = () => new Promise(requestAnimationFrame), knob = document.getElementById("sl-knob"), fader = document.getElementById("sl-fader");
      for (let index = 0; index < 5; index++) await next();
      const start = probe.counts();
      let previous = start, extra = 0, moved = 0, changes = 0, last = probe.scene().objects.filter(object => /^sl-/.test(object.id)).map(object => object.t);
      const lateCaptures = [];
      for (let index = 0; index < 120; index++) {
        if (index % 30 === 0) {
          knob.value = String(index % 60 === 0 ? 95 : 5); knob.dispatchEvent(new Event("input", { bubbles: true }));
          fader.value = String(index % 60 === 0 ? -12 : 12); fader.dispatchEvent(new Event("input", { bubbles: true }));
          changes += 2;
        }
        await next();
        const now = probe.counts(), ts = probe.scene().objects.filter(object => /^sl-/.test(object.id)).map(object => object.t);
        if (index % 30 > 1) { extra += now.captures - previous.captures; if (now.captures !== previous.captures) lateCaptures.push(index % 30); }
        if (ts.some((value, at) => value !== last[at])) moved++;
        last = ts; previous = now;
      }
      const end = probe.counts();
      return { frames: 120, changes, moved, extra, lateCaptures, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
    });
    console.log(`DPR ${dpr} ${level}: 120 frames, ${run.changes} native changes, ${run.moved} frames turning or sliding, ${run.captures} captures (${run.extra} in turning frames ${JSON.stringify(run.lateCaptures)}), ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates`);
    expect(run.mode).toBe("gpu");
    expect(run.moved, "the pointer and the carriage move on most frames").toBeGreaterThan(60);
    expect(run.extra, "turning frames cause no capture").toBe(0);
    expect(run.captures, "at most one capture per native change").toBeLessThanOrEqual(run.changes);
    expect(run.geometryUpdates, "no hit-geometry update").toBe(0);
  }
  expect(errors).toEqual([]);
  await context.close();
});
const round2 = value => Math.round(value * 100) / 100;

test("the accessibility snapshot is the same in DOM and GPU modes at every level, and axe passes on the GPU page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-structural-forms.html?dom");
  await page.waitForFunction(() => window.strataStructureProbe);
  const act = async () => { await page.locator("#sl-knob").focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.locator("#sl-fader").focus(); await page.keyboard.press("ArrowDown"); };
  await act();
  const dom = await page.locator("#sf-panel").ariaSnapshot();
  expect(dom).toContain('slider "Drive"');
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    expect(await page.locator("#sf-panel").ariaSnapshot(), level).toBe(dom);
    await healthy(page, level, level);
    const { violations } = await new AxeBuilder({ page }).include("#sf-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
  await context.close();
});

test("flush on the GPU is the scene of before: no rim, no wall, no machined material, a groove slider's rail and puck, GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const level of levels) {
    await ready(page, `?flush&level=${level}`);
    const scene = await sceneOf(page);
    expect(scene.materials[0], `${level}: not machined`).toBe("matte");
    if (level === "instrument") {
      expect(scene.objects.filter(object => /^(plate|bezel):/.test(object.parts[0] ?? "")), "no rim, no wall").toEqual([]);
      expect(scene.objects.map(object => object.parts.map(part => part.split(":")[0]).join("+")).every(parts => /^plinth\+cap$/.test(parts)), "only the buttons are objects").toBe(true);
    }
    expect(scene.faces.filter(face => face === "well" || face === "bezel").length, `${level}: no tray well`).toBe(0);
    await healthy(page, `flush ${level}`, level);
  }
  await context.close();
});

// ---- Motion on the GPU: the Dialog's rise and the Drawer's slide, in slow motion ----

const SLOW = 2400;
/** The layer's state and scene every animation frame for `duration` ms: what the motion does to the overlay `id` (and what the counters say). */
const sample = (page, id, duration) => page.evaluate(async ([id, duration]) => {
  const probe = window.strataStructureProbe, next = () => new Promise(requestAnimationFrame), out = [], begin = performance.now();
  while (performance.now() - begin < duration) {
    await next();
    const state = probe.state(), layer = state.layers?.find(entry => entry.id === id), element = document.getElementById(id);
    const object = element && probe.scene(element)?.objects?.find(entry => entry.id === id), instrument = state.instrument?.layers?.find(entry => entry.id === id);
    out.push({ at: Math.round(performance.now() - begin), t: object?.t, opacity: layer?.transform?.opacity, x: layer?.transform?.x ?? 0, y: layer?.transform?.y ?? 0, scale: layer?.transform?.scaleX, mode: state.mode,
      status: instrument?.status, stepped: instrument?.steppedDown?.length ?? 0, reasons: [...new Set((instrument?.steppedDown ?? []).map(entry => entry.reason))], warnings: instrument?.warnings?.length ?? 0, builds: state.instrument?.compile?.builds ?? 0, inert: element?.inert, motion: element?.dataset.strataMotion ?? null,
      captures: state.metrics.captures, uploads: state.metrics.uploads, geometryUpdates: state.metrics.geometryUpdates });
  }
  return out;
}, [id, duration]);
/**
 * What an Instrument layer does over a motion: the only thing ever stepped down is an object still `pending` (a new layer's parts appear when its first build
 * has finished, about 0.2 s after it is enrolled, as every Instrument layer's do), there is no warning, and once it is `ready` it stays ready with no
 * further build: the rise and the slide are uniform updates, not rebuilds.
 */
/** Closing: the layer is already built, so it stays so: nothing but a pending rebuild is ever stepped down, no warning, and almost every frame is ready. */
function expectBuiltClosing(samples, label) {
  expect(samples.every(entry => entry.warnings === 0 && entry.reasons.every(reason => reason === "pending")), `${label}: nothing stepped down but pending parts, no warning`).toBe(true);
  expect(samples.filter(entry => entry.status === "ready").length / Math.max(1, samples.length), `${label}: ready on at least 85% of the frames`).toBeGreaterThanOrEqual(0.85);
}
function expectBuiltOnce(samples, label) {
  expect(samples.every(entry => entry.warnings === 0 && entry.reasons.every(reason => reason === "pending")), `${label}: nothing stepped down but pending parts, no warning`).toBe(true);
  const first = samples.findIndex(entry => entry.status === "ready");
  expect(first, `${label}: the layer is built`).toBeGreaterThanOrEqual(0);
  const later = samples.slice(first);
  // A layer that moves reports its boxes with float noise (1e-4 px) and a Dialog's depth entry really changes the zoom by 1.5%: a rounded size can cross
  // its step once or twice (the knob's and the keys' profiles are quantised to a half and a quarter px), so a build or two after the first is allowed;
  // a rebuild every frame (what an unquantised profile does) is not.
  const builds = later.at(-1).builds - later[0].builds;
  expect(builds, `${label}: at most two builds after the first (${builds})`).toBeLessThanOrEqual(2);
  expect(later.filter(entry => entry.status === "ready").length / later.length, `${label}: ready on at least 85% of the frames after the first build`).toBeGreaterThanOrEqual(0.85);
  return first;
}
const monotone = (values, direction) => values.every((value, index) => index === 0 || (direction > 0 ? value >= values[index - 1] - 1e-9 : value <= values[index - 1] + 1e-9));
const delta = (a, b) => ({ captures: b.captures - a.captures, uploads: b.uploads - a.uploads, geometryUpdates: b.geometryUpdates - a.geometryUpdates });

for (const dpr of [1, 2]) for (const level of levels) test(`a plate Dialog opens and closes on the GPU at ${level} (DPR ${dpr}): it rises out of the chassis and goes back, GPU stays on, nothing is stepped down, and the rise adds nothing to the flush dialog's captures`, async ({ browser }) => {
  test.setTimeout(300000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const results = {};
  for (const [name, query] of [["plate", ""], ["flush", "&flush"]]) {
    await ready(page, `?level=${level}${query}`);
    await page.evaluate(ms => document.documentElement.style.setProperty("--strata-motion-slow", `${ms}ms`), SLOW);
    await frame(page, `${level}-dpr${dpr}-${name}-dialog-closed`);
    const start = await counts(page);
    await page.evaluate(() => window.strataStructureProbe.open("dialog"));
    const opening = await sample(page, "sf-dialog", SLOW + 700);
    const opened = await counts(page);
    // Opening: opacity and the scene's rise go up together, the layer settles at scale 1.
    expect(opening.every(entry => entry.mode === "gpu"), `${name}: GPU stays on while opening`).toBe(true);
    expect(monotone(opening.map(entry => entry.opacity ?? 0), 1), `${name}: opacity rises`).toBe(true);
    expect(opening.at(-1).opacity).toBe(1);
    expect(opening.at(-1).motion, `${name}: the motion has ended`).toBeNull();
    expect(opening.at(-1).inert, `${name}: and the dialog takes input again`).toBe(false);
    expect(opening.some(entry => entry.inert === true), `${name}: it is inert while it moves`).toBe(true);
    expect(opening.filter(entry => entry.opacity > 0 && entry.opacity < 1).length, `${name}: the motion is sampled in flight`).toBeGreaterThan(30);
    if (level === "instrument") {
      const built = expectBuiltOnce(opening.filter(entry => entry.status !== undefined), `${name} opening`);
      console.log(`DPR ${dpr} ${level}: ${name}: parts built after ${opening.filter(entry => entry.status !== undefined)[built].at} ms`);
      if (name === "plate") {
        const rise = opening.filter(entry => entry.t !== undefined).map(entry => entry.t);
        expect(rise.length, "the scene carries the rise on every frame").toBeGreaterThan(100);
        expect(monotone(rise, 1), "the plate rises monotonically").toBe(true);
        expect(rise[0], "from the chassis").toBeLessThan(0.1);
        expect(rise.at(-1), "to its resting height").toBe(1);
        expect(new Set(rise.map(value => Math.round(value * 20))).size, "through at least ten steps").toBeGreaterThanOrEqual(10);
      }
    }
    // At rest: native hits land on the drawn buttons and a real click works.
    const rest = await page.evaluate(() => ["sf-dialog-cancel", "sf-dialog-ok"].map(id => { const box = document.getElementById(id).getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest("button")?.id ?? null; }));
    expect(rest, `${name}: hits at rest land on the buttons`).toEqual(["sf-dialog-cancel", "sf-dialog-ok"]);
    await frame(page, `${level}-dpr${dpr}-${name}-dialog-open`, { wait: 300 });
    // Closing: the rise goes back and the layer fades; the layer is let go before it hides.
    await page.evaluate(() => window.strataStructureProbe.beginClose());
    const closing = await sample(page, "sf-dialog", SLOW + 700);
    await page.evaluate(() => window.strataStructureProbe.closed());
    const closed = await counts(page);
    expect(closing.every(entry => entry.mode === "gpu"), `${name}: GPU stays on while closing`).toBe(true);
    expect(monotone(closing.filter(entry => entry.opacity !== undefined).map(entry => entry.opacity), -1), `${name}: opacity falls`).toBe(true);
    if (level === "instrument") {
      expectBuiltClosing(closing.filter(entry => entry.status !== undefined), `${name} dialog closing`);
      if (name === "plate") {
        const rise = closing.filter(entry => entry.t !== undefined).map(entry => entry.t);
        expect(monotone(rise, -1), "the plate goes back into the chassis monotonically").toBe(true);
        expect(rise[0], "from its resting height").toBeGreaterThan(0.9);
        expect(rise.at(-1), "down to the chassis").toBeLessThan(0.1);
      }
    }
    await healthy(page, `${name} closed`, level);
    results[name] = { open: delta(start, opened), whole: delta(start, closed), frames: opening.length };
  }
  // The rise is a uniform update: the plate dialog's captures, uploads and hit-geometry updates are the flush dialog's, within the frames' jitter.
  console.log(`DPR ${dpr} ${level}: open ${JSON.stringify(results.plate.open)} plate vs ${JSON.stringify(results.flush.open)} flush (${results.plate.frames} and ${results.flush.frames} frames); open and close ${JSON.stringify(results.plate.whole)} vs ${JSON.stringify(results.flush.whole)}`);
  // The dialog's depth entry recaptures its layer every frame today (about two captures a frame, flush or plate alike): the rise adds none of its own, so the
  // counts are the flush dialog's within the frames' jitter (a few percent, the frames the motion took).
  const within = (a, b) => Math.abs(a - b) <= 0.04 * b + 4;
  expect(within(results.plate.open.captures, results.flush.open.captures), `captures: plate ${results.plate.open.captures}, flush ${results.flush.open.captures}`).toBe(true);
  expect(within(results.plate.open.uploads, results.flush.open.uploads), `uploads: plate ${results.plate.open.uploads}, flush ${results.flush.open.uploads}`).toBe(true);
  expect(within(results.plate.open.geometryUpdates, results.flush.open.geometryUpdates), `hit-geometry updates: plate ${results.plate.open.geometryUpdates}, flush ${results.flush.open.geometryUpdates}`).toBe(true);
  expect(within(results.plate.whole.captures, results.flush.whole.captures), `open and close: plate ${results.plate.whole.captures}, flush ${results.flush.whole.captures}`).toBe(true);
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`two Dialogs, a plate and a flush one, move together at the Instrument level (DPR ${dpr}): they differ in pixels only inside the plate's own box at every sampled frame of the rise`, async ({ browser }) => {
  test.setTimeout(400000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await ready(page, "?level=instrument&bare");
  // 20 s: the two dialogs are opened in one task but their transitions start a frame or so apart, which is a visible difference over a 2 s motion and none over 20.
  await page.evaluate(ms => document.documentElement.style.setProperty("--strata-motion-slow", `${ms}ms`), 20000);
  await page.mouse.move(2, 2);
  const results = [];
  const riseOf = () => page.evaluate(() => window.strataStructureProbe.scene(document.getElementById("pair-plate"))?.objects?.find(object => object.id === "pair-plate")?.t);
  const shot = async (name, phase) => {
    const before = await riseOf();
    const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
    const after = await riseOf();
    const box = (await inFrame(page, "#pair-plate"))[0], other = (await inFrame(page, "#pair-flush"))[0];
    // The left dialog against the right one, 320 px over: a pixel of the left half (clear of the shadows' overlap) against the same pixel of the right half.
    const ratio = png.width / 640, shift = 320 * ratio;
    let inside = 0, outside = 0;
    const samples = [];
    // Rows down to 650 px: the stage's small panel (`?bare`) sits below, and its shadow reaches 65 px up.
    for (let y = 0; y < Math.round(650 * ratio); y++) for (let x = 0; x < Math.round(280 * ratio); x++) {
      const a = (y * png.width + x) * 4, b = (y * png.width + x + shift) * 4;
      if (Math.abs(png.data[a] - png.data[b]) + Math.abs(png.data[a + 1] - png.data[b + 1]) + Math.abs(png.data[a + 2] - png.data[b + 2]) < 6) continue;
      const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
      if (px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height) inside++;
      else { outside++; if (samples.length < 5) samples.push([Math.round(px), Math.round(py)]); }
    }
    results.push({ phase, t: Math.round(((before ?? 0) + (after ?? 0)) * 50) / 100, inside, outside });
    expect(box.width, "the two are the same size").toBeCloseTo(other.width, 0);
    expect(outside, `${phase} t ${before}-${after}: no part pixel outside the plate's box (${JSON.stringify(samples)})`).toBe(0);
    return { inside, outside };
  };
  await mkdir(evidence, { recursive: true });
  await page.evaluate(() => window.strataStructureProbe.openPair());
  await page.waitForFunction(() => document.getElementById("pair-plate"));
  let index = 0;
  const begin = Date.now();
  while (Date.now() - begin < 12000 && index < 16) { await shot(`pair-dpr${dpr}-open-${index++}`, "open"); await page.waitForTimeout(250); }
  // At rest (a short motion for the last frame): the plate's rim and material differ from the flush dialog's inside the box.
  await page.evaluate(ms => document.documentElement.style.setProperty("--strata-motion-slow", `${ms}ms`), 320);
  await page.evaluate(() => window.strataStructureProbe.closePair());
  await page.evaluate(() => window.strataStructureProbe.openPair());
  await page.waitForFunction(() => !document.getElementById("pair-plate").dataset.strataMotion && document.getElementById("pair-plate").getAttribute("data-strata-mode") === "face", null, { timeout: 8000 });
  await page.waitForTimeout(1500);
  const rest = await shot(`pair-dpr${dpr}-rest`, "rest");
  expect(rest.inside, "at rest the plate's rim and material differ from the flush dialog's, inside the box").toBeGreaterThan(500 * dpr * dpr);
  const mid = results.filter(entry => entry.phase === "open" && entry.t > 0.05 && entry.t < 0.95);
  const rises = new Set(results.filter(entry => entry.phase === "open").map(entry => Math.round(entry.t * 10)));
  console.log(`pair DPR ${dpr}: ${results.length} frames, ${mid.length} in flight, rise sampled at ${[...rises].sort((a, b) => a - b).map(value => value / 10).join(", ")}; part pixels inside ${results.map(entry => entry.inside).join("/")}, outside ${results.map(entry => entry.outside).join("/")}`);
  expect(mid.length, "frames sampled in flight").toBeGreaterThanOrEqual(5);
  expect(rises.size, "at several different rises").toBeGreaterThanOrEqual(5);
  await page.evaluate(() => window.strataStructureProbe.closePair());
  await context.close();
});

test("a tray Drawer slides out of its edge on the GPU (DPR 1 and 2): the layer travels from beyond the stage edge to rest and back, the tray's wall rises, nothing is stepped down, native hits are right, and a click outside closes it", async ({ browser }) => {
  test.setTimeout(300000);
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const table = {};
    for (const [name, query] of [["tray", ""], ["flush", "&flush"]]) {
      await ready(page, `?level=instrument${query}`);
      await page.evaluate(ms => document.documentElement.style.setProperty("--strata-motion-slow", `${ms}ms`), SLOW);
      await frame(page, `drawer-dpr${dpr}-${name}-closed`);
      const start = await counts(page);
      await page.evaluate(() => window.strataStructureProbe.open("drawer"));
      const opening = await sample(page, "sf-drawer", SLOW + 700);
      const opened = await counts(page);
      const width = await page.evaluate(() => document.getElementById("sf-drawer").offsetWidth);
      expect(opening.every(entry => entry.mode === "gpu"), `${name}: GPU on`).toBe(true);
      expectBuiltOnce(opening.filter(entry => entry.status !== undefined), `${name} drawer opening`);
      if (name === "tray") {
        const xs = opening.filter(entry => entry.opacity !== undefined && entry.opacity > 0).map(entry => entry.x);
        expect(monotone(xs, -1), "the layer slides in monotonically").toBe(true);
        expect(xs[0], "starting most of a width beyond the stage's end edge").toBeGreaterThan(width * 0.5);
        expect(xs.at(-1), "to rest").toBe(0);
        expect(opening.every(entry => entry.y === 0 && (entry.scale ?? 1) === 1), "a slide, not a depth move: no vertical travel, no scale").toBe(true);
        const rise = opening.filter(entry => entry.t !== undefined).map(entry => entry.t);
        expect(monotone(rise, 1) && rise[0] < 0.1 && rise.at(-1) === 1, "the wall rises from the chassis to its resting height").toBe(true);
      } else {
        expect(opening.filter(entry => entry.opacity > 0).every(entry => entry.x === 0), "a flush drawer does not slide: it moves through depth").toBe(true);
      }
      // At rest: the tray's wall is drawn inside the drawer's box, with the same pixels outside it as without the form.
      await frame(page, `drawer-dpr${dpr}-${name}-open`, { wait: 300 });
      const hits = await page.evaluate(() => { const box = document.getElementById("sf-drawer-done").getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest("button")?.id ?? null; });
      expect(hits, `${name}: a hit on the button at rest`).toBe("sf-drawer-done");
      if (name === "tray") {
        const scene = await sceneOf(page, "#sf-drawer");
        expect(scene.objects.find(object => object.id === "sf-drawer").parts, "a wall").toEqual(["bezel:trayWall"]);
        expect(scene.materials[0], "the drawer's slab is machined").toBe("satin");
        const drawerBox = await inFrame(page, "#sf-drawer");
        const formed = await frame(page, `drawer-dpr${dpr}-formed`);
        await page.evaluate(() => document.getElementById("sf-drawer").removeAttribute("data-strata-form"));
        const bare = await frame(page, `drawer-dpr${dpr}-bare`);
        const diff = difference(formed, bare, drawerBox);
        expect(diff.inside, "the wall and the material are drawn").toBeGreaterThan(500 * dpr * dpr);
        expect(diff.outside, `nothing outside the drawer's box changes (${JSON.stringify(diff.outsideSamples)})`).toBe(0);
        console.log(`DPR ${dpr}: the tray drawer's wall and material: ${diff.inside} px inside the drawer, ${diff.outside} outside`);
        await page.evaluate(() => document.getElementById("sf-drawer").setAttribute("data-strata-form", "tray"));
      }
      // A real click outside the drawer closes it (closeOnScrim) and the layer slides back.
      await page.mouse.click(40, 600);
      const closing = await sample(page, "sf-drawer", SLOW + 700);
      await page.waitForFunction(() => !window.strataStructureProbe.overlay());
      const closed = await counts(page);
      expect(await page.evaluate(() => window.strataStructureProbe.closes())).toEqual(["scrim"]);
      expect(closing.every(entry => entry.mode === "gpu"), `${name}: GPU on while it slides back`).toBe(true);
      expectBuiltClosing(closing.filter(entry => entry.status !== undefined), `${name} drawer closing`);
      if (name === "tray") {
        const xs = closing.filter(entry => entry.opacity !== undefined && entry.opacity > 0).map(entry => entry.x);
        expect(monotone(xs, 1) && xs.at(-1) > width * 0.5, "the layer slides back out to the edge").toBe(true);
      }
      await healthy(page, `${name} closed`, "instrument");
      table[name] = { open: delta(start, opened), whole: delta(start, closed) };
    }
    console.log(`DPR ${dpr} drawer: open ${JSON.stringify(table.tray.open)} tray vs ${JSON.stringify(table.flush.open)} flush; open and close ${JSON.stringify(table.tray.whole)} vs ${JSON.stringify(table.flush.whole)}`);
    const within = (a, b) => Math.abs(a - b) <= 0.04 * b + 4;
    // A slide is a translation, which needs no recapture: the tray drawer captures no more than the flush drawer's depth entry does.
    expect(table.tray.open.captures, `captures: tray ${table.tray.open.captures}, flush ${table.flush.open.captures}`).toBeLessThanOrEqual(table.flush.open.captures * 1.04 + 4);
    expect(table.tray.open.uploads, `uploads: tray ${table.tray.open.uploads}, flush ${table.flush.open.uploads}`).toBeLessThanOrEqual(table.flush.open.uploads * 1.04 + 4);
    void within;
    expect(errors).toEqual([]);
    await context.close();
  }
});
