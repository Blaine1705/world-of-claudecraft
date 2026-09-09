import type { Entity } from '../sim/types';

interface EntityIdentityWire {
  k: Entity['kind'];
  tid: string;
  nm: string;
  lv: number;
  wqcr?: unknown;
}

function combatRole(value: unknown): Entity['worldQuestCombatRole'] {
  switch (value) {
    case 'leader':
    case 'soldier':
    case 'captain':
    case 'wave':
    case 'sapper':
    case 'boss':
      return value;
    default:
      return undefined;
  }
}

/** Full identity only: absent role clears it, while lite records never call this. */
export function applyEntityIdentity(entity: Entity, wire: EntityIdentityWire): void {
  entity.kind = wire.k;
  entity.templateId = wire.tid;
  entity.name = wire.nm;
  entity.level = wire.lv;
  entity.worldQuestCombatRole = wire.k === 'mob' ? combatRole(wire.wqcr) : undefined;
}
