/**
 * The RotarySelector and the PushButton forms (anatomy pages `rotary-selector.md`, `button.md`, `toggle-button.md`): the
 * selector's position and angle maths and markup model (`shared/rotary-selector.ts`), the push forms' names, markup, box, travel
 * and emitters (`shared/push-button.ts`), the Relief and Objects entries (`gpu/push-forms.ts`) and the Instrument parts
 * (`gpu/instrument-push.ts`, and the Knob's for the selector) checked with core's own validator and containment check
 * (`packages/core/src/instrument.ts`), with the lights validated by core's emitter format.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { rotaryAngle, rotaryDefaults, rotaryDrag, rotaryFraction, rotaryIndexAtAngle, rotaryMarkStyle, rotaryModel, rotaryNearest, rotaryStep, rotaryStyle } from "../../packages/ui/src/shared/rotary-selector.ts";
import { PUSH_GAP, PUSH_HALO, PUSH_LATCHED, PUSH_LED, PUSH_REFERENCE, PUSH_RIM, PUSH_RING, PUSH_ROOM, buttonPushForm, fittedRoundHeight, isPushForm, pushBox, pushCap, pushEmitterDefaults, pushForms, pushMarkup, pushPosition, pushSpring, pushTravel, ringEmitter, togglePushForm } from "../../packages/ui/src/shared/push-button.ts";
import { switchSpringCurve, shadowReach } from "../../packages/ui/src/shared/switch-forms.ts";
import { lensEmitter, lensColours } from "../../packages/ui/src/shared/lamp.ts";
import { pushFormEntries, pushReliefHeights } from "../../packages/ui/src/gpu/push-forms.ts";
import { pushHeight, pushHeights, pushMaterialsOf, pushObject } from "../../packages/ui/src/gpu/instrument-push.ts";
import { knobObject, premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";
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
const light = { azimuth: 323, elevation: 41 };

test("the selector's positions are spread evenly over the sweep, a lone option sits at the top, and a disabled one is skipped", () => {
  assert.equal(rotaryFraction(0, 5), 0);
  assert.equal(rotaryFraction(2, 5), 0.5);
  assert.equal(rotaryFraction(4, 5), 1);
  assert.equal(rotaryFraction(0, 1), 0.5, "a lone option sits at the middle of the sweep, the top");
  assert.deepEqual([0, 1, 2, 3, 4].map(index => rotaryAngle(index, 5)), [-135, -67.5, 0, 67.5, 135]);
  assert.equal(rotaryAngle(1, 3, 180), 0);
  const options = [{ value: "a", label: "A" }, { value: "b", label: "B" }, { value: "c", label: "C", disabled: true }, { value: "d", label: "D" }];
  // The nearest enabled option; a tie goes to the lower one; nothing enabled is -1.
  assert.equal(rotaryNearest(0.4, options), 0);
  assert.equal(rotaryNearest(1.6, options), 1);
  assert.equal(rotaryNearest(2, options), 1, "the disabled third is skipped; equally near, the lower");
  assert.equal(rotaryNearest(2.4, options), 3);
  assert.equal(rotaryNearest(5, options), 3);
  assert.equal(rotaryNearest(0, options.map(option => ({ ...option, disabled: true }))), -1);
  // Steps skip it too, and stop at the ends.
  assert.equal(rotaryStep(1, 1, options), 3);
  assert.equal(rotaryStep(3, -1, options), 1);
  assert.equal(rotaryStep(3, 1, options), 3);
  assert.equal(rotaryStep(0, -1, options), 0);
  // The angle on the dial: 0° at the top, clockwise; the bottom gap goes to the nearer end.
  const five = Array.from({ length: 5 }, (_, index) => ({ value: String(index), label: String(index) }));
  assert.deepEqual([-135, -67.5, 0, 67.5, 135].map(theta => rotaryIndexAtAngle(theta, five)), [0, 1, 2, 3, 4]);
  assert.equal(rotaryIndexAtAngle(-170, five), 0);
  assert.equal(rotaryIndexAtAngle(170, five), 4);
  assert.equal(rotaryIndexAtAngle(180, five), 0, "exactly at the bottom, +180° and −180° are one direction: the first, as the Knob's minimum");
  assert.equal(rotaryIndexAtAngle(-30, five), 2, "between positions the nearest");
  assert.equal(rotaryIndexAtAngle(-40, five), 1);
  assert.equal(rotaryIndexAtAngle(30 + 360, five), 2, "an angle past 180° is the same direction");
  // A drag: 200 px a full sweep, up is the next option, Shift ten times finer, clamped to the ends.
  assert.equal(rotaryDrag(0, -50, 5), 1);
  assert.equal(rotaryDrag(2, 100, 5), 0);
  assert.equal(rotaryDrag(0, 100, 5), 0);
  assert.equal(rotaryDrag(4, -100, 5), 4);
  assert.ok(Math.abs(rotaryDrag(2, -100, 5, { shift: true }) - 2.2) < 1e-9);
  assert.deepEqual(rotaryDefaults, { sweep: 270, dragPx: 200, fine: 0.1, tapSlop: 4, snap: 2 }, "the Knob's interaction tokens");
});

test("the model gives the root's and each mark's style, the selected option and the disabled ones", () => {
  assert.equal(rotaryStyle(1, 5), "--strata-rotary-value: 0.25;");
  assert.equal(rotaryStyle(2, 3, 180), "--strata-rotary-value: 1; --strata-knob-sweep: 180;");
  assert.equal(rotaryMarkStyle(1, 4), "--strata-rotary-at: 0.3333;");
  const model = rotaryModel({ options: [{ value: "lp", label: "LP" }, { value: "hp", label: "HP" }, { value: "bp", label: "BP", disabled: true }], value: "hp" });
  assert.equal(model.index, 1);
  assert.equal(model.style, "--strata-rotary-value: 0.5;");
  assert.deepEqual(model.marks.map(mark => [mark.value, mark.text, mark.style, mark.disabled, mark.selected]), [
    ["lp", "LP", "--strata-rotary-at: 0;", false, false], ["hp", "HP", "--strata-rotary-at: 0.5;", false, true], ["bp", "BP", "--strata-rotary-at: 1;", true, false]]);
  // A value that names no option, or none, selects the first enabled one.
  assert.equal(rotaryModel({ options: model.marks.map(mark => ({ value: mark.value, label: mark.text, disabled: mark.disabled })), value: "zz" }).index, 0);
  assert.equal(rotaryModel({ options: [{ value: "a", label: "A", disabled: true }, { value: "b", label: "B" }], value: undefined }).index, 1);
  assert.equal(rotaryModel({ options: [], value: undefined }).index, 0);
});

test("the sizes are tokens, the CSS takes them, and every part of both components is styled", () => {
  assert.deepEqual(Object.fromEntries(Object.entries(pushCap).map(([size]) => [size, strataTokens.size.push[size].$value])), { small: "32px", medium: "40px", large: "48px" });
  assert.deepEqual(Object.values(strataTokens.size.rotary).map(token => token.$value), ["48px", "64px", "80px"]);
  const stylesheet = tokensToCss(strataTokens);
  assert.match(stylesheet, /--strata-push-size: var\(--strata-size-push-medium\);/);
  assert.match(stylesheet, /--strata-rotary-size: var\(--strata-size-rotary-medium\);/);
  assert.match(stylesheet, /\[data-strata-size="large"\] \{[^}]*--strata-push-size: var\(--strata-size-push-large\);/);
  assert.match(stylesheet, /\[data-strata-size="small"\] \{[^}]*--strata-rotary-size: var\(--strata-size-rotary-small\);/);
  assert.equal(strataTokens.emitter.pushButton.radius.$value, pushEmitterDefaults.radius);
  assert.equal(strataTokens.emitter.pushButton.height.$value, pushEmitterDefaults.height);
  assert.equal(strataTokens.emitter.pushButton.strength.$value, pushEmitterDefaults.strength);
  assert.deepEqual(validateTokens(strataTokens), []);
  for (const part of ["tick", "text", "mark", "legend", "skirt", "cap", "pointer", "select", "label", "dial", "scale"]) assert.ok(css.includes(`.ug-rotary__${part}`), `ug-rotary__${part} is styled`);
  for (const part of [...pushMarkup("latching").map(entry => entry.className), "ug-push__cap", "ug-push__object"]) assert.ok(css.includes(`.${part}`), `${part} is styled`);
  // The narrow dial prints numbers and a legend; forced colours, more contrast and reduced motion are handled.
  assert.match(css, /@container \(max-width: calc\(104px \+ 7em\)\) \{[^]*?\.ug-rotary__legend\) \{ display: block; \}/);
  assert.match(css, /@media \(forced-colors: active\) \{[^]*?\.ug-push \.ug-push__ring \{ border: 1px solid ButtonText; background: Canvas; box-shadow: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n\s+:where\(\.ug-push\) \{ transition: none; \}/);
  assert.match(css, /@property --strata-led \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/);
  assert.match(css, /@property --strata-push-t \{ syntax: "<number>"; inherits: true; initial-value: 0; \}/);
  // The cap's throw is `spring.button`, sampled by `switchSpringCurve`, as the recipe's transition has it.
  assert.deepEqual(pushSpring, { stiffness: 1600, damping: 80 });
  const curve = switchSpringCurve(pushSpring);
  assert.ok(css.includes(`--strata-push-t ${curve.duration}ms ${curve.easing}`), "the CSS carries the spring's duration and easing");
});

test("the push forms: names, the form each component takes, the markup, the box, the travel and the cap's place", () => {
  assert.deepEqual(pushForms, ["momentary", "latching"]);
  assert.ok(isPushForm("momentary") && isPushForm("latching") && !isPushForm("settings") && !isPushForm(undefined));
  assert.equal(buttonPushForm("momentary"), "momentary");
  assert.equal(buttonPushForm("latching"), undefined, "a Button is momentary; `latching` is the native form owner's id there");
  assert.equal(buttonPushForm("settings"), undefined);
  assert.equal(togglePushForm("latching"), "latching");
  assert.equal(togglePushForm("momentary"), undefined);
  assert.deepEqual(pushMarkup("momentary"), [{ className: "ug-push__bezel", face: "raised" }, { className: "ug-push__socket" }, { className: "ug-push__ring" }]);
  assert.deepEqual(pushMarkup("latching").map(part => part.className), ["ug-push__bezel", "ug-push__socket", "ug-push__ring", "ug-push__led-socket", "ug-push__led"]);
  // The box is the cap plus 12 px a side (0.6 gap, 2 ring, 4.4 bezel, 5 halo): 64 at medium, every one at least 24.
  assert.equal(PUSH_ROOM, 24);
  assert.equal(2 * (PUSH_GAP + PUSH_RING + PUSH_RIM + PUSH_HALO), 24);
  assert.deepEqual(Object.values(pushCap).map(pushBox), [56, 64, 72]);
  assert.equal(PUSH_LED, 6);
  // Travel: 4 held, 1.8 latched, so 0.45 of the way when latched; a disabled button never moves.
  assert.deepEqual(pushTravel, { held: 4, latched: 1.8 });
  assert.equal(PUSH_LATCHED, 0.45);
  assert.equal(pushPosition({ held: false, latched: false, disabled: false }), 0);
  assert.equal(pushPosition({ held: true, latched: false, disabled: false }), 1);
  assert.equal(pushPosition({ held: false, latched: true, disabled: false }), 0.45);
  assert.equal(pushPosition({ held: true, latched: true, disabled: false }), 1);
  assert.equal(pushPosition({ held: true, latched: true, disabled: true }), 0);
  assert.deepEqual(pushHeights, { bezel: 3.2, ring: 0.5, cap: 6, label: 1, travel: 4 });
  assert.equal(pushHeight(1), round((3.2 + 0.5 + 6) + 0.1));
});

test("the ring's emitter: a point over the cap, scaled by the cap's square, unlit it keeps its place, and it is valid to core", () => {
  const lit = ringEmitter([100, 50], 40, 1, "#c42b2b");
  assert.deepEqual(lit.position, [100, 50, 12]);
  assert.equal(lit.strength, 2400);
  assert.equal(lit.radius, 160);
  assert.deepEqual(lit.colour, lensColours("#c42b2b").light);
  assert.equal(Math.max(...lit.colour), 1);
  assert.deepEqual([lit.reach, lit.face], ["outset", 1]);
  assert.equal(ringEmitter([0, 0], 40, 0, "#c42b2b").strength, 0);
  assert.equal(ringEmitter([0, 0], 40, 7, "#c42b2b").strength, 2400, "clamped");
  assert.equal(ringEmitter([0, 0], 48, 1, "#c42b2b").strength, round(2400 * (48 / PUSH_REFERENCE) ** 2));
  assert.equal(ringEmitter([0, 0], 32, 1, "#c42b2b", { radius: 2, height: 0.5, strength: 1000 }).radius, 64);
  const led = lensEmitter("led", [100, 20], 6, 1, "#c42b2b");
  assert.equal(led.strength, round(520 * (6 / 10) ** 2));
  assert.equal(validateEmitters([lit, led], "emitters").length, 2);
});

test("a tall enough shadow stays in the stadium: the round-end rule fits what the sides would let through", () => {
  const margins = { left: 5, right: 5, top: 5, bottom: 5 };
  const side = shadowReach(1.65, light);
  assert.ok(side.right <= 5 && side.bottom <= 5, "the per-side fit at 1.65");
  const fitted = fittedRoundHeight(2, margins, light);
  assert.ok(fitted < 1.65, `at the round ends 2 fits as ${fitted}`);
  // Along the light's direction the shadow's reach is |L.xy| / L.z · h + 1.5 h + 1, which must stay within the margin.
  const a = (light.azimuth * Math.PI) / 180, e = (light.elevation * Math.PI) / 180, k = Math.hypot(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e)) / Math.sin(e);
  assert.ok(fitted * (k + 1.5) + 1 <= 5 + 1e-9);
  assert.equal(fittedRoundHeight(1, margins, light), 1, "a lower wish is granted");
  assert.equal(fittedRoundHeight(4, { left: 12, right: 12, top: 12, bottom: 12 }, light), 4, "the cap's 12 px let 4 stand");
  assert.equal(fittedRoundHeight(2, { left: 0, right: 5, top: 5, bottom: 5 }, light), 0);
});

/** A version 4 scene around `objects`, with their lights, as the GPU helper writes it. */
function sceneOf(objects, profiles, materials, emitters) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 520, height: 320 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
    focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, keyCap: premiumMaterials.keyCap, "key #eceef2": { base: { colour: "#eceef2", roughness: 0.45 } }, ...materials },
    primitives: [{ face: "raised", rect: [0, 0, 520, 320], radius: 12, height: 8, material: "matte" }], profiles, objects, emitters, protected: [[20, 20, 100, 20]], feather: 4 };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };

/** A push button of cap height `cap` and cap width `width` at `at`: the boxes as the CSS lays them out (box = cap + 24 each way). */
function pushAt(profile, form, { at = [10, 10], cap = 40, width = cap, scale = 1, t = 0, emitters = { ring: 0 }, role = "#c42b2b", opaque = false } = {}) {
  const [x, y] = at, room = PUSH_ROOM, boxW = width + room, boxH = cap + room;
  const box = [x, y, boxW, boxH], inset = (box, by) => [box[0] + by, box[1] + by, box[2] - 2 * by, box[3] - 2 * by];
  const bezel = inset(box, PUSH_HALO), ring = inset(box, PUSH_HALO + PUSH_RIM), capBox = inset(box, PUSH_HALO + PUSH_RIM + PUSH_RING + PUSH_GAP);
  const led = form === "latching" ? [x + boxW / 2 - 3, y + 4.2, 6, 6] : undefined;
  return pushObject({ id: `${form}-${width}`, form, box, bezel, ring, cap: capBox, ...(led ? { led } : {}), scale, role, emitters, t, material: "key #eceef2", opaque, state: { hover: false, pressed: false, disabled: false },
    light, relief: { height: 3, material: "keyCap" } }, profile);
}

test("a push button is a polished bezel, a glass ring with its emitter, and a body with a captured cap that travel together; a latching one adds an LED", () => {
  const { profiles, profile } = registry();
  const momentary = pushAt(profile, "momentary"), latching = pushAt(profile, "latching", { at: [150, 10], emitters: { ring: 1, led: 2 }, t: 0.45 });
  assert.deepEqual(momentary.parts.map(part => `${part.kind}:${part.material}`), ["bezel:pushBezel", "lens:lens #c42b2b", "plinth:key #eceef2", "cap:keyCap"]);
  assert.deepEqual(latching.parts.map(part => part.kind), ["bezel", "lens", "plinth", "cap", "lens"]);
  assert.deepEqual(momentary.parts.map(part => part.emitter), [undefined, 0, undefined, undefined]);
  assert.deepEqual(latching.parts.map(part => part.emitter), [undefined, 1, undefined, undefined, 2]);
  assert.deepEqual(momentary.parts.map(part => part.glass), [undefined, "lens", undefined, undefined]);
  // The body and the cap go down 4 px (× depth) together; the cap is captured and casts nothing; the bezel and ring do not move.
  assert.deepEqual(momentary.parts[2].pose, { from: { travel: 0 }, to: { travel: -4 } });
  assert.deepEqual(momentary.parts[3].pose, momentary.parts[2].pose);
  assert.equal(momentary.parts[3].captured, true);
  assert.equal(momentary.parts[3].caster, null);
  assert.equal(momentary.parts[1].caster, null);
  assert.equal(momentary.parts[0].pose, undefined);
  assert.equal(momentary.parts[1].pose, undefined);
  assert.equal(latching.t, 0.45, "latched: 0.45 of the travel");
  assert.equal(pushAt(registry().profile, "momentary", { scale: 1.6 }).parts[2].pose.to.travel, -6.4, "the travel scales with depth");
  // The stack: the bezel 3.2 high, the ring 0.5 on it, the body on the ring, the captured cap on the body.
  assert.deepEqual(momentary.parts.map(part => part.at[2]), [0, 3.2, 3.7, 8.7]);
  assert.deepEqual(momentary.bounds, { rect: momentary.rect, radius: 32 });
  const materials = pushMaterialsOf({ role: "#c42b2b" });
  assert.deepEqual(Object.keys(materials), ["pushBezel", "lens #c42b2b"]);
  assert.equal(materials["lens #c42b2b"].glass.reflection, 1.5);
  assert.equal(pushMaterialsOf({ role: "#c42b2b", opaque: true })["lensOpaque #c42b2b"].glass, undefined);
  // Under reduced transparency the ring and the LED are opaque lacquer.
  const opaque = pushAt(registry().profile, "latching", { opaque: true, emitters: { ring: 0, led: 1 } });
  assert.deepEqual(opaque.parts.filter(part => part.kind === "lens").map(part => `${part.material}:${part.glass}`), ["lensOpaque #c42b2b:undefined", "lensOpaque #c42b2b:undefined"]);
  // Core's validator takes the scene: the parts, the emitters and the glass.
  const emitters = [ringEmitter([30, 30], 40, 1, "#c42b2b"), ringEmitter([170, 30], 40, 0, "#c42b2b"), lensEmitter("led", [193, 14], 6, 1, "#c42b2b")];
  const scene = validateInstrumentScene(sceneOf([momentary, latching], profiles, { ...materials, pushBezel: pushMaterialsOf({ role: "#c42b2b" }).pushBezel }, emitters));
  assert.equal(scene.objects.length, 2);
  assert.equal(scene.emitters.length, 3);
  assert.equal(scene.objects[1].parts[4].emitter, 2);
});

test("every vertex of a push button stays 0.5 px inside its box over the whole stage, held and at rest, at every depth, size and width", () => {
  const worst = {};
  for (const form of pushForms) for (const [size, cap] of Object.entries(pushCap)) for (const width of [cap, cap + 40, cap + 100]) for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = pushAt(profile, form, { cap, width, scale, emitters: { ring: 0, led: 1 } });
    const frontier = containmentFrontier(object, profiles);
    const [boxW, boxH] = [object.rect[2], object.rect[3]];
    for (const [e, f] of [[0, 0], [1920 - boxW, 0], [0, 1080 - boxH], [1920 - boxW, 1080 - boxH], [0, 540 - boxH / 2], [960 - boxW / 2, 0]]) {
      const placement = { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 };
      const result = checkContainment(object, profiles, frontier, placement);
      assert.ok(result.contained, `${form} ${size} ${width} wide, depth scale ${scale}, at ${e},${f}: inset ${result.inset} (part ${result.part})`);
      const key = `${form} ${size}`;
      worst[key] = Math.min(worst[key] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A button whose bezel stood on the box's edge would not stay in: the halo's 5 px is what keeps the parts in.
  const { profiles, profile } = registry();
  const tight = pushAt(profile, "momentary", { scale: 1.6 });
  tight.bounds = { rect: [tight.rect[0] + 6, tight.rect[1] + 6, tight.rect[2] - 12, tight.rect[3] - 12], radius: 26 };
  const result = checkContainment(tight, profiles, containmentFrontier(tight, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("the casters keep every cast shadow (2.8) inside the box, with the round ends counted", () => {
  for (const scale of [0.6, 1, 1.6]) for (const cap of Object.values(pushCap)) {
    const { profile } = registry();
    const object = pushAt(profile, "momentary", { cap, scale });
    const [bx, by, bw, bh] = object.rect;
    for (const part of object.parts.filter(entry => entry.caster)) {
      const { rect, height } = part.caster, reach = shadowReach(height, light);
      assert.ok(rect[0] - reach.left >= bx - 1e-6 && rect[0] + rect[2] + reach.right <= bx + bw + 1e-6 && rect[1] - reach.top >= by - 1e-6 && rect[1] + rect[3] + reach.bottom <= by + bh + 1e-6,
        `${part.kind} at depth ${scale}, cap ${cap}: a shadow of height ${height} stays in the box`);
    }
  }
});

test("at Relief and Objects the bezel and the cap are raised faces or a slab and a key, each as high as its shadow lets it stand in the button's box", () => {
  const box = [10, 10, 92, 64], bezelRect = [15, 15, 82, 54], capRect = [22, 22, 68, 40];
  const element = kind => ({ matches: selector => selector.split(",").some(part => part.trim() === `.ug-push__${kind}`), getAttribute: () => null });
  const context = (rect, over = {}) => ({ rect, state: {}, objects: false, base: 0, box, bezel: bezelRect, material: (_, face) => face, light, hoverHeight: 1.6, keyTravel: 6, ...over });
  assert.equal(pushFormEntries({ matches: () => false }, context(capRect)), undefined);
  const [bezelFace] = pushFormEntries(element("bezel"), context(bezelRect));
  assert.deepEqual([bezelFace.face, bezelFace.radius, bezelFace.material], ["raised", 27, "raised"]);
  assert.ok(bezelFace.height > 1 && bezelFace.height <= pushReliefHeights.bezel, `the bezel stands ${bezelFace.height}, its shadow in a 5 px margin`);
  const [capFace] = pushFormEntries(element("cap"), context(capRect));
  assert.deepEqual([capFace.face, capFace.radius, capFace.height, capFace.finish], ["raised", 20, pushReliefHeights.cap, true]);
  const [slab] = pushFormEntries(element("bezel"), context(bezelRect, { objects: true, base: 1 }));
  assert.deepEqual([slab.object, slab.base, slab.radius], ["slab", 1, 27]);
  assert.ok(slab.taper <= slab.height);
  const [key] = pushFormEntries(element("cap"), context(capRect, { objects: true, base: 1 }));
  assert.equal(key.object, "key");
  assert.ok(key.height <= pushReliefHeights.key && key.height >= 2, `the key stands ${key.height}, its shadow in a 12 px margin`);
  assert.ok(key.travel <= key.height * 0.75 && key.travel > 0);
  assert.ok(key.base > 1, "the key stands on the bezel's top");
  // Hover stands the shadow at the lifted height: lower parts, so it stays in.
  const [hovered] = pushFormEntries(element("cap"), context(capRect, { state: { hover: true } }));
  assert.ok(hovered.height * 1.6 <= pushReliefHeights.cap * 1.6 + 1e-9);
  // Crowded by the box, the bezel is lowered; an empty rect gives nothing.
  const [crowded] = pushFormEntries(element("bezel"), context(bezelRect, { box: [13, 13, 86, 58] }));
  assert.ok(crowded.height < bezelFace.height);
  assert.deepEqual(pushFormEntries(element("cap"), context([22, 22, 0, 0])), []);
  assert.equal(pushFormEntries(element("cap"), context(capRect, { state: { pressed: true } }))[0].state.pressed, true, "a pressed cap sinks");
});

test("a rotary selector is the Knob's object: its pointer turns through the sweep, its box the select's, contained over the stage", () => {
  const { profiles, profile } = registry();
  const box = [10, 10, 208, 160];
  const object = knobObject({ id: "filter", box, skirt: 64, cap: 52, t: 0.5, sweep: 270, scale: 1, state: { hover: false, disabled: false }, relief: { height: 3, material: "knobCap" } }, profile);
  assert.deepEqual(object.parts.map(part => `${part.kind}:${part.material}`), ["skirt:knobSkirt", "cap:knobCap", "chamfer:knobChamfer", "pointer:knobInk"]);
  assert.deepEqual(object.parts[3].pose, { from: { turn: -225 }, to: { turn: 45 } });
  assert.equal(object.t, 0.5);
  assert.deepEqual(object.bounds.rect, box);
  const scene = validateInstrumentScene(sceneOf([object], profiles, { knobSkirt: premiumMaterials.knobSkirt, knobCap: premiumMaterials.knobCap, knobChamfer: premiumMaterials.knobChamfer, knobInk: premiumMaterials.knobInk }, undefined));
  assert.equal(scene.objects[0].parts.length, 4);
  // One detent per option: `t` takes the options' fractions, so the pointer stands on each position's angle.
  for (const [index, angle] of [[0, -135], [1, -67.5], [2, 0], [3, 67.5], [4, 135]]) {
    const turn = -225 + rotaryFraction(index, 5) * 270;
    assert.equal(turn + 90, angle, `option ${index}: the pointer's turn is its position's angle (the pointer is built along +x)`);
  }
  for (const scale of [0.6, 1, 1.6]) {
    const registered = registry(), tall = knobObject({ id: "filter", box, skirt: 64, cap: 52, t: 1, sweep: 270, scale, state: { hover: false, disabled: false }, relief: { height: 3, material: "knobCap" } }, registered.profile);
    const frontier = containmentFrontier(tall, registered.profiles);
    for (const [e, f] of [[0, 0], [1920 - 208, 0], [0, 1080 - 160], [1920 - 208, 1080 - 160]]) {
      assert.ok(checkContainment(tall, registered.profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 }).contained, `depth scale ${scale} at ${e},${f}`);
    }
  }
});
