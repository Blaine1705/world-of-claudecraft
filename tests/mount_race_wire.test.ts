import { expect, it } from 'vitest';
import { decodeMountRaceMirror } from '../src/net/mount_race_wire';
import type { MountRaceView } from '../src/world_api/mounts';

it('preserves session race counters and converts tick durations to display deadlines', () => {
  const wire = {
    raceId: 'test',
    phase: 'racing',
    clearedMask: 5,
    cleared: 2,
    jumpsTotal: 8,
    goTicksLeft: 40,
    ticksLeft: 100,
    timeLimitTicks: 1200,
  } as MountRaceView;
  expect(decodeMountRaceMirror(wire, 1000)).toEqual({
    raceId: 'test',
    phase: 'racing',
    clearedMask: 5,
    cleared: 2,
    jumpsTotal: 8,
    goDeadlineMs: 3000,
    deadlineMs: 6000,
    timeLimitTicks: 1200,
  });
  expect(
    decodeMountRaceMirror({ ...wire, goTicksLeft: -20, ticksLeft: -10 }, 1000)?.deadlineMs,
  ).toBe(1000);
  expect(decodeMountRaceMirror(null, 1000)).toBeNull();
});
