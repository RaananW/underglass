# Underglass core (experimental)

`@underglass/core` is the framework-neutral runtime of Underglass: the shared
GPU engine, the adapter-owned mount boundary, original-element enrollment, motion,
effects and the typed style compiler. It imports no UI framework. It is
experimental and not release-qualified for production.

Live examples: [underglass.dev](https://underglass.dev/) · Source, guide and API: [github.com/RaananW/underglass](https://github.com/RaananW/underglass)

Most applications use a framework adapter instead, which installs this package with it:

- [`@underglass/react`](https://www.npmjs.com/package/@underglass/react) for React 18.3 or 19.
- [`@underglass/vue`](https://www.npmjs.com/package/@underglass/vue) for Vue 3.5.

A plain-DOM application or a new adapter installs it directly:

```sh
npm install @underglass/core
```

An adapter (or a plain-DOM application) builds on two pieces:

- `CanvasRuntime` (or `mountApplicationModule`) takes the adapter-owned hosts and a
  `mount(container, runtime)` callback that creates exactly one persistent root in
  the container and returns its synchronous unmount. The runtime moves that same
  container between the ordinary DOM host and the GPU canvas with `moveBefore`,
  so the original controls and framework state survive.
- The adapter registers original direct-root elements (`register`, `enroll`),
  forwards typed layout and transform updates (`update`, `setOrigin`) and calls
  `requestReconcile()` after each commit so the update lands in one GPU frame.
  `compileStyle` turns typed `Layout` and `Appearance` into an inline style object
  with complete string values that any framework can bind.

`@underglass/core/build` holds build-only generators (compositor WGSL, animation
lowering) for Node build scripts. `@underglass/core/experimental-worker` and
`@underglass/core/experimental-worker/thread` are the framework-neutral parts of
the bounded experimental worker compositor.

GPU admission requires functional native capture, current hit geometry and the
qualified browser contract; useful default DOM is not proof of GPU support. The
repository's [architecture guide](https://github.com/RaananW/underglass/blob/main/docs/architecture.md#gpu-first-contract)
states the full GPU-first contract.

## License

Apache License 2.0. See [LICENSE](LICENSE).
