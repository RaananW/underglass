/**
 * Browser suite for the studio character (design language section 19, `characters/studio.json`), DPR 1 and 2.
 * - Selection at runtime, on `ui-knob.html` at its four presentations (CSS only, Relief, Objects, Instrument):
 *   `data-strata-character="studio"` on the panel (a scope) turns that subtree's tokens into studio's and nothing else;
 *   GPU stays on with no step-down, the pixels that change lie inside the controls' boxes, native hits find the input
 *   (0 mismatches), the accessibility snapshot is the same, and removing the attribute (or naming `premium`) restores
 *   the premium pixels exactly. At the Instrument level the parts take studio's materials (anodised skirts, ink), the
 *   springs are studio's, and on the root the room (`studio.*`, `environment.intensity`) is in the scene.
 * - Forced colours and more contrast: neither is touched by the character.
 * - The prototype page (`ui-proto-instrument.html`): the character switch premium → studio rebuilds the layers with GPU
 *   on, the mesh pass stays inside the controls with 0 hit mismatches, printed scales and labels keep 4.5:1 on decoded
 *   pixels in light and dark, the accessibility snapshot is the same, and the screenshot set is saved.
 * Screenshots go to the `ui-character-studio` and `ui-probes/instrument-i5-studio` evidence directories.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-character-studio");
const shots = evidenceDirectory("ui-probes/instrument-i5-studio");
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

// ---- The knob page: selection at runtime ----

async function ready(page, query = "") {
  await page.goto(`/ui-knob.html${query}`);
  if (!query.includes("dom")) {
    await page.waitForFunction(() => window.strataKnobProbe && window.strataKnobProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
    await page.waitForFunction(() => window.strataKnobProbe.scene() !== undefined);
    await page.evaluate(() => window.strataKnobProbe.controller.settle());
  } else await page.waitForFunction(() => window.strataKnobProbe);
  await built(page);
}
/** At the Instrument level: every instrument layer built (not pending), so its parts are drawn. */
const built = page => page.waitForFunction(() => {
  const instrument = window.strataKnobProbe.instrument();
  return !instrument || (!instrument.compile.building && instrument.layers.every(layer => layer.status !== "pending"));
}, null, { timeout: 30000 });
/** At the Instrument level: every knob's spring at rest on its value. */
const rest = page => page.waitForFunction(() => {
  const probe = window.strataKnobProbe;
  probe.refresh();
  return (probe.scene()?.objects ?? []).filter(object => object.id !== "knob-reset").every(object => {
    const input = document.getElementById(object.id);
    return Math.abs(object.t - (input.value - input.min) / (input.max - input.min)) < 1e-6;
  });
});
const mode = page => page.evaluate(() => window.strataKnobProbe.controller?.state().mode ?? "dom");
/** The `#frame` decoded (or, in plain DOM, the panel), after the scene and the GPU have caught up. */
async function frame(page, name, { dom = false } = {}) {
  await page.mouse.move(2, 2);
  if (!dom) {
    await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
      window.strataKnobProbe.refresh(); await window.strataKnobProbe.controller.settle();
    });
    await rest(page);
    await built(page);
    await page.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); await window.strataKnobProbe.controller.settle(); });
  } else await page.evaluate(async () => { for (let index = 0; index < 3; index++) await new Promise(requestAnimationFrame); });
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
/** elementFromPoint over a grid on the dial: every hit must be the input. */
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
const variable = (page, selector, name) => page.evaluate(([selector, name]) => getComputedStyle(document.querySelector(selector)).getPropertyValue(name).trim(), [selector, name]);

for (const dpr of [1, 2]) for (const level of ["dom", "relief", "objects", "instrument"]) {
  test(`DPR ${dpr}, ${level}: data-strata-character switches the subtree to studio with GPU on, pixels only in the controls, 0 hit mismatches and the same accessibility tree`, async ({ browser }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const gpu = level !== "dom";
    await ready(page, level === "dom" ? "?dom" : level === "relief" ? "" : `?level=${level}`);
    const state = async label => {
      if (!gpu) return;
      expect(await mode(page), `${label}: GPU stays on`).toBe("gpu");
      if (level === "instrument") {
        const layer = await page.evaluate(() => window.strataKnobProbe.instrument().layers[0]);
        expect(layer.status, `${label}: the layer is drawn as parts`).toBe("ready");
        expect(layer.steppedDown, `${label}: nothing is stepped down`).toEqual([]);
      }
    };
    const snapshot = () => page.locator("#knob-panel").ariaSnapshot();
    const sceneOf = () => page.evaluate(() => JSON.stringify(window.strataKnobProbe.scene()));
    const dials = [await inFrame(page, "#volume-knob .ug-knob__dial"), await inFrame(page, "#gain-knob .ug-knob__dial"), await inFrame(page, "#knob-read"), await inFrame(page, "#knob-reset")];
    const set = value => page.evaluate(value => { const panel = document.getElementById("knob-panel"); if (value) panel.setAttribute("data-strata-character", value); else panel.removeAttribute("data-strata-character"); }, value);
    // At Relief and Objects the roles studio changes (the knob's cap and skirt) are not the ones those levels read, so the
    // knob shows the character through a material it names: studio's `anodised` preset, which premium does not have.
    const named = level === "relief" || level === "objects";
    if (named) await page.evaluate(() => { for (const part of document.querySelectorAll("#volume-knob .ug-knob__skirt, #volume-knob .ug-knob__cap")) part.setAttribute("data-strata-material", "anodised"); });

    await state("start");
    const premium = await frame(page, `${level}-dpr${dpr}-premium`, { dom: !gpu });
    const tree = await snapshot();
    const sceneBefore = gpu ? await sceneOf() : "";
    expect(await variable(page, "#knob-panel", "--strata-spring-detent-stiffness"), "no character: no spring variable").toBe("");

    // Studio on the panel.
    await set("studio");
    const studio = await frame(page, `${level}-dpr${dpr}-studio`, { dom: !gpu });
    await state("studio");
    expect(await variable(page, "#knob-panel", "--strata-spring-detent-stiffness"), "studio's detent spring").toBe("1400");
    expect(await variable(page, "#knob-panel", "--strata-material-roles-knob-skirt")).toBe("anodised");
    expect(await variable(page, "#knob-panel", "--strata-colour-glow-on"), "studio's amber").toBe("#ffb020");
    expect(await variable(page, "#knob-panel", "--strata-feedback-thunk-pitch"), "studio's sound set reaches the control").toBe("120");
    expect(await variable(page, "html", "--strata-studio-key"), "the room is the application's, not a panel's").toBe("");
    const changed = difference(premium, studio, dials);
    console.log(`DPR ${dpr} ${level}: premium → studio changes ${changed.inside} px inside the controls, ${changed.outside} outside`);
    expect(changed.outside, `nothing changes outside the controls (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    if (level === "instrument" || named) expect(changed.inside, "the knob's parts take studio's materials").toBeGreaterThan(200 * dpr);
    if (gpu) {
      const scene = JSON.parse(await sceneOf());
      if (level === "instrument") {
        expect(scene.materials.knobSkirt.base).toMatchObject({ colour: "#2a2c31", metallic: 0.85, roughness: 0.5 });
        expect(scene.materials.knobCap.base).toMatchObject({ colour: "#d8dadd", roughness: 0.34 });
        expect(scene.materials.knobInk.base.colour).toBe("#0e0f11");
        expect(scene.objects[0].parts[3].pose, "the sweep is unchanged").toEqual({ from: { turn: -225 }, to: { turn: 45 } });
        expect(scene.environment.studio, "a panel is not the application: the room is the default").toBeUndefined();
      } else if (named) {
        expect(scene.materials.anodised.base, "Relief and Objects read the character's preset").toMatchObject({ roughness: 0.5, metallic: 0.85 });
      }
    }
    for (const id of ["volume", "gain"]) expect((await hits(page, id, dpr === 2 ? 21 : 11)).misses, `${id}: grid hits under studio`).toEqual([]);
    expect(await snapshot(), "the accessibility tree is the same").toBe(tree);

    // A real click still turns the knob under studio, with fresh pixels in its dial only.
    if (gpu) {
      const dial = await page.locator("#volume-knob .ug-knob__dial").boundingBox();
      await page.mouse.click(dial.x + dial.width / 2 + 24, dial.y + dial.height / 2 + 40);
      const turned = await frame(page, `${level}-dpr${dpr}-studio-turned`);
      const turn = difference(studio, turned, dials);
      expect(turn.inside, "the pointer turned").toBeGreaterThan(20);
      expect(turn.outside, "and nothing else changed").toBe(0);
      await state("after a click");
      await page.evaluate(() => { const input = document.getElementById("volume"); input.value = "62"; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); input.blur(); });
      await frame(page, `${level}-dpr${dpr}-studio-back`);
    }

    // Back to premium, by removing the attribute and by naming it: the premium pixels exactly.
    await set("");
    const removed = await frame(page, `${level}-dpr${dpr}-removed`, { dom: !gpu });
    expect(difference(premium, removed, []), "no attribute: the premium frame again").toMatchObject({ inside: 0, outside: 0 });
    expect(await variable(page, "#knob-panel", "--strata-spring-detent-stiffness")).toBe("");
    await set("premium");
    const named2 = await frame(page, `${level}-dpr${dpr}-premium-named`, { dom: !gpu });
    expect(difference(premium, named2, []), "premium named: the premium frame").toMatchObject({ inside: 0, outside: 0 });
    expect(await variable(page, "#knob-panel", "--strata-spring-detent-stiffness"), "premium restates its own").toBe("900");
    if (gpu) expect(await sceneOf(), "the same scene").toBe(sceneBefore);
    await state("back to premium");
    expect(errors, "no page errors").toEqual([]);
    await context.close();
  });
}

test("on the root the room is in the Instrument scene: studio's softbox, strip and strength, GPU on, and premium restores the default", async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await ready(page, "?level=instrument");
  const room = () => page.evaluate(() => { const environment = window.strataKnobProbe.scene().environment; return { strength: environment.strength, studio: environment.studio }; });
  expect(await room()).toEqual({ strength: 1, studio: undefined });
  const dials = [await inFrame(page, "#volume-knob .ug-knob__dial"), await inFrame(page, "#gain-knob .ug-knob__dial"), await inFrame(page, "#knob-read"), await inFrame(page, "#knob-reset")];
  const premium = await frame(page, "root-premium");
  await page.evaluate(() => document.documentElement.setAttribute("data-strata-character", "studio"));
  const studio = await frame(page, "root-studio");
  expect(await room()).toEqual({ strength: 0.85, studio: { key: 9, keyRadius: 0.18, fill: 0.8, front: 0.09, strip: 1.6, floor: 0.03, ceiling: 0.18 } });
  expect(await mode(page)).toBe("gpu");
  const layer = await page.evaluate(() => window.strataKnobProbe.instrument().layers[0]);
  expect(layer.status).toBe("ready");
  expect(layer.steppedDown).toEqual([]);
  const changed = difference(premium, studio, dials);
  console.log(`root: premium → studio changes ${changed.inside} px inside the controls, ${changed.outside} outside (the room lights the face too)`);
  expect(changed.inside).toBeGreaterThan(400);
  for (const id of ["volume", "gain"]) expect((await hits(page, id, 21)).misses).toEqual([]);
  await page.evaluate(() => document.documentElement.setAttribute("data-strata-character", "premium"));
  const back = await frame(page, "root-premium-named");
  expect(await room()).toEqual({ strength: 1, studio: expect.objectContaining({ key: 12 }) });
  expect(difference(premium, back, [])).toMatchObject({ inside: 0 });
  await page.evaluate(() => document.documentElement.removeAttribute("data-strata-character"));
  const gone = await frame(page, "root-removed");
  expect(difference(premium, gone, []), "removing the attribute restores the premium frame").toMatchObject({ inside: 0, outside: 0 });
  expect(await room()).toEqual({ strength: 1, studio: undefined });
  await context.close();
});

// ---- Forced colours and more contrast ----

test("forced colours and more contrast are not touched by the character", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, forcedColors: "active", contrast: "more" });
  const page = await context.newPage();
  await ready(page, "?dom");
  const probe = () => page.evaluate(() => {
    const names = ["--strata-colour-text", "--strata-colour-panel", "--strata-colour-accent", "--strata-colour-edge", "--strata-colour-knob", "--strata-colour-glow-on"];
    const style = getComputedStyle(document.querySelector("#knob-panel")), cap = getComputedStyle(document.querySelector("#volume-knob .ug-knob__cap")), input = getComputedStyle(document.querySelector("#volume"));
    return { tokens: names.map(name => style.getPropertyValue(name).trim()), forced: matchMedia("(forced-colors: active)").matches, more: matchMedia("(prefers-contrast: more)").matches,
      cap: [cap.color, cap.backgroundColor, cap.borderTopColor, cap.outlineColor], input: [input.color, input.outlineColor, input.borderTopColor] };
  });
  const premium = await probe();
  expect(premium.forced && premium.more).toBe(true);
  for (const attribute of ["studio", "premium"]) {
    await page.evaluate(attribute => document.getElementById("knob-panel").setAttribute("data-strata-character", attribute), attribute);
    const result = await probe();
    // Studio sets only the glow among the colour roles, and it is one colour in every theme, the contrast ones included.
    expect(result.tokens.slice(0, 5), `${attribute}: colour roles`).toEqual(premium.tokens.slice(0, 5));
    expect(result.cap, `${attribute}: the cap's system colours`).toEqual(premium.cap);
    expect(result.input, `${attribute}: the input's system colours`).toEqual(premium.input);
  }
  await page.evaluate(() => document.getElementById("knob-panel").setAttribute("data-strata-character", "studio"));
  expect((await probe()).tokens[5], "the glow under contrast: more").toBe("#ffb020");
  await context.close();
});

// ---- The prototype page: the character switch ----

const allOff = { mute: false, power: false, phono: false, lights: false };
const allOn = { mute: true, power: true, phono: true, lights: true };
const initial = { volume: 62, input: 4, level: 72, mute: false, power: true, phono: false, lights: true, rec: false };
const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** Contrast of a text rect in a decoded PNG (device px = client px × dpr): median face against the 1% extreme. */
function contrastIn(png, rect, dpr) {
  const values = [];
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * png.width + x) * 4;
    values.push(0.2126 * linear(png.data[offset]) + 0.7152 * linear(png.data[offset + 1]) + 0.0722 * linear(png.data[offset + 2]));
  }
  values.sort((a, b) => a - b);
  const face = values[Math.floor(values.length / 2)], dark = values[Math.floor(values.length * 0.01)], light = values[Math.floor(values.length * 0.99)];
  const ink = face - dark > light - face ? dark : light;
  return (Math.max(face, ink) + 0.05) / (Math.min(face, ink) + 0.05);
}

for (const dpr of [1, 2]) test(`DPR ${dpr}: the prototype page switches premium → studio with GPU on, the mesh pass inside the controls, 4.5:1 print and the same accessibility tree`, async ({ browser }) => {
  test.setTimeout(1500000);
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/ui-proto-instrument.html");
  await page.waitForFunction(() => window.instrumentProto, null, { timeout: 60000 });
  const failure = await page.evaluate(async () => { try { await window.instrumentProto.ready; return null; } catch (error) { return String(error); } });
  expect(failure, "the page must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentProto.ready)[name](...args), { name, args });
  await mkdir(shots, { recursive: true });
  const report = { browser: browser.version(), dpr, checks: {} };
  const stillGpu = async label => {
    const counts = await call("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
  };
  const containment = async label => {
    const result = await call("containment");
    report.checks[`containment ${label}`] = { ...result, hitMismatches: result.hitMismatches.length };
    expect(result.changed, `${label}: the mesh pass draws`).toBeGreaterThan(dpr === 2 ? 20000 : 5000);
    expect(result.outside, `${label}: mesh pixels outside their controls ${JSON.stringify(result.outsideSamples)}`).toBe(0);
    expect(result.hits, `${label}: native hits sampled on mesh pixels`).toBeGreaterThan(300);
    expect(result.hitMismatches, `${label}: native hits on mesh pixels find their control`).toEqual([]);
  };
  const contrastChecks = async label => {
    const decoded = await call("labelContrast");
    const png = PNG.sync.read(await page.screenshot());
    decoded.css = (await call("cssPrint")).map(rect => ({ text: rect.text, ratio: contrastIn(png, rect, dpr) }));
    report.checks[`contrast ${label}`] = Object.fromEntries(Object.entries(decoded).map(([level, list]) => [level, { count: list.length, min: Math.min(...list.map(item => item.ratio)), lowest: [...list].sort((a, b) => a.ratio - b.ratio).slice(0, 3) }]));
    for (const [level, list] of Object.entries(decoded)) {
      expect(list.length, `${label} ${level}: printed labels measured`).toBeGreaterThan(30);
      for (const item of list) expect(item.ratio, `${label} ${level}: "${item.text}" contrast`).toBeGreaterThanOrEqual(4.5);
    }
  };
  const capturedExact = async label => {
    const result = await call("capLabels");
    report.checks[`captured ${label}`] = result;
    expect(result.mismatched, `${label}: the push button's captured label is texel-exact`).toBe(0);
    expect(result.display.text.mismatched, `${label}: the display's text under the glass is texel-exact`).toBe(0);
    expect(result.display.textContrast, `${label}: the display text's contrast`).toBeGreaterThanOrEqual(4.5);
  };
  const tree = () => page.locator("#ip-instrument").ariaSnapshot();
  const choose = async character => {
    await page.selectOption("#t-character", character);
    await page.waitForFunction(character => window.instrumentProto.ready.then(api => api.values().character === character), character);
    await call("set", {});
    await call("settle");
  };
  try {
    await stillGpu("start");
    expect((await call("values")).character, "premium is the default").toBe("premium");
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-strata-character"))).toBe(false);
    await page.mouse.move(4, 890);
    await call("state", initial);
    const premiumTokens = await call("tokens");
    const premiumTree = await tree();
    await containment("premium light");
    await contrastChecks("premium light");

    // The switch: studio's roles bring their materials, the room's strength, its springs and its glow.
    await choose("studio");
    const values = await call("values");
    expect(values).toMatchObject({ character: "studio", capMaterial: "brushed", skirtMaterial: "anodised", plateMaterial: "auto", reflections: 0.85 });
    expect(await page.evaluate(() => document.documentElement.getAttribute("data-strata-character")), "the Objects copy follows from the stylesheet").toBe("studio");
    const studioTokens = await call("tokens");
    expect(studioTokens.accent, "studio amber").toEqual([255, 176, 32]);
    expect(studioTokens.springs.detent).toEqual({ stiffness: 1400, damping: 56 });
    expect(studioTokens.materials.plate, "anodised on the light theme too").toBe("anodised");
    expect(premiumTokens.accent).toEqual([255, 146, 40]);
    expect(premiumTokens.springs.detent).toEqual({ stiffness: 900, damping: 42 });
    expect(premiumTokens.materials.plate).toBe("brushed");
    await page.mouse.move(4, 890);
    await call("state", initial);
    await stillGpu("studio light");
    await containment("studio light");
    await contrastChecks("studio light");
    await capturedExact("studio light");
    expect(await tree(), "the accessibility tree is the same").toBe(premiumTree);
    for (const { id, found } of await call("hits")) expect(found, `native hits inside ${id}`).toEqual(Array(found.length).fill(id));

    await call("set", { theme: "dark" });
    await containment("studio dark");
    await contrastChecks("studio dark");
    await capturedExact("studio dark");
    await stillGpu("studio dark");

    // Back and forth without a revoke: the premium look returns.
    await call("set", { theme: "light" });
    await choose("premium");
    expect((await call("values")).skirtMaterial, "premium's roles are back").toBe("polished");
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-strata-character"))).toBe(false);
    await stillGpu("premium again");
    await containment("premium again");
    await choose("studio");
    await stillGpu("studio again");
    report.diagnostics = await call("diagnostics");

    if (dpr === 2) {
      // The screenshot set (the I1 report's set, for studio, with premium's beside it) for the owner's look sign-off.
      const variants = [];
      const shoot = async (file, description, clip = "page") => {
        const rect = await call("screenshot", clip);
        await page.screenshot({ path: `${shots}/${file}`, clip: rect });
        await stillGpu(file);
        variants.push({ file, description, clip, values: await call("values"), state: await page.evaluate(() => ({
          ...Object.fromEntries([...document.querySelectorAll("#ip-instrument input")].map(input => [input.id.replace(/-instrument$/, ""), input.type === "checkbox" ? input.checked : Number(input.value)])),
          rec: document.querySelector("#ip-instrument .ip-button").getAttribute("aria-pressed") === "true" })), tokens: await call("tokens") });
      };
      for (const character of ["premium", "studio"]) {
        await choose(character);
        await call("state", initial);
        await page.mouse.move(4, 890);
        for (const theme of ["light", "dark"]) {
          await call("set", { theme });
          await shoot(`${character}-default-${theme}.png`, `${character}, defaults, ${theme} theme`);
          for (const level of ["instrument", "objects", "css"]) await shoot(`${character}-default-${theme}-${level}.png`, `${character}, ${theme} theme: the ${level} presentation`, level);
        }
        await call("set", { theme: "light" });
        for (const [name, states] of [["off", allOff], ["on", allOn]]) {
          await call("state", states);
          await shoot(`${character}-switches-${name}.png`, `${character}: every switch ${name}`);
          for (const control of ["mute", "power", "phono", "lights"]) await shoot(`${character}-switch-${control}-${name}.png`, `${character}: ${control} ${name}, Instrument close-up`, control);
        }
        await call("state", initial);
        for (const [name, at] of [["min", 0], ["mid", 0.5], ["max", 1]]) {
          await call("state", { volume: at * 100, input: Math.round(at * 10) });
          await shoot(`${character}-knobs-${name}.png`, `${character}: knobs at ${name}`);
          await shoot(`${character}-knobs-${name}-volume.png`, `${character}: volume knob at ${name}, close-up`, "volume");
          await shoot(`${character}-knobs-${name}-input.png`, `${character}: detented knob at ${name}, close-up`, "input");
        }
        await call("state", initial);
        for (const [name, level] of [["low", 0], ["mid", 50], ["high", 100]]) { await call("state", { level }); await shoot(`${character}-fader-${name}.png`, `${character}: fader at ${level}%`); }
        await call("state", { ...initial, level: 50 });
        await shoot(`${character}-closeup-fader.png`, `${character}: fader carriage close-up`, "level");
        await call("state", { ...initial, rec: true });
        await shoot(`${character}-button-latched.png`, `${character}: push button latched`);
        await shoot(`${character}-button-latched-rec.png`, `${character}: push button latched, close-up`, "rec");
        await call("press", true);
        await shoot(`${character}-button-held-rec.png`, `${character}: push button held, close-up`, "rec");
        await call("press", false);
        await call("state", initial);
        await shoot(`${character}-closeup-display.png`, `${character}: the display window`, "display");
        await call("state", { ...initial, phono: true });
        await shoot(`${character}-closeup-bat-on.png`, `${character}: bat lever up`, "phono");
        await call("state", initial);
        for (const depth of [0, 100]) { await call("set", { depth }); await shoot(`${character}-depth-${depth}.png`, `${character}: depth ${depth}%`); }
        await call("set", { depth: 50 });
        const volume = (await call("controls", "instrument")).find(control => control.id === "volume-instrument");
        await page.mouse.move(volume.x + volume.width * 0.8, volume.y + volume.height * 0.25, { steps: 4 });
        await call("settle");
        await shoot(`${character}-pointer-light-instrument.png`, `${character}: the pointer light over the volume knob`, "instrument");
        await page.mouse.move(4, 890);
        await call("settle");
      }
      await writeFile(`${shots}/variants.json`, JSON.stringify({ browser: report.browser, viewport: [1600, 900], deviceScaleFactor: 2, variants }, null, 2));
      report.screenshots = variants.length;
    }
    expect(errors, "no page errors").toEqual([]);
  } finally {
    await writeFile(`${shots}/report-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
