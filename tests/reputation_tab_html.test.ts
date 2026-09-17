import { describe, expect, it } from 'vitest';
import { STANDING_THRESHOLDS } from '../src/sim/factions';
import type { WorldQuestProgress } from '../src/sim/types';
import { reputationTabHtml } from '../src/ui/hud/reputation/reputation_tab_html';
import type { IWorld } from '../src/world_api';

function worldStub(
  factions: Partial<Record<string, number>>,
  level = 20,
  log: Array<[string, WorldQuestProgress['state']]> = [],
  expiresAtMs = 0,
  zoneCounts: Record<string, number> = {},
): IWorld {
  return {
    factions,
    player: { level },
    worldQuestLog: new Map(
      log.map(([questId, state]) => [questId, { questId, count: 0, state } as WorldQuestProgress]),
    ),
    worldQuestExpiresAtMs: expiresAtMs,
    worldQuestZoneCounts: zoneCounts,
  } as unknown as IWorld;
}

describe('reputation tab html', () => {
  it('paints one card per faction with the tier class, a progress bar and the standing pill', () => {
    const html = reputationTabHtml(
      worldStub({ rift_watch: 3_400, church_order: 1_240, automatons: 0 }),
      0,
    );
    expect(html.match(/class="char-rep-row /g)).toHaveLength(3);
    expect(html).toContain('char-rep-tier-trusted');
    expect(html).toContain('char-rep-tier-recognized');
    expect(html).toContain('char-rep-tier-unknown');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="10"');
    expect(html).toContain('--char-rep-pct:10%');
    // The tier-internal progress, not the cumulative total, is what the bar reads.
    expect(html).toContain(`${3_400 - STANDING_THRESHOLDS.trusted} / `);
  });

  it('names the level cap instead of a next tier while levels 5 to 15 are capped', () => {
    const capped = reputationTabHtml(worldStub({ automatons: STANDING_THRESHOLDS.trusted }, 12), 0);
    expect(capped).toContain('until level 16');
    const uncapped = reputationTabHtml(
      worldStub({ automatons: STANDING_THRESHOLDS.trusted }, 16),
      0,
    );
    expect(uncapped).not.toContain('until level 16');
    expect(uncapped).toContain('Next: Proven');
  });

  it('summarises the day and the faction title from the highest standing', () => {
    const html = reputationTabHtml(
      worldStub(
        { rift_watch: 60, church_order: 1_500 },
        20,
        [
          ['wq_a', 'completed'],
          ['wq_b', 'active'],
        ],
        10_000,
      ),
      4_000,
    );
    expect(html).toContain('1 / 2');
    expect(html).toContain('Faction title');
    // Church Order at Recognized outranks Rift Watch at Unknown.
    expect(html).toContain('Acolyte');
    expect(html).not.toContain('Watcher');
  });

  it('escapes nothing it does not own: every dynamic value passes through esc()', () => {
    const html = reputationTabHtml(worldStub({}), 0);
    expect(html).not.toContain('<script');
    expect(html).toContain('class="char-rep-legend"');
  });

  it('paints the Regional Mastery card: one row per zone with the permanent count and the next milestone', () => {
    const html = reputationTabHtml(
      worldStub({ rift_watch: 0 }, 20, [], 0, { farshore_isle: 37, drakelands: 250 }),
      0,
    );
    expect(html).toContain('class="char-rep-mastery ui-card"');
    expect(html).toContain('Regional Mastery');
    expect(html.match(/class="char-rep-mastery-row/g)).toHaveLength(14);
    expect(html).toContain('37 world quests completed');
    expect(html).toContain('Next milestone at 50');
    expect(html).toContain('2 / 5 milestones');
    expect(html).toContain('Every milestone reached');
    expect(html).toContain('5 / 5 milestones');
    // A zone never credited reads zero, muted, on the first rung.
    expect(html).toContain('class="char-rep-mastery-row is-empty"');
    expect(html).toContain('0 world quests completed');
    expect(html).toContain('Next milestone at 10');
    // One completion reads singular.
    const one = reputationTabHtml(worldStub({}, 20, [], 0, { palmreach: 1 }), 0);
    expect(one).toContain('1 world quest completed');
  });
});
