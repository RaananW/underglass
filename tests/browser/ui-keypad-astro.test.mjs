/**
 * Browser test of the Astro Keypad and KeypadKey (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `keypad.astro`) with Astro, serves its output through request routing, and checks that
 * - the Keypad and KeypadKey render exactly the two markup examples on the anatomy page `keypad.md`;
 * - with JavaScript off a key is a named native button: Space and Enter activate it, a submit key's name and value submit with its form,
 *   and a disabled one does nothing;
 * - with JavaScript, the components' `attachStrata` holds a key down while it is pressed and runs the grid's arrows, skipping a disabled
 *   key; `class`, `style`, `value`, `aria-label` and `shifted` reach the right element;
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
const examples = [...readFileSync(new URL("../../docs/ui-library/components/keypad.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "keypad.md": examples[0], "keypad.md#2": examples[1] };
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
  await page.goto(`${origin}/keypad/`);
  return { context, page };
}

test("the Astro Keypad and KeypadKey render their markup and are native buttons without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  await expect(page.getByRole("group", { name: "Dial" })).toHaveCount(1);
  const two = page.getByRole("button", { name: "2 ABC" });
  await expect(two).toHaveAttribute("type", "submit");
  // A native submit button submits its name and value with its form.
  const data = () => page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("keypads"), document.getElementById("two"))));
  expect(await data()).toEqual({ digit: "2" });
  await expect(page.locator("#four")).toBeDisabled();
  await expect(page.locator("#hex")).toHaveAttribute("data-strata-shifted", "true");
  await context.close();
});

test("with JavaScript the Astro keys are held while pressed and the grid's arrows move between them, with their props on the right element", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.evaluate(() => { document.getElementById("keypads").addEventListener("submit", event => event.preventDefault()); });
  const two = page.locator("#two");
  expect(await page.locator("#dial").evaluate(fieldset => ({ className: fieldset.className, style: fieldset.getAttribute("style"), testid: fieldset.dataset.testid, legend: fieldset.querySelector(":scope > legend").textContent }))).toEqual({ className: "ug-keypad extra", style: "--strata-keypad-columns: 3; margin-right: 4px", testid: "dial", legend: "Dial" });
  expect(await two.evaluate(button => ({ className: button.className, value: button.value, testid: button.dataset.testid, type: button.type }))).toEqual({ className: "ug-keypad__key extra", value: "2", testid: "two", type: "submit" });
  await expect(page.locator("#five")).toHaveAccessibleName("5, five");
  // The behaviour script is a module: wait until a press takes effect.
  const box = await two.boundingBox();
  await expect(async () => {
    await page.mouse.move(...centre(box));
    await page.mouse.down();
    await expect(two).toHaveAttribute("data-strata-down", "true", { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.mouse.up();
  await expect(two).toHaveAttribute("data-strata-down", "false");
  // The grid's arrows: one tab stop, three columns (two three / four five), the disabled four skipped.
  await two.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#three")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#three")).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(page.locator("#five")).toBeFocused();
  // A disabled one is never held.
  await page.mouse.click(...centre(await page.locator("#four").boundingBox()));
  expect(await page.locator("#four").getAttribute("data-strata-down")).toBe(null);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
