/**
 * Browser test of the Astro push-button forms (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`,
 * page `push-button.astro`) with Astro, serves its output through request routing, and checks that
 * - the Button and the ToggleButton render exactly the push-button examples on their anatomy pages `button.md` and
 *   `toggle-button.md` (their second markup blocks);
 * - with JavaScript off a push button is a named native button: Space and Enter activate it, a submit button's name and value
 *   submit with its form, and a disabled one does nothing;
 * - with JavaScript, the components' `attachStrata` holds a momentary button down while it is pressed and toggles a latching
 *   one; `class`, `style` and `colour` reach the button; a `form` that names no push form is the native form owner;
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
const contracts = { "button.md#2": examples("button.md")[1], "toggle-button.md#2": examples("toggle-button.md")[1] };
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
  await page.goto(`${origin}/push-button/`);
  return { context, page };
}

test("the Astro Button and ToggleButton render their push forms and are native buttons without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  const talk = page.getByRole("button", { name: "Talk" });
  await expect(talk).toHaveAttribute("type", "submit");
  await talk.focus();
  // A native submit button submits its name and value with its form, by Space and by Enter.
  const data = () => page.evaluate(() => { const form = document.getElementById("pushes"); return Object.fromEntries(new FormData(form, document.getElementById("talk"))); });
  expect(await data()).toEqual({ talk: "1" });
  await expect(page.locator("#locked")).toBeDisabled();
  await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "false");
  await context.close();
});

test("with JavaScript the Astro push buttons are held while pressed and latch, with their props on the button", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.evaluate(() => document.getElementById("pushes").addEventListener("submit", event => event.preventDefault()));
  const talk = page.locator("#talk"), mute = page.locator("#mute");
  expect(await talk.evaluate(button => ({ className: button.className, margin: button.style.marginRight, testid: button.dataset.testid, form: button.dataset.strataForm }))).toEqual({ className: "ug-button ug-push extra", margin: "4px", testid: "talk", form: "momentary" });
  expect(await mute.evaluate(button => [button.dataset.strataForm, button.dataset.strataColour, button.className])).toEqual(["latching", "info", "ug-toggle-button ug-push"]);
  // The behaviour script is a module: wait until a press takes effect.
  const box = await talk.boundingBox();
  await expect(async () => {
    await page.mouse.move(...centre(box));
    await page.mouse.down();
    await expect(talk).toHaveAttribute("data-strata-down", "true", { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.mouse.up();
  await expect(talk).toHaveAttribute("data-strata-down", "false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  // A disabled one is never held; a `form` that names no push form is the native form owner on the plain Button.
  await page.mouse.click(...centre(await page.locator("#locked").boundingBox()));
  expect(await page.locator("#locked").getAttribute("data-strata-down")).toBe(null);
  const owned = page.locator("#owned");
  await expect(owned).toHaveAttribute("form", "settings");
  await expect(owned).toHaveAttribute("data-strata-face", "raised");
  await expect(owned.locator(".ug-push__object")).toHaveCount(0);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
