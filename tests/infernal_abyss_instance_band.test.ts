import { afterAll, describe, expect, it } from 'vitest';
import {
  ARENA_X,
  BUILTIN_WORLD,
  DUNGEONS,
  dungeonAt,
  instanceOrigin,
  isArenaPos,
  isDelvePos,
  setActiveWorldContent,
} from '../src/sim/data';

// The Infernal Abyss is Studio content: data.ts registers it only while an
// authored map is the active content (src/sim/studio_content.ts), so this
// suite runs with an authored copy of the shipped world active.
setActiveWorldContent({ ...BUILTIN_WORLD, placements: [] });
afterAll(() => setActiveWorldContent(null));

describe('Infernal Abyss instance band', () => {
  it('resolves index 6 beyond the finite arena band without overlapping delves', () => {
    const origin = instanceOrigin(DUNGEONS.infernal_abyss.index, 0);
    expect(origin.x).toBe(4500);
    expect(dungeonAt(origin.x)?.id).toBe('infernal_abyss');
    expect(isArenaPos(origin.x)).toBe(false);
    expect(isDelvePos(origin.x)).toBe(false);
  });

  it('keeps the Ashen Coliseum classified as arena, not a dungeon', () => {
    expect(isArenaPos(ARENA_X)).toBe(true);
    expect(dungeonAt(ARENA_X)).toBeNull();
  });

  it('pins the finite arena band edges the rework introduced', () => {
    // The old band was the open-ended [4200, delves); the rework carved it to
    // [4160, 4240) so index 6 fits at 4500. Collision/LoS code branches on
    // isArenaPos, so the strip [4160, 4200) must read arena, never dungeon.
    expect(isArenaPos(4160)).toBe(true);
    expect(isArenaPos(4199)).toBe(true);
    expect(isArenaPos(4239)).toBe(true);
    expect(isArenaPos(4159)).toBe(false);
    expect(isArenaPos(4240)).toBe(false);
    expect(dungeonAt(4199)).toBeNull();
    expect(dungeonAt(4239)).toBeNull();
  });
});
