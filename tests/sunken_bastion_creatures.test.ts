// The Sunken Bastion's Blender-built creatures (scripts/assets/
// sunken_bastion_creatures/): every roster mob wears its own sea-themed body
// (no KayKit skeleton or stock crab or wolf), every clip its VISUALS row names
// ships in its GLB, and each creature carries the unique clips of its job
// (the crawler's swell-and-burst death, the hound's airborne Lunge, the
// watchman's halberd sweep, the arbalest's aim, the sergeant's rally, the sea
// hag's ward).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { MOBS } from '../src/sim/data';
import type { Entity } from '../src/sim/types';

function glbClips(url: string): Set<string> {
  const buf = readFileSync(join('public', url));
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8')) as {
    animations?: { name: string }[];
  };
  return new Set((json.animations ?? []).map((a) => a.name));
}

/** The VISUALS key a mob template draws with. */
function keyOf(mobId: string): string {
  return visualKeyFor({ kind: 'mob', templateId: mobId } as Entity);
}

/** Every clip name a VISUALS row's ClipMap references. */
function referencedClips(key: string): string[] {
  const clips = VISUALS[key].clips as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const value of Object.values(clips)) {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value))
      out.push(...value.filter((v): v is string => typeof v === 'string'));
    else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) if (typeof v === 'string') out.push(v);
    }
  }
  return out;
}

const ROSTER: Record<string, { glb: string; unique: string[] }> = {
  barnacle_crawler: { glb: 'bastion_crawler.glb', unique: ['Attack2', 'Death', 'Cast'] },
  bastion_warhound: { glb: 'bastion_warhound.glb', unique: ['Leap', 'Land', 'Attack2'] },
  bastion_revenant: { glb: 'drowned_revenant.glb', unique: ['Attack', 'Attack2'] },
  drowned_watchman: { glb: 'drowned_watchman.glb', unique: ['HalberdSweep'] },
  fogbound_arbalest: { glb: 'drowned_arbalest.glb', unique: ['Aim', 'Shoot'] },
  drowned_sergeant: { glb: 'drowned_sergeant.glb', unique: ['Rally'] },
  shackled_prisoner: { glb: 'drowned_prisoner.glb', unique: ['Attack', 'Attack2'] },
  mistweaver: { glb: 'mist_chanter.glb', unique: ['Ward', 'Cast'] },
};

describe('the Sunken Bastion creature roster', () => {
  for (const [mobId, spec] of Object.entries(ROSTER)) {
    it(`${mobId} wears its own Blender body with every clip it plays`, () => {
      expect(MOBS[mobId], mobId).toBeDefined();
      const key = keyOf(mobId);
      const def = VISUALS[key];
      expect(def.url).toBe(`models/creatures/${spec.glb}`);
      // No stock skeleton rig and no borrowed clip donors.
      expect(def.url).not.toMatch(/skeleton|crabenemy|wolf/);
      expect(def.animUrls ?? []).toEqual([]);
      const shipped = glbClips(def.url);
      for (const clip of referencedClips(key))
        expect(shipped.has(clip), `${key} ${clip}`).toBe(true);
      for (const clip of ['Idle', 'Walk', 'Run', 'Hit', 'Death', ...spec.unique]) {
        expect(shipped.has(clip), `${spec.glb} ${clip}`).toBe(true);
      }
    });
  }

  it('stands every creature well past the player', () => {
    const player = VISUALS.player_warrior?.height ?? 2.6;
    for (const mobId of Object.keys(ROSTER)) {
      const def = VISUALS[keyOf(mobId)];
      expect(def.height * (MOBS[mobId].scale ?? 1), mobId).toBeGreaterThan(player * 1.1);
    }
  });

  it('no Bastion trash mob wears a KayKit skeleton any more', () => {
    for (const mobId of [...Object.keys(ROSTER), 'bastion_revenant']) {
      expect(VISUALS[keyOf(mobId)].url).not.toContain('skeleton');
    }
  });
});
