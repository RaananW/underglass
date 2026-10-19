/**
 * Browser test of the Astro deferred forms (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page `deferred-forms.astro`) with Astro,
 * serves its output through request routing, and checks that
 * - a wheel Slider, a selector RadioGroup and a segments Display render exactly the markup examples on their anatomy pages (`slider.md`, `radio.md`, `display.md`, section 11);
 * - with JavaScript off the controls are native: the wheel's range input takes its keys, the group's radios their arrows and submit with their form, and the dial's cap is
 *   turned by CSS from `--strata-rotary-value`;
 * - the documented rule applies to `options` (nine radios are drawn as a bank); with JavaScript the dial steps on a tap and a label click checks its radio; `class`, `style`
 *   and other attributes reach their elements; flush and none render the controls of before; a `form` that names no form is the native owner;
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
const page_ = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "slider.md#wheel": page_("slider.md")[3], "radio.md#selector": page_("radio.md")[2], "display.md#segments": page_("display.md")[3] };
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const checked = (page, id) => page.locator(`#${id} .ug-rotary__radio`).evaluateAll(radios => radios.find(radio => radio.checked)?.value ?? null);
const label = async (page, id, text) => centre(await page.locator(`#${id} .ug-rotary__text`).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
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
  await page.goto(`${origin}/deferred-forms/`);
  return { context, page };
}

const markup = async page => { for (const [name, html] of Object.entries(contracts)) {
  const [rendered, expected] = await page.evaluate(([name, html]) => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
  }, [name, html]);
  expect(rendered, `${name} matches its markup contract`).toEqual(expected);
} };

test("the Astro deferred forms render their anatomy markup and are native controls without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  await markup(page);
  const gain = page.locator("#gain");
  await gain.focus();
  await page.keyboard.press("ArrowRight");
  expect(await value(page, "gain")).toBe(41);
  const mode = page.getByRole("group", { name: "Mode", exact: true });
  await mode.getByRole("radio", { name: "Solo" }).focus();
  await page.keyboard.press("ArrowRight");
  expect(await checked(page, "mode")).toBe("mute");
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("deferred"))))).toMatchObject({ gain: "41", pan: "75", mode: "mute", route: "r3", "flat-group": "mix" });
  // The drawing is what was rendered: the cap's pointer turned by CSS from `--strata-rotary-value`.
  await expect.poll(() => page.evaluate(() => Number.parseFloat(getComputedStyle(document.querySelector("#mode .ug-rotary__pointer")).rotate)), { message: "the pointer is turned by CSS from the rendered value (0.3333 of 270 degrees)" }).toBeCloseTo(-45, 0);
  expect(await page.evaluate(() => document.querySelector("#mode .ug-rotary").style.getPropertyValue("--strata-rotary-value"))).toBe("0.3333");
  await expect(page.locator("#clock")).toHaveText("12:34");
  await context.close();
});

test("with JavaScript the selector's dial steps and its labels check their radios, the rule holds, props pass through, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  // The behaviour script is a module: wait until it has taken over the dial (a tap on the cap steps).
  const cap = await page.locator("#mode .ug-rotary__cap").boundingBox();
  await expect(async () => {
    await page.mouse.click(cap.x + cap.width / 2, cap.y + cap.height * 0.8);
    expect(await checked(page, "mode")).toBe("mix");
  }).toPass({ timeout: 8000 });
  expect(await page.locator("#mode .ug-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("0");
  await page.mouse.click(...await label(page, "mode", "Bypass"));
  expect(await checked(page, "mode")).toBe("bypass");
  await expect.poll(() => page.locator("#mode .ug-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("1");
  // The wheel's slot takes a click.
  const slot = await page.locator(".ug-fader:has(#gain) .ug-fader__slot").boundingBox();
  await page.mouse.click(slot.x + slot.width * 0.9, slot.y + slot.height / 2);
  expect(await value(page, "gain")).toBeGreaterThan(80);
  expect(await page.evaluate(() => ["mode", "route", "locked-group", "flat-group", "owned"].map(id => document.getElementById(id).dataset.strataForm ?? null))).toEqual(["selector", "bank", "selector", null, null]);
  // Props: class, style and attributes reach their elements; flush and none render the controls of before; a name that is no form is the native owner.
  expect(await page.evaluate(() => { const group = document.getElementById("mode"), root = document.getElementById("gain").closest(".ug-fader"); return [group.className, group.style.marginRight, group.dataset.testid, root.className, root.style.marginRight, root.dataset.testid ?? document.getElementById("gain").dataset.testid]; }))
    .toEqual(["ug-radio-group extra", "4px", "mode", "ug-fader ug-fader--horizontal ug-fader--wheel extra", "4px", "gain"]);
  expect(await page.locator("#flat").evaluate(input => [input.className, input.getAttribute("data-strata-face")])).toEqual(["ug-slider", "groove"]);
  expect(await page.locator("#flat-group input").first().evaluate(input => input.className)).toBe("ug-radio__input");
  await expect(page.locator("#owned")).toHaveAttribute("form", "owner-form");
  await expect(page.locator("#locked")).toBeDisabled();
  expect(await page.locator("#locked-group .ug-rotary__radio").evaluateAll(radios => radios.every(radio => radio.matches(":disabled")))).toBe(true);
  expect(await page.evaluate(() => ["clock", "readout", "freq", "plainout"].map(id => document.getElementById(id).closest(".ug-display").dataset.strataSegments ?? null))).toEqual(["seven", "seven", "seven", null]);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
