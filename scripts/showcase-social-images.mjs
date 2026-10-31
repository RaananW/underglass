/**
 * Renders the showcase's social card (`examples/showcase/public/og.jpg`, 1200x630) and Apple touch icon
 * (`apple-touch-icon.png`, 180x180) from the HTML below, in the hero's colours and brand mark. Run it by
 * hand after changing the brand or the site's headline (`node scripts/showcase-social-images.mjs`) and
 * commit the images; the build only copies them. Needs the Chrome Canary the browser tests use.
 */
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";

const output = "examples/showcase/public";
// The brand mark: three offset rounded layers, as `.brand-mark` in `src/style.css` draws it.
const mark = size => `<span style="position:relative;display:inline-block;width:${size}px;height:${size}px">${
  [["#ff6b4a", 0, 0], ["#6d4aff", 7, 5], ["#19c3b1", 14, 10]].map(([colour, top, left]) => `<i style="position:absolute;top:${top * size / 30}px;left:${
    left * size / 30}px;width:${20 * size / 30}px;height:${15 * size / 30}px;border-radius:${5 * size / 30}px;background:${colour}"></i>`).join("")}</span>`;
const background = `radial-gradient(900px 520px at 85% 20%, #4b2bd955, transparent 60%), radial-gradient(700px 520px at 10% 110%, #ff6b4a40, transparent 60%),
  radial-gradient(600px 400px at 55% 60%, #19c3b122, transparent 70%), #0d0b1a`;
const font = `'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif`;
const card = `<body style="margin:0;width:1200px;height:630px;background:${background};font-family:${font};color:#f6f3ff;overflow:hidden">
  <div style="position:absolute;inset:0;opacity:.5;background-image:radial-gradient(#ffffff14 1px, transparent 1px);background-size:26px 26px"></div>
  <div style="position:absolute;left:84px;top:72px;display:flex;align-items:center;gap:18px;font-size:34px;font-weight:700">${mark(46)}Underglass</div>
  <h1 style="position:absolute;left:84px;top:170px;margin:0;font-size:88px;line-height:1;letter-spacing:-3.5px;font-weight:800">Real React controls.<br>
    <span style="background:linear-gradient(92deg,#ffb27a 0%,#ff6fae 34%,#a48cff 66%,#5ee1d0 100%);-webkit-background-clip:text;background-clip:text;color:transparent">Painted by the GPU.</span></h1>
  <p style="position:absolute;left:84px;top:396px;margin:0;max-width:1000px;font-size:28px;line-height:1.45;color:#cdc6e2">Your original React DOM in one shared WebGPU compositor, through
    Chrome's HTML-in-Canvas. Typing, focus and clicks stay native.</p>
  <p style="position:absolute;left:84px;bottom:58px;margin:0;font-size:24px;font-weight:700;letter-spacing:.5px;color:#e3dcff">underglass.dev
    <span style="color:#8f87ad;font-weight:600"> · HTML-in-Canvas · WebGPU · React</span></p>
</body>`;
const icon = `<body style="margin:0;width:180px;height:180px;display:grid;place-items:center;background:${background}">${mark(116)}</body>`;

const browser = await chromium.launch(browserLaunchOptions({ native: "none" }));
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(card);
  await page.screenshot({ path: `${output}/og.jpg`, type: "jpeg", quality: 88 });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(icon);
  await page.screenshot({ path: `${output}/apple-touch-icon.png` });
} finally { await browser.close(); }
console.log(`Wrote ${output}/og.jpg and ${output}/apple-touch-icon.png`);
