// Pure geometry and tuning for Varkhul's broad Forgefather's Sweep. The
// encounter and renderer consume the same footprint so the warning cannot
// disagree with authoritative damage.

export type VarkhulDifficulty = 'normal' | 'heroic';

export const VARKHUL_FRONTAL_CAST_ID = "Forgefather's Sweep";
export const VARKHUL_FRONTAL_CAST_SECONDS = 2.5;
export const VARKHUL_FRONTAL_RANGE = 30;
export const VARKHUL_FRONTAL_HALF_ANGLE = Math.PI / 3;
export const VARKHUL_FRONTAL_DAMAGE_MAX_HP_NORMAL = 0.65;
export const VARKHUL_FRONTAL_DAMAGE_MAX_HP_HEROIC = 0.9;

export function varkhulFrontalDamageMaxHp(difficulty: VarkhulDifficulty): number {
  return difficulty === 'heroic'
    ? VARKHUL_FRONTAL_DAMAGE_MAX_HP_HEROIC
    : VARKHUL_FRONTAL_DAMAGE_MAX_HP_NORMAL;
}

export function pointInVarkhulFrontal(
  origin: { x: number; z: number },
  facing: number,
  point: { x: number; z: number },
): boolean {
  const dx = point.x - origin.x;
  const dz = point.z - origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0 || distance > VARKHUL_FRONTAL_RANGE) return false;
  const forwardX = Math.sin(facing);
  const forwardZ = Math.cos(facing);
  const dot = (dx * forwardX + dz * forwardZ) / distance;
  return dot >= Math.cos(VARKHUL_FRONTAL_HALF_ANGLE) - Number.EPSILON * 16;
}
