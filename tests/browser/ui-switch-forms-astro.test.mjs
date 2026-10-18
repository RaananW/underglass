/**
 * Browser test of the Astro Switch's hardware forms (`@underglass/ui/astro`): builds the static fixture site
 * (`fixtures/astro-strata`, page `switch-forms.astro`) with Astro, serves its output through request routing, and
 * checks that
 * - the Switch with `form="rocker"` renders exactly the Forms markup example on the anatomy page `switch.md`;
 * - with JavaScript off every form is a named native switch: a click on its box or label and Space throw it, and its
 *   state submits with its form;
 * - with JavaScript, the components' `attachStrata` adds the drag: past centre it throws, short of centre it holds;
 *   `class` and `style` reach the row, a Field gives its description, a disabled one stays, and a `form` that names no
 *   hardware form is the native form owner on the Strata switch;
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
const example = [...readFileSync(new URL("../../docs/ui-library/components/switch.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][1][1];

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
  await page.goto(`${origin}/switch-forms/`);
  return { context, page };
}

test("the Astro Switch renders its Forms markup, and every form is a native switch without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="switch.md#2"]')), window.canonical(host)];
  }, example);
  expect(rendered, "switch.md#2 matches its markup contract").toEqual(expected);
  for (const [id, name, form] of [["bypass", "Bypass", "slide"], ["arm", "Arm", "bat"], ["hall", "Hall", "wall"], ["heater", "Heater", "rocker"]]) {
    await expect(page.getByRole("switch", { name })).toHaveAttribute("id", id);
    await expect(page.locator(".ug-switch", { has: page.locator(`#${id}`) })).toHaveAttribute("data-strata-form", form);
  }
  await expect(page.locator("#arm")).toBeChecked();
  const box = await page.locator("#bypass").boundingBox();
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([64, 28]);
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(page.locator("#bypass")).toBeChecked();
  await page.locator(".ug-switch", { has: page.locator("#hall") }).locator(".ug-switch__label").click();
  await expect(page.locator("#hall")).toBeChecked();
  await page.locator("#arm").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#arm")).not.toBeChecked();
  // The state submits with the form.
  const data = await page.locator("#switches").evaluate(form => [...new FormData(form).keys()]);
  expect(data).toEqual(["bypass", "hall"]);
  await context.close();
});

test("with JavaScript the Astro forms throw on a drag past centre and hold short of it, and pass axe", async ({ browser }) => {
  const { context, page } = await open(browser);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.waitForLoadState("networkidle");
  const drag = async (id, from, to) => {
    const box = await page.locator(`#${id}`).boundingBox();
    const at = fraction => id === "bypass" ? [box.x + fraction * box.width, box.y + box.height / 2] : [box.x + box.width / 2, box.y + (1 - fraction) * box.height];
    await page.mouse.move(...at(from)); await page.mouse.down(); await page.mouse.move(...at(to), { steps: 8 }); await page.mouse.up();
  };
  await drag("bypass", 0.15, 0.85);
  await expect(page.locator("#bypass")).toBeChecked();
  await drag("bypass", 0.85, 0.6);
  await expect(page.locator("#bypass")).toBeChecked();
  await drag("arm", 0.85, 0.15);
  await expect(page.locator("#arm")).not.toBeChecked();
  await drag("hall", 0.1, 0.9);
  await expect(page.locator("#hall")).toBeChecked();
  const row = page.locator(".ug-switch", { has: page.locator("#bypass") });
  await expect(row).toHaveClass(/extra/);
  await expect(row).toHaveCSS("margin-right", "4px");
  await expect(page.locator("#bypass")).toHaveAttribute("data-testid", "bypass");
  await expect(page.locator("#hall")).toHaveAccessibleDescription("Lights the hall.");
  await drag("heater", 0.1, 0.9);
  await expect(page.locator("#heater")).not.toBeChecked();
  const wifi = page.locator("#wifi");
  await expect(wifi).toHaveAttribute("form", "switches");
  await expect(wifi).toHaveAttribute("data-strata-face", "well");
  await expect(page.locator(".ug-switch", { has: wifi }).locator(".ug-switch__knob")).toHaveCount(1);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
