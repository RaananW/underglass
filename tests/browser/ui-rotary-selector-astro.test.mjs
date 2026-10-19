/**
 * Browser test of the Astro RotarySelector (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`,
 * page `rotary-selector.astro`) with Astro, serves its output through request routing, and checks that
 * - the RotarySelector renders exactly the markup example on its anatomy page `rotary-selector.md`;
 * - with JavaScript off it is a named native select whose keys work and whose value submits with its form;
 * - with JavaScript, the components' `attachStrata` gives it the round behaviour: a real click on a printed label, a cap tap,
 *   the dial and the selected print following; `class` and `style` reach the root;
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
const example = [...readFileSync(new URL("../../docs/ui-library/components/rotary-selector.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][0][1];
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

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
  await page.goto(`${origin}/rotary-selector/`);
  return { context, page };
}

test("the Astro RotarySelector renders its anatomy markup and is a native select without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="rotary-selector.md"]')), window.canonical(host)];
  }, example);
  expect(rendered, "rotary-selector.md matches its markup contract").toEqual(expected);
  const mode = page.getByRole("combobox", { name: "Mode" });
  await expect(mode).toHaveValue("low");
  await mode.focus();
  await page.keyboard.press("ArrowDown");
  await expect(mode).toHaveValue("mid");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("selectors"))))).toEqual({ mode: "mid", tone: "flat" });
  await context.close();
});

test("with JavaScript the Astro RotarySelector is round: label clicks, cap taps, and the dial following", async ({ browser }) => {
  const { context, page } = await open(browser);
  const mode = page.locator("#mode"), selector = page.locator(".ug-rotary", { has: mode });
  expect(await selector.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.dataset.testid }))).toEqual({ className: "ug-rotary extra", margin: "4px", testid: "mode" });
  const label = async (id, text) => centre(await page.locator(".ug-rotary", { has: page.locator(`#${id}`) }).locator(".ug-rotary__text").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  // The behaviour script is a module: wait until a click takes effect.
  await expect(async () => {
    await page.mouse.click(...await label("mode", "High"));
    expect(await mode.inputValue()).toBe("high");
  }).toPass({ timeout: 5000 });
  expect(await selector.evaluate(element => element.style.getPropertyValue("--strata-rotary-value"))).toBe("1");
  expect(await selector.evaluate(element => [...element.querySelectorAll(".ug-rotary__mark")].map(mark => mark.dataset.strataSelected))).toEqual(["false", "false", "false", "true"]);
  const [cx, cy] = centre(await mode.boundingBox());
  await page.mouse.click(cx, cy + 12);
  expect(await mode.inputValue()).toBe("mid");
  const tone = page.locator("#tone");
  await page.mouse.click(...await label("tone", "Bright"));
  expect(await tone.inputValue()).toBe("bright");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("selectors"))))).toEqual({ mode: "mid", tone: "bright" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
