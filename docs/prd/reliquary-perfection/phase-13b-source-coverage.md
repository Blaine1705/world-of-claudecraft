# Phase 13b: Complete source coverage (the collection-log answer)

Owns: the source-kind vocabulary extension, multi-source hints, authoring the 59
pending slots down to the two genuine content gaps, per-kind truth pins, and the
multi-source tooltip/aria rendering. This phase executes the maintainer ruling of
2026-08-06 (state.md, "RULING SETTLED (Phase 13 source hints)"): do what is best
for the feature, at collection-log fidelity. The reference experience is the OSRS
collection log and the WoW appearance panel: every uncollected silhouette lists
EVERY real way to get it, plainly and beautifully; the player never has to leave
the window to learn where to hunt.

### Starter Prompt
```
This is Phase 13b of the Reliquary Perfection packet: Complete source coverage.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: every silhouette in the catalog tells you every real way to get it. After
this phase, SOURCE_PENDING_RULING holds exactly two ids (the true content gaps)
and nothing else, and multi-source relics read like a collection log entry, not
a single guessed line.

STEP 0: canonical pre-flight + release sync. Memory: reliquary packet status,
test-pin trap index, background-agent nudge. Phase 13 is pushed by now (13 QA
owns the push); verify origin/feature/reliquary contains the Phase 13 commits
before starting.

STEP 1 - LOAD CONTEXT (Explore agent): state.md (the SETTLED source ruling +
its evidence), progress.md Phase 13 record; src/sim/content/reliquary.ts (the
hint types, authoring helpers, SOURCE_PENDING_RULING with its per-page evidence
comments); tests/reliquary_content.test.ts (the coverage sweep, the per-kind
truth pins, the bidirectional pending pin); src/ui/reliquary_view.ts
(reliquarySourceLinePlan and the plan union); src/ui/reliquary_labels.ts
(reliquarySourceLineText, the membership guards); the award paths the pending
comments cite: src/sim/content/delves/shop.ts and drowned_litany.ts (chest +
board NPC), src/sim/delves/drowned_litany_rite.ts (the rite chest),
src/sim/rift/progression.ts (the reins awards), the quest defs table (locate
it; q_riding_lessons is the known consumer), src/sim/content/weapon_skins.ts +
the account grant path, src/sim/interaction.ts corpse harvest, the mob spawn
or zone data for open-world rares (check whether a mob-to-zone mapping exists
in content). Return: the exact live id spaces and award tables per new kind,
whether rare spawn zones are derivable from content, and the current pending
list grouped by proposed kind.

STEP 2 - EXECUTE (two agents: sim vocabulary + authoring, then UI rendering;
tests ride with each owner):

Agent A (vocabulary + authoring + truth pins, sim content and content tests):
- Extend ReliquarySourceKind with 'delve', 'rift', 'quest', 'store', and
  'activity'. The 'zone' arm gains its first producers (below); do not remove
  any arm.
- Multi-source: a relic may carry MORE THAN ONE hint. Extend the def shape so
  source accepts one hint or a readonly list (pick the cleanest tsc-enforced
  shape), and change the resolver to return a readonly list (empty = no line;
  relic hints win over the page default entirely, never merged with it).
  Update every existing call site and test knowingly.
- Author the pending 57 of 59:
  - Gravewyrm shared drops (6): BOTH dropping bosses as hints on each relic.
  - Delve routes (8): the two shop-and-chest items carry delve + vendor hints;
    the six Drowned Litany rite rows carry a delve hint (the rite chest lives
    inside that delve; "found in" is honest).
  - Corpse harvest (6): activity 'corpse_harvest'. masterwork:first (1):
    activity 'masterwork_craft'. Activities resolve against a new pinned
    module-private table in the content file.
  - Horizons mounts (7 of 9): the four heroic reins carry every dropping boss
    plus a 'rift' hint; reins_valorsteed carries quest + vendor;
    the remaining catalogued mounts per their live award paths.
  - Weapon skins (29): 'store' with the pinned store source id.
  - The two open-world rare set members: add a 'zone' hint alongside the
    existing boss hint (the pair renders "Drops from {rare} in {zone}").
- SOURCE_PENDING_RULING shrinks to exactly reins_drakemaw_raptor (no
  acquisition path exists in content; owner call recorded 2026-08-04) and
  reins_terrorspark_groundshaker (dev-grant only). Keep the bidirectional pin
  and the owner-note comments; do NOT invent paths for them.
- Truth pins per kind, same discipline as the boss/vendor/profession pins:
  delve hints walk into the delve chest tables or shop stock reachable from
  that delve; rift hints into the progression award table; quest hints into
  that quest's reward list; store hints into the skin catalog + the pinned
  store id; activity ids into the pinned activity table; multi-boss hints
  require EVERY listed boss's loot table to carry the item; boss+zone pairs
  validate the zone id, and if the Explore found a derivable spawn-zone
  mapping, pin agreement (else id-existence plus a recorded note). Offenders
  collected toEqual([]), non-vacuity floors per kind, mutation-verify at
  least one kill per new kind.

Agent B (rendering, ui and behavioral tests):
- reliquarySourceLinePlan takes the hint LIST and returns a plan LIST.
  Composition rules: a boss+zone pair on one relic composes the single
  bossZone line; a boss hint on a dungeon-cleared page keeps the bossDungeon
  line; same-dungeon boss pairs may compose one "either boss" line if the
  copy reads better (pick ONE pattern and keep it consistent); everything
  else renders one line per hint, authored order, no cap (the current
  maximum is four lines and a collection log shows them all).
- Tooltip: each source on its own line under the status line, the
  collection-log look. Aria: the lines joined into the existing
  cellMissingSourceAria {source} slot (comma-joined via a key, never
  hardcoded punctuation). Owned cells unchanged.
- New keys (sourceDelve, sourceRift, sourceQuest, sourceStore,
  sourceActivity family or per-activity keys, the bossZone and any pair
  key, the aria join key): English in hudChrome.reliquary.*, five non-Latin
  fills in the same change for every wordy value (M16), glossary terms,
  npm run i18n:gen after.
- Membership-guard every new arm in reliquary_labels.ts exactly like the
  existing five (a stale id renders '', never raw text); per-arm fabricated
  id tests.
- Behavioral tests (extend tests/reliquary_window_behavior.test.ts): a
  multi-source missing cell shows every line in the tooltip AND the joined
  aria; the boss+zone rare shows the place; premise-assert the content
  each case leans on. Update the shot target if the gravewyrm tooltip pick
  should now prefer a dual-source cell, and recapture the page-detail
  screenshots (desktop + mobile) for the PR.

INVARIANTS: information never tier-gated; every new string an English catalog
key with M16 fills; the painter keeps ZERO .name reads and no document.*;
cold-window contracts unchanged; no title attrs; no em/en dashes anywhere;
sim content stays import-free and deterministic; regenerated i18n bundles ride
the same commit as the catalog.

Out of scope: obtain counts and kill counts (Phase 17), rarity chrome
(Phase 22), cell art (Phase 16), deep links (Phase 15), and ADDING acquisition
paths for the two gap mounts (owner decision, not this packet).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/reliquary_content.test.ts tests/reliquary_view.test.ts
tests/reliquary_window.test.ts tests/reliquary_window_behavior.test.ts
tests/architecture.test.ts tests/hud_perf_budget.test.ts
tests/i18n_completeness.test.ts tests/localization_fixes.test.ts
tests/language_fanout_registry.test.ts; npm run ci:changed; node
scripts/gate_select.mjs before calling the phase done. Dispatch:
architecture-reviewer (sim content changed) + frontend-seam-reviewer +
test-coverage-auditor + qa-checklist, coverage prompts, read-only, one
SendMessage nudge each; apply ALL findings and have the fix round verified
by a fresh reviewer.

STEP 4 - COMMIT CADENCE:
- feat(reliquary): extend the source vocabulary and author every resolvable hint
- feat(ui): multi-source lines in the tooltip and aria, collection-log style
- test(reliquary): per-kind truth pins and multi-source behavioral cases
- docs(prd): record Phase 13b and shrink the pending ruling to the two gaps

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Every relic except the two pinned content gaps resolves to at least one
      hint; the coverage sweep and the bidirectional pending pin enforce it.
- [ ] Every hint kind has a truth pin against its live award path, mutation
      verified.
- [ ] A multi-source relic renders every source in the tooltip and the joined
      aria; the dual-table Gravewyrm drops and a heroic reins case are pinned.
- [ ] The two open-world rares name their zone.
- [ ] gate_select green on the committed tree.

STEP 6 - DOCS: progress.md, state.md (vocabulary now stable for Phase 21
growth; Phase 22 fill worklist gains the new sourceLine keys; the pending
entry now lists exactly two ids with owner notes).
STEP 7 - FINAL RESPONSE + handoff to Phase 13b QA.

STOPPING RULES: if a truth pin exposes a hint whose award path does not exist
in content (beyond the two pinned gaps), list it rather than guessing; if
rare spawn zones are not derivable from content, record it and pin
id-existence only; if any authored assignment contradicts the Explore's award
tables, stop and list.
```
