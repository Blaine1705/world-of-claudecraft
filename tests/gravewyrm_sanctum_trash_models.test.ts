// The Gravewyrm Sanctum trash's own Blender bodies
// (src/render/characters/sanctum_trash_looks.ts): each replaces its re-tinted
// placeholder under the same visual key, ships a clip for every job its
// template now has, and is drawn at its SANCTUM_DRAWN_HEIGHTS row.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  BONEGUARD_BODY,
  BONEWALKER_BODY,
  barRate,
  SCALEGUARD_BODY,
  SCALEGUARD_CLIP,
  trashModelScale,
} from '../src/render/characters/sanctum_trash_looks';
import {
  BONEWALKER_RISE_GESTURE,
  BONEWALKER_RISE_WINDOW,
  bonewalkerRises,
  SANCTUM_DRAWN_HEIGHTS,
  sanctumAnchor,
} from '../src/render/gravewyrm_sanctum_fx/sanctum_fx_core';
import { MOBS } from '../src/sim/data';
import {
  SANCTUM_CINDER_BREATH,
  SANCTUM_COUNTERWEIGHT_LASH,
} from '../src/sim/mob/trash_kit/sanctum_cast_ids';

type GlbJson = {
  animations?: { name: string }[];
  images?: { mimeType?: string }[];
  extensionsRequired?: string[];
};

function glbJson(path: string): GlbJson {
  const buf = readFileSync(path);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as GlbJson;
}

function clipsOf(path: string): string[] {
  return (glbJson(path).animations ?? []).map((a) => a.name).sort();
}

function visualOf(templateId: string) {
  return VISUALS[visualKeyFor({ kind: 'mob', templateId } as never)];
}

/** A shipped body: KTX2 textures only, the basisu extension required. */
function expectShipped(url: string): void {
  const json = glbJson(`public/${url}`);
  expect((json.images ?? []).length).toBeGreaterThan(0);
  expect((json.images ?? []).every((i) => i.mimeType === 'image/ktx2')).toBe(true);
  expect(json.extensionsRequired ?? []).toContain('KHR_texture_basisu');
}

/** Drawn at its row: the look's height at the template's sim scale. */
function expectDrawnAtRow(templateId: string): void {
  const v = visualOf(templateId);
  const scale = MOBS[templateId]?.scale ?? 1;
  expect(v.height * scale).toBeCloseTo(SANCTUM_DRAWN_HEIGHTS[templateId], 6);
  expect(v.authoredAtlas).toBe(true);
  // No re-tint left over from the placeholder rig.
  expect(v.tint).toBeUndefined();
  expect(v.animUrls).toBeUndefined();
}

const DEAD_CLIPS = [
  'Attack',
  'Attack2',
  'Attack3',
  'CombatIdle',
  'Death',
  'Hit',
  'Idle',
  'Run',
  'Thaw',
  'Walk',
].sort();

describe('the Sanctum Boneguard and the Raised Bonewalker', () => {
  it('ship their own bodies with every clip', () => {
    expect(BONEGUARD_BODY.url).toBe('models/creatures/sanctum_boneguard.glb');
    expect(BONEWALKER_BODY.url).toBe('models/creatures/sanctum_raised_bonewalker.glb');
    for (const body of [BONEGUARD_BODY, BONEWALKER_BODY]) {
      expect(clipsOf(`public/${body.url}`)).toEqual(DEAD_CLIPS);
      expectShipped(body.url);
    }
    expect(visualOf('sanctum_boneguard').url).toBe(BONEGUARD_BODY.url);
    expect(visualOf('raised_bonewalker').url).toBe(BONEWALKER_BODY.url);
    expectDrawnAtRow('sanctum_boneguard');
    expectDrawnAtRow('raised_bonewalker');
  });

  it('walk at their authored stride scaled to the drawn size', () => {
    const k = trashModelScale(BONEGUARD_BODY, 'sanctum_boneguard');
    expect(k).toBeCloseTo(4.6 / 4.56, 9);
    expect(visualOf('sanctum_boneguard').walkRef).toBeCloseTo(1.51 * k, 9);
    expect(visualOf('sanctum_boneguard').runRef).toBeCloseTo(5.81 * k, 9);
    const w = trashModelScale(BONEWALKER_BODY, 'raised_bonewalker');
    expect(w).toBeCloseTo(3.7 / 4.4, 9);
    expect(visualOf('raised_bonewalker').runRef).toBeCloseTo(5.81 * w, 9);
  });

  it('a Bonewalker climbs out of the ice once, as it arrives', () => {
    const c = visualOf('raised_bonewalker');
    expect(c.clips.entrance).toBe('Thaw');
    expect(c.entranceGesture).toBe(BONEWALKER_RISE_GESTURE);
    expect(c.oneShotsHoldAttacks).toContain('Thaw');
    expect(c.clips.combatIdle).toBe('CombatIdle');
    expect(c.clips.attack).toEqual(['Attack', 'Attack2', 'Attack3']);
    // Offered only to a living Bonewalker, only just after it is first seen.
    expect(bonewalkerRises('raised_bonewalker', false, 0)).toBe(true);
    expect(bonewalkerRises('raised_bonewalker', false, BONEWALKER_RISE_WINDOW)).toBe(true);
    expect(bonewalkerRises('raised_bonewalker', false, BONEWALKER_RISE_WINDOW + 0.1)).toBe(false);
    expect(bonewalkerRises('raised_bonewalker', true, 0)).toBe(false);
    expect(bonewalkerRises('sanctum_boneguard', false, 0)).toBe(false);
    // The Boneguard itself tears free of the ice when it respawns.
    expect(visualOf('sanctum_boneguard').clips.flourish).toBe('Thaw');
    expect(visualOf('sanctum_boneguard').entranceGesture).toBeUndefined();
  });

  it('Thaw the Held raises the corpse the Boneguard leaves as a Bonewalker', () => {
    const rite = MOBS.broodsworn_thawcaller?.trashKit?.reanimate;
    expect(rite?.corpses).toEqual(['sanctum_boneguard']);
    expect(rite?.summon).toBe('raised_bonewalker');
  });
});

describe('the Sanctum Scaleguard', () => {
  it('ships its own body with a clip for the breath and the lash', () => {
    expect(clipsOf(`public/${SCALEGUARD_BODY.url}`)).toEqual(
      [
        'Attack',
        'Attack2',
        'CinderBreath',
        'CombatIdle',
        'CounterweightLash',
        'Death',
        'Hit',
        'Idle',
        'Run',
        'Walk',
      ].sort(),
    );
    expectShipped(SCALEGUARD_BODY.url);
    expect(visualOf('sanctum_drakonid').url).toBe(SCALEGUARD_BODY.url);
    expectDrawnAtRow('sanctum_drakonid');
    // Drawn to the halberd's spike at its authored size.
    expect(SANCTUM_DRAWN_HEIGHTS.sanctum_drakonid).toBe(SCALEGUARD_BODY.idleHeight);
  });

  it("lands both bars on their clips' contact frames and plays them out", () => {
    const v = visualOf('sanctum_drakonid');
    const t = MOBS.sanctum_drakonid;
    expect(v.castClipSync).toBe(true);
    expect(v.clips.castByAbility?.[SANCTUM_CINDER_BREATH]).toBe('CinderBreath');
    expect(v.clips.castByAbility?.[SANCTUM_COUNTERWEIGHT_LASH]).toBe('CounterweightLash');
    expect(t?.breathCone?.castTime).toBe(2);
    expect(t?.trashKit?.tailLash?.castTime).toBe(1);
    expect(v.clips.castTimeScaleByAbility?.[SANCTUM_CINDER_BREATH]).toBeCloseTo(
      SCALEGUARD_CLIP.cinderBreath / 2,
      9,
    );
    expect(v.clips.castTimeScaleByAbility?.[SANCTUM_COUNTERWEIGHT_LASH]).toBeCloseTo(
      SCALEGUARD_CLIP.counterweightLash / 1,
      9,
    );
    expect(v.clips.castPlayOut).toEqual(['CinderBreath', 'CounterweightLash']);
    expect(barRate(1, 0)).toBe(1);
  });

  it('pours the Cinder Breath from its jaws, not its chest', () => {
    // Measured on the .blend: the jaws at the bar's end, reared over the bar.
    expect(sanctumAnchor('breath', 'sanctum_drakonid')).toEqual([0.24, 0, 0.64]);
    expect(sanctumAnchor('breathDraw', 'sanctum_drakonid')[2]).toBeGreaterThan(0.8);
    // A body without its own row keeps the generic placement.
    expect(sanctumAnchor('breath', 'no_such_mob')).toEqual([0.3, 0, 0.5]);
  });
});
