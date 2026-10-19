/**
 * The structural forms (anatomy pages `card.md`, `panel.md`, `dialog.md` and `drawer.md`, *Plate and tray forms*; design language
 * sections 6 and 12): a Card or a Panel as a machined plate (`form="plate"`) or a recessed tray (`form="tray"`), a Dialog as a plate
 * that rises out of the chassis (`form="plate"`) and a Drawer as a tray that slides out of the chassis edge (`form="tray"`). The
 * names, the decorative markup every binding renders for them and the numbers of the GPU parts. Shared by the React, Vue and Astro
 * bindings, the GPU helper and the tests, so all of them agree.
 *
 * `flush`, or no `form`, is the Card, Panel, Dialog or Drawer of before, in markup and look. The control tree is never touched: the
 * plate form adds one attribute (`data-strata-form`) to the root, and the tray form also marks the element that holds the content (a
 * Card's body, a Drawer's body, a Panel's wrapper) as a well, so the content sits in a groove-walled recess.
 */

/** The name that keeps today's look: reserved, and never a native attribute (these elements have no `form`). */
export const STRUCTURE_FLUSH = "flush";

/** A Card's or a Panel's forms. */
export type StrataSurfaceForm = "plate" | "tray";
/** The Dialog's form: a plate. */
export type StrataDialogForm = "plate";
/** The Drawer's form: a tray. */
export type StrataDrawerForm = "tray";

/** The form a Card or Panel takes from its `form` prop: `plate` or `tray`, or none (`flush` and any other string are not forms). */
export const surfaceForm = (form: unknown): StrataSurfaceForm | undefined => (form === "plate" || form === "tray" ? form : undefined);
/** The form a Dialog takes from its `form` prop: `plate`, or none. */
export const dialogForm = (form: unknown): StrataDialogForm | undefined => (form === "plate" ? "plate" : undefined);
/** The form a Drawer takes from its `form` prop: `tray`, or none. */
export const drawerForm = (form: unknown): StrataDrawerForm | undefined => (form === "tray" ? "tray" : undefined);

/** The class of a Panel's tray, the wrapper of its content after the title (a Card's and a Drawer's tray is their body). */
export const PANEL_TRAY_CLASS = "ug-panel__tray";

/**
 * The numbers of the GPU parts at 50% depth (`plate.*` and `tray.*` tokens, in px; heights scale with the depth, 0.6, 1, 1.6): the
 * plate's rim is 4 wide and 3 high with a 1.4 chamfer on its outer edge; the tray's wall is 4 wide on top, 3 high, and runs 3 more
 * down its slope into the recess.
 */
export const structureDefaults = {
  plate: { rim: 4, height: 3, chamfer: 1.4 },
  tray: { wall: 4, height: 3, slope: 3 },
} as const;
