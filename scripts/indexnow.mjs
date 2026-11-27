/**
 * Tells IndexNow (Bing, Yandex, Seznam, Naver; ChatGPT search and Copilot answer from Bing's index) which URLs of
 * https://underglass.dev a new build changed. Google ignores IndexNow. See docs/showcase.md#deployment.
 *
 * The build publishes `/build.json` (`{ commit, date }`, `scripts/assemble-site.mjs`) and `/sitemap-dates.json`
 * (`scripts/sitemap-dates.mjs`): a page changed in a build when its date is that build's date. The key is public by
 * design: the site serves it as `/<key>.txt` (`examples/showcase/public/`), which is how IndexNow verifies the host.
 *
 *   node scripts/indexnow.mjs <commit>            wait until the site reports <commit>, then submit what changed
 *   node scripts/indexnow.mjs --no-wait           use whatever build the site runs now
 *   node scripts/indexnow.mjs ... --dry-run       print the URLs and the payload, send nothing
 *
 * The workflow `.github/workflows/indexnow.yml` runs it for each push to `main`. Waiting for a build that never
 * goes live (a failed build, a slow queue) ends with a notice and exit code 0: this is a courtesy, not a gate.
 */
import { pathToFileURL } from "node:url";

export const origin = "https://underglass.dev";
export const host = new URL(origin).host;
export const key = "ce2b00398e5aa5ec770ef421fb0d7a7d";
export const keyLocation = `${origin}/${key}.txt`;
export const endpoint = "https://api.indexnow.org/indexnow";
/** IndexNow accepts at most 10,000 URLs per request. */
export const maxUrls = 10_000;

/** The URLs whose date in `sitemap-dates.json` is `date`, the build's day: the pages that build changed or added. */
export function changedUrls(dates, date) {
  if (!dates || typeof dates !== "object" || Array.isArray(dates)) throw new Error("sitemap-dates.json is not a record of dates");
  return Object.entries(dates).filter(([url, entry]) => entry?.date === date && (url === origin || url.startsWith(`${origin}/`))).map(([url]) => url).sort();
}

/** The request bodies for `urls`: one per `limit` URLs (`host`, `key`, `keyLocation`, `urlList`). */
export function payloads(urls, limit = maxUrls) {
  const bodies = [];
  for (let at = 0; at < urls.length; at += limit) bodies.push({ host, key, keyLocation, urlList: urls.slice(at, at + limit) });
  return bodies;
}

/** Whether `build` (the parsed `build.json`) is the build of `commit`. */
export const isBuildOf = (build, commit) => typeof build?.commit === "string" && build.commit.toLowerCase() === commit.toLowerCase();

/** Reads a JSON file of the site; the query defeats any cache in front of it. */
async function getJson(path, fetcher) {
  const response = await fetcher(`${origin}/${path}?t=${Date.now()}`, { headers: { accept: "application/json", "cache-control": "no-cache" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Polls `build.json` until it reports `commit`. Resolves to the build, or to `undefined` after `timeout` ms. A site
 * that cannot be read yet (no `build.json`, a network error) is waited for like an older build.
 */
export async function waitForBuild(commit, { fetcher = fetch, sleep = ms => new Promise(done => setTimeout(done, ms)), interval = 20_000, timeout = 20 * 60_000, log = () => {} } = {}) {
  for (let waited = 0; ; waited += interval) {
    let seen;
    try {
      const build = await getJson("build.json", fetcher);
      if (isBuildOf(build, commit)) return build;
      seen = `the site runs ${build?.commit ?? "an unknown build"}`;
    } catch (error) { seen = String(error?.message ?? error); }
    if (waited + interval > timeout) return undefined;
    log(`waiting for ${commit.slice(0, 7)}: ${seen}`);
    await sleep(interval);
  }
}

/** POSTs each body; IndexNow answers 200 or 202 when it takes the URLs. Resolves to the statuses. */
export async function submit(bodies, { fetcher = fetch, log = console.log } = {}) {
  const statuses = [];
  for (const body of bodies) {
    const response = await fetcher(endpoint, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    statuses.push(response.status);
    if (response.status === 200 || response.status === 202) log(`IndexNow accepted ${body.urlList.length} URLs (HTTP ${response.status}).`);
    else log(`IndexNow answered HTTP ${response.status} for ${body.urlList.length} URLs: ${(await response.text().catch(() => "")).slice(0, 300) || "no body"}`);
  }
  return statuses;
}

/** The command line: `[commit] [--no-wait] [--dry-run]`. */
export function parseArgs(argv) {
  const options = { commit: undefined, wait: true, dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-wait") options.wait = false;
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else if (options.commit === undefined) options.commit = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }
  if (options.wait && !options.commit) throw new Error("Give the commit to wait for, or --no-wait");
  return options;
}

async function main() {
  const { commit, wait, dryRun } = parseArgs(process.argv.slice(2));
  let build;
  if (wait) {
    build = await waitForBuild(commit, { log: console.log });
    if (!build) { console.log(`Notice: ${origin} did not report commit ${commit} in time; nothing submitted to IndexNow.`); return; }
    console.log(`${origin} runs ${commit.slice(0, 7)} (build date ${build.date}).`);
  } else {
    try { build = await getJson("build.json", fetch); }
    catch (error) {
      // The site has no build.json until a build with this script is deployed: fall back to the newest date in the record.
      console.log(`No build.json (${error.message}); using the newest date in sitemap-dates.json.`);
    }
  }
  const dates = await getJson("sitemap-dates.json", fetch);
  const date = typeof build?.date === "string" ? build.date : Object.values(dates).map(entry => entry?.date).filter(Boolean).sort().at(-1);
  const urls = changedUrls(dates, date);
  console.log(`${urls.length} of ${Object.keys(dates).length} URLs changed on ${date}.`);
  if (!urls.length) return;
  const bodies = payloads(urls);
  if (dryRun) {
    console.log(urls.join("\n"));
    console.log(`Payload (dry run, not sent to ${endpoint}):\n${JSON.stringify(bodies.length === 1 ? bodies[0] : bodies, null, 1)}`);
    return;
  }
  const statuses = await submit(bodies);
  // A rejected submission is logged, not failed: the next build submits again, and the sitemap still tells crawlers.
  if (statuses.some(status => status !== 200 && status !== 202)) console.log("Notice: IndexNow did not accept every request (see above).");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
