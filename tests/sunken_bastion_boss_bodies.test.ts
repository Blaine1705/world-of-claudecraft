// The Sunken Bastion's first two bosses wear their own sculpted Blender bodies
// (scripts/assets/sunken_bastion_drowned/olen/ and ossick/) instead of the
// KayKit skeletons they shared with other dungeons: every clip their VISUALS
// rows name ships in their GLB, each bar plays its own bar-locked clip, they
// tower over their garrison, and their gameplay is untouched (only the drawn
// height grew).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import { OLEN_STARS_UP } from '../src/render/sunken_bastion/bastion_boss_fx_core';
import { MOBS } from '../src/sim/data';
import { OLEN_OATHBOUND_CHARGE, OLEN_TUNING } from '../src/sim/encounters/sunken_bastion/ids';
import type { Entity } from '../src/sim/types';

function glbJson(url: string): { animations?: { name: string }[]; nodes?: { name?: string }[] } {
  const buf = readFileSync(join('public', url));
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const jsonLength = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
}

function glbClips(url: string): Set<string> {
  return new Set((glbJson(url).animations ?? []).map((a) => a.name));
}

const keyOf = (mobId: string) => visualKeyFor({ kind: 'mob', templateId: mobId } as Entity);
const drawn = (mobId: string) => VISUALS[keyOf(mobId)].height * (MOBS[mobId].scale ?? 1);

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

describe('Knight-Commander Olen', () => {
  const key = keyOf('knight_commander_olen');
  const def = VISUALS[key];

  it('wears his own sculpted body with every clip he plays', () => {
    expect(key).toBe('bastion_olen');
    expect(def.url).toBe('models/creatures/knight_commander_olen.glb');
    expect(def.url).not.toMatch(/skeleton/);
    expect(def.animUrls ?? []).toEqual([]);
    expect(def.attach ?? []).toEqual([]);
    expect(def.tint).toBeUndefined();
    expect(def.authoredAtlas).toBe(true);
    const shipped = glbClips(def.url);
    for (const clip of referencedClips(key)) expect(shipped.has(clip), clip).toBe(true);
    for (const clip of ['Idle', 'CombatIdle', 'Walk', 'Run', 'Attack3', 'OathCharge', 'Stunned'])
      expect(shipped.has(clip), clip).toBe(true);
  });

  it('plays the Oathbound Charge bar-locked: the launch lands on the bar end', () => {
    expect(def.clips.castByAbility?.[OLEN_OATHBOUND_CHARGE]).toBe('OathCharge');
    expect(def.clips.castTimeScaleByAbility?.[OLEN_OATHBOUND_CHARGE]).toBe(1);
    expect(def.castClipSync).toBe(true);
    // OathCharge is authored to the bar's own length and plays at speed 1.
    expect(OLEN_TUNING.chargeCast).toBe(2.5);
    // Breached reels in its own dazed loop.
    expect(def.clips.stunned).toBe('Stunned');
  });

  it('towers over his garrison, gameplay untouched', () => {
    expect(MOBS.knight_commander_olen.scale).toBe(1.2);
    for (const mobId of ['bastion_revenant', 'drowned_sergeant', 'gaol_turnkey'])
      expect(drawn('knight_commander_olen'), mobId).toBeGreaterThan(drawn(mobId));
    // Never smaller than the stand-in he replaced (5.4 at his scale).
    expect(def.height).toBeGreaterThanOrEqual(5.4);
  });

  it("circles Breached's stars round his helm", () => {
    expect(OLEN_STARS_UP).toBeGreaterThan(def.height * 0.75);
    expect(OLEN_STARS_UP).toBeLessThan(def.height * 0.95);
  });
});
