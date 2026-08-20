// Strict snapshot decoder for Varkhul's reconnect-safe hammer warnings and
// persistent fire zones. Malformed or future rows are dropped, never rendered.

import type { ActiveVarkhulHammerZone } from '../sim/varkhul_hammers';

const PHASES = new Set<ActiveVarkhulHammerZone['phase']>(['warning', 'fire']);

export function decodeVarkhulHammerZones(value: unknown): ActiveVarkhulHammerZone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown): ActiveVarkhulHammerZone[] => {
    if (!row || typeof row !== 'object') return [];
    const zone = row as Record<string, unknown>;
    if (
      typeof zone.id !== 'string' ||
      typeof zone.phase !== 'string' ||
      !PHASES.has(zone.phase as ActiveVarkhulHammerZone['phase']) ||
      ![zone.sourceId, zone.x, zone.z, zone.r, zone.dur, zone.rem].every(
        (entry) => typeof entry === 'number' && Number.isFinite(entry),
      ) ||
      (zone.sourceId as number) < 0 ||
      (zone.r as number) <= 0 ||
      (zone.dur as number) <= 0 ||
      (zone.rem as number) <= 0
    ) {
      return [];
    }
    return [
      {
        id: zone.id,
        sourceId: zone.sourceId as number,
        phase: zone.phase as ActiveVarkhulHammerZone['phase'],
        x: zone.x as number,
        z: zone.z as number,
        radius: zone.r as number,
        duration: zone.dur as number,
        remaining: Math.min(zone.rem as number, zone.dur as number),
      },
    ];
  });
}
