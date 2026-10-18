/**
 * Browser test of the Astro Meter and Gauge (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`,
 * page `meter.astro`) with Astro, serves its output through request routing, and checks that
 * - the components render exactly the markup examples on their anatomy pages `meter.md` and `gauge.md`;
 * - with JavaScript off a meter is a named native `<meter>` with its value, range and zones, and the drawing is what was
 *   rendered (the segments lit by CSS from `--strata-meter-value`);
 * - with JavaScript, the components' `attachStrata` keeps the drawing in step with a written `value`
 *   (`--strata-meter-value`, the unit's `aria-valuetext`, the zones) and holds a bar's peak; `class` and `style` reach the root;
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
const meter = examples("meter.md"), gauge = examples("gauge.md");
const contracts = { "meter:0": meter[0], "meter:1": meter[1], "gauge:0": gauge[0] };
const lit = (page, id) => page.locator(`#${id}`).evaluate(native => [...native.closest(".ug-meter").querySelectorAll(".ug-meter__segment")].filter(segment => Number(getComputedStyle(segment).getPropertyValue("--strata-lit")) >= 0.5).length);

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
  await page.goto(`${origin}/meter/`);
  return { context, page };
}

test("the Astro Meter and Gauge render their anatomy markup, and with JavaScript off they are named native meters with the drawing as rendered", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  await expect(page.getByRole("meter", { name: "Bar" })).toHaveAttribute("id", "bar");
  await expect(page.getByRole("meter", { name: "Dial" })).toHaveAttribute("id", "dial");
  expect(await page.locator("#bar").evaluate(native => [native.value, native.min, native.max, native.low, native.high, native.optimum])).toEqual([30, 0, 100, 70, 90, 0]);
  await expect(page.locator("#bar")).toHaveAttribute("aria-valuetext", "30 %");
  await expect(page.locator("#plain")).not.toHaveAttribute("aria-valuetext", /.*/);
  // The drawing is what was rendered: 30% of 16 segments is 5 lit, by CSS alone.
  expect(await lit(page, "bar")).toBe(5);
  expect(await lit(page, "plain")).toBe(5);
  await context.close();
});

test("with JavaScript the drawing follows a written value, the unit's text and the zones, a bar holds its peak, class and style reach the root, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  // The behaviour script is a module: wait until a written value takes effect.
  await expect(async () => {
    await page.locator("#bar").evaluate(native => { native.value = native.value === 80 ? 81 : 80; });
    await expect(page.locator(".ug-meter", { has: page.locator("#bar") })).toHaveCSS("--strata-meter-value", /0\.8/, { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.locator("#bar").evaluate(native => { native.value = 80; });
  await expect(page.locator("#bar")).toHaveAttribute("aria-valuetext", "80 %");
  expect(await lit(page, "bar")).toBeGreaterThanOrEqual(13);
  // A lowered value leaves the peak held; the zones follow `low`, `high` and `optimum` when they are rewritten (optimum in the high region: bad below 30, suboptimal to 90, good above).
  await page.locator("#bar").evaluate(native => { native.value = 10; });
  expect(await page.locator("#bar").evaluate(native => native.closest(".ug-meter").style.getPropertyValue("--strata-meter-peak-index"))).toBe("12");
  await page.locator("#bar").evaluate(native => { native.setAttribute("optimum", "100"); native.setAttribute("low", "30"); });
  await expect(async () => expect(await page.locator("#bar").evaluate(native => [...native.closest(".ug-meter").querySelectorAll(".ug-meter__segment")].map(segment => segment.getAttribute("data-strata-zone")[0]).join(""))).toBe("bbbbbwwwwwwwwwgg")).toPass({ timeout: 2000 });
  // The needle meter and the gauge follow too.
  await page.locator("#dial").evaluate(native => { native.value = 100; });
  await expect(page.locator("#dial")).toHaveAttribute("aria-valuetext", "100 bar");
  expect(await page.locator(".ug-meter", { has: page.locator("#dial") }).evaluate(root => root.style.getPropertyValue("--strata-meter-value"))).toBe("1");
  // class and style on the root; the size sets the lens.
  const bar = page.locator(".ug-meter", { has: page.locator("#bar") });
  expect(await bar.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.dataset.testid, size: element.dataset.strataSize }))).toEqual({ className: "ug-meter ug-meter--bar ug-meter--peak extra", margin: "4px", testid: "bar", size: "small" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
