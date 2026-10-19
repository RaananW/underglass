/**
 * Browser test of the Astro PatchPoint and PatchBay (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `patch-point.astro`) with Astro, serves its output through request routing, and checks that
 * - the components render exactly the three markup examples on their anatomy page `patch-point.md`;
 * - with JavaScript off a checkbox jack is a named native checkbox that submits with its form, a button jack is a named native button, and the
 *   drawing is what was rendered (the plug shows for a connected jack by CSS alone);
 * - with JavaScript, the components' `attachStrata` toggles a button jack's `aria-pressed` and tells the page; `class` and `style` reach the row;
 *   a disabled fieldset disables its jacks;
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
const examples = [...readFileSync(new URL("../../docs/ui-library/components/patch-point.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "patch-point:0": examples[0], "patch-point:1": examples[1], "patch-bay:0": examples[2] };
const centre = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };
const plug = (page, id) => page.locator(`#${id}`).evaluate(control => getComputedStyle(control.closest(".ug-patch-point").querySelector(".ug-patch-point__plug")).visibility);

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
  await page.goto(`${origin}/patch-point/`);
  return { context, page };
}

test("the Astro PatchPoint and PatchBay render their anatomy markup, and with JavaScript off they are native controls with the drawing as rendered", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  const link = page.getByRole("checkbox", { name: "Link" });
  await expect(link).toBeChecked();
  await expect(page.getByRole("button", { name: "Hold" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Sends" })).toBeVisible();
  // The drawing is what was rendered: the connected jack shows its plug, the other does not, by CSS alone.
  expect(await plug(page, "link")).toBe("visible");
  expect(await plug(page, "send")).toBe("hidden");
  expect(await plug(page, "hold")).toBe("visible");
  await page.locator("#send").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#send")).toBeChecked();
  expect(await plug(page, "send")).toBe("visible");
  expect(await page.evaluate(() => [...new FormData(document.getElementById("jacks")).keys()])).toEqual(["link", "send"]);
  await context.close();
});

test("with JavaScript a button jack toggles and tells the page, class and style reach the row, a disabled bay disables its jacks, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  const hold = page.locator("#hold");
  await page.evaluate(() => { window.pressed = []; document.addEventListener("strata-pressed-change", event => window.pressed.push(event.detail.pressed)); });
  // The behaviour script is a module: wait until a click takes effect.
  await expect(async () => {
    await page.mouse.click(...await centre(page, "hold"));
    await expect(hold).toHaveAttribute("aria-pressed", "false", { timeout: 500 });
  }).toPass({ timeout: 5000 });
  expect((await page.evaluate(() => window.pressed)).at(-1)).toBe(false);
  expect(await plug(page, "hold")).toBe("hidden");
  await page.mouse.click(...await centre(page, "hold"));
  await expect(hold).toHaveAttribute("aria-pressed", "true");
  expect(await plug(page, "hold")).toBe("visible");
  const row = page.locator(".ug-patch-point", { has: page.locator("#link") });
  expect(await row.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.querySelector("input").dataset.testid }))).toEqual({ className: "ug-patch-point extra", margin: "4px", testid: "link" });
  await expect(page.locator("#send2")).toBeDisabled();
  expect(await page.locator("#sends").evaluate(element => element.style.getPropertyValue("--strata-patch-columns"))).toBe("3");
  await page.locator("#sends").evaluate(element => { element.disabled = true; });
  await expect(page.locator("#send1")).toBeDisabled();
  await page.locator("#sends").evaluate(element => { element.disabled = false; });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
