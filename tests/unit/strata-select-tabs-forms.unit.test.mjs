/**
 * The Select forms and the Tabs' rail form (anatomy pages `select.md`, `tabs.md`, section 11): the form names and the rule that decides what a Select
 * is drawn as (`shared/select-forms.ts`), the step through a list's enabled options, the options of a server-rendered `<option>` run, the rail's names and
 * markup (`shared/tabs-forms.ts`), the cap's Relief and Objects entries (the bank's key, `gpu/push-forms.ts`, the tab's state from `gpu/tabs-forms.ts`) and the
 * Instrument parts of the plinth and the keys (the bank's construction, `gpu/instrument-bank.ts`, `gpu/instrument-push.ts`) checked with core's own validator and
 * containment check (`packages/core/src/instrument.ts`), with the lights validated by core's emitter format; and that a rail tab and a bank key are one construction.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { SELECTOR_MAX_LABEL, SELECTOR_MAX_OPTIONS, optionLabel, parseOptionsHtml, selectForm, selectFormFor, selectOwner, selectStepIndex, selectSteps, selectorModel } from "../../packages/ui/src/shared/select-forms.ts";
import { TABS_FLUSH, TAB_LATCHED, tabCap, tabLed, tabsForm } from "../../packages/ui/src/shared/tabs-forms.ts";
import { tabPosition, tabState } from "../../packages/ui/src/gpu/tabs-forms.ts";
import { pushFormEntries, pushReliefHeights } from "../../packages/ui/src/gpu/push-forms.ts";
import { BANK_PLINTH as RAIL_PLINTH, bankPlinthHeight as railPlinthHeight, bankPlinthObject, pushMaterials, pushMaterialsOf, pushObject } from "../../packages/ui/src/gpu/instrument-push.ts";
import { addBankKey, addBankPlinth, bankHeight } from "../../packages/ui/src/gpu/instrument-bank.ts";
import { createKeyRegistry } from "../../packages/ui/src/gpu/instrument-keys.ts";
import { INDICATOR_LENS, indicatorOf } from "../../packages/ui/src/gpu/indicator-forms.ts";
import { lensEmitter } from "../../packages/ui/src/shared/lamp.ts";
import { premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment } = await import("../../packages/core/src/instrument.ts");
const sourceImportsDone = sourceImports.deregister();
void sourceImportsDone;

const light = { azimuth: 323, elevation: 41 };
const options = labels => labels.map(label => ({ value: label.toLowerCase(), label }));

test("the Select's form names: selector and display are drawn forms, flush and any other string are not, and only a string that is no form name is a form owner", () => {
  assert.equal(selectForm("selector"), "selector");
  assert.equal(selectForm("display"), "display");
  for (const other of ["flush", "knob", "owner", "", undefined, null, 3]) assert.equal(selectForm(other), undefined);
  assert.equal(selectOwner("owner-form"), "owner-form");
  for (const reserved of ["flush", "selector", "display", undefined, null, 5]) assert.equal(selectOwner(reserved), undefined);
});

test("the rule: up to eight short options without an optgroup are a selector, anything else a display, and a list box is never drawn", () => {
  const eight = options(["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.equal(SELECTOR_MAX_OPTIONS, 8);
  assert.equal(SELECTOR_MAX_LABEL, 12);
  assert.equal(selectFormFor("selector", { options: eight }), "selector", "eight options fit");
  assert.equal(selectFormFor("selector", { options: [...eight, { value: "i", label: "I" }] }), "display", "nine do not");
  assert.equal(selectFormFor("selector", { options: options(["Short", "Twelve chars"]) }), "selector", "twelve characters fit");
  assert.equal(selectFormFor("selector", { options: options(["Short", "Thirteen char"]) }), "display", "thirteen do not");
  assert.equal(selectFormFor("selector", { options: eight, grouped: true }), "display", "an optgroup is a display");
  assert.equal(selectFormFor("selector", {}), "display", "options a binding cannot read are a display");
  assert.equal(selectFormFor("selector", { options: [] }), "display", "no option is a display");
  assert.equal(selectFormFor("display", { options: eight }), "display");
  assert.equal(selectFormFor("display", { options: [...eight, ...eight], grouped: true }), "display", "a display takes any list");
  assert.equal(selectFormFor("selector", { options: eight, list: true }), undefined, "a list box is the flush control");
  assert.equal(selectFormFor("display", { options: eight, list: true }), undefined);
  assert.equal(selectFormFor(undefined, { options: eight }), undefined);
});

test("the selector's model is the RotarySelector's, for the Select's options and value", () => {
  const model = selectorModel(options(["Sine", "Saw", "Square"]), "saw");
  assert.equal(model.index, 1);
  assert.equal(model.style, "--strata-rotary-value: 0.5;");
  assert.deepEqual(model.marks.map(mark => [mark.value, mark.text, mark.selected, mark.style]), [["sine", "Sine", false, "--strata-rotary-at: 0;"], ["saw", "Saw", true, "--strata-rotary-at: 0.5;"], ["square", "Square", false, "--strata-rotary-at: 1;"]]);
  assert.equal(selectorModel(options(["A", "B"]), "missing").index, 0, "a value that matches none is the first option");
  assert.equal(selectorModel(options(["A", "B"]), "a", 200).style, "--strata-rotary-value: 0; --strata-knob-sweep: 200;");
});

test("a step goes to the next enabled option and stops at the ends", () => {
  const disabled = [false, false, true, false, true];
  assert.equal(selectStepIndex(0, 1, disabled), 1);
  assert.equal(selectStepIndex(1, 1, disabled), 3, "a disabled option is skipped");
  assert.equal(selectStepIndex(3, 1, disabled), 3, "the last enabled option stays");
  assert.equal(selectStepIndex(3, -1, disabled), 1);
  assert.equal(selectStepIndex(1, -1, disabled), 0);
  assert.equal(selectStepIndex(0, -1, disabled), 0, "no wrap");
  assert.deepEqual(selectSteps.map(step => step.step), [-1, 1]);
  assert.match(selectSteps[0].className, /--previous/);
  assert.match(selectSteps[1].className, /--next/);
});

test("the options of a server-rendered run: values, labels, disabled and selected, optgroups, and what cannot be read", () => {
  assert.deepEqual(parseOptionsHtml('<option value="a">One</option>\n<option value=b selected>Two &amp; more</option><option disabled>  Three\n x </option>'),
    { options: [{ value: "a", label: "One" }, { value: "b", label: "Two & more" }, { value: "Three x", label: "Three x", disabled: true }], grouped: false, selected: "b" });
  const grouped = parseOptionsHtml('<optgroup label="G"><option value="a">One</option></optgroup><optgroup label="H"><option value="b">Two</option></optgroup>');
  assert.equal(grouped.grouped, true);
  assert.deepEqual(grouped.options.map(option => option.value), ["a", "b"]);
  assert.equal(parseOptionsHtml('<option value="a"><b>One</b></option>'), undefined, "markup in an option is not plain text");
  assert.equal(parseOptionsHtml('<option value="a">One</option><span>x</span>'), undefined, "anything else among them is not readable");
  assert.deepEqual(parseOptionsHtml(""), { options: [], grouped: false });
  assert.equal(optionLabel("  a \n b  "), "a b");
});

test("the Tabs' form name: rail is drawn, flush and any other string are not", () => {
  assert.equal(tabsForm("rail"), "rail");
  for (const other of [TABS_FLUSH, "owner", "", undefined, 1]) assert.equal(tabsForm(other), undefined);
  assert.deepEqual([tabLed, tabCap], [{ className: "ug-tab__led", face: "knob" }, { className: "ug-tab__cap", face: "raised" }]);
  assert.equal(TAB_LATCHED, 0.45);
});

test("a rail LED is an indicator lens in its tab's box, drawn like every LED", () => {
  assert.ok(INDICATOR_LENS.includes(".ug-tab__led"));
  const make = (classes, parents = {}) => ({ matches: selector => selector.split(",").some(part => classes.includes(part.trim().slice(1))), closest: selector => parents[selector] ?? null });
  const tabs = make(["ug-tabs"]), tab = make(["ug-tab"]);
  const place = indicatorOf(make(["ug-tab__led"], { ".ug-tabs": tabs, ".ug-tab": tab }));
  assert.deepEqual(place, { kind: "tab", root: tabs, control: tab, box: tab, tight: true, emitter: "led" });
  assert.equal(indicatorOf(make(["ug-tab__led"], {})), undefined, "outside a Tabs it is nothing");
});

/** An element for the cap's entries: it matches `.ug-tab__cap`. */
const capElement = { matches: selector => selector.split(",").some(part => part.trim() === ".ug-tab__cap"), getAttribute: () => null };
const tabElement = (matches = () => false) => ({ getAttribute: () => null, matches });
const context = (overrides = {}) => { const { matches, ...rest } = overrides; return { rect: [10, 22, 80, 40], radius: 6, state: tabState(tabElement(matches)), box: [4, 4, 92, 64], objects: false, base: 2.4, material: () => "control", light, hoverHeight: 1.6, keyTravel: 6, ...rest }; };

test("a rail cap is a raised face at Relief and a key on the plinth at Objects, as a bank key is, fitted to its tab's box, pressed while selected", () => {
  assert.equal(pushFormEntries({ matches: () => false }, context()), undefined, "an element that is not a cap is left to the helper");
  assert.deepEqual(pushFormEntries(capElement, context({ rect: [10, 22, 0, 40] })), [], "an empty cap gives no entries");
  const [face] = pushFormEntries(capElement, context());
  assert.equal(face.face, "raised");
  assert.deepEqual(face.rect, [10, 22, 80, 40]);
  assert.ok(face.height > 0 && face.height <= pushReliefHeights.cap, `the face stands ${face.height}`);
  assert.equal(face.finish, true);
  const [key] = pushFormEntries(capElement, context({ objects: true }));
  assert.equal(key.object, "key");
  assert.equal(key.base, 2.4, "the key stands on the plinth's top");
  assert.ok(key.height > 0 && key.height <= pushReliefHeights.key && key.travel > 0 && key.travel <= 0.75 * key.height);
  // Selected: pressed, at Relief and Objects. A hovered tab lifts, and its shadow is fitted at that height.
  const selected = pushFormEntries(capElement, context({ matches: selector => selector.includes("aria-selected") }))[0];
  assert.equal(selected.state.pressed, true);
  assert.equal(face.state.pressed, false);
  assert.equal(pushFormEntries(capElement, context({ matches: selector => selector === ":disabled, [aria-disabled='true']" }))[0].state.disabled, true);
  // The shadow stays inside the tab's box: the tallest height that fits at the margins the cap has (6 px each side here).
  const tight = pushFormEntries(capElement, context({ objects: true, box: [10, 22, 80, 40] }))[0];
  assert.ok(tight.height <= 0.25 + 1e-9, "no room, no height");
});

test("a tab's key rests at 0, is latched at 0.45 while selected and goes down while held; a disabled one never moves unless it is the selected one", () => {
  const up = { hover: false, pressed: false, disabled: false };
  assert.equal(tabPosition(Number.NaN, up), 0);
  assert.equal(tabPosition(Number.NaN, { ...up, pressed: true }), 0.45);
  assert.equal(tabPosition(1, { ...up, pressed: true }), 1);
  assert.equal(tabPosition(0.3, { ...up, disabled: true }), 0);
  assert.equal(tabPosition(0.45, { ...up, disabled: true, pressed: true }), 0.45);
  assert.equal(tabPosition(7, up), 1);
});

/** A rail's plinth and keys as the helper writes them: the bank's plinth (flush: the tablist is the plinth) and the bank's keys. */
function rail(profile, { scale = 1, stage = { width: 640, height: 800 }, t = 0.45 } = {}) {
  const list = [20, 20, 300, 66];
  const plinth = bankPlinthObject({ id: "rail-1", box: list, plinth: list, radius: 14, scale, state: { hover: false, pressed: false, disabled: false }, light, relief: { height: 3, material: "keyCap" }, flush: { stage } }, profile);
  const keys = [0, 1, 2].map(index => {
    const x = 22 + index * 96, box = [x, 22, 94, 62], cap = [x + 6, 34, 82, 44];
    return pushObject({ id: `tab-${index}`, form: "latching", box, cap, led: [x + 94 / 2 - 3, 25, 6, 6], radii: { box: 0, cap: 8 }, base: railPlinthHeight(scale), scale, role: "#ff9228", emitters: { led: index },
      t: index === 0 ? t : 0, material: "key #eceef2", state: { hover: false, pressed: index === 0, disabled: false }, light, relief: { height: 3, material: "keyCap", rect: cap, radius: 8 } }, profile);
  });
  return { plinth, keys };
}
const registry = () => { const profiles = {}; return { profiles, profile: (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; } }; };
function sceneOf(objects, profiles, emitters) {
  return { format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1 },
    extent: { width: 640, height: 800 }, outset: { top: 48, right: 48, bottom: 48, left: 48 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 }, focus: { colour: "#2563eb", width: 3, offset: 0.5 },
    materials: { matte: { base: { roughness: 0.6 } }, keyCap: premiumMaterials.keyCap, "key #eceef2": { base: { colour: "#eceef2", roughness: 0.45 } }, ...pushMaterialsOf({ role: "#ff9228" }), pushBezel: pushMaterials.pushBezel },
    primitives: [{ face: "raised", rect: [0, 0, 640, 800], radius: 12, height: 8, material: "matte" }], profiles, objects, emitters, protected: [[30, 40, 80, 20]], feather: 4 };
}

test("a rail is one polished plinth and a body with a captured cap and a glass LED per key, standing on the plinth, validated by core", () => {
  const { profiles, profile } = registry();
  const { plinth, keys } = rail(profile);
  assert.deepEqual(plinth.parts.map(part => `${part.kind}:${part.material}`), ["bezel:pushBezel"], "the bank's plinth, in the bank's metal");
  assert.equal(plinth.parts[0].caster, null, "the plinth casts no shadow of its own");
  assert.equal(RAIL_PLINTH, 2.4);
  assert.equal(railPlinthHeight(1.6), 3.84);
  assert.deepEqual(keys[0].parts.map(part => `${part.kind}:${part.material}`), ["plinth:key #eceef2", "cap:keyCap", "lens:lens #ff9228"]);
  assert.deepEqual(keys[0].parts.map(part => part.emitter), [undefined, undefined, 0]);
  assert.deepEqual(keys.map(key => key.parts[2].emitter), [0, 1, 2], "an emitter per key");
  assert.deepEqual(keys[0].parts.map(part => part.at[2]), [2.4, 2.4 + 5, 2.4], "the body and the LED stand on the plinth, the captured cap on the body");
  assert.deepEqual(keys[0].parts[0].pose, { from: { travel: 0 }, to: { travel: -4 } });
  assert.deepEqual(keys[0].parts[1].pose, keys[0].parts[0].pose, "the cap travels with its body");
  assert.equal(keys[0].parts[1].captured, true);
  assert.equal(keys[0].parts[2].pose, undefined, "the LED does not move");
  assert.equal(keys[0].t, 0.45, "selected: latched at 0.45");
  assert.equal(keys[1].t, 0);
  assert.deepEqual(keys[0].bounds.rect, keys[0].rect);
  assert.deepEqual(keys[0].relief.rect, [28, 34, 82, 44], "the Relief face is the cap's");
  const emitters = [0, 1, 2].map(index => lensEmitter("led", [25 + index * 96, 28], 6, index === 0 ? 1 : 0, "#ff9228"));
  const scene = validateInstrumentScene(sceneOf([plinth, ...keys], profiles, emitters));
  assert.equal(scene.objects.length, 4);
  assert.equal(scene.emitters.length, 3);
  assert.ok(bankHeight(1) > RAIL_PLINTH + 6);
  // Under reduced transparency the LED is opaque lacquer.
  const opaque = pushObject({ id: "o", form: "latching", box: [22, 22, 94, 62], cap: [28, 34, 82, 44], led: [66, 25, 6, 6], radii: { box: 0, cap: 8 }, base: 2.4, scale: 1, role: "#ff9228", emitters: { led: 0 }, t: 0, material: "key #eceef2", opaque: true,
    state: { hover: false, pressed: false, disabled: false }, light, relief: { height: 3, material: "keyCap" } }, registry().profile);
  assert.equal(opaque.parts[2].glass, undefined);
  assert.match(opaque.parts[2].material, /^lensOpaque/);
});

/** The scene the helper hands the construction (`BankScene`): a stub with the pieces the construction reads. */
function bankScene({ scale = 1, materials = {} } = {}) {
  const { profiles, profile } = registry();
  return { profiles, objects: [], entries: [], materials: { keyCap: premiumMaterials.keyCap, ...materials }, registry: createKeyRegistry(), layers: { control: { base: { roughness: 0.4 } } }, profile,
    light, scale, opaque: false, raised: 3, use: name => name, room: () => true, stage: { width: 640, height: 800 } };
}
/** One key as a component's mapping gives it: a tab (box 94 × 62, no radius of its own) or a bank's key host (the same box). */
const keySpec = (element, id, extra = {}) => ({ element, id, box: [22, 22, 94, 62], cap: [28, 34, 82, 44], capRadius: 8, boxRadius: 0, led: [66, 25, 6, 6], role: "#ff9228", emitter: 0, colour: "#eceef2", capMaterial: "control",
  t: 0.45, state: { hover: false, pressed: true, disabled: false }, onPlinth: true, relief: { rect: [28, 34, 82, 44], radius: 8 }, ...extra });

test("a rail tab and a bank key of the same size and state are one construction: the same parts, profiles, materials and registry calls", () => {
  const rails = bankScene(), banks = bankScene();
  const tab = { id: "acct-tab-profile", tagName: "BUTTON" }, radio = { id: "piano", tagName: "SPAN" };
  // The tablist is the plinth (flush: the native element itself), a bank's plinth stands in its group's room; the keys are the same.
  addBankPlinth(rails, { id: "rail", box: [20, 20, 300, 66], plinth: [20, 20, 300, 66], radius: 14, state: { hover: false, pressed: false, disabled: false }, flush: { stage: rails.stage } });
  addBankPlinth(banks, { id: "bank", box: [12, 12, 316, 82], plinth: [20, 20, 300, 66], radius: 14, state: { hover: false, pressed: false, disabled: false } });
  assert.equal(addBankKey(rails, keySpec(tab, "tab")), true);
  assert.equal(addBankKey(banks, keySpec(radio, "key")), true);
  const names = scene => scene.objects.map(object => object.parts.map(part => `${part.kind}:${part.material}:${part.profile.split(":")[0]}`));
  assert.deepEqual(names(rails), names(banks), "the same part kinds, materials and profile families");
  assert.deepEqual(names(rails), [["bezel:pushBezel:bank-plinth"], ["plinth:key #eceef2:push-body", "cap:keyCap:push-cap", "lens:lens #ff9228:push-led"]]);
  // The key's shapes are identical profile for profile, and so are the materials: the two share one scene's objects when they share a panel.
  const keyShapes = scene => Object.keys(scene.profiles).filter(name => !name.startsWith("bank-plinth"));
  assert.deepEqual(keyShapes(rails), keyShapes(banks));
  assert.deepEqual(Object.keys(rails.materials), Object.keys(banks.materials));
  assert.deepEqual(rails.objects[1].parts, banks.objects[1].parts, "parts equal, down to their places, poses and casters");
  assert.deepEqual(rails.registry.report, banks.registry.report);
  // Both register the body with the registry, so the scene can trim it to core's material cap; past the push rule both are Relief keys, named in the diagnostics.
  const full = bankScene({ materials: Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`m${index}`, { base: {} }])) });
  assert.equal(addBankKey(full, keySpec(tab, "tab")), false);
  assert.deepEqual(full.registry.report.keysAtRelief, ["acct-tab-profile"]);
  assert.deepEqual(full.entries.map(entry => entry.face), ["raised"]);
  assert.equal(full.objects.length, 0);
  for (const [element, name] of [[tab, "acct-tab-profile"], [radio, "piano"]]) {
    const trimmed = bankScene();
    addBankKey(trimmed, keySpec(element, "key"));
    for (let index = 0; index < 20; index++) trimmed.materials[`filler${index}`] = { base: {} };
    trimmed.registry.trim(trimmed);
    assert.deepEqual(trimmed.registry.report.keysAtRelief, [name], "the key's body is trimmed to core's cap, a bank's and a rail's alike");
  }
});

test("every vertex of the plinth and of a key stays inside its box over the whole stage, at every depth and for every width of a rail", () => {
  const worst = {};
  for (const scale of [0.6, 1, 1.6]) for (const stage of [{ width: 640, height: 800 }, { width: 1920, height: 1080 }]) {
    const { profiles, profile } = registry();
    const { plinth, keys } = rail(profile, { scale, stage });
    for (const object of [plinth, ...keys]) {
      const frontier = containmentFrontier(object, profiles), [boxW, boxH] = [object.rect[2], object.rect[3]];
      for (const [e, f] of [[0, 0], [stage.width - boxW - 40, 0], [0, stage.height - boxH - 40], [stage.width - boxW - 40, stage.height - boxH - 40], [stage.width / 2 - boxW / 2, 0]]) {
        const result = checkContainment(object, profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e, f, scale: 1 }, vanish: [stage.width / 2, stage.height / 2], distance: 2400 });
        assert.ok(result.contained, `${object.id} at depth scale ${scale}, stage ${stage.width}, at ${e},${f}: inset ${result.inset} (part ${result.part})`);
        const key = object.id.startsWith("rail") ? "plinth" : "key";
        worst[key] = Math.min(worst[key] ?? Infinity, Math.round(result.inset * 1000) / 1000);
      }
    }
  }
  console.log(`closest vertex to the box, px: ${JSON.stringify(worst)}`);
  for (const inset of Object.values(worst)) assert.ok(inset >= 0.5);
});

test("the stylesheet gives the forms their markup's rules, and none that reach the flush controls", () => {
  const css = readFileSync(new URL("../../packages/ui/src/css/components.css", import.meta.url), "utf8");
  for (const selector of [".ug-select-display", ".ug-select-display__step", ".ug-select-display__glyph", ".ug-select-display__select", `.ug-tabs[data-strata-form="rail"] > .ug-tabs__list`, ".ug-tab__cap", ".ug-tab__led", `.ug-tabs[data-strata-form="rail"] > .ug-tabs__panel`]) assert.ok(css.includes(selector), selector);
  // Every rule of the rail form is scoped to the form's attribute, and the selector needs none of its own (it is the RotarySelector's).
  const block = css.slice(css.indexOf("/* ---- Select forms:"), css.indexOf("/* ---- Accordion ---- */"));
  for (const rule of block.matchAll(/^ {2}:where\((\.ug-tab[^)]*)\)/gm)) assert.ok(/data-strata-form="rail"/.test(rule[1]) || /ug-tabs--vertical/.test(rule[1]) || rule[1].startsWith(".ug-tab__"), `${rule[1]} is scoped`);
  assert.ok(!/\.ug-select\b/.test(block.replace(/\.ug-select-display[\w-]*/g, "")), "no rule of the forms reaches the flush select");
});
