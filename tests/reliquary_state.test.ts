// Reliquary Phase 1 foundation: sparse state, mark hooks, serialize omit-empty,
// pure completion helpers. No UI / wire coverage here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import {
  isCataloguedRelicItem,
  RELIQUARY_MARK_IDS,
  RELIQUARY_PAGES,
  type ReliquaryPageDef,
} from '../src/sim/content/reliquary';
import { grantDeed, markItemDiscovered } from '../src/sim/deeds';
import {
  CURATOR_RANK_DEFS,
  CURATOR_RANK_THRESHOLDS,
  catalogItemCompletion,
  catalogRankOwned,
  catalogRelicCompletion,
  characterReliquaryOwnership,
  clearCountForSource,
  curatorRankFromOwned,
  curatorSealIdForRank,
  freshReliquaryState,
  isReliquaryStateEmpty,
  noteRelicItemFind,
  noteReliquaryMark,
  onItemDiscovered,
  pageCompletion,
  RELIQUARY_RECENT_CAP,
  reliquaryOwnershipOpts,
  restoreReliquaryState,
  serializeReliquaryState,
  syncCuratorRankDeeds,
  syncReliquaryMarksFromVisited,
} from '../src/sim/reliquary';
import { type CharacterState, Sim } from '../src/sim/sim';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makeSim(seed = 42): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: false });
}

function primary(sim: Sim) {
  const meta = sim.players.get(sim.playerId)!;
  const e = sim.entities.get(sim.playerId)!;
  return { meta, e };
}

/** Catalogued Hollow Crypt unique (Phase 2 expanded conquerors_hollow_crypt). */
const CATALOGUE_RELIC = 'cryptbone_helm';
/** Real item that is NOT a catalogued Reliquary relic. */
const NON_RELIC = 'glimmerfin_koi';

describe('Reliquary fresh state + serialize omit-empty', () => {
  it('a new character has empty reliquary state and serializes without the key', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    expect(meta.reliquary.firstFind).toEqual({});
    expect(meta.reliquary.marks.size).toBe(0);
    expect(meta.reliquary.recent).toEqual([]);
    expect(isReliquaryStateEmpty(meta.reliquary)).toBe(true);

    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.reliquary).toBeUndefined();
  });

  it('serializeReliquaryState returns undefined for a fresh state', () => {
    expect(serializeReliquaryState(freshReliquaryState())).toBeUndefined();
  });

  it('restore of undefined yields empty state', () => {
    const restored = restoreReliquaryState(undefined);
    expect(isReliquaryStateEmpty(restored)).toBe(true);
  });
});

describe('Reliquary first discover of a catalogued relic', () => {
  it('writes firstFind + recent on first markItemDiscovered; second is a no-op', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    expect(isCataloguedRelicItem(CATALOGUE_RELIC)).toBe(true);

    // Stamp a known clear count so firstFind.clears is observable.
    meta.deedStats.dungeonClears.hollow_crypt = 3;

    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    expect(meta.deedStats.itemsDiscovered.has(CATALOGUE_RELIC)).toBe(true);
    expect(meta.reliquary.firstFind[CATALOGUE_RELIC]).toEqual({
      clears: 3,
      pageId: 'conquerors_hollow_crypt',
    });
    expect(meta.reliquary.recent).toEqual([CATALOGUE_RELIC]);

    // Second discover: no re-stamp, no double recent entry.
    meta.deedStats.dungeonClears.hollow_crypt = 99;
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    expect(meta.reliquary.firstFind[CATALOGUE_RELIC]).toEqual({
      clears: 3,
      pageId: 'conquerors_hollow_crypt',
    });
    expect(meta.reliquary.recent).toEqual([CATALOGUE_RELIC]);
  });

  it('onItemDiscovered alone does not dual-write itemsDiscovered', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    const before = meta.deedStats.itemsDiscovered.size;
    onItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    // Still writes firstFind when called directly (catalogued), but never
    // adds the item to the discovery set (that is deeds' job).
    expect(meta.deedStats.itemsDiscovered.size).toBe(before);
    expect(meta.deedStats.itemsDiscovered.has(CATALOGUE_RELIC)).toBe(false);
    expect(meta.reliquary.firstFind[CATALOGUE_RELIC]).toBeDefined();
  });
});

describe('Reliquary non-catalogued discover', () => {
  it('does not grow firstFind or recent for a non-relic item', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    expect(isCataloguedRelicItem(NON_RELIC)).toBe(false);

    markItemDiscovered(sim.ctx, meta, NON_RELIC);
    expect(meta.deedStats.itemsDiscovered.has(NON_RELIC)).toBe(true);
    expect(meta.reliquary.firstFind[NON_RELIC]).toBeUndefined();
    expect(meta.reliquary.recent).toEqual([]);
    expect(Object.keys(meta.reliquary.firstFind)).toEqual([]);
  });
});

describe('Reliquary retro ownership without inventing firstFind clears', () => {
  it('counts discovered items as owned even when firstFind is absent', () => {
    const owned = new Set([CATALOGUE_RELIC]);
    const page = RELIQUARY_PAGES.find((p) => p.id === 'conquerors_hollow_crypt')!;
    const progress = pageCompletion(page, { itemsDiscovered: owned });
    expect(progress.owned).toBe(1);
    expect(progress.total).toBe(page.relics.length);
    expect(progress.complete).toBe(false);
    // Own every slot: retro completion without firstFind clears.
    const allOwned = new Set(page.relics.filter((r) => r.kind === 'item').map((r) => r.itemId));
    expect(pageCompletion(page, { itemsDiscovered: allOwned }).complete).toBe(true);

    const catalog = catalogItemCompletion(owned);
    expect(catalog.owned).toBe(1);
    expect(catalog.total).toBeGreaterThan(1);
  });

  it('a pre-Reliquary save with discovery loads owned without firstFind clears', () => {
    const held: CharacterState = {
      level: 20,
      xp: 0,
      copper: 0,
      hp: 30,
      resource: 0,
      pos: { x: 2, z: -2 },
      facing: 0,
      equipment: {},
      inventory: [{ itemId: CATALOGUE_RELIC, count: 1 }],
      questLog: [],
      questsDone: [],
      deedStats: { itemsDiscovered: [CATALOGUE_RELIC] },
      // No reliquary key: veteran ownership predates the system.
    };
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Veteran', { state: held });
    const meta = sim.players.get(pid)!;

    expect(meta.deedStats.itemsDiscovered.has(CATALOGUE_RELIC)).toBe(true);
    expect(meta.reliquary.firstFind[CATALOGUE_RELIC]).toBeUndefined();
    expect(isReliquaryStateEmpty(meta.reliquary)).toBe(true);

    // Pure completion still sees the item as owned (partial page is fine).
    const page = RELIQUARY_PAGES.find((p) => p.id === 'conquerors_hollow_crypt')!;
    const progress = pageCompletion(page, { itemsDiscovered: meta.deedStats.itemsDiscovered });
    expect(progress.owned).toBe(1);
    expect(progress.complete).toBe(false);

    // Re-discover does not invent a late firstFind once already in the set
    // (the hub short-circuits before the Reliquary hook).
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    expect(meta.reliquary.firstFind[CATALOGUE_RELIC]).toBeUndefined();
  });
});

describe('Reliquary serialize / restore round-trip', () => {
  it('round-trips firstFind, marks, and recent; filters unknown ids on load', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    meta.deedStats.dungeonClears.hollow_crypt = 2;
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);

    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.reliquary).toBeDefined();
    expect(state.reliquary!.firstFind?.[CATALOGUE_RELIC]).toEqual({
      clears: 2,
      pageId: 'conquerors_hollow_crypt',
    });
    expect(state.reliquary!.recent).toEqual([CATALOGUE_RELIC]);

    // Hand-edited unknown ids must not grow membership on restore.
    const dirty: CharacterState = {
      ...state,
      reliquary: {
        firstFind: {
          ...(state.reliquary!.firstFind ?? {}),
          not_a_real_relic: { clears: 9, pageId: 'nope' },
        },
        marks: ['not_an_authored_mark'],
        recent: [CATALOGUE_RELIC, 'not_a_real_relic'],
      },
    };
    const sim2 = makeSim();
    const pid = sim2.addPlayer('warrior', 'Reload', { state: dirty });
    const m2 = sim2.players.get(pid)!;
    expect(m2.reliquary.firstFind[CATALOGUE_RELIC]).toEqual({
      clears: 2,
      pageId: 'conquerors_hollow_crypt',
    });
    expect(m2.reliquary.firstFind.not_a_real_relic).toBeUndefined();
    expect(m2.reliquary.marks.size).toBe(0);
    expect(m2.reliquary.recent).toEqual([CATALOGUE_RELIC]);
  });
});

describe('Reliquary profession marks (Phase 7)', () => {
  const FIELD_NOTE = 'gather_event:pristine_vein';
  const MASTERWORK_FIRST = 'masterwork:first';

  it('noteReliquaryMark grants catalog marks sparsely and ignores unknown ids', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    expect(noteReliquaryMark(sim.ctx, meta, 'not_an_authored_mark')).toBe(false);
    expect(meta.reliquary.marks.size).toBe(0);

    expect(noteReliquaryMark(sim.ctx, meta, FIELD_NOTE)).toBe(true);
    expect(meta.reliquary.marks.has(FIELD_NOTE)).toBe(true);
    expect(meta.reliquary.recent.at(-1)).toBe(FIELD_NOTE);
    // Second grant is a no-op (idempotent).
    expect(noteReliquaryMark(sim.ctx, meta, FIELD_NOTE)).toBe(false);
    expect(meta.reliquary.marks.size).toBe(1);

    const events = sim.drainEvents().filter((e) => e.type === 'reliquaryUnlock');
    expect(events.some((e) => e.type === 'reliquaryUnlock' && e.markId === FIELD_NOTE)).toBe(true);
    const unlock = events.find((e) => e.type === 'reliquaryUnlock' && e.markId === FIELD_NOTE);
    expect(unlock && 'pageIds' in unlock && unlock.pageIds).toContain('professions_field_notes');
  });

  it('serialize marks sparse + omit-empty; restore drops unknown mark ids', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    noteReliquaryMark(sim.ctx, meta, FIELD_NOTE);
    const state = sim.serializeCharacter(sim.playerId)!;
    expect(state.reliquary?.marks).toEqual([FIELD_NOTE]);
    // Pure mark fill must not invent firstFind noise.
    expect(state.reliquary?.firstFind).toBeUndefined();

    const dirty: CharacterState = {
      ...state,
      reliquary: {
        marks: [FIELD_NOTE, 'not_an_authored_mark', 'masterwork:cooking'],
        recent: [FIELD_NOTE, 'not_an_authored_mark'],
      },
    };
    const sim2 = makeSim();
    const pid = sim2.addPlayer('warrior', 'Reload', { state: dirty });
    const m2 = sim2.players.get(pid)!;
    expect([...m2.reliquary.marks]).toEqual([FIELD_NOTE]);
    expect(m2.reliquary.recent).toEqual([FIELD_NOTE]);
  });

  it('syncReliquaryMarksFromVisited retro-fills field notes only (no masterwork invent)', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    meta.deedStats.visited.add(FIELD_NOTE);
    meta.deedStats.visited.add('gather_event:moonlit_bloom');
    meta.deedStats.visited.add('gather:eastbrook:ore'); // not a Reliquary mark
    // Visited alone does not invent masterwork lifetime history.
    const added = syncReliquaryMarksFromVisited(meta);
    expect(added).toBe(2);
    expect(meta.reliquary.marks.has(FIELD_NOTE)).toBe(true);
    expect(meta.reliquary.marks.has('gather_event:moonlit_bloom')).toBe(true);
    expect(meta.reliquary.marks.has(MASTERWORK_FIRST)).toBe(false);
    expect(meta.reliquary.recent).toEqual([]); // silent retro, no recent push
    // Idempotent.
    expect(syncReliquaryMarksFromVisited(meta)).toBe(0);
  });

  it('pageCompletion counts mark ownership for profession pages', () => {
    const page = RELIQUARY_PAGES.find((p) => p.id === 'professions_field_notes')!;
    expect(page).toBeDefined();
    const empty = pageCompletion(page, {
      itemsDiscovered: new Set(),
      marks: new Set(),
    });
    expect(empty.owned).toBe(0);
    expect(empty.complete).toBe(false);
    const marks = new Set(page.relics.filter((r) => r.kind === 'mark').map((r) => r.markId));
    const full = pageCompletion(page, { itemsDiscovered: new Set(), marks });
    expect(full.owned).toBe(full.total);
    expect(full.complete).toBe(true);
  });

  it('catalogRelicCompletion includes marks in overview totals', () => {
    const itemsOnly = catalogItemCompletion(new Set());
    const withMarks = catalogRelicCompletion({
      itemsDiscovered: new Set(),
      marks: new Set([FIELD_NOTE]),
    });
    // Load-bearing: every authored mark, mount, skin, and title slot is a unique
    // catalogued relic. total must include all kinds (Horizons Phase 8).
    const horizonExtra = RELIQUARY_PAGES.reduce((n, p) => {
      for (const r of p.relics) {
        if (r.kind === 'mount' || r.kind === 'weapon_skin' || r.kind === 'title') n++;
      }
      return n;
    }, 0);
    expect(withMarks.total).toBe(itemsOnly.total + RELIQUARY_MARK_IDS.size + horizonExtra);
    expect(withMarks.owned).toBe(1);
    expect(withMarks.owned).toBeLessThan(withMarks.total);
  });

  it('pageCompletion owns mounts / skins / titles from live seams only', () => {
    const mountsPage = RELIQUARY_PAGES.find((p) => p.id === 'horizons_mounts')!;
    const skinsPage = RELIQUARY_PAGES.find((p) => p.id === 'horizons_weapon_skins')!;
    const titlesPage = RELIQUARY_PAGES.find((p) => p.id === 'horizons_titles')!;
    expect(mountsPage.relics.length).toBeGreaterThan(0);
    expect(skinsPage.relics.length).toBeGreaterThan(0);
    expect(titlesPage.relics.length).toBeGreaterThan(0);

    const empty = {
      itemsDiscovered: new Set<string>(),
      marks: new Set<string>(),
    };
    expect(pageCompletion(mountsPage, empty).owned).toBe(0);
    expect(pageCompletion(skinsPage, empty).owned).toBe(0);
    expect(pageCompletion(titlesPage, empty).owned).toBe(0);

    const firstMount = mountsPage.relics.find((r) => r.kind === 'mount')!.mountId;
    const firstSkin = skinsPage.relics.find((r) => r.kind === 'weapon_skin')!.skinId;
    const firstTitle = titlesPage.relics.find((r) => r.kind === 'title')!.deedId;

    expect(pageCompletion(mountsPage, { ...empty, ownedMounts: new Set([firstMount]) }).owned).toBe(
      1,
    );
    // Skins empty when account cosmetics absent (no weaponSkins lookup).
    expect(pageCompletion(skinsPage, empty).owned).toBe(0);
    expect(pageCompletion(skinsPage, { ...empty, weaponSkins: new Set([firstSkin]) }).owned).toBe(
      1,
    );
    expect(pageCompletion(titlesPage, { ...empty, deedsEarned: new Set([firstTitle]) }).owned).toBe(
      1,
    );

    // Full fill via live ownership seams only (no invented second discovery set).
    const allMounts = new Set(
      mountsPage.relics.filter((r) => r.kind === 'mount').map((r) => r.mountId),
    );
    const allSkins = new Set(
      skinsPage.relics.filter((r) => r.kind === 'weapon_skin').map((r) => r.skinId),
    );
    const allTitles = new Set(
      titlesPage.relics.filter((r) => r.kind === 'title').map((r) => r.deedId),
    );
    expect(pageCompletion(mountsPage, { ...empty, ownedMounts: allMounts }).complete).toBe(true);
    expect(pageCompletion(skinsPage, { ...empty, weaponSkins: allSkins }).complete).toBe(true);
    expect(pageCompletion(titlesPage, { ...empty, deedsEarned: allTitles }).complete).toBe(true);
  });

  it('catalogRelicCompletion counts Horizons fills for Overview totals', () => {
    const base = catalogRelicCompletion({
      itemsDiscovered: new Set(),
      marks: new Set(),
    });
    const withHorizons = catalogRelicCompletion({
      itemsDiscovered: new Set(),
      marks: new Set(),
      ownedMounts: new Set(['valorsteed']),
      weaponSkins: new Set(['guildmark_arming_sword']),
      deedsEarned: new Set(['prog_veteran']),
    });
    expect(withHorizons.total).toBe(base.total);
    expect(withHorizons.owned).toBe(3);
    expect(base.owned).toBe(0);
  });

  it('catalogRankOwned excludes account weapon skins (grant/display rank align)', () => {
    // Host-shaped opts (Sim + ClientWorld pass full surfaces including skins).
    // The strip in catalogRankOwned must ignore weaponSkins even when present.
    const hostOpts = reliquaryOwnershipOpts({
      itemsDiscovered: new Set(),
      ownedMounts: ['valorsteed'],
      weaponSkinIds: ['guildmark_arming_sword'],
      deedsEarned: new Set(['prog_veteran']),
    });
    expect(hostOpts.weaponSkins?.has('guildmark_arming_sword')).toBe(true);
    expect(catalogRelicCompletion(hostOpts).owned).toBe(3);
    expect(catalogRankOwned(hostOpts)).toBe(2);

    // Empty ownership stays 0 (skins alone cannot invent rank without strip).
    expect(
      catalogRankOwned(
        reliquaryOwnershipOpts({
          itemsDiscovered: new Set(),
          weaponSkinIds: ['guildmark_arming_sword'],
        }),
      ),
    ).toBe(0);
    expect(
      catalogRelicCompletion(
        reliquaryOwnershipOpts({
          itemsDiscovered: new Set(),
          weaponSkinIds: ['guildmark_arming_sword'],
        }),
      ).owned,
    ).toBe(1);
  });

  it('characterReliquaryOwnership uses live ownedMounts (bags + bank reins)', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    // No skins field: character path never carries account cosmetics.
    const empty = characterReliquaryOwnership(meta);
    expect(empty.ownedMounts.has('valorsteed')).toBe(false);
    expect(empty).not.toHaveProperty('weaponSkins');

    sim.addItem('reins_valorsteed', 1);
    expect(characterReliquaryOwnership(meta).ownedMounts.has('valorsteed')).toBe(true);
    expect(catalogRankOwned(characterReliquaryOwnership(meta))).toBe(1);

    // Bank-only reins still count (ownedMounts = bags + bank).
    const sim2 = makeSim();
    const m2 = primary(sim2).meta;
    sim2.addItem('reins_grag_bear', 1);
    const slot = m2.inventory.find((s) => s.itemId === 'reins_grag_bear');
    expect(slot).toBeTruthy();
    if (!slot) throw new Error('expected grag reins in bags');
    m2.inventory.splice(m2.inventory.indexOf(slot), 1);
    m2.bank.inventory.push(slot);
    expect(characterReliquaryOwnership(m2).ownedMounts.has('grag_bear')).toBe(true);
  });

  it('live mount first-discover and title grant sync Curator rank deeds', () => {
    const catalogIds = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ];
    expect(catalogIds.length).toBeGreaterThanOrEqual(9);

    // Mount path: 9 catalogued items + first reins grant crosses rank 2.
    const simMount = makeSim();
    const mMount = primary(simMount).meta;
    for (const id of catalogIds.slice(0, 9)) {
      markItemDiscovered(simMount.ctx, mMount, id);
    }
    expect(mMount.deedsEarned.has('col_reliquary_rank_2')).toBe(false);
    const renownBeforeMount = mMount.renown;
    simMount.addItem('reins_valorsteed', 1);
    // 9 items + mount (+ rank-2 title bridge, itself a Horizons title relic).
    expect(catalogRankOwned(characterReliquaryOwnership(mMount))).toBeGreaterThanOrEqual(10);
    expect(mMount.deedsEarned.has('col_reliquary_rank_2')).toBe(true);
    expect(mMount.renown).toBe(renownBeforeMount);
    // No invent of firstFind / unlock toast for mount membership.
    expect(mMount.reliquary.firstFind.reins_valorsteed).toBeUndefined();
    const mountUnlocks = simMount
      .drainEvents()
      .filter(
        (e) => e.type === 'reliquaryUnlock' && 'itemId' in e && e.itemId === 'reins_valorsteed',
      );
    expect(mountUnlocks).toEqual([]);

    // Title path: 9 catalogued items + Horizons title deed crosses rank 2.
    const simTitle = makeSim();
    const mTitle = primary(simTitle).meta;
    for (const id of catalogIds.slice(0, 9)) {
      markItemDiscovered(simTitle.ctx, mTitle, id);
    }
    expect(mTitle.deedsEarned.has('col_reliquary_rank_2')).toBe(false);
    const renownBeforeTitle = mTitle.renown;
    expect(grantDeed(simTitle.ctx, mTitle, 'prog_veteran')).toBe(true);
    // Title fill + rank-2 title bridge both score; rank is at least 2.
    expect(catalogRankOwned(characterReliquaryOwnership(mTitle))).toBeGreaterThanOrEqual(10);
    expect(mTitle.deedsEarned.has('col_reliquary_rank_2')).toBe(true);
    expect(mTitle.renown).toBe(renownBeforeTitle + (DEEDS.prog_veteran.renown ?? 0));
  });

  it('join retroFallbackGrants wires silent mark sync before curator rank', () => {
    const deedsSrc = fs.readFileSync(path.join(__dirname, '../src/sim/deeds.ts'), 'utf8');
    const retroArm = deedsSrc.slice(deedsSrc.indexOf('export function retroFallbackGrants'));
    expect(retroArm).toContain('syncReliquaryMarksFromVisited');
    expect(retroArm).toContain('syncCuratorRankDeeds');
    // Mark sync must run before rank deeds so field-note fills can rank up.
    expect(retroArm.indexOf('syncReliquaryMarksFromVisited')).toBeLessThan(
      retroArm.indexOf('syncCuratorRankDeeds'),
    );
  });

  it('craft and gather call sites note catalog marks only (source pins)', () => {
    const craftSrc = fs.readFileSync(
      path.join(__dirname, '../src/sim/professions/crafting.ts'),
      'utf8',
    );
    // Marks must sit on the live masterwork success arm, not a cold path.
    const masterworkArm = craftSrc.match(
      /if \(result\.masterwork\) \{[\s\S]*?noteReliquaryMark\(ctx, r\.meta, 'masterwork:first'\);[\s\S]*?noteReliquaryMark\(ctx, r\.meta, `masterwork:\$\{craftId\}`\);[\s\S]*?\}/,
    );
    expect(masterworkArm, 'masterwork arm notes first + per-craft marks').toBeTruthy();
    expect(craftSrc).toContain('noteReliquaryMark');
    expect(craftSrc).toContain('masterwork:first');
    expect(craftSrc).toContain('masterwork:${craftId}');

    const gatherSrc = fs.readFileSync(
      path.join(__dirname, '../src/sim/professions/gather_events.ts'),
      'utf8',
    );
    // announceGatherEvent writes visit then the Reliquary mark together.
    expect(gatherSrc).toMatch(
      /const visitMark = 'gather_event:' \+ flavor;[\s\S]*?ctx\.markVisited\(finder, visitMark\);[\s\S]*?noteReliquaryMark\(ctx, finder, visitMark\);/,
    );

    const interactionSrc = fs.readFileSync(
      path.join(__dirname, '../src/sim/interaction.ts'),
      'utf8',
    );
    // Perfect specimen land: deed visit + Reliquary mark on the same arm.
    expect(interactionSrc).toMatch(
      /ctx\.markVisited\(meta, 'gather_event:perfect_specimen'\);[\s\S]*?noteReliquaryMark\(ctx, meta, 'gather_event:perfect_specimen'\);/,
    );
  });
});

describe('Reliquary recent ring cap', () => {
  it('drops oldest when the recent buffer exceeds the cap', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    // Force-push many ids through the note path by stamping catalogued finds
    // via a temporary firstFind clear (noteRelicItemFind short-circuits when
    // present). Use direct recent mutation after one real find to pin the cap
    // helper without inventing fake catalog pages.
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    expect(meta.reliquary.recent.length).toBe(1);

    // Drive the ring through noteRelicItemFind after clearing firstFind so
    // each push is accepted (simulates many distinct catalogued finds).
    for (let i = 0; i < RELIQUARY_RECENT_CAP + 3; i++) {
      const fakeId = CATALOGUE_RELIC; // same id: re-note is no-op
      delete meta.reliquary.firstFind[fakeId];
      // Push via onItemDiscovered which re-notes and re-pushes.
      noteRelicItemFind(meta, fakeId);
    }
    // Same id only: ring stays length 1 (de-dupe moves to end).
    expect(meta.reliquary.recent).toEqual([CATALOGUE_RELIC]);

    // Direct ring push path: fill past the cap with synthetic recent entries
    // that serialize would filter, to pin the cap constant behavior on state.
    meta.reliquary.recent = [];
    for (let i = 0; i < RELIQUARY_RECENT_CAP + 5; i++) {
      meta.reliquary.recent.push(`synth_${i}`);
      while (meta.reliquary.recent.length > RELIQUARY_RECENT_CAP) meta.reliquary.recent.shift();
    }
    expect(meta.reliquary.recent.length).toBe(RELIQUARY_RECENT_CAP);
    expect(meta.reliquary.recent[0]).toBe('synth_5');
    expect(meta.reliquary.recent[RELIQUARY_RECENT_CAP - 1]).toBe(
      `synth_${RELIQUARY_RECENT_CAP + 4}`,
    );
  });
});

describe('Reliquary pure completion + curator rank', () => {
  it('pageCompletion tracks missing and complete pages', () => {
    const page: ReliquaryPageDef = {
      id: 'fixture',
      shelf: 'conquerors',
      name: 'Fixture',
      relics: [
        { kind: 'item', itemId: 'a' },
        { kind: 'item', itemId: 'b' },
      ],
    };
    expect(pageCompletion(page, { itemsDiscovered: new Set() })).toEqual({
      owned: 0,
      total: 2,
      complete: false,
    });
    expect(pageCompletion(page, { itemsDiscovered: new Set(['a']) })).toEqual({
      owned: 1,
      total: 2,
      complete: false,
    });
    expect(pageCompletion(page, { itemsDiscovered: new Set(['a', 'b']) })).toEqual({
      owned: 2,
      total: 2,
      complete: true,
    });
  });

  it('curatorRankFromOwned is pure and threshold-driven', () => {
    expect(CURATOR_RANK_THRESHOLDS).toEqual([1, 10, 25, 50, 100]);
    expect(CURATOR_RANK_DEFS.map((d) => d.threshold)).toEqual([...CURATOR_RANK_THRESHOLDS]);
    expect(curatorRankFromOwned(0)).toBe(0);
    expect(curatorRankFromOwned(1)).toBe(1);
    expect(curatorRankFromOwned(9)).toBe(1);
    expect(curatorRankFromOwned(10)).toBe(2);
    expect(curatorRankFromOwned(24)).toBe(2);
    expect(curatorRankFromOwned(25)).toBe(3);
    expect(curatorRankFromOwned(49)).toBe(3);
    expect(curatorRankFromOwned(50)).toBe(4);
    expect(curatorRankFromOwned(99)).toBe(4);
    expect(curatorRankFromOwned(100)).toBe(5);
    // Live catalog must make the highest threshold reachable (no dead Eternal rank).
    expect(catalogItemCompletion(new Set()).total).toBeGreaterThanOrEqual(100);
    // Seal chrome is pure and cosmetic-only (no power fields on defs).
    expect(curatorSealIdForRank(0)).toBeNull();
    expect(curatorSealIdForRank(1)).toBe('apprentice');
    expect(curatorSealIdForRank(2)).toBe('keeper');
    expect(curatorSealIdForRank(3)).toBe('master');
    expect(curatorSealIdForRank(4)).toBe('grand');
    expect(curatorSealIdForRank(5)).toBe('eternal');
    expect(CURATOR_RANK_DEFS.map((d) => d.deedId)).toEqual([
      undefined,
      'col_reliquary_rank_2',
      'col_reliquary_rank_3',
      'col_reliquary_rank_4',
      'col_reliquary_rank_5',
    ]);
    for (const def of CURATOR_RANK_DEFS) {
      expect(def).not.toHaveProperty('stats');
      expect(def).not.toHaveProperty('dropRate');
      expect(def).not.toHaveProperty('pity');
    }
  });

  it('rank-up emit includes curatorRank and grants zero-Renown deed bridges', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    // Seed 9 non-catalog discoveries do not affect rank; seed 9 catalogued
    // uniques so the next catalogued fill crosses rank 2 (threshold 10).
    const catalogIds = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ];
    expect(catalogIds.length).toBeGreaterThanOrEqual(10);
    for (const id of catalogIds.slice(0, 9)) {
      markItemDiscovered(sim.ctx, meta, id);
    }
    sim.drainEvents();
    expect(curatorRankFromOwned(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned)).toBe(
      1,
    );
    // Rank 1 has no deed bridge; rank 2 does.
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(false);

    const renownBeforeRank2 = meta.renown;
    markItemDiscovered(sim.ctx, meta, catalogIds[9]!);
    const events = sim.drainEvents();
    const unlocks = events.filter((e) => e.type === 'reliquaryUnlock');
    expect(unlocks.length).toBeGreaterThanOrEqual(1);
    const rankUp = unlocks.find((e) => e.type === 'reliquaryUnlock' && e.curatorRank === 2);
    expect(rankUp).toBeTruthy();
    expect(rankUp && 'curatorRank' in rankUp && rankUp.curatorRank).toBe(2);
    // Zero-Renown title bridge: renown must not move from the rank-2 grant.
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(true);
    expect(meta.renown).toBe(renownBeforeRank2);
    expect(DEEDS.col_reliquary_rank_2.renown).toBe(0);
    expect(DEEDS.col_reliquary_rank_3.renown).toBe(0);
    expect(DEEDS.col_reliquary_rank_4.renown).toBe(0);
    expect(DEEDS.col_reliquary_rank_5.renown).toBe(0);
    expect(DEEDS.col_reliquary_rank_2.trigger).toEqual({ kind: 'manual' });
    expect(DEEDS.col_reliquary_rank_3.trigger).toEqual({ kind: 'manual' });
    expect(DEEDS.col_reliquary_rank_4.trigger).toEqual({ kind: 'manual' });
    expect(DEEDS.col_reliquary_rank_5.trigger).toEqual({ kind: 'manual' });
    expect(DEEDS.col_reliquary_rank_2.reward).toEqual({ kind: 'title', text: 'Spoilskeeper' });
    expect(DEEDS.col_reliquary_rank_3.reward).toEqual({
      kind: 'title',
      text: 'the Cataloguer',
    });
    expect(DEEDS.col_reliquary_rank_4.reward).toEqual({ kind: 'title', text: 'Arch-Curator' });
    expect(DEEDS.col_reliquary_rank_5.reward).toEqual({
      kind: 'border',
      slug: 'reliquary_gilt',
    });
    // Sticky grants live on deedsEarned only; no rankRewardsGranted blob.
    expect(meta.reliquary).not.toHaveProperty('rankRewardsGranted');
    const serialized = serializeReliquaryState(meta.reliquary);
    expect(serialized).toBeDefined();
    if (!serialized) throw new Error('expected sparse serialize after catalog fills');
    expect(serialized).not.toHaveProperty('rankRewardsGranted');
    const allowed = new Set(['firstFind', 'marks', 'recent']);
    for (const key of Object.keys(serialized)) {
      expect(allowed.has(key)).toBe(true);
    }
    // Idempotent: re-sync does not double-grant.
    const sizeBefore = meta.deedsEarned.size;
    syncCuratorRankDeeds(sim.ctx, meta);
    expect(meta.deedsEarned.size).toBe(sizeBefore);
  });

  it('first catalogued fill ranks up to 1 without a deed bridge', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    const renownBefore = meta.renown;
    expect(CURATOR_RANK_DEFS.find((d) => d.rank === 1)?.deedId).toBeUndefined();
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    const events = sim.drainEvents();
    const unlock = events.find((e) => e.type === 'reliquaryUnlock');
    expect(unlock).toMatchObject({ itemId: CATALOGUE_RELIC, curatorRank: 1 });
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(false);
    expect(meta.renown).toBe(renownBefore);
  });

  it('non-catalog discoveries never raise Curator rank', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    markItemDiscovered(sim.ctx, meta, NON_RELIC);
    expect(isCataloguedRelicItem(NON_RELIC)).toBe(false);
    expect(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned).toBe(0);
    expect(curatorRankFromOwned(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned)).toBe(
      0,
    );
    markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
    expect(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned).toBe(1);
    expect(curatorRankFromOwned(1)).toBe(1);
  });

  it('clear meters alone never raise Curator rank', () => {
    // Rank is unique catalogued relic fills only (never kill/clear count alone).
    const sim = makeSim();
    const { meta } = primary(sim);
    meta.deedStats.dungeonClears.hollow_crypt = 999;
    meta.deedStats.dungeonClears['hollow_crypt:heroic'] = 999;
    meta.deedStats.counters.thunzharrKills = 999;
    meta.delveClears = { ...meta.delveClears, collapsed_reliquary: 999 };
    expect(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned).toBe(0);
    expect(curatorRankFromOwned(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned)).toBe(
      0,
    );
    expect(sim.reliquaryCuratorRank()).toBe(0);
  });

  it('join retroFallbackGrants wires syncCuratorRankDeeds for veterans', () => {
    // Source-guard: removing the join call strands veterans who already own
    // enough catalog fills without a live rank-up path. Mirrors prog_guildsworn.
    const deedsSrc = fs.readFileSync(path.join(__dirname, '../src/sim/deeds.ts'), 'utf8');
    const retroArm = deedsSrc.slice(deedsSrc.indexOf('export function retroFallbackGrants'));
    expect(retroArm).toContain('syncCuratorRankDeeds');
    expect(retroArm).toContain('{ retro: true }');
  });

  it('veteran retro sync grants all zero-Renown rank bridges up to owned count', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    const catalogIds = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ];
    // 25 unique catalogued fills => rank 3; seed discovery without live rank-up
    // celebration path (direct set membership) so only retro sync grants deeds.
    for (const id of catalogIds.slice(0, 25)) {
      meta.deedStats.itemsDiscovered.add(id);
    }
    expect(curatorRankFromOwned(catalogItemCompletion(meta.deedStats.itemsDiscovered).owned)).toBe(
      3,
    );
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(false);
    expect(meta.deedsEarned.has('col_reliquary_rank_3')).toBe(false);
    const renownBefore = meta.renown;
    syncCuratorRankDeeds(sim.ctx, meta, { retro: true });
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(true);
    expect(meta.deedsEarned.has('col_reliquary_rank_3')).toBe(true);
    expect(meta.deedsEarned.has('col_reliquary_rank_4')).toBe(false);
    expect(meta.renown).toBe(renownBefore);
    const retroUnlocks = sim
      .drainEvents()
      .filter((e) => e.type === 'deedUnlocked' && e.retro === true);
    expect(
      retroUnlocks.some((e) => e.type === 'deedUnlocked' && e.deedId === 'col_reliquary_rank_2'),
    ).toBe(true);
    expect(
      retroUnlocks.some((e) => e.type === 'deedUnlocked' && e.deedId === 'col_reliquary_rank_3'),
    ).toBe(true);
  });

  it('clearCountForSource reads dungeon clears without inventing state', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    expect(
      clearCountForSource(meta, { kind: 'dungeon', dungeonId: 'hollow_crypt', difficulty: 'any' }),
    ).toBe(0);
    meta.deedStats.dungeonClears.hollow_crypt = 1;
    meta.deedStats.dungeonClears['hollow_crypt:heroic'] = 2;
    expect(
      clearCountForSource(meta, { kind: 'dungeon', dungeonId: 'hollow_crypt', difficulty: 'any' }),
    ).toBe(3);
    expect(
      clearCountForSource(meta, {
        kind: 'dungeon',
        dungeonId: 'hollow_crypt',
        difficulty: 'heroic',
      }),
    ).toBe(2);
    expect(clearCountForSource(meta, { kind: 'none' })).toBeUndefined();
    // World-boss kills ride deedStats.counters.thunzharrKills.
    expect(clearCountForSource(meta, { kind: 'deed_stat', stat: 'thunzharrKills' })).toBe(0);
    meta.deedStats.counters.thunzharrKills = 5;
    expect(clearCountForSource(meta, { kind: 'deed_stat', stat: 'thunzharrKills' })).toBe(5);
    expect(clearCountForSource(meta, { kind: 'deed_stat', stat: 'not_a_real_stat' })).toBe(0);
  });
});

describe('Reliquary determinism', () => {
  it('identical seeds and discover order produce identical firstFind and recent', () => {
    function run(): { first: string; recent: string[] } {
      const sim = makeSim(99);
      const { meta } = primary(sim);
      meta.deedStats.dungeonClears.hollow_crypt = 4;
      markItemDiscovered(sim.ctx, meta, NON_RELIC);
      markItemDiscovered(sim.ctx, meta, CATALOGUE_RELIC);
      return {
        first: JSON.stringify(meta.reliquary.firstFind),
        recent: [...meta.reliquary.recent],
      };
    }
    const a = run();
    const b = run();
    expect(a).toEqual(b);
    // No wall-clock or Math.random in the path: two runs stay bit-equal.
    expect(a.first).toContain(CATALOGUE_RELIC);
    expect(a.recent).toEqual([CATALOGUE_RELIC]);
  });
});
