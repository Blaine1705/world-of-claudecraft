import { expect, it } from 'vitest';
import { hordeCameraTarget } from '../src/render/horde_camera';
import { createVehicleCamera, stepVehicleCamera } from '../src/render/vehicle_camera_core';
import { HORDE_QUEST_ID, HORDE_SITE } from '../src/sim/content/world_quest_horde';
import { createHordeBarricade } from '../src/sim/minigames/horde_barricade';

it('faces the incoming horde with the whole lane visible and restores the saved orbit on exit', () => {
  const horde = createHordeBarricade(1);
  const world = {
    worldQuestLog: new Map([
      [HORDE_QUEST_ID, { questId: HORDE_QUEST_ID, state: 'active' as const, count: 0, horde }],
    ]),
    player: { pos: { x: HORDE_SITE.x, y: 1, z: HORDE_SITE.z } },
  };
  const target = hordeCameraTarget(world as Parameters<typeof hordeCameraTarget>[0])!;
  expect(target.yaw).toBe(0);
  const live = { x: 1, y: 2, z: 3, yaw: 1.3, pitch: 0.3, dist: 12 };
  for (const aspect of [16 / 9, 9 / 16]) {
    const camera = createVehicleCamera();
    const pose = stepVehicleCamera(camera, live, target, aspect, 60, 1, true);
    expect(pose.yaw).toBeCloseTo(0);
    const playerDepth = pose.dist - (HORDE_SITE.z - pose.z) * Math.cos(pose.pitch);
    const playerNdcY =
      ((HORDE_SITE.z - pose.z) * Math.sin(pose.pitch)) / playerDepth / Math.tan(Math.PI / 6);
    expect(playerNdcY).toBeGreaterThan(-0.42);
    for (const x of [target.field.minX, target.field.maxX]) {
      for (const z of [target.field.minZ, target.field.maxZ]) {
        const depth = pose.dist - (z - pose.z) * Math.cos(pose.pitch);
        expect(Math.abs(x - pose.x) / depth).toBeLessThan(Math.tan(Math.PI / 6) * aspect);
        expect((Math.abs(z - pose.z) * Math.sin(pose.pitch)) / depth).toBeLessThan(
          Math.tan(Math.PI / 6),
        );
      }
    }
    expect(stepVehicleCamera(camera, live, null, aspect, 60, 1, true)).toEqual(live);
  }
  horde.phase = 'failed';
  expect(hordeCameraTarget(world as Parameters<typeof hordeCameraTarget>[0])).toBeNull();
});
