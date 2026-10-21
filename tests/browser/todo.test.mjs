/**
 * Browser suite for the TODO application on `todo.html` (`window.todoProbe`, from
 * `examples/playground/src/demo/todo-demo.tsx` and `todo-probe.ts`): a realistic app with a task list, a detail
 * view with a native textarea, overlays, a native scroll list and a decorative completion effect, presented
 * through three enrolled layers on one GPU engine. It proves that the full user workflow works with real
 * keyboard, pointer and wheel input both with GPU and with ordinary DOM; that GPU ownership, native hits and
 * fresh pixels survive navigation, overlays, scrolling and transforms; that refused admissions (offscreen,
 * occluded, clip not applied, missing browser flags, capture exceptions) give a diagnosed reason and a usable
 * original DOM that can re-enter GPU; and that effect timers, HMR and disposal leave nothing live.
 * The viewport is 900x950 unless a test says otherwise; tests marked `strict` use the Vite dev server.
 */
import { chromium } from "@playwright/test";
import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL, previewURL } from "../helpers/urls.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";

// Taller than the 900x750 default set in playwright.config.mjs.
test.use({ viewport: { width: 900, height: 950 } });
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";
// Evidence directory for JSON reports and screenshots.
const directory = evidenceDirectory("todo");
async function save(name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
/** Opens `todo.html` (dev server with `?strict` when `strict`) and waits for the probe and the new-task input. */
async function ready(page, strict = false) {
  await page.goto(`${strict ? developmentURL : ""}/todo.html${strict ? "?strict" : ""}`);
  await page.waitForFunction(() => window.todoProbe && document.getElementById("new-task"));
}
/** Asserts that disposal left no GPU, runtime, effect-timer or demo-listener resources. */
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
  expect(state.transition.timers).toBe(0);
  expect(state.demoListeners).toBe(0);
}
/** Adds a task by typing into the "New task" input and pressing Enter. */
async function add(page, title) {
  await page.getByLabel("New task", { exact: true }).fill(title);
  await page.getByLabel("New task", { exact: true }).press("Enter");
}
/** Screenshots `#frame` (saved as evidence) and returns the decoded PNG. */
async function pixels(page, name) {
  await mkdir(directory, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
}
/** Counts pixels in a rectangle (screenshot pixels) where any RGBA channel differs between two PNGs. */
function differences(a, b, x, y, width, height) {
  let changed = 0;
  for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) {
    const offset = (row * a.width + col) * 4;
    if ([0, 1, 2, 3].some(channel => a.data[offset + channel] !== b.data[offset + channel])) changed++;
  }
  return changed;
}

// Chrome without the HTML-in-Canvas flags: the app remains fully usable as ordinary DOM (add, complete, edit,
// filter, open detail, overlay, delete). "Enable GPU" is refused with a reason naming the missing APIs
// (`requestPaint`, `canvas.content`) that is also shown in the status line, and the diagnostics panel is
// compact and starts collapsed.
for (const dpr of [1, 2]) test(`TODO app without experimental flags retains a useful real native workflow DPR${dpr}`, async () => {
  const browser = await chromium.launch(browserLaunchOptions({ native: false }));
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    await page.goto(`${previewURL}/todo.html`);
    await page.waitForFunction(() => window.todoProbe);
    await expect(page.locator("#diagnostic-details")).toHaveJSProperty("open", false);
    const inputBounds = await page.getByLabel("New task", { exact: true }).boundingBox();
    expect(inputBounds.y + inputBounds.height).toBeLessThan(750);
    const diagnostics = { inputBounds, status: await page.locator("#status").innerText(),
      statusBounds: await page.locator("#status").boundingBox() };
    expect(diagnostics.statusBounds.height).toBeLessThan(100);
    await page.locator("#diagnostic-details summary").click();
    await expect(page.locator("#ledger")).toContainText('"resources"');
    await page.locator("#diagnostic-details summary").click();
    const cdp = await page.context().newCDPSession(page);
    const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
    await cdp.detach();
    await add(page, "Ordinary DOM task");
    await page.getByLabel("Complete task 3", { exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Complete task 3", { exact: true })).toBeChecked();
    await page.getByLabel("Task 3 title", { exact: true }).fill("Edited without GPU");
    await page.getByLabel("Task 3 title", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
    await page.waitForFunction(() => !window.todoProbe.state().initializing && window.todoProbe.state().mode === "dom");
    const refused = await page.evaluate(() => window.todoProbe.state());
    expect(refused.reason).toContain("requestPaint");
    expect(refused.reason).toContain("canvas.content");
    await expect(page.locator("#status")).toContainText(refused.reason);
    await expect(page.getByLabel("Task 3 title", { exact: true })).toHaveValue("Edited without GPU");
    await page.getByLabel("Open task 3", { exact: true }).click();
    await expect(page.getByLabel("Detail title", { exact: true })).toBeFocused();
    await page.getByLabel("Task notes", { exact: true }).click();
    await page.keyboard.type("Original no-flags notes");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await page.getByRole("button", { name: "Task information", exact: true }).click();
    await expect(page.locator("#task-information")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Back to list", exact: true }).click();
    await expect(page.getByLabel("Open task 3", { exact: true })).toBeFocused();
    await page.getByLabel("Delete task 3", { exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await expect(page.getByRole("listitem")).toHaveCount(0);
    const disposed = await page.evaluate(() => window.todoProbe.dispose());
    zero(disposed);
    await save(`ordinary-no-flags-${dpr}`, { environment, diagnostics, refused, disposed });
  } finally { await browser.close(); }
});

// A task workflow performed under GPU with real input, then an explicit switch to ordinary DOM: the original
// root and input are the same elements, and the focused title input keeps its selection and value.
for (const strict of [false, true]) test(`TODO GPU workflows preserve original native state through DOM recovery strict=${strict}`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, strict);
  await page.evaluate(() => {
    window.originalRoot = window.todoProbe.controller().container;
    window.originalInput = document.getElementById("new-task");
  });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await add(page, "GPU native task");
  await page.getByLabel("Complete task 3", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Complete task 3", { exact: true })).toBeChecked();
  await page.getByLabel("Task 3 title", { exact: true }).fill("Edited by native input");
  await page.getByLabel("Task 3 title", { exact: true }).press("Enter");
  await expect(page.locator("#task-message")).toContainText("Title confirmed");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  const active = await page.evaluate(() => window.todoProbe.state());
  expect(active.mode).toBe("gpu");
  expect(active.resources.engines).toBe(1);
  expect(active.layers).toHaveLength(3);
  const input = page.getByLabel("Task 3 title", { exact: true });
  await input.click();
  await input.press("Home");
  await input.press("Shift+ArrowRight");
  const before = await input.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd }));
  await page.evaluate(() => window.todoProbe.controller().disable());
  await page.waitForFunction(() => window.todoProbe.state().mode === "dom");
  const continuity = await page.evaluate(() => ({
    sameRoot: window.originalRoot === window.todoProbe.controller().container,
    sameInput: window.originalInput === document.getElementById("new-task"),
    focus: document.activeElement?.getAttribute("aria-label"),
    selection: { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd },
  }));
  expect(continuity.sameRoot && continuity.sameInput).toBe(true);
  expect(continuity.focus).toBe("Task 3 title");
  expect(continuity.selection).toEqual(before);
  await expect(input).toHaveValue("Edited by native input");
  await page.getByLabel("Delete task 3", { exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  expect(errors).toEqual([]);
  await save(`workflow-${strict}`, { active, continuity, disposed, errors });
});

// A real checkbox click starts the completion effect. `holdEffect(t)` freezes it at a given phase so the
// pixels are deterministic: the effect area (460,490 280x140) differs from the neutral frame and between
// phases 0 and 0.7, while the region (20,20 420x660) is identical between those two phases. The layer geometry does not change, and
// 300 settled frames (1 ms apart) cost no commit, capture, copy, readback or upload. Reopening the task lets
// the effect end and the pixels return exactly to the neutral frame.
test("real task action produces decorative pixels and a settled shader-only interval", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  const identity = await pixels(page, "identity");
  await page.getByLabel("Complete task 1", { exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().transition.lastEvent?.kind === "completed");
  const triggered = await page.evaluate(() => window.todoProbe.state());
  expect(triggered.transition.timers).toBe(1);
  expect(triggered.decorativeEffects[0].playing).toBe(true);
  await page.evaluate(() => window.todoProbe.holdEffect(0));
  await page.getByRole("heading", { level: 1 }).click();
  await page.evaluate(() => window.todoProbe.controller().settle());
  const phase0 = await pixels(page, "task-phase-0");
  const geometry0 = await page.evaluate(() => window.todoProbe.state().layers);
  await page.evaluate(() => window.todoProbe.holdEffect(0.7));
  const phase7 = await pixels(page, "task-phase-07");
  expect(differences(identity, phase0, 460, 490, 280, 140)).toBeGreaterThan(100);
  expect(differences(phase0, phase7, 460, 490, 280, 140)).toBeGreaterThan(100);
  expect(differences(phase0, phase7, 20, 20, 420, 660)).toBe(0);
  expect(await page.evaluate(() => window.todoProbe.state().layers)).toEqual(geometry0);
  const interval = await page.evaluate(() => window.todoProbe.advance(300, 1));
  expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBe(300);
  expect(interval.after.commits.count).toBe(interval.before.commits.count);
  for (const field of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) {
    expect(interval.after.metrics[field]).toBe(interval.before.metrics[field]);
  }
  expect(interval.after.metrics.admission).toEqual(interval.before.metrics.admission);
  await page.getByLabel("Complete task 1", { exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().transition.lastEvent?.kind === "reopened");
  await page.waitForFunction(() => window.todoProbe.state().transition.timers === 0 && window.todoProbe.state().decorativeEffects.length === 0);
  await page.evaluate(() => window.todoProbe.controller().settle());
  const finished = await pixels(page, "natural-finish");
  expect(differences(identity, finished, 460, 490, 280, 140)).toBe(0);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await save("task-transition", { fixture: "real checkbox action; diagnostic timer hold/deterministic phases and 300 real RAFs at 1ms; subsequent real action ends naturally after 900ms",
    triggered, geometry0, changed: [differences(identity, phase0, 460, 490, 280, 140), differences(phase0, phase7, 460, 490, 280, 140)], interval, disposed });
});

// An exception thrown by the native capture call is a diagnosed fallback to DOM with the original task input
// and root intact and the typed edit kept. After the call is restored, an explicit enable is admitted again,
// a real viewport resize keeps GPU, and tasks can still be added.
test("capture failure and continuous viewport reconciliation preserve TODO edits", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await page.evaluate(() => {
    window.originalCapture = GPUQueue.prototype.drawElementImageToTexture;
    GPUQueue.prototype.drawElementImageToTexture = () => { throw new Error("TODO diagnostic capture failure"); };
    window.taskInput = document.querySelector('[aria-label="Task 1 title"]');
    window.taskRoot = window.todoProbe.controller().container;
  });
  await page.getByLabel("Task 1 title", { exact: true }).fill("Survives capture failure");
  await page.waitForFunction(() => window.todoProbe.state().mode === "dom");
  const failure = await page.evaluate(() => window.todoProbe.state());
  expect(failure.reason).toContain("TODO diagnostic capture failure");
  await expect(page.getByLabel("Task 1 title", { exact: true })).toHaveValue("Survives capture failure");
  expect(await page.evaluate(() => window.taskInput === document.querySelector('[aria-label="Task 1 title"]') && window.taskRoot === window.todoProbe.controller().container)).toBe(true);
  await page.evaluate(() => { GPUQueue.prototype.drawElementImageToTexture = window.originalCapture; });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  // Record every mode/reason change (and the settle outcome) so an intermittent failure (#71) reports what
  // actually happened instead of only "expected gpu".
  await page.evaluate(() => {
    const history = window.resizeHistory = [];
    const note = label => {
      const state = window.todoProbe.state();
      const last = history[history.length - 1];
      if (!last || last.mode !== state.mode || last.reason !== state.reason) history.push({ at: Math.round(performance.now()), label, mode: state.mode, reason: state.reason });
    };
    note("start");
    const watch = () => { note("frame"); if (!window.resizeHistoryStop) requestAnimationFrame(watch); };
    requestAnimationFrame(watch);
  });
  await page.setViewportSize({ width: 800, height: 980 });
  const diagnose = label => page.evaluate(({ label }) => {
    const state = window.todoProbe.state();
    return { label, mode: state.mode, reason: state.reason, diagnostics: state.diagnostics, metrics: state.metrics,
      innerWidth, innerHeight, history: window.resizeHistory };
  }, { label });
  const settled = await page.evaluate(() => window.todoProbe.controller().settle().then(() => null, error => String(error)));
  if (settled) throw new Error(`settle() failed after resize: ${settled}
${JSON.stringify(await diagnose("settle-failed"), null, 2)}`);
  const resized = await page.evaluate(() => window.todoProbe.state());
  expect(resized.mode, JSON.stringify(await diagnose("not-gpu-after-settle"), null, 2)).toBe("gpu");
  await page.evaluate(() => { window.resizeHistoryStop = true; });
  expect(resized.resources.engines).toBe(1);
  expect(await page.evaluate(() => window.taskInput === document.querySelector('[aria-label="Task 1 title"]')
    && window.taskRoot === window.todoProbe.controller().container)).toBe(true);
  await add(page, "After fresh admission");
  await expect(page.getByRole("listitem")).toHaveCount(3);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await save("fallback-reentry", { fixture: "synthetic capture exception and explicit reentry; subsequent real viewport resize remains GPU", failure, resized, disposed });
});

// At capacity (six tasks) a seventh is rejected with a visible message, while GPU keeps one engine and three
// layers.
test("six-task capacity stays one engine/three layers and rejects extra tasks explicitly", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  for (let index = 3; index <= 6; index++) await add(page, `Bounded task ${index}`);
  await expect(page.getByRole("listitem")).toHaveCount(6);
  await add(page, "One too many");
  await expect(page.locator("#task-message")).toContainText("six tasks");
  await expect(page.getByRole("listitem")).toHaveCount(6);
  const active = await page.evaluate(() => window.todoProbe.state());
  expect(active.mode).toBe("gpu");
  expect(active.resources.engines).toBe(1);
  expect(active.layers).toHaveLength(3);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await save("capacity", { active, disposed });
});

// Touching the demo source triggers a real HMR: the old probe, its running effect timer and its GPU resources
// are retired, and the new module starts fresh (task state is reset).
test("TODO development HMR retires active transition timers and old GPU resources", async ({ page }) => {
  await ready(page, true);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await page.getByLabel("Complete task 1", { exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().transition.timers === 1);
  await page.evaluate(() => { window.oldTodoProbe = window.todoProbe; });
  const path = "examples/playground/src/demo/todo-demo.tsx", original = await stat(path);
  try {
    await utimes(path, original.atime, new Date());
    await page.waitForFunction(() => window.todoProbe !== window.oldTodoProbe && document.getElementById("new-task"));
    const retired = await page.evaluate(() => window.oldTodoProbe.state());
    zero(retired);
    await expect(page.getByLabel("Complete task 1", { exact: true })).not.toBeChecked();
    await add(page, "After HMR");
    await expect(page.getByRole("listitem")).toHaveCount(3);
    const disposed = await page.evaluate(() => window.todoProbe.dispose());
    zero(disposed);
    await save("hmr", { fixture: "real timestamp-only Vite replacement; HMR intentionally creates a new root and resets task state", retired, disposed });
  } finally { await utimes(path, original.atime, original.mtime); }
});

// Moves the frame offscreen (left: 1100px) so native clipping cannot be proven: admission is refused with an
// exact diagnostic, no GPU resources exist, and the original DOM stays usable. Then `updateElementGeometry` is
// wrapped to drop `canvasClip`, which makes the clip ineffective: admission must refuse again (interior points
// not clipped). With the real call restored, enabling succeeds and the status line tracks each lifecycle step.
test("Phase13 rendered diagnostic categorizes actual offscreen refusal and explicit lifecycle", async ({ page }) => {
  await ready(page, true);
  await page.evaluate(() => {
    window.diagnosticRoot = window.todoProbe.controller().container;
    window.diagnosticInput = document.getElementById("new-task");
    document.activeElement?.blur();
    window.scrollTo(0, 0);
    // Push the frame out of the viewport.
    document.getElementById("frame").style.left = "1100px";
  });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => !window.todoProbe.state().initializing);
  const refused = await page.evaluate(() => window.todoProbe.state());
  await save("diagnostic-offscreen", { refused, status: await page.locator("#status").innerText() });
  expect(refused.reason).toBe("GPU admission failed: Error: Functional native clipping is unproven: admission deferred until the owning output probe is inside the viewport; explicitly enable again when visible");
  await expect(page.locator("#status")).toHaveText(`admission · dom: ${refused.reason}`);
  expect(refused.mode).toBe("dom");
  for (const key of ["engines", "pendingEngines", "textures", "effects", "renderers", "pendingCleanups", "probeElements", "probeReadbacks"]) expect(refused.resources[key]).toBe(0);
  await page.locator("#frame").evaluate(node => { node.style.left = "0"; });
  await page.getByLabel("New task", { exact: true }).click();
  await page.keyboard.type("Original DOM after refusal");
  await expect(page.getByLabel("New task", { exact: true })).toHaveValue("Original DOM after refusal");
  expect(await page.evaluate(() => window.todoProbe.state().mode)).toBe("dom");
  expect(await page.evaluate(() => window.diagnosticRoot === window.todoProbe.controller().container && window.diagnosticInput === document.getElementById("new-task"))).toBe(true);
  await page.evaluate(() => {
    window.diagnosticGeometry = HTMLCanvasElement.prototype.updateElementGeometry;
    HTMLCanvasElement.prototype.updateElementGeometry = function(element, options) {
      const { canvasClip, ...geometry } = options;
      return window.diagnosticGeometry.call(this, element, geometry);
    };
  });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => !window.todoProbe.state().initializing);
  const invalidClip = await page.evaluate(() => window.todoProbe.state());
  await save("diagnostic-no-op-clip", { invalidClip, status: await page.locator("#status").innerText() });
  expect(invalidClip.mode).toBe("dom");
  expect(invalidClip.reason).toMatch(/interior.*clipped/);
  await expect(page.locator("#status")).toHaveText(/^admission · dom:/);
  expect(invalidClip.resources.engines).toBe(0);
  await page.evaluate(() => { HTMLCanvasElement.prototype.updateElementGeometry = window.diagnosticGeometry; });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await expect(page.locator("#status")).toHaveText(/^active · gpu:/);
  await expect(page.getByLabel("New task", { exact: true })).toHaveValue("Original DOM after refusal");
  expect(await page.evaluate(() => window.diagnosticRoot === window.todoProbe.controller().container && window.diagnosticInput === document.getElementById("new-task"))).toBe(true);
  await page.getByRole("button", { name: "Use ordinary DOM", exact: true }).click();
  await expect(page.locator("#status")).toHaveText(/^lifecycle · dom: Explicit disable:/);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await expect(page.locator("#status")).toHaveText(/^lifecycle · disposed: Disposed root/);
  await save("diagnostic-reentry-disposal", { refused, disposed, status: await page.locator("#status").innerText() });
});

// The complete task workspace at each DPR. Order of checks: refused admission while offscreen, refused while an
// opaque element covers the frame (native hits unproven), then admission; native notes editing and scrolling,
// overlays outside the captured root, focus return and inert detail view, search, delete, native list scroll,
// pixels of the owning canvas, transformed hit geometry, live motion, reduced motion and forced colors,
// 300 settled frames, and disable/enable keeping the textarea's identity, focus and selection.
for (const dpr of [1, 2]) test.describe(`Phase13 task workspace DPR${dpr}`, () => {
  test.use({ deviceScaleFactor: dpr });
  test("list detail overlays and native scroll retain complete GPU ownership and settled independent motion", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await ready(page, true);
    await page.evaluate(() => {
      window.phase13Root = window.todoProbe.controller().container;
      window.phase13Input = document.getElementById("new-task");
      window.phase13Events = [];
      for (const type of ["pointerdown", "pointerup", "click", "keydown", "input", "submit", "scroll", "focusin"]) {
        document.addEventListener(type, event => window.phase13Events.push({
          type, trusted: event.isTrusted, target: event.target.id || event.target.getAttribute?.("aria-label"),
          path: event.composedPath().filter(node => node instanceof Element).map(node => node.id || node.tagName),
          mode: window.todoProbe.state().mode,
        }), true);
      }
    });
    await page.locator("#frame").evaluate(node => { node.style.left = "1100px"; });
    await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
    await page.waitForFunction(() => !window.todoProbe.state().initializing);
    const offscreen = await page.evaluate(() => window.todoProbe.state());
    await save(`phase13-offscreen-${dpr}`, offscreen);
    expect(offscreen.mode).toBe("dom"); expect(offscreen.reason).toMatch(/unproven|offscreen|viewport/i);
    for (const key of ["engines", "pendingEngines", "textures", "effects", "renderers", "pendingCleanups", "probeElements", "probeReadbacks"]) expect(offscreen.resources[key]).toBe(0);
    expect(offscreen.resources.roots).toBe(1);
    await page.locator("#frame").evaluate(node => {
      node.style.left = "0";
      const cover = document.createElement("div"); cover.id = "phase13-occluder";
      // An opaque cover above the frame makes the output not hit-testable, so admission must refuse.
      cover.style.cssText = "position:absolute;inset:0;z-index:100;background:white";
      node.append(cover);
    });
    await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
    await page.waitForFunction(() => !window.todoProbe.state().initializing);
    const occluded = await page.evaluate(() => window.todoProbe.state());
    await save(`phase13-occluded-${dpr}`, occluded);
    expect(occluded.mode).toBe("dom"); expect(occluded.reason).toMatch(/unproven|occlud|native hit/i);
    for (const key of ["engines", "pendingEngines", "textures", "effects", "renderers", "pendingCleanups", "probeElements", "probeReadbacks"]) expect(occluded.resources[key]).toBe(0);
    expect(occluded.resources.roots).toBe(1);
    await page.locator("#phase13-occluder").evaluate(node => node.remove());
    await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
    await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
    const initial = await page.evaluate(() => window.todoProbe.state());
    await page.getByLabel("Open task 1", { exact: true }).click();
    await expect(page.getByLabel("Detail title", { exact: true })).toBeFocused();
    const notes = page.getByLabel("Task notes", { exact: true });
    await notes.click();
    await page.keyboard.type("Native notes\n".repeat(24));
    await page.keyboard.press("End");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await expect(page.locator("#task-message")).toContainText("Saved:");
    const notesState = await notes.evaluate(node => ({
      value: node.value, scrollTop: node.scrollTop, selection: [node.selectionStart, node.selectionEnd, node.selectionDirection],
    }));
    expect(notesState.value).toBe("Native notes\n".repeat(24));
    expect(notesState.scrollTop).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Task information", exact: true }).click();
    await expect(page.locator("#task-information")).toBeVisible();
    expect(await page.locator("#task-information").evaluate(node => !window.phase13Root.contains(node))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#task-information")).not.toBeVisible();
    await page.getByRole("button", { name: "Delete selected task", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Detail title", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Back to list", exact: true }).click();
    await expect(page.getByLabel("Open task 1", { exact: true })).toBeFocused();
    expect(await page.locator("#todo-detail").evaluate(node => node.inert)).toBe(true);
    await page.getByLabel("Open task 1", { exact: true }).click();
    await expect(notes).toHaveValue(notesState.value);
    await page.getByRole("button", { name: "Back to list", exact: true }).click();
    await page.getByLabel("Open task 1", { exact: true }).click();
    await page.getByRole("button", { name: "Back to list", exact: true }).click();
    await page.getByLabel("Open task 2", { exact: true }).click();
    await expect(page.getByLabel("Detail title", { exact: true })).toHaveValue("Complete a task with Space");
    const search = page.getByLabel("Search tasks", { exact: true });
    await search.click(); await page.keyboard.type("no matching task");
    await expect(page.getByRole("listitem")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to list", exact: true }).click();
    await expect(search).toBeFocused();
    await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.press("Backspace");
    await page.getByLabel("Open task 2", { exact: true }).click();
    await page.getByRole("button", { name: "Delete selected task", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await expect(page.getByLabel("Open task 2", { exact: true })).toHaveCount(0);
    await expect(search).toBeFocused();
    for (let index = 0; index < 5; index++) await add(page, `Phase13 task ${index}`);
    const list = page.getByRole("list", { name: "Tasks", exact: true });
    await list.hover(); await page.mouse.wheel(0, 180);
    await expect.poll(() => list.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await list.evaluate(node => { node.scrollTop = node.scrollHeight; });
    await page.getByLabel("Open task 7", { exact: true }).click();
    await expect(page.getByLabel("Detail title", { exact: true })).toHaveValue("Phase13 task 4");
    await page.waitForTimeout(250);
    await page.evaluate(() => window.todoProbe.controller().settle());
    const png = PNG.sync.read(await page.locator("#output").screenshot({ path: `${directory}/phase13-owning-${dpr}.png` }));
    const scale = png.width / 760;
    const offset = (Math.floor(440 * scale) * png.width + Math.floor(720 * scale)) * 4;
    // Sample the owning canvas at (720, 440) of its 760-wide coordinate space (scaled by DPR); the colour must match.
    const sentinel = [...png.data.subarray(offset, offset + 4)];
    expect(sentinel).toEqual([224, 244, 232, 255]);
    const originalOpen = await page.getByLabel("Open task 7", { exact: true }).boundingBox();
    // Move the controls layer 60 px right: the native hit target must move with it. The old position must no
    // longer hit the control (and clicking there does nothing), the new position must.
    await page.evaluate(async () => { window.todoProbe.controller().setTransform("todo-controls", { x: 60 }); await window.todoProbe.controller().settle(); });
    const currentOpen = await page.getByLabel("Open task 7", { exact: true }).boundingBox();
    expect(currentOpen.x - originalOpen.x).toBeCloseTo(60, 1);
    const oldPoint = { x: originalOpen.x + 3, y: originalOpen.y + originalOpen.height / 2 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, oldPoint)).not.toBe("open-task-7");
    await page.mouse.click(oldPoint.x, oldPoint.y);
    await page.getByLabel("Open task 7", { exact: true }).click();
    const listBounds = await list.boundingBox();
    // A point just below the clipped list must not reach any task.
    const exterior = { x: listBounds.x + 40, y: listBounds.y + listBounds.height + 5 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-task-id]')?.getAttribute("data-task-id"), exterior)).toBeUndefined();
    await page.mouse.click(exterior.x, exterior.y);
    await page.evaluate(async () => { window.todoProbe.controller().setTransform("todo-controls", {}); await window.todoProbe.controller().settle(); });
    await page.evaluate(() => {
      // Live motion plus native list and window scrolling: the untransformed position of the controls layer must
      // already be white in the canvas, GPU frames keep being presented and the layer count stays three.
      window.phase13LiveMotion = window.todoProbe.controller().transition("todo-controls", {
        keyframes: [{ offset: 0, x: 60 }, { offset: 1, x: 100 }], timing: { duration: 1200 },
      });
      document.querySelector('[role="list"]').scrollTop -= 30;
      window.scrollTo(0, 20);
    });
    const liveBefore = await page.evaluate(() => window.todoProbe.state());
    const livePNG = PNG.sync.read(await page.locator("#output").screenshot({ path: `${directory}/phase13-live-owning-${dpr}.png` }));
    const liveOld = (Math.floor(650 * scale) * livePNG.width + Math.floor(22 * scale)) * 4;
    expect([...livePNG.data.subarray(liveOld, liveOld + 4)]).toEqual([255, 255, 255, 255]);
    const liveGeometry = await page.locator("#todo-controls").boundingBox();
    const liveAfter = await page.evaluate(() => window.todoProbe.state());
    expect(liveBefore.mode).toBe("gpu"); expect(liveAfter.mode).toBe("gpu");
    expect(liveAfter.metrics.gpuFrames).toBeGreaterThan(liveBefore.metrics.gpuFrames);
    expect(liveAfter.layers).toHaveLength(3);
    await page.evaluate(async () => { window.phase13LiveMotion.cancel(); window.todoProbe.controller().setTransform("todo-controls", {}); await window.todoProbe.controller().settle(); });
    const beforeMedia = await page.evaluate(() => window.todoProbe.state());
    // Reduced motion and forced colors must not revoke GPU while a task is completed with the keyboard.
    await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
    await page.getByLabel("Complete selected task", { exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Complete selected task", { exact: true })).toBeChecked();
    await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
    await page.waitForFunction(() => window.todoProbe.state().transition.timers === 0);
    await page.getByRole("heading", { level: 1 }).click();
    await page.evaluate(async () => {
      await window.todoProbe.controller().settle();
      window.todoProbe.controller().setRipple("todo-decoration", { amplitude: 4, seconds: 0, playing: false });
      for (let index = 0; index < 30; index++) await new Promise(requestAnimationFrame);
      await window.todoProbe.controller().settle();
    });
    // 300 settled frames: no capture, upload, readback or commit, and the engine and layers are unchanged.
    const interval = await page.evaluate(() => window.todoProbe.advance(300, 1));
    await save(`phase13-preassert-${dpr}`, { initial, notesState, sentinel, liveBefore, liveAfter, liveGeometry, beforeMedia, interval,
      events: await page.evaluate(() => window.phase13Events) });
    expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBe(300);
    for (const key of ["captures", "uploads", "pixelReadbacks", "pixelCopies"]) expect(interval.after.metrics[key]).toBe(interval.before.metrics[key]);
    expect(interval.after.commits.count).toBe(interval.before.commits.count);
    expect(interval.after.resources.engines).toBe(1);
    expect(interval.after.layers).toHaveLength(3);
    expect(interval.after.mode).toBe("gpu");
    expect(interval.after.publication.pending).toBe(false);
    expect(await page.evaluate(() => window.phase13Root === window.todoProbe.controller().container && window.phase13Input === document.getElementById("new-task"))).toBe(true);
    const events = await page.evaluate(() => window.phase13Events);
    expect(events.filter(event => event.type === "click" && event.trusted && event.mode === "gpu").length).toBeGreaterThan(10);
    await notes.click();
    await page.keyboard.type("Keep native selection");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    await page.evaluate(() => {
      window.phase13Note = document.getElementById("detail-notes");
      window.phase13Selection = [window.phase13Note.value, window.phase13Note.selectionStart, window.phase13Note.selectionEnd, window.phase13Note.selectionDirection];
    });
    await page.evaluate(() => window.todoProbe.controller().disable());
    expect(await notes.evaluate(node => node === window.phase13Note && document.activeElement === node
      && JSON.stringify([node.value, node.selectionStart, node.selectionEnd, node.selectionDirection]) === JSON.stringify(window.phase13Selection))).toBe(true);
    await expect(page.getByLabel("Detail title", { exact: true })).toHaveValue("Phase13 task 4");
    await page.evaluate(() => window.todoProbe.controller().enable());
    await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
    expect(await notes.evaluate(node => node === window.phase13Note && document.activeElement === node
      && JSON.stringify([node.value, node.selectionStart, node.selectionEnd, node.selectionDirection]) === JSON.stringify(window.phase13Selection))).toBe(true);
    const disposed = await page.evaluate(() => window.todoProbe.dispose());
    zero(disposed); expect(errors).toEqual([]);
    await save(`phase13-workflow-${dpr}`, { initial, notesState, sentinel, liveBefore, liveAfter, liveGeometry, beforeMedia, interval, events,
      liveCaptureDelta: interval.before.metrics.captures - initial.metrics.captures, disposed, errors });
  });
});
