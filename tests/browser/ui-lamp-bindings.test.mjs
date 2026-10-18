/**
 * Browser test of the Lamp and the StatusLight in the React and Vue bindings (`ui-lamp-react.html`, `ui-lamp-vue.html`,
 * `window.strataLampBinding`), with no Underglass:
 * - each renders exactly the markup examples on the anatomy pages `lamp.md` (a toggle lamp and a momentary one) and
 *   `status-light.md` (an image, a shown label with a blink, a live region), compared as canonical DOM;
 * - a controlled lamp follows a real click, Space and its label through its state, and its state from outside; an
 *   uncontrolled one keeps its own; the ref is the native control; `className`/`class`, `style` and other attributes reach
 *   the row and the control as documented; a reversed lamp in a Field takes its description; an invalid one is
 *   `aria-invalid`; a disabled one does not toggle; a lamp's `form` is the native form owner;
 * - a momentary lamp is a button that is `aria-pressed` while held, counts one click per press, and its ref is the button;
 * - a StatusLight is an image named by its label, a text, or a live `<output>` (a status; `aria-live="assertive"` when
 *   asked), follows its props (label, lit), and its ref and `className`, `style` and attributes reach the root;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const lamp = examples("lamp.md"), status = examples("status-light.md");
const contracts = { "lamp:0": lamp[0], "lamp:1": lamp[1], "status-light:0": status[0], "status-light:1": status[1], "status-light:2": status[2] };
const checked = (page, id) => page.locator(`#${id}`).evaluate(input => input.checked);

/** Compares each `[data-contract]` container with its anatomy page's example, as canonical DOM. */
async function expectContracts(page) {
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
}

for (const binding of ["react", "vue"]) test(`the ${binding} Lamp renders its markup, works controlled and uncontrolled, momentary and in a Field, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-lamp-${binding}.html`);
  await page.waitForFunction(() => window.strataLampBinding);
  await expectContracts(page);

  // Controlled: a real click, Space and the label go through the state; the state from outside moves it.
  const mains = page.locator("#mains");
  await expect(mains).toHaveRole("switch");
  await expect(mains).toHaveAccessibleName("Mains");
  expect(await page.evaluate(() => window.strataLampBinding.mains())).toBe(false);
  const box = await mains.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.strataLampBinding.mains())).toBe(true);
  await expect(page.locator("#mains-read")).toHaveText("Mains engaged");
  await mains.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.strataLampBinding.mains())).toBe(false);
  await page.locator(".ug-lamp", { has: mains }).locator(".ug-lamp__label").click();
  expect(await page.evaluate(() => window.strataLampBinding.mains())).toBe(true);
  expect(await page.evaluate(() => window.strataLampBinding.changes())).toEqual([true, false, true]);
  await page.evaluate(() => window.strataLampBinding.setMains(false));
  await expect(mains).not.toBeChecked();
  await expect(page.locator("#mains-read")).toHaveText("Mains clear");

  // Uncontrolled, with a ref, class, style and an attribute: class and style on the row, the rest on the control.
  const arm = page.locator("#arm");
  await expect(arm).toBeChecked();
  expect(await page.evaluate(() => window.strataLampBinding.refs.arm.id)).toBe("arm");
  await expect(arm).toHaveAttribute("data-testid", "arm");
  const row = page.locator(".ug-lamp", { has: arm });
  await expect(row).toHaveClass(/extra/);
  await expect(row).toHaveCSS("margin-right", "4px");
  await expect(row).toHaveAttribute("data-strata-size", "small");
  await expect(row).toHaveAttribute("data-strata-colour", "accent");
  const armBox = await arm.boundingBox();
  expect([armBox.width, armBox.height], "a small lamp's box is the lens (20) plus 28").toEqual([48, 48]);
  await page.mouse.click(armBox.x + armBox.width / 2, armBox.y + armBox.height / 2);
  await expect(arm).not.toBeChecked();

  // A reversed lamp in a Field: its description; its label first.
  const hall = page.locator("#hall");
  await expect(hall).toHaveAccessibleDescription("Lights the hall.");
  await expect(page.locator(".ug-lamp", { has: hall })).toHaveClass(/ug-lamp--reverse/);
  await page.locator(".ug-lamp", { has: hall }).locator(".ug-lamp__label").click();
  await expect(hall).toBeChecked();
  // Invalid and disabled.
  await expect(page.locator("#fault")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#locked").click({ force: true });
  await expect(page.locator("#locked")).toBeChecked();
  await expect(page.locator("#locked")).toBeDisabled();
  // A `form` that names a form is the native form owner; there is no hardware form to choose.
  const owned = page.locator("#owned");
  await expect(owned).toHaveAttribute("form", "settings");
  expect(await owned.evaluate(input => input.form?.id)).toBe("settings");
  await page.locator(".ug-lamp", { has: owned }).locator(".ug-lamp__label").click();
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("settings"))))).toEqual({ owned: "on" });

  // Momentary: a button, lit while held, one click per press, with its ref and attributes on the button.
  const talk = page.locator("#talk");
  await expect(talk).toHaveRole("button");
  await expect(talk).toHaveAccessibleName("Talk");
  await expect(talk).toHaveAttribute("aria-pressed", "false");
  await expect(talk).toHaveAttribute("data-testid", "talk");
  await expect(talk).toHaveClass(/ug-lamp--momentary/);
  expect(await page.evaluate(() => window.strataLampBinding.refs.talk.id)).toBe("talk");
  const talkBox = await talk.boundingBox();
  await page.mouse.move(talkBox.x + 28, talkBox.y + talkBox.height / 2);
  await page.mouse.down();
  await expect(talk).toHaveAttribute("aria-pressed", "true");
  await page.mouse.up();
  await expect(talk).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.strataLampBinding.clicks())).toBe(1);
  await talk.focus();
  await page.keyboard.down("Space");
  await expect(talk).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Space");
  expect(await page.evaluate(() => window.strataLampBinding.clicks())).toBe(2);
  await expect(page.locator("#muted")).toBeDisabled();
  await page.locator("#muted").click({ force: true });
  await expect(page.locator("#muted")).toHaveAttribute("aria-pressed", "false");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const binding of ["react", "vue"]) test(`the ${binding} StatusLight is an image, a text or a live region, follows its props, and passes its attributes to the root`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-lamp-${binding}.html`);
  await page.waitForFunction(() => window.strataLampBinding);
  await expectContracts(page);
  const link = page.locator("#link");
  await expect(link).toHaveRole("img");
  await expect(link).toHaveAccessibleName("Link up");
  await expect(link).toHaveAttribute("data-strata-colour", "success");
  await expect(link).not.toHaveAttribute("data-strata-lit", /.*/);
  // The live region: an <output>, a status, with the same label as text; assertive when asked.
  const sync = page.locator("#sync");
  expect(await sync.evaluate(output => output.tagName)).toBe("OUTPUT");
  await expect(sync).toHaveRole("status");
  await expect(sync).toHaveText("Link up");
  await expect(sync).not.toHaveAttribute("aria-live", /.*/);
  const alert = page.locator("#alert");
  await expect(alert).toHaveAttribute("aria-live", "assertive");
  await expect(alert).toHaveClass(/ug-status-light--bare/);
  await expect(alert).toHaveAttribute("data-strata-size", "large");
  // The props follow the state: the label everywhere it lives, and lit.
  await page.locator("#change").click();
  await expect(link).toHaveAccessibleName("Link down");
  await expect(link).toHaveAttribute("data-strata-lit", "false");
  await expect(sync).toHaveText("Link down");
  expect(await page.evaluate(() => window.strataLampBinding.link())).toEqual({ label: "Link down", lit: false });
  // The ref and class, style and attributes reach the root; blink is a tempo attribute.
  const rec = page.locator("#rec");
  expect(await page.evaluate(() => window.strataLampBinding.refs.light.id)).toBe("rec");
  await expect(rec).toHaveClass(/extra/);
  await expect(rec).toHaveCSS("margin-right", "4px");
  await expect(rec).toHaveAttribute("data-testid", "rec");
  await expect(rec).toHaveAttribute("data-strata-blink", "fast");
  await expect(rec).toContainText("Recording");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
