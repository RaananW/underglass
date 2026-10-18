/**
 * Playwright configuration for the browser suites in this directory. Run with `npm run test:browser`, which
 * builds first (`npm run build`) and then runs `scripts/test-browser.mjs`. Tests default to the production preview
 * build at `previewURL`; tests that need React StrictMode or real HMR navigate to the Vite dev server at
 * `developmentURL` explicitly. The browser is Chrome Canary (or `CANVAS_BROWSER_EXECUTABLE`) launched with the
 * HTML-in-Canvas flags from `tests/helpers/browser.mjs`.
 */
import { defineConfig } from "@playwright/test";
import { developmentURL, previewURL } from "../helpers/urls.mjs";
import { evidenceRoot } from "../helpers/evidence.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";
import { resolve } from "node:path";

// When `CANVAS_TEST_DEV_URL` is set (as `react-matrix.mjs` and `compiler-validation.mjs` do), already-running
// servers are not reused.
const isolated = !!process.env.CANVAS_TEST_DEV_URL;

// Probe and prototype suites (`ui-probe-*`, `ui-proto-*`) are the evidence behind design decisions
// (docs/ui-library/phase0.md, docs/ui-library/instrument-phase0.md), not regression coverage: the core and
// component suites cover what they proved, and they cost about 25 of the full run's 55 minutes. The default
// run skips them. `CANVAS_BROWSER_PROBES=only` (`npm run test:browser:probes`) runs only them and
// `CANVAS_BROWSER_PROBES=all` runs everything; naming a probe file on the command line runs it
// (scripts/test-browser.mjs sets the variable).
const probePattern = /ui-pro(?:be|to)-[^/\\]*\.test\.mjs$/;
const probes = process.env.CANVAS_BROWSER_PROBES ?? "";

export default defineConfig({
  testDir: ".",
  // Every regression suite in this directory; a new suite needs no edit to a shared list.
  testMatch: probes === "only" ? probePattern : "*.test.mjs",
  testIgnore: probes ? [] : probePattern,
  // Suites run serially in one worker.
  workers: 1,
  // Playwright artifacts and the JSON report go under the evidence root (see tests/helpers/evidence.mjs).
  outputDir: resolve(evidenceRoot, "test-results"),
  timeout: 60000,
  reporter: [["list"], ["json", { outputFile: resolve(evidenceRoot, "browser-tests.json") }]],
  use: {
    baseURL: previewURL,
    // Default window size; tests that need another size set it themselves (todo.test.mjs uses 900x950).
    viewport: { width: 900, height: 750 },
    launchOptions: {
      ...browserLaunchOptions(),
    },
  },
  // Production build served by `vite preview` (the default target of every test), plus the Vite dev server used
  // by the StrictMode and HMR tests.
  webServer: [
    {
      cwd: resolve("."),
      command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${new URL(previewURL).port} --strictPort`,
      url: previewURL,
      reuseExistingServer: !isolated,
    },
    {
      cwd: resolve("."),
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${new URL(developmentURL).port} --strictPort`,
      url: developmentURL,
      reuseExistingServer: !isolated,
    },
  ],
});
