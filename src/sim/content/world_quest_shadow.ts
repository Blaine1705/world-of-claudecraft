import type { NpcDef, WorldQuestDef } from '../types';

export const SHADOW_QUEST_ID = 'wq_eastbrook_shadow';
export const SHADOW_NPC_ID = 2_146_900_040;
export const SHADOW_SITE = { x: 65, z: 20, radius: 34 };
export const SHADOW_NPC_DEF: NpcDef = {
  id: 'shadow_cloak_scout',
  name: 'Scout Valerie',
  title: 'Covert Operations',
  pos: { x: 46, z: 12 },
  facing: 1.2,
  color: 0x637591,
  questIds: [],
  dynamic: true,
  greeting:
    'Borrow my duskweave cloak. Take a dispatch from each guard, and stay clear of the sentries. Their lanterns can pierce the enchantment.',
};
export const SHADOW_GUARDS: readonly {
  entityId: number;
  npc: NpcDef;
  sentry: boolean;
  detectionRadius: number;
  patrol?: { x: number; z: number; period: number; pause: number };
}[] = [
  {
    entityId: 2146900041,
    sentry: false,
    detectionRadius: 1.2,
    npc: {
      id: 'shadow_guard_north',
      name: 'Dispatch Guard',
      title: 'Dispatch Carrier',
      greeting: 'These sealed orders are for the captain. Keep your distance.',
      pos: { x: 55, z: 18 },
      facing: 0,
      color: 0x875641,
      questIds: [],
      dynamic: true,
    },
  },
  {
    entityId: 2146900042,
    sentry: false,
    detectionRadius: 1.2,
    npc: {
      id: 'shadow_guard_south',
      name: 'Dispatch Guard',
      title: 'Dispatch Carrier',
      greeting: 'I have a dispatch to deliver. Move along.',
      pos: { x: 62, z: 32 },
      facing: 2,
      color: 0x875641,
      questIds: [],
      dynamic: true,
    },
  },
  {
    entityId: 2146900043,
    sentry: false,
    detectionRadius: 1.2,
    npc: {
      id: 'shadow_guard_east',
      name: 'Dispatch Guard',
      title: 'Dispatch Carrier',
      greeting: 'No delays. The watch is waiting for these orders.',
      pos: { x: 73, z: 24 },
      facing: 1,
      color: 0x875641,
      questIds: [],
      dynamic: true,
    },
  },
  {
    entityId: 2146900044,
    sentry: false,
    detectionRadius: 1.2,
    npc: {
      id: 'shadow_guard_west',
      name: 'Dispatch Guard',
      title: 'Dispatch Carrier',
      greeting: 'Official business. Keep the path clear.',
      pos: { x: 77, z: 10 },
      facing: 3,
      color: 0x875641,
      questIds: [],
      dynamic: true,
    },
  },
  {
    entityId: 2146900045,
    sentry: true,
    detectionRadius: 6,
    patrol: { x: 78, z: 8, period: 12, pause: 3 },
    npc: {
      id: 'shadow_sentry_south',
      name: 'Lantern Sentry',
      title: 'True Sight',
      greeting: 'My lantern reveals more than shadows. Stay where I can see you.',
      pos: { x: 58, z: 34 },
      facing: 1.5,
      color: 0xd4a553,
      questIds: [],
      dynamic: true,
    },
  },
  {
    entityId: 2146900046,
    sentry: true,
    detectionRadius: 6,
    patrol: { x: 79, z: 30, period: 14, pause: 3 },
    npc: {
      id: 'shadow_sentry_north',
      name: 'Lantern Sentry',
      title: 'True Sight',
      greeting: 'Nothing slips past the lantern watch.',
      pos: { x: 54, z: 16 },
      facing: 1.5,
      color: 0xd4a553,
      questIds: [],
      dynamic: true,
    },
  },
];
export const WORLD_QUEST_SHADOW: WorldQuestDef = {
  id: SHADOW_QUEST_ID,
  zoneId: 'eastbrook_vale',
  minLevel: 5,
  area: SHADOW_SITE,
  objective: { type: 'shadow', instructorNpcId: SHADOW_NPC_DEF.id },
  count: 4,
  reward: { type: 'xp', rate: 0.12 },
};

export function isShadowNpc(templateId: string): boolean {
  return (
    templateId === SHADOW_NPC_DEF.id || SHADOW_GUARDS.some((guard) => guard.npc.id === templateId)
  );
}
