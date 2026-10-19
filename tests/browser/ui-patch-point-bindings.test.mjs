/**
 * Browser test of the PatchPoint and PatchBay React and Vue bindings (`ui-patch-point-react.html`, `ui-patch-point-vue.html`,
 * `window.strataPatchBinding`), with no Underglass:
 * - each renders exactly the three markup examples on the anatomy page `patch-point.md` (a checkbox jack with an LED, a pressed button jack
 *   with an amber LED and a PatchBay of two), compared as canonical DOM;
 * - a controlled checkbox jack follows real clicks and keys through its state, and its state from outside; a button jack whose `connected` the
 *   page keeps follows a click; the plug shows only while connected and the LED lights;
 * - the ref reaches the native control; `className`/`class`, `style`, `size` and other attributes reach the row; a bay takes its own attributes and
 *   `columns`, and its `disabled` disables its jacks; a Field gives its description;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = [...readFileSync(new URL("../../docs/ui-library/components/patch-point.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "patch-point:0": examples[0], "patch-point:1": examples[1], "patch-bay:0": examples[2] };
const centre = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };

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
const shown = (page, id) => page.locator(`#${id}`).evaluate(control => { const root = control.closest(".ug-patch-point"), led = root.querySelector(".ug-patch-point__led"); return { plug: getComputedStyle(root.querySelector(".ug-patch-point__plug")).visibility, lit: led ? Number(getComputedStyle(led).getPropertyValue("--strata-lit")) : null }; });

for (const binding of ["react", "vue"]) test(`the ${binding} PatchPoint and PatchBay render their anatomy markup, follow their state, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-patch-point-${binding}.html`);
  await page.waitForFunction(() => window.strataPatchBinding);
  await expectContracts(page);

  // Controlled checkbox jack: a real click and a key go through the state; the state from outside moves the plug and the LED.
  const link = page.locator("#link");
  await expect(link).toHaveRole("checkbox");
  await expect(link).toHaveAccessibleName("Link");
  expect(await shown(page, "link")).toEqual({ plug: "hidden", lit: 0 });
  await page.mouse.click(...await centre(page, "link"));
  expect(await page.evaluate(() => window.strataPatchBinding.link())).toBe(true);
  expect(await shown(page, "link")).toEqual({ plug: "visible", lit: 1 });
  await expect(page.locator("#link-read")).toHaveText("Link patched");
  await link.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.strataPatchBinding.link())).toBe(false);
  expect(await page.evaluate(() => window.strataPatchBinding.changes())).toEqual([true, false]);
  await page.evaluate(() => window.strataPatchBinding.setLink(true));
  await expect(link).toBeChecked();
  expect(await shown(page, "link")).toEqual({ plug: "visible", lit: 1 });

  // The ref reaches the native control; class, style, size and an attribute reach the row; an LED colour is a role.
  expect(await page.evaluate(() => { const { input } = window.strataPatchBinding.refs, row = input.closest(".ug-patch-point");
    return { input: input === document.getElementById("extra"), checked: input.checked, className: row.className, margin: row.style.marginRight, testid: input.dataset.testid, size: row.dataset.strataSize, led: row.querySelector(".ug-patch-point__led").dataset.strataColour }; }))
    .toEqual({ input: true, checked: true, className: "ug-patch-point extra", margin: "4px", testid: "extra", size: "large", led: "danger" });

  // A button jack whose `connected` the page keeps: a click goes through the page's state, and Enter too.
  const hold = page.locator("#hold");
  await expect(hold).toHaveAttribute("aria-pressed", "false");
  await page.mouse.click(...await centre(page, "hold"));
  await expect(hold).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.strataPatchBinding.pressed())).toBe(true);
  await hold.focus();
  await page.keyboard.press("Enter");
  await expect(hold).toHaveAttribute("aria-pressed", "false");
  expect(await page.evaluate(() => window.strataPatchBinding.pressed())).toBe(false);
  expect(await shown(page, "hold")).toEqual({ plug: "hidden", lit: null });

  // A Field gives its description; a bay takes its attributes, its columns and its disabled state.
  await expect(page.locator("#route")).toHaveAccessibleDescription("Plug it in to route the signal.");
  const bay = page.locator("#sends");
  await expect(bay).toHaveClass(/bay/);
  await expect(bay).toHaveAttribute("data-testid", "sends");
  await expect(bay).toHaveCSS("min-width", "200px");
  expect(await bay.evaluate(element => element.style.getPropertyValue("--strata-patch-columns"))).toBe("3");
  await expect(page.getByRole("group", { name: "Sends" })).toBeVisible();
  await expect(page.locator("#send3")).toBeDisabled();
  await bay.evaluate(element => { element.disabled = true; });
  await expect(page.locator("#send1")).toBeDisabled();
  await bay.evaluate(element => { element.disabled = false; });

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
