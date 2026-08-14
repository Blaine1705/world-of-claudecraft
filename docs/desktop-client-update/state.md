# Desktop Client Update: state (cross-phase cheat sheet)

Read this first in every session. Base commit at packet authoring: 6ed4d7e12c on
release/v0.36.0 (historical record; do not re-point). CURRENT BASE since the
2026-08-13 interim reconcile: origin/release/v0.38.0 tip 952c183fc3, merged as
cd03351264. Any file:line anchors in this packet were verified at their era's
base and may drift; re-verify by symbol name before relying on one.

## Current phase

Phase 1 done (2026-08-08, commits fff0a2898e + 18da4ef8cc + docs a8544d6b57), phase 1
QA done (2026-08-08, PASS-WITH-FOLLOWUPS, fixes 042ba0a766 + docs db885d81bb), phase 2
done (2026-08-08, commits 2eb2c45356 menu + 82b040f5a5 show + b6d6a1900e focus
+ 7ed6a6fac4 version + docs 3e9a87b8e2), and phase 2 QA done (2026-08-08,
PASS-WITH-FOLLOWUPS: 0 blocking, one confirmed should-fix cluster, fixed in
97e5305a14: the publish-workflow version guard anchored on the derive expressions and
pinned by tests/desktop_publish_guard.test.ts). Phase 2 QA start merge 094f6facbc took
release tip 4d52f151eb (PR 3161 perf train; no electron/desktop paths; turbo.json
renamed the typecheck task to check:types). The phase 2 review fixes
(privacy-security-review W1/W2/W3 and three nits) are folded into the four feature
commits, not separate; see progress.md notes.

Phase 3 done (2026-08-08, commits 89c5003ddb electron push + 57ca3a7bc3 renderer
notice + 3fd5f7a4c2 review hardening; base merge was a no-op, release tip still
4d52f151eb): the main-process GPU verdict reaches the player through the gpu notice.
Channel 'desktop-gpu-status' (push-only, sent BEFORE the logGpuStatus dedup
early-return so crash-recovery reloads still get it), pure reducer
electron/gpu_status_events.cjs, preload onGpuStatus, optional
DesktopBridge.onGpuStatus, latch module src/game/desktop_gpu_status.ts, dismissal is
now a component signature (legacy '1' = software dismissal), new key
gpuNotice.bodyDiscreteInactive with five M16 fills, perf_nudge integratedGpu arm
suppressed via discreteNoticeShown(). Reviews: security PASS, seam
PASS-WITH-FOLLOWUPS 0 blocking (one SHOULD-FIX deliberately rejected and pinned:
both-armed keeps discreteNoticeShown() true, see progress.md phase 3 notes; QA
should re-litigate). 9/9 mutation probes killed.

Phase 3 QA done (2026-08-08, PASS-WITH-FOLLOWUPS, 0 blocking; QA-start base merge
a6e7fb0a22 took release tip 1478f9d2ba, mobile CSS only; fixes 30d8a4ad1e test
hardening + e1dd4a7798 honesty pass). Five confirmed pin gaps closed (new
tests/desktop_shell_integration.test.ts composition suite; check-time sampling,
live-window guard polarity, renderer whitelist key-set, and dismissal-hidden
display latch all decisively pinned; orchestrator probe round 6/6 killed).
Re-litigation UPHELD the armed-at-render latch with an honesty correction now in
the comments: the perf-nudge discrete suppression it feeds is UNREACHABLE in
production (perf_doctor gates 'integrated-gpu' on !desktopShell while a discrete
verdict only exists in-shell), defense-in-depth, not load-bearing. Both-toasts
overlap measured (gpu-notice discrete body 98px en / 114px ru_RU at the 440px cap
vs a 56px slot offset) but the pair is unreachable today (re-push rides
did-finish-load reloads only); shell.css comment rewritten with the numbers and
the supersede-first rule for any future mid-session push.

Phase 4 done (2026-08-08, commits 87b193e31b hidden render skip, 7ac4d3dbf6
shell pushes, 26d89a3426 review hardening, 051aa455b0 allocation-free gating;
base merge was a no-op, release tip still 1478f9d2ba): a hidden/minimized desktop window stops GL submission, HUD
paint, and perf frame sampling while the sim tick and network drain keep
running (pure core src/game/presentation_gate.ts, DI draw module
src/render/frame_present.ts, present threaded as renderer.sync's 7th arg,
updateAdaptiveResolution held on skipped frames). KEY PLATFORM FACT: with
backgroundThrottling:false the Page Visibility API stays 'visible' while
minimized (Electron documented), so the hidden signal is the new
'desktop-presentation-changed' push DERIVED at send time from
isMinimized/isVisible (minimize/restore/hide/show/focus + did-finish-load
re-push; the event-latched version was a seam-review blocking finding, one
missed restore would freeze a visible window). hud.update(paint) keeps the
audio/live-region/timer head running on hidden frames (the other blocking
finding: the whole-method gate parked cast-loop cleanup a minimized player
still hears). perf_reporter gained shellHidden (its visibilityState check
never fires in the shell, minimized sessions would have beaconed fps
collapses). 'desktop-display-changed' pushes { scaleFactor } only (displayId
stays main-side for dedup, security least-privilege) from app-level
display-metrics-changed + debounced window move; renderer.noteDisplayChanged()
re-resolves the pixel ratio, src/render/dpr_watch.ts is the web fallback.
Reviews: security PASS (both should-fixes adopted); seam 2 blocking + 5
should-fix, all fixed in 26d89a3426 except the declined real-Renderer
governor-hold unit (E2E rig committed instead, phase 5 owns the governor).
Probes 11/11 killed rc=1 named (one killed by the E2E rig, the vitest-blind
threading arm). Evidence in progress.md phase 4 notes (offline + online legs,
snapshots kept arriving while hidden, clean resume). Next up: phase 4 QA
(phase-04-qa.md), fresh session, pull+merge first.

Phase 4 QA done (2026-08-09, verdict PASS-WITH-FOLLOWUPS; QA-start base merge
5f51bdc76d took the moved tip 5819c005a7, 422 files, eight conflicts
hand-reconciled; fixes 4281dc88f4 music, 90cc7f181b backstop, 59e0d7eb1f
presented counter, cd27f7f61a perf silence + F7 gates, ad8131bd48 +
db79708ba9 pins, f436892a06 counter sink + panel, 9c6d6f1f6c re-anchors,
b393f17057 style; tree clean, LOCAL-ONLY intact). The merge absorbed upstream
PR #3153 into a THREE-component gpu-notice model (software, discrete-inactive,
hybrid; one signature dismissal, the v0.36.0 hybrid key read-only as
legacyHybridDismissed; shell wire + three-key whitelist unchanged) and
upstream's revealWorld boot path (shellHidden re-added by hand, now pinned).
Workflow audit (two runs, 34 agents total, continuation off journal.jsonl for
three lost auditors): 30 deduped findings, 12 actionable, ALL CONFIRMED by
both skeptics. Fixed: F1 BLOCKING music state machine below the paint cut
(hoisted to the head, mediumHud band, decision stored for the paint half);
F2 15 s hidden re-derive backstop in sendPresentationState (bounds a
no-event WM un-hide); F4/F9 tests/desktop_presentation_threading.test.ts
(AST-sliced frame() pins incl. the shellHidden line) + renderer
presentedFrames() counted downstream of the sync present argument with
deterministic probe arms; F5 top-level shell-integration ordering pinned;
F6 below-cut spot list refreshed; F7 immobile note / click marker /
spectate badge / ground reticle gated per-half, updateBreathBar deliberately
ungated (client-side breath timer), all pinned; F8 frozen-singleton identity
pins; F10 PerfMonitor frameSampling switch makes hidden frames perf-silent
end to end (web hidden-tab parity; probe asserts sim-sample freeze AND
resume); F11 hiddenPresentSkips overlay line (its one live sink) + beacon
EXCLUSION pin; F12 the ?diagnostics panel restarts its scan on a
hiddenPresentSkips delta (its visibilityState keying never fires in-shell).
F3 (proposal popups freeze below the cut) ADJUDICATED to the ledger and
pinned deliberate: cue/show ride the ungated drain, expiry is
server-authoritative, restore rebuilds from snapshot in one painted frame.
Re-litigations: paint cut re-walked (F1 was its finding; tutorial linger
re-confirmed benign); E2E kill SHARPENED (forced present now dies on three
arms incl. presented-frames on any GPU); governor-hold unit deferral UPHELD
(phase 5 owns that seam). Probes 12/12 fresh vitest mutations killed rc=1
named + the E2E forced-present kill; full probe both legs PASS post-fix.
Gate: full-suite fallback red ONLY on the 8 accepted seal suites (11 tests),
2415 files / 33162 tests green, turbo 5/5 + 3/3, biome pin proven never
committed. PHASE 6 PREMISE from the merge: upstream pinned three@0.165.0
EXACT with patches/three@0.165.0.patch (+ tests/three_compile_async_patch
.test.ts); the train must re-author or drop it. PHASE 5 TOOLING from the
merge: opt-in ?diagnostics panel + renderer_frame_telemetry_core per-phase
timings. Next up: phase 5 (phase-05-governor-low-tier.md), fresh session,
pull+merge first; read the windows-30fps and mobile-thermal memory topics
before touching the governor.

Phase 5 done (2026-08-09, commits ec3a8d8054 style reformat, 5a04133a49 ladder
fix, 4fe929d002 LOW retune + lowPlus gate, 0d24d50e9b dense-scene pin,
9e93468778 dressing fix, 281a0a29ca review hardening, 1fad312836 screenshots;
base merge no-op, tip still 5819c005a7; tree clean, LOCAL-ONLY intact): the
recovery gate is split (canRecover = measured headroom only, gating all
recovery and stableSeconds; canEnrich = the three counter clauses, gating only
the above-baseline climb) and recover() restores every bucket to baseline and
then render scale BEFORE any above-baseline rung; the reproducing test failed
red pre-fix. The phase 4 governor-hold debt is closed (threading-suite pin:
exactly one present-guarded updateAdaptiveResolution call site, polarity
included). LOW DERIVATION RULE: band baseline/max = medium x 0.95 (2 decimals),
band minima and caps floors EQUAL mediums, caps = medium x 0.9 rounded clean,
grassRadius 72; derived axes point lights 6 -> 4 and vfx 1.0 -> 0.76. LOWPLUS
GATE: iosMemoryProfile || (tier low AND classifyGpuRenderer in {weak,
software}); masked adapter = plain low. The dressing richness trio (10/1.24/
1.08, the 1.79x) moved from leanFoliage onto lowPlus with a deep-equality
medium-parity pin. Deliberate + pinned: dense frames no longer reset
stableSeconds (one sub-line frame at a fire slot = one enrich step). Probes
13/13 killed rc != 0 named on committed trees (the M4 survivor was a real gap,
closed by the dense-scene pin). Seam review fresh: 0 blocking, fairness PASS,
4 should-fix all fixed. Perf: LOW 211.4 fps overall vs MEDIUM 78.7 (QA relabel:
the 211.4 row is post-dressing-fix at 281a0a29ca and ran dirty:true, as did the
medium row; the clean post-retune row at 4fe929d002 is 204.3, min 138), p95 and
calls lighter on every scenario in both low rows, tris lighter on the three
field scenarios; town tris (LOW 4.53M vs 3.55M) attributed STRUCTURAL and
QA-verified (farFieldPolicy denies sprites+vista to plain low, so real geometry
draws to CLASSIC_CAMERA_FAR 950 while medium's detail ends at the vista horizon
near 640 yards), owned by the upstream player-performance Packet 5 audit.
Evidence: docs/perf/baseline/history.jsonl + phase notes; screenshots
docs/screenshots/desktop-client-update-phase5-low/. Gate: full-suite fallback
red only on the 8 seal suites / 11 tests, turbo proofs 5/5 + 3/3, biome pin
proven never committed.

Phase 5 QA done (2026-08-09, verdict PASS-WITH-FOLLOWUPS, 0 blocking in the
shipped code; QA-start base merge 2c3ca8eaab took release tip 6e1ead1fea, 8
upstream perf(render) commits, clean, phase suites re-ran green pre-audit).
Two workflows (the first lost 12 agents to a session-limit window; the
continuation re-ran every lost auditor FRESH off journal.jsonl, 16/16). All
actionable findings CONFIRMED by two skeptics each (10/10 votes). Probe round
run orchestrator-side after a dead duplicate agent left staged pre-fix
checkouts (restored; the one BLOCKING was that operational incident): 16
probes, P1/P3-P13 killed; three survivors became fixes, each re-probed KILLED:
per-clause canEnrich arms (the dense-scene arm masked single-clause drops),
the dressing spot-count ratio band 1.5-1.7 (deterministic 1.586; dropped scale
lands 1.44), and the low-tier climb-to-maxima arm (high maxima are 1.0 so only
low can bind phase B ceilings). P15 confirmed the enumerated sweep was blind
to the resolution row (only the byte hash redded); the sweep now derives from
the band table keys with key-set equality, the render-scale floors sweep, the
foliage minRadiusScale source binding, and low caps literal pins. Two
long-horizon frame-cap pins freeze the split's capped semantics both
directions. New guard: tests/vfx_mote_floor.test.ts pins every tier's vfx
floor above the exported MOTE_QUALITY_GATE (0.5). Re-litigations UPHELD both
pinned decisions; the enrich rate-bound comment was corrected (the cooldown
never binds; the recharge is the bound). Pre-fix repro re-verified first-hand
(3/3 arms red at 5a04133a49~1 with resolution pinned at 0.7; import error
ruled out). Stopping-rule items surfaced, deliberately unpatched, all
pre-existing: the band-straddle enrich-degrade limit cycle, the
misclassified-cap resolution sawtooth (phase 5 shortens its path: capped
sessions in the 90-100% band now restore baselines and resolution where they
previously restored nothing), and the write-only renderer.adaptiveGrace.
Records: GFX.characters is consumer-dead (floor pin is dormant),
worldStreaming's governable:true label is wrong but inert, iOS opt-up sessions
gained the dressing trio via the iosMemoryProfile arm (recorded consequence),
commit 9e93468778's town-inversion attribution is falsified by the phase's own
bench (the ledger's structural attribution stands). Gate: full-suite fallback
red only on the 8 accepted seal suites, post-abort turbo proofs green, biome
pin never committed (see the phase 5 QA note in progress.md). Next up: phase 6
(phase-06-three-upgrade.md), fresh session, pull+merge first; phase 6 freezes
its perf baseline AFTER this QA and must re-author or drop
patches/three@0.165.0.patch.

Phase 6 done (2026-08-09, the three.js 0.185 train; commits: 4 baseline data +
4e124fb4b7 deps bump + patch re-author, a0e61e2683 post chain, 1f5b8b0ee0
types churn, 6f53f72879 frozen-camera matrix gate, ff8e667db6 Clock to Timer,
0bb6273b51 prewarm vertexNormals bit, f3c9a8fdd5 sky comment + gizmo helper,
daa963da45 transcoder regen + ktx2 cache keys, 018ed52dd3 info-reset sweep,
39490b4c49 vColor.rgb emissive fix, e092f26e3a + the re-freeze fix review
hardening, 5 post-upgrade perf rows; QA-start merge 519f1c328d took tip
f53e5a37d1). three 0.185.1 + postprocessing 6.39.4 (peer-only) + n8ao 2.0.0 +
@types/three 0.185.4; the compileAsync guard is RE-AUTHORED as
patches/three@0.185.1.patch (upstream r185 still unguarded). Migration walk:
31-agent workflow audit (per-item + 3 chunk-anchor groups + adversarial
skeptics on every no-hit, zero losses); 92 chunk anchors all ok; 8 items
confirmed no-hit; the big fixes were the r185 matrix gate (frozen camera
refresh helper refreshFrozenWorldMatrix + flag-preserving re-freeze bake in
static_matrix.ts), the restored r165-shaped bloom composite behind
OutputGradePass's bloom.rgb * bloom.a contract, the n8ao 2.0.0 anchor drop,
the transcoder patcher re-author (r185 Emscripten shapes, ships paired wasm),
the ktx2 'file:' cache-key fix, and the shader-smoke-caught vColor vec4 break
(r185 declares vColor vec4 under plain USE_COLOR). Shader smoke clean at low
and ultra with checkShaderErrors ON. Seam review PASS-WITH-FOLLOWUPS, 0
blocking, all but one follow-up landed (ledger: hidden-view gate cost
inversion mitigation). Perf after (informational): medium/high/ultra FASTER
everywhere; LOW reproducibly splits (town/east +24-28 percent, open-run
-22.6, combat-vfx -17.5) with the r185 traversal-skip removal as the working
hypothesis, handed to phase 6 QA with the r181 lighting decision
(before/after pairs in tmp/perf-parity/, low at noise floor, composer tiers
show the shift). Baselines + after rows in docs/perf/baseline/history.jsonl,
all dirty:false via commit-per-run. Next up: phase 6 QA (phase-06-qa.md),
fresh session, pull+merge first; the r181 acceptance and the low-tier
open-run/combat regression are the two user-facing decisions.

Phase 6 QA done (2026-08-09/10, verdict PASS-WITH-FOLLOWUPS carrying TWO USER
DECISIONS; QA-start merge 215d4ac8c2 took release tip 7ce12bad9e, 1096 files,
five conflicts hand-reconciled incl. the raw-context KTX2 probe ported to r185
semantics with astcHDR + the Linux Mesa filter; fixes 0f7d484b2c comment-truth
sweep, d94a8832b7 bloom + matrix-walk pins, 0d580aadef one-arm/vacuity arms,
11bf88933b night-light GLSL rename, 42d7b6f4b8 drawStats context-restore
rebind, plus a style commit; tree clean, LOCAL-ONLY intact). Perf gate on
fresh medians vs the frozen pre-upgrade baselines: medium green everywhere;
high/ultra green on every field scenario with the town reds attributed
MERGE-OWNED (upstream f53e5a37d1..7ce12bad9e regressed town-idle across tiers,
scaling composer-tier-ward to -24/-25 percent vs the post-train pre-merge
rows; the train itself made high/ultra FASTER everywhere); LOW open-run -18.8
and combat-vfx -7.3 percent remain train-owned (upstream wins bought back
combat from -18/-33). Attribution probe: the r185 matrix walk measures 0.43 ms
(4-6 percent of a low frame) and detaching every hidden gated rig recovers at
most ~4 percent, so the ledgered hidden-view mitigation CANNOT close the gap
(not landed); the balance sits in the moving/streaming path; per the stopping
rules the low delta is a hold-or-accept USER decision (note: low open-run 1
percent lows improved +106 percent). The r181 lighting acceptance is the other
USER decision, with frozen-phase real-GPU pairs (the day-night clock is
UTC-anchored, which also explains the parity moon as capture-time drift) in
tmp/r181-showcase-frozen/. Audit workflow 52 agents zero losses: four
re-litigations all UPHOLD, hit-list 13/15 MATCH (2 record-only discrepancies),
92/29 anchors reconcile, 20 actionable findings -> 17 confirmed / 2 resolved
splits / 1 killed, all fixed except the user decisions. Probe round 12/12
killed rc!=0 with named tests. Shader smoke clean at low and ultra. Crowd
decay flat (solo 28.3 to crowd-50 29.8; first reference on this branch).

INTERIM RECONCILE done 2026-08-13 (base -> origin/release/v0.38.0 tip
952c183fc3, merge cd03351264 + fix a43e7f46e2; 2375 files, 8 conflicts
hand-reconciled; census workflow 38 agents zero losses, 16 consequential
claims all skeptic-verified; see the progress.md reconciliation record for
the full delta census and the conflict ledger). Headlines: electron/ and the
whole phase 1-4 shell surface were untouched upstream; the phase 5 governor
files and LOW derivation survived byte-level (gfx hash pins passed unmoved);
upstream's bounded compileAsync poll was ported into patches/three@0.185.1
.patch (both arms now carry the disposal guard, zero semantic delta); the
gate's biome recipe changed (see gotchas); the seal family is 9 files / 14
tests (see gotchas); phase 7-11 files re-verified and edited against the
merged tree. Next up: phase 7 (phase-07-prefs-window-memory.md), fresh
session, latest-release merge first per standing rule 3; carry the two open
user decisions (low hold-or-accept, r181 acceptance) and the merge-owned
town-idle regression into that conversation.

Phase 7 done (2026-08-13, commits: base merge 1ca227a9aa of release tip
172ed59d01 (test-lane-only, parity green after), 92c79dc112 store modules,
a7fd017f41 window memory, f9e26c1125 gpu opt-out setting, 4f656661bd store
file-shape hardening, 3576bd9b53 sync-module write crossing, plus this docs
commit): the shell's first disk persistence. The prefs store
(electron/desktop_prefs.cjs, desktop-prefs.json under userData) and the pure
restore resolver (electron/window_memory.cjs) land as DI modules; main.cjs
reads the store as its FIRST statement (orchestrator probe: userData is
resolvable pre-ready, ~136 microseconds, both stopping rules cleared),
restores geometry inside the BrowserWindow constructor (no default-size
flash, maximize while hidden), saves on debounced resize/move plus a
synchronous close capture, and skips BOTH gpu levers when the stored opt-out
is strictly true (corrupt or missing store fail-safe = force ON). The
forceHighPerfGpu row (def true, the INVERSE of the stored opt-out) follows
the full options doctrine behind a bridge-capability gate with dual-armed
pins; the boot reflection constructs its Settings only after the bridge read
resolves and pushDesktopGpuPref owns the write-crossing inversion (both
review rounds' should-fixes, all landed same-phase). Five-run real-shell
smoke green (save/restore exact, fallback centered, opt-out skips logged,
corrupt store clean). Reviews 0 blocking. Gate: full fallback red exactly
the accepted set (9 seals / 14 + monolith 2), 37782 passed; turbo proofs
5/5 + 3/3; browser leg standalone 19 files / 125 green. Ledger for phase 7
QA in the progress.md record (reset re-arm, unreachable-toggle copy,
graphics-tab pointer, 16384 ceiling, no jsdom web-absence render). Next up:
phase 7 QA (phase-07-qa.md), fresh session, latest-release merge first per
standing rule 3; the two open user decisions (low hold-or-accept, r181
acceptance) still ride along.

Phase 9 done (2026-08-14, commits 84fe7cae86 channel + dd235dfdeb renderer +
175a414a7f link + docs; base merge 105306e494 of tip e56010cec1, 7 conflicts
reconciled incl. the upstream notReadyThisPass dedupe ported into
patches/three@0.185.1.patch, parity 336/336 after). OS notifications for
update-ready and party invites: desktop-show-notification invoke channel
(trust gate, kind whitelist, clampText 120/240, live+unfocused mirror,
isSupported, notify_guard 10s-per-kind stamping only on real shows, click =
focusMainWindow), renderer decision core src/game/desktop_notifications.ts
(hud pid gate mirrored on real SimEvent narrowing, transition-into-ready once
per version, away = presentation latch hidden || !document.hasFocus()),
what's-new plain-anchor link on the ready card to GITHUB_RELEASES_URL (now in
news_feed.ts), label 'See what changed in your browser', 5 new keys + M16
fills. Reviews 0 blocking both (security + seam), all should-fixes landed or
adjudicated (ledger in progress.md). Smoke 6/6 on the real shell. Gate red =
the accepted set (now 8 seals/11 + monolith 2; mob_portrait healed upstream),
38507 passed, turbo 5/5+3/3, browser leg 19/129. Next: phase 9 QA
(phase-09-qa.md), fresh session, pull+merge first; the two open user
decisions (low hold-or-accept, r181) still ride.

Phase 9 QA done (2026-08-14, verdict PASS-WITH-FOLLOWUPS, 0 blocking; full
record in progress.md). QA-start absorb f79feed36f of tip 54a729294d (PR
3394 gate-select platform split only), parity 336/336 after. Workflow audit
17 agents zero losses: 6 actionable findings, 6/6 double-confirmed, all
fixed in six commits (b99ba01bf5 flattener widened to LS/PS + margin
classes incl. tag characters, astral-safe clampText; 51a62198b0
escapeNotificationMarkup entity-escape on linux + preload pre-caps 512/1024
+ pin hardening incl. notification.show() and the slice-terminator guard;
7a1870fa07 spectator gate on the online notify site; 9a9beb8381 coverage
arms + comment honesty; acad2656b0 ja_JP invitee fill; 094cd88a46 trailing
lone-surrogate strip on the unclamped path + entity-smuggling pins). Both
relitigations UPHOLD (away-gate ordering constant-true, now pinned at the
fold; plain-anchor hop, setWindowOpenHandler deny + openExternal verified).
Fresh qa-checklist READY 0 blocking; fresh privacy-security-review over the
QA commits 0 blocking (its one LOW closed by 094cd88a46). Probes 23/23
killed rc!=0 named. Smoke 7/7 incl. the new markup arm (real OS toast
arrived entity-escaped, LS flattened). Gate red reconciles exactly to the
accepted set (8 seals/11 + monolith 2) plus three contention flakes proven
green standalone (parity/coverage_c druid_engines, chronomancy_balance_
targets, item_art_audit_builder); an upstream-owned cosmetic "pathspec
src/ui/i18n.resolved.sha256" git line at the vitest abort point is noted in
progress.md. The notification caps are now genuinely both-sides: preload
512/1024 transport caps, main 120/240 authority. main.ts 11458/11490 (32
lines headroom for phase 10). Next: phase 10 (phase-10-discord-presence.md),
fresh session, pull+merge first; the two open user decisions (low
hold-or-accept, r181) still ride.

## Standing rules (user-locked, 2026-08-08, non-negotiable)

1. ALL work happens in the worktree /home/fernandoramirez/Documents/woc-desktop-client-update
   on branch feature/desktop-client-update. Multiple Claude sessions run on this machine:
   always use `git -C /home/fernandoramirez/Documents/woc-desktop-client-update` and verify
   with `status --porcelain` before and after committing. Never touch the main checkout at
   ~/Documents/world-of-claudecraft.
2. LOCAL-ONLY: never push, never open a PR, until the user explicitly says the whole
   packet is done. No exceptions per phase.
3. Every phase starts by rebasing onto the LATEST release/* branch, DISCOVERED FRESH
   each session, never a hardcoded name (user rule, 2026-08-13): run
   `git -C <worktree> ls-remote --heads origin 'release/*'`, take the highest version
   number (currently release/v0.38.0), then
   `git -C <worktree> fetch origin <that-branch>` and
   `git -C <worktree> merge origin/<that-branch>`. Before merging, ancestry-guard it:
   `git merge-base --is-ancestor <current-base-sha> origin/<that-branch>` must hold, or
   stop and surface (a release cut that dropped our base). After any non-trivial base
   merge, re-run the phase-relevant suites before building on top (hot release branches
   have produced semantically wrong auto-merges before; do not trust a clean textual
   merge). A literal branch name anywhere in these docs is a snapshot, not the rule.
4. Phases interleave QA: phase N, then phase N QA, then phase N+1. Do not start N+1
   before N QA passes.

## Locked design decisions

- Stay on Electron. No Tauri, no CEF, no native rewrite.
- three.js goes 0.165.0 to 0.185.1 on WebGL2. NO WebGPU anywhere in this packet
  (follow-up branch later). postprocessing 6.39.4 and n8ao 2.0.0 move in the same phase.
- Dependency upgrades are CLIENT STACK ONLY: electron, electron-builder, three,
  postprocessing, n8ao, @types/three. Nothing else moves (no vite/vitest/ws/pg/
  capacitor/svelte churn). electron-updater 6.8.9 and electron-log 5.4.4 are already
  current and stay.
- Electron pin: 43.3.0 floor now; Electron 44 (stable ~2026-08-25) is explicitly out of
  scope, soaked on its own branch later.
- Steam overlay is a documented NON-GOAL (needs in-process-gpu plus relaxed isolation;
  rejected). steamworks.js stays main-process-only for account linking, as today.
- Discord Rich Presence ships as an IN-HOUSE ~150-line IPC client (main process, local
  named pipe/socket only, zero new dependencies). The vendored-library route
  (@xhayper/discord-rpc) was evaluated and rejected: it drags @discordjs/rest and undici
  into an audited bundle. See brainstorm.md section 6.
- Update-toast "what's new" is a t()-keyed LINK, not feed-supplied release-notes text
  (feed text cannot satisfy the i18n contract). The feed releaseNotes approach is
  rejected, do not revisit. TARGET AMENDED by the 2026-08-13 census: no /wiki
  changelog page exists on the merged tree, so "the wiki changelog" cannot be the
  target as written; phase 9 starts with a target decision among (a) the existing
  GitHub-releases News & Updates surface (GITHUB_RELEASES_URL, src/ui/
  charselect_news.ts, most consistent with the live release-notes pipeline), (b) the
  in-client news feed (src/ui/news_feed.ts via the /api/releases proxy), or (c) a new
  changelog guide page (duplicates the existing pipeline); a bare /wiki-root link is
  the weakest choice. The link-not-feed-text doctrine is unchanged. DECIDED
  2026-08-14 (user, AskUserQuestion at phase 9 start): option (a), the GitHub
  releases page. GITHUB_RELEASES_URL now lives in src/ui/news_feed.ts and the
  ready card links it through a plain external anchor (adjudication recorded in
  desktop_update_toast.ts and progress.md phase 9).
- OS notifications are assembled and t()-rendered in the RENDERER, pushed to main as
  final strings over a validated, capped, rate-limited channel. Main stays
  language-agnostic (same doctrine as the crash-dialog strings).
- Hidden-window render skip: while document.hidden on desktop, skip renderer.render and
  HUD paint but KEEP the loop, sim tick, and network drain running (skipping the drain
  would rebuild the WS-backlog freeze documented in the July investigation).
- Governor scope: the frame-cap trap core is ALREADY FIXED (commit 6ad39476f2). This
  packet fixes (a) the recovery-ladder stall that leaves render scale degraded and
  (b) the LOW-heavier-than-MEDIUM inversion, keeping lowPlus art direction only for the
  weak-integrated-GPU cohort. The shader-compile-gate and WS-recovery-tail workstreams
  from issue #2243 are OUT of this packet (tracked follow-ups).

## OPEN items (need a human / credential / empirical answer)

- Discord application registration (Application ID + art assets in the Discord developer
  portal): maintainer infrastructure. Phase 10 can build and unit-test everything with a
  placeholder id; the live probe needs a real id.
- Discord approval-gate ambiguity: official pages conflict on whether SET_ACTIVITY works
  for unapproved application ids. Phase 10 step 1 probes empirically BEFORE any player
  facing copy promises presence.
- Rich Presence default state (recommend default ON with an options toggle; presence is
  additionally gated by Discord's own activity-sharing setting): confirm with user at
  Phase 10 start.
- r181 lighting shift (PBR energy conservation): expect a global brightness change after
  the three upgrade. Phase 6 QA captures before/after screenshots; user accepts or the
  phase compensates. This is a judgment call, surface it, do not silently absorb it.

## Validation matrix by change type

- electron shell (.cjs): `npx vitest run tests/electron_*.test.ts tests/desktop_*.test.ts`
  (the .cjs files are outside tsc; the tests scan them as text and exercise the pure
  modules directly). Pack smoke where the phase says so: `npm run electron:pack`.
- game/ui client code: `npx tsc --noEmit` plus the affected vitest files; add
  `npx vitest run tests/localization_fixes.test.ts` whenever player text changed.
- render: `npx tsc --noEmit`, `npx vitest run tests/gfx.test.ts tests/render_budget.test.ts`
  plus the phase-named suites; perf evidence via `npm run perf:baseline` where the phase
  says so.
- settings/options: `npx vitest run tests/settings.test.ts tests/options_view.test.ts`.
- any code change: `npm run ci:changed` (Biome on changed files only; fix format with a
  SCOPED `npx @biomejs/biome check --write <file>`, never whole-tree).
- phase completion: `node scripts/gate_select.mjs` (the selective pre-merge gate).
  Known unrelated flakes under core contention: dungeon_finder decline tests; a rerun of
  the single file is the arbiter. One known environmental browser-test failure exists on
  this machine (Node/jsdom); it aborts the full gate before tsc+builds, so treat PR CI
  as the final arbiter and do not chase it locally.

## Key repo recipes (verified at base, full detail in brainstorm.md)

- New boolean display setting (the options doctrine, from the playtime PR): declare in
  BOOL_SETTINGS (src/game/settings.ts); one boolToggle row in buildInterfaceControls
  (src/ui/options_view.ts); an applySetting arm in src/main.ts that OWNS the single
  settings.set write path (cold windows need an explicit repaint call); English key in
  src/ui/i18n.catalog/hud_chrome.ts under options; wordy values need the five non-Latin
  fills (M16) in the same change; pins: the ordered GENERAL_KEYS list in
  tests/options_view.test.ts, default+persistence in tests/settings.test.ts, and the
  consuming window's test. options_window.ts itself needs zero changes.
- New shell-visible string for MAIN (crash-dialog pattern): English key in
  src/ui/i18n.catalog/shell.ts under desktop; add to desktopShellStringsPayload
  (src/game/desktop_shell_strings.ts); mirror byte-identical English in
  DEFAULT_SHELL_STRINGS (electron/shell_strings.cjs), which IS the allowlist;
  tests/desktop_shell_strings.test.ts pins exact key-set equality and value-for-value
  English parity.
- New wocDesktop bridge method: add to preload.cjs inside the one exposeInMainWorld with
  the house guards (type-guard inputs; subscriptions return a no-op unsubscribe for
  non-function callbacks and shape-check payloads); OPTIONAL member on DesktopBridge in
  src/runtime.ts (older shells must keep working; consumers feature-check); handler in
  main.cjs gated by trustedSender within the first 200 chars of the callback body; update
  tests/electron_ipc_channels.test.ts (invoke-channel list, the EXACT pinned push-channel
  array for new webContents.send channels, and the 17-method preload name list).
- New electron pure module: <name>.cjs plus <name>.d.cts sibling, imports no electron,
  dependency-injected, Node-tested directly (templates: desktop_config.cjs,
  shell_strings.cjs, gpu_preference.cjs).
- Electron-side persistence is GREENFIELD: nothing in electron/ writes to disk today.
  Phase 7 creates the first store (userData JSON, atomic write, corrupt-tolerant).

## Inventory (append as phases land)

New files created: tests/electron_scheme_privileges.test.ts (phase 1),
tests/electron_shell_startup.test.ts (phase 2),
tests/desktop_publish_guard.test.ts (phase 2 QA),
electron/gpu_status_events.cjs + .d.cts, src/game/desktop_gpu_status.ts,
tests/electron_gpu_status_events.test.ts, tests/electron_gpu_push.test.ts,
tests/desktop_gpu_status.test.ts, tests/gpu_notice_toast.test.ts (phase 3),
tests/desktop_shell_integration.test.ts (phase 3 QA; also hardened in that QA:
the electron_gpu_push live-window guard pin is now the whole guarded statement
with polarity plus a send-count-of-one, the desktop_gpu_status normalizer is
pinned to the literal three-key whitelist, the display latch is pinned empty
under a persisted dismissal, and the perf_nudge memo tests flip their predicate
after init so init-time sampling reds)
Phase 4 additions: src/game/presentation_gate.ts (pure gate, UI_PURE_CORES) +
tests/presentation_gate.test.ts, src/game/desktop_presentation.ts (shell hidden
latch) + tests/desktop_presentation.test.ts, src/game/desktop_display_change.ts
(display-change consumer with setDisplayChangeTarget) +
tests/desktop_display_change.test.ts, src/render/frame_present.ts (DI terminal
draw, RENDER_PURE_CORES) + tests/frame_present.test.ts, src/render/dpr_watch.ts
(matchMedia DPR re-arm, deliberately NOT a registered core, it reads window) +
tests/dpr_watch.test.ts, electron/presentation_events.cjs + display_events.cjs
(+ .d.cts each) + their two events test files, tests/electron_presentation_push
.test.ts + tests/electron_display_push.test.ts (whole-body toBe pins,
send-count-of-one, push-only negatives in BOTH directions including
ipcRenderer.send/ipcMain.on), scripts/desktop_hidden_skip_probe.mjs (the E2E
evidence rig, also the kill for the vitest-blind main.ts threading arm).
hud.update grew a paint parameter (default true; the hidden path calls
update(false) untimed) with the cut pinned by an exact head list in
tests/hud_update_drive.test.ts. PerfSnapshot grew hiddenPresentSkips;
PerfReporterOptions grew shellHidden. renderer.sync grew present (7th arg);
Renderer grew noteDisplayChanged().
Phase 4 QA additions: tests/desktop_presentation_threading.test.ts (AST-sliced
frame() source pins: gate derive/eval, no-tick return, sampling switch, both
sync present args, both hud.update(false) sites, F7 helper gates, gated
perf.tick + unconditional breadcrumb, the startPerfReporter shellHidden slice,
the top-level shell-integration statement). Renderer grew presentedFrames()
(counts presentFrame true returns at the one call site; the probe's
deterministic forced-present kill). PerfMonitor grew setFrameSampling
(hidden frames record no bucket/trace sample) and the overlay 'hidden skips'
line. electron/main.cjs grew HIDDEN_REDERIVE_INTERVAL_MS (15 s) +
hiddenRederiveTimer (armed only while the derived reading is hidden, cleared
on visible and on closed). PerfDiagnosticsPanel restarts a collecting scan on
a hiddenPresentSkips delta. hud.update's head gained the mediumHud
instanceMusic.update (decision stored in lastMusicDecision for the paint
half). The gpu-notice model is now three components (see the QA block above);
GpuNoticeVerdict gained hybridGpuLikely, mergeShellGpuVerdict gained
localHybridGpuLikely, initGpuNotice gained hybridGpuLikely + desktopPlatform,
resolveGpuNotice gained legacyHybridDismissed, gpuNoticeBodyKey takes an
object input, and LEGACY_HYBRID_DISMISSED_KEY is read-only compat.
Phase 5 additions: tests/render_budget_recovery.test.ts (repro, phase A
ordering, dense-scene counter-independence, one-dip enrich; HIGH tier by
design), tests/gfx_low_monotonicity.test.ts (per-axis low vs medium pins over
the live tables incl. the non-governable sweep and the caps-floor/band-min
mirror), tests/foliage_dressing_profile.test.ts (medium-parity deep equality +
lowPlus cohort split). recover() gained the allowAboveBaseline parameter and
canEnrich sits beside canRecover in render_budget.ts. gfx.ts: lowPlus is
classifier-gated, low bands/caps/radius retuned, characters floor 0.86.
foliage.ts: dressing trio keyed on GFX.lowPlus, new export
foliageDressingInternalsForTest { generateDressing, dressStep }. The governor
hold pin lives in tests/desktop_presentation_threading.test.ts (phase 4 QA F6
describe). Screenshots under docs/screenshots/desktop-client-update-phase5-low/.
tests/gfx_override_core.test.ts low hash re-minted twice (retune, then the
characters floor); scripts/lib/perf_attrib_plan.mjs + its test moved to
grassRadius:72.
Phase 5 QA additions: tests/vfx_mote_floor.test.ts (gate constant + per-tier
band-min and governor-floor clearance) and the MOTE_QUALITY_GATE export on
src/render/ability_vfx/fx.ts; tests/render_budget_recovery.test.ts grew the
three per-clause enrich arms and the two low-tier arms (dense-scene at low,
climb-to-the-low-maxima; the maxima literals are what bind the phase B
ceilings); tests/render_budget.test.ts grew the two long-horizon frame-cap
pins (dense-in-band vs sparse); tests/gfx_low_monotonicity.test.ts now derives
its non-governable sweep from the band table keys (resolution row included),
pins low-vs-medium key-set equality, sweeps the render-scale floors, binds its
foliage minRadiusScale copies with a counted source pin, and pins the low caps
as literals; tests/foliage_dressing_profile.test.ts pins the weak-to-plain
spot-count ratio band 1.5-1.7.
New bridge methods / IPC channels: 'desktop-gpu-status' push channel (main -> renderer,
no ipcMain.handle) + optional DesktopBridge.onGpuStatus (phase 3); payload
{ softwareRendering, discreteInactive, adapter<=64 } whitelisted in
electron/gpu_status_events.cjs and re-validated by normalizeDesktopGpuStatus;
'desktop-presentation-changed' push (payload { hidden }, derived at send time
from isMinimized/isVisible, triggers minimize/restore/hide/show/focus +
did-finish-load re-push) + optional onPresentationChanged, and
'desktop-display-changed' push (wire payload { scaleFactor } ONLY, displayId
never crosses, main-side dedup via shouldForwardDisplayChange; triggers
app-level display-metrics-changed + 250 ms debounced window move) + optional
onDisplayChanged (phase 4)
New settings keys: (through phase 6: none; phase 7 added forceHighPerfGpu,
see the phase 7 block below; the gpu notice dismissal localStorage value
woc_gpu_notice_dismissed grew from '1' to a component signature in phase 3, legacy
'1' still honored)
New i18n keys: gpuNotice.bodyDiscreteInactive (en + zh_CN/zh_TW/ja_JP/ko_KR/ru_RU
fills; 15 locales pending for the release fill pass, phase 3 QA corrected the
original "16" miscount) (phase 3)
New tests: tests/electron_scheme_privileges.test.ts, the app:// scheme privileges pin
(app-entry-anchored, block/line/trailing-comment-stripped, per-key explicit-true as
whole-line values, exact key-set equality with a quoted-key-aware scanner as the
deny-list, single-entry pin inside the call, single-registration count pin, and
top-level-before-app.whenReady position pins). Mutation-verified on eleven dimensions
in phase 1 QA: drop, flip-false, line-comment, extra privilege, block-comment,
second scheme entry, non-top-level call, ready-ordering decoy, quoted key,
value expression, trailing comment (harness: the phase 1 QA notes in progress.md).
Phase 2 additions: tests/electron_shell_startup.test.ts pins the shell startup wiring
in electron/main.cjs as comment-stripped text (hidden create with show:false plus the
dark backgroundColor, one ready-to-show registration that clears the fallback and
shows, the captured-instance show helper, the top-level READY_TO_SHOW_FALLBACK_MS 4000
constant feeding the setTimeout, timer cleared on ready-to-show and closed,
second-instance focus POSITIONED before the deep-link scan, focusMainWindow defined
once with an exact call-site count of five (login, wallet, second-instance, activate,
plus the definition), the win32/linux-allowlist Menu.setApplicationMenu(null) guard
before app.whenReady() with darwin never named, and zero setMenu(null) occurrences).
Mutation-probed by the implementer 12/12 killed pre-commit; phase 2 QA re-verified on
the committed tree: 12/13 killed with named failing tests, and the one survivor
(hardcode to the CURRENT version value, survived-by-design at the time) has been
killed since 97e5305a14 by the guard test below. VERSION MECHANISM (phase 2):
src/game/desktop_download.ts derives DESKTOP_VERSION from the __APP_VERSION__ vite
define (typeof-guarded, '0.0.0' fallback for the define-less standalone browser
config; the define IS applied under normal vitest, probe-verified).
scripts/release_version.mjs no longer owns the module (html hrefs + game-version +
README badges remain its surfaces); .github/workflows/desktop-publish.yml's verify
job greps for the derive mechanism instead of a version literal, anchored since
97e5305a14 on the load-bearing expressions (phase 2 QA proved the original
bare-token greps were satisfiable by the token in a comment or the type-only
declare); tests/desktop_publish_guard.test.ts extracts the workflow's exact patterns
and executes them through grep both ways (must match the live tree, must reject a
mechanism-dead revert fixture), so neither a module hardcode nor a weakened guard
can pass vitest; tests/desktop_download.test.ts pins module version == package.json
read fresh from disk and != '0.0.0'; tests/desktop_download_dom.test.ts cross-checks
every real index.html/play.html platform href against the module and pins play.html's
deliberate no-Linux exemption. Deferred (review nit I4): a build-output check that
dist never ships the '0.0.0' fallback; fold into phase 11 (phase 2 QA note: a
dist-based version assertion can subsume both I4 and download-page staleness).
Dependency moves: electron 43.1.1 to 43.3.0 and the electron-builder family
(electron-builder, app-builder-lib, dmg-builder, electron-builder-squirrel-windows)
26.15.6 to 26.15.7, via pnpm add -D, devDependencies only; vendor bundles
(electron-log/main, electron-updater) byte-identical across the bump (phase 1).
Vendor bundle sha256 baselines (recorded by phase 1 QA; regen-stability verified,
rebuild reproduced identical bytes): electron_log_main.cjs
784caa8281339772203a5881f442bbf4199163d6ef0914fc5d26eca8e3a967bd, electron_updater.cjs
0605218d342a1c1b219677cebf64c848a1b55ff5d865daf8c71b70395c83287f.
Phase 6 additions: patches/three@0.185.1.patch (re-authored compileAsync
guard; the r165 patch file is deleted), src/render/static_matrix.ts grew
refreshFrozenWorldMatrix plus a flag-preserving freezeStaticMatrices bake,
src/render/post_bloom_shader_core.ts is now restoreClassicBloomComposite
(fail-closed r182+ main() rewrite to the r165-equivalent tint-free body),
ProgramContentMeshShape grew hasNormals (r185 vertexNormals program bit),
scripts/patch_basis_transcoder.mjs re-authored for the r185 Emscripten
embind shapes and now copies the paired wasm, scripts/lib/ktx2_entry.js
pre-seeds THREE.Cache under the 'file:' namespace, and the three preview
loops plus fit_studio use THREE.Timer. New tests:
tests/ktx2_cache_preseed.test.ts; extended: static_matrix (r185 gate pins,
re-freeze arm), post_bloom_shader_core (r185 fixture flip, r165-equivalence
pin, _fsQuad handle pin), post_n8ao (reversed-depth premise pins),
post_output_grade (tonemapping chunk-name cross-check), gfx (direct-profile
no-shadows invariant), prewarm_program_key_contract (r185 surface re-pin),
prewarm_policy (hasNormals arm), scene_census_core (r185 ordering fake +
source pin), basis_transcoder_csp (two-site shapes), eastbrook pins
(vColor.rgb). tests/three_compile_async_patch.test.ts wording moved off
r165.
Phase 6 QA additions: tests/ktx2_support.test.ts astcHDR-profile arms, Mesa
filter both-polarity + per-conjunct arms; tests/gfx.test.ts no-shadows pin
over the full hint grid (floor 13); tests/texture_upload.test.ts stale-range
arm + consumer-honest premise comment; tests/post_bloom_shader_core.test.ts
lerpBloomFactor body pin, bloomFactors weights pin, executed _fsQuad render
smoke; tests/static_matrix.test.ts streamed-under-frozen premise arm (r185
unconditional recursion, the water gap-sheet placer);
tests/three_streaming_buffers.test.ts elements-based assertions;
tests/draw_stats_core.test.ts context-restore rebind pins + the three
info-replacement premise pin; tests/vfx.test.ts restore-handler ordering pin;
tests/night_light_field.test.ts canonical-helper pin. renderer.ts:
onWebGLContextRestored rebinds drawStats; night_light_field.ts uses
transformDirectionByInverseViewMatrix. Showcase evidence (gitignored):
tmp/r181-showcase-frozen/ (frozen-phase pairs, the decision set),
tmp/r181-showcase/ (unfrozen full-location sets), tmp/perf-parity/ (phase 6
swiftshader mechanical pairs). Attribution + probe artifacts in the session
scratchpad (low-attrib.json, probe-results.json, crowd-phase6qa.json).
Interim reconcile additions (2026-08-13): merge cd03351264 (origin/release/
v0.38.0, 2375 files); patches/three@0.185.1.patch re-authored to carry
upstream 37c373cdd0's bounded round-robin isReady poll pass (2 ms budget,
10..320 ms backoff, cheap-queries-only reset) on top of the disposal guard,
pinned by the merged tests/three_compile_async_patch.test.ts (7 tests);
src/render/types/three_keyframe_track.d.ts (module augmentation restoring
KeyframeTrack.createInterpolant, which @types/three 0.185 dropped while the
runtime keeps it; upstream's paladin clip modules and tests call it). Lock
resolutions restored after the take-theirs lockfile floated them: electron
43.3.0 (was drifting to 43.4.0) and n8ao 2.0.0 (was drifting to 2.0.1);
specs unchanged. Upstream tooling now available to later phases: the boot
load profiler (src/game/load_profiler.ts, src/render/load_marks.ts,
scripts/load_probe.mjs, d7db12cf14) for desktop shell load metrics.

Phase 7 additions: electron/desktop_prefs.cjs + .d.cts (the shell's FIRST
disk persistence: desktop-prefs.json under app.getPath('userData'), schema
v1 { version, windowBounds {x,y,width,height}, displayId, maximized,
gpuForceOptOut }; loadDesktopPrefs never throws or hangs: stat.isFile()
gate then a 64 KiB stat cap BEFORE any read, strict === true/false
booleans, finite-integer clamps width/height [1024..16384] and x/y
[-32768..32767], partial bounds dropped whole, unknown version discards
the file, the result is a fresh whitelisted object so __proto__ is inert;
saveDesktopPrefs validates outbound and stages through desktopPrefsTempPath
(pid + 8 random hex) opened with the exclusive 'wx' flag, renames over the
target, and unlinks only a temp it created itself: a pre-existing path,
symlink included, refuses the write and save answers false, fail-safe.
PHASE 8 PATTERN: displayMode joins as one validated field plus one
defaults entry in sanitizeDesktopPrefs; version stays 1 while no existing
field changes meaning), electron/window_memory.cjs + .d.cts (pure
resolveWindowRestore: honored only when the saved displayId matches a live
display AND at least 100x50 px lands in a work area AND the title strip is
reachable, else defaults CENTERED on the display nearest the saved point,
primary when none; a stale maximized flag never rides a fallback;
MIN_WINDOW_WIDTH/HEIGHT 1024/720 are shared constants consumed by the
main.cjs constructor), src/game/desktop_gpu_pref_sync.ts
(desktopGpuPrefSupported requires BOTH bridge methods as functions;
syncDesktopGpuPrefSetting(bridge, createSettings) reflects the STORED
opt-out into the setting, factory invoked only AFTER the read resolves and
only on a strict boolean, writes settings.set directly and deliberately
not through onSettingChange; pushDesktopGpuPref(bridge, force) owns the
write crossing: the one inversion, feature check, sync-throw guard,
swallowed rejection). main.cjs wiring: the prefs read is the first
statement after the require block (probe: userData resolvable pre-ready,
~136 microseconds); ONE module-scope desktopPrefs record is the single
source every save writes whole (the bounds saver and the IPC setter cannot
clobber each other); strict-true opt-out guards wrap BOTH gpu levers with
each lever in its else arm (skips logged; skipping means NOT CALLING,
since forceHighPerformanceGpu appends its switches on every platform
before its own win32 gates); WINDOW_BOUNDS_SAVE_DEBOUNCE_MS 700 on
resize/move plus a synchronous 'close' capture using getNormalBounds
(never getBounds) + isMaximized + getDisplayMatching, timer cleared in
'closed'; DEFAULT_WINDOW_WIDTH/HEIGHT 1440/900 stay in main.cjs.
New bridge methods / IPC channels (phase 7): invoke channels
'desktop-set-gpu-force-opt-out' (trustedSender-gated, accepts only literal
true/false, persists first and commits the in-memory mirror only on
persisted-ok, returns that ok) and 'desktop-get-gpu-force-opt-out'
(trustedSender-gated, returns the STORED boolean, which is what the NEXT
launch does); optional DesktopBridge members getGpuForceOptOut /
setGpuForceOptOut (the preload setter sends optOut === true).
New settings keys (phase 7): forceHighPerfGpu { def: true }, the INVERSE
of the stored gpuForceOptOut (setting true = force on = opt-out false);
the shell store is the source of truth, reflected at boot; desktop-only
row gated on OptionsEnv.desktopGpuPref (a BRIDGE capability, never
isNativeAppShell), appended with its note row at the END of Interface
General so the web arm's order is untouched; buildInterfaceControls takes
an OPTIONAL env (single-arg callers render no row); the GENERAL_KEYS pins
are dual-armed (desktop and web lists both exact-ordered).
New i18n keys (phase 7): hudChrome.options.forceHighPerfGpu +
hudChrome.options.forceHighPerfGpuNote (en plus the five M16 fills each in
zh_CN/zh_TW/ja_JP/ko_KR/ru_RU; 16 locales pending for the release fill
pass).
New tests (phase 7): tests/electron_desktop_prefs.test.ts (content
whitelist/clamps/strict booleans/unknown version/oversize-before-parse,
file shapes: symlinked-temp refusal with a victim-untouched pin,
own-temp-only cleanup, the isFile hang-proof with a read-count-0 pin, the
__proto__ pollution pin, throwing-fs arms, validate-outbound,
no-mutate/no-return of parsed input; QA added the at-cap boundary, the
lying-stat text-guard arm, the read-count-0 size gate, and the BOM arms),
tests/electron_window_memory.test.ts (display-gone, off-screen, too-small
intersection, happy + maximized restore, exact center math; per-suite test
counts deliberately not recorded here, they rot: run the suite),
tests/desktop_gpu_pref_sync.test.ts (
reflection both polarities on a recorded write log, the
factory-after-resolve ordering pin, construct-nothing arms, push both
polarities on the received argument, absent-method/no-bridge/rejected/
sync-throw/this-receiver arms). tests/electron_shell_startup.test.ts grew
4 pins (prefs-read-before-levers, the strict-true guard at exactly 2 sites
with each lever in its else arm plus QA's exactly-one-call-site counts,
restore-in-constructor plus maximize-INSIDE-the-reveal (QA moved it: a
constructor-time maximize shows the hidden window), settle + close capture
wiring with the debounce-cancel pin);
tests/electron_ipc_channels.test.ts grew the two channels, two method
names, and a setter body pin; tests/electron_display_push.test.ts's
getNormalBounds ban re-scoped to the sendDisplayChange body;
tests/options_view.test.ts dual-armed (it.each web/desktop) plus the
appends-only-with-capability test and a direct no-musicToggle assert;
tests/options_window.test.ts carries whitespace-tolerant
contains/not-contains pins on the renderInterface env
(desktopGpuPrefSupported in, isNativeAppShell out);
tests/settings.test.ts default-true plus persisted opt-out round trip.

Phase 7 QA done (2026-08-13, PASS-WITH-FOLLOWUPS, 0 blocking; QA-start base
merge db35378113 took release tip b08d79ef91, 92 files, no electron/desktop
surfaces, one sorted-list conflict in tests/architecture.test.ts, parity green
after). 19-agent workflow (context loader, 5 auditors, merge-dedup, 2 skeptics
per actionable), zero losses: 34 raw findings, 6 actionable, 6/6 CONFIRMED by
both skeptics. Fixes (commits 1a42dbde40, 544f38085d, cf58aa78a7, 35d4efa20d,
7e61fa823d, 29f83ced66 gate collision): maximize moved INSIDE the reveal (maximize() on a hidden window
also shows it, runtime-reproduced: the pre-fix shape shows an unpainted frame
at t=2ms); BOM strip on the loader (a Windows BOM'd hand-edit of the rescue
field silently resolved to defaults = force back ON); the IPC setter's
whole-record spread pinned literally; both src/main.ts crossings textually
pinned; the Reset-re-arm coupling pinned as accepted doctrine; lever
call-site counts pinned to 1; debounce-cancel pinned; the stat-size gate made
observable (read-count-0). Ledger re-litigations: reset-re-arm ACCEPT-AND-PIN
(the Reset click IS the push, not the next toggle), note-copy CHANGE
docs-only (rescue paragraph in docs/desktop-release.md; the env-var/CLI
escape hatch stays the phase 11 user decision), graphics-tab pointer /
16384 ceiling / no-jsdom-web-absence all UPHOLD. Probe round 19/19 KILLED
rc=1 with named tests (14 audit rows incl. the two designed pre-fix
survivors now killed, 4 QA-pin rows, 1 rig-gap re-probe). ENVIRONMENT
CAVEAT: on this box's XWayland/Mutter x11 rig, win.maximize() is inert in
EVERY order (probed maximize-then-show, show-then-maximize, and the pre-fix
constructor shape), so the maximized-restore half is verified at the
contract level (electron.d.ts plus the vendored-binary probe), while the
hidden-until-ready half is runtime-proven (seeded smoke: first visible
439ms, ready-to-show 432ms, zero early-visible samples, both opt-out skip
log lines present). Smoke rig: scratchpad seed/verify wrapper, seed mode
learns the live displayId then writes the store via saveDesktopPrefs.
Gate: full fallback red the accepted set plus ONE merge-window semantic
collision (upstream's tests/three_reflection_contract.test.ts pins
THREE.REVISION '165'; re-pointed wholesale to r185 in 29f83ced66, all six
contract tests already held on the r185 build); post-fix red exactly 9
seals/14 + monolith 2, turbo proofs 5/5 + 3/3, browser leg 19/125 green.

Phase 8 done (2026-08-14, base merge 3fe05f89ad of release tip 6ee7f3fd27 +
sparse-cone reconcile 40c8368c6b + commits 5f144f5beb display mode,
ffc2c083b2 display-sleep blocker, b2e1f59537 options row, 831b0c2cb1
hidden zone-warm pause, + docs; parity 335/335 green after the merge;
security review 0 blocking / 0 should-fix, seam review 3 should-fix all
resolved, gate-integrity PASS on the cone reconcile; full record in
progress.md).

Phase 8 additions: displayMode in desktop-prefs.json ('borderless' |
'windowed' via strict readDisplayMode, junk resolves 'borderless', default
'borderless', DESKTOP_PREFS_VERSION still 1) with the startup apply INSIDE
showMainWindow before show() (borderless supersedes maximize in a pinned
else-if; never a `fullscreen` constructor option: an explicit false
disables the macOS fullscreen button) and a captureWindowBounds guard
(early return while isFullScreen(): Linux getNormalBounds() equals
getBounds(), so a borderless session would persist the display rect over
the windowed memory; smoke-reproduced both directions). IPC invoke trio:
desktop-set-display-mode (pinned recipe + IDEMPOTENT same-value early
return before the save, then live setFullScreen), desktop-get-display-mode
(stored value; 'borderless' to an untrusted sender), desktop-gamepad-
activity (feeds the lease). electron/power_save.cjs + .d.cts (pure
display-sleep state machine, injected start/stop/setTimer/clearTimer/now:
POWER_SAVE_IDLE_MS 60000 idle release re-armed per accepted ping,
POWER_SAVE_MIN_PING_INTERVAL_MS 10000 main-side floor whose stamp resets
on release, hidden releases immediately and mutes, shutdown terminal;
wired to the real powerSaveBlocker, setHidden rides the ONE hidden
derivation inside sendPresentationState, 'closed' releases, 'will-quit'
shuts down). Preload + DesktopBridge: getDisplayMode/setDisplayMode
(preload refuses junk without crossing) + notifyGamepadActivity (fire and
forget, rejection swallowed); DesktopDisplayMode union in src/runtime.ts.
Renderer: src/game/desktop_display_mode_sync.ts (gpu-template trio:
desktopDisplayModeSupported BOTH-methods capability, pushDesktopDisplayMode
fire-forget total, syncDesktopDisplayModeSetting factory-after-read strict-
union boot reflection writing displayMode 1/0); src/game/
gamepad_activity_notify.ts (GAMEPAD_ACTIVITY_NOTIFY_INTERVAL_MS 30000
client throttle, permanent no-op sans bridge, throttle stamp advances on
throw so a dead channel cannot retry-storm); GamepadCallbacks.onActivity
fired at most once per poll on real input only (edge, look.active, move
flags, pointer-cursor movement; after the focus gate); src/game/
zone_warm_tracker.ts (displacement + rift-exit-edge tracker with hidden-
freeze semantics for the GPU lane 1 pause: hidden answers null and
consumes nothing, reveal measures from the last visible position, reused
result object so the per-frame path allocates nothing; main.ts thin
consumer threading desktopPresentationHidden()). Settings/options:
displayMode SETTING_RANGES {min 0, max 1, def 1} (1 = borderless); the
Graphics Display card swaps toggle(fullscreen) for choice(displayMode)
when OptionsEnv.desktopDisplayMode (capability set in options_window.ts
beside desktopGpuPref); requestPreferredFullscreen early-returns when the
shell owns display mode (web, mobile, and OLD desktop shells keep the
browser path; NO F11 keybind exists and nothing else reads the fullscreen
setting); the fullscreen key itself stays untouched for web/mobile. i18n
keys hud.options.displayMode / displayModeBorderless / displayModeWindowed
(hud.options beside the row it replaces, a recorded conscious choice vs
hudChrome.options) + 5 non-Latin M16 fills. New suites:
tests/electron_power_save.test.ts, tests/zone_warm_tracker.test.ts,
tests/gamepad_activity_notify.test.ts (incl. the main.ts onActivity
composition pin), tests/desktop_display_mode_sync.test.ts (crossings,
wiring pins, Reset-through-the-real-footer-filter doctrine). The
presentation_push/display_push whole-body pins now carry the lease lines
(comments must stay OUTSIDE pinned bodies: the flatteners do not strip
them). GPU lane audit adjudication + smoke rig (prototype-patched
BrowserWindow, PRIME-child writes the result late) recorded in
progress.md.

Phase 8 QA done (2026-08-14, PASS-WITH-FOLLOWUPS, 0 blocking; QA-start
merge 74d8eec048 of release tip 51aa4eab13 with one generated-i18n
conflict resolved by i18n:gen regen, parity 335/335 + ci_workflow +
architecture + tsc green after; fix commits 5d1e1c44f7 electron pins,
ddaa389f57 renderer pins + gamepad arms, 6736deb4d9 zone-warm honesty,
bc5a758186 setter deviation docs; full record in progress.md). 34-agent
workflow plus one direct security re-dispatch (the custom-agentType
StructuredOutput failure mode recurred; the direct dispatch answered 0
blocking / 0 should-fix): 6/6 ledger re-litigations UPHOLD, 10
actionable findings (8 double-confirmed all resolved, 2 splits
adjudicated down: F4 to docs+test, F5 to ledgered hardening), probe
round 15/15 killed with named tests. New pins from QA: the
createPowerSave wiring block (five injected members, count 1), both
prefs setters' save-failure guard literals, the preload junk-refusal and
notify-catch bodies, the untrusted getter fallback literal plus
per-channel trust returns, comment-strip on the display-mode wiring pins
(mainSource/optionsWindowSource), the web-arm ordered Display card run,
gamepad per-arm activity cases (back/strafeLeft/strafeRight + vertical
cursor), the power_save strict-true setHidden arm, and the zone-warm
both-hidden bound test (the rift edge survives a hidden span only when
some part of the crossing was seen; entirely-hidden crossings are a
pinned deliberate bound). Ledger for phase 11: main-side isFocused() on
the gamepad-activity handler, preload notify sync-throw guard,
Object.freeze(DISPLAY_MODES), the F5 apply-all-loop hardening, the F4
sticky hidden-band latch. Gate red exactly the accepted set (9 seals/14
+ monolith 2), 38347 passed; turbo proofs 5/5 + 3/3; browser leg 19/125
green. Neither macOS stopping rule tripped.

Perf baselines: docs/perf/baseline/history.jsonl carries the phase 5 rows (low
pre/post dressing fix + medium, this machines RTX 5090, 1280x720, vsync off;
raw runs in tmp/perf-baseline/, gitignored). Phase 6 froze the pre-upgrade
baselines at 519f1c328d; the phase 6 QA rows (4x low, 2x each medium/high/
ultra, commit-per-run) are the fresh-vs-frozen evidence. INTERIM RECONCILE
2026-08-13: those frozen baselines are OBSOLETE as comparison targets for any
FUTURE run (upstream v0.37/v0.38 landed a large perf body: shadow cadence and
texel snap, first-reveal compile gates, early prewarm submission, texture
residency prewarm, character far LOD + variant eviction, sky HDR eviction);
the phase 6 baseline-vs-after TABLE remains valid historical evidence of the
three-train delta. RE-FROZEN 2026-08-13 on the merged tree (quiet machine;
commits 8bc24d2fe8..the medium retry; low x4 + medium/high/ultra x2, all
dirty:false): these files are now the forward reference. METHODOLOGY RULE
from the same session: the machine itself drifts (the pre-train control
tree benched the same day read -12 percent vs its own era freeze, with
halved 1 percent lows), so NEVER compare fresh rows against era rows
directly; run a same-day control (worktree ~/Documents/woc-r165-before at
519f1c328d) beside any cross-era claim. Same-day low picture on the merged
tree: open-run -18.8 / combat -17.4 vs the old tree, 1 percent lows
halve-to-third everywhere (full table in the progress.md interim record). The r181
frozen showcase pairs in tmp/r181-showcase-frozen/ remain INTERNALLY VALID
for user decision #2 (both sides captured on the same pre-merge base, so they
isolate the three-train lighting delta); NEVER diff post-merge captures
against them: upstream changed sky, portraits, character visuals, terrain
KTX2, and added contact blob shadows, so post-merge shots differ for reasons
unrelated to r181. NOTE for future perf work: chromium ANGLE on this MUXless
box renders on the Intel iGPU by default; frozen and fresh rows share that
stack so comparisons hold, but absolute fps is iGPU-bound, and any recipe
change that moves the browser onto the 5090 invalidates cross-era
comparisons.

Phase 9 inventory (as amended by phase 9 QA): IPC invoke channel
desktop-show-notification (payload {kind, title, body}; kinds
'update-ready' | 'party-invite'; caps both-sided: preload transport slices
512/1024, main authority 120/240 via clampText; trust-gate return false;
preload method showNotification, fresh const message rebuild + invoke
.catch + sync try/catch). On linux both strings are entity-escaped
(escapeNotificationMarkup in diagnostics.cjs, ampersand first, AFTER the
clamp) so markup-parsing daemons see only literal text. Pure module
electron/notify_guard.cjs + .d.cts (createNotifyGuard({now, minIntervalMs}),
NOTIFY_MIN_INTERVAL_MS = 10000, allow(kind) stamps only on true, TypeError
boundary validation; suite tests/electron_notify_guard.test.ts). Renderer
module src/game/desktop_notifications.ts (createDesktopNotifyCore,
shouldNotifyDesktop, initDesktopNotifications composed LAST in
desktop_shell_integration, desktopNotifyOnSimEvents armed-latch called from
the two main.ts event sites, the ONLINE site gated on net.spectating ===
null: a spectating session's net.playerId is the watched player's pid;
suite tests/desktop_notifications.test.ts). DesktopBridge gains optional
showNotification(request: DesktopNotificationRequest) in src/runtime.ts.
i18n keys: desktop.notify.updateReadyTitle/updateReadyBody/partyInviteTitle/
partyInviteBody + desktop.update.whatsNew ('See what changed in your
browser'), all five with the five M16 fills. GITHUB_RELEASES_URL exported
from src/ui/news_feed.ts. flattenControlChars (diagnostics.cjs) strips
bidi/zero-width formatters, the U+2028/U+2029 line separators, soft hyphen,
ALM, Mongolian vowel separator, word joiner and invisible operators,
interlinear annotation, and the tag characters (/u flag); clampText never
emits a trailing lone high surrogate from either exit. DEFERRED by design:
a notification preferences UI (no in-game toggle; OS-level muting is the
only off switch).

## Known gotchas for this packet

- pnpm only: regenerate the lockfile via pnpm add/update, never hand-edit; frozen
  installs print a cosmetic "Packages: -136" line, ignore it.
- The 2026-08-08 release merge (4d52f151eb) renamed the turbo typecheck task to
  check:types: the post-vitest-abort proof is now `npx turbo run check:types
  build:env build:server build:bot`, then `npx turbo run build:bundle`.
- The Bash tool runs zsh here: wrap bash-isms in `bash -c`; quote everything.
- Fresh worktrees need their own `pnpm install` (done for this one on 2026-08-08).
- Commit the feature work BEFORE planting any mutation-test probes; git checkout
  restores have clobbered uncommitted fixes three times before.
- Reviewer/QA agents die silently at turn limits: give every spawned reviewer a hard
  ~30-tool-call budget and a report-first instruction, and nudge idle agents to dump
  their report with no further tool calls.
- The i18n semantic-regressions suite (full gate only) pins reviewed locale prose:
  rewording an existing English value that has stale Latin locale fills reds it;
  re-point pins or add fresh non-Latin fills in the same change.
- gate biome leg, POST-v0.38.0 RECIPE: the old biome.json defaultBranch pin is
  OBSOLETE. Upstream ddc4b8a706 replaced the bare `biome ci --changed` with
  `scripts/ci_changed.mjs`, which resolves a real `--since` via gate_discovery's
  resolveSelectBase: the GATE_SELECT_BASE env override if set, else the newest
  origin/release/* by version sort, else origin/main. On this branch the newest
  release branch IS our base, so `npm run ci:changed` and the gate's biome leg
  diff against the right base with NO working-tree edit. Verify a delta manually
  with `GATE_SELECT_BASE=origin/<latest-release> npm run ci:changed` if the
  auto-resolution ever picks wrong. (Census claim ci-changed-since-obsoletes-
  biome-pin, both skeptics CONFIRMED, 2026-08-13.) Do not fix pre-existing
  whole-repo biome offenders: deferred debt, not this branch's regression.
- electron/vendor/ is gitignored generated output, so "vendor bundles unchanged"
  can never be read off `git status`: hash `electron/vendor/*.cjs` before and after
  and compare (phase 1 recipe).
- pnpm-lock.yaml is a HASHED INPUT of all 7 asset source fingerprints: ANY lockfile
  change (phase 1 electron bump, phase 6 three train, a base merge that moved deps)
  reds 8 asset suites (5 eastbrook files, fenbridge, render_glb_replacement,
  terrorspark) on seal mismatches. Fix is never to weaken the pins: the
  size-preserving re-mint runbook (scripts/assets/remint_lockfile_fingerprints.mjs,
  5-step order in commit 218de2db08). USER DECISION 2026-08-08: defer to ONE
  re-mint at phase 11 over the final lockfile; until then these 8 suites are the
  accepted per-phase full-gate exception (everything else must stay green, and the
  lockfile-triggered vitest full-suite fallback means every per-phase gate WILL run
  them). Phase 6 QA expansion: tests/mob_portrait_source_manifest.test.ts (arrived
  with the artwork-overhaul merge) seals the portrait RENDERER fingerprint, which
  the three train moved; it needs the re-render + review + receipt flow, so it is
  the NINTH accepted seal suite, batched with the phase 11 re-mint. Interim
  reconcile 2026-08-13: the accepted-red SET is unchanged (same 9 suites;
  eastbrook_provenance_diagnostics still green) but the count is now 9 files / 14
  tests: upstream 154f0563ce added a third mob_portrait test (the --write receipt
  authorization), red for the same fingerprint root cause. PHASE 9 UPDATE
  (2026-08-14): mob_portrait_source_manifest is GREEN on the merged tree
  (upstream's portrait revert train, d0a061ff6c restoring PR 3307 behavior,
  healed the fingerprint), so the accepted red set is now 8 seal suites / 11
  tests plus the monolith 2. GATE ENV: export BROWSER_PATH before gate_select
  or four browser-driving vitest suites (gpu_hitch_capture, perf_hitch_soak,
  perf_hitch_store, profile_mode) red at FILE level on browser discovery
  inside the full fallback; they are environmental, green with it exported. Two sealed suites new
  in the range (tests/metamorphosis_asset.test.ts, tests/native_assets_pack
  .test.ts) do NOT hash pnpm-lock.yaml, so the lockfile blast radius is unchanged
  and they stay green. Phase 11 addition: upstream fb78debb7f shipped
  scripts/assets/eastbrook_grand_armoury/rerecord_polish_provenance.mjs (renderer
  .ts bytes are a provenance input the train moved): the phase 11 seal step must
  run its twelve-input --check first; if the r185 delta touches town rendering
  the polish captures must be RE-SHOT, not just re-recorded.
- MONOLITH RATCHET RED (OPEN, surfaced 2026-08-13, user decision pending):
  tests/monolith_budget.test.ts reds on the merged tree: renderer.ts 13853 vs
  ceiling 13764 (+89) and hud.ts 19500 vs 19490 (+10). Structural, not a
  defect: upstream's own extract-and-lower ratchet updates (marker interaction
  out of HUD 16181436bf, renderer diagnostics 8d755848ee) re-pinned the
  ceilings with near-zero slack, and the branch's phase 4-6 additions to the
  two coordinators are already thin-consumer wiring to extracted modules
  (presentation_gate, frame_present, dpr_watch, instance_music,
  static_matrix), so no clean branch-owned extraction exists. Per the ratchet
  doctrine a ceiling raise is a MAINTAINER decision; the branch does not
  self-raise. Until resolved, a full-fallback gate run reds on the 9 seal
  suites (14 tests) PLUS this suite (2 tests) = 10 files / 16 tests; the
  monolith rows are the ONLY accepted non-seal red and any OTHER red is a
  regression. Resolution options at PR time: maintainer ceiling raise with
  recorded rationale, or an offsetting extraction of upstream-owned mass
  (permanent merge friction for a long-lived branch; not done unilaterally).
- tests/profile_mode.test.mjs (in the normal vitest suite) and the browser
  regressions leg need a browser binary this machine lacks by default: export
  BROWSER_PATH=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome for gate
  runs; without it profile_mode fails at import (this is the known environmental
  full-gate failure).
- perf_baseline runs DIRTY THE TREE for the next run (history.jsonl + the
  frozen baseline file are the run's own outputs): commit after every run or
  the following row lands dirty:true (struck in phase 6's first batch; the
  fix is commit-per-run, one data commit per preset).
- The shader-error smoke lever is the ?shaderdebug URL param (renderer.ts
  flips checkShaderErrors); run scripts/prewarm_travel_bench.mjs with
  GAME_URL='http://localhost:5173/?shaderdebug' and PERF_BOOT_TIMEOUT_MS
  raised (checkShaderErrors makes the swiftshader boot exceed the 120s
  default), at BOTH gfx=low and the ultra default; page errors print at the
  end without failing the exit code, so grep the output.
- A desktop-classified page (Electron UA or VITE_DESKTOP_APP=1) routes /api to
  the PRODUCTION origin: any online E2E/probe against the local server must
  restart vite with VITE_DESKTOP_RELATIVE_API=1. Register mode has a required
  email field (empty = silent requestSubmit no-op) and character names reject
  digits; scripts/desktop_hidden_skip_probe.mjs encodes all three.
