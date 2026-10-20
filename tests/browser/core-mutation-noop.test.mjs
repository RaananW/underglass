/**
 * Core's no-op mutation rule (issue #181) on `core-mutation-noop.html` (`window.mutationNoop`): a mutation record whose old and
 * new values are equal (a same-value `setAttribute`, a same-value `Text.data` write) is ignored by the mutation observer and
 * counted (`metrics.mutationsIgnored`), so writing the same value every frame recaptures nothing. At DPR 1 and 2, decoded pixels:
 * - 300 frames of a same-value attribute, `style` and `class` write and of a same-value text write: 0 captures, 0 uploads, every
 *   record counted, pixels unchanged;
 * - a real change (style, class, text, an attribute added or removed) is captured within a frame or two with fresh pixels;
 * - one task A -> B -> A, A -> B -> C and A -> B writes: captured (the unit test proves the rule for every batch shape), A -> A ignored;
 * - writes that act on a same value (canvas width, img src, SVG href) are never ignored (the observer's decision, counted by `mutationsIgnored`);
 * - `classList.add(existing)` and `style.x = same` capture nothing;
 * - a child appended or reordered is captured.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { PNG } from "pngjs";

const viewport = { width: 1280, height: 720 };
const healthy = /^Current content=drawable owning WebGPU canvas/;

async function open(browser, dpr) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  await page.goto("/core-mutation-noop.html");
  await page.waitForFunction(() => window.mutationNoop, null, { timeout: 60000 });
  await page.addStyleTag({ content: "#status { display: none !important; }" });
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => {
    const api = await window.mutationNoop.ready, value = api[name];
    return typeof value === "function" ? value(...args) : value;
  }, { name, args });
  const frames = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { context, page, errors, call, frames };
}
const shot = async page => PNG.sync.read(await page.screenshot());
/** Mean RGB of a client rect, inset so edges do not count. */
function colour(png, rect, dpr) {
  const sum = [0, 0, 0]; let count = 0;
  for (let y = Math.floor((rect.y + 6) * dpr); y < Math.ceil((rect.y + rect.height - 6) * dpr); y++) for (let x = Math.floor((rect.x + 6) * dpr); x < Math.ceil((rect.x + rect.width - 6) * dpr); x++) {
    const offset = (y * png.width + x) * 4;
    sum[0] += png.data[offset]; sum[1] += png.data[offset + 1]; sum[2] += png.data[offset + 2]; count++;
  }
  return sum.map(value => Math.round(value / Math.max(1, count)));
}
function difference(a, b, rect, dpr) {
  let count = 0;
  for (let y = Math.floor(rect.y * dpr); y < Math.ceil((rect.y + rect.height) * dpr); y++) for (let x = Math.floor(rect.x * dpr); x < Math.ceil((rect.x + rect.width) * dpr); x++) {
    const offset = (y * a.width + x) * 4;
    if (a.data[offset] !== b.data[offset] || a.data[offset + 1] !== b.data[offset + 1] || a.data[offset + 2] !== b.data[offset + 2]) count++;
  }
  return count;
}
async function gpu(call, label) {
  const counts = await call("counts");
  expect(counts.mode, `${label}: GPU stays on (${counts.reason})`).toBe("gpu");
  expect(counts.reason, `${label}: no fallback`).toMatch(healthy);
  return counts;
}
const near = (actual, expected, tolerance = 12) => actual.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
const RGB = { red: [200, 40, 40], green: [40, 160, 60], blue: [40, 40, 200] };

for (const dpr of [1, 2]) {
  for (const kind of ["attribute", "style", "class", "text"]) {
    test(`300 frames of a same-value ${kind} write capture nothing and every record is counted, pixels unchanged (DPR ${dpr})`, async ({ browser }) => {
      const { context, page, errors, call } = await open(browser, dpr);
      try {
        await call("settle");
        const card = await call("box", "card");
        const first = await shot(page);
        await call("settle");
        const start = await gpu(call, "start");
        await call("same", kind, 300);
        await call("settle");
        const end = await gpu(call, "after");
        const changed = difference(first, await shot(page), card, dpr);
        console.log(`DPR ${dpr} same ${kind}: ${end.captures - start.captures} captures, ${end.uploads - start.uploads} uploads, ${end.mutationsIgnored - start.mutationsIgnored} ignored (layer ${end.layer.mutationsIgnored - start.layer.mutationsIgnored}), ${changed} pixels changed`);
        expect(end.captures - start.captures, "no capture").toBe(0);
        expect(end.uploads - start.uploads, "no upload").toBe(0);
        expect(end.mutationsIgnored - start.mutationsIgnored, "every record counted").toBe(300);
        expect(end.layer.mutationsIgnored - start.layer.mutationsIgnored, "counted on its layer").toBe(300);
        expect(changed, "pixels unchanged").toBe(0);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  }

  test(`real changes are captured within a frame or two with fresh pixels: style, class, text, attribute added and removed (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call, frames } = await open(browser, dpr);
    try {
      await call("settle");
      const swatch = await call("box", "swatch"), text = await call("box", "text");
      expect(near(colour(await shot(page), swatch, dpr), RGB.red), "starts red").toBe(true);
      const probe = async (change, check) => {
        await call("settle");
        const before = await gpu(call, change);
        await call("change", change);
        await frames();
        await call("settle");
        const after = await gpu(call, `after ${change}`);
        console.log(`DPR ${dpr} ${change}: ${after.captures - before.captures} captures, ${after.mutationsIgnored - before.mutationsIgnored} ignored`);
        expect(after.captures - before.captures, `${change} captured`).toBeGreaterThanOrEqual(1);
        expect(after.captures - before.captures, `${change} captured once or twice`).toBeLessThanOrEqual(2);
        expect(after.mutationsIgnored - before.mutationsIgnored, `${change} not ignored`).toBe(0);
        await check(await shot(page));
      };
      await probe("style", png => expect(near(colour(png, swatch, dpr), RGB.green), "style: green").toBe(true));
      await probe("class", png => expect(near(colour(png, swatch, dpr), RGB.blue), "class: blue").toBe(true));
      const beforeText = await shot(page);
      await probe("text", png => expect(difference(beforeText, png, text, dpr), "text pixels changed").toBeGreaterThan(20));
      await probe("unset", () => {});
      await probe("set", () => {});
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  for (const [name, steps, expected] of [
    ["A -> B -> A", ["green", "red"], "red"],
    ["A -> B -> C", ["green", "blue"], "blue"],
    ["A -> B", ["green"], "green"],
    ["A -> A", ["red", "red"], "red"],
  ]) {
    test(`one task ${name}: ${name === "A -> A" ? "ignored" : "captured"}, the pixels match the DOM (DPR ${dpr})`, async ({ browser }) => {
      const { context, page, errors, call, frames } = await open(browser, dpr);
      try {
        await call("settle");
        const swatch = await call("box", "swatch"), colours = await call("colours");
        const before = await gpu(call, "start");
        await call("batch", steps.map(step => colours[step]));
        await frames();
        await call("settle");
        const after = await gpu(call, "after");
        console.log(`DPR ${dpr} ${name}: ${after.captures - before.captures} captures, ${after.mutationsIgnored - before.mutationsIgnored} ignored`);
        if (name === "A -> A") {
          expect(after.captures - before.captures).toBe(0);
          expect(after.mutationsIgnored - before.mutationsIgnored, "both records ignored").toBe(2);
        } else {
          // A -> B -> A: the second record's old value (B) differs from the current value (A), so the batch is changed.
          expect(after.captures - before.captures, "captured").toBeGreaterThanOrEqual(1);
          expect(after.captures - before.captures).toBeLessThanOrEqual(2);
        }
        expect(near(colour(await shot(page), swatch, dpr), RGB[expected]), `pixels are ${expected}`).toBe(true);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  }

/** One write through `call(name)`: the capture and ignore counts it caused, after a frame or two and a settle. */
  async function write(call, frames, name) {
    await call("settle");
    const before = await gpu(call, name);
    await call(name);
    await frames();
    await call("settle");
    const after = await gpu(call, `after ${name}`);
    console.log(`DPR ${dpr} ${name}: ${after.captures - before.captures} captures, ${after.mutationsIgnored - before.mutationsIgnored} ignored`);
    return { captures: after.captures - before.captures, ignored: after.mutationsIgnored - before.mutationsIgnored };
  }

  test(`a same-value canvas width write clears the bitmap in the DOM: captured, not ignored, and the pixels follow (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, call, frames, errors } = await open(browser, dpr);
    try {
      // A <canvas> in a layer is captured (core marks it content="drawable", #184), so the pixels prove this one: red before the write,
      // the card background after it (the write clears the bitmap), and the observer counts the record as a capture, not as ignored.
      await call("settle");
      const pad = await call("box", "pad");
      expect(near(colour(await shot(page), pad, dpr), RGB.red), "the canvas shows its red fill").toBe(true);
      const result = await write(call, frames, "sameCanvas");
      expect(result.ignored, "not ignored").toBe(0);
      expect(result.captures, "captured").toBeGreaterThanOrEqual(1);
      expect(near(colour(await shot(page), pad, dpr), [233, 235, 239]), "the cleared canvas shows the card").toBe(true);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`a same-value img src write is captured, not ignored (DPR ${dpr})`, async ({ browser }) => {
    const { context, call, frames, errors } = await open(browser, dpr);
    try {
      const result = await write(call, frames, "sameSrc");
      expect(result.ignored, "not ignored").toBe(0);
      expect(result.captures, "captured").toBeGreaterThanOrEqual(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`namespaced attributes: a same-value xlink:title is ignored, a same-value xlink:href (it acts on write) and a changed one are captured with fresh pixels (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, call, frames, errors } = await open(browser, dpr);
    try {
      await call("settle");
      const uses = await call("box", "uses");
      expect(near(colour(await shot(page), uses, dpr), [220, 180, 20], 20), "starts gold").toBe(true);
      const title = await write(call, frames, "sameUseTitle");
      expect(title, "ignored").toEqual({ captures: 0, ignored: 1 });
      const same = await write(call, frames, "sameUse");
      expect(same.ignored, "same href not ignored").toBe(0);
      expect(same.captures, "same href captured").toBeGreaterThanOrEqual(1);
      const changed = await write(call, frames, "changeUse");
      expect(changed.ignored).toBe(0);
      expect(changed.captures).toBeGreaterThanOrEqual(1);
      expect(near(colour(await shot(page), uses, dpr), [20, 160, 160], 20), "ends teal").toBe(true);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`classList.add(existing) and style.x = same: the measured outcome (DPR ${dpr})`, async ({ browser }) => {
    const { context, call, frames, errors } = await open(browser, dpr);
    try {
      await call("classListSame");
      await call("settle");
      const classes = await write(call, frames, "classListSame");
      const style = await write(call, frames, "styleSame");
      console.log(`DPR ${dpr} classList.add(existing): ${JSON.stringify(classes)}; style.background = same: ${JSON.stringify(style)}`);
      // Either no record at all, or a record that is ignored: never a capture.
      expect(classes.captures, "classList.add(existing) captures nothing").toBe(0);
      expect(style.captures, "style.x = same captures nothing").toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test(`a child appended or reordered is captured, never ignored (DPR ${dpr})`, async ({ browser }) => {
    const { context, page, errors, call, frames } = await open(browser, dpr);
    try {
      await call("settle");
      const list = await call("box", "list");
      const first = await shot(page);
      for (const action of ["append", "reorder"]) {
        await call("settle");
        const before = await gpu(call, action);
        await call(action);
        await frames();
        await call("settle");
        const after = await gpu(call, `after ${action}`);
        console.log(`DPR ${dpr} ${action}: ${after.captures - before.captures} captures, ${after.mutationsIgnored - before.mutationsIgnored} ignored`);
        expect(after.captures - before.captures, `${action} captured`).toBeGreaterThanOrEqual(1);
        expect(after.mutationsIgnored - before.mutationsIgnored, `${action} not ignored`).toBe(0);
      }
      expect(difference(first, await shot(page), { ...list, width: 200 }, dpr), "the appended child is painted").toBeGreaterThan(100);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
