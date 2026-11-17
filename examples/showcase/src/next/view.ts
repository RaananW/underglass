/**
 * What the preview home page's stage shows, shared between the deck's driver (`deck.ts`, plain DOM code) and the React
 * tree (`page.tsx`). In the **flow** (`deck` false) every section is laid out down the page and none is a GPU layer. In
 * the **deck**, `from` is the section at rest or leaving and `to` the one arriving (`null` at rest): only those are
 * enrolled as layers, and the others are parked.
 */
export interface View { deck: boolean; from: number; to: number | null }

/** The page as it is served and hydrated: the flow. */
export const flow: View = { deck: false, from: 0, to: null };

let view = flow;
const listeners = new Set<() => void>();
export const viewStore = {
  get: () => view,
  /** Replaces the view and tells React; call it inside `flushSync` to have the layers enrolled when it returns. */
  set(next: View) { view = next; for (const listener of listeners) listener(); },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
