// The pure core behind the "Unlock interface" Interface option
// (src/ui/interface_unlock_core.ts): the frame table, the option row's label
// swap, and the eligibility rule that decides which frames a flip may loosen.
// DOM-free by construction, so this drives the real module directly.
import { describe, expect, it } from 'vitest';
import {
  framesToLock,
  HUD_FRAME_SPECS,
  HUD_FRAME_STORAGE_KEYS,
  interfaceUnlockLabelKey,
  type UnlockCandidate,
} from '../src/ui/interface_unlock_core';

const candidate = (id: string, active: boolean): UnlockCandidate => ({
  id,
  isActive: () => active,
});

describe('HUD_FRAME_SPECS', () => {
  it('covers exactly the frames the option promises, each with a unique id, element and key', () => {
    expect(HUD_FRAME_SPECS.map((s) => s.id)).toEqual([
      'actionBar1',
      'actionBar2',
      'actionBar3',
      'castBar',
      'menu',
      'minimap',
      'petFrame',
    ]);
    expect(HUD_FRAME_SPECS.map((s) => s.elementId)).toEqual([
      'actionbar',
      'actionbar2',
      'actionbar3',
      'castbar',
      'side-buttons',
      'minimap-wrap',
      'pet-frame',
    ]);
    // A duplicated storage key would make two frames overwrite each other's
    // saved box, which is silent and only shows up after a reload.
    expect(new Set(HUD_FRAME_STORAGE_KEYS).size).toBe(HUD_FRAME_SPECS.length);
    for (const key of HUD_FRAME_STORAGE_KEYS) expect(key.startsWith('woc_hud_frame_')).toBe(true);
  });

  it('marks exactly the frames under the transformed #bottom-bar for re-homing', () => {
    // The action bars and the pet frame live inside #bottom-bar, whose centering
    // transform becomes the containing block for absolute positioning; the cast
    // bar, menu rail and minimap are already #ui children.
    const detaching = HUD_FRAME_SPECS.filter((s) => s.detachToUiRoot).map((s) => s.id);
    expect(detaching).toEqual(['actionBar1', 'actionBar2', 'actionBar3', 'petFrame']);
  });

  it('gives every frame a positive fallback size for the hidden-frame clamp', () => {
    for (const spec of HUD_FRAME_SPECS) {
      expect(spec.fallbackSize.w).toBeGreaterThan(0);
      expect(spec.fallbackSize.h).toBeGreaterThan(0);
    }
  });
});

describe('interfaceUnlockLabelKey', () => {
  it('names the action the press performs, not the current state', () => {
    expect(interfaceUnlockLabelKey(false)).toBe('hudChrome.interfaceUnlock.unlock');
    expect(interfaceUnlockLabelKey(true)).toBe('hudChrome.interfaceUnlock.lock');
  });
});

describe('framesToLock', () => {
  it('unlocks only the frames that are live right now', () => {
    const decisions = framesToLock(
      [candidate('actionBar1', true), candidate('petFrame', false), candidate('castBar', true)],
      true,
    );
    expect(decisions).toEqual([
      { id: 'actionBar1', unlocked: true },
      // A hunter with no pet out cannot move the pet frame.
      { id: 'petFrame', unlocked: false },
      { id: 'castBar', unlocked: true },
    ]);
  });

  it('locks every frame unconditionally, including ones that went inactive', () => {
    // The pet was dismissed while the interface was unlocked: the frame must
    // still be told to lock, or its drag gesture stays armed behind a hidden
    // element and fires the next time the pet is summoned.
    const decisions = framesToLock(
      [candidate('actionBar1', true), candidate('petFrame', false)],
      false,
    );
    expect(decisions).toEqual([
      { id: 'actionBar1', unlocked: false },
      { id: 'petFrame', unlocked: false },
    ]);
  });

  it('preserves registration order and reports one decision per candidate', () => {
    const ids = HUD_FRAME_SPECS.map((s) => s.id);
    const decisions = framesToLock(
      ids.map((id) => candidate(id, true)),
      true,
    );
    expect(decisions.map((d) => d.id)).toEqual(ids);
    expect(decisions.every((d) => d.unlocked)).toBe(true);
  });

  it('returns nothing when no frame is registered', () => {
    expect(framesToLock([], true)).toEqual([]);
  });
});
