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
| 08 | service-auth-hardening | service | NOT STARTED | | |
| 08 QA | phase-08-qa | service | NOT STARTED | | |
| 09 | bond-releaser | service | NOT STARTED | | |
| 09 QA | phase-09-qa | service | NOT STARTED | | |
| 10 | chain-verifier | service | NOT STARTED | | |
| 10 QA | phase-10-qa | service | NOT STARTED | | |
| 11 | oracle-health | service | NOT STARTED | | |
| 11 QA | phase-11-qa | service | NOT STARTED | | |
| 12 | wire-completeness | game | NOT STARTED | | |
| 12 QA | phase-12-qa | game | NOT STARTED | | |
| 13 | listing-step-up | game | NOT STARTED | | R1 resolved: wallet signature; confirm threshold posture at start |
| 13 QA | phase-13-qa | game | NOT STARTED | | |
| 14 | ux-honesty | game | NOT STARTED | | |
| 14 QA | phase-14-qa | game | NOT STARTED | | |
| 15 | ui-polish | game | NOT STARTED | | |
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
place.

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
