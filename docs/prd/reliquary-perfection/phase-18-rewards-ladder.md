# Phase 18: Rewards ladder

Owns: the inverted top of the reward curve. Capstone deeds, flagship Illumination
titles, the Discord feed for border deeds, Steam/Epic mapping, and the generic
first-Illumination marquee. (Border RENDERING is Phase 19; the skin reward is vetoed.)

### Starter Prompt
```
This is Phase 18 of the Reliquary Perfection packet: Rewards ladder.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: the 100 percent chase has a payoff, flagship pages have wearable prestige, and
the hardest rank-up finally reaches Discord.

STEP 0: canonical pre-flight + release sync. Memory: deeds authoring rules
(docs/design/deeds.md rules 1 to 2: luck never scores Renown), QA gap vs ruling.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
src/sim/reliquary.ts CURATOR_RANK_DEFS + syncCuratorRankDeeds + emitReliquaryUnlock
(illuminatedPageId detection) + catalogCharacterCompletion; src/sim/content/deeds.ts
col_reliquary_rank_* records + DEED_ORDER tail + BOOK_COMPLETE_REQUIREMENTS loop;
server/deeds_records.ts isMarqueeDeed + fanOutDeedUnlock + discordFeedDeed (the
title-only filter + koi special case); the Steam/Epic achievement maps (grep
ACH_RELIQUARY / achievement map modules); tests/deeds_content.test.ts pin structure
(counts, frozen SHA, DEED_ORDER tail); docs/design/deeds.md + docs/design/reliquary.md
rules. Return: the deed-authoring recipe, the feed/marquee gates, the achievement map
shape, current counts the pins hold.

STEP 2 - EXECUTE (two agents: content+sim, server+platform):

Agent A (deeds + grant wiring):
- Author zero-Renown manual deeds (collection category, hidden: false):
  col_reliquary_complete (every character-durable catalogued relic owned:
  owned === total from catalogCharacterCompletion) with a wearable title (pick copy in
  the packet's register, e.g. name "The Grand Reliquary", title "Curator of the Vault";
  the maintainer may reword at review), and col_reliquary_conquerors (all Conquerors
  shelf slots) with a title. Both sticky via grantDeed; catalog growth later never
  revokes (feat_book_complete precedent; note it in the desc).
- Flagship Illumination deeds, three pages by the review's shortlist:
  Heroic Nythraxis Raid, Thunzharr, Gravewyrm Sanctum (heroic): zero-Renown, title
  rewards, granted at the emitReliquaryUnlock illumination detection point (live fill
  only; the retro path from Phase 10 must NOT grant with fanfare: retro-sync them
  silently like the rank bridges).
- Grant wiring: extend the existing rank-bridge sync (or a sibling
  syncReliquaryCompletionDeeds) called from the same three points (item fill, mark
  fill, join retro with {retro:true}); completion checks are pure reads over the
  ownership snapshot (Phase 17 hoisted it; reuse the snapshot).
- Deeds content tests: update every count/SHA/DEED_ORDER pin per its own rules (the
  pins are recomputed, never weakened); new deeds join RELIQUARY_HORIZON_TITLES
  (titles page grows; cascade totals) EXCEPT col_reliquary_complete itself if adding
  it would make completion self-referential: check the rank-bridge self-reference
  precedent (bridges count toward rank, self-terminating, commented); completion
  counting its own title reward is NOT self-terminating (owning the completion title
  changes total), so EXCLUDE completion deeds from the titles page and comment why.
- Sim tests: completion deed grants exactly at the last relic (behavioral: fill to
  total-1, assert absent; fill last, assert granted + event), illumination deeds only
  on live fill, retro silence, determinism.

Agent B (server + platform visibility):
- discordFeedDeed: accept border-reward deeds (generic: there are four border deeds,
  all rare milestones; keep the isPubliclyListableDeedId fail-closed path) so rank 5
  and future border capstones reach the feed. Unit-test both arms.
- Generic first-Illumination guild/friend marquee: on a reliquaryUnlock with
  illuminatedPageId and NOT retro, server-side fan-out "X illuminated <page>" to the
  marquee channel (the deedUnlocked fanOut sibling), gated per page per character for
  repeats. Persistence for the anti-repeat gate: derive from a sparse illuminated-pages
  set on the reliquary blob (bounded by page count; omit-empty) written at
  illumination time: this also fixes "illuminated is derived, not persisted" for
  future surfaces. Never marquee per-relic (design doc surfaces table). Localized
  client-side via the existing marquee matcher pattern (server sends ids; S3 guard
  covers the new template in the SAME change).
- Steam/Epic: add col_reliquary_rank_2..5 + the two capstones + the three illumination
  deeds to both achievement maps (code side only); record the portal-side configuration
  task in state.md OPEN items (human work).
- Tests: marquee anti-repeat (illuminate, re-lose nothing, re-illuminate scenario via
  restore, no second fan-out), retro join produces zero marquee, feed filter arms,
  achievement map completeness pin (every col_reliquary_* deed mapped).

INVARIANTS: Renown 0 on every reliquary-sourced deed (pinned); cosmetic only; hidden
deeds untouched; retro silence (Phase 10 policy); sim/server language-agnostic with
matcher rules in the same change; persisted-shape change (illuminated set) is additive
omit-empty with old-blob back-compat.

Out of scope: border RENDERING (Phase 19), inspect sigil (Phase 20).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/architecture.test.ts tests/reliquary_state.test.ts tests/reliquary_wire.test.ts
tests/deeds_content.test.ts tests/deed_i18n.test.ts tests/reliquary_content.test.ts
tests/localization_fixes.test.ts tests/world_api_parity.test.ts + server deed-record
suites; npm run ci:changed. Dispatch: architecture-reviewer + cross-platform-sync +
migration-safety (blob gained the illuminated set) + privacy-security-review (new
public fan-out surface) + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(deeds): reliquary completion and flagship illumination deeds
- feat(server): illumination marquee with per-page anti-repeat and border-deed feed
- feat(reliquary): persist the illuminated-pages set
- test(reliquary): grant-point, retro-silence, and fan-out coverage

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Filling the last relic grants the completion deed, marquees once, feeds Discord,
      and the title is wearable (end-to-end test through the real grant path).
- [ ] Rank 5 now appears in the Discord feed (arm pinned).
- [ ] Re-illumination never re-marquees; retro join produces zero external traffic.
- [ ] Renown total contribution of every new deed is 0 (pinned).

STEP 6 - DOCS: progress.md, state.md (new deed ids, illuminated-set field, feed rule,
portal OPEN item).
STEP 7 - FINAL RESPONSE + handoff to Phase 18 QA.

STOPPING RULES: stop and ask if the completion-deed self-reference analysis finds no
clean exclusion (the maintainer decides the tie-break); stop if the marquee needs a new
wire event kind rather than reusing the deed fan-out shape.
```
