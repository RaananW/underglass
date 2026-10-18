---
"@underglass/ui": minor
---

Calibrate the Rendering Model's Instrument part shading (version 4, 2D.5) to what Babylon Lite 1.33 draws: the key light without π, the split-sum environment (Lite's prefiltered mips, its reflectance table and spherical-harmonic irradiance, and the orientation of its prefiltered mips), Lite's clear coat, and its output transform (exposure 0.8, gamma 2.2, contrast 1.2). `shadePart` and `partTerms` follow it, with the new exports `encodePart`, `specularEnvironment`, `studioIrradiance`, `reflectanceTable` and `environmentTurn`; `instrument-4.json` is regenerated, gains a `preset-domes` case, and its sampled tolerance is 16, measured against core.
