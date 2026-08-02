import { describe, expect, it } from 'vitest';
import { allEpicGearIds } from '../src/sim/content/ptr_dev_vendor';
import { ITEMS } from '../src/sim/data';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';

// The dev-only free-epic vendor: /dev vendor spawns it, it sells every epic for
// free, and it is inert on a production realm (devCommands off). Gated tests.

describe('ptr dev vendor', () => {
  it('stocks every equippable epic in the game', () => {
    const ids = allEpicGearIds();
    expect(ids.length).toBeGreaterThan(50);
    for (const id of ids) {
      const def = ITEMS[id];
      expect(def?.quality).toBe('epic');
      expect(def?.slot).toBeTruthy();
    }
    // dynamic: an epic added to content shows up without editing the vendor
    const epicCount = Object.values(ITEMS).filter(
      (i) => i.quality === 'epic' && (i.kind === 'armor' || i.kind === 'weapon') && i.slot,
    ).length;
    expect(ids.length).toBe(epicCount);
  });

  it('/dev vendor spawns a free vendor and buying an epic costs nothing (dev realm)', () => {
    const sim = new Sim({ seed: 5, playerClass: 'warrior', autoEquip: false, devCommands: true });
    sim.setPlayerLevel(20);
    const p = sim.player;
    const copperBefore = (sim as unknown as { meta(pid?: number): { copper: number } }).meta?.(
      sim.playerId,
    )?.copper;
    sim.chat('/dev vendor');
    sim.tick();
    const vendor = [...sim.entities.values()].find(
      (e: Entity) => e.kind === 'npc' && (e as { devVendor?: boolean }).devVendor,
    );
    expect(vendor, 'vendor spawned').toBeTruthy();
    expect(vendor!.vendorItems.length).toBeGreaterThan(50);
    const epic = vendor!.vendorItems[0];
    (
      sim as unknown as {
        buyItem(npc: number, item: string, opts?: { count?: number }, pid?: number): void;
      }
    ).buyItem(vendor!.id, epic, undefined, sim.playerId);
    // got the item, paid nothing
    expect(sim.countItem(epic)).toBeGreaterThan(0);
    if (copperBefore !== undefined) {
      const after = (sim as unknown as { meta(pid?: number): { copper: number } }).meta?.(
        sim.playerId,
      )?.copper;
      expect(after).toBe(copperBefore);
    }
  });

  it('a free-vendor count purchase grants count x stack for nothing, capacity still gating (phase 21)', () => {
    // The devVendor count arm, defined so freeVendor never becomes an
    // untested leaf of the count path: costs stay zero at any count, the
    // grant multiplies, sanitize still refuses hostile counts, and the
    // capacity pre-check still refuses whole.
    const sim = new Sim({ seed: 5, playerClass: 'warrior', autoEquip: false, devCommands: true });
    sim.setPlayerLevel(20);
    sim.chat('/dev vendor');
    sim.tick();
    const vendor = [...sim.entities.values()].find(
      (e: Entity) => e.kind === 'npc' && (e as { devVendor?: boolean }).devVendor,
    )!;
    // A non-soulbound epic: soulbound rows are Q23 force-1 and would hide the
    // multiplication this arm exists to pin.
    const epic = vendor.vendorItems.find((id) => ITEMS[id].soulbound !== true)!;
    const rig = sim as unknown as {
      buyItem(npc: number, item: string, opts?: { count?: number }, pid?: number): void;
      meta(pid?: number): { copper: number; inventory: unknown[] };
    };
    const copperBefore = rig.meta(sim.playerId).copper;

    rig.buyItem(vendor.id, epic, { count: 3 }, sim.playerId);
    expect(sim.countItem(epic)).toBe(3);
    expect(rig.meta(sim.playerId).copper).toBe(copperBefore);

    // Hostile count still denies on a free vendor: free never means unsanitized.
    rig.buyItem(vendor.id, epic, { count: -5 }, sim.playerId);
    expect(sim.countItem(epic)).toBe(3);
  });

  it('is inert on a production realm: /dev vendor does nothing without devCommands', () => {
    const sim = new Sim({ seed: 5, playerClass: 'warrior', autoEquip: true, devCommands: false });
    sim.setPlayerLevel(20);
    sim.chat('/dev vendor');
    sim.tick();
    const vendor = [...sim.entities.values()].find(
      (e: Entity) => e.kind === 'npc' && (e as { devVendor?: boolean }).devVendor,
    );
    expect(vendor, 'no dev vendor without dev commands').toBeFalsy();
  });
});
