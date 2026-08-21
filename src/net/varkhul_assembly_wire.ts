// Strict decoders for Varkhul's Heroic Anvil meteors and Master's Assembly.
// Every nested row is validated independently so malformed rolling-deploy
// snapshots are dropped rather than partially rendered.

import type { ActiveVarkhulAnvilMeteorWarning } from '../sim/varkhul_anvil_meteors';
import {
  type ActiveVarkhulAssembly,
  type ActiveVarkhulLinkAssignment,
  type ActiveVarkhulLinkPad,
  type ActiveVarkhulMoltenCore,
  VARKHUL_ASSEMBLY_LINK_SYMBOLS,
  type VarkhulAssemblyHammerControl,
  type VarkhulAssemblyPhase,
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
  )
    return null;
  return {
    id: core.id,
    x: core.x,
    z: core.z,
    carrierId: core.cid,
    delivered: core.del === 1,
  };
}

function decodeAssignment(value: unknown): ActiveVarkhulLinkAssignment | null {
  if (!value || typeof value !== 'object') return null;
  const assignment = value as Record<string, unknown>;
  if (
    !nonNegativeInteger(assignment.pid) ||
    !nonNegativeInteger(assignment.sym) ||
    assignment.sym >= VARKHUL_ASSEMBLY_LINK_SYMBOLS ||
    !(assignment.role === 0 || assignment.role === 1) ||
    !(assignment.lock === 0 || assignment.lock === 1)
  )
    return null;
  return {
    playerId: assignment.pid,
    symbol: assignment.sym,
    role: assignment.role === 1 ? 'hammer' : 'anvil',
    locked: assignment.lock === 1,
  };
}

function decodePad(value: unknown): ActiveVarkhulLinkPad | null {
  if (!value || typeof value !== 'object') return null;
  const pad = value as Record<string, unknown>;
  if (
    !nonNegativeInteger(pad.sym) ||
    pad.sym >= VARKHUL_ASSEMBLY_LINK_SYMBOLS ||
    ![pad.x, pad.z, pad.r, pad.p, pad.ta, pad.aa].every(finite) ||
    (pad.r as number) <= 0 ||
    (pad.p as number) < 0 ||
    (pad.p as number) > 1 ||
    !(pad.ar === 0 || pad.ar === 1) ||
    !(pad.hr === 0 || pad.hr === 1) ||
    !(pad.c === 0 || pad.c === 1 || pad.c === 2 || pad.c === 3) ||
    !(pad.al === 0 || pad.al === 1) ||
    !(pad.lock === 0 || pad.lock === 1)
  )
    return null;
  const controls: readonly VarkhulAssemblyHammerControl[] = [
    'off',
    'counterclockwise',
    'brake',
    'clockwise',
  ];
  return {
    symbol: pad.sym,
    x: pad.x as number,
    z: pad.z as number,
    radius: pad.r as number,
    progress: pad.p as number,
    locked: pad.lock === 1,
    anvilReady: pad.ar === 1,
    hammerReady: pad.hr === 1,
    targetAngle: pad.ta as number,
    armAngle: pad.aa as number,
    control: controls[pad.c as number],
    aligned: pad.al === 1,
  };
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
      !Array.isArray(assembly.pads)
    )
      return [];
    const cores = assembly.cores.map(decodeCore);
    const assignments = assembly.assign.map(decodeAssignment);
    const pads = assembly.pads.map(decodePad);
    if (cores.includes(null) || assignments.includes(null) || pads.includes(null)) return [];
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
        assignments: assignments as ActiveVarkhulLinkAssignment[],
        pads: pads as ActiveVarkhulLinkPad[],
        round: assembly.round,
        rounds: assembly.rounds,
        remaining: assembly.rem as number,
      },
    ];
  });
}
