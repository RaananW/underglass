/**
 * Checks that every public library package's current version is live on npm, and (for a release that is not a
 * prerelease) that its `latest` dist-tag points at it. Run by the Release workflow after publishing:
 * `changeset publish` reports a package as published when npm accepted the upload, which is not the same as
 * the version being installable (for example a publish held for approval, as npm's staged publishing does).
 * Polls for up to `VERIFY_TIMEOUT_SECONDS` (default 300) to allow for registry propagation.
 * Usage: node scripts/verify-published.mjs
 */
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const view = (spec, field) => {
  try {
    return JSON.parse(execFileSync(npm, ["view", spec, field, "--json", "--prefer-online"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], shell: process.platform === "win32" }) || "null");
  } catch {
    return null;
  }
};

const packages = [];
for (const entry of await readdir("packages", { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifest = JSON.parse(await readFile(join("packages", entry.name, "package.json"), "utf8"));
  if (!manifest.private) packages.push({ name: manifest.name, version: manifest.version });
}

const deadline = Date.now() + Number(process.env.VERIFY_TIMEOUT_SECONDS ?? 300) * 1000;
let missing = packages;
for (;;) {
  missing = missing.filter(({ name, version }) => {
    if (view(`${name}@${version}`, "version") !== version) return true;
    return !version.includes("-") && view(name, "dist-tags")?.latest !== version;
  });
  if (missing.length === 0 || Date.now() > deadline) break;
  await new Promise(done => setTimeout(done, 15000));
}

if (missing.length > 0) {
  console.error(`Not live on npm (version missing, or "latest" not on it): ${missing.map(({ name, version }) => `${name}@${version}`).join(", ")}.`);
  console.error("Check the package on npmjs.com: a publish held for approval (staged publishing) or a trusted publisher without --allow-publish keeps the version off the registry.");
  process.exit(1);
}
console.log(`Live on npm: ${packages.map(({ name, version }) => `${name}@${version}`).join(", ")}.`);
