/**
 * Browser suite for the Switch's hardware forms (anatomy page `switch.md`, *Forms*) on `ui-switch-forms.html`
 * (`window.strataSwitchProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM behaviour
 * (`attachStrata`), in a Strata panel. Each form (slide, rocker, bat, wall) off and on, the Strata switch and a
 * disabled bat.
 * - Plain DOM (`?plain`), real input: a click anywhere on the box throws it (centre, corners, the drawn moving part); a
 *   drag past centre throws it, inside the box and past its edge; a drag held short of centre leaves it, with no
 *   event; Space throws it and Enter does not; the label throws it; each throw fires one `input` and one `change`;
 *   a grid of `elementFromPoint` over every box finds the input; the snap moves `--strata-switch-t` through
 *   in-between values on the form's spring; a disabled switch stays.
 * - Touch (390 px): taps and touch drags past centre throw it, a held touch drag does not, and the page never scrolls.
 * - 320 and 390 px: no horizontal overflow, every box at least 24 × 24, labels unclipped.
 * - Preferences: axe in light, dark and face mode; forced colours draw every part (decoded pixels) and pass axe; more
 *   contrast inks the slot; reduced motion snaps at once.
 * - GPU at Relief and Objects: GPU stays on; each form's parts are the documented primitives; 0 hit mismatches over
 *   every box at DPR 1 and 2; pixels change after every throw, only inside the boxes; every pixel the objects draw
 *   (faces and shadows, against the objects hidden) lies inside their boxes at nine poses along the throw and in
 *   frames of a real throw in flight; the accessibility snapshot is the same in DOM and GPU modes; axe on the GPU page.
 * Screenshots go to the `ui-switch-forms` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-switch-forms");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const forms = ["slide", "rocker", "bat", "wall"];
const formIds = forms.flatMap(form => [`${form}-off`, `${form}-on`]);
const boxes = { slide: [64, 28], rocker: [54, 70], bat: [48, 92], wall: [66, 92] };

const checked = (page, id) => page.locator(`#${id}`).evaluate(input => input.checked);
const events = page => page.evaluate(() => window.strataSwitchProbe.events());
const clear = page => page.evaluate(() => window.strataSwitchProbe.clearEvents());
async function drag(page, [x, y], [x1, y1], { steps = 10 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps });
  await page.mouse.up();
}
/** A drag along a form's throw: from its own stop's side to `to` (a fraction of the box along the throw, 0 off, 1 on). */
function along(form, box, from, to) {
  const at = fraction => form === "slide" ? [box.x + fraction * box.width, box.y + box.height / 2] : [box.x + box.width / 2, box.y + (1 - fraction) * box.height];
  return [at(from), at(to)];
}
/** One throw's events: exactly one `input` and one `change` for `id`, with its new state. */
const one = (id, state) => [{ id, type: "input", checked: state }, { id, type: "change", checked: state }];
/** elementFromPoint over a grid on a box (inset 0.5 px): every hit must be the input. */
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

test("each form throws on a click anywhere, a drag past centre, Space and its label, and holds a drag short of centre", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-switch-forms.html?plain");
  await page.waitForFunction(() => window.strataSwitchProbe);
  for (const form of forms) {
    const id = `${form}-off`, input = page.locator(`#${id}`);
    await expect(input).toHaveRole("switch");
    await expect(page.getByRole("switch", { name: { slide: "Bypass", rocker: "Power", bat: "Arm", wall: "Hall" }[form] })).toHaveCount(1);
    const box = await input.boundingBox();
    expect([Math.round(box.width), Math.round(box.height)], `${form}: the box`).toEqual(boxes[form]);
    // A click anywhere on the box: its centre, its four corners (3 px in) and the drawn moving part.
    const part = await page.locator(`#${id} ~ .ug-switch__object`).locator(".ug-switch__block, .ug-switch__facet--off, .ug-switch__ball, .ug-switch__facet--off").first().boundingBox();
    const points = [[box.x + box.width / 2, box.y + box.height / 2], [box.x + 3, box.y + 3], [box.x + box.width - 3, box.y + 3], [box.x + 3, box.y + box.height - 3],
      [box.x + box.width - 3, box.y + box.height - 3], [part.x + part.width / 2, part.y + part.height / 2]];
    let state = false;
    for (const point of points) {
      await clear(page);
      await page.mouse.click(...point);
      state = !state;
      expect(await checked(page, id), `${form}: a click at ${point.map(Math.round)}`).toBe(state);
      expect(await events(page)).toEqual(one(id, state));
    }
    expect(state).toBe(false);
    // A drag past centre throws it: from the off side to the on side, then back past the box's edge.
    await clear(page);
    await drag(page, ...along(form, box, 0.15, 0.85));
    expect(await checked(page, id), `${form}: drag past centre`).toBe(true);
    expect(await events(page)).toEqual(one(id, true));
    await clear(page);
    await drag(page, ...along(form, box, 0.8, -0.3));
    expect(await checked(page, id), `${form}: drag past centre and out of the box`).toBe(false);
    expect(await events(page)).toEqual(one(id, false));
    // A drag held short of centre leaves it where it was, with no event.
    await clear(page);
    await drag(page, ...along(form, box, 0.1, 0.4));
    expect(await checked(page, id), `${form}: drag held short of centre`).toBe(false);
    expect(await events(page)).toEqual([]);
    // Keys: Space throws it; Enter does not, as on the native checkbox.
    await input.focus();
    await page.keyboard.press("Space");
    expect(await checked(page, id), `${form}: Space`).toBe(true);
    await page.keyboard.press("Enter");
    expect(await checked(page, id), `${form}: Enter`).toBe(true);
    // The label throws it.
    await clear(page);
    await page.locator(`#${id} ~ .ug-switch__label`).click();
    expect(await checked(page, id), `${form}: the label`).toBe(false);
    expect(await events(page)).toEqual(one(id, false));
    // Every point of the box is the input.
    const grid = await hits(page, id);
    expect(grid.misses, `${form}: hits over the box`).toEqual([]);
    console.log(`plain DOM: ${form} ${points.length} clicks, 2 drags past centre, 1 held, Space, label; ${grid.total} hits, ${grid.misses.length} misses`);
  }
  // The snap is visual and follows the form's spring: in between right after a throw, at its stop when it has settled.
  for (const [form, early, settle] of [["slide", 40, 800], ["rocker", 30, 400], ["wall", 30, 400]]) {
    const t = await page.locator(`#${form}-on`).evaluate(async (input, early) => {
      input.click();
      const root = input.closest(".ug-switch"), read = () => Number.parseFloat(getComputedStyle(root).getPropertyValue("--strata-switch-t"));
      await new Promise(resolve => setTimeout(resolve, early));
      return read();
    }, early);
    expect(t, `${form}: mid-throw`).toBeGreaterThan(0.05);
    expect(t).toBeLessThan(0.95);
    await page.waitForTimeout(settle);
    expect(await page.locator(`#${form}-on`).evaluate(input => getComputedStyle(input.closest(".ug-switch")).getPropertyValue("--strata-switch-t").trim())).toBe("0");
    console.log(`plain DOM: ${form} at ${early} ms into its throw: t = ${t.toFixed(3)}`);
  }
  // Disabled: no throw from a click or a drag.
  const locked = await page.locator("#locked").boundingBox();
  await page.mouse.click(locked.x + locked.width / 2, locked.y + locked.height / 2);
  await drag(page, ...along("bat", locked, 0.1, 0.9));
  expect(await checked(page, "locked")).toBe(false);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: taps and touch drags past centre throw the forms, a held drag does not, and the page never scrolls", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-switch-forms.html?plain");
  await page.waitForFunction(() => window.strataSwitchProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  const client = await context.newCDPSession(page);
  const touch = async (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const swipe = async ([x, y], [x1, y1]) => {
    await touch("touchStart", [{ x, y }]);
    for (let step = 1; step <= 10; step++) await touch("touchMove", [{ x: x + ((x1 - x) * step) / 10, y: y + ((y1 - y) * step) / 10 }]);
    await touch("touchEnd", []);
    await page.waitForTimeout(50);
  };
  for (const form of forms) {
    const id = `${form}-off`;
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY]);
    const box = await page.locator(`#${id}`).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    expect(await checked(page, id), `${form}: tap`).toBe(true);
    await clear(page);
    await swipe(...along(form, box, 0.85, 0.15));
    expect(await checked(page, id), `${form}: touch drag past centre`).toBe(false);
    expect(await events(page)).toEqual(one(id, false));
    await clear(page);
    await swipe(...along(form, box, 0.1, 0.4));
    expect(await checked(page, id), `${form}: touch drag held short of centre`).toBe(false);
    expect(await events(page)).toEqual([]);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY]), `${form}: no scroll`).toEqual(scroll);
  }
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  console.log("touch at 390 px: every form tapped on, dragged off past centre, held short of centre with no event, no scroll");
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the forms reflow with no horizontal overflow, 24 px targets and whole labels`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-switch-forms.html?plain");
  await page.waitForFunction(() => window.strataSwitchProbe);
  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    targets: [...document.querySelectorAll(".ug-switch[data-strata-form] > .ug-switch__input")].map(input => { const box = input.getBoundingClientRect(); return { width: box.width, height: box.height, left: box.left, right: box.right }; }),
    labels: [...document.querySelectorAll(".ug-switch__label")].map(label => { const box = label.getBoundingClientRect(); return { left: box.left, right: box.right, clipped: label.scrollWidth > label.clientWidth + 0.5 }; }),
  }));
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const target of layout.targets) { expect(Math.min(target.width, target.height)).toBeGreaterThanOrEqual(24); expect(target.right).toBeLessThanOrEqual(width); }
  for (const label of layout.labels) { expect(label.clipped).toBe(false); expect(label.right).toBeLessThanOrEqual(width); }
  // Still works at this width.
  await page.locator("#wall-off").click();
  expect(await checked(page, "wall-off")).toBe(true);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest target ${Math.min(...layout.targets.map(target => Math.min(target.width, target.height)))} px`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("the forms pass axe in light, dark and face mode, draw every part under forced colours, ink the slot with more contrast and snap at once under reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.goto("/ui-switch-forms.html?plain");
  await page.waitForFunction(() => window.strataSwitchProbe);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const css = await new AxeBuilder({ page }).include("#switch-panel").withTags(tags).analyze();
    expect(summary(css.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#switch-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#switch-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });

  await page.emulateMedia({ forcedColors: "active" });
  const forced = await new AxeBuilder({ page }).include("#switch-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe under forced colours").toEqual([]);
  // Decoded pixels: every form draws its parts in CanvasText on Canvas, the on ones with Highlight.
  for (const id of formIds) {
    const png = PNG.sync.read(await page.locator(`#${id}`).screenshot({ path: `${evidence}/forced-${id}.png` }));
    const luma = index => 0.2126 * png.data[index] + 0.7152 * png.data[index + 1] + 0.0722 * png.data[index + 2];
    let ink = 0;
    for (let index = 0; index < png.data.length; index += 4) if (luma(index) < 90) ink++;
    expect(ink, `${id}: parts drawn under forced colours`).toBeGreaterThan(80);
  }
  const highlight = await page.evaluate(() => {
    const fill = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return { on: fill("#slide-on ~ .ug-switch__object .ug-switch__block"), off: fill("#slide-off ~ .ug-switch__object .ug-switch__block") };
  });
  expect(highlight.on).not.toBe(highlight.off);
  await page.locator("#rocker-off").focus();
  await page.keyboard.press("Space");
  expect(await page.locator("#rocker-off").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.keyboard.press("Space");
  await page.emulateMedia({ forcedColors: "none" });

  // More contrast: the slot and grip take the text colour.
  const client = await context.newCDPSession(page);
  await client.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-contrast", value: "more" }] });
  const inks = await page.evaluate(() => {
    const style = getComputedStyle(document.querySelector("#slide-off ~ .ug-switch__object .ug-switch__slot"));
    return { slot: style.backgroundColor, text: getComputedStyle(document.querySelector(".ug-switch__label")).color };
  });
  expect(inks.slot).toBe(inks.text);
  await client.send("Emulation.setEmulatedMedia", { features: [] });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await page.locator("#slide-off").evaluate(async input => {
    const root = input.closest(".ug-switch");
    const duration = getComputedStyle(root).transitionDuration;
    input.click();
    await new Promise(requestAnimationFrame);
    return { duration, t: getComputedStyle(root).getPropertyValue("--strata-switch-t").trim() };
  });
  expect(reduced).toEqual({ duration: "0s", t: "1" });
  await context.close();
});

// ---- GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-switch-forms.html${query}`);
  await page.waitForFunction(() => window.strataSwitchProbe && window.strataSwitchProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataSwitchProbe.scene() !== undefined);
  await page.evaluate(() => window.strataSwitchProbe.controller.settle());
}
const mode = page => page.evaluate(() => window.strataSwitchProbe.controller.state().mode);
/** The `#frame` decoded, after the scene and the GPU have caught up. */
async function frame(page, name, { wait = 200, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataSwitchProbe.refresh(); await window.strataSwitchProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataSwitchProbe.controller.settle();
  }, wait);
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
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height }; });
}, selector);
/** Pins every form's throw at `t` (no transition), or lets it follow its input again (`null`). */
const pose = (page, t) => page.evaluate(t => {
  for (const root of document.querySelectorAll(".ug-switch[data-strata-form]")) {
    if (t === null) { root.style.removeProperty("--strata-switch-t"); root.style.removeProperty("transition"); }
    else { root.style.setProperty("--strata-switch-t", String(t)); root.style.setProperty("transition", "none"); }
  }
}, t);
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-switch__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);

for (const level of ["relief", "objects"]) test(`on the GPU at the ${level} level every form stays presented, its pixels are fresh and contained through the throw, and native hits land on it`, async ({ page }) => {
  test.setTimeout(240000);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  const kinds = await page.evaluate(() => {
    const probe = window.strataSwitchProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
    const entry = selector => { const box = document.querySelector(selector).getBoundingClientRect();
      const found = scene.primitives.find(p => Math.abs(p.rect[0] - (box.left - panel.left)) < 0.5 && Math.abs(p.rect[1] - (box.top - panel.top)) < 0.5 && Math.abs(p.rect[2] - box.width) < 0.5 && Math.abs(p.rect[3] - box.height) < 0.5);
      return found ? { kind: found.face ?? found.object, height: found.height } : null; };
    const parts = {};
    for (const part of ["slot", "flag", "block", "bezel", "facet--on", "facet--off", "nut", "bushing", "lever", "ball", "plate"]) {
      for (const id of ["slide-on", "rocker-off", "bat-on", "wall-off"]) {
        const selector = `#${id} ~ .ug-switch__object .ug-switch__${part}`;
        if (document.querySelector(selector)) parts[`${id.split("-")[0]} ${part}`] = entry(selector);
      }
    }
    return { version: scene.version, material: probe.controller.state().materials[0]?.kind, input: entry("#rocker-off"), parts };
  });
  console.log(`${level}: ${JSON.stringify(kinds.parts)}`);
  const lifted = level === "relief" ? "raised" : "slab";
  expect(kinds).toMatchObject({ version: level === "relief" ? 1 : 2, material: level, input: null, parts: {
    "slide slot": { kind: "groove" }, "slide flag": { kind: "flat" }, "slide block": { kind: lifted },
    "rocker bezel": { kind: lifted }, "rocker facet--on": { kind: lifted }, "rocker facet--off": { kind: lifted }, "rocker flag": { kind: "flat" },
    "bat nut": { kind: lifted }, "bat bushing": { kind: lifted }, "bat lever": { kind: lifted }, "bat ball": { kind: level === "relief" ? "knob" : "knob" },
    "wall plate": { kind: lifted }, "wall facet--on": { kind: lifted }, "wall facet--off": { kind: lifted }, "wall flag": { kind: "flat" },
  } });
  // The rocker and wall paddles tip: off, the top (On) end stands taller than the bottom one.
  expect(kinds.parts["rocker facet--on"].height).toBeGreaterThan(kinds.parts["rocker facet--off"].height);
  expect(kinds.parts["wall facet--on"].height).toBeGreaterThan(kinds.parts["wall facet--off"].height);

  // Native hits: a grid over every box lands on its input.
  for (const id of [...formIds, "locked"]) {
    const result = await hits(page, id);
    expect(result.misses, `${id}: hits over the box`).toEqual([]);
  }
  console.log(`${level}: ${formIds.length + 1} boxes × 121 hits, 0 mismatches`);

  const inputs = await inFrame(page, ".ug-switch[data-strata-form] > .ug-switch__input");
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return Number.parseFloat(style.getPropertyValue("--strata-focus-width")) + Number.parseFloat(style.getPropertyValue("--strata-focus-offset")) + 2; });
  // The readout prints the count; its glyphs may reach a pixel past its line box.
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#switch-read"))[0]);
  const rings = inputs.map(box => ({ x: box.x - ring, y: box.y - ring, width: box.width + 2 * ring, height: box.height + 2 * ring }));

  // Fresh pixels after every throw (a real click on each form), all inside the boxes (or the readout).
  let before = await frame(page, `${level}-start`);
  for (const id of formIds) {
    const box = await page.locator(`#${id}`).boundingBox();
    const was = await checked(page, id);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    expect(await checked(page, id)).toBe(!was);
    expect(await mode(page), `${id}: GPU stays on`).toBe("gpu");
    const after = await frame(page, `${level}-${id}-thrown`, { wait: 700 });
    const changed = difference(before, after, [...rings, read]);
    expect(changed.inside, `${id}: pixels change in its box`).toBeGreaterThan(80);
    expect(changed.outside, `${id}: no pixel changes outside the boxes (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`${level}: ${id} thrown → ${changed.inside} px changed in the boxes, ${changed.outside} outside`);
    before = after;
  }

  // Containment along the whole throw: at nine poses every pixel the objects draw (faces and shadows, against the
  // objects hidden) lies inside the boxes.
  // Hiding the objects drops their entries from the scene, which moves its outset: the Strata switch's pill well then
  // differs by a level or two in its anti-aliased corners, so its own box is allowed too (it is not a form's pixel).
  const plain = (await inFrame(page, "#plain"))[0];
  await objectsHidden(page, true);
  const bare = await frame(page, `${level}-bare`);
  await objectsHidden(page, false);
  for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
    await pose(page, t);
    const drawn = difference(await frame(page, `${level}-pose-${t}`), bare, [...inputs, plain]);
    expect(drawn.inside, `t ${t}: the objects are drawn`).toBeGreaterThan(3000);
    expect(drawn.outside, `t ${t}: no object pixel outside a box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
    expect(await mode(page)).toBe("gpu");
    console.log(`${level}: pose t = ${t}: ${drawn.inside} px drawn inside the boxes, ${drawn.outside} outside`);
  }
  await pose(page, null);
  // And in flight: a real throw slowed to 3 s, caught at three moments.
  await page.evaluate(() => { for (const root of document.querySelectorAll(".ug-switch[data-strata-form]")) root.style.setProperty("--_throw-duration", "3000ms"); });
  await page.evaluate(() => { for (const id of ["slide-off", "rocker-off", "bat-off", "wall-off"]) document.getElementById(id).click(); });
  for (const moment of [1, 2, 3]) {
    const flight = await frame(page, `${level}-flight-${moment}`, { wait: 350 });
    const t = await page.locator("#rocker-off").evaluate(input => getComputedStyle(input.closest(".ug-switch")).getPropertyValue("--strata-switch-t").trim());
    const drawn = difference(flight, bare, [...inputs, plain, read]);
    expect(drawn.outside, `in flight (t ${t}): no object pixel outside a box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
    console.log(`${level}: in flight, rocker t = ${t}: ${drawn.inside} px inside the boxes, ${drawn.outside} outside`);
  }
  await page.evaluate(() => { for (const root of document.querySelectorAll(".ug-switch[data-strata-form]")) root.style.removeProperty("--_throw-duration"); });
  expect(await mode(page)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("native hits over every box land on the input at DPR 2 on the GPU, at both levels, and a real drag throws it", async ({ browser }) => {
  for (const query of ["", "?level=objects"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await ready(page, query);
    for (const id of [...formIds, "locked"]) {
      const result = await hits(page, id, 21);
      expect(result.misses, `${query || "relief"}, DPR 2: ${id}`).toEqual([]);
    }
    console.log(`DPR 2 ${query || "relief"}: ${formIds.length + 1} boxes × 441 hits, 0 mismatches`);
    for (const form of forms) {
      const box = await page.locator(`#${form}-off`).boundingBox();
      await drag(page, ...along(form, box, 0.15, 0.85));
      expect(await checked(page, `${form}-off`), `${query || "relief"}, DPR 2: ${form} dragged past centre`).toBe(true);
    }
    expect(await mode(page)).toBe("gpu");
    await context.close();
  }
});

test("the accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page", async ({ page }) => {
  await page.goto("/ui-switch-forms.html?dom");
  await page.waitForFunction(() => window.strataSwitchProbe);
  const act = async () => { await page.locator("#slide-off").focus(); await page.keyboard.press("Space"); await page.locator("#wall-on").focus(); await page.keyboard.press("Space"); };
  await act();
  const dom = await page.locator("#switch-panel").ariaSnapshot();
  await ready(page);
  await act();
  const gpu = await page.locator("#switch-panel").ariaSnapshot();
  expect(gpu).toBe(dom);
  expect(gpu).toContain('switch "Bypass" [checked]');
  expect(gpu).toContain('switch "Porch"');
  expect(gpu).not.toContain('switch "Porch" [checked]');
  expect(await mode(page)).toBe("gpu");
  const { violations } = await new AxeBuilder({ page }).include("#switch-panel").withTags(tags).analyze();
  expect(summary(violations), "axe on the GPU page").toEqual([]);
});
