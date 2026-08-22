// Pure contracts for Master's Assembly: molten-core transport, forge damage,
// and the shared spatial rune interface. The encounter owns mutation; render
// and wire consume the stable public projection types below.

import { hash2 } from './rng';

export type VarkhulAssemblyPhase = 'adds' | 'cores' | 'convergence' | 'links' | 'stunned' | 'done';
export type VarkhulAssemblyDifficulty = 'normal' | 'heroic';
export type VarkhulAssemblyRuneControl = 'off' | 'counterclockwise' | 'clockwise';
export type VarkhulAssemblyRuneOutcome = 'full' | 'partial' | 'failed';

export interface VarkhulAssemblyRuneAssignment {
  playerId: number;
  symbol: number;
}

export interface ActiveVarkhulMoltenCore {
  id: string;
  x: number;
  z: number;
  carrierId: number | null;
  delivered: boolean;
}

export interface ActiveVarkhulRuneAssignment extends VarkhulAssemblyRuneAssignment {
  locked: boolean;
}

export interface ActiveVarkhulRune {
  symbol: number;
  x: number;
  z: number;
  radius: number;
  assignedPlayerId: number | null;
  locked: boolean;
  targetAngle: number;
  glyphAngle: number;
  control: VarkhulAssemblyRuneControl;
  aligned: boolean;
}

export interface ActiveVarkhulAssembly {
  bossId: number;
  phase: VarkhulAssemblyPhase;
  forgeX: number;
  forgeZ: number;
  forgeHp: number;
  forgeMaxHp: number;
  cores: ActiveVarkhulMoltenCore[];
  deliveryWindowRemaining: number;
  assignments: ActiveVarkhulRuneAssignment[];
  runes: ActiveVarkhulRune[];
  round: number;
  rounds: number;
  remaining: number;
}

export interface VarkhulAssemblyProjectionState {
  assemblyTriggered: boolean;
  assemblyPhase: VarkhulAssemblyPhase;
  assemblyForgeHp: number;
  assemblyCores: readonly {
    id: string;
    pos: { x: number; z: number };
    carrierId: number | null;
    delivered: boolean;
  }[];
  assemblyDeliveryWindowRemaining: number;
  assemblyRuneCenter: { x: number; z: number } | null;
  assemblyRuneAssignments: readonly ActiveVarkhulRuneAssignment[];
  assemblyRuneAngles: readonly number[];
  assemblyRuneControls: readonly VarkhulAssemblyRuneControl[];
  assemblyRuneRound: number;
  assemblyRuneRounds: number;
  assemblyRuneRemaining: number;
}

export const VARKHUL_ASSEMBLY_FORGE_MAX_HP = 100;
export const VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE = 20;
export const VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE = 40;
export const VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS = 6;
export const VARKHUL_ASSEMBLY_CORE_PICKUP_RADIUS = 1.8;
export const VARKHUL_ASSEMBLY_FORGE_DELIVERY_RADIUS = 3;
export const VARKHUL_ASSEMBLY_BURDEN_TICK_SECONDS = 2;
export const VARKHUL_ASSEMBLY_CONVERGENCE_SECONDS = 4;
export const VARKHUL_ASSEMBLY_RUNE_COUNT = 10;
export const VARKHUL_ASSEMBLY_RUNE_RADIUS = 3.3;
export const VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE = 30;
export const VARKHUL_ASSEMBLY_RUNE_GLYPH_ORBIT = 2.12;
export const VARKHUL_ASSEMBLY_RUNE_TARGET_ORBIT = 3.05;
export const VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS = 1.28;
export const VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS = 2.56;
export const VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS = 3.3;
export const VARKHUL_ASSEMBLY_RUNE_ALIGNMENT_RADIANS = Math.PI / 28;
export const VARKHUL_ASSEMBLY_RUNE_SPEED_NORMAL = 1.08;
export const VARKHUL_ASSEMBLY_RUNE_SPEED_HEROIC = 1.32;
export const VARKHUL_ASSEMBLY_LINK_FIREBALLS_NORMAL = 3;
export const VARKHUL_ASSEMBLY_LINK_FIREBALLS_HEROIC = 5;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_SECONDS_NORMAL = 3.2;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_SECONDS_HEROIC = 2.3;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_SPAWN_DISTANCE = 31;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_RADIUS = 1.45;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_DURATION = 7;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_NORMAL = 0.16;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_HEROIC = 0.2;
export const VARKHUL_ASSEMBLY_RUNE_SECONDS_NORMAL = 25;
export const VARKHUL_ASSEMBLY_RUNE_SECONDS_HEROIC = 22;
export const VARKHUL_ASSEMBLY_STUN_SECONDS = 15;
export const VARKHUL_ASSEMBLY_PARTIAL_STUN_SECONDS = 8;
export const VARKHUL_ASSEMBLY_STUN_DAMAGE_TAKEN_BONUS = 0.5;
export const VARKHUL_ASSEMBLY_PARTIAL_DAMAGE_TAKEN_BONUS = 0.25;
export const VARKHUL_ASSEMBLY_LINK_FAILURE_DAMAGE_NORMAL = 0.2;
export const VARKHUL_ASSEMBLY_LINK_FAILURE_DAMAGE_HEROIC = 0.25;

export function varkhulAssemblyBurdenDamageMaxHp(stacks: number): number {
  return Math.min(0.1, Math.max(1, Math.floor(stacks)) * 0.02);
}

export function varkhulAssemblyRounds(difficulty: VarkhulAssemblyDifficulty): number {
  void difficulty;
  return 1;
}

export function varkhulAssemblyRuneSeconds(difficulty: VarkhulAssemblyDifficulty): number {
  return difficulty === 'heroic'
    ? VARKHUL_ASSEMBLY_RUNE_SECONDS_HEROIC
    : VARKHUL_ASSEMBLY_RUNE_SECONDS_NORMAL;
}

export function varkhulAssemblyRuneAssignments(
  playerIds: readonly number[],
  bossId: number,
  round: number,
): VarkhulAssemblyRuneAssignment[] {
  const ordered = [...new Set(playerIds)]
    .sort((first, second) => {
      const firstScore = hash2(bossId + round * 131, first, 0x1a55e);
      const secondScore = hash2(bossId + round * 131, second, 0x1a55e);
      return firstScore - secondScore || first - second;
    })
    .slice(0, VARKHUL_ASSEMBLY_RUNE_COUNT);
  return ordered.map((playerId, symbol) => ({ playerId, symbol }));
}

function normalizedAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function positiveAngle(angle: number): number {
  const normalized = normalizedAngle(angle);
  return normalized < 0 ? normalized + Math.PI * 2 : normalized;
}

function angleDelta(from: number, to: number): number {
  return normalizedAngle(to - from);
}

export function varkhulAssemblyRuneTargetAngle(
  bossId: number,
  symbol: number,
  round: number,
): number {
  const safeSymbol = Math.max(0, Math.floor(symbol)) % VARKHUL_ASSEMBLY_RUNE_COUNT;
  const safeRound = Math.max(0, Math.floor(round));
  return normalizedAngle(
    hash2(bossId + safeRound * 977, safeSymbol + 1, 0x70a41) * Math.PI * 2 - Math.PI,
  );
}

export function varkhulAssemblyRuneStartAngle(
  bossId: number,
  symbol: number,
  round: number,
): number {
  const target = varkhulAssemblyRuneTargetAngle(bossId, symbol, round);
  const separation = Math.PI * (0.55 + hash2(bossId + round * 313, symbol + 1, 0x51a47) * 0.9);
  return normalizedAngle(target + separation);
}

export function varkhulAssemblyRuneControlAt(
  station: { x: number; z: number },
  player: { x: number; z: number },
): VarkhulAssemblyRuneControl {
  const distance = Math.hypot(player.x - station.x, player.z - station.z);
  if (!Number.isFinite(distance)) return 'off';
  const boundaryEpsilon = 1e-9;
  if (distance <= VARKHUL_ASSEMBLY_RUNE_INNER_CONTROL_RADIUS + boundaryEpsilon) {
    return 'counterclockwise';
  }
  if (
    distance >= VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_INNER_RADIUS - boundaryEpsilon &&
    distance <= VARKHUL_ASSEMBLY_RUNE_OUTER_CONTROL_OUTER_RADIUS + boundaryEpsilon
  ) {
    return 'clockwise';
  }
  return 'off';
}

export function varkhulAssemblyRuneAligned(glyphAngle: number, targetAngle: number): boolean {
  return (
    Number.isFinite(glyphAngle) &&
    Number.isFinite(targetAngle) &&
    Math.abs(angleDelta(glyphAngle, targetAngle)) <= VARKHUL_ASSEMBLY_RUNE_ALIGNMENT_RADIANS
  );
}

export function varkhulAssemblyBestRuneControl(
  glyphAngle: number,
  targetAngle: number,
): Exclude<VarkhulAssemblyRuneControl, 'off'> {
  return angleDelta(glyphAngle, targetAngle) >= 0 ? 'clockwise' : 'counterclockwise';
}

export function varkhulAssemblyStepRune(
  glyphAngle: number,
  control: VarkhulAssemblyRuneControl,
  difficulty: VarkhulAssemblyDifficulty,
  seconds: number,
  targetAngle: number,
): number {
  if (control === 'off' || seconds <= 0 || varkhulAssemblyRuneAligned(glyphAngle, targetAngle)) {
    return varkhulAssemblyRuneAligned(glyphAngle, targetAngle) ? targetAngle : glyphAngle;
  }
  const direction = control === 'clockwise' ? 1 : -1;
  const speed =
    difficulty === 'heroic'
      ? VARKHUL_ASSEMBLY_RUNE_SPEED_HEROIC
      : VARKHUL_ASSEMBLY_RUNE_SPEED_NORMAL;
  const travel = speed * Math.max(0, seconds);
  const distanceToTarget =
    direction > 0
      ? positiveAngle(targetAngle - glyphAngle)
      : positiveAngle(glyphAngle - targetAngle);
  if (distanceToTarget <= travel + VARKHUL_ASSEMBLY_RUNE_ALIGNMENT_RADIANS) return targetAngle;
  return normalizedAngle(glyphAngle + direction * travel);
}

export function varkhulAssemblyRuneOutcome(lockedRunes: number): VarkhulAssemblyRuneOutcome {
  const locked = Math.max(0, Math.floor(lockedRunes));
  if (locked >= VARKHUL_ASSEMBLY_RUNE_COUNT) return 'full';
  if (locked >= Math.ceil(VARKHUL_ASSEMBLY_RUNE_COUNT * 0.6)) return 'partial';
  return 'failed';
}

export function varkhulAssemblyRuneStation(
  roomCenter: { x: number; z: number },
  symbol: number,
  round: number,
): { x: number; z: number } {
  void round;
  const angle =
    Math.PI / VARKHUL_ASSEMBLY_RUNE_COUNT +
    (Math.max(0, Math.floor(symbol)) % VARKHUL_ASSEMBLY_RUNE_COUNT) *
      ((Math.PI * 2) / VARKHUL_ASSEMBLY_RUNE_COUNT);
  return {
    x: roomCenter.x + Math.sin(angle) * VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE,
    z: roomCenter.z + Math.cos(angle) * VARKHUL_ASSEMBLY_RUNE_STATION_DISTANCE,
  };
}

export function varkhulAssemblyFireballCadence(difficulty: VarkhulAssemblyDifficulty): number {
  return difficulty === 'heroic'
    ? VARKHUL_ASSEMBLY_LINK_FIREBALL_SECONDS_HEROIC
    : VARKHUL_ASSEMBLY_LINK_FIREBALL_SECONDS_NORMAL;
}

export function varkhulAssemblyFireballPattern(
  forge: { x: number; z: number },
  difficulty: VarkhulAssemblyDifficulty,
  round: number,
  wave: number,
): Array<{ x: number; z: number; dirX: number; dirZ: number }> {
  const count =
    difficulty === 'heroic'
      ? VARKHUL_ASSEMBLY_LINK_FIREBALLS_HEROIC
      : VARKHUL_ASSEMBLY_LINK_FIREBALLS_NORMAL;
  const rotation = round * 0.73 + wave * 0.91;
  return Array.from({ length: count }, (_, index) => {
    const angle = rotation + (index * Math.PI * 2) / count;
    const outwardX = Math.sin(angle);
    const outwardZ = Math.cos(angle);
    return {
      x: forge.x + outwardX * VARKHUL_ASSEMBLY_LINK_FIREBALL_SPAWN_DISTANCE,
      z: forge.z + outwardZ * VARKHUL_ASSEMBLY_LINK_FIREBALL_SPAWN_DISTANCE,
      dirX: -outwardX,
      dirZ: -outwardZ,
    };
  });
}

export function activeVarkhulAssembly(
  bossId: number,
  state: VarkhulAssemblyProjectionState,
  forge: { x: number; z: number },
  positionOf: (entityId: number) => { x: number; z: number } | undefined,
): ActiveVarkhulAssembly | null {
  if (!state.assemblyTriggered || state.assemblyPhase === 'done') return null;
  const runeCenter = state.assemblyRuneCenter ?? forge;
  const runes = Array.from({ length: VARKHUL_ASSEMBLY_RUNE_COUNT }, (_, symbol) => {
    const point = varkhulAssemblyRuneStation(runeCenter, symbol, state.assemblyRuneRound);
    const assignment = state.assemblyRuneAssignments.find((entry) => entry.symbol === symbol);
    const targetAngle = varkhulAssemblyRuneTargetAngle(bossId, symbol, state.assemblyRuneRound);
    const glyphAngle =
      state.assemblyRuneAngles[symbol] ??
      varkhulAssemblyRuneStartAngle(bossId, symbol, state.assemblyRuneRound);
    return {
      symbol,
      ...point,
      radius: VARKHUL_ASSEMBLY_RUNE_RADIUS,
      assignedPlayerId: assignment?.playerId ?? null,
      locked: assignment?.locked ?? false,
      targetAngle,
      glyphAngle,
      control: state.assemblyRuneControls[symbol] ?? 'off',
      aligned: varkhulAssemblyRuneAligned(glyphAngle, targetAngle),
    };
  });
  return {
    bossId,
    phase: state.assemblyPhase,
    forgeX: forge.x,
    forgeZ: forge.z,
    forgeHp: state.assemblyForgeHp,
    forgeMaxHp: VARKHUL_ASSEMBLY_FORGE_MAX_HP,
    cores: state.assemblyCores.map((core) => {
      const carrierPos = core.carrierId === null ? undefined : positionOf(core.carrierId);
      return {
        id: core.id,
        x: carrierPos?.x ?? core.pos.x,
        z: carrierPos?.z ?? core.pos.z,
        carrierId: core.carrierId,
        delivered: core.delivered,
      };
    }),
    deliveryWindowRemaining: state.assemblyDeliveryWindowRemaining,
    assignments: state.assemblyRuneAssignments.map((assignment) => ({ ...assignment })),
    runes,
    round: state.assemblyRuneRound,
    rounds: state.assemblyRuneRounds,
    remaining: state.assemblyRuneRemaining,
  };
}
