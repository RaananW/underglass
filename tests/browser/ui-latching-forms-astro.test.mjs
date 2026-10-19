/**
 * Browser test of the Astro latching forms (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `latching-forms.astro`) with Astro, serves its output through request routing, and checks that
 * - the Checkbox, the RadioGroup and the SegmentedControl render exactly the latching examples on their anatomy pages `checkbox.md`,
 *   `radio.md` and `segmented-control.md` (their second markup blocks);
 * - with JavaScript off the controls are native: a latching checkbox toggles, the radios of a bank and of a segmented control keep
 *   their group, their form data and their arrow keys, a disabled one does nothing;
 * - with JavaScript, the components' `attachStrata` holds a key down while it is pressed and the numbers (ring, LED, travel) follow the
 *   state; `class`, `style`, `colour` and other attributes reach the row and the input; `indeterminate` applies; a `form` that names no
 *   form is the native form owner;
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
const contracts = { "checkbox.md#2": examples("checkbox.md")[1], "radio.md#2": examples("radio.md")[1], "segmented-control.md#2": examples("segmented-control.md")[1] };
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const live = value => `input[name=live][value=${value}]`;
const numbers = (page, id) => page.locator(id.startsWith("input") ? id : `#${id}`).evaluate(input => { const style = getComputedStyle(input.parentElement); return { lit: Number(style.getPropertyValue("--strata-lit")), led: Number(style.getPropertyValue("--strata-led")), t: Number(style.getPropertyValue("--strata-push-t")) }; });

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/latching-forms/`);
  return { context, page };
}

test("the Astro Checkbox, RadioGroup and SegmentedControl render their latching forms and are native controls without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  const data = () => page.evaluate(() => Object.fromEntries([...new Set(new FormData(document.getElementById("latches")).keys())].map(key => [key, new FormData(document.getElementById("latches")).getAll(key)])));
  expect(await data()).toEqual({ phantom: ["1"], live: ["organ"], range: ["week"] });
  // A native checkbox toggles; the radios keep their group and their keys, the disabled one is skipped.
  await page.locator("#monitor").click();
  await expect(page.locator("#monitor")).toBeChecked();
  await page.locator(live("strings")).focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.value), "the disabled key is skipped, and it wraps").toBe("piano");
  expect(await data()).toEqual({ monitor: ["1"], phantom: ["1"], live: ["piano"], range: ["week"] });
  await page.getByRole("radio", { name: "Day" }).last().click({ force: true });
  expect((await data()).range).toEqual(["day"]);
  await expect(page.locator("#locked")).toBeDisabled();
  await context.close();
});

test("with JavaScript the Astro latching forms are held while pressed and follow their state, with their props on the row and the input", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.evaluate(() => document.getElementById("latches").addEventListener("submit", event => event.preventDefault()));
  const monitor = page.locator("#monitor");
  expect(await monitor.evaluate(input => { const row = input.closest("label"); return { row: row.className, margin: row.style.marginRight, testid: input.dataset.testid, form: row.dataset.strataForm, host: input.parentElement.className, colour: input.parentElement.dataset.strataColour }; }))
    .toEqual({ row: "ug-checkbox extra", margin: "4px", testid: "monitor", form: "latching", host: "ug-push ug-latch ug-latch--key", colour: undefined });
  await expect(page.locator("#phantom").locator("xpath=..")).toHaveAttribute("data-strata-colour", "info");
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await numbers(page, "monitor")).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await numbers(page, "phantom")).toEqual({ lit: 1, led: 1, t: 0.45 });
  // `indeterminate` applies in the browser (the behaviour script is a module: wait for it).
  await expect(page.locator("#mixed")).toHaveJSProperty("indeterminate", true);
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await numbers(page, "mixed")).toEqual({ lit: 0.5, led: 0.5, t: 0.2 });
  // The behaviour script is a module: wait until a press takes effect.
  const box = await monitor.boundingBox();
  await expect(async () => {
    await page.mouse.move(...centre(box));
    await page.mouse.down();
    await expect(monitor.locator("xpath=..")).toHaveAttribute("data-strata-down", "true", { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.mouse.up();
  await expect(monitor.locator("xpath=..")).toHaveAttribute("data-strata-down", "false");
  await expect(monitor).toBeChecked();
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await numbers(page, "monitor")).toEqual({ lit: 1, led: 1, t: 0.45 });
  // The bank and the segmented control: one key down, its LED lit, the colour on every key.
  expect(await page.evaluate(() => [...document.querySelectorAll("main fieldset[data-strata-form=bank] .ug-latch")].map(host => host.dataset.strataColour))).toEqual(["success", "success", "success", "success"]);
  await page.locator(live("strings")).click();
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await numbers(page, live("strings"))).toEqual({ lit: 1, led: 1, t: 0.45 });
  expect(await numbers(page, live("organ"))).toEqual({ lit: 0, led: 0, t: 0 });
  expect(await numbers(page, live("pad"))).toEqual({ lit: 0, led: 0, t: 0 });
  // A disabled key is never held; a `form` that names no form is the native form owner, with the plain markup.
  await page.mouse.click(...centre(await page.locator("#locked").boundingBox()));
  expect(await page.locator("#locked").locator("xpath=..").getAttribute("data-strata-down")).toBe(null);
  const owned = page.locator("#owned");
  await expect(owned).toHaveAttribute("form", "settings");
  await expect(owned).toHaveAttribute("data-strata-face", "well");
  expect(await owned.evaluate(input => input.closest("label").querySelector(".ug-latch"))).toBe(null);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
