/**
 * Browser suite for the Strata PushButton forms (anatomy pages `button.md` and `toggle-button.md`, *Push-button forms*) on
 * `ui-push-button.html` (`window.strataPushProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM
 * behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real buttons: a momentary button is held (`data-strata-down`, the ring lit, the cap down) from the
 *   pointer or Enter or Space going down to it going up anywhere, the key going up or the button losing focus, and clicks
 *   once; a latching button toggles `aria-pressed` (the ring and the LED lit, the cap at 0.45 of its travel), and is held
 *   too; a disabled one is never held, lit or moved; a submit button submits its name and value; a plain Button and
 *   ToggleButton beside them are unchanged; a `form` that names no push form is the native form owner.
 * - Touch: a tap and a touch hold. Mobile and text size: at 320 and 390 px no overflow, boxes of at least 64 px (24 at least),
 *   the cap inside its bezel; at 200% text the cap grows and wraps, and the bezel and ring follow it.
 * - Preferences and accessibility: axe in light, dark and face mode, forced colours, more contrast, reduced motion.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on through presses; a panel with push buttons takes a
 *   version 4 scene with an emitter per ring and per LED, the protected text and a feather; at the Instrument level each
 *   button is a bezel, a glass ring, a body and a captured cap (and an LED), every pixel they draw lies inside the button's
 *   box at every depth, and native hits on part pixels find the button; 0 hit mismatches over every box; a lit ring changes
 *   pixels in its box and lights the face within its reach and not beyond it, and protected text stays within the guard; a real
 *   press adds no hit-geometry update, and at the Instrument level no capture.
 * - Feedback (`click`, opt-in): off by default; with sound on, audio waits for a gesture and each press plays once; with
 *   haptics on a real press pulses 8 ms once (momentary and latching), a script's click does not.
 * - The accessibility snapshot is the same in DOM and GPU modes.
 * Screenshots go to the `ui-push-button` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-push-button");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** The push buttons in document order, their form, and whether each is latched at load. */
const pushes = { record: ["momentary"], talk: ["momentary"], mute: ["latching", false], phantom: ["latching", true], locked: ["momentary"], "latched-off": ["latching", true], send: ["momentary"] };
const ids = Object.keys(pushes);

const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
/** Whether the behaviour holds the button down (`data-strata-down="true"`; released is `"false"`). */
const down = (page, id) => page.locator(`#${id}`).evaluate(button => button.getAttribute("data-strata-down") === "true");
const pressed = (page, id) => page.locator(`#${id}`).getAttribute("aria-pressed");
const numbers = (page, id) => page.locator(`#${id}`).evaluate(button => { const style = getComputedStyle(button); return { lit: Number(style.getPropertyValue("--strata-lit")), led: Number(style.getPropertyValue("--strata-led")), t: Number(style.getPropertyValue("--strata-push-t")) }; });
/** The numbers once the CSS transitions on them have ended. */
async function settled(page, id) {
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  return numbers(page, id);
}
const events = page => page.evaluate(() => window.strataPushProbe.events());
const clear = page => page.evaluate(() => window.strataPushProbe.clearEvents());
const clicks = async page => (await events(page)).filter(event => event.type === "click").map(event => event.id);

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-push-button.html?plain${query}`);
  await page.waitForFunction(() => window.strataPushProbe);
  return { context, page, errors };
}

test("a momentary push button is held while it is pressed, lit and down, and clicks once; a latching one toggles aria-pressed and stays down", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  // Roles, names and the markup the page was built from: the native button is the control, the object is decoration.
  await expect(page.getByRole("button", { name: "Record" })).toHaveCount(1);
  await expect(page.locator("#mute")).toHaveRole("button");
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#phantom")).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator("#record").evaluate(button => [button.matches("button"), button.getAttribute("data-strata-face"), button.querySelector(".ug-push__object").getAttribute("aria-hidden")])).toEqual([true, null, "true"]);
  // The box: the cap plus 24 px each way, 64 high; a short label is wider than the box's minimum.
  const record = await page.locator("#record").boundingBox();
  expect(record.height).toBe(64);
  expect(record.width).toBeGreaterThanOrEqual(64);
  expect(await numbers(page, "record")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await numbers(page, "phantom"), "latched at load: ring and LED lit, the cap at 0.45").toEqual({ lit: 1, led: 1, t: 0.45 });
  expect(await numbers(page, "locked")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await numbers(page, "latched-off"), "a disabled latched button is unlit and does not move").toEqual({ lit: 0, led: 0, t: 0 });

  // A momentary press: held from the pointer going down, lit and down, the click once on release.
  await page.mouse.move(...centreOf(record));
  await page.mouse.down();
  expect(await down(page, "record")).toBe(true);
  expect(await settled(page, "record")).toEqual({ lit: 1, led: 0, t: 1 });
  expect(await clicks(page), "no click until the pointer comes up").toEqual([]);
  await page.mouse.up();
  expect(await down(page, "record")).toBe(false);
  expect(await settled(page, "record")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await clicks(page)).toEqual(["record"]);
  // Released elsewhere: the button still lets go, and no click lands on it.
  await clear(page);
  await page.mouse.move(...centreOf(record));
  await page.mouse.down();
  await page.mouse.move(600, 400);
  expect(await down(page, "record"), "held while the pointer is down, wherever it goes").toBe(true);
  await page.mouse.up();
  expect(await down(page, "record")).toBe(false);
  expect(await clicks(page)).toEqual([]);

  // Space holds it while down and clicks on release; Enter clicks on press and holds until released.
  await clear(page);
  await page.locator("#talk").focus();
  await page.keyboard.down("Space");
  expect(await down(page, "talk")).toBe(true);
  expect(await clicks(page)).toEqual([]);
  await page.keyboard.up("Space");
  expect(await down(page, "talk")).toBe(false);
  expect(await clicks(page)).toEqual(["talk"]);
  await page.keyboard.down("Enter");
  expect(await down(page, "talk")).toBe(true);
  expect(await clicks(page), "Enter clicks as it goes down").toEqual(["talk", "talk"]);
  await page.keyboard.up("Enter");
  expect(await down(page, "talk")).toBe(false);
  // Losing focus while a key is down lets go.
  await page.keyboard.down("Space");
  expect(await down(page, "talk")).toBe(true);
  await page.locator("#plain").focus();
  expect(await down(page, "talk")).toBe(false);
  await page.keyboard.up("Space");
  await clear(page);

  // A latching press toggles aria-pressed once, with the state in the lights and the travel.
  const mute = page.locator("#mute");
  await mute.click();
  expect(await pressed(page, "mute")).toBe("true");
  expect(await settled(page, "mute")).toEqual({ lit: 1, led: 1, t: 0.45 });
  expect((await events(page)).filter(event => event.id === "mute").map(event => event.type)).toEqual(["click", "strata-pressed-change"]);
  await mute.click();
  expect(await pressed(page, "mute")).toBe("false");
  expect(await settled(page, "mute")).toEqual({ lit: 0, led: 0, t: 0 });
  // Held while pressed: all the way down, whether latched or not, then back to where it rests.
  await page.mouse.move(...centreOf(await mute.boundingBox()));
  await page.mouse.down();
  expect(await settled(page, "mute")).toEqual({ lit: 1, led: 0, t: 1 });
  await page.mouse.up();
  expect(await pressed(page, "mute")).toBe("true");
  expect(await settled(page, "mute")).toEqual({ lit: 1, led: 1, t: 0.45 });
  await mute.focus();
  await page.keyboard.press("Space");
  expect(await pressed(page, "mute")).toBe("false");
  await page.keyboard.press("Enter");
  expect(await pressed(page, "mute")).toBe("true");
  // The label, the legend of the state: the accessible name never changes.
  await expect(page.getByRole("button", { name: "Mute" })).toHaveAttribute("aria-pressed", "true");

  // Disabled and aria-disabled: never held, lit or moved, and nothing activates.
  await clear(page);
  await page.locator("#locked").click({ force: true });
  await page.locator("#locked").focus();
  await page.keyboard.press("Space");
  expect(await down(page, "locked")).toBe(false);
  expect(await numbers(page, "locked")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await clicks(page)).toEqual([]);
  await page.evaluate(() => { const button = document.getElementById("record"); button.setAttribute("aria-disabled", "true"); });
  await page.mouse.click(...centreOf(await page.locator("#record").boundingBox()));
  expect(await down(page, "record")).toBe(false);
  expect(await numbers(page, "record")).toEqual({ lit: 0, led: 0, t: 0 });
  await page.evaluate(() => { document.getElementById("record").removeAttribute("aria-disabled"); });

  // A submit button submits its name and value, once; a plain Button and ToggleButton are unchanged.
  await clear(page);
  await page.locator("#send").click();
  await expect(page.locator("#push-data")).toHaveText(JSON.stringify({ send: "1" }));
  expect((await events(page)).filter(event => event.type === "submit")).toHaveLength(1);
  expect(await page.locator("#plain").evaluate(button => [button.getAttribute("data-strata-face"), button.querySelector(".ug-push__object")])).toEqual(["raised", null]);
  await page.locator("#plain-toggle").click();
  expect(await pressed(page, "plain-toggle")).toBe("true");
  expect(await down(page, "plain-toggle")).toBe(false);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: a tap clicks and toggles, and a touch hold lights and lowers the cap, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-push-button.html?plain");
  await page.waitForFunction(() => window.strataPushProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  await page.touchscreen.tap(...centreOf(await page.locator("#talk").boundingBox()));
  expect(await clicks(page)).toEqual(["talk"]);
  await page.touchscreen.tap(...centreOf(await page.locator("#mute").boundingBox()));
  expect(await pressed(page, "mute")).toBe("true");
  expect(await settled(page, "mute")).toEqual({ lit: 1, led: 1, t: 0.45 });
  // A hold: the cap is down while the touch is.
  const client = await context.newCDPSession(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const [x, y] = centreOf(await page.locator("#record").boundingBox());
  await touch("touchStart", [{ x, y }]);
  expect(await down(page, "record")).toBe(true);
  expect(await settled(page, "record")).toEqual({ lit: 1, led: 0, t: 1 });
  await touch("touchEnd", []);
  expect(await down(page, "record")).toBe(false);
  expect(await settled(page, "record")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the push buttons reflow with no horizontal overflow, boxes of at least 64 px and the cap inside its bezel`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-push-button.html?plain");
  await page.waitForFunction(() => window.strataPushProbe);
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    pushes: [...document.querySelectorAll("button.ug-push")].map(button => {
      const box = button.getBoundingClientRect(), cap = button.querySelector(".ug-push__cap").getBoundingClientRect(), bezel = button.querySelector(".ug-push__bezel").getBoundingClientRect();
      const ring = button.querySelector(".ug-push__ring").getBoundingClientRect();
      return { id: button.id, left: box.left, right: box.right, width: box.width, height: box.height, capInBezel: cap.left >= bezel.left && cap.right <= bezel.right && cap.top >= bezel.top && cap.bottom <= bezel.bottom,
        ringInBezel: ring.left >= bezel.left && ring.right <= bezel.right, bezelInBox: bezel.left >= box.left && bezel.right <= box.right && bezel.top >= box.top && bezel.bottom <= box.bottom };
    }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const push of layout.pushes) {
    expect(Math.min(push.width, push.height), `${push.id}: box`).toBeGreaterThanOrEqual(64);
    expect(push.left).toBeGreaterThanOrEqual(0);
    expect(push.right).toBeLessThanOrEqual(width);
    expect(push, `${push.id}: the cap, the ring and the bezel nest`).toMatchObject({ capInBezel: true, ringInBezel: true, bezelInBox: true });
  }
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest box ${Math.min(...layout.pushes.map(push => Math.min(push.width, push.height)))} px`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the cap wraps and grows with its label, the bezel and the ring follow it, and nothing overflows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/ui-push-button.html?plain");
  await page.waitForFunction(() => window.strataPushProbe);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
    document.getElementById("record").querySelector(".ug-button__label").textContent = "Record the whole take";
  });
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    pushRight: Math.max(...[...document.querySelectorAll("button.ug-push")].map(button => button.getBoundingClientRect().right)),
    record: (button => { const cap = button.querySelector(".ug-push__cap").getBoundingClientRect(), bezel = button.querySelector(".ug-push__bezel").getBoundingClientRect(), box = button.getBoundingClientRect(), text = document.createRange();
      text.selectNodeContents(button.querySelector(".ug-button__label")); const t = text.getBoundingClientRect();
      return { capHeight: cap.height, boxHeight: box.height, boxWidth: box.width, textInCap: t.left >= cap.left - 1 && t.right <= cap.right + 1 && t.top >= cap.top - 1 && t.bottom <= cap.bottom + 1,
        capInBezel: cap.left >= bezel.left && cap.right <= bezel.right && cap.top >= bezel.top && cap.bottom <= bezel.bottom }; })(document.getElementById("record")),
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(320);
  expect(result.pushRight, "every push button is inside the viewport").toBeLessThanOrEqual(320);
  expect(result.record.capHeight, "the cap grows to hold the wrapped label").toBeGreaterThan(40);
  expect(result.record).toMatchObject({ textInCap: true, capInBezel: true });
  expect(result.record.boxWidth).toBeLessThanOrEqual(320);
  console.log(`200% text: record's cap ${result.record.capHeight.toFixed(1)} px high in a ${result.record.boxWidth.toFixed(1)} × ${result.record.boxHeight.toFixed(1)} box`);
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the push buttons pass axe in light, dark and face mode, and under more contrast, reduced motion and forced colours", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#push-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#push-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#push-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  // The ring and LED colour is the role's; the lit ring is lighter than the unlit one.
  const rings = await page.evaluate(() => Object.fromEntries(["record", "mute", "phantom"].map(id => [id, getComputedStyle(document.getElementById(id).querySelector(".ug-push__ring")).backgroundColor])));
  expect(rings.phantom, "a latched button's ring is lit").not.toBe(rings.mute);
  // More contrast: flat colour, no glow, edges in the text colour.
  await page.emulateMedia({ contrast: "more" });
  const more = await page.evaluate(() => { const style = getComputedStyle(document.getElementById("phantom").querySelector(".ug-push__ring")); return { border: style.borderTopWidth, glow: style.boxShadow }; });
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(parseFloat(more.border)).toBeGreaterThanOrEqual(1);
  const contrast = await new AxeBuilder({ page }).include("#push-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  // Reduced motion: lights and travel change at once.
  await page.emulateMedia({ contrast: "no-preference", reducedMotion: "reduce" });
  expect(await page.locator("#talk").evaluate(button => getComputedStyle(button).transitionDuration)).toBe("0s");
  // Forced colours: Canvas bezel and ring with ButtonText borders, Highlight when lit, GrayText when disabled.
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  const forced = await page.evaluate(() => Object.fromEntries(["mute", "phantom", "locked"].map(id => {
    const button = document.getElementById(id), ring = getComputedStyle(button.querySelector(".ug-push__ring")), cap = getComputedStyle(button.querySelector(".ug-push__cap")), bezel = getComputedStyle(button.querySelector(".ug-push__bezel"));
    return [id, { ring: ring.backgroundColor, ringBorder: ring.borderTopColor, glow: ring.boxShadow, cap: cap.borderTopStyle, bezel: bezel.borderTopStyle, border: getComputedStyle(button).borderTopWidth }];
  })));
  expect(forced.phantom.ring, "a latched ring is Highlight").not.toBe(forced.mute.ring);
  expect(forced.mute.glow, "no glow").toBe("none");
  expect(forced.locked.ringBorder, "a disabled button is edged in GrayText").not.toBe(forced.mute.ringBorder);
  expect(forced.mute).toMatchObject({ cap: "solid", bezel: "solid", border: "0px" });
  const forcedAxe = await new AxeBuilder({ page }).include("#push-panel").withTags(tags).analyze();
  expect(summary(forcedAxe.violations), "axe, forced colours").toEqual([]);
  // Focus is a ring round the bezel in every presentation.
  await page.locator("#talk").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.locator("#talk .ug-push__bezel").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await context.close();
});

test("a `form` that names no push form is the native form owner, on the plain buttons", async ({ page }) => {
  await page.goto("/ui-push-button-react.html");
  await page.waitForFunction(() => window.strataPushBinding);
  await expect(page.locator("#owned")).toHaveAttribute("form", "settings");
  await expect(page.locator("#owned")).toHaveAttribute("data-strata-face", "raised");
  await expect(page.locator("#owned")).not.toHaveAttribute("data-strata-form", /.*/);
  await expect(page.locator("#owned .ug-push__object")).toHaveCount(0);
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-push-button.html${query}`);
  await page.waitForFunction(() => window.strataPushProbe && window.strataPushProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataPushProbe.scene() !== undefined);
  await page.evaluate(() => window.strataPushProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => { const instrument = window.strataPushProbe.instrument(); return !instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"); }, null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataPushProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  // A rebuilt layer (a change of depth, a button shown again) is pending until its parts are built.
  await page.waitForFunction(() => window.strataPushProbe.instrument().layers.every(layer => layer.status !== "pending"), null, { timeout: 30000 });
  const state = await page.evaluate(() => window.strataPushProbe.instrument().layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the CSS transitions, the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    const probe = window.strataPushProbe;
    await new Promise(resolve => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 40 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    probe.refresh(); await probe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await probe.controller.settle();
  }, wait);
  // At the Instrument level, every layer built (not pending): a change of depth rebuilds the parts.
  await page.waitForFunction(() => { const instrument = window.strataPushProbe.instrument(); return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending")); }, null, { timeout: 30000 });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, inside and outside the `allowed` regions (frame CSS px), and the changed points. */
function difference(a, b, allowed, { points = false } = {}) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [], changed = [], extent = [Infinity, Infinity, -Infinity, -Infinity];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(region => region.radius !== undefined ? Math.hypot(px - region.cx, py - region.cy) <= region.radius : px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) { inside++; extent[0] = Math.min(extent[0], px); extent[1] = Math.min(extent[1], py); extent[2] = Math.max(extent[2], px); extent[3] = Math.max(extent[3], py); if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples, changed, extent: extent.map(Math.round) };
}
/** Boxes in frame CSS px. */
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id || element.closest("button")?.id };
  });
}, selector);
/** Native hits on frame points: how many land on a push button. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.closest("button.ug-push")) mismatches++;
  return { total: points.length, mismatches };
}, points);
/** elementFromPoint over a grid on a button's box (inset 0.5 px): every hit must be the button or something inside it. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const button = document.getElementById(id), box = button.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    // The button's border is a stadium (a radius of half its height), which is its hit shape: points in the box's corners outside it are the row's.
    const radius = Math.min(parseFloat(getComputedStyle(button).borderTopLeftRadius), box.width / 2, box.height / 2);
    const dx = Math.max(0, Math.abs(x - (box.left + box.width / 2)) - (box.width / 2 - radius)), dy = Math.max(0, Math.abs(y - (box.top + box.height / 2)) - (box.height / 2 - radius));
    if (Math.hypot(dx, dy) > radius - 0.75) continue;
    total++;
    const hit = document.elementFromPoint(x, y);
    // The cap and the label are the button's own content (a text node's hit is its span); the object's parts take no pointer.
    if (hit !== button && !(hit && button.contains(hit) && hit.closest(".ug-push__object") === null)) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);
/** Sets a button's state without input: the real attributes the behaviour and the toggle set. */
const setState = (page, state) => page.evaluate(state => {
  for (const [id, [key, value]] of Object.entries(state)) {
    const button = document.getElementById(id);
    if (value === null) button.removeAttribute(key); else button.setAttribute(key, value);
  }
}, state);
const allUnlit = { phantom: ["aria-pressed", "false"] };
const counts = page => page.evaluate(() => window.strataPushProbe.counts());
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
  const probe = window.strataPushProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  // The text runs of the panel (what the guard protects).
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

for (const dpr of [1, 2]) for (const level of levels) test(`the push buttons at ${level} (DPR ${dpr}): the scene, the emitters, containment, hits, the light and the guard`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version, "version 4").toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // An emitter for each ring, and one for each latching button's LED, in document order; strength from the state.
  const expected = ids.flatMap(id => {
    const [form, latched] = pushes[id], disabled = id === "locked" || id === "latched-off", on = !disabled && latched;
    return form === "latching" ? [{ id, kind: "ring", lit: on ? 1 : 0 }, { id, kind: "led", lit: on ? 1 : 0 }] : [{ id, kind: "ring", lit: 0 }];
  });
  expect(scene.emitters).toHaveLength(expected.length);
  scene.emitters.forEach((emitter, index) => {
    const { id, kind, lit } = expected[index];
    if (kind === "ring") {
      expect(emitter.strength, `${id}: ring strength`).toBeCloseTo(lit * 2400, 2);
      expect(emitter.radius, `${id}: reach 4 cap diameters`).toBeCloseTo(160, 2);
      expect(emitter.position[2], `${id}: height 0.3 cap diameters`).toBeCloseTo(12, 2);
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
    expect(objectIds).toEqual([...ids, "plain", "plain-toggle"]);
    let emitter = 0;
    for (const object of scene.objects.filter(object => object.id in pushes)) {
      const [form] = pushes[object.id];
      expect(object.parts.slice(0, 4), `${object.id}: parts`).toEqual(["bezel:pushBezel", expect.stringMatching(/^lens:lens #[0-9a-f]{6}$/), expect.stringMatching(/^plinth:key #[0-9a-f]{6}$/), "cap:keyCap"]);
      expect(object.parts).toHaveLength(form === "latching" ? 5 : 4);
      expect(object.glass.slice(0, 2), `${object.id}: the ring is glass`).toEqual([undefined, "lens"]);
      expect(object.emitters.slice(0, 2), `${object.id}: the ring's emitter`).toEqual([undefined, emitter++]);
      if (form === "latching") expect(object.emitters[4], `${object.id}: the LED's emitter`).toBe(emitter++);
      expect(object.pose.slice(2, 4), `${object.id}: the body and the captured cap travel 4 px`).toEqual([-4, -4]);
      expect(object.close, `${object.id}: bounds are the button's box`).toBe(true);
      expect(object.casters[3], "the captured cap casts nothing").toBe("none");
    }
    expect(scene.objects.find(object => object.id === "locked").state).toMatchObject({ disabled: true });
    expect(Object.fromEntries(scene.objects.filter(object => object.id in pushes).map(object => [object.id, object.t]))).toEqual({ record: 0, talk: 0, mute: 0, phantom: 0.45, locked: 0, "latched-off": 0, send: 0 });
    // The parts never depend on the state: the same names whether the button is held or not.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-push__bezel, .ug-push__ring, .ug-push__led, button.ug-push")].filter(element => !element.hasAttribute("data-strata-dome")).length)).toBe(0);
    // The socket under the ring stays printed.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-push__socket")].filter(element => getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)").length)).toBe(0);
  } else {
    const wanted = level === "relief" ? { bezel: "raised", cap: "raised" } : { bezel: "slab", cap: "key" };
    expect(scene.faces.filter(face => face === wanted.cap).length, "a cap each, and the plain buttons").toBeGreaterThanOrEqual(ids.length);
    const entryOf = selector => page.evaluate(selector => {
      const probe = window.strataPushProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect(), rect = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (rect.left - panel.left)) < 0.6 && Math.abs(p.rect[1] - (rect.top - panel.top)) < 0.6 && Math.abs(p.rect[2] - rect.width) < 0.6) ?? null;
    }, selector);
    const bezel = await entryOf("#talk .ug-push__bezel"), cap = await entryOf("#talk .ug-push__cap");
    if (level === "relief") expect([bezel, cap]).toMatchObject([{ face: "raised", material: "satin" }, { face: "raised" }]);
    else expect([bezel, cap]).toMatchObject([{ object: "slab", material: "satin" }, { object: "key", finish: true }]);
    // The CSS paint of the ring and LED stays (captured) at these levels: the light is the emitter.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-push__ring")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(0);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters, ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of [...ids, "plain", "plain-toggle"]) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length + 2} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment: with every button unlit (no light), what the push buttons draw lies inside their boxes, and hits on those
  // pixels find the button; at the Instrument level over three depths.
  await setState(page, allUnlit);
  const boxes = await inFrame(page, "button.ug-push");
  const readout = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#push-read"))[0]);
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await depth(page, value);
    const label = value === null ? "0.5" : String(value);
    // The plain buttons beside them are hidden in both frames: they are not what this measures, and a layer whose outset differs
    // (the buttons' parts are taller than the plain keys') would sample their edges a sub-pixel apart.
    await page.evaluate(() => { for (const button of document.querySelectorAll("#plain, #plain-toggle")) button.style.visibility = "hidden"; });
    await page.evaluate(() => { for (const button of document.querySelectorAll("button.ug-push")) button.style.visibility = "hidden"; });
    const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-bare`);
    await page.evaluate(() => { for (const button of document.querySelectorAll("button.ug-push")) button.style.visibility = ""; });
    const drawn = difference(await frame(page, `${level}-dpr${dpr}-depth${label}-off`), bare, [...boxes, readout], { points: true });
    expect(drawn.inside, `depth ${label}: the push buttons are drawn`).toBeGreaterThan(3000 * dpr * dpr);
    expect(drawn.outside, `depth ${label}: no pixel outside a box (${JSON.stringify(drawn.outsideSamples)}; boxes ${JSON.stringify(boxes.map(box => [box.id, ...[box.x, box.y, box.width, box.height].map(Math.round)]))})`).toBe(0);
    const hit = await hitsOn(page, drawn.changed.filter(([x, y]) => !(x >= readout.x && x <= readout.x + readout.width && y >= readout.y && y <= readout.y + readout.height)));
    expect(hit.mismatches, `depth ${label}: native hits on pixels the buttons draw`).toBe(0);
    await page.evaluate(() => { for (const button of document.querySelectorAll("#plain, #plain-toggle")) button.style.visibility = ""; });
    await healthy(page, `depth ${label}`, level);
    console.log(`DPR ${dpr} ${level}: depth ${label}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
  }
  await depth(page, null);

  // A held ring: its box changes (the cap travels, the ring glows), the face past its edge is lit within its reach and not beyond it,
  // and the text near it keeps the guard.
  const off = await frame(page, `${level}-dpr${dpr}-all-off`);
  await setState(page, { talk: ["data-strata-down", "true"] });
  const on = await frame(page, `${level}-dpr${dpr}-talk-held`);
  await setState(page, { talk: ["data-strata-down", null] });
  const talk = boxes.find(box => box.id === "talk"), centre = { x: talk.x + talk.width / 2, y: talk.y + talk.height / 2 }, reach = 160;
  const lit1 = difference(off, on, [talk, readout, { cx: centre.x, cy: centre.y, radius: reach + 3 }]);
  const inBox = difference(off, on, [talk]);
  expect(inBox.inside, "the button's box changes").toBeGreaterThan(150 * dpr * dpr);
  expect(lit1.outside, `nothing changes beyond the ring's reach (${JSON.stringify(lit1.outsideSamples)})`).toBe(0);
  const panelBox = (await inFrame(page, "#push-panel"))[0];
  const texts = scene.texts.map(text => [text[0] + panelBox.x, text[1] + panelBox.y, text[2], text[3]]);
  const everyBox = await inFrame(page, "#push-panel button");
  const pointOk = point => !texts.some(box => point.x >= box[0] - 12 && point.x <= box[0] + box[2] + 12 && point.y >= box[1] - 12 && point.y <= box[1] + box[3] + 12) && !everyBox.some(box => point.x >= box.x - 3 && point.x <= box.x + box.width + 3 && point.y >= box.y - 3 && point.y <= box.y + box.height + 3);
  const ring = {};
  for (const scale of [1.5, 2, 3]) {
    const gains = [];
    for (let step = 0; step < 48; step++) {
      const angle = (step / 48) * 2 * Math.PI, point = { x: centre.x + Math.cos(angle) * 40 * scale, y: centre.y + Math.sin(angle) * 40 * scale };
      if (point.x < panelBox.x + 8 || point.y < panelBox.y + 8 || point.x > panelBox.x + panelBox.width - 8 || point.y > panelBox.y + panelBox.height - 8) continue;
      if (!pointOk(point)) continue;
      gains.push(gain(off, on, point, dpr));
    }
    ring[scale] = { points: gains.length, median: median(gains) };
  }
  console.log(`DPR ${dpr} ${level}: talk held: ${inBox.inside} px in its box; face gain at 1.5 / 2 / 3 cap diameters: ${JSON.stringify(ring)}; changed within reach ${lit1.inside}, beyond ${lit1.outside}`);
  expect(ring[1.5].points, "sample points at 1.5 diameters").toBeGreaterThan(2);
  expect(ring[1.5].median, "the face is lit at 1.5 diameters").toBeGreaterThan(0.5);
  expect(ring[1.5].median).toBeGreaterThan(ring[3].median ?? -1);
  let worst = 0, checkedText = 0;
  for (const text of texts) {
    if (Math.hypot(text[0] + text[2] / 2 - centre.x, text[1] + text[3] / 2 - centre.y) > reach) continue;
    if (text[0] < readout.x + readout.width && text[0] + text[2] > readout.x && text[1] < readout.y + readout.height && text[1] + text[3] > readout.y) continue;
    // The held button's own label sits on the cap that moved: its cap and its text travel and are not light.
    if (text[0] >= talk.x && text[0] + text[2] <= talk.x + talk.width && text[1] >= talk.y && text[1] + text[3] <= talk.y + talk.height) continue;
    const result = excess(off, on, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr);
    worst = Math.max(worst, result.levels); checkedText++;
  }
  console.log(`DPR ${dpr} ${level}: ${checkedText} text rects within reach, worst change beyond the guard ${worst} levels`);
  expect(checkedText).toBeGreaterThan(1);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "talk held", level);
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`a real press at ${level} gives fresh pixels with GPU on, no hit-geometry update, and lights the emitter only while it is held`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#push-read"))[0]);
  await page.evaluate(() => { document.getElementById("push-read").style.visibility = "hidden"; });
  const strengths = () => page.evaluate(async () => {
    for (let attempt = 0; attempt < 60 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    window.strataPushProbe.refresh(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const scene = window.strataPushProbe.scene(), order = [...document.querySelectorAll("button.ug-push")].flatMap(button => button.dataset.strataForm === "latching" ? [`${button.id}:ring`, `${button.id}:led`] : [`${button.id}:ring`]);
    return Object.fromEntries(order.map((name, index) => [name, Math.round(scene.emitters[index].strength * 100) / 100]));
  });
  expect((await strengths())["talk:ring"]).toBe(0);
  const boxes = await inFrame(page, "button.ug-push");
  const before = await frame(page, `${level}-press-before`);
  const start = await counts(page);
  const box = await page.locator("#talk").boundingBox();
  await page.mouse.move(...centreOf(box));
  await page.mouse.down();
  expect((await strengths())["talk:ring"], "lit while held").toBeCloseTo(2400, 1);
  if (level === "instrument") {
    await page.evaluate(() => document.getAnimations().length && Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined))));
    await page.evaluate(() => window.strataPushProbe.refresh());
    const talk = await page.evaluate(() => window.strataPushProbe.scene().objects.find(object => object.id === "talk"));
    expect(talk.t, "held: the cap all the way down").toBe(1);
    expect(talk.parts[2].state.pressed, "the part state says pressed").toBe(true);
  }
  if (level === "instrument") {
    // 40 frames of the cap's throw and the ring's light: uniform writes, no capture.
    const throwing = await page.evaluate(async () => {
      const probe = window.strataPushProbe, next = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 4; index++) await next();
      const first = probe.counts();
      for (let index = 0; index < 40; index++) await next();
      const last = probe.counts();
      return { captures: last.captures - first.captures, uploads: last.uploads - first.uploads, geometryUpdates: last.geometryUpdates - first.geometryUpdates };
    });
    console.log(`instrument: 40 frames held: ${throwing.captures} captures, ${throwing.uploads} uploads, ${throwing.geometryUpdates} hit-geometry updates`);
    expect(throwing).toEqual({ captures: 0, uploads: 0, geometryUpdates: 0 });
  }
  const held = await frame(page, `${level}-press-held`, { move: false, wait: 400 });
  await page.mouse.up();
  expect((await strengths())["talk:ring"], "dark when released").toBe(0);
  const after = await frame(page, `${level}-press-after`, { wait: 400 });
  const end = await counts(page);
  const talk = boxes.find(box => box.id === "talk"), reach = { cx: talk.x + talk.width / 2, cy: talk.y + talk.height / 2, radius: 160 + 3 };
  const changed = difference(before, held, [talk, read, reach]);
  console.log(`${level}: a press: ${changed.inside} px changed, ${changed.outside} outside its reach; ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.geometryUpdates - start.geometryUpdates} hit-geometry updates`);
  expect(changed.inside, "fresh pixels while held").toBeGreaterThan(300);
  expect(changed.outside, `no stale or stray pixels (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
  const back = difference(before, after, [talk, read, reach]);
  // A few edge pixels of the CSS-painted ring differ after a transition on the cap (sub-pixel rasterisation), well under 1% of the box.
  expect(back.inside, `and back to where it was (differences within ${JSON.stringify(back.extent)}; talk ${JSON.stringify([talk.x, talk.y, talk.width, talk.height].map(Math.round))})`).toBeLessThan(0.01 * talk.width * talk.height * 4);
  expect(end.mode).toBe("gpu");
  expect(end.geometryUpdates - start.geometryUpdates, "no hit-geometry update").toBe(0);
  // At the Instrument level the CSS paint is hidden and the cap's motion held: a press is lights and a pose, no capture.
  // Every mutation of a captured subtree is captured once by core (the press's attribute going on, and off); the frames of the cap's
  // throw between them are not: at the Instrument level the CSS paint is hidden and the cap's motion held. At Relief and Objects the CSS
  // throw and the ring's light are captured content, frame by frame.
  if (level === "instrument") expect(end.captures - start.captures, "a press at the Instrument level is captured as it goes down and as it comes up, no more").toBeLessThanOrEqual(3);
  await healthy(page, "press", level);
  // A latching button: its ring and LED are lit while latched, the cap rests at 0.45 of its travel.
  await page.mouse.click(...centreOf(await page.locator("#mute").boundingBox()));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  const latched = await strengths();
  expect(latched["mute:ring"], "ring lit").toBeCloseTo(2400, 1);
  expect(latched["mute:led"], "LED lit").toBeCloseTo(187.2, 1);
  if (level === "instrument") expect((await page.evaluate(() => { window.strataPushProbe.refresh(); return window.strataPushProbe.scene().objects.find(object => object.id === "mute").t; })), "latched at 0.45").toBe(0.45);
  await page.mouse.click(...centreOf(await page.locator("#mute").boundingBox()));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  expect((await strengths())["mute:led"], "unlatched: dark").toBe(0);
  // Hover reaches the parts; a disabled button is flat and unlit.
  const stateOf = id => page.evaluate(([id, level]) => {
    const scene = window.strataPushProbe.scene();
    if (level === "instrument") return scene.objects.find(object => object.id === id).parts.map(part => part.state);
    const cap = document.getElementById(id).querySelector(".ug-push__cap").getBoundingClientRect(), panel = window.strataPushProbe.panel().getBoundingClientRect();
    return scene.primitives.filter(entry => entry.rect && Math.abs(entry.rect[0] - (cap.left - panel.left)) < 0.6 && Math.abs(entry.rect[1] - (cap.top - panel.top)) < 0.6).map(entry => entry.state);
  }, [id, level]);
  const settle = () => page.evaluate(async () => { window.strataPushProbe.refresh(); await window.strataPushProbe.controller.settle(); });
  await page.mouse.move(2, 2);
  await settle();
  expect((await stateOf("talk")).every(state => !state.hover && !state.disabled)).toBe(true);
  await page.mouse.move(...centreOf(await page.locator("#talk").boundingBox()));
  await settle();
  expect((await stateOf("talk")).every(state => state.hover === true && !state.disabled), "hover").toBe(true);
  expect((await stateOf("locked")).every(state => state.disabled === true), "disabled").toBe(true);
  await healthy(page, "states", level);
  await context.close();
});

test("under more contrast the Instrument push buttons have no light, and under reduced transparency the ring is opaque lacquer", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0), "every emitter is off").toBe(true);
  await page.waitForFunction(() => window.strataPushProbe.instrument().layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataPushProbe.refresh());
  scene = await sceneOf(page);
  expect(scene.objects.filter(object => object.id in pushes).every(object => object.parts[1].startsWith("lens:lensOpaque ")), "opaque rings").toBe(true);
  expect(scene.objects.filter(object => object.id in pushes).every(object => object.glass[1] === undefined), "no glass").toBe(true);
  expect(scene.emitters.some(emitter => emitter.strength > 0), "the latched button still gives light").toBe(true);
  await page.waitForFunction(() => window.strataPushProbe.instrument().layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the push button page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-push-button.html?dom");
  await page.waitForFunction(() => window.strataPushProbe);
  const act = async () => { await page.locator("#mute").focus(); await page.keyboard.press("Space"); await page.locator("#phantom").focus(); await page.keyboard.press("Enter"); };
  await act();
  const dom = await page.locator("#push-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#push-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('button "Record"');
    expect(gpu).toContain('button "Mute" [pressed]');
    expect(gpu).toContain('button "48 V"');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#push-panel").withTags(tags).analyze();
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
  await page.goto(`/ui-push-button.html?plain${query}`);
  await page.waitForFunction(() => window.strataPushProbe);
  return { context, page };
}
const log = page => page.evaluate(() => ({ ...window.feedbackLog, pulses: [...window.feedbackLog.pulses] }));
const click = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); };

test("feedback is off by default: real presses create no audio and pulse nothing", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "");
  for (const id of ["record", "talk", "mute"]) await click(page, id);
  await page.locator("#phantom").focus();
  await page.keyboard.press("Space");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  console.log("off by default: 4 real presses, 0 audio contexts, 0 sounds, 0 pulses");
  await context.close();
});

test("with sound on, audio waits for the first gesture on a push button, then each press plays its click once", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "&sound");
  expect((await log(page)).contexts, "nothing before a gesture").toBe(0);
  await page.locator("#talk").evaluate(button => button.click());
  await page.waitForTimeout(60);
  expect(await log(page), "a scripted click is no gesture and no press").toMatchObject({ contexts: 0, played: 0 });
  await page.mouse.click(5, 5);
  expect((await log(page)).contexts, "a gesture elsewhere creates nothing").toBe(0);
  await click(page, "record");
  let now = await log(page);
  expect(now.contexts, "the first gesture on a push button creates the context").toBe(1);
  expect(now.resumes).toBeGreaterThanOrEqual(1);
  expect(now.played, "its press plays once").toBe(1);
  await click(page, "mute");
  expect((await log(page)).played, "a latching press plays once").toBe(2);
  // A held press plays as it goes down, not again as it comes up; the keys play once each.
  const box = await page.locator("#talk").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await log(page)).played, "the press").toBe(3);
  await page.mouse.up();
  await page.waitForTimeout(60);
  expect((await log(page)).played, "no sound on release").toBe(3);
  await page.locator("#talk").focus();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  now = await log(page);
  expect(now.played, "Space plays once").toBe(4);
  expect(now.contexts, "one context for all of them").toBe(1);
  expect(await page.evaluate(() => window.strataPushProbe.events().filter(event => event.type === "click").length), "the native event path is unchanged: one click per press (and the script's)").toBe(5);
  console.log(`sound on: ${now.contexts} context, ${now.played} clicks for 4 presses`);
  await context.close();
});

test("with haptics on a real press pulses 8 ms once, a scripted click does not, reduced motion stops pulses, and muted is silent", async ({ browser }) => {
  const haptics = await feedbackPage(browser, "&haptics");
  await click(haptics.page, "record");
  expect((await log(haptics.page)).pulses, "a momentary press pulses the click's 8 ms").toEqual([8]);
  await click(haptics.page, "mute");
  expect((await log(haptics.page)).pulses, "a latching press pulses once").toEqual([8, 8]);
  await haptics.page.waitForTimeout(1100);
  await haptics.page.locator("#talk").evaluate(button => button.click());
  expect((await log(haptics.page)).pulses, "a scripted one does not").toEqual([8, 8]);
  await haptics.page.locator("#talk").focus();
  await haptics.page.keyboard.press("Enter");
  expect((await log(haptics.page)).pulses, "Enter is the visitor's own: one pulse").toEqual([8, 8, 8]);
  await haptics.context.close();
  const reduced = await feedbackPage(browser, "&haptics", { reducedMotion: "reduce" });
  await click(reduced.page, "record");
  expect((await log(reduced.page)).pulses, "none under reduced motion").toEqual([]);
  await reduced.context.close();
  const muted = await feedbackPage(browser, "&sound&haptics&muted");
  await click(muted.page, "record");
  expect(await log(muted.page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  await muted.context.close();
});
