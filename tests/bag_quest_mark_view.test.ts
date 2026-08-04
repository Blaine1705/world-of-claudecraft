// Pure-core pins for the bag grid's quest-purpose mark. The painter (bags_window)
// consumes bagQuestMarkKind for the .bag-quest class, corner seal, and aria key;
// these tests own the KIND decision only (DOM/CSS contracts live next to the
// instance-marker suite).
import { describe, expect, it } from 'vitest';
import { bagQuestMarkKind } from '../src/ui/bag_quest_mark_view';

describe('bag_quest_mark_view: mark kind', () => {
  it('marks kind===quest as quest', () => {
    expect(bagQuestMarkKind({ kind: 'quest' })).toBe('quest');
  });

  it('returns null for every non-quest ItemKind', () => {
    // Real ItemKind set from src/sim/types.ts (minus quest).
    for (const kind of [
      'weapon',
      'armor',
      'held_offhand',
      'junk',
      'food',
      'drink',
      'tool',
      'potion',
      'elixir',
      'bag',
      'mount',
    ]) {
      expect(bagQuestMarkKind({ kind }), kind).toBeNull();
    }
  });

  it('is case-sensitive: only the exact sim kind token matches', () => {
    expect(bagQuestMarkKind({ kind: 'Quest' })).toBeNull();
    expect(bagQuestMarkKind({ kind: 'QUEST' })).toBeNull();
    expect(bagQuestMarkKind({ kind: '' })).toBeNull();
  });

  // Phase 1 is on/off only. The union still admits ready/orphaned so a later
  // phase can extend the resolver without renaming the seam; pin that this
  // entry never invents those variants from kind alone.
  it('does not invent ready or orphaned marks from kind alone', () => {
    expect(bagQuestMarkKind({ kind: 'quest' })).not.toBe('questReady');
    expect(bagQuestMarkKind({ kind: 'quest' })).not.toBe('questOrphaned');
  });
});
