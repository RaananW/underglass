# Contributing to Underglass

## Workspace ownership

`packages/core/package.json` (the framework-neutral runtime),
`packages/react/package.json` (the React adapter) and
`packages/vue/package.json` (the Vue adapter) are the release manifests; both
adapters depend on core. Keep library source independent of playground/tests,
and never import a UI framework from `packages/core`. A new adapter must pass
the shared contract in `tests/helpers/framework-contract.mjs`. The private root
owns tools and stable scripts, while `examples/playground` owns app dependencies, HTML and Vite/TS
configuration. Use root `npm run build:library`, `npm run build`,
`npm run test:unit`, `npm run test:browser` and `npm run pack:library`.
Browser selectors now live under `tests/browser`; units and shared helpers
live under `tests/unit` and `tests/helpers`. All ten canonical page URLs remain
unchanged under the playground-root dev server. The root Vite shim preserves
existing checkout entrypoints; do not replace a retained server during validation.
Package prepack copies canonical `docs/distribution.md` into generated ignored
package docs; the package owns its standalone README. Playground and library
build outputs are separate. Exact React18 provisioning uses
`fixtures/react18/package-lock.json`, never the default React19 workspace peer.
Historical seals and verdicts retain their old-layout meaning.

The separate private `examples/showcase` workspace owns the React catalog,
its Pages base and sanitized build output. It imports the built public library
and reuses the maintained task component, never package internals. Root
`dev:showcase`, `build:showcase` and `test:showcase` entrypoints are described in
[the showcase guide](docs/showcase.md). Pages activation and manual workflow
dispatch are separate owner decisions, not part of local preparation.

The private `packages/css-compiler` workspace owns opt-in build-time CSS
analysis and the Vite/webpack adapters. Its [guide](packages/css-compiler/README.md)
documents the JSON configuration, supported pipeline/subset and isolated
integration proof. `fixtures/css-compiler` exercises installed npm components
and local Sass/PostCSS/CSS Modules; `tests/compiler` owns compiler units and
GPU/native sampler comparisons. Preserve ordinary CSS for fallback, and keep
authored-CSS parsing/shader generation out of the compiled runtime path.
The named conformance corpus includes accepted and refused stylesheets;
ordinary browser CSS is an independent reference, separate from GPU/native
time-sample parity. Keep case counts, synthetic-vs-package coverage and native
clock-resolution limits distinct in reports; see the compiler guide.

The worker experiment belongs to the library's separate experimental exports,
with an installed production fixture in `fixtures/worker/app` and isolated
`scripts/worker-validation.mjs` proof. Read [the worker contract](docs/worker.md)
before changing transfer, geometry or teardown. Run benchmark cells alone;
main/worker rAF and CPU submission are not CSS presentation or GPU execution.
Always await worker disposal acknowledgement before restoring original DOM.

## GPU-first requirement

Every human and agent working on Underglass must follow the
[GPU-first contract](docs/architecture.md#gpu-first-contract).
Supported React layer/ref/content updates require continuous GPU presentation,
fresh pixels, current original native hit geometry and no blank application
frames. A test that only proves useful DOM fallback does not accept such a fix.
Exercise GPU remaining active through repeated supported updates alongside
rendered-pixel and original native-interaction checks; retain separate genuine
unsupported/fault/explicit-disable recovery tests. The bounded structural/native
viewport correction is independently accepted at `cfa9df73`, external
axis-aligned scroll at `ab598c00`, and selected Phase13 task adoption/diagnostics
at `12f13661`. Earlier Phase12 engineering alone was not seamless proof;
broader framework and physical/manual gates remain open in the
[current register](docs/open-issues.md).
Once GPU is enabled, only GPU errors or factual missing required
GPU/capture/geometry feature support justify diagnosed fallback. Normal
structure/layout/DPR updates, visibility pauses and reduced motion must retain
GPU intent/presentation; caller-requested disable/disposal remains lifecycle.
Apply this gate to every implemented transition, component add/remove/change
and undo/redo flow. Distinguish missing framework implementation from browser
feature limits. Component GPU support and typed declarative CSS/JS fallback
must share the standard implementation's original controls/state.

Before every capture, geometry or presentation change, ALWAYS review the latest
[WICG HTML-in-Canvas proposal](https://github.com/WICG/html-in-canvas) and
[Chromium hotlist 6783002](https://issues.chromium.org/hotlists/6783002),
including ElementCanvasTransform, paint, geometry and direct-GPU issues.
Record proposal SHA/date, accessible issue status/landed revision and actual
queried browser build; disclose inaccessible tracker content. Fixed tracker
status and historical tests are not installed-browser qualification. Current
syntax/API support requires functional pixel and original native-hit evidence,
not silent legacy compatibility or property detection alone.

Underglass is open-source software under the [Apache License 2.0](LICENSE)
(selected 2026-10-14). Contributions are accepted under the same license.
The packages are experimental and not yet on npm; the first publish is the owner's one-time step
and releases then follow [docs/releasing.md](docs/releasing.md). No maintainer or
security contact is designated here.
Phase10 private distribution preparation is independently accepted with limits;
[verdict](evidence/phase10-independent/acceptance-summary.json) and
[local pack/consumer and browser policy](docs/distribution.md).
Keep the existing package names and the Apache-2.0 license. Never run `npm publish` from a change;
publishing is the owner's step in [docs/releasing.md](docs/releasing.md). A bounded private build-only CI definition and
local Phase14 pilot are authorized engineering, not hosted success or release
qualification; see [private release lanes](docs/archive/private-release.md).
Historical Phase12 engineering covered opted-in settled
structural readmission and a measured engineering envelope, independently
accepted with limits ([verdict](evidence/phase12-independent/acceptance-summary.json));
full Phase12 production budgets remain open. The later bounded continuous-GPU
correction and selected [Phase13 task workspace](docs/archive/task-workspace.md) are
qualified-accepted; this does not close manual/historical gates. Phase14
private engineering is started; release qualification, licensing and publication
remain open or undecided.

Start with [README.md](README.md), the maintained
[architecture/lifecycle/mount contract](docs/architecture.md), and the
[typed API](docs/api.md), [verification matrix](docs/archive/verification.md), and
[feasibility/evidence report](docs/archive/feasibility.md). Current supported behavior
is the bounded `/runtime.html` typed runtime and `/paired.html?example=css`
or `?example=typed` ownership/refraction examples; `/probe.html`, `/surface.html` and `/recovery.html`
retain historical experiments, not alternative production implementations.
The [TODO pilot](docs/archive/todo-pilot.md), `/todo.html`, integrates the same public
API into a bounded application rather than another counter fixture.
The [Phase 6 report](docs/archive/measurements.md) documents actual React18/19 behavior,
production comparisons, raw samples and still-unperformed manual gates.
The [Phase7 integration](docs/archive/integration.md), `/integration.html`, adds
original-element refs, Radix Dialog and bounded motion/presence; the
[public roadmap](docs/archive/roadmap.md) records
Phase9 bounded hardening accepted-with-limits on actual installed155; exact154
remains unverified, not waived; see [independent proof](evidence/phase9-independent/acceptance-v1.json).
The [adoption checklist](docs/archive/adoption.md) covers migration and manual/device
gates. The [Phase8 effects](docs/effects.md), `/effects.html`, use the same
shared compositor and add a trusted application color-function extension.
Phase8 is independently accepted with explicit limits; the
[Phase8 acceptance summary](evidence/phase8-acceptance-summary.json) preserves earlier
routing findings and does not close manual/device or release gates.

## Private phase history

The user-authorized history remote is private
[`RaananW/underglass`](https://github.com/RaananW/underglass), `origin`
`https://github.com/RaananW/underglass.git`, on `main`. Commit and normally push each
phase **after separate technical acceptance**, not during an unfinished phase.
The first accepted commit
includes the preexisting accepted Phases1-6 baseline plus Phase7; do not
fabricate retrospective phase commits. Later accepted phases get individual
commits. Inspect the exact staging set for secrets, private local paths and
generated artifacts; retain only compact curated verdicts, keep dependencies,
caches and browser profiles ignored, include the standard Copilot coauthor
trailer, verify the remote stays private and verify matching local/remote main
SHAs after push. Do not advance phases until this verification. This is private
history tracking, not authorization to change the license, publish a package,
make the repository public or modify upstream engines.

On 2026-10-12, the owner separately requested documented compiler/worker
persistence before independent acceptance. This scoped authorization does not
waive phase-acceptance gates or qualify production/manual work; the experiments
remain explicitly labelled as implementer-verified.

Raw reports, screenshots, reruns and full performance dumps must stay outside
tracked history. The [archive catalog](docs/archive/archive-catalog.md) records preserved
local bytes and access/reproduction limits. Stage source/docs/tests and curated
verdicts explicitly, then run `node scripts/check-evidence.mjs`; it checks staged
paths, JSON validity and a64 KiB per-verdict budget (8 KiB for the exact
Phase10/11/12 compact summaries), including force-added files.
Generated evidence is ignored; a new curated verdict needs a deliberate
allowlist/ignore-policy update. Never use blanket `git add -f evidence`.
History rewrites/force-pushes require explicit user approval, not an unavailable
user or autonomous continuation. The one-time cleanup was explicitly approved.

## Setup

Use Node24 for repository validation; worker source tests require its module
hooks. Validation used Node24.19.0/npm11.17.0.
Install the exact lockfile versions:

```sh
npm ci --ignore-scripts
npm run dev -- --port 5173 --strictPort
```

The landing page is usable ordinary DOM. `/runtime.html?dom` starts the
typed specimen in ordinary DOM; `/runtime.html` requests GPU admission.
Unsupported features must give an explicit diagnostic and usable DOM, not
fake GPU success.

Browser tests are cross-platform. They launch Chrome Canary through Playwright's
`chrome-canary` channel, unless `CANVAS_BROWSER_EXECUTABLE` points to a specific
executable (see `tests/helpers/browser.mjs`, the single launch source). The
exact historical browser pin is enforced only when `CANVAS_REQUIRE_BROWSER_PIN=1`;
otherwise the actual queried build is recorded. Keyboard shortcuts in tests use
`ControlOrMeta`. Historical accepted phases used Chrome154.0.8037.98 and Phase9
used155.0.8059.40 on macOS; see [history](docs/archive/history.md) and
[verification](docs/archive/verification.md).
**Do not install/download a Playwright browser or switch builds
to make tests pass.** Tests launch clean temporary profiles with explicit
`CanvasDrawElement,ElementCanvasTransform` and experimental-web-platform flags.
They neither modify nor establish the flags of an everyday user profile.
Run `npm run typecheck` for all three TypeScript projects. `npm run test:browser`
builds first, then runs Playwright.
The configuration uses one worker and DPR 1, except native-only and integrated-runtime geometry tests that also exercise
DPR 2. CDP DPR/visibility/fence fixtures are labelled, not physical-device or
actual background-tab evidence.

## Validation

```sh
# Small independent geometry/ledger tests:
npm run test:unit
# TypeScript plus production build:
npm run build
# Rebuild/pack/install in isolated matching React18/19 consumers:
CANVAS_EVIDENCE_ROOT=evidence/phase10/my-run npm run test:package
# Integrated capture, 300-frame caching, loss and mount-boundary gates:
npm run test:browser -- runtime.test.mjs --reporter=list
# Preserved historical surface regressions:
npm run test:browser -- surface.test.mjs --reporter=list
# Transactional source, actual easing/pixel parity and decorative effect gates:
npm run test:browser -- animation.test.mjs --reporter=list
# Real TODO workflows, task-triggered pixels, fallback and HMR cleanup:
npm run test:browser -- todo.test.mjs --reporter=list
# Original refs, Radix overlay, affine motion/presence and retired lifetimes:
npm run test:browser -- integration.test.mjs --reporter=list
# Bounded effects, trusted compilation, decoded pixels and healthy fencing:
npm run test:browser -- effects.test.mjs --reporter=list
# Membership/order/size/DPR generations and native apps at both DPRs:
CANVAS_EVIDENCE_ROOT=evidence/phase9/example-run npm run test:browser -- hardening.test.mjs
# Matched production fixture pixels, public operation sink and cleanup:
npm run test:browser -- performance.test.mjs
# Deterministic synthetic cleanup cases only:
npm run test:browser -- surface.test.mjs --grep 'fence|old-generation'
# Entire current regression suite:
npm test
# The probe and prototype suites (evidence runs, see below), or everything:
npm run test:browser:probes
npm run test:browser -- --all
```

The probe and prototype suites (`tests/browser/ui-probe-*.test.mjs`, `ui-proto-*.test.mjs`) are the
evidence behind the UI library's design decisions ([phase0.md](docs/ui-library/phase0.md),
[instrument-phase0.md](docs/ui-library/instrument-phase0.md)); the core and component suites cover what they
proved. They cost about 25 of a full run's 55 minutes, so `npm run test:browser` and CI skip them. Run
`npm run test:browser:probes` when you change a probe page or its harness, or name the file
(`npm run test:browser -- ui-probe-instrument-post.test.mjs`); `--all` runs the regression suite and the probes
in one go.

`npm run test:browser` and `npm test` build first. Playwright starts a preview on 5174 and
development server on 5173, or reuses existing responsive servers. It stops
servers it started, not a user's existing development server. Do not run
competing suites/server starts against these ports; evidence filenames are
shared and runs are serial.

The accepted Phase9 suite has twenty-one unit tests and140 browser tests;
the current harness also includes one deterministic evidence-policy unit.
the current runtime suite has twenty-three and the historical surface suite
twenty-five; twenty-three exercise the paired Phase 4/5 contract. Production-profiling and real
development StrictMode both assert at least 300 GPU-only frames with zero
additional committed React updates, captures, pixel copies and uploads.
Ordinary input/paint invalidation is not disabled to satisfy the assertion.
Positive commit controls and recorded initial geometry warm-up precede the
settled interval. Root-wide native paint is not suppressed; pixel comparisons
retain unchanged uploads while captures/readbacks remain visible.
Functional admission has its own probe counters; assert those also remain
unchanged during settled motion. Method names or opaque first application
pixels are not acceptance substitutes. No-op/wrong-result native and GPU
fixtures must restore the original usable DOM and clean their resources.
Twenty-lifetime assertions inspect each **retired** controller's ledgers/demo
listeners, separately from the new controller's constant active counts.
Ownership tests inspect actual original Animation/KeyframeEffect references,
detached source states, canonical matrices, native WAAPI samples and rendered
GPU pixels; mocks of a translation result are not substitutes. Keep unsupported
raw CSS dependencies, important precedence, additive effects and overlapping
owners atomic. Canonicalize harmless browser transform serialization differences,
not variable dependencies. Repeated CSS transactions must retire their bounded
replacement references. Decorative tests must prove identity, distinct time
pixels, undistorted essential controls and zero extra work over 300 frames.
Test restored native source behavior even while healthy GPU cleanup is pending.
Test later direct and actual React presentation updates, removals and priority
changes through release, disable, failure and repeated recovery: only
still-owned properties may be restored. Live individual transform changes
must diagnose usable DOM while preserving the authored declaration. Numeric
motion descriptors must prove default timing, atomic compiler rejection,
actual GPU/DOM pixels and source accounting independently of CSS/WAAPI
compatibility fixtures; stale handles must not cancel replacement sources.

The TODO pilot adds two reducer units and seven browser cases. Its 300-frame
measurement deliberately holds a real action-triggered effect through a
diagnostic facade; a separate subsequent action must finish naturally after
900ms. Keep that distinction explicit. Application code belongs in
`examples/playground/src/apps/todo/`; profiling, deterministic clocks and fault injection do not.
Phase7 adds fifteen browser cases, including actual nonidentity native input
hits, enter/exit pixels, interrupted exits, shared epochs/stagger, later authored
declarations, parent unmount, real HMR and diagnostic public device loss. Its
60000ms transition is held for a measured 300-frame interval, not presented
as a natural 800ms exit. Keep the independent completion/pixel cases separate.
Phase8 adds ten browser cases. Effect identity, time, bounds, alpha and both
sampling/color orders use decoded PNG pixels. Each production/development build
measures five300-frame neutral/effect intervals plus one actual motion/effect
interval, with normal invalidation and unchanged compilation/admission counters.
Content updates must still change actual output. Label synthetic missing
capability/error-scope/visibility/fence timing distinctly from genuine shader
compile failure and diagnostic device loss.

### Compatibility and measurement writers

The current matching React18 browser selection has94 cases; React19 has140.
Historical Phase8 counts78/124 remain valid for that earlier scope.

```sh
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19
npm run measure
```

Do not change main dependency pins to run the isolated React18 fixture.
Matching React/DOM18.3.1 and types18.3.31/18.3.7 are declared in its own
manifest/lockfile; ignored copied source resolves these dependencies without
implementation substitutions. Its fresh services5185/5186 refuse reuse.
The exact-pinned `@radix-ui/react-dialog`1.3.1 dependency is also declared and
resolved in both fixtures; matching types/React do not come from the primary.
`test:react19` runs the complete primary suite and records actual mounted
production/development versions; it retains the existing dev5173 ownership.
Injected root factories must use their matching public `flushSync`; see
[API bootstrap](docs/api.md#explicit-bootstrap).

The production runner owns free preview5287 (configurable with
`CANVAS_MEASURE_PORT`),90 settled and90 native-input windows plus40 TODO
pixel-detection trials. Keep all writers serial and close bounded helpers.
Use full-window opt-in samples, not last256 p95; preserve admission/startup
separation, native-readback costs, per-retirement ledgers and loose screenshot
latency bounds. Public CPU timing is not GPU execution or total browser paint;
estimated RGBA capacities are not heap/driver memory.

The browser runner forwards selectors/options to Playwright and preserves its
exit status. It then runs `scripts/sanitize-evidence.mjs`, including on test
failure, to redact workspace/home/temporary profile paths in JSON and log
evidence, plus unrelated private-registry URLs in local npm warnings.
If sanitization fails, that is a runner failure, not a passing suite.
After an outer redirected log writer exits, sanitize once more; it can append
an error tail after the inner runner's cleanup. New browser/matrix reports
default to `evidence/regression/current`; use `CANVAS_EVIDENCE_ROOT=evidence/phase9`
for implementation evidence or `CANVAS_EVIDENCE_ROOT=evidence/phase9-independent`
for the isolated acceptance window. Both exact roots and their descendants are
supported by test/matrix/reporter/sanitizer and probe routing. Use a fresh
destination and never point a writer at evidence being protected.
Only the named roots are writable. Probe output defaults to the selected root's
`chrome/` directory; performance fixtures/full/smoke follow the selected
root's `performance/` directory (`evidence/regression/current/performance` by default).
The sanitizer visits only the selected root.
The shared validator also admits `evidence/phase10/<fresh-run>` and
`evidence/phase10-independent/<fresh-run>` for distribution implementation
and acceptance. `test:package` always creates new ignored evidence/consumer
subdirectories, never reuses the source-matrix workspace or dev5173, and
closes its own randomly allocated strict-port previews and browser profiles.
Its actual npm-installed tarball consumers have no workspace/source aliases,
matching declared React/types, strict Bundler/NodeNext declarations and
flagged/unflagged production native/GPU pixel checks. Prepack builds only
`packages/core/dist/library`, `packages/react/dist/library` and `packages/vue/dist/library`; playground builds use
`examples/playground/dist/` and cannot replace library output. No generated output belongs in Git.
Curated versioned verdicts are read-only. Raw historical evidence is externally
archived, not available in the current checkout; never reconstruct or regenerate
it as though it were the original. The permanent
five-original-fixture gap disclosed in [measurements](docs/archive/measurements.md)
is not repaired or waived by this routing.
Inspect generated artifacts before sharing: this path redactor is **not** a
general secret detector. Do not publish raw user profiles, local absolute
paths, credentials or unrelated machine configuration.

## Reproduction and evidence

Historical accepted API evidence is under `evidence/runtime/`; new reruns use
`evidence/regression/current/runtime/` or the selected phase root: independent production/
StrictMode intervals, geometry at DPR 1/2, opacity/emulated DPR changes,
native semantics/overlays, conservative policy refusal, registry/dirty races,
environment/loss/twenty-cycle accounting, typed pending cleanup, abandoned
admission, functional `admission-*.json` cases and real Vite HMR. Inspect the
native/GPU marker samples, geometry/hit checks and temporary probe ledgers,
as well as content counters. Readback holds are synthetic timing; diagnostic
device destruction delivers genuine WebGPU loss, not a physical GPU reset.
Pending SDK readbacks must not be relabeled completed after loss just to make
cleanup zero. See [verification.md](docs/archive/verification.md) for
which fixtures are synthetic. HMR tests touch/restore only the demo source
timestamp; they verify actual module replacement rather than a full reload.
HMR deliberately starts a new root lifetime and resets demo state.

The following reports preserve the earlier integration gate:

`evidence/surface/production.json` and `development-strict.json` record actual
CDP build/launch information, before/after counters, errors and cleanup.
Event-driven capture totals may vary; assert interval deltas and consult the
actual report rather than hardcoding incidental total paint counts.
`device-loss-{false,true}-{false,true}.json` and matching DOM/reentry PNGs
record genuine `device.lost` delivery after diagnostic-only public destruction.
`synthetic-fence-*.json`, `synthetic-healthy-delayed-fence.json` and
`synthetic-late-generation-loss.json` explicitly label synthetic fault timing.
The latter deliberately delays an old lifetime's actual disposal-loss delivery.
`admission-loss-and-serialization.json` and `mount-boundary-rejections.json`
record the remaining admission/ownership gates.

For historical native API, fixed-subtree fallback and serial public-backend
probes, build/start preview5174, then run:

```sh
npm run probe
NO_NATIVE_FLAGS=1 EVIDENCE_DIR=evidence/regression/current/chrome-no-flags npm run probe
node scripts/sanitize-evidence.mjs
```

Stop a manually started preview when finished. The old probe's `BLOCKED`
verdict is expected for its fixed-subtree recovery/direct cross-owner snapshot
path; it does not supersede the new owning-canvas pixel-copy/stable-root path.

## Pull requests

Every change goes through a pull request to `main`; CI must pass. Keep each pull
request to one concern, and keep it mergeable:

- **Stack dependent work.** When a change builds on another open pull request,
  branch from that branch and set it as the base. Say so in the description, and
  merge the stack bottom-up.
  - Branches are deleted on merge, so GitHub retargets the next pull request in
    the stack to `main` automatically.
  - Use **Create a merge commit** for a stacked pull request. With squash or
    rebase merges the rest of the stack keeps the old commits, so rebase it onto
    `main` after each merge.
- **Add a changeset when a package changes.** Run `npm run changeset` and commit the
  file it writes in `.changeset/`; it becomes the package's changelog entry and sets
  the version bump. Use `npm run changeset -- --empty` when users see no difference.
  CI fails a pull request that changes `packages/` without one. Changes outside
  `packages/` need none. See [releasing](docs/releasing.md).
- **Add tests in new files when practical.** Browser suites and playground pages
  are discovered by glob (`tests/browser/*.test.mjs`, `examples/playground/*.html`),
  so adding one touches no shared list. Appending to the end of a busy test file
  is the most common source of conflicts.
- **Merge renames and repo-wide mechanical changes last.** Rebase them onto
  `main` after the feature work lands; redoing a mechanical rename is cheaper
  than resolving it against every open branch.
- **Line endings are LF everywhere** (`.gitattributes`), whatever `core.autocrlf`
  is set to.
- **Before opening or updating a pull request, check it against the other open
  ones:** `git merge-tree --write-tree --name-only <your-branch> <other-branch>`
  exits non-zero and lists the files when the two would conflict.

## Change boundaries

Preserve one authoritative React control tree and one shared GPU engine.
Keep reusable lifecycle/ownership code separate from demo profiling and fault
injection. Use public engine/browser APIs, typed capability checks, explicit
errors and bounded waits. Never replace healthy timed-out fencing with unsafe
destruction merely to report zero resources. Exercise real rendered pixels
and native pointer/keyboard input for behavior claims, not `element.click()`.

Keep source changes scoped, update maintained contracts and distinguish actual
loss from synthetic failures. No new reconciler, CSS normalization engine,
generic toolkit, package proliferation (beyond the core runtime and one thin
package per framework adapter), private device access or broad
compatibility claim belongs to this gate. Do not infer release readiness from
passing headless specimen tests.
