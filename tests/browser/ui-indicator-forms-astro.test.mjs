/**
 * Browser test of the Astro indicator forms (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `indicator-forms.astro`) with Astro, serves its output through request routing, and checks that
 * - `Rating`, `Badge`, `ProgressBar` and `Spinner` render exactly the indicator examples on their anatomy pages `rating.md`, `badge.md`,
 *   `progress-bar.md` and `spinner.md` (their second markup blocks);
 * - with JavaScript off the native controls are what they were (radios in a named group, a progress bar with its value, a status named by its
 *   label), and the drawing is what was rendered (the lamps lit by CSS from the checked radio, the segments from `--strata-progress-value`);
 * - with JavaScript, the components' `attachStrata` keeps a bar's drawing in step with a written `value`; `class`, `style`, `colour`, `size` and other
 *   attributes reach their elements; a `form` that names no form is the native form owner; flush components render no indicator markup;
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
const contracts = { "rating:lamps": examples("rating.md")[1], "badge:led": examples("badge.md")[1], "progress:meter": examples("progress-bar.md")[1], "spinner:ring": examples("spinner.md")[1] };
const lits = (page, selector) => page.locator(selector).evaluateAll(lenses => lenses.map(lens => Number(getComputedStyle(lens).getPropertyValue("--strata-lit"))));

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/indicator-forms/`);
  return { context, page };
}

test("the Astro indicator forms render their anatomy markup, and with JavaScript off they are the native controls with the drawing as rendered", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  await expect(page.getByRole("group", { name: "Quality" })).toHaveCount(1);
  await expect(page.locator("#rate input[value='3']")).toBeChecked();
  await expect(page.getByRole("progressbar", { name: "Upload" })).toHaveAttribute("id", "p-live");
  await expect(page.locator("#s-ring")).toHaveRole("status");
  await expect(page.locator("#s-ring")).toHaveText("Loading results");
  // The drawing is what was rendered: 3 of 5 lit by CSS alone, 40% of 10 segments is 4.
  expect(await lits(page, "#rate .ug-rating__lens")).toEqual([1, 1, 1, 0, 0]);
  expect((await lits(page, "#p-live ~ .ug-progress__object .ug-progress__segment")).filter(lit => lit === 1).length).toBe(4);
  expect(await lits(page, "#b-ok .ug-badge__lens")).toEqual([1]);
  expect(await lits(page, "#b-count .ug-badge__lens")).toEqual([0]);
  await context.close();
});

test("with JavaScript a bar follows a written value, class, style, colour and size reach their elements, a form that names no form is the native owner, flush has no indicator markup, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  // The behaviour script is a module: wait until a written value takes effect.
  await expect(async () => {
    await page.locator("#p-live").evaluate(progress => { progress.value = progress.value === 80 ? 81 : 80; });
    await expect(page.locator("#p-live").locator("xpath=..")).toHaveCSS("--strata-progress-value", /0\.8/, { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.locator("#p-live").evaluate(progress => { progress.value = 80; });
  expect((await lits(page, "#p-live ~ .ug-progress__object .ug-progress__segment")).filter(lit => lit === 1).length, "80% of 10").toBe(8);
  await page.locator("#p-live").evaluate(progress => { progress.removeAttribute("value"); });
  await expect.poll(() => page.locator("#p-live").locator("xpath=..").evaluate(wrapper => wrapper.style.getPropertyValue("--strata-progress-value"))).toBe("");
  // The props reach their elements.
  expect(await page.evaluate(() => {
    const wrapper = document.getElementById("p-live").parentElement, rate = document.getElementById("rate"), badge = document.getElementById("b-ok"), ring = document.getElementById("s-ring");
    return { bar: { className: wrapper.className, margin: wrapper.style.marginRight, form: wrapper.dataset.strataForm, colour: wrapper.dataset.strataColour, testid: document.getElementById("p-live").dataset.testid, segments: wrapper.querySelectorAll(".ug-progress__segment").length },
      rate: { className: rate.className, margin: rate.style.marginRight, testid: rate.dataset.testid, size: rate.dataset.strataSize, form: rate.dataset.strataForm, tag: rate.tagName },
      free: document.getElementById("rate-free").dataset.strataColour, badge: { className: badge.className, margin: badge.style.marginRight, testid: badge.dataset.testid, form: badge.dataset.strataForm },
      ring: { className: ring.className, margin: ring.style.marginRight, testid: ring.dataset.testid, colour: ring.dataset.strataColour, form: ring.dataset.strataForm, lenses: ring.querySelectorAll(".ug-spinner__lens").length } };
  })).toEqual({
    bar: { className: "ug-progress-bar extra", margin: "4px", form: "meter", colour: "info", testid: "bar", segments: 10 },
    rate: { className: "ug-rating extra", margin: "4px", testid: "rate", size: "small", form: "lamps", tag: "FIELDSET" }, free: "success",
    badge: { className: "ug-badge ug-badge--success extra", margin: "4px", testid: "badge", form: "led" },
    ring: { className: "ug-spinner ug-spinner--md ug-spinner--labelled extra", margin: "4px", testid: "ring", colour: "warning", form: "ring", lenses: 8 },
  });
  // A small Rating's lens is 12 px, its item 28 px.
  expect(await page.evaluate(() => [document.querySelector("#rate .ug-rating__lens").getBoundingClientRect().width, document.querySelector("#rate .ug-rating__item").getBoundingClientRect().width])).toEqual([12, 28]);
  // A `form` that names no form is the native form owner; flush and none have no indicator markup.
  await expect(page.locator("#rate-owned")).toHaveAttribute("form", "owner-form");
  expect(await page.evaluate(() => ["rate-owned", "rate-plain", "b-flush", "s-flush", "p-plain"].map(id => { const element = document.getElementById(id); const host = element.closest(".ug-rating, .ug-badge, .ug-spinner, .ug-progress-bar") ?? element; return [host.hasAttribute("data-strata-form"), host.querySelectorAll(".ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress__segment").length]; }))).toEqual(Array(5).fill([false, 0]));
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
