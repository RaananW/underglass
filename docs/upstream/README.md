# Upstream reports

Babylon Lite findings (defects, missing APIs and behaviours found by the Instrument work, not yet filed upstream) are
collected in [babylon-lite.md](babylon-lite.md).

## canvasClip hit testing uses the bounding box on rotated drawable children

**Filed 2026-10-14:**
- Chromium: [573454036](https://issues.chromium.org/issues/573454036), "HTML-in-Canvas: canvasClip hit test on rotated drawable element uses axis-aligned bounding box".
- WICG: [html-in-canvas#186](https://github.com/WICG/html-in-canvas/issues/186), the explainer clarification.

Reproduces on Chrome Canary 157.0.8102.0 and 158.0.8104.0. Related: Chromium 556756510 (the
`canvasClip` feature), 532229486 (HTML-in-Canvas implementation), WICG #148 (precise hit testing).
When the bug is fixed, the probe margins in `admission.ts` can stay, but the overflow refusal in
`runtime.ts` (`Rotated layers with clipped overflowing content`) can be lifted after verifying the fix.

The text below is what was submitted.

Reproduction: [`canvasclip-rotated-hit-test.html`](canvasclip-rotated-hit-test.html)
(self-contained; serve it from `localhost` or any https origin).

### Chromium bug ([573454036](https://issues.chromium.org/issues/573454036))

Component: Chromium > Blink > HitTesting (the tag used by 556756510). Type: Bug.

**Title**

```
HTML-in-Canvas: canvasClip hit test on rotated drawable element uses axis-aligned bounding box
```

**Steps to reproduce**

```
1. Launch Chrome Canary 158.0.8104.0 (also reproduces on 157.0.8102.0) with:
   --enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features
2. Save the attached canvasclip-rotated-hit-test.html and serve it over HTTP from localhost
   (for example run "npx http-server" in its folder), then open
   http://localhost:8080/canvasclip-rotated-hit-test.html
3. The page creates <canvas content="drawable"> containing one 200x120 drawable child and calls
   canvas.updateElementGeometry(child, {
     canvasTransform: new DOMMatrix().translate(120, 40).rotate(20),
     canvasClip: { x: 0, y: 0, width: 100, height: 120 }   // left half of the child
   })
4. It then calls document.elementFromPoint() at four child-local points mapped through the same
   transform and lists the hit element in a table. It also draws the clipped child, the rotated clip
   (blue), the clip's canvas-space bounding box (red dashes) and each point (green = expected,
   red = wrong).
5. Compare the "Expected" and "elementFromPoint" columns.
```

**Description**

```
When a drawable canvas child has a non-axis-aligned canvasTransform (rotation) and a canvasClip,
hit testing does not respect the transformed clip rectangle. Points outside the clip but inside the
axis-aligned bounding box of the transformed clip still hit the child. Painting is clipped
correctly, so these points look empty on screen yet receive clicks.

Results (child-local point -> hit element):
  (50, 60)   inside the clip                                   -> child   (correct)
  (104, 110) 4 px past the clip edge, inside its bounding box   -> child   (expected: canvas)
  (120, 100) 20 px past the clip edge, inside its bounding box  -> child   (expected: canvas)
  (180, 10)  outside the clip's bounding box                    -> canvas  (correct)

The clip is applied to hit testing, but as the axis-aligned bounding box of the transformed clip
rect instead of the transformed rect itself. The result is the same headless and in a normal
window, and on Canary 157.0.8102.0 and 158.0.8104.0 (Windows 11, NVIDIA GPU).

Expected: canvasClip is a rectangle in the element's local coordinate space, as the HTML-in-Canvas
explainer describes. Hit testing should use the same transformed clip shape that painting uses,
so points outside it fall through to the canvas.

Impact: any rotated or skewed drawable element with a clip gets invisible but clickable regions
near its clip edges. Hits land on content that is not drawn there. Libraries that present real
DOM controls through HTML-in-Canvas must avoid clipping rotated elements, or keep hit-sensitive
content away from clip edges. We hit this in an open-source React library while verifying hit
geometry; our functional self-test rotates a probe by 11 degrees and failed whenever the canvas
sat on a fractional pixel offset, because the test point was only 0.04 px outside the bounding box.

Related: 556756510 (Need a canvas clip for update element geometry), 532229486 (HTML-in-Canvas:
Implement drawing of canvas descendants).
```

### WICG html-in-canvas ([#186](https://github.com/WICG/html-in-canvas/issues/186))

Repository: <https://github.com/WICG/html-in-canvas/issues>

- **Title:** Clarify that `canvasClip` applies in element-local space for hit testing under a
  non-axis-aligned `canvasTransform`.
- **Body:** The explainer describes `canvasClip` as a rectangle in the element's coordinate space.
  Chromium 157 clips painting by the transformed rectangle, but clips hit testing by its
  axis-aligned bounding box. Reproduction and measurements are in the Chromium bug above. Could
  the explainer state that hit testing uses the same transformed clip shape as painting?

Checked against WICG html-in-canvas at `5fb3df86` (2026-10-09).
