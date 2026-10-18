/**
 * Browser test of the Meter and the Gauge in the React and Vue bindings (`ui-meter-react.html`, `ui-meter-vue.html`,
 * `window.strataMeterBinding`), with no Underglass:
 * - each renders exactly the markup examples on the anatomy pages `meter.md` (a bar and a needle meter) and `gauge.md` (a
 *   dial), compared as canonical DOM;
 * - the native `<meter>` is the control: role `meter`, named by the legend, with the value, range and zones as attributes;
 *   a changed `value` prop moves the native meter, the drawing's `--strata-meter-value`, the lit segments and the unit's
 *   `aria-valuetext` (or the `format` function's);
 * - a bar with `peak` holds its highest segment; the ref is the root, `meterRef` the native meter; `className`/`class`,
 *   `style`, `size` and other attributes reach the root; a meter with no unit has no `aria-valuetext`;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const meter = examples("meter.md"), gauge = examples("gauge.md");
const contracts = { "meter:0": meter[0], "meter:1": meter[1], "gauge:0": gauge[0] };

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
/** How many of a meter's segments are lit now (the CSS's `--strata-lit`), and the held peak's index. */
const lit = (page, id) => page.locator(`#${id}`).evaluate(native => [...native.closest(".ug-meter").querySelectorAll(".ug-meter__segment")].filter(segment => Number(getComputedStyle(segment).getPropertyValue("--strata-lit")) >= 0.5).length);
const value = (page, id) => page.locator(`#${id}`).evaluate(native => ({ attribute: native.getAttribute("value"), property: native.value, text: native.getAttribute("aria-valuetext"), drawn: native.closest(".ug-meter").style.getPropertyValue("--strata-meter-value") }));

for (const binding of ["react", "vue"]) test(`the ${binding} Meter and Gauge render their markup, follow their value, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-meter-${binding}.html`);
  await page.waitForFunction(() => window.strataMeterBinding);
  await expectContracts(page);

  // The native meter is the control: role, name and attributes.
  const bar = page.locator("#bar");
  await expect(bar).toHaveRole("meter");
  await expect(bar).toHaveAccessibleName("Bar");
  await expect(page.locator("#needle")).toHaveRole("meter");
  await expect(page.locator("#dial")).toHaveRole("meter");
  await expect(page.locator("#dial")).toHaveAccessibleName("Dial");
  expect(await bar.evaluate(native => [native.min, native.max, native.low, native.high, native.optimum])).toEqual([0, 100, 70, 90, 0]);
  expect(await value(page, "bar")).toEqual({ attribute: "30", property: 30, text: "30 %", drawn: "0.3" });
  // 30% of 16 segments lights 5.
  expect(await lit(page, "bar")).toBe(5);
  expect(await value(page, "needle")).toEqual({ attribute: "30", property: 30, text: "30 of 100", drawn: "0.3" });
  expect(await value(page, "dial")).toEqual({ attribute: "30", property: 30, text: "30 bar", drawn: "0.3" });
  // A meter with no unit or format says only the number: no aria-valuetext.
  await expect(page.locator("#plain")).not.toHaveAttribute("aria-valuetext", /.*/);
  expect(await lit(page, "plain")).toBe(5);
  expect(await page.locator("#plain").evaluate(native => native.closest(".ug-meter").querySelectorAll(".ug-meter__segment").length)).toBe(10);

  // A changed value moves the native meter, the drawing and the value text; the peak holds.
  await page.locator("#raise").click();
  expect(await page.evaluate(() => window.strataMeterBinding.level())).toBe(80);
  expect(await value(page, "bar")).toEqual({ attribute: "80", property: 80, text: "80 %", drawn: "0.8" });
  expect(await value(page, "needle")).toEqual({ attribute: "80", property: 80, text: "80 of 100", drawn: "0.8" });
  expect(await value(page, "dial")).toEqual({ attribute: "80", property: 80, text: "80 bar", drawn: "0.8" });
  expect(await lit(page, "bar")).toBe(13);
  await page.locator("#lower").click();
  // The value fell to 10% (two segments) but the held peak at 80% is the 13th segment (index 12), still held, and so lit as well.
  expect(await page.locator("#bar").evaluate(native => native.closest(".ug-meter").style.getPropertyValue("--strata-meter-peak-index"))).toBe("12");
  expect(await lit(page, "bar"), "two by the value and the held peak").toBe(3);
  // It falls to the value within 0.6 s hold + 0.7 / 0.5 s.
  await expect(async () => expect(await page.locator("#bar").evaluate(native => native.closest(".ug-meter").style.getPropertyValue("--strata-meter-peak-index"))).toBe("1")).toPass({ timeout: 5000 });
  expect(await lit(page, "bar"), "the peak has fallen onto the value").toBe(2);

  // The root ref, the native meter's ref, class, style, size and other attributes.
  expect(await page.evaluate(() => [window.strataMeterBinding.refs.root.className.includes("ug-meter"), window.strataMeterBinding.refs.meter.id, window.strataMeterBinding.refs.meter.tagName, window.strataMeterBinding.refs.gauge.className.includes("ug-gauge")])).toEqual([true, "bar", "METER", true]);
  const root = page.locator(".ug-meter", { has: bar });
  await expect(root).toHaveClass(/extra/);
  await expect(root).toHaveClass(/ug-meter--peak/);
  await expect(root).toHaveCSS("margin-right", "4px");
  await expect(root).toHaveAttribute("data-testid", "bar");
  await expect(root).toHaveAttribute("data-strata-size", "small");
  expect(await root.locator(".ug-meter__segment").first().evaluate(segment => segment.getBoundingClientRect().width), "small: the segment lens is 8 px").toBe(8);
  await expect(page.locator(".ug-meter", { has: page.locator("#dial") })).toHaveAttribute("data-testid", "dial");
  await expect(page.locator(".ug-meter", { has: page.locator("#dial") })).toHaveClass(/ug-meter--dial/);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).exclude("[data-contract]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});
