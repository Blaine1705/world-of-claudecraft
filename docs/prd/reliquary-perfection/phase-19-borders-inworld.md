# Phase 19: Borders in-world (nameplates + portraits)

Owns: the maintainer's "real nameplate/portrait frame chrome" and "new coloring of the
nameplate" checklist items. Finishes the deeds-era deliberate v1 cut and makes four
existing border rewards real at once (reliquary_gilt, curators_gilt, prestige_laurels,
deepward).

### Starter Prompt
```
This is Phase 19 of the Reliquary Perfection packet: Borders in-world.

Model: session default frontier at xhigh. Harness: Claude Code.
Worktree: /Users/fernando/Documents/wocc-reliquary-review, branch feature/reliquary-perfection.

Goal: a player who earned a border deed can wear ONE active border; everyone sees it as
a frame accent on their nameplate and unit portrait, offline and online.

STEP 0: canonical pre-flight + release sync. Memory: nameplate will-change raster trap;
spatial/nameplate perf notes; view-model order contract.

STEP 1 - LOAD CONTEXT (Explore agent): state.md, progress.md;
the activeTitle precedent END TO END: the setActiveTitle command path (sim + server
validation), where activeTitle lives on PlayerMeta/CharacterState, how it rides the
entity wire (wireEntity), how nameplates render the title text above heads
(src/render/ nameplate module: find it; note the canvas/raster mechanism and the
will-change trap memory), how the deeds window picker sets it, how inspect and chat
read it; src/ui/unit_portrait.ts + unit_portrait_painter.ts (the pure-core exemplar
pair; portraits are the second render target); the four border deeds in
src/sim/content/deeds.ts (reward {kind:'border', slug}); the border badge row in hud.ts (grep the ms-deed-border badge builder);
src/world_api/deeds.ts facet. Return: the activeTitle recipe at every layer, the
nameplate paint path with its perf constraints, portrait frame hooks.

STEP 2 - EXECUTE (three agents: sim+wire, render, ui+picker):

Agent A (sim + command + wire):
- activeBorder: string | null on PlayerMeta + CharacterState (persisted, omit-null),
  validated setter mirroring setActiveTitle exactly: the slug must belong to an EARNED
  deed whose reward.kind === 'border' (server-authoritative; the client command
  carries the deed id or slug; fail closed). Facet: extend the deeds facet
  (activeBorder read + the set command surface the way activeTitle exposes its
  setter), implement in BOTH Sim and ClientWorld, parity pin updated.
- Wire: activeBorder rides the same entity payload activeTitle does (interest-scoped,
  everyone in range sees it), delta-guarded; snapshots suite updated. Old saves load
  with null.
- Tests: setter validation (unearned slug rejected, title-reward deed rejected),
  persistence round-trip, wire round-trip, parity.

Agent B (render):
- Nameplate: a border accent derived from the slug: a slug-keyed frame treatment
  (color + edge style) applied to the nameplate background/frame for players with an
  activeBorder. Follow the nameplate module's existing raster path: the accent must
  not add per-frame allocation or defeat the raster cache (will-change memory: the
  treatment bakes into the existing nameplate texture rebuild that already happens on
  name/title change, never a per-frame style mutation). Distinct, tasteful, readable
  at distance: define the four slugs' palettes in one data table beside the render
  module (design tokens where the surface allows).
- Unit portrait + target frame: the same slug-keyed accent on the portrait ring via
  the unit_portrait pure-core + painter seam (extend the view model; write-elided).
- Fairness: a border is identity, never actionable info; it must render identically
  across graphics tiers (add the fairness pin alongside the existing nameplate
  fairness tests).
- Tests: pure-core units for the accent resolution (slug -> palette; null -> none),
  raster-rebuild trigger pin (border change rebuilds once; no per-frame invalidation),
  RENDER_PURE_CORES registration if a new pure core lands.

Agent C (ui picker + surfaces):
- Border picker beside the title picker in the deeds window (the earned border badge
  row at hud.ts:15788 becomes selectable; "None" option; localized labels via
  deed_i18n names). The character-sheet badge row shows the active state.
- The Reliquary window rank 5 row and the rank-up banner mention the border becoming
  wearable (small copy addition, catalog keys).
- Chat/inspect are Phase 20 consumers; expose what they need on the facet now
  (activeBorder is already readable per Agent A).
- Tests: picker behavioral (select, persist, unearned hidden), i18n keys present.

INVARIANTS: server authority on the setter; IWorld-first both worlds + pin;
determinism (no sim randomness involved); graphics fairness pinned; per-frame budget
(nameplate + portrait painters stay write-elided; hud_perf_budget green); persisted
shape additive with back-compat; every string a t() key.

Out of scope: inspect card + sigil (Phase 20), new border ART assets beyond the
slug palette treatment (if a richer art direction is wanted, record an art request).

STEP 3 - VALIDATION + REVIEW: npx tsc --noEmit; npx vitest run
tests/architecture.test.ts tests/world_api_parity.test.ts tests/snapshots.test.ts
tests/env_protocol.test.ts tests/reliquary_wire.test.ts + nameplate/portrait suites +
tests/hud_perf_budget.test.ts + tests/localization_fixes.test.ts + the new suites;
npm run ci:changed; screenshots: nameplate with each border, portrait ring, the picker
(desktop + mobile). Dispatch: architecture-reviewer + cross-platform-sync +
frontend-seam-reviewer + migration-safety + privacy-security-review (new client
command) + qa-checklist.

STEP 4 - COMMIT CADENCE:
- feat(sim): validated activeBorder state on the deeds seam
- feat(net): activeBorder on the entity wire in both worlds
- feat(render): border accents on nameplates and unit portraits
- feat(ui): border picker and reliquary rank copy
- test: border validation, parity, raster, and fairness coverage

STEP 5 - ACCEPTANCE CRITERIA:
- [ ] Earn rank 5 in a test world, select Eternal Spoils, and another client in range
      sees the accent on your nameplate (wire test) and your portrait ring shows it
      locally; screenshots committed.
- [ ] An unearned or title-kind slug is rejected server-side (pinned).
- [ ] Nameplate raster rebuilds exactly once per border change (pinned); tier knobs do
      not affect the accent (fairness pin).

STEP 6 - DOCS: progress.md, state.md (facet members, wire field, command, palettes),
and update docs/design/reliquary.md + the hud.ts v1-cut comment (the cut is closed).
STEP 7 - FINAL RESPONSE + handoff to Phase 19 QA.

STOPPING RULES: stop and surface if the nameplate raster path cannot take the accent
without a per-frame cost (bring the measurement, propose alternatives); stop if the
entity wire addition breaks the bandwidth suite budget.
```
