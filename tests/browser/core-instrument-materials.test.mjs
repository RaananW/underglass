/**
 * The material cap of core's `instrument` material (issue #173, `docs/ui-library/instrument-phase2.md` item 1, *Material cap*) on
 * `instrument-core.html` (`window.instrumentCore`): the upper panel's scene is padded to a number of materials with `padMaterials(count)`.
 * At DPR 1 and 2 the test checks that:
 * - at 16 materials (the cap) the layer is ready, draws its parts and reports `materials: { count: 16, cap: 16 }`;
 * - at 17 and at 64 the scene is valid and the layer is stepped down as a whole, reported: status `stepped-down`, every object
 *   `budget` with the count and the cap in its detail, a warning, `drawnParts` 0, and GPU stays on with the other layers ready;
 * - nothing vanishes silently: at 17 the upper controls draw at the Relief level (the same pixels at 17 and at 64 materials,
 *   not the parts' pixels and not blank), and going back to 16 draws the parts again, fresh;
 * - the count in `state().instrument.layers[].materials` follows the scene, and `budgets.materialsPerLayer` is the cap.
 * Before the fix, `setMaterial` threw at 17 materials, the page's scene was never accepted and the layer stayed at its last
 * scene (or had none): the layer reported neither the count nor a step-down.
 * Reports and screenshots go to the `core-instrument-materials` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("core-instrument-materials");
const viewport = { width: 1920, height: 1080 };
const healthy = /^Current content=drawable owning WebGPU canvas/;

async function open(browser, dpr) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto("/instrument-core.html");
  await page.waitForFunction(() => window.instrumentCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentCore.ready)[name](...args), { name, args });
  return { context, page, errors, call };
}
const shot = async (page, path) => PNG.sync.read(await page.screenshot(path ? { path } : {}));
/** Pixels that differ between two screenshots inside `box` (client px), and the number of distinct colours in `a` there. */
function within(a, b, box, dpr) {
  let changed = 0, compared = 0;
  const colours = new Set();
  for (let y = Math.ceil(box.y * dpr); y < Math.floor((box.y + box.height) * dpr); y++) for (let x = Math.ceil(box.x * dpr); x < Math.floor((box.x + box.width) * dpr); x++) {
    const offset = (y * a.width + x) * 4;
    compared++;
    colours.add(`${a.data[offset]},${a.data[offset + 1]},${a.data[offset + 2]}`);
    if (a.data[offset] !== b.data[offset] || a.data[offset + 1] !== b.data[offset + 1] || a.data[offset + 2] !== b.data[offset + 2]) changed++;
  }
  return { changed, compared, colours: colours.size };
}
const upperLayer = state => state.layers.find(layer => layer.id === "upper");
async function stillGpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
}

for (const dpr of [1, 2]) test(`a scene past the material cap is reported and drawn at Relief, never silent DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(300000);
  await mkdir(directory, { recursive: true });
  const report = { dpr, browser: browser.version() };
  const { context, page, errors, call } = await open(browser, dpr);
  try {
    const boot = await call("boot");
    expect(boot.mode, `start: ${boot.reason}`).toBe("gpu");
    const own = await call("instrument");
    report.own = upperLayer(own).materials;
    expect(upperLayer(own).materials.cap).toBe(16);
    expect(own.budgets.materialsPerLayer).toBe(16);
    expect(upperLayer(own).materials.count, "the page's own scene is under the cap").toBeLessThanOrEqual(16);

    // At the cap: ready, parts drawn.
    const at = await call("padMaterials", 16);
    expect(upperLayer(at).materials).toEqual({ count: 16, cap: 16 });
    expect(upperLayer(at).status).toBe("ready");
    expect(upperLayer(at).steppedDown).toEqual([]);
    const withParts = await shot(page, `${directory}/at-cap-dpr${dpr}.png`);
    const controls = (await call("controls")).filter(control => control.layer === "upper");
    expect(controls.length).toBeGreaterThan(2);
    await call("setMeshes", false);
    const faceOnly = await shot(page, `${directory}/face-only-dpr${dpr}.png`);
    await call("setMeshes", true);
    // The reference: parts on against the face only, per upper control.
    const partsAt16 = controls.map(control => within(withParts, faceOnly, control, dpr));
    expect(partsAt16.every(entry => entry.changed > 20), `at 16 every upper control draws parts: ${JSON.stringify(partsAt16)}`).toBe(true);
    await stillGpu(call, "at the cap");

    // One over: the whole layer steps down, reported, GPU on, the Relief face drawn.
    let firstRelief;
    for (const count of [17, 64]) {
      const over = await call("padMaterials", count);
      const upper = upperLayer(over);
      report[`over${count}`] = { status: upper.status, materials: upper.materials, steppedDown: upper.steppedDown.slice(0, 2), warnings: upper.warnings, drawnParts: upper.drawnParts };
      expect(upper.materials, `${count} materials counted`).toEqual({ count, cap: 16 });
      expect(upper.status).toBe("stepped-down");
      expect(upper.steppedDown.length, "every object of the layer is stepped down").toBe(upper.objects);
      expect(upper.steppedDown.every(entry => entry.reason === "budget" && entry.detail.includes(`${count} materials in the layer, above 16`))).toBe(true);
      expect(upper.warnings.some(warning => warning.includes(`${count} materials`))).toBe(true);
      expect(upper.drawnParts).toBe(0);
      expect(over.layers.filter(layer => layer.id !== "upper").every(layer => layer.status === "ready"), "the other layers are untouched").toBe(true);
      await stillGpu(call, `${count} materials`);
      const relief = await shot(page, `${directory}/over-${count}-dpr${dpr}.png`);
      // Nothing vanishes: the controls draw at Relief (the same pixels at 17 and 64 materials), not the parts' and not blank.
      const againstFace = controls.map(control => within(relief, firstRelief ?? relief, control, dpr));
      firstRelief ??= relief;
      const againstParts = controls.map(control => within(relief, withParts, control, dpr));
      report[`over${count}`].pixels = { againstFace: againstFace.map(entry => entry.changed), againstParts: againstParts.map(entry => entry.changed), colours: againstFace.map(entry => entry.colours) };
      expect(againstFace.every(entry => entry.changed === 0), `${count}: the stepped-down layer draws the same Relief as at 17 (${JSON.stringify(againstFace)})`).toBe(true);
      expect(againstParts.every(entry => entry.changed > 20), `${count}: the parts are gone, replaced by Relief`).toBe(true);
      expect(againstFace.every(entry => entry.colours > 4), `${count}: the controls are drawn, not blank`).toBe(true);
    }

    // Back under the cap: ready again, the parts fresh.
    const back = await call("padMaterials", null);
    expect(upperLayer(back).status).toBe("ready");
    expect(upperLayer(back).steppedDown).toEqual([]);
    expect(upperLayer(back).materials.count).toBe(report.own.count);
    const again = await shot(page);
    expect(controls.every(control => within(again, withParts, control, dpr).changed < 5), "the parts are drawn again, as at the cap").toBe(true);
    await stillGpu(call, "back under the cap");
    expect(errors, "no page errors").toEqual([]);
  } finally {
    await writeFile(`${directory}/report-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
