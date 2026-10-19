/**
 * Browser suite for the Strata Pad (anatomy page `pad.md`) on `ui-pad.html` (`window.strataPadProbe`): plain contract markup with
 * `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real buttons: a momentary pad is held (`data-strata-down`, the glow lit, the cap down) from the pointer or
 *   Enter or Space going down to it going up anywhere, the key going up or the pad losing focus, and clicks once; a latching pad toggles
 *   `aria-pressed` (the glow lit, the cap at 0.45 of its travel) and is held too; a disabled one is never held, lit or moved; a submit
 *   pad submits its name and value; the optional velocity (position, pressure, keys) is `data-strata-velocity` and an event; the pads
 *   of a grid are one tab stop with the arrows, Home, End and Control+Home/End moving between them, skipping a disabled pad.
 * - Touch: a tap and a touch hold. Mobile and text size: at 320 and 390 px no overflow, boxes of at least 24 px, the cap inside its
 *   box, a 4 × 4 grid of small pads fits 320 px; at 200% text the cap grows and wraps.
 * - Preferences and accessibility: axe in light, dark and face mode, forced colours, more contrast, reduced motion.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on through presses; a panel with pads takes a version 4 scene with
 *   an emitter per pad, the protected text and a feather; at the Instrument level each pad is a glass rim, a body and a captured cap,
 *   every pixel they draw lies inside the pad's box at every depth, and native hits on part pixels find the pad; 0 hit mismatches over
 *   every box; a lit pad changes pixels in its box and lights the face within its reach and not beyond it, and protected text stays
 *   within the guard; a real press adds no hit-geometry update, and at the Instrument level 40 held frames give no capture; a 4 × 4
 *   grid stays within the budgets.
 * - Feedback (`click`, opt-in): off by default; with sound on, audio waits for a gesture and each press plays once; with haptics on a
 *   real press pulses 8 ms once, a script's click does not.
 * - The accessibility snapshot is the same in DOM and GPU modes.
 * Screenshots go to the `ui-pad` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-pad");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** The pads in document order and whether each is latched at load (`undefined`: momentary). */
const pads = { kick: undefined, snare: undefined, hat: undefined, loop: false, arm: true, locked: undefined, send: undefined };
const ids = Object.keys(pads);

const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
/** Whether the behaviour holds the pad down (`data-strata-down="true"`; released is `"false"`). */
const down = (page, id) => page.locator(`#${id}`).evaluate(button => button.getAttribute("data-strata-down") === "true");
const pressed = (page, id) => page.locator(`#${id}`).getAttribute("aria-pressed");
const numbers = (page, id) => page.locator(`#${id}`).evaluate(button => { const style = getComputedStyle(button); return { lit: Number(style.getPropertyValue("--strata-lit")), t: Number(style.getPropertyValue("--strata-push-t")) }; });
/** The numbers once the CSS transitions on them have ended. */
async function settled(page, id) {
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  return numbers(page, id);
}
const events = page => page.evaluate(() => window.strataPadProbe.events());
const clear = page => page.evaluate(() => window.strataPadProbe.clearEvents());
const clicks = async page => (await events(page)).filter(event => event.type === "click").map(event => event.id);

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-pad.html?plain${query}`);
  await page.waitForFunction(() => window.strataPadProbe);
  return { context, page, errors };
}

test("a momentary pad is held while it is pressed, lit and down, and clicks once; a latching one toggles aria-pressed and stays down", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  // Roles, names and the markup the page was built from: the native button is the control, the object is decoration.
  await expect(page.getByRole("button", { name: "Kick" })).toHaveCount(1);
  await expect(page.locator("#loop")).toHaveRole("button");
  await expect(page.locator("#loop")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#arm")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#kick")).not.toHaveAttribute("aria-pressed", /.*/);
  expect(await page.locator("#kick").evaluate(button => [button.matches("button"), button.getAttribute("data-strata-face"), button.querySelector(".ug-pad__object").getAttribute("aria-hidden")])).toEqual([true, null, "true"]);
  // The box: the cap plus 18 px each way, 82 square at medium.
  const kick = await page.locator("#kick").boundingBox();
  expect([kick.width, kick.height]).toEqual([82, 82]);
  const cap = await page.locator("#kick .ug-pad__cap").boundingBox();
  expect([cap.width, cap.height], "the cap is 64 square").toEqual([64, 64]);
  expect(await numbers(page, "kick")).toEqual({ lit: 0, t: 0 });
  expect(await numbers(page, "arm"), "latched at load: glow lit, the cap at 0.45").toEqual({ lit: 1, t: 0.45 });
  expect(await numbers(page, "locked")).toEqual({ lit: 0, t: 0 });

  // A momentary press: held from the pointer going down, lit and down, the click once on release.
  await page.mouse.move(...centreOf(kick));
  await page.mouse.down();
  expect(await down(page, "kick")).toBe(true);
  expect(await settled(page, "kick")).toEqual({ lit: 1, t: 1 });
  expect(await clicks(page), "no click until the pointer comes up").toEqual([]);
  await page.mouse.up();
  expect(await down(page, "kick")).toBe(false);
  expect(await settled(page, "kick")).toEqual({ lit: 0, t: 0 });
  expect(await clicks(page)).toEqual(["kick"]);
  // Released elsewhere: the pad still lets go, and no click lands on it.
  await clear(page);
  await page.mouse.move(...centreOf(kick));
  await page.mouse.down();
  await page.mouse.move(700, 400);
  expect(await down(page, "kick"), "held while the pointer is down, wherever it goes").toBe(true);
  await page.mouse.up();
  expect(await down(page, "kick")).toBe(false);
  expect(await clicks(page)).toEqual([]);

  // Space holds it while down and clicks on release; Enter clicks on press and holds until released.
  await clear(page);
  await page.locator("#snare").focus();
  await page.keyboard.down("Space");
  expect(await down(page, "snare")).toBe(true);
  expect(await clicks(page)).toEqual([]);
  await page.keyboard.up("Space");
  expect(await down(page, "snare")).toBe(false);
  expect(await clicks(page)).toEqual(["snare"]);
  await page.keyboard.down("Enter");
  expect(await down(page, "snare")).toBe(true);
  expect(await clicks(page), "Enter clicks as it goes down").toEqual(["snare", "snare"]);
  await page.keyboard.up("Enter");
  expect(await down(page, "snare")).toBe(false);
  // Losing focus while a key is down lets go.
  await page.keyboard.down("Space");
  expect(await down(page, "snare")).toBe(true);
  await page.locator("#plain").focus();
  expect(await down(page, "snare")).toBe(false);
  await page.keyboard.up("Space");
  await clear(page);

  // A latching press toggles aria-pressed once, with the state in the light and the travel.
  const loop = page.locator("#loop");
  await loop.click();
  expect(await pressed(page, "loop")).toBe("true");
  expect(await settled(page, "loop")).toEqual({ lit: 1, t: 0.45 });
  expect((await events(page)).filter(event => event.id === "loop").map(event => event.type)).toEqual(["strata-pad-velocity", "click", "strata-pressed-change"]);
  await loop.click();
  expect(await pressed(page, "loop")).toBe("false");
  expect(await settled(page, "loop")).toEqual({ lit: 0, t: 0 });
  // Held while pressed: all the way down, whether latched or not, then back to where it rests.
  await page.mouse.move(...centreOf(await loop.boundingBox()));
  await page.mouse.down();
  expect(await settled(page, "loop")).toEqual({ lit: 1, t: 1 });
  await page.mouse.up();
  expect(await pressed(page, "loop")).toBe("true");
  expect(await settled(page, "loop")).toEqual({ lit: 1, t: 0.45 });
  await loop.focus();
  await page.keyboard.press("Space");
  expect(await pressed(page, "loop")).toBe("false");
  await page.keyboard.press("Enter");
  expect(await pressed(page, "loop")).toBe("true");
  // The label, the legend of the state: the accessible name never changes.
  await expect(page.getByRole("button", { name: "Loop" })).toHaveAttribute("aria-pressed", "true");

  // Disabled and aria-disabled: never held, lit or moved, and nothing activates.
  await clear(page);
  await page.locator("#locked").click({ force: true });
  await page.locator("#locked").focus();
  await page.keyboard.press("Space");
  expect(await down(page, "locked")).toBe(false);
  expect(await numbers(page, "locked")).toEqual({ lit: 0, t: 0 });
  expect(await clicks(page)).toEqual([]);
  await page.evaluate(() => { document.getElementById("kick").setAttribute("aria-disabled", "true"); });
  await page.mouse.click(...centreOf(await page.locator("#kick").boundingBox()));
  expect(await down(page, "kick")).toBe(false);
  expect(await numbers(page, "kick")).toEqual({ lit: 0, t: 0 });
  expect(await clicks(page), "a click on an aria-disabled pad is stopped").toEqual([]);
  await page.evaluate(() => { document.getElementById("kick").removeAttribute("aria-disabled"); });

  // A submit pad submits its name and value, once; a plain Button beside it is unchanged.
  await clear(page);
  await page.locator("#send").click();
  await expect(page.locator("#pad-data")).toHaveText(JSON.stringify({ send: "1" }));
  expect((await events(page)).filter(event => event.type === "submit")).toHaveLength(1);
  expect(await page.locator("#plain").evaluate(button => [button.getAttribute("data-strata-face"), button.querySelector(".ug-pad__object")])).toEqual(["raised", null]);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("the optional velocity: the place on the cap, the pointer's pressure where it is reported, and the keys; never required", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const velocity = id => page.locator(`#${id}`).getAttribute("data-strata-velocity");
  const last = async id => (await events(page)).filter(event => event.type === "strata-pad-velocity" && event.id === id).at(-1)?.detail;
  expect(await velocity("kick"), "absent until the first press").toBe(null);
  const cap = await page.locator("#kick .ug-pad__cap").boundingBox();
  await page.mouse.move(cap.x + cap.width / 2, cap.y + cap.height / 2);
  await page.mouse.down(); await page.mouse.up();
  expect(await velocity("kick")).toBe("1");
  expect(await last("kick")).toEqual({ velocity: 1, source: "position" });
  // Near an edge: soft. The cap is 64 wide, so 28 px right of the middle is 0.875 of the way to the edge: 1 − 0.75 · 0.875.
  await page.mouse.move(cap.x + cap.width / 2 + 28, cap.y + cap.height / 2);
  await page.mouse.down(); await page.mouse.up();
  expect(await last("kick")).toEqual({ velocity: 0.34, source: "position" });
  expect(await velocity("kick")).toBe("0.34");
  // The velocity comes before the click, so a handler of either sees it.
  const kinds = (await events(page)).filter(event => event.id === "kick").map(event => event.type);
  expect(kinds).toEqual(["strata-pad-velocity", "click", "strata-pad-velocity", "click"]);
  // The keys: 1, from the keyboard.
  await page.locator("#snare").focus();
  await page.keyboard.press("Space");
  expect(await last("snare")).toEqual({ velocity: 1, source: "keyboard" });
  // A pen that reports pressure: the pressure.
  await page.locator("#hat").evaluate(button => {
    const box = button.querySelector(".ug-pad__cap").getBoundingClientRect();
    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen", isPrimary: true, button: 0, buttons: 1, pressure: 0.62, clientX: box.left + 3, clientY: box.top + 3 }));
    button.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen", isPrimary: true, button: 0, buttons: 0, pressure: 0, clientX: box.left + 3, clientY: box.top + 3 }));
  });
  expect(await last("hat")).toEqual({ velocity: 0.62, source: "pressure" });
  expect(await velocity("hat")).toBe("0.62");
  // A disabled pad reports nothing; the light does not depend on it (a soft press is as lit as a hard one).
  expect(await velocity("locked")).toBe(null);
  await page.mouse.move(cap.x + cap.width / 2 + 28, cap.y + cap.height / 2);
  await page.mouse.down();
  expect(await settled(page, "kick")).toEqual({ lit: 1, t: 1 });
  await page.mouse.up();
  await context.close();
});

test("the pads of a grid are one tab stop, and the arrows, Home, End and Control+Home/End move between them, skipping a disabled pad", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const tabindex = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#pad-grid .ug-pad")].map(pad => [pad.id, pad.getAttribute("tabindex")])));
  const focused = () => page.evaluate(() => document.activeElement?.id);
  expect(await tabindex(), "no script change before focus enters").toEqual({ kick: null, snare: null, hat: null, loop: null, arm: null, locked: null });
  await page.locator("#pad-title").evaluate(title => { title.tabIndex = -1; title.focus(); });
  await page.keyboard.press("Tab");
  expect(await focused()).toBe("kick");
  expect(await tabindex(), "one tab stop: the pad focus is on (a disabled pad is left as it is)").toEqual({ kick: "0", snare: "-1", hat: "-1", loop: "-1", arm: "-1", locked: null });
  // Three columns: kick snare hat / loop arm locked.
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("snare");
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe("arm");
  expect((await tabindex()).arm).toBe("0");
  expect((await tabindex()).kick).toBe("-1");
  await page.keyboard.press("ArrowLeft");
  expect(await focused()).toBe("loop");
  await page.keyboard.press("ArrowLeft");
  expect(await focused(), "no wrap at the row's start").toBe("loop");
  await page.keyboard.press("ArrowUp");
  expect(await focused()).toBe("kick");
  await page.keyboard.press("ArrowUp");
  expect(await focused(), "nothing above the first row").toBe("kick");
  await page.keyboard.press("End");
  expect(await focused()).toBe("hat");
  await page.keyboard.press("ArrowRight");
  expect(await focused(), "no wrap at the row's end").toBe("hat");
  await page.keyboard.press("ArrowDown");
  expect(await focused(), "the disabled pad below is skipped: nothing else in the column").toBe("hat");
  await page.keyboard.press("Home");
  expect(await focused()).toBe("kick");
  await page.keyboard.press("Control+End");
  expect(await focused(), "the last enabled pad of the grid").toBe("arm");
  await page.keyboard.press("Control+Home");
  expect(await focused()).toBe("kick");
  // The key press that moved focus did not press a pad; Space does.
  expect(await clicks(page)).toEqual([]);
  await page.keyboard.press("Space");
  expect(await clicks(page)).toEqual(["kick"]);
  // Tab leaves the grid (one stop), and Shift+Tab comes back to the pad that was current.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab");
  expect(await focused()).toBe("send");
  await page.keyboard.press("Shift+Tab");
  expect(await focused()).toBe("snare");
  // Arrow keys do not scroll the page, and a key with a modifier is left alone.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.keyboard.press("Shift+ArrowRight");
  expect(await focused()).toBe("snare");
  // A disabled pad is not a stop, and right-to-left swaps left and right.
  await page.evaluate(() => { document.getElementById("pad-grid").style.direction = "rtl"; });
  await page.keyboard.press("ArrowRight");
  expect(await focused(), "right-to-left: right goes to the previous pad").toBe("kick");
  await context.close();
});

test("touch: a tap clicks and toggles, and a touch hold lights and lowers the cap, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-pad.html?plain");
  await page.waitForFunction(() => window.strataPadProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  await page.touchscreen.tap(...centreOf(await page.locator("#snare").boundingBox()));
  expect(await clicks(page)).toEqual(["snare"]);
  await page.touchscreen.tap(...centreOf(await page.locator("#loop").boundingBox()));
  expect(await pressed(page, "loop")).toBe("true");
  expect(await settled(page, "loop")).toEqual({ lit: 1, t: 0.45 });
  // A hold: the cap is down while the touch is.
  const client = await context.newCDPSession(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const [x, y] = centreOf(await page.locator("#kick").boundingBox());
  await touch("touchStart", [{ x, y }]);
  expect(await down(page, "kick")).toBe(true);
  expect(await settled(page, "kick")).toEqual({ lit: 1, t: 1 });
  await touch("touchEnd", []);
  expect(await down(page, "kick")).toBe(false);
  expect(await settled(page, "kick")).toEqual({ lit: 0, t: 0 });
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the pads reflow with no horizontal overflow, boxes of at least 24 px and the cap inside its box; a 4 × 4 grid of small pads fits`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  for (const query of ["", "&grid16"]) {
    await page.goto(`/ui-pad.html?plain${query}`);
    await page.waitForFunction(() => window.strataPadProbe);
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      panel: document.getElementById("pad-panel").getBoundingClientRect().right,
      pads: [...document.querySelectorAll("button.ug-pad")].map(button => {
        const box = button.getBoundingClientRect(), cap = button.querySelector(".ug-pad__cap").getBoundingClientRect(), glow = button.querySelector(".ug-pad__glow").getBoundingClientRect();
        return { id: button.id, left: box.left, right: box.right, width: box.width, height: box.height, capInBox: cap.left >= box.left && cap.right <= box.right && cap.top >= box.top && cap.bottom <= box.bottom,
          glowInBox: glow.left >= box.left && glow.right <= box.right && glow.top >= box.top && glow.bottom <= box.bottom };
      }),
    }));
    expect(layout.scrollWidth, `${query || "rack"}: no horizontal scrolling`).toBeLessThanOrEqual(width);
    for (const pad of layout.pads) {
      expect(Math.min(pad.width, pad.height), `${pad.id}: box`).toBeGreaterThanOrEqual(24);
      expect(pad.left).toBeGreaterThanOrEqual(0);
      expect(pad.right).toBeLessThanOrEqual(layout.panel + 0.5);
      expect(pad, `${pad.id}: the cap and the glow nest in the box`).toMatchObject({ capInBox: true, glowInBox: true });
    }
    console.log(`${width} px ${query || "rack"}: scrollWidth ${layout.scrollWidth}, ${layout.pads.length} pads, smallest box ${Math.min(...layout.pads.map(pad => Math.min(pad.width, pad.height))).toFixed(1)} px`);
    await page.screenshot({ path: `${evidence}/reflow-${width}${query.replace("&", "-")}.png`, fullPage: true });
  }
  await context.close();
});

test("at 200% text the cap wraps and grows with its label, the box follows it, and nothing overflows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/ui-pad.html?plain");
  await page.waitForFunction(() => window.strataPadProbe);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
    document.getElementById("kick").querySelector(".ug-pad__label").textContent = "Kick the whole drum";
  });
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    padRight: Math.max(...[...document.querySelectorAll("button.ug-pad")].map(button => button.getBoundingClientRect().right)),
    kick: (button => { const cap = button.querySelector(".ug-pad__cap").getBoundingClientRect(), box = button.getBoundingClientRect(), text = document.createRange();
      text.selectNodeContents(button.querySelector(".ug-pad__label")); const t = text.getBoundingClientRect();
      return { capHeight: cap.height, capWidth: cap.width, boxHeight: box.height, boxWidth: box.width, textInCap: t.left >= cap.left - 1 && t.right <= cap.right + 1 && t.top >= cap.top - 1 && t.bottom <= cap.bottom + 1,
        capInBox: cap.left >= box.left && cap.right <= box.right && cap.top >= box.top && cap.bottom <= box.bottom }; })(document.getElementById("kick")),
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(320);
  expect(result.padRight, "every pad is inside the viewport").toBeLessThanOrEqual(320);
  expect(result.kick.capHeight, "the cap grows to hold the wrapped label").toBeGreaterThan(result.kick.capWidth);
  expect(result.kick).toMatchObject({ textInCap: true, capInBox: true });
  console.log(`200% text: kick's cap ${result.kick.capWidth.toFixed(1)} × ${result.kick.capHeight.toFixed(1)} px in a ${result.kick.boxWidth.toFixed(1)} × ${result.kick.boxHeight.toFixed(1)} box`);
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the pads pass axe in light, dark and face mode, and under more contrast, reduced motion and forced colours", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#pad-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#pad-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    expect(summary(face.incomplete.filter(result => result.id === "color-contrast")), `undecided contrast, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#pad-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  // Latched, held and focused pads pass too.
  await page.evaluate(() => { document.getElementById("kick").setAttribute("data-strata-down", "true"); document.getElementById("snare").setAttribute("data-strata-preview", "focus hover"); });
  const states = await new AxeBuilder({ page }).include("#pad-panel").withTags(tags).analyze();
  expect(summary(states.violations), "axe, a held, a hovered and a focused pad").toEqual([]);
  await page.evaluate(() => { document.getElementById("kick").removeAttribute("data-strata-down"); document.getElementById("snare").removeAttribute("data-strata-preview"); delete document.documentElement.dataset.strataTheme; });
  // The glow's colour is the role's; the lit glow is lighter than the unlit one.
  const glows = await page.evaluate(() => Object.fromEntries(["kick", "loop", "arm"].map(id => [id, getComputedStyle(document.getElementById(id).querySelector(".ug-pad__glow")).backgroundColor])));
  expect(glows.arm, "a latched pad's glow is lit").not.toBe(glows.loop);
  // More contrast: flat colour, no glow, edges in the text colour.
  await page.emulateMedia({ contrast: "more" });
  const more = await page.evaluate(() => { const style = getComputedStyle(document.getElementById("arm").querySelector(".ug-pad__glow")); return { border: style.borderTopWidth, glow: style.boxShadow }; });
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(parseFloat(more.border)).toBeGreaterThanOrEqual(1);
  const contrast = await new AxeBuilder({ page }).include("#pad-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  // Reduced motion: lights and travel change at once.
  await page.emulateMedia({ contrast: "no-preference", reducedMotion: "reduce" });
  expect(await page.locator("#snare").evaluate(button => getComputedStyle(button).transitionDuration)).toBe("0s");
  // Forced colours: Canvas glow and cap with ButtonText borders, Highlight when lit, GrayText when disabled.
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  const forced = await page.evaluate(() => Object.fromEntries(["loop", "arm", "locked"].map(id => {
    const button = document.getElementById(id), glow = getComputedStyle(button.querySelector(".ug-pad__glow")), cap = getComputedStyle(button.querySelector(".ug-pad__cap"));
    return [id, { glow: glow.backgroundColor, glowBorder: glow.borderTopColor, bloom: glow.boxShadow, cap: cap.borderTopStyle, border: getComputedStyle(button).borderTopWidth }];
  })));
  expect(forced.arm.glow, "a latched glow is Highlight").not.toBe(forced.loop.glow);
  expect(forced.loop.bloom, "no glow").toBe("none");
  expect(forced.locked.glowBorder, "a disabled pad is edged in GrayText").not.toBe(forced.loop.glowBorder);
  expect(forced.loop).toMatchObject({ cap: "solid", border: "0px" });
  const forcedAxe = await new AxeBuilder({ page }).include("#pad-panel").withTags(tags).analyze();
  expect(summary(forcedAxe.violations), "axe, forced colours").toEqual([]);
  // Focus is a ring round the glow in every presentation.
  await page.locator("#snare").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.locator("#snare .ug-pad__glow").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-pad.html${query}`);
  await page.waitForFunction(() => window.strataPadProbe && window.strataPadProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataPadProbe.scene() !== undefined);
  await page.evaluate(() => window.strataPadProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => { const instrument = window.strataPadProbe.instrument(); return !instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"); }, null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataPadProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  // A rebuilt layer (a change of depth, a pad shown again) is pending until its parts are built.
  await page.waitForFunction(() => window.strataPadProbe.instrument().layers.every(layer => layer.status !== "pending"), null, { timeout: 30000 });
  const state = await page.evaluate(() => window.strataPadProbe.instrument().layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the CSS transitions, the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    const probe = window.strataPadProbe;
    await new Promise(resolve => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 40 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    probe.refresh(); await probe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await probe.controller.settle();
  }, wait);
  // At the Instrument level, every layer built (not pending): a change of depth rebuilds the parts.
  await page.waitForFunction(() => { const instrument = window.strataPadProbe.instrument(); return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending")); }, null, { timeout: 30000 });
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
/** Native hits on frame points: how many land on a pad. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.closest("button.ug-pad")) mismatches++;
  return { total: points.length, mismatches };
}, points);
/** elementFromPoint over a grid on a button's box (inset 0.5 px): every hit must be the button or something inside it. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const button = document.getElementById(id), box = button.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    // The button's border is a rounded square, which is its hit shape: points in the box's corners outside it are the grid's.
    const radius = Math.min(parseFloat(getComputedStyle(button).borderTopLeftRadius), box.width / 2, box.height / 2);
    const dx = Math.max(0, Math.abs(x - (box.left + box.width / 2)) - (box.width / 2 - radius)), dy = Math.max(0, Math.abs(y - (box.top + box.height / 2)) - (box.height / 2 - radius));
    if (Math.hypot(dx, dy) > radius - 0.75) continue;
    total++;
    const hit = document.elementFromPoint(x, y);
    // The cap and the label are the button's own content; the object's parts take no pointer.
    if (hit !== button && !(hit && button.contains(hit) && hit.closest(".ug-pad__object") === null)) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);
/** Sets a pad's state without input: the real attributes the behaviour and the toggle set. */
const setState = (page, state) => page.evaluate(state => {
  for (const [id, [key, value]] of Object.entries(state)) {
    const button = document.getElementById(id);
    if (value === null) button.removeAttribute(key); else button.setAttribute(key, value);
  }
}, state);
const allUnlit = { arm: ["aria-pressed", "false"] };
const counts = page => page.evaluate(() => window.strataPadProbe.counts());
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
  const probe = window.strataPadProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
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

for (const dpr of [1, 2]) for (const level of levels) test(`the pads at ${level} (DPR ${dpr}): the scene, the emitters, containment, hits, the light and the guard`, async ({ browser }) => {
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
  // An emitter for each pad, in document order; strength from the state.
  expect(scene.emitters).toHaveLength(ids.length);
  scene.emitters.forEach((emitter, index) => {
    const id = ids[index], disabled = id === "locked", on = !disabled && pads[id] === true;
    expect(emitter.strength, `${id}: strength`).toBeCloseTo(on ? 3600 : 0, 2);
    expect(emitter.radius, `${id}: reach 3 cap sides`).toBeCloseTo(192, 2);
    expect(emitter.position[2], `${id}: height 0.25 cap sides`).toBeCloseTo(16, 2);
    expect(Math.max(...emitter.colour), `${id}: colour at full brightness`).toBe(1);
    expect(emitter.reach).toBe("outset");
  });
  expect(scene.feather).toBe(4);
  expect(Array.isArray(scene.protected)).toBe(true);
  for (const text of scene.texts) expect(scene.protected.some(rect => rect[0] <= text[0] + 0.5 && rect[1] <= text[1] + 0.5 && rect[0] + rect[2] >= text[0] + text[2] - 0.5 && rect[1] + rect[3] >= text[1] + text[3] - 0.5), `a protected rect covers the text at ${text.map(Math.round)}`).toBe(true);
  expect(scene.outset.top, "the emitters' outset").toBeGreaterThanOrEqual(48);
  if (level === "instrument") {
    // The pads first (the helper builds them before its keys), in document order, then the plain key.
    expect(scene.objects.map(object => object.id)).toEqual([...ids, "plain"]);
    for (const [index, object] of scene.objects.filter(object => object.id in pads).entries()) {
      expect(object.parts, `${object.id}: parts`).toEqual([expect.stringMatching(/^lens:lens #[0-9a-f]{6}$/), expect.stringMatching(/^plinth:key #[0-9a-f]{6}$/), "cap:keyCap"]);
      expect(object.glass, `${object.id}: the rim is glass`).toEqual(["lens", undefined, undefined]);
      expect(object.emitters, `${object.id}: the rim's emitter`).toEqual([index, undefined, undefined]);
      expect(object.pose.slice(1), `${object.id}: the body and the captured cap travel 3 px`).toEqual([-3, -3]);
      expect(object.close, `${object.id}: bounds are the pad's box`).toBe(true);
      expect(object.casters[2], "the captured cap casts nothing").toBe("none");
    }
    expect(scene.objects.find(object => object.id === "locked").state).toMatchObject({ disabled: true });
    expect(Object.fromEntries(scene.objects.filter(object => object.id in pads).map(object => [object.id, object.t]))).toEqual({ kick: 0, snare: 0, hat: 0, loop: 0, arm: 0.45, locked: 0, send: 0 });
    // The glow's CSS paint is hidden while the object draws it; the socket under it stays printed.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-pad__glow, button.ug-pad")].filter(element => !element.hasAttribute("data-strata-dome")).length)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-pad__socket")].filter(element => getComputedStyle(element).backgroundColor === "rgba(0, 0, 0, 0)").length)).toBe(0);
  } else {
    const wanted = level === "relief" ? "raised" : "key";
    expect(scene.faces.filter(face => face === wanted).length, "a cap each, and the plain button").toBeGreaterThanOrEqual(ids.length);
    const entryOf = selector => page.evaluate(selector => {
      const probe = window.strataPadProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect(), rect = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (rect.left - panel.left)) < 0.6 && Math.abs(p.rect[1] - (rect.top - panel.top)) < 0.6 && Math.abs(p.rect[2] - rect.width) < 0.6) ?? null;
    }, selector);
    const cap = await entryOf("#snare .ug-pad__cap");
    if (level === "relief") expect(cap).toMatchObject({ face: "raised" });
    else expect(cap).toMatchObject({ object: "key", finish: true });
    expect(cap.radius, "the cap's corner radius is 0.22 of its side").toBeCloseTo(14.08, 2);
    // The CSS paint of the glow stays (captured) at these levels: the light is the emitter.
    expect(await page.evaluate(() => [...document.querySelectorAll(".ug-pad__glow")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(0);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters, ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of [...ids, "plain"]) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length + 1} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment: with every pad unlit (no light), what the pads draw lies inside their boxes, and hits on those pixels find the pad;
  // at the Instrument level over three depths.
  await setState(page, allUnlit);
  const boxes = await inFrame(page, "button.ug-pad");
  const readout = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#pad-read"))[0]);
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await depth(page, value);
    const label = value === null ? "0.5" : String(value);
    // The plain button beside them is hidden in both frames: it is not what this measures, and a layer whose outset differs would sample its edges a sub-pixel apart.
    await page.evaluate(() => { for (const button of document.querySelectorAll("#plain, button.ug-pad")) button.style.visibility = "hidden"; });
    const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-bare`);
    await page.evaluate(() => { for (const button of document.querySelectorAll("button.ug-pad")) button.style.visibility = ""; });
    const drawn = difference(await frame(page, `${level}-dpr${dpr}-depth${label}-off`), bare, [...boxes, readout], { points: true });
    expect(drawn.inside, `depth ${label}: the pads are drawn`).toBeGreaterThan(3000 * dpr * dpr);
    expect(drawn.outside, `depth ${label}: no pixel outside a box (${JSON.stringify(drawn.outsideSamples)}; boxes ${JSON.stringify(boxes.map(box => [box.id, ...[box.x, box.y, box.width, box.height].map(Math.round)]))})`).toBe(0);
    const hit = await hitsOn(page, drawn.changed.filter(([x, y]) => !(x >= readout.x && x <= readout.x + readout.width && y >= readout.y && y <= readout.y + readout.height)));
    expect(hit.mismatches, `depth ${label}: native hits on pixels the pads draw`).toBe(0);
    await page.evaluate(() => { for (const button of document.querySelectorAll("#plain")) button.style.visibility = ""; });
    await healthy(page, `depth ${label}`, level);
    console.log(`DPR ${dpr} ${level}: depth ${label}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
  }
  await depth(page, null);

  // A held pad: its box changes (the cap travels, the glow lights), the face past its edge is lit within its reach and not beyond it,
  // and the text near it keeps the guard.
  const off = await frame(page, `${level}-dpr${dpr}-all-off`);
  await setState(page, { snare: ["data-strata-down", "true"] });
  const on = await frame(page, `${level}-dpr${dpr}-snare-held`);
  await setState(page, { snare: ["data-strata-down", null] });
  const snare = boxes.find(box => box.id === "snare"), centre = { x: snare.x + snare.width / 2, y: snare.y + snare.height / 2 }, reach = 192;
  const lit1 = difference(off, on, [snare, readout, { cx: centre.x, cy: centre.y, radius: reach + 3 }]);
  const inBox = difference(off, on, [snare]);
  expect(inBox.inside, "the pad's box changes").toBeGreaterThan(200 * dpr * dpr);
  expect(lit1.outside, `nothing changes beyond the glow's reach (${JSON.stringify(lit1.outsideSamples)})`).toBe(0);
  const panelBox = (await inFrame(page, "#pad-panel"))[0];
  const texts = scene.texts.map(text => [text[0] + panelBox.x, text[1] + panelBox.y, text[2], text[3]]);
  const everyBox = await inFrame(page, "#pad-panel button");
  const pointOk = point => !texts.some(box => point.x >= box[0] - 12 && point.x <= box[0] + box[2] + 12 && point.y >= box[1] - 12 && point.y <= box[1] + box[3] + 12) && !everyBox.some(box => point.x >= box.x - 3 && point.x <= box.x + box.width + 3 && point.y >= box.y - 3 && point.y <= box.y + box.height + 3);
  // The face lit in rings round the pad: the median gain in bands of distance from its centre, where the face shows (not on a pad, not near text).
  const bands = { near: [46, 66], mid: [100, 150], far: [200, 260] }, ring = {};
  for (const [name, [low, high]] of Object.entries(bands)) {
    const gains = [];
    for (let angle = 0; angle < 360; angle += 3) for (let distance = low; distance <= high; distance += 6) {
      const point = { x: centre.x + Math.cos((angle * Math.PI) / 180) * distance, y: centre.y + Math.sin((angle * Math.PI) / 180) * distance };
      if (point.x < panelBox.x + 6 || point.y < panelBox.y + 6 || point.x > panelBox.x + panelBox.width - 6 || point.y > panelBox.y + panelBox.height - 6 || !pointOk(point)) continue;
      gains.push(gain(off, on, point, dpr));
    }
    ring[name] = { points: gains.length, median: median(gains) };
  }
  console.log(`DPR ${dpr} ${level}: snare held: ${inBox.inside} px in its box; face gain near / mid / far: ${JSON.stringify(ring)}; changed within reach ${lit1.inside}, beyond ${lit1.outside}`);
  expect(ring.near.points, "sample points near the pad").toBeGreaterThan(20);
  expect(ring.near.median, "the face is lit near the pad").toBeGreaterThan(0.5);
  expect(ring.near.median).toBeGreaterThan(ring.mid.median ?? -1);
  expect(ring.far.median ?? 0, "beyond the reach nothing is lit").toBeLessThanOrEqual(0.01);
  let worst = 0, checkedText = 0;
  for (const text of texts) {
    if (Math.hypot(text[0] + text[2] / 2 - centre.x, text[1] + text[3] / 2 - centre.y) > reach) continue;
    if (text[0] < readout.x + readout.width && text[0] + text[2] > readout.x && text[1] < readout.y + readout.height && text[1] + text[3] > readout.y) continue;
    // The held pad's own label sits on the cap that moved: its cap and its text travel and are not light.
    if (text[0] >= snare.x && text[0] + text[2] <= snare.x + snare.width && text[1] >= snare.y && text[1] + text[3] <= snare.y + snare.height) continue;
    const result = excess(off, on, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr);
    worst = Math.max(worst, result.levels); checkedText++;
  }
  console.log(`DPR ${dpr} ${level}: ${checkedText} text rects within reach, worst change beyond the guard ${worst} levels`);
  expect(checkedText).toBeGreaterThan(1);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "snare held", level);
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`a real press at ${level} gives fresh pixels with GPU on, no hit-geometry update, and lights the emitter only while it is held`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#pad-read"))[0]);
  await page.evaluate(() => { document.getElementById("pad-read").style.visibility = "hidden"; });
  const strengths = () => page.evaluate(async () => {
    for (let attempt = 0; attempt < 60 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    window.strataPadProbe.refresh(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const scene = window.strataPadProbe.scene(), order = [...document.querySelectorAll("button.ug-pad")].map(button => button.id);
    return Object.fromEntries(order.map((name, index) => [name, Math.round(scene.emitters[index].strength * 100) / 100]));
  });
  expect((await strengths()).snare).toBe(0);
  const boxes = await inFrame(page, "button.ug-pad");
  const before = await frame(page, `${level}-press-before`);
  const start = await counts(page);
  await page.mouse.move(...centreOf(await page.locator("#snare").boundingBox()));
  await page.mouse.down();
  expect((await strengths()).snare, "lit while held").toBeCloseTo(3600, 1);
  if (level === "instrument") {
    await page.evaluate(() => document.getAnimations().length && Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined))));
    await page.evaluate(() => window.strataPadProbe.refresh());
    const snare = await page.evaluate(() => window.strataPadProbe.scene().objects.find(object => object.id === "snare"));
    expect(snare.t, "held: the cap all the way down").toBe(1);
    expect(snare.parts[1].state.pressed, "the part state says pressed").toBe(true);
    // 40 frames of the cap's throw and the glow's light: uniform writes, no capture.
    const throwing = await page.evaluate(async () => {
      const probe = window.strataPadProbe, next = () => new Promise(requestAnimationFrame);
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
  expect((await strengths()).snare, "dark when released").toBe(0);
  const after = await frame(page, `${level}-press-after`, { wait: 400 });
  const end = await counts(page);
  const snare = boxes.find(box => box.id === "snare"), reach = { cx: snare.x + snare.width / 2, cy: snare.y + snare.height / 2, radius: 192 + 3 };
  const changed = difference(before, held, [snare, read, reach]);
  console.log(`${level}: a press: ${changed.inside} px changed, ${changed.outside} outside its reach; ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.geometryUpdates - start.geometryUpdates} hit-geometry updates`);
  expect(changed.inside, "fresh pixels while held").toBeGreaterThan(300);
  expect(changed.outside, `no stale or stray pixels (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
  // Back to where it was: the CSS numbers are 0, the emitter dark, and the settled frame is stable: a second capture differs by 0 pixels.
  expect(await numbers(page, "snare")).toEqual({ lit: 0, t: 0 });
  const again = await frame(page, `${level}-press-after-again`, { wait: 400 });
  const back = difference(after, again, [snare, read, reach]);
  expect([back.inside, back.outside], `two settled captures after the release are identical (differences within ${JSON.stringify(back.extent)})`).toEqual([0, 0]);
  expect(end.mode).toBe("gpu");
  expect(end.geometryUpdates - start.geometryUpdates, "no hit-geometry update").toBe(0);
  // Every mutation of a captured subtree is captured once by core (the press's attribute going on, and off); the frames of the cap's throw
  // between them are not at the Instrument level. At Relief and Objects the CSS throw and the glow's light are captured content, frame by frame.
  if (level === "instrument") expect(end.captures - start.captures, "a press at the Instrument level is captured as it goes down and as it comes up, no more").toBeLessThanOrEqual(3);
  await healthy(page, "press", level);
  // A latching pad: its glow is lit while latched, the cap rests at 0.45 of its travel.
  await page.mouse.click(...centreOf(await page.locator("#loop").boundingBox()));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  expect((await strengths()).loop, "glow lit").toBeCloseTo(3600, 1);
  if (level === "instrument") expect((await page.evaluate(() => { window.strataPadProbe.refresh(); return window.strataPadProbe.scene().objects.find(object => object.id === "loop").t; })), "latched at 0.45").toBe(0.45);
  await page.mouse.click(...centreOf(await page.locator("#loop").boundingBox()));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(600);
  expect((await strengths()).loop, "unlatched: dark").toBe(0);
  // Hover reaches the parts; a disabled pad is flat and unlit.
  const stateOf = id => page.evaluate(([id, level]) => {
    const scene = window.strataPadProbe.scene();
    if (level === "instrument") return scene.objects.find(object => object.id === id).parts.map(part => part.state);
    const cap = document.getElementById(id).querySelector(".ug-pad__cap").getBoundingClientRect(), panel = window.strataPadProbe.panel().getBoundingClientRect();
    return scene.primitives.filter(entry => entry.rect && Math.abs(entry.rect[0] - (cap.left - panel.left)) < 0.6 && Math.abs(entry.rect[1] - (cap.top - panel.top)) < 0.6).map(entry => entry.state);
  }, [id, level]);
  const settle = () => page.evaluate(async () => { window.strataPadProbe.refresh(); await window.strataPadProbe.controller.settle(); });
  await page.mouse.move(2, 2);
  await settle();
  expect((await stateOf("snare")).every(state => !state.hover && !state.disabled)).toBe(true);
  await page.mouse.move(...centreOf(await page.locator("#snare").boundingBox()));
  await settle();
  expect((await stateOf("snare")).every(state => state.hover === true && !state.disabled), "hover").toBe(true);
  expect((await stateOf("locked")).every(state => state.disabled === true), "disabled").toBe(true);
  await healthy(page, "states", level);
  await context.close();
});

test("a 4 × 4 grid of pads at Instrument stays within the budgets: 16 emitters, 16 objects and 48 parts, GPU on, nothing stepped down", async ({ browser }) => {
  test.setTimeout(240000);
  for (const dpr of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    await ready(page, "?level=instrument&grid16");
    const scene = await sceneOf(page);
    const state = await page.evaluate(() => ({ instrument: window.strataPadProbe.instrument().layers[0], emitters: window.strataPadProbe.state().emitters.layers[0], mode: window.strataPadProbe.state().mode }));
    console.log(`DPR ${dpr} grid 4×4: ${scene.emitters.length} emitters (${state.emitters.drawn.length} drawn, ${state.emitters.dropped.length} dropped, ${state.emitters.lit} lit), ${state.instrument.objects} objects, ${state.instrument.parts} parts (${state.instrument.drawnParts} drawn), ${scene.objects.length} scene objects`);
    expect(scene.emitters, "an emitter per pad").toHaveLength(16);
    expect(scene.objects.filter(object => /^p\d+$/.test(object.id)), "an object per pad").toHaveLength(16);
    expect(state.instrument.parts, "three parts per pad").toBe(16 * 3);
    expect(state.emitters.drawn, "the lit pad is drawn, within the 64-emitter budget").toHaveLength(1);
    expect(state.emitters.dropped).toHaveLength(0);
    expect(state.instrument.objects).toBeLessThanOrEqual(256);
    expect(state.instrument.parts).toBeLessThanOrEqual(2048);
    expect(state.mode).toBe("gpu");
    await healthy(page, "grid 4×4", "instrument");
    // Lit pads (the latched eleventh) are the only ones with strength; the sixteenth is disabled and dark.
    expect(scene.emitters.filter(emitter => emitter.strength > 0)).toHaveLength(1);
    // Hold every pad: all sixteen lit, still inside the budget and GPU still on.
    await page.evaluate(() => { for (const button of document.querySelectorAll("button.ug-pad:not(:disabled)")) button.setAttribute("data-strata-down", "true"); window.strataPadProbe.refresh(); });
    await page.waitForTimeout(600);
    const lit = await page.evaluate(() => { window.strataPadProbe.refresh(); return window.strataPadProbe.scene().emitters.filter(emitter => emitter.strength > 0).length; });
    expect(lit, "fifteen enabled pads lit").toBe(15);
    const all = await page.evaluate(() => window.strataPadProbe.state().emitters.layers[0]);
    console.log(`DPR ${dpr} grid 4×4, all held: ${all.lit} lit, ${all.drawn.length} drawn, ${all.dropped.length} dropped`);
    expect(all.drawn, "all fifteen are within the budget").toHaveLength(15);
    expect(all.dropped).toHaveLength(0);
    await healthy(page, "grid 4×4 all held", "instrument");
    await page.screenshot({ path: `${evidence}/grid16-dpr${dpr}.png` });
    await context.close();
  }
});

test("under more contrast the Instrument pads have no light, and under reduced transparency the rim is opaque lacquer", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0), "every emitter is off").toBe(true);
  await page.waitForFunction(() => window.strataPadProbe.instrument().layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataPadProbe.refresh());
  scene = await sceneOf(page);
  expect(scene.objects.filter(object => object.id in pads).every(object => object.parts[0].startsWith("lens:lensOpaque ")), "opaque rims").toBe(true);
  expect(scene.objects.filter(object => object.id in pads).every(object => object.glass[0] === undefined), "no glass").toBe(true);
  expect(scene.emitters.some(emitter => emitter.strength > 0), "the latched pad still gives light").toBe(true);
  await page.waitForFunction(() => window.strataPadProbe.instrument().layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the pad page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-pad.html?dom");
  await page.waitForFunction(() => window.strataPadProbe);
  const act = async () => { await page.locator("#loop").focus(); await page.keyboard.press("Space"); await page.locator("#arm").focus(); await page.keyboard.press("Enter"); };
  await act();
  const dom = await page.locator("#pad-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#pad-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('group "Drums"');
    expect(gpu).toContain('button "Kick"');
    expect(gpu).toContain('button "Loop" [pressed]');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#pad-panel").withTags(tags).analyze();
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
  await page.goto(`/ui-pad.html?plain${query}`);
  await page.waitForFunction(() => window.strataPadProbe);
  return { context, page };
}
const log = page => page.evaluate(() => ({ ...window.feedbackLog, pulses: [...window.feedbackLog.pulses] }));
const click = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); };

test("feedback is off by default: real presses create no audio and pulse nothing", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "");
  for (const id of ["kick", "snare", "loop"]) await click(page, id);
  await page.locator("#arm").focus();
  await page.keyboard.press("Space");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  console.log("off by default: 4 real presses, 0 audio contexts, 0 sounds, 0 pulses");
  await context.close();
});

test("with sound on, audio waits for the first gesture on a pad, then each press plays its click once", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "&sound");
  expect((await log(page)).contexts, "nothing before a gesture").toBe(0);
  await page.locator("#snare").evaluate(button => button.click());
  await page.waitForTimeout(60);
  expect(await log(page), "a scripted click is no gesture and no press").toMatchObject({ contexts: 0, played: 0 });
  await page.mouse.click(5, 5);
  expect((await log(page)).contexts, "a gesture elsewhere creates nothing").toBe(0);
  await click(page, "kick");
  let now = await log(page);
  expect(now.contexts, "the first gesture on a pad creates the context").toBe(1);
  expect(now.resumes).toBeGreaterThanOrEqual(1);
  expect(now.played, "its press plays once").toBe(1);
  await click(page, "loop");
  expect((await log(page)).played, "a latching press plays once").toBe(2);
  // A held press plays as it goes down, not again as it comes up; the keys play once each.
  const box = await page.locator("#snare").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await log(page)).played, "the press").toBe(3);
  await page.mouse.up();
  await page.waitForTimeout(60);
  expect((await log(page)).played, "no sound on release").toBe(3);
  await page.locator("#snare").focus();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  now = await log(page);
  expect(now.played, "Space plays once").toBe(4);
  expect(now.contexts, "one context for all of them").toBe(1);
  expect(await page.evaluate(() => window.strataPadProbe.events().filter(event => event.type === "click").length), "the native event path is unchanged: one click per press (and the script's)").toBe(5);
  console.log(`sound on: ${now.contexts} context, ${now.played} clicks for 4 presses`);
  await context.close();
});

test("with haptics on a real press pulses 8 ms once, a scripted click does not, reduced motion stops pulses, and muted is silent", async ({ browser }) => {
  const haptics = await feedbackPage(browser, "&haptics");
  await click(haptics.page, "kick");
  expect((await log(haptics.page)).pulses, "a momentary press pulses the click's 8 ms").toEqual([8]);
  await click(haptics.page, "loop");
  expect((await log(haptics.page)).pulses, "a latching press pulses once").toEqual([8, 8]);
  await haptics.page.waitForTimeout(1100);
  await haptics.page.locator("#snare").evaluate(button => button.click());
  expect((await log(haptics.page)).pulses, "a scripted one does not").toEqual([8, 8]);
  await haptics.page.locator("#snare").focus();
  await haptics.page.keyboard.press("Enter");
  expect((await log(haptics.page)).pulses, "Enter is the visitor's own: one pulse").toEqual([8, 8, 8]);
  await haptics.context.close();
  const reduced = await feedbackPage(browser, "&haptics", { reducedMotion: "reduce" });
  await click(reduced.page, "kick");
  expect((await log(reduced.page)).pulses, "none under reduced motion").toEqual([]);
  await reduced.context.close();
  const muted = await feedbackPage(browser, "&sound&haptics&muted");
  await click(muted.page, "kick");
  expect(await log(muted.page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  await muted.context.close();
});
