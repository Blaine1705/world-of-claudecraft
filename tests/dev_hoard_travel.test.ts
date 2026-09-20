import { describe, expect, it } from 'vitest';
import { RIFT_THEMES } from '../src/sim/content/rift/themes';
import { DEV_HOARD_DESTINATIONS, devHoardDestination } from '../src/sim/dev/hoard_travel';
import { generateRiftFloor } from '../src/sim/rift/rift_gen';
import { vaultSeedOpen, vaultSeedTier, vaultSeedZone } from '../src/sim/rift/vault_seed';
import { Sim } from '../src/sim/sim';
import { EMPTY_TEST_WORLD } from './sim_shared';

function makeSim(devCommands = true) {
  return new Sim({ seed: 42, playerClass: 'warrior', devCommands, world: EMPTY_TEST_WORLD });
}

describe('direct legendary hoard travel', () => {
  it('resolves every boss and biome deterministically through the real generator', () => {
    for (const [i, d] of DEV_HOARD_DESTINATIONS.entries()) {
      const result = devHoardDestination(d.boss)!;
      expect(devHoardDestination(String(i + 1))).toEqual(result);
      expect(devHoardDestination(d.zone)).toEqual(result);
      expect(devHoardDestination(d.alias)).toEqual(result);
      expect(vaultSeedTier(result.seed)).toBe(3);
      expect(vaultSeedOpen(result.seed)).toBe(true);
      expect(vaultSeedZone(result.seed)).toBe(d.zone);
      expect(generateRiftFloor(result.seed, 23, 0).spawns.find((s) => s.boss)?.templateId).toBe(
        RIFT_THEMES.find((theme) => theme.id === d.theme)!.boss,
      );
    }
    expect(devHoardDestination('unknown')).toBeNull();
  });

  it('enters real legendary instances and switches bosses without spending a map', () => {
    const sim = makeSim();
    sim.chat('/dev hoard frost');
    const first = sim.riftInstances.find((i) => i.partyKey !== null)!;
    expect(first.vault?.rarity).toBe('legendary');
    expect(sim.entities.get(first.bossId!)?.templateId).toBe('rift_boss_frost');
    expect(sim.player.level).toBe(20);
    sim.chat('/dev hoard tide');
    const second = sim.riftInstances.find((i) => i.seed === devHoardDestination('tide')!.seed)!;
    expect(sim.entities.get(second.bossId!)?.templateId).toBe('rift_boss_tide');
    expect(second.vault?.ownerPid).toBe(sim.player.id);
    expect([...sim.entities.values()].filter((e) => e.vaultOwnerPid !== undefined)).toHaveLength(0);
    sim.leaveRift();
    expect(sim.player.pos.x).toBe(second.returnPos.x);
    expect(sim.player.pos.z).toBe(second.returnPos.z);
  });

  it('listing and invalid destinations leave the world unchanged', () => {
    const sim = makeSim();
    const before = { ...sim.player.pos };
    sim.chat('/dev hoard list');
    sim.chat('/dev hoard invalid');
    expect(sim.player.pos).toEqual(before);
    expect(sim.riftInstances.every((i) => i.partyKey === null)).toBe(true);
  });

  it('retains the production dev gate', () => {
    const sim = makeSim(false);
    sim.chat('/dev hoard tide');
    expect(sim.player.level).toBe(1);
    expect(sim.riftInstances.every((i) => i.partyKey === null)).toBe(true);
  });

  it('does not allocate instances or teleport a dead player', () => {
    const sim = makeSim();
    sim.player.dead = true;
    const before = { ...sim.player.pos };
    sim.chat('/dev hoard frost');
    expect(sim.player.pos).toEqual(before);
    expect(sim.riftInstances.every((i) => i.partyKey === null)).toBe(true);
  });
});
