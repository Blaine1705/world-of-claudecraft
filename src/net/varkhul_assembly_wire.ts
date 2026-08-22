// Strict decoders for Varkhul's Heroic Anvil meteors and Master's Assembly.
// Every nested row is validated independently so malformed rolling-deploy
// snapshots are dropped rather than partially rendered.

import type { ActiveVarkhulAnvilMeteorWarning } from '../sim/varkhul_anvil_meteors';
import {
  type ActiveVarkhulAssembly,
  type ActiveVarkhulMoltenCore,
  type ActiveVarkhulRune,
  type ActiveVarkhulRuneAssignment,
  VARKHUL_ASSEMBLY_RUNE_COUNT,
  type VarkhulAssemblyPhase,
  type VarkhulAssemblyRuneControl,
} from '../sim/varkhul_assembly';

const PHASES = new Set<VarkhulAssemblyPhase>([
  'adds',
  'cores',
  'convergence',
  'links',
  'stunned',
  'done',
]);

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0;
}

export function decodeVarkhulAnvilMeteors(value: unknown): ActiveVarkhulAnvilMeteorWarning[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown): ActiveVarkhulAnvilMeteorWarning[] => {
    if (!row || typeof row !== 'object') return [];
    const meteor = row as Record<string, unknown>;
    if (
      typeof meteor.id !== 'string' ||
      ![meteor.x, meteor.z, meteor.r, meteor.dur, meteor.rem, meteor.lead].every(finite) ||
      (meteor.r as number) <= 0 ||
      (meteor.dur as number) <= 0 ||
      (meteor.rem as number) <= 0 ||
      (meteor.lead as number) < 0
    ) {
      return [];
    }
    return [
      {
        id: meteor.id,
        x: meteor.x as number,
        z: meteor.z as number,
        radius: meteor.r as number,
        duration: meteor.dur as number,
        remaining: Math.min(meteor.rem as number, meteor.dur as number),
        warningLead: Math.min(meteor.lead as number, meteor.dur as number),
      },
    ];
  });
}

function decodeCore(value: unknown): ActiveVarkhulMoltenCore | null {
  if (!value || typeof value !== 'object') return null;
  const core = value as Record<string, unknown>;
  if (
    typeof core.id !== 'string' ||
    !finite(core.x) ||
    !finite(core.z) ||
    !(core.cid === null || nonNegativeInteger(core.cid)) ||
    !(core.del === 0 || core.del === 1)
  ) {
    return null;
  }
  return {
    id: core.id,
    x: core.x,
    z: core.z,
    carrierId: core.cid,
    delivered: core.del === 1,
  };
}

function decodeAssignment(value: unknown): ActiveVarkhulRuneAssignment | null {
  if (!value || typeof value !== 'object') return null;
  const assignment = value as Record<string, unknown>;
  if (
    !nonNegativeInteger(assignment.pid) ||
    !nonNegativeInteger(assignment.sym) ||
    assignment.sym >= VARKHUL_ASSEMBLY_RUNE_COUNT ||
    !(assignment.lock === 0 || assignment.lock === 1)
  ) {
    return null;
  }
  return {
    playerId: assignment.pid,
    symbol: assignment.sym,
    locked: assignment.lock === 1,
  };
}

function decodeRune(value: unknown): ActiveVarkhulRune | null {
  if (!value || typeof value !== 'object') return null;
  const rune = value as Record<string, unknown>;
  if (
    !nonNegativeInteger(rune.sym) ||
    rune.sym >= VARKHUL_ASSEMBLY_RUNE_COUNT ||
    ![rune.x, rune.z, rune.r, rune.ta, rune.ga].every(finite) ||
    (rune.r as number) <= 0 ||
    !(rune.c === 0 || rune.c === 1 || rune.c === 2) ||
    !(rune.al === 0 || rune.al === 1) ||
    !(rune.lock === 0 || rune.lock === 1)
  ) {
    return null;
  }
  const controls: readonly VarkhulAssemblyRuneControl[] = ['off', 'counterclockwise', 'clockwise'];
  return {
    symbol: rune.sym,
    x: rune.x as number,
    z: rune.z as number,
    radius: rune.r as number,
    assignedPlayerId: null,
    locked: rune.lock === 1,
    targetAngle: rune.ta as number,
    glyphAngle: rune.ga as number,
    control: controls[rune.c as number],
    aligned: rune.al === 1,
  };
}

function uniqueRows(rows: readonly { playerId?: number; symbol: number }[]): boolean {
  const symbols = new Set<number>();
  const players = new Set<number>();
  for (const row of rows) {
    if (symbols.has(row.symbol)) return false;
    symbols.add(row.symbol);
    if (row.playerId === undefined) continue;
    if (players.has(row.playerId)) return false;
    players.add(row.playerId);
  }
  return true;
}

export function decodeVarkhulAssemblies(value: unknown): ActiveVarkhulAssembly[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown): ActiveVarkhulAssembly[] => {
    if (!row || typeof row !== 'object') return [];
    const assembly = row as Record<string, unknown>;
    if (
      !nonNegativeInteger(assembly.bossId) ||
      typeof assembly.phase !== 'string' ||
      !PHASES.has(assembly.phase as VarkhulAssemblyPhase) ||
      ![assembly.fx, assembly.fz, assembly.hp, assembly.mhp, assembly.win, assembly.rem].every(
        finite,
      ) ||
      (assembly.hp as number) < 0 ||
      (assembly.mhp as number) <= 0 ||
      (assembly.win as number) < 0 ||
      (assembly.rem as number) < 0 ||
      !nonNegativeInteger(assembly.round) ||
      !nonNegativeInteger(assembly.rounds) ||
      (assembly.rounds as number) <= 0 ||
      !Array.isArray(assembly.cores) ||
      !Array.isArray(assembly.assign) ||
      !Array.isArray(assembly.runes)
    ) {
      return [];
    }
    const cores = assembly.cores.map(decodeCore);
    const assignments = assembly.assign.map(decodeAssignment);
    const runes = assembly.runes.map(decodeRune);
    if (cores.includes(null) || assignments.includes(null) || runes.includes(null)) return [];
    const decodedAssignments = assignments as ActiveVarkhulRuneAssignment[];
    const decodedRunes = runes as ActiveVarkhulRune[];
    if (
      !uniqueRows(decodedAssignments) ||
      !uniqueRows(decodedRunes) ||
      decodedAssignments.length > VARKHUL_ASSEMBLY_RUNE_COUNT ||
      decodedRunes.length > VARKHUL_ASSEMBLY_RUNE_COUNT ||
      (assembly.phase === 'links' && decodedRunes.length !== VARKHUL_ASSEMBLY_RUNE_COUNT)
    ) {
      return [];
    }
    const assignmentBySymbol = new Map(
      decodedAssignments.map((assignment) => [assignment.symbol, assignment]),
    );
    for (const rune of decodedRunes) {
      const assignment = assignmentBySymbol.get(rune.symbol);
      rune.assignedPlayerId = assignment?.playerId ?? null;
      if (rune.locked !== (assignment?.locked ?? false)) return [];
    }
    return [
      {
        bossId: assembly.bossId,
        phase: assembly.phase as VarkhulAssemblyPhase,
        forgeX: assembly.fx as number,
        forgeZ: assembly.fz as number,
        forgeHp: Math.min(assembly.hp as number, assembly.mhp as number),
        forgeMaxHp: assembly.mhp as number,
        cores: cores as ActiveVarkhulMoltenCore[],
        deliveryWindowRemaining: assembly.win as number,
        assignments: decodedAssignments,
        runes: decodedRunes,
        round: assembly.round,
        rounds: assembly.rounds,
        remaining: assembly.rem as number,
      },
    ];
  });
}
