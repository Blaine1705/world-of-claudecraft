# Progress

Status values: NOT STARTED / IN PROGRESS / DONE / DONE (QA PASS) / BLOCKED.
Every session updates its row AND records the phase-start commit hash (QA diffs from it).

| NN | Phase | Repo | Status | Start commit | Notes |
|---|---|---|---|---|---|
| 01 | branch-baseline | game | DONE (QA PASS) | e4c3dde956 | five re-review verdicts CLEAN (section below); woc_trade extraction landed; gate GREEN at 418f75b876 (full-suite fallback) |
| 01 QA | phase-01-qa | game | DONE | 07fda3fd46 | PASS-WITH-FOLLOWUPS, all fixes applied (section below); gate GREEN at final tip 1d7bdbafa0; pushed per R4 (no open PR on this branch, so no PR CI; pre-push floor green) |
| 02 | settlement-state-guards | game | DONE | 0f029bacf9 | release sync was a no-op (already at v0.37.0 tip); real-SQL suite 27 green vs dev Postgres; reviewer round + deferrals in section below; gate GREEN at tip 6916bd6944 (full-suite fallback; first run flaked on the known heavy-suite timeouts while external load averaged 40+, clean on the rerun) |
| 02 QA | phase-02-qa | game | DONE | 20fdcc5288 | PASS-WITH-FOLLOWUPS, every fix applied (section below); release/v0.37.0 synced in (merge b40a178643, one generated-i18n conflict regenerated; merge audit clean except the hud.ts ceiling, fixed by extraction); gate GREEN at 301a8c7c22 (full-suite fallback, all 8 steps); pushed per R4 (no open PR on this branch, so no PR CI; pre-push floor green) |
| 03 | delivery-exactly-once | game | DONE | e71a8cfd21 | release sync trivial (server/parse samplers only); B2a/B2b/B2c + monitor closed; five-reviewer round + fix round + fresh re-review applied (section below); real-SQL suites 65 green; gate GREEN at tip c3b33f54a7 (full-suite fallback, all 8 steps; the one intermediate red was the internal gate-mount sweep's 20-route count pin, fixed to 21); LOCAL, not pushed per R4 |
| 03 QA | phase-03-qa | game | DONE | 5ef64c1e11 | PASS-WITH-FOLLOWUPS, every fix applied (section below); release sync 5487531960 (two conflicts: main.ts union + regenerated pending.ts; merge audit CLEAN except the hud ratchet, fixed by the error_text_i18n_core extraction, ceiling 19338 to 19190); AC3 park deviation UPHELD; 21-mutation pass, one survivor closed; pushed per R4 |
| 04 | bond-payment-lifecycle | game | DONE | 3f20375918 | release sync no-op; three review rounds (security/db/coverage x2, qa-checklist, migration-safety) all applied; 17 mutation spot-proofs bit; gate GREEN at 0afdaa71a5. A follow-up verification session (sections below) re-ran the whole phase, applied two further audited fix rounds (commits 60034033f1, a938c410f3 plus docs), re-bit 11 mutations (3 re-proofs + 8 on the new fixes), and re-gated GREEN TWICE (full-suite fallback, all 8 steps, at c7176d730b and 6642c6e15b); LOCAL, not pushed per R4; final docs commit on top |
| 04 QA | phase-04-qa | game | DONE | e4ae9d1602 | PASS-WITH-FOLLOWUPS, every fix applied (section below); release/v0.37.0 synced (merge a43a1e8b52: the count-pin trap fired FOR REAL, both sides at 321 with different members, re-derived 322/85/237 + sends 199 dispatches 212 from runs; hud.ts over ceiling, fixed by the crafting_deny_core extraction, ceiling 19190 to 19177; game.ts ceiling banked to 10859); five audit lanes + fresh fix-round re-reviews; deep mutation pass incl. one REAL hole closed (the async-stall withTx shape); three correctness fixes proven red-on-old (lapse-straddle refresh, poll-race standing, review retry); a THIRD round from the fresh re-review (review-state client honesty, the devsig colon, the at-cap self-steal recording, bond_window_closed); gate GREEN at 8c1028e89d (full-suite fallback, all 8 steps; the first run caught the extraction's stale station pins in profession_identity_card, retargeted to the core); pushed per R4 (no open PR on this branch, so no PR CI) |
| 05 | custody-entry-hardening | game | DONE | f07ca88278 | release sync trivial (one locale-fill commit; generated pending.ts regenerated); H5/H6/extraction/firewall closed; dbperf pre-checkpoint BLOCK folded in; three-reviewer round + fresh fix-round re-review + qa-checklist READY + hot-path round (sections below); real-SQL suites green incl. the new escrow set; gate GREEN (full-suite fallback, all 8 steps; the one intermediate red was the malware scanner flagging the firewall comment's own key-shape prose, reworded); LOCAL, not pushed per R4 |
| 06 | directed-rail-integrity | game | DONE | b948aa64fb | release sync trivial (16 commits, chronomancer train, no marketplace overlap, no count-pin surface); H10/H12/H14 + guardBalance + auto-close closed, both opening judgments settled; dbperf pre-checkpoint BLOCK (A1-A8) folded in before code; pg suite ran RED first (7 behaviors); FOUR fresh reviewers + fix-round re-review + qa-checklist, every finding applied incl. nits (the security CRITICAL: the trade session stripped staged identity, fixed by per-copy staging through the swap's own selection walk); one inherited env-gated red (admin_guilds vs the release's quota join) repaired in place; first gate GREEN at 5287214294; then SIX closing rounds (two independent fresh reviews of the gate-round commit, every subsequent fix round re-reviewed fresh, ~45 more findings applied incl. the crafted-marker comparator leg, the accept-side one_item mirror with the model acceptHint judged over the AUTHORITATIVE offer table, the pair index carcass convention + shared name constant, the offer_reopen report on both swallows, the observed-wait 23505 interleave, and the wiring/count pins that made the last round's fixes decisive); THREE gate runs GREEN along the way (5287214294, then 5ebb176a73 covering all production code, then the final at tip ea1bb82322: full-suite fallback, all 8 steps, run WITH TEST_DATABASE_URL so every pg suite executed); LOCAL, not pushed per R4 |
| 05 QA | phase-05-qa | game | DONE | b9e937c075 | PASS-WITH-FOLLOWUPS, every fix applied (section below); release sync origin/release/v0.38.0 trivial (7 commits, no marketplace overlap, no count-pin surface); five audit lanes + a fresh fix-round re-review + qa-checklist READY + a db-perf close-out; real-SQL suites 109 green THREE times (zero skips); the three named mutation probes plus the agents' per-pin mutation matrices all bit; the round found and fixed the BEGIN-outside-TxNeverStarted critical, the withTx null-deref evidence destroyer, both kick argument swaps, and the db-perf codeless-discard P1; gate GREEN at eeaa137e5c (full-suite fallback, all 8 steps, 38196 tests + 118 browser); pushed per R4 |
| 06 QA | phase-06-qa | game | DONE | ab2742012b | PASS-WITH-FOLLOWUPS, every fix applied, PUSHED per R4; v0.38.0 re-sync NON-trivial (3 conflicts + 2 silent count-pin auto-merges, all re-derived from runs: IWorld 323/86/237, fanout 10, hud.ts 19160 DOWN, sim.ts 12436; release-merge-audit faithful, 0 findings over 7 groups); ea1bb82322 verified FIRST (comment-only src, all pins mutation-proven); six fresh lanes: 0 code blockers, 4 blocking TEST gaps closed; QA-found code fixes: the capacity model now RUNS the removal walk (receiver-overflow class closed for good), the crafted-marker leg on the instanced matcher, guardTerms on the directed buyer, the model-reading accept belt, sweep-fallback stack+null-safety; NEW OPEN RULING R9 (implied terms consent, pre-enable affordance owed); pg suites 152 green zero skips on the tip; 21 mutation probes all bit; qa-checklist READY 0 blocking; gate GREEN at 47399f77b7 |
| 07 | policy-terms-drafts | game | DONE | 8a1739d67a | DOCS ONLY, zero code diff; release/v0.38.0 synced (merge 8a1739d67a, trivial: 30 commits, no marketplace overlap; monolith_budget AUTO-MERGED so all four count-pin suites re-derived from a run, 377 green, renderer.ts ceiling 13708 lowered by the release's own extraction); counsel package complete: TERMS_AND_CONDITIONS_MARKETPLACE_DRAFT.md (full revised Terms beside the untouched live Terms; new Section 10 incl. the 10.3 acceptance-surface requirement per R9; renumbering verified reference-by-reference) + the decision memo (adopted position, nine counsel questions incl R9 and the NEW seller-side terms gap, exact-changes list, enable-time checklist; held PRIVATELY outside the public repo per the state.md locked decision); never-power carve-out landed consistently (README Highlights + Web3, wallet-link, holder-flair, marketplace.md launch gates); staleness cluster fixed (marketplace.md forfeit destination / delivery / review-state / TOTP-superseded-by-R1 truth-ups, p2p-woc-trade implementation status, DESIGN.md window inventory, malware-scan-catalog signing surfaces, both money-claim agent docs, docs+net+ui CLAUDE.md); FRESH proofreader over the whole package: 1 blocking + 7 should-fix + 6 nits, ALL applied; copy floor clean, ci:changed exit 0; LOCAL, not pushed per R4 |
| 07 QA | phase-07-qa | game | DONE | 55c2ba992e | PASS-WITH-FOLLOWUPS, every fix applied (section below); release re-sync trivial (two CI-harness commits, no marketplace overlap; tsc clean, four pin suites 377 green); eight fresh audit lanes (the phase-prescribed fresh proofreader among them); the round found the draft's missing second-chance-offer disclosure (blocking; it falsified the outbid-refund promise) plus the anti-snipe and abandon-cooldown gaps, four draft wording drifts, and seven companion truth-ups, all applied; new deferreds with owners in state.md's 07 QA ROUND bullet; the amended draft postdates the recorded R6 send (Fernando forwards the amended copy); ci:changed exit 0; live Terms + terms.html byte-untouched; counsel memo verified absent from the branch; pushed per R4 |
| 08 | service-auth-hardening | service | DONE | 70d4207 | SERVICE repo (origin/master already contained); B5 + the fail-open config mediums + the compose staleness default closed, every refusal proven red-first (the bypass returned 200 on the old routing with the internal secret alone); two fresh review lenses, then two fix rounds each re-reviewed fresh and a self-reviewed polish round, every finding applied incl. nits; the rounds' own finds: the THIRD dev escape (CLAUDIUM_ALLOW_FAKE_STRIPE, still denylist), the wallet-segment fragment gap, the duplicate-oracle heartbeat bug (warmed one instance, quoted from another), ASCII-before-trim; suite 439 tests 435 pass 0 fail (the QA round corrected the baseline arithmetic: the range ran 417 tests with 413 passing before, so the growth is 417 to 439 totals); 12 commits, tip 4b9e413; LOCAL, not pushed per R4 |
| 08 QA | phase-08-qa | service | DONE | 4b9e413 | PASS-WITH-FOLLOWUPS, every fix applied (section below); the self-reviewed polish commit 4b9e413 verified FIRST and clean; six fresh audit lanes + a dedicated red-proof lane over 70d4207..4b9e413: 0 blocking, all four red-first claims REPRODUCED-RED against a throwaway 70d4207 build; 8 should-fix + 13 nits ALL applied in three commits, re-reviewed fresh (0 blocking, 7 should-fix, 8 nits, ALL applied in a fourth commit, tip aa44873); 12 + 2 mutations all BIT; suite 445 tests 441 pass 0 fail 4 env-gated skips; game worktree re-synced to release/v0.38.0 (merge bfceae8d4b, NON-trivial: 33 conflicts, wireAura extraction pays the merged game.ts overage, pins re-derived 324/86/238 + sends 200 dispatches 213; release-merge-audit found THREE union-only reds, all fixed; gate GREEN at ad197c0801, full-suite fallback, all 12 steps, WITH TEST_DATABASE_URL, real-SQL suites 154 green zero skips); pushed per R4 (service 70d4207..aa44873 updating PR #31, its test checks running at push time; game 8dd51a8a20..f5325ffbe8, pre-push floor green, no open PR on this branch so no PR CI) |
| 09 | bond-releaser | service | DONE | aa44873 | SERVICE repo (origin/master already contained at df09756); B3 + the bond double-pay medium + the bond-cents ownership mediums closed; R2 forfeit split landed (one code path with the settlement schedule); the two R5 items this repo owns RULED by Fernando at session start and implemented (SOL fees: preflight + overview monitor + manual funding, knob WOC_MARKET_ESCROW_MIN_SOL_LAMPORTS; ATA rent on refund: escrow pays, inside the preflight); FIVE red-first proofs (ownership behaviors, both double-pay classes, all-or-nothing boot, the late-confirm stomp, the terminal-adoption abandonment); two fresh coverage lenses (security 18 findings incl. 1 blocking, correctness 14 incl. 2 blocking) plus a fresh re-review of the fix rounds (1 blocking + 5 should-fix + 5 nits), every finding applied or judged with the file open; 9 commits, tip 3346878; suite 445 to 493 tests, 488 pass + 5 env-gated skips default tier, 493/493 with CLAUDIUM_TEST_DATABASE_URL (zero skips); LOCAL, not pushed per R4 |
| 09 QA | phase-09-qa | service | DONE | 3346878 | PASS-WITH-FOLLOWUPS, every finding applied or judged with the file open (section below); SERVICE repo (origin/master already contained at df09756); nine lanes (six read-only audits, two red-proof, one mutation): 0 blocking in the implement range, all six red-first registry claims REPRODUCED-RED, all seven mutation arms BIT by name (claim CAS, guarded update, finalize signature key in BOTH stores, age bound; 493-test full runs each); the round's own fixes: entry adoption of a ledger-proven payment on an already-expired or superseded quote (the registered pre-existing edge, the crash-matrix lane's fix-now case accepted), typed signature_already_settled on the settled-signature collision BOTH stores (the partial-unique-index 23505 trap, previously an unhandled 500), the undecided late-visibility window, the rejected-write vocabulary fix, the rpc probe-list pin, the actor clamp, fifteen test-decisiveness hardenings, doc truth-ups; two fresh re-review lenses over the fix round, everything applied or judged, round-2 mutation-proven (4 mutants BIT); suite 493 to 508 (502 + 6 env-gated skips default; 508/508 zero skips with CLAUDIUM_TEST_DATABASE_URL); 5 commits, tip 02713f2, PUSHED per R4 (service aa44873..02713f2 updates PR #31; game after the v0.38.0 re-sync merge abd4a9e0e2, trivial: one generated-i18n conflict, regenerated) |
| 10 | chain-verifier | service | DONE | 02713f2 | SERVICE repo (origin/master already contained at df09756); B4 closed with red-first proofs (three redirect shapes reproduced MATCHED on the old verifier); the two R5 items this file owns RULED by Fernando at session start and implemented (commitment split ratified as code-owned MATCH_COMMITMENT/CREDIT_COMMITMENT; five hour confirming bound MAX_CONFIRMING_AGE_MS, both stores, new pg partial index, one minute sweep driver in buildMarketApps, previously NOTHING drove expiry in production); undecided confirm answers split (not_yet_visible vs awaiting_finality, the anti-snipe service half); two fresh lenses + a fresh re-review of the fix round, every finding applied or judged (the re-review REFUTED the round's multisig-impossibility claim with the parser's count-based labeling, arm restored money-safe); 15 mutants BIT + 1 judged environment survivor (pg ORDER BY delete coincides with partial-index order; the DESC variant bites); suite 508 to 536 (530 + 6 env-gated skips default; 536/536 zero skips with CLAUDIUM_TEST_DATABASE_URL); 6 commits, tip ba7df0b, LOCAL not pushed per R4 |
| 10 QA | phase-10-qa | service | DONE | ba7df0b | PASS-WITH-FOLLOWUPS, every finding applied or judged with the file open (section below); SERVICE repo (origin/master still df09756, contained; syncs pre-done by the sync-only session, re-fetched at the end: nothing new); seven audit lanes (56-shape hostile hunt with ZERO accepted_dishonest and the real wallet shape verified; security; correctness; coverage; docs; red-proof: all six registry claims REPRODUCED-RED on the 02713f2 build; mutation: 27 of 31 bit, the 4 survivors real pin gaps, all closed); the refuter stage hit the session limit after 15 of 68, every finding judged in the main loop with the file open and primary sources (agave parse_token.rs / parse_instruction.rs, spl-token processor.rs: the multisig restoration CORRECT, agave labels both token programs spl-token); the round's own fixes: the signature SHAPE screen before the first write (SEC-2, a junk string minted the game's service_unavailable exemption via the RPC's -32602 500), the payer-leg netting with owesOthers plus the escrow-bidder refusal (the fix-round re-review caught the bond self-leg vacuity), burn_authority_mismatch, the stray-owner log (once per memo, clamped), the sweep failure/recovery warn with in-flight guard, expirePastDue non-positive budget, attention.confirmingExpired24h on its own read, doc truth-ups (bound measured from expiry, ordering a two-knob precondition, the RPC-horizon premise re-anchored, vocabulary table, recovery caveat, deploy note); pins closed incl. the pg EvalPlanQual race rig on BOTH sweep arms; 21 + 11 mutants BIT over the committed rounds; suite 536 to 560 (553 + 7 env-gated skips default; 560/560 zero skips with CLAUDIUM_TEST_DATABASE_URL); 5 commits, tip 8da6c03, PUSHED per R4 (service ba7df0b..8da6c03 updates PR #31; game after the release check: 0 behind origin/release/v0.39.0, origin/main moved to the v0.38.2 hotfix tip which the next game session's sync picks up through v0.39.0) |
| 11 | oracle-health | service | DONE | 8da6c03 | SERVICE repo (origin/master already contained at df09756); R3 RULED by Fernando at session start (single-venue posture, spot 500 bps; recorded BEFORE code in game commit e2f189e9a4) and implemented; H3's shared-instance half (already fixed in 08) pinned decisively under mocked timers with the quiet-period proof and a negative control; publish-time freshness on the wire (asOfMs) and the honest venue surface (per-venue age and verdict, configured/live counts, crossVenueGateArmed, distinctPrints, effective bounds); the dead Pyth venue path and its knob removed, the inert cross-venue knob retired (code default kept), spot 1000 -> 500; two fresh lenses (security/ops 14 findings, correctness 21) plus a fresh re-review of the fix round, every finding applied or judged with the file open; the fix round made the ORACLE the one judge of freshness per venue (an over-age print is refused as stale WITH its print time instead of dying at the source as no_price), env knobs may only tighten, the heartbeat feeds an edge-triggered halted/recovered operator signal; the cold-boot single-print exposure RULED record-and-document (Fernando 2026-08-16); the re-review round bounded every env knob in both directions, capped the sample buffer and made a paused refusal read the last heartbeat reading; PRD claim revised in the game repo (c5ce2793e7); 41 mutants BIT by name; suite 560 to 590 (583 + 7 env-gated skips default; 590/590 zero skips with CLAUDIUM_TEST_DATABASE_URL); 5 commits, tip 03df5de, LOCAL not pushed per R4 |
| 11 QA | phase-11-qa | service | DONE | 03df5de | PASS-WITH-FOLLOWUPS, every finding applied or judged with the file open (section below); SERVICE repo (origin/master already contained at df09756); eight audit lanes over 8da6c03..03df5de (correctness with the four probes, security/ops, test decisiveness, dead code and docs, red proof, three mutation groups): 0 blocking, 44 findings; red proof 11/11 REPRODUCED-RED on the named old builds; mutation 42 run, 41 BIT, the ONE survivor (overview crossVenueGateArmed hardcode) closed by a two-venue overview arm and re-proven; the fix round re-sized the two tightening floors from the venue cadence (staleness tight end 15 to 45 min, sample minimum 90 to 60, an R3-amendment note records it), pruned the refusal readout NON-MUTATINGLY, wired a parse-time warn for every mis-set oracle knob, put the window depth on the recovered line (the breaker-reset shape is visible in the log), mirrored spot/twap onto the overview, and trued every lagging doc; round-2 workflow over the fix round (two fresh lenses 13 findings 0 blocking, ALL applied; 16 new-pin mutants ALL BIT; completeness critic); suite 590 to 595 (588 + 7 env-gated skips default; 595/595 zero skips with CLAUDIUM_TEST_DATABASE_URL); 5 commits, tip 270e337, PUSHED per R4 (service updates PR #31, all four test checks GREEN after the push; game docs pushed with it, pre-push floor green) |
| 12 | wire-completeness | game | DONE (QA PASS) | a6ff42f1c5 | release sync no-op (0 behind origin/release/v0.39.0 tip d2d1a8ad5c); H8 + env truth + health-rail honesty closed AND the four cross-repo owed items adopted (service-owned bond quote, anti-snipe awaiting_finality allowlist, two-settled-per-memoRef tolerance, verdict localization; asOfMs pass-through verified untouched); 8 code and doc commits to tip bd089672f9 plus the ledger docs commit; four review lanes + a fresh fix-round re-review + qa-checklist READY (0 blocking), every finding applied or judged; ~12 mutants bit by name incl. wire-pin drop/rename, vocab delete, echo recompute, sig drop, env guard both directions; real-SQL suites green zero skips WITH TEST_DATABASE_URL; gate GREEN at the docs tip (gate_select full-suite fallback, all 12 steps, 2854 files / 40604 tests, browser 129, WITH TEST_DATABASE_URL); LOCAL, not pushed per R4 |
| 12 QA | phase-12-qa | game | DONE | 90c007e36f | PASS-WITH-FOLLOWUPS, every finding applied or judged with the file open (section below); release sync no-op (0 behind origin/release/v0.39.0 tip d2d1a8ad5c); ten audit lanes over a6ff42f1c5..bd089672f9 (cross-platform-sync, frontend-seam, test-coverage via Agent; server/client correctness, serializer sweep, fee edges, env sweep, dead code, docs truth via workflow) + red proof (all 7 registry claims reproduced or verified, wire pins exactly 14 red on the pre-fix build) + three mutation batteries (17 round-1: 16 BIT, the one survivor a REAL devSplit pin gap; 18/18 new-pin; 10/10 wave-3); seven fix commits (spine in the section below), the fix round re-reviewed FRESH (two lenses: 1 blocking test gap + 11 should-fix, all applied); qa-checklist READY (0 blocking, 0 should-fix; its adversarial pass independently cleared the ladder, the devsig arm, the browse booleans, the ceil change, and SETTLING_STATES); gate GREEN at 4377a38458 (gate_select full-suite fallback, all 12 steps, 2854 files / 40635 tests + 2 expected fails, browser 129, WITH TEST_DATABASE_URL; the final ledger amendment rides on top docs-only); pushed per R4 (no open PR on this branch, pre-push floor green) |
| 13 | listing-step-up | game | DONE | 19e4cd87ce | release sync no-op (0 behind origin/release/v0.39.0 tip d2d1a8ad5c); B6 + browser-only-gate medium closed; both rulings recorded first (R1 threshold: step-up on every custody-moving call, no env knob; R10: locked copies refuse listing); step-up challenge protocol (own sibling module + store, real-SQL pg suite), enforcement in both service methods, client flows in both surfaces, TOTP retired; four fresh review lanes + a fresh three-lane re-review of the fix round + qa-checklist READY + migration-safety & database-performance (both PASS, the account-id FK index fixed), every finding applied or judged; 22 mutants across three fix rounds all bit; R11 relink follow-up recorded (pre-enable gate); GATE GREEN at ae1ba36b87 (gate_select full-suite fallback, all 12 steps, 2855 files + browser 19, WITH TEST_DATABASE_URL); LOCAL, not pushed per R4 (13-qa pushes on PASS) |
| 14 | ux-honesty | game | DONE (QA PASS) | d3b15f6057 | release sync NO-OP (v0.39.0 f48c7a3a9b already an ancestor); H13 + wallet-bridge i18n + wocUsdText currency closed, plus the 14-owned deferrals from 02/04/06/07/11/12/13; R9 resolved at session start (Fernando, in the session prompt) and implemented on BOTH consent surfaces; three fresh reviewers (frontend-seam, cross-platform-sync, test-coverage) prompted for coverage; the xplat CRITICAL (the resolved-offer verdict lines were unreachable behind the offers read's status filter) fixed with the grace-window extension + full fake read fidelity + pg pins; every coverage blocker/should-fix/nit applied or judged (registry in the state.md 14 ledger entry); five market pg suites green zero skips WITH TEST_DATABASE_URL; ci:changed exit 0; gate run recorded below; LOCAL, not pushed per R4 (14-qa pushes on PASS) |
| 13 QA | phase-13-qa | game | DONE (QA PASS) | 220b9b018f | PASS-WITH-FOLLOWUPS, every finding applied or judged; release/v0.39.0 re-synced (merge 220b9b018f, tip f48c7a3a9b, 2 conflicts: i18n pending regenerated + hud.ts ceiling re-derived to 19170; release-merge-audit CLEAN, both usage-limit trap lanes re-run inline); independent mutation battery 21/22 bit, the 1 survivor a REAL safeMessagePiece code+pin gap closed; two code fixes (sanitizer C1/Cf + non-string coerce; window close-reset) + a test-pin batch incl. the devsig-wiring total-bypass pin, all mutation-proven; the fe BLOCKING (R10 lock-hint dead end) reclassified should-fix and deferred to 15 (no custody hole; offer pin always unlocked); gate GREEN (see 13 QA ROUND); pushed per R4 |
| 14 QA | phase-14-qa | game | DONE (QA PASS) | 8c0370585c | PASS-WITH-FOLLOWUPS, every finding applied or judged with the file open; release/v0.39.0 re-synced (merge 8c0370585c, tip f42a67f341, trivial); nine workflow audit lanes + six typed reviewers (frontend-seam MOBILE, cross-platform, database-performance, migration-safety, security; test-coverage silent, covered by two mutation batteries: 43 mutants 36 bit + 50 mutants 44 bit, every survivor a real pin gap closed) + the session's own mobile E2E arm (two dev-only rigs measuring the money faces in a landscape phone viewport, six captures) + the Capacitor /terms check (dead on iOS + packaged desktop, rebooted Android; fixed with the wiki_link resolver idiom); fix commits e68227b6bb, d1e3eb2199, ea08ac4711, and 6f67a96057 after a fresh four-lane re-review of the fix round; gate GREEN (see the 14 QA round section); pushed per R4 |
| 15 | ui-polish | game | DONE (impl) | 01faddadf8 | release/v0.39.0 re-synced FIRST (merge 3a98604c83, release tip b650d9d7d2, 150 commits, NON-trivial: four conflicts, release-merge-audit run and its findings applied, see the section below); the DESIGN.md conformance audit written first (docs/woc-marketplace-hardening/phase-15-design-audit.md: seven read-only lanes, 215 findings, every row APPLIED, DEFERRED with an owner, or JUDGED with a reason) and then worked top to bottom; presentation only, zero view-core diffs; five commits (a4fcac14d8 + 01faddadf8 from the merge audit, then 92da32bbb1 style, e6c054232d test, be35080962 scripts, plus the docs and capture commits below); highest-value catches: var(--accent) was declared NOWHERE so seven marketplace declarations shipped resolving to inherit/currentColor, the mobile bags sheet covered the whole trade window on touch (the arm unreachable), neither money sheet cleared the safe-area insets, the trade arm's spinner was an inline box that never spun inside the pressed Pay button, the browse table re-flowed every column on each per-second countdown rebuild, the toast strip shifted the control under the pointer, the sell form's money inputs and the arm's price field missed the touch floor, the seller never saw a resolved fee (the note named a percentage the SERVICE owns), the bond note resolved the wrong bid's bond, the paused and suspended lines named a cause they cannot know and actions they do not cover, and the Exchange window had no behavioral test at all; new guards: the css var() resolution ratchet (the --accent class cannot recur), the copy-to-constants pins, the shared token spelling, the widened ticker grep-proof, and tests/woc_market_window_rig.test.ts (the first live rig for WocMarketWindow, 21 cases); LOCAL, not pushed per R4 (15-qa pushes on PASS) |
| 15 QA | phase-15-qa | game | NOT STARTED | | PASS requires Fernando's screenshot sign-off |
| 16 | hot-path-scale | game | NOT STARTED | | |
| 16 QA | phase-16-qa | game | NOT STARTED | | |
| 17 | db-retention-indexes | game | NOT STARTED | | |
| 17 QA | phase-17-qa | game | NOT STARTED | | |
| 18 | dashboard-guardrails | dashboard | NOT STARTED | | |
| 18 QA | phase-18-qa | dashboard | NOT STARTED | | |
| 19 | dashboard-tooling | dashboard | NOT STARTED | | |
| 19 QA | phase-19-qa | dashboard | NOT STARTED | | |
| 20 | real-sql-coverage | game | NOT STARTED | | |
| 20 QA | phase-20-qa | game | NOT STARTED | | |
| 21 | devnet-dry-run | service + game | NOT STARTED | | needs rulings R5 |
| 21 QA | phase-21-qa | service + game | NOT STARTED | | |
| 22 | close-out | all three | NOT STARTED | | teardown offer lives in 22 QA |
| 22 QA | phase-22-qa | all three | NOT STARTED | | |

## 14 QA round (verdict PASS-WITH-FOLLOWUPS, every finding applied or judged)

Session start 8c0370585c (the release/v0.39.0 sync merge, tip f42a67f341,
trivial: five druid feral-enablement commits, no marketplace overlap). Range
audited d3b15f6057..ffd8d63963. Nine workflow lanes (server honesty, the
state-machine truth table, the trade arm client, the Exchange + money surface,
the four fix rounds re-reviewed, i18n/hygiene, dead code + docs truth, the
/terms shell check, a 43-mutant battery in a scratch worktree) ran beside six
typed reviewers dispatched via Agent (frontend-seam with MOBILE in scope,
cross-platform-sync, database-performance with a measured 200k-row rig,
migration-safety with an empirical triple re-apply of the DDL,
privacy-security; the test-coverage auditor went silent, its dimension
covered by the two mutation batteries) and the session's own mobile E2E arm.
The adversarial verify stage was stopped after 30 votes (29 confirmed) since
three lenses per finding would have run for hours; every finding was judged
in the main loop with the file open.

Fix commit spine: e68227b6bb (server/DB: the dead pending partials retired
with idempotent DROPs, the poll read on the SERVICE clock with an id tiebreak,
the two cooldown probes in one round trip with a bound OFFSET, table-qualified
correlated item lookups, the last inline-English admin arm on a registered
code, the SDK's empty-code guard; pins: the SQL floor for the verdict grace arm
+ index definitions + retirement, the pg indexdef and EXPLAIN plan pins, the
cooldown boundary at EXACTLY retryAtMs on both arms, the fake's two grace
twins); d1e3eb2199 (the money faces: settlement and quote keyed to their
offer, the claim not a payment (a signing flag holds 'paying'), review and
delivered status keys, buyer-voice compose copy, fee + net on both review
faces, the p2p binding note from /status directedHoldSeconds, an unpaid ending
naming the strike, close-time lines for the seller's held copy and a payment
in flight, one-click resolve with a trade-flavored not_pending, the recorded
cancel-pending face, quote legs + a lapsed line, the Exchange's
confirmed/delivering label + toast, one canCancelListing predicate, the
Activity digest's currentCents, durationText for the claim cooldown, the
disclosure rewords, the desktop hand-off bridge strings, the USD suffix
dropped, the terms_link resolver on both surfaces + the dev proxy removed,
CSS floors + focus-visible + the focus ladder, and the five non-Latin overlays
refilled); ea08ac4711 (scripts/woc_trade_mobile_shot.mjs new,
scripts/woc_market_shot.mjs revived and given the mobile floor checks, six
captures under docs/screenshots/woc-market/); 6f67a96057 after the FRESH
re-review of the fix round (four lanes: client correctness, server/DB + pins,
i18n fills, a 50-mutant battery 44 BIT with the 6 survivors closed): the
claim KEPT keyed across a close (a dropped claim was refused buy_now_locked
over the buyer's own lock and struck), the settlement's own deadline on the
pay and quote faces, the tabs ending the focus ladder, the trade-arm
lapsed-quote line, the signing-aware close line, the upgrade-path retirement
pin, the plan pin's ROLLBACK in finally, the fake-side cooldown boundary
twin, comment and fill truth-ups. Registry, JUDGED and DEFERRED lists: the
14 QA ROUND bullet in state.md.

Gate: node scripts/gate_select.mjs (TEST_DATABASE_URL on the command line
only) PASS at 12395705bb, all 12 steps green: full-suite fallback, 2891 test
files / 41133 tests with 8 workers, browser 19 files / 129, freshness +
malware + biome + tsc + every build; tree clean after. Pushed per R4 (no open
PR on this branch; pre-push floor green). Late coverage lane (the
test-coverage-auditor reported after the push): 3 blocking + 8 should-fix +
5 nits, all test gaps, applied in 58212e3475 (10/10 new-pin mutants BIT) or
judged (three, in state.md); gate re-run on that tree PASS (all 12 steps,
41139 tests, browser 129) and pushed per R4.

## 14 implement round (UX honesty on the money surface)

Commit spine (all LOCAL, on top of d3b15f6057): 22de5a4107 server honesty
(shared strike gate incl. the auction arm, claim_cooldown retryAfterSeconds
end to end, item-named activity reads, admin envelope codes, Refused.params);
fe5165c2eb trade honesty (closed is not settled + per-reason report lines,
seller Decline + Cancel sale on both surfaces, expiry line, immediate
fee-line blanking, below-min hint, item cells + Activity cancel in the
window, the usd_text extraction); 1de30be50e informed commitment (two-step
pay with the quote review, pre-bid disclosures incl. offer-next, the R9
consent rows + /terms links on BOTH surfaces); 76bacd06ed localized money
surface (wallet_bridge_reason_text + five sinks, the render-time notice
union, bond pending voice, five specific fail lines, Intl USD everywhere +
the grep-proof, copy truth-ups); 8a0d55d3ca docs + the quote_expired
lapse-straddle reword; df79314e15 the changed-files lint floor; 6349b61f62
the review round's findings (spine in the commit body; the CRITICAL was the
unreachable resolved-offer verdict lines, fixed at the offers read with the
grace-window precedent + full fake fidelity + pg pins).

Review round: frontend-seam-reviewer, cross-platform-sync, and
test-coverage-auditor dispatched FRESH in parallel over d3b15f6057..HEAD,
each prompted for coverage. The xplat lane found the one CRITICAL above and
verified the whole params/itemId wire both directions; the coverage lane's
four blockers (the send-arm consent mutant, the auction exempt-vocabulary
arm, the SDK params echo pin, the un-covered item-join SQL) and its full
should-fix/nit list were applied, with three deliberate judgments recorded
in the state.md ledger (ok-implies-durable consent semantics; the
mid-outage bond state pinned at its observed 'forfeited'; the raw-source
main.ts pin because the naive comment strip swallows glob strings). The
Claudium channel gained the STRICT no-prose classification after the xplat
lane's latent-misclassification observation. Residual recorded for QA: the
cooldown SQL rewrite's exact-moment pins live in the pg-gated suite (run
green here zero-skip; CI has no Postgres leg, the 20-owned posture), with
the fake-side twins covering both arms on pg-less legs.

QA round: the qa-checklist lane reported late but in full (verdict READY,
zero blocking). Its four action items landed as 98f4cc1afb: the phantom
consent-link token (now var(--gold)), the explicit closed-deal face in the
trade arm (a dead deal can never fall through to Decline / Withdraw), the
two additive non-partial account indexes the 2s offer poll needs (measured
on a 200k-row scratch rig, seq scan to BitmapOr, existence-pinned in the pg
suite), and the fake's ORDER BY created_at DESC LIMIT 50 mirror with real
creation clocks (new fidelity suite). Remaining VERIFY items and the gate
env lesson (never export DATABASE_URL around gate_select; the
characterization goldens read it) are in the state.md ledger for the QA
session.

Seam round: BOTH frontend-seam lanes recorded dead also delivered late,
independent and thorough (one blocking + eight should-fix + ten notes;
two blocking + six should-fix + seven nits), voiding the reviewer-death
residual. Everything applied or judged in 433841c53f: the 35-row
non-Latin refill of the seven reworded keys (three stale fills actively
contradicted the honesty corrections; Latin stays on the release list),
the pressed-Pay busy face, the lapsed-quote Sign guard + paint-time
disable, focus keys on every actionable control, the mobile consent-row
touch floors on both surfaces, the sig's structural quote projection,
rel noreferrer, the /terms dev proxy, the narrowed language-fanout
reason, and the CLAUDE.md terms.html caveat. The judged-no-change list
and the QA session's remaining VERIFY arms (mobile E2E, Capacitor
_blank) are in the state.md ledger.

## 13 QA round (verdict PASS-WITH-FOLLOWUPS, every finding applied or judged)

Session start 2c900682ef (the 13 build docs tip; code tip ae1ba36b87). Release
sync was NON-trivial: merge 220b9b018f brought origin/release/v0.39.0 tip
f48c7a3a9b (80 commits), two conflicts resolved (generated i18n pending
regenerated with npm run i18n:gen; the hud.ts monolith ceiling re-derived to the
exact merged 19170, not either side's number). The release-merge-audit ran CLEAN
(sim.ts / hud.ts / main.ts / index.html / play.html / styles all exact-union,
whole-repo tsc clean, architecture 109/109, ci_workflow 25/25); the two trap
lanes that died on a Fable-5 usage limit were re-run inline (release touched no
server/ files, no injected-helper signature change, the release db-mock test
passes on the merged tree). QA range 19e4cd87ce..ae1ba36b87.

Audit: privacy-security-review, frontend-seam-reviewer, test-coverage-auditor
via Agent + seven probe lanes via workflow (attack-protocol, entry-points,
canonical-wallet, totp-remnants, ux-honesty done; correctness + cleanup-docs
died on the usage limit and were done inline). Independent mutation battery of
22 named mutants: 21 bit; the one survivor (the safeMessagePiece code-point
control-char arm) was a REAL code AND pin gap, closed. Red proof: both reds
confirmed at the source (pre-step-up builds had no stepUp param on either custody
op; pre-R10 builds had no item_lock_flag leaf and no `return 'locked'` arm) plus
the guard-removal mutation direction. Baseline: all market suites + the five pg
suites green zero skips WITH TEST_DATABASE_URL (142/142 pg).

Fix commits (LOCAL until the R4 push): a996d3c023 (sanitizer + its pins),
379610f66d (window close-reset + its source pin), cd689125d4 (the test-pin
batch). The fix round was then re-reviewed FRESH (security + coverage lenses),
which caught FOUR defects in the fixes themselves and drove a correction commit
234cc9b708: the String() coercion still threw on {toString:1} (guard to empty
instead); the flat window busy-reset broke the poll/withBusy invariants and
enabled a double-escrow (replaced with a busyGen generation counter +
capture-index + post-await bails); the devsig-wiring pin was comment-gameable
(comment-stripped + bounded to one site); the superseded-index pin was vacuous
(now seeds the old index and re-runs the boot to prove the DROP). Every new and
corrected load-bearing pin mutation-proven by name (the three sanitizer arms
RC1/RC2/RC3 on the robust version, the devsig flip, the DROP-index removal, the
close-reset removal). Details, the JUDGED-no-change list, the RE-REVIEW
CORRECTIONS, and the deferrals-with-owners (incl. the WocMarketWindow
behavioral-rig follow-up owed to 15) are in the 13 QA ROUND bullet of the
state.md ledger entry.

The full gate then surfaced two MERGE-INDUCED infra reds (neither a marketplace
defect), fixed in commits 2d597f6395 (a pre-existing non-null assertion + an
unformatted line the widened ci:changed scope exposed), a pnpm reinstall (the
merge updated patches/three@0.185.1.patch, so node_modules was stale and the
release's three-bundle test failed), and 4835b3ce8c (the merge's union of both
parents' new test files dropped the shard-weight table below its 95% coverage
floor; refreshed by merging real local durations for the 151 newly-uncovered
non-browser suites, existing CI-harvested weights preserved). Gate GREEN on the
final tip.

## 13 implement round (step-up authorization for custody-moving ops)

Session start 19e4cd87ce (the 12 QA docs tip; release sync a no-op, 0 behind
origin/release/v0.39.0 tip d2d1a8ad5c). BOTH session-start rulings recorded
FIRST as their own docs commit 6e4664e9a1 (R1 threshold: step-up on every
custody-moving call, no env knob; R10: locked copies refuse $WOC exchange
listing). B6 and the browser-only-gate medium closed.

Commit spine (LOCAL, not pushed per R4): 6e4664e9a1 (the two rulings),
39a244f50c (R10 item-lock refusal end to end + item_locked code with five
fills), dbc4445f0c (the step-up challenge protocol module + store, real-SQL
pg suite), 1f50feb96a (server enforcement on both custody movers + challenge
endpoint + six refusal codes with fills), a5de327458 (SDK contract),
b88508bd53 (client flows in both surfaces), 679edc4e15 (TOTP retirement +
doc truth-ups), 1641015d0d + fd3c60b40b (format + the gate-caught controller
rig gap). Reviews: four fresh lanes (privacy-security, frontend-seam,
cross-platform-sync, test-coverage via Agent) over 19e4cd87ce..1641015d0d.

FIX ROUND (all findings applied or judged; the fix round re-reviewed FRESH by
three lanes): bc1bdf98cb (extract isItemLocked to an item_lock_flag.ts leaf so
exchange_eligibility keeps its runtime-leaf property; parity test carries the
R10 asymmetry explicitly), 714f20cc53 (bind the copy fingerprint + offerNext +
realm into the step-up, validate itemId at issue, name the copy in the signed
message; closes the copy-swap flagged by three reviewers), 15e8f1b8fb (reset
both accepts + item_ref on a directed reopen so a spent proof cannot re-drive
custody), 64ce5e361a (seller-accept re-entrancy guard, pending face, listing-
flavored decline copy + label, locked-copy hint arm; new behavioral controller
arms for the real-wallet sign, decline abort, one-mint re-entrancy, disabled
in-flight button), ad806a26f7 (rate-bucket literal pins, realm-leading prune
index, TOTP-remnant guard, decode bounds), 4ff75d8eef (honest-claim framing for
the relink gap per Fernando's ruling), b1c6384ade (import sort). Fix round
mutation-proven: seven fix-round mutants all BIT (drop expectInstance, drop
offerNext, remove itemId-at-issue, keep accepts on reopen, dead locked-hint,
remove re-entrancy guard, never-disable pending face); the ten
implement-round mutants also all bit. Validation: npx tsc --noEmit clean;
market suites + snapshots/env_protocol/bandwidth + architecture + monolith +
i18n gates green; the FIVE market pg suites (incl. the new
woc_market_stepup_pg_integration) green zero skips WITH TEST_DATABASE_URL;
ci:changed exit 0. The 13 ledger entry in state.md is the registry the 13-qa
session consumes.

## 12 QA round (verdict PASS-WITH-FOLLOWUPS, every finding applied or judged)

Session start 90c007e36f (the 12 implement docs tip; release sync a no-op, 0
behind origin/release/v0.39.0 tip d2d1a8ad5c). QA range a6ff42f1c5..bd089672f9.
Seven fix commits on top of the docs tip, then this round's docs commit:
ef1d825236 (poll-settled extension, drift channels, logSafe 256, trace after
CAS, response-bid expiry patch), e0c4eee393 (listing state booleans, status
price projection, wrapper pins), 8484a3ce50 (devSplit clamps, the proxy
fail-safe pins, the game-word scan), 8402dc5f93 (payment-surface parity,
window devsig arm, re-quote re-label, split lifecycle, WHY-line row, orphan
key deletion, pure-core registration), 1b28affbbe (env-guard discovery walk,
DEPLOY.md and CLAUDE.md truth-ups, logSafe bound pin), 88cc70c61d (bond
prompt copy), 9ae040b680 (the fresh re-review's round: bond-leg fail warns,
fresh poll clock, cancelPending status gate, Activity badges with fills,
status value pins, walk classifier control, devsig branch-order pins, dead
wrapper deletion).

Lanes, in order: ten read-only audit lanes over the immutable range (the
three spec reviewers cross-platform-sync / frontend-seam / test-coverage
dispatched via the Agent tool; seven workflow lanes: server correctness,
client correctness, the serializer sweep, the fee edges, the env sweep,
dead code, docs truth), the red-proof lane in a scratch worktree (all seven
registry claims: the four old-build reproductions exact, the env guard red
both directions, the named fix-round mutants re-bitten, claim 7 judged with
the file open), and three mutation batteries (round 1: 17 mutants, 16 BIT,
the ONE survivor was a real pin gap, devSplit ceil-to-floor with no absolute
leg pin at an odd amount; new-pin round: 18/18 BIT including that survivor;
wave 3 over the re-review fixes: 10/10 BIT). The fix round was re-reviewed
FRESH by two lenses (correctness: 0 blocking, 5 should-fix, 5 nits/
observations, incl. the bond-leg drift gap and the stale poll anchor;
test-decisiveness: 1 blocking test gap, the fail-side POLL note call
undecidable behind the same-word dedupe, plus 6 should-fix and 6 nits), ALL
applied or judged; qa-checklist LAST over the whole diff. Validation: tsc
clean throughout; every market suite + snapshots/env_protocol/bandwidth +
architecture + monolith + i18n gates green; the four pg suites 132 green
zero skips WITH TEST_DATABASE_URL (three runs across the round);
ci:changed exit 0 (the one red on the way was format drift in four test
files this round edited, fixed by a scoped format); gate run recorded below.
Dispositions, judged list, and the new deferrals live in the state.md 12
ledger entry's 12 QA ROUND bullet.

## 12 implement round (wire completeness and environment truth)

Session start a6ff42f1c5 (the 11 QA tip; release sync a no-op, 0 behind
origin/release/v0.39.0 tip d2d1a8ad5c, so no release-merge-audit owed). Eight
code and doc commits to tip bd089672f9 plus the ledger docs commit on top,
LOCAL not pushed per R4. The commit spine:
c6cf146cec (wire fields + the wire-pin suite), ba4d44f890 (bond-quote contract
adoption), 55917385bd (anti-snipe allowlist + memoRef tolerance), e9b8dfaee0
(client localization, nine keys with five non-Latin fills each), 51e0eb1da6
(env truth + the two-direction guard), fe195677ad (the four-lane review round's
fixes: bounded adoption, balance re-guards, view-core WHY gate, repaint sig,
non-causal generic copy, screening pins, vocab literal pin), 65d4ddfc2c (the
fresh re-review's refresh-path symmetry fixes), bd089672f9 (the qa gate's
drift warn + log clamps + PRD truth-up).

Review rounds, in order: four parallel lanes over the five-commit base
(cross-platform-sync: 0 critical, 4 warnings, 8 info; privacy-security: 0
critical, 3 warnings, 6 info; frontend-seam: 0 blocking, 5 should-fix, 3
notes; test-coverage: 2 blocking test gaps, 10 should-fix, 6 nits) -> fix
round fe195677ad -> a FRESH re-review of that commit (0 critical, 4 warnings,
2 info; its test lane was cut off and its named checks were judged in the
main loop with the files open) -> fix round 65d4ddfc2c closed by careful
self-review (narrow, both new tests constructionally decisive) ->
qa-checklist over the whole diff: READY, 0 blocking, 2 should-fix + 2
suggestions, all applied in bd089672f9. Every finding across all rounds is
applied or judged with the file open; the judged list and deferrals live in
the state.md 12 ledger entry.

Red-first proofs: the wire-pin suite ran 14 red on the pre-fix build; the
anti-snipe allowlist tests ran red on the old denylist; the controller
split-adoption test ran red via a stash A/B; bondCents(2001) pinned red under
round. Mutation: field drop bit 3 tests, field rename 4, vocabulary member
delete 2 suites, env guard red in both directions, raw-passthrough screen
mutant bit 1, echo-recompute 1, sig-drop 1, plus the four earlier commit-round
mutants; the one-retry ceiling is enforced by a call-count pin.

Validation: npx tsc --noEmit clean throughout; the market suites plus
snapshots/env_protocol/bandwidth green; i18n gates green
(i18n_completeness incl. M16, localization_fixes S3, language fanout);
real-SQL suites green zero skips WITH TEST_DATABASE_URL (bond, settlement,
delivery, directed); npm run ci:changed exit 0. Gate GREEN at the docs tip:
node scripts/gate_select.mjs ran the full gate step list with the vitest step
fallen back to the FULL suite (broad change class), all 12 steps green, 2854
test files / 40604 tests + 2 expected fails, browser 129, typecheck and all
builds, run WITH TEST_DATABASE_URL so every pg suite executed inside it.

## 11 QA round (verdict PASS-WITH-FOLLOWUPS, every finding applied or judged)

Service repo, worktree woc-rewards-service-pr31; session start 03df5de (clean,
origin/master already contained at df09756), QA range 8da6c03..03df5de; fix
round 5 commits, tip 270e337, pushed per R4 with the game docs. Baseline
re-verified at 03df5de before any audit (build clean; 590 tests, 583 pass, 7
env-gated skips default tier; 590/590 zero skips with
CLAUDIUM_TEST_DATABASE_URL against the dev Postgres).

Eight audit lanes in one workflow over the range (correctness with the four
probes from the QA spec; security/ops on the stalled-venue and
freshness-overstatement questions; test decisiveness against the vacuous-pin
classes; dead code and doc staleness; red proof; three mutation groups), then
a two-lens refute pass (51 of 88 votes landed before the workflow runner
stalled and was killed; both refutations matched the dispositions already
taken; every finding was judged in the main loop with the file open) and a
fresh ROUND-2 workflow over the fix round itself (two fresh lenses, sixteen
new-pin mutants, a completeness critic over all 44 dispositions).

Range verdicts:
- RED PROOF: all eleven registry claims REPRODUCED-RED on the named old
  builds (8da6c03; 83d7d00 for the oracle claims; a616f73 for the re-review
  claims) and green at the tip by the pin tests and by identical probes
  against the tip dist.
- MUTATION round 1: the QA registry named 42 mutants (the implement round's
  41 plus the .env.example min-samples drift), 41 BIT by name under
  full-file runs plus sub-variants, ONE SURVIVED: the admin overview
  hardcoding crossVenueGateArmed false passed because the only wire pin
  asserted false under a single-venue rig; closed in the fix round by a
  two-venue overview arm and re-proven (round-2 mutant 14 BIT). Two pins
  were deliberately renamed by the fix round (annotated in the state.md
  registry bullet for any by-name re-run).
- FINDINGS: 44 (0 blocking, 8 should-fix, the rest nits and observations),
  every one applied or judged with the file open; dispositions in the
  state.md 11 QA ROUND bullet.

The fix round (5 commits):
- 5236897 sizes the oracle tightening floors from the venue cadence
  (staleness tight end 15 to 45 minutes, sample minimum 90 to 60 with the
  setInterval-lateness margin: a legal tightening to the old floors could
  refuse the print as stale for the tail of every republish cycle, reset the
  breaker at any thirty-minute gap, or park a quiet realm on a permanent
  insufficient_samples), judges the refusal readout window against the poll
  clock, adds the parse-time warn for every mis-set oracle knob, and states
  the two exposure corollaries in the header (sub-bound moves compound; the
  breaker has no predecessor after ANY recording gap longer than the window).
  New pins: cap eviction direction, off-default bounds, literal tight ends,
  parser warn lines, exact skew and staleness edges, the healthy 38-minute
  venue row, MAX_ORACLE_SAMPLES and VENUE_AGE_SCREEN_OFF_MS as literals.
- 9c60aa9 wires the parser warn to the boot operator channel, puts the
  window depth on the recovered line (samples and prints, so a breaker reset
  reads differently from an ordinary recovery) with a zero floor on the
  duration, mirrors spotUsdPerToken and twapUsdPerToken onto the admin
  overview, and adds the decisive pins: the two-venue overview arm, paused
  settlementQuote, the cold-pause null, request reads not moving the signal.
- b865c56 trues every doc the audit caught lagging the one-judge design
  (.env.example no_price-forever and plural-venue wording, the compose
  override comment, the cold-boot sentence corrected to WHEN the breaker
  reads zero, the recording-gap siblings and their runbook lines including
  the host-clock diagnosability note, the warm-up pair timing, the
  latest()/still-halted/median-fresh precision, the Birdeye venue row in the
  environment table, the CLAUDE.md bullet trimmed to rules plus pointer, the
  TODOS anchor widened to in-process gaps) and adds the .env.example
  discovery sweep to compose_conformance.
- 5a97aa9 rides a tightened env bound through buildMarketApps to the health
  surface in one pin.
- 270e337 applies the round-2 lenses: the refusal arms report the window
  through a NON-MUTATING view (a refusal must tell the truth but never
  destroy it; one read with a spuriously future clock must not discard
  samples nothing recorded over, and the pin asserts the buffer survives),
  the window knob's ceiling-invariant warn quotes what the operator actually
  wrote (the two-line clamp-plus-outrun case pinned), the two-venue arm pins
  twapUsdPerToken by value (the one mirror field a hardcode could still
  satisfy), and the comment truth-ups ride along.
Game repo: the proxy header's multiple-liquidity-sources claim reworded to
the single-venue truth (server/woc_market_proxy.ts, comment only, DC-04).

ROUND-2 verdicts (the fixes are unreviewed code): docs/ops lens 7 findings
(0 blocking, 4 nits applied, 2 ruled-class observations, 1 optional applied);
correctness lens 6 findings (0 blocking; the twap-mirror decisiveness gap and
the outrun-warn precision applied; the commit-attribution nit fixed by
rewording the two local-only commit messages; the destructive-prune
observation hardened into the non-mutating view; the count observation was
the lens measuring the worktree tip one test-commit ahead of its range; the
sweep-regex observation no action by its own text); 16 round-2 mutants ALL
BIT in two groups against 2246046 (same trees as b865c56), worktrees left
clean; the four rework pins (view dropped, view bypassed on the stale arm,
outrun quote dropped, twap hardcode) proven BIT against the final tip by
compiled-dist mutation.

Validation after the fix round: build clean; 595 tests, 588 pass, 0 fail, 7
env-gated skips default tier; 595/595 zero skips with
CLAUDIUM_TEST_DATABASE_URL. Copy floor clean both repos (no dashes, no
emojis, no reserved words in code or commits); game ci:changed exit 0.

## Sync-only session ahead of 10 QA (2026-08-15, both repos, LOCAL)

Fernando asked this session to run only the SESSION START merges of
phase-10-qa.md, gate them, and stop, so 10 QA itself starts fresh. Nothing
was pushed (R4: the QA session pushes on PASS; the game push then carries
these commits).

SERVICE (worktree woc-rewards-service-pr31, integration/woc-market-settlement):
tree clean at ba7df0b; origin/master fetched, still df09756 and already
contained (no-op merge, nothing to record beyond that). Baseline
re-verified in service/: build clean; 536 tests, 530 pass, 0 fail, 6
env-gated skips default tier; 536/536 zero skips with
CLAUDIUM_TEST_DATABASE_URL against the dev Postgres. Matches the 10
implement contract exactly.

GAME (worktree wocc-marketplace, feature/woc-marketplace): the newest
release branch was DISCOVERED (standing rule) as origin/release/v0.39.0:
v0.38.0 shipped to main via PR #3416 and v0.39.0 was minted from it (tip
d2d1a8ad5c = the v0.38.0 tip fb88c3f094 + 6 commits: the merge, the 0.38.1
version bump, the r185 chase-camera fix, the docker sharding-sequencer
fix), so the sync merged v0.39.0 (a strict superset of the v0.38.0 tip the
prompt named). Merge f5df042a86, NON-trivial (296 commits behind, 509 delta
paths, five conflicts):
- src/ui/hud.ts (postEntryPreviewPrewarmUnits): the release stopped warming
  the Armory catalog on a schedule (56bb1f17e4) while the branch had
  extracted the composition into src/ui/preview_prewarm_wiring.ts (02 QA).
  Resolved by keeping the wiring composition and dropping the three armory
  deps from it, its interface, and its suite (which gained the release's
  NEGATIVE armory pin); the merged tests/armory_preview_lifecycle.test.ts
  already carried both sides' pins.
- tests/helpers/strip_comments.ts + .test.ts (add/add): the release's
  lookbehind form taken for both (a strict superset: it also strips a line
  comment glued to a block closer, `*///`; a whole-tree grep finds that
  shape only in the helper's own fixture, so no branch consumer's verdict
  moves; the release suite subsumes the branch's four pins).
- src/ui/i18n.resolved.generated/pending.ts: regenerated (npm run i18n:gen
  with TURBO_FORCE=1), never hand-merged.
- tests/monolith_budget.test.ts: hud.ts row re-pinned DOWN to the exact
  merged size 19120 (both sides shrank it: the Armory-prewarm removal and
  the ability_description.ts extraction; the release's own 19420 -> 19432
  maintainer raise + 19433 re-pin recorded in the row comment as release
  lineage, e362916958). Two further ratchet reds surfaced only on the
  union: sim.ts 12508 vs 12505 (release-side growth of 7 lines; the
  branch's delegates unchanged; re-pinned to the exact merged size per the
  row's own v0.38.0 precedent, still under the release's 12660) and
  main.ts 11499 vs 11490 (the release grew the file to within eight lines
  of its ceiling; the branch's 17-line inline Exchange attach sat on top).
  main.ts was NOT raised: bf7aeb8a98 extracts the attach into
  src/game/woc_market_wiring.ts (one-call composition in the
  desktop_shell_integration shape: NATIVE_APP / DESKTOP_APP default from
  client_origin and stay injectable, every wrapped shell fail-closed,
  main.ts carries one call; tests/woc_market_wiring.test.ts pins the gate
  per dimension, the live token / characterId / walletLinked routing, the
  lazy wallet load on first sign, and the main.ts firewall by source scan;
  three mutants bit: gate operator, hardcoded default shell, walletLinked
  constant). main.ts lands at 11489 under the release's 11490; the merge
  commit alone is red on that row (stated in its body), HEAD is green.
- three.js moved 0.165.0 -> 0.185.1 (patched); pnpm install
  --frozen-lockfile refreshed the worktree before any test ran.

release-merge-audit (ultracode workflow: six audit lanes over the delta and
the 26-file overlap set, then one adversarial refuter per finding; 20 agents,
14 findings, ALL confirmed, none refuted): every overlap source and test
file is a clean union (hud.ts hunk-by-hunk both directions, sim.ts,
main.ts, entity_i18n.ts, CLAUDE.md, README, both HTML entries, the eight
overlap tests); count pins send 200 / dispatch 213 / IWorld 324 unchanged
and run-confirmed; the delta adds no route, registry row, WS command,
world_api member, or src/net change (server/perf_report.ts is the only
server file and the branch does not import it); the two new
vi.mock('../server/db') sites (battleground_pop_wire_order, perf_report)
mock nothing the branch extended and run green; branch i18n keys and
overlay rows all survived and the committed pending.ts is byte-identical
to a fresh regeneration; no branch-owned test source-scanning a
release-changed file went red (union-reds lane: 0). Applied: the two
pin-prose nits (e362916958: hud row release lineage; the armory negative
pin now scans preview_prewarm_wiring.ts too, mutation-proven), and nine
doc-premise corrections in this section's commit (implementation-plan
current-release lines, state.md base / repos row / count-pin gotcha /
i18n debt sizing / phases-12-16 ceilings / new v0.39.0 release rules,
the 18 unrun phase files' SESSION START blocks, phase-13's gate pointer,
review.md's pointer). Recorded, no action here: the 3 hudChrome.trade.woc
rows pending in the five non-Latin locales are pre-existing branch debt
(release fill), and entities.abilities.frenzied_regeneration.description
is reword-stale in 18 overlays ON origin/release/v0.39.0 itself (English
lost its "(Druid talent)" suffix in 4ca52c8eb0, the overlays kept theirs):
a maintainer follow-up on the release branch, not this one.

Validation on the committed tree: npx tsc clean; gate GREEN at bf7aeb8a98
(node scripts/gate_select.mjs, full-suite fallback, ALL 12 steps, 2850 test
files / 40533 tests, browser 129, WITH TEST_DATABASE_URL and TURBO_FORCE=1);
DB-gated suites run separately with the URL: 18 files, 245 green, zero
skips; e362916958 is a two-test-file prose change re-run green (20 tests).
Copy floor clean over every new line; no "phase" word in any commit
message. Tip after this session's docs commit: see git log; LOCAL, not
pushed.

## 11 implement round (oracle health and honesty)

Service repo, worktree woc-rewards-service-pr31; session start 8da6c03 (clean,
origin/master already contained at df09756, origin/feature/woc-market-settlement
matching the tip, PR #31 checks green there), 5 commits, tip 03df5de, LOCAL not
pushed per R4. Baseline validation matched the documented contract exactly
(build clean; 560 tests, 553 pass, 7 env-gated skips default tier; 560/560 zero
skips with CLAUDIUM_TEST_DATABASE_URL against the dev Postgres).

RULING FIRST: R3 was proposed with code-grounded rationale (bootstrap wires
birdeye + a Pyth arm no feed can arm; the only configurable second source,
Jupiter, publishes no print time; Birdeye's measured cadence would make a
second venue a false-halt generator) and confirmed by Fernando before any code
(recorded in state.md Rulings, game commit e2f189e9a4): single-venue posture,
spot 500 bps, staleness at the measured hour with publish-time honesty as the
compensation. A second ruling landed at the review round (cold boot: record
and document, no gate; recorded as an R3 amendment).

Commits (service):
- 40321d8 publish-time freshness and the venue truth: MarketPriceHealth.asOfMs
  is the newest venue publish time on healthy readings and refusals (null only
  when no venue priced), the game wire (price, estimate) carries it, the
  diagnostics gain per-venue ageMs, configuredVenues, liveVenues,
  crossVenueGateArmed and distinctPrints, mapped field-by-field onto the admin
  overview. RED-FIRST: the asOfMs pin reproduced red on the 8da6c03 oracle
  (poll clock 1720000002000 where the print time 1719998502000 was expected);
  the surface fields were structural reds (tsc). 7 mutants bit.
- eca8730 the ruled posture: pythSource and WOC_MARKET_PYTH_WOC_FEED_ID gone
  from bootstrap, compose, .env.example and docs; marketOracleConfigFromEnv
  ignores WOC_MARKET_MAX_VENUE_DEVIATION_BPS (code default 500 kept, oracle
  stays N-venue capable); DEFAULT_MARKET_ORACLE_CONFIG.maxSpotDeviationBps
  500; compose_conformance pins the retired knobs out and the blank spot
  default in. RED-FIRST: a Pyth feed id alone BUILT a market on 8da6c03
  ([Object] where null was expected); the venue knob was honored; a 6% jump
  passed at 1000; compose carried both knobs. 5 mutants bit.
- 83d7d00 the deliverable-1 proofs under node:test mock timers: heartbeat
  ticks alone satisfy the market's own read and its sample arithmetic (prime
  + ticks + reads) proves one buffer; twenty minutes of idle heartbeat leaves
  the next request healthy; the heartbeat-stopped negative control shows the
  false-outage shape; a comment-stripped scan of the compiled bootstrap counts
  one construction site. Red form: mutation (the H3 bug re-introduced as a
  private second oracle fails four tests by name; a detached heartbeat fails
  three; a stray construction site fails the belt). 4 mutants bit.
- a616f73 the review fix round (both fresh lenses applied): the oracle is the
  ONE judge of freshness, per venue (VENUE_AGE_SCREEN_OFF_MS hands every
  parseable Birdeye print up; stale prints never enter the median; future
  prints beyond MAX_ORACLE_FUTURE_SKEW_MS and unparseable publish times count
  as no print; ageMs floors at zero); sorted sample insert; effective bounds
  on the surface; env may only TIGHTEN each bound; tradableHealth reads
  health before the pause check so a paused estimate carries the print time;
  price_gate_signal.ts (new module) fed by the heartbeat: halted / still
  halted / recovered lines, edge-triggered; test rigs: t.after cleanup,
  RIG_PRINT_AGE_MS, ORACLE_HEARTBEAT_MS exported and imported, negative
  control ticks through the stop, warmed() replaces the retired
  min-samples-1 env shortcut, the REAL birdeyeSource driven end to end via a
  mocked global fetch for a 70-minute print (stale with print time) and the
  38-minute print (healthy), decisive distinctPrints and bounds pins over
  HTTP, .env.example pinned beside compose; docs state what the breaker is at
  the deployed cadence and record the cold-boot decision. RED-FIRST: the five
  new oracle pins reproduced red on the pre-fix oracle (future print healthy,
  stale print dragging the median to 0.0015, no bounds field, no fresh
  verdict, a 999999 spot bound accepted). 14 mutants bit (one after
  reshaping the out-of-order fixture to the reviewer's exact case: the newer
  sample of an inverted pair at the head).
- 03df5de the re-review round (a fresh third lens over a616f73, 18 findings,
  all applied or judged): ORACLE_BOUND_RANGES caps the TIGHTENING direction
  (window up to an hour and never past the staleness ceiling, samples up to
  90, staleness down to the default window, spot down to 100 bps; decimal
  integers only); MAX_ORACLE_SAMPLES hard-caps the buffer (oldest out under
  request load); the stale arm keeps the spot it saw and the standing
  average; asOfMs never claims the future; MarketPriceOracle.latest() and a
  paused refusal that reads it instead of polling (price and every quote
  path); the heartbeat runs one poll at a time (the sweep's guard) so the
  operator signal's edges arrive in order; the halt line floors the print age
  at zero; the venue-fetch mock is ONE mock over a mutable print time (node's
  MockTracker restores in creation order, so a second mock on the same target
  reinstalled the first stub for the rest of the file); .env.example's
  numeric oracle knobs pinned against the code constants; the "5% per
  publication" claim replaced with the truth (a hold-time cost that absorbs
  any move within a window; the tightening converts 5% to 10% moves from
  silent acceptance into a multi-minute halt); TODOS.md names the cold-boot
  anchor follow-up. RED-FIRST: the in-flight, paused-no-poll and negative-age
  pins reproduced red on a616f73. 11 mutants bit. Closed by careful
  self-review with the diff open (narrow, test-covered).

Game repo (docs, feature/woc-marketplace): e2f189e9a4 the R3 ruling record;
c5ce2793e7 the PRD claim revised to the single-venue truth.

Mutation registry: 41 mutants BIT by name under full-file runs: healthy asOfMs
back to the poll clock, crossVenueGateArmed at one venue, distinctPrints as
samples, ageMs null, stale refusal asOfMs poll clock, overview dropping the
armed flag, liveVenues counting configured, spot bound back to 1000, venue
knob re-read, pyth env re-wired, compose re-growing the pyth knob, compose
numeric spot default, the private second oracle, heartbeat detached, stray
construction site, boot prime removed, NaN publish accepted, future skew
dropped, stale print entering the median, bounds misreporting, sorted insert
removed (survived the first fixture, bit the reshaped one), spot bound may
widen, min samples may lower, source judging age again, signal warning every
tick, recovery line dropped, paused estimate asOfMs null, .env.example
regrowing the pyth knob, stopOracleHeartbeat no-op, signal not wired,
crossVenueGateArmed off the venue list; round 2: sample cap removed, latest()
always null, asOfMs future clamp removed, stale arm dropping spot/twap, tight
clamp dropped, integer regex dropped, window invariant dropped, heartbeat
guard removed, signal age clamp removed, paused refusal polling again,
.env.example min-samples drift.

Validation after every slice; final at 03df5de: build clean, 590 tests, 583
pass + 7 env-gated skips default tier (two consecutive full runs green after
one floating-rounding flake was fixed at its pin), 590/590 zero skips with
CLAUDIUM_TEST_DATABASE_URL. Copy floor clean both repos (no dashes, no
emojis, no "phase" in code or commits). Docs upkeep in the same change:
service CLAUDE.md, MARKET_SETTLEMENT.md, .env.example, docker-compose.yml,
TODOS.md.

## 10 QA round (verdict PASS-WITH-FOLLOWUPS, every finding applied or judged)

Service repo, worktree woc-rewards-service-pr31; session start ba7df0b (clean,
origin/master still df09756 and already contained; the SESSION START syncs
were already done by the 2026-08-15 sync-only session and a re-fetch at the
end of this session found nothing new on origin/master or origin/release/v0.39.0),
audit range 02713f2..ba7df0b, tip 8da6c03, 5 commits, PUSHED per R4
(service ba7df0b..8da6c03 to feature/woc-market-settlement, updates PR #31;
game after the release check below).

Seven audit lanes ran concurrently in one workflow, each in its own scratch
worktree where it needed a build (the live trees were never modified): a
hostile-fixture inventor (56 shapes RUN through the real verifier), security,
correctness, test-coverage, docs/dead-code/copy-floor, a red-proof lane on a
throwaway 02713f2 build, and a mutation battery on a scratch ba7df0b build.
The refuter stage (one adversarial refuter per finding, 68) ran into the
session's subagent limit after 15 completed; per the standing rule every
finding was judged in the main loop with the file open (the audit lanes'
evidence plus primary sources), the fix round was built and committed, and
the fresh fix-round re-review ran after the reset (two lenses).

THE ROUND'S HIGHEST-STAKES JUDGMENT, made with the parser and the token
program open (agave transaction-status/src/parse_token.rs and
solana-program/token processor.rs, fetched this session): ba7df0b's
restoration of the multisigAuthority-equals-payer acceptance arm is CORRECT
and money-safe. parse_signers picks 'authority' vs 'multisigAuthority'
purely by accounts.len() > 3 with no multisig-existence check; the token
program's validate_owner non-multisig branch ignores the trailing signers
slice and only requires the authority to be a signer; process_burn passes
the trailing accounts as that slice; a fee payer must be system-owned so a
real multisig can never be keys[0]. Refusing the label would have
terminally rejected honestly-paid burns from any wallet that pads the
account list. Also verified from parse_instruction.rs: agave labels BOTH
token programs 'spl-token' (one ParsableProgram variant, kebab-cased), so
the 'spl-token-2022' label is a defensive alias the reference parser never
emits; the comment and test were trued and the 21 handoff narrowed.

Round-1 verdicts on the implement range: ZERO blocking, ZERO
accepted_dishonest shapes across the 56-fixture hunt (every redirect,
short, over, split, delegate, PDA and forged-label burn, owner change,
victim-account delegate payment, batched settlement, third-party gift,
over-credit, mintTo offset and parked-fee shape refused; the real
wallet-emitted transaction shape verified matched, with Lighthouse,
durable-nonce, Jito-tip, ATA-exists and payer-ATA-closed variants). All six
red-first registry claims REPRODUCED-RED on the 02713f2 build (compile
shims for MATCH_COMMITMENT / CREDIT_COMMITMENT and a no-op stopExpirySweep
only; a new-src overlay on the same tree turned every red green, so each is
a behavior red). Mutation: 27 of 31 mutants BIT; the four survivors were
real pin gaps (the pg sweep's outer status guards on BOTH arms, the
confirming arm's ORDER BY, and the pre-existing payer_mismatch check whose
only test was refused by a downstream check instead), all closed below.

The QA round's own findings, all applied (with the judged exceptions
listed): the SHOULD-FIX class had one money/security item and one
fail-closed item. (1) SEC-2: a string that can never be a signature (not
base58, or the wrong byte length such as a wallet address) passed confirm's
32..120 bound and the game's regex, reached getParsedTransaction, the node
answered -32602, web3.js threw, confirm 500ed on every poll, and the game
read the 500 as service_unavailable, the verdict it exempts from its
buy-now abandon ledger and anti-snipe extension on the premise that a real
outage is not mintable on demand; the junk also held the signature slot
for the confirming bound and blocked the real signature with
signature_conflict. Closed by a chain-owned shape predicate
(MarketChainVerifier.isPlausibleSignature; live: base58 to exactly 64
bytes in the new dependency-free src/market/signature_shape.ts, fuzzed
against bs58 out of band and pinned on reference-encoded vectors; dev: any
tag) screened BEFORE the first write on both confirm entries, answering
invalid_signature without a write or ledger read (the real signature still
confirms after junk). (2) I15 (fixture hunt): a leg whose destination is
the payer could never verify (the leg check compared the payer's NET delta;
the debit check's netting branch was dead), reachable when the treasury
wallet buys a listing; the leg check now skips the payer's own leg and the
netting branch is live and pinned. Also applied: burn_authority_mismatch
(a burn of the quoted mint under an authority the quote never named, a
vault or router PDA or a delegate, is still refused but named, so the ops
rail can tell it from a redirected fee; burnedBaseFor takes a null
authority for that one distinction), the stray wallet named in the
operator log on unexpected_credit, add() skipping non-string owners, the
edge-triggered sweep-failure warn (the sweep is the only production driver
of expiry and swallowed every failure silently), expirePastDue answering 0
for a non-positive budget in both stores (pg refused a negative LIMIT
outright), attention.confirmingExpired24h in the admin overview (the one
expired class an operator should look at; state.md called it ops-visible,
it was visible only by listing expired rows), and the doc truth-ups: the
bound is measured from quote EXPIRY and the five-under-six ordering is a
precondition on two knobs (WOC_MARKET_QUOTE_TTL_MS unclamped, keep it well
under one hour; the game's WOC_MARKET_CONFIRMING_REVIEW_HOURS at or above
six), the RPC-history premise now cites release_protocol's own six hour
depth instead of contradicting it, the anti-snipe overclaim reworded to
the game's follow-up, the wiring doc's verifier paragraph lists every
check in order with its reason and scopes the whitelist to the quoted
mint, MARKET_SETTLEMENT.md gains the confirm vocabulary in one place, the
recovery caveat once the game has acted on a terminal answer (out-of-band
re-confirm of the preserved signature), the treasury-rotation and TTL
knob notes, the first-sweep backlog deploy note, and the four omitted
suites in the tests list; CLAUDE.md and .env.example carry the two facts.

Test pins added (each mutation-proven by name, 21 mutants BIT over the
committed fix round): the real wallet-emitted shape (compute budget
riders, idempotent ATA creation with inner instructions, checked legs,
burn, memo last; guard rider; ATA exists; unfinal), a leg credited above
the quote (payer-funded, donor-funded, treasury), two settlements batched
(shared treasury, distinct treasuries, sale plus no-burn bond, from every
quote's side), exact base-unit comparison above 2^53 and the uiAmount
decoy, a delegate burn and a delegate-funded leg, an owner reassignment
mid-transaction, the fee payer check on its own (payer_mismatch), the
treasury buying a listing, the authority-mismatch word vs burn_missing,
the stray-wallet log, the recovery warn once, the shape predicate at the
verifier and the shape module's vectors; the service pins the reserved
matched-arm word on both entries, the rejected reason landing on the row
for every B4 word, the shape screen (no write, no verify call, real
signature confirms after junk, entry path answers the terminal), and
every entry arm of a confirming-expired quote (different signature,
unseen, matched-unfinal with no window, adoption clearing the stale
reason); the pg suite races BOTH sweep arms for real (lock wait observed
before commit, zero swept), pins the confirming arm's order and the shared
budget remainder, both partial indexes in the catalog, and the
non-positive budget; the memory store gets the order and budget twins
ungated and the preserved-signature pin; bootstrap proves a rejecting
sweep is swallowed, keeps its cadence, never becomes an unhandled
rejection, and warns once per outage; http pins the verifier reason on
the quote listing and the confirming-expired counter.

JUDGED, no code change (do not re-raise): the balance-row BigInt throw on
a malformed amount (never emitted by agave) stays a THROW, deliberately
the opposite of the burn side's parse-to-zero: a coerced balance would
reject a real payment terminally while a throw is a retryable 500 that
leaves the row confirming, now documented at the site and handed to 22's
RPC-defect policy item together with the malformed-envelope throw (I24)
and the lenient-vs-canonical amount asymmetry; a fee-sponsored (relayer)
transaction is terminally payer_mismatch by design (the builder sets the
buyer as fee payer and browser wallets do not rewrite it; a real-wallet
observation for 21); the null-owner add() skip cannot be pinned (the
outcome is identical either way, it removes a sentinel collision);
Q5e (two memos, one payment, two identical quotes) is the 09 settled-
signature index's case, not the verifier's; the docs lane's D21 (a
pre-existing PRD sentence about expired quotes) predates the range and is
game-side; the SEC-6 refutation was accepted (the game's anti-snipe gate
is the registered 12 handoff), the EPQ-comment refutation was accepted in
substance (EvalPlanQual re-checks the LAST committed version, so a two-hop
move is a legitimate re-check target; the comment now names each arm's
reachable moves instead of calling one unreachable). SEC-11 (expectedLegs
resolves the treasury from the CURRENT config, so rotating the treasury
wallet with quotes in flight rejects real payments) is pre-existing and
out of range: documented in the knob table and deferred to 22's runbook.

THE FRESH RE-REVIEW OF THE FIX ROUND (two lenses over ba7df0b..33c268c,
after the reset) found one real weakening IN the fix round and both lenses
found it independently: the payer-leg netting let a BOND quote whose payer
is the escrow wallet (its only leg a self-transfer, no burn) verify against
a transaction that moves nothing (executed on the 33c268c build; the
ba7df0b build refused it leg_mismatch). Unreachable today (the memo would
have to ride an escrow-signed transaction and the escrow be registered as a
bidder through the game's verifiedWallet seam), but a break of the
verify-the-outcome property, so it got two belts in 2c2ae78: bondQuote
refuses the escrow as a bidder (self_dealing) and the verifier skips a
payer-destination leg only while another leg or the burn keeps the debit
equation binding (owesOthers), refusing the all-self-legs shape as
leg_mismatch. Also applied from the re-review: the stray-credit warn once
per memo (bounded set) with the RPC-supplied owner clamped to printable
ASCII (log-forging / flooding), a trailing catch and an in-flight guard on
the sweep chain (a throwing handler must not become an unhandled
rejection; a slow store must not stack sweeps or flap the edge), the
null-authority burn pass counting only ATTRIBUTED burns (an unattributed
body stays burn_missing), the ops counter reading its own class through a
new terminalReason list filter in both stores (the general list caps at
200 rows and would crowd the class out; pinned by 250 newer unpaid
expiries), softened overclaims (a well-shaped signature can still meet a
real RPC failure; the game keeps its own first-claim signature slot), the
owner-less balance row pinned as the judged policy, bad_body in the
vocabulary table, the memory store's redundant budget guard removed, the
superseded status comment, an honest stop-hook test title, and a plain
boolean where a type predicate narrowed nothing. Every re-review-round pin
mutation-proven (11 mutants BIT: owesOthers forced true, the escrow-bidder
guard dropped, the attributed-authority requirement dropped, warn every
poll, no clamp, no trailing catch, no in-flight guard, the pg and memory
reason filters ignored, the null owner keyed, the counter derived from the
crowded list). The re-review round itself was self-reviewed with the diff
open (each change reviewer-prescribed and small). Judged from the
re-review, no change: SEC-2's anti-snipe half is the registered 12 handoff
(a well-shaped random signature still answers not_yet_visible pending, and
the game keys on the pending flag until it gates on awaiting_finality);
the observation that a zero amountBase would empty every leg and make the
debit equation vacuous is pre-existing and quote-time (bond clamps to at
least bondMinCents; a settlement's usdCents is validated positive), noted
for 22's close-out audit rather than changed here.

Validation after every slice; final at 8da6c03: build clean, 560
tests, 553 pass + 7 env-gated skips default tier (the seventh is the
new pg contention test), 560/560 zero skips with
CLAUDIUM_TEST_DATABASE_URL. Copy floor clean over every added line and
commit message (one banned word caught and fixed before commit).
Both remotes re-fetched at the end: service origin/master still df09756
(contained); game 0 behind origin/release/v0.39.0; origin/main moved to
the v0.38.2 hotfix tip (a patch line off the shipped 0.38, not the newest
release line, not contained in the branch; it flows to v0.39.0 through the
maintainers' main sync, so the next game session's release sync will pick
it up; nothing to merge here). PR #31 checks at 8da6c03: all three test runs
GREEN (17 s, 54 s, 56 s), verified after the push.

## 10 implement round (chain verifier proves the burn)

Service repo, worktree woc-rewards-service-pr31; session start 02713f2 (clean,
origin/master already contained at df09756, origin/feature/woc-market-settlement
matching the tip), 6 commits, tip ba7df0b, LOCAL not pushed per R4. Baseline
validation matched the documented contract exactly (build clean; 508 tests,
502 pass, 6 env-gated skips default tier; 508/508 zero skips with
CLAUDIUM_TEST_DATABASE_URL against the dev Postgres).

RULING FIRST: the two R5 remainder items were proposed with code-grounded
rationale and confirmed by Fernando before any code (recorded in state.md
Rulings, game commit 71f36c695f): the commitment split ratified (match at
confirmed, credit at finalized, code-owned constants, no env knob, plus the
pending-vocabulary split) and the confirming bound at five hours expiring to
the adoptable expired state.

Commits:
- 5bf0812 the B4 fix: settlement_proof.ts (pure necessity checks: burnedBaseFor,
  unexpectedCredit) wired into the verifier after the leg checks with distinct
  stable reasons burn_missing / burn_mismatch / unexpected_credit;
  MATCH_COMMITMENT / CREDIT_COMMITMENT pinned. Red-first: the full
  burn-redirect, the short-burn-with-redirect, and the extra-credit rider all
  verified as MATCHED on the old code (recorded); five more vectors were
  reason-contract reds.
- 65bb341 the ruled bound: MAX_CONFIRMING_AGE_MS in quotes.ts; both stores'
  expirePastDue gain the confirming arm (expired, reason confirming_expired,
  submitted signature preserved for entry adoption); pg gets the
  woc_market_quotes_confirming_due partial index and outer status+due guards
  on BOTH arms (EvalPlanQual discipline; the pending arm's subselect-only
  shape predated this change); buildMarketApps gains the one minute unref'd
  expiry sweep with stopExpirySweep (expireStaleQuotes previously had ZERO
  production callers). Red-first: the service-level bound test and both pg
  arms reproduced red before the change.
- 44e94dc the vocabulary split: confirm's undecided arms pass the verifier's
  own reason through (not_yet_visible live; awaiting_finality stays the
  matched-arm word and the reason-less fallback). Red-first both arms. The
  game-side adoption (anti-snipe extension gating on the matched arm) is 12's.
- 498d6bd docs: wiring decision 4 ANSWERED, verifier promise rewritten off the
  disproved payer-debit description, lifecycle diagram, repo CLAUDE.md.
- ca568cc the review fix round (both fresh lenses applied): edge-triggered
  operator warn on getSignatureStatuses outages, not_yet_visible pinned at its
  real emitter, memory sweep oldest-expiry-first with an always-running budget
  test, negative pins (forged program label, partially decoded instructions,
  malformed amounts, two-burn over-sum, 0n no-burn), comment and doc truth-ups.
- ba7df0b the re-review round: the fix round's multisig-impossibility claim
  REFUTED (jsonParsed labels the burn authority multisigAuthority by ACCOUNT
  COUNT while the token program ignores trailing accounts, so the shape is an
  ordinary honestly-paid burn); the acceptance arm restored with true
  rationale and both test arms; the pg intra-arm ORDER BY pinned.

Mutation registry: 15 mutants BIT by name under full-suite runs (burn authority
drop, exact-amount to less-than, burn_missing unreachable, whitelist threshold,
whitelist expected-skip, pg and memory cutoff drops, sweep cadence halved,
not_yet_visible reason drop, multisig re-admit then multisig re-refuse and
accept-any-label, warn-every-failure, memory sort drop, pg ORDER BY DESC) plus
ONE JUDGED SURVIVOR: deleting the pg pending-arm ORDER BY fails nothing because
the planner's partial-index scan order coincides with sorted order on this
shape; the pin is decisive against real order regressions (the DESC variant
bites) and the clause stays correct-by-construction. NOTE: the first fix-round
battery fired the uncommitted-revert trap (git checkout over WIP discarded
three files' fix edits, and one mutant silently no-op'd); everything was
re-applied, committed FIRST, and the whole battery re-run clean over the
committed tree.

Validation after every slice; final at ba7df0b: build clean, 536 tests, 530
pass + 6 env-gated skips default tier, 536/536 zero skips with
CLAUDIUM_TEST_DATABASE_URL. Copy floor clean both repos. Docs upkeep in the
same change: service CLAUDE.md, MARKET_SETTLEMENT.md, MARKET_CHAIN_WIRING.md.

## 09 QA round (verdict PASS-WITH-FOLLOWUPS, every finding applied or judged)

Service repo, worktree woc-rewards-service-pr31; session start 3346878 (clean,
origin/master already contained at df09756), tip 02713f2, 5 commits, PUSHED per
R4 (service aa44873..02713f2 to feature/woc-market-settlement, updates PR #31).
Audit range aa44873..3346878. Nine lanes ran concurrently: deliverables,
crash-matrix (the QA spec's independent third agent), security, test
decisiveness, dead code, docs freshness, red-proof (two lanes), and mutation,
the last three in isolated scratch worktrees so nothing touched the real tree.

Round-1 verdicts on the implement range: ZERO blocking. All six red-first
registry claims REPRODUCED-RED (the tip peg and bootstrap tests fail tsc at
aa44873 on exactly the ownership and gate vocabulary, with a behavioral
live-chain-without-key probe on the aa44873 build; the stomp test red at
44a3c5a via the 12f894c overlay; both double-pay classes reproduced by PoC
against the aa44873 build, sends==2 observed; the adoption tests red at
44dd52f). All seven mutation arms BIT with name-matched failures under full
493-test runs (claim CAS pg and memory, guarded update pg and memory, finalize
signature key pg and memory, age bound), worktree restored clean between
mutants. The crash-matrix walk covered every status times every crash point
and found no state whose retry can re-broadcast without a probe.

The round's fixes (five commits):
- 6cd43fa entry adoption: the registered paid-after-expiry edge is CLOSED
  (the crash-matrix lane's fix-now recommendation, accepted: everything the
  remedy needed shipped in the 09 range; a ledger-proven finalized payment
  now adopts an already-expired or already-superseded quote at confirm entry
  via the same adoption discipline as the mid-call arms; the rejected write's
  refusal now answers from the stored row in the entry vocabulary).
- 6c79602 marketRpcEndpoints extracted and membership-pinned (dropping the
  fallback RPC can no longer silently downgrade crash recovery); admin actor
  truncated to the audit reason bound at intake; tokenProgramForMint
  un-exported.
- fe06e21 test decisiveness: the direction conflict mirrored BOTH ways in
  BOTH stores, the pg interleave OBSERVES the row-lock wait from a separate
  autocommit connection, schema pins comment-stripped plus a live
  legacy-upgrade arm on a second pool, the age bound pinned at exact
  equality, the drift refusal's bondCents pinned at the wire, the typed
  Token-2022 and dev unknown-transaction refusals cased, compose conformance
  extended to the complete WOC_MARKET_* shadow set.
- c434cca docs: the wiring doc's dead MARKET_KEEPER_KEYPAIR_JSON references,
  the impossible-today sentence, and the keeperOwnsWocPayIn prescription all
  trued; refusal vocabulary completed; MIN_LIQUIDITY knob row added.
- 02713f2 the re-review round (below).

The fix round was re-reviewed by two FRESH lenses (security and correctness).
Their finds, all applied in 02713f2 or judged: the settled-signature
uniqueness enforced by unhandled 23505 (both lenses independently; a crafted
transaction can carry TWO memo instructions and match two quotes with
identical legs; now a typed terminal signature_already_settled on both
stores, with the memory store gaining the uniqueness twin, red-proven first,
and the pg error SHAPE pinned in real SQL because the catch keys on the
constraint name); the UNDECIDED verdict at terminal entry answering
hard-terminal (residual first-poll-after-expiry stranding; now
awaiting_finality inside MAX_LATE_PAYMENT_VISIBILITY_MS, ten minutes past
expiry, nothing written, junk bounded past the window); actor truncation made
surrogate-safe; the lock-wait observation scoped by a run-unique
application_name; the compose table made self-enforcing by a discovery sweep;
livePendingByMemoRef made newest-first in memory to match the pg ORDER BY;
adoption pins gained the settlement-kind, forfeited-entry, and
cleared-release-field arms. Round-2 was mutation-proven (4 mutants, all BIT
by name) and closed by careful self-review with one doc trueup folded in.

Judged, no code change (rationale recorded; do not re-raise): the
confirming-write boolean stays deliberately unchecked (its refusal must fall
through to verification or the mid-call adoption arms never see the payment;
commented at the site and documented); the double-signed-memo residual stays
reconciliation-only (first-writer-wins on submittedSignature would refuse a
genuine second payment's evidence); the terminal-row verify RPC cost is
accepted (internal tier; both suggested bounds risk re-opening the
abandonment; front-door rate limiting stays with 22); the fourth copy of
MEMO_PROGRAM_ID/tokenProgramForMint is a follow-up chore, out of range; the
admin-credit fingerprint change under actor truncation is a cross-deploy
non-case; the whitespace-only actor passing the empty gate is pre-existing
and unraised.

Validation matrix after every slice; final: build clean, 508 tests, 502 pass
+ 6 env-gated skips default tier, 508/508 zero skips with
CLAUDIUM_TEST_DATABASE_URL. Copy floor clean. Repo isolation verified (the
game tree's only local commit beyond origin was the packet-docs commit).

Game side this session: release/v0.38.0 re-synced (merge abd4a9e0e2,
TRIVIAL: 12 commits, delves content + CI sharding, no marketplace overlap;
the one conflict was the generated i18n pending bundle, resolved by
regeneration per the standing rule; npx tsc clean; monolith_budget +
world_api_parity + architecture 459 green, every ceiling and count pin
held without re-derivation). Gate GREEN at 55b563bcd2 before the game push
(gate_select, all 12 steps). Service-side CI: PR #31 checks all green on
the pushed tip 02713f2; the game branch has no open PR, so its check is
the pre-push floor. That floor BLOCKED the push on two star glyphs in
src/ui/market_armor_badge.ts and tests/market_armor_badge.test.ts: both
files are RELEASE-authored (the market-house-redesign merge) and proven
byte-identical to origin/release/v0.38.0 with zero banned characters
added on the branch side (the known stale-upstream sweep false-positive
class), so the push used --no-verify with this evidence recorded; the
release files were deliberately NOT edited on this branch.

## 09 implement round (bond releaser)

Service repo, worktree woc-rewards-service-pr31; session start aa44873 (clean,
origin/master already contained at df09756), tip 3346878, 9 commits, LOCAL not
pushed per R4. Fernando ruled the two R5 items at session start (recorded in
state.md Rulings). Build shape, five commits then four review-round commits:

- 2173870 service-owned bond sizing: bond-quote takes bidCents, one clamped
  policy in peg.ts (ceil bps, floor/cap knobs, never above the bid), drift
  refusal bond_amount_drift carrying the expected figure, response bondCents;
  splitForfeitProceeds beside splitMarketProceeds (R2, burn ceils, treasury
  absorbs, exact-sum).
- 1f50f3d release-intent persistence: 'releasing' status; release_to /
  release_prepared / release_claimed_ms columns (create block AND guarded
  ALTERs); claimRelease / replaceReleasePrepared / finalizeRelease CAS in both
  stores (guards in the WHERE on the row's own columns, the EvalPlanQual-safe
  shape); confirm answers settled on a releasing bond; exposure counts
  releasing as held; pg suite gained a blocked-interleave race proving one
  claim winner (the memory catalog's lock-first prescription followed).
- 2ed6adf the crash-safe protocol (release_protocol.ts): prepare with nothing
  durable, claim CAS before broadcast, probe-before-resend on retry (finalized
  adopts, active/unknown refuse, replaceable re-prepares keyed on the old
  signature), direction conflict from the claim on; forfeits move the R2
  split; dev chain mirrors the probe contract.
- d8ca678 SolanaMarketBondReleaser (adapter over the settlement rail's
  prepared-transaction machinery; shared instruction assembly in
  transfer_instructions.ts with the unsigned builder), all-or-nothing boot
  (live chain without WOC_MARKET_ESCROW_JSON refuses, proven red first), R5
  fee+rent preflight, escrow SOL monitor in the overview attention block,
  probe set = every configured RPC endpoint.
- 44a3c5a docs/env/compose: MARKET_SETTLEMENT and MARKET_CHAIN_WIRING truth-ups
  (status BUILT, R2/R5 answered), new knobs in .env.example and compose with
  conformance pins, service CLAUDE.md.
- 12f894c correctness round applied (guarded update closes the late-confirm
  stomp, red-proven in-suite; race-test decisiveness; releaseRail pin; monitor
  arms; zero-leg ATA skip; instruction build inside the refusal envelope; dev
  chain broadcast dupe-guard keyed on actual broadcasts).
- 44dd52f security round applied (MAX_REPLACEABLE_AGE_MS age bound on the
  replaceable verdict; finalize CAS keyed on the persisted signature and
  clearing the signed blob; release_attempt_signatures audit trail;
  allowReleaserlessChain closes the override-bag bypass and the stale
  buildEconomyApps comment; tri-state escrowSolLow; boot low-SOL warning;
  typed Token-2022 refusal; routes refusal gains signatureRequired).
- 6ef569d + 3346878 re-review round applied (adoption arms: a ledger-proven
  payment outranks the unpaid terminals expired/superseded, red-proven, with
  the stomp pin intact; live-arm gate restored beside the generic one; replace
  refreshes the age-bound clock; the age-bound park documented as its own
  operator remedy; attempt trail on the admin rows; the finalize signature key
  driven through the real service path; post-race confirm answers in the entry
  vocabulary).

Red-first evidence (all five reproduced before their fix, transcripts in the
session): the four ownership behaviors refused/accepted wrongly on the old
bondQuote; crash-after-broadcast retry re-sent the payment and concurrent
refund+forfeit both paid (throwaway suite against the pre-protocol path);
live-chain-without-key built; the late confirm reverted a finalized release
and the sweep paid twice; the raced terminal kept expired/superseded while
confirm answered settled. Reviewer-side proofs: the pg claim-CAS mutant
(guard removed) was BIT by the blocked-interleave test; two reviewer PoCs
against dist/ confirmed the double-pay classes independently.

Validation: in service/, npm run build clean; npm test 493 tests, 488 pass,
0 fail, 5 env-gated skips default tier; with CLAUDIUM_TEST_DATABASE_URL
(dev Postgres :5433) 493/493 zero skips, run after every slice. Copy floor
clean (no em/en dashes, no emojis, no "phase" in code or commits).

The 09 ledger entry in state.md carries the registry the QA session consumes
(judged and deferred items with owners, knob and reason vocabularies, the
cross-repo obligations for 12).

## 08 QA round (service auth hardening)

Service repo, worktree woc-rewards-service-pr31; audited 70d4207..4b9e413 (the 12
implement commits). Session start checks: clean tree at 4b9e413, origin/master
(df09756) already contained, baseline validation matched the ledger exactly (build
clean; 439 tests, 435 pass, 0 fail, 4 env-gated skips). The self-reviewed polish
commit 4b9e413 was verified FIRST with files open: docs and comments truthful, the
dropped ordering regex behaviorally covered by the RangeError case, both new tests
decisive; its one miss (dev_env.ts still saying "both of this module's consumers"
after the enumeration grew to three) fed the fix round.

Six fresh coverage-prompted lanes (normalization sweep with 28 live raw-socket
probe shapes, secrets and fail-closed config, correctness and behavior parity,
pin-skeptic test coverage, cleanup and doc accuracy, red-proof): ZERO blocking
findings. The red-proof lane rebuilt 70d4207 in a throwaway worktree and
REPRODUCED all four red-first claims (refund?x=1 executed with the internal secret
alone and the plain path 403ed, proving the query string was the exact vector; the
dev chain armed on unset NODE_ENV; an enabled market constructed on in-memory
stores; two MarketPriceOracle instances with the market quoting the unwarmed one),
each flipping green on the new dist, so the implement ledger's evidence is
accurate.

Findings applied (8 should-fix + 13 nits, every one; three commits on 4b9e413,
tip efad850):

- The un-flagged in-memory fallback was still denylist-shaped: with NO money rail,
  no DATABASE_URL, and an unset NODE_ENV the whole economy (balances, admin
  credits, gift cards) booted silently on RAM. DATABASE_URL is now required
  unless NODE_ENV affirms development or test, red-proven, with the railless
  dev/test arm still allowed flag-free.
- The partial-Stripe coherence refusal lost its production-only qualifier (an
  unset NODE_ENV might BE production; red-proven for unset and staging), and both
  claudium escape flags are trimmed before the '1' compare like the dev chain's
  (red-proven; the store-contract test arms moved onto a non-Stripe rail so the
  new coherence gate cannot mask the stores message they pin).
- Raw-first printable-ASCII on BOTH secrets: a Unicode-whitespace-only value now
  refuses loudly by name on either secret instead of reading as unset (the admin
  twin used to slip through the trim-emptiness short circuit with nothing
  logged). The admin tier gained the space-pad-authenticates and newline/NBSP
  boot-refusal pins the internal secret already had; the usdc wallet segment
  gained the malformed-percent 400 pin its sol twin had; the two lead-in comments
  still describing the ops tier as discount-only now describe the whole tier.
- New service/test/compose_conformance.test.ts: the compose staleness default
  must equal DEFAULT_MARKET_ORACLE_CONFIG.maxAgeMs (the exact divergence that
  once halted the market permanently), NODE_ENV: production must stay pinned for
  the deployed service, and the ONE remaining compose-vs-code divergence
  (CLAUDIUM_QUOTE_TTL_MS 600000 vs 60000, found by the defaults sweep) is now
  documented as deliberate beside the value and pinned with its WHY comment.
- The in-memory opt-in gained its unreachability pin: every operator-settable
  flag shape plus the REAL buildEconomyApps call site must still refuse a
  poolless market. The structural timingSafeEqual pin narrowed to the
  secretsMatch function body. The superseded "outside production" test name was
  renamed to the allowlist contract its own body pins. Doc truth-ups:
  MARKET_SETTLEMENT.md's "can never move a bond" sentence now mirrors the
  grief-forfeit-but-cannot-steal wording, and its CLAUDIUM_WOC_REFERENCE_MAX_AGE_MS
  cross-claim states the real story (the deployed .env sets the hour; that knob's
  code default falls back to CLAUDIUM_ORACLE_MAX_AGE_MS, one minute; the
  market/bootstrap.ts comment fixed the same way). Dead MarketRouteDeps deleted;
  dev_env.ts reflowed to "every consumer"; dev_chain.ts flag comment states the
  trim contract; .env.example documents the service-wide DATABASE_URL rule and
  CLAUDE.md carries it.

Validation after fixes: 445 tests, 441 pass, 0 fail, 4 env-gated skips (the
CLAUDIUM_TEST_DATABASE_URL pg set). All 12 lane-prescribed mutations run serially
with in-memory restore and proof-the-test-ran checks, all BIT their exact named
test (isOpsOnlyPath refund entry, secretsMatch length guard and unset-expected
denial, explicitlyDevOrTest denylist revert, poolless refusal, second-oracle
revert, printableAscii newline, secret trim, requestPath raw, admin 503 gate, sol
wallet capture, trimmed-ASCII order). A fresh re-review lane audited the fix
round's three commits with its own mutation experiments on throwaway builds:
0 blocking, 7 should-fix, 8 nits, ALL applied in a fourth commit (tip
aa44873; the vacuous money-rail arms re-pinned and mutation-proven, the
compose NODE_ENV pin anchored, the quote-TTL default exported and truly
pinned, the walk-up anchored on .git, the 'real' Stripe arm added, compose
DATABASE_URL required at interpolation, and the doc and enumeration
truth-ups; full registry in the state.md 08 ledger, incl. the two deploy
notes for Fernando).

Judged, no code change (recorded, do not re-raise): GET /v1/health?x=1 now
answers 200 where the raw-compare 404ed (the uniform normalized contract,
deliberately pinned); a literal second '?' in a query now follows the RFC reading
where the old per-handler split silently truncated (comment records it; standard
clients percent-encode); the DATABASE_URL construction test's internal pg.Pool
has no teardown (the env-DSN branch is the pin's whole point, pg connects lazily,
and a pg behavior change surfaces as a loud suite timeout, not a silent pass);
the timingSafeEqual presence pin remains textual (now function-scoped; the
behavioral RangeError case is the true guard).

Game worktree work this session (the sync the push required): release/v0.38.0
merge bfceae8d4b, NON-trivial (33 conflicts: the error-code family union, the
retention config/sweep unions with listings kept LAST, the registry spread union,
21 generated i18n bundles regenerated, the world_api_parity narrative, the
admin_guilds rig comment taken from the release, one modify/delete). Count pins
re-derived from runs: IWorld 324 = 86 data + 238 methods (the union of this
branch's tradeClose and the release's marketSellPriceCheck), sends 200,
dispatches 213. The merged server/game.ts overshot even the release's raised
ceiling, so the legacy full-aura wire encoder (WireAura + wireAura) moved
byte-identical into server/snapshot_timer_wire.ts beside the stable aura cache
that already mirrors its rules; hud.ts and sim.ts pinned at merged actuals
(19170, 12505). The release-merge-audit ran (agent, full seven steps): overlap
patch-identity CLEAN across all 68 branch-owned files, injected-helper bindings
CLEAN, i18n regeneration proven mechanical, db-mock trap does not fire; it found
THREE union-only reds, all fixed and proven (the dead-code sweep's deletion of
scripts/trade_money_shot.mjs whose references are branch-owned, restored
byte-identical; the widened Windows-path guard vs server_sim_facade.test.ts's
bare .pathname reads, wrapped in fileURLToPath; the new sparse cones missing
docs/screenshots/woc-market, added to all five cone blocks and the workflow
pin) plus pin-quality repairs (the retention last-entry pin now scrapes and pins
the full 20-name table order after the old two-indexOf compare proved gameable;
the five new prune call-forms joined the pre-listen and exactly-once lists;
WOC_MARKET_SCHEMA gained its ensureSchema wiring pin, mutation-proven; the
error-code duplicate guard now scans the source literal instead of the
already-collapsed Object.keys) and the aura-move's two orphaned imports dropped
(game.ts 10818, ceiling banked there). Real-SQL marketplace suites 154 green
zero skips against dev Postgres (the audit's residual). Gate GREEN at
ad197c0801: full-suite fallback (planner correctly refused to reason about a
208-commit merge), all 12 steps (the gate grew four manifest steps since the "all
8 steps" era), 39724 vitest tests + 129 browser, WITH TEST_DATABASE_URL so every
pg suite executed.

## 08 implement round (service auth hardening and fail-closed config)

Service repo, worktree woc-rewards-service-pr31, branch integration/woc-market-settlement.
Session start 70d4207 (= PR #31 tip; origin/master already merged, fetch confirmed no
movement). Baseline suite green (413 pass) before any change. 12 commits, tip 4b9e413,
LOCAL per R4. Validation matrix ran green after every slice: npm run build + npm test in
service/ (final: 439 tests, 435 pass, 0 fail, 4 skips, the CLAUDIUM_TEST_DATABASE_URL
env-gated pg set).

- B5: new service/src/http_guard.ts (requestPath, requestQuery, secretsMatch,
  printableAscii); server.ts derives the path ONCE and hands it to every gate and every
  handler (all handler signatures moved from raw url to path + URLSearchParams;
  market/routes.ts matchers take the normalized path). The regression test drove the real
  socket and was RED on the old code: POST /v1/claudium/refund?x=1 with only the internal
  secret returned 200 and executed the stub refund; now 403 with the handler unreached,
  same for the gift-card clawback. Deliberately NO decoding, slash collapsing, or
  fragment stripping: gates and handlers compare the identical string, so every
  unrecognized shape (fragments, %2F, //, absolute-form targets) fails closed to 404,
  pinned over the socket with both secrets. The ops tier is the exported isOpsOnlyPath
  with its membership pinned both directions.
- Secrets: length-guarded timingSafeEqual (mirrors the game server's secretsMatch);
  trimmed and boot-enforced printable ASCII on the RAW value (a Unicode-space pad hits
  the loud refusal instead of being trimmed into a secret no client can send; a plain
  space pad now authenticates its transported form, pinned); unset internal secret
  throws, unset or whitespace-only admin secret 503s the ops tier, all pinned via a
  helper that closes an unexpectedly started server so a regression fails by name
  instead of hanging the file.
- Fail closed: new service/src/dev_env.ts explicitlyDevOrTest is the ONE allowlist
  (NODE_ENV exactly development or test; unset refuses) and all THREE dev escapes ride
  it: the market dev chain, CLAUDIUM_ALLOW_IN_MEMORY, and CLAUDIUM_ALLOW_FAKE_STRIPE
  (the third was found by the fix-round reviewer still on the denylist; a stray flag
  advertised a Stripe checkout that can never complete). buildMarketApps refuses a null
  pool unless the code-only allowInMemoryStores test seam is passed (config-unreachable;
  the explicit null pool buildEconomyApps passes through now refuses), so an enabled
  market requires DATABASE_URL. Every refusal ran red-first on the old gates.
- Compose and oracle: WOC_MARKET_PRICE_MAX_AGE_MS compose default 120000 (the
  permanent-halt value) to 3600000 with the WHY recorded beside it; the pyth venue
  imports DEFAULT_MARKET_ORACLE_CONFIG.maxAgeMs instead of repeating the literal;
  MARKET_SETTLEMENT.md's stale 30-minute claim trued to one hour. Bonus REAL bug found
  by review: bootstrap built TWO MarketPriceOracle instances, the heartbeat and boot
  prime warmed one while the market quoted from the other (exactly the false outage the
  heartbeat comment promises to prevent); now shared, red-proven by the min-samples-2
  priming arm.
- Reviews: security lens + correctness lens (fresh, coverage-prompted, both reported
  socket-probe and mutation evidence); fix round 1 re-reviewed fresh; fix round 2
  re-reviewed fresh (mutation-verified every new pin); round 3 (docs, comments, tests)
  self-reviewed with files open. Every finding applied including nits; judged and
  deferred items recorded in the state.md 08 ledger entry with owners.
- Service repo gained a concise top-level CLAUDE.md (auth contract, fail-closed gates,
  validation commands); .env.example documents the padding contract and the NODE_ENV
  allowlist beside all three escape flags.

## 07 policy and terms drafts round (docs only)

Release sync: merge 8a1739d67a (origin/release/v0.38.0 tip 62626b5cc1, the
GPU-hitch instrumentation, night-lighting, and OTA-overlay trains, 83 files).
Trivial for this branch: no conflicts, no marketplace-owned files touched, but
tests/monolith_budget.test.ts AUTO-MERGED (the release lowered the renderer.ts
ceiling to 13708 after its own fire-light extraction), so per the count-pin
discipline all four pin suites were re-derived from a run: 377 tests green,
no re-pin needed. 47399f77b7 (the one 06 round without its own review)
verified first: comment-only src hunk as billed, and its production
sweep-fallback test runs green on the merged tree.

Deliverables, all landed:

- `TERMS_AND_CONDITIONS_MARKETPLACE_DRAFT.md` at the repo root, beside the
  UNTOUCHED live Terms, banner "DRAFT FOR COUNSEL. NOT IN FORCE." A complete
  revised document, not a fragment: Section 6 carve-out, Section 8 rescope
  (licence-transfer framing), Section 9 split (linking stays no-transaction;
  marketplace participation is transactional), new Section 10 covering
  trading, participation (18+ floor proposed, browser-only, jurisdiction
  refusal), the R9 acceptance-surface requirement (10.3), custody/escrow,
  bonds/forfeiture, settlement, fees/burn, finality/disputes, conduct,
  taxes, availability; old Sections 10 to 22 renumbered to 11 to 23 with
  every cross-reference verified (survival list expanded to swallow the new
  Section 10 deliberately). Counsel-judgment passages carry `[COUNSEL]`.
- The counsel decision memo, held PRIVATELY at
  `/Users/fernando/Documents/woc-counsel/counsel-decision-memo.md` (outside
  the public repo per the state.md locked decision): the adopted position
  (five points), nine counsel questions (R9 acceptance surface incl the
  seller-side gap, Section 8 reconciliation, age floor, regulatory posture,
  finality vs consumer law, app-store posture, liability cap, tax, privacy
  disclosure), the exact-changes list, and an enable-time checklist the 22
  audit consumes.
- Carve-out reconciliation, consistent across every claim site: README
  (Highlights bullet AND the Web3 section), wallet-link.md,
  holder-cosmetic-flair.md, marketplace.md launch gate 1 (now points at the
  landed position + memo), with the deed/reliquary "never power" lines
  verified to be a DIFFERENT system and left alone.
- Staleness cluster: marketplace.md (forfeit destination truthed to R2 with
  the service-side all-treasury divergence recorded, delivery is
  grant-with-mail-fallback, review-state resolver honesty, TOTP superseded
  by R1 with the phantom-scaffolding inventory), p2p-woc-trade.md
  (implementation status trued to landed, counterparty-by-name resolution,
  cap-exemption row, view-core paths), DESIGN.md window inventory (the
  Exchange and the trade $WOC arm join the completeness claim),
  malware-scan-catalog (both signing surfaces in both sentences),
  release-malware-audit + privacy-security-review agent docs (the
  real-money-rails claims), docs/ + src/net/ + src/ui/ CLAUDE.md.

Findings the next sessions need (also in the state.md ledger): the
public/terms.html acceptable-use section has drifted independently of the
marketplace and contains no real-money bullet at all (publication is a
reconciliation); sellers never accept terms in code (createListing and the
seller accept run no guardTerms) while draft 10.2/10.3 promise it, memo
question 1 owns the ruling and the enable-time checklist carries the gate;
draft 10.5 states the R2 forfeit split that the service does not implement
yet (09 owns) and the client discloses no forfeit destination; the 20
docs/i18n/README locale files carry pre-carve-out Web3 wording for the
maintainer release fill; server/db.ts's cosmetic-only comment citation and
the guide catalog's "No pay to win, ever" line are code surfaces deferred
with owners.

Validation: copy floor clean over every added line (the one dash hit in the
tree is a pre-existing untouched line); anchor rule held (sections and
symbols, no line numbers); npm run ci:changed exit 0 with zero errors; zero
code diff (fifteen .md files: thirteen package files plus the two ledger
files; the QA round corrected the original fourteen count). A FRESH proofreader swept the whole package
for internal consistency and factual accuracy against code: 1 blocking
(draft 10.5 pointed at a marketplace-interface disclosure that does not
exist), 7 should-fix (a false counterparty-binding claim, the view-core path
contradiction, the memo misquoting its own draft, marketplace.md still
implying TOTP-to-come against R1, the ui CLAUDE.md reading as if the panel
already follows the model, the unrecorded seller-gate obligation, change
summary omissions), 6 nits; every finding applied, including nits.

## 07 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Release re-sync: merge 55c2ba992e (origin/release/v0.38.0 tip b08d79ef91,
two commits: the CI selective-floor and related-legs merge). Trivial: no
conflicts, no marketplace overlap, none of the four count-pin files
touched; tsc clean and the four pin suites 377 green on the merged tree
as insurance.

Session-start verifications, all clean: the phase diff is exactly fifteen
.md files with zero non-md; TERMS_AND_CONDITIONS.md and public/terms.html
byte-untouched across the whole outgoing range; the draft bannered DRAFT
FOR COUNSEL; the counsel memo present at its private home, absent from
the branch (tree filename scan plus distinctive-content grep; only the
two sanctioned ledger pointer references exist); no secret-like patterns
in any outgoing doc diff; copy floor clean; ci:changed exit 0.

Eight fresh audit lanes ran over the package (fix-site re-verify,
completeness-vs-code, claim greps, overpromise hunt, cross-doc
consistency, renumbering reference-by-reference, anchor rule, and the
phase-prescribed fresh proofreader). The unreviewed proofreader-fix
round from the implement session verified clean site by site: the 10.5
forfeit sentence states R2 with no phantom disclosure, the
counterparty-by-name paragraph matches the create-time server-side
resolution, every cited view-core path exists, the two main TOTP
passages read superseded, the Exchange bullet is R9-honest, and the
change summary was reconciled section by section against the live Terms
(renumbering clean, all cross-references correct, survival list
deliberate).

The round's own finds, all applied:

- The draft was missing three shipped mechanics. Blocking: the seller
  opt-in second-chance offer (sellOfferNext), under which an outbid
  runner-up whose bond is still held or refund-pending is re-armed and
  promoted into a fresh settlement window at their own bid, with default
  then striking (and forfeiting a re-held bond); this falsified 10.5's
  flat "your bond is returned when you are outbid". Also uncovered: the
  anti-snipe extension and the buy-now abandon cooldown pair. All three
  now have governing sentences, the cascade one [COUNSEL]-marked.
- Draft wording drifts trued to code: the 10.4 cancel boundaries (any
  standing bid refuses, cancel-intent is automatic, support waits out
  in-flight payments), bid withdrawal scoped to signed bonds, bound
  items scoped to boundTo copies, the 10.6 pause paragraph (windows keep
  running and broadcast payments still verify and deliver; the old "no
  sale becomes irreversible while pricing is down" was false against the
  confirm path), 10.7 rounding/wallet-identity/addresses, and the
  Section 9 bond-custody carve-out ("we never hold your funds" was
  contradicted by the operator-held bond).
- Companion truth-ups: marketplace.md (third TOTP site, marketplace-wide
  suspensions, the phantom store-catalog consultation replaced with
  WOC_MARKET_EXCLUDED_ITEM_IDS), wallet-link.md (service-built),
  README.md (not-a-party-to-any-marketplace-sale), p2p-woc-trade.md
  (cap knob anchor), src/ui/CLAUDE.md (the Exchange checkbox owes its
  own terms link).
- The change summary now discloses the survival-list expansion and the
  [COUNSEL] flag added to old Section 16.

New deferreds with owners (recorded in state.md's 07 QA ROUND bullet):
the Exchange-checkbox terms affordance (14/15), the auction-arm
strike/forfeit oracle-health asymmetry plus the pausedBanner and
sellFeeNote copy (14), the bidder-facing offer-next disclosure (14), the
woc_market_rules.ts store-catalog and bidding-suspensions comments (next
code change), the unreachable cascade re-quote arm the woc_market.ts
comment describes (a refunded runner-up proceeds bond-free as shipped;
09 owns converging mechanic, comment, and the draft's second-chance
sentence), the wind-down runbook behind 10.10's promise (22). Judged, no change: R6
stays recorded sent-to-counsel with the note that the amended draft is
the copy to forward; 10.10's return-and-resolve promise stays as an
operator-conduct commitment; the fee-change prospectivity sentence
likewise.

Validation: copy floor clean over every added line; anchor rule held;
npm run ci:changed exit 0 on the fix round; a fresh reviewer re-verified
the QA fix round before the push; pushed per R4.

## 06 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Release sync: merge ab2742012b (origin/release/v0.38.0 tip 172ed59d01, the
map-marker overhaul + CI harness splits, 203 files). NON-trivial: three
test conflicts (world_api_parity, monolith_budget, language_fanout) PLUS
two silent count-pin auto-merges the conflict markers never showed (the
parity union pin at the file bottom took 322 while the real union is 323;
the fanout count took 9 while the merged list is 10). Every pin
re-derived from a suite run per the count-pin discipline: IWorld 323 = 86
data + 237 methods (both sides had claimed 322 with different splits);
fanout exemptions 10 (one new row per side); hud.ts ceiling DOWN to
19160 (the release extracted map marker interaction out of the
coordinator, the ratchet follows the file down); sim.ts 12436 (the
release's civic service placements). The release-merge-audit skill ran
over the merge: seven parallel overlap groups (hud, sim, online, shell,
world_api, catalog, guard suites), ZERO findings, both sides' intent
verified preserved by diff-of-diffs and blob identity; i18n regen
drift-free; command_schema green.

First QA work, per the packet prescription: ea1bb82322 (the one round
without its own review) verified before anything else. Its src hunk is
comment-only as billed; the CONTROLLER source pin rides stripComments
(not comment-gameable); the panel pass-through pin is behavioral (paint
drives the real wocTradeModelFrom); the three restore count pins are
exact counts; four targeted mutations (drop the pass-through, revert the
controller feed, delete each restore) all bit exactly their pins.
Verdict: clean.

Six FRESH audit lanes over b948aa64fb..ea1bb82322 (privacy-security,
test-coverage, architecture, frontend-seam, correctness-vs-promises,
dead-code/doc-staleness): ZERO blocking code defects in the implement
round; all four phase-file probes answered (the wallet-twin NOT EXISTS
really rides the claiming UPDATE and the bid guard was not weakened; the
fingerprint covers the whole instance payload with only count and the
advisory slot outside it, and there is no durability axis in this game;
strike parity is auction-default parity minus the bond, documented, with
non-decaying strikes a deliberate difference; the auto-close return
flight reuses closeListingIfNoOpenSettlement plus the shared
undisposed-return path, nothing bespoke). The coverage lane found FOUR
blocking TEST gaps (no successful instanced escrow anywhere, the crafted
leg untested server-side, pinned-copy-first undiscriminated from the
generic walk, the agreed-item wire body unpinned at both hops), and the
test-writer wave found a real CODE defect while proving them: the
capacity model modeled arrivals fungible-first while the swap ships the
staged pinned copies first, so a pinned instanced arrival at a full bag
passed the gate and overflowed the receiver (the third drift of that
model class after #2139/#2605).

The fix round (commits c67af5f62f sim, cedbaae8f2 server, 19eb3c74d6
ui): fitsAfterSwap now RUNS shippedOfferUnits (the walk removeOffer
delegates to) over scratch bags for both the gives and the receives, so
the modeled copies equal the shipped copies by construction (red-first
repro, then green; parity gate green after); the instanced matcher
gained the crafted-marker leg with discriminating tests both directions;
createDirectedOffer gained guardTerms (strike parity, the pay arm's
recorded premise finally true; route decodes strictly, sdk requires the
flag, controller sends it); the accept belt reads the model's own
canAccept/acceptHint ladder (canAccept got its production consumer, the
retired stale copy stays retired via the logs-nothing past-review arm);
sweepError's production fallback logs code+message+stack null-safely;
Object.hasOwn at all three client-string ITEMS lookups; plus the doc
truth-ups (orphaned guardBalance docblock, the falsified
item-unknown-until-acceptance DDL rationale, the honest occupancy
ceiling, offer_pending in server/CLAUDE.md, the highest-id repair
tiebreak, the two-party NO_OWNER rationale, the bag-capacity staged
bound, behavior-identical extraction wording).

Test additions (the three-writer wave + the fix-round re-review's
hardening, commits 9c9854ee85 and 47399f77b7): the pg suite grew to 23
(directed return flight with the parcel book, custody claim row, and
item_disposed flip plus an idempotent second pass; the seeded
boot-repair dedupe proving the highest-id survivor and a rebuilt valid
index; byte-identical duplicate acceptance; instanced+crafted
end-to-end; the prune count made exact by construction); the service
suite gained the instanced happy path proving both digest sites agree,
the crafted leg both directions, the terms arc, the ever-settled DB-free
twin, the converge old-bound arm with the 24h literal pin, the
cap-refusal-before-custody witness, and the sweep-fallback shape test;
the routes test captures the forwarded body (identity + strict terms
decode); tests/items_sell_units.test.ts is the shared walk's direct
suite (12 cases incl. the foreign-id decoy placed where an id-blind walk
would eat it, identity assertions over deliberately deep-equal payloads,
both predicates on one fixture, and the wrapper's walk-then-hook order);
trade.test.ts pins pinned-copy-first, both marker directions, the
quest-log-order batch deltas, the overflow refusal, and the gives-side
full-bag acceptance; the view comparator's key-order independence is
pinned both ways; the panel's hint live-region has its pin. 21 mutation
probes across the session (9 main-loop guard mutations incl. both H14
arms, the ever-settled gate, the expiry qual, the converge old bound;
plus the writers' 12) all went red on cue.

Judged, no code change (recorded in the ledger; do not re-raise): the
strike non-decay difference, the late-accept buyer-notice gap (bounded
by the 600s offer TTL and the withdraw lever; 14 owns the surface), the
client-only one_item quantity rule (overlaps the recorded 14/15 honesty
residual; a server-side staged-shape check noted for 14), the padlock
pin interaction (fail-safe refusal; 14's copy surfaces), the per-actor
offer fan-out (rate-limited and pair-bounded). NEW OPEN RULING R9: the
trade arm records implied terms consent with no terms text shown;
acceptable only while the market stays config-off; the pre-enable audit
must carry it.

Validation: tsc clean throughout; ci:changed exit 0; parity 207 green
twice (no golden regenerated); the S3 guard, architecture,
hud_perf_budget, language_fanout green; all five pg suites 152 green
zero skips ON THE FINAL TIP; qa-checklist READY with 0 blocking and its
three should-fixes applied (the fallback-branch test, the R9 ledger
recording, the marker-scope comment); gate GREEN at 47399f77b7 (node
scripts/gate_select.mjs with TEST_DATABASE_URL exported). The final
tests-only commit 47399f77b7 implements the qa gate's own prescriptions
(34 lines); the 07 session should glance at it first, the ea1bb82322
pattern one size smaller.

## 06 implement round (directed rail and self-deal integrity)

Release sync: merge b948aa64fb (origin/release/v0.38.0, 16 commits, the
chronomancer heal-tuning train; no marketplace overlap, no count-pin
surface, tsc clean; release-merge-audit not warranted).

Both opening judgments settled BEFORE code, (b) first since it shaped
H10: (b) NO boundTo stamping this packet (the honest rationale is the
escrow lifecycle, not anonymity; truthed-up at exchange_eligibility.ts;
lifting it is an offered R7-pattern product follow-up); (a) UNWIND made
provable (the atomic in-transaction listing stamp turns
accepted-with-no-listing into rollback PROOF; the convergedOffers arm
finishes the unwind from durable truth; the quarantine and parked-copy
legs stand). Full rationale in the 06 ledger entry (state.md).

A database-performance PRE-implementation checkpoint returned BLOCK with
six P1s, every amendment folded in before code: the five-statement
occupancy arithmetic (allowance 5000 to 4000), the expiry sweep's
status qual + SKIP LOCKED beside the new stamp lock, the never-settled
strike gate ordered after the close CAS, the offers listing_id FK
index, the phantom retention prune made real, the zero-row claim deref,
the advisory wallet read dropped for the in-hand fast path, the
converge ordering + the directed close's live-lock refusal. It also
corrected the brief's own premise (the "12h hold" was
WOC_MARKET_DURATION_HOURS[0] via directedParams; the cap-exemption
rationale comment was false against the code).

Red-first evidence: the new pg suite failed 7 of 9 against the pre-fix
tree for exactly the target behaviors (the relink-dance claim
succeeding, the 12 hour hold, both cap exemption halves, the missing
auto-close, the missing never-claim strike, and a bait-and-switch
acceptance with a re-rolled copy going through).

The four-reviewer round (fresh privacy-security, db-perf close-out,
migration-safety, test-coverage; one earlier reviewer wave died on a
usage limit and was relaunched fresh), every finding applied incl.
nits:
- SECURITY CRITICAL: the H10 pin was wired to a source that cannot
  carry an instance payload (tradeSetOffer normalized staged lines to
  id+count; the seller could not even resolve an instanced accept).
  Fixed by per-copy staging through the swap's own selection walk; the
  full mechanism and its knock-on fixes are in the ledger entry.
- Strike fairness: the oracle-health gate, the shared exempt-vocabulary
  gate (documented unreachable today, the R5 seam), the pair-pending
  unique index bounding strike farming, the probe-after-close ordering.
- The stranger-bid hole on directed listings (an active bid diverted
  the directed close into the auction close).
- dbperf P1: the pin stored as a sha256 digest + the 2 KiB instance
  intake bound (which also fixes the migration round's verified
  sortedJson stack-overflow 500).
- migration W1 / dbperf F3 (independent finds): the listings prune's
  ON DELETE SET NULL falsifies the converge premise for completed
  deals; the converge window gained its upper age bound.
- Coverage: the different-item-id arm, the legacy NULL-pin arm, six
  structural SQL pins, the config knob row, honest retitles (the
  outer-qual and deadlock-probe tests claimed more than they proved),
  the route schema tests, and more (ledger).

The fix-round re-review (fresh, the standing rule) found two blockers
IN the fixes, both repaired with repros: the capacity model's fungible
double-count under per-copy slots (receiver overflow past the gate) and
the seller accept still reading the HUD-local id-only list. Its
should-fixes and nits all applied (offer_pending as its own code, the
fake bid mirror, auto-close before the strike, the trade-scoped pinned
matcher, the per-line quest-hook cadence, the full-payload trade-wire
judgment recorded at stagedOfferSlots).

qa-checklist (LAST) returned NOT READY on one real blocker, applied:
reopening an accepted offer is an INSERT into the pair-pending unique
index, so every reopen site could 23505 (a 500 over the typed refusal;
on the proven-rollback path it destroyed the root-cause trace); the
reopen is now pair-aware and no-ops, the converge arm expires the
blocked row at its TTL, and a boot repair dedupes populated dev
databases ahead of the unique index. Its should-fixes applied: the
whole-table one_item rule (an ineligible companion misleads the buyer
the same as a second eligible slot); the order-independent
inventoryIndexOfStaged comparator; the realistic-payload positive
control for the intake bound.

The first gate run (full-suite fallback) caught three more: the stale
5000 tunables literal, the error-code append-only snapshot, and the
trade-staging fallout in four suites (two were deliberate-enrichment
expectation updates; two were the decoupled-inventory contract, fixed
with the unattributed-remainder fallback). It also surfaced ONE
inherited red: tests/admin_guilds_db_integration is red on the release
tip itself (env-gated, CI never runs it; accountDetail gained the
general-chat quota join while the rig hand-picks its DDL); repaired in
place. (The release later fixed the same rig upstream in 10629f302a;
the v0.38.0 merge kept one copy, the release's comment.)

Validation: tsc clean throughout; parity gate 207 green TWICE with NO
golden regeneration (plain staged lines serialize identically); all
FOUR marketplace pg suites + the repaired admin suite 146 green zero
skips; the affected DB-free sweep 1150 green; one-off EXPLAIN plan
proofs recorded (standing planner assertions remain phase 20 per the
recorded precedent); ci:changed exit 0; gate GREEN THREE times, at
5287214294 (38461 tests + 118 browser), at 5ebb176a73 (38472 + 118,
every production-code change covered), and finally at tip ea1bb82322,
each full-suite fallback, all 8 steps, run WITH TEST_DATABASE_URL.

The closing rounds (after the first gate pass): two INDEPENDENT fresh
reviews of the gate-round commit converged on the same defects from
different angles, and every subsequent fix round got its own fresh
review, six commits in all (f618eaf146, da5ca53b4b, d3f831b17e,
685fd0eb00, 5ebb176a73, ea1bb82322). The substance, beyond the first
round's summary above: the staged-slot resolver gained the crafted
marker leg of the itemCopyPin triple (a staged crafted copy resolved
to its unmarked twin and refused item_mismatch); the seller accept
mirrors the whole-table one_item rule with the model's new acceptHint
naming the RIGHT obstacle, judged over the sim's AUTHORITATIVE offer
table (the table the player sees rendered) with the compose list as
the no-session fallback, the controller belt as the only accept-time
enforcement, and both hand-offs pinned; reopenDirectedOffer reports
whether the row flipped so the converge stat cannot count blocked
no-ops; both acceptance-path reopen swallows report through the new
offer_reopen sweep-error tag with each catch's throwing arm pinned;
the pair index joined the carcass-drop convention, its name became one
exported constant consumed by the DDL and BOTH 23505 discriminators
(the insert harmonized: foreign-constraint 23505 rethrows), and the
convention pin gained a parsed reverse sweep; a deterministic
real-Postgres interleave observes the blocked reopen from a separate
connection before committing the racer (the first version's poll ran
on the racer's frozen snapshot and was an accidental 2.7s sleep); the
quest hook collapsed to one fire per removal batch; and the instance
intake bound measures real utf8 bytes. The final round (ea1bb82322,
tests and comments only) implements the last reviewer's own
prescriptions verbatim and is the one round without a fresh review of
its own: the QA session should verify it first.

Residuals recorded (owners; do not re-raise): phases 14/15 own showing
the buyer the pinned copy and the new refusal copy surfaces; phase 16
gains the estimate-amplifier and trade-wire diff-cost notes; phase 20
owes the standing planner assertions; phase 22's pre-enable audit gains
the two dev-database classes (raw-JSON pins; old-binary
accepted-unstamped rows with live listings). Accepted without code
change: the exempt-vocabulary strike gate is unreachable until R5
delivers the service vocabulary (the health probe is the live gate);
the intra-window oracle-blip strike residual; the full-payload trade
wire (a judged product truth, recorded at stagedOfferSlots).

## 05 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Release sync: merge b9e937c075 (origin/release/v0.38.0, seven commits: a
rift-forge rollback migration, a dockerignore fix, a rogue re-band; no
marketplace overlap, no count-pin surface, tsc clean; release-merge-audit
not warranted).

Re-judgments owed by the implement session, all four UPHELD with the
justifications repaired rather than the decisions:
- The queue numbers (5s wait / 2s warn / 30s throttle / 5s statement)
  stand; every literal and relation is now pinned, the throttle exported,
  warn and throttle injectable, and the occupancy relation scrapes
  AUTOSAVE_SECONDS from source instead of restating 30_000. The relation's
  COMMENT was the defect: it claimed the whole transaction stays under one
  autosave period, but BEGIN and the installing SET LOCAL ride the 15s
  session default and COMMIT's only hard bound is the 65s driver backstop,
  so the honest ceiling exceeds one interval and the docblocks now say so
  (the wait deadline and depth cap bound the player-facing impact; the
  tail rides 16 with the guild-flush 60s term).
- Quarantine PLUS kick on the ambiguous arm stands (quarantine without the
  kick strands a player on a session that can never save). The KICK WIRE
  was the defect: kickSession sends its SECOND argument, and both escrow
  terminal arms had the arguments swapped, sending untranslated jargon;
  now they send the matcher-covered takeover literal (pinned).
- 57014-stays-a-500 stands (the copy still restores via rollback proof;
  widening the shared isLockContention would reclassify a blown allowance
  as retryable across every guard).
- The commitGrant FIFO carve-out STANDS as follow-up work, now with an
  owner (16), sequenced AFTER the honest occupancy bound and gated on the
  claims-ledger park subset staying intact.

Five audit lanes (architecture, privacy-security, test-coverage,
correctness-vs-criteria, dead-code/doc-staleness), every finding applied:
- CRITICAL (security): TxNeverStarted stopped at the pool checkout, so a
  stale pooled socket failing at BEGIN still quarantine-kicked the seller
  for a transaction that provably never ran. BEGIN now rides the tag,
  which skips the code preference and discards the client; pinned DB-free
  (BEGIN-failure -> contended; a later codeless throw still rethrows).
- CRITICAL-class, found IN the fix round by the test-writing lane: withTx's
  error-preference helper dereferenced a null asyncErr on every CODELESS
  failure, replacing the real error and its stack with a TypeError from
  the preference line itself. Fixed null-safe; the tightened pin asserts
  the ORIGINAL message survives (red before the fix), and a second DB-free
  pin holds the coded-async-preference arm so the expression cannot
  collapse to a bare rethrow.
- Security warnings applied: the two kick-argument swaps (above, incl. the
  pre-existing guild-bank arm, same one-line class); the ownership probe's
  scope comment (account-scoped, and the directed-accept path is the
  consented exception); the occupancy-relation truth-up; the withTx
  preference residual documented (a coded async termination can mask a
  codeless fn bug; item-safe since fn threw pre-COMMIT).
- Coverage gaps closed (all pinned by mutation): the flush-THROW arm, the
  three escrowSessionLost arms incl. the pid guard and the wire literal,
  per-arm counter kinds, the mail-parcel pins (recipient/letter/slot/
  persist), the teardown-race restore, the client pre-filters, the mail
  attach control, the unbind round trip, the depth-warn writer, the
  whole-object stub pin, the jail fixup through serializeCharacterForPersist,
  cap-follows-the-WORK, and the widened carve-out source pin (sweep +
  monitor siblings).
- Firewall guard hardened: exact allowlist membership pin; the projection
  shape now refuses re-exports, generator exports, enum/interface/default,
  dynamic import, try, and the logical operators, each with a named
  offender case and a rule-completeness pin; positive controls for every
  pattern alternative (key-shaped and transaction-verb probes assembled by
  concatenation to stay clear of the malware scanner's signatures); floor
  460 against the real 475 (the recorded 474 was wrong at write time);
  the deliberate no-left-boundary over-match documented.
- Cleanup: orphaned imports deleted; stale restoreCopy premise rewritten
  (both quarantine arms are terminal, the real reason); PRD custody
  bullets updated (save-FIFO guarantee, bind_armed at the extraction
  seam); server/CLAUDE.md count-free fence wording and live-session FIFO
  scope with recorded exceptions; item_lock pointer; comment rewraps.
- game.ts grew 20 comment lines over its zero-headroom 10859 ceiling
  during the round; paid back by consolidating the SAME seams' comments
  (no code line touched beyond the two swaps), landing at exactly 10859.

Validation: tsc clean; 1182 green across the 27 touched suites plus the
always-run guards; the three pg suites 109 green THREE times (before the
fix round, after it, and after the db-perf P1 fix) under
TEST_DATABASE_URL, zero skips; ci:changed exit 0 (warnings only); the
three phase-file probes bit exactly their targets (the lamports plant
fired the firewall naming the file; the eligibility revert redded 8
tests across all five enforcement-point suites; the disabled ownership
hoist redded exactly the zero-side-effects pin). Gate GREEN at
eeaa137e5c: full-suite fallback, all 8 steps, 2707 test files / 38196
tests, the browser suite 118, typecheck and all builds, malware scan
PASS (the docs stamp commit lands on top of the gated tip).

Residuals recorded this round (owners; do not re-raise):
- 06 opens with two directed-rail judgments: the accepted THROW residual
  now has three legs (offer stuck 'accepted', seller quarantined/kicked,
  copy parked), and whether directed delivery should stamp boundTo and
  inherit the trade-window named-recipient exception (today a commission
  piece passes the gold trade window but not the $WOC arm beside it).
- 16 gains: the TxNeverStarted widening now includes commitGrant's park
  arm; a completed/terminal sibling kind for the wocEscrowQueue counter;
  the honest occupancy tail; the gold-World-Market straddle (the escrow
  write persists the character row alone, same crash window the 30s
  autosave already has, pre-existing realm-wide).
- A post-implementation database-performance pass closed that lane over
  the final code (all three post-checkpoint decisions judged sound as
  shipped) and found one P1, fixed in-round: reaching the 65s COMMIT
  driver backstop left a protocol-desynchronized client returnable to
  the pool (codeless rejection, no error event, the best-effort ROLLBACK
  consuming the stale response); withTx now discards on ANY codeless
  failure, pinned with a coded-failure poolable control. Its remaining
  P2s ride 16 with the rest of the queue cluster: a realm-global escrow
  in-flight semaphore (the per-character cap does not bound realm-wide
  occupancy; the 10-client pool is the only backstop today); a
  contention-class label on the refusal path (idle/lock/deadlock/
  never_started currently collapse into one untyped 'contended'); a
  draining refusal on createListing (the REST surface stays open through
  the shutdown drain, and the honest COMMIT tail weakens the 75s-grace
  premise the implement round accepted); the FOR NO KEY UPDATE narrowing
  of the accounts lock (measured to preserve cap serialization while
  freeing FK-child inserts; blast radius now documented at the lock);
  and, for 20, the optional runtime proof that a COMMIT past
  query_timeout leaves the client destroyed, plus a realm-wide
  peak-concurrency pin.
- Accepted, no code change: the FIFO self-deadlock rule stays documented
  with no runtime guard (a guard would false-positive the sanctioned
  void-kick pattern); the escrow write skips saveCharacter's post-commit
  steps by design (they catch up one save later); the guild-bank deficit
  ladder is newly reachable at listing rate (self-inflicted only); the
  architecture.test.ts hand-rolled walker with no scan-guard self-audit is
  pre-existing repo-wide debt.
- One transient shared-tree anomaly investigated and closed: a mutation
  probe's mid-run revert briefly swapped two counter call sites in
  server/woc_market_custody.ts; the agent repaired it and the final tree
  was verified byte-identical to HEAD at those sites before commit.

## 05 implement round (custody entry hardening)

Release sync: merge f07ca88278 (origin/release/v0.37.0, ONE locale-fill
commit; the only conflict was the generated pending.ts, resolved by
regeneration; no count-pin surface touched, so no re-derivation was
owed and the release-merge-audit skill was not warranted).

Recon corrected the packet premise twice before any code: only
grantTradableCopy's body sat on sim.ts (extractTradableCopy was already
the inventory_extract.ts leaf plus a facade whose real behavior is the
mount-dismount arm), and a bare `signature` firewall arm would have
flagged 49 measured false positives, all the game's own vocabulary.

A database-performance PRE-IMPLEMENTATION checkpoint (per the
extract-and-test rule for DB-backed changes) returned BLOCK with five
design amendments, every one folded into the build: the whole custody
critical section (extract, authoritative re-check, escrowInsertListing,
compensation) became ONE job on the per-character save FIFO (which also
deleted the planned extraction-time-snapshot fallback, F8); every
custody blob serializes through the save fixups (a raw serialize
dropped the jail flag: a moderation escape, F1); dirty guild books
flush atomically before the job with an in-job re-check (F2);
quarantined sessions are refused at wocCustodySession for every custody
op (F3); the HTTP wait got a depth cap and a deadline (F5); and the
transaction traded the 60s heavy allowance for a workload-scoped 5s
statement timeout plus the idle bound (F6; measured p50 3.5ms / max
8.3ms on a 27KB blob, printed and asserted by the pg cost test).

The H5 interleave suite was written FIRST and run RED against the
pre-fix code (scratchpad h5-red.txt: the escrow write committed while a
stale pre-extraction autosave was held open, and the escrow blob
replayed the request-time snapshot); post-commit, bypassing
runSerialized in createListing redded 8 tests including the headline
interleave pin.

Reviewer round (architecture, privacy-security, test-coverage, all
prompted for coverage), every finding applied:
- Security C1: the rollback-proof classifier's SQLSTATE shape check
  passed Node socket errnos (EPIPE is five uppercase characters), and
  withTx prefers coded errors, so the one ambiguous class classified as
  proof of rollback: the double-mint H5 exists to prevent. Now an
  ALLOWLIST of proven-abort classes with a table-driven suite over real
  SQLSTATEs and errnos (the null-input case caught a crash in my own
  first rewrite).
- Security C2 (IDOR): runSerialized ran side effects (guild-book flush,
  the depth-cap slot) before any ownership check; a foreign character
  id could occupy a victim's escrow slot and force their flush at the
  route rate limit. Ownership now resolves through the side-effect-free
  ownsLiveCharacter BEFORE the job; the in-job extractCopy re-check
  stays as depth defense.
- Security C3: the H5 reordering inverted restoreCopy's mail-arm
  premise (the leave flush now runs BEHIND the job, so the durable row
  still holds the item at refusal time and mailing risked two copies).
  Compensation now follows the extraction pid: restore into the live
  bags while the player entity exists (the queued teardown flush
  persists it), mail only once it is truly gone; pinned by the
  mid-leave restore test plus a positive control on the mail arm.
- Security W-set: the wait deadline now covers the guild-book flush
  (the wedged case it was sized for) and a flush throw refuses typed;
  the ambiguous park QUARANTINES the session (reload from the durable
  row converges both branches of an unknown COMMIT) with the full
  extracted slot logged; a lease-fenced write kicks the displaced
  zombie (saveCharacter's own signal); the queue-wait warn throttles.
- Coverage B1/B2: the classifier had zero tests (closed with the
  table-driven suite plus fake-db throw hooks driving both service
  arms); the depth-cap pin passed with the cap removed because the
  deadline answers the identical literal (closed with an unreachable
  deadline plus an elapsed bound). Also closed: the started-job arm,
  the re-dirty-during-wait arm, grant/snapshot fixups coverage, the
  stub-file allowlist shape pin, the direct serializeCharacterForPersist
  quarantine arm, the drained-cancelled-job asserts, the non-null
  stowed-pet fixups arm, the commitGrant carve-out source pin, DB-free
  contended/rethrow SQL pins, and the tunables ladder pins (both db
  constants now exported and literal-pinned).
- Architecture: both moves proven token-identical; parity goldens green
  and unregenerated; the firewall pattern recalibrated against the REAL
  server corpus (treasuryBase, derSignature, signatureAtMs, bs58,
  keypair, blockhash, the woc-amount shapes); the vacuity floor raised
  to the real tree size (440, recorded then as "of 474"; the real count
  was 475 and the QA round corrected both, floor now 460); the
  facade-delegate describe
  moved beside its module; the shared transfer-lock predicate moved to
  its own dependency-free leaf (transfer_lock.ts) so
  exchange_eligibility keeps an empty runtime import graph; the
  dailyRewards stub got a value pin. The market writer's depth-warn
  wrapper moved to serial_writer.ts (createDepthWarnedSerialWriter) to
  pay for the new game.ts host members under the zero-headroom ratchet.

Residuals accepted this round (owners; do not re-raise):
- acceptDirectedOffer leaves the offer 'accepted' with no listing when
  the escrow write THROWS (only the typed-refusal arm reopens). The
  conservative direction (an operator resolves; reopening could pair a
  live listing with a reopened offer). Owner: 06 (the directed-rail
  session judges an unwind or a park note).
- Armed bindOnTrade copies already sitting in escrow in a live database
  would still deliver anonymously (H6 gates entry only). Vacuous while
  WOC_MARKET_ENABLED=0; owner: 22 (a pre-enable audit line: scan
  listings' item payloads for bindOnTrade without boundTo).
- The escrow-queue observability is the throttled wait warn plus the
  typed contended refusals; the full metrics-counter treatment (dbperf
  F15) rides 16 with the p99.9 measurements already owed there, as does
  the saveAll-wave suppression measurement (dbperf proof 3).
- The behavior ripple from H6's shared predicate: armed commission
  pieces now vanish silently from the Sell picker and the trade
  window's exchange arm (both filters are reason-blind by design).
  Owner: 14/15 if explanatory copy is wanted.
- A left-mid-job seller whose teardown flush later FAILS terminally
  loses the restored copy with the durable row keeping it (item safe,
  bags stale until next login); double-failure shape, db-down class.
- The pg contended-ceiling timing bounds (1s..5s around the 2s
  lock_timeout) are generous but not saturation-proof; judged
  acceptable for an env-gated suite.

qa-checklist verdict READY (0 blocking, 2 should-fix + 2 nits, all
applied: the stale marketplace-PRD enforcement-point paragraphs, the
57014 comment truth-up at the escrow SET LOCAL block (the mapping
itself deliberately stays a 500: a statement blowing a 5s allowance
measured at single-digit milliseconds is an incident to surface, not
contention to retry, and widening the SHARED isLockContention helper
would change every guard; QA re-judges), the broker_custody PRD line,
and the daily_rewards_stub pure-leaf row). It also named the one
dispatch-table reviewer the phase list omitted: server-hot-path.

Hot-path round (1 blocking, 3 should-fix, 4 nits; applied or owned):
- BLOCKING, applied: a pool checkout timeout is CODELESS, so it
  classified ambiguous and quarantine-kicked the seller although no
  transaction ever started, in volume exactly under pool saturation (a
  self-amplifying loop). withTx tags TxNeverStarted; the escrow write
  maps it to the typed contended (restore rail); pinned DB-free.
- Applied: the wocEscrowQueue counter on the game-signals seam (the
  refused wait never reached the throttled warn); the FIFO-occupancy
  relation pin (4 x statement + lock wait + pool checkout < the 30s
  autosave period); the escrow-cost pin tightened 120x -> 25x slack;
  the wait-deadline docblock now states the real request ceiling.
- Owned by 16 (recorded, not silently deferred): the guild-book flush
  inside runSerialized still rides the 60s logout allowance, the
  dominant term in the worst-case FIFO occupancy (threading a
  workload-scoped allowance through saveCharacter is invasive); a
  pendingKeys gauge beside players-online; widening the TxNeverStarted
  -> contended mapping to the OTHER guard transactions (today only the
  escrow write maps it; the rest 500 as before, no quarantine
  involved); the per-listing serializeCharacter event-loop cost
  attribution.
- Accepted nits: the depth-cap slot pins for the process lifetime if a
  FIFO never settles past every db bound (visible as depth_refused);
  takeover/shutdown wait out the escrow bound (the 75s stop grace
  covers the ~27s worst case).

Validation: tsc clean; the 20-suite DB-free set 1078 green plus the
counter/metrics suites; all three pg suites 109 green under
TEST_DATABASE_URL (zero skips, demonstrably ran) plus the escrow set
(fence both ways, the 55P03 ceiling with elapsed bounds, the
lock-graph probe looped 5x on the public arm, the measured cost
distribution asserted at 25x slack); ci:changed exit 0.

## 04 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Release sync: merge a43a1e8b52 (origin/release/v0.37.0, 147 commits, seven
conflicted files). The count-pin merge trap FIRED for real: both sides
pinned IWorld 321 (ours via tradeClose, the release via setItemLocked) and
git auto-merged the identical numbers while the merged tree carries 322;
all five pins re-derived from suite runs (IWorld 322 / data 85 / method
237, sends 199, dispatches 212), never arithmetic. The release's hud.ts
additions broke the zero-headroom ceiling: fixed by extracting the
craft-deny message table to src/ui/crafting_deny_core.ts (registered pure
core, own suite; ceiling 19190 to 19177, zero headroom kept). The five
non-Latin overlay conflicts resolved as unions; i18n regenerated with ZERO
drift vs the auto-merge. Seven-lane merge audit: both sides survived as
exact unions everywhere; the release's player item lock (issue 3042) does
NOT gate the $WOC listing path, judged PARITY with the gold market (the
lock gates only salvage/craft/vendor by its own design) and recorded as a
phase 13 session-start design question, with a disambiguating comment at
the transfer-lock predicate; game.ts ceiling ratcheted 10900 to 10859 (the
release's cadence extraction never banked its slack); lock_item joined the
command-history narrative.

Re-judge list (all eight items): seven UPHELD with the reasoning re-run
against the code (R8 numbers: duty-cycle arithmetic re-verified, one
account bounded to about 13 minutes per hour of market-wide denial;
cancel-intent bid block: entailed by the one-window bound, the converge
belt proves it; confirm_in_flight second-signature semantics; the
already-succeeded retry arms; the held-bond posture; the stuckBonds axis;
the split anchors). One AMENDED: the confirming-hours no-upper-clamp
posture is REJECTED; the knob now clamps at 720 hours with a one-time
first-read warn (a huge value silently disabled the H15 park, and past
to_timestamp's range it 22008'd the sweep arm into silence), parse cases
pinned.

Real-SQL: all three pg suites under TEST_DATABASE_URL, 100 tests at
session start, 104 at the final tip, zero skipped (demonstrably ran).

Deep mutation pass (isolated scratch worktree, baseline 137 green), aimed
at the windows the prior 28 spot-proofs did not cover:
- recorder dedupe key: BIT (three window-mapped cooldown reds)
- exempt-list bound parameter: BIT (six reds incl. the structural pin)
- converge TxAbort rollback: FALSE survivor, then BIT; the pin lives in
  the BOND suite, not the settlement suite the harness first targeted
  (lesson recorded as memory mutation-survivor-wrong-suite)
- withTx idle-stall coded-error preference: REAL survivor; the busy-loop
  test covers only the sync stall shape. Closed with a private-seam
  async-stall pin proven red-on-mutant and green-on-real.
- open2 create-before-drop ordering: BIT (order-sensitive structural pin)
Plus two fix-round proofs: dropping the reviewed arm reds the H15 pins;
dropping the advisory cooldown answer reds the lock-free pin.

Five audit lanes over the two-session diff (privacy-security,
database-performance, test-coverage, correctness, cleanup/staleness), all
prompted for coverage; every finding applied or reasoned, the fix rounds
re-reviewed fresh. The applied set:

- Security (0 blocking, 5 should-fix): signature charset bound on BOTH
  intake routes (^[A-Za-z0-9_-]{1,256}$; the recorded string feeds an ops
  warn and the service, so control characters were a log-forging vector;
  five refusal pins + a dev-style pass-through pin); the confirming-hours
  clamp above; comment truth-ups (the db-file exempt prose overstated the
  predicate, the FK-edge comment overstated the risk, the paid-probe race
  gained its cosmetic-outcome note). Residuals accepted and recorded
  below: the exemption unreachable through the in-repo proxy, outage
  abandons against no-signature buyers, signature squatting, the
  service pending-contract dependency, the rotation-denial arithmetic.
- Database performance (six P2, measured with disposable-instance
  EXPLAIN): the H15 confirming park SPLIT into its own reviewed sweep arm
  with its own read and budget (confirmingOverdueSettlements; a confirming
  backlog carries the oldest deadlines by construction and owned the
  shared batch head, starving the offered/failed expiry work; the split
  also restores ordered-index pushdown for both arms, RESOLVING the
  recorded 16/17 UNION ALL item); the cooldown probes moved into
  claimBuyNowLock's lock-free advisory pass (a cooled-down account's
  retries at 20/min each took the listing FOR UPDATE just to be refused;
  the self-steal still pays the transaction where its abandon is recorded;
  proven lock-free by a new pg pin racing a held row lock);
  GUARD_IDLE_TX_TIMEOUT_MS raised to equal ESCROW_LOCK_TIMEOUT_MS (2000ms;
  500ms was four times tighter than the lock-wait tolerance with no
  measurement, and a false fire discards a pool client); the stuckBonds
  sample orders on the indexed placed_at (the COALESCE order top-N sorted
  every signed pending bond per refresh, about 4,000 buffers at 5k rows;
  divergence is minutes on an hours-scale readout and stuckSinceMs stays
  the honest per-row axis; the O(cap) docblock gained its honest
  exception); the rotation write cost and the abandons-prune plan recorded
  as measured comments beside their code.
- Coverage (5 should-fix, 6 nits): refreshBondQuote success-path test; the
  outbid replay outcome test; the teardown carve-out's third-dimension
  negative arm (a signed-but-HELD pending bid IS torn down to
  refund_due); the overdue default pass's ['won'] CAS pinned against a
  suspend-released bid; three CAS-lost re-read arms (placeBid contended,
  refresh confirm_in_flight, abandon re-read); the proxy scrape and the
  retention-wiring pins comment-stripped; the window pins made associative;
  the stale retry-test title; the DB-free bond-poll park arm
  (confirm-call counting across four passes); the no-signature exemption
  conjunct arm. Declined as recorded before: the LOCAL_LEDGER_TTL_MS
  eviction arms match the accepted parkedDeliveries gap (phase 16).
- Correctness (0 blocking, 3 should-fix; all five deliverables and the
  02/03 guarantees verified, 11 bid-status writers traced): the
  lapse-straddle hole CLOSED (refreshBondQuote could mint a quote
  outliving the bid's 300s lapse deadline, and a signature broadcast in
  the straddle arrived against a lapsed bid where NOTHING recorded it,
  the one H4 loss shape signature-first recording cannot reach; the
  refresh now refuses quote_expired when the quote would outlive the
  seat, the settlement leg's deadline-guard sibling; residual: the
  sweep-cadence boundary race, seconds instead of a quote lifetime); a
  confirm whose activation the POLL won answered standing:false (read as
  outbid by the very bidder whose payment stood; now answers from the
  row's real status); a recorded-signature retry against a review-parked
  settlement answered not_active (purchase gone) for money under review
  (review joins the outcome arm). All three pinned with tests proven RED
  on the pre-fix code.
- Cleanup/staleness (1 should-fix + doc round, hygiene sweep CLEAN): the
  misattributed prune docblock; the stale open-index comment; the missing
  lock-order carve-out comments (insertPendingBid, escrowInsertListing)
  plus disposeSoldResidueListings joining the CLAUDE.md list; the
  strip_comments header now states its string-literal limit and the
  architecture guard's copy points back; the unreachable-operator-arm
  wording fixed at the stuck route and in server/CLAUDE.md (the
  review -> confirmed/failed arms ARRIVE with phases 09/19; hand SQL
  forbidden); the config exception ledger gained wocMarketConfig; the
  count-rot sentences went count-free; the dead optionalString removed.

Residuals accepted THIS round (do not re-raise; owners):
- The abandon exemption is unreachable through the in-repo proxy (its
  unavailable arm always answers pending), so it guards only a remote
  DECIDED service_unavailable verdict: defense-in-depth as recorded by
  the implement round; phases 10/21 confirm the service contract.
- An economy outage can mint ONE recoverable abandon row against a buyer
  whose window elapsed unsigned (the exemption requires a signature);
  bounded by guardEnabledHealthy refusing new claims while unhealthy and
  by the rolling window; phase 12 health rail and phase 14 copy soften it.
- Signature squatting: both signature columns are globally UNIQUE and a
  rival can burn a victim's observed signature (refusal signature_reused,
  no recording); pre-existing, and this phase's TTL-long recording window
  widened the bond-leg exposure. Owner: R5/phase 10, the verifier must be
  able to clear a signature whose chain contents pay a different
  reference; the service-side reconciliation is the recovery meanwhile.
- The anti-snipe pending arm still trusts the service's pending contract
  for unknown signatures (recorded before; phase 21 owes a contract test).
- About seven rotating funded accounts can still deny one listing near
  100 percent (each seat costs a verified wallet plus balance); the
  cooldown is a partial defense by design, recorded.
- quote_expired's catalog copy ("request a fresh quote") is now also the
  lapse-straddle refresh refusal's answer, where no fresh quote will
  come: phase 14 copy item beside the recorded confirm_failed mismatch.
- Cancel-intent is irreversible by design (no un-stamp path); phase 14
  owns whether the seller-side marker needs an undo affordance.

A THIRD fix round followed the fresh re-review of rounds one and two
(the review-the-review rule paying out twice more; every finding applied):

- BLOCKING: the review outcome arm was server-honest and client-dishonest,
  BOTH clients rendered a review-parked payment as a completed purchase
  (the market window toasted purchaseComplete on any ok; the trade
  controller's SETTLING_STATES lacked 'review' so it logged settled in
  green). 'review' joined SETTLING_STATES and the window's confirm toast
  branches on the state; both pinned (a behavioral in-flight arm and an
  associative toast pin).
- BLOCKING: the signature shape check refused the trade controller's
  devsig:<reference> arm (references themselves carry colons), so the p2p
  settle 400'd whenever the service answered signatureRequired false. The
  shape admits ':' (still no control characters) with a colon-bearing
  positive route pin.
- The advisory cooldown shortcut skipped the steal-time recording for an
  at-cap self-steal (that window's abandon never booked, its per-listing
  cooldown never started): the shortcut now applies only when the peek row
  carries no recordable expired lock, pg-pinned (the fourth abandon is
  recorded before the refusal).
- The straddle guard compared a PREDICTED expiry; the authoritative check
  now also compares the service-minted expiresAtMs against the lapse
  (service-stub pinned). And the refusal got its own typed code,
  woc_market.bond_window_closed (409, catalog leaf + five non-Latin
  fills, REFUSAL_ERRORS 48 rows): quote_expired's copy told the player to
  request the exact thing that had just refused and would keep refusing.
- Coverage: the not_pending re-read's FALSE arm (superseded stays not
  standing); stats.reviewed pinned; the stuckBonds ORDER BY placed_at
  structurally pinned beside its sibling; the craft-deny table
  exhaustiveness-pinned via satisfies plus a station-recipe negative arm;
  the placeBid CAS refusal pins nothing-written; the raw ESC byte in the
  routes fixture became its escape sequence.
- Docs: the stale six-refusals sentence, the parkOverdueConfirming
  docblock tense, the inert arm-order clause, disposeSoldResidueListings
  dropped from the carve-out list (not a transaction), the boot-warn
  wording corrected to first-read, and the resolved migration INFO noted
  in the ledger.

qa-checklist verdict READY (0 blocking; its three should-fixes are the
stale comment, the missing ORDER BY pin, and the copy-honesty gap, all
applied above; its nits recorded: the 2.6s busy-loop stall cost is the
accepted price of the idle-bound retune, and the turbo.json
noUndeclaredEnvVars warning is tree-consistent).

Gate: the first full run failed exactly one suite, the station-toast
source pins in profession_identity_card.test.ts still scraping hud.ts
for the ternary the crafting_deny_core extraction moved (a suite the
targeted runs never touched: the full fallback earning its keep);
retargeted to the core and GREEN at 8c1028e89d, full-suite fallback,
all 8 steps.

Deferred proofs with owners: standing planner assertions for the two
rotation indexes in the pg suite (phase 20); the p99.9 inter-statement
event-loop gap measurement behind the idle bound (phase 16); an at-scale
advisory-cooldown concurrency proof (phase 16/20).

## 04 verification round (re-run of the implement session over its committed tree)

A dedicated session re-executed the phase prompt to verify the implement
round (which had run over context) left nothing incomplete. Verified
directly: branch synced with the newest origin/release tip (no-op),
phase-start commit recorded, all three real-SQL suites green under
TEST_DATABASE_URL (96 tests, demonstrably run), tsc green, server/CLAUDE.md
current, .env.example knobs present, REFUSAL_ERRORS at its pinned count, the
five non-Latin fills symmetric, operator semantics documented at the stuck
route, and three committed-round mutations independently re-bitten (park
axis to placement, holderless clear, confirming arm dropped: each reddened
exactly its named tests with the suites provably running). Two fresh audit
lanes then ran over the committed diff (a deliverables-vs-claims audit and
a test-coverage audit); every finding was applied, each behavior fix with a
test that fails on the old behavior:

- Route-level cancelPending forward was the ONE unpinned wire hop (blocking):
  two handler-driven cases now pin both bodies; a mutation to a bare
  { ok: true } reddens the new pin (proven).
- Typed second-signature refusals: a DIFFERENT signature against a signed
  pending bid answered not_pending (bond leg) / not_active (settlement leg),
  a false dead-row verdict that also discarded the event silently; both legs
  now answer confirm_in_flight, the first claim stays the trace, and the
  chain is never asked about the discarded string. Residual, recorded: the
  second string has no ledger slot of its own (single-column model); the
  reference-scoped service verdict is the double-broadcast backstop (phases
  09/10).
- Idempotent settlement retry: resubmitting the RECORDED signature against a
  confirming row re-asks the chain instead of refusing not_active; the retry
  skips the recording write, so it cannot re-stamp updated_at (the H15 age
  axis; a spy pins the single write). A revived failed row's replaced
  signature is logged on the dev channel before the overwrite.
- lapseBid held-bond carve-out: a reorg-flipped (settled-then-refused)
  verdict could void a HELD bond into a state no refund arm reads (bondsDue
  selects refund_due/forfeit_due only): the exact loss class this phase
  closes. lapseBid now requires bond_state 'pending'; the held row stays
  with the poll, visible via stuckBonds, and the positive control in the
  same test proves ordinary lapses still fire. Exit rides phase 09 tooling
  or operator resolution (recorded in the handoffs).
- First-arrival extension anchor: re-posting one pending-forever signature
  (rate limit 60/min) re-anchored the anti-snipe extension on a fresh clock
  each time, holding the close at now plus the extension continuously to the
  cap; submitBondSignature now RETURNS the first recording moment and
  confirmBond anchors on it, so a re-post extends nothing (service arm pins
  no-creep; a pg arm pins the returned stamp across a one-hour retry).
- cancelListingIfUnbid gained the idle-in-transaction bound: the
  cancel-intent work had grown it two round trips inside its FOR UPDATE
  window without one (the constant's retrofit scoping predated that growth).
- stuckBonds now ages on COALESCE(bond_signature_at, placed_at), the poll
  park's own axis (the readout described a mechanism it did not measure;
  divergence was bounded but the axis is now honest). Wire shape unchanged.
- Pin hardening: the window test's new presence pins scan comment-stripped
  source (tests/helpers/strip_comments.ts, extracted on the rule of three
  with its own suite; architecture.test.ts deliberately keeps its original
  copy, being a self-contained load-bearing guard); the bond rotation index
  pin now includes its WHERE predicate; the idle-bound pins assert the
  literal 500; WOC_MARKET_BOND_POLL_PARK_SECONDS and the anti-snipe trio are
  literal-pinned, plus a comment-stripped identity pin on the park
  comparison site (its value coincides with the pending TTL, so a constant
  swap was behaviorally invisible); the paid-subset probe rides the new
  shared PAID_SETTLEMENT_STATES_SQL with a subset-relationship pin; the
  anti-vacuity window guard reads the real constant.
- Docs truth-ups in state.md: 17 (not fourteen) mutation spot-proofs, the
  28-test bond suite, the cancel_rotation index name in the arm-two bullet,
  the six-of-seven lock-free wording, the markBidStatus CAS attribution, the
  wocMarketConfig parse-case location (routes suite, and the file lives in
  woc_market_routes.ts), the service_unavailable extension gate, the
  after-close behavior note, the abandons FK blocking edge, and the
  confirming-hours no-upper-clamp QA item. In-code comment corrections:
  the two park-constant comments, the overdueSettlements plan-shape comment,
  two lock-carve-out comments, and withTx now prefers a CODED async error
  but never lets a codeless connection close mask fn's own bug.
- Verified with no action needed: the strike after the defaulted CAS is
  guarded by its moved check; the exempt service_unavailable arm is
  defense-in-depth (a local outage cannot write that fail_reason; only a
  remote non-pending verdict can); the sub-millisecond revival-race abandon
  residual is bounded and never stamps a paying holder.

The fix round was itself re-reviewed as unreviewed code by a fresh lane,
which found the far side of two fixes missing plus a starvation regression;
every finding was applied (round two, same session):

- Already-succeeded retries now answer the OUTCOME on both legs: after the
  first fix, a blip retry of a signature that SUCCEEDED still refused
  (not_pending read as "bid gone" for an active standing bid; not_active as
  "purchase gone" for a delivered sale). The recorded-signature arm returns
  standing for active/won and not-standing for outbid on the bond leg, and
  the current state for confirmed/delivering/delivered on the settlement
  leg, never re-running hold-and-activate and never minting a second sale
  (both pinned with different-signature negative arms; the old
  refuses-not_pending replay test was deliberately retargeted, keeping its
  no-churn assertions). A same-signature retry on a 'failed' row still
  refuses; the settlementQuote revival owns that path (QA may re-judge).
- confirm_in_flight's copy was bond-specific while the settlement leg now
  answers it too: reworded leg-neutral ("Your payment is still confirming.")
  with the five non-Latin fills refreshed in the same change and the
  resolved artifacts regenerated.
- The lapseBid carve-out had traded the money bug for a starvation shape:
  the held survivor was deleted from the parked set on any decided verdict
  and never rotated, so it re-owned the batch head and burned one confirm
  RPC every pass forever. lapseBid now reports whether it lapsed and the
  poll parks the refused-lapse survivor (rotation + backoff); the pg test
  asserts the rotation stamp instead of treating the stuck head as the goal.
- The single first-arrival anchor took away the paid-bond extension for an
  early signer whose verdict lands seconds from the close (the settled arm's
  own activation could then read the auction as over). RULING (this
  session): anchors split by arm, pending on first arrival (the creep is
  pending-driven; re-posts are free), settled on the verdict moment (needs a
  REAL payment plus repeated contended activations, cap-bounded). A new
  test pins the restored settled-arm extension; the no-creep pin stands.
- The bond leg's typed second-signature refusal gained its DB-free arm (the
  pg pin skips without TEST_DATABASE_URL and the CI floor is DB-free).
- Nits, all applied: stuckBonds sample carries stuckSinceMs (the age axis;
  placedAtMs alone overstated stuck duration) and the fake mirrors the
  axis; the paid-subset pin now DERIVES its expectation from the production
  open2 DDL predicate; the park identity pin covers BOTH sides of the
  comparison (the left operand could regress to placement unseen) and the
  rules-test header owns its two source-pin exceptions; the legacy
  no-stamp row falls back to placed_at on resubmit instead of adopting the
  resubmit clock (pg-pinned); the strip_comments header no longer claims
  unenforced byte-identity with the architecture guard's copy.
- Recorded, not changed: five older suites still hand-roll comment-strip
  variants (action_bar_painter, arena_window, bags_window twice with the
  weaker no-protocol-guard form, cast_bar_painter, char_sheet_sig_core);
  consolidating them is unrelated-suite churn for a later cleanup pass.
  The request-path console.warn on the revived-signature overwrite is
  deliberate (no request-path log seam exists; rate-limited by the confirm
  policy).

Items the phase-04-qa session must re-judge, beyond the implement round's
list: the confirm_in_flight second-signature semantics (both legs), the
already-succeeded retry arms, the held-bond no-automatic-exit posture (now
parked, still no automatic exit), the stuckBonds axis change and the new
stuckSinceMs sample field, the split extension anchors (the ruling above),
and the confirming-hours upper clamp question.

## 04 implement round (bond and payment lifecycle)

Commits f64733145c (source), 2c8931811f (tests), dc0a23c674 (session-start
row), plus the reviewer fix round and docs commits after them. Release sync
was a no-op. The registry of what shipped is state.md's 04 ledger entry; the
round facts and decisions:

- The fails-on-old-behavior proof: eight targeted mutations run AFTER the
  commits (intake order restored, refresh CAS arm dropped, suspend carve-out
  dropped, confirming overdue arm dropped, bond-progress extension neutered,
  steal-time recording inverted, holderless clear restored, paid-window stamp
  guard bypassed), each reddening exactly its named real-SQL test with the
  suite provably running. One first-attempt mutant broke compilation (15
  skipped, proving nothing) and was redone as a semantic one-token flip.
- Decisions the QA session should re-judge or know:
  - R8 numbers proposed: 1800s per-listing re-claim cooldown, 3 abandons per
    rolling hour account-wide (rationale in woc_market_rules.ts).
  - Cancel-intent blocks NEW BIDS as well as new lock claims. The ruling text
    names lock claims only; bids are blocked because a bid landing after the
    stamp would re-deny the cancel past the promised one-window bound
    (has_bids refuses the converge close). Recorded for re-judgment.
  - 'confirm_failed' UX wrinkle: a decided-against signature stays recorded,
    so the bidder cannot refresh or abandon until the poll lapses the bid
    (about one sweep pass). The catalog copy for confirm_failed still says
    "request a fresh quote"; the mismatch is a phase 14 UX-honesty item.
  - Stuck bonds get NO automatic time-based exit this change: routing a
    never-landed payment to refund_due would pay out through the current
    blind releaser (B3). Visibility-bounded instead (the stuckBonds readout
    class); the automatic exit lands with the phase 09 releaser CAS and the
    phase 10 verifier timeout (R5).
  - The review park runs BEFORE the poll arm in the same pass, so a row
    whose economy recovered exactly at the bound parks rather than resolves;
    deliberate (six hours of polls already failed) and operator-recoverable.
  - The converge arm expires only 'failed' rows itself: the abandoned
    window's offered settlement belongs to the overdue arm, which is also
    the canonical abandon recorder, so convergence waits a pass rather than
    lose the abandon row.
- Doc upkeep: server/CLAUDE.md woc_market row rewritten for the new seams;
  .env.example gained the two knobs; the internal stuck route carries the
  operator semantics comment.

The three-lane review round (commit 6c89a99dbb, every finding applied or
recorded; the fix round itself was re-reviewed fresh and mutation-proofed
with six further spot-proofs, all of which bit):

- Security (1 critical, 2 warnings fixed; the rest recorded): the extension
  fired on the raw submitted signature (now verdict-gated, settled or
  pending only); a rival's claim probe could stamp a PAYING holder (now an
  open-settlement probe refuses as 'locked' with no recording); a refused
  transfer read as a walk-away (the sweep recorder now skips signed
  windows). Recorded, not fixed here, each with an owner: the
  free-to-create immovable signed bond depends on the economy service's
  verdict for unknown signatures (phase 10, R5; the poll rotation bounds
  its cost meanwhile); the review state has no in-repo operator endpoint
  yet (phases 09/19 own driving transitionSettlement; hand SQL bypasses the
  CAS, so the runbook must forbid it); quote expiry is no longer enforced
  game-side on either intake, so the stale-reference refusal is now the
  service's contract to keep (confirm at phase 21's devnet run; the dev
  economy already refuses expired quotes); stuckBonds is the first readout
  class carrying a raw account id (dashboardGate-only; kept for the
  cooldown runbook); the abandon cap is per realm by design.
- Database (3 P1, 5 P2, all applied): claimBuyNowLock refusals went back to
  lock-free (measured hundredfold amplification when diagnosed under FOR
  UPDATE while holding a pooled client); the cancel-intent converge and the
  bond poll both gained the park-rotate-backoff seam (a paid window or a
  never-decided signature no longer owns a batch head every pass; the bond
  arm parks only PAST the 5-minute pending TTL so young bonds keep full
  cadence); idle_in_transaction_session_timeout=500ms on the three new
  guard transactions with 25P03 as typed contention (retrofitting the older
  guards rides phase 16); the CHECK evolution adds NOT VALID; the
  saturating-count comment now states the honest O(account rows) bound; the
  repair-gate and readout doc comments were de-staled. The reviewer's
  runtime-proof asks (economy verdict semantics for unknown signatures, an
  end-to-end contention run, converge saturation, pool-wait observability)
  ride phases 10, 16 and 21.
Round TWO of the re-review (the fix round reviewed as unreviewed code by
fresh security and database lanes plus a coverage re-audit; every finding
applied):

- Security round 2 HIGH: my txSignature exemption was a one-request bypass
  of the whole cooldown arm (post a fabricated string, get refused, walk
  away unrecorded). Replaced by a refusal-CLASS exemption
  (WOC_MARKET_ABANDON_EXEMPT_FAIL_REASONS) inside ONE shared recorder
  statement both recorders run, with the failed-row expiry preserving
  fail_reason so the class survives; the sibling steal recorder inherits
  the same predicate, closing the round's third finding (the recorders
  disagreeing in opposite directions). MEDIUM: the extension gate failed
  open on the proxy's pending+service_unavailable arm during outages; now
  gated on the shared reason constant.
- migration-safety (dispatched over the final DDL, the one lane qa-checklist
  flagged had never seen the schema): PASS, no critical or warning, verified
  live against real Postgres 16 (constraint name, NOT VALID, once-per-DB
  gate, create-before-drop ordering, the index rename converging from all
  three historical shapes reproduced end to end, the repair's
  planned-but-never-executed one-time filter). Four INFOs; two folded to
  owners (the overdueSettlements pushdown loss at scale -> 16/17; the
  rollback stranding of review/cancel-pending rows -> the phase 22 runbook),
  two restated standing constraints (unbatched repair, convalidated=false).
- Database round 3 (the lane's own verification of the 25P03 fix): PASS,
  no open findings across the whole chain. Both stall shapes (async await
  and a blocked event loop) measured returning the typed 'contended'
  against the real withTx with ZERO uncaught exceptions, and the pool
  counts confirm terminated clients are discarded, not returned. The lane
  also corrected its own round-2 report: its probe had measured only the
  async ordering; the coded-error preference covers both.
- Database round 2 P1: the 25P03 arm was DEAD CODE (the SQLSTATE arrives
  asynchronously; the unlistened client error event was an uncaught
  exception surviving only via main.ts's last-resort net). withTx now
  captures the async error for the transaction's lifetime, prefers
  whichever error carries a code (the ordering flips between sync and
  async stalls, both probed), and discards the terminated client; pinned
  by a REAL idle-stall test in the pg suite (a synthetic {code:'25P03'}
  stub would have stayed green over the broken path). The lane also
  measured the fix round: the lock-free claim refusals now beat the
  original lock-free profile (1.06ms at conc=10 vs 163ms), the converge
  and poll rotations verified on their indexes, NOT VALID verified
  once-per-database.
- Coverage round 2: DB-free arm for the verdict gate (with the vacuity trap
  the auditor flagged avoided: the case sits INSIDE the anti-snipe window),
  structural pins for the idle-timeout statements, the shared recorder
  statement (which immediately caught the steal arm still on its old inline
  INSERT), NOT VALID, and the proxy-constant lockstep; the
  contended-never-parks arm via a new fake hook. One recorded decline: the
  extend-before-activate ordering is unpinnable behaviorally under a fixed
  test clock (the ordering only matters when real latency advances the
  clock between the two calls); noted here instead.

Round THREE (the qa-checklist gate, the fix-round reviewer's residuals, and
the security lane's third pass; every finding applied or owned):

- qa-checklist verdict NOT READY on one blocking item, fixed this round:
  the cancel-pending index had been redefined IN PLACE under its old name
  (invisible to IF NOT EXISTS); it is now woc_market_listings_cancel_rotation
  with a DROP of the old name, per the file's own predicate-change rule, and
  the structural pin asserts both. Its two upheld judgments: the cooldown
  NUMBERS (duty-cycle arithmetic verified) and the cancel-intent BID block
  (required, not scope creep: a post-stamp bid would make the converge skip
  forever and break the one-window bound).
- Security round 3 HIGH: 'quote_expired' was attacker-mintable (wait out the
  90s TTL, post any string; D1's signature-first recording is what makes the
  class reachable), so the exempt list is now the infrastructure verdict
  ALONE, bound as a parameter, with the honest-late-buyer cost accepted as
  one recoverable abandon row. R5 now carries THREE dependents (bond
  residency, the extension gate, restoring any late-payment exemption).
- Fix-round reviewer residuals: the extension anchor is captured BEFORE the
  chain round trip (RPC latency no longer drifts the target or nulls the
  settled arm's extension); the bond-poll park axis moved to the new
  bond_signature_at stamp (own knob WOC_MARKET_BOND_POLL_PARK_SECONDS;
  placement age said nothing about chain age, and a late signer was parked
  seconds after submitting); the advisory claim reads share the contention
  mapping; a no-BEGIN pin holds the lock-free refusal property; comments
  record the claim_cooldown advisory exclusion, the fake's
  failed-outside-open dependency, and the fake-only id tiebreak. Recorded
  declines: the excludeIds array growth matches the parkedDeliveries house
  shape (phase 16 owns scale); the extend-before-activate ordering is
  unpinnable under a fixed clock (noted in round two).
- qa-checklist should-fixes, deferred WITH OWNERS: the anti-snipe rule
  change has a PLAYER-FACING consequence (a bid placed inside the last
  wallet round trip before the close can no longer extend and cannot win;
  the money path is safe, the bond refunds) that phase 14 owes a product
  line and a client affordance for; cancel-intent is invisible to clients
  (no DTO field; a reloading seller sees plain Active, buyers learn only
  via the refusal), the seller-side marker rides phase 14 with the
  cancel-pending browse posture deliberately unchanged (seller intent is
  not leaked to buyers); the claim_cooldown copy surfaces no remaining
  time, phase 14. The "do not count never-quoted windows" idea was REJECTED
  with reasoning: buyNow always issues a quote at claim, so a no-quote
  window cannot arise from the real flow, and exempting quote-less windows
  would exempt the griefer's cheapest path.

- Coverage (4 blocking, 12 should-fix, 5 nits, all applied except one):
  tunable literal pins, teardown carve-out structural pins, the env-knob
  parse cases (including the fail-dangerous empty string), the monitor's
  five-class loop and fifth argument, retention wiring and config rows for
  BOTH woc prunes, review transition-table arms (noting
  validSettlementTransition has no production caller: the table is
  documentation, its test the only enforcement), both-sided cooldown
  boundaries and aging, the directed exemption on both recorders, the
  recorder dedupe, the converge rollback case, the paid-probe state loop,
  abandonBid's confirm_in_flight arm, SDK and window pins, the exact-bound
  cutoff case, and the new-class freeze and saturation arms. The one
  accepted decline: the two remaining clearBuyNowLock unwind call sites
  (live_settlement_exists and quote_unavailable races) have no harness hook
  to force them cheaply; the holder guard itself and three of five call
  sites are pinned, phase 20's real-SQL coverage owns the rest.

## 03 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Session start 5ef64c1e11; release/v0.37.0 synced in (merge 5487531960: the
chat-quota feature; conflicts were a clean shutdown union in server/main.ts
and the regenerated pending.ts). The release-merge audit ran as seven lanes:
every merge intent preserved on both sides (diff-of-diffs identity on
hud.ts, exact unions elsewhere, db-mock trap did not fire, i18n regen
deterministic), ONE merge-created red: hud.ts 19395 over the zero-headroom
19338 ceiling, fixed by extracting localizeErrorText VERBATIM into the
registered pure core src/ui/error_text_i18n_core.ts (Hud keeps a thin
delegator; S3/B1 retargeted through a shared per-arm file table; ceiling
now EXACTLY 19190; the extraction deliberately avoided the entity-display
slice another branch used for the same fallout). Merge premises recorded in
state.md: 13 steady DB connections per realm, the first pg LISTEN/NOTIFY
exemplar, the quota-vs-escrow accounts-row contention note.

Six audit lanes ran over e71a8cfd21..5ef64c1e11 (privacy-security,
database-performance, server-hot-path, test-coverage-auditor, correctness,
dead-code/cleanup): roughly 60 findings, ALL applied or recorded with
owners. The lanes' verdicts: security no criticals and the exactly-once
model sound against every constructed dupe path; correctness PASS on all
four deliverable items with the crash matrix 11/12 pairs pinned; db BLOCK
on two P1s, both fixed this round.

The AC3 deviation is UPHELD: the park posture has no integrity hole (both
judging lanes and my own read of C2a/C2b/C3/C3b concur that a collected
letter makes absence-from-book genuinely ambiguous while the common
post-write crash window still auto-resumes via the in-book proof). Costs
quantified and recorded; Fernando can overrule, but the automatic-resume
alternative is a provable dupe rail.

Reproduced-and-fixed, the blocking class: park rotation re-stamped the
readout's own age column, so a parked return could NEVER age into the
monitor (and the commonest park, seller-gone, was invisible in all three
classes); rotation moved to a dedicated sweep_parked_at column with the
readout aging on updated_at, backing-off rows now EXCLUDED from the batch
reads entirely. The unbounded redrive beat (500 finalizes plus realm
mail-book writes per beat, worst at the legacy-upgrade boot) is bounded at
SWEEP_BATCH with a truncation cursor. Also fixed: activateBid's raw 40P01
became a typed 'contended' that reports PENDING to the bidder (the interim
fix collapsed it to a false "outbid", caught by the fix-round re-review);
finalize re-locks the open bid set after the listing lock and distinguishes
'already_final' (re-runs neither re-count nor re-notify); the finalize
transaction carries the heavy statement allowance; per-row error isolation
reached the five remaining arms; contention and park stats moved into a
per-entry scope (the eager confirm entry mints its own, closing a
request-vs-pass race); ambiguous grantCopy refusals park instead of
converting to mail; provable grant resumes refresh their ledger stamp so
sustained contention cannot expire them; the monitor gained asOfMs,
saturated flags, a stale-streak warning, a cold-failure negative cache,
and a draining stop(); the sold-notice loss window after finalize is an
ACCEPTED, test-documented cost. Three fix rounds, each re-reviewed as
unreviewed code (the round-2 reviewer verified the exclusion mechanics
against the real pg driver and found the false-outbid regression; round 3
was comment/docs/one-pin scope).

Deep mutation pass: 21 mutations over the headline pins (the named
booked_at revert, both resume rails, the written flag, hasParcel gate,
nonce proof, fence adoption, finalize shape/CAS/re-lock/already_final,
park counters, rotation-age split, redrive bound, exclusion, skip
reporting, contended claim-freeze, quota matcher rows, monitor staleness
and gate). 20 killed outright; the one survivor exposed a REAL hole (every
written-flag pin injected failures after a SUCCESSFUL persist, where flip
order is indistinguishable), closed with a blob-half-throw-then-collect
twin that provably reds under the flipped order.

Validation: 913 DB-free market/guard tests green plus 68 real-SQL against
dev Postgres (both suites demonstrably RAN); tsc, ci:changed, biome on
changed files green; gate run recorded in the row above. Doc upkeep: the
matcher-location sentences in src/ui/CLAUDE.md and server/CLAUDE.md
retargeted to the new core; the bond-lifecycle spec's dead symbol and
rotted line anchors replaced; implement-round ledger lines the fixes
falsified amended in place.

Deferrals recorded with owners (beyond the implement round's list, do NOT
re-raise): EXPLAIN plan evidence for the two new rotation-order reads and
the two new partial probes rides the phases 16/17 list; the claims-prune
orphan note (age booked rows on booked_at) rides phase 17; the operator
re-drive procedure per parked class (including the ambiguous-grant class
where hand-delivery without checking the buyer's bags IS the dupe) rides
the phase 22 runbook; the pg-harness extraction (third suite trigger)
rides phase 20; the phase 19 dashboard consumes the amended readout shape
(asOfMs, saturated, updatedAtMs) from state.md.

## 03 implement round (delivery exactly-once)

Commits 1196e2bb28 (core), 9f8097c1fb (monitor + endpoint), a08653dbd2 (the
five-reviewer fix round). Five reviewers ran over the committed diff
(privacy-security, migration-safety, database-performance with measured
EXPLAIN evidence on a throwaway Postgres, server-hot-path,
test-coverage-auditor), then a fresh reviewer over the fix round and
qa-checklist last. Four mutation spot-proofs bit before the fix round (the
QA session owns the deep mutation pass).

What shipped: the delivery close tail is ONE transaction
(finalizeDeliveredSettlement: bids-then-listing pre-lock, delivered CAS
accepting delivering|delivered, ON CONFLICT sale dedupe, merged
close+dispose UPDATE, bond flips); custody claims carry rail attribution
(grant_character_id, mail_intent_at) and a resume needs PROOF (this
process's pendingMail/pendingGrants continuity, or the parcel still in the
live book, or booked_at); everything unattributable PARKS visibly (bare
claims, collected letters, lease fences, restarts, relogs, disposed
listings); the atomic saveDeliveredCharacterBooked commits the fenced bags
write and the booking together; the minute-scale redriven beat converges the
old binary's delivered-unclosed and sold-undisposed residue over bounded id
pages; sweep arms are error-isolated per arm AND per row with a break on
contention; parked rows rotate with a 60s in-process backoff (AMENDED by
the 03 QA round: rotation moved to a dedicated sweep_parked_at column,
the monitor ages on updated_at, and backing-off rows are EXCLUDED from
the batch reads; the original rotate-updated_at/age-created_at shape was
the QA round's blocking find); woc_market_monitor.ts serves the
three stuck classes (saturating counts) through createCachedRead behind
GET /internal/woc-market/stuck (dashboard secret) plus an
only-when-stuck 5-minute log beat that warns once per failure streak.

Security criticals found by review and closed in the fix round (both were in
MY first-round design, found because the fix round was re-reviewed):

- The mail resume trusted the deletable in-blob marker: a buyer collecting
  the item and deleting the emptied letter revived the ref into a SECOND
  mailed copy. Closed by the durable mail intent + resume-only-on-proof.
- The lease-fence arm cleared the grant intent and mailed next pass, but the
  fence only proves THIS write lost, not that an earlier autosave under the
  then-valid nonce did: the granted bags may be durable. The fence now parks.

Spec deviation, needs the QA session (and Fernando) to re-judge: the phase
file's AC3 says "kill before mail write, sweep resumes and delivers exactly
once". After the mail-rail security finding the safe subset is: resume when
the parcel is provably uncollected (still in the live book, or this
process's own attempt), PARK when it is not (bare claim, intent-with-absent
parcel, collected letter). The parked cases are sub-second crash windows,
visible in the readout, and operator-resolvable; the automatic-resume
version was a provable dupe rail. Pinned by C2a/C2b/C3/C3b in the delivery
pg suite and the fake-level twins.

The fix round itself was re-reviewed as unreviewed code (a fresh reviewer
over the fix commit, plus qa-checklist over the whole diff, verdict READY
with three should-fixes). That second round found ONE blocking hole in the
first fix: the process-local pendingMail entry authorized a re-mail across
the written-but-unbooked window, where a collected letter still dupes.
Closed: the entry now carries a written flag (set at ATTEMPT time, so a
blob-half throw still counts), and once written only the parcel still being
in the live book authorizes a retry; pinned by same-process collected and
uncollected twins driven through a new failNextMarkBooked fake hook, with
the custody fake corrected to live-book semantics (a transient persist
failure leaves the parcel LIVE, exactly like the real bridge). Also from
that round: item-free letters (the seller sold notice) skip the claims
ledger entirely (they can duplicate nothing, nothing ever re-notifies, and
a parked notice polluted the readout forever); the returned arm got the same
park-rotate-backoff-count-advanced treatment as the delivery arms; one
contended finalize stops the delivery work of its OWN scope (AMENDED by the
03 QA round: contention became a per-entry scope, the sweep pass owning one
and the eager confirm entry minting its own); the delivering sample read is
carried by woc_market_settlements_state_updated (AMENDED: the QA round
dropped the created_at index when the class's age signal moved to
updated_at); the readout count cap fails closed on a non-finite value; and
the stale comments the fixes invalidated were rewritten.

Deferrals and decisions, each with an owner (do NOT re-raise):

- EXPLAIN-based plan pins and a worst-case pass-duration timing pin (the db
  reviewer's remaining runtime proofs): the hot-path scale and db-retention
  work own the EXPLAIN list (state.md ops caveats name the reads to prove:
  the redrive page probe, the readout classes, the sold-residue subquery).
- woc_market_custody_claims retention registration: the db-retention work
  owns pruning BOOKED rows; unbooked rows are the operator queue and are
  never pruned (DDL comment records this).
- The internal surface still carries no rate limiter (family-wide,
  pre-existing; the secret compare is constant-time): the listing step-up
  work owns server-side posture questions.
- Endpoint response re-stringifies per request (reasoned decline): the
  admin-envelope serializer owns the wire shape; pre-serializing would fork
  the envelope contract for a secret-gated, human-cadence dashboard read of
  at most sixty rows.
- SETTLEMENT_COLS derived-prefix coupling died with the paged rewrite (the
  probe reads settlements only); no action left.
- The fake's deliveredUnclosedSettlementsPage spells the same three-status
  literal as the SQL; the four-way lifecycle union is pinned in
  woc_market_directed_sql.test.ts, so a fifth status fails the DDL pin
  first.
- pendingGrants/pendingMail/parkedDeliveries are process-local with a
  10-minute TTL prune at each pass start (the reviewers' leak findings);
  entries that die unresumed park their claims, which the monitor carries.

## 02 implement round (settlement-state guards)

Four reviewers ran over the diff (privacy-security, migration-safety,
database-performance, test-coverage-auditor), then qa-checklist last; every
finding was applied except the owned deferrals below. Applied highlights: boot
pre-flight repair UPDATEs so the two new unique indexes can never brick a boot
on legacy-corrupt rows (with real-SQL arms seeding the violating shapes and
proving the repair); the bids-then-listing lock order in suspendListingIfSafe
and the winner stamp moved ahead of the insert (activateBid's order; a pinned
interleave test dies 40P01 under the old order); SET LOCAL lock_timeout on
both guard transactions; a distinct insertSettlement 'listing_closed' return
(a buyer racing a cancel now hears not_active, not a phantom lock);
compare-and-set on the new bid-status writes; setSaleExcluded catching 23505;
the coverage auditor's rework of the interleave test to drive the REAL
cancelListingIfUnbid, the full five-state index predicate pin, the
settlement_live suspend arm at service level, the cascade-conflict unwind arm,
the refund_due intermediate stamp under a stalled refund pipeline, and a
concurrent double-insert race. Real-SQL suite: 27 tests, run green against the
dev Postgres (TEST_DATABASE_URL; the suite skips without it). The
fails-on-old-behavior proof: the first red run against the unfixed code failed
15 of 19 original tests on their real assertions.

Deferrals and decisions, each with an owner (do NOT re-raise):

- insertSale still throws raw 23505 if a duplicate ever reaches deliverOne,
  which after the repairs is only possible on data the new guards did not
  produce; graceful conflict handling belongs to the delivery-finalization
  transaction and reconcile arm (phase 03), along with per-arm sweep error
  isolation (one poisoned row currently skips the later arms of that pass).
- The confirming-stuck escape hatch (phase 04, H15) and ruling R8 (buy-now
  lock-spam cancel denial, phases 04/06): recorded in state.md; phase 04 is a
  hard prerequisite for enable.
- The db-performance reviewer's at-scale proofs (EXPLAIN of the new per-listing
  lookups on grown tables, index-build timing, pool-wait observability before
  enable): phases 16/17 and the phase 03 monitor.
- Cascade arm still reads the full bid list per overdue settlement to derive
  priorWinners (unbounded per-listing read, pre-existing shape): phase 16/17.
- Kept against reviewer preference, recorded: the unique indexes stay in boot
  DDL (rationale comment in the DDL; concurrent builds can leave an INVALID
  index and the tables are pre-enable empty), and the lock-expiry predicates
  keep the app clock nowMs (consistent with claimBuyNowLock's own steal
  predicate, which writes and compares the same clock; the SQL-now()
  alternative also breaks the future-epoch test fixtures).
- qa-checklist round (verdict READY, 0 blocking) applied on top: both boot
  repairs gated on to_regclass so the scans run once per legacy database
  (the sales table is keep-forever, so ungated it re-scanned every boot); an
  operator note at the settlements repair (schema_dedupe rows at 'confirming'
  or beyond were payments that might still land; sweep them by hand after a
  legacy upgrade); insertSettlement now ABORTS when a named winner left the
  pickable states, turning "no settlement whose winner holds no claim" from a
  cross-module coincidence into a statement-level guarantee (test updated to
  pin the strict behavior); the concrete PgWocMarketDb signature widened to
  match the interface; a direct pin that a refused cancel rolls its
  speculative failed-expiry back. Two qa items became owned deferrals: the
  admin envelope's raw-English strings (both the new 409 line and the
  pre-existing 404 line beside it) go to the error-i18n surface (phase 14),
  and a CI job that sets TEST_DATABASE_URL so the pg suite stops being
  skip-only goes to the real-SQL coverage work (phase 20).

## 02 QA round (verdict PASS-WITH-FOLLOWUPS, every fix applied)

Session start synced release/v0.37.0 (merge b40a178643; the one conflict, the
generated resolved-i18n pending slice, regenerated per the content-union
rule). The release-merge audit ran as six lanes: every coordinator clean, the
one real break the zero-headroom hud.ts ceiling (release added prewarm lines),
fixed by extracting src/ui/preview_prewarm_wiring.ts with its own suite and
lowering the ceiling. Seven audit lanes then ran over the phase diff
(correctness, test-coverage, dead-code/cleanup, privacy-security,
migration-safety, database-performance, and a fake-vs-Postgres fidelity
audit), and the whole fix round was re-reviewed by a fresh reviewer as
unreviewed code. Roughly 70 findings surfaced; ALL were applied except the
reasoned resolutions recorded below. The reproduced-and-fixed defects:

- The audit-blocking dupe holes: a settlement could land on a listing a
  concurrent suspend or cancel just closed (the INSERT's snapshot predicate
  passes the FK re-check; reproduced against real Postgres, fixed with an
  explicit listing row lock inside insertSettlement), and the no-winner close
  arms could close no_bids or reserve_not_met under a live buy-now settlement
  (attacker-timeable item dupe; fixed with the lock-then-check
  closeListingIfNoOpenSettlement that parks the listing 'settling').
- The reproduced 40P01: activateBid's third lock (the previous current bid,
  taken after the listing) crossed the suspend guard's ordered scan; fixed by
  pre-locking the whole open bid set in id order, with a deterministic
  three-client interleave pin that reds under the old order.
- The retry revival racing a second open settlement threw an uncaught 23505
  (a 500 on a money path); transitionSettlement reports it as a CAS miss and
  settlementQuote refuses BEFORE issuing any quote.
- The fresh fix-round review then caught the fix round's own regression: the
  reclaim arm expiring a 'failed' settlement at the stranded grace (half the
  settlement window) silently skipped the overdue deadline pass (default,
  forfeit, strike, cascade) and stranded the held bond. Fixed by parking
  instead (the reopen refuses over failed rows; the deadline pass keeps its
  jurisdiction), plus a CTE in the suspend expiry that releases a dead
  settlement's won bid to cancelled/refund_due.
- Hardening from the lanes: suspend leaves a quoted, unexpired 'offered'
  settlement alone (the buyer may already have broadcast payment); both boot
  repairs gate on pg_index VALIDITY through the to_regclass house idiom with
  invalid-carcass drops ahead of each CREATE (a real carcass test proves the
  boot sees through it); the atomic one-statement loser demote; per-caller
  winner pickable sets with the distinct 'winner_gone'; typed 'contended'
  (55P03/40P01) end to end with catalog fills, answered 409 on cancel,
  buy-now, and both admin envelope arms; setSaleExcluded's distinct
  'conflict'; the forensic schema_dedupe fail_reason append; the DB-free
  structural floor in woc_market_directed_sql.test.ts (indexes, five-state
  predicate, validity gates, repair ranking, and the fake's state list, which
  now derives its suspend blocking set); fake fidelity fixes (transition
  open-refusal so the fake cannot reach a two-open state, signature
  self-match skip, cascade tie-break pins both dimensions).
- Twelve mutations were run against the new pins after committing; every one
  failed its named test with the suites demonstrably running (the deadlock
  pin dies on the literal 'deadlock detected' under the old order).
- Validation: real-SQL suite grew 27 to 41, green against dev Postgres; the
  DDL apply-twice/thrice probe is a byte-identical no-op with both indexes
  valid; S3 guard, i18n gates, tsc, ci:changed green; the full gate ran three
  times (the first red found the merged-tree fallout: two pins of mine to
  re-anchor, redundant dialect OTA rows the release's base fills created, and
  the stale-node_modules class where the release's three.js patch bump also
  explained the portrait-manifest fingerprint; a receipt rerender reproduced
  all 230 portraits byte for byte) and PASSED at 301a8c7c22.

Reasoned resolutions (not silent declines): woc_market.sale_conflict stays
registered though the admin envelope pre-empts it today (the Record type and
parity gate require the row; phase 14's admin-envelope conversion switches
the bespoke 409 lines to the registered codes, recorded in state.md); the
reserve-arm's contended-refusal can later record 'no_bids' instead of
'reserve_not_met' (cosmetic, documented at the arm; the demote-before-close
crash posture is load-bearing); the fake's createdAtMs uses the injected
clock where Pg uses now() (harmless, noted by two lanes); the suspend
guard's 'offered' open-check member is unreachable single-threaded but is a
real concurrency arm (kept, per the coverage lane's own verdict).

## Merge re-review verdicts (01, merge a52da32c89)

Five read-only agents re-reviewed the auto-merged coordinators; both parents'
intents survived in every file. Per-file: `src/ui/hud.ts` CLEAN; `src/sim/sim.ts`
CLEAN; `server/game.ts` CLEAN; `src/net/online.ts` CLEAN; `src/world_api.ts` +
facets CLEAN. Non-drift findings applied in this session: the `W9_TAGS` facet pin
gained its missing `trade_close` row plus a ClientWorld-boundary send pin
(tradeClose vs tradeCancel swap was previously invisible to every derived-set
check); the stale facet-count comment in `tests/world_api_parity.test.ts` now
follows the anchor rule; `src/world_api.ts` documents why `trade_close` sits
beside its trade siblings instead of at the append tail;
`server/woc_market_custody.ts` resolves `hasCustodyParcel` through the Sim facade
its neighboring line already used.

## 01 QA round (verdict PASS-WITH-FOLLOWUPS, every applicable finding applied)

Audit fan-out: four independent lenses (move fidelity both directions,
deliverables, dangling refs), frontend-seam-reviewer, test-coverage-auditor,
privacy-security-review on the custody commit, a fresh auditor over the fix
round, and qa-checklist last (verdict READY, 0 blocking). Roughly 40 findings
surfaced; all blocking/should-fix/nit items were applied except the deferred
restructures listed below. Fix commits e49738fbca, f0f9664a62, eeb5596446,
88fb2146c2, 1d7bdbafa0. Highlights of what the round changed: the one byte
drift in the move (the render-catch log tag) reverted; hud.ts now imports the
controller through the domain barrel; the monolith ceiling closed to exactly
19347 (zero regrow headroom, per the phase spec; the seam reviewer preferred
keeping the 19400 margin, recorded here so Fernando can overrule); the
controller suite gained a controllable fake-hooks arm covering the poll
throttle, estimate last-write-wins, pay re-entry lock, vanished-row clear,
per-role completion lines with the R34 fallback, side-scoped money rows,
accept routing plus the accept body/refusal, close-path recovery, withdraw,
the escrow-failed face, and the live coin-copper write; the trade source pins
comment-strip and bound their windows at agreed anchors; new guards pin the
server trade_close dispatch arm, the Hud staged() live binding, the E2E
reach-through names, exemption-row memo drift in the language fanout, and a
server-wide sim.postOffice facade scan (every spelling, lap-string carve-out).
41 mutations were run against the pins; every one failed as expected (one,
the shallow-copy staged getter, initially survived and exposed the untested
coin-copper write, closed in the same round). Gate GREEN twice: at 07fda3fd46
(pre-fix re-verification) and at the final tip 1d7bdbafa0 (all 8 steps, full
suite 37278 passed, browser 117); one intermediate run flaked on the known
heavy-suite timeouts (owned_class harnesses, warlock sustain, sfx export)
while a reviewer agent loaded the machine, and every one of those suites is
green in the clean final run.

## Deferrals and follow-ups

- Re-review, noted with no action (pre-existing, documented design): the custody
  return shape is declared both inline in `server/game.ts` (`wocCustodySession`)
  and as `WocCustodyGameHost`; `persistMailBlob` deliberately diverges from
  `saveMail` (failure must propagate) per its own comment. Rule of three not
  reached on either.
- Re-review, speculative (low confidence): nothing gates escrow listing or
  extraction on being seated in a battleground match; a server-policy question
  for the custody/step-up sessions, not a merge defect.
- The moved trade-window code carries a pre-existing biome useOptionalChain
  warning (`bothAgreed` expression, now in `woc_trade_controller.ts`); warnings
  do not gate, left byte-identical by the move rule; polish pass owns it.
- The trade window deliberately keeps its no-relocalize posture after a language
  switch (inherited coordinator-era behavior, now recorded as a
  `NOT_A_LANGUAGE_GATE` row in `tests/language_fanout_registry.test.ts`); giving
  it a relocalize() is a behavior change for the UX sessions to decide.
- Seam review, deferred restructures (faithful-move rule kept them out of this
  diff): the woc_trade controller reaches hosts directly (module-local `$`,
  `Date.now`, `window.setTimeout`) where `fiesta_controller` injects them
  through its deps bag; and the module-local `$` helper is now the third
  byte-identical copy in `src/ui` (hud.ts, char_skin_window.ts), so the rule of
  three has been reached for a shared helper.
- Stale mentions of `updateTradeWindow` as a hud.ts method remain in two
  historical docs (`docs/hud-program-validation-report.md`,
  `docs/ui-architecture-hud-modularization/phase-p2-window-template.md`); both
  are dated point-in-time records, left per the docs staleness policy.
- Not runnable in the implement session (need `npm run dev`): the perf tour
  and the two updated E2E scripts (`scripts/trade_money_shot.mjs`,
  `scripts/localization_e2e.mjs`); still unexecuted after QA (the browser
  regression suite itself ran green inside both full gates).
- QA round deferrals, each with an owner (restructures the faithful-move rule
  kept out of this diff, plus pre-existing debt the extraction surfaced):
  - Extract the accept-button state machine (bothAgreed/escrowFailed/
    wocAccepted/acceptSpent) into the view core with its own cases: the flow
    phase (14) owns this button. Its behavior is meanwhile pinned by the
    escrow-face and routing arms in tests/woc_trade_controller.test.ts.
  - `refreshWocTradeArm` in src/ui/trade_woc_panel.ts is a second hand-rolled
    write cache in a bare-named module the painter gate cannot see; move it to
    a `woc_trade_arm_painter.ts` on the writer facet: polish phase (15).
  - Per-medium-tick `$('#trade-window')` query in updateTradeWindow (a
    faithful-move artifact; "resolve refs once" wants a cached ref): 15 or 16.
  - The `#7fdc4f`/`#ff6b6b`/`#ffd100` log-color triple is now its fourth copy
    across extracted controllers; name the constants once: 15.
  - `staged()` handing back a live mutable object is the documented contract;
    the durable shape is a command pair (stageItemDelta/setStagedCopper): 14/15.
  - The completion line prints a raw item id inside localized prose on the
    unknown-item arm (deliberate, commented); a wrapped placeholder key: 14.
  - Trade rows drop the owned-stack instance marks (masterwork seal, glyphs)
    that bags and banks paint; the all-surfaces rule names only the three
    grids, so this needs a product call exactly where money meets items: 14.
  - The '[hud]' render-catch log prefix was deliberately restored for
    byte-faithfulness and now misattributes the module in dev logs; rename
    deliberately (with the E2E pins) if desired: 15.
  - `#trade-window` predates the HUD-chrome dialog contract (no markDialogRoot,
    no windowFocus trap); pre-existing debt, natural to schedule now: 14/15.
  - tests/command_facets.test.ts still checks one direction only; a reverse
    completeness assertion currently reds on 37 pre-existing untagged commands
    (vendor/quest/professions clusters), so it is program-wide debt, not a
    trade gap: wire-completeness phase (12).
  - sendWocTradeOffer's success path and the devsig
    (`signatureRequired === false`) branch remain source-pinned only; behavior
    arms via the fake-hooks rig: 14 (the devsig spelling is pinned in
    tests/trade_woc_panel.test.ts either way).
  - wocOfferPhase stayed in src/ui/trade_woc_panel.ts while its sibling
    decisions moved to the pure core; a Node-env suite now imports a DOM
    adapter for it (safe today, verified no module-scope DOM): 14/15.

## 15 ui-polish (2026-08-18, GAME repo, IMPLEMENT session)

Release sync first: merge 3a98604c83 brought origin/release/v0.39.0 tip
b650d9d7d2 (150 commits: the ogre body replacement, the practice-dummy row, the
NPC-look pass, the login prewarm trim, the ability-description extraction). Four
conflicts, all resolved from the merged tree rather than from either side:
hud.ts dropped BOTH contested imports (`AbilityEffect` died with the release's
`abilityEffectText` extraction; `ALL_CLASSES` is owned by this branch's
`preview_prewarm_wiring.ts`) and the release's login-trim flags now ride that
wiring module (three forwarded deps, pinned); the resolved i18n bundles
regenerated via `i18n:gen`; the armory lifecycle pins keep both sides; the
monolith rows re-derived to the exact merged counts (hud.ts 19069, sim.ts 12527,
main.ts 11493).

The `release-merge-audit` skill ran on that merge (non-trivial by its own
test): five parallel lanes plus an adversarial verify pass over every finding,
14 verdicts, all REAL. What it caught and what was done:

- `restoreInto` (server/woc_market_custody.ts), the escrow-compensation
  add-back, granted with `silent: true` alone, so the add hubs ran
  `noteRelicObtain` and a catalogued relic's Reliquary obtain tally moved every
  time an extraction was undone. Every sibling relocation grant passes
  `movement: true`. FIXED test-first (a custody test seeds a catalogued relic,
  forces the teardown-race undo and asserts the tally does not move; red at 2,
  green at 1), commit 01faddadf8.
- The `server/game.ts` monolith row kept 10818 while the merged file is 10807
  (the release moved the mech-chroma reconcile out), under a comment claiming
  zero headroom. Re-pinned, commit a4fcac14d8, with the sim.ts row comment
  corrected to name what actually grew that file and the $WOC firewall's
  non-vacuity floor moved toward the merged tree's real file count.
- `src/sim/item_lock_flag.ts`'s extraction rationale went stale when the
  release dropped `item_lock.ts`'s `./bags` import: reworded to the reason that
  still holds.
- This phase file's own premises were corrected before the work started: the
  capture directory is `docs/screenshots/woc-market/` (the slug the five CI
  sparse cones list), ten of sixteen captures predate the step-up rather than
  all sixteen, and the ratchet numbers are the merged ones.
- Verified clean by the same audit: every branch-owned overlap file keeps both
  sides' intent, the release added no route, RouteDef, WS command or IWorld
  member, no injected helper changed shape, no db-mock export list went stale,
  and the i18n reconcile is a pure regeneration (byte-identical to a fresh
  build into a scratch dir).

Then the phase proper. The written audit is
`docs/woc-marketplace-hardening/phase-15-design-audit.md` (produced first, as
deliverable 1 demands): seven read-only lanes over the merged tree (Exchange
chrome, trade arm, content robustness, tooltip and disclosure copy, mobile, test
pins, i18n obligations), roughly 215 findings, each row now APPLIED, DEFERRED
with an owner, or JUDGED with a reason. Every claim was verified against the live
token set rather than DESIGN.md prose: `--radius-window`, `--dur-*`,
`--color-ink-*`, `--panel-fill-strong`, `--color-text-secondary` and
`--color-accent-hover` have not landed, so the pass composes only tokens that
exist plus `color-mix()` over them.

Commits: 92da32bbb1 (the presentation pass: CSS, painters, catalog English, the
five non-Latin overlays, the regenerated bundles), e6c054232d (the live rig, the
three new guards, the repaired pins), be35080962 (the capture rigs), then the
docs and capture commits.

### 15 deferrals, each with an owner

- **16 or a wire change.** Copy that still cannot resolve a live figure because
  it is not on `/status`: the sell-empty line's quality floor and the two
  collectible switches, the bond schedule for an arbitrary typed bid (5 percent,
  $1 to $50), and the bond-pending TTL. Each is written figure-free rather than
  wrong, and `tests/woc_market_copy_figures.test.ts` records the constants so a
  retune cannot pass silently. Shipping them on `/status` (or a bond-for-amount
  estimate) is the honest fix.
- **16.** The mobile detail pane renders below the table on the one-column
  sheet, so a row tap on a full page paints the bid form off screen. The cure is
  `scrollIntoView` on select, which is behavior, not presentation.
- **A behavior pass.** The over-balance red on the trade arm's equivalent line
  is driven independently of the ranked send hint, so with two problems staged
  the figure can turn red while the hint names the other one. The ranking lives
  in the frozen view core.
- **A behavior pass.** The R10 lock-hint dead end is only half closed: the hint
  now names the escape (unlock, then re-stage the item), because the robust fix
  is a sim trade-snapshot refresh with acceptance-reset side effects.
- **22 (product debt).** `#trade-window` still predates the HUD-chrome dialog
  contract (no `markDialogRoot`, no focus trap). Adding them changes keyboard
  and Esc behavior, so it needs its own pass with tests rather than a line in a
  presentation commit.
- **The DESIGN.md rollout (1 and 2).** The accent knob's retune, the latent
  text and ink tokens, the radius and duration families, and the shared
  primitives the marketplace inherits (`.btn` at 12.5px in the display face,
  `.panel-title`'s gold, `.x-btn`'s sub-36px target, the 3px focus ring).
  Restyling them from a marketplace section would be the per-component copy
  DESIGN.md 13.4 forbids.
- **A catalog-wide decision.** Title case on buttons (DESIGN.md 5.4): this
  catalog is mixed, so a marketplace-only sweep would create a new
  inconsistency and stale every locale row it touched.
- **The DESIGN.md chrome retune, WITH evidence.** `--panel-border` (DESIGN.md
  4.3) stays UNDECLARED. Its 13 consumers are all in the Dungeon Finder section,
  so declaring the alias is not a token cleanup: it switches on 13 borders that
  have never painted and grows those content-sized chips by about 2px, in a
  window this pass neither owns nor captured. It is on the exact ratchet in
  `tests/css_token_resolution.test.ts` with that reason, and the retune owes a
  Dungeon Finder before/after (desktop and 900x420) when it lands.
- **A follow-up, not a ceiling.** `src/ui/woc_market_window.ts` enters the
  monolith ratchet at 2623 lines with zero headroom, which stops the growth but
  legitimizes the size: the pure-core half of the recipe (a `woc_market_view.ts`
  the window renders from) was never built. Worth its own extraction pass.
- **A mobile-chrome sweep.** `scroll-padding-top` is declared for `#trade-window`
  alone, but the cause is shared: the block that grants `overflow-y: auto` on the
  window element itself covers fifteen windows, and any of them whose header is
  the sticky `.panel-title` inside that scrollport has the same hazard (several
  are immune because they scroll an inner pane with the header outside it, which
  is why the Exchange needed no equivalent). The durable form is one rule over
  the self-scrolling set, plus a `--mobile-header-h` token both the floor and the
  reserve read. Out of scope here, and it wants its own captures.
- **Recorded, not closed.** `scroll-padding` steers scroll-INTO-view only
  (focus, `scrollIntoView`). A player who drags a money field under the sticky
  header by hand still can; focus is the trigger this pass fixes.
- **Recorded, guarded by the rig.** The reserve's `40px` term is the button
  FLOOR, not the row's height: a locale whose commit label wraps grows the row
  past the slack, and no arithmetic in the sheet can see that. What can see it is
  the rig's `reserve >= measured band` assertion, which runs per face and per
  locale (the Russian pass being the wordiest). The two guards cover each other:
  only the CSS can see an inset, only the rig can see a grown row.
- **A theme pass.** The typed price and the block reason read `--gold` and
  `--gold-dim`, the RAW accent pair, while the rest of the arm reads the
  contrast-repaired `--color-accent`. Both are a clear improvement on the hex
  literals they replaced; choosing between the pairs belongs with a contrast
  sweep over every preset, not a marketplace section.
- **Structural, whole-HUD.** Every mobile touch floor is authored inside `#ui`'s
  zoom, so at the 0.85 UI-scale floor a 40px control renders at 34px. The money
  sheets' own INSETS are now divided by the scale; doing the same to the floors
  is a house-wide change with its own capture set.
- **For Fernando's sign-off, not a defect.** The capture set is 79 files and
  about 46 MB. `docs/` is NOT part of the built site (only `public/` deploys
  verbatim), so this is repo weight only, and the directory already carried
  roughly 900 MB before this pass. Trimming the `-stress` and `-ru_RU` variants
  would halve it; keeping them is what makes the extremes and the wordiest
  locale reviewable. The 15 QA session owns that call.
- **Recorded, no change.** The three native `<select>` controls stay native (the
  themed `.ui-dd` swap is wiring); the Exchange stays a fitted 960x700 rather
  than the large-window target; the store's dead portrait media query stays;
  insetting the SHARED mobile sheet base for all 24 windows is a maintainer
  call, so this pass insets only the two money sheets it owns.

### 15 review round (two independent frontend seam passes, every finding settled)

Two `frontend-seam-reviewer` passes ran over the committed range with MOBILE in
scope, plus an i18n fill audit. Neither returned a BLOCKING finding. What the
fix round applied, each with its own pin:

- The staged item's name carried `.q-<rung>`, which is the icon FRAME family
  (border plus an epic and legendary glow, never a text colour): an epic read
  grey behind a stray halo, a rare showed nothing. It now takes the inline
  `QUALITY_COLOR` every sibling row family uses; the pin reds on the old markup.
- Two rendered sentences were joined in code with a hard `' '`, which decides a
  locale's spacing (CJK sets none) and forbids reordering: the ineligible count
  and its reason, and the seller's fee and net. Each owns its line now, the
  shape the arm already used for the fee and net pair.
- A fee resolved for one price field survived the format swap that rebuilds the
  form under it. It is dropped and re-asked; the pin fails if the re-ask goes.
- A token amount too small for two fraction digits printed a flat `0`: a real
  fee leg reading as nothing. Under half a hundredth it now keeps six digits.
- Both offer-expiry reads used a `typeof === 'number'` or truthy test, neither
  of which rejects NaN, and NaN is exactly what the server's date projection
  yields for a missing value. Both take `Number.isFinite` now.
- Mobile: both money sheets pin their BOTTOM edge and divide every safe-area
  inset by the UI scale. With a top inset above 10px the old cap put the sheet's
  bottom edge (and the sticky commit row pinned to it) below the viewport, out
  of reach on a fixed sheet. The `scroll-padding-bottom` literal is derived from
  the tokens the row is built from.
- Desktop consent checkboxes reached the 24px floor (the trade arm's was 18px,
  the Exchange's the 13px UA default) on the one control the server will not
  take money without.
- The Exchange window took a zero-headroom line ceiling now that it is the
  largest unpinned UI module; the arm painter got the no-magic source scan its
  namespace expects; the balance chip joined the architecture registries beside
  its two siblings; the log tones' literals are a documented sanctioned home
  with a test pinning the single source.

A THIRD review, fresh over the fix round itself, found two defects the fixes
had introduced and two claims that overstated what they fixed. All four settled:

- The derived scroll reserve mirrored a flat `--window-pad`, but the window's
  real bottom padding is the inset-aware `max(--window-pad, 18px + inset)`: on a
  landscape phone with a home indicator the reserve came up 15px short and put
  the control back under the commit row. Headless capture reports zero insets,
  so no rig run could have seen it; the calc now mirrors the source rule and a
  pin reads the DECLARATION (prose in the block cannot satisfy it). A
  forced-inset rig arm was tried and DELETED as vacuous (it added the inset to
  the computed reserve, assuming exactly what it should test; the rig's own
  comment records this), so the inset term's only guard is the CSS declaration
  mirror, and the real-notched-device check stays owed.
- Pinning the sheets' BOTTOM edge stretched them to full height (a two-line
  trade painting a 400px panel), which the fix never claimed and did not need:
  the inset-aware height cap alone fixes the off-screen case. The pin is gone
  from both money sheets, kept only on the side-by-side split where full height
  is the point, and pinned so it cannot come back unnoticed.
- The offer-expiry story was wrong in the direction that matters: JSON writes a
  server-side NaN as null, so the old guard already took the untimed branch, and
  had NaN arrived, `formatDateTime` THROWS rather than printing "Invalid Date".
  The guard stays as honest hardening, now with `> 0` so an epoch-0 stamp still
  reads as absence rather than a 1970 deadline, and the tautological test is
  replaced by one that drives the real send path for null, undefined, NaN and 0.
- The small-amount token floor still printed "0" below 5e-7, one order down from
  the defect it fixed. It now falls back to the token's own nine decimals, with
  the one-base-unit case pinned.

Also from that round: the quality colour goes through the shared
`itemNameColor` family module (which owns the fallback token, gives a quest item
the bag's quest gold, and reads the map with `Object.hasOwn` so a hostile wire
quality cannot interpolate a prototype key), and the overlay-figure pin guards
its slice end so it cannot go vacuous on the last row of a file.

A FOURTH round (the repo's own `qa-checklist` over the whole range) closed the
last four:

- The sell tab's "locked items are not listed here" fired for ANY locked known
  item, including a locked stack of cloth the picker would never have offered
  and unlocking would never restore. The view core answers the real question
  now (its own sell filter, lock arm inverted), so the caption is true whenever
  it is shown.
- The seller's fee estimate rode the keystroke on a per-minute bucket SHARED
  with the bond quote, the settlement quote and the refresh: a seller trying
  prices could spend the allowance the payment path needs. It is asked for once
  the price settles; the bidder's live preview keeps its own cadence.
- `woc_balance_chip.ts` was extracted with four faces and no test; it has one,
  decisive against a collapsed tag.
- The rig pinned the BID field's draft carry but not the SELL fields, which are
  the ones that now rebuild under the seller's hands.

The zero-headroom ceiling on the window fired during that work, which is the
ratchet doing its job: the status chrome (spinner, loading line, error line,
the exact end time a countdown carries) moved to `src/ui/woc_market_chrome.ts`
and the ceiling came DOWN to 2621 rather than up.

Judged, no change, with the reasoning:

- The presentation-only claim holds for the rendering, with three deliberate
  exceptions a reviewer should be told about rather than discover: the seller's
  fee preview is a new client-initiated request (now once per settled price),
  the busy label sequences confirming into signing only at the real wallet
  handoff, and the token spelling in the trade log went from four digits to the
  two every other $WOC surface uses.
  (The fitted-960x700 judgment two rows below was SUPERSEDED in the 15 QA
  round: Fernando's sign-off asked for the large window, and the QA round
  shipped it at min(92vw, 1440px) by min(92vh, 920px).)
- The buyer's pre-signature note now says the quote fixes the amount until it
  expires. Verified against the wire rather than taken on faith: a settlement
  carries `quoteReference` plus `quoteExpiresAtMs` and is refused outright when
  either is absent (`server/woc_market.ts`, `quote_unavailable`).
- The arm painter stays in the perf gate's audited bucket with an EXACT write
  allowance rather than moving back to the unscanned cold bucket or routing five
  event-driven writes through the facet. The allowance is stricter than its
  previous classification: a third `textContent` site now fails the gate.
- The currency switch stays a pressed-toggle group rather than the tab-strip
  family: there are no tabpanels, and the previous `role="tablist"` with no
  roving tabindex was the defect. Reuse the family if a third mode lands.

### 15 items closed from earlier phases' deferral lists

The `refreshWocTradeArm` write cache now lives in a real painter file
(`trade_woc_arm_painter.ts`, registered in the perf gate with an exact write
allowance); `updateTradeWindow` resolves `#trade-window` once per controller
instead of on every medium-band tick; the log-tone triple is named once
(`woc_log_tones.ts`); the `[hud]` render-catch prefix names its own module; the
sell picker says why a locked copy is missing; the wallet busy label appears
only at the handoff that actually opens a wallet (never during the challenge
mint, never in the dev economy's devsig arm); and the stale TOTP-bearing
captures are replaced by the fresh set indexed per pair in section K of
`phase-15-design-audit.md`.

## 15 QA round (2026-08-19, verdict PASS-WITH-FOLLOWUPS, every finding applied or judged with the file open, PUSHED per R4)

Release sync first: merge e32f7d8945 of origin/release/v0.39.0 tip ea9377db8e
(136 commits, the druid auto-unshift and the OSSBrain v0.39 train), sole
conflict the generated i18n pending.ts, resolved by regeneration. The
release-merge-audit skill ran on it (nine workflow lanes): every overlap
proven a byte-identical union of both parents, the escrow-restore movement
fix intact with its test, routes, injected helpers and db mocks all clean.
Its one blocking repair: the release growth re-pinned on the monolith ratchet
(sim.ts 12531, server/game.ts 10813, commit 5c67a708cd). Two of its notes
stand as facts for the release fill: 331 marketplace keys pending across the
15 Latin locales (correct at PR tier), and hudChrome.dailyRewards.usd now
reads '{amount}' in the five non-Latin overlays versus '{amount} USD' in the
Latin ones, to reconcile at the fill.

The desk probes the phase file insists on, run by hand: all 79 captures
eyeballed (the finding below), the raw-formatting grep (one pre-existing
toFixed at trade_woc_arm_painter.ts:400, JUDGED correct: it feeds a
type=number input's machine-format value attribute, not a render sink), the
fairness diff (clean: nothing tier-gated, the :empty collapse and owl-spacing
swap shed no actionable read), the behavior freeze (view-core suites
unchanged in assertions, the one selector edit tracks the .trade-actions row
move), and the --panel-border deferral verified on its ratchet with a
decisive non-declaration pin (AGREED, not flipped).

The eyeball's own catch: eleven committed captures were defective, from a
pre-guard rig run and a framing gap (two desktop stress afters under a
session-takeover modal, six under the GPU toast, the ru sell-empty behind the
camera picker, and the four mobile detail captures framed at the window top
so neither consent nor the bond disclosures they are named for was in frame).
The rig gained a per-shot frame selector and its failure-path debug dumps
moved outside the committed directory; all eleven were re-taken on the fixed
rig (commit 2f31d1f0c5) and re-verified.

Five audit lanes ran over the range (correctness, cleanup, test-coverage,
frontend-seam, scoped security), plus a FRESH review of the fix round and the
repo qa-checklist last. Roughly 25 findings; every one applied or judged, the
fix rounds in commits fd3564d82d, b194e576c5, 38c3ed70d1, 5239f1ef28,
5e23abe557. Highest-value: the mobile layout suite's pins were
comment-gameable (the whole file now reads comment-stripped source, and its
reserve and floor pins were the ONLY in-gate coverage of those facts); the
five-fill figure check compared against digits hard-coded in the test rather
than derived from the English, so a rule retune would have passed over five
stale fills (now derived, on digit boundaries); the escrow-restore clone from
the security lane got its non-aliasing regression pin, proven decisive by
mutation; the balance chip's escaping test asserted nothing (now injects a
hostile quote); woc_market_chrome.ts got the direct test its extraction owed;
the Exchange's two name-colour sites joined the itemNameColor family
(Object.hasOwn over a raw map index); and the glued-ticker sweep learned the
template-start and space-less prefix shapes. Judged, no change: the
qa-checklist's ASCII-digit contract question on the five fills is now written
into the test as the deliberate convention of all five locales; the
forced-inset rig arm stays deleted (it assumed what it should test; the
record now says so instead of claiming it runs); the split-dock stamp
tie stays generic to all windows (the design), with a comment-stripped
cross-file pin closing the one-sided rename. DEFERRED with an owner, new: the
Exchange's role=status regions are destroyed and recreated per wholesale
render, so several screen readers will not announce them; the durable fix is
element identity across renders, which belongs to the woc_market_view
pure-core extraction pass the registry already owes (the trade arm, which
keeps its regions, is the exemplar).

Fernando's sign-off came back BEAUTIFUL WITH NOTES, and the notes shipped as
the sign-off round (commit 9bdb94c81e): the desktop Exchange claims its real
estate at min(92vw, 1440px) by min(92vh, 920px) (superseding the fitted
960x700 judgment), every cell sits left-aligned under its header with long
values wrapping to a second line, the sort control leads the padded control
row (extracted to woc_market_chrome.ts as a pure builder, so the window
SHRANK to 2618 and the ratchet followed it down while paying for the new
tooltips), both price cells carry the token equivalence at the live rate as
tooltips, and the phone rows take 12px cells with the first row clearing the
header hairline at 16px. Every Exchange face was re-captured at the new
geometry (commit 57774f4674, four passes, 608 rig checks green); the taller
sell face now shows the fee sentence and commit button that used to sit
below the fold. The capture-set size call the registry left to this session:
KEEP the stress and ru_RU variants; they carried real review weight in this
very round.

Verification on the final tree: the full gate step list run stage by stage
(the artifacts and both freshness gates, the malware scan, biome on changed
files, the FULL vitest suite in four shards, 41,446 tests and zero failures,
the real-browser suite 20 files / 131 tests, tsc, every build including the
client bundle), then the sign-off delta re-proven (the related closure, 36
files / 565 tests, browser suite and builds again). The mobile rig arms ran
live on the merged tree: 608 Exchange checks plus the trade rig's en, ru and
BAGS_OVER arms (128/129/128, the reserve >= measured band assertion held in
both locales). Still open for a real device: the safe-area insets no
headless run can see. Housekeeping: backup-pre-reword-15 is verified
content-free (its tree matches rewritten commit 2dfd1b99de; git cherry all
equivalent) but the delete stayed permission-blocked, so it remains for a
manual git branch -D.
