/**
 * Browser test of the latching forms in the Checkbox's, RadioGroup's and SegmentedControl's React and Vue bindings
 * (`ui-latching-forms-react.html`, `ui-latching-forms-vue.html`, `window.strataLatchBinding`), with no Underglass:
 * - each renders exactly the latching examples on the anatomy pages `checkbox.md`, `radio.md` and `segmented-control.md` (their
 *   second markup blocks), compared as canonical DOM;
 * - a controlled latching Checkbox follows a real click, a key and its state from outside, is held while pressed, and `class`/`className`,
 *   `style`, `colour`, other attributes and the ref reach the row and the input as before; an uncontrolled one keeps its own state; a mixed
 *   one clears on a click; a disabled one does nothing;
 * - a controlled preset bank and a controlled SegmentedControl follow clicks, arrow keys and their value from outside, with `colour` on
 *   their keys, and keep one key down;
 * - `form="flush"` and no `form` render the same DOM and the same pixels as the contract markup the controls had before the latching
 *   forms; a `form` that names no form is the native form owner, on the input (Checkbox) or the fieldset (RadioGroup);
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "checkbox.md#2": examples("checkbox.md")[1], "radio.md#2": examples("radio.md")[1], "segmented-control.md#2": examples("segmented-control.md")[1] };
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const checked = (page, id) => page.locator(`#${id}`).evaluate(input => input.checked);

/** Compares the binding's `[data-contract]` containers with the anatomy pages' latching examples, as canonical DOM. */
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

for (const binding of ["react", "vue"]) test(`the ${binding} Checkbox, RadioGroup and SegmentedControl render their latching forms, work controlled and uncontrolled, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-latching-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataLatchBinding);
  await expectContracts(page);

  // A controlled latching Checkbox: the props on the row and the input, a real click, the keys and the state from outside.
  const monitor = page.locator("#monitor");
  await expect(monitor).toHaveAccessibleName("Monitor");
  expect(await page.evaluate(() => {
    const input = window.strataLatchBinding.refs.monitor, row = input.closest("label"), host = input.parentElement;
    return { same: input === document.getElementById("monitor"), row: row.className, margin: row.style.marginRight, testid: input.dataset.testid, form: row.dataset.strataForm, face: input.getAttribute("data-strata-face"), type: input.type, host: host.className };
  })).toEqual({ same: true, row: "ug-checkbox extra", margin: "4px", testid: "monitor", form: "latching", face: null, type: "checkbox", host: "ug-push ug-latch ug-latch--key" });
  await expect(monitor).not.toBeChecked();
  const box = await monitor.boundingBox();
  await page.mouse.move(...centre(box));
  await page.mouse.down();
  await expect(monitor.locator("xpath=..")).toHaveAttribute("data-strata-down", "true");
  await page.mouse.up();
  await expect(monitor.locator("xpath=..")).toHaveAttribute("data-strata-down", "false");
  await expect(monitor).toBeChecked();
  expect(await page.evaluate(() => window.strataLatchBinding.monitor())).toBe(true);
  await expect(page.locator("#latch-read")).toHaveText("Monitor on, preset organ, range week");
  await monitor.focus();
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => window.strataLatchBinding.monitor())).toBe(false);
  expect(await page.evaluate(() => window.strataLatchBinding.changes())).toEqual(["monitor:true", "monitor:false"]);
  await page.evaluate(() => window.strataLatchBinding.setMonitor(true));
  await expect(monitor).toBeChecked();
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await monitor.evaluate(input => getComputedStyle(input.parentElement).getPropertyValue("--strata-led"))).toBe("1");
  await page.evaluate(() => window.strataLatchBinding.setMonitor(false));
  await expect(monitor).not.toBeChecked();
  // Uncontrolled: starts checked, keeps its own state, the colour on the key. Mixed: a click clears it. Disabled: nothing happens.
  const phantom = page.locator("#phantom");
  await expect(phantom).toBeChecked();
  await expect(phantom.locator("xpath=..")).toHaveAttribute("data-strata-colour", "info");
  await phantom.click();
  await expect(phantom).not.toBeChecked();
  await expect(page.locator("#mixed")).toHaveJSProperty("indeterminate", true);
  await page.locator("#mixed").click();
  expect(await page.locator("#mixed").evaluate(input => [input.indeterminate, input.checked])).toEqual([false, true]);
  await page.mouse.click(...centre(await page.locator("#locked").boundingBox()));
  await expect(page.locator("#locked")).not.toBeChecked();
  await page.mouse.click(...centre(await page.locator("#armed").boundingBox()));
  await expect(page.locator("#armed")).toBeChecked();
  await expect(page.locator("#armed")).toBeDisabled();

  // A controlled preset bank: clicks, arrow keys and the value from outside; one key down; the colour on every key.
  const group = page.getByRole("group", { name: "Preset" }).nth(0);
  await expect(page.locator("#r-organ")).toBeChecked();
  expect(await page.evaluate(() => ({ colours: [...document.querySelectorAll("section fieldset[data-strata-form=bank] .ug-latch")].map(host => host.dataset.strataColour), plinths: document.querySelectorAll("section fieldset[data-strata-form=bank] > .ug-bank__plinth").length, name: document.getElementById("r-organ").name }))).toEqual({ colours: ["success", "success", "success", "success"], plinths: 1, name: "preset-live" });
  await page.locator("#r-strings").click();
  expect(await page.evaluate(() => window.strataLatchBinding.preset())).toBe("strings");
  await expect(page.locator("#r-strings")).toBeChecked();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.strataLatchBinding.preset()), "the disabled key is skipped, and it wraps").toBe("piano");
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.strataLatchBinding.preset())).toBe("strings");
  await page.evaluate(() => window.strataLatchBinding.setPreset("organ"));
  await expect(page.locator("#r-organ")).toBeChecked();
  expect(await page.locator("section fieldset[data-strata-form=bank] input:checked").count(), "one at a time").toBe(1);
  await page.waitForFunction(() => !document.getAnimations().some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  expect(await page.evaluate(() => ["r-piano", "r-organ"].map(id => getComputedStyle(document.getElementById(id).parentElement).getPropertyValue("--strata-push-t")))).toEqual(["0", "0.45"]);
  expect(await page.evaluate(() => window.strataLatchBinding.changes().filter(change => change.startsWith("preset")))).toEqual(["preset:strings", "preset:piano", "preset:strings"]);
  void group;
  // A controlled latching SegmentedControl.
  await page.getByRole("radio", { name: "Day" }).last().click();
  expect(await page.evaluate(() => window.strataLatchBinding.range())).toBe("day");
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.strataLatchBinding.range())).toBe("week");
  await page.evaluate(() => window.strataLatchBinding.setRange("month"));
  await expect(page.getByRole("radio", { name: "Month" }).last()).toBeChecked();
  expect(await page.evaluate(() => document.querySelector("fieldset[data-strata-form=latching] .ug-segmented__plinth").className)).toBe("ug-segmented__plinth ug-bank__plinth");
  expect(await page.evaluate(() => window.strataLatchBinding.changes().filter(change => change.startsWith("range")))).toEqual(["range:day", "range:week"]);

  // A `form` that names no form is the native form owner: on the Checkbox's input and the RadioGroup's fieldset, with the plain markup.
  const owned = page.locator("#owned");
  await expect(owned).toHaveAttribute("form", "owner-form");
  await expect(owned).toHaveAttribute("data-strata-face", "well");
  expect(await owned.evaluate(input => [input.closest("label").hasAttribute("data-strata-form"), input.closest("label").querySelector(".ug-latch")])).toEqual([false, null]);
  const ownedBank = page.locator("#owned-a").locator("xpath=ancestor::fieldset");
  await expect(ownedBank).toHaveAttribute("form", "owner-form");
  await expect(ownedBank).not.toHaveAttribute("data-strata-form", /.*/);
  await expect(ownedBank.locator(".ug-bank__plinth")).toHaveCount(0);
  await expect(page.locator("#plain")).toHaveAttribute("data-strata-face", "well");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const binding of ["react", "vue"]) test(`the ${binding} controls with form="flush" and with no form are the controls as they were: the same DOM, and the same pixels as their contract markup`, async ({ browser }) => {
  const shots = {}, doms = {};
  for (const mode of ["plain", "flush", "legacy"]) {
    const context = await browser.newContext({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.addInitScript(canonicalScript);
    await page.goto(`/ui-latching-forms-${binding}.html?mode=${mode}`);
    await page.waitForSelector("#probe .ug-segmented");
    await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === "running"));
    await page.mouse.move(690, 690);
    shots[mode] = await page.locator("#probe").screenshot();
    doms[mode] = await page.evaluate(() => JSON.stringify(window.canonical(document.getElementById("probe"))));
    expect(await page.evaluate(() => document.querySelectorAll(".ug-latch, .ug-bank__plinth, [data-strata-form]").length), `${mode}: no latching markup`).toBe(0);
    expect(await page.locator("#probe").evaluate(probe => probe.getBoundingClientRect().height)).toBeGreaterThan(150);
    await context.close();
  }
  expect(doms.flush, "form=\"flush\" renders what no form renders").toBe(doms.plain);
  expect(Buffer.compare(shots.plain, shots.flush), "no form and flush are pixel-identical").toBe(0);
  expect(Buffer.compare(shots.legacy, shots.plain), "and pixel-identical to the contract markup the controls had before").toBe(0);
  console.log(`${binding}: flush, no form and the old contract markup are identical (${shots.plain.length} bytes of PNG)`);
});
