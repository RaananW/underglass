/**
 * Browser test of the Astro structural forms (`@underglass/ui/astro`): builds the static fixture site (`fixtures/astro-strata`, page
 * `structural-forms.astro`) with Astro, serves its output through request routing, and checks that
 * - `Slider`, `Card`, `Panel`, `Dialog` and `Drawer` render exactly the form examples on their anatomy pages (`slider.md` second and third, `card.md`
 *   and `panel.md` second and third, `dialog.md` and `drawer.md` third, which Astro renders closed, with `hidden`);
 * - with JavaScript off the native controls are what they were (a range with its value, an article named by its title), and the drawing is what was rendered
 *   (the knob's pointer and the fader's carriage placed by CSS from the value);
 * - with JavaScript, the components' `attachStrata` gives the knob its round behaviour and the fader its track's, and keeps their drawing in step with the value;
 *   `class`, `style`, `size` and other attributes reach their elements; a `form` that names no form is the native form owner; flush components render no form
 *   markup; a Dialog (a plate) and a Drawer (a tray) open from `data-strata-open`, move focus in, and close on Escape and on the scrim;
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
/** Plain HTML and Astro render a Dialog and a Drawer closed: the scrim and the panel carry `hidden`. */
const closed = html => html.replace('<div class="ug-scrim" aria-hidden="true">', '<div class="ug-scrim" aria-hidden="true" hidden>').replace(/tabindex="-1">/, 'tabindex="-1" hidden>');
const contracts = { "slider:knob": examples("slider.md")[1], "slider:fader": examples("slider.md")[2], "card:plate": examples("card.md")[1], "card:tray": examples("card.md")[2],
  "panel:plate": examples("panel.md")[1], "panel:tray": examples("panel.md")[2], "dialog:plate": closed(examples("dialog.md")[2]), "drawer:tray": closed(examples("drawer.md")[2]) };
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: "reduce", ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/structural-forms/`);
  return { context, page };
}

test("the Astro structural forms render their anatomy markup, and with JavaScript off they are the native controls with the drawing as rendered", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  // The native controls: ranges with their values, articles named by their titles, the buttons that would open the overlays.
  await expect(page.getByRole("slider", { name: "Drive" })).toHaveJSProperty("value", "40");
  await expect(page.getByRole("slider", { name: "Trim" })).toHaveJSProperty("value", "0");
  await expect(page.getByRole("article", { name: "Plate card" })).toHaveCount(1);
  await expect(page.getByRole("article", { name: "Tray card" })).toHaveCount(1);
  // The drawing is what was rendered: the knob's pointer turned by CSS from `--strata-knob-value`, the fader's carriage placed from `--strata-fader-value`.
  expect(await page.evaluate(() => {
    const root = document.getElementById("drive").closest(".ug-knob"), pointer = getComputedStyle(root.querySelector(".ug-knob__pointer")).rotate, fader = document.getElementById("trim").closest(".ug-fader");
    const carriage = fader.querySelector(".ug-fader__carriage").getBoundingClientRect(), track = fader.querySelector(".ug-fader__track").getBoundingClientRect();
    return { pointer, value: root.style.getPropertyValue("--strata-knob-value"), middle: Math.abs(carriage.left + carriage.width / 2 - (track.left + track.width / 2)) < 1 };
  })).toEqual({ pointer: "-27deg", value: "0.4", middle: true });
  await context.close();
});

test("with JavaScript the knob is round and the fader a track, class, style and size reach their elements, a form that names no form is the native owner, flush has no form markup, the overlays open and close, and axe passes", async ({ browser }) => {
  const { context, page } = await open(browser);
  // The behaviour script is a module: wait until it has taken over the knob (a vertical drag changes the value).
  const knob = await page.locator("#drive").boundingBox();
  await expect(async () => {
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
    await page.mouse.down();
    await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    expect(await value(page, "drive")).not.toBe(40);
  }).toPass({ timeout: 8000 });
  await page.locator("#drive").focus();
  await page.keyboard.press("End");
  expect(await value(page, "drive")).toBe(100);
  expect(await page.evaluate(() => [document.getElementById("drive").closest(".ug-knob").style.getPropertyValue("--strata-knob-value"), document.getElementById("drive").getAttribute("aria-valuetext")])).toEqual(["1", "100%"]);
  // The fader: a press on its slot sets the value there, the carriage follows.
  const slot = await page.locator("#trim").evaluate(input => { const box = input.closest(".ug-fader").querySelector(".ug-fader__slot").getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; });
  await page.mouse.click(slot.x + slot.width * 0.75, slot.y + slot.height / 2);
  expect(await value(page, "trim")).toBe(6);
  expect(await page.evaluate(() => [document.getElementById("trim").closest(".ug-fader").style.getPropertyValue("--strata-fader-value"), document.getElementById("trim").getAttribute("aria-valuetext")])).toEqual(["0.75", "6 dB"]);
  // The props reach their elements.
  expect(await page.evaluate(() => {
    const knobRoot = document.getElementById("drive").closest(".ug-knob"), card = document.getElementById("card-plate"), panel = document.getElementById("panel-plate"), fader = document.getElementById("trim").closest(".ug-fader");
    return { knob: { className: knobRoot.className, margin: knobRoot.style.marginRight, form: knobRoot.dataset.strataForm, testid: document.getElementById("drive").dataset.testid ?? null, rootTestid: knobRoot.dataset.testid ?? null, name: document.getElementById("drive").name },
      fader: { className: fader.className, size: fader.dataset.strataSize, form: fader.dataset.strataForm },
      card: { className: card.className, margin: card.style.marginRight, testid: card.dataset.testid, form: card.dataset.strataForm, tag: card.tagName },
      panel: { className: panel.className, margin: panel.style.marginRight, testid: panel.dataset.testid, form: panel.dataset.strataForm, tag: panel.tagName },
      tray: [document.getElementById("card-tray").dataset.strataForm, document.querySelector("#card-tray .ug-card__body").dataset.strataFace, document.querySelectorAll("#panel-tray > .ug-panel__tray").length] };
  })).toEqual({ knob: { className: "ug-knob extra", margin: "4px", form: "knob", testid: "drive", rootTestid: null, name: "drive" }, fader: { className: "ug-fader ug-fader--horizontal ug-fader--detented", size: "small", form: "fader" },
    card: { className: "ug-card extra", margin: "4px", testid: "card", form: "plate", tag: "ARTICLE" }, panel: { className: "ug-panel extra", margin: "4px", testid: "panel", form: "plate", tag: "SECTION" }, tray: ["tray", "well", 1] });
  // A `form` that names no form is the native form owner; flush and none are the groove slider and the cards of before.
  await expect(page.locator("#owned")).toHaveAttribute("form", "owner-form");
  expect(await page.evaluate(() => ["owned", "flat", "plain"].map(id => { const input = document.getElementById(id); return [input.className, input.getAttribute("data-strata-face"), input.closest("[data-strata-form]") === null]; }))).toEqual(Array(3).fill(["ug-slider", "groove", true]));
  expect(await page.evaluate(() => ["card-flush", "panel-flush"].map(id => { const element = document.getElementById(id); return [element.hasAttribute("data-strata-form"), element.querySelectorAll("[data-strata-face='well'], .ug-panel__tray").length]; }))).toEqual([[false, 0], [false, 0]]);
  // The overlays: the opener's `data-strata-open`, focus in, Escape closes (a dialog), the scrim closes (a drawer with `closeOnScrim`).
  await page.locator("#open-dialog").click();
  await expect(page.locator("#the-dialog")).toBeVisible();
  expect(await page.evaluate(() => ({ form: document.getElementById("the-dialog").dataset.strataForm, focus: document.getElementById("the-dialog").contains(document.activeElement), inert: document.querySelector("main > section").inert }))).toEqual({ form: "plate", focus: true, inert: true });
  await page.keyboard.press("Escape");
  await expect(page.locator("#the-dialog")).toBeHidden();
  await page.locator("#open-drawer").click();
  await expect(page.locator("#the-drawer")).toBeVisible();
  expect(await page.evaluate(() => document.getElementById("the-drawer").dataset.strataForm)).toBe("tray");
  await page.mouse.click(5, 5);
  await expect(page.locator("#the-drawer")).toBeHidden();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").exclude("[hidden]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
