# Reference pages: removed history

On 2026-10-31 the reference pages published at <https://underglass.dev/docs> (`api.md`,
`effects.md` and `distribution.md`) were rewritten for readers of the site. The
engineering history they carried was removed from them; the full earlier text is kept
at commit `d3b31e126566976ecefa25ecf6d6494d4d21d1df`, linked below.

## API

[`api.md` before the rewrite](https://github.com/RaananW/underglass/blob/d3b31e126566976ecefa25ecf6d6494d4d21d1df/docs/api.md)
(title "Initial typed API"). Removed: the evidence-storage note; the private-tarball,
Phase 10 and Phase 13 acceptance notes and commit references (`12f13661`, `cfa9df73`,
`ab598c00`) in the introduction and the bootstrap section; the Phase 12 readmission
verdict; and the upstream checks recorded with the 2026-10-13 and 2026-10-14 changes
(WICG html-in-canvas proposal at `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`, 2026-10-09,
checked 2026-10-14; Chromium hotlist 6783002 required sign-in, so no issue data was read;
tested on Chrome Canary 157.0.8102.0 on Windows 11; implementer checks, not independent
acceptance). Those change notes themselves are still in `api.md`, under *Earlier changes*.

## Effects

[`effects.md` before the rewrite](https://github.com/RaananW/underglass/blob/d3b31e126566976ecefa25ecf6d6494d4d21d1df/docs/effects.md)
(title "Bounded effects (Phase8 implementation)"). Removed: the evidence-storage note,
the Phase 9 hardening reference, and the sections *Reproduce and inspect* (the Phase 8
matrix counts, the proof table, the React 18 evidence location, the baseline commit
`3c508a848b9673fd1d691e76fa26b651dccf2ab9` and the CPU and uniform-storage costs) and
*Evidence routing* (also described in [CONTRIBUTING](../../CONTRIBUTING.md)). Also corrected there:
the eight-layer budget (now 32, up to 64), the opaque white backdrop (the output is now
transparent) and the statement that structural changes hide GPU presentation (they keep
it, as the GPU-first contract requires).

## Distribution

[`distribution.md` before the rewrite](https://github.com/RaananW/underglass/blob/d3b31e126566976ecefa25ecf6d6494d4d21d1df/docs/distribution.md)
(title "Private distribution preparation"). Removed: the Phase 10 to Phase 14 packaging
and acceptance history, the Chrome 155 installed-consumer results of 2026-10-10, the
Chrome 154 and provenance notes, the reviewed Phase 12 tarball hash
(`5f668a38a3c3972457e4cfb246ca354552c606507677b393d09521bda2579944`), the release-gate
table and the per-phase `test:package` commands. The archive member counts it gave had
gone stale; `scripts/package-policy.mjs` is the current list.
