import { describe, expect, it } from 'vitest';
import { mountTrainingRenderModel, mountTrainingRenderSig } from '../src/ui/mount_training_view';
import type { MountTrainingView } from '../src/world_api';

function view(overrides: Partial<MountTrainingView> = {}): MountTrainingView {
  return {
    sessionId: 's1',
    phase: 'ride',
    gate: 0,
    gatesTotal: 8,
    nextGate: { x: 91, z: 691 },
    ...overrides,
  };
}

describe('mountTrainingRenderModel', () => {
  it('reports idle (inactive, all-null) for a null view', () => {
    const m = mountTrainingRenderModel(null);
    expect(m.active).toBe(false);
    expect(m.phase).toBeNull();
    expect(m.progress).toBeNull();
  });

  it('returns the SAME idle instance every time (allocation-light)', () => {
    expect(mountTrainingRenderModel(null)).toBe(mountTrainingRenderModel(null));
  });

  it('maps a phase-mount view to an active model with no ride progress', () => {
    const m = mountTrainingRenderModel(view({ phase: 'mount', gate: 0, nextGate: null }));
    expect(m.active).toBe(true);
    expect(m.phase).toBe('mount');
    expect(m.progress).toBeNull();
  });

  it('maps a phase-ride view to progress "Gate n+1 of total"', () => {
    expect(mountTrainingRenderModel(view({ gate: 0, gatesTotal: 8 })).progress).toEqual({
      n: 1,
      total: 8,
    });
    expect(mountTrainingRenderModel(view({ gate: 5, gatesTotal: 8 })).progress).toEqual({
      n: 6,
      total: 8,
    });
  });

  it('drops progress once the last gate is cleared (gate === gatesTotal)', () => {
    const m = mountTrainingRenderModel(view({ gate: 8, gatesTotal: 8, nextGate: null }));
    expect(m.active).toBe(true);
    expect(m.phase).toBe('ride');
    expect(m.progress).toBeNull();
  });

  it('is a pure projection: identical input yields identical structure', () => {
    const a = mountTrainingRenderModel(view({ gate: 3 }));
    const b = mountTrainingRenderModel(view({ gate: 3 }));
    expect(a).toEqual(b);
  });
});

describe('mountTrainingRenderSig', () => {
  it('changes when any painted dependency changes', () => {
    const base = mountTrainingRenderSig(view());
    expect(mountTrainingRenderSig(view({ phase: 'mount' }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ gate: 2 }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ gatesTotal: 6 }))).not.toBe(base);
    expect(mountTrainingRenderSig(view({ sessionId: 's2' }))).not.toBe(base);
  });

  it('stays identical for identical state (same-input-same-output)', () => {
    expect(mountTrainingRenderSig(view())).toBe(mountTrainingRenderSig(view()));
  });
});
