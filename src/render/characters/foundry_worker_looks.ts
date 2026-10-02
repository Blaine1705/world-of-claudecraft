// The Stormbrass Foundry's chained workers (sim/content/
// stormbrass_foundry_workers.ts): three looks on the townsfolk body every
// villager wears (the KayKit rogue, cape off, tinted hard per worker by the
// entity colour: the hair and the leather take it, the cloth barely does, so a
// camp still reads as kin; a second body would pop when a worker turns into
// the one freed look), no new model.
//
//   the miner   stands at the seam swinging a stone sledge: its IDLE is the
//               two-hand chop, looped (the rig's one honest swing with a long
//               tool). A weapon-scale hammer: the tool pack's pickaxe is a
//               hand prop a few inches long on this body and reads as nothing.
//   the hauler  carries a scrap pail between the heap and the cart; the sim
//               walks it, so the stock walk cycle plays.
//   the freed   the same body with its tools dropped: its idle is the cheer,
//               looped while it celebrates, then the walk as it leaves.
//
// The chains and shackles are drawn by stormbrass_foundry/foundry_worker_fx.ts
// from the world, not attached here (a chain runs to the camp's post).
// manifest.ts merges these looks and their mob keys.

import { FOUNDRY_WORKER_TEMPLATES } from '../../sim/content/stormbrass_foundry_workers';
import type { ClipMap, VisualDef } from './manifest';

const PLAYERS = 'models/chars/players';
const TOOLS = 'models/tools';
const WEAPONS = 'models/weapons';
/** A worker stands a head under the foundry's machines: a plain person. */
const WORKER_H = 2.6;

function workerClips(idle: string): ClipMap {
  return {
    idle,
    walk: 'Walking_A',
    run: 'Running_A',
    walkBack: 'Walking_Backwards',
    attack: ['2H_Melee_Attack_Chop'],
    hit: ['Hit_A'],
    death: 'Death_A',
    jump: 'Jump_Idle',
  };
}

function workerLook(idle: string, attach: VisualDef['attach']): VisualDef {
  return {
    url: `${PLAYERS}/rogue.glb`,
    animUrls: [`${PLAYERS}/rogue_hit_variety_anims.glb`],
    height: WORKER_H,
    clips: workerClips(idle),
    // No cape: plain work clothes.
    show: [],
    tint: 'entity',
    tintStrength: 0.85,
    attach,
  };
}

export const FOUNDRY_WORKER_LOOKS: Record<string, VisualDef> = {
  foundry_worker_miner: workerLook('2H_Melee_Attack_Chop', [
    { url: `${WEAPONS}/hammer_d.glb`, bone: 'handslot.r' },
  ]),
  foundry_worker_hauler: workerLook('Idle', [
    { url: `${TOOLS}/bucket_metal.glb`, bone: 'handslot.r' },
  ]),
  foundry_worker_freed: workerLook('Cheer', []),
};

/** Mob template id to look key (manifest.ts MOB_KEYS spreads it). */
export const FOUNDRY_WORKER_MOB_KEYS: Record<string, string> = {
  [FOUNDRY_WORKER_TEMPLATES.miner]: 'foundry_worker_miner',
  [FOUNDRY_WORKER_TEMPLATES.hauler]: 'foundry_worker_hauler',
  [FOUNDRY_WORKER_TEMPLATES.freed]: 'foundry_worker_freed',
};
