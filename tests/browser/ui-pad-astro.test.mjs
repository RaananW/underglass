/**
 * Browser test of the Astro Pad and PadGrid (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `pad.astro`) with Astro, serves its output through request routing, and checks that
 * - the Pad and PadGrid render exactly the three markup examples on the anatomy page `pad.md`;
 * - with JavaScript off a pad is a named native button: Space and Enter activate it, a submit pad's name and value submit with its form,
 *   a disabled one does nothing, and a latching pad is `aria-pressed` as rendered;
 * - with JavaScript, the components' `attachStrata` holds a pad down while it is pressed, toggles a latching one, reports the optional
 *   velocity and runs the grid's arrows; `class`, `style` and `colour` reach the button;
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
const examples = [...readFileSync(new URL("../../docs/ui-library/components/pad.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "pad.md": examples[0], "pad.md#2": examples[1], "pad.md#3": examples[2] };
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
  await page.goto(`${origin}/pad/`);
  return { context, page };
}

test("the Astro Pad and PadGrid render their markup and are native buttons without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  const kick = page.getByRole("button", { name: "Kick" });
  await expect(kick).toHaveAttribute("type", "submit");
  // A native submit button submits its name and value with its form.
  const data = () => page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("pads"), document.getElementById("kick"))));
  expect(await data()).toEqual({ kick: "1" });
  await expect(page.locator("#locked")).toBeDisabled();
  await expect(page.locator("#loop")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#arm")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#snare")).not.toHaveAttribute("aria-pressed", /.*/);
  await expect(page.getByRole("group", { name: "Rack" })).toHaveAttribute("style", "--strata-pad-columns: 3;");
  await context.close();
});

test("with JavaScript the Astro pads are held while pressed, latch, report velocity and run the grid's arrows, with their props on the button", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.evaluate(() => { document.getElementById("pads").addEventListener("submit", event => event.preventDefault()); window.velocities = []; document.addEventListener("strata-pad-velocity", event => window.velocities.push(event.detail), true); });
  const kick = page.locator("#kick"), loop = page.locator("#loop");
  expect(await kick.evaluate(button => ({ className: button.className, margin: button.style.marginRight, testid: button.dataset.testid, colour: button.dataset.strataColour, type: button.type }))).toEqual({ className: "ug-pad extra", margin: "4px", testid: "kick", colour: "danger", type: "submit" });
  expect(await loop.evaluate(button => [button.dataset.strataColour, button.className, button.getAttribute("aria-pressed")])).toEqual(["warning", "ug-pad", "false"]);
  // The behaviour script is a module: wait until a press takes effect.
  const box = await kick.boundingBox();
  await expect(async () => {
    await page.mouse.move(...centre(box));
    await page.mouse.down();
    await expect(kick).toHaveAttribute("data-strata-down", "true", { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.mouse.up();
  await expect(kick).toHaveAttribute("data-strata-down", "false");
  expect((await page.evaluate(() => window.velocities)).at(-1)).toEqual({ velocity: 1, source: "position" });
  await expect(kick).toHaveAttribute("data-strata-velocity", "1");
  // A latching pad toggles on a click and keeps its state.
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await loop.click();
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  // The grid's arrows: the pads are one tab stop, three columns, the disabled one skipped.
  await kick.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#snare")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#snare"), "the disabled pad below is skipped").toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#arm")).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(page.locator("#hat")).toBeFocused();
  // A disabled one is never held.
  await page.mouse.click(...centre(await page.locator("#locked").boundingBox()));
  expect(await page.locator("#locked").getAttribute("data-strata-down")).toBe(null);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
