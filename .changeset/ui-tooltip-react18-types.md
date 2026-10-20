---
"@underglass/ui": patch
---

Type-check the Tooltip's `popover` attribute under React 18: `@types/react` 18 has no `popover` prop, so the React 18 source type check of the release gate failed. The attribute is written to the element as before, the way Menu and Popover already do.
