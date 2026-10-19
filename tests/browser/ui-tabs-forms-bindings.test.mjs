/**
 * Browser test of the Tabs rail form's React and Vue bindings (`ui-tabs-forms-react.html`, `ui-tabs-forms-vue.html`, `window.strataTabsBinding`),
 * with no Underglass:
 * - each renders exactly the markup example of the anatomy page `tabs.md` section 11, compared as canonical DOM;
 * - a controlled rail follows real clicks and arrow keys through its state, and its state from outside; an uncontrolled one keeps its own; manual
 *   activation moves focus only until Enter; the ref is the root, and `className`/`class`, `style` and other attributes reach it;
 * - the selected key's LED is lit and its cap is down, and only that one; a disabled tab is skipped; a vertical rail uses Up and Down;
 * - flush, none and a `form` that names nothing render the flat tabs (a groove and indicators, no form markup);
 * - `?mode=plain|flush|legacy`: Tabs with no form, with `form="flush"` and as the contract markup of before render the same pixels;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";
import { PNG } from "pngjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const example = [...readFileSync(new URL("../../docs/ui-library/components/tabs.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][1][1];
const selected = (page, id) => page.evaluate(id => [...document.querySelectorAll(`[id^="${id}-tab-"]`)].map(tab => `${tab.getAttribute("aria-selected") === "true" ? "on" : "-"}:${getComputedStyle(tab.querySelector(".ug-tab__led")).getPropertyValue("--strata-lit").trim()}`), id);

for (const binding of ["react", "vue"]) test(`the ${binding} Tabs rail renders its anatomy markup, latches its keys and lights its LEDs, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-tabs-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataTabsBinding);
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="tabs.md#rail"]')), window.canonical(host)];
  }, example);
  expect(rendered, "tabs.md section 11 matches its markup contract").toEqual(expected);
  // Controlled: a real click and the arrow keys go through the state; the state from outside moves the key and its LED.
  expect(await selected(page, "acct")).toEqual(["on:1", "-:0", "-:0"]);
  await page.getByRole("tab", { name: "Security" }).first().click();
  expect(await page.evaluate(() => window.strataTabsBinding.value())).toBe("security");
  expect(await selected(page, "acct")).toEqual(["-:0", "on:1", "-:0"]);
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.strataTabsBinding.value()), "the disabled Billing is skipped: the arrow wraps to Profile").toBe("profile");
  expect(await page.evaluate(() => window.strataTabsBinding.changes())).toEqual(["security", "profile"]);
  await page.evaluate(() => window.strataTabsBinding.setValue("security"));
  await expect.poll(() => selected(page, "acct")).toEqual(["-:0", "on:1", "-:0"]);
  expect(await selected(page, "acct")).toEqual(["-:0", "on:1", "-:0"]);
  await page.evaluate(() => window.strataTabsBinding.setValue("profile"));
  await expect.poll(() => selected(page, "acct")).toEqual(["on:1", "-:0", "-:0"]);
  // Uncontrolled, with a ref, className/class, style and an attribute on the root.
  expect(await page.evaluate(() => { const root = window.strataTabsBinding.refs.root; return { root: root === document.querySelector('[data-testid="free"]'), className: root.className, margin: root.style.marginRight, testid: root.dataset.testid, form: root.dataset.strataForm }; }))
    .toEqual({ root: true, className: "ug-tabs extra", margin: "4px", testid: "free", form: "rail" });
  expect(await selected(page, "free")).toEqual(["-:0", "on:1", "-:0"]);
  // Manual activation: the arrows only move focus, Enter selects.
  await page.evaluate(() => document.getElementById("manual-tab-profile").focus());
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("manual-tab-security");
  expect(await selected(page, "manual")).toEqual(["on:1", "-:0", "-:0"]);
  await page.keyboard.press("Enter");
  expect(await selected(page, "manual")).toEqual(["-:0", "on:1", "-:0"]);
  // Vertical: Up and Down; small size.
  await page.evaluate(() => document.getElementById("side-tab-profile").focus());
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => document.activeElement.id)).toBe("side-tab-security");
  expect(await page.evaluate(() => document.querySelector(".ug-tabs:has([id^='side-tab-'])").dataset.strataSize)).toBe("small");
  // The caps: the selected key is down (the CSS travel), the others are not.
  expect(await page.evaluate(() => [...document.querySelectorAll("[id^='free-tab-']")].map(tab => getComputedStyle(tab).getPropertyValue("--strata-push-t").trim()))).toEqual(["0", "0.45", "0"]);
  // Flush, none and a name that is no form: the flat tabs.
  for (const id of ["flat", "plain", "none"]) expect(await page.evaluate(id => { const root = document.querySelector(`.ug-tabs:has([id^="${id}-tab-"])`); return { form: root.hasAttribute("data-strata-form"), rail: root.querySelectorAll(".ug-tabs__rail").length, indicators: root.querySelectorAll(".ug-tab__indicator").length, leds: root.querySelectorAll(".ug-tab__led").length, owner: root.hasAttribute("form") }; }, id), id)
    .toEqual({ form: false, rail: 1, indicators: 3, leds: 0, owner: false });
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").exclude("[hidden]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const binding of ["react", "vue"]) test(`the ${binding} flush Tabs are the markup and the pixels of before: no form, form="flush" and the legacy markup agree`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const shots = {};
  for (const mode of ["plain", "flush", "legacy"]) {
    await page.goto(`/ui-tabs-forms-${binding}.html?mode=${mode}`);
    await page.waitForFunction(() => document.querySelector("#probe .ug-tabs"));
    await page.waitForTimeout(200);
    shots[mode] = PNG.sync.read(await page.locator("#probe").screenshot());
  }
  for (const mode of ["flush", "legacy"]) {
    expect(shots[mode].width).toBe(shots.plain.width);
    expect(Buffer.compare(shots[mode].data, shots.plain.data), `${mode} is pixel-identical to the unformed Tabs`).toBe(0);
  }
  await context.close();
});
