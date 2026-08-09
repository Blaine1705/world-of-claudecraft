# The Reliquary: collection log, spoils, and Curator prestige

The permanent trophy cabinet for unique spoils, clear counts, and curated
collections. One deterministic sim system, cosmetic-only prestige, a server
that observes but never invents outcomes. This page is the system in brief
plus the contract every new Reliquary page (and every new piece of
conquerable unique loot) must follow.

Companion documents: Book of Deeds at `docs/design/deeds.md` (achievements;
orthogonal surface), professions at `docs/design/professions.md`, interface
standard at `DESIGN.md`.

## Vocabulary (player-facing, all rendered through t())

| Term | Meaning |
|---|---|
| Reliquary | The window and the system (default keybind beside Book of Deeds). |
| Shelf | Top-level category: Conquerors, Professions, Horizons (and Overview). |
| Page | One boss, dungeon, delve, raid wing, profession gallery, or horizon group. |
| Relic | One unique slot on a page (item id, profession mark, mount, skin, title). |
| Clear count | Lifetime clears / kills credited for that page's source. |
| Illumination | Completing every relic on a page (first-time celebration). |
| Curator rank | Cosmetic completion tiers over total unique relics filled. |
| First find | Optional metadata on a filled relic: clear# (and source) at first obtain. |
| Obtain count | How many times a filled relic has been taken from the world. Information on a tooltip, never a score. |

Do not call this a "collection log" in player copy. Do not reference other
games products in code comments, docs, commits, or player strings.

## What it is (and is not)

| Reliquary | Book of Deeds |
|---|---|
| What you have **taken** / filled | What you have **accomplished** |
| Continuous grids and clear counts | Thresholds, skill, story, Renown |
| Silhouettes of missing uniques | Criteria text and progress bars |
| Curator ranks (cosmetic) | Renown board (scoring set) |

Both are permanent prestige surfaces. They pair; they do not merge.

## Architecture

Catalog is data-as-code: `src/sim/content/reliquary.ts` exports shelves,
pages, and relic definitions. Runtime evaluation lives in
`src/sim/reliquary.ts` behind the `SimContext` seam (module-first; never grow
`sim.ts` with Reliquary method banks). Ownership of **item** relics reuses
`deedStats.itemsDiscovered` via the existing first-obtain hub
`markItemDiscovered` (`src/sim/deeds.ts`). Reliquary-specific state is a
**bounded, allowlist-only** sibling on `PlayerMeta` (first-find meta,
profession lifetime marks, derived or stored curator progress). Render and
UI talk only through `IWorldReliquary` (facet under `src/world_api/`); the
window is pure `reliquary_view.ts` + cold `reliquary_window.ts` painter.

The server remains observer: character blob autosave (30s) carries the
sparse Reliquary fields; no per-relic SQL table and no per-drop save storm.

## Rules that bind every page and relic

1. **Cosmetic only.** Curator ranks, Illumination seals, titles, borders,
   window chrome flourishes: never power, convenience, drop rate, or
   actionable combat information.
2. **Luck never scores Renown.** Filling a luck page may complete zero-Renown
   collection deeds (existing `col_*` doctrine) but must not invent a second
   competitive score. See `docs/design/deeds.md` rules 1 to 2.
3. **Bounded by construction.** Reliquary state membership is limited to
   authored catalog ids (and existing discovery sets already bounded by the
   live `ITEMS` catalog). Never log trash commons, never unbounded history
   streams, never per-drop timestamps for non-relics.
4. **First obtain at grant, not at roll.** Credit only when the item enters
   the player through `addItem` / `addItemInstance` / `markItemDiscovered`
   (need/greed winner, personal world-boss take, craft grant). Do not mark
   on corpse roll alone.
5. **Item-global ownership, multi-page fill.** Owning a unique item id fills
   every page that lists that id (shared uniques are intentional).
6. **Clear counts are outcomes already tracked.** Prefer
   `deedStats.dungeonClears`, `delveClears`, and any bounded world-boss
   counters. Add a new counter only when no existing site credits the
   source, and only for authored page sources.
7. **No permanently missable relics** for live content. Seasonal or retired
   pages become Feats-style shelves (visible, labeled retired) rather than
   silent deletes.
8. **Same-change authoring.** Every new dungeon, delve, raid, world boss,
   rare, or unique loot table that should appear in the Reliquary authors
   its page(s) in the **same change** that lands the content. Content tests
   pin pages against real loot / set / mount tables so catalogs cannot drift.
9. **Performance is part of the design.** See the performance contract
   below. A beautiful Reliquary that doubles character-blob write cost or
   heavy-self wire size is a defect.
10. **English-only new player strings** in the matching i18n catalog domain;
    sim/server stay language-agnostic (ids + values; client localizes).

## Performance contract (load-bearing)

| Rule | Detail |
|---|---|
| No per-drop character save | Pure relic fills ride the existing 30s autosave and leave/shutdown saves. Immediate `saveCharacter` only when a durability-critical grant already exists (e.g. deed unlock that grants a title), never "because a silhouette filled." |
| No second full discovery set | Item ownership = `itemsDiscovered`. Do not dual-write a parallel set of every item id. |
| Sparse first-find | `firstFind` / equivalent maps store entries **only** for catalogued relic item ids on first fill. Zero-default omit on serialize. |
| Bounded profession marks | Lifetime profession trophies are authored mark ids (recipe, event flavor, milestone), not every craft. Prefer reusing `visited` namespaces (`gather_event:*`) when they already exist. |
| Wire thrift | Presentation: id-only `reliquaryUnlock` (or reuse a narrow discovery signal). Do not re-send full inventory on every loot when the id was already known. Heavy self may carry a **small** sparse Reliquary blob that changes only when membership grows. Prefer digests / counts for overview while the window is closed. The blob is **memoized** (`reliquaryWireJson`): built once per state CHANGE, not once per heavy tick, so a staggered refresh with nothing moved re-serializes nothing. Delta semantics are unchanged by that: an absent key still means "unchanged, keep the mirror". |
| Obtain counts cost | Read this production-absolute, not against the branch: the Reliquary has never shipped, so **no production row carries the key at all today** and every byte below is new. Measured worst case, a veteran with the whole catalog as of v0.36.0 (135 item relics then, 10 marks, a full recent ring; the byte figures date the same way and re-measure at catalog growth): the character row grows about **+1,772 stored bytes, roughly +17 percent**, under pglz, and character autosave rewrites the full JSONB, so that is paid every `AUTOSAVE_SECONDS` (30) per online session rather than once. The headline is distribution-sensitive: it assumes the measured mix of stamped and unstamped entries, and an independent second model (Phase 17 QA migration review) with every entry carrying a clears stamp and multi-digit tallies lands nearer +2,460 stored, so size the autosave write amplification against a 2.5 KB bound rather than against the mid case; the component deltas reproduce exactly across both models (dropping pageId and zero-clears gives back 881 stored bytes to the byte). Raw size lands about 15 percent below the pre-fix branch shape, which is the half that helps: cheaper detoast for the seq-scan readers. Carrier vector to watch: for a character whose relics were discovered before the Reliquary ships, the re-obtain carrier entry is the ONLY way `firstFind` entries ever accrue, bounded by the catalog size (v0.36.0: about 2.2 KB stored when full). Intra-branch, kept for the design record: counts cost 371 bytes where dropping the dead `pageId` stamp and the zero-clears entries gave back 881, which is why the tally folds onto the first-find entry instead of shipping as a sibling map. |
| Cold UI | Window is cold: signature-gated rebuild when open (Book of Deeds pattern). No per-frame full grid rebuild. Optional always-on tracker (if any) is a separate pure core + write-elided painter. |
| Catalog growth is the bound | Every new relic id is a permanent potential blob key for veterans who obtain it. Author pages deliberately; do not auto-include every loot table row without review. |

Character autosave today rewrites full JSONB for every online session every
`AUTOSAVE_SECONDS` (30). Reliquary must not make that worse: keep added
fields small, sparse, and omit-empty.

## Catalog shape (conceptual)

Shelves (v1 ship set):

1. **Overview** - total progress, Curator rank, recent finds, nearly complete.
2. **Conquerors** - dungeons (normal/heroic), raids, world bosses, delves.
3. **Professions** - masterwork gallery, rare field notes, key recipe / specimen trophies.
4. **Horizons** - mounts, weapon skins (account cosmetics), titles earned.

Each page declares: stable id, shelf, display keys (i18n), clear-count
source (or none), ordered relic list (one relic kind per page: items, marks,
mounts, weapon skins, or titles; single-kind is pinned by
tests/reliquary_content.test.ts and the reliquaryUnlock emit path depends on
it), optional links to deeds (`col_*`, clear milestones).

## Adding a page (the recipe)

1. Identify the unique set from live content (`HEROIC_BOSS_LOOT`, set members
   in `item_sets.ts`, delve items, world boss table, mount reins, etc.).
2. Append the page at the end of the catalog table (append-only order if
   order is derived from table order; otherwise use an explicit order list).
3. Ensure every relic id exists in the live content tables; pin with a
   content test that fails if loot tables drop a referenced id.
4. If clears are missing for the source, add a bounded counter and bump it
   at the existing gameplay site (same tick discipline as deeds).
5. UI and wiki pick up the page from the catalog; no hand-listed HTML.
6. If the page is conquerable content, deeds for that content still follow
   `docs/design/deeds.md` in the same change when required by the content
   rule.

## Surfaces

| Surface | Notes |
|---|---|
| Reliquary window | Primary; DESIGN.md window grammar; mobile full-bleed. |
| Live toast / combat log | Relic logged; page Illumination; rank up. |
| Book of Deeds | Unchanged; optional soft links from collection deeds. |
| Character sheet / public sheet | Optional completion pair and Curator rank (labeled set/scope). |
| Wiki `/wiki` | Spoiler-safe catalog of pages and relic names; no personal progress. |
| Discord / marquee | Optional marquee only for full-page Illumination or high Curator ranks; never spam per-relic. |

### Rewards ladder (shipped)

Five zero-Renown collection deeds sit on top of the Curator rank bridges:
two capstones (`col_reliquary_complete` for the whole character catalog,
`col_reliquary_conquerors` for the Conquerors shelf) and three flagship page
Illuminations (Heroic Nythraxis Raid, Thunzharr, Heroic Gravewyrm Sanctum),
all title rewards, all sticky (catalog growth lowers the live read but never
revokes the earned record). `col_reliquary_complete` carries `feat: true`
(the one off-prefix feat, pinned): it is a dynamic meta over a growing
catalog, so it stays out of `feat_book_complete`'s requirement set and the
Book completion pair, and its title stays off the titles page (the
non-terminating self-reference).

First-ever page Illumination is a persisted, sticky record
(`illuminatedPages` on the reliquary blob, once per durable record): the
`reliquaryUnlock` event names a page only on its first-ever completion, so
the client banner and the guild/follower marquee inherit once-ever semantics.
The three no-emit Horizons pages (mounts, titles, weapon skins) never fire
an Illumination celebration; their payoff is the deed channel. One consent
flag, `accounts.deed_broadcasts`, covers all celebration broadcasts: deed
marquees, Discord deed and border cards, and illumination marquees.

## Deliberately deferred (do not "fix" by shipping)

- Per-drop full loot history: quantity streams, every common, one entry per
  drop, and any timestamp on any of them. Still deferred, and the counts below
  are not a foot in its door.
  - **Sanctioned instead (maintainer, locked decision): grant-time per-relic
    obtain COUNTS.** The counts-only form supersedes this deferral; the history
    form does not become shippable with it. A count is one integer per relic
    and answers "how many", never "when" or "which drop".
  - The rules that keep it counts-only, all of them binding:
    - Catalogued relic ITEM ids only: `isCataloguedRelicItem` gates every
      write, so no common, no mark, no mount, skin, or title has a tally.
    - World-sourced grants only. `noteRelicObtain` runs at the grant hub for
      every acquisition EXCEPT the ones flagged `movement: true`: a trade, a
      mail delivery, a market purchase, a vendor buyback reclaim, an enchant
      re-mint, an unbind stack split, a returned commission. Two players
      handing one relic back and forth must never watch both tallies climb,
      and that is the reading the flag exists to refuse.
    - No timestamps and no per-drop entries, ever. One integer per relic.
    - Sparse and omit-empty on serialize. An absent id costs nothing and
      means "no counted obtain", which is deliberately NOT the same claim as
      "never obtained"; the UI answers it by rendering no line at all.
    - Folded onto the first-find entry on the wire, never a second map.
    - Rule 1 still binds: counts feed no completion, rank, drop rate, deed,
      or reward. They are shown, and nothing consumes them.
- Power rewards, pity timers, or drop-rate buffs for incomplete pages.
- Account-wide item discovery merge (character-scoped like deeds v1 unless
  a later account lane lands).
- Housing museum props (no housing system yet).
- External third-party API beyond existing public sheet fields.

## Anchors (stable paths)

| Concern | Path / symbol |
|---|---|
| Runtime | `src/sim/reliquary.ts`, `src/sim/content/reliquary.ts` |
| UI | `src/ui/reliquary_view.ts`, `src/ui/reliquary_window.ts`, `src/ui/reliquary_sheet_view.ts` |
| Discovery hub | `src/sim/deeds.ts` `markItemDiscovered` |
| Obtain counts | `src/sim/reliquary.ts` (state, serialize, `reliquaryWireJson`), `IWorldReliquary.reliquaryObtainCounts`, `src/ui/reliquary_view.ts` `reliquaryObtainCountsDigest` |
| Illuminated set | `src/sim/reliquary.ts` (`illuminatedPages`, `syncIlluminatedPages`, the emit gate in `emitReliquaryUnlock`); save-only from the client's perspective |
| Completion ladder | `src/sim/reliquary.ts` `RELIQUARY_COMPLETION_DEED_IDS` + `syncReliquaryCompletionDeeds`; records in `src/sim/content/deeds.ts` |
| Illumination marquee | `server/game.ts` `fanOutIllumination`, `server/social.ts` `broadcastIllumination`, hud arm `reliquaryIlluminationBroadcast` |
| Clear counts | `DeedStats.dungeonClears`, `PlayerMeta.delveClears` |
| Heroic uniques | `src/sim/content/heroic_loot.ts` |
| Sets | `src/sim/content/item_sets.ts` |
| World bosses | `src/sim/world_boss.ts` |
| Delves | `src/sim/content/delves/` |
| Mounts | `src/sim/content/mounts.ts`, `src/sim/mounts.ts` |
| Weapon skins | `src/sim/content/weapon_skins.ts`, account cosmetics |
| Deeds UI exemplar | `src/ui/deeds_view.ts`, `src/ui/deeds_window.ts` |
| Interface standard | `DESIGN.md` |
| Autosave | `server/game.ts` `AUTOSAVE_SECONDS` |
