/**
 * The Meter and the Gauge (anatomy pages `meter.md`, `gauge.md`): the zone rule of the HTML standard, the segments, the peak
 * hold, the markup model every binding renders (`packages/ui/src/shared/meter.ts`), the springs and the `linear()` curves the
 * CSS carries, the tokens, the Relief and Objects entries (`gpu/meter-forms.ts`) and the Instrument parts
 * (`gpu/instrument-meter.ts`) checked with core's own validator and containment check (`packages/core/src/instrument.ts`),
 * with the segments' lights validated by core's emitter format.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { advancePeak, meterBounds, meterDefaults, meterFraction, meterMarks, meterModel, meterSegmentCount, meterSpringCurve, meterSprings, meterStyle, meterZone, meterZoneRoles,
  needleGeometry, needleTurn, peakDefaults, peakIndex, segmentEmitterDefaults, segmentsLit, segmentZones, isMeterForm } from "../../packages/ui/src/shared/meter.ts";
import { lensEmitter } from "../../packages/ui/src/shared/lamp.ts";
import { switchThrow } from "../../packages/ui/src/shared/switch-forms.ts";
import { bezelProfile, hubProfile, meterBarObject, meterDialObject, meterHeight, meterMaterials, needleProfile, windowShape } from "../../packages/ui/src/gpu/instrument-meter.ts";
import { lampFormEntries } from "../../packages/ui/src/gpu/lamp-forms.ts";
import { meterFormEntries } from "../../packages/ui/src/gpu/meter-forms.ts";
import { applyCharacter, characterOf } from "../../packages/ui/src/tokens/character.ts";
import { strataTokens, tokensToCss, validateTokens } from "../../packages/ui/src/tokens/index.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment } = await import("../../packages/core/src/instrument.ts");
const { validateEmitters } = await import("../../packages/core/src/emitters.ts");
sourceImports.deregister();

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const round = value => Math.round(value * 1000) / 1000;

test("the zone rule is the HTML standard's: the region of `optimum` is good, the next one suboptimal, the far one worst", () => {
  // Defaults: low is the minimum, high the maximum, optimum the middle.
  assert.deepEqual(meterBounds({ min: 0, max: 100 }), { min: 0, max: 100, low: 0, high: 100, optimum: 50 });
  // A max below the min is the min; low and high stay in the range, high not below low; optimum within it.
  assert.deepEqual(meterBounds({ min: 10, max: 5, low: 0, high: 99, optimum: 400 }), { min: 10, max: 10, low: 10, high: 10, optimum: 10 });
  assert.deepEqual(meterBounds({ min: 0, max: 100, low: 80, high: 20 }), { min: 0, max: 100, low: 80, high: 80, optimum: 50 });
  // Optimum in the lower region (a level meter: green up to 70, amber to 90, red above).
  const level = { min: 0, max: 100, low: 70, high: 90, optimum: 0 };
  assert.deepEqual([0, 69.9, 70, 90, 90.1, 100].map(value => meterZone(value, level)), ["good", "good", "warn", "warn", "bad", "bad"]);
  // Optimum in the middle region: the middle is good, both ends suboptimal.
  const middle = { min: 0, max: 100, low: 30, high: 80, optimum: 50 };
  assert.deepEqual([0, 29, 30, 80, 81, 100].map(value => meterZone(value, middle)), ["warn", "warn", "good", "good", "warn", "warn"]);
  // Optimum in the upper region: the lower region is the worst.
  const top = { min: 0, max: 100, low: 20, high: 60, optimum: 100 };
  assert.deepEqual([0, 19, 20, 60, 61, 100].map(value => meterZone(value, top)), ["bad", "bad", "warn", "warn", "good", "good"]);
  // With no low and high the whole range is one region: good, whatever the value.
  assert.deepEqual([0, 50, 100].map(value => meterZone(value, { min: 0, max: 100 })), ["good", "good", "good"]);
  assert.deepEqual(meterZoneRoles, { good: "success", warn: "warning", bad: "danger" });
  // Each segment takes the zone of the value at the middle of the share it stands for.
  assert.deepEqual(segmentZones(16, level), [...Array(11).fill("good"), ...Array(3).fill("warn"), "bad", "bad"]);
  assert.deepEqual(segmentZones(8, { min: 0, max: 10 }), Array(8).fill("good"));
});

test("a segment is lit when the value reaches past its middle: half the range lights half the segments, nothing none", () => {
  assert.deepEqual([0, 0.25, 0.5, 0.75, 1].map(fraction => segmentsLit(fraction, 16)), [0, 4, 8, 12, 16]);
  assert.deepEqual([0, 0.5, 1].map(fraction => segmentsLit(fraction, 8)), [0, 4, 8]);
  // A tie rounds down (value · count − i − ½ must be above 0, as the CSS's clamp() has it), a hair over lights the next.
  assert.equal(segmentsLit(7.5 / 16, 16), 7);
  assert.equal(segmentsLit(7.5 / 16 + 1e-6, 16), 8);
  assert.equal(segmentsLit(-1, 16), 0);
  assert.equal(segmentsLit(9, 16), 16);
  assert.equal(segmentsLit(0.001, 16), 0);
  assert.equal(segmentsLit(0.04, 16), 1);
  // The same rule as the CSS, segment by segment, over a sweep of values.
  const css = (fraction, count, index) => Math.min(1, Math.max(0, (fraction * count - index - 0.5) * 1000));
  for (const count of [8, 16, 24]) for (let step = 0; step <= 200; step++) {
    const fraction = step / 200, lit = Array.from({ length: count }, (_, index) => css(fraction, count, index)).reduce((sum, on) => sum + (on >= 0.5 ? 1 : 0), 0);
    assert.equal(segmentsLit(fraction, count), lit, `${count} segments at ${fraction}`);
  }
  assert.equal(meterSegmentCount(), meterDefaults.segments);
  assert.deepEqual([meterSegmentCount(1), meterSegmentCount(7.6), meterSegmentCount(99), meterSegmentCount(NaN)], [2, 8, 32, 16]);
  assert.equal(meterDefaults.segments, 16);
});

test("a held peak stays for the hold, falls at the decay and never below the signal", () => {
  assert.deepEqual(peakDefaults, { hold: 600, decay: 0.5 });
  const tokens = { hold: 600, decay: 0.5 };
  let step = advancePeak(undefined, 0.8, 0, tokens);
  assert.deepEqual([step.value, step.falling], [0.8, false]);
  // The signal falls: the peak holds 600 ms, then falls half the range a second.
  step = advancePeak(step.state, 0.2, 300, tokens);
  assert.deepEqual([step.value, step.falling], [0.8, true]);
  step = advancePeak(step.state, 0.2, 600, tokens);
  assert.equal(step.value, 0.8);
  step = advancePeak(step.state, 0.2, 1100, tokens);
  assert.equal(round(step.value), 0.55);
  step = advancePeak(step.state, 0.2, 1500, tokens);
  assert.equal(round(step.value), 0.35);
  // It lands on the signal and rests there.
  step = advancePeak(step.state, 0.2, 5000, tokens);
  assert.deepEqual([step.value, step.falling], [0.2, false]);
  // A new maximum takes it up at once.
  step = advancePeak(step.state, 0.9, 5016, tokens);
  assert.deepEqual([step.value, step.falling], [0.9, false]);
  // A held peak is a segment: the highest lit.
  assert.deepEqual([0, 0.04, 0.5, 1].map(fraction => peakIndex(fraction, 16)), [-1, 0, 7, 15]);
  // The tokens carry the defaults and refuse nonsense.
  assert.equal(strataTokens.meter.peakHold.$value, "600ms");
  assert.equal(strataTokens.meter.peakDecay.$value, 0.5);
});

test("the model is what every binding renders: classes, style, the native attributes, the segments, the marks and the value text", () => {
  const bar = meterModel({ value: 62, low: 70, high: 90, optimum: 0, segments: 8, unit: " %", marks: 3 });
  assert.deepEqual(bar.classes, ["ug-meter--bar"]);
  assert.equal(bar.style, "--strata-meter-value: 0.62; --strata-meter-count: 8;");
  assert.deepEqual(bar.native, { min: 0, max: 100, value: 62, low: 70, high: 90, optimum: 0 });
  assert.deepEqual(bar.segments.map(segment => segment.zone), [..."gggggg".split("").map(() => "good"), "warn", "bad"]);
  assert.deepEqual(bar.segments.map(segment => segment.style), Array.from({ length: 8 }, (_, index) => `--_i: ${index};`));
  assert.deepEqual(bar.marks.map(mark => [mark.value, mark.text, mark.style]), [[0, "0", "--strata-meter-at: 0;"], [50, "50", "--strata-meter-at: 0.5;"], [100, "100", "--strata-meter-at: 1;"]]);
  assert.equal(bar.valueText, "62 %");
  assert.equal(bar.peak, false);
  // A peak, a format and a native default: only the attributes the author gave.
  const hold = meterModel({ value: 3, max: 10, peak: true, format: value => `${value} of 10` });
  assert.deepEqual(hold.classes, ["ug-meter--bar", "ug-meter--peak"]);
  assert.deepEqual(hold.native, { min: 0, max: 10, value: 3 });
  assert.equal(hold.valueText, "3 of 10");
  assert.equal(hold.peak, true);
  // A value outside the range is held to it, as the browser does.
  assert.equal(meterModel({ value: 400 }).native.value, 100);
  // A needle meter and a dial print a zone band where `low` or `high` is given, and have no segments.
  const vu = meterModel({ value: -6, min: -20, max: 3, high: 0, form: "needle", unit: " dB", marks: [-20, -10, 0, 3] });
  assert.deepEqual(vu.classes, ["ug-meter--needle"]);
  assert.equal(vu.style, "--strata-meter-value: 0.6087; --strata-meter-hi: 0.8696;");
  assert.deepEqual(vu.segments, []);
  assert.deepEqual(vu.marks.map(mark => mark.text), ["−20", "−10", "0", "3"]);
  assert.equal(vu.valueText, "−6 dB");
  const gauge = meterModel({ value: 72, max: 120, low: 20, high: 100, form: "dial" });
  assert.deepEqual(gauge.classes, ["ug-meter--dial", "ug-gauge"]);
  assert.equal(gauge.style, "--strata-meter-value: 0.6; --strata-meter-lo: 0.1667; --strata-meter-hi: 0.8333;");
  // Marks: a count (the ends and evenly between), or values with labels; outside the range they are left out.
  assert.deepEqual(meterMarks({ min: 0, max: 100 }, 5, 3).map(mark => mark.value), [0, 25, 50, 75, 100]);
  assert.deepEqual(meterMarks({ min: 0, max: 100 }, undefined, 3).map(mark => mark.value), [0, 50, 100]);
  assert.deepEqual(meterMarks({ min: 0, max: 100 }, [0, { value: 50, label: "mid" }, 200], 3).map(mark => mark.text), ["0", "mid"]);
  assert.deepEqual(meterMarks({ min: 0, max: 100 }, 0, 3), []);
  assert.deepEqual(meterDefaults.marks, { bar: 5, needle: 3, dial: 5 });
  assert.equal(meterFraction(50, { min: 0, max: 100 }), 0.5);
  assert.equal(meterFraction(5, { min: 5, max: 5 }), 0);
  assert.equal(meterStyle(0.5, { min: 0, max: 1 }), "--strata-meter-value: 0.5;");
  assert.ok(isMeterForm("bar") && isMeterForm("needle") && !isMeterForm("dial"));
  assert.equal(needleTurn(0.5, 240), 0);
  assert.deepEqual([needleTurn(0, 240), needleTurn(1, 240), needleTurn(2, 240)], [-120, 120, 120]);
});

test("the needle's springs are lightly underdamped, clamped at the stops, and the CSS carries their linear() curves", () => {
  assert.deepEqual(meterSprings, { meter: { stiffness: 360, damping: 28 }, gauge: { stiffness: 160, damping: 20 } });
  for (const kind of ["meter", "gauge"]) {
    const { stiffness, damping } = meterSprings[kind], zeta = damping / (2 * Math.sqrt(stiffness));
    assert.ok(zeta < 1 && zeta > 0.6, `${kind}: damping ratio ${round(zeta)}`);
    // Never past a stop, and at rest on the target.
    const throwing = switchThrow(meterSprings[kind]);
    assert.ok(Math.max(...throwing) <= 1 && Math.min(...throwing) >= 0);
    assert.equal(throwing.at(-1), 1);
    // The CSS presentation's easing is the spring's own curve.
    const curve = meterSpringCurve(kind);
    assert.ok(css.includes(`--_throw: ${curve.easing};`), `${kind}'s linear() curve is in the CSS`);
    assert.ok(css.includes(`--_throw-duration: ${curve.duration}ms;`), `${kind}'s duration is in the CSS`);
  }
  // The gauge is the slower: its needle takes longer to settle.
  assert.ok(meterSpringCurve("gauge").duration > meterSpringCurve("meter").duration);
  // The tokens carry the same numbers (the premium character's Instrument layer).
  const character = characterOf("premium");
  for (const kind of ["meter", "gauge"]) {
    assert.equal(character.tokens.spring[kind].stiffness.$value, meterSprings[kind].stiffness);
    assert.equal(character.tokens.spring[kind].damping.$value, meterSprings[kind].damping);
  }
  const applied = applyCharacter(strataTokens, "premium");
  assert.deepEqual(applied.issues, []);
  assert.ok(applied.applied.includes("spring.meter.stiffness") && applied.applied.includes("spring.gauge.damping"));
  assert.ok(character.provisional.includes("emitter.segment"));
});

test("the tokens carry the sizes, the arcs and the segment light, and the CSS takes them", () => {
  assert.deepEqual(validateTokens(strataTokens), []);
  assert.deepEqual(["small", "medium", "large"].map(size => strataTokens.size.meter[size].$value), ["8px", "10px", "12px"]);
  assert.deepEqual(["small", "medium", "large"].map(size => strataTokens.size.gauge[size].$value), ["120px", "160px", "200px"]);
  assert.equal(strataTokens.meter.sweep.$value, 100);
  assert.equal(strataTokens.gauge.sweep.$value, 240);
  assert.deepEqual({ radius: strataTokens.emitter.segment.radius.$value, height: strataTokens.emitter.segment.height.$value, strength: strataTokens.emitter.segment.strength.$value }, segmentEmitterDefaults);
  const stylesheet = tokensToCss(strataTokens);
  assert.match(stylesheet, /--strata-meter-size: var\(--strata-size-meter-medium\);/);
  assert.match(stylesheet, /--strata-gauge-size: var\(--strata-size-gauge-medium\);/);
  assert.match(stylesheet, /\[data-strata-size="large"\] \{[^}]*--strata-gauge-size: var\(--strata-size-gauge-large\);/);
  assert.match(stylesheet, /--strata-meter-sweep: 100;/);
  assert.match(stylesheet, /--strata-gauge-sweep: 240;/);
  assert.match(stylesheet, /--strata-meter-peak-decay: 0\.5;/);
  // A sweep outside its range is refused.
  const wide = structuredClone(strataTokens);
  wide.gauge.sweep.$value = 400;
  assert.ok(validateTokens(wide).some(issue => issue.path === "gauge.sweep"));
  // The CSS styles every part, lights a segment from the value and turns the needle with its place on its spring.
  for (const part of ["ug-meter__body", "ug-meter__object", "ug-meter__window", "ug-meter__bezel", "ug-meter__segments", "ug-meter__segment", "ug-meter__scale", "ug-meter__mark", "ug-meter__zones", "ug-meter__needle", "ug-meter__hub", "ug-meter__native", "ug-meter__label"]) {
    assert.ok(css.includes(`.${part}`), `${part} is styled`);
  }
  assert.match(css, /@property --strata-meter-t \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/);
  assert.match(css, /--_k: clamp\(0, calc\(\(var\(--strata-meter-value, 0\) \* var\(--strata-meter-count, 16\) - var\(--_i, 0\) - 0\.5\) \* 1000\), 1\);/);
  assert.match(css, /--strata-meter-t: var\(--strata-meter-value, 0\);/);
  assert.match(css, /rotate: calc\(\(clamp\(0, var\(--strata-meter-t, 0\), 1\) - 0\.5\) \* var\(--_sweep\)\);/);
  // Preferences: reduced motion moves the needle at once and takes the glow off the segments; forced colours flatten; more contrast edges them.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+:where\(\.ug-meter--needle, \.ug-meter--dial\) \{ transition: none; \}\n\s+:where\(\.ug-meter__segment\) \{ box-shadow: none; \}/);
  assert.match(css, /@media \(forced-colors: active\) \{\n\s+:where\(\.ug-meter__window, \.ug-meter__bezel\) \{ forced-color-adjust: none; border: 1px solid CanvasText;/);
  assert.match(css, /@media \(prefers-contrast: more\) \{\n\s+:where\(\.ug-meter\) \{ --_ink: var\(--strata-colour-text\); \}/);
  // The GPU hides the needle's CSS paint when it draws the needle as a part.
  assert.match(css, /\[data-strata-mode="face"\]\) \.ug-meter__needle\[data-strata-dome\] \{ visibility: hidden; \}/);
});

// ---- Relief and Objects ----

const element = selector => ({ matches: query => query.split(",").some(part => part.trim() === selector), closest: () => null });
const formContext = (over = {}) => ({ rect: [10, 10, 100, 40], radius: 8, objects: false, base: 0, box: [4, 4, 108, 48], well: 2, raised: 3, taper: 3, material: (_, face) => face, light: { azimuth: 323, elevation: 41 }, ...over });

test("at Relief the window is a well and the bezel a raised face; at Objects a well object and a slab, the bezel standing only as high as its shadow allows", () => {
  assert.equal(meterFormEntries({ matches: () => false }, formContext()), undefined);
  const windowElement = element(".ug-meter__window"), bezelElement = element(".ug-meter__bezel");
  assert.deepEqual(meterFormEntries(windowElement, formContext()), [{ face: "well", rect: [10, 10, 100, 40], radius: 8, height: 2, material: "well" }]);
  assert.deepEqual(meterFormEntries(windowElement, formContext({ objects: true, base: 1 })), [{ object: "well", rect: [10, 10, 100, 40], radius: 8, height: 2, base: 1, taper: 2, material: "well" }]);
  // The bezel's cast shadow (2.8) must stay in the native box: 6 px of room lowers it to 2.06, a roomier box leaves it at 3.
  const roomy = meterFormEntries(bezelElement, formContext({ rect: [10, 10, 100, 40], box: [0, 0, 120, 60] }))[0];
  assert.deepEqual([roomy.face, roomy.height], ["raised", 3]);
  const tight = meterFormEntries(bezelElement, formContext({ rect: [10, 10, 100, 40], box: [4, 4, 112, 52] }))[0];
  assert.ok(tight.height > 0 && tight.height < 3, `a box 6 px away lowers the bezel to ${tight.height}`);
  const slab = meterFormEntries(bezelElement, formContext({ rect: [10, 10, 100, 40], box: [4, 4, 112, 52], objects: true, base: 0 }))[0];
  assert.deepEqual([slab.object, slab.height, slab.base], ["slab", tight.height, 0]);
  assert.ok(slab.taper <= slab.height);
  assert.deepEqual(meterFormEntries(windowElement, formContext({ rect: [10, 10, 0, 0] })), []);
  // A radius larger than the box is held to half its shorter side.
  assert.equal(meterFormEntries(windowElement, formContext({ radius: 999 }))[0].radius, 20);
  // The segments are the Lamp's LED lens: a disc at Relief, a dome at Objects, in the zone's lit or unlit colour.
  const segment = element(".ug-meter__segment");
  const lens = (over = {}) => ({ rect: [14, 14, 10, 10], state: {}, objects: false, base: 0, box: [0, 0, 120, 60], role: "#15803d", lit: 1, light: { azimuth: 323, elevation: 41 }, hoverHeight: 1.6, material: (_, role) => role, ...over });
  const [disc] = lampFormEntries(segment, lens());
  assert.deepEqual([disc.face, disc.ring.thickness, disc.ring.sweep, disc.material], ["ring", 5, 360, "glowOn"]);
  const [dark] = lampFormEntries(segment, lens({ lit: 0 }));
  assert.equal(dark.material, "lens");
  assert.notEqual(dark.ring.colour, disc.ring.colour);
  const [dome] = lampFormEntries(segment, lens({ objects: true, base: -2 }));
  assert.deepEqual([dome.object, dome.base, dome.bounds], ["knob", -2, [0, 0, 120, 60]]);
});

// ---- Instrument ----

const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
/** A scene around `objects`, as the GPU helper writes it. */
function sceneOf(objects, profiles, materials, emitters, extent = [400, 320]) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: extent[0], height: extent[1] }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, extent[0], extent[1]], radius: 12, height: 8, material: "matte" }], profiles, objects, ...(emitters ? { emitters, protected: [[20, 20, 100, 20]], feather: 4 } : {}) };
}
const premium = { knobCap: { base: { colour: "#eff0f1", metallic: 1, roughness: 0.3, direct: 1 } }, knobSkirt: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 1 } }, knobInk: { base: { colour: "#26282c", roughness: 0.6 } } };
/** The laid-out numbers of the medium bar: a 286.4 × 58 box, its window 4 px inside, 16 segments 15 px apart from 19.2 px in, the scale's glass strip under them. */
const barAt = (profile, { scale = 1, segments = 16, x = 0, y = 0 } = {}) => {
  const box = [x, y, 16 * 15 + 2 * 19.2 + 8, 58], window = [x + 4, y + 4, box[2] - 8, 50];
  return meterBarObject({ id: "bar", box, window: [window[0] + 4, y + 26, window[2] - 8, 24], windowRadius: 4, scale, relief: { height: 3, material: "meterGlass" },
    segments: Array.from({ length: segments }, (_, index) => ({ centre: [x + 4 + 19.2 + 7.5 + index * 15, y + 17], lens: 10, emitter: index, material: "meterGlass" })) }, profile);
};
const dialAt = (profile, form, { scale = 1, sweep, x = 0, y = 0, t = 0.5 } = {}) => {
  // A gauge: a 184 box, the bezel 6 px in, the window 6 px in again (160), the pivot at the centre. A needle meter: 264 × 152, a 240 × 128 window.
  const dial = form === "dial";
  const box = dial ? [x, y, 184, 184] : [x, y, 264, 152], window = dial ? [x + 12, y + 12, 160, 160] : [x + 12, y + 12, 240, 128];
  return meterDialObject({ id: form, box, window, windowRadius: dial ? 80 : 8, ...(dial ? { bezel: [x + 6, y + 6, 172, 172] } : {}), pivot: dial ? [x + 92, y + 92] : [x + 132, y + 120], length: dial ? 68 : 92,
    sweep: sweep ?? (dial ? 240 : 100), t, scale, relief: { height: 3, material: "knobSkirt" } }, profile);
};
const lights = (count, lit = 1) => Array.from({ length: count }, (_, index) => lensEmitter("led", [20 + index * 15, 20], 10, lit, "#15803d", segmentEmitterDefaults));

test("a bar is a glass pane over its scale and an LED lens per segment, each with its emitter; the parts never depend on the value", () => {
  const { profiles, profile } = registry();
  const bar = barAt(profile);
  assert.deepEqual(bar.parts.map(part => part.kind), ["window", ...Array(16).fill("segment")]);
  assert.equal(bar.parts[0].glass, "window");
  assert.equal(bar.parts[0].caster, null);
  assert.deepEqual(bar.parts.slice(1).map(part => part.emitter), Array.from({ length: 16 }, (_, index) => index));
  assert.ok(bar.parts.slice(1).every(part => part.glass === "lens" && part.caster === null && part.material === "meterGlass"));
  assert.equal(bar.t, 0, "no pose: the emitters light, nothing moves");
  assert.deepEqual(bar.bounds, { rect: [0, 0, 286.4, 58], radius: 0 });
  // The lens: Ø 10, 0.35 of its diameter high with a 1 px wall; every segment shares one profile.
  assert.equal(Object.keys(profiles).length, 2, "one window and one lens shape");
  const lens = Object.values(profiles).find(shape => shape.type === "lathe");
  assert.deepEqual([lens.points[0], lens.points.at(-1).slice(0, 2)], [[5, 0, 1, 0], [0, 3.5]]);
  const prism = Object.values(profiles).find(shape => shape.type === "prism");
  assert.deepEqual([prism.height, prism.chamfer], [2.4, 2.16]);
  // Core's validator takes the scene with the 16 lights, and the segments are glass parts carrying their emitters.
  const scene = validateInstrumentScene(sceneOf([bar], profiles, meterMaterials, lights(16)));
  assert.equal(scene.objects[0].parts.length, 17);
  assert.deepEqual(scene.objects[0].parts.slice(1).map(part => part.emitter), Array.from({ length: 16 }, (_, index) => index));
  assert.equal(validateEmitters(lights(16), "scene").length, 16);
  // One clear glass for the window and every lens: the emitter carries the zone's colour, so a bar adds one material to the layer.
  assert.deepEqual(Object.keys(meterMaterials), ["meterGlass"]);
  assert.equal(meterMaterials.meterGlass.glass.reflection, 1.5);
  // Lit or not is the emitter's strength alone: the same parts at every value.
  const { profile: again } = registry();
  assert.deepEqual(barAt(again).parts.map(part => `${part.kind}:${part.material}:${part.emitter}`), bar.parts.map(part => `${part.kind}:${part.material}:${part.emitter}`));
  // Opaque lacquer lenses (`prefers-reduced-transparency`) are not glass.
  const { profile: opaque } = registry();
  const lacquer = meterBarObject({ id: "bar", box: [0, 0, 286.4, 58], window: [8, 26, 270, 24], windowRadius: 4, scale: 1, opaque: true, relief: { height: 3, material: "meterGlass" },
    segments: [{ centre: [30, 17], lens: 10, emitter: 0, material: "lensOpaque #15803d" }] }, opaque);
  assert.equal(lacquer.parts[1].glass, undefined);
});

test("a needle meter and a gauge are a window, a needle on its pivot and its hub (a gauge: a bezel), the needle turning through the sweep with the value", () => {
  for (const form of ["needle", "dial"]) {
    const { profiles, profile } = registry();
    const object = dialAt(profile, form, { t: 0.25 });
    assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), [...(form === "dial" ? ["window:meterGlass", "bezel:knobSkirt"] : ["window:meterGlass"]), "needle:knobInk", "pivot:knobCap"]);
    const needle = object.parts.find(part => part.kind === "needle");
    const sweep = form === "dial" ? 240 : 100;
    assert.deepEqual(needle.pose, { from: { turn: -sweep / 2 - 90 }, to: { turn: sweep / 2 - 90 } });
    assert.equal(object.t, 0.25);
    assert.ok(object.parts.every(part => part.caster === null));
    const scene = validateInstrumentScene(sceneOf([object], profiles, { ...meterMaterials, ...premium }));
    assert.equal(scene.objects[0].t, 0.25);
    assert.deepEqual(scene.objects[0].parts.map(part => part.kind), object.parts.map(part => part.kind));
    // t is clamped to the stops.
    assert.equal(dialAt(registry().profile, form, { t: 3 }).t, 1);
    assert.equal(dialAt(registry().profile, form, { t: -1 }).t, 0);
  }
  assert.deepEqual(needleGeometry, { width: 2.2, height: 2.4, tail: 12, hubRadius: 6, hubHeight: 4, bezel: 5, bezelHeight: 3 });
  // The needle is a blade from a tail to the tip, the hub a dome, the bezel a ring from the window out.
  const blade = needleProfile(68, 1);
  assert.deepEqual([blade.type, blade.width, blade.outline[0], blade.outline[1]], ["extrude", 2.2, [-12, 0], [68, 0]]);
  assert.equal(hubProfile(1).points.at(-1)[1], 4);
  assert.deepEqual(bezelProfile(86, 80, 1).points.at(-1), [80, 3, 0, 1]);
  assert.deepEqual(windowShape(160, 160, 80, 1), { type: "prism", width: 160, length: 160, radius: 80, height: 2.4, chamfer: 2.16 });
  // At 0.6 depth the window is 1.44 high and its chamfer stays under it.
  assert.deepEqual([windowShape(100, 50, 8, 0.6).height, windowShape(100, 50, 8, 0.6).chamfer], [1.44, 1.296]);
  assert.equal(meterHeight("bar", 10, 1), 3.6);
  assert.equal(meterHeight("dial", 0, 1.6), round(4.8 * 1.6 + 0.1), "the needle on the glass is the tallest: 2.4 up and 2.4 high");
});

test("every vertex of a bar, a needle meter and a gauge stays 0.5 px inside its box over the whole travel, in every corner of the stage, at every depth", () => {
  const worst = {};
  for (const form of ["bar", "needle", "dial"]) for (const scale of [0.6, 1, 1.6]) for (const t of form === "bar" ? [0] : [0, 0.25, 0.5, 0.75, 1]) {
    const { profiles, profile } = registry();
    const object = form === "bar" ? barAt(profile, { scale }) : dialAt(profile, form, { scale, t });
    const frontier = containmentFrontier(object, profiles), [, , w, h] = object.rect;
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0], [960 - w / 2, 540 - h / 2]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, profiles, frontier, placement);
      assert.ok(result.contained, `${form}, depth scale ${scale}, t ${t}, at ${e},${f}: inset ${result.inset}`);
      worst[`${form} ${scale}`] = Math.min(worst[`${form} ${scale}`] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A needle longer than its dial would leave the box: the room is what keeps it in.
  const { profiles, profile } = registry();
  const long = meterDialObject({ id: "long", box: [0, 0, 184, 184], window: [12, 12, 160, 160], windowRadius: 80, bezel: [6, 6, 172, 172], pivot: [92, 92], length: 98, sweep: 240, t: 1, scale: 1.6, relief: { height: 3, material: "knobSkirt" } }, profile);
  const result = checkContainment(long, profiles, containmentFrontier(long, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("a layer of bars, a needle meter and a gauge validates with its lights, and the scene's materials stay within core's 16", () => {
  const { profiles, profile } = registry();
  const objects = [barAt(profile, { x: 10, y: 10 }), barAt(profile, { x: 10, y: 80 }), dialAt(profile, "needle", { x: 10, y: 150 }), dialAt(profile, "dial", { x: 300, y: 150 })];
  objects[1].id = "bar-2"; objects[3].id = "gauge"; objects[2].id = "vu";
  // Each bar's segments take their own lights; the second bar's emitters follow the first's.
  objects[1].parts.forEach(part => { if (part.emitter !== undefined) part.emitter += 16; });
  const scene = validateInstrumentScene(sceneOf(objects, profiles, { ...meterMaterials, ...premium }, lights(32), [620, 400]));
  assert.equal(scene.objects.length, 4);
  assert.equal(Object.keys(scene.materials).length, 5, "matte, meterGlass and the three the dials use");
  assert.ok(Object.keys(profiles).length <= 64);
});
