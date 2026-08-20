// Viewer-scoped Varkhul ground-mechanic snapshot fragment. The broadcast loop
// supplies one prebuilt realm projection; this module filters and serializes it
// once per viewer without growing the GameServer coordinator.

import type { ActiveVarkhulForgestormWarning } from '../src/sim/varkhul_forgestorm';
import type { ActiveVarkhulHammerZone } from '../src/sim/varkhul_hammers';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function inRange(
  point: { x: number; z: number },
  anchor: { x: number; z: number },
  radius: number,
): boolean {
  const dx = point.x - anchor.x;
  const dz = point.z - anchor.z;
  return dx * dx + dz * dz <= radius * radius;
}

export function varkhulEncounterWireJson(
  forgestormWarnings: readonly ActiveVarkhulForgestormWarning[],
  hammerZones: readonly ActiveVarkhulHammerZone[],
  anchor: { x: number; z: number },
  eventRadius: number,
): string {
  const forgestorm = forgestormWarnings
    .filter((warning) => inRange(warning, anchor, eventRadius))
    .map(
      (warning) =>
        `{"id":${warning.id},"sourceId":${warning.sourceId},"x":${round2(warning.x)},"z":${round2(warning.z)},"r":${round2(warning.radius)},"dur":${round2(warning.duration)},"rem":${round2(warning.remaining)}}`,
    );
  const hammers = hammerZones
    .filter((zone) => inRange(zone, anchor, eventRadius))
    .map(
      (zone) =>
        `{"id":${JSON.stringify(zone.id)},"sourceId":${zone.sourceId},"phase":${JSON.stringify(zone.phase)},"x":${round2(zone.x)},"z":${round2(zone.z)},"r":${round2(zone.radius)},"dur":${round2(zone.duration)},"rem":${round2(zone.remaining)}}`,
    );
  const forgestormJson =
    forgestorm.length > 0 ? `,"varkhulForgestorm":[${forgestorm.join(',')}]` : '';
  const hammersJson = hammers.length > 0 ? `,"varkhulHammers":[${hammers.join(',')}]` : '';
  return forgestormJson + hammersJson;
}
