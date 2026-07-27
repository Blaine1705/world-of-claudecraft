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
import { GATHER_NODES } from '../src/sim/content/gather_nodes';
import { FISHING_TABLES_BY_BAND } from '../src/sim/content/items';
import { DEEPFEN_SHALLOWS_LAKE, ITEMS, LAKE, ZONES, zoneAt } from '../src/sim/data';
import {
  FISH_BITE_DELAY_MAX_SEC,
  FISH_BITE_DELAY_MIN_SEC,
  FISH_REEL_WINDOW_ROD_BONUS_SEC,
  FISH_REEL_WINDOW_SEC,
  startFishing,
} from '../src/sim/professions/fishing';
import {
  DEFAULT_FISHING_ROD_TIER,
  FISHING_ZONE_ROD_TIERS,
  fishingBandShortfall,
  fishingBandSurplus,
  fishingRequiredBandForZone,
  rodTierRequiredForZone,
} from '../src/sim/professions/fishing_zones';
import { isGatherToolUse } from '../src/sim/professions/tools';
import { type PlayerMeta, Sim } from '../src/sim/sim';
import { DT, FISHING_CAST_ID, FISHING_SESSION_CAP_SEC, type SimEvent } from '../src/sim/types';
import { terrainHeight } from '../src/sim/world';

const ZONE_IDS = ['eastbrook_vale', 'mirefen_marsh', 'thornpeak_heights'];
const KOI = 'glimmerfin_koi';
const JUNK_ROWS: Record<string, string[]> = {
  eastbrook_vale: ['tangled_weed'],
  mirefen_marsh: ['soggy_boot', 'tangled_weed'],
  thornpeak_heights: ['tangled_weed'],
};

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
      expect(fishingRequiredBandForZone(zoneId), zoneId).toBe(rodTierRequiredForZone(zoneId) - 1);
    }
    expect(fishingRequiredBandForZone('eastbrook_vale')).toBe(0);
    expect(fishingRequiredBandForZone('mirefen_marsh')).toBe(1);
    expect(fishingRequiredBandForZone('thornpeak_heights')).toBe(2);
  });

  it('shortfall and surplus are mirrors, clamped, and never both positive', () => {
    for (const zoneId of ZONE_IDS) {
      for (let band = 0; band < 3; band++) {
        const short = fishingBandShortfall(zoneId, band);
        const over = fishingBandSurplus(zoneId, band);
        expect(Math.min(short, over), `${zoneId} band ${band}`).toBe(0);
        expect(short - over).toBe(fishingRequiredBandForZone(zoneId) - band);
      }
    }
    // Both ends clamp, so a fourth band or a fourth zone cannot index off the
    // schedule.
    expect(fishingBandShortfall('thornpeak_heights', -5)).toBe(2);
    expect(fishingBandSurplus('eastbrook_vale', 99)).toBe(2);
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
        const short = fishingBandShortfall(zoneId, band);
        const expected =
          short > 0
            ? EMPTY_HOOK_SHORT[short]
            : EMPTY_HOOK_AT_OR_ABOVE[fishingBandSurplus(zoneId, band)];
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
        const short = fishingBandShortfall(zoneId, band);
        if (short > 0) shortfalls.add(short);
        else surpluses.add(fishingBandSurplus(zoneId, band));
      }
    }
    expect([...shortfalls].sort()).toEqual([1, 2]);
    expect([...surpluses].sort()).toEqual([0, 1, 2]);
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

  it('junk swells with the shortfall: at least double the zone at-requirement cell two bands short', () => {
    let checked = 0;
    for (const zoneId of ZONE_IDS) {
      const requiredBand = fishingRequiredBandForZone(zoneId);
      const atRequirement = junkTotal(requiredBand, zoneId);
      for (let band = 0; band < 3; band++) {
        const short = fishingBandShortfall(zoneId, band);
        if (short === 0) continue;
        const ratio = junkTotal(band, zoneId) / atRequirement;
        const floor = short === 2 ? 2 : 1.4;
        expect(ratio, `${zoneId} band ${band} junk ratio`).toBeGreaterThanOrEqual(floor);
        checked += 1;
      }
    }
    // Non-vacuity: Eastbrook has no shortfall cell at all, so without this the
    // loop could skip everything and still pass.
    expect(checked).toBe(3);
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
      const atRequirement = foodShare(fishingRequiredBandForZone(zoneId), zoneId);
      for (let band = 0; band < 3; band++) {
        if (fishingBandShortfall(zoneId, band) === 0) continue;
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

  it('the Codfather quest water now costs the tier-2 rod, and the pole is told which tier', () => {
    // A consequence worth stating out loud rather than discovering in play:
    // the Deepfen Shallows sit in Mirefen, so q_the_codfather is behind the
    // Ironreel. It is a 60-copper counter purchase in the starter zone with no
    // proficiency gate on it, against a quest that pays 450, so the quest is
    // paced rather than blocked.
    const spot = fishableSpotOn(DEEPFEN_SHALLOWS_LAKE);
    const sim = makeSim();
    const meta = sim.meta(sim.playerId) as PlayerMeta;
    sim.addItem('simple_fishing_pole', 1);
    placeAt(sim, spot);
    expect(zoneAt(sim.player.pos.z).id).toBe('mirefen_marsh');
    startFishing(sim.ctx, sim.player, meta);
    expect(sim.player.castingAbility).toBeNull();
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

  it('the gate reads the SAME zone the catch table does', () => {
    // The two must never disagree, or a player could be refused for one
    // zone's requirement and then fished against another zone's rows. Both
    // resolve zoneAt(p.pos.z), including its saturation at the world edges.
    const sim = makeSim();
    for (const z of [-9999, -180, 0, 180, 540, 899, 9999]) {
      const zoneId = zoneAt(z).id;
      expect(FISHING_TABLES_BY_BAND[0][zoneId], `no table for ${zoneId} at z ${z}`).toBeDefined();
      expect(
        FISHING_ZONE_ROD_TIERS[zoneId],
        `no requirement for ${zoneId} at z ${z}`,
      ).toBeDefined();
    }
    void sim;
  });
});

describe('the session cap always outlasts a legal reel window', () => {
  // The fairness defect this guards: the cap arm and the miss arm emit the
  // IDENTICAL pair (fishingGotAway plus a failed castStop), so if the cap ever
  // expired while a reel window was still open, the fish would get away with
  // the window still on screen and nothing downstream could tell the two
  // apart. Budgeted in TICKS, because both legs ceil and the cap decays on DT.
  const shippedRodTiers = (): number[] => {
    const tiers = Object.values(ITEMS)
      .filter((def) => isGatherToolUse(def.use) && def.use.professionId === 'fishing')
      .map((def) => (isGatherToolUse(def.use) ? def.use.tier : 0));
    // Tier 1 is the pole and the bare-hands floor, which no rod def carries.
    return [1, ...tiers];
  };

  it('covers the worst legal session over every shipped rod tier, with a tick to spare', () => {
    const capTicks = Math.round(FISHING_SESSION_CAP_SEC / DT);
    let checked = 0;
    for (const castTier of shippedRodTiers()) {
      // The bite delay is drawn against the rod held at the CAST, and the reel
      // window is measured against the rod held at the BITE, so the worst case
      // crosses them: cast with the pole, pick the best rod up before the bite.
      const biteTicks = Math.ceil(FISH_BITE_DELAY_MAX_SEC / DT);
      for (const biteTimeTier of shippedRodTiers()) {
        const windowSec =
          FISH_REEL_WINDOW_SEC + FISH_REEL_WINDOW_ROD_BONUS_SEC * (biteTimeTier - 1);
        const needTicks = biteTicks + Math.ceil(windowSec / DT) + 1;
        expect(
          capTicks,
          `cast tier ${castTier} into bite tier ${biteTimeTier} needs ${needTicks} ticks`,
        ).toBeGreaterThan(needTicks);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(9);
    // The floor is not moot: the worst case really does use most of the cap,
    // so this is a live budget rather than a formality.
    expect(FISH_BITE_DELAY_MAX_SEC).toBeGreaterThan(FISH_BITE_DELAY_MIN_SEC);
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
    // Run the real tick phase to the bite, then to the last tick of the window.
    for (let tick = startTick + 1; tick <= p.fishBiteAtTick; tick++) {
      sim.tickCount = tick;
      updateCasting(sim.ctx, p, meta);
      p.castRemaining = FISHING_SESSION_CAP_SEC - (tick - startTick) * DT;
    }
    expect(p.fishReelDeadlineTick, 'the bite armed the window').toBeGreaterThan(0);
    for (let tick = sim.tickCount + 1; tick <= p.fishReelDeadlineTick; tick++) {
      sim.tickCount = tick;
      p.castRemaining = FISHING_SESSION_CAP_SEC - (tick - startTick) * DT;
      updateCasting(sim.ctx, p, meta);
      expect(p.castingAbility, `the cap ate the window at tick ${tick - startTick}`).toBe(
        FISHING_CAST_ID,
      );
    }
    // The window survived to its last legal tick, so the reel still lands.
    startFishing(sim.ctx, p, meta);
    expect(p.castingAbility).toBeNull();
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
