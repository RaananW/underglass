/**
 * Browser suite for the showcase's Instrument gallery and showpiece (`#/instrument`, `examples/showcase/src/instrument.tsx`), DPR 1 and 2.
 * The showcase is served by a Vite dev server this suite starts (and closes) on a free port, under the `/underglass/` base.
 * - **Every component at every level:** each tab (the synthesiser, wave 1, wave 2, wave 3, the everyday forms, the input forms, the notes) at the CSS,
 *   Relief, Objects and Instrument levels with GPU on throughout; at the Instrument level every layer is built from parts with nothing
 *   stepped down, and the parts and emitters of each panel are inside the plan's budgets (2,048 parts and 64 emitters per layer, 16
 *   materials). The totals are printed and must equal the numbers the page's notes state.
 * - **Native hits:** every visible native control of the content panels takes its own hit at its centre and four inset points (0 mismatches).
 * - **The showpiece is wired:** a real key on the Cutoff knob moves the filter gauge and the output meter, the power switch blanks the display
 *   and the meter, a held Trigger and the Hold button open the gate, a patch jack lights its LED and opens the filter, the wheel loads a patch;
 *   the pixels that change lie inside the panels (the bar and the wall past the panels' outset do not change).
 * - **Switches:** the character (studio) and theme (dark) keep GPU and the built layers; the pointer light writes only emitters.
 * - **Accessibility:** axe on the stage in light and dark; at 320 px the page does not scroll sideways, the stage has no horizontal scroll and
 *   every control keeps a 24 px target.
 * Screenshots go to the `showcase-instrument` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import AxeBuilder from "@axe-core/playwright";
import { createServer } from "vite";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("showcase-instrument");
const tabs = ["showpiece", "wave1", "wave2", "wave3", "everyday", "inputs", "notes"];
const levels = ["css", "relief", "objects", "instrument"];
let server, base;

test.beforeAll(async () => {
  server = await createServer({ root: fileURLToPath(new URL("../../examples/showcase", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false }, logLevel: "silent" });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}/underglass/`;
});
test.afterAll(async () => { await server?.close(); });

/** Opens the gallery, turns GPU on and waits for the layers to be presented. */
async function open(browser, { dpr = 1, width = 1280, height = 900, gpu = true, colorScheme = "light", reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, colorScheme, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}#/instrument`);
  await page.waitForFunction(() => window.showcase && window.instrumentGallery);
  if (gpu) {
    await page.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
    await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting", null, { timeout: 60000 });
  }
  await page.locator(".stage").scrollIntoViewIfNeeded();
  return { context, page, errors };
}
const gallery = (page, call, ...args) => page.evaluate(([call, args]) => window.instrumentGallery[call](...args), [call, args]);
/** Waits until every Instrument layer is built (or the level has none) and the compositor is idle. */
async function settle(page) {
  await page.waitForFunction(() => { const i = window.showcase.state().instrument; return !i || (!i.compile.building && i.layers.every(layer => layer.status !== "pending")); }, null, { timeout: 60000 });
  await page.evaluate(async () => { await window.showcase.controller.settle(); for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); await window.showcase.controller.settle(); });
}
const select = async (page, tab, level) => {
  await page.evaluate(([tab, level]) => { window.instrumentGallery.setTab(tab); window.instrumentGallery.setLevel(level); }, [tab, level]);
  await page.waitForFunction(([tab, level]) => window.instrumentGallery.tab === tab && window.instrumentGallery.level === level && document.getElementById(`ig-tabs-panel-${tab}`), [tab, level]);
  await page.waitForTimeout(300);
  await settle(page);
};
const stateOf = page => page.evaluate(() => {
  const state = window.showcase.state(), strata = window.instrumentGallery;
  return { mode: state.mode, reason: state.reason, instrument: state.instrument && { layers: state.instrument.layers.map(layer => ({ id: layer.id, status: layer.status, parts: layer.parts, drawn: layer.drawnParts,
    steppedDown: layer.steppedDown, objects: layer.objects, emitters: strata.scene(document.getElementById(layer.id))?.emitters?.length ?? 0, materials: Object.keys(strata.scene(document.getElementById(layer.id))?.materials ?? {}).length })), budgets: state.instrument.budgets } };
});
const contentPanels = page => page.evaluate(() => [...document.querySelectorAll(".ig-content")].map(panel => panel.id));

for (const dpr of [1, 2]) {
  test(`DPR ${dpr}: every component renders at every level with GPU on, nothing stepped down, and the budgets hold`, async ({ browser }) => {
    test.setTimeout(600000);
    const { context, page, errors } = await open(browser, { dpr });
    const totals = {};
    const stated = await page.evaluate(() => window.instrumentGallery.materials);
    for (const tab of tabs) for (const level of levels) {
      await select(page, tab, level);
      const state = await stateOf(page);
      expect(state.mode, `${tab} at ${level}: ${state.reason}`).toBe("gpu");
      const panels = await contentPanels(page);
      expect(panels.length, `${tab}: panels`).toBeGreaterThan(0);
      if (level === "instrument") {
        const ids = ["ig-bar", ...panels];
        for (const id of ids) {
          const layer = state.instrument.layers.find(candidate => candidate.id === id);
          expect(layer, `${tab}: ${id} is an Instrument layer`).toBeTruthy();
          expect(layer.status, `${tab}: ${id}`).toBe("ready");
          expect(layer.steppedDown, `${tab}: ${id} nothing stepped down`).toEqual([]);
          expect(layer.drawn, `${tab}: ${id} parts drawn`).toBe(layer.parts);
          expect(layer.parts, `${tab}: ${id} parts per layer`).toBeLessThanOrEqual(2048);
          expect(layer.emitters + 1, `${tab}: ${id} emitters per layer, with the pointer light`).toBeLessThanOrEqual(64);
          expect(layer.materials, `${tab}: ${id} materials per layer`).toBeLessThanOrEqual(16);
        }
        // The helper's own account of each panel (#178): the materials it counts, under the cap, with no key body trimmed to Relief to fit.
        const reports = await page.evaluate(ids => ids.map(id => { const report = window.instrumentGallery.diagnostics(document.getElementById(id)); return { id, count: report?.materials.count, cap: report?.materials.cap, keysAtRelief: report?.keysAtRelief }; }), panels);
        for (const report of reports) {
          const layer = state.instrument.layers.find(candidate => candidate.id === report.id);
          expect(report.count, `${tab}: ${report.id} diagnostics count the scene's materials`).toBe(layer.materials);
          expect(report.count, `${tab}: ${report.id} is under the cap`).toBeLessThanOrEqual(report.cap);
          expect(report.keysAtRelief, `${tab}: ${report.id} no key trimmed to Relief`).toEqual([]);
          expect(stated?.[report.id]?.[1], `${tab}: ${report.id} the notes' material count is the measured one`).toBe(report.count);
        }
        totals[tab] = panels.map(id => { const layer = state.instrument.layers.find(candidate => candidate.id === id); return { id, parts: layer.parts, emitters: layer.emitters, materials: layer.materials }; });
      } else expect(state.instrument?.layers.length ?? 0, `${tab} at ${level}: no Instrument layers`).toBe(0);
      // Every enrolled content panel is a layer of the compositor.
      const layers = await page.evaluate(() => window.showcase.state().layers.map(layer => layer.id));
      for (const id of panels) expect(layers, `${tab} at ${level}: ${id} is presented`).toContain(id);
    }
    // The notes state the totals measured here (parts and emitters of the panels of each tab, summed).
    console.log(`DPR ${dpr} budgets`, JSON.stringify(totals));
    const budgets = await page.evaluate(() => window.instrumentGallery.budgets);
    for (const tab of tabs.filter(name => name !== "notes")) {
      const sum = key => totals[tab].reduce((total, panel) => total + panel[key], 0);
      expect(budgets[tab], `${tab}: the notes' numbers are the measured ones`).toEqual({ parts: sum("parts"), emitters: sum("emitters") });
    }
    expect(errors).toEqual([]);
    await context.close();
  });

  test(`DPR ${dpr}: native hits on every control of every group, 0 mismatches`, async ({ browser }) => {
    test.setTimeout(300000);
    const { context, page } = await open(browser, { dpr });
    let checked = 0;
    for (const tab of tabs.filter(name => name !== "notes")) {
      await select(page, tab, "instrument");
      const result = await page.evaluate(() => {
        const misses = []; let total = 0;
        for (const control of document.querySelectorAll(".ig-content :is(input:not([type=hidden]), select, button, meter, output)")) {
          if (!control.checkVisibility()) continue;
          control.scrollIntoView({ block: "center" });
          const box = control.getBoundingClientRect();
          if (box.width < 2 || box.height < 2) continue;
          for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
            const x = box.left + box.width * fx, y = box.top + box.height * fy;
            if (y < 0 || y > innerHeight) continue;
            total++;
            const hit = document.elementFromPoint(x, y);
            if (!hit || (hit !== control && !control.contains(hit) && hit.closest("label, button, fieldset, select") !== control.closest("label, button, fieldset, select") && !(control.labels && [...control.labels].includes(hit.closest("label"))))) misses.push(`${control.id || control.tagName}@${fx},${fy}: ${hit?.className || hit?.tagName}`);
          }
        }
        return { total, misses };
      });
      // Controls off the first screen are scrolled to; the sample above skips what is outside the window, so scroll through the stage too.
      await page.evaluate(() => window.scrollTo(0, 0));
      checked += result.total;
      expect(result.misses, `${tab}: hit mismatches`).toEqual([]);
    }
    expect(checked).toBeGreaterThan(300);
    console.log(`DPR ${dpr} hit samples`, checked);
    await context.close();
  });
}

/** The stage's canvas decoded. */
const frame = async (page, name) => {
  await page.mouse.move(2, 2);
  await settle(page);
  await page.waitForTimeout(700);
  await settle(page);
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator(".stage .output").screenshot({ path: `${evidence}/${name}.png` }));
};
/** Pixels that differ between two frames, split into those inside `allowed` boxes (stage CSS px) and outside them. */
function difference(a, b, allowed, dpr) {
  let inside = 0, outside = 0;
  for (let y = 0; y < Math.min(a.height, b.height); y++) for (let x = 0; x < Math.min(a.width, b.width); x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / dpr, py = (y + 0.5) / dpr;
    if (allowed.some(box => px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height)) inside++; else outside++;
  }
  return { inside, outside };
}
const stageBoxes = (page, ids, grow = 0) => page.evaluate(([ids, grow]) => {
  const stage = document.querySelector(".stage").getBoundingClientRect();
  return ids.map(id => { const box = document.getElementById(id).getBoundingClientRect(); return { x: box.left - stage.left - grow, y: box.top - stage.top - grow, width: box.width + 2 * grow, height: box.height + 2 * grow }; });
}, [ids, grow]);
const text = (page, selector) => page.locator(selector).innerText();

for (const dpr of [1, 2]) {
  test(`DPR ${dpr}: the synthesiser is wired through real input, GPU stays on, and only the panels' pixels change`, async ({ browser }) => {
    test.setTimeout(300000);
    const { context, page, errors } = await open(browser, { dpr });
    await select(page, "showpiece", "instrument");
    const modules = ["ig-tabs-panel-showpiece", "syn-sound", "syn-output", "syn-patch"];
    const keep = async label => { await settle(page); const state = await stateOf(page); expect(state.mode, `${label}: ${state.reason}`).toBe("gpu"); for (const layer of state.instrument.layers) { expect(layer.status, `${label}: ${layer.id}`).toBe("ready"); expect(layer.steppedDown, `${label}: ${layer.id}`).toEqual([]); } };
    const meter = () => page.locator("#syn-meter").evaluate(node => node.value);
    const gauge = () => page.locator("#syn-gauge").evaluate(node => node.value);
    await keep("start");
    const start = await frame(page, `synth-start-dpr${dpr}`);
    const before = { meter: await meter(), gauge: await gauge(), display: await text(page, "#syn-display") };
    expect(before.meter, "the gate is open on Hold").toBeGreaterThan(0);

    // A real key turns the Cutoff knob: the gauge follows it, and so does the meter.
    await page.locator("#syn-cutoff").focus();
    for (let step = 0; step < 15; step++) await page.keyboard.press("ArrowRight");
    await keep("cutoff");
    expect(await gauge(), "the gauge follows the cutoff").toBeGreaterThan(before.gauge);
    expect(await meter(), "the meter follows the filter").toBeGreaterThan(before.meter);
    const turned = await frame(page, `synth-cutoff-dpr${dpr}`);
    const allowed = await stageBoxes(page, modules, 70);
    const changed = difference(start, turned, allowed, dpr);
    expect(changed.inside, "the turn changes pixels").toBeGreaterThan(200);
    expect(changed.outside, "no pixel changes outside the panels (and their shadows)").toBe(0);
    const bar = (await stageBoxes(page, ["ig-bar"]))[0];
    expect(difference(start, turned, [bar], dpr).inside, "the bar does not change").toBe(0);

    // The Level fader sets the meter; the Clip light follows a hot output.
    await page.locator("#syn-level").focus();
    await page.keyboard.press("End");
    await page.locator("#syn-reso").focus();
    await page.keyboard.press("End");
    expect(await meter(), "a hot output").toBeGreaterThan(85);
    await expect(page.locator("#syn-clip")).toContainText("Clip");
    expect(await page.locator("#syn-clip").evaluate(node => getComputedStyle(node).getPropertyValue("--strata-lit").trim()), "the clip light is lit").not.toBe("0");
    await keep("hot");

    // A patch jack lights its LED and opens the filter by a step.
    const gaugeBefore = await gauge();
    await page.locator("#syn-patch-envCut").evaluate(node => node.scrollIntoView({ block: "center" }));
    const jack = await page.locator("#syn-patch-envCut").boundingBox();
    await page.mouse.click(jack.x + jack.width / 2, jack.y + jack.height / 2);
    await expect(page.locator("#syn-patch-envCut")).toBeChecked();
    expect(await gauge(), "the patch opens the filter").toBeGreaterThan(gaugeBefore);
    await settle(page);
    expect(await page.evaluate(() => { const led = document.querySelector("#syn-patch-envCut").closest("label").querySelector(".ug-status-light__lens, .ug-patch-point__led"); return getComputedStyle(led.closest(".ug-status-light")).getPropertyValue("--strata-lit").trim(); }), "its LED is lit").not.toBe("0");
    await keep("patch");

    // The wheel loads a patch into the knobs and the display.
    await page.locator("#syn-jog").focus();
    await page.keyboard.press("ArrowUp");
    await settle(page);
    expect(await text(page, "#syn-display")).toMatch(/^P04 /);
    expect(await page.locator("#syn-cutoff").inputValue()).toBe(String(Math.round(30 + ((3 * 37) % 60))));
    await keep("patch loaded");

    // The Trigger, held by a real pointer, opens the gate when Hold is off.
    await page.locator("#syn-hold").click();
    await expect(page.locator("#syn-hold")).toHaveAttribute("aria-pressed", "false");
    await settle(page);
    expect(await meter(), "no gate, no output").toBe(0);
    await page.locator("#syn-trigger").scrollIntoViewIfNeeded();
    const trigger = await page.locator("#syn-trigger").boundingBox();
    await page.mouse.move(trigger.x + trigger.width / 2, trigger.y + trigger.height / 2);
    await page.mouse.down();
    await expect.poll(meter).toBeGreaterThan(0);
    await page.mouse.up();
    await expect.poll(meter).toBe(0);
    await keep("trigger");

    // The power switch blanks the display and the lights.
    await page.locator("#syn-hold").click();
    await page.locator("#syn-power").evaluate(node => node.scrollIntoView({ block: "center" }));
    const power = await page.locator("#syn-power").boundingBox();
    await page.mouse.click(power.x + power.width / 2, power.y + power.height / 2);
    await expect(page.locator("#syn-power")).not.toBeChecked();
    await settle(page);
    expect(await text(page, "#syn-display")).toBe("----");
    expect(await meter()).toBe(0);
    await keep("power off");
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("the four characters (premium, studio, hifi, playful) keep GPU and the built layers on every group", async ({ browser }) => {
  test.setTimeout(600000);
  const { context, page, errors } = await open(browser, { dpr: 1 });
  for (const [character, label] of [["studio", "Studio"], ["hifi", "Hi-fi"], ["playful", "Playful"], ["premium", "Premium"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveAttribute("aria-pressed", "true");
    for (const tab of tabs.filter(name => name !== "notes")) {
      await select(page, tab, "instrument");
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-strata-character")), `${character}: the scope`).toBe(character === "premium" ? null : character);
      const state = await stateOf(page);
      expect(state.mode, `${character} ${tab}: ${state.reason}`).toBe("gpu");
      for (const layer of state.instrument.layers) { expect(layer.status, `${character} ${tab}: ${layer.id}`).toBe("ready"); expect(layer.steppedDown, `${character} ${tab}: ${layer.id}`).toEqual([]); expect(layer.drawn).toBe(layer.parts); expect(layer.materials).toBeLessThanOrEqual(16); }
    }
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("the dialog plate and the drawer tray open from the everyday forms with GPU on, and close again", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, errors } = await open(browser, { dpr: 1 });
  await select(page, "everyday", "instrument");
  for (const [button, panel] of [["#ig-open-dialog", "#ig-dialog"], ["#ig-open-drawer", "#ig-drawer"]]) {
    await page.locator(button).evaluate(node => node.scrollIntoView({ block: "center" }));
    const box = await page.locator(button).boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(panel)).toBeVisible();
    await page.waitForFunction(id => window.showcase.state().instrument?.layers.some(layer => layer.id === id && layer.status === "ready"), panel.slice(1), { timeout: 60000 });
    await settle(page);
    const state = await stateOf(page);
    expect(state.mode, `${panel} open: ${state.reason}`).toBe("gpu");
    const layer = state.instrument.layers.find(candidate => candidate.id === panel.slice(1));
    expect(layer, `${panel} is an Instrument layer`).toBeTruthy();
    expect(layer.steppedDown, `${panel}: nothing stepped down`).toEqual([]);
    expect(layer.materials).toBeLessThanOrEqual(16);
    for (const candidate of state.instrument.layers) expect(candidate.status, `${panel} open: ${candidate.id}`).toBe("ready");
    await page.keyboard.press("Escape");
    await expect(page.locator(panel)).toBeHidden();
    await settle(page);
    expect((await stateOf(page)).mode, `${panel} closed`).toBe("gpu");
  }
  expect(errors).toEqual([]);
  await context.close();
});

test("the new forms work through real input with GPU on: pads, keypad, checkbox, radio bank, segmented control, select forms, the tabs rail and the synthesiser's pads and keypad", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, errors } = await open(browser, { dpr: 1 });
  const click = async selector => { await page.locator(selector).evaluate(node => node.scrollIntoView({ block: "center" })); const box = await page.locator(selector).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await settle(page); };
  const keep = async label => { const state = await stateOf(page); expect(state.mode, `${label}: ${state.reason}`).toBe("gpu"); for (const layer of state.instrument.layers) { expect(layer.status, `${label}: ${layer.id}`).toBe("ready"); expect(layer.steppedDown, `${label}: ${layer.id}`).toEqual([]); } };
  await select(page, "wave3", "instrument");
  await click("#ig-pad-hat");
  await expect(page.locator("#ig-pad-hat")).toHaveAttribute("aria-pressed", "true");
  await click("#ig-pad-clap");
  await expect(page.locator("#ig-pad-clap")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#ig-pad-kick").focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.id), "the arrow keys move between pads").toBe("ig-pad-snare");
  await click("#ig-key-5");
  await keep("pads and keypad");
  await select(page, "inputs", "instrument");
  await click("#ig-check-2");
  await expect(page.locator("#ig-check-2")).toBeChecked();
  await click("label:has(#ig-check-1)");
  await expect(page.locator("#ig-check-1")).not.toBeChecked();
  await click("#ig-bank label:has(input[value=c])");
  await expect(page.locator("#ig-bank input[value=c]")).toBeChecked();
  await expect(page.locator("#ig-bank input[value=b]")).not.toBeChecked();
  await click("#ig-segmented label:has(input[value=grid])");
  await expect(page.locator("#ig-segmented input[value=grid]")).toBeChecked();
  await page.locator("#ig-select-selector").focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator("#ig-select-selector").inputValue()).toBe("square");
  await page.locator("#ig-select-display").focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.locator("#ig-select-display").inputValue()).toBe("us");
  await click("#ig-rail-tab-two");
  await expect(page.locator("#ig-rail-tab-two")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#ig-rail-panel-two")).toBeVisible();
  await keep("input forms");
  // The synthesiser: a held pad opens the gate at its note, the keypad types a patch number and # loads it.
  await select(page, "showpiece", "instrument");
  await page.locator("#syn-hold").click();
  await settle(page);
  const meter = () => page.locator("#syn-meter").evaluate(node => node.value);
  expect(await meter(), "no gate, no output").toBe(0);
  await page.locator("#syn-pad-4").evaluate(node => node.scrollIntoView({ block: "center" }));
  const pad = await page.locator("#syn-pad-4").boundingBox();
  await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
  await page.mouse.down();
  await expect.poll(meter).toBeGreaterThan(0);
  expect(await text(page, "#syn-display"), "the display prints the held note's pitch").toMatch(/Hz$/);
  await page.mouse.up();
  await expect.poll(meter).toBe(0);
  await click("#syn-key-1");
  await click("#syn-key-2");
  expect(await text(page, "#syn-display")).toMatch(/^P12 ENTRY/);
  await click("#syn-key-enter");
  expect(await text(page, "#syn-display")).toMatch(/^P12 /);
  await click("#syn-key-3");
  await click("#syn-key-clear");
  expect(await text(page, "#syn-display")).toMatch(/^P12 /);
  await keep("synthesiser pads and keypad");
  expect(errors).toEqual([]);
  await context.close();
});

test("the character, the theme and the pointer light keep GPU and the built layers; the light writes only emitters", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page, errors } = await open(browser, { dpr: 1 });
  await select(page, "showpiece", "instrument");
  const built = async label => { const state = await stateOf(page); expect(state.mode, `${label}: ${state.reason}`).toBe("gpu"); for (const layer of state.instrument.layers) { expect(layer.status, `${label}: ${layer.id}`).toBe("ready"); expect(layer.steppedDown, `${label}: ${layer.id}`).toEqual([]); } return state; };
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-strata-character"))).toBe("studio");
  await built("studio");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await settle(page);
  expect(await page.evaluate(() => window.showcase.controller.container.getAttribute("data-strata-theme"))).toBe("dark");
  await built("dark");
  await page.getByRole("button", { name: "Premium", exact: true }).click();
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await settle(page);
  await built("premium light");
  // The pointer light: moving the pointer over the panels writes uniforms (emitters) and no capture.
  await page.evaluate(() => window.scrollTo(0, 0));
  const writes = await page.evaluate(() => window.instrumentGallery.light());
  expect(writes.active, "the pointer light is on for a fine pointer").toBe(true);
  const metrics = () => page.evaluate(() => { const metrics = window.showcase.state().metrics; return { captures: metrics.captures, uploads: metrics.uploads }; });
  const quiet = await metrics();
  const box = await page.locator("#syn-sound").boundingBox();
  for (let step = 0; step < 20; step++) await page.mouse.move(box.x + 40 + step * 12, box.y + 120 + step * 5);
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.instrumentGallery.light());
  expect(after.writes, "the pointer light wrote its emitters").toBeGreaterThan(writes.writes);
  expect(await metrics(), "no capture and no upload for a moving light").toEqual(quiet);
  await built("pointer light");
  // Off: the scenes lose the light and GPU stays.
  await page.getByRole("button", { name: "Pointer light", exact: true }).click();
  await settle(page);
  expect((await page.evaluate(() => window.instrumentGallery.light())).active).toBe(false);
  await built("pointer light off");
  expect(errors).toEqual([]);
  await context.close();
});

test("axe on the stage in light and dark, at the CSS and Instrument levels", async ({ browser }) => {
  test.setTimeout(300000);
  for (const [theme, level] of [["light", "instrument"], ["dark", "instrument"], ["light", "css"]]) {
    const { context, page } = await open(browser, { colorScheme: theme });
    await gallery(page, "setTheme", theme);
    for (const tab of tabs) {
      await select(page, tab, level);
      const results = await new AxeBuilder({ page }).include(".stage").analyze();
      expect(results.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(" ")).slice(0, 3).join(" | ")}`), `axe ${theme}, ${level}, ${tab}`).toEqual([]);
    }
    await context.close();
  }
});

test("at 320 px the page reflows: no sideways scroll, every control keeps a 24 px target, GPU stays on", async ({ browser }) => {
  test.setTimeout(300000);
  const { context, page } = await open(browser, { dpr: 2, width: 320, height: 700 });
  for (const tab of tabs) {
    await select(page, tab, "instrument");
    const geometry = await page.evaluate(() => {
      const small = [];
      for (const control of document.querySelectorAll(".stage :is(input:not([type=hidden]), select, button, meter, a[href])")) {
        const box = control.getBoundingClientRect();
        if (!control.checkVisibility() || (box.width === 0 && box.height === 0)) continue;
        if (box.width < 24 || box.height < 24) small.push(`${control.id || control.tagName} ${Math.round(box.width)}x${Math.round(box.height)}`);
      }
      const scroll = document.querySelector(".stage-scroll");
      return { page: document.documentElement.scrollWidth - document.documentElement.clientWidth, region: scroll.scrollWidth - scroll.clientWidth, small };
    });
    expect(geometry.page, `${tab}: the page does not scroll sideways`).toBeLessThanOrEqual(0);
    expect(geometry.region, `${tab}: the stage does not scroll sideways`).toBeLessThanOrEqual(0);
    // Inline links in running text are exempt from the target size (WCAG 2.5.8); controls are not.
    expect(geometry.small.filter(entry => !/^A /.test(entry)), `${tab}: targets under 24 px`).toEqual([]);
    expect((await stateOf(page)).mode).toBe("gpu");
    await mkdir(evidence, { recursive: true });
    await page.locator(".stage").screenshot({ path: `${evidence}/phone-${tab}.png` });
  }
  await context.close();
});

test("reduced motion and more contrast are respected: GPU stays, the pointer light is off under more contrast", async ({ browser }) => {
  test.setTimeout(300000);
  const reduced = await open(browser, { reducedMotion: "reduce" });
  await select(reduced.page, "showpiece", "instrument");
  expect((await stateOf(reduced.page)).mode).toBe("gpu");
  expect((await reduced.page.evaluate(() => window.instrumentGallery.light())).active, "reduced motion keeps the light").toBe(true);
  await reduced.context.close();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.emulateMedia({ contrast: "more" });
  await page.goto(`${base}#/instrument`);
  await page.waitForFunction(() => window.showcase && window.instrumentGallery);
  await page.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
  await page.waitForFunction(() => !window.showcase.state().initializing && window.showcase.state().mode !== "admitting", null, { timeout: 60000 });
  await select(page, "showpiece", "instrument");
  expect((await stateOf(page)).mode).toBe("gpu");
  expect((await page.evaluate(() => window.instrumentGallery.light())).active, "more contrast turns the light off").toBe(false);
  await context.close();
});
