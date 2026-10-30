/**
 * Core inside an open shadow root (`core-shadow-root.html`, `window.shadowCore`): the light DOM holds only the shadow host, and
 * the stage, its stylesheet and both layers live in the shadow tree, the way a page that mounts its demos in shadow DOM hosts an
 * app. `document.elementFromPoint` retargets every hit in there to the shadow host, so admission's native hit proofs must ask the
 * shadow root instead; before they did, admission failed with "probe failed interior/clipped hit testing" and the app stayed in
 * DOM. The `!important` pre-scan of animation ownership must read the shadow root's sheets too.
 * Measured on Canary 159.0.8133.0, at DPR 1 and 2; decoded screenshots.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const viewport = { width: 1280, height: 720 };
const BACKGROUND = [222, 225, 230];
const near = (actual, expected, tolerance = 8) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
const healthy = /^Current content=drawable owning WebGPU canvas/;
const centreOf = box => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

async function open(browser, dpr) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto("/core-shadow-root.html");
  await page.waitForFunction(() => window.shadowCore, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => {
    const api = await window.shadowCore.ready, value = api[name];
    return typeof value === "function" ? value(...args) : value;
  }, { name, args });
  // Admission ends in GPU or in a diagnosed DOM fallback; wait for either (an async predicate would resolve at once).
  await page.evaluate(async () => {
    const api = await window.shadowCore.ready, deadline = performance.now() + 60000;
    const settled = state => state.mode === "gpu" || (state.mode === "dom" && /admission failed/i.test(state.reason));
    while (!settled(api.state()) && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  });
  const pixel = async point => {
    const png = PNG.sync.read(await page.screenshot());
    const offset = (Math.round(point.y * dpr) * png.width + Math.round(point.x * dpr)) * 4;
    return [png.data[offset], png.data[offset + 1], png.data[offset + 2]];
  };
  return { context, page, errors, call, pixel };
}

for (const dpr of [1, 2]) {
  test(`DPR ${dpr}: GPU is admitted inside the shadow root, with fresh pixels and native hits that follow the layer`, async ({ browser }) => {
    const { context, page, errors, call, pixel } = await open(browser, dpr);
    try {
      const { GREEN, BLUE } = await call("colours");
      const admitted = await call("state");
      expect(admitted.mode, admitted.reason).toBe("gpu");
      expect(admitted.reason).toMatch(healthy);

      const swatch = centreOf(await call("box", "swatch")), press = centreOf(await call("box", "press")), field = centreOf(await call("box", "field"));
      // The document only sees the shadow host; the shadow root sees the control itself.
      expect(await call("hit", press.x, press.y)).toEqual({ document: "shadow-host", shadow: "press" });
      expect(near(await pixel(swatch), GREEN), `swatch ${await pixel(swatch)}`).toBe(true);

      // Fresh pixels: a content change inside the shadow tree is captured again, GPU stays on.
      await call("recolour", BLUE);
      expect(near(await pixel(swatch), BLUE), `recoloured swatch ${await pixel(swatch)}`).toBe(true);
      expect((await call("state")).mode).toBe("gpu");

      // Native input reaches the original controls.
      await page.mouse.click(press.x, press.y);
      expect(await call("presses")).toBe(1);
      await page.mouse.click(field.x, field.y);
      await page.keyboard.type("shadow");
      expect(await call("field")).toBe("shadow");
      expect(await call("focused")).toBe("field");

      // Move the layer: pixels and native hits follow it, and the old place no longer hits the button.
      const dx = 150, dy = 40;
      await call("move", dx, dy);
      expect((await call("state")).mode).toBe("gpu");
      expect(near(await pixel({ x: swatch.x + dx, y: swatch.y + dy }), BLUE), "moved swatch").toBe(true);
      expect(near(await pixel(swatch), BACKGROUND), `old swatch place ${await pixel(swatch)}`).toBe(true);
      expect((await call("hit", press.x + dx, press.y + dy)).shadow).toBe("press");
      await page.mouse.click(press.x + dx, press.y + dy);
      expect(await call("presses")).toBe(2);
      await page.mouse.click(press.x, press.y);
      expect(await call("presses")).toBe(2);

      const final = await call("state");
      expect(final.mode, final.reason).toBe("gpu");
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}

test("animation ownership reads the shadow root's stylesheets for important overrides", async ({ browser }) => {
  const { context, errors, call } = await open(browser, 1);
  try {
    expect((await call("state")).mode).toBe("gpu");
    expect(await call("ownGuarded")).toMatch(/Matching stylesheet important presentation overrides are unsupported/);
    // A refused ownership is not a GPU error: GPU stays on.
    expect((await call("state")).mode).toBe("gpu");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
