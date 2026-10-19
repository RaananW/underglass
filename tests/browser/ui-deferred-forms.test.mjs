/**
 * Browser suite for the three deferred hardware forms on `ui-deferred-forms.html` (`window.strataDeferredProbe`): the Slider's `wheel` (`slider.md` section 11), the
 * RadioGroup's `selector` (`radio.md` section 11) and the Display's `segments` (`display.md` section 11), in plain contract markup with `@underglass/ui/css` and the
 * plain-DOM behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real input: a wheel takes keys, a drag along its slot, a click on the slot and on a printed mark, the mouse wheel and the double-click reset,
 *   with its roller staying where it is; a selector's radios take label clicks and arrows, its dial a tap and the mouse wheel, each ending in native `input` and
 *   `change`; the segments displays print the digits in the Strata Segments face with the ghost segments behind them, and the text stays the native element's own.
 * - Native semantics: the roles, names and values are the controls of before, the accessibility snapshot is the same in DOM and GPU modes, axe is clean in light, dark,
 *   face mode and more contrast; the flush controls (`?flush`) are the markup of before.
 * - Touch (390 and 320 px), 200% text, forced colours, more contrast, reduced motion: no overflow, targets of at least 24 px, the printed positions apart.
 * - GPU at Relief and Objects: GPU stays on; fresh pixels only in the control's box; native hits land on the control (0 mismatches) at DPR 1 and 2.
 * - GPU at the Instrument level (DPR 1 and 2): the rollers and the dials are parts; at 0, 25, 50, 75 and 100% no part pixel lies outside the input's box and native hits on
 *   part pixels land on the control; a change changes pixels in the box only; a wheel turn and a selector snap add no capture and no hit-geometry update in their turning
 *   frames; GPU stays on and nothing steps down; the digits under the glass are the capture itself, with the ghost segments.
 * Screenshots go to the `ui-deferred-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-deferred-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const checked = (page, id) => page.locator(`#${id}-group .ug-rotary__radio`).evaluateAll(radios => radios.find(radio => radio.checked)?.value ?? null);
const label = async (page, id, text) => centre(await page.locator(`#${id}-group .ug-rotary__text`).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
const events = page => page.evaluate(() => window.strataDeferredProbe.events());
const clear = page => page.evaluate(() => window.strataDeferredProbe.clearEvents());
const wheels = ["gain", "pan", "locked"], dials = ["mode", "lockedradio"];
/** The slot's box and the roller's. */
const geometry = async (page, id) => {
  const [slot, roller, track] = await Promise.all(["slot", "wheel", "track"].map(part => page.locator(`.ug-fader:has(#${id}) .ug-fader__${part}`).boundingBox()));
  return { slot, roller, track };
};
async function drag(page, [x, y], [dx, dy], { steps = 10 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps });
  await page.mouse.up();
}

// ---- Plain DOM ----

test("a wheel behaves in plain DOM: the roller stays put while keys, a drag along the slot, clicks on the slot and the marks, the mouse wheel and the reset move the value", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  const gain = page.locator("#gain"), pan = page.locator("#pan");
  await expect(gain).toHaveRole("slider");
  await expect(gain).toHaveAccessibleName("Gain");
  await expect(page.locator("#locked")).toBeDisabled();
  expect(await gain.evaluate(input => [input.type, input.min, input.max, input.step, input.value])).toEqual(["range", "0", "100", "1", "40"]);
  const g0 = await geometry(page, "gain");
  // The slot is the travel (72 px at medium) plus 3 px at each end; the roller is 16 by 26 and stands at the middle of the track.
  expect(g0.slot.width).toBe(78);
  expect([g0.roller.width, g0.roller.height]).toEqual([16, 26]);
  expect(Math.abs(g0.roller.x + g0.roller.width / 2 - (g0.track.x + g0.track.width / 2))).toBeLessThanOrEqual(0.5);
  // Keys are native.
  await gain.focus();
  await clear(page);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("PageUp");
  expect(await value(page, "gain")).toBe(51);
  await page.keyboard.press("Home");
  expect(await value(page, "gain")).toBe(0);
  await page.keyboard.press("End");
  expect(await value(page, "gain")).toBe(100);
  const keyEvents = await events(page);
  expect(keyEvents.filter(event => event.type === "change").length).toBe(4);
  // A click on the slot sets the value under the pointer (slot's centre line is half way); the roller stays put.
  let g = await geometry(page, "gain");
  await page.mouse.click(g.slot.x + 3 + 72 * 0.25, g.slot.y + g.slot.height / 2);
  expect(Math.abs(await value(page, "gain") - 25)).toBeLessThanOrEqual(2);
  g = await geometry(page, "gain");
  expect([g.roller.x, g.roller.y]).toEqual([g0.roller.x, g0.roller.y]);
  // A tap on the roller itself sets the value like a tap on the slot (it does not stand where the value is).
  await page.mouse.click(...centre(g.roller));
  expect(Math.abs(await value(page, "gain") - 50)).toBeLessThanOrEqual(2);
  // A click on a printed mark sets exactly its value (within fader.snap).
  const mark = await page.locator(".ug-fader:has(#pan) .ug-fader__mark").filter({ hasText: /^75$/ }).boundingBox();
  await page.mouse.click(...centre(mark));
  expect(await value(page, "pan")).toBe(75);
  // A drag along the slot moves the value one to one with the pointer; clamped past the stop.
  g = await geometry(page, "pan");
  await clear(page);
  await drag(page, [g.slot.x + 3 + 72 * 0.5, g.slot.y + 2], [-72 * 0.3, 0]);
  const dragged = await value(page, "pan");
  expect(dragged).toBeGreaterThanOrEqual(18);
  expect(dragged).toBeLessThanOrEqual(32);
  const dragEvents = await events(page);
  expect(dragEvents.filter(event => event.type === "input").length).toBeGreaterThan(3);
  expect(dragEvents.filter(event => event.type === "change").length).toBeGreaterThanOrEqual(1);
  await drag(page, [g.slot.x + 40, g.slot.y + 2], [200, 0]);
  expect(await value(page, "pan")).toBe(100);
  // The mouse wheel over the wheel steps a notch and the page does not scroll.
  g = await geometry(page, "pan");
  await page.mouse.move(...centre(g.roller));
  await page.mouse.wheel(0, -100);
  expect(await value(page, "pan")).toBe(100);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "pan")).toBe(98);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  // The double-click returns to the default.
  await page.mouse.dblclick(g.slot.x + 6, g.slot.y + g.slot.height / 2);
  expect(await value(page, "pan")).toBe(75);
  // The roller's print follows the value without moving the roller: the ridges' offset is the surface moving (radius times the angle), the index mark moves with it.
  const prints = [];
  for (const target of [0, 100]) {
    await pan.evaluate((input, v) => { input.value = String(v); input.dispatchEvent(new Event("input", { bubbles: true })); }, target);
    prints.push(await page.locator(".ug-fader:has(#pan) .ug-fader__ridges").evaluate(ridges => {
      const style = getComputedStyle(ridges), after = getComputedStyle(ridges, "::after");
      return { position: style.backgroundPositionX, index: after.left };
    }));
  }
  expect(prints[0].position).not.toBe(prints[1].position);
  // roll = sweep (150) in radians times the radius (8): 20.9 px from the minimum to the maximum.
  expect(Math.abs(Number.parseFloat(prints[0].position) - Number.parseFloat(prints[1].position))).toBeCloseTo((150 * Math.PI) / 180 * 8, 0);
  expect(Number.parseFloat(prints[1].index) - Number.parseFloat(prints[0].index)).toBeGreaterThan(10);
  console.log(`wheel print: ridges offset ${prints[0].position} → ${prints[1].position}, index ${prints[0].index} → ${prints[1].index}`);
  expect(errors).toEqual([]);
  await context.close();
});

test("a selector behaves in plain DOM: labels and arrows check their radios, the dial takes a tap, a ring click and the mouse wheel, every change is native, and the cap follows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  const cap = () => page.locator("#mode-group .ug-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"));
  const group = page.getByRole("group", { name: "Mode", exact: true });
  await expect(group).toBeVisible();
  expect(await page.locator("#mode-group .ug-rotary__radio").evaluateAll(radios => radios.map(radio => [radio.type, radio.name, radio.labels[0].textContent.trim()]))).toEqual([["radio", "mode", "Mix"], ["radio", "mode", "Solo"], ["radio", "mode", "Mute"], ["radio", "mode", "Bypass"]]);
  expect(await checked(page, "mode")).toBe("solo");
  expect(await cap()).toBe("0.3333");
  // Each radio is an invisible overlay of at least 24 px on its print.
  const targets = await page.locator("#mode-group .ug-rotary__radio").evaluateAll(radios => radios.map(radio => { const box = radio.getBoundingClientRect(); return [Math.round(box.width), Math.round(box.height), getComputedStyle(radio).opacity]; }));
  for (const [width, height, opacity] of targets) { expect(width).toBeGreaterThanOrEqual(24); expect(height).toBeGreaterThanOrEqual(24); expect(opacity).toBe("0"); }
  // A click on a printed position is a click on its radio: native input and change, once.
  await clear(page);
  await page.mouse.click(...await label(page, "mode", "Bypass"));
  expect(await checked(page, "mode")).toBe("bypass");
  expect(await events(page)).toEqual([{ id: "mode", type: "input", value: "bypass" }, { id: "mode", type: "change", value: "bypass" }]);
  expect(await cap()).toBe("1");
  await expect(page.locator("#def-read")).toHaveText("mode is bypass");
  // The arrows are the group's: they move and check, wrapping.
  await page.getByRole("radio", { name: "Bypass" }).first().focus();
  await page.keyboard.press("ArrowRight");
  expect(await checked(page, "mode")).toBe("mix");
  await page.keyboard.press("ArrowLeft");
  expect(await checked(page, "mode")).toBe("bypass");
  await page.keyboard.press("ArrowUp");
  expect(await checked(page, "mode")).toBe("mute");
  // The dial's cap: a tap on its upper half steps forward, on its lower half back; the ends clamp.
  let box = await page.locator("#mode-group .ug-rotary__cap").boundingBox();
  await clear(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2);
  expect(await checked(page, "mode")).toBe("bypass");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2);
  expect(await checked(page, "mode"), "clamped at the last position").toBe("bypass");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.8);
  expect(await checked(page, "mode")).toBe("mute");
  expect((await events(page)).filter(event => event.type === "change").map(event => event.value)).toEqual(["bypass", "mute"]);
  // A click on the ring where no label is checks the radio at that angle (0° at the top, clockwise): straight up is between Solo and Mute, the right is Bypass's side.
  box = await page.locator("#mode-group .ug-rotary__dial").boundingBox();
  const skirt = await page.locator("#mode-group .ug-rotary__skirt").boundingBox(), c = centre(skirt), r = skirt.width / 2 + 7;
  await page.mouse.click(c[0] + r * Math.sin((120 * Math.PI) / 180), c[1] - r * Math.cos((120 * Math.PI) / 180));
  expect(await checked(page, "mode")).toBe("bypass");
  await page.mouse.click(c[0] + r * Math.sin((-130 * Math.PI) / 180), c[1] - r * Math.cos((-130 * Math.PI) / 180));
  expect(await checked(page, "mode")).toBe("mix");
  // The mouse wheel over the dial steps one radio, and the page does not scroll.
  await page.mouse.move(...c);
  await page.mouse.wheel(0, -100);
  expect(await checked(page, "mode")).toBe("solo");
  await page.mouse.wheel(0, 100);
  expect(await checked(page, "mode")).toBe("mix");
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  // A disabled selector does not move; nine radios asked as a selector are a bank (the rule); the flush group is the radios of before.
  const before = await checked(page, "lockedradio");
  const lockedCap = await page.locator("#lockedradio-group .ug-rotary__cap").boundingBox();
  await page.mouse.click(lockedCap.x + lockedCap.width / 2, lockedCap.y + lockedCap.height * 0.2);
  await page.mouse.move(...centre(lockedCap));
  await page.mouse.wheel(0, -100);
  expect(await checked(page, "lockedradio")).toBe(before);
  expect(await page.evaluate(() => ["mode", "route", "flatradio", "lockedradio"].map(id => document.getElementById(`${id}-group`).dataset.strataForm ?? null))).toEqual(["selector", "bank", null, "selector"]);
  // Feedback: a haptic pulse per changed position once it is on, never by default.
  await page.evaluate(() => { window.pulses = []; Object.defineProperty(navigator, "vibrate", { configurable: true, value: pattern => { window.pulses.push(pattern); return true; } }); });
  await page.getByRole("radio", { name: "Mix" }).first().focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.pulses)).toEqual([]);
  await page.evaluate(() => window.strataDeferredProbe.feedback({ haptics: true }));
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.pulses.splice(0))).toEqual([5]);
  expect(errors).toEqual([]);
  await context.close();
});

test("the segments displays print the digits in the Strata Segments face with the unlit segments behind them, and the text stays the native element's own", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  await page.evaluate(() => document.fonts.load('16px "Strata Segments"'));
  const info = await page.evaluate(() => Object.fromEntries(["clock", "readout", "freq", "plainout"].map(id => {
    const text = document.getElementById(id), root = text.closest(".ug-display"), window_ = root.querySelector(".ug-display__window");
    const ghost = getComputedStyle(window_, "::before");
    return [id, { family: getComputedStyle(text).fontFamily.split(",")[0], segments: root.dataset.strataSegments ?? null, size: getComputedStyle(text).fontSize, spacing: getComputedStyle(text).letterSpacing,
      ghostOpacity: ghost.opacity, ghostMask: (ghost.maskImage || ghost.webkitMaskImage || "").slice(0, 40), ghostContent: ghost.content, value: text.value ?? text.textContent }];
  })));
  console.log(`segments: ${JSON.stringify(info)}`);
  for (const id of ["clock", "readout", "freq"]) {
    expect(info[id].family, id).toBe("Strata Segments");
    expect(info[id].segments).toBe("seven");
    expect(Number(info[id].ghostOpacity), `${id}: the ghost is display.segments.ghost`).toBeCloseTo(0.14, 5);
    expect(info[id].ghostMask, `${id}: the ghost is a mask`).toContain("data:image/svg+xml");
  }
  expect(info.plainout.family).not.toBe("Strata Segments");
  expect(info.plainout.segments).toBeNull();
  expect(info.plainout.ghostContent, "no ghost without the look").toBe("none");
  // The text is the native element's own and exact, characters and all, including those the face has no segments for (they fall to the code face).
  expect([info.clock.value, info.readout.value, info.freq.value]).toEqual(["12:34", "-18.5 dB", "440.0"]);
  // The face is loaded; every digit advances one 600-unit cell (0.6 em), and a character it has no segments for is drawn by the next face in the stack, which does not.
  const widths = await page.evaluate(() => { const context = document.createElement("canvas").getContext("2d"); context.font = '100px "Strata Segments"'; return Object.fromEntries([..."0123456789-:.mw"].map(character => [character, context.measureText(character).width])); });
  for (const digit of "0123456789-:.") expect(widths[digit], digit).toBeCloseTo(60, 3);
  console.log(`segments: advances at 100px: ${JSON.stringify(widths)}`);
  expect([widths.m === 60, widths.w === 60], "m and w are not in the face: the stack's next face draws them").toEqual([false, false]);
  // The face really draws segments, and the ghost really is the unlit ones: pixels. The window of `#clock` with no text (the ghost alone) shows 7-segment shapes of
  // the text colour at low strength; with the digits over them, the lit segments are the full text colour.
  const shoot = async name => { await mkdir(evidence, { recursive: true }); return PNG.sync.read(await page.locator("#clock").locator("xpath=..").screenshot({ path: `${evidence}/${name}.png` })); };
  const withText = await shoot("segments-clock");
  await page.locator("#clock").evaluate(output => { output.textContent = ""; });
  const ghostOnly = await shoot("segments-ghost");
  const levels = png => { const counts = { dark: 0, faint: 0 }; for (let at = 0; at < png.data.length; at += 4) { const l = (png.data[at] + png.data[at + 1] + png.data[at + 2]) / 3; if (l < 90) counts.dark++; }
    return counts; };
  const lit = levels(withText), unlit = levels(ghostOnly);
  console.log(`segments: dark px with the digits ${lit.dark}, with the ghost alone ${unlit.dark}`);
  expect(lit.dark, "the lit segments are full text colour").toBeGreaterThan(250);
  expect(unlit.dark, "the ghost is faint: nothing as dark as the text").toBe(0);
  // The ghost differs from the plain window by a few levels where a segment would be: count pixels that are darker than the window by 4 to 60 levels.
  const corner = ((10 * ghostOnly.width) + 10) * 4, background = ghostOnly.data[corner] + ghostOnly.data[corner + 1] + ghostOnly.data[corner + 2];
  let faint = 0;
  for (let at = 0; at < ghostOnly.data.length; at += 4) { const sum = ghostOnly.data[at] + ghostOnly.data[at + 1] + ghostOnly.data[at + 2]; if (background - sum > 12 && background - sum < 180) faint++; }
  expect(faint, "the unlit segments of the whole window are printed").toBeGreaterThan(1500);
  // Typing in the TextField's display is the browser's: the segments follow.
  await page.locator("#freq").fill("88.8");
  expect(await page.locator("#freq").inputValue()).toBe("88.8");
  await context.close();
});

test("the flush wheels, selectors and segments are the markup of before: `?flush` draws the groove slider, plain radios and the display without the look", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await context.newPage();
  await page.goto("/ui-deferred-forms.html?plain&flush");
  await page.waitForFunction(() => window.strataDeferredProbe);
  expect(await page.evaluate(() => ({
    sliders: ["gain", "pan", "flatslider"].map(id => document.getElementById(id).className),
    groups: ["mode", "route"].map(id => [document.getElementById(`${id}-group`).dataset.strataForm ?? null, document.querySelector(`#${id}-group input`).className]),
    segments: ["clock", "freq"].map(id => document.getElementById(id).closest(".ug-display").dataset.strataSegments ?? null),
    font: getComputedStyle(document.getElementById("clock")).fontFamily.includes("Strata Segments"),
  }))).toEqual({ sliders: ["ug-slider", "ug-slider", "ug-slider"], groups: [[null, "ug-radio__input"], [null, "ug-radio__input"]], segments: [null, null], font: false });
  await context.close();
});

// ---- Accessibility ----

test("the accessibility snapshot is the same in DOM and GPU modes, and axe is clean in light, dark, face mode and more contrast", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const page = await context.newPage();
  await page.goto("/ui-deferred-forms.html?dom");
  await page.waitForFunction(() => window.strataDeferredProbe);
  const act = async () => {
    await page.locator("#gain").focus(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("ArrowRight");
    await page.getByRole("radio", { name: "Solo" }).first().focus(); await page.keyboard.press("ArrowRight");
  };
  await act();
  const snapshot = () => page.locator("#def-panel").ariaSnapshot();
  const dom = await snapshot();
  expect(dom).toContain('slider "Gain"');
  expect(dom).toContain('group "Mode"');
  expect(dom).toContain('radio "Mute"');
  expect(dom).toContain('radio "Out 3"');
  expect(dom).toContain("12:34");
  for (const level of ["", "?level=objects", "?level=instrument"]) {
    await page.goto(`/ui-deferred-forms.html${level}`);
    await page.waitForFunction(() => window.strataDeferredProbe && window.strataDeferredProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
    await page.evaluate(() => window.strataDeferredProbe.controller.settle());
    await act();
    expect(await snapshot(), `the accessibility snapshot at ${level || "relief"}`).toBe(dom);
    const { violations } = await new AxeBuilder({ page }).include("#def-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level || "relief"}`).toEqual([]);
  }
  // Plain page: light, dark, the GPU's face mode, more contrast.
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  for (const theme of ["light", "dark", "contrast", "contrast-dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("#def-panel").withTags(tags).analyze();
    expect(summary(violations), `axe, ${theme}`).toEqual([]);
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; document.getElementById("def-panel").setAttribute("data-strata-mode", "face"); });
  expect(summary((await new AxeBuilder({ page }).include("#def-panel").withTags(tags).analyze()).violations), "axe, face mode").toEqual([]);
  await context.close();
  const more = await browser.newContext({ viewport: { width: 900, height: 1100 }, contrast: "more" });
  const morePage = await more.newPage();
  await morePage.goto("/ui-deferred-forms.html?plain");
  await morePage.waitForFunction(() => window.strataDeferredProbe);
  expect(summary((await new AxeBuilder({ page: morePage }).include("#def-panel").withTags(tags).analyze()).violations), "axe, more contrast").toEqual([]);
  // More contrast: the segments' ghost is at its own strength, the dial's print and pointer take the text colour.
  expect(await morePage.evaluate(() => getComputedStyle(document.querySelector("#clock").closest(".ug-display").querySelector(".ug-display__window"), "::before").opacity)).toBe("0.18");
  await more.close();
});

// ---- Touch, mobile, text size and preferences ----

for (const width of [390, 320]) test(`on a ${width} px touch screen the wheel, the dial and the displays take taps and do not overflow`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "no horizontal overflow").toBe(true);
  // Taps: a printed position, the cap, the slot.
  const tap = async ([x, y]) => page.touchscreen.tap(x, y);
  await tap(await label(page, "mode", "Mute"));
  expect(await checked(page, "mode")).toBe("mute");
  const cap = await page.locator("#mode-group .ug-rotary__cap").boundingBox();
  await tap([cap.x + cap.width / 2, cap.y + cap.height * 0.2]);
  expect(await checked(page, "mode")).toBe("bypass");
  const g = await geometry(page, "gain");
  await tap([g.slot.x + 3 + 72 * 0.8, g.slot.y + g.slot.height / 2]);
  expect(Math.abs(await value(page, "gain") - 80)).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => window.scrollX), "no sideways scroll").toBe(0);
  // Targets of at least 24 px and print inside the viewport.
  const small = await page.evaluate(() => [...document.querySelectorAll(".ug-rotary__radio, .ug-fader__input")].map(element => { const box = element.getBoundingClientRect(); return [element.id || element.value, Math.round(box.width), Math.round(box.height)]; }).filter(([, w, h]) => w < 24 || h < 24));
  expect(small, "targets of at least 24 px").toEqual([]);
  const out = await page.evaluate(() => [...document.querySelectorAll(".ug-rotary__text, .ug-fader__mark, .ug-display__text")].filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.left < -0.5 || box.right > window.innerWidth + 0.5); }).map(element => element.textContent.trim()));
  expect(out, "print inside the viewport").toEqual([]);
  // A touch drag along the slot moves the wheel's value and the page does not scroll sideways.
  const slot = (await geometry(page, "pan")).slot;
  await page.evaluate(() => window.scrollTo(0, 0));
  const client = await context.newCDPSession(page);
  const y = slot.y + 2, x0 = slot.x + 3 + 72 * 0.2, x1 = slot.x + 3 + 72 * 0.8;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
  for (let step = 1; step <= 8; step++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + ((x1 - x0) * step) / 8, y }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(Math.abs(await value(page, "pan") - 80), "a touch drag along the slot ends where it was dragged to").toBeLessThanOrEqual(3);
  console.log(`touch ${width}: no overflow, ${await page.evaluate(() => document.querySelectorAll(".ug-rotary__radio").length)} radio overlays, pan ${await value(page, "pan")} after a drag`);
  await context.close();
});

test("at 320 px and at 200% text the dial prints numbers with a legend, the printed positions stay apart and no control overflows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  for (const size of ["100%", "200%"]) {
    if (size === "200%") await page.evaluate(() => { for (const name of ["caption", "small", "body"]) { const property = `--strata-font-size-${name}`; document.documentElement.style.setProperty(property, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property)) * 2}px`); } });
    const result = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      const marks = id => [...document.querySelectorAll(`#${id}-group .ug-rotary__radio`)].map(element => element.getBoundingClientRect()).filter(box => box.width > 0);
      const overlap = boxes => boxes.flatMap((a, i) => boxes.slice(i + 1).filter(b => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)).length;
      const legend = getComputedStyle(document.querySelector("#mode-group .ug-rotary__legend")).display;
      const text = getComputedStyle(document.querySelector("#mode-group .ug-rotary__text")).fontSize;
      const marksOut = [...document.querySelectorAll(".ug-fader__mark")].filter(m => m.getBoundingClientRect().right > window.innerWidth + 0.5).length;
      const gainMarks = [...document.querySelectorAll(".ug-fader:has(#gain) .ug-fader__mark")].map(element => element.getBoundingClientRect());
      return { overflow, overlap: overlap(marks("mode")), legend, text, marksOut, gainOverlap: overlap(gainMarks), radios: marks("mode").length };
    });
    console.log(`320 px, text ${size}: ${JSON.stringify(result)}`);
    expect(result.overflow, `${size}: no horizontal overflow`).toBeLessThanOrEqual(0);
    expect(result.overlap, `${size}: printed positions apart`).toBe(0);
    // The labels are printed while the dial has the room (104 px + 7em), numbers and a legend when it has not (200% text).
    expect(result.legend, `${size}: the numbered legend`).toBe(size === "200%" ? "block" : "none");
    expect(result.text, `${size}: numbers on the dial, or the labels`).toBe(size === "200%" ? "0px" : "12px");
    expect(result.marksOut).toBe(0);
    expect(result.gainOverlap, `${size}: the wheel's printed marks apart`).toBe(0);
    // The group is still the group: each radio still named by its label.
    expect(await page.getByRole("group", { name: "Mode", exact: true }).getByRole("radio").evaluateAll(radios => radios.map(radio => radio.labels[0].textContent.trim()))).toEqual(["Mix", "Solo", "Mute", "Bypass"]);
  }
  await context.close();
});

test("forced colours, more contrast and reduced motion: the roller, the dial and the segments are visible and nothing moves by itself", async ({ browser }) => {
  const forced = await browser.newContext({ viewport: { width: 900, height: 1100 }, forcedColors: "active" });
  const page = await forced.newPage();
  await page.goto("/ui-deferred-forms.html?plain");
  await page.waitForFunction(() => window.strataDeferredProbe);
  const colours = await page.evaluate(() => {
    const probe = document.createElement("span"); probe.style.color = "CanvasText"; document.body.append(probe);
    const text = getComputedStyle(probe).color; probe.remove();
    const border = selector => getComputedStyle(document.querySelector(selector)).borderTopColor;
    const gray = document.createElement("span"); gray.style.color = "GrayText"; document.body.append(gray); const grayText = getComputedStyle(gray).color; gray.remove();
    return { text, roller: border("#gain-field .ug-fader__wheel"), skirt: border("#mode-group .ug-rotary__skirt"), lockedSkirt: border("#lockedradio-group .ug-rotary__skirt"), gray: grayText,
      ridges: getComputedStyle(document.querySelector("#gain-field .ug-fader__ridges")).backgroundImage.includes("repeating-linear-gradient"), mask: getComputedStyle(document.querySelector("#clock").closest(".ug-display").querySelector(".ug-display__window"), "::before").maskImage !== "none" };
  });
  console.log(`forced colours: ${JSON.stringify(colours)}`);
  expect(colours.roller, "the roller has a CanvasText border").toBe(colours.text);
  expect(colours.skirt).toBe(colours.text);
  expect(colours.lockedSkirt, "a disabled dial is GrayText").toBe(colours.gray);
  expect(colours.ridges).toBe(true);
  expect(colours.mask).toBe(true);
  expect(summary((await new AxeBuilder({ page }).include("#def-panel").withTags(tags).analyze()).violations)).toEqual([]);
  await forced.close();
  const reduced = await browser.newContext({ viewport: { width: 900, height: 1100 }, reducedMotion: "reduce" });
  const still = await reduced.newPage();
  await still.goto("/ui-deferred-forms.html?plain");
  await still.waitForFunction(() => window.strataDeferredProbe);
  expect(await still.evaluate(() => [getComputedStyle(document.querySelector("#mode-group .ug-rotary__pointer")).transitionDuration, getComputedStyle(document.querySelector("#gain-field .ug-fader__wheel")).transitionDuration])).toEqual(["0s", "0s"]);
  await reduced.close();
});

// ---- GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-deferred-forms.html${query}`);
  await page.waitForFunction(() => window.strataDeferredProbe && window.strataDeferredProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataDeferredProbe.scene() !== undefined);
  await page.evaluate(() => window.strataDeferredProbe.controller.settle());
  await built(page);
  // The segments face is a data URI: wait for it, so no capture is taken in the fallback face and re-taken when it arrives.
  await page.evaluate(() => document.fonts.load('16px "Strata Segments"'));
  await page.evaluate(() => window.strataDeferredProbe.controller.settle());
}
const built = page => page.waitForFunction(() => {
  const instrument = window.strataDeferredProbe.instrument();
  return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
}, null, { timeout: 30000 });
/** At the Instrument level: every object's spring at rest on its control's place. */
const rest = page => page.waitForFunction(() => {
  const probe = window.strataDeferredProbe;
  probe.refresh();
  return (probe.scene()?.objects ?? []).every(object => {
    const input = document.getElementById(object.id);
    if (input?.type === "range") return Math.abs(object.t - (input.value - input.min) / (input.max - input.min)) < 1e-6;
    const radios = [...document.querySelectorAll(`#${object.id} .ug-rotary__radio`)];
    if (!radios.length) return true;
    return Math.abs(object.t - Math.max(0, radios.findIndex(radio => radio.checked)) / (radios.length - 1)) < 1e-6;
  });
});
const mode = page => page.evaluate(() => window.strataDeferredProbe.controller.state().mode);
async function frame(page, name) {
  await page.mouse.move(2, 2);
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    window.strataDeferredProbe.refresh(); await window.strataDeferredProbe.controller.settle();
  });
  await rest(page);
  await built(page);
  await page.evaluate(async () => {
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataDeferredProbe.controller.settle();
  });
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
    if (allowed.some(box => px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height)) inside++;
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples };
}
function changedPoints(a, b) {
  const ratio = a.width / 640, points = [];
  for (let y = 0; y < a.height; y += 2) for (let x = 0; x < a.width; x += 2) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) >= 6) points.push([(x + 0.5) / ratio, (y + 0.5) / ratio]);
  }
  return points;
}
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect(), box = document.querySelector(selector).getBoundingClientRect();
  return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
}, selector);
/** Native hits on frame points: how many land on the control's own element (a wheel's input; a dial's group, or one of its radios). */
const hitsOn = (page, points, selector) => page.evaluate(([points, selector]) => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let total = 0, mismatches = 0;
  for (const [x, y] of points) {
    const hit = document.elementFromPoint(frame.left + x, frame.top + y);
    total++;
    if (!hit?.closest(selector)) mismatches++;
  }
  return { total, mismatches };
}, [points, selector]);
const hitSelector = ".ug-fader__input, fieldset.ug-radio-group[data-strata-form='selector']";
/** elementFromPoint over a grid on an element's box: every hit must satisfy `selector`. */
const grid = (page, selector, accept, n = 11) => page.evaluate(([selector, accept, n]) => {
  const element = document.querySelector(selector), box = element.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (!hit?.closest(accept)) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [selector, accept, n]);
const setValue = (page, id, v) => page.evaluate(([id, v]) => { const input = document.getElementById(id); input.value = String(v); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
const check = (page, id, v) => page.evaluate(([id, v]) => { const radio = document.querySelector(`#${id}-group .ug-rotary__radio[value="${v}"]`); radio.click(); }, [id, v]);

for (const level of ["relief", "objects"]) for (const dpr of [1, 2]) test(`on the GPU at the ${level} level (DPR ${dpr}) the wheels, the dials and the segments stay presented, their pixels are fresh and contained, and native hits land on them`, async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  const kinds = await page.evaluate(() => {
    const probe = window.strataDeferredProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
    const entry = selector => { const box = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (box.left - panel.left)) < 0.5 && Math.abs(p.rect[1] - (box.top - panel.top)) < 0.5 && Math.abs(p.rect[2] - box.width) < 0.5 && Math.abs(p.rect[3] - box.height) < 0.5) ?? null; };
    return { version: scene.version, material: probe.controller.state().materials[0]?.kind, slot: entry("#gain-field .ug-fader__slot"), roller: entry("#gain-field .ug-fader__wheel"), skirt: entry("#mode-group .ug-rotary__skirt"), cap: entry("#mode-group .ug-rotary__cap"),
      objects: scene.objects?.length ?? 0 };
  });
  if (level === "relief") expect(kinds).toMatchObject({ material: "relief", slot: { face: "groove" }, roller: { face: "raised" }, skirt: { face: "raised" }, cap: { face: "raised" } });
  else expect(kinds).toMatchObject({ material: "objects", slot: { face: "groove" } });
  expect(kinds.objects).toBe(0);
  // Native hits: a grid over each wheel's input and each selector's group lands on the control.
  for (const id of wheels) { const result = await grid(page, `#${id}`, ".ug-fader__input", dpr === 2 ? 21 : 11); expect(result.misses, `${id}: hits over the track`).toEqual([]); console.log(`${level} DPR ${dpr}: ${id} ${result.total} hits, ${result.misses.length} mismatches`); }
  for (const id of dials) { const result = await grid(page, `#${id}-group .ug-rotary__dial`, "fieldset.ug-radio-group", dpr === 2 ? 21 : 11); expect(result.misses, `${id}: hits over the dial`).toEqual([]); console.log(`${level} DPR ${dpr}: ${id} ${result.total} hits on the group, ${result.misses.length} mismatches`); }
  expect(await page.evaluate(() => { const box = document.querySelector("#mode-group .ug-rotary__text").getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.className; })).toBe("ug-rotary__radio");
  // Fresh pixels after each change, only inside the control (and its focus ring), or the readout that prints it.
  const boxes = await Promise.all([...wheels.map(id => inFrame(page, `.ug-fader:has(#${id})`)), ...dials.map(id => inFrame(page, `#${id}-group .ug-rotary__dial`))]);
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return Number.parseFloat(style.getPropertyValue("--strata-focus-width")) + Number.parseFloat(style.getPropertyValue("--strata-focus-offset")) + 2; });
  const allowed = boxes.map(box => ({ x: box.x - ring, y: box.y - ring, width: box.width + 2 * ring, height: box.height + 2 * ring }));
  await page.evaluate(() => { document.getElementById("def-read").style.visibility = "hidden"; });
  let before = await frame(page, `${level}-dpr${dpr}-0`);
  const steps = [
    ["drag the wheel along its slot", async () => { const g = await geometry(page, "gain"); await drag(page, [g.slot.x + 3 + 72 * 0.5, g.slot.y + 2], [-24, 0]); }, () => value(page, "gain"), v => v < 40],
    ["click the pan wheel's slot", async () => { const g = await geometry(page, "pan"); await page.mouse.click(g.slot.x + 3 + 72 * 0.1, g.slot.y + g.slot.height / 2); }, () => value(page, "pan"), v => v < 25],
    ["End key on the wheel", async () => { await page.locator("#gain").focus(); await page.keyboard.press("End"); }, () => value(page, "gain"), v => v === 100],
    ["click Bypass", async () => page.mouse.click(...await label(page, "mode", "Bypass")), () => checked(page, "mode"), v => v === "bypass"],
    ["arrow key to Mix", async () => { await page.getByRole("radio", { name: "Bypass" }).first().focus(); await page.keyboard.press("ArrowRight"); }, () => checked(page, "mode"), v => v === "mix"],
    ["tap the cap", async () => { const box = await page.locator("#mode-group .ug-rotary__cap").boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2); }, () => checked(page, "mode"), v => v === "solo"],
  ];
  for (const [name, act, read, ok] of steps) {
    await act();
    expect(ok(await read()), name).toBe(true);
    expect(await mode(page), `${name}: GPU stays on`).toBe("gpu");
    const after = await frame(page, `${level}-dpr${dpr}-${name.replace(/\W+/g, "-")}`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${name}: pixels change in the control`).toBeGreaterThan(40);
    expect(changed.outside, `${name}: no pixel changes outside the control (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`${level} DPR ${dpr}: ${name}: ${changed.inside} px changed in the controls, ${changed.outside} outside`);
    before = after;
  }
  // The text under the glass is the DOM's own text: a window's text and its ghost are captured content, exactly as printed.
  expect(await page.evaluate(() => ["clock", "readout", "freq"].map(id => { const el = document.getElementById(id); return el.value ?? el.textContent; }))).toEqual(["12:34", "-18.5 dB", "440.0"]);
  expect(await mode(page)).toBe("gpu");
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) the rollers and the dials are parts that stay in their boxes over the whole turn, change only their box, and take native hits`, async ({ browser }) => {
  test.setTimeout(300000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "?level=instrument&nobank");
  const layer = () => page.evaluate(() => window.strataDeferredProbe.instrument().layers[0]);
  const healthy = async label => {
    expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
    const state = await layer();
    expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
    expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
  };
  const sceneOf = () => page.evaluate(() => {
    const probe = window.strataDeferredProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
    const box = id => { const element = id.endsWith("-group") ? document.querySelector(`#${id} .ug-rotary__dial`) : document.getElementById(id); const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
    const pick = id => scene.objects.find(object => object.id === id);
    return { version: scene.version, kind: scene.kind, material: probe.controller.state().materials[0]?.kind, ids: scene.objects.map(object => object.id),
      close: Object.fromEntries(scene.objects.filter(object => ["gain", "pan", "locked", "mode-group", "lockedradio-group"].includes(object.id)).map(object => [object.id, object.bounds.rect.every((value, index) => Math.abs(value - box(object.id)[index]) < 0.01)])),
      parts: Object.fromEntries(["gain", "pan", "locked", "mode-group", "lockedradio-group"].map(id => [id, pick(id)?.parts.map(part => `${part.kind}:${part.material}`)])),
      poses: Object.fromEntries(["gain", "pan"].map(id => [id, pick(id)?.parts[0].pose])), casters: Object.fromEntries(["gain", "pan"].map(id => [id, pick(id)?.parts[0].caster])),
      states: Object.fromEntries(["gain", "locked", "mode-group", "lockedradio-group"].map(id => [id, pick(id)?.parts[0].state])), t: Object.fromEntries(["gain", "pan", "locked", "mode-group", "lockedradio-group"].map(id => [id, Math.round(pick(id).t * 10000) / 10000])),
      materials: Object.keys(scene.materials).length, camera: scene.camera.distance };
  });
  const scene = await sceneOf();
  console.log(`instrument DPR ${dpr}: objects ${scene.ids.join(", ")}; ${scene.materials} materials`);
  expect(scene).toMatchObject({ version: 4, kind: "instrument", material: "instrument", camera: 2400 });
  for (const id of ["gain", "pan", "locked"]) expect(scene.parts[id], id).toEqual(["carriage:knobSkirt", "grip:knobInk"]);
  for (const id of ["mode-group", "lockedradio-group"]) expect(scene.parts[id], id).toEqual(["skirt:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "pointer:knobInk"]);
  expect(Object.values(scene.close).every(Boolean), `every object's bounds are its control's box: ${JSON.stringify(scene.close)}`).toBe(true);
  // The roller turns about its own axis: tilt −75 to +75 for the default sweep (150), the same for the pan wheel.
  expect(scene.poses.gain.from.tilt).toBe(-75); expect(scene.poses.gain.to.tilt).toBe(75); expect(scene.poses.pan.to.tilt).toBe(75);
  expect(scene.poses.gain.from.axis).toBe(90);
  expect(scene.t).toEqual({ gain: 0.4, pan: 0.75, locked: 0.3, "mode-group": 0.3333, "lockedradio-group": 0.6667 });
  expect(scene.states).toEqual({ gain: { hover: false, disabled: false }, locked: { hover: false, disabled: true }, "mode-group": { hover: false, disabled: false }, "lockedradio-group": { hover: false, disabled: true } });
  await healthy("start");

  // Containment over the whole turn: at 0, 25, 50, 75 and 100%, the parts (against the same page with them hidden) change pixels only inside their control's box, and the hits on
  // every changed pixel land on the control.
  const boxes = await Promise.all([...wheels.map(id => inFrame(page, `#${id}`)), ...dials.map(id => inFrame(page, `#${id}-group .ug-rotary__dial`))]);
  const hide = (visibility, selector) => page.evaluate(([visibility, selector]) => { for (const part of document.querySelectorAll(selector)) part.style.visibility = visibility; }, [visibility, selector]);
  // `only` limits the check to the rollers (full and zero depth: the dial is the Knob's object, whose depth range the Knob's own suite covers).
  const contained = async (label, only = false) => {
    const selector = only ? ".ug-fader__wheel" : ".ug-fader__wheel, .ug-rotary__skirt", scope = only ? boxes.slice(0, 3) : boxes;
    const on = await frame(page, `instrument-dpr${dpr}-${label}-on`);
    await hide("hidden", selector);
    const off = await frame(page, `instrument-dpr${dpr}-${label}-off`);
    await hide("", selector);
    await frame(page, `instrument-dpr${dpr}-${label}-back`);
    const parts = difference(on, off, scope);
    expect(parts.inside, `${label}: the parts are drawn`).toBeGreaterThan((only ? 300 : 1200) * dpr * dpr);
    expect(parts.outside, `${label}: no part pixel outside a control's box (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
    const hit = await hitsOn(page, changedPoints(on, off), hitSelector);
    expect(hit.mismatches, `${label}: native hits on part pixels`).toBe(0);
    console.log(`instrument DPR ${dpr}: ${label}: ${parts.inside} part px inside the boxes, ${parts.outside} outside; ${hit.total} hits on part pixels, ${hit.mismatches} mismatches`);
    await healthy(label);
    return on;
  };
  const turned = [];
  for (const percent of [0, 25, 50, 75, 100]) {
    for (const id of ["gain", "pan", "locked"]) await setValue(page, id, percent);
    await check(page, "mode", ["mix", "solo", "mute", "bypass", "bypass"][[0, 25, 50, 75, 100].indexOf(percent)]);
    turned.push(await contained(`${percent}pct`));
  }
  // The roller really turns: each value is a different picture of the roller (ridges at other places), inside the wheel's box and nowhere else.
  const wheelBoxes = boxes.slice(0, 3);
  for (let index = 1; index < turned.length; index++) {
    // The displays' backlights bloom 60 px round them (as the Display's own suite allows); a value change does not touch them, but a sub-pixel of bloom may differ between two builds of the layer.
    const blooms = await Promise.all(["clock", "readout", "freq"].map(async id => { const box = await inFrame(page, `#${id}`); return { x: box.x - 60, y: box.y - 60, width: box.width + 120, height: box.height + 120 }; }));
    const d = difference(turned[index - 1], turned[index], [...wheelBoxes, ...boxes.slice(3), await inFrame(page, "#def-read"), ...blooms]);
    expect(d.outside, `${index * 25}%: only the controls change (${JSON.stringify(d.outsideSamples)})`).toBe(0);
    expect(d.inside, `${index * 25}%: the roller shows other ridges`).toBeGreaterThan(100 * dpr * dpr);
  }
  for (const id of wheels) expect((await grid(page, `#${id}`, ".ug-fader__input", dpr === 2 ? 21 : 11)).misses, `${id}: grid hits`).toEqual([]);

  // Full depth: the roller stands 25.6 high and its caster is capped so the shadow stays in the box.
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-depth", "1"));
  await frame(page, `instrument-dpr${dpr}-depth1`);
  const deep = await sceneOf();
  console.log(`instrument DPR ${dpr}: at depth 1 the gain wheel's caster is ${JSON.stringify(deep.casters.gain)}`);
  if (deep.casters.gain) expect(deep.casters.gain.height).toBeLessThanOrEqual(12.8);
  for (const stop of [0, 100]) { for (const id of ["gain", "pan"]) await setValue(page, id, stop); await contained(`depth1-${stop}`, true); }
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));
  await frame(page, `instrument-dpr${dpr}-depth-back`);
  // Depth 0: the roller is 4.8 high; still drawn, still contained.
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-depth", "0"));
  await frame(page, `instrument-dpr${dpr}-depth0`);
  await contained("depth0", true);
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));
  await frame(page, `instrument-dpr${dpr}-depth-back2`);

  // Real input at the Instrument level: fresh pixels inside the control only.
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return Number.parseFloat(style.getPropertyValue("--strata-focus-width")) + Number.parseFloat(style.getPropertyValue("--strata-focus-offset")) + 2; });
  // The readout that prints each change is hidden here (its text is its own captured pixels), so the only pixels that may change are the control's.
  await page.evaluate(() => { document.getElementById("def-read").style.visibility = "hidden"; });
  const allowed = boxes.map(box => ({ x: box.x - ring, y: box.y - ring, width: box.width + 2 * ring, height: box.height + 2 * ring }));
  for (const id of ["gain", "pan", "locked"]) await setValue(page, id, id === "gain" ? 40 : id === "pan" ? 75 : 30);
  await check(page, "mode", "solo");
  await frame(page, `instrument-dpr${dpr}-start-settle`);
  let before = await frame(page, `instrument-dpr${dpr}-start`);
  const steps = [
    ["drag the wheel along its slot", async () => { const g = await geometry(page, "gain"); await drag(page, [g.slot.x + 3 + 72 * 0.5, g.slot.y + 2], [-24, 0]); }],
    ["End key on the pan wheel", async () => { await page.locator("#pan").focus(); await page.keyboard.press("End"); }],
    ["the mouse wheel over the roller", async () => { const g = await geometry(page, "gain"); await page.mouse.move(...centre(g.roller)); await page.mouse.wheel(0, -100); }],
    ["click Bypass", async () => page.mouse.click(...await label(page, "mode", "Bypass"))],
    ["arrow key to Mix", async () => { await page.getByRole("radio", { name: "Bypass" }).first().focus(); await page.keyboard.press("ArrowRight"); }],
    ["tap the cap", async () => { const box = await page.locator("#mode-group .ug-rotary__cap").boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.2); }],
  ];
  for (const [name, act] of steps) {
    await act();
    const after = await frame(page, `instrument-dpr${dpr}-${name.replace(/\W+/g, "-")}`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${name}: the part moved`).toBeGreaterThan(100);
    expect(changed.outside, `${name}: nothing changes outside the control (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`instrument DPR ${dpr}: ${name}: ${changed.inside} px changed in the controls, ${changed.outside} outside`);
    await healthy(name);
    before = after;
  }

  // Hover reaches the roller; a disabled wheel and a disabled dial are drawn and stay disabled.
  const g = await geometry(page, "gain");
  await page.mouse.move(...centre(g.roller));
  await page.evaluate(async () => { window.strataDeferredProbe.refresh(); await window.strataDeferredProbe.controller.settle(); });
  expect((await sceneOf()).states.gain, "hover").toEqual({ hover: true, disabled: false });
  await page.mouse.move(2, 2);

  // 300 frames of turning: a native change every 15 frames; the springs turn the parts in between. Core captures each native change (in its frame or the next): the turning
  // frames between them add no capture, upload or hit-geometry update. The roller turns with the value (a pose), the dial's pointer on its detent.
  await page.evaluate(() => { document.getElementById("def-read").style.visibility = "hidden"; });
  await rest(page);
  const turning = await page.evaluate(async () => {
    const probe = window.strataDeferredProbe, input = document.getElementById("gain"), frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 5; index++) await frame();
    const start = probe.counts();
    let previous = start, extra = 0, moved = 0, changes = 0, t = probe.scene().objects.find(object => object.id === "gain").t;
    for (let index = 0; index < 300; index++) {
      if (index % 15 === 0) { input.value = String(index % 30 === 0 ? 5 : 95); input.dispatchEvent(new Event("input", { bubbles: true })); changes++; }
      await frame();
      const now = probe.counts(), next = probe.scene().objects.find(object => object.id === "gain").t;
      if (index % 15 > 1) extra += now.captures - previous.captures;
      if (next !== t) moved++;
      t = next; previous = now;
    }
    const end = probe.counts();
    return { changes, moved, extra, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  });
  console.log(`instrument DPR ${dpr}: wheel, 300 frames, ${turning.changes} native changes, ${turning.moved} frames turning, ${turning.captures} captures (${turning.extra} in turning frames), ${turning.uploads} uploads, ${turning.geometryUpdates} hit-geometry updates`);
  expect(turning.mode).toBe("gpu");
  expect(turning.moved, "the roller turns on most frames").toBeGreaterThan(150);
  expect(turning.extra, "turning frames cause no capture").toBe(0);
  expect(turning.captures).toBeLessThanOrEqual(turning.changes);
  expect(turning.geometryUpdates).toBe(0);
  await healthy("turning");
  // The selector's snap: a radio checked every 15 frames; the pointer settles on `spring.detent` in between.
  await rest(page);
  const snapping = await page.evaluate(async () => {
    const probe = window.strataDeferredProbe, radios = [...document.querySelectorAll("#mode-group .ug-rotary__radio")], frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 5; index++) await frame();
    const start = probe.counts();
    let previous = start, extra = 0, moved = 0, changes = 0, t = probe.scene().objects.find(object => object.id === "mode-group").t;
    for (let index = 0; index < 300; index++) {
      if (index % 15 === 0) { radios[(index / 15) % 2 === 0 ? 0 : 3].click(); changes++; }
      await frame();
      const now = probe.counts(), next = probe.scene().objects.find(object => object.id === "mode-group").t;
      if (index % 15 > 1) extra += now.captures - previous.captures;
      if (next !== t) moved++;
      t = next; previous = now;
    }
    const end = probe.counts();
    return { changes, moved, extra, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  });
  console.log(`instrument DPR ${dpr}: selector, 300 frames, ${snapping.changes} snaps, ${snapping.moved} frames turning, ${snapping.captures} captures (${snapping.extra} in turning frames), ${snapping.uploads} uploads, ${snapping.geometryUpdates} hit-geometry updates`);
  expect(snapping.mode).toBe("gpu");
  expect(snapping.moved, "the pointer settles over many frames").toBeGreaterThan(40);
  expect(snapping.extra, "turning frames cause no capture").toBe(0);
  expect(snapping.captures).toBeLessThanOrEqual(snapping.changes);
  expect(snapping.geometryUpdates).toBe(0);
  await healthy("snapping");
  expect(errors).toEqual([]);
  await context.close();
});

test("at the Instrument level under reduced motion the roller and the pointer move at once, and the snapshot matches the DOM", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  await page.locator("#gain").focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("radio", { name: "Solo" }).first().focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => { const probe = window.strataDeferredProbe; probe.refresh(); return Object.fromEntries(probe.scene().objects.filter(object => ["gain", "mode-group"].includes(object.id)).map(object => [object.id, Math.round(object.t * 10000) / 10000])); })).toEqual({ gain: 0.41, "mode-group": 0.6667 });
  expect(await mode(page)).toBe("gpu");
  await context.close();
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) the digits under the glass are the capture itself, with the ghost segments printed behind them`, async ({ browser }) => {
  test.setTimeout(240000);
  const shoot = async kind => {
    const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    let png;
    if (kind === "dom") {
      await page.goto("/ui-deferred-forms.html?dom");
      await page.waitForFunction(() => window.strataDeferredProbe);
      await page.evaluate(() => document.fonts.load('16px "Strata Segments"'));
      await page.evaluate(() => { document.getElementById("def-panel").setAttribute("data-strata-mode", "face"); });
      await page.addStyleTag({ content: ".ug-display__window, .ug-display__bezel { background-image: none !important; box-shadow: none !important; }" });
      await page.waitForTimeout(300);
      await mkdir(evidence, { recursive: true });
      png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/instrument-dpr${dpr}-segments-dom.png` }));
    } else {
      await ready(page, "?level=instrument");
      await page.evaluate(() => document.fonts.load('16px "Strata Segments"'));
      png = await frame(page, `instrument-dpr${dpr}-segments-glass`);
    }
    const boxes = await page.evaluate(() => ["clock", "readout", "freq"].map(id => { const frame = document.getElementById("frame").getBoundingClientRect(), box = document.getElementById(id).getBoundingClientRect(); return { id, x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height }; }));
    const font = await page.evaluate(() => document.fonts.check('16px "Strata Segments"', "0123456789"));
    await context.close();
    return { png, boxes, font };
  };
  const glass = await shoot("glass"), dom = await shoot("dom");
  expect(glass.font && dom.font, "the face is loaded").toBe(true);
  // The text boxes of the three segments displays: the window colour under the glass is the capture's, and the digits (dark pixels) and the ghost (faint pixels) are the DOM's own.
  let compared = 0, mismatched = 0, glyphs = 0, faint = 0, max = 0, plain = 0, tinted = 0;
  for (const box of glass.boxes) {
    const x0 = Math.floor((box.x + 14) * dpr), x1 = Math.ceil((box.x + box.width - 14) * dpr), y0 = Math.floor((box.y + 14) * dpr), y1 = Math.ceil((box.y + box.height - 14) * dpr);
    const corner = ((y0 + 1) * dom.png.width + x0 + 1) * 4, colour = [dom.png.data[corner], dom.png.data[corner + 1], dom.png.data[corner + 2]];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const index = (y * glass.png.width + x) * 4;
      compared++;
      const diff = Math.max(Math.abs(glass.png.data[index] - dom.png.data[index]), Math.abs(glass.png.data[index + 1] - dom.png.data[index + 1]), Math.abs(glass.png.data[index + 2] - dom.png.data[index + 2]));
      if (diff > 0) mismatched++;
      max = Math.max(max, diff);
      const level = (dom.png.data[index] + dom.png.data[index + 1] + dom.png.data[index + 2]) / 3, base = (colour[0] + colour[1] + colour[2]) / 3;
      if (level < 90) glyphs++;
      else if (base - level > 4) faint++;
      if ([0, 1, 2].every(channel => dom.png.data[index + channel] === colour[channel])) { plain++; if ([0, 1, 2].some(channel => Math.abs(glass.png.data[index + channel] - colour[channel]) > 1)) tinted++; }
    }
  }
  console.log(`instrument DPR ${dpr}: the segments under the glass: ${glass.boxes.length} displays, ${compared} px compared: ${glyphs} lit-segment px, ${faint} ghost px, ${plain} plain window px (${tinted} not the DOM's colour under the glass); ${mismatched} px differ from the DOM's own rendering, by at most ${max} levels`);
  expect(glyphs, "the lit segments are there").toBeGreaterThan(150 * dpr * dpr);
  expect(faint, "the ghost segments are there").toBeGreaterThan(800 * dpr * dpr);
  expect(plain, "there is window to compare").toBeGreaterThan(2000 * dpr * dpr);
  expect(tinted, "the window under the glass is the capture's colour, to the level").toBe(0);
  expect(mismatched, "the digits and the ghost under the glass are the DOM's own, pixel for pixel").toBe(0);
});
