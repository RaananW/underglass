/**
 * Browser test of the indicator forms in the Rating's, Badge's, ProgressBar's and Spinner's React and Vue bindings
 * (`ui-indicator-forms-react.html`, `ui-indicator-forms-vue.html`, `window.strataIndicatorBinding`), with no Underglass:
 * - each renders exactly the indicator examples on the anatomy pages `rating.md`, `badge.md`, `progress-bar.md` and `spinner.md` (their second
 *   markup blocks), compared as canonical DOM;
 * - a controlled Rating with lamps follows a real click, the arrow keys and its value from outside, lights its lamps up to the score, and
 *   `class`/`className`, `style`, `colour`, other attributes and the ref reach the fieldset as before; a disabled one keeps its score; an
 *   uncontrolled one with a colour keeps its own state; a `form` that names no form is the native form owner;
 * - a Badge with `led` has its lens in the variant's colour (a count keeps its number), `flush` has none;
 * - a bar with `meter` keeps `<progress>` as the control (role, name, `value`, indeterminate), lights its segments from a changed `value`, takes its
 *   segment count and colour, and puts `class` and `style` on its wrapper and other attributes on the `<progress>`;
 * - a Spinner with `ring` is still a status named by its label, with eight lenses and its colour;
 * - `form="flush"` and no `form` render the same DOM and the same pixels as the contract markup the controls had before the indicator forms;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "rating.md#2": examples("rating.md")[1], "badge.md#2": examples("badge.md")[1], "progress-bar.md#2": examples("progress-bar.md")[1], "spinner.md#2": examples("spinner.md")[1] };
const lits = (page, selector) => page.locator(selector).evaluateAll(lenses => lenses.map(lens => Number(getComputedStyle(lens).getPropertyValue("--strata-lit"))));

/** Compares the binding's `[data-contract]` containers with the anatomy pages' indicator examples, as canonical DOM. */
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

for (const binding of ["react", "vue"]) test(`the ${binding} Rating, Badge, ProgressBar and Spinner render their indicator forms, follow their state, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-indicator-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataIndicatorBinding);
  await expectContracts(page);

  // A controlled Rating with lamps: the props on the fieldset, a real click, the keys and the score from outside.
  expect(await page.evaluate(() => {
    const fieldset = window.strataIndicatorBinding.refs.rating;
    return { same: fieldset === document.getElementById("rate"), tag: fieldset.tagName, className: fieldset.className, margin: fieldset.style.marginRight, testid: fieldset.dataset.testid, form: fieldset.dataset.strataForm, colour: fieldset.dataset.strataColour ?? null, name: fieldset.querySelector("input").name };
  })).toEqual({ same: true, tag: "FIELDSET", className: "ug-rating extra", margin: "4px", testid: "rate", form: "lamps", colour: null, name: "quality" });
  await expect(page.getByRole("group", { name: "Quality" })).toHaveCount(1);
  expect(await lits(page, "#rate .ug-rating__lens"), "3 of 5 lit").toEqual([1, 1, 1, 0, 0]);
  await page.locator("#rate input[value='5']").click();
  await page.mouse.move(2, 2);
  expect(await page.evaluate(() => window.strataIndicatorBinding.score())).toBe(5);
  expect(await lits(page, "#rate .ug-rating__lens")).toEqual([1, 1, 1, 1, 1]);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.strataIndicatorBinding.score())).toBe(3);
  expect(await lits(page, "#rate .ug-rating__lens")).toEqual([1, 1, 1, 0, 0]);
  await page.evaluate(() => window.strataIndicatorBinding.setScore(2));
  await expect(page.locator("#rate input[value='2']")).toBeChecked();
  expect(await lits(page, "#rate .ug-rating__lens")).toEqual([1, 1, 0, 0, 0]);
  await expect(page.locator("#ind-read")).toHaveText("Quality 2, upload 40");
  expect(await page.evaluate(() => window.strataIndicatorBinding.changes().filter(change => change.startsWith("rating"))), "a click and two keys report; a score from outside does not").toEqual(["rating:5", "rating:4", "rating:3"]);
  // Uncontrolled with a colour: keeps its own state, the colour on the fieldset. Disabled: keeps its score and does nothing.
  await expect(page.locator("#rate-free")).toHaveAttribute("data-strata-colour", "success");
  expect(await lits(page, "#rate-free .ug-rating__lens")).toEqual([1, 1, 0, 0, 0]);
  await page.locator("#rate-free input[value='4']").click();
  await page.mouse.move(2, 2);
  expect(await lits(page, "#rate-free .ug-rating__lens")).toEqual([1, 1, 1, 1, 0]);
  await expect(page.locator("#rate-off input[value='1']")).toBeDisabled();
  expect(await lits(page, "#rate-off .ug-rating__lens")).toEqual([1, 1, 1, 1, 0]);
  await page.locator("#rate-off input[value='1']").click({ force: true });
  expect(await lits(page, "#rate-off .ug-rating__lens"), "a disabled rating does not change").toEqual([1, 1, 1, 1, 0]);
  // A `form` that names no form is the native form owner on the fieldset, with the plain markup; no form is flush.
  const owned = page.locator("#rate-owned");
  await expect(owned).toHaveAttribute("form", "owner-form");
  await expect(owned).not.toHaveAttribute("data-strata-form", /.*/);
  await expect(owned.locator(".ug-rating__lens")).toHaveCount(0);
  await expect(page.locator("#rate-plain")).not.toHaveAttribute("data-strata-form", /.*/);

  // Badges: the lens in the variant's colour, a count keeps its number, flush has no lens, class and style reach the pill.
  expect(await page.evaluate(() => Object.fromEntries(["b-count", "b-ok", "b-big", "b-flush"].map(id => { const badge = document.getElementById(id), lens = badge.querySelector(".ug-badge__lens");
    return [id, { text: badge.textContent.trim(), form: badge.dataset.strataForm ?? null, lens: !!lens, lit: lens ? Number(getComputedStyle(lens).getPropertyValue("--strata-lit")) : null, className: badge.className, margin: badge.style.marginRight }]; })))).toEqual({
    "b-count": { text: "7", form: "led", lens: true, lit: 0, className: "ug-badge", margin: "" },
    "b-ok": { text: "Active", form: "led", lens: true, lit: 1, className: "ug-badge ug-badge--success extra", margin: "4px" },
    "b-big": { text: "99+ (120)", form: "led", lens: true, lit: 1, className: "ug-badge ug-badge--danger", margin: "" },
    "b-flush": { text: "Plain", form: null, lens: false, lit: null, className: "ug-badge ug-badge--info", margin: "" },
  });

  // A bar with `meter`: <progress> is the control; class and style on the wrapper, other attributes on the progress; the value lights the segments.
  const bar = page.locator("#p-live");
  await expect(bar).toHaveRole("progressbar");
  await expect(bar).toHaveAccessibleName("Upload");
  expect(await page.evaluate(() => { const progress = window.strataIndicatorBinding.refs.bar, wrapper = progress.parentElement; return { same: progress === document.getElementById("p-live"), tag: progress.tagName, testid: progress.dataset.testid, wrapper: wrapper.className, margin: wrapper.style.marginRight, form: wrapper.dataset.strataForm, colour: wrapper.dataset.strataColour, count: wrapper.querySelectorAll(".ug-progress__segment").length, value: wrapper.style.getPropertyValue("--strata-progress-value"), segments: wrapper.style.getPropertyValue("--strata-progress-count") }; }))
    .toEqual({ same: true, tag: "PROGRESS", testid: "bar", wrapper: "ug-progress-bar extra", margin: "4px", form: "meter", colour: "info", count: 10, value: "0.4", segments: "10" });
  const bars = () => lits(page, "#p-live ~ .ug-progress__object .ug-progress__segment");
  expect((await bars()).filter(lit => lit === 1).length, "40% of 10 segments: 4 lit").toBe(4);
  await page.evaluate(() => window.strataIndicatorBinding.setValue(80));
  await expect(page.locator("#ind-read")).toHaveText(/upload 80/);
  expect(await bar.evaluate(progress => progress.value)).toBe(80);
  expect((await bars()).filter(lit => lit === 1).length, "80%: 8 lit").toBe(8);
  expect(await bar.evaluate(progress => progress.parentElement.style.getPropertyValue("--strata-progress-value"))).toBe("0.8");
  await page.evaluate(() => window.strataIndicatorBinding.setValue(undefined));
  await expect.poll(() => bar.evaluate(progress => progress.hasAttribute("value"))).toBe(false);
  expect(await bar.evaluate(progress => progress.parentElement.style.getPropertyValue("--strata-progress-value")), "indeterminate: no value drawn").toBe("");
  expect((await bars()).filter(lit => lit === 1).length, "indeterminate under reduced motion: every other segment").toBe(5);
  await page.evaluate(() => window.strataIndicatorBinding.setValue(100));
  expect((await bars()).filter(lit => lit === 1).length, "100%: all lit").toBe(10);
  await expect(page.locator("#p-wait")).toHaveRole("progressbar");
  expect(await page.locator("#p-wait").evaluate(progress => [progress.hasAttribute("value"), progress.parentElement.querySelectorAll(".ug-progress__segment").length])).toEqual([false, 20]);
  await expect(page.locator("#p-plain")).toHaveAttribute("data-strata-face", "groove");
  expect(await page.locator("#p-plain").evaluate(progress => [progress.parentElement.className, progress.className])).not.toEqual(["ug-progress-bar", "ug-progress"]);

  // A Spinner with `ring`: a status named by its label, eight lenses, its colour; flush keeps its arc.
  const ring = page.locator("#s-ring");
  await expect(ring).toHaveRole("status");
  await expect(ring).toHaveText("Loading results");
  expect(await ring.evaluate(spinner => ({ className: spinner.className, form: spinner.dataset.strataForm, colour: spinner.dataset.strataColour, face: spinner.getAttribute("data-strata-face"), lenses: spinner.querySelectorAll(".ug-spinner__lens").length, arc: spinner.querySelectorAll(".ug-spinner__arc").length })))
    .toEqual({ className: "ug-spinner ug-spinner--md ug-spinner--labelled", form: "ring", colour: "warning", face: null, lenses: 8, arc: 0 });
  expect(await page.locator("#s-small").evaluate(spinner => [spinner.className, spinner.getBoundingClientRect().height])).toEqual(["ug-spinner ug-spinner--sm", 40]);
  expect(await page.locator("#s-flush").evaluate(spinner => [spinner.dataset.strataForm ?? null, spinner.getAttribute("data-strata-face"), spinner.querySelectorAll(".ug-spinner__arc").length])).toEqual([null, "ring", 1]);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const binding of ["react", "vue"]) test(`the ${binding} controls with form="flush" and with no form are the controls as they were: the same DOM, and the same pixels as their contract markup`, async ({ browser }) => {
  const shots = {}, doms = {};
  for (const mode of ["plain", "flush", "legacy"]) {
    const context = await browser.newContext({ viewport: { width: 700, height: 700 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.addInitScript(canonicalScript);
    await page.goto(`/ui-indicator-forms-${binding}.html?mode=${mode}`);
    await page.waitForSelector("#probe .ug-spinner");
    await page.waitForFunction(() => !document.getAnimations().some(animation => animation.playState === "running"));
    await page.mouse.move(690, 690);
    shots[mode] = await page.locator("#probe").screenshot();
    doms[mode] = await page.evaluate(() => JSON.stringify(window.canonical(document.getElementById("probe"))));
    expect(await page.evaluate(() => document.querySelectorAll("[data-strata-form], .ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress-bar, .ug-spinner__ring").length), `${mode}: no indicator-form markup`).toBe(0);
    expect(await page.locator("#probe").evaluate(probe => probe.getBoundingClientRect().height)).toBeGreaterThan(100);
    await context.close();
  }
  expect(doms.flush, "form=\"flush\" renders what no form renders").toBe(doms.plain);
  expect(Buffer.compare(shots.plain, shots.flush), "no form and flush are pixel-identical").toBe(0);
  expect(Buffer.compare(shots.legacy, shots.plain), "and pixel-identical to the contract markup the controls had before").toBe(0);
  console.log(`${binding}: flush, no form and the old contract markup are identical (${shots.plain.length} bytes of PNG)`);
});
