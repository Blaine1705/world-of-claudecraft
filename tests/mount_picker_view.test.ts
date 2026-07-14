import { describe, expect, it } from 'vitest';
import { MOUNT_KEYS } from '../src/sim/content/mounts';
import { buildMountPickerView, type MountPickerRow } from '../src/ui/mount_picker_view';

const row = (view: ReturnType<typeof buildMountPickerView>, key: string): MountPickerRow => {
  const r = view.rows.find((candidate) => candidate.key === key);
  if (!r) throw new Error(`no row for ${key}`);
  return r;
};

describe('buildMountPickerView', () => {
  it('renders the whole catalog in order, whatever is owned', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', []);
    expect(view.rows.map((r) => r.key)).toEqual([...MOUNT_KEYS]);
    expect(view.rows[0].key).toBe('valorsteed');
  });

  it('the horse is always owned, even with an empty collection', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', []);
    expect(row(view, 'valorsteed').owned).toBe(true);
    for (const key of MOUNT_KEYS.filter((k) => k !== 'valorsteed')) {
      expect(row(view, key).owned).toBe(false);
      expect(row(view, key).pickable).toBe(false);
    }
  });

  it('an owned, unlocked, non-selected mount is pickable', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', ['grag_bear']);
    const bear = row(view, 'grag_bear');
    expect(bear.owned).toBe(true);
    expect(bear.locked).toBe(false);
    expect(bear.pickable).toBe(true);
    // The current pick is owned but never pickable (nothing to change).
    expect(row(view, 'valorsteed').pickable).toBe(false);
  });

  it('level-locks an owned mount below its gate (locked, not pickable)', () => {
    const view = buildMountPickerView(12, 'valorsteed', '', ['stormfeather_griffin']);
    const griffin = row(view, 'stormfeather_griffin');
    expect(griffin.owned).toBe(true);
    expect(griffin.locked).toBe(true);
    expect(griffin.pickable).toBe(false);
    // An UNOWNED mount is never marked locked (the "Not collected" state wins).
    expect(row(view, 'shadowjump_toad').locked).toBe(false);
  });

  it('marks the pick and the ridden mount, and the mounted flag', () => {
    const view = buildMountPickerView(20, 'grag_bear', 'grag_bear', ['grag_bear']);
    expect(view.selectedKey).toBe('grag_bear');
    expect(view.mounted).toBe(true);
    expect(row(view, 'grag_bear').selected).toBe(true);
    expect(row(view, 'grag_bear').active).toBe(true);
    const dismounted = buildMountPickerView(20, 'grag_bear', '', ['grag_bear']);
    expect(dismounted.mounted).toBe(false);
    expect(row(dismounted, 'grag_bear').active).toBe(false);
  });

  it('coerces an unknown pick to the horse (the default every player owns)', () => {
    const view = buildMountPickerView(20, 'flying_carpet', '', []);
    expect(view.selectedKey).toBe('valorsteed');
    expect(row(view, 'valorsteed').selected).toBe(true);
  });

  it('exposes the display percents as integers (the card spec line)', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', ['stormfeather_griffin']);
    const griffin = row(view, 'stormfeather_griffin');
    expect([griffin.speedPct, griffin.blockPct, griffin.critPct]).toEqual([65, 5, 5]);
    const horse = row(view, 'valorsteed');
    expect([horse.speedPct, horse.blockPct, horse.critPct]).toEqual([40, 0, 0]);
  });
});
