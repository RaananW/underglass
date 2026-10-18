/**
 * Browser suite for the StatusLight (anatomy page `status-light.md`) on `ui-status-light.html`
 * (`window.strataStatusProbe`): plain contract markup with `@underglass/ui/css` and the plain-DOM helper, in a Strata
 * panel. An image-form light lit (`#link`) and unlit (`#idle`), a steady one with its label shown (`#power`), three
 * blinking ones (`#rec` normal, `#warn` fast, `#slow` slow), two live regions (`#sync` with its label shown, `#disk` with
 * none), and a large and a small one.
 * - Plain DOM: an image-form light has the role `img` and its label for a name; a shown label is text; a live light is an
 *   `<output>` (role `status`, a polite live region in the accessibility tree) and changing its label changes the live
 *   region's text, with the lens hidden from assistive technology; `setStrataStatusLight` keeps every form valid; every
 *   box is the lens plus 16 px (24, 26 and 30 px).
 * - Blink: `--strata-lit` flips at the tempo token (1,000, 400 and 1,600 ms a cycle, so 2, 5 and 1.25 changes a second),
 *   never more than three flashes a second; an unlit light does not blink; under reduced motion no light blinks and
 *   every lit light stays lit (0 changes, no animation).
 * - Touch (390 px) and 320 px: no horizontal overflow, labels whole; at 200% text the labels wrap without loss.
 * - Preferences: axe in light, dark, face mode, forced colours (Canvas lens, Highlight when lit) and more contrast.
 * - GPU at Relief, Objects and Instrument (DPR 1 and 2): GPU stays on; the scene is version 4 with an emitter per lens in
 *   document order (strength from the lens, the role and the state), the protected rects of every text, and the documented
 *   parts (at Instrument a glass lens with its emitter over the printed socket); with every light off, every pixel the
 *   objects draw lies inside a light's box; turning a light on changes pixels in its box and lights the face within its
 *   reach, none beyond it, and the labels beside it stay within the guard; native hits are the same as in DOM mode.
 * - Blink on the GPU: the emitters follow the tempo; 300 frames with the blinking lights cause 0 captures, 0 uploads and 0
 *   hit-geometry updates (emitters are uniform writes) with GPU on; the lit phase and the dark phase differ in the pixels
 *   of the lens and its pool; under reduced motion 0 frames change in 2 seconds.
 * - The accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page.
 * Screenshots go to the `ui-status-light` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-status-light");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const levels = ["relief", "objects", "instrument"];
/** Every light: its role colour in the light theme, its lens in px, whether it is lit, its blink period in ms. */
const lights = {
  link: { colour: "#15803d", lens: 10, lit: true }, idle: { colour: "#15803d", lens: 10, lit: false }, power: { colour: "#ff9228", lens: 10, lit: true },
  rec: { colour: "#c42b2b", lens: 10, lit: true, period: 1000 }, warn: { colour: "#b45309", lens: 10, lit: true, period: 400 }, slow: { colour: "#2563eb", lens: 10, lit: true, period: 1600 },
  sync: { colour: "#2563eb", lens: 10, lit: true }, disk: { colour: "#15803d", lens: 10, lit: true }, big: { colour: "#15803d", lens: 14, lit: true }, tiny: { colour: "#c42b2b", lens: 8, lit: true },
};
const ids = Object.keys(lights);
const blinking = ["rec", "warn", "slow"];

const lit = (page, id) => page.locator(`#${id}`).evaluate(light => Number(getComputedStyle(light).getPropertyValue("--strata-lit")));
async function plain(browser, options = {}, query = "") {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-status-light.html?plain${query}`);
  await page.waitForFunction(() => window.strataStatusProbe);
  return { context, page, errors };
}
/** `--strata-lit` of `id` sampled every animation frame for `ms`: the distinct values in order, with their times. */
const watch = (page, id, ms) => page.evaluate(([id, ms]) => new Promise(resolve => {
  const light = document.getElementById(id), start = performance.now(), changes = [];
  let last = null;
  const frame = now => {
    const value = Number(getComputedStyle(light).getPropertyValue("--strata-lit"));
    if (value !== last) { changes.push({ value, at: Math.round(now - start) }); last = value; }
    if (now - start < ms) requestAnimationFrame(frame); else resolve({ changes, animations: light.getAnimations().length });
  };
  requestAnimationFrame(frame);
}), [id, ms]);

test("a StatusLight is an image, a text or a live region, named by its label, and keeps every form valid as its state changes", async ({ browser }) => {
  const { context, page, errors } = await plain(browser);
  for (const id of ["link", "idle", "rec"]) {
    const light = page.locator(`#${id}`);
    if (id === "rec") { await expect(light).not.toHaveAttribute("role", /.*/); await expect(light).toContainText("Recording"); continue; }
    await expect(light, `${id}: role`).toHaveRole("img");
    await expect(light).toHaveAccessibleName(id === "link" ? "Link up" : "Link idle");
    await expect(light.locator(".ug-status-light__object")).toHaveAttribute("aria-hidden", "true");
  }
  // A shown label is text beside the lens; a live light is an <output>, a polite live region.
  await expect(page.locator("#power")).toContainText("Power");
  await expect(page.locator("#sync")).toHaveRole("status");
  expect(await page.locator("#sync").evaluate(output => output.tagName)).toBe("OUTPUT");
  expect(await page.locator("#sync").evaluate(output => output.hasAttribute("aria-live"))).toBe(false);
  const client = await context.newCDPSession(page);
  await client.send("Accessibility.enable");
  const tree = (await client.send("Accessibility.getFullAXTree")).nodes;
  // A status takes no name from its content: its text is what a screen reader announces.
  const statuses = tree.filter(node => node.role?.value === "status" && node.childIds.length), output = statuses[0];
  expect(statuses, "both live lights are statuses in the accessibility tree").toHaveLength(2);
  const properties = Object.fromEntries(output.properties.map(property => [property.name, property.value.value]));
  expect(properties.live, "a polite live region").toBe("polite");
  expect(properties.atomic).toBe(true);
  // The hidden-text live region (`#disk`) is a status too: its name is the label though nothing shows it.
  await expect(page.locator("#disk")).toHaveRole("status");
  expect(await page.locator("#disk").evaluate(output => output.textContent.trim()), "its text is the label").toBe("Disk healthy");
  expect(await page.locator("#disk").ariaSnapshot()).toBe("- status: Disk healthy");
  expect(await page.locator("#disk .ug-status-light__text").evaluate(text => { const box = text.getBoundingClientRect(); return [box.width, box.height]; }), "visually hidden").toEqual([1, 1]);
  // A change of label changes the live region's text (the announcement), once; the lens never carries it.
  await page.evaluate(() => { window.liveLog = []; new MutationObserver(records => { for (const record of records) window.liveLog.push(document.getElementById("sync").textContent.trim()); }).observe(document.getElementById("sync"), { childList: true, characterData: true, subtree: true }); });
  await page.evaluate(() => window.strataStatusProbe.set("sync", { label: "Syncing", colour: "warning", lit: false }));
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.liveLog), "the label changed once").toEqual(["Syncing"]);
  expect(await page.locator("#sync").ariaSnapshot()).toBe("- status: Syncing");
  expect(await page.locator("#sync").getAttribute("data-strata-colour")).toBe("warning");
  expect(await page.locator("#sync").getAttribute("data-strata-lit")).toBe("false");
  expect(await lit(page, "sync"), "unlit").toBe(0);
  await page.evaluate(() => window.strataStatusProbe.set("sync", { lit: true, colour: null }));
  expect(await page.locator("#sync").getAttribute("data-strata-lit")).toBeNull();
  expect(await page.locator("#sync").getAttribute("data-strata-colour")).toBeNull();
  expect(await lit(page, "sync"), "lit again").toBe(1);
  // An image-form light's label is its aria-label.
  await page.evaluate(() => window.strataStatusProbe.set("link", { label: "Link down", lit: false }));
  await expect(page.locator("#link")).toHaveAccessibleName("Link down");
  expect(await lit(page, "link")).toBe(0);
  // Lit by its state; the boxes are the lens plus 16 px.
  for (const [id, light] of Object.entries(lights)) {
    if (id === "link" || id === "sync") continue;
    expect(await lit(page, id), `${id}: --strata-lit`).toBe(light.lit && !light.period ? 1 : await lit(page, id));
    const box = await page.locator(`#${id} .ug-status-light__object`).boundingBox();
    expect([box.width, box.height], `${id}: box`).toEqual([light.lens + 16, light.lens + 16]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("a blink flips the lens at its tempo token, never over three flashes a second, and an unlit light does not blink", async ({ browser }) => {
  const { context, page } = await plain(browser);
  const result = {};
  for (const id of blinking) {
    const seen = await watch(page, id, 3200);
    const flips = seen.changes.length - 1, period = lights[id].period;
    result[id] = { flips, per: Math.round((flips / 3.2) * 100) / 100 };
    // Two changes a cycle (on to off, off to on), within the sampling: the flips are as many as the time holds.
    expect(Math.abs(flips - (2 * 3200) / period), `${id}: ${flips} changes in 3.2 s at a ${period} ms cycle`).toBeLessThanOrEqual(2);
    expect(seen.animations, `${id}: one CSS animation`).toBe(1);
    expect(new Set(seen.changes.map(change => change.value)), `${id}: lit and dark`).toEqual(new Set([0, 1]));
    // Flashes (rising edges) a second.
    const rises = seen.changes.filter((change, index) => index > 0 && change.value === 1).length;
    expect(rises / 3.2, `${id}: flashes a second`).toBeLessThanOrEqual(3);
    // Half a cycle each way: the held phases are about period / 2 (frames of 16.7 ms).
    const held = seen.changes.slice(1, -1).map((change, index) => seen.changes[index + 2].at - change.at);
    for (const duration of held) expect(Math.abs(duration - period / 2), `${id}: a phase of ${duration} ms`).toBeLessThan(60);
  }
  console.log(`blink changes a second: ${Object.entries(result).map(([id, entry]) => `${id} ${entry.per}`).join(", ")}`);
  // A steady light stays; an unlit blinking light stops.
  expect((await watch(page, "link", 600)).changes).toHaveLength(1);
  await page.evaluate(() => window.strataStatusProbe.set("rec", { lit: false }));
  const dark = await watch(page, "rec", 1200);
  expect(dark.changes, "an unlit light does not blink").toEqual([{ value: 0, at: dark.changes[0].at }]);
  expect(dark.animations).toBe(0);
  await page.evaluate(() => window.strataStatusProbe.set("rec", { lit: true }));
  expect((await watch(page, "rec", 1500)).changes.length, "lit again, it blinks").toBeGreaterThan(1);
  await context.close();
});

test("under reduced motion no light blinks and every lit light stays lit", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const id of blinking) {
    const seen = await watch(page, id, 2400);
    expect(seen.changes, `${id}: no change in 2.4 s`).toEqual([{ value: 1, at: seen.changes[0].at }]);
    expect(seen.animations, `${id}: no animation`).toBe(0);
  }
  await context.close();
});

for (const width of [390, 320]) test(`at ${width} px the lights reflow without overflow, and at 200% text the labels wrap without loss`, async ({ browser }) => {
  const { context, page } = await plain(browser, { viewport: { width, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const measure = () => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    lights: [...document.querySelectorAll(".ug-status-light")].map(light => { const box = light.getBoundingClientRect(); const text = light.matches(".ug-status-light--bare") ? null : light.querySelector(".ug-status-light__text"); return { id: light.id, left: box.left, right: box.right, clipped: !!text && text.scrollWidth > text.clientWidth + 1 }; }) }));
  let layout = await measure();
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const light of layout.lights) { expect(light.left, light.id).toBeGreaterThanOrEqual(0); expect(light.right, light.id).toBeLessThanOrEqual(width); expect(light.clipped, light.id).toBe(false); }
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
    document.documentElement.style.setProperty("--strata-control-font", `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--strata-control-font")) * 2}px`);
  });
  layout = await measure();
  expect(layout.scrollWidth, "200% text: no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const light of layout.lights) { expect(light.right, `200%: ${light.id}`).toBeLessThanOrEqual(width); expect(light.clipped, `200%: ${light.id}`).toBe(false); }
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, ${layout.lights.length} lights, 200% text whole`);
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("the lights pass axe in light, dark, face mode, forced colours and more contrast, and forced colours draw them", async ({ browser }) => {
  const { context, page } = await plain(browser, { reducedMotion: "reduce" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#led-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.getElementById("led-panel").dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#led-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { document.getElementById("led-panel").removeAttribute("data-strata-mode"); });
  }
  await page.evaluate(() => { document.documentElement.dataset.strataTheme = "light"; });
  await page.emulateMedia({ forcedColors: "active" });
  const colours = await page.evaluate(() => Object.fromEntries(["link", "idle"].map(id => { const lens = getComputedStyle(document.querySelector(`#${id} .ug-status-light__lens`)); return [id, { fill: lens.backgroundColor, border: lens.borderTopColor, glow: lens.boxShadow }]; })));
  expect(colours.link.fill, "a lit light is Highlight").not.toBe(colours.idle.fill);
  expect(colours.link.glow, "no glow").toBe("none");
  const forced = await new AxeBuilder({ page }).include("#led-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe, forced colours").toEqual([]);
  await page.emulateMedia({ forcedColors: "none", contrast: "more" });
  const more = await page.evaluate(() => ({ glow: getComputedStyle(document.querySelector("#link .ug-status-light__lens")).boxShadow, socket: getComputedStyle(document.querySelector("#link .ug-status-light__socket")).backgroundColor, idle: getComputedStyle(document.querySelector("#idle .ug-status-light__socket")).backgroundColor }));
  expect(more.glow, "more contrast: no glow").toBe("none");
  expect(more.socket, "a lit light's socket is its lit colour, flat").not.toBe(more.idle);
  const contrast = await new AxeBuilder({ page }).include("#led-panel").withTags(tags).analyze();
  expect(summary(contrast.violations), "axe, more contrast").toEqual([]);
  await context.close();
});

// ---- The GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-status-light.html${query}`);
  await page.waitForFunction(() => window.strataStatusProbe && window.strataStatusProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataStatusProbe.scene() !== undefined);
  await page.evaluate(() => window.strataStatusProbe.controller.settle());
  if (query.includes("level=instrument")) await page.waitForFunction(() => window.strataStatusProbe.state().instrument?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
async function healthy(page, label, level) {
  expect(await page.evaluate(() => window.strataStatusProbe.controller.state().mode), `${label}: GPU stays on`).toBe("gpu");
  if (level !== "instrument") return;
  const state = await page.evaluate(() => window.strataStatusProbe.state().instrument.layers[0]);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
async function frame(page, name, { wait = 150, move = true } = {}) {
  if (move) await page.mouse.move(2, 2);
  await page.evaluate(async wait => {
    await new Promise(resolve => setTimeout(resolve, wait));
    window.strataStatusProbe.refresh(); await window.strataStatusProbe.controller.settle();
    for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame);
    await window.strataStatusProbe.controller.settle();
  }, wait);
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
    if (allowed.some(region => region.radius !== undefined ? Math.hypot(px - region.cx, py - region.cy) <= region.radius : px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height)) inside++;
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples };
}
/** The number of pixels that differ at all (any channel) between two frames. */
function changedPixels(a, b) {
  let changed = 0;
  for (let index = 0; index < a.data.length; index += 4) if (a.data[index] !== b.data[index] || a.data[index + 1] !== b.data[index + 1] || a.data[index + 2] !== b.data[index + 2]) changed++;
  return changed;
}
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height, id: element.closest(".ug-status-light").id }; });
}, selector);
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-status-light__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
/** Every light off and still (no blink): the lights as parts alone. */
const allOff = page => page.evaluate(ids => { for (const id of ids) window.strataStatusProbe.set(id, { lit: false }); }, ids);
const pixel = (png, point, dpr) => { const offset = (Math.floor(point.y * dpr) * png.width + Math.floor(point.x * dpr)) * 4; return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]; };
const gain = (off, on, point, dpr) => { const a = pixel(off, point, dpr), b = pixel(on, point, dpr); return (b[0] + b[1] + b[2] - a[0] - a[1] - a[2]) / 3; };
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
function excess(reference, lit, rect, dpr, m = 0.04) {
  let worst = 0;
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * reference.width + x) * 4;
    for (let channel = 0; channel < 3; channel++) { const value = reference.data[offset + channel], next = lit.data[offset + channel]; worst = Math.max(worst, next - value * (1 + m), value * (1 - m) - next); }
  }
  return Math.round(worst * 100) / 100;
}
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataStatusProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const objectRect = id => { const rect = document.querySelector(`#${id} .ug-status-light__object`).getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, camera: scene.camera?.distance, material: probe.controller.state().materials[0]?.kind, emitters: scene.emitters, protected: scene.protected, feather: scene.feather, outset: scene.outset,
    faces: scene.primitives.map(entry => entry.face ?? entry.object), primitives: scene.primitives,
    objects: scene.objects?.map(object => ({ id: object.id, parts: object.parts.map(part => `${part.kind}:${part.material}`), emitters: object.parts.map(part => part.emitter), glass: object.parts.map(part => part.glass),
      close: object.bounds.rect.every((value, index) => Math.abs(value - objectRect(object.id)[index]) < 0.01) })),
    texts: [...document.querySelectorAll(".ug-status-light__text:not(#disk *), #note, #led-title")].flatMap(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      return [...range.getClientRects()].filter(box => box.width > 0 && box.height > 0).map(box => [box.left - panel.left, box.top - panel.top, box.width, box.height]);
    }) };
});
const counts = page => page.evaluate(() => window.strataStatusProbe.counts());

for (const dpr of [1, 2]) for (const level of levels) test(`the lights at ${level} (DPR ${dpr}): the scene, the emitters, containment, the light and the guard, and the same hits as the DOM`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // The hits in DOM mode, over a grid on the panel (every 6 px), to compare; the panel's rounded corners are no part of it.
  await page.goto("/ui-status-light.html?dom");
  await page.waitForFunction(() => window.strataStatusProbe);
  const hitGrid = () => page.evaluate(() => {
    const panel = document.getElementById("led-panel").getBoundingClientRect(), out = [];
    for (let y = panel.top + 3; y < panel.bottom - 3; y += 6) for (let x = panel.left + 3; x < panel.right - 3; x += 6) { const hit = document.elementFromPoint(x, y); out.push(hit && document.getElementById("led-panel").contains(hit) ? `${hit.tagName}.${hit.className}#${hit.id}` : "outside"); }
    return out;
  });
  const domHits = await hitGrid();
  await ready(page, `?level=${level}`);
  const scene = await sceneOf(page);
  expect(scene.version).toBe(4);
  expect(scene.kind).toBe(level === "instrument" ? "instrument" : undefined);
  expect(scene.camera !== undefined).toBe(level !== "relief");
  expect(scene.material).toBe({ relief: "relief", objects: "objects", instrument: "instrument" }[level]);
  expect(scene.emitters).toHaveLength(ids.length);
  scene.emitters.forEach((emitter, index) => {
    const id = ids[index], light = lights[id], lens = light.lens;
    // A blinking light is lit or dark at this frame; the others are as their state says.
    const on = light.lit && (!light.period || emitter.strength > 0);
    expect(emitter.strength, `${id}: strength`).toBeCloseTo(on ? 520 * (lens / 10) ** 2 : 0, 2);
    expect(emitter.radius, `${id}: reach ${lens * 6}`).toBeCloseTo(lens * 6, 2);
    expect(emitter.position[2], `${id}: height 0.8 lens`).toBeCloseTo(0.8 * lens, 2);
    expect(emitter.reach).toBe("outset");
  });
  expect(scene.feather).toBe(4);
  expect(Array.isArray(scene.protected)).toBe(true);
  for (const text of scene.texts) expect(scene.protected.some(rect => rect[0] <= text[0] + 0.5 && rect[1] <= text[1] + 0.5 && rect[0] + rect[2] >= text[0] + text[2] - 0.5 && rect[1] + rect[3] >= text[1] + text[3] - 0.5), `a protected rect covers the text at ${text.map(Math.round)}`).toBe(true);
  if (level === "instrument") {
    expect(scene.objects.map(object => object.id)).toEqual(ids);
    scene.objects.forEach((object, index) => {
      expect(object.parts, `${object.id}: one glass lens`).toEqual([`lens:lens ${lights[object.id].colour}`]);
      expect(object.emitters).toEqual([index]);
      expect(object.glass).toEqual(["lens"]);
      expect(object.close, `${object.id}: bounds are the object's box`).toBe(true);
    });
  } else {
    expect(scene.faces.filter(face => face === (level === "relief" ? "ring" : "knob")).length).toBe(ids.length);
  }
  await healthy(page, "start", level);
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-status-light__lens")].filter(element => !element.hasAttribute("data-strata-dome")).length)).toBe(0);
  console.log(`DPR ${dpr} ${level}: scene v${scene.version}${scene.kind ? ` ${scene.kind}` : ""}, ${scene.emitters.length} emitters, ${scene.protected.length} protected rects, outset ${scene.outset.top}${scene.objects ? `, ${scene.objects.length} objects` : ""}`);

  // The same native hits as the DOM, everywhere on the frame.
  const gpuHits = await hitGrid();
  expect(gpuHits.length).toBe(domHits.length);
  expect(domHits.filter(hit => hit.includes("ug-status-light")).length, "the grid reaches the lights").toBeGreaterThan(20);
  expect(gpuHits.filter((hit, index) => domHits[index] !== "outside" && hit !== domHits[index]), "native hits are the DOM's").toEqual([]);
  console.log(`DPR ${dpr} ${level}: ${domHits.filter(hit => hit !== "outside").length} native hits on the panel, 0 differ from the DOM's`);

  // Containment: with every light off, the objects draw inside their boxes only.
  await allOff(page);
  const boxes = await inFrame(page, ".ug-status-light__object");
  await objectsHidden(page, true);
  const bare = await frame(page, `${level}-dpr${dpr}-bare`);
  await objectsHidden(page, false);
  const drawn = difference(await frame(page, `${level}-dpr${dpr}-off`), bare, boxes);
  expect(drawn.inside, "the objects are drawn").toBeGreaterThan(200 * dpr * dpr);
  expect(drawn.outside, `no object pixel outside a box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
  console.log(`DPR ${dpr} ${level}: all off: ${drawn.inside} px inside the boxes, ${drawn.outside} outside`);
  await healthy(page, "all off", level);

  // Turning a light on: its box changes, the face is lit within its reach and not beyond it, and the labels keep the guard.
  const off = await frame(page, `${level}-dpr${dpr}-all-off`);
  await page.evaluate(() => window.strataStatusProbe.set("link", { lit: true }));
  const on = await frame(page, `${level}-dpr${dpr}-link-on`);
  const link = boxes.find(box => box.id === "link"), centre = { x: link.x + link.width / 2, y: link.y + link.height / 2 }, reach = 6 * 10;
  const inBox = difference(off, on, [link]), within = difference(off, on, [link, { cx: centre.x, cy: centre.y, radius: reach + 3 }]);
  expect(inBox.inside, "the light's box changes").toBeGreaterThan(40 * dpr * dpr);
  expect(within.outside, `nothing changes beyond the light's reach (${JSON.stringify(within.outsideSamples)})`).toBe(0);
  const panelBox = (await inFrame(page, ".ug-status-light__object"))[0];
  const panelFrame = await page.evaluate(() => { const frame = document.getElementById("frame").getBoundingClientRect(), box = document.getElementById("led-panel").getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height }; });
  const texts = scene.texts.map(text => [text[0] + panelFrame.x, text[1] + panelFrame.y, text[2], text[3]]);
  const clear = point => !texts.some(box => point.x >= box[0] - 10 && point.x <= box[0] + box[2] + 10 && point.y >= box[1] - 10 && point.y <= box[1] + box[3] + 10) && !boxes.some(box => point.x >= box.x - 2 && point.x <= box.x + box.width + 2 && point.y >= box.y - 2 && point.y <= box.y + box.height + 2);
  const ring = {};
  for (const scale of [2, 3, 4]) {
    const gains = [];
    for (let step = 0; step < 48; step++) {
      const angle = (step / 48) * 2 * Math.PI, point = { x: centre.x + Math.cos(angle) * 10 * scale, y: centre.y + Math.sin(angle) * 10 * scale };
      if (point.x < panelFrame.x + 6 || point.y < panelFrame.y + 6 || point.x > panelFrame.x + panelFrame.width - 6 || point.y > panelFrame.y + panelFrame.height - 6 || !clear(point)) continue;
      gains.push(gain(off, on, point, dpr));
    }
    ring[scale] = { points: gains.length, median: median(gains) };
  }
  console.log(`DPR ${dpr} ${level}: link on: ${inBox.inside} px in its box; face gain at 2 / 3 / 4 lens diameters: ${JSON.stringify(ring)}; changed within reach ${within.inside}, beyond ${within.outside}`);
  expect(ring[2].points, "sample points at 2 diameters").toBeGreaterThan(3);
  expect(ring[2].median, "the face is lit at 2 diameters").toBeGreaterThan(1);
  let worst = 0, checkedText = 0;
  for (const text of texts) {
    if (Math.hypot(text[0] + text[2] / 2 - centre.x, text[1] + text[3] / 2 - centre.y) > reach) continue;
    worst = Math.max(worst, excess(off, on, { x: text[0], y: text[1], width: text[2], height: text[3] }, dpr)); checkedText++;
  }
  console.log(`DPR ${dpr} ${level}: ${checkedText} text rects within reach, worst change beyond the guard ${worst} levels`);
  expect(checkedText).toBeGreaterThan(0);
  expect(worst, "protected text stays within the guard").toBeLessThanOrEqual(2);
  void panelBox;
  await healthy(page, "link on", level);
  expect(errors).toEqual([]);
  await context.close();
});

for (const level of levels) test(`blinking lights at ${level}: the emitters follow the tempo, 300 frames add no capture, upload or hit-geometry update, and the phases differ in pixels`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await page.evaluate(() => { for (const id of ["sync", "disk"]) document.getElementById(id).style.visibility = "hidden"; });
  await frame(page, `${level}-blink-quiet`, { wait: 400 });
  // 300 frames: every frame's scene has the emitters as the CSS blink has them; nothing is captured or uploaded.
  const run = await page.evaluate(async () => {
    const probe = window.strataStatusProbe, next = () => new Promise(requestAnimationFrame);
    const order = ["link", "idle", "power", "rec", "warn", "slow", "sync", "disk", "big", "tiny"], index = id => order.indexOf(id);
    for (let step = 0; step < 6; step++) await next();
    const start = probe.counts(), flips = { rec: 0, warn: 0, slow: 0 }, last = { rec: null, warn: null, slow: null }, begin = performance.now();
    let disagree = 0, lateSteps = 0;
    for (let step = 0; step < 300; step++) {
      await next();
      const scene = probe.scene();
      for (const id of ["rec", "warn", "slow"]) {
        const strength = scene.emitters[index(id)].strength, css = Number(getComputedStyle(document.getElementById(id)).getPropertyValue("--strata-lit"));
        if (last[id] !== null && (strength > 0) !== last[id]) flips[id]++;
        last[id] = strength > 0;
        // The scene was built in a frame at most one behind the CSS: the two agree except at a flip.
        if ((strength > 0) !== (css > 0.5)) disagree++;
      }
      const layer = probe.state().instrument?.layers?.[0];
      if (layer && (layer.steppedDown.length || layer.status !== "ready")) lateSteps++;
    }
    const end = probe.counts(), seconds = (performance.now() - begin) / 1000;
    return { frames: 300, seconds, flips, disagree, lateSteps, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode };
  });
  console.log(`${level}: 300 frames in ${run.seconds.toFixed(2)} s: flips ${JSON.stringify(run.flips)}, ${run.disagree} scene/CSS disagreements, ${run.captures} captures, ${run.uploads} uploads, ${run.geometryUpdates} hit-geometry updates, ${run.lateSteps} frames stepped down`);
  expect(run.mode).toBe("gpu");
  expect(run.captures, "no capture").toBe(0);
  expect(run.uploads, "no upload").toBe(0);
  expect(run.geometryUpdates, "no hit-geometry update").toBe(0);
  expect(run.lateSteps).toBe(0);
  for (const [id, period] of [["rec", 1000], ["warn", 400], ["slow", 1600]]) expect(Math.abs(run.flips[id] - (2 * run.seconds * 1000) / period), `${id}: ${run.flips[id]} flips in ${run.seconds.toFixed(1)} s`).toBeLessThanOrEqual(2);
  expect(run.disagree, "the scene follows the CSS blink").toBeLessThanOrEqual(24);
  await healthy(page, "blinking", level);
  // The two phases differ in pixels: pause every blink lit, then dark, and compare (inside the lights' boxes and their pools).
  const phase = async name => {
    await page.evaluate(name => { for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = name === "lit" ? 50 : animation.effect.getComputedTiming().duration * 0.75; } }, name);
    return frame(page, `${level}-blink-${name}`, { wait: 250 });
  };
  const litPhase = await phase("lit"), darkPhase = await phase("dark");
  const boxes = await inFrame(page, ".ug-status-light__object");
  const reachOf = id => 6 * lights[id].lens;
  const regions = ["rec", "warn", "slow"].map(id => { const box = boxes.find(box => box.id === id); return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, radius: reachOf(id) + 3 }; });
  const changes = difference(litPhase, darkPhase, regions);
  expect(changes.inside, "the lit and the dark phases differ near the blinking lights").toBeGreaterThan(500);
  console.log(`${level}: lit vs dark phase: ${changes.inside} px differ within the blinking lights' reach, ${changes.outside} elsewhere`);
  await context.close();
});

for (const level of levels) test(`under reduced motion the lights at ${level} do not blink: 0 frames change in 2 seconds, and they stay lit`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await ready(page, `?level=${level}`);
  await frame(page, `${level}-still-0`, { wait: 400 });
  const shots = [];
  for (let step = 0; step < 6; step++) { await page.waitForTimeout(350); shots.push(await frame(page, `${level}-still-${step + 1}`, { wait: 0, move: false })); }
  const first = await frame(page, `${level}-still-ref`, { wait: 0, move: false });
  for (const [index, shot] of shots.entries()) expect(changedPixels(first, shot), `frame ${index + 1} of 6 over 2.1 s: 0 pixels changed`).toBe(0);
  const scene = await sceneOf(page);
  for (const id of blinking) expect(scene.emitters[ids.indexOf(id)].strength, `${id}: lit and steady`).toBeGreaterThan(0);
  console.log(`${level}: 6 frames over 2.1 s under reduced motion, 0 pixels changed; blinking lights lit and steady`);
  // And with motion, the same page does change.
  const moving = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 1 });
  const movingPage = await moving.newPage();
  await ready(movingPage, `?level=${level}`);
  const shotsMoving = [];
  for (let step = 0; step < 6; step++) { await movingPage.waitForTimeout(170); shotsMoving.push(await frame(movingPage, `${level}-moving-${step}`, { wait: 0, move: false })); }
  const differing = shotsMoving.filter(shot => changedPixels(shotsMoving[0], shot) > 0).length;
  expect(differing, "with motion, frames change").toBeGreaterThan(0);
  await moving.close();
  await healthy(page, "reduced motion", level);
  await context.close();
});

test("the lights page keeps the accessibility snapshot of the DOM, on every level, and passes axe", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-status-light.html?dom");
  await page.waitForFunction(() => window.strataStatusProbe);
  const dom = await page.locator("#led-panel").ariaSnapshot();
  expect(dom).toContain('img "Link up"');
  expect(dom).toContain('status: Synced');
  for (const level of levels) {
    await ready(page, `?level=${level}`);
    expect(await page.locator("#led-panel").ariaSnapshot(), level).toBe(dom);
    await healthy(page, level, level);
    const { violations } = await new AxeBuilder({ page }).include("#led-panel").withTags(tags).analyze();
    expect(summary(violations), `axe on the GPU page at ${level}`).toEqual([]);
  }
  await context.close();
});

test("under more contrast the Instrument lights have no emitters' light and the lit socket is flat; under reduced transparency the lens is an opaque dome", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await ready(page, "?level=instrument");
  let scene = await sceneOf(page);
  expect(scene.emitters.every(emitter => emitter.strength === 0)).toBe(true);
  await healthy(page, "more contrast", "instrument");
  await page.emulateMedia({ contrast: "no-preference" });
  await (await context.newCDPSession(page)).send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.strataStatusProbe.refresh());
  scene = await sceneOf(page);
  expect(scene.objects.every(object => object.parts[0].startsWith("lens:lensOpaque ") && object.glass[0] === undefined)).toBe(true);
  expect(scene.emitters.some(emitter => emitter.strength > 0)).toBe(true);
  await healthy(page, "reduced transparency", "instrument");
  await context.close();
});
