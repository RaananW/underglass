/**
 * The three deferred forms of the Instrument plan's everyday table: the Slider's `wheel` (`packages/ui/src/gpu/instrument-wheel.ts`, `shared/slider-forms.ts`), the
 * RadioGroup's `selector` (`shared/radio-forms.ts`) and the Display's `segments` (`shared/segments.ts`, the face Strata draws itself): their names and rules, the tokens,
 * the CSS, the seven-segment font checked with a font reader, and the wheel's parts checked with core's own validator and containment check
 * (`packages/core/src/instrument.ts`) over the whole turn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { create } from "fontkitten";
import { sliderForm, sliderFormModel, sliderOwner } from "../../packages/ui/src/shared/slider-forms.ts";
import { radioAt, radioForm, radioFormFor, radioOwner, radioSelectorModel } from "../../packages/ui/src/shared/radio-forms.ts";
import { displayAttributes, isDisplaySegments } from "../../packages/ui/src/shared/display.ts";
import { SEGMENT_ADVANCE, SEGMENT_ASCENT, SEGMENT_DESCENT, SEGMENTS_FAMILY, segmentCharacters, segmentGlyph, segmentNames, segmentShapes, segmentsFont, segmentsFontFace, segmentsGhost, segmentsGhostUrl } from "../../packages/ui/src/shared/segments.ts";
import { wheelFootprint, wheelGeometry, wheelHeight, wheelIndexOutline, wheelObject, wheelOutline, wheelRadius, wheelRidges, wheelSweep } from "../../packages/ui/src/gpu/instrument-wheel.ts";
import { faderMaterials } from "../../packages/ui/src/gpu/instrument-fader.ts";
import { premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";
import { strataTokens, tokensToCss, validateTokens } from "../../packages/ui/src/tokens/index.ts";

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

test("a Slider takes `wheel` as a form (horizontal, the fader's track), three printed marks by default, and its own travel and sweep as the tokens' variables", () => {
  assert.equal(sliderForm("wheel"), "wheel");
  assert.equal(sliderOwner("wheel"), undefined, "reserved: never the native form attribute");
  const model = sliderFormModel("wheel", { value: 40 });
  assert.deepEqual(model.rootClass, ["ug-fader", "ug-fader--horizontal", "ug-fader--wheel"]);
  assert.equal(model.style, "--strata-fader-value: 0.4;");
  assert.deepEqual(model.marks.map(mark => mark.text), ["0", "50", "100"]);
  const own = sliderFormModel("wheel", { value: 75, marks: [0, 25, 50, 75, 100], travel: 80, sweep: 120, unit: " dB" });
  assert.equal(own.style, "--strata-fader-value: 0.75; --strata-wheel-travel: 80px; --strata-wheel-sweep: 120;");
  assert.equal(own.valueText, "75 dB");
  assert.equal(own.marks.length, 5);
  // A fader's travel is still the fader's.
  assert.equal(sliderFormModel("fader", { value: 40, travel: 120 }).style, "--strata-fader-value: 0.4; --strata-fader-travel: 120px;");
});

test("a RadioGroup's selector: 2 to 8 radios of at most 12 characters, otherwise a bank; the names are reserved and never the native form attribute", () => {
  assert.equal(radioForm("selector"), "selector");
  assert.equal(radioForm("bank"), "bank");
  for (const form of ["flush", "settings", "", undefined, null, 3]) assert.equal(radioForm(form), undefined, String(form));
  for (const form of ["flush", "bank", "selector", undefined, 3]) assert.equal(radioOwner(form), undefined, String(form));
  assert.equal(radioOwner("settings"), "settings");
  const options = count => Array.from({ length: count }, (_, index) => ({ value: `v${index}`, label: `Label ${index}` }));
  assert.equal(radioFormFor("selector", options(2)), "selector");
  assert.equal(radioFormFor("selector", options(8)), "selector");
  assert.equal(radioFormFor("selector", options(9)), "bank", "nine radios: a bank");
  assert.equal(radioFormFor("selector", options(1)), "bank", "one radio is not a dial");
  assert.equal(radioFormFor("selector", [{ value: "a", label: "Twelve chars" }, { value: "b", label: "B" }]), "selector");
  assert.equal(radioFormFor("selector", [{ value: "a", label: "Thirteen char" }, { value: "b", label: "B" }]), "bank", "a long label: a bank");
  assert.equal(radioFormFor("selector", undefined), "bank", "radios a binding cannot read: a bank");
  assert.equal(radioFormFor("bank", options(20)), "bank");
  assert.equal(radioFormFor(undefined, options(3)), undefined);
  const model = radioSelectorModel(options(4), "v2");
  assert.equal(model.style, "--strata-rotary-value: 0.6667;");
  assert.deepEqual(model.marks.map(mark => mark.style), ["--strata-rotary-at: 0;", "--strata-rotary-at: 0.3333;", "--strata-rotary-at: 0.6667;", "--strata-rotary-at: 1;"]);
  assert.equal(radioAt(1, 4), "--strata-rotary-at: 0.3333;");
  assert.equal(radioSelectorModel(options(4), "v1", 180).style, "--strata-rotary-value: 0.3333; --strata-knob-sweep: 180;");
});

test("the Display's segments look is a data attribute on the display, for `true` and `seven` only", () => {
  assert.equal(isDisplaySegments(true), true);
  assert.equal(isDisplaySegments("seven"), true);
  for (const value of [false, undefined, "", "dot", 1]) assert.equal(isDisplaySegments(value), false, String(value));
  assert.deepEqual(displayAttributes({ segments: true }), { "data-strata-form": "display", "data-strata-segments": "seven" });
  assert.deepEqual(displayAttributes({ segments: false }), { "data-strata-form": "display" });
  assert.deepEqual(displayAttributes({}), { "data-strata-form": "display" });
});

test("the tokens: wheel.sweep, wheel.ridges, display.segments.ghost and font.segments are declared, validated and written as variables", () => {
  assert.deepEqual(validateTokens(strataTokens), []);
  const sheet = tokensToCss(strataTokens);
  for (const name of ["--strata-wheel-sweep: 150;", "--strata-wheel-ridges: 12;", "--strata-display-segments-ghost: 0.14;"]) assert.ok(sheet.includes(name), name);
  assert.match(sheet, /--strata-font-segments: "Strata Segments", ui-monospace, monospace;/);
  assert.ok(strataTokens.wheel.sweep.$extensions["dev.underglass.strata"].max <= 180, "a pose never passes 90 degrees either side");
});

test("the segments font: a valid TrueType file under 30 KB, one 600-unit advance for every glyph, every digit and the letters it claims, the digit centred on the line box", () => {
  const bytes = segmentsFont();
  assert.ok(bytes.length < 30 * 1024, `${bytes.length} bytes`);
  assert.deepEqual(segmentsFont(), bytes, "deterministic");
  const font = create(Buffer.from(bytes));
  assert.equal(font.familyName, SEGMENTS_FAMILY);
  assert.equal(font.unitsPerEm, 1000);
  assert.equal(font.numGlyphs, segmentCharacters.length + 1);
  assert.equal(font.ascent, SEGMENT_ASCENT);
  assert.equal(font.descent, -SEGMENT_DESCENT);
  // The digit's centre (350 units) is the line box's centre: (ascent - descent) / 2.
  assert.equal((SEGMENT_ASCENT - SEGMENT_DESCENT) / 2, 350);
  for (const character of segmentCharacters) {
    const glyph = font.glyphForCodePoint(character.codePointAt(0));
    assert.ok(glyph && glyph.id > 0, `a glyph for ${JSON.stringify(character)}`);
    assert.equal(glyph.advanceWidth, SEGMENT_ADVANCE, `${JSON.stringify(character)} advances one cell`);
    if (character !== " ") { const box = glyph.bbox; assert.ok(box.minX >= 80 && box.maxX <= 520 && box.minY >= 0 && box.maxY <= 700, `${character}: ${JSON.stringify(box)}`); }
  }
  for (const digit of "0123456789") assert.ok(segmentCharacters.includes(digit));
  for (const character of "AbCcdEFGHhIJLnoPqrStUuy-_=.: ") assert.ok(segmentCharacters.includes(character), character);
  assert.equal(segmentGlyph("m"), undefined, "no glyph for m: the code face draws it");
  assert.equal(font.glyphForCodePoint("m".codePointAt(0)).id, 0);
  // 8 has all seven segments, 1 two of them.
  assert.equal(segmentGlyph("8").length, 7);
  assert.equal(segmentGlyph("1").length, 2);
});

test("the seven segments are disjoint hexagons, and the ghost is all seven in a tile of the cell plus the letter spacing", () => {
  const inside = (polygon, [x, y]) => { let hit = false; for (let a = 0, b = polygon.length - 1; a < polygon.length; b = a++) { const [xa, ya] = polygon[a], [xb, yb] = polygon[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) hit = !hit; } return hit; };
  for (let x = 70; x <= 530; x += 2) for (let y = -5; y <= 705; y += 2) {
    const owners = segmentNames.filter(name => inside(segmentShapes[name], [x, y]));
    assert.ok(owners.length <= 1, `(${x}, ${y}) is in ${owners.join(", ")}`);
  }
  const ghost = segmentsGhost();
  assert.deepEqual([ghost.width, ghost.height], [680, 700]);
  assert.equal(ghost.path.split("M").length - 1, 7);
  assert.ok(segmentsGhostUrl().startsWith("url(\"data:image/svg+xml,%3Csvg"));
  const face = segmentsFontFace();
  assert.match(face, /^@font-face \{\n  font-family: "Strata Segments";[\s\S]*src: url\("data:font\/ttf;base64,[A-Za-z0-9+/=]+"\) format\("truetype"\);/);
});

test("the segments CSS: the face and size on the text, the ghost behind it from the display.segments.ghost token, and the preferences", () => {
  assert.match(css, /:where\(\.ug-display\[data-strata-segments\] \.ug-display__text\) \{[^}]*font-family: var\(--strata-font-segments\);[^}]*letter-spacing: var\(--_seg-space\);/);
  assert.match(css, /\.ug-display__window\)::before \{[^}]*opacity: var\(--strata-display-segments-ghost\);[^}]*mask: var\(--_ghost\)/);
  assert.ok(css.includes("--_ghost: __SEGMENTS_GHOST__;"), "the build writes the ghost tile in");
  assert.match(css, /@media \(prefers-contrast: more\) \{[^@]*\.ug-display\[data-strata-segments\] \.ug-display__window\)::before \{ opacity: 0\.18; \}/);
  // The font reaches the stylesheet the build writes.
  const build = readFileSync(new URL("../../packages/ui/scripts/build-css.mjs", import.meta.url), "utf8");
  assert.ok(build.includes("segmentsFontFace()") && build.includes("segmentsGhostUrl()"));
});

test("the wheel and selector CSS: a roller on the fader's track, radios as invisible overlays of at least 24 px on their prints, forced colours and disabled", () => {
  assert.match(css, /:where\(\.ug-fader--wheel\) \{[^}]*--strata-wheel-travel[^}]*--_pitch: calc\(3\.14159 \* var\(--_along\) \/ var\(--strata-wheel-ridges\)\);/);
  assert.match(css, /:where\(\.ug-fader--wheel \.ug-fader__carriage\) \{[^}]*left: calc\(50% - var\(--_along\) \/ 2\);/);
  assert.ok(css.includes(".ug-fader__carriage[data-strata-dome] :is(.ug-fader__grip, .ug-fader__ridges) { display: none; }"), "the print gives way to the part");
  assert.match(css, /:where\(\.ug-rotary__radio\) \{[^}]*width: max\(calc\(100% \+ 8px\), 24px\);[^}]*height: max\(calc\(100% \+ 8px\), 24px\);[^}]*opacity: 0;[^}]*pointer-events: auto;/);
  assert.ok(css.includes(":where(.ug-rotary__mark:has(.ug-rotary__radio:checked)) :where(.ug-rotary__text)"));
  assert.ok(css.includes("fieldset:disabled .ug-rotary--group .ug-rotary__dial { opacity: 1; }"), "forced colours: no dimming, GrayText instead");
});

// ---- The wheel's parts ----

const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
const light = { azimuth: 323, elevation: 41 };
const wheelAt = (profile, { x = 20, y = 20, scale = 1, t = 0.5, sweep = 150, ridges = 12, id = "gain", state = { hover: false, disabled: false } } = {}) => {
  const box = [x, y, 120, 46], slot = [x + 24, y + 20.5, 72, 5];
  return wheelObject({ id, box, slot, t, scale, sweep, ridges, state, light, relief: { rect: [x + 52, y + 10, 16, 26], height: 3, material: "knobCap" } }, profile);
};
const materials = { ...premiumMaterials, ...faderMaterials };
function sceneOf(objects, profiles) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 400, height: 320 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, 400, 320], radius: 12, height: 8, material: "matte" }], profiles, objects };
}

test("the wheel is a ridged roller and its index tooth, one pose about the roller's axis, from -sweep/2 to +sweep/2, on materials the fader already has", () => {
  const { profiles, profile } = registry();
  const object = wheelAt(profile, { t: 0.4 });
  assert.equal(object.t, 0.4);
  assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), ["carriage:faderChamfer", "grip:faderInk"]);
  assert.deepEqual(object.parts[0].pose, { from: { tilt: -75, axis: 90, pivot: [0, 0, 8] }, to: { tilt: 75, axis: 90, pivot: [0, 0, 8] } });
  assert.deepEqual(object.parts[1].pose, object.parts[0].pose);
  assert.deepEqual(object.parts[0].at, [80, 43, 0]);
  assert.equal(object.parts[1].caster, null);
  const [roller, index] = object.parts.map(part => profiles[part.profile]);
  assert.equal(roller.type, "extrude"); assert.equal(roller.width, 26); assert.equal(roller.outline.length, 24, "12 ridges, a valley and a peak each");
  assert.equal(index.width, 20); assert.equal(index.outline.length, 3);
  assert.equal(Object.keys(profiles).length, 2);
  // The relief the object falls back to is the roller's footprint.
  assert.deepEqual(object.relief, { face: "raised", rect: [72, 30, 16, 26], radius: 3, height: 3, material: "knobCap" });
  assert.deepEqual(wheelFootprint([44, 40.5, 72, 5], 1), [72, 30, 16, 26]);
  assert.equal(wheelRadius(1.6), 12.8);
  assert.equal(wheelHeight(1), round(16 + 0.14 + 0.1));
  // The sweep and the ridges are held to what a pose and a roller can do.
  assert.deepEqual([wheelSweep(400), wheelSweep(3), wheelSweep(NaN), wheelSweep(120)], [180, 10, 150, 120]);
  assert.deepEqual([wheelRidges(2), wheelRidges(99), wheelRidges(NaN), wheelRidges(11.6)], [6, 24, 12, 12]);
  assert.equal(wheelAt(profile, { sweep: 400 }).parts[0].pose.to.tilt, 90);
});

test("the roller lies on the face: no vertex is lower than the face at any angle of the whole turn, at every depth and ridge count", () => {
  for (const scale of [0.6, 1, 1.6]) for (const ridges of [6, 12, 24]) {
    const { profiles, profile } = registry();
    const object = wheelAt(profile, { scale, ridges });
    let lowest = Infinity;
    for (const part of object.parts) {
      const shape = profiles[part.profile];
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const vertices = posedVertices(part, shape, t);
        for (let at = 2; at < vertices.length; at += 3) lowest = Math.min(lowest, vertices[at]);
      }
    }
    assert.ok(lowest >= -1e-3, `scale ${scale}, ${ridges} ridges: lowest z ${lowest}`);
  }
});

test("a ridge is a tooth of the roller: the outline stays off the face at a valley, and the index tooth stands a hair proud of one", () => {
  const radius = 8, depth = 1.3 * (radius / wheelGeometry.radius), outline = wheelOutline(radius, 12, depth), index = wheelIndexOutline(radius, 12, depth);
  assert.ok(Math.min(...outline.map(point => point[1])) > 0.2, "the lowest point (a peak near the bottom) is a fraction of a px above the face");
  assert.ok(Math.max(...outline.map(point => point[1])) <= 2 * radius + 1e-9);
  const peak = outline[1], top = index[1];
  assert.ok(Math.hypot(top[0], top[1] - radius) > Math.hypot(peak[0], peak[1] - radius), "the index tooth is proud of the roller's");
  assert.equal(round(Math.hypot(top[0], top[1] - radius) - radius), 0.14);
});

test("the wheel's parts validate in a scene, are wound against their normals, and stay 0.5 px inside the input's box over the whole turn in every corner of the stage, at every depth", () => {
  const worst = {};
  for (const scale of [0.6, 1, 1.6]) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const reg = registry(), object = wheelAt(reg.profile, { scale, t });
    const frontier = containmentFrontier(object, reg.profiles), [, , w, h] = object.rect;
    for (const [e, f] of [[0, 0], [1920 - w, 0], [0, 1080 - h], [1920 - w, 1080 - h], [0, 540 - h / 2], [960 - w / 2, 0], [960 - w / 2, 540 - h / 2]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, reg.profiles, frontier, placement);
      assert.ok(result.contained, `depth scale ${scale}, t ${t}, at ${e},${f}: inset ${result.inset}`);
      worst[scale] = Math.min(worst[scale] ?? Infinity, round(result.inset));
    }
  }
  console.log(`wheel: closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  const { profiles, profile } = registry();
  const scene = validateInstrumentScene(sceneOf([wheelAt(profile), wheelAt(profile, { x: 200, y: 20, id: "pan", t: 1, sweep: 90, ridges: 8 })], profiles));
  assert.equal(scene.objects.length, 2);
  assert.ok(Object.keys(scene.materials).length <= 16);
  const wrong = [];
  for (const [name, shape] of Object.entries(profiles)) {
    const { positions: p, normals: n, indices } = profileGeometry(shape);
    for (let k = 0; k < indices.length; k += 3) {
      const [a, b, c] = [indices[k], indices[k + 1], indices[k + 2]];
      const e1 = [0, 1, 2].map(i => p[b * 3 + i] - p[a * 3 + i]), e2 = [0, 1, 2].map(i => p[c * 3 + i] - p[a * 3 + i]);
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if ([0, 1, 2].reduce((sum, i) => sum + cross[i] * (n[a * 3 + i] + n[b * 3 + i] + n[c * 3 + i]), 0) > 1e-9) { wrong.push(name); break; }
    }
  }
  assert.deepEqual(wrong, []);
});

test("the roller's caster is the footprint at a height capped so its shadow stays in the box (the 10 px margin across the track), the same at every depth the cap binds", () => {
  const { profile } = registry();
  for (const scale of [0.6, 1, 1.6]) {
    const caster = wheelAt(profile, { scale }).parts[0].caster;
    assert.ok(caster, `scale ${scale}`);
    assert.ok(caster.height <= wheelRadius(scale) + 1e-9);
    assert.equal(caster.radius, 3);
    assert.deepEqual(caster.rect, wheelFootprint([44, 40.5, 72, 5], scale));
  }
  assert.equal(wheelAt(profile, { scale: 1 }).parts[0].caster.height, 3.31);
});
