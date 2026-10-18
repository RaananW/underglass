/**
 * Browser test of the Astro Fader (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`,
 * page `fader.astro`) with Astro, serves its output through request routing, and checks that
 * - the Fader renders exactly the markup example on its anatomy page `fader.md`;
 * - with JavaScript off it is a named native vertical slider whose keys work and whose value submits with its form;
 * - with JavaScript, the components' `attachStrata` gives it its behaviour: a real numeral click, a drag of the
 *   carriage, the value text and the carriage following, and the double-click reset to `resetValue`; `class` and
 *   `style` reach the root;
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
const example = [...readFileSync(new URL("../../docs/ui-library/components/fader.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][0][1];
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
  await page.goto(`${origin}/fader/`);
  return { context, page };
}

test("the Astro Fader renders its anatomy markup and is a native vertical slider without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="fader.md"]')), window.canonical(host)];
  }, example);
  expect(rendered, "fader.md matches its markup contract").toEqual(expected);
  const volume = page.getByRole("slider", { name: "Volume" });
  await expect(volume).toHaveValue("40");
  await expect(volume).toHaveAttribute("aria-valuetext", "40%");
  await expect(volume).toHaveAttribute("aria-orientation", "vertical");
  await volume.focus();
  await page.keyboard.press("ArrowUp");
  await expect(volume).toHaveValue("41");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("faders"))))).toEqual({ volume: "41", pan: "10" });
  await context.close();
});

test("with JavaScript the Astro Fader follows its value: numeral clicks, a carriage drag, its value text and the reset", async ({ browser }) => {
  const { context, page } = await open(browser);
  const volume = page.locator("#volume"), fader = page.locator(".ug-fader", { has: volume });
  expect(await fader.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.dataset.testid }))).toEqual({ className: "ug-fader extra", margin: "4px", testid: "volume" });
  const mark = async (selector, text) => centre(await page.locator(".ug-fader", { has: page.locator(selector) }).locator(".ug-fader__mark").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  // The behaviour script is a module: wait until the carriage follows a numeral click.
  await expect(async () => {
    await page.mouse.click(...await mark("#volume", "75"));
    expect(Number(await volume.inputValue())).toBe(75);
    expect(await fader.evaluate(element => element.style.getPropertyValue("--strata-fader-value"))).toBe("0.75");
  }).toPass({ timeout: 5000 });
  await expect(volume).toHaveAttribute("aria-valuetext", "75%");
  const [cx, cy] = centre(await fader.locator(".ug-fader__carriage").boundingBox());
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 45, { steps: 6 });
  await page.mouse.up();
  expect(Number(await volume.inputValue())).toBe(50);
  await expect(volume).toHaveAttribute("aria-valuetext", "50%");
  const pan = page.locator("#pan");
  await expect(pan).not.toHaveAttribute("aria-orientation");
  await page.mouse.click(...await mark("#pan", "R"));
  expect(Number(await pan.inputValue())).toBe(50);
  await page.mouse.dblclick(...await mark("#pan", "L"));
  expect(Number(await pan.inputValue())).toBe(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
