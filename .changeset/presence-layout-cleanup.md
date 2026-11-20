---
"@underglass/react": patch
---

`Presence` ends its running enter or exit transition inside the commit that unmounts it, before React removes its DOM, where it waited for the passive effects after that commit. `onComplete` is no longer called after an unmount: before, removing a `Presence` together with the layer it animates (in an ordinary update, not `flushSync`) reported that layer's `cancelled` / `Unenrolled` result to the unmounted component. When Suspense hides a `Presence` mid-transition, the transition now stops while it is hidden and plays again from the start when it is shown, so an interrupted exit still ends by unmounting the children.
