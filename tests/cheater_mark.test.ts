import { describe, expect, test } from 'vitest';
import { DEBUFF_AURA_KINDS, isDebuffAura, isPlayerRemovableAura } from '../src/sim/aura_classify';
import {
  CHEATER_MARK_AURA_ID,
  CHEATER_MARK_MAX_SECONDS,
  cheaterMarkAfterPlayed,
  cheaterMarkAura,
  isCheaterMarkActive,
  normalizeCheaterMark,
  normalizeCheaterMarkSeconds,
} from '../src/sim/moderation';

describe('normalizeCheaterMarkSeconds', () => {
  test('clamps a value above the ceiling down to it', () => {
    expect(normalizeCheaterMarkSeconds(CHEATER_MARK_MAX_SECONDS + 5_000)).toBe(
      CHEATER_MARK_MAX_SECONDS,
    );
  });

  test.each([
    ['negative', -1, 0],
    ['NaN', Number.NaN, 0],
    // Infinity collapses to 0 (no mark) rather than clamping to the ceiling: a
    // garbage budget must fail towards no sanction, never towards the maximum one.
    ['Infinity', Number.POSITIVE_INFINITY, 0],
    ['fractional', 90.7, 90],
    ['zero', 0, 0],
  ])('coerces a %s input', (_label, input, expected) => {
    expect(normalizeCheaterMarkSeconds(input)).toBe(expected);
  });

  test.each([
    ['a string', '600'],
    ['null', null],
    ['undefined', undefined],
    ['an object', { secondsRemaining: 600 }],
  ])('rejects %s as 0', (_label, input) => {
    expect(normalizeCheaterMarkSeconds(input)).toBe(0);
  });
});

describe('normalizeCheaterMark', () => {
  test('builds a mark from a positive budget', () => {
    expect(normalizeCheaterMark(3_600)).toEqual({ secondsRemaining: 3_600 });
  });

  test('returns undefined rather than a zeroed record when the budget is spent', () => {
    // Absent-when-empty: an unmarked account must serialize byte-identically to
    // one from before this system existed.
    expect(normalizeCheaterMark(0)).toBeUndefined();
    expect(normalizeCheaterMark(-10)).toBeUndefined();
  });
});

describe('isCheaterMarkActive', () => {
  test('is false for an absent mark', () => {
    expect(isCheaterMarkActive(undefined)).toBe(false);
  });

  test('is false for a spent budget even if the record survived', () => {
    expect(isCheaterMarkActive({ secondsRemaining: 0 })).toBe(false);
  });

  test('is true while budget remains', () => {
    expect(isCheaterMarkActive({ secondsRemaining: 1 })).toBe(true);
  });
});

describe('cheaterMarkAfterPlayed', () => {
  test('burns played seconds off the budget', () => {
    expect(cheaterMarkAfterPlayed({ secondsRemaining: 3_600 }, 600)).toEqual({
      secondsRemaining: 3_000,
    });
  });

  test('expires to undefined once the budget is exactly spent', () => {
    expect(cheaterMarkAfterPlayed({ secondsRemaining: 600 }, 600)).toBeUndefined();
  });

  test('expires to undefined when overshot rather than going negative', () => {
    expect(cheaterMarkAfterPlayed({ secondsRemaining: 600 }, 10_000)).toBeUndefined();
  });

  test('does not mutate the input record', () => {
    const mark = { secondsRemaining: 3_600 };
    cheaterMarkAfterPlayed(mark, 600);
    expect(mark.secondsRemaining).toBe(3_600);
  });

  test.each([
    ['negative elapsed', -500],
    ['NaN elapsed', Number.NaN],
  ])('burns nothing on %s, so a stalled clock cannot shorten a sanction', (_label, elapsed) => {
    expect(cheaterMarkAfterPlayed({ secondsRemaining: 600 }, elapsed)).toEqual({
      secondsRemaining: 600,
    });
  });

  test('an absent mark stays absent', () => {
    expect(cheaterMarkAfterPlayed(undefined, 600)).toBeUndefined();
  });
});

describe('cheaterMarkAura', () => {
  const aura = cheaterMarkAura({ secondsRemaining: 3_600 }, 42);

  test('counts down the played budget as its remaining duration', () => {
    // The aura IS the timer: one second in world is one second of /played, so a
    // second clock would only drift from this one.
    expect(aura.remaining).toBe(3_600);
    expect(aura.duration).toBe(3_600);
  });

  test('carries the stable persisted id', () => {
    expect(aura.id).toBe(CHEATER_MARK_AURA_ID);
    expect(CHEATER_MARK_AURA_ID).toBe('cheater_mark');
  });

  test('is sourced from the wearer', () => {
    expect(aura.sourceId).toBe(42);
  });

  test('clamps an out-of-range budget', () => {
    expect(cheaterMarkAura({ secondsRemaining: Number.MAX_SAFE_INTEGER }, 1).remaining).toBe(
      CHEATER_MARK_MAX_SECONDS,
    );
  });

  // ---------------------------------------------------------------------------
  // The load-bearing rule: a sanction is VISIBILITY, never POWER.
  // src/sim/moderation/CLAUDE.md names these three as a maintainer decision to
  // change. Each is pinned separately so one regressing cannot hide behind another.
  // ---------------------------------------------------------------------------
  test('POWER-NEUTRAL: carries a zero value so no fold can move a stat', () => {
    expect(aura.value).toBe(0);
  });

  test('POWER-NEUTRAL: uses the dedicated inert kind, not a real debuff kind', () => {
    expect(aura.kind).toBe('cheater_mark');
  });

  test('POWER-NEUTRAL: no arm of the player stat fold matches the kind', async () => {
    // Guards the actual mechanism rather than restating the constant: if someone
    // later adds a `cheater_mark` arm to recalcPlayerStats, this fails.
    const entitySrc = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../src/sim/entity.ts', import.meta.url), 'utf8'),
    );
    expect(entitySrc).not.toContain("'cheater_mark'");
  });

  test('no player counter can shed it', () => {
    expect(aura.undispellable).toBe(true);
    expect(isPlayerRemovableAura(aura)).toBe(false);
  });

  test('sorts into the debuff bar', () => {
    expect(DEBUFF_AURA_KINDS.has('cheater_mark')).toBe(true);
    expect(isDebuffAura(aura.kind, aura.value)).toBe(true);
  });
});
