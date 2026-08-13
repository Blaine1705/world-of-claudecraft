# GPU hitch capture protocol

`node scripts/gpu_hitch_capture.mjs` records a versioned, raw WebGL timeline for
the shader-linking hitch investigation. The command installs the probe with
`evaluateOnNewDocument` before the application navigates, stores the exact
`linkProgram` and `getProgramParameter` calls, and validates the artifact before
accepting it.

## Capture

The default is a headed Chrome run on the configured real GPU. A headless run is
only a serialization/smoke check and must not be used as performance evidence,
even when `GL_RENDERER` confirms that Chrome used the discrete GPU rather than
SwiftShader. Headless changes the window/compositor path and must never be mixed
with headed legs in one A/B campaign.

For headed evidence, inhibit automatic sleep/DPMS for the complete command and
keep the browser foregrounded. A physical HDMI switch can remove the display's
EDID and reconfigure the desktop/GPU without producing a browser
`visibilitychange`; discard any leg captured across such a switch. An HDMI
dummy plug or switch with EDID emulation is acceptable only if every campaign
leg uses the same stable display configuration.

```sh
node scripts/gpu_hitch_capture.mjs \
  --url 'http://localhost:5173/?perf&gfx=ultra' \
  --profile shader \
  --duration-ms 180000 \
  --out tmp/gpu-hitch/example.json
```

`--mode offline` enters the local game fixture automatically. `--mode manual`
opens the page and waits for the operator to enter the world.
`--mode online-geared` is the controlled local-online boot scenario: it creates
up to 40 disposable bots, gives every bot a deterministic complete authored
appearance (including face/body morphs, hair, eyes, skin and outfit), varied
class equipment and weapon cosmetics, and places the crowd inside the
observer's interest area before the observer enters. It requires a loopback
game server with `ALLOW_DEV_COMMANDS=1` and a loopback `DATABASE_URL`; the
fixture count and SHA-256 are written into the capture.

A dirty worktree is refused unless `--allow-dirty` is supplied; its content
hash is recorded. The tool uses a temporary browser profile and disables the
shader disk cache. Chrome's sub-second initial target-focus handoff is
normalized only while no application or GPU event exists. Any later hidden
transition invalidates the capture.

Profiles are intentionally not interchangeable:

- `shader` (default): links, completion status, active uniforms, active
  attributes, phases, and renderer compile-unit lifecycle;
- `upload`: sparse 100 ms texture-upload buckets;
- `full`: both sets of wrappers.

## Artifact contract

The JSON has schema version `1` and retains the raw `timeline` before deriving
the summary. Query windows are anchored on `query.startMs`; links after the
blocking call returns cannot be attributed to it. Upload attribution reports
`certain` and `possible` bounds because edge buckets are partial.

`capture.durationMs` is the requested measurement window after world entry and
is therefore part of A/B comparability. `capture.totalElapsedMs` preserves the
complete probe span, including variable boot and entry time, for timeline
reconstruction without making equivalent measurement windows incomparable.

`effective` comes from the running application, not from parsing the URL. This
v0.38 experimental branch exposes link-rate pacing at the renderer consumption
seam: `linkrate=0` is the unlimited control and a positive value is the limited
candidate. `linkmode=adaptive` selects the lifecycle controller: it admits
whole compile units against a window measured in observed program links, grows
that window after fast settlements, halves it after slow settlements or
failures, and stops new entry work after a bounded no-progress interval. Its
receipt reports `compile-unit-lifecycle`, the effective window and congestion
counters without inventing a fixed links-per-second value. The static receipt
reports `compile-unit-sync-prologue`; continuations that link later in async
tails are observed but are not completely governed by that static budget.
Modular self/peer
flags remain unavailable, so requesting them fails closed instead of silently
measuring a no-op.

`timeline.compileUnits` is the renderer's application-level lifecycle view on
the same probe-relative monotonic timeline as the WebGL events. Each
record includes submission, synchronous-prologue end, settlement/failure, lane,
and `statusAtReveal` (`settled`, `pending`, `deferred`, or `failed`) sampled
immediately before the loading curtain starts to fade. This is not
an internal driver-pending counter; it is the strongest pending-at-initial-frame
evidence available from the renderer.

`provenance` records the source HEAD, dirty-worktree content hash, served build
ID, probe hash, analyzer hash, worktree name, and dirty state. URLs are reduced
to the allowlisted measurement knobs; credentials, fragments, and arbitrary
query parameters are not written to the artifact.

## Comparison rules

Use `areComparable(left, right, { varying: ['linkrate'] })` for a static sweep,
or `areComparable(left, right, { varying: ['linkmode'] })` for unlimited versus
adaptive. Dynamic adaptive counters are observed results, not comparability
keys. Every campaign capture supplies `--group-id`, `--leg`,
`--repetition`, and `--order` together. The comparator rejects
changes to the source/served build, probe/analyzer/schema, profile, browser
flags/version, shader cache, GL vendor/renderer, viewport/DPR, graphics knob,
scenario, zone, group, or fixture evidence. A rejected leg remains useful as
raw evidence but must not enter an A/B verdict.

Example local-online qualification (load the main checkout's env directly; do
not copy it into the worktree):

```sh
ALLOW_DEV_COMMANDS=1 PORT=8788 \
  node --env-file=/path/to/main/.env dist-server/server.cjs
WOC_DEV_API_TARGET=http://127.0.0.1:8788 \
  pnpm exec vite --port 5199 --strictPort
node --env-file=/path/to/main/.env scripts/gpu_hitch_capture.mjs \
  --url 'http://127.0.0.1:5199/?perf&gfx=ultra&linkrate=0' \
  --server-url http://127.0.0.1:8788 \
  --mode online-geared --bots 20 --profile shader --duration-ms 180000 \
  --group-id linkrate-v38-a1 --leg control --repetition 1 --order 1 \
  --out tmp/gpu-hitch/linkrate-v38-a1-control-r1.json
```

For a decision campaign, alternate control/candidate order across repetitions
and restart the dedicated game server between legs. Keep population, fixture
hash, URL knobs other than the declared varying knob, browser, viewport and capture duration
identical. Production captures are observational only: production cannot
provide a strictly identical crowd and the tool must never create bots or use
dev commands against a non-loopback target.

The raw JSON is the audit record. Keep it, or publish its SHA-256 and a durable
copy alongside the compact summary; a derived summary without the raw timeline
cannot reproduce the attribution windows.
