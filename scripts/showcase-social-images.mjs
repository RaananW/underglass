/**
 * Renders the showcase's social card (`examples/showcase/public/og.jpg`, 1200x630) and Apple touch icon
 * (`apple-touch-icon.png`, 180x180). The card is a picture of the home page itself: its cover in a 1200x630 window,
 * from a served build. Run it by hand after changing the brand or the cover and commit the images; the build only
 * copies them. Needs the Chrome Canary the browser tests use.
 *
 *   npm run build:showcase && npm run preview:showcase     (in another shell)
 *   node scripts/showcase-social-images.mjs [http://127.0.0.1:5191/underglass/]
 */
import { chromium } from "@playwright/test";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";

const output = "examples/showcase/public";
const home = process.argv[2] ?? "http://127.0.0.1:5191/underglass/";
// The brand mark: three panes of glass, one of them lit, as `.mark` in `src/home/home.css` and `public/favicon.svg` draw it.
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -4 32 32" width="132" height="132">
  <rect x=".75" y=".75" width="15.5" height="11.5" rx="2.25" fill="#07080a" stroke="#eceef2" stroke-width="1.5"/>
  <rect x="5.25" y="6.25" width="15.5" height="11.5" rx="2.25" fill="#07080a" stroke="#eceef2" stroke-width="1.5"/>
  <rect x="9.75" y="11.75" width="15.5" height="11.5" rx="2.25" fill="#ff5a36" stroke="#ff5a36" stroke-width="1.5"/></svg>`;
const icon = `<body style="margin:0;width:180px;height:180px;display:grid;place-items:center;background:radial-gradient(120px 100px at 90% 0%, rgb(96 132 255 / 22%), transparent 70%), #07080a">${mark}</body>`;

const browser = await chromium.launch(browserLaunchOptions({ native: true }));
try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1200, height: 630 } });
  await page.goto(home);
  // The cover as the visitor of a current browser sees it: with GPU presentation where this browser has it.
  await page.waitForFunction(() => window.homeDeck?.state().mode === "gpu", null, { timeout: 20_000 }).catch(() => undefined);
  await page.mouse.move(1196, 626);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${output}/og.jpg`, type: "jpeg", quality: 90 });
  await page.setViewportSize({ width: 180, height: 180 });
  await page.setContent(icon);
  await page.screenshot({ path: `${output}/apple-touch-icon.png` });
} finally { await browser.close(); }
console.log(`Wrote ${output}/og.jpg and ${output}/apple-touch-icon.png`);
