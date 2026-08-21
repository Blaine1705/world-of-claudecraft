// Pure contracts for Master's Assembly: molten-core transport, forge damage,
// and the shared spatial symbol-pair puzzle. The encounter owns mutation;
// render and wire consume the stable public projection types below.

import { hash2 } from './rng';

export type VarkhulAssemblyPhase = 'adds' | 'cores' | 'convergence' | 'links' | 'stunned' | 'done';
export type VarkhulAssemblyDifficulty = 'normal' | 'heroic';
export type VarkhulAssemblyLinkRole = 'anvil' | 'hammer';
export type VarkhulAssemblyHammerControl = 'off' | 'counterclockwise' | 'brake' | 'clockwise';
export type VarkhulAssemblyLinkOutcome = 'full' | 'partial' | 'failed';

export interface VarkhulAssemblyLinkAssignment {
  playerId: number;
  symbol: number;
  role: VarkhulAssemblyLinkRole;
}

export interface ActiveVarkhulMoltenCore {
  id: string;
  x: number;
  z: number;
  carrierId: number | null;
  delivered: boolean;
}

export interface ActiveVarkhulLinkAssignment extends VarkhulAssemblyLinkAssignment {
  locked: boolean;
}

export interface ActiveVarkhulLinkPad {
  symbol: number;
  x: number;
  z: number;
  radius: number;
  progress: number;
  locked: boolean;
  anvilReady: boolean;
  hammerReady: boolean;
  targetAngle: number;
  armAngle: number;
  control: VarkhulAssemblyHammerControl;
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
  assignments: ActiveVarkhulLinkAssignment[];
  pads: ActiveVarkhulLinkPad[];
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
  assemblyLinkAssignments: readonly ActiveVarkhulLinkAssignment[];
  assemblyLinkPadProgress: readonly number[];
  assemblyLinkPadSlots: readonly number[];
  assemblyLinkArmAngles: readonly number[];
  assemblyLinkHammerControls: readonly VarkhulAssemblyHammerControl[];
  assemblyLinkAnvilReady: readonly boolean[];
  assemblyLinkHammerReady: readonly boolean[];
  assemblyLinkRound: number;
  assemblyLinkRounds: number;
  assemblyLinkRemaining: number;
}

export const VARKHUL_ASSEMBLY_FORGE_MAX_HP = 100;
export const VARKHUL_ASSEMBLY_CORE_BASE_DAMAGE = 20;
export const VARKHUL_ASSEMBLY_UNSTABLE_REACTION_DAMAGE = 40;
export const VARKHUL_ASSEMBLY_CORE_WINDOW_SECONDS = 6;
export const VARKHUL_ASSEMBLY_CORE_PICKUP_RADIUS = 1.8;
export const VARKHUL_ASSEMBLY_FORGE_DELIVERY_RADIUS = 3;
export const VARKHUL_ASSEMBLY_BURDEN_TICK_SECONDS = 2;
export const VARKHUL_ASSEMBLY_CONVERGENCE_SECONDS = 4;
export const VARKHUL_ASSEMBLY_LINK_SYMBOLS = 5;
export const VARKHUL_ASSEMBLY_LINK_PAD_RADIUS = 3;
export const VARKHUL_ASSEMBLY_LINK_PAD_DISTANCE = 14;
export const VARKHUL_ASSEMBLY_LINK_HOLD_SECONDS = 1.5;
export const VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT = 0.82;
export const VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS = 0.68;
export const VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT = 2.56;
export const VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS = 0.7;
export const VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ANGLE = 0.84;
export const VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS = Math.PI / 24;
export const VARKHUL_ASSEMBLY_LINK_ARM_SPEED_NORMAL = 1.15;
export const VARKHUL_ASSEMBLY_LINK_ARM_SPEED_HEROIC = 1.45;
export const VARKHUL_ASSEMBLY_LINK_FIREBALLS_NORMAL = 3;
export const VARKHUL_ASSEMBLY_LINK_FIREBALLS_HEROIC = 5;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_SECONDS_NORMAL = 3.2;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_SECONDS_HEROIC = 2.3;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_SPAWN_DISTANCE = 31;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_RADIUS = 1.45;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_DURATION = 7;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_NORMAL = 0.16;
export const VARKHUL_ASSEMBLY_LINK_FIREBALL_DAMAGE_HEROIC = 0.2;
export const VARKHUL_ASSEMBLY_LINK_SECONDS_NORMAL = 25;
export const VARKHUL_ASSEMBLY_LINK_SECONDS_HEROIC = 22;
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

export function varkhulAssemblyLinkSeconds(difficulty: VarkhulAssemblyDifficulty): number {
  return difficulty === 'heroic'
    ? VARKHUL_ASSEMBLY_LINK_SECONDS_HEROIC
    : VARKHUL_ASSEMBLY_LINK_SECONDS_NORMAL;
}

export function varkhulAssemblyLinkAssignments(
  playerIds: readonly number[],
  bossId: number,
  round: number,
): VarkhulAssemblyLinkAssignment[] {
  const ordered = [...playerIds].sort((first, second) => {
    const firstScore = hash2(bossId + round * 131, first, 0x1a55e);
    const secondScore = hash2(bossId + round * 131, second, 0x1a55e);
    return firstScore - secondScore || first - second;
  });
  return ordered.map((playerId, index) => ({
    playerId,
    symbol: Math.floor(index / 2) % VARKHUL_ASSEMBLY_LINK_SYMBOLS,
    role: index % 2 === 0 ? 'anvil' : 'hammer',
  }));
}

function normalizedAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleDelta(from: number, to: number): number {
  return normalizedAngle(to - from);
}

export function varkhulAssemblyAnvilTargetAngle(symbol: number, round: number): number {
  const safeSymbol = Math.max(0, Math.floor(symbol)) % VARKHUL_ASSEMBLY_LINK_SYMBOLS;
  const safeRound = Math.max(0, Math.floor(round));
  return normalizedAngle(0.48 + safeSymbol * 1.71 + safeRound * 0.83);
}

export function varkhulAssemblyAnvilTarget(
  pad: { x: number; z: number },
  symbol: number,
  round: number,
): { x: number; z: number } {
  const angle = varkhulAssemblyAnvilTargetAngle(symbol, round);
  return {
    x: pad.x + Math.sin(angle) * VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
    z: pad.z + Math.cos(angle) * VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_ORBIT,
  };
}

export function varkhulAssemblyAnvilTargetReady(
  player: { x: number; z: number },
  target: { x: number; z: number },
): boolean {
  const distance = Math.hypot(player.x - target.x, player.z - target.z);
  return Number.isFinite(distance) && distance <= VARKHUL_ASSEMBLY_LINK_ANVIL_TARGET_RADIUS;
}

export function varkhulAssemblyHammerControlPoints(
  forge: { x: number; z: number },
  pad: { x: number; z: number },
): Record<Exclude<VarkhulAssemblyHammerControl, 'off'>, { x: number; z: number }> {
  const outwardAngle = Math.atan2(pad.x - forge.x, pad.z - forge.z);
  const point = (offset: number) => ({
    x: pad.x + Math.sin(outwardAngle + offset) * VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
    z: pad.z + Math.cos(outwardAngle + offset) * VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ORBIT,
  });
  return {
    counterclockwise: point(-VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ANGLE),
    brake: point(0),
    clockwise: point(VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_ANGLE),
  };
}

export function varkhulAssemblyHammerControlAt(
  forge: { x: number; z: number },
  pad: { x: number; z: number },
  player: { x: number; z: number },
): VarkhulAssemblyHammerControl {
  const points = varkhulAssemblyHammerControlPoints(forge, pad);
  for (const control of ['counterclockwise', 'brake', 'clockwise'] as const) {
    const point = points[control];
    if (
      Math.hypot(player.x - point.x, player.z - point.z) <=
      VARKHUL_ASSEMBLY_LINK_HAMMER_CONTROL_RADIUS
    ) {
      return control;
    }
  }
  return 'off';
}

export function varkhulAssemblyArmAligned(armAngle: number, targetAngle: number): boolean {
  return (
    Number.isFinite(armAngle) &&
    Number.isFinite(targetAngle) &&
    Math.abs(angleDelta(armAngle, targetAngle)) <= VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS
  );
}

export function varkhulAssemblyBestHammerControl(
  armAngle: number,
  targetAngle: number,
): VarkhulAssemblyHammerControl {
  const delta = angleDelta(armAngle, targetAngle);
  if (Math.abs(delta) <= VARKHUL_ASSEMBLY_LINK_ARM_ALIGNMENT_RADIANS) return 'brake';
  return delta > 0 ? 'clockwise' : 'counterclockwise';
}

export function varkhulAssemblyStepArm(
  armAngle: number,
  control: VarkhulAssemblyHammerControl,
  difficulty: VarkhulAssemblyDifficulty,
  seconds: number,
): number {
  const direction = control === 'clockwise' ? 1 : control === 'counterclockwise' ? -1 : 0;
  const speed =
    difficulty === 'heroic'
      ? VARKHUL_ASSEMBLY_LINK_ARM_SPEED_HEROIC
      : VARKHUL_ASSEMBLY_LINK_ARM_SPEED_NORMAL;
  return normalizedAngle(armAngle + direction * speed * Math.max(0, seconds));
}

export function varkhulAssemblyLinkOutcome(lockedSymbols: number): VarkhulAssemblyLinkOutcome {
  const locked = Math.max(0, Math.floor(lockedSymbols));
  if (locked >= VARKHUL_ASSEMBLY_LINK_SYMBOLS) return 'full';
  if (locked >= 3) return 'partial';
  return 'failed';
}

export function varkhulAssemblyLinkPad(
  forge: { x: number; z: number },
  symbol: number,
  round: number,
): { x: number; z: number } {
  const angle =
    round * 0.73 +
    (Math.max(0, Math.floor(symbol)) % VARKHUL_ASSEMBLY_LINK_SYMBOLS) *
      ((Math.PI * 2) / VARKHUL_ASSEMBLY_LINK_SYMBOLS);
  return {
    x: forge.x + Math.sin(angle) * VARKHUL_ASSEMBLY_LINK_PAD_DISTANCE,
    z: forge.z + Math.cos(angle) * VARKHUL_ASSEMBLY_LINK_PAD_DISTANCE,
  };
}

export function varkhulAssemblyLinkPadAtSlot(
  forge: { x: number; z: number },
  slot: number,
  round: number,
): { x: number; z: number } {
  return varkhulAssemblyLinkPad(forge, slot, round);
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
  const pads = Array.from({ length: VARKHUL_ASSEMBLY_LINK_SYMBOLS }, (_, symbol) => {
    const point = varkhulAssemblyLinkPadAtSlot(
      forge,
      state.assemblyLinkPadSlots?.[symbol] ?? symbol,
      state.assemblyLinkRound,
    );
    const assignments = state.assemblyLinkAssignments.filter(
      (assignment) => assignment.symbol === symbol,
    );
    return {
      symbol,
      ...point,
      radius: VARKHUL_ASSEMBLY_LINK_PAD_RADIUS,
      progress: Math.min(
        1,
        Math.max(
          0,
          (state.assemblyLinkPadProgress[symbol] ?? 0) / VARKHUL_ASSEMBLY_LINK_HOLD_SECONDS,
        ),
      ),
      locked: assignments.length > 0 && assignments.every((assignment) => assignment.locked),
      anvilReady: state.assemblyLinkAnvilReady?.[symbol] ?? false,
      hammerReady: state.assemblyLinkHammerReady?.[symbol] ?? false,
      targetAngle: varkhulAssemblyAnvilTargetAngle(symbol, state.assemblyLinkRound),
      armAngle:
        state.assemblyLinkArmAngles?.[symbol] ??
        varkhulAssemblyAnvilTargetAngle(symbol, state.assemblyLinkRound) + Math.PI / 2,
      control: state.assemblyLinkHammerControls?.[symbol] ?? 'off',
      aligned: varkhulAssemblyArmAligned(
        state.assemblyLinkArmAngles?.[symbol] ?? Number.POSITIVE_INFINITY,
        varkhulAssemblyAnvilTargetAngle(symbol, state.assemblyLinkRound),
      ),
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
    assignments: state.assemblyLinkAssignments.map((assignment) => ({ ...assignment })),
    pads,
    round: state.assemblyLinkRound,
    rounds: state.assemblyLinkRounds,
    remaining: state.assemblyLinkRemaining,
  };
}
