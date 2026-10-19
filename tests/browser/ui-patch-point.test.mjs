/**
 * Browser suite for the PatchPoint and the PatchBay (anatomy page `patch-point.md`) on `ui-patch-point.html` (`window.strataPatchProbe`):
 * plain contract markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel. Two bays in a form:
 * Outputs (four checkbox jacks with LEDs, `out1` and `out3` connected, `out4` disabled) and Returns (two button jacks, `ret1` pressed),
 * and two loose jacks, a small `aux1` and a large `aux2` with a warning LED.
 * - Plain DOM (`?plain`), real input: a click on the box, on its corner and on the label toggles once, one `input` and one `change`; Space
 *   toggles, Enter does not; the form's data follows `checked`; a disabled jack stays and a disabled fieldset disables its jacks; a button
 *   toggles `aria-pressed` with a click, Space and Enter and dispatches `strata-pressed-change`; every box is the washer + 20 px and a grid
 *   of `elementFromPoint` over it finds the control; the plug and the stub show only while connected and the LED is lit then.
 * - Touch, 390 and 320 px reflow, 200% text; preferences: axe in light, dark, face mode, forced colours and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is the documented one (an emitter per LED); with every jack
 *   unplugged and connected the parts draw inside the boxes only (0 px outside), native hits find the control; a connect changes pixels in its
 *   box (and the LED's light) only; a real click gives fresh pixels with no hit-geometry update; reduced motion seats the plug at once; the
 *   accessibility snapshot is the same in DOM and GPU modes and axe passes on the GPU page.
 * - Feedback: off by default; a connect plays `click` and a disconnect `thunk`.
 * Screenshots go to the `ui-patch-point` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-patch-point");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** Every jack: its control and the box it takes at 100% text (the washer + 20). */
const jacks = { out1: 56, out2: 56, out3: 56, out4: 56, ret1: 56, ret2: 56, aux1: 48, aux2: 64 };
const ids = Object.keys(jacks);
const connected = page => page.evaluate(() => window.strataPatchProbe.connected());
const events = page => page.evaluate(() => window.strataPatchProbe.events());
const clear = page => page.evaluate(() => window.strataPatchProbe.clearEvents());
const centre = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2, box]; };
/** The control's box for a jack: an input's own, a button's object. */
const boxOf = (page, id) => page.evaluate(id => { const control = document.getElementById(id), target = control.matches("button") ? control.querySelector(".ug-patch-point__object") : control, box = target.getBoundingClientRect(); return [box.width, box.height]; }, id);
/** elementFromPoint over a grid on a jack's box (inset 0.5 px): every hit is the control (or, for a button, its own descendant). */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const control = document.getElementById(id), target = control.matches("button") ? control.querySelector(".ug-patch-point__object") : control, box = target.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== control && !(control.matches("button") && control.contains(hit))) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);

async function plain(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-patch-point.html?plain");
  await page.waitForFunction(() => window.strataPatchProbe);
  return { context, page, errors };
}

test("a PatchPoint is a native checkbox or button: toggling, forms, disabled, the plug and the LED, the boxes", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  await expect(page.getByRole("checkbox", { name: "Out 1" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Out 2" })).not.toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Out 4" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Ret 1" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Outputs" })).toBeVisible();
  expect(await connected(page)).toEqual(["out1", "out3", "ret1", "aux2"]);
  // The boxes, and a grid over each finds the control.
  const sizes = {};
  for (const id of ids) {
    const [w, h] = await boxOf(page, id);
    sizes[id] = w;
    expect(h, `${id}: square`).toBe(w);
    expect((await hits(page, id)).misses, `${id}: hits`).toEqual([]);
  }
  expect(sizes).toEqual(jacks);
  // The plug and the stub show only while connected; the LED is lit then (`--strata-lit`).
  const state = id => page.evaluate(id => {
    const root = document.getElementById(id).closest(".ug-patch-point"), plug = getComputedStyle(root.querySelector(".ug-patch-point__plug")).visibility, stub = getComputedStyle(root.querySelector(".ug-patch-point__stub")).visibility;
    const led = root.querySelector(".ug-patch-point__led");
    return { plug, stub, lit: led ? Number(getComputedStyle(led).getPropertyValue("--strata-lit")) : null };
  }, id);
  expect(await state("out1")).toEqual({ plug: "visible", stub: "visible", lit: 1 });
  expect(await state("out2")).toEqual({ plug: "hidden", stub: "hidden", lit: 0 });
  expect(await state("ret1")).toEqual({ plug: "visible", stub: "visible", lit: null });

  // A click on the box, on its corner and on the label toggles once, with one input and one change.
  await clear(page);
  const [x, y, box] = await centre(page, "out2");
  await page.mouse.click(x, y);
  expect(await connected(page)).toContain("out2");
  expect((await events(page)).map(event => `${event.type}:${event.id}:${event.value}`)).toEqual(["input:out2:true", "change:out2:true"]);
  expect(await state("out2")).toEqual({ plug: "visible", stub: "visible", lit: 1 });
  await page.mouse.click(box.x + 1, box.y + 1);
  expect(await connected(page)).not.toContain("out2");
  await page.locator("#out2").locator("xpath=ancestor::label//span[@class='ug-patch-point__label']").click();
  expect(await connected(page)).toContain("out2");
  await page.locator("#out2").locator("xpath=ancestor::label//span[@class='ug-patch-point__label']").click();
  // Space toggles, Enter does not.
  await page.locator("#out2").focus();
  await page.keyboard.press("Space");
  expect(await connected(page)).toContain("out2");
  await page.keyboard.press("Enter");
  expect(await connected(page)).toContain("out2");
  await page.keyboard.press("Space");
  // The form's data follows `checked`.
  const data = () => page.evaluate(() => [...new FormData(document.getElementById("patch-form")).keys()]);
  expect(await data()).toEqual(["out1", "out3", "aux2"]);
  await page.mouse.click(...(await centre(page, "aux1")).slice(0, 2));
  expect(await data()).toEqual(["out1", "out3", "aux1", "aux2"]);
  // Disabled: no toggle, and a disabled fieldset disables its jacks.
  await page.mouse.click(...(await centre(page, "out4")).slice(0, 2));
  expect(await connected(page)).not.toContain("out4");
  await page.evaluate(() => { document.getElementById("rets").disabled = true; });
  await expect(page.locator("#ret1")).toBeDisabled();
  await page.mouse.click(...(await centre(page, "ret1")).slice(0, 2));
  await expect(page.locator("#ret1")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => { document.getElementById("rets").disabled = false; });
  await page.evaluate(() => { document.getElementById("outs").disabled = true; });
  await expect(page.locator("#out2")).toBeDisabled();
  await page.evaluate(() => { document.getElementById("outs").disabled = false; });

  // A button toggles aria-pressed with a click, Space and Enter, and tells the page.
  await clear(page);
  await page.mouse.click(...(await centre(page, "ret2")).slice(0, 2));
  await expect(page.locator("#ret2")).toHaveAttribute("aria-pressed", "true");
  expect((await events(page)).map(event => `${event.type}:${event.id}:${event.value}`)).toContain("pressed:ret2:true");
  await page.locator("#ret2").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#ret2")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Enter");
  await expect(page.locator("#ret2")).toHaveAttribute("aria-pressed", "true");
  expect(await state("ret2")).toEqual({ plug: "visible", stub: "visible", lit: null });
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch at 390 px: taps toggle jacks, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-patch-point.html?plain");
  await page.waitForFunction(() => window.strataPatchProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  await page.touchscreen.tap(...(await centre(page, "out2")).slice(0, 2));
  expect(await connected(page)).toContain("out2");
  await page.touchscreen.tap(...(await centre(page, "ret2")).slice(0, 2));
  await expect(page.locator("#ret2")).toHaveAttribute("aria-pressed", "true");
  await page.touchscreen.tap(...(await centre(page, "out1")).slice(0, 2));
  expect(await connected(page)).not.toContain("out1");
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the jacks reflow with no horizontal overflow, 24 px targets and whole labels`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-patch-point.html?plain");
  await page.waitForFunction(() => window.strataPatchProbe);
  const layout = await page.evaluate(() => {
    const boxes = selector => [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height }; });
    return { scrollWidth: document.documentElement.scrollWidth, objects: boxes(".ug-patch-point__object"), labels: boxes(".ug-patch-point__label"), bays: boxes(".ug-patch-bay"),
      clipped: [...document.querySelectorAll(".ug-patch-point__label")].filter(label => label.scrollWidth > label.clientWidth + 0.5).length };
  });
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const box of layout.objects) expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
  for (const box of [...layout.objects, ...layout.labels, ...layout.bays]) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  expect(layout.clipped).toBe(0);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest box ${Math.min(...layout.objects.map(box => Math.min(box.width, box.height)))} px`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the labels wrap without loss and nothing overflows", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-patch-point.html?plain");
  await page.waitForFunction(() => window.strataPatchProbe);
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    labels: [...document.querySelectorAll(".ug-patch-point__label")].map(label => { const box = label.getBoundingClientRect(); return { left: box.left, right: box.right, clipped: label.scrollWidth > label.clientWidth + 1 }; }) }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(320);
  for (const label of layout.labels) { expect(label.clipped).toBe(false); expect(label.left).toBeGreaterThanOrEqual(0); expect(label.right).toBeLessThanOrEqual(320); }
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the jacks pass axe in light, dark, face mode, forced colours and more contrast, and forced colours draw them", async ({ browser }) => {
  const { context, page } = await plain(browser);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#patch-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("patch-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#patch-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("patch-panel").removeAttribute("data-strata-mode"); });
    await mkdir(evidence, { recursive: true });
    await page.locator("#patch-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  await page.emulateMedia({ forcedColors: "active" });
  const forced = await new AxeBuilder({ page }).include("#patch-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe under forced colours").toEqual([]);
  const styles = await page.evaluate(() => {
    const root = document.getElementById("out1").closest(".ug-patch-point"), idle = document.getElementById("out2").closest(".ug-patch-point");
    const style = (scope, selector) => getComputedStyle(scope.querySelector(selector));
    return { washer: [style(root, ".ug-patch-point__washer").borderTopStyle, style(root, ".ug-patch-point__washer").borderTopWidth], plug: style(root, ".ug-patch-point__plug").backgroundColor,
      plugIdle: style(idle, ".ug-patch-point__plug").visibility, hole: style(root, ".ug-patch-point__jack").backgroundColor, washerFill: style(root, ".ug-patch-point__washer").backgroundColor };
  });
  expect(styles.washer).toEqual(["solid", "1px"]);
  expect(styles.plugIdle).toBe("hidden");
  expect(styles.plug, "a connected jack's plug is Highlight, not the washer's Canvas").not.toBe(styles.washerFill);
  expect(styles.hole, "the hole is CanvasText").not.toBe(styles.washerFill);
  await page.locator("#out2").focus();
  await page.keyboard.press("Space");
  expect(await page.locator("#out2").evaluate(input => getComputedStyle(input.closest(".ug-patch-point").querySelector(".ug-patch-point__washer")).outlineStyle)).toBe("solid");
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  expect(Number.parseFloat(await page.locator("#out1").evaluate(input => getComputedStyle(input.closest(".ug-patch-point").querySelector(".ug-patch-point__washer")).borderTopWidth))).toBeGreaterThanOrEqual(1);
  const more = await new AxeBuilder({ page }).include("#patch-panel").withTags(tags).analyze();
  expect(summary(more.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

test("a connect plays click and a disconnect thunk once feedback is on, for the visitor's own input only, and nothing plays by default", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  await context.addInitScript(() => { window.pulses = []; Object.defineProperty(navigator, "vibrate", { configurable: true, value: pattern => { window.pulses.push(pattern); return true; } }); });
  const page = await context.newPage();
  await page.goto("/ui-patch-point.html?plain");
  await page.waitForFunction(() => window.strataPatchProbe);
  const pulses = () => page.evaluate(() => window.pulses.splice(0));
  await page.mouse.click(...(await centre(page, "out2")).slice(0, 2));
  expect(await pulses(), "off by default").toEqual([]);
  await page.evaluate(() => window.strataPatchProbe.feedback({ haptics: true }));
  await page.mouse.click(...(await centre(page, "out2")).slice(0, 2));
  expect(await pulses(), "a disconnect is a thunk (16 ms)").toEqual([16]);
  await page.mouse.click(...(await centre(page, "out2")).slice(0, 2));
  expect(await pulses(), "a connect is a click (8 ms)").toEqual([8]);
  await page.mouse.click(...(await centre(page, "ret2")).slice(0, 2));
  await page.mouse.click(...(await centre(page, "ret2")).slice(0, 2));
  expect(await pulses(), "a button: click then thunk").toEqual([8, 16]);
  // A script's own click plays nothing once the visitor's own gesture on it is a second old.
  await page.waitForTimeout(1100);
  await page.evaluate(() => { document.getElementById("out2").click(); });
  expect(await pulses()).toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-patch-point.html${query}`);
  await page.waitForFunction(() => window.strataPatchProbe && window.strataPatchProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataPatchProbe.scene() !== undefined);
  await page.evaluate(() => window.strataPatchProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => { const instrument = window.strataPatchProbe.state().instrument; return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status === "ready")); }, null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataPatchProbe.controller.state().mode);
async function healthy(page, label, level) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataPatchProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
const settled = page => page.evaluate(async () => {
  const probe = window.strataPatchProbe;
  let previous = "", same = 0;
  for (let index = 0; index < 240 && same < 4; index++) {
    probe.refresh(); await probe.controller.settle();
    await new Promise(requestAnimationFrame);
    const now = JSON.stringify(probe.scene());
    same = now === previous ? same + 1 : 0; previous = now;
  }
  return same >= 4;
});
async function frame(page, name) {
  await page.mouse.move(2, 2);
  await page.waitForTimeout(150);
  expect(await settled(page), `${name}: the scene settles`).toBe(true);
  await page.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); await window.strataPatchProbe.controller.settle(); });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
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
/** The native controls' boxes in frame CSS px (an input's own, a button's object). */
const boxes = page => page.evaluate(() => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(".ug-patch-point")].map(root => { const control = root.matches("button") ? root.querySelector(".ug-patch-point__object") : root.querySelector(".ug-patch-point__input"), box = control.getBoundingClientRect();
    return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: root.matches("button") ? root.id : root.querySelector("input").id }; });
});
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.closest(".ug-patch-point")) mismatches++;
  return { total: points.length, mismatches };
}, points);
const jacksHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-patch-point__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
const setAll = (page, on) => page.evaluate(on => {
  for (const input of document.querySelectorAll(".ug-patch-point__input")) if (!input.disabled && input.checked !== on) { input.checked = on; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); }
  for (const button of document.querySelectorAll("button.ug-patch-point--button")) button.setAttribute("aria-pressed", String(on));
}, on);
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataPatchProbe, scene = probe.scene();
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, primitives: scene.primitives, emitters: scene.emitters, outset: scene.outset,
    objects: scene.objects?.map(object => ({ id: object.id, t: object.t, parts: object.parts.map(part => `${part.kind}:${part.material}`), emitters: object.parts.map(part => part.emitter), pose: object.parts.map(part => part.pose) })) };
});

for (const dpr of [1, 2]) for (const level of levels) test(`the jacks at ${level} (DPR ${dpr}): the scene, containment unplugged and connected, hits, and a connect changes the box only`, async ({ browser }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  expect(scene.camera !== undefined).toBe(level !== "relief");
  // Four LEDs (out1 to out4) and aux2's: five emitters, document order, lit for the connected ones (out4 is disabled and unlit).
  expect(scene.version).toBe(4);
  expect(scene.emitters).toHaveLength(5);
  expect(scene.emitters.map(emitter => emitter.strength > 0)).toEqual([true, false, true, false, true]);
  if (level === "instrument") {
    expect(scene.kind).toBe("instrument");
    const jackObjects = scene.objects.filter(object => object.parts[0].startsWith("plate:"));
    expect(jackObjects.map(object => object.id)).toEqual(["out1", "out2", "out3", "out4", "ret1", "ret2", "aux1", "aux2"]);
    for (const object of jackObjects) {
      expect(object.parts).toEqual(["plate:knobCap", "bushing:knobSkirt", "slot:knobInk", "pivot:knobSkirt", "lever:patchCable"]);
      expect(object.pose[3].from.travel, "the plug is sunk when unplugged").toBeLessThan(0);
    }
    // t is the plug's seating: connected 1, unplugged 0 (the disabled out4 too).
    expect(Object.fromEntries(jackObjects.map(object => [object.id, object.t]))).toEqual({ out1: 1, out2: 0, out3: 1, out4: 0, ret1: 1, ret2: 0, aux1: 0, aux2: 1 });
    // The LEDs are glass lenses with their emitters (document order), apart from the jacks' own parts.
    const leds = scene.objects.filter(object => object.parts[0].startsWith("lens:"));
    expect(leds).toHaveLength(5);
    const materials = await page.evaluate(() => Object.keys(window.strataPatchProbe.scene().materials));
    for (const name of ["knobCap", "knobSkirt", "knobInk", "patchCable"]) expect(materials).toContain(name);
    expect(materials.length, "within core's 16 materials").toBeLessThanOrEqual(16);
  } else {
    // Relief and Objects: a washer, a hole and (while connected) a plug per jack.
    const kinds = entry => entry.face ?? entry.object;
    const washers = scene.primitives.filter(entry => (level === "relief" ? kinds(entry) === "raised" : kinds(entry) === "slab") && entry.radius === entry.rect[2] / 2 && entry.rect[2] <= 44 && entry.rect[2] >= 28);
    const holes = scene.primitives.filter(entry => kinds(entry) === "well" && entry.rect[2] <= 20);
    const plugs = scene.primitives.filter(entry => kinds(entry) === "knob" && entry.rect[2] <= 14 && entry.rect[2] >= 10 && !(entry.rect[2] === 10 && entry.rect[3] === 10 && false));
    expect(washers.length, "a washer per jack").toBe(8);
    expect(holes.length, "a hole per jack").toBe(8);
    expect(plugs.length, "a plug for each connected jack (four, and aux2's large one)").toBeGreaterThanOrEqual(4);
  }
  await healthy(page, "start", level);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-patch-point__plug")].every(element => element.hasAttribute("data-strata-dome")))).toBe(true);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-patch-point__washer")].filter(element => element.hasAttribute("data-strata-dome")).length)).toBe(level === "instrument" ? 8 : 0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.primitives.length} entries${scene.objects ? `, ${scene.objects.length} objects` : ""}, ${scene.emitters.length} emitters`);

  for (const id of ids) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: hits`).toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${ids.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  // Containment, unplugged and connected, at three depths at Instrument: every object pixel lies in a jack's box (an LED's own box counts: it is a lamp object of its own),
  // against the same page with the jacks' objects hidden, and native hits on the pixels find a jack.
  const all = await boxes(page);
  const leds = await page.evaluate(() => { const frame = document.getElementById("frame").getBoundingClientRect(); return [...document.querySelectorAll(".ug-status-light__object")].map(object => { const box = object.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height }; }); });
  const depths = level === "instrument" ? [0, null, 1] : [null];
  for (const depth of depths) {
    await page.evaluate(depth => { if (depth === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(depth)); }, depth);
    const label = depth === null ? "0.5" : String(depth);
    for (const on of [false, true]) {
      await setAll(page, on);
      await jacksHidden(page, true);
      const bare = await frame(page, `${level}-dpr${dpr}-depth${label}-${on ? "connected" : "unplugged"}-bare`);
      await jacksHidden(page, false);
      const shown = await frame(page, `${level}-dpr${dpr}-depth${label}-${on ? "connected" : "unplugged"}-shown`);
      const parts = difference(shown, bare, all, { points: true });
      expect(parts.inside, `depth ${label}, ${on ? "connected" : "unplugged"}: the jacks are drawn`).toBeGreaterThan(900 * dpr * dpr);
      // The LEDs' glow reaches past their boxes (an emitter lights the page round it: its own guard), so they are allowed their outset; the jack parts are not.
      const lit = difference(shown, bare, [...all, ...leds.map(box => ({ x: box.x - 48, y: box.y - 48, width: box.width + 96, height: box.height + 96 }))]);
      expect(lit.outside, `depth ${label}, ${on ? "connected" : "unplugged"}: nothing outside the boxes and the LEDs' reach (${JSON.stringify(lit.outsideSamples)})`).toBe(0);
      const hit = await hitsOn(page, parts.changed);
      expect(hit.mismatches, `depth ${label}: native hits on object pixels`).toBe(0);
      console.log(`DPR ${dpr} ${level}: depth ${label}, ${on ? "connected" : "unplugged"}: ${parts.inside} px inside the boxes, ${parts.outside} outside them (${lit.outside} outside the LEDs' reach too), ${hit.total} hits ${hit.mismatches} mismatches`);
    }
    await healthy(page, `depth ${label}`, level);
  }
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-depth"));

  // A connect changes pixels in the jack's box (and the LED's light) only; real clicks, a key and a button.
  await setAll(page, false);
  let before = await frame(page, `${level}-dpr${dpr}-start`);
  const readoutBox = () => page.evaluate(() => { const frameBox = document.getElementById("frame").getBoundingClientRect(), box = document.getElementById("patch-read").getBoundingClientRect(); return { x: box.left - frameBox.left, y: box.top - frameBox.top, width: box.width, height: box.height + 4 }; });
  const lights = leds.map(box => ({ x: box.x - 48, y: box.y - 48, width: box.width + 96, height: box.height + 96 }));
  const steps = [
    ["a click on out2", async () => { await page.mouse.click(...(await centre(page, "out2")).slice(0, 2)); }, "out2"],
    ["a click on aux1", async () => { await page.mouse.click(...(await centre(page, "aux1")).slice(0, 2)); }, "aux1"],
    ["a click on ret2", async () => { await page.mouse.click(...(await centre(page, "ret2")).slice(0, 2)); }, "ret2"],
    ["Space on out2 (a disconnect)", async () => { await page.locator("#out2").focus(); await page.keyboard.press("Space"); }, "out2"],
  ];
  for (const [name, act, id] of steps) {
    const was = await connected(page);
    await act();
    const now = await connected(page);
    expect(now.includes(id) !== was.includes(id), `${name}: the state changed`).toBe(true);
    expect(await mode(page), `${name}: GPU stays on`).toBe("gpu");
    const after = await frame(page, `${level}-dpr${dpr}-${id}-${now.includes(id) ? "on" : "off"}`);
    const box = (await boxes(page)).find(entry => entry.id === id);
    const changed = difference(before, after, [box, await readoutBox(), ...lights]);
    expect(changed.inside, `${name}: the jack changes`).toBeGreaterThan(10);
    expect(changed.outside, `${name}: nothing changes outside the box, the readout and the LEDs' reach (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`DPR ${dpr} ${level}: ${name}: ${changed.inside} px changed in the box, ${changed.outside} outside`);
    await healthy(page, name, level);
    before = after;
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`a real click at ${level} adds one capture for the native change, no hit-geometry update, and the plug seats on its spring at Instrument`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await healthy(page, "start", level);
  await page.evaluate(() => window.strataPatchProbe.clearEvents());
  await settled(page);
  const target = await centre(page, "out2");
  const run = await page.evaluate(async () => {
    const probe = window.strataPatchProbe, frame = () => new Promise(requestAnimationFrame);
    for (let index = 0; index < 8; index++) await frame();
    return probe.counts();
  });
  await page.mouse.click(target[0], target[1]);
  // The plug's t on its way (Instrument): the first frames are between 0 and 1.
  const seat = await page.evaluate(async () => {
    const probe = window.strataPatchProbe, frame = () => new Promise(requestAnimationFrame);
    const t = () => probe.scene().objects?.find(object => object.id === "out2")?.t;
    const samples = [];
    for (let index = 0; index < 40; index++) { await frame(); probe.refresh(); samples.push(t()); }
    return samples;
  });
  const end = await counts(page);
  console.log(`${level}: a click: ${end.captures - run.captures} captures, ${end.uploads - run.uploads} uploads, ${end.geometryUpdates - run.geometryUpdates} hit-geometry updates${level === "instrument" ? `; the plug's t over 40 frames: ${seat.filter(value => value > 0 && value < 1).length} in flight, ending at ${seat.at(-1)}` : ""}`);
  expect(end.geometryUpdates - run.geometryUpdates, "no hit-geometry update").toBe(0);
  expect(end.captures - run.captures, "one capture for the native change, and the wake after it").toBeLessThanOrEqual(3);
  expect(await mode(page)).toBe("gpu");
  if (level === "instrument") { expect(seat.at(-1)).toBe(1); expect(seat.some(value => value > 0 && value < 1), "the plug is on its way for a few frames").toBe(true); expect(Math.max(...seat), "clamped at the stop").toBeLessThanOrEqual(1); }
  await healthy(page, "after the click", level);
  await context.close();
});
const counts = page => page.evaluate(() => window.strataPatchProbe.counts());

test("under reduced motion the plug is seated in the first scene at the Instrument level; otherwise it is on its way", async ({ browser }) => {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion });
    const page = await context.newPage();
    await ready(page, "?level=instrument");
    const first = await page.evaluate(async () => {
      const probe = window.strataPatchProbe, input = document.getElementById("out2");
      input.checked = true; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(requestAnimationFrame);
      probe.refresh();
      return probe.scene().objects.find(object => object.id === "out2").t;
    });
    console.log(`${reducedMotion}: the first scene after the connect: t ${first}`);
    if (reducedMotion === "reduce") expect(first).toBe(1); else { expect(first).toBeGreaterThan(0); expect(first).toBeLessThan(1); }
    await expect(async () => { expect(await page.evaluate(() => window.strataPatchProbe.scene().objects.find(object => object.id === "out2").t)).toBe(1); }).toPass({ timeout: 4000 });
    await healthy(page, reducedMotion, "instrument");
    await context.close();
  }
});

test("at the Instrument level an unplugged jack hides its plug: the box's pixels equal the same jack's with the plug and the cable removed from the scene", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  await settled(page);
  const out2 = (await boxes(page)).find(entry => entry.id === "out2");
  const shown = await frame(page, "unplugged-with-parts");
  // The same scene without the plug and cable parts of every jack (a controller that filters them out of the scene).
  await page.evaluate(() => {
    const controller = window.strataPatchProbe.controller, original = controller.setMaterial.bind(controller);
    const strip = scene => scene.kind === "instrument" ? { ...scene, objects: scene.objects.map(object => ({ ...object, parts: object.parts.filter(part => part.kind !== "pivot" && part.kind !== "lever") })) } : scene;
    controller.setMaterial = (id, descriptor) => { const handle = original(id, { ...descriptor, scene: strip(descriptor.scene) }); return { update: scene => handle.update(strip(scene)), cancel: () => handle.cancel(), setEmitters: emitters => handle.setEmitters?.(emitters) }; };
  });
  await page.evaluate(async () => { const input = document.getElementById("out2"); input.checked = true; input.dispatchEvent(new Event("input", { bubbles: true })); input.checked = false; input.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(requestAnimationFrame); });
  await page.waitForTimeout(600);
  const stripped = await frame(page, "unplugged-without-plug");
  const ratio = shown.width / 640;
  let different = 0;
  for (let y = Math.floor(out2.y * ratio); y < Math.ceil((out2.y + out2.height) * ratio); y++) for (let x = Math.floor(out2.x * ratio); x < Math.ceil((out2.x + out2.width) * ratio); x++) {
    const index = (y * shown.width + x) * 4;
    if (Math.abs(shown.data[index] - stripped.data[index]) + Math.abs(shown.data[index + 1] - stripped.data[index + 1]) + Math.abs(shown.data[index + 2] - stripped.data[index + 2]) > 6) different++;
  }
  console.log(`unplugged: ${different} px of the box differ with the plug and the cable removed from the scene`);
  expect(different, "the sunk plug and cable are out of sight").toBe(0);
  await context.close();
});

test("the patch page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ page }) => {
  await page.goto("/ui-patch-point.html?dom");
  await page.waitForFunction(() => window.strataPatchProbe);
  const act = async () => { await page.locator("#out2").focus(); await page.keyboard.press("Space"); await page.locator("#ret2").focus(); await page.keyboard.press("Enter"); };
  await act();
  const dom = await page.locator("#patch-panel").ariaSnapshot();
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    await act();
    const gpu = await page.locator("#patch-panel").ariaSnapshot();
    expect(gpu, level).toBe(dom);
    expect(gpu).toContain('checkbox "Out 1"');
    expect(gpu).toContain('button "Ret 1"');
    await healthy(page, `${level} after keys`, level);
    const { violations } = await new AxeBuilder({ page }).include("#patch-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
});
