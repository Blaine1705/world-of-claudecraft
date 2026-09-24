// The scheduled ferry's ship on screen: one transport ship view per route
// (render/transport_ship.ts, the Phase 1 model and its idle clip), posed every
// frame from the world's timetable view (IWorld.ferryView): docked at a berth,
// sailing out or in along its path, hidden on the at-sea leg. The pose comes
// from the same pure schedule the sim runs (sim/transport_schedule.ts) at a
// drawn clock smoothed between world ticks (transport_ship_core.ts
// advanceShipClock), so the hull glides at frame rate and trails the newest
// tick by the same step the entity interpolation shows its passengers with.
//
// GPU work: the views are built into the props root at world build (the props
// material prewarm already stages the ship's programs, transportShipPrewarmParts),
// and moving or hiding one changes no program: this module never creates a
// material, a light or a geometry after build.

import { TRANSPORT_ROUTES } from '../sim/content/transport_ships';
import {
  type TransportFerryView,
  type TransportPose,
  type TransportRouteDef,
  transportShipPoseAt,
} from '../sim/transport_schedule';
import { WATER_LEVEL } from '../sim/world';
import { buildTransportShipView, type TransportShipView } from './transport_ship';
import { advanceShipClock, newShipClockState, type ShipClockState } from './transport_ship_core';

/** What the ferry view reads from the world (an IWorld satisfies it). */
export interface FerryViewSource {
  ferryView(): TransportFerryView | null;
}

interface ScheduledShip {
  route: TransportRouteDef;
  view: TransportShipView;
  clock: ShipClockState;
}

export interface ScheduledShips {
  /** Pose every scheduled ship for this frame (before the ships' own update). */
  sync(dt: number): void;
}

/**
 * Build the scheduled ships (built-in world only: the routes are authored for
 * it) and hand each view to `adopt`, which parents it and ticks it like any
 * moored ship. They start at their first berth, the clock-0 schedule.
 */
export function buildScheduledShips(
  source: FerryViewSource,
  adopt: (view: TransportShipView) => void,
): ScheduledShips {
  const ships: ScheduledShip[] = [];
  for (const route of TRANSPORT_ROUTES) {
    const b = route.berths[0];
    const view = buildTransportShipView({
      key: route.ship,
      x: b.x,
      z: b.z,
      rot: b.rot,
      baseY: WATER_LEVEL,
    });
    if (!view) continue;
    adopt(view);
    ships.push({ route, view, clock: newShipClockState() });
  }
  const pose: TransportPose = { x: 0, z: 0, rot: 0 };
  return {
    sync(dt) {
      if (ships.length === 0) return;
      const view = source.ferryView();
      for (let i = 0; i < ships.length; i++) {
        const ship = ships[i];
        if (!view || view.routeId !== ship.route.id) continue;
        const clock = advanceShipClock(ship.clock, view.clock, dt);
        const shown = transportShipPoseAt(ship.route, clock, pose);
        ship.view.setPose(pose.x, pose.z, pose.rot, shown);
      }
    },
  };
}
