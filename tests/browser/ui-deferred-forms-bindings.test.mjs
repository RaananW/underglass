/**
 * Browser test of the deferred forms' React and Vue bindings (`ui-deferred-forms-react.html`, `ui-deferred-forms-vue.html`, `window.strataDeferredBinding`), with no
 * Underglass: the Slider's `wheel`, the RadioGroup's `selector` and the Display's `segments`.
 * - each renders exactly the markup examples of the anatomy pages (`slider.md` the wheel, `radio.md` the selector, `display.md` the segments, section 11), compared
 *   as canonical DOM;
 * - a controlled wheel follows real keys and a real drag along its slot through its state, and its state from outside; an uncontrolled one keeps its own value; the ref
 *   is the input, `className`/`class`, `style`, `travel` and `sweep` reach the drawn root, a flush slider and a disabled wheel are what they were;
 * - the documented rule for a selector: nine radios, a long label and radios a component renders are drawn as a bank; one radio of each kind a form owner or flush is
 *   the group of before; a controlled selector follows real label clicks, keys, a tap on its cap and its state from outside, an uncontrolled one keeps its own value;
 * - the segments displays carry the attribute (Display and TextField); the display without it does not;
 * - `?mode=plain|flush|legacy`: a Slider, a RadioGroup and a Display with no form, with the flush form (and `segments={false}`) and as the markup of before render the same pixels;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";
import { PNG } from "pngjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const page_ = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "slider.md#wheel": page_("slider.md")[3], "radio.md#selector": page_("radio.md")[2], "display.md#segments": page_("display.md")[3] };
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
const checked = (page, id) => page.locator(`#${id} .ug-rotary__radio`).evaluateAll(radios => radios.find(radio => radio.checked)?.value ?? null);
/** The centre of a radio's printed label in a selector group. */
const label = async (page, id, text) => centre(await page.locator(`#${id} .ug-rotary__text`).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox());

for (const binding of ["react", "vue"]) test(`the ${binding} deferred forms render their anatomy markup, apply the documented rule, work controlled and uncontrolled, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-deferred-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataDeferredBinding);
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([name, html]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = html;
      return [window.canonical(document.querySelector(`[data-contract="${name}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }

  // The wheel: a native range input with the Field's name; keys, a real drag along the slot and the state.
  const gain = page.locator("#gain");
  await expect(gain).toHaveRole("slider");
  await expect(gain).toHaveAccessibleName("Gain");
  await expect(gain).toHaveAttribute("aria-valuetext", "40 dB");
  expect(await page.evaluate(() => document.getElementById("gain").closest("[data-strata-form]").dataset.strataForm)).toBe("wheel");
  await gain.focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => window.strataDeferredBinding.gain())).toBe(41);
  await expect(page.locator("#gain-read")).toHaveText("Gain 41");
  await expect(gain).toHaveAttribute("aria-valuetext", "41 dB");
  await page.keyboard.press("End");
  expect(await page.evaluate(() => window.strataDeferredBinding.gain())).toBe(100);
  // A click on the slot sets the value under the pointer: the middle of the slot is half way.
  const slot = await page.locator(".ug-fader:has(#gain) .ug-fader__slot").boundingBox();
  await page.mouse.click(slot.x + slot.width / 2, slot.y + slot.height / 2 + 0.5);
  expect(Math.abs((await page.evaluate(() => window.strataDeferredBinding.gain())) - 50)).toBeLessThanOrEqual(2);
  // A drag along the slot: the roller stays where it is, the value follows the pointer.
  const before = await page.evaluate(() => window.strataDeferredBinding.gain());
  await page.mouse.move(slot.x + slot.width / 2, slot.y + 2);
  await page.mouse.down();
  await page.mouse.move(slot.x + slot.width / 2 + 24, slot.y + 2, { steps: 6 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.strataDeferredBinding.gain())).toBeGreaterThan(before + 20);
  const roller = await page.locator(".ug-fader:has(#gain) .ug-fader__wheel").boundingBox(), track = await page.locator(".ug-fader:has(#gain) .ug-fader__track").boundingBox();
  expect(Math.abs(roller.x + roller.width / 2 - (track.x + track.width / 2)), "the roller stays at the middle of the slot").toBeLessThanOrEqual(0.5);
  await page.evaluate(() => window.strataDeferredBinding.setGain(10));
  await expect.poll(() => value(page, "gain")).toBe(10);
  await expect.poll(() => gain.evaluate(input => input.closest(".ug-fader").style.getPropertyValue("--strata-fader-value"))).toBe("0.1");
  expect((await page.evaluate(() => window.strataDeferredBinding.changes())).filter(entry => entry.startsWith("gain")).slice(0, 2)).toEqual(["gain 41", "gain 100"]);
  // Uncontrolled: the ref is the input; class, style, travel, sweep and attributes reach the drawn root.
  expect(await page.evaluate(() => {
    const input = window.strataDeferredBinding.refs.pan, root = input.closest(".ug-fader");
    return { input: input === document.getElementById("pan"), className: root.className, margin: root.style.marginRight, travel: root.style.getPropertyValue("--strata-wheel-travel"), sweep: root.style.getPropertyValue("--strata-wheel-sweep"),
      testid: input.dataset.testid ?? root.dataset.testid, name: input.name, value: input.value, marks: root.querySelectorAll(".ug-fader__mark").length };
  })).toEqual({ input: true, className: "ug-fader ug-fader--horizontal ug-fader--wheel extra", margin: "4px", travel: "80px", sweep: "120", testid: "pan", name: "pan", value: "75", marks: 5 });
  // The roller's slot is the travel (80), plus 3 px each end, in the box of 80 + 48.
  expect(await page.locator(".ug-fader:has(#pan) .ug-fader__slot").evaluate(slot => slot.getBoundingClientRect().width)).toBe(86);
  await expect(page.locator("#locked")).toBeDisabled();
  expect(await page.locator("#flat").evaluate(input => [input.className, input.getAttribute("data-strata-face")])).toEqual(["ug-slider", "groove"]);

  // The rule: what each group is drawn as.
  expect(await page.evaluate(() => ["mode", "free", "route", "long", "custom", "locked-group", "small", "bad", "flat-group", "owned"].map(id => [id, document.getElementById(id).dataset.strataForm ?? null])))
    .toEqual([["mode", "selector"], ["free", "selector"], ["route", "bank"], ["long", "bank"], ["custom", "bank"], ["locked-group", "selector"], ["small", "selector"], ["bad", "selector"], ["flat-group", null], ["owned", null]]);
  // A controlled selector: a real label click and a key go through the state; the state from outside moves the dial.
  expect(await checked(page, "mode")).toBe("solo");
  await page.mouse.click(...await label(page, "mode", "Mute"));
  expect(await page.evaluate(() => window.strataDeferredBinding.mode())).toBe("mute");
  expect(await checked(page, "mode")).toBe("mute");
  await page.getByRole("group", { name: "Mode", exact: true }).getByRole("radio", { name: "Mute" }).focus();
  await page.keyboard.press("ArrowLeft");
  expect(await page.evaluate(() => window.strataDeferredBinding.mode())).toBe("solo");
  expect((await page.evaluate(() => window.strataDeferredBinding.changes())).filter(entry => entry.startsWith("mode"))).toEqual(["mode mute", "mode solo"]);
  await page.evaluate(() => window.strataDeferredBinding.setMode("bypass"));
  await expect.poll(() => checked(page, "mode")).toBe("bypass");
  await expect.poll(() => page.locator("#mode .ug-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("1");
  // A tap on the cap steps: the upper half to the next radio (a clamp at the end), the lower half back.
  const cap = await page.locator("#mode .ug-rotary__cap").boundingBox();
  await page.mouse.click(cap.x + cap.width / 2, cap.y + cap.height * 0.8);
  expect(await checked(page, "mode")).toBe("mute");
  await page.mouse.click(cap.x + cap.width / 2, cap.y + cap.height * 0.2);
  expect(await checked(page, "mode")).toBe("bypass");
  // Uncontrolled: the group keeps its own value and the dial follows it; class, style and an attribute reach the fieldset.
  expect(await checked(page, "free")).toBe("mute");
  await page.mouse.click(...await label(page, "free", "Mix"));
  expect(await checked(page, "free")).toBe("mix");
  await expect.poll(() => page.locator("#free .ug-rotary").evaluate(root => root.style.getPropertyValue("--strata-rotary-value"))).toBe("0");
  expect(await page.evaluate(() => { const group = document.getElementById("free"); return [group.className, group.style.marginRight, group.dataset.testid]; })).toEqual(["ug-radio-group extra", "4px", "free"]);
  // The Field's help, an error, the disabled fieldset, the size.
  await expect(page.getByRole("group", { name: "Free" })).toHaveAccessibleDescription("Pick one.");
  expect(await page.locator("#bad .ug-rotary__radio").evaluateAll(radios => radios.every(radio => radio.getAttribute("aria-invalid") === "true"))).toBe(true);
  expect(await page.locator("#locked-group .ug-rotary__radio").evaluateAll(radios => radios.every(radio => radio.matches(":disabled")))).toBe(true);
  expect(await page.locator("#small .ug-rotary__skirt").evaluate(skirt => skirt.getBoundingClientRect().width)).toBe(48);
  // The group a form owner names, and the flush group: radios of before.
  await expect(page.locator("#owned")).toHaveAttribute("form", "owner-form");
  for (const id of ["owned", "flat-group"]) expect(await page.locator(`#${id} input`).first().evaluate(input => [input.className, input.getAttribute("data-strata-face")]), id).toEqual(["ug-radio__input", "well"]);
  // The accessibility tree: the fieldset is the group, each label its radio; the dial is hidden.
  await expect(page.getByRole("group", { name: "Mode", exact: true })).toBeVisible();
  expect(await page.locator("#mode .ug-rotary__radio").evaluateAll(radios => radios.map(radio => radio.labels[0].textContent.trim()))).toEqual(["Mix", "Solo", "Mute", "Bypass"]);
  expect(await page.evaluate(() => [...document.querySelectorAll("#mode .ug-rotary__skirt, #mode .ug-rotary__legend, #mode .ug-rotary__tick")].every(element => element.closest("[aria-hidden='true']") !== null))).toBe(true);

  // The segments displays.
  expect(await page.evaluate(() => ["clock", "readout", "freq", "plainout"].map(id => document.getElementById(id).closest(".ug-display").dataset.strataSegments ?? null))).toEqual(["seven", "seven", "seven", null]);
  expect(await page.evaluate(() => document.getElementById("readout").closest(".ug-display").dataset.strataBacklight)).toBe("warning");
  await expect(page.locator("#clock")).toHaveText("12:34");
  await expect(page.locator("#readout")).toHaveAttribute("aria-live", "off");
  await expect(page.getByRole("textbox", { name: "Frequency" })).toHaveValue("440.0");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).include("main").exclude("[hidden]").withTags(tags).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`), `axe, ${theme}`).toEqual([]);
  }
  expect(errors).toEqual([]);
  await context.close();
});

for (const binding of ["react", "vue"]) test(`the ${binding} flush Slider, RadioGroup and Display are the markup and the pixels of before: no form, the flush form and the legacy markup agree`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const shots = {};
  for (const mode of ["plain", "flush", "legacy"]) {
    await page.goto(`/ui-deferred-forms-${binding}.html?mode=${mode}`);
    await page.waitForFunction(() => document.getElementById("legacy-slider") && document.getElementById("legacy-display"));
    await page.waitForTimeout(250);
    shots[mode] = PNG.sync.read(await page.locator("main > .ug-panel").screenshot());
  }
  for (const mode of ["flush", "legacy"]) {
    expect(shots[mode].width).toBe(shots.plain.width);
    expect(Buffer.compare(shots[mode].data, shots.plain.data), `${mode} is pixel-identical to the unformed controls`).toBe(0);
  }
  await context.close();
});
