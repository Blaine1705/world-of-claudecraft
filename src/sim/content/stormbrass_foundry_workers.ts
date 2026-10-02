// The Stormbrass Foundry's chained workers (the owner's idea, the foundry
// rebuild): the miners of the storm line the foundry's machines took and kept,
// chained at three scrap camps, each camp under the eye of a nearby trash pack.
// A miner swings a sledge at an ore seam; a hauler carries scrap from the heap to
// a cart and back. They are decoration until their guards fall: then a player
// can talk to them and strike their chains ("Free them"), they cheer, walk off
// toward the lift and are gone. The Lift Warden's "Free the Workers" asks for
// all three camps.
//
// Pure data: the camps (instance-local spots on the authored field, every one
// verified on the walkable floor by tests/stormbrass_foundry_workers.test.ts),
// the worker templates, the quest and the deed id. The behavior is
// encounters/stormbrass_foundry/workers.ts; the camp props draw from
// render/stormbrass_foundry/foundry_worker_camps.ts until the Blender kit
// carries the same prop kinds.
//
// Names checked 2026-10-02 (encounters/stormbrass_foundry/CLAUDE.md): "Chained
// Miner", "Chained Hauler", "Freed Laborer" and "Free the Workers" are generic
// English, no game use as a proper name; the deed "Every Chain Struck" returned
// no game use.

import type { FieldProp } from '../instances/authored_field/types';
import type { MobTemplate, QuestDef } from '../types';

export type FoundryWorkerCampId = 'A' | 'B' | 'C';
export type FoundryWorkerRole = 'miner' | 'hauler';

/** The three worker templates: a chained miner, a chained hauler, and the
 *  freed laborer either becomes when the chains come off (the same body, its
 *  tools dropped, cheering). */
export const FOUNDRY_WORKER_TEMPLATES = {
  miner: 'sf_chained_miner',
  hauler: 'sf_chained_hauler',
  freed: 'sf_freed_laborer',
} as const;

/** The camp's state object (one per camp, at its chain post): its template id
 *  carries the state, so the online client reads it with no wire change (the
 *  gossip, the chains). */
export const FOUNDRY_WORKER_CAMP_TEMPLATES = {
  guarded: 'sf_worker_camp_guarded',
  unguarded: 'sf_worker_camp_unguarded',
  freed: 'sf_worker_camp_freed',
} as const;

export type FoundryWorkerCampPhase = keyof typeof FOUNDRY_WORKER_CAMP_TEMPLATES;

const WORKER_TEMPLATE_IDS: ReadonlySet<string> = new Set(Object.values(FOUNDRY_WORKER_TEMPLATES));

/** A worker's body (chained or freed): the click, the interact press and the
 *  gossip key on it, on every host. */
export function isFoundryWorkerTemplate(templateId: string): boolean {
  return WORKER_TEMPLATE_IDS.has(templateId);
}

const CAMP_PHASE_BY_TEMPLATE: ReadonlyMap<string, FoundryWorkerCampPhase> = new Map(
  (Object.keys(FOUNDRY_WORKER_CAMP_TEMPLATES) as FoundryWorkerCampPhase[]).map((phase) => [
    FOUNDRY_WORKER_CAMP_TEMPLATES[phase],
    phase,
  ]),
);

/** The phase a camp state object's template id carries, or null for any
 *  other template. */
export function foundryWorkerCampPhaseOf(templateId: string): FoundryWorkerCampPhase | null {
  return CAMP_PHASE_BY_TEMPLATE.get(templateId) ?? null;
}

export interface FoundryWorkerSpot {
  role: FoundryWorkerRole;
  /** Instance-local spot: where a miner works, where a hauler starts. */
  x: number;
  z: number;
  /** A miner faces the seam. */
  facing: number;
}

export interface FoundryWorkerCamp {
  id: FoundryWorkerCampId;
  /** The pack whose death unguards the camp (STORMBRASS_FOUNDRY_SPAWNS). */
  guardPack: string;
  /** The walkable floor height under the whole camp (yards). */
  floor: number;
  /** The chain post: every worker's chain runs to it; the camp object stands on it. */
  post: { x: number; z: number };
  /** The ore seam the miners work. */
  seam: { x: number; z: number; rot: number };
  /** The scrap heap a hauler loads at, and where it stands to load. */
  heap: { x: number; z: number; stand: { x: number; z: number } };
  /** The scrap cart a hauler unloads into, and where it stands to unload. */
  cart: { x: number; z: number; rot: number; stand: { x: number; z: number } };
  /** Where the freed walk off to, toward the lift (on the camp's own floor). */
  leave: { x: number; z: number };
  workers: readonly FoundryWorkerSpot[];
}

const FACE_SOUTH = Math.PI;
const FACE_WEST = -Math.PI / 2;

/**
 * The three camps, each off the route and off its pack's pull path, verified
 * on the walkable floor (tests/stormbrass_foundry_workers.test.ts). The design
 * spots moved a few yards where a placed prop already stood: camp B east of the
 * Range Lanes' target frame, camp C round the crane base it now works under.
 */
export const FOUNDRY_WORKER_CAMPS: readonly FoundryWorkerCamp[] = [
  {
    // A, the Rail Yard's south-east corner, under g2 (the plate stacks).
    id: 'A',
    guardPack: 'g2',
    floor: 0,
    post: { x: 42.5, z: -179.5 },
    seam: { x: 47, z: -186.5, rot: 0 },
    heap: { x: 35, z: -183, stand: { x: 36.6, z: -180.8 } },
    cart: { x: 50, z: -174, rot: 0, stand: { x: 47.8, z: -174.5 } },
    leave: { x: 14, z: -184 },
    workers: [
      { role: 'miner', x: 45, z: -183.6, facing: FACE_SOUTH },
      { role: 'miner', x: 49.2, z: -183.8, facing: FACE_SOUTH },
      { role: 'hauler', x: 36.6, z: -180.8, facing: 0 },
    ],
  },
  {
    // B, the Range Lanes' south side, under g6 (the bunker pack).
    id: 'B',
    guardPack: 'g6',
    floor: 10,
    post: { x: -76, z: -70 },
    seam: { x: -80, z: -74.3, rot: 0 },
    heap: { x: -70, z: -73.6, stand: { x: -71.6, z: -71.6 } },
    cart: { x: -71, z: -66.5, rot: Math.PI / 2, stand: { x: -73.9, z: -68.5 } },
    leave: { x: -64, z: -54 },
    workers: [
      { role: 'miner', x: -80, z: -71.4, facing: FACE_SOUTH },
      { role: 'hauler', x: -71.6, z: -71.6, facing: 0 },
    ],
  },
  {
    // C, the Gantry Approach's south-west corner by the crane, under g12.
    id: 'C',
    guardPack: 'g12',
    floor: 25,
    post: { x: -35.5, z: 127 },
    seam: { x: -43, z: 130, rot: Math.PI / 2 },
    heap: { x: -28, z: 118.6, stand: { x: -29.6, z: 120.4 } },
    cart: { x: -29, z: 127.5, rot: 0, stand: { x: -31.2, z: 126.4 } },
    leave: { x: -12, z: 119 },
    workers: [
      { role: 'miner', x: -40.6, z: 128.4, facing: FACE_WEST },
      { role: 'miner', x: -40.6, z: 131.8, facing: FACE_WEST },
      { role: 'hauler', x: -29.6, z: 120.4, facing: 0 },
    ],
  },
];

/** How many camps the quest and the deed ask for. */
export const FOUNDRY_WORKER_CAMP_COUNT = FOUNDRY_WORKER_CAMPS.length;

/** The camps' set dressing, appended to the authored field's prop list
 *  (stormbrass_foundry_layout.ts): the ore seam, the scrap heap, the chain
 *  post and the cart, colliders all (a hauler walks between their edges). */
export function foundryWorkerCampProps(): FieldProp[] {
  const out: FieldProp[] = [];
  for (const c of FOUNDRY_WORKER_CAMPS) {
    out.push({
      kind: 'sf_ore_seam',
      x: c.seam.x,
      z: c.seam.z,
      rot: c.seam.rot,
      hw: 3.2,
      hd: 1.4,
      h: 6,
    });
    out.push({ kind: 'sf_scrap_heap', x: c.heap.x, z: c.heap.z, rot: 0, r: 1.8, h: 2.8 });
    out.push({ kind: 'sf_chain_post', x: c.post.x, z: c.post.z, rot: 0, r: 0.4, h: 3 });
    out.push({
      kind: 'sf_scrap_cart',
      x: c.cart.x,
      z: c.cart.z,
      rot: c.cart.rot,
      hw: 1.3,
      hd: 2,
      h: 2.6,
    });
  }
  return out;
}

/** A worker's body: a humanoid that is never hostile, never in combat and
 *  never killed (encounters/stormbrass_foundry/workers.ts holds it inert). */
function workerTemplate(id: string, name: string, color: number): MobTemplate {
  return {
    id,
    name,
    minLevel: 18,
    maxLevel: 18,
    family: 'humanoid',
    untameable: true,
    ccImmune: true,
    slowImmune: true,
    hpBase: 60,
    hpPerLevel: 20,
    dmgBase: 1,
    dmgPerLevel: 0,
    attackSpeed: 3,
    armorPerLevel: 10,
    moveSpeed: 3,
    aggroRadius: 0,
    xpMult: 0,
    loot: [],
    scale: 1,
    color,
  };
}

export const FOUNDRY_WORKER_MOBS: Record<string, MobTemplate> = {
  [FOUNDRY_WORKER_TEMPLATES.miner]: workerTemplate(
    FOUNDRY_WORKER_TEMPLATES.miner,
    'Chained Miner',
    0x8a7a62,
  ),
  [FOUNDRY_WORKER_TEMPLATES.hauler]: workerTemplate(
    FOUNDRY_WORKER_TEMPLATES.hauler,
    'Chained Hauler',
    0x7d7466,
  ),
  [FOUNDRY_WORKER_TEMPLATES.freed]: workerTemplate(
    FOUNDRY_WORKER_TEMPLATES.freed,
    'Freed Laborer',
    0x9a8a6a,
  ),
};

export const FOUNDRY_WORKERS_QUEST_ID = 'q_sf_free_the_workers';

/** Every chain struck in one run (the Book of Deeds, cosmetic only). */
export const FOUNDRY_WORKERS_DEED = 'dgn_foundry_workers_freed';

/** The Lift Warden's side quest beside the chain (stormbrass_foundry_quests.ts
 *  lists it on his questIds). The reward is the dungeon's level-19 to 20 quest
 *  rung (q_sf_storm_line, on the Sanctum's q_korgath ladder): every camp is a
 *  pack and an act, a full objective like the Hauler. */
export const FOUNDRY_WORKERS_QUEST: QuestDef = {
  id: FOUNDRY_WORKERS_QUEST_ID,
  name: 'Free the Workers',
  giverNpcId: 'lift_warden_corwin',
  turnInNpcId: 'lift_warden_corwin',
  text: 'The miners who worked this shelf never came down, $N. The foundry kept them: chained at its scrap camps, digging ore and hauling scrap for a master who left long ago, with his machines standing guard. Break the guards at each camp and strike the chains. All three camps. Send them home.',
  completionText:
    'They came down the line on their own feet, $N, every one of them, blinking at the sky like they had forgotten it. Whatever else you broke up there, this is the part the valley will remember.',
  objectives: [
    {
      type: 'interact',
      targetObjectItemId: 'sf_worker_camp',
      count: FOUNDRY_WORKER_CAMP_COUNT,
      label: 'Worker camps freed',
    },
  ],
  xpReward: 4200,
  copperReward: 2500,
  itemRewards: {},
  minLevel: 19,
  suggestedPlayers: 5,
};
