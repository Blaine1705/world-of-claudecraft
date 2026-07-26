# Integration: the v0.31.0 class-overhaul wave

`integration/v031-class-overhauls` collects four class overhauls from three ongoing
contributor PRs into one PBE candidate, then lands as a single PR into
`release/v0.31.0`.

| PR | Owner | Scope | Head branch |
|---|---|---|---|
| #2218 | @ryan-foo | Hunter (Packlord, Coldsight, Fieldcraft), Shaman (Thundercall, Warspirit, Spiritmend), Priest (Doctrine, Benison, Vespers) | `ryan-foo:integration/v029-owned-classes` |
| #2428 | @blaine1705 | Paladin (Sunmender, Faithwarden, Dawnreaver), Devotion and Divine Ascension | `Blaine1705:feature/paladin-sun-cleric-overhaul` |
| #2328 | @patrick261 | Rogue (Knifework, Thuggery, Skulduggery) | `levy-street:feature/rogue-talent-update` |

All three are still receiving commits. Everything below is built to be run again.

## The two hard rules

1. **Never squash, anywhere in this chain.** Every PR keeps its own commits with their
   own authors, the integration branch merges heads with `--no-ff`, and the final landing
   into `release/v0.31.0` is a real merge commit. Because each PR's base is
   `release/v0.31.0` and each head commit becomes reachable from it, GitHub auto-closes
   #2218, #2428 and #2328 as Merged with full credit to their owners. A squash anywhere
   breaks that (it did on #2336, which then needed a manual tree-hash close-out).
2. **A fix that belongs to a class goes to that owner's branch, not here.** We have push
   access to all three. Only genuine cross-PR reconciliation is committed on this branch,
   prefixed `integration:`. Otherwise the integration branch quietly absorbs authorship
   that belongs to the contributors.

## Setup

Work in a worktree, never the main checkout. `rerere` is mandatory: the same conflicts
resolve many times as new commits land upstream.

```
git worktree add ../wt-v031-classes integration/v031-class-overhauls
cd ../wt-v031-classes
git config rerere.enabled true
git config rerere.autoupdate true
npm ci                      # a real install; symlinked node_modules breaks the Svelte admin tests
```

Backups of all three pre-integration heads (local refs plus range bundles plus PR
metadata) live in `../pr-backups/20260726/`. See its `MANIFEST.md` to restore a branch
after a force-push.

## Merge order

1. **#2218 first.** Largest surface, #2328 stacks on it, and its release catch-up is the
   long pole.
2. **#2428 second**, resolving against a stable union.
3. **#2328 last**, restacked onto this branch (it was authored on a stale #2218 snapshot).

## Resolution recipes, by file class

Do not hand-merge anything that a generator owns.

| Files | How to resolve |
|---|---|
| `src/ui/i18n.resolved.generated/*`, `translation_keys.generated.ts`, `pending.ts` | `npm run i18n:gen`. Regenerate before trusting `pending.ts`: a committed one reads zero while stale. |
| `src/ui/i18n.locales/*.ts` | Hand-authored overlays. Union both sides' keys by hand. |
| `src/guide/content.generated.ts` | `npm run wiki:content` |
| `tests/parity/golden/*.json` | Re-mint with `UPDATE_PARITY=1`, then review the re-mint AS A BEHAVIOR CHANGE. `fiesta`, `pet_ai`, `pet_commands`, `party_raid` and `c5_auto_attack` are shared scenarios; movement there is the cross-class leakage signal. |
| `AGENTS.md` | Take the release side; it tracks `CLAUDE.md`. |
| `src/sim/types.ts` unions (`AuraKind`, `AbilityEffect`) | Keep both sides, then grep for duplicate members. **TypeScript does not error on a duplicated union member**, so `tsc` will not catch this one. |
| Registries and dispatch (`sim.ts`, `sim_context.ts`, `combat/effect_dispatch.ts`, `combat/auras.ts`, `combat/talent_procs.ts`) | Additive on both sides. Keep both, preserve alphabetical or grouped order where the file has one. |

## Cross-class reconciliation, ranked by risk

No single PR can see any of these.

1. **The shared choice-row framework.** #2218 rewrites `src/sim/content/choice_rows_classic.ts`
   (+439/-552) while #2428 adds paladin rows into the same framework shared with warrior
   and mage. The most likely semantic (not textual) collision in the wave.
2. **Two save migrations composing.** #2218 ships one; #2428 ships
   `PALADIN_LEGACY_ABILITY_IDS`. Both rewrite persisted loadouts and action bars in
   JSONB. They must compose in either order, and a save written by one must survive the
   other.
3. **v0.31.0 surfaces the PRs predate.** `src/sim/content/dev_kit_roles.ts` (new, 110
   lines) needs rows for the new specs. `src/sim/combat/tank_crit_immunity.ts` (new)
   interacts with Faithwarden and the Stonebound off-tank profile.
4. **An id and key collision guard.** Global uniqueness of ability, aura, talent and icon
   ids across all classes. Clean at integration start (82 vs 60 new ids, 45 vs 35 new
   catalog keys, zero overlap) but it will not stay clean across weeks of parallel work.
5. **Default level-20 action bars** for every new spec, curated per PR, verified together.

## Balance: the numbers in the PR bodies are stale

Between v0.29.0 and v0.31.0 the release branch landed
`6af9cd4bc fix(balance): halve crit and haste rating strength (#2358)`, the
healers-vs-heroics wave (#2345), two Sanctum retunes (#2378, #2419), the fire mage ignite
fix (#2360) and talent scaling for ground AoE (#2396).

Every DPS figure in #2218 and #2328 was measured on pre-halving ratings and does not
survive the merge. #2428 was authored on v0.31.0, so its numbers hold.

Re-probe on the integrated tree, on ONE harness, and re-measure the peer reference on the
same tree: `scripts/owned_class_balance_probe.ts`, `scripts/rogue_dps_probe.ts`, the
paladin probes. Report absolute DPS at burst and 1, 2 and 5 minutes, never ratios. The
harness runs 20 to 25 percent above live. The rogue seed numbers (211, 214, 223 against a
fury reference of 147) need a real answer before PBE independently of the rating change.

## Gates

```
npm run i18n:gen && npm run wiki:content
UPDATE_PARITY=1 npx vitest run tests/parity     # then review the diff
npx tsc --noEmit
npm run gate                                     # PR tier; this branch is not release/**
npx @biomejs/biome check --write <changed files>  # never a whole-repo --write
```

## The refresh loop, for every round of upstream commits

```
git fetch origin 'refs/pull/2218/head:refs/remotes/pr/2218' --force   # and 2428, 2328
git merge --no-ff refs/remotes/pr/2218        # rerere replays prior resolutions
npm run i18n:gen && npm run wiki:content && UPDATE_PARITY=1 npx vitest run tests/parity
npx tsc --noEmit && npm run gate
```

Merge commit message format, so credit is legible in the log:

```
merge: PR #2218 Hunter/Shaman/Priest v0.29 redesigns (@ryan-foo) into integration/v031-class-overhauls
```

## Landing

1. Locale fill pass. The wave adds 80+ new English keys on top of everything already
   pending, and `release/v0.31.0` runs the release-tier i18n gate on push, which
   hard-fails on any pending row.
2. `/qa`, then the reviewers it names: `architecture-reviewer` (determinism, the
   `SimContext` seam), `cross-platform-sync` (new auras and effects must wire to
   `ClientWorld`), `migration-safety` (the two composed save migrations),
   `test-coverage-auditor`.
3. PBE deploy and an owner playtest round per class. New kits likely need boost-kit rows;
   a `BOOST_KIT_VERSION` bump re-kits the fleet.
4. One PR into `release/v0.31.0`, merged with a real merge commit, with a credits table
   naming each owner and PR.
