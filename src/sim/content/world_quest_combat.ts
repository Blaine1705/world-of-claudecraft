import type { WorldQuestCombatId, WorldQuestDef } from '../types';

export interface CombatQuestSite {
  questId: string;
  encounterId: WorldQuestCombatId;
  npcId: string;
  npcEntityId: number;
  start: { x: number; z: number };
  center: { x: number; z: number };
  radius: number;
  minLevel: number;
  deedId: string;
}

/** Existing Highwatch characters, stationed at clearings away from ambient battle camps. */
export const COMBAT_QUEST_SITES: readonly CombatQuestSite[] = [
  {
    questId: 'wq_thornpeak_warband',
    encounterId: 'warband',
    npcId: 'scout_maren_highwatch',
    npcEntityId: 2146900100,
    start: { x: -145, z: 607 },
    center: { x: -145, z: 635 },
    radius: 48,
    minLevel: 17,
    deedId: 'exp_wq_warband',
  },
  {
    questId: 'wq_thornpeak_restless_company',
    encounterId: 'restless_company',
    npcId: 'captain_thessaly',
    npcEntityId: 2146900101,
    start: { x: 75, z: 710 },
    center: { x: 100, z: 690 },
    radius: 35,
    minLevel: 18,
    deedId: 'exp_wq_restless_company',
  },
  {
    questId: 'wq_thornpeak_hold_highwatch',
    encounterId: 'hold_highwatch',
    npcId: 'captain_thessaly',
    npcEntityId: 2146900104,
    start: { x: 6, z: 682 },
    center: { x: 0, z: 710 },
    radius: 45,
    minLevel: 17,
    deedId: 'exp_wq_hold_highwatch',
  },
];

export const COMBAT_WORLD_QUESTS: readonly WorldQuestDef[] = COMBAT_QUEST_SITES.map((site) => ({
  id: site.questId,
  zoneId: 'thornpeak_heights',
  minLevel: site.minLevel,
  area: { ...site.center, radius: site.radius },
  objective: { type: 'combat', encounterId: site.encounterId },
  count: 1,
  reward: { type: 'copper', base: 2500, perLevel: 175 },
}));

export const COMBAT_QUEST_TUNING = {
  lifetime: 600,
  wavePause: 7,
  captainHealthMultiplier: 0.35,
  captainDamageMultiplier: 0.65,
  sapperGateDamage: 25,
  sapperMoveSpeed: 3.5,
  gateRadius: 3,
} as const;
