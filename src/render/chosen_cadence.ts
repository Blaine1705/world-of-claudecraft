// The one signal saying the client paces its own rendered frames (the frame
// rate ceiling). Written once per rendered frame by the frame loop's cadence
// wiring (src/game/frame_cadence_wiring.ts), read by the consumers that would
// otherwise take the chosen interval for a slow machine. Module state, like
// arrival_cover.ts: the writer and the readers share no object to thread it on.

import { chosenCadenceLoadMs, NO_CHOSEN_CADENCE } from './chosen_cadence_pressure_core';

let chosenIntervalMs = 0;
let missShare = NO_CHOSEN_CADENCE;
let holdQuality = false;
let governorShedding = false;
let governorAtBaseline = false;
let playerInCombat = false;

/** `hold`: the automatic ceiling is still forming its verdict (a provisional
 *  hold, a probe, a probation), so the governor keeps its quality levels. */
export function setChosenCadence(intervalMs: number, share: number, hold: boolean): void {
  chosenIntervalMs = intervalMs > 0 ? intervalMs : 0;
  missShare = chosenIntervalMs > 0 ? share : NO_CHOSEN_CADENCE;
  holdQuality = hold;
}

/** A new renderer starts with a governor that is not shedding: without this a
 *  value left by the previous one would stop the automatic ceiling for good. */
export function resetChosenCadenceForRenderer(): void {
  governorShedding = false;
  governorAtBaseline = false;
  playerInCombat = false;
}

export function chosenCadenceHoldsQuality(): boolean {
  return holdQuality;
}

/** Written by the renderer after each governor update, read by the automatic
 *  ceiling: quality is shed first, the ceiling waits its turn. */
export function noteGovernorShedding(shedding: boolean): void {
  governorShedding = shedding;
}

/** The renderer's other two readings for the automatic ceiling: the governor
 *  has restored its baseline quality (the headroom evidence a probe needs), and
 *  the player is in a fight (no probe then). */
export function noteCadenceProbeContext(atBaseline: boolean, inCombat: boolean): void {
  governorAtBaseline = atBaseline;
  playerInCombat = inCombat;
}

export function governorIsAtBaseline(): boolean {
  return governorAtBaseline;
}

export function cadencePlayerInCombat(): boolean {
  return playerInCombat;
}

export function governorIsShedding(): boolean {
  return governorShedding;
}

/** The chosen interval in ms, 0 when the display paces the frames. */
export function chosenCadenceIntervalMs(): number {
  return chosenIntervalMs;
}

export function chosenCadenceMissShare(): number {
  return missShare;
}

/** The frame interval as a load reading (see chosenCadenceLoadMs). */
export function frameLoadMs(intervalMs: number): number {
  return chosenCadenceLoadMs(intervalMs, chosenIntervalMs);
}
