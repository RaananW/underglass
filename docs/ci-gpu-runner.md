# GPU browser tests in CI

The browser suite (`npm run test:browser`) needs a real GPU and Chrome Canary with
HTML-in-Canvas. GitHub-hosted runners cannot run it:

- **Linux** has only software WebGPU (SwiftShader). With Chrome for Testing Canary
  158.0.8104.0, a WebGPU device is lost as soon as it presents to a canvas, even in a plain
  WebGPU page with no library code: "A valid external Instance reference no longer exists".
- **Windows** runners expose no WebGPU adapter at all.

So `.github/workflows/browser.yml` runs on a **self-hosted runner with a GPU**. It stays
off (the job is skipped) until such a runner is registered and the repository variable
`GPU_RUNNER` is `true`.

## Set up a runner (one machine with a GPU)

1. Install Chrome Canary and Node 24 on the machine. The tests launch the installed Canary
   (Playwright channel `chrome-canary`) with the HTML-in-Canvas flags; no browser flags
   need to be set manually.
2. On GitHub: **Settings → Actions → Runners → New self-hosted runner**. Follow the commands
   for your OS, and when `config` asks for labels, add **`gpu`**.
3. Run the runner **as your logged-in user** (`run.cmd` / `./run.sh`, or a service that runs
   as your user) so Chrome can reach the GPU. A service under a system account usually
   gets no GPU.
4. **Settings → Secrets and variables → Actions → Variables**: add `GPU_RUNNER` = `true`.

From then on the suite runs on pushes to `main`, on pull requests from branches of this
repository, and on demand (**Actions → Browser → Run workflow**).

## Security

A self-hosted runner executes the workflow's code on that machine. The job never runs for
pull requests from forks. Also keep **Settings → Actions → General → Fork pull request
workflows** on "Require approval for all external contributors", and use a machine or user
account without access to anything sensitive.

## Hosted alternative

GitHub's GPU larger runners (Linux with an NVIDIA GPU) can replace the self-hosted machine:
change `runs-on` to the runner's label. They are billed per minute. The suite takes about
10 minutes on a desktop GPU, so check current per-minute pricing for a per-run estimate.
These runners are untested here, and Canary on Linux must come from Chrome for Testing.

## Running the same checks locally

```sh
node scripts/ci-gpu-probe.mjs   # WebGPU adapter and HTML-in-Canvas APIs present?
npm run build && node scripts/ci-gpu-smoke.mjs   # does the runtime admit GPU on this machine?
npm run test:browser            # the regression suite, as CI runs it (about 30 minutes)
npm run test:browser:probes     # the probe and prototype evidence suites CI skips (about 25 minutes)
```

`CANVAS_BROWSER_EXECUTABLE` selects another Chrome build, and `CANVAS_BROWSER_EXTRA_ARGS`
adds browser flags. `node scripts/ci-browser.mjs` downloads the newest Chrome for Testing
Canary and prints its path, to test against a newer build than the installed one:

```sh
CANVAS_BROWSER_EXECUTABLE="$(node scripts/ci-browser.mjs)" npm run test:browser
```
