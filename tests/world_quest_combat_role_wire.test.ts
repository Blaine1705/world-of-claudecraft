import { describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({ pool: { query: vi.fn(async () => ({ rows: [] })) } }));

import { wireEntity } from '../server/game';
import { Sim } from '../src/sim/sim';
import { bareClient } from './helpers/bare_client';

describe('world quest combat role identity wire', () => {
  it('mirrors every role and preserves it through lite updates, then clears on full removal', () => {
    const sim = new Sim({ seed: 42, playerClass: 'warrior' });
    const mob = [...sim.entities.values()].find((entity) => entity.kind === 'mob')!;
    const client = bareClient(sim.player.id);
    const apply = (row: Record<string, unknown>) =>
      (client as unknown as { applySnapshot(value: unknown): void }).applySnapshot({
        t: 'snap',
        ents: [row],
      });
    for (const role of ['leader', 'soldier', 'captain', 'wave', 'sapper', 'boss'] as const) {
      mob.worldQuestCombatRole = role;
      const wire = wireEntity(mob);
      expect(wire.wqcr).toBe(role);
      apply(wire);
      expect(client.entities.get(mob.id)?.worldQuestCombatRole).toBe(role);
      apply({ id: mob.id, x: mob.pos.x, y: mob.pos.y, z: mob.pos.z, hp: 5 });
      expect(client.entities.get(mob.id)?.worldQuestCombatRole).toBe(role);
    }
    mob.worldQuestCombatRole = undefined;
    const removed = wireEntity(mob);
    expect(removed.wqcr).toBeUndefined();
    apply(removed);
    expect(client.entities.get(mob.id)?.worldQuestCombatRole).toBeUndefined();
    for (const invalid of ['__proto__', 'toString', 'unknown', 1, {}, null]) {
      apply({ ...removed, wqcr: invalid });
      expect(client.entities.get(mob.id)?.worldQuestCombatRole).toBeUndefined();
    }
  });
});
