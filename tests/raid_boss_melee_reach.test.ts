import { describe, expect, it } from 'vitest';
import { startAutoAttack, updatePlayerAutoAttack } from '../src/sim/combat/auto_attack';
import {
  BODY_EDGE_MELEE_REACH,
  effectivePlayerAttackRange,
  RAID_BOSS_PLAYER_MELEE_RANGE,
} from '../src/sim/combat/player_attack_reach';
import { MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { VARKHUL_BOSS_ID } from '../src/sim/ignivar_raid_ids';
import { combatProfileForMob } from '../src/sim/mob_combat';
import { Sim } from '../src/sim/sim';
import { IGNIVAR_BOSS_ID, MELEE_RANGE } from '../src/sim/types';

const RAID_BOSS_IDS = [IGNIVAR_BOSS_ID, VARKHUL_BOSS_ID] as const;

function raidBossTarget(templateId: typeof IGNIVAR_BOSS_ID | typeof VARKHUL_BOSS_ID, distance = 8) {
  const sim = new Sim({ seed: 771, playerClass: 'warrior', autoEquip: true });
  sim.setPlayerLevel(20);
  sim.setSpec('arms');
  const player = sim.player;
  const meta = sim.players.get(player.id);
  if (!meta) throw new Error('Warrior metadata missing');
  player.resource = player.maxResource;
  const boss = createMob(sim.nextId++, MOBS[templateId], 20, {
    x: player.pos.x,
    y: player.pos.y,
    z: player.pos.z + distance,
  });
  boss.maxHp = 1_000_000;
  boss.hp = boss.maxHp;
  boss.stats = { ...boss.stats, armor: 0 };
  sim.addEntity(boss);
  sim.targetEntity(boss.id, player.id);
  return { sim, player, meta, boss };
}

describe('raid boss player attack reach', () => {
  it('pins the enlarged raid boss melee boundary', () => {
    expect(RAID_BOSS_PLAYER_MELEE_RANGE).toBe(8);
  });

  it.each(RAID_BOSS_IDS)(
    'extends melee attacks against %s without changing ranged attacks',
    (templateId) => {
      const boss = { kind: 'mob' as const, templateId };

      expect(effectivePlayerAttackRange(boss, MELEE_RANGE)).toBe(8);
      expect(effectivePlayerAttackRange(boss, 0)).toBe(8);
      expect(effectivePlayerAttackRange(boss, 30)).toBe(30);
    },
  );

  it('keeps ordinary mob melee reach unchanged', () => {
    const mob = { kind: 'mob' as const, templateId: 'forest_wolf' };

    expect(effectivePlayerAttackRange(mob, MELEE_RANGE)).toBe(MELEE_RANGE);
    expect(effectivePlayerAttackRange(mob, 0)).toBe(MELEE_RANGE);
  });

  it.each(RAID_BOSS_IDS)(
    'allows a real player swing at the enlarged %s footprint',
    (templateId) => {
      const { sim, player, meta, boss } = raidBossTarget(templateId);

      startAutoAttack(sim.ctx, player.id);
      expect(boss.aggroTargetId).toBe(player.id);
      player.swingTimer = 0;
      for (let attempt = 0; attempt < 20 && boss.hp === boss.maxHp; attempt++) {
        updatePlayerAutoAttack(sim.ctx, player, meta);
        player.swingTimer = 0;
      }

      expect(boss.hp).toBeLessThan(boss.maxHp);
    },
  );

  it.each(RAID_BOSS_IDS)(
    'allows a real melee ability at the enlarged %s footprint',
    (templateId) => {
      const { sim, player, boss } = raidBossTarget(templateId);

      sim.castAbility('mortal_strike', player.id);

      expect(player.cooldowns.get('mortal_strike')).toBeGreaterThan(0);
      expect(boss.hp).toBeLessThan(boss.maxHp);
    },
  );

  it.each(RAID_BOSS_IDS)('rejects melee just outside the enlarged %s footprint', (templateId) => {
    const { sim, player, meta, boss } = raidBossTarget(templateId, 8.01);

    startAutoAttack(sim.ctx, player.id);
    player.swingTimer = 0;
    updatePlayerAutoAttack(sim.ctx, player, meta);
    expect(boss.aggroTargetId).toBeNull();
    expect(boss.hp).toBe(boss.maxHp);

    sim.castAbility('mortal_strike', player.id);
    expect(player.cooldowns.has('mortal_strike')).toBe(false);
    expect(boss.hp).toBe(boss.maxHp);
  });
});

// The towering dungeon bosses author a bodyRadius (MobTemplate): a player's
// melee reaches the edge of the body (bodyRadius + 3) instead of standing
// inside the model (Ysolei's coils spread 8 yd round her pivot), and the
// boss's own swing reaches one yard further, so nobody hits from outside it.
describe('big-bodied boss reach (bodyRadius)', () => {
  const BODIED = Object.values(MOBS).filter((m) => (m.bodyRadius ?? 0) > 0);

  it('covers the reworked dungeons’ big bosses', () => {
    const ids = BODIED.map((m) => m.id);
    for (const id of [
      'ysolei',
      'crypt_knellwyrm',
      'morthen',
      'line_master_tock',
      'voltaic_warden',
      'prime_draft',
    ])
      expect(ids).toContain(id);
  });

  it.each(BODIED.map((m) => [m.id, m.bodyRadius as number, m.scale] as const))(
    '%s: melee reaches its edge, and its own swing outreaches the player',
    (id, body, scale) => {
      const target = { kind: 'mob' as const, templateId: id };
      const reach = effectivePlayerAttackRange(target, MELEE_RANGE);
      expect(reach).toBe(body + BODY_EDGE_MELEE_REACH);
      expect(effectivePlayerAttackRange(target, 30)).toBe(30);
      expect(combatProfileForMob(id, scale).meleeRange).toBeGreaterThan(reach);
    },
  );

  it('Ysolei: a swing lands from the edge of her coil, 10.5 yd out', () => {
    const sim = new Sim({ seed: 771, playerClass: 'warrior', autoEquip: true });
    sim.setPlayerLevel(20);
    const player = sim.player;
    const meta = sim.players.get(player.id);
    if (!meta) throw new Error('no meta');
    const boss = createMob(sim.nextId++, MOBS.ysolei, 18, {
      x: player.pos.x,
      y: player.pos.y,
      z: player.pos.z + 10.5,
    });
    boss.maxHp = 1_000_000;
    boss.hp = boss.maxHp;
    boss.stats = { ...boss.stats, armor: 0 };
    sim.addEntity(boss);
    sim.targetEntity(boss.id, player.id);
    startAutoAttack(sim.ctx, player.id);
    player.swingTimer = 0;
    for (let attempt = 0; attempt < 20 && boss.hp === boss.maxHp; attempt++) {
      updatePlayerAutoAttack(sim.ctx, player, meta);
      player.swingTimer = 0;
    }
    expect(boss.hp).toBeLessThan(boss.maxHp);
  });
});
