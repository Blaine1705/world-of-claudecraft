// The online client's half of the scheduled ferry (src/sim/transport_ferry.ts
// is the authority). Nothing ferry-specific rides the wire beyond two terse
// fields:
//  - the snapshot head's `time` (every snapshot already carries it) is the
//    schedule clock, unless a dev skip is active on the server, in which case
//    the head adds `fc` (the offset clock; server/transport_head.ts);
//  - an entity's `fry` bit: 1 while it rides the ferry, 2 on the hidden at-sea
//    leg (server wireEntity dynamic fields).
// From the clock the ClientWorld derives the same phase and ship pose the
// server runs (transport_schedule.ts), and re-applies the berth gates to its
// own collider grid so the local self-extrapolator and the renderer's seating
// see the deck exactly where the server does.
//
// The decoded clock lives in a WeakMap keyed by the world (one entry per
// ClientWorld, collected with it), so online.ts carries no field for it.
// DOM-free and socket-free.

import { setColliderGateOpen } from '../sim/colliders';
import { TRANSPORT_ROUTES } from '../sim/content/transport_ships';
import { syncTransportGates } from '../sim/transport_gates';
import {
  emptyTransportFerryView,
  type TransportFerryView,
  transportFerryViewAt,
} from '../sim/transport_schedule';
import type { Entity } from '../sim/types';
import { WATER_LEVEL } from '../sim/world';

/** What the decode needs from the world: its seed and its own player. */
export interface TransportWireWorld {
  cfg: { seed: number };
  player: Entity | undefined;
}

interface ClientTransportState {
  clock: number;
  view: TransportFerryView | null;
}

const states = new WeakMap<object, ClientTransportState>();

function stateFor(world: object): ClientTransportState {
  let st = states.get(world);
  if (!st) {
    st = { clock: 0, view: null };
    states.set(world, st);
  }
  return st;
}

/** The schedule clock a snapshot head carries (`fc` when a dev skip is on,
 *  else `time`), or null when the frame carries neither as a finite number. */
export function transportClockFromHead(snap: Readonly<Record<string, unknown>>): number | null {
  const fc = snap.fc;
  if (typeof fc === 'number' && Number.isFinite(fc)) return fc;
  const time = snap.time;
  if (typeof time === 'number' && Number.isFinite(time)) return time;
  return null;
}

/** Decode one snapshot head: record the clock, re-apply the berth gates. */
export function applyTransportSnapshot(
  world: TransportWireWorld,
  snap: Readonly<Record<string, unknown>>,
): void {
  const clock = transportClockFromHead(snap);
  if (clock === null) return;
  stateFor(world).clock = clock;
  syncTransportGates(world.cfg.seed, clock, setColliderGateOpen);
}

/** Decode an entity's `fry` bit onto its client mirrors. */
export function applyFerryWire(e: Entity, fry: unknown): void {
  e.ferryRiding = fry === 1 || fry === 2;
  e.ferryAtSea = fry === 2;
}

/** ClientWorld.ferryView: the first route at the last snapshot's clock. */
export function clientFerryView(world: TransportWireWorld): TransportFerryView | null {
  const route = TRANSPORT_ROUTES[0];
  if (!route) return null;
  const st = stateFor(world);
  st.view ??= emptyTransportFerryView(route);
  const passenger = world.player?.ferryRiding === true;
  return transportFerryViewAt(route, st.clock, WATER_LEVEL, passenger, st.view);
}
