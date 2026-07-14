import { describe, expect, it } from 'vitest';
import {
  MOUNT_TRAINING_LEAN_OPTIONS,
  mountTrainingRenderModel,
  mountTrainingRenderSig,
  mountTrainingTimerKey,
} from '../src/ui/mount_training_view';
import type { MountTrainingView } from '../src/world_api';

function view(overrides: Partial<MountTrainingView> = {}): MountTrainingView {
  return {
    sessionId: 's1',
    round: 1,
    roundsTotal: 8,
    misses: 0,
    missCap: 3,
    cue: 'left',
    windowMs: 1500,
    ...overrides,
  };
}

describe('mountTrainingRenderModel', () => {
  it('reports idle (inactive, all-null) for a null view', () => {
    const m = mountTrainingRenderModel(null);
    expect(m.active).toBe(false);
    expect(m.cueSuffix).toBeNull();
    expect(m.round).toBeNull();
    expect(m.misses).toBeNull();
    expect(m.windowMs).toBeNull();
  });

  it('returns the SAME idle instance every time (allocation-light)', () => {
    expect(mountTrainingRenderModel(null)).toBe(mountTrainingRenderModel(null));
  });

  it('maps a live view to an active model with round/miss readout args', () => {
    const m = mountTrainingRenderModel(view({ round: 3, roundsTotal: 8, misses: 1, missCap: 3 }));
    expect(m.active).toBe(true);
    expect(m.round).toEqual({ n: 3, total: 8 });
    expect(m.misses).toEqual({ n: 1, cap: 3 });
    expect(m.windowMs).toBe(1500);
  });

  it.each([
    ['left', 'cueLeft'],
    ['right', 'cueRight'],
    ['steady', 'cueSteady'],
  ] as const)('maps cue %s to suffix %s', (cue, suffix) => {
    expect(mountTrainingRenderModel(view({ cue })).cueSuffix).toBe(suffix);
  });

  it('always exposes the three lean options in left/steady/right order', () => {
    const m = mountTrainingRenderModel(view());
    expect(m.leanOptions.map((o) => o.lean)).toEqual(['left', 'steady', 'right']);
    expect(m.leanOptions.map((o) => o.labelSuffix)).toEqual(['leanLeft', 'steady', 'leanRight']);
    expect(m.leanOptions).toBe(MOUNT_TRAINING_LEAN_OPTIONS);
  });

  it('is a pure projection: identical input yields identical structure', () => {
    const a = mountTrainingRenderModel(view({ round: 4, misses: 2 }));
    const b = mountTrainingRenderModel(view({ round: 4, misses: 2 }));
    expect(a).toEqual(b);
  });
});

describe('mountTrainingRenderSig', () => {
  it('changes when any dependency changes', () => {
    const base = mountTrainingRenderSig(view());
    expect(mountTrainingRenderSig(view({ round: 2 }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ misses: 1 }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ cue: 'right' }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ sessionId: 's2' }))).not.toBe(base);
  });

  it('stays identical for identical state (same-input-same-output)', () => {
    expect(mountTrainingRenderSig(view())).toBe(mountTrainingRenderSig(view()));
  });
});

describe('mountTrainingTimerKey', () => {
  it('changes on a new round or a new session, not on anything else', () => {
    const base = mountTrainingTimerKey(view());
    expect(mountTrainingTimerKey(view({ round: 2 }))).not.toBe(base);
    expect(mountTrainingTimerKey(view({ sessionId: 's2' }))).not.toBe(base);
    // Misses/cue changing mid-round must NOT refill the clock.
    expect(mountTrainingTimerKey(view({ misses: 1, cue: 'right' }))).toBe(base);
  });
});
