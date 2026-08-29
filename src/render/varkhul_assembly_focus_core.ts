import {
  VARKHUL_ASSEMBLY_RUNE_CONTROL_OFFSET,
  VARKHUL_ASSEMBLY_RUNE_CONTROL_RADIUS,
} from '../sim/varkhul_assembly';

export type VarkhulAssemblyRuneVisualMode =
  | 'hidden'
  | 'focused'
  | 'teammate'
  | 'spectator'
  | 'orphan'
  | 'sealed';

export interface VarkhulAssemblyFocusRune {
  symbol: number;
  x: number;
  z: number;
  ownerAngle: number;
  trackRadius: number;
  assignedPlayerId: number | null;
  locked: boolean;
  orphaned: boolean;
}

export interface VarkhulAssemblyFocusState {
  difficulty: 'normal' | 'heroic';
  phase: string;
  runes: readonly VarkhulAssemblyFocusRune[];
}

export interface VarkhulAssemblyViewerFocus {
  playerId: number;
  x: number;
  z: number;
  assignedSymbol: number | null;
}

export interface VarkhulAssemblyFocusPlan {
  focusedSymbol: number | null;
  focusKind: 'own' | 'rescue' | null;
  guideVisible: boolean;
  guideAngle: number;
  runeModes: VarkhulAssemblyRuneVisualMode[];
}

function ownerAngleDistance(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function runeHasPhysicalNeighbor(
  runes: readonly VarkhulAssemblyFocusRune[],
  rune: VarkhulAssemblyFocusRune,
  candidateSymbol: number,
): boolean {
  let nearestSymbol: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let secondSymbol: number | null = null;
  let secondDistance = Number.POSITIVE_INFINITY;
  for (const candidate of runes) {
    if (candidate.symbol === rune.symbol) continue;
    const distance = ownerAngleDistance(candidate.ownerAngle, rune.ownerAngle);
    const beforeNearest =
      distance < nearestDistance ||
      (distance === nearestDistance &&
        (nearestSymbol === null || candidate.symbol < nearestSymbol));
    if (beforeNearest) {
      secondSymbol = nearestSymbol;
      secondDistance = nearestDistance;
      nearestSymbol = candidate.symbol;
      nearestDistance = distance;
      continue;
    }
    if (
      distance < secondDistance ||
      (distance === secondDistance && (secondSymbol === null || candidate.symbol < secondSymbol))
    ) {
      secondSymbol = candidate.symbol;
      secondDistance = distance;
    }
  }
  return candidateSymbol === nearestSymbol || candidateSymbol === secondSymbol;
}

export function varkhulAssemblyFocusPlanInto(
  state: VarkhulAssemblyFocusState,
  viewer: VarkhulAssemblyViewerFocus,
  output: VarkhulAssemblyFocusPlan,
): VarkhulAssemblyFocusPlan {
  const runeModes = output.runeModes;
  runeModes.length = state.runes.length;
  runeModes.fill('hidden');
  if (state.phase !== 'links') {
    output.focusedSymbol = null;
    output.focusKind = null;
    output.guideVisible = false;
    output.guideAngle = 0;
    return output;
  }

  let viewerRune: VarkhulAssemblyFocusRune | undefined;
  let assignedSymbolRune: VarkhulAssemblyFocusRune | undefined;
  let ownActiveRune: VarkhulAssemblyFocusRune | undefined;
  for (const rune of state.runes) {
    if (rune.assignedPlayerId === viewer.playerId) {
      viewerRune = rune;
      if (!rune.locked && !rune.orphaned) ownActiveRune = rune;
    }
    if (viewer.assignedSymbol !== null && rune.symbol === viewer.assignedSymbol) {
      assignedSymbolRune = rune;
    }
  }
  viewerRune ??= assignedSymbolRune;
  let rescueRune: VarkhulAssemblyFocusRune | undefined;
  if (!ownActiveRune && state.difficulty === 'heroic' && viewerRune) {
    for (const rune of state.runes) {
      if (
        rune.assignedPlayerId !== null &&
        !rune.locked &&
        rune.orphaned &&
        runeHasPhysicalNeighbor(state.runes, rune, viewerRune.symbol)
      ) {
        rescueRune = rune;
        break;
      }
    }
  }
  const focusedRune = ownActiveRune ?? rescueRune;
  const focusKind = ownActiveRune ? 'own' : rescueRune ? 'rescue' : null;
  const participant = viewer.assignedSymbol !== null || viewerRune !== undefined;

  for (let index = 0; index < state.runes.length; index++) {
    const rune = state.runes[index];
    if (rune.locked) runeModes[index] = 'sealed';
    else if (rune.assignedPlayerId === null) runeModes[index] = 'hidden';
    else if (rune.symbol === focusedRune?.symbol) runeModes[index] = 'focused';
    else if (rune.orphaned) runeModes[index] = 'orphan';
    else runeModes[index] = participant ? 'teammate' : 'spectator';
  }

  if (!focusedRune) {
    output.focusedSymbol = null;
    output.focusKind = null;
    output.guideVisible = false;
    output.guideAngle = 0;
    return output;
  }
  const distance = Math.hypot(focusedRune.x - viewer.x, focusedRune.z - viewer.z);
  const interactionExtent =
    focusedRune.trackRadius +
    VARKHUL_ASSEMBLY_RUNE_CONTROL_OFFSET +
    VARKHUL_ASSEMBLY_RUNE_CONTROL_RADIUS;
  output.focusedSymbol = focusedRune.symbol;
  output.focusKind = focusKind;
  output.guideVisible = distance > interactionExtent;
  output.guideAngle = Math.atan2(focusedRune.x - viewer.x, focusedRune.z - viewer.z);
  return output;
}

export function varkhulAssemblyFocusPlan(
  state: VarkhulAssemblyFocusState,
  viewer: VarkhulAssemblyViewerFocus,
): VarkhulAssemblyFocusPlan {
  return varkhulAssemblyFocusPlanInto(state, viewer, {
    focusedSymbol: null,
    focusKind: null,
    guideVisible: false,
    guideAngle: 0,
    runeModes: [],
  });
}
