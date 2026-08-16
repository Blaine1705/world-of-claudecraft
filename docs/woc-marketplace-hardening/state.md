# State: cross-session cheat sheet

Updated by every session. Keep this file SHORT and current; it is what the next session
actually reads.

## Where we are

- Next file to run: `docs/woc-marketplace-hardening/phase-12-wire-completeness.md`
  (GAME repo, worktree `/Users/fernando/Documents/wocc-marketplace`, fresh
  session, newest origin/release/** sync first per the plan; at the 11 QA
  session's end the branch was 0 behind origin/release/v0.39.0 and
  origin/main still carried the v0.38.2 hotfix tip (1fd1f2e247), which flows
  in through the maintainers' main sync, but re-check both at session start).
  LOUD handoff unchanged: the service must never deploy ahead of 12's
  bond-quote contract adoption; 12 also owes tolerating TWO settled quotes
  per memoRef AND the new verifier reasons (not_yet_visible pending;
  burn_missing / burn_mismatch / burn_authority_mismatch / unexpected_credit
  terminal) AND gating anti-snipe on awaiting_finality; the 11 rounds add
  NOTHING new owed by 12 (asOfMs stays number|null and passes through).
- 11 QA COMPLETE (PASS-WITH-FOLLOWUPS, every finding applied or judged with
  the file open, PUSHED per R4: service 8da6c03..270e337 to
  feature/woc-market-settlement updating PR #31; game docs pushed with it).
  Eight audit lanes over 8da6c03..03df5de: 0 blocking, 44 findings; red
  proof 11/11 REPRODUCED-RED; mutation 42 run, 41 BIT, the one survivor
  (overview crossVenueGateArmed hardcode) closed by a two-venue overview arm
  and re-proven. Fix round 5 commits, tip 270e337: floors re-sized from the
  venue cadence (staleness tight end 45 min, sample minimum 60; recorded as
  an R3 amendment note), refusal readout via a NON-MUTATING poll-clock view,
  parse-time warns for mis-set oracle knobs, window depth on the recovered
  line, spot/twap mirrored onto the overview, doc truth-ups everywhere the
  audit caught the prose lagging the one-judge design. Round-2 workflow over
  the fix round: two fresh lenses (13 findings, 0 blocking, all applied or
  judged), 16 new-pin mutants ALL BIT, completeness critic; the four rework
  pins proven by compiled-dist mutation. Suite 590 to 595 (588 + 7 env-gated
  skips default; 595/595 zero skips with CLAUDIUM_TEST_DATABASE_URL). The 11
  QA ROUND bullet in the ledger below is the registry 12 consumes.
- 11 COMPLETE (SERVICE repo, LOCAL not pushed per R4; session start 8da6c03,
  tip 03df5de, 5 commits; game docs commits e2f189e9a4 (the R3 ruling record,
  BEFORE code), c5ce2793e7 (PRD claim revised) and this entry's commit,
  LOCAL). R3 RULED single-venue at session start and implemented; H3's
  shared-instance half pinned decisively under mocked timers with the
  quiet-period proof and a negative control; publish-time asOfMs on the wire
  and the honest venue surface; the fix round made the oracle the ONE judge
  of freshness per venue and the heartbeat now feeds an edge-triggered
  halted/recovered operator signal; the re-review round bounded every env
  knob in BOTH directions, capped the sample buffer, and made a paused
  refusal read the last heartbeat reading instead of polling; the cold-boot
  single-print exposure RULED record-and-document (an R3 amendment). Two
  fresh lenses (security/ops 14, correctness 21) plus a fresh re-review of
  the fix round (18), every finding applied or judged with the file open;
  the re-review's own fixes closed by careful self-review (narrow,
  test-covered, 11 mutants bit). Suite 560 to 590 (583 + 7 env-gated skips
  default; 590/590 zero skips with CLAUDIUM_TEST_DATABASE_URL). The 11
  ledger entry below is the registry the 11-qa session consumes;
  progress.md carries the commit-by-commit round.
- 10 QA COMPLETE (PASS-WITH-FOLLOWUPS, every finding applied or judged with
  the file open, PUSHED per R4: service ba7df0b..8da6c03 to
  feature/woc-market-settlement updating PR #31; game pushed at the end of
  the session, 0 behind origin/release/v0.39.0). Seven audit lanes in one
  workflow (hostile-fixture hunt: 56 shapes RUN through the real verifier,
  ZERO accepted_dishonest, the real wallet shape verified matched; security;
  correctness; coverage; docs; red-proof: all six registry claims
  REPRODUCED-RED on the 02713f2 build; mutation: 27 of 31 BIT, four real
  pin gaps closed); the refuter stage died on the session limit after 15,
  every finding judged in the main loop with the file open and primary
  sources. THE MULTISIG CALL: ba7df0b's restoration judged CORRECT with
  agave parse_token.rs (count-based labeling) and spl-token processor.rs
  (single-signer branch ignores trailing accounts) open; agave labels BOTH
  token programs 'spl-token' (parse_instruction.rs). The round's fixes:
  the chain-owned signature SHAPE screen before the first write (a junk
  string used to 500 through the RPC's -32602 and read to the game as
  service_unavailable, the abandon-ledger / anti-snipe exemption verdict),
  the payer-leg netting (treasury as buyer) gated on owesOthers plus the
  escrow-bidder refusal (the fix-round re-review caught the bond self-leg
  vacuity my first cut introduced), burn_authority_mismatch, the stray
  wallet named in the log (once per memo, clamped), the sweep
  failing/recovered warn with in-flight guard, non-positive budgets,
  attention.confirmingExpired24h on its own terminalReason read, and the
  doc truth-ups (bound measured from EXPIRY, five-under-six a two-knob
  precondition, the RPC-horizon premise re-anchored on
  MAX_REPLACEABLE_AGE_MS, vocabulary table, recovery caveat, deploy note).
  Pins closed incl. the pg EvalPlanQual race rig on BOTH sweep arms;
  21 + 11 mutants BIT over the committed rounds. Suite 536 to 560 (553 + 7
  env-gated skips default; 560/560 zero skips with
  CLAUDIUM_TEST_DATABASE_URL). The 10 ledger entry below is AMENDED IN
  PLACE with a 10 QA ROUND bullet, the registry phase 11 consumes.
- 2026-08-15 SYNC-ONLY session ahead of 10 QA (Fernando asked to stop after
  the merges): SERVICE origin/master still at df09756, already contained
  (no-op); baseline at ba7df0b re-verified (build clean; 536 tests, 530 pass,
  6 env-gated skips default; 536/536 zero skips with
  CLAUDIUM_TEST_DATABASE_URL). GAME re-synced to the NEWEST release branch,
  origin/release/v0.39.0 (v0.38.0 shipped to main via PR #3416, v0.39.0 minted
  from it; tip d2d1a8ad5c = the v0.38.0 tip + 6), merge f5df042a86, NON-trivial:
  five conflicts (hud.ts prewarm composition, generated pending.ts, the
  add/add pair tests/helpers/strip_comments.ts + .test.ts, monolith_budget),
  three ratchet reds on the union (hud re-pinned DOWN to 19120 exact, sim.ts
  to 12508 exact = release-side growth only, main.ts nine over -> the Exchange
  attach extracted to src/game/woc_market_wiring.ts in bf7aeb8a98, ceiling
  kept at the release's 11490, file 11489, three mutants bit); the release's
  Armory-prewarm removal was carried into the branch's
  preview_prewarm_wiring.ts; three.js 0.185.1 (patched) needed a fresh
  pnpm install. release-merge-audit (six lanes + a refuter per finding, 14
  findings ALL confirmed, none refuted): every overlap file a clean union,
  count pins 200/213/324 unchanged (run-confirmed), no route / world_api /
  net delta, both new db-mock sites green; two pin-prose nits applied
  (e362916958), nine doc premises corrected in this entry's commit, two i18n
  observations recorded (the 3 hudChrome.trade.woc non-Latin rows are
  pre-existing branch debt; entities.abilities.frenzied_regeneration.description
  overlays are reword-stale ON THE RELEASE, 18 locales, a maintainer follow-up
  on release/v0.39.0, not this branch). Gate GREEN at bf7aeb8a98 (gate_select,
  full-suite fallback, all 12 steps, 2850 files / 40533 tests, browser 129,
  WITH TEST_DATABASE_URL); DB-gated suites 18 files / 245 green zero skips.
  Everything LOCAL, nothing pushed (the 10 QA session pushes on PASS per R4;
  the game push then rides these sync commits).
- 10 COMPLETE (SERVICE repo, LOCAL not pushed per R4; session start 02713f2,
  tip ba7df0b, 6 commits). B4 closed red-first (three redirect shapes
  reproduced MATCHED on the old verifier); the two R5 items this file owned
  RULED by Fernando at session start and implemented (commitment split
  ratified code-owned; five hour confirming bound, both stores, sweep driver:
  expiry previously had NO production driver at all); the undecided confirm
  vocabulary split (not_yet_visible vs awaiting_finality) landed as the
  service half of the anti-snipe residual. Two fresh lenses plus a fresh
  re-review of the fix round, every finding applied or judged; the re-review
  REFUTED the fix round's multisig-impossibility rationale (count-based
  jsonParsed labeling) and the arm was restored money-safe. Suite 508 to 536
  (530 + 6 env-gated skips default; 536/536 zero skips with
  CLAUDIUM_TEST_DATABASE_URL). The 10 ledger entry below is the registry the
  10-qa session consumes; progress.md carries the commit-by-commit round.
- 09 QA COMPLETE (PASS-WITH-FOLLOWUPS, every finding applied or judged with
  the file open, PUSHED per R4: service aa44873..02713f2 to
  feature/woc-market-settlement updating PR #31; game pushed after this
  session's v0.38.0 re-sync, merge abd4a9e0e2, trivial, generated-i18n
  conflict regenerated). Nine lanes over aa44873..3346878: ZERO blocking in
  the implement range; all six red-first registry claims REPRODUCED-RED; all
  seven mutation arms BIT by name in both stores. The round's own fixes (5
  commits, tip 02713f2): entry adoption closing the registered
  paid-after-expiry edge, typed signature_already_settled on the
  settled-signature collision (both stores; was an unhandled 23505 500), the
  undecided late-visibility window, the rejected-write entry-vocabulary fix,
  the rpc probe-list membership pin, the actor intake bound, fifteen
  test-decisiveness hardenings, and the doc truth-ups. Two fresh re-review
  lenses over the fix round, everything applied or judged; round-2
  mutation-proven. Suite 493 to 508 (502 + 6 env-gated skips default;
  508/508 zero skips with CLAUDIUM_TEST_DATABASE_URL). The 09 ledger entry's
  QA ROUND bullet below is the registry phase 10 consumes.
- 09 COMPLETE (SERVICE repo, LOCAL not pushed per R4; session start aa44873,
  tip 3346878, 9 commits). B3, the bond double-pay medium, and the bond-cents
  ownership mediums closed; R2 forfeit split landed one-code-path (so the R6
  Terms publication gate's R2 dependency is now met service-side); the two R5
  items this repo owns RULED by Fernando and implemented. Five red-first
  proofs; two fresh coverage lenses plus a fresh re-review of the fix rounds,
  every finding applied or judged with the file open. Suite 445 to 493 tests
  (488 + 5 env-gated skips default; 493/493 with CLAUDIUM_TEST_DATABASE_URL).
  The 09 ledger entry below is the registry the 09-qa session consumes;
  progress.md carries the commit-by-commit round. LOUD cross-repo handoff for
  12 inside the ledger entry: the game must adopt the bond-quote contract
  BEFORE the service ever deploys ahead of it, or bond quoting refuses.
- 08 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4:
  service aa44873 to feature/woc-market-settlement, game to
  feature/woc-marketplace after this session's v0.38.0 re-sync). The fix
  round was re-reviewed FRESH (0 blocking, 7 should-fix, 8 nits, ALL
  applied in a fourth commit, mutation-proven where the re-review proved a
  pin gameable). Six fresh
  lanes + a dedicated red-proof lane over 70d4207..4b9e413: 0 blocking, all
  four red-first claims REPRODUCED-RED on a throwaway 70d4207 build. The
  round's own finds, all applied (8 should-fix + 13 nits): the railless
  durable-store gate was still denylist-shaped (DATABASE_URL now required
  unless NODE_ENV affirms dev or test), partial-Stripe strictness outside
  dev/test, both claudium escape flags trimmed, raw-first ASCII on BOTH
  secrets (a Unicode-whitespace-only admin secret used to read as unset
  silently), admin-tier trim/refusal pins, usdc percent pin, NEW
  compose_conformance.test.ts (staleness = oracle constant, NODE_ENV
  production, the deliberate CLAUDIUM_QUOTE_TTL_MS divergence documented),
  the in-memory seam's unreachability pin through the real buildEconomyApps
  call site, and the doc truth-up sweep. 12 mutations bit; suite 445/441/0/4.
  The 08 ledger's QA ROUND bullet below is the registry 09 consumes.
- GAME side this session: release/v0.38.0 re-synced (merge bfceae8d4b,
  NON-trivial, 33 conflicts; pins re-derived IWorld 324 = 86 + 238, sends
  200, dispatches 213; wireAura moved byte-identical to
  snapshot_timer_wire.ts to pay the merged game.ts overage). The
  release-merge-audit found THREE union-only reds (trade_money_shot.mjs
  restored; server_sim_facade fileURLToPath; woc-market joined the CI sparse
  cones) plus pin-quality repairs, all landed. Real-SQL suites 154 green
  zero skips; gate GREEN at ad197c0801 (full-suite fallback, all 12 steps:
  the gate grew four manifest steps since the "all 8" era, 39724 vitest +
  129 browser, WITH TEST_DATABASE_URL).
- 07 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4).
  Release/v0.38.0 re-synced (merge 55c2ba992e, trivial: two CI-harness
  commits, no marketplace overlap, no count-pin surface; tsc clean and
  the four pin suites 377 green on the merged tree). Eight fresh audit
  lanes over the package; the unreviewed proofreader-fix round verified
  clean site by site. The round's own finds, all applied: the draft was
  missing three shipped mechanics (the seller opt-in second-chance
  offer, the one blocking find: it falsified "your bond is returned
  when you are outbid"; the anti-snipe extension; the buy-now abandon
  cooldown pair) plus wording drifts (10.4 cancel boundaries, bid
  withdrawal, bound items; 10.6 pause honesty; 10.7 rounding and wallet
  identity; the Section 9 bond-custody carve-out) and companion
  truth-ups (marketplace.md's third TOTP site and suspension scope and
  phantom store-catalog claim, wallet-link's server-vs-service-built,
  README's "sells no items", the p2p cap-knob anchor, the src/ui
  CLAUDE.md Exchange-checkbox honesty). New deferreds with owners in
  the amended 07 ledger entry (QA ROUND bullet). The amended draft
  postdates the recorded R6 send: Fernando forwards the AMENDED draft.
- 07 COMPLETE (docs only, zero code diff, LOCAL, not pushed per R4).
  Release/v0.38.0 synced (merge 8a1739d67a, trivial, no marketplace
  overlap; monolith_budget AUTO-MERGED, all four count-pin suites
  re-derived green from a run, 377 tests, renderer ceiling 13708 is the
  release's own extraction). The counsel package is READY and R6 is
  recorded sent-to-counsel 2026-08-13 (see Rulings). Deliverables:
  TERMS_AND_CONDITIONS_MARKETPLACE_DRAFT.md (beside the untouched live
  Terms) + the decision memo (held PRIVATELY outside the public repo, see
  Locked decisions) + the carve-out reconciliation + the staleness cluster
  fixes. A FRESH proofreader swept the package
  (1 blocking + 7 should-fix + 6 nits, ALL applied). The 07 ledger entry
  below carries the findings registry (the seller-side terms gap, the
  terms.html drift, the R2 forfeit-split publication gate, the locale
  README fills); the 07 QA session consumes it.
- 06 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4).
  Release/v0.38.0 re-synced (merge ab2742012b, NON-trivial: three test
  conflicts plus two SILENT count-pin auto-merges, all re-derived from
  suite runs: IWorld 323 = 86 data + 237 methods, fanout exemptions 10,
  hud.ts ceiling DOWN to 19160, sim.ts 12436; release-merge-audit ran,
  faithful, zero findings across seven overlap groups). ea1bb82322
  verified FIRST (comment-only src hunk; every pin bit under mutation).
  Six fresh audit lanes found ZERO code blockers in the implement round;
  the QA round's own finds: the capacity model's fungible-first drift
  (receiver overflow, fixed by making fitsAfterSwap run the removal walk
  itself), the instanced matcher's missing crafted-marker leg, the
  missing guardTerms on the directed buyer (strike parity), and four
  blocking TEST gaps, all closed. ONE NEW OPEN RULING for Fernando (R9,
  in Rulings): the trade arm records implied terms consent. The 06
  ledger entry below is AMENDED IN PLACE; the 07 session consumes the
  amended entry and should glance at the final tests-only commit
  47399f77b7 first (34 lines, implements the qa gate's prescriptions).
- 06 implemented AND reviewed (LOCAL, not pushed per R4): H10, H12, H14,
  createDirectedOffer guardBalance, and the directed non-payment
  auto-close closed; BOTH opening judgments settled ((a) unwind made
  provable by the atomic listing stamp + the convergedOffers sweep arm;
  (b) NO boundTo stamping, the rationale truthed-up at
  exchange_eligibility.ts). A db-perf PRE-implementation checkpoint
  (BLOCK, A1-A8) reshaped the design before code; the pg suite ran RED
  first for all seven target behaviors; FOUR fresh reviewers plus a
  fix-round re-review plus qa-checklist ran, every finding applied
  including nits (the security round's CRITICAL: the trade session
  stripped staged slots to id+count, so the H10 pin's client source
  could not carry an instance payload; trade staging now previews
  per-copy identity through the swap's own selection walk). After the
  first gate pass, SIX closing rounds ran (two independent fresh
  reviews of the gate-round commit, every fix round re-reviewed fresh;
  the CLOSING ROUNDS bullet in the 06 ledger has the substance). Gate
  GREEN three times: 5287214294, 5ebb176a73 (all production code), and
  the final tip ea1bb82322 (each full-suite fallback, all 8 steps, run
  WITH TEST_DATABASE_URL so every pg suite executed). The 06 ledger
  entry below is the registry later sessions need; the phase-06-qa
  session consumes it, and should verify the final tests-only commit
  ea1bb82322 FIRST (it implements the last reviewer's prescriptions
  and is the one round without a fresh review of its own).
- 05 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4).
  Release/v0.38.0 synced (merge b9e937c075, trivial: seven commits, no
  marketplace overlap, no count-pin surface). All four owed re-judgments
  UPHELD with their justifications repaired (the numbers, the
  quarantine-kick posture, 57014-stays-500, the carve-out, now owned by 16
  and sequenced after the honest occupancy bound). Five audit lanes plus a
  fresh fix-round re-review and qa-checklist; the QA round found and fixed
  one CRITICAL (TxNeverStarted stopped at the pool checkout: a stale
  socket failing at BEGIN still quarantine-kicked the seller) and one
  critical-class evidence destroyer (withTx's null asyncErr deref replaced
  every codeless failure with a TypeError), plus the kick-argument swap
  that sent untranslated jargon on the wire. The 05 ledger below is
  AMENDED IN PLACE for the changed seams; phase 06 consumes the amended
  entry and OPENS with two directed-rail judgments (the three-legged THROW
  residual; whether directed delivery should stamp boundTo). Full round in
  progress.md.
- 05 implemented AND reviewed: H5, H6, the coordinator-drift medium
  (broker custody extraction + the firewall tighten) closed; ledger entry
  below. A database-performance PRE-implementation checkpoint (BLOCK, five
  amendments) reshaped the design before any code; the three-reviewer
  round found three critical defects in the fix (the EPIPE rollback-proof
  hole, the ownership-order IDOR, the inverted restore-mail premise) plus
  two blocking test gaps, every finding applied and re-reviewed fresh.
- 04 QA COMPLETE (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4;
  gate GREEN at the final tip 8c1028e89d, full-suite fallback, all 8
  steps).
  Release/v0.37.0 synced (merge a43a1e8b52; the parity/command count-pin
  merge trap fired for real, pins re-derived from runs: IWorld 322/85/237,
  sends 199, dispatches 212; hud.ts ceiling 19177 after the
  crafting_deny_core extraction; game.ts ceiling 10859). The 04 ledger
  below is AMENDED IN PLACE for the QA round's changed seams (the reviewed
  sweep arm + confirmingOverdueSettlements split, the advisory-pass
  cooldowns, GUARD_IDLE = ESCROW_LOCK_TIMEOUT_MS, the signature shape
  check, the 720h confirming-hours clamp, the stuckBonds sample order, the
  lapse-straddle refresh guard, the poll-race standing answer, review in
  the settlement outcome arm); phase 05 consumes the amended entry.
  progress.md carries the full round (five lanes, deep mutation pass incl.
  one real hole closed, residuals with owners).
- Packet created 2026-08-11 from `review.md` (the 2026-08-11 three-repo review).
- 04 implemented AND reviewed (LOCAL, not pushed per R4): H4, H15, the
  anti-snipe medium, R8 both arms, and the 02 clearBuyNowLock handoff;
  ledger entry below. Six reviewer lanes ran (privacy-security,
  database-performance, test-coverage each TWICE; qa-checklist READY;
  migration-safety no critical/warning), every finding applied or owned
  across THREE fix rounds; 17 mutation spot-proofs bit; gate GREEN at
  0afdaa71a5 (full-suite fallback). A dedicated VERIFICATION session then
  re-ran the phase over the committed tree (fresh deliverables and
  test-coverage audit lanes, all three pg suites re-run green, three
  committed-round mutations re-bitten) and applied its findings as a
  further fix round: the route-level cancelPending wire pin (the one
  unpinned hop), typed confirm_in_flight on second/different signatures
  (both legs), the idempotent confirming-settlement retry, the lapseBid
  held-bond carve-out, the first-arrival extension anchor (kills the
  re-post creep), the cancelListingIfUnbid idle bound, the stuckBonds
  signature age axis, comment-stripped window pins via the extracted
  tests/helpers/strip_comments.ts, tunable literal pins (park delay and the
  anti-snipe trio), and the ledger corrections recorded in place. The fix
  round was re-reviewed fresh, which drove a second pass:
  outcome-answering retries of already-succeeded signatures on both legs,
  the leg-neutral confirm_in_flight copy (five fills refreshed), the
  held-survivor poll park, the split extension anchors (ruling recorded),
  the stuckSinceMs sample field, and the derived paid-subset pin
  (progress.md carries both rounds). Gate GREEN TWICE more (full-suite
  fallback, all 8 steps) at c7176d730b and at the final code tip
  6642c6e15b; eleven mutation proofs bit across the session. The H15 escape hatch that gated enable
  exists (the 'review' state). Items the DEDICATED phase-04-qa session still
  owns: re-judge the cooldown NUMBERS, the cancel-intent bid-block
  interpretation, the confirm_in_flight second-signature semantics, the
  stuckBonds axis change, and the confirming-hours no-upper-clamp posture
  (recorded in progress.md), and the R4 push. Deferred to
  phase 14 with owners: the anti-snipe deadline player-copy consequence, the
  cancel-intent client marker, the claim_cooldown remaining-time copy, and
  the after-close no-extension behavior note.
- 01 implemented AND QA'd (PASS-WITH-FOLLOWUPS, fixes applied, PUSHED).
- 02 implemented AND QA'd (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED at
  the QA tip; gate GREEN at 301a8c7c22); see the ledger below and progress.md
  for the QA round, the reasoned resolutions, and the phase 03/04 handoffs.
- 03 implemented AND QA'd (PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per
  R4). The AC3 park deviation is UPHELD (no integrity hole; Fernando can
  overrule, rationale in progress.md). The QA round's blocking finds (park
  rotation blinding the monitor; the unbounded redrive beat) are fixed; the
  03 ledger entry below was AMENDED IN PLACE for the changed seams (rotation
  column + exclusion, readout shape with asOfMs/saturated/updatedAtMs,
  per-entry contention scope, finalize re-lock + already_final, typed
  activateBid contention, ambiguous grantCopy refusal). Phase 04 consumes
  the amended entry, not the original.

## Repos and branches

| Repo | Worktree | Branch | Tip at packet creation |
|---|---|---|---|
| game | `/Users/fernando/Documents/wocc-marketplace` | `feature/woc-marketplace` | `a52da32c89` (merge of release/v0.37.0 at packet creation; the base moves at every session start, see Locked decisions) |
| service | `/Users/fernando/Documents/woc-rewards-service-pr31` | `integration/woc-market-settlement` | `70d4207` (= PR #31 tip) |
| dashboard | `/Users/fernando/Documents/woc-rewards-dashboard-pr13` | `integration/woc-market-trading` | `c001d4a` (= PR #13 tip) |

Pushes: game pushes fast-forward `origin/feature/woc-marketplace`; service pushes go to
`origin/feature/woc-market-settlement` (updates PR #31); dashboard pushes go to
`origin/feature/woc-market-trading-controls` (updates PR #13). Cadence per resolved R4:
QA sessions push on PASS; implement sessions never push (commands in
implementation-plan.md).

## Validation matrix

- Game, any code change: `npx tsc --noEmit` + the targeted `npx vitest run <files>` +
  `npm run ci:changed`.
- Game, `src/sim/` change: add `npx vitest run tests/architecture.test.ts`.
- Game, player-text or emit change: add `npx vitest run tests/localization_fixes.test.ts`
  (S3 guard; needs `npm run i18n:gen` first if i18n.status.json is missing; it is
  untracked and worktree-local).
- Game, wire/protocol change: add `npx vitest run tests/snapshots.test.ts tests/env_protocol.test.ts tests/bandwidth.test.ts`.
- Game, DDL change: boot the dev DB (`npm run db:up`) and run the marketplace real-SQL
  suites. Since 02 that concretely means
  `TEST_DATABASE_URL=postgres://eastbrook:<pw>@127.0.0.1:5433/eastbrook npx vitest run tests/woc_market_settlement_pg_integration.test.ts`
  (the suite creates and drops its own disposable database; without the env var it
  SKIPS green, so a green default-tier run is not evidence it ran).
- Game, monolith-listed file: `npx vitest run tests/monolith_budget.test.ts`.
- Game, pre-merge / end of phase: commit first, then `node scripts/gate_select.mjs`
  (gate needs a committed tree; it stops at the FIRST failure, run later steps by hand if
  a known red is being carried).
- Service (in `service/`): `npm run build` then `npm test`.
- Dashboard: `npm test`, `npm run check`, `npm run build`.

## Rulings

Resolved (Fernando, 2026-08-11):

- R1 (phase 13, B6): RESOLVED: wallet-signature step-up on custody-moving ops; delete
  the phantom TOTP scaffolding. Open sub-point for phase 13 session start: threshold
  posture (recommended: step-up on every custody-moving call).
- R2 (phase 09): RESOLVED: forfeited bonds follow the PRD treasury + burn split, one
  code path with the settlement fee split.
- R3 (phase 11, H3, resolved Fernando 2026-08-16, proposed and confirmed at the
  11 session start): SINGLE-VENUE posture, honestly stated. Grounds: no
  independent $WOC price discovery exists (every configurable venue is a lens on
  the same on-chain DEX pools); the only configurable-today second source,
  Jupiter's price API, publishes NO print time (the existing adapter stamps
  poll time, which under the oracle's newest-publish staleness key would make
  the whole oracle permanently un-stale with Birdeye frozen), and Birdeye's
  measured ~25-minute print cadence against a near-live second print would
  halt trading as venue_deviation on every 5% move between prints. Ruled:
  - Remove the dead Pyth venue path (pythSource) and its
    WOC_MARKET_PYTH_WOC_FEED_ID knob from bootstrap, compose, .env.example
    and docs; the oracle stays N-venue capable (median/deviation logic and
    tests kept; the cross-venue gate re-arms by itself when a second REAL
    source is ever constructed) but the inert WOC_MARKET_MAX_VENUE_DEVIATION_BPS
    env knob is retired (code default 500 bps stays; a knob for a gate that
    cannot arm is a false affordance; it returns with any future second venue
    and is re-judged against that venue's real behaviour then).
  - Staleness stays 3600000 ms (one hour): measured, not tightened; two
    tighter values halted the market on real prints (a 38-minute print is on
    record) and compose, oracle and source share the constant by design. The
    compensation is honesty: asOfMs becomes the newest venue PUBLISH time on
    the wire (the player's "as of" shows the print time, not the poll), and
    the ops surface reports per-venue age, configured and live venue counts,
    whether the cross-venue gate is armed, and the distinct-print count
    behind the TWAP.
  - Spot-vs-TWAP deviation TIGHTENS 1000 -> 500 bps (code constant; compose
    and .env.example stay blank so the constant rules): the sole automatic
    circuit breaker under one venue, the same disagreement bound the design
    already accepted between two venues, halving the walk a manipulator can
    push through per 15-minute window (about 18% -> 9.5% by the TWAP
    arithmetic); a legitimate 5%+ jump between prints halts until the TWAP
    converges, self-clearing within one window.
  - The PRD claim (docs/prd/woc/marketplace.md, "multiple approved liquidity
    sources, maximum source-deviation limits") is revised to the single-venue
    truth in this session's game-side docs commit (07 did not take it).
  - Observation for 22, not this phase: the real manipulation cost is set by
    WOC_MARKET_MIN_LIQUIDITY_USD against WOC_MARKET_MAX_USD_CENTS; no oracle
    bound fixes that ratio.
  AMENDED by the 11 review round (2026-08-16, the two fresh lenses plus the
  fresh re-review of the fix round; Fernando ruled the cold-boot item at the
  same session):
  - The walk arithmetic above assumed a continuous republisher AND that the
    gate caps the move; neither holds. The breaker is a HOLD-TIME cost: an
    out-of-bound print halts trading but is still recorded (deliberately, or
    a legitimate move would halt forever), so the average absorbs it and the
    halt clears within one window (about 2.5 minutes for a 6% step, 7 for
    10%, 13 for 50%); a manipulator must hold the moved price through the
    halt and the settlement that follows, against arbitrage. What the 1000 ->
    500 tightening buys is that moves between 5% and 10%, which used to pass
    silently, now cost a multi-minute halt. At the deployed cadence (Birdeye
    republishes $WOC on the order of tens of minutes against a fifteen-minute
    window) the window holds ONE distinct print for most of every cycle and
    the comparison is print-to-print. The tightening stands; the stated model
    is corrected in the code, the docs and here.
  - The env parser also caps the TIGHTENING direction (ORACLE_BOUND_RANGES:
    window up to an hour and never past the staleness ceiling, samples up to
    90, staleness down to the default window, spot down to 100 bps; decimal
    integers only), because an absurd tightening is a permanent halt
    indistinguishable from a broken venue.
  - "compose, oracle and source share the constant" is no longer the design:
    the ORACLE is the one judge of freshness, per venue (the market's Birdeye
    source hands up every print it can parse, VENUE_AGE_SCREEN_OFF_MS), so an
    over-age print is refused as stale WITH its print time instead of dying
    at the source as no_price with nothing to show (stale was unreachable in
    production under two equal ceilings). A stale print never enters the
    median; a stalled sibling can never ride a fresh one; a future print
    beyond the skew allowance or an unparseable publish time counts as no
    print.
  - Every oracle env knob may only TIGHTEN its code default (window longer,
    samples more, staleness shorter, spot narrower); a widening value falls
    back to the default. The effective bounds ride the health surface.
  - COLD BOOT, ruled by Fernando (2026-08-16): a freshly booted oracle holds
    one print with no predecessor to compare against, so for the first
    venue republish after a deploy the breaker reads zero and a print moved
    BEFORE the deploy is accepted as-is (pre-existing; made visible by
    distinctPrints). Ruled: RECORD AND DOCUMENT, NO GATE. A distinct-print
    gate would recreate the permanent-halt incident (steady state holds one
    print too) and a one-republish warm-up would halt the market for tens of
    minutes after every deploy. Runbook consequence (22): do not deploy or
    restart the service while a high-value settlement window is live without
    pausing the market first. The proper fix is a named follow-up: a durable
    last-accepted-print anchor that survives restarts, age-bounded so a long
    outage cannot halt the market forever (needs its own ruling; a candidate
    for a numbered phase per R7 or for 17's DB work).
  AMENDED by the 11 QA round (2026-08-16, the eight-lane audit and its fix
  round; principle unchanged, values re-sized): the tightening floors the
  review round chose were sized to the window alone, and the audit showed a
  LEGAL tightening could halt the market for the tail of every republish
  cycle (staleness floor 15 min at a 25-to-38-minute cadence), reset the
  breaker at any thirty-minute gap, or park a quiet realm on a permanent
  insufficient_samples (sample floor 90 at the 10 s heartbeat's real-world
  lateness). The floors are now sized from the venue cadence: staleness down
  to 45 minutes (three windows; the observed 38-minute print stays fresh and
  ceiling plus window keeps the breaker-reset gap at an hour), samples up to
  60 (two thirds of the window's heartbeat capacity). Every knob whose
  effective value differs from what the environment asked for is named in a
  boot warn line. The refusal arms report the poll-clock window through a
  non-mutating view, and the recovered operator line carries the window
  depth it reopened on, so a breaker reset is visible in the log.
- R4 (all phases): RESOLVED: push after each QA PASS (or PASS-WITH-FOLLOWUPS with fixes
  applied), repos the pair touched; implement sessions never push; FAIL pushes nothing.
  Exact push commands live in implementation-plan.md commit rules.
- R8 (phases 04/06, resolved Fernando 2026-08-12): the public buy-now
  claim-then-abandon loop gets BOTH arms, no strikes:
  - Cooldown: after an account abandons (or times out) a public buy-now lock,
    it cannot re-claim THAT listing for a cooldown, plus a small account-wide
    abandons-per-hour cap that triggers a broader claim cooldown. The phase
    proposes the numbers; QA re-judges them. Public abandons still carry no
    strike (strikes stay reserved for real payment defaults; directed-sale
    abandons keep their existing strike).
  - Cancel-intent: a seller's cancel on a LOCKED listing marks it
    cancel-pending instead of refusing: no NEW lock claims from that moment,
    the current holder keeps their full window, and an unpaid expiry closes
    the listing cancelled (return flight home) instead of relisting. Bounds
    the seller's worst-case cancel denial at exactly one lock window. Compose
    with the 02 liveness guards (a PAID window proceeds to settlement as
    usual; cancel-pending must never tear a live settlement) and the 02
    handoff that clearBuyNowLock carries no holder guard.

Still open (a phase that hits one asks at session start):

- R5 (phases 09/10/21): the chain-wiring operational decisions. The two 09
  items are RESOLVED (Fernando, 2026-08-14, proposed and confirmed at the 09
  session start):
  - SOL fee funding and monitor: the releaser preflights fee plus rent against
    the escrow's SOL (refuses insufficient_sol_fee, bond stays held and
    retryable); the admin overview reports the balance and flags it under
    WOC_MARKET_ESCROW_MIN_SOL_LAMPORTS (default 0.05 SOL); funding stays a
    MANUAL op (no automated cross-wallet top-up).
  - ATA rent on refund: the ESCROW pays it (idempotent create funded by escrow,
    rent joins the preflight), so the bidder is always made whole in full; the
    bounded griefing exposure (about 0.002 SOL per bond cycle via account
    re-closing) is accepted and visible through the low-SOL monitor.
  The two 10 items are RESOLVED (Fernando, 2026-08-14, proposed and confirmed
  at the 10 session start):
  - Verifier commitment level: the existing split is RATIFIED and pinned.
    Verification MATCHES at 'confirmed' (the incident-driven read: a
    finalized-level getParsedTransaction returns null for tens of seconds
    after broadcast, indistinguishable from absence, and once cost a real
    player their payment); crediting (the settled write) requires 'finalized'
    observed via signature status, and the releaser/probe paths stay
    finalized-only. Both levels become code-owned exported constants, NO env
    knob (lowering the credit bar is a money-safety foot-gun; precedent:
    code-owned MAX_REPLACEABLE_AGE_MS). The pending answer vocabulary
    SPLITS: matched-at-confirmed-awaiting-finality keeps awaiting_finality;
    nothing-visible-yet answers a distinct stable reason, so a fabricated
    signature is distinguishable on the wire. That is the service half of
    the anti-snipe fabricated-signature residual assigned to 10; the game
    adopts the distinction in 12 (extension only on the matched arm).
  - Confirming timeout: FIVE HOURS, code-owned MAX_CONFIRMING_AGE_MS,
    applied through the existing expiry sweep seam. Deliberately UNDER both
    6h bounds: the game's poll receives the service's stable terminal
    verdict before its own H15 review park fires (review stays the genuine
    service-unreachable backstop), and the terminal call lands while RPC
    signature history can still decisively answer a re-verify. A timed-out
    confirming row goes EXPIRED, never rejected, so the ledger-proven
    adoption arm remains the recovery path and the bound is money-safe even
    against a real payment unobserved for the whole window. Values noted
    here for 21 per the 10 spec.
  Still open: devnet mint choice (21).
- R6 (phase 07, B7): counsel owns final Terms language. The phase produces drafts and a
  decision memo; counsel sign-off is a launch gate tracked here, not a packet deliverable.
  STATUS 2026-08-13: package READY, recorded SENT-TO-COUNSEL (the send is
  `TERMS_AND_CONDITIONS_MARKETPLACE_DRAFT.md` plus the decision memo, held
  privately at `/Users/fernando/Documents/woc-counsel/counsel-decision-memo.md`
  outside the public repo; Fernando forwards them).
  Sign-off remains the launch gate; the memo's enable-time checklist (the R9
  affordance for BOTH surfaces: the trade panel and the Exchange checkbox's own
  terms link, the seller terms gate if counsel confirms, the R2 forfeit split plus
  its client disclosure, terms.html/privacy reconciliation) enumerates what must
  land before R6 can flip to granted. NOTE (07 QA, 2026-08-13): the QA round
  amended the draft after this status was recorded (second-chance offer,
  pause honesty, bond-custody carve-out, and sibling fixes; see the 07
  ledger's QA ROUND bullet), so the copy forwarded to counsel must be the
  amended draft at the QA tip.
- R7 (scope adds, unanswered 2026-08-11): Fernando was offered four deferred
  nice-to-haves as packet phases and did not select any: dispute-case UI, marketplace
  player wiki/guide page, game-side audited runtime pause, numeric reserve guard. They
  stay in the follow-ups queue; if he opts any in later, add it as a new numbered phase
  before phase 21 and update progress.md and the plan table.
- R9 (phases 07/14/22, raised by the 06 QA round 2026-08-13): the trade window's
  $WOC arm records IMPLIED terms consent. Both its money sends (the offer create,
  and the pay arm since it shipped) hard-code acceptTerms: true while the panel
  renders no terms text or link, and guardTerms durably RECORDS the acceptance,
  so a buyer who never opened the Exchange gets a stored consent row that later
  backs strikes and suspensions. Inert while WOC_MARKET_ENABLED stays off.
  Options: (a) keep the posture and land a panel terms affordance (the Exchange
  window's checkbox is the model) before enable; (b) have the panel send the
  player's real choice once 07's terms drafts exist. Either way the pre-enable
  audit (22) must not pass while the panel records consent it never showed.
  07 owns the terms drafts, 14/15 own the panel surface.

## Locked decisions

- Base: `feature/woc-marketplace`, already merged up to release/v0.39.0 (sync merge
  f5df042a86 of tip d2d1a8ad5c, 2026-08-15). Every game phase
  re-syncs the latest `release/**` at phase start; service/dashboard phases re-sync
  `origin/master`.
- Packet docs live in the game repo only; service and dashboard phases are specified here
  and executed in their own worktrees.
- COUNSEL MATERIAL STAYS OUT OF THE PUBLIC REPO (Fernando, 2026-08-13): the game repo is
  open source, so the counsel decision memo lives privately at
  `/Users/fernando/Documents/woc-counsel/counsel-decision-memo.md` and is referenced from
  packet and shipped docs by pointer only, never committed. The Terms DRAFT itself stays
  public (clearly bannered; a ToS is public by nature). Any future counsel-bound
  document follows the same rule. Before every push, confirm no counsel file entered
  the branch.
- The custody/settlement lifecycle fixes land as focused phases 02 to 06 (the review's
  "one change" recommendation, split along test seams to keep sessions small; QA between
  each keeps the shared root cause honest).
- i18n: English-only via the sanctioned pending mechanism during the packet; release
  fills are maintainer release work. The 3,255 pending Latin fills the review counted are
  NOT packet debt.
- UI bar: DESIGN.md is the design-language standard; the marketplace must look like a
  beautiful classic MMORPG window family (Fernando, 2026-08-11: this is a HUGE part of
  the game). Phase 15 is the dedicated beautify pass (padding/tokens, no truncation,
  formatted numbers and times, readable images, stress captures); its QA requires
  Fernando's eyeball sign-off on the screenshot set.
- Every session starts by entering its worktree (SESSION START block at the top of every
  phase and QA file) and syncing: game from the newest `origin/release/**`, service and
  dashboard from `origin/master`. Prompts pasted into fresh sessions rely on this.
- CLAUDE.md upkeep: every phase updates the nearest local CLAUDE.md its diff makes stale
  (concise, anchor rule, no bloat; create a small top-level one in the service or
  dashboard repo if absent); every QA verifies it.

## Known gotchas carried from the review session

- The count-pin merge trap keeps firing: after the v0.38.0 re-sync the run-derived
  totals are send 200, dispatch 213, IWorld 324 (86 data + 238 methods), unchanged by
  the v0.39.0 sync (f5df042a86: no conflict and no silent auto-merge on either pin
  file, the release touched none of src/world_api, src/net/online.ts, server/game.ts;
  re-confirmed by running tests/command_schema.test.ts + tests/world_api_parity.test.ts
  on the merged tree). If a later
  release merge conflicts (or silently auto-merges) there again, re-derive from a
  suite run, never take either side's number.
- `npm run i18n:build` does NOT run `i18n:scan`; the S3 guard needs `i18n.status.json`
  present (full `npm run i18n:gen` creates it). Bit the review session at push time.
- (RESOLVED by 01) `hud.ts` was monolith-RED until the p2p controller extraction;
  the gate no longer carries a known red.
- The marketplace test set on the game branch was 866 passing at packet creation; the
  full suites: game 1524, service 413, dashboard 131.
- Dashboard `npm audit`: 11 vulnerabilities at review time (phase 19 owns it).
- kickSession argument order: the branch fixed a wire/log swap (c0955c6126) that
  the RELEASE still carries on its own tree; the v0.38.0 merge kept the branch's
  fixed order. A future release merge must not re-apply the release's order
  (the second argument crosses the wire to the player).

## Findings-to-phase map (from review.md)

- B1 -> 02. B2a -> 02+03. B2b, B2c -> 03. B3 -> 09. B4 -> 10. B5 -> 08. B6 -> 13. B7 -> 07.
- H1, H2 -> 18. H3 -> 11. H4 -> 04. H5, H6 -> 05. H7 -> 01. H8 -> 12. H9 -> 02.
  H10, H12, H14 -> 06. H11 -> 16. H13 -> 14. H15 -> 04.
- Mediums: fake-only SQL -> 20. Fee-split divergence + forfeit burn -> 09. Bond
  double-pay -> 09. Stuck-custody monitor -> 03 (+ dashboard view 19). Compose default,
  fail-open configs -> 08. Anti-snipe unpaid-bid extension -> 04. DB scale (indexes,
  retention, lock_timeout) -> 17. i18n error surfaces + currency -> 14. Dashboard cluster
  -> 18+19. validateReleaseRequest regex -> 18. Service bond-quote usdCents -> 09.
  createDirectedOffer guardBalance + directed auto-close + bond-size ownership -> 06/09.
  UNIQUE(listing_id) sale invariant -> 02. Env documentation + health rail -> 12.
  Browser-only gate server posture -> 13 (note in scope). Coordinator drift (sim
  extraction, firewall regex) -> 05. Doc staleness -> 07. Runbook -> 22.

## Per-phase ledger (append as phases complete)

- 11 oracle-health (2026-08-16, SERVICE repo, session start 8da6c03 = the
  10 QA tip, origin/master already contained at df09756; 5 commits, tip
  03df5de, LOCAL not pushed per R4; validation npm run build + npm test in
  service/, 590 tests 583 pass 0 fail 7 env-gated skips default tier and
  590/590 zero skips with CLAUDIUM_TEST_DATABASE_URL, baseline was
  560/553/7). The registry the 11-qa session needs:
  - R3 RULED AND IMPLEMENTED (see Rulings, incl. the review-round
    amendments; game commit e2f189e9a4 recorded the ruling BEFORE code):
    single-venue posture. bootstrap.ts: pythSource gone, sources =
    [birdeyeSource] (or the dev price), VENUE_AGE_SCREEN_OFF_MS exported (the
    market's BirdeyePriceOracle gets Number.MAX_SAFE_INTEGER as maxAgeMs: it
    screens envelope shape, the liquidity floor and future skew only; the
    ORACLE judges age), ORACLE_HEARTBEAT_MS exported. oracle.ts:
    DEFAULT_MARKET_ORACLE_CONFIG.maxSpotDeviationBps 500 (was 1000),
    maxVenueDeviationBps code-owned (marketOracleConfigFromEnv ignores the
    env; every other knob may only TIGHTEN, and only within
    ORACLE_BOUND_RANGES: window [15 min default, 1 h] and never past the
    staleness ceiling, maxAge [default window, 1 h default], minSamples
    [3, 90], spot [100, 500]; decimal integers only; a widening value falls
    back to the default, an absurd tightening clamps to the range).
    MAX_ORACLE_SAMPLES 3600 hard-caps the buffer (oldest out under request
    load). compose and .env.example: the Pyth feed knob and the
    venue-deviation knob removed, spot left blank; compose_conformance.test.ts
    pins both files three ways plus every numeric oracle knob in .env.example
    against the code constants.
  - FRESHNESS (deliverable 3): MarketPriceHealth.asOfMs = the newest FRESH
    venue publish time clamped to the poll clock (never the future; healthy
    and refusals; on an all-stale reading the newest print judged, with the
    spot those prints imply and the standing average still on the readout;
    null only when no venue priced); price() and estimate() carry it (the
    game renders it as "as of {time}"); a PAUSED refusal on either surface
    carries MarketPriceOracle.latest()?.asOfMs, the heartbeat's last reading,
    and never polls the venue (pausedAsOfMs in service.ts).
    Per-venue judgement inside health(): priced requires finite usdPerUnit >
    0, finite publishMs > 0, publishMs <= nowMs + MAX_ORACLE_FUTURE_SKEW_MS;
    ageMs = max(0, now - publish); fresh = ageMs <= maxAgeMs; only fresh
    prints enter the median and the deviation gate; a stale venue is listed
    with price, age and fresh:false; all-stale answers 'stale'. Samples stay
    POLL-stamped for the mean (identical arithmetic in-window; a
    publish-keyed warm-up count would halt a slow republisher), carry the
    newest fresh publish for distinctPrints, and insert in observation order
    (concurrent polls can land inverted; the prune walks from the head).
  - SURFACE (deliverable 4): diagnostics gains distinctPrints, bounds
    (window, maxAge, minSamples, both deviation bounds), venues[] as
    MarketVenueReading {name, usdPerToken, publishMs, ageMs, fresh},
    configuredVenues, liveVenues (= the median array length, passed in, so
    crossVenueGateArmed = liveVenues >= 2 can never claim an armed gate the
    code would not fire); admin.ts overview.price mirrors every field
    (typed, MarketVenueReading re-exported).
  - ONE INSTANCE (deliverable 1, already fixed in 08): pinned in
    market_bootstrap.test.ts under t.mock.timers (setInterval only): prime +
    ticks + reads sample arithmetic in the market's own diagnostics; the
    quiet-period test (20 min of idle heartbeat > the 15 min window, next
    request healthy on price and estimate); the negative control (stop hook,
    mocked time still ticks, venue reads stay flat, then insufficient_samples);
    the structural belt (comment-stripped, whitespace-tolerant count of
    `new MarketPriceOracle(` in the compiled module = 1).
  - OPERATOR SIGNAL: src/market/price_gate_signal.ts createPriceGateSignal
    (halted: reason + newest print age, floored at zero; still halted:
    reason change; recovered: duration + reason), fed by the heartbeat only
    (one poll in flight at a time, the sweep's guard, so edges arrive in
    order), edge-triggered like the sweep warn; a boot logs the honest
    warm-up pair (insufficient_samples then recovered; an alert keyed on the
    halted line must expect it). Pinned directly
    (market_price_gate_signal.test.ts) and through the real wiring (60
    anchored ticks, a 6% print halts once, stays silent, recovers with
    duration; a stalled poll suppresses the next tick's poll).
  - REVIEWS: two fresh lenses on the three-commit diff (security/ops: 14
    findings, 0 blocking; correctness: 21 findings, 1 blocking = the
    cold-boot item, RULED record-and-document), every finding applied or
    judged; the fix round a616f73 was re-reviewed FRESH (18 findings, 0
    blocking, 8 should-fix + 10 nits; the load-bearing ones: the venue-fetch
    mock leaked across the file via MockTracker restore order, the sample
    buffer had no count cap, the tightening direction was unbounded, the
    paused quote path polled the venue, the heartbeat lacked the sweep's
    in-flight guard, and the "5% per publication" claim overstated the
    breaker); its round 03df5de closed by careful self-review (narrow,
    test-covered, 11 mutants bit).
  - JUDGED, no code change (do not re-raise): the cold-boot single-print
    exposure (Fernando: record and document, no gate; runbook note for 22;
    the durable anchor is a named follow-up needing its own ruling); a
    min-span warm-up gate (same decision); the TWAP-equals-last-print
    steady state at the deployed cadence (a doc truth, not a gate change:
    the breaker is a per-publication step limiter); the boot warm-up warn
    pair (honest, two lines per deploy); the structural construction scan is
    belt-only (the sample arithmetic is the decisive pin; a factory wrapper
    would evade the scan, not the arithmetic); the two-parser split
    (positiveInt vs num) is moot for age now that the source does not parse
    the knob; distinctPrints keys on the newest fresh publish per reading
    (documented; a per-venue evidence count is a multi-venue concern the
    posture excludes); the warmed() test helper duplicated in two files (rule
    of three, the repo's own rule); the fix-round commit subject at 82
    columns (style only, the repo requires scope and body); the double
    floating rounding of a multi-sample average (0.0010000000000000002 for a
    steady 0.001 over real-clock spans; the dev-chain pin compares within
    1e-12; the base-unit rounding downstream is pre-existing and unchanged).
  - DEFERRED with owners: 19 (dashboard) renders venues[].ageMs and fresh
    from the SERVICE (its priceVenueRows still derives age from the browser
    clock), crossVenueGateArmed (today "Venue spread: -" is indistinguishable
    from agreement), distinctPrints beside samples, and bounds; 14 (UX
    honesty) re-judges the game copy "Current rate: about {tokens} $WOC per
    USD, as of {time}" now that the time is the venue print (may read oddly
    beside a 45-minute-old time; "venue print" wording is the candidate); 12
    (game wire): nothing owed, asOfMs stays number|null and the game passes
    it through (the dev proxy stamps now(): dev-only twin), noted for
    awareness; 21 (devnet): observe the halted/recovered lines against the
    real venue, confirm the real Birdeye updateUnixTime semantics (last
    trade) and that no false `stale` appears at the real cadence under the
    one-judge design; 22: the manipulation economics (WOC_MARKET_MIN_LIQUIDITY_USD
    25k against WOC_MARKET_MAX_USD_CENTS $100k per quote: a 5% move on a
    $25k pool costs hundreds and is worth $5k on a $100k settlement; the
    reviewer's fix candidate: tie the quote ceiling to the venue's OBSERVED
    liquidity, which birdeye_price.ts already reads), the runbook (pause
    before deploying during a live high-value settlement; the two halt lines
    per incident and the warm-up pair at every restart), and the cold-boot
    anchor follow-up ruling (recorded in the service's TODOS.md too); 17 (DB)
    is the natural home if the anchor is ruled in.
  - RED-FIRST REGISTRY for the QA red-proof lane (reproduced before their
    fix on the 8da6c03 build): (1) asOfMs on the wire and in health = the
    poll clock; (2) a Pyth feed id alone constructs a market; (3) the venue
    knob honored (999999 accepted) and spot at 1000 (a 6% jump passed); (4)
    compose carried WOC_MARKET_PYTH_WOC_FEED_ID and
    WOC_MARKET_MAX_VENUE_DEVIATION_BPS; on the a616f73^ oracle: (5) a print
    24h in the future accepted healthy; (6) a two-hour-old print entering
    the median beside a fresh venue (spot 0.0015 off 0.002 and 0.001); (7)
    no bounds/fresh on the surface; (8) a widening env value accepted; on the
    03df5de^ code: (9) a stalled heartbeat poll stacked behind the next tick;
    (10) a paused estimate polled the venue; (11) a print inside the skew
    allowance logged a negative age. The one-instance claim's red form is
    structural (fixed in 08): the private second oracle mutant fails four
    tests by name.
  - 11 QA ROUND (2026-08-16, PASS-WITH-FOLLOWUPS, every finding applied or
    judged with the file open, 5 commits 03df5de..270e337, PUSHED per R4;
    suite 590 to 595, 588 + 7 env-gated skips default, 595/595 zero skips
    with CLAUDIUM_TEST_DATABASE_URL; the fix-round chain was REWORDED via a
    local-only rebase for commit-message attribution, content unchanged:
    trees 5236897=cda1277, 9c60aa9=7209c52, b865c56=2246046, 5a97aa9=ee19b1c,
    so round evidence citing the old hashes cites identical trees). The
    registry 12 consumes:
    - VERDICTS over 8da6c03..03df5de: red proof 11/11 REPRODUCED-RED on the
      named old builds; mutation: the QA registry named 42 mutants (the
      implement round's 41 plus the .env.example min-samples drift), 41 BIT,
      ONE SURVIVED (the admin overview hardcoding
      crossVenueGateArmed false: the only wire pin asserted false under a
      single-venue rig), closed by a two-venue overview arm and re-proven;
      44 findings, 0 blocking. Registry annotation for any by-name re-run:
      two pins were deliberately renamed by the fix round ('a print the
      VENUE SOURCE accepts is never rejected by the oracle as stale' is now
      'a 38-minute print inside the one ceiling prices healthy end to end
      through the real venue source'; 'recovery logs once with the duration
      and the reason it recovered from' now ends 'and the window depth').
    - FIXES at symbol level: ORACLE_BOUND_RANGES re-sized from the venue
      cadence (maxAgeMs.tightest 3 windows = 45 min, minSamples.tightest 60;
      the R3 amendment note in Rulings records the rationale); read()
      reports refusal windows through the non-mutating windowSamples(nowMs)
      view (samples / distinctPrints / twapUsdPerToken mean what they say
      beside reason: stale, and a spuriously future clock cannot destroy
      state; the stale-spell pin asserts both); marketOracleConfigFromEnv
      gains a warn callback naming every knob whose effective value differs
      from what was written (range clamp, widening fallback, junk, the
      window-outruns-ceiling invariant quoting the operator's raw text, the
      retired cross-venue knob), wired to console.warn in buildMarketApps;
      createPriceGateSignal's recovered line carries the window depth
      (samples and prints; new PriceGateReading type) and floors the
      duration at zero; MarketAdminOverview.price gains spotUsdPerToken and
      twapUsdPerToken; the oracle header states the sub-bound compounding
      corollary and the recording-gap predecessor exposure (cold boot, venue
      silence past ceiling plus window, outage, liquidity-floor dip: one
      recorded class).
    - PINS CLOSED (16 round-2 mutants BIT in two groups, plus the four
      rework pins BIT by compiled-dist mutation at the final tip): cap
      eviction direction (oldest out, price-step fixture), off-default
      bounds all five fields, literal tight ends with the cadence and margin
      asserts, parser warn lines exact incl. the two-line clamp-plus-outrun
      case, exact skew and staleness boundary edges, both healthy 38-minute
      venue rows, the env-to-surface bounds arm through buildMarketApps, the
      two-venue overview arm (armed flag, median spot AND twap by value),
      paused settlementQuote and the cold-pause null, request reads not
      moving the operator signal, MAX_ORACLE_SAMPLES and
      VENUE_AGE_SCREEN_OFF_MS as literals, the .env.example discovery sweep
      in compose_conformance.
    - JUDGED, no code change (do not re-raise): the structural construction
      scan stays belt-only (re-affirmed); the boot warm-up pair's 10s/20s
      arithmetic assumes a quiet healthy-venue boot (the doc says so); the
      compose and template sweeps see bare line-anchored numerics only
      (house style, tolerable until the template grows commented values);
      the future-print venue row stays nulls (the real source screens future
      prints to null before the oracle sees them, so the row cannot carry
      what never arrives; the host-clock runbook note covers diagnosis);
      commit subjects near 80 columns (ruled class).
    - DEFERRED with owners (amends the implement round's list): 19
      (dashboard) also renders spotUsdPerToken / twapUsdPerToken beside the
      deviations and the recovered line's depth vocabulary if it surfaces
      logs; 16 (game hot path) plus 22 (economics) own the recorded SEC-9
      mechanism: request-path reads record oracle samples and the game
      proxy's estimate cache is keyed per usdCents, so a client varying the
      amount can shorten the effective averaging window under the sample cap
      (candidates: heartbeat-only recording or a per-second recording
      limit); 22 also owns the adapter body-timeout observation (the venue
      fetch timeout covers headers only; a stalled body parks every poll on
      undici's default for minutes, fail-closed) alongside the runbook, the
      economics and the cold-boot anchor ruling; 21 (devnet) observes the
      halted/recovered lines now carrying the window depth, and the real
      Birdeye updateUnixTime semantics; 14 unchanged (the as-of copy); 12
      unchanged (nothing new owed; asOfMs stays number|null pass-through).
- 10 chain-verifier (2026-08-14, SERVICE repo, session start 02713f2 = the
  09 QA tip, origin/master already contained at df09756; 6 commits, tip
  ba7df0b, LOCAL not pushed per R4; validation npm run build + npm test in
  service/, 536 tests 530 pass 0 fail 6 env-gated skips default tier and
  536/536 zero skips with CLAUDIUM_TEST_DATABASE_URL, baseline was
  508/502/6). The registry the 10-qa session needs:
  - B4 CLOSED, sufficiency plus necessity: settlement_proof.ts
    (service/src/market/) adds two pure checks the verifier runs after the
    leg checks and before the payer-debit check: burnedBaseFor (a real SPL
    Token burn of the quoted mint NAMING the quoted payer under either
    jsonParsed authority label, burn and burnChecked, both token program
    labels, inner instructions flattened, amounts summed, malformed amount
    strings parse to 0n) and unexpectedCredit (reverse walk of the delta
    map; any positive delta outside payer-plus-expected refuses). Reasons:
    burn_missing (no burn of the quoted mint under the payer), burn_mismatch
    (wrong total), unexpected_credit; the wrong-mint settlement stays
    leg_mismatch, so the acceptance bar's triple is pairwise distinct.
    Check order legs -> burn proof -> whitelist -> payer debit; order
    affects reasons only, never admission (conjunctive refusals).
  - R5 RULED AND IMPLEMENTED (see Rulings; game commit 71f36c695f recorded
    the ruling BEFORE code): MATCH_COMMITMENT 'confirmed' /
    CREDIT_COMMITMENT 'finalized' (solana_chain.ts, code-owned, no env
    knob), behaviorally pinned (the fake connection records the read
    commitment; the three-status finality matrix pins crediting).
    MAX_CONFIRMING_AGE_MS five hours (quotes.ts, code-owned): both stores'
    expirePastDue gain a confirming arm (to expired, reason
    confirming_expired, submittedSignature preserved so entry adoption
    stays the recovery path), pending arm first with the budget shared,
    oldest expiry first in both stores; pg gains the
    woc_market_quotes_confirming_due partial index and outer status+due
    guards on BOTH arms (the pre-existing pending arm was subselect-only
    and could expire a concurrently settled row under EvalPlanQual).
    buildMarketApps now drives expiry with a one minute unref'd interval
    (stopExpirySweep beside stopOracleHeartbeat): expireStaleQuotes
    previously had ZERO production callers, so NOTHING expired quotes on a
    live deployment, pending rows included.
  - VOCABULARY SPLIT (the anti-snipe service half): confirm's undecided
    arms answer the verifier's own reason (not_yet_visible on the live
    chain; dev arm surfaces its dev_chain_* words by design) and
    awaiting_finality is reserved for the MATCHED arms plus the reason-less
    fallback and the raced stored-row answer. pending:true is unchanged, so
    the game wire is compatible today.
  - REVIEWS: two fresh lenses on the final diff (security: 1 should-fix +
    7 nits, 0 blocking; correctness: 1 should-fix + 9 nits + 1 observation,
    0 blocking), every finding applied or judged; the fix round ca568cc was
    re-reviewed FRESH (1 should-fix + 3 nits + 1 observation), its round
    ba7df0b closed by careful self-review (narrow, test-covered,
    mutation-proven).
  - THE REFUTED REFUTATION (the round's big lesson, judged with the parser
    argument in view): the fix round removed the multisigAuthority
    acceptance arm on an on-chain-impossibility rationale; the fresh
    re-review proved the rationale FALSE (agave's jsonParsed picks
    authority vs multisigAuthority purely by the instruction's account
    count while the token program's single-owner branch ignores trailing
    accounts, so multisigAuthority-equals-payer is an ordinary, executable,
    honestly-paid burn) and the removal would have terminally rejected real
    money (rejected rows never re-verify). ba7df0b restored the arm
    (either label must NAME the quoted payer; economics forced by the
    delta and debit checks) with positive and negative pins.
  - JUDGED, no code change (do not re-raise): owner-less token balance rows
    stay invisible to the delta map and whitelist (refusing would convert
    an RPC quirk into terminal rejections of real payments; not
    attacker-reachable via transaction shape on an honest RPC; documented
    at the site); delegate-authorized burns stay refused fail-closed
    (documented; the built transaction burns under the owner); the
    edge-triggered status-outage warn accepts flap noise (hysteresis would
    add clock state for log cosmetics); unref on the sweep interval is not
    directly asserted (matches the heartbeat's accepted standing); pg tie
    order under equal expires_at_ms is unspecified and may transiently
    differ from the memory store under a binding budget (converges next
    sweep; commented).
  - JUDGED SURVIVOR (mutation, recorded): deleting the pg pending-arm
    ORDER BY fails nothing because the planner's partial-index scan order
    coincides with sorted order on this table shape; the pin IS decisive
    against real order regressions (the DESC variant bites by name) and
    the clause is correct-by-construction. Fifteen other mutants BIT by
    name under full-suite runs (list in progress.md).
  - DEFERRED with owners: 12 (game wire) owes tolerating and localizing
    the new reasons (not_yet_visible pending; burn_missing, burn_mismatch,
    unexpected_credit terminal; confirming_expired is ops-visible only,
    terminal entry answers 'expired') and gating the anti-snipe extension
    on the matched arm (awaiting_finality), closing the fabricated-
    signature residual; 21 (devnet) verifies the jsonParsed label
    assumptions against a real RPC (spl-token-2022 label string, the
    multisigAuthority count-labeling, burnChecked info shapes) and
    exercises the burn proof end to end per the wiring doc's test plan; 22
    re-judges the pre-existing uncaught getParsedTransaction throw (a full
    RPC outage rejects out of confirm through the route as a 500; distinct
    from the degraded-statuses arm the new warn covers) and the inherited
    connectionTimeoutMillis note. The game review-state resolution arms
    (H15's review -> confirmed / review -> failed) can now build against
    the service's stable five-hour verdict: that stays with 12/14 as
    already registered.
  - RED-FIRST REGISTRY for the QA red-proof lane (all reproduced before
    their fix, on the 02713f2 build): (1) burn-redirect, (2)
    short-burn-with-redirect, and (3) extra-credit-rider each verified
    MATCHED by the old verifier (the B4 exploit class; five more vectors
    were reason-contract reds); (4) the confirming five-hour bound
    (expireStaleQuotes returned 0 and the row stayed confirming, service
    and pg arms both); (5) the pg schema pin for the confirming-due index
    red at 02713f2; (6) both vocabulary-split arms (unseen and
    terminal-entry undecided answered awaiting_finality). The sweep
    driver's red form is structural: expireStaleQuotes had no src caller
    at 02713f2 (grep evidence), and stopExpirySweep fails tsc there.
  - 10 QA ROUND (2026-08-15, PASS-WITH-FOLLOWUPS, every finding applied or
    judged with the file open, 5 commits ba7df0b..8da6c03, PUSHED per R4;
    suite 536 to 560, 553 + 7 env-gated skips default,
    560/560 zero skips with CLAUDIUM_TEST_DATABASE_URL). The
    registry phase 11 consumes:
    - THE MULTISIG CALL, judged with the parser and the token program open
      (agave parse_token.rs parse_signers: 'multisigAuthority' iff
      accounts.len() > 3, no multisig-existence check; spl-token
      validate_owner's non-multisig branch ignores the trailing slice;
      process_burn passes it; a fee payer must be system-owned so a real
      multisig can never be keys[0]): ba7df0b's restoration is CORRECT and
      money-safe; refusing the label terminally rejects honestly-paid burns.
      Also from parse_instruction.rs: agave labels BOTH token programs
      'spl-token', so 'spl-token-2022' is a defensive alias it never emits
      (comment and test trued; the 21 label check narrows to "confirm the
      alias is inert on the chosen RPC").
    - FIXES at symbol level: MarketChainVerifier.isPlausibleSignature (new
      interface member; live = isSolanaSignatureShape from the new
      service/src/market/signature_shape.ts, base58 to exactly 64 bytes,
      dependency-free; dev = true), screened by
      MarketSettlementService.plausibleSignature BEFORE the first write on
      the live confirm path and at confirmTerminalEntry (invalid_signature /
      the stable terminal, no write, no verify call): a junk string used to
      500 through getParsedTransaction's -32602 and read to the game as
      service_unavailable, the abandon-ledger and anti-snipe exemption
      verdict (SEC-2, cross-repo griefing rail closed on the service side;
      the game's WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS premise now holds).
      solana_chain.ts verify: the leg loop skips owner === payer (a
      self-transfer nets to nothing; the debit check's netting branch, dead
      until now, pins it; reachable when the treasury wallet buys),
      burnedBaseFor(instrs, mint, null) counts any-authority burns so a
      foreign-authority burn answers the NEW reason burn_authority_mismatch
      (refusal unchanged, only named), console.warn names the stray wallet
      on unexpected_credit, add() skips non-string owners. quotes.ts /
      store_pg.ts expirePastDue return 0 for limit <= 0. bootstrap.ts
      sweep: edge-triggered failing/recovered warn. admin.ts
      attention.confirmingExpired24h (its own read through the new
      MarketQuoteFilter.terminalReason filter in both stores). The fix-round
      re-review's own belts (2c2ae78): bondQuote refuses the escrow wallet as
      a bidder (self_dealing) and the verifier's payer-leg skip is gated on
      owesOthers (another leg or the burn must keep the debit equation
      binding; the all-self-legs shape refuses leg_mismatch), the
      stray-credit warn is once per memo and clamps the RPC-supplied owner,
      the sweep chain gains a trailing catch and an in-flight guard, and the
      null-authority burn pass counts only attributed burns. Docs:
      MAX_CONFIRMING_AGE_MS is measured
      from quote EXPIRY; the five-under-six ordering is a deployment
      precondition (WOC_MARKET_QUOTE_TTL_MS well under one hour, unclamped;
      game WOC_MARKET_CONFIRMING_REVIEW_HOURS at or above six); the second
      horizon is release_protocol's MAX_REPLACEABLE_AGE_MS (the "RPC history
      prunes around six" premise contradicted it); the recovery caveat once
      the game acted on a terminal answer (out-of-band re-confirm of the
      preserved signature; the overview counter is the operator's cue); the
      confirm vocabulary table; treasury-rotation knob note; first-sweep
      backlog deploy note.
    - PINS CLOSED (mutation-proven, 21 mutants BIT over the committed fix
      round; the four implement-round survivors now bite): pg sweep outer
      status guards BOTH arms under a real lock-wait race, confirming arm
      ORDER BY, shared budget remainder, catalog indexes, non-positive
      budget; payer_mismatch on its own; the real wallet-emitted shape;
      leg over-credit; batched settlements; 2^53 exactness and the uiAmount
      decoy; delegate burn / delegate-funded leg; owner reassignment;
      treasury-as-buyer; authority-mismatch word; stray log; recovery warn
      once; reserved matched-arm word both entries; rejected reason on the
      row for every B4 word; every confirming-expired entry arm; the
      preserved signature in the memory store; a rejecting sweep swallowed,
      cadence kept, warned once; the ops rail counter and listing reason.
    - JUDGED, no code change (do not re-raise): balance-row BigInt throw
      on a malformed amount stays a retryable throw (documented at the site;
      22's RPC-defect policy item, with I24 malformed envelopes and the
      lenient/canonical amount asymmetry); relayer / fee-sponsored
      transactions are payer_mismatch by design (21 real-wallet note); the
      null-owner add() skip is unpinnable (identical outcome); Q5e two-memo
      one-payment is the 09 index's case; D21 PRD sentence pre-existing,
      game-side; SEC-6 refuted as the registered 12 handoff; the EPQ comment
      refutation accepted in substance (EvalPlanQual re-checks the LAST
      committed version); SEC-11 treasury rotation is pre-existing and out
      of range (documented in the knob table, 22 runbook).
    - DEFERRED with owners (amends the implement round's list): 12 (game
      wire) owes tolerating and localizing burn_authority_mismatch alongside
      burn_missing / burn_mismatch / unexpected_credit (terminal) and
      not_yet_visible (pending), gating the anti-snipe extension on
      awaiting_finality (and reading a live verifier's awaiting_finality as
      "the ledger showed the payment"; the reason-less fallback and raced
      stored-row arms also emit it but are unreachable by a fabricated
      signature), and considering a game-side signature regex tightening
      (the service now decides shape, so it is optional); 12/14 own the
      game's revisability of a bid or settlement it lapsed or failed on a
      confirming_expired verdict the service later adopts (the ops overview
      counter is the operator's cue; the review-state arms are the seam);
      18/19 (dashboard) may render attention.confirmingExpired24h (additive
      field); 21 (devnet) verifies the shape screen against a real wallet
      flow (fee-sponsored / gasless wallets would be payer_mismatch), the
      inert 'spl-token-2022' alias, the multisigAuthority count-labeling and
      burnChecked info shapes, exercises the burn proof end to end, and
      carries the first-sweep backlog deploy note; 22 owns the RPC-defect
      policy (uncaught getParsedTransaction throw, malformed balance rows
      and envelopes: retryable 500 vs terminal), the treasury-rotation
      runbook rule (or persisting the treasury wallet on the quote), and the
      connectionTimeoutMillis note. Ruling text note for R5 (SEC-10): the
      confirming bound is also the length of a free price option for a buyer
      who pre-submits a durable-nonce signature and broadcasts only if the
      price moves; bounded now at expiry plus five hours where it was
      unbounded, worth weighing if the TTL or bound ever changes.
- 09 bond-releaser (2026-08-14, SERVICE repo, session start aa44873 =
  the 08 QA tip, origin/master already contained at df09756; 9 commits,
  tip 3346878, LOCAL not pushed per R4; validation npm run build + npm
  test in service/, 493 tests 488 pass 0 fail 5 env-gated skips default
  tier and 493/493 zero skips with CLAUDIUM_TEST_DATABASE_URL, baseline
  was 445/441/4). The registry the 09-qa session needs:
  - B3 CLOSED all-or-nothing: WOC_MARKET_ESCROW_JSON becomes a retained
    signer; SolanaMarketBondReleaser (service/src/market/
    bond_releaser_solana.ts) adapts the settlement rail's prepared
    machinery with the verbatim signer-equals-escrow guard re-checked at
    prepare, the R5 fee+rent preflight, and broadcast of exactly the
    persisted bytes; shared instruction assembly (transfer_instructions.ts)
    with the unsigned builder so the paths cannot drift. buildMarketApps:
    live chain without the key refuses (red-proven); the generic gate
    covers the override bag too (code-only allowReleaserlessChain is the
    single seam that may construct a releaserless market, the runtime
    release_not_wired refusal's only reachable path); MarketApps.releaseRail
    ('override'|'dev'|'live'|'none', derived from the resolved instance)
    pins the wiring; probe set = every configured RPC endpoint.
  - DOUBLE-PAY CLOSED (both classes reproduced red on the pre-protocol
    path: crash-after-broadcast retry re-sent; concurrent refund+forfeit
    both paid). The protocol (release_protocol.ts): prepare durable-free,
    ONE claim CAS settled->releasing persisting direction + signed tx +
    attempt start + attempt-signature trail BEFORE broadcast,
    probe-before-resend on retry (finalized adopts without re-send;
    active/unknown refuse; replaceable re-prepares keyed on the OLD
    signature, age-bounded), direction-guarded signature-keyed finalize
    that clears the signed blob and keeps the trail. Guards live in each
    statement's WHERE on the row's own columns (EvalPlanQual-safe); the pg
    suite proves one claim winner under a real blocked interleave and pins
    every CAS arm.
  - THE GUARDED UPDATE + ADOPTION (two sequential blockers found by the
    review rounds, both red-proven): quotes.update(quote, expectedStatus)
    refuses when the row moved (a late confirm could revert a finalized
    release and re-arm the sweep: the stomp); confirm's settled write then
    gained ADOPTION arms (expired, superseded: states no money ever left)
    because the ledger-proven payment outranks an unpaid terminal, else a
    sweep/supersede landing in confirm's read-verify-write gap abandoned a
    paid bond as nothing_collected; any other refusal re-reads and answers
    in the entry checks' exact vocabulary. Stomp pin intact: releasing/
    refunded/forfeited/rejected stay immovable.
  - AMOUNT OWNERSHIP: bond-quote takes bidCents; ONE clamped policy
    (peg.ts clampedBondCentsForBid: ceil bps, WOC_MARKET_BOND_MIN_CENTS
    100 / WOC_MARKET_BOND_MAX_CENTS 5000, never above the bid); optional
    caller echo usdCents refused on mismatch with bond_amount_drift, the
    refusal CARRYING the expected bondCents so a knob change cannot strand
    a bid; response carries bondCents; marketFeeSchedule and the overview
    fees gained the clamp pair. R2 forfeit split: splitForfeitProceeds
    (same module, same ceil/remainder discipline, 7:3 of the whole bond at
    defaults, exact-sum) feeds legs treasury + burnBase burn; refund moves
    the exact base units whole.
  - R5 RULED AND IMPLEMENTED (see Rulings): preflight refusals
    insufficient_sol_fee; overview attention gains releasing count,
    escrowSolLamports, tri-state escrowSolLow (null = unmeasured, never
    "fine"); one-shot boot warning under the floor; admin quote rows gain
    releaseTo, releaseClaimedMs, releaseAttemptSignatures (the
    reconciliation handle; the signed blob never leaves the service).
  - REASON VOCABULARY (wire, game passes through): bond_amount_drift,
    release_in_flight, release_direction_conflict, release_unverifiable,
    release_unavailable, destination_account_unsupported,
    insufficient_sol_fee, not_configured, release_failed, send_failed;
    dev chain adds dev_chain_transaction_superseded /
    dev_chain_unknown_transaction. routes.ts refusal() now typed to
    WireQuoteResponse and carries signatureRequired.
  - AGE BOUND: MAX_REPLACEABLE_AGE_MS (release_protocol.ts, 6h,
    code-owned constant) refuses to trust a replaceable verdict for an
    attempt older than the bound (RPC history prunes; an old "absent"
    stops being evidence); replaceReleasePrepared refreshes the clock so
    recovery across replace cycles measures the CURRENT attempt. The
    age-parked case has its own operator remedy documented in
    MARKET_CHAIN_WIRING.md (reconcile by the attempt trail), distinct from
    the inside-bound release_unverifiable case (second, genuinely
    independent RPC endpoint; independence is an operator obligation the
    code cannot verify).
  - REVIEWS: two fresh coverage lenses (security: 18 findings, 1 blocking;
    correctness: 14 findings, 2 blocking) then a FRESH re-review of the
    two fix-round commits (1 blocking + 5 should-fix + 5 nits), every
    finding applied or judged with the file open; the final two commits
    were closed by careful self-review (narrow, test-covered). Reviewer
    PoCs independently reproduced both double-pay classes; the pg
    claim-CAS mutant (status guard removed) was BIT.
  - JUDGED, no code change (do not re-raise): single-endpoint 'finalized'
    trust in combineProbeStates matches the confirm path's RPC trust model
    (quorum-for-finalized would wedge single-RPC deployments; commitment
    policy is 10's charter); retry pacing/attempt caps belong to the
    game's sweep (04's cooldowns; the attempt trail gives visibility);
    livePendingByMemoRef stays (pre-existing, pg-tested, no src caller);
    a raced REJECTED write leaves an expired/superseded row terminal-unpaid
    with a slightly different reason string (a mismatched signature proves
    nothing about payment, no adoption); the sum asserts in peg.ts are
    defense-in-depth by construction (commented as such).
  - PRE-EXISTING EDGE registered, not this session's regression: confirm
    on an ALREADY-expired/superseded row answers the terminal reason at
    entry without consulting the ledger, so a buyer who signed before
    expiry and broadcast after is told terminal while the money reached
    escrow; QA/10/21 judge the remedy (probing the chain for expired
    quotes on confirm).
  - DEFERRED with owners, the LOUD one first: phase 12 (game) MUST adopt
    the bond-quote contract BEFORE any deploy of the service ahead of the
    game (today the game sends usdCents only, so its bond quoting would
    refuse invalid_amount): send bidCents, adopt the response's bondCents
    (also present on drift refusals), retire or demote woc_market_rules.ts
    bondCents() to render-only (its round-half-up disagrees with the
    service ceil at half-cent boundaries), and decide the pre-quote
    display source (the service exposes the clamp only on the admin
    overview; a game-facing schedule read may be wanted). DEPLOY-ORDER
    COUPLING is a Fernando note for the eventual rollout. Also to 12: the
    game dev economy's floor-based 90/3 split (woc_market_proxy.ts) vs the
    service ceil rule; health.ts RAIL_KEYS.marketplace still names
    WOC_RPC_URL + MARKET_KEEPER_KEYPAIR_JSON, keys the market never reads
    (the wiring doc carries the KNOWN DRIFT note). To 21: dev chain probe
    never answers active/unknown (fidelity note; devnet exercises the real
    states). To 22 pre-enable audit: whether the age bound deserves an env
    knob and whether an audited manual-adopt lever for parked releases is
    wanted; probe-endpoint independence in the deploy runbook. Production
    pg pools still carry no connectionTimeoutMillis (inherited 08 note;
    NOT addressed this session, the release path is chain-bound not
    pool-bound; 10/22 re-judge).
  - RED-FIRST REGISTRY for the QA red-proof lane (all five reproduced
    before their fix): (1) the four ownership behaviors against the old
    bondQuote; (2) crash-after-broadcast re-send and (3) refund-vs-forfeit
    both-paid on the pre-protocol path; (4) live-chain-without-key built;
    (5) the late-confirm stomp and (6) the terminal-adoption abandonment,
    both in-suite. The throwaway pre-protocol red file was deleted after
    recording; its two cases live on as the crash/race suite against the
    new seam.
  - 09 QA ROUND (2026-08-14, verdict PASS-WITH-FOLLOWUPS, tip 02713f2,
    PUSHED per R4; the registry additions phase 10 consumes):
    - ENTRY ADOPTION shipped (confirmTerminalEntry in service.ts): the
      registered paid-after-expiry edge is CLOSED. A ledger-proven finalized
      payment adopts an already-expired or already-superseded quote at
      confirm entry through the same guarded adoption write as the mid-call
      arms; a matched-but-unfinal payment answers awaiting_finality; an
      UNDECIDED verdict answers awaiting_finality only inside
      MAX_LATE_PAYMENT_VISIBILITY_MS (service.ts, ten minutes past expiry,
      code-owned) and the stable terminal answer past it; a decided mismatch
      stays terminal and writes nothing; refunded/forfeited/rejected never
      re-verify at entry. QA was the named judge on this edge and ruled
      fix-now; 10 no longer owes the confirm-side remedy. The residual half
      (a buyer the game never re-polls for) remains with 12's contract
      adoption.
    - NEW confirm reason: signature_already_settled (terminal). The
      settled-signature uniqueness now fails TYPED on both stores: the
      memory store carries the same one-credit-per-signature check the pg
      partial index enforces, throwing the pg 23505 shape, and both
      settled-write sites catch exactly code 23505 with constraint
      woc_market_quotes_settled_signature (the constraint NAME is
      load-bearing and pinned in real SQL; renaming the index would turn
      the refusal back into a 500). Reachable via a crafted transaction
      carrying two memo instructions matching two identical-leg quotes;
      previously an unhandled 500 the game re-read forever.
    - JUDGED, no code change (do not re-raise): the confirming-write
      boolean in confirm() stays deliberately UNCHECKED (its refusal must
      fall through to verification or the mid-call adoption arms never see
      the payment; commented at the site); the double-signed-memo residual
      (two distinct transactions, one memo) stays reconciliation-only and
      is documented in MARKET_SETTLEMENT.md; the terminal-row verify RPC
      cost is accepted (internal tier; bounding it risks re-opening the
      abandonment; front-door rate limiting stays with 22); the
      MEMO_PROGRAM_ID/tokenProgramForMint duplication across
      settlement/claudium is a follow-up chore; the whitespace-only admin
      actor passing the empty gate is pre-existing.
    - DEFERRED adds: 12 (game wire) also owes tolerating TWO settled quotes
      for one memoRef (superseded adoption makes it legitimate: the old
      adopted quote and the fresh one, each backed by its own payment; the
      game bond ledger must key on the reference). Everything else in the
      earlier DEFERRED bullet stands.
    - Smaller contracts added: marketRpcEndpoints (bootstrap.ts, exported,
      membership-pinned: every configured RPC endpoint joins the probe set,
      deduped, claudium precedence); admin actor bounded to 200 code points
      at intake (server.ts adminActor); compose_conformance now pins the
      COMPLETE WOC_MARKET_* shadow set with a self-enforcing discovery
      sweep (a new shadowed compose knob fails until it joins the table);
      the in-memory livePendingByMemoRef answers newest-first like pg.

- 08 service-auth-hardening (2026-08-14, SERVICE repo, session start 70d4207
  = PR #31 tip, origin/master already contained; 12 commits, tip 4b9e413,
  LOCAL not pushed per R4; validation npm run build + npm test in service/,
  439 tests 435 pass 0 fail 4 env-gated skips, baseline was 413). The
  registry the 08-qa session needs:
  - B5 CLOSED: service/src/http_guard.ts (requestPath, requestQuery,
    secretsMatch, printableAscii) is the one interpretation of a request
    target; server.ts hands the normalized path to every gate AND every
    handler (handler signatures now path + URLSearchParams; market
    routes.ts matchers take the normalized path). isOpsOnlyPath is
    EXPORTED with membership pinned both directions; the two exact-match
    ops entries (refund, clawback) are served by handleClaudium/handleNative
    with cross-reference comments at both ends. Bypass red-proof recorded:
    refund?x=1 with internal secret alone returned 200 on the old routing.
    NO decoding, NO slash collapsing, NO fragment stripping by design
    (gates and handlers compare the identical string; unrecognized shapes
    404 with both secrets, socket-pinned; the two wallet-segment captures
    exclude '#', the only routes where a fragment survived to a handler).
  - SECRETS: length-guarded timingSafeEqual both tiers (mirrors the game
    server pattern); env values trimmed with printable-ASCII checked on the
    RAW value FIRST (a Unicode-space or newline pad refuses loudly at boot
    instead of being trimmed into a secret no client can send; the message
    names padding; .env.example documents it); unset internal secret
    throws, unset or whitespace-only admin secret 503s; space-padded
    secret authenticates its transported form (pinned); boot-refusal tests
    ride a helper that closes an unexpectedly started server (a regression
    fails by name instead of hanging the file); readout limits normalized
    at the edge via intParam (garbled/zero/empty fall back, pinned; the
    stores clamp too).
  - FAIL CLOSED: service/src/dev_env.ts explicitlyDevOrTest (NODE_ENV
    exactly development or test; unset refuses) with ALL THREE escapes on
    it: the market dev chain, CLAUDIUM_ALLOW_IN_MEMORY, and
    CLAUDIUM_ALLOW_FAKE_STRIPE (the third found by the fix-round reviewer
    still on the not-production denylist). buildMarketApps refuses a null
    pool unless the CODE-ONLY overrides.allowInMemoryStores test seam is
    set (config-unreachable; the explicit null pool buildEconomyApps
    passes through refuses too), so an enabled market requires
    DATABASE_URL. All refusals red-proven on the old gates.
  - COMPOSE + ORACLE: WOC_MARKET_PRICE_MAX_AGE_MS compose default 120000
    -> 3600000 = DEFAULT_MARKET_ORACLE_CONFIG.maxAgeMs with the
    permanent-halt WHY beside it; pythSource imports the constant;
    MARKET_SETTLEMENT.md's stale 30-minute prose trued to one hour. REVIEW
    BONUS BUG FIXED: bootstrap constructed TWO MarketPriceOracle
    instances, the heartbeat and boot prime warmed one while
    MarketSettlementService quoted from the other (the exact false outage
    the heartbeat exists to prevent); now one shared instance, red-proven
    by the min-samples-2 priming arm.
  - REVIEWS: two fresh coverage lenses (security: socket probes over every
    exotic target shape, no bypass survives; correctness: mutation-proved
    the bypass pin), fix round 1 re-reviewed fresh, fix round 2
    re-reviewed fresh (mutation-verified every new pin, incl. proving two
    then-unpinned behaviors, both closed in round 3), round 3 (docs,
    comments, tests only) careful self-review. Every finding applied
    including nits.
  - JUDGED, no code change (do not re-raise): bond-refund/bond-forfeit on
    the internal tier is BY DESIGN (the game drives its own settlement
    lifecycle; destinations resolve from the STORED quote, never the
    request, so a compromised game server could grief-forfeit but not
    steal; the routes.ts header now says exactly this and that the
    admin-exclusive levers are pause + the audited read surface); the
    webhook's query-string variant adds no pre-auth surface the bare
    path lacks (signature-verified either way); NODE_ENV=test stays in
    the allowlist (the phase spec prescribes dev/test); the security
    lens's "recover records anonymous money moves" was REFUTED in part
    with the file open (an empty actor refuses execution as
    invalid_request; 'unknown' lands only on refused audit rows); a
    duplicated admin-actor header is recorded verbatim as joined
    (self-inflicted by an admin-secret holder); limit=0 on
    credits/recoveries now falls back to the default instead of one row
    (pinned).
  - DEFERRED with owners: the oracle stamps TWAP samples with nowMs, not
    the venue's publishMs, so a FROZEN print re-samples itself and
    spot-vs-TWAP can never fire, and the default config is single-venue
    so the venue-deviation gate is structurally inert: BOTH to phase 11
    (its charter is oracle health, venue posture, quote timestamps; feeds
    R3). Front-door rate limiting and a secret entropy floor: 22
    pre-enable audit (compose binds loopback by default; matters if
    ECONOMY_BIND=0.0.0.0 for the remote dashboard). The purchases
    fromMs/toMs and cosmetics/recoveries cursor params are still
    untested (the limit plumbing IS pinned): service test debt, 21/22.
    Production pg pools carry no connectionTimeoutMillis: note for 09. A
    genuinely NEW money route omitted from isOpsOnlyPath remains a
    review-time matter (the membership pin plus the CLAUDE.md rule are
    the guards).
  - Service repo gained a top-level CLAUDE.md (auth contract, fail-closed
    gates, validation commands). ARITHMETIC CORRECTION by the QA round: the
    range's baseline ran 417 tests (413 passing), so the growth is 417 to
    439 totals; the original "was 413" conflated the pass count with a
    total.
  - 08 QA ROUND (2026-08-14, verdict PASS-WITH-FOLLOWUPS, every fix applied;
    FOUR commits on 4b9e413, tip aa44873, PUSHED per R4; suite 445 tests
    441 pass 0 fail 4 env-gated skips; 12 + 2 mutation proofs bit). Fixes the
    round added on top of the implement range: DATABASE_URL required unless
    NODE_ENV affirms dev or test EVEN WITH NO MONEY RAIL (the un-flagged
    in-memory fallback was the one denylist-shaped gate left; red-proven);
    the partial-Stripe coherence refusal fires outside dev/test, message
    /partial Stripe configuration/ (unset NODE_ENV might BE production);
    CLAUDIUM_ALLOW_IN_MEMORY and CLAUDIUM_ALLOW_FAKE_STRIPE trimmed like
    the dev chain's flag; printable-ASCII checked raw-first on BOTH secrets
    before the emptiness decision (Unicode-whitespace-only now refuses
    loudly by name on either secret); admin space-pad-authenticates and
    newline/NBSP refusal pins; usdc malformed-percent 400 pin; NEW
    service/test/compose_conformance.test.ts (compose staleness default
    equals DEFAULT_MARKET_ORACLE_CONFIG.maxAgeMs, NODE_ENV: production
    pinned, CLAUDIUM_QUOTE_TTL_MS 600000-vs-60000 documented deliberate and
    pinned with its WHY); allowInMemoryStores unreachability pinned through
    env-flag shapes AND the real buildEconomyApps call site; timingSafeEqual
    presence pin scoped to the secretsMatch body; "outside production" test
    renamed to the allowlist contract; MARKET_SETTLEMENT.md bond-lifecycle
    and CLAUDIUM_WOC_REFERENCE_MAX_AGE_MS truth-ups (that knob's CODE
    default falls back to CLAUDIUM_ORACLE_MAX_AGE_MS, one minute; the hour
    lives in the deployed env); MarketRouteDeps deleted; escape-hatch
    comments say every consumer and the trim contract; .env.example and
    CLAUDE.md carry the service-wide DATABASE_URL rule.
  - 08 QA RE-REVIEW of the fix round (fresh lane, 0 blocking, 7 should-fix,
    8 nits, ALL applied in the fourth commit aa44873): the money-rail
    DATABASE_URL arms had gone vacuous under the loose regex the new
    railless gate also satisfies (deleting the rail gate stayed green;
    fixed with specific messages plus the one shape only the rail gate
    catches, mutation-proven BIT); the compose NODE_ENV pin passed on a
    commented-out line (anchored active); the quote-TTL "pinned both
    sides" claim had no code-side pin (DEFAULT_CLAUDIUM_QUOTE_TTL_MS now
    exported, shared by both builders, imported by the test); the compose
    walk-up accepted a stray ancestor compose (anchored on the .git
    sibling); stripeCheckoutMode gained its untested 'real'-in-production
    arm; docker-compose.yml now REQUIRES DATABASE_URL at interpolation
    (the :? form, replacing a silent in-container crash loop);
    .env.example gained the commented NODE_ENV=development knob (commented
    on purpose: shipping it live would arm the escape flags on a copied
    prod .env) and lost its pre-existing em dash; MARKET_SETTLEMENT.md now
    states the forfeit destination truthfully (the CONFIGURED treasury;
    refund from the stored quote; neither from the request) and the
    service-wide database rule; consumer enumerations went count-free
    (five explicitlyDevOrTest call sites now: three escapes plus two
    strictness gates). DEPLOY NOTES for Fernando before this reaches
    production: (1) confirm the live .env sets DATABASE_URL, since both
    compose interpolation and the boot now require it; (2) an admin secret
    of only non-printable whitespace now refuses the whole boot where it
    used to leave the service up with a 503 ops tier.
  - 08 QA JUDGED, no code change (do not re-raise): health?x=1 answers 200
    where the raw compare 404ed (uniform normalized contract, pinned on
    purpose); a second literal '?' follows the RFC reading where old
    per-handler splits truncated (comment records it); the DATABASE_URL
    construction test's internal pg.Pool has no teardown (the env-DSN
    branch is the pin's point; pg connects lazily; a pg change surfaces as
    a loud timeout); the timing pin stays textual, function-scoped, with
    the behavioral RangeError case as the true guard.
  - 08 QA NOTES for later phases (game side, from the v0.38.0 sync audit):
    i18n release-fill debt at the merged tip is SIZED (re-counted after
    the v0.39.0 sync, f5df042a86): 3450 pending rows, all
    marketplace-owned (the release side is at zero pending since the
    v0.38.0 fill, 1ca5e2515a): hudChrome.wocMarket 1995, hudChrome.trade
    660 (hudChrome.trade.woc.tabGold pending in every non-English locale),
    apiError.woc_market 600, entities.letters 135, hudChrome.plurals 60;
    composition is 229 rows in each of the 15 Latin-script locales plus 3
    hudChrome.trade.woc rows (pricePlaceholder, tabGold, tabWoc) in each
    of zh_CN, zh_TW, ko_KR, ja_JP, ru_RU (maintainer release fill per the
    locked decision; 22's pre-enable audit should carry the number). The release dead-code sweep deleted wallet_e2e.mjs
    and four market *_shot.mjs scripts; wallet_e2e was the only
    live-Postgres proof a freed wallet can relink to another account, so
    20/21 own restoring that proof as a real-SQL test.
    scripts/trade_money_shot.mjs was restored (branch-owned pins reference
    it). Release-owned defect surfaced to Fernando in the session wrap:
    server/ad_spend.ts answers 400 with raw English err.message instead of
    a stable ERROR_CODES key (invisible to the parity pin, unlocalizable).
    Phase 13: the TOTP rows moved to error_codes.ts around lines 263/265
    (the phantom-TOTP premise itself re-verified true). Phase 15: the
    screenshots directory is docs/screenshots/woc-market, and any NEW
    screenshot slug must join the FIVE sparse-cone blocks in
    .github/workflows/ci.yml plus the SPARSE_CONE literal in
    tests/ci_workflow.test.ts in the same change or CI test jobs cannot see
    the files. Phase 22: the CI required-check contexts were all renamed
    (dbe8ffd28e); re-derive before PR prep. Phases 12 to 16: after the
    v0.39.0 sync (merge f5df042a86 plus the bf7aeb8a98 extraction) hud.ts,
    sim.ts, and game.ts sit at EXACT zero headroom (19120, 12508, 10818)
    and main.ts sits ONE line under its 11490 ceiling (11489; the merge
    itself landed main.ts nine over and bf7aeb8a98 moved the Exchange
    attach to src/game/woc_market_wiring.ts rather than raise, so any
    further main.ts line owes an extraction); the budget test also forbids
    sitting more than 400 lines UNDER a ceiling, so large extractions must
    lower their ceiling same-change.
    New release-side rules that bind future game phases: any player-visible
    sanction follows src/sim/moderation/CLAUDE.md; every aura-wipe site
    routes through the aurasSurvivingDeath / aurasSurvivingCleanSlate
    seams; npm run gate takes a machine-wide loopback lock (GATE_NO_LOCK=1
    opts out) while gate_select does not. v0.39.0 (f5df042a86) adds:
    Hud.update(paint) has a paint cut (hud.ts `if (!paint) return;`, the
    exact above-cut call list pinned by tests/hud_update_drive.test.ts
    'the hidden-frame paint cut'; new per-frame non-paint work goes above
    the cut AND into that list, paint work stays below); main.ts frames are
    gated by src/game/presentation_gate.ts (gate.render / gate.paint,
    hud.update(false) on hidden desktop frames); every ws-importing
    scripts/**/*.mjs needs a row in tests/world_auth_scripts.test.ts
    (scripts/woc_market_shot.mjs already has one) and sends chat and /dev
    cheats only through chatCommandMessage from scripts/lib/world_auth.mjs,
    never a top-level { t: 'chat' } frame; tests/helpers/strip_comments.ts
    is the release's lookbehind helper now (the branch's copy was
    superseded; every branch consumer's verdict is unchanged); the Armory
    catalog is warmed nowhere (docs/design/armory-preview-warming.md) and
    src/ui/preview_prewarm_wiring.ts composes paperdoll + portrait only.
- 07 policy-terms-drafts (2026-08-13, session start 8a1739d67a = the trivial
  release/v0.38.0 sync (30 commits, GPU-hitch + night-lighting + OTA trains,
  no marketplace overlap; monolith_budget AUTO-MERGED: renderer.ts ceiling
  13708, lowered by the release's own fire-light extraction; all four
  count-pin suites re-derived from a run, 377 green, no re-pin needed);
  DOCS ONLY, zero code diff; LOCAL, not pushed per R4). The registry later
  sessions need:
  - DELIVERABLES: `TERMS_AND_CONDITIONS_MARKETPLACE_DRAFT.md` (repo root,
    beside the UNTOUCHED live Terms; complete revised document; new Section
    10 with the R9 acceptance-surface requirement at 10.3 and a proposed 18+
    floor at 10.2; old 10 to 22 renumbered 11 to 23, every cross-reference
    verified; `[COUNSEL]` marks judgment passages); the decision memo
    (adopted position, nine counsel questions, exact-changes list,
    enable-time checklist), held PRIVATELY at
    `/Users/fernando/Documents/woc-counsel/counsel-decision-memo.md` per the
    Locked decision below; the never-power carve-out consistent across README
    (Highlights AND Web3), wallet-link.md, holder-cosmetic-flair.md, and
    marketplace.md launch gate 1; staleness fixes in marketplace.md,
    p2p-woc-trade.md, DESIGN.md, malware-scan-catalog.md, the
    release-malware-audit and privacy-security-review agent docs, and the
    docs/, src/net/, src/ui/ CLAUDE.md files. Deed/reliquary "never power"
    lines verified to govern a DIFFERENT system and left alone.
  - SELLER TERMS GAP (new finding, memo question 1): only the paying paths
    run `guardTerms` (`placeBid`, `buyNow`, `createDirectedOffer`);
    `createListing` and the seller's directed accept record and require NO
    acceptance, so a seller can escrow and sell having never accepted, while
    draft 10.2/10.3 promise seller acceptance. If counsel confirms the
    draft, 13/14 own the gate and the 22 pre-enable audit must verify it
    (the memo's enable-time checklist carries it beside R9).
  - FORFEIT DESTINATION: R2 decided treasury+burn (one code path with the
    fee split) but the service routes forfeits ALL-TREASURY today (the
    review's fee-split divergence, 09 owns closing it). Draft 10.5 states
    the split, so Terms publication gates on 09's implementation PLUS a
    client forfeit-destination disclosure (the bid-bond note says only
    "forfeited"); both recorded in the memo checklist.
  - TERMS.HTML DRIFT: `public/terms.html` is hand-maintained and has drifted
    from `TERMS_AND_CONDITIONS.md` independently of the marketplace (its
    acceptable-use section is a different, longer text with NO real-money
    bullet at all). Publication is a reconciliation, not a copy-across; the
    privacy pair (`PRIVACY_POLICY.md` + `public/privacy.html`) owes the
    marketplace data classes and retention windows at the same moment (memo
    question 9), plus the section 14 rescope: its "has no connection to
    your account data" token sentence goes false once marketplace rows tie
    $WOC activity to accounts.
  - DEFERRED WITH OWNERS (docs-only scope kept them out): the 20
    `docs/i18n/README.*.md` locale files carry pre-carve-out Web3 wording
    (four claim sites each, with pre-existing Highlights drift): maintainer
    release fill via the i18n-locale-fill skill, NOT packet debt;
    `server/db.ts`'s bank-entitlement comment cites "the $WOC PRDs pin
    cosmetic-only" language the PRDs no longer use (next code change that
    touches it); the guide catalog's "No pay to win, ever" line joins the
    recorded P2 wiki/guide follow-up; the privacy-security-review agent's
    Scope Gate still omits the `woc_market*` modules (tooling follow-up);
    DEPLOY.md has zero WOC_MARKET env/runbook coverage (12/22 own);
    `.env.example` misses `WOC_MARKET_SERVICE_URL` and
    `DASHBOARD_INTERNAL_SECRET` and still documents the dead TOTP knob
    (12/13 own). marketplace.md now records R1's supersession of TOTP; the
    phantom scaffolding inventory for 13's deletion list: the two
    `woc_market.totp_*` error codes, their api_error catalog rows and locale
    fills, `.wm-totp` CSS, the commented `.env.example` knob.
  - VALIDATION: copy floor clean over every added line; anchor rule held;
    `npm run ci:changed` exit 0, zero errors; zero code diff (fifteen .md
    files: thirteen package files plus the two ledger files; the QA round
    corrected the original fourteen count). FRESH proofreader over the whole package: 1 blocking (draft 10.5
    pointed at a marketplace-interface disclosure that does not exist) + 7
    should-fix + 6 nits, EVERY finding applied. The proofreader also
    verified the renumbering reference-by-reference and the factual claims
    against code (guardTerms call sites, no TOTP anywhere under
    woc_market*, handToBuyer grant-with-mail-fallback, the review state's
    driverless transition pair, the cap counting both halves).
  - Handoffs: 07-qa verifies the package (docs-only: no repo reviewers per
    the dispatch rule; re-run the claim greps and the internal-consistency
    sweep). 14/15 build the trade-panel terms affordance against draft
    Section 10.3's language. 22's pre-enable audit gains the memo's
    enable-time checklist. R6 is recorded sent-to-counsel in Rulings.
  - QA ROUND (2026-08-13, verdict PASS-WITH-FOLLOWUPS, every fix applied,
    PUSHED per R4; session start 55c2ba992e = the trivial release/v0.38.0
    re-sync, two CI-harness commits, no marketplace overlap, no count-pin
    surface). Eight fresh audit lanes (fix-site re-verify,
    completeness-vs-code, claim greps, overpromise, cross-doc consistency,
    renumbering, anchor rule, fresh proofreader); the unreviewed
    proofreader-fix round verified clean site by site against code. The
    round's own finds, ALL applied:
    - DRAFT vs SHIPPED MECHANICS (one blocking + siblings): Section 10.5
      now discloses the seller opt-in second-chance offer (an outbid
      runner-up can be promoted at their own bid with a fresh settlement
      window; a still-held or refund-pending bond is re-held and
      forfeitable, a returned bond never; strikes apply on default;
      [COUNSEL]), the anti-snipe extension, and the buy-now abandon
      cooldown pair; 10.4's cancel sentence trued (any standing bid
      refuses, including a bond still being paid; a cancel during an
      unpaid buy-now window is the automatic cancel-intent; support waits
      out in-flight payments) and bid withdrawal scoped to signed bonds
      (abandonBid exists for unsigned pending bonds); the bound-items
      sentence scoped to boundTo copies (the eligibility policy tolerates
      soulbound mounts and noMarketList plates by design); 10.6's pause
      paragraph trued (settlement windows keep running, broadcast
      payments still verify and deliver; [COUNSEL] for the tolling
      question); 10.7 gained the round-up-per-leg rounding, the
      listing-time wallet identity, and addresses-visible-on-chain (they
      are published nowhere else); Section 9's money bullet carves the
      bid bond out of "we never hold your funds" ([COUNSEL]: the bond IS
      operator-held player money between placement and return or
      forfeit); the change summary now discloses the survival-list
      expansion and the [COUNSEL] flag on old Section 16.
    - COMPANION TRUTH-UPS: marketplace.md's third TOTP site (Open
      questions) reads superseded-by-R1 and drops the phantom "shipped
      as configuration" claim; "bidding suspensions" corrected to
      marketplace-wide; the eligibility bullet's store-catalog
      consultation replaced with the real WOC_MARKET_EXCLUDED_ITEM_IDS
      mechanism (the service merge is specified, not built); wallet-link
      "server-built" corrected to "service-built" (the malware-audit
      invariant hangs on that word); README's "sells no items" scoped to
      not-a-party-to-any-marketplace-sale (the Claudium store sells
      items); the p2p Landed row's literal cap count replaced by the
      knob name; the src/ui CLAUDE.md Exchange bullet no longer holds
      the checkbox up as a compliant model (it owes its own terms link).
    - NEW DEFERRED WITH OWNERS (code surfaces a docs phase cannot touch):
      the Exchange window's terms checkbox owes a terms link or
      presentation before enable per draft 10.3 (14/15 own beside R9;
      memo question 1 already describes the gap to counsel); the auction
      default arm strikes and forfeits with NO oracle-health gate while
      strikeDirectedBuyer health-gates, so a winner locked out by a
      pricing pause can be struck for the outage (14 owns the gate
      decision, 22 audits); the pausedBanner copy ("no sale settles
      until pricing is healthy again") and sellFeeNote's flat "90
      percent to you" both overstate vs the trued draft (14 owns); no
      bidder-facing disclosure that a listing is offer-next (14 owns);
      woc_market_rules.ts's excludedItemIds comment repeats the phantom
      store-catalog merge and its strikes comment still says "bidding
      suspensions" (next code change touching either); the cascade
      re-quote arm the woc_market.ts cascade comment describes is
      UNREACHABLE as shipped (the bond flow refuses any bid not in
      pending_bond, and a cascade-promoted bid is stamped won), so a
      refunded runner-up proceeds bond-free with nothing forfeitable; 09
      owns converging the mechanic and the comment, and the draft's
      second-chance sentence ("a bond already returned is not taken
      again; only a bond we hold can be forfeited") must be revisited if
      09 builds the re-quote arm; a wind-down
      runbook so 10.10's return-and-resolve promise is operable (drain
      with the flag ON, then flip off: a bare WOC_MARKET_ENABLED=0
      freezes sweeps, returns, and refunds; 22 owns via the runbook).
    - LEDGER CORRECTIONS: the phase diff is fifteen .md files (thirteen
      package files plus the two ledger files), corrected in both
      ledger entries; the privacy-pair residual now also names
      PRIVACY_POLICY.md section 14's token sentence.
    - COUNSEL PACKAGE NOTE: these amendments postdate the recorded R6
      send. Fernando forwards (or re-forwards) the AMENDED draft, and
      should flag that the memo's "operator never touches funds"
      simplification inherits the draft's new bid-bond carve-out, and
      that the memo's Section 8 question should consider the Claudium
      store by name.
    - VALIDATION: copy floor clean over every added line; anchor rule
      held; npm run ci:changed exit 0 on the fix round; tsc clean and
      the four count-pin suites 377 green on the re-synced tree; live
      Terms and public/terms.html byte-untouched across the whole
      outgoing range; the counsel memo verified absent from the branch
      (tree scan plus content grep), only the two sanctioned ledger
      pointers present; a fresh reviewer re-verified this QA fix round
      before the push.
- 06 directed-rail-integrity (2026-08-13, session start b948aa64fb = the
  trivial release/v0.38.0 sync (16 commits, the chronomancer train, no
  marketplace overlap, no count-pin surface), gate GREEN at 5287214294,
  LOCAL, not pushed per R4): H10, H12, H14, createDirectedOffer
  guardBalance, and the directed auto-close closed. The registry later
  sessions need:
  - JUDGMENT (b) SETTLED: NO boundTo stamping this packet. The
    anonymous-escrow premise genuinely does not cover a named directed
    deal; the standing rationale is the ESCROW LIFECYCLE (every
    compensation exit would need its own binding decision) and is now
    written at exchange_eligibility.ts. Lifting it is an offered product
    follow-up (the R7 pattern), sized as stamp-at-delivery across
    grant/return/restore/mail/park. Consequence: offer CREATION runs
    listingEligibility on the pinned item, so bind_armed refuses at
    offer time.
  - JUDGMENT (a) SETTLED: UNWIND, made provable. escrowInsertListing
    stamps offer.listing_id INSIDE the escrow transaction (CAS on
    accepted-and-unstamped; zero rows aborts typed 'not_pending' and the
    copy restores). Invariant: listing exists IFF the offer is stamped;
    resolveDirectedOffer lost its post-hoc stamp arm (the one
    offers-then-listings lock edge, deleted). A proven-rollback throw
    also reopens in-request; ambiguity writes nothing; the NEW
    convergedOffers sweep arm unwinds aged accepted-unstamped rows from
    durable truth (reopen inside the TTL, expire past it) inside a
    TWO-SIDED window: WOC_MARKET_OFFER_CONVERGE_SECONDS = 300 clears
    every transaction bound; WOC_MARKET_OFFER_CONVERGE_MAX_AGE_SECONDS =
    86400 refuses rows the listings prune's ON DELETE SET NULL
    un-stamped long after their deal completed (NOT rollback evidence;
    without it the arm relabeled real history). Behind
    woc_market_offers_accepted_unstamped, ORDER BY updated_at, narrow
    projection (id + expires_at), per-row sweepError isolation, no park.
    The seller-quarantine and parked-copy legs of the three-legged
    residual STAND.
  - H10 FINGERPRINT SEMANTICS: the identity is the sim's itemCopyPin
    3-tuple (item id + instance payload + crafted provenance; NO new
    serializer); item_pin stores its fixed-width sha256 hex DIGEST (a
    raw client-derived serialization banked kilobytes per row). Stamped
    at CREATION; the buyer's client sends the partner's ONE staged slot
    of COUNT ONE (the one_item hint arm covers the WHOLE table: a second
    slot, a stack, or an ineligible companion all block the send;
    WocTradeModel.agreedItem is the pinned copy). Authoritative check:
    itemPinDigest(extract.extracted) inside the serialized escrow job;
    mismatch restores + refuses typed 'item_mismatch' (NEW leaf
    woc_market.item_mismatch, 409, five non-Latin fills; its own code,
    the fix is a fresh deal). A NULL pin (pre-pin row) refuses too. THE
    LOAD-BEARING PREREQUISITE (the security round's critical): the trade
    session used to strip staged slots to id+count, so NO client source
    carried the identity (and the seller could not even resolve an
    instanced accept). Trade STAGING now previews per-copy identity:
    stagedOfferSlots (src/sim/social/trade.ts) runs the swap's own
    selection walk (removeSellUnitsFromInventory, extracted byte-faithful
    from removeVendorSellUnits) over a scratch deep copy, groups by
    itemCopyPin, ships FULL payloads on the trade wire (a judged accept:
    consensual mutual inspection; a publicInstanceView trim would alias
    copies differing in hidden fields), and the swap consumes the pinned
    copies first (trade-scoped matchers: isTradeLocked only, the shared
    helper's wider lock routed armed copies around the pin) with a
    per-unit generic-walk fallback; a decoupled inventory hub's
    unattributable remainder keeps the old id+count shape. The capacity
    model merges by item id first (per-copy slots double-counted the
    giver's stock, the receiver-overflow class). The seller's directed
    accept resolves from sim.tradeInfo.myOffer (the cleaned per-copy
    truth), never the HUD-local id-only compose list;
    inventoryIndexOfStaged compares payloads order-independently
    (itemInstancePayloadsEqual). The offer intake bounds itemInstance at
    INSTANCE_MAX_JSON_BYTES = 2048 (both intakes ride optionalInstance;
    the bound also caps nesting depth for the recursive sortedJson,
    which a 64 KiB body overflowed into a 500, verified).
  - H12 HOLD + STRIKE POLICY: WOC_MARKET_DIRECTED_HOLD_SECONDS =
    WOC_MARKET_SETTLEMENT_WINDOW_SECONDS (identity pinned;
    directedParams' durationHours is shape-validation-only, documented
    inert). Worst-case escrow occupancy: one hold + one settlement
    window. STRIKES exactly once per walk-away: never-claimed expiry via
    closeDueAuctions' directed branch (resolution 'unsettled'), strike
    AFTER the close CAS and gated on everSettledForListing probed AFTER
    the CAS ('failed' is not OPEN; the open-probe alone double-struck);
    claimed-then-unpaid keeps the overdue arm's strike, and that arm
    AUTO-CLOSES 'unsettled' BEFORE striking (custody before penalty: the
    strike awaits a health read that can reject; the expiry CAS fires
    once). BOTH strike arms ride strikeDirectedBuyer: no strike while
    the price oracle is unhealthy (buyNow refuses market_paused in the
    same window; the sweep still closes and returns, only the penalty
    pauses; an intra-window blip is an accepted residual) and no strike
    on the shared exempt vocabulary (service_unavailable; TODAY
    unreachable on a settlement row by construction, the same standing
    R5 gap the public exemption carries, documented at the helper; the
    health probe is the live gate). An UNEXPIRED claim lock refuses the
    directed close (the 270s lock outlives the 600s hold routinely; the
    row waits via 'ending' + the 300s stranded reclaim, documented). ONE
    pending offer per (buyer, seller) pair
    (woc_market_offers_pair_pending, UNIQUE partial; 23505 answers the
    NEW typed 'offer_pending', woc_market.offer_pending 409 + five
    fills; already_pending's copy describes a pending BID): the
    strike-farming bound; a boot repair expires all-but-newest pending
    per pair ahead of the index (a populated dev database must not fail
    the whole boot; unbatched, pre-enable rationale recorded). REOPEN is
    pair-aware: flipping accepted back to pending is an INSERT into that
    index, so every reopen site (typed refusal, proven-rollback,
    converge) no-ops when a fresh offer occupies the pair (NOT EXISTS
    arm + 23505 race belt) and the converge arm expires the blocked row
    at its TTL. A directed listing accepts NO bids (insertPendingBid
    refuses 'not_found' FIRST, anti-enum; an active stranger bid
    diverted the directed close into the auction close where the bidder
    wins the escrow).
  - H12 CAP: directed listings count against the shared 12 cap in BOTH
    byte-identical halves (countActiveBySeller + the in-transaction
    count; the false mitigation rationale rewritten at both sites and
    the PRD question resolved). cap_reached at acceptance rides the
    typed restore + reopen. No creation-time cap check (a moving fact;
    the create-time invariant covers static facts, documented).
  - H14 SEMANTICS: wallet_links.pubkey is UNIQUE, so the twin is the
    SEQUENTIAL RELINK (list under W recorded on listing.seller_wallet,
    unlink, relink W on a second account, buy). Guard layers: buyNow
    fast path from values in hand (A7: no advisory wallet read); the
    locked re-check in claimBuyNowLock (lock-first-then-check, PROVEN
    string equality only: undefined === undefined must not fire, the JS
    twin of NULL = NULL); the NOT EXISTS predicate inside the claiming
    UPDATE with zero rows answering typed 'own_listing' (the deref-500
    guard). The UPDATE arm is RECORDED defense-in-depth (only a real-SQL
    interleave distinguishes it; pinned structurally + the relink dance
    real-SQL test). The directed rail refuses 'self_offer' wallet twins
    at creation AND completion (live-vs-live reads; defense in depth
    under UNIQUE).
  - ESCROW BUDGET: ESCROW_STATEMENT_TIMEOUT_MS 5000 -> 4000 over FIVE
    workload statements (the cap count no longer skips directed rows;
    the stamp is the fifth); the tunables relation moved to *5 (27000 <
    30000), the statement count pinned 5-directed/4-public, the
    delivery escrow-cost bound derives to 160ms and held (the cost loop
    now closes each measured row: it leaned on the old cap exemption).
    A2: expireDueDirectedOffers carries the outer status qual (EPQ
    re-checks own columns; without it a raced acceptance could be
    expired over its committed listing) + FOR UPDATE SKIP LOCKED.
  - RETENTION + INDEXES: woc_market_directed_offers_listing (the FK
    referent index the listings prune pays a per-row seq scan without)
    + the accepted-unstamped partial + the pair-pending unique, all
    boot DDL with the pre-enable rationale recorded.
    pruneResolvedWocOffersBatch (house pool-first shape, ORDER BY behind
    woc_market_offers_resolved_updated) + WOC_MARKET_OFFERS_RETENTION_DAYS
    (default 180, matches listings so a deal's rows age out together) +
    the main.ts registration (BEFORE the listings entry, which stays
    LAST) + the wiring and config-table pins. item_id stamps at CREATION
    and the seller's acceptance no longer rewrites it (display honesty).
  - PLAN PROOFS (one-off evidence, session scratchpad; STANDING planner
    assertions remain phase 20 per the recorded precedent): the widened
    cap count = Index Only Scan on woc_market_listings_seller_live, no
    heap filter; the converge read = partial index + LIMIT pushdown, no
    sort; offers-by-listing = the new FK index; the wallet probe
    seq-scans at 300 rows (small-table artifact, PK exists).
  - TESTS: new pg suite tests/woc_market_directed_pg_integration.test.ts
    (17 tests; ran RED first for all seven target behaviors: the relink
    claim succeeding, the 12h hold, both cap halves, no auto-close, no
    never-claim strike, bait-and-switch accepted; plus the converge
    three-way + young/ancient guards, the prune-fallout regression, the
    SKIP LOCKED interleave, the pair bound, exactly-one-strike, the
    offers prune). The DB-free floor gained the stamp/converge/expiry/
    ever-settled/prune/insert pins and the wallet-predicate
    defense-in-depth pin; the service suite the full refusal matrix +
    strike exemptions + close-arm branches + the blocked-reopen arc; the
    trade suite the staging/grouping/fallback/overflow repros; the
    controller suite the instanced accept resolution. The fake db
    mirrors every new semantic and gained seedListingRow (the direct
    residue seam; the widened cap closed the escrow-path staging the
    residue tests leaned on). REFUSAL_ERRORS is 51 rows exact.
  - INHERITED RED REPAIRED IN PLACE: tests/admin_guilds_db_integration
    red on the release tip itself (env-gated, CI never runs it;
    accountDetail gained the general-chat quota LEFT JOIN while the
    rig hand-picks its DDL modules); the rig now applies
    GENERAL_CHAT_QUOTA_SCHEMA. Flows back to the release when this
    branch merges.
  - CLOSING ROUNDS (after the first gate pass; commits f618eaf146,
    da5ca53b4b, d3f831b17e, 685fd0eb00, 5ebb176a73, ea1bb82322): two
    independent fresh reviews of the gate-round commit converged, then
    each fix round got its own fresh review (the final tests-only
    commit excepted; the QA session verifies it first), every finding
    applied. The substance: inventoryIndexOfStaged
    now compares the FULL itemCopyPin triple (the crafted marker leg was
    missing; a staged crafted copy resolved to its unmarked twin and
    refused item_mismatch, with discriminating tests both directions);
    the seller accept mirrors the whole-table one_item rule: the model
    gains acceptHint naming the RIGHT obstacle (nothing sellable =
    needs-item, wrong table shape = one_item, past review = nothing,
    which also retired the stale needs-item copy during
    awaiting_payment), judged over the sim's AUTHORITATIVE offer table
    (stagedAuthoritative, the table the player sees rendered; the
    compose list stays correct for the pre-push gates) with both
    hand-offs pinned, the panel renders it verbatim, and the controller
    belt is the ONLY accept-time enforcement (the trade window's Accept
    never consults the model), arm order matching the model's ladder
    (the ambiguity previously only surfaced as a server-side
    item_mismatch);
    reopenDirectedOffer returns whether the row really flipped and the
    converge stat stops counting blocked no-ops (service pin at
    expiresAtMs - 1000); both acceptance-path reopen swallows report
    through the new offer_reopen sweep-error tag (the typed refusal and
    the escrow root cause stay the caller-facing truths, proven by a
    throwing-reopen test); the pair index joined the house
    INVALID-carcass convention (DO drop ahead of CREATE, convention pin
    now enumerates all three repair pairs) and its name became one
    exported constant (WOC_MARKET_OFFERS_PAIR_PENDING_INDEX) consumed by
    the DDL and BOTH 23505 discriminators, with the insert harmonized
    (foreign-constraint 23505 rethrows, pinned); a deterministic
    real-Postgres interleave (uncommitted racer; the wait OBSERVED from
    a separate pool connection, since a transaction freezes its
    pg_stat_activity snapshot at first read; COMMIT only after the
    block is asserted) proves the 23505 belt swallows by constraint
    name in 20ms; the offer_reopen report is pinned on BOTH catches
    (typed-refusal and proven-rollback throwing arms) with
    count-not-presence restore assertions (the harness seeds identical
    copies, so presence checks were vacuous); the boot dedupe repair
    gained the one-time validity gate; the
    quest hook collapsed to ONE fire per removal batch (every per-id
    fire saw the same final state); the instance intake bound measures
    real utf8 bytes (a non-ASCII payload was getting ~3x the named
    budget, pinned); plus prose/title truth-ups. Recorded as
    informational, NOT defects: the two marker-less staged producers
    (the remainder fallback line and the controller pre-send fallback)
    cannot resolve a crafted-only bag and fail SAFE client-side
    (hintAcceptNeedsItem), both effectively unreachable in a real Sim;
    an all-ineligible table deliberately answers await_their_items over
    one_item (ladder precedence, pinned with the WHY).
  - Deploy notes: guardBalance on offer creation is fail-closed (an
    economy outage blocks directed offer creation, intended); dev
    databases carrying THIS BRANCH's earlier builds can hold raw-JSON
    pins (acceptance refuses, the deal reopens; dev-only) or
    accepted-unstamped rows WITH a live listing from an old binary's
    post-hoc stamp crash (the converge arm would reopen them: wipe such
    dev DBs or expire the rows; production unreachable, the marketplace
    has never shipped). A REINDEX CONCURRENTLY of the pair index names
    its transient index _ccnew; a violation raised against THAT name
    rethrows (a 500) rather than no-opping, which is fail-safe but worth
    knowing during index maintenance.
  - Handoffs: phase 13 step-up covers acceptDirectedOffer per the
    out-of-scope note. Phase 14 needs NO new server command for the
    offer lifecycle (decline/withdraw routes exist; the directed cancel
    remains cancelListingIfUnbid and auto-close shrinks its need); 14/15
    own SHOWING the buyer the pinned copy (agreedItem renders nowhere
    yet; the one_item gate carries the honesty until then), the
    one_item/offer_pending/item_mismatch copy surfaces (now including
    the seller-side accept: the model disables over a multi-slot table
    and the belt logs hintOneItem, but no inline panel copy explains the
    disabled button yet), and the trade
    window's richer payload display (tooltips can now show real rolls).
    Phase 16's cluster gains: the estimate-per-offer-create amplifier
    note (bounded by the LIST limiter; memoize per usdCents if it shows
    in latency) and the trade-wire payload diff cost note (bounded by
    bag capacity, change-gated). Phase 20 owes standing planner
    assertions incl the two new partial indexes. Phase 22's pre-enable
    audit: the bindOnTrade scan line stands; add the two dev-db classes
    from the deploy notes above.
  - QA ROUND (2026-08-13, verdict PASS-WITH-FOLLOWUPS, every fix applied,
    PUSHED per R4; commits c67af5f62f, cedbaae8f2, 19eb3c74d6,
    9c9854ee85, 47399f77b7 on the ab2742012b sync merge). The amendments
    the 07+ sessions consume:
    - CAPACITY MODEL REWORKED: fitsAfterSwap no longer re-describes the
      removal; it RUNS shippedOfferUnits (the walk removeOffer itself
      delegates to) over scratch copies of both bags and lands each
      returned unit with the boundTo-stamp arrival arm. Found because
      the old fungible-first model passed a pinned INSTANCED arrival the
      swap could not merge (a 16/16 receiver ended at 17 slots,
      red-first repro in tests/trade.test.ts). Third drift of that
      model's class (#2139, #2605, this); a walk cannot drift from
      itself. The old conservative unmatched-unit tail was dropped as
      unreachable in a live Sim (countItem and the walk read the same
      array); source pin bounds the walk calls at exactly two and
      negatives a second index walk.
    - removeInstancedMatchingUnit gained the CRAFTED-MARKER leg (the UI
      comparator's closing-round fix had no sim twin: a staged crafted
      copy could ship its payload-equal unmarked twin, laundering
      provenance past the disenchant gate and the H10 fingerprint);
      discriminating tests both directions; the generic fallback stays
      marker-blind BY POSTURE with the scope now written at the call.
    - guardTerms NOW GATES createDirectedOffer (strike parity: every
      path that can strike sits behind terms; order matches placeBid;
      the route decodes acceptTerms strictly; the sdk requires it; the
      controller sends true, see R9). terms_required pre-existed end to
      end, so no new code, copy, or fills.
    - The accept belt READS THE MODEL (canAccept/acceptHint) instead of
      re-deriving the ladder; past-review the belt logs NOTHING (the
      'nothing' arm); canAccept gained its production consumer. The
      sweep-error fallback logs code+message+STACK (no detail, null-safe
      code read at both log sites; the production branch now has its own
      test). Own-property ITEMS lookups at all three client-string
      sites.
    - JUDGED, no code change (do not re-raise): strike non-decay vs the
      public cooldown pair is DOCUMENTED design (the directed rail is
      the auction-default rail minus the bond); the buyer-notice gap on
      a late seller accept is bounded by the 600s offer TTL + the
      withdraw lever, surface owned by 14; the client-only one_item
      quantity rule overlaps the recorded 14/15 honesty residual (a
      server-side staged-shape check noted for 14's consideration); the
      padlock (item_lock `locked`) rides the pin, so toggling it
      mid-deal refuses item_mismatch: fail-safe, 14's copy surfaces
      should explain it; per-actor offer fan-out is rate-limited
      (10/min) and pair-bounded per victim, watch at 14/16.
    - NEW TESTS the next sessions inherit: the pg suite is 23 (return
      flight incl. parcel book + item_disposed + idempotent second pass;
      the seeded boot-repair dedupe, whose survivor is HIGHEST ID = last
      inserted, now said at the DDL; byte-identical duplicate
      acceptance; instanced+crafted end-to-end); the service suite
      gained the instanced happy path proving BOTH digest sites agree,
      the crafted leg both directions, the ever-settled DB-free twin,
      the converge old-bound arm + the 24h literal pin, the
      cap-refusal-before-custody witness (extractAttempts), and the
      sweep-fallback shape; routes CAPTURE the forwarded offer body;
      tests/items_sell_units.test.ts is the walk's direct suite;
      trade.test.ts pins pinned-copy-first, both marker directions,
      quest-log-order batch deltas, and both capacity-model halves.
      All mutation-proven (9 session probes + the lanes' 12).
    - MERGE RE-DERIVATIONS (for the next sync): IWorld 323 = 86 data +
      237 methods; language-fanout exemptions 10; hud.ts ceiling 19160
      (the release's map extraction LOWERED it); sim.ts 12436. The
      parity union pin at the bottom of world_api_parity auto-merged
      silently AGAIN (both sides claimed 322): the file's own NOTE
      predicted it; only suite runs decide.
    - Deploy note added: the sweep fallback's log line now carries the
      stack (no err.detail; locates a failed arm across its call
      sites). Phase 22's pre-enable audit gains R9 (the implied-consent
      panel affordance) beside the two dev-db classes.
- 01 branch-baseline (2026-08-11, session start e4c3dde956, tip 418f75b876,
  LOCAL, not pushed per R4): branch was already current with
  origin/release/v0.37.0 (no sync merge needed). All five coordinator
  re-reviews of merge a52da32c89 CLEAN; non-drift findings applied (W9_TAGS
  trade_close row, ClientWorld tradeClose send pin in tests/trade.test.ts,
  custody facade fix in server/woc_market_custody.ts, two comment fixes). H7
  closed: the trade window + p2p offer machine now live in
  src/ui/hud/woc_trade/ (woc_trade_controller.ts in UI_DOM_MODULES,
  woc_trade_offer_view.ts in UI_PURE_CORES, index.ts barrel) with new
  view-core transition tests (tests/woc_trade_offer_view.test.ts) and a
  controller deps-bag suite (tests/woc_trade_controller.test.ts); hud.ts
  19347 lines, ceiling LOWERED 19600 to 19400. hud_update_drive guard moved
  to a module row; language fanout has a NOT_A_LANGUAGE_GATE row for
  lastTradeSig. `node scripts/gate_select.mjs` GREEN on tip 418f75b876; the
  planner fell back to mode=full (branch-wide diff), so the full vitest
  suite, browser regressions, typecheck, and all builds ran green: the
  review's owed full-gate run is discharged. frontend-seam-reviewer and
  qa-checklist findings ALL applied (1 blocking biome error, dead
  imports/fields, re-bounded source-pin slices, the controller suite);
  deferrals recorded in progress.md. (Figures superseded by the 01 QA entry
  below: ceiling now 19347, gate re-verified at the QA tip.)
- 01 QA (2026-08-11, session start 07fda3fd46, verdict PASS-WITH-FOLLOWUPS
  with every applicable fix applied, tip 1d7bdbafa0 plus this docs commit,
  PUSHED per R4): seven audit lanes (four workflow lenses, frontend-seam,
  test-coverage, privacy-security on the custody commit) plus a fresh
  fix-round auditor and qa-checklist (READY, 0 blocking). All five fix
  commits are test-or-fidelity work: the move is now byte-identical (log tag
  reverted), hud.ts imports via the woc_trade barrel, ceiling closed to
  EXACTLY 19347 (zero headroom, per the phase spec; seam reviewer dissented,
  recorded in progress.md), controller fake-hooks arm covers every REST-facing
  guard, pins comment-strip with agreed slice bounds, new guards pin the
  server trade_close arm, the Hud staged() live binding, E2E reach-through
  names, language-fanout exemption drift, and a server-wide sim.postOffice
  facade scan. 41 mutations all failed as expected. Gate GREEN at 07fda3fd46
  and again at 1d7bdbafa0 (full suite 37278 + browser 117); one intermediate
  run flaked on the known heavy-suite timeouts under reviewer load, all green
  in the clean rerun. Deferral list with owners in progress.md (phases 12,
  14, 15, 16). NEXT = phase-02-settlement-state-guards.md fresh session.
- 02 settlement-state-guards (2026-08-11, session start 0f029bacf9, LOCAL, not
  pushed per R4): B1, H9, the B2a groundwork, and the sale invariant closed.
  The registry later phases need:
  - Error codes: `woc_market.settlement_in_flight` (409) with catalog leaf
    `apiError.woc_market.settlement_in_flight` and five non-Latin fills.
    Seller cancel maps an unexpired lock to `buy_now_locked` and a live
    settlement to `settlement_in_flight`; the admin suspend route answers 409
    with its own admin-envelope English. The 02 QA round added
    `woc_market.contended` (409, the bounded lock-wait or deadlock-victim
    refusal on cancel/suspend/buy-now; retry immediately) and
    `woc_market.sale_conflict` (409, an admin sale correction blocked by a
    standing non-excluded row), both with catalog leaves and five non-Latin
    fills; the admin sale route answers the conflict with its own 409
    envelope line, and the admin suspend route answers contention with a 409
    envelope line too. The phase 14 admin-envelope conversion (the owned
    raw-English deferral) also owns switching those two bespoke lines to the
    registered codes, which are wired end to end and filled but reach the
    wire today only on the player-facing routes.
  - Indexes: `woc_market_settlements_open` (UNIQUE partial, state IN offered/
    confirming/confirmed/delivering/delivered) REPLACED
    `woc_market_settlements_live`; `woc_market_sales_listing_once` (UNIQUE
    partial ON woc_market_sales(listing_id) WHERE excluded = false). Both ride
    boot DDL with idempotent pre-flight repair UPDATEs above them (settlement
    losers demoted to expired with fail_reason 'schema_dedupe' plus any prior
    reason appended after a colon, so sweep with LIKE 'schema_dedupe%'; later
    duplicate sales voided excluded = true), a recorded decision AGAINST
    concurrent_indexes.ts: the tables are pre-enable empty and a CONCURRENTLY
    build can leave an INVALID carcass that silently drops the invariant.
    Since the 02 QA round the repair gates read pg_index VALIDITY (not
    to_regclass), and each CREATE is preceded by a drop of an INVALID
    same-named carcass: a failed hand-run CONCURRENTLY build can no longer
    satisfy IF NOT EXISTS while enforcing nothing (proven by a real carcass
    test). DB-free structural pins for the whole DDL surface live in
    `tests/server/woc_market_directed_sql.test.ts`.
  - Db seam: `cancelListingIfUnbid(realm, id, seller, nowMs)` refuses
    `buy_now_pending`, `settlement_live`, and `contended`, and expires
    'failed' rows (fail_reason 'listing_cancelled') on success; new
    `suspendListingIfSafe` proceeds only over failed or UNQUOTED offered (a
    stamped, unexpired quote refuses like confirming: the buyer may already
    have broadcast payment); `insertSettlement` takes `winnerBidId` +
    `winnerFrom` (won stamped in-tx, CAS from the caller's pickable set:
    close arm ['active'], cascade ['outbid']), locks the LISTING row and
    re-checks status under it (the snapshot predicate alone provably lets a
    settlement land on a just-closed listing), and returns 'listing_closed',
    'winner_gone', and 'contended' distinctly; `nextCascadeBidder` replaced
    promoteNextBidder (selection only); `markBidStatus` grew an optional
    `from` CAS; `markBidOutbidQueueRefund` is the atomic loser demote
    (outbid + held-bond refund in one statement, CAS from 'active');
    `closeListingIfNoOpenSettlement` guards the no-winner close arms (refusal
    parks the listing 'settling'); `reopenListing` fail-closes against open
    AND retry-eligible 'failed' settlements (the reclaim arm never expires a
    failed row: its deadline belongs to the overdue sweep's
    default/forfeit/strike/cascade pass, and the suspend expiry's CTE
    releases a dead settlement's 'won' bid to cancelled/refund_due so no bond
    can strand); `transitionSettlement` reports the revival-vs-open-index
    23505 as false
    (settlementQuote refuses instead of 500ing); `setSaleExcluded` returns
    'ok' | 'miss' | 'conflict'.
  - LOCK ORDER RULE for a market transaction touching bid rows AND the
    listing row: bids first (the whole open set, by id: activateBid pre-locks
    it since the 02 QA round, the reproduced 40P01 fix; insertSettlement
    stamps its one winner bid), listing second; the reverse deadlocks.
    Transactions that take no bid row lock carry documented carve-outs in
    place (cancelListingIfUnbid, insertPendingBid, escrowInsertListing).
    Guard transactions run `SET LOCAL lock_timeout` (ESCROW_LOCK_TIMEOUT_MS)
    and surface 55P03/40P01 as the typed 'contended' refusal. Now also
    recorded in server/CLAUDE.md (the woc_market Key-files row).
  - Ops caveats for the phase 22 runbook: the deploy is forward-only (an OLD
    binary against the NEW schema re-opens the settlement-less-won-bid window
    and its reclaim arm can still reopen delivered-but-unclosed listings; the
    market must stay disabled through any mixed-fleet window). The disable is
    also load-bearing for BOOT AVAILABILITY: an old binary writing between
    the repair scan and the CREATE INDEX makes the new boot's index build
    fail, roll back, and exit; the retry self-heals but a persistent writer
    is a boot loop. Under the new schema an old binary's double delivery now
    THROWS at insertSale (23505) instead of minting a silent duplicate: the
    safer direction, but a new old-binary failure mode. Never hand-drop
    `woc_market_settlements_open` or `woc_market_sales_listing_once` during
    an incident: the validity gate re-arms and the next boot demotes any
    surviving duplicate open settlements as schema_dedupe. Detection queries, PRE-upgrade only (after
    a successful boot both return zero by construction): duplicate open
    settlements `SELECT listing_id FROM woc_market_settlements WHERE state IN
    ('offered','confirming','confirmed','delivering','delivered') GROUP BY
    listing_id HAVING count(*) > 1`; duplicate sales `SELECT listing_id FROM
    woc_market_sales WHERE excluded = false GROUP BY listing_id HAVING
    count(*) > 1`. POST-upgrade audits: repaired settlements `SELECT * FROM
    woc_market_settlements WHERE fail_reason LIKE 'schema_dedupe%'` (any that
    reached confirming may still land on chain: reconcile by hand, and check
    their bids for a stranded 'won' + 'held' bond pair, which no sweep arm
    reaches); repaired sales `SELECT s.* FROM woc_market_sales s WHERE
    s.excluded = true AND EXISTS (SELECT 1 FROM woc_market_sales t WHERE
    t.listing_id = s.listing_id AND t.excluded = false)` (also matches
    legitimate operator voids with a standing correction). Before enable,
    EXPLAIN the two repair quals against the grown tables (rides the phase
    16/17 EXPLAIN list).
  - HARD PREREQUISITE FOR ENABLE, recorded from the 02 security review: a
    settlement stuck in 'confirming' now has NO escape hatch at all (cancel,
    suspend, and reclaim all refuse; the old unsafe suspend arm that could
    expire it was the B1 dupe vector and is gone). Phase 04 (H15, the bounded
    confirming resolution) is what restores an exit; it must land before
    WOC_MARKET_ENABLED is ever set. R8 (lock-spam cancel denial) is the other
    02-raised ruling.
  - Handed to phase 03 by the 02 QA round (delivery/reconcile scope): a
    settlement that reaches 'delivered' without its close tail (crash between
    the delivered CAS and closeListing, or the deferred insertSale 23505)
    leaves the listing in 'settling' FOREVER with no sweep arm reading
    'delivered' and no operator escape (cancel, suspend, reclaim all refuse):
    the reconcile arm needs a delivered-re-drive, and deliverOne should
    refuse when listing.itemDisposed is already true (belt against the
    return-then-deliver dupe shape).
  - Handed to phase 04 (buy-now lock lifecycle): `clearBuyNowLock` carries no
    holder guard (any caller clears whoever's lock); safe at every current
    call site, but a guarded variant would make the safety local. Rides
    beside R8.
- 03 delivery-exactly-once (2026-08-12, session start e71a8cfd21, commits
  1196e2bb28 + 9f8097c1fb + a08653dbd2, LOCAL, not pushed per R4): B2a, B2b,
  B2c and the stuck-custody monitor closed. What later phases consume:
  - Monitor endpoint (phase 19 dashboard view; shape as amended by the 03 QA
    round): GET /internal/woc-market/stuck, dashboardGate
    (DASHBOARD_INTERNAL_SECRET), admin envelope, parameter-free.
    data = WocStuckCustodyReadout: { asOfMs, unbookedClaims: { count,
    saturated, sample: [{ custodyRef, claimedAtMs, grantCharacterId,
    mailIntent }] }, stuckDelivering: { count, saturated, sample:
    [{ id, listingId, createdAtMs, updatedAtMs }] } (updatedAtMs is the
    class's age signal, createdAtMs is settlement provenance: render stuck
    age from updatedAtMs), undisposedListings: { count, saturated, sample:
    [{ id, resolution, updatedAtMs }] } }.
    Counts SATURATE at 1000 with the explicit saturated flag (count 1000
    means "1000 or more"); samples cap at 20; rows aged >= 10 min ON
    updated_at for BOTH the delivering class (stamped at the delivering
    claim, so a slow payment leg is not instantly "stuck") and the
    undisposed class; park rotation writes the dedicated sweep_parked_at
    column and NEVER the age columns (the 03 QA round's blocking find: the
    old rotation re-stamped updated_at faster than the stuck threshold, so
    a parked return could never surface). asOfMs is stamped per refresh:
    the cached read stale-serves through an outage, and the dashboard must
    render age from it. Served from a 30s cached read (single-flight,
    frozen object, deliberately non-busted; cold failures negative-cached
    5s). The 5-minute log beat prints only when something is stuck, warns
    once per failure streak AND once per staleness streak (age > 10x TTL),
    and runs even when WOC_MARKET_ENABLED=0; monitor stop() drains an
    in-flight beat before the pool closes.
  - Custody rail attribution (phases 04/05/21/22): every claim carries at
    most one intent, grant_character_id (direct rail, stamped BEFORE the bag
    grant) or mail_intent_at (mail rail, stamped BEFORE the parcel exists;
    markCustodyMailIntent is also the one legal grant-to-mail conversion,
    only after a grantCopy refusal). Resume rules: booked = done; grant
    intent resumes ONLY via this process's pendingGrants session continuity
    (same characterId + lease nonce, snapshotCopy, never a second grantCopy);
    mail intent resumes ONLY via an UNWRITTEN pendingMail entry (no parcel
    can exist yet) or hasParcel (the parcel still in the live book); once an
    attempt reached the post office, in-process memory proves nothing about
    collection, so only the in-book check authorizes. EVERYTHING else parks
    visibly (bare claims incl. all pre-upgrade rows, collected letters,
    lease fences, restarts, relogs). ITEM-FREE letters (the sold notice)
    skip the ledger entirely: they cannot duplicate and nothing re-notifies,
    so a durable claim only polluted the readout. A lease fence proves only that THIS write lost, never
    that an earlier autosave did: that reasoning is load-bearing, do not
    weaken it. Since the 03 QA round: a provable grant resume refreshes its
    pendingGrants stamp on every attempt (the proof is session identity plus
    nonce, not entry age, so sustained lock contention cannot expire a live
    retry into a park; an entry with NO attempts for 10 minutes still prunes
    and parks), and grantCopy has a fourth refusal, 'ambiguous' (the grant
    touched the live bags but the session state is unprovable), which PARKS
    instead of converting to mail. unclaimCustodyRef, clearCustodyGrantIntent,
    saveDeliveredCharacter and cancelOpenBidsForListing are GONE from the db
    seam; new members: custodyRefState, markCustodyMailIntent,
    markCustodyGrantIntent, saveDeliveredCharacterBooked (atomic fenced
    bags+booking, lock_timeout + heavy statement timeout, characters-row
    carve-out from the market lock order), finalizeDeliveredSettlement,
    deliveredUnclosedSettlementsPage, disposeSoldResidueListings,
    touchSettlementRow, stuckCustodyReadout.
  - Reconcile semantics (phase 21; as amended by the 03 QA round): deliverOne
    returns advanced|parked|skip|contended; parked rows rotate ONCE on
    sweep_parked_at at park time (batch order = COALESCE(sweep_parked_at,
    updated_at), shared verbatim with the two partial rotation indexes),
    back off in-process for 60s, and while backing off are EXCLUDED from the
    batch reads (deliveringSettlements / undisposedClosedListings take the
    caller's backed-off id set), so a standing parked set costs no batch
    slots and no per-pass writes; sweep_parked_at clears on the terminal
    transitions (finalize, dispose) so a recovered row cannot carry a stale
    rotation key. 'skip' (a hand-moved row, finalize 'stale' after custody
    booked) clears the parked entry and raises sweepError (it is invisible
    to every monitor class, so the log line is the only trace, and
    reopenListing could re-auction such a row: never hand-move settlement
    state). A contended finalize stops the batch and the pass claims nothing
    further (the check runs BEFORE claimDeliverableSettlements); contention
    is scoped per entry (the sweep pass owns one scope, the eager confirm
    entry mints its own), so a request-thread delivery can neither clobber
    a pass mid-flight nor inherit a stale verdict; the next pass retries.
    activateBid's 'contended' surfaces to the bond-confirm caller as
    standing:false pending:true (never "outbid": the bond is held and the
    next poll retries the activation). Delivery stats count rows
    ADVANCED with park EVENTS on the separate 'parked' stat; a slow pass
    (>1s) logs even at zero counts. finalizeDeliveredSettlement
    distinguishes 'finalized' from 'already_final' (re-runs neither
    re-count nor re-send the seller notice) and sets both lock_timeout and
    the heavy statement_timeout; after the listing lock it re-locks the
    open-bid set (buy-now finalize can race insertPendingBid), and
    activateBid maps 40P01/55P03 to a typed 'contended' the bond poll
    retries. The redriven beat runs once per minute over 500-listing id
    pages (partial index woc_market_listings_live_ids) but finalizes at
    most SWEEP_BATCH rows per beat (each costs a realm mail-book write on
    the shared serial writer); a truncated fetch resumes behind the last
    processed row, an exhausted cycle resets the cursor. Sold-undisposed
    residue converges in its own 'disposed' arm (same minute cadence, own
    error isolation, FOR UPDATE SKIP LOCKED); WITHOUT a standing sale row
    it parks forever (operator-only exit, on purpose). The seller sold
    notice is best-effort by decision: a crash between finalize and the
    notice loses it for good (item-free, sale durable, pinned by test);
    notice failures log under the 'deliver_notice' tag.
  - Lock order registry update: suspendListingIfSafe now pre-locks
    ('pending_bond','active','won') because its expiry CTE cancels a dead
    settlement's winner; finalizeDeliveredSettlement pre-locks the open set
    plus the winner, and (since the 03 QA round) RE-LOCKS the open set after
    taking the listing lock, because a buy-now finalize runs while the
    listing is still 'active' and insertPendingBid (listing-lock-first) can
    commit a new bid in the window between the pre-lock and the listing
    lock; a crossing activateBid surfaces as 40P01 and both sides retry
    typed ('contended' from finalize, and activateBid itself now maps
    40P01/55P03 to a typed 'contended' the bond poll retries instead of a
    raw arm failure). Both sides of the former suspend cycle are pinned by
    a live concurrency test in
    tests/woc_market_delivery_pg_integration.test.ts.
  - Ops caveats for the phase 22 runbook, appended to the 02 list: BEFORE
    upgrading a realm that ever ran the market, verify
    `SELECT count(*) FROM woc_market_custody_claims WHERE booked_at IS NULL`
    is zero (legacy NULL intents are UNKNOWN, not "no attempt": the new
    binary parks them, which is safe but each parked row is a delivery an
    operator must finish). BEFORE a binary ROLLBACK, drain
    `SELECT custody_ref FROM woc_market_custody_claims WHERE booked_at IS
    NULL AND grant_character_id IS NOT NULL` to zero: the OLD binary adopts
    any bare claim as booked and completes the sale with nothing delivered.
    NEVER delete an unbooked claim row to unstick a delivery: the next pass
    mints a FRESH claim that skips the parcel-in-book gate by construction,
    re-arming the duplication (warning written at the DDL); resolve parked
    rows by hand-delivering then stamping booked_at, or by confirming
    non-delivery first, and the phase 22 runbook owes the step-by-step
    re-drive procedure for each parked class. The permanent-park classes:
    crash-before-blob-persist and a deterministic parcel refusal (mail rail,
    hand-delivery is the fix once non-delivery is confirmed), plus the GRANT
    classes (non-null grant_character_id: an ambiguous grant refusal, a
    lease fence, or a dead session), where the item may ALREADY be in the
    buyer's bags and hand-delivering without checking mints the dupe:
    confirm the buyer does NOT hold the item first. Do not overlap the
    market-enable rollout with a rolling restart: boot DDL holds
    AccessExclusive on woc_market_custody_claims, woc_market_settlements,
    and woc_market_listings (the sweep_parked_at ALTERs) for the whole
    schema transaction, so realm B's boot blocks realm A's market writes
    for its duration. During a mixed-fleet window the OLD binary also loses
    woc_market_settlements_state_created (the new boot drops it), so its
    readout sample sorts the delivering set unindexed: diagnostic-only and
    transient, but expect that read to be slower until the fleet converges.
    onSweepError logs raw pg errors
    (detail/where can echo character names and item JSON; fine today, but
    revisit before any account or wallet column joins those rows). The
    EXPLAIN list for phases 16/17 gains: the redrive page probe
    (listing_id = ANY page, now behind woc_market_listings_live_ids), the
    three readout sample+capped-count pairs, the two COALESCE rotation-order
    batch reads against their partial indexes, and the
    disposeSoldResidueListings subquery (now behind
    woc_market_listings_sold_undisposed). Claims-table retention (phase 17):
    booked rows are prune-eligible provenance; unbooked rows are the
    operator queue and MUST NOT be pruned; the listings prune leaves booked
    claim rows behind (no FK), so age booked rows on booked_at, never on
    referent. Release-merge premises recorded by the 03 QA sync audit:
    steady per-realm DB connections are now 13, not 10 (the chat-quota
    feature's dedicated 2-client pool + 1 LISTEN connection; phase 16/22
    capacity math must count them); the repo now has its first pg
    LISTEN/NOTIFY exemplar (createGeneralChatQuotaListener) and a second
    dedicated-Pool idiom, relevant to phases 16/19/22 (advisory-lock
    namespaces verified disjoint); the quota admin write locks the accounts
    row FOR NO KEY UPDATE and can contend briefly with escrowInsertListing's
    FOR UPDATE (no deadlock cycle; phase 22 lock-registry note); phase 14
    must NOT scope-creep into the release's quota admin-envelope English
    (release-side domain, not packet debt).
- 04 bond-payment-lifecycle (2026-08-12, session start 3f20375918, LOCAL, not
  pushed per R4): H4, H15, the anti-snipe unpaid-bid medium, ruling R8 (both
  arms), and the 02 clearBuyNowLock handoff closed. The registry later
  sessions need:
  - Signature-first intake, BOTH legs: confirmBond and confirmSettlement
    record the submitted signature BEFORE any expiry verdict; the quote_expired
    refusal no longer exists on either intake (the chain's verdict decides,
    surfaced as confirm_failed when it refuses; the code stays registered).
    A decided-against bond keeps its signature as the ledger trace until the
    poll lapses it; the recorded signature blocks refresh and abandon with the
    new 409 `woc_market.confirm_in_flight` (catalog leaf + five non-Latin
    fills). setBidBondQuote is a CAS (pending_bond AND bond_signature IS NULL,
    returns boolean); abandonPendingBid adds the same signature arm. Since
    the 04 QA round: both intake routes shape-check the signature
    (signatureField, safe printable characters only, length 256; control
    characters were a log-forging vector); refreshBondQuote refuses
    quote_expired when the quote would OUTLIVE the seat (now + quote TTL
    past placed_at + pending TTL: a straddling quote invited a broadcast
    whose signature arrived against a lapsed bid where nothing records it,
    the residual now being only the sweep-cadence boundary race); a
    confirm whose activation the POLL won answers standing from the row's
    REAL status (activateBid 'not_pending' re-read, never a false
    "outbid"); and a recorded-signature retry against a review-parked
    settlement answers the state (review joined the outcome arm;
    not_active read as "purchase gone" for money under review). From the
    verification round: a SECOND, DIFFERENT signature against a signed
    pending bid refuses confirm_in_flight on both legs (was not_pending /
    not_active, a false dead-row verdict; the second string has no ledger
    slot by design, the reference-scoped service verdict is the double-spend
    backstop); a SAME-signature retry on a confirming settlement re-asks the
    chain instead of refusing, skipping the recording write so the retry
    never re-stamps updated_at (the H15 age axis); a revived failed row's
    replaced signature is logged (dev channel) since the new recording
    overwrites it (the refusal survives on fail_reason and in the service
    ledger); lapseBid gained AND bond_state = 'pending' and returns whether
    it lapsed, so a reorg-flipped verdict can never void a HELD bond into a
    state no refund arm reads, and the poll PARKS the held survivor
    (rotation + backoff, visible via stuckBonds) instead of letting it
    re-own the batch head every pass; and a retry of the signature that
    already SUCCEEDED answers the outcome, not a refusal, on both legs
    (bond: standing for active/won, not standing for outbid, no re-drive,
    no churn; settlement: the current state for
    confirmed/delivering/delivered, no second sale; a 'failed'
    same-signature retry still refuses, the revival owns it).
  - Paid-but-undecided carve-out: the suspend and finalize bid teardowns skip
    (status pending_bond AND bond_signature IS NOT NULL AND bond_state
    'pending') rows; such a bid stays in confirmingBonds until the chain
    decides, and a settled verdict against a closed listing routes the held
    bond to refund_due through activateBid's supersede arm. The overdue
    default arm's markBidStatus('defaulted') call now passes a ['won'] CAS
    (the optional from parameter itself predates this work).
  - H15 knob and state: WOC_MARKET_CONFIRMING_REVIEW_HOURS (env, default 6,
    empty/non-positive falls back; cfg.confirmingReviewMs via
    wocMarketConfig(); documented in .env.example; the parse cases incl. the
    fail-dangerous empty string are pinned in
    tests/server/woc_market_routes.test.ts, not the config suite). Since the 04 QA round the H15
    park is the sweep's OWN 'reviewed' arm with its own SWEEP_BATCH budget
    (confirmingOverdueSettlements, aged on updated_at, which nothing
    re-stamps while the poll returns undecided; ordered-index pushdown on
    woc_market_settlements_state_updated): sharing the overdue batch let a
    confirming backlog own the batch head and starve the offered/failed
    expiry work, and the split RESOLVES the recorded 16/17 UNION ALL item.
    overdueSettlements is single-arm again (offered/failed on deadline_at).
    The knob CLAMPS at 720 hours with a one-time first-read warn (the QA
    judgment superseding the no-upper-clamp posture: a huge value silently
    disabled the park and could 22008 the arm), and the lapse-straddle
    refresh refusal is the typed woc_market.bond_window_closed (409,
    catalog leaf + five non-Latin fills; REFUSAL_ERRORS is 48 rows). The sweep parks over-bound
    rows in the NEW settlement state 'review' (fail_reason
    confirming_overdue) with NO default/forfeit/strike/cascade. 'review' is OPEN: it rides the renamed
    unique index woc_market_settlements_open2 (six states; the old _open is
    dropped AFTER open2 exists; the repair gate and carcass drop retarget to
    open2; predicate text shared via OPEN_SETTLEMENT_STATES_SQL, the fake's
    OPEN_SETTLEMENT_STATES mirrors it), blocks reopen/suspend/cancel/insert,
    and exits the polling set. The state CHECK constraint evolves in place
    (gated DROP+ADD NOT VALID per the house pattern, once per legacy
    database; standing values are valid by construction, and the gate's
    retarget to open2 re-runs the dedupe repair scan exactly once more on
    databases that carried the _open generation). Operator resolution arms
    (phases 09/19/21): transitionSettlement review -> confirmed (paid,
    delivery resumes) or review -> failed (unpaid, the overdue default pass
    takes over); semantics documented at the /internal/woc-market/stuck route.
    The client renders 'review' as hudChrome.wocMarket.settlementReview
    ("Payment under review", five fills).
  - Readout (phase 19 consumes): WocStuckCustodyClasses gained
    reviewSettlements { count, saturated, sample: [{id, listingId,
    createdAtMs, updatedAtMs}] } (no age filter) and stuckBonds { count,
    saturated, sample: [{id, listingId, account, placedAtMs}] } (aged on the
    same confirming bound; since the verification round the age AXIS is
    COALESCE(bond_signature_at, placed_at), the poll park's own axis, so the
    readout reports on the mechanism it describes, and the sample carries
    stuckSinceMs (render stuck age from IT; placedAtMs stays as placement
    provenance); main.ts wires bondStuckAgeMs from the knob; since the 04
    QA round the sample ORDERS on the indexed placed_at, never the
    unindexed COALESCE, whose top-N sort scaled with the whole signed
    pending set exactly during the incident the readout reports).
    stuckCustodyReadout now takes bondOlderThanMs; the log beat counts both
    new classes. Bonds have NO automatic time-based exit (a refund_due on a
    never-landed payment would pay out through today's blind releaser, B3);
    the exit paths are the chain deciding or operator resolution, and the
    stuckBonds class is the visibility bound. Phases 09/10 (releaser CAS,
    verifier timeout per R5) own the automatic exit. The POLL COST is
    bounded separately (the db round): a bond still undecided past the
    5-minute pending TTL rotates to the poll tail (poll_parked_at, the new
    rotation column and partial index; confirmingBonds orders on
    COALESCE(poll_parked_at, placed_at) and takes the caller's backoff
    exclusion), so a standing never-decided set cannot occupy the batch
    head; young confirming bonds keep the full 5s cadence. The park AGES ON
    THE SIGNATURE RECORDING (bond_signature_at, stamped by
    submitBondSignature with the caller's clock, first recording wins;
    legacy rows fall back to placed_at), on its own tunable
    (WOC_MARKET_BOND_POLL_PARK_SECONDS, a rules CONSTANT, not an env knob;
    its value coincides with the pending TTL, so the rules suite also pins
    the constant identity at the comparison site): placement age says nothing about
    how long the chain has had the transfer, and a bidder signing late in
    their window must not be parked seconds after submitting. After a
    restart the in-process backoff is empty but the rotation stamps persist,
    so the first pass re-polls parked rows once and re-parks them. The
    anti-snipe extension anchors on the SAME submission moment (captured
    before the chain round trip: anchoring after it drifted with RPC
    latency and a slow confirm could null the settled arm's own extension).
  - Anti-snipe: insertPendingBid no longer extends (extendEndsToMs param
    GONE from the db seam and the fake); the one extension point is
    extendAuctionForBondProgress (listing-lock-only carve-out, best-effort:
    contended loses only the extension, never the recorded signature), fired
    by confirmBond AFTER the chain verdict and only when it is settled or
    pending, and never on the proxy's pending+service_unavailable outage arm
    (the security round: extending on the raw submission let a fabricated
    string move the clock; a refused verdict extends nothing; on settled the
    extension runs BEFORE activation so a last-seconds verdict is not read
    as past the close). Anchors are SPLIT BY ARM (the verification round,
    two passes): the PENDING arm anchors on the FIRST recording moment
    (bond_signature_at, which submitBondSignature RETURNS; a legacy no-stamp
    row falls back to placed_at even on resubmit), because a fresh-clock
    anchor per resubmit let one pending-forever signature re-post its way
    (rate limit 60/min) to holding the close at now plus the extension
    continuously to the cap; the SETTLED arm anchors on the verdict moment
    (the paid-bond extension the window always granted; repeating it needs
    repeated contended activations of a REAL payment, which the cap
    bounds). Cap math unchanged
    (antiSnipeExtendedEndMs). BEHAVIOR NOTE for phase 14 copy: a PENDING
    signature first recorded outside the window cannot extend on re-posts,
    and a signature
    bond routes to refund_due via the supersede arm (money-safe; the old
    "an in-flight confirmation can never land after a close" guarantee is
    deliberately gone). Residual, service-contract-dependent: if the economy
    reports a fabricated signature as pending, the extension still fires
    ONCE; phase 10 (R5 verifier semantics) owns closing that.
  - R8 arm one (numbers PROPOSED here, QA re-judges): per-listing re-claim
    cooldown WOC_MARKET_BUY_NOW_RECLAIM_COOLDOWN_SECONDS = 1800; account cap
    WOC_MARKET_BUY_NOW_ABANDONS_PER_HOUR = 3 per rolling
    WOC_MARKET_BUY_NOW_ABANDON_WINDOW_SECONDS = 3600 (rules constants).
    Ledger table woc_market_buy_now_abandons (FKs to listings/accounts,
    UNIQUE (listing_id, account, lock_expires) as the window dedupe key;
    lock_expires IS the abandon moment, app clock). TWO recorders, deduped on
    the window key: the overdue sweep's public buy-now arm (canonical,
    records BEFORE the holder-guarded clear) and claimBuyNowLock's steal arm
    (closes the crash-window gap between the sweep's recording and its lock
    clear; the immediate self-steal is closed by the open-settlement probe
    below). Directed listings record nothing and are exempt from both guards
    (they keep the strike). claimBuyNowLock diagnoses every
    refusal class from a LOCK-FREE advisory read (the db round: refusing
    under FOR UPDATE serialized every hopeful behind the holder at a
    measured hundredfold amplification); since the 04 QA round the cooldown
    probes run in the advisory pass TOO (committed ledger rows cannot
    un-cool inside any cooldown window, so a cooled-down account's retries
    never take the listing lock; proven lock-free by a pg pin racing a
    held row lock); only the self-steal, whose abandon row is minted
    inside the transaction, pays the guard transaction,
    and every advisory answer is re-run authoritatively under the lock
    (typed refusals cancel_pending / claim_cooldown / contended; old
    diagnosis order kept). An OPEN settlement refuses the claim as 'locked' BEFORE any
    recording (a buy-now listing stays 'active' through confirming and
    delivery, so a rival's probe must never stamp a PAYING holder). BOTH
    recorders run ONE shared statement (RECORD_ABANDON_SQL, exempt list as a
    BOUND parameter) whose exempt predicate refuses a window only for a
    refusal class that is NOT mintable on demand:
    WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS = service_unavailable ONLY. The
    round-2 security re-review removed the bare-signature exemption (one
    fabricated request bypassed the arm); round 3 removed quote_expired too
    (attacker-mintable: wait out the 90s TTL, post any string, the
    signature-first intake records it and the service answers
    quote_expired). Cost accepted: a genuinely late honest buyer eats ONE
    recoverable abandon row. The failed-row expiry PRESERVES fail_reason
    (offered rows still stamp window_elapsed): ops note, an
    expired-from-failed row reads its refusal reason, not window_elapsed.
    The exempt string is a wire-shaped coupling with the service's reason
    vocabulary (pinned against the proxy); R5/phase 10 note, now THREE
    dependents: bond residency, the extension gate, and restoring any
    late-payment exemption, which is UNSOUND until a verdict can distinguish
    a real transfer from a posted string. The new guard
    transactions bound idle-in-transaction holds (GUARD_IDLE_TX_TIMEOUT_MS,
    equal to ESCROW_LOCK_TIMEOUT_MS at 2000ms since the 04 QA round: 500ms
    was four times tighter than the lock-wait tolerance with no
    measurement behind it, and a false fire discards a pool client),
    and the verification round extended the bound to cancelListingIfUnbid,
    which this work grew two round trips inside its lock window (the older
    untouched guards still ride the phase 16 retrofit);
    25P03 arrives ASYNCHRONOUSLY (the session is terminated, the SQLSTATE
    lands on the client error event or the next query depending on stall
    shape, both measured), so withTx captures the async error, prefers
    whichever error carries a code, and DISCARDS the dead client; the typed
    'contended' is pinned by a real stall test. Retention: pruneWocBuyNowAbandonsBatch
    registered in the nightly sweep, WOC_MARKET_ABANDONS_RETENTION_DAYS
    (default 30, .env.example).
  - R8 arm two: cancel_requested_at on listings (additive; partial index
    woc_market_listings_cancel_rotation, the round-three rename; the paid
    probe reads the shared PAID_SETTLEMENT_STATES_SQL, OPEN minus
    'offered', pinned to the open list). cancelListingIfUnbid on an unexpired
    lock: a PAID window (any settlement past 'offered') still refuses
    settlement_live; an unpaid one stamps and returns 'cancel_pending', which
    the service maps to { ok: true, cancelPending: true } (route sends
    cancelPending, SDK forwards it, the window toasts
    hudChrome.wocMarket.listingCancelPending). From the stamp: claimBuyNowLock
    AND insertPendingBid refuse 'cancel_pending' (bids blocked too, to keep
    the one-window bound; interpretation recorded for QA). The sweep's new
    'cancelClosed' arm (after the expiry arm, so the overdue arm records the
    abandon first) converges stamped, window-ended listings through
    closeCancelPendingListing (same guards as the seller cancel; 'failed'
    expiry only, and an open settlement ABORTS via TxAbort so the
    speculative failed-expiry rolls back, the sibling cancel's shape) and
    flies the item home; a PAID window proceeds to settlement and finalize
    closes it sold (the stamp dies with the closed row). A converge 'skip'
    PARKS (touchListingRow rotation on sweep_parked_at, 60s in-process
    backoff, excluded from cancelPendingListings via its excludeIds), so a
    paid window sitting unresolved for operator-scale time costs no batch
    slots; the cancel-pending partial index rides the shared rotation
    expression. clearBuyNowLock(id, holderAccount) is holder-guarded
    everywhere (the four buyNow unwinds pass the claimer, the sweep passes
    the settlement buyer).
  - New error codes (all 409, catalog leaves + five non-Latin fills each):
    woc_market.confirm_in_flight, woc_market.cancel_pending,
    woc_market.claim_cooldown. confirm_in_flight's copy is LEG-NEUTRAL
    ("Your payment is still confirming."): the settlement leg answers it
    too since the verification round, so bond-specific wording lied there
    (the reword refreshed the five non-Latin fills in the same change). Snapshots updated (error_codes.test.ts,
    api_error_code_parity.test.ts); REFUSAL_ERRORS is 48 rows since the 04
    QA round added woc_market.bond_window_closed.
  - Tests: new real-SQL suite tests/woc_market_bond_pg_integration.test.ts
    (34 tests after the 04 QA round; its rig is the third copy, the
    pg-harness extraction still rides phase 20); settlement suite retargeted
    to open2 and cancel-intent; service suite has DB-free arms for the
    review park, the claim cooldown, the tried-buyer skip, the recorder
    dedupe and the converge park (the CI floor); the structural floor pins
    the teardown carve-outs, the bond/lock statements, both prunes and the
    new DDL. Seventeen mutation spot-proofs bit post-commit (eight on the
    implement round, six on the review-fix round, three on the round-three
    residuals), and a follow-up verification session independently re-ran
    three headline mutations (park axis to placement, holderless clear,
    confirming arm dropped) at the final tip: each bit its named tests with
    the suites provably running.
  - Migration-safety verdict (verified live vs Postgres 16, no critical or
    warning): all DDL additive/idempotent; the 'review' CHECK evolves NOT
    VALID once per legacy DB (constraint name woc_market_settlements_state_check
    confirmed auto-named and under the 63-byte limit); the open->open2 swap
    never gaps uniqueness (single boot transaction, superset predicate); the
    _cancel_rotation rename converges from all three historical shapes
    (reproduced the in-place-redefinition failure and the fix); every new
    predicate index-covered; the exempt-list parameterization closed the one
    runtime interpolation. TWO actionable INFOs folded to owners: (a) the
    overdueSettlements OR arm's pushdown loss (RESOLVED by the 04 QA round:
    the confirming park is its own read and arm now, both arms index-served). (b)
    ROLLBACK runbook (phase 22): an OLD binary against the new schema fails
    CLOSED but strands 'review' rows (no transition path; a second settlement
    takes a raw 23505 from open2, safe-direction no-double-sell, surfaces as
    internal.error until re-upgrade) and resumes taking lock claims/bids on a
    cancel_requested_at listing (nothing destroyed). Standing constraints
    restated: the boot repair is unbatched (safe only pre-enable-empty; the
    first populated-table repair must batch), and the widened CHECK stays
    convalidated=false on legacy DBs (cosmetic; an operator may VALIDATE
    CONSTRAINT out of band).
  - Handoffs: phase 06 (directed rail) inherits the cancel-intent seams and
    the directed exemptions; phase 09 executes review/stuck-bond resolutions
    (releaser CAS is the prerequisite for ANY automatic bond exit, and the
    held-bond reorg carve-out in lapseBid means a held+refused row waits for
    phase 09 tooling or an operator); phases
    16/17 EXPLAIN list gains the two new
    readout classes and the claimBuyNowLock ledger reads (the
    overdueSettlements OR-arm item is RESOLVED: the 04 QA round split the
    confirming park into its own read, restoring pushdown for both arms); the abandons FK
    adds a non-cyclic blocking edge (a claim can briefly wait on the previous
    abandoner's accounts row when that account is in escrowInsertListing;
    bounded by lock_timeout, phase 16/22 lock-registry note); phase 12 owns
    the env docs sweep (the two new knobs are already in .env.example; note
    WOC_MARKET_CONFIRMING_REVIEW_HOURS has no upper clamp, so a huge value
    silently disables the H15 park and the stuckBonds class, a posture the
    QA session should judge); phase 21
    exercises review resolution end to end; phase 22 runbook owes the
    review-state operator procedure (verify on chain, then the transition).
    Added by the 04 QA round: phase 13 opens with the ITEM-LOCK question
    (the release's player item lock gates salvage/craft/vendor only; the
    $WOC listing path deliberately matches the gold market and does not
    consult it, and whether a locked copy should refuse exchange listing
    is Fernando's call; a locked copy sold on EITHER market today arrives
    at its buyer still wearing the seller's mark); phase 14 copy list
    gains the quote_expired leaf now also answering the lapse-straddle
    refresh refusal (no fresh quote will come, the copy says to request
    one); phase 16 owes the p99.9 inter-statement event-loop gap
    measurement behind the 2000ms idle bound and the at-scale
    advisory-cooldown concurrency proof; phase 20 owes standing planner
    assertions for the two rotation indexes; phase 22 runbook gains two
    lines, never disable WOC_MARKET_ENABLED while payments are in flight
    (both intakes refuse before recording and the sweep freezes recorded
    rows), and the boot dedupe can demote a 'review' loser to failed only
    when open2 never built (edge, safe-direction, reconcile by hand).
- 05 custody-entry-hardening (2026-08-13, session start f07ca88278 = the
  trivial release sync merge, LOCAL, not pushed per R4): H5, H6, and the
  coordinator-drift medium closed. The registry later sessions need:
  - THE ESCROW FIFO (H5): createListing's whole custody critical section
    (extract, authoritative re-check, escrowInsertListing, compensation)
    runs as ONE job on GameServer's per-character save queue
    (WocMarketCustody.runSerialized over GameServer.enqueueCharacterWrite;
    the keyed FIFO itself is serial_writer.ts createKeyedSerialWriter, and
    the weapon-skin/hotbar queues plus the market depth-warn wrapper now
    ride the same module). Commit order is enqueue order across ALL of a
    character's writers, so a stale pre-extraction autosave always commits
    BEFORE the escrow write and can never resurrect an escrowed item.
    Ownership resolves BEFORE the job (ownsLiveCharacter, zero side
    effects: a foreign character id must never occupy the victim's escrow
    slot or force their guild-book flush). The job is depth-capped at ONE
    per character and deadline-bounded (ESCROW_QUEUE_WAIT_MS 5s, covering
    the guild-book flush; a cancelled job has extracted nothing; a job
    that STARTED answers its real outcome, never contended; waits past
    ESCROW_QUEUE_WARN_MS 2s warn, throttled 30s). Dirty guild books flush
    atomically FIRST and an in-job re-check refuses 'contended' (a
    character row must never carry book-paired deltas without its book
    half). Every custody blob (extract, grant, snapshot) serializes
    through GameServer.serializeCharacterForPersist: the session save
    fixups ride every durable write (a raw sim.serializeCharacter was a
    jail escape; character_save_fixups.ts owns the rationale, extracted
    from saveCharacter). wocCustodySession refuses left AND quarantined
    sessions for every custody op. QA amendments: the warn threshold and
    its throttle are injectable (createWocMarketCustody opts) and
    ESCROW_QUEUE_WARN_THROTTLE_MS (30s) is exported and ladder-pinned;
    kickSession sends its SECOND argument on the wire, so both escrow
    terminal arms send the matcher-covered 'character taken over' literal
    with the cause in the leave reason (the implement round had them
    swapped); the depth-cap slot follows the WORK settling (now pinned);
    saveCharacter's post-commit steps (lastSave, deed publish, level
    feed) deliberately do not run on the escrow write and catch up one
    ordinary save later.
  - COMPENSATION SPLIT ON PROOF: server/pg_rollback_proof.ts
    throwProvedRollback is an ALLOWLIST of proven-abort SQLSTATE classes
    (22/23/25/40/42/53/54/55 + 57014); Node errnos (EPIPE et al, five
    uppercase chars) and connection-class codes classify AMBIGUOUS. QA
    amendments: TxNeverStarted also tags a BEGIN failure (a stale pooled
    socket fails there, not at connect, in the same correlated volume;
    nothing can commit before BEGIN returns; the tag skips withTx's
    code-preference and the client is discarded), and the preference
    helper is null-safe (a codeless failure used to be REPLACED by a
    TypeError dereferencing the null asyncErr: evidence destroyed,
    classification unchanged; the pin asserts the original message
    survives). withTx DISCARDS the client on ANY codeless failure (the
    db-perf P1: a COMMIT at the 65s driver backstop rejects codeless
    with its response outstanding, and a best-effort ROLLBACK can
    consume that stale reply, so a "returned" client would answer the
    next borrower with it; coded failures with a landed rollback stay
    poolable, both arms pinned). restoreCopy's premise is restated truthfully: quarantined
    sessions never reach it because BOTH quarantine arms are terminal.
    restoreInto stays deliberately uncapped (compensation must never be
    refusable; overfill beats losing the only copy). A
    proven-rollback throw or typed refusal restores via
    restoreCopy(pid, characterId, slot): into the LIVE bags while the
    extraction pid's player entity exists (every teardown flush queues
    BEHIND the job, so the restored copy rides it to durability), by
    return parcel only once the player is gone. lease_lost ALSO fires
    escrowSessionLost('fenced') (kick, saveCharacter's own displaced-
    zombie signal). An AMBIGUOUS throw restores NOTHING and fires
    escrowSessionLost('ambiguous'): quarantine + kick, so the session
    reloads from the durable row, which is correct in BOTH branches of an
    unknown COMMIT (committed: item-free blob + listing; rolled back: the
    item still in the bags); the full extracted slot is logged
    (escrow_outcome_unknown) for the operator.
  - escrowInsertListing: workload-scoped ESCROW_STATEMENT_TIMEOUT_MS (5s,
    exported + ladder-pinned in tunables; measured p50 3.5ms / max 8.3ms
    on a 27KB blob, re-measured and asserted by the delivery pg suite's
    escrow-cost test), the idle-in-transaction bound, and 55P03/40P01/
    25P03 mapped to the typed 'contended' (return union widened; the
    service restores and answers woc_market.contended). ESCROW_LOCK_
    TIMEOUT_MS and GUARD_IDLE_TX_TIMEOUT_MS are now exported and
    literal-pinned. QA amendment, the honest occupancy ceiling: the 5s
    allowance bounds the FOUR workload statements (the tunables relation
    pins exactly those plus the lock wait and pool checkout, scraping
    AUTOSAVE_SECONDS from source); BEGIN and the installing SET LOCAL
    ride the 15s session default and COMMIT the 65s driver backstop, so a
    wedged transaction CAN exceed one autosave interval (the wait
    deadline and depth cap bound the player-facing impact; the tail rides
    16 with the guild-flush 60s term).
  - RECORDED CARVE-OUT: commitGrant (the delivery twin) deliberately does
    NOT ride the FIFO yet: its stale-autosave direction is buyer item
    LOSS, operator-recoverable through the claims-ledger park subset, and
    FIFO-routing sweep grants needs a head-of-line bound first. Recorded
    at the method, source-pinned (exactly one runSerialized call site in
    the service; no enqueueCharacterWrite reference; the pin now ALSO
    sweeps the sweep and monitor siblings). QA judgment: STANDS as
    follow-up, owner 16, SEQUENCED after the honest occupancy bound
    (closing it first would import the unbounded hold into the sweep) and
    gated on the park subset staying intact.
  - H6: exchangeHardLock consumes the shared per-copy transfer-lock
    predicate, so the woc rail refuses exactly what the gold market,
    mail, and guild bank refuse; the ARMED state reports its own
    'bind_armed' reason (joins the woc_market.not_eligible wire group,
    REFUSAL_ERRORS is 49 rows; no new catalog leaf). The predicate body
    moved to the dependency-free src/sim/transfer_lock.ts leaf
    (item_instance_transfer re-exports it; exchange_eligibility keeps an
    empty runtime import graph). Both client pre-filters (Sell picker,
    trade-window exchange arm) inherit the refusal SILENTLY (no per-lock
    copy exists; phases 14/15 own explanatory copy if wanted). An
    unbind returns a commission piece to the ARMED state, covered.
  - EXTRACTION: src/sim/broker_custody.ts (extractTradableCopyImpl with
    the mount-dismount arm, grantTradableCopyImpl on the one-call
    canGrantCopies/grantCopies pair; thin same-named Sim delegates stay
    for the server bridge; grantTradableCopy finally has tests incl. the
    #2139 per-dimension refusals and a zero-rng pin with positive
    control). src/sim/daily_rewards_stub.ts holds the offline
    daily-rewards readout (value-pinned by its own suite). Monolith
    ceilings: sim.ts ratcheted 12660 -> 12428 exact; game.ts HELD at its
    exact pre-existing 10859 (the FIFO/fixups/depth-warn extractions paid
    line for line for the new host members).
  - FIREWALL: FIREWALL_ALLOWED is exactly ['src/sim/daily_rewards_stub.ts']
    with an existence + pattern-hit + read-only-projection shape pin (one
    export function, no control flow, type-only imports); sim.ts,
    types.ts, holder_tier.ts are fully scanned. The pattern set is
    calibrated against the REAL server corpus: lamports, base58, bs58,
    keypair, secret/private key, blockhash, spl-token, send/sign
    transaction, woc-amount shapes, money-affixed signature compounds
    (tx/txn/bond/settlement/burn/transfer/der/escrow/payer/seller/mint +
    signature_reused/required/field/header/verified/atMs/bytes), treasury
    suffixes + base/cut/fee/account. Bare 'signature' and 'token' stay
    out (49 measured content false positives; riftToken/chatTokens).
    QA amendments: non-vacuity floor 460 of the real 475 files (the
    recorded 474 was wrong at write time); FIREWALL_ALLOWED membership
    pinned exactly; the projection shape pin refuses re-exports,
    generator exports, enum/interface/default, dynamic import, try, and
    the logical operators, each with a named offender case; every
    pattern alternative has a positive control; the compound arms'
    missing LEFT boundary is documented as deliberate over-match.
  - OBSERVABILITY: the wocEscrowQueue counter (game-signals seam, kinds
    started / deadline_refused / depth_refused / books_dirty_refused /
    flush_failed, zero-backfilled) plus a 30s-throttled realm-global
    queue-wait warn. A checkout-failed OR begin-failed transaction is
    tagged TxNeverStarted (exported from woc_market_db, import-pinned)
    and maps to 'contended' on the escrow write ONLY. QA amendment: the
    counter is fully pinned (name literal, closed vocabulary both
    directions, zero pre-registration, per-kind increment per refusal
    arm, never-throws).
  - Handoffs: phase 06 opens with TWO directed-rail judgments: (a) the
    acceptDirectedOffer throw-arm residual, now THREE-legged since the
    ambiguous park arm (offer stuck 'accepted' with no listing, the
    seller quarantined and kicked, the copy parked out of the bags; the
    acceptance predates the park arm, so re-judge the acceptance itself);
    (b) whether directed delivery should stamp boundTo on hand-off and
    inherit the trade-window named-recipient exception (today a
    commission piece passes the gold trade window but is refused by the
    $WOC arm beside it; refusing is the safe direction, recorded at
    exchange_eligibility.ts). Phase 16 owns the escrow-queue additions
    from the hot-path round (the guild-book flush still rides the 60s
    logout allowance inside the deadline, the dominant occupancy term; a
    pendingKeys FIFO gauge; widening TxNeverStarted -> contended to the
    other guards, commitGrant's park arm now explicitly included; a
    completed/terminal sibling kind for the wocEscrowQueue counter; the
    per-listing serialize cost attribution; the gold-World-Market
    straddle: the escrow write persists the character row alone, the
    same crash window the 30s autosave has, pre-existing realm-wide;
    from the db-perf close-out: a realm-global escrow in-flight
    semaphore, a contention-class label on the 'contended' path, a
    draining refusal on createListing, and the FOR NO KEY UPDATE
    narrowing of the accounts lock)
    plus the saveAll-wave suppression measurement; phase 22's pre-enable
    audit gains one line (scan standing listings' item payloads for
    bindOnTrade-armed copies that entered before H6). The 04 ledger's
    "REFUSAL_ERRORS is 48 rows" is superseded: 49 since bind_armed.
    Accepted without code change (QA round; do not re-raise): the FIFO
    self-deadlock rule stays comment-enforced (a runtime guard would
    false-positive the sanctioned void-kick-from-job pattern); the
    escrow write skips saveCharacter's post-commit steps by design; the
    guild-bank deficit ladder is reachable at listing rate
    (self-inflicted only); architecture.test.ts's hand-rolled walker is
    pre-existing repo-wide debt.
- 02 QA (2026-08-11, session start 20fdcc5288, verdict PASS-WITH-FOLLOWUPS
  with every fix applied, gate GREEN at tip 301a8c7c22, PUSHED per R4):
  release/v0.37.0 synced (merge b40a178643; generated-i18n conflict
  regenerated; merge audit clean except the hud.ts ceiling, fixed by the
  preview_prewarm_wiring extraction, ceiling now EXACTLY 19338). Seven audit
  lanes plus a fresh fix-round re-review; the registry bullets above were
  updated in place and progress.md carries the full round. The db-seam facts
  phase 03 inherits: insertSettlement locks the LISTING row (snapshot
  predicate alone was proven insufficient against a concurrent closer);
  closeListingIfNoOpenSettlement guards the no-winner close arms; the
  reclaim PARKS failed settlements for the overdue default pass (never
  expires them; reopen refuses over failed rows); the suspend expiry
  releases a dead settlement's won bid via its CTE; 'contended' and
  'sale_conflict' are registered refusals; the boot repairs gate on index
  VALIDITY via to_regclass. Twelve mutation proofs all bit. Real-SQL suite
  41 green. NEXT = phase-03-delivery-exactly-once.md fresh session.
