/**
 * Browser suite for native editing and scrolling inside GPU-presented content, on `runtime.html`
 * (`runtimeProbe`) and `integration.html` (`integrationProbe`). It proves that:
 * - trusted keyboard editing of an `<input>` or `<textarea>` (including the internal caret scroll) keeps GPU
 *   active, keeps the original element focused and hit-testable, and shows fresh pixels in the canvas without
 *   any React commit for caret-only changes;
 * - scrolling an unmarked bounded descendant viewport refreshes its pixels and hit geometry under GPU;
 * - composition events refresh without cancelling GPU motion that is already running (synthetic events only;
 *   real IME behaviour is not covered).
 * The editing and viewport tests run at DPR 1 and 2; all use the production preview build. Reports and screenshots go to the
 * `native-editing` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

// Evidence directory for JSON reports and screenshots.
const directory = evidenceDirectory("native-editing");
/** Reads the current `runtimeProbe` state snapshot. */
const state = page => page.evaluate(() => window.runtimeProbe.state());
/** Writes one named JSON report into this suite's evidence directory. */
async function save(name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
/**
 * Opens `runtime.html` with the `strict` flag and extra `query` flags (`&editing` adds the editor specimens,
 * `&dom` skips GPU), waits for initialization, checks the expected mode, and installs a capture-phase scroll
 * listener on the app container that records every scroll with its trust, geometry and the renderer mode at
 * that moment (`window.editingEvents`).
 */
async function ready(page, query = "") {
  await page.goto(`/runtime.html?strict${query}`);
  await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
  expect((await state(page)).mode).toBe(query.includes("&dom") ? "dom" : "gpu");
  await page.evaluate(() => {
    window.editingEvents = [];
    document.querySelector(".app-container").addEventListener("scroll", event => {
      const target = event.target;
      window.editingEvents.push({ trusted: event.isTrusted, id: target.id, tag: target.tagName,
        left: target.scrollLeft, top: target.scrollTop, width: target.clientWidth, height: target.clientHeight,
        scrollWidth: target.scrollWidth, scrollHeight: target.scrollHeight,
        mode: window.runtimeProbe.state().mode,
        path: event.composedPath().filter(node => node instanceof Element).map(node => node.id || node.tagName) });
    }, true);
  });
}
/** Returns the browser version and launch command line for the evidence report. */
async function metadata(page) {
  const cdp = await page.context().newCDPSession(page);
  const result = { identity: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
  await cdp.detach();
  return result;
}
/** Screenshots `selector`, saves it as evidence and returns the decoded PNG. Animations are allowed to run. */
async function image(page, selector, name) {
  const bytes = await page.locator(selector).screenshot({ animations: "allow" });
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.png`, bytes);
  return PNG.sync.read(bytes);
}
/**
 * Compares two same-size PNGs. A pixel counts as changed when the summed absolute RGB error exceeds 30; the mean
 * is the average per-channel error over all pixels.
 */
function difference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0, total = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const error = Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1])
      + Math.abs(a.data[index + 2] - b.data[index + 2]);
    if (error > 30) changed++;
    total += error;
  }
  return { changedPixels: changed, meanChannelError: total / (a.width * a.height * 3) };
}
/**
 * Snapshots an editor element: whether it is still the original node, its value, selection, focus, internal
 * scroll offsets, and whether a native hit test at its centre returns the element itself.
 */
async function observe(page, selector) {
  return page.locator(selector).evaluate(node => ({
    original: node === window.originalEditor, value: node.value, selection: [node.selectionStart, node.selectionEnd],
    focused: document.activeElement === node, left: node.scrollLeft, top: node.scrollTop,
    rect: node.getBoundingClientRect().toJSON(),
    hit: (() => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node; })(),
    state: window.runtimeProbe.state(), events: window.editingEvents,
  }));
}
/**
 * Runs 30 frames of numeric motion after the edit and asserts that they cost no React commit, capture, upload or
 * readback and present exactly 30 GPU frames, so motion stays independent of the edited content.
 */
async function motion(page) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.runtimeProbe.settle());
  const result = await page.evaluate(() => window.runtimeProbe.animate({ x: 5 }, 30));
  expect(result.after.mode).toBe("gpu");
  expect(result.after.commits.count).toBe(result.before.commits.count);
  for (const key of ["captures", "uploads", "pixelReadbacks"]) expect(result.after.metrics[key]).toBe(result.before.metrics[key]);
  expect(result.after.metrics.gpuFrames - result.before.metrics.gpuFrames).toBe(30);
  return result;
}
/** Disposes the runtime and asserts that every GPU resource counter is back to zero. */
async function dispose(page) {
  const result = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(result.resources).every(value => value === 0)).toBe(true);
}

// The tests in this loop run at both device pixel ratios on fresh pages. The input and textarea tests type a
// long value so the caret scrolls internally, and compare the GPU result with an ordinary-DOM page given the
// same typing.
for (const dpr of [1, 2]) {
  for (const kind of ["input", "textarea"]) test(`trusted ${kind} internal caret scrolling retains fresh native GPU content DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    // `dom` is the ordinary-DOM reference page that receives the same typing as the GPU page.
    const dom = await browser.newPage({ deviceScaleFactor: dpr });
    const selector = kind === "input" ? "#controlled" : "#editor";
    const query = kind === "input" ? "" : "&editing";
    // Long enough to overflow the input on every platform font (Windows system-ui is narrower than macOS).
    const value = kind === "input" ? "fresh independent native content tail"
      : ["FIRST long line ".repeat(4), "middle second line", "middle third line", "LAST visible tail ".repeat(5)].join("\n");
    // Select all and type the value (a textarea gets real Enter presses between lines).
    const type = async target => {
      await target.locator(selector).click();
      await target.keyboard.press("ControlOrMeta+a");
      for (const [index, line] of value.split("\n").entries()) {
        if (index) await target.keyboard.press("Enter");
        await target.keyboard.type(line);
      }
    };
    try {
      await ready(page, query);
      const environment = await metadata(page);
      await page.locator(selector).evaluate(node => { window.originalEditor = node; });
      // Input only: edit once first and confirm GPU stays active before the measured typing starts.
      if (kind === "input") {
        await page.locator(selector).click(); await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("independent");
        expect((await state(page)).mode).toBe("gpu");
      }
      const before = await state(page);
      await type(page);
      await page.evaluate(() => window.runtimeProbe.settle());
      const end = await observe(page, selector);
      // After typing, GPU must still be active, and the original element must still be focused and the native hit
      // target at its centre. The caret scrolled the input, and every recorded scroll happened while in GPU mode.
      expect(end.state.mode, end.state.reason).toBe("gpu");
      expect(end.original && end.focused && end.hit).toBe(true);
      expect(end.value).toBe(value); expect(end.selection).toEqual([value.length, value.length]);
      expect(end.left).toBeGreaterThan(0);
      if (kind === "textarea") expect(end.top).toBeGreaterThan(0);
      expect(end.events.some(event => event.id === selector.slice(1) && event.trusted && event.left > 0)).toBe(true);
      expect(end.events.every(event => event.mode === "gpu")).toBe(true);
      // Fresh pixels: the edited content was uploaded to the GPU after typing.
      expect(end.state.metrics.uploads).toBeGreaterThan(before.metrics.uploads);
      const tail = await image(page, selector, `${kind}-${dpr}-gpu-tail`);
      await ready(dom, `${query}&dom`); await type(dom);
      const nativeTail = await image(dom, selector, `${kind}-${dpr}-ordinary-tail`);
      // The GPU frame and the ordinary DOM render the same text, compared with a loose bound on the mean
      // channel error rather than exact equality.
      const reference = difference(tail, nativeTail);
      expect(reference.meanChannelError).toBeLessThan(8);
      // Only trusted caret navigation changes this image: no React value/geometry update.
      const beforeHome = await state(page);
      // The caret's internal scroll is painted in a later frame, and `settle()` waits only for work already scheduled (#73): wait
      // (bounded) for an upload after the element's scroll event, so the counts and the head image below see the scrolled content.
      // No scroll, or no refresh after it, still fails here.
      await page.evaluate(selector => { window.homeScroll = new Promise(resolve => document.querySelector(selector).addEventListener("scroll", () => resolve(window.runtimeProbe.state().metrics.uploads), { once: true })); }, selector);
      await page.keyboard.press(kind === "input" ? "Home" : "ControlOrMeta+Home");
      const uploadsAtScroll = await page.evaluate(() => Promise.race([window.homeScroll, new Promise((_, reject) => setTimeout(() => reject(new Error("no scroll event after Home")), 5000))]));
      await page.waitForFunction(uploads => window.runtimeProbe.state().metrics.uploads > uploads, uploadsAtScroll, { timeout: 5000 });
      await page.evaluate(() => window.runtimeProbe.settle());
      const start = await observe(page, selector);
      expect(start.state.mode).toBe("gpu"); expect(start.original && start.focused && start.hit).toBe(true);
      expect(start.value).toBe(value); expect(start.selection).toEqual([0, 0]);
      // Document start; Windows textareas can keep a 1-2px caret scroll margin.
      expect(start.left).toBeLessThanOrEqual(2);
      if (kind === "input") expect(start.top).toBe(0);
      else { expect(start.top).toBeLessThan(end.top); expect(start.top).toBeLessThanOrEqual(2); }
      expect(start.state.commits.count).toBe(beforeHome.commits.count);
      expect(start.state.metrics.uploads).toBeGreaterThan(beforeHome.metrics.uploads);
      const head = await image(page, selector, `${kind}-${dpr}-gpu-head`);
      // The head and tail screenshots must differ visibly, so the canvas shows the scrolled native content rather
      // than a stale frame.
      const freshness = difference(tail, head);
      expect(freshness.changedPixels).toBeGreaterThan(20 * dpr);
      // Motion afterwards must still be commit- and capture-free.
      const animated = await motion(page);
      await page.locator("#count").click(); await expect(page.locator("#count")).toHaveText("Count 1");
      await save(`${kind}-${dpr}`, { environment, before, end, start, reference, freshness, animated,
        limitation: "Trusted native keyboard/scroll and decoded GPU/ordinary-DOM images; not OS IME, physical refresh or universal text equivalence" });
      await dispose(page); await dispose(dom);
    } finally { await page.close(); await dom.close(); }
  });

  // A descendant scroll viewport that is not enrolled or marked: wheel scrolling it natively must refresh the
  // captured pixels and keep hit geometry current, without moving the enclosing layer.
  test(`bounded descendant viewport refreshes native pixels and current hits DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await ready(page, "&editing");
      const environment = await metadata(page), before = await state(page);
      const head = await image(page, "#native-viewport", `viewport-${dpr}-head`);
      // Trusted wheel input, not a programmatic `scrollTop`.
      await page.locator("#native-viewport").hover(); await page.mouse.wheel(0, 180);
      await expect.poll(() => page.locator("#native-viewport").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await page.evaluate(() => window.runtimeProbe.settle());
      const after = await state(page);
      expect(after.mode, after.reason).toBe("gpu");
      expect(after.metrics.uploads).toBeGreaterThan(before.metrics.uploads);
      // The enclosing layer's matrix is unchanged, so the pixel change comes from the inner scroll only.
      expect(after.layers.find(layer => layer.id === "primary").matrix).toEqual(before.layers.find(layer => layer.id === "primary").matrix);
      const tail = await image(page, "#native-viewport", `viewport-${dpr}-tail`);
      // The scrolled content changes a large area of the viewport (threshold scales with DPR).
      expect(difference(head, tail).changedPixels).toBeGreaterThan(1000 * dpr);
      await page.locator("#viewport-control").click(); await expect(page.locator("#viewport-control")).toHaveText("Viewport count 1");
      const events = await page.evaluate(() => window.editingEvents);
      expect(events.some(event => event.id === "native-viewport" && event.trusted && event.top > 0 && event.mode === "gpu")).toBe(true);
      await save(`viewport-${dpr}`, { environment, before, after, events,
        qualification: "Unmarked bounded descendant viewport captured/clipped natively inside unchanged enrolled boundary; enrolled/root scrolling and authored NativeScroll policy remain separate framework gaps" });
      await dispose(page);
    } finally { await page.close(); }
  });
}

// Synthetic composition events are only a contract check for the listener and refresh path: they are dispatched
// during a long declarative motion, which must keep running (cancelled only by the test afterwards).
test("eligible composition events refresh without cancelling existing GPU motion ownership", async ({ page }) => {
  await page.goto("/integration.html?dom");
  await page.waitForFunction(() => window.integrationProbe);
  await page.evaluate(() => window.integrationProbe.enable());
  const result = await page.evaluate(async () => {
    const input = document.querySelector("#name");
    input.focus();
    const transition = window.integrationProbe.transition({
      keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 },
    });
    const observed = [];
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
      input.addEventListener(type, event => observed.push({ type: event.type, data: event.data, trusted: event.isTrusted }));
      input.dispatchEvent(new CompositionEvent(type, { bubbles: true, data: "synthetic-contract-only" }));
    }
    await window.integrationProbe.settle();
    const state = window.integrationProbe.state();
    transition.cancel();
    return { observed, state, outcome: await transition.finished,
      original: input === document.querySelector("#name"), focused: document.activeElement === input };
  });
  expect(result.state.mode).toBe("gpu");
  expect(result.state.runtimeResources.declarativeMotions).toBe(1);
  expect(result.outcome.status).toBe("cancelled");
  expect(result.original && result.focused).toBe(true);
  expect(result.observed.map(event => event.type)).toEqual(["compositionstart", "compositionupdate", "compositionend"]);
  expect(result.observed.every(event => !event.trusted)).toBe(true);
  await save("composition-contract", { ...result, limitation: "Synthetic listener/refresh contract ONLY; manual OS IME/candidate-window certification remains open" });
  const retired = await page.evaluate(() => window.integrationProbe.dispose());
  expect(Object.values(retired.resources).every(value => value === 0)).toBe(true);
});
