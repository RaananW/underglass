/**
 * Browser test of the RotarySelector's React and Vue bindings (`ui-rotary-selector-react.html`,
 * `ui-rotary-selector-vue.html`, `window.strataRotaryBinding`), with no Underglass:
 * - each renders exactly the markup example on the anatomy page `rotary-selector.md`, compared as canonical DOM;
 * - a controlled selector follows real label clicks, drags and keys through its state, and its state from outside;
 * - an uncontrolled selector keeps its own value; the ref is the root, and `className`/`class`, `style` and other attributes
 *   reach it; `selectRef` (React) or the exposed `select` (Vue) is the select;
 * - a Field gives its description; `size` sizes the dial; a disabled selector does not move;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const example = [...readFileSync(new URL("../../docs/ui-library/components/rotary-selector.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][0][1];
const value = (page, id) => page.locator(`#${id}`).evaluate(select => select.value);
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

/** Compares the binding's `[data-contract="rotary-selector.md"]` with the anatomy page's example, as canonical DOM. */
async function expectContract(page) {
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="rotary-selector.md"]')), window.canonical(host)];
  }, example);
  expect(rendered, "rotary-selector.md matches its markup contract").toEqual(expected);
}

for (const binding of ["react", "vue"]) test(`the ${binding} RotarySelector renders its anatomy markup, works controlled and uncontrolled, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-rotary-selector-${binding}.html`);
  await page.waitForFunction(() => window.strataRotaryBinding);
  await expectContract(page);
  /** The centre of a printed label of the selector whose select is `#id`. */
  const label = async (id, text) => centre(await page.locator(".ug-rotary", { has: page.locator(`#${id}`) }).locator(".ug-rotary__text").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  const fraction = id => page.locator(`#${id}`).evaluate(select => select.closest(".ug-rotary").style.getPropertyValue("--strata-rotary-value"));

  // Controlled: a real label click, a drag and a key go through the state; the state from outside moves the dial.
  const mode = page.locator("#mode");
  await expect(mode).toHaveRole("combobox");
  await expect(mode).toHaveAccessibleName("Mode");
  expect(await value(page, "mode")).toBe("low");
  expect(await fraction("mode")).toBe("0.3333");
  await page.mouse.click(...await label("mode", "High"));
  expect(await page.evaluate(() => window.strataRotaryBinding.mode())).toBe("high");
  await expect(page.locator("#mode-read")).toHaveText("Mode high");
  expect(await fraction("mode")).toBe("1");
  const [cx, cy] = centre(await mode.boundingBox());
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 40, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.strataRotaryBinding.mode()), "a drag of 40 px (200 per sweep of three steps) moves one position back").toBe("mid");
  await mode.focus();
  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() => window.strataRotaryBinding.mode())).toBe("low");
  expect(await page.evaluate(() => window.strataRotaryBinding.changes().slice(-3))).toEqual(["high", "mid", "low"]);
  await page.evaluate(() => window.strataRotaryBinding.setMode("off"));
  expect(await value(page, "mode")).toBe("off");
  expect(await fraction("mode")).toBe("0");
  expect(await page.locator("#mode").evaluate(select => [...select.closest(".ug-rotary").querySelectorAll(".ug-rotary__mark")].map(mark => mark.dataset.strataSelected))).toEqual(["true", "false", "false", "false"]);

  // Uncontrolled, with a ref, className/class, style and an attribute on the root; a cap tap steps to the next option.
  const tone = page.locator("#tone");
  expect(await page.evaluate(() => {
    const { root, select } = window.strataRotaryBinding.refs;
    return { root: root === document.getElementById("tone").closest(".ug-rotary"), select: select === document.getElementById("tone"), className: root.className, margin: root.style.marginRight, testid: root.dataset.testid };
  })).toEqual({ root: true, select: true, className: "ug-rotary extra", margin: "4px", testid: "tone" });
  expect(await value(page, "tone")).toBe("flat");
  const [tx, ty] = centre(await tone.boundingBox());
  await page.mouse.click(tx, ty - 12);
  expect(await value(page, "tone")).toBe("bright");
  await page.mouse.click(...await label("tone", "Warm"));
  expect(await value(page, "tone")).toBe("warm");
  expect(await fraction("tone")).toBe("0");

  // A Field gives the selector its id and description; size sizes the dial (a small skirt is 48 px).
  const input = page.getByRole("combobox", { name: "Input" });
  await expect(input).toHaveAccessibleDescription("Pick the input.");
  expect(await input.evaluate(select => [select.closest(".ug-rotary").dataset.strataSize, select.closest(".ug-rotary").querySelector(".ug-rotary__skirt").getBoundingClientRect().width])).toEqual(["small", 48]);

  // A disabled selector does not move, and its select is disabled.
  await expect(page.locator("#locked")).toBeDisabled();
  await page.mouse.click(...await label("locked", "Warm"));
  expect(await value(page, "locked")).toBe("bright");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
