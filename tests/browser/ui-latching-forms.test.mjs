/**
 * Browser suite for the Strata latching forms (anatomy pages `checkbox.md`, `radio.md` and `segmented-control.md`, *Latching forms*)
 * on `ui-latching-forms.html` (`window.strataLatchProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM
 * behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real inputs: a latching Checkbox toggles `checked` once per click, label click and Space, clears `indeterminate`
 *   as native, is held (`data-strata-down`, the ring lit, the cap down) while pressed and latched (ring lit, cap at 0.45 of its travel),
 *   a mixed one rests at 0.2 with the ring half lit, a disabled one is never held or lit; a preset bank and a SegmentedControl keep
 *   the native radio group (Tab lands on the selected key, arrows move and wrap and skip the disabled one, one `change` per real
 *   selection, form data) with exactly one key down and its LED lit; a form submits the same values as before; `flush` is the markup
 *   and look the controls had.
 * - Touch: taps toggle and select, a touch hold lowers the key. Mobile and text size: at 320 and 390 px no overflow, every key at least
 *   24 px, the cap inside its bezel or plinth; at 200% text the caps grow and the bank wraps.
 * - Preferences and accessibility: axe in light, dark and face mode, forced colours, more contrast, reduced motion; the focus ring.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on through checks; a panel with latching forms takes a version 4 scene
 *   with an emitter per ring and per LED, the protected text and a feather; at the Instrument level each checkbox is a bezel, a glass
 *   ring, a body and a captured cap, each bank key a body, a captured cap and an LED on the plinth, and each bank one plinth part; every
 *   pixel they draw lies inside the key's box (the group's box, for a plinth) at every depth, native hits on part pixels find the control,
 *   0 hit mismatches over every box; a lit ring changes pixels in its box and lights the face within its reach and not beyond it, and
 *   protected text stays within the guard; a real check or selection changes pixels in its box and its light's reach only; 40 held frames
 *   are 0 captures, 0 uploads and 0 hit-geometry updates.
 * - Feedback (`click`, opt-in): off by default; with sound on, audio waits for a gesture and each real change plays once (a selection
 *   that changes nothing, and a script's assignment, play nothing); with haptics on a real change pulses 8 ms once.
 * - The accessibility snapshot is the same in DOM and GPU modes.
 * Screenshots go to the `ui-latching-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-latching-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** The controls in document order: their kind and whether each is on at load (`mixed`: indeterminate). */
const keys = {
  "cb-monitor": ["key", false], "cb-phantom": ["key", true], "cb-mixed": ["key", "mixed"], "cb-locked": ["key", false, "disabled"], "cb-armed": ["key", true, "disabled"],
  "r-piano": ["bank", false], "r-organ": ["bank", true], "r-strings": ["bank", false], "r-pad": ["bank", false, "disabled"],
  "s-day": ["bank", false], "s-week": ["bank", true], "s-month": ["bank", false],
};
const ids = Object.keys(keys);
/** The numbers a key takes at load (`latchNumbers`): ring, LED, cap travel. */
const startNumbers = id => {
  const [, on, disabled] = keys[id];
  if (disabled) return { lit: 0, led: 0, t: on === true ? 0.45 : 0 };
  if (on === "mixed") return { lit: 0.5, led: 0.5, t: 0.2 };
  return on ? { lit: 1, led: 1, t: 0.45 } : { lit: 0, led: 0, t: 0 };
};

const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
/** The key's host (`.ug-latch`) for the input `id`. */
const host = (page, id) => page.locator(`#${id}`).locator("xpath=..");
const down = (page, id) => host(page, id).evaluate(element => element.getAttribute("data-strata-down") === "true");
const numbers = (page, id) => host(page, id).evaluate(element => { const style = getComputedStyle(element); return { lit: Number(style.getPropertyValue("--strata-lit")), led: Number(style.getPropertyValue("--strata-led")), t: Number(style.getPropertyValue("--strata-push-t")) }; });
/** The numbers once the CSS transitions on them have ended. */
async function settled(page, id) {
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  return numbers(page, id);
}
const events = page => page.evaluate(() => window.strataLatchProbe.events());
const clear = page => page.evaluate(() => window.strataLatchProbe.clearEvents());
const changes = async page => (await events(page)).filter(event => event.type === "change").map(event => `${event.id}:${event.checked}`);
const checkedIds = page => page.evaluate(() => [...document.querySelectorAll("input:checked")].map(input => input.id));
const data = async page => JSON.parse(await page.locator("#latch-data").textContent());

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-latching-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataLatchProbe);
  return { context, page, errors };
}

test("a latching Checkbox is the native checkbox: it toggles once per click, label click and Space, is held while pressed, and lights its ring while latched", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  await expect(page.getByRole("checkbox", { name: "Monitor" })).toHaveCount(1);
  await expect(page.getByRole("checkbox", { name: "Phantom" })).toBeChecked();
  await expect(page.locator("#cb-mixed")).toHaveJSProperty("indeterminate", true);
  expect(await page.locator("#cb-mixed").evaluate(input => input.matches(":indeterminate"))).toBe(true);
  expect(await page.locator("#cb-monitor").evaluate(input => [input.matches("input[type=checkbox]"), input.getAttribute("data-strata-face"), input.parentElement.className, input.closest("label").getAttribute("data-strata-form"), input.nextElementSibling.getAttribute("aria-hidden")]))
    .toEqual([true, null, "ug-push ug-latch ug-latch--key", "latching", "true"]);
  // The box: the cap (the 20 px indicator) plus 22 px, a square; the input covers it.
  const box = await page.locator("#cb-monitor").boundingBox();
  expect([box.width, box.height]).toEqual([42, 42]);
  expect(await host(page, "cb-monitor").evaluate(element => { const input = element.querySelector("input").getBoundingClientRect(), own = element.getBoundingClientRect(); return [input.width === own.width, input.height === own.height, input.x === own.x, input.y === own.y]; })).toEqual([true, true, true, true]);
  for (const id of ids.filter(id => keys[id][0] === "key")) expect(await numbers(page, id), `${id} at load`).toEqual(startNumbers(id));

  // A real click toggles once: the ring and the cap follow, the mark shows.
  await page.locator("#cb-monitor").click();
  expect(await changes(page)).toEqual(["cb-monitor:true"]);
  expect(await settled(page, "cb-monitor")).toEqual({ lit: 1, led: 1, t: 0.45 });
  expect(await page.locator("#cb-monitor").evaluate(input => getComputedStyle(input.parentElement.querySelector(".ug-checkbox__mark")).opacity)).toBe("1");
  await page.locator("#cb-monitor").click();
  expect(await changes(page)).toEqual(["cb-monitor:true", "cb-monitor:false"]);
  expect(await settled(page, "cb-monitor")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await page.locator("#cb-monitor").evaluate(input => getComputedStyle(input.parentElement.querySelector(".ug-checkbox__mark")).opacity)).toBe("0");
  // The label toggles it too, once; Space toggles it; Enter does nothing to a checkbox, and holds nothing.
  await clear(page);
  await page.getByText("Monitor", { exact: true }).click();
  expect(await changes(page)).toEqual(["cb-monitor:true"]);
  await page.locator("#cb-monitor").focus();
  await page.keyboard.press("Space");
  expect(await changes(page)).toEqual(["cb-monitor:true", "cb-monitor:false"]);
  await page.keyboard.down("Enter");
  expect(await down(page, "cb-monitor"), "Enter holds nothing").toBe(false);
  await page.keyboard.up("Enter");
  expect((await changes(page)).length, "Enter changes nothing").toBe(2);
  // Held: all the way down with the ring lit, from the pointer going down (on the key, or on the label) to its going up anywhere.
  const monitor = await page.locator("#cb-monitor").boundingBox();
  await page.mouse.move(...centreOf(monitor));
  await page.mouse.down();
  expect(await down(page, "cb-monitor")).toBe(true);
  expect(await settled(page, "cb-monitor")).toEqual({ lit: 1, led: 0, t: 1 });
  expect((await changes(page)).length, "no change until the pointer comes up").toBe(2);
  await page.mouse.up();
  expect(await down(page, "cb-monitor")).toBe(false);
  expect(await settled(page, "cb-monitor")).toEqual({ lit: 1, led: 1, t: 0.45 });
  await page.locator("#cb-monitor").click();
  await clear(page);
  const label = await page.getByText("Monitor", { exact: true }).boundingBox();
  await page.mouse.move(...centreOf(label));
  await page.mouse.down();
  expect(await down(page, "cb-monitor"), "a press on the label holds its key").toBe(true);
  await page.mouse.move(600, 600);
  await page.mouse.up();
  expect(await down(page, "cb-monitor")).toBe(false);
  expect(await changes(page), "released elsewhere: no change").toEqual([]);
  // Space holds it while down.
  await page.locator("#cb-monitor").focus();
  await page.keyboard.down("Space");
  expect(await down(page, "cb-monitor")).toBe(true);
  await page.keyboard.up("Space");
  expect(await down(page, "cb-monitor")).toBe(false);
  expect(await changes(page)).toEqual(["cb-monitor:true"]);
  await page.locator("#cb-monitor").click();

  // Mixed: a click clears `indeterminate` and toggles `checked`, as native; the numbers follow.
  expect(await numbers(page, "cb-mixed")).toEqual({ lit: 0.5, led: 0.5, t: 0.2 });
  await page.locator("#cb-mixed").click();
  expect(await page.locator("#cb-mixed").evaluate(input => [input.indeterminate, input.checked])).toEqual([false, true]);
  expect(await settled(page, "cb-mixed")).toEqual({ lit: 1, led: 1, t: 0.45 });
  expect(await page.locator("#cb-mixed").evaluate(input => getComputedStyle(input.parentElement.querySelector(".ug-checkbox__mark")).opacity)).toBe("1");
  await page.locator("#cb-mixed").evaluate(input => { input.checked = false; input.indeterminate = true; });
  expect(await settled(page, "cb-mixed"), "a mixed state set by script follows").toEqual({ lit: 0.5, led: 0.5, t: 0.2 });
  // The mixed key says so in more than light: a dash is printed on the cap.
  const marks = await page.evaluate(() => ["cb-monitor", "cb-phantom", "cb-mixed"].map(id => { const mark = document.getElementById(id).parentElement.querySelector(".ug-checkbox__mark"), style = getComputedStyle(mark); return [id, style.opacity, style.maskImage.includes("M7 12h10")]; }));
  expect(marks).toEqual([["cb-monitor", "0", false], ["cb-phantom", "1", false], ["cb-mixed", "1", true]]);

  // Disabled: never held, lit or toggled; a disabled checked one keeps its place and is unlit.
  await clear(page);
  await page.locator("#cb-locked").click({ force: true });
  await page.mouse.click(...centreOf(await page.locator("#cb-armed").boundingBox()));
  expect(await changes(page)).toEqual([]);
  expect(await down(page, "cb-locked")).toBe(false);
  expect(await numbers(page, "cb-locked")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await numbers(page, "cb-armed")).toEqual({ lit: 0, led: 0, t: 0.45 });
  await expect(page.locator("#cb-armed")).toBeChecked();
  await expect(page.locator("#cb-armed")).toBeDisabled();

  // Form data: the same values as before (checked, enabled checkboxes by name and value; a disabled one is never sent).
  await clear(page);
  await page.locator("#cb-phantom").click();
  await page.locator("#cb-phantom").click();
  await page.locator("#send").click();
  expect(await data(page)).toEqual({ agree: ["cb-phantom"], preset: ["r-organ"], range: ["s-week"] });
  await page.locator("#cb-monitor").click();
  await page.locator("#send").click();
  expect((await data(page)).agree, "DOM order").toEqual(["cb-phantom", "cb-monitor"].sort((a, b) => ids.indexOf(a) - ids.indexOf(b)));
  expect(await page.locator("#plain").evaluate(button => button.getAttribute("data-strata-face"))).toBe("raised");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("a preset bank and a SegmentedControl keep the native radio group: Tab lands on the selected key, arrows move and wrap, one key is down with its LED lit", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  await expect(page.getByRole("group", { name: "Preset" })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Range" })).toHaveCount(1);
  await expect(page.getByRole("radio", { name: "Organ" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Week" })).toBeChecked();
  for (const id of ids.filter(id => keys[id][0] === "bank")) expect(await numbers(page, id), `${id} at load`).toEqual(startNumbers(id));
  // The markup: the radio is the control, the plinth is one part, each key carries its label on the cap, the LED is decoration.
  expect(await page.evaluate(() => ({
    bank: document.getElementById("bank").getAttribute("data-strata-form"), plinths: document.querySelectorAll("#bank .ug-bank__plinth").length, keys: document.querySelectorAll("#bank .ug-latch").length,
    label: document.getElementById("r-piano").parentElement.querySelector(".ug-push__cap").textContent, object: document.getElementById("r-piano").nextElementSibling.getAttribute("aria-hidden"),
    segmented: document.getElementById("range").getAttribute("data-strata-form"), segmentedPlinth: document.querySelector("#range .ug-bank__plinth").className,
  }))).toEqual({ bank: "bank", plinths: 1, keys: 4, label: "Piano", object: "true", segmented: "latching", segmentedPlinth: "ug-segmented__plinth ug-bank__plinth" });
  // Exactly one key is down in each group (the cap at its latched travel), the others at rest.
  const caps = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".ug-latch input[type=radio]")].map(input => [input.id, Number.parseFloat(getComputedStyle(input.parentElement.querySelector(".ug-push__cap")).translate.split(" ")[1] ?? "0")])));
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await caps()).toMatchObject({ "r-organ": 0.9, "r-piano": 0, "s-week": 0.9, "s-day": 0 });

  // Tab enters the group once, on the selected key; arrows move the selection with one change each, wrap and skip the disabled key.
  await page.locator("#cb-mixed").focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.id), "Tab lands on the selected radio").toBe("r-organ");
  await clear(page);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("r-strings");
  expect(await changes(page)).toEqual(["r-strings:true"]);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.id), "the disabled key is skipped, and it wraps").toBe("r-piano");
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("r-strings");
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("r-piano");
  expect(await changes(page)).toEqual(["r-strings:true", "r-piano:true", "r-strings:true", "r-piano:true"]);
  expect((await checkedIds(page)).filter(id => id.startsWith("r-")), "one at a time").toEqual(["r-piano"]);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.id), "Tab leaves the group once").toBe("s-week");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("s-day");
  expect((await checkedIds(page)).filter(id => id.startsWith("s-"))).toEqual(["s-day"]);
  for (const id of ["r-piano", "s-day"]) expect(await settled(page, id), `${id} selected`).toEqual({ lit: 1, led: 1, t: 0.45 });
  for (const id of ["r-organ", "r-strings", "r-pad", "s-week", "s-month"]) expect(await numbers(page, id), `${id} not selected`).toEqual({ lit: 0, led: 0, t: 0 });
  await clear(page);

  // A click on a key selects it; a click on the selected key changes nothing; a press holds the key all the way down.
  await page.locator("#r-strings").click();
  expect(await changes(page)).toEqual(["r-strings:true"]);
  await page.locator("#r-strings").click();
  expect(await changes(page), "selecting the selected key is no change").toEqual(["r-strings:true"]);
  await page.locator("#s-month").click();
  expect(await checkedIds(page)).toContain("s-month");
  const piano = await page.locator("#r-piano").boundingBox();
  await page.mouse.move(...centreOf(piano));
  await page.mouse.down();
  expect(await down(page, "r-piano")).toBe(true);
  expect(await settled(page, "r-piano")).toEqual({ lit: 1, led: 0, t: 1 });
  await page.mouse.up();
  expect(await down(page, "r-piano")).toBe(false);
  expect(await settled(page, "r-piano")).toEqual({ lit: 1, led: 1, t: 0.45 });
  expect(await numbers(page, "r-strings"), "the key that was down comes up").toEqual({ lit: 0, led: 0, t: 0 });
  // Disabled: never held, lit or selected.
  await clear(page);
  await page.locator("#r-pad").click({ force: true });
  await page.mouse.click(...centreOf(await page.locator("#r-pad").boundingBox()));
  expect(await changes(page)).toEqual([]);
  expect(await down(page, "r-pad")).toBe(false);
  // Form data: the selected values.
  await page.locator("#send").click();
  expect(await data(page)).toMatchObject({ preset: ["r-piano"], range: ["s-month"] });
  // The keys' boxes: the label's width plus 12 px, at least 24, taller than the cap by the LED's strip.
  const sizes = await page.evaluate(() => ["r-organ", "r-strings", "s-day"].map(id => { const input = document.getElementById(id).getBoundingClientRect(), cap = document.getElementById(id).parentElement.querySelector(".ug-push__cap").getBoundingClientRect(); return { id, left: cap.left - input.left, right: input.right - cap.right, top: cap.top - input.top, bottom: input.bottom - cap.bottom, capHeight: cap.height }; }));
  for (const size of sizes) expect(size, `${size.id}: 6 px round the cap, 14 above it`).toMatchObject({ left: 6, right: 6, top: 14, bottom: 6 });
  // A group with nothing selected is not mixed: a radio is `:indeterminate` then, and its key stays up and dark.
  await page.evaluate(() => { for (const input of document.querySelectorAll("#bank input")) input.checked = false; });
  for (const id of ["r-piano", "r-organ", "r-strings", "r-pad"]) expect(await settled(page, id), `${id}: an empty group`).toEqual({ lit: 0, led: 0, t: 0 });
  await page.screenshot({ path: `${evidence}/plain-bank.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("flush keeps the controls as they were: no latching host, no data-strata-form, the well, the dot and the keys of before", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, {}, "&flush");
  expect(await page.evaluate(() => ({
    latches: document.querySelectorAll(".ug-latch, .ug-bank__plinth, [data-strata-form], .ug-push__cap").length,
    checkbox: document.getElementById("cb-monitor").getAttribute("data-strata-face"), radio: document.getElementById("r-piano").getAttribute("data-strata-face"),
    dots: document.querySelectorAll(".ug-radio__dot").length, marks: document.querySelectorAll(".ug-checkbox__mark[data-strata-face=mark]").length, keys: document.querySelectorAll(".ug-segmented__key[data-strata-face=raised]").length,
    checkboxBox: (box => [box.width, box.height])(document.getElementById("cb-monitor").getBoundingClientRect()),
  }))).toEqual({ latches: 0, checkbox: "well", radio: "well", dots: 4, marks: 5, keys: 3, checkboxBox: [20, 20] });
  // The same native behaviour as before.
  await page.locator("#cb-monitor").click();
  expect(await changes(page)).toEqual(["cb-monitor:true"]);
  await page.locator("#r-strings").click();
  await page.locator("#s-day").click();
  await page.locator("#send").click();
  expect(await data(page)).toEqual({ agree: ["cb-monitor", "cb-phantom"], preset: ["r-strings"], range: ["s-day"] });
  await page.screenshot({ path: `${evidence}/plain-flush.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: a tap checks and selects, and a touch hold lowers the key and lights its ring, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-latching-forms.html?plain");
  await page.waitForFunction(() => window.strataLatchProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  await page.touchscreen.tap(...centreOf(await page.locator("#cb-monitor").boundingBox()));
  expect(await changes(page)).toEqual(["cb-monitor:true"]);
  expect(await settled(page, "cb-monitor")).toEqual({ lit: 1, led: 1, t: 0.45 });
  await page.touchscreen.tap(...centreOf(await page.locator("#r-strings").boundingBox()));
  expect(await checkedIds(page)).toContain("r-strings");
  await page.touchscreen.tap(...centreOf(await page.locator("#s-month").boundingBox()));
  expect(await checkedIds(page)).toContain("s-month");
  expect(await changes(page)).toEqual(["cb-monitor:true", "r-strings:true", "s-month:true"]);
  // A hold: the key is down while the touch is.
  const client = await context.newCDPSession(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const [x, y] = centreOf(await page.locator("#cb-phantom").boundingBox());
  await touch("touchStart", [{ x, y }]);
  expect(await down(page, "cb-phantom")).toBe(true);
  expect(await settled(page, "cb-phantom")).toEqual({ lit: 1, led: 1, t: 1 });
  await touch("touchEnd", []);
  expect(await down(page, "cb-phantom")).toBe(false);
  expect(await settled(page, "cb-phantom")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the latching forms reflow with no horizontal overflow, keys of at least 24 px and every cap inside its frame`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-latching-forms.html?plain");
  await page.waitForFunction(() => window.strataLatchProbe);
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    keys: [...document.querySelectorAll(".ug-latch")].map(element => {
      const input = element.querySelector("input"), box = input.getBoundingClientRect(), cap = element.querySelector(".ug-push__cap").getBoundingClientRect(), bezel = element.querySelector(".ug-push__bezel")?.getBoundingClientRect();
      const plinth = element.closest(".ug-bank__plinth")?.getBoundingClientRect();
      return { id: input.id, left: box.left, right: box.right, width: box.width, height: box.height,
        capInBezel: bezel ? cap.left >= bezel.left && cap.right <= bezel.right && cap.top >= bezel.top && cap.bottom <= bezel.bottom : null,
        capInPlinth: plinth ? cap.left >= plinth.left && cap.right <= plinth.right && cap.top >= plinth.top && cap.bottom <= plinth.bottom : null };
    }),
    groups: ["bank", "range"].map(id => { const box = document.getElementById(id).getBoundingClientRect(); return { id, left: box.left, right: box.right }; }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const key of layout.keys) {
    expect(Math.min(key.width, key.height), `${key.id}: box`).toBeGreaterThanOrEqual(24);
    expect(key.left).toBeGreaterThanOrEqual(0);
    expect(key.right).toBeLessThanOrEqual(width);
    if (key.capInBezel !== null) expect(key.capInBezel, `${key.id}: the cap is inside its bezel`).toBe(true);
    if (key.capInPlinth !== null) expect(key.capInPlinth, `${key.id}: the cap is inside the plinth`).toBe(true);
  }
  for (const group of layout.groups) expect([group.left >= 0, group.right <= width], `${group.id} is inside the viewport`).toEqual([true, true]);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest key box ${Math.min(...layout.keys.map(key => Math.min(key.width, key.height)))} px, bank ${Math.round(layout.groups[0].right - layout.groups[0].left)} px wide`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png` });
  await context.close();
});

test("at 200% text and 320 px the caps grow and wrap, the bank wraps, and nothing overflows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-latching-forms.html?plain");
  await page.waitForFunction(() => window.strataLatchProbe);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
    document.querySelector("#r-organ").parentElement.querySelector(".ug-radio__label").textContent = "Church organ preset";
  });
  const result = await page.evaluate(() => {
    const capOf = id => document.getElementById(id).parentElement.querySelector(".ug-push__cap"), textIn = cap => { const range = document.createRange(); range.selectNodeContents(cap); const t = range.getBoundingClientRect(), c = cap.getBoundingClientRect(); return t.left >= c.left - 1 && t.right <= c.right + 1 && t.top >= c.top - 1 && t.bottom <= c.bottom + 1; };
    const organ = capOf("r-organ").getBoundingClientRect(), piano = capOf("r-piano").getBoundingClientRect(), box = document.getElementById("r-organ").getBoundingClientRect();
    const plinth = document.querySelector("#bank .ug-bank__plinth").getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, organHeight: organ.height, pianoHeight: piano.height, organWide: organ.width, textOrgan: textIn(capOf("r-organ")), textPiano: textIn(capOf("r-piano")), textWeek: textIn(capOf("s-week")),
      plinthRight: plinth.right, plinthRows: new Set([...document.querySelectorAll("#bank .ug-latch")].map(element => Math.round(element.getBoundingClientRect().top))).size, boxHeight: box.height,
      labelInRow: (label => { const box = label.getBoundingClientRect(); return box.right <= 320; })(document.querySelector("#cb-monitor").closest("label")) };
  });
  expect(result.scrollWidth).toBeLessThanOrEqual(320);
  expect(result.plinthRight, "the bank is inside the viewport").toBeLessThanOrEqual(320);
  expect(result.organHeight, "the cap grows to hold the wrapped label").toBeGreaterThan(result.pianoHeight);
  expect(result).toMatchObject({ textOrgan: true, textPiano: true, textWeek: true, labelInRow: true });
  expect(result.plinthRows, "the keys wrap onto rows").toBeGreaterThan(1);
  console.log(`200% text at 320 px: scrollWidth ${result.scrollWidth}, the wrapped cap ${Math.round(result.organHeight)} px against ${Math.round(result.pianoHeight)}, ${result.plinthRows} rows`);
  await page.screenshot({ path: `${evidence}/text-200.png` });
  await context.close();
});

test("the latching forms pass axe in light, dark and face mode, and under more contrast, reduced motion and forced colours", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#latch-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#latch-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#latch-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  // The ring and LED are lit by the state: the latched ring is lighter than the unlit one, in the role's colour.
  const rings = await page.evaluate(() => Object.fromEntries(["cb-monitor", "cb-phantom"].map(id => [id, getComputedStyle(document.getElementById(id).parentElement.querySelector(".ug-push__ring")).backgroundColor])));
  expect(rings["cb-phantom"], "a checked key's ring is lit").not.toBe(rings["cb-monitor"]);
  // More contrast: flat colour, no glow, edges in the text colour; the key that is down has a bar under its label.
  await page.emulateMedia({ contrast: "more" });
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  const more = await page.evaluate(() => { const style = getComputedStyle(document.getElementById("cb-phantom").parentElement.querySelector(".ug-push__ring")), cap = getComputedStyle(document.getElementById("r-organ").parentElement.querySelector(".ug-push__cap")), plain = getComputedStyle(document.getElementById("r-piano").parentElement.querySelector(".ug-push__cap")); return { border: style.borderTopWidth, glow: style.boxShadow, bar: cap.boxShadow, none: plain.boxShadow }; });
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(parseFloat(more.border)).toBeGreaterThanOrEqual(1);
  expect(more.bar, "the selected key has a bar").toContain("inset");
  expect(more.bar).not.toBe(more.none);
  const contrast = await new AxeBuilder({ page }).include("#latch-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  // Reduced motion: lights and travel change at once.
  await page.emulateMedia({ contrast: "no-preference", reducedMotion: "reduce" });
  expect(await host(page, "cb-monitor").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  // Forced colours: Canvas bezel and ring with ButtonText borders, Highlight when lit, GrayText when disabled.
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  const forced = await page.evaluate(() => {
    const part = (id, selector) => getComputedStyle(document.getElementById(id).parentElement.querySelector(selector));
    return { on: part("cb-phantom", ".ug-push__ring").backgroundColor, off: part("cb-monitor", ".ug-push__ring").backgroundColor, glow: part("cb-phantom", ".ug-push__ring").boxShadow,
      locked: part("cb-locked", ".ug-push__ring").borderTopColor, edge: part("cb-monitor", ".ug-push__ring").borderTopColor, capStyle: part("cb-monitor", ".ug-push__cap").borderTopStyle,
      bankOn: part("r-organ", ".ug-push__cap").backgroundColor, bankOff: part("r-piano", ".ug-push__cap").backgroundColor, bankText: part("r-organ", ".ug-push__cap").color, ledOn: part("r-organ", ".ug-push__led").backgroundColor, ledOff: part("r-piano", ".ug-push__led").backgroundColor,
      disabledText: part("r-pad", ".ug-push__cap").color, enabledText: part("r-piano", ".ug-push__cap").color, border: getComputedStyle(document.getElementById("cb-monitor").parentElement).borderTopWidth };
  });
  expect(forced.on, "a checked ring is Highlight").not.toBe(forced.off);
  expect(forced.glow, "no glow").toBe("none");
  expect(forced.locked, "a disabled key is edged in GrayText").not.toBe(forced.edge);
  expect(forced.bankOn, "the selected key is Highlight").not.toBe(forced.bankOff);
  expect(forced.ledOn, "its LED is Highlight").not.toBe(forced.ledOff);
  expect(forced.disabledText, "a disabled key is GrayText").not.toBe(forced.enabledText);
  expect(forced).toMatchObject({ capStyle: "solid", border: "0px" });
  const forcedAxe = await new AxeBuilder({ page }).include("#latch-panel").withTags(tags).analyze();
  expect(summary(forcedAxe.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none" });
  // Focus is a ring round the bezel (the cap, in a bank) in every presentation.
  await page.locator("#send").focus();
  await page.keyboard.press("Shift+Tab");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("s-week");
  expect(await page.locator("#s-week").evaluate(input => getComputedStyle(input.parentElement.querySelector(".ug-push__cap")).outlineStyle), "a bank key's focus ring").toBe("solid");
  await page.locator("#cb-monitor").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.locator("#cb-monitor").evaluate(input => getComputedStyle(input.parentElement.querySelector(".ug-push__bezel")).outlineStyle), "a checkbox's focus ring").toBe("solid");
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-latching-forms.html${query}`);
  await page.waitForFunction(() => window.strataLatchProbe && window.strataLatchProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataLatchProbe.scene() !== undefined);
  await page.evaluate(() => window.strataLatchProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => { const instrument = window.strataLatchProbe.instrument(); return !instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"); }, null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataLatchProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  await page.waitForFunction(() => window.strataLatchProbe.instrument().layers.every(layer => layer.status !== "pending"), null, { timeout: 30000 });
  const state = await page.evaluate(() => window.strataLatchProbe.instrument().layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the CSS transitions, the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    const probe = window.strataLatchProbe;
    await new Promise(resolve => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 40 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    probe.refresh(); await probe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await probe.controller.settle();
  }, wait);
  await page.waitForFunction(() => { const instrument = window.strataLatchProbe.instrument(); return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending")); }, null, { timeout: 30000 });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, inside and outside the `allowed` regions (frame CSS px), and the changed points. */
function difference(a, b, allowed, { points = false, threshold = 6 } = {}) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [], changed = [], extent = [Infinity, Infinity, -Infinity, -Infinity], outsideExtent = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    const delta = Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]);
    if (delta < threshold) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(region => region.radius !== undefined ? Math.hypot(px - region.cx, py - region.cy) <= region.radius : px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) { inside++; extent[0] = Math.min(extent[0], px); extent[1] = Math.min(extent[1], py); extent[2] = Math.max(extent[2], px); extent[3] = Math.max(extent[3], py); if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
    else { outside++; outsideExtent[0] = Math.min(outsideExtent[0], px); outsideExtent[1] = Math.min(outsideExtent[1], py); outsideExtent[2] = Math.max(outsideExtent[2], px); outsideExtent[3] = Math.max(outsideExtent[3], py); if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py), delta]); }
  }
  return { inside, outside, outsideSamples, outsideExtent: outsideExtent.map(Math.round), changed, extent: extent.map(Math.round) };
}
/** Boxes in frame CSS px. */
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id || element.querySelector("input")?.id };
  });
}, selector);
/** The native controls' boxes in frame px: each key's input and each group's fieldset. */
const controlBoxes = page => inFrame(page, ".ug-latch, fieldset.ug-radio-group, fieldset.ug-segmented").then(boxes => boxes);
/** Native hits on frame points: how many land on a latching control or its group. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  const samples = [];
  for (const [x, y] of points) {
    const hit = document.elementFromPoint(frame.left + x, frame.top + y);
    if (!hit?.closest(".ug-latch, fieldset.ug-radio-group, fieldset.ug-segmented")) { mismatches++; if (samples.length < 6) samples.push([Math.round(x), Math.round(y), hit?.className || hit?.tagName]); }
  }
  return { total: points.length, mismatches, samples };
}, points);
/** elementFromPoint over a grid on a key's box (inset 0.5 px): every hit must be the input itself. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const input = document.getElementById(id), box = input.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    // The input's border is the key's rounded rectangle, which is its hit shape: points in the box's corners outside it are the row's.
    const radius = Math.min(parseFloat(getComputedStyle(input).borderTopLeftRadius) || 0, box.width / 2, box.height / 2);
    const dx = Math.max(0, Math.abs(x - (box.left + box.width / 2)) - (box.width / 2 - radius)), dy = Math.max(0, Math.abs(y - (box.top + box.height / 2)) - (box.height / 2 - radius));
    if (Math.hypot(dx, dy) > radius - 0.75) continue;
    total++;
    if (document.elementFromPoint(x, y) !== input) misses.push({ x, y, hit: document.elementFromPoint(x, y)?.className || document.elementFromPoint(x, y)?.tagName });
  }
  return { total, misses };
}, [id, n]);
/** Every input unchecked and not mixed: nothing lit, so no light but the controls' own. */
const allUnlit = page => page.evaluate(() => { for (const input of document.querySelectorAll("#latch-panel input")) { input.checked = false; input.indeterminate = false; } });
const counts = page => page.evaluate(() => window.strataLatchProbe.counts());
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
const depth = (page, value) => page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataLatchProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  const texts = [];
  const walker = document.createTreeWalker(probe.panel(), NodeFilter.SHOW_TEXT), range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim() || !node.parentElement.checkVisibility() || node.parentElement.closest("pre, option")) continue;
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) texts.push([box.left - panel.left, box.top - panel.top, box.width, box.height]);
  }
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, feather: scene.feather, outset: scene.outset,
    primitives: scene.primitives, faces: scene.primitives.map(entry => entry.face ?? entry.object),
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), emitters: object.parts.map(part => part.emitter), glass: object.parts.map(part => part.glass),
      state: object.parts[0].state, pose: object.parts.map(part => part.pose?.to?.travel), casters: object.parts.map(part => part.caster === undefined ? "own" : part.caster === null ? "none" : part.caster.height),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id))[index]) < 0.01) })), texts };
});
/** The emitters' names in order, from the DOM: each key's ring (a checkbox's), then its LED (a bank key's). */
const emitterNames = page => page.evaluate(() => [...document.querySelectorAll(".ug-latch")].flatMap(host => { const id = host.querySelector("input").id; return [...(host.querySelector(".ug-push__ring") ? [`${id}:ring`] : []), ...(host.querySelector(".ug-push__led") ? [`${id}:led`] : [])]; }));
const strengths = page => page.evaluate(async () => {
  for (let attempt = 0; attempt < 60 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
  window.strataLatchProbe.refresh(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  const scene = window.strataLatchProbe.scene(), order = [...document.querySelectorAll(".ug-latch")].flatMap(host => { const id = host.querySelector("input").id; return [...(host.querySelector(".ug-push__ring") ? [`${id}:ring`] : []), ...(host.querySelector(".ug-push__led") ? [`${id}:led`] : [])]; });
  return Object.fromEntries(order.map((name, index) => [name, Math.round(scene.emitters[index].strength * 100) / 100]));
});

for (const dpr of [1, 2]) for (const level of levels) test(`the latching forms at ${level} (DPR ${dpr}): the scene, the emitters, containment, hits, the light and the guard`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version, "version 4").toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // An emitter for each checkbox's ring and each bank key's LED, in document order; strength from the state (a 20 px cap, a 6 px LED).
  const names = await emitterNames(page);
  expect(names).toHaveLength(12);
  expect(scene.emitters).toHaveLength(names.length);
  scene.emitters.forEach((emitter, index) => {
    const [id, kind] = names[index].split(":"), numbersAtLoad = startNumbers(id), lit = kind === "ring" ? numbersAtLoad.lit : numbersAtLoad.led;
    if (kind === "ring") {
      expect(emitter.strength, `${id}: ring strength (the 20 px cap's share of 2,400)`).toBeCloseTo(lit * 2400 * (20 / 40) ** 2, 2);
      expect(emitter.radius, `${id}: reach 4 cap diameters`).toBeCloseTo(80, 2);
      expect(emitter.position[2], `${id}: height 0.3 cap diameters`).toBeCloseTo(6, 2);
    } else {
      expect(emitter.strength, `${id}: LED strength`).toBeCloseTo(lit * 520 * (6 / 10) ** 2, 2);
      expect(emitter.radius, `${id}: LED reach 6 lens diameters`).toBeCloseTo(36, 2);
    }
    expect(Math.max(...emitter.colour), `${id}: colour at full brightness`).toBe(1);
    expect(emitter.reach).toBe("outset");
  });
  expect(scene.feather).toBe(4);
  expect(Array.isArray(scene.protected)).toBe(true);
  for (const text of scene.texts) expect(scene.protected.some(rect => rect[0] <= text[0] + 0.5 && rect[1] <= text[1] + 0.5 && rect[0] + rect[2] >= text[0] + text[2] - 0.5 && rect[1] + rect[3] >= text[1] + text[3] - 0.5), `a protected rect covers the text at ${text.map(Math.round)}`).toBe(true);
  expect(scene.outset.top, "the emitters' outset").toBeGreaterThanOrEqual(48);
  if (level === "instrument") {
    const objectIds = scene.objects.map(object => object.id);
    // The plain keys first, then each bank's plinth, then the keys in document order.
    expect(objectIds).toEqual(["send", "plain", "bank", "range", ...ids]);
    let emitter = 0;
    for (const object of scene.objects.filter(object => object.id in keys)) {
      const [kind] = keys[object.id];
      if (kind === "key") {
        expect(object.parts, `${object.id}: parts`).toEqual(["bezel:pushBezel", expect.stringMatching(/^lens:lens #[0-9a-f]{6}$/), expect.stringMatching(/^plinth:key #[0-9a-f]{6}$/), "cap:keyCap"]);
        expect(object.glass.slice(0, 2), `${object.id}: the ring is glass`).toEqual([undefined, "lens"]);
        expect(object.emitters.slice(0, 2), `${object.id}: the ring's emitter`).toEqual([undefined, emitter++]);
        expect(object.pose.slice(2, 4), `${object.id}: the body and the captured cap travel 4 px`).toEqual([-4, -4]);
        expect(object.casters[3], "the captured cap casts nothing").toBe("none");
      } else {
        expect(object.parts, `${object.id}: parts`).toEqual([expect.stringMatching(/^plinth:key #[0-9a-f]{6}$/), "cap:keyCap", expect.stringMatching(/^lens:lens #[0-9a-f]{6}$/)]);
        expect(object.glass, `${object.id}: the LED is glass`).toEqual([undefined, undefined, "lens"]);
        expect(object.emitters, `${object.id}: the LED's emitter`).toEqual([undefined, undefined, emitter++]);
        expect(object.pose.slice(0, 2), `${object.id}: the body and the captured cap travel 4 px`).toEqual([-4, -4]);
        expect(object.casters[1], "the captured cap casts nothing").toBe("none");
      }
      expect(object.close, `${object.id}: bounds are the control's box`).toBe(true);
    }
    for (const plinth of scene.objects.filter(object => object.id === "bank" || object.id === "range")) {
      expect(plinth.parts, `${plinth.id}: one part`).toEqual(["bezel:pushBezel"]);
      expect(plinth.close, `${plinth.id}: bounds are the group's box`).toBe(true);
    }
    expect(scene.objects.find(object => object.id === "cb-locked").state).toMatchObject({ disabled: true });
    expect(scene.objects.find(object => object.id === "r-pad").state).toMatchObject({ disabled: true });
    expect(Object.fromEntries(scene.objects.filter(object => object.id in keys).map(object => [object.id, object.t])), "the cap's place from the native state").toEqual(Object.fromEntries(ids.map(id => [id, startNumbers(id).t])));
    // The CSS paint of every part the GPU draws is hidden, the socket under the ring stays printed.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-latch, .ug-push__bezel, .ug-push__ring, .ug-push__led, .ug-bank__plinth")].filter(element => !element.hasAttribute("data-strata-dome")).length)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-push__socket")].filter(element => getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)").length)).toBe(0);
  } else {
    const wanted = level === "relief" ? { bezel: "raised", cap: "raised" } : { bezel: "slab", cap: "key" };
    const entryOf = (id, selector) => page.evaluate(([id, selector]) => {
      const probe = window.strataLatchProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect(), element = selector === "plinth" ? document.getElementById(id).closest("fieldset").querySelector(".ug-bank__plinth") : document.getElementById(id).parentElement.querySelector(selector), rect = element.getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (rect.left - panel.left)) < 0.6 && Math.abs(p.rect[1] - (rect.top - panel.top)) < 0.6 && Math.abs(p.rect[2] - rect.width) < 0.6) ?? null;
    }, [id, selector]);
    const [bezel, cap, plinth, bankCap] = [await entryOf("cb-monitor", ".ug-push__bezel"), await entryOf("cb-monitor", ".ug-push__cap"), await entryOf("r-piano", "plinth"), await entryOf("r-piano", ".ug-push__cap")];
    if (level === "relief") expect([bezel, cap, plinth, bankCap]).toMatchObject([{ face: "raised", material: "satin" }, { face: "raised" }, { face: "raised", material: "satin" }, { face: "raised" }]);
    else expect([bezel, cap, plinth, bankCap]).toMatchObject([{ object: "slab", material: "satin" }, { object: "key", finish: true }, { object: "slab", material: "satin" }, { object: "key", finish: true }]);
    expect(wanted).toBeTruthy();
    // A selected key is pressed: Relief sinks the face, Objects travels the key.
    const organ = await entryOf("r-organ", ".ug-push__cap");
    expect(organ.state.pressed, "the selected key's cap is pressed").toBe(true);
    expect(bankCap.state.pressed, "an unselected key's is not").toBe(false);
    // The CSS paint of the ring and LED stays (captured) at these levels: the light is the emitter.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-push__ring")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(0);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters, ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of ids) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment: with every control unlit (no light), what the controls draw lies inside their boxes (a bank's plinth inside its group's), and
  // hits on those pixels find the control; at the Instrument level over three depths.
  await allUnlit(page);
  const boxes = await controlBoxes(page);
  const readout = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#latch-read"))[0]);
  const depths = level === "instrument" ? [0, null, 1] : [null];
  const hideAll = hidden => page.evaluate(hidden => { for (const element of document.querySelectorAll("#send, #plain, .ug-latch, .ug-bank__plinth")) element.style.visibility = hidden ? "hidden" : ""; }, hidden);
  for (const value of depths) {
    await depth(page, value);
    const label = value === null ? "0.5" : String(value);
    // The plain buttons beside them are hidden in both frames: they are not what this measures.
    await hideAll(true);
    const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-bare`);
    await hideAll(false);
    await page.evaluate(() => { for (const element of document.querySelectorAll("#send, #plain")) element.style.visibility = "hidden"; });
    const drawn = difference(await frame(page, `${level}-dpr${dpr}-depth${label}-off`), bare, [...boxes, readout], { points: true });
    await page.evaluate(() => { for (const element of document.querySelectorAll("#send, #plain")) element.style.visibility = ""; });
    expect(drawn.inside, `depth ${label}: the controls are drawn`).toBeGreaterThan(3000 * dpr * dpr);
    expect(drawn.outside, `depth ${label}: no pixel outside a box (${JSON.stringify(drawn.outsideSamples)}; boxes ${JSON.stringify(boxes.map(box => [box.id, ...[box.x, box.y, box.width, box.height].map(Math.round)]))})`).toBe(0);
    const hit = await hitsOn(page, drawn.changed.filter(([x, y]) => !(x >= readout.x && x <= readout.x + readout.width && y >= readout.y && y <= readout.y + readout.height)));
    expect(hit.mismatches, `depth ${label}: native hits on pixels the controls draw (${JSON.stringify(hit.samples)})`).toBe(0);
    await healthy(page, `depth ${label}`, level);
    console.log(`DPR ${dpr} ${level}: depth ${label}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
  }
  await depth(page, null);

  // A held ring: its box changes (the cap travels, the ring glows), the face past its edge is lit within its reach and not beyond it,
  // and the text near it keeps the guard.
  const off = await frame(page, `${level}-dpr${dpr}-all-off`);
  await page.evaluate(() => document.getElementById("cb-monitor").parentElement.setAttribute("data-strata-down", "true"));
  const on = await frame(page, `${level}-dpr${dpr}-monitor-held`);
  await page.evaluate(() => document.getElementById("cb-monitor").parentElement.removeAttribute("data-strata-down"));
  const monitor = boxes.find(box => box.id === "cb-monitor"), centre = { x: monitor.x + monitor.width / 2, y: monitor.y + monitor.height / 2 }, reach = 80;
  const lit1 = difference(off, on, [monitor, readout, { cx: centre.x, cy: centre.y, radius: reach + 3 }]);
  const inBox = difference(off, on, [monitor]);
  expect(inBox.inside, "the key's box changes").toBeGreaterThan(100 * dpr * dpr);
  expect(lit1.outside, `nothing changes beyond the ring's reach (${JSON.stringify(lit1.outsideSamples)})`).toBe(0);
  const panelBox = (await inFrame(page, "#latch-panel"))[0];
  const texts = scene.texts.map(text => [text[0] + panelBox.x, text[1] + panelBox.y, text[2], text[3]]);
  const everyBox = boxes;
  const pointOk = point => !texts.some(box => point.x >= box[0] - 12 && point.x <= box[0] + box[2] + 12 && point.y >= box[1] - 12 && point.y <= box[1] + box[3] + 12) && !everyBox.some(box => point.x >= box.x - 3 && point.x <= box.x + box.width + 3 && point.y >= box.y - 3 && point.y <= box.y + box.height + 3);
  const ring = {};
  for (const scale of [1.5, 2, 3]) {
    const gains = [];
    for (let step = 0; step < 48; step++) {
      const angle = (step / 48) * 2 * Math.PI, point = { x: centre.x + Math.cos(angle) * 20 * scale, y: centre.y + Math.sin(angle) * 20 * scale };
      if (point.x < panelBox.x + 8 || point.y < panelBox.y + 8 || point.x > panelBox.x + panelBox.width - 8 || point.y > panelBox.y + panelBox.height - 8) continue;
      if (!pointOk(point)) continue;
      gains.push(gain(off, on, point, dpr));
    }
    ring[scale] = { points: gains.length, median: median(gains) };
  }
  console.log(`DPR ${dpr} ${level}: monitor held: ${inBox.inside} px in its box; face gain at 1.5 / 2 / 3 cap diameters: ${JSON.stringify(ring)}; changed within reach ${lit1.inside}, beyond ${lit1.outside}`);
  expect(ring[1.5].points, "sample points at 1.5 diameters").toBeGreaterThan(2);
  expect(ring[1.5].median, "the face is lit at 1.5 diameters").toBeGreaterThan(0.4);
  expect(ring[1.5].median).toBeGreaterThan(ring[3].median ?? -1);
  let worst = 0, checkedText = 0;
  for (const text of texts) {
    if (Math.hypot(text[0] + text[2] / 2 - centre.x, text[1] + text[3] / 2 - centre.y) > reach) continue;
    if (text[0] < readout.x + readout.width && text[0] + text[2] > readout.x && text[1] < readout.y + readout.height && text[1] + text[3] > readout.y) continue;
    const result = excess(off, on, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr);
    worst = Math.max(worst, result.levels); checkedText++;
  }
  console.log(`DPR ${dpr} ${level}: ${checkedText} text rects within reach, worst change beyond the guard ${worst} levels`);
  expect(checkedText).toBeGreaterThan(1);
  expect(worst, "protected text stays within the guard (the label stands 12 px from the key: its antialiased dark pixels move up to about 3 levels beyond the 4%)").toBeLessThanOrEqual(3);
  await healthy(page, "monitor held", level);

  // A selected bank key: its box and its LED's reach change and nothing else; its cap is down.
  const settledOff = await frame(page, `${level}-dpr${dpr}-all-off-again`, { wait: 400 });
  await page.evaluate(() => { document.getElementById("r-strings").checked = true; });
  const selected = await frame(page, `${level}-dpr${dpr}-strings-selected`);
  await page.evaluate(() => { document.getElementById("r-strings").checked = false; });
  const strings = boxes.find(box => box.id === "r-strings"), group = (await inFrame(page, "#bank"))[0];
  const ledAt = await page.evaluate(() => { const frameBox = document.getElementById("frame").getBoundingClientRect(), box = document.getElementById("r-strings").parentElement.querySelector(".ug-push__led").getBoundingClientRect(); return { x: box.left + box.width / 2 - frameBox.left, y: box.top + box.height / 2 - frameBox.top }; });
  // Two settled captures of the same page differ by up to 3 levels (a channel) along the edges of a key that was held and released earlier (the CSS-painted edges are
  // rasterised again), so a change under 14 in total is not counted here; the LED's light is far above it.
  const picked = difference(settledOff, selected, [strings, group, readout, { cx: ledAt.x, cy: ledAt.y, radius: 36 + 3 }], { threshold: 14 });
  const pickedBox = difference(settledOff, selected, [strings]);
  console.log(`DPR ${dpr} ${level}: strings selected: ${pickedBox.inside} px in its key's box, ${picked.inside} within its box, its group and its LED's reach, ${picked.outside} beyond`);
  expect(pickedBox.inside, "the key's box changes").toBeGreaterThan(60 * dpr * dpr);
  expect(picked.outside, `nothing changes beyond the group and the LED's reach (${JSON.stringify(picked.outsideSamples)}, extent ${JSON.stringify(picked.outsideExtent)}; boxes ${JSON.stringify(boxes.map(box => [box.id, ...[box.x, box.y, box.width, box.height].map(Math.round)]))})`).toBe(0);
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`a real check and a real selection at ${level} give fresh pixels with GPU on, no hit-geometry update, and light the emitters only while they are on`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await allUnlit(page);
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#latch-read"))[0]);
  await page.evaluate(() => { document.getElementById("latch-read").style.visibility = "hidden"; });
  const start0 = await strengths(page);
  expect(Object.values(start0).every(value => value === 0), `all unlit: every emitter dark (${JSON.stringify(start0)})`).toBe(true);
  const boxes = await controlBoxes(page);
  const before = await frame(page, `${level}-check-before`);
  const start = await counts(page);
  const monitor = boxes.find(box => box.id === "cb-monitor");
  const box = await page.locator("#cb-monitor").boundingBox();
  // Held: lit while the pointer is down.
  await page.mouse.move(...centreOf(box));
  await page.mouse.down();
  expect((await strengths(page))["cb-monitor:ring"], "lit while held").toBeCloseTo(600, 1);
  if (level === "instrument") {
    await page.evaluate(() => document.getAnimations().length && Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined))));
    await page.evaluate(() => window.strataLatchProbe.refresh());
    const held = await page.evaluate(() => window.strataLatchProbe.scene().objects.find(object => object.id === "cb-monitor"));
    expect(held.t, "held: the cap all the way down").toBe(1);
    expect(held.parts[2].state.pressed, "the part state says pressed").toBe(true);
    // 40 frames of the cap's throw and the ring's light: uniform writes, no capture.
    const throwing = await page.evaluate(async () => {
      const probe = window.strataLatchProbe, next = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 4; index++) await next();
      const first = probe.counts();
      for (let index = 0; index < 40; index++) await next();
      const last = probe.counts();
      return { captures: last.captures - first.captures, uploads: last.uploads - first.uploads, geometryUpdates: last.geometryUpdates - first.geometryUpdates };
    });
    console.log(`instrument: 40 frames held: ${throwing.captures} captures, ${throwing.uploads} uploads, ${throwing.geometryUpdates} hit-geometry updates`);
    expect(throwing).toEqual({ captures: 0, uploads: 0, geometryUpdates: 0 });
  }
  const held = await frame(page, `${level}-check-held`, { move: false, wait: 400 });
  await page.mouse.up();
  const checked = await strengths(page);
  expect(checked["cb-monitor:ring"], "latched: the ring stays lit").toBeCloseTo(600, 1);
  const after = await frame(page, `${level}-check-after`, { wait: 400 });
  const end = await counts(page);
  const reach = { cx: monitor.x + monitor.width / 2, cy: monitor.y + monitor.height / 2, radius: 80 + 3 };
  const changed = difference(before, after, [monitor, read, reach]);
  const heldChange = difference(before, held, [monitor, read, reach]);
  console.log(`${level}: a real check: ${changed.inside} px changed, ${changed.outside} outside its reach, ${heldChange.inside} while held; ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.geometryUpdates - start.geometryUpdates} hit-geometry updates`);
  expect(changed.inside, "fresh pixels after the check").toBeGreaterThan(300);
  expect(heldChange.inside, "fresh pixels while held").toBeGreaterThan(300);
  expect(changed.outside, `no stale or stray pixels (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
  expect(heldChange.outside).toBe(0);
  expect(end.mode).toBe("gpu");
  expect(end.geometryUpdates - start.geometryUpdates, "no hit-geometry update").toBe(0);
  await healthy(page, "check", level);
  // Unchecking puts it back: the DOM and the emitters (the settled frame is stable: a second capture of it differs by 0 pixels).
  await page.mouse.click(...centreOf(box));
  await page.mouse.move(2, 2);
  expect((await strengths(page))["cb-monitor:ring"], "unchecked: dark").toBe(0);
  const unchecked = await frame(page, `${level}-check-off`, { wait: 400 });
  const again = await frame(page, `${level}-check-off-again`, { wait: 400 });
  const stable = difference(unchecked, again, [monitor, read, reach]);
  expect([stable.inside, stable.outside], `two settled captures are identical (differences within ${JSON.stringify(stable.extent)})`).toEqual([0, 0]);

  // A real selection in a bank: the LED lights, the key goes down, the one that was down comes up.
  await page.mouse.click(...centreOf(await page.locator("#r-organ").boundingBox()));
  await page.mouse.move(2, 2);
  let lit = await strengths(page);
  expect([lit["r-organ:led"], lit["r-strings:led"]], "the selected key's LED is lit").toEqual([187.2, 0]);
  await page.mouse.click(...centreOf(await page.locator("#r-strings").boundingBox()));
  await page.mouse.move(2, 2);
  lit = await strengths(page);
  expect([lit["r-organ:led"], lit["r-strings:led"]], "one at a time: the LEDs trade places").toEqual([0, 187.2]);
  if (level === "instrument") {
    await page.evaluate(() => window.strataLatchProbe.refresh());
    expect(await page.evaluate(() => Object.fromEntries(window.strataLatchProbe.scene().objects.filter(object => object.id.startsWith("r-")).map(object => [object.id, object.t]))), "one key down").toEqual({ "r-piano": 0, "r-organ": 0, "r-strings": 0.45, "r-pad": 0 });
  }
  // A segment: the same, in the SegmentedControl.
  await page.mouse.click(...centreOf(await page.locator("#s-day").boundingBox()));
  await page.mouse.move(2, 2);
  lit = await strengths(page);
  expect([lit["s-day:led"], lit["s-week:led"], lit["s-month:led"]], "the segment's LED").toEqual([187.2, 0, 0]);
  // Hover reaches the parts; a disabled key is flat and unlit.
  const stateOf = id => page.evaluate(([id, level]) => {
    const scene = window.strataLatchProbe.scene();
    if (level === "instrument") return scene.objects.find(object => object.id === id).parts.map(part => part.state);
    const cap = document.getElementById(id).parentElement.querySelector(".ug-push__cap").getBoundingClientRect(), panel = window.strataLatchProbe.panel().getBoundingClientRect();
    return scene.primitives.filter(entry => entry.rect && Math.abs(entry.rect[0] - (cap.left - panel.left)) < 0.6 && Math.abs(entry.rect[1] - (cap.top - panel.top)) < 0.6).map(entry => entry.state);
  }, [id, level]);
  const settle = () => page.evaluate(async () => { window.strataLatchProbe.refresh(); await window.strataLatchProbe.controller.settle(); });
  await page.mouse.move(2, 2);
  await settle();
  expect((await stateOf("cb-monitor")).every(state => !state.hover && !state.disabled)).toBe(true);
  await page.mouse.move(...centreOf(await page.locator("#cb-monitor").boundingBox()));
  await settle();
  expect((await stateOf("cb-monitor")).every(state => state.hover === true && !state.disabled), "hover").toBe(true);
  expect((await stateOf("cb-locked")).every(state => state.disabled === true), "disabled").toBe(true);
  expect((await stateOf("r-pad")).every(state => state.disabled === true), "disabled key").toBe(true);
  await healthy(page, "states", level);
  await context.close();
});

test("under more contrast the Instrument latching forms have no light, and under reduced transparency the rings and LEDs are opaque lacquer", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0), "every emitter is off").toBe(true);
  await page.waitForFunction(() => window.strataLatchProbe.instrument().layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataLatchProbe.refresh());
  scene = await sceneOf(page);
  const own = scene.objects.filter(object => object.id in keys);
  expect(own.every(object => object.parts.filter(part => part.startsWith("lens")).every(part => part.startsWith("lens:lensOpaque "))), "opaque rings and LEDs").toBe(true);
  expect(own.every(object => object.glass.every(glass => glass === undefined)), "no glass").toBe(true);
  expect(scene.emitters.some(emitter => emitter.strength > 0), "the latched keys still give light").toBe(true);
  await page.waitForFunction(() => window.strataLatchProbe.instrument().layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the latching forms page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-latching-forms.html?dom");
  await page.waitForFunction(() => window.strataLatchProbe);
  const act = async () => {
    await page.locator("#cb-monitor").focus(); await page.keyboard.press("Space");
    await page.locator("#r-organ").focus(); await page.keyboard.press("ArrowRight");
    await page.locator("#s-week").focus(); await page.keyboard.press("ArrowLeft");
  };
  await act();
  const dom = await page.locator("#latch-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#latch-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('checkbox "Monitor" [checked]');
    expect(gpu).toContain('checkbox "Pad group" [checked=mixed]');
    expect(gpu).toContain('radio "Strings" [checked]');
    expect(gpu).toContain('radio "Day" [checked]');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#latch-panel").withTags(tags).analyze();
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
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, ...options });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  await page.goto(`/ui-latching-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataLatchProbe);
  return { context, page };
}
const log = page => page.evaluate(() => ({ ...window.feedbackLog, pulses: [...window.feedbackLog.pulses] }));
const click = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); };

test("feedback is off by default: real changes create no audio and pulse nothing", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "");
  for (const id of ["cb-monitor", "r-strings", "s-day"]) await click(page, id);
  await page.locator("#r-strings").focus();
  await page.keyboard.press("ArrowRight");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  console.log("off by default: 4 real changes, 0 audio contexts, 0 sounds, 0 pulses");
  await context.close();
});

test("with sound on, audio waits for the first gesture on a latching key, then each real change plays its click once", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "&sound");
  expect((await log(page)).contexts, "nothing before a gesture").toBe(0);
  await page.locator("#cb-monitor").evaluate(input => input.click());
  await page.waitForTimeout(60);
  expect(await log(page), "a scripted click is no gesture").toMatchObject({ contexts: 0, played: 0 });
  await page.mouse.click(5, 5);
  expect((await log(page)).contexts, "a gesture elsewhere creates nothing").toBe(0);
  await click(page, "cb-phantom");
  let now = await log(page);
  expect(now.contexts, "the first gesture on a key creates the context").toBe(1);
  expect(now.resumes).toBeGreaterThanOrEqual(1);
  expect(now.played, "its change plays once").toBe(1);
  await click(page, "r-strings");
  expect((await log(page)).played, "a selection plays once").toBe(2);
  await click(page, "r-strings");
  expect((await log(page)).played, "selecting the selected key is no change").toBe(2);
  await page.locator("#cb-monitor").evaluate(input => { input.checked = !input.checked; });
  await page.waitForTimeout(60);
  expect((await log(page)).played, "a script's assignment is no change event").toBe(2);
  // A held press plays as the change lands, not as it goes down or up; arrows play once per selection; a label press plays too.
  const box = await page.locator("#s-day").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await log(page)).played, "nothing on the way down").toBe(2);
  await page.mouse.up();
  await page.waitForTimeout(60);
  expect((await log(page)).played, "one on the change").toBe(3);
  await page.locator("#r-strings").focus();
  await page.keyboard.press("ArrowRight");
  expect((await log(page)).played, "an arrow plays once").toBe(4);
  await page.getByText("Phantom", { exact: true }).click();
  await page.waitForTimeout(60);
  now = await log(page);
  expect(now.played, "a press on the label plays once").toBe(5);
  expect(now.contexts, "one context for all of them").toBe(1);
  expect(await page.evaluate(() => window.strataLatchProbe.events().filter(event => event.type === "change").length), "the native event path is unchanged: one change per real change (and the script's)").toBe(6);
  console.log(`sound on: ${now.contexts} context, ${now.played} clicks for 5 real changes`);
  await context.close();
});

test("with haptics on a real change pulses 8 ms once, a scripted one does not, reduced motion stops pulses, and muted is silent", async ({ browser }) => {
  const haptics = await feedbackPage(browser, "&haptics");
  await click(haptics.page, "cb-monitor");
  expect((await log(haptics.page)).pulses, "a check pulses the click's 8 ms").toEqual([8]);
  await click(haptics.page, "r-strings");
  expect((await log(haptics.page)).pulses, "a selection pulses once").toEqual([8, 8]);
  await click(haptics.page, "r-strings");
  expect((await log(haptics.page)).pulses, "no change, no pulse").toEqual([8, 8]);
  await haptics.page.waitForTimeout(1100);
  await haptics.page.locator("#cb-monitor").evaluate(input => input.click());
  expect((await log(haptics.page)).pulses, "a scripted one does not (no gesture of the visitor's)").toEqual([8, 8]);
  await haptics.page.locator("#s-week").focus();
  await haptics.page.keyboard.press("ArrowRight");
  expect((await log(haptics.page)).pulses, "an arrow is the visitor's own: one pulse").toEqual([8, 8, 8]);
  await haptics.page.getByText("Phantom", { exact: true }).click();
  expect((await log(haptics.page)).pulses, "a press on the label pulses once").toEqual([8, 8, 8, 8]);
  await haptics.context.close();
  const reduced = await feedbackPage(browser, "&haptics", { reducedMotion: "reduce" });
  await click(reduced.page, "cb-monitor");
  expect((await log(reduced.page)).pulses, "none under reduced motion").toEqual([]);
  await reduced.context.close();
  const muted = await feedbackPage(browser, "&sound&haptics&muted");
  await click(muted.page, "cb-monitor");
  await click(muted.page, "r-strings");
  expect(await log(muted.page), "muted: no sound and no pulse").toMatchObject({ played: 0, pulses: [] });
  await muted.context.close();
});
