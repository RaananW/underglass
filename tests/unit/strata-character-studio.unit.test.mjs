/**
 * Unit tests for the studio character (design language section 19, `characters/studio.json`): the bundle validates
 * through the same validator as premium, defines every role premium defines, keeps its sound set inside the feedback
 * ranges, and is selectable at runtime: `charactersToCss` declares it on `data-strata-character` (application-only
 * tokens on the root alone, premium's block restating everything so a nested premium scope restores it), and the
 * Instrument part materials built from the custom properties are premium's tables exactly for premium and studio's for
 * studio. Run with `npm run test:unit`.
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

test("studio is a built-in character beside premium, and its bundle validates through the same validator", () => {
  assert.deepEqual(characterNames.slice(0, 2), ["premium", "studio"]);
  const studio = characterOf("studio");
  assert.equal(studio.name, "studio");
  assert.equal(studio.status, "draft");
  const theme = createStrataTheme({ character: "studio" }, { strict: true });
  assert.deepEqual(theme.issues, []);
  assert.deepEqual(validateTokens(applyCharacter(strataTokens, "studio").source), []);
  assert.equal(theme.character.name, "studio");
  assert.ok(theme.character.provisional.includes("spring.knob.stiffness") && theme.character.provisional.includes("feedback.click.pitch") && theme.character.provisional.includes("studio.key"));
  assert.ok(!isProvisional(studio, "material.roles.knobCap"), "the role assignments are decisions, not provisional values");
  // It is laid over premium and sets only what differs; every token it names is applied (nothing is refused: the light,
  // colours and invariants are not its to set).
  assert.equal(studio.extends, "premium");
  const applied = applyCharacter(strataTokens, "studio");
  assert.deepEqual(applied.issues, []);
  for (const path of paths("studio").keys()) assert.ok(applied.applied.includes(path), path);
  assert.ok(applied.applied.length > paths("studio").size + 100, "premium's tokens come first");
  assert.ok(paths("studio").size < paths("premium").size / 2, "a sparse layer");
  assert.deepEqual(characterOf("studio").provisional.filter(prefix => ![...paths("studio").keys()].some(path => path === prefix || path.startsWith(`${prefix}.`))), [], "every provisional prefix names tokens it sets");
});

test("studio defines every material role premium defines, for every theme premium names", () => {
  const premium = paths("premium"), studio = paths("studio");
  const roles = [...premium.keys()].filter(path => path.startsWith("material.roles."));
  assert.ok(roles.length >= 10);
  for (const role of roles) {
    assert.ok(studio.has(role), `${role} is defined`);
    const themes = premium.get(role).meta.themes;
    if (themes) assert.deepEqual(Object.keys(studio.get(role).meta.themes ?? {}).sort(), Object.keys(themes).sort(), `${role} has the same themes`);
  }
  // Every preset a role names is described for the Instrument level (by studio or by premium) and for Relief and Objects.
  const source = createStrataTheme({ character: "studio" }).source;
  const settings = instrumentSettings(strataTokens, { character: "studio", theme: "dark" });
  for (const role of roles.map(path => path.split(".")[2])) assert.ok(settings.materials[settings.roles[role]], `${role} (${settings.roles[role]}) has an Instrument recipe`);
  assert.equal(settings.roles.knobSkirt, "anodised");
  assert.equal(settings.roles.plate, "anodised", "dark anodised plates on every theme");
  assert.equal(instrumentSettings(strataTokens, { character: "studio", theme: "light" }).roles.plate, "anodised");
  assert.ok(source.material.presets.anodised, "Relief and Objects have the preset too");
});

test("studio's sound set stays inside the feedback ranges and differs from premium's; whether sound is on is never a character's", () => {
  const studio = bundle("studio").feedback, ranges = strataTokens.feedback;
  for (const kind of ["click", "tick", "thunk", "snap"]) for (const key of ["pitch", "decay", "noise"]) {
    const { min, max } = ranges[kind][key].$extensions["dev.underglass.strata"], value = studio[kind][key].$value;
    assert.ok(value >= min && value <= max, `${kind}.${key} ${value} in ${min}-${max}`);
    assert.notEqual(value, ranges[kind][key].$value, `${kind}.${key} is studio's own`);
  }
  assert.ok(studio.thunk.pitch.$value < 200 && studio.tick.decay.$value < ranges.tick.decay.$value, "a deeper thunk and a drier tick");
  const rogue = { $extensions: { "dev.underglass.strata": { character: { name: "rogue", provisional: [] } } }, feedback: { sound: { $type: "number", $value: 1 }, click: { pitch: { $type: "number", $value: 1000 } } } };
  const refused = createStrataTheme({ character: rogue });
  assert.deepEqual(refused.issues.map(issue => issue.path), ["feedback.sound"]);
  assert.equal(refused.toJSON().feedback.sound.$value, 0);
  assert.equal(refused.toJSON().feedback.click.pitch.$value, 1000);
});

test("studio keeps the invariants: the light, colours other than the glow, focus and target size are premium's and the defaults'", () => {
  const studio = createStrataTheme({ character: "studio" }).toJSON(), base = strataTokens;
  assert.deepEqual(studio.light, base.light);
  assert.deepEqual(studio.colour.accent, base.colour.accent);
  assert.deepEqual(studio.focus, base.focus);
  assert.deepEqual(studio.target, base.target);
  assert.deepEqual(studio.interior, base.interior);
  assert.equal(studio.colour.glowOn.$value, "#ffb020");
  // A scoped studio reports the room (studio.* and environment.intensity are the application's).
  const scoped = [...new Set(createStrataTheme({ character: "studio" }, { scoped: true }).issues.map(issue => issue.path))];
  assert.ok(scoped.includes("studio.key") && scoped.includes("environment.intensity") && scoped.length === 8, `reported: ${scoped}`);
  assert.deepEqual(createStrataTheme({ character: "studio" }).issues, []);
});

test("the characters stylesheet: a block per character, the room on the root alone, premium restating what studio sets", () => {
  const css = charactersToCss();
  assert.match(css, /^@layer strata\.tokens, strata\.theme, strata\.components;\n@layer strata\.theme \{/);
  const block = selector => css.split("\n").flatMap((line, index, lines) => line === `  ${selector} {` ? [lines.slice(index + 1, lines.indexOf("  }", index)).map(l => l.trim())] : [])[0];
  const scoped = name => block(`[data-strata-character="${name}"], [data-strata-character="${name}"] [data-strata-theme]`);
  const root = name => block(`:root[data-strata-character="${name}"]`);
  const names = lines => lines.map(line => line.slice(0, line.indexOf(":")));
  // Studio's values.
  assert.ok(scoped("studio").includes("--strata-spring-detent-stiffness: 1400;"));
  assert.ok(scoped("studio").includes("--strata-feedback-thunk-pitch: 120;"));
  assert.ok(scoped("studio").includes("--strata-material-roles-knob-skirt: anodised;"));
  assert.ok(scoped("studio").includes("--strata-knob-pointer-width: 1.6px;"));
  assert.ok(root("studio").includes("--strata-studio-key: 9;") && root("studio").includes("--strata-environment-intensity: 0.85;"));
  assert.ok(!scoped("studio").some(line => /--strata-(studio|environment)-/.test(line)), "the room is not declared on a scope");
  // Premium restates every name studio declares, so a premium scope inside a studio one restores it.
  assert.deepEqual(names(scoped("premium")).sort(), names(scoped("studio")).sort());
  assert.deepEqual(names(root("premium")).sort(), names(root("studio")).sort());
  assert.ok(scoped("premium").includes("--strata-spring-detent-stiffness: 900;") && scoped("premium").includes("--strata-knob-pointer-width: 2.2px;"));
  assert.ok(root("premium").includes("--strata-studio-key: 12;") && root("premium").includes("--strata-environment-intensity: initial;"), "no premium value: the default stands");
  assert.ok(scoped("premium").includes("--strata-instrument-ink-cap: initial;"));
  // The plate follows the theme under premium and is anodised under studio.
  assert.match(css, /\[data-strata-character="premium"\]\[data-strata-theme="dark"\][^{]*\{\s*--strata-material-roles-plate: gunmetal;/);
  assert.match(css, /\[data-strata-character="studio"\]\[data-strata-theme="dark"\][^{]*\{\s*--strata-material-roles-plate: anodised;/);
  assert.match(css, /--strata-finish-role-knob-skirt: var\(--strata-finish-anodised\);/);
  // The shipped sheet carries it: `strata.css` is what a page imports.
  assert.ok(readFileSync(new URL("../../packages/ui/src/tokens/index.ts", import.meta.url), "utf8").includes("charactersToCss"));
});

test("the Instrument materials follow the character: premium builds the premium tables exactly, studio its own, no character none", () => {
  assert.equal(characterMaterials(() => "", "#ff9228"), undefined, "no character on the page: the premium tables stand");
  for (const theme of ["light", "dark"]) {
    const built = characterMaterials(rawFor("premium", theme), "#ff9228");
    for (const name of ["knobCap", "knobSkirt", "knobChamfer", "knobInk"]) assert.deepEqual(built[name], premiumMaterials[name], `premium ${name} (${theme})`);
    for (const name of ["faderCap", "faderChamfer", "faderInk"]) assert.deepEqual(built[name], faderMaterials[name], `premium ${name} (${theme})`);
    for (const name of ["switchCap", "switchChamfer", "switchLever", "switchBezel", "switchInk", "switchFlagOn", "switchFlagOff"]) assert.deepEqual(built[name], switchMaterials[name], `premium ${name} (${theme})`);
    assert.deepEqual(built.switchPlate, switchMaterials[theme === "dark" ? "switchPlateDark" : "switchPlate"], `premium plate (${theme})`);
  }
  const studio = characterMaterials(rawFor("studio"), "#ffb020");
  assert.deepEqual(studio.knobSkirt.base, { colour: "#2a2c31", metallic: 0.85, roughness: 0.5, direct: 1 });
  assert.deepEqual(studio.knobCap.brush, { strength: 1, direction: "circular" });
  assert.deepEqual(studio.faderCap.brush, { strength: 1, direction: "linear" });
  assert.equal(studio.knobCap.grain.strength, 0.3);
  assert.equal(studio.knobChamfer.base.roughness, 0.06);
  assert.equal(studio.knobInk.base.colour, "#0e0f11");
  assert.equal(studio.switchFlagOn.emissive.colour, "#ffb020");
  assert.equal(studio.switchPlate.base.colour, "#2a2c31");
  assert.equal(studio.switchBezel.base.colour, "#50535a");
});
