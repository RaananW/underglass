/**
 * Browser test of the structural forms in the Slider's, Card's, Panel's, Dialog's and Drawer's React and Vue bindings
 * (`ui-structural-forms-react.html`, `ui-structural-forms-vue.html`, `window.strataStructureBinding`), with no Underglass:
 * - each renders exactly the form examples on the anatomy pages (`slider.md` second and third, `card.md` and `panel.md` second and third, `dialog.md` and
 *   `drawer.md` third), compared as canonical DOM;
 * - a controlled knob slider follows a real key, a real drag and its value from outside, reports each change once, and `className`/`class`, `style` and the
 *   other attributes reach the drawn root and the input as documented; an uncontrolled fader keeps its own state and its ref is the native input; a slider in a
 *   Field takes the Field's id and description; a `form` that names no form is the native form owner on the flush input; `flush` is the groove slider;
 * - plate and tray Cards and Panels render the documented markup and pass their ref, class, style and attributes to the root;
 * - the Dialog (a plate) and the Drawer (a tray) keep their modal contract (focus in, Escape, the scrim), carry `data-strata-form`, and hold working controls;
 * - `form="flush"` and no `form` render the same DOM and the same pixels as the contract markup the controls had before the forms;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { canonicalScript } from "../helpers/strata-contract.mjs";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const contracts = { "slider.md#2": examples("slider.md")[1], "slider.md#3": examples("slider.md")[2], "card.md#2": examples("card.md")[1], "card.md#3": examples("card.md")[2],
  "panel.md#2": examples("panel.md")[1], "panel.md#3": examples("panel.md")[2] };
const overlayContracts = { "dialog.md#3": examples("dialog.md")[2], "drawer.md#3": examples("drawer.md")[2] };

/** Compares the binding's `[data-contract]` containers with the anatomy pages' examples, as canonical DOM. */
async function expectContracts(page, which) {
  for (const [name, html] of Object.entries(which)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
}
const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));

for (const binding of ["react", "vue"]) test(`the ${binding} Slider, Card, Panel, Dialog and Drawer render their forms, follow their state, and pass their props through`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-structural-forms-${binding}.html`);
  await page.waitForFunction(() => window.strataStructureBinding);
  await expectContracts(page, contracts);

  // The Dialog's and the Drawer's examples, once opened into their containers.
  await page.evaluate(() => window.strataStructureBinding.contracts(true));
  await page.waitForFunction(() => document.querySelector('[data-contract="dialog.md#3"] .ug-dialog') && document.querySelector('[data-contract="drawer.md#3"] .ug-drawer') && !document.querySelector("[data-strata-motion]"));
  await expectContracts(page, overlayContracts);
  await page.evaluate(() => window.strataStructureBinding.contracts(false));
  await page.waitForFunction(() => !document.querySelector(".ug-dialog, .ug-drawer, .ug-scrim, [inert]"));

  // A controlled knob slider: real keys, a real drag and a value from outside; each change reported once; `unit` keeps the value text.
  const knob = page.locator("#drive");
  expect(await page.evaluate(() => { const input = document.getElementById("drive"), root = input.closest(".ug-knob"); return { form: root.dataset.strataForm, tag: input.tagName, className: input.className, rootClass: root.className, text: input.getAttribute("aria-valuetext"), name: input.name, label: input.getAttribute("aria-label") }; }))
    .toEqual({ form: "knob", tag: "INPUT", className: "ug-knob__input", rootClass: "ug-knob", text: "40%", name: "drive", label: "Drive" });
  await knob.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("PageUp");
  expect(await page.evaluate(() => window.strataStructureBinding.drive())).toBe(await value(page, "drive"));
  expect(await value(page, "drive")).toBeGreaterThan(41);
  await page.keyboard.press("Home");
  const box = await knob.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 8 });
  await page.mouse.up();
  expect(await value(page, "drive"), "a 60 px drag up is 30% of the range").toBe(30);
  expect(await page.evaluate(() => window.strataStructureBinding.drive())).toBe(30);
  await page.evaluate(() => window.strataStructureBinding.setDrive(80));
  await expect(page.locator("#drive-read")).toHaveText("Drive 80%");
  expect(await value(page, "drive")).toBe(80);
  expect(await page.evaluate(() => document.getElementById("drive").closest(".ug-knob").style.getPropertyValue("--strata-knob-value"))).toBe("0.8");
  expect(await page.evaluate(() => window.strataStructureBinding.changes().at(-1)), "the last reported change is the drag's end").toBe(30);

  // An uncontrolled fader: class and style on the root, the other attributes and the ref on the input; it keeps its own state.
  expect(await page.evaluate(() => {
    const input = window.strataStructureBinding.refs.fader, root = input.closest(".ug-fader");
    return { same: input === document.getElementById("trim"), root: root.className, margin: root.style.marginRight, form: root.dataset.strataForm, testid: input.dataset.testid ?? null, rootTestid: root.dataset.testid ?? null, label: input.getAttribute("aria-label"),
      text: input.getAttribute("aria-valuetext"), step: input.step, min: input.min, max: input.max, fader: root.querySelectorAll(".ug-fader__carriage, .ug-fader__slot").length, vertical: input.getAttribute("aria-orientation") };
  })).toEqual({ same: true, root: "ug-fader ug-fader--horizontal ug-fader--detented extra", margin: "4px", form: "fader", testid: "trim", rootTestid: null, label: "Trim", text: "0 dB", step: "6", min: "-12", max: "12", fader: 2, vertical: null });
  await page.locator("#trim").focus();
  await page.keyboard.press("End");
  expect(await value(page, "trim")).toBe(12);
  await expect(page.locator("#trim")).toHaveAttribute("aria-valuetext", "12 dB");
  expect(await page.evaluate(() => document.getElementById("trim").closest(".ug-fader").style.getPropertyValue("--strata-fader-value"))).toBe("1");
  // In a Field: the Field's description reaches the input (the Field's id and label); the size is the root's.
  expect(await page.evaluate(() => { const input = window.strataStructureBinding.refs.knob, field = input.closest(".ug-field"); return { id: input.id.startsWith("field-"), label: field.querySelector("label")?.getAttribute("for") === input.id, describedby: !!input.getAttribute("aria-describedby"), size: input.closest(".ug-knob").dataset.strataSize, value: input.value }; }))
    .toEqual({ id: true, label: true, describedby: true, size: "small", value: "3" });
  // A `form` that names no form is the native form owner, on the groove slider's input; `flush` is the groove slider too.
  const owned = page.locator("#owned");
  await expect(owned).toHaveAttribute("form", "owner");
  await expect(owned).toHaveAttribute("data-strata-face", "groove");
  await expect(owned).toHaveClass("ug-slider");
  await expect(page.locator("#owned").locator("xpath=..")).not.toHaveAttribute("data-strata-form", /.*/);
  expect(await page.evaluate(() => Object.fromEntries(new FormData(document.getElementById("owner"))))).toEqual({ owned: "5" });
  expect(await page.evaluate(() => { const input = document.getElementById("flat"); return [input.className, input.getAttribute("data-strata-face"), input.hasAttribute("form"), input.closest("[data-strata-form]") === null]; })).toEqual(["ug-slider", "groove", false, true]);

  // Cards and Panels: the forms' markup, and the props on the root.
  expect(await page.evaluate(() => {
    const card = window.strataStructureBinding.refs.card, panel = window.strataStructureBinding.refs.panel;
    return { card: [card === document.getElementById("card-plate"), card.tagName, card.className, card.style.marginRight, card.dataset.testid, card.dataset.strataForm, card.querySelector(".ug-card__body").dataset.strataFace ?? null],
      tray: [document.getElementById("card-tray").dataset.strataForm, document.querySelector("#card-tray .ug-card__body").dataset.strataFace], flush: [document.getElementById("card-flush").dataset.strataForm ?? null, document.querySelector("#card-flush .ug-card__body").dataset.strataFace ?? null],
      panel: [panel === document.getElementById("panel-plate"), panel.tagName, panel.className, panel.style.marginRight, panel.dataset.testid, panel.dataset.strataForm, panel.querySelectorAll(".ug-panel__tray").length],
      panelTray: [document.getElementById("panel-tray").dataset.strataForm, document.querySelectorAll("#panel-tray > .ug-panel__tray[data-strata-face='well']").length], panelFlush: [document.getElementById("panel-flush").dataset.strataForm ?? null, document.querySelectorAll("#panel-flush .ug-panel__tray").length] };
  })).toEqual({ card: [true, "ARTICLE", "ug-card extra", "4px", "card", "plate", null], tray: ["tray", "well"], flush: [null, null], panel: [true, "SECTION", "ug-panel extra", "4px", "panel", "plate", 0], panelTray: ["tray", 1], panelFlush: [null, 0] });

  // The Dialog (a plate) and the Drawer (a tray): the modal contract, the form, and working controls.
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.evaluate(() => window.strataStructureBinding.open("dialog"));
  await page.waitForFunction(() => document.activeElement?.closest("#dialog-plate"));
  expect(await page.evaluate(() => { const dialog = document.getElementById("dialog-plate"); return { form: dialog.dataset.strataForm, testid: dialog.dataset.testid, modal: dialog.getAttribute("aria-modal"), mainInert: document.getElementById("root").inert, inside: dialog.contains(document.activeElement), knob: !!dialog.querySelector(".ug-knob[data-strata-form='knob']") }; }))
    .toEqual({ form: "plate", testid: "dialog", modal: "true", mainInert: true, inside: true, knob: true });
  await page.locator("#dialog-level").focus();
  await page.keyboard.press("ArrowRight");
  expect(await value(page, "dialog-level")).toBe(5);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".ug-dialog"));
  await page.evaluate(() => window.strataStructureBinding.open("drawer"));
  await page.waitForFunction(() => document.activeElement?.closest("#drawer-tray"));
  expect(await page.evaluate(() => { const drawer = document.getElementById("drawer-tray"); return { form: drawer.dataset.strataForm, className: drawer.className, fader: !!drawer.querySelector(".ug-fader[data-strata-form='fader']"), body: drawer.querySelector(".ug-drawer__body").dataset.strataFace ?? null }; }))
    .toEqual({ form: "tray", className: "ug-panel ug-drawer ug-drawer--end", fader: true, body: null });
  await page.locator("#drawer-gain").focus();
  await page.keyboard.press("End");
  expect(await value(page, "drawer-gain")).toBe(10);
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => !document.querySelector(".ug-drawer"));

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
    await page.goto(`/ui-structural-forms-${binding}.html?mode=${mode}`);
    await page.waitForSelector("#probe .ug-panel");
    await page.mouse.move(690, 690);
    shots[mode] = await page.locator("#probe").screenshot();
    doms[mode] = await page.evaluate(() => JSON.stringify(window.canonical(document.getElementById("probe"))));
    expect(await page.evaluate(() => document.querySelectorAll("[data-strata-form], .ug-panel__tray, .ug-knob, .ug-fader").length), `${mode}: no structural-form markup`).toBe(0);
    expect(await page.locator("#probe").evaluate(probe => probe.getBoundingClientRect().height)).toBeGreaterThan(150);
    await context.close();
  }
  expect(doms.flush, "form=\"flush\" renders what no form renders").toBe(doms.plain);
  expect(Buffer.compare(shots.plain, shots.flush), "no form and flush are pixel-identical").toBe(0);
  expect(Buffer.compare(shots.legacy, shots.plain), "and pixel-identical to the contract markup the controls had before").toBe(0);
  console.log(`${binding}: flush, no form and the old contract markup are identical (${shots.plain.length} bytes of PNG)`);
});
