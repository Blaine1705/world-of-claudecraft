import { describe, expect, it } from 'vitest';
import {
  eyeInTavern,
  hallRoofUnderside,
  mirefenTavernParts,
  newTavernShellState,
  TAVERN_EYE_OVER_FEET,
  TAVERN_SHELL_PARTS,
  type TavernShellPart,
  tavernShellOcclusion,
  tavernShelters,
} from '../src/render/mirefen_tavern_core';
import { OCCLUDER_FADE_ALPHA } from '../src/render/occluder_fade_core';
import {
  TAVERN_FLOOR_Y,
  TAVERN_HALL,
  TAVERN_TOWER,
  TAVERN_UPPER,
  tavernToWorld,
} from '../src/sim/content/mirefen_tavern';

// The Mirefen tavern camera cutaway and tiers (src/render/mirefen_tavern_core.ts). The chase
// camera never changes its distance (tests/graphics_overhaul_integration.test.ts), so indoors
// every shell part between the camera and the player is cut away and outdoors each part
// that hides the player ghosts. Pins which parts go for the orbits a player really takes, in
// the hall, on the stair, on the gallery and in a room, that a camera inside the room cuts
// nothing, that the gallery never goes from under a player standing on it, and the tiers.

type P = { x: number; y: number; z: number };
/** The eye over a player standing at local (lx, lz) with feet at local height ly (world). */
const eye = (lx: number, lz: number, ly = 0): P => {
  const w = tavernToWorld(lx, lz);
  return { x: w.x, y: TAVERN_FLOOR_Y + ly + TAVERN_EYE_OVER_FEET, z: w.z };
};
/** A camera at local (lx, ly, lz), in the world. */
const cam = (lx: number, ly: number, lz: number): P => {
  const w = tavernToWorld(lx, lz);
  return { x: w.x, y: TAVERN_FLOOR_Y + ly, z: w.z };
};
function decide(e: P, c: P): { inside: boolean; floor: number; cut: TavernShellPart[] } {
  const s = tavernShellOcclusion(e.x, e.y, e.z, c.x, c.y, c.z, newTavernShellState());
  return {
    inside: s.inside,
    floor: s.floor,
    cut: TAVERN_SHELL_PARTS.filter((_, i) => s.occluded[i]),
  };
}

describe('tavern cutaway: indoors', () => {
  it('counts the hall, the doorway, the tower and the wing as indoors, the porch and road not', () => {
    const inside = (lx: number, lz: number, ly = 0) =>
      eyeInTavern(lx, ly + TAVERN_EYE_OVER_FEET, lz);
    expect(inside(0, 0)).toBe(true);
    expect(inside(0, 13.9)).toBe(true); // the doorway
    expect(inside(TAVERN_TOWER.x + 3, TAVERN_TOWER.z, 3)).toBe(true); // on the stair
    expect(inside(10, -22, TAVERN_UPPER)).toBe(true); // a room upstairs
    expect(inside(0, 15.5)).toBe(false); // the porch
    expect(inside(0, 22)).toBe(false); // the road
    expect(inside(-20, 0)).toBe(false); // outside the left wall
  });

  it('cuts only the wall the camera stands behind, and the roof over a high sight line', () => {
    // by the fire, the camera out past the front door, low: the front wall only
    let d = decide(eye(0, 8), cam(0, 5, 20));
    expect(d.inside).toBe(true);
    expect(d.floor).toBe(0);
    expect(d.cut).toEqual(['HallWallFront']);
    // the camera out past the left wall and high over the eaves: that wall and the roof
    d = decide(eye(-8, 0), cam(-22, 16, 0));
    expect(d.cut).toContain('HallWallLeft');
    expect(d.cut).toContain('HallRoof');
    expect(d.cut).not.toContain('HallWallRight');
    // a camera zoomed in inside the room, under the tie beams: nothing is cut
    d = decide(eye(0, 6), cam(0, 5, 10));
    expect(d.cut).toEqual([]);
  });

  it('cuts the tower wall for a player on the stair with the camera outside the ring', () => {
    const T = TAVERN_TOWER;
    const d = decide(eye(T.x - 4, T.z - 1, 2.5), cam(T.x - 14, 7, T.z - 3));
    expect(d.cut).toContain('TowerWall');
  });

  it('never takes the gallery from under a player standing on it', () => {
    // on the gallery, the camera below it by the bar: the gallery stays
    let d = decide(eye(9, -11.6, TAVERN_UPPER), cam(9, 3, -4));
    expect(d.cut).not.toContain('Gallery');
    // at the bar under the gallery, the camera up behind the barrel wall: the gallery goes
    d = decide(eye(9, -6, 0.5), cam(9, 9, -16));
    expect(d.cut).toContain('Gallery');
    expect(d.cut).toContain('HallWallBack');
  });

  it('cuts the partitions for a player in a room with the camera on the landing', () => {
    // (the sight line through the doorway itself cuts nothing: the partition is open there)
    expect(
      decide(eye(7.3, -23, TAVERN_UPPER), cam(7.3, TAVERN_UPPER + 3.5, -17)).cut,
    ).not.toContain('RoomWalls');
    const d = decide(eye(7.3, -23, TAVERN_UPPER), cam(11, TAVERN_UPPER + 3.5, -17));
    expect(d.cut).toContain('RoomWalls');
  });
});

describe('tavern cutaway: outdoors', () => {
  it('ghosts the parts that hide a player outside, and nothing when nothing hides him', () => {
    let d = decide(eye(-19, 0), cam(22, 10, 0));
    expect(d.inside).toBe(false);
    expect(d.floor).toBe(OCCLUDER_FADE_ALPHA);
    expect(d.cut).toContain('HallWallLeft');
    expect(d.cut).toContain('HallWallRight');
    d = decide(eye(0, 22), cam(0, 6, 32));
    expect(d.cut).toEqual([]);
  });
});

describe('tavern roof and shelter', () => {
  it('reads the roof underside from its line, and the trusses over the nave', () => {
    expect(hallRoofUnderside(15, 0)).toBeLessThan(TAVERN_HALL.ridge);
    expect(hallRoofUnderside(0, 0)).toBeLessThanOrEqual(TAVERN_HALL.tie + 0.65);
    expect(hallRoofUnderside(40, 0)).toBe(Infinity);
  });

  it('shelters a body inside from the weather, never one on the porch', () => {
    const inHall = tavernToWorld(0, 5);
    expect(tavernShelters(inHall.x, TAVERN_FLOOR_Y, inHall.z)).toBe(true);
    const porch = tavernToWorld(0, 15.5);
    expect(tavernShelters(porch.x, TAVERN_FLOOR_Y, porch.z)).toBe(false);
  });

  it('keeps the whole building on every tier, trim from medium, clutter from high', () => {
    expect(mirefenTavernParts('low')).not.toContain('TavernTrim');
    expect(mirefenTavernParts('medium')).toContain('TavernTrim');
    expect(mirefenTavernParts('medium')).not.toContain('TavernClutter');
    expect(mirefenTavernParts('high')).toContain('TavernClutter');
    for (const tier of ['low', 'medium', 'high', 'ultra', 'insane'] as const) {
      for (const name of TAVERN_SHELL_PARTS) expect(mirefenTavernParts(tier)).toContain(name);
      expect(mirefenTavernParts(tier)).toContain('TavernLights');
      expect(mirefenTavernParts(tier)).toContain('TavernFurnishings');
    }
  });
});
