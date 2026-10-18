/**
 * Runs the Playwright browser suite (`tests/browser/*.test.mjs`) with the repository config, then
 * redacts local paths from the evidence it wrote.
 *
 * Invoked by `npm test`, `npm run test:browser` and the Browser workflow (`.github/workflows/browser.yml`),
 * and by `react-matrix.mjs` and `compiler-validation.mjs` for subsets. Extra arguments (suite file names,
 * `--grep`, `--max-failures=1`, ...) are forwarded to `playwright test`. Browser selection and evidence
 * routing come from the shared helpers (`CANVAS_BROWSER_EXECUTABLE`, `CANVAS_BROWSER_EXTRA_ARGS`,
 * `CANVAS_EVIDENCE_ROOT`, `CANVAS_TEST_PREVIEW_URL`, `CANVAS_TEST_DEV_URL`).
 *
 * The default run is the regression suite: the probe and prototype suites (`ui-probe-*`, `ui-proto-*`, the
 * evidence behind design decisions) are skipped. `--probes` runs only them (`npm run test:browser:probes`),
 * `--all` runs everything, and naming a probe file runs it; the three set `CANVAS_BROWSER_PROBES` for the
 * Playwright config.
 *
 * Output: Playwright results and JSON report under the evidence root (default
 * `evidence/regression/current`). Exits with Playwright's exit status; a sanitizer failure is a failure.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const probeFile = /ui-pro(?:be|to)-/;
const forwarded = process.argv.slice(2).filter(argument => argument !== "--probes" && argument !== "--all");
const probes = process.argv.includes("--probes") ? "only"
  : process.argv.includes("--all") || forwarded.some(argument => probeFile.test(argument)) ? "all"
  : process.env.CANVAS_BROWSER_PROBES;
const env = probes ? { ...process.env, CANVAS_BROWSER_PROBES: probes } : process.env;

// Resolve Playwright's CLI from the installed package and run it with this Node, so no `npx` or
// platform-specific shell shim is involved.
const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("@playwright/test/package.json")));
const child = spawn(process.execPath, [cli, "test", "--config", "tests/browser/playwright.config.mjs", ...forwarded], { stdio: "inherit", env });
const code = await new Promise(resolve => {
  child.once("error", error => { console.error("Browser test runner failed:", error); resolve(1); });
  child.once("exit", (code, signal) => {
    if (signal) console.error(`Browser test runner terminated by ${signal}`);
    resolve(code ?? 1);
  });
});
// Sanitize even when tests failed, and only then report the runner's status. Importing the module runs
// it; if it throws, the rejected import fails this script.
await import("./sanitize-evidence.mjs");
process.exitCode = code;
