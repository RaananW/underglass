---
"@underglass/ui": minor
---

The GPU helper no longer loses controls silently past core's 16 materials per Instrument layer: it turns the later colours' key bodies into Relief keys until the scene fits, warns once per panel with `console.warn`, and exposes `StrataGpu.diagnostics(panel)` (`{ materials: { count, cap }, keysAtRelief }`). The rules that make a plain Button's key body (below 14 materials) and a push button's parts (below 12) a Relief key are named `INSTRUMENT_KEY_BODY_MATERIALS` and `INSTRUMENT_PUSH_MATERIALS`, documented, and shared with every key-like loop through a registry (`createKeyRegistry`: `registerKeyBody`, `keyAtRelief`). The warning re-arms when a panel fits again. `@underglass/ui/tokens` exports `INSTRUMENT_MATERIALS_CEILING` and its validator accepts up to 64 materials, as core does.
