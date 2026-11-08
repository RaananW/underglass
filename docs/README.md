# Underglass documentation

## Guide

Start here if you are using Underglass or writing components for it.

1. [Getting started](guide/getting-started.md): requirements, install, your first layer, enabling GPU.
2. [Concepts](guide/concepts.md): the two modes, layers, admission, what the GPU adds over CSS.
3. [Motion](guide/motion.md): transitions, groups, `Presence`, animation ownership.
4. [Effects](guide/effects.md): built-in effects and your own WGSL.
5. [Building components](guide/components.md): the standard for components that work in Underglass.
6. [Troubleshooting](guide/troubleshooting.md): every fallback reason and its fix.
7. [Browsers without HTML-in-Canvas](guide/polyfill.md): GPU mode through the opt-in polyfill, and what it costs.
8. [Other frameworks and plain DOM](guide/frameworks.md): the core runtime without React, and writing an adapter.

## Reference

- [API reference](api.md): every export, option and contract.
- [Effects contract](effects.md): effect validation, time and fallback rules in detail.
- [Worker compositor](worker.md): the experimental worker path.
- [Distribution](distribution.md): packing and installing the library.
- [Showcase](showcase.md): the example gallery and its deployment.

## Contributing

- [Architecture](architecture.md) and the GPU-first contract.
- [Open issues](open-issues.md): known limits and unperformed validation.
- [Releasing](releasing.md): versions, changesets, the Release workflow and how to enable publishing.
- [Change notes](changes/README.md): the notes written before Changesets, kept as history.
- [GPU browser tests in CI](ci-gpu-runner.md): the self-hosted GPU runner.
- [3D UI library plan](ui-library/plan.md): proposal for a component library with its own 3D design language.
- [Instrument level plan](ui-library/instrument.md): proposed 3D-first hardware components (knobs, faders, switches, lamps) as a fourth Strata level.
- [Strata design language](ui-library/design-language.md): the spec and [tokens](../packages/ui/src/tokens/strata.tokens.json) of the 3D UI library.
- [Archive](archive/): the phase-by-phase engineering history, measurements and verification records.
