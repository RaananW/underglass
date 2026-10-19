/**
 * The Strata GPU helper's material rules at the Instrument level (issue #173, `docs/ui-library/components/button.md` section 11):
 * on `ui-push-button.html?level=instrument&keys=18` (`window.strataPushProbe`) the panel holds the push buttons, a plain Button
 * and 18 plain Buttons in colours of their own, each of which would need a key body of its own material.
 * - A key past `INSTRUMENT_KEY_BODY_MATERIALS` (14) is a Relief key, and so are the later colours until the scene, with the push buttons' lens materials added after the keys, is within core's 16; the helper says so: `strata.diagnostics(panel)` names
 *   the keys and the material count against core's cap, and one `console.warn` names the panel, once however many scenes follow.
 * - GPU stays on and core draws the layer ready (the helper stayed under the cap; nothing is stepped down), the Relief keys are
 *   drawn (their boxes are not blank) and are not objects of the scene, the others are.
 * Before the fix the helper had no `diagnostics` and warned nothing: the buttons changed from keys to Relief keys silently.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const ready = page => page.waitForFunction(() => window.strataPushProbe.instrument()?.layers.length && window.strataPushProbe.instrument().layers.every(layer => layer.status === "ready"), null, { timeout: 30000 });
const settle = page => page.evaluate(async () => { window.strataPushProbe.refresh(); await window.strataPushProbe.controller.settle(); });
const healthy = /^Current content=drawable owning WebGPU canvas/;

test("past 14 materials the plain buttons are Relief keys, reported once and in the diagnostics, GPU on and nothing blank", async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const warnings = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  try {
    await page.goto("/ui-push-button.html?level=instrument&keys=18");
    await page.waitForFunction(() => window.strataPushProbe?.controller?.state().mode === "gpu" && window.strataPushProbe.scene() !== undefined, null, { timeout: 60000 });
    await page.evaluate(async () => { window.strataPushProbe.refresh(); await window.strataPushProbe.controller.settle(); });
    // More scenes: refreshes, a hover, a press.
    for (let index = 0; index < 3; index++) await page.evaluate(async () => { window.strataPushProbe.refresh(); await window.strataPushProbe.controller.settle(); });
    await page.hover("#key-3");
    await page.evaluate(async () => { window.strataPushProbe.refresh(); await window.strataPushProbe.controller.settle(); });
    await ready(page);
    const state = await page.evaluate(() => {
      const probe = window.strataPushProbe, diagnostics = probe.diagnostics(), scene = probe.scene(), counts = probe.counts();
      const layer = probe.instrument().layers.find(entry => entry.id === "push-panel") ?? probe.instrument().layers[0];
      return { diagnostics, counts, reason: probe.controller.state().reason, objects: scene.objects.map(object => object.id), layer: { status: layer.status, steppedDown: layer.steppedDown, materials: layer.materials },
        boxes: Object.fromEntries([...document.querySelectorAll("[id^=key-]")].map(button => [button.id, button.getBoundingClientRect().toJSON()])) };
    });
    expect(state.counts.mode, state.reason).toBe("gpu");
    expect(state.reason).toMatch(healthy);
    expect(state.diagnostics.materials.cap).toBe(16);
    expect(state.diagnostics.materials.count).toBeGreaterThan(10);
    expect(state.diagnostics.materials.count).toBeLessThanOrEqual(16);
    expect(state.layer.status, "the helper stayed under core's cap: the layer is ready").toBe("ready");
    expect(state.layer.steppedDown).toEqual([]);
    expect(state.layer.materials).toEqual(state.diagnostics.materials);
    const atRelief = state.diagnostics.keysAtRelief;
    expect(atRelief.length, "some keys are Relief keys").toBeGreaterThan(3);
    expect(atRelief.length, "and some still have a key body").toBeLessThan(19);
    for (let index = 0; index < 18; index++) {
      const id = `key-${index}`;
      expect(state.objects.includes(id), `${id}: ${atRelief.includes(id) ? "a Relief key is no object" : "a key body is an object"}`).toBe(!atRelief.includes(id));
    }
    // Once, naming the panel, the count and the rule.
    const reported = warnings.filter(text => text.includes("Relief keys"));
    expect(reported, warnings.join("\n")).toHaveLength(1);
    expect(reported[0]).toContain("push-panel");
    expect(reported[0]).toContain(`${state.diagnostics.materials.count} materials`);
    const rules = await page.evaluate(() => window.strataPushProbe.rules);
    expect(reported[0]).toContain(String(rules.keyBody));
    expect(reported[0]).toContain(String(rules.push));
    expect(warnings.filter(text => text.includes("above core's cap")), "the helper never reached core's cap here").toHaveLength(0);
    // The Relief keys are drawn: each box differs from the panel with that key hidden (a face-only reference).
    const withKeys = PNG.sync.read(await page.screenshot());
    await page.evaluate(ids => { for (const id of ids) document.getElementById(id).style.visibility = "hidden"; }, atRelief);
    await settle(page);
    const without = PNG.sync.read(await page.screenshot());
    for (const id of atRelief) {
      const box = state.boxes[id];
      let changed = 0;
      for (let y = Math.ceil(box.y); y < Math.floor(box.y + box.height); y++) for (let x = Math.ceil(box.x); x < Math.floor(box.x + box.width); x++) {
        const offset = (y * withKeys.width + x) * 4;
        if (withKeys.data[offset] !== without.data[offset] || withKeys.data[offset + 1] !== without.data[offset + 1] || withKeys.data[offset + 2] !== without.data[offset + 2]) changed++;
      }
      expect(changed, `${id} is drawn: its box differs from the face without it`).toBeGreaterThan(100);
    }
    await page.evaluate(ids => { for (const id of ids) document.getElementById(id).style.visibility = ""; }, atRelief);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("the once-per-panel warning re-arms when the panel fits again: overflow, fit, overflow warns twice", async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const warnings = [];
  page.on("console", message => { if (message.type() === "warning") warnings.push(message.text()); });
  const reported = () => warnings.filter(text => text.includes("Relief keys")).length;
  try {
    await page.goto("/ui-push-button.html?level=instrument&keys=18");
    await page.waitForFunction(() => window.strataPushProbe?.controller?.state().mode === "gpu" && window.strataPushProbe.scene() !== undefined, null, { timeout: 60000 });
    await ready(page);
    await settle(page);
    expect(reported(), "overflow warns").toBe(1);
    // Fits again: no extra keys, nothing at Relief, no new warning.
    await page.evaluate(() => window.strataPushProbe.setKeys(0));
    await settle(page);
    await ready(page);
    await settle(page);
    expect((await page.evaluate(() => window.strataPushProbe.diagnostics())).keysAtRelief).toEqual([]);
    expect(reported(), "fitting warns nothing").toBe(1);
    // Overflows again, with other colours: warns again.
    await page.evaluate(() => window.strataPushProbe.setKeys(16));
    await settle(page);
    await ready(page);
    await settle(page);
    expect((await page.evaluate(() => window.strataPushProbe.diagnostics())).keysAtRelief.length).toBeGreaterThan(0);
    expect(reported(), warnings.join("\n")).toBe(2);
    await settle(page);
    expect(reported(), "and still once per overflow").toBe(2);
  } finally {
    await context.close();
  }
});
