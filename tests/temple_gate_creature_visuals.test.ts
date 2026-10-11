import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { characterPreloadUrls, VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { DROWNED_TEMPLE_MOBS } from '../src/sim/content/drowned_temple';
import {
  TEMPLE_SKEWERING_TRIDENT,
  TEMPLE_SNAP,
  TEMPLE_TIDEMARKED_SURGE,
} from '../src/sim/mob/trash_kit/temple_cast_ids';

function clipNames(url: string): Set<string> {
  const bytes = readFileSync(`public/${url}`);
  const json = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  return new Set(json.animations.map((clip: { name: string }) => clip.name));
}

describe('Drowned Temple guardian and lurker visual dispatch', () => {
  it.each([
    ['temple_tidemarked_trident', 'temple_tidemarked_sentinel', 4.027],
    ['temple_tidemarked_tide', 'temple_tidemarked_sentinel', 4.027],
    ['temple_abyssal_lurker', 'temple_abyssal_lurker', 2.4],
  ] as const)('%s resolves the authored Blender body on every tier', (templateId, key, height) => {
    expect(visualKeyFor({ kind: 'mob', templateId } as never)).toBe(key);
    const visual = VISUALS[key];
    expect(visual.height).toBe(height);
    expect(visual.authoredAtlas).toBe(true);
    for (const standardMaterials of [false, true]) {
      expect(characterPreloadUrls(standardMaterials)).toContain(visual.url);
    }
    const names = clipNames(visual.url);
    const clips = visual.clips;
    for (const clip of [
      clips.idle,
      clips.walk,
      clips.run,
      clips.death,
      clips.cast,
      clips.jump,
      ...clips.attack,
      ...(clips.hit ?? []),
      ...Object.values(clips.castByAbility ?? {}),
    ]) {
      if (clip) expect(names.has(clip), `${key}: ${clip}`).toBe(true);
    }
  });

  it('binds live guardian cast ids and lands the trident contact at the bar end', () => {
    expect(DROWNED_TEMPLE_MOBS.temple_tidemarked_trident.trashKit?.line?.castId).toBe(
      TEMPLE_SKEWERING_TRIDENT,
    );
    expect(DROWNED_TEMPLE_MOBS.temple_tidemarked_tide.trashKit?.nova?.castId).toBe(
      TEMPLE_TIDEMARKED_SURGE,
    );
    const visual = VISUALS.temple_tidemarked_sentinel;
    expect(visual.clips.castByAbility?.[TEMPLE_SKEWERING_TRIDENT]).toBe('Attack');
    expect(visual.clips.castByAbility?.[TEMPLE_TIDEMARKED_SURGE]).toBe('Cast');
    expect(visual.castClipSync).toEqual([TEMPLE_SKEWERING_TRIDENT]);
    expect(visual.castPlayOutHoldsAttacks).toBe(true);
    expect(visual.clips.castTimeScaleByAbility?.[TEMPLE_SKEWERING_TRIDENT]).toBeCloseTo(
      14 / 24 / 1.8,
    );
    expect(visual.clips.castPlayOut).toContain('Attack');
  });

  it('binds the lurker bite to Snap and its pounce to the shipped airborne clip', () => {
    expect(DROWNED_TEMPLE_MOBS.temple_abyssal_lurker.breathCone?.castId).toBe(TEMPLE_SNAP);
    expect(DROWNED_TEMPLE_MOBS.temple_abyssal_lurker.trashKit?.leap).toBeDefined();
    const visual = VISUALS.temple_abyssal_lurker;
    expect(visual.clips.castByAbility?.[TEMPLE_SNAP]).toBe('Attack');
    expect(visual.clips.jump).toBe('Leap');
    expect(visual.castClipSync).toEqual([TEMPLE_SNAP]);
    expect(visual.castPlayOutHoldsAttacks).toBe(true);
    expect(visual.clips.castTimeScaleByAbility?.[TEMPLE_SNAP]).toBeCloseTo(11 / 24 / 1.5);
    expect(visual.clips.castPlayOut).toContain('Attack');
  });
});
