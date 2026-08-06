// Reliquary Phase 1 foundation: sparse state, mark hooks, serialize omit-empty,
// pure completion helpers. No UI / wire coverage here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import { recipeById } from '../src/sim/content/recipes';
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
  catalogCharacterCompletion,
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
  RELIQUARY_ITEM_TO_PAGES,
  RELIQUARY_PAGES_BY_ID,
  RELIQUARY_RECENT_CAP,
  reliquaryOwnershipOpts,
  restoreReliquaryState,
  serializeReliquaryState,
  syncCuratorRankDeeds,
  syncReliquaryMarksFromVisited,
} from '../src/sim/reliquary';
import { type CharacterState, Sim } from '../src/sim/sim';
import { runCraft } from './helpers/enchant_family_cast';

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

  it('restore sanitizes clears and pageId per FIELD on catalogued entries', () => {
    // Every id here is catalogued, so the field guards are actually reached
    // (an uncatalogued id is dropped before either filter runs). Snug floor:
    // the slice must fill all six fixtures.
    const ids = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ].slice(0, 6);
    expect(ids.length).toBe(6);
    const [negative, infinite, notANumber, fractional, bogusPage, foreignPage] = ids;
    const validPageId = RELIQUARY_ITEM_TO_PAGES.get(negative)![0];
    // A real page that never lists foreignPage: acceptance must be
    // RELIQUARY_PAGES_BY_ID membership only, not an item-to-page relation.
    const unrelatedPageId = 'horizons_titles';
    expect(RELIQUARY_PAGES_BY_ID[unrelatedPageId]).toBeDefined();
    expect(RELIQUARY_ITEM_TO_PAGES.get(foreignPage)).not.toContain(unrelatedPageId);

    const restored = restoreReliquaryState({
      firstFind: {
        [negative]: { clears: -3, pageId: validPageId },
        [infinite]: { clears: Number.POSITIVE_INFINITY },
        [notANumber]: { clears: Number.NaN },
        [fractional]: { clears: 2.7 },
        [bogusPage]: { pageId: 'nope' },
        [foreignPage]: { pageId: unrelatedPageId },
      },
    });

    // Every catalogued ENTRY survives; only the offending field is dropped.
    expect(Object.keys(restored.firstFind).sort()).toEqual([...ids].sort());
    // Negative clears are dropped outright (absent key, never clamped to 0),
    // while the valid pageId on the same entry still lands.
    expect(Object.hasOwn(restored.firstFind[negative], 'clears')).toBe(false);
    expect(restored.firstFind[negative].pageId).toBe(validPageId);
    // Non-finite clears (Infinity, NaN) are dropped the same way.
    expect(Object.hasOwn(restored.firstFind[infinite], 'clears')).toBe(false);
    expect(Object.hasOwn(restored.firstFind[notANumber], 'clears')).toBe(false);
    // Fractional clears floor (2.7 lands as 2), matching the live stamp path.
    expect(restored.firstFind[fractional]).toEqual({ clears: 2 });
    // A pageId outside RELIQUARY_PAGES_BY_ID is dropped; the entry survives.
    expect(Object.hasOwn(restored.firstFind[bogusPage], 'pageId')).toBe(false);
    // Membership is the WHOLE rule: a real page that never lists the item is
    // kept (diagnostic field; restore does not re-derive the relation).
    expect(restored.firstFind[foreignPage].pageId).toBe(unrelatedPageId);
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

  it('syncReliquaryMarksFromVisited retro-fills every catalog mark on the visit ledger', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    meta.deedStats.visited.add(FIELD_NOTE);
    meta.deedStats.visited.add('gather_event:moonlit_bloom');
    // Masterwork marks now retro-fill too: the live proc arm in crafting.ts
    // stamps the visit ledger beside the mark, so the visit is PROOF the proc
    // happened. A sparse blob that lost the mark heals from that history
    // instead of stranding a lifetime trophy; nothing is invented, because
    // only a real proc ever writes the visit.
    meta.deedStats.visited.add(MASTERWORK_FIRST);
    meta.deedStats.visited.add('masterwork:weaponcrafting');
    meta.deedStats.visited.add('gather:eastbrook:ore'); // not a Reliquary mark
    const added = syncReliquaryMarksFromVisited(meta);
    expect(added).toBe(4);
    expect(meta.reliquary.marks.has(FIELD_NOTE)).toBe(true);
    expect(meta.reliquary.marks.has('gather_event:moonlit_bloom')).toBe(true);
    expect(meta.reliquary.marks.has(MASTERWORK_FIRST)).toBe(true);
    expect(meta.reliquary.marks.has('masterwork:weaponcrafting')).toBe(true);
    // A visited id outside the catalog is still refused.
    expect(meta.reliquary.marks.has('gather:eastbrook:ore')).toBe(false);
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

  it('catalogCharacterCompletion excludes skin slots from both sides of the pair', () => {
    const items = new Set<string>(['cryptbone_helm']);
    const char = catalogCharacterCompletion({ itemsDiscovered: items });
    const full = catalogRelicCompletion({ itemsDiscovered: items });
    // Exact skin-slot delta: every unique weapon_skin relic is out of total.
    const skinSlots = new Set<string>();
    for (const page of RELIQUARY_PAGES) {
      for (const relic of page.relics) {
        if (relic.kind === 'weapon_skin') skinSlots.add(relic.skinId);
      }
    }
    expect(skinSlots.size).toBeGreaterThan(0);
    expect(char.total).toBe(full.total - skinSlots.size);
    expect(char.owned).toBe(1);
    // Host-shaped skins present must not raise owned or total.
    const withSkins = catalogCharacterCompletion(
      reliquaryOwnershipOpts({
        itemsDiscovered: items,
        weaponSkinIds: [...skinSlots],
      }),
    );
    // catalogCharacterCompletion ignores weaponSkins even if smuggled via opts shape:
    // it only accepts character-durable fields; re-call with skins only via full.
    expect(withSkins.owned).toBe(1);
    expect(withSkins.total).toBe(char.total);
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

  it('a live masterwork proc writes masterwork:first and the per-craft mark (real craft path)', () => {
    // Seed 151: the recorded signed-reagent hunt window shared with
    // tests/professions_masterwork.test.ts (bounded scan from seed 1; the
    // single output-side proc draw lands in [0.03, 0.05), so one self-signed
    // reagent's 2 percent term lifts the vestments roll to 0.05 and the
    // craft procs deterministically). Re-hunt there and re-record here
    // together whenever a content commit shifts the construction-time draw
    // sequence; spares on record: 186, 241, 259, and 287.
    const SEED = 151;
    // Premise anchors from live content: the derived per-craft id this
    // recipe produces, and its catalog membership (an uncatalogued id can
    // never land in marks, so the derived-arm assertions below would be
    // vacuous without it).
    expect(recipeById('recipe_eastbrook_ritual_vestments')!.professionId).toBe('tailoring');
    expect(RELIQUARY_MARK_IDS.has('masterwork:tailoring')).toBe(true);

    const sim = makeSim(SEED);
    const { meta } = primary(sim);
    const pid = sim.playerId;
    sim.addItemInstance('linen_scrap', { signer: meta.name }, pid);
    sim.addItem('linen_scrap', 1, pid);
    sim.addItem('spider_leg', 1, pid);
    sim.addItem('homespun_cloth', 3, pid);
    sim.addItem('spool_of_thread', 5, pid);
    expect(meta.reliquary.marks.size).toBe(0);
    runCraft(sim, 'recipe_eastbrook_ritual_vestments', false, pid);
    expect(sim.lastCraftResult?.ok).toBe(true);
    // The hunted window held: the proc fired (a draw-order shift that
    // collapses the window fails HERE, not in the mark assertions below).
    expect(sim.lastCraftResult?.masterwork).toBe(true);
    // Both marks land through the live write path (nothing here hand-sets
    // reliquary state): the ungated first-proc trophy and the catalog-gated
    // per-craft one, in production write order on the recent ring.
    expect([...meta.reliquary.marks].sort()).toEqual([MASTERWORK_FIRST, 'masterwork:tailoring']);
    expect(meta.reliquary.recent).toEqual([MASTERWORK_FIRST, 'masterwork:tailoring']);
    // The visit ledger rides beside each mark on the same proc arm (the
    // durable proof the proc happened; join-time retro-fill reads it).
    expect(meta.deedStats.visited.has(MASTERWORK_FIRST)).toBe(true);
    expect(meta.deedStats.visited.has('masterwork:tailoring')).toBe(true);

    // Control at the SAME seed and stream position, no signed copy held: the
    // identical draw sits above the 3 percent base and misses, and a miss
    // writes NO mark or visit, so the writes provably sit on the proc arm,
    // not on every successful craft.
    const control = makeSim(SEED);
    const mControl = primary(control).meta;
    const cid = control.playerId;
    for (let i = 0; i < 3; i++) control.addItem('linen_scrap', 1, cid);
    control.addItem('spider_leg', 1, cid);
    control.addItem('homespun_cloth', 3, cid);
    control.addItem('spool_of_thread', 5, cid);
    runCraft(control, 'recipe_eastbrook_ritual_vestments', false, cid);
    expect(control.lastCraftResult?.ok).toBe(true);
    expect(control.lastCraftResult?.masterwork).toBeUndefined();
    expect(mControl.reliquary.marks.size).toBe(0);
    expect(mControl.deedStats.visited.has(MASTERWORK_FIRST)).toBe(false);
    expect(mControl.deedStats.visited.has('masterwork:tailoring')).toBe(false);
  });

  it('craft and gather call sites note catalog marks only (source pins)', () => {
    // Full-line // comments are stripped so a line-commented arm cannot
    // satisfy the literal-order pin (a /* */ block or a trailing comment
    // still could). The behavioral proc test above drives the REAL craft
    // path, so the writes and their proc-arm placement are pinned by
    // behavior (the parity golden professions_craft.json backstops them
    // too, embedding the masterwork visited ids in pinned state hashes).
    // The load this regex still carries is the isCataloguedRelicMark gate
    // on the derived visit write, which no behavioral case can reach while
    // every masterwork-capable craft has an authored mark (only equippable
    // outputs can proc, and all four shipping professions with equippable
    // recipes sit in RELIQUARY_PROFESSION_MARKS.masterworkByCraft).
    const craftSrc = fs
      .readFileSync(path.join(__dirname, '../src/sim/professions/crafting.ts'), 'utf8')
      .split('\n')
      .filter((line) => !/^\s*\/\//.test(line))
      .join('\n');
    // Marks must sit on the live masterwork success arm (applyCraftSuccessHooks
    // after craft-cast), not a cold path. meta is the cast-complete hook param
    // (was r.meta when craftItem still resolved instantly). The visit write
    // rides beside each mark (the gather_events and interaction arms below use
    // the same idiom): the per-craft one is CATALOG-GATED, since a craft with
    // no authored mark must not write ledger noise nothing can read back.
    const masterworkArm = craftSrc.match(
      /if \(result\.masterwork\) \{[\s\S]*?ctx\.markVisited\(meta, 'masterwork:first'\);[\s\S]*?noteReliquaryMark\(ctx, meta, 'masterwork:first'\);[\s\S]*?const markId = `masterwork:\$\{craftId\}`;[\s\S]*?if \(isCataloguedRelicMark\(markId\)\) ctx\.markVisited\(meta, markId\);[\s\S]*?noteReliquaryMark\(ctx, meta, markId\);[\s\S]*?\}/,
    );
    expect(masterworkArm, 'masterwork arm visits + notes first and per-craft marks').toBeTruthy();
    expect(craftSrc).toContain('noteReliquaryMark');
    expect(craftSrc).toContain('masterwork:first');
    expect(craftSrc).toContain('masterwork:${craftId}');

    const gatherSrc = fs.readFileSync(
      path.join(__dirname, '../src/sim/professions/gather_events.ts'),
      'utf8',
    );
    // announceGatherEvent writes visit then the Reliquary mark together.
    expect(gatherSrc).toMatch(
      /const visitMark = `gather_event:\$\{flavor\}`;[\s\S]*?ctx\.markVisited\(finder, visitMark\);[\s\S]*?noteReliquaryMark\(ctx, finder, visitMark\);/,
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
  it('drops the oldest finds once distinct catalogued finds exceed the cap', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    // Literal: the shipped ring cap is 12; a drifted constant must fail here
    // instead of silently re-deriving every expectation below.
    expect(RELIQUARY_RECENT_CAP).toBe(12);

    // Distinct catalogued item ids straight from the live catalog, so content
    // churn cannot rot the fixture. Snug floor: the slice must actually fill.
    const ids = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ].slice(0, RELIQUARY_RECENT_CAP + 3);
    expect(ids.length).toBe(RELIQUARY_RECENT_CAP + 3);

    // The REAL write path (markItemDiscovered's hook), one find per id.
    for (const id of ids) {
      expect(noteRelicItemFind(meta, id)).toBe(true);
    }

    // Exactly the cap survives: the oldest three finds are evicted, relative
    // order is preserved, and the newest find sits at the tail.
    expect(meta.reliquary.recent.length).toBe(RELIQUARY_RECENT_CAP);
    expect(meta.reliquary.recent).toEqual(ids.slice(3));
    for (const evicted of ids.slice(0, 3)) {
      expect(meta.reliquary.recent).not.toContain(evicted);
    }
    expect(meta.reliquary.recent.at(-1)).toBe(ids.at(-1));
  });

  // The ring pushes at the tail and drops the head, so index 0 is the OLDEST
  // entry. A refresh guard written against index 0 refuses to move the oldest
  // id and instead leaves the ring in an order the window then paints wrong.
  // Reaching the refresh from a LIVE caller takes a desynced blob (both call
  // sites early-return when the find or mark is already held, so a re-push
  // needs recent to hold an id whose firstFind entry is absent: a hand-edited
  // or legacy save); the guard exists so pushRecent and restore agree on one
  // semantic regardless of how the ring got its contents.
  it('re-noting refreshes mid-ring AND oldest entries, and leaves the newest alone', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    const ids = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ].slice(0, 3);
    const [a, b, c] = ids;
    // noteRelicItemFind is the public write seam; it short-circuits on an
    // existing firstFind entry, so a re-find clears that entry first (the
    // sibling cap test above drives the ring the same way).
    const reNote = (id: string) => {
      delete meta.reliquary.firstFind[id];
      noteRelicItemFind(meta, id);
    };
    for (const id of ids) noteRelicItemFind(meta, id);
    expect(meta.reliquary.recent).toEqual([a, b, c]);

    reNote(b); // mid-ring
    expect(meta.reliquary.recent).toEqual([a, c, b]);

    reNote(a); // the OLDEST entry: the index-0 guard used to drop this move
    expect(meta.reliquary.recent).toEqual([c, b, a]);

    reNote(a); // already newest: nothing moves
    expect(meta.reliquary.recent).toEqual([c, b, a]);
  });

  it('restore de-dupes the recent ring on pushRecent semantics (last wins, newest survive)', () => {
    const ids = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ];
    const [a, b, c] = ids;
    // A blob that repeats an id must not burn two of the twelve slots: the
    // live ring holds each id exactly once. Which occurrence survives is not
    // a free choice: pushRecent moves a repeat to the TAIL, so the LAST
    // occurrence is the one that carries the id's real recency.
    expect(restoreReliquaryState({ recent: [a, b, a, c, b] }).recent).toEqual([a, c, b]);

    // Over the cap, the NEWEST survivors are kept (the head is the oldest end,
    // exactly what pushRecent's shift drops). Interleaved duplicates so the
    // de-dupe and the truncation are both load-bearing: a first-occurrence
    // de-dupe would keep the same set but a head-side cut would return
    // many.slice(0, CAP) instead.
    const many = ids.slice(0, RELIQUARY_RECENT_CAP + 4);
    expect(many.length, 'the catalog must supply more item ids than the cap').toBe(
      RELIQUARY_RECENT_CAP + 4,
    );
    expect(restoreReliquaryState({ recent: many.flatMap((id) => [id, id]) }).recent).toEqual(
      many.slice(-RELIQUARY_RECENT_CAP),
    );
  });

  it('restore truncates an over-cap all-distinct recent blob to the newest cap entries', () => {
    const ids = [
      ...new Set(
        RELIQUARY_PAGES.flatMap((p) =>
          p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
        ),
      ),
    ];
    const many = ids.slice(0, RELIQUARY_RECENT_CAP + 3);
    expect(many.length, 'the catalog must supply more item ids than the cap').toBe(
      RELIQUARY_RECENT_CAP + 3,
    );
    // No duplicates in the blob, so this pins the truncation arm alone: the
    // restore walk is newest-first and stops at the cap, which keeps the
    // NEWEST twelve (the head, the oldest side, is what gets cut) in their
    // original relative order.
    expect(restoreReliquaryState({ recent: many }).recent).toEqual(
      many.slice(-RELIQUARY_RECENT_CAP),
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
    // Exactly one: emitReliquaryUnlock fires once per fill, and the rank-up
    // rides the same event via curatorRank rather than a second emit.
    expect(unlocks.length).toBe(1);
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

  it('delve pages read floored delveClears through the public page readout', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    // Live content pin: the page really rides the delve arm.
    expect(RELIQUARY_PAGES_BY_ID.conquerors_collapsed_reliquary?.clearSource).toEqual({
      kind: 'delve',
      delveId: 'collapsed_reliquary',
    });
    expect(sim.reliquaryPageClearCount('conquerors_collapsed_reliquary')).toBe(0);
    meta.delveClears.collapsed_reliquary = 7.9;
    expect(sim.reliquaryPageClearCount('conquerors_collapsed_reliquary')).toBe(7);
  });

  it('a heroic-only dungeonClears key never leaks into the normal page readout', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    expect(RELIQUARY_PAGES_BY_ID.conquerors_hollow_crypt?.clearSource).toEqual({
      kind: 'dungeon',
      dungeonId: 'hollow_crypt',
      difficulty: 'normal',
    });
    // ONLY the heroic key exists; the bare normal key stays absent.
    meta.deedStats.dungeonClears['hollow_crypt:heroic'] = 4;
    expect(meta.deedStats.dungeonClears.hollow_crypt).toBeUndefined();
    expect(sim.reliquaryPageClearCount('conquerors_hollow_crypt')).toBe(0);
    // The heroic page still reads the same key, so the zero above is the
    // difficulty filter at work, never a dead key.
    expect(sim.reliquaryPageClearCount('conquerors_hollow_crypt_heroic')).toBe(4);
  });

  it('illumination scans past an incomplete first page to the completing page', () => {
    const sim = makeSim();
    const { meta } = primary(sim);
    // deathlord_warplate sits on two pages and table order puts the (large)
    // Gravewyrm Sanctum page BEFORE the four-slot set page, so the set page
    // can complete while the first pageIds entry stays incomplete.
    const ITEM = 'deathlord_warplate';
    const COMPLETING_PAGE = 'conquerors_set_deathlord';
    const pageIds = RELIQUARY_ITEM_TO_PAGES.get(ITEM);
    expect(pageIds, 'the set member must stay catalogued').toBeDefined();
    const completingIdx = pageIds!.indexOf(COMPLETING_PAGE);
    expect(completingIdx, 'the completing page must not be first in pageIds').toBeGreaterThan(0);
    const setPage = RELIQUARY_PAGES_BY_ID[COMPLETING_PAGE];

    // Own every OTHER set member first, through the real discover path.
    for (const relic of setPage.relics) {
      if (relic.kind === 'item' && relic.itemId !== ITEM) {
        markItemDiscovered(sim.ctx, meta, relic.itemId);
      }
    }
    sim.drainEvents();

    markItemDiscovered(sim.ctx, meta, ITEM);
    // The fill completes ONLY the set page: every pageIds entry ahead of it
    // stays incomplete, so the emit has to scan past them.
    const ownership = characterReliquaryOwnership(meta);
    for (const pageId of pageIds!.slice(0, completingIdx)) {
      expect(
        pageCompletion(RELIQUARY_PAGES_BY_ID[pageId], ownership).complete,
        `${pageId} must stay incomplete for the scan to matter`,
      ).toBe(false);
    }
    expect(pageCompletion(setPage, ownership).complete).toBe(true);

    const unlock = sim.drainEvents().find((e) => e.type === 'reliquaryUnlock' && e.itemId === ITEM);
    expect(unlock).toBeDefined();
    expect(unlock && unlock.type === 'reliquaryUnlock' && unlock.illuminatedPageId).toBe(
      COMPLETING_PAGE,
    );
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

// The join seed drives real Sim.addPlayer with a veteran-shaped save: relics
// HELD in bags and bank, discovery ledger predating them. Behavioral on
// purpose, replacing the two source scrapes that only proved retroFallbackGrants
// mentioned the right function names.
describe('Reliquary join seed is silent, flagged, and provenance-honest', () => {
  const catalogItemIds = [
    ...new Set(
      RELIQUARY_PAGES.flatMap((p) =>
        p.relics.filter((r) => r.kind === 'item').map((r) => r.itemId),
      ),
    ),
  ];
  // Twelve fills clear the rank-2 threshold, so the join also has to produce
  // rank-bridge deeds; without that the retro deed assertion would be vacuous.
  const SEEDED = catalogItemIds.slice(0, 12);

  /** A real save, then desynced the way a pre-rollout character reads. */
  function veteranState(): CharacterState {
    const donor = makeSim();
    const state = donor.serializeCharacter(donor.playerId)!;
    return {
      ...state,
      inventory: SEEDED.slice(0, 8).map((itemId) => ({ itemId, count: 1 })),
      bank: {
        inventory: SEEDED.slice(8).map((itemId) => ({ itemId, count: 1 })),
        purchasedSlots: 0,
        bonusSlots: 0,
      },
      // The whole point of the fixture: the ledger has not heard of them.
      deedStats: undefined,
      reliquary: undefined,
    };
  }

  it('seeds held relics with retro events, an untouched recent ring, and no invented clears', () => {
    const sim = makeSim();
    sim.drainEvents(); // discard the host sim's own join events
    const pid = sim.addPlayer('warrior', 'Veteran', { state: veteranState() });
    const meta = sim.players.get(pid)!;
    const events = sim.drainEvents().filter((e) => e.pid === pid);

    const unlocks = events.filter((e) => e.type === 'reliquaryUnlock');
    // Exact, not a floor: the seed fires once per held relic and the base
    // character contributes no catalogued relic of its own, so a stray extra
    // unlock (a double-walk of a container, say) has to red here.
    expect(unlocks.length).toBe(SEEDED.length);
    for (const ev of unlocks) {
      expect(ev.type === 'reliquaryUnlock' && ev.retro).toBe(true);
    }
    const rankBridges = events.filter(
      (e) => e.type === 'deedUnlocked' && e.deedId.startsWith('col_reliquary_rank_'),
    );
    // Twelve fills reach rank 2 and no further, and rank 1 has no bridge deed,
    // so exactly one bridge is correct; more would mean a threshold moved.
    expect(rankBridges.length).toBe(1);
    for (const ev of rankBridges) {
      expect(ev.type === 'deedUnlocked' && ev.retro).toBe(true);
    }

    // Silent: logging in is not a find moment.
    expect(meta.reliquary.recent).toEqual([]);
    // Provenance is never fabricated: today's clear count is not the count at
    // the real first obtain, so the key is absent entirely (not zero).
    const seededEntries = Object.entries(meta.reliquary.firstFind);
    expect(seededEntries.length).toBe(SEEDED.length);
    for (const [itemId, entry] of seededEntries) {
      expect(Object.hasOwn(entry, 'clears'), `${itemId} must carry no clears`).toBe(false);
    }
    // The serialized blob stays honest too (no clears key round-trips out).
    // Count first: an empty firstFind would pass the loop vacuously.
    const saved = sim.serializeCharacter(pid)!;
    expect(Object.keys(saved.reliquary?.firstFind ?? {}).length).toBe(SEEDED.length);
    for (const [itemId, entry] of Object.entries(saved.reliquary?.firstFind ?? {})) {
      // hasOwn, not toBeUndefined: an explicit `clears: undefined` key would
      // survive the round trip and still read as undefined.
      expect(Object.hasOwn(entry, 'clears'), `saved ${itemId} must carry no clears`).toBe(false);
    }
    // And the full round trip: reload the save into a fresh sim and prove the
    // sparse entries stay sparse (restore must not synthesize a clears key).
    // The ledger already holds the ids, so the reload seeds nothing new.
    const reloaded = new Sim({ seed: 43, playerClass: 'warrior', autoEquip: false });
    const rid = reloaded.addPlayer('warrior', 'reloaded', { state: saved });
    const rentries = Object.entries(reloaded.meta(rid)!.reliquary.firstFind);
    expect(rentries.length).toBe(SEEDED.length);
    for (const [itemId, entry] of rentries) {
      expect(Object.hasOwn(entry, 'clears'), `reloaded ${itemId} must carry no clears`).toBe(false);
    }
    // "Seeds nothing new" asserted directly, not inferred from counts: a
    // re-login must not re-emit the retro batch (that is one spurious
    // catch-up line per relog). The itemsDiscovered short-circuit makes the
    // seed idempotent, and this pins it at the event surface.
    expect(
      reloaded.drainEvents().filter((e) => e.pid === rid && e.type === 'reliquaryUnlock'),
    ).toEqual([]);
  });

  it('refills marks from the visit ledger BEFORE scoring rank, so mark fills can rank up', () => {
    // Ordering guard with teeth: syncReliquaryMarksFromVisited has to run
    // ahead of the rank sync, or these marks score zero and the veteran is
    // stranded below the bridge they already earned.
    const catalogMarks = [...RELIQUARY_MARK_IDS];
    expect(catalogMarks.length).toBeGreaterThanOrEqual(CURATOR_RANK_DEFS[1].threshold);
    const donor = makeSim();
    const base = donor.serializeCharacter(donor.playerId)!;
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Fieldhand', {
      state: { ...base, deedStats: { visited: catalogMarks }, reliquary: undefined },
    });
    const meta = sim.players.get(pid)!;

    for (const mark of catalogMarks) expect(meta.reliquary.marks.has(mark)).toBe(true);
    expect(meta.reliquary.recent).toEqual([]); // still silent
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(true);
    const bridge = sim
      .drainEvents()
      .filter((e) => e.type === 'deedUnlocked' && e.deedId === 'col_reliquary_rank_2');
    expect(bridge.length).toBe(1);
    expect(bridge[0].type === 'deedUnlocked' && bridge[0].retro).toBe(true);
  });

  it('a LIVE find after the same join toasts without retro, pushes recent, and stamps clears', () => {
    const sim = makeSim();
    const pid = sim.addPlayer('warrior', 'Veteran', { state: veteranState() });
    const meta = sim.players.get(pid)!;
    sim.drainEvents();
    expect(meta.reliquary.recent).toEqual([]);

    // A catalogued relic the seed did not cover, on a page that actually has a
    // clear source, so the stamped-clears half of the contract is observable.
    const liveRelic = catalogItemIds.find((id) => {
      if (SEEDED.includes(id)) return false;
      const pageId = RELIQUARY_ITEM_TO_PAGES.get(id)?.[0];
      const source = pageId ? RELIQUARY_PAGES_BY_ID[pageId]?.clearSource : undefined;
      return source !== undefined && source.kind !== 'none';
    });
    expect(liveRelic, 'a clear-sourced catalogued relic outside the seed').toBeDefined();

    sim.addItem(liveRelic!, 1, pid);
    const unlocks = sim
      .drainEvents()
      .filter((e) => e.type === 'reliquaryUnlock' && e.itemId === liveRelic);
    expect(unlocks.length).toBe(1);
    expect(unlocks[0].type === 'reliquaryUnlock' && unlocks[0].retro).toBeUndefined();
    expect(meta.reliquary.recent).toEqual([liveRelic]);
    expect(Object.hasOwn(meta.reliquary.firstFind[liveRelic!], 'clears')).toBe(true);
  });

  it('a join that only holds mount reins keeps its rank-up retro-flagged', () => {
    // Mount reins are not catalogued item relics, so the seed takes the early
    // mount arm (onItemDiscovered -> maybeSyncCuratorRankDeeds), which runs
    // BEFORE retroFallbackGrants and grants first (grantDeed is idempotent).
    // This pins the retro PASS-THROUGH on that arm: drop the opts there and
    // the grant lands unflagged from the earlier call, reddening this test.
    // It does not pin the arm's existence (delete the call and the later
    // retro fallback grants the same bridge, flagged); the live mount test
    // above owns arm liveness. The empty unlock list below proves no
    // catalogued item arm fired on this join.
    const marks = [...RELIQUARY_MARK_IDS].slice(0, CURATOR_RANK_DEFS[1].threshold - 1);
    expect(marks.length).toBe(CURATOR_RANK_DEFS[1].threshold - 1);
    const donor = makeSim();
    const base = donor.serializeCharacter(donor.playerId)!;
    const sim = makeSim();
    sim.drainEvents();
    const pid = sim.addPlayer('warrior', 'Stablehand', {
      state: {
        ...base,
        inventory: [],
        // Reins in the BANK: the seed walks it like any other container.
        bank: {
          inventory: [{ itemId: 'reins_valorsteed', count: 1 }],
          purchasedSlots: 0,
          bonusSlots: 0,
        },
        // Marks arrive already restored, so they plus the one mount sit at the
        // rank-2 threshold the moment the seed reaches the bank.
        reliquary: { marks },
        deedStats: undefined,
      },
    });
    const meta = sim.players.get(pid)!;
    const events = sim.drainEvents().filter((e) => e.pid === pid);

    expect(catalogRankOwned(characterReliquaryOwnership(meta))).toBeGreaterThanOrEqual(
      CURATOR_RANK_DEFS[1].threshold,
    );
    // No catalogued item relic was seeded, so the item arm never synced rank.
    expect(events.filter((e) => e.type === 'reliquaryUnlock')).toEqual([]);
    const bridges = events.filter(
      (e) => e.type === 'deedUnlocked' && e.deedId === 'col_reliquary_rank_2',
    );
    expect(bridges.length).toBe(1);
    expect(bridges[0].type === 'deedUnlocked' && bridges[0].retro).toBe(true);
    // Mount membership stays live-seam only: no invented firstFind entry.
    expect(meta.reliquary.firstFind.reins_valorsteed).toBeUndefined();
  });

  it('a firstFind blob ahead of the ledger stays silent but still syncs rank', () => {
    // The desync a veteran save can carry: the sparse blob already knows these
    // relics, itemsDiscovered does not. The unlock event is the first-find
    // MOMENT, so it must stay silent, while the rank sync keys on the ledger
    // add instead and still credits the threshold this discover just crossed.
    const sim = makeSim();
    const { meta } = primary(sim);
    const threshold = CURATOR_RANK_DEFS[1].threshold;
    const ids = catalogItemIds.slice(0, threshold);
    expect(ids.length).toBe(threshold);
    for (const id of ids) {
      expect(meta.deedStats.itemsDiscovered.has(id), `${id} must start undiscovered`).toBe(false);
      meta.reliquary.firstFind[id] = { pageId: RELIQUARY_ITEM_TO_PAGES.get(id)?.[0] };
    }
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(false);
    sim.drainEvents();

    for (const id of ids) markItemDiscovered(sim.ctx, meta, id);

    const events = sim.drainEvents();
    expect(events.filter((e) => e.type === 'reliquaryUnlock')).toEqual([]);
    expect(meta.deedsEarned.has('col_reliquary_rank_2')).toBe(true);
  });
});
