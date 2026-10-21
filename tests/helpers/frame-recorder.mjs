/**
 * Records every frame the compositor presents (CDP `Page.startScreencast`) and judges whether each one shows the page's
 * content. Used by the seamless-admission suite (`tests/browser/seamless-admission.test.mjs`, issue #202) to prove that no
 * frame between `enable()` and `gpu` is blank (black, white or empty).
 *
 * A frame shows the content when a set of reference pixels each hold the colour they have in the ordinary DOM or in the
 * GPU presentation. The reference pixels are chosen from two baseline screenshots, one per presentation: only flat,
 * opaque pixels that are neither near white nor near black in either. Those are content areas (panels, cards, plates),
 * so anti-aliasing and text differences between DOM and GPU never count, while a blank frame (a cleared canvas over an
 * empty host, or an unconfigured swapchain) fails on every one of them.
 */
import { PNG } from "pngjs";

/** Starts a screencast that keeps every PNG frame; `stop()` returns them with their epoch-second timestamps. */
export async function startRecording(page, { width, height, dpr }) {
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", frame => {
    frames.push({ at: frame.metadata.timestamp * 1000, data: frame.data });
    cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: Math.round(width * dpr), maxHeight: Math.round(height * dpr) });
  return {
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      await cdp.detach().catch(() => {});
      frames.sort((a, b) => a.at - b.at);
      return frames;
    },
  };
}

const near = (a, b, tolerance) => Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
const pixelAt = (png, x, y) => { const o = (y * png.width + x) * 4; return [png.data[o], png.data[o + 1], png.data[o + 2], png.data[o + 3]]; };

const blankish = c => c[0] > 238 && c[1] > 238 && c[2] > 238 || c[0] < 14 && c[1] < 14 && c[2] < 14;
/**
 * Picks reference pixels from the DOM and GPU baseline screenshots (PNG buffers of the same size): `{ x, y, colors }`
 * where each presentation shows a flat opaque colour that is neither near white nor near black; `colors` holds the DOM
 * colour and the GPU colour. At most `limit` points, evenly spread.
 */
export function referencePoints(domPng, gpuPng, { step = 16, tolerance = 6, limit = 600 } = {}) {
  const dom = PNG.sync.read(domPng), gpu = PNG.sync.read(gpuPng);
  if (dom.width !== gpu.width || dom.height !== gpu.height) throw new Error(`Baselines differ in size: ${dom.width}x${dom.height} vs ${gpu.width}x${gpu.height}`);
  const all = [];
  for (let y = step; y < dom.height - step; y += step) for (let x = step; x < dom.width - step; x += step) {
    const a = pixelAt(dom, x, y), b = pixelAt(gpu, x, y);
    const flat = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => near(pixelAt(dom, x + dx * 3, y + dy * 3), a, tolerance) && near(pixelAt(gpu, x + dx * 3, y + dy * 3), b, tolerance));
    if (a[3] === 255 && b[3] === 255 && flat && !blankish(a) && !blankish(b)) all.push({ x, y, colors: [a, b] });
  }
  const stride = Math.max(1, Math.ceil(all.length / limit));
  const picked = all.filter((_, index) => index % stride === 0);
  // The screencast may deliver frames in CSS pixels at a higher DPR: remember the baseline's width to scale the points.
  picked.baselineWidth = dom.width;
  picked.baselineHeight = dom.height;
  return picked;
}

/**
 * Scores one recorded frame against the reference points. `match` is the fraction of points holding their baseline colour,
 * `white` and `black` the fractions that read near white / near black / fully transparent (the blank signatures).
 */
export function scoreFrame(frame, points, { tolerance = 24 } = {}) {
  const png = PNG.sync.read(Buffer.from(frame.data, "base64"));
  let matched = 0, white = 0, black = 0;
  const scale = png.width / (points.baselineWidth ?? png.width);
  // Regions (a 4 x 3 grid over the baseline): a frame missing one layer or panel fails its region even when the
  // frame as a whole still matches, so `worst` is the lowest match of any region holding at least 4 reference points.
  const regions = new Map();
  for (const point of points) {
    const pixel = pixelAt(png, Math.min(Math.round(point.x * scale), png.width - 1), Math.min(Math.round(point.y * scale), png.height - 1));
    const ok = point.colors.some(color => near(pixel, color, tolerance));
    if (ok) matched++;
    else if (pixel[0] > 238 && pixel[1] > 238 && pixel[2] > 238) white++;
    else if (pixel[3] < 20 || pixel[0] < 14 && pixel[1] < 14 && pixel[2] < 14) black++;
    const key = `${Math.min(3, Math.floor(point.x * 4 / (points.baselineWidth ?? 1)))}:${Math.min(2, Math.floor(point.y * 3 / (points.baselineHeight ?? 1)))}`;
    const region = regions.get(key) ?? { total: 0, matched: 0 };
    region.total++; if (ok) region.matched++;
    regions.set(key, region);
  }
  const worst = Math.min(1, ...[...regions.values()].filter(region => region.total >= 4).map(region => region.matched / region.total));
  return { match: matched / points.length, worst, white: white / points.length, black: black / points.length, width: png.width, height: png.height };
}
