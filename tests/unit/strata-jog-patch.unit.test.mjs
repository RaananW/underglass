/**
 * The JogWheel and the PatchPoint (anatomy pages `jog-wheel.md`, `patch-point.md`): the step, angle and inertia maths and the markup
 * model of the wheel (`packages/ui/src/shared/jog-wheel.ts`), the jack's markup, sizes and spring (`shared/patch-point.ts`), the
 * tokens and the CSS, the Relief and Objects entries (`gpu/jog-forms.ts`, `gpu/patch-forms.ts`), the springs of the Instrument parts
 * (`gpu/instrument-follow.ts`) and the Instrument parts (`gpu/instrument-jog.ts`, `gpu/instrument-patch.ts`) checked with core's own
 * validator and containment check (`packages/core/src/instrument.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { angleDelta, coast, jogAdvance, jogCount, jogDefaults, jogDelta, jogIndex, jogIndexOfSteps, jogInitialAngle, jogLimit, jogSpring, jogStepAngle, jogSteps, jogStyle, jogValueAt, jogWheelModel, jogWrap,
  pointerAngle, verticalAngle } from "../../packages/ui/src/shared/jog-wheel.ts";
import { shadowReach } from "../../packages/ui/src/shared/switch-forms.ts";
import { PATCH_ROOM, patchBayModel, patchLedMarkup, patchPointBox, patchPointMarkup, patchSpring, patchWasher } from "../../packages/ui/src/shared/patch-point.ts";
import { jogReliefHeights, jogWheelFormEntries } from "../../packages/ui/src/gpu/jog-forms.ts";
import { patchPointFormEntries, patchReliefHeights } from "../../packages/ui/src/gpu/patch-forms.ts";
import { dimpleOf, dimpleProfile, jogBox, jogGeometry, jogHeight, jogMaterials, jogWheelObject, turnOf } from "../../packages/ui/src/gpu/instrument-jog.ts";
import { patchBox, patchGeometry, patchHeight, patchMaterials, patchPointObject, patchRadii, plugHeights } from "../../packages/ui/src/gpu/instrument-patch.ts";
import { advanceFree, followSpring } from "../../packages/ui/src/gpu/instrument-follow.ts";
import { knobSprings, premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";
import { applyCharacter, characterOf } from "../../packages/ui/src/tokens/character.ts";
import { strataTokens, tokensToCss, validateTokens } from "../../packages/ui/src/tokens/index.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment, posedVertices, profileGeometry } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const round = value => Math.round(value * 1000) / 1000;
const range = { min: 0, max: 99, step: 1 };

test("a wheel's steps: the count, the index of a value, the value at an index, and going round", () => {
  assert.equal(jogCount(range), 100);
  assert.equal(jogCount({ min: -12, max: 12, step: 6 }), 5);
  assert.equal(jogCount({ min: 0, max: 1, step: 0.1 }), 11, "floating point noise does not lose the last step");
  assert.equal(jogCount({ min: 5, max: 5 }), 1);
  assert.equal(jogIndex(12, range), 12);
  assert.equal(jogIndex(-50, range), 0);
  assert.equal(jogIndex(500, range), 99);
  assert.equal(jogIndex(0, { min: -12, max: 12, step: 6 }), 2);
  assert.equal(jogValueAt(7, { min: -12, max: 12, step: 6 }), 12, "held to the range");
  assert.equal(jogValueAt(3, { min: 0, max: 1, step: 0.1 }), 0.3, "no floating point noise");
  assert.deepEqual([-1, 0, 99, 100, 101, 250].map(index => jogWrap(index, 100)), [99, 0, 99, 0, 1, 50]);
  // Steps stand on an index: going round with wrap, stopping at the ends without it.
  assert.deepEqual([-3, 0, 99, 100, 205].map(steps => jogIndexOfSteps(steps, 100, true)), [97, 0, 99, 0, 5]);
  assert.deepEqual([-3, 0, 99, 100, 205].map(steps => jogIndexOfSteps(steps, 100, false)), [0, 0, 99, 99, 99]);
});

test("the shorter way round: a step past an end is one step with wrap and the whole range without, and the angle only ever grows past a wrap", () => {
  assert.equal(jogDelta(99, 0, 100, true), 1);
  assert.equal(jogDelta(0, 99, 100, true), -1);
  assert.equal(jogDelta(10, 40, 100, true), 30);
  assert.equal(jogDelta(10, 70, 100, true), -40, "more than half the values is the other way");
  assert.equal(jogDelta(0, 50, 100, true), 50, "exactly half keeps its sign");
  assert.equal(jogDelta(99, 0, 100, false), -99);
  const turn = 24, step = jogStepAngle(turn);
  assert.equal(step, 15);
  assert.equal(jogInitialAngle(12, range, turn), 180);
  assert.equal(jogInitialAngle(0, { min: -12, max: 12 }, 12), 360, "the angle's origin is `min`");
  // 250 single steps up from 98: past the wrap the angle goes on, never back.
  let angle = jogInitialAngle(98, range, turn), value = 98, previous = angle;
  for (let count = 0; count < 250; count++) {
    value = (value + 1) % 100;
    angle = jogAdvance(angle, value, range, turn, true);
    assert.equal(round(angle - previous), 15, `step ${count}: one step is 15°`);
    previous = angle;
  }
  assert.equal(angle, 98 * 15 + 250 * 15);
  // And down through the wrap: the angle falls.
  angle = jogInitialAngle(1, range, turn); value = 1;
  for (let count = 0; count < 5; count++) { value = (value + 99) % 100; const next = jogAdvance(angle, value, range, turn, true); assert.equal(round(angle - next), 15); angle = next; }
  assert.equal(angle, -4 * 15);
  // Without wrap the angle stands on the value's index, 0 to count − 1 steps.
  assert.equal(jogAdvance(jogInitialAngle(0, range, turn), 99, range, turn, false), 99 * 15);
  // A programmatic jump takes the shorter way round: 10 to 80 is 30 steps back.
  assert.equal(jogAdvance(jogInitialAngle(10, range, turn), 80, range, turn, true), 10 * 15 - 30 * 15);
  // Steps from an angle between steps round to the nearest.
  assert.equal(jogSteps(22, 15), 1);
  assert.equal(jogSteps(-8, 15), -1);
});

test("the pointer's angle about the centre, the turn it adds the shorter way round, and the vertical drag", () => {
  assert.deepEqual([[0, -1], [1, 0], [0, 1], [-1, 0]].map(([x, y]) => Math.round(pointerAngle(x, y))), [0, 90, 180, -90]);
  assert.equal(angleDelta(170, -170), 20, "across the bottom, clockwise");
  assert.equal(angleDelta(-170, 170), -20);
  assert.equal(angleDelta(0, 180), 180);
  assert.equal(angleDelta(90, 90), 0);
  assert.equal(verticalAngle(0, -240), 360, "a turn per 240 px, up is clockwise");
  assert.equal(verticalAngle(0, 60), -90);
  assert.equal(verticalAngle(0, -240, { shift: true }), 36, "a tenth with Shift");
});

test("the inertia: a flick coasts on spring.jog and stops; a detented wheel settles on a detent; the release speed is held to the rate the page can take", () => {
  assert.deepEqual(jogSpring, { stiffness: 40, damping: 3.2 });
  const stepAngle = 15;
  // A continuous wheel: friction alone. Its speed falls by exp(−damping t): about a quarter of a second to a third.
  const free = { a: 0, v: 720 };
  let time = 0, rests = false;
  while (!rests && time < 10) { rests = coast(free, 1 / 60, stepAngle, false); time += 1 / 60; }
  assert.ok(rests && time > 1.5 && time < 3.5, `a continuous flick of 720°/s runs ${time.toFixed(2)} s`);
  // The distance is v / damping, a little under: 225°.
  assert.ok(free.a > 200 && free.a < 235, `and turns ${free.a.toFixed(0)}°`);
  // A detented wheel comes to rest exactly on a detent.
  const detented = { a: 3, v: 540 };
  rests = false; time = 0;
  while (!rests && time < 20) { rests = coast(detented, 1 / 60, stepAngle, true); time += 1 / 60; }
  assert.ok(rests, "a detented wheel comes to rest");
  assert.equal(detented.v, 0);
  assert.equal(detented.a % stepAngle, 0, `on a detent: ${detented.a}`);
  // The same frames, the same result: a fixed 4 ms step.
  const again = { a: 3, v: 540 };
  for (let frame = 0; frame < Math.round(time * 60); frame++) coast(again, 1 / 60, stepAngle, true);
  assert.equal(round(again.a), round(detented.a));
  // A flick the other way runs the other way; a slow release does not run at all (the behaviour tests it against `jog.flick`).
  const back = { a: 0, v: -720 };
  coast(back, 0.1, stepAngle, false);
  assert.ok(back.a < 0 && back.v < 0);
  // Held to `jog.maxRate` steps a second: 240 steps of 15° is 3,600°/s.
  assert.equal(jogLimit(9000, 15, 240), 3600);
  assert.equal(jogLimit(-9000, 15, 240), -3600);
  assert.equal(jogLimit(500, 15, 240), 500);
  assert.equal(jogDefaults.maxRate / 60, 4, "at 60 frames a second, at most 4 steps a frame");
});

test("the model every binding renders: the angle at the initial value's step, the turn, the classes, and the value text", () => {
  const model = jogWheelModel({ value: 12, unit: " fr" });
  assert.deepEqual(model, { min: 0, max: 99, step: 1, wrap: true, detented: false, vertical: false, style: "--strata-jog-angle: 180; --strata-jog-turn: 24;", valueText: "12 fr" });
  assert.equal(jogStyle(7.123, 24), "--strata-jog-angle: 7.12; --strata-jog-turn: 24;");
  const other = jogWheelModel({ value: 0, min: -12, max: 12, turn: 12, detents: true, wrap: false, drag: "vertical", unit: " st" });
  assert.deepEqual([other.detented, other.wrap, other.vertical, other.style, other.valueText], [true, false, true, "--strata-jog-angle: 360; --strata-jog-turn: 12;", "0 st"]);
  assert.equal(jogWheelModel({ value: -3, min: -12, max: 12, unit: " st" }).valueText, "−3 st", "a true minus sign");
  assert.equal(jogWheelModel({ value: 5, format: value => `Mark ${value}` }).valueText, "Mark 5");
  assert.equal(jogWheelModel({ value: 5 }).valueText, undefined);
});

test("the tokens carry the jog wheel's and the patch point's numbers and the CSS takes its sizes from them", () => {
  const jog = strataTokens.jog;
  assert.deepEqual([jog.turn.$value, jog.dragPx.$value, jog.fine.$value, jog.tapSlop.$value, jog.flick.$value, jog.maxRate.$value], [24, "240px", 0.1, "4px", 180, 240]);
  assert.deepEqual([jogDefaults.turn, jogDefaults.dragPx, jogDefaults.fine, jogDefaults.tapSlop, jogDefaults.flick, jogDefaults.maxRate], [24, 240, 0.1, 4, 180, 240]);
  assert.deepEqual(Object.values(strataTokens.size.jogWheel).map(token => token.$value), ["64px", "96px", "128px"]);
  assert.deepEqual(Object.values(strataTokens.size.patchPoint).map(token => token.$value), ["28px", "36px", "44px"]);
  assert.deepEqual(Object.values(patchWasher), [28, 36, 44]);
  const stylesheet = tokensToCss(strataTokens);
  assert.match(stylesheet, /--strata-jog-wheel-size: var\(--strata-size-jog-wheel-medium\);/);
  assert.match(stylesheet, /\[data-strata-size="small"\] \{[^}]*--strata-patch-point-size: var\(--strata-size-patch-point-small\);/);
  assert.match(stylesheet, /--strata-jog-turn: 24;/);
  assert.match(stylesheet, /--strata-jog-drag-px: 240px;/);
  assert.deepEqual(validateTokens(strataTokens), []);
  // The premium character's springs are the ones the code keeps.
  const premium = characterOf("premium");
  assert.deepEqual([premium.tokens.spring.jog.stiffness.$value, premium.tokens.spring.jog.damping.$value], [jogSpring.stiffness, jogSpring.damping]);
  assert.deepEqual([premium.tokens.spring.patch.stiffness.$value, premium.tokens.spring.patch.damping.$value], [patchSpring.stiffness, patchSpring.damping]);
  const applied = applyCharacter(strataTokens, "premium");
  assert.deepEqual(applied.issues, []);
  assert.ok(applied.applied.includes("spring.jog.stiffness") && applied.applied.includes("spring.patch.damping"));
});

test("every part of the wheel and the jack is styled; preferences: reduced motion, forced colours and more contrast", () => {
  for (const name of ["ug-jog-wheel", "ug-jog-wheel__dial", "ug-jog-wheel__well", "ug-jog-wheel__wheel", "ug-jog-wheel__turn", "ug-jog-wheel__dimple", "ug-jog-wheel__input", "ug-jog-wheel__label", "ug-jog-wheel--detented",
    "ug-patch-point", "ug-patch-point__input", "ug-patch-point__object", "ug-patch-point__washer", "ug-patch-point__jack", "ug-patch-point__stub", "ug-patch-point__plug", "ug-patch-point__led", "ug-patch-point__label",
    "ug-patch-point--button", "ug-patch-bay", "ug-patch-bay__legend", "ug-patch-bay__jacks"]) assert.ok(css.includes(`.${name}`), `${name} is styled`);
  for (const part of patchPointMarkup) assert.ok(css.includes(`.${part.className}`), part.className);
  assert.match(css, /rotate: calc\(var\(--strata-jog-angle, 0\) \* 1deg\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+:where\(\.ug-jog-wheel--detented \.ug-jog-wheel__turn\) \{ transition: none; \}/);
  assert.match(css, /@media \(forced-colors: active\) \{[^]*?:where\(\.ug-jog-wheel__well, \.ug-jog-wheel__wheel\) \{ forced-color-adjust: none; border: 1px solid CanvasText; background: Canvas;/);
  assert.match(css, /:where\(\.ug-patch-point__plug\) \{ background: Highlight; \}/);
  assert.match(css, /@media \(prefers-contrast: more\) \{\n\s+:where\(\.ug-jog-wheel\) \{ --_ink: var\(--strata-colour-text\); \}/);
  // The dimple's light is turned back by the wheel's angle, so the dish is lit from the light's side wherever it is.
  assert.match(css, /--_lx: calc\(var\(--_jx\) \* cos\(var\(--_a\)\) \+ var\(--_jy\) \* sin\(var\(--_a\)\)\);/);
  // The jack's LED is a StatusLight's, lit while connected; the plug and the stub show only while connected.
  assert.match(css, /:where\(\.ug-patch-point__led\) \{ --strata-lit: 0; \}/);
  assert.match(css, /--strata-lit: 1; \}\n\s+:where\(\.ug-patch-point__label\)/);
});

test("the jack's markup, boxes and sizes: a washer and its room, the parts in paint order, the LED a StatusLight lens", () => {
  assert.deepEqual(patchPointMarkup, [
    { className: "ug-patch-point__washer", face: "raised" }, { className: "ug-patch-point__jack", face: "well" },
    { className: "ug-patch-point__stub" }, { className: "ug-patch-point__plug", face: "knob" }]);
  assert.deepEqual(patchLedMarkup, [{ className: "ug-status-light__socket" }, { className: "ug-status-light__lens", face: "knob" }]);
  assert.equal(PATCH_ROOM, 10);
  assert.deepEqual(Object.values(patchWasher).map(patchPointBox), [48, 56, 64]);
  for (const size of Object.values(patchWasher)) assert.equal(patchBox(size), patchPointBox(size));
  assert.deepEqual(Object.values(jogSizes()).map(jogBox), [96, 128, 160]);
  assert.deepEqual(patchSpring, { stiffness: 1100, damping: 60 });
  assert.deepEqual(patchBayModel({}), {});
  assert.deepEqual(patchBayModel({ columns: 3 }), { style: "--strata-patch-columns: 3;" });
  assert.deepEqual(patchBayModel({ columns: 0 }), {});
  // The hole, the plug and the cable at each size: whole pixels of diameter, as the CSS rounds them.
  assert.deepEqual(Object.values(patchWasher).map(size => { const r = patchRadii(size); return [r.hole * 2, r.plug * 2, r.cable]; }), [[12, 10, 1.54], [16, 12, 1.98], [20, 14, 2.42]]);
});
const jogSizes = () => ({ small: 64, medium: 96, large: 128 });

/** A context for the Relief and Objects entries: a 600 px panel, a wheel's box 128 at (40, 40) with the wheel (96) and its recess (104) centred in it. */
function jogContext(element, { objects = false, hover = false, disabled = false } = {}) {
  const boxes = { well: [52, 52, 104, 104], wheel: [56, 56, 96, 96], dimple: [90, 56 + 96 / 2 - 32.64 - 10, 20, 20], input: [40, 40, 128, 128] };
  const root = { querySelector: selector => (selector === ".ug-jog-wheel__wheel" ? { kind: "wheel" } : null) };
  const kind = element.kind;
  return { element: { matches: selector => selector.split(",").some(part => part.trim() === `.ug-jog-wheel__${kind}`), closest: selector => (selector === ".ug-jog-wheel" ? root : null), kind },
    context: { rect: boxes[kind], box: boxes.input, state: { hover, disabled }, objects, base: 0, rectOf: () => boxes.wheel, material: (_element, face) => `m-${face}`, knob: "satin", well: 1, light: { azimuth: 323, elevation: 41 }, hoverHeight: 1.6, domes: new Set() } };
}

test("at Relief and Objects the wheel is a raised disc or a slab on the recess's floor, standing only as high as its box lets its shadow reach, with the dimple a well on it", () => {
  for (const objects of [false, true]) {
    const wheel = jogContext({ kind: "wheel" }, { objects }), dimple = jogContext({ kind: "dimple" }, { objects }), well = jogContext({ kind: "well" }, { objects });
    const [wheelEntry] = jogWheelFormEntries(wheel.element, wheel.context), [dimpleEntry] = jogWheelFormEntries(dimple.element, dimple.context), [wellEntry] = jogWheelFormEntries(well.element, well.context);
    if (!objects) {
      assert.deepEqual([wellEntry.face, wheelEntry.face, dimpleEntry.face], ["well", "raised", "well"]);
      assert.equal(wheelEntry.height, jogReliefHeights.wheel, "5 fits a 16 px margin (2.42 · 5 + 1 = 13.1)");
    } else {
      assert.deepEqual([wellEntry.object, wheelEntry.object, dimpleEntry.object], ["well", "slab", "well"]);
      assert.equal(wheelEntry.base, -1, "it stands on the recess's floor, 1 px down");
      assert.equal(dimpleEntry.base, 4, "the dimple is sunk from the wheel's top (the floor + 5)");
    }
    assert.equal(wheelEntry.radius, 48);
    assert.equal(dimpleEntry.radius, 10);
    assert.equal(wellEntry.radius, 52);
    assert.equal(dimple.context.domes.size, 1, "the dimple's CSS paint is hidden: the GPU draws it");
    assert.equal(wheel.context.domes.size, 0);
    // Every part's rect and the shadow stay in the box: hover raises the cap by a quarter (Objects) or by `state.hoverHeight`, still fitted.
    const hovered = jogContext({ kind: "wheel" }, { objects, hover: true });
    const [lifted] = jogWheelFormEntries(hovered.element, hovered.context);
    const reach = shadowReach(lifted.height * (objects ? 1.25 : 1.6), { azimuth: 323, elevation: 41 });
    assert.ok(Math.max(reach.left, reach.right, reach.top, reach.bottom) <= 16.05, "the lifted wheel's shadow reaches no further than its 16 px of room");
  }
  // A wheel in a tight box stands lower; a part that is not the wheel's is left to the helper.
  const tight = jogContext({ kind: "wheel" });
  tight.context.box = [52, 52, 104, 104];
  assert.ok(jogWheelFormEntries(tight.element, tight.context)[0].height < 5);
  assert.equal(jogWheelFormEntries({ matches: () => false, closest: () => null }, tight.context), undefined);
  assert.deepEqual(jogWheelFormEntries(jogContext({ kind: "wheel" }).element, { ...jogContext({ kind: "wheel" }).context, rect: [0, 0, 0, 0] }), []);
});

function patchContext(kind, { objects = false, hover = false } = {}) {
  const boxes = { washer: [26, 26, 36, 36], jack: [36, 36, 16, 16], plug: [38, 38, 12, 12], control: [16, 16, 56, 56] };
  const root = { querySelector: selector => (selector === ".ug-patch-point__washer" ? { kind: "washer" } : null) };
  return { element: { matches: selector => selector.split(",").some(part => part.trim() === `.ug-patch-point__${kind}`), closest: selector => (selector === ".ug-patch-point" ? root : null) },
    context: { rect: boxes[kind], box: boxes.control, state: { hover }, objects, base: 3, rectOf: () => boxes.washer, knob: { material: "satin", colour: "#eceef2" }, well: { material: "well", depth: 2 },
      light: { azimuth: 323, elevation: 41 }, hoverHeight: 1.6, domes: new Set() } };
}

test("at Relief and Objects the jack is a raised washer or a round slab, a well or a pit in it, and a dome plug on the hole's floor", () => {
  for (const objects of [false, true]) {
    const [washer] = patchPointFormEntries(...Object.values(patchContext("washer", { objects }))), [jack] = patchPointFormEntries(...Object.values(patchContext("jack", { objects })));
    const plugContext = patchContext("plug", { objects });
    const [plug] = patchPointFormEntries(...Object.values(plugContext));
    assert.equal(washer.radius, 18);
    if (!objects) {
      assert.deepEqual([washer.face, jack.face, plug.face], ["raised", "well", "knob"]);
      assert.equal(washer.height, patchReliefHeights.washer);
      assert.equal(jack.height, 2, "capped at 2 px");
    } else {
      assert.deepEqual([washer.object, jack.object, plug.object], ["slab", "well", "knob"]);
      assert.equal(washer.base, 3);
      assert.equal(jack.base, 5, "the pit is sunk from the washer's top (3 + 2)");
      assert.ok(jack.height <= 2 * 0.75 + 1e-9 && jack.height > 0, "and is not deeper than the washer");
      assert.ok(plug.base < jack.base, "the plug stands on the pit's floor");
      assert.deepEqual(plug.bounds, [16, 16, 56, 56], "a dome is held to the control's box");
      assert.equal(plug.colour, "#eceef2");
    }
    assert.equal(plugContext.context.domes.size, 1, "the plug's CSS paint is hidden: the GPU draws it");
  }
  assert.equal(patchPointFormEntries({ matches: () => false, closest: () => null }, patchContext("washer").context), undefined);
});

test("the springs: a free spring runs past the stops and settles, a seating is held to 0–1 and under reduced motion goes at once", () => {
  const spring = { t: 0, v: 0, time: 0 };
  let rests = false, overshoot = 0;
  for (let ms = 4; ms <= 2000 && !rests; ms += 4) { rests = advanceFree(spring, 360, ms, knobSprings.detent, 0.01); overshoot = Math.max(overshoot, spring.t - 360); }
  assert.ok(rests && spring.t === 360, "settles on its target");
  assert.ok(overshoot > 0 && overshoot < 360 * 0.05, `underdamped by ${overshoot.toFixed(1)}° past a 360° turn`);
  // Unclamped: far angles are reachable.
  const far = { t: 0, v: 0, time: 0 };
  advanceFree(far, 5000, 100, knobSprings.detent);
  assert.ok(far.t > 100);
  // `followSpring`: the first time it is seen it is at rest; then it follows; reduced motion is instant; without springs it is the target.
  const springs = new WeakMap(), moving = new Set(), element = {};
  assert.equal(followSpring(element, 0, patchSpring, { now: 0, instant: false, springs, moving }, { limits: [0, 1] }), 0);
  const first = followSpring(element, 1, patchSpring, { now: 100, instant: false, springs, moving }, { limits: [0, 1] });
  assert.ok(first > 0 && first < 1, `a frame later: ${first}`);
  assert.ok(moving.has(element), "a spring that is moving asks for another scene");
  let t = first, now = 100;
  while (moving.has(element) && now < 3000) { moving.clear(); now += 16; t = followSpring(element, 1, patchSpring, { now, instant: false, springs, moving }, { limits: [0, 1] }); assert.ok(t >= 0 && t <= 1, "held to the stops"); }
  assert.equal(t, 1);
  assert.equal(followSpring(element, 0, patchSpring, { now: now + 10, instant: true, springs, moving }, { limits: [0, 1] }), 0, "instant under reduced motion");
  assert.equal(followSpring({}, 0.4, patchSpring, { now: 0, instant: false }), 0.4);
});

const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
function sceneOf(objects, profiles, materials) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 320 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, 400, 320], radius: 12, height: 8, material: "matte" }], profiles, objects };
}
const light = { azimuth: 323, elevation: 41 };
const wheelAt = (profile, { size = 96, x = 0, y = 0, angle = 0, scale = 1, id = "wheel", state = { hover: false, disabled: false } } = {}) =>
  jogWheelObject({ id, box: [x, y, jogBox(size), jogBox(size)], size, angle, scale, state, light, relief: { height: 3, material: "knobSkirt" } }, profile);
const jackAt = (profile, { size = 36, x = 0, y = 0, t = 0, scale = 1, id = "jack", state = { hover: false, disabled: false } } = {}) =>
  patchPointObject({ id, box: [x, y, patchBox(size), patchBox(size)], size, t, scale, state, light, relief: { height: 3, material: "knobCap" } }, profile);
const materials = { ...premiumMaterials, ...jogMaterials, ...patchMaterials };

test("the wheel is a collar, a cap, a chamfer and a dimple that turns about the wheel's centre; the angle is its place in a turn", () => {
  const { profiles, profile } = registry();
  const wheel = wheelAt(profile, { angle: 450 });
  assert.deepEqual(wheel.parts.map(part => `${part.kind}:${part.material}`), ["collar:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "grip:jogDimple"]);
  assert.equal(wheel.t, 0.25, "450° is a quarter into the second turn");
  assert.equal(turnOf(-90), 0.75);
  assert.equal(turnOf(360), 0);
  assert.equal(turnOf(1e6 + 15), round((((1e6 + 15) % 360) + 360) % 360 / 360));
  assert.deepEqual(wheel.bounds, { rect: [0, 0, 128, 128], radius: 0 });
  const dimple = wheel.parts[3], { at, diameter } = dimpleOf(96);
  assert.deepEqual([diameter, at], [20, 32.64]);
  assert.deepEqual(dimple.pose, { from: { turn: 0, pivot: [0, at, 0] }, to: { turn: 360, pivot: [0, at, 0] } });
  assert.deepEqual(dimple.at, [64, round(64 - at), 8], "it starts at the top, on the cap's top");
  assert.equal(dimple.caster, null);
  // The cap: Ø 96, 8 high, a 2 px chamfer, a flat top.
  const cap = profiles[wheel.parts[1].profile];
  assert.deepEqual([cap.points[0], cap.points.at(-1)], [[48, 0, 1, 0], [0, 8, 0, 1]]);
  assert.deepEqual(cap.points.at(-2), [46, 8, 0, 1]);
  // The collar stands 0.4 px outside the wheel, 3 wide, 1.6 high.
  const collar = profiles[wheel.parts[0].profile];
  assert.equal(collar.points[0][0], round(48 + 0.4 + 3));
  assert.ok(Math.max(...collar.points.map(point => point[1])) === 1.6);
  assert.deepEqual(jogGeometry.cap, { height: 8, chamfer: 2 });
  assert.equal(jogHeight(1), round(8 + 0.04 + 0.5 + 0.1));
  // The scene validates with core's validator, kept exactly (the same parts at every angle: only t differs).
  const scene = validateInstrumentScene(sceneOf([wheel], profiles, materials));
  assert.deepEqual(scene.objects[0].parts.map(part => part.kind), ["collar", "cap", "chamfer", "grip"]);
  assert.deepEqual(wheelAt(registry().profile, { angle: 17 }).parts.map(part => `${part.kind}:${part.profile}`), wheel.parts.map(part => `${part.kind}:${part.profile}`), "the parts never depend on the angle");
  // Under every size and depth: the same four parts, the dimple's profile a dish with a lip and the normals of a bowl.
  for (const size of [64, 96, 128]) for (const scale of [0.6, 1, 1.6]) {
    const sized = registry(), object = wheelAt(sized.profile, { size, scale });
    assert.equal(object.parts.length, 4);
    const dish = dimpleProfile(size);
    assert.equal(dish.type, "lathe");
    const inward = dish.points.slice(2).filter(point => point[0] < dimpleOf(size).radius && point[0] > 0);
    assert.ok(inward.every(point => point[2] < 0 && point[3] > 0), "concave: the normals lean to the axis, and up");
    assert.ok(dish.points.every(point => point[1] <= 0.04 + 0.5 + 1e-9), "it is a lip's height proud of the cap, no more");
  }
});

test("the dimple stays on a circle about the wheel's centre over the whole turn, and every vertex of the wheel stays 0.5 px inside its box at every depth and every corner of the stage", () => {
  const { profiles, profile } = registry();
  const wheel = wheelAt(profile, { x: 100, y: 100 });
  const dimple = wheel.parts[3], shape = profiles[dimple.profile], { at, radius } = dimpleOf(96);
  const centre = [100 + 64, 100 + 64];
  for (const t of [0, 0.125, 0.25, 0.5, 0.75, 1]) {
    const vertices = posedVertices(dimple, shape, t);
    let worst = 0, nearest = Infinity;
    for (let index = 0; index < vertices.length; index += 3) {
      const distance = Math.hypot(vertices[index] - centre[0], vertices[index + 1] - centre[1]);
      worst = Math.max(worst, distance);
      nearest = Math.min(nearest, distance);
    }
    // Every vertex of the dish is within its radius of the dimple's centre, which is `at` from the wheel's: so within `at + radius` of the wheel's.
    assert.ok(worst <= at + radius + 1e-6, `t ${t}: ${worst.toFixed(3)}`);
    assert.ok(nearest >= at - radius - 1e-6);
  }
  // Turn 0 is the top, turn 0.25 the right: the angle is clockwise.
  const topCentre = posedVertices(dimple, shape, 0), right = posedVertices(dimple, shape, 0.25);
  const meanOf = vertices => { const n = vertices.length / 3; return [0, 1].map(axis => { let sum = 0; for (let index = 0; index < n; index++) sum += vertices[index * 3 + axis]; return sum / n; }); };
  assert.deepEqual(meanOf(topCentre).map(Math.round), [centre[0], Math.round(centre[1] - at)]);
  assert.deepEqual(meanOf(right).map(Math.round), [Math.round(centre[0] + at), centre[1]]);
  const worst = {};
  for (const size of [64, 96, 128]) for (const scale of [0.6, 1, 1.6]) for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const reg = registry(), object = wheelAt(reg.profile, { size, scale, angle: t * 360 });
    const frontier = containmentFrontier(object, reg.profiles), [, , w, h] = object.rect;
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0], [960 - w / 2, 540 - h / 2]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, reg.profiles, frontier, placement);
      assert.ok(result.contained, `size ${size}, depth scale ${scale}, t ${t}, at ${e},${f}: inset ${result.inset}`);
      worst[`${size} ${scale}`] = Math.min(worst[`${size} ${scale}`] ?? Infinity, round(result.inset));
    }
  }
  console.log(`jog wheel: closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
});

test("the jack is a washer, a barrel, a floor, a plug and a cable that rise out of the hole with the seating, and nothing in it depends on the state", () => {
  const { profiles, profile } = registry();
  const unplugged = jackAt(profile, { t: 0 }), seated = jackAt(registry().profile, { t: 1 });
  assert.deepEqual(unplugged.parts.map(part => `${part.kind}:${part.material}`), ["plate:knobCap", "bushing:knobSkirt", "slot:knobInk", "pivot:knobSkirt", "lever:patchCable"]);
  assert.deepEqual([unplugged.t, seated.t, jackAt(registry().profile, { t: 4 }).t, jackAt(registry().profile, { t: -1 }).t], [0, 1, 1, 0]);
  assert.deepEqual(unplugged.bounds, { rect: [0, 0, 56, 56], radius: 0 });
  // The same parts at every seating, hovered and disabled or not: only t differs.
  for (const other of [seated, jackAt(registry().profile, { state: { hover: true, disabled: true } })]) assert.deepEqual(other.parts.map(part => `${part.kind}:${part.profile}:${part.material}`), unplugged.parts.map(part => `${part.kind}:${part.profile}:${part.material}`));
  const [plate, barrel, floor, plug, cable] = unplugged.parts;
  const r = patchRadii(36), heights = plugHeights(36, 1);
  assert.deepEqual([r.washer, r.hole, r.plug, r.cable], [18, 8, 6, 1.98]);
  // The washer and the barrel: rings around the hole, the barrel standing on the washer.
  assert.deepEqual(profiles[plate.profile].points.at(-1), [8, 0, -1, 0], "the bore's wall runs down to the face");
  assert.equal(plate.at[2], 0);
  assert.equal(barrel.at[2], 2.2, "the barrel stands on the washer's top");
  assert.equal(floor.at[2], 0);
  assert.deepEqual(profiles[floor.profile].points, [[8.05, 0.03, 0, 1], [0, 0.03, 0, 1]]);
  // The plug and the cable share one pose: sunk below the floor at 0, seated at 1.
  const sink = round(heights.plug + 1);
  assert.deepEqual(plug.pose, { from: { travel: -sink }, to: { travel: 0 } });
  assert.deepEqual(cable.pose, { from: { travel: -sink, tilt: 90, axis: 180 }, to: { travel: 0, tilt: 90, axis: 180 } });
  assert.deepEqual([heights.plug, heights.axis], [11, round(Math.max(11 - 1.98 - 1.2, 4 + 1.98 + 0.4))]);
  assert.ok(heights.axis - r.cable > 4, "the cable clears the barrel's top (4)");
  // Unplugged, the plug's top is under the floor (0.03) and the cable under the washer's top, out of sight; seated, the plug stands out of the hole.
  const top = (part, t) => { const v = posedVertices(part, profiles[part.profile], t); let high = -Infinity; for (let index = 2; index < v.length; index += 3) high = Math.max(high, v[index]); return high; };
  assert.ok(top(plug, 0) < 0, `unplugged the plug tops out at ${top(plug, 0)}`);
  assert.ok(top(cable, 0) < 0);
  assert.equal(round(top(plug, 1)), 11);
  // The cable runs from the plug's axis towards the bottom of the screen, to 2 px short of the washer's edge, and no higher than the plug.
  const tube = posedVertices(cable, profiles[cable.profile], 1), centre = [28, 28];
  let farthest = [...centre, 0];
  for (let index = 0; index < tube.length; index += 3) if (Math.hypot(tube[index] - centre[0], tube[index + 1] - centre[1]) > Math.hypot(farthest[0] - centre[0], farthest[1] - centre[1])) farthest = [tube[index], tube[index + 1], tube[index + 2]];
  assert.ok(Math.abs(farthest[0] - centre[0]) < 0.6, `straight down: x ${farthest[0]}`);
  assert.ok(farthest[1] - centre[1] > 15 && farthest[1] - centre[1] <= 16.01, `to the washer's edge less 2: ${farthest[1] - centre[1]}`);
  assert.ok(Math.abs(farthest[2] - heights.axis) <= r.cable + 0.01);
  let max = -Infinity;
  for (let index = 2; index < tube.length; index += 3) max = Math.max(max, tube[index]);
  assert.ok(max <= heights.plug + 1e-9, "no higher than the plug");
  // The scene validates, with the five parts, one profile each, within core's budgets.
  const scene = validateInstrumentScene(sceneOf([unplugged], profiles, materials));
  assert.equal(scene.objects[0].parts.length, 5);
  assert.equal(Object.keys(profiles).length, 5);
  assert.deepEqual(patchGeometry.cable, { diameter: 0.11, reach: 2 });
  assert.equal(patchHeight(36, 1), round(Math.max(11, heights.axis + r.cable) + 0.1));
});

test("every vertex of the jack stays 0.5 px inside its box over the whole seating, in every corner of the stage, at every size and depth", () => {
  const worst = {};
  for (const size of [28, 36, 44]) for (const scale of [0.6, 1, 1.6]) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const reg = registry(), object = jackAt(reg.profile, { size, scale, t });
    const frontier = containmentFrontier(object, reg.profiles), [, , w, h] = object.rect;
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0], [960 - w / 2, 540 - h / 2]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, reg.profiles, frontier, placement);
      assert.ok(result.contained, `size ${size}, depth scale ${scale}, t ${t}, at ${e},${f}: inset ${result.inset}`);
      worst[`${size} ${scale}`] = Math.min(worst[`${size} ${scale}`] ?? Infinity, round(result.inset));
    }
  }
  console.log(`patch point: closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A layer of wheels and jacks validates together, within core's 16 materials and its part kinds.
  const { profiles, profile } = registry();
  const objects = [wheelAt(profile, { x: 10, y: 10 }), jackAt(profile, { x: 200, y: 10, id: "jack-1" }), jackAt(profile, { x: 200, y: 100, id: "jack-2", t: 1, size: 28 }), wheelAt(profile, { x: 10, y: 160, id: "wheel-2", size: 64, angle: 90 })];
  const scene = validateInstrumentScene(sceneOf(objects, profiles, materials));
  assert.equal(scene.objects.length, 4);
  assert.ok(Object.keys(scene.materials).length <= 16);
  assert.ok(Object.keys(profiles).length <= 64);
});

test("every new profile is wound against its normals (core orients each triangle by them)", () => {
  const { profiles, profile } = registry();
  wheelAt(profile); jackAt(profile);
  const wrong = [];
  for (const [name, shape] of Object.entries(profiles)) {
    const { positions: p, normals: n, indices } = profileGeometry(shape);
    let errors = 0;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
      const e1 = [0, 1, 2].map(k => p[b * 3 + k] - p[a * 3 + k]), e2 = [0, 1, 2].map(k => p[c * 3 + k] - p[a * 3 + k]);
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if ([0, 1, 2].reduce((sum, k) => sum + cross[k] * (n[a * 3 + k] + n[b * 3 + k] + n[c * 3 + k]), 0) > 1e-9) errors++;
    }
    if (errors) wrong.push(name);
  }
  assert.deepEqual(wrong, []);
});
