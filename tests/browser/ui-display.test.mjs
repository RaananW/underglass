/**
 * Browser suite for the Display (anatomy pages `display.md`, `text-field.md` section 11) on `ui-display.html`
 * (`window.strataDisplayProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a
 * Strata panel. Editable displays (`#name` with a value, `#note` empty with a placeholder, `#bad` invalid, `#locked` disabled), a read-only
 * input in a form (`#serial`), two outputs (`#rate`, a polite live region, and `#level`, `aria-live="off"`, backlight off), and a plain TextField.
 * - Plain DOM (`?plain`): roles, names and states; every box is as documented and a grid of `elementFromPoint` over it finds the native
 *   element (the bezel and the window are decoration); typing, selection, the caret, paste, IME composition and a form submission are the
 *   browser's; a read-only input submits and an output does not; a disabled input takes no focus; a live region changes once per write and
 *   `driveStrataDisplay` bounds a frame-rate value to one write an interval; the backlight is lit, off, disabled and more-contrast by the CSS.
 * - 390 and 320 px: no horizontal overflow; 200% text keeps every line inside its window.
 * - Preferences: axe in light, dark, face mode, forced colours and more contrast; the focus ring on the bezel; forced colours draw it.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is version 4 with the backlight's emitters in document order
 *   (their strength from the lit state, their colour the role's), the protected rects of every text (the content box of an input, the runs of an
 *   output, never the bezel) and the documented entries or parts; the parts draw inside the boxes only (0 px outside) and native hits on them find
 *   the native element; the backlight lights the bezel and the page round the display within the outset, and protected text stays within the
 *   guard; at the Instrument level the text under the glass is the capture itself and no pixel of it changes when the backlight is toggled;
 *   the caret and the selection are visible and placed under the glass at every level (measured by pixels); typing is captured once per text change;
 *   300 frames idle with the backlight on add no capture, upload or hit-geometry update; a driven display's captures are its own writes;
 *   more contrast and reduced transparency; the accessibility snapshot is the same in DOM and GPU modes; a resize and a DPR change keep GPU on.
 * Screenshots go to the `ui-display` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-display");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** Each display's name, kind, backlight, width and the emitters that light its window (one per two window heights of length). */
const displays = {
  name: { name: "Name", kind: "input", width: 236, lights: 3, lit: true, role: "glowOn" },
  note: { name: "Note", kind: "input", width: 236, lights: 3, lit: true, role: "accent" },
  serial: { name: "Serial", kind: "readonly", width: 236, lights: 3, lit: true, role: "info" },
  rate: { name: "Frame rate", kind: "output", width: 150, lights: 2, lit: true, role: "success" },
  level: { name: "Level", kind: "output", width: 120, lights: 1, lit: false, role: "off" },
  locked: { name: "Locked", kind: "input", width: 236, lights: 3, lit: false, role: "glowOn" },
  bad: { name: "Invalid", kind: "input", width: 236, lights: 3, lit: true, role: "danger" },
};
/** A computed colour as three 0–255 numbers, whether the browser gave it as rgb() or color(srgb). */
const channels = css => { const parts = (css.match(/[d.]+/g) ?? []).slice(0, 3).map(Number); return css.startsWith("color(") ? parts.map(part => Math.round(part * 255)) : parts; };
const ids = Object.keys(displays), inputs = ids.filter(id => displays[id].kind !== "output");
/** The box of a display at medium: the window's height (the control's, 34) and 22 px for the bezel and the room round it. */
const BOX_HEIGHT = 56;

/** elementFromPoint over a grid on a display's box (inset 0.5 px): every hit must be the native element. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const native = document.getElementById(id), box = native.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== native) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 900 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-display.html?plain${query}`);
  await page.waitForFunction(() => window.strataDisplayProbe);
  return { context, page, errors };
}

test("a display is a native input or output covering its whole box: role, name, state, the documented box, and every pixel of it hits the native element", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  for (const id of ids) {
    const native = page.locator(`#${id}`);
    await expect(native, `${id}: name`).toHaveAccessibleName(displays[id].name);
    await expect(native, `${id}: role`).toHaveRole(displays[id].kind === "output" ? "status" : "textbox");
    const box = await native.boundingBox();
    expect(box.width, `${id}: width`).toBeCloseTo(displays[id].width, 0);
    expect(box.height, `${id}: height`).toBeCloseTo(BOX_HEIGHT, 0);
    expect((await hits(page, id)).misses, `${id}: hits over the box`).toEqual([]);
    // The object lies in the box: the bezel 4 px in, the window 7 px in again, both decoration.
    const parts = await page.evaluate(id => {
      const native = document.getElementById(id), root = native.closest(".ug-display"), box = native.getBoundingClientRect();
      const part = selector => { const r = root.querySelector(selector).getBoundingClientRect(); return [r.left - box.left, r.top - box.top, box.right - r.right, box.bottom - r.bottom]; };
      const object = root.querySelector(".ug-display__object");
      return { bezel: part(".ug-display__bezel"), window: part(".ug-display__window"), hidden: object.getAttribute("aria-hidden"), pointer: getComputedStyle(root.querySelector(".ug-display__window")).pointerEvents, tag: native.tagName };
    }, id);
    expect(parts.bezel, `${id}: the bezel is 4 px in`).toEqual([4, 4, 4, 4]);
    expect(parts.window, `${id}: the window is 11 px in`).toEqual([11, 11, 11, 11]);
    expect([parts.hidden, parts.pointer]).toEqual(["true", "none"]);
    expect(parts.tag).toBe(displays[id].kind === "output" ? "OUTPUT" : "INPUT");
  }
  // States: read-only, disabled, invalid.
  await expect(page.locator("#serial")).toHaveJSProperty("readOnly", true);
  await expect(page.locator("#locked")).toBeDisabled();
  await expect(page.locator("#bad")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#rate")).toHaveText("60 fps");
  expect(errors).toEqual([]);
  await context.close();
});

test("typing, selection, the caret, paste, IME composition and a form's submission are the browser's; a read-only input submits, an output does not, a disabled input takes no focus", async ({ browser }) => {
  const { context, page } = await plain(browser);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const name = page.locator("#name");
  // Typing replaces nothing but what is selected; Home, End and the arrows move the caret; Backspace deletes.
  await name.click();
  await page.keyboard.press("End");
  await page.keyboard.type("!?");
  expect(await name.inputValue()).toBe("Hello, glass 0123!?");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Delete");
  expect(await name.inputValue()).toBe("Hllo, glass 0123!?");
  await page.keyboard.press("Backspace");
  expect(await name.inputValue()).toBe("llo, glass 0123!?");
  // Selection: select all and type over it; a shift-arrow extends from the caret; double-click selects a word.
  await page.keyboard.press("Control+A");
  expect(await name.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([0, 17]);
  await page.keyboard.type("Glass");
  expect(await name.inputValue()).toBe("Glass");
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  expect(await name.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))).toBe("ss");
  // The caret follows a click anywhere on the display, the bezel included (the native element covers all of it).
  const box = await name.boundingBox();
  await page.mouse.click(box.x + 5, box.y + box.height / 2);
  expect(await name.evaluate(input => input.selectionStart), "a click on the bezel puts the caret at the start").toBe(0);
  await page.mouse.click(box.x + box.width - 5, box.y + box.height / 2);
  expect(await name.evaluate(input => input.selectionStart), "a click at the far edge puts it at the end").toBe(5);
  await name.dblclick();
  expect(await name.evaluate(input => input.value.slice(input.selectionStart, input.selectionEnd))).toBe("Glass");
  // Paste: the clipboard's text replaces the selection.
  await page.evaluate(() => navigator.clipboard.writeText("pasted"));
  await page.keyboard.press("Control+V");
  expect(await name.inputValue()).toBe("pasted");
  // IME: a composition is shown and committed as the input event stream says (a CDP composition, then its commit).
  const cdp = await context.newCDPSession(page);
  const events = await page.evaluate(() => { const log = []; const input = document.getElementById("name"); for (const type of ["compositionstart", "compositionupdate", "compositionend"]) input.addEventListener(type, () => log.push(type)); window.__ime = log; return log; });
  await page.keyboard.press("End");
  await cdp.send("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
  expect(await name.inputValue(), "the composition is shown in the field").toBe("pastedか");
  await cdp.send("Input.insertText", { text: "か" });
  expect(await name.inputValue()).toBe("pastedか");
  expect(await page.evaluate(() => window.__ime)).toEqual(expect.arrayContaining(["compositionstart", "compositionend"]));
  void events;
  // The form: the typed value and the read-only input's travel, the output's and the disabled input's do not.
  await page.locator("#submit").click();
  await expect(page.locator("#submitted")).toHaveText(/^name=pasted%E3%81%8B&serial=UG-2026-0042$/);
  // A read-only input takes focus and selection, not typing.
  const serial = page.locator("#serial");
  await serial.click();
  await page.keyboard.type("zzz");
  expect(await serial.inputValue()).toBe("UG-2026-0042");
  await page.keyboard.press("Control+A");
  expect(await serial.evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([0, 12]);
  // An output is not a tab stop and a disabled input takes no focus; Tab runs name, note, serial, then the invalid one, then the plain field.
  await page.locator("#name").focus();
  const order = [];
  for (let step = 0; step < 5; step++) { await page.keyboard.press("Tab"); order.push(await page.evaluate(() => document.activeElement.id)); }
  expect(order).toEqual(["note", "serial", "bad", "plain", "submit"]);
  await expect(page.locator("#locked")).not.toBeFocused();
  expect(await page.locator("#rate").evaluate(output => output.tabIndex)).toBe(-1);
  await context.close();
});

test("a readout is a live region that changes once per write, and driveStrataDisplay bounds a value written at frame rate to one write an interval", async ({ browser }) => {
  const { context, page } = await plain(browser);
  // `<output>` is a status (a polite live region) natively; `aria-live="off"` is the one a fast value asks for.
  await expect(page.locator("#rate")).toHaveRole("status");
  expect(await page.locator("#rate").evaluate(output => output.getAttribute("aria-live"))).toBeNull();
  expect(await page.locator("#level").evaluate(output => output.getAttribute("aria-live"))).toBe("off");
  expect(await page.locator("#rate").evaluate(output => getComputedStyle(output).display)).toBe("flex");
  // One write is one mutation of the live region: text announced once.
  const once = await page.evaluate(async () => {
    const output = document.getElementById("rate"); let records = 0;
    new MutationObserver(list => { records += list.length; }).observe(output, { childList: true, characterData: true, subtree: true });
    window.strataDisplayProbe.write("rate", "59 fps"); await new Promise(resolve => setTimeout(resolve, 50));
    window.strataDisplayProbe.write("rate", "58 fps"); await new Promise(resolve => setTimeout(resolve, 50));
    return { records, text: output.textContent };
  });
  expect(once).toEqual({ records: 2, text: "58 fps" });
  // 60 values over a second: the first at once, then one an interval (100 ms), the last one always shown; the same text again writes nothing.
  const driven = await page.evaluate(async () => {
    const output = document.getElementById("level"); let records = 0;
    new MutationObserver(list => { records += list.length; }).observe(output, { childList: true, characterData: true, subtree: true });
    const begun = performance.now();
    for (let index = 0; index < 60; index++) { window.strataDisplayProbe.drive("level", `${index} dB`); await new Promise(requestAnimationFrame); }
    const seconds = (performance.now() - begun) / 1000;
    await new Promise(resolve => setTimeout(resolve, 150));
    const final = output.textContent, afterFinal = records;
    window.strataDisplayProbe.drive("level", "59 dB"); window.strataDisplayProbe.drive("level", "59 dB");
    await new Promise(resolve => setTimeout(resolve, 150));
    return { seconds, records, final, same: records - afterFinal };
  });
  console.log(`driveStrataDisplay: 60 values in ${driven.seconds.toFixed(2)} s: ${driven.records} writes, shows ${driven.final}; the same text again: ${driven.same} writes`);
  expect(driven.final).toBe("59 dB");
  expect(driven.records, "about one write an interval").toBeLessThanOrEqual(Math.ceil(driven.seconds / 0.1) + 2);
  expect(driven.records).toBeGreaterThanOrEqual(Math.floor(driven.seconds / 0.1) - 1);
  expect(driven.same, "a text the display already shows is not written").toBe(0);
  // Release writes the pending text now.
  const released = await page.evaluate(() => { const output = document.getElementById("level"); window.strataDisplayProbe.drive("level", "1 dB", 5000); window.strataDisplayProbe.drive("level", "2 dB", 5000); const before = output.textContent; window.strataDisplayProbe.release("level"); return [before, output.textContent]; });
  expect(released).toEqual(["59 dB", "2 dB"]);
  await context.close();
});

test("the backlight is lit by default, off when asked, switched off, disabled or under more contrast; the focus ring is the bezel's; the invalid edge is the window's", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const lit = id => page.locator(`#${id}`).evaluate(native => Number(getComputedStyle(native.closest(".ug-display")).getPropertyValue("--strata-lit")));
  expect(Object.fromEntries(await Promise.all(ids.map(async id => [id, await lit(id)])))).toEqual({ name: 1, note: 1, serial: 1, rate: 1, level: 0, locked: 0, bad: 1 });
  await page.evaluate(() => window.strataDisplayProbe.light("name", false));
  expect(await lit("name"), "data-strata-lit=false").toBe(0);
  await page.evaluate(() => window.strataDisplayProbe.light("name", true));
  expect(await lit("name")).toBe(1);
  // The role colours.
  const roles = await page.evaluate(() => Object.fromEntries(["name", "note", "serial", "rate", "bad"].map(id => [id, getComputedStyle(document.getElementById(id).closest(".ug-display")).getPropertyValue("--_c").trim()])));
  const colours = await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return Object.fromEntries(["glow-on", "accent", "info", "success", "danger"].map(name => [name, style.getPropertyValue(`--strata-colour-${name}`).trim()])); });
  expect(roles).toEqual({ name: colours["glow-on"], note: colours.accent, serial: colours.info, rate: colours.success, bad: colours.danger });
  // The window carries a static tint of its role (10% over the field) that a lit state does not change: toggling the light repaints no captured pixel.
  const tint = id => page.locator(`#${id}`).evaluate(native => getComputedStyle(native.closest(".ug-display").querySelector(".ug-display__window")).backgroundColor);
  const before = await tint("name");
  await page.evaluate(() => window.strataDisplayProbe.light("name", false));
  expect(await tint("name"), "the tint is the role's, lit or not").toBe(before);
  const field = await page.evaluate(() => { const probe = document.createElement("i"); probe.style.background = "var(--strata-colour-field)"; document.body.append(probe); const colour = getComputedStyle(probe).backgroundColor; probe.remove(); return colour; });
  expect(channels(await tint("level")), "backlight off: no tint, the plain field").toEqual(channels(field));
  // Under more contrast the backlight is off whatever it was and the window has the text's edge.
  await page.emulateMedia({ contrast: "more" });
  expect(await lit("note"), "more contrast: no backlight").toBe(0);
  expect(await page.locator("#note").evaluate(native => getComputedStyle(native.closest(".ug-display").querySelector(".ug-display__window")).borderTopColor)).toBe(await page.evaluate(() => { const probe = document.createElement("i"); probe.style.color = "var(--strata-colour-text)"; document.body.append(probe); const colour = getComputedStyle(probe).color; probe.remove(); return colour; }));
  await page.emulateMedia({ contrast: "no-preference" });
  // Focus: the keyboard's focus is an accent outline just outside the bezel (inside the box), and the native element has none of its own.
  await page.keyboard.press("Tab");
  await page.locator("#name").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const native = document.getElementById("name"), bezel = native.closest(".ug-display").querySelector(".ug-display__bezel"), style = getComputedStyle(bezel);
    return { own: getComputedStyle(native).outlineStyle, outline: [style.outlineStyle, style.outlineWidth], colour: style.outlineColor, accent: getComputedStyle(document.documentElement).getPropertyValue("--strata-colour-accent").trim() };
  });
  expect(focus.own, "the native element draws no outline").toBe("none");
  expect(focus.outline).toEqual(["solid", "3px"]);
  // The invalid edge is the window's, 2 px in the danger colour.
  expect(await page.locator("#bad").evaluate(native => { const style = getComputedStyle(native.closest(".ug-display").querySelector(".ug-display__window")); return [style.borderTopWidth, style.borderTopStyle]; })).toEqual(["2px", "solid"]);
  await page.screenshot({ path: `${await dir()}/plain-focus.png` });
  await context.close();
});
async function dir() { await mkdir(evidence, { recursive: true }); return evidence; }

for (const width of [390, 320]) test(`at ${width} px the displays reflow without overflow, and a display shrinks to its container`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-display__text")].map(native => { const box = native.getBoundingClientRect(); return { id: native.id, left: box.left, right: box.right, width: box.width, height: box.height }; }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right, `${box.id}: inside the viewport`).toBeLessThanOrEqual(width); expect(box.height).toBeCloseTo(BOX_HEIGHT, 0); }
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, widest display ${Math.max(...layout.boxes.map(box => box.width))} px`);
  await page.screenshot({ path: `${await dir()}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text every line stays inside its window, the window grows with the text, and nothing overflows at 320 px", async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width: 320, height: 900 } });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body", "subtitle"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-display__text")].map(native => {
      const box = native.getBoundingClientRect(), window = native.closest(".ug-display").querySelector(".ug-display__window").getBoundingClientRect(), style = getComputedStyle(native);
      const line = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.3;
      return { id: native.id, height: box.height, windowHeight: window.height, line, fits: window.height >= line, clipped: native.scrollWidth > native.clientWidth + 1 && native.tagName === "OUTPUT", right: box.right };
    }),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  for (const box of layout.boxes) { expect(box.fits, `${box.id}: a ${box.line.toFixed(1)} px line fits the ${box.windowHeight.toFixed(1)} px window`).toBe(true); expect(box.right).toBeLessThanOrEqual(320); }
  expect(Math.max(...layout.boxes.map(box => box.windowHeight)), "the window grows with the text").toBeGreaterThan(34);
  console.log(`200% text: scrollWidth ${layout.scrollWidth}, windows ${Math.min(...layout.boxes.map(box => box.windowHeight)).toFixed(0)}–${Math.max(...layout.boxes.map(box => box.windowHeight)).toFixed(0)} px high`);
  await page.screenshot({ path: `${await dir()}/text-200.png`, fullPage: true });
  await context.close();
});

test("the displays pass axe in light, dark, face mode, forced colours and more contrast, and forced colours draw them", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#display-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("display-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#display-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("display-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const colours = await page.evaluate(() => {
    const parts = id => { const root = document.getElementById(id).closest(".ug-display"); return { bezel: getComputedStyle(root.querySelector(".ug-display__bezel")), window: getComputedStyle(root.querySelector(".ug-display__window")), text: getComputedStyle(document.getElementById(id)) }; };
    const name = parts("name"), locked = parts("locked");
    return { bezel: [name.bezel.borderTopColor, name.bezel.backgroundColor, name.bezel.boxShadow], window: [name.window.borderTopColor, name.window.backgroundColor, name.window.boxShadow], text: name.text.color, locked: [locked.text.color, locked.bezel.borderTopColor] };
  });
  const system = await page.evaluate(() => { const probe = document.createElement("i"); const read = value => { probe.style.color = value; document.body.append(probe); const colour = getComputedStyle(probe).color; probe.remove(); return colour; }; return { canvasText: read("CanvasText"), canvas: read("Canvas"), gray: read("GrayText") }; });
  expect(colours.bezel[0], "a CanvasText bezel edge").toBe(system.canvasText);
  expect(colours.window[1], "a Canvas window").toBe(system.canvas);
  expect([colours.bezel[2], colours.window[2]], "no shadow, no glow").toEqual(["none", "none"]);
  expect(colours.text, "CanvasText text").toBe(system.canvasText);
  expect(colours.locked, "a disabled display is GrayText").toEqual([system.gray, system.gray]);
  const forced = await new AxeBuilder({ page }).include("#display-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const contrast = await new AxeBuilder({ page }).include("#display-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-display.html${query}`);
  await page.waitForFunction(() => window.strataDisplayProbe && window.strataDisplayProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataDisplayProbe.scene() !== undefined);
  await page.evaluate(() => window.strataDisplayProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => window.strataDisplayProbe.state().instrument?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataDisplayProbe.controller.state().mode);
/** GPU on; at Instrument, the layer drawn as parts and nothing stepped down. */
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataDisplayProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name, { wait = 250, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataDisplayProbe.refresh(); await window.strataDisplayProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataDisplayProbe.controller.settle();
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
    if (allowed.some(region => px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) { inside++; if (points && x % 2 === 0 && y % 2 === 0) changed.push([px, py]); }
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples, changed };
}
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id };
  });
}, selector);
/**
 * The text boxes of the inputs (their content boxes, less the 3 px of the glass's bevel at the window's top and bottom, which refracts the
 * face and is not text) and the outputs (their text runs), in frame px.
 */
const textBoxes = page => page.evaluate(() => {
  const frame = document.getElementById("frame").getBoundingClientRect(), boxes = [];
  for (const native of document.querySelectorAll(".ug-display__text")) {
    if (native.tagName === "INPUT") {
      const box = native.getBoundingClientRect(), style = getComputedStyle(native), pad = name => Number.parseFloat(style.getPropertyValue(name)) || 0;
      boxes.push({ id: native.id, x: box.left - frame.left + pad("padding-left"), y: box.top - frame.top + pad("padding-top") + 3, width: box.width - pad("padding-left") - pad("padding-right"), height: box.height - pad("padding-top") - pad("padding-bottom") - 6 });
    } else {
      const range = document.createRange(); range.selectNodeContents(native);
      for (const box of range.getClientRects()) boxes.push({ id: native.id, x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height });
    }
  }
  return boxes;
});
/** Native hits on frame points: how many land on a native display element. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches(".ug-display__text")) mismatches++;
  return { total: points.length, mismatches };
}, points);
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-display__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
const counts = page => page.evaluate(() => window.strataDisplayProbe.counts());
const lightAll = (page, on) => page.evaluate(([ids, on]) => { for (const id of ids) window.strataDisplayProbe.light(id, on); }, [ids, on]);
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
/** What the scene says: its kind, the lights, the protected rects, the faces and the objects with their parts. */
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataDisplayProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const rectOf = element => { const rect = element.getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, feather: scene.feather, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), primitives: scene.primitives,
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => part.kind), materials: object.parts.map(part => part.material), glass: object.parts.map(part => part.glass), finish: object.parts.map(part => part.finish), emitters: object.parts.map(part => part.emitter),
      close: object.bounds.rect.every((value, index) => Math.abs(value - rectOf(document.getElementById(object.id))[index]) < 0.01) })),
    windows: ids_(document).map(id => ({ id, window: rectOf(document.getElementById(id).closest(".ug-display").querySelector(".ug-display__window")), box: rectOf(document.getElementById(id)), colour: getComputedStyle(document.getElementById(id).closest(".ug-display")).getPropertyValue("--_c").trim() })),
    texts: [...document.querySelectorAll("#display-panel *")].flatMap(element => [...element.childNodes].filter(node => node.nodeType === 3 && node.textContent.trim()).flatMap(node => {
      const range = document.createRange(); range.selectNodeContents(node);
      return [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(box => [box.left - panel.left, box.top - panel.top, box.width, box.height]);
    })) };
  function ids_(root) { return [...root.querySelectorAll(".ug-display__text")].map(native => native.id); }
});
const hexLight = hex => { const [r, g, b] = [1, 3, 5].map(at => Number.parseInt(hex.slice(at, at + 2), 16)), top = Math.max(r, g, b, 1); return [r / top, g / top, b / top].map(value => Math.round(value * 1000) / 1000); };
const toHex = css => `#${(css.match(/\d+/g) ?? [0, 0, 0]).slice(0, 3).map(part => Number(part).toString(16).padStart(2, "0")).join("")}`;

for (const dpr of [1, 2]) for (const level of levels) test(`the displays at ${level} (DPR ${dpr}): the scene, the emitters, the guard's rects, containment, hits, the light and the guard`, async ({ browser }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  const total = ids.reduce((sum, id) => sum + displays[id].lights, 0);
  expect(scene.version, "version 4").toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined, "a camera at Objects and Instrument").toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // The backlight's emitters in document order: 3, 3, 3, 2, 1, 3, 3; lit by `--strata-lit`, in the role's colour, along the window's middle.
  expect(scene.emitters).toHaveLength(total);
  let at = 0;
  for (const id of ids) {
    const spec = displays[id], window = scene.windows.find(entry => entry.id === id), mine = scene.emitters.slice(at, at + spec.lights);
    at += spec.lights;
    const [wx, wy, ww, wh] = window.window;
    expect(ww, `${id}: the window is 22 px narrower than the box`).toBeCloseTo(spec.width - 22, 1);
    expect(wh, `${id}: the window is the control's height`).toBeCloseTo(BOX_HEIGHT - 22, 1);
    mine.forEach((emitter, index) => {
      expect(emitter.position[0], `${id} #${index}: along the window`).toBeCloseTo(wx + (ww * (index + 0.5)) / spec.lights, 1);
      expect(emitter.position[1], `${id} #${index}: on its middle`).toBeCloseTo(wy + wh / 2, 1);
      expect(emitter.position[2], `${id} #${index}: 0.5 window heights up`).toBeCloseTo(0.5 * wh, 1);
      expect(emitter.radius, `${id} #${index}: reach 2.5 window heights`).toBeCloseTo(2.5 * wh, 1);
      expect(emitter.reach).toBe("outset");
      const expected = spec.lit ? 2200 * (wh / 36) ** 2 / Math.sqrt(spec.lights) : 0;
      expect(emitter.strength, `${id} #${index}: strength`).toBeCloseTo(expected, 1);
      if (spec.role !== "off") expect(emitter.colour, `${id}: the role's colour`).toEqual(hexLight(window.colour));
    });
  }
  expect(scene.feather).toBe(4);
  // The guard: the content box of every native element (an input's or an output's) and the text runs of every output are protected, and the bezel round them is not.
  expect(Array.isArray(scene.protected)).toBe(true);
  const covers = (rect, box) => rect[0] <= box[0] + 0.5 && rect[1] <= box[1] + 0.5 && rect[0] + rect[2] >= box[0] + box[2] - 0.5 && rect[1] + rect[3] >= box[1] + box[3] - 0.5;
  for (const text of scene.texts) expect(scene.protected.some(rect => covers(rect, text)), `a protected rect covers the text at ${text.map(Math.round)}`).toBe(true);
  const frameOf = await textBoxes(page), panelBox = (await inFrame(page, "#display-panel"))[0];
  for (const box of frameOf) expect(scene.protected.some(rect => covers(rect, [box.x - panelBox.x, box.y - panelBox.y, box.width, box.height])), `${box.id}: its text box is protected`).toBe(true);
  for (const id of ids) {
    const window = scene.windows.find(entry => entry.id === id), [bx, by, bw, bh] = window.box;
    // Inside the box 6 px in from its edge, on the bezel: no protected rect.
    for (const point of [[bx + 6, by + bh / 2], [bx + bw / 2, by + 6], [bx + bw - 6, by + bh / 2]]) {
      expect(scene.protected.some(rect => point[0] >= rect[0] && point[0] <= rect[0] + rect[2] && point[1] >= rect[1] && point[1] <= rect[1] + rect[3]), `${id}: the bezel at ${point.map(Math.round)} is not protected`).toBe(false);
    }
  }
  expect(scene.outset.top, "the emitters' outset").toBeGreaterThanOrEqual(48);
  if (level === "instrument") {
    // The displays, in document order (the submit button is a key beside them).
    const mine = scene.objects.filter(object => ids.includes(object.id));
    expect(mine.map(object => object.id)).toEqual(ids);
    for (const object of mine) {
      expect(object.close, `${object.id}: bounds are the native element's box`).toBe(true);
      expect(object.parts, `${object.id}: parts`).toEqual(["bezel", "window"]);
      expect(object.materials).toEqual(["displayBezel", "displayGlass"]);
      expect(object.glass).toEqual([undefined, "window"]);
      expect(object.finish[1], "no finish zone: text can reach it (design language section 4)").toBeUndefined();
      expect(object.t, "no pose: the emitters light").toBe(0);
    }
    const materials = await page.evaluate(() => Object.keys(window.strataDisplayProbe.scene().materials));
    for (const name of ["displayBezel", "displayGlass"]) expect(materials, name).toContain(name);
    expect(materials.length, "within core's 16 materials").toBeLessThanOrEqual(16);
    // The window stays a flat face under the pane; the bezel is the part.
    expect(scene.faces.filter(face => face === "flat")).toHaveLength(ids.length);
    expect(scene.faces.filter(face => face === "groove")).toHaveLength(0);
  } else {
    expect(scene.faces.filter(face => face === "flat"), "a flat window each").toHaveLength(ids.length);
    // A groove each at Relief; at Objects a slab each, and the panel's own.
    expect(scene.faces.filter(face => face === (level === "relief" ? "groove" : "slab")), level === "relief" ? "a groove each" : "a slab each, and the panel's").toHaveLength(level === "relief" ? ids.length : ids.length + 1);
  }
  await healthy(page, "start", level);
  // The bezel's CSS paint stays at Relief and Objects (it is the face), and is hidden where the GPU draws it as a part.
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-display__bezel")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(level === "instrument" ? ids.length : 0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters (${scene.emitters.filter(emitter => emitter.strength > 0).length} lit), ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // 0 hit mismatches over every box.
  for (const id of ids) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits over the box`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment: every object pixel lies inside a native box, against the same page with the objects hidden, and native hits on those pixels find a display.
  const boxes = await inFrame(page, ".ug-display__text");
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const value of depths) {
    await page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
    const label = value === null ? "0.5" : String(value);
    await objectsHidden(page, true);
    const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-bare`);
    await objectsHidden(page, false);
    const shown = await frame(page, `${level}-dpr${dpr}-depth${label}-shown`);
    const parts = difference(shown, bare, boxes, { points: true });
    expect(parts.inside, `depth ${label}: the objects are drawn`).toBeGreaterThan(1500 * dpr * dpr);
    expect(parts.outside, `depth ${label}: no object pixel outside a box (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
    const hit = await hitsOn(page, parts.changed);
    expect(hit.mismatches, `depth ${label}: native hits on object pixels`).toBe(0);
    console.log(`DPR ${dpr} ${level}: depth ${label}: ${parts.inside} px inside the boxes, ${parts.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
    await healthy(page, `depth ${label}`, level);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));

  // The backlight lights the bezel and the face round the display within the outset, and protected text stays within the guard.
  await lightAll(page, false);
  const off = await frame(page, `${level}-dpr${dpr}-light-off`);
  await lightAll(page, true);
  const on = await frame(page, `${level}-dpr${dpr}-light-on`);
  const lit = boxes.filter(box => displays[box.id].lit);
  // The bezel's top strip (4 to 11 px in from the box's top edge, away from the corners), 5 px above the box and 12 px above it.
  const strip = (box, y) => Array.from({ length: 10 }, (_, step) => gain(off, on, { x: box.x + 24 + (step / 9) * (box.width - 48), y: box.y + y }, dpr));
  const bezelGain = lit.map(box => median(strip(box, 7))), aboveGain = lit.map(box => median(strip(box, -5))), farGain = lit.map(box => median(strip(box, -12)));
  console.log(`DPR ${dpr} ${level}: backlight on against off, median gain of 10 points: bezel ${bezelGain.map(value => value.toFixed(1)).join(" ")}, 5 px above the box ${aboveGain.map(value => value.toFixed(1)).join(" ")}, 12 px above ${farGain.map(value => value.toFixed(1)).join(" ")}`);
  // The bezel's top face takes the light at Relief (the groove's face) and Instrument (the part's shading); at Objects the slab's top is the capture lifted, and only the face round it is lit.
  if (level !== "objects") expect(median(bezelGain), "the bezel is lit").toBeGreaterThan(0.5);
  expect(median(aboveGain), "the face above the box is lit, within the outset").toBeGreaterThan(0.2);
  let worst = 0;
  const perBox = {};
  for (const box of frameOf) { const value = excess(off, on, box, dpr); perBox[box.id] = Math.max(perBox[box.id] ?? 0, value); worst = Math.max(worst, value); }
  console.log(`DPR ${dpr} ${level}: per text box ${JSON.stringify(perBox)}`);
  console.log(`DPR ${dpr} ${level}: ${frameOf.length} text boxes, worst change beyond the guard ${worst} levels`);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  // A dark display (backlight off, disabled) does not light: the same pixels in its box and round it with the others lit or not.
  const dark = boxes.filter(box => !displays[box.id].lit).map(box => ({ x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 }));
  const reach = lit.map(box => ({ x: box.x - 60, y: box.y - 60, width: box.width + 120, height: box.height + 120 }));
  const all = difference(off, on, [...boxes, ...reach]);
  expect(all.outside, `the light changes nothing outside the boxes and its reach (${JSON.stringify(all.outsideSamples)})`).toBe(0);
  void dark;
  await healthy(page, "backlight toggled", level);
  expect(errors).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) the text under the glass is the capture itself: its window is exact, and no pixel of it changes when the backlight is toggled`, async ({ browser }) => {
  test.setTimeout(240000);
  /** One frame of the layer at the Instrument level (with its windows, or without them and without any relief: `bare`), or the DOM's own flat rendering of the same page (`dom`). */
  const shoot = async (kind, light, name) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    let png;
    if (kind === "dom") {
      await page.goto("/ui-display.html?dom");
      await page.waitForFunction(() => window.strataDisplayProbe);
      await page.evaluate(() => { document.getElementById("display-panel").setAttribute("data-strata-mode", "face"); });
      await lightAll(page, light);
      // The GPU's flat faces, as CSS face mode draws them: the glow and the gradients are the GPU's, not the capture's.
      await page.addStyleTag({ content: ".ug-display__window, .ug-display__bezel { background-image: none !important; box-shadow: none !important; }" });
      await page.waitForTimeout(300);
      await mkdir(evidence, { recursive: true });
      png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/instrument-dpr${dpr}-text-${name}.png` }));
    } else {
      await ready(page, `?level=instrument${kind === "bare" ? "&bare=window" : ""}`);
      await lightAll(page, light);
      png = await frame(page, `instrument-dpr${dpr}-text-${name}`, { wait: 700 });
    }
    const boxes = await textBoxes(page);
    const windows = kind === "dom" ? 0 : await page.evaluate(() => window.strataDisplayProbe.scene().objects.filter(object => object.parts[1].kind === "window").length);
    const parts = kind === "dom" ? 0 : await page.evaluate(() => window.strataDisplayProbe.state().instrument.layers[0].drawnParts);
    await context.close();
    return { png, boxes, windows, parts };
  };
  /**
   * Pixels of two frames inside the text boxes: how many differ in any channel, the largest channel difference, how many are dark glyph pixels, and, of the pixels that are
   * plain window in `b` (the DOM's own colour for that window), how many of `a`'s are more than a level from it.
   */
  const compare = (a, b, boxes) => {
    let compared = 0, mismatched = 0, glyphs = 0, max = 0, plain = 0, tinted = 0;
    for (const box of boxes) {
      const x0 = Math.floor(box.x * dpr), x1 = Math.ceil((box.x + box.width) * dpr), y0 = Math.floor(box.y * dpr), y1 = Math.ceil((box.y + box.height) * dpr);
      // The window's own colour in `b`: the pixel just inside the box's top-left corner.
      const corner = ((y0 + 1) * b.width + x0 + 1) * 4, colour = [b.data[corner], b.data[corner + 1], b.data[corner + 2]];
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const index = (y * a.width + x) * 4;
        compared++;
        const diff = Math.max(Math.abs(a.data[index] - b.data[index]), Math.abs(a.data[index + 1] - b.data[index + 1]), Math.abs(a.data[index + 2] - b.data[index + 2]));
        if (diff > 0) mismatched++;
        max = Math.max(max, diff);
        if (b.data[index] < 140) glyphs++;
        if ([0, 1, 2].every(channel => b.data[index + channel] === colour[channel])) { plain++; if ([0, 1, 2].some(channel => Math.abs(a.data[index + channel] - colour[channel]) > 1)) tinted++; }
      }
    }
    return { compared, mismatched, glyphs, max, plain, tinted };
  };
  const glass = await shoot("glass", true, "glass"), dom = await shoot("dom", true, "dom"), bare = await shoot("bare", true, "bare");
  // The scene always has its seven windows and bezels; the reference layer core draws has none of them (fourteen parts fewer).
  expect(glass.windows).toBe(ids.length);
  expect(bare.parts, "the reference layer has no window and no bezel").toBe(glass.parts - 2 * ids.length);
  const exact = compare(glass.png, dom.png, glass.boxes);
  console.log(`instrument DPR ${dpr}: the text under the glass: ${glass.boxes.length} text boxes, ${exact.compared} px compared (${exact.glyphs} dark glyph px): ${exact.plain} window px (the DOM's own colour), ${exact.tinted} of them not exactly that under the glass; ${exact.mismatched} px differ from the DOM's own rendering of the text, by at most ${exact.max} levels`);
  expect(exact.glyphs, "there is text to compare").toBeGreaterThan(300);
  expect(exact.plain, "there is window to compare").toBeGreaterThan(5000);
  expect(exact.tinted, "the window under the glass is the capture's colour, to the level").toBe(0);
  const layer = compare(glass.png, bare.png, glass.boxes);
  console.log(`instrument DPR ${dpr}: against the layer without windows and relief (the capture through the layer pass): ${layer.mismatched} of ${layer.compared} px differ, at most ${layer.max} levels`);
  // With the backlight off, the same pixels as with it on: the light never reaches the text under the glass, 0 mismatched.
  const dark = await shoot("glass", false, "glass-dark");
  const spill = compare(glass.png, dark.png, glass.boxes);
  console.log(`instrument DPR ${dpr}: backlight on against off: ${spill.compared} px of the text boxes compared, ${spill.mismatched} mismatched`);
  expect(spill.mismatched, "the light never reaches the text under the glass").toBe(0);
});

for (const dpr of [1, 2]) for (const level of ["dom", ...levels]) test(`the caret and the selection of an input are visible and placed under the window at ${level} (DPR ${dpr}), measured by pixels`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  if (level === "dom") { await page.goto("/ui-display.html?dom"); await page.waitForFunction(() => window.strataDisplayProbe); } else await ready(page, `?level=${level}`);
  // A red caret and a green selection, so each is a colour the page has nowhere else.
  await page.addStyleTag({ content: "#name { caret-color: #ff0000; } #name::selection { background: #00ff66; color: #000000; }" });
  await page.locator("#name").click();
  await page.keyboard.press("End");
  const geometry = await page.evaluate(() => {
    const input = document.getElementById("name"), style = getComputedStyle(input), frame = document.getElementById("frame").getBoundingClientRect(), box = input.getBoundingClientRect();
    const span = document.createElement("span");
    span.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight};font-style:${style.fontStyle};letter-spacing:${style.letterSpacing};font-variant-numeric:${style.fontVariantNumeric}`;
    span.textContent = input.value.slice(0, input.selectionStart);
    document.body.append(span);
    const width = span.getBoundingClientRect().width;
    span.remove();
    const pad = name => Number.parseFloat(style.getPropertyValue(name));
    return { caret: box.left - frame.left + pad("padding-left") + width - input.scrollLeft, top: box.top - frame.top + pad("padding-top"), bottom: box.bottom - frame.top - pad("padding-bottom"), left: box.left - frame.left, right: box.right - frame.left, boxTop: box.top - frame.top, boxBottom: box.bottom - frame.top, textLeft: box.left - frame.left + pad("padding-left") };
  });
  const grab = async name => {
    if (level !== "dom") await page.evaluate(async () => { window.strataDisplayProbe.refresh(); await window.strataDisplayProbe.controller.settle(); for (let index = 0; index < 2; index++) await new Promise(requestAnimationFrame); });
    await mkdir(evidence, { recursive: true });
    return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/caret-${level}-dpr${dpr}-${name}.png`, caret: "initial" }));
  };
  /** The red pixels in the column band around `x`, within the text's line: their count and mean x (frame px). */
  const redNear = png => {
    let count = 0, sum = 0;
    for (let y = Math.floor(geometry.top * dpr); y < Math.ceil(geometry.bottom * dpr); y++) for (let x = Math.floor((geometry.caret - 5) * dpr); x < Math.ceil((geometry.caret + 5) * dpr); x++) {
      const offset = (y * png.width + x) * 4;
      if (png.data[offset] > 200 && png.data[offset + 1] < 80 && png.data[offset + 2] < 80) { count++; sum += (x + 0.5) / dpr; }
    }
    return { count, x: count ? sum / count : null };
  };
  // The caret blinks: it is visible within a second, at the end of the text.
  let seen;
  for (let attempt = 0; attempt < 14 && !seen; attempt++) { const shot = await grab(`caret-${attempt}`); const red = redNear(shot); if (red.count >= 4) seen = red; else await page.waitForTimeout(120); }
  expect(seen, "the caret is visible under the window").toBeTruthy();
  console.log(`${level} DPR ${dpr}: the caret: ${seen.count} px, mean x ${seen.x.toFixed(2)} against the text's end at ${geometry.caret.toFixed(2)} (frame px)`);
  expect(Math.abs(seen.x - geometry.caret), "the caret is where the text ends").toBeLessThanOrEqual(1.5);
  // At the start of the text too (Home).
  await page.keyboard.press("Home");
  const startAt = geometry.textLeft;
  let atStart;
  for (let attempt = 0; attempt < 14 && !atStart; attempt++) {
    const shot = await grab(`home-${attempt}`);
    let count = 0, sum = 0;
    for (let y = Math.floor(geometry.top * dpr); y < Math.ceil(geometry.bottom * dpr); y++) for (let x = Math.floor((startAt - 4) * dpr); x < Math.ceil((startAt + 4) * dpr); x++) {
      const offset = (y * shot.width + x) * 4;
      if (shot.data[offset] > 200 && shot.data[offset + 1] < 80 && shot.data[offset + 2] < 80) { count++; sum += (x + 0.5) / dpr; }
    }
    if (count >= 4) atStart = { count, x: sum / count }; else await page.waitForTimeout(120);
  }
  expect(atStart, "the caret is visible at the start").toBeTruthy();
  expect(Math.abs(atStart.x - startAt), "the caret is at the start of the text").toBeLessThanOrEqual(1.5);
  // The selection: the whole value selected is a green band over the text, inside the input's content box and nowhere else.
  await page.keyboard.press("Control+A");
  const shot = await grab("selection");
  let inside = 0, outside = 0;
  for (let y = 0; y < shot.height; y++) for (let x = 0; x < shot.width; x++) {
    const offset = (y * shot.width + x) * 4;
    if (!(shot.data[offset] < 90 && shot.data[offset + 1] > 200 && shot.data[offset + 2] > 80 && shot.data[offset + 2] < 160)) continue;
    const px = (x + 0.5) / dpr, py = (y + 0.5) / dpr;
    if (px >= geometry.textLeft - 1 && px <= geometry.right && py >= geometry.top - 1 && py <= geometry.bottom + 1) inside++; else outside++;
  }
  console.log(`${level} DPR ${dpr}: the selection: ${inside} px inside the text's line, ${outside} elsewhere`);
  expect(inside, "the selection is visible under the window").toBeGreaterThan(600 * dpr * dpr);
  expect(outside, "the selection is nowhere but under the text").toBe(0);
  if (level !== "dom") await healthy(page, "caret", level);
  await context.close();
});

for (const dpr of [1, 2]) for (const level of levels) test(`typing at ${level} (DPR ${dpr}) is captured once per text change with no hit-geometry update, and the backlight costs no more than its own attribute`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await healthy(page, "start", level);
  await page.locator("#note").click();
  await page.waitForTimeout(500);
  const delta = async (label, action, wait = 600) => {
    const a = await counts(page); await action(); await page.waitForTimeout(wait); const b = await counts(page);
    const result = { captures: b.captures - a.captures, uploads: b.uploads - a.uploads, geometryUpdates: b.geometryUpdates - a.geometryUpdates };
    console.log(`${level} DPR ${dpr}: ${label}: ${JSON.stringify(result)}`);
    return result;
  };
  // The baseline: a focused input's caret blinks, and the blink is captured (every text field's is: the caret is the browser's, captured with the face).
  const still = await delta("focused, idle", async () => {}, 1200);
  expect(still.captures, "the blink: about two a second").toBeLessThanOrEqual(4);
  expect(still.geometryUpdates).toBe(0);
  const typed = await delta("typing 5 characters, 150 ms apart", async () => { for (const character of "abcde") { await page.keyboard.type(character); await page.waitForTimeout(150); } });
  expect(await page.locator("#note").inputValue()).toBe("abcde");
  // Each keystroke is captured (the first also takes the placeholder away, the last Backspace brings it back), on top of the blink's two a second.
  expect(typed.captures, "one capture per text change").toBeGreaterThanOrEqual(5);
  expect(typed.captures, "and the blink's few beyond them").toBeLessThanOrEqual(5 + 4);
  expect(typed.geometryUpdates, "typing moves no hit geometry").toBe(0);
  const deleted = await delta("deleting them with Backspace", async () => { for (let index = 0; index < 5; index++) { await page.keyboard.press("Backspace"); await page.waitForTimeout(150); } });
  expect(deleted.captures).toBeGreaterThanOrEqual(5);
  expect(deleted.captures, "five changes, the placeholder coming back and the blink").toBeLessThanOrEqual(5 + 5);
  expect(deleted.geometryUpdates).toBe(0);
  // A script's text change with nothing focused is captured exactly once each: no caret, no blink.
  await page.locator("#note").blur();
  await page.waitForTimeout(500);
  const scripted = await delta("five script writes to the value, nothing focused", async () => { for (const text of ["a", "ab", "abc", "abcd", "abcde"]) { await page.evaluate(text => { document.getElementById("note").value = text; }, text); await page.waitForTimeout(150); } });
  expect(scripted.captures, "one capture per text change").toBe(5);
  expect(scripted.uploads).toBe(5);
  expect(scripted.geometryUpdates).toBe(0);
  const unchanged = await delta("the same text written again", () => page.evaluate(() => { document.getElementById("note").value = "abcde"; }));
  expect(unchanged.captures, "no change, no capture").toBe(0);
  // The backlight: a toggle writes one attribute (a DOM write, captured once) and changes only uniforms; the scene's lights follow.
  const lit = () => page.evaluate(() => window.strataDisplayProbe.scene().emitters.map(emitter => emitter.strength > 0));
  const before = await lit();
  const off = await delta("one display's backlight off", () => page.evaluate(() => window.strataDisplayProbe.light("name", false)));
  expect(off.captures, "a toggle is its attribute's write, captured once").toBeLessThanOrEqual(1);
  expect(off.geometryUpdates).toBe(0);
  const after = await lit();
  expect(after.slice(0, 3), "its three lights are off").toEqual([false, false, false]);
  expect(after.slice(3), "the others are as they were").toEqual(before.slice(3));
  const on = await delta("one display's backlight on", () => page.evaluate(() => window.strataDisplayProbe.light("name", true)));
  expect(on.captures).toBeLessThanOrEqual(1);
  expect(on.geometryUpdates).toBe(0);
  expect(await lit()).toEqual(before);
  // Every backlight at once (seven attribute writes in one task): a frame's worth of captures, no more.
  const all = await delta("every backlight off, then on", async () => { await lightAll(page, false); await page.waitForTimeout(300); await lightAll(page, true); });
  expect(all.captures, "seven writes in one task: one capture each way").toBeLessThanOrEqual(2);
  expect(all.geometryUpdates).toBe(0);
  // Idle: 300 frames with the backlight on add no capture, upload or hit-geometry update.
  await page.locator("#note").blur();
  await page.waitForTimeout(500);
  const idle = await delta("300 frames idle, backlight on", () => page.evaluate(async () => { for (let index = 0; index < 300; index++) await new Promise(requestAnimationFrame); }), 100);
  expect(idle).toEqual({ captures: 0, uploads: 0, geometryUpdates: 0 });
  await healthy(page, "typing and toggling", level);
  await context.close();
});

for (const level of levels) test(`a display driven at frame rate at ${level}: its captures are its own writes, one an interval, and GPU stays on`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  const run = await page.evaluate(async () => {
    const probe = window.strataDisplayProbe, frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 8; index++) await frame();
    const start = probe.counts(), begun = performance.now();
    let writes = 0;
    new MutationObserver(records => { writes += records.length; }).observe(document.getElementById("rate"), { childList: true, characterData: true, subtree: true });
    for (let index = 0; index < 300; index++) { probe.drive("rate", `${60 - (index % 7)} fps`, 100); await frame(); }
    await new Promise(resolve => setTimeout(resolve, 200));
    const seconds = (performance.now() - begun) / 1000, end = probe.counts();
    return { seconds, writes, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates };
  });
  console.log(`${level}: 300 frames (${run.seconds.toFixed(1)} s) of a driven readout: ${run.writes} writes, ${run.captures} captures, ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates`);
  expect(run.writes, "one write an interval").toBeLessThanOrEqual(Math.ceil(run.seconds / 0.1) + 2);
  expect(run.captures, "only the writes are captured").toBeLessThanOrEqual(run.writes * 2 + 1);
  expect(run.captures).toBeGreaterThanOrEqual(run.writes - 1);
  expect(run.geometryUpdates).toBe(0);
  await healthy(page, level, level);
  await context.close();
});

test("past 64 emitters a layer the rest are dropped with the diagnostic, and GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
  for (const level of levels) {
    const page = await context.newPage();
    await ready(page, `?level=${level}&many=20`);
    const state = await page.evaluate(() => window.strataDisplayProbe.state());
    const layer = state.emitters.layers[0];
    const litCount = await page.evaluate(() => window.strataDisplayProbe.scene().emitters.filter(emitter => emitter.strength > 0).length);
    console.log(`${level}: ${litCount} lit emitters, ${layer.lit} lit, ${layer.drawn.length} drawn, ${layer.dropped.length} dropped`);
    expect(layer.lit).toBe(litCount);
    expect(litCount).toBeGreaterThan(64);
    expect(layer.drawn, "the budget is 64 a layer").toHaveLength(64);
    expect(layer.dropped.length, "the rest are dropped").toBe(litCount - 64);
    expect(state.mode).toBe("gpu");
    await healthy(page, level, level);
    await page.close();
  }
  await context.close();
});

test("under more contrast the backlight is off and the window prints flat; under reduced transparency the window shows the plain capture", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0), "every emitter is off").toBe(true);
  await page.waitForFunction(() => window.strataDisplayProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataDisplayProbe.refresh());
  scene = await sceneOf(page);
  const object = scene.objects.find(entry => entry.id === "name");
  expect(object.parts, "the bezel stays, the pane is left out").toEqual(["bezel"]);
  expect(scene.emitters.some(emitter => emitter.strength > 0), "the backlight still gives light").toBe(true);
  await page.waitForFunction(() => window.strataDisplayProbe.state().instrument.layers[0].steppedDown.length === 0, null, { timeout: 5000 });
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});

test("the display page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-display.html?dom");
  await page.waitForFunction(() => window.strataDisplayProbe);
  const act = () => page.evaluate(() => { window.strataDisplayProbe.write("rate", "42 fps"); window.strataDisplayProbe.light("name", false); });
  await act();
  const dom = await page.locator("#display-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#display-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('textbox "Name"');
    expect(gpu).toContain('status "Frame rate"');
    await healthy(page, `${level} after writes`, level);
    const { violations } = await new AxeBuilder({ page }).include("#display-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
});

test("a resize, a DPR change and a hidden tab keep GPU on, and the displays stay exact and hit true", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  await healthy(page, "start", "instrument");
  const cdp = await context.newCDPSession(page);
  for (const [width, height, scale] of [[700, 700, 1], [900, 800, 2], [640, 900, 1.5], [900, 800, 1]]) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile: false });
    await page.waitForTimeout(700);
    await page.evaluate(async () => { window.strataDisplayProbe.refresh(); await window.strataDisplayProbe.controller.settle(); });
    await healthy(page, `${width}×${height} at ${scale}`, "instrument");
    for (const id of ids) expect((await hits(page, id, 7)).misses, `${id}: hits after the change to ${width}×${height} at ${scale}`).toEqual([]);
    const scene = await sceneOf(page);
    expect(scene.objects.map(object => object.id).filter(id => ids.includes(id)), "every display is still an object").toEqual(ids);
    expect(scene.objects.every(object => object.close)).toBe(true);
  }
  // A hidden tab: the document's visibility is emulated away and back; GPU is not revoked.
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(500);
  await healthy(page, "hidden", "instrument");
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(300);
  await healthy(page, "visible again", "instrument");
  // A structure change: another display appears, one goes.
  await page.evaluate(() => { const row = document.getElementById("display-row"); const clone = document.getElementById("rate").closest(".field").cloneNode(true); clone.querySelector("output").id = "extra"; clone.querySelector(".field-label").id = "extra-label"; clone.querySelector("output").setAttribute("aria-labelledby", "extra-label"); row.append(clone); document.getElementById("locked").closest(".field").remove(); });
  await page.waitForTimeout(700);
  await page.evaluate(async () => { window.strataDisplayProbe.refresh(); await window.strataDisplayProbe.controller.settle(); });
  await healthy(page, "structure changed", "instrument");
  const after = await sceneOf(page);
  expect(after.objects.map(object => object.id).filter(id => id !== "submit")).toEqual(["name", "note", "serial", "rate", "level", "bad", "extra"]);
  expect((await hits(page, "extra", 7)).misses).toEqual([]);
  await context.close();
});

for (const dpr of [1, 2]) test(`display text meets 4.5:1 through the glass at the Instrument level (DPR ${dpr}), measured on decoded pixels in every theme`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  const luminance = ([r, g, b]) => { const linear = value => { const x = value / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b); };
  const ratio = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
  const results = {};
  for (const theme of ["light", "dark", "contrast", "contrast-dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    await page.waitForTimeout(400);
    const png = await frame(page, `contrast-dpr${dpr}-${theme}`, { wait: 600 });
    const boxes = (await textBoxes(page)).filter(box => ["name", "serial", "rate", "level", "bad"].includes(box.id));
    const worst = [];
    for (const box of boxes) {
      const x0 = Math.floor(box.x * dpr), x1 = Math.ceil((box.x + box.width) * dpr), y0 = Math.floor(box.y * dpr), y1 = Math.ceil((box.y + box.height) * dpr);
      const corner = pixel(png, { x: box.x + 1, y: box.y + 1 }, dpr);
      // The glyph colour furthest from the window's: the text's own, whatever the theme.
      let far = corner, distance = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const at = (y * png.width + x) * 4, value = [png.data[at], png.data[at + 1], png.data[at + 2]], d = Math.abs(luminance(value) - luminance(corner)); if (d > distance) { distance = d; far = value; } }
      worst.push(ratio(far, corner));
    }
    results[theme] = Math.min(...worst);
    expect(results[theme], `${theme}: the text through the glass`).toBeGreaterThanOrEqual(4.5);
  }
  console.log(`instrument DPR ${dpr}: the lowest text contrast through the glass, by theme: ${JSON.stringify(Object.fromEntries(Object.entries(results).map(([theme, value]) => [theme, Math.round(value * 100) / 100])))}`);
  await healthy(page, "themes", "instrument");
  await context.close();
});
