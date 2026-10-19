/**
 * Browser test of the Select forms' React and Vue bindings (`ui-select-forms-react.html`, `ui-select-forms-vue.html`, `window.strataSelectBinding`),
 * with no Underglass:
 * - each renders exactly the markup examples of the anatomy page `select.md` section 11 (a selector, a display), compared as canonical DOM;
 * - a controlled selector follows real label clicks and keys through its state, and its state from outside; an uncontrolled display keeps its own value
 *   and steps with its buttons; the ref is the select, and `className`/`class`, `style` and other attributes reach the drawn root;
 * - the documented rule: eleven options, optgroups and options a component renders are drawn as a display, a `multiple` select stays the flush control;
 * - a Field gives its description; `size` sizes the dial; a disabled selector does not move; a `form` that names a form owner is the native attribute on
 *   the flush select; flush and none are the markup of before;
 * - `?mode=plain|flush|legacy`: a Select with no form, with `form="flush"` and as the contract markup of before render the same pixels;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";
import { PNG } from "pngjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = [...readFileSync(new URL("../../docs/ui-library/components/select.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "select.md#selector": examples[1], "select.md#display": examples[2] };
const value = (page, id) => page.locator(`#${id}`).evaluate(select => select.value);
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

for (const binding of ["react", "vue"]) test(`the ${binding} Select forms render their anatomy markup, apply the documented rule, work controlled and uncontrolled, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-select-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataSelectBinding);
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
  // The rule: what each select is drawn as.
  expect(await page.evaluate(() => ["wave", "preset", "many", "grouped", "custom", "locked", "small", "list", "owned", "flat", "plain"].map(id => { const root = document.getElementById(id).closest("[data-strata-form]"); return [id, root?.dataset.strataForm ?? null]; })))
    .toEqual([["wave", "selector"], ["preset", "display"], ["many", "display"], ["grouped", "display"], ["custom", "display"], ["locked", "selector"], ["small", "selector"], ["list", null], ["owned", null], ["flat", null], ["plain", null]]);
  // Controlled selector: a real label click and a key go through the state; the state from outside moves the dial.
  const wave = page.locator("#wave");
  await expect(wave).toHaveRole("combobox");
  await expect(wave).toHaveAccessibleName("Wave");
  expect(await value(page, "wave")).toBe("saw");
  const label = async text => centre(await page.locator(".ug-rotary", { has: page.locator("#wave") }).locator(".ug-rotary__text").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  await page.mouse.click(...await label("Square"));
  expect(await page.evaluate(() => window.strataSelectBinding.wave())).toBe("square");
  await expect(page.locator("#wave-read")).toHaveText("Wave square");
  await wave.focus();
  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() => window.strataSelectBinding.wave())).toBe("saw");
  expect(await page.evaluate(() => window.strataSelectBinding.changes())).toEqual(["square", "saw"]);
  await page.evaluate(() => window.strataSelectBinding.setWave("sine"));
  await expect.poll(() => value(page, "wave")).toBe("sine");
  await expect.poll(() => wave.evaluate(select => select.closest(".ug-rotary").style.getPropertyValue("--strata-rotary-value"))).toBe("0");
  // Uncontrolled display: the ref, class, style and attribute reach the root and the select; the buttons step it, firing native events.
  expect(await page.evaluate(() => {
    const select = window.strataSelectBinding.refs.preset, root = select.closest(".ug-select-display");
    return { select: select === document.getElementById("preset"), className: root.className, margin: root.style.marginRight, testid: select.dataset.testid ?? root.dataset.testid, name: select.name, value: select.value };
  })).toEqual({ select: true, className: "ug-select-display extra", margin: "4px", testid: "preset", name: "preset", value: "glass-bell" });
  const step = n => page.locator(`#preset-field .ug-select-display__step[data-strata-step="${n}"], .ug-field:has(#preset) .ug-select-display__step[data-strata-step="${n}"]`).first().click();
  await step(1);
  expect(await value(page, "preset")).toBe("sub-bass");
  await step(1);
  expect(await value(page, "preset"), "no wrap at the end").toBe("sub-bass");
  await step(-1); await step(-1);
  expect(await value(page, "preset")).toBe("warm-pad");
  // The Field: description, and a small selector's dial is 48 px.
  await expect(page.getByRole("combobox", { name: "Sound" })).toHaveAccessibleDescription("Pick a sound.");
  expect(await page.locator("#small").evaluate(select => select.closest(".ug-rotary").querySelector(".ug-rotary__skirt").getBoundingClientRect().width)).toBe(48);
  await expect(page.locator("#locked")).toBeDisabled();
  // A form that names an owner is the native attribute on the flush select; flush and none are the key with a chevron.
  await expect(page.locator("#owned")).toHaveAttribute("form", "owner-form");
  for (const id of ["owned", "flat", "plain", "list"]) expect(await page.locator(`#${id}`).evaluate(select => [select.className, select.getAttribute("data-strata-face")]), id).toEqual(["ug-select", "raised"]);
  // The step buttons are not in the tab order and are hidden from assistive technology.
  expect(await page.evaluate(() => [...document.querySelectorAll(".ug-select-display__step")].every(button => button.tabIndex === -1 && button.getAttribute("aria-hidden") === "true"))).toBe(true);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").exclude("[hidden]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const binding of ["react", "vue"]) test(`the ${binding} flush Select is the markup and the pixels of before: no form, form="flush" and the legacy markup agree`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const shots = {};
  for (const mode of ["plain", "flush", "legacy"]) {
    await page.goto(`/ui-select-forms-${binding}.html?mode=${mode}`);
    await page.waitForFunction(() => document.getElementById("legacy"));
    await page.waitForTimeout(200);
    shots[mode] = PNG.sync.read(await page.locator("#probe").screenshot());
  }
  for (const mode of ["flush", "legacy"]) {
    expect(shots[mode].width).toBe(shots.plain.width);
    expect(Buffer.compare(shots[mode].data, shots.plain.data), `${mode} is pixel-identical to the unformed Select`).toBe(0);
  }
  await context.close();
});
