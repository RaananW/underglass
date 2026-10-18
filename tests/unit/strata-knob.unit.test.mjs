/**
 * The Knob's value and angle maths, marks and markup data (`packages/ui/src/shared/knob.ts`, anatomy page `knob.md`),
 * and the Knob's Instrument object (`packages/ui/src/gpu/instrument.ts`, design language section 6), checked with core's
 * own validator and containment check (`packages/core/src/instrument.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { knobAngle, knobDetentStep, knobDrag, knobFraction, knobMarks, knobModel, knobNotch, knobNumber, knobRegion, knobStyle, knobValueAtAngle, knobValueText } from "../../packages/ui/src/shared/knob.ts";
import { registerHooks } from "node:module";
import { advanceSpring, boxMargin, depthScale, keyObject, knobObject, knobParts, knobSprings, premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment, poseAt } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const volume = { min: 0, max: 100, step: 0.1 };

test("a value's place and angle: 0° at the top, clockwise over a sweep centred on it", () => {
  assert.equal(knobFraction(62, volume), 0.62);
  assert.equal(knobFraction(-5, volume), 0);
  assert.equal(knobFraction(5, { min: 1, max: 1 }), 0);
  assert.equal(knobAngle(0, volume), -135);
  assert.equal(knobAngle(50, volume), 0);
  assert.equal(knobAngle(100, volume), 135);
  assert.equal(knobAngle(100, volume, 300), 150);
  assert.equal(knobAngle(-6, { min: -12, max: 12 }), -67.5);
});

test("a ring click sets the value at its angle; the bottom gap goes to the nearer end", () => {
  assert.equal(knobValueAtAngle(0, volume), 50);
  assert.equal(knobValueAtAngle(-135, volume), 0);
  assert.equal(knobValueAtAngle(67.5, volume), 75);
  assert.equal(knobValueAtAngle(170, volume), 100);
  assert.equal(knobValueAtAngle(-170, volume), 0);
  // 180° is the gap's middle, reached from either side: the same as −180°.
  assert.equal(knobValueAtAngle(190, volume), 0);
  assert.equal(knobValueAtAngle(100, volume, { sweep: 300 }), 83.333333);
});

test("a ring click within knob.snap degrees of a printed mark sets exactly its value", () => {
  const marks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  // "3" is at −54°: half a degree off (a numeral on whole pixels) still sets 30.
  assert.equal(knobValueAtAngle(-53.5, volume, { marks }), 30);
  assert.equal(knobValueAtAngle(-56, volume, { marks }), 30);
  // Outside the snap the angle decides.
  assert.equal(knobValueAtAngle(-50, volume, { marks }), 31.481481);
  assert.equal(knobValueAtAngle(-50, volume, { marks, snap: 5 }), 30);
  assert.equal(knobValueAtAngle(-53.5, volume, { marks, snap: 0 }), 30.185185);
  // The nearer of two marks wins.
  assert.equal(knobValueAtAngle(-41, volume, { marks: [30, 35], snap: 5 }), 35);
});

test("a press inside the skirt is a cap tap, upper half up; outside it the ring, by angle", () => {
  assert.deepEqual(knobRegion(0, -20, 32), { cap: true, upper: true, theta: 0 });
  assert.deepEqual(knobRegion(0, 20, 32), { cap: true, upper: false, theta: 180 });
  assert.equal(knobRegion(40, 0, 32).cap, false);
  assert.equal(knobRegion(40, 0, 32).theta, 90);
  assert.equal(knobRegion(-40, 0, 32).theta, -90);
});

test("a notch is the step, at least 1% of the range; a detent's step is the range over detents − 1", () => {
  assert.equal(knobNotch(volume), 1);
  assert.equal(knobNotch({ min: 0, max: 10, step: 1 }), 1);
  assert.equal(knobNotch({ min: -24, max: 12, step: 0 }), 1);
  assert.equal(knobNotch({ min: 0, max: 1000, step: 1 }), 10);
  assert.equal(knobDetentStep(0, 10, 11), 1);
  assert.equal(knobDetentStep(-12, 12, 5), 6);
  assert.equal(knobDetentStep(0, 1, 4), 0.333333);
});

test("a vertical drag moves a full sweep per dragPx, up raises, Shift is fine, clamped to the range", () => {
  assert.equal(knobDrag(0, -50, volume), 25);
  assert.equal(knobDrag(50, 100, volume), 0);
  assert.equal(knobDrag(50, -100, volume, { shift: true }), 55);
  assert.equal(knobDrag(50, -50, volume, { dragPx: 100 }), 100);
  assert.equal(knobDrag(90, -200, volume), 100);
});

test("numbers print with a true minus sign and no float noise; units follow as written", () => {
  assert.equal(knobNumber(-6), "−6");
  assert.equal(knobNumber(0.1 + 0.2), "0.3");
  assert.equal(knobNumber(-0), "0");
  assert.equal(knobValueText(-6, " dB"), "−6 dB");
  assert.equal(knobValueText(72, "%"), "72%");
});

test("marks: a count spread over the range, values with labels, the detents by default", () => {
  assert.deepEqual(knobMarks(volume).map(mark => mark.value), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(knobMarks({ min: 0, max: 4 }, undefined, 5).map(mark => mark.value), [0, 1, 2, 3, 4]);
  assert.equal(knobMarks({ min: 0, max: 23 }, undefined, 24).length, 11);
  assert.deepEqual(knobMarks(volume, [0, { value: 50, label: "Mid" }, 120]), [{ value: 0 }, { value: 50, label: "Mid" }]);
  assert.deepEqual(knobMarks(volume, 0), []);
  assert.deepEqual(knobMarks(volume, 1), [{ value: 0 }]);
});

test("the markup data: the root's and each mark's style, the detent step and aria-valuetext", () => {
  assert.equal(knobStyle(62, volume), "--strata-knob-value: 0.62;");
  assert.equal(knobStyle(1, { min: 0, max: 3 }), "--strata-knob-value: 0.3333;");
  assert.equal(knobStyle(50, volume, 300), "--strata-knob-value: 0.5; --strata-knob-sweep: 300;");
  const gain = knobModel({ value: 0, min: -12, max: 12, detents: 5, unit: " dB" });
  assert.deepEqual(gain, {
    min: -12, max: 12, step: 6, detented: true, style: "--strata-knob-value: 0.5;",
    marks: [-12, -6, 0, 6, 12].map((value, index) => ({ value, text: knobNumber(value), style: `--strata-knob-at: ${index / 4};` })),
    valueText: "0 dB",
  });
  assert.equal(knobModel({ value: 62, step: 0.1 }).step, 0.1);
  assert.equal(knobModel({ value: 62 }).valueText, undefined);
  assert.equal(knobModel({ value: 62, unit: "%", format: value => `Volume ${value / 10} of 10` }).valueText, "Volume 6.2 of 10");
});

/** A version 4 scene around `objects`, as the GPU helper writes it. */
function sceneOf(objects, profiles, materials) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 300 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, 400, 300], radius: 12, height: 8, material: "matte" }], profiles, objects };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
const knob = (profile, options = {}) => knobObject({ id: "volume", box: [20, 20, 140, 140], skirt: 64, cap: 52, t: 0.62, sweep: 270, scale: 1,
  state: { hover: false, disabled: false }, relief: { height: 3, material: "knobCap" }, ...options }, profile);

test("the knob's parts follow the Instrument object table, and heights scale with depth", () => {
  assert.deepEqual(knobParts(64, 52), { skirt: { radius: 32, height: 2.5, edgeBreak: 0.8, slope: 7.5 }, cap: { radius: 26, height: 16, crown: 1.2, chamfer: 2 },
    pointer: { width: 2.2, from: 0.28, to: 0.86 } });
  assert.equal(depthScale(0), 0.6);
  assert.equal(depthScale(0.5), 1);
  assert.ok(Math.abs(depthScale(1) - 1.6) < 1e-12);
  assert.equal(knobParts(64, 52, 1.6).cap.height, 25.6);
  // The box rule's margin at the reference stage for the tallest point (2.5 + 16 + 1.2).
  assert.equal(boxMargin(19.7, { width: 1920, height: 1080 }), 11);
});

test("the knob is a valid Instrument object: skirt, cap, chamfer and an engraved pointer turning through the sweep", () => {
  const { profiles, profile } = registry();
  const object = knob(profile);
  assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), ["skirt:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "pointer:knobInk"]);
  assert.deepEqual(object.bounds, { rect: [20, 20, 140, 140], radius: 0 });
  assert.deepEqual(object.parts[3].pose, { from: { turn: -225 }, to: { turn: 45 } });
  // The pointer points up at the middle of the sweep, and to the sweep's ends at its stops.
  assert.equal(poseAt(object.parts[3], 0.5).turn, -90);
  assert.equal(poseAt(object.parts[3], 0).turn, -225);
  // The skirt's top is a 7.5° cone; the cap's top a crown 1.2 high at the centre.
  const skirt = profiles[object.parts[0].profile], cap = profiles[object.parts[1].profile];
  assert.ok(Math.abs(Math.atan2(skirt.points.at(-1)[2], skirt.points.at(-1)[3]) * 180 / Math.PI - 7.5) < 0.1);
  assert.equal(cap.points.at(-1)[1], 17.2);
  const scene = validateInstrumentScene(sceneOf([object], profiles, Object.fromEntries(["knobCap", "knobSkirt", "knobChamfer", "knobInk"].map(name => [name, premiumMaterials[name]]))));
  assert.equal(scene.objects[0].t, 0.62);
});

test("every vertex of the knob stays 0.5 px inside its box over the whole travel, in a corner of the reference stage, at every depth", () => {
  for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = knob(profile, { scale, box: [0, 0, 140, 140] });
    const frontier = containmentFrontier(object, profiles);
    // The layer in the stage's top-left corner, the vanishing point at the centre of 1920 × 1080: the worst drift.
    const result = checkContainment(object, profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
    assert.ok(result.contained, `depth scale ${scale}: inset ${result.inset}`);
  }
});

test("a button is a key of a body and a captured cap inside its margin; too small a button stays Relief", () => {
  const { profiles, profile } = registry();
  const stage = { width: 640, height: 420 };
  const key = keyObject({ id: "reset", box: [20, 200, 80, 34], radius: 6, material: "key #f8f9fb", height: 5, travel: 2.5, pressed: true,
    state: { hover: false, pressed: true, disabled: false }, stage, relief: { height: 3, material: "keyCap" } }, profile);
  assert.deepEqual(key.parts.map(part => `${part.kind}:${part.material}:${!!part.captured}`), ["plinth:key #f8f9fb:false", "cap:keyCap:true"]);
  assert.equal(key.t, 1);
  validateInstrumentScene(sceneOf([key], profiles, { "key #f8f9fb": { base: { colour: "#f8f9fb", roughness: 0.45 } }, keyCap: premiumMaterials.keyCap }));
  assert.equal(keyObject({ id: "tiny", box: [0, 0, 10, 10], radius: 2, material: "m", height: 5, travel: 2.5, pressed: false,
    state: { hover: false, pressed: false, disabled: false }, stage, relief: { height: 3, material: "keyCap" } }, profile), undefined);
});

test("a knob's spring settles on its value in fixed steps, never past a stop", () => {
  const spring = { t: 0.2, v: 0, time: 0 };
  let now = 0, frames = 0;
  while (!advanceSpring(spring, 1, (now += 16), knobSprings.knob) && frames < 200) { frames++; assert.ok(spring.t <= 1); }
  assert.equal(spring.t, 1);
  assert.ok(frames > 5 && frames < 60, `frames ${frames}`);
  // The detent spring overshoots between the stops, never past them.
  const detent = { t: 0, v: 0, time: 0 };
  let peak = 0;
  now = 0;
  for (let frame = 0; frame < 60; frame++) { advanceSpring(detent, 0.5, (now += 16), knobSprings.detent); peak = Math.max(peak, detent.t); }
  assert.ok(peak > 0.5 && peak < 1, `peak ${peak}`);
  assert.equal(detent.t, 0.5);
});
