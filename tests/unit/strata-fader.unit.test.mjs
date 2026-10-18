/**
 * The Fader's value maths, marks and markup data (`packages/ui/src/shared/fader.ts`, anatomy page `fader.md`), and the
 * Fader's Instrument object (`packages/ui/src/gpu/instrument-fader.ts`, design language section 6), checked with core's
 * own validator and containment check (`packages/core/src/instrument.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { faderDetentStep, faderFraction, faderGeometry, faderMarks, faderModel, faderNotch, faderNumber, faderOffset, faderSnap, faderStyle, faderValueAt, faderValueText } from "../../packages/ui/src/shared/fader.ts";
import { faderCarriage, faderMaterials, faderObject, faderParts, faderShadowReach, faderSpring, faderTravel } from "../../packages/ui/src/gpu/instrument-fader.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment, partCaster, poseAt, profileBounds } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const level = { min: -60, max: 6, step: 1 };

test("a value's place along the travel, and the carriage centre's offset in the box", () => {
  assert.equal(faderFraction(0, level), 60 / 66);
  assert.equal(faderFraction(-70, level), 0);
  assert.equal(faderFraction(5, { min: 1, max: 1 }), 0);
  // The thumb is the carriage (42) plus 16 at each end: the centre runs from 37 to 37 + travel, the minimum at the
  // bottom of a vertical fader and at the left of a horizontal one.
  assert.equal(faderGeometry.along + 2 * faderGeometry.margin, 74);
  assert.equal(faderOffset(1, 180), 37);
  assert.equal(faderOffset(0, 180), 217);
  assert.equal(faderOffset(0, 180, "horizontal"), 37);
  assert.equal(faderOffset(0.5, 180, "horizontal"), 127);
});

test("a click sets the value under the carriage's centre, clamped at the stops", () => {
  const box = 180 + 74;
  assert.equal(faderValueAt(37, box, 180, level), 6);
  assert.equal(faderValueAt(217, box, 180, level), -60);
  assert.equal(faderValueAt(127, box, 180, level), -27);
  assert.equal(faderValueAt(2, box, 180, level), 6);
  assert.equal(faderValueAt(250, box, 180, level), -60);
  assert.equal(faderValueAt(37, box, 180, { min: -50, max: 50 }, "horizontal"), -50);
  assert.equal(faderValueAt(172, box, 180, { min: -50, max: 50 }, "horizontal"), 25);
  // Every offset maps back: the value at a fraction's offset is that fraction's value.
  for (const fraction of [0, 0.1, 0.25, 0.5, 0.9, 1]) assert.ok(Math.abs(faderValueAt(faderOffset(fraction, 180), box, 180, { min: 0, max: 1 }) - fraction) < 1e-6);
});

test("a tap within fader.snap of a printed mark sets exactly its value; the nearer mark wins", () => {
  const marks = [{ value: 6, at: 37 }, { value: 0, at: 53.4 }, { value: -10, at: 80.7 }];
  assert.equal(faderSnap(54.9, marks), 0);
  assert.equal(faderSnap(51.5, marks), 0);
  assert.equal(faderSnap(56, marks), undefined);
  assert.equal(faderSnap(56, marks, 3), 0);
  assert.equal(faderSnap(45, marks, 10), 6);
  assert.equal(faderSnap(46, marks, 10), 0);
});

test("a wheel notch is the step, at least 1% of the range; a detent's step is the range over detents − 1", () => {
  assert.equal(faderNotch(level), 1);
  assert.equal(faderNotch({ min: 0, max: 10, step: 0.1 }), 0.1);
  assert.equal(faderNotch({ min: 0, max: 1000, step: 1 }), 10);
  assert.equal(faderNotch({ min: 0, max: 10, step: 0 }), 1);
  assert.equal(faderDetentStep(0, 10, 5), 2.5);
  assert.equal(faderDetentStep(-12, 12, 5), 6);
  assert.equal(faderDetentStep(0, 1, 4), 0.333333);
});

test("numbers print with a true minus sign and no float noise; units follow as written", () => {
  assert.equal(faderNumber(-6), "−6");
  assert.equal(faderNumber(0.1 + 0.2), "0.3");
  assert.equal(faderNumber(-0), "0");
  assert.equal(faderValueText(-22, " dB"), "−22 dB");
  assert.equal(faderValueText(72, "%"), "72%");
});

test("marks: the ends and quarters by default, a count, values with labels, the detents", () => {
  assert.deepEqual(faderMarks({ min: 0, max: 100 }).map(mark => mark.value), [0, 25, 50, 75, 100]);
  assert.deepEqual(faderMarks({ min: 0, max: 10 }, undefined, 5).map(mark => mark.value), [0, 2.5, 5, 7.5, 10]);
  assert.equal(faderMarks({ min: 0, max: 23 }, undefined, 24).length, 5);
  assert.deepEqual(faderMarks(level, 3).map(mark => mark.value), [-60, -27, 6]);
  assert.deepEqual(faderMarks({ min: -50, max: 50 }, [{ value: -50, label: "L" }, 0, 70]), [{ value: -50, label: "L" }, { value: 0 }]);
  assert.deepEqual(faderMarks(level, 0), []);
});

test("the markup data: the root's and each mark's style, the orientation, the detent step and aria-valuetext", () => {
  assert.equal(faderStyle(0, level), "--strata-fader-value: 0.9091;");
  assert.equal(faderStyle(50, { min: 0, max: 100 }, 240), "--strata-fader-value: 0.5; --strata-fader-travel: 240px;");
  const model = faderModel({ value: 0, min: -60, max: 6, unit: " dB", marks: [6, 0, -20, -40, -60] });
  assert.deepEqual(model, {
    min: -60, max: 6, step: 1, detented: false, vertical: true, style: "--strata-fader-value: 0.9091;",
    marks: [[6, "6", 1], [0, "0", 0.9091], [-20, "−20", 0.6061], [-40, "−40", 0.303], [-60, "−60", 0]].map(([value, text, at]) => ({ value, text, style: `--strata-fader-at: ${at};` })),
    valueText: "0 dB",
  });
  const send = faderModel({ value: 5, max: 10, detents: 5, orientation: "horizontal" });
  assert.equal(send.step, 2.5);
  assert.equal(send.detented, true);
  assert.equal(send.vertical, false);
  assert.equal(send.valueText, undefined);
  assert.equal(faderModel({ value: 7, unit: "%", format: value => `Send ${value}` }).valueText, "Send 7");
});

/** A version 4 scene around `objects`, as the GPU helper writes it. */
function sceneOf(objects, profiles) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 320 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, rail: { base: { roughness: 0.4, metallic: 1 } }, ...faderMaterials },
    primitives: [{ face: "raised", rect: [0, 0, 400, 320], radius: 12, height: 8, material: "matte" }], profiles, objects };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
// A vertical fader as laid out at medium: the track 46 + 44 (the scale) wide and 180 + 74 long, the slot 5 wide from
// 34 to 220; a horizontal one 254 long and 46 + 24 high, its slot along y 20.5–25.5.
const vertical = { box: [0, 0, 90, 254], slot: [20.5, 34, 5, 186], vertical: true };
const horizontal = { box: [0, 0, 254, 70], slot: [34, 20.5, 186, 5], vertical: false };
const fader = (profile, layout = vertical, options = {}) => faderObject({ id: "level", ...layout, t: 0.5, scale: 1, state: { hover: false, disabled: false },
  relief: { rect: [8, 106, 30, 42], height: 3, material: "faderCap" }, ...options }, profile);

test("the fader's parts follow the Instrument object table, and heights scale with depth", () => {
  assert.deepEqual(faderParts(true), { carriage: { width: 30, length: 42, height: 12, radius: 3, taper: 0.6, chamfer: 2 }, top: { width: 24.8, length: 36.8 }, grip: { width: 18.8, length: 1.6 } });
  assert.deepEqual(faderParts(false).grip, { width: 1.6, length: 18.8 });
  assert.equal(faderParts(true, 1.6).carriage.height, 19.2);
  assert.equal(faderParts(true, 0.6).carriage.height, 7.2);
  assert.equal(faderTravel(vertical.slot, true), 180);
  assert.equal(faderTravel(horizontal.slot, false), 180);
  assert.deepEqual(faderSpring, { stiffness: 420, damping: 41 });
});

test("the fader is a valid Instrument object: a chamfered carriage, its polished chamfer, a brushed top and a grip sliding the slot", () => {
  for (const layout of [vertical, horizontal]) {
    const { profiles, profile } = registry();
    const object = fader(profile, layout);
    assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), ["carriage:faderCap", "chamfer:faderChamfer", "cap:faderCap", "grip:faderInk"]);
    assert.deepEqual(object.bounds, { rect: layout.box, radius: 0 });
    const scene = validateInstrumentScene(sceneOf([object], profiles));
    assert.equal(scene.objects[0].t, 0.5);
    // Every part slides with the carriage: at t 0 its centre is 3 px inside the slot's minimum end, at t 1 the maximum's.
    for (const part of object.parts) {
      const [x0, y0] = [part.at[0] + poseAt(part, 0).slide[0], part.at[1] + poseAt(part, 0).slide[1]];
      const [x1, y1] = [part.at[0] + poseAt(part, 1).slide[0], part.at[1] + poseAt(part, 1).slide[1]];
      if (layout.vertical) assert.deepEqual([x0, y0, x1, y1], [23, 217, 23, 37]);
      else assert.deepEqual([x0, y0, x1, y1], [37, 23, 217, 23]);
    }
    // Only the carriage casts on the face; the chamfer, top and grip sit on it.
    assert.deepEqual(object.parts.map(part => part.caster === null), [false, true, true, true]);
  }
});

test("the chamfer band lies a hair outside the carriage's, and the top and grip stand on it", () => {
  const { profiles, profile } = registry();
  const [carriage, chamfer, top, grip] = fader(profile).parts.map(part => ({ part, shape: profiles[part.profile], bounds: profileBounds(profiles[part.profile]) }));
  // The polished band runs from 0.58 to 2.58 in from the base outline, 0.01 above the carriage's (0.6 to 2.6).
  assert.equal(round((carriage.shape.width - chamfer.shape.width) / 2), 0.58);
  assert.equal(round(chamfer.part.at[2] + chamfer.shape.height - chamfer.shape.chamfer), 10.01);
  assert.equal(round(chamfer.part.at[2] + chamfer.shape.height), 12.01);
  assert.equal(top.shape.width, carriage.shape.width - 2 * (faderCarriage.taper + faderCarriage.chamfer));
  assert.ok(top.part.at[2] >= chamfer.part.at[2] + chamfer.shape.height);
  assert.ok(grip.part.at[2] + grip.bounds.high[2] > top.part.at[2] + top.bounds.high[2]);
});
const round = value => Math.round(value * 1000) / 1000;

test("every vertex of the fader stays 0.5 px inside its box over the whole travel, in each corner of the reference stage, at every depth", () => {
  for (const layout of [vertical, horizontal]) for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = fader(profile, layout, { scale });
    const frontier = containmentFrontier(object, profiles);
    // The layer in each corner of 1920 × 1080, the vanishing point at its centre: the worst drift.
    const [w, h] = [layout.box[2], layout.box[3]];
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h]]) {
      const result = checkContainment(object, profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 });
      assert.ok(result.contained, `${layout.vertical ? "vertical" : "horizontal"}, depth scale ${scale}, corner ${e},${f}: inset ${result.inset}`);
    }
  }
});

test("the carriage's shadow on the face stays in the box at 50% depth under the default light, over the whole travel", () => {
  const light = { azimuth: 323, elevation: 41 };
  assert.equal(faderShadowReach(1, light, [0, 1]), 15.512);
  assert.equal(faderShadowReach(1, light, [1, 0]), 14.154);
  assert.equal(faderShadowReach(1, light, [0, -1]), 4.488);
  for (const layout of [vertical, horizontal]) {
    const { profiles, profile } = registry();
    const object = fader(profile, layout);
    for (const t of [0, 0.5, 1]) {
      // Core's caster for the carriage at t, grown by the reach each way: inside the box.
      const caster = partCaster(object.parts[0], profiles[object.parts[0].profile], t);
      const [x, y, cw, ch] = caster.rect;
      const reach = { left: faderShadowReach(1, light, [-1, 0]), right: faderShadowReach(1, light, [1, 0]), up: faderShadowReach(1, light, [0, -1]), down: faderShadowReach(1, light, [0, 1]) };
      const [bx, by, bw, bh] = layout.box;
      assert.ok(x - reach.left >= bx && y - reach.up >= by && x + cw + reach.right <= bx + bw && y + ch + reach.down <= by + bh,
        `${layout.vertical ? "vertical" : "horizontal"} at t ${t}: shadow ${[x - reach.left, y - reach.up, x + cw + reach.right, y + ch + reach.down].map(round)} in ${layout.box}`);
    }
  }
  // At full depth the carriage is 19.2 high and its shadow reaches 24 px down: past the 16 px margin at the bottom stop.
  assert.ok(faderShadowReach(1.6, light, [0, 1]) > faderGeometry.margin);
});

test("spring.fader is critically damped: the carriage settles on its value in fixed steps without overshoot", () => {
  const { stiffness, damping } = faderSpring;
  assert.ok(Math.abs(damping / (2 * Math.sqrt(stiffness)) - 1) < 0.01);
  let t = 0.2, v = 0, steps = 0, peak = 0;
  while (!(Math.abs(t - 1) < 1e-4 && Math.abs(v) < 1e-3) && steps < 1000) {
    v += (-stiffness * (t - 1) - damping * v) * 0.004;
    t = Math.min(1, t + v * 0.004);
    peak = Math.max(peak, t);
    steps++;
  }
  assert.ok(peak <= 1);
  assert.ok(steps * 4 > 100 && steps * 4 < 800, `settles in ${steps * 4} ms`);
});
