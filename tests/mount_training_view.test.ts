import { describe, expect, it } from 'vitest';
import { mountTrainingRenderModel, mountTrainingRenderSig } from '../src/ui/mount_training_view';
import type { MountTrainingView } from '../src/world_api';

function view(overrides: Partial<MountTrainingView> = {}): MountTrainingView {
  return {
    sessionId: 's1',
    phase: 'course',
    jump: 0,
    jumpsTotal: 6,
    nextJump: { x: 110, z: 683 },
    ticksLeft: 900,
    timeLimitTicks: 900,
    ...overrides,
  };
}

describe('mountTrainingRenderModel', () => {
  it('reports idle (inactive, all-null) for a null view', () => {
    const m = mountTrainingRenderModel(null);
    expect(m.active).toBe(false);
    expect(m.phase).toBeNull();
    expect(m.progress).toBeNull();
    expect(m.secondsLeft).toBeNull();
    expect(m.timeFraction).toBeNull();
  });

  it('returns the SAME idle instance every time (allocation-light)', () => {
    expect(mountTrainingRenderModel(null)).toBe(mountTrainingRenderModel(null));
  });

  it('maps phase mount/staging to an active model with no progress or countdown', () => {
    for (const phase of ['mount', 'staging'] as const) {
      const m = mountTrainingRenderModel(view({ phase, nextJump: null, ticksLeft: null }));
      expect(m.active).toBe(true);
      expect(m.phase).toBe(phase);
      expect(m.progress).toBeNull();
      expect(m.secondsLeft).toBeNull();
      expect(m.timeFraction).toBeNull();
    }
  });

  it('maps phase course to "Jump n+1 of total" progress plus a countdown', () => {
    const m = mountTrainingRenderModel(
      view({ jump: 2, jumpsTotal: 6, ticksLeft: 450, timeLimitTicks: 900 }),
    );
    expect(m.progress).toEqual({ n: 3, total: 6 });
    expect(m.secondsLeft).toBe(23); // ceil(450/20)
    expect(m.timeFraction).toBeCloseTo(0.5, 6);
  });

  it('reads secondsLeft as a ceil so it shows 1 until the timer truly hits 0', () => {
    expect(mountTrainingRenderModel(view({ ticksLeft: 1 })).secondsLeft).toBe(1);
    expect(mountTrainingRenderModel(view({ ticksLeft: 0 })).secondsLeft).toBe(0);
    expect(mountTrainingRenderModel(view({ ticksLeft: 20 })).secondsLeft).toBe(1);
    expect(mountTrainingRenderModel(view({ ticksLeft: 21 })).secondsLeft).toBe(2);
  });

  it('drops progress once the last jump is cleared (jump === jumpsTotal)', () => {
    const m = mountTrainingRenderModel(view({ jump: 6, jumpsTotal: 6, nextJump: null }));
    expect(m.active).toBe(true);
    expect(m.phase).toBe('course');
    expect(m.progress).toBeNull();
  });

  it('is a pure projection: identical input yields identical structure', () => {
    const a = mountTrainingRenderModel(view({ jump: 3, ticksLeft: 300 }));
    const b = mountTrainingRenderModel(view({ jump: 3, ticksLeft: 300 }));
    expect(a).toEqual(b);
  });
});

describe('mountTrainingRenderSig', () => {
  it('changes when the session, phase, jump, total, or whole-second bucket changes', () => {
    const base = mountTrainingRenderSig(view());
    expect(mountTrainingRenderSig(view({ sessionId: 's2' }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ phase: 'staging' }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ jump: 1 }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ jumpsTotal: 8 }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ ticksLeft: 880 }))).not.toBe(base); // crosses a second
  });

  it('buckets the countdown to whole seconds (sub-second drift does not repaint)', () => {
    // 900 and 890 ticks both ceil to 45 s -> same bucket -> same sig.
    expect(mountTrainingRenderSig(view({ ticksLeft: 900 }))).toBe(
      mountTrainingRenderSig(view({ ticksLeft: 890 })),
    );
  });

  it('stays identical for identical state (same-input-same-output)', () => {
    expect(mountTrainingRenderSig(view())).toBe(mountTrainingRenderSig(view()));
  });
});
