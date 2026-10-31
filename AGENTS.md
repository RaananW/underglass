# Underglass agent instructions

Underglass is a **GPU-first** React framework. Read [README.md](README.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[GPU-first contract](docs/architecture.md#gpu-first-contract) before changing it.
User-facing behaviour is described in [docs/guide](docs/guide/getting-started.md).

## Layout

- `packages/core`: the framework-neutral runtime (`@underglass/core`); it must never import a UI framework.
- `packages/vue`: the Vue 3 adapter (`@underglass/vue`), which depends on core.
- `packages/react`: the React adapter (`@underglass/react`), which depends on core. Core and the
  adapters are the only packages that are packed.
- `packages/css-compiler`: the opt-in build-time CSS compiler.
- `examples/playground`: engineering pages and probes; `examples/showcase`: the public gallery;
  `examples/docs`: the documentation site (Astro Starlight), generated from `docs/` at build time.
- `tests/unit`, `tests/browser`, `tests/compiler`, `tests/helpers`. The React 18 fixture is separately locked.
- Keep root script names and page URLs stable. `docs/archive` and `evidence/` are history.

## Before a capture, geometry or presentation change

- Check the latest [WICG HTML-in-Canvas proposal](https://github.com/WICG/html-in-canvas) and the
  [Chromium hotlist](https://issues.chromium.org/hotlists/6783002) (including ElementCanvasTransform issues).
- Record the proposal SHA and date, tracker access limits, and the browser build you actually tested, separately.
- Prove the API you rely on with functional pixel and native-hit probes on the installed build. Never infer
  support from property presence, substitute deprecated syntax, or assume a browser or React patch.

## Non-negotiable contract

- Supported React layer, ref and content updates stay GPU-presented, with fresh pixels, correct native hit
  geometry and no blank frames.
- Once GPU is on, only a GPU error or a factual lack of required browser support justifies a diagnosed fallback.
- Layout, DPR and structure changes, hidden tabs and reduced motion must not revoke GPU.
- Permanent DOM fallback for a supported update is not a fix, and missing framework code is not a browser limitation.
- Explicit `disable`/`dispose` is caller-owned.
- Preserve the original React control tree and state, the adapter-owned root boundary, one shared engine, the
  public API, and typed authoring.
- Never clone controls, cover updates with stale pixels, debounce diagnostics to hide flicker, or weaken
  hit-geometry safety.
- Components layer GPU support over a standard native React implementation that shares the same controls and
  state ([standard](docs/guide/components.md)).

## Verifying a change

- A change to GPU behaviour needs a browser test that shows GPU stays active, pixels are fresh and native hits
  are correct. Fallback-only tests do not count.
- Headless and a real window can differ (scrollbars put the canvas on fractional pixels). For capture,
  geometry or admission changes, also check in a headful Canary window.
- Run `npm run typecheck`, `npm run test:unit`, `node --test tests/compiler/*.test.mjs` and
  `npm run test:browser`. Run `npm run test:showcase` when the showcase changes, and
  `npm run test:browser:probes` (the `ui-probe-*`/`ui-proto-*` evidence suites, skipped by default) when a
  probe page or harness changes.

## Pull requests

- Work on a branch and open a PR to `main`. Keep one concern per PR, and stack dependent PRs on each other's
  branches. Follow [CONTRIBUTING.md#pull-requests](CONTRIBUTING.md#pull-requests).
- Add a changeset (`npm run changeset`, or `-- --empty` when users see no difference) to every PR that changes
  `packages/`; CI enforces it. Never edit versions or `CHANGELOG.md` by hand, and never publish: see
  [docs/releasing.md](docs/releasing.md).
- [Open issues](docs/open-issues.md) records known limits and unperformed validation.
