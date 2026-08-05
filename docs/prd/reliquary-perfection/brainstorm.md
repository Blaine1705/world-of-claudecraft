# Brainstorm: Reliquary Perfection Packet

## Why this packet exists

PR #2976 shipped The Reliquary (phases 1 to 9). A full multi-agent review on 2026-08-05
(6 domain reviewers: architecture, frontend seams, cross-host parity, test coverage,
database performance, QA gate; plus an 8-dimension research workflow with 14 adversarial
verifications, every one upheld) found the engineering core excellent and the product
layer below the flagship bar. The maintainer's ruling: address EVERYTHING (every
blocking, should-fix, nit, note, and idea finding, plus the full product checklist),
with a QA phase between each build phase and a release/v0.35.0 sync at every phase start.

The review corpus is baked into the phase files as file:line evidence; fresh sessions do
not need to re-research. Line numbers were valid at commit e0445ff5d4 and drift as phases
land; treat them as anchors, not gospel.

## Verdict of the review (summary)

Excellent and to be preserved: sim module behind SimContext (no Rng, sparse allowlisted
state, prebuilt indexes, fail-closed restore), measured performance contract (+2,701 B
stored worst case, delta-elided wire, O(1) grant path, genuinely cold window), full
IWorld/wire parity with an AssertNever facet pin, determinism proven byte-identical vs
the base three independent ways, strong family reuse in the UI.

Below the bar: a hidden-deed spoiler leak, page names bypassing t(), a join-time retro
path that celebrates and broadcasts, gameable catalog and cap pins, a stub Overview, an
inverted reward curve (nothing past 100 of 184 relics; the rank 5 border invisible),
missing surfaces from the maintainer's checklist (nameplate/portrait chrome, inspect,
tracker, clickable chat, obtain counts), and catalog blind spots (Rift, overworld rares,
three omitted drops, PvP gallery).

## Locked decisions (maintainer, 2026-08-05)

1. Hidden deeds are removed from the Reliquary catalog entirely (no masked slots). The
   Book of Deeds remains their home. Titles page drops to 33 slots.
2. No weapon-skin reward at rank 5. The reward ladder is completed with capstone title
   deeds, in-world border rendering, Illumination titles, the inspect sigil, and the
   Discord feed instead.
3. Delivery: extend PR #2976. Phases land on local branch `feature/reliquary-perfection`;
   after each QA phase passes, push `HEAD:feature/reliquary` (never force) so the PR
   updates. The maintainer's own worktree `wocc-reliquary` holds the local
   `feature/reliquary` ref; never touch that worktree.
4. Per-relic obtain counts ARE wanted (maintainer checklist item). This supersedes the
   design doc's "per-drop history" deferral for the narrow counts-only form; the design
   doc is updated in the same phase (17) that ships it.
5. Every phase starts by merging `origin/release/v0.35.0` and auditing the merge.

## The maintainer's product checklist (all items owned by a phase)

| Checklist item | Review status | Owned by |
|---|---|---|
| Character panel shows Reliquary info | Shipped in 1 to 9 | Screenshots in 22 |
| Real nameplate/portrait frame chrome | Missing (deeds-era v1 cut) | Phase 19 |
| "New coloring of the nameplate" | Does not exist anywhere | Phase 19 |
| Reliquary on in-game inspect | Missing | Phase 20 |
| Always-on Reliquary tracker | Missing (design-optional) | Phase 15 |
| Combat log entry, clickable jump | Partial (plain text, no deep link) | Phase 15 |
| Recently gained section | Shipped but inert text chips | Phase 14 |
| Times dropped / obtain counts | Not tracked | Phase 17 |
| Rewards good enough? | Inverted at the top | Phases 18, 19, 20 |
| Anything else worth tracking? | Rift, rares, PvP, fishing, retired | Phase 21 |
| Performance to the highest standard? | Met, three cheap wins remain | Phases 14, 17 |

## Finding-to-phase map (complete)

Blocking:
- Hidden deed leak (hid_saul_footnote reward title on the Titles page + public wiki): Phase 10.
- 28 page names never pass t(): Phase 11.
- Join-time retro celebrates, fans out to guild/followers/Discord, fabricates
  firstFind.clears: Phase 10.
- Catalog not pinned to live loot tables (normal dungeons, delves, world boss; no-op
  `const thunzharr = ITEMS`), recent-ring cap test re-implements the ring: Phase 12.

Should-fix:
- ownedMounts weakened throw to silent []: Phase 10. Rank-sync early-return order: Phase 10.
- reliquaryUnlock lacks retro field: Phase 10. Retro join coverage is a source scrape: Phase 10 test, re-audited in 12.
- ARIA role=listitem on page rows: Phase 13. No behavioral window test: Phase 13.
- Four-way relic-name ladder (drifted between chat and banner): Phase 13.
- pageStubNote dead key + fills: Phase 11. reliquaryWindowOpen dead getter: Phase 13.
- crown launcher art missing from CHROME_ART_IDS: Phase 16.
- Four undefined pseudo-tokens (one with two fallback values): Phase 13.
- Nearly-complete accepts any started page (1/30): Phase 13.
- Overview far below flagship promise: Phase 14. Page descs never rendered: Phase 13.
- Missing-relic tooltip has no source hint (catalog cannot express one): Phase 13.
- Owned non-item cells render the generic unknown ghost: Phase 16.
- Illumination in-window moment is letter-spacing only; promised fill flash absent: Phase 14.
- PR body misstates overlay edits as hygiene; false "feature-branch world-gen" re-pin
  attribution in comments and commits; frostveil pin weakened under a nonexistent
  breath/drown rationale; fishing comment indices stale; fear_break seed comment stale: Phases 12 (comments) and 22 (PR body).
- Shelf names translated differently wiki vs in-game (ja/ko/zh_CN/zh_TW): Phase 11.
- Server CURATOR_RANK_ENGLISH ranks 2 to 4 unpinned: Phase 12.
- firstFind.pageId is dead serialized weight (48 percent of the field): Phase 17.
- Restore sanitizers unexercised (clears guard, pageId filter, recent truncation),
  clearCountForSource delve arm + normal-difficulty negative, multi-page Illumination
  arm, profile-page lines untested, character-scoped total literal, curatorRankNameKey
  fallback, masterwork craft behavioral assertion: Phase 12.
- Illumination ownership surface excludes weaponSkins vs display completion (latent
  mixed-page hazard): Phase 10.
- Masterwork marks have no crash-recovery second home (add visited mirror): Phase 10.
- Rank 5 invisible capstone, nothing past 100 of 184, Illumination invisible to others:
  Phases 18 and 19.
- Rift zero presence; overworld rares zero presence; gravewyrm_bone_quiver,
  direfang_quiver, selthes_seastriders omitted: Phases 21 (systems) and 12 (three drops).
- Screenshot deliverable wrong (desktop is the marketing homepage; mobile cropped above
  the Reliquary row): Phase 22.

Nits and notes (all owned):
- 44px touch shrink rule, dead .reliquary-page-stub CSS, .reliquary-summary b selector,
  reduced-motion box-shadow query, inline width style, inert cell cursor/hover, header
  count demotion, 239 vs 213 reconciliation: Phases 13 and 14.
- buildInput allocations before signature elide, Object.keys length: Phase 14.
- pushRecent inverted de-dupe guard (dead), restore no-dedupe, deeds.ts rank-bridge
  comment drift: Phase 10.
- Nav count hand-concat vs progressText, loading tip hardcodes Shift+X, humanized-id
  English fallbacks: Phase 11 (i18n side) and 13 (ladder).
- Sheet-view Map-shape test arm, corpse 60s timeout sanity: Phase 12.
- Guide search does not index Reliquary pages/relics: Phase 15.
- Naming collision with the collapsed_reliquary delve: documented here, no action.

Ideas (all included per the maintainer's ruling, except those vetoed):
- Capstone deeds (full catalog + Conquerors shelf): Phase 18.
- Border rendering on nameplates/portraits (activeBorder; makes reliquary_gilt,
  curators_gilt, prestige_laurels, deepward real): Phase 19.
- Flagship Illumination titles (3 to 5 pages): Phase 18.
- Curator sigil on inspect card (holder_tier flair pipeline): Phase 20.
- Discord feed for border-reward deeds: Phase 18.
- Steam/Epic achievement mapping for rank deeds (code side): Phase 18.
- Generic first-Illumination guild marquee with per-page anti-repeat: Phase 18.
- Obtain counts: Phase 17. Window search + owned/missing filter: Phase 13.
- Population rarity (percent of players who own a relic/page, deeds-records pattern): Phase 22.
- Always-on tracker: Phase 15. Rift, rares, PvP Warfare gallery, fishing trophies
  (koi + rod ladder on the specimens page), retired Feats-style page: Phase 21.
- reliq wire memoization + ownership snapshot hoist: Phase 17.

Vetoed (do not ship, do not re-raise):
- Weapon-skin reward at rank 5 (maintainer ruling, 2026-08-05).
- Mount rewards (speed fraction = power), pity timers, drop-rate buffs, per-drop
  timestamp/quantity history streams (doctrine; obtain COUNTS are the sanctioned form).
- Event-skin pages (only DEV placeholder content exists), card/companion shelves (too thin).

## OPEN items

- Frostveil descent HP loss (~40 on the release base, cause undiagnosed; no breath or
  drown mechanic exists). Phase 12 either diagnoses it or restores the strict pin with
  the failure filed against the release branch. Release-side re-pin chore text is
  prepared in Phase 22 for the maintainer to file BY HAND (standing rule: never file
  issues unasked).
- Steam/Epic portal-side achievement configuration is human work; Phase 18 ships the
  code-side maps only and records the portal task.
- The 15-Latin-locale release fill for all reliquary keys is release-time maintainer
  work (i18n-locale-fill skill); Phase 22 records the exact worklist.
