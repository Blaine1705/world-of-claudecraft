// Pure view core for the Stormbrass Foundry's chained workers' gossip
// (sim/content/stormbrass_foundry_workers.ts, sim/encounters/stormbrass_foundry/
// workers.ts). A worker is mob-kind (the sim holds it inert), so the click, the
// interact press and the quest dialog key on its template id; the dialog's
// line and its one button follow the camp's phase, which the camp's state
// object carries in its template id (guarded, unguarded, freed). That object
// stands at the camp's chain post, a few yards from every worker of its camp
// and a hundred from any other camp, so the nearest one is the worker's own:
// readable on every host from the entity mirror alone, no wire change.
// DOM-free; the painter is the quest dialog controller's renderFoundryWorker.

import {
  type FoundryWorkerCampPhase,
  foundryWorkerCampPhaseOf,
  isFoundryWorkerTemplate,
} from '../../../sim/content/stormbrass_foundry_workers';
import type { Entity } from '../../../sim/types';

/** How far a worker ever stands from its camp's post (the haul loop and the
 *  walk off included), with room to spare; the camps lie far further apart. */
const CAMP_REACH = 30;

/** A worker the player can talk to: a living chained or freed laborer. */
export function isFoundryWorkerEntity(e: Pick<Entity, 'kind' | 'templateId' | 'dead'>): boolean {
  return e.kind === 'mob' && !e.dead && isFoundryWorkerTemplate(e.templateId);
}

/** The worker's camp phase (what its gossip says and offers), or null when no
 *  camp is in sight (not a worker, or its camp's object not mirrored yet). */
export function foundryWorkerGossip(
  worker: Pick<Entity, 'kind' | 'templateId' | 'dead' | 'pos'>,
  entities: ReadonlyMap<number, Entity>,
): FoundryWorkerCampPhase | null {
  if (!isFoundryWorkerEntity(worker)) return null;
  let best: FoundryWorkerCampPhase | null = null;
  let bestD2 = CAMP_REACH * CAMP_REACH;
  for (const e of entities.values()) {
    if (e.kind !== 'object') continue;
    const phase = foundryWorkerCampPhaseOf(e.templateId);
    if (phase === null) continue;
    const dx = e.pos.x - worker.pos.x;
    const dz = e.pos.z - worker.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = phase;
    }
  }
  return best;
}

/** The dialog's content for a phase: its line's catalog key and whether it
 *  offers "Free them" (only once the guards are down). */
export function foundryWorkerDialog(phase: FoundryWorkerCampPhase): {
  line:
    | 'hudChrome.foundryWorkers.guardedLine'
    | 'hudChrome.foundryWorkers.unguardedLine'
    | 'hudChrome.foundryWorkers.freedLine';
  offersFree: boolean;
} {
  if (phase === 'unguarded') {
    return { line: 'hudChrome.foundryWorkers.unguardedLine', offersFree: true };
  }
  if (phase === 'freed') return { line: 'hudChrome.foundryWorkers.freedLine', offersFree: false };
  return { line: 'hudChrome.foundryWorkers.guardedLine', offersFree: false };
}
