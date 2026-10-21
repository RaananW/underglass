# Releasing

The library packages are versioned and published with [Changesets](https://changesets.dev) and the
[Release workflow](../.github/workflows/release.yml). Releases are live: the five library packages were
first published as `0.2.0` on 2026-10-21, from CI with provenance, and every merged **Version Packages**
pull request publishes the next version ([Making a release](#making-a-release)). The one-time setup that
made this possible is done and kept below for reference.

## Versions

`@underglass/core`, `@underglass/react`, `@underglass/vue`, `@underglass/css-compiler` and
`@underglass/ui` share one version (a Changesets `fixed` group in
[`.changeset/config.json`](../.changeset/config.json)). All five are public packages published to npm
(the owner decided on 2026-10-20 to publish `@underglass/ui`, Strata, with the rest).

- A release bumps all five together, to the largest bump any pending changeset asks for.
- The adapters and the compiler pin the exact core version they were released with, so an
  application always gets one core and one engine.
- While the version is 0.x, a **minor** bump marks a breaking change, and a **patch** bump marks a
  fix or an addition. The public API is the root and subpath exports documented in
  [api.md](api.md) and checked by `fixtures/package-consumer/public-types.ts`.
- Nobody picks version numbers by hand. Changesets computes them from the pending changesets.

The example apps (`@underglass/playground`, `@underglass/showcase`) are ignored by Changesets and
depend on `"*"`, so they always use the workspace's current library version.

## Changesets: one per pull request

A pull request that changes anything under `packages/` adds a changeset. CI fails without one.

```sh
npm run changeset              # pick the packages, the bump and write one user-facing sentence or more
npm run changeset -- --empty   # a package changed but users see no difference (tests, comments, build)
```

This writes a small Markdown file in `.changeset/`; commit it with the change. Write it for library
users: what changed, what to do differently, and any limits. For capture, geometry or presentation
changes, include the upstream check AGENTS.md requires (WICG proposal SHA and date, tracker access,
browser build tested). Changes outside `packages/` (tests, scripts, docs, examples) need no changeset;
the pull request description covers them.

The files in [docs/changes](changes/README.md) are the notes written before Changesets; they stay as
history, and their content is summarized in each package's `0.1.0` changelog entry.

## How a release happens

Once enabled, every push to `main` runs the Release workflow, which picks one mode:

1. **Changesets are pending:** it opens or updates a **Version Packages** pull request. That pull request
   applies the bump to every package, updates the core pins and `package-lock.json`, and prepends the
   collected changesets to each `CHANGELOG.md`. Review it like any pull request; merging it is the
   release decision.
2. **No changesets, and a public package's version is not on npm yet** (that is, right after the
   Version Packages pull request merges): it validates, packs and publishes.
   - **Pack** (hosted runner): build, typecheck, unit and compiler tests,
     `release-validation.mjs build-only` for both React peers, then pack the archives.
   - **GPU** (self-hosted GPU runner, **only when the repository variable `GPU_RUNNER` is `true`**): the
     full browser suite and `test:package`, with React 18 and 19, the HTML-in-Canvas flags on and off, at DPR
     1 and 2. The default suite takes about 1.3 to 1.6 hours, so the job's timeout is 150 minutes. With no
     runner the job is skipped. A failed or cancelled GPU job blocks publishing.
   - **Publish** (`npm` environment): runs when Pack succeeded and the GPU job passed or was skipped, and
     publishes the packed archives with npm trusted publishing and
     provenance, then pushes a git tag and a GitHub release per package, such as
     `@underglass/core@0.2.0`.
3. **Otherwise** it does nothing. This is also the case while every public package's version is already on npm.

**Empty changesets alone do not release.** When every pending changeset is empty (`npm run changeset --
--empty`), `changesets/action/select-mode` returns `none`: no Version Packages pull request and no publish.
They are consumed by the next Version Packages pull request that a real changeset opens. So a release-only
fix that touches `packages/` and lands between a Version Packages merge and its publish must not need a
changeset, or it stops that publish.

Publishing from a laptop is not part of the process (the one-time [first publish](#first-publish-done-2026-10-21)
was the exception). `publishConfig.provenance` makes `npm publish` refuse outside a CI provider that can
attest the build.

## Making a release

1. **Wait for the Version Packages pull request.** The Release workflow opens or updates it on every push to
   `main` that has pending changesets. Read its changelog entries: they are what users will see.
2. **Run the release gate on its branch.** No GPU runner is registered, so hosted CI cannot run the browser
   suite and you run it. On a machine with a GPU and Chrome Canary, check out the pull request's branch
   (`changeset-release/main`) and run `npm ci`, `npm run build`, `npm run test:browser` (about 1.5 hours) and
   `npm run test:package` ([ci-gpu-runner.md](ci-gpu-runner.md#running-the-same-checks-locally)). Continue
   only when both pass, apart from failures already filed as known flakes in [open issues](open-issues.md).
3. **Merge it.** Merging is the release decision: the workflow validates, packs and publishes every public
   package, then tags each one and creates its GitHub release. If you are a required reviewer of the `npm`
   environment, approve the deployment when the Release run asks.
4. **Check the result:** `npm dist-tag ls @underglass/core` (and the other four) should show `latest` on the
   new version. A version that the workflow reports as published but that is not installable is held on
   npm's side (for example a staged publish waiting for approval): check the package on npmjs.com.

*If a GPU runner is added later:* register it and set `GPU_RUNNER=true`; the Release workflow then runs the
same suites before publishing, and a failure blocks the publish.

### Settings this relies on (done 2026-10-21)

These are account and repository settings that no pull request can make. They are in place; recheck them
if publishing stops working.

- *Settings → Actions → General*: GitHub Actions may create and approve pull requests.
- Repository variable `RELEASES_ENABLED` = `true`. Unsetting it makes the Release workflow do nothing.
- GitHub environment `npm`, optionally with a required reviewer.
- Each of the five packages on npm has a [trusted publisher](#configure-the-trusted-publisher) for
  `RaananW/underglass`, workflow `release.yml`, environment `npm`, with permission to publish.

## First publish (done 2026-10-21)

This was done once, on 2026-10-21, for the five packages; it is kept for reference and for **adding a new
package** later (which needs the same two steps for its name before its first release).

npm trusted publishing cannot be configured for a package that does not exist yet, and the Release
workflow cannot create one without a trusted publisher or a stored token. So each name was claimed once
from the owner's machine with a placeholder (`0.0.0-placeholder.0`, deprecated), and every real release
comes from CI with provenance. The placeholder is not built from the repository.

Requirements: npm **11.5.1 or later** (trusted publishing; the `npm trust` command needs a newer npm,
check with `npm trust --help`) and an npm account in the `underglass` organization that may create
packages. Run these from an empty scratch directory outside the repository, with `REPO` set to this
checkout (only its `LICENSE` is used):

```sh
npm --version                  # 11.5.1 or later
npm login                      # 2FA; then check with: npm whoami
REPO=/path/to/underglass

for name in core react vue css-compiler ui; do
  mkdir -p "placeholder-$name" && cd "placeholder-$name"
  cat > package.json <<EOF
{
  "name": "@underglass/$name",
  "version": "0.0.0-placeholder.0",
  "description": "Placeholder that reserves the name. Underglass is not released yet: see https://github.com/RaananW/underglass",
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "git+https://github.com/RaananW/underglass.git", "directory": "packages/$name" },
  "homepage": "https://github.com/RaananW/underglass#readme",
  "publishConfig": { "access": "public" }
}
EOF
  printf '# @underglass/%s\n\nPlaceholder that reserves the package name. Underglass has not been released yet; see https://github.com/RaananW/underglass.\n' "$name" > README.md
  cp "$REPO/LICENSE" LICENSE
  npm publish --access public --provenance=false --tag placeholder   # add --dry-run first to inspect
  cd ..
done

for name in core react vue css-compiler ui; do
  npm deprecate "@underglass/$name@0.0.0-placeholder.0" "Placeholder that reserves the name; install a released version once one is published."
done
```

On Windows, run the same in PowerShell 7 (`pwsh`; Windows PowerShell 5.1 writes `package.json` with a
byte-order mark) from an empty folder outside the repository:

```powershell
npm --version                  # 11.5.1 or later
npm login                      # 2FA; then check with: npm whoami
$repo = "D:\path\to\underglass"
$root = Join-Path $HOME "ug-placeholders"
New-Item -ItemType Directory -Force $root | Out-Null

foreach ($name in "core","react","vue","css-compiler","ui") {
  $dir = Join-Path $root "placeholder-$name"
  New-Item -ItemType Directory -Force $dir | Out-Null
  [ordered]@{
    name          = "@underglass/$name"
    version       = "0.0.0-placeholder.0"
    description   = "Placeholder that reserves the name. Underglass is not released yet: see https://github.com/RaananW/underglass"
    license       = "Apache-2.0"
    repository    = [ordered]@{ type = "git"; url = "git+https://github.com/RaananW/underglass.git"; directory = "packages/$name" }
    homepage      = "https://github.com/RaananW/underglass#readme"
    publishConfig = @{ access = "public" }
  } | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $dir "package.json") -Encoding utf8
  "# @underglass/$name`n`nPlaceholder that reserves the package name. Underglass has not been released yet; see https://github.com/RaananW/underglass." |
    Set-Content (Join-Path $dir "README.md") -Encoding utf8
  Copy-Item (Join-Path $repo "LICENSE") $dir
  Push-Location $dir
  npm publish --access public --provenance=false --tag placeholder   # add --dry-run first to inspect
  Pop-Location
}

foreach ($name in "core","react","vue","css-compiler","ui") {
  npm deprecate "@underglass/$name@0.0.0-placeholder.0" "Placeholder that reserves the name; install a released version once one is published."
}
```

Notes on npm's behavior:

- A brand-new package gets the `latest` dist-tag on its first publish even with `--tag placeholder`,
  because `latest` must point at something. Until the first real release, `npm install @underglass/core`
  therefore resolves to the placeholder, which is why it is deprecated. The real publish (default tag
  `latest`) moves `latest` to the real version by itself; nothing has to be removed. Check with
  `npm dist-tag ls @underglass/core`.
- `0.0.0-placeholder.0` sorts below every real version, so a range such as `^0.1.0` can never pick it.
- `--provenance=false` is a safeguard: the scratch manifest has no `publishConfig.provenance`, but the
  repository manifests do, and npm refuses them outside a CI provider.

### Configure the trusted publisher

For each of the five packages: on npmjs.com open the package, *Settings → Trusted Publisher*, choose
GitHub Actions and enter the user `RaananW`, the repository `underglass`, the workflow filename
`release.yml` and the environment `npm`. With an npm that has the `trust` command (11.19 was checked;
the options come from `npm trust github --help`) the same can be done from the terminal:

```sh
npm trust github @underglass/core --file release.yml --repo RaananW/underglass --env npm --allow-publish --dry-run
npm trust github @underglass/core --file release.yml --repo RaananW/underglass --env npm --allow-publish -y
npm trust list @underglass/core      # confirm; repeat both commands for react, vue, css-compiler and ui
```

npm requires at least one permission flag: `--allow-publish` covers the Release workflow's ordinary
`npm publish`; `--allow-stage-publish` (npm's staged publishing) is not used.

On Windows (PowerShell 7):

```powershell
foreach ($p in "core","react","vue","css-compiler","ui") {
  npm trust github "@underglass/$p" --file release.yml --repo RaananW/underglass --env npm --allow-publish -y
  npm trust list "@underglass/$p"
}
```

Do not add an npm token to the repository: the Release workflow publishes with OIDC only (`id-token:
write` in the `npm` environment). The workflow installs npm 11.17.0 for that job.

For a new package, publishing its real first version by hand instead of a placeholder would ship it
without provenance and without the release gate, and its tag and GitHub release would have to be made by
hand; use the placeholder.

## The first release (history)

The manifests said `0.1.0`, which was never published. About 100 pending changesets, many of them `minor`,
moved the fixed group to **0.2.0**, the owner accepted that, and `0.2.0` of all five packages was published
from CI with provenance on 2026-10-21. Two release-only failures had to be fixed on the way (#209: the
release validation's React peer copy; #210: Changesets packs the workspaces in parallel, so the pack now runs
without lifecycle scripts after the build).

## Prereleases

To publish test versions under the `next` dist-tag instead of `latest`:

```sh
npx changeset pre enter next   # versions become 0.2.0-next.0, 0.2.0-next.1, ...
npx changeset pre exit         # back to normal releases on the next Version Packages pull request
```

Commit the `.changeset/pre.json` that `pre enter` creates; the workflow releases those versions as usual.
