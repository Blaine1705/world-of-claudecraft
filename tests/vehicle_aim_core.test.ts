import { describe, expect, it, vi } from 'vitest';
import { createCannonEncounter } from '../src/sim/minigames/cannon_encounter';
import { VehicleAimCore } from '../src/ui/hud/vehicle/vehicle_aim_core';
import type { IWorldVehicles } from '../src/world_api/vehicles';

describe('vehicle ground aim', () => {
  it('consumes invalid clicks without firing or dropping aim, supports switching and cancelling', () => {
    const world: IWorldVehicles = {
      vehicleSession: {
        kind: 'cannon',
        stationId: 'north_watch_cannon',
        cycle: 'wq3_8',
        origin: { x: 442, y: 3, z: 1034 },
        encounter: createCannonEncounter(),
      },
      enterVehicle: vi.fn(),
      leaveVehicle: vi.fn(),
      useVehicleAction: vi.fn(),
    };
    const clear = vi.fn();
    const aim = new VehicleAimCore(world, clear);
    aim.begin('cannonball', 0);
    expect(aim.isActive()).toBe(false);
    world.vehicleSession!.encounter.phase = 'wave';
    aim.begin('cannonball', 0);
    aim.updatePoint({ x: 0, z: 0 });
    expect(aim.reticle()?.blocked).toBe(true);
    expect(aim.commitAt()).toBe(true);
    expect(world.useVehicleAction).not.toHaveBeenCalled();
    expect(aim.isActive()).toBe(true);
    aim.begin('incendiary', 2);
    expect(aim.reticle()?.radius).toBe(7);
    expect(aim.commitAt({ x: 442, z: 1000 })).toBe(true);
    expect(world.useVehicleAction).toHaveBeenCalledWith('incendiary', { x: 442, z: 1000 });
    expect(aim.isActive()).toBe(false);
    aim.begin('grapeshot', 1);
    expect(aim.cancel()).toBe(true);
    expect(aim.cancel()).toBe(false);
    expect(clear).toHaveBeenCalledTimes(2);
  });
});
