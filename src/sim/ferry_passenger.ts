// Is this entity a ferry passenger? One predicate for both worlds: the offline
// Sim's entities carry the authoritative ride (`ferryRide`,
// src/sim/transport_ferry.ts), the online mirror carries the wire bit
// (`ferryRiding` / `ferryAtSea`, src/net/transport_wire.ts). The HUD, the
// renderer and the self-motion gate ask here, never which world they run in.
// Pure leaf.

import type { Entity } from './types';

type FerryFields = Pick<Entity, 'ferryRide' | 'ferryRiding' | 'ferryAtSea'>;

/** Riding the ferry: the ship owns the body's position, input is locked. */
export function isFerryPassenger(e: FerryFields): boolean {
  return !!e.ferryRide || e.ferryRiding === true;
}

/** Riding the hidden at-sea leg: neither the ship nor its passengers draw. */
export function isFerryPassengerAtSea(e: FerryFields): boolean {
  return e.ferryRide ? e.ferryRide.atSea : e.ferryAtSea === true;
}
