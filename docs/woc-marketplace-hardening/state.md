# State: cross-session cheat sheet

Updated by every session. Keep this file SHORT and current; it is what the next session
actually reads.

## Where we are

- Next file to run: `docs/woc-marketplace-hardening/phase-01-branch-baseline.md`
- Packet created 2026-08-11 from `review.md` (the 2026-08-11 three-repo review).
- Nothing implemented yet. All 22 phases NOT STARTED (see progress.md).

## Repos and branches

| Repo | Worktree | Branch | Tip at packet creation |
|---|---|---|---|
| game | `/Users/fernando/Documents/wocc-marketplace` | `feature/woc-marketplace` | `a52da32c89` (merge of release/v0.37.0, current) |
| service | `/Users/fernando/Documents/woc-rewards-service-pr31` | `integration/woc-market-settlement` | `70d4207` (= PR #31 tip) |
| dashboard | `/Users/fernando/Documents/woc-rewards-dashboard-pr13` | `integration/woc-market-trading` | `c001d4a` (= PR #13 tip) |

Pushes: game pushes fast-forward `origin/feature/woc-marketplace`; service pushes go to
`origin/feature/woc-market-settlement` (updates PR #31); dashboard pushes go to
`origin/feature/woc-market-trading-controls` (updates PR #13). ALL pushes need Fernando's
explicit approval (open ruling R4).

## Validation matrix

- Game, any code change: `npx tsc --noEmit` + the targeted `npx vitest run <files>` +
  `npm run ci:changed`.
- Game, `src/sim/` change: add `npx vitest run tests/architecture.test.ts`.
- Game, player-text or emit change: add `npx vitest run tests/localization_fixes.test.ts`
  (S3 guard; needs `npm run i18n:gen` first if i18n.status.json is missing; it is
  untracked and worktree-local).
- Game, wire/protocol change: add `npx vitest run tests/snapshots.test.ts tests/env_protocol.test.ts tests/bandwidth.test.ts`.
- Game, DDL change: boot the dev DB (`npm run db:up`) and run the marketplace real-SQL
  suites.
- Game, monolith-listed file: `npx vitest run tests/monolith_budget.test.ts`.
- Game, pre-merge / end of phase: commit first, then `node scripts/gate_select.mjs`
  (gate needs a committed tree; it stops at the FIRST failure, run later steps by hand if
  a known red is being carried).
- Service (in `service/`): `npm run build` then `npm test`.
- Dashboard: `npm test`, `npm run check`, `npm run build`.

## Open rulings for Fernando (queue; a phase that hits one asks at session start)

- R1 (phase 13, B6): step-up posture for custody-moving ops (`createListing`,
  `acceptDirectedOffer`). Recommendation: wallet-signature step-up above a USD threshold
  (challenge signed by the linked wallet; no new secret infrastructure), and delete the
  phantom TOTP scaffolding. Alternatives: implement real TOTP, or formally accept the
  stolen-bearer vector and delete the scaffolding.
- R2 (phase 09): forfeited-bond destination. PRD says treasury + burn split; code sends
  100% to treasury. Recommendation: follow the PRD split unless Fernando rules otherwise.
- R3 (phase 11, H3): oracle venue posture. The PRD requires a cross-venue deviation gate
  but Pyth has no $WOC feed. Options: add a second real venue, or revise the claim to
  single-venue with tightened staleness/deviation bounds. Needs a product call.
- R4 (all phases): push cadence. Default until ruled: commits stay local; each session
  asks before any push.
- R5 (phases 09/10/21): the five chain-wiring operational decisions the review lists as
  open: SOL fee funding and monitor, ATA-rent-on-refund policy, verifier commitment level
  and confirming timeout, devnet mint choice, forfeited-bond destination (= R2). Phases
  propose defaults; Fernando confirms.
- R6 (phase 07, B7): counsel owns final Terms language. The phase produces drafts and a
  decision memo; counsel sign-off is a launch gate tracked here, not a packet deliverable.

## Locked decisions

- Base: `feature/woc-marketplace`, already merged up to release/v0.37.0. Every game phase
  re-syncs the latest `release/**` at phase start; service/dashboard phases re-sync
  `origin/master`.
- Packet docs live in the game repo only; service and dashboard phases are specified here
  and executed in their own worktrees.
- The custody/settlement lifecycle fixes land as focused phases 02 to 06 (the review's
  "one change" recommendation, split along test seams to keep sessions small; QA between
  each keeps the shared root cause honest).
- i18n: English-only via the sanctioned pending mechanism during the packet; release
  fills are maintainer release work. The 3,255 pending Latin fills the review counted are
  NOT packet debt.
- UI bar: DESIGN.md is the design-language standard; the marketplace surface must meet it
  (phase 15 is the dedicated pass).

## Known gotchas carried from the review session

- The two pin tests hit the merge trap: totals were set from a suite run (send 198,
  dispatch 211, IWorld 321, method 236, data 85). If a later release merge conflicts
  there again, re-derive from a suite run, never take either side's number.
- `npm run i18n:build` does NOT run `i18n:scan`; the S3 guard needs `i18n.status.json`
  present (full `npm run i18n:gen` creates it). Bit the review session at push time.
- `hud.ts` is monolith-RED (20005 > 19600) until phase 01 extracts the p2p controller.
  Until then `node scripts/gate_select.mjs` carries that known red; run the steps behind
  it by hand.
- The marketplace test set on the game branch was 866 passing at packet creation; the
  full suites: game 1524, service 413, dashboard 131.
- Dashboard `npm audit`: 11 vulnerabilities at review time (phase 19 owns it).

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

(none yet)
