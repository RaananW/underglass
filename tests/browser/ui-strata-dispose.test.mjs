/**
 * Browser test of the document delegates' disposal (`ui-strata-dispose-react.html`, `ui-strata-dispose-vue.html`,
 * `window.strataDisposeProbe`): the Fader's and the Knob's blocking `wheel` listeners (and every other document-level listener a Strata
 * delegate adds) are on the document while a fader or knob is mounted, work with a real wheel, and are gone once the last one has
 * unmounted, however many times that repeats.
 *
 * A page cannot list its listeners, so an init script wraps `addEventListener` and `removeEventListener` and keeps the document's own
 * (type, capture, passive) as the browser would, and counts `document.elementFromPoint`, which the wheel listeners call on every wheel
 * event of the page. The React page runs in `StrictMode` on the Vite dev server, which mounts every effect twice.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";

/** Records the document's listeners as the DOM keeps them (a listener is added once per type, function and capture) and `elementFromPoint` calls. */
const instrument = () => {
  const entries = [];
  const capture = options => (typeof options === "boolean" ? options : !!options?.capture);
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (this === document && listener && !entries.some(entry => entry.type === type && entry.listener === listener && entry.capture === capture(options))) {
      entries.push({ type, listener, capture: capture(options), passive: typeof options === "object" && options !== null ? options.passive : undefined });
    }
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (this === document) {
      const at = entries.findIndex(entry => entry.type === type && entry.listener === listener && entry.capture === capture(options));
      if (at >= 0) entries.splice(at, 1);
    }
    return remove.call(this, type, listener, options);
  };
  const from = Document.prototype.elementFromPoint;
  window.elementFromPointCalls = 0;
  Document.prototype.elementFromPoint = function (...args) { window.elementFromPointCalls++; return from.apply(this, args); };
  window.documentListeners = () => entries.map(entry => `${entry.type}|${entry.capture ? "capture" : "bubble"}|${entry.passive === undefined ? "default" : entry.passive ? "passive" : "blocking"}`).sort();
  window.blockingWheelListeners = () => entries.filter(entry => entry.type === "wheel" && entry.passive === false).length;
  window.prevented = [];
  window.addEventListener("wheel", event => window.prevented.push(event.defaultPrevented), { passive: true });
};

const valueOf = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const centre = async locator => { const box = await locator.boundingBox(); return [box.x + box.width / 2, box.y + box.height / 2]; };

/** A real wheel over the centre of `locator`; resolves once the page has seen it. */
async function wheelOver(page, locator, deltaY) {
  const seen = await page.evaluate(() => window.prevented.length);
  await page.mouse.move(...await centre(locator));
  await page.mouse.wheel(0, deltaY);
  await page.waitForFunction(count => window.prevented.length > count, seen);
  return page.evaluate(() => window.prevented.at(-1));
}

/** The wheel over empty space: how many `elementFromPoint` calls it made (the blocking listeners make one each). */
async function emptyWheelCalls(page) {
  const before = await page.evaluate(() => [window.elementFromPointCalls, window.prevented.length]);
  await page.mouse.move(40, 400);
  await page.mouse.wheel(0, 60);
  await page.waitForFunction(count => window.prevented.length > count, before[1]);
  return (await page.evaluate(() => window.elementFromPointCalls)) - before[0];
}

const pages = [
  { name: "react", url: "/ui-strata-dispose-react.html" },
  { name: "react in StrictMode (dev server)", url: `${developmentURL}/ui-strata-dispose-react.html?strict` },
  { name: "vue", url: "/ui-strata-dispose-vue.html" },
];

for (const { name, url } of pages) test(`${name}: the delegates' document listeners go with the last control, and come back with the next`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(instrument);
  await page.goto(url);
  await page.waitForFunction(() => window.strataDisposeProbe);
  const set = (faders, knobs) => page.evaluate(([f, k]) => window.strataDisposeProbe.set(f, k), [faders, knobs]);
  const listeners = () => page.evaluate(() => window.documentListeners());
  const blocking = () => page.evaluate(() => window.blockingWheelListeners());

  // Before any control: the page's own listeners only. They are the baseline every full release returns to.
  const baseline = await listeners();
  expect(await blocking()).toBe(0);
  expect(await emptyWheelCalls(page), "no control: nothing looks up the element under the wheel").toBe(0);

  for (let round = 1; round <= 3; round++) {
    // A fader mounts: the delegates are on the document, and a real wheel over it changes its value.
    await set(1, 0);
    expect(await blocking(), `round ${round}: one blocking wheel listener`).toBe(1);
    expect((await listeners()).length, "its listeners are on the document").toBeGreaterThan(baseline.length);
    expect(await emptyWheelCalls(page), "while mounted, the wheel looks up the element under it").toBeGreaterThan(0);
    const before = await valueOf(page, "fader-0");
    expect(await wheelOver(page, page.locator("#fader-0").locator("xpath=ancestor::*[contains(@class, 'ug-fader')]").locator(".ug-fader__track"), -120), "a wheel over a fader is the fader's").toBe(true);
    expect(await valueOf(page, "fader-0"), "a real wheel raised the value").toBeGreaterThan(before);

    // A second fader mounts and unmounts: the first still has its listeners.
    await set(2, 0);
    expect(await blocking()).toBe(1);
    await set(1, 0);
    expect(await blocking(), "one fader is left, its listener stays").toBe(1);
    const again = await valueOf(page, "fader-0");
    await wheelOver(page, page.locator("#fader-0").locator("xpath=ancestor::*[contains(@class, 'ug-fader')]").locator(".ug-fader__track"), -120);
    expect(await valueOf(page, "fader-0")).toBeGreaterThan(again);

    // The last fader unmounts: nothing of the delegates is left on the document, and the wheel is nobody's.
    await set(0, 0);
    expect(await blocking(), `round ${round}: no blocking wheel listener after the last fader`).toBe(0);
    expect(await listeners(), "the document's listeners are what they were before the first control").toEqual(baseline);
    expect(await emptyWheelCalls(page), "the wheel no longer looks up the element under it").toBe(0);
  }

  // A knob and a fader are separate delegates: the fader unmounting leaves the knob's wheel listener, the knob unmounting then leaves none.
  await set(1, 1);
  expect(await blocking(), "a fader's and a knob's").toBe(2);
  await set(0, 1);
  expect(await blocking(), "the knob's stays").toBe(1);
  const knob = await valueOf(page, "knob-0");
  await wheelOver(page, page.locator("#knob-0").locator("xpath=ancestor::*[contains(@class, 'ug-knob')]").locator(".ug-knob__dial"), -120);
  expect(await valueOf(page, "knob-0"), "a real wheel raised the knob").toBeGreaterThan(knob);
  await set(0, 0);
  expect(await blocking()).toBe(0);
  expect(await listeners()).toEqual(baseline);

  expect(errors).toEqual([]);
  await context.close();
});
