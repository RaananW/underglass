# Other frameworks and plain DOM

Underglass is split into a runtime and adapters. `@underglass/core` is the runtime:
the GPU engine, the mount boundary, layers, motion and effects. It imports no UI
framework. `@underglass/react` and `@underglass/vue` are thin adapters over it.
Anything that can put elements in a `<div>` can use the core: plain DOM, a framework
adapter, or an Astro island that uses one of them (with a `client:only` directive,
since GPU presentation runs only in the browser).

Everything in [Concepts](concepts.md) still holds. Layers are original elements, the
GPU draws them, and native hit testing, focus and input stay on those elements.

## Vue

`@underglass/vue` is the Vue 3 adapter (`vue@^3.5`). It has the React package's
layer components, hooks (as composables) and core re-exports, written for Vue, with
these differences: it has no `GPUHost` (`mountCanvasApp` provides the runtime to the
app), no prerendering (`prerenderCanvasApp`, `canvasHostsMarkup`) and no `strict`
option; its `mountCanvasApp` takes a root component and a `configure(app)` option
instead; and it exports no props interfaces (`SurfaceProps`, `BoxProps`,
`PresenceProps`) but a `SurfaceRef` callback type.

```ts
import { createCanvasHosts, mountCanvasApp } from "@underglass/vue";
import App from "./App.vue";

const gpu = mountCanvasApp(createCanvasHosts(document.getElementById("stage")!), App);
await gpu.enable();
```

```vue
<script setup lang="ts">
import { ref } from "vue";
import { Surface, useGPUHost } from "@underglass/vue";

const gpu = useGPUHost();
const name = ref("Ada");
</script>

<template>
  <Surface id="profile" origin="center"
    :layout="{ x: 40, y: 40, width: 280, height: 160, padding: 16, direction: 'column', gap: 8 }"
    :appearance="{ background: 'white', color: '#1d1b26', radius: 16 }">
    <label for="name">Name</label>
    <input id="name" v-model="name" />
    <button @click="gpu.setTransform('profile', { rotation: 4 })">Tilt</button>
  </Surface>
</template>
```

- `mountCanvasApp(options, RootComponent, rootProps?)` creates the one persistent
  Vue app. Pass `configure(app)` in the options to install plugins (a router, a
  store) before it mounts.
- A first render that throws (in a render function, `setup` or a mounted hook)
  makes `mountCanvasApp` throw that error, on Vue's production and development
  builds alike. The app is unmounted and the hosts are left as they were, so they
  can take another mount. The error goes to the caller, not to an `errorHandler`
  you set in `configure`; that handler gets the errors after the mount. To keep a
  failing component from failing the mount, stop its error with
  `onErrorCaptured` (return `false`).
- `Surface`, `Box`, `NativeScroll`, `NativeOverlay` and `Presence` take the same
  props as in React. `Presence` emits `complete` instead of calling `onComplete`.
- As in React, `Surface`, `Box` and `NativeScroll` take no `style`: their inline
  style comes from `layout` and `appearance`. A typed template or `h()` call
  rejects it, and a `style` passed anyway is not applied (Vue warns in
  development). Use `class` for other styles. Other attributes and listeners fall
  through to the element.
- `useSurfaceRef({ id })` returns a callback for `:ref`; bind it to your own
  top-level element, or to a component whose single root element is one (its
  `$el` is enrolled, so it must keep that root element while enrolled). The
  options may be a ref or getter. A component whose root is not one element, or
  an element of another document or realm, is refused with `EnrollmentError`.
  Vue calls the callback, and re-enrolls after an `id` or `decorative` change,
  inside its own error handling, so a refused enrollment from either reaches
  `onErrorCaptured` and `app.config.errorHandler` (set it in `configure`).
  Without a handler, Vue rethrows it in development and logs it in production.
- `useGPUHost()` and `useNativeOverlayHost()` work in `setup`.
- Vue re-applies every key of a `:style` object on each update. Never bind
  `transform`, `opacity` or `transform-origin` on a layer element: the runtime
  owns them while the GPU presents, and rewriting them turns GPU off.

The playground page `vue.html` is a complete example.

## Plain DOM

`mountApplicationModule` gives your code the adapter-owned container. Build your DOM
there, return a function that tears it down, then enroll each top-level section as a
layer:

```ts
import { createCanvasHosts, mountApplicationModule, compileStyle } from "@underglass/core";

const hosts = createCanvasHosts(document.getElementById("stage")!);
const panel = document.createElement("section");
Object.assign(panel.style, compileStyle(
  { x: 40, y: 40, width: 280, height: 160, padding: 16 },
  { background: "white", color: "#1d1b26", radius: 16 },
  true, // positioned: a layer
));
const button = document.createElement("button");
button.textContent = "Count 0";
let count = 0;
button.onclick = () => { button.textContent = `Count ${++count}`; };
panel.append(button);

const gpu = mountApplicationModule(hosts, {
  mount({ container }) {
    container.append(panel);
    return () => container.replaceChildren();
  },
});
gpu.enroll(panel, { id: "panel" });
await gpu.enable();
```

- **Updates are ordinary DOM writes.** The runtime watches the persistent root, so
  changing text, styles or children keeps GPU on and uploads fresh pixels. There is
  nothing to call after an update.
- **Layers are direct children of the container.** Enroll each one with
  `gpu.enroll(element, { id })` after it is connected, and call the returned release
  before you remove it.
- **Never move or clone the container yourself.** The runtime moves it between the
  page and the canvas; your elements, listeners and state stay where they are.
- `compileStyle` turns the typed `Layout` and `Appearance` into a style object with
  complete string values, so `Object.assign(element.style, ...)` applies it. Your own
  CSS works too.
- Motion, effects and the rest of the controller (`setTransform`, `transition`,
  `setEffects`, `disable`, `dispose`) are the same as in React.

The playground page `vanilla.html` is a complete example.

## Writing an adapter

A framework adapter has three jobs. The React adapter
(`packages/react/src/react.tsx`) and the Vue adapter (`packages/vue/src/index.ts`)
each show them in about 250 lines:

1. **Mount once.** Construct a `CanvasRuntime` with the hosts and a
   `mount(container, runtime)` callback that creates exactly one persistent framework
   root in `container` and returns its synchronous unmount. Never remount it for
   GPU changes: the runtime moves the container with `moveBefore`, which keeps the
   framework's DOM and state.
2. **Register layers.** For a typed layer component, render one `<section drawable>`
   styled with `compileStyle(layout, appearance, true)`, then call
   `runtime.register({ id, element, layout, transform, origin, decorative })` once
   the element is in the DOM. Forward later changes with `runtime.update` and
   `runtime.setOrigin`, and call the returned release when it unmounts. For refs to
   the user's own elements, use `runtime.enroll(element, { id })`. Never write
   `transform`, `opacity` or `transform-origin` on a registered element: the runtime
   owns them (it sets `transform-origin: 0 0` itself) and treats any rewrite as a
   conflict that turns GPU off. Frameworks that re-apply a whole style object on
   every update, like Vue, must leave those properties out of it.
3. **Reconcile after each update.** Call `runtime.requestReconcile()` after the
   framework patches the DOM and before the browser paints (React's layout effects,
   Vue's post-flush hooks). Calls in one update coalesce into one GPU frame.

Depend on `@underglass/core` as a regular dependency and never bundle it, so every
adapter on a page shares one runtime and one engine.

Each adapter must pass the shared browser contract in
`tests/helpers/framework-contract.mjs`: GPU stays on through content, structure and
transform updates, the canvas shows fresh pixels, native hits land on the right
elements, and `disable`, `enable` and `dispose` keep the original root and state.
Its structural cases (`frameworkCases`) also unmount, key-swap, rename and make
decorative a layer enrolled by ref and one registered by the adapter's layer
component, take a `Presence` away and flip it back mid-exit, and mount a second
application whose first render throws. The plain-DOM, Vue and React pages
(`vanilla.html`, `vue.html`, `react.html`) run it.
