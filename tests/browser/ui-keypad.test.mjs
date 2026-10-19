/**
 * Browser suite for the Strata Keypad (anatomy page `keypad.md`) on `ui-keypad.html` (`window.strataKeypadProbe`): plain contract
 * markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real buttons: a key is held (`data-strata-down`, the cap down) from the pointer or Enter or Space going down
 *   to it going up anywhere, the key going up or the key losing focus, and clicks once; a disabled one is never held or moved; a submit
 *   key submits its name and value; the keys are one tab stop with the arrows, Home, End and Control+Home/End moving between them,
 *   skipping a disabled key and stopping at a short last row; the second legends print smaller, large when the keypad is shifted.
 * - Touch: a tap and a touch hold. Mobile and text size: at 320 and 390 px no overflow, key boxes of at least 24 px (56 at medium, over
 *   the 44 px touch target), the cap inside its key and the plinth inside the fieldset; at 200% text the legends wrap.
 * - Preferences and accessibility: axe in light, dark and face mode, forced colours, more contrast, reduced motion.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on through presses; a keypad adds no emitter; at the Instrument level
 *   the plinth is an object of its own and each key a body and a captured cap, every pixel they draw lies inside the fieldset's box (the
 *   plinth) and the keys' boxes at every depth, and native hits on part pixels find a key or the keypad; 0 hit mismatches over every
 *   box; a real press changes pixels in the key's box only and adds no hit-geometry update, and at the Instrument level 40 held frames
 *   give no capture.
 * - Feedback (`click`, opt-in): off by default; with sound on, audio waits for a gesture and each press plays once; with haptics on a
 *   real press pulses 8 ms once, a script's click does not.
 * - The accessibility snapshot is the same in DOM and GPU modes.
 * Screenshots go to the `ui-keypad` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-keypad");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
const dial = ["key-1", "key-2", "key-3", "key-4", "key-5", "key-6", "key-7", "key-8", "key-9", "key-star", "key-0", "key-hash"];
const hex = ["hex-a", "hex-b", "hex-c", "hex-d"];
const keys = [...dial, ...hex];

const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
/** Whether the behaviour holds the key down (`data-strata-down="true"`; released is `"false"`). */
const down = (page, id) => page.locator(`#${id}`).evaluate(button => button.getAttribute("data-strata-down") === "true");
const travel = (page, id) => page.locator(`#${id}`).evaluate(button => Number(getComputedStyle(button).getPropertyValue("--strata-push-t")));
/** The cap's travel once the CSS transitions on it have ended. */
async function settled(page, id) {
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  return travel(page, id);
}
const events = page => page.evaluate(() => window.strataKeypadProbe.events());
const clear = page => page.evaluate(() => window.strataKeypadProbe.clearEvents());
const clicks = async page => (await events(page)).filter(event => event.type === "click").map(event => event.id);

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-keypad.html?plain${query}`);
  await page.waitForFunction(() => window.strataKeypadProbe);
  return { context, page, errors };
}

test("a key is held while it is pressed and clicks once; a disabled one is never held; a submit key submits its name and value; the legends print as the layout says", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  // Roles, names and the markup the page was built from: the fieldset is the group, the keys are native buttons.
  await expect(page.getByRole("group", { name: "Dial" })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Hex entry" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "2 ABC" })).toHaveCount(1);
  await expect(page.locator("#key-star")).toBeDisabled();
  expect(await page.locator("#key-5").evaluate(button => [button.matches("button"), button.getAttribute("data-strata-face"), button.querySelector(".ug-keypad__cap").getAttribute("data-strata-face")])).toEqual([true, null, "raised"]);
  // The boxes: the cap plus 12 px each way, 56 at medium and 48 at small.
  const five = await page.locator("#key-5").boundingBox();
  expect([five.width, five.height], "a medium key's box").toEqual([56, 56]);
  expect(await page.locator("#key-5 .ug-keypad__cap").evaluate(cap => [cap.getBoundingClientRect().width, cap.getBoundingClientRect().height])).toEqual([44, 44]);
  expect(await page.locator("#hex-a").evaluate(button => [button.getBoundingClientRect().width, button.getBoundingClientRect().height])).toEqual([48, 48]);
  expect(await travel(page, "key-5")).toBe(0);

  // A press: held from the pointer going down, down all the way, the click once on release.
  await page.mouse.move(...centreOf(five));
  await page.mouse.down();
  expect(await down(page, "key-5")).toBe(true);
  expect(await settled(page, "key-5")).toBe(1);
  expect(await clicks(page), "no click until the pointer comes up").toEqual([]);
  await page.mouse.up();
  expect(await down(page, "key-5")).toBe(false);
  expect(await settled(page, "key-5")).toBe(0);
  expect(await clicks(page)).toEqual(["key-5"]);
  // Released elsewhere: the key still lets go, and no click lands on it.
  await clear(page);
  await page.mouse.move(...centreOf(five));
  await page.mouse.down();
  await page.mouse.move(700, 400);
  expect(await down(page, "key-5"), "held while the pointer is down, wherever it goes").toBe(true);
  await page.mouse.up();
  expect(await down(page, "key-5")).toBe(false);
  expect(await clicks(page)).toEqual([]);

  // Space holds it while down and clicks on release; Enter clicks on press and holds until released.
  await page.locator("#key-6").focus();
  await page.keyboard.down("Space");
  expect(await down(page, "key-6")).toBe(true);
  expect(await clicks(page)).toEqual([]);
  await page.keyboard.up("Space");
  expect(await down(page, "key-6")).toBe(false);
  expect(await clicks(page)).toEqual(["key-6"]);
  await page.keyboard.down("Enter");
  expect(await down(page, "key-6")).toBe(true);
  expect(await clicks(page), "Enter clicks as it goes down").toEqual(["key-6", "key-6"]);
  await page.keyboard.up("Enter");
  expect(await down(page, "key-6")).toBe(false);
  // Losing focus while a key is down lets go.
  await page.keyboard.down("Space");
  expect(await down(page, "key-6")).toBe(true);
  await page.locator("#hex-a").focus();
  expect(await down(page, "key-6")).toBe(false);
  await page.keyboard.up("Space");
  await clear(page);

  // A disabled key is never held or moved, and nothing activates.
  await page.locator("#key-star").click({ force: true });
  expect(await down(page, "key-star")).toBe(false);
  expect(await travel(page, "key-star")).toBe(0);
  expect(await clicks(page)).toEqual([]);
  await page.evaluate(() => { document.getElementById("key-7").setAttribute("aria-disabled", "true"); });
  await page.mouse.click(...centreOf(await page.locator("#key-7").boundingBox()));
  expect(await down(page, "key-7")).toBe(false);
  expect(await clicks(page), "a click on an aria-disabled key is stopped").toEqual([]);
  await page.evaluate(() => { document.getElementById("key-7").removeAttribute("aria-disabled"); });

  // A submit key submits its name and value, once.
  await clear(page);
  await page.locator("#key-hash").click();
  await expect(page.locator("#key-data")).toHaveText(JSON.stringify({ entry: "#" }));
  expect((await events(page)).filter(event => event.type === "submit")).toHaveLength(1);

  // The legends: the first large, the second smaller beneath it; a shifted keypad prints the second large and the first small, first.
  const sizes = await page.evaluate(() => {
    const px = (selector) => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const top = (selector) => document.querySelector(selector).getBoundingClientRect().top;
    return { print: px("#key-2 .ug-keypad__print"), shift: px("#key-2 .ug-keypad__shift"), shiftedPrint: px("#hex-a .ug-keypad__print"), shiftedShift: px("#hex-a .ug-keypad__shift"),
      order: top("#key-2 .ug-keypad__print") < top("#key-2 .ug-keypad__shift"), shiftedOrder: top("#hex-a .ug-keypad__shift") < top("#hex-a .ug-keypad__print") };
  });
  expect(sizes.print, "the first legend is larger").toBeGreaterThan(sizes.shift);
  expect(sizes.order, "the second legend is under it").toBe(true);
  expect(sizes.shiftedShift, "shifted: the second legend is larger").toBeGreaterThan(sizes.shiftedPrint);
  expect(sizes.shiftedOrder, "shifted: it is printed first").toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("the keys are one tab stop, and the arrows, Home, End and Control+Home/End move between them, skipping a disabled key and a short row's missing one", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const tabindex = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("#dial .ug-keypad__key")].map(key => [key.id, key.getAttribute("tabindex")])));
  const focused = () => page.evaluate(() => document.activeElement?.id);
  expect(Object.values(await tabindex()), "no script change before focus enters").toEqual(Array(12).fill(null));
  await page.locator("#key-title").evaluate(title => { title.tabIndex = -1; title.focus(); });
  await page.keyboard.press("Tab");
  expect(await focused()).toBe("key-1");
  const roving = await tabindex();
  expect(Object.entries(roving).filter(([, value]) => value === "0").map(([id]) => id), "one tab stop").toEqual(["key-1"]);
  expect(Object.entries(roving).filter(([id, value]) => id !== "key-star" && value === "-1")).toHaveLength(10);
  // Three columns: 1 2 3 / 4 5 6 / 7 8 9 / * 0 #.
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("key-2");
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe("key-5");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await focused(), "0, under 8").toBe("key-0");
  await page.keyboard.press("ArrowLeft");
  expect(await focused(), "the disabled * is skipped; nothing else to the left").toBe("key-0");
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("key-hash");
  await page.keyboard.press("ArrowRight");
  expect(await focused(), "no wrap at the row's end").toBe("key-hash");
  await page.keyboard.press("ArrowDown");
  expect(await focused(), "nothing below the last row").toBe("key-hash");
  await page.keyboard.press("Home");
  expect(await focused(), "the first enabled key of the row").toBe("key-0");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  expect(await focused(), "7, then down: the disabled * below is skipped, nothing past it").toBe("key-7");
  await page.keyboard.press("End");
  expect(await focused()).toBe("key-9");
  await page.keyboard.press("Control+Home");
  expect(await focused()).toBe("key-1");
  await page.keyboard.press("Control+End");
  expect(await focused()).toBe("key-hash");
  expect(await clicks(page), "moving focus presses nothing").toEqual([]);
  await page.keyboard.press("Space");
  expect(await clicks(page)).toEqual(["key-hash"]);
  // Tab leaves the keypad for the next one (one stop each), and Shift+Tab returns to the key that was current.
  await page.evaluate(() => { document.getElementById("key-form").addEventListener("submit", event => event.preventDefault()); });
  await page.keyboard.press("Tab");
  expect(await focused()).toBe("hex-a");
  expect((await page.evaluate(() => document.getElementById("hex-b").getAttribute("tabindex")))).toBe("-1");
  await page.keyboard.press("ArrowDown");
  expect(await focused(), "the hex keypad has two columns").toBe("hex-c");
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("hex-d");
  await page.keyboard.press("ArrowDown");
  expect(await focused()).toBe("hex-d");
  await page.keyboard.press("Shift+Tab");
  expect(await focused()).toBe("key-hash");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await context.close();
});

test("touch: a tap clicks, and a touch hold lowers the cap, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-keypad.html?plain");
  await page.waitForFunction(() => window.strataKeypadProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  await page.touchscreen.tap(...centreOf(await page.locator("#key-8").boundingBox()));
  expect(await clicks(page)).toEqual(["key-8"]);
  // A hold: the cap is down while the touch is.
  const client = await context.newCDPSession(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const [x, y] = centreOf(await page.locator("#key-5").boundingBox());
  await touch("touchStart", [{ x, y }]);
  expect(await down(page, "key-5")).toBe(true);
  expect(await settled(page, "key-5")).toBe(1);
  await touch("touchEnd", []);
  expect(await down(page, "key-5")).toBe(false);
  expect(await settled(page, "key-5")).toBe(0);
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the keypads reflow with no horizontal overflow, key boxes of at least 24 px, the cap inside its key and the plinth inside the fieldset`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-keypad.html?plain");
  await page.waitForFunction(() => window.strataKeypadProbe);
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    panel: document.getElementById("key-panel").getBoundingClientRect().right,
    keys: [...document.querySelectorAll("button.ug-keypad__key")].map(button => {
      const box = button.getBoundingClientRect(), cap = button.querySelector(".ug-keypad__cap").getBoundingClientRect();
      return { id: button.id, left: box.left, right: box.right, width: box.width, height: box.height, capInBox: cap.left >= box.left && cap.right <= box.right && cap.top >= box.top && cap.bottom <= box.bottom };
    }),
    plinths: [...document.querySelectorAll("fieldset.ug-keypad")].map(fieldset => {
      const box = fieldset.getBoundingClientRect(), plinth = fieldset.querySelector(".ug-keypad__plinth").getBoundingClientRect();
      return { id: fieldset.id, width: box.width, inside: plinth.left >= box.left && plinth.right <= box.right && plinth.top >= box.top && plinth.bottom <= box.bottom, right: box.right };
    }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const key of layout.keys) {
    expect(Math.min(key.width, key.height), `${key.id}: box`).toBeGreaterThanOrEqual(24);
    expect(key.left).toBeGreaterThanOrEqual(0);
    expect(key.right).toBeLessThanOrEqual(layout.panel + 0.5);
    expect(key, `${key.id}: the cap nests in the key`).toMatchObject({ capInBox: true });
  }
  for (const plinth of layout.plinths) expect(plinth, `${plinth.id}: the plinth nests in the fieldset`).toMatchObject({ inside: true });
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, ${layout.keys.length} keys, smallest key box ${Math.min(...layout.keys.map(key => Math.min(key.width, key.height))).toFixed(1)} px, keypads ${layout.plinths.map(plinth => plinth.width).join(" and ")} px wide`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the legends wrap and grow the key, the cap and the plinth follow it, and nothing overflows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/ui-keypad.html?plain");
  await page.waitForFunction(() => window.strataKeypadProbe);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    keyRight: Math.max(...[...document.querySelectorAll("button.ug-keypad__key")].map(button => button.getBoundingClientRect().right)),
    nine: (button => { const cap = button.querySelector(".ug-keypad__cap").getBoundingClientRect(), box = button.getBoundingClientRect();
      // A glyph box of a tight line height (1.1) stands up to 2 px past its line box; the ink is inside the cap.
      const inside = [...button.querySelectorAll(".ug-keypad__print, .ug-keypad__shift")].every(span => { const text = document.createRange(); text.selectNodeContents(span); const t = text.getBoundingClientRect(); return t.left >= cap.left - 1 && t.right <= cap.right + 1 && t.top >= cap.top - 3 && t.bottom <= cap.bottom + 3; });
      return { capHeight: cap.height, boxHeight: box.height, boxWidth: box.width, textInCap: inside, capInBox: cap.left >= box.left && cap.right <= box.right && cap.top >= box.top && cap.bottom <= box.bottom }; })(document.getElementById("key-9")),
  }));
  expect(result.scrollWidth).toBeLessThanOrEqual(320);
  expect(result.keyRight, "every key is inside the viewport").toBeLessThanOrEqual(320);
  expect(result.nine).toMatchObject({ textInCap: true, capInBox: true });
  console.log(`200% text: key 9's cap ${result.nine.capHeight.toFixed(1)} px high in a ${result.nine.boxWidth.toFixed(1)} × ${result.nine.boxHeight.toFixed(1)} box`);
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the keypads pass axe in light, dark and face mode, and under more contrast, reduced motion and forced colours", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#key-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#key-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    expect(summary(face.incomplete.filter(result => result.id === "color-contrast")), `undecided contrast, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#key-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  // A held and a focused key pass too.
  await page.evaluate(() => { document.getElementById("key-5").setAttribute("data-strata-down", "true"); document.getElementById("key-2").setAttribute("data-strata-preview", "focus hover"); });
  const states = await new AxeBuilder({ page }).include("#key-panel").withTags(tags).analyze();
  expect(summary(states.violations), "axe, a held, a hovered and a focused key").toEqual([]);
  await page.evaluate(() => { document.getElementById("key-5").removeAttribute("data-strata-down"); document.getElementById("key-2").removeAttribute("data-strata-preview"); delete document.documentElement.dataset.strataTheme; });
  // More contrast: caps and plinth edged in the text colour.
  await page.emulateMedia({ contrast: "more" });
  const more = await page.evaluate(() => ({ cap: getComputedStyle(document.querySelector(".ug-keypad__cap")).borderTopWidth, plinth: getComputedStyle(document.querySelector(".ug-keypad__plinth")).borderTopWidth }));
  expect(parseFloat(more.cap)).toBeGreaterThanOrEqual(1);
  expect(parseFloat(more.plinth)).toBeGreaterThanOrEqual(1);
  const contrast = await new AxeBuilder({ page }).include("#key-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  // Reduced motion: travel changes at once.
  await page.emulateMedia({ contrast: "no-preference", reducedMotion: "reduce" });
  expect(await page.locator("#key-5").evaluate(button => getComputedStyle(button).transitionDuration)).toBe("0s");
  // Forced colours: Canvas plinth and ButtonFace caps with ButtonText borders, GrayText when disabled.
  await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "active" });
  const forced = await page.evaluate(() => {
    const cap = getComputedStyle(document.querySelector("#key-5 .ug-keypad__cap")), off = getComputedStyle(document.querySelector("#key-star .ug-keypad__cap")), plinth = getComputedStyle(document.querySelector(".ug-keypad__plinth"));
    return { cap: cap.borderTopStyle, capColour: cap.borderTopColor, disabled: off.borderTopColor, plinth: plinth.borderTopStyle, border: getComputedStyle(document.getElementById("key-5")).borderTopWidth };
  });
  expect(forced.cap).toBe("solid");
  expect(forced.plinth).toBe("solid");
  expect(forced.disabled, "a disabled key is edged in GrayText").not.toBe(forced.capColour);
  expect(forced.border).toBe("0px");
  const forcedAxe = await new AxeBuilder({ page }).include("#key-panel").withTags(tags).analyze();
  expect(summary(forcedAxe.violations), "axe, forced colours").toEqual([]);
  // Focus is a ring round the cap in every presentation.
  await page.locator("#key-2").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.locator("#key-2 .ug-keypad__cap").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-keypad.html${query}`);
  await page.waitForFunction(() => window.strataKeypadProbe && window.strataKeypadProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataKeypadProbe.scene() !== undefined);
  await page.evaluate(() => window.strataKeypadProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => { const instrument = window.strataKeypadProbe.instrument(); return !instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"); }, null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataKeypadProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  await page.waitForFunction(() => window.strataKeypadProbe.instrument().layers.every(layer => layer.status !== "pending"), null, { timeout: 30000 });
  const state = await page.evaluate(() => window.strataKeypadProbe.instrument().layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the CSS transitions, the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    const probe = window.strataKeypadProbe;
    await new Promise(resolve => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 40 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
    probe.refresh(); await probe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await probe.controller.settle();
  }, wait);
  await page.waitForFunction(() => { const instrument = window.strataKeypadProbe.instrument(); return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending")); }, null, { timeout: 30000 });
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
    if (allowed.some(region => px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) { inside++; extent[0] = Math.min(extent[0], px); extent[1] = Math.min(extent[1], py); extent[2] = Math.max(extent[2], px); extent[3] = Math.max(extent[3], py); if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
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
/** Native hits on frame points: how many land on a key or the keypad (the plinth belongs to the fieldset). */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.closest("button.ug-keypad__key, fieldset.ug-keypad")) mismatches++;
  return { total: points.length, mismatches };
}, points);
/** elementFromPoint over a grid on a key's box (inset 0.5 px): every hit must be the key or something inside it. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const button = document.getElementById(id), box = button.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    // The key's border is a rounded square, which is its hit shape: points in the box's corners outside it are the plinth's.
    const radius = Math.min(parseFloat(getComputedStyle(button).borderTopLeftRadius), box.width / 2, box.height / 2);
    const dx = Math.max(0, Math.abs(x - (box.left + box.width / 2)) - (box.width / 2 - radius)), dy = Math.max(0, Math.abs(y - (box.top + box.height / 2)) - (box.height / 2 - radius));
    if (Math.hypot(dx, dy) > radius - 0.75) continue;
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== button && !(hit && button.contains(hit))) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);
const counts = page => page.evaluate(() => window.strataKeypadProbe.counts());
const depth = (page, value) => page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataKeypadProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, outset: scene.outset,
    primitives: scene.primitives, faces: scene.primitives.map(entry => entry.face ?? entry.object),
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), emitters: object.parts.map(part => part.emitter), glass: object.parts.map(part => part.glass),
      state: object.parts[0].state, pose: object.parts.map(part => part.pose?.to?.travel), at: object.parts.map(part => part.at[2]), casters: object.parts.map(part => part.caster === undefined ? "own" : part.caster === null ? "none" : part.caster.height),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id))[index]) < 0.01) })) };
});

for (const dpr of [1, 2]) for (const level of levels) test(`the keypads at ${level} (DPR ${dpr}): the scene, containment and hits`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  expect(scene.emitters, "a keypad has no light").toBeUndefined();
  if (level === "instrument") {
    expect(scene.version).toBe(4);
    // The plinths first (the fieldsets), then the keys in document order.
    expect(scene.objects.map(object => object.id)).toEqual(["dial", "hex", ...keys]);
    for (const id of ["dial", "hex"]) {
      const plinth = scene.objects.find(object => object.id === id);
      expect(plinth.parts, `${id}: one polished part`).toEqual(["bezel:pushBezel"]);
      expect(plinth.close, `${id}: bounds are the fieldset's box`).toBe(true);
      expect(plinth.t).toBe(0);
    }
    for (const object of scene.objects.filter(object => keys.includes(object.id))) {
      expect(object.parts, `${object.id}: parts`).toEqual([expect.stringMatching(/^plinth:key #[0-9a-f]{6}$/), "cap:keyCap"]);
      expect(object.pose, `${object.id}: the body and the captured cap travel 2.5 px`).toEqual([-2.5, -2.5]);
      expect(object.at[0], `${object.id}: the body stands on the plinth's top`).toBeCloseTo(2.4, 3);
      expect(object.close, `${object.id}: bounds are the key's box`).toBe(true);
      expect(object.casters[1], "the captured cap casts nothing").toBe("none");
      expect(object.t).toBe(0);
    }
    expect(scene.objects.find(object => object.id === "key-star").state).toMatchObject({ disabled: true });
    expect(await page.evaluate(() => [...document.querySelectorAll("button.ug-keypad__key, .ug-keypad__plinth")].filter(element => !element.hasAttribute("data-strata-dome")).length), "the CSS paint of the plinths is hidden").toBe(0);
  } else {
    const wanted = level === "relief" ? { plinth: "raised", cap: "raised" } : { plinth: "slab", cap: "key" };
    expect(scene.faces.filter(face => face === wanted.cap).length, "a cap each").toBeGreaterThanOrEqual(keys.length);
    expect(scene.faces.filter(face => face === wanted.plinth).length, "a plinth each").toBeGreaterThanOrEqual(2);
    const entryOf = selector => page.evaluate(selector => {
      const probe = window.strataKeypadProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect(), rect = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (rect.left - panel.left)) < 0.6 && Math.abs(p.rect[1] - (rect.top - panel.top)) < 0.6 && Math.abs(p.rect[2] - rect.width) < 0.6) ?? null;
    }, selector);
    const cap = await entryOf("#key-5 .ug-keypad__cap"), plinth = await entryOf("#dial .ug-keypad__plinth");
    if (level === "relief") expect([plinth, cap]).toMatchObject([{ face: "raised", material: "satin" }, { face: "raised" }]);
    else expect([plinth, cap]).toMatchObject([{ object: "slab", material: "satin" }, { object: "key", finish: true }]);
    expect(cap.radius, "the cap's corner radius is 0.22 of its side").toBeCloseTo(9.68, 2);
    if (level === "objects") expect(cap.base, "a key stands on the plinth's top").toBeGreaterThan(0.25);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every key's box.
  for (const id of keys) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${keys.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment: what the keypads draw lies inside the fieldsets' boxes (the keys' boxes lie inside them), and hits on those pixels find a
  // key or the keypad; at the Instrument level over three depths.
  const fieldsets = await inFrame(page, "fieldset.ug-keypad");
  const readout = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#key-read"))[0]);
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await depth(page, value);
    const label = value === null ? "0.5" : String(value);
    await page.evaluate(() => { for (const element of document.querySelectorAll("fieldset.ug-keypad")) element.style.visibility = "hidden"; });
    const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-bare`);
    await page.evaluate(() => { for (const element of document.querySelectorAll("fieldset.ug-keypad")) element.style.visibility = ""; });
    const drawn = difference(await frame(page, `${level}-dpr${dpr}-depth${label}-shown`), bare, [...fieldsets, readout], { points: true });
    expect(drawn.inside, `depth ${label}: the keypads are drawn`).toBeGreaterThan(6000 * dpr * dpr);
    expect(drawn.outside, `depth ${label}: no pixel outside a fieldset (${JSON.stringify(drawn.outsideSamples)}; boxes ${JSON.stringify(fieldsets.map(box => [box.id, ...[box.x, box.y, box.width, box.height].map(Math.round)]))})`).toBe(0);
    const hit = await hitsOn(page, drawn.changed.filter(([x, y]) => !(x >= readout.x && x <= readout.x + readout.width && y >= readout.y && y <= readout.y + readout.height)));
    expect(hit.mismatches, `depth ${label}: native hits on pixels the keypads draw`).toBe(0);
    await healthy(page, `depth ${label}`, level);
    console.log(`DPR ${dpr} ${level}: depth ${label}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
  }
  await depth(page, null);
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`a real press at ${level} gives fresh pixels in the key's box only with GPU on, and no hit-geometry update`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await page.evaluate(() => { document.getElementById("key-read").style.visibility = "hidden"; });
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#key-read"))[0]);
  const boxes = await inFrame(page, "button.ug-keypad__key");
  const before = await frame(page, `${level}-press-before`);
  const start = await counts(page);
  await page.mouse.move(...centreOf(await page.locator("#key-5").boundingBox()));
  await page.mouse.down();
  if (level === "instrument") {
    await page.evaluate(() => document.getAnimations().length && Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined))));
    await page.evaluate(() => window.strataKeypadProbe.refresh());
    const five = await page.evaluate(() => window.strataKeypadProbe.scene().objects.find(object => object.id === "key-5"));
    expect(five.t, "held: the cap all the way down").toBe(1);
    expect(five.parts[0].state.pressed, "the part state says pressed").toBe(true);
    // 40 frames of the cap's throw: uniform writes, no capture.
    const throwing = await page.evaluate(async () => {
      const probe = window.strataKeypadProbe, next = () => new Promise(requestAnimationFrame);
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
  const after = await frame(page, `${level}-press-after`, { wait: 400 });
  const end = await counts(page);
  const five = boxes.find(box => box.id === "key-5");
  const changed = difference(before, held, [five, read]);
  console.log(`${level}: a press: ${changed.inside} px changed in the key's box, ${changed.outside} outside; ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.geometryUpdates - start.geometryUpdates} hit-geometry updates`);
  expect(changed.inside, "fresh pixels while held").toBeGreaterThan(100);
  expect(changed.outside, `no stale or stray pixels (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
  expect(await travel(page, "key-5")).toBe(0);
  const again = await frame(page, `${level}-press-after-again`, { wait: 400 });
  const back = difference(after, again, [five, read]);
  expect([back.inside, back.outside], `two settled captures after the release are identical (differences within ${JSON.stringify(back.extent)})`).toEqual([0, 0]);
  expect(end.mode).toBe("gpu");
  expect(end.geometryUpdates - start.geometryUpdates, "no hit-geometry update").toBe(0);
  if (level === "instrument") expect(end.captures - start.captures, "a press at the Instrument level is captured as it goes down and as it comes up, no more").toBeLessThanOrEqual(3);
  await healthy(page, "press", level);
  // Hover reaches the parts; a disabled key is flat.
  const stateOf = id => page.evaluate(([id, level]) => {
    const scene = window.strataKeypadProbe.scene();
    if (level === "instrument") return scene.objects.find(object => object.id === id).parts.map(part => part.state);
    const cap = document.getElementById(id).querySelector(".ug-keypad__cap").getBoundingClientRect(), panel = window.strataKeypadProbe.panel().getBoundingClientRect();
    return scene.primitives.filter(entry => entry.rect && Math.abs(entry.rect[0] - (cap.left - panel.left)) < 0.6 && Math.abs(entry.rect[1] - (cap.top - panel.top)) < 0.6).map(entry => entry.state);
  }, [id, level]);
  const settle = () => page.evaluate(async () => { window.strataKeypadProbe.refresh(); await window.strataKeypadProbe.controller.settle(); });
  await page.mouse.move(2, 2);
  await settle();
  expect((await stateOf("key-5")).every(state => !state.hover && !state.disabled)).toBe(true);
  await page.mouse.move(...centreOf(await page.locator("#key-5").boundingBox()));
  await settle();
  expect((await stateOf("key-5")).every(state => state.hover === true && !state.disabled), "hover").toBe(true);
  expect((await stateOf("key-star")).every(state => state.disabled === true), "disabled").toBe(true);
  await healthy(page, "states", level);
  await context.close();
});

test("the keypad page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-keypad.html?dom");
  await page.waitForFunction(() => window.strataKeypadProbe);
  await page.evaluate(() => { document.getElementById("key-form").addEventListener("submit", event => event.preventDefault()); });
  const act = async () => { await page.locator("#key-2").focus(); await page.keyboard.press("Space"); await page.locator("#hex-a").focus(); await page.keyboard.press("Enter"); };
  await act();
  const dom = await page.locator("#key-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await page.evaluate(() => { document.getElementById("key-form").addEventListener("submit", event => event.preventDefault()); });
    await act();
    const gpu = await page.locator("#key-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('group "Dial"');
    expect(gpu).toContain('button "2 ABC"');
    expect(gpu).toContain('group "Hex entry"');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#key-panel").withTags(tags).analyze();
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
  await page.goto(`/ui-keypad.html?plain${query}`);
  await page.waitForFunction(() => window.strataKeypadProbe);
  return { context, page };
}
const log = page => page.evaluate(() => ({ ...window.feedbackLog, pulses: [...window.feedbackLog.pulses] }));
const click = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); };

test("feedback is off by default: real presses create no audio and pulse nothing", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "");
  for (const id of ["key-1", "key-2", "hex-a"]) await click(page, id);
  await page.locator("#key-5").focus();
  await page.keyboard.press("Space");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  console.log("off by default: 4 real presses, 0 audio contexts, 0 sounds, 0 pulses");
  await context.close();
});

test("with sound on, audio waits for the first gesture on a key, then each press plays its click once", async ({ browser }) => {
  const { context, page } = await feedbackPage(browser, "&sound");
  expect((await log(page)).contexts, "nothing before a gesture").toBe(0);
  await page.locator("#key-2").evaluate(button => button.click());
  await page.waitForTimeout(60);
  expect(await log(page), "a scripted click is no gesture and no press").toMatchObject({ contexts: 0, played: 0 });
  await page.mouse.click(5, 5);
  expect((await log(page)).contexts, "a gesture elsewhere creates nothing").toBe(0);
  await click(page, "key-1");
  let now = await log(page);
  expect(now.contexts, "the first gesture on a key creates the context").toBe(1);
  expect(now.resumes).toBeGreaterThanOrEqual(1);
  expect(now.played, "its press plays once").toBe(1);
  // A held press plays as it goes down, not again as it comes up; the keys play once each.
  const box = await page.locator("#key-2").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect((await log(page)).played, "the press").toBe(2);
  await page.mouse.up();
  await page.waitForTimeout(60);
  expect((await log(page)).played, "no sound on release").toBe(2);
  await page.locator("#key-2").focus();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  now = await log(page);
  expect(now.played, "Space plays once").toBe(3);
  expect(now.contexts, "one context for all of them").toBe(1);
  expect(await page.evaluate(() => window.strataKeypadProbe.events().filter(event => event.type === "click").length), "the native event path is unchanged: one click per press (and the script's)").toBe(4);
  console.log(`sound on: ${now.contexts} context, ${now.played} clicks for 3 presses`);
  await context.close();
});

test("with haptics on a real press pulses 8 ms once, a scripted click does not, reduced motion stops pulses, and muted is silent", async ({ browser }) => {
  const haptics = await feedbackPage(browser, "&haptics");
  await click(haptics.page, "key-1");
  expect((await log(haptics.page)).pulses, "a press pulses the click's 8 ms").toEqual([8]);
  await haptics.page.waitForTimeout(1100);
  await haptics.page.locator("#key-2").evaluate(button => button.click());
  expect((await log(haptics.page)).pulses, "a scripted one does not").toEqual([8]);
  await haptics.page.locator("#key-2").focus();
  await haptics.page.keyboard.press("Enter");
  expect((await log(haptics.page)).pulses, "Enter is the visitor's own: one pulse").toEqual([8, 8]);
  await haptics.context.close();
  const reduced = await feedbackPage(browser, "&haptics", { reducedMotion: "reduce" });
  await click(reduced.page, "key-1");
  expect((await log(reduced.page)).pulses, "none under reduced motion").toEqual([]);
  await reduced.context.close();
  const muted = await feedbackPage(browser, "&sound&haptics&muted");
  await click(muted.page, "key-1");
  expect(await log(muted.page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  await muted.context.close();
});
