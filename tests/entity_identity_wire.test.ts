import { describe, expect, it } from 'vitest';
import { applyEntityIdentity } from '../src/net/entity_identity_wire';
import type { Entity } from '../src/sim/types';

describe('full entity identity decode', () => {
  it('updates the base identity and excludes combat roles from non-mob identities', () => {
    const entity = { worldQuestCombatRole: 'leader', hp: 15 } as Entity;
    applyEntityIdentity(entity, {
      k: 'npc',
      tid: 'marshal_redbrook',
      nm: 'Marshal',
      lv: 60,
      wqcr: 'boss',
    });
    expect(entity).toMatchObject({
      kind: 'npc',
      templateId: 'marshal_redbrook',
      name: 'Marshal',
      level: 60,
      hp: 15,
    });
    expect(entity.worldQuestCombatRole).toBeUndefined();
  });
});
