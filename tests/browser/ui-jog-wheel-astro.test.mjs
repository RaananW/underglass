/**
 * Browser test of the Astro JogWheel (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `jog-wheel.astro`) with Astro, serves its output through request routing, and checks that
 * - the JogWheel renders exactly the two markup examples on its anatomy page `jog-wheel.md`;
 * - with JavaScript off it is a named native slider whose keys work and whose value submits with its form;
 * - with JavaScript, the components' `attachStrata` gives it the round behaviour: a real circular drag, a tap, the wrap, its value text and
 *   the angle following, and the double-click reset; `class` and `style` reach the root;
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
const examples = [...readFileSync(new URL("../../docs/ui-library/components/jog-wheel.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "jog-wheel:0": examples[0], "jog-wheel:1": examples[1] };
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
  await page.goto(`${origin}/jog-wheel/`);
  return { context, page };
}

test("the Astro JogWheel renders its anatomy markup and is a native slider without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  const frame = page.getByRole("slider", { name: "Frame" });
  await expect(frame).toHaveValue("12");
  await expect(frame).toHaveAttribute("aria-valuetext", "12 fr");
  await frame.focus();
  await page.keyboard.press("ArrowUp");
  await expect(frame).toHaveValue("13");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("wheels"))))).toEqual({ frame: "13", mark: "3" });
  await context.close();
});

test("with JavaScript the Astro JogWheel is round: a circular drag, a tap, the wrap, its value text and angle, and the reset", async ({ browser }) => {
  const { context, page } = await open(browser);
  const frame = page.locator("#frame"), wheel = page.locator(".ug-jog-wheel", { has: frame });
  expect(await wheel.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.dataset.testid }))).toEqual({ className: "ug-jog-wheel extra", margin: "4px", testid: "frame" });
  const [cx, cy] = centre(await frame.boundingBox());
  // The behaviour script is a module: wait until a tap on the upper half takes effect.
  await expect(async () => {
    await page.mouse.click(cx, cy - 30);
    expect(Number(await frame.inputValue())).toBeGreaterThan(12);
  }).toPass({ timeout: 5000 });
  const afterTaps = Number(await frame.inputValue());
  // A quarter turn clockwise at radius 40, held still before it is let go: 6 steps.
  const at = degrees => [cx + 40 * Math.sin((degrees * Math.PI) / 180), cy - 40 * Math.cos((degrees * Math.PI) / 180)];
  await page.mouse.move(...at(0));
  await page.mouse.down();
  for (let step = 1; step <= 24; step++) await page.mouse.move(...at((90 * step) / 24));
  await page.waitForTimeout(150);
  await page.mouse.up();
  expect(Number(await frame.inputValue())).toBe(afterTaps + 6);
  await expect(frame).toHaveAttribute("aria-valuetext", `${afterTaps + 6} fr`);
  const angle = await wheel.evaluate(element => Number.parseFloat(element.style.getPropertyValue("--strata-jog-angle")));
  expect(angle, "the angle is the value's steps from the origin, 15° each").toBeCloseTo((afterTaps + 6) * 15, 0);
  // Past the last value goes round; the angle goes on.
  await frame.focus();
  await frame.evaluate(input => { input.value = "99"; input.dispatchEvent(new Event("input", { bubbles: true })); });
  const at99 = await wheel.evaluate(element => Number.parseFloat(element.style.getPropertyValue("--strata-jog-angle")));
  await page.keyboard.press("ArrowUp");
  expect(Number(await frame.inputValue())).toBe(0);
  expect(await wheel.evaluate(element => Number.parseFloat(element.style.getPropertyValue("--strata-jog-angle")))).toBe(at99 + 15);
  await page.mouse.dblclick(cx + 50, cy + 50);
  expect(Number(await frame.inputValue())).toBe(12);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
