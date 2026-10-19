---
"@underglass/core": minor
---

A scene past an Instrument layer's 16 materials is no longer refused: the format accepts up to 64 (`INSTRUMENT_MATERIALS_CEILING`; more is a validation error), and the layer is drawn at the Relief level as a whole, every object stepped down with reason `budget` and the count in its `detail`, a warning, GPU on. `state().instrument.layers[].materials` is `{ count, cap }` and `state().instrument.budgets.materialsPerLayer` is the cap. Past 16 materials the face's Relief binding takes only the materials its primitives use. Before, `setMaterial` threw and a caller that swallowed the error lost its controls with no diagnostic.
