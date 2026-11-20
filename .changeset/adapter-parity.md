---
"@underglass/vue": minor
---

The Vue adapter now behaves as the React one where the two had drifted apart. Vue's `Surface`, `Box` and `NativeScroll` take no `style`, as React's prop types already said: a typed template or `h()` call rejects it, a `style` passed anyway is not applied, and Vue warns about it once per component in development. Before, `Surface` dropped it without a word while `Box` and `NativeScroll` applied it; use `class`, or `layout` and `appearance`, instead. Vue's `useSurfaceRef` callback bound to a component now enrolls the component's root element (`$el`); before, it enrolled nothing and reported nothing. A ref that names no single element, or an element of another document or realm, is refused with the usual `EnrollmentError` (`foreign-element`) instead of being ignored.
