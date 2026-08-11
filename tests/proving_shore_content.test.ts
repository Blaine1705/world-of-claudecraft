// The Proving Shore (tutorial island) content pins: every authored position
// sits on dry, walkable ground on the real terrain, the strait to the vale is
// honest open water, the on-rails chain is a strict rail (each quest requires
// the previous), every quest pays copper and ZERO experience, and the chain's
// total pays for the full tier-1 gathering tool set the quartermaster stocks.

import { describe, expect, it } from 'vitest';
import {
  PROVING_SHORE_ARRIVAL,
  PROVING_SHORE_CAMPS,
  PROVING_SHORE_NPCS,
  PROVING_SHORE_OBJECTS,
  PROVING_SHORE_PORTALS,
  PROVING_SHORE_QUEST_ORDER,
  PROVING_SHORE_QUESTS,
  PROVING_SHORE_ZONE,
} from '../src/sim/content/proving_shore';
import { ITEMS, ZONES } from '../src/sim/data';
import { groundHeight, provingLandness, terrainSteepnessAt, WATER_LEVEL } from '../src/sim/world';
import { WORLD_SEED } from '../src/sim/world_seed';

const PLAYER_MAX_CLIMB_SLOPE = 1.5;

function dry(x: number, z: number): boolean {
  return groundHeight(x, z, WORLD_SEED) >= WATER_LEVEL + 0.5;
}
function walkable(x: number, z: number): boolean {
  return terrainSteepnessAt(x, z, WORLD_SEED) <= PLAYER_MAX_CLIMB_SLOPE;
}

describe('proving shore placement', () => {
  it('registers the zone', () => {
    expect(ZONES.some((zn) => zn.id === 'proving_shore')).toBe(true);
  });

  it('hub, graveyard, pois, arrival, npcs, camps, and crates sit on dry walkable ground', () => {
    const points: { x: number; z: number; what: string }[] = [
      { ...PROVING_SHORE_ZONE.hub, what: 'hub' },
      { ...PROVING_SHORE_ZONE.graveyard, what: 'graveyard' },
      ...PROVING_SHORE_ZONE.pois.map((p) => ({ x: p.x, z: p.z, what: `poi:${p.id}` })),
      { x: PROVING_SHORE_ARRIVAL.x, z: PROVING_SHORE_ARRIVAL.z, what: 'arrival' },
      ...Object.values(PROVING_SHORE_NPCS)
        .filter((n) => n.id !== 'wayfarer_bryn') // the greeter stands in Eastbrook
        .map((n) => ({ x: n.pos.x, z: n.pos.z, what: `npc:${n.id}` })),
      ...PROVING_SHORE_CAMPS.map((c) => ({ ...c.center, what: `camp:${c.mobId}` })),
      ...PROVING_SHORE_OBJECTS.flatMap((o) =>
        o.positions.map((p, i) => ({ x: p.x, z: p.z, what: `object:${o.itemId}[${i}]` })),
      ),
    ];
    const wet = points.filter((p) => !dry(p.x, p.z)).map((p) => p.what);
    const steep = points.filter((p) => !walkable(p.x, p.z)).map((p) => p.what);
    expect(wet, `underwater: ${wet.join(', ')}`).toEqual([]);
    expect(steep, `too steep: ${steep.join(', ')}`).toEqual([]);
  });

  it('the greeter stands on dry ground at the Eastbrook spawn', () => {
    const bryn = PROVING_SHORE_NPCS.wayfarer_bryn;
    expect(dry(bryn.pos.x, bryn.pos.z)).toBe(true);
  });

  it('both ferry portal sides and landings sit on dry ground', () => {
    for (const portal of PROVING_SHORE_PORTALS) {
      for (const side of [portal.a, portal.b]) {
        expect(dry(side.x, side.z), `portal trigger (${side.x}, ${side.z})`).toBe(true);
        expect(
          dry(side.landing.x, side.landing.z),
          `portal landing (${side.landing.x}, ${side.landing.z})`,
        ).toBe(true);
      }
    }
  });

  it('the strait to the vale is open water (the island is isolated)', () => {
    for (const z of [-120, -60, 0, 60, 120]) {
      const h = groundHeight(-180, z, WORLD_SEED);
      expect(h, `strait at z=${z}`).toBeLessThan(WATER_LEVEL - 1);
    }
    expect(provingLandness(PROVING_SHORE_ZONE.hub.x, PROVING_SHORE_ZONE.hub.z)).toBeGreaterThan(
      0.3,
    );
  });

  it('the quest chain is a strict rail with zero XP and copper on every step', () => {
    const order = PROVING_SHORE_QUEST_ORDER;
    expect(order[0]).toBe(PROVING_SHORE_ZONE.welcomeQuestId);
    for (let i = 0; i < order.length; i++) {
      const q = PROVING_SHORE_QUESTS[order[i]];
      expect(q, order[i]).toBeTruthy();
      expect(q.xpReward, `${q.id} xp`).toBe(0);
      expect(q.copperReward, `${q.id} copper`).toBeGreaterThan(0);
      if (i === 0) expect(q.requiresQuest).toBeUndefined();
      else expect(q.requiresQuest, `${q.id} requires`).toBe(order[i - 1]);
    }
  });

  it('the chain pays for the pouch lesson AND the tool set, and vendors no tools', () => {
    // The island vendor stocks provisions and the bank lesson's Linen Pouch,
    // NEVER professions tools (the R37 rule
    // tests/professions_zone_rollout.test.ts enforces): the chain's copper is
    // sized to buy the pouch mid-chain and the tier-1 tool kit at the vale's
    // own counters after.
    const stocked = PROVING_SHORE_NPCS.quartermaster_finch.vendorItems ?? [];
    expect(stocked).toContain('linen_pouch');
    for (const id of stocked) {
      expect(ITEMS[id]?.use?.type === 'gatherTool', `${id} is a professions tool`).toBe(false);
    }
    // The full tier-1 gathering kit at the vale's counters.
    const TOOL_SET = ['copper_mining_pick', 'handaxe', 'gathering_sickle', 'simple_fishing_pole'];
    const toolCost = TOOL_SET.reduce((sum, id) => sum + (ITEMS[id]?.buyValue ?? 0), 0);
    expect(toolCost).toBeGreaterThan(0);
    const totalCopper = PROVING_SHORE_QUEST_ORDER.reduce(
      (sum, id) => sum + PROVING_SHORE_QUESTS[id].copperReward,
      0,
    );
    // The bank lesson (q_ps_pouch_and_purse) makes the player SPEND the
    // pouch's price mid-chain, so the spendable total is rewards minus one
    // pouch; it must still cover the whole tool set.
    const pouch = ITEMS.linen_pouch?.buyValue ?? 0;
    expect(pouch).toBeGreaterThan(0);
    expect(totalCopper - pouch).toBeGreaterThanOrEqual(toolCost);
    // And the pouch is affordable from quest rewards alone when its lesson
    // unlocks: every quest BEFORE q_ps_pouch_and_purse in the rail pays in.
    const pouchAt = PROVING_SHORE_QUEST_ORDER.indexOf('q_ps_pouch_and_purse');
    expect(pouchAt).toBeGreaterThan(0);
    const beforeLesson = PROVING_SHORE_QUEST_ORDER.slice(0, pouchAt).reduce(
      (sum, id) => sum + PROVING_SHORE_QUESTS[id].copperReward,
      0,
    );
    expect(beforeLesson).toBeGreaterThanOrEqual(pouch);
  });

  it('the three mechanics lessons sit on the rail between looting and the crossing', () => {
    // The rework's contract: talents/specialization, then professions, then
    // bank-and-bags, all AFTER the two doing-lessons and BEFORE Set Sail.
    expect(PROVING_SHORE_QUEST_ORDER).toEqual([
      'q_ps_strike_true',
      'q_ps_the_wreck_line',
      'q_ps_a_path_of_your_own',
      'q_ps_the_wheel_of_trades',
      'q_ps_pouch_and_purse',
      'q_ps_set_sail',
    ]);
    // The bank lesson's giver is a real banker: the bank window is reachable
    // from the same NPC whose dialogue teaches it.
    expect(PROVING_SHORE_NPCS.bursar_wick.banker).toBe(true);
  });
});
