# Underglass for React (experimental)

`@underglass/react` is the React adapter of Underglass, an ESM library with React 18.3 or
React 19 peers, over the framework-neutral `@underglass/core` runtime (which owns the GPU
engine and depends on public Babylon Lite). It is experimental and not release-qualified for
production.

Live examples: [underglass.dev](https://underglass.dev/) · Source, guide and API: [github.com/RaananW/underglass](https://github.com/RaananW/underglass)

```sh
npm install @underglass/react react react-dom
```

The [getting-started guide](https://github.com/RaananW/underglass/blob/main/docs/guide/getting-started.md)
walks through a first app, and the [API reference](https://github.com/RaananW/underglass/blob/main/docs/api.md)
lists every export.

Import supported runtime APIs from `@underglass/react`; it re-exports the core
types and helpers React applications need. The separate
`@underglass/react/build` export is for build tooling, providing compositor
generation and animation lowering; other internal subpaths are not exported.
The `@underglass/css-compiler` package supplies opt-in JSON-configured
Vite/webpack integration and generated `CompiledProgramSet` artifacts.
Pass one to `mountCanvasApp` and explicitly call `ownCompiledAnimation` after
original-element enrollment. Existing runtime CSS/WAAPI APIs remain available
for noncompiled applications.

The opt-in `@underglass/react/experimental-worker` adapter and
`@underglass/react/experimental-worker/thread` entry move shared WebGPU
composition/upload and decorative clocks to an app-owned module worker.
Generate its literal program with `workerCompositorProgram` from `/build`.
React/DOM/layout/capture remain on the main thread; essential controls have
fixed geometry. This is a separate bounded experiment, not a CSS speedup,
arbitrary-component worker adapter or replacement for the default runtime.

React retains the original controls and state. GPU admission requires
functional native capture, current hit geometry and the qualified browser
contract; useful default DOM is not proof of GPU support.

See the [distribution contract](https://github.com/RaananW/underglass/blob/main/docs/distribution.md)
(also bundled as `docs/distribution.md`) for bootstrap, peer requirements, browser limits
and explicit disable/disposal. Repository examples, tooling and historical evidence are
not package contents. Manual (screen reader, physical device) and performance-budget
qualification remain open.

## License

Apache License 2.0. See [LICENSE](LICENSE).
