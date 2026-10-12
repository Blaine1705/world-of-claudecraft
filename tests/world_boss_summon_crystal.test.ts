import { describe, expect, it } from 'vitest';
import { BUILTIN_WORLD } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import { DT, type Entity, INTERACT_RANGE, type WorldContent } from '../src/sim/types';
import {
  WORLD_BOSS_SUMMON_CAST_ID,
  WORLD_BOSS_SUMMON_CHANNEL_SECONDS,
  WORLD_BOSS_SUMMON_RESPAWN_SECONDS,
  WORLD_BOSSES,
} from '../src/sim/world_boss';

// Vaelgrath is SUMMONED, not scheduled: the Emberwake Crystal stands on the
// Northspire approach in the Frostveil Reach, a player channels it for three
// seconds, it shatters, and the dragon lands on the summit table above. This
// suite drives that whole path through the real Sim.

const BOSS_ID = 'emberwake_vaelgrath';
const CRYSTAL_ITEM = 'emberwake_summon_crystal';

// Ambient camps/NPCs are irrelevant here and cost a continent to build.
const SUMMON_TEST_WORLD: WorldContent = {
  ...BUILTIN_WORLD,
  camps: [],
  npcs: {},
  groundObjects: [],
};

const bossIndex = WORLD_BOSSES.findIndex((b) => b.templateId === BOSS_ID);
const bossDef = WORLD_BOSSES[bossIndex];

function makeSim(seed = 11) {
  return new Sim({ seed, playerClass: 'warrior', autoEquip: true, world: SUMMON_TEST_WORLD });
}

function entities(sim: Sim): Entity[] {
  return [...(sim as unknown as { entities: Map<number, Entity> }).entities.values()];
}
function findCrystal(sim: Sim): Entity | undefined {
  return entities(sim).find((e) => e.kind === 'object' && e.objectItemId === CRYSTAL_ITEM);
}
function findBoss(sim: Sim): Entity | undefined {
  return entities(sim).find((e) => e.templateId === BOSS_ID && !e.dead);
}

/**
 * Put the player on the Northspire approach and tick once, which is what stands
 * the crystal up: the scheduler only spawns the focus while somebody is in the
 * region (it is an entity, and an entity nobody can see still shifts the sim's
 * id allocation and iteration for everyone else).
 */
function readyAtCrystal(sim: Sim): { crystal: Entity; player: Entity } {
  const player = sim.player;
  const at = bossDef.summonCrystal!.pos;
  player.pos.x = at.x + 1;
  player.pos.z = at.z;
  sim.tick();
  const crystal = findCrystal(sim);
  if (!crystal) throw new Error('the summoning crystal never appeared');
  player.pos.x = crystal.pos.x + 1;
  player.pos.z = crystal.pos.z;
  player.pos.y = crystal.pos.y;
  return { crystal, player };
}

/** Advance `seconds` of sim time. */
function run(sim: Sim, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) sim.tick();
}

describe('the Emberwake summoning crystal', () => {
  it('is registered as a summoned boss on the Northspire summit', () => {
    expect(bossIndex).toBeGreaterThanOrEqual(0);
    expect(bossDef.pos).toEqual({ x: 31.7, z: 1862.8 });
    // Summoned, not anchored to a map's player start.
    expect(bossDef.atPlayerStart).toBeUndefined();
    expect(bossDef.summonCrystal).toBeDefined();
    expect(bossDef.summonCrystal?.channelSeconds).toBe(3);
    // Three real hours (sim seconds; the sim runs at wall speed on the server).
    expect(bossDef.summonCrystal?.respawnSeconds).toBe(3 * 3600);
    // The crystal is a short walk BELOW the landing point, never on top of it.
    const d = Math.hypot(
      (bossDef.summonCrystal?.pos.x ?? 0) - bossDef.pos.x,
      (bossDef.summonCrystal?.pos.z ?? 0) - bossDef.pos.z,
    );
    expect(d).toBeGreaterThan(INTERACT_RANGE * 2);
    expect(d).toBeLessThan(40);
  });

  it('does not exist while nobody is anywhere near the Reach', () => {
    const sim = makeSim();
    // The default start is most of a world away from the Northspire.
    run(sim, 1);
    expect(findCrystal(sim)).toBeUndefined();
  });

  it('stands the crystal up and does NOT spawn the boss on its own', () => {
    const sim = makeSim();
    const { crystal } = readyAtCrystal(sim);
    expect(crystal.summonFocus?.bossIndex).toBe(bossIndex);
    expect(crystal.summonFocus?.total).toBe(WORLD_BOSS_SUMMON_CHANNEL_SECONDS);
    expect(findBoss(sim)).toBeUndefined();
    // Past a full scheduler interval, still nothing: the crystal is the clock.
    (sim as unknown as { worldBossNextAt: number[] }).worldBossNextAt[bossIndex] = 0;
    run(sim, 2);
    expect(findBoss(sim)).toBeUndefined();
    expect(findCrystal(sim)).toBeDefined();
  });

  it('summons the dragon after a full three-second channel, and shatters', () => {
    const sim = makeSim();
    const { crystal, player } = readyAtCrystal(sim);

    expect(sim.pickUpObject(crystal.id)).toBe(true);
    expect(player.castingAbility).toBe(WORLD_BOSS_SUMMON_CAST_ID);
    expect(player.channeling).toBe(true);
    expect(player.castTotal).toBe(WORLD_BOSS_SUMMON_CHANNEL_SECONDS);

    // Halfway: still channelling, no dragon yet.
    run(sim, WORLD_BOSS_SUMMON_CHANNEL_SECONDS / 2);
    expect(findBoss(sim)).toBeUndefined();
    expect(player.channeling).toBe(true);
    expect(player.castRemaining).toBeLessThan(WORLD_BOSS_SUMMON_CHANNEL_SECONDS);

    // Past the full channel: the crystal is gone and Vaelgrath is on the summit.
    run(sim, WORLD_BOSS_SUMMON_CHANNEL_SECONDS);
    const boss = findBoss(sim);
    expect(boss).toBeDefined();
    expect(findCrystal(sim)).toBeUndefined();
    expect(player.channeling).toBe(false);
    expect(player.castingAbility).toBeNull();
    // He lands on the authored point, grounded to the terrain there.
    expect(boss?.pos.x).toBeCloseTo(bossDef.pos.x, 3);
    expect(boss?.pos.z).toBeCloseTo(bossDef.pos.z, 3);
  });

  it('breaks the channel when the caller walks out of range, with no summon', () => {
    const sim = makeSim();
    const { crystal, player } = readyAtCrystal(sim);
    sim.pickUpObject(crystal.id);
    run(sim, 1);
    expect(player.channeling).toBe(true);

    player.pos.x = crystal.pos.x + INTERACT_RANGE + 12;
    run(sim, 0.5);
    expect(player.channeling).toBe(false);
    expect(player.castingAbility).toBeNull();
    expect(crystal.summonFocus?.playerId).toBeNull();
    // The bar reset: a broken channel does not resume where it stopped.
    expect(crystal.summonFocus?.remaining).toBe(WORLD_BOSS_SUMMON_CHANNEL_SECONDS);

    run(sim, WORLD_BOSS_SUMMON_CHANNEL_SECONDS + 1);
    expect(findBoss(sim)).toBeUndefined();
    expect(findCrystal(sim)).toBeDefined();
  });

  it('does not reform the crystal for three hours after a summon', () => {
    const sim = makeSim();
    const { crystal } = readyAtCrystal(sim);
    sim.pickUpObject(crystal.id);
    run(sim, WORLD_BOSS_SUMMON_CHANNEL_SECONDS + 0.5);
    expect(findBoss(sim)).toBeDefined();

    const state = sim as unknown as {
      worldBossCrystalAt: number[];
      worldBossEntityIds: (number | null)[];
      time: number;
    };
    expect(state.worldBossCrystalAt[bossIndex]).toBeGreaterThanOrEqual(
      state.time + WORLD_BOSS_SUMMON_RESPAWN_SECONDS - 1,
    );

    // Clear the boss slot (as a kill + corpse expiry would) and jump to just
    // before the window: still nothing to touch.
    state.worldBossEntityIds[bossIndex] = null;
    state.time = state.worldBossCrystalAt[bossIndex] - 5;
    sim.tick();
    expect(findCrystal(sim)).toBeUndefined();

    // Past the window it reforms, ready to be called again.
    state.time = state.worldBossCrystalAt[bossIndex] + 1;
    sim.tick();
    expect(findCrystal(sim)).toBeDefined();
  });

  it('announces the summon with its own broadcast line', () => {
    const sim = makeSim();
    const { crystal } = readyAtCrystal(sim);
    sim.pickUpObject(crystal.id);
    let text = '';
    for (let t = 0; t < WORLD_BOSS_SUMMON_CHANNEL_SECONDS + 0.5; t += DT) {
      for (const ev of sim.tick()) {
        if (ev.type === 'log' && ev.text.includes('Vaelgrath')) text = ev.text;
      }
    }
    // Its OWN line, not the scheduled-boss "rises over Thornpeak Heights".
    expect(text).toBe('Vaelgrath, the Emberwake answers the shattered crystal!');
  });

  it('refuses a second caller while someone is already channelling', () => {
    const sim = makeSim();
    const { crystal, player } = readyAtCrystal(sim);
    sim.pickUpObject(crystal.id);
    run(sim, 0.5);

    const otherId = sim.addPlayer('mage', 'Second', { autoEquip: true });
    const other = (sim as unknown as { entities: Map<number, Entity> }).entities.get(otherId);
    if (!other) throw new Error('second player missing');
    other.pos.x = crystal.pos.x + 1;
    other.pos.z = crystal.pos.z;
    other.pos.y = crystal.pos.y;

    sim.pickUpObject(crystal.id, otherId);
    expect(other.channeling).toBe(false);
    // The original caller keeps it.
    expect(crystal.summonFocus?.playerId).toBe(player.id);
  });
});
