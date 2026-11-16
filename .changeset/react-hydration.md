---
"@underglass/core": minor
"@underglass/react": minor
---

Prerendering and hydration for the React adapter. `prerenderCanvasApp(children, renderToString)` renders an application to HTML without a DOM (a server or a build), and `mountCanvasApp({ ...hosts, hydrate: true }, children)` hydrates it in place: React attaches to the served elements, and those same elements are what GPU presentation draws. `createCanvasHosts(frame)` now adopts prerendered hosts, and core gains the framework-neutral `canvasHostsMarkup(content)` and the `hydrate` runtime option (also for `mountApplicationModule`). `NativeOverlay` renders nothing while prerendering and hydrating and mounts right after. `compileStyle` no longer needs the browser's CSS parser to run: without one it refuses only values that hold something no colour does. See the new guide, "Prerendering and hydration".
