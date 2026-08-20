// The per-viewer opened-object hide (src/sim/quests/opened_object_view.ts):
// a castaway crate this player already took interact credit from reads as
// gone FOR THEM (renderer mesh, coach beam and bubble, interact-key target
// scan) while staying live for everyone else. Driven through a real Sim so
// the ledger entries are the ones the actual credit path writes.

import { describe, expect, it } from 'vitest';
import { PROVING_SHORE_OBJECTS } from '../src/sim/content/proving_shore';
import { isObjectOpenedByViewer } from '../src/sim/quests/opened_object_view';
import { Sim } from '../src/sim/sim';
import type { Entity } from '../src/sim/types';
import { nearestCrate } from '../src/ui/coach_prompt_view';

const CRATE_ITEM = 'ps_castaway_crate';
const WRECK_QUEST = 'q_ps_the_wreck_line';

function makeSim(): Sim {
  return new Sim({ seed: 4120, playerClass: 'warrior', autoEquip: true });
}

function crates(sim: Sim): Entity[] {
  return [...sim.entities.values()].filter(
    (e) => e.kind === 'object' && e.objectItemId === CRATE_ITEM,
  );
}

/** Put the wreck-line quest straight into the log (the hide only reads the
 *  ledger, so the chain prerequisites are irrelevant here). */
function startWreckLine(sim: Sim): void {
  const meta = sim.players.get(sim.playerId)!;
  const quest = { questId: WRECK_QUEST, counts: [0], state: 'active' as const };
  meta.questLog.set(WRECK_QUEST, quest);
}

describe('isObjectOpenedByViewer', () => {
  it('hides exactly the crate this player credited, and only while the quest lives', () => {
    const sim = makeSim();
    startWreckLine(sim);
    const line = crates(sim);
    expect(line.length).toBeGreaterThanOrEqual(6);
    const [first, second] = line;

    // Nothing opened yet: nothing hidden.
    const meta = sim.players.get(sim.playerId)!;
    expect(isObjectOpenedByViewer(first, meta.questLog)).toBe(false);

    // Open the first crate through the real interact path.
    sim.player.pos.x = first.pos.x;
    sim.player.pos.z = first.pos.z;
    sim.pickUpObject(first.id);
    expect(meta.questLog.get(WRECK_QUEST)?.counts[0]).toBe(1);

    // The opened crate reads gone for this viewer; its neighbors do not.
    expect(isObjectOpenedByViewer(first, meta.questLog)).toBe(true);
    expect(isObjectOpenedByViewer(second, meta.questLog)).toBe(false);
    // An unrelated object id at the same spot is untouched.
    expect(
      isObjectOpenedByViewer({ objectItemId: 'ps_ferry_bell', pos: first.pos }, meta.questLog),
    ).toBe(false);

    // Quest gone from the log (abandon or turn-in): the crate reappears,
    // because a repeat of the quest needs it.
    meta.questLog.delete(WRECK_QUEST);
    expect(isObjectOpenedByViewer(first, meta.questLog)).toBe(false);
  });

  it('keeps hiding through the ready state, where the ledger still lives', () => {
    const sim = makeSim();
    startWreckLine(sim);
    const meta = sim.players.get(sim.playerId)!;
    const first = crates(sim)[0];
    sim.player.pos.x = first.pos.x;
    sim.player.pos.z = first.pos.z;
    sim.pickUpObject(first.id);
    meta.questLog.get(WRECK_QUEST)!.state = 'ready';
    expect(isObjectOpenedByViewer(first, meta.questLog)).toBe(true);
  });

  it('steers the coach bubble to the nearest UNOPENED crate', () => {
    const sim = makeSim();
    startWreckLine(sim);
    const meta = sim.players.get(sim.playerId)!;
    const line = crates(sim);
    const [first, second] = line;
    sim.player.pos.x = first.pos.x;
    sim.player.pos.z = first.pos.z;
    sim.pickUpObject(first.id);

    // Standing on the opened crate, the bubble points at the next one.
    const next = nearestCrate(sim.entities.values(), first.pos, meta.questLog);
    expect(next).not.toBeNull();
    expect(next!.pos).not.toEqual(first.pos);
    expect(next!.pos).toEqual(second.pos);
    // Without the ledger the scan would have picked the opened crate itself.
    expect(nearestCrate(sim.entities.values(), first.pos)!.pos).toEqual(first.pos);
  });

  it('the authored crate line and the live roster agree on positions', () => {
    // The ledger keys on authored spawn positions; a drifted spawn would
    // silently stop matching, so pin the entity roster to the content.
    const authored = PROVING_SHORE_OBJECTS.find((o) => o.itemId === CRATE_ITEM)!.positions;
    const live = crates(makeSim()).map((e) => ({ x: e.pos.x, z: e.pos.z }));
    for (const pos of authored) {
      expect(live).toContainEqual(pos);
    }
  });
});
