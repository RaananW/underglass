/**
 * Browser test of the opt-in feedback (`dom/feedback.ts`, design language section 20) on `ui-switch-forms.html?plain`,
 * with `AudioContext` and `navigator.vibrate` wrapped to count what the page creates, plays and pulses:
 * - off by default: real throws create no `AudioContext`, play nothing and pulse nothing;
 * - sound on (`?sound`): nothing exists until a gesture; a scripted throw creates nothing; the first real gesture on a
 *   form creates and resumes the context and its throw plays the snap, and later throws reuse the one context;
 * - haptics on (`?haptics`): a real throw pulses 12 ms, a scripted one does not, and reduced motion stops pulses;
 * - muted (`?sound&haptics&muted`): silent and still, with no context;
 * - per scope: the `feedback.sound` token on one form turns sound on for it alone;
 * - the native event path is unchanged: each throw still fires one `input` and one `change`.
 */
import { test, expect } from "../helpers/current-browser.mjs";

/** Wraps the audio and vibration APIs, counting contexts, resumes, sources started and pulses. */
const instrument = () => {
  window.feedbackLog = { contexts: 0, resumes: 0, played: 0, pulses: [] };
  const Real = window.AudioContext;
  window.AudioContext = class extends Real {
    constructor(...args) { super(...args); window.feedbackLog.contexts++; }
    resume() { window.feedbackLog.resumes++; return super.resume(); }
    createBufferSource() {
      const source = super.createBufferSource(), start = source.start.bind(source);
      source.start = (...args) => { window.feedbackLog.played++; return start(...args); };
      return source;
    }
  };
  Object.defineProperty(Navigator.prototype, "vibrate", { configurable: true, value: pattern => { window.feedbackLog.pulses.push(pattern); return true; } });
};
async function open(browser, query, options = {}) {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, ...options });
  const page = await context.newPage();
  await page.addInitScript(instrument);
  await page.goto(`/ui-switch-forms.html?plain${query}`);
  await page.waitForFunction(() => window.strataSwitchProbe);
  return { context, page };
}
const log = page => page.evaluate(() => ({ ...window.feedbackLog, pulses: [...window.feedbackLog.pulses] }));
const click = async (page, id) => { const box = await page.locator(`#${id}`).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(60); };
const changes = page => page.evaluate(() => window.strataSwitchProbe.events().filter(event => event.type === "change").length);

test("feedback is off by default: real throws create no audio, play nothing and pulse nothing", async ({ browser }) => {
  const { context, page } = await open(browser, "");
  for (const id of ["slide-off", "rocker-off", "bat-off", "wall-off"]) await click(page, id);
  await page.locator("#wall-on").focus();
  await page.keyboard.press("Space");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  expect(await changes(page)).toBe(5);
  console.log("off by default: 5 throws, 0 audio contexts, 0 sounds, 0 pulses");
  await context.close();
});

test("with sound on, audio waits for the visitor's first gesture on a form, then each throw plays its snap", async ({ browser }) => {
  const { context, page } = await open(browser, "&sound");
  expect((await log(page)).contexts, "nothing before a gesture").toBe(0);
  // A scripted throw is no gesture: nothing is created.
  await page.locator("#slide-off").evaluate(input => input.click());
  await page.waitForTimeout(60);
  expect(await log(page)).toMatchObject({ contexts: 0, played: 0 });
  // A gesture elsewhere on the page is not a gesture on a control.
  await page.mouse.click(5, 5);
  expect((await log(page)).contexts).toBe(0);
  await click(page, "rocker-off");
  const first = await log(page);
  expect(first.contexts, "created on the first gesture on a form").toBe(1);
  expect(first.played, "the throw's snap").toBe(1);
  expect(await page.evaluate(() => window.strataSwitchProbe.feedback.context()?.state)).toBe("running");
  await click(page, "bat-off");
  await page.locator("#wall-off").focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(60);
  const after = await log(page);
  expect(after).toMatchObject({ contexts: 1, played: 3 });
  expect(after.pulses).toEqual([]);
  expect(await changes(page)).toBe(4);
  console.log(`sound on: 0 contexts before a gesture, 1 after; ${after.played} snaps for 3 real throws; 0 pulses`);
  await context.close();
});

test("with haptics on, a real throw pulses, a scripted one does not, and reduced motion stops the pulses", async ({ browser }) => {
  const { context, page } = await open(browser, "&haptics");
  await click(page, "slide-off");
  await page.locator("#rocker-off").evaluate(input => input.click());
  await page.waitForTimeout(1100);
  await page.locator("#rocker-off").evaluate(input => input.click());
  await page.locator("#bat-off").focus();
  await page.keyboard.press("Space");
  expect(await log(page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [12, 12] });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await click(page, "wall-off");
  expect((await log(page)).pulses).toEqual([12, 12]);
  expect(await page.locator("#wall-off").isChecked()).toBe(true);
  console.log("haptics on: 2 pulses of 12 ms for 2 real throws, none for 2 scripted ones, none under reduced motion");
  await context.close();
});

test("muted stays silent and still, and a scope's feedback.sound token turns sound on for its forms alone", async ({ browser }) => {
  const muted = await open(browser, "&sound&haptics&muted");
  for (const id of ["slide-off", "rocker-off", "bat-off"]) await click(muted.page, id);
  expect(await log(muted.page)).toEqual({ contexts: 0, resumes: 0, played: 0, pulses: [] });
  expect(await changes(muted.page)).toBe(3);
  await muted.context.close();

  const { context, page } = await open(browser, "");
  await page.locator(".ug-switch", { has: page.locator("#rocker-off") }).evaluate(row => row.style.setProperty("--strata-feedback-sound", "1"));
  await click(page, "slide-off");
  expect((await log(page)).contexts, "no sound on the slide").toBe(0);
  await click(page, "rocker-off");
  await click(page, "bat-off");
  expect(await log(page)).toMatchObject({ contexts: 1, played: 1, pulses: [] });
  console.log("muted: 0 contexts, 0 sounds, 0 pulses; scoped token: 1 snap, on the scoped rocker only");
  await context.close();
});
