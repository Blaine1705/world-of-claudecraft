# Phase 20: Inspect + social surfaces

Owns: the maintainer's inspect checklist item (Reliquary count, Curator rank,
Illumination, border on inspect), the Curator sigil, the public-sheet recent-relics
parity delta, and the bank-privacy note.

### Starter Prompt
```
This is Phase 20 of the Reliquary Perfection packet: Inspect + social surfaces.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: inspecting a player shows their curator standing (rank, completion pair, active
border, and a rank sigil), and the public sheet gains the recent-finds strip deeds
already have.

STEP 0: canonical pre-flight + release sync. Memory: wire-shared-fragment per-viewer
override; instance payload triage notes.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/ui/armory_inspect.ts + the inspect data path end to end (what identity/inspect
payload the server sends per target: find the identityFields or inspect fan-out in
server/game.ts and the click-inspect card in src/ui/ with its three flair badge slots:
holder tier, Discord, contributor: src/ui/holder_tier.ts + inspect_view.ts if present);
the flair broadcast path (server periodic per-player flair stamp); server/
character_sheet.ts SHEET_RECENT_DEEDS/deedsRecent (the deeds recent-5 sheet pattern) +
server/profile_page.ts; Phase 19's activeBorder facet surface. Return: the inspect
payload shape, the flair pipeline recipe, the sheet recent pattern.

STEP 2 - EXECUTE (two agents: wire+inspect, sheet+docs):

Agent A (inspect surface):
- Extend the inspect payload with: curatorRank (number), the character-scoped
  completion pair, and activeBorder (Phase 19 already has it on the entity wire;
  reuse, do not duplicate). Interest/cadence: inspect is on-demand per target; keep
  the payload additive and small (three numbers + a slug). Implement in BOTH worlds
  (offline inspect of party NPCs/self mirrors online semantics where inspect exists
  offline; follow the existing inspect parity shape).
- Render: the armory inspect window gains a Reliquary line (rank name via
  curatorRankNameKey + pair via the existing charCompletion key family) and shows the
  active border accent on the inspect header portrait (Phase 19 palette table).
- Curator sigil: a fourth flair badge on the click-inspect card for rank 5 players
  (locked: rank 5 only, keeps it exclusive), following the holder_tier inline-SVG
  data-URL pattern; server includes rank in the flair stamp; localized label
  (hudChrome.reliquary.sigilAria). Fail-closed when absent.
- Tests: payload shape pin (wire test), inspect window render with and without rank,
  sigil only at rank 5 (boundary: rank 4 none), parity pin if a facet member landed.

Agent B (public sheet + privacy):
- SHEET_RECENT_RELICS: the last 5 recent-ring entries (display names resolved
  client-side by id; the sheet JSON carries ids + kinds only) on the character sheet
  and the /c/ SSR page beside the deeds recent strip; privacy-identical visibility
  rules to deedsRecent; never firstFind/marks dumps.
- Bank-privacy note (the db reviewer's referral): the public sheet's mount ownership
  derives partly from BANK contents (bagOwnedMounts over inventory + bank). Locked
  handling: document, do not change behavior: add the privacy note to
  docs/design/reliquary.md (public sheet exposes mount-reins-derived counts including
  banked reins; aggregate-only, accepted) and a comment at the character_sheet.ts
  site. If the maintainer later wants bags-only, that is a recorded follow-up, not
  this phase.
- Also slim the sheet marks read with a narrow marks-only restore helper (the db
  reviewer's tidiness note) since this file is being touched.
- Tests: sheet JSON shape (ids only), SSR page renders the strip, profile_page pins
  extended, rate-limit and cache behavior unchanged.

INVARIANTS: server authority (inspect data server-assembled); privacy (aggregates and
ids only; hidden deeds still invisible everywhere); parity for any facet change; every
string a t() key; the sigil is identity, fairness-neutral, and never actionable.

Out of scope: rarity percentages (Phase 22).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/character_sheet.test.ts tests/profile_page.test.ts tests/reliquary_wire.test.ts
tests/snapshots.test.ts tests/world_api_parity.test.ts + inspect/flair suites +
tests/localization_fixes.test.ts; npm run ci:changed; screenshots: inspect card with
sigil + border, /c/ page with the strip. Dispatch: privacy-security-review (primary:
new public data surfaces) + cross-platform-sync + frontend-seam-reviewer +
database-performance-reviewer (sheet read cost unchanged claim) + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(net): curator standing on the inspect payload
- feat(ui): reliquary line, border accent, and rank sigil on inspect
- feat(server): recent relics on the public sheet and the privacy note

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Inspecting a ranked player shows rank, pair, border accent, and (rank 5) the
      sigil; a fresh character shows none of it (both pinned).
- [ ] /c/ shows the recent strip with localized names client-side; JSON carries ids.
- [ ] The privacy note is in the design doc and the code comment; no new uncached
      viewer-identical read (db reviewer re-confirms).

STEP 6 - DOCS: progress.md, state.md (payload fields, sigil rule, sheet fields).
STEP 7 - FINAL RESPONSE + handoff to Phase 20 QA.

STOPPING RULES: stop and ask if inspect has no existing payload seam to extend (do not
invent a new endpoint without confirming the shape).
```
