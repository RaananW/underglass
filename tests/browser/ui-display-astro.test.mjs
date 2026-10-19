/**
 * Browser test of the Astro Display (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `display.astro`) with Astro, serves its output through request routing, and checks that
 * - the TextField's `display` form and `Display` render exactly the markup examples on the anatomy page `display.md`;
 * - with JavaScript off a display is a named native input or output with its value, and the bezel and window are what was rendered
 *   (the backlight lit by CSS from `--strata-lit`, an unlit one not);
 * - with JavaScript, typing works, a written output text shows, `class` and `style` reach the root, and the `form` that is not `display`
 *   is the native form owner's id;
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
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const display = examples("display.md");
const contracts = { "display:0": display[0], "display:1": display[1], "display:2": display[2] };

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/display/`);
  return { context, page };
}

test("the Astro displays render their anatomy markup, and with JavaScript off they are named native elements with the drawing as rendered", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Hello");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveAccessibleDescription("Shown on the glass");
  await expect(page.locator("#rate")).toHaveAccessibleName("Frame rate");
  await expect(page.locator("#rate")).toHaveText("60 fps");
  await expect(page.locator("#serial")).toHaveJSProperty("readOnly", true);
  // The drawing is what was rendered: a lit backlight by CSS (`--strata-lit` 1), an unlit one not.
  const lit = id => page.locator(`#${id}`).evaluate(native => Number(getComputedStyle(native.closest(".ug-display")).getPropertyValue("--strata-lit")));
  expect([await lit("name"), await lit("rate"), await lit("serial")]).toEqual([1, 1, 0]);
  // Typing is the browser's, with no script of ours.
  await page.getByRole("textbox", { name: "Name" }).click();
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Hello!");
  await context.close();
});

test("with JavaScript a written output text shows, class and style reach the root, a non-display form is the native form owner, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.locator("#rate").evaluate(output => { output.textContent = "144 fps"; });
  await expect(page.locator("#rate")).toHaveText("144 fps");
  const rate = page.locator(".ug-display", { has: page.locator("#rate") });
  expect(await rate.evaluate(element => ({ className: element.className, margin: element.style.marginRight, backlight: element.dataset.strataBacklight, form: element.dataset.strataForm }))).toEqual({ className: "ug-display ug-display--output extra", margin: "4px", backlight: "info", form: "display" });
  await expect(page.locator("#rate")).toHaveAttribute("aria-live", "off");
  expect(await page.locator("#echo").getAttribute("aria-live")).toBeNull();
  const name = page.locator(".ug-display", { has: page.locator("#name") });
  await expect(name).toHaveAttribute("data-strata-size", "small");
  await expect(name).toHaveCSS("margin-right", "4px");
  await expect(page.locator("input[data-testid=name]")).toHaveCount(1);
  const owner = page.locator("#owner");
  await expect(owner).toHaveAttribute("form", "login-form");
  await expect(owner).toHaveClass("ug-text-field");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
