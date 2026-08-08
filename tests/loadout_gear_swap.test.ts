// Saving and applying a loadout's gear set, through the real Sim.
//
// The planner is unit-tested in tests/loadout_gear.test.ts. This drives the whole
// path instead: capture the worn set on save, switch away, switch back, and assert
// the SAVED COPY came back rather than the newest matching one. That distinction is
// the entire point of the feature and is invisible to a test that only checks item
// ids, because both copies share an id.

import { describe, expect, it } from 'vitest';
import { itemCopyPin } from '../src/sim/item_copy_ref';
import { Sim } from '../src/sim/sim';
import type { ItemInstancePayload, SimEvent } from '../src/sim/types';

const ENCHANT = { enchantId: 'ench_test' } as unknown as ItemInstancePayload;

function makeSim(): Sim {
  return new Sim({ seed: 11, playerClass: 'warrior', autoEquip: false });
}

function gearResults(events: SimEvent[]) {
  return events.filter((e): e is Extract<SimEvent, { type: 'loadoutGearResult' }> => {
    return e.type === 'loadoutGearResult';
  });
}

/** Pick a real chest-slot armor id from the live tables, so nothing is fabricated. */
async function chestItemId(): Promise<string> {
  const { ITEMS } = await import('../src/sim/data');
  const found = Object.values(ITEMS).find((d) => d.slot === 'chest' && d.kind === 'armor');
  if (!found) throw new Error('no chest item fixture');
  return found.id;
}

describe('a loadout captures and restores the gear it was saved with', () => {
  it('re-equips the SAVED copy, not the newest copy of the same id', async () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = sim.players.get(pid);
    if (!meta) throw new Error('no meta');
    const itemId = await chestItemId();

    // Wear the ENCHANTED copy, and hold a plain duplicate in the bags. The legacy
    // equip walk takes the newest match, so a set that stored only the id would
    // hand back the plain one.
    meta.inventory.length = 0;
    meta.equipment.chest = itemId;
    meta.equipmentInstance = { chest: ENCHANT };
    sim.drainEvents();

    // Save WITH gear capture, then strip the body and put both copies in the bags.
    const saved = sim.saveLoadout('PvP', [], pid, undefined, true);
    expect(saved, 'the save succeeded').toBeGreaterThanOrEqual(0);
    const stored = meta.loadouts[saved];
    expect(stored.gear?.chest?.itemId, 'the set captured the chest slot').toBe(itemId);
    expect(stored.gear?.chest?.pin, 'and pinned the enchanted copy').toBe(
      itemCopyPin({ itemId, count: 1, instance: ENCHANT }),
    );

    delete meta.equipment.chest;
    meta.equipmentInstance = {};
    meta.inventory.length = 0;
    meta.inventory.push({ itemId, count: 1, instance: ENCHANT });
    meta.inventory.push({ itemId, count: 1 });
    sim.drainEvents();

    expect(sim.switchLoadout(saved, pid)).toBe(true);

    // The enchanted copy is worn, and the plain one is what is left in the bags.
    expect(meta.equipment.chest).toBe(itemId);
    expect(meta.equipmentInstance?.chest, 'the enchant came back with it').toBeDefined();
    const left = meta.inventory.filter((s) => s.itemId === itemId);
    expect(left).toHaveLength(1);
    expect(left[0].instance, 'the plain duplicate stayed in the bags').toBeUndefined();
  });

  it('omits the gear key entirely when capture was not requested', async () => {
    // Additive persistence: a talent-only loadout has to serialize exactly as it did
    // before this feature, or every existing loadout's wire payload changes.
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = sim.players.get(pid);
    if (!meta) throw new Error('no meta');
    meta.equipment.chest = await chestItemId();

    const saved = sim.saveLoadout('Talents only', [], pid);
    expect(Object.hasOwn(meta.loadouts[saved], 'gear')).toBe(false);
  });

  it('reports missing pieces instead of equipping a plain copy in their place', async () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = sim.players.get(pid);
    if (!meta) throw new Error('no meta');
    const itemId = await chestItemId();

    meta.equipment.chest = itemId;
    meta.equipmentInstance = { chest: ENCHANT };
    const saved = sim.saveLoadout('PvP', [], pid, undefined, true);

    // Strip the body and leave ONLY a plain copy: the saved piece is gone.
    delete meta.equipment.chest;
    meta.equipmentInstance = {};
    meta.inventory.length = 0;
    meta.inventory.push({ itemId, count: 1 });
    sim.drainEvents();

    sim.switchLoadout(saved, pid);
    const results = gearResults(sim.drainEvents());
    expect(results).toHaveLength(1);
    expect(results[0].copyGone, 'the enchanted copy is reported gone').toBe(1);
    expect(results[0].equipped, 'and nothing was equipped in its place').toBe(0);
    expect(meta.equipment.chest, 'the plain copy was NOT substituted').toBeUndefined();
  });

  it('still applies the talents when a gear piece is missing', async () => {
    // The switch must not fail on gear. Talents committing is what callers rely on.
    const sim = makeSim();
    const pid = sim.playerId;
    const meta = sim.players.get(pid);
    if (!meta) throw new Error('no meta');
    meta.equipment.chest = await chestItemId();
    meta.equipmentInstance = { chest: ENCHANT };
    const saved = sim.saveLoadout('PvP', [], pid, undefined, true);

    delete meta.equipment.chest;
    meta.equipmentInstance = {};
    meta.inventory.length = 0;
    sim.drainEvents();

    expect(sim.switchLoadout(saved, pid), 'the switch still succeeds').toBe(true);
    expect(meta.activeLoadout).toBe(saved);
    expect(gearResults(sim.drainEvents())[0]?.notHeld).toBe(1);
  });

  it('emits no gear result for a loadout that captured nothing', async () => {
    const sim = makeSim();
    const pid = sim.playerId;
    const saved = sim.saveLoadout('Talents only', [], pid);
    sim.drainEvents();
    sim.switchLoadout(saved, pid);
    expect(gearResults(sim.drainEvents())).toEqual([]);
  });
});
