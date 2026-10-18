---
"@underglass/core": patch
---

Fix the `instrument` material drawing the tops and sides of `prism` and `extrude` parts dark: their triangles were wound against Lite's front-face convention, so double-sided PBR shaded them with flipped normals. Every profile's triangles now wind the same way against their outward normals, and prisms and extrudes are lit like lathes.
