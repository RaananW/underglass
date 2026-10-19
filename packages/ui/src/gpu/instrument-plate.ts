/**
 * Plates and trays at the Instrument level (design language section 6, the Instrument object table; Rendering Model part 2D): a
 * Card, a Panel or a Dialog as a machined plate, a Card's or a Panel's tray as a recessed well with a groove wall, and a Drawer
 * as a tray open on its chassis edge, as an object of parts for core's `instrument` material (anatomy pages `card.md`,
 * `panel.md`, `dialog.md`, `drawer.md`). The helper never imports core, so the version 4 shapes are restated here as the subset
 * these objects write.
 * - **rim** (a plate): a `mesh` swept along the element's rounded outline, inset by the box rule's margin: a 4 px wide bar
 *   3 high (× 0.6, 1, 1.6 with depth) with a 1.4 px chamfer on its outer edge, in polished metal (`plateEdge`, gunmetal
 *   `plateEdgeDark` on a dark faceplate). The captured face inside it is the element's own, so its content is untouched;
 *   there are no screws.
 * - **wall** (a tray): the same sweep as a lip: a vertical outer face, a flat top 4 wide and an inner face running 3 px down into
 *   the recess (`trayWall`, `trayWallDark`). A Drawer's wall is open on the edge it slides from.
 * - **rise** (a Dialog's plate, a Drawer's tray): `t` is how far the part has come out of the chassis, 0 sunk to just proud of
 *   the face, 1 at its resting height, as a `travel` pose from `−(height − 0.3)` to 0. The helper drives it from the panel
 *   motion's eased progress, so it is a uniform update (no recapture), and reduced motion makes it instant.
 * No part casts on the face (`caster: null`): the element's own Relief slab or well carries its shadow, and the rim stays inside
 * its box. Every rim vertex lies at least `boxMargin` inside the element's rounded box over the whole rise, so it passes the
 * Rendering Model's containment (2D.9) with the margin the key's body uses.
 */
import { boxMargin, type InstrumentInlineMesh, type InstrumentProfile } from "./instrument.ts";

type Vec3 = [number, number, number];
type Box = [number, number, number, number];

/** A plate's or a tray's form. */
export type PlateForm = "plate" | "tray";
/** Which side of a tray is open (a Drawer's chassis edge). */
export type PlateOpen = "left" | "right" | "top" | "bottom";

/** The numbers of the rim and the wall at a depth scale, px (`plate.*` and `tray.*` tokens at 50% depth). */
export interface PlateTokens { rim: number; height: number; chamfer: number; wall: number; slope: number }
export const plateTokenDefaults: PlateTokens = { rim: 4, height: 3, chamfer: 1.4, wall: 4, slope: 3 };

/**
 * The premium character's plate materials: polished aluminium for a rim, a satin lip for a tray's wall, and gunmetal on a dark faceplate (the
 * Switch's wall plate). Neither is brushed: a brush is mapped planar from the part's top, so it would streak the vertical faces of the rim.
 */
export const plateMaterials: Record<"plateEdge" | "plateEdgeDark" | "trayWall" | "trayWallDark", { base: { colour: string; roughness: number; metallic: number; direct: number } }> = {
  plateEdge: { base: { colour: "#eff0f1", metallic: 1, roughness: 0.2, direct: 1 } },
  plateEdgeDark: { base: { colour: "#80838a", metallic: 1, roughness: 0.3, direct: 1 } },
  trayWall: { base: { colour: "#e3e5e8", metallic: 0.6, roughness: 0.45, direct: 1 } },
  trayWallDark: { base: { colour: "#5c5f66", metallic: 0.6, roughness: 0.5, direct: 1 } },
};

/** An inline `mesh` profile as core takes it (Rendering Model 2D.2): flat positions, normals and a triangle list. */
export type PlateMesh = InstrumentInlineMesh;

/** A rim or a wall as an Instrument object. */
export interface PlateObject {
  id: string;
  rect: Box;
  bounds: { rect: Box; radius: number };
  t: number;
  parts: { kind: "plate" | "bezel"; profile: string; at: Vec3; pose?: { from: { travel: number }; to: { travel: number } }; material: string; caster: null; state: { hover: false; disabled: boolean } }[];
  relief: { face: "raised" | "well"; rect: Box; radius: number; height: number; material: string };
}

/** What a plate's or a tray's object needs from the page, in panel px. */
export interface PlateInput {
  id: string;
  /** The element's border box. */
  box: Box;
  /** Its corner radii, clockwise from the top left. */
  radii: [number, number, number, number];
  form: PlateForm;
  /** How far out of the chassis it stands now, 0–1; given with `rises`. */
  t: number;
  /** Whether `t` moves the part (a Dialog's plate, a Drawer's tray); otherwise the part is fixed at its resting height. */
  rises: boolean;
  /** A tray's open side (a Drawer's chassis edge). */
  open?: PlateOpen;
  /** The depth scale of heights (0.6, 1, 1.6 at depth 0, 0.5, 1). */
  scale: number;
  stage: { width: number; height: number };
  /** A dark faceplate: gunmetal. */
  dark: boolean;
  disabled?: boolean;
  tokens?: Partial<PlateTokens>;
  /** The Relief primitive drawn instead if the object cannot be drawn as parts. */
  relief: { height: number; material: string };
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/** The rim's or the wall's numbers at a depth scale. */
export function plateParts(form: PlateForm, scale: number, tokens: Partial<PlateTokens> = {}) {
  const t = { ...plateTokenDefaults, ...tokens };
  const height = round(t.height * scale);
  return form === "plate"
    ? { height, width: t.rim, chamfer: Math.min(t.chamfer, height - 0.2, t.rim - 0.2) }
    : { height, width: t.wall, slope: t.slope, chamfer: 0 };
}

/** The margin the part keeps inside the element's box (the box rule, 2D.3), px. */
export const plateMargin = (form: PlateForm, scale: number, stage: { width: number; height: number }, tokens?: Partial<PlateTokens>) =>
  boxMargin(plateParts(form, scale, tokens).height + 1, stage);

interface CrossPoint { d: number; z: number }
interface CrossFace { from: CrossPoint; to: CrossPoint; /** Normal in (inward, up). */ n: [number, number] }

/** The cross-section's visible faces, from the outer edge in (d is the distance inward from the outline). */
function crossSection(form: PlateForm, parts: ReturnType<typeof plateParts>): CrossFace[] {
  const h = parts.height, w = parts.width;
  if (form === "plate") {
    const c = parts.chamfer, k = Math.SQRT1_2;
    return [
      { from: { d: 0, z: 0 }, to: { d: 0, z: round(h - c) }, n: [-1, 0] },
      { from: { d: 0, z: round(h - c) }, to: { d: c, z: h }, n: [-k, k] },
      { from: { d: c, z: h }, to: { d: w, z: h }, n: [0, 1] },
      { from: { d: w, z: h }, to: { d: w, z: 0 }, n: [1, 0] },
    ];
  }
  const s = (parts as { slope: number }).slope, run = Math.hypot(h, s);
  return [
    { from: { d: 0, z: 0 }, to: { d: 0, z: h }, n: [-1, 0] },
    { from: { d: 0, z: h }, to: { d: w, z: h }, n: [0, 1] },
    { from: { d: w, z: h }, to: { d: round(w + s), z: 0 }, n: [round(h / run), round(s / run)] },
  ];
}

/** The path of the element's rounded outline inset by `margin`, clockwise from the top left corner, in four corners of points. */
function outline(box: Box, radii: [number, number, number, number], margin: number): { x: number; y: number; ox: number; oy: number }[][] {
  const [x, y, w, h] = box, left = x + margin, top = y + margin, right = x + w - margin, bottom = y + h - margin;
  const reach = Math.max(0.5, Math.min((right - left) / 2, (bottom - top) / 2));
  const centres: [number, number][] = [];
  const rs = radii.map(radius => Math.min(reach, Math.max(0.5, radius - margin)));
  centres.push([left + rs[0]!, top + rs[0]!], [right - rs[1]!, top + rs[1]!], [right - rs[2]!, bottom - rs[2]!], [left + rs[3]!, bottom - rs[3]!]);
  const starts = [Math.PI, Math.PI * 1.5, 0, Math.PI * 0.5];
  const steps = 6;
  return centres.map(([cx, cy], corner) => Array.from({ length: steps + 1 }, (_, step) => {
    const angle = starts[corner]! + (Math.PI / 2) * (step / steps), ox = Math.cos(angle), oy = Math.sin(angle);
    return { x: cx + rs[corner]! * ox, y: cy + rs[corner]! * oy, ox, oy };
  }));
}

/**
 * The mesh of a rim or a wall, in part-local px (the origin at the element's centre, `z` up from the face): the cross-section's
 * faces swept along the outline, one flat-shaded band per face. A tray's open side is not closed.
 */
export function plateMesh(input: Pick<PlateInput, "box" | "radii" | "form" | "scale" | "stage" | "open" | "tokens">, id = "plate"): PlateMesh {
  const parts = plateParts(input.form, input.scale, input.tokens);
  const margin = plateMargin(input.form, input.scale, input.stage, input.tokens);
  const [x, y, w, h] = input.box, cx = x + w / 2, cy = y + h / 2;
  const corners = outline(input.box, input.radii, margin);
  const faces = crossSection(input.form, parts);
  // Which connections between corners are made: top (TL to TR), right, bottom, left; the open side is not.
  const sides: PlateOpen[] = ["top", "right", "bottom", "left"];
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const face of faces) {
    const rows: number[][] = [];
    // One column of two vertices (the face's two edges) per outline point; the rows are the points in order.
    const flat = corners.flat();
    flat.forEach(point => {
      const column: number[] = [];
      for (const edge of [face.from, face.to]) {
        column.push(positions.length / 3);
        positions.push(round(point.x - point.ox * edge.d - cx), round(point.y - point.oy * edge.d - cy), edge.z);
        normals.push(round(-point.ox * face.n[0]), round(-point.oy * face.n[0]), round(face.n[1]));
      }
      rows.push(column);
    });
    const quad = (a: number[], b: number[]) => { indices.push(a[0]!, b[0]!, b[1]!, a[0]!, b[1]!, a[1]!); };
    corners.forEach((corner, cornerIndex) => {
      const first = cornerIndex * corner.length;
      // Within the corner.
      for (let step = 0; step < corner.length - 1; step++) quad(rows[first + step]!, rows[first + step + 1]!);
      // To the next corner along the side that follows this one, unless that side is open.
      if (input.open !== sides[cornerIndex]) quad(rows[first + corner.length - 1]!, rows[((cornerIndex + 1) % corners.length) * corner.length]!);
    });
  }
  return { type: "mesh", id, positions, normals, indices };
}

const meshes = new Map<string, PlateMesh>();
/** A short hash of a string (FNV-1a), to name a mesh. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { h ^= text.charCodeAt(index); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}
/** One mesh per distinct shape, held between scenes: core validates an inline mesh once per array identity. */
function cachedMesh(input: Pick<PlateInput, "box" | "radii" | "form" | "scale" | "stage" | "open" | "tokens">): { key: string; mesh: PlateMesh } {
  const key = JSON.stringify([input.form, input.box[2], input.box[3], input.radii, input.scale, input.open ?? null, input.stage.width, input.stage.height, input.tokens ?? null]);
  let mesh = meshes.get(key);
  if (!mesh) {
    if (meshes.size >= 48) meshes.clear();
    mesh = plateMesh(input, `${input.form}-${Math.round(input.box[2])}x${Math.round(input.box[3])}-${hash(key)}`);
    meshes.set(key, mesh);
  }
  return { key, mesh };
}

/** A plate or a tray as an Instrument object; `profile` registers a shape and returns its name. */
export function plateObject(input: PlateInput, profile: (name: string, shape: InstrumentProfile) => string): PlateObject {
  const [x, y, w, h] = input.box, parts = plateParts(input.form, input.scale, input.tokens), { mesh } = cachedMesh(input);
  const name = profile(`${input.form}-rim`, mesh);
  const material = input.form === "plate" ? (input.dark ? "plateEdgeDark" : "plateEdge") : input.dark ? "trayWallDark" : "trayWall";
  const sunk = round(-(parts.height - 0.3));
  const t = input.rises ? Math.min(1, Math.max(0, input.t)) : 1;
  const radius = Math.min(...input.radii);
  return {
    id: input.id, rect: input.box, bounds: { rect: input.box, radius }, t,
    parts: [{ kind: input.form === "plate" ? "plate" : "bezel", profile: name, at: [round(x + w / 2), round(y + h / 2), 0], ...(input.rises ? { pose: { from: { travel: sunk }, to: { travel: 0 } } } : {}),
      material, caster: null, state: { hover: false, disabled: !!input.disabled } }],
    relief: { face: input.form === "plate" ? "raised" : "well", rect: input.box, radius, height: input.relief.height, material: input.relief.material },
  };
}
