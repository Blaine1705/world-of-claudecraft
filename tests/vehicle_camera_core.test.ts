import { describe, expect, it } from 'vitest';
import { createVehicleCamera, stepVehicleCamera } from '../src/render/vehicle_camera_core';
import { NORTH_WATCH_CANNON } from '../src/sim/content/vehicle_stations';

const live = Object.freeze({ x: 368, y: 4, z: 1144, yaw: 1.2, pitch: 0.32, dist: 12 });
const target = { ...NORTH_WATCH_CANNON, y: 4 };
describe('vehicle camera composition', () => {
  it('leaves normal orbit untouched and reuses its output', () => {
    const state = createVehicleCamera();
    const frame = stepVehicleCamera(state, live, null, 16 / 9, 60, 1 / 60, false);
    expect(frame).toEqual(live);
    expect(stepVehicleCamera(state, live, null, 16 / 9, 60, 1 / 60, false)).toBe(frame);
  });
  it('blends in and restores exactly in 600ms without changing saved camera', () => {
    const state = createVehicleCamera();
    const mid = { ...stepVehicleCamera(state, live, target, 16 / 9, 60, 0.3, false) };
    expect(mid.pitch).toBeGreaterThan(live.pitch);
    expect(mid.pitch).toBeLessThan((70 * Math.PI) / 180);
    const full = stepVehicleCamera(state, live, target, 16 / 9, 60, 0.3, false);
    expect(full.pitch).toBeCloseTo((70 * Math.PI) / 180);
    expect(full.yaw).toBeCloseTo(Math.PI);
    expect(stepVehicleCamera(state, live, null, 16 / 9, 60, 0.3, false)).toEqual(mid);
    expect(stepVehicleCamera(state, live, null, 16 / 9, 60, 0.3, false)).toEqual(live);
  });
  it.each([16 / 9, 9 / 16, 0.5])(
    'fits every field corner and the cannon at aspect %s',
    (aspect) => {
      const pose = stepVehicleCamera(createVehicleCamera(), live, target, aspect, 60, 0, true);
      for (const x of [target.field.minX, target.field.maxX]) {
        for (const z of [target.field.minZ, target.z]) {
          const depth = pose.dist + (z - pose.z) * Math.cos(pose.pitch);
          expect(Math.abs(x - pose.x) / depth).toBeLessThan(Math.tan(Math.PI / 6) * aspect);
          expect((Math.abs(z - pose.z) * Math.sin(pose.pitch)) / depth).toBeLessThan(
            Math.tan(Math.PI / 6),
          );
        }
      }
    },
  );
  it('reduced motion snaps both entry and exit even at zero delta', () => {
    const state = createVehicleCamera();
    expect(stepVehicleCamera(state, live, target, 1, 60, 0, true).pitch).toBeCloseTo(
      (70 * Math.PI) / 180,
    );
    expect(stepVehicleCamera(state, live, null, 1, 60, 0, true)).toEqual(live);
  });
});
