import { NORTH_WATCH_CANNON } from '../src/sim/content/vehicle_stations';
import { isCannonActionId } from '../src/sim/minigames/cannon_encounter';
import type { CannonActionId, CannonPoint } from '../src/sim/types';

interface VehicleCommands {
  enterVehicle(station: string, pid: number): unknown;
  useVehicleAction(action: CannonActionId, point: CannonPoint, pid: number): unknown;
  leaveVehicle(pid: number): void;
}

export function dispatchVehicleCommand(
  sim: VehicleCommands,
  pid: number,
  msg: Record<string, unknown>,
): void {
  if (msg.cmd === 'vehicle_leave') sim.leaveVehicle(pid);
  else if (msg.cmd === 'vehicle_enter' && msg.station === NORTH_WATCH_CANNON.id)
    sim.enterVehicle(msg.station, pid);
  else if (
    msg.cmd === 'vehicle_action' &&
    isCannonActionId(msg.action) &&
    typeof msg.x === 'number' &&
    Number.isFinite(msg.x) &&
    typeof msg.z === 'number' &&
    Number.isFinite(msg.z)
  )
    sim.useVehicleAction(msg.action, { x: msg.x, z: msg.z }, pid);
}
