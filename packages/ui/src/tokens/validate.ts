/**
 * Validates a token source against the invariants of the Strata design language (`docs/ui-library/design-language.md`,
 * section 14): ranges and anchors, elevation order, contrast on lit faces and non-text contrast in every theme, the
 * taper rule, material roles, and the tokens only an application may set. The token build fails on any issue.
 */
import { contrast, onColour, parseHex, scale, type Rgb } from "./contrast.ts";
import { flatten, numeric, themesOf, type Token, type TokenGroup } from "./model.ts";

export interface Issue {
  path: string;
  message: string;
}

/** Text and non-text contrast thresholds (WCAG 2.2 AA). */
const text = 4.5, nonText = 3;

/** Every broken rule in `source`; an empty list means the source is valid. */
export function validateTokens(source: TokenGroup): Issue[] {
  const issues: Issue[] = [];
  const report = (path: string, message: string) => issues.push({ path, message });
  const tokens = flatten(source);
  const byPath = new Map(tokens.map(token => [token.path, token]));
  const get = (path: string): Token | undefined => { const token = byPath.get(path); if (!token) report(path, "missing"); return token; };
  const themes = Object.keys(themesOf(source));

  for (const token of tokens) {
    const { meta, path } = token;
    if (!token.$type) report(path, "has no $type");
    const inRange = (value: number, what: string) => {
      if (meta.min !== undefined && value < meta.min) report(path, `${what} ${value} is below the minimum ${meta.min}`);
      if (meta.max !== undefined && value > meta.max) report(path, `${what} ${value} is above the maximum ${meta.max}`);
    };
    if (typeof token.$value === "number" || token.$type === "dimension" || token.$type === "duration") inRange(numeric(token.$value), "default");
    if (meta.anchors) {
      if (meta.anchors.length !== 3) report(path, "needs three depth anchors");
      else if (meta.anchors[1] !== numeric(token.$value)) report(path, `the 50% anchor ${meta.anchors[1]} differs from the default`);
      for (const anchor of meta.anchors) inRange(anchor, "anchor");
    }
    if (meta.options && !meta.options.includes(String(token.$value))) report(path, `default ${String(token.$value)} is not an option`);
    if (token.$type === "color" && path.startsWith("colour.")) {
      for (const theme of themes) if (meta.themes?.[theme] === undefined) report(path, `has no value for the ${theme} theme`);
    }
  }

  // Elevation levels stay in order at every depth anchor.
  const levels = ["ground", "raised", "floating", "overlay", "modal"].map(level => get(`elevation.${level}`)?.meta.anchors);
  for (let anchor = 0; anchor < 3; anchor++) {
    for (let index = 1; index < levels.length; index++) {
      const below = levels[index - 1]?.[anchor], above = levels[index]?.[anchor];
      if (below !== undefined && above !== undefined && above <= below) report("elevation", `level ${index} is not above level ${index - 1} at anchor ${anchor}`);
    }
  }

  // Contrast on lit faces (section 8), in every theme, at rest and at the largest interior change.
  const interior = numeric(get("interior.max")?.$value ?? 0);
  const lit = [1, 1 + interior, 1 - interior];
  for (const theme of themes) {
    const colour = (role: string): Rgb => {
      const value = get(`colour.${role}`)?.meta.themes?.[theme];
      return typeof value === "string" ? parseHex(value) : [0, 0, 0];
    };
    const check = (label: string, ratio: number, minimum: number) => { if (ratio < minimum) report(`colour (${theme})`, `${label} is ${ratio.toFixed(2)}:1, under ${minimum}:1`); };
    const panel = colour("panel"), edge = colour("edge"), accent = colour("accent"), track = colour("track"), knob = colour("knob");
    for (const factor of lit) {
      // The rendering model changes a face interior and the text on it by one factor (rendering model, section
      // 2.9), so text is checked both as captured and at the same factor as its face.
      const pairs: [string, Rgb, Rgb][] = [["text on the panel", colour("text"), panel], ["muted text on the panel", colour("muted"), panel],
        ...["accent", "success", "warning", "danger", "info"].map((role): [string, Rgb, Rgb] => [`text on ${role}`, onColour(colour(role)), colour(role)])];
      for (const [label, foreground, face] of pairs) {
        check(`${label} at ×${factor}`, Math.min(contrast(foreground, scale(face, factor)), contrast(scale(foreground, factor), scale(face, factor))), text);
      }
      check(`the edge on the panel at ×${factor}`, contrast(edge, scale(panel, factor)), nonText);
    }
    check("text in fields", contrast(colour("text"), colour("field")), text);
    check("the focus colour on the panel", contrast(accent, panel), nonText);
    check("the edge on a field", contrast(edge, colour("field")), nonText);
    check("a knob on the track (or its edge ring)", Math.max(contrast(knob, track), contrast(edge, knob)), nonText);
    check("the accent fill on the track", contrast(accent, track), nonText);
    // A knob keeps its colour on the accent fill, ringed in on-accent where the knob itself is under 3:1.
    check("a knob on the accent fill (or its on-accent ring)", Math.max(contrast(knob, accent), contrast(onColour(accent), accent)), nonText);
    // Without relief (bevel gain 0), raised faces need an outline to keep their shape.
    const gain = get("bevel.gain")?.meta.themes?.[theme], outline = get("outline.width")?.meta.themes?.[theme];
    if (gain !== undefined && numeric(gain) === 0 && !(outline !== undefined && numeric(outline) >= 1)) report(`outline.width (${theme})`, "must be at least 1 px where the bevel gain is 0");
  }

  // The taper rule (section 6): the camera distance is derived so that drift never exceeds the taper (section 2),
  // which needs a positive taper wherever keys have height.
  const heights = get("object.keyHeight")?.meta.anchors, tapers = get("object.taper")?.meta.anchors;
  if (heights && tapers) {
    for (let anchor = 0; anchor < 3; anchor++) {
      if (heights[anchor]! > 0 && !(tapers[anchor]! > 0)) report("object.taper", `must be positive where keys have height (anchor ${anchor})`);
    }
  }

  // Material roles name existing presets, and colour aliases resolve.
  const presets = new Set(tokens.filter(token => token.path.startsWith("material.presets.")).map(token => token.path.split(".")[2]));
  for (const token of tokens) {
    if (token.path.startsWith("material.roles.") && !presets.has(String(token.$value))) report(token.path, `uses an unknown preset ${String(token.$value)}`);
    if (typeof token.$value === "string" && token.$value.startsWith("{") && !byPath.has(token.$value.slice(1, -1))) report(token.path, `alias ${token.$value} does not resolve`);
  }

  // One light per application: light and environment are application-only, as is the bevel profile.
  for (const token of tokens) {
    if (/^(light|environment)\./.test(token.path) && token.meta.scope !== false) report(token.path, "must be application-only (scope: false)");
  }
  if (get("bevel.profile")?.meta.scope !== false) report("bevel.profile", "must be application-only (scope: false)");
  const focus = get("focus.width");
  if (focus && (focus.meta.min ?? 0) < 2) report("focus.width", "the minimum must be at least 2 px");
  const target = get("target.min");
  if (target && (!target.meta.invariant || numeric(target.$value) < 24)) report("target.min", "must be an invariant of at least 24 px");

  return issues;
}
