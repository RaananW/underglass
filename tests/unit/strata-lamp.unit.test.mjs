/**
 * The Lamp and the StatusLight (anatomy pages `lamp.md`, `status-light.md`): their markup, boxes and colours
 * (`packages/ui/src/shared/lamp.ts`, `status-light.ts`), the emitter a lit lens carries and its budget, the blink
 * tempos (never over three flashes a second), the plain-DOM helper (`dom/status-light.ts`), the Relief and Objects
 * entries (`gpu/lamp-forms.ts`) and the Instrument parts (`gpu/instrument-lamp.ts`) checked with core's own validator
 * and containment check (`packages/core/src/instrument.ts`), with the lights validated by core's emitter format.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { LAMP_BEZEL, LAMP_ROOM, STATUS_LIGHT_ROOM, emitterDefaults, emitterReference, isLampColour, lampBox, lampColours, lampLens, lampMarkup, lensColours, lensEmitter, mixHex, statusLightBox, statusLightLens } from "../../packages/ui/src/shared/lamp.ts";
import { MAX_FLASHES_PER_SECOND, blinkPeriods, blinkTempos, flashesPerSecond, isBlink, statusLightForm, statusLightMarkup, statusLightModel } from "../../packages/ui/src/shared/status-light.ts";
import { lampGeometry, lampHeight, lampMaterialsOf, lampObject, lensGlass, lensMaterial, lensOpaque, lensProfile } from "../../packages/ui/src/gpu/instrument-lamp.ts";
import { lampFormEntries, lensColourAt } from "../../packages/ui/src/gpu/lamp-forms.ts";
import { setStrataStatusLight } from "../../packages/ui/src/dom/status-light.ts";
import { strataTokens, tokensToCss, validateTokens } from "../../packages/ui/src/tokens/index.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment } = await import("../../packages/core/src/instrument.ts");
const { validateEmitters, selectEmitters, EMITTERS_PER_LAYER, SCENE_EMITTERS } = await import("../../packages/core/src/emitters.ts");
sourceImports.deregister();

const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
const round = value => Math.round(value * 1000) / 1000;

test("the colour roles, the sizes and the boxes: a lens plus room for its bezel and its bloom, every box at least 24 px", () => {
  assert.deepEqual(lampColours, ["glowOn", "accent", "success", "warning", "danger", "info"]);
  assert.ok(isLampColour("danger") && !isLampColour("pink") && !isLampColour(undefined));
  assert.deepEqual(lampLens, { small: 20, medium: 28, large: 36 });
  assert.deepEqual(statusLightLens, { small: 8, medium: 10, large: 14 });
  assert.equal(LAMP_ROOM, 28);
  assert.equal(STATUS_LIGHT_ROOM, 16);
  assert.deepEqual(Object.values(lampLens).map(lampBox), [48, 56, 64]);
  assert.deepEqual(Object.values(statusLightLens).map(statusLightBox), [24, 26, 30]);
  for (const box of [...Object.values(lampLens).map(lampBox), ...Object.values(statusLightLens).map(statusLightBox)]) assert.ok(box >= 24);
  // The tokens carry the same numbers, and the CSS takes its sizes from them.
  const flat = Object.fromEntries(Object.entries({ lamp: lampLens, statusLight: statusLightLens }).flatMap(([part, sizes]) => Object.entries(sizes).map(([size, value]) => [`${part}.${size}`, `${value}px`])));
  for (const [path, value] of Object.entries(flat)) assert.equal(strataTokens.size[path.split(".")[0]][path.split(".")[1]].$value, value, path);
  const stylesheet = tokensToCss(strataTokens);
  assert.match(stylesheet, /--strata-lamp-size: var\(--strata-size-lamp-medium\);/);
  assert.match(stylesheet, /\[data-strata-size="large"\] \{[^}]*--strata-status-light-size: var\(--strata-size-status-light-large\);/);
  assert.deepEqual(validateTokens(strataTokens), []);
});

test("every part is styled, the lens is a knob face and the bezel a raised one", () => {
  assert.deepEqual(lampMarkup, [{ className: "ug-lamp__bezel", face: "raised" }, { className: "ug-lamp__socket" }, { className: "ug-lamp__lens", face: "knob" }]);
  assert.deepEqual(statusLightMarkup, [{ className: "ug-status-light__socket" }, { className: "ug-status-light__lens", face: "knob" }]);
  for (const part of [...lampMarkup, ...statusLightMarkup]) assert.ok(css.includes(`.${part.className}`), `${part.className} is styled`);
  assert.match(css, /@property --strata-lit \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/);
  assert.match(css, /@keyframes ug-blink \{ 0% \{ --strata-lit: 1; \} 50% \{ --strata-lit: 0; \} 100% \{ --strata-lit: 1; \} \}/);
  // Preferences: reduced motion stops the blink, forced colours flatten the lens to Highlight or Canvas, more contrast edges it.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^]*?:where\(\.ug-status-light\[data-strata-blink\]\) \{ animation: none; \}/);
  assert.match(css, /@media \(forced-colors: active\) \{[^]*?\.ug-lamp__lens, \.ug-status-light__lens\) \{ forced-color-adjust: none; border: 1px solid CanvasText; background: Canvas;/);
  assert.match(css, /@media \(prefers-contrast: more\) \{\n\s+:where\(\.ug-lamp__socket, \.ug-status-light__socket\) \{ background: var\(--_glass\); \}/);
  // The glow colour is a token, and the lamp's default.
  assert.equal(strataTokens.colour.glowOn.$value, "#ff9228");
  assert.match(css, /--_c: var\(--strata-colour-glow-on\);/);
});

test("the lens colours: the role lit (18% towards white) and unlit (16% over dark glass), and the emitter's colour scaled to full brightness", () => {
  assert.equal(mixHex("#000000", "#ffffff", 0.5), "#808080");
  assert.deepEqual(lensColours("#ff9228"), { on: "#ffa64f", off: "#3a2b1d", light: [1, 0.573, 0.157] });
  assert.deepEqual(lensColours("#15803d").light, [0.164, 1, 0.477]);
  // The unlit lens is dark whatever the role; the lit one is brighter than the role.
  const luma = hex => Number.parseInt(hex.slice(1, 3), 16) * 0.2126 + Number.parseInt(hex.slice(3, 5), 16) * 0.7152 + Number.parseInt(hex.slice(5, 7), 16) * 0.0722;
  for (const role of ["#ff9228", "#2563eb", "#15803d", "#b45309", "#c42b2b"]) {
    const { on, off } = lensColours(role);
    assert.ok(luma(off) < 70, `${role} unlit ${off}`);
    assert.ok(luma(on) >= luma(role), `${role} lit ${on}`);
    assert.equal(lensColourAt(role, 0), off);
    assert.equal(lensColourAt(role, 1), on);
    assert.equal(lensColourAt(role, 7), on, "clamped");
  }
});

test("an emitter stands over its lens, reaches six diameters and scales its strength with the square of the lens", () => {
  assert.deepEqual(emitterDefaults, { lamp: { radius: 6, height: 0.7, strength: 3200 }, led: { radius: 6, height: 0.8, strength: 520 }, guardFeather: 4 });
  assert.deepEqual(emitterReference, { lamp: 28, led: 10 });
  const lamp = lensEmitter("lamp", [100, 80], 28, 1, "#ff9228");
  assert.deepEqual(lamp, { position: [100, 80, 19.6], colour: [1, 0.573, 0.157], strength: 3200, radius: 168, reach: "outset", face: 1 });
  const led = lensEmitter("led", [10, 12], 10, 1, "#15803d");
  assert.deepEqual([led.position[2], led.strength, led.radius], [8, 520, 60]);
  // A larger lens throws the same pool, larger: strength by the square, reach by the diameter.
  const large = lensEmitter("lamp", [0, 0], 36, 1, "#ff9228"), small = lensEmitter("lamp", [0, 0], 20, 1, "#ff9228");
  assert.equal(large.strength, round(3200 * (36 / 28) ** 2));
  assert.equal(small.radius, 120);
  // Unlit keeps its place at strength 0, so the emitters' order never depends on the state; lit is a share of it.
  assert.equal(lensEmitter("lamp", [0, 0], 28, 0, "#ff9228").strength, 0);
  assert.equal(lensEmitter("lamp", [0, 0], 28, 0.5, "#ff9228").strength, 1600);
  assert.equal(lensEmitter("lamp", [0, 0], 28, 9, "#ff9228").strength, 3200);
  // The tokens override the defaults.
  assert.equal(lensEmitter("lamp", [0, 0], 28, 1, "#ff9228", { radius: 4, height: 1, strength: 100 }).radius, 112);
  // Core's own validator takes them, and its budget keeps 64 a layer by reach, dropping the rest with a report.
  assert.equal(validateEmitters([lamp, led], "Instrument scene").length, 2);
  assert.equal(EMITTERS_PER_LAYER, 64);
  assert.equal(SCENE_EMITTERS, 1024);
  const many = Array.from({ length: 70 }, (_, index) => lensEmitter("lamp", [20 + index * 4, 40], 28, 1, "#ff9228"));
  const selected = selectEmitters(validateEmitters(many, "scene"), { x0: 0, y0: 0, x1: 300, y1: 100 });
  assert.equal(selected.drawn.length, 64);
  assert.equal(selected.dropped.length, 6);
  assert.equal(selected.lit, 70);
});

test("the blink tempos stay at or under three flashes a second, and a StatusLight takes one of three forms", () => {
  assert.deepEqual(blinkTempos, ["slow", "normal", "fast"]);
  assert.deepEqual(blinkPeriods, { slow: 1600, normal: 1000, fast: 400 });
  assert.equal(MAX_FLASHES_PER_SECOND, 3);
  assert.deepEqual(blinkTempos.map(tempo => flashesPerSecond(blinkPeriods[tempo])), [0.625, 1, 2.5]);
  for (const tempo of blinkTempos) assert.ok(flashesPerSecond(blinkPeriods[tempo]) <= MAX_FLASHES_PER_SECOND, tempo);
  assert.ok(isBlink("fast") && !isBlink("frantic"));
  // The tokens carry the periods and refuse a faster one (WCAG 2.3.1); the CSS names them.
  for (const tempo of blinkTempos) {
    assert.equal(strataTokens.blink[tempo].$value, `${blinkPeriods[tempo]}ms`);
    assert.ok(css.includes(`[data-strata-blink="${tempo}"]) { --_period: var(--strata-blink-${tempo}); }`), tempo);
  }
  const faster = structuredClone(strataTokens);
  faster.blink.fast.$value = "200ms";
  assert.ok(validateTokens(faster).some(issue => issue.path === "blink.fast" && /minimum 334/.test(issue.message)), JSON.stringify(validateTokens(faster)));
  assert.deepEqual([statusLightForm({}), statusLightForm({ showLabel: true }), statusLightForm({ live: true }), statusLightForm({ live: "assertive", showLabel: true })], ["img", "text", "live", "live"]);
  const img = statusLightModel({ label: "Link up", colour: "success" });
  assert.deepEqual(img, { form: "img", tag: "span", classes: ["ug-status-light"], attrs: { "data-strata-colour": "success", role: "img", "aria-label": "Link up" }, text: false });
  const text = statusLightModel({ label: "Recording", colour: "danger", blink: "normal", lit: false, showLabel: true });
  assert.deepEqual([text.tag, text.text, text.attrs], ["span", true, { "data-strata-colour": "danger", "data-strata-lit": "false", "data-strata-blink": "normal" }]);
  const live = statusLightModel({ label: "Synced", live: "assertive" });
  assert.deepEqual([live.tag, live.classes, live.attrs, live.text], ["output", ["ug-status-light", "ug-status-light--bare"], { "aria-live": "assertive" }, true]);
  assert.deepEqual(statusLightModel({ label: "x", live: true, showLabel: true }).classes, ["ug-status-light"]);
  assert.ok(!("aria-live" in statusLightModel({ label: "x", live: true }).attrs), "an output is a polite live region already");
});

test("setStrataStatusLight keeps a light valid: its label where it lives, its state as attributes", () => {
  const attrs = new Map(), text = { textContent: "Synced" };
  const make = withText => {
    const self = {
      getAttribute: name => attrs.get(name) ?? null, setAttribute: (name, value) => attrs.set(name, value), removeAttribute: name => attrs.delete(name),
      closest: selector => (selector === ".ug-status-light" ? self : null), querySelector: selector => (selector === ".ug-status-light__text" && withText ? text : null),
    };
    return self;
  };
  const root = make(true);
  assert.equal(setStrataStatusLight(root, { label: "Syncing", lit: false, colour: "warning", blink: "fast" }), root);
  assert.equal(text.textContent, "Syncing");
  assert.deepEqual([...attrs], [["data-strata-lit", "false"], ["data-strata-colour", "warning"], ["data-strata-blink", "fast"]]);
  setStrataStatusLight(root, { lit: true, colour: null, blink: null });
  assert.deepEqual([...attrs], []);
  const image = make(false);
  setStrataStatusLight(image, { label: "Link idle" });
  assert.equal(attrs.get("aria-label"), "Link idle");
  assert.equal(setStrataStatusLight({ closest: () => null }, { label: "x" }), undefined);
});

/** A version 4 scene around `objects`, with their lights, as the GPU helper writes it. */
function sceneOf(objects, profiles, materials, emitters) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 320 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, 400, 320], radius: 12, height: 8, material: "matte" }], profiles, objects, emitters, protected: [[20, 20, 100, 20]], feather: 4 };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
const lampAt = (profile, kind, options = {}) => {
  const lens = options.lens ?? (kind === "lamp" ? 28 : 10), box = kind === "lamp" ? lampBox(lens) : statusLightBox(lens);
  return lampObject({ id: kind, kind, box: [0, 0, box, box], lens, scale: 1, role: "#ff9228", emitter: 0, state: { hover: false, disabled: false }, relief: { rect: [0, 0, box, box], height: 3 }, ...options }, profile);
};

test("a lamp is a polished bezel and a glass lens with its emitter, an LED the lens alone, and neither depends on its state", () => {
  const { profiles, profile } = registry();
  const lamp = lampAt(profile, "lamp"), led = lampAt(profile, "led", { id: "led", emitter: 1 });
  assert.deepEqual(lamp.parts.map(part => `${part.kind}:${part.material}`), ["bezel:lampBezel", "lens:lens #ff9228"]);
  assert.deepEqual(led.parts.map(part => `${part.kind}:${part.material}`), ["lens:lens #ff9228"]);
  assert.deepEqual(lamp.parts.map(part => part.emitter), [undefined, 0]);
  assert.equal(led.parts[0].emitter, 1);
  assert.equal(lamp.parts[1].glass, "lens");
  assert.equal(lamp.parts[1].caster, null);
  assert.deepEqual(lamp.bounds, { rect: [0, 0, 56, 56], radius: 0 });
  assert.equal(lamp.t, 0, "no pose: the emitter turns on, nothing moves");
  // The same parts at every state: only hover and disabled ride along.
  assert.deepEqual(lampAt(registry().profile, "lamp", { state: { hover: true, disabled: true } }).parts.map(part => part.kind), lamp.parts.map(part => part.kind));
  const materials = { ...lampMaterialsOf({ kind: "lamp", role: "#ff9228" }), ...lampMaterialsOf({ kind: "led", role: "#ff9228" }) };
  assert.deepEqual(Object.keys(materials), ["lampBezel", "lens #ff9228"]);
  assert.deepEqual(materials["lens #ff9228"].glass, { ior: 1.5, tint: lensColours("#ff9228").on, absorption: 0.05, reflection: 1.5 });
  assert.equal(lensMaterial({ role: "#FF9228" }), "lens #ff9228");
  const emitters = [lensEmitter("lamp", [28, 28], 28, 1, "#ff9228"), lensEmitter("led", [100, 20], 10, 1, "#15803d")];
  const scene = validateInstrumentScene(sceneOf([lamp, { ...led, rect: [80, 0, 26, 26], bounds: { rect: [80, 0, 26, 26], radius: 0 }, parts: [{ ...led.parts[0], at: [93, 13, 0] }] }], profiles, materials, emitters));
  assert.equal(scene.objects.length, 2);
  assert.equal(scene.emitters.length, 2);
  // A lens part is a glass part to core, whose glow it takes from its emitter.
  assert.equal(scene.objects[0].parts[1].glass, "lens");
  assert.equal(scene.objects[0].parts[1].emitter, 0);
});

test("the lens profile is a plano-convex lens: a short wall and an elliptical dome, with unit normals", () => {
  const shape = lensProfile(14, 11.2, 2);
  assert.equal(shape.type, "lathe");
  assert.deepEqual(shape.points[0], [14, 0, 1, 0]);
  assert.deepEqual(shape.points.at(-1).slice(0, 2), [0, 11.2]);
  for (const [r, z, nr, nz] of shape.points) {
    assert.ok(r >= 0 && z >= 0 && z <= 11.2 + 1e-9);
    assert.ok(Math.abs(Math.hypot(nr, nz) - 1) < 2e-3, `normal at ${r},${z}`);
  }
  assert.deepEqual(lampGeometry, { lamp: { bezelHeight: 3, bezelWidth: LAMP_BEZEL, lens: 0.4, wall: 2 }, led: { lens: 0.35, wall: 1 } });
  assert.equal(lampHeight("lamp", 28, 1), round(3 + 0.4 * 28 + 0.1));
  assert.equal(lampHeight("led", 10, 1.6), round(0.35 * 10 * 1.6 + 0.1));
  // Under reduced transparency the lens is an opaque lacquer dome: no glass.
  assert.equal(lensOpaque("#ff9228").glass, undefined);
  assert.equal(lensOpaque("#ff9228").base.colour, lensColours("#ff9228").off);
  assert.equal(lensGlass("#ff9228").glass.reflection, 1.5);
  const { profile } = registry();
  const opaque = lampAt(profile, "lamp", { opaque: true });
  assert.deepEqual(opaque.parts.map(part => `${part.material}:${part.glass}`), ["lampBezel:undefined", "lensOpaque #ff9228:undefined"]);
});

test("every vertex of a lamp and an LED stays 0.5 px inside its box over the whole stage, at every depth and size", () => {
  const worst = {};
  for (const kind of ["lamp", "led"]) for (const lens of Object.values(kind === "lamp" ? lampLens : statusLightLens)) for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = lampAt(profile, kind, { lens, scale });
    const frontier = containmentFrontier(object, profiles);
    const box = object.rect[2];
    for (const [e, f] of [[0, 0], [1920 - box, 0], [0, 1080 - box], [1920 - box, 1080 - box], [0, 540 - box / 2], [960 - box / 2, 0]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, profiles, frontier, placement);
      assert.ok(result.contained, `${kind} ${lens}, depth scale ${scale}, at ${e},${f}: inset ${result.inset}`);
      worst[`${kind} ${lens}`] = Math.min(worst[`${kind} ${lens}`] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A bezel standing right at the box's edge would not: the room is what keeps the parts in.
  const { profiles, profile } = registry();
  const tight = lampAt(profile, "lamp", { box: [0, 0, 38, 38], scale: 1.6 });
  tight.bounds = { rect: [0, 0, 38, 38], radius: 0 };
  const result = checkContainment(tight, profiles, containmentFrontier(tight, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("at Relief and Objects a lens is a disc or a dome in its own colour, a bezel a face or a ring standing only as high as its shadow allows", () => {
  const rect = { bezel: [10, 10, 36, 36], lens: [14, 14, 28, 28] };
  const element = kind => ({ matches: selector => selector.split(",").some(part => part.trim() === `.ug-${kind}`) , closest: () => null });
  const context = (over = {}) => ({ rect: rect.lens, state: {}, objects: false, base: 0, box: [0, 0, 56, 56], role: "#ff9228", lit: 1, light: { azimuth: 323, elevation: 41 }, hoverHeight: 1.6,
    material: (_, role) => role, ...over });
  assert.equal(lampFormEntries({ matches: () => false }, context()), undefined);
  const lens = element("lamp__lens");
  const domes = new Set();
  const [disc] = lampFormEntries(lens, context({ domes }));
  assert.deepEqual([disc.face, disc.ring.thickness, disc.ring.start, disc.ring.sweep, disc.ring.colour, disc.material], ["ring", 14, 0, 360, lensColours("#ff9228").on, "glowOn"]);
  assert.ok(domes.has(lens), "its CSS paint is hidden");
  const [unlit] = lampFormEntries(lens, context({ lit: 0 }));
  assert.deepEqual([unlit.ring.colour, unlit.material], [lensColours("#ff9228").off, "lens"]);
  const [dome] = lampFormEntries(lens, context({ objects: true, base: 2 }));
  // The dome would like to stand 8.4 high (0.3 of its diameter), and stands as high as its shadow (2.8) stays in the box: 5.37 with 14 px to the edge.
  assert.deepEqual([dome.object, dome.base, dome.colour, dome.bounds, dome.height], ["knob", 2, lensColours("#ff9228").on, [0, 0, 56, 56], 5.37]);
  assert.ok(lampFormEntries(lens, context({ objects: true, box: [-1000, -1000, 3000, 3000] }))[0].height === 8.4, "with room, 0.3 of its diameter");
  // The bezel: a raised face at Relief and a ring at Objects, each fitted so its shadow stays inside the control's box.
  const bezel = element("lamp__bezel");
  const [face] = lampFormEntries(bezel, context({ rect: rect.bezel }));
  assert.deepEqual([face.face, face.radius, face.height], ["raised", 18, 3]);
  const [ring] = lampFormEntries(bezel, context({ rect: rect.bezel, objects: true }));
  assert.deepEqual([ring.object, ring.width, ring.radius, ring.height], ["bezel", LAMP_BEZEL, 18, 3]);
  const [crowded] = lampFormEntries(bezel, context({ rect: rect.bezel, box: [4, 4, 42, 42] }));
  assert.ok(crowded.height < 3, `a box 4 px from the bezel lowers it to ${crowded.height}`);
  assert.deepEqual(lampFormEntries(lens, context({ rect: [14, 14, 0, 0] })), []);
});
