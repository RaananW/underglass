/**
 * Browser test of the Astro Knob (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`,
 * page `knob.astro`) with Astro, serves its output through request routing, and checks that
 * - the Knob renders exactly the markup example on its anatomy page `knob.md`;
 * - with JavaScript off it is a named native slider whose keys work and whose value submits with its form;
 * - with JavaScript, the components' `attachStrata` gives it the round behaviour: a real ring click, a cap tap, the
 *   value text and the dial following, and the double-click reset to `resetValue`; `class` and `style` reach the root;
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
const example = [...readFileSync(new URL("../../docs/ui-library/components/knob.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][0][1];
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
  await page.goto(`${origin}/knob/`);
  return { context, page };
}

test("the Astro Knob renders its anatomy markup and is a native slider without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="knob.md"]')), window.canonical(host)];
  }, example);
  expect(rendered, "knob.md matches its markup contract").toEqual(expected);
  const level = page.getByRole("slider", { name: "Level" });
  await expect(level).toHaveValue("40");
  await expect(level).toHaveAttribute("aria-valuetext", "40%");
  await level.focus();
  await page.keyboard.press("ArrowUp");
  await expect(level).toHaveValue("41");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("knobs"))))).toEqual({ level: "41", mix: "7" });
  await context.close();
});

test("with JavaScript the Astro Knob is round: ring clicks, cap taps, its value text and the reset", async ({ browser }) => {
  const { context, page } = await open(browser);
  const level = page.locator("#level"), knob = page.locator(".ug-knob", { has: level });
  expect(await knob.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.dataset.testid }))).toEqual({ className: "ug-knob extra", margin: "4px", testid: "level" });
  const mark = async (selector, text) => centre(await page.locator(".ug-knob", { has: page.locator(selector) }).locator(".ug-knob__mark").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  // The behaviour script is a module: wait until a ring click takes effect.
  await expect(async () => {
    await page.mouse.click(...await mark("#level", "80"));
    expect(Number(await level.inputValue())).toBe(80);
  }).toPass({ timeout: 5000 });
  await expect(level).toHaveAttribute("aria-valuetext", "80%");
  expect(await knob.evaluate(element => element.style.getPropertyValue("--strata-knob-value"))).toBe("0.8");
  const [cx, cy] = centre(await level.boundingBox());
  await page.mouse.click(cx, cy + 12);
  expect(Number(await level.inputValue())).toBe(79);
  const mix = page.locator("#mix");
  await page.mouse.click(...await mark("#mix", "10"));
  expect(Number(await mix.inputValue())).toBe(10);
  await page.mouse.dblclick(...await mark("#mix", "0"));
  expect(Number(await mix.inputValue())).toBe(5);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
