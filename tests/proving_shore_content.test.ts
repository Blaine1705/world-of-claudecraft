// The Proving Shore (tutorial island) content pins: every authored position
// sits on dry, walkable ground on the real terrain, the strait to the vale is
// honest open water, the on-rails chain is a strict rail (each quest requires
// the previous), every quest pays copper and ZERO experience, and the chain's
// total pays for the full tier-1 gathering tool set the quartermaster stocks.

import { describe, expect, it } from 'vitest';
import {
  BOOTCAMP_COURSE_CHECKPOINTS,
  PROVING_SHORE_ARRIVAL,
  PROVING_SHORE_CAMPS,
  PROVING_SHORE_NPCS,
  PROVING_SHORE_OBJECTS,
  PROVING_SHORE_PORTALS,
  PROVING_SHORE_PROPS,
  PROVING_SHORE_QUEST_ORDER,
  PROVING_SHORE_QUESTS,
  PROVING_SHORE_ROADS,
  PROVING_SHORE_ZONE,
} from '../src/sim/content/proving_shore';
import { MAILBOXES } from '../src/sim/content/mailboxes';
import { NOTICEBOARDS } from '../src/sim/content/noticeboards';
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
      // The Gauntlet's furniture and the camp's perimeter rails: every fence
      // post, mantle box, and checkpoint flag stands on dry walkable ground.
      ...(PROVING_SHORE_PROPS.fences ?? []).flatMap((f, i) => [
        { x: f.x1, z: f.z1, what: `fence[${i}].a` },
        { x: f.x2, z: f.z2, what: `fence[${i}].b` },
      ]),
      ...(PROVING_SHORE_PROPS.crates ?? []).map(([x, z], i) => ({ x, z, what: `crate[${i}]` })),
      ...(PROVING_SHORE_PROPS.decorProps ?? []).map((d, i) => ({
        x: d.x,
        z: d.z,
        what: `decor:${d.key}[${i}]`,
      })),
      // Road knots too: a spline knot in the shallows would paint a dirt
      // track into the sea and sprout a drowned streetlamp beside it.
      ...PROVING_SHORE_ROADS.flatMap((road, i) =>
        road.map((p, j) => ({ x: p.x, z: p.z, what: `road[${i}][${j}]` })),
      ),
    ];
    const wet = points.filter((p) => !dry(p.x, p.z)).map((p) => p.what);
    const steep = points.filter((p) => !walkable(p.x, p.z)).map((p) => p.what);
    expect(wet, `underwater: ${wet.join(', ')}`).toEqual([]);
    expect(steep, `too steep: ${steep.join(', ')}`).toEqual([]);
  });

  it('the camp services stand on dry walkable ground', () => {
    // The mailbox and the guild notice board are world services, authored
    // outside this module (content/mailboxes.ts, content/noticeboards.ts), so
    // the placement sweep above cannot see them.
    // Scoped to the island RECT, not just x: the northern realms sit in the
    // same western column (Amberfall's mailbox is at x -353).
    const inIsland = (p: { x: number; z: number }) =>
      p.x >= -540 && p.x < -180 && p.z >= -180 && p.z < 180;
    const mailbox = MAILBOXES.find(inIsland);
    expect(mailbox, 'the island mailbox').toBeTruthy();
    expect([mailbox?.x, mailbox?.z]).toEqual([-306, 56]);
    const board = NOTICEBOARDS.find(inIsland);
    expect(board, 'the island notice board').toBeTruthy();
    for (const point of [mailbox, board]) {
      if (!point) continue;
      expect(dry(point.x, point.z)).toBe(true);
      expect(walkable(point.x, point.z)).toBe(true);
    }
    // Its reading spot is reachable too, not stranded inside the board.
    const front = board?.frontStandingPoint;
    expect(front && dry(front.x, front.z)).toBe(true);
    // A second board needs its own reserved static-service id.
    expect(new Set(NOTICEBOARDS.map((b) => b.entityId)).size).toBe(NOTICEBOARDS.length);
  });

  it('the Gauntlet checkpoints mirror the authored flag dressing, in running order', () => {
    // The bootcamp overlay detects course progress by position against
    // BOOTCAMP_COURSE_CHECKPOINTS; the flags a player actually sees are the
    // decorProps hexFlag entries. One list must be the other, first to last
    // (the red flag is the finish), or the overlay would point at bare sand.
    const flags = (PROVING_SHORE_PROPS.decorProps ?? []).filter((d) => d.key.startsWith('hexFlag'));
    expect(flags.map((d) => ({ x: d.x, z: d.z }))).toEqual([...BOOTCAMP_COURSE_CHECKPOINTS]);
    expect(flags.at(-1)?.key).toBe('hexFlagRed');
    // The course flags live on the south strand near camp, NOT out at the
    // wreck line: the whole point of the move was to separate the two.
    for (const c of BOOTCAMP_COURSE_CHECKPOINTS) expect(c.x).toBeGreaterThan(-320);
  });

  it('the greeter stands on dry ground at the Eastbrook spawn', () => {
    const bryn = PROVING_SHORE_NPCS.wayfarer_bryn;
    expect(dry(bryn.pos.x, bryn.pos.z)).toBe(true);
  });

  it('the crossing is clicked bells on both shores, never a walk-in portal', () => {
    // The rework's contract: no walk-in portal trigger anywhere near the
    // island (nobody is teleported by wandering), and exactly one ferry bell
    // stands on each side of the strait (island pier, Eastbrook town beside
    // the greeter). Their dryness rides the placement sweep above (bells are
    // ground objects).
    expect(PROVING_SHORE_PORTALS).toEqual([]);
    const bells =
      PROVING_SHORE_OBJECTS.find((o) => o.itemId === 'ps_ferry_bell')?.positions ?? [];
    expect(bells.filter((b) => b.x < -180)).toHaveLength(1);
    expect(bells.filter((b) => b.x >= -180)).toHaveLength(1);
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

  it('the two mechanics lessons sit on the rail between looting and the crossing', () => {
    // The rework's contract: professions, then bank-and-bags, both AFTER the
    // two doing-lessons and BEFORE Set Sail.
    expect(PROVING_SHORE_QUEST_ORDER).toEqual([
      'q_ps_strike_true',
      'q_ps_the_wreck_line',
      'q_ps_the_wheel_of_trades',
      'q_ps_pouch_and_purse',
      'q_ps_set_sail',
    ]);
    // The bank lesson lives entirely at Maren: a banker's click opens the
    // bank window, not the quest gossip, so Bursar Wick can hold NO quest
    // (give or hand-in) and stays questIds-empty by design; Maren's
    // completion points at his desk instead.
    expect(PROVING_SHORE_NPCS.bursar_wick.banker).toBe(true);
    expect(PROVING_SHORE_NPCS.bursar_wick.questIds).toEqual([]);
    expect(PROVING_SHORE_QUESTS.q_ps_pouch_and_purse.giverNpcId).toBe('instructor_maren');
    expect(PROVING_SHORE_QUESTS.q_ps_pouch_and_purse.turnInNpcId).toBe('instructor_maren');
    // The pouch cannot be bought before the lesson opens (the vendor gate
    // items.ts buyItem enforces and the vendor window mirrors), so an early
    // purchase can never strand the lesson's copper.
    expect(PROVING_SHORE_NPCS.quartermaster_finch.vendorQuestGates).toEqual({
      linen_pouch: 'q_ps_pouch_and_purse',
    });
  });
});
