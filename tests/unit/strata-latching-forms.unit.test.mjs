/**
 * The latching forms of the Checkbox, the RadioGroup and the SegmentedControl (anatomy pages `checkbox.md`, `radio.md`,
 * `segmented-control.md`, *Latching forms*): their names and the native `form` rule (`shared/latching-forms.ts`), the markup, the
 * box and the numbers a key takes from its native state, the Relief and Objects plinth entries (`gpu/push-forms.ts`) and the
 * Instrument parts of a Checkbox's key, a bank key and a bank's plinth (`gpu/instrument-push.ts`) checked with core's own
 * validator and containment check (`packages/core/src/instrument.ts`), and the stylesheet's rules for the states the numbers come from.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { BANK_FIELDSET_PAD, BANK_LED_ROOM, BANK_MARGIN, BANK_PLINTH_PAD, FLUSH_FORM, LATCH_HALO, LATCH_MIXED, bankForm, bankMarkup, checkboxMarkup, latchBox, latchForm, latchNumbers, nativeForm } from "../../packages/ui/src/shared/latching-forms.ts";
import { PUSH_GAP, PUSH_LATCHED, PUSH_RIM, PUSH_RING, pushMarkup, ringEmitter } from "../../packages/ui/src/shared/push-button.ts";
import { lensEmitter } from "../../packages/ui/src/shared/lamp.ts";
import { pushFormEntries } from "../../packages/ui/src/gpu/push-forms.ts";
import { BANK_PLINTH, bankPlinthHeight, bankPlinthObject, pushMaterialsOf, pushMaterials, pushObject } from "../../packages/ui/src/gpu/instrument-push.ts";
import { premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";

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
const light = { azimuth: 323, elevation: 41 };
const indicator = { small: 16, medium: 20, large: 24 };

test("the forms are named per control, flush and any other string never become the wrong thing, and the native form owner survives", () => {
  assert.equal(latchForm("latching"), "latching");
  assert.equal(latchForm("flush"), undefined);
  assert.equal(latchForm("bank"), undefined, "a Checkbox or a SegmentedControl has no `bank`");
  assert.equal(latchForm(undefined), undefined);
  assert.equal(bankForm("bank"), "bank");
  assert.equal(bankForm("latching"), undefined, "a RadioGroup has no `latching`");
  assert.equal(bankForm("selector"), undefined, "the `selector` form is a later change: it is the native form owner's id for now");
  assert.equal(FLUSH_FORM, "flush");
  // The native `form` attribute: any string that is not one of this control's names or `flush`, as before.
  assert.equal(nativeForm("settings", "latching"), "settings");
  assert.equal(nativeForm("settings", "bank"), "settings");
  assert.equal(nativeForm("flush", "latching"), undefined, "flush is reserved, never a form owner");
  assert.equal(nativeForm("latching", "latching"), undefined);
  assert.equal(nativeForm("bank", "bank"), undefined);
  assert.equal(nativeForm("selector", "bank"), "selector");
  assert.equal(nativeForm(undefined, "bank"), undefined);
  assert.equal(nativeForm(3, "bank"), undefined);
});

test("a Checkbox's key is the push button's bezel, socket and ring; a bank key's object is its LED's socket and lens", () => {
  assert.deepEqual(checkboxMarkup.map(part => part.className), ["ug-push__bezel", "ug-push__socket", "ug-push__ring"]);
  assert.deepEqual(checkboxMarkup.map(part => part.face), ["raised", undefined, undefined]);
  assert.deepEqual(bankMarkup.map(part => part.className), ["ug-push__led-socket", "ug-push__led"]);
  const push = pushMarkup("latching").map(part => part.className);
  for (const part of [...checkboxMarkup, ...bankMarkup]) assert.ok(push.includes(part.className), `${part.className} is the push button's own class`);
});

test("a Checkbox's box is its cap plus 22 px, at least the target size; a bank key's room is 6 round the cap and 14 above", () => {
  assert.equal(LATCH_HALO, 4);
  assert.equal(2 * (PUSH_GAP + PUSH_RING + PUSH_RIM + LATCH_HALO), 22);
  assert.deepEqual(Object.values(indicator).map(latchBox), [38, 42, 46]);
  for (const cap of Object.values(indicator)) assert.ok(latchBox(cap) >= 24, "WCAG 2.5.8");
  assert.deepEqual([BANK_MARGIN, BANK_LED_ROOM, BANK_PLINTH_PAD, BANK_FIELDSET_PAD], [6, 14, 2, 8]);
  // The stylesheet writes the same numbers: the Checkbox's halo, a bank key's padding (14 above, 6 round) and the plinth's and group's.
  assert.match(css, /:where\(\.ug-latch--key\) \{\s*--_cap: var\(--strata-indicator\);\s*--_halo: 4px;/);
  assert.match(css, /padding: calc\(var\(--_halo\) \+ 9px\) 6px 6px;/);
  assert.match(css, /:where\(\.ug-bank__plinth\) \{[^}]*padding: 2px;/s);
  assert.match(css, /\.ug-segmented\[data-strata-form="latching"\]\) \{ box-sizing: border-box; max-width: 100%; padding: 8px; \}/);
});

test("the key takes its numbers from its native state: checked, mixed, held, disabled", () => {
  assert.deepEqual(latchNumbers({ checked: false }), { lit: 0, led: 0, t: 0 });
  assert.deepEqual(latchNumbers({ checked: true }), { lit: 1, led: 1, t: PUSH_LATCHED });
  assert.equal(PUSH_LATCHED, 0.45);
  assert.deepEqual(latchNumbers({ checked: false, indeterminate: true }), { lit: 0.5, led: 0.5, t: 0.2 });
  assert.deepEqual(LATCH_MIXED, { t: 0.2, lit: 0.5 });
  assert.deepEqual(latchNumbers({ checked: false, held: true }), { lit: 1, led: 0, t: 1 }, "held: the ring lit and the cap all the way down");
  assert.deepEqual(latchNumbers({ checked: true, held: true }), { lit: 1, led: 1, t: 1 });
  assert.deepEqual(latchNumbers({ checked: true, disabled: true }), { lit: 0, led: 0, t: 0.45 }, "a selected disabled key stays down, unlit");
  assert.deepEqual(latchNumbers({ checked: false, disabled: true }), { lit: 0, led: 0, t: 0 });
  assert.deepEqual(latchNumbers({ checked: false, held: true, disabled: true }), { lit: 0, led: 0, t: 0 }, "a disabled key is never held");
});

test("the stylesheet sets the numbers for a checkbox's mixed state only: a radio is :indeterminate while its group has nothing selected", () => {
  assert.match(css, /:where\(\.ug-latch:has\(> \.ug-checkbox__input:indeterminate\)\) \{ --strata-lit: 0\.5; --strata-led: 0\.5; --strata-push-t: 0\.2; \}/);
  assert.doesNotMatch(css, /\.ug-latch:has\(> input:indeterminate\)/, "no rule treats an empty radio group as mixed");
  assert.match(css, /:where\(\.ug-latch:has\(> input:checked\)\) \{ --strata-lit: 1; --strata-led: 1; --strata-push-t: 0\.45; \}/);
  assert.match(css, /:where\(\.ug-latch:has\(> input:disabled\)\) \{ --strata-lit: 0; --strata-led: 0; --strata-push-t: 0; \}/);
  assert.match(css, /\.ug-latch > :is\(\.ug-checkbox__input, \.ug-radio__input, \.ug-segmented__input\) \{[^}]*border-radius: 0;[^}]*opacity: 0;/s, "the input is a square, invisible overlay: its hit area is the key's whole box");
  // The push button's CSS reads its halo from a variable now, and its numbers are the ones it had: a 5 px halo, 12 px of padding.
  assert.match(css, /--_halo: 5px;/);
  assert.match(css, /padding: calc\(var\(--_halo\) \+ 7px\);/);
});

/** A Checkbox's key of cap `cap` at `at`: the boxes as the CSS lays them out (box = cap + 22 each way), the corner radii as laid out. */
function keyAt(profile, { at = [10, 10], cap = 20, scale = 1, t = 0, emitters = { ring: 0 }, role = "#f5a524", opaque = false } = {}) {
  const [x, y] = at, size = latchBox(cap), box = [x, y, size, size], inset = by => [x + by, y + by, size - 2 * by, size - 2 * by];
  const radius = 4;
  return pushObject({ id: `key-${cap}`, form: "latching", box, bezel: inset(LATCH_HALO), ring: inset(LATCH_HALO + PUSH_RIM), cap: inset(LATCH_HALO + PUSH_RIM + PUSH_RING + PUSH_GAP),
    radii: { box: radius + LATCH_HALO + 7, bezel: radius + 7, ring: radius + 2.6, cap: radius }, scale, role, emitters, t, material: "key #eceef2", opaque,
    state: { hover: false, pressed: false, disabled: false }, light, relief: { height: 3, material: "keyCap" } }, profile);
}
/** A bank of `labels` widths on a plinth at `at`: the group's box, the plinth, and each key's object (box, cap and LED as laid out) standing on the plinth. */
function bankAt(profile, widths, { at = [10, 10], cap = 34, scale = 1, selected = 1, role = "#f5a524", opaque = false } = {}) {
  const [x, y] = at, keyH = cap + BANK_LED_ROOM + BANK_MARGIN, width = widths.reduce((total, w) => total + w + 2 * BANK_MARGIN, 0);
  const plinth = [x + BANK_FIELDSET_PAD, y + BANK_FIELDSET_PAD, width + 2 * BANK_PLINTH_PAD, keyH + 2 * BANK_PLINTH_PAD], group = [x, y, plinth[2] + 2 * BANK_FIELDSET_PAD, plinth[3] + 2 * BANK_FIELDSET_PAD];
  const floor = bankPlinthHeight(scale);
  const plinthObject = bankPlinthObject({ id: "bank", box: group, plinth, radius: 14, scale, state: { hover: false, pressed: false, disabled: false }, light, relief: { height: 3, material: "keyCap" } }, profile);
  let left = plinth[0] + BANK_PLINTH_PAD;
  const keys = widths.map((w, index) => {
    const box = [left, plinth[1] + BANK_PLINTH_PAD, w + 2 * BANK_MARGIN, keyH];
    left += box[2];
    return pushObject({ id: `key-${index}`, form: "latching", box, cap: [box[0] + BANK_MARGIN, box[1] + BANK_LED_ROOM, w, cap], led: [box[0] + box[2] / 2 - 3, box[1] + 4.2, 6, 6],
      radii: { box: 0, cap: 8 }, base: floor, scale, role, emitters: { led: index }, t: index === selected ? PUSH_LATCHED : 0, material: "key #eceef2", opaque,
      state: { hover: false, pressed: index === selected, disabled: false }, light, relief: { height: 3, material: "keyCap" } }, profile);
  });
  return { group, plinth, plinthObject, keys, floor };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
const sceneOf = (objects, profiles, materials, emitters) => ({ format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
  extent: { width: 520, height: 320 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
  shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 }, focus: { colour: "#2563eb", width: 3, offset: 0.5 },
  materials: { matte: { base: { roughness: 0.6 } }, keyCap: premiumMaterials.keyCap, "key #eceef2": { base: { colour: "#eceef2", roughness: 0.45 } }, ...materials },
  primitives: [{ face: "raised", rect: [0, 0, 520, 320], radius: 12, height: 8, material: "matte" }], profiles, objects, emitters, protected: [[20, 20, 100, 20]], feather: 4 });

test("a Checkbox's key is the push button's parts on a square: bezel, ring, body and captured cap, with the corner radii as laid out", () => {
  const { profiles, profile } = registry();
  const key = keyAt(profile, { t: PUSH_LATCHED, emitters: { ring: 0 } });
  assert.deepEqual(key.parts.map(part => `${part.kind}:${part.material}`), ["bezel:pushBezel", "lens:lens #f5a524", "plinth:key #eceef2", "cap:keyCap"], "no LED part: the ring is the light");
  assert.deepEqual(key.parts.map(part => part.emitter), [undefined, 0, undefined, undefined]);
  assert.deepEqual(key.parts[2].pose, { from: { travel: 0 }, to: { travel: -4 } });
  assert.deepEqual(key.parts[3].pose, key.parts[2].pose);
  assert.equal(key.t, 0.45);
  const shape = name => Object.values(profiles).find((_, index) => Object.keys(profiles)[index].startsWith(`${name}:`));
  assert.equal(shape("push-bezel").radius, 11, "the bezel's corner is the cap's 4 plus 7 of metal");
  assert.equal(shape("push-ring").radius, 6.6);
  assert.equal(shape("push-body").radius, 4);
  assert.equal(shape("push-cap").radius, 2.8, "the captured cap 1.2 inside the body's");
  assert.deepEqual(key.bounds, { rect: key.rect, radius: 15 });
  // The push button's own objects keep their stadiums: with no radii every part is one.
  const { profile: other } = registry();
  const button = pushObject({ id: "b", form: "momentary", box: [0, 0, 64, 64], bezel: [5, 5, 54, 54], ring: [9.4, 9.4, 45.2, 45.2], cap: [12, 12, 40, 40], scale: 1, role: "#f5a524", emitters: { ring: 0 }, t: 0, material: "key #eceef2",
    state: { hover: false, pressed: false, disabled: false }, light, relief: { height: 3, material: "keyCap" } }, other);
  assert.deepEqual(button.bounds, { rect: [0, 0, 64, 64], radius: 32 });
  // Core's validator takes the scene.
  const emitters = [ringEmitter([30, 30], 20, 1, "#f5a524")];
  const scene = validateInstrumentScene(sceneOf([key], profiles, { ...pushMaterialsOf({ role: "#f5a524" }), pushBezel: pushMaterials.pushBezel }, emitters));
  assert.equal(scene.objects.length, 1);
  assert.equal(emitters[0].strength, round(2400 * (20 / 40) ** 2));
});

test("every vertex of a Checkbox's key stays 0.5 px inside its box over the whole stage, at every depth and size", () => {
  const worst = {};
  for (const [size, cap] of Object.entries(indicator)) for (const scale of [0.6, 1, 1.6]) {
    const { profiles, profile } = registry();
    const object = keyAt(profile, { cap, scale, emitters: { ring: 0 } });
    const frontier = containmentFrontier(object, profiles), boxSize = object.rect[2];
    for (const [e, f] of [[0, 0], [1920 - boxSize, 0], [0, 1080 - boxSize], [1920 - boxSize, 1080 - boxSize], [0, 540 - boxSize / 2], [960 - boxSize / 2, 0]]) {
      const result = checkContainment(object, profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 });
      assert.ok(result.contained, `${size} key, depth scale ${scale}, at ${e},${f}: inset ${result.inset} (part ${result.part})`);
      worst[size] = Math.min(worst[size] ?? Infinity, round(result.inset));
    }
  }
  console.log(`closest vertex of a checkbox's key to its box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // A key whose halo were 3 px would not stay in (it was tried, and the bezel's edge came within 0.22 px at depth 1).
  const { profiles, profile } = registry();
  const tight = keyAt(profile, { scale: 1.6 });
  tight.bounds = { rect: [tight.rect[0] + 3, tight.rect[1] + 3, tight.rect[2] - 6, tight.rect[3] - 6], radius: 12 };
  const result = checkContainment(tight, profiles, containmentFrontier(tight, profiles), { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
  assert.equal(result.contained, false);
});

test("a bank key is a body and a captured cap on the plinth with an LED on it, the plinth one part, and all of them stay in their boxes", () => {
  const { profiles, profile } = registry();
  const bank = bankAt(profile, [54, 68, 60, 54]);
  const [first, second] = bank.keys;
  assert.deepEqual(first.parts.map(part => `${part.kind}:${part.material}`), ["plinth:key #eceef2", "cap:keyCap", "lens:lens #f5a524"], "no bezel and no ring");
  assert.deepEqual(first.parts.map(part => part.emitter), [undefined, undefined, 0]);
  assert.deepEqual(second.parts.map(part => part.emitter), [undefined, undefined, 1]);
  // The stack stands on the plinth's top (2.4 at 50% depth): the body on it, the captured cap on the body, the LED on it.
  assert.equal(BANK_PLINTH, 2.4);
  assert.deepEqual(first.parts.map(part => part.at[2]), [2.4, 7.4, 2.4]);
  assert.equal(second.t, 0.45);
  assert.equal(first.t, 0);
  assert.deepEqual(second.parts[0].pose, { from: { travel: 0 }, to: { travel: -4 } });
  assert.equal(first.parts[1].caster, null);
  assert.equal(first.parts[2].caster, null);
  // The plinth: one polished part whose bounds are the group's box, 2.4 high, inside it with its shadow.
  assert.deepEqual(bank.plinthObject.parts.map(part => `${part.kind}:${part.material}:${part.at[2]}`), ["bezel:pushBezel:0"]);
  assert.deepEqual(bank.plinthObject.bounds, { rect: bank.group, radius: 0 });
  assert.equal(bankPlinthHeight(1.6), 3.84);
  const materials = { ...pushMaterialsOf({ role: "#f5a524" }), pushBezel: pushMaterials.pushBezel };
  const emitters = bank.keys.map((_, index) => lensEmitter("led", [40 + index * 70, 24], 6, index === 1 ? 1 : 0, "#f5a524"));
  const scene = validateInstrumentScene(sceneOf([bank.plinthObject, ...bank.keys], profiles, materials, emitters));
  assert.equal(scene.objects.length, 5);
  assert.equal(scene.emitters.length, 4);
  // Containment: each key in its own box, the plinth in the group's, over the stage, at every depth.
  const worst = {};
  for (const scale of [0.6, 1, 1.6]) {
    const { profiles: shapes, profile: add } = registry();
    const made = bankAt(add, [54, 68, 60, 54], { scale });
    for (const [name, object] of [["plinth", made.plinthObject], ...made.keys.map((key, index) => [`key ${index}`, key])]) {
      const frontier = containmentFrontier(object, shapes), [boxW, boxH] = [object.rect[2], object.rect[3]];
      for (const [e, f] of [[0, 0], [1920 - boxW, 0], [0, 1080 - boxH], [1920 - boxW, 1080 - boxH], [960 - boxW / 2, 0]]) {
        const result = checkContainment(object, shapes, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [960, 540], distance: 2400 });
        assert.ok(result.contained, `${name}, depth scale ${scale}, at ${e},${f}: inset ${result.inset} (part ${result.part})`);
        worst[name] = Math.min(worst[name] ?? Infinity, round(result.inset));
      }
    }
  }
  console.log(`closest vertex of a bank's parts to their boxes, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
  // The casters keep every cast shadow inside the box (2.8 high, the plinth's with the group's padding).
  for (const scale of [0.6, 1, 1.6]) {
    const { profile: add } = registry();
    const made = bankAt(add, [54, 68, 60, 54], { scale });
    for (const object of [made.plinthObject, ...made.keys]) for (const part of object.parts.filter(entry => entry.caster)) {
      const [x, y, w, h] = part.caster.rect, [bx, by, bw, bh] = object.rect, a = (light.azimuth * Math.PI) / 180, e = (light.elevation * Math.PI) / 180;
      const reach = (part.caster.height * Math.hypot(Math.sin(a), Math.cos(a)) * Math.cos(e)) / Math.sin(e) + 1.5 * part.caster.height + 1;
      assert.ok(x - reach >= bx - 1 && x + w + reach <= bx + bw + 1 && y - reach >= by - 1 && y + h + reach <= by + bh + 1, `${part.kind}: a shadow of height ${part.caster.height} at depth ${scale} stays in the box`);
    }
  }
});

test("at Relief and Objects a bank's plinth is a raised face or a slab fitted to the group's box, and a bank key's cap stands on it with no bezel under it", () => {
  const element = names => ({ matches: selector => selector.split(",").some(part => names.includes(part.trim())), getAttribute: () => null });
  const group = [10, 10, 330, 100], plinth = [18, 18, 314, 84], cap = [30, 44, 60, 34], box = [24, 24, 72, 66];
  const state = { hover: false, pressed: false, disabled: false };
  const context = { rect: plinth, state, objects: false, base: 0, box: group, radius: 14, material: () => "satin", light, hoverHeight: 1.6, keyTravel: 6 };
  const relief = pushFormEntries(element([".ug-bank__plinth"]), context);
  assert.deepEqual(relief.map(entry => [entry.face, entry.radius, entry.material]), [["raised", 14, "satin"]]);
  assert.ok(relief[0].height > 0 && relief[0].height <= 2, `the plinth's height ${relief[0].height} is what its shadow lets stand in the group's room`);
  const objects = pushFormEntries(element([".ug-bank__plinth"]), { ...context, objects: true });
  assert.equal(objects[0].object, "slab");
  assert.equal(objects[0].base, 0);
  // The cap stands on the plinth's top (the helper passes `base` from the plinth), with no bezel to add to it.
  const standing = pushFormEntries(element([".ug-push__cap"]), { ...context, rect: cap, box, objects: true, base: round(objects[0].base + objects[0].height) });
  assert.equal(standing[0].object, "key");
  assert.equal(standing[0].base, round(objects[0].height), "a bank key has no bezel under it");
  // A cap's corner is its own radius, not a stadium; a push button's, with no radius given, is a stadium.
  assert.equal(pushFormEntries(element([".ug-push__cap"]), { ...context, rect: cap, box, radius: 8 })[0].radius, 8);
  assert.equal(pushFormEntries(element([".ug-push__cap"]), { ...context, rect: cap, box, radius: undefined })[0].radius, 17);
  // Nothing else is a part.
  assert.equal(pushFormEntries(element([".ug-other"]), context), undefined);
});
