import { describe, expect, it, vi } from 'vitest';

// Mock the db layer so importing server/game (for wireEntity) needs no Postgres,
// mirroring tests/snapshots.test.ts.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
}));

import { meleeSwing } from '../src/sim/combat/auto_attack';
import {
  DEFAULT_MOUNT,
  MOUNT_KEYS,
  MOUNTS,
  mountDef,
  mountMeleeBlockPct,
  normalizeMountKey,
  normalizeSelectedMount,
} from '../src/sim/content/mounts';
import { ITEMS, MOBS, QUESTS } from '../src/sim/data';
import {
  MOUNT_DISMOUNT_SECONDS,
  MOUNT_SUMMON_SECONDS,
  mountItemId,
  mountOwned,
  ownedMounts,
  selectMount,
  toggleMount,
  updateMountTransition,
} from '../src/sim/mounts';
import { moveSpeedMult } from '../src/sim/player_motion';
import { Sim } from '../src/sim/sim';
import { DT, type MountItemDef, type SimEvent } from '../src/sim/types';

function makeWorld() {
  return new Sim({ seed: 42, playerClass: 'warrior', noPlayer: true });
}

function join(sim: Sim, level = 20): number {
  const pid = sim.addPlayer('warrior', 'Rider');
  sim.tick();
  if (level > 1) sim.setPlayerLevel(level, pid);
  return pid;
}

function errorTexts(events: SimEvent[]): string[] {
  return events
    .filter((e): e is Extract<SimEvent, { type: 'error' }> => e.type === 'error')
    .map((e) => e.text);
}

// Drive the mount summon/dismount channel to completion by hand. The tick-loop
// integration (updateMountTransition wired into sim.tick) is covered in
// tests/mount_transition.test.ts; here we call the transition directly with
// swimming=false so these unit tests do not depend on that wiring landing.
function finishTransition(sim: Sim, pid: number, swimming = false): void {
  const e = sim.entities.get(pid)!;
  const steps = Math.ceil(MOUNT_SUMMON_SECONDS / DT) + 2;
  for (let i = 0; i < steps && (e.mountCastRemaining ?? 0) > 0; i++) {
    updateMountTransition(sim.ctx, e, swimming);
  }
}

// Toggle to mount and drive the summon channel to completion.
function ride(sim: Sim, pid: number): void {
  toggleMount(sim.ctx, pid);
  finishTransition(sim, pid);
}

describe('mount catalog (the six ground mounts from the cards)', () => {
  it('has exactly the six mounts with the horse first (the base mount)', () => {
    expect(MOUNT_KEYS).toHaveLength(6);
    expect(MOUNT_KEYS[0]).toBe('valorsteed');
    expect(DEFAULT_MOUNT).toBe('valorsteed');
  });

  it('pins each card: level gate, rarity, and specialty numbers (60% base, tiered above)', () => {
    const spec = (k: string) => {
      const d = MOUNTS[k as keyof typeof MOUNTS];
      return [d.level, d.rarity, d.moveSpeedPct, d.meleeBlockPct, d.critPct];
    };
    expect(spec('valorsteed')).toEqual([20, 'common', 0.6, 0, 0]);
    expect(spec('grag_bear')).toEqual([10, 'common', 0.7, 0.05, 0]);
    expect(spec('stalkglider_snail')).toEqual([10, 'common', 0.7, 0.05, 0]);
    expect(spec('aether_hover_cycle')).toEqual([15, 'rare', 0.75, 0.05, 0.03]);
    expect(spec('shadowjump_toad')).toEqual([15, 'rare', 0.75, 0.05, 0.03]);
    expect(spec('stormfeather_griffin')).toEqual([20, 'epic', 0.8, 0.08, 0.05]);
  });

  it('normalizeMountKey coerces unknown or absent keys to "" (unmounted)', () => {
    expect(normalizeMountKey('valorsteed')).toBe('valorsteed');
    expect(normalizeMountKey('flying_carpet')).toBe('');
    expect(normalizeMountKey(undefined)).toBe('');
    expect(normalizeMountKey(null)).toBe('');
    expect(mountDef('nope')).toBeNull();
  });

  it('normalizeSelectedMount coerces unknown or absent picks to the horse', () => {
    expect(normalizeSelectedMount('grag_bear')).toBe('grag_bear');
    expect(normalizeSelectedMount('flying_carpet')).toBe('valorsteed');
    expect(normalizeSelectedMount(undefined)).toBe('valorsteed');
    expect(normalizeSelectedMount(null)).toBe('valorsteed');
    expect(normalizeSelectedMount('')).toBe('valorsteed');
  });

  it('pins the summon and dismount channel durations', () => {
    expect(MOUNT_SUMMON_SECONDS).toBe(1.5);
    expect(MOUNT_DISMOUNT_SECONDS).toBe(0.8);
  });
});

describe('mount reins items (the collection: owning the item is owning the mount)', () => {
  const reinsFor = (key: string) =>
    Object.values(ITEMS).filter((d) => d.kind === 'mount' && d.mount === key) as MountItemDef[];

  it('every mount has exactly one soulbound reins item (the horse now included)', () => {
    for (const key of MOUNT_KEYS) {
      const items = reinsFor(key);
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(mountItemId(key)).toBe(item.id);
      expect(item.soulbound).toBe(true); // never traded, mailed, listed, or destroyed
      expect(item.sellValue).toBe(0);
      // The item's name color matches the card's rarity tier.
      expect(item.quality).toBe(MOUNTS[key].rarity);
    }
  });

  it('only the horse reins is purchasable, for 100 gold; the rest are loot-only', () => {
    const horse = reinsFor('valorsteed')[0];
    expect(horse.id).toBe('reins_valorsteed');
    expect(horse.buyValue).toBe(1_000_000); // 100 gold in copper
    for (const key of MOUNT_KEYS.filter((k) => k !== 'valorsteed')) {
      expect(reinsFor(key)[0].buyValue).toBeUndefined();
    }
  });

  it('pins each reins item to its boss drop (a sub-1% independent draw, no roll group)', () => {
    const drops: Array<[string, string, number]> = [
      ['morthen', 'reins_grag_bear', 0.009],
      ['vael_the_mistcaller', 'reins_stalkglider_snail', 0.009],
      ['ysolei', 'reins_aether_hover_cycle', 0.005],
      ['korzul_the_gravewyrm', 'reins_shadowjump_toad', 0.005],
      ['nythraxis_scourge_of_thornpeak', 'reins_stormfeather_griffin', 0.002],
    ];
    for (const [mobId, itemId, chance] of drops) {
      const entry = MOBS[mobId].loot.find((l) => l.itemId === itemId);
      expect(entry, `${mobId} drops ${itemId}`).toBeDefined();
      expect(entry?.chance).toBe(chance);
      expect(entry?.rollGroup).toBeUndefined();
      expect(entry?.questId).toBeUndefined();
    }
  });

  it('ownership: a fresh player owns nothing; a mount only while its reins is held', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const meta = sim.players.get(pid)!;
    expect(ownedMounts(meta)).toEqual([]);
    expect(mountOwned(meta, 'valorsteed')).toBe(false);
    expect(mountOwned(meta, 'grag_bear')).toBe(false);
    expect(mountOwned(meta, 'flying_carpet')).toBe(false);

    sim.addItem('reins_valorsteed', 1, pid);
    expect(mountOwned(meta, 'valorsteed')).toBe(true);
    expect(ownedMounts(meta)).toEqual(['valorsteed']);

    sim.addItem('reins_grag_bear', 1, pid);
    expect(ownedMounts(meta)).toEqual(['valorsteed', 'grag_bear']); // catalog order

    // A reins item parked in the bank still counts (bags OR bank).
    meta.bank.inventory.push({ itemId: 'reins_stormfeather_griffin', count: 1 });
    expect(mountOwned(meta, 'stormfeather_griffin')).toBe(true);
    expect(ownedMounts(meta)).toContain('stormfeather_griffin');
  });

  it('exposes the collection on the IWorld facade (ownedMounts), empty for a fresh player', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    expect(sim.ownedMounts()).toEqual([]);
    sim.addItem('reins_shadowjump_toad', 1, pid);
    expect(sim.ownedMounts()).toEqual(['shadowjump_toad']);
    expect(sim.ownedMountsFor(pid)).toEqual(['shadowjump_toad']);
  });
});

// The stablemaster no longer sells the horse reins directly: she teaches the
// q_riding_lessons quest (giver/turn-in) and the reins are its itemReward,
// granted only through the mount-training minigame's 'interact' objective
// (sentinel targetObjectItemId 'train_valorsteed'). The old direct-purchase
// flow this block used to cover is replaced by tests/mounts_training.test.ts;
// this block now pins the new giver/reward wiring instead.
describe('mount purchase (the stablemaster teaches, no longer sells)', () => {
  const stablemaster = (sim: Sim) =>
    [...sim.entities.values()].find(
      (e) => e.kind === 'npc' && e.templateId === 'stablemaster_marla',
    )!;

  // Stand the player on the stablemaster so the vendor range check passes.
  function standAtStable(sim: Sim, pid: number): number {
    const npc = stablemaster(sim);
    const e = sim.entities.get(pid)!;
    e.pos.x = npc.pos.x;
    e.pos.z = npc.pos.z;
    return npc.id;
  }

  it('spawns the stablemaster stocking nothing; she offers q_riding_lessons, not a sale', () => {
    const sim = makeWorld();
    join(sim, 20);
    const npc = stablemaster(sim);
    expect(npc).toBeDefined();
    expect(npc.vendorItems).toEqual([]); // no vendorItems: reins is not for sale here
    expect(npc.questIds).toContain('q_riding_lessons');
  });

  it('refuses a direct buyItem for the horse reins; no charge, no item', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const meta = sim.players.get(pid)!;
    meta.copper = 2_000_000;
    const npcId = standAtStable(sim, pid);
    sim.buyItem(npcId, 'reins_valorsteed', pid);
    expect(errorTexts(sim.tick())).toContain('That merchant is not available.');
    expect(meta.copper).toBe(2_000_000);
    expect(sim.countItem('reins_valorsteed', pid)).toBe(0);
    expect(mountOwned(meta, 'valorsteed')).toBe(false);
  });

  it('gates the horse behind q_riding_lessons instead: level 20, given/turned in at Marla', () => {
    const quest = QUESTS['q_riding_lessons'];
    expect(quest).toBeDefined();
    expect(quest.giverNpcId).toBe('stablemaster_marla');
    expect(quest.turnInNpcId).toBe('stablemaster_marla');
    expect(quest.minLevel).toBe(20);
  });

  it('the quest itemReward is the horse reins for every class, tied to the training objective', () => {
    const quest = QUESTS['q_riding_lessons'];
    expect(quest.itemRewards).toEqual({
      warrior: 'reins_valorsteed',
      mage: 'reins_valorsteed',
      rogue: 'reins_valorsteed',
    });
    expect(quest.objectives).toHaveLength(1);
    const obj = quest.objectives[0];
    expect(obj.type).toBe('interact');
    expect(obj.targetObjectItemId).toBe('train_valorsteed');
    expect(obj.count).toBe(1);
  });
});

describe('mount selection', () => {
  it('defaults to the horse: the pick every unknown/legacy value falls back to', () => {
    const sim = makeWorld();
    const pid = join(sim, 1);
    expect(sim.selectedMount()).toBe('valorsteed');
    expect(sim.players.get(pid)?.selectedMount).toBe('valorsteed');
  });

  it('rejects an unknown key and leaves the pick unchanged', () => {
    const sim = makeWorld();
    const pid = join(sim);
    expect(selectMount(sim.ctx, pid, 'flying_carpet')).toBe(false);
    expect(sim.selectedMount()).toBe('valorsteed');
  });

  it('rejects an uncollected mount with the no-item error', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    expect(selectMount(sim.ctx, pid, 'stormfeather_griffin')).toBe(false);
    expect(errorTexts(sim.tick())).toContain("You don't have that item.");
    expect(sim.selectedMount()).toBe('valorsteed');
    sim.addItem('reins_stormfeather_griffin', 1, pid);
    expect(selectMount(sim.ctx, pid, 'stormfeather_griffin')).toBe(true);
    expect(sim.selectedMount()).toBe('stormfeather_griffin');
  });

  it('level-gates the pick and emits the mountLevel error', () => {
    const sim = makeWorld();
    const pid = join(sim, 1);
    sim.addItem('reins_valorsteed', 1, pid);
    expect(selectMount(sim.ctx, pid, 'valorsteed')).toBe(false);
    expect(errorTexts(sim.tick())).toContain('You must be level 20 to ride that mount.');
    sim.setPlayerLevel(20, pid);
    expect(selectMount(sim.ctx, pid, 'valorsteed')).toBe(true);
    expect(sim.selectedMount()).toBe('valorsteed');
  });

  it('swaps the live mount in place when already riding', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    sim.addItem('reins_stormfeather_griffin', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    ride(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    selectMount(sim.ctx, pid, 'stormfeather_griffin');
    expect(e.mountKey).toBe('stormfeather_griffin');
  });

  it('never live-swaps in combat (the pick updates, the ridden mount stays)', () => {
    // A mid-fight swap onto an epic would bypass toggleMount's combat gate and
    // grant its crit/block reactively; the swap must wait for the next mount.
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    sim.addItem('reins_stormfeather_griffin', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    ride(sim, pid);
    e.inCombat = true;
    expect(selectMount(sim.ctx, pid, 'stormfeather_griffin')).toBe(true);
    expect(e.mountKey).toBe('valorsteed');
    expect(sim.players.get(pid)?.selectedMount).toBe('stormfeather_griffin');
  });

  it('persists the pick (absent while on the horse) and restores it on load', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    // The default horse pick serializes as an ABSENT field, so legacy pre-mount
    // saves and horse-pick saves stay byte-identical and both load as the horse.
    expect(sim.serializeCharacter(pid)).not.toHaveProperty('selectedMount');
    sim.addItem('reins_grag_bear', 1, pid);
    selectMount(sim.ctx, pid, 'grag_bear');
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('serializeCharacter returned null');
    expect(state.selectedMount).toBe('grag_bear');

    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Rider', { state });
    sim2.tick();
    expect(sim2.players.get(pid2)?.selectedMount).toBe('grag_bear');
    // The live mounted state never persists: a reload always starts dismounted.
    expect(sim2.entities.get(pid2)?.mountKey).toBe('');
  });

  it('loads a legacy save without a pick as the horse', () => {
    const sim = makeWorld();
    const pid = join(sim, 10);
    const state = sim.serializeCharacter(pid);
    if (!state) throw new Error('serializeCharacter returned null');
    delete state.selectedMount;
    const sim2 = makeWorld();
    const pid2 = sim2.addPlayer('warrior', 'Rider', { state });
    sim2.tick();
    expect(sim2.players.get(pid2)?.selectedMount).toBe('valorsteed');
  });
});

describe('mount and dismount rules', () => {
  it('mounts the pick out of combat and dismounts on a second toggle', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    expect(toggleMount(sim.ctx, pid)).toBe(true); // starts the summon channel
    expect(e.mountKey).toBe(''); // not mounted until the channel completes
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    expect(toggleMount(sim.ctx, pid)).toBe(true); // starts the dismount channel
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('');
  });

  it('refuses to ride when nothing is owned, with the no-mount error', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    expect(ownedMounts(sim.players.get(pid)!)).toEqual([]);
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(errorTexts(sim.tick())).toContain("You don't have a mount yet.");
    expect(e.mountKey).toBe('');
  });

  it('level-gates the toggle below the horse gate (the Z error toast)', () => {
    const sim = makeWorld();
    const pid = join(sim, 1);
    sim.addItem('reins_valorsteed', 1, pid);
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(errorTexts(sim.tick())).toContain('You must be level 20 to ride that mount.');
    expect(sim.entities.get(pid)?.mountKey).toBe('');
  });

  it('falls back to the first owned mount when the pick is no longer owned', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const meta = sim.players.get(pid)!;
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    sim.addItem('reins_stormfeather_griffin', 1, pid);
    selectMount(sim.ctx, pid, 'stormfeather_griffin');
    // The reins item vanishes (content change / admin removal): the toggle must
    // not dead-end. It re-picks the first owned mount (the horse) and rides it.
    meta.inventory = meta.inventory.filter((s) => s.itemId !== 'reins_stormfeather_griffin');
    expect(toggleMount(sim.ctx, pid)).toBe(true);
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    expect(meta.selectedMount).toBe('valorsteed');
  });

  it('refuses to mount in combat but always allows dismounting', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    e.inCombat = true;
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(errorTexts(sim.tick())).toContain("You can't do that while in combat.");
    expect(e.mountKey).toBe('');
    e.inCombat = false;
    ride(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    e.inCombat = true;
    expect(toggleMount(sim.ctx, pid)).toBe(true); // dismount is never gated
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('');
  });

  it('refuses to mount while dead or a released spirit', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    e.dead = true;
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    e.dead = false;
    e.ghost = true;
    expect(toggleMount(sim.ctx, pid)).toBe(false);
    expect(e.mountKey).toBe('');
  });

  it('force-dismounts on death and keeps the pick for remounting', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    ride(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    sim.ctx.dealDamage(null, e, e.hp + 100, false, 'physical', null, 'hit');
    expect(e.dead).toBe(true);
    expect(e.mountKey).toBe('');
    expect(sim.players.get(pid)?.selectedMount).toBe('valorsteed');
  });
});

describe('mount summon/dismount channel (updateMountTransition)', () => {
  it('mounts only after the summon channel completes, not on the toggle', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    expect(e.mountCastRemaining).toBeCloseTo(MOUNT_SUMMON_SECONDS, 10);
    expect(e.mountKey).toBe('');
    const steps = Math.round(MOUNT_SUMMON_SECONDS / DT);
    for (let i = 0; i < steps - 1; i++) updateMountTransition(sim.ctx, e, false);
    expect(e.mountKey).toBe(''); // still channeling one tick short
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    expect(e.mountCastRemaining).toBe(0);
  });

  it('ignores a toggle while a channel is in progress', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    expect(toggleMount(sim.ctx, pid)).toBe(false); // ignored mid-channel
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
  });

  it('cancels an in-flight summon when combat starts (no mount, no error)', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    e.inCombat = true;
    updateMountTransition(sim.ctx, e, false);
    expect(e.mountKey).toBe('');
    expect(e.mountCastRemaining).toBe(0);
    expect(e.mountCastKey).toBe('');
    expect(errorTexts(sim.tick())).not.toContain("You can't do that while in combat.");
  });

  it('force-dismounts instantly in water', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    ride(sim, pid);
    expect(e.mountKey).toBe('valorsteed');
    updateMountTransition(sim.ctx, e, true); // swimming
    expect(e.mountKey).toBe('');
  });

  it('cancels an in-flight summon in water', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    updateMountTransition(sim.ctx, e, true);
    expect(e.mountKey).toBe('');
    expect(e.mountCastRemaining).toBe(0);
  });

  it('leaves the player unmounted if the reins vanish mid-summon', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const meta = sim.players.get(pid)!;
    const e = sim.entities.get(pid)!;
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    toggleMount(sim.ctx, pid);
    meta.inventory = meta.inventory.filter((s) => s.itemId !== 'reins_valorsteed');
    finishTransition(sim, pid);
    expect(e.mountKey).toBe('');
  });
});

describe('mount specialty stats', () => {
  it('applies extra mobility while mounted, composing with slows', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    expect(moveSpeedMult(e)).toBe(1);
    sim.addItem('reins_valorsteed', 1, pid);
    sim.addItem('reins_stormfeather_griffin', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    ride(sim, pid);
    expect(moveSpeedMult(e)).toBeCloseTo(1.6, 10);
    selectMount(sim.ctx, pid, 'stormfeather_griffin');
    expect(moveSpeedMult(e)).toBeCloseTo(1.8, 10);
    e.auras.push({
      id: 'slow_test',
      name: 'slow',
      kind: 'slow',
      remaining: 10,
      duration: 10,
      value: 0.5,
      sourceId: 0,
      school: 'physical',
    });
    expect(moveSpeedMult(e)).toBeCloseTo(0.9, 10);
  });

  it('grants the epic crit bonus while mounted and removes it on dismount', () => {
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    const base = e.critChance;
    sim.addItem('reins_stormfeather_griffin', 1, pid);
    selectMount(sim.ctx, pid, 'stormfeather_griffin');
    ride(sim, pid);
    expect(e.critChance).toBeCloseTo(base + 0.05, 10);
    toggleMount(sim.ctx, pid);
    finishTransition(sim, pid);
    expect(e.critChance).toBeCloseTo(base, 10);
  });

  it('the horse blocks no melee; commons and specials block 5%, the epic 8%', () => {
    expect(mountMeleeBlockPct('valorsteed')).toBe(0);
    expect(mountMeleeBlockPct('grag_bear')).toBe(0.05);
    expect(mountMeleeBlockPct('aether_hover_cycle')).toBe(0.05);
    expect(mountMeleeBlockPct('stormfeather_griffin')).toBe(0.08);
    expect(mountMeleeBlockPct('')).toBe(0);
  });

  it('shaves 5% off an identical melee swing when the target rides a rare mount', () => {
    // Twin sims on the same seed: the rng stream (miss/dodge/crit/weapon rolls)
    // is identical, so the only divergence is the mounted melee block.
    const damages: number[] = [];
    for (const mounted of [false, true]) {
      const sim = makeWorld();
      const attacker = join(sim, 20);
      const target = sim.addPlayer('warrior', 'Tank');
      sim.tick();
      sim.setPlayerLevel(20, target);
      const te = sim.entities.get(target)!;
      if (mounted) {
        sim.addItem('reins_shadowjump_toad', 1, target);
        selectMount(sim.ctx, target, 'shadowjump_toad');
        ride(sim, target);
        expect(te.mountKey).toBe('shadowjump_toad');
      }
      const hpBefore = te.hp;
      meleeSwing(sim.ctx, sim.entities.get(attacker)!, te, 0, null, {});
      damages.push(hpBefore - te.hp);
    }
    const [unmounted, mounted] = damages;
    expect(unmounted).toBeGreaterThan(0);
    // Rounded post-multiplier: within a point of the exact 5% cut, and strictly less.
    expect(Math.abs(mounted - unmounted * 0.95)).toBeLessThanOrEqual(1);
    expect(mounted).toBeLessThan(unmounted);
  });
});

describe('mount wire mirror', () => {
  it('rides the entity identity fields like skin', async () => {
    const { wireEntity } = await import('../server/game');
    const sim = makeWorld();
    const pid = join(sim, 20);
    const e = sim.entities.get(pid)!;
    expect(wireEntity(e)).not.toHaveProperty('mnt');
    sim.addItem('reins_valorsteed', 1, pid);
    selectMount(sim.ctx, pid, 'valorsteed');
    ride(sim, pid);
    expect(wireEntity(e).mnt).toBe('valorsteed');
  });
});
