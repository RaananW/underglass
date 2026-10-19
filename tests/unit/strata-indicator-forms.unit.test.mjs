/**
 * The indicator forms of the Rating, Badge, ProgressBar and Spinner (anatomy pages `rating.md`, `badge.md`, `progress-bar.md`, `spinner.md`,
 * *Indicator form*): their names and markup (`packages/ui/src/shared/indicator-forms.ts`), the boxes and the chase (never over three flashes a
 * second), the plain-DOM behaviour (`dom/progress.ts`), the tokens and the stylesheet (every rule of the form names a class or a `data-strata-form` that
 * only the form has, so `flush` is untouched), and the lens as the Lamp's LED object placed off the middle of its box, checked with core's own validator
 * and containment check (`packages/core/src/instrument.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import {
  INDICATOR_FLUSH, INDICATOR_ROOM, MIN_CHASE_MS, badgeForm, badgeLensMarkup, chaseDefaults, chaseFlashesPerSecond, chaseLit, chaseStops, lensStyle, progressDefaults, progressForm, progressFraction,
  progressSegmentCount, progressSegments, progressStyle, ratingBox, ratingForm, ratingLampMarkup, ratingLens, ratingOwner, spinnerBox, spinnerForm, spinnerLens, spinnerLenses, spinnerLensIndices, spinnerRing, steadyLit,
} from "../../packages/ui/src/shared/indicator-forms.ts";
import { lampBox, lensColours, lensEmitter, statusLightLens } from "../../packages/ui/src/shared/lamp.ts";
import { lampObject, lampMaterialsOf } from "../../packages/ui/src/gpu/instrument-lamp.ts";
import { lampFormEntries } from "../../packages/ui/src/gpu/lamp-forms.ts";
import { DISABLED_LIGHT, INDICATOR_LENS, indicatorOf, roomAround } from "../../packages/ui/src/gpu/indicator-forms.ts";
import { syncStrataProgress } from "../../packages/ui/src/dom/progress.ts";
import { strataTokens, tokensToCss, validateTokens } from "../../packages/ui/src/tokens/index.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const round = value => Math.round(value * 1000) / 1000;

test("the form names: only the form's own name is a form, flush and any other string are not, and only a Rating can leave a native form owner", () => {
  assert.equal(INDICATOR_FLUSH, "flush");
  assert.deepEqual([ratingForm("lamps"), ratingForm("flush"), ratingForm(undefined), ratingForm("owner")], ["lamps", undefined, undefined, undefined]);
  assert.deepEqual([badgeForm("led"), badgeForm("flush"), badgeForm("lamps")], ["led", undefined, undefined]);
  assert.deepEqual([progressForm("meter"), progressForm("flush"), progressForm("bar")], ["meter", undefined, undefined]);
  assert.deepEqual([spinnerForm("ring"), spinnerForm("flush"), spinnerForm("arc")], ["ring", undefined, undefined]);
  assert.deepEqual([ratingOwner("owner-form"), ratingOwner("lamps"), ratingOwner("flush"), ratingOwner(undefined), ratingOwner(3)], ["owner-form", undefined, undefined, undefined, undefined]);
});

test("the markup: a lens per place, the sizes from the token scale, and every box at least the target", () => {
  assert.deepEqual(ratingLampMarkup, [{ className: "ug-rating__lens", face: "knob" }]);
  assert.deepEqual(badgeLensMarkup, { className: "ug-badge__lens", face: "knob" });
  assert.deepEqual(ratingLens, { small: 12, medium: 16, large: 20 });
  assert.deepEqual(spinnerRing, { small: 24, medium: 36, large: 52 });
  assert.equal(INDICATOR_ROOM, 16);
  assert.deepEqual(Object.values(ratingLens).map(lens => ratingBox(lens)), [28, 32, 36]);
  assert.deepEqual(Object.values(ratingLens).map(lens => ratingBox(lens, 44)), [44, 44, 44], "a coarse target is held");
  assert.deepEqual(Object.values(spinnerRing).map(spinnerBox), [40, 52, 68]);
  assert.deepEqual(Object.values(spinnerRing).map(spinnerLens).map(round), [5, 7.2, 10.4]);
  for (const box of [...Object.values(ratingLens).map(lens => ratingBox(lens)), ...Object.values(spinnerRing).map(spinnerBox)]) assert.ok(box >= 24);
  // The sizes are the scale's tokens, as the stylesheet reads them.
  const flat = Object.fromEntries(Object.entries({ rating: ratingLens, spinner: spinnerRing }).flatMap(([part, sizes]) => Object.entries(sizes).map(([size, value]) => [`size.${part}.${size}`, `${value}px`])));
  const tokens = Object.fromEntries(Object.entries(strataTokens.size.rating).filter(([key]) => !key.startsWith("$")).map(([size, token]) => [`size.rating.${size}`, token.$value]));
  Object.assign(tokens, Object.fromEntries(Object.entries(strataTokens.size.spinner).filter(([key]) => !key.startsWith("$")).map(([size, token]) => [`size.spinner.${size}`, token.$value])));
  assert.deepEqual(tokens, flat);
  const stylesheet = tokensToCss(strataTokens);
  for (const size of ["small", "medium", "large"]) assert.match(stylesheet, new RegExp(`--strata-size-spinner-${size}: ${spinnerRing[size]}px;`));
  assert.match(stylesheet, /\[data-strata-size="large"\] \{[^}]*--strata-rating-size: var\(--strata-size-rating-large\);/);
  assert.match(stylesheet, /--strata-chase-spinner: 900ms;/);
  assert.match(stylesheet, /--strata-chase-bar: 1600ms;/);
  for (const className of [...ratingLampMarkup.map(part => part.className), badgeLensMarkup.className, "ug-spinner__ring", "ug-spinner__lens", "ug-progress-bar", "ug-progress__object", "ug-progress__window", "ug-progress__segments", "ug-progress__segment"]) assert.ok(css.includes(`.${className}`), `${className} is styled`);
  assert.deepEqual(validateTokens(strataTokens).filter(problem => /rating|spinner|chase/.test(String(problem.path ?? problem))), []);
});

test("a bar's segments: the count is held to 4 to 32, the fraction is the value over max, and an indeterminate bar draws no value", () => {
  assert.deepEqual(progressDefaults, { segments: 20, minSegments: 4, maxSegments: 32 });
  assert.deepEqual([undefined, NaN, 3, 4, 12, 12.4, 33, 1000].map(progressSegmentCount), [20, 20, 4, 4, 12, 12, 32, 32]);
  assert.deepEqual([[40, 100], [0, 100], [100, 100], [150, 100], [-5, 100], [5, 10], [3, undefined], [0.4, 1], [10, 0]].map(([value, max]) => progressFraction(value, max)), [0.4, 0, 1, 1, 0, 0.5, 1, 0.4, 1]);
  assert.equal(progressFraction(undefined), undefined);
  assert.equal(progressFraction(NaN), undefined);
  assert.equal(progressFraction(1 / 3, 1), 0.3333, "four places");
  assert.equal(progressStyle(0.4, 12), "--strata-progress-count: 12; --strata-progress-value: 0.4;");
  assert.equal(progressStyle(undefined, 20), "--strata-progress-count: 20;");
  assert.equal(lensStyle(3), "--_i: 3;");
  assert.deepEqual(progressSegments(4), [0, 1, 2, 3]);
  assert.deepEqual(spinnerLensIndices, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(spinnerLenses, 8);
});

test("the chase: a lens lights once a lap at index / count of it, the head goes round clockwise with a trail, and no lens flashes more than three times a second", () => {
  assert.deepEqual(chaseDefaults, { spinner: 900, bar: 1600 });
  assert.equal(MIN_CHASE_MS, 334);
  for (const [name, token] of [["spinner", strataTokens.chase.spinner], ["bar", strataTokens.chase.bar]]) {
    assert.equal(token.$value, `${chaseDefaults[name]}ms`);
    assert.ok(token.$extensions["dev.underglass.strata"].min >= MIN_CHASE_MS, `${name}: the floor`);
    assert.ok(chaseFlashesPerSecond(chaseDefaults[name]) <= 3, `${name}: ${chaseFlashesPerSecond(chaseDefaults[name])} flashes a second`);
  }
  assert.ok(chaseFlashesPerSecond(MIN_CHASE_MS) <= 3 && chaseFlashesPerSecond(MIN_CHASE_MS - 10) > 3, "334 ms is the shortest lap that keeps to three");
  // The head: lens i is lit 1 at i / 8 of the lap, the trail behind it (the lenses before it) fades, the ones ahead are dark.
  const lap = 900;
  for (const index of [0, 3, 7]) assert.equal(chaseLit(index, 8, (index / 8) * lap, lap), 1);
  assert.deepEqual([0, 0.06, 0.12, 0.2, 0.3, 0.55, 0.9].map(share => chaseLit(0, 8, share * lap, lap)), [1, 0.775, 0.55, 0.3944, 0.2, 0, 0]);
  const heads = Array.from({ length: 16 }, (_, step) => { const lit = Array.from({ length: 8 }, (_, index) => chaseLit(index, 8, (step / 16) * lap, lap)); return lit.indexOf(Math.max(...lit)); });
  assert.deepEqual(heads, [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7], "the head moves on one lens every 112 ms, clockwise");
  // Once a lap: each lens rises to its head exactly once.
  for (const [kind, count, period] of [["spinner", 8, 900], ["bar", 12, 1600]]) {
    for (let index = 0; index < count; index++) {
      let rises = 0, dark = true;
      for (let time = 0; time < period * 3; time += 4) { const lit = chaseLit(index, count, time, period, kind); if (lit <= 0.1) dark = true; else if (lit >= 0.95 && dark) { rises++; dark = false; } }
      assert.ok(rises >= 3 && rises <= 3, `${kind} lens ${index}: ${rises} flashes in three laps`);
    }
  }
  // The stops are the stylesheet's keyframes.
  const stepsOf = name => [...css.match(new RegExp(`@keyframes ${name} \\{([^\\n]*)\\}`))[1].matchAll(/([\d%, ]+)\{ --strata-lit: ([\d.]+); \}/g)].flatMap(([, at, lit]) => at.split(",").map(share => [Number.parseFloat(share) / 100, Number(lit)]));
  for (const [kind, name] of [["spinner", "ug-chase"], ["bar", "ug-chase-bar"]]) assert.deepEqual(stepsOf(name), chaseStops[kind].map(stop => [...stop]), `${name}: the model's stops`);
  // The steady pattern under reduced motion: a comet, and every other segment.
  assert.deepEqual(Array.from({ length: 8 }, (_, index) => steadyLit("spinner", index, 8)), [1, 0, 0, 0, 0, 0.25, 0.5, 0.75]);
  assert.deepEqual(Array.from({ length: 6 }, (_, index) => steadyLit("bar", index, 6)), [1, 0, 1, 0, 1, 0]);
});

test("the stylesheet: every rule of the indicator forms names a class or a form only the forms have, so flush markup matches none of them", () => {
  const start = css.indexOf("/* ---- Indicator forms:"), end = css.indexOf("/* ---- Overrides by attribute");
  assert.ok(start > 0 && end > start);
  const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  // The selector list of every rule (nested in @media too), not the at-rules' own preludes nor the steps of a @keyframes.
  const selectors = [], stack = [], keyframes = new Set();
  let prelude = "";
  for (const character of block) {
    if (character === "{") {
      const text = prelude.trim(), inside = keyframes.size > 0;
      stack.push(text);
      if (/^@keyframes/.test(text)) keyframes.add(stack.length); else if (!text.startsWith("@") && !inside) selectors.push(text);
      prelude = "";
    } else if (character === "}") { keyframes.delete(stack.length); stack.pop(); prelude = ""; }
    else if (character === ";") prelude = "";
    else prelude += character;
  }
  assert.ok(selectors.length > 40, `${selectors.length} rules`);
  const own = /[data-strata-form="(lamps|led|meter|ring)"]|.ug-(rating__lens|badge__lens|spinner__lens|spinner__ring|progress__segment|progress__segments|progress__object|progress__window|progress-bar)/;
  // Each comma part of a selector list (the members of a leading :where() or :is() included) hangs off one of them.
  const parts = selector => { const out = []; let depth = 0, current = ""; for (const character of selector) { if (character === "(") depth++; if (character === ")") depth--; if (character === "," && (depth === 0 || (depth === 1 && selector.startsWith(":where(")))) { out.push(current); current = ""; } else current += character; } out.push(current); return out; };
  const outside = selectors.flatMap(parts).filter(part => !own.test(part)).map(part => part.trim());
  assert.deepEqual([...new Set(outside)], [], "a rule that could match a flush element");
});

test("syncStrataProgress keeps the drawn value: the fraction on the wrapper, removed while indeterminate, and nothing for a bare progress", () => {
  const style = new Map();
  const wrapper = { style: { getPropertyValue: name => style.get(name) ?? "", setProperty: (name, value) => style.set(name, value), removeProperty: name => style.delete(name) } };
  const attributes = new Map();
  const native = { closest: selector => (selector === ".ug-progress-bar" ? wrapper : null), hasAttribute: name => attributes.has(name), getAttribute: name => attributes.get(name) ?? null };
  attributes.set("value", "40"); attributes.set("max", "100");
  syncStrataProgress(native);
  assert.equal(style.get("--strata-progress-value"), "0.4");
  attributes.set("value", "80");
  syncStrataProgress(native);
  assert.equal(style.get("--strata-progress-value"), "0.8");
  attributes.set("max", "10");
  syncStrataProgress(native);
  assert.equal(style.get("--strata-progress-value"), "1");
  attributes.delete("value");
  syncStrataProgress(native);
  assert.deepEqual([...style], [], "indeterminate: no value drawn");
  attributes.set("value", "5"); attributes.delete("max");
  syncStrataProgress(native);
  assert.equal(style.get("--strata-progress-value"), "1", "max defaults to 1");
  // A bare progress (flush, no segment meter round it) is left alone.
  assert.doesNotThrow(() => syncStrataProgress({ closest: () => null }));
});

test("which element is a lens, and where its light and its box come from", () => {
  assert.equal(INDICATOR_LENS, ".ug-rating__lens, .ug-badge__lens, .ug-spinner__lens, .ug-progress__segment");
  const make = (classes, parents = {}) => ({ matches: selector => selector.split(",").some(part => classes.includes(part.trim().slice(1))), closest: selector => parents[selector] ?? null, querySelector: selector => parents[`>${selector}`] ?? null });
  const input = { name: "input" }, item = make(["ug-rating__item"], { ">.ug-rating__input": input }), rating = make(["ug-rating"]);
  assert.deepEqual(indicatorOf(make(["ug-rating__lens"], { ".ug-rating": rating, ".ug-rating__item": item })), { kind: "rating", root: rating, control: input, box: input, emitter: "lamp" });
  const badge = make(["ug-badge"]);
  assert.deepEqual(indicatorOf(make(["ug-badge__lens"], { ".ug-badge": badge })), { kind: "badge", root: badge, control: badge, box: badge, tight: true, emitter: "led" });
  const spinner = make(["ug-spinner"]), ring = make(["ug-spinner__ring"]);
  assert.deepEqual(indicatorOf(make(["ug-spinner__lens"], { ".ug-spinner": spinner, ".ug-spinner__ring": ring })), { kind: "spinner", root: spinner, control: spinner, box: ring, emitter: "led" });
  const progress = { name: "progress" }, bar = make(["ug-progress-bar"], { ">:scope > .ug-progress": progress });
  assert.deepEqual(indicatorOf(make(["ug-progress__segment"], { ".ug-progress-bar": bar })), { kind: "progress", root: bar, control: progress, box: progress, emitter: "segment" });
  assert.equal(indicatorOf(make(["ug-rating__lens"])), undefined, "a lens outside its component is nothing");
  assert.equal(indicatorOf(make(["ug-lamp__lens"])), undefined);
  assert.equal(DISABLED_LIGHT, 0.3);
  // A badge's lens room: the lens plus 8 px each side, held inside the pill.
  assert.deepEqual(roomAround([46, 179.2, 10, 10], [38, 171.2, 37.7, 26]), [38, 171.2, 26, 26]);
  assert.deepEqual(roomAround([40, 100, 10, 10], [38, 98, 100, 14]), [38, 98, 20, 14], "held inside the pill");
});

test("the lens at Relief and Objects, and in a box it does not centre: the same parts as the Lamp's LED, in the right place, inside the box", () => {
  const rect = [100, 20, 10, 10], box = [0, 0, 300, 26];
  const entries = lampFormEntries({ matches: selector => selector.includes(".ug-progress__segment") }, { rect, state: {}, objects: false, base: 0, box, role: "#2563eb", lit: 1, light: { azimuth: 323, elevation: 41 }, hoverHeight: 1.6, material: (_, role) => role });
  assert.equal(entries.length, 1);
  assert.deepEqual([entries[0].face, entries[0].rect, entries[0].ring.colour], ["ring", rect, lensColours("#2563eb").on], "a progress segment and the other indicator lenses are lenses");
  // Every vertex of a lens off the middle of its box stays 0.5 px inside it, at every depth, for every indicator lens.
  const placements = [{ lens: 10, box: [0, 0, 560, 26], centre: [28, 13] }, { lens: 10, box: [200, 0, 560, 26], centre: [240, 13] }, { lens: 16, box: [0, 0, 32, 32], centre: [16, 16] },
    { lens: 7.2, box: [0, 0, 52, 52], centre: [26, 7.4] }, { lens: 5, box: [0, 0, 40, 40], centre: [34, 20] }, { lens: 10, box: roomAround([46, 8, 10, 10], [38, 0, 80, 26]), centre: [51, 13] }];
  const worst = {};
  for (const [at, { lens, box: area, centre }] of placements.entries()) for (const scale of [0.6, 1, 1.6]) {
    const profiles = {}, profile = (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
    const object = lampObject({ id: `lens-${at}`, kind: "led", box: area, centre, lens, scale, role: "#2563eb", emitter: 0, state: { hover: false, disabled: false }, relief: { rect: [centre[0] - lens / 2, centre[1] - lens / 2, lens, lens], height: 3 } }, profile);
    assert.deepEqual(object.parts.map(part => part.kind), ["lens"], "one glass lens, no bezel");
    assert.deepEqual(object.parts[0].at.slice(0, 2), centre, "the lens stands where it is, not in the middle of the box");
    const frontier = containmentFrontier(object, profiles);
    for (const [e, f] of [[0, 0], [1920 - area[2] - area[0], 1080 - area[3] - area[1]]]) {
      const result = checkContainment(object, profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 });
      assert.ok(result.contained, `lens ${at}, scale ${scale} at ${e},${f}: inset ${result.inset}`);
      worst[at] = Math.min(worst[at] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest vertex of an indicator lens to its box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // Core accepts the scene: each lens its own emitter, the glass material of its role.
  const profiles = {}, profile = (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
  const objects = [0, 1].map(index => lampObject({ id: `lens-${index}`, kind: "led", box: [0, 0, 120, 26], centre: [20 + index * 30, 13], lens: 10, scale: 1, role: "#2563eb", emitter: index, state: { hover: false, disabled: false }, relief: { rect: [15 + index * 30, 8, 10, 10], height: 3 } }, profile));
  const emitters = [0, 1].map(index => lensEmitter("led", [20 + index * 30, 13], 10, index === 0 ? 1 : 0, "#2563eb", { radius: 3, height: 0.8, strength: 260 }));
  const scene = validateInstrumentScene({ format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 320 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 }, focus: { colour: "#2563eb", width: 3, offset: 0.5 },
    materials: { matte: { base: { roughness: 0.6 } }, ...lampMaterialsOf({ kind: "led", role: "#2563eb" }) }, primitives: [{ face: "raised", rect: [0, 0, 400, 320], radius: 12, height: 8, material: "matte" }], profiles, objects, emitters, protected: [[20, 20, 100, 20]], feather: 4 });
  assert.equal(scene.objects.length, 2);
  assert.deepEqual(scene.objects.map(object => object.parts[0].emitter), [0, 1]);
  assert.equal(emitters[1].strength, 0, "a dark lens keeps its place with no light");
  // The emitters of the lenses: the lamp's tokens for a rating's lamp (reach 6 lens diameters), the LED's for a badge or a ring, a segment's for a bar.
  assert.equal(lensEmitter("lamp", [16, 16], 16, 1, "#ff9228").strength, round(3200 * (16 / 28) ** 2));
  assert.equal(lensEmitter("lamp", [16, 16], 16, 1, "#ff9228").radius, 96);
  assert.equal(lensEmitter("led", [20, 13], 7.2, 1, "#2563eb").strength, round(520 * 0.72 ** 2));
  assert.equal(lampBox(16), 44);
  assert.deepEqual(Object.values(statusLightLens).map(lens => lens + INDICATOR_ROOM), [24, 26, 30], "a badge is the lens plus 16 px tall at the StatusLight's sizes");
});
