// The authored open-air field system (src/sim/instances/authored_field): the
// shared height function, path blending, the generated cliffs and colliders,
// and the one generic groundHeight arm that also carries Wildheart unchanged.

import { describe, expect, it } from 'vitest';
import { HOLLOW_CRYPT_FIELD, HOLLOW_CRYPT_RING } from '../src/sim/content/hollow_crypt_layout';
import { DUNGEONS, instanceOrigin } from '../src/sim/data';
import {
  type AuthoredFieldDef,
  authoredFieldCliffRuns,
  authoredFieldColliders,
  authoredFieldFor,
  authoredFieldHeight,
  instancedFieldHeight,
} from '../src/sim/instances/authored_field';
import { wildheartFieldHeight } from '../src/sim/wildheart_field';
import { groundHeight } from '../src/sim/world';

const MINI: AuthoredFieldDef = {
  key: 'mini',
  bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 40 },
  voidHeight: -10,
  cliffStep: 1,
  surfaces: [
    {
      kind: 'poly',
      id: 'low',
      points: [
        [-10, -10],
        [10, -10],
        [10, 10],
        [-10, 10],
      ],
      h: 0,
    },
    { kind: 'circle', id: 'high', x: 0, z: 30, r: 8, h: 6 },
    {
      kind: 'path',
      id: 'ramp',
      points: [
        [0, 5, 0],
        [0, 10, 0],
        [0, 22, 6],
        [0, 27, 6],
      ],
      halfWidth: 3,
    },
  ],
  walls: [],
  props: [{ kind: 'post', x: 5, z: 0, rot: 0, r: 0.5, h: 3 }],
  lightZones: [],
};

describe('authored field height', () => {
  it('answers each surface, the void, and the last-surface-wins order', () => {
    expect(authoredFieldHeight(MINI, 0, 0)).toBe(0);
    expect(authoredFieldHeight(MINI, 0, 34)).toBe(6);
    expect(authoredFieldHeight(MINI, 15, 15)).toBe(-10);
    // The ramp overrides the low square where they overlap (z 5 to 10: flat 0).
    expect(authoredFieldHeight(MINI, 0, 7)).toBe(0);
  });

  it('blends a path linearly and continuously along its centreline', () => {
    expect(authoredFieldHeight(MINI, 0, 16)).toBeCloseTo(3, 5);
    let prev = authoredFieldHeight(MINI, 0, 4);
    for (let z = 4; z <= 30; z += 0.25) {
      const h = authoredFieldHeight(MINI, 0, z);
      expect(Math.abs(h - prev)).toBeLessThan(0.2);
      prev = h;
    }
  });

  it('derives cliffs where the ground drops, none along a continuous join', () => {
    const runs = authoredFieldCliffRuns(MINI);
    expect(runs.length).toBeGreaterThan(4);
    for (const run of runs) expect(run.high - run.low).toBeGreaterThan(MINI.cliffStep);
    // The ramp sides over the void carry walls; its ends inside the terraces do not.
    const nearRampEnd = runs.some(
      (r) => Math.abs((r.az + r.bz) / 2 - 5) < 0.6 && Math.abs((r.ax + r.bx) / 2) < 2,
    );
    expect(nearRampEnd).toBe(false);
  });

  it('turns cliffs, walls and prop footprints into colliders', () => {
    const colliders = authoredFieldColliders(MINI, 0);
    expect(colliders.length).toBe(authoredFieldCliffRuns(MINI).length + 1);
    expect(colliders.some((c) => c.type === 'circle' && c.x === 5 && c.r === 0.5)).toBe(true);
  });
});

describe('the Hollow Crypt field', () => {
  it('stands every named space at its authored height', () => {
    const f = HOLLOW_CRYPT_FIELD;
    expect(authoredFieldHeight(f, 0, -128)).toBe(20); // Lychgate Landing
    expect(authoredFieldHeight(f, 0, -30)).toBe(0); // Ossuary Cloister
    expect(authoredFieldHeight(f, -82, 46)).toBe(2); // Sexton's Yard
    expect(authoredFieldHeight(f, -82, 116)).toBe(8); // the Bell Yard
    expect(authoredFieldHeight(f, 76, 40)).toBe(-6); // Widow's Gallery
    expect(authoredFieldHeight(f, 105, 64)).toBe(0); // the rim walk
    expect(authoredFieldHeight(f, 0, 162)).toBe(5); // the choir loft
    expect(authoredFieldHeight(f, HOLLOW_CRYPT_RING.x, HOLLOW_CRYPT_RING.z)).toBe(24);
    expect(authoredFieldHeight(f, 60, -100)).toBe(-40); // the mist chasm
    // The Chapel Stair halfway down.
    expect(authoredFieldHeight(f, 0, -96)).toBeCloseTo(10, 5);
  });

  it('keeps the collider set modest (interior lists are scanned linearly)', () => {
    expect(authoredFieldColliders(HOLLOW_CRYPT_FIELD, 0).length).toBeLessThan(500);
  });

  it('is the live ground of every Hollow Crypt slot through groundHeight', () => {
    const d = DUNGEONS.hollow_crypt;
    expect(d.interior).toBe('hollow_crypt');
    expect(authoredFieldFor(d.interior)).toBe(HOLLOW_CRYPT_FIELD);
    for (const slot of [0, 5, 23]) {
      const o = instanceOrigin(d.index, slot);
      expect(groundHeight(o.x, o.z - 128, 1)).toBe(20);
      expect(groundHeight(o.x - 82, o.z + 116, 1)).toBe(8);
    }
  });

  it('leaves the Wildheart Basin ground byte-identical', () => {
    const d = DUNGEONS.wildheart_basin;
    expect(instancedFieldHeight('wildheart')).toBe(wildheartFieldHeight);
    const o = instanceOrigin(d.index, 2);
    for (const [x, z] of [
      [0, 0],
      [-37, 96],
      [12.5, 211.25],
      [60, 150],
    ]) {
      expect(groundHeight(o.x + x, o.z + z, 3)).toBe(wildheartFieldHeight(x, z));
    }
    // The Sunken Bastion keeps the shared crypt nave (a flat floor here).
    expect(DUNGEONS.sunken_bastion.interior).toBe('crypt');
    expect(instancedFieldHeight('crypt')).toBeNull();
  });
});
