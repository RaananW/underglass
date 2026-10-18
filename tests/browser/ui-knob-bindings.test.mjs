/**
 * Browser test of the Knob's React and Vue bindings (`ui-knob-react.html`, `ui-knob-vue.html`, `window.strataKnobBinding`),
 * with no Underglass:
 * - each renders exactly the markup example on the anatomy page `knob.md`, compared as canonical DOM;
 * - a controlled knob follows real ring clicks, drags and keys through its state, and its state from outside;
 * - an uncontrolled knob keeps its own value and resets to `resetValue` on a double-click; the ref is the root, and
 *   `className`/`class`, `style` and other attributes reach it; `inputRef` (React) or the exposed `input` (Vue) is
 *   the input;
 * - `format` gives `aria-valuetext`; labelled marks print their labels and snap ring clicks to their values; a Field
 *   gives its description; `size` sizes the dial;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const example = [...readFileSync(new URL("../../docs/ui-library/components/knob.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][0][1];
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

/** Compares the binding's `[data-contract="knob.md"]` with the anatomy page's example, as canonical DOM. */
async function expectKnobContract(page) {
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="knob.md"]')), window.canonical(host)];
  }, example);
  expect(rendered, "knob.md matches its markup contract").toEqual(expected);
}

for (const binding of ["react", "vue"]) test(`the ${binding} Knob renders its anatomy markup, works controlled and uncontrolled, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-knob-${binding}.html`);
  await page.waitForFunction(() => window.strataKnobBinding);
  await expectKnobContract(page);
  /** The centre of a printed mark of the knob whose input is `#id`. */
  const mark = async (id, text) => centre(await page.locator(".ug-knob", { has: page.locator(`#${id}`) }).locator(".ug-knob__mark").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());

  // Controlled: a real ring click and a drag go through the state; the state from outside moves the dial.
  const level = page.locator("#level");
  await expect(level).toHaveAccessibleName("Level");
  await expect(level).toHaveAttribute("aria-valuetext", "40%");
  await page.mouse.click(...await mark("level", "70"));
  expect(await page.evaluate(() => window.strataKnobBinding.level())).toBe(70);
  await expect(level).toHaveAttribute("aria-valuetext", "70%");
  await expect(page.locator("#level-read")).toHaveText("Level 70%");
  const [cx, cy] = centre(await level.boundingBox());
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 40, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.strataKnobBinding.level())).toBe(90);
  await level.focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => window.strataKnobBinding.level())).toBe(89);
  expect((await page.evaluate(() => window.strataKnobBinding.changes())).at(-1)).toBe(89);
  await page.evaluate(() => window.strataKnobBinding.setLevel(25));
  await expect(level).toHaveValue("25");
  await expect(level).toHaveAttribute("aria-valuetext", "25%");
  expect(await level.evaluate(input => input.closest(".ug-knob").style.getPropertyValue("--strata-knob-value"))).toBe("0.25");

  // Uncontrolled, with a ref, className/class, style and an attribute on the root; double-click resets to resetValue.
  const pan = page.locator("#pan");
  expect(await page.evaluate(() => {
    const { root, input } = window.strataKnobBinding.refs;
    return { root: root === document.getElementById("pan").closest(".ug-knob"), input: input === document.getElementById("pan"), className: root.className, margin: root.style.marginRight, testid: root.dataset.testid };
  })).toEqual({ root: true, input: true, className: "ug-knob extra", margin: "4px", testid: "pan" });
  const [px, py] = centre(await pan.boundingBox());
  await page.mouse.click(px, py - 12);
  expect(await value(page, "pan")).toBe(11);
  await page.mouse.dblclick(...await mark("pan", "40"));
  expect(await value(page, "pan")).toBe(0);
  expect(await pan.evaluate(input => input.closest(".ug-knob").style.getPropertyValue("--strata-knob-value"))).toBe("0.5");

  // format gives the value text; labelled marks print their labels and snap to their values.
  const mix = page.locator("#mix");
  await expect(mix).toHaveAttribute("aria-valuetext", "Mix 7 of 10");
  await page.mouse.click(...await mark("mix", "Half"));
  expect(await value(page, "mix")).toBe(5);
  await expect(mix).toHaveAttribute("aria-valuetext", "Mix 5 of 10");
  await expect(mix).not.toHaveAttribute("data-strata-unit");

  // A Field gives the knob its id and description; size sizes the dial (a small detented knob: 0.8 × 48 → 38).
  const drive = page.getByRole("slider", { name: "Drive" });
  await expect(drive).toHaveAccessibleDescription("Turn to set the drive.");
  expect(await drive.evaluate(input => [input.step, input.closest(".ug-knob").dataset.strataSize, input.closest(".ug-knob").querySelector(".ug-knob__skirt").getBoundingClientRect().width])).toEqual(["1", "small", 38]);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
