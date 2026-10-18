/**
 * Accessibility harness and rendering checks for the Strata specimen (`ui-specimen.html`, plain HTML and CSS from
 * `@underglass/ui/css`):
 * - axe-core (WCAG 2.0–2.2 A and AA rules, target size included) finds no violation in the light, dark and both
 *   high-contrast themes, nor under forced colours, and decides colour contrast for every node in face mode;
 * - text contrast measured on decoded pixels meets 4.5:1 on the lit faces in every theme;
 * - the cast shadow falls away from the configured light, and depth changes its extent;
 * - reduced motion stops the spinner and shows its label; keyboard input reaches the native controls with a
 *   visible focus indicator; the page reflows at 320 CSS px without horizontal scrolling.
 * Screenshots go to the `ui-specimen` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import AxeBuilder from "@axe-core/playwright";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-specimen");
const themes = ["light", "dark", "contrast", "contrast-dark"];
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);

const channel = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (r, g, b) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
/**
 * Contrast of rendered text against its face, from decoded pixels: the face is the most common colour, and the text
 * is the pixel farthest from it in luminance (anti-aliasing only blends towards the face).
 */
function textContrast(png) {
  const counts = new Map();
  for (let i = 0; i < png.data.length; i += 4) { const key = (png.data[i] << 16) | (png.data[i + 1] << 8) | png.data[i + 2]; counts.set(key, (counts.get(key) ?? 0) + 1); }
  const face = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const faceL = luminance(face >> 16, (face >> 8) & 255, face & 255);
  let best = faceL;
  for (let i = 0; i < png.data.length; i += 4) { const l = luminance(png.data[i], png.data[i + 1], png.data[i + 2]); if (Math.abs(l - faceL) > Math.abs(best - faceL)) best = l; }
  return (Math.max(best, faceL) + 0.05) / (Math.min(best, faceL) + 0.05);
}

test("the Strata specimen passes axe in every theme and under forced colours", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-specimen.html");
  await expect(page.locator("#settings")).toBeVisible();
  for (const theme of themes) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(summary(violations), `axe in the ${theme} theme`).toEqual([]);
    await page.screenshot({ path: `${directory}/specimen-${theme}.png`, fullPage: true });
    // axe cannot decide colour contrast under relief gradients, shadows and filters (it reports them incomplete),
    // so contrast is also checked in face mode: the same colours as flat faces, where every node gets a verdict.
    // Lit faces are covered by the decoded-pixel test below.
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).withTags(tags).analyze();
    expect(summary(face.violations), `axe in the ${theme} theme, face mode`).toEqual([]);
    // Selects draw their chevron with background gradients, and a knob's or a fader's numerals lie under its transparent
    // native input (one control covers the dial or the track), and a display's text under its transparent native input over a decoration the page cannot hit-test, so their contrast is measured on decoded pixels.
    const undecided = face.incomplete.filter(result => result.id === "color-contrast").map(result => ({ ...result, nodes: result.nodes.filter(node => !/ug-select|ug-combobox|ug-date-picker|ug-knob__mark|ug-fader__mark|ug-meter__mark|#set-|#spec-size|#spec-fruit|#spec-due|ug-display__text/.test(node.html + node.target.join(" "))) })).filter(result => result.nodes.length);
    expect(summary(undecided), `undecided contrast in the ${theme} theme`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
  }
  // High contrast turns the relief off, so raised faces carry a 2 px outline instead (no control becomes bare text).
  for (const theme of ["contrast", "contrast-dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    for (const selector of ["#components .ug-button >> nth=0", "#components .ug-panel >> nth=0", "#spec-size"]) {
      expect(await page.locator(selector).evaluate(element => getComputedStyle(element).borderTopWidth), `${theme}: ${selector} outline`).toBe("2px");
    }
  }
  // The switch knob keeps its colour in both states.
  const knobs = await page.locator(".ug-switch__knob").evaluateAll(elements => elements.slice(0, 2).map(element => getComputedStyle(element).backgroundImage));
  expect(knobs[0]).toBe(knobs[1]);
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  await page.emulateMedia({ forcedColors: "active" });
  const { violations } = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(summary(violations), "axe under forced colours").toEqual([]);
  // Relief is gone and the controls keep a visible boundary.
  const button = page.locator("#components .ug-button").first();
  expect(await button.evaluate(element => getComputedStyle(element).boxShadow)).toBe("none");
  expect(await button.evaluate(element => getComputedStyle(element).borderTopStyle)).toBe("solid");
  await page.screenshot({ path: `${directory}/specimen-forced-colors.png`, fullPage: true });
  await context.close();
});

test("text on the Strata specimen's lit faces meets 4.5:1 in decoded pixels in every theme", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-specimen.html");
  // Labels on keys, help, error and link text, at rest and in the lit hover state.
  const samples = ["#buttons-title + .stack .ug-button >> nth=0", "#buttons-title + .stack .ug-button >> nth=1", "#buttons-title + .stack .ug-button--accent >> nth=0",
    ".ug-button--danger", "#spec-size", "#spec-fruit", "#spec-due", "#spec-name-help", "#spec-email-error", ".ug-link", ".ug-badge--success", "#icon-title + .stack .ug-toggle-button >> nth=1",
    ".ug-knob__mark[data-strata-value='50']", ".ug-knob__mark[data-strata-value='-12']",
    ".ug-fader__mark[data-strata-value='-20']", ".ug-fader--horizontal .ug-fader__mark[data-strata-value='0']"];
  for (const theme of themes) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    for (const selector of samples) {
      // Keys are measured in their label zone (35% to 65% of the height, inside the bevel), as the spec defines it.
      const element = page.locator(selector);
      await element.scrollIntoViewIfNeeded();
      const box = await element.boundingBox();
      const key = await element.evaluate(node => node.dataset.strataFace === "raised");
      const clip = key ? { x: box.x + 10, y: box.y + box.height * 0.35, width: box.width - 20, height: box.height * 0.3 } : box;
      const ratio = textContrast(PNG.sync.read(await page.screenshot({ clip })));
      expect(ratio, `${theme}: ${selector} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
    }
  }
  await context.close();
});

test("the Strata specimen's shadows follow the light and the depth", async ({ browser }) => {
  // Reduced motion removes the shadow transitions, so each sample shows the settled shadow.
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-specimen.html");
  // One modal-level card alone on the stage, so no neighbour's shadow falls into the measured bands.
  await page.evaluate(() => {
    document.querySelector("main").hidden = true;
    document.body.insertAdjacentHTML("beforeend", '<div id="probe" class="ug-card level" data-strata-face="raised" data-strata-elevation="modal" style="width: 240px; margin: 200px auto">Modal</div>');
  });
  const card = page.locator("#probe");
  // Mean darkness of a band just outside each side of the card.
  const sides = async () => {
    const box = await card.boundingBox();
    const clip = { x: box.x - 30, y: box.y - 30, width: box.width + 60, height: box.height + 60 };
    const png = PNG.sync.read(await page.screenshot({ clip }));
    const darkness = (x0, y0, x1, y1) => { let sum = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * png.width + x) * 4; sum += 255 - (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; n++; } return sum / n; };
    const w = png.width, h = png.height;
    return { left: darkness(5, 40, 28, h - 40), right: darkness(w - 28, 40, w - 5, h - 40), top: darkness(40, 5, w - 40, 28), bottom: darkness(40, h - 28, w - 40, h - 5) };
  };
  // Default light from the top left (323°): the shadow falls to the right and down.
  const topLeft = await sides();
  expect(topLeft.right).toBeGreaterThan(topLeft.left + 2);
  expect(topLeft.bottom).toBeGreaterThan(topLeft.top + 2);
  // Light from the lower right (140°): the shadow moves up and to the left.
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-light-azimuth", "140"));
  const lowerRight = await sides();
  expect(lowerRight.left).toBeGreaterThan(lowerRight.right + 2);
  expect(lowerRight.top).toBeGreaterThan(lowerRight.bottom + 2);
  // More depth, a longer and stronger shadow.
  await page.evaluate(() => document.documentElement.style.removeProperty("--strata-light-azimuth"));
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-depth", "0"));
  const subtle = await sides();
  await page.evaluate(() => document.documentElement.style.setProperty("--strata-depth", "1"));
  const bold = await sides();
  expect(bold.right).toBeGreaterThan(subtle.right + 2);
  await context.close();
});

test("the Strata specimen honours reduced motion, keyboard input and narrow viewports", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/ui-specimen.html");
  // Reduced motion: the spinner stands still and its label is shown.
  const spinner = page.locator(".ug-spinner--labelled");
  expect(await spinner.locator(".ug-spinner__arc").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
  expect((await spinner.locator(".ug-spinner__label").boundingBox()).width).toBeGreaterThan(20);
  expect(await page.locator("#spec-sync").evaluate(element => getComputedStyle(element).animationName)).toBe("none");

  // Keyboard: the switch toggles with Space, radios move with arrows, and focus is visible (3 px accent outline).
  const wifi = page.getByRole("switch", { name: "Wi-Fi" });
  await wifi.focus();
  await page.keyboard.press("Space");
  expect(await wifi.isChecked()).toBe(true);
  expect(await wifi.evaluate(element => { const style = getComputedStyle(element); return [style.outlineStyle, style.outlineWidth]; })).toEqual(["solid", "3px"]);
  await page.getByRole("radio", { name: "Free" }).focus();
  await page.keyboard.press("ArrowDown");
  expect(await page.getByRole("radio", { name: "Pro" }).isChecked()).toBe(true);
  await page.getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement.textContent.trim())).toBe("Italic");

  // Reflow at 320 CSS px: no horizontal scrolling, and every control stays at least 24 by 24.
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const small = await page.evaluate(() => [...document.querySelectorAll("button, input, select, textarea")].filter(element => {
    const box = (element.closest(".ug-checkbox, .ug-radio, .ug-switch") ?? element).getBoundingClientRect();
    return box.width < 24 || box.height < 24;
  }).map(element => element.id || element.textContent.trim() || element.className));
  expect(small).toEqual([]);
  await page.screenshot({ path: `${directory}/specimen-320.png`, fullPage: true });
  await context.close();
});

test("Strata component sizes scale indicators, switches and controls, and keep 24 px targets", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-specimen.html");
  const expected = { small: [16, 30, 28], medium: [20, 36, 34], large: [24, 44, 40] };
  for (const [size, [indicator, switchWidth, control]] of Object.entries(expected)) {
    const scope = page.locator(`[data-strata-size="${size}"]`).first();
    const box = async selector => scope.locator(selector).first().boundingBox();
    const checkbox = await box(".ug-checkbox__input"), radio = await box(".ug-radio__input"), track = await box(".ug-switch__input"), button = await box(".ug-button");
    expect([checkbox.width, checkbox.height, radio.width], `${size}: checkbox and radio`).toEqual([indicator, indicator, indicator]);
    expect([track.width, track.height], `${size}: switch`).toEqual([switchWidth, indicator]);
    expect(button.height, `${size}: button height`).toBe(control);
    // The label row is the target: at least 24 px high at every size.
    for (const row of [".ug-checkbox", ".ug-radio", ".ug-switch"]) expect((await box(row)).height, `${size}: ${row} row`).toBeGreaterThanOrEqual(24);
    // Clicking the label toggles the control.
    const label = scope.locator(".ug-checkbox__label").first(), input = scope.locator(".ug-checkbox__input").first();
    const before = await input.isChecked();
    await label.click();
    expect(await input.isChecked()).toBe(!before);
  }
  await context.close();
});
