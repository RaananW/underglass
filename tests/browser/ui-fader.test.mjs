/**
 * Browser suite for the Strata Fader (anatomy page `fader.md`) on `ui-fader.html` (`window.strataFaderProbe`): plain
 * contract markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real input: a drag of the drawn carriage (the native thumb) moves the value one to one with
 *   the carriage under the pointer; clicks on the slot and on printed numerals set their values, also on the thumb's
 *   margin round the carriage; a tap near a numeral snaps to it; a tap on the carriage changes nothing; the wheel steps
 *   without scrolling the page; native keys; the double-click reset; `aria-valuetext` with units; detents snap;
 *   `input` and `change` fire; the horizontal fader likewise.
 * - Touch (Playwright touch emulation, 390 px): taps on numerals and touch drags of the carriage, as pointer events of
 *   type touch, and the page does not scroll.
 * - Mobile and text size: at 320 and 390 px no horizontal overflow, targets of at least 24 px, print inside the
 *   viewport and unclipped; at 200% text the numerals stay apart and inside the track.
 * - Preferences and accessibility: axe in light and dark (and face mode), forced colours draw a visible control,
 *   reduced motion moves a detented carriage at once.
 * - GPU at Relief and Objects: GPU stays on through value changes; the slot is a groove and the carriage a raised face
 *   or a slab; pixels change after each value change and only inside the track; the carriage and its shadow stay
 *   inside the track at both stops and mid-travel; a grid of native hits over the track lands on the input (0
 *   mismatches) at DPR 1 and 2; the accessibility snapshot is the same in DOM and GPU modes.
 * Screenshots go to the `ui-fader` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-fader");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);

const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
/** The centre of a fader's printed numeral, by its text. */
async function numeral(page, id, text) {
  return centre(await page.locator(`#${id}-fader .ug-fader__mark`).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
}
/** The track's box, the slot's centre line and the carriage's centre. */
async function geometry(page, id) {
  const [track, slot, carriage] = await Promise.all(["track", "slot", "carriage"].map(part => page.locator(`#${id}-fader .ug-fader__${part}`).boundingBox()));
  return { track, slot: centre(slot), carriage: centre(carriage), slotBox: slot };
}
/** The carriage centre's place (client px along the travel) for `fraction` of a fader's range, from its slot. */
const place = (slot, fraction, vertical = true) => vertical ? slot.y + 3 + (1 - fraction) * (slot.height - 6) : slot.x + 3 + fraction * (slot.width - 6);
async function drag(page, [x, y], [dx, dy], { steps = 10 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
}
const events = page => page.evaluate(() => window.strataFaderProbe.events());
const clear = page => page.evaluate(() => window.strataFaderProbe.clearEvents());

test("a fader behaves in plain DOM: the carriage drags with the native thumb, clicks set, the wheel, keys, reset and its value text", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-fader.html?plain");
  await page.waitForFunction(() => window.strataFaderProbe);
  const level = page.locator("#level"), pan = page.locator("#pan"), send = page.locator("#send");
  await expect(level).toHaveAccessibleName("Level");
  await expect(level).toHaveAttribute("aria-valuetext", "0 dB");
  await expect(level).toHaveAttribute("aria-orientation", "vertical");
  await expect(pan).not.toHaveAttribute("aria-orientation");
  expect(await level.evaluate(input => getComputedStyle(input).writingMode)).toBe("vertical-lr");

  // A real drag of the drawn carriage is a drag of the native thumb: 60 px down is 60 / 180 of the range (−22 dB), and
  // the carriage stays under the pointer the whole way. Input fires while it moves, change once at the end.
  let g = await geometry(page, "level");
  await clear(page);
  await page.mouse.move(...g.carriage);
  await page.mouse.down();
  await page.mouse.move(g.carriage[0], g.carriage[1] + 30, { steps: 6 });
  const midway = (await geometry(page, "level")).carriage;
  expect(Math.abs(midway[1] - (g.carriage[1] + 30)), "the carriage under the pointer mid-drag").toBeLessThanOrEqual(1.5);
  await page.mouse.move(g.carriage[0], g.carriage[1] + 60, { steps: 6 });
  await page.mouse.up();
  expect(await value(page, "level")).toBe(-22);
  const after = (await geometry(page, "level")).carriage;
  expect(Math.abs(after[1] - (g.carriage[1] + 60)), "the carriage under the pointer at the end").toBeLessThanOrEqual(1.5);
  const dragged = await events(page);
  expect(dragged.filter(event => event.type === "input").length).toBeGreaterThan(3);
  expect(dragged.filter(event => event.type === "change")).toEqual([{ id: "level", type: "change", value: "-22" }]);
  await expect(level).toHaveAttribute("aria-valuetext", "−22 dB");
  console.log(`drag 60 px down: 0 → ${await value(page, "level")} dB, carriage ${(after[1] - g.carriage[1]).toFixed(2)} px down, ${dragged.length} events`);
  // Past the stop it clamps.
  g = await geometry(page, "level");
  await drag(page, g.carriage, [0, -300]);
  expect(await value(page, "level"), "a drag clamps at the maximum").toBe(6);

  // Clicks on printed numerals set exactly their values: far from the carriage the native track click, near it (on the
  // thumb's margin, where the browser starts a drag) the behaviour on release.
  for (const [text, expected] of [["−30", -30], ["−50", -50], ["−40", -40], ["6", 6], ["0", 0], ["−60", -60], ["−10", -10]]) {
    await page.mouse.click(...await numeral(page, "level", text));
    expect(await value(page, "level"), `click on "${text}"`).toBe(expected);
  }
  await expect(level).toBeFocused();
  for (const [text, expected] of [["7.5", 7.5], ["2.5", 2.5], ["10", 10], ["0", 0]]) {
    await page.mouse.click(...await numeral(page, "send", text));
    expect(await value(page, "send"), `click on "${text}"`).toBe(expected);
  }
  for (const [text, expected] of [["L", -50], ["R", 50], ["C", 0], ["25", 25]]) {
    await page.mouse.click(...await numeral(page, "pan", text));
    expect(await value(page, "pan"), `click on "${text}"`).toBe(expected);
  }
  // A click on the slot sets the value under the carriage's centre; on the thumb's margin too; on the carriage, nothing.
  g = await geometry(page, "level");
  await page.mouse.click(g.slot[0], place(g.slotBox, 0.5));
  expect(await value(page, "level")).toBe(-27);
  g = await geometry(page, "level");
  await page.mouse.click(g.slot[0], g.carriage[1] - 30);
  expect(await value(page, "level"), "a click on the thumb's margin above the carriage").toBe(-16);
  g = await geometry(page, "level");
  await page.mouse.click(g.carriage[0] + 6, g.carriage[1] + 4);
  expect(await value(page, "level"), "a click on the carriage").toBe(-16);
  // A tap within fader.snap (2 px) of a numeral sets it exactly; further off, the place decides.
  await page.mouse.click(...await numeral(page, "pan", "R"));
  await clear(page);
  const [cx, cy] = await numeral(page, "pan", "C");
  await page.mouse.click(cx + 1.6, cy);
  expect(await value(page, "pan"), "a tap 1.6 px off C").toBe(0);
  expect((await events(page)).filter(event => event.type === "change").at(-1)).toEqual({ id: "pan", type: "change", value: "0" });
  await page.mouse.click(cx + 4, cy);
  expect(await value(page, "pan"), "a tap 4 px off C").toBe(2);

  // The wheel: a notch up raises by a notch, and the page does not scroll; elsewhere it scrolls as usual.
  g = await geometry(page, "level");
  await page.mouse.move(...g.slot);
  await page.mouse.wheel(0, -100);
  expect(await value(page, "level")).toBe(-15);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "level")).toBe(-17);
  const p = await geometry(page, "pan");
  await page.mouse.move(p.track.x + 10, p.track.y + p.track.height - 4);
  await page.mouse.wheel(0, -100);
  expect(await value(page, "pan")).toBe(3);
  expect(await page.evaluate(() => window.scrollY), "the page does not scroll over a fader").toBe(0);
  await page.mouse.move(600, 20);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Keys are native, in either orientation: up and right raise, down and left lower, Home, End and the Page keys.
  await level.focus();
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "level")).toBe(-16);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  expect(await value(page, "level")).toBe(-17);
  await page.keyboard.press("End");
  expect(await value(page, "level")).toBe(6);
  await page.keyboard.press("PageDown");
  expect(await value(page, "level")).toBeLessThan(6);
  await page.keyboard.press("Home");
  expect(await value(page, "level")).toBe(-60);
  await pan.focus();
  await page.keyboard.press("ArrowLeft");
  expect(await value(page, "pan")).toBe(2);

  // The carriage follows the value: its centre at the value's place along the slot.
  await page.keyboard.press("Home");
  for (const key of ["End", "Home"]) {
    await level.focus();
    await page.keyboard.press(key);
    g = await geometry(page, "level");
    const fraction = key === "End" ? 1 : 0;
    expect(Math.abs(g.carriage[1] - place(g.slotBox, fraction)), `${key}: the carriage at its stop`).toBeLessThanOrEqual(0.5);
    expect(g.carriage[1] - g.track.y, `${key}: 37 px from the top at the maximum, 37 + 180 at the minimum`).toBeCloseTo(37 + (1 - fraction) * 180, 0);
  }

  // Double-click returns to the default; the value text and the carriage follow.
  await page.mouse.dblclick(...await numeral(page, "level", "−40"));
  expect(await value(page, "level")).toBe(0);
  await expect(level).toHaveAttribute("aria-valuetext", "0 dB");
  expect(await page.locator("#level-fader").evaluate(element => element.style.getPropertyValue("--strata-fader-value"))).toBe("0.9091");
  const ps = await geometry(page, "pan");
  await page.mouse.dblclick(ps.track.x + 20, ps.slot[1]);
  expect(await value(page, "pan")).toBe(0);

  // A detented fader snaps to its detents while dragged (only multiples of 2.5 appear) and settles over motion.fast.
  await page.mouse.click(...await numeral(page, "send", "0"));
  await clear(page);
  const s = await geometry(page, "send");
  await drag(page, s.carriage, [0, -100], { steps: 25 });
  expect(await value(page, "send")).toBe(5);
  expect(new Set((await events(page)).filter(event => event.id === "send").map(event => event.value))).toEqual(new Set(["2.5", "5"]));
  expect(await page.locator("#send-fader .ug-fader__carriage").evaluate(element => getComputedStyle(element).transitionDuration.split(", ")[0])).toBe("0.12s");
  await expect(page.locator("#fader-read")).toHaveText("Level 0 dB, send 5, pan 0");
  // Disabled: no pointer behaviour.
  await page.evaluate(() => { document.getElementById("send").disabled = true; });
  await page.mouse.click(...await numeral(page, "send", "10"));
  expect(await value(page, "send")).toBe(5);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: taps on numerals set them and touch drags move the carriage, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-fader.html?plain");
  await page.waitForFunction(() => window.strataFaderProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  for (const [text, expected] of [["−30", -30], ["−50", -50], ["0", 0], ["−60", -60]]) {
    await page.touchscreen.tap(...await numeral(page, "level", text));
    expect(await value(page, "level"), `tap on "${text}"`).toBe(expected);
  }
  // A touch drag of the carriage 44 px up: +16 dB, the carriage under the finger, and the page does not scroll
  // (the input is touch-action: pan-x).
  const client = await context.newCDPSession(page);
  const touch = async (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const g = await geometry(page, "level");
  await touch("touchStart", [{ x: g.carriage[0], y: g.carriage[1] }]);
  for (let step = 1; step <= 11; step++) await touch("touchMove", [{ x: g.carriage[0], y: g.carriage[1] - step * 4 }]);
  await touch("touchEnd", []);
  expect(await value(page, "level")).toBe(-44);
  expect(Math.abs((await geometry(page, "level")).carriage[1] - (g.carriage[1] - 44))).toBeLessThanOrEqual(1.5);
  // The horizontal fader: a tap on L, then a touch drag 54 px right is +30 (touch-action: pan-y).
  await page.touchscreen.tap(...await numeral(page, "pan", "L"));
  expect(await value(page, "pan")).toBe(-50);
  const p = await geometry(page, "pan");
  await touch("touchStart", [{ x: p.carriage[0], y: p.carriage[1] }]);
  for (let step = 1; step <= 9; step++) await touch("touchMove", [{ x: p.carriage[0] + step * 6, y: p.carriage[1] }]);
  await touch("touchEnd", []);
  expect(await value(page, "pan")).toBe(-20);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  console.log(`touch at 390 px: level −60 → ${await value(page, "level")} dB after 44 px up, pan −50 → ${await value(page, "pan")} after 54 px right`);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the faders reflow with no horizontal overflow, 24 px targets and readable print`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-fader.html?plain");
  await page.waitForFunction(() => window.strataFaderProbe);
  const layout = await page.evaluate(() => {
    const boxes = selector => [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height }; });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      targets: boxes(".ug-fader__input, .ug-fader__carriage"),
      print: boxes(".ug-fader__label, .ug-fader__mark"),
      clipped: [...document.querySelectorAll(".ug-fader__label")].filter(label => label.scrollWidth > label.clientWidth + 0.5).length,
    };
  });
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const target of layout.targets) expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24);
  for (const box of layout.print) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  expect(layout.clipped).toBe(0);
  // The horizontal fader still works at this width: a click on R sets its maximum.
  await page.mouse.click(...await numeral(page, "pan", "R"));
  expect(await value(page, "pan")).toBe(50);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest target ${Math.min(...layout.targets.map(target => Math.min(target.width, target.height)))} px`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the numerals stay apart and inside the track, and the legend wraps without loss", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-fader.html?plain");
  await page.waitForFunction(() => window.strataFaderProbe);
  const check = () => page.evaluate(() => [...document.querySelectorAll(".ug-fader")].map(fader => {
    const track = fader.querySelector(".ug-fader__track").getBoundingClientRect();
    const marks = [...fader.querySelectorAll(".ug-fader__mark")].map(mark => {
      const range = document.createRange(); range.selectNodeContents(mark); return range.getBoundingClientRect();
    });
    const overlaps = marks.flatMap((a, i) => marks.slice(i + 1).filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)).length;
    const outside = marks.filter(box => box.left < track.left || box.right > track.right || box.top < track.top || box.bottom > track.bottom).length;
    return { id: fader.id, overlaps, outside, track: [Math.round(track.width), Math.round(track.height)], scrollWidth: document.documentElement.scrollWidth };
  }));
  for (const fader of await check()) expect(fader, fader.id).toMatchObject({ overlaps: 0, outside: 0 });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const large = await check();
  for (const fader of large) expect(fader, fader.id).toMatchObject({ overlaps: 0, outside: 0 });
  expect(large[0].scrollWidth).toBeLessThanOrEqual(320);
  console.log(`200% text: tracks ${large.map(fader => fader.track.join(" × ")).join(", ")} px`);
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the fader passes axe in light and dark, draws a visible control under forced colours, and settles at once under reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.goto("/ui-fader.html?plain");
  await page.waitForFunction(() => window.strataFaderProbe);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#fader-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#fader-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#fader-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  // The grip keeps 3:1 against the carriage, measured on the computed colours.
  const ratio = await page.locator("#level-fader").evaluate(fader => {
    const rgb = value => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(c => c / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const luminance = value => { const [r, g, b] = rgb(value); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const grip = luminance(getComputedStyle(fader.querySelector(".ug-fader__grip")).backgroundColor), cap = luminance(getComputedStyle(fader.querySelector(".ug-fader__carriage")).backgroundColor);
    return (Math.max(grip, cap) + 0.05) / (Math.min(grip, cap) + 0.05);
  });
  expect(ratio, "grip against carriage").toBeGreaterThanOrEqual(3);

  await page.emulateMedia({ forcedColors: "active" });
  const forced = await new AxeBuilder({ page }).include("#fader-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe under forced colours").toEqual([]);
  const styles = await page.locator("#level-fader").evaluate(fader => {
    const style = selector => getComputedStyle(fader.querySelector(selector));
    return { carriage: [style(".ug-fader__carriage").borderTopStyle, style(".ug-fader__carriage").borderTopWidth], slot: style(".ug-fader__slot").backgroundColor,
      grip: style(".ug-fader__grip").backgroundColor, canvas: style(".ug-fader__carriage").backgroundColor };
  });
  expect(styles.carriage).toEqual(["solid", "1px"]);
  expect(styles.grip).not.toBe(styles.canvas);
  expect(styles.slot).toBe(styles.grip);
  // Decoded pixels: the track shows the slot, the carriage's border and grip and the scale in CanvasText on Canvas.
  const png = PNG.sync.read(await page.locator("#level-fader .ug-fader__track").screenshot({ path: `${evidence}/forced-colors.png` }));
  const luma = index => 0.2126 * png.data[index] + 0.7152 * png.data[index + 1] + 0.0722 * png.data[index + 2];
  let dark = 0, light = 0;
  for (let index = 0; index < png.data.length; index += 4) { if (luma(index) < 60) dark++; else if (luma(index) > 200) light++; }
  expect(dark, "CanvasText ink in the track").toBeGreaterThan(600);
  expect(light).toBeGreaterThan(10000);
  // Focus shows as a ring round the track.
  await page.locator("#level").focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator("#level").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
  expect(await page.locator("#send-fader .ug-fader__carriage").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  await context.close();
});

// ---- GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-fader.html${query}`);
  await page.waitForFunction(() => window.strataFaderProbe && window.strataFaderProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataFaderProbe.scene() !== undefined);
  await page.evaluate(() => window.strataFaderProbe.controller.settle());
}
const mode = page => page.evaluate(() => window.strataFaderProbe.controller.state().mode);
/** The `#frame` decoded, after the scene and the GPU have caught up; `at(x, y)` in frame CSS px. */
async function frame(page, name) {
  await page.mouse.move(2, 2);
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    window.strataFaderProbe.refresh(); await window.strataFaderProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataFaderProbe.controller.settle();
  });
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
/** elementFromPoint over a grid on the track (inset 0.5 px): every hit must be the input. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const input = document.getElementById(id), box = input.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== input) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);
const ids = ["level", "send", "pan"];

for (const level of ["relief", "objects"]) test(`on the GPU at the ${level} level the fader stays presented, its pixels are fresh and contained, and native hits land on it`, async ({ page }) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  const kinds = await page.evaluate(() => {
    const probe = window.strataFaderProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
    const entry = selector => { const box = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (box.left - panel.left)) < 0.5 && Math.abs(p.rect[1] - (box.top - panel.top)) < 0.5 && Math.abs(p.rect[2] - box.width) < 0.5 && Math.abs(p.rect[3] - box.height) < 0.5) ?? null; };
    return { version: scene.version, material: probe.controller.state().materials[0]?.kind, slot: entry("#level-fader .ug-fader__slot"), carriage: entry("#level-fader .ug-fader__carriage"),
      panSlot: entry("#pan-fader .ug-fader__slot"), input: entry("#level"), count: scene.primitives.length };
  });
  if (level === "relief") {
    expect(kinds).toMatchObject({ version: 1, material: "relief", slot: { face: "groove", rect: [expect.any(Number), expect.any(Number), 5, 186] }, carriage: { face: "raised", material: "satin", radius: 3 },
      panSlot: { face: "groove", rect: [expect.any(Number), expect.any(Number), 186, 5] }, input: null, count: 8 });
  } else {
    expect(kinds).toMatchObject({ version: 2, material: "objects", slot: { face: "groove" }, carriage: { object: "slab", material: "satin" }, panSlot: { face: "groove" }, input: null, count: 8 });
  }
  // Native hits: a grid over each track lands on its input, and the legend on its label.
  for (const id of ids) {
    const result = await hits(page, id);
    expect(result.misses, `${id}: hits over the track`).toEqual([]);
    console.log(`${level}: ${id} ${result.total} hits, ${result.misses.length} mismatches`);
  }
  expect(await page.evaluate(() => { const label = document.querySelector("#level-fader .ug-fader__label").getBoundingClientRect();
    return document.elementFromPoint(label.left + label.width / 2, label.top + label.height / 2)?.className; })).toBe("ug-fader__label");

  // Fresh pixels after each value change, all of them inside the faders' tracks and their focus rings (the ring round
  // the track moves with focus), or the readout, which prints the value.
  const tracks = await Promise.all(ids.map(id => inFrame(page, `#${id}-fader .ug-fader__track`)));
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return Number.parseFloat(style.getPropertyValue("--strata-focus-width")) + Number.parseFloat(style.getPropertyValue("--strata-focus-offset")) + 2; });
  const allowed = [...tracks.map(box => ({ x: box.x - ring, y: box.y - ring, width: box.width + 2 * ring, height: box.height + 2 * ring })), await inFrame(page, "#fader-read")];
  let before = await frame(page, `${level}-0`);
  const steps = [
    ["drag the carriage 60 px down", "level", async () => { const g = await geometry(page, "level"); await drag(page, g.carriage, [0, 60]); }, -22],
    ["click on −50", "level", async () => page.mouse.click(...await numeral(page, "level", "−50")), -50],
    ["click on the thumb's margin", "level", async () => { const g = await geometry(page, "level"); await page.mouse.click(g.slot[0], g.carriage[1] - 30); }, -39],
    ["End key", "level", async () => { await page.locator("#level").focus(); await page.keyboard.press("End"); }, 6],
    ["wheel notch", "level", async () => { const g = await geometry(page, "level"); await page.mouse.move(...g.slot); await page.mouse.wheel(0, 100); }, 5],
    ["double-click reset", "level", async () => { await page.mouse.dblclick(...await numeral(page, "level", "−30")); }, 0],
    ["click on L", "pan", async () => page.mouse.click(...await numeral(page, "pan", "L")), -50],
    ["drag the pan carriage 90 px right", "pan", async () => { const g = await geometry(page, "pan"); await drag(page, g.carriage, [90, 0]); }, 0],
    ["click on 10 (detented)", "send", async () => page.mouse.click(...await numeral(page, "send", "10")), 10],
  ];
  for (const [name, id, act, expected] of steps) {
    await act();
    expect(await value(page, id), name).toBe(expected);
    expect(await mode(page), `${name}: GPU stays on`).toBe("gpu");
    const after = await frame(page, `${level}-${id}-${expected}`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${name}: pixels change in the track`).toBeGreaterThan(200);
    expect(changed.outside, `${name}: no pixel changes outside the track (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`${level}: ${name} → ${expected}: ${changed.inside} px changed in the tracks, ${changed.outside} outside`);
    before = after;
  }

  // Containment over the whole travel: at both stops and mid-travel, every pixel the carriages draw (their faces and
  // shadows, against the carriages hidden) lies inside their tracks.
  for (const [stop, key] of [["minimum", "Home"], ["maximum", "End"], ["middle", null]]) {
    for (const id of ids) {
      const input = page.locator(`#${id}`);
      if (key) { await input.focus(); await page.keyboard.press(key); }
      else await input.evaluate(element => { element.value = String((Number(element.min) + Number(element.max)) / 2); element.dispatchEvent(new Event("input", { bubbles: true })); });
    }
    const on = await frame(page, `${level}-${stop}-on`);
    await page.evaluate(() => { for (const carriage of document.querySelectorAll(".ug-fader__carriage")) carriage.style.visibility = "hidden"; });
    const off = await frame(page, `${level}-${stop}-off`);
    await page.evaluate(() => { for (const carriage of document.querySelectorAll(".ug-fader__carriage")) carriage.style.visibility = ""; });
    const drawn = difference(on, off, tracks);
    expect(drawn.inside, `${stop}: the carriages are drawn`).toBeGreaterThan(3000);
    expect(drawn.outside, `${stop}: no carriage pixel outside a track (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
    console.log(`${level}: carriages at the ${stop}: ${drawn.inside} px inside the tracks, ${drawn.outside} outside`);
  }
  await frame(page, `${level}-back`);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  expect(await mode(page)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("native hits over the track land on the input at DPR 2 on the GPU, at both levels", async ({ browser }) => {
  for (const query of ["", "?level=objects"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await ready(page, query);
    for (const id of ids) {
      const result = await hits(page, id, 21);
      expect(result.misses, `${query || "relief"}, DPR 2: ${id}`).toEqual([]);
      console.log(`DPR 2 ${query || "relief"}: ${id} ${result.total} hits, ${result.misses.length} mismatches`);
    }
    // A real drag of the carriage at DPR 2.
    const g = await geometry(page, "level");
    await drag(page, g.carriage, [0, 60]);
    expect(await value(page, "level")).toBe(-22);
    expect(await mode(page)).toBe("gpu");
    await context.close();
  }
});

test("the accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page", async ({ page }) => {
  await page.goto("/ui-fader.html?dom");
  await page.waitForFunction(() => window.strataFaderProbe);
  await page.evaluate(() => window.strataFaderProbe.controller.settle?.());
  const act = async () => { await page.locator("#level").focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.locator("#pan").focus(); await page.keyboard.press("ArrowLeft"); };
  await act();
  const dom = await page.locator("#fader-panel").ariaSnapshot();
  await ready(page);
  await act();
  const gpu = await page.locator("#fader-panel").ariaSnapshot();
  expect(gpu).toBe(dom);
  expect(gpu).toContain('slider "Level"');
  expect(await mode(page)).toBe("gpu");
  const { violations } = await new AxeBuilder({ page }).include("#fader-panel").withTags(tags).analyze();
  expect(summary(violations), "axe on the GPU page").toEqual([]);
});
