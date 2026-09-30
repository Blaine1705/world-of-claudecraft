// The Drowned Temple trash (src/sim/content/drowned_temple.ts, the reworked
// shipped templates in temple.ts) on the trash kit's Temple mechanics
// (src/sim/mob/trash_kit/temple_kit.ts): the Lullaby, the Pearl Carapace, the
// Tidewisp's burst, the Siren's Call the Tide, the Eel's Static Coil and the
// telegraphed frontals. Driven through tickTrashKits inside a real claimed
// Temple (the Bastion trash test's shape).

import { describe, expect, it } from 'vitest';
import { DROWNED_TEMPLE_SPAWNS } from '../src/sim/content/drowned_temple';
import { DUNGEONS, instanceOrigin, MOBS } from '../src/sim/data';
import { createMob } from '../src/sim/entity';
import { applyDungeonMobTuning } from '../src/sim/instances/difficulty';
import { claimedInstanceAt } from '../src/sim/instances/dungeons';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../src/sim/mob/healer_channel';
import { tickTrashKits } from '../src/sim/mob/trash_kit';
import {
  TEMPLE_CALL_THE_TIDE,
  TEMPLE_LULLABY,
  TEMPLE_LULLABY_SLEEP,
  TEMPLE_SNAP,
  TEMPLE_STATIC_COIL,
  TEMPLE_TRIDENT_SWEEP,
} from '../src/sim/mob/trash_kit/temple_cast_ids';
import { pickLullabyTarget, TEMPLE_CARAPACE_AURA } from '../src/sim/mob/trash_kit/temple_kit';
import type { InstanceSlot } from '../src/sim/sim';
import { Sim } from '../src/sim/sim';
import { DT, type Entity } from '../src/sim/types';

interface Room {
  sim: Sim;
  inst: InstanceSlot;
  me: Entity;
}

function room(difficulty: 'normal' | 'heroic' = 'normal'): Room {
  const sim = new Sim({ seed: 93, playerClass: 'warrior', autoEquip: false, devCommands: true });
  sim.chat('/dev level 20', sim.player.id);
  sim.chat(`/dev temple enter ${difficulty}`, sim.player.id);
  const inst = claimedInstanceAt(sim.ctx, sim.player.pos);
  if (!inst) throw new Error('no temple claim');
  const me = sim.player;
  me.maxHp = 1e6;
  me.hp = 1e6;
  const o = instanceOrigin(DUNGEONS.drowned_temple.index, inst.slot);
  // The Choir Court's stage, clear of every pack: a quiet test bench.
  me.pos = sim.ctx.groundPos(o.x, o.z - 12);
  me.prevPos = { ...me.pos };
  sim.drainEvents();
  return { sim, inst, me };
}

function engage(r: Room, templateId: string, dx = 6, dz = 0): Entity {
  const mob = createMob(r.sim.ctx.nextId++, MOBS[templateId], MOBS[templateId].minLevel, {
    ...r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz),
  });
  applyDungeonMobTuning(mob, 'drowned_temple', r.inst.difficulty);
  r.sim.ctx.addEntity(mob);
  r.inst.mobIds.push(mob.id);
  mob.inCombat = true;
  mob.aiState = 'attack';
  mob.aggroTargetId = r.me.id;
  mob.facing = Math.atan2(r.me.pos.x - mob.pos.x, r.me.pos.z - mob.pos.z);
  return mob;
}

function run(r: Room, seconds: number, mobs: Entity[]): void {
  for (let t = 0; t < seconds - DT * 0.5; t += DT) {
    for (const m of mobs) {
      if (m.dead || !r.sim.ctx.entities.has(m.id)) continue;
      m.inCombat = true;
      m.aiState = 'attack';
      m.aggroTargetId ??= r.me.id;
    }
    tickTrashKits(r.sim.ctx);
    r.sim.drainEvents();
  }
}

function addPlayer(r: Room, cls: 'mage' | 'priest' | 'warrior', dx: number, dz: number): Entity {
  const pid = r.sim.addPlayer(cls, `T${cls}${dx}${dz}`);
  const e = r.sim.ctx.entities.get(pid) as Entity;
  e.pos = r.sim.ctx.groundPos(r.me.pos.x + dx, r.me.pos.z + dz);
  e.prevPos = { ...e.pos };
  e.maxHp = 1e6;
  e.hp = 1e6;
  return e;
}

describe('Temple trash: the cast table', () => {
  it('kicks the lullaby, the tide call and the coil, never the bite or the sweep', () => {
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[TEMPLE_LULLABY]?.school).toBe('arcane');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[TEMPLE_CALL_THE_TIDE]?.school).toBe('frost');
    expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[TEMPLE_STATIC_COIL]?.school).toBe('nature');
    for (const id of [TEMPLE_SNAP, TEMPLE_TRIDENT_SWEEP])
      expect(SCRIPTED_INTERRUPTIBLE_CHANNELS[id], id).toBeUndefined();
  });

  it('gives every Temple trash type its readable job', () => {
    expect(MOBS.drowned_templeguard.breathCone?.castId).toBe(TEMPLE_TRIDENT_SWEEP);
    expect(MOBS.drowned_templeguard.charge?.name).toBe('Onrush');
    expect(MOBS.pale_choir_acolyte.trashKit?.lullaby?.castId).toBe(TEMPLE_LULLABY);
    expect(MOBS.glimmerscale_lurker.trashKit?.leap?.name).toBe('Pounce');
    expect(MOBS.pearlguard_sentinel.trashKit?.carapace?.belowHpPct).toBe(0.3);
    expect(MOBS.lagoon_snapper.breathCone?.castId).toBe(TEMPLE_SNAP);
    expect(MOBS.lagoon_eel.trashKit?.screech?.castId).toBe(TEMPLE_STATIC_COIL);
    expect(MOBS.moonlit_siren.trashKit?.call?.summon).toBe('tidewisp');
    expect(MOBS.moonlit_siren.trashKit?.call?.count).toBe(3);
    expect(MOBS.tidewisp.trashKit?.detonate?.radius).toBe(3);
    expect(MOBS.drowned_pilgrim.enrage?.belowHpPct).toBe(0.3);
  });

  it('places a varied roster: every Temple creature stands somewhere in the route', () => {
    const placed = new Set(DROWNED_TEMPLE_SPAWNS.map((s) => s.mobId));
    for (const id of [
      'drowned_templeguard',
      'pale_choir_acolyte',
      'glimmerscale_lurker',
      'pearlguard_sentinel',
      'lagoon_snapper',
      'lagoon_eel',
      'moonlit_siren',
      'drowned_pilgrim',
    ])
      expect(placed.has(id), id).toBe(true);
  });
});

describe('the Pale Choir Acolyte: Lullaby', () => {
  it('sings at someone other than its tank while anyone else is in reach', () => {
    const r = room();
    const acolyte = engage(r, 'pale_choir_acolyte');
    const mage = addPlayer(r, 'mage', -12, 0);
    const pick = pickLullabyTarget([r.me, mage], acolyte, 30, 0);
    expect(pick?.id).toBe(mage.id);
    // Alone, the tank is the only choice.
    expect(pickLullabyTarget([r.me], acolyte, 30, 0)?.id).toBe(r.me.id);
  });

  it('puts its victim to sleep when the bar runs out, and a hit wakes them', () => {
    const r = room();
    const acolyte = engage(r, 'pale_choir_acolyte');
    const mage = addPlayer(r, 'mage', -12, 0);
    const def = MOBS.pale_choir_acolyte.trashKit?.lullaby;
    if (!def) throw new Error('lullaby');
    run(r, def.first + 0.05, [acolyte]);
    expect(acolyte.castingAbility).toBe(TEMPLE_LULLABY);
    run(r, def.castTime + 0.05, [acolyte]);
    const sleep = mage.auras.find((a) => a.id === TEMPLE_LULLABY_SLEEP);
    expect(sleep?.kind).toBe('incapacitate');
    // Any damage breaks it.
    r.sim.ctx.dealDamage(acolyte, mage, 5, false, 'physical', 'Poke', 'hit');
    expect(mage.auras.some((a) => a.id === TEMPLE_LULLABY_SLEEP)).toBe(false);
  });

  it('an interrupt wastes the Lullaby', () => {
    const r = room();
    const acolyte = engage(r, 'pale_choir_acolyte');
    const mage = addPlayer(r, 'mage', -12, 0);
    const def = MOBS.pale_choir_acolyte.trashKit?.lullaby;
    if (!def) throw new Error('lullaby');
    run(r, def.first + 0.05, [acolyte]);
    expect(acolyte.castingAbility).toBe(TEMPLE_LULLABY);
    r.sim.ctx.cancelCast(acolyte);
    run(r, def.castTime + 0.2, [acolyte]);
    expect(mage.auras.some((a) => a.id === TEMPLE_LULLABY_SLEEP)).toBe(false);
  });
});

describe('the Pearlguard Sentinel: Pearl Carapace', () => {
  it('closes its shell once under 30 percent, worth a quarter of its health', () => {
    const r = room();
    const sentinel = engage(r, 'pearlguard_sentinel');
    run(r, 0.2, [sentinel]);
    expect(sentinel.auras.some((a) => a.id === TEMPLE_CARAPACE_AURA)).toBe(false);
    sentinel.hp = Math.floor(sentinel.maxHp * 0.29);
    run(r, 0.1, [sentinel]);
    const ward = sentinel.auras.find((a) => a.id === TEMPLE_CARAPACE_AURA);
    expect(ward?.kind).toBe('absorb');
    expect(ward?.value).toBe(Math.round(sentinel.maxHp * 0.25));
    // Only once per pull.
    sentinel.auras = sentinel.auras.filter((a) => a.id !== TEMPLE_CARAPACE_AURA);
    run(r, 1, [sentinel]);
    expect(sentinel.auras.some((a) => a.id === TEMPLE_CARAPACE_AURA)).toBe(false);
  });
});

describe('the Moonlit Siren and her Tidewisps', () => {
  it('Call the Tide raises three Tidewisps on the fight', () => {
    const r = room();
    const siren = engage(r, 'moonlit_siren', 14, 0);
    const def = MOBS.moonlit_siren.trashKit?.call;
    if (!def) throw new Error('call');
    run(r, def.first + def.castTime + 0.2, [siren]);
    const wisps = siren.summonedIds
      .map((id) => r.sim.ctx.entities.get(id))
      .filter((e): e is Entity => e?.templateId === 'tidewisp');
    expect(wisps).toHaveLength(3);
    expect(wisps.every((w) => w.aggroTargetId === r.me.id)).toBe(true);
  });

  it('a Tidewisp that reaches its victim bursts and is gone', () => {
    const r = room();
    const wisp = engage(r, 'tidewisp', 1.5, 0);
    const buddy = addPlayer(r, 'mage', 0, 2);
    r.me.hp = 1e6;
    buddy.hp = 1e6;
    run(r, DT, [wisp]);
    expect(r.sim.ctx.entities.has(wisp.id)).toBe(false);
    expect(r.me.hp).toBeLessThan(1e6);
    expect(buddy.hp).toBeLessThan(1e6);
  });

  it('a Tidewisp still on its way does nothing yet', () => {
    const r = room();
    const wisp = engage(r, 'tidewisp', 10, 0);
    run(r, DT * 3, [wisp]);
    expect(r.sim.ctx.entities.has(wisp.id)).toBe(true);
    expect(r.me.hp).toBe(1e6);
  });
});

describe('the Lagoon Eel: Static Coil', () => {
  it('shocks and stuns everyone within 8 yd when the bar runs out', () => {
    const r = room();
    const eel = engage(r, 'lagoon_eel', 4, 0);
    const far = addPlayer(r, 'mage', -14, 0);
    const def = MOBS.lagoon_eel.trashKit?.screech;
    if (!def) throw new Error('coil');
    run(r, def.first + def.castTime + 0.1, [eel]);
    expect(r.me.hp).toBeLessThan(1e6);
    expect(r.me.auras.some((a) => a.id === TEMPLE_STATIC_COIL && a.kind === 'stun')).toBe(true);
    expect(far.auras.some((a) => a.id === TEMPLE_STATIC_COIL)).toBe(false);
  });
});

describe('/dev temple kill trash', () => {
  it('clears every pack and patrol, and leaves the bosses and the Hydra standing', () => {
    const r = room();
    r.sim.chat('/dev temple kill trash', r.me.id);
    const spawns = DUNGEONS.drowned_temple.spawns;
    spawns.forEach((spawn, i) => {
      const mob = r.sim.ctx.entities.get(r.inst.mobIds[i]);
      const trash = spawn.packId !== undefined && spawn.packId !== 'hydra';
      expect(mob?.dead ?? true, `${spawn.mobId} #${i}`).toBe(trash);
    });
  });
});
