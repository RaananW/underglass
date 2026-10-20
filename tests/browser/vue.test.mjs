/**
 * Browser suite for the Vue 3 adapter `@underglass/vue` (`vue.html`, `window.frameworkProbe`): the shared
 * framework-adapter contract in `tests/helpers/framework-contract.mjs` at DPR 1 and 2, plus Vue-specific
 * checks. Updates made only through Vue reactivity (a `Surface` mounted and unmounted, a ref-enrolled
 * section, reactive text and styles) must stay GPU-presented with fresh pixels and correct native hits.
 * Reports and screenshots go to the `frameworks` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { frameworkContract } from "../helpers/framework-contract.mjs";

const directory = evidenceDirectory("frameworks");
for (const dpr of [1, 2]) test(`Vue adapter keeps GPU presentation, fresh pixels and native hits DPR${dpr}`, async ({ browser }) => {
  await frameworkContract(browser, { path: "/vue.html", framework: "vue", dpr, directory });
});

// The page runs the pinned Vue, and the adapter-rendered layer is the original drawable `<section>`
// carrying the compiled typed styles, not a copy.
test("Vue Surface renders the original drawable section with compiled styles", async ({ page }) => {
  await page.goto("/vue.html");
  await page.waitForFunction(() => window.frameworkProbe);
  const state = await page.evaluate(() => window.frameworkProbe.state());
  expect(state.vue).toBe("3.5.44");
  const panel = await page.locator("#panel").evaluate(node => ({
    tag: node.tagName, drawable: node.getAttribute("drawable"), parent: node.parentElement === window.frameworkProbe.controller.container,
    left: node.style.left, width: node.style.width, origin: node.style.transformOrigin, background: getComputedStyle(node).backgroundColor,
  }));
  expect(panel).toEqual({ tag: "SECTION", drawable: "", parent: true, left: "20px", width: "280px", origin: "0px 0px", background: "rgb(240, 30, 60)" });
  // `useSurfaceRef` marks the app's own section drawable while it is enrolled.
  expect(await page.locator("#side").getAttribute("drawable")).toBe("");
  await page.evaluate(() => window.frameworkProbe.dispose());
});

// Under GPU presentation, `Presence` keeps its content until the exit motion on the enclosing layer
// completes and plays the enter motion when it returns, and `NativeOverlay` teleports a native dialog
// outside the captured root where it keeps focus and input. Neither revokes GPU.
test("Vue Presence and NativeOverlay keep GPU presentation and native overlay semantics", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/vue.html");
  await page.waitForFunction(() => window.frameworkProbe);
  expect((await page.evaluate(() => window.frameworkProbe.controller.enable())).mode).toBe("gpu");
  await page.evaluate(() => window.frameworkProbe.setBadge(false));
  // The badge stays mounted while the exit motion runs, then unmounts with one completed result.
  await expect(page.locator("#badge")).toBeVisible();
  await page.waitForFunction(() => window.frameworkProbe.state().completions.length === 1);
  await expect(page.locator("#badge")).toHaveCount(0);
  await page.evaluate(() => window.frameworkProbe.setBadge(true));
  await expect(page.locator("#badge")).toBeVisible();
  await page.waitForFunction(() => window.frameworkProbe.state().completions.length === 2);
  const presence = await page.evaluate(() => window.frameworkProbe.state());
  expect(presence.mode, presence.reason).toBe("gpu");
  expect(presence.completions.map(result => result.status)).toEqual(["completed", "completed"]);
  // The enter motion ends at rest: the layer is back at the identity transform.
  expect(presence.layers.find(layer => layer.id === "side").transform).toMatchObject({ x: 0, y: 0, opacity: 1 });

  // The dialog opens from a trusted click on the GPU-presented layer and lives in the overlay host.
  await page.locator("#dialog-open").click();
  await expect(page.locator("#dialog")).toBeVisible();
  expect(await page.evaluate(() => document.querySelector("#overlay").contains(document.querySelector("#dialog"))
    && !window.frameworkProbe.controller.container.contains(document.querySelector("#dialog")))).toBe(true);
  await page.locator("#dialog-input").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("from overlay");
  await page.locator("#dialog-close").click();
  await expect(page.locator("#dialog")).toBeHidden();
  // The overlay edit flows through Vue state into the original input on the GPU layer.
  await expect(page.locator("#name")).toHaveValue("from overlay");
  const overlay = await page.evaluate(() => window.frameworkProbe.state());
  expect(overlay.mode, overlay.reason).toBe("gpu");
  await page.evaluate(() => window.frameworkProbe.controller.disable());
  const disposed = await page.evaluate(() => window.frameworkProbe.dispose());
  expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
  expect(disposed.cleanups).toBe(1);
  expect(errors).toEqual([]);
});
