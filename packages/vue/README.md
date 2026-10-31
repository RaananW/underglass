# Underglass for Vue (experimental)

`@underglass/vue` is the Vue 3 adapter of Underglass, over the framework-neutral
`@underglass/core` runtime, with a `vue@^3.5` peer. It is experimental and
not release-qualified for production.

Live examples: [underglass.dev](https://underglass.dev/) · Source, guide and API: [github.com/RaananW/underglass](https://github.com/RaananW/underglass)

```sh
npm install @underglass/vue vue
```

```ts
import { createCanvasHosts, mountCanvasApp } from "@underglass/vue";
import App from "./App.vue";

const gpu = mountCanvasApp(createCanvasHosts(document.getElementById("stage")!), App);
await gpu.enable();
```

`mountCanvasApp` creates the one persistent Vue app inside the runtime's
adapter-owned container; pass `configure(app)` to install plugins before it
mounts. Inside it:

- `Surface` renders one native `<section>` layer from typed `layout`,
  `appearance`, `transform` and `origin` props; `Box` and `NativeScroll` are
  styled `<div>`s for its content.
- `useSurfaceRef({ id })` returns a callback for `:ref` that enrolls your own
  direct-root element.
- `NativeOverlay` teleports native dialogs and popovers to the overlay host,
  outside capture.
- `Presence` keeps its content mounted until an exit motion on an enrolled
  layer finishes, and emits `complete`.
- `useGPUHost()` returns the controller (`transition`, `setTransform`,
  `setEffects`, `enable`, `disable`, `dispose`, ...).

Vue keeps the original controls and state; the runtime moves its container
between the page and the GPU canvas without remounting. GPU admission requires
functional native capture, current hit geometry and the qualified browser
contract; useful default DOM is not proof of GPU support. The
[frameworks guide](https://github.com/RaananW/underglass/blob/main/docs/guide/frameworks.md) covers Vue in
more depth.

## License

Apache License 2.0. See [LICENSE](LICENSE).
