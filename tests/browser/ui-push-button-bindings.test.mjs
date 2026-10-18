/**
 * Browser test of the push-button forms in the Button's and ToggleButton's React and Vue bindings (`ui-push-button-react.html`,
 * `ui-push-button-vue.html`, `window.strataPushBinding`), with no Underglass:
 * - each renders exactly the push-button examples on the anatomy pages `button.md` and `toggle-button.md` (their second markup
 *   blocks), compared as canonical DOM;
 * - a momentary Button is held while pressed and clicks once; `class`/`className`, `style`, `colour` and other attributes reach
 *   it, and the ref is the button;
 * - a controlled latching ToggleButton follows a real click and keys through its state, and its state from outside; an
 *   uncontrolled one keeps its own; a disabled one of each does nothing;
 * - a `form` that names no push form is the native form owner, on the plain Button;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "button.md#2": examples("button.md")[1], "toggle-button.md#2": examples("toggle-button.md")[1] };
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const pressed = (page, id) => page.locator(`#${id}`).getAttribute("aria-pressed");

/** Compares the binding's `[data-contract]` containers with the anatomy pages' push-button examples, as canonical DOM. */
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

for (const binding of ["react", "vue"]) test(`the ${binding} Button and ToggleButton render their push forms, work controlled and uncontrolled, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-push-button-${binding}.html`);
  await page.waitForFunction(() => window.strataPushBinding);
  await expectContracts(page);

  // A momentary Button: held while pressed (after the behaviour attaches on mount), one click, the props on the button.
  const talk = page.locator("#talk");
  await expect(talk).toHaveAccessibleName("Talk");
  expect(await page.evaluate(() => {
    const button = window.strataPushBinding.refs.talk;
    return { same: button === document.getElementById("talk"), className: button.className, margin: button.style.marginRight, testid: button.dataset.testid, form: button.dataset.strataForm, face: button.getAttribute("data-strata-face"), type: button.type };
  })).toEqual({ same: true, className: "ug-button ug-push extra", margin: "4px", testid: "talk", form: "momentary", face: null, type: "button" });
  const box = await talk.boundingBox();
  await page.mouse.move(...centre(box));
  await page.mouse.down();
  await expect(talk).toHaveAttribute("data-strata-down", "true");
  expect(await page.evaluate(() => window.strataPushBinding.clicks())).toEqual([]);
  await page.mouse.up();
  await expect(talk).toHaveAttribute("data-strata-down", "false");
  expect(await page.evaluate(() => window.strataPushBinding.clicks())).toEqual(["talk"]);
  await talk.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.strataPushBinding.clicks())).toEqual(["talk", "talk"]);
  // The variant still picks the cap's colour.
  await expect(page.locator("#go")).toHaveClass(/ug-button--accent/);
  const caps = await page.evaluate(() => ["talk", "go"].map(id => getComputedStyle(document.getElementById(id).querySelector(".ug-push__cap")).backgroundColor));
  expect(caps[1], "an accent button's cap is the accent's colour").not.toBe(caps[0]);

  // A controlled latching ToggleButton: a real click, keys and the state from outside.
  const mute = page.locator("#mute");
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await mute.click();
  expect(await page.evaluate(() => window.strataPushBinding.mute())).toBe(true);
  await expect(mute).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#mute-read")).toHaveText("Mute on");
  await mute.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.strataPushBinding.mute())).toBe(false);
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.strataPushBinding.mute())).toBe(true);
  expect(await page.evaluate(() => window.strataPushBinding.changes())).toEqual([true, false, true]);
  await page.evaluate(() => window.strataPushBinding.setMute(false));
  await expect(mute).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#mute-read")).toHaveText("Mute off");
  expect(await mute.evaluate(button => [button.dataset.strataForm, button.querySelectorAll(".ug-push__led").length])).toEqual(["latching", 1]);
  // Uncontrolled: starts pressed, keeps its own state, with the colour on the button.
  const phantom = page.locator("#phantom");
  await expect(phantom).toHaveAttribute("aria-pressed", "true");
  await expect(phantom).toHaveAttribute("data-strata-colour", "info");
  await phantom.click();
  expect(await pressed(page, "phantom")).toBe("false");
  // Disabled: nothing happens.
  await page.mouse.click(...centre(await page.locator("#locked").boundingBox()));
  expect(await page.evaluate(() => window.strataPushBinding.clicks().filter(id => id === "locked"))).toEqual([]);
  await page.mouse.click(...centre(await page.locator("#armed").boundingBox()));
  expect(await pressed(page, "armed")).toBe("true");
  await expect(page.locator("#armed")).toBeDisabled();

  // A `form` that names no push form is the native form owner, on the plain Button.
  const owned = page.locator("#owned");
  await expect(owned).toHaveAttribute("form", "settings");
  await expect(owned).toHaveAttribute("data-strata-face", "raised");
  await expect(owned).not.toHaveAttribute("data-strata-form", /.*/);
  await expect(owned.locator(".ug-push__object")).toHaveCount(0);
  await expect(page.locator("#plain")).toHaveAttribute("data-strata-face", "raised");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
