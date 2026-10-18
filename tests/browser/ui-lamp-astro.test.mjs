/**
 * Browser test of the Astro Lamp and StatusLight (`@underglass/ui/astro`): builds the static fixture site
 * (`fixtures/astro-strata`, page `lamp.astro`) with Astro, serves its output through request routing, and checks that
 * - the components render exactly the markup examples on their anatomy pages `lamp.md` and `status-light.md`;
 * - with JavaScript off a toggle lamp is a named native switch: a click on its box or label and Space toggle it, its
 *   state submits with its form, a disabled one does not, and a momentary lamp is a named button; a StatusLight is an
 *   image named by its label or a status `<output>` with its text, and a blinking one still renders;
 * - with JavaScript, the components' `attachStrata` lights a momentary lamp while it is held and the blink is CSS;
 *   `class` and `style` reach the row, a Field gives its description, a `form` is the native form owner;
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
const lamp = examples("lamp.md"), status = examples("status-light.md");
const contracts = { "lamp:0": lamp[0], "lamp:1": lamp[1], "status-light:0": status[0], "status-light:1": status[1], "status-light:2": status[2] };
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
  await page.goto(`${origin}/lamp/`);
  return { context, page };
}

test("the Astro Lamp and StatusLight render their anatomy markup, and with JavaScript off the lamps are native and the lights named", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  // A toggle lamp is a named switch: its box, its label and Space toggle it, and it submits (a disabled one is not in the form data).
  const mains = page.getByRole("switch", { name: "Mains" });
  await expect(mains).toHaveAttribute("id", "mains");
  await page.mouse.click(...centre(await mains.boundingBox()));
  await expect(mains).toBeChecked();
  await page.locator(".ug-lamp", { has: page.locator("#arm") }).locator(".ug-lamp__label").click();
  await expect(page.locator("#arm")).not.toBeChecked();
  await page.locator("#hall").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#hall")).toBeChecked();
  await expect(page.locator("#hall")).toHaveAccessibleDescription("Lights the hall.");
  await page.locator("#locked").click({ force: true });
  await expect(page.locator("#locked")).toBeChecked();
  await page.locator(".ug-lamp", { has: page.locator("#owned") }).locator(".ug-lamp__label").click();
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("lamps"))))).toEqual({ mains: "on", hall: "on", owned: "on" });
  // A momentary lamp is a named button, a disabled one disabled; the lights are named.
  await expect(page.getByRole("button", { name: "Talk" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Muted" })).toBeDisabled();
  await expect(page.locator("#link")).toHaveRole("img");
  await expect(page.locator("#link")).toHaveAccessibleName("Link up");
  await expect(page.locator("#sync")).toHaveRole("status");
  await expect(page.locator("#sync")).toHaveText("Synced");
  await expect(page.locator("#alert")).toHaveAttribute("aria-live", "assertive");
  await context.close();
});

test("with JavaScript a momentary Astro Lamp lights while it is held, the blink is CSS, class and style reach the row, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  const talk = page.locator("#talk");
  await expect(talk).toHaveClass(/ug-lamp--momentary/);
  await expect(talk).toHaveAttribute("data-testid", "talk");
  const box = await talk.boundingBox();
  // The behaviour script is a module: wait until a press takes effect.
  await expect(async () => {
    await page.mouse.move(box.x + 28, box.y + box.height / 2);
    await page.mouse.down();
    try { await expect(talk).toHaveAttribute("aria-pressed", "true", { timeout: 500 }); }
    finally { await page.mouse.up(); }
  }).toPass({ timeout: 5000 });
  await expect(talk).toHaveAttribute("aria-pressed", "false");
  await page.mouse.down();
  expect(await talk.evaluate(button => Number(getComputedStyle(button).getPropertyValue("--strata-lit")))).toBe(1);
  await page.mouse.up();
  const row = page.locator(".ug-lamp", { has: page.locator("#mains") });
  // class and style on the row; every other attribute on the native control.
  expect(await row.evaluate(element => ({ className: element.className, margin: element.style.marginRight, testid: element.dataset.testid }))).toEqual({ className: "ug-lamp extra", margin: "4px", testid: undefined });
  await expect(page.locator("#mains")).toHaveAttribute("data-testid", "mains");
  // The blink is a CSS animation of --strata-lit; the fast light has one, the steady one has none.
  expect(await page.locator("#rec").evaluate(light => light.getAnimations().length)).toBe(1);
  expect(await page.locator("#link").evaluate(light => light.getAnimations().length)).toBe(0);
  expect(await page.locator("#rec").evaluate(light => ({ className: light.className, margin: light.style.marginRight, testid: light.dataset.testid }))).toEqual({ className: "ug-status-light extra", margin: "4px", testid: "rec" });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
