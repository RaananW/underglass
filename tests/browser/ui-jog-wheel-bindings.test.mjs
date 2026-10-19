/**
 * Browser test of the JogWheel's React and Vue bindings (`ui-jog-wheel-react.html`, `ui-jog-wheel-vue.html`, `window.strataJogBinding`),
 * with no Underglass:
 * - each renders exactly the two markup examples on the anatomy page `jog-wheel.md`, compared as canonical DOM;
 * - a controlled wheel follows real drags, taps and keys through its state, and its state from outside, turning the wheel the shorter way;
 * - the angle (`--strata-jog-angle`) is kept by the behaviour: a re-render does not put it back (it survives wrapping past 99);
 * - an uncontrolled wheel keeps its own value and resets to `resetValue` on a double-click; the ref is the root, and `className`/`class`,
 *   `style` and other attributes reach it; `inputRef` (React) or the exposed `input` (Vue) is the input;
 * - `format` gives `aria-valuetext`; a vertical wheel that does not wrap stops at its end; a Field gives its description; `size` sizes the dial;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = [...readFileSync(new URL("../../docs/ui-library/components/jog-wheel.md", import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "jog-wheel:0": examples[0], "jog-wheel:1": examples[1] };
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const angle = (page, id) => page.locator(`#${id}`).evaluate(input => Number.parseFloat(input.closest(".ug-jog-wheel").style.getPropertyValue("--strata-jog-angle")));
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];

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
/** A circular drag about a wheel's centre at radius 40, from `from` to `to` degrees, held still a moment before the release (not a flick). */
async function circle(page, id, from, to) {
  const [cx, cy] = centre(await page.locator(`#${id}`).boundingBox()), at = degrees => [cx + 40 * Math.sin((degrees * Math.PI) / 180), cy - 40 * Math.cos((degrees * Math.PI) / 180)];
  await page.mouse.move(...at(from));
  await page.mouse.down();
  for (let step = 1; step <= 24; step++) await page.mouse.move(...at(from + ((to - from) * step) / 24));
  await page.waitForTimeout(150);
  await page.mouse.up();
}

for (const binding of ["react", "vue"]) test(`the ${binding} JogWheel renders its anatomy markup, works controlled and uncontrolled, keeps its angle across renders, and passes its props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-jog-wheel-${binding}.html`);
  await page.waitForFunction(() => window.strataJogBinding);
  await expectContracts(page);

  // Controlled: a real drag goes through the state (a quarter turn is 6 steps, 90 degrees); the state from outside turns the wheel the shorter way.
  const frame = page.locator("#frame");
  await expect(frame).toHaveRole("slider");
  await expect(frame).toHaveAccessibleName("Frame");
  await expect(frame).toHaveAttribute("aria-valuetext", "12 fr");
  expect(await angle(page, "frame")).toBe(180);
  await circle(page, "frame", 0, 90);
  expect(await page.evaluate(() => window.strataJogBinding.frame())).toBe(18);
  await expect(frame).toHaveAttribute("aria-valuetext", "18 fr");
  await expect(page.locator("#frame-read")).toHaveText("Frame 18 fr");
  expect(await angle(page, "frame"), "the angle follows the drag and a re-render leaves it alone").toBeCloseTo(270, 0);
  const changes = await page.evaluate(() => window.strataJogBinding.changes());
  expect(changes.slice(-6)).toEqual([13, 14, 15, 16, 17, 18]);
  // Keys: past the last value goes round, and the angle goes on.
  await frame.focus();
  await page.evaluate(() => window.strataJogBinding.setFrame(99));
  await expect(frame).toHaveValue("99");
  const before = await angle(page, "frame");
  expect(before, "from 18 to 99 is 19 steps back, the shorter way").toBeCloseTo(270 - 19 * 15, 0);
  await page.keyboard.press("ArrowUp");
  expect(await page.evaluate(() => window.strataJogBinding.frame())).toBe(0);
  expect(await angle(page, "frame")).toBe(before + 15);
  await page.keyboard.press("ArrowDown");
  expect(await page.evaluate(() => window.strataJogBinding.frame())).toBe(99);
  expect(await angle(page, "frame")).toBe(before);

  // Uncontrolled, with a ref, className/class, style and an attribute on the root; double-click resets to resetValue.
  const offset = page.locator("#offset");
  expect(await page.evaluate(() => {
    const { root, input } = window.strataJogBinding.refs;
    return { root: root === document.getElementById("offset").closest(".ug-jog-wheel"), input: input === document.getElementById("offset"), className: root.className, margin: root.style.marginRight, testid: root.dataset.testid };
  })).toEqual({ root: true, input: true, className: "ug-jog-wheel extra", margin: "4px", testid: "offset" });
  expect(await value(page, "offset")).toBe(10);
  const [ox, oy] = centre(await offset.boundingBox());
  await page.mouse.click(ox, oy - 30);
  expect(await value(page, "offset")).toBe(11);
  await page.mouse.dblclick(ox + 50, oy + 50);
  expect(await value(page, "offset"), "resetValue is 0").toBe(0);

  // Detented, with a format; a vertical wheel that does not wrap stops at its end; the Field's description; the size sets the dial.
  await expect(page.locator("#scrub")).toHaveAttribute("aria-valuetext", "Mark 3 of 11");
  await expect(page.locator(".ug-jog-wheel", { has: page.locator("#scrub") })).toHaveClass(/ug-jog-wheel--detented/);
  await page.locator("#scrub").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#scrub")).toHaveAttribute("aria-valuetext", "Mark 4 of 11");
  const [tx, ty] = centre(await page.locator("#tuner").boundingBox());
  await page.mouse.move(tx, ty);
  await page.mouse.down();
  await page.mouse.move(tx, ty - 200, { steps: 10 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  expect(await value(page, "tuner"), "no wrap: it stops at its end").toBe(12);
  await expect(page.locator("#tuner")).toHaveAttribute("aria-valuetext", "12 st");
  await page.locator("#tuner").focus();
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "tuner")).toBe(12);
  expect(await page.locator("#tuner").evaluate(input => input.hasAttribute("data-strata-wrap"))).toBe(false);
  const field = page.locator(".ug-field").filter({ hasText: "Turn to set the pitch." });
  await expect(field.locator(".ug-jog-wheel__input")).toHaveAccessibleDescription("Turn to set the pitch.");
  expect((await page.locator("section .ug-jog-wheel[data-strata-size='large'] .ug-jog-wheel__dial").boundingBox()).width).toBe(160);
  expect((await page.locator("section .ug-jog-wheel[data-strata-size='small'] .ug-jog-wheel__dial").boundingBox()).width).toBe(96);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
