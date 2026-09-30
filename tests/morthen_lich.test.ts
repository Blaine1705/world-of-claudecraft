// Morthen the Gravecaller as the Lich Bishop (scripts/assets/hollow_crypt_creatures/
// build_morthen.py): his own Blender body and clips, the entrance casts played on
// his own rise, proclamation and ward, the Shadow Pulse on the bell, and the
// Last Rites stance (the bell staff unfolding into the scythe) read off his
// mirrored health alone, so offline and online see the same beat.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  DISSOLVE_SEC,
  dissolveLevels,
  MORTHEN_SCYTHE_HELD,
  MORTHEN_SCYTHE_UNFOLD,
  MORTHEN_STAFF_HELD,
  MORTHEN_STAFF_RESTORED_FRACTION,
  MORTHEN_TOLL,
  morthenAnchor,
  morthenStance,
  morthenStanceGesture,
  SWING_CUT_START_SEC,
  scytheTrail,
} from '../src/render/hollow_crypt/morthen_fx_core';
import { MOBS } from '../src/sim/data';
import {
  MORTHEN_DESCEND,
  MORTHEN_LAST_RITES_FRACTION,
  MORTHEN_PROCLAIM,
  MORTHEN_RISE,
} from '../src/sim/encounters/hollow_crypt/ids';
import type { Entity } from '../src/sim/types';

const PLAYER_HEIGHT = 2.6;
const GLB = 'public/models/creatures/crypt_morthen_lich.glb';

function glbJson(): {
  animations?: { name: string }[];
  meshes: { primitives: { indices: number }[] }[];
  accessors: { count: number }[];
} {
  const buf = readFileSync(GLB);
  expect(buf.readUInt32LE(0)).toBe(0x46546c67);
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

const def = VISUALS[visualKeyFor({ kind: 'mob', templateId: 'morthen' } as Entity)];

describe('Morthen, the Lich Bishop: his own body', () => {
  it('draws the Blender lich, not a KayKit mage', () => {
    expect(visualKeyFor({ kind: 'mob', templateId: 'morthen' } as Entity)).toBe(
      'crypt_morthen_lich',
    );
    expect(def.url).toBe('models/creatures/crypt_morthen_lich.glb');
    expect(def.attach).toBeUndefined();
    expect(def.authoredAtlas).toBe(true);
  });

  it('stands about three players tall and floats', () => {
    const drawn = def.height * MOBS.morthen.scale;
    expect(drawn / PLAYER_HEIGHT).toBeGreaterThan(2.9);
    expect(def.hover).toBeGreaterThan(0);
  });

  it('ships every clip of both stances, each his own', () => {
    const names = new Set((glbJson().animations ?? []).map((a) => a.name));
    for (const clip of [
      'Idle',
      'Walk',
      'Run',
      'Rise',
      'SummonSouls',
      'ShieldRitual',
      'BellToll',
      'StaffStrike',
      'StaffStrike2',
      'Hit',
      'Death',
      'Transform',
      'ScytheIdle',
      'ScytheWalk',
      'ScytheRun',
      'ScytheSweep',
      'ScytheSweep2',
      'ScytheToll',
      'ScytheSummon',
      'ScytheHit',
      'ScytheDeath',
    ])
      expect(names.has(clip), clip).toBe(true);
  });

  it('stays inside the boss triangle budget', () => {
    const j = glbJson();
    let tris = 0;
    for (const m of j.meshes)
      for (const p of m.primitives) tris += j.accessors[p.indices].count / 3;
    expect(tris).toBeGreaterThan(20_000);
    expect(tris).toBeLessThan(55_000);
    expect(readFileSync(GLB).length).toBeLessThan(3_500_000);
  });
});

describe('Morthen, the Lich Bishop: clips mapped to his casts', () => {
  it('plays his entrance on his own rise, proclamation and ward', () => {
    expect(def.clips.castByAbility?.[MORTHEN_RISE]).toBe('Rise');
    expect(def.clips.castByAbility?.[MORTHEN_PROCLAIM]).toBe('SummonSouls');
    expect(def.clips.castByAbility?.[MORTHEN_DESCEND]).toBe('ShieldRitual');
    expect(def.clips.castTimeScaleByAbility?.[MORTHEN_RISE]).toBe(1);
  });

  it('strikes with the bell staff and tolls it for the Shadow Pulse', () => {
    expect(def.clips.attack).toEqual(['StaffStrike', 'StaffStrike2']);
    expect(def.clips.attackByAbility?.[MORTHEN_TOLL]).toBe('BellToll');
    expect(def.clips.idle).toBe('Idle');
  });

  it('unfolds the scythe once, then reaps with it', () => {
    const unfold = def.phaseClips?.[MORTHEN_SCYTHE_UNFOLD];
    const held = def.phaseClips?.[MORTHEN_SCYTHE_HELD];
    const staff = def.phaseClips?.[MORTHEN_STAFF_HELD];
    expect(unfold?.enter).toBe('Transform');
    expect(held?.enter).toBeUndefined();
    expect(staff?.enter).toBeUndefined();
    // The held and unfolding gestures swap to the very same vocabulary, and the
    // staff gesture back to the one he spawns with (the swap is an identity check).
    expect(held?.clips).toBe(unfold?.clips);
    expect(staff?.clips).toBe(def.clips);
    expect(unfold?.clips.attack).toEqual(['ScytheSweep', 'ScytheSweep2']);
    expect(unfold?.clips.idle).toBe('ScytheIdle');
    expect(unfold?.clips.death).toBe('ScytheDeath');
    expect(unfold?.clips.attackByAbility?.[MORTHEN_TOLL]).toBe('ScytheToll');
  });
});

describe('Morthen, the Lich Bishop: the Last Rites stance', () => {
  it('keys on the design line (hollow_crypt.md 5.4: phase 3 at 35 percent)', () => {
    expect(MORTHEN_LAST_RITES_FRACTION).toBe(0.35);
    expect(morthenStance(null, 1)).toBe('staff');
    expect(morthenStance('staff', 0.36)).toBe('staff');
    expect(morthenStance('staff', 0.35)).toBe('scythe');
    expect(morthenStance(null, 0.2)).toBe('scythe');
  });

  it('never flips back on a heal inside the phase, only when he is whole again', () => {
    expect(morthenStance('scythe', 0.5)).toBe('scythe');
    expect(morthenStance('scythe', MORTHEN_STAFF_RESTORED_FRACTION - 0.01)).toBe('scythe');
    expect(morthenStance('scythe', MORTHEN_STAFF_RESTORED_FRACTION)).toBe('staff');
    expect(morthenStance('scythe', Number.NaN)).toBe('scythe');
  });

  it('plays the unfolding only on a live staff-to-scythe edge', () => {
    expect(morthenStanceGesture('staff', 'scythe')).toBe(MORTHEN_SCYTHE_UNFOLD);
    // a late joiner (first sight) and the periodic refresh swap silently
    expect(morthenStanceGesture(null, 'scythe')).toBe(MORTHEN_SCYTHE_HELD);
    expect(morthenStanceGesture('scythe', 'scythe')).toBe(MORTHEN_SCYTHE_HELD);
    expect(morthenStanceGesture('scythe', 'staff')).toBe(MORTHEN_STAFF_HELD);
    expect(morthenStanceGesture(null, 'staff')).toBe(MORTHEN_STAFF_HELD);
  });
});

describe('Morthen, the Lich Bishop: effect plan', () => {
  it('turns body anchors with his facing', () => {
    const at = { x: 0, y: 3, z: 1 };
    const north = morthenAnchor({ x: 10, y: 2, z: 5 }, 0, 1, at);
    expect(north).toEqual({ x: 10, y: 5, z: 6 });
    const east = morthenAnchor({ x: 0, y: 0, z: 0 }, Math.PI / 2, 2, at);
    expect(east.x).toBeCloseTo(2);
    expect(east.z).toBeCloseTo(0);
    expect(east.y).toBeCloseTo(6);
  });

  it('cuts a swing trail forward along the arc, then fades it', () => {
    expect(scytheTrail(0)).toBeNull();
    let lastHead = -1;
    for (let t = SWING_CUT_START_SEC; t < SWING_CUT_START_SEC + 0.28; t += 0.02) {
      const p = scytheTrail(t);
      expect(p).not.toBeNull();
      expect(p?.head ?? 0).toBeGreaterThanOrEqual(lastHead);
      expect(p?.tail ?? 1).toBeLessThanOrEqual(p?.head ?? 0);
      lastHead = p?.head ?? 0;
    }
    expect(scytheTrail(SWING_CUT_START_SEC + 2)).toBeNull();
  });

  it('dissolves into smoke, lets the souls go, and ends', () => {
    expect(dissolveLevels(0).flash).toBe(1);
    expect(dissolveLevels(0.5).smoke).toBeGreaterThan(0.8);
    expect(dissolveLevels(1).souls).toBeGreaterThan(0.5);
    expect(dissolveLevels(DISSOLVE_SEC + 0.1)).toEqual({ smoke: 0, souls: 0, flash: 0 });
  });
});
