import { describe, expect, it } from 'vitest';
import { HoardBossCueMirror } from '../src/net/hoard_boss_cue_mirror';
import type { SimEvent } from '../src/sim/types';

function warning(overrides: Partial<Extract<SimEvent, { type: 'hoardBossCue' }>> = {}): SimEvent {
  return {
    type: 'hoardBossCue',
    pid: 7,
    instanceId: 12,
    cueId: 3,
    kind: 'mark',
    phase: 'warning',
    x: 4,
    z: 8,
    radius: 3,
    durationSecs: 2,
    ...overrides,
  };
}

describe('Buried Hoard boss cue mirror', () => {
  it('counts events down and replaces a warning with its hazard phase', () => {
    let now = 1_000;
    const mirror = new HoardBossCueMirror(() => now);
    mirror.apply(warning());
    now += 500;
    expect(mirror.views()[0]).toMatchObject({ remaining: 1.5, phase: 'warning' });
    mirror.apply(warning({ phase: 'hazard' }));
    expect(mirror.views()).toHaveLength(1);
    expect(mirror.views()[0].phase).toBe('hazard');
    now += 2_001;
    expect(mirror.views()).toEqual([]);
  });

  it('hydrates active cues from a resumed rift state and clears them', () => {
    let now = 5_000;
    const mirror = new HoardBossCueMirror(() => now);
    mirror.apply({
      type: 'riftState',
      pid: 7,
      active: true,
      eventId: null,
      instanceId: 12,
      seed: 1,
      baseLevel: 20,
      floorIndex: 0,
      floorCount: 1,
      origin: { x: 0, z: 0 },
      contentId: 'hoard',
      contentHash: 'hoard',
      upgrade: null,
      name: 'Hoard',
      themeName: 'Valley',
      tier: null,
      expiresAtMs: null,
      hoardCues: [
        {
          instanceId: 12,
          cueId: 9,
          kind: 'sweep',
          phase: 'warning',
          x: 2,
          z: 3,
          radius: 13,
          remaining: 0.8,
          total: 1.45,
          facing: 1,
          halfAngle: 0.7,
        },
      ],
    });
    now += 300;
    expect(mirror.views()[0]).toMatchObject({ cueId: 9, remaining: 0.5, total: 1.45 });
    mirror.apply({ type: 'hoardBossCueClear', pid: 7 });
    expect(mirror.views()).toEqual([]);
  });
});
