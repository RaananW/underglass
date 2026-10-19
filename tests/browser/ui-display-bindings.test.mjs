/**
 * Browser test of the Display in the React and Vue bindings (`ui-display-react.html`, `ui-display-vue.html`,
 * `window.strataDisplayBinding`), with no Underglass:
 * - the TextField's `display` form and `Display` render exactly the markup examples on the anatomy page `display.md` (an editable
 *   display, an output, a read-only input with its backlight off), compared as canonical DOM;
 * - the native input is the control (role `textbox`, named by its Field's label, described by its help); typing writes the
 *   component's state and the state's other readers (a `Display` of it) follow; a changed rate moves the `<output>`;
 * - the ref reaches the native element, `className`/`class`, `style`, `size` and other attributes reach the display's root; a `live="off"` output has
 *   `aria-live="off"`; a `form` that is not `display` is the native form owner's id and gives the plain TextField;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const display = examples("display.md");
const contracts = { "display:0": display[0], "display:1": display[1], "display:2": display[2] };

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

for (const binding of ["react", "vue"]) test(`the ${binding} display forms render their markup, follow their state, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-display-${binding}.html`);
  await page.waitForFunction(() => window.strataDisplayBinding);
  await expectContracts(page);

  // The native input is the control: role, name from the Field's label, description from its help.
  const name = page.getByRole("textbox", { name: "Name" });
  await expect(name).toHaveValue("Hello");
  await expect(name).toHaveAccessibleDescription("Shown on the glass");
  await expect(page.locator("#serial")).toHaveJSProperty("readOnly", true);
  await expect(page.locator("#rate")).toHaveAccessibleName("Frame rate");
  await expect(page.locator("#rate")).toHaveText("60 fps");
  // Typing writes the state, and the output that echoes it follows.
  await name.click();
  await page.keyboard.press("End");
  await page.keyboard.type(", glass");
  expect(await page.evaluate(() => window.strataDisplayBinding.text())).toBe("Hello, glass");
  await expect(page.locator("#echo")).toHaveText("Hello, glass");
  // A changed rate moves the output; `live="off"` is `aria-live="off"`, the default is none.
  await page.locator("#faster").click();
  await expect(page.locator("#rate")).toHaveText("144 fps");
  await page.locator("#slower").click();
  await expect(page.locator("#rate")).toHaveText("30 fps");
  await expect(page.locator("#rate")).toHaveAttribute("aria-live", "off");
  expect(await page.locator("#echo").getAttribute("aria-live")).toBeNull();

  // The ref reaches the native element; class, style, size and other attributes reach the display's root.
  expect(await page.evaluate(() => [window.strataDisplayBinding.refs.input.tagName, window.strataDisplayBinding.refs.serial.id, window.strataDisplayBinding.refs.output.tagName, window.strataDisplayBinding.refs.output.id])).toEqual(["INPUT", "serial", "OUTPUT", "rate"]);
  const root = page.locator(".ug-display", { has: name });
  await expect(root).toHaveClass(/extra/);
  await expect(root).toHaveClass(/ug-display--input/);
  await expect(root).toHaveCSS("margin-right", "4px");
  await expect(root).toHaveAttribute("data-strata-size", "small");
  await expect(root).toHaveAttribute("data-strata-form", "display");
  const rateRoot = page.locator(".ug-display", { has: page.locator("#rate") });
  await expect(rateRoot).toHaveClass(/extra/);
  await expect(rateRoot).toHaveCSS("margin-right", "4px");
  await expect(rateRoot).toHaveAttribute("data-strata-backlight", "info");
  // The native input takes the data attributes the caller names on the TextField, and the root takes none of them.
  await expect(page.locator("input[data-testid=name]")).toHaveCount(1);
  expect(await root.evaluate(element => element.hasAttribute("data-testid"))).toBe(false);
  // An unlit read-only display.
  const serialRoot = page.locator(".ug-display", { has: page.locator("#serial") });
  await expect(serialRoot).toHaveAttribute("data-strata-lit", "false");
  expect(await serialRoot.evaluate(element => Number(getComputedStyle(element).getPropertyValue("--strata-lit")))).toBe(0);
  // A `form` that is not `display` is the native form owner's id, and the field is the plain TextField.
  const owner = page.locator("#owner");
  await expect(owner).toHaveAttribute("form", "login-form");
  await expect(owner).toHaveClass("ug-text-field");
  expect(await owner.evaluate(input => input.closest(".ug-display"))).toBeNull();
  // A large display's text is larger than a small one's.
  const sizes = await page.evaluate(() => ({ small: getComputedStyle(document.querySelector("input[data-testid=name]")).fontSize, large: getComputedStyle(document.getElementById("echo")).fontSize }));
  expect(Number.parseFloat(sizes.large)).toBeGreaterThan(Number.parseFloat(sizes.small));

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
