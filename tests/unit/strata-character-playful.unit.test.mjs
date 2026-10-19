/**
 * Unit tests for the playful character (design language section 19, `characters/playful.json`): the bundle validates
 * through the same validator as premium and studio, defines every role premium defines, keeps its sound set inside the
 * feedback ranges (bright, short, nearly noiseless), keeps every spring underdamped at a ratio of 0.5 to 0.6 inside the
 * clamped-spring rule (a bounce settles within the stops, and a pose that overshoots them stays in its box), and is
 * selectable at runtime on `data-strata-character="playful"`. The Instrument part materials built from the custom
 * properties are premium's tables exactly for premium and playful's own for playful: sky-blue rubber knob caps, coral
 * rubber fader caps, candy lacquer skirts, levers, bezels and plates (mint by day, grape in the dark).
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import {
  applyCharacter, characterNames, characterOf, charactersToCss, contrast, createStrataTheme, flatten, instrumentSettings, isProvisional, parseHex, resolve, strataTokens, validateTokens,
} from "../../packages/ui/src/tokens/index.ts";
import { advanceSpring, knobObject, premiumMaterials } from "../../packages/ui/src/gpu/instrument.ts";
import { faderMaterials } from "../../packages/ui/src/gpu/instrument-fader.ts";
import { switchMaterials } from "../../packages/ui/src/gpu/instrument-switch.ts";
import { characterMaterials } from "../../packages/ui/src/gpu/instrument-character.ts";
import { stepSpring, switchThrow } from "../../packages/ui/src/shared/switch-forms.ts";

// Core's sources import siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.includes("/core/src/") && specifier.startsWith("./") && specifier.endsWith(".js")) return next(specifier.replace(/\.js$/, ".ts"), context);
    return next(specifier, context);
  },
});
const { validateInstrumentScene, containmentFrontier, checkContainment } = await import("../../packages/core/src/instrument.ts");
sourceImports.deregister();

const bundle = name => JSON.parse(readFileSync(new URL(`../../packages/ui/src/tokens/characters/${name}.json`, import.meta.url), "utf8"));
const paths = name => new Map(flatten(bundle(name)).map(token => [token.path, token]));
/** What the page's custom properties give for a character on the root, in a theme: the theme's resolved values by token path. */
const rawFor = (character, theme = "light") => {
  const values = resolve(createStrataTheme({ character }).source, { theme });
  return path => (path in values ? String(values[path]) : "");
};
const value = (name, path) => paths(name).get(path)?.$value;
const ratioOf = (name, spring) => value(name, `spring.${spring}.damping`) / (2 * Math.sqrt(value(name, `spring.${spring}.stiffness`)));
/** The unclamped first overshoot of an underdamped spring, as a share of the step. */
const overshootOf = zeta => Math.exp((-Math.PI * zeta) / Math.sqrt(1 - zeta ** 2));
const springs = Object.keys(bundle("playful").spring);

test("playful is a built-in character beside premium and studio, and its bundle validates through the same validator", () => {
  assert.ok(characterNames.includes("playful") && characterNames[0] === "premium");
  const playful = characterOf("playful");
  assert.equal(playful.name, "playful");
  assert.equal(playful.status, "draft");
  assert.equal(playful.extends, "premium");
  const theme = createStrataTheme({ character: "playful" }, { strict: true });
  assert.deepEqual(theme.issues, []);
  assert.deepEqual(validateTokens(applyCharacter(strataTokens, "playful").source), []);
  assert.equal(theme.character.name, "playful");
  assert.ok(theme.character.provisional.includes("spring.knob.stiffness") && theme.character.provisional.includes("feedback.click.pitch") && theme.character.provisional.includes("studio.key"));
  assert.ok(!isProvisional(playful, "material.roles.knobCap"), "the role assignments are decisions, not provisional values");
  const applied = applyCharacter(strataTokens, "playful");
  assert.deepEqual(applied.issues, []);
  for (const path of paths("playful").keys()) assert.ok(applied.applied.includes(path), path);
  assert.ok(paths("playful").size < paths("premium").size * 0.7, "a sparse layer: its eight presets are most of it");
  assert.deepEqual(playful.provisional.filter(prefix => ![...paths("playful").keys()].some(path => path === prefix || path.startsWith(`${prefix}.`))), [], "every provisional prefix names tokens it sets");
});

test("playful defines every material role premium defines, for every theme premium names, and each role's preset has recipes", () => {
  const premium = paths("premium"), playful = paths("playful");
  const roles = [...premium.keys()].filter(path => path.startsWith("material.roles."));
  assert.ok(roles.length >= 10);
  for (const role of roles) {
    assert.ok(playful.has(role), `${role} is defined`);
    const themes = premium.get(role).meta.themes;
    if (themes) assert.deepEqual(Object.keys(playful.get(role).meta.themes ?? {}).sort(), Object.keys(themes).sort(), `${role} has the same themes`);
  }
  const source = createStrataTheme({ character: "playful" }).source;
  for (const theme of ["light", "dark"]) {
    const settings = instrumentSettings(strataTokens, { character: "playful", theme });
    for (const role of roles.map(path => path.split(".")[2])) {
      assert.ok(settings.materials[settings.roles[role]], `${role} (${settings.roles[role]}, ${theme}) has an Instrument recipe`);
      assert.ok(source.material.presets[settings.roles[role]] || ["glass", "emissive"].includes(settings.roles[role]), `${role} has a Relief and Objects preset`);
    }
  }
  const light = instrumentSettings(strataTokens, { character: "playful", theme: "light" }).roles, dark = instrumentSettings(strataTokens, { character: "playful", theme: "dark" }).roles;
  assert.deepEqual([light.knobCap, light.knobSkirt, light.faderCap, light.lever, light.bezel, light.rockerPlate], ["rubberSky", "candyYellow", "rubberCoral", "candyLime", "candyCream", "candyPink"], "a bold colour per control");
  assert.deepEqual([light.plate, dark.plate], ["candyMint", "candyGrape"], "a mint faceplate by day, grape in the dark");
  const themes = source.material.roles.plate.$extensions["dev.underglass.strata"].themes;
  assert.deepEqual([themes.contrast, themes["contrast-dark"]], ["candyMint", "candyGrape"]);
  // Soft-touch caps are matte dielectrics with no coat; candy lacquers are dielectrics under a full, sharp coat.
  const recipes = instrumentSettings(strataTokens, { character: "playful", theme: "light" }).materials;
  for (const rubber of ["rubberSky", "rubberCoral"]) assert.ok(recipes[rubber].base.roughness >= 0.7 && recipes[rubber].base.metallic === 0 && !recipes[rubber].coat, `${rubber} is soft-touch`);
  for (const candy of ["candyYellow", "candyLime", "candyPink", "candyCream", "candyMint", "candyGrape"]) assert.ok(recipes[candy].base.metallic === 0 && recipes[candy].coat.strength === 1 && recipes[candy].coat.roughness <= 0.05, `${candy} is a glossy lacquer`);
});

test("the cap ink reads on both rubber caps, and the colours are saturated, not greys", () => {
  const ink = parseHex(value("playful", "instrument.ink.cap"));
  for (const preset of ["rubberSky", "rubberCoral"]) {
    const ratio = contrast(ink, parseHex(value("playful", `instrument.material.${preset}.base.colour`)));
    assert.ok(ratio >= 4.5, `ink on ${preset}: ${ratio.toFixed(2)}`);
  }
  for (const preset of ["rubberSky", "rubberCoral", "candyYellow", "candyLime", "candyPink", "candyMint", "candyGrape"]) {
    const [r, g, b] = parseHex(value("playful", `instrument.material.${preset}.base.colour`));
    assert.ok(Math.max(r, g, b) - Math.min(r, g, b) >= 90, `${preset} is saturated`);
  }
});

test("playful's sound set stays inside the feedback ranges, is brighter and shorter than premium's and studio's, and whether sound is on is never a character's", () => {
  const playful = bundle("playful").feedback, studio = bundle("studio").feedback, ranges = strataTokens.feedback;
  for (const kind of ["click", "tick", "thunk", "snap"]) for (const key of ["pitch", "decay", "noise"]) {
    const { min, max } = ranges[kind][key].$extensions["dev.underglass.strata"], v = playful[kind][key].$value;
    assert.ok(v >= min && v <= max, `${kind}.${key} ${v} in ${min}-${max}`);
    assert.notEqual(v, ranges[kind][key].$value, `${kind}.${key} is playful's own`);
  }
  // Bright and cheerful: higher in pitch, shorter to decay and less noisy than premium's, on every sound.
  for (const kind of ["click", "tick", "thunk", "snap"]) {
    assert.ok(playful[kind].pitch.$value > ranges[kind].pitch.$value && playful[kind].pitch.$value > studio[kind].pitch.$value, `${kind} is higher`);
    assert.ok(playful[kind].decay.$value < ranges[kind].decay.$value && playful[kind].decay.$value < studio[kind].decay.$value, `${kind} is shorter`);
    assert.ok(playful[kind].noise.$value < ranges[kind].noise.$value, `${kind} is cleaner`);
    assert.ok(playful[kind].noise.$value <= 0.3, `${kind}: a little noise at most`);
  }
  assert.ok(playful.thunk.pitch.$value > 200, "a pop, not a thud");
  const rogue = { $extensions: { "dev.underglass.strata": { character: { name: "rogue", provisional: [] } } }, feedback: { sound: { $type: "number", $value: 1 }, haptics: { $type: "number", $value: 1 } } };
  assert.deepEqual(createStrataTheme({ character: rogue }).issues.map(issue => issue.path).sort(), ["feedback.haptics", "feedback.sound"]);
  assert.ok(!paths("playful").has("feedback.sound") && !paths("playful").has("feedback.haptics"));
});

test("playful is bouncy: every spring is underdamped at a ratio of 0.5 to 0.6, with a lively detent, a fat pointer and a wall default", () => {
  assert.ok(springs.length >= 10);
  for (const name of springs) {
    const zeta = ratioOf("playful", name);
    assert.ok(zeta >= 0.5 && zeta <= 0.6, `${name} damping ratio ${zeta.toFixed(3)}`);
    assert.ok(value("playful", `spring.${name}.damping`) >= 5 && value("playful", `spring.${name}.stiffness`) >= 50, `${name} inside the token ranges`);
  }
  assert.ok(value("playful", "spring.detent.stiffness") < value("studio", "spring.detent.stiffness") && ratioOf("playful", "detent") < 0.55, "a lively, soft detent");
  assert.equal(value("playful", "knob.pointer.width"), "4px");
  assert.equal(value("playful", "form.switch"), "wall");
});

test("a bounce settles inside the stops: the clamped throw never passes a stop, a detent overshoots its target and then rests on it", () => {
  // Every switch throw (the clamped rule of the switch forms): inside the stops, reaching the far stop, resting on it.
  for (const name of ["slide", "rocker", "bat", "wall", "button"]) {
    const spring = { stiffness: value("playful", `spring.${name}.stiffness`), damping: value("playful", `spring.${name}.damping`) };
    const samples = switchThrow(spring);
    assert.ok(samples.every(t => t >= 0 && t <= 1), `${name}: inside the stops`);
    assert.equal(samples.at(-1), 1);
    assert.ok(samples.length * 0.004 < 2, `${name}: rests within 2 s`);
    const clamped = { t: 0.99, v: 30 };
    stepSpring(clamped, 1, spring);
    assert.deepEqual(clamped, { t: 1, v: 0 }, `${name}: the velocity into a stop is dropped`);
  }
  // A detented knob (the playful detent spring) between the detents of an 11-position knob: it overshoots the target,
  // stays between the stops, and rests exactly on the target.
  const detent = { stiffness: value("playful", "spring.detent.stiffness"), damping: value("playful", "spring.detent.damping") };
  let worst = 0, longest = 0;
  for (let from = 0; from <= 10; from++) for (let to = 0; to <= 10; to++) {
    if (from === to) continue;
    const spring = { t: from / 10, v: 0, time: 0 }, target = to / 10;
    let now = 0, peak = spring.t, frames = 0;
    while (!advanceSpring(spring, target, (now += 16), detent) && frames < 400) {
      frames++;
      peak = from < to ? Math.max(peak, spring.t) : Math.min(peak, spring.t);
      assert.ok(spring.t >= 0 && spring.t <= 1);
    }
    assert.equal(spring.t, target, `${from} to ${to} rests on the detent`);
    if (to > 0 && to < 10) worst = Math.max(worst, Math.abs(peak - target) / Math.abs(target - from / 10));
    longest = Math.max(longest, now);
  }
  const theory = overshootOf(ratioOf("playful", "detent"));
  assert.ok(worst > 0.1 && worst <= theory + 0.03, `a detent step overshoots by ${(worst * 100).toFixed(1)}% (theory ${(theory * 100).toFixed(1)}%)`);
  assert.ok(longest < 1500, `and rests within ${longest} ms`);
});

test("the knob's pose stays in its box over the whole overshoot: core's containment check at the playful spring's maximum overshoot", () => {
  // The unclamped maximum overshoot of the knob and detent springs stretches the sweep past both stops, which is more
  // than the clamped spring ever draws; the pose range the check is given then covers every frame of a bounce.
  const overshoot = Math.max(...["knob", "detent"].map(name => overshootOf(ratioOf("playful", name))));
  assert.ok(overshoot > 0.09 && overshoot < 0.2, `overshoot ${overshoot.toFixed(3)}`);
  const sweep = 270 * (1 + 2 * overshoot), materials = characterMaterials(rawFor("playful"), "#ff3d8b");
  for (const scale of [0.6, 1, 1.6]) {
    const profiles = {}, profile = (name, shape) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
    const object = knobObject({ id: "volume", box: [0, 0, 140, 140], skirt: 64, cap: 52, t: 0.62, sweep, scale, pointerWidth: 4, state: { hover: false, disabled: false }, relief: { height: 3, material: "knobCap" } }, profile);
    const frontier = containmentFrontier(object, profiles);
    const result = checkContainment(object, profiles, frontier, { matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0, scale: 1 }, vanish: [960, 540], distance: 2400 });
    assert.ok(result.contained, `depth scale ${scale}: inset ${result.inset} with the sweep stretched to ${sweep.toFixed(0)} degrees`);
    // The scene validates with playful's materials too (the coat and the matte rubber are valid recipes).
    const scene = validateInstrumentScene({ format: "strata-scene", version: 4, kind: "instrument", camera: { distance: 2400, vanish: [960, 540] }, environment: { source: "studio", strength: 1.25 },
      extent: { width: 400, height: 300 }, backdrop: "#ffffff", light: { azimuth: 323, elevation: 41, intensity: 1.6 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
      shadow: { strength: 0.24 }, interior: { max: 0.04 }, state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 },
      focus: { colour: "#2563eb", width: 3, offset: 0.5 }, materials: { matte: { base: { roughness: 0.6 } }, knobCap: materials.knobCap, knobSkirt: materials.knobSkirt, knobChamfer: materials.knobChamfer, knobInk: materials.knobInk },
      primitives: [{ face: "raised", rect: [0, 0, 400, 300], radius: 12, height: 8, material: "matte" }], profiles, objects: [object] });
    assert.equal(scene.objects.length, 1);
  }
});

test("playful keeps the invariants: the light, colours other than the glow, focus and target size are premium's and the defaults'", () => {
  const playful = createStrataTheme({ character: "playful" }).toJSON(), base = strataTokens;
  assert.deepEqual(playful.light, base.light);
  assert.deepEqual(playful.colour.accent, base.colour.accent);
  assert.deepEqual(playful.focus, base.focus);
  assert.deepEqual(playful.target, base.target);
  assert.deepEqual(playful.interior, base.interior);
  assert.equal(playful.colour.glowOn.$value, "#ff3d8b");
  const scoped = [...new Set(createStrataTheme({ character: "playful" }, { scoped: true }).issues.map(issue => issue.path))];
  assert.ok(scoped.includes("studio.key") && scoped.includes("environment.intensity") && scoped.length === 8, `reported: ${scoped}`);
  assert.deepEqual(createStrataTheme({ character: "playful" }).issues, []);
});

test("the characters stylesheet carries playful: its block, the room on the root alone, premium restating what playful sets", () => {
  const css = charactersToCss();
  const block = selector => css.split("\n").flatMap((line, index, lines) => line === `  ${selector} {` ? [lines.slice(index + 1, lines.indexOf("  }", index)).map(l => l.trim())] : [])[0];
  const scoped = name => block(`[data-strata-character="${name}"], [data-strata-character="${name}"] [data-strata-theme]`);
  const root = name => block(`:root[data-strata-character="${name}"]`);
  const names = lines => lines.map(line => line.slice(0, line.indexOf(":")));
  assert.ok(scoped("playful").includes("--strata-spring-detent-stiffness: 700;"));
  assert.ok(scoped("playful").includes("--strata-feedback-thunk-pitch: 260;"));
  assert.ok(scoped("playful").includes("--strata-material-roles-knob-cap: rubberSky;"));
  assert.ok(scoped("playful").includes("--strata-material-roles-knob-skirt: candyYellow;"));
  assert.ok(scoped("playful").includes("--strata-knob-pointer-width: 4px;"));
  assert.ok(root("playful").includes("--strata-studio-key: 7;") && root("playful").includes("--strata-environment-intensity: 0.9;"));
  assert.ok(!scoped("playful").some(line => /--strata-(studio|environment)-/.test(line)), "the room is not declared on a scope");
  assert.deepEqual(names(scoped("premium")).sort(), names(scoped("playful")).sort());
  assert.deepEqual(names(root("premium")).sort(), names(root("playful")).sort());
  assert.deepEqual(names(scoped("studio")).sort(), names(scoped("playful")).sort());
  assert.ok(scoped("premium").includes("--strata-spring-detent-stiffness: 900;") && scoped("premium").includes("--strata-material-roles-knob-cap: metal;"));
  assert.ok(scoped("premium").some(line => /^--strata-instrument-material-candy-yellow-base-colour: initial;$/.test(line)), "premium has no candy lacquer: a nested premium scope clears it");
  assert.match(css, /\[data-strata-character="playful"\]\[data-strata-theme="dark"\][^{]*\{\s*--strata-material-roles-plate: candyGrape;/);
  assert.match(css, /\[data-strata-character="playful"\]\[data-strata-theme="light"\][^{]*\{\s*--strata-material-roles-plate: candyMint;/);
  assert.match(css, /--strata-finish-role-knob-skirt: var\(--strata-finish-candyYellow\);/);
});

test("the Instrument materials follow playful: premium builds the premium tables exactly, playful its own", () => {
  assert.equal(characterMaterials(() => "", "#ff9228"), undefined, "no character on the page: the premium tables stand");
  for (const theme of ["light", "dark"]) {
    const built = characterMaterials(rawFor("premium", theme), "#ff9228");
    for (const name of ["knobCap", "knobSkirt", "knobChamfer", "knobInk"]) assert.deepEqual(built[name], premiumMaterials[name], `premium ${name} (${theme})`);
    for (const name of ["faderCap", "faderChamfer", "faderInk"]) assert.deepEqual(built[name], faderMaterials[name], `premium ${name} (${theme})`);
    for (const name of ["switchCap", "switchChamfer", "switchLever", "switchBezel", "switchInk", "switchFlagOn", "switchFlagOff"]) assert.deepEqual(built[name], switchMaterials[name], `premium ${name} (${theme})`);
    assert.deepEqual(built.switchPlate, switchMaterials[theme === "dark" ? "switchPlateDark" : "switchPlate"], `premium plate (${theme})`);
    assert.equal(built.switchPlate.coat, undefined, "the premium presets in use have no coat");
  }
  const playful = characterMaterials(rawFor("playful"), "#ff3d8b");
  assert.deepEqual(playful.knobCap.base, { colour: "#2d93ff", metallic: 0, roughness: 0.82, direct: 1 });
  assert.equal(playful.knobCap.brush, undefined, "rubber has no brush");
  assert.equal(playful.knobCap.coat, undefined, "and no coat");
  assert.equal(playful.faderCap.base.colour, "#ff6a5c");
  assert.equal(playful.knobChamfer.base.colour, "#2d93ff", "the cap's own material, polished");
  assert.equal(playful.knobChamfer.base.roughness, 0.06);
  assert.equal(playful.knobSkirt.base.colour, "#ffd12e");
  assert.deepEqual(playful.knobSkirt.coat, { strength: 1, roughness: 0.04, ior: 1.5 });
  assert.equal(playful.knobInk.base.colour, "#1a1240");
  assert.equal(playful.switchFlagOn.emissive.colour, "#ff3d8b");
  assert.equal(playful.switchLever.base.colour, "#8be04a");
  assert.equal(playful.switchBezel.base.colour, "#fff2d6");
  assert.equal(playful.switchPlate.base.colour, "#5fd6c0");
  const dark = characterMaterials(rawFor("playful", "dark"), "#ff3d8b");
  assert.equal(dark.switchPlateDark.base.colour, "#3b2680", "grape in the dark");
  assert.equal(dark.switchPlateDark.coat.strength, 1);
  // Studio's own materials are unchanged by playful being there.
  assert.equal(characterMaterials(rawFor("studio"), "#ffb020").knobSkirt.base.colour, "#2a2c31");
});
