---
"@underglass/core": patch
---

Admit GPU presentation under `forced-colors: active` (#133). Functional admission reads two marker colours back from the GPU output, and forced colours recoloured the marker, so admission failed with "Functional GPU capture probe returned missing or incorrect marker pixels" and the page stayed native DOM (Windows High Contrast, or `emulateMedia({ forcedColors: "active" })`). The internal marker now sets `forced-color-adjust: none`; your content does not, so under GPU it is still presented in the forced system colours, with fresh pixels and correct native hits. Upstream check: WICG html-in-canvas `main` at 5fb3df86d84de598c7f0fcfc5ee53de1df067e7d (2026-10-09T22:49:17Z); Chromium hotlist 6783002 not readable (its page is a script-rendered shell, no login); tested on Chrome Canary 158.0.8113.0 (Windows 11, headless, Playwright `forcedColors: "active"`).
