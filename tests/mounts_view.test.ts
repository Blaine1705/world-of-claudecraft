import { describe, expect, it } from 'vitest';
import { buildMountsView } from '../src/ui/mounts_view';

describe('buildMountsView', () => {
  it('lists all seven catalog mounts with the horse first', () => {
    const view = buildMountsView(1, '', '');
    expect(view.rows).toHaveLength(7);
    expect(view.rows[0].key).toBe('valorsteed');
  });

  it('locks rows by player level per the card gates', () => {
    const at = (level: number) =>
      Object.fromEntries(buildMountsView(level, '', '').rows.map((r) => [r.key, r.locked]));
    expect(at(9).valorsteed).toBe(true);
    expect(at(10).valorsteed).toBe(false);
    expect(at(10).aether_hover_cycle).toBe(true);
    expect(at(15).aether_hover_cycle).toBe(false);
    expect(at(15).lunar_cheshire).toBe(true);
    expect(at(20).lunar_cheshire).toBe(false);
  });

  it('carries the card specialty percents per rarity tier', () => {
    const rows = Object.fromEntries(buildMountsView(20, '', '').rows.map((r) => [r.key, r]));
    expect(rows.valorsteed).toMatchObject({ speedPct: 40, blockPct: 0, critPct: 0 });
    expect(rows.shadowjump_toad).toMatchObject({ speedPct: 50, blockPct: 5, critPct: 0 });
    expect(rows.stormfeather_griffin).toMatchObject({ speedPct: 65, blockPct: 5, critPct: 5 });
  });

  it('marks the pick and the ridden mount, and derives the footer action', () => {
    expect(buildMountsView(20, '', '').action).toBeNull();
    const picked = buildMountsView(20, 'grag_bear', '');
    expect(picked.action).toBe('mount');
    expect(picked.rows.find((r) => r.key === 'grag_bear')?.selected).toBe(true);
    expect(picked.mounted).toBe(false);
    const riding = buildMountsView(20, 'grag_bear', 'grag_bear');
    expect(riding.action).toBe('dismount');
    expect(riding.rows.find((r) => r.key === 'grag_bear')?.active).toBe(true);
    expect(riding.mounted).toBe(true);
  });

  it('treats an unknown persisted pick as no pick', () => {
    const view = buildMountsView(20, 'flying_carpet', '');
    expect(view.selectedKey).toBe('');
    expect(view.action).toBeNull();
  });
});
