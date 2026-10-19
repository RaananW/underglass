/**
 * The Display's `segments` look (anatomy page `display.md`, section 11; design language section 6): a seven-segment face for the text
 * under the glass, and the unlit segments printed faintly behind it. The text stays the native element's own, exact and selectable;
 * only the typeface changes, so the face is a font, and Strata draws it itself: no third-party font is vendored and no licence is
 * taken on. The glyphs are seven hexagonal segments (the lit ones of a character) on a fixed 600-unit cell, written here as data,
 * and `segmentsFont()` assembles a TrueType file from them (deterministic, about 5 KB) that the stylesheet build embeds as a data
 * URI (`@font-face` for `Strata Segments`, token `font.segments`). The same segments, all seven, are the ghost: a mask the CSS tiles
 * behind the text, so the lit and unlit segments are one drawing and always line up.
 *
 * Coverage is honest: digits, the letters a seven-segment display can draw (A b C c d E F G H h I J L n o P q r S t U u y, either
 * case where the shape is the same), the minus, underscore and equals, the full stop and colon (each takes a cell). Any other
 * character has no glyph here, so the stack falls to the code face (`font.mono`) for it. A fourteen-segment or dot-matrix face is a
 * follow-up: this one is the cheap form.
 */

/** The em, and the cell: every glyph advances `SEGMENT_ADVANCE` units. */
export const SEGMENT_EM = 1000;
export const SEGMENT_ADVANCE = 600;
/** The letter spacing the look adds (units): the ghost tile is the cell plus it. */
export const SEGMENT_SPACING = 80;
/** The digit's box: its left and right edges in the cell, its height from the baseline, a segment's thickness, and the gap tips keep from each other. */
const LEFT = 80, RIGHT = 520, HEIGHT = 700, THICK = 70, TIP = 6;
/** The ascent and descent that put the digit's centre (350 units) on the line box's centre, whatever the line height. */
export const SEGMENT_ASCENT = 850, SEGMENT_DESCENT = 150;

type Point = [number, number];
type Segment = "a" | "b" | "c" | "d" | "e" | "f" | "g";
export const segmentNames: readonly Segment[] = ["a", "b", "c", "d", "e", "f", "g"];

/** An elongated hexagon (pointed ends) centred on (cx, cy), `length` long and `THICK` across, horizontal or vertical. */
function hexagon(cx: number, cy: number, length: number, horizontal: boolean): Point[] {
  const h = THICK / 2, half = length / 2;
  const along: Point[] = [[-half, 0], [-half + h, h], [half - h, h], [half, 0], [half - h, -h], [-half + h, -h]];
  return along.map(([u, v]) => (horizontal ? [cx + u, cy + v] : [cx + v, cy + u]) as Point);
}

const middle = HEIGHT / 2, h = THICK / 2;
const horizontalLength = RIGHT - LEFT - THICK - 2 * TIP, verticalLength = HEIGHT / 2 - h - 2 * TIP;
/** The seven segments' outlines in the cell, y up from the baseline. Tips sit `TIP` units off the corner point, so neighbours keep a 45 degree gap. */
export const segmentShapes: Record<Segment, Point[]> = {
  a: hexagon(300, HEIGHT - h, horizontalLength, true),
  g: hexagon(300, middle, horizontalLength, true),
  d: hexagon(300, h, horizontalLength, true),
  f: hexagon(LEFT + h, (HEIGHT - h + middle) / 2, verticalLength, false),
  b: hexagon(RIGHT - h, (HEIGHT - h + middle) / 2, verticalLength, false),
  e: hexagon(LEFT + h, (middle + h) / 2, verticalLength, false),
  c: hexagon(RIGHT - h, (middle + h) / 2, verticalLength, false),
};

/** The lit segments of each character the face draws (a string of segment letters). */
const lit: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg", "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
  A: "abcefg", b: "cdefg", C: "adef", c: "deg", d: "bcdeg", E: "adefg", F: "aefg", G: "acdef", H: "bcefg", h: "cefg", I: "ef", i: "c", J: "bcde", L: "def",
  n: "ceg", o: "cdeg", P: "abefg", q: "abcfg", r: "eg", S: "acdfg", t: "defg", U: "bcdef", u: "cde", y: "bcdfg",
  "-": "g", "_": "d", "=": "dg", " ": "",
};
/** Characters that take another's shape (the letter's other case, the digit it resembles). */
const alias: Record<string, string> = {
  a: "A", B: "b", D: "d", e: "E", f: "F", g: "G", j: "J", l: "L", N: "n", O: "0", p: "P", Q: "q", R: "r", s: "S", T: "t", V: "U", v: "u", Y: "y", Z: "2", z: "2", "–": "-", "—": "-",
};
/** A square dot of this side (units) at (x, y): the full stop and the colon. */
const DOT = 80;
const square = (x: number, y: number): Point[] => [[x, y], [x, y + DOT], [x + DOT, y + DOT], [x + DOT, y]];
const dots: Record<string, Point[][]> = {
  ".": [square(260, 0)],
  ":": [square(260, 150), square(260, 470)],
};

/** The outlines of one character (a list of closed contours), or undefined when the face has no glyph for it. */
export function segmentGlyph(character: string): Point[][] | undefined {
  const key = lit[character] !== undefined ? character : alias[character];
  if (key !== undefined && lit[key] !== undefined) return segmentNames.filter(name => lit[key]!.includes(name)).map(name => segmentShapes[name]);
  return dots[character];
}

/** Every character the face draws, in code point order. */
export const segmentCharacters: string[] = [...new Set([...Object.keys(lit), ...Object.keys(alias), ...Object.keys(dots)])].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);

/** The ghost: all seven segments as an SVG path (y down), in a tile of the cell plus the letter spacing, for the stylesheet's mask. */
export function segmentsGhost(): { width: number; height: number; path: string } {
  const path = segmentNames.map(name => `M${segmentShapes[name].map(([x, y]) => `${x} ${HEIGHT - y}`).join("L")}Z`).join("");
  return { width: SEGMENT_ADVANCE + SEGMENT_SPACING, height: HEIGHT, path };
}
/** The ghost as the CSS `url()` of a data URI SVG. */
export function segmentsGhostUrl(): string {
  const { width, height, path } = segmentsGhost();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${width} ${height}'><path d='${path}'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")}")`;
}

// ---------------------------------------------------------------------------------------------------------------------
// The TrueType file.

class Bytes {
  data: number[] = [];
  u8(value: number) { this.data.push(value & 0xff); return this; }
  u16(value: number) { this.data.push((value >> 8) & 0xff, value & 0xff); return this; }
  i16(value: number) { return this.u16(value < 0 ? value + 0x10000 : value); }
  u32(value: number) { this.data.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff); return this; }
  tag(text: string) { for (const character of text) this.u8(character.charCodeAt(0)); return this; }
  pad(multiple: number) { while (this.data.length % multiple) this.u8(0); return this; }
  get length() { return this.data.length; }
}

const area = (contour: Point[]) => contour.reduce((sum, [x, y], index) => { const [nx, ny] = contour[(index + 1) % contour.length]!; return sum + (x * ny - nx * y); }, 0) / 2;

/** One simple glyph: contours clockwise (the TrueType outer direction in y-up), every point on the curve, int16 deltas. */
function glyphData(contours: Point[][]): Bytes {
  const out = new Bytes();
  if (!contours.length) return out;
  const wound = contours.map(contour => (area(contour) > 0 ? [...contour].reverse() : contour));
  const points = wound.flat();
  out.i16(wound.length);
  out.i16(Math.min(...points.map(p => p[0]))).i16(Math.min(...points.map(p => p[1]))).i16(Math.max(...points.map(p => p[0]))).i16(Math.max(...points.map(p => p[1])));
  let end = -1;
  for (const contour of wound) { end += contour.length; out.u16(end); }
  out.u16(0);
  for (let index = 0; index < points.length; index++) out.u8(1);
  let previous = 0;
  for (const [x] of points) { out.i16(Math.round(x) - previous); previous = Math.round(x); }
  previous = 0;
  for (const [, y] of points) { out.i16(Math.round(y) - previous); previous = Math.round(y); }
  return out.pad(4);
}

const checksum = (bytes: number[]) => {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 4) sum = (sum + (((bytes[index] ?? 0) << 24) | ((bytes[index + 1] ?? 0) << 16) | ((bytes[index + 2] ?? 0) << 8) | (bytes[index + 3] ?? 0))) >>> 0;
  return sum;
};

export const SEGMENTS_FAMILY = "Strata Segments";

/** The face as TrueType bytes: .notdef, one glyph per character of `segmentCharacters`, deterministic. */
export function segmentsFont(): Uint8Array {
  const notdef: Point[][] = [[[LEFT, 0], [LEFT, HEIGHT], [RIGHT, HEIGHT], [RIGHT, 0]], [[LEFT + 40, 40], [RIGHT - 40, 40], [RIGHT - 40, HEIGHT - 40], [LEFT + 40, HEIGHT - 40]]];
  const glyphs = [glyphData(notdef), ...segmentCharacters.map(character => glyphData(segmentGlyph(character) ?? []))];
  const count = glyphs.length;
  const everyPoint = [notdef, ...segmentCharacters.map(character => segmentGlyph(character) ?? [])].flatMap(contours => contours.flat());
  const xs = everyPoint.map(p => p[0]), ys = everyPoint.map(p => p[1]);
  const [xMin, xMax, yMin, yMax] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const maxPoints = Math.max(...[notdef, ...segmentCharacters.map(character => segmentGlyph(character) ?? [])].map(contours => contours.flat().length));
  const maxContours = Math.max(...[notdef, ...segmentCharacters.map(character => segmentGlyph(character) ?? [])].map(contours => contours.length));

  const glyf = new Bytes(), loca = new Bytes();
  for (const glyph of glyphs) { loca.u16(glyf.length / 2); glyf.data.push(...glyph.data); }
  loca.u16(glyf.length / 2);

  const head = new Bytes().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(3).u16(SEGMENT_EM).u32(0).u32(0).u32(0).u32(0)
    .i16(xMin).i16(yMin).i16(xMax).i16(yMax).u16(0).u16(8).i16(2).i16(0).i16(0);
  const hhea = new Bytes().u32(0x00010000).i16(SEGMENT_ASCENT).i16(-SEGMENT_DESCENT).i16(0).u16(SEGMENT_ADVANCE).i16(xMin).i16(SEGMENT_ADVANCE - xMax).i16(xMax)
    .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(count);
  const hmtx = new Bytes();
  [notdef, ...segmentCharacters.map(character => segmentGlyph(character) ?? [])].forEach(contours => hmtx.u16(SEGMENT_ADVANCE).i16(contours.length ? Math.min(...contours.flat().map(p => p[0])) : 0));
  const maxp = new Bytes().u32(0x00010000).u16(count).u16(maxPoints).u16(maxContours);
  // composite points, composite contours, zones (2), twilight points, storage, function defs, instruction defs, stack, instruction size, components, depth
  for (const value of [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0]) maxp.u16(value);

  const codes = segmentCharacters.map(character => character.codePointAt(0)!);
  const segCount = codes.length + 1;
  let entrySelector = 0; while (2 ** (entrySelector + 1) <= segCount) entrySelector++;
  const searchRange = 2 * 2 ** entrySelector;
  const cmap = new Bytes().u16(0).u16(1).u16(3).u16(1).u32(12);
  cmap.u16(4).u16(16 + 8 * segCount).u16(0).u16(2 * segCount).u16(searchRange).u16(entrySelector).u16(2 * segCount - searchRange);
  for (const code of codes) cmap.u16(code); cmap.u16(0xffff);
  cmap.u16(0);
  for (const code of codes) cmap.u16(code); cmap.u16(0xffff);
  codes.forEach((code, index) => cmap.u16((index + 1 - code + 0x10000) & 0xffff)); cmap.u16(1);
  for (let index = 0; index < segCount; index++) cmap.u16(0);

  const names = [[1, SEGMENTS_FAMILY], [2, "Regular"], [3, `${SEGMENTS_FAMILY} 1.0`], [4, SEGMENTS_FAMILY], [5, "Version 1.0"], [6, "StrataSegments-Regular"]] as const;
  const strings = names.map(([, text]) => { const out = new Bytes(); for (const character of text) out.u16(character.charCodeAt(0)); return out; });
  const name = new Bytes().u16(0).u16(names.length).u16(6 + 12 * names.length);
  let offset = 0;
  names.forEach(([id], index) => { name.u16(3).u16(1).u16(0x409).u16(id).u16(strings[index]!.length).u16(offset); offset += strings[index]!.length; });
  for (const string of strings) name.data.push(...string.data);

  const os2 = new Bytes().u16(3).i16(SEGMENT_ADVANCE).u16(400).u16(5).u16(0)
    .i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350).i16(50).i16(300).i16(0);
  for (let index = 0; index < 10; index++) os2.u8(0);
  os2.u32(1).u32(0).u32(0).u32(0).tag("UGSG").u16(0x40).u16(0x20).u16(0x7a).i16(SEGMENT_ASCENT).i16(-SEGMENT_DESCENT).i16(0).u16(SEGMENT_ASCENT).u16(SEGMENT_DESCENT)
    .u32(1).u32(0).i16(HEIGHT).i16(HEIGHT).u16(0).u16(0x20).u16(0);
  const post = new Bytes().u32(0x00030000).u32(0).i16(-100).i16(50).u32(1).u32(0).u32(0).u32(0).u32(0);

  const tables: [string, Bytes][] = [["OS/2", os2], ["cmap", cmap], ["glyf", glyf], ["head", head], ["hhea", hhea], ["hmtx", hmtx], ["loca", loca], ["maxp", maxp], ["name", name], ["post", post]];
  const out = new Bytes().u32(0x00010000).u16(tables.length);
  let power = 0; while (2 ** (power + 1) <= tables.length) power++;
  out.u16(16 * 2 ** power).u16(power).u16(16 * tables.length - 16 * 2 ** power);
  let position = 12 + 16 * tables.length;
  const placed = tables.map(([tag, bytes]) => { const at = position, size = bytes.length; bytes.pad(4); position += bytes.length; return { tag, bytes, at, size }; });
  for (const { tag, bytes, at, size } of placed) out.tag(tag).u32(checksum(bytes.data)).u32(at).u32(size);
  for (const { bytes } of placed) out.data.push(...bytes.data);
  // The whole file's checksum adjustment goes in `head` (offset 8 of the table).
  const headAt = placed.find(table => table.tag === "head")!.at;
  const adjustment = (0xb1b0afba - checksum(out.data)) >>> 0;
  out.data.splice(headAt + 8, 4, (adjustment >>> 24) & 0xff, (adjustment >>> 16) & 0xff, (adjustment >>> 8) & 0xff, adjustment & 0xff);
  return Uint8Array.from(out.data);
}

/** The `@font-face` rule that embeds the face (a data URI), written into the component stylesheet by the build. */
export function segmentsFontFace(): string {
  const base64 = btoa(String.fromCharCode(...segmentsFont()));
  return `@font-face {\n  font-family: "${SEGMENTS_FAMILY}";\n  font-style: normal;\n  font-weight: 400;\n  font-display: block;\n  src: url("data:font/ttf;base64,${base64}") format("truetype");\n}\n`;
}
