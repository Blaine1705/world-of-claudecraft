import { describe, expect, it } from 'vitest';
import { InputTickSampler } from '../src/game/input_tick_sampler';
import { emptyMoveInput, type MoveInput } from '../src/sim/types';

function sample(forward: boolean, facing: number | null): { mi: MoveInput; facing: number | null } {
  return { mi: { ...emptyMoveInput(), forward }, facing };
}

describe('InputTickSampler', () => {
  it('emits fixed ticks across irregular render frame deltas', () => {
    const sampler = new InputTickSampler();
    const frames = [0.02, 0.04, 0.09, 0.01].flatMap((dt) =>
      sampler.advance(dt, () => sample(true, 0.5)),
    );

    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.ct)).toEqual([0, 1, 2]);
    expect(frames.every((frame) => frame.mi.forward && frame.facing === 0.5)).toBe(true);
  });

  it('keeps client ticks monotone across advance calls', () => {
    const sampler = new InputTickSampler();

    expect(sampler.advance(0.05, () => sample(true, 0)).map((frame) => frame.ct)).toEqual([0]);
    expect(sampler.advance(0.1, () => sample(false, null)).map((frame) => frame.ct)).toEqual([
      1, 2,
    ]);
  });

  it('clamps a pathological render delta to 250 ms', () => {
    const sampler = new InputTickSampler();
    const frames = sampler.advance(10, () => sample(true, 0));

    expect(frames).toHaveLength(5);
    expect(frames.map((frame) => frame.ct)).toEqual([0, 1, 2, 3, 4]);
  });

  it('samples intent separately for every emitted tick', () => {
    const sampler = new InputTickSampler();
    let sampleIndex = 0;
    const frames = sampler.advance(0.151, () => sample(sampleIndex++ % 2 === 0, sampleIndex));

    expect(sampleIndex).toBe(3);
    expect(frames.map(({ mi, facing }) => ({ forward: mi.forward, facing }))).toEqual([
      { forward: true, facing: 1 },
      { forward: false, facing: 2 },
      { forward: true, facing: 3 },
    ]);
  });

  it('is deterministic for the same deltas and sampled intent', () => {
    const run = () => {
      const sampler = new InputTickSampler();
      let sampleIndex = 0;
      return [0.017, 0.034, 0.081, 0.006, 0.113].flatMap((dt) =>
        sampler.advance(dt, () => {
          const index = sampleIndex++;
          return sample(index % 2 === 0, index * 0.1);
        }),
      );
    };

    expect(run()).toEqual(run());
  });

  it('emits one immediate neutral frame and resets the connection tick sequence', () => {
    const sampler = new InputTickSampler();
    expect(sampler.advance(0.05, () => sample(true, 0))[0].ct).toBe(0);

    expect(sampler.emitNeutralFrame()).toEqual({ ct: 1, mi: emptyMoveInput(), facing: null });
    sampler.reset();
    expect(sampler.advance(0.05, () => sample(false, null))[0].ct).toBe(0);
  });
});
