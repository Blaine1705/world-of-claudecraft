# The Reliquary: implementation plan

Ship a complete, DESIGN.md-grade collection trophy system on **one feature
branch**, in vertical phases. Product and design contract:
[`docs/design/reliquary.md`](../../design/reliquary.md).

## Worktree home (mandatory)

| | |
|---|---|
| **Path** | `/Users/fernando/Documents/wocc-reliquary` |
| **Branch** | `feature/reliquary` |
| **Packet** | `docs/prd/reliquary/` inside that worktree |
| **Base** | `origin/release/v0.35.0` (or current `release/**`) |

Many sessions run in parallel on this machine. **All Reliquary implementation,
QA, commits, and gate runs happen only in this worktree.** Never edit
`/Users/fernando/Documents/world-of-claudecraft` for this feature unless you
are only updating a pointer doc that intentionally lives on the release
checkout.

### Every phase and every QA pass starts with

```bash
cd /Users/fernando/Documents/wocc-reliquary
git status --short
git fetch origin release/v0.35.0
git merge --no-edit origin/release/v0.35.0
```

Record the merged tip in `progress.md` if release moved. If the release line
renames, fetch/merge that tip and update `state.md`.

| Phase | Slice | Surfaces |
|---|---|---|
| 0 | Worktree, branch, design lock verification | **done** (see progress.md) |
| 1 | Foundation: catalog types, sim state, mark hooks, serialize | `src/sim/`, tests |
| 1 QA | Verify Phase 1 | |
| 2 | Conqueror catalog: all dungeon/raid/world boss/delve pages | `src/sim/content/`, pin tests |
| 2 QA | Verify Phase 2 | |
| 3 | IWorld facet, wire thrift, ClientWorld parity | `world_api/`, `server/game.ts`, `net/online.ts` |
| 3 QA | Verify Phase 3 | |
| 4 | Window shell + Overview (DESIGN.md) | `src/ui/`, `src/styles/`, keybind, i18n |
| 4 QA | Verify Phase 4 | |
| 5 | Page grids, silhouettes, live unlock UX, Illumination | ui + sim events + styles |
| 5 QA | Verify Phase 5 | |
| 6 | Curator ranks, cosmetics, deed bridges | sim + ui + deeds content as needed |
| 6 QA | Verify Phase 6 | |
| 7 | Professions shelf | sim marks + catalog + ui |
| 7 QA | Verify Phase 7 | |
| 8 | Horizons shelf (mounts, weapon skins, titles) | content + ui + account cosmetics read |
| 8 QA | Verify Phase 8 | |
| 9 | Social sheet fields, wiki, mobile polish, SFX, screenshots, gate, PR | full stack |

Each implementation phase is followed by a QA pass before the next phase
starts. Commits stay Conventional Commits with a body; no force-push of
shared history.

---

## Product goal

Players open **The Reliquary** and see a museum of what they have conquered
and collected: clear counts on every big source, unique grids with beautiful
silhouettes for what is left, live fills when they loot or craft a new
unique, Curator ranks that feel prestigious without granting power, and
shelves for professions and cosmetics so the whole game is represented.
It pairs with the Book of Deeds the way a trophy hall pairs with an
achievement book.

---

## Current behavior (baseline)

| Area | Today |
|---|---|
| First item obtain | `markItemDiscovered` → `deedStats.itemsDiscovered` (idempotent Set) |
| Dungeon clears | `deedStats.dungeonClears` via final-boss credit in `deeds.ts` |
| Delve clears | `PlayerMeta.delveClears` via `grantDelveClearTo` |
| World boss | Personal loot + raid lockout; kill deeds exist; no dedicated Reliquary page |
| Heroic uniques | `HEROIC_BOSS_LOOT` / `HEROIC_ITEMS` |
| Sets | `item_sets.ts` + `col_set_*` deeds |
| Collection UI | Book of Deeds only (thresholds, not per-boss grids) |
| Character save | Full JSONB every 30s for every online session; leave/shutdown; deed unlock forces save |
| Heavy self wire | Carries full `itemsDiscovered` array on loot / heavy events |

**Gap:** no per-source unique grid, no first-find clear#, no Curator ranks,
no unified mount/skin/title collection browser, no profession trophy gallery.

---

## Desired behavior (acceptance)

1. Stable catalog of shelves and pages; every live dungeon (N/H), raid,
   world boss, and delve with uniques has a page.
2. Clear count visible on every conqueror page that has a clear source.
3. Relic grid: owned art vs silhouette; progress X/Y; page Illumination.
4. Live update on first obtain of a catalogued relic (toast + open window
   refresh); no per-drop DB save.
5. First-find metadata for catalogued item relics (at least clear# when the
   page has clears) stored sparsely.
6. Overview: total progress, Curator rank, recent finds, nearly-complete.
7. Professions shelf with authored trophies (masterwork / rare field notes /
   key specimens), not every craft.
8. Horizons shelf: mounts (item-owned), weapon skins (account), titles (deeds).
9. Cosmetic-only ranks/rewards; luck never moves Renown score.
10. DESIGN.md window grammar; desktop + mobile beautiful and accessible.
11. Character sheet (and public sheet if cheap) show labeled Reliquary
    completion; wiki lists spoiler-safe catalog.
12. Architecture, determinism, IWorld parity, i18n English-only keys,
    performance contract held under load assumptions below.
13. `npm run gate` green on the feature branch before PR is called done.

---

## Architecture (locked)

### Module map

| Piece | Ownership |
|---|---|
| Design contract | `docs/design/reliquary.md` |
| Catalog (data-as-code) | `src/sim/content/reliquary.ts` (+ optional split modules under `src/sim/content/reliquary/` if the table grows large; barrel keeps a single public surface) |
| Runtime marks, first-find, rank pure math | `src/sim/reliquary.ts` behind `SimContext` |
| Discovery hub (do not fork) | Extend behavior **from** `markItemDiscovered` in `src/sim/deeds.ts` by calling into reliquary (or a shared discovery helper both call). All first-obtain still funnels here. |
| Player state | Sparse `PlayerMeta.reliquary` (name locked in Phase 1) + reuse `itemsDiscovered` / clears |
| Serialize / restore | `CharacterState` zero-default omit; load filters unknown ids |
| IWorld | `src/world_api/reliquary.ts` facet; barrel re-export; both hosts; `tests/world_api_parity.test.ts` |
| Wire | Id-only presentation event + thrifty self snapshot fields (Phase 3) |
| Pure UI core | `src/ui/reliquary_view.ts` in `UI_PURE_CORES` |
| Cold window | `src/ui/reliquary_window.ts` (Deeds/Professions family) |
| Styles | `src/styles/components.css` + `hud.mobile.css` tokens only |
| i18n chrome | `hudChrome.reliquary.*` in `src/ui/i18n.catalog/hud_chrome.ts` |
| Content names | Prefer existing item/deed/mount i18n; add `reliquary` content keys only for page titles/blurb not already covered |
| Wiki | Generator picks catalog; spoiler-safe; freshness gated like deeds |

### State model (performance-first)

```
// Conceptual; exact types land in Phase 1
interface ReliquaryState {
  // Only catalogued relic item ids that have been filled with first-find meta.
  firstFind: Record<string, ReliquaryFirstFind>;
  // Authored non-item trophies (profession marks, etc.) not covered by visited.
  marks: Set<string>; // serialize as sorted string[]
  // Optional: ring buffer of recent relic ids (cap ~12), not full history.
  recent: string[]; // cap fixed; drop oldest
  // Derived preferred: curatorRank from pure function over catalog + owned.
  // Store only if a rank-up reward needs a sticky grant id set.
  rankRewardsGranted?: Set<string>;
}

interface ReliquaryFirstFind {
  // Clear count of the page source at first obtain (when applicable).
  clears?: number;
  // Page id that credited the find (optional diagnostic; multi-page fill still global).
  pageId?: string;
}
```

**Ownership of item relics:** `meta.deedStats.itemsDiscovered.has(itemId)`
(and mount ownership via existing `ownedMounts` / reins discovery).

**Never:**

- A second Set of all items ever looted.
- Per-drop timestamps for non-relics.
- Unbounded `recent` or kill logs.
- Immediate `saveCharacter` solely because a silhouette filled.

### Mark path (single choke point)

```
addItem / addItemInstance / buyback markItemDiscovered
  → deeds.markItemDiscovered (existing)
    → if first time and ITEMS[id]:
         itemsDiscovered add + deed dirty
         → reliquary.onItemDiscovered(ctx, meta, itemId)
              if id is a catalogued relic:
                write sparse firstFind (clear# from page source)
                push recent (capped)
                emit reliquaryUnlock { itemId | markId, pageIds?, illuminatedPageId? }
                dirty narrow reliquary key for UI/wire
```

Clear bumps stay at existing sites (`onDungeonFinalBossKilledForDeeds`,
`grantDelveClearTo`, world-boss kill). Reliquary **reads** those counters;
it does not invent a parallel clear map unless a page source has zero
existing credit (then add one bounded counter and pin it).

### Wire thrift (Phase 3 locks exact keys)

| Signal | Cadence | Payload |
|---|---|---|
| `reliquaryUnlock` SimEvent | On new catalogued relic / mark / Illumination | ids only, no English |
| Self snapshot sparse blob | Heavy-gated; only when reliquary dirty or heavy refresh | `firstFind` sparse, `marks[]`, `recent[]` (small) |
| Overview while closed | Prefer counts already available: `itemsDiscovered` size is not page completion; pure client can recompute owned/total from catalog + discovered set if full discovered list already on client | Avoid shipping full catalog over wire |

Client: presentation event for toasts; authoritative membership from
mirrors (discovered + reliquary sparse + account cosmetics + deedsEarned).

### UI recipe (DESIGN.md)

Copy Book of Deeds + Professions cold-window family:

- Shell: `#reliquary-window.window.panel`, `markDialogRoot`, FocusManager.
- Desktop: large window (~720 to 960px class), gold edge, parchment text,
  showcase cards, silhouette grid.
- Mobile: full safe-area panel, horizontal shelf chips, 40px targets.
- Cold rebuild + `reliquaryRefreshSig`; latch after paint; preserve scroll.
- `focus_restore.ts` across rebuild.
- No per-frame grid rebuild; no forced-reflow scans.
- Tokens only; no raw hex in TS; `prefers-reduced-motion` for celebrations.
- Fairness: owned/missing and clear counts never gated by graphics tier.

Keybind: new id `reliquary` adjacent to `deeds` (default suggestion
`Shift+KeyX` if free; confirm against `keybinds.ts` in Phase 4).
Minimap / More tray launchers mirror deeds.

### Rewards doctrine

| Allowed | Forbidden |
|---|---|
| Curator rank titles/borders (cosmetic) | Combat stats, drop rate, pity power |
| Illumination seal on page UI | Exclusive power gear for completing pages |
| Zero-Renown deed bridges for luck collections | Renown from pure luck fills |
| Marquee rare: full-shelf or high rank only | Per-relic realm spam |

### Compatibility / migration

- Saves without `reliquary` field: empty state; **retro fill** on join:
  - Item relics: already in `itemsDiscovered` or seed via `seedItemDiscovery`.
  - firstFind for retro: omit clear# (unknown historical) or set clears to
    current count only if product accepts "approximate" (locked: **omit
    clears on retro**; only live first obtains stamp clear#).
  - Profession marks: grant from existing `visited` `gather_event:*` where
    mapped; masterwork lifetime may be empty until next craft (acceptable
    unless a durable craft log already exists; do not invent false history).
- Unknown ids on load: drop (ITEMS / catalog filter).
- No new Postgres table required for v1. No DDL. Blob growth only.

If a public sheet field is added, it is a labeled completion pair and
Curator rank derived from blob + catalog (same pure functions as client).

### Database performance note

No new hot SQL path. Character JSONB already full-rewrites on autosave.
Risk is **blob size and serialize cost**, not query QPS.

| Concern | Mitigation |
|---|---|
| Blob growth | Sparse firstFind + marks only for catalog; omit empty |
| Autosave storm | Never save on pure relic fill |
| Wire amplification | Id-only events; sparse blob; no dual full discovery array |
| Pool / locks | Unchanged; ride existing `characterSaveQueues` |
| Evidence at QA | Serialize size fixture for a maxed catalog veteran; wire payload size assertion on sparse blob |

---

## Locked product / design decisions

1. Name: **The Reliquary** (player-facing). Code/symbol prefix: `reliquary`.
2. Ship **all shelves** on one branch: Conquerors, Professions, Horizons,
   Overview, ranks, social/wiki polish.
3. Item ownership = `itemsDiscovered`; multi-page fill for shared uniques.
4. firstFind clear# only on live first obtain for catalogued relics; retro
   fills ownership without invented clear history.
5. Cosmetic-only prestige; luck never scores Renown.
6. No per-drop `saveCharacter`.
7. Module-first; pure view + cold painter; DESIGN.md tokens and grammar.
8. Same-change page authoring with every new unique loot source.
9. English-only catalog keys; no overlay hand-fills in feature work.
10. No em dashes, en dashes, or emojis in any authored text.
11. Do not name other commercial games in repo docs beyond this packet's
    research context; player copy stays original.
12. One feature branch off latest release; pull release at each phase start.

---

## Open decisions (non-blocking; defaults locked)

| Topic | Default (implement unless operator overrides) |
|---|---|
| Default keybind | `Shift+KeyX` if unbound; else next free Shift+ letter near deeds |
| Marquee Discord | Illumination of a full **shelf** or Curator rank thresholds only; not every page |
| Public sheet | Ship character sheet + public JSON completion pair + rank |
| Weapon skins shelf | Account-wide read of `weaponSkinIds`; show account scope in UI copy |
| Rift uniques | Include a Conquerors or Horizons sub-page if loot tables are stable; otherwise author in Phase 2 only when pin tests can lock real ids |
| Rank title art | Procedural crest first; painted icons can trail like deeds |

---

## Affected systems

| System | Touch |
|---|---|
| `src/sim/` | content catalog, reliquary module, discovery hook, optional counters |
| `src/world_api/` | new facet + parity pin |
| `server/game.ts` | wire event + sparse self fields (observer only) |
| `src/net/online.ts` | ClientWorld mirror |
| `src/ui/` + `src/styles/` | window, view, toasts, mobile, keybind chrome |
| `src/game/` | keybinds + input route |
| `index.html` / `play.html` | shell root + launchers |
| Wiki generator | catalog export |
| `server/character_sheet.ts` | optional completion fields |
| Tests | content pins, sim marks, wire thrift, view pure cores, architecture, parity |
| i18n | `hud_chrome` (+ content keys as needed) |

**Not in scope:** housing museum props, power rewards, third-party clog sites,
account-wide item discovery merge, unbounded loot history.

---

## Phase details

### Phase 0: worktree and base

**Status: done.** Worktree lives at `/Users/fernando/Documents/wocc-reliquary`
on `feature/reliquary` from `origin/release/v0.35.0` @ `de450dc41f`. Plan
packet is in-tree under `docs/prd/reliquary/` and `docs/design/reliquary.md`.

Later sessions do **not** recreate the worktree. They only re-run the
fetch/merge block above at each phase start.

---

### Phase 1: foundation (sim + state)

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps every time:** `cd` there, then fetch/merge `origin/release/v0.35.0`.

**Outcome:** catalog types, empty or stub catalog, `PlayerMeta` sparse state,
serialize/restore, `onItemDiscovered` hook from `markItemDiscovered`, pure
rank/completion helpers, decisive tests. No player-visible window yet.

**Modules:**

- `src/sim/content/reliquary.ts` (types + empty shelves or minimal fixture page
  used only by tests if needed)
- `src/sim/reliquary.ts`
- Touch: `deeds.ts` mark path, `sim.ts` serialize CharacterState only as thin
  field pass-through, `types.ts` event union if needed
- Tests: `tests/reliquary_state.test.ts`, extend discovery tests

**Tests:**

- Fresh state empty; serialize omits empty.
- First discover of a catalogued id writes firstFind + recent; second is no-op.
- Non-catalogued discover does not grow reliquary firstFind.
- Retro: discovered items count as owned without inventing firstFind clears.
- Determinism: no Math.random / Date.now.

**Validation:**

```bash
npx vitest run tests/reliquary_state.test.ts tests/deeds.test.ts tests/architecture.test.ts
npx tsc --noEmit
```

**Exit criteria:** green tests; no UI; no wire yet (offline path works).

**Next needs:** real pages (Phase 2).

---

### Phase 2: Conqueror catalog

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0` (see Worktree home).

**Outcome:** every live dungeon (normal/heroic uniques as designed), raid,
world boss, and delve page authored and **pinned** against real loot/set
tables. Clear-count sources wired in catalog metadata.

**Modules:**

- Expand `src/sim/content/reliquary.ts` (or `reliquary/*.ts` barrel)
- Optional: world-boss kill counter if missing for clear display
- `tests/reliquary_content.test.ts` (mirror `deeds_content.test.ts` rigor)

**Pin rules:**

- Every relic item id exists in `ITEMS` (or mount reins).
- Every page source maps to a real dungeon/delve/boss id.
- Heroic tables: `HEROIC_BOSS_LOOT` ids included where product wants them.
- Set pages may reference `item_sets.ts` members rather than hand lists.

**Validation:**

```bash
npx vitest run tests/reliquary_content.test.ts tests/reliquary_state.test.ts
npx tsc --noEmit
```

**Exit:** catalog complete for Conquerors; still no UI.

---

### Phase 3: IWorld + wire thrift

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0`.

**Outcome:** `IWorldReliquary` on Sim and ClientWorld; sparse snapshot fields;
`reliquaryUnlock` presentation path; parity pin; **no** per-drop save; heavy
self does not double-ship discovery.

**Modules:**

- `src/world_api/reliquary.ts`
- `src/net/online.ts` mirrors
- `server/game.ts` event observe + snapshot keys
- `tests/world_api_parity.test.ts` update
- Wire thrift tests: payload size / dirty-only

**Validation:**

```bash
npx vitest run tests/world_api_parity.test.ts tests/reliquary_wire.test.ts
npx tsc --noEmit
```

**Exit:** online + offline can answer Reliquary queries identically for
scripted state.

---

### Phase 4: window shell + Overview

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0`.

**Outcome:** openable Reliquary window with Overview (totals, rank placeholder,
recent, nearly complete), shelf nav chrome, keybind, minimap/More entry,
i18n English keys, DESIGN.md shell, mobile full-bleed layout.

**Modules:**

- `src/ui/reliquary_view.ts`, `reliquary_window.ts`
- styles desktop + mobile
- `keybinds.ts`, `input.ts`, Hud thin wire
- `index.html` / `play.html`
- `tests/reliquary_view.test.ts`, hud update-drive / perf-budget rows

**Validation:**

```bash
npx vitest run tests/reliquary_view.test.ts tests/hud_update_drive.test.ts tests/hud_perf_budget.test.ts tests/architecture.test.ts
npx @biomejs/biome check --write <changed files>
npm run i18n:gen
npx tsc --noEmit
```

**Manual:** open/close Esc focus, desktop + mobile portrait/landscape smoke.

**Exit:** beautiful empty-or-data Overview navigable; pages may be stub lists.

---

### Phase 5: page grids + live UX

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0`.

**Outcome:** full page view with silhouette grid, clear count, progress ring,
tooltips (owned vs missing), live toast on unlock, Illumination moment,
signature refresh while open, reduced-motion safe.

**Modules:**

- Expand view models + window rendering
- Toast / combat log / banner path (existing deed toast patterns)
- Optional short SFX hook (or defer SFX to Phase 9 if audio assets lag)
- Styles for cards, silhouettes, quality ghosts

**Validation:** unit tests for grid model + unlock plan; visual manual pass;
biome + tsc.

**Exit:** Conquerors fully playable and delightful.

---

### Phase 6: Curator ranks + cosmetics + deed bridges

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0`.

**Outcome:** rank thresholds pure function; cosmetic rewards (titles/borders
or window seal chrome); optional zero-Renown deed bridges only where they
already fit deeds doctrine; rank-up celebration.

**Rules:** rank from catalogued relic fill count (and/or pages illuminated);
never from kill count alone; luck pages do not feed Renown.

**Validation:** rank pure tests; deeds content pins if new deeds; no Renown
score change from luck-only fills.

**Exit:** prestige loop closed for Conquerors.

---

### Phase 7: Professions shelf

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0`.

**Outcome:** authored profession pages: masterwork gallery (recipe/tier
trophies), rare field notes (reuse `gather_event` visits where possible),
key specimen / signed material trophies as catalog allows. Lifetime marks
written on existing craft/gather success paths **only for catalog ids**.

**Modules:**

- Catalog profession pages
- `reliquary.ts` mark helpers called from craft complete / gather rare
  (thin call sites)
- UI shelf + pages

**Validation:** profession mark tests; no skill power change; blob remains
sparse.

**Exit:** skilling prestige shelf live.

---

### Phase 8: Horizons shelf

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0`.

**Outcome:** mounts from ownership/discovery; weapon skins from account
cosmetics (scope labeled); titles from deeds with title rewards. Read-only
collection presentation (equip/summon may deep-link existing UX, not
reimplement).

**Validation:** ownership pure tests offline + online-shaped stubs; skins
empty when account cosmetics absent.

**Exit:** full three-shelf product.

---

### Phase 9: social, wiki, polish, gate, PR

**Worktree:** `/Users/fernando/Documents/wocc-reliquary` only.  
**First steps:** `cd` + fetch/merge `origin/release/v0.35.0` (final integrate
before gate and PR).

**Outcome:**

- Character sheet + public sheet fields (labeled completion + rank)
- Wiki catalog generation + freshness test
- SFX polish, loading tip optional
- Desktop + mobile screenshots under `docs/screenshots/`
- `npm run gate` green
- PR against release branch using `.github/PULL_REQUEST_TEMPLATE.md`

**Review dispatch before PR:** `qa-checklist`, `architecture-reviewer` (sim),
`frontend-seam-reviewer`, `cross-platform-sync`, `test-coverage-auditor`,
`privacy-security-review` if sheet/API touched, `database-performance-reviewer`
(blob growth evidence even without DDL).

**Exit:** mergeable PR; packet progress complete.

---

## Team workflow (every phase)

1. **Pre-flight (required):**
   ```bash
   cd /Users/fernando/Documents/wocc-reliquary
   git status --short
   git fetch origin release/v0.35.0
   git merge --no-edit origin/release/v0.35.0
   ```
   Confirm you are on `feature/reliquary` in this path only. Abort if you
   discover you are in another worktree (many sessions are active).
2. **Load:** read `state.md`, `progress.md`, this phase section, design doc;
   use Explore for large files (do not load all of `hud.ts` / `sim.ts`).
3. **Execute:** module-first; tests with behavior; no unrelated refactors.
   All file paths are relative to `/Users/fernando/Documents/wocc-reliquary`.
4. **Validate:** phase commands + architecture when sim/ui seams move.
5. **Review:** domain agents per matrix below; fix BLOCKING/SHOULD-FIX.
6. **Commit:** scoped Conventional Commits with body; explicit paths; only
   this worktree's branch.
7. **Handoff:** update `progress.md` + `state.md` resume point (still in this
   worktree).

### Review dispatch matrix

| Agent | Spawn when diff touches |
|---|---|
| `architecture-reviewer` | `src/sim/` |
| `cross-platform-sync` | `world_api/`, wire, ClientWorld, server snapshot |
| `frontend-seam-reviewer` | `src/ui/`, `src/styles/`, presentation |
| `test-coverage-auditor` | new/changed tests or claimed coverage |
| `privacy-security-review` | public sheet, API, account cosmetics reads |
| `database-performance-reviewer` | CharacterState growth, any SQL, save cadence changes |
| `migration-safety` | CharacterState shape / load restore |
| `qa-checklist` | phase complete / pre-PR |

---

## Starter prompts

### Phase 1 starter

```
This is Phase 1 of The Reliquary (docs/prd/reliquary/).

WORKTREE (mandatory; many sessions are active):
  cd /Users/fernando/Documents/wocc-reliquary
  Confirm: git branch shows feature/reliquary and pwd is wocc-reliquary.
  Do NOT work in /Users/fernando/Documents/world-of-claudecraft or any other wt.

STEP 0 - PULL RELEASE (every phase):
  git status --short
  git fetch origin release/v0.35.0
  git merge --no-edit origin/release/v0.35.0
  Resolve conflicts if any before coding.

Goal: ship sim foundation only: catalog types, sparse PlayerMeta.reliquary state,
serialize/restore omit-empty, hook from markItemDiscovered into
src/sim/reliquary.ts for catalogued relics (firstFind + capped recent), pure
completion helpers, decisive tests. No UI, no wire keys yet.

Read (paths relative to this worktree): docs/design/reliquary.md,
docs/prd/reliquary/implementation-plan.md Phase 1, docs/prd/reliquary/state.md,
src/sim/deeds.ts markItemDiscovered, serialize paths in sim.ts CharacterState,
docs/design/deeds.md performance-adjacent patterns.

Invariants: sim purity, no Math.random/Date.now, no per-drop saveCharacter,
no second full discovery set, module-first (do not grow sim.ts), no em dash/emoji.

Validate: vitest reliquary_state + deeds + architecture; tsc.
Update progress.md and state.md in this worktree. Commit with body on feature/reliquary.
```

### Phase 4 starter (UI exemplar)

```
This is Phase 4 of The Reliquary: window shell + Overview.

WORKTREE (mandatory):
  cd /Users/fernando/Documents/wocc-reliquary
  Confirm feature/reliquary. Do not use other worktrees.

STEP 0 - PULL RELEASE:
  git fetch origin release/v0.35.0 && git merge --no-edit origin/release/v0.35.0

Goal: DESIGN.md-grade cold window (deeds/professions family): pure
reliquary_view.ts, reliquary_window.ts, styles desktop+mobile, keybind,
minimap/More, hudChrome.reliquary English keys, Overview totals/recent/nearly
complete from IWorldReliquary. Signature-gated refresh; focus_restore; no
per-frame rebuild.

Read: DESIGN.md sections 1, 8, 10, 13; src/ui/deeds_window.ts + deeds_view.ts;
src/ui/CLAUDE.md; src/styles/CLAUDE.md.

Validate: view tests, hud_update_drive, hud_perf_budget, architecture, i18n:gen,
biome changed files, tsc. Manual mobile+desktop open/close.
```

### Shared starter prefix (all other phases and all QA)

```
WORKTREE: cd /Users/fernando/Documents/wocc-reliquary  (feature/reliquary only)
PULL: git fetch origin release/v0.35.0 && git merge --no-edit origin/release/v0.35.0
Then execute the phase section in docs/prd/reliquary/implementation-plan.md.
```

(Other phases: derive full starters from the phase tables above using the same
worktree + pull + invariants + validation shape.)

---

## Risk areas

| Risk | Mitigation |
|---|---|
| Blob / wire bloat | Sparse allowlist state; thrift tests; reuse itemsDiscovered |
| Autosave load | No save on pure fill; measure serialize size |
| Catalog drift from loot tables | Content pin tests against live tables |
| Double-counting ownership | Single discovery hub; multi-page fill is intentional item-global |
| Renown contamination | Ranks cosmetic; luck deeds stay zero-Renown |
| hud.ts growth | Thin compose only; all logic in modules |
| Mobile clutter | Full-bleed + chips; 40px targets; short landscape rules |
| Scope creep (every trash item) | Authoring review; content tests fail on accidental full-table scrape without curation |
| Account skins offline | Empty shelf with clear copy; no crash |
| Phase ordering | Conquerors before professions/horizons so the hero loop lands first |

---

## Completion criteria (whole feature)

- [x] All phases 1 to 9 done; progress.md green
- [x] Design contract and packet match shipped symbols
- [x] Conquerors + Professions + Horizons + Overview live
- [x] Performance contract held (no per-drop save; sparse state; cold UI)
- [x] Cosmetic-only rewards; deeds Renown rules intact
- [x] Desktop + mobile screenshots in PR
- [ ] `npm run gate` green
- [x] Specialist reviews clean of BLOCKING
- [ ] PR against latest release branch

## Recommended first executable step

Phase 0 is done. In `/Users/fernando/Documents/wocc-reliquary`, pull
`origin/release/v0.35.0`, then execute **Phase 1**: foundation state and mark
hook with tests. Do not open the UI until Phases 1 to 3 are solid.
