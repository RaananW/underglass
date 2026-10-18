/**
 * The Switch's hardware forms (anatomy page `switch.md`, *Forms*): their springs and the CSS easing sampled from them
 * (`packages/ui/src/shared/switch-forms.ts`), the drag-past-centre rule (`dom/switch.ts`), the Relief shadow fit, the
 * Instrument parts (`packages/ui/src/gpu/instrument-switch.ts`) checked with core's own validator and containment
 * check (`packages/core/src/instrument.ts`), and the synthesised feedback (`dom/feedback.ts`) with its tokens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fittedHeight, isSwitchForm, shadowReach, stepSpring, switchBoxes, switchFormMarkup, switchForms, switchSpringCurve, switchSprings, switchThrow } from "../../packages/ui/src/shared/switch-forms.ts";
import { batLength, switchGeometry, switchMaterials, switchObject } from "../../packages/ui/src/gpu/instrument-switch.ts";
import { pastCentre, switchTapSlop } from "../../packages/ui/src/dom/switch.ts";
import { strataFeedback, strataSoundLength, strataSoundSet, synthesiseStrataSound } from "../../packages/ui/src/dom/feedback.ts";
import { createStrataTheme } from "../../packages/ui/src/tokens/theme.ts";
import { resolveStrataScope } from "../../packages/ui/src/dom/theme.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment, poseAt, partMatrix, transform } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const round = value => Math.round(value * 1000) / 1000;

test("the forms, their markup and their boxes: every box at least 24 px each way", () => {
  assert.deepEqual(switchForms, ["slide", "rocker", "bat", "wall"]);
  assert.ok(isSwitchForm("rocker"));
  assert.ok(!isSwitchForm("settings") && !isSwitchForm(undefined));
  assert.deepEqual(switchBoxes, { slide: [64, 28], rocker: [54, 70], bat: [48, 92], wall: [66, 92] });
  for (const [width, height] of Object.values(switchBoxes)) assert.ok(width >= 24 && height >= 24);
  // Every part is styled, and every part with a marker uses a defined relief primitive.
  const names = parts => parts.flatMap(part => [part, ...names(part.children ?? [])]);
  for (const form of switchForms) for (const part of names(switchFormMarkup[form])) {
    for (const name of part.className.split(" ")) assert.ok(css.includes(`.${name}`), `${form}: ${name} is styled`);
    if (part.face) assert.ok(["raised", "groove", "knob", "flat"].includes(part.face));
  }
});

test("the springs are section 12's, clamped at the stops: a throw never passes its stop", () => {
  assert.deepEqual(switchSprings, { slide: { stiffness: 600, damping: 49 }, rocker: { stiffness: 1200, damping: 58 }, bat: { stiffness: 1400, damping: 45 }, wall: { stiffness: 1200, damping: 58 } });
  const ratio = ({ stiffness, damping }) => round(damping / (2 * Math.sqrt(stiffness)));
  assert.deepEqual(switchForms.map(form => ratio(switchSprings[form])), [1, 0.837, 0.601, 0.837]);
  for (const form of switchForms) {
    const samples = switchThrow(switchSprings[form]);
    assert.ok(samples.every(t => t >= 0 && t <= 1), `${form}: inside the stops`);
    assert.ok(samples.every((t, index) => index === 0 || t >= samples[index - 1]), `${form}: monotonic (clamped)`);
    assert.equal(samples.at(-1), 1);
  }
  // Timing in fixed 4 ms steps: the underdamped bat reaches its stop first, the critically damped slide settles last.
  const reach = form => switchThrow(switchSprings[form]).indexOf(1) * 4;
  assert.deepEqual(switchForms.map(reach), [568, 160, 72, 160]);
  // Unclamped, the bat would overshoot its stop (v2's springs did): the clamp drops the velocity there instead.
  const free = { t: 0, v: 0 };
  let peak = 0;
  for (let step = 0; step < 100; step++) { free.v += (-1400 * (free.t - 1) - 45 * free.v) * 0.004; free.t += free.v * 0.004; peak = Math.max(peak, free.t); }
  assert.ok(peak > 1.05, `unclamped peak ${peak}`);
  const clamped = { t: 0.99, v: 30 };
  stepSpring(clamped, 1, switchSprings.bat);
  assert.deepEqual(clamped, { t: 1, v: 0 });
});

test("the CSS throws on the springs: each form's linear() easing and duration is switchSpringCurve's", () => {
  for (const form of switchForms) {
    const { duration, easing } = switchSpringCurve(switchSprings[form]);
    const block = css.match(new RegExp(`:where\\(\\.ug-switch\\[data-strata-form="${form}"\\]\\) \\{([^}]*)\\}`))?.[1] ?? "";
    assert.ok(block.includes(`--_throw-duration: ${duration}ms;`), `${form}: ${duration}ms`);
    assert.ok(block.includes(`--_throw: ${easing};`), `${form}: easing`);
    const [width, height] = switchBoxes[form];
    if (form !== "slide") assert.ok(block.includes(`--_box-w: ${width}px;`) && block.includes(`--_box-h: ${height}px;`), `${form}: box`);
  }
  assert.match(css, /--_box-w: 64px;\n\s+--_box-h: 28px;/);
  assert.match(css, /@property --strata-switch-t \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+:where\(\.ug-switch\[data-strata-form\]\) \{ transition: none; \}/);
});

test("a drag throws the switch only when released past the box's centre towards the other stop", () => {
  const box = { left: 0, top: 0, width: 64, height: 28 }, tall = { left: 0, top: 0, width: 48, height: 92 };
  assert.equal(switchTapSlop, 4);
  assert.equal(pastCentre("slide", box, 40, 14, false), true);
  assert.equal(pastCentre("slide", box, 30, 14, false), false);
  assert.equal(pastCentre("slide", box, 20, 14, true), true);
  assert.equal(pastCentre("slide", box, 200, 14, false), true);
  // The others turn on upwards.
  assert.equal(pastCentre("bat", tall, 24, 30, false), true);
  assert.equal(pastCentre("bat", tall, 24, 60, false), false);
  assert.equal(pastCentre("rocker", tall, 24, 60, true), true);
  assert.equal(pastCentre("wall", tall, 24, -40, true), false);
});

test("at Relief and Objects a part stands only as high as its box lets its shadow reach", () => {
  const light = { azimuth: 323, elevation: 41 };
  const reach = shadowReach(1, light);
  assert.deepEqual(Object.fromEntries(Object.entries(reach).map(([side, value]) => [side, round(value)])), { left: 1.808, right: 3.192, top: 1.581, bottom: 3.419 });
  // The slide's block lies 4 px inside its box above and below: 1.24 px high under the default light.
  assert.equal(fittedHeight(3, { left: 6, right: 34, top: 4, bottom: 4 }, light), 1.24);
  assert.equal(fittedHeight(1, { left: 6, right: 34, top: 4, bottom: 4 }, light), 1);
  assert.equal(fittedHeight(4, { left: 13, right: 13, top: 10, bottom: 35 }, light), 4);
  // A light from the other side moves the shadow, and the fit with it.
  assert.ok(fittedHeight(3, { left: 6, right: 34, top: 4, bottom: 4 }, { azimuth: 143, elevation: 41 }) <= 1.24);
});

/** A version 4 scene around `objects`, as the GPU helper writes it. */
function sceneOf(objects, profiles) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 320 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...switchMaterials },
    primitives: [{ face: "raised", rect: [0, 0, 400, 320], radius: 12, height: 8, material: "matte" }], profiles, objects };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
const switchAt = (profile, form, options = {}) => {
  const [width, height] = switchBoxes[form];
  return switchObject({ id: form, form, box: [0, 0, width, height], t: 0, checked: false, scale: 1, state: { hover: false, disabled: false }, relief: { rect: [0, 0, width, height], height: 3, material: "switchCap" }, ...options }, profile);
};

test("every form is a valid Instrument object of the part vocabulary, at every depth, off and on", () => {
  const expected = {
    // The parts never depend on the state, so a throw never rebuilds the layer: a form's two lit flags are both always there.
    slide: ["segment:switchFlagOn", "carriage:switchCap", "chamfer:switchChamfer", "cap:switchCap", "grip:switchInk"],
    rocker: ["bezel:switchBezel", "paddle:switchCap", "segment:switchFlagOn", "segment:switchFlagOff"],
    bat: ["nut:switchBezel", "bushing:switchBezel", "lever:switchLever", "ball:switchLever"],
    wall: ["plate:switchPlate", "paddle:switchCap", "chamfer:switchChamfer", "cap:switchCap", "segment:switchFlagOn", "segment:switchFlagOff"],
  };
  for (const form of switchForms) for (const scale of [0.6, 1, 1.6]) for (const on of [false, true]) {
    const { profiles, profile } = registry();
    const object = switchAt(profile, form, { t: on ? 1 : 0, checked: on, scale });
    assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), expected[form], `${form} ${on ? "on" : "off"} at ${scale}`);
    assert.deepEqual(object.bounds, { rect: [0, 0, ...switchBoxes[form]], radius: 0 });
    const scene = validateInstrumentScene(sceneOf([object], profiles));
    assert.equal(scene.objects[0].parts.length, object.parts.length);
  }
  // On a dark faceplate the wall plate is gunmetal.
  const { profile } = registry();
  assert.equal(switchAt(profile, "wall", { dark: true }).parts[0].material, "switchPlateDark");
});

test("the poses follow the object table: a 28 px slide, the rocker ±17.7°, the bat ±40° and the wall ±9°, on to the right or the top", () => {
  const { profiles, profile } = registry();
  const slide = switchAt(profile, "slide").parts.find(part => part.kind === "carriage");
  assert.deepEqual([poseAt(slide, 0).slide, poseAt(slide, 1).slide], [[-14, 0], [14, 0]]);
  const paddle = switchAt(profile, "rocker").parts.find(part => part.kind === "paddle");
  assert.deepEqual([poseAt(paddle, 0).tilt, poseAt(paddle, 0.5).tilt, poseAt(paddle, 1).tilt], [-17.7, 0, 17.7]);
  // On presses the rocker's top end in: at t 1 its top corner (local x −25, the turned length) is lower than its bottom one.
  const [, , top] = transform(partMatrix(paddle, 1), -25, 0, 12), [, , bottom] = transform(partMatrix(paddle, 1), 25, 0, 12);
  assert.ok(top < bottom, `top ${top}, bottom ${bottom}`);
  // The bat points up when on: its ball's centre at t 1 is 29.4 px from the pivot along the lever, so 18.9 px above it head-on.
  const bat = switchAt(profile, "bat"), ball = bat.parts.find(part => part.kind === "ball");
  const centre = batLength(1) - switchGeometry.bat.ball;
  const [, y1] = transform(partMatrix(ball, 1), 0, 0, centre), [, y0] = transform(partMatrix(ball, 0), 0, 0, centre);
  assert.equal(round(y1 - 46), -18.898);
  assert.equal(round(y0 - 46), 18.898);
  assert.equal(batLength(1.6), 46);
  const wall = switchAt(profile, "wall").parts.find(part => part.kind === "paddle");
  assert.deepEqual([poseAt(wall, 0).tilt, poseAt(wall, 1).tilt], [-9, 9]);
  // Every moving part of the wall paddle tilts about the same point: the paddle's middle.
  const [paddleTop, chamfer, top2, dot] = switchAt(profile, "wall").parts.slice(1);
  const pivotOf = part => [part.at[0] + part.pose.from.pivot[0], part.at[1] + part.pose.from.pivot[1], round(part.at[2] + part.pose.from.pivot[2])];
  for (const part of [chamfer, top2, dot]) assert.deepEqual(pivotOf(part), pivotOf(paddleTop));
  void profiles;
});

test("every vertex of every form stays 0.5 px inside its box over the whole travel, in each corner of the reference stage, at every depth", () => {
  const worst = {};
  for (const form of switchForms) for (const scale of [0.6, 1, 1.6]) for (const on of [false, true]) {
    const { profiles, profile } = registry();
    const object = switchAt(profile, form, { t: on ? 1 : 0, checked: on, scale });
    const frontier = containmentFrontier(object, profiles);
    const [w, h] = switchBoxes[form];
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, profiles, frontier, placement);
      assert.ok(result.contained, `${form}, depth scale ${scale}, ${on ? "on" : "off"}, at ${e},${f}: inset ${result.inset}`);
      // The exact projection of every vertex at every travel step, for the record.
      const exact = checkContainment(object, profiles, { ...frontier, parts: frontier.parts.map(() => [{ inset: -1e9, height: 0 }]) }, placement);
      assert.ok(exact.exact && exact.contained);
      worst[form] = Math.min(worst[form] ?? Infinity, round(exact.inset));
    }
  }
  // The closest any vertex comes to its box's edge, px (the rocker's raised corners at full depth bind its 54 px width).
  assert.deepEqual(worst, { slide: 2.676, rocker: 1.38, bat: 1.884, wall: 3.086 });
  // v2's 38 × 62 rocker box does not hold its tipped paddle at the stage's edges.
  const { profiles, profile } = registry();
  const narrow = switchObject({ id: "narrow", form: "rocker", box: [0, 0, 38, 62], t: 0, checked: false, scale: 1, state: { hover: false, disabled: false }, relief: { rect: [0, 0, 38, 62], height: 3, material: "switchCap" } }, profile);
  const result = checkContainment(narrow, profiles, containmentFrontier(narrow, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("a synthesised sound lasts five decays, peaks at 0.8, starts and ends silent, and is the same every time", () => {
  assert.deepEqual(strataSoundSet, { click: { pitch: 2400, decay: 4, noise: 0.6 }, tick: { pitch: 3200, decay: 2, noise: 0.3 }, thunk: { pitch: 140, decay: 18, noise: 0.25 }, snap: { pitch: 1800, decay: 6, noise: 0.75 } });
  for (const [kind, sound] of Object.entries(strataSoundSet)) for (const rate of [44100, 48000]) {
    const samples = synthesiseStrataSound(sound, rate);
    assert.equal(samples.length, Math.round((rate * 5 * sound.decay) / 1000), `${kind} at ${rate}`);
    assert.equal(samples.length, strataSoundLength(sound, rate));
    assert.equal(round(Math.max(...samples.map(Math.abs))), 0.8);
    assert.equal(Math.abs(samples[0]), 0);
    assert.equal(Math.abs(samples.at(-1)), 0);
    assert.deepEqual(synthesiseStrataSound(sound, rate), samples);
  }
  assert.equal(synthesiseStrataSound(strataSoundSet.click, 48000).length, 960);
  // With no document, no gesture and no audio, feedback is silent and never throws.
  assert.doesNotThrow(() => strataFeedback({ closest: () => null, ownerDocument: undefined }, "snap"));
  assert.doesNotThrow(() => strataFeedback(undefined, "tick"));
});

test("feedback is off by default and set per application or scope through its tokens", () => {
  const theme = createStrataTheme({});
  assert.match(theme.css(), /--strata-feedback-sound: 0;/);
  assert.match(theme.css(), /--strata-feedback-haptics: 0;/);
  assert.match(theme.css(), /--strata-feedback-snap-pitch: 1800;/);
  const on = createStrataTheme({ feedback: { sound: true, haptics: false } });
  assert.deepEqual(on.issues, []);
  assert.match(on.css(), /--strata-feedback-sound: 1;/);
  assert.match(on.css(), /--strata-feedback-haptics: 0;/);
  const scope = resolveStrataScope({ feedback: { haptics: true } });
  assert.deepEqual(scope.issues, []);
  assert.equal(scope.properties.get("--strata-feedback-haptics"), "1");
  assert.equal(scope.properties.has("--strata-feedback-sound"), false);
  // A sound's parameters stay in range.
  assert.ok(createStrataTheme({ tokens: { "feedback.click.noise": 2 } }).issues.some(issue => issue.path === "feedback.click.noise"));
});

test("a throw changes no profile, material or part kind: the unlit flag is sunk out of sight and the lit one stands on its part", () => {
  for (const form of ["rocker", "wall"]) {
    const [off, on] = [false, true].map(checked => { const { profiles, profile } = registry(); return { object: switchAt(profile, form, { checked, t: checked ? 1 : 0 }), profiles }; });
    assert.deepEqual(Object.keys(off.profiles), Object.keys(on.profiles), `${form}: the same profiles`);
    const flags = ({ object }) => object.parts.filter(part => part.kind === "segment");
    assert.equal(flags(off).length, 2);
    // Off: the lit flag is the one sunk; on: the unlit one is. Their pivots stay where they were, so they tip with the paddle.
    const [litOff, dimOff] = flags(off), [litOn, dimOn] = flags(on);
    assert.equal(litOff.material, "switchFlagOn");
    assert.ok(litOff.at[2] < litOn.at[2] && dimOff.at[2] > dimOn.at[2], `${form}: the state sinks one flag`);
    assert.equal(round(litOff.at[2] + litOff.pose.from.pivot[2]) - round(litOn.at[2] + litOn.pose.from.pivot[2]), 0, `${form}: the pivot's world place is unchanged`);
  }
  // The slide's flag is always there, flush under the block's base while it is off.
  const { profile } = registry(), slide = switchAt(profile, "slide"), flag = slide.parts[0];
  assert.deepEqual(flag.at.slice(0, 2), [32 - 13, 14]);
  assert.ok(flag.at[0] + 21 / 2 <= 32 - 14 + 12 - 0.4, "the flag ends inside the off block's base");
});

test("with the key light, the parts that stand still or slide cast only shadows that stay in their box, and the tilting parts cast none", () => {
  const light = { azimuth: 323, elevation: 41 };
  const reach = (height, direction) => { const a = (light.azimuth * Math.PI) / 180, e = (light.elevation * Math.PI) / 180, lx = Math.sin(a) * Math.cos(e), ly = -Math.cos(a) * Math.cos(e), lz = Math.sin(e);
    return Math.max(0, (-(lx * direction[0] + ly * direction[1]) / lz) * height + 1.5 * height + 1); };
  for (const form of switchForms) for (const scale of [0.6, 1, 1.6]) for (const t of [0, 0.5, 1]) {
    const { profile } = registry(), box = [0, 0, ...switchBoxes[form]];
    const object = switchAt(profile, form, { t, scale, light });
    for (const part of object.parts) {
      if (part.caster === null || !part.caster) continue;
      const [x, y, w, h] = part.caster.rect, c = part.caster;
      assert.ok(x - reach(c.height, [-1, 0]) >= box[0] && x + w + reach(c.height, [1, 0]) <= box[2] && y - reach(c.height, [0, -1]) >= box[1] && y + h + reach(c.height, [0, 1]) <= box[3],
        `${form} ${part.kind}, scale ${scale}, t ${t}: the shadow stays in the box`);
    }
    for (const part of object.parts) if (["paddle", "lever", "ball"].includes(part.kind)) assert.equal(part.caster, null, `${form} ${part.kind}`);
  }
  // The slide's block is 4 px inside its box above and below: at every depth its caster is capped under its mean height.
  const { profile } = registry(), block = switchAt(profile, "slide", { light }).parts.find(part => part.kind === "carriage");
  assert.ok(block.caster && block.caster.height < 3, `capped at ${block.caster?.height}`);
  assert.deepEqual(block.caster.rect, [6, 4, 24, 20], "the footprint where the block stands at t 0");
  assert.deepEqual(switchAt(profile, "slide", { light, t: 1 }).parts.find(part => part.kind === "carriage").caster.rect, [34, 4, 24, 20]);
  // Without the light nothing is capped: core's own casters.
  assert.equal(switchAt(profile, "slide").parts.find(part => part.kind === "carriage").caster, undefined);
});
