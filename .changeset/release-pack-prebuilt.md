---
---

Release tooling only: a package's prepack build is skipped when the Release workflow has already built every workspace (UNDERGLASS_PREBUILT=1), because Changesets packs the workspaces in parallel.
