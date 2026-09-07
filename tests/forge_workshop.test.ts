import { describe, expect, it } from 'vitest';
import {
  advanceForgeWorkshop,
  clickForgeWorkshop,
  createForgeWorkshop,
  forgeResult,
  sanitizeForgeResult,
} from '../src/sim/minigames/forge_workshop';

describe('forge workshop timing', () => {
  it('publishes authoritative clock at five Hz and promptly reveals ready requests', () => {
    const state = createForgeWorkshop(42, 10);
    expect(state.observedAt).toBe(10);
    expect(advanceForgeWorkshop(state, 10.1)).toBe(false);
    expect(state.observedAt).toBe(10);
    expect(advanceForgeWorkshop(state, 10.2)).toBe(true);
    expect(state.observedAt).toBe(10.2);
    advanceForgeWorkshop(state, 12.95);
    expect(advanceForgeWorkshop(state, 13)).toBe(true);
    expect(state.phase).toBe('working');
    expect(state.observedAt).toBe(13);
    clickForgeWorkshop(state, state.requests[0][0], 13.1);
    expect(state.observedAt).toBe(13.1);
    advanceForgeWorkshop(state, state.readyAt - 0.05);
    expect(advanceForgeWorkshop(state, state.readyAt)).toBe(true);
    expect(state.observedAt).toBe(state.readyAt);
  });
  it('replays ten varied requests, then chains the last three', () => {
    const state = createForgeWorkshop(42, 0);
    expect(state).toEqual(createForgeWorkshop(42, 0));
    expect(state.requests).not.toEqual(createForgeWorkshop(43, 0).requests);
    expect(state.requests.map((request) => request.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 2]);
    const actions = state.requests.flat();
    expect(actions.every((action, index) => index === 0 || action !== actions[index - 1])).toBe(
      true,
    );
    expect(new Set(actions).size).toBe(4);
  });

  it('rejects countdown/spam and charges wrong choices without losing the request', () => {
    const state = createForgeWorkshop(5, 0);
    const right = state.requests[0][0];
    const wrong = right === 'fuel' ? 'water' : 'fuel';
    expect(clickForgeWorkshop(state, right, 2)).toBe(false);
    expect(clickForgeWorkshop(state, wrong, 3)).toBe(true);
    expect(state.mistakes).toBe(1);
    expect(state.requestIndex).toBe(0);
    expect(clickForgeWorkshop(state, right, 3)).toBe(false);
    expect(clickForgeWorkshop(state, right, 3.5)).toBe(true);
    expect(state.requestIndex).toBe(1);
    expect(clickForgeWorkshop(state, state.requests[1][0], 3.6)).toBe(false);
  });

  it('awards all medals from adjusted time, with inclusive thresholds', () => {
    expect(forgeResult(37, 1)).toEqual({
      elapsed: 37,
      mistakes: 1,
      adjustedTime: 40,
      rating: 'gold',
    });
    expect(forgeResult(40.01, 0).rating).toBe('silver');
    expect(forgeResult(57, 1).rating).toBe('silver');
    expect(forgeResult(60.01, 0).rating).toBe('bronze');
    expect(
      sanitizeForgeResult({ elapsed: 50, mistakes: 5, rating: 'gold', adjustedTime: 0 })?.rating,
    ).toBe('bronze');
    expect(sanitizeForgeResult({ elapsed: NaN, mistakes: 0 })).toBeUndefined();
  });
});
