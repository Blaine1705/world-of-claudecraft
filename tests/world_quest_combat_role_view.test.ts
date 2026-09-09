import { describe, expect, it } from 'vitest';
import { nameplatePlanInto, newNameplatePlan } from '../src/render/nameplate_view';
import type { Entity } from '../src/sim/types';
import { entityDisplayName } from '../src/ui/entity_display_labels';

const mob = (role?: string) =>
  ({
    id: 2,
    kind: 'mob',
    templateId: 'wolf',
    name: 'Wolf',
    ownerId: null,
    pos: { x: 0, y: 0, z: 10 },
    scale: 1,
    castingAbility: null,
    worldQuestCombatRole: role,
  }) as Entity;
const player = { id: 1, pos: { x: 0, y: 0, z: 0 } } as Entity;

describe('world quest combat role labels', () => {
  it.each([
    ['leader', 'Leader'],
    ['soldier', 'Soldier'],
    ['captain', 'Captain'],
    ['wave', 'Enemy'],
    ['sapper', 'Sapper'],
    ['boss', 'Boss'],
  ])(
    'distinguishes %s from ordinary mobs in target names and with plates disabled',
    (role, label) => {
      expect(entityDisplayName(mob(role))).toBe(`[WQ ${label}] ${entityDisplayName(mob())}`);
      expect(
        nameplatePlanInto(newNameplatePlan(), mob(role), player, 2, false, false, false, false)
          .hidden,
      ).toBe(false);
    },
  );

  it('preserves ordinary mob names and their visibility preference', () => {
    expect(entityDisplayName(mob())).not.toContain('[WQ');
    expect(
      nameplatePlanInto(newNameplatePlan(), mob(), player, 2, false, false, false, false).hidden,
    ).toBe(true);
  });
});
