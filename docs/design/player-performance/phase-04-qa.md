# Phase 04 QA: dedicated kick reason with matcher lockstep

Phase spec: packet-3-input-cadence.md, "Phase 04" (ruling R10 binding; R3, R6,
R12 honored unchanged).
Status: COMPLETE. All acceptance checks below passed on 2026-07-24.

Base check (R1): at execution time origin/release/v0.30.0 still tips at
802f2fc78 (this branch's base), no newer release branch exists, and packet 0
(cf3412e66) is NOT merged anywhere on origin, so no release merge and no
release-merge-audit run were needed.

## What changed

- `server/msg_rate_limit.ts`: `MSG_RATE_KICK_REASON` = `'message rate
  exceeded'` exported beside the limiter constants (lowercase byte-exact
  wire-contract style per the server/ws_auth.ts table comments), with the R10
  comment: what both limiter kick arms send, the client-matcher lockstep and
  its source pin, session-fatal semantics, and why the anti-bot kick keeps
  the vaguer literal.
- `server/game.ts` (thin consumer edits only, R12): the import plus the two
  literal/label swaps. BOTH limiter kick arms, the pre-parse gate arm in
  `handleMessage` and the post-parse lane arm in `consumeLane`, now pass
  `MSG_RATE_KICK_REASON` with the distinct `'message flood'` leaveReason
  label (a dead parameter `leave` discards; grep-ability only, zero
  behavior). The anti-bot kick site in `runAntibotTick` is byte-untouched
  (`'rejected by server'` / `'disconnected'`), as are all four moderation
  kick sites. Control flow is otherwise byte-identical.
- `src/ui/api_error_i18n.ts`: a dedicated normalized-literal arm in
  `userFacingApiError` mapping `'message rate exceeded'` to
  `t('loading.messageRateExceeded')`, placed with the other WebSocket
  disconnect reasons. No `reconnect_policy.ts` change: the literal matches
  neither transient helper, so the error frame stays session-fatal
  (`endSession` plus `onDisconnect`) and an immediately reconnecting flooder
  cannot re-flood through an auto-retry loop.
- `src/ui/i18n.catalog/shell.ts`: `loading.messageRateExceeded` with
  actionable English copy ("You were disconnected for sending actions too
  quickly. Please wait a moment and log back in."), beside the connection
  family. The five M16 non-Latin fills (zh_CN, zh_TW, ja_JP, ko_KR, ru_RU)
  land in their `src/ui/i18n.locales/` overlays in the same change, each
  placed beside `loading.tooManyConnections` and matching the family's
  terminology; no other overlay touched, no existing English value reworded
  anywhere (the reword-staleness trap).
- Regenerated artifacts staged in the SAME commit: `npm run i18n:gen`
  rewrote `translation_keys.generated.ts`, every
  `src/ui/i18n.resolved.generated/` slice (the five fills resolved, the
  Latin locales on English fallback), and `pending.ts` (the key correctly
  pending for the 15 unfilled locales and absent for the five filled ones).
  DEVIATION FROM THE SPEC TEXT, recorded: the phase spec says "the
  resolved-bundle re-baseline" but the aggregate sha256 baseline was RETIRED
  on this base (it is gitignored, and
  `tests/i18n_resolved_equivalence.test.ts` pins it staying untracked); the
  freshness contract is now the committed line-item slices themselves, whose
  `git diff --exit-code` check needs the regenerated artifacts STAGED, which
  this commit satisfies.
- `src/net/CLAUDE.md`: the byte-identical disconnect-literals note gains the
  new literal, its constant home, its key, the session-fatal rationale, and
  the source pin.
- `tests/main_api_error.test.ts`: new arm "re-localizes the flood-kick
  reason and keeps it session-fatal": `userFacingApiError` of the literal
  equals the t() key, differs from `loading.connectionRejected`, and both
  transient-rejection helpers return false for it with a mid-reconnect
  attempt count and a fresh counter.
- `tests/localization_fixes.test.ts`: new R3 source-scan guard (the R1/R2
  style) binding the lockstep byte-exact: the `MSG_RATE_KICK_REASON` export
  extracted from limiter source and pinned to the disagreeing literal
  `'message rate exceeded'`; exactly two `kickSession(session,
  MSG_RATE_KICK_REASON, 'message flood')` arms in game.ts; the anti-bot
  literal pair still present verbatim; and the matcher arm's extracted
  literal byte-equal to the server export. Block and full-line comments are
  stripped before matching so a commented-out arm cannot satisfy a pin.
- `tests/game_sessions.test.ts`: new pin "a flood kick sends the dedicated
  message rate exceeded frame at the limiter site": five abusive
  receive-time seconds of lane-exempt telemetry frames (fake Date clock)
  drive `handleMessage` to the gate kick verdict; asserts the exact
  `{ t: 'error', error: 'message rate exceeded' }` frame bytes, that the
  anti-bot literal was NOT sent, and the closed-socket teardown. The
  existing anti-bot frame pin is byte-unedited and stays green, which IS the
  R10 distinctness proof on that side.
- Lockstep pin updates (the phase 02/03 pins working as intended): the two
  lane-kick frame pins in `tests/msg_lanes.test.ts` and the gate-kick frame
  pin in `tests/game_state_metrics.test.ts` move to the new literal.

## Design decisions recorded

- Key home and name: the game catalog per R10's ruling (a server_i18n DICT
  row would demand every locale at once under H3; the catalog needs exactly
  the five M16 fills). `loading.messageRateExceeded` mirrors the wire
  literal, and the copy follows the family's "Please ..." actionable shape.
- The R3 guard anchors one end to the disagreeing literal `'message rate
  exceeded'`: a reword of either side alone reddens the cross-file equality,
  and a deliberate coordinated reword still surfaces as a wire-contract
  change that must update the pin, the matcher arm, and the frame pins
  together (the ws_auth byte-exact model).
- The guard also pins the `'message flood'` label: deliberate over-reach
  beyond the wire contract, because the label is R10's own diff-shape
  requirement and including it keeps the two-arm count selective against the
  other kickSession call sites.
- The game_sessions pin floods with lane-EXEMPT telemetry frames so every
  drop is the pre-parse gate's and the kick provably fires at the
  handleMessage limiter site, not through consumeLane; the two updated
  msg_lanes pins cover the consumeLane site for both a movement and a
  command flood.
- The new game_sessions test manages its own fake Date clock in a
  try/finally and omits `server.stop()`, matching all sibling tests in that
  file.

## Acceptance evidence

1. `npx vitest run tests/localization_fixes.test.ts
   tests/main_api_error.test.ts tests/msg_lanes.test.ts
   tests/game_state_metrics.test.ts tests/game_sessions.test.ts`: 5 files,
   156 passed, 3 skipped (the release-tier `it.runIf` arms, expected at PR
   tier). Neighbor regression: `tests/msg_rate_limit.test.ts`,
   `tests/server/tunables.test.ts`, `tests/command_schema.test.ts`,
   `tests/server/http/game_metrics.test.ts`,
   `tests/i18n_completeness.test.ts` (the M16 gate covering the five fills),
   and `tests/i18n_resolved_equivalence.test.ts` all green. The freshness
   suite reads the INDEX, so it is green only once the regenerated artifacts
   are staged; verified in the staged state this commit captures.
2. Mutation checks, both reverted after: (a) the phase's mandated probe: the
   server literal reworded alone (`'message rate limit exceeded'`); the R3
   guard failed AND the game_sessions frame pin failed, proving the
   source-scan guard and the runtime pin each decisive. (b) the matcher arm
   wrapped in a block comment; exactly the R3 guard failed, proving the
   strengthened comment-stripper closes the block-comment false-pass the
   coverage audit flagged.
3. `npm run i18n:gen` is idempotent on the final tree (byte-identical git
   status before and after).
4. `npx tsc --noEmit`: clean.
5. `npm run ci:changed`: exit 0. `npx @biomejs/biome ci` over the touched
   hand-authored files: 0 errors after the one-line wrap below (the
   remaining warnings and infos are pre-existing on untouched lines).
6. Hygiene scans: no em or en dashes, no emojis, no `.only(`, no `debugger`
   in any added line; no parens in the new test titles; the ru overlay
   neither gains nor strips punctuation beyond its own new row.
7. Reviewer fan-out (fresh subagents, coverage mode): test-coverage-auditor
   over the pins and a spec-conformance reviewer over the whole staged diff
   against the phase spec. Findings and resolutions recorded below.

## Reviewer findings and resolutions

Two fresh subagents reviewed the staged diff in coverage mode. One
gate-blocking format defect was found and fixed; every other finding was a
note or nit, each applied or recorded.

- Coverage auditor, verdict: no blocking or should-fix coverage gaps; every
  claimed behavior has a decisive assertion, both kick sites are covered at
  runtime, the anti-bot pin is untouched by any diff hunk, and every
  single-site mutation in the brief is caught by a named test (traced
  per-mutation in the report).
- Coverage auditor, note (high confidence): the R3 comment-stripper removed
  only full-line line comments, so a block-commented arm could still satisfy
  a source pin. RESOLVED: the stripper now removes block comments too, and
  the block-comment mutation probe (acceptance item 2b) proves the fix
  decisive.
- Coverage auditor, note: the English display copy of the new key has no
  literal pin (the matcher test compares t() to t()). RECORDED as
  deliberate: the load-bearing contract is the wire literal, which IS pinned
  to a disagreeing literal; display copy stays catalog-owned so a deliberate
  copy improvement does not fight a test (the reword-staleness model).
- Coverage auditor, nit: pinning the `'message flood'` label is stricter
  than the wire contract requires. RECORDED as deliberate (design decisions
  above): the label is R10's own diff-shape requirement.
- Spec reviewer, verdict: conformant on every Phase 04 requirement at high
  confidence (R10 literal and both arms, anti-bot and moderation sites
  untouched, matcher arm and no transient collision, the M16 fills and
  regenerated artifacts, the CLAUDE.md note, R12 thin-consumer discipline,
  scope discipline with no phase 05 leakage, conventions, and the mandated
  test list), with ONE gate-blocking format defect: the R3 guard's kick-arm
  match line exceeded Biome's 100-column lineWidth and produced a format
  diff. RESOLVED: `biome check --write` on that one file (the mechanical
  wrap of the `.match(` argument); `biome ci` on the file now reports zero
  errors and `npm run ci:changed` exits 0.
- Spec reviewer, observation: the sha256 baseline is retired on this base,
  so no baseline re-stage is owed (matches the deviation recorded in What
  changed).
- Spec reviewer, observation: the mid-review stripper hardening (the
  coverage auditor's fix landing while the spec review ran) was re-verified
  against the current staged state; strict hardening, no concern.

## Adversarial pass: what is missing or deliberately left

- The Latin locales ship the key as `pending` rows on English fallback:
  legal at PR tier, blocked at the release tier, and filled by the
  maintainer's release-time i18n-locale-fill pass like every other
  contributor-added key.
- The English display copy is unpinned by tests (recorded above); the wire
  literal is the pinned contract.
- The adjacent defect R10 documents stays OUT of scope for a separate
  issue: the in-game moderation kick's `'moderation action'` clientError has
  no matcher arm and renders raw English in the fatal overlay today.
- The kick reason reaches the client only; kickSession still records
  nothing durable for ANY kick (R8's reach ruling), and the operator-side
  flood visibility remains the phase 03 counters
  (`woc_ws_rate_kicks_total`), unchanged by this phase.
- The `'message flood'` label is greppable in source but discarded at
  runtime (`leave` ignores its reason); making leave reasons observable is
  not this packet's scope.
- The R14 cadence-model matrix with client-constant lockstep is phase 05's;
  this phase pinned the kick frames those matrix flood arms will also
  traverse.
- The R11 detector re-check against the private overlay tip of record
  remains phase 06's close-out obligation; this phase touched no detector
  surface.
