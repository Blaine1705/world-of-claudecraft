// The developer-badge rungs as selectable titles (src/sim/dev_badge_deeds.ts):
// the rung-to-deed map stays aligned with the badge ladder and the catalog,
// and the grant unlocks exactly the rungs at or below the resolved tier, with
// only the top rung announced live.
import { describe, expect, it } from 'vitest';
import { DEEDS } from '../src/sim/content/deeds';
import { setActiveTitle } from '../src/sim/deeds';
import { DEV_BADGE_TITLE_DEEDS, grantDevBadgeTitles } from '../src/sim/dev_badge_deeds';
import { DEV_TIER_DEFS } from '../src/sim/dev_tier';
import { Sim } from '../src/sim/sim';
import type { SimEvent } from '../src/sim/types';
import { DEV_TIERS } from '../src/ui/dev_tier';

function fixture() {
  const sim = new Sim({ seed: 42, playerClass: 'warrior', autoEquip: false });
  const pid = sim.addPlayer('warrior', 'Devvy');
  const meta = sim.players.get(pid)!;
  sim.drainEvents();
  return { sim, meta, e: sim.entities.get(pid)! };
}

function unlocks(events: SimEvent[]): { deedId: string; retro: boolean }[] {
  return events
    .filter((ev): ev is Extract<SimEvent, { type: 'deedUnlocked' }> => ev.type === 'deedUnlocked')
    .map((ev) => ({ deedId: ev.deedId, retro: ev.retro === true }));
}

describe('developer-badge title deeds', () => {
  // The title text MUST stay the badge rung's own public English name: that is
  // what licenses the scoped hidden-prose exemption in tests/guide.test.ts.
  it('maps every badge rung to a hidden, zero-Renown title deed named for the rung', () => {
    const names = Object.fromEntries(DEV_TIERS.map((t) => [t.key, t.name]));
    expect(names.artificer).toBe('Artificer');
    expect(Object.keys(DEV_BADGE_TITLE_DEEDS)).toEqual(DEV_TIER_DEFS.map((t) => t.key));
    for (const tier of DEV_TIER_DEFS) {
      const def = DEEDS[DEV_BADGE_TITLE_DEEDS[tier.key]];
      expect(def, tier.key).toBeDefined();
      expect(def.hidden).toBe(true);
      expect(def.renown).toBe(0);
      expect(def.trigger).toEqual({ kind: 'manual' });
      expect(def.reward).toEqual({ kind: 'title', text: names[tier.key] });
    }
  });

  it('grants every rung at or below the tier; only the top rung is live', () => {
    const { sim, meta } = fixture();
    expect(grantDevBadgeTitles(sim.ctx, meta, 3)).toBe(3);
    expect(unlocks(sim.drainEvents())).toEqual([
      { deedId: 'hid_dev_tinkerer', retro: true },
      { deedId: 'hid_dev_artificer', retro: true },
      { deedId: 'hid_dev_runesmith', retro: false },
    ]);
    expect(meta.deedsEarned.has('hid_dev_architect')).toBe(false);
    expect(meta.deedsEarned.has('hid_dev_worldwright')).toBe(false);
    // Zero Renown: contributor flair never scores the board.
    expect(meta.renown).toBe(0);
  });

  it('is idempotent and a later climb grants only the new rungs', () => {
    const { sim, meta } = fixture();
    grantDevBadgeTitles(sim.ctx, meta, 2);
    sim.drainEvents();
    expect(grantDevBadgeTitles(sim.ctx, meta, 2)).toBe(0);
    expect(unlocks(sim.drainEvents())).toEqual([]);
    expect(grantDevBadgeTitles(sim.ctx, meta, 5)).toBe(3);
    expect(unlocks(sim.drainEvents())).toEqual([
      { deedId: 'hid_dev_runesmith', retro: true },
      { deedId: 'hid_dev_architect', retro: true },
      { deedId: 'hid_dev_worldwright', retro: false },
    ]);
  });

  it('grants nothing for no tier or a malformed index, and clamps above the ladder', () => {
    const { sim, meta } = fixture();
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(grantDevBadgeTitles(sim.ctx, meta, bad), String(bad)).toBe(0);
    }
    expect(unlocks(sim.drainEvents())).toEqual([]);
    expect(grantDevBadgeTitles(sim.ctx, meta, 99)).toBe(5);
  });

  it('an unlocked rung is selectable as the displayed title; an unearned one is not', () => {
    const { sim, meta, e } = fixture();
    setActiveTitle(meta, e, 'hid_dev_artificer');
    expect(e.title ?? null).toBe(null);
    grantDevBadgeTitles(sim.ctx, meta, 3);
    setActiveTitle(meta, e, 'hid_dev_artificer');
    expect(e.title).toBe('hid_dev_artificer');
    expect(meta.activeTitle).toBe('hid_dev_artificer');
  });
});
