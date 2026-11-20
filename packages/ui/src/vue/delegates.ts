/**
 * Holds a component's references to the document delegates it needs (`attachStrata*` from `dom/`), for as long as it is mounted.
 * `wanted` names the delegates the component's current form needs: each is attached once (a later update does not take a second
 * reference), a delegate the form no longer needs is released, and unmounting releases the rest.
 */
import { getCurrentInstance, onBeforeUnmount, onMounted, onUpdated } from "vue";

export type StrataDelegate = () => () => void;

export function useStrataDelegates(wanted: () => ReadonlyArray<StrataDelegate | false | undefined | null>, { updated = false }: { updated?: boolean } = {}): { sync(): void } {
  const held = new Map<StrataDelegate, () => void>();
  const sync = () => {
    const needed = new Set(wanted().filter((delegate): delegate is StrataDelegate => !!delegate));
    for (const [delegate, release] of held) if (!needed.has(delegate)) { held.delete(delegate); release(); }
    for (const delegate of needed) if (!held.has(delegate)) held.set(delegate, delegate());
  };
  if (getCurrentInstance()) {
    onMounted(sync);
    if (updated) onUpdated(sync);
    onBeforeUnmount(() => { for (const release of held.values()) release(); held.clear(); });
  }
  return { sync };
}
