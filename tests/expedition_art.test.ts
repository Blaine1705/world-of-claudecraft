import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FINDER_ACTIVITIES } from '../src/sim/content/dungeon_finder';
import {
  expeditionClassEmblem,
  expeditionImageUrl,
} from '../src/ui/hud/expeditions/expedition_art';

describe('expedition art', () => {
  it('uses shipped art for every advertised dungeon, with a safe unknown fallback', () => {
    for (const activity of FINDER_ACTIVITIES) {
      expect(existsSync(`public${expeditionImageUrl(activity.dungeonId)}`)).toBe(true);
    }
    expect(expeditionImageUrl('../untrusted')).toBe('/ui/chrome/dfinder.webp');
    expect(expeditionImageUrl('__proto__')).toBe('/ui/chrome/dfinder.webp');
  });
  it('does not interpolate untrusted class identifiers into image paths', () => {
    expect(expeditionClassEmblem('priest')).toContain('/ui/classes/priest.webp');
    expect(expeditionClassEmblem('" onerror="alert(1)')).not.toContain('<img');
  });
});
