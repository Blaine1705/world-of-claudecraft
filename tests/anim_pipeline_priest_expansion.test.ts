// Priest expansion batch of the large-scale animation authoring initiative
// (issue #2889): priest ability-specific spellcasts (expanding beyond the
// single pre-existing renew override) + the choir thrall family's bespoke
// attack. Both clips are authored by pose-sample-and-blend
// (scripts/anim/pose_blend.mjs, scripts/build_priest_ability_anims.mjs,
// scripts/build_choir_thrall_anims.mjs), the same technique documented in
// .claude/skills/blender-anim-pipeline/SKILL.md. Follows the shipped-GLB-
// plus-manifest-source contract test pattern (tests/anim_pipeline_batch1.test.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';

const ROOT = join(__dirname, '..');

function clipNamesOf(glbPath: string): string[] {
  const glb = readFileSync(join(ROOT, glbPath));
  const jsonLen = glb.readUInt32LE(12);
  const doc = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  return (doc.animations ?? []).map((a: { name?: string }) => a.name);
}

function meshCountOf(glbPath: string): number {
  const glb = readFileSync(join(ROOT, glbPath));
  const jsonLen = glb.readUInt32LE(12);
  const doc = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  return (doc.meshes ?? []).length;
}

const MANIFEST_SRC = readFileSync(join(ROOT, 'src/render/characters/manifest.ts'), 'utf8');

function manifestBlock(startAnchor: string, endAnchor: string): string {
  const start = MANIFEST_SRC.indexOf(startAnchor);
  expect(start, startAnchor).toBeGreaterThanOrEqual(0);
  const end = MANIFEST_SRC.indexOf(endAnchor, start);
  expect(end, `${startAnchor} .. ${endAnchor}`).toBeGreaterThan(start);
  return MANIFEST_SRC.slice(start, end);
}

describe('priest ability-specific spellcasts (issue #2889 priest expansion)', () => {
  const PRIEST_CAST_CLIPS = [
    'Cast_Heal',
    'Cast_FlashHeal',
    'Cast_Ward',
    'Cast_Smite',
    'Cast_ShadowWord',
    'Cast_MindBlast',
    'Cast_MindFlay',
  ];

  it('ships all 7 cast clips in a mesh-free donor GLB', () => {
    const glbPath = 'public/models/chars/players/priest_ability_anims.glb';
    expect(clipNamesOf(glbPath).sort()).toEqual([...PRIEST_CAST_CLIPS].sort());
    expect(meshCountOf(glbPath)).toBe(0);
  });

  it('wires the donor GLB and keeps the pre-existing renew override untouched', () => {
    const block = manifestBlock('player_priest: {', 'player_shaman: {');
    expect(block).toContain('priest_ability_anims.glb');
    expect(block).toContain('attackByAbility');
    // The pre-existing single override from before this batch, a raw donor
    // clip with no baking: must survive untouched.
    expect(block).toContain("renew: 'Spellcast_Raise'");
    for (const clip of PRIEST_CAST_CLIPS) expect(block).toContain(`'${clip}'`);
  });

  it('every mapped ability id is a real priest ability, and every referenced clip is shipped or the pre-existing raw donor', () => {
    const priestBlock = manifestBlock('player_priest: {', 'player_shaman: {');
    const abilityStart = priestBlock.indexOf('attackByAbility: {');
    expect(abilityStart).toBeGreaterThanOrEqual(0);
    const abilityEnd = priestBlock.indexOf('\n      },', abilityStart);
    expect(abilityEnd).toBeGreaterThan(abilityStart);
    const block = priestBlock.slice(abilityStart, abilityEnd);
    const rows = [...block.matchAll(/^\s*([a-z_]+): '([A-Za-z_]+)',$/gm)];
    // renew + all 9 remaining kit abilities (lesser_heal, heal, flash_heal,
    // power_word_fortitude, power_word_shield, smite, shadow_word_pain,
    // mind_blast, mind_flay): full coverage of the priest's 10-ability kit.
    expect(rows.length).toBe(10);
    const knownClips = [...PRIEST_CAST_CLIPS, 'Spellcast_Raise'];
    for (const [, abilityId, clip] of rows) {
      expect(
        ABILITIES[abilityId],
        `attackByAbility key '${abilityId}' is not a real ability id`,
      ).toBeTruthy();
      expect(
        knownClips,
        `attackByAbility value '${clip}' for '${abilityId}' is not a shipped clip`,
      ).toContain(clip);
    }
    const map = Object.fromEntries(rows.map(([, id, clip]) => [id, clip]));
    // Holy heal/buff side: the gentle, sustained offering reads (motion
    // quality, not just donor pose, distinguishes them from the shadow side).
    expect(map.lesser_heal).toBe('Cast_Heal');
    expect(map.heal).toBe('Cast_Heal');
    expect(map.flash_heal).toBe('Cast_FlashHeal');
    expect(map.power_word_fortitude).toBe('Cast_Ward');
    expect(map.power_word_shield).toBe('Cast_Ward');
    // Holy damage: aimed, more decisive than a heal, still not a strike.
    expect(map.smite).toBe('Cast_Smite');
    // Shadow side: sharper, more clinical.
    expect(map.shadow_word_pain).toBe('Cast_ShadowWord');
    expect(map.mind_blast).toBe('Cast_MindBlast');
    expect(map.mind_flay).toBe('Cast_MindFlay');
    // Pre-existing entry from before this batch, untouched.
    expect(map.renew).toBe('Spellcast_Raise');
  });
});

describe('choir thrall family bespoke attack (issue #2889 priest expansion)', () => {
  it('ships ChoirThrall_Attack in a mesh-free donor GLB', () => {
    const glbPath = 'public/models/creatures/choir_thrall_ability_anims.glb';
    expect(clipNamesOf(glbPath)).toEqual(['ChoirThrall_Attack']);
    expect(meshCountOf(glbPath)).toBe(0);
  });

  it('gives mob_choir_thrall its own ClipMap instead of mutating the shared FLOATING constant', () => {
    const choirBlock = manifestBlock('mob_choir_thrall: {', 'mob_tolling_bell: {');
    expect(choirBlock).toContain('choir_thrall_ability_anims.glb');
    expect(choirBlock).toContain('clips: CHOIR_THRALL_FLOATING');
    expect(choirBlock).not.toContain('clips: FLOATING,');

    // FLOATING itself (the constant definition, not a VisualDef using it) must
    // still read the original shared attack: every other family sharing it by
    // reference, including mob_ghost (the same physical rig file), is
    // untouched by this change.
    const floatingConstBlock = manifestBlock('const FLOATING: ClipMap = {', '};');
    expect(floatingConstBlock).toContain("attack: ['Headbutt', 'Punch']");

    // mob_ghost shares ghost.glb with mob_choir_thrall but is claimed by a
    // separate batch of this same initiative: still on the shared constant
    // here, not this batch's new one.
    const ghostBlock = manifestBlock('mob_ghost: {', 'mob_glimmerwisp: {');
    expect(ghostBlock).toContain('clips: FLOATING,');
    expect(ghostBlock).not.toContain('CHOIR_THRALL_FLOATING');
  });
});
