// The Toad Hex's toad (src/render/characters/form_visual_selection_core.ts,
// form_rig_sync.ts): a polymorph is one form slot behind one gate, and the
// Sunbone Hexcaller's hex wears a toad in it, never the sheep. A slot left
// holding the other animal (a sheep from an earlier Polymorph) is disposed
// and rebuilt, so the right animal shows.
import { describe, expect, it, vi } from 'vitest';
import { syncFormRig } from '../src/render/characters/form_rig_sync';
import {
  characterFormAssetKey,
  characterFormMaskForAura,
  polymorphRigStale,
  requestedCharacterForm,
  TOAD_POLYMORPH_AURAS,
} from '../src/render/characters/form_visual_selection_core';
import { VISUALS } from '../src/render/characters/manifest';
import { WILDHEART_TOADED } from '../src/sim/mob/trash_kit/wildheart_cast_ids';

const TOADED = { kind: 'polymorph', id: WILDHEART_TOADED };
const SHEEPED = { kind: 'polymorph', id: 'polymorph' };

function rig(assetKey: string) {
  return { assetKey, dispose: vi.fn() };
}

function view() {
  return {
    sheepVisual: null as ReturnType<typeof rig> | null,
    bearVisual: null as ReturnType<typeof rig> | null,
    catVisual: null as ReturnType<typeof rig> | null,
    travelVisual: null as ReturnType<typeof rig> | null,
    metamorphVisual: null as ReturnType<typeof rig> | null,
  };
}

describe('the toad hex wears a toad', () => {
  it('rides the polymorph slot (one gate, one stand-in)', () => {
    expect(TOAD_POLYMORPH_AURAS.has(WILDHEART_TOADED)).toBe(true);
    expect(requestedCharacterForm(characterFormMaskForAura(TOADED))).toBe('sheep');
  });

  it('resolves the toad asset for the hex and the sheep for any other polymorph', () => {
    expect(characterFormAssetKey('form_sheep', [TOADED])).toBe('form_toad');
    expect(characterFormAssetKey('form_sheep', [SHEEPED])).toBe('form_sheep');
    expect(characterFormAssetKey('form_sheep', [])).toBe('form_sheep');
    // The toad hex id on a non-polymorph kind never turns the slot.
    expect(characterFormAssetKey('form_sheep', [{ kind: 'slow', id: WILDHEART_TOADED }])).toBe(
      'form_sheep',
    );
    // Only the polymorph slot reads it; the shaman wolf split still holds.
    expect(characterFormAssetKey('form_bear', [TOADED])).toBe('form_bear');
    expect(characterFormAssetKey('form_cat', [{ kind: 'buff_speed', id: 'ghost_wolf' }])).toBe(
      'form_ghost_wolf',
    );
  });

  it('ships a toad visual: the Spore Toad frog rig, squat at a player knee', () => {
    const toad = VISUALS.form_toad;
    expect(toad).toBeDefined();
    expect(toad?.url).toBe(VISUALS.mob_murloc?.url);
    expect(toad?.tint).toBe(VISUALS.wildheart_spore_toad?.tint);
    expect(toad?.height ?? 99).toBeLessThan(2.6);
    expect(toad?.height ?? 0).toBeGreaterThan(VISUALS.form_sheep?.height ?? 99);
  });

  it('calls a sheep rig stale under the hex and a toad rig stale under a Polymorph', () => {
    expect(polymorphRigStale('form_sheep', [TOADED])).toBe(true);
    expect(polymorphRigStale('form_toad', [SHEEPED])).toBe(true);
    expect(polymorphRigStale('form_toad', [TOADED])).toBe(false);
    expect(polymorphRigStale('form_sheep', [SHEEPED])).toBe(false);
  });
});

describe('syncFormRig builds the requested form rig', () => {
  it('builds an empty slot for the requested form, gated', () => {
    const v = view();
    const build = vi.fn();
    const e = { auras: [TOADED] };
    syncFormRig(e, v, 'sheep', build);
    expect(build).toHaveBeenCalledWith(e, v, 'form_sheep', 'sheepVisual', true);
  });

  it('disposes a sheep left in the slot and rebuilds it for the toad', () => {
    const v = view();
    const sheep = rig('form_sheep');
    v.sheepVisual = sheep;
    const build = vi.fn();
    syncFormRig({ auras: [TOADED] }, v, 'sheep', build);
    expect(sheep.dispose).toHaveBeenCalledTimes(1);
    expect(v.sheepVisual).toBeNull();
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0]?.[3]).toBe('sheepVisual');
  });

  it('keeps a slot already holding the right animal', () => {
    const v = view();
    const toad = rig('form_toad');
    v.sheepVisual = toad;
    const build = vi.fn();
    syncFormRig({ auras: [TOADED] }, v, 'sheep', build);
    expect(toad.dispose).not.toHaveBeenCalled();
    expect(v.sheepVisual).toBe(toad);
    expect(build).not.toHaveBeenCalled();
  });

  it('builds every other form as before, and nothing for base or the fireball', () => {
    const build = vi.fn();
    const e = { auras: [] };
    syncFormRig(e, view(), 'bear', build);
    syncFormRig(e, view(), 'cat', build);
    syncFormRig(e, view(), 'travel', build);
    syncFormRig(e, view(), 'metamorph', build);
    syncFormRig(e, view(), 'base', build);
    syncFormRig(e, view(), 'fireball', build);
    expect(build.mock.calls.map((c) => [c[2], c[3], c[4]])).toEqual([
      ['form_bear', 'bearVisual', true],
      ['form_cat', 'catVisual', true],
      ['form_travel', 'travelVisual', true],
      ['form_metamorph', 'metamorphVisual', false],
    ]);
    // A built bear is never rebuilt (the stale check is the polymorph slot's).
    const v = view();
    v.bearVisual = rig('form_sheep');
    const again = vi.fn();
    syncFormRig(e, v, 'bear', again);
    expect(again).not.toHaveBeenCalled();
  });
});
