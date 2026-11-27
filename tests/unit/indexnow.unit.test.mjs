/**
 * The IndexNow submission after a deployment (`scripts/indexnow.mjs`, `.github/workflows/indexnow.yml`): which URLs a
 * build changed, the request body, the wait for the build to go live, and the public key the site serves.
 */
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { changedUrls, endpoint, host, isBuildOf, key, keyLocation, maxUrls, origin, parseArgs, payloads, submit, waitForBuild } from "../../scripts/indexnow.mjs";

const record = { [`${origin}/`]: { hash: "a", date: "2026-11-27" }, [`${origin}/examples/motion`]: { hash: "b", date: "2026-11-20" }, [`${origin}/docs/guide/x`]: { hash: "c", date: "2026-11-27" }, "https://other.example/z": { hash: "d", date: "2026-11-27" } };

test("the URLs to submit are the site's pages dated the build's day", () => {
  assert.deepEqual(changedUrls(record, "2026-11-27"), [`${origin}/`, `${origin}/docs/guide/x`]);
  assert.deepEqual(changedUrls(record, "2026-11-21"), []);
  assert.throws(() => changedUrls([], "2026-11-27"), /not a record/);
});

test("the request body names the host, the key and where the site serves it, in batches of at most 10,000 URLs", () => {
  assert.equal(host, "underglass.dev");
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(endpoint, "https://api.indexnow.org/indexnow");
  assert.deepEqual(payloads([`${origin}/a`]), [{ host, key, keyLocation, urlList: [`${origin}/a`] }]);
  const many = Array.from({ length: maxUrls + 1 }, (_, index) => `${origin}/p${index}`);
  assert.deepEqual(payloads(many).map(body => body.urlList.length), [maxUrls, 1]);
  assert.deepEqual(payloads([]), []);
});

test("the site serves the key at the location the request names", async () => {
  assert.equal(keyLocation, `${origin}/${key}.txt`);
  assert.equal((await readFile(`examples/showcase/public/${key}.txt`, "utf8")).trim(), key);
  assert.deepEqual((await readdir("examples/showcase/public")).filter(name => /^[0-9a-f]{32}\.txt$/.test(name)), [`${key}.txt`]);
});

test("a build is recognised by its commit", () => {
  assert.equal(isBuildOf({ commit: "ABC123", date: "2026-11-27" }, "abc123"), true);
  assert.equal(isBuildOf({ commit: null }, "abc123"), false);
  assert.equal(isBuildOf(undefined, "abc123"), false);
});

const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

test("the wait polls until the site reports the commit, and gives up with nothing after the timeout", async () => {
  const replies = [() => { throw new Error("offline"); }, () => answer({}, 404), () => answer({ commit: "old", date: "2026-11-26" }), () => answer({ commit: "new", date: "2026-11-27" })];
  let slept = 0;
  const build = await waitForBuild("new", { fetcher: () => replies.shift()(), sleep: async () => { slept++; }, interval: 1, timeout: 100 });
  assert.deepEqual(build, { commit: "new", date: "2026-11-27" });
  assert.equal(slept, 3);
  let polls = 0;
  assert.equal(await waitForBuild("new", { fetcher: async () => { polls++; return answer({ commit: "old" }); }, sleep: async () => {}, interval: 20, timeout: 100 }), undefined);
  assert.equal(polls, 6);
});

test("200 and 202 are accepted; other statuses are logged, not thrown", async () => {
  const lines = [], sent = [];
  const statuses = [200, 202, 403];
  const fetcher = async (url, init) => { sent.push([url, init.method, JSON.parse(init.body)]); const status = statuses[sent.length - 1]; return { status, text: async () => "bad key" }; };
  const bodies = payloads(["a", "b", "c"].map(name => `${origin}/${name}`), 1);
  assert.deepEqual(await submit(bodies, { fetcher, log: line => lines.push(line) }), [200, 202, 403]);
  assert.deepEqual(sent.map(([url, method]) => [url, method]), Array(3).fill([endpoint, "POST"]));
  assert.match(lines[0], /accepted 1 URLs \(HTTP 200\)/);
  assert.match(lines[1], /HTTP 202/);
  assert.match(lines[2], /answered HTTP 403.*bad key/);
});

test("the command line takes a commit or --no-wait, and --dry-run", () => {
  assert.deepEqual(parseArgs(["abc", "--dry-run"]), { commit: "abc", wait: true, dryRun: true });
  assert.deepEqual(parseArgs(["--no-wait"]), { commit: undefined, wait: false, dryRun: false });
  assert.throws(() => parseArgs([]), /commit/);
  assert.throws(() => parseArgs(["a", "b"]), /Unexpected/);
  assert.throws(() => parseArgs(["--now"]), /Unknown option/);
});

test("the workflow needs no secret, reads the repository only and submits for the pushed commit", async () => {
  const workflow = (await readFile(".github/workflows/indexnow.yml", "utf8")).replaceAll("\r\n", "\n");
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\n {2}contents: read\n/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.match(workflow, /node scripts\/indexnow\.mjs "\$\{\{ github\.sha \}\}"/);
  for (const [, ref] of workflow.matchAll(/uses: \S+@(\S+)/g)) assert.match(ref, /^[0-9a-f]{40}$/);
});
