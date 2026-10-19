/**
 * Unit tests for the hifi character (design language section 19, `characters/hifi.json`): the bundle validates through
 * the same validator as premium and studio, defines every role premium defines, keeps its sound set inside the feedback
 * ranges, and is selectable at runtime on `data-strata-character="hifi"` (the same blocks as studio's, the room on the
 * root alone). The Instrument part materials built from the custom properties are premium's tables exactly for premium
 * and hifi's own for hifi: champagne caps, chrome rings and levers, walnut (light) and lacquer (dark) plates.
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyCharacter, characterNames, characterOf, charactersToCss, createStrataTheme, flatten, instrumentSettings, isProvisional, resolve, strataTokens, validateTokens,
} from "../../packages/ui/src/tokens/index.ts";
import { premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";
import { faderMaterials } from "../../packages/ui/src/gpu/instrument-fader.ts";
import { switchMaterials } from "../../packages/ui/src/gpu/instrument-switch.ts";
import { characterMaterials } from "../../packages/ui/src/gpu/instrument-character.ts";

const bundle = name => JSON.parse(readFileSync(new URL(`../../packages/ui/src/tokens/characters/${name}.json`, import.meta.url), "utf8"));
const paths = name => new Map(flatten(bundle(name)).map(token => [token.path, token]));
/** What the page's custom properties give for a character on the root, in a theme: the theme's resolved values by token path. */
const rawFor = (character, theme = "light") => {
  const values = resolve(createStrataTheme({ character }).source, { theme });
  return path => (path in values ? String(values[path]) : "");
};
const value = (name, path) => paths(name).get(path)?.$value;

test("hifi is a built-in character beside premium and studio, and its bundle validates through the same validator", () => {
  assert.ok(characterNames.includes("hifi") && characterNames[0] === "premium");
  const hifi = characterOf("hifi");
  assert.equal(hifi.name, "hifi");
  assert.equal(hifi.status, "draft");
  assert.equal(hifi.extends, "premium");
  const theme = createStrataTheme({ character: "hifi" }, { strict: true });
  assert.deepEqual(theme.issues, []);
  assert.deepEqual(validateTokens(applyCharacter(strataTokens, "hifi").source), []);
  assert.equal(theme.character.name, "hifi");
  assert.ok(theme.character.provisional.includes("spring.knob.stiffness") && theme.character.provisional.includes("feedback.click.pitch") && theme.character.provisional.includes("studio.key"));
  assert.ok(!isProvisional(hifi, "material.roles.knobCap"), "the role assignments are decisions, not provisional values");
  const applied = applyCharacter(strataTokens, "hifi");
  assert.deepEqual(applied.issues, []);
  for (const path of paths("hifi").keys()) assert.ok(applied.applied.includes(path), path);
  assert.ok(paths("hifi").size < paths("premium").size / 2, "a sparse layer");
  assert.deepEqual(hifi.provisional.filter(prefix => ![...paths("hifi").keys()].some(path => path === prefix || path.startsWith(`${prefix}.`))), [], "every provisional prefix names tokens it sets");
});

test("hifi defines every material role premium defines, for every theme premium names, and each role's preset has recipes", () => {
  const premium = paths("premium"), hifi = paths("hifi");
  const roles = [...premium.keys()].filter(path => path.startsWith("material.roles."));
  assert.ok(roles.length >= 10);
  for (const role of roles) {
    assert.ok(hifi.has(role), `${role} is defined`);
    const themes = premium.get(role).meta.themes;
    if (themes) assert.deepEqual(Object.keys(hifi.get(role).meta.themes ?? {}).sort(), Object.keys(themes).sort(), `${role} has the same themes`);
  }
  const source = createStrataTheme({ character: "hifi" }).source;
  for (const theme of ["light", "dark"]) {
    const settings = instrumentSettings(strataTokens, { character: "hifi", theme });
    for (const role of roles.map(path => path.split(".")[2])) {
      assert.ok(settings.materials[settings.roles[role]], `${role} (${settings.roles[role]}, ${theme}) has an Instrument recipe`);
      assert.ok(source.material.presets[settings.roles[role]] || ["glass", "emissive"].includes(settings.roles[role]), `${role} has a Relief and Objects preset`);
    }
  }
  const light = instrumentSettings(strataTokens, { character: "hifi", theme: "light" }).roles, dark = instrumentSettings(strataTokens, { character: "hifi", theme: "dark" }).roles;
  assert.deepEqual([light.knobCap, light.knobSkirt, light.faderCap, light.lever, light.bezel], ["champagne", "chrome", "champagne", "chrome", "chrome"]);
  assert.deepEqual([light.plate, dark.plate, light.rockerPlate], ["walnut", "lacquer", "walnut"], "walnut plates by day, black lacquer in the dark");
  const themes = source.material.roles.plate.$extensions["dev.underglass.strata"].themes;
  assert.deepEqual([themes.contrast, themes["contrast-dark"]], ["walnut", "lacquer"]);
});

test("hifi's sound set stays inside the feedback ranges, is softer than premium's and studio's, and whether sound is on is never a character's", () => {
  const hifi = bundle("hifi").feedback, studio = bundle("studio").feedback, ranges = strataTokens.feedback;
  for (const kind of ["click", "tick", "thunk", "snap"]) for (const key of ["pitch", "decay", "noise"]) {
    const { min, max } = ranges[kind][key].$extensions["dev.underglass.strata"], v = hifi[kind][key].$value;
    assert.ok(v >= min && v <= max, `${kind}.${key} ${v} in ${min}-${max}`);
    assert.notEqual(v, ranges[kind][key].$value, `${kind}.${key} is hifi's own`);
  }
  // Muted and soft: every sound lower in pitch, longer to decay and less noisy than premium's; the thunk a soft thump.
  for (const kind of ["click", "tick", "thunk", "snap"]) {
    assert.ok(hifi[kind].pitch.$value < ranges[kind].pitch.$value && hifi[kind].pitch.$value < studio[kind].pitch.$value, `${kind} is lower`);
    assert.ok(hifi[kind].decay.$value > ranges[kind].decay.$value && hifi[kind].noise.$value < ranges[kind].noise.$value, `${kind} is rounder`);
  }
  const rogue = { $extensions: { "dev.underglass.strata": { character: { name: "rogue", provisional: [] } } }, feedback: { sound: { $type: "number", $value: 1 }, haptics: { $type: "number", $value: 1 } } };
  assert.deepEqual(createStrataTheme({ character: rogue }).issues.map(issue => issue.path).sort(), ["feedback.haptics", "feedback.sound"]);
  assert.ok(!paths("hifi").has("feedback.sound") && !paths("hifi").has("feedback.haptics"));
});

test("hifi is heavy: slower, softer springs than premium, soft detents, nearly critically damped; a chunky pointer and a bat default", () => {
  const premium = bundle("premium").spring;
  for (const name of Object.keys(bundle("hifi").spring)) {
    const k = value("hifi", `spring.${name}.stiffness`), c = value("hifi", `spring.${name}.damping`);
    assert.ok(k <= premium[name].stiffness.$value, `${name} is no stiffer than premium (${k})`);
    const zeta = c / (2 * Math.sqrt(k));
    assert.ok(zeta >= 0.75 && zeta <= 1.05, `${name} damping ratio ${zeta.toFixed(2)}`);
  }
  assert.ok(value("hifi", "spring.detent.stiffness") < value("studio", "spring.detent.stiffness") && value("hifi", "spring.detent.stiffness") < premium.detent.stiffness.$value, "soft detents");
  assert.equal(value("hifi", "knob.pointer.width"), "3px");
  assert.equal(value("hifi", "form.switch"), "bat");
});

test("hifi keeps the invariants: the light, colours other than the glow, focus and target size are premium's and the defaults'", () => {
  const hifi = createStrataTheme({ character: "hifi" }).toJSON(), base = strataTokens;
  assert.deepEqual(hifi.light, base.light);
  assert.deepEqual(hifi.colour.accent, base.colour.accent);
  assert.deepEqual(hifi.focus, base.focus);
  assert.deepEqual(hifi.target, base.target);
  assert.deepEqual(hifi.interior, base.interior);
  assert.equal(hifi.colour.glowOn.$value, "#ffd36b");
  const scoped = [...new Set(createStrataTheme({ character: "hifi" }, { scoped: true }).issues.map(issue => issue.path))];
  assert.ok(scoped.includes("studio.key") && scoped.includes("environment.intensity") && scoped.length === 8, `reported: ${scoped}`);
  assert.deepEqual(createStrataTheme({ character: "hifi" }).issues, []);
});

test("the characters stylesheet carries hifi: its block, the room on the root alone, premium restating what hifi sets", () => {
  const css = charactersToCss();
  const block = selector => css.split("\n").flatMap((line, index, lines) => line === `  ${selector} {` ? [lines.slice(index + 1, lines.indexOf("  }", index)).map(l => l.trim())] : [])[0];
  const scoped = name => block(`[data-strata-character="${name}"], [data-strata-character="${name}"] [data-strata-theme]`);
  const root = name => block(`:root[data-strata-character="${name}"]`);
  const names = lines => lines.map(line => line.slice(0, line.indexOf(":")));
  assert.ok(scoped("hifi").includes("--strata-spring-detent-stiffness: 600;"));
  assert.ok(scoped("hifi").includes("--strata-feedback-thunk-pitch: 90;"));
  assert.ok(scoped("hifi").includes("--strata-material-roles-knob-cap: champagne;"));
  assert.ok(scoped("hifi").includes("--strata-material-roles-knob-skirt: chrome;"));
  assert.ok(scoped("hifi").includes("--strata-knob-pointer-width: 3px;"));
  assert.ok(root("hifi").includes("--strata-studio-key: 8;") && root("hifi").includes("--strata-environment-intensity: 1.1;"));
  assert.ok(!scoped("hifi").some(line => /--strata-(studio|environment)-/.test(line)), "the room is not declared on a scope");
  assert.deepEqual(names(scoped("premium")).sort(), names(scoped("hifi")).sort());
  assert.deepEqual(names(root("premium")).sort(), names(root("hifi")).sort());
  assert.deepEqual(names(scoped("studio")).sort(), names(scoped("hifi")).sort());
  assert.ok(scoped("premium").includes("--strata-spring-detent-stiffness: 900;") && scoped("premium").includes("--strata-material-roles-knob-cap: metal;"));
  assert.ok(scoped("premium").includes("--strata-instrument-material-champagne-base-colour: initial;"), "premium has no champagne: a nested premium scope clears it");
  assert.match(css, /\[data-strata-character="hifi"\]\[data-strata-theme="dark"\][^{]*\{\s*--strata-material-roles-plate: lacquer;/);
  assert.match(css, /\[data-strata-character="hifi"\]\[data-strata-theme="light"\][^{]*\{\s*--strata-material-roles-plate: walnut;/);
  assert.match(css, /--strata-finish-role-knob-cap: var\(--strata-finish-champagne\);/);
});

test("the Instrument materials follow hifi: premium builds the premium tables exactly, hifi its own", () => {
  assert.equal(characterMaterials(() => "", "#ff9228"), undefined, "no character on the page: the premium tables stand");
  for (const theme of ["light", "dark"]) {
    const built = characterMaterials(rawFor("premium", theme), "#ff9228");
    for (const name of ["knobCap", "knobSkirt", "knobChamfer", "knobInk"]) assert.deepEqual(built[name], premiumMaterials[name], `premium ${name} (${theme})`);
    for (const name of ["faderCap", "faderChamfer", "faderInk"]) assert.deepEqual(built[name], faderMaterials[name], `premium ${name} (${theme})`);
    for (const name of ["switchCap", "switchChamfer", "switchLever", "switchBezel", "switchInk", "switchFlagOn", "switchFlagOff"]) assert.deepEqual(built[name], switchMaterials[name], `premium ${name} (${theme})`);
    assert.deepEqual(built.switchPlate, switchMaterials[theme === "dark" ? "switchPlateDark" : "switchPlate"], `premium plate (${theme})`);
    assert.equal(built.switchPlate.coat, undefined, "the premium presets in use have no coat");
  }
  const hifi = characterMaterials(rawFor("hifi"), "#ffd36b");
  assert.deepEqual(hifi.knobCap.base, { colour: "#e6d9bd", metallic: 1, roughness: 0.3, direct: 1 });
  assert.deepEqual(hifi.knobCap.brush, { strength: 0.95, direction: "circular" });
  assert.deepEqual(hifi.faderCap.brush, { strength: 0.95, direction: "linear" });
  assert.equal(hifi.knobCap.grain.strength, 0.12);
  assert.equal(hifi.knobSkirt.base.colour, "#f4f7fc");
  assert.equal(hifi.knobSkirt.base.roughness, 0.03);
  assert.equal(hifi.knobChamfer.base.colour, "#e6d9bd", "the cap's own metal, polished");
  assert.equal(hifi.knobChamfer.base.roughness, 0.06);
  assert.equal(hifi.knobInk.base.colour, "#241c12");
  assert.equal(hifi.switchFlagOn.emissive.colour, "#ffd36b");
  assert.equal(hifi.switchLever.base.colour, "#f4f7fc");
  assert.equal(hifi.switchBezel.base.colour, "#f4f7fc");
  assert.deepEqual(hifi.switchPlate.base, { colour: "#4a2f1d", metallic: 0, roughness: 0.42, direct: 1 });
  assert.deepEqual(hifi.switchPlate.coat, { strength: 0.3, roughness: 0.3, ior: 1.5 });
  assert.deepEqual(hifi.switchPlate.brush, { strength: 0.35, direction: "linear" });
  const dark = characterMaterials(rawFor("hifi", "dark"), "#ffd36b");
  assert.equal(dark.switchPlateDark.base.colour, "#1c1c1e", "black lacquer in the dark");
  assert.equal(dark.switchPlateDark.coat.strength, 1);
  // Studio's own materials are unchanged by hifi being there.
  assert.equal(characterMaterials(rawFor("studio"), "#ffb020").knobSkirt.base.colour, "#2a2c31");
});
