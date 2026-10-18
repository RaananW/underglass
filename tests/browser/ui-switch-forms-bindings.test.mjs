/**
 * Browser test of the Switch forms in the React and Vue bindings (`ui-switch-forms-react.html`,
 * `ui-switch-forms-vue.html`, `window.strataSwitchBinding`), with no Underglass:
 * - each renders exactly the Forms markup example on the anatomy page `switch.md` (`switch.md#2`), compared as
 *   canonical DOM;
 * - a controlled slide follows a real click, a drag past centre and Space through its state, and its state from
 *   outside; a drag held short of centre changes nothing;
 * - an uncontrolled bat keeps its own state; the ref is the input; `className`/`class`, `style` and other attributes
 *   reach the row and the input; a reversed wall in a Field takes its description; a disabled rocker does not throw;
 * - a `form` that names no hardware form is the native form owner, and the switch stays the Strata switch;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const example = [...readFileSync(new URL("../../docs/ui-library/components/switch.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)][1][1];
const checked = (page, id) => page.locator(`#${id}`).evaluate(input => input.checked);

/** Compares the binding's `[data-contract="switch.md#2"]` with the anatomy page's Forms example, as canonical DOM. */
async function expectFormsContract(page) {
  const [rendered, expected] = await page.evaluate(html => {
    const host = document.implementation.createHTMLDocument("").body;
    host.innerHTML = html;
    return [window.canonical(document.querySelector('[data-contract="switch.md#2"]')), window.canonical(host)];
  }, example);
  expect(rendered, "switch.md#2 matches its markup contract").toEqual(expected);
}

for (const binding of ["react", "vue"]) test(`the ${binding} Switch renders each hardware form, works controlled and uncontrolled, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-switch-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataSwitchBinding);
  await expectFormsContract(page);

  // Controlled: a real click, a drag past centre and Space go through the state; the state from outside moves it.
  const bypass = page.locator("#bypass");
  await expect(bypass).toHaveRole("switch");
  await expect(bypass).toHaveAccessibleName("Bypass");
  await expect(page.locator(".ug-switch", { has: bypass })).toHaveAttribute("data-strata-form", "slide");
  const box = await bypass.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.strataSwitchBinding.bypass())).toBe(true);
  await expect(page.locator("#bypass-read")).toHaveText("Bypass engaged");
  // Back to off by a drag past centre, then a drag held short of centre changes nothing.
  const drag = async (from, to) => { await page.mouse.move(box.x + from * box.width, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + to * box.width, box.y + box.height / 2, { steps: 8 }); await page.mouse.up(); };
  await drag(0.85, 0.15);
  expect(await page.evaluate(() => window.strataSwitchBinding.bypass())).toBe(false);
  await drag(0.15, 0.4);
  expect(await page.evaluate(() => window.strataSwitchBinding.bypass())).toBe(false);
  expect(await checked(page, "bypass")).toBe(false);
  await bypass.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.strataSwitchBinding.bypass())).toBe(true);
  expect(await page.evaluate(() => window.strataSwitchBinding.changes())).toEqual([true, false, true]);
  await page.evaluate(() => window.strataSwitchBinding.setBypass(false));
  await expect(bypass).not.toBeChecked();
  await expect(page.locator("#bypass-read")).toHaveText("Bypass clear");

  // Uncontrolled bat with a ref, class, style and an attribute.
  const arm = page.locator("#arm");
  await expect(arm).toBeChecked();
  expect(await page.evaluate(() => window.strataSwitchBinding.refs.input.id)).toBe("arm");
  await expect(arm).toHaveAttribute("data-testid", "arm");
  const row = page.locator(".ug-switch", { has: arm });
  await expect(row).toHaveClass(/extra/);
  await expect(row).toHaveCSS("margin-right", "4px");
  const armBox = await arm.boundingBox();
  expect([Math.round(armBox.width), Math.round(armBox.height)]).toEqual([48, 92]);
  await page.mouse.move(armBox.x + armBox.width / 2, armBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(armBox.x + armBox.width / 2, armBox.y + armBox.height - 10, { steps: 8 });
  await page.mouse.up();
  await expect(arm).not.toBeChecked();
  // A reversed wall in a Field: its description; its label first.
  const hall = page.locator("#hall");
  await expect(hall).toHaveAccessibleDescription("Lights the hall.");
  await expect(page.locator(".ug-switch", { has: hall })).toHaveClass(/ug-switch--reverse/);
  await page.locator(".ug-switch", { has: hall }).locator(".ug-switch__label").click();
  await expect(hall).toBeChecked();
  // Disabled: no throw.
  await page.locator("#heater").click({ force: true });
  await expect(page.locator("#heater")).not.toBeChecked();
  // A form that names no hardware form is the native form owner, on the Strata switch.
  const wifi = page.locator("#wifi");
  await expect(wifi).toHaveAttribute("form", "settings");
  await expect(wifi).toHaveAttribute("data-strata-face", "well");
  expect(await wifi.evaluate(input => input.form?.id)).toBe("settings");
  await expect(page.locator(".ug-switch", { has: wifi })).not.toHaveAttribute("data-strata-form", /.*/);
  await expect(page.locator(".ug-switch", { has: wifi }).locator(".ug-switch__knob")).toHaveCount(1);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
