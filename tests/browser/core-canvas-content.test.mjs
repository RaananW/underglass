/**
 * A `<canvas>` inside a layer (issue #184). Two pages:
 * - `canvas-capture-raw.html` (`window.canvasCapture`): no core, one `content="drawable"` canvas and `drawElementImage`. It pins what this
 *   browser build captures of a nested canvas, so a browser change that fixes it (or breaks more) is noticed here first;
 * - `core-canvas-content.html` (`window.canvasContent`): core with a probe layer and a plain layer. The same arrangements through core's
 *   capture (marked `data-underglass-gpu-canvas="allow"` so the layer is admitted), and core's decision: a layer containing a `<canvas>`
 *   is refused with the reason `canvas-content` (never presented blank), the DOM presentation then shows the canvas, the override admits
 *   it, and a canvas outside every layer changes nothing.
 * Measured on Canary 158.0.8112.0: a canvas is captured only when it is the first thing attached to its layer; any later canvas, and any
 * canvas after a painted sibling, is the layer background. At DPR 1 and 2; decoded screenshots.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const viewport = { width: 1280, height: 720 };
const BACKGROUND = [233, 235, 239], RED = [200, 40, 40], GREEN = [40, 160, 60], BLUE = [40, 40, 200], YELLOW = [230, 200, 20];
const near = (actual, expected, tolerance = 8) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);

async function open(browser, dpr, path) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto(path);
  return { context, page, errors };
}
async function openCore(browser, dpr) {
  const opened = await open(browser, dpr, "/core-canvas-content.html");
  await opened.page.waitForFunction(() => window.canvasContent, null, { timeout: 60000 });
  await opened.page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => opened.page.evaluate(async ({ name, args }) => {
    const api = await window.canvasContent.ready, value = api[name];
    return typeof value === "function" ? value(...args) : value;
  }, { name, args });
  const shot = async () => PNG.sync.read(await opened.page.screenshot());
  return { ...opened, call, shot };
}
/** The pixel at the centre of a client box in a screenshot. */
function centre(png, box, dpr) {
  const x = Math.round((box.x + box.width / 2) * dpr), y = Math.round((box.y + box.height / 2) * dpr), offset = (y * png.width + x) * 4;
  return [png.data[offset], png.data[offset + 1], png.data[offset + 2]];
}
/** Core logs a refused admission as a console error; those are expected where a test enables with a canvas present. */
const refusal = text => !/^console: GPU admission failed: Error: canvas-content:/.test(text);
const healthy = /^Current content=drawable owning WebGPU canvas/;

test.describe("the raw browser behaviour (no core)", () => {
  async function raw(browser, only, reverse = false) {
    const { context, page, errors } = await open(browser, 1, "/canvas-capture-raw.html");
    try {
      await page.waitForFunction(() => window.canvasCapture, null, { timeout: 60000 });
      const result = await page.evaluate(({ only, reverse }) => window.canvasCapture.run(only, reverse), { only, reverse });
      expect(errors).toEqual([]);
      return result;
    } finally { await context.close(); }
  }
  const variants = ["2d-fill", "2d-drawImage", "2d-after-frame", "webgl", "webgl-preserve", "2d-read-frequently", "img-of-toDataURL", "offscreen",
    "nested-drawable-canvas", "deep-2d", "hidden-then-shown-2d"];

  test("each variant alone in a layer is captured, with fresh pixels after a redraw", async ({ browser }) => {
    const table = [];
    for (const id of variants) {
      const [row] = await raw(browser, [id]);
      table.push(row);
      expect(row.ownBitmap, `${id}: the canvas itself holds its pixels`).toEqual(row.id === "2d-after-frame" ? GREEN : row.expected);
      expect(row.capturesFirst || id === "2d-after-frame" || id === "hidden-then-shown-2d", `${id}: captured (${row.snapshotFirst})`).toBe(true);
      expect(row.capturesSecond, `${id}: captured after the redraw/show (${row.snapshotSecond})`).toBe(true);
    }
    // A canvas that holds a drawable canvas is not itself a plain canvas; its content is not captured.
    const [holder] = await raw(browser, ["nested-canvas-holding-canvas"]);
    table.push(holder);
    expect(holder.blank, "canvas holding a drawable child: blank").toBe(true);
    await mkdir(evidenceDirectory("core-canvas-content"), { recursive: true });
    await writeFile(`${evidenceDirectory("core-canvas-content")}/raw-alone.json`, JSON.stringify(table, null, 2));
  });

  test("with the variants together only the first-attached canvas is captured; the img and a nested drawable canvas are", async ({ browser }) => {
    const rows = await raw(browser, undefined);
    const byId = Object.fromEntries(rows.map(row => [row.id, row]));
    await mkdir(evidenceDirectory("core-canvas-content"), { recursive: true });
    await writeFile(`${evidenceDirectory("core-canvas-content")}/raw-together.json`, JSON.stringify(rows, null, 2));
    expect(byId["2d-fill"].capturesSecond, "the first canvas").toBe(true);
    for (const id of ["2d-drawImage", "2d-after-frame", "webgl", "webgl-preserve", "2d-read-frequently", "offscreen", "nested-canvas-holding-canvas", "deep-2d", "hidden-then-shown-2d"]) {
      expect(byId[id].blank, `${id}: blank behind the first canvas (${byId[id].snapshotSecond})`).toBe(true);
    }
    for (const id of ["img-of-toDataURL", "nested-drawable-canvas"]) expect(byId[id].capturesSecond, `${id} is captured`).toBe(true);
    // Created in the opposite order: the first one attached wins, whichever kind it is.
    const reversed = Object.fromEntries((await raw(browser, undefined, true)).map(row => [row.id, row]));
    expect(reversed["hidden-then-shown-2d"].capturesSecond, "reversed: the first canvas").toBe(true);
    for (const id of ["2d-fill", "2d-drawImage", "webgl", "2d-read-frequently", "offscreen", "deep-2d"]) expect(reversed[id].blank, `reversed ${id}: blank`).toBe(true);
  });
});

for (const dpr of [1, 2]) {
  test.describe(`core, DPR ${dpr}`, () => {
    /** Installs `kinds` (marked allowed) and returns the layer-background-or-colour of each slot as seen on screen in GPU. */
    async function measure(browser, kinds) {
      const { context, call, shot, errors } = await openCore(browser, dpr);
      try {
        expect((await call("state")).mode, "starts on GPU").toBe("gpu");
        await call("install", kinds, true);
        const state = await call("state");
        expect(state.mode, `GPU stays on with the override (${state.reason})`).toBe("gpu");
        const png = await shot();
        const out = [];
        for (let index = 0; index < kinds.length; index++) out.push(centre(png, await call("slot", index), dpr));
        expect(errors).toEqual([]);
        return out;
      } finally { await context.close(); }
    }

    test("core's capture matches the raw probe: the first canvas is captured, later canvases and canvases after painted content are blank", async ({ browser }) => {
      const rows = {};
      for (const kinds of [["2d"], ["webgl"], ["webgl-preserve"], ["offscreen"], ["2d-read-frequently"], ["2d", "2d-blue"], ["2d", "div"], ["2d", "img"],
        ["div", "2d"], ["img", "2d", "2d-blue"], ["webgl", "2d"], ["2d", "div", "2d-blue"]]) rows[kinds.join(",")] = await measure(browser, kinds);
      await mkdir(evidenceDirectory("core-canvas-content"), { recursive: true });
      await writeFile(`${evidenceDirectory("core-canvas-content")}/core-dpr${dpr}.json`, JSON.stringify(rows, null, 2));
      expect(near(rows["2d"][0], RED), `2d alone ${rows["2d"][0]}`).toBe(true);
      expect(near(rows["webgl"][0], YELLOW), `webgl alone ${rows["webgl"][0]}`).toBe(true);
      expect(near(rows["webgl-preserve"][0], YELLOW), "webgl preserveDrawingBuffer alone").toBe(true);
      expect(near(rows["offscreen"][0], RED), "transferred to OffscreenCanvas, alone").toBe(true);
      expect(near(rows["2d-read-frequently"][0], RED), "willReadFrequently, alone").toBe(true);
      expect(near(rows["2d,2d-blue"][0], RED) && near(rows["2d,2d-blue"][1], BACKGROUND), `two canvases: first only ${rows["2d,2d-blue"]}`).toBe(true);
      expect(near(rows["2d,div"][0], RED) && near(rows["2d,div"][1], GREEN), "canvas then a painted div: both captured").toBe(true);
      expect(near(rows["2d,img"][0], RED) && near(rows["2d,img"][1], BLUE), "canvas then an img: both captured").toBe(true);
      expect(near(rows["div,2d"][0], GREEN) && near(rows["div,2d"][1], BACKGROUND), "a painted div first: the canvas is blank").toBe(true);
      expect(near(rows["img,2d,2d-blue"][0], BLUE) && near(rows["img,2d,2d-blue"][1], BACKGROUND) && near(rows["img,2d,2d-blue"][2], BACKGROUND), "an img first: both canvases blank").toBe(true);
      expect(near(rows["webgl,2d"][0], YELLOW) && near(rows["webgl,2d"][1], BACKGROUND), "webgl first, 2d second").toBe(true);
      expect(near(rows["2d,div,2d-blue"][0], RED) && near(rows["2d,div,2d-blue"][1], GREEN) && near(rows["2d,div,2d-blue"][2], BACKGROUND), "a second canvas behind a div").toBe(true);
    });

    test("a layer with a canvas is refused with the reason canvas-content and shows the canvas in DOM; removing it and enabling again admits it", async ({ browser }) => {
      const { context, call, shot, page, errors } = await openCore(browser, dpr);
      try {
        const before = await call("state");
        expect(before.mode).toBe("gpu");
        expect(before.reason).toMatch(healthy);
        // A canvas added to a GPU layer: diagnosed fallback to DOM, with the named reason, never GPU pixels with a blank canvas.
        await call("install", ["div", "2d"]);
        const fallen = await call("state");
        expect(fallen.mode, "fell back to DOM").toBe("dom");
        expect(fallen.reason, "named reason").toMatch(/canvas-content/);
        expect(fallen.reason).toContain("probe");
        const png = await shot();
        const [div, canvas] = [await call("slot", 0), await call("slot", 1)];
        expect(near(centre(png, canvas, dpr), RED), `the DOM presentation shows the canvas (${centre(png, canvas, dpr)})`).toBe(true);
        expect(near(centre(png, div, dpr), GREEN)).toBe(true);
        // An explicit enable() with the canvas still there is refused with the same reason.
        const refused = await call("enable");
        expect(refused.mode).toBe("dom");
        expect(JSON.stringify(refused.admission) + refused.reason).toMatch(/canvas-content/);
        // The canvas goes; an explicit enable() admits again (no automatic readmission, as for every other reason).
        await call("remove", 1);
        const admitted = await call("enable");
        expect(admitted.mode, `admitted again (${admitted.reason})`).toBe("gpu");
        expect(admitted.reason).toMatch(healthy);
        // The plain layer is untouched throughout: pixels and native hits.
        const swatch = await call("box", "swatch"), button = await call("box", "plain-button");
        const after = await shot();
        expect(near(centre(after, swatch, dpr), GREEN)).toBe(true);
        const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, { x: button.x + button.width / 2, y: button.y + button.height / 2 });
        expect(hit, "native hit lands on the original button").toBe("plain-button");
        expect(errors.filter(refusal), "only the logged refusal").toEqual([]);
      } finally { await context.close(); }
    });

    test("a canvas added later falls back at once; enabling with a canvas present is refused; the override admits it", async ({ browser }) => {
      const { context, call, errors } = await openCore(browser, dpr);
      try {
        await call("install", ["div"]);
        expect((await call("state")).mode).toBe("gpu");
        await call("add", "2d");
        const fallen = await call("state");
        expect(fallen.mode, "a canvas added later: DOM").toBe("dom");
        expect(fallen.reason).toMatch(/canvas-content/);
        // The override, set on the canvas in DOM mode, is read at the next explicit admission.
        await call("setAttribute", 1, "data-underglass-gpu-canvas", "allow");
        const admitted = await call("enable");
        expect(admitted.mode, `override admits (${admitted.reason})`).toBe("gpu");
        // A second canvas without the override, added while on GPU: refused again, and only by that canvas.
        await call("add", "2d-blue");
        const again = await call("state");
        expect(again.mode).toBe("dom");
        expect(again.reason).toMatch(/canvas-content/);
        // Any other value of the attribute is not the override.
        await call("remove", 2);
        await call("setAttribute", 1, "data-underglass-gpu-canvas", "yes");
        const wrong = await call("enable");
        expect(wrong.mode).toBe("dom");
        await call("setAttribute", 1, "data-underglass-gpu-canvas", null);
        expect((await call("enable")).mode).toBe("dom");
        expect(errors.filter(refusal), "only the logged refusals").toEqual([]);
      } finally { await context.close(); }
    });

    test("a canvas outside every layer changes nothing: GPU stays on, the plain layer stays fresh and its hits correct", async ({ browser }) => {
      const { context, call, shot, page, errors } = await openCore(browser, dpr);
      try {
        await call("outsideCanvas");
        await call("settle");
        const state = await call("state");
        expect(state.mode, state.reason).toBe("gpu");
        expect(state.reason).toMatch(healthy);
        const png = await shot();
        expect(near(centre(png, await call("box", "outside"), dpr), RED), "the outside canvas is plain DOM pixels").toBe(true);
        expect(near(centre(png, await call("box", "swatch"), dpr), GREEN)).toBe(true);
        // Fresh pixels: restyle the plain layer and see the change on the GPU output.
        await page.evaluate(() => { document.getElementById("swatch").style.background = "rgb(40, 40, 200)"; });
        await call("settle");
        const changed = await shot();
        expect(near(centre(changed, await call("box", "swatch"), dpr), BLUE), "fresh pixels after a change").toBe(true);
        expect((await call("state")).mode).toBe("gpu");
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });

    test("with the override the layer stays on GPU and its other content stays fresh with correct hits", async ({ browser }) => {
      const { context, call, shot, page, errors } = await openCore(browser, dpr);
      try {
        await call("install", ["2d", "div"], true);
        const state = await call("state");
        expect(state.mode, state.reason).toBe("gpu");
        const png = await shot();
        expect(near(centre(png, await call("slot", 0), dpr), RED), "the first canvas is captured").toBe(true);
        expect(near(centre(png, await call("slot", 1), dpr), GREEN)).toBe(true);
        // Redraw the canvas: the capture follows (a repaint of the canvas is a paint-event change).
        await call("redraw", 0, BLUE);
        const redrawn = await shot();
        expect(near(centre(redrawn, await call("slot", 0), dpr), BLUE), `fresh pixels after a redraw (${centre(redrawn, await call("slot", 0), dpr)})`).toBe(true);
        const slot = await call("slot", 1);
        const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("data-slot"), { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 });
        expect(hit, "native hit on the original element").toBe("1");
        expect((await call("state")).mode).toBe("gpu");
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  });
}
