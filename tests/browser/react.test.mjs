/**
 * Browser suite for the React adapter `@underglass/react` on `react.html` (`window.frameworkProbe`): the shared
 * framework-adapter contract in `tests/helpers/framework-contract.mjs` at DPR 1 and 2, and its structural cases, on
 * the production build and, with `StrictMode`, on the Vite development server. Updates made only through React state
 * (`Surface`s mounted and unmounted, `useSurfaceRef` sections, `Presence`) must stay GPU-presented with fresh pixels
 * and correct native hits. Reports and screenshots go to the `frameworks` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { frameworkContract, frameworkCases } from "../helpers/framework-contract.mjs";

const directory = evidenceDirectory("frameworks");
for (const dpr of [1, 2]) test(`React adapter keeps GPU presentation, fresh pixels and native hits DPR${dpr}`, async ({ browser }) => {
  await frameworkContract(browser, { path: "/react.html", framework: "react", dpr, directory });
});
frameworkCases({ path: "/react.html", framework: "react", directory });
frameworkCases({ path: `${developmentURL}/react.html?strict`, framework: "react", label: "react StrictMode", directory });

// The page runs the React the lane expects (`CANVAS_EXPECT_REACT_VERSION` in the React 18 lane), and the adapter-rendered
// layer is the original drawable `<section>`.
test("React Surface renders the original drawable section", async ({ page }) => {
  await page.goto("/react.html");
  await page.waitForFunction(() => window.frameworkProbe);
  const { react } = await page.evaluate(() => window.frameworkProbe.state());
  expect(react).toMatch(/^1[89]\./);
  if (process.env.CANVAS_EXPECT_REACT_VERSION) expect(react).toBe(process.env.CANVAS_EXPECT_REACT_VERSION);
  const panel = await page.locator("#panel").evaluate(node => ({
    tag: node.tagName, drawable: node.getAttribute("drawable"), parent: node.parentElement === window.frameworkProbe.controller.container,
    left: node.style.left, width: node.style.width, background: getComputedStyle(node).backgroundColor,
  }));
  expect(panel).toEqual({ tag: "SECTION", drawable: "", parent: true, left: "20px", width: "280px", background: "rgb(240, 30, 60)" });
  // `useSurfaceRef` marks the app's own section drawable while it is enrolled.
  expect(await page.locator("#side").getAttribute("drawable")).toBe("");
  await page.evaluate(() => window.frameworkProbe.dispose());
});
