/**
 * A `<canvas>` inside a layer (issue #184). Two pages:
 * - `canvas-capture-raw.html` (`window.canvasCapture`, `window.canvasMarked`): no core, one `content="drawable"` output canvas and
 *   `drawElementImage`. It pins what this browser build captures of a nested canvas, unmarked and marked `content="drawable"` itself
 *   (before attaching, after attaching, after attaching then resized and redrawn), so a browser change is noticed here first;
 * - `core-canvas-content.html` (`window.canvasContent`): core with a probe layer and a plain layer. Core marks every `<canvas>` in an
 *   enrolled layer `content="drawable"` while GPU presents (at admission and for one added later), restores the author's value when GPU
 *   ends, and captures it like any content.
 * Measured on Canary 158.0.8112.0: an unmarked nested canvas is captured only when it is the first thing attached to its layer; a marked one
 * is captured in every arrangement and variant. At DPR 1 and 2; decoded screenshots.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const viewport = { width: 1280, height: 720 };
const BACKGROUND = [233, 235, 239], RED = [200, 40, 40], GREEN = [40, 160, 60], BLUE = [40, 40, 200], YELLOW = [230, 200, 20];
const near = (actual, expected, tolerance = 8) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
const evidence = async (name, value) => {
  await mkdir(evidenceDirectory("core-canvas-content"), { recursive: true });
  await writeFile(`${evidenceDirectory("core-canvas-content")}/${name}.json`, JSON.stringify(value, null, 2));
};

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
  const frames = n => opened.page.evaluate(async n => { for (let i = 0; i < n; i++) await new Promise(resolve => requestAnimationFrame(resolve)); }, n);
  return { ...opened, call, shot, frames };
}
/** The pixel at the centre of a client box in a screenshot. */
function centre(png, box, dpr) {
  const x = Math.round((box.x + box.width / 2) * dpr), y = Math.round((box.y + box.height / 2) * dpr), offset = (y * png.width + x) * 4;
  return [png.data[offset], png.data[offset + 1], png.data[offset + 2]];
}
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

  test("unmarked, each variant alone in a layer is captured, with fresh pixels after a redraw", async ({ browser }) => {
    const table = [];
    for (const id of variants) {
      const [row] = await raw(browser, [id]);
      table.push(row);
      expect(row.ownBitmap, `${id}: the canvas itself holds its pixels`).toEqual(row.id === "2d-after-frame" ? GREEN : row.expected);
      expect(row.capturesFirst || id === "2d-after-frame" || id === "hidden-then-shown-2d", `${id}: captured (${row.snapshotFirst})`).toBe(true);
      expect(row.capturesSecond, `${id}: captured after the redraw/show (${row.snapshotSecond})`).toBe(true);
    }
    const [holder] = await raw(browser, ["nested-canvas-holding-canvas"]);
    table.push(holder);
    expect(holder.blank, "canvas holding a drawable child: blank").toBe(true);
    await evidence("raw-alone", table);
  });

  test("unmarked, with the variants together only the first-attached canvas is captured; the img and a nested drawable canvas are", async ({ browser }) => {
    const rows = await raw(browser, undefined);
    const byId = Object.fromEntries(rows.map(row => [row.id, row]));
    await evidence("raw-together", rows);
    expect(byId["2d-fill"].capturesSecond, "the first canvas").toBe(true);
    for (const id of ["2d-drawImage", "2d-after-frame", "webgl", "webgl-preserve", "2d-read-frequently", "offscreen", "nested-canvas-holding-canvas", "deep-2d", "hidden-then-shown-2d"]) {
      expect(byId[id].blank, `${id}: blank behind the first canvas (${byId[id].snapshotSecond})`).toBe(true);
    }
    for (const id of ["img-of-toDataURL", "nested-drawable-canvas"]) expect(byId[id].capturesSecond, `${id} is captured`).toBe(true);
    const reversed = Object.fromEntries((await raw(browser, undefined, true)).map(row => [row.id, row]));
    expect(reversed["hidden-then-shown-2d"].capturesSecond, "reversed: the first canvas").toBe(true);
    for (const id of ["2d-fill", "2d-drawImage", "webgl", "2d-read-frequently", "offscreen", "deep-2d"]) expect(reversed[id].blank, `reversed ${id}: blank`).toBe(true);
  });

  const kinds = ["2d-fill", "2d-drawImage", "2d-after-frame", "webgl", "webgl-preserve", "2d-read-frequently", "offscreen", "deep", "hidden-then-shown"];
  const arrangements = ["alone", "after-div", "after-img", "last-of-three", "insert-before"];
  for (const mode of ["before", "after", "resize"]) {
    test(`marked content="drawable" (${mode === "before" ? "set before attaching" : mode === "after" ? "set after attaching" : "set, then resized and redrawn"}): every variant in every arrangement is captured`, async ({ browser }) => {
      const { context, page, errors } = await open(browser, 1, "/canvas-capture-raw.html");
      try {
        await page.waitForFunction(() => window.canvasMarked, null, { timeout: 60000 });
        const table = [];
        for (const kind of kinds) for (const arrangement of arrangements) {
          await page.reload();
          await page.waitForFunction(() => window.canvasMarked, null, { timeout: 60000 });
          const row = await page.evaluate(a => window.canvasMarked.runMarked(a.kind, a.mode, a.arrangement), { kind, mode, arrangement });
          table.push(row);
          const label = `${mode} ${kind} ${arrangement}`;
          // An OffscreenCanvas-transferred canvas cannot be resized by the platform, marked or not: the throw is the platform's.
          expect(row.errors.filter(text => !(kind === "offscreen" && mode === "resize" && /InvalidStateError/.test(text))), `${label}: no error`).toEqual([]);
          expect(row.capturesSecond, `${label}: captured (${row.snapshotSecond}, expected ${row.expectedSecond})`).toBe(true);
          if (mode !== "resize" && kind !== "hidden-then-shown") expect(row.capturesFirst, `${label}: captured at the first snapshot (${row.snapshotFirst})`).toBe(true);
          for (const other of row.others) expect(other.captures, `${label}: the other canvas ${other.name} (${other.second})`).toBe(true);
        }
        expect(errors).toEqual([]);
        await evidence(`raw-marked-${mode}`, table);
      } finally { await context.close(); }
    });
  }

  test("a redraw of a marked canvas raises a paint event of its own for 2D, WebGL and bitmaprenderer canvases, never for an OffscreenCanvas-transferred one", async ({ browser }) => {
    const { context, page, errors } = await open(browser, 1, "/canvas-capture-raw.html");
    try {
      const rows = {};
      for (const kind of ["2d", "2d-read-frequently", "webgl", "webgl-preserve", "bitmaprenderer", "offscreen"]) {
        await page.reload();
        await page.waitForFunction(() => window.canvasMarked, null, { timeout: 60000 });
        rows[kind] = await page.evaluate(kind => window.canvasMarked.paintsAfterRedraw(kind), kind);
      }
      await evidence("raw-marked-redraw-paints", rows);
      for (const kind of ["2d", "2d-read-frequently", "webgl", "webgl-preserve", "bitmaprenderer"]) {
        expect(rows[kind].paints, `${kind}: one paint per redraw`).toEqual([1, 1, 1]);
        expect(near(rows[kind].last, BLUE), `${kind}: the layer shows the last colour`).toBe(true);
      }
      // The browser raises no paint for an OffscreenCanvas commit (the layer stays at what the first paint saw): core cannot see it either.
      expect(rows.offscreen.paints.slice(1), "offscreen: no paint events from its commits (the first count is the layer's first paint)").toEqual([0, 0]);
      expect(near(rows.offscreen.last, BLUE), "offscreen: the layer never saw the last colour").toBe(false);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  for (const kind of ["2d", "webgl"]) {
    test(`the mark's side effects on the canvas itself (${kind}): layout, context, toDataURL, DOM pixels and hits unchanged`, async ({ browser }) => {
      const { context, page, errors } = await open(browser, 1, "/canvas-capture-raw.html");
      try {
        await page.waitForFunction(() => window.canvasMarked, null, { timeout: 60000 });
        const rows = {};
        for (const withMark of [false, true]) {
          await page.reload();
          await page.waitForFunction(() => window.canvasMarked, null, { timeout: 60000 });
          const row = await page.evaluate(a => window.canvasMarked.markEffects(a.kind, a.withMark), { kind, withMark });
          const png = PNG.sync.read(await page.screenshot());
          const offset = (Math.round(row.clientCentre[1]) * png.width + Math.round(row.clientCentre[0])) * 4;
          row.screenshotCentre = [png.data[offset], png.data[offset + 1], png.data[offset + 2]];
          rows[withMark ? "marked" : "unmarked"] = row;
        }
        await evidence(`mark-effects-${kind}`, rows);
        const { marked, unmarked } = rows;
        expect(unmarked.contentAfter, "an unmarked canvas is not drawable").not.toBe("drawable");
        expect(marked.contentAfter).toBe("drawable");
        expect(marked.rectBefore, "layout before and after the mark").toEqual(marked.rectAfter);
        expect(marked.rectAfter, "layout equals the unmarked canvas's").toEqual(unmarked.rectAfter);
        expect(marked.sameContext, "getContext returns the same context").toBe(true);
        expect(near(marked.toDataURLPixel, RED), "toDataURL still works").toBe(true);
        expect(near(marked.screenshotCentre, RED), `its own DOM presentation is unchanged (${marked.screenshotCentre})`).toBe(true);
        expect(near(unmarked.screenshotCentre, RED), "same as unmarked").toBe(true);
        expect(marked.hitOnCanvas, "native hit lands on the canvas").toBe(true);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  }
});

for (const dpr of [1, 2]) {
  test.describe(`core, DPR ${dpr}`, () => {
    const colours = { "2d": RED, "2d-blue": BLUE, "2d-read-frequently": RED, webgl: YELLOW, "webgl-preserve": YELLOW, offscreen: RED, img: BLUE, div: GREEN };
    async function measure(browser, kinds) {
      const { context, call, shot, errors } = await openCore(browser, dpr);
      try {
        expect((await call("state")).mode, "starts on GPU").toBe("gpu");
        await call("install", kinds);
        // An OffscreenCanvas-transferred canvas raises no paint when it commits: the author recaptures the layer after drawing it.
        if (kinds.includes("offscreen")) await call("invalidate");
        const state = await call("state");
        expect(state.mode, `GPU stays on (${state.reason})`).toBe("gpu");
        expect(state.reason).toMatch(healthy);
        const png = await shot();
        const out = [];
        for (let index = 0; index < kinds.length; index++) out.push(centre(png, await call("slot", index), dpr));
        expect(errors).toEqual([]);
        return out;
      } finally { await context.close(); }
    }

    test("every canvas in a layer is captured whatever its kind or place, and GPU stays on", async ({ browser }) => {
      const rows = {};
      for (const kinds of [["2d"], ["webgl"], ["webgl-preserve"], ["offscreen"], ["2d-read-frequently"], ["2d", "2d-blue"], ["2d", "div"], ["2d", "img"],
        ["div", "2d"], ["img", "2d", "2d-blue"], ["webgl", "2d"], ["2d", "div", "2d-blue"], ["div", "img", "2d", "webgl", "offscreen", "2d-blue", "2d-read-frequently", "webgl-preserve"]]) {
        const name = kinds.join(",");
        rows[name] = await measure(browser, kinds);
        kinds.forEach((kind, index) => expect(near(rows[name][index], colours[kind]), `${name}: slot ${index} (${kind}) is ${rows[name][index]}, expected ${colours[kind]}`).toBe(true));
      }
      await evidence(`core-dpr${dpr}`, rows);
    });

    test("a canvas redrawn or resized stays fresh, and hits land on the canvas and beside it", async ({ browser }) => {
      const { context, call, shot, page, errors } = await openCore(browser, dpr);
      try {
        await call("install", ["div", "2d", "2d-blue"]);
        await call("redraw", 1, BLUE);
        let png = await shot();
        expect(near(centre(png, await call("slot", 1), dpr), BLUE), `fresh after a redraw (${centre(png, await call("slot", 1), dpr)})`).toBe(true);
        await call("resize", 2, GREEN);
        png = await shot();
        expect(near(centre(png, await call("slot", 2), dpr), GREEN), `fresh after a resize and redraw (${centre(png, await call("slot", 2), dpr)})`).toBe(true);
        expect(near(centre(png, await call("slot", 0), dpr), GREEN), "the div beside them").toBe(true);
        expect((await call("state")).mode).toBe("gpu");
        const hit = async (x, y) => page.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? (e.getAttribute("data-slot") ?? e.id) : null; }, { x, y });
        const canvas = await call("slot", 1);
        expect(await hit(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2), "native hit on the canvas").toBe("1");
        expect(await hit(canvas.x + canvas.width + 8, canvas.y + canvas.height / 2), "beside the canvas: the layer").toBe("probe");
        const plain = await call("box", "plain-button");
        expect(await hit(plain.x + plain.width / 2, plain.y + plain.height / 2), "the plain layer's button").toBe("plain-button");
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });

    test("a canvas added later is marked and captured within a frame or two, GPU on", async ({ browser }) => {
      const { context, call, shot, page, frames, errors } = await openCore(browser, dpr);
      try {
        await call("install", ["div"]);
        const index = await call("appendOnly", "2d");
        await frames(2);
        const state = await call("state");
        expect(state.mode, state.reason).toBe("gpu");
        expect(await call("content", index), "marked").toBe("drawable");
        expect(near(centre(await shot(), await call("slot", index), dpr), RED), "captured").toBe(true);
        // A second and third, one a different kind, in the same frame.
        const more = [await call("appendOnly", "webgl"), await call("appendOnly", "2d-blue")];
        await frames(2);
        const png = await shot();
        expect(near(centre(png, await call("slot", more[0]), dpr), YELLOW) && near(centre(png, await call("slot", more[1]), dpr), BLUE), "both captured").toBe(true);
        expect((await call("state")).mode).toBe("gpu");
        expect(await page.evaluate(() => document.querySelectorAll("canvas[content=drawable]").length), "output canvas plus three marked").toBe(4);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });

    test("the mark follows GPU: given back on disable, restored to the author's value, kept when the author set it, dropped when a canvas leaves its layer", async ({ browser }) => {
      const { context, call, errors } = await openCore(browser, dpr);
      try {
        await call("install", ["2d", "2d-blue", "webgl", "2d-read-frequently"], [null, "fallback", "drawable", null]);
        expect(await call("content", 0), "marked").toBe("drawable");
        expect(await call("content", 1), "the author's fallback is replaced while GPU presents").toBe("drawable");
        expect(await call("content", 2)).toBe("drawable");
        // Layout does not move: the slot's box in GPU equals its box in DOM.
        const gpuBoxes = [await call("slot", 0), await call("slot", 1)];
        await call("disable");
        expect((await call("state")).mode).toBe("dom");
        expect(await call("content", 0), "no value before: none again").toBe(null);
        expect(await call("content", 1), "the author's value is back").toBe("fallback");
        expect(await call("content", 2), "the author set drawable: kept").toBe("drawable");
        const domBoxes = [await call("slot", 0), await call("slot", 1)];
        domBoxes.forEach((box, i) => ["x", "y", "width", "height"].forEach(key => expect(Math.abs(box[key] - gpuBoxes[i][key]), `slot ${i} ${key} is the same in GPU and DOM`).toBeLessThan(0.51)));
        // Enabling again marks them again; a canvas that leaves its layer gets its own value back while GPU stays on.
        const enabled = await call("enable");
        expect(enabled.mode, enabled.reason).toBe("gpu");
        expect(await call("content", 0)).toBe("drawable");
        expect(await call("content", 1)).toBe("drawable");
        await call("leave", 1);
        expect(await call("content", 1), "left the layer: the author's value").toBe("fallback");
        expect(await call("content", 0), "still in the layer").toBe("drawable");
        // Dispose gives everything back.
        await call("dispose");
        expect(await call("content", 0), "disposed").toBe(null);
        expect(await call("content", 3), "disposed").toBe(null);
        expect(await call("content", 2), "the author's drawable stays").toBe("drawable");
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });

    test("a canvas outside every layer is not marked and changes nothing", async ({ browser }) => {
      const { context, call, shot, page, errors } = await openCore(browser, dpr);
      try {
        await call("outsideCanvas");
        await call("settle");
        const state = await call("state");
        expect(state.mode, state.reason).toBe("gpu");
        expect(await page.evaluate(() => document.getElementById("outside").getAttribute("content")), "not marked").toBe(null);
        const png = await shot();
        expect(near(centre(png, await call("box", "outside"), dpr), RED), "plain DOM pixels").toBe(true);
        expect(near(centre(png, await call("box", "swatch"), dpr), GREEN)).toBe(true);
        await page.evaluate(() => { document.getElementById("swatch").style.background = "rgb(40, 40, 200)"; });
        await call("settle");
        expect(near(centre(await shot(), await call("box", "swatch"), dpr), BLUE), "fresh pixels after a change").toBe(true);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  });
}
