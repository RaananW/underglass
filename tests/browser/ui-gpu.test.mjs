/**
 * Browser suite for `@underglass/ui/gpu` on `ui-gpu.html` (`window.strataGpuProbe`): a Strata panel of native controls,
 * enrolled with `@underglass/core` and presented on the GPU with core's relief material. It proves that GPU stays on
 * with face mode set, that the scene follows the panel's markup, tokens and states (hover, press, focus, checked,
 * value), that pixels stay fresh and native input reaches the controls, that the outset shows the panel's shadow,
 * that returning to ordinary DOM gives the CSS relief back, and that panel motion moves the panel through depth on the
 * GPU. Pixels are decoded from `#frame` screenshots.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-gpu");

async function ready(page, query = "") {
  await page.goto(`/ui-gpu.html${query}`);
  await page.waitForFunction(() => window.strataGpuProbe && window.strataGpuProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataGpuProbe.scene() !== undefined);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
}
async function snap(page, name) {
  await page.evaluate(async () => { window.strataGpuProbe.refresh(); await window.strataGpuProbe.controller.settle(); });
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 760;
  return (x, y) => [...png.data.subarray((Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4, (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4 + 3)];
}
/** The scene's primitive for the element with `id`, matched by its rectangle. */
async function primitiveOf(page, selector) {
  return page.evaluate(selector => {
    const probe = window.strataGpuProbe, panel = probe.panel(), element = panel.querySelector(selector);
    probe.refresh();
    const outer = panel.getBoundingClientRect(), inner = element.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) < 0.5;
    return probe.scene().primitives.find(primitive => near(primitive.rect[0], inner.left - outer.left) && near(primitive.rect[1], inner.top - outer.top)
      && near(primitive.rect[2], inner.width)) ?? null;
  }, selector);
}
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test("Strata panels are GPU-presented in face mode with a scene from their markup, tokens and states", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const initial = await page.evaluate(() => {
    const probe = window.strataGpuProbe, state = probe.controller.state(), scene = probe.scene();
    return { mode: state.mode, reason: state.reason, layers: state.layers.map(layer => layer.id), materials: state.materials,
      face: probe.panel().getAttribute("data-strata-mode"), faces: scene.primitives.map(primitive => primitive.face), scene };
  });
  expect(initial.mode, initial.reason).toBe("gpu");
  expect(initial.layers).toEqual(["gpu-panel"]);
  expect(initial.face).toBe("face");
  expect(initial.materials).toEqual([expect.objectContaining({ id: "gpu-panel", kind: "relief" })]);
  // Panel, field, checkbox well and mark, switch well and knob, slider groove and knob, four buttons, spinner ring.
  expect(initial.faces).toEqual(["raised", "well", "well", "mark", "well", "knob", "groove", "knob", "raised", "raised", "raised", "raised", "ring"]);
  // Token values resolve through the stylesheet: depth 50% in the light theme.
  expect(initial.scene).toMatchObject({ light: { azimuth: 323, elevation: 41 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, backdrop: "#ffffff", focus: { colour: "#2563eb", width: 3, offset: 0.5 } });
  expect(initial.scene.primitives[0]).toMatchObject({ face: "raised", height: 8, material: "matte" });
  expect(await primitiveOf(page, "#gpu-save")).toMatchObject({ face: "raised", height: 3, finish: true, state: { hover: false, disabled: false } });
  expect(await primitiveOf(page, "#gpu-disabled")).toMatchObject({ state: { disabled: true } });
  expect(initial.scene.materials.metal).toMatchObject({ base: { metallic: 1 } });

  // GPU relief: the panel's shadow falls into the outset below it, where CSS face mode draws nothing.
  const panelBox = await page.evaluate(() => { const panel = window.strataGpuProbe.panel(); return { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight }; });
  const pixel = await snap(page, "gpu");
  expect(luma(pixel(panelBox.x + panelBox.w / 2, panelBox.y + panelBox.h + 3))).toBeLessThan(240);

  // States follow the pointer and the keyboard, with no rebuild of the pass.
  const revision = await page.evaluate(() => window.strataGpuProbe.controller.state().registryRevision);
  await page.locator("#gpu-save").hover();
  expect(await primitiveOf(page, "#gpu-save")).toMatchObject({ state: { hover: true } });
  await page.locator("#gpu-save").click();
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  await expect(page.locator("#gpu-count")).toHaveText("Saved 1 times");
  // Keyboard focus shows the focus edge: Tab from Save lands on the disabled button's neighbour, so focus the field
  // and confirm it matches :focus-visible, as keyboard focus does.
  await page.locator("#gpu-name").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("gpu-name");
  expect(await primitiveOf(page, "#gpu-name")).toMatchObject({ state: { focus: true } });
  // Native input: typing, toggling and sliding reach the original controls, and the scene follows.
  await page.locator("#gpu-name").fill("Grace Hopper");
  await expect(page.locator("#gpu-name")).toHaveValue("Grace Hopper");
  const knobBefore = await page.evaluate(() => window.strataGpuProbe.scene().primitives.filter(primitive => primitive.face === "knob").map(primitive => primitive.rect[0]));
  await page.locator("#gpu-wifi").check();
  await page.locator("#gpu-volume").fill("90");
  // The switch knob slides with a CSS transition; the scene follows it to the end.
  await page.waitForFunction(() => !window.strataGpuProbe.panel().getAnimations({ subtree: true }).some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await window.strataGpuProbe.controller.settle(); });
  const knobAfter = await page.evaluate(() => window.strataGpuProbe.scene().primitives.filter(primitive => primitive.face === "knob").map(primitive => primitive.rect[0]));
  expect(knobAfter[0]).toBeGreaterThan(knobBefore[0]);
  expect(knobAfter[1]).toBeGreaterThan(knobBefore[1]);
  const after = await page.evaluate(() => window.strataGpuProbe.controller.state());
  expect(after.mode).toBe("gpu");
  expect(after.registryRevision).toBe(revision);
  expect(errors).toEqual([]);
});

// The helper reads a panel (its boxes, computed styles and text) only when something happened to it. A build starts by
// reading the panel's computed style, which nothing else on this page does, so those reads count the builds. The poll
// (every panel, every half second by default) is set long, so it cannot be what brings a scene up to date here.
test("only the panel something happened to has its scene built again, and a change that no event reports still reaches the other", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    const original = window.getComputedStyle, reads = window.__reads = {};
    window.getComputedStyle = function (element, ...rest) { if (element?.id === "gpu-panel" || element?.id === "gpu-side") reads[element.id] = (reads[element.id] ?? 0) + 1; return original.call(this, element, ...rest); };
  });
  await ready(page, "?level=objects&poll=600000");
  await page.evaluate(async () => { const probe = window.strataGpuProbe; probe.addPanel(); probe.refresh(); await probe.controller.settle(); });
  const frames = count => page.evaluate(count => new Promise(done => { const step = left => (left ? requestAnimationFrame(() => step(left - 1)) : done()); step(count); }), count);
  const reads = () => page.evaluate(() => ({ main: window.__reads["gpu-panel"] ?? 0, side: window.__reads["gpu-side"] ?? 0 }));
  const sideScene = () => page.evaluate(() => JSON.stringify(window.strataGpuProbe.sceneOf(window.strataGpuProbe.side())));
  const state = () => page.evaluate(() => { const state = window.strataGpuProbe.controller.state(); return { mode: state.mode, reason: state.reason, layers: state.layers.map(layer => layer.id) }; });
  expect((await state()).layers).toEqual(["gpu-panel", "gpu-side"]);
  expect(await sideScene()).toContain('"primitives"');
  // The pointer goes to rest outside both panels, and the frames after it build nothing.
  await page.mouse.move(700, 480);
  // What the move and the start of the page still had to deliver (a pointer event, a status change) may come some frames
  // late on a busy machine: the page is at rest once ten frames pass with nothing read.
  let rest = await reads();
  await expect.poll(async () => { const before = rest; await frames(10); rest = await reads(); return rest.main === before.main && rest.side === before.side; },
    { message: "at rest no scene is built", timeout: 10000 }).toBe(true);
  const mainAtRest = await page.evaluate(() => JSON.stringify(window.strataGpuProbe.scene()));

  // The pointer crosses the first panel's controls: its scene follows (hover), and the other panel is not read once.
  const save = await page.locator("#gpu-save").boundingBox(), cancel = await page.locator("#gpu-cancel").boundingBox();
  for (let step = 0; step <= 12; step++) { await page.mouse.move(cancel.x + 6 + (save.x + save.width - cancel.x - 12) * step / 12, save.y + save.height / 2); await frames(1); }
  await frames(3);
  const hovered = await reads();
  expect(hovered.main, "the panel under the pointer is built again").toBeGreaterThan(rest.main);
  expect(hovered.side, "the other panel is not read").toBe(rest.side);
  expect(await page.evaluate(() => JSON.stringify(window.strataGpuProbe.scene())), "its scene has the hovered key").not.toBe(mainAtRest);

  // A script checks the other panel's box: no event, no attribute. The next frame the helper has a reason to run (the
  // pointer moves on in the first panel) finds it, long before the poll.
  const before = { scene: await sideScene(), reads: await reads(), shot: PNG.sync.read(await page.locator("#frame").screenshot()) };
  await page.evaluate(() => { document.querySelector("#gpu-side-check").checked = true; });
  await page.mouse.move(cancel.x + cancel.width / 2, cancel.y + cancel.height / 2);
  await frames(4);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  const after = { scene: await sideScene(), reads: await reads() };
  expect(after.reads.side, "the panel whose box changed is built again").toBeGreaterThan(before.reads.side);
  expect(after.scene, "its scene has the checked box").not.toBe(before.scene);
  // Fresh pixels: the mark is drawn in the box.
  const box = await page.locator("#gpu-side .ug-checkbox__mark").boundingBox(), frame = await page.locator("#frame").boundingBox();
  const shot = PNG.sync.read(await page.locator("#frame").screenshot()), ratio = shot.width / 760;
  let changed = 0;
  for (let y = Math.floor((box.y - frame.y) * ratio); y < Math.ceil((box.y - frame.y + box.height) * ratio); y++) {
    for (let x = Math.floor((box.x - frame.x) * ratio); x < Math.ceil((box.x - frame.x + box.width) * ratio); x++) {
      const at = (y * shot.width + x) * 4;
      if ([0, 1, 2].some(channel => Math.abs(shot.data[at + channel] - before.shot.data[at + channel]) > 24)) changed++;
    }
  }
  expect(changed, "the checked mark is presented").toBeGreaterThan(8);

  // The first panel changes in a way that moves the other (no event or attribute on the other): its camera follows.
  const vanish = () => page.evaluate(() => window.strataGpuProbe.sceneOf(window.strataGpuProbe.side()).camera.vanish[0]);
  const was = await vanish();
  await page.addStyleTag({ content: "#gpu-panel.moved ~ #gpu-side { margin-left: 10px; }" });
  await page.evaluate(() => document.querySelector("#gpu-panel").classList.add("moved"));
  await frames(4);
  expect(await vanish(), "the moved panel's camera is where the stage's centre now is").toBeCloseTo(was - 10, 1);

  // Native hits: a real click reaches the other panel's button where it is drawn, and GPU is on throughout.
  const press = await page.locator("#gpu-side-press").boundingBox();
  await page.mouse.click(press.x + press.width / 2, press.y + press.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.presses())).toBe(1);
  const end = await state();
  expect(end.mode, end.reason).toBe("gpu");
  expect(errors).toEqual([]);
});

test("only controls take hover and press on the GPU: a card or a plinth under the pointer stays where it is", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    window.strataGpuProbe.panel().insertAdjacentHTML("beforeend", `<article class="ug-card" data-strata-face="raised" id="gpu-card" style="margin-top:12px"><p style="margin:0">A card</p></article>
      <div class="ug-button-group" role="group" aria-label="View" data-strata-face="raised" id="gpu-plinth" style="margin-top:12px"><button type="button" class="ug-button" data-strata-face="raised" id="gpu-list"><span class="ug-button__label">List</span></button></div>`);
    window.strataGpuProbe.refresh();
    await window.strataGpuProbe.controller.settle();
  });
  const state = async selector => (await primitiveOf(page, selector)).state;
  // Hovering and pressing on a card changes nothing in its scene entry.
  const card = await page.locator("#gpu-card").boundingBox();
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  expect(await state("#gpu-card")).toMatchObject({ hover: false, pressed: false });
  await page.mouse.down();
  expect(await state("#gpu-card")).toMatchObject({ hover: false, pressed: false });
  await page.mouse.up();
  // On a button in a plinth, the button is hovered and pressed; the plinth is not.
  const button = await page.locator("#gpu-list").boundingBox();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2);
  expect(await state("#gpu-list")).toMatchObject({ hover: true });
  expect(await state("#gpu-plinth")).toMatchObject({ hover: false, pressed: false });
  await page.mouse.down();
  expect(await state("#gpu-list")).toMatchObject({ hover: true, pressed: true });
  expect(await state("#gpu-plinth")).toMatchObject({ hover: false, pressed: false });
  await page.mouse.up();
  // A preview still shows a state on any face, for specimens.
  await page.evaluate(() => document.getElementById("gpu-card").setAttribute("data-strata-preview", "hover"));
  expect(await state("#gpu-card")).toMatchObject({ hover: true });
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
});

test("ordinary DOM gives the CSS relief back, and GPU returns to face mode", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => { await window.strataGpuProbe.controller.disable(); window.strataGpuProbe.refresh(); });
  const dom = await page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, face: window.strataGpuProbe.panel().getAttribute("data-strata-mode"),
    shadow: getComputedStyle(window.strataGpuProbe.panel()).boxShadow, materials: window.strataGpuProbe.controller.state().materials }));
  expect(dom.mode).toBe("dom");
  expect(dom.face).toBeNull();
  expect(dom.shadow).not.toBe("none");
  expect(dom.materials).toEqual([]);
  await page.evaluate(async () => { await window.strataGpuProbe.controller.enable(); window.strataGpuProbe.refresh(); await window.strataGpuProbe.controller.settle(); });
  // The CSS shadow fades out over the motion duration once face mode is on.
  await page.waitForFunction(() => getComputedStyle(window.strataGpuProbe.panel()).boxShadow === "none");
  const gpu = await page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, face: window.strataGpuProbe.panel().getAttribute("data-strata-mode"),
    shadow: getComputedStyle(window.strataGpuProbe.panel()).boxShadow, materials: window.strataGpuProbe.controller.state().materials.length }));
  expect(gpu).toEqual({ mode: "gpu", face: "face", shadow: "none", materials: 1 });
  // Detaching restores the CSS presentation and releases the layer.
  const detached = await page.evaluate(() => { window.strataGpuProbe.detach(); const state = window.strataGpuProbe.controller.state();
    return { layers: state.layers.length, materials: state.materials.length, face: window.strataGpuProbe.panel().getAttribute("data-strata-mode") }; });
  expect(detached).toEqual({ layers: 0, materials: 0, face: null });
});

test("panel motion carries a presented panel through depth on the GPU, inert while it moves", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const box = await page.evaluate(() => { const panel = window.strataGpuProbe.panel(); return { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight }; });
  // A point on the panel's face, clear of its controls, and the backdrop beside it.
  const face = [box.x + box.w - 30, box.y + 20];
  const resting = await snap(page, "motion-resting");
  const restingFace = resting(...face);
  expect(Math.abs(luma(restingFace) - luma(resting(20, 20)))).toBeGreaterThan(4);

  // Leaving, tilted: the layer moves through depth while the panel is inert, and its scene rises towards the modal level.
  await page.evaluate(() => { window.leaving = window.strataGpuProbe.leave({ tilt: 12 }); });
  await page.waitForFunction(() => { const layer = window.strataGpuProbe.controller.state().layers[0]; return layer.transform.opacity < 0.9 && layer.transform.opacity > 0.1; });
  const moving = await page.evaluate(() => {
    const probe = window.strataGpuProbe, layer = probe.controller.state().layers[0];
    probe.refresh();
    return { mode: probe.controller.state().mode, inert: probe.panel().inert, motion: probe.panel().getAttribute("data-strata-motion"),
      origin: layer.origin, transform: layer.transform, height: probe.scene().primitives[0].height };
  });
  expect(moving).toMatchObject({ mode: "gpu", inert: true, motion: null, origin: "center" });
  expect(moving.transform.tiltX).toBeGreaterThan(0);
  expect(moving.transform.scaleX).toBeGreaterThan(1);
  // The scene height travels from the panel's own level (8) towards the modal one (24) on the motion's easing.
  expect(moving.height).toBeGreaterThan(9);
  expect(moving.height).toBeLessThan(24);
  await page.evaluate(() => window.leaving);
  const left = await page.evaluate(() => {
    const probe = window.strataGpuProbe, state = probe.controller.state();
    return { mode: state.mode, inert: probe.panel().inert, motion: probe.panel().getAttribute("data-strata-motion"), opacity: state.layers[0].transform.opacity };
  });
  expect(left).toEqual({ mode: "gpu", inert: true, motion: "leave", opacity: 0 });
  // Nothing of the panel is drawn: its face shows the backdrop.
  const gone = await snap(page, "motion-left");
  expect(Math.abs(luma(gone(...face)) - luma(gone(20, 20)))).toBeLessThan(2);

  // Entering again brings the same pixels back, and native input reaches the controls once it has settled.
  await page.evaluate(() => window.strataGpuProbe.enter({ tilt: 12 }));
  const entered = await page.evaluate(() => {
    const probe = window.strataGpuProbe, state = probe.controller.state();
    probe.refresh();
    return { mode: state.mode, inert: probe.panel().inert, motion: probe.panel().getAttribute("data-strata-motion"), transform: state.layers[0].transform,
      height: probe.scene().primitives[0].height };
  });
  expect(entered).toMatchObject({ mode: "gpu", inert: false, motion: null, transform: { opacity: 1, scaleX: 1, scaleY: 1 }, height: 8 });
  expect(entered.transform.tiltX ?? 0).toBe(0);
  const back = await snap(page, "motion-entered");
  expect(back(...face).every((channel, index) => Math.abs(channel - restingFace[index]) <= 2)).toBe(true);
  await page.locator("#gpu-save").click();
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  expect(errors).toEqual([]);
});

test("under reduced motion, panel motion on the GPU is instant", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const result = await page.evaluate(async () => {
    const probe = window.strataGpuProbe, started = performance.now();
    await probe.leave({ tilt: 12 });
    const left = { opacity: probe.controller.state().layers[0].transform.opacity, motion: probe.panel().getAttribute("data-strata-motion") };
    await probe.enter();
    return { left, ms: performance.now() - started, mode: probe.controller.state().mode, opacity: probe.controller.state().layers[0].transform.opacity, inert: probe.panel().inert };
  });
  expect(result.left).toEqual({ opacity: 0, motion: "leave" });
  expect(result).toMatchObject({ mode: "gpu", opacity: 1, inert: false });
  expect(result.ms).toBeLessThan(250);
});

test("a Dialog rendered into the root is its own GPU panel over a faded scrim, modal, and let go before it hides", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const before = await snap(page, "dialog-before");
  const panelBox = await page.evaluate(() => { const panel = window.strataGpuProbe.panel(); return { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight }; });
  const onPanel = [panelBox.x + panelBox.w - 30, panelBox.y + 20];
  // Opened by a real click through the GPU: the scrim and the dialog become layers in the same task, so GPU never
  // leaves, and the dialog enters through depth on the GPU.
  await page.locator("#gpu-open").click();
  await page.waitForFunction(() => document.activeElement?.id === "gpu-dialog-cancel");
  const open = await page.evaluate(async () => {
    const probe = window.strataGpuProbe;
    await probe.controller.settle();
    const state = probe.controller.state(), dialog = probe.dialog();
    return { mode: state.mode, layers: state.layers.map(layer => layer.id), materials: state.materials.map(material => `${material.id}:${material.kind}`),
      face: dialog.getAttribute("data-strata-mode"), centred: [dialog.offsetLeft * 2 + dialog.offsetWidth, dialog.offsetTop * 2 + dialog.offsetHeight],
      stage: [probe.panel().parentElement.offsetWidth, probe.panel().parentElement.offsetHeight], inert: probe.panel().inert, zIndex: getComputedStyle(dialog).zIndex };
  });
  expect(open.mode).toBe("gpu");
  expect(open.layers).toEqual(["gpu-panel", expect.stringMatching(/^strata-scrim-/), "gpu-dialog"]);
  expect(open.materials).toEqual(["gpu-panel:relief", "gpu-dialog:relief"]);
  expect(open).toMatchObject({ face: "face", inert: true, zIndex: "auto" });
  // Centred on the stage (the Underglass root), not the viewport.
  expect(Math.abs(open.centred[0] - open.stage[0])).toBeLessThanOrEqual(1);
  expect(Math.abs(open.centred[1] - open.stage[1])).toBeLessThanOrEqual(1);
  // Pixels are fresh: the scrim dims the panel behind the dialog.
  await page.waitForFunction(() => window.strataGpuProbe.controller.state().layers.every(layer => (layer.transform.opacity ?? 1) === 1));
  const dimmed = await snap(page, "dialog-open");
  expect(luma(dimmed(...onPanel))).toBeLessThan(luma(before(...onPanel)) - 40);
  // The accessibility tree is the same as in ordinary DOM.
  const gpuTree = await page.locator("#gpu-dialog").ariaSnapshot();
  // A real click on Delete lands on the drawn button and closes the dialog; both layers are let go before they hide.
  const remove = await page.locator("#gpu-dialog-delete").boundingBox();
  await page.mouse.click(remove.x + remove.width / 2, remove.y + remove.height / 2);
  await page.waitForFunction(() => !window.strataGpuProbe.dialog());
  const closed = await page.evaluate(() => { const probe = window.strataGpuProbe, state = probe.controller.state();
    return { mode: state.mode, layers: state.layers.map(layer => layer.id), closes: probe.closes(), active: document.activeElement?.id, inert: probe.panel().inert }; });
  expect(closed).toEqual({ mode: "gpu", layers: ["gpu-panel"], closes: ["delete"], active: "gpu-open", inert: false });
  // Escape closes it too, and focus returns to the opener.
  await page.locator("#gpu-open").click();
  await page.waitForFunction(() => document.activeElement?.id === "gpu-dialog-cancel");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.strataGpuProbe.dialog());
  expect(await page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, closes: window.strataGpuProbe.closes(), active: document.activeElement?.id })))
    .toEqual({ mode: "gpu", closes: ["delete", "escape"], active: "gpu-open" });
  // In ordinary DOM the same dialog has the same accessibility tree.
  await page.evaluate(() => window.strataGpuProbe.controller.disable());
  await page.locator("#gpu-open").click();
  await page.waitForFunction(() => document.activeElement?.id === "gpu-dialog-cancel");
  expect(await page.locator("#gpu-dialog").ariaSnapshot()).toBe(gpuTree);
  expect(errors).toEqual([]);
});

test("on the GPU a Drawer with closeOnScrim closes on a real click outside it, and a Dialog without it stays open", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => window.strataGpuProbe.openDrawer());
  await page.waitForFunction(() => window.strataGpuProbe.controller.state().layers.some(layer => layer.id === "gpu-drawer"));
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  const layers = () => page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, layers: window.strataGpuProbe.controller.state().layers.map(layer => layer.id) }));
  expect(await layers()).toEqual({ mode: "gpu", layers: ["gpu-panel", expect.stringMatching(/^strata-scrim-/), "gpu-drawer"] });
  const drawer = await page.locator("#gpu-drawer").boundingBox(), stage = await page.evaluate(() => { const { x, y } = window.strataGpuProbe.root().getBoundingClientRect(); return { x, y }; });
  // On the end edge of the stage, so its start side is scrim.
  const outside = [stage.x + 20, stage.y + 20];
  expect(outside[0]).toBeLessThan(drawer.x);
  // A click inside the drawer (on its body) keeps it open.
  await page.mouse.click(drawer.x + drawer.width / 2, drawer.y + drawer.height / 2);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.dialog()?.id)).toBe("gpu-drawer");
  // A real click outside it, on the scrim drawn by the GPU, closes it; the layers are let go and GPU stays on.
  await page.mouse.click(...outside);
  await page.waitForFunction(() => !window.strataGpuProbe.dialog());
  expect(await page.evaluate(() => window.strataGpuProbe.closes())).toEqual(["scrim"]);
  expect(await layers()).toEqual({ mode: "gpu", layers: ["gpu-panel"] });
  expect(await page.evaluate(() => window.strataGpuProbe.panel().inert)).toBe(false);

  // The Dialog leaves closeOnScrim off: the same click does nothing, and Escape still closes it.
  await page.locator("#gpu-open").click();
  await page.waitForFunction(() => document.activeElement?.id === "gpu-dialog-cancel");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  await page.mouse.click(...outside);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.dialog()?.id)).toBe("gpu-dialog");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !window.strataGpuProbe.dialog());
  expect(await page.evaluate(() => window.strataGpuProbe.closes())).toEqual(["scrim", "escape"]);
  expect(await layers()).toEqual({ mode: "gpu", layers: ["gpu-panel"] });
  expect(errors).toEqual([]);
});

test("at the Objects level, the panel's components are objects on core's objects material, and native input still reaches them", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "?level=objects");
  const initial = await page.evaluate(() => {
    const probe = window.strataGpuProbe, state = probe.controller.state(), scene = probe.scene();
    return { mode: state.mode, materials: state.materials, version: scene.version, camera: scene.camera,
      entries: scene.primitives.map(entry => entry.object ?? entry.face),
      domes: [...probe.panel().querySelectorAll("[data-strata-dome]")].map(element => element.className),
      knobPaint: getComputedStyle(probe.panel().querySelector(".ug-switch__knob")).backgroundImage };
  });
  expect(initial.mode).toBe("gpu");
  expect(initial.version).toBe(2);
  expect(initial.materials).toEqual([expect.objectContaining({ id: "gpu-panel", kind: "objects", degraded: [] })]);
  // The panel is a slab; the field a relief well with a bezel; the checkbox and switch wells with their mark and knob;
  // the slider a rail and a puck; the buttons keys; the spinner stays a relief ring.
  expect(initial.entries).toEqual(["slab", "well", "bezel", "well", "mark", "well", "knob", "rail", "puck", "key", "key", "key", "key", "ring"]);
  // The camera is centred on the stage, far enough for every solid's taper rule.
  expect(initial.camera.distance).toBeGreaterThanOrEqual(1600);
  // The GPU draws the knob and the slider's puck as domes, so their own CSS paint is hidden.
  expect(initial.domes).toEqual(["ug-switch__knob", "ug-slider"]);
  expect(initial.knobPaint).toBe("none");

  // Keys travel: pressing Save holds its key down in the scene, and the click reaches the button.
  const save = await page.locator("#gpu-save").boundingBox();
  await page.mouse.move(save.x + save.width / 2, save.y + save.height / 2);
  await page.mouse.down();
  const pressed = await page.evaluate(() => { const probe = window.strataGpuProbe; probe.refresh();
    return probe.scene().primitives.find(entry => entry.object === "key" && entry.state.pressed) ?? null; });
  await page.mouse.up();
  expect(pressed).toMatchObject({ object: "key", height: 8, travel: 6, base: 8 });
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  // The switch toggles from a click on its drawn knob, and the knob dome follows the native state.
  const knob = await page.locator(".ug-switch__knob").boundingBox();
  await page.mouse.click(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await expect(page.locator("#gpu-wifi")).toBeChecked();
  // Pixels are fresh: the key above the switch looks different pressed and at rest.
  const panelBox = await page.evaluate(() => { const panel = window.strataGpuProbe.panel(); return { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight }; });
  const pixel = await snap(page, "objects");
  expect(luma(pixel(panelBox.x + panelBox.w / 2, panelBox.y + panelBox.h + 3))).toBeLessThan(240);

  // A component can opt out: back at the Relief level, the scene is version 1 again on the relief material.
  await page.evaluate(() => window.strataGpuProbe.panel().setAttribute("data-strata-level", "relief"));
  const relief = await page.evaluate(async () => { const probe = window.strataGpuProbe; probe.refresh(); await probe.controller.settle();
    return { version: probe.scene().version, kind: probe.controller.state().materials[0].kind, mode: probe.controller.state().mode,
      domes: probe.panel().querySelectorAll("[data-strata-dome]").length }; });
  expect(relief).toEqual({ version: 1, kind: "relief", mode: "gpu", domes: 0 });
  expect(errors).toEqual([]);
});

test("the adjust policy steps the level down while frames run over budget and back up after, with GPU on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // Budget 25 ms, 20 frames over budget to step down, 30 frames under 20 ms to step up, over a 20-frame window.
  await ready(page, "?level=objects&adjust=25,20,30,20");
  expect(await page.evaluate(() => ({ cap: window.strataGpuProbe.cap(), kind: window.strataGpuProbe.controller.state().materials[0].kind })))
    .toEqual({ cap: "scene", kind: "objects" });
  // Each frame now costs 45 ms: the policy steps from Objects to Relief and reports it.
  await page.evaluate(() => window.strataGpuProbe.load(45));
  await page.waitForFunction(() => window.strataGpuProbe.adjustments().length >= 1, null, { timeout: 20000 });
  const down = await page.evaluate(async () => { const probe = window.strataGpuProbe; probe.refresh(); await probe.controller.settle();
    return { events: probe.adjustments(), cap: probe.cap(), mode: probe.controller.state().mode, kind: probe.controller.state().materials[0].kind, version: probe.scene().version }; });
  expect(down.events[0]).toMatchObject({ from: "objects", to: "relief", frameBudgetMs: 25 });
  expect(down.events[0].p95).toBeGreaterThan(25);
  expect(down).toMatchObject({ cap: "relief", mode: "gpu", kind: "relief", version: 1 });
  // Back to normal frames: the policy steps up to the level the page asks for, and no higher.
  await page.evaluate(() => window.strataGpuProbe.load(0));
  await page.waitForFunction(() => window.strataGpuProbe.adjustments().length >= 2, null, { timeout: 20000 });
  const up = await page.evaluate(async () => { const probe = window.strataGpuProbe; probe.refresh(); await probe.controller.settle();
    return { event: probe.adjustments()[1], cap: probe.cap(), mode: probe.controller.state().mode, kind: probe.controller.state().materials[0].kind }; });
  expect(up.event).toMatchObject({ from: "relief", to: "objects" });
  expect(up).toMatchObject({ cap: "objects", mode: "gpu", kind: "objects" });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.strataGpuProbe.adjustments().length)).toBe(2);
  expect(errors).toEqual([]);
});

test("without the adjust policy, slow frames change nothing", async ({ page }) => {
  await ready(page, "?level=objects");
  await page.evaluate(() => window.strataGpuProbe.load(45));
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => { window.strataGpuProbe.load(0); return { events: window.strataGpuProbe.adjustments(), cap: window.strataGpuProbe.cap(), kind: window.strataGpuProbe.controller.state().materials[0].kind }; });
  expect(state).toEqual({ events: [], cap: "scene", kind: "objects" });
});

/** A small equirectangular Radiance file: a bright upper half and a dim lower half, flat RGBE. */
function hdr(width = 32, height = 16) {
  const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`, "latin1");
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    // Mantissa 128 with exponent 129 is 1.0; 128 with 127 is 0.25.
    pixels.set([128, 128, 128, y < height / 2 ? 129 : 127], (y * width + x) * 4);
  }
  return Buffer.concat([header, pixels]);
}

test("at the Scene level a lit backdrop sits behind the panels and confetti bursts over them, decorative and with GPU on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "?level=scene");
  await page.waitForFunction(() => window.strataGpuProbe.controller.state().materials.some(material => material.kind === "stage"));
  const initial = await page.evaluate(() => {
    const probe = window.strataGpuProbe, state = probe.controller.state(), backdrop = probe.root().firstElementChild;
    return { mode: state.mode, layers: state.layers.map(layer => layer.id), materials: state.materials.map(material => `${material.id}:${material.kind}`),
      backdrop: { id: backdrop.id, inert: backdrop.inert, hidden: backdrop.getAttribute("aria-hidden"), width: backdrop.offsetWidth } };
  });
  expect(initial.mode).toBe("gpu");
  // The backdrop is the first layer, behind the panel; the panel is at the Objects level, which the Scene level includes.
  expect(initial.layers).toEqual(["strata-backdrop", "gpu-panel"]);
  expect(initial.materials).toEqual(["gpu-panel:objects", "strata-backdrop:stage"]);
  expect(initial.backdrop).toEqual({ id: "strata-backdrop", inert: true, hidden: "true", width: 760 });
  // The backdrop's vignette darkens the stage's corner.
  const lit = await snap(page, "scene-backdrop");
  expect(luma(lit(4, 516))).toBeLessThan(235);

  // A burst from Save: a particle layer in front of the panel, moved every frame by scene updates.
  await page.evaluate(() => { window.bursting = window.strataGpuProbe.burst({ seed: 7, count: 60 }); });
  await page.waitForFunction(() => window.strataGpuProbe.controller.state().materials.some(material => material.id === "strata-particles" && material.particles > 0));
  const during = await page.evaluate(() => { const state = window.strataGpuProbe.controller.state();
    return { mode: state.mode, layers: state.layers.map(layer => layer.id), particles: state.materials.find(material => material.id === "strata-particles").particles }; });
  expect(during.mode).toBe("gpu");
  expect(during.layers).toEqual(["strata-backdrop", "gpu-panel", "strata-particles"]);
  expect(during.particles).toBeGreaterThan(0);
  // Decorative: a real click through the particles still reaches Save.
  const save = await page.locator("#gpu-save").boundingBox();
  await page.mouse.click(save.x + save.width / 2, save.y + save.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  // When the last particle has gone, the layer is let go and removed, and the burst resolves.
  await page.evaluate(() => window.bursting);
  const after = await page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, layers: window.strataGpuProbe.controller.state().layers.map(layer => layer.id),
    element: !!document.getElementById("strata-particles") }));
  expect(after).toEqual({ mode: "gpu", layers: ["strata-backdrop", "gpu-panel"], element: false });

  // Below the Scene level (here the root set to Objects) the backdrop goes, and bursts draw nothing.
  await page.evaluate(async () => { window.strataGpuProbe.root().setAttribute("data-strata-level", "objects"); window.strataGpuProbe.refresh(); await window.strataGpuProbe.controller.settle(); });
  const objects = await page.evaluate(async () => { await window.strataGpuProbe.burst(); const state = window.strataGpuProbe.controller.state();
    return { mode: state.mode, layers: state.layers.map(layer => layer.id), backdrop: !!document.getElementById("strata-backdrop") }; });
  expect(objects).toEqual({ mode: "gpu", layers: ["gpu-panel"], backdrop: false });
  expect(errors).toEqual([]);
});

test("under reduced motion the Scene level keeps its backdrop and bursts nothing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page, "?level=scene");
  await page.waitForFunction(() => window.strataGpuProbe.controller.state().materials.some(material => material.kind === "stage"));
  const result = await page.evaluate(async () => { await window.strataGpuProbe.burst(); const state = window.strataGpuProbe.controller.state();
    return { mode: state.mode, layers: state.layers.map(layer => layer.id) }; });
  expect(result).toEqual({ mode: "gpu", layers: ["strata-backdrop", "gpu-panel"] });
});

test("an environment map loaded from an .hdr lights the objects as a version 3 scene", async ({ page }) => {
  await page.route(url => url.pathname === "/test-environment.hdr", route => route.fulfill({ status: 200, contentType: "application/octet-stream", body: hdr() }));
  await ready(page, "?level=objects&environment=/test-environment.hdr");
  await page.waitForFunction(() => window.strataGpuProbe.scene()?.version === 3);
  const scene = await page.evaluate(() => { const probe = window.strataGpuProbe, scene = probe.scene();
    return { mode: probe.controller.state().mode, kind: probe.controller.state().materials[0].kind, source: scene.environment.source,
      cells: scene.environment.grid.length, top: scene.environment.grid[0], bottom: scene.environment.grid[511] }; });
  // Normalized so the upper quarter averages 1: the bright half is 1, the dim half a quarter of it.
  expect(scene).toEqual({ mode: "gpu", kind: "objects", source: "map", cells: 512, top: 1, bottom: 0.25 });
});

test("at the Scene level a panel entering settles with a spring: it overshoots its depth and comes to rest", async ({ page }) => {
  await ready(page, "?level=scene");
  await page.evaluate(() => window.strataGpuProbe.leave());
  const scales = await page.evaluate(async () => {
    const probe = window.strataGpuProbe, seen = [];
    const entering = probe.enter({ tilt: 10 });
    while (seen.length < 200) { await new Promise(requestAnimationFrame); seen.push(probe.controller.state().layers.find(layer => layer.id === "gpu-panel").transform.scaleX); if (seen.at(-1) === 1 && seen.length > 5) break; }
    await entering;
    return { min: Math.min(...seen), last: probe.controller.state().layers.find(layer => layer.id === "gpu-panel").transform, mode: probe.controller.state().mode };
  });
  // From the modal depth (a scale over 1), past rest (under 1), back to 1.
  expect(scales.min).toBeLessThan(1);
  expect(scales.last).toMatchObject({ scaleX: 1, scaleY: 1, opacity: 1 });
  expect(scales.mode).toBe("gpu");
});

for (const level of ["relief", "objects"]) test(`Tabs on the GPU at the ${level} level: the rail is a groove, the selected tab's indicator moves with real clicks and keys, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addTabs(); await window.strataGpuProbe.controller.settle(); });
  const indicator = value => `#gpu-tabs-tab-${value} .ug-tab__indicator`;
  /** The scene's entry for the element, at either level (a relief face or an object). */
  const entryOf = selector => primitiveOf(page, selector).then(entry => entry && (entry.object ?? entry.face));
  // The rail is a groove (at both levels: it has no object); only the selected tab's indicator is drawn, as a mark.
  expect(await entryOf("#gpu-tabs .ug-tabs__rail")).toBe("groove");
  expect(await entryOf(indicator("overview"))).toBe("mark");
  expect(await entryOf(indicator("activity"))).toBeNull();
  expect((await primitiveOf(page, indicator("overview"))).material).toBe("emissive");
  // The rail comes before the indicators, so the indicator is drawn over it.
  expect(await page.evaluate(() => { const scene = window.strataGpuProbe.scene(), rail = scene.primitives.findIndex(entry => entry.face === "groove" && entry.rect[2] > 300);
    return rail >= 0 && rail < scene.primitives.length - 1; })).toBe(true);
  /** The indicator's centre in the frame's CSS px, from its tab (it is laid out even while hidden). */
  const centre = value => page.evaluate(id => {
    const frame = document.getElementById("frame").getBoundingClientRect(), tab = document.getElementById(id).getBoundingClientRect();
    return [tab.left + tab.width / 2 - frame.left, tab.bottom - 2 - frame.top];
  }, `gpu-tabs-tab-${value}`);
  const accent = ([r, , b]) => b - r > 60;
  const before = await snap(page, `tabs-${level}-overview`);
  const [ox, oy] = await centre("overview"), [ax, ay] = await centre("activity");
  expect(accent(before(ox, oy)), `overview indicator ${before(ox, oy)}`).toBe(true);
  expect(accent(before(ax, ay)), `no activity indicator ${before(ax, ay)}`).toBe(false);

  // A real click on Activity, through the GPU-presented panel: it is selected, and the indicator moves under it.
  const activity = await page.locator("#gpu-tabs-tab-activity").boundingBox();
  await page.mouse.click(activity.x + activity.width / 2, activity.y + activity.height / 3);
  await expect(page.locator("#gpu-tabs-tab-activity")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(await entryOf(indicator("activity"))).toBe("mark");
  expect(await entryOf(indicator("overview"))).toBeNull();
  const after = await snap(page, `tabs-${level}-activity`);
  expect(accent(after(ax, ay)), `activity indicator ${after(ax, ay)}`).toBe(true);
  expect(accent(after(ox, oy)), `no overview indicator ${after(ox, oy)}`).toBe(false);
  await expect(page.locator("#gpu-tabs-panel-activity")).toBeVisible();

  // The arrow keys select through the GPU too.
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#gpu-tabs-tab-settings")).toBeFocused();
  await expect(page.locator("#gpu-tabs-tab-settings")).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(await entryOf(indicator("settings"))).toBe("mark");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`an Accordion on the GPU at the ${level} level: its sections are raised slabs that open with real clicks, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addAccordion(); await window.strataGpuProbe.controller.settle(); });
  const kind = entry => entry && (entry.object ?? entry.face);
  const slab = level === "objects" ? "slab" : "raised";
  // Each section is a raised slab: a raised primitive at Relief, an object slab at Objects.
  const closed = await primitiveOf(page, "#gpu-shipping");
  expect(kind(closed)).toBe(slab);
  expect(kind(await primitiveOf(page, "#gpu-returns"))).toBe(slab);
  // A real click on the header, through the GPU-presented panel, opens it; the slab grows to hold the content.
  const header = await page.locator("#gpu-shipping summary").boundingBox();
  await page.mouse.click(header.x + header.width / 3, header.y + header.height / 2);
  await expect(page.locator("#gpu-shipping")).toHaveAttribute("open", "");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  const opened = await primitiveOf(page, "#gpu-shipping");
  expect(kind(opened)).toBe(slab);
  expect(opened.rect[3]).toBeGreaterThan(closed.rect[3] + 10);
  // Exclusive: opening Returns closes Shipping, natively.
  const returns = await page.locator("#gpu-returns summary").boundingBox();
  await page.mouse.click(returns.x + returns.width / 3, returns.y + returns.height / 2);
  await expect(page.locator("#gpu-returns")).toHaveAttribute("open", "");
  await expect(page.locator("#gpu-shipping")).not.toHaveAttribute("open", "");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  // Pixels are fresh: the open section's text is drawn where its body is.
  const body = await page.evaluate(() => { const frame = document.getElementById("frame").getBoundingClientRect(), text = document.querySelector("#gpu-returns .ug-accordion__body p").getBoundingClientRect();
    return [text.left - frame.left, text.top - frame.top, text.width, text.height]; });
  const shot = await snap(page, `accordion-${level}`);
  let darkest = 255;
  for (let x = body[0]; x < body[0] + body[2]; x += 2) for (let y = body[1]; y < body[1] + body[3]; y += 2) darkest = Math.min(darkest, luma(shot(x, y)));
  expect(darkest).toBeLessThan(120);
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a List on the GPU at the ${level} level is one raised slab, and a real click on a row reaches it, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  const before = await page.evaluate(() => window.strataGpuProbe.scene().primitives.length);
  await page.evaluate(async () => { window.strataGpuProbe.addList(); await window.strataGpuProbe.controller.settle(); });
  const list = await primitiveOf(page, "#gpu-list");
  expect(list && (list.object ?? list.face)).toBe(level === "objects" ? "slab" : "raised");
  // The rows add nothing to the scene: only the slab is new.
  expect(await page.evaluate(() => window.strataGpuProbe.scene().primitives.length)).toBe(before + 1);
  const row = await page.locator("#gpu-list-archive").boundingBox();
  await page.mouse.click(row.x + row.width - 8, row.y + row.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.archived())).toBe(1);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a Table on the GPU at the ${level} level is one raised slab, and a real click on a sort button sorts it, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  const before = await page.evaluate(() => window.strataGpuProbe.scene().primitives.length);
  await page.evaluate(async () => { window.strataGpuProbe.addTable(); await window.strataGpuProbe.controller.settle(); });
  const slab = await primitiveOf(page, "#gpu-table");
  expect(slab && (slab.object ?? slab.face)).toBe(level === "objects" ? "slab" : "raised");
  expect(await page.evaluate(() => window.strataGpuProbe.scene().primitives.length)).toBe(before + 1);
  const amounts = () => page.locator("#gpu-table tbody tr td:last-child").allTextContents();
  expect(await amounts()).toEqual(["120", "87.5", "42"]);
  const button = await page.locator("#gpu-table-amount").boundingBox();
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  expect(await amounts()).toEqual(["42", "87.5", "120"]);
  await expect(page.locator("#gpu-table th").nth(1)).toHaveAttribute("aria-sort", "ascending");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`an Avatar on the GPU at the ${level} level is one round raised coin, GPU on`, async ({ page }) => {
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addAvatar(); await window.strataGpuProbe.controller.settle(); });
  const coin = await primitiveOf(page, "#gpu-avatar");
  expect(coin.object ?? coin.face).toBe(level === "objects" ? "slab" : "raised");
  expect(coin.rect[2]).toBe(32);
  expect(coin.radius).toBe(16);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
});

for (const level of ["relief", "objects"]) test(`chips on the GPU at the ${level} level: a tag is a raised pill, a filter chip a key held down while on, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addChips(); await window.strataGpuProbe.controller.settle(); });
  const tag = await primitiveOf(page, "#gpu-tag");
  expect(tag.object ?? tag.face).toBe(level === "objects" ? "slab" : "raised");
  // A pill: the radius (radius.pill) is at least half the height, which core clamps it to.
  expect(tag.radius).toBeGreaterThanOrEqual(tag.rect[3] / 2);
  const off = await primitiveOf(page, "#gpu-filter");
  expect(off.object ?? off.face).toBe(level === "objects" ? "key" : "raised");
  expect(off.state.pressed).toBe(false);
  // A real click through the GPU turns it on: it is held down (pressed) while on.
  const box = await page.locator("#gpu-filter").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.move(5, 5);
  await expect(page.locator("#gpu-filter")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect((await primitiveOf(page, "#gpu-filter")).state.pressed).toBe(true);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a MessageBar on the GPU at the ${level} level is a raised slab with its action a key, and a real click reaches it, GPU on`, async ({ page }) => {
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addMessage(); await window.strataGpuProbe.controller.settle(); });
  const bar = await primitiveOf(page, "#gpu-message"), action = await primitiveOf(page, "#gpu-message-action");
  expect(bar.object ?? bar.face).toBe(level === "objects" ? "slab" : "raised");
  expect(action.object ?? action.face).toBe(level === "objects" ? "key" : "raised");
  // At Objects the action's key stands on the bar's slab.
  if (level === "objects") expect(action.base).toBeGreaterThan(bar.base ?? 0);
  const box = await page.locator("#gpu-message-action").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.upgrades())).toBe(1);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
});

for (const level of ["relief", "objects"]) test(`Pagination on the GPU at the ${level} level: page keys, the current one held down, moved by a real click, GPU on`, async ({ page }) => {
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addPagination(); await window.strataGpuProbe.controller.settle(); });
  const keys = () => Promise.all([1, 2, 3].map(async number => { const entry = await primitiveOf(page, `#gpu-page-${number}`); return `${entry.object ?? entry.face}:${entry.state.pressed}`; }));
  const key = level === "objects" ? "key" : "raised";
  expect(await keys()).toEqual([`${key}:false`, `${key}:true`, `${key}:false`]);
  const third = await page.locator("#gpu-page-3").boundingBox();
  await page.mouse.click(third.x + third.width / 2, third.y + third.height / 2);
  await page.mouse.move(5, 5);
  await expect(page.locator("#gpu-page-3")).toHaveAttribute("aria-current", "page");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await keys()).toEqual([`${key}:false`, `${key}:false`, `${key}:true`]);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
});

test("a raised link is a key at the Objects level", async ({ page }) => {
  await ready(page, "?level=objects");
  await page.evaluate(async () => {
    window.strataGpuProbe.panel().insertAdjacentHTML("beforeend", '<p><a class="ug-pagination__link" data-strata-face="raised" href="#next" id="gpu-raised-link" aria-label="Page 2">2</a></p>');
    window.strataGpuProbe.refresh();
    await window.strataGpuProbe.controller.settle();
  });
  expect((await primitiveOf(page, "#gpu-raised-link")).object).toBe("key");
});

for (const level of ["relief", "objects"]) test(`a Toolbar on the GPU at the ${level} level: keys on a plinth, the arrow keys and a real click work, GPU on`, async ({ page }) => {
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addToolbar(); await window.strataGpuProbe.controller.settle(); });
  const plinth = await primitiveOf(page, "#gpu-toolbar"), bold = await primitiveOf(page, "#gpu-tool-bold");
  expect(plinth.object ?? plinth.face).toBe(level === "objects" ? "slab" : "raised");
  expect(bold.object ?? bold.face).toBe(level === "objects" ? "key" : "raised");
  if (level === "objects") expect(bold.base).toBeGreaterThan(plinth.base ?? 0);
  // A real click on Bold, then the arrows move along the toolbar and Space toggles Italic.
  const box = await page.locator("#gpu-tool-bold").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#gpu-tool-bold")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#gpu-tool-italic")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.locator("#gpu-tool-italic")).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect((await primitiveOf(page, "#gpu-tool-italic")).state.pressed).toBe(true);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
});

for (const level of ["relief", "objects"]) test(`an AppBar on the GPU at the ${level} level is a raised slab with its control's key on it, GPU on`, async ({ page }) => {
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addAppBar(); await window.strataGpuProbe.controller.settle(); });
  const bar = await primitiveOf(page, "#gpu-app-bar"), button = await primitiveOf(page, "#gpu-sign-in");
  expect(bar.object ?? bar.face).toBe(level === "objects" ? "slab" : "raised");
  expect(button.object ?? button.face).toBe(level === "objects" ? "key" : "raised");
  if (level === "objects") expect(button.base).toBeGreaterThan(bar.base ?? 0);
  const box = await page.locator("#gpu-sign-in").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.signIns())).toBe(1);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
});

for (const level of ["relief", "objects"]) test(`a Tooltip for a GPU-presented control at the ${level} level shows above it on a real hover, outside the layer, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(() => window.strataGpuProbe.addTooltip());
  const save = await page.locator("#gpu-save").boundingBox();
  await page.mouse.move(save.x + save.width / 2, save.y + save.height / 2);
  const tip = page.locator("#gpu-save-tip");
  await expect(tip).toBeVisible();
  const box = await tip.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(save.y);
  expect(Math.abs(box.x + box.width / 2 - (save.x + save.width / 2))).toBeLessThanOrEqual(1);
  // The tooltip is in the top layer, outside the Underglass root, so the panel stays on the GPU.
  expect(await page.evaluate(() => !window.strataGpuProbe.root().contains(document.getElementById("gpu-save-tip")))).toBe(true);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();
  expect(errors).toEqual([]);
});

test("a toast over a GPU-presented panel leaves the panel on the GPU", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => window.strataGpuProbe.toast());
  await expect(page.locator(".ug-toast")).toBeVisible();
  expect(await page.evaluate(() => !window.strataGpuProbe.root().contains(document.querySelector(".ug-toast-region")))).toBe(true);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  // The panel under it still takes real input.
  const save = await page.locator("#gpu-save").boundingBox();
  await page.mouse.click(save.x + save.width / 2, save.y + save.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a Carousel on the GPU at the ${level} level: keys under captured slides, the current picker key held down, a real click on Next shows fresh pixels, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addCarousel(); await window.strataGpuProbe.controller.settle(); });
  const key = level === "objects" ? "key" : "raised";
  const keys = () => Promise.all(["previous", "key-1", "key-2", "next"].map(async name => { const entry = await primitiveOf(page, `#gpu-carousel-${name}`); return `${entry.object ?? entry.face}:${entry.state.pressed}`; }));
  expect(await keys()).toEqual([`${key}:false`, `${key}:true`, `${key}:false`, `${key}:false`]);
  const slide = await page.locator("#gpu-carousel .ug-carousel__slide:not([hidden]) p").boundingBox(), frame = await page.locator("#frame").boundingBox();
  const centre = [slide.x - frame.x + 12, slide.y - frame.y + slide.height / 2];
  const before = (await snap(page, "carousel-before"))(...centre);
  // A real click on Next through the GPU: the second slide shows, its key is held down, and the pixels are fresh.
  const next = await page.locator("#gpu-carousel-next").boundingBox();
  await page.mouse.click(next.x + next.width / 2, next.y + next.height / 2);
  await page.mouse.move(5, 5);
  await expect(page.locator("#gpu-carousel .ug-carousel__slide:not([hidden])")).toHaveAttribute("aria-label", "2 of 2");
  expect(await keys()).toEqual([`${key}:false`, `${key}:false`, `${key}:true`, `${key}:false`]);
  await page.waitForTimeout(400);
  const after = (await snap(page, "carousel-after"))(...centre);
  expect(after).not.toEqual(before);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a TreeView on the GPU at the ${level} level: one raised slab with flat rows, opened by real keys and selected by a real click, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addTree(); await window.strataGpuProbe.controller.settle(); });
  const slab = await primitiveOf(page, "#gpu-tree");
  expect(slab.object ?? slab.face).toBe(level === "objects" ? "slab" : "raised");
  expect(await primitiveOf(page, "#gpu-tree-readme")).toBeNull();
  // Real keys: Right opens src, and its file shows.
  await page.locator("#gpu-tree [data-strata-value='src']").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#gpu-tree [data-strata-value='src']")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#gpu-tree [data-strata-value='src/index.ts']")).toBeVisible();
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  // The slab grew with the open group, on the GPU.
  expect((await primitiveOf(page, "#gpu-tree")).rect[3]).toBeGreaterThan(slab.rect[3]);
  // A real click through the GPU selects README.
  const readme = await page.locator("#gpu-tree-readme").boundingBox();
  await page.mouse.click(readme.x + readme.width / 2, readme.y + readme.height / 2);
  await expect(page.locator("#gpu-tree [data-strata-value='readme']")).toHaveAttribute("aria-selected", "true");
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("a Menu opened from a GPU-presented panel floats in the top layer, real keys choose an item, focus returns into the panel, GPU on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => { window.strataGpuProbe.addMenu(); await window.strataGpuProbe.controller.settle(); });
  const open = await page.locator("#gpu-menu-open").boundingBox();
  await page.mouse.click(open.x + open.width / 2, open.y + open.height / 2);
  await expect(page.locator("#gpu-menu")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe("Rename");
  // Placed by script below the button in the layer, aligned with its start edge.
  const menu = await page.locator("#gpu-menu").boundingBox();
  expect(Math.abs(menu.x - open.x)).toBeLessThanOrEqual(1);
  expect(menu.y).toBeGreaterThanOrEqual(open.y + open.height);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#gpu-menu")).toBeHidden();
  expect(await page.evaluate(() => [window.strataGpuProbe.menuChoices(), document.activeElement?.id])).toEqual([["Duplicate"], "gpu-menu-open"]);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("a Popover opened from a GPU-presented panel floats in the top layer, takes real input, and the panel stays on the GPU", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => { window.strataGpuProbe.addPopover(); await window.strataGpuProbe.controller.settle(); });
  // A real click through the GPU on the button in the panel opens it.
  const open = await page.locator("#gpu-popover-open").boundingBox();
  await page.mouse.click(open.x + open.width / 2, open.y + open.height / 2);
  await expect(page.locator("#gpu-popover")).toBeVisible();
  expect(await page.evaluate(() => [document.getElementById("gpu-popover").matches(":popover-open"), window.strataGpuProbe.root().contains(document.getElementById("gpu-popover"))])).toEqual([true, false]);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  // Below the button and aligned with its start edge: the button is in the layer, where CSS anchor positioning does
  // not follow the drawn place, so it is placed by script from the button's box.
  const popover = await page.locator("#gpu-popover").boundingBox();
  expect(await page.locator("#gpu-popover").getAttribute("data-strata-anchor")).toBe("script");
  expect(Math.abs(popover.x - open.x)).toBeLessThanOrEqual(1);
  expect(popover.y).toBeGreaterThanOrEqual(open.y + open.height);
  expect(popover.y).toBeLessThanOrEqual(open.y + open.height + 8);
  // Its own control takes a real click.
  const apply = await page.locator("#gpu-popover-apply").boundingBox();
  await page.mouse.click(apply.x + apply.width / 2, apply.y + apply.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.applied())).toBe(1);
  // Escape closes it; focus returns to the button in the panel, and the panel's Save still takes a real click.
  await page.keyboard.press("Escape");
  await expect(page.locator("#gpu-popover")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("gpu-popover-open");
  const save = await page.locator("#gpu-save").boundingBox();
  await page.mouse.click(save.x + save.width / 2, save.y + save.height / 2);
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a NavigationRail on the GPU at the ${level} level: keys on a raised rail, the current page held down, a real click reaches its link, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addRail(); await window.strataGpuProbe.controller.settle(); });
  const rail = await primitiveOf(page, "#gpu-rail");
  expect(rail.object ?? rail.face).toBe(level === "objects" ? "slab" : "raised");
  const key = level === "objects" ? "key" : "raised";
  const keys = () => Promise.all(["inbox", "drafts"].map(async name => { const entry = await primitiveOf(page, `#gpu-rail-${name}`); return `${entry.object ?? entry.face}:${entry.state.pressed}`; }));
  expect(await keys()).toEqual([`${key}:true`, `${key}:false`]);
  if (level === "objects") expect((await primitiveOf(page, "#gpu-rail-drafts")).base).toBeGreaterThan(rail.base ?? 0);
  // A real click through the GPU follows the original link.
  const drafts = await page.locator("#gpu-rail-drafts").boundingBox();
  await page.mouse.click(drafts.x + drafts.width / 2, drafts.y + drafts.height / 2);
  await page.mouse.move(5, 5);
  expect(await page.evaluate(() => location.hash)).toBe("#rail-drafts");
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a Stepper on the GPU at the ${level} level: raised markers up to the current step, flat ones after, groove lines, following its state, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addStepper(); await window.strataGpuProbe.controller.settle(); });
  const raised = level === "objects" ? "slab" : "raised";
  const markers = () => Promise.all([0, 1, 2].map(async index => { const entry = await primitiveOf(page, `#gpu-marker-${index}`); return entry && (entry.object ?? entry.face); }));
  expect(await markers()).toEqual([raised, raised, "flat"]);
  for (const index of [1, 2]) expect((await primitiveOf(page, `#gpu-line-${index}`))?.face).toBe("groove");
  // The binding moves to the last step: its marker stands up, on the GPU.
  await page.evaluate(async () => { window.strataGpuProbe.stepTo(2); await window.strataGpuProbe.controller.settle(); });
  expect(await markers()).toEqual([raised, raised, raised]);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("a Combobox on the GPU: one well, and real typing shows each new character with GPU on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => { window.strataGpuProbe.addCombobox(); await window.strataGpuProbe.controller.settle(); });
  expect((await primitiveOf(page, "#gpu-combobox")).face).toBe("well");
  const box = await page.locator("#gpu-combobox").boundingBox(), frame = await page.locator("#frame").boundingBox();
  // The text's start, in frame coordinates: a row of samples across the first characters.
  const samples = shot => Array.from({ length: 12 }, (_, at) => shot(box.x - frame.x + 18 + at * 3, box.y - frame.y + box.height / 2)).flat();
  const before = samples(await snap(page, "combobox-before"));
  // A real click reaches the input through the GPU; real keys type into it.
  await page.mouse.click(box.x + box.width / 3, box.y + box.height / 2);
  await expect(page.locator("#gpu-combobox")).toBeFocused();
  await page.keyboard.type("Ban");
  expect(await page.locator("#gpu-combobox").inputValue()).toBe("Ban");
  // Fresh pixels: the typed text is on the GPU-presented face.
  const after = samples(await snap(page, "combobox-after"));
  expect(after).not.toEqual(before);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("a DatePicker on the GPU: one well, and a real click and real keys set a date with GPU on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => { window.strataGpuProbe.addDatePicker(); await window.strataGpuProbe.controller.settle(); });
  expect((await primitiveOf(page, "#gpu-date-picker")).face).toBe("well");
  const box = await page.locator("#gpu-date-picker").boundingBox(), frame = await page.locator("#frame").boundingBox();
  // The segments' start, in frame coordinates: a row of samples across the first characters.
  const samples = shot => Array.from({ length: 12 }, (_, at) => shot(box.x - frame.x + 18 + at * 3, box.y - frame.y + box.height / 2)).flat();
  const before = samples(await snap(page, "date-picker-before"));
  // A real click reaches the input through the GPU; real keys type a date into it.
  await page.mouse.click(box.x + 24, box.y + box.height / 2);
  await expect(page.locator("#gpu-date-picker")).toBeFocused();
  await page.keyboard.type("03152026");
  expect(await page.locator("#gpu-date-picker").inputValue()).toBe("2026-03-15");
  // Fresh pixels: the typed date is on the GPU-presented face.
  const after = samples(await snap(page, "date-picker-after"));
  expect(after).not.toEqual(before);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("a Rating on the GPU: its stars are captured content with no primitive, and a real click sets the score, GPU on", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.evaluate(async () => { window.strataGpuProbe.addRating(); await window.strataGpuProbe.controller.settle(); });
  for (const score of [1, 5]) expect(await primitiveOf(page, `#gpu-star-${score} .ug-rating__star`)).toBeNull();
  const fourth = await page.locator("#gpu-star-4").boundingBox(), frame = await page.locator("#frame").boundingBox();
  const centre = [fourth.x - frame.x + fourth.width / 2, fourth.y - frame.y + fourth.height / 2];
  const before = (await snap(page, "rating-before"))(...centre);
  await page.mouse.click(fourth.x + fourth.width / 2, fourth.y + fourth.height / 2);
  await page.mouse.move(5, 5);
  expect(await page.evaluate(() => document.querySelector("input[name='gpu-score']:checked").value)).toBe("4");
  // Fresh pixels: the fourth star is filled now, on the GPU.
  const after = (await snap(page, "rating-after"))(...centre);
  expect(after).not.toEqual(before);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

for (const level of ["relief", "objects"]) test(`a SegmentedControl on the GPU at the ${level} level: keys, the selected one held down, moved by a real click, GPU on`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  await page.evaluate(async () => { window.strataGpuProbe.addSegmented(); await window.strataGpuProbe.controller.settle(); });
  const key = level === "objects" ? "key" : "raised";
  const keys = () => Promise.all(["day", "week", "month"].map(async value => { const entry = await primitiveOf(page, `#gpu-segment-${value}`); return `${entry.object ?? entry.face}:${entry.state.pressed}`; }));
  expect(await keys()).toEqual([`${key}:false`, `${key}:true`, `${key}:false`]);
  // A real click on Month's key reaches its radio through the GPU; that key is now the one held down.
  const month = await page.locator("#gpu-segment-month").boundingBox();
  await page.mouse.click(month.x + month.width / 2, month.y + month.height / 2);
  await page.mouse.move(5, 5);
  expect(await page.evaluate(() => document.querySelector("input[name='gpu-view']:checked").value)).toBe("month");
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
  expect(await keys()).toEqual([`${key}:false`, `${key}:false`, `${key}:true`]);
  expect(await page.evaluate(() => window.strataGpuProbe.controller.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});
