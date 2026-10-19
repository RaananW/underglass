/**
 * Browser test of the Pad and PadGrid in the React and Vue bindings (`ui-pad-react.html`, `ui-pad-vue.html`,
 * `window.strataPadBinding`), with no Underglass:
 * - each renders exactly the three markup examples on the anatomy page `pad.md` (a momentary pad, a latching pad, a grid of pads),
 *   compared as canonical DOM;
 * - a momentary pad is held while pressed and clicks once; `className`/`class`, `style`, `colour` and other attributes reach the button,
 *   the icon is decorative, and the ref is the button; the optional velocity reaches `onVelocity` (Vue: `velocity`);
 * - a controlled latching pad follows a real click and keys through its state, and its state from outside; an uncontrolled one keeps its
 *   own; a disabled one of each kind does nothing;
 * - the grid is a named group with its columns, its size reaching the pads, and the arrows move between its pads (one tab stop);
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = [...readFileSync(new URL("../../docs/ui-library/components/pad.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "pad.md": examples[0], "pad.md#2": examples[1], "pad.md#3": examples[2] };
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const pressed = (page, id) => page.locator(`#${id}`).getAttribute("aria-pressed");

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

for (const binding of ["react", "vue"]) test(`the ${binding} Pad and PadGrid render their markup, work controlled and uncontrolled, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-pad-${binding}.html`);
  await page.waitForFunction(() => window.strataPadBinding);
  await expectContracts(page);

  // A momentary Pad: held while pressed (after the behaviour attaches on mount), one click, the props on the button.
  const kick = page.locator("#kick");
  await expect(kick).toHaveAccessibleName("Kick");
  expect(await page.evaluate(() => {
    const button = window.strataPadBinding.refs.kick;
    return { same: button === document.getElementById("kick"), className: button.className, margin: button.style.marginRight, testid: button.dataset.testid, colour: button.dataset.strataColour, type: button.type, pressed: button.getAttribute("aria-pressed") };
  })).toEqual({ same: true, className: "ug-pad extra", margin: "4px", testid: "kick", colour: "danger", type: "button", pressed: null });
  const box = await kick.boundingBox();
  await page.mouse.move(...centre(box));
  await page.mouse.down();
  await expect(kick).toHaveAttribute("data-strata-down", "true");
  expect(await page.evaluate(() => window.strataPadBinding.clicks())).toEqual([]);
  await page.mouse.up();
  await expect(kick).toHaveAttribute("data-strata-down", "false");
  expect(await page.evaluate(() => window.strataPadBinding.clicks())).toEqual(["kick"]);
  await kick.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.strataPadBinding.clicks())).toEqual(["kick", "kick"]);
  // The velocity: where on the cap the press landed (the middle is 1), and the keys (1) — through the callback.
  await expect.poll(() => page.evaluate(() => window.strataPadBinding.velocities())).toEqual([[1, "position"], [1, "keyboard"]]);
  await expect(kick).toHaveAttribute("data-strata-velocity", "1");

  // The size reached the pads through the grid; the grid is a named group with its columns.
  const grid = page.getByRole("group", { name: "Rack" });
  await expect(grid).toHaveAttribute("style", "--strata-pad-columns: 3;");
  expect(await grid.evaluate(element => [element.className, element.getAttribute("data-strata-size"), getComputedStyle(element).gridTemplateColumns.split(" ").length])).toEqual(["ug-pad-grid extra", "small", 3]);
  expect(await kick.evaluate(button => button.getBoundingClientRect().width), "a small pad's box").toBe(66);
  // The icon is decorative: the name is the label.
  await expect(page.locator("#snare")).toHaveAccessibleName("Snare");
  await expect(page.locator("#snare .ug-pad__icon")).toHaveAttribute("aria-hidden", "true");

  // A controlled latching Pad: a real click, keys and the state from outside.
  const loop = page.locator("#loop");
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await loop.click();
  expect(await page.evaluate(() => window.strataPadBinding.loop())).toBe(true);
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#loop-read")).toHaveText("Loop on");
  await loop.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.strataPadBinding.loop())).toBe(false);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.strataPadBinding.loop())).toBe(true);
  expect(await page.evaluate(() => window.strataPadBinding.changes())).toEqual([true, false, true]);
  await page.evaluate(() => window.strataPadBinding.setLoop(false));
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#loop-read")).toHaveText("Loop off");
  // Uncontrolled: starts pressed, keeps its own state, with the colour on the button.
  const arm = page.locator("#arm");
  await expect(arm).toHaveAttribute("aria-pressed", "true");
  await expect(arm).toHaveAttribute("data-strata-colour", "info");
  await arm.click();
  expect(await pressed(page, "arm")).toBe("false");
  // Disabled: nothing happens.
  await page.mouse.click(...centre(await page.locator("#locked").boundingBox()));
  expect(await page.evaluate(() => window.strataPadBinding.clicks().filter(id => id === "locked"))).toEqual([]);
  await page.mouse.click(...centre(await page.locator("#armed-locked").boundingBox()));
  expect(await pressed(page, "armed-locked")).toBe("true");
  await expect(page.locator("#armed-locked")).toBeDisabled();
  await expect(page.locator("#locked")).not.toHaveAttribute("aria-pressed", /.*/);

  // The arrows move between the pads of the grid (one tab stop): the grid has three columns.
  await kick.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#snare")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#snare"), "the disabled pad below is skipped").toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await expect(arm).toBeFocused();
  expect(await page.evaluate(() => [...document.querySelectorAll("#rack .ug-pad")].filter(pad => pad.getAttribute("tabindex") === "0").map(pad => pad.id))).toEqual(["arm"]);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
