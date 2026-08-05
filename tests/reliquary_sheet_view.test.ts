import { describe, expect, it } from 'vitest';
import { catalogCharacterCompletion, catalogRelicCompletion } from '../src/sim/reliquary';
import {
  buildReliquarySheetModel,
  reliquarySheetProgressionHtml,
} from '../src/ui/reliquary_sheet_view';

function world(
  over: { items?: string[]; marks?: string[]; mounts?: string[]; deeds?: string[] } = {},
) {
  const items = new Set(over.items ?? []);
  const marks = new Set(over.marks ?? []);
  const mounts = over.mounts ?? [];
  const deeds = new Set(over.deeds ?? []);
  return {
    deedStats: { itemsDiscovered: items },
    reliquaryMarks: marks,
    ownedMounts: () => mounts,
    deedsEarned: deeds,
  };
}

describe('buildReliquarySheetModel', () => {
  it('is empty and unranked with no ownership', () => {
    const model = buildReliquarySheetModel(world());
    const empty = catalogCharacterCompletion({ itemsDiscovered: new Set() });
    expect(model.owned).toBe(0);
    expect(model.total).toBe(empty.total);
    expect(model.curatorRank).toBe(0);
  });

  it('ranks from character-durable fills; total excludes account skin slots', () => {
    const model = buildReliquarySheetModel(world({ items: ['cryptbone_helm'] }));
    expect(model.owned).toBe(1);
    expect(model.curatorRank).toBe(1);
    const full = catalogRelicCompletion({ itemsDiscovered: new Set(['cryptbone_helm']) });
    const char = catalogCharacterCompletion({ itemsDiscovered: new Set(['cryptbone_helm']) });
    expect(model.total).toBe(char.total);
    expect(model.total).toBeLessThan(full.total);
    const withMany = buildReliquarySheetModel(
      world({
        items: Array.from({ length: 12 }, (_, i) => `fake_${i}`),
      }),
    );
    expect(withMany.owned).toBe(0);
  });

  it('scores marks independently of items', () => {
    const base = buildReliquarySheetModel(world());
    const withMark = buildReliquarySheetModel(world({ marks: ['masterwork:first'] }));
    expect(withMark.owned).toBe(base.owned + 1);
  });
});

describe('reliquarySheetProgressionHtml', () => {
  it('emits labeled completion, rank, and open button with t() chrome keys', () => {
    const html = reliquarySheetProgressionHtml({ owned: 3, total: 100, curatorRank: 1 });
    expect(html).toContain('data-act="open-reliquary"');
    expect(html).toContain('cp-reliquary');
    expect(html).toContain('data-rank="1"');
    expect(html).toContain('3/100');
    expect(html).toContain('Apprentice Curator');
    expect(html).toContain('The Reliquary');
  });

  it('shows unranked chrome at rank 0', () => {
    const html = reliquarySheetProgressionHtml({ owned: 0, total: 100, curatorRank: 0 });
    expect(html).toContain('data-rank="0"');
    expect(html).toContain('Unranked Curator');
  });
});
