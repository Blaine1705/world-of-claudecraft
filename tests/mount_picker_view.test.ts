import { describe, expect, it } from 'vitest';
import { MOUNT_KEYS } from '../src/sim/content/mounts';
import { buildMountPickerView, type MountPickerRow } from '../src/ui/mount_picker_view';

const row = (view: ReturnType<typeof buildMountPickerView>, key: string): MountPickerRow => {
  const r = view.rows.find((candidate) => candidate.key === key);
  if (!r) throw new Error(`no row for ${key}`);
  return r;
};

describe('buildMountPickerView', () => {
  it('renders ONLY the owned mounts, in catalog order (not the whole catalog)', () => {
    // Owned out of catalog order: the view still sorts by MOUNT_KEYS.
    const view = buildMountPickerView(20, 'valorsteed', '', ['stormfeather_griffin', 'grag_bear']);
    expect(view.rows.map((r) => r.key)).toEqual(['grag_bear', 'stormfeather_griffin']);
  });

  it('owns nothing: zero rows and no free default mount (the horse is not prepended)', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', []);
    expect(view.rows).toEqual([]);
    // The pick is still resolved (the picker header needs it), but nothing renders.
    expect(view.selectedKey).toBe('valorsteed');
    expect(view.mounted).toBe(false);
  });

  it('owns the whole catalog: every mount renders in catalog order', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', [...MOUNT_KEYS]);
    expect(view.rows.map((r) => r.key)).toEqual([...MOUNT_KEYS]);
  });

  it('an owned, unlocked, non-selected mount is pickable', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', ['grag_bear']);
    const bear = row(view, 'grag_bear');
    expect(bear.locked).toBe(false);
    expect(bear.pickable).toBe(true);
  });

  it('the current pick is owned but never pickable (nothing to change)', () => {
    const view = buildMountPickerView(20, 'grag_bear', '', ['grag_bear']);
    expect(row(view, 'grag_bear').selected).toBe(true);
    expect(row(view, 'grag_bear').pickable).toBe(false);
  });

  it('a selected mount the player does not own is the selectedKey but renders no row', () => {
    // Pick defaults to the horse, which the player has not earned yet.
    const view = buildMountPickerView(20, 'valorsteed', '', ['grag_bear']);
    expect(view.selectedKey).toBe('valorsteed');
    expect(view.rows.map((r) => r.key)).toEqual(['grag_bear']);
    // The one owned mount is pickable precisely because it is not the current pick.
    expect(row(view, 'grag_bear').pickable).toBe(true);
  });

  it('level-locks an owned mount below its gate (locked, not pickable)', () => {
    const view = buildMountPickerView(12, 'valorsteed', '', ['stormfeather_griffin']);
    const griffin = row(view, 'stormfeather_griffin');
    expect(griffin.locked).toBe(true);
    expect(griffin.pickable).toBe(false);
  });

  it('an owned mount at or above its gate is unlocked', () => {
    const view = buildMountPickerView(10, 'valorsteed', '', ['grag_bear']);
    expect(row(view, 'grag_bear').locked).toBe(false);
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

  it('coerces an unknown pick to the horse (the default the header falls back to)', () => {
    const view = buildMountPickerView(20, 'flying_carpet', '', []);
    expect(view.selectedKey).toBe('valorsteed');
    expect(view.rows).toEqual([]);
  });

  it('exposes the display percents as integers (the card spec line)', () => {
    const view = buildMountPickerView(20, 'valorsteed', '', ['valorsteed', 'stormfeather_griffin']);
    const griffin = row(view, 'stormfeather_griffin');
    expect([griffin.speedPct, griffin.blockPct, griffin.critPct]).toEqual([80, 8, 5]);
    const horse = row(view, 'valorsteed');
    expect([horse.speedPct, horse.blockPct, horse.critPct]).toEqual([60, 0, 0]);
  });

  it('keeps a locked owned pick selected (the painter drops the Selected chip)', () => {
    // Own and select the epic below its level gate: the pure view still reports
    // it as the pick, but selected + locked together let the painter's stateChip
    // suppress the Selected chip so the card never co-renders a contradiction.
    const view = buildMountPickerView(12, 'stormfeather_griffin', '', ['stormfeather_griffin']);
    const griffin = row(view, 'stormfeather_griffin');
    expect(griffin.selected).toBe(true);
    expect(griffin.locked).toBe(true);
    expect(griffin.pickable).toBe(false);
  });
});
