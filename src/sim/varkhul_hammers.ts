// Deterministic geometry and reconnect-safe presentation projection for
// Varkhul's Marked Hammers. The encounter owns timing and damage; this leaf
// owns only point placement and the minimal world-view contract.

export const VARKHUL_MARKED_HAMMERS_TARGETS = 3;
export const VARKHUL_MARKED_HAMMERS_MARK_SECONDS = 4;
export const VARKHUL_MARKED_HAMMERS_STRIKES = 3;
export const VARKHUL_MARKED_HAMMERS_WARNING_SECONDS = 1.25;
export const VARKHUL_MARKED_HAMMERS_IMPACT_RADIUS = 3;
export const VARKHUL_MARKED_HAMMERS_IMPACT_DAMAGE_MAX_HP = 0.25;
export const VARKHUL_HAMMER_FIRE_RADIUS = 2.4;
export const VARKHUL_HAMMER_FIRE_DURATION = 12;
export const VARKHUL_HAMMER_FIRE_TICK_SECONDS = 1;
export const VARKHUL_HAMMER_FIRE_DAMAGE_MAX_HP = 0.04;
export const VARKHUL_RED_HOT_METAL_DURATION = 10;
export const VARKHUL_RED_HOT_METAL_TICK_SECONDS = 2;
export const VARKHUL_RED_HOT_METAL_DAMAGE_MAX_HP = 0.04;
export const VARKHUL_RED_HOT_METAL_HEAL_ABSORB_MAX_HP = 0.3;

export interface VarkhulHammerFireState {
  id: string;
  pos: { x: number; y: number; z: number };
  remaining: number;
  tickTimer: number;
}

export interface VarkhulHammerZoneState {
  hammersCastKey: number;
  hammersStrikeIndex: number;
  hammersWarningRemaining: number;
  hammersPoints: ReadonlyArray<{ x: number; z: number }>;
  hammerFires: readonly VarkhulHammerFireState[];
}

export interface ActiveVarkhulHammerZone {
  id: string;
  sourceId: number;
  phase: 'warning' | 'fire';
  x: number;
  z: number;
  radius: number;
  duration: number;
  remaining: number;
}

export function varkhulHammerImpactPoint(
  target: { x: number; z: number },
  castKey: number,
  strikeIndex: number,
  targetIndex: number,
): { x: number; z: number } {
  const angle = castKey * 0.61 + strikeIndex * 1.91 + targetIndex * ((Math.PI * 2) / 3);
  const distance = strikeIndex % 2 === 0 ? 1.5 : 2.25;
  return {
    x: target.x + Math.sin(angle) * distance,
    z: target.z + Math.cos(angle) * distance,
  };
}

export function varkhulHammerWarningId(
  bossId: number,
  castKey: number,
  strikeIndex: number,
  pointIndex: number,
): string {
  return `${bossId}:hammer:${castKey}:${strikeIndex}:${pointIndex}`;
}

export function varkhulHammerFireId(
  bossId: number,
  castKey: number,
  strikeIndex: number,
  pointIndex: number,
): string {
  return `${bossId}:fire:${castKey}:${strikeIndex}:${pointIndex}`;
}

export function activeVarkhulHammerZones(
  bossId: number,
  state: VarkhulHammerZoneState,
): ActiveVarkhulHammerZone[] {
  const zones: ActiveVarkhulHammerZone[] = [];
  if (state.hammersWarningRemaining > 0) {
    for (let pointIndex = 0; pointIndex < state.hammersPoints.length; pointIndex++) {
      const point = state.hammersPoints[pointIndex];
      zones.push({
        id: varkhulHammerWarningId(
          bossId,
          state.hammersCastKey,
          state.hammersStrikeIndex,
          pointIndex,
        ),
        sourceId: bossId,
        phase: 'warning',
        x: point.x,
        z: point.z,
        radius: VARKHUL_MARKED_HAMMERS_IMPACT_RADIUS,
        duration: VARKHUL_MARKED_HAMMERS_WARNING_SECONDS,
        remaining: Math.min(state.hammersWarningRemaining, VARKHUL_MARKED_HAMMERS_WARNING_SECONDS),
      });
    }
  }
  for (const fire of state.hammerFires ?? []) {
    if (fire.remaining <= 0) continue;
    zones.push({
      id: fire.id,
      sourceId: bossId,
      phase: 'fire',
      x: fire.pos.x,
      z: fire.pos.z,
      radius: VARKHUL_HAMMER_FIRE_RADIUS,
      duration: VARKHUL_HAMMER_FIRE_DURATION,
      remaining: Math.min(fire.remaining, VARKHUL_HAMMER_FIRE_DURATION),
    });
  }
  return zones;
}
