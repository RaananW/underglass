/**
 * Browser test of the Fader's React and Vue bindings (`ui-fader-react.html`, `ui-fader-vue.html`,
 * `window.strataFaderBinding`), with no Underglass:
 * - each renders exactly the markup example on the anatomy page `fader.md`, compared as canonical DOM;
 * - a controlled fader follows real numeral clicks, carriage drags and keys through its state, and its state from
 *   outside;
 * - an uncontrolled fader keeps its own value and resets to `resetValue` on a double-click; the ref is the root, and
 *   `className`/`class`, `style` and other attributes reach it; `inputRef` (React) or the exposed `input` (Vue) is
 *   the input;
 * - a horizontal fader with `format` gives `aria-valuetext` and no `aria-orientation`; labelled marks print their
 *   labels and clicks on them set their values; a Field gives its description; `size` sets the travel; detents snap;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const example = [...readFileSync(new URL("../../docs/ui-library/components/fader.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][0][1];
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

/** Compares the binding's `[data-contract="fader.md"]` with the anatomy page's example, as canonical DOM. */
async function expectFaderContract(page) {
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="fader.md"]')), window.canonical(host)];
  }, example);
  expect(rendered, "fader.md matches its markup contract").toEqual(expected);
}

for (const binding of ["react", "vue"]) test(`the ${binding} Fader renders its anatomy markup, works controlled and uncontrolled, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-fader-${binding}.html`);
  await page.waitForFunction(() => window.strataFaderBinding);
  await expectFaderContract(page);
  /** The centre of a printed mark of the fader whose input is `#id`. */
  const mark = async (id, text) => centre(await page.locator(".ug-fader", { has: page.locator(`#${id}`) }).locator(".ug-fader__mark").filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());
  const carriage = async id => centre(await page.locator(".ug-fader", { has: page.locator(`#${id}`) }).locator(".ug-fader__carriage").boundingBox());

  // Controlled: a real click on a numeral and a drag of the carriage go through the state; the state from outside
  // moves the carriage.
  const volume = page.locator("#volume");
  await expect(volume).toHaveAccessibleName("Volume");
  await expect(volume).toHaveAttribute("aria-valuetext", "40%");
  await expect(volume).toHaveAttribute("aria-orientation", "vertical");
  await page.mouse.click(...await mark("volume", "75"));
  expect(await page.evaluate(() => window.strataFaderBinding.volume())).toBe(75);
  await expect(volume).toHaveAttribute("aria-valuetext", "75%");
  await expect(page.locator("#volume-read")).toHaveText("Volume 75%");
  const [cx, cy] = await carriage("volume");
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 36, { steps: 8 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.strataFaderBinding.volume())).toBe(95);
  await volume.focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => window.strataFaderBinding.volume())).toBe(94);
  expect((await page.evaluate(() => window.strataFaderBinding.changes())).at(-1)).toBe(94);
  await page.evaluate(() => window.strataFaderBinding.setVolume(25));
  await expect(volume).toHaveValue("25");
  await expect(volume).toHaveAttribute("aria-valuetext", "25%");
  expect(await volume.evaluate(input => input.closest(".ug-fader").style.getPropertyValue("--strata-fader-value"))).toBe("0.25");

  // Uncontrolled, with a ref, className/class, style and an attribute on the root; double-click resets to resetValue.
  const send = page.locator("#send");
  expect(await page.evaluate(() => {
    const { root, input } = window.strataFaderBinding.refs;
    return { root: root === document.getElementById("send").closest(".ug-fader"), input: input === document.getElementById("send"), className: root.className, margin: root.style.marginRight, testid: root.dataset.testid };
  })).toEqual({ root: true, input: true, className: "ug-fader extra", margin: "4px", testid: "send" });
  await page.mouse.click(...await mark("send", "10"));
  expect(await value(page, "send")).toBe(10);
  await page.mouse.dblclick(...await mark("send", "5"));
  expect(await value(page, "send")).toBe(0);
  expect(await send.evaluate(input => input.closest(".ug-fader").style.getPropertyValue("--strata-fader-value"))).toBe("0");

  // A horizontal fader: format gives the value text, labelled marks print their labels and set their values.
  const pan = page.locator("#pan");
  await expect(pan).toHaveAttribute("aria-valuetext", "10 right");
  await expect(pan).not.toHaveAttribute("aria-orientation");
  await expect(pan).not.toHaveAttribute("data-strata-unit");
  await page.mouse.click(...await mark("pan", "L"));
  expect(await value(page, "pan")).toBe(-50);
  await expect(pan).toHaveAttribute("aria-valuetext", "50 left");
  await page.mouse.click(...await mark("pan", "C"));
  await expect(pan).toHaveAttribute("aria-valuetext", "Centre");

  // A Field gives the fader its id and description; size sets the travel (small: 120, 5 detents at 30 px).
  const trim = page.getByRole("slider", { name: "Trim" });
  await expect(trim).toHaveAccessibleDescription("Slide to set the trim.");
  expect(await trim.evaluate(input => [input.step, input.closest(".ug-fader").dataset.strataSize, input.closest(".ug-fader").querySelector(".ug-fader__slot").getBoundingClientRect().height])).toEqual(["6", "small", 126]);
  const [tx, ty] = centre(await trim.locator("xpath=..").locator(".ug-fader__carriage").boundingBox());
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx, ty - 31, { steps: 6 });
  await page.mouse.up();
  expect(await trim.evaluate(input => Number(input.value))).toBe(6);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
