# PR #2976 body draft (Phase 22 records close-out)

Prepared at Phase 22 per the phase file: shown to the maintainer in the phase's
final response BEFORE any gh pr edit; the Phase 22 QA applies it (plus its
closing checklist table) once the maintainer has seen it. Title unchanged:
"feat(reliquary): collection log, spoils, and Curator prestige".

---

## Summary

Ships **The Reliquary**: the permanent trophy cabinet for unique spoils, clear counts, and curated collections (Conquerors, Professions, Horizons, plus Overview). One deterministic sim system, cosmetic-only Curator prestige, thrifty wire, and a classic cold window on the existing HUD seam.

Architecture anchors:
- Catalog data-as-code in `src/sim/content/reliquary.ts`
- Runtime behind `SimContext` in `src/sim/reliquary.ts` (module-first; does not grow `sim.ts`)
- Item ownership reuses `markItemDiscovered` / `deedStats.itemsDiscovered`
- UI/render only through `IWorldReliquary` + pure `reliquary_view.ts` / cold `reliquary_window.ts`
- Server remains observer (sparse character-blob fields; no per-relic SQL writes)
- Realm population rarity rides the deeds rarity refresh: one cached walk per TTL, REST-served, null offline

Design: `docs/design/reliquary.md`.

### Phases 10 to 22 (the perfection packet, on top of the phase 1 to 9 feature)

- **10 to 12**: sim correctness passes, page-name localization channel, test-integrity sweep (every reliquary suite decisive, mutation-checked).
- **13/13b**: window information UX (source hints for every relic with a collection-log vocabulary, page descs, search, ownership chips, roving grid, live region) and complete source coverage.
- **14/15**: Overview flagship (recent-find chips, nearly-complete row, shelf cards) and deep links (clickable chat, HUD tracker with pins, guide search).
- **16**: art (painted launcher icon, owned-cell art for every kind).
- **17**: per-relic obtain counts plus wire/serialize perf (revision-keyed serialize-once blob).
- **18**: rewards ladder (Curator rank deeds, completion deeds, illumination deeds, Steam/Epic achievement maps).
- **19**: borders in-world (nameplates and portraits, forced-colors arms).
- **20**: inspect and social surfaces (curator standing on the identity wire, inspect card accent and rank-5 sigil, public sheet recent relics, char-sheet staleness latch).
- **21**: catalog growth to 35 pages / 372 slots / 337 overview relics (The Rift with dual clear meters, Rares of the Realm kill proofs, Spoils, two Warfare pages, Vault of Ages and Riftbound with the Retired/Personal completion-exclusion machinery).
- **22**: realm population rarity ("Found by {pct} of collectors" on relic tooltips, "Illuminated by {pct}" on page headers, online only, aggregate-only) plus the records close-out this body is part of.

## Related issues

N/A (feature branch from the Reliquary design track).

## Type of change

- [x] Feature: new functionality
- [x] Documentation
- [x] Tests

## How was this tested?

- Per phase (all 13 packet phases): `npx tsc --noEmit`, the phase's targeted vitest battery (parity, wire, architecture, perf budget, i18n guards, styles, and every reliquary suite), `npm run ci:changed`, and fresh-agent review rounds with every finding applied; each QA phase additionally ran `node scripts/gate_select.mjs` and captured screenshots.
- Phase 21 QA (2026-08-09) ran the FULL vitest suite with bounded workers on the merged tree: 34,459 passed, with the two full-sweep-only reds fixed in-change; plus a live authoritative-server rig proving the slain dual write and silent join retro (12/12 assertions).
- Phase 22 (2026-08-09) re-ran the targeted battery plus a bounded full vitest run after the rarity feature, measured the new aggregation on a real Postgres 16 (268.7 ms median at 5,000 eligible characters, one run per 5-minute TTL, figures in `docs/prd/reliquary-perfection/progress.md`), and captured live-server rarity evidence against a 3,861-character population.
- The final whole-feature gate (`npm run gate`) is the Phase 22 QA's deliverable on this branch tip.

## Screenshots / recordings

Final state (Phase 22 recapture, lowest graphics preset; the earlier committed sets in this section are per-phase evidence of their era):

- The Reliquary window (Overview with recent chips, nearly-complete row, shelf cards): `docs/screenshots/reliquary/after-desktop.png`, `docs/screenshots/reliquary/after-mobile.png`
- Page detail (source hints, art, filters): `docs/screenshots/reliquary/page-desktop.png`, `docs/screenshots/reliquary/page-mobile.png`
- Character sheet framed on the Reliquary progression row: `docs/screenshots/reliquary/char-sheet-desktop.png`, `docs/screenshots/reliquary/char-sheet-mobile.png`
- HUD tracker (strip, placement, mobile count chip): `docs/screenshots/reliquary/tracker-desktop.png`, `docs/screenshots/reliquary/tracker-hud-desktop.png`, `docs/screenshots/reliquary/tracker-mobile.png`
- Inspect card (standing line, border accent, rank-5 sigil): `docs/screenshots/reliquary/inspect-desktop.png`, `docs/screenshots/reliquary/inspect-mobile.png`
- Rank-5 Curator border on the own nameplate in world: `docs/screenshots/reliquary/nameplate-border-desktop.png`
- Live-server population rarity (real 3,861-character population; "Found by 0.1% of collectors" under the source hint): `docs/screenshots/reliquary/rarity-online-desktop.png`

Phase 11 (page-name localization), ja_JP before/after:

- Before (English page names in a ja_JP session): `docs/screenshots/reliquary-page-i18n/before-reliquary-window-ja-desktop.png`, `docs/screenshots/reliquary-page-i18n/before-reliquary-window-ja-mobile.png`
- After (fully localized window): `docs/screenshots/reliquary-page-i18n/after-reliquary-window-ja-desktop.png`, `docs/screenshots/reliquary-page-i18n/after-reliquary-window-ja-mobile.png`

Phase 13 (window structure + information UX: source hints, page descs, search, chips, roving grid, live region), before/after, desktop + mobile:

- Overview: `docs/screenshots/reliquary-window-information/before-overview-desktop.png` vs `docs/screenshots/reliquary-window-information/after-overview-desktop.png` (mobile variants alongside)
- Page detail with the live source-line tooltip ("Drops from Sanctum Scaleguard in Gravewyrm Sanctum"): `docs/screenshots/reliquary-window-information/before-page-desktop.png` vs `docs/screenshots/reliquary-window-information/after-page-desktop.png` (mobile variants alongside)

Phase 20 (inspect + social surfaces), before/after, desktop + mobile:

- Inspect card (border accent, Reliquary line, rank-5 Curator sigil): `docs/screenshots/reliquary-phase20/before-inspect-desktop.png` vs `docs/screenshots/reliquary-phase20/after-inspect-desktop.png` (mobile landscape pair alongside)
- Public `/c/` sheet recent-finds strip: `docs/screenshots/reliquary-phase20/before-profile-strip.png` vs `docs/screenshots/reliquary-phase20/after-profile-strip.png`

Phase 21 (catalog growth), after-only (all seven pages are new surfaces), desktop + mobile, lowest graphics preset:

- The Rift page with BOTH clear meters (lifetime clears + S-rank clears): `docs/screenshots/reliquary-phase21/after-reliquary-rift-page-desktop.png` (mobile alongside)
- Rares of the Realm with the slain trophy glyph on filled kill proofs (3/19): `docs/screenshots/reliquary-phase21/after-reliquary-rares-page-desktop.png` (mobile alongside)
- The Horizons shelf with the muted Retired and Personal chips on the two outside-completion rows: `docs/screenshots/reliquary-phase21/after-reliquary-vault-shelf-desktop.png` (mobile alongside)
- Vault of Ages page header with the Retired chip over the four retired relics: `docs/screenshots/reliquary-phase21/after-reliquary-vault-page-desktop.png` (mobile alongside)
- Riftbound page with the Personal chip, holding exactly one band (1/3, the realistic personal state): `docs/screenshots/reliquary-phase21/after-reliquary-riftbound-page-desktop.png` (mobile alongside)

## Residual / merge notes

- **Seed and golden re-pins on this branch were repairs of suites inherited red from the release base** (the v0.35.0 craft-cast seed rot, later the v0.36.0 scenario goldens recorded without this branch's reliquary state member), never feature-branch world-gen: this branch adds no world-gen draws, verified by identical recordings at identical seeds on both sides. Some phase 9-era commit messages in history still carry the older wording; the tree's comments and the re-pin policy in `docs/prd/reliquary-perfection/state.md` carry the correct attribution.
- **The five non-Latin locale overlays (ja/ko/ru/zh_CN/zh_TW) carry contributor-authored M16 fills for the new wordy reliquary keys, flagged for maintainer translation review at the release fill**; they are not merge hygiene. The 15 Latin locales stay pending on purpose; the consolidated release-fill worklist lives in `docs/prd/reliquary-perfection/state.md` ("i18n release fill" plus the Phase 21/22 additions).
- Maintainer riders recorded in `docs/prd/reliquary-perfection/state.md` (not filed as issues per the packet convention): the Steam/Epic portal registration of the nine achievement ids with its deploy-order constraint; the upstream flag that the v0.36.0 W-L-D draws counters were missing from the professions blob-growth census; the v0.35.0 usedBy locale-fill rider (cross-referenced); the recorded rarity scaling lever (a character_relics observer table if the refresh ever exceeds 1 s or 50k eligible characters).
- The intermediate `docs/prd/reliquary/` packet was removed earlier on purpose; `docs/prd/reliquary-perfection/` holds the packet records until the Phase 22 QA teardown offer.

---

## Checklist

### Quality

- [x] **The gate passes.** Per-phase `node scripts/gate_select.mjs` green throughout; the Phase 21 QA full suite ran 34,459 tests green on the merged tree; the final `npm run gate` on the finished tip is the Phase 22 QA deliverable.

### Cross-platform

- [x] **Tested on desktop and mobile.** Screenshots committed for both; mobile window transform pins kept in sync; the reliquary window's 844x390 posture is evidenced by the committed capture set.
- [x] **Accessible.** Cold window on the existing HUD patterns (keyboard roving grid, focus restore keys, live region with reannounce discipline, aria mirrors for every tooltip line, forced-colors arms for the border surfaces).

### Localization (i18n)

- [x] **New player-visible strings follow the contributor policy.** English catalog keys for all Reliquary copy; wordy keys carry their five non-Latin fills per M16 (contributor-authored, flagged for maintainer review); Latin locales pending for the release fill by design.
- [x] Numbers, money, dates, units, and percents go through the i18n formatters.
- [x] Player-facing text from sim/server is key-based or client-matched in the same change (the S3 guard pins it).

### Hygiene

- [x] No secrets, credentials, or `.env` committed, and `ALLOW_DEV_COMMANDS` is not enabled in any production path.
- [x] Generated artifacts only via the owning build steps (i18n tables, wiki content, SFX and media manifests).
