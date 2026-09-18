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

/** `hold`: the automatic ceiling is in force (or on a return trial), so the
 *  governor keeps its quality levels and the headroom goes to the cadence. */
export function setChosenCadence(intervalMs: number, share: number, hold: boolean): void {
  chosenIntervalMs = intervalMs > 0 ? intervalMs : 0;
  missShare = chosenIntervalMs > 0 ? share : NO_CHOSEN_CADENCE;
  holdQuality = hold;
}

export function chosenCadenceHoldsQuality(): boolean {
  return holdQuality;
}

/** Written by the renderer after each governor update, read by the automatic
 *  ceiling: quality is shed first, the ceiling waits its turn. */
export function noteGovernorShedding(shedding: boolean): void {
  governorShedding = shedding;
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
