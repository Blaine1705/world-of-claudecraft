import type { TransportFerryView } from '../sim/transport_schedule';

export type { TransportFerryView } from '../sim/transport_schedule';

// Scheduled transport (the Eastbrook ferry between Eastbrook Docks and
// Wickharbor). The timetable is a pure function of the schedule clock
// (src/sim/transport_schedule.ts): the offline Sim reads its own clock, the
// online ClientWorld the clock the snapshot head carries, so both derive the
// same phase and ship pose. Boarding, carrying and set-down are server
// authoritative (src/sim/transport_ferry.ts); nothing here sends a command.
export interface IWorldTransport {
  /** The ferry's live state for the HUD and renderer: phase, the berth it
   *  lies at or is bound for, seconds to the next departure, the ship's
   *  pose (and whether it is drawn), the schedule clock, and whether the
   *  viewing player rides it. A LIVE object each world reuses: read it
   *  within the frame, never retain it. Null when no route runs (a custom
   *  editor world). */
  ferryView(): TransportFerryView | null;
}
