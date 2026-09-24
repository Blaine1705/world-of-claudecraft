// The scheduled ferry's share of the server wire (src/sim/transport_ferry.ts is
// the authority; src/net/transport_wire.ts the client decode), plus the two
// entity-record splicers the snapshot builder shares, moved out of game.ts
// under the monolith ratchet.
//
// The ferry's schedule clock IS the snapshot head's `time` in play, so the head
// normally carries nothing extra. Only while a dev skip is active
// (ALLOW_DEV_COMMANDS, /dev ferry: a non-zero Sim.transportClockOffset) does
// the head add `fc`, the offset clock, so online clients follow the jumped
// timetable. Built once per broadcast pass with the head (serialize-once).

import type { Sim } from '../src/sim/sim';

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** The head fragment for the ferry clock: `,"fc":<clock>` or ''. */
export function transportHeadJson(sim: Pick<Sim, 'time' | 'transportClockOffset'>): string {
  const offset = sim.transportClockOffset;
  if (!offset) return '';
  return `,"fc":${round2(sim.time + offset)}`;
}

/** A full entity record: id, identity fields, dynamic fields. */
export function fullEntityJson(id: number, idJson: string, dynJson: string): string {
  return `{"id":${id},${idJson.slice(1, -1)},${dynJson.slice(1, -1)}}`;
}

/** A lite entity record: id and dynamic fields only. */
export function liteEntityJson(id: number, dynJson: string): string {
  return `{"id":${id},${dynJson.slice(1, -1)}}`;
}
