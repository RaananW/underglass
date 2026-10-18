/**
 * The Display (anatomy pages `display.md`, `text-field.md` section 11): the forms and backlight roles, the markup every binding
 * renders (`packages/ui/src/shared/display.ts`), the backlight's emitters, the tokens, the Relief and Objects entries
 * (`gpu/display-forms.ts`) and the Instrument parts (`gpu/instrument-display.ts`) checked with core's own validator and containment
 * check (`packages/core/src/instrument.ts`), with the backlight validated by core's emitter format.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { BACKLIGHT_TINT, backlightColour, defaultBacklight, displayAttributes, displayClasses, displayEmitterCount, displayEmitterDefaults, displayEmitterReference, displayEmitters,
  displayMarkup, FINISH_REACH, finishAllowed, isDisplayBacklight, isTextForm, MAX_DISPLAY_EMITTERS, windowColour } from "../../packages/ui/src/shared/display.ts";
import { lampColours } from "../../packages/ui/src/shared/lamp.ts";
import { bezelCaster, bezelShape, displayGeometry, displayHeight, displayMaterials, displayObject, paneShape } from "../../packages/ui/src/gpu/instrument-display.ts";
import { displayFormEntries } from "../../packages/ui/src/gpu/display-forms.ts";
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

test("a TextField takes the display form by name, and any other form string stays the native form owner's id", () => {
  assert.equal(isTextForm("display"), true);
  for (const other of ["login", "", undefined, 3, "Display"]) assert.equal(isTextForm(other), false);
});

test("the backlight is a colour role of the Lamp's, or off; a display names none and is backlit in glowOn", () => {
  assert.equal(defaultBacklight, "glowOn");
  for (const role of [...lampColours, "off"]) assert.equal(isDisplayBacklight(role), true, role);
  for (const other of ["pink", "", undefined, "on"]) assert.equal(isDisplayBacklight(other), false);
  // The root's attributes: the form always; a role and an unlit backlight only when given.
  assert.deepEqual(displayAttributes({}), { "data-strata-form": "display" });
  assert.deepEqual(displayAttributes({ backlight: "accent", lit: false }), { "data-strata-form": "display", "data-strata-backlight": "accent", "data-strata-lit": "false" });
  assert.deepEqual(displayAttributes({ backlight: "off", lit: true }), { "data-strata-form": "display", "data-strata-backlight": "off" });
  assert.deepEqual(displayAttributes({ backlight: "pink" }), { "data-strata-form": "display" });
  assert.deepEqual(displayClasses(false), ["ug-display", "ug-display--input"]);
  assert.deepEqual(displayClasses(true), ["ug-display", "ug-display--output"]);
  // The object: a bezel (a groove face) and the window in it (a flat face).
  assert.deepEqual(displayMarkup, { bezel: { className: "ug-display__bezel", face: "groove" }, window: { className: "ug-display__window", face: "flat" } });
});

test("the backlight is a few emitters along the window, in the role's colour, their order never depending on the state", () => {
  // One emitter per two window heights of length, from 1 to 6.
  assert.deepEqual([[36, 36], [72, 36], [214, 36], [400, 36], [2000, 36], [10, 36]].map(([width, height]) => displayEmitterCount(width, height)), [1, 1, 3, 6, MAX_DISPLAY_EMITTERS, 1]);
  const lit = displayEmitters([11, 11, 214, 36], 1, "#ff9228"), off = displayEmitters([11, 11, 214, 36], 0, "#ff9228");
  assert.equal(lit.length, 3);
  assert.deepEqual(lit.map(emitter => emitter.position), off.map(emitter => emitter.position), "the unlit display keeps its lights in place");
  assert.ok(lit.every(emitter => emitter.strength > 0) && off.every(emitter => emitter.strength === 0));
  // Along the window's middle, evenly, at the token's height (0.5 window heights) and reach (2.5).
  assert.deepEqual(lit.map(emitter => emitter.position[0]), [11 + 214 / 6, 11 + 214 / 2, 11 + (5 * 214) / 6].map(round));
  assert.ok(lit.every(emitter => emitter.position[1] === 29 && emitter.position[2] === 18 && emitter.radius === 90 && emitter.reach === "outset" && emitter.face === 1));
  // The role scaled so its brightest channel is 1.
  assert.deepEqual(backlightColour("#ff9228"), [1, 0.573, 0.157]);
  assert.deepEqual(lit[0].colour, [1, 0.573, 0.157]);
  assert.deepEqual(backlightColour("#000000"), [0, 0, 0]);
  // The strength is for the 36 px reference window, shared between the lights and scaled with the window's height squared.
  const reference = displayEmitters([0, 0, 36, 36], 1, "#ffffff")[0], tall = displayEmitters([0, 0, 72, 72], 1, "#ffffff")[0];
  assert.equal(displayEmitterReference, 36);
  assert.equal(reference.strength, displayEmitterDefaults.strength);
  assert.equal(tall.strength, displayEmitterDefaults.strength * 4);
  // Half lit is half the strength; more than lit is held to lit.
  assert.equal(displayEmitters([0, 0, 36, 36], 0.5, "#ffffff")[0].strength, displayEmitterDefaults.strength / 2);
  assert.equal(displayEmitters([0, 0, 36, 36], 9, "#ffffff")[0].strength, displayEmitterDefaults.strength);
  // Core's emitter format takes them.
  assert.equal(validateEmitters(lit, "scene").length, 3);
  assert.equal(validateEmitters(displayEmitters([0, 0, 2000, 36], 1, "#ff9228"), "scene").length, MAX_DISPLAY_EMITTERS);
  // The window's tint is part of the capture: the role over the field, the CSS's color-mix.
  assert.equal(BACKLIGHT_TINT, 0.1);
  assert.equal(windowColour("#ffffff", "#ff9228"), "#fff4ea");
});

test("the tokens carry the bezel, the finish zone and the backlight, and the CSS takes them", () => {
  const find = path => path.split(".").reduce((node, key) => node?.[key], strataTokens);
  assert.equal(find("display.bezel.width").$value, "7px");
  assert.equal(find("display.bezel.radius").$value, "8px");
  assert.equal(find("display.finish.band").$value, 0.3);
  assert.equal(find("display.finish.horizon").$value, 0.25);
  assert.deepEqual([find("emitter.display.radius").$value, find("emitter.display.height").$value, find("emitter.display.strength").$value], [displayEmitterDefaults.radius, displayEmitterDefaults.height, displayEmitterDefaults.strength]);
  assert.deepEqual(validateTokens(strataTokens), []);
  const stylesheet = tokensToCss(strataTokens);
  for (const name of ["--strata-display-bezel-width", "--strata-display-bezel-radius", "--strata-emitter-display-strength", "--strata-emitter-display-radius", "--strata-emitter-display-height"]) assert.match(stylesheet, new RegExp(`${name}:`));
  // The recipe reads them, and lights the backlight from the registered number the Lamp defines.
  assert.match(css, /--_bz: var\(--strata-display-bezel-width\)/);
  assert.match(css, /border-radius: var\(--strata-display-bezel-radius\)/);
  assert.match(css, /@property --strata-lit/);
  for (const state of ['data-strata-backlight="off"', 'data-strata-lit="false"', ".ug-display__text:disabled) { --strata-lit: 0; }"]) assert.ok(css.includes(state), state);
  // The premium character no longer carries the unprototyped `display.backlight`: the strength is the emitter token's.
  const premium = characterOf("premium");
  assert.equal(premium.provisional.includes("display.backlight"), false);
  assert.ok(premium.provisional.includes("emitter.display"));
  assert.equal(premium.tokens.display.backlight, undefined);
  assert.deepEqual(applyCharacter(strataTokens, "premium").issues, []);
});

// ---- Relief and Objects ----

const element = selector => ({ matches: test => test.split(",").map(part => part.trim()).includes(selector) });
const formContext = (over = {}) => ({ rect: [11, 11, 214, 36], radius: 8, objects: false, base: 0, box: [0, 0, 236, 58], well: 2, raised: 3, taper: 3, disabled: false,
  material: (_, face) => face, light: { azimuth: 323, elevation: 41 }, ...over });

test("at Relief the bezel is a groove and the window a flat face; at Objects the bezel is a slab standing only as high as its shadow allows", () => {
  assert.equal(displayFormEntries({ matches: () => false }, formContext()), undefined);
  const bezel = element(".ug-display__bezel"), window = element(".ug-display__window");
  assert.deepEqual(displayFormEntries(bezel, formContext({ rect: [4, 4, 228, 50] })), [{ face: "groove", rect: [4, 4, 228, 50], radius: 8, height: 2, material: "groove", state: { disabled: false } }]);
  assert.deepEqual(displayFormEntries(window, formContext()), [{ face: "flat", rect: [11, 11, 214, 36], radius: 8, height: 0, material: "flat", state: { disabled: false } }]);
  assert.deepEqual(displayFormEntries(window, formContext({ objects: true, base: 3 })), [{ face: "flat", rect: [11, 11, 214, 36], radius: 8, height: 0, material: "flat", state: { disabled: false } }],
    "the window stays flat at Objects: the text is printed on it");
  // The bezel's cast shadow (2.8) must stay in the native box: 4 px of room lowers it from 3, a roomier box leaves it.
  const tight = displayFormEntries(bezel, formContext({ rect: [4, 4, 228, 50], objects: true }))[0];
  assert.deepEqual([tight.object, tight.base], ["slab", 0]);
  assert.ok(tight.height > 0 && tight.height < 3, `4 px of room lowers the bezel to ${tight.height}`);
  assert.ok(tight.taper <= tight.height);
  const roomy = displayFormEntries(bezel, formContext({ rect: [10, 10, 216, 38], objects: true, box: [0, 0, 236, 58], raised: 1 }))[0];
  assert.equal(roomy.height, 1);
  // A disabled display carries it; a part with no box gives nothing; a radius larger than the box is held to half its shorter side.
  assert.deepEqual(displayFormEntries(window, formContext({ disabled: true }))[0].state, { disabled: true });
  assert.deepEqual(displayFormEntries(window, formContext({ rect: [10, 10, 0, 0] })), []);
  assert.equal(displayFormEntries(window, formContext({ radius: 999 }))[0].radius, 18);
});

// ---- Instrument ----

const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
/** A scene around `objects`, as the GPU helper writes it. */
function sceneOf(objects, profiles, materials, emitters, extent = [400, 320]) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: extent[0], height: extent[1] }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, extent[0], extent[1]], radius: 12, height: 8, material: "matte" }], profiles, objects, ...(emitters ? { emitters, protected: [[30, 30, 190, 16]], feather: 4 } : {}) };
}
/** The laid-out numbers of the medium display: a 236 × 58 box, the bezel 4 px in (228 × 50), the window 7 px in again (214 × 36). */
const displayAt = (profile, { scale = 1, x = 0, y = 0, opaque = false, light } = {}) => {
  const box = [x, y, 236, 58], bezel = [x + 4, y + 4, 228, 50], window = [x + 11, y + 11, 214, 36];
  const caster = light ? bezelCaster(bezel, box, 8, scale, light) : undefined;
  return displayObject({ id: "display", box, bezel, bezelRadius: 8, window, windowRadius: 4, scale, opaque, ...(caster ? { caster } : {}), relief: { height: 3, material: "displayBezel" } }, profile);
};
const keyLight = { azimuth: 323, elevation: 41 };

test("a display is a polished bezel and a glass pane over its window, with the premium finish zone; the parts never depend on the state", () => {
  const { profiles, profile } = registry();
  const object = displayAt(profile, { light: keyLight });
  assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), ["bezel:displayBezel", "window:displayGlass"]);
  const [bezel, pane] = object.parts;
  assert.equal(pane.glass, "window");
  assert.equal(pane.caster, null);
  assert.equal(pane.finish, undefined, "no finish where text can reach the zone");
  assert.equal(bezel.glass, undefined);
  assert.equal(object.t, 0, "no pose: the emitters light, nothing moves");
  assert.deepEqual(object.bounds, { rect: [0, 0, 236, 58], radius: 0 });
  assert.deepEqual(bezel.at, [118, 29, 0]);
  assert.deepEqual(pane.at, [118, 29, 0]);
  // The shapes: the bezel 2.4 high with a 2 px chamfer, the pane 2.4 high with the 2.6 px bevel (held under its height at shallow depths).
  assert.deepEqual(Object.values(profiles), [{ type: "prism", width: 228, length: 50, radius: 8, height: 2.4, chamfer: 2 }, { type: "prism", width: 214, length: 36, radius: 4, height: 2.4, chamfer: 2.28 }]);
  assert.deepEqual(bezelShape([0, 0, 100, 40], 30, 0.6), { type: "prism", width: 100, length: 40, radius: 20, height: 1.44, chamfer: 1.296 });
  assert.equal(paneShape([0, 0, 100, 40], 4, 1.6).height, 3.84);
  assert.equal(paneShape([0, 0, 100, 40], 4, 1.6).chamfer, 2.6);
  assert.deepEqual(displayGeometry.finish, { band: 0.3, horizon: 0.25 });
  // A finish the page gives (the `display.finish` tokens, where no text can reach the zone) is the pane's.
  const finished = displayObject({ id: "d", box: [0, 0, 236, 58], bezel: [4, 4, 228, 50], bezelRadius: 8, window: [11, 11, 214, 36], windowRadius: 4, scale: 1, finish: { band: 0.3, horizon: 0.25 }, relief: { height: 3, material: "displayBezel" } }, registry().profile);
  assert.deepEqual(finished.parts[1].finish, { band: 0.3, horizon: 0.25 });
  // Lit or not is the emitters' strength alone: the same parts, the same materials.
  const { profile: again } = registry();
  assert.deepEqual(displayAt(again, { light: keyLight }).parts, object.parts);
  // Under prefers-reduced-transparency the window shows the plain capture: the pane is left out and the bezel stays.
  const opaque = displayAt(registry().profile, { opaque: true });
  assert.deepEqual(opaque.parts.map(part => part.kind), ["bezel"]);
  // Core's validator takes the scene with its lights.
  const emitters = displayEmitters([11, 11, 214, 36], 1, "#ff9228");
  const scene = validateInstrumentScene(sceneOf([object], profiles, displayMaterials, emitters, [236, 58]));
  assert.deepEqual(scene.objects[0].parts.map(part => part.kind), ["bezel", "window"]);
  assert.equal(scene.emitters.length, 3);
  assert.deepEqual(Object.keys(displayMaterials), ["displayBezel", "displayGlass"]);
  assert.equal(displayMaterials.displayGlass.glass.reflection, 1.5);
  assert.equal(displayHeight(1), 2.5);
  assert.equal(displayHeight(1.6), round(2.4 * 1.6 + 0.1));
});

test("the finish zone is turned off wherever text can reach it, as key tops do", () => {
  assert.equal(FINISH_REACH, 0.31);
  // An input's text can be anywhere in its content box (its top is the window's); an output's line in a 34 px window starts about 8 px down.
  assert.equal(finishAllowed(34, 0), false);
  assert.equal(finishAllowed(34, 8), false);
  // A window 100 px high with its text 40 px down (past the horizon at 31 px, and the guard's 2 px): the zone may draw.
  assert.equal(finishAllowed(100, 40), true);
  assert.equal(finishAllowed(100, 33), false, "the text's guarded rect would touch the horizon line");
  assert.equal(finishAllowed(100, 33.1 + 2, 2), true);
  assert.equal(finishAllowed(100, Number.POSITIVE_INFINITY), true, "no text at all");
});

test("the bezel's caster is core's own unless its shadow would leave the box, then the same footprint at the tallest height that fits", () => {
  const box = [0, 0, 236, 58], bezel = [4, 4, 228, 50];
  const fitted = bezelCaster(bezel, box, 8, 1, keyLight);
  assert.ok(fitted, "4 px of room cannot hold the shadow of a 2.4 px bezel's mean height");
  assert.deepEqual([fitted.rect, fitted.radius], [bezel, 8]);
  assert.ok(fitted.height > 0 && fitted.height < 1.2, `${fitted.height}`);
  assert.equal(bezelCaster([10, 10, 216, 38], box, 8, 1, keyLight), undefined, "a roomier box keeps core's caster");
});

test("every vertex of a display stays 0.5 px inside its box, in every corner of the stage, at every depth", () => {
  const worst = {};
  for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = displayAt(profile, { scale, light: keyLight }), frontier = containmentFrontier(object, profiles), [, , w, h] = object.rect;
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0], [960 - w / 2, 540 - h / 2]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, profiles, frontier, placement);
      assert.ok(result.contained, `depth scale ${scale}, at ${e},${f}: inset ${result.inset}`);
      worst[scale] = Math.min(worst[scale] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A bezel with no room would leave it: the 4 px is what keeps it in.
  const { profiles, profile } = registry();
  const flush = displayObject({ id: "flush", box: [0, 0, 236, 58], bezel: [0, 0, 236, 58], bezelRadius: 8, window: [11, 11, 214, 36], windowRadius: 4, scale: 1.6, relief: { height: 3, material: "displayBezel" } }, profile);
  const result = checkContainment(flush, profiles, containmentFrontier(flush, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("a layer of displays validates with its lights, and the scene's materials stay within core's 16", () => {
  const { profiles, profile } = registry();
  const objects = [displayAt(profile, { x: 10, y: 10 }), displayAt(profile, { x: 10, y: 90 }), displayAt(profile, { x: 10, y: 170 })];
  objects.forEach((object, index) => { object.id = `display-${index}`; });
  const scene = validateInstrumentScene(sceneOf(objects, profiles, displayMaterials, [0, 1, 2].flatMap(() => displayEmitters([21, 21, 214, 36], 1, "#ff9228")), [260, 260]));
  assert.equal(scene.objects.length, 3);
  assert.equal(Object.keys(scene.materials).length, 3, "matte, the bezel and the glass");
  assert.equal(Object.keys(profiles).length, 2, "one bezel shape and one pane shape for every display of a size");
  assert.equal(scene.emitters.length, 9);
});
