// Progress events: an OBSERVER of the sim's levelup / questAccepted /
// questDone / death events at the game.ts drain, never an authority. It
// copies the deeds_records runtime shape: each insert chains onto a
// per-process FIFO promise tail the game loop NEVER awaits, a rejected
// insert logs and never blocks or reorders anything, and every entry point
// is guarded so the observer can never throw into the event-routing path.
// A lost row costs one analytics data point, never gameplay.
//
// Volume gates live HERE (one place, unit-testable):
// - level_up_events records every ding at any level (a ding is rare and the
//   table is the whole point: the full per-level friction map).
// - ftue_events records only while the character's level is at or below
//   FTUE_MAX_LEVEL, so the table stays a new-player log and never grows per
//   veteran quest or death.

import { zoneAt } from '../src/sim/data';
import type { Entity } from '../src/sim/types';
import { pool } from './db';
import {
  FTUE_MAX_LEVEL,
  type FtueEventKind,
  insertFtueEvent,
  insertLevelUpEvent,
} from './progress_events_db';
import { REALM } from './realm';

/** The session fields the observer reads; game.ts sessions satisfy this
 *  structurally, and tests pass a plain object. */
export interface ProgressEventWho {
  characterId: number;
  accountId: number;
}

/** The one sim read the death observer needs: the live entity map, for the
 *  dying player's level/position and the killer's identity. Structural so a
 *  test passes a bare Map without building a Sim. */
export interface ProgressEventSimView {
  entities: Map<number, Entity>;
}

// Per-process FIFO tail, the deeds_records pattern: chaining preserves event
// order per process; a rejection is caught (logged) and the chain continues.
let tail: Promise<void> = Promise.resolve();

/** Mirror one level-up into level_up_events, fire-and-forget. */
export function recordLevelUp(who: ProgressEventWho, level: number): void {
  try {
    tail = tail
      .then(() =>
        insertLevelUpEvent(pool, {
          realm: REALM,
          characterId: who.characterId,
          accountId: who.accountId,
          level,
        }),
      )
      .catch((err) => {
        console.error('level_up_events write failed:', err);
      });
  } catch (err) {
    // The observer must never fault the event-routing path.
    console.error('progress recordLevelUp failed:', err);
  }
}

/** Mirror one quest accept/turn-in into ftue_events, fire-and-forget.
 *  Silently drops events past the FTUE window (the gate, not an error). */
export function recordFtueQuest(
  who: ProgressEventWho,
  kind: Extract<FtueEventKind, 'quest_accepted' | 'quest_done'>,
  questId: string,
  level: number,
): void {
  if (level > FTUE_MAX_LEVEL) return;
  try {
    tail = tail
      .then(() =>
        insertFtueEvent(pool, {
          realm: REALM,
          characterId: who.characterId,
          accountId: who.accountId,
          kind,
          questId,
          level,
        }),
      )
      .catch((err) => {
        console.error('ftue_events write failed:', err);
      });
  } catch (err) {
    console.error('progress recordFtueQuest failed:', err);
  }
}

/** Mirror one player death into ftue_events, fire-and-forget. Derives the
 *  level, zone, and killer template from the live entity map at call time
 *  (the drain runs the same tick, so both entities are still present; a
 *  despawned killer degrades to null, never an error). */
export function recordFtueDeath(
  who: ProgressEventWho,
  sim: ProgressEventSimView,
  entityId: number,
  killerId: number,
): void {
  try {
    const player = sim.entities.get(entityId);
    if (!player) return;
    const level = player.level;
    if (level > FTUE_MAX_LEVEL) return;
    const zone = zoneAt(player.pos.x, player.pos.z)?.id ?? null;
    const killer = sim.entities.get(killerId)?.templateId ?? null;
    tail = tail
      .then(() =>
        insertFtueEvent(pool, {
          realm: REALM,
          characterId: who.characterId,
          accountId: who.accountId,
          kind: 'death',
          level,
          zone,
          killer,
        }),
      )
      .catch((err) => {
        console.error('ftue_events death write failed:', err);
      });
  } catch (err) {
    console.error('progress recordFtueDeath failed:', err);
  }
}

/** The current FIFO tail, for tests to await the queue draining deterministically. */
export function progressEventsIdle(): Promise<void> {
  return tail;
}
