/**
 * Browser suite for the Switch's hardware forms at the Instrument level (anatomy page `switch.md`, *Forms*;
 * `gpu/instrument-switch.ts`) on `ui-switch-forms.html?level=instrument` (`window.strataSwitchProbe`), at DPR 1 and 2:
 * - The scene: version 4, core's `instrument` material, each form an object of its parts bounded by its input's box
 *   (the slot stays a groove on the face), the same parts whether the switch is off or on, `t` from the CSS throw.
 * - GPU stays on and nothing is stepped down to Relief, through poses, throws, hover, disabled and a changing depth.
 * - Containment: at t = 0, 0.5 and 1 (depth 0, 0.5 and 1) and in flight, every pixel the objects draw (against the
 *   page with them hidden) lies inside an input's box, and native hits on those pixels land on an input. A control
 *   run without the casters' caps shows shadow pixels outside the boxes.
 * - Real throws change pixels only inside the boxes; frames of a throw add no capture and no hit-geometry update; the
 *   lit flags change with the state, not the structure.
 * - Hover and disabled reach the parts, pressing does not sink them; no GPU focus edge.
 * - Reduced motion snaps at once; touch at 390 and 320 px throws; axe passes on the GPU page.
 * Screenshots go to the `ui-switch-forms-instrument` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-switch-forms-instrument");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
const forms = ["slide", "rocker", "bat", "wall"];
const formIds = forms.flatMap(form => [`${form}-off`, `${form}-on`]);
const allIds = [...formIds, "locked"];
const sceneIds = ["slide-off", "rocker-off", "bat-off", "wall-off", "slide-on", "rocker-on", "bat-on", "wall-on", "locked"];
const parts = {
  slide: ["segment:switchFlagOn", "carriage:switchCap", "chamfer:switchChamfer", "cap:switchCap", "grip:switchInk"],
  rocker: ["bezel:switchBezel", "paddle:switchCap", "segment:switchFlagOn", "segment:switchFlagOff"],
  bat: ["nut:switchBezel", "bushing:switchBezel", "lever:switchLever", "ball:switchLever"],
  wall: ["plate:switchPlate", "paddle:switchCap", "chamfer:switchChamfer", "cap:switchCap", "segment:switchFlagOn", "segment:switchFlagOff"],
};

const checked = (page, id) => page.locator(`#${id}`).evaluate(input => input.checked);
const centreOf = box => [box.x + box.width / 2, box.y + box.height / 2];
async function drag(page, [x, y], [x1, y1], { steps = 10 } = {}) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps });
  await page.mouse.up();
}
/** A drag along a form's throw, from a fraction of the box along the throw to another (0 off, 1 on). */
function along(form, box, from, to) {
  const at = fraction => form === "slide" ? [box.x + fraction * box.width, box.y + box.height / 2] : [box.x + box.width / 2, box.y + (1 - fraction) * box.height];
  return [at(from), at(to)];
}

async function ready(page, query = "?level=instrument") {
  await page.goto(`/ui-switch-forms.html${query}`);
  await page.waitForFunction(() => window.strataSwitchProbe && window.strataSwitchProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataSwitchProbe.scene() !== undefined);
  await page.evaluate(() => window.strataSwitchProbe.controller.settle());
  await page.waitForFunction(() => window.strataSwitchProbe.instrument()?.layers?.[0]?.status === "ready", null, { timeout: 30000 });
}
const mode = page => page.evaluate(() => window.strataSwitchProbe.controller.state().mode);
const layer = page => page.evaluate(() => window.strataSwitchProbe.instrument().layers[0]);
/** GPU on, the layer drawn as parts, nothing stepped down. */
async function healthy(page, label) {
  expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
  const state = await layer(page);
  expect(state.status, `${label}: the layer is drawn as parts`).toBe("ready");
  expect(state.steppedDown, `${label}: nothing is stepped down to Relief`).toEqual([]);
}
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
/** Pixels that differ between two frames, inside and outside the `allowed` boxes (frame CSS px), and the changed points. */
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
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  return [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height }; });
}, selector);
/** Native hits on frame points: how many land on a switch input. */
const hitsOn = (page, points) => page.evaluate(points => {
  const frame = document.getElementById("frame").getBoundingClientRect();
  let mismatches = 0;
  for (const [x, y] of points) if (!document.elementFromPoint(frame.left + x, frame.top + y)?.matches(".ug-switch__input")) mismatches++;
  return { total: points.length, mismatches };
}, points);
/** elementFromPoint over a grid on a box (inset 0.5 px): every hit must be the input. */
const gridHits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const input = document.getElementById(id), box = input.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    if (document.elementFromPoint(x, y) !== input) misses.push([x, y]);
  }
  return { total, misses };
}, [id, n]);
/** Pins every form's throw at `t` (no transition), or lets it follow its input again (`null`). */
const pose = (page, t) => page.evaluate(t => {
  for (const root of document.querySelectorAll(".ug-switch[data-strata-form]")) {
    if (t === null) { root.style.removeProperty("--strata-switch-t"); root.style.removeProperty("transition"); }
    else { root.style.setProperty("--strata-switch-t", String(t)); root.style.setProperty("transition", "none"); }
  }
}, t);
const objectsHidden = (page, hidden) => page.evaluate(hidden => { for (const object of document.querySelectorAll(".ug-switch__object")) object.style.visibility = hidden ? "hidden" : ""; }, hidden);
const depth = (page, value) => page.evaluate(value => { if (value === null) document.documentElement.style.removeProperty("--strata-depth"); else document.documentElement.style.setProperty("--strata-depth", String(value)); }, value);
/** The scene's objects, summarised. */
const sceneOf = page => page.evaluate(() => {
  const probe = window.strataSwitchProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
  const box = id => { const rect = document.getElementById(id).getBoundingClientRect(); return [rect.left - panel.left, rect.top - panel.top, rect.width, rect.height]; };
  return { version: scene.version, kind: scene.kind, material: probe.controller.state().materials[0]?.kind, camera: scene.camera.distance, faces: scene.primitives.map(entry => entry.face ?? entry.object),
    objects: scene.objects.map(object => ({ id: object.id, parts: object.parts.map(part => `${part.kind}:${part.material}`), t: Math.round(object.t * 10000) / 10000, state: object.parts[0].state,
      close: object.bounds.rect.every((value, index) => Math.abs(value - box(object.id)[index]) < 0.01), casters: object.parts.map(part => part.caster === undefined ? "own" : part.caster === null ? "none" : part.caster.height) })) };
});
const counts = page => page.evaluate(() => window.strataSwitchProbe.counts());

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) every form is drawn as parts that stay in its input's box and take native hits`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const scene = await sceneOf(page);
  expect(scene).toMatchObject({ version: 4, kind: "instrument", material: "instrument", camera: 2400 });
  expect(scene.objects.map(object => object.id)).toEqual(sceneIds);
  for (const object of scene.objects) {
    const form = object.id.replace(/-(off|on)$/, "").replace("locked", "bat");
    expect(object.parts, `${object.id}: parts`).toEqual(parts[form]);
    expect(object.close, `${object.id}: bounds are the input's box`).toBe(true);
    expect(object.t, `${object.id}: t from the CSS throw`).toBe(object.id.endsWith("-on") ? 1 : 0);
  }
  // The slots stay grooves on the face; the plain Strata switch stays Relief.
  expect(scene.faces.filter(face => face === "groove")).toHaveLength(2);
  expect(scene.objects.find(object => object.id === "locked").state).toEqual({ hover: false, disabled: true });
  console.log(`DPR ${dpr}: ${scene.objects.length} objects, ${scene.objects.reduce((sum, object) => sum + object.parts.length, 0)} parts`);
  await healthy(page, "start");
  // The CSS paint of the parts the GPU draws is hidden: no moving part shows its own face.
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-switch__object [data-strata-face]")].filter(element => !element.matches(".ug-switch__slot") && !element.hasAttribute("data-strata-dome")).map(element => `${element.closest(".ug-switch").querySelector("input").id} ${element.className}`))).toEqual([]);

  for (const id of allIds) {
    const result = await gridHits(page, id, dpr === 2 ? 21 : 11);
    expect(result.misses, `${id}: hits over the box`).toEqual([]);
  }
  console.log(`DPR ${dpr}: ${allIds.length} boxes × ${dpr === 2 ? 441 : 121} grid hits, 0 mismatches`);

  const inputs = await inFrame(page, ".ug-switch[data-strata-form] > .ug-switch__input");
  const plain = (await inFrame(page, "#plain"))[0];
  // Containment: against the page with the objects hidden, the objects draw inside the boxes only, at three depths and
  // three poses, and native hits on every changed pixel find an input.
  const results = [];
  for (const level of [0, null, 1]) {
    await depth(page, level);
    const label = level === null ? "0.5" : String(level);
    await objectsHidden(page, true);
    const bare = await frame(page, `dpr${dpr}-depth${label}-bare`);
    await objectsHidden(page, false);
    for (const t of [0, 0.5, 1]) {
      await pose(page, t);
      const drawn = difference(await frame(page, `dpr${dpr}-depth${label}-t${t}`), bare, [...inputs, plain], { points: true });
      expect(drawn.inside, `depth ${label}, t ${t}: the objects are drawn`).toBeGreaterThan(3000 * dpr * dpr);
      expect(drawn.outside, `depth ${label}, t ${t}: no object pixel outside a box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
      const hit = await hitsOn(page, drawn.changed);
      expect(hit.mismatches, `depth ${label}, t ${t}: native hits on object pixels`).toBe(0);
      await healthy(page, `depth ${label}, t ${t}`);
      results.push(`depth ${label} t ${t}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
      console.log(`DPR ${dpr}: ${results.at(-1)}`);
    }
    await pose(page, null);
    if (level === 1) {
      // At full depth the casters of the parts that stand still or slide are capped, the tilting ones cast none.
      const deep = await sceneOf(page);
      const slide = deep.objects.find(object => object.id === "slide-off").casters, rocker = deep.objects.find(object => object.id === "rocker-off").casters;
      expect(typeof slide[1], "the slide block's caster is capped").toBe("number");
      expect(rocker[1], "the rocker's paddle casts none").toBe("none");
      console.log(`DPR ${dpr}: full depth casters: slide block ${slide[1]}, rocker bezel ${rocker[0]}, wall plate ${deep.objects.find(object => object.id === "wall-off").casters[0]}`);
    }
  }
  await depth(page, null);
  await frame(page, `dpr${dpr}-depth-back`);

  // In flight: a real throw slowed to 3 s, caught at three moments.
  await objectsHidden(page, true);
  const bare = await frame(page, `dpr${dpr}-flight-bare`);
  await objectsHidden(page, false);
  await page.evaluate(() => { for (const root of document.querySelectorAll(".ug-switch[data-strata-form]")) root.style.setProperty("--_throw-duration", "3000ms"); });
  await page.evaluate(() => { for (const id of ["slide-off", "rocker-off", "bat-off", "wall-off"]) document.getElementById(id).click(); });
  for (const moment of [1, 2, 3]) {
    const flight = await frame(page, `dpr${dpr}-flight-${moment}`, { wait: 350 });
    const t = await page.locator("#rocker-off").evaluate(input => getComputedStyle(input.closest(".ug-switch")).getPropertyValue("--strata-switch-t").trim());
    const readout = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#switch-read"))[0]);
    const drawn = difference(flight, bare, [...inputs, plain, readout], { points: true });
    expect(drawn.outside, `in flight (t ${t}): no object pixel outside a box (${JSON.stringify(drawn.outsideSamples)})`).toBe(0);
    // The readout prints the count, which the first click changed: its pixels are text, not an object.
    const hit = await hitsOn(page, drawn.changed.filter(([x, y]) => !(x >= readout.x && x <= readout.x + readout.width && y >= readout.y && y <= readout.y + readout.height)));
    expect(hit.mismatches, `in flight (t ${t}): native hits on object pixels`).toBe(0);
    await healthy(page, `in flight ${moment}`);
    console.log(`DPR ${dpr}: in flight, rocker t = ${t}: ${drawn.inside} px inside, ${drawn.outside} outside, ${hit.total} hits ${hit.mismatches} mismatches`);
  }
  await page.evaluate(() => { for (const root of document.querySelectorAll(".ug-switch[data-strata-form]")) root.style.removeProperty("--_throw-duration"); });
  expect(errors).toEqual([]);
  await context.close();
});

test("without the casters' caps the shadows of the slide's block and the plates leave the boxes at full depth, and with them they do not", async ({ page }) => {
  test.setTimeout(240000);
  await ready(page);
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-depth", "1"));
  const inputs = await inFrame(page, ".ug-switch[data-strata-form] > .ug-switch__input");
  const plain = (await inFrame(page, "#plain"))[0];
  await objectsHidden(page, true);
  const bare = await frame(page, "control-bare");
  await objectsHidden(page, false);
  const capped = difference(await frame(page, "control-capped"), bare, [...inputs, plain]);
  expect(capped.outside, "with the caps").toBe(0);
  // The control: the same scene with its explicit casters removed, so core derives each from the part (mean height).
  const removed = await page.evaluate(async () => {
    const probe = window.strataSwitchProbe, scene = probe.scene();
    let removed = 0;
    for (const object of scene.objects) for (const part of object.parts) if (part.caster) { delete part.caster; removed++; }
    probe.controller.setMaterial("switch-panel", { kind: "instrument", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
    await probe.controller.settle();
    return removed;
  });
  expect(removed, "casters were capped").toBeGreaterThan(0);
  const uncapped = difference(await frame(page, "control-uncapped", { wait: 800 }), bare, [...inputs, plain]);
  console.log(`full depth: with the caps ${capped.inside} px inside the boxes, ${capped.outside} outside; without them (${removed} casters left to core) ${uncapped.inside} inside, ${uncapped.outside} outside ${JSON.stringify(uncapped.outsideSamples)}`);
  expect(uncapped.outside, "the control: shadows leave the boxes without the caps").toBeGreaterThan(0);
});

for (const dpr of [1, 2]) test(`at the Instrument level (DPR ${dpr}) real throws give fresh pixels only in the boxes, and the frames of a throw add no capture or hit-geometry update`, async ({ browser }) => {
  test.setTimeout(480000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const inputs = await inFrame(page, ".ug-switch[data-strata-form] > .ug-switch__input");
  const ring = await page.evaluate(() => { const style = getComputedStyle(document.documentElement); return Number.parseFloat(style.getPropertyValue("--strata-focus-width")) + Number.parseFloat(style.getPropertyValue("--strata-focus-offset")) + 2; });
  const read = (box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))((await inFrame(page, "#switch-read"))[0]);
  const allowed = [...inputs.map(box => ({ x: box.x - ring, y: box.y - ring, width: box.width + 2 * ring, height: box.height + 2 * ring })), read];
  let before = await frame(page, `throws-dpr${dpr}-start`);
  for (const id of formIds) {
    const box = await page.locator(`#${id}`).boundingBox();
    const was = await checked(page, id);
    await page.mouse.click(...centreOf(box));
    expect(await checked(page, id)).toBe(!was);
    const after = await frame(page, `throws-dpr${dpr}-${id}`, { wait: 700 });
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${id}: pixels change in its box`).toBeGreaterThan(80);
    expect(changed.outside, `${id}: no pixel changes outside the boxes (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    await healthy(page, id);
    console.log(`DPR ${dpr}: ${id} thrown → ${changed.inside} px changed in the boxes, ${changed.outside} outside`);
    before = after;
  }
  // Real drags past centre throw them too.
  for (const form of forms) {
    const box = await page.locator(`#${form}-off`).boundingBox(), was = await checked(page, `${form}-off`);
    await drag(page, ...along(form, box, was ? 0.85 : 0.15, was ? 0.15 : 0.85));
    expect(await checked(page, `${form}-off`), `${form} dragged past centre`).toBe(!was);
  }
  await page.mouse.move(2, 2);
  await healthy(page, "after drags");

  // Frames of a throw: a native change is captured once (in its frame or the next); the frames of the spring that
  // follow add no capture, upload or hit-geometry update, and the throw's t moves through in-between values.
  await page.evaluate(() => { document.getElementById("switch-read").style.visibility = "hidden"; });
  await frame(page, `throws-dpr${dpr}-quiet`, { wait: 700 });
  const flights = [];
  for (const id of ["slide-off", "rocker-off", "bat-off", "wall-off"]) {
    const flight = await page.evaluate(async id => {
      const probe = window.strataSwitchProbe, input = document.getElementById(id), root = input.closest(".ug-switch"), next = () => new Promise(requestAnimationFrame);
      for (let index = 0; index < 5; index++) await next();
      const start = probe.counts();
      input.click();
      let previous = start, extra = 0, frames = 0, between = 0, last = -1, t = 0, steppedDown = 0;
      for (let index = 0; index < 60; index++) {
        await next();
        const now = probe.counts();
        t = Number(getComputedStyle(root).getPropertyValue("--strata-switch-t"));
        if (t > 0.02 && t < 0.98) between++;
        if (index >= 2) extra += now.captures - previous.captures;
        if (t !== last) frames++;
        last = t; previous = now;
        const layer = probe.instrument().layers[0];
        if (layer.steppedDown.length || layer.status !== "ready") steppedDown++;
      }
      const end = probe.counts();
      return { id, frames, between, extra, captures: end.captures - start.captures, uploads: end.uploads - start.uploads, geometryUpdates: end.geometryUpdates - start.geometryUpdates, mode: end.mode, steppedDown, t };
    }, id);
    flights.push(flight);
    console.log(`DPR ${dpr}: ${id} throw, 60 frames: ${flight.between} frames in between, ${flight.captures} captures (${flight.extra} after the first two frames), ${flight.uploads} uploads, ${flight.geometryUpdates} hit-geometry updates, ${flight.steppedDown} frames stepped down`);
    expect(flight.mode).toBe("gpu");
    expect(flight.t, `${id}: reached its stop`).toBe(1);
    expect(flight.between, `${id}: the throw is seen in between`).toBeGreaterThan(1);
    expect(flight.extra, `${id}: frames of the spring add no capture`).toBe(0);
    expect(flight.captures, `${id}: the native change is captured at most once`).toBeLessThanOrEqual(1);
    expect(flight.geometryUpdates, `${id}: no hit-geometry update`).toBe(0);
    expect(flight.steppedDown, `${id}: nothing stepped down during the throw`).toBe(0);
  }
  await healthy(page, "throws");
  expect(errors).toEqual([]);
  await context.close();
});

test("hover and disabled reach the parts, pressing does not sink them, and the GPU draws no focus edge", async ({ page }) => {
  await ready(page);
  const stateOf = id => page.evaluate(id => window.strataSwitchProbe.scene().objects.find(object => object.id === id).parts.map(part => part.state), id);
  const settle = () => page.evaluate(async () => { window.strataSwitchProbe.refresh(); await window.strataSwitchProbe.controller.settle(); });
  await settle();
  expect((await stateOf("slide-off")).every(state => state.hover === false && state.disabled === false)).toBe(true);
  const box = await page.locator("#slide-off").boundingBox();
  await page.mouse.move(...centreOf(box));
  await settle();
  expect((await stateOf("slide-off")).every(state => state.hover === true && state.disabled === false), "hover").toBe(true);
  expect((await stateOf("rocker-off")).every(state => state.hover === false)).toBe(true);
  await page.mouse.down();
  await settle();
  expect((await stateOf("slide-off")).every(state => state.hover === true && state.disabled === false), "pressed: no sink, only the input's hover").toBe(true);
  expect(await page.evaluate(() => Object.keys(window.strataSwitchProbe.scene().objects[0].parts[1].state).sort())).toEqual(["disabled", "hover"]);
  await page.mouse.up();
  expect((await stateOf("locked")).every(state => state.disabled === true && state.hover === false), "disabled").toBe(true);
  await page.locator("#wall-off").focus();
  await page.keyboard.press("Tab");
  await settle();
  const scene = await page.evaluate(() => window.strataSwitchProbe.scene());
  expect(scene.primitives.some(entry => entry.state?.focus), "no focus state on any primitive").toBe(false);
  expect(scene.objects.some(object => object.parts.some(part => part.state.focus)), "no focus state on any part").toBe(false);
  await healthy(page, "states");
});

test("under reduced motion a throw snaps at once and the parts are posed at the new stop in the first frame", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await ready(page);
  for (const form of forms) {
    const id = `${form}-off`;
    await page.locator(`#${id}`).click();
    const t = await page.evaluate(async id => {
      await new Promise(requestAnimationFrame);
      window.strataSwitchProbe.refresh();
      return window.strataSwitchProbe.scene().objects.find(object => object.id === id).t;
    }, id);
    expect(t, `${form}: posed at its stop in the first frame`).toBe(1);
  }
  await healthy(page, "reduced motion");
  await context.close();
});

for (const width of [390, 320]) test(`touch at ${width} px: taps and drags past centre throw every form at the Instrument level, a held drag does not, and the page does not scroll`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page);
  const client = await context.newCDPSession(page);
  const touch = async (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const swipe = async ([x, y], [x1, y1]) => {
    await touch("touchStart", [{ x, y }]);
    for (let step = 1; step <= 10; step++) await touch("touchMove", [{ x: x + ((x1 - x) * step) / 10, y: y + ((y1 - y) * step) / 10 }]);
    await touch("touchEnd", []);
    await page.waitForTimeout(80);
  };
  for (const form of forms) {
    const id = `${form}-off`;
    await page.locator(`#${id}`).scrollIntoViewIfNeeded();
    const scroll = await page.evaluate(() => [window.scrollX, window.scrollY]);
    await page.waitForTimeout(100);
    const box = await page.locator(`#${id}`).boundingBox();
    expect(box.x + box.width, `${form}: the box is within the viewport`).toBeLessThanOrEqual(width + 0.5);
    expect(Math.min(box.width, box.height), `${form}: target size`).toBeGreaterThanOrEqual(24);
    await page.touchscreen.tap(...centreOf(box));
    expect(await checked(page, id), `${form}: tap`).toBe(true);
    await page.waitForTimeout(700);
    await swipe(...along(form, box, 0.85, 0.15));
    expect(await checked(page, id), `${form}: touch drag past centre`).toBe(false);
    await page.waitForTimeout(700);
    await swipe(...along(form, box, 0.1, 0.4));
    expect(await checked(page, id), `${form}: touch drag held short of centre`).toBe(false);
    expect(await page.evaluate(() => [window.scrollX, window.scrollY]), `${form}: no scroll`).toEqual(scroll);
    await healthy(page, `${form} at ${width}`);
  }
  console.log(`touch at ${width} px (Instrument): every form tapped on, dragged off past centre, held short of centre, no scroll, GPU on, nothing stepped down`);
  await page.screenshot({ path: `${evidence}/touch-${width}.png` });
  await context.close();
});

test("the Instrument page keeps the accessibility snapshot of the DOM and passes axe", async ({ page }) => {
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
  await healthy(page, "after keys");
  const { violations } = await new AxeBuilder({ page }).include("#switch-panel").withTags(tags).analyze();
  expect(summary(violations), "axe on the GPU page").toEqual([]);
});
