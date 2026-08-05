// Warrior/kobold batch of the large-scale animation authoring initiative
// (issue #2889): a bespoke warrior movement clip (Heroic Leap) plus six more
// attackByAbility entries added to the class's existing extensive coverage,
// each verified to actually reach CharacterVisual.playAttack at runtime (see
// scripts/build_warrior_ability_anims.mjs's header for the render-dispatch
// trace: whirlwind/bladestorm/storm_bolt/the six castFx:'shout' abilities are
// deliberately left out because no attackByAbility entry for them is ever
// read), plus the kobold family's own attack clip off the ENEMY7-sharing
// goblin.glb. Authored by pose-sample-and-blend (scripts/anim/pose_blend.mjs,
// scripts/build_warrior_ability_anims.mjs, scripts/build_kobold_anims.mjs),
// the same technique documented in
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

describe('warrior bespoke movement clip (issue #2889 warrior/kobold batch)', () => {
  const WARRIOR_NEW_CLIPS = ['Warrior_Heroic_Leap'];

  it('ships the new clip in a mesh-free donor GLB', () => {
    const glbPath = 'public/models/chars/players/warrior_ability_anims.glb';
    expect(clipNamesOf(glbPath)).toEqual(WARRIOR_NEW_CLIPS);
    expect(meshCountOf(glbPath)).toBe(0);
  });

  it('wires the donor GLB into animUrls and keeps every pre-existing attackByAbility entry', () => {
    const block = manifestBlock('player_warrior: {', 'player_paladin: {');
    expect(block).toContain('warrior_ability_anims.glb');
    expect(block).toContain('attackByAbility');
    for (const clip of WARRIOR_NEW_CLIPS) expect(block).toContain(`'${clip}'`);
    // Pre-existing entries from earlier PRs must survive this change untouched.
    const preExisting = [
      'mortal_strike',
      'execute',
      'slam',
      'red_harvest',
      'breachmaker',
      'shield_slam',
      'raging_gale',
      'bloodthirst',
      'cleave',
      'revenge',
      'thunder_clap',
      'faultline',
      'heroic_strike',
      'overpower',
      'hamstring',
      'sanguine_aura',
      'raised_guard',
      'pummel',
    ];
    for (const id of preExisting) expect(block).toContain(`${id}:`);
  });

  it('every mapped ability id is a real warrior ability, and every referenced clip is a shipped or pre-existing donor', () => {
    const warriorBlock = manifestBlock('player_warrior: {', 'player_paladin: {');
    const abilityStart = warriorBlock.indexOf('attackByAbility: {');
    expect(abilityStart).toBeGreaterThanOrEqual(0);
    const abilityEnd = warriorBlock.indexOf('\n      },', abilityStart);
    expect(abilityEnd).toBeGreaterThan(abilityStart);
    const block = warriorBlock.slice(abilityStart, abilityEnd);
    const rows = [...block.matchAll(/^\s*([a-z_]+): '([A-Za-z_0-9]+)',$/gm)];
    expect(rows.length).toBeGreaterThan(23); // 18 pre-existing + this batch's 7 additions
    const knightClips = new Set([
      // stock KayKit clips already shipped in knight.glb
      '1H_Melee_Attack_Chop',
      '1H_Melee_Attack_Slice_Diagonal',
      '2H_Melee_Attack_Chop',
      'Dualwield_Melee_Attack_Chop',
      '1H_Melee_Attack_Slice_Horizontal',
      'Shield_Bash',
      'Spellcast_Raise',
      'Block',
      'Punch_A',
      'Cheer',
      // this batch's new bake
      ...WARRIOR_NEW_CLIPS,
    ]);
    const map: Record<string, string> = {};
    for (const [, abilityId, clip] of rows) {
      map[abilityId] = clip;
      expect(
        ABILITIES[abilityId],
        `attackByAbility key '${abilityId}' is not a real ability id`,
      ).toBeTruthy();
      expect(
        knightClips,
        `attackByAbility value '${clip}' for '${abilityId}' is not a shipped or pre-existing donor clip`,
      ).toContain(clip);
    }
    // This batch's real additions, spot-checked: every one verified to
    // actually reach playAttack (see the build script's header trace).
    expect(map.heroic_leap).toBe('Warrior_Heroic_Leap');
    expect(map.victory_rush).toBe('1H_Melee_Attack_Slice_Diagonal');
    expect(map.berserker_rage).toBe('Cheer');
    expect(map.recklessness).toBe('Cheer');
    expect(map.die_by_sword).toBe('Block');
    expect(map.avatar).toBe('Spellcast_Raise');
    expect(map.piercing_howl).toBe('Spellcast_Raise');
    // The dead-code traps this batch deliberately avoided: none of these got
    // an entry, because no attackByAbility lookup for them is ever reached.
    for (const deadId of [
      'whirlwind',
      'bladestorm',
      'storm_bolt',
      'battle_shout',
      'demoralizing_shout',
      'emboldening_roar',
      'defiant_bellow',
      'rallying_cry',
      'intimidating_shout',
    ]) {
      expect(map[deadId], `${deadId} must stay unmapped (never reaches attackByAbility)`).toBe(
        undefined,
      );
    }
  });
});

describe('kobold family bespoke attack (issue #2889 warrior/kobold batch)', () => {
  it('ships Kobold_Pounce in a mesh-free donor GLB', () => {
    const glbPath = 'public/models/creatures/kobold_ability_anims.glb';
    expect(clipNamesOf(glbPath)).toEqual(['Kobold_Pounce']);
    expect(meshCountOf(glbPath)).toBe(0);
  });

  it('gives mob_kobold its own ClipMap instead of mutating the shared ENEMY7 constant', () => {
    const kobold = manifestBlock('mob_kobold: {', 'mob_grubjaw: {');
    expect(kobold).toContain('kobold_ability_anims.glb');
    expect(kobold).toContain('clips: KOBOLD_ENEMY7');
    expect(kobold).not.toContain('clips: ENEMY7,');

    // ENEMY7 itself (the constant definition, not a VisualDef using it) must
    // still read the original shared attack: mob_ogre, on a completely
    // different rig (giant.glb), sharing the SAME constant by reference,
    // must be untouched by this change.
    const enemy7ConstBlock = manifestBlock('const ENEMY7: ClipMap = {', '};');
    expect(enemy7ConstBlock).toContain("attack: ['Attack']");

    const ogreBlock = manifestBlock('mob_ogre: {', '};');
    expect(ogreBlock).toContain('clips: ENEMY7,');
  });
});
