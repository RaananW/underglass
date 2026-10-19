/**
 * Browser test of the Astro Tabs rail form (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page `tabs-forms.astro`) with
 * Astro, serves its output through request routing, and checks that
 * - a rail Tabs renders exactly the markup example on its anatomy page `tabs.md` (section 11);
 * - with JavaScript off the tabs are the native buttons with the roles and the selected panel as rendered, and the selected key's LED is lit by CSS;
 * - with JavaScript, `attachStrata` selects a tab on a real click, moves and selects with the arrow keys (only moves with manual activation until Enter),
 *   and the LED and the key follow `aria-selected`; `class`, `style` and other attributes reach the root; flush and none render the flat tabs;
 * - axe finds no violations in light and dark.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const root = fileURLToPath(new URL("../../fixtures/astro-strata/", import.meta.url));
const dist = new URL("../../fixtures/astro-strata/dist/", import.meta.url);
const origin = "http://strata-astro.test";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const example = [...readFileSync(new URL("../../docs/ui-library/components/tabs.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][1][1];
const lit = (page, id) => page.evaluate(id => [...document.querySelectorAll(`[id^="${id}-tab-"]`)].map(tab => `${tab.getAttribute("aria-selected") === "true" ? "on" : "-"}:${getComputedStyle(tab.querySelector(".ug-tab__led")).getPropertyValue("--strata-lit").trim()}`), id);

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: "reduce", ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/tabs-forms/`);
  return { context, page };
}

test("the Astro Tabs rail renders its anatomy markup and, without JavaScript, the selected tab as rendered with its LED lit", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="tabs.md#rail"]')), window.canonical(host)];
  }, example);
  expect(rendered, "tabs.md section 11 matches its markup contract").toEqual(expected);
  expect(await lit(page, "acct")).toEqual(["on:1", "-:0", "-:0"]);
  await expect(page.getByRole("tabpanel", { name: "Profile" }).first()).toHaveText("Your name and photo.");
  await context.close();
});

test("with JavaScript a click and the arrow keys select, manual activation waits for Enter, the LEDs follow, props pass through, flush is flat, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  // The behaviour script is a module: wait until it has taken over (a click selects).
  await expect(async () => {
    await page.locator("#acct-tab-security").click();
    expect(await lit(page, "acct")).toEqual(["-:0", "on:1", "-:0"]);
  }).toPass({ timeout: 8000 });
  await expect(page.locator("#acct-panel-security")).toBeVisible();
  await page.locator("#acct-tab-security").focus();
  await page.keyboard.press("ArrowRight");
  expect(await lit(page, "acct"), "Billing is disabled: the arrow wraps to Profile").toEqual(["on:1", "-:0", "-:0"]);
  expect(await page.evaluate(() => document.activeElement.id)).toBe("acct-tab-profile");
  // Manual activation: the arrows only move focus.
  await page.locator("#manual-tab-security").focus();
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("manual-tab-profile");
  expect(await lit(page, "manual")).toEqual(["-:0", "on:1", "-:0"]);
  await page.keyboard.press("Enter");
  expect(await lit(page, "manual")).toEqual(["on:1", "-:0", "-:0"]);
  expect(await page.evaluate(() => { const root = document.querySelector('[data-testid="acct"]'); return [root.className, root.style.marginRight, root.dataset.testid, root.dataset.strataForm]; })).toEqual(["ug-tabs extra", "4px", "acct", "rail"]);
  for (const id of ["flat", "plain"]) expect(await page.evaluate(id => { const root = document.querySelector(`.ug-tabs:has([id^="${id}-tab-"])`); return { form: root.hasAttribute("data-strata-form"), rail: root.querySelectorAll(".ug-tabs__rail").length, leds: root.querySelectorAll(".ug-tab__led").length }; }, id), id).toEqual({ form: false, rail: 1, leds: 0 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").exclude("[hidden]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
