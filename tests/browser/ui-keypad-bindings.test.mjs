/**
 * Browser test of the Keypad and KeypadKey in the React and Vue bindings (`ui-keypad-react.html`, `ui-keypad-vue.html`,
 * `window.strataKeypadBinding`), with no Underglass:
 * - each renders exactly the two markup examples on the anatomy page `keypad.md` (a keypad with second legends and a disabled key, a
 *   shifted keypad named by `aria-label`), compared as canonical DOM;
 * - a key is held while pressed and clicks once; `className`/`class`, `style`, `value`, `aria-label` and other attributes reach the right
 *   element (the fieldset or the button), the refs are the fieldset and the button; a disabled key does nothing and a `disabled` keypad
 *   disables every key;
 * - the arrows move between the keys (one tab stop), skipping a disabled key;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = [...readFileSync(new URL("../../docs/ui-library/components/keypad.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "keypad.md": examples[0], "keypad.md#2": examples[1] };
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

/** Compares the binding's `[data-contract]` containers with the anatomy page's examples, as canonical DOM. */
async function expectContracts(page) {
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
}

for (const binding of ["react", "vue"]) test(`the ${binding} Keypad and KeypadKey render their markup, hold their keys, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-keypad-${binding}.html`);
  await page.waitForFunction(() => window.strataKeypadBinding);
  await expectContracts(page);

  // The fieldset carries `class`, `style`, the columns and the legend; the key carries `class`, `value` and its legends.
  const dial = page.locator("#dial");
  expect(await page.evaluate(() => {
    const fieldset = window.strataKeypadBinding.refs.dial, button = window.strataKeypadBinding.refs.two;
    return { fieldset: fieldset === document.getElementById("dial"), button: button === document.getElementById("two"), className: fieldset.className, style: fieldset.getAttribute("style"), testid: fieldset.dataset.testid,
      keyClass: button.className, value: button.value, keyTestid: button.dataset.testid, type: button.type, legend: fieldset.querySelector(":scope > legend").textContent };
  })).toEqual({ fieldset: true, button: true, className: "ug-keypad extra", style: "--strata-keypad-columns: 3; margin-right: 4px;", testid: "dial", keyClass: "ug-keypad__key extra", value: "2", keyTestid: "two", type: "button", legend: "Dial" });
  await expect(page.getByRole("group", { name: "Dial" })).toHaveCount(1);
  await expect(page.locator("#two")).toHaveAccessibleName("2 ABC");
  await expect(page.locator("#five")).toHaveAccessibleName("5, five");
  expect(await dial.evaluate(element => getComputedStyle(element.querySelector(".ug-keypad__plinth")).gridTemplateColumns.split(" ").length)).toBe(3);

  // A key: held while pressed (after the behaviour attaches on mount), one click.
  const two = page.locator("#two");
  const box = await two.boundingBox();
  await page.mouse.move(...centre(box));
  await page.mouse.down();
  await expect(two).toHaveAttribute("data-strata-down", "true");
  expect(await page.evaluate(() => window.strataKeypadBinding.clicks())).toEqual([]);
  await page.mouse.up();
  await expect(two).toHaveAttribute("data-strata-down", "false");
  expect(await page.evaluate(() => window.strataKeypadBinding.clicks())).toEqual(["two"]);
  await two.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.strataKeypadBinding.clicks())).toEqual(["two", "two"]);

  // A disabled key and a disabled keypad do nothing; the shifted keypad prints its second legend large.
  await expect(page.locator("#four")).toBeDisabled();
  await page.mouse.click(...centre(await page.locator("#four").boundingBox()));
  await expect(page.locator("#locked-a")).toBeDisabled();
  await expect(page.locator("#locked-b")).toBeDisabled();
  expect(await page.evaluate(() => window.strataKeypadBinding.clicks().filter(id => id === "four" || id.startsWith("locked")))).toEqual([]);
  await expect(page.locator("#hex")).toHaveAttribute("data-strata-shifted", "true");
  expect(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("#hex-a .ug-keypad__shift")).fontSize) > parseFloat(getComputedStyle(document.querySelector("#hex-a .ug-keypad__print")).fontSize))).toBe(true);

  // The arrows move between the keys (one tab stop), skipping the disabled one: two three / four five.
  await two.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#three")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#three")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(two).toBeFocused();
  await page.keyboard.press("Control+End");
  await expect(page.locator("#five")).toBeFocused();
  expect(await page.evaluate(() => [...document.querySelectorAll("#dial .ug-keypad__key")].filter(key => key.getAttribute("tabindex") === "0").map(key => key.id))).toEqual(["five"]);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
