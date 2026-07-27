// The skill-versus-zone axis (D9): which rod a zone's water takes, what a
// cast does when you do not carry it, and the schedule the nine catch-table
// cells are authored against.
//
// The zone column is DERIVED from GATHER_NODES here, the way
// tests/material_grades.test.ts derives its own gather-tier column, so
// re-tiering a zone's ground and leaving its water behind fails loudly
// instead of quietly moving who can fish where.
import { describe, expect, it } from 'vitest';
import { updateCasting } from '../src/sim/combat/casting_lifecycle';
import { DEEDS } from '../src/sim/content/deeds';
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import { FISHING_TABLES_BY_BAND } from '../src/sim/content/items';
import { ALL_RECIPES } from '../src/sim/content/recipes';
import { DEEPFEN_SHALLOWS_LAKE, ITEMS, LAKE, ZONES, zoneAt } from '../src/sim/data';
import {
  completeFishing,
  FISH_BITE_DELAY_MAX_SEC,
  FISH_BITE_DELAY_MIN_SEC,
  FISH_BITE_DELAY_ROD_REDUCTION_SEC,
  FISH_REEL_WINDOW_RARITY_BONUS_SEC,
  FISH_REEL_WINDOW_ROD_BONUS_SEC,
  FISH_REEL_WINDOW_SEC,
  fishReelWindowSecFor,
  startFishing,
} from '../src/sim/professions/fishing';
import {
  DEFAULT_FISHING_ROD_TIER,
  FISHING_ZONE_ROD_TIERS,
  rodTierRequiredForZone,
} from '../src/sim/professions/fishing_zones';
import { isGatherToolUse } from '../src/sim/professions/tools';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import {
  DT,
  FISHING_CAST_ID,
  FISHING_SESSION_CAP_SEC,
  type ItemDef,
  type SimEvent,
} from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const ZONE_IDS = ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights'];
const KOI = 'glimmerfin_koi';
const JUNK_ROWS: Record<string, string[]> = {
  eastbrook_vale: ['tangled_weed'],
  mirefen_marsh: ['soggy_boot', 'tangled_weed'],
  thornpeak_heights: ['tangled_weed'],
};

// The band side of the ladder, which lives here rather than in the module: it
// is the rule the nine catch-table cells were AUTHORED against, and nothing at
// runtime asks it anything (the engine reads the table it is handed). A zone's
// required band is the band its required rod unlocks, which is rodTier - 1
// under the shipped band gate.
const requiredBandFor = (zoneId: string): number =>
  Math.min(2, Math.max(0, rodTierRequiredForZone(zoneId) - 1));
/** How many bands short of the zone's requirement a band is, 0 at or above. */
const shortfallFor = (zoneId: string, band: number): number =>
  Math.min(2, Math.max(0, requiredBandFor(zoneId) - band));
/** How many bands ABOVE the requirement a band sits, 0 when short or at it. */
const surplusFor = (zoneId: string, band: number): number =>
  Math.min(2, Math.max(0, band - requiredBandFor(zoneId)));

function makeSim(seed = 4242): Sim {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true });
}

function teleportTo(sim: Sim, x: number, z: number): void {
  const p = sim.player;
  p.pos.x = x;
  p.pos.z = z;
  p.pos.y = terrainHeight(x, z, sim.cfg.seed);
  p.prevPos = { ...p.pos };
}

/** South shore of a lake, facing its centre: fishable water ahead. */
function faceLake(sim: Sim, lake: { x: number; z: number; radius: number }): void {
  const pz = lake.z - lake.radius - 2;
  teleportTo(sim, lake.x, pz);
  sim.player.facing = Math.atan2(0, lake.z - pz);
}

/**
 * A dry, water-facing spot on a lake's shore, found by probing the REAL
 * startFishing with tackle good enough for the zone (its deny arms are all
 * draw-free, so failed probes never touch the stream). Returned as plain
 * coordinates so a caller can place a DIFFERENT angler there and be sure the
 * only thing that can refuse them is the rod.
 */
function fishableSpotOn(lake: { x: number; z: number; radius: number }): {
  x: number;
  z: number;
  facing: number;
} {
  const sim = makeSim();
  const meta = sim.meta(sim.playerId) as PlayerMeta;
  sim.addItem('silverstream_fishing_rod', 1);
  for (let r = lake.radius * 0.7; r <= lake.radius + 10; r += 1) {
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const x = lake.x + Math.cos(a) * r;
      const z = lake.z + Math.sin(a) * r;
      teleportTo(sim, x, z);
      const facing = Math.atan2(lake.x - x, lake.z - z);
      sim.player.facing = facing;
      startFishing(sim.ctx, sim.player, meta);
      if (sim.player.castingAbility === FISHING_CAST_ID) {
        sim.player.castingAbility = null;
        sim.player.castRemaining = 0;
        sim.player.fishBiteAtTick = 0;
        sim.player.fishReelDeadlineTick = 0;
        return { x, z, facing };
      }
    }
  }
  throw new Error('no dry fishable shore spot found');
}

function placeAt(sim: Sim, spot: { x: number; z: number; facing: number }): void {
  teleportTo(sim, spot.x, spot.z);
  sim.player.facing = spot.facing;
}

function deniedEvents(events: readonly SimEvent[]) {
  return events.filter((e) => (e as { type: string }).type === 'gatherDenied');
}

const weightOf = (band: number, zoneId: string, itemId: string | null): number => {
  const row = FISHING_TABLES_BY_BAND[band][zoneId].find((r) => r.itemId === itemId);
  expect(row, `missing ${zoneId} band ${band} row for ${itemId ?? 'null'}`).toBeDefined();
  return row?.weight ?? Number.NaN;
};

const junkTotal = (band: number, zoneId: string): number =>
  JUNK_ROWS[zoneId].reduce((sum, id) => sum + weightOf(band, zoneId, id), 0);

describe('the rod a zone takes', () => {
  it('IS the zone tier its own ground carries (content and gate cannot drift apart)', () => {
    // Derived from GATHER_NODES, exactly like the fine-material gather-tier
    // column: a zone's water asks for the same rung its veins do.
    const highestNodeTierIn = (zoneId: string) =>
      Math.max(...GATHER_NODES.filter((n) => n.zoneId === zoneId).map((n) => n.tier));
    let checked = 0;
    for (const zoneId of ZONE_IDS) {
      expect(rodTierRequiredForZone(zoneId), zoneId).toBe(highestNodeTierIn(zoneId));
      checked += 1;
    }
    expect(checked).toBe(3);
    // And the ladder really is a ladder, so the loop above is not three copies
    // of one number.
    expect(rodTierRequiredForZone('eastbrook_vale')).toBe(1);
    expect(rodTierRequiredForZone('mirefen_marsh')).toBe(2);
    expect(rodTierRequiredForZone('thornpeak_heights')).toBe(3);
  });

  it('covers every zone the world ships, and floors an unknown one at tier 1', () => {
    for (const zone of ZONES) {
      expect(FISHING_ZONE_ROD_TIERS[zone.id], zone.id).toBeDefined();
    }
    expect(Object.keys(FISHING_ZONE_ROD_TIERS).sort()).toEqual([...ZONE_IDS].sort());
    // The floor is what keeps a zone that ever ships without a row castable,
    // matching the catch table's own fall back to the Vale rows.
    expect(rodTierRequiredForZone('no_such_zone')).toBe(DEFAULT_FISHING_ROD_TIER);
    expect(DEFAULT_FISHING_ROD_TIER).toBe(1);
  });

  it('is reachable: every requirement names a rod the world actually contains', () => {
    const rodTiers = Object.values(ITEMS)
      .filter((def) => isGatherToolUse(def.use) && def.use.professionId === 'fishing')
      .map((def) => (isGatherToolUse(def.use) ? def.use.tier : 0));
    for (const zoneId of ZONE_IDS) {
      const need = rodTierRequiredForZone(zoneId);
      // Tier 1 is the bare-hands floor and needs no rod at all; anything above
      // it must be satisfiable by a shipped rod.
      expect(need === 1 || rodTiers.some((tier) => tier >= need), zoneId).toBe(true);
    }
  });

  it('the required BAND is the rod tier minus one, the shipped band gate', () => {
    for (const zoneId of ZONE_IDS) {
      expect(requiredBandFor(zoneId), zoneId).toBe(rodTierRequiredForZone(zoneId) - 1);
    }
    expect(requiredBandFor('eastbrook_vale')).toBe(0);
    expect(requiredBandFor('mirefen_marsh')).toBe(1);
    expect(requiredBandFor('thornpeak_heights')).toBe(2);
  });

  it('shortfall and surplus are mirrors, clamped, and never both positive', () => {
    for (const zoneId of ZONE_IDS) {
      for (let band = 0; band < 3; band++) {
        const short = shortfallFor(zoneId, band);
        const over = surplusFor(zoneId, band);
        expect(Math.min(short, over), `${zoneId} band ${band}`).toBe(0);
        expect(short - over).toBe(requiredBandFor(zoneId) - band);
      }
    }
    // Both ends clamp, so a fourth band or a fourth zone cannot index off the
    // schedule.
    expect(shortfallFor('thornpeak_heights', -5)).toBe(2);
    expect(surplusFor('eastbrook_vale', 99)).toBe(2);
  });
});

describe('the catch tables follow the shortfall schedule', () => {
  // The one place the nine cells are checked against the rule that authored
  // them. Editing a weight past the schedule reds here rather than quietly
  // changing what a zone pays.
  const EMPTY_HOOK_AT_OR_ABOVE = [10, 8, 6]; // by bands ABOVE the requirement
  const EMPTY_HOOK_SHORT = [0, 35, 55]; // by bands SHORT of it
  const KOI_BY_BAND = [1, 3, 6];

  it('every empty-hook weight is exactly what the zone distance says it is', () => {
    let checked = 0;
    for (const zoneId of ZONE_IDS) {
      for (let band = 0; band < 3; band++) {
        const short = shortfallFor(zoneId, band);
        const expected =
          short > 0 ? EMPTY_HOOK_SHORT[short] : EMPTY_HOOK_AT_OR_ABOVE[surplusFor(zoneId, band)];
        expect(weightOf(band, zoneId, null), `${zoneId} band ${band} empty hook`).toBe(expected);
        checked += 1;
      }
    }
    expect(checked).toBe(9);
    // Every arm of the schedule is exercised by real content, so none of the
    // three cases above is dead: Eastbrook supplies all three surplus steps,
    // Mirefen and Thornpeak supply both shortfalls.
    const shortfalls = new Set<number>();
    const surpluses = new Set<number>();
    for (const zoneId of ZONE_IDS) {
      for (let band = 0; band < 3; band++) {
        const short = shortfallFor(zoneId, band);
        if (short > 0) shortfalls.add(short);
        else surpluses.add(surplusFor(zoneId, band));
      }
    }
    expect([...shortfalls].sort((a, b) => a - b)).toEqual([1, 2]);
    expect([...surpluses].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('the rare catch reads SKILL alone: same weight in every zone, rising with the band', () => {
    for (let band = 0; band < 3; band++) {
      for (const zoneId of ZONE_IDS) {
        expect(weightOf(band, zoneId, KOI), `${zoneId} band ${band}`).toBe(KOI_BY_BAND[band]);
      }
    }
    // It is the one row a shortfall never touches: Thornpeak at band 0 is two
    // bands short and still pays the same koi weight as the Vale at band 0.
    expect(weightOf(0, 'thornpeak_heights', KOI)).toBe(weightOf(0, 'eastbrook_vale', KOI));
    expect(KOI_BY_BAND[0]).toBeLessThan(KOI_BY_BAND[2]);
  });

  it('junk is pinned per cell, and swells with the shortfall', () => {
    // Pinned as LITERALS, like the empty hook, not as a ratio floor. A floor
    // is what this used to be, and the floors were loose enough that Thornpeak
    // band 1 could have dropped 15 to 9 and Mirefen band 0 25 to 19 with every
    // other assertion in this file still green: the junk dimension of the
    // schedule was the one authored rule not actually enforced.
    const JUNK_TOTALS: Record<string, number[]> = {
      eastbrook_vale: [12, 8, 4],
      mirefen_marsh: [25, 13, 9],
      thornpeak_heights: [28, 15, 6],
    };
    let checked = 0;
    for (const zoneId of ZONE_IDS) {
      for (let band = 0; band < 3; band++) {
        expect(junkTotal(band, zoneId), `${zoneId} band ${band} junk`).toBe(
          JUNK_TOTALS[zoneId][band],
        );
        checked += 1;
      }
    }
    expect(checked).toBe(9);
    // And the shape those literals encode: a short cell really does pay more
    // junk than the same zone at its own requirement, roughly double or worse.
    let shortCells = 0;
    for (const zoneId of ZONE_IDS) {
      const atRequirement = junkTotal(requiredBandFor(zoneId), zoneId);
      for (let band = 0; band < 3; band++) {
        const short = shortfallFor(zoneId, band);
        if (short === 0) continue;
        const ratio = junkTotal(band, zoneId) / atRequirement;
        expect(ratio, `${zoneId} band ${band} junk ratio`).toBeGreaterThanOrEqual(
          short === 2 ? 2 : 1.4,
        );
        shortCells += 1;
      }
    }
    // Non-vacuity: Eastbrook has no shortfall cell at all, so without this the
    // ratio loop could skip everything and still pass.
    expect(shortCells).toBe(3);
  });

  it('the food fish take the remainder, pinned per cell', () => {
    // The last clause of the authored schedule, and the only one an edit could
    // otherwise drift past: with the empty hook, the koi and the junk all
    // pinned exactly and the row summing to 100, exactly one degree of freedom
    // is left, which is how the remainder is split between a zone's two food
    // fish. Pinned as literals so a 50/34 to 49/35 nudge in the Vale reds here
    // rather than passing every other assertion in this file.
    const FOOD_ROWS: Record<string, number[][]> = {
      eastbrook_vale: [
        [46, 31],
        [49, 32],
        [50, 34],
      ],
      mirefen_marsh: [
        [22, 17],
        [42, 32],
        [43, 34],
      ],
      thornpeak_heights: [
        [9, 7],
        [27, 20],
        [44, 34],
      ],
    };
    let checked = 0;
    for (const zoneId of ZONE_IDS) {
      for (let band = 0; band < 3; band++) {
        const food = FISHING_TABLES_BY_BAND[band][zoneId]
          .filter(
            (r) => r.itemId !== null && r.itemId !== KOI && !JUNK_ROWS[zoneId].includes(r.itemId),
          )
          .map((r) => r.weight);
        expect(food, `${zoneId} band ${band} food rows`).toEqual(FOOD_ROWS[zoneId][band]);
        checked += 1;
      }
    }
    expect(checked).toBe(9);
  });

  it('a short cell pays out worse overall than the same zone at its requirement', () => {
    // The property the three schedules exist to produce, asserted once on the
    // thing a player actually feels: how much of the table is a real fish.
    const foodShare = (band: number, zoneId: string) =>
      FISHING_TABLES_BY_BAND[band][zoneId]
        .filter((r) => r.itemId !== null && !JUNK_ROWS[zoneId].includes(r.itemId))
        .reduce((sum, r) => sum + r.weight, 0);
    let checked = 0;
    for (const zoneId of ZONE_IDS) {
      const atRequirement = foodShare(requiredBandFor(zoneId), zoneId);
      for (let band = 0; band < 3; band++) {
        if (shortfallFor(zoneId, band) === 0) continue;
        expect(foodShare(band, zoneId), `${zoneId} band ${band}`).toBeLessThan(atRequirement);
        checked += 1;
      }
    }
    expect(checked).toBe(3);
    // And the worst cell in the world really is bleak: a band-0 angler in
    // Thornpeak lands a fish under a fifth of the time.
    expect(foodShare(0, 'thornpeak_heights')).toBeLessThan(20);
  });
});

describe('the zone rod gate at the cast', () => {
  it('refuses a Thornpeak cast with a tier-2 rod, names the tier, and draws nothing', () => {
    const spot = fishableSpotOn(ZONE_THORNPEAK_LAKE());
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('ironreel_fishing_rod', 1);
    placeAt(sim, spot);
    expect(zoneAt(sim.player.pos.z).id).toBe('thornpeak_heights');
    let draws = 0;
    sim.rng.setObserver(() => draws++);
    const evStart = sim.events.length;
    startFishing(sim.ctx, sim.player, meta);
    expect(sim.player.castingAbility).toBeNull();
    expect(draws, 'a denial is rng-free').toBe(0);
    expect(deniedEvents(sim.events.slice(evStart))).toEqual([
      {
        type: 'gatherDenied',
        pid: meta.entityId,
        surface: 'fishing',
        professionId: 'fishing',
        requiredTier: 3,
      },
    ]);
    // Nothing else was said: the denial is the only event, so no cast bar
    // flickers and no error line stacks on top of the toast.
    expect(sim.events.slice(evStart)).toHaveLength(1);
  });

  it('allows the same Thornpeak cast once the tier-3 rod is in the bags', () => {
    const spot = fishableSpotOn(ZONE_THORNPEAK_LAKE());
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('silverstream_fishing_rod', 1);
    placeAt(sim, spot);
    startFishing(sim.ctx, sim.player, meta);
    expect(sim.player.castingAbility).toBe(FISHING_CAST_ID);
    expect(deniedEvents(sim.events)).toEqual([]);
  });

  it('leaves the starter zone open to the simple pole, which is the whole no-strand story', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('simple_fishing_pole', 1);
    faceLake(sim, LAKE);
    expect(zoneAt(sim.player.pos.z).id).toBe('eastbrook_vale');
    startFishing(sim.ctx, sim.player, meta);
    expect(sim.player.castingAbility).toBe(FISHING_CAST_ID);
    expect(deniedEvents(sim.events)).toEqual([]);
  });

  it('answers only a real attempt to fish: dry land in the peaks gets the water line', () => {
    // The gate sits AFTER the water check on purpose. Nothing else in this
    // file can tell: every other denial test stands on a probed fishable spot,
    // so moving the gate above the water check would leave them all green
    // while changing what a player on dry ground is told. Here the angler
    // faces a hillside with a rod the peaks refuse, and must hear about the
    // water, not about the rod they cannot use yet anyway.
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('ironreel_fishing_rod', 1);
    const lake = ZONE_THORNPEAK_LAKE();
    // Well clear of the water, facing away from it.
    teleportTo(sim, lake.x + lake.radius + 120, lake.z + lake.radius + 120);
    sim.player.facing = Math.atan2(1, 0);
    expect(zoneAt(sim.player.pos.z).id).toBe('thornpeak_heights');
    const evStart = sim.events.length;
    startFishing(sim.ctx, sim.player, meta);
    expect(sim.player.castingAbility).toBeNull();
    expect(deniedEvents(sim.events.slice(evStart)), 'the rod gate must not answer here').toEqual(
      [],
    );
    expect(sim.events.slice(evStart)).toContainEqual(
      expect.objectContaining({ type: 'error', text: 'You need to face fishable water.' }),
    );
  });

  it('the Codfather quest water now costs the tier-2 rod, and the pole is told which tier', () => {
    // A consequence worth stating out loud rather than discovering in play:
    // the Deepfen Shallows sit in Mirefen, so q_the_codfather is behind the
    // Ironreel. It is a 60-copper counter purchase, sold in the marsh's own
    // hub as well as the starter zone and carrying no proficiency gate,
    // against a quest that pays 450, so the quest is paced rather than
    // blocked. It is not the only thing behind the gate: see the shipped
    // rewards swept below.
    const spot = fishableSpotOn(DEEPFEN_SHALLOWS_LAKE);
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('simple_fishing_pole', 1);
    placeAt(sim, spot);
    expect(zoneAt(sim.player.pos.z).id).toBe('mirefen_marsh');
    let draws = 0;
    sim.rng.setObserver(() => draws++);
    startFishing(sim.ctx, sim.player, meta);
    expect(sim.player.castingAbility).toBeNull();
    // Draw-free on THIS arm too, not just the Thornpeak one: both denials sit
    // on the same code path, and pinning only one leaves the other free to
    // grow a roll.
    expect(draws, 'a denial is rng-free').toBe(0);
    expect(deniedEvents(sim.events)).toEqual([
      {
        type: 'gatherDenied',
        pid: meta.entityId,
        surface: 'fishing',
        professionId: 'fishing',
        requiredTier: 2,
      },
    ]);
    expect(ITEMS.ironreel_fishing_rod.buyValue).toBe(60);
  });

  it('names every shipped reward the gate now sits in front of', () => {
    // The Codfather is the loudest consequence, not the only one, and a list
    // that stops at the loudest one reads as though the rest were checked.
    // Derived from the deed and recipe tables rather than recited, so a new
    // fishing deed or fish-fed recipe joins it automatically.
    const gatedZones = ZONE_IDS.filter((id) => rodTierRequiredForZone(id) > 1);
    expect(gatedZones.sort()).toEqual(['mirefen_marsh', 'thornpeak_heights']);

    // Per-zone fishing deeds in the gated zones.
    const fishMarks = Object.values(DEEDS)
      .filter((d) => {
        const trigger = d.trigger as { kind?: string; markId?: string };
        return trigger.kind === 'visit' && (trigger.markId ?? '').startsWith('fish:');
      })
      .map((d) => (d.trigger as { markId: string }).markId.slice('fish:'.length));
    const gatedDeedZones = fishMarks.filter((zoneId) => gatedZones.includes(zoneId));
    expect(gatedDeedZones.sort()).toEqual(['mirefen_marsh', 'thornpeak_heights']);

    // Recipes fed by a catch that only gated water yields.
    const gatedCatches = new Set<string>();
    for (const byZone of FISHING_TABLES_BY_BAND) {
      for (const zoneId of gatedZones) {
        for (const row of byZone[zoneId]) {
          if (row.itemId === null) continue;
          const elsewhere = FISHING_TABLES_BY_BAND.some((b) =>
            ZONE_IDS.filter((z) => !gatedZones.includes(z)).some((z) =>
              b[z].some((r) => r.itemId === row.itemId),
            ),
          );
          if (!elsewhere) gatedCatches.add(row.itemId);
        }
      }
    }
    const gatedRecipes = ALL_RECIPES.filter((r) =>
      r.reagents.some((reagent) => gatedCatches.has(reagent.itemId)),
    ).map((r) => r.id);
    // Non-vacuity, and the actual list: a handful of cooking recipes plus the
    // tier-5 rod, which is gated ON PURPOSE (that is its self-gate).
    expect(gatedRecipes.length).toBeGreaterThanOrEqual(4);
    expect(gatedRecipes).toContain('recipe_tidewrought_fishing_rod');
  });

  it('the gate reads the SAME zone the catch table does, driven end to end', () => {
    // The two must never disagree, or a player could be refused for one
    // zone's requirement and then fished against another zone's rows. Asserted
    // by DRIVING it: take the tier the gate names at one spot, satisfy exactly
    // that tier, and prove the catch that lands comes from that zone's rows. A
    // gate reading a different zone (or a different axis entirely) passes a
    // map-coverage check but fails this.
    const spot = fishableSpotOn(ZONE_THORNPEAK_LAKE());
    const denied = makeSim();
    const deniedMeta = denied.meta(denied.playerId) as PlayerMeta;
    denied.addItem('simple_fishing_pole', 1);
    placeAt(denied, spot);
    startFishing(denied.ctx, denied.player, deniedMeta);
    const events = deniedEvents(denied.events);
    expect(events).toHaveLength(1);
    const namedTier = (events[0] as { requiredTier: number }).requiredTier;

    const allowed = makeSim();
    const allowedMeta = allowed.meta(allowed.playerId) as PlayerMeta;
    // Exactly the tier the gate asked for, nothing above it.
    const rodOfNamedTier = Object.values(ITEMS).find(
      (def) =>
        isGatherToolUse(def.use) &&
        def.use.professionId === 'fishing' &&
        def.use.tier === namedTier,
    );
    expect(rodOfNamedTier, `no rod of the tier the gate named (${namedTier})`).toBeDefined();
    allowed.addItem((rodOfNamedTier as { id: string }).id, 1);
    placeAt(allowed, spot);
    const zoneId = zoneAt(allowed.player.pos.z).id;
    startFishing(allowed.ctx, allowed.player, allowedMeta);
    expect(allowed.player.castingAbility).toBe(FISHING_CAST_ID);
    // Resolve a catch and prove it belongs to the SAME zone's rows.
    const zoneIds = new Set(
      FISHING_TABLES_BY_BAND.flatMap((byZone) => byZone[zoneId].map((r) => r.itemId)),
    );
    const otherIds = new Set(
      FISHING_TABLES_BY_BAND.flatMap((byZone) =>
        Object.entries(byZone)
          .filter(([id]) => id !== zoneId)
          .flatMap(([, rows]) => rows.map((r) => r.itemId)),
      ),
    );
    const before = new Map(
      [...zoneIds, ...otherIds]
        .filter((id): id is string => id !== null)
        .map((id) => [id, allowed.countItem(id)]),
    );
    allowed.player.fishBiteAtTick = 0;
    allowed.player.fishReelDeadlineTick = 0;
    allowed.player.castingAbility = null;
    completeFishing(allowed.ctx, allowed.player, allowedMeta);
    const gained = [...before.keys()].filter((id) => allowed.countItem(id) > (before.get(id) ?? 0));
    for (const id of gained) {
      expect(zoneIds.has(id), `${id} is not on ${zoneId}'s table`).toBe(true);
    }
    // The zone-exclusive rows really are exclusive, so the check above is not
    // satisfied by every zone sharing one id set.
    expect([...zoneIds].some((id) => id !== null && !otherIds.has(id))).toBe(true);
  });
});

describe('a rod rarity rung widens the reel window', () => {
  it('widens on rarity with the tier HELD FIXED, so the term is not tier in disguise', () => {
    // The decisive arm. Rod rarity is collinear with rod tier in shipped
    // content, so every real rod would also pass a tier-only implementation;
    // holding the tier fixed is the only thing that can tell the two apart.
    const tier = 3;
    const common = fishReelWindowSecFor(tier, 'common');
    // NON-VACUITY FIRST. The per-rung assertion below computes its expected
    // value FROM the constant, so at a constant of 0 both sides are 0 and every
    // row passes while the bonus buys nothing. A mutation pass zeroing the
    // constant survived this test until these two lines existed.
    expect(FISH_REEL_WINDOW_RARITY_BONUS_SEC).toBeGreaterThan(0);
    expect(fishReelWindowSecFor(tier, 'epic')).toBeGreaterThan(common);
    for (const [rarity, rungs] of [
      ['uncommon', 1],
      ['rare', 2],
      ['epic', 3],
      ['legendary', 4],
    ] as const) {
      expect(fishReelWindowSecFor(tier, rarity) - common, `${rarity} at tier ${tier}`).toBeCloseTo(
        FISH_REEL_WINDOW_RARITY_BONUS_SEC * rungs,
        10,
      );
      // And each rung is strictly wider than the one below it, stated against
      // the window rather than against the constant, so the ladder cannot
      // collapse to a single step while the arithmetic above still agrees.
      if (rungs > 1) {
        expect(fishReelWindowSecFor(tier, rarity)).toBeGreaterThan(
          common + FISH_REEL_WINDOW_RARITY_BONUS_SEC,
        );
      }
    }
  });

  it('leaves the tier ladder intact, and defaults an omitted rarity to common', () => {
    // Rarity ADDS to the tier ladder rather than replacing it: the pre-rarity
    // behaviour is still exactly what a common rod gets.
    for (let tier = 1; tier <= 5; tier++) {
      expect(fishReelWindowSecFor(tier, 'common')).toBeCloseTo(
        FISH_REEL_WINDOW_SEC + FISH_REEL_WINDOW_ROD_BONUS_SEC * (tier - 1),
        10,
      );
      // The default is the common rung, so a tier-only caller is unchanged.
      expect(fishReelWindowSecFor(tier)).toBe(fishReelWindowSecFor(tier, 'common'));
    }
  });

  it('never NARROWS the window for an off-ladder quality', () => {
    // 'poor' is the one quality MaterialRarity excludes and undefined is a def
    // with no quality at all. Both used to index to -1 and would have
    // subtracted a rung from the base window.
    for (const quality of ['poor', undefined] as const) {
      expect(fishReelWindowSecFor(3, quality)).toBe(fishReelWindowSecFor(3, 'common'));
    }
  });

  it('the shipped rods really do span the rarity ladder, so the bonus is reachable', () => {
    // Vacuity guard: if every rod were common the term above would be dead
    // content, and the budget below would be measuring a case no player holds.
    const rodQualities = Object.values(ITEMS)
      .filter((def) => isGatherToolUse(def.use) && def.use.professionId === 'fishing')
      .map((def) => def.quality);
    expect(new Set(rodQualities).size).toBeGreaterThan(1);
    expect(rodQualities).toContain('epic');
  });
});

describe('the session cap always outlasts a legal reel window', () => {
  // The fairness defect this guards: the cap arm and the miss arm emit the
  // IDENTICAL pair (fishingGotAway plus a failed castStop), so if the cap ever
  // expired while a reel window was still open, the fish would get away with
  // the window still on screen and nothing downstream could tell the two
  // apart. Budgeted in TICKS, because both legs ceil and the cap decays on DT.
  // Every shipped rod as BOTH axes the window reads. Tier alone is no longer
  // enough: rarity widens the window too, so a budget walking bare tiers would
  // under-count the real worst case by the epic rung and pass on a window the
  // world can actually beat.
  const shippedRods = (): { tier: number; quality: ItemDef['quality'] }[] => {
    const rods = Object.values(ITEMS)
      .filter((def) => isGatherToolUse(def.use) && def.use.professionId === 'fishing')
      .map((def) => ({
        tier: isGatherToolUse(def.use) ? def.use.tier : 0,
        quality: def.quality,
      }));
    // Tier 1 is the pole and the bare-hands floor, which no rod def carries;
    // the floor is common, matching bestOwnedGatherToolFor's own default.
    return [{ tier: 1, quality: 'common' as const }, ...rods];
  };

  it('covers the worst legal session over every shipped rod tier, with a tick to spare', () => {
    const capTicks = Math.round(FISHING_SESSION_CAP_SEC / DT);
    // ONE loop, over the rod held at the BITE. The bite delay is drawn against
    // the rod held at the CAST and the window is measured against the rod held
    // at the BITE, and since a better rod only ever SHORTENS the delay, the
    // worst bite is always the bare pole's. Looping over the cast tier too
    // would recompute one number per row and inflate the count without adding
    // a case, which is what this used to do.
    const worstBiteTicks = Math.ceil(FISH_BITE_DELAY_MAX_SEC / DT);
    let checked = 0;
    let worstNeedTicks = 0;
    for (const rod of shippedRods()) {
      // The sim's own function, never a second copy of its arithmetic. This
      // line used to re-derive the sum inline, which meant the budget could
      // stay green while the live window grew past it: adding the rarity term
      // to fishReelWindowSecFor alone would have moved the world and left this
      // measuring the old formula.
      const windowSec = fishReelWindowSecFor(rod.tier, rod.quality);
      const needTicks = worstBiteTicks + Math.ceil(windowSec / DT) + 1;
      worstNeedTicks = Math.max(worstNeedTicks, needTicks);
      expect(
        capTicks,
        `a pole cast into a tier-${rod.tier} ${rod.quality} bite needs ${needTicks} ticks`,
      ).toBeGreaterThan(needTicks);
      checked += 1;
    }
    expect(checked).toBe(shippedRods().length);
    expect(checked).toBeGreaterThanOrEqual(5);
    // The rarity term is really IN the worst case, not merely available to it:
    // the widest shipped rod must beat the widest bare-tier window, or this
    // whole budget would be re-deriving the pre-rarity number and calling it
    // covered.
    expect(worstNeedTicks).toBeGreaterThan(
      worstBiteTicks + Math.ceil(fishReelWindowSecFor(5) / DT) + 1,
    );
    // The budget is LIVE, not a formality: the worst legal session really does
    // consume most of the cap, so a cap trimmed for looks would red here.
    expect(worstNeedTicks).toBeGreaterThan(capTicks * 0.8);
    // And the pole really is the worst bite, which is what lets the loop above
    // hold the cast tier fixed.
    const effMaxFor = (tier: number) =>
      Math.max(
        FISH_BITE_DELAY_MIN_SEC,
        FISH_BITE_DELAY_MAX_SEC - FISH_BITE_DELAY_ROD_REDUCTION_SEC * (tier - 1),
      );
    for (const rod of shippedRods()) {
      expect(effMaxFor(rod.tier), `tier ${rod.tier} bite ceiling`).toBeLessThanOrEqual(
        effMaxFor(1),
      );
    }
  });

  it('a real worst-case session still reels inside the cap, through the live loop', () => {
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('simple_fishing_pole', 1);
    faceLake(sim, LAKE);
    const p = sim.player;
    startFishing(sim.ctx, p, meta);
    // Force the worst legal bite (the top of the tier-1 range) and hand the
    // angler the best shipped rod before it lands, which is the widest window
    // the world can produce.
    const startTick = sim.tickCount;
    p.fishBiteAtTick = startTick + Math.ceil(FISH_BITE_DELAY_MAX_SEC / DT);
    const bestRod = Object.values(ITEMS)
      .filter((def) => isGatherToolUse(def.use) && def.use.professionId === 'fishing')
      .sort(
        (a, b) =>
          (isGatherToolUse(b.use) ? b.use.tier : 0) - (isGatherToolUse(a.use) ? a.use.tier : 0),
      )[0];
    sim.addItem(bestRod.id, 1);
    // Run the real tick loop to the bite, then to the last tick of the window.
    for (let tick = startTick + 1; tick <= p.fishBiteAtTick; tick++) {
      sim.tickCount = tick;
      updateCasting(sim.ctx, p, meta);
      p.castRemaining = FISHING_SESSION_CAP_SEC - (tick - startTick) * DT;
    }
    // The window is the WIDEST the world can produce, pinned as its own
    // number. Without this, a regression that scanned the cast-time rod
    // instead of the bite-time rod would arm 50 ticks instead of 110, the loop
    // below would simply run fewer iterations, and every assertion would still
    // pass on a much weaker budget.
    const widestWindowTicks = Math.ceil(
      fishReelWindowSecFor(isGatherToolUse(bestRod.use) ? bestRod.use.tier : 1, bestRod.quality) /
        DT,
    );
    expect(p.fishReelDeadlineTick - sim.tickCount, 'the bite armed the widest window').toBe(
      widestWindowTicks,
    );
    for (let tick = sim.tickCount + 1; tick <= p.fishReelDeadlineTick; tick++) {
      sim.tickCount = tick;
      p.castRemaining = FISHING_SESSION_CAP_SEC - (tick - startTick) * DT;
      updateCasting(sim.ctx, p, meta);
      expect(p.castingAbility, `the cap ate the window at tick ${tick - startTick}`).toBe(
        FISHING_CAST_ID,
      );
    }
    // The window survived to its last legal tick, so the reel still LANDS: a
    // null castingAbility alone cannot tell a landed catch from a fish that
    // got away, so the catch event is what carries the claim.
    const evStart = sim.events.length;
    startFishing(sim.ctx, p, meta);
    expect(p.castingAbility).toBeNull();
    const after = sim.events.slice(evStart);
    expect(
      after.some((e) => (e as { type: string }).type === 'fishingGotAway'),
      'the cap must not have eaten the reel',
    ).toBe(false);
    expect(after).toContainEqual(expect.objectContaining({ type: 'castStop', success: true }));
  });
});

// Thornpeak's fishable water. Resolved from the zone's own lakes rather than
// hardcoded, so a moved lake fails here instead of silently fishing the wrong
// zone.
function ZONE_THORNPEAK_LAKE(): { x: number; z: number; radius: number } {
  const zone = ZONES.find((z) => z.id === 'thornpeak_heights');
  const lake = zone?.lakes?.[0];
  expect(lake, 'thornpeak_heights must ship fishable water').toBeDefined();
  return lake as { x: number; z: number; radius: number };
}
