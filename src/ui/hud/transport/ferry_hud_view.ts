// The ferry HUD's pure view-core: from the world's timetable view
// (IWorld.ferryView) and where the player stands, what the small ferry panel
// says and whether the full-screen sea card is up. DOM-free; the painter
// (ferry_hud_painter.ts) only writes what this returns.
//
//  - On the pier or aboard a docked ship (within FERRY_HUD_NEAR_YD of it):
//    "The ferry to <dest> departs in 0:45", plus the boarding hint.
//  - Riding it: "Sailing to <dest>", and the sea card from just before the
//    ship vanishes at sea until just after it reappears off the far harbor,
//    so the at-sea crossing (and its jump between harbors) happens behind it.
//  - Anywhere else, or with no ferry in this world: nothing.

import { TRANSPORT_ROUTES } from '../../../sim/content/transport_ships';
import type { TransportFerryView } from '../../../world_api';

/** The panel shows the countdown this close (yards) to the docked ship. */
export const FERRY_HUD_NEAR_YD = 45;
/** The sea card starts fading in this long before the at-sea leg... */
export const FERRY_CARD_LEAD_S = 1.5;
/** ...and stays up this far into the arrival, while the far harbor loads in. */
export const FERRY_CARD_TAIL_S = 0.6;

export type FerryHudLine = 'none' | 'departsIn' | 'castingOff' | 'sailing';

export interface FerryHudModel {
  line: FerryHudLine;
  /** The destination's POI mark (poi:<zone>:<poi>), for its localized label. */
  destPoi: string;
  /** Whole seconds to the departure (departsIn only). */
  seconds: number;
  /** The boarding hint under the countdown. */
  hint: boolean;
  /** The full-screen sea card. */
  card: boolean;
}

export function emptyFerryHudModel(): FerryHudModel {
  return { line: 'none', destPoi: '', seconds: 0, hint: false, card: false };
}

/** Fill `out` for this update (allocation free). */
export function ferryHudModel(
  view: TransportFerryView | null,
  playerX: number,
  playerZ: number,
  out: FerryHudModel = emptyFerryHudModel(),
): FerryHudModel {
  out.line = 'none';
  out.destPoi = '';
  out.seconds = 0;
  out.hint = false;
  out.card = false;
  if (!view) return out;
  const route = TRANSPORT_ROUTES.find((r) => r.id === view.routeId);
  if (!route) return out;
  const dest = route.berths.find((b) => b.id === view.to);
  out.destPoi = dest?.poi ?? '';
  if (view.passenger) {
    out.line = 'sailing';
    const t = route.timings;
    out.card =
      view.phase === 'atSea' ||
      (view.phase === 'departing' && view.remaining <= FERRY_CARD_LEAD_S) ||
      (view.phase === 'arriving' && t.arriving - view.remaining <= FERRY_CARD_TAIL_S);
    return out;
  }
  if (view.phase !== 'docked') return out;
  if (Math.hypot(playerX - view.x, playerZ - view.z) > FERRY_HUD_NEAR_YD) return out;
  out.seconds = Math.ceil(view.departsIn);
  out.line = out.seconds >= 1 ? 'departsIn' : 'castingOff';
  out.hint = true;
  return out;
}
