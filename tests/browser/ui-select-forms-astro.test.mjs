/**
 * Browser test of the Astro Select forms (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page `select-forms.astro`)
 * with Astro, serves its output through request routing, and checks that
 * - a `selector` and a `display` Select render exactly the markup examples on their anatomy page `select.md` (section 11);
 * - with JavaScript off the select is a named native select whose keys work and whose value submits with its form, and the drawing is what was
 *   rendered (the dial's pointer placed by CSS from `--strata-rotary-value`);
 * - the documented rule applies to `options` and to slot `<option>`s: eleven options and optgroups are drawn as a display, a `multiple` select is flush;
 * - with JavaScript, `attachStrata` gives the selector its round behaviour and the display's buttons step the select, firing native events; `class`, `style`,
 *   `size` and other attributes reach their elements; flush and none render the key with a chevron; a `form` that names no form is the native owner;
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
const examples = [...readFileSync(new URL("../../docs/ui-library/components/select.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "select.md#selector": examples[1], "select.md#display": examples[2] };
const value = (page, id) => page.locator(`#${id}`).evaluate(select => select.value);
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/select-forms/`);
  return { context, page };
}

test("the Astro Select forms render their anatomy markup and are native selects without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  const wave = page.getByRole("combobox", { name: "Wave" });
  await expect(wave).toHaveValue("saw");
  await wave.focus();
  await page.keyboard.press("ArrowDown");
  await expect(wave).toHaveValue("square");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("selects"))))).toMatchObject({ wave: "square", preset: "glass-bell", slot: "b", many: "ch3", plain: "square" });
  // The drawing is what was rendered: the dial's pointer turned by CSS from `--strata-rotary-value`.
  expect(await page.evaluate(() => { const root = document.getElementById("wave").closest(".ug-rotary"); return [getComputedStyle(root.querySelector(".ug-rotary__pointer")).rotate, root.style.getPropertyValue("--strata-rotary-value")]; })).toEqual(["0deg", "0.5"]);
  await context.close();
});

test("with JavaScript the selector is round and the display's buttons step it, the rule holds for options and slots, props pass through, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  // The behaviour script is a module: wait until it has taken over the dial (a click on a printed label selects it).
  const label = async text => centre(await page.locator(".ug-rotary", { has: page.locator("#wave") }).locator(".ug-rotary__text").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  await expect(async () => {
    await page.mouse.click(...await label("Sine"));
    expect(await value(page, "wave")).toBe("sine");
  }).toPass({ timeout: 8000 });
  expect(await page.locator("#wave").evaluate(select => select.closest(".ug-rotary").style.getPropertyValue("--strata-rotary-value"))).toBe("0");
  // The display: its buttons step the select and fire native events; the end of the list does nothing.
  const events = await page.evaluate(() => { window.log = []; for (const type of ["input", "change"]) document.getElementById("preset").addEventListener(type, event => window.log.push(event.type)); });
  void events;
  const step = n => page.locator(`.ug-field:has(#preset) .ug-select-display__step[data-strata-step="${n}"]`).click();
  await step(1);
  expect(await value(page, "preset")).toBe("sub-bass");
  await step(1);
  expect(await page.evaluate(() => window.log)).toEqual(["input", "change"]);
  await step(-1); await step(-1); await step(-1); await step(-1);
  expect(await value(page, "preset")).toBe("init");
  // The rule, for options and for the slot.
  expect(await page.evaluate(() => ["wave", "preset", "slot", "many", "grouped", "locked", "list", "flat", "plain", "owned"].map(id => document.getElementById(id).closest("[data-strata-form]")?.dataset.strataForm ?? null)))
    .toEqual(["selector", "display", "selector", "display", "display", "selector", "null", "null", "null", "null"].map(form => (form === "null" ? null : form)));
  expect(await value(page, "slot")).toBe("b");
  // Props: class, style, size and attributes reach their elements; flush and none are the key with a chevron; a name that is no form is the native owner.
  expect(await page.evaluate(() => { const root = document.getElementById("wave").closest(".ug-rotary"); return [root.className, root.style.marginRight, document.getElementById("wave").dataset.testid ?? root.dataset.testid, document.getElementById("preset").closest(".ug-select-display").dataset.strataSize]; }))
    .toEqual(["ug-rotary extra", "4px", "wave", "small"]);
  for (const id of ["flat", "plain", "owned", "list"]) expect(await page.locator(`#${id}`).evaluate(select => [select.className, select.getAttribute("data-strata-face")]), id).toEqual(["ug-select", "raised"]);
  await expect(page.locator("#owned")).toHaveAttribute("form", "owner-form");
  await expect(page.locator("#locked")).toBeDisabled();
  await expect(page.getByRole("combobox", { name: "Slot" })).toHaveAccessibleDescription("From the slot.");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
