/**
 * Renders the picture of each example that its card shows, in two sizes (`examples/showcase/public/thumbs/<id>.jpg`,
 * 720x485, and `<id>-s.jpg`, 360x243): the example's own stage, GPU-presented, from a served build. An example's stage
 * is 1040x700; of a taller one (the Instrument gallery) the picture is the top, in the same proportions. Run it by hand
 * after an example's look changes and commit the images; the build only copies them. Needs the Chrome Canary the
 * browser tests use.
 *
 *   npm run build:showcase && npm run preview:showcase     (in another shell)
 *   node scripts/showcase-thumbnails.mjs [http://127.0.0.1:5191/underglass/] [id ...]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { examples } from "../examples/showcase/src/catalog.ts";

const output = "examples/showcase/public/thumbs";
const [site = "http://127.0.0.1:5191/underglass/", ...only] = process.argv.slice(2);
const sizes = [["", 720, 485], ["-s", 360, 243]];
const [, width, height] = sizes[0];
/** What a visitor would do first, where the opening state of an example shows little of it. */
const poses = {
  motion: async page => { await page.getByRole("button", { name: "Fan", exact: true }).click(); await page.waitForTimeout(1600); },
  presence: async page => {
    for (let sent = 0; sent < 2; sent++) { await page.locator(".stage button").filter({ hasText: /send|notify/i }).first().click(); await page.waitForTimeout(500); }
    await page.waitForTimeout(900);
  },
};

const browser = await chromium.launch(browserLaunchOptions({ native: true }));
try {
  await mkdir(output, { recursive: true });
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1280, height: 900 }, reducedMotion: "no-preference" });
  const scaler = await browser.newPage({ deviceScaleFactor: 1, viewport: { width, height } });
  for (const example of examples) {
    if (only.length && !only.includes(example.id)) continue;
    await page.goto(`${site}examples/${example.id}`);
    // The example as a current browser shows it: GPU-presented where this browser has it.
    const gpu = await page.waitForFunction(() => window.showcase?.state().mode === "gpu", null, { timeout: 25_000 }).then(() => true, () => false);
    await page.waitForTimeout(1500);
    await poses[example.id]?.(page).catch(error => console.warn(`${example.id}: its pose was not taken (${String(error).split("\n")[0]})`));
    await page.mouse.move(2, 2);
    const stage = page.locator(".stage");
    await stage.scrollIntoViewIfNeeded();
    const box = await stage.boundingBox();
    const clip = { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, Math.round(box.width * height / width)) };
    const shot = await page.screenshot({ clip, type: "png" });
    for (const [suffix, wide, high] of sizes) {
      await scaler.setViewportSize({ width: wide, height: high });
      await scaler.setContent(`<body style="margin:0;background:#07080a"><img src="data:image/png;base64,${shot.toString("base64")}" style="display:block;width:${wide}px;height:${high}px;object-fit:cover;object-position:top"></body>`);
      await scaler.locator("img").evaluate(image => image.decode());
      await writeFile(`${output}/${example.id}${suffix}.jpg`, await scaler.screenshot({ type: "jpeg", quality: 82 }));
    }
    console.log(`${example.id}: ${gpu ? "GPU" : "ordinary DOM"}, ${Math.round(clip.width)}x${Math.round(clip.height)} -> ${sizes.map(([, wide, high]) => `${wide}x${high}`).join(" and ")}`);
  }
} finally { await browser.close(); }
