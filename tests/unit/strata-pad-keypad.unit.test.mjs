/**
 * The Pad and the Keypad (anatomy pages `pad.md`, `keypad.md`): the shared names, markup, boxes, travel, emitter, velocity rule and grid
 * keys (`shared/pad.ts`), the tokens and the CSS that takes them, the Relief and Objects entries (`gpu/pad-forms.ts`) and the Instrument
 * parts (`gpu/instrument-pad.ts`) checked with core's own validator and containment check (`packages/core/src/instrument.ts`), with the
 * lights validated by core's emitter format.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import {
  KEYPAD_GAP, KEYPAD_FIELD_PAD, KEYPAD_PLINTH_PAD, KEYPAD_ROOM, PAD_HALO, PAD_LATCHED, PAD_RADIUS, PAD_REFERENCE, PAD_RIM, PAD_ROOM, PAD_SOFTEST,
  gridStyle, gridTarget, keypadBox, keypadCap, keypadGeometry, keypadTravel, padBox, padCap, padEmitter, padEmitterDefaults, padGeometry, padMarkup, padPosition, padSpring, padTravel, padVelocity,
} from "../../packages/ui/src/shared/pad.ts";
import { pushSpring, fittedRoundHeight } from "../../packages/ui/src/shared/push-button.ts";
import { lensColours } from "../../packages/ui/src/shared/lamp.ts";
import { switchSpringCurve, shadowReach } from "../../packages/ui/src/shared/switch-forms.ts";
import { padFormEntries, padReliefHeights } from "../../packages/ui/src/gpu/pad-forms.ts";
import { PAD_RIM_HEIGHT, keyObject, keypadHeight, keypadPlinthHeight, keypadPlinthObject, padHeight, padMaterialsOf, padObject } from "../../packages/ui/src/gpu/instrument-pad.ts";
import { premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";
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
const premium = JSON.parse(readFileSync(new URL("../../packages/ui/src/tokens/characters/premium.json", import.meta.url), "utf8"));
const round = value => Math.round(value * 1000) / 1000;
const light = { azimuth: 323, elevation: 41 };

test("the sizes are tokens, the CSS takes them, and every part of both components is styled", () => {
  assert.deepEqual(Object.fromEntries(Object.keys(padCap).map(size => [size, strataTokens.size.pad[size].$value])), { small: "48px", medium: "64px", large: "80px" });
  assert.deepEqual(Object.fromEntries(Object.keys(keypadCap).map(size => [size, strataTokens.size.keypad[size].$value])), { small: "36px", medium: "44px", large: "52px" });
  const stylesheet = tokensToCss(strataTokens);
  assert.match(stylesheet, /--strata-pad-size: var\(--strata-size-pad-medium\);/);
  assert.match(stylesheet, /--strata-keypad-size: var\(--strata-size-keypad-medium\);/);
  assert.match(stylesheet, /\[data-strata-size="large"\] \{[^}]*--strata-pad-size: var\(--strata-size-pad-large\);/);
  assert.match(stylesheet, /\[data-strata-size="small"\] \{[^}]*--strata-keypad-size: var\(--strata-size-keypad-small\);/);
  for (const key of ["radius", "height", "strength"]) assert.equal(strataTokens.emitter.pad[key].$value, padEmitterDefaults[key], `emitter.pad.${key}`);
  for (const key of ["radius", "height", "strength"]) assert.equal(premium.emitter.pad[key].$value, padEmitterDefaults[key], `premium emitter.pad.${key}`);
  assert.deepEqual(validateTokens(strataTokens), []);
  for (const part of [...padMarkup.map(entry => entry.className), "ug-pad", "ug-pad-grid", "ug-pad__object", "ug-pad__cap", "ug-pad__icon", "ug-pad__label",
    "ug-keypad", "ug-keypad__legend", "ug-keypad__plinth", "ug-keypad__key", "ug-keypad__cap", "ug-keypad__print", "ug-keypad__shift"]) assert.ok(css.includes(`.${part}`), `${part} is styled`);
  assert.match(css, /@media \(forced-colors: active\) \{[^]*?\.ug-pad \.ug-pad__glow \{ border: 1px solid ButtonText; background: Canvas; box-shadow: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+:where\(\.ug-pad, \.ug-keypad__key\) \{ transition: none; \}/);
  // The cap's throw is `spring.button`, sampled by `switchSpringCurve`, as the recipe's transitions have it (the PushButton's, twice here).
  assert.deepEqual(padSpring, { stiffness: 1600, damping: 80 });
  assert.equal(padSpring, pushSpring);
  const curve = switchSpringCurve(padSpring), transition = `--strata-push-t ${curve.duration}ms ${curve.easing}`;
  assert.equal(css.split(transition).length - 1, 3, "the PushButton's, the Pad's and the Keypad's key carry the spring's duration and easing");
});

test("the geometry in the premium character is the shared numbers", () => {
  assert.equal(premium.pad.box.$value, `${padBox(padCap.medium)}px`);
  assert.equal(premium.pad.cap.side.$value, `${padCap.medium}px`);
  assert.equal(premium.pad.cap.height.$value, `${padGeometry.cap}px`);
  assert.equal(premium.pad.cap.radius.$value, PAD_RADIUS);
  assert.equal(premium.pad.travel.$value, `${padTravel.held}px`);
  assert.equal(premium.keypad.box.$value, `${keypadBox(keypadCap.medium)}px`);
  assert.equal(premium.keypad.cap.side.$value, `${keypadCap.medium}px`);
  assert.equal(premium.keypad.cap.height.$value, `${keypadGeometry.cap}px`);
  assert.equal(premium.keypad.plinth.height.$value, `${keypadGeometry.plinth}px`);
  assert.equal(premium.keypad.travel.$value, `${keypadTravel}px`);
  assert.ok(premium.$extensions["dev.underglass.strata"].character.provisional.includes("emitter.pad"));
});

test("the pad: markup, box, travel and the cap's place", () => {
  assert.deepEqual(padMarkup, [{ className: "ug-pad__socket" }, { className: "ug-pad__glow" }]);
  // The box is the cap plus 9 px a side (3 rim, 6 halo): 82 at medium; the small grid of 4 fits 320 px.
  assert.equal(PAD_ROOM, 18);
  assert.equal(2 * (PAD_RIM + PAD_HALO), 18);
  assert.deepEqual(Object.values(padCap).map(padBox), [66, 82, 98]);
  assert.ok(4 * padBox(padCap.small) <= 320 - 2 * 16, "a 4 × 4 grid of small pads fits 320 px with a 16 px gutter");
  assert.ok(Math.min(...Object.values(padCap).map(padBox)) >= 24);
  assert.equal(PAD_RADIUS, 0.22);
  // Travel: 3 held, 1.35 latched, so 0.45 of the way, as the PushButton's; a disabled pad never moves.
  assert.deepEqual(padTravel, { held: 3, latched: 1.35 });
  assert.equal(PAD_LATCHED, 0.45);
  assert.equal(padPosition({ held: false, latched: false, disabled: false }), 0);
  assert.equal(padPosition({ held: true, latched: false, disabled: false }), 1);
  assert.equal(padPosition({ held: false, latched: true, disabled: false }), 0.45);
  assert.equal(padPosition({ held: true, latched: true, disabled: false }), 1);
  assert.equal(padPosition({ held: true, latched: true, disabled: true }), 0);
  assert.equal(padHeight(1), round(PAD_RIM_HEIGHT + padGeometry.cap + 0.1));
  assert.equal(padHeight(1.6), round((PAD_RIM_HEIGHT + padGeometry.cap) * 1.6 + 0.1));
});

test("the keypad: boxes, plinth room and heights", () => {
  assert.equal(KEYPAD_ROOM, 6);
  assert.deepEqual(Object.values(keypadCap).map(keypadBox), [48, 56, 64]);
  assert.ok(keypadBox(keypadCap.medium) >= 44 && keypadBox(keypadCap.small) >= 24, "touch targets: 44 recommended at medium, 24 at least");
  assert.equal(KEYPAD_GAP, 0);
  // Four columns of medium keys, with the plinth's padding and the fieldset's room, fit a 320 px viewport with its 16 px gutter.
  const wide = 4 * keypadBox(keypadCap.medium) + 2 * (KEYPAD_PLINTH_PAD + KEYPAD_FIELD_PAD);
  assert.equal(wide, 4 * 56 + 28);
  assert.ok(wide <= 320 - 2 * 16);
  assert.equal(keypadTravel, 2.5);
  assert.equal(keypadPlinthHeight(1), 2.4);
  assert.equal(keypadPlinthHeight(0.6), 1.44);
  assert.equal(keypadHeight(1), round(keypadGeometry.plinth + keypadGeometry.cap + 0.1));
});

test("a lit pad's emitter: a point over the cap, scaled by the cap's square, unlit it keeps its place, and it is valid to core", () => {
  const lit = padEmitter([100, 50], 64, 1, "#c42b2b");
  assert.deepEqual(lit.position, [100, 50, 16]);
  assert.equal(lit.strength, 3600);
  assert.equal(lit.radius, 192);
  assert.deepEqual(lit.colour, lensColours("#c42b2b").light);
  assert.equal(Math.max(...lit.colour), 1);
  assert.deepEqual([lit.reach, lit.face], ["outset", 1]);
  assert.equal(padEmitter([0, 0], 64, 0, "#c42b2b").strength, 0);
  assert.equal(padEmitter([0, 0], 64, 7, "#c42b2b").strength, 3600, "clamped");
  assert.equal(padEmitter([0, 0], 48, 1, "#c42b2b").strength, round(3600 * (48 / PAD_REFERENCE) ** 2));
  assert.equal(padEmitter([0, 0], 48, 1, "#c42b2b", { radius: 2, height: 0.5, strength: 1000 }).radius, 96);
  assert.equal(validateEmitters([lit, padEmitter([300, 50], 48, 0, "#2563eb")], "emitters").length, 2);
});

test("the velocity of a press: pressure where it is reported, else the place on the cap, the keys 1", () => {
  const box = { left: 100, top: 100, width: 64, height: 64 };
  // Position: the middle is 1, the edge 0.25, a corner as soft as an edge.
  assert.deepEqual(padVelocity({ pointerType: "mouse", pressure: 0.5, x: 132, y: 132, box }), { velocity: 1, source: "position" });
  assert.deepEqual(padVelocity({ pointerType: "mouse", pressure: 0.5, x: 164, y: 132, box }), { velocity: PAD_SOFTEST, source: "position" });
  assert.deepEqual(padVelocity({ pointerType: "mouse", x: 100, y: 100, box }), { velocity: PAD_SOFTEST, source: "position" });
  assert.deepEqual(padVelocity({ pointerType: "mouse", x: 148, y: 132, box }), { velocity: 0.63, source: "position" });
  assert.equal(padVelocity({ x: 1000, y: 1000, box }).velocity, PAD_SOFTEST, "outside the cap counts as the edge");
  // Pressure: a pen or a finger on hardware that senses force; 0.5 is what a pointer without it reports, so it is not taken.
  assert.deepEqual(padVelocity({ pointerType: "pen", pressure: 0.83, x: 132, y: 132, box }), { velocity: 0.83, source: "pressure" });
  assert.deepEqual(padVelocity({ pointerType: "touch", pressure: 0.2, x: 132, y: 132, box }), { velocity: 0.2, source: "pressure" });
  assert.equal(padVelocity({ pointerType: "touch", pressure: 0.5, x: 132, y: 132, box }).source, "position");
  assert.equal(padVelocity({ pointerType: "mouse", pressure: 0.9, x: 132, y: 132, box }).source, "position", "a mouse has no pressure");
  assert.equal(padVelocity({ pointerType: "pen", pressure: 0, x: 132, y: 132, box }).source, "position");
  assert.equal(padVelocity({ pointerType: "pen", pressure: 3, box }).velocity, 1, "clamped");
  assert.deepEqual(padVelocity({}), { velocity: 1, source: "keyboard" });
});

test("the grid style writes the columns, and nothing for a bad count", () => {
  assert.equal(gridStyle("pad", 4), "--strata-pad-columns: 4;");
  assert.equal(gridStyle("keypad", 3.9), "--strata-keypad-columns: 3;");
  assert.equal(gridStyle("pad", undefined), undefined);
  assert.equal(gridStyle("pad", 0), undefined);
  assert.equal(gridStyle("pad", Number.NaN), undefined);
});

test("the grid pattern's keys: arrows along rows and columns, Home and End, no wrap, disabled skipped, a short last row", () => {
  // A 4-column grid of 10 controls (0–9): the last row has two (8, 9).
  const shape = { columns: 4, count: 10 };
  const go = (from, key, over = {}, ctrl = false) => gridTarget(from, key, { ...shape, ...over }, ctrl);
  assert.equal(go(5, "ArrowRight"), 6);
  assert.equal(go(5, "ArrowLeft"), 4);
  assert.equal(go(5, "ArrowDown"), 9);
  assert.equal(go(5, "ArrowUp"), 1);
  assert.equal(go(3, "ArrowRight"), undefined, "no wrap at the row's end");
  assert.equal(go(4, "ArrowLeft"), undefined, "no wrap at the row's start");
  assert.equal(go(1, "ArrowUp"), undefined);
  assert.equal(go(6, "ArrowDown"), undefined, "the short last row has no column 2");
  assert.equal(go(9, "ArrowRight"), undefined, "the last control");
  assert.equal(go(8, "ArrowRight"), 9);
  assert.equal(go(6, "Home"), 4);
  assert.equal(go(6, "End"), 7);
  assert.equal(go(9, "Home"), 8);
  assert.equal(go(9, "End"), 9, "the short row ends at the last control");
  assert.equal(go(6, "Home", {}, true), 0);
  assert.equal(go(6, "End", {}, true), 9);
  assert.equal(go(6, "PageDown"), undefined);
  assert.equal(go(6, "a"), undefined);
  // Right-to-left swaps left and right.
  assert.equal(go(5, "ArrowRight", { rtl: true }), 4);
  assert.equal(go(5, "ArrowLeft", { rtl: true }), 6);
  // Disabled controls are skipped in the direction of travel; the whole line disabled stays put.
  assert.equal(go(4, "ArrowRight", { enabled: index => index !== 5 }), 6);
  assert.equal(go(4, "ArrowRight", { enabled: index => index < 5 }), undefined);
  assert.equal(go(1, "ArrowDown", { enabled: index => index !== 5 }), 9, "skips the disabled one below, to the next in the column");
  assert.equal(go(1, "ArrowDown", { enabled: index => index !== 5 && index !== 9 }), undefined);
  assert.equal(go(4, "Home", { enabled: index => index !== 4 }), 5);
  assert.equal(go(7, "End", { enabled: index => index !== 7 }), 6);
  assert.equal(go(5, "Home", { enabled: index => index > 0 }, true), 1);
  // One column, one row, and nonsense.
  assert.equal(gridTarget(1, "ArrowDown", { columns: 1, count: 3 }), 2);
  assert.equal(gridTarget(1, "ArrowRight", { columns: 1, count: 3 }), undefined);
  assert.equal(gridTarget(0, "ArrowRight", { columns: 5, count: 3 }), 1);
  assert.equal(gridTarget(10, "ArrowRight", shape), undefined, "from an index in range");
  assert.equal(gridTarget(-1, "ArrowRight", shape), undefined);
  assert.equal(gridTarget(0, "ArrowRight", { columns: 0, count: 3 }), undefined);
});

/** A version 4 scene around `objects`, with their lights, as the GPU helper writes it. */
function sceneOf(objects, profiles, materials, emitters) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 520, height: 420 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, keyCap: premiumMaterials.keyCap, "key #eceef2": { base: { colour: "#eceef2", roughness: 0.45 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, 520, 420], radius: 12, height: 8, material: "matte" }], profiles, objects, ...(emitters ? { emitters, protected: [[20, 20, 100, 20]], feather: 4 } : {}) };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };

/** A pad of cap `cap` at `at`, its box `width` wide and `extra` taller (a wrapped label), the boxes as the CSS lays them out. */
function padAt(profile, { id = "pad", at = [10, 10], cap = 64, width = padBox(cap), extra = 0, scale = 1, t = 0, emitter = 0, role = "#c42b2b", opaque = false } = {}) {
  const [x, y] = at, box = [x, y, width, padBox(cap) + extra], inner = (rect, by) => [rect[0] + by, rect[1] + by, rect[2] - 2 * by, rect[3] - 2 * by];
  const glow = inner(box, PAD_HALO), capBox = inner(box, PAD_HALO + PAD_RIM), radius = PAD_RADIUS * cap;
  return padObject({ id, box, glow, cap: capBox, radii: { box: radius + 9, glow: radius + 3, cap: radius }, scale, role, emitter, t, material: "key #eceef2", opaque,
    state: { hover: false, pressed: false, disabled: false }, light, relief: { height: 3, material: "keyCap" } }, profile);
}

test("a pad is a glass rim with its emitter, and a body with a captured cap that travel together", () => {
  const { profiles, profile } = registry();
  const pad = padAt(profile, { emitter: 1, t: 0.45 });
  assert.deepEqual(pad.parts.map(part => `${part.kind}:${part.material}`), ["lens:lens #c42b2b", "plinth:key #eceef2", "cap:keyCap"]);
  assert.deepEqual(pad.parts.map(part => part.emitter), [1, undefined, undefined]);
  assert.deepEqual(pad.parts.map(part => part.glass), ["lens", undefined, undefined]);
  // The body and the captured cap go down 3 px (× depth) together; the cap is captured and casts nothing; the rim does not move.
  assert.deepEqual(pad.parts[1].pose, { from: { travel: 0 }, to: { travel: -3 } });
  assert.deepEqual(pad.parts[2].pose, pad.parts[1].pose);
  assert.equal(pad.parts[2].captured, true);
  assert.equal(pad.parts[2].caster, null);
  assert.equal(pad.parts[0].caster, null);
  assert.equal(pad.parts[0].pose, undefined);
  assert.equal(pad.t, 0.45, "latched: 0.45 of the travel");
  assert.equal(padAt(registry().profile, { scale: 1.6 }).parts[1].pose.to.travel, -4.8, "the travel scales with depth");
  // The stack: the rim 0.5 on the face, the body on it, the captured cap on the body.
  assert.deepEqual(pad.parts.map(part => part.at[2]), [0, 0.5, 4.5]);
  assert.deepEqual(pad.bounds, { rect: pad.rect, radius: round(PAD_RADIUS * 64 + 9) });
  assert.equal(round(PAD_RADIUS * 64 + 9), 23.08);
  const materials = padMaterialsOf({ role: "#c42b2b" });
  assert.deepEqual(Object.keys(materials), ["lens #c42b2b"]);
  assert.equal(materials["lens #c42b2b"].glass.reflection, 1.5);
  assert.equal(padMaterialsOf({ role: "#c42b2b", opaque: true })["lensOpaque #c42b2b"].glass, undefined);
  // Under reduced transparency the rim is opaque lacquer.
  const opaque = padAt(registry().profile, { opaque: true });
  assert.deepEqual(opaque.parts.filter(part => part.kind === "lens").map(part => `${part.material}:${part.glass}`), ["lensOpaque #c42b2b:undefined"]);
  // Core's validator takes the scene: the parts, the emitters and the glass.
  const other = padAt(profile, { id: "other", at: [150, 10], emitter: 0, role: "#2563eb" });
  const emitters = [padEmitter([182, 42], 64, 1, "#2563eb"), padEmitter([42, 42], 64, 0, "#c42b2b")];
  const scene = validateInstrumentScene(sceneOf([pad, other], profiles, { ...materials, ...padMaterialsOf({ role: "#2563eb" }) }, emitters));
  assert.equal(scene.objects.length, 2);
  assert.equal(scene.emitters.length, 2);
  assert.equal(scene.objects[0].parts[0].emitter, 1);
});

/** A keypad of `columns` × `rows` keys of cap `cap`: the plinth object, then a key object each, as the CSS lays them out. */
function keypadAt(profile, { at = [10, 10], columns = 3, rows = 4, cap = 44, scale = 1, light: key = light } = {}) {
  const [x, y] = at, keyBox = keypadBox(cap), padding = KEYPAD_PLINTH_PAD, room = KEYPAD_FIELD_PAD;
  const plinth = [x + room, y + room, columns * keyBox + 2 * padding, rows * keyBox + 2 * padding], box = [x, y, plinth[2] + 2 * room, plinth[3] + 2 * room];
  const radius = PAD_RADIUS * cap + 8, objects = [keypadPlinthObject({ id: "keypad", box, plinth, radius, scale, state: { hover: false, pressed: false, disabled: false }, light: key, relief: { height: 3, material: "keyCap" } }, profile)];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const keyRect = [plinth[0] + padding + column * keyBox, plinth[1] + padding + row * keyBox, keyBox, keyBox], capRect = [keyRect[0] + KEYPAD_ROOM, keyRect[1] + KEYPAD_ROOM, cap, cap];
    objects.push(keyObject({ id: `key-${row}-${column}`, box: keyRect, cap: capRect, radii: { box: PAD_RADIUS * cap + 6, cap: PAD_RADIUS * cap }, base: keypadPlinthHeight(scale), scale, t: 0, material: "key #eceef2",
      state: { hover: false, pressed: false, disabled: false }, light: key, relief: { height: 3, material: "keyCap" } }, profile));
  }
  return { objects, box, plinth };
}

test("a keypad is a polished plinth object and, per key, a body with a captured cap that travel together, standing on the plinth", () => {
  const { profiles, profile } = registry();
  const { objects } = keypadAt(profile);
  assert.equal(objects.length, 13, "a plinth and twelve keys");
  assert.deepEqual(objects[0].parts.map(part => `${part.kind}:${part.material}`), ["bezel:pushBezel"]);
  assert.equal(objects[0].parts[0].pose, undefined);
  assert.equal(objects[0].t, 0);
  assert.deepEqual(objects[1].parts.map(part => `${part.kind}:${part.material}`), ["plinth:key #eceef2", "cap:keyCap"]);
  assert.deepEqual(objects[1].parts[0].pose, { from: { travel: 0 }, to: { travel: -2.5 } });
  assert.deepEqual(objects[1].parts[1].pose, objects[1].parts[0].pose);
  assert.equal(objects[1].parts[1].captured, true);
  assert.equal(objects[1].parts[1].caster, null);
  assert.deepEqual(objects[1].parts.map(part => part.at[2]), [2.4, 7.4], "the body stands on the plinth's top, the captured cap on the body");
  assert.equal(objects[1].parts[0].profile.includes('"height":5'), true, "the body is the cap's 6 less the label's 1");
  const parts = objects.reduce((sum, object) => sum + object.parts.length, 0);
  assert.equal(parts, 25);
  const scene = validateInstrumentScene(sceneOf(objects, profiles, { pushBezel: { base: { colour: "#fafafb", metallic: 1, roughness: 0.04, direct: 1 } } }));
  assert.equal(scene.objects.length, 13);
  assert.equal(keypadAt(registry().profile, { scale: 1.6 }).objects[1].parts[0].pose.to.travel, -4, "the travel scales with depth");
});

test("every vertex of a pad stays inside its box over the whole stage, held and at rest, at every depth and size, with a wrapped label", () => {
  const worst = {};
  for (const [size, cap] of Object.entries(padCap)) for (const extra of [0, 24, 60]) for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = padAt(profile, { cap, extra, scale, t: 1 });
    const frontier = containmentFrontier(object, profiles);
    const [boxW, boxH] = [object.rect[2], object.rect[3]];
    for (const [e, f] of [[0, 0], [1920 - boxW, 0], [0, 1080 - boxH], [1920 - boxW, 1080 - boxH], [0, 540 - boxH / 2], [960 - boxW / 2, 0]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, profiles, frontier, placement);
      assert.ok(result.contained, `pad ${size} (${extra} taller), depth scale ${scale}, at ${e},${f}: inset ${result.inset} (part ${result.part})`);
      worst[`pad ${size}`] = Math.min(worst[`pad ${size}`] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest pad vertex to its box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A pad whose rim stood on the box's edge would not stay in: the 6 px of halo is what keeps the parts in.
  const { profiles, profile } = registry();
  const tight = padAt(profile, { scale: 1.6 });
  tight.bounds = { rect: [tight.rect[0] + 8, tight.rect[1] + 8, tight.rect[2] - 16, tight.rect[3] - 16], radius: 20 };
  const result = checkContainment(tight, profiles, containmentFrontier(tight, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("every vertex of a keypad's keys and plinth stays inside its box over the whole stage, at every depth and size and column count", () => {
  const worst = {};
  for (const [size, cap] of Object.entries(keypadCap)) for (const columns of [1, 3, 4]) for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const { objects } = keypadAt(profile, { cap, columns, rows: 2, scale });
    for (const object of objects) {
      const frontier = containmentFrontier(object, profiles), [boxW, boxH] = [object.rect[2], object.rect[3]];
      for (const [e, f] of [[0, 0], [1920 - boxW, 0], [0, 1080 - boxH], [1920 - boxW, 1080 - boxH]]) {
        // The object's rect is placed on the stage at (e, f): its own x, y are the layer's, so the matrix takes it from there.
        const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e: e - object.rect[0], f: f - object.rect[1], scale: 1 }, vanish: [960, 540], distance: 2400 };
        const result = checkContainment(object, profiles, frontier, placement);
        assert.ok(result.contained, `keypad ${size}, ${columns} columns, depth scale ${scale}, ${object.id}, at ${e},${f}: inset ${result.inset} (part ${result.part})`);
        const key = object.id === "keypad" ? "plinth" : `key ${size}`;
        worst[key] = Math.min(worst[key] ?? Infinity, round(result.inset));
      }
    }
  }
  console.log(`closest keypad vertex to its box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
});

test("the casters keep every cast shadow (2.8) inside the box, with the round corners counted", () => {
  for (const scale of [0.6, 1, 1.6]) for (const cap of Object.values(padCap)) {
    const { profile } = registry();
    const object = padAt(profile, { cap, scale });
    const [bx, by, bw, bh] = object.rect;
    for (const part of object.parts.filter(entry => entry.caster)) {
      const { rect, height } = part.caster, reach = shadowReach(height, light);
      assert.ok(rect[0] - reach.left >= bx - 1e-6 && rect[0] + rect[2] + reach.right <= bx + bw + 1e-6 && rect[1] - reach.top >= by - 1e-6 && rect[1] + rect[3] + reach.bottom <= by + bh + 1e-6,
        `${part.kind} at depth ${scale}, cap ${cap}: a shadow of height ${height} stays in the box`);
    }
  }
  for (const scale of [0.6, 1, 1.6]) {
    const { profile } = registry(), { objects, box } = keypadAt(profile, { scale });
    const plinth = objects[0].parts[0];
    if (plinth.caster) {
      const reach = shadowReach(plinth.caster.height, light), { rect } = plinth.caster;
      assert.ok(rect[0] - reach.left >= box[0] - 1e-6 && rect[0] + rect[2] + reach.right <= box[0] + box[2] + 1e-6 && rect[1] - reach.top >= box[1] - 1e-6 && rect[1] + rect[3] + reach.bottom <= box[1] + box[3] + 1e-6, `the plinth's shadow at depth ${scale}`);
    }
    for (const object of objects.slice(1)) for (const part of object.parts.filter(entry => entry.caster)) {
      const { rect, height } = part.caster, reach = shadowReach(height, light), [bx, by, bw, bh] = object.rect;
      assert.ok(rect[0] - reach.left >= bx - 1e-6 && rect[0] + rect[2] + reach.right <= bx + bw + 1e-6 && rect[1] - reach.top >= by - 1e-6 && rect[1] + rect[3] + reach.bottom <= by + bh + 1e-6, `a key's ${part.kind} at depth ${scale}`);
    }
  }
});

test("at Relief and Objects the caps are raised faces or keys, and a keypad's plinth a raised face or a slab, each as high as its shadow lets it stand in its box", () => {
  const element = (...names) => ({ matches: selector => selector.split(",").some(part => names.includes(part.trim().slice(1))), getAttribute: () => null });
  const padBoxRect = [10, 10, 82, 82], capRect = [19, 19, 64, 64], keyBoxRect = [10, 10, 56, 56], keyCapRect = [16, 16, 44, 44];
  const context = (rect, box, over = {}) => ({ rect, state: {}, objects: false, base: 0, box, radius: 14, material: (_, face) => face, knob: "satin", light, hoverHeight: 1.6, keyTravel: 6, ...over });
  assert.equal(padFormEntries({ matches: () => false }, context(capRect, padBoxRect)), undefined);
  const [cap] = padFormEntries(element("ug-pad__cap"), context(capRect, padBoxRect));
  assert.deepEqual([cap.face, cap.radius, cap.material, cap.finish], ["raised", 14, "raised", true]);
  assert.ok(cap.height > 1 && cap.height <= padReliefHeights.cap, `the pad's cap stands ${cap.height}, its shadow in a 9 px margin`);
  assert.ok(cap.height * (0.8 + 1.5) + 1 < 9 + 1e-9 || cap.height <= padReliefHeights.cap);
  const [key] = padFormEntries(element("ug-pad__cap"), context(capRect, padBoxRect, { objects: true, base: 1 }));
  assert.deepEqual([key.object, key.base, key.radius], ["key", 1, 14]);
  assert.ok(key.height >= 2 && key.height <= padReliefHeights.key, `the key stands ${key.height}`);
  assert.ok(key.travel > 0 && key.travel <= key.height * 0.75 + 0.005);
  // A pressed pad sinks; a disabled one is flat.
  assert.equal(padFormEntries(element("ug-pad__cap"), context(capRect, padBoxRect, { state: { pressed: true } }))[0].state.pressed, true);
  // Hover stands the shadow at the lifted height: lower parts, so it stays in.
  const [hovered] = padFormEntries(element("ug-pad__cap"), context(capRect, padBoxRect, { state: { hover: true } }));
  assert.ok(hovered.height * 1.6 <= padReliefHeights.cap * 1.6 + 1e-9);
  // A keypad's key has 6 px of room: a lower cap, still inside.
  const [keyCap] = padFormEntries(element("ug-keypad__cap"), context(keyCapRect, keyBoxRect, { radius: 10 }));
  assert.ok(keyCap.height > 0 && keyCap.height < cap.height, `the keypad's cap stands ${keyCap.height}, its shadow in a 6 px margin`);
  assert.ok(keyCap.height * (0.8 + 1.5) + 1 <= 6 + 1e-9 + 1);
  // The plinth: a raised face (Relief) or a slab (Objects) in the knob metal, fitted to the fieldset.
  const fieldset = [0, 0, 220, 300], plinthRect = [12, 12, 196, 276];
  const [face] = padFormEntries(element("ug-keypad__plinth"), context(plinthRect, fieldset, { radius: 18 }));
  assert.deepEqual([face.face, face.material, face.radius], ["raised", "satin", 18]);
  assert.ok(face.height > 0.5 && face.height <= padReliefHeights.plinth);
  const [slab] = padFormEntries(element("ug-keypad__plinth"), context(plinthRect, fieldset, { objects: true, base: 0, radius: 18 }));
  assert.deepEqual([slab.object, slab.material], ["slab", "satin"]);
  assert.ok(slab.taper <= slab.height);
  const [crowded] = padFormEntries(element("ug-keypad__plinth"), context(plinthRect, [8, 8, 204, 284], { radius: 18 }));
  assert.ok(crowded.height < face.height, "crowded by the box, the plinth is lowered");
  // The radius is clamped to a stadium; an empty rect gives nothing.
  assert.equal(padFormEntries(element("ug-pad__cap"), context([19, 19, 10, 64], padBoxRect, { radius: 40 }))[0].radius, 5);
  assert.deepEqual(padFormEntries(element("ug-pad__cap"), context([19, 19, 0, 0], padBoxRect)), []);
  assert.equal(fittedRoundHeight(4, { left: 9, right: 9, top: 9, bottom: 9 }, light) <= 4, true);
});
