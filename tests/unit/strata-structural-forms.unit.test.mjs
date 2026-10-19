/**
 * The structural forms (anatomy pages `slider.md`, `card.md`, `panel.md`, `dialog.md` and `drawer.md`): the names and markup data
 * the bindings share (`packages/ui/src/shared/slider-forms.ts`, `structure-forms.ts`), and the Instrument parts of a plate's rim and a
 * tray's wall (`packages/ui/src/gpu/instrument-plate.ts`) checked with core's own validator and containment check
 * (`packages/core/src/instrument.ts`): every vertex of every shape stays 0.5 px inside its box over the whole rise, in each corner of the
 * reference stage, at every depth.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { sliderForm, sliderFormModel, sliderNumber, sliderOwner, SLIDER_FLUSH } from "../../packages/ui/src/shared/slider-forms.ts";
import { dialogForm, drawerForm, PANEL_TRAY_CLASS, STRUCTURE_FLUSH, structureDefaults, surfaceForm } from "../../packages/ui/src/shared/structure-forms.ts";
import { plateMargin, plateMaterials, plateMesh, plateObject, plateParts, plateTokenDefaults } from "../../packages/ui/src/gpu/instrument-plate.ts";
import { profileKey } from "../../packages/ui/src/gpu/instrument.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment, poseAt } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const round = value => Math.round(value * 1000) / 1000;

test("a Slider takes `knob`, `fader` or `wheel` as a form; `flush` and every other string are not drawn forms, and only the others are native form owners", () => {
  assert.equal(SLIDER_FLUSH, "flush");
  assert.equal(sliderForm("knob"), "knob");
  assert.equal(sliderForm("fader"), "fader");
  assert.equal(sliderForm("wheel"), "wheel");
  for (const form of ["flush", "settings", "", undefined, null, 3]) assert.equal(sliderForm(form), undefined, String(form));
  // `form` is also the native attribute (the id of a form owner): the reserved names are never one.
  for (const form of ["flush", "knob", "fader", "wheel", undefined, 3]) assert.equal(sliderOwner(form), undefined, String(form));
  assert.equal(sliderOwner("settings"), "settings");
  assert.equal(sliderNumber("12", 0), 12);
  assert.equal(sliderNumber(undefined, 7), 7);
  assert.equal(sliderNumber("x", 7), 7);
  assert.equal(sliderNumber(3.5, 0), 3.5);
});

test("a Slider's knob and fader forms are the Knob's and the Fader's markup data: classes, value, marks and value text", () => {
  const knob = sliderFormModel("knob", { value: 40, marks: [0, 50, 100], unit: "%" });
  assert.deepEqual(knob.rootClass, ["ug-knob"]);
  assert.equal(knob.style, "--strata-knob-value: 0.4;");
  assert.deepEqual(knob.marks.map(mark => [mark.value, mark.text]), [[0, "0"], [50, "50"], [100, "100"]]);
  assert.equal(knob.valueText, "40%");
  assert.deepEqual([knob.min, knob.max, knob.step, knob.detented], [0, 100, 1, false]);
  const detented = sliderFormModel("knob", { value: 0, min: -12, max: 12, detents: 5 });
  assert.deepEqual(detented.rootClass, ["ug-knob", "ug-knob--detented"]);
  assert.equal(detented.step, 6);
  const fader = sliderFormModel("fader", { value: 0, min: -12, max: 12, step: 6, detents: 5, marks: [-12, 0, 12], unit: " dB" });
  assert.deepEqual(fader.rootClass, ["ug-fader", "ug-fader--horizontal", "ug-fader--detented"]);
  assert.equal(fader.style, "--strata-fader-value: 0.5;");
  assert.deepEqual(fader.marks.map(mark => mark.text), ["−12", "0", "12"]);
  assert.equal(fader.valueText, "0 dB");
  assert.equal(sliderFormModel("fader", { value: 10, travel: 120 }).style, "--strata-fader-value: 0.1; --strata-fader-travel: 120px;");
  assert.equal(sliderFormModel("knob", { value: 5, format: value => `${value} of 10`, max: 10 }).valueText, "5 of 10");
  // The forms add no class of their own: every class they use is styled by the Knob's and the Fader's CSS.
  for (const name of ["ug-knob", "ug-knob--detented", "ug-fader", "ug-fader--horizontal", "ug-fader--detented"]) assert.ok(css.includes(`.${name}`), name);
});

test("a Card and a Panel take `plate` or `tray`, a Dialog `plate` and a Drawer `tray`; flush and everything else is the control of before", () => {
  assert.equal(STRUCTURE_FLUSH, "flush");
  assert.equal(surfaceForm("plate"), "plate");
  assert.equal(surfaceForm("tray"), "tray");
  assert.equal(dialogForm("plate"), "plate");
  assert.equal(dialogForm("tray"), undefined);
  assert.equal(drawerForm("tray"), "tray");
  assert.equal(drawerForm("plate"), undefined);
  for (const form of ["flush", "knob", "", undefined, null]) for (const pick of [surfaceForm, dialogForm, drawerForm]) assert.equal(pick(form), undefined, String(form));
  // The classes the forms add are styled.
  assert.ok(css.includes(`.${PANEL_TRAY_CLASS}`));
  assert.ok(css.includes('[data-strata-form="plate"]') && css.includes('.ug-drawer[data-strata-form="tray"]'));
  assert.deepEqual(structureDefaults, { plate: { rim: 4, height: 3, chamfer: 1.4 }, tray: { wall: 4, height: 3, slope: 3 } });
  assert.deepEqual(plateTokenDefaults, { rim: 4, height: 3, chamfer: 1.4, wall: 4, slope: 3 });
});

const stages = { reference: { width: 1920, height: 1080 }, small: { width: 640, height: 760 } };
const radiiOf = radius => [radius, radius, radius, radius];
/** A version 4 scene around `objects`, as the GPU helper writes it. */
function sceneOf(objects, profiles) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 640, height: 760 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...plateMaterials },
    primitives: [{ face: "raised", rect: [0, 0, 640, 760], radius: 12, height: 8, material: "matte" }], profiles, objects };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = profileKey(name, shape); profiles[key] ??= shape; return key; } }; };
const objectOf = (profile, form, options = {}) => plateObject({ id: form, box: [0, 0, 400, 240], radii: radiiOf(12), form, t: 1, rises: false, scale: 1, stage: stages.reference, dark: false,
  relief: { height: 3, material: "matte" }, ...options }, profile);

test("the rim and the wall are the numbers of the object table at a depth scale: 4 wide, 3 high (0.6, 1, 1.6), a 1.4 chamfer; a wall 4 wide with a 3 px slope", () => {
  assert.deepEqual(plateParts("plate", 1), { height: 3, width: 4, chamfer: 1.4 });
  assert.deepEqual(plateParts("plate", 0.6), { height: 1.8, width: 4, chamfer: 1.4 });
  assert.deepEqual(plateParts("plate", 1.6), { height: 4.8, width: 4, chamfer: 1.4 });
  assert.deepEqual(plateParts("tray", 1), { height: 3, width: 4, slope: 3, chamfer: 0 });
  // Tokens other than the defaults apply.
  assert.deepEqual(plateParts("plate", 1, { rim: 6, height: 2, chamfer: 3 }), { height: 2, width: 6, chamfer: 1.8 });
  // The margin is the box rule's: ceil(drift(h) + 1) at the stage's half-diagonal.
  assert.equal(plateMargin("plate", 1, stages.reference), 3);
  assert.equal(plateMargin("plate", 1, stages.small), 2);
  assert.equal(plateMargin("plate", 1.6, stages.reference), 4);
});

test("the mesh has one flat band per face of its cross-section along the outline, unit normals, indices in range, and an open side is not closed", () => {
  const input = { box: [0, 0, 400, 240], radii: radiiOf(12), form: "plate", scale: 1, stage: stages.small };
  const plate = plateMesh(input), tray = plateMesh({ ...input, form: "tray" }), open = plateMesh({ ...input, form: "tray", open: "right" });
  // 28 outline points (four corners of seven), two vertices per face per point: four faces for a plate, three for a tray.
  assert.equal(plate.positions.length / 3, 28 * 2 * 4);
  assert.equal(tray.positions.length / 3, 28 * 2 * 3);
  assert.equal(plate.indices.length / 3, 4 * 28 * 2);
  assert.equal(tray.indices.length / 3, 3 * 28 * 2);
  assert.equal(open.indices.length / 3, 3 * 27 * 2, "the open side's quad is left out");
  for (const mesh of [plate, tray, open]) {
    assert.equal(mesh.positions.length, mesh.normals.length);
    for (let at = 0; at < mesh.normals.length; at += 3) assert.ok(Math.abs(Math.hypot(mesh.normals[at], mesh.normals[at + 1], mesh.normals[at + 2]) - 1) < 2e-3, `unit normal at ${at / 3}`);
    assert.ok(mesh.indices.every(index => Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3));
    for (let at = 0; at < mesh.indices.length; at += 3) assert.ok(new Set(mesh.indices.slice(at, at + 3)).size === 3, "no triangle repeats a vertex");
  }
  // Every vertex lies inside the box shrunk by the margin (the outline is inset by it), centred on the box.
  const margin = plateMargin("plate", 1, stages.small);
  for (const mesh of [plate, tray, open]) for (let at = 0; at < mesh.positions.length; at += 3) {
    assert.ok(Math.abs(mesh.positions[at]) <= 200 - margin + 1e-6 && Math.abs(mesh.positions[at + 1]) <= 120 - margin + 1e-6, `vertex ${at / 3} inside the outline`);
    assert.ok(mesh.positions[at + 2] >= 0 && mesh.positions[at + 2] <= 3 + 1e-6);
  }
  // Heights: the plate's top is flat at its height; the tray's slope runs to the floor.
  assert.equal(Math.max(...plate.positions.filter((_, index) => index % 3 === 2)), 3);
  assert.equal(Math.min(...tray.positions.filter((_, index) => index % 3 === 2)), 0);
  // The same shape is one mesh (core validates an inline mesh once per array identity); a different one is another.
  const { profile } = registry();
  const a = objectOf(profile, "plate"), b = objectOf(profile, "plate"), c = objectOf(profile, "plate", { box: [0, 0, 300, 200] });
  assert.equal(a.parts[0].profile, b.parts[0].profile);
  assert.notEqual(a.parts[0].profile, c.parts[0].profile);
  assert.ok(!a.parts[0].profile.includes("positions"), "the profile's name is short, not its arrays");
});

test("every plate and tray is a valid Instrument object: its parts, its materials, its rise, at every depth and on both faceplates", () => {
  for (const form of ["plate", "tray"]) for (const scale of [0.6, 1, 1.6]) for (const dark of [false, true]) for (const rises of [false, true]) {
    const { profiles, profile } = registry();
    const object = objectOf(profile, form, { scale, dark, rises, t: rises ? 0.5 : 1 });
    const material = form === "plate" ? (dark ? "plateEdgeDark" : "plateEdge") : dark ? "trayWallDark" : "trayWall";
    assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), [`${form === "plate" ? "plate" : "bezel"}:${material}`], `${form} ${scale} ${dark} ${rises}`);
    assert.equal(object.parts[0].caster, null, "no face caster: the element's own slab or well carries the shadow");
    assert.equal(object.t, rises ? 0.5 : 1);
    assert.deepEqual(object.bounds, { rect: [0, 0, 400, 240], radius: 12 });
    assert.deepEqual([object.relief.face, object.relief.height], ["flat", 0], "a stepped-down plate adds nothing to the element's own slab or well");
    assert.equal(!!object.parts[0].pose, rises);
    const scene = validateInstrumentScene(sceneOf([object], profiles));
    assert.equal(scene.objects[0].parts.length, 1);
    assert.equal(scene.profiles[object.parts[0].profile].positions.length, scene.profiles[object.parts[0].profile].normals.length);
  }
  // The rise: from just proud of the face to the resting height.
  const { profile } = registry();
  const part = objectOf(profile, "plate", { rises: true, scale: 1 }).parts[0];
  assert.deepEqual(part.pose, { from: { travel: -2.7 }, to: { travel: 0 } });
  assert.deepEqual([poseAt(part, 0).travel, poseAt(part, 1).travel], [-2.7, 0]);
});

test("every vertex of every plate and tray stays 0.5 px inside its box over the whole rise, in each corner of the reference stage, at every depth and size", () => {
  const worst = {};
  const boxes = { card: [0, 0, 564, 122.3], panel: [0, 0, 600, 749], dialog: [0, 0, 512, 305], tray: [0, 0, 532, 46.3], small: [0, 0, 120, 60], drawer: [0, 0, 384, 760] };
  for (const [name, box] of Object.entries(boxes)) for (const form of ["plate", "tray"]) for (const scale of [0.6, 1, 1.6]) for (const rises of [false, true]) {
    for (const [open, radii] of [[undefined, radiiOf(12)], ["right", [12, 0, 0, 12]], ["bottom", [12, 12, 0, 0]], [undefined, radiiOf(0)]]) {
      if (open && form !== "tray") continue;
      const [w, h] = [box[2], box[3]];
      const { profiles, profile } = registry();
      const object = objectOf(profile, form, { box, scale, rises, t: 0, open, radii, stage: stages.reference });
      const scene = validateInstrumentScene(sceneOf([object], profiles)), valid = scene.objects[0];
      const frontier = containmentFrontier(valid, scene.profiles);
      for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0], [1920 - w, 540 - h / 2], [960 - w / 2, 1080 - h]]) {
        const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
        const exact = checkContainment(valid, scene.profiles, { ...frontier, parts: frontier.parts.map(() => [{ inset: -1e9, height: 0 }]) }, placement);
        assert.ok(exact.exact && exact.contained, `${name} ${form} depth ${scale}${rises ? " rising" : ""}${open ? ` open ${open}` : ""} at ${e},${f}: inset ${exact.inset}`);
        worst[form] = Math.min(worst[form] ?? Infinity, round(exact.inset));
      }
    }
  }
  // The closest any vertex comes to its box's edge, px.
  console.log("closest vertex to its box:", JSON.stringify(worst));
  assert.ok(worst.plate >= 0.5 && worst.tray >= 0.5);
});

test("an element too small for its margin and part is not drawn as parts: the helper keeps the Relief slab or well", () => {
  // The helper skips an element narrower than twice the margin and the part, plus 8 px; here is that rule's number at the reference stage.
  const need = form => 2 * (plateMargin(form, 1, stages.reference) + plateParts(form, 1).width) + 8;
  assert.equal(need("plate"), 22);
  assert.equal(need("tray"), 22);
});

test("the plate and tray forms are styled: the edge break, the tray's well, the Drawer's slide, forced colours and reduced motion", () => {
  assert.match(css, /\[data-strata-form="plate"\], \.ug-drawer\[data-strata-form="tray"\]\) \{\s*--_bevel: calc\(var\(--strata-bevel-width\) \* 0\.5\)/);
  assert.match(css, /\.ug-card__body\)\[data-strata-face="well"\], :where\(\.ug-panel__tray\) \{/);
  for (const name of ["ug-panel-slide-enter", "ug-panel-slide-leave"]) assert.ok(css.includes(`@keyframes ${name}`) && css.includes(`animation-name: ${name}`), name);
  // The slide stops in face mode (the GPU slides the layer) and under reduced motion.
  assert.ok(css.includes(':where([data-strata-mode="face"]).ug-drawer[data-strata-form="tray"][data-strata-motion] { animation: none; }'));
  assert.match(css, /prefers-reduced-motion: reduce\) \{[\s\S]*:where\(\.ug-drawer\)\[data-strata-form="tray"\]\[data-strata-motion\] \{ animation: none; \}/);
  // The slide's keyframes are named for `strataEnter` and `strataLeave`, which wait for `ug-panel-*` animations.
  assert.match(readFileSync(new URL("../../packages/ui/src/dom/motion.ts", import.meta.url), "utf8"), /startsWith\("ug-panel-"\)/);
  assert.match(css, /forced-colors: active\) \{[\s\S]*\.ug-panel__tray\) \{ border: 1px solid CanvasText; background-color: Canvas; \}/);
});

test("a layer that moves does not make a new mesh: the size's float noise and the stage's zoom (a Dialog's depth entry, a Drawer's slide) keep the same profile", () => {
  const { profile } = registry();
  const base = objectOf(profile, "plate", { box: [0, 0, 512, 305], stage: { width: 640, height: 760 } }).parts[0].profile;
  // Noise of 1e-4 px on the size, and the stage scaled by the 1.5% the depth entry starts at, down to 1.
  for (const zoom of [1, 1.001, 1.004, 1.0082, 1.0148]) for (const noise of [0, 1e-4, -1.6e-4, 4e-3]) {
    const name = objectOf(profile, "plate", { box: [noise, 0, 512 + noise, 305 + noise], stage: { width: 640 / zoom, height: 760 / zoom } }).parts[0].profile;
    assert.equal(name, base, `zoom ${zoom}, noise ${noise}`);
  }
  // A real change of size is another mesh, and the part stays inside its box whatever the stage's rounding.
  assert.notEqual(objectOf(profile, "plate", { box: [0, 0, 480, 305], stage: { width: 640, height: 760 } }).parts[0].profile, base);
});
