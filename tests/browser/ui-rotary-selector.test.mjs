/**
 * Browser suite for the Strata RotarySelector (anatomy page `rotary-selector.md`) on `ui-rotary-selector.html`
 * (`window.strataRotaryProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`),
 * in a Strata panel.
 * - Plain DOM (`?plain`), real select: ring clicks on printed labels select their options; cap taps step to the next enabled
 *   option and back; vertical drags with and without Shift and the tap threshold; the wheel steps without scrolling the page;
 *   native keys and type-ahead; a disabled option is never selected by any gesture; `input` then `change` fire once per option;
 *   the form submits the value; the cap's angle and the selected print follow.
 * - Touch (Playwright touch emulation): a tap on a label and a touch drag, as pointer events of type touch.
 * - Mobile and text size: at 320 and 390 px no horizontal overflow, targets of at least 24 px, the print inside the viewport; at
 *   200% text nothing overlaps or leaves the dial (labels round the knob, or the numbers and the legend when it is narrow).
 * - Preferences and accessibility: axe in light, dark and face mode, forced colours draw a visible control, reduced motion.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on through every change; at every option position the
 *   selector's parts change pixels and only inside its dial; native hits over the dial land on the select (0 mismatches); at the
 *   Instrument level the parts are the Knob's, contained, with hits on every part pixel, and 300 frames of detent snaps add 0
 *   captures in the turning frames and 0 hit-geometry updates; the accessibility snapshot is the same in DOM and GPU modes.
 * - Feedback: a changed option ticks once, once feedback is on, and nothing plays by default.
 * Screenshots go to the `ui-rotary-selector` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-rotary-selector");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);

const value = (page, id) => page.locator(`#${id}`).evaluate(select => select.value);
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
/** The centre of a selector's printed label, by its text. */
async function label(page, id, text) {
  return centre(await page.locator(`#${id}-rotary .ug-rotary__text`).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
}
/** The dial's centre and the skirt's radius. */
async function dial(page, id) {
  const box = await page.locator(`#${id}-rotary .ug-rotary__dial`).boundingBox(), skirt = await page.locator(`#${id}-rotary .ug-rotary__skirt`).boundingBox();
  return { box, cx: box.x + box.width / 2, cy: box.y + box.height / 2, r: skirt.width / 2 };
}
async function drag(page, [x, y], dy, { shift = false, steps = 10 } = {}) {
  await page.mouse.move(x, y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
const events = page => page.evaluate(() => window.strataRotaryProbe.events());
const clear = page => page.evaluate(() => window.strataRotaryProbe.clearEvents());
const filter = ["lp", "hp", "bp", "notch", "peak"];
const labels = { lp: "LP", hp: "HP", bp: "BP", notch: "Notch", peak: "Peak" };

test("a rotary selector behaves round in plain DOM: label clicks, cap taps, drags, the wheel, keys, disabled options and the form", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-rotary-selector.html?plain");
  await page.waitForFunction(() => window.strataRotaryProbe);
  const select = page.locator("#filter");
  await expect(select).toHaveRole("combobox");
  await expect(select).toHaveAccessibleName("Filter");
  expect(await value(page, "filter")).toBe("lp");
  expect(await page.locator("#filter-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("0");

  // A click on a printed label selects its option, focuses the select, and fires input then change once.
  await clear(page);
  await page.mouse.click(...await label(page, "filter", "Notch"));
  expect(await value(page, "filter")).toBe("notch");
  expect(await events(page)).toEqual([{ id: "filter", type: "input", value: "notch" }, { id: "filter", type: "change", value: "notch" }]);
  await expect(select).toBeFocused();
  for (const option of [...filter].reverse()) {
    await page.mouse.click(...await label(page, "filter", labels[option]));
    expect(await value(page, "filter"), `click on ${labels[option]}`).toBe(option);
  }
  // The cap's angle and the printed selection follow: the selected label and legend entry, the pointer's fraction.
  await page.mouse.click(...await label(page, "filter", "BP"));
  expect(await page.locator("#filter-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("0.5");
  expect(await page.locator("#filter-rotary").evaluate(root => [...root.querySelectorAll(".ug-rotary__mark")].map(mark => mark.getAttribute("data-strata-selected")))).toEqual(["false", "false", "true", "false", "false"]);
  expect(await page.locator("#filter-rotary").evaluate(root => [...root.querySelectorAll(".ug-rotary__legend > li")].map(item => item.getAttribute("data-strata-selected")))).toEqual(["false", "false", "true", "false", "false"]);
  await page.waitForFunction(() => !document.querySelector("#filter-rotary .ug-rotary__pointer").getAnimations().length);
  expect(await page.locator("#filter-rotary .ug-rotary__pointer").evaluate(element => getComputedStyle(element).rotate)).toBe("0deg");
  await expect(page.locator("#rotary-read")).toHaveText("Filter bp, source line");
  // A click in the bottom gap goes to the nearer end.
  const f = await dial(page, "filter");
  await page.mouse.click(f.cx - 10, f.box.y + f.box.height - 2);
  expect(await value(page, "filter")).toBe("lp");
  await page.mouse.click(f.cx + 10, f.box.y + f.box.height - 2);
  expect(await value(page, "filter")).toBe("peak");

  // Cap taps (WCAG 2.5.7): the upper half steps to the next option, the lower half to the previous, on the cap and the skirt.
  await page.mouse.click(f.cx, f.cy - 10);
  expect(await value(page, "filter"), "no next option after the last").toBe("peak");
  await page.mouse.click(f.cx, f.cy + 10);
  expect(await value(page, "filter")).toBe("notch");
  await page.mouse.click(f.cx, f.cy + f.r - 3);
  expect(await value(page, "filter")).toBe("bp");
  await page.mouse.click(f.cx, f.cy - f.r + 3);
  expect(await value(page, "filter")).toBe("notch");
  // A press that moves under knob.tapSlop (4 px) is still a tap.
  await drag(page, [f.cx, f.cy + 10], 3, { steps: 3 });
  expect(await value(page, "filter")).toBe("bp");

  // Drag: 200 px per full sweep, 50 px per position of five, up goes to the next; Shift is ten times finer.
  await page.mouse.click(...await label(page, "filter", "LP"));
  await clear(page);
  await drag(page, [f.cx, f.cy], -110, { steps: 22 });
  expect(await value(page, "filter")).toBe("bp");
  const dragged = await events(page);
  expect(dragged.filter(event => event.type === "input").map(event => event.value), "one input per option passed").toEqual(["hp", "bp"]);
  expect(dragged.filter(event => event.type === "change").map(event => event.value)).toEqual(["hp", "bp"]);
  await drag(page, [f.cx, f.cy], -400, { shift: true, steps: 40 });
  expect(await value(page, "filter"), "Shift is finer: 400 px moves under one position and a half").toBe("notch");
  await drag(page, [f.cx, f.cy], 500, { steps: 40 });
  expect(await value(page, "filter"), "a drag clamps at the first option").toBe("lp");
  await drag(page, [f.cx, f.cy], -600, { steps: 40 });
  expect(await value(page, "filter"), "and at the last").toBe("peak");

  // The wheel: a notch up goes to the next option, the page does not scroll; elsewhere it scrolls as usual.
  await page.mouse.click(...await label(page, "filter", "BP"));
  await page.mouse.move(f.cx, f.cy);
  await page.mouse.wheel(0, -100);
  expect(await value(page, "filter")).toBe("notch");
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "filter")).toBe("hp");
  expect(await page.evaluate(() => window.scrollY), "the page does not scroll over a selector").toBe(0);
  await page.mouse.move(400, 20);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Keys are native: arrows move through the options without opening the popup, Home and End, type-ahead.
  await select.focus();
  await page.keyboard.press("End");
  expect(await value(page, "filter")).toBe("peak");
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "filter")).toBe("notch");
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "filter")).toBe("peak");
  await page.keyboard.press("Home");
  expect(await value(page, "filter")).toBe("lp");
  await page.keyboard.type("n");
  expect(await value(page, "filter"), "type-ahead").toBe("notch");
  expect(await page.locator("#filter-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("0.75");

  // A disabled option (Aux, third of four) is skipped by every gesture and every key.
  await page.mouse.click(...await label(page, "source", "Mic"));
  expect(await value(page, "source")).toBe("mic");
  const s = await dial(page, "source");
  await page.mouse.click(...await label(page, "source", "Aux"));
  expect(await value(page, "source"), "a click on the disabled label selects the nearest enabled option").not.toBe("aux");
  await page.mouse.click(...await label(page, "source", "Line"));
  await page.mouse.click(s.cx, s.cy - 10);
  expect(await value(page, "source"), "a cap tap steps over the disabled option").toBe("bus");
  await page.mouse.click(s.cx, s.cy + 10);
  expect(await value(page, "source")).toBe("line");
  await clear(page);
  await drag(page, [s.cx, s.cy], -80, { steps: 30 });
  expect((await events(page)).map(event => event.value).every(option => option !== "aux")).toBe(true);
  await page.locator("#source").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "source"), "the keys skip it too").toBe("bus");

  // The form submits the selected values.
  await page.locator("#rotary-submit").click();
  await expect(page.locator("#rotary-data")).toHaveText(JSON.stringify({ filter: "notch", source: "bus" }));
  // Reset, a script's change through the helper: the dial follows.
  await page.locator("#rotary-reset").click();
  expect([await value(page, "filter"), await value(page, "source")]).toEqual(["lp", "line"]);
  expect(await page.locator("#filter-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("0");
  // Disabled: no pointer behaviour.
  await page.evaluate(() => { document.getElementById("source").disabled = true; });
  await page.mouse.click(...await label(page, "source", "Bus"));
  expect(await value(page, "source")).toBe("line");
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: a tap on a label selects it and a touch drag turns the selector, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-rotary-selector.html?plain");
  await page.waitForFunction(() => window.strataRotaryProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  for (const option of ["notch", "hp", "peak"]) {
    await page.touchscreen.tap(...await label(page, "filter", labels[option]));
    expect(await value(page, "filter"), `tap on ${labels[option]}`).toBe(option);
  }
  const f = await dial(page, "filter");
  await page.touchscreen.tap(f.cx, f.cy + 10);
  expect(await value(page, "filter"), "a tap on the cap's lower half").toBe("notch");
  // A touch drag 110 px down is 2.2 positions of five back (50 px each): from Notch to HP; the page does not scroll (the select is touch-action: none).
  const client = await context.newCDPSession(page);
  const touch = (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: f.cx, y: f.cy }]);
  for (let step = 1; step <= 22; step++) await touch("touchMove", [{ x: f.cx, y: f.cy + step * 5 }]);
  await touch("touchEnd", []);
  expect(await value(page, "filter")).toBe("hp");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the selectors reflow with no horizontal overflow, 24 px targets and print inside the viewport`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-rotary-selector.html?plain");
  await page.waitForFunction(() => window.strataRotaryProbe);
  const layout = await page.evaluate(() => {
    const boxes = selector => [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height, shown: element.checkVisibility() }; });
    const texts = [...document.querySelectorAll(".ug-rotary__text, .ug-rotary__legend > li, .ug-rotary__label")].filter(element => element.checkVisibility()).map(element => {
      const range = document.createRange(); range.selectNodeContents(element); const box = range.getBoundingClientRect(); return { left: box.left, right: box.right }; });
    return { scrollWidth: document.documentElement.scrollWidth, selects: boxes(".ug-rotary__select"), texts, clipped: [...document.querySelectorAll(".ug-rotary__label")].filter(element => element.scrollWidth > element.clientWidth + 0.5).length,
      compact: [...document.querySelectorAll(".ug-rotary__legend")].map(legend => getComputedStyle(legend).display) };
  });
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const select of layout.selects) expect(Math.min(select.width, select.height)).toBeGreaterThanOrEqual(24);
  for (const box of layout.texts) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  expect(layout.clipped).toBe(0);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, legends ${layout.compact.join("/")}, smallest select ${Math.min(...layout.selects.map(select => Math.min(select.width, select.height)))} px`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text nothing overlaps or leaves the dial: labels round the knob, or numbers and the legend when it is narrow", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 1000 } });
  const page = await context.newPage();
  await page.goto("/ui-rotary-selector.html?plain");
  await page.waitForFunction(() => window.strataRotaryProbe);
  const check = () => page.evaluate(() => [...document.querySelectorAll(".ug-rotary")].map(root => {
    const dial = root.querySelector(".ug-rotary__dial").getBoundingClientRect();
    const marks = [...root.querySelectorAll(".ug-rotary__text")].map(mark => { const range = document.createRange(); range.selectNodeContents(mark); const box = range.getBoundingClientRect(); return { left: box.left, right: box.right, top: box.top, bottom: box.bottom }; });
    const overlaps = marks.flatMap((a, i) => marks.slice(i + 1).filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)).length;
    const outside = marks.filter(box => box.left < dial.left - 0.5 || box.right > dial.right + 0.5 || box.top < dial.top - 0.5 || box.bottom > dial.bottom + 0.5).length;
    const legend = getComputedStyle(root.querySelector(".ug-rotary__legend")).display;
    return { overlaps, outside, legend, dial: dial.width, scrollWidth: document.documentElement.scrollWidth };
  }));
  for (const result of await check()) expect(result).toMatchObject({ overlaps: 0, outside: 0 });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const large = await check();
  for (const result of large) expect(result).toMatchObject({ overlaps: 0, outside: 0, legend: "block" });
  expect(large[0].scrollWidth).toBeLessThanOrEqual(320);
  console.log(`200% text: dials ${large.map(result => result.dial).join(", ")} px wide, legends ${large.map(result => result.legend).join("/")}`);
  // Wide enough at 200%, the labels round the knob come back and still do not collide.
  await page.setViewportSize({ width: 900, height: 1000 });
  for (const result of await check()) expect(result).toMatchObject({ overlaps: 0, outside: 0 });
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the selector passes axe in light, dark and face mode and under reduced motion, and draws a visible control under forced colours", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.goto("/ui-rotary-selector.html?plain");
  await page.waitForFunction(() => window.strataRotaryProbe);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#rotary-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#rotary-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#rotary-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  // The pointer settles on its detent over motion.fast.
  expect(await page.locator("#filter-rotary .ug-rotary__pointer").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0.12s");

  await page.emulateMedia({ forcedColors: "active" });
  const forced = await new AxeBuilder({ page }).include("#rotary-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe under forced colours").toEqual([]);
  const styles = await page.locator("#filter-rotary").evaluate(root => {
    const style = selector => getComputedStyle(root.querySelector(selector));
    return { skirt: [style(".ug-rotary__skirt").borderTopStyle, style(".ug-rotary__skirt").borderTopWidth], cap: style(".ug-rotary__cap").borderTopStyle,
      pointer: getComputedStyle(root.querySelector(".ug-rotary__pointer"), "::after").backgroundColor, canvas: style(".ug-rotary__cap").backgroundColor };
  });
  expect(styles.skirt).toEqual(["solid", "1px"]);
  expect(styles.cap).toBe("solid");
  expect(styles.pointer).not.toBe(styles.canvas);
  const png = PNG.sync.read(await page.locator("#filter-rotary .ug-rotary__dial").screenshot({ path: `${evidence}/forced-colors.png` }));
  const luma = index => 0.2126 * png.data[index] + 0.7152 * png.data[index + 1] + 0.0722 * png.data[index + 2];
  let dark = 0, light = 0;
  for (let index = 0; index < png.data.length; index += 4) { if (luma(index) < 60) dark++; else if (luma(index) > 200) light++; }
  expect(dark, "CanvasText ink in the dial").toBeGreaterThan(300);
  expect(light).toBeGreaterThan(5000);
  await page.locator("#filter").focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator("#filter-rotary .ug-rotary__skirt").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
  expect(await page.locator("#filter-rotary .ug-rotary__pointer").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  await context.close();
});

// ---- GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-rotary-selector.html${query}`);
  await page.waitForFunction(() => window.strataRotaryProbe && window.strataRotaryProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataRotaryProbe.scene() !== undefined);
  await page.evaluate(() => window.strataRotaryProbe.controller.settle());
  await built(page);
}
/** At the Instrument level: every instrument layer built (not pending), so its parts are drawn. */
const built = page => page.waitForFunction(() => {
  const instrument = window.strataRotaryProbe.instrument();
  return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
}, null, { timeout: 30000 });
/** At the Instrument level: every selector's spring at rest on its option. */
const rest = page => page.waitForFunction(() => {
  const probe = window.strataRotaryProbe;
  probe.refresh();
  return (probe.scene()?.objects ?? []).filter(object => object.id === "filter" || object.id === "source").every(object => {
    const select = document.getElementById(object.id), count = select.options.length;
    return Math.abs(object.t - select.selectedIndex / (count - 1)) < 1e-6;
  });
});
const mode = page => page.evaluate(() => window.strataRotaryProbe.controller.state().mode);
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name) {
  await page.mouse.move(2, 2);
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    window.strataRotaryProbe.refresh(); await window.strataRotaryProbe.controller.settle();
  });
  await rest(page);
  await built(page);
  await page.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); await window.strataRotaryProbe.controller.settle(); });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, split into those inside `allowed` boxes (frame CSS px) and outside them. */
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
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect(), box = document.querySelector(selector).getBoundingClientRect();
  return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
}, selector);
/** elementFromPoint over a grid on the dial (inset 0.5 px): every hit must be the select. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const select = document.getElementById(id), box = select.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== select) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);
const queries = { relief: "", objects: "?level=objects", instrument: "?level=instrument" };

for (const dpr of [1, 2]) for (const level of ["relief", "objects", "instrument"]) test(`on the GPU at the ${level} level (DPR ${dpr}) the selector stays presented, turns to every option with fresh pixels inside its dial, and takes native hits`, async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, queries[level]);
  const layer = () => page.evaluate(() => window.strataRotaryProbe.instrument().layers[0]);
  const healthy = async label => {
    expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
    if (level === "instrument") {
      const state = await layer();
      expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
      expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
    }
  };
  // The scene.
  const scene = await page.evaluate(() => {
    const probe = window.strataRotaryProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
    const box = id => { const rect = document.getElementById(id).getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
    const entry = selector => { const rect = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (rect.left - panel.left)) < 0.5 && Math.abs(p.rect[1] - (rect.top - panel.top)) < 0.5 && Math.abs(p.rect[2] - rect.width) < 0.5) ?? null; };
    return { version: scene.version, kind: scene.kind, material: probe.controller.state().materials[0]?.kind, skirt: entry("#filter-rotary .ug-rotary__skirt"), cap: entry("#filter-rotary .ug-rotary__cap"),
      select: scene.primitives.some(p => p.face === "groove" || p.object === "rail"),
      objects: scene.objects?.map(object => ({ id: object.id, parts: object.parts.map(part => `${part.kind}:${part.material}`), close: object.bounds.rect.every((value, index) => Math.abs(value - box(object.id)[index]) < 0.01) })),
      t: scene.objects?.map(object => object.t), pointer: scene.objects?.[0].parts[3].pose };
  });
  if (level === "relief") expect(scene).toMatchObject({ version: 1, material: "relief", skirt: { face: "raised", material: "satin" }, cap: { face: "raised", material: "satin" }, select: false });
  else if (level === "objects") {
    expect(scene).toMatchObject({ version: 2, material: "objects", skirt: { object: "slab", material: "satin" }, cap: { object: "slab", material: "satin" }, select: false });
    expect(scene.cap.base, "the cap stands on the skirt's top").toBe(scene.skirt.base + scene.skirt.height);
  } else {
    expect(scene).toMatchObject({ version: 4, kind: "instrument", material: "instrument" });
    expect(scene.objects).toEqual([
      { id: "filter", parts: ["skirt:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "pointer:knobInk"], close: true },
      { id: "source", parts: ["skirt:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "pointer:knobInk"], close: true },
      { id: "rotary-reset", parts: [expect.stringMatching(/^plinth:key /), "cap:keyCap"], close: true },
      { id: "rotary-submit", parts: [expect.stringMatching(/^plinth:key /), "cap:keyCap"], close: true },
    ]);
    expect(scene.pointer).toEqual({ from: { turn: -225 }, to: { turn: 45 } });
    expect(scene.t.map(t => Math.round(t * 1e4) / 1e4)).toEqual([0, 0.3333, 0, 0]);
  }
  await healthy("start");

  // Native hits: a grid over each dial lands on its select, and the legend on its label.
  for (const id of ["filter", "source"]) {
    const result = await hits(page, id, dpr === 2 ? 21 : 11);
    expect(result.misses, `${id}: hits over the dial`).toEqual([]);
    console.log(`DPR ${dpr} ${level}: ${id} ${result.total} hits, ${result.misses.length} mismatches`);
  }
  expect(await page.evaluate(() => { const legend = document.querySelector("#filter-rotary .ug-rotary__label").getBoundingClientRect();
    return document.elementFromPoint(legend.left + legend.width / 2, legend.top + legend.height / 2)?.className; })).toBe("ug-rotary__label");

  // Instrument: the parts are drawn inside the dials only (against the same page with the dials hidden, the legends kept),
  // and native hits on every part pixel find the select.
  const dials = [await inFrame(page, "#filter-rotary .ug-rotary__dial"), await inFrame(page, "#source-rotary .ug-rotary__dial")];
  if (level === "instrument") {
    const on = await frame(page, `instrument-dpr${dpr}-on`);
    await page.evaluate(() => { for (const dial of document.querySelectorAll(".ug-rotary__dial")) dial.style.visibility = "hidden"; });
    const off = await frame(page, `instrument-dpr${dpr}-off`);
    await page.evaluate(() => { for (const dial of document.querySelectorAll(".ug-rotary__dial")) dial.style.visibility = ""; });
    await frame(page, `instrument-dpr${dpr}-back`);
    const parts = difference(on, off, dials);
    expect(parts.inside, "the selectors' parts are drawn").toBeGreaterThan(2000 * dpr * dpr);
    expect(parts.outside, `no part pixel outside a dial (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
    const ratio = on.width / 640, points = [];
    for (let y = 0; y < on.height; y += 2) for (let x = 0; x < on.width; x += 2) {
      const index = (y * on.width + x) * 4;
      if (Math.abs(on.data[index] - off.data[index]) + Math.abs(on.data[index + 1] - off.data[index + 1]) + Math.abs(on.data[index + 2] - off.data[index + 2]) >= 6) points.push([(x + 0.5) / ratio, (y + 0.5) / ratio]);
    }
    const onParts = await page.evaluate(points => {
      const frame = document.getElementById("frame").getBoundingClientRect();
      let total = 0, mismatches = 0;
      for (const [x, y] of points) { total++; if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches(".ug-rotary__select, .ug-button")) mismatches++; }
      return { total, mismatches };
    }, points);
    expect(onParts.mismatches, "native hits on part pixels").toBe(0);
    console.log(`instrument DPR ${dpr}: ${parts.inside} part px inside the dials, ${parts.outside} outside; ${onParts.total} hits on part pixels, ${onParts.mismatches} mismatches`);
    await healthy("containment");
  }

  // Real input turns the selector to every option: fresh pixels inside the dial, none outside, GPU on.
  const allowed = [...dials, await inFrame(page, "#rotary-read")];
  let before = await frame(page, `${level}-dpr${dpr}-start`);
  for (const option of ["hp", "bp", "notch", "peak", "lp"]) {
    await page.mouse.click(...await label(page, "filter", labels[option]));
    expect(await value(page, "filter"), `click on ${labels[option]}`).toBe(option);
    await healthy(`at ${option}`);
    const after = await frame(page, `${level}-dpr${dpr}-${option}`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${option}: the pointer turned`).toBeGreaterThan(20);
    expect(changed.outside, `${option}: nothing changes outside the dial (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`DPR ${dpr} ${level}: → ${option}: ${changed.inside} px changed in the dial, ${changed.outside} outside`);
    before = after;
  }
  // Real drags, cap taps, keys and the wheel.
  const f = await dial(page, "filter");
  const steps = [
    ["drag up 110 px", async () => drag(page, [f.cx, f.cy], -110, { steps: 22 }), "bp"],
    ["cap tap", async () => page.mouse.click(f.cx, f.cy - 10), "notch"],
    ["End key", async () => { await page.locator("#filter").focus(); await page.keyboard.press("End"); }, "peak"],
    ["wheel notch", async () => { await page.mouse.move(f.cx, f.cy); await page.mouse.wheel(0, 100); }, "notch"],
  ];
  for (const [name, act, expected] of steps) {
    await act();
    expect(await value(page, "filter"), name).toBe(expected);
    const after = await frame(page, `${level}-dpr${dpr}-${expected}-2`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${name}: the pointer turned`).toBeGreaterThan(20);
    expect(changed.outside, `${name}: nothing changes outside the dial (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    await healthy(name);
    before = after;
  }
  // The disabled option: a real click on its label leaves the selector on an enabled one, and the pointer never rests on it.
  await page.mouse.click(...await label(page, "source", "Aux"));
  expect(await value(page, "source")).not.toBe("aux");
  // Every pixel of the box is the control: real clicks in the dial's bottom corners select the ends.
  await page.mouse.click(f.box.x + 1, f.box.y + f.box.height - 1);
  expect(await value(page, "filter")).toBe("lp");
  await page.mouse.click(f.box.x + f.box.width - 1, f.box.y + f.box.height - 1);
  expect(await value(page, "filter")).toBe("peak");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await healthy("end");
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) 300 frames of detent snaps add no capture in the turning frames and no hit-geometry update`, async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  await page.evaluate(() => { document.getElementById("rotary-read").style.visibility = "hidden"; });
  await rest(page);
  const turning = await page.evaluate(async () => {
    const probe = window.strataRotaryProbe, select = document.getElementById("filter"), frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 5; index++) await frame();
    const start = probe.counts();
    let previous = start, extra = 0, moved = 0, changes = 0, t = probe.scene().objects[0].t;
    for (let index = 0; index < 300; index++) {
      // A native change every 15 frames, the spring snapping the pointer to the new detent in between.
      if (index % 15 === 0) { select.selectedIndex = index % 30 === 0 ? 4 : 0; select.dispatchEvent(new Event("input", { bubbles: true })); select.dispatchEvent(new Event("change", { bubbles: true })); changes++; }
      await frame();
      const now = probe.counts(), next = probe.scene().objects[0].t;
      if (index % 15 > 1) extra += now.captures - previous.captures;
      if (next !== t) moved++;
      t = next; previous = now;
    }
    const end = probe.counts();
    return { changes, moved, extra, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  });
  console.log(`instrument DPR ${dpr}: 300 frames, ${turning.changes} native changes, ${turning.moved} frames moving, ${turning.captures} captures (${turning.extra} in snapping frames), ${turning.uploads} uploads, ${turning.geometryUpdates} hit-geometry updates`);
  expect(turning.mode).toBe("gpu");
  expect(turning.moved, "the pointer snaps over many frames").toBeGreaterThan(40);
  expect(turning.extra, "snapping frames cause no capture").toBe(0);
  expect(turning.captures).toBeLessThanOrEqual(turning.changes);
  expect(turning.geometryUpdates).toBe(0);
  const state = await page.evaluate(() => window.strataRotaryProbe.instrument().layers[0]);
  expect(state.status).toBe("ready");
  expect(state.steppedDown).toEqual([]);
  await context.close();
});

test("the accessibility snapshot is the same in DOM and GPU modes at every level, and axe passes on the GPU page", async ({ page }) => {
  await page.goto("/ui-rotary-selector.html?dom");
  await page.waitForFunction(() => window.strataRotaryProbe);
  await page.evaluate(() => window.strataRotaryProbe.controller.settle?.());
  const act = async () => { await page.locator("#filter").focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.locator("#source").focus(); await page.keyboard.press("ArrowDown"); };
  await act();
  const dom = await page.locator("#rotary-panel").ariaSnapshot();
  for (const level of ["relief", "objects", "instrument"]) {
    await ready(page, queries[level]);
    await act();
    const gpu = await page.locator("#rotary-panel").ariaSnapshot();
    expect(gpu, `${level}: the snapshot matches the DOM's`).toBe(dom);
    expect(gpu).toContain('combobox "Filter"');
    expect(await mode(page)).toBe("gpu");
    const { violations } = await new AxeBuilder({ page }).include("#rotary-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page, ${level}`).toEqual([]);
  }
});

test("at the Instrument level under reduced motion the pointer turns at once", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  await page.mouse.click(...await label(page, "filter", "Notch"));
  // The first scene after the change already has the option's place: no spring under reduced motion.
  expect(await page.evaluate(() => { const probe = window.strataRotaryProbe; probe.refresh(); return probe.scene().objects.slice(0, 2).map(object => Math.round(object.t * 1e4) / 1e4); })).toEqual([0.75, 0.3333]);
  expect(await mode(page)).toBe("gpu");
  await context.close();
});

test("a rotary selector ticks once per change once feedback is on, and nothing plays by default", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  await context.addInitScript(() => { window.pulses = []; Object.defineProperty(navigator, "vibrate", { configurable: true, value: pattern => { window.pulses.push(pattern); return true; } }); });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  const pulses = () => page.evaluate(() => window.pulses.splice(0));
  // Off by default: a real key to the next option pulses nothing.
  await page.locator("#filter").focus();
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "filter")).toBe("hp");
  expect(await pulses()).toEqual([]);
  // Haptics on for the page: each change by the visitor's own input is one 5 ms tick.
  await page.evaluate(() => window.strataRotaryProbe.feedback({ haptics: true }));
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "filter")).toBe("bp");
  expect(await pulses()).toEqual([5]);
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "filter")).toBe("peak");
  expect(await pulses(), "End is one change; a key at the last option changes nothing, so no tick").toEqual([5]);
  await page.keyboard.press("Home");
  expect(await pulses(), "a jump across four options is one change, one tick").toEqual([5]);
  await page.mouse.click(...await label(page, "filter", "Notch"));
  expect(await value(page, "filter")).toBe("notch");
  expect(await pulses(), "a click on a label is one change, one tick").toEqual([5]);
  await page.mouse.click(...await label(page, "filter", "Notch"));
  expect(await pulses(), "selecting the option already selected changes nothing").toEqual([]);
  // A drag across three positions ticks once per position passed, not per frame.
  const f = await dial(page, "filter");
  await drag(page, [f.cx, f.cy], 160, { steps: 40 });
  expect(await value(page, "filter")).toBe("lp");
  const dragged = await pulses();
  expect(dragged.length, "one tick per option passed").toBe(3);
  expect(dragged.every(pulse => pulse === 5)).toBe(true);
  // A change by script, after the visitor's last gesture is over, is not the visitor's own: no pulse.
  await page.waitForTimeout(1100);
  await page.evaluate(() => { const select = document.getElementById("filter"); select.selectedIndex = 3; select.dispatchEvent(new Event("input", { bubbles: true })); select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(await pulses()).toEqual([]);
  expect(await mode(page)).toBe("gpu");
  await context.close();
});
