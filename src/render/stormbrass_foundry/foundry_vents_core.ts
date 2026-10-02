// Pure plan of Line-Master Tock's Scalding Vents (foundry_vents.ts draws it):
// where every walkway's floor warning lies, where the steam grilles sit along
// each walkway, and how the look runs with the phase the sim's strip objects
// carry (sim/encounters/stormbrass_foundry/scalding_vents.ts: template warn,
// then scald, then gone). Everything is derived from the sim's own layout and
// tuning, so the strip a player reads is the floor the sim scalds.
//
// Three-free, DOM-free, deterministic.

import { MAIN_LINE, MAIN_LINE_BELTS } from '../../sim/content/stormbrass_foundry_layout';
import {
  FOUNDRY_VENT_TEMPLATES,
  TOCK_TUNING,
  walkwayStrips,
} from '../../sim/encounters/stormbrass_foundry/ids';
import { TELEGRAPH_THREAT_COLORS } from '../floor_telegraph/telegraph_look_core';

export type VentPhase = 'off' | 'warn' | 'scald';

/** The phase a strip object's template names (anything else: off). */
export function ventPhaseOf(templateId: string | undefined): VentPhase {
  if (templateId === FOUNDRY_VENT_TEMPLATES.warn) return 'warn';
  if (templateId === FOUNDRY_VENT_TEMPLATES.scald) return 'scald';
  return 'off';
}

export interface VentLane {
  /** Instance-local centre line and half width of the walkway. */
  x: number;
  halfWidth: number;
  /** Its start (the chute end) and length along +z. */
  z0: number;
  length: number;
}

/** The five walkways as floor lanes, west to east (the strip objects' order). */
export const VENT_LANES: readonly VentLane[] = walkwayStrips(MAIN_LINE, MAIN_LINE_BELTS).map(
  (w) => ({
    x: (w.x0 + w.x1) / 2,
    halfWidth: (w.x1 - w.x0) / 2,
    z0: MAIN_LINE_BELTS.z0,
    length: MAIN_LINE_BELTS.z1 - MAIN_LINE_BELTS.z0,
  }),
);

/** The floor warning's look: avoidable damage, steam in its motes. */
export const VENT_LANE_STYLE = {
  color: TELEGRAPH_THREAT_COLORS.danger,
  accent: 0xe9eef0,
} as const;

export interface VentGrille {
  /** Instance-local centre. */
  x: number;
  z: number;
  /** 0 to 1, stable per grille (its jet's phase and height). */
  seed: number;
}

/** Yards between grilles along a walkway. */
export const VENT_GRILLE_SPACING = 3.5;
/** A grille's half size (a square floor grate). */
export const VENT_GRILLE_HALF = 0.85;

/** Every steam grille: a row down each walkway's centre line, staggered from
 *  one walkway to the next so the jets never line up into a wall. */
export function ventGrilles(): VentGrille[] {
  const out: VentGrille[] = [];
  VENT_LANES.forEach((lane, w) => {
    const count = Math.floor(lane.length / VENT_GRILLE_SPACING);
    const pad = (lane.length - (count - 1) * VENT_GRILLE_SPACING) / 2;
    const stagger = w % 2 === 0 ? 0 : VENT_GRILLE_SPACING / 2;
    for (let i = 0; i < count; i++) {
      const z = lane.z0 + pad + i * VENT_GRILLE_SPACING + stagger;
      if (z > lane.z0 + lane.length - VENT_GRILLE_HALF) continue;
      out.push({ x: lane.x, z, seed: ((((w * 7 + i * 13) * 0.6180339) % 1) + 1) % 1 });
    }
  });
  return out;
}

/** The floor warning's fill `age` seconds into `phase`: it counts the warning
 *  down, then stands full while the steam blows. */
export function ventLaneFill(phase: VentPhase, age: number): number {
  if (phase === 'off') return 0;
  if (phase === 'scald') return 1;
  return Math.min(1, Math.max(0, age / TOCK_TUNING.ventWarning));
}

/** The jets' target strength (0 none, 1 the full scalding column) `age`
 *  seconds into `phase`: a sputter that builds through the warning, the full
 *  blast while it scalds (sagging over its last half second), nothing off. */
export function ventJetTarget(phase: VentPhase, age: number): number {
  if (phase === 'off') return 0;
  if (phase === 'warn') return 0.1 + 0.12 * Math.min(1, Math.max(0, age / TOCK_TUNING.ventWarning));
  const left = TOCK_TUNING.ventScald - age;
  return left < 0.5 ? Math.max(0.35, left / 0.5) : 1;
}

/** The grilles' glow (0 cold iron, 1 white hot): it climbs through the
 *  warning, holds while it scalds, and is cold when off. */
export function ventHeatTarget(phase: VentPhase, age: number): number {
  if (phase === 'off') return 0;
  if (phase === 'scald') return 1;
  return 0.25 + 0.55 * Math.min(1, Math.max(0, age / TOCK_TUNING.ventWarning));
}

/** Ease `value` toward `target` over `dt` (fast up, slower down): the jets
 *  burst at once and die away. */
export function ventEase(value: number, target: number, dt: number): number {
  const rate = target > value ? 14 : 3.2;
  const k = 1 - Math.exp(-rate * Math.max(0, dt));
  return value + (target - value) * k;
}
