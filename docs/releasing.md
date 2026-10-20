# Releasing

The library packages are versioned and published with [Changesets](https://changesets.dev) and the
[Release workflow](../.github/workflows/release.yml). The five library packages are no longer
`"private"`, but nothing is on npm yet and the workflow does nothing until the repository variable
`RELEASES_ENABLED` is `true`. Nothing reaches npm until the owner completes
[First publish](#first-publish-one-time-local) and [Enabling releases](#enabling-releases).

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
   - **GPU** (self-hosted GPU runner): the full browser suite and `test:package`, with React 18
     and 19, the HTML-in-Canvas flags on and off, at DPR 1 and 2.
   - **Publish** (`npm` environment): publishes the packed archives with npm trusted publishing and
     provenance, then pushes a git tag and a GitHub release per package, such as
     `@underglass/core@0.2.0`.
3. **Otherwise** it does nothing. This is also the case while every public package's version is already on npm.

Apart from the one-time [first publish](#first-publish-one-time-local), publishing from a laptop is not
part of the process. `publishConfig.provenance` makes `npm publish` refuse outside a CI provider that
can attest the build (so the first publish passes `--provenance=false`).

## Enabling releases

These steps are the owner's. They are account and repository settings that no pull request can make.

**Versioning only** (Version Packages pull requests and changelogs; nothing is published until the trusted publishers, the GPU runner and the `npm` environment below are in place):

1. In *Settings → Actions → General*, allow GitHub Actions to create and approve pull requests.
2. Set the repository variable `RELEASES_ENABLED` to `true`.

**Publishing to npm** (in this order: npm cannot attach a trusted publisher to a package name that does
not exist, so the first publish comes first):

1. Do the one-time [first publish](#first-publish-one-time-local) so each package name exists, then
   [configure the trusted publisher](#configure-the-trusted-publisher) for each of the five.
2. Create the GitHub environment `npm` (*Settings → Environments*). Add yourself as a required
   reviewer if every publish should wait for approval.
3. Keep the self-hosted GPU runner online with `GPU_RUNNER=true` ([ci-gpu-runner.md](ci-gpu-runner.md)).
   The workflow refuses to publish without it.
4. Set `RELEASES_ENABLED=true` if it is not already set. The `"private": true` flag is already removed
   from the five public manifests, [distribution.md](distribution.md) is updated and open issue SCOPE-005
   is closed, so the next push to `main` starts the flow in
   [What the first real version is](#what-the-first-real-version-is).

## First publish (one time, local)

npm trusted publishing cannot be configured for a package that does not exist yet, and the Release
workflow cannot create one without a trusted publisher or a stored token. So each of the five names is
claimed once from your machine with a placeholder, and every real release then comes from CI with
provenance. The placeholder is not built from the repository.

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
npm trust github @underglass/core --file release.yml --repo RaananW/underglass --env npm --dry-run
npm trust github @underglass/core --file release.yml --repo RaananW/underglass --env npm -y
npm trust list @underglass/core      # confirm; repeat both commands for react, vue, css-compiler and ui
```

Do not add an npm token to the repository: the Release workflow publishes with OIDC only (`id-token:
write` in the `npm` environment). The workflow installs npm 11.17.0 for that job.

### Alternative: publish the first real version locally

Instead of placeholders, publish the real first version by hand from the release commit (the merged
*Version Packages* commit), core first because the others pin it exactly:

```sh
npm ci
npm publish --workspace @underglass/core --provenance=false
npm publish --workspace @underglass/react --provenance=false
npm publish --workspace @underglass/vue --provenance=false
npm publish --workspace @underglass/css-compiler --provenance=false
npm publish --workspace @underglass/ui --provenance=false
```

`publishConfig.access` is `public` and `prepack` rebuilds each package. The downside: that first
version has **no provenance attestation** and skips the GPU gate (browser suite and installed-tarball
consumers), so the version consumers meet first is the least verified one. The Release workflow then
finds it already on npm and does nothing for it, so its git tags and GitHub releases must be made by
hand, and the trusted publisher still has to be configured afterwards. Prefer the placeholder.

## What the first real version is

The manifests say `0.1.0`, but `0.1.0` was never published, and about 100 changesets are pending, many of them
`minor` (a breaking-change bump while the version is 0.x). `npx changeset status --verbose` (read-only, run on
2026-10-20) reports every package in the fixed group moving **0.1.0 -> 0.2.0**. So:

1. The first push to `main` after `RELEASES_ENABLED` is set opens the **Version Packages** pull request, which
   bumps `core`, `react`, `vue`, `css-compiler` and `ui` to `0.2.0`, pins core `0.2.0` in the
   dependents and prepends the changesets to each `CHANGELOG.md`.
2. Merging it makes the workflow pack, run the GPU gate and publish `0.2.0` of the five packages from
   CI with provenance, then tag `@underglass/core@0.2.0` and so on.

The first version on npm is therefore `0.2.0`, not `0.1.0`. If you want `0.1.0` to be the first release,
that is a deliberate manual choice (for example, change the pending changesets' bump to `patch`, which
yields `0.1.1` at the lowest, or edit versions by hand, which this repository forbids); nothing here
does it. Re-run `npx changeset status --verbose` before the release, since new pull requests change the result.

## Prereleases

To publish test versions under the `next` dist-tag instead of `latest`:

```sh
npx changeset pre enter next   # versions become 0.2.0-next.0, 0.2.0-next.1, ...
npx changeset pre exit         # back to normal releases on the next Version Packages pull request
```

Commit the `.changeset/pre.json` that `pre enter` creates; the workflow releases those versions as usual.
