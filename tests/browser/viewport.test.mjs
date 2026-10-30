/**
 * Browser suite for GPU presentation when the canvas sits inside external scroll containers, a scrolled
 * document or its own scrollable owner box, on `runtime.html` (`window.runtimeProbe`) and
 * `integration.html` (`window.integrationProbe`). The runtime must follow the viewport ancestors' clip
 * and scroll offsets: GPU stays active without readmission, pixels are clipped where ancestors clip,
 * and native hit-testing and trusted events agree with the pixels. Admission must refuse (and later
 * allow) cases where clipping cannot be proven. Reports, screenshots and JSON go to the `viewport`
 * evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { PNG } from "pngjs";
const directory = evidenceDirectory("viewport");
// Whole-page screenshot sample at a viewport CSS point; `point` is multiplied by the DPR and floored.
async function viewportPixel(page, point) {
  const bytes = await page.screenshot(), image = PNG.sync.read(bytes);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const offset = (Math.floor(point.y * dpr) * image.width + Math.floor(point.x * dpr)) * 4;
  return { pixel: [...image.data.subarray(offset, offset + 4)], bytes };
}
// Gives the document a scrolled, offset canvas: oversized body, frame moved 200 px right, document
// scrolled to (40,20). Asserts GPU stayed active. `probe` names the page's probe global.
async function externalDocumentOffset(page, probe = "runtimeProbe") {
  await page.evaluate(async probe => {
    document.body.style.minHeight = "1800px"; document.body.style.minWidth = "1800px";
    document.querySelector("#frame").style.left = "200px";
    window.scrollTo(40, 20);
    await window[probe].settle();
  }, probe);
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([40, 20]);
  expect((await page.evaluate(probe => window[probe].state(), probe)).mode).toBe("gpu");
}
// `levels` nests one or two bordered scrolling containers around the frame (borders 7 px and 5 px, so
// content offsets are not zero). While the containers scroll and a numeric motion runs, the GPU pixels
// must follow the ancestors' clip, the clipped region must be white and unhittable, trusted pointer
// events must reach the native control at its current position (and not at its old position), and an
// unrelated scroller must not cause GPU frames.
for (const dpr of [1, 2]) for (const levels of [1, 2]) test(`external bordered viewport chain live projection DPR${dpr} levels=${levels}`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 }, deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?dom");
    await page.waitForFunction(() => window.runtimeProbe);
    await page.evaluate(levels => {
      const frame = document.querySelector("#frame"), parent = frame.parentElement;
      window.externalOriginalParent = parent;
      window.externalOriginalInput = document.querySelector("#controlled");
      window.externalOriginalRoot = document.querySelector(".app-container");
      const outer = document.createElement("div");
      outer.id = "external-outer"; outer.tabIndex = 0;
      outer.style.cssText = "position:relative;width:600px;height:480px;border:7px solid black;overflow:auto";
      parent.insertBefore(outer, frame);
      let inner = outer;
      if (levels === 2) {
        inner = document.createElement("div"); inner.id = "external-inner"; inner.tabIndex = 0;
        inner.style.cssText = "position:relative;width:740px;height:620px;border:5px solid black;overflow:auto";
        outer.append(inner);
      }
      inner.append(frame);
      frame.style.left = "140px"; frame.style.top = "120px";
      const unrelated = document.createElement("div");
      unrelated.id = "external-unrelated"; unrelated.style.cssText = "width:20px;height:20px;overflow:auto";
      const filler = document.createElement("div"); filler.style.height = "100px";
      unrelated.append(filler); parent.append(unrelated);
    }, levels);
    expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("gpu");
    await page.evaluate(() => window.runtimeProbe.settle());
    const baseline = await page.evaluate(() => window.runtimeProbe.state());
    const oldCount = await page.locator("#count").evaluate(node => {
      const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const samples = [];
    await page.evaluate(() => { window.externalLive = window.runtimeProbe.animate({ x: 35 }, 120); });
    for (const [index, amount] of [30, 75, 110].entries()) {
      await page.locator("#external-outer").evaluate((node, amount) => { node.scrollLeft = amount; node.scrollTop = amount / 2; }, amount);
      if (levels === 2) await page.locator("#external-inner").evaluate((node, amount) => { node.scrollLeft = amount / 3; node.scrollTop = amount / 4; }, amount);
      await page.evaluate(() => window.runtimeProbe.settle());
      const current = await page.evaluate(() => {
        const output = document.querySelector("#output").getBoundingClientRect();
        const outer = document.querySelector("#external-outer").getBoundingClientRect();
        const badge = document.querySelector("#badge").getBoundingClientRect();
        const primary = document.querySelector("#primary").getBoundingClientRect();
        // A point on the green layer, kept 12 px inside the containers' scrollports so it is not clipped. The scrollport's
        // right edge is measured inside the border and any classic scrollbar: a headful window draws one there (#83).
        const scrollport = Math.min(...[...document.querySelectorAll("#external-outer, #external-inner")].map(node => node.getBoundingClientRect().left + node.clientLeft + node.clientWidth));
        const green = { x: Math.min(output.x + 510, scrollport - 12), y: output.y + 145 };
        window.externalEvents = [];
        for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, event =>
          window.externalEvents.push({ type, target: event.target.id, trusted: event.isTrusted,
            path: event.composedPath().filter(node => node instanceof Element).map(node => node.id) }), { once: true });
        return { green, movingPixel: { x: primary.x + 5, y: primary.bottom - 5 },
          badge: { x: badge.x + badge.width / 2, y: badge.y + badge.height / 2 },
          state: window.runtimeProbe.state(), clipped: { x: outer.right + 20, y: output.y + 110 },
          original: window.externalOriginalInput === document.querySelector("#controlled")
            && window.externalOriginalRoot === document.querySelector(".app-container") };
      });
      expect(current.state.mode).toBe("gpu");
      expect(current.state.moving).toBe(true);
      expect(current.state.resources.engines).toBe(1);
      expect(current.state.metrics.admission.attempts).toBe(baseline.metrics.admission.attempts);
      expect(current.original).toBe(true);
      const pixels = await viewportPixel(page, current.green);
      expect(pixels.pixel).toEqual([20, 200, 90, 255]);
      const movingPixel = (await viewportPixel(page, current.movingPixel)).pixel;
      expect(movingPixel).toEqual([240, 30, 60, 255]);
      // `clipped` is 20 px beyond the outer container's right edge: the layers must not be hit, the pixel
      // must be white, and a trusted click there must not reach `badge` or `stationary`.
      const clippedHits = await page.evaluate(point => document.elementsFromPoint(point.x, point.y).map(node => node.id), current.clipped);
      expect(clippedHits).not.toContain("stationary");
      expect(clippedHits).not.toContain("badge");
      const clippedPixel = (await viewportPixel(page, current.clipped)).pixel;
      expect(clippedPixel).toEqual([255, 255, 255, 255]);
      await page.mouse.click(current.clipped.x, current.clipped.y);
      expect((await page.evaluate(() => window.externalEvents)).every(event => event.trusted && !["badge", "stationary"].includes(event.target))).toBe(true);
      const negativeEvents = await page.evaluate(() => window.externalEvents);
      expect(await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.id, current.badge)).toBe("badge");
      await page.evaluate(() => {
        window.externalCurrentEvents = [];
        for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, event =>
          window.externalCurrentEvents.push({ type, trusted: event.isTrusted, target: event.target.id,
            path: event.composedPath().filter(node => node instanceof Element).map(node => node.id) }), { once: true });
      });
      await page.mouse.click(current.badge.x, current.badge.y);
      await expect(page.locator("#badge")).toHaveText(`Badge ${index + 1}`);
      const currentEvents = await page.evaluate(() => window.externalCurrentEvents);
      expect(currentEvents).toHaveLength(3);
      expect(currentEvents.every(event => event.trusted && event.target === "badge" && event.path.includes("stationary"))).toBe(true);
      // After scrolling, the pre-scroll position of the count button must no longer hit it: native geometry
      // follows the pixels, not the old layout.
      if (index === 2) {
        expect(await page.evaluate(point => document.elementsFromPoint(point.x, point.y).map(node => node.id), oldCount)).not.toContain("count");
        await page.evaluate(() => {
          window.externalOldEvents = [];
          for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, event =>
            window.externalOldEvents.push({ type, trusted: event.isTrusted, target: event.target.id,
              path: event.composedPath().filter(node => node instanceof Element).map(node => node.id) }), { once: true });
        });
        await page.mouse.click(oldCount.x, oldCount.y);
        await expect(page.locator("#count")).toHaveText("Count 0");
        const oldEvents = await page.evaluate(() => window.externalOldEvents);
        expect(oldEvents).toHaveLength(3);
        expect(oldEvents.every(event => event.trusted && event.target !== "count")).toBe(true);
        current.oldPosition = { point: oldCount, events: oldEvents };
      }
      samples.push({ amount, ...current, clippedHits, pixel: pixels.pixel, movingPixel, clippedPixel, negativeEvents, currentEvents });
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/external-chain-live-${dpr}-${levels}-${amount}.png`, pixels.bytes);
    }
    const live = await page.evaluate(() => window.externalLive);
    expect(live.after.mode).toBe("gpu");
    const attempts = live.after.metrics.admission.attempts;
    // Resize the outer container and exercise it natively (clicks, typing, PageDown, wheel) to check that
    // native scrolling of the external viewport and fresh native state keep GPU active.
    await page.locator("#external-outer").evaluate(node => { node.style.width = "680px"; node.style.height = "510px"; node.scrollLeft = 120; node.scrollTop = 40; });
    await page.evaluate(() => window.runtimeProbe.settle());
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await page.locator("#name-label").click();
    await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("fresh independent native");
    await page.keyboard.press("Enter");
    await expect(page.locator("#saved")).toHaveText("fresh independent native");
    await page.locator("#external-outer").evaluate(node => { node.style.height = "400px"; node.scrollTop = 0; });
    await page.locator("#external-outer").focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => page.locator("#external-outer").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press("Home");
    // A wheel over the container scrolls it natively; wait for the scroll to finish before sampling.
    await page.locator("#external-outer").hover(); await page.mouse.wheel(50, -120);
    await page.waitForTimeout(350);
    await page.evaluate(() => window.runtimeProbe.settle());
    const unrelatedBefore = await page.evaluate(() => window.runtimeProbe.state());
    // Scrolling an unrelated element must not cost a GPU frame.
    await page.locator("#external-unrelated").evaluate(node => { node.scrollTop = 70; });
    await page.waitForTimeout(30);
    const unrelatedAfter = await page.evaluate(() => window.runtimeProbe.state());
    expect(unrelatedAfter.metrics.gpuFrames).toBe(unrelatedBefore.metrics.gpuFrames);
    expect(unrelatedAfter.mode).toBe("gpu");
    await page.evaluate(async () => {
      document.querySelector("#controlled").focus();
      document.querySelector("#controlled").setSelectionRange(2, 8, "backward");
      await window.runtimeProbe.settle();
    });
    const selection = await page.locator("#controlled").evaluate(node => ({
      focus: document.activeElement === node, value: node.value, range: [node.selectionStart, node.selectionEnd], direction: node.selectionDirection }));
    expect(selection).toEqual({ focus: true, value: "fresh independent native", range: [2, 8], direction: "backward" });
    const independent = await page.evaluate(() => window.runtimeProbe.animate({ x: 5 }, 30));
    for (const key of ["captures", "uploads", "pixelReadbacks"]) expect(independent.after.metrics[key]).toBe(independent.before.metrics[key]);
    expect(independent.after.commits.count).toBe(independent.before.commits.count);
    expect(independent.after.metrics.admission.attempts).toBe(attempts);
    const disabled = await page.evaluate(() => window.runtimeProbe.disable());
    expect(disabled.mode).toBe("dom");
    expect(disabled.resources.engines).toBe(0);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 2");
    expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("gpu");
    // Move the frame back out of the containers. Transforming the old container no longer matters, but
    // transforming the frame itself is diagnosed and falls back to DOM; clearing it and scrolling the
    // frame into view allows re-admission.
    await page.evaluate(async () => {
      const frame = document.querySelector("#frame");
      window.externalOriginalParent.append(frame);
      frame.style.left = "0px"; frame.style.top = "0px";
      await window.runtimeProbe.settle();
      document.querySelector("#external-outer").style.transform = "scale(0.9)";
    });
    await page.waitForTimeout(30);
    expect((await page.evaluate(() => window.runtimeProbe.state())).mode).toBe("gpu");
    await page.evaluate(() => { document.querySelector("#frame").style.transform = "scale(0.95)"; });
    await expect.poll(() => page.evaluate(() => window.runtimeProbe.state().mode)).toBe("dom");
    expect((await page.evaluate(() => window.runtimeProbe.state())).reason).toMatch(/Transformed external viewport ancestors.*axis-aligned framework/);
    await page.locator("#frame").evaluate(node => { node.style.transform = "none"; node.scrollIntoView({ block: "start" }); });
    const qualifiedReentry = await page.evaluate(() => window.runtimeProbe.enable());
    expect(qualifiedReentry.mode, qualifiedReentry.reason).toBe("gpu");
    await writeFile(`${directory}/external-chain-${dpr}-${levels}.json`, JSON.stringify({
      baseline, samples, live, selection, independent, unrelatedBefore, unrelatedAfter,
      liveCaptures: live.after.metrics.captures - baseline.metrics.captures,
      liveUploads: live.after.metrics.uploads - baseline.metrics.uploads }, null, 2));
    expect(Object.values((await page.evaluate(() => window.runtimeProbe.dispose())).resources).every(value => value === 0)).toBe(true);
  } finally { await page.close(); }
});
// Document-level scrolling and the owner canvas as a clip box. The frame starts off-screen (left 1100 px
// in a 900 px viewport) so admission stays in DOM; a wider viewport admits. Then: the root scrolls
// internally, the owner canvas gets overflow/border/padding, hits and pixels outside its content box
// must be clipped, and the document scrolls on both axes (wheel, keys, programmatic) with GPU kept
// and no readmission.
for (const dpr of [1, 2]) test(`external document locator scroll and replaced owner clip DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?dom");
    await page.waitForFunction(() => window.runtimeProbe);
    await page.locator("#controlled").fill("kept");
    await page.evaluate(() => {
      document.activeElement.blur();
      window.originalInput = document.querySelector("#controlled");
      window.originalRoot = document.querySelector(".app-container");
      document.querySelector("#frame").style.left = "1100px";
    });
    expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("dom");
    // Widen the viewport so the 1100 px offset frame becomes visible and admission can prove clipping.
    await page.setViewportSize({ width: 2000, height: 750 });
    expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("gpu");
    await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "250px"; root.style.overflow = "auto"; root.scrollLeft = 80;
      await window.runtimeProbe.settle();
      root.style.width = "100%"; root.style.overflow = "visible"; root.scrollLeft = 0;
      await window.runtimeProbe.settle();
    });
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await page.locator("#name-label").click();
    await page.keyboard.press("End");
    await page.keyboard.type("-native");
    await page.keyboard.press("Enter");
    await page.evaluate(() => window.runtimeProbe.settle());
    await expect(page.locator("#saved")).toHaveText("kept-native");
    const original = await page.evaluate(() => ({
      input: window.originalInput === document.querySelector("#controlled"),
      root: window.originalRoot === document.querySelector(".app-container"),
      value: window.originalInput.value, direction: window.originalInput.selectionDirection,
      selection: [window.originalInput.selectionStart, window.originalInput.selectionEnd],
      mode: window.runtimeProbe.state().mode,
    }));
    expect(original).toMatchObject({ input: true, root: true, value: "kept-native", selection: [11, 11], mode: "gpu" });
    await page.locator("h1").click();
    await page.evaluate(() => window.runtimeProbe.settle());
    const motion = await page.evaluate(() => window.runtimeProbe.animate({ x: 5 }, 30));
    expect(motion.after.mode).toBe("gpu");
    for (const key of ["captures", "uploads", "pixelReadbacks"]) expect(motion.after.metrics[key]).toBe(motion.before.metrics[key]);
    expect(motion.after.commits.count).toBe(motion.before.commits.count);
    expect(motion.after.metrics.gpuFrames - motion.before.metrics.gpuFrames).toBe(30);
    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      document.querySelector("#frame").style.left = "0px";
      await window.runtimeProbe.settle();
      const output = document.querySelector("#output");
      output.style.overflow = "auto";
      document.querySelector(".app-container").style.width = "900px";
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      output.scrollLeft = 30;
      await window.runtimeProbe.settle();
    });
    const owner = await page.evaluate(() => {
      const output = document.querySelector("#output"), layer = document.querySelector("#primary");
      const r = layer.getBoundingClientRect(), o = output.getBoundingClientRect();
      const count = document.querySelector("#count").getBoundingClientRect();
      return { scroll: output.scrollLeft, raw: [...output.getElementTransform(layer).toFloat64Array()],
        dimensions: { width: output.clientWidth, scrollWidth: output.scrollWidth, height: output.clientHeight,
          scrollHeight: output.scrollHeight, rootWidth: document.querySelector(".app-container").offsetWidth,
          overflow: getComputedStyle(output).overflow, content: output.getAttribute("content") },
        rect: { x: r.x, y: r.y }, output: { x: o.x, y: o.y },
        count: { x: count.x + count.width / 2, y: count.y + count.height / 2 },
        hit: document.elementFromPoint(count.x + count.width / 2, count.y + count.height / 2)?.id,
        state: window.runtimeProbe.state() };
    });
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/external-owner-${dpr}.json`, JSON.stringify({ original, motion, owner }, null, 2));
    await writeFile(`${directory}/external-owner-${dpr}.png`, await page.locator("#output").screenshot());
    // Content box is 640 wide, so the owner has nothing to scroll. `raw[12]` is the native x translation of
    // `#primary` (40 px layout x plus the x: 5 transform the motion above ended on).
    expect(owner.scroll).toBe(0);
    expect(owner.dimensions).toMatchObject({ width: 640, scrollWidth: 640, rootWidth: 900, overflow: "auto", content: "drawable" });
    expect(owner.state.mode).toBe("gpu");
    expect(owner.raw[12]).toBe(45);
    expect(owner.rect.x - owner.output.x).toBe(45);
    expect(owner.hit).toBe("count");
    await page.mouse.click(owner.count.x, owner.count.y);
    await expect(page.locator("#count")).toHaveText("Count 2");
    // Add border and padding to the owner. The content origin is then border + padding, `stationary` is
    // moved to straddle the 640 px content edge, and 630 is inside while 665 is beyond it.
    await page.evaluate(async () => {
      const output = document.querySelector("#output");
      output.style.border = "8px solid rgb(30,100,220)";
      output.style.padding = "4px";
      await window.runtimeProbe.settle();
      window.runtimeProbe.transform("stationary", { x: 220 });
      await window.runtimeProbe.settle();
    });
    const clipped = await page.evaluate(() => {
      const output = document.querySelector("#output"), o = output.getBoundingClientRect();
      const r = document.querySelector("#primary").getBoundingClientRect();
      const style = getComputedStyle(output), origin = { x: output.clientLeft + parseFloat(style.paddingLeft), y: output.clientTop + parseFloat(style.paddingTop) };
      const inside = { x: o.x + origin.x + 630, y: o.y + origin.y + 145 };
      const outside = { x: o.x + origin.x + 665, y: inside.y };
      window.ownerClipEvents = [];
      for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, event =>
        window.ownerClipEvents.push({ type, trusted: event.isTrusted, target: event.target.id }));
      return { inside, outside, primary: { x: r.x - o.x, y: r.y - o.y }, origin,
        insideHit: document.elementFromPoint(inside.x, inside.y)?.id,
        outsideHits: document.elementsFromPoint(outside.x, outside.y).map(node => node.id),
        scroll: output.scrollLeft, state: window.runtimeProbe.state() };
    });
    expect(clipped.state.mode).toBe("gpu");
    expect(clipped.primary.x).toBe(45 + clipped.origin.x);
    expect(clipped.insideHit).toBe("stationary");
    expect(clipped.outsideHits).not.toContain("stationary");
    const outsidePixel = (await viewportPixel(page, clipped.outside)).pixel;
    expect(outsidePixel).toEqual([255, 255, 255, 255]);
    const clipBytes = await page.locator("#output").screenshot(), clipImage = PNG.sync.read(clipBytes);
    const at = ((Math.floor((145 + clipped.origin.y) * dpr)) * clipImage.width + Math.floor((630 + clipped.origin.x) * dpr)) * 4;
    expect([...clipImage.data.subarray(at, at + 4)]).toEqual([20, 200, 90, 255]);
    await page.mouse.click(clipped.outside.x, clipped.outside.y);
    expect((await page.evaluate(() => window.ownerClipEvents)).every(event => event.trusted && !["stationary", "badge"].includes(event.target))).toBe(true);
    await writeFile(`${directory}/external-owner-clip-${dpr}.json`, JSON.stringify({ ...clipped, outsidePixel }, null, 2));
    await writeFile(`${directory}/external-owner-clip-${dpr}.png`, clipBytes);
    await page.evaluate(() => window.runtimeProbe.disable());
    const borderedAdmission = await page.evaluate(() => window.runtimeProbe.enable());
    expect(borderedAdmission.mode, borderedAdmission.reason).toBe("gpu");
    await page.evaluate(async () => {
      const frame = document.querySelector("#frame");
      frame.style.left = "300px"; frame.style.top = "20px";
      document.body.style.minWidth = "2600px"; document.body.style.minHeight = "1800px";
      window.scrollTo(120, 80);
      await window.runtimeProbe.settle();
    });
    const documentBefore = await page.evaluate(() => window.runtimeProbe.state());
    const documentScroll = [];
    for (const position of [{ x: 180, y: 100 }, { x: 210, y: 120 }]) {
      await page.evaluate(async point => { window.scrollTo(point.x, point.y); await window.runtimeProbe.settle(); }, position);
      const state = await page.evaluate(() => {
        const r = document.querySelector("#output").getBoundingClientRect();
        return { scroll: [window.scrollX, window.scrollY], state: window.runtimeProbe.state(),
          point: { x: r.x + 622, y: r.y + 157 } };
      });
      expect(state.scroll).toEqual([position.x, position.y]);
      expect(state.state.mode).toBe("gpu");
      expect(state.state.publication.pending).toBe(false);
      expect(state.state.metrics.admission.attempts).toBe(documentBefore.metrics.admission.attempts);
      const pixel = await viewportPixel(page, state.point);
      expect(pixel.pixel).toEqual([20, 200, 90, 255]);
      documentScroll.push({ ...state, pixel: pixel.pixel });
      await writeFile(`${directory}/external-document-${dpr}-${position.x}.png`, pixel.bytes);
    }
    await page.locator("h1").click();
    await page.mouse.wheel(70, 100);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    for (const key of ["PageDown", "End", "Home", "ArrowRight", "ArrowDown"]) {
      await page.keyboard.press(key); await page.waitForTimeout(180);
      documentScroll.push({ key, scroll: await page.evaluate(() => [window.scrollX, window.scrollY]), state: await page.evaluate(() => window.runtimeProbe.state()) });
      expect(documentScroll.at(-1).state.mode).toBe("gpu");
    }
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 3");
    await page.locator("#third").click();
    await expect(page.locator("#third-layer")).toBeAttached();
    await page.evaluate(() => window.runtimeProbe.settle());
    const addition = await page.evaluate(() => window.runtimeProbe.state());
    expect(addition.mode).toBe("gpu");
    expect(addition.publication.pending).toBe(false);
    expect(addition.resources.engines).toBe(1);
    expect(addition.metrics.admission.attempts).toBe(documentBefore.metrics.admission.attempts);
    await page.locator("#third").click();
    await expect(page.locator("#third-layer")).toHaveCount(0);
    await page.evaluate(() => window.runtimeProbe.settle());
    await writeFile(`${directory}/external-document-axes-${dpr}.json`, JSON.stringify({ documentBefore, documentScroll, addition, after: await page.evaluate(() => window.runtimeProbe.state()) }, null, 2));
    expect(Object.values((await page.evaluate(() => window.runtimeProbe.dispose())).resources).every(value => value === 0)).toBe(true);
  } finally { await page.close(); }
});
// `runtime.html?strict` with `NativeScroll` (`#scroller`, toggled by `#scroll-toggle`) and a narrowed,
// scrolling root. Wheel and keyboard scrolling, retained focus/selection, clipped hit-testing and clipped
// pixels (white where the root hides content) must all hold at both DPRs with GPU active.
for (const dpr of [1, 2]) test(`bounded root and enrolled NativeScroll retain GPU clip DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?strict");
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await externalDocumentOffset(page);
    await page.locator("#controlled").fill("fresh independent native");
    await page.evaluate(() => { window.originalInput = document.querySelector("#controlled"); });
    await page.locator("#scroll-toggle").click();
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.evaluate(() => {
      window.originalInput.focus(); window.originalInput.setSelectionRange(5, 10);
      document.querySelector("#primary").scrollTop = document.querySelector("#primary").scrollHeight;
    });
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => ({
      original: window.originalInput === document.querySelector("#controlled"), focused: document.activeElement === window.originalInput,
      value: window.originalInput.value, selection: [window.originalInput.selectionStart, window.originalInput.selectionEnd],
    }))).toEqual({ original: true, focused: true, value: "fresh independent native", selection: [5, 10] });
    const beforeWheel = await page.evaluate(() => window.runtimeProbe.state());
    await page.locator("#scroller").hover(); await page.mouse.wheel(0, 220);
    await expect.poll(() => page.locator("#scroller").evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    const wheelState = await page.evaluate(() => window.runtimeProbe.state());
    expect(wheelState.metrics.uploads).toBeGreaterThan(beforeWheel.metrics.uploads);
    // A point 75% across and down the tail control of the native scroller, in output pixels.
    const nativePoint = await page.locator("#scroll-tail").evaluate(node => {
      const r = node.getBoundingClientRect(), output = document.querySelector("#output").getBoundingClientRect();
      return { x: r.x - output.x + r.width * 0.75, y: r.y - output.y + r.height * 0.75 };
    });
    const tailBytes = await page.locator("#output").screenshot(), tailImage = PNG.sync.read(tailBytes);
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/native-tail-${dpr}.json`, JSON.stringify({ nativePoint, width: tailImage.width, height: tailImage.height }));
    // The scrolled-in tail control must be drawn (green) after a wheel scroll that uploaded new pixels.
    const tailOffset = (Math.floor(nativePoint.y * dpr) * tailImage.width + Math.floor(nativePoint.x * dpr)) * 4;
    expect([...tailImage.data.subarray(tailOffset, tailOffset + 4)]).toEqual([20, 200, 90, 255]);
    await writeFile(`${directory}/native-tail-${dpr}.png`, tailBytes);
    await page.locator("#scroll-tail").click();
    await expect(page.locator("#scroll-tail")).toHaveText("Scroll count 1");
    await page.locator("#scroller").evaluate(node => { node.tabIndex = 0; node.focus(); });
    await page.keyboard.press("Home");
    await expect.poll(() => page.locator("#scroller").evaluate(node => node.scrollTop)).toBe(0);
    await page.keyboard.press("End");
    await expect.poll(() => page.locator("#scroller").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.evaluate(() => window.runtimeProbe.settle());
    const result = await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "250px"; root.style.overflow = "auto";
      root.tabIndex = 0;
      await window.runtimeProbe.settle();
      root.scrollLeft = 80;
      await window.runtimeProbe.settle();
      const badge = document.querySelector("#badge"), r = badge.getBoundingClientRect();
      return { state: window.runtimeProbe.state(), rootLeft: root.scrollLeft,
        clippedHit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === badge };
    });

    expect(result.rootLeft).toBeGreaterThan(0);
    expect(result.state.mode).toBe("gpu");
    expect(result.clippedHit).toBe(false);
    const outputBox = await page.locator("#output").boundingBox();
    await page.mouse.move(outputBox.x + 100, outputBox.y + 100); await page.mouse.wheel(40, 0);
    await expect.poll(() => page.locator(".app-container").evaluate(node => node.scrollLeft)).toBeGreaterThan(80);
    await page.locator(".app-container").evaluate(node => node.focus());
    const beforeRootKey = await page.locator(".app-container").evaluate(node => node.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.locator(".app-container").evaluate(node => node.scrollLeft)).toBeGreaterThan(beforeRootKey);
    await page.evaluate(async () => { document.querySelector(".app-container").scrollLeft = 80; await window.runtimeProbe.settle(); });
    await mkdir(directory, { recursive: true });
    const bytes = await page.locator("#output").screenshot(), image = PNG.sync.read(bytes);
    // (390,70) lies in `stationary` when unclipped, but the narrowed root hides it, so GPU must draw white.
    const offset = (Math.floor(70 * dpr) * image.width + Math.floor(390 * dpr)) * 4;
    expect([...image.data.subarray(offset, offset + 4)]).toEqual([255, 255, 255, 255]);
    await writeFile(`${directory}/root-${dpr}.png`, bytes);
    await page.evaluate(async () => {
      document.querySelector(".app-container").scrollLeft = 250;
      await window.runtimeProbe.settle();
    });
    await page.locator("#badge").click(); await expect(page.locator("#badge")).toHaveText("Badge 1");
    await page.evaluate(() => { document.querySelector(".app-container").scrollLeft = 80; });
    await page.keyboard.press("Tab"); await page.waitForTimeout(120);
    await page.evaluate(() => window.runtimeProbe.settle());
    const motion = await page.evaluate(() => window.runtimeProbe.animate({ x: 5 }, 30));
    expect(motion.after.mode).toBe("gpu");
    expect(motion.after.commits.count).toBe(motion.before.commits.count);
    for (const key of ["captures", "uploads", "pixelReadbacks"]) expect(motion.after.metrics[key]).toBe(motion.before.metrics[key]);
    const motionBytes = await page.locator("#output").screenshot(), motionImage = PNG.sync.read(motionBytes);
    // (260,70) lies in `primary` (x 40-300) when unclipped; the 250 px root hides it even during motion.
    const outsideOffset = (Math.floor(70 * dpr) * motionImage.width + Math.floor(260 * dpr)) * 4;
    expect([...motionImage.data.subarray(outsideOffset, outsideOffset + 4)]).toEqual([255, 255, 255, 255]);
    await writeFile(`${directory}/motion-clip-${dpr}.png`, motionBytes);
    const cleared = await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "100%"; root.style.overflow = "visible"; root.scrollLeft = 0;
      const primary = document.querySelector("#primary"); primary.scrollTop = 0;
      await window.runtimeProbe.settle();
      return window.runtimeProbe.state();
    });
    expect(cleared.mode).toBe("gpu");
    await page.locator("#scroll-toggle").click();
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.locator("#badge").click(); await expect(page.locator("#badge")).toHaveText("Badge 2");
    await writeFile(`${directory}/root-${dpr}.json`, JSON.stringify({ beforeWheel, wheelState, result, motion, cleared }, null, 2));
    await page.evaluate(() => window.runtimeProbe.dispose());
  } finally { await page.close(); }
});

// `integration.html`: replacing an element behind an original ref must retire the old element and keep
// GPU admitted once while the document is scrolled and the DPR is flipped by CDP emulation; every capture
// must have been taken for the slot it is published in.
for (const dpr of [1, 2]) test(`scrolled viewport preserves original ref membership and DPR preparation DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await page.goto("/integration.html?strict");
    await page.waitForFunction(() => window.integrationProbe && !window.integrationProbe.state().initializing);
    await externalDocumentOffset(page, "integrationProbe");
    await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.height = "250px"; root.style.overflow = "auto"; root.scrollTop = 50;
      await window.integrationProbe.settle();
      window.retiredRef = document.querySelector("#replacement");
    });
    await page.locator("#replace").click();
    await expect(page.locator("#replacement")).toHaveText("Original ref 1");
    await page.evaluate(() => window.integrationProbe.settle());
    const cdp = await page.context().newCDPSession(page);
    // Flip the DPR (1 <-> 2) with CDP device-metrics emulation and dispatch `resize` by hand.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 700,
      deviceScaleFactor: dpr === 1 ? 2 : 1, mobile: false });
    await page.evaluate(() => { window.dispatchEvent(new Event("resize")); });
    await page.evaluate(() => window.integrationProbe.settle());
    const result = await page.evaluate(() => ({
      state: window.integrationProbe.state(), retired: !window.retiredRef.isConnected,
      root: { top: document.querySelector(".app-container").scrollTop },
    }));
    expect(result.state.mode).toBe("gpu");
    expect(result.root.top).toBeGreaterThan(0);
    expect(result.retired).toBe(true);
    expect(result.state.metrics.admission.attempts).toBe(1);
    for (const capture of result.state.publication.captures) expect(capture.capturedSlot).toBe(capture.slot);
    await page.locator("#replacement").click();
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/ref-${dpr}.json`, JSON.stringify(result, null, 2));
    await writeFile(`${directory}/ref-${dpr}.png`, await page.locator("#output").screenshot());
    await cdp.detach();
    const retired = await page.evaluate(() => window.integrationProbe.dispose());
    expect(Object.values(retired.resources).every(value => value === 0)).toBe(true);
  } finally { await page.close(); }
});

// The native canvas clip option is ignored here (the wrapper forwards only transform and hit order);
// admission must diagnose that the clip did not apply instead of admitting.
test("functional canvasClip ignored by native geometry is diagnosed before GPU admission", async ({ page }) => {
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  await page.evaluate(() => {
    const output = document.querySelector("#output");
    const update = output.updateElementGeometry.bind(output);
    output.updateElementGeometry = (element, options) => update(element, { canvasTransform: options?.canvasTransform,
      preserveHitTestOrder: options?.preserveHitTestOrder });
  });

  const state = await page.evaluate(() => window.runtimeProbe.enable());
  expect(state.mode).toBe("dom");
  expect(state.reason).toMatch(/clip/);
  await page.evaluate(() => window.runtimeProbe.dispose());
});

// Axis-aligned overflow clipping on the root (`clip`) and on a child (`childclip`) is supported and
// must admit.
test("typed axis-aligned clipping admits without structural DOM policy", async ({ page }) => {
  for (const query of ["clip", "childclip"]) {
    await page.goto(`/runtime.html?${query}`);
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.evaluate(() => window.runtimeProbe.dispose());
  }
});

// A canvas that is not visible cannot prove clipping. `noop` additionally ignores the clip option.
// Admission is deferred while off-screen, still refused with a hit-testing diagnosis when the clip is
// ignored, and succeeds when the clip works. After admission the clipped badge location must be white
// and clicks there must land on the canvas, not the badge. Ordinary offscreen movement must not revoke
// an admitted renderer.
for (const dpr of [1, 2]) for (const fault of [false, true]) test(`offscreen clipping stays unproven until visible admission DPR${dpr} noop=${fault}`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?dom");
    await page.waitForFunction(() => window.runtimeProbe);
    await page.locator("#controlled").fill("kept");
    await page.evaluate(fault => {
      document.activeElement?.blur();
      const output = document.querySelector("#output"), update = output.updateElementGeometry.bind(output);
      window.savedOffscreenInput = document.querySelector("#controlled");
      window.restoreOffscreenClip = () => { output.updateElementGeometry = update; };
      if (fault) output.updateElementGeometry = (element, options) => update(element, {
        canvasTransform: options?.canvasTransform, preserveHitTestOrder: options?.preserveHitTestOrder,
      });
      document.querySelector("#frame").style.left = "1100px";
      window.scrollTo(0, 0);
    }, fault);
    const deferred = await page.evaluate(() => window.runtimeProbe.enable());
    expect(deferred.mode).toBe("dom");
    expect(deferred.reason).toMatch(/clipping is unproven.*deferred/);
    for (const key of ["engines", "textures", "effects", "renderers", "probeElements", "probeReadbacks", "paintWaits", "pendingCleanups"]) expect(deferred.resources[key]).toBe(0);
    await page.setViewportSize({ width: 2000, height: 750 });
    const visible = await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "250px"; root.style.overflow = "auto"; root.scrollLeft = 80;
      await window.runtimeProbe.settle();
      return window.runtimeProbe.state();
    });
    expect(visible.mode).toBe("dom");
    expect(await page.evaluate(() => window.savedOffscreenInput === document.querySelector("#controlled")
      && window.savedOffscreenInput.value === "kept" && document.querySelector("#output").hidden)).toBe(true);
    const attempt = await page.evaluate(() => window.runtimeProbe.enable());
    if (fault) {
      expect(attempt.mode).toBe("dom");
      expect(attempt.reason).toMatch(/interior\/clipped hit testing/);
      expect(attempt.resources.engines).toBe(0);
      await page.evaluate(() => window.restoreOffscreenClip());
    } else {
      expect(attempt.mode).toBe("gpu");
      await page.evaluate(() => window.runtimeProbe.disable());
    }
    const qualified = await page.evaluate(async () => { await window.runtimeProbe.enable(); await window.runtimeProbe.settle(); return window.runtimeProbe.state(); });
    expect(qualified.mode).toBe("gpu");
    expect(qualified.metrics.admission.last.geometry.hitCheck).not.toMatch(/Skipped/);
    const exclusion = await page.locator("#badge").evaluate(badge => {
      const r = badge.getBoundingClientRect(), output = document.querySelector("#output").getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      window.offscreenClicks = [];
      document.addEventListener("click", event => window.offscreenClicks.push({ trusted: event.isTrusted, target: event.target.id }));
      return { x, y, localX: x - output.x, localY: y - output.y,
        hit: document.elementFromPoint(x, y)?.id };
    });
    expect(exclusion.hit).toBe("output");
    const bytes = await page.locator("#output").screenshot(), image = PNG.sync.read(bytes);
    const offset = (Math.floor(exclusion.localY * dpr) * image.width + Math.floor(exclusion.localX * dpr)) * 4;
    expect([...image.data.subarray(offset, offset + 4)]).toEqual([255, 255, 255, 255]);
    await page.mouse.click(exclusion.x, exclusion.y);
    expect(await page.evaluate(() => window.offscreenClicks)).toEqual([{ trusted: true, target: "output" }]);
    // A previously qualified renderer is not revoked by ordinary offscreen movement.
    await page.setViewportSize({ width: 900, height: 750 });
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.setViewportSize({ width: 2000, height: 750 });
    await page.evaluate(() => window.runtimeProbe.settle());
    await page.locator(".app-container").evaluate(root => { root.style.width = "100%"; root.style.overflow = "visible"; root.scrollLeft = 0; });
    await page.evaluate(() => window.runtimeProbe.settle());
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/offscreen-${dpr}-${fault}.json`, JSON.stringify({ deferred, visible, attempt, qualified, exclusion }, null, 2));
    await writeFile(`${directory}/offscreen-${dpr}-${fault}.png`, bytes);
    const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
    expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
  } finally { await page.close(); }
});

// A full-viewport occluder over the page makes the clipping witness unprovable: admission refuses and
// leaves a usable DOM, then admits once the occluder is removed.
test("occluded initial native clipping witness refuses useful DOM and allows unobstructed reentry", async ({ page }) => {
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  await page.evaluate(() => {
    const blocker = document.createElement("div");
    blocker.id = "admission-occluder";
    blocker.style.cssText = "position:fixed;inset:0;background:white;z-index:9999";
    document.body.append(blocker);
  });
  const refused = await page.evaluate(() => window.runtimeProbe.enable());
  expect(refused.mode).toBe("dom");
  expect(refused.reason).toMatch(/interior\/clipped hit testing.*occluded/);
  expect(refused.resources.engines).toBe(0);
  await page.locator("#admission-occluder").evaluate(node => node.remove());
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
});

// Add and remove the third layer repeatedly while the root is scrolled horizontally: each fresh capture
// must be taken for its published slot, the slot must change between additions, and the layer's pixels
// (blue at layer x 495, shifted by the scroll) and native control must be correct.
for (const dpr of [1, 2]) test(`scrolled root additions retain complete current native slots DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?strict");
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    await externalDocumentOffset(page);
    await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "460px"; root.style.overflow = "auto"; root.scrollLeft = 60;
      await window.runtimeProbe.settle();
    });
    const generations = [];
    for (let addition = 0; addition < 2; addition++) {
      await page.locator("#third").click();
      await page.evaluate(() => window.runtimeProbe.settle());
      const state = await page.evaluate(() => window.runtimeProbe.state());
      expect(state.mode).toBe("gpu");
      expect(state.publication.pending).toBe(false);
      expect(state.publication.captures).toHaveLength(3);
      const fresh = state.publication.captures.find(item => item.id === "third-layer");
      expect(fresh.capturedSlot).toBe(fresh.slot);
      if (addition) expect(fresh.slot).not.toBe(generations[0].fresh.slot);
      const left = await page.locator(".app-container").evaluate(node => node.scrollLeft);
      expect(left).toBeGreaterThan(0);
      const bytes = await page.locator("#output").screenshot(), image = PNG.sync.read(bytes);
      const offset = (Math.floor(245 * dpr) * image.width + Math.floor((495 - left) * dpr)) * 4;
      expect([...image.data.subarray(offset, offset + 4)]).toEqual([30, 100, 220, 255]);
      await page.locator("#third-control").click();
      generations.push({ state, fresh, left });
      await page.locator("#third").click();
      await page.evaluate(() => window.runtimeProbe.settle());
      expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    }
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/scrolled-add-${dpr}.json`, JSON.stringify(generations, null, 2));
    await page.evaluate(() => window.runtimeProbe.dispose());
  } finally { await page.close(); }
});

test("a modal scroll lock on the root element keeps GPU; a single-axis clip on a real ancestor still does not", async ({ page }) => {
  // Dialog libraries lock page scrolling with single-axis overflow on <html>/<body> (Fluent UI:
  // html overflow-y: clip, body overflow-y: hidden). Root overflow applies to the viewport, which
  // always clips; it is not a clip of an ancestor box.
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("gpu");
  const lock = locked => page.evaluate(async locked => {
    document.documentElement.style.overflowY = locked ? "clip" : "";
    document.documentElement.style.scrollbarGutter = locked ? "stable" : "";
    document.body.style.overflowY = locked ? "hidden" : "";
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await window.runtimeProbe.settle();
    const state = window.runtimeProbe.state();
    return { mode: state.mode, reason: state.reason, html: getComputedStyle(document.documentElement).overflowX + "/" + getComputedStyle(document.documentElement).overflowY };
  }, locked);
  const during = await lock(true);
  expect(during.html).toBe("visible/clip");
  expect(during.mode, during.reason).toBe("gpu");
  // Fresh pixels and native hits while locked.
  const count = page.locator("#count");
  const before = await count.innerText();
  const box = await count.boundingBox();
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [box.x + box.width / 2, box.y + box.height / 2])).toBe("count");
  const unchanged = await page.locator("#frame").screenshot();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(count).not.toHaveText(before);
  await page.evaluate(() => window.runtimeProbe.settle());
  expect(await page.locator("#frame").screenshot()).not.toEqual(unchanged);
  expect((await lock(false)).mode).toBe("gpu");
  // The exemption is the viewport only: the same declaration on a wrapper around the canvas is a real single-axis clip.
  const clipped = await page.evaluate(async () => {
    const frame = document.querySelector("#frame"), wrapper = document.createElement("div");
    frame.before(wrapper); wrapper.append(frame); wrapper.style.overflowY = "clip";
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await window.runtimeProbe.settle();
    return window.runtimeProbe.state();
  });
  expect(clipped.mode).toBe("dom");
  expect(clipped.reason).toMatch(/Single-axis visible\/clip external overflow/);
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
  expect(errors).toEqual([]);
});
