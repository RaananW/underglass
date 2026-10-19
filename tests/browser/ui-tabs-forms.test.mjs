/**
 * Browser suite for the Tabs' rail form (anatomy page `tabs.md`, section 11) on `ui-tabs-forms.html` (`window.strataTabsProbe`): plain contract markup with
 * `@underglass/ui/css` and the plain-DOM behaviour, in a Strata panel, with the rails `#acct`, `#manual` (manual activation) and `#side` (vertical) and the
 * flat `#flat`, each of Profile, Security, Billing (disabled) and Alerts (the vertical and the flat ones start elsewhere).
 * - Plain DOM: the WAI-ARIA Tabs pattern is unchanged (the accessibility snapshot of the forms page equals the flush page's; a click selects; the arrow keys,
 *   Home and End move and select, wrapping and skipping the disabled tab; manual activation waits for Enter; the vertical rail uses Up and Down; Tab goes
 *   from the selected key into its panel; `strata-tab-change` reports each change); the selected key is latched (its cap down, its LED lit) and only that one.
 * - Touch (390 px) and 320 px: no horizontal overflow, targets of at least 24 px, a tap selects; 200% text.
 * - Preferences: axe in light, dark, face mode, forced colours and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is the documented one (a plinth and a key per tab, an LED emitter per tab, lit
 *   for the selected ones); the parts change pixels only inside their tabs' boxes (LEDs off), the lights only within their reach; native hits are the DOM's; a
 *   selection changes pixels in its Tabs' box and the LED's reach only, with its captures counted; at the Instrument level the key's travel and the LED's light
 *   are uniform updates (0 captures in the frames of the throw), and 40 held frames of a key are 0 captures, 0 uploads and 0 hit-geometry updates; the LED's
 *   light keeps the labels within the guard.
 * - The accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page; flush on the GPU is the scene of before.
 * Screenshots go to the `ui-tabs-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-tabs-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

/** Each tab of a Tabs (by its id base): selected, in the tab order, and whether its panel shows; and its LED's `--strata-lit` and its key's `--strata-push-t`. */
const state = (page, base) => page.evaluate(base => [...document.querySelectorAll(`[id^="${base}-tab-"]`)].map(tab => {
  const panel = document.getElementById(tab.getAttribute("aria-controls")), led = tab.querySelector(".ug-tab__led");
  return `${tab.id.slice(base.length + 5)}:${tab.getAttribute("aria-selected") === "true" ? "selected" : "-"}:${tab.tabIndex}:${panel.hidden ? "hidden" : "shown"}${led ? `:${getComputedStyle(led).getPropertyValue("--strata-lit").trim()}:${getComputedStyle(tab).getPropertyValue("--strata-push-t").trim()}` : ""}`;
}), base);
const focused = page => page.evaluate(() => document.activeElement?.id ?? "");
const changes = page => page.evaluate(() => { const list = window.strataTabsProbe.changes(); window.strataTabsProbe.clearChanges(); return list; });

async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 1100 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-tabs-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataTabsProbe);
  return { context, page, errors };
}

test("the Tabs pattern is unchanged: the accessibility snapshot of every rail equals the flush page's, and the form's parts are hidden from assistive technology", async ({ browser }) => {
  const forms = await plain(browser, { reducedMotion: "reduce" });
  const flush = await plain(browser, { reducedMotion: "reduce" }, "&flush");
  const snapshot = page => page.locator("#tf-panel").ariaSnapshot();
  const formed = await snapshot(forms.page), flat = await snapshot(flush.page);
  expect(formed, "the accessibility snapshot of the rails is the flush one").toBe(flat);
  expect(formed).toContain('tablist "Account"');
  expect(formed).toContain('tab "Profile" [selected]');
  expect(await forms.page.evaluate(() => ({
    parts: [...document.querySelectorAll(".ug-tab__led")].every(element => element.getAttribute("aria-hidden") === "true"),
    names: [...document.querySelectorAll("#acct [role=tab]")].map(tab => tab.textContent.trim()),
    forms: [...document.querySelectorAll(".ug-tabs")].map(root => root.dataset.strataForm ?? null),
    plinths: [...document.querySelectorAll(".ug-tabs__list")].map(list => list.getAttribute("data-strata-face")),
  }))).toEqual({ parts: true, names: ["Profile", "Security", "Billing", "Alerts"], forms: ["rail", "rail", "rail", null], plinths: ["raised", "raised", "raised", null] });
  expect(forms.errors).toEqual([]);
  await forms.context.close();
  await flush.context.close();
});

test("a click selects a key and lights its LED, the arrows move and select skipping the disabled tab, manual activation waits for Enter, the vertical rail uses Up and Down, and Tab moves into the panel", async ({ browser }) => {
  const { context, page, errors } = await plain(browser, { reducedMotion: "reduce" });
  // Latched: the selected key is at 0.45 of the throw with its LED lit, the others at rest and dark.
  expect(await state(page, "acct")).toEqual(["profile:selected:0:shown:1:0.45", "security:-:-1:hidden:0:0", "billing:-:-1:hidden:0:0", "alerts:-:-1:hidden:0:0"]);
  await page.getByRole("tab", { name: "Security" }).first().click();
  expect(await state(page, "acct")).toEqual(["profile:-:-1:hidden:0:0", "security:selected:0:shown:1:0.45", "billing:-:-1:hidden:0:0", "alerts:-:-1:hidden:0:0"]);
  await expect(page.getByRole("tabpanel", { name: "Security" }).first()).toHaveText("Your password and two-step sign-in.");
  expect(await changes(page)).toEqual(["acct-tab-security"]);
  // The disabled tab cannot be clicked; the selected one clicked again changes nothing.
  await page.getByRole("tab", { name: "Billing" }).first().click({ force: true });
  await page.getByRole("tab", { name: "Security" }).first().click();
  expect(await changes(page)).toEqual([]);
  // A click on the LED, inside the tab's box, reaches the tab.
  const led = await page.locator("#acct-tab-alerts .ug-tab__led").boundingBox();
  await page.mouse.click(...centre(led));
  expect((await state(page, "acct"))[3]).toBe("alerts:selected:0:shown:1:0.45");
  // Arrow keys move and select, wrapping and skipping Billing; Home and End.
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("acct-tab-profile");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("acct-tab-security");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page), "Billing is disabled").toBe("acct-tab-alerts");
  await page.keyboard.press("Home");
  expect(await focused(page)).toBe("acct-tab-profile");
  await page.keyboard.press("End");
  expect(await focused(page)).toBe("acct-tab-alerts");
  expect((await state(page, "acct")).filter(entry => entry.includes("selected")).length).toBe(1);
  // Tab moves from the selected key into its panel.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("acct-panel-alerts");
  // Manual activation: the arrows only move focus until Enter (or Space).
  await page.locator("#manual-tab-profile").focus();
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("manual-tab-security");
  expect((await state(page, "manual"))[0]).toBe("profile:selected:0:shown:1:0.45");
  await page.keyboard.press("Enter");
  expect((await state(page, "manual"))[1]).toBe("security:selected:0:shown:1:0.45");
  // Vertical: Up and Down.
  await page.locator("#side-tab-security").focus();
  await page.keyboard.press("ArrowDown");
  expect(await focused(page), "Billing is disabled: Down skips it").toBe("side-tab-alerts");
  await page.keyboard.press("ArrowUp");
  expect(await focused(page)).toBe("side-tab-security");
  // A held key goes all the way down (1) while the pointer is on it, and back to its place.
  const box = await page.locator("#acct-tab-security").boundingBox();
  await page.mouse.move(...centre(box));
  await page.mouse.down();
  expect((await page.evaluate(() => getComputedStyle(document.getElementById("acct-tab-security")).getPropertyValue("--strata-push-t").trim())), "held: all the way down").toBe("1");
  await page.mouse.up();
  expect(errors).toEqual([]);
  await context.close();
});

for (const width of [390, 320]) test(`at ${width} px the rails reflow without overflow, a tap selects, and at 200% text nothing is lost`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 900 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, reducedMotion: "reduce" });
  const measure = () => page.evaluate(width => ({ scrollWidth: document.documentElement.scrollWidth,
    boxes: [...document.querySelectorAll(".ug-tabs, .ug-tabs__list, .ug-tabs__panel, .ug-panel")].map(element => { const box = element.getBoundingClientRect(); return { id: element.id || element.className, left: box.left, right: box.right }; }),
    targets: [...document.querySelectorAll(".ug-tab")].map(tab => { const box = tab.getBoundingClientRect(); return [tab.id, box.width, box.height]; }),
    overflowing: [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > width + 0.5 && element.getBoundingClientRect().width > 0).slice(0, 6).map(element => `${element.tagName}.${element.className}#${element.id} ${Math.round(element.getBoundingClientRect().right)}`),
    clipped: [...document.querySelectorAll(".ug-tab__label")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.textContent) }), width);
  let layout = await measure();
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.boxes) { expect(box.left, box.id).toBeGreaterThanOrEqual(-0.5); expect(box.right, box.id).toBeLessThanOrEqual(width + 0.5); }
  for (const [id, w, h] of layout.targets) { expect(w, `${id}: width`).toBeGreaterThanOrEqual(24); expect(h, `${id}: height`).toBeGreaterThanOrEqual(24); }
  expect(layout.clipped).toEqual([]);
  await page.locator("#acct-tab-security").scrollIntoViewIfNeeded();
  await page.touchscreen.tap(...centre(await page.locator("#acct-tab-security").boundingBox()));
  expect((await state(page, "acct"))[1]).toBe("security:selected:0:shown:1:0.45");
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
    document.querySelectorAll(".ug-tab__cap").forEach(cap => { cap.style.fontSize = `${parseFloat(getComputedStyle(cap).fontSize) * 2}px`; });
  });
  layout = await measure();
  expect(layout.scrollWidth, `200% text: no horizontal scrolling (${JSON.stringify(layout.overflowing)})`).toBeLessThanOrEqual(width);
  for (const box of layout.boxes) expect(box.right, `200%: ${box.id}`).toBeLessThanOrEqual(width + 0.5);
  expect(layout.clipped).toEqual([]);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, ${layout.boxes.length} boxes inside, ${layout.targets.length} tab targets at least 24 px, 200% text whole`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("the rails pass axe in light, dark, face mode, forced colours and more contrast, and forced colours and more contrast draw them", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#tf-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("tf-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#tf-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("tf-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await page.evaluate(() => ({ plinth: getComputedStyle(document.querySelector("#acct .ug-tabs__list")).borderTopWidth, cap: getComputedStyle(document.querySelector("#acct-tab-profile .ug-tab__cap")).backgroundColor,
    other: getComputedStyle(document.querySelector("#acct-tab-security .ug-tab__cap")).backgroundColor, led: getComputedStyle(document.querySelector("#acct-tab-profile .ug-tab__led")).backgroundColor, shadow: getComputedStyle(document.querySelector("#acct-tab-profile .ug-tab__cap")).boxShadow }));
  expect(forced.plinth).toBe("1px");
  expect(forced.cap, "the selected key is Highlight, the others ButtonFace").not.toBe(forced.other);
  expect(forced.led).toMatch(/^rgb\(/);
  expect(forced.shadow, "no shadow").toBe("none");
  const forcedResult = await new AxeBuilder({ page }).include("#tf-panel").withTags(tags).analyze();
  expect(summary(forcedResult.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const bar = await page.evaluate(() => getComputedStyle(document.querySelector("#acct-tab-profile .ug-tab__cap")).borderBottomWidth);
  expect(bar, "more contrast: a bar under the selected key's label").toBe("3px");
  const contrast = await new AxeBuilder({ page }).include("#tf-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-tabs-forms.html${query}`);
  await page.waitForFunction(() => window.strataTabsProbe && window.strataTabsProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataTabsProbe.scene() !== undefined);
  await page.evaluate(() => window.strataTabsProbe.controller.settle());
  if (query.includes("level=instrument")) await built(page);
}
/** At the Instrument level: every instrument layer built (not pending), so its parts are drawn. */
const built = page => page.waitForFunction(() => {
  const instrument = window.strataTabsProbe.state()?.instrument;
  return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
}, null, { timeout: 30000 });
const mode = page => page.evaluate(() => window.strataTabsProbe.controller.state().mode);
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const layers = await page.evaluate(() => window.strataTabsProbe.state().instrument.layers);
  for (const layer of layers) {
    expect(layer.status, `${label}: ${layer.id} is drawn as parts`).toBe("ready");
    expect(layer.steppedDown, `${label}: ${layer.id}: nothing is stepped down to Relief`).toEqual([]);
  }
}
/** The `#frame` decoded, after the CSS transitions, the scene and the GPU have caught up. */
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    const probe = window.strataTabsProbe;
    await new Promise(resolve => setTimeout(resolve, wait));
    for (let attempt = 0; attempt < 60 && document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"); attempt++) await new Promise(requestAnimationFrame);
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
  return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.id || element.className };
}), selector);
const grow = (box, by) => ({ ...box, x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by });
const counts = page => page.evaluate(() => window.strataTabsProbe.counts());
/** The largest change of any channel inside `rect` beyond `1 ± m` times the reference (8-bit levels). */
function excess(reference, changed, rect, dpr, m = 0.04) {
  let worst = 0;
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * reference.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) { const value = reference.data[offset + channel], next = changed.data[offset + channel]; worst = Math.max(worst, next - value * (1 + m), value * (1 - m) - next); }
  }
  return Math.round(worst * 100) / 100;
}
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataTabsProbe, scene = probe.scene();
  return { version: scene.version, kind: scene.kind, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), bounds: object.bounds })) };
});
/** The LEDs dark (an inline `--strata-lit`), or as the tabs have them. */
const ledsOff = (page, off) => page.evaluate(off => { for (const led of document.querySelectorAll(".ug-tab__led")) { if (off) led.style.setProperty("--strata-lit", "0"); else led.style.removeProperty("--strata-lit"); } }, off);
/** The form's parts taken away (their `data-strata-face`), or put back: the caps and the LEDs, or the plinths (the tablists). */
const faces = (page, away, what = ".ug-tab__cap, .ug-tab__led") => page.evaluate(([away, what]) => {
  for (const element of document.querySelectorAll(what.split(",").map(part => `.ug-tabs[data-strata-form] ${part.trim()}`).join(", "))) {
    if (away) { element.setAttribute("data-strata-was", element.getAttribute("data-strata-face")); element.removeAttribute("data-strata-face"); }
    else if (element.hasAttribute("data-strata-was")) { element.setAttribute("data-strata-face", element.getAttribute("data-strata-was")); element.removeAttribute("data-strata-was"); }
  }
}, [away, what]);

for (const dpr of [1, 2]) for (const level of levels) test(`the Tabs rails at ${level} (DPR ${dpr}): the scene, the parts and their boxes, containment, the lights, hits, a selection's pixels and captures`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-tabs-forms.html?dom");
  await page.waitForFunction(() => window.strataTabsProbe);
  const hitGrid = () => page.evaluate(() => {
    const panel = document.getElementById("tf-panel").getBoundingClientRect(), out = [];
    for (let y = panel.top + 3; y < panel.bottom - 3; y += 6) for (let x = panel.left + 3; x < panel.right - 3; x += 6) { const hit = document.elementFromPoint(x, y); const control = hit?.closest("button, [role=tabpanel]") ?? hit; out.push(hit && document.getElementById("tf-panel").contains(hit) ? `${control.tagName}#${control.id}` : "outside"); }
    return out;
  });
  const domHits = await hitGrid();
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version, "a version 4 scene: it has lights").toBe(4);
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  // The lights: an LED emitter per rail tab (12), lit for the three selected ones.
  expect(scene.emitters.length, "one emitter per rail tab").toBe(12);
  expect(scene.emitters.filter(emitter => emitter.strength > 0).length, "the selected tabs' LEDs are lit").toBe(3);
  if (level === "instrument") {
    const ids = scene.objects.map(object => object.id);
    expect(ids.filter(id => /^rail/.test(id)).length, "a plinth per rail").toBe(3);
    expect(ids, "a key per rail tab").toEqual(expect.arrayContaining(["acct-tab-profile", "acct-tab-alerts", "manual-tab-security", "side-tab-billing"]));
    expect(scene.objects.filter(object => object.parts.some(part => /^bezel:pushBezel/.test(part))).length).toBe(3);
    const key = scene.objects.find(object => object.id === "acct-tab-profile");
    expect(key.parts.map(part => part.split(":")[0]), "a body, the captured cap and the LED lens").toEqual(["plinth", "cap", "lens"]);
    expect(key.t, "the selected key is latched at 0.45").toBeCloseTo(0.45, 2);
    expect(scene.objects.find(object => object.id === "acct-tab-security").t, "the others rest").toBe(0);
    expect(scene.objects.filter(object => /-tab-/.test(object.id)).length, "twelve keys").toBe(12);
  } else if (level === "objects") {
    expect(scene.faces.filter(face => face === "key").length, "a key per cap").toBe(12);
    expect(scene.faces.filter(face => face === "slab").length, "the panel and a slab per plinth").toBeGreaterThanOrEqual(4);
    expect(scene.faces.filter(face => face === "knob").length, "a dome per LED").toBe(12);
  } else {
    expect(scene.faces.filter(face => face === "ring").length, "a ring per LED").toBe(12);
  }
  await healthy(page, "start", level);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters (${scene.emitters.filter(emitter => emitter.strength > 0).length} lit), ${scene.protected.length} protected rects, outset ${scene.outset.top}, ${scene.faces.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // The same native hits as the DOM, everywhere on the panel.
  const gpuHits = await hitGrid();
  expect(gpuHits.length).toBe(domHits.length);
  expect(domHits.filter(hit => /^BUTTON#.*-tab-/.test(hit)).length, "the grid reaches the tabs").toBeGreaterThan(60);
  expect(gpuHits.filter((hit, index) => domHits[index] !== "outside" && hit !== domHits[index]), "native hits are the DOM's").toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${domHits.filter(hit => hit !== "outside").length} native hits on the panel, 0 differ from the DOM's`);

  // Containment: the parts' pixels (LEDs dark) lie inside the tablists and the tabs' boxes, against the same page with the form's faces taken away.
  await ready(page, `?level=${level}`);
  const boxes = [...await inFrame(page, ".ug-tabs[data-strata-form] .ug-tabs__list"), ...await inFrame(page, ".ug-tabs[data-strata-form] .ug-tab")];
  await ledsOff(page, true);
  await faces(page, true);
  const bare = await frame(page, `${level}-dpr${dpr}-bare`);
  await faces(page, false);
  const shown = await frame(page, `${level}-dpr${dpr}-parts`);
  const parts = difference(shown, bare, boxes, { points: true });
  expect(parts.inside, "the parts are drawn").toBeGreaterThan(2500 * dpr * dpr);
  expect(parts.outside, `no part pixel outside a tab (${JSON.stringify(parts.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: keys and LEDs: ${parts.inside} px inside the tabs' boxes, ${parts.outside} outside`);
  // The plinths: a raised face or a slab at Relief and Objects (its shadow is the slab's, as a ButtonGroup's is, so it falls outside the tablist's box); at the Instrument
  // level one part with no shadow of its own, so no pixel of it is outside the tablist's box.
  if (level === "instrument") {
    await faces(page, true, ".ug-tabs__list");
    const noPlinth = await frame(page, `${level}-dpr${dpr}-no-plinth`);
    await faces(page, false, ".ug-tabs__list");
    const withPlinth = await frame(page, `${level}-dpr${dpr}-plinth`);
    // The CSS paint of a tablist (the frame without the plinth part) antialiases up to a pixel round its box: that pixel is the margin.
    const plinth = difference(withPlinth, noPlinth, (await inFrame(page, ".ug-tabs[data-strata-form] .ug-tabs__list")).map(box => grow(box, 1)));
    expect(plinth.inside, "the plinths are drawn").toBeGreaterThan(1500 * dpr * dpr);
    expect(plinth.outside, `no plinth pixel outside its tablist (${JSON.stringify(plinth.outsideSamples)})`).toBe(0);
    console.log(`DPR ${dpr} ${level}: plinths: ${plinth.inside} px inside the tablists, ${plinth.outside} outside`);
  }
  await healthy(page, "parts", level);

  // The lights: the LEDs lit against dark change pixels only within the emitters' reach, and the labels keep the guard.
  const dark = await frame(page, `${level}-dpr${dpr}-led-off`);
  await ledsOff(page, false);
  const lit = await frame(page, `${level}-dpr${dpr}-led-on`);
  const reach = scene.outset.top, tabs = await inFrame(page, ".ug-tabs[data-strata-form] .ug-tab");
  const lights = difference(dark, lit, tabs.map(box => grow(box, reach)));
  expect(lights.inside, "a lit LED lights its key, the plinth and the face round it").toBeGreaterThan(40 * dpr * dpr);
  expect(lights.outside, `no light beyond the emitters' reach of ${reach} px (${JSON.stringify(lights.outsideSamples)})`).toBe(0);
  let worst = 0;
  for (const box of await inFrame(page, ".ug-tabs[data-strata-form] .ug-tab__label")) worst = Math.max(worst, excess(dark, lit, box, dpr));
  console.log(`DPR ${dpr} ${level}: LEDs: ${lights.inside} px within reach ${reach}, ${lights.outside} beyond; worst change of a label beyond the guard ${worst} levels`);
  expect(worst, "the labels stay within the guard").toBeLessThanOrEqual(2);
  await healthy(page, "lights", level);

  // A selection: the key goes down and its LED lights, the panel changes: the Tabs' box and the LED's reach only. Captures are counted.
  await ready(page, `?level=${level}`);
  const [acct] = await inFrame(page, "#acct-tab-profile"), [root] = await inFrame(page, ".ug-tabs:has(#acct-tab-profile)");
  void acct;
  const before = await frame(page, `${level}-dpr${dpr}-select-before`);
  const start = await counts(page);
  await page.locator("#acct-tab-security").click();
  await page.mouse.move(2, 2);
  const after = await frame(page, `${level}-dpr${dpr}-select-after`, { wait: 500 });
  const end = await counts(page);
  const change = difference(before, after, [grow(root, reach)]);
  expect(change.inside, "the keys, the LEDs and the panel changed").toBeGreaterThan(300 * dpr * dpr);
  expect(change.outside, `nothing outside the Tabs and the lights' reach changes (${JSON.stringify(change.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: a selection: ${change.inside} px in the Tabs' box and reach, ${change.outside} outside; ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.geometryUpdates - start.geometryUpdates} hit-geometry updates`);
  expect(end.mode).toBe("gpu");
  await healthy(page, "select", level);

  if (level === "instrument") {
    // The throw and the light are uniform updates: the frames of a key's travel and an LED's turning on add no capture, upload or hit-geometry update.
    const run = await page.evaluate(async () => {
      const probe = window.strataTabsProbe, next = () => new Promise(requestAnimationFrame), ids = ["acct-tab-profile", "acct-tab-security", "acct-tab-alerts"];
      for (let index = 0; index < 5; index++) await next();
      const first = probe.counts();
      let extra = 0, previous = first, selections = 0, moved = 0, last = probe.scene().objects.find(object => object.id === "acct-tab-security").t;
      for (let index = 0; index < 90; index++) {
        if (index % 30 === 0) { document.getElementById(ids[(index / 30) % 3]).click(); selections++; }
        await next();
        const now = probe.counts(), t = probe.scene().objects.find(object => object.id === "acct-tab-security").t;
        if (index % 30 > 1) extra += now.captures - previous.captures;
        if (t !== last) moved++;
        last = t; previous = now;
      }
      const end = probe.counts();
      return { selections, moved, extra, captures: end.captures - first.captures, uploads: end.uploads - first.uploads, geometryUpdates: end.geometryUpdates - first.geometryUpdates };
    });
    console.log(`DPR ${dpr} ${level}: 90 frames, ${run.selections} selections, ${run.moved} frames of a key moving, ${run.captures} captures (${run.extra} in the frames of the throw), ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates`);
    expect(run.moved, "a key travels over frames").toBeGreaterThan(10);
    expect(run.extra, "the frames of the throw cause no capture").toBe(0);
    expect(run.geometryUpdates, "no hit-geometry update").toBe(0);
    // A key held for 40 frames: its travel is a uniform write.
    const box = await page.locator("#acct-tab-security").boundingBox();
    await page.mouse.move(...centre(box));
    await page.mouse.down();
    await page.waitForTimeout(600);
    const held = await page.evaluate(async () => {
      const probe = window.strataTabsProbe, next = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 4; index++) await next();
      const first = probe.counts();
      for (let index = 0; index < 40; index++) await next();
      const last = probe.counts();
      return { captures: last.captures - first.captures, uploads: last.uploads - first.uploads, geometryUpdates: last.geometryUpdates - first.geometryUpdates };
    });
    await page.mouse.up();
    console.log(`DPR ${dpr} ${level}: key held 40 frames: ${held.captures} captures, ${held.uploads} uploads, ${held.geometryUpdates} hit-geometry updates`);
    expect(held, "40 held frames: no capture, no upload, no hit-geometry update").toEqual({ captures: 0, uploads: 0, geometryUpdates: 0 });
    await healthy(page, "held", level);
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("the accessibility snapshot is the same in DOM and GPU modes at every level, and axe passes on the GPU page", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-tabs-forms.html?dom");
  await page.waitForFunction(() => window.strataTabsProbe);
  const act = async () => { await page.locator("#acct-tab-profile").click(); await page.keyboard.press("ArrowRight"); await page.locator("#manual-tab-profile").focus(); await page.keyboard.press("ArrowRight"); };
  await act();
  const dom = await page.locator("#tf-panel").ariaSnapshot();
  expect(dom).toContain('tablist "Account"');
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    expect(await page.locator("#tf-panel").ariaSnapshot(), level).toBe(dom);
    await healthy(page, level, level);
    const { violations } = await new AxeBuilder({ page }).include("#tf-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
  await context.close();
});

test("flush on the GPU is the scene of before: no plinth, no key, no LED, a groove and indicators, GPU stays on", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  for (const level of levels) {
    await ready(page, `?flush&level=${level}`);
    const scene = await sceneOf(page);
    expect(scene.emitters, `${level}: no lights`).toBeUndefined();
    if (level === "instrument") expect(scene.objects ?? [], "no object: the flat tabs are Relief faces").toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll(".ug-tab__led, .ug-tab__cap, .ug-tabs[data-strata-form]").length)).toBe(0);
    await healthy(page, `flush ${level}`, level);
  }
  await context.close();
});
