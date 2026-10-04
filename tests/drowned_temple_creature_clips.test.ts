// The Drowned Temple's sixth-pass bodies (src/render/characters/manifest.ts):
// Ysolei is the Codex-built serpent, every one of her clips riding a real
// mechanic; the Lagoon Eel ships its Spit clip for Lightning Spit; the
// Colossus walks on its own gait. Each row names its clips so a new body is a
// manifest swap.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { VISUALS, visualKeyFor } from '../src/render/characters/manifest';
import {
  isTemplePilgrimFrenzyCue,
  TEMPLE_PILGRIM_FRENZY_GESTURE,
} from '../src/render/drowned_temple/temple_fx_core';
import { MOBS } from '../src/sim/data';
import {
  YSOLEI_CALL,
  YSOLEI_LUNAR_TIDE,
  YSOLEI_UNDERTOW,
  YSOLEI_WRATH,
} from '../src/sim/encounters/drowned_temple';
import { updateBossMechanics } from '../src/sim/mob/boss_mechanics';
import {
  TEMPLE_CALL_THE_TIDE,
  TEMPLE_LIGHTNING_SPIT,
  TEMPLE_LULLABY,
  TEMPLE_PALE_MENDING,
  TEMPLE_SKEWERING_TRIDENT,
  TEMPLE_STATIC_COIL,
  TEMPLE_TRIDENT_SWEEP,
} from '../src/sim/mob/trash_kit/temple_cast_ids';

function clipsOf(path: string): string[] {
  const buf = readFileSync(path);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8')) as {
    animations?: { name: string }[];
  };
  return (json.animations ?? []).map((a) => a.name);
}

function visualOf(templateId: string) {
  return VISUALS[visualKeyFor({ kind: 'mob', templateId } as never)];
}

describe('Ysolei: the Codex serpent on every mechanic', () => {
  it('ships its ten original clips', () => {
    expect(clipsOf('public/models/creatures/temple_ysolei.glb').sort()).toEqual(
      [
        'Bite',
        'Death',
        'Enrage',
        'Hit',
        'Idle',
        'Lunar_Tide',
        'Rise',
        'Summon',
        'Tail_Sweep',
        'Undertow',
      ].sort(),
    );
  });

  it('maps each cast bar to its clip at its authored pace, and keeps her materials', () => {
    const v = visualOf('ysolei');
    const c = v.clips;
    expect(c.castByAbility?.[YSOLEI_LUNAR_TIDE]).toBe('Lunar_Tide');
    expect(c.castByAbility?.[YSOLEI_UNDERTOW]).toBe('Undertow');
    expect(c.castByAbility?.[YSOLEI_CALL]).toBe('Summon');
    expect(c.castByAbility?.[YSOLEI_WRATH]).toBe('Enrage');
    // The Undertow's 3 s channel must never be shortened by a time scale.
    expect(c.castTimeScaleByAbility?.[YSOLEI_UNDERTOW]).toBe(1);
    expect(c.attack).toEqual(['Bite', 'Tail_Sweep']);
    expect(c.flourish).toBe('Rise');
    expect(c.death).toBe('Death');
    expect(v.authoredAtlas).toBe(true);
    expect(v.tint).toBeUndefined();
    // Drawn at native scale: about 24 world units, seven players to her head.
    expect(v.height * (MOBS.ysolei.scale ?? 1)).toBeCloseTo(23.97, 1);
  });
});

describe('the Lagoon Eel and the Colossus', () => {
  it('the eel spits its Lightning Spit on its own clip, and coils for Static Coil', () => {
    expect(clipsOf('public/models/creatures/temple_eel.glb')).toEqual(
      expect.arrayContaining(['Idle', 'Walk', 'Run', 'Coil', 'Spit']),
    );
    const c = visualOf('lagoon_eel').clips;
    expect(c.castByAbility?.[TEMPLE_LIGHTNING_SPIT]).toBe('Spit');
    expect(c.castByAbility?.[TEMPLE_STATIC_COIL]).toBe('Coil');
  });

  it('the walking Colossus is drawn at its old size under its larger reach', () => {
    const v = visualOf('tideglass_colossus');
    expect(clipsOf('public/models/creatures/temple_colossus.glb')).toEqual(
      expect.arrayContaining(['Walk', 'Run']),
    );
    expect(v.clips.walk).toBe('Walk');
    expect(v.height * (MOBS.tideglass_colossus.scale ?? 1)).toBeCloseTo(15, 3);
  });
});

describe('the Tide Pilgrim: the sacred sea snail', () => {
  it('ships its own body with a clip for every job', () => {
    expect(clipsOf('public/models/creatures/temple_pilgrim.glb').sort()).toEqual(
      ['Attack', 'Attack2', 'Cast', 'Death', 'Frenzy', 'Hit', 'Idle', 'Run', 'Walk'].sort(),
    );
    const v = visualOf('drowned_pilgrim');
    expect(v.url).toMatch(/temple_pilgrim\.glb$/);
    expect(v.clips.attack).toEqual(['Attack', 'Attack2']);
    expect(v.clips.death).toBe('Death');
    expect(v.authoredAtlas).toBe(true);
    // Drawn about 4.65 tall to the shrine at its 0.95: well over the 2.6 player.
    expect(v.height * (MOBS.drowned_pilgrim.scale ?? 1)).toBeCloseTo(4.66, 1);
  });

  it('plays its Frenzy off the enrage cue, and no swing cuts it short', () => {
    const v = visualOf('drowned_pilgrim');
    expect(v.clips.attackByAbility?.[TEMPLE_PILGRIM_FRENZY_GESTURE]).toBe('Frenzy');
    expect(v.oneShotsHoldAttacks).toContain('Frenzy');
    expect(MOBS.drowned_pilgrim.enrage).toBeDefined();
    const nova = { type: 'spellfx', sourceId: 7, targetId: 7, school: 'fire', fx: 'nova' };
    expect(isTemplePilgrimFrenzyCue(nova, 'drowned_pilgrim')).toBe(true);
    expect(isTemplePilgrimFrenzyCue({ ...nova, school: 'nature' }, 'drowned_pilgrim')).toBe(false);
    expect(isTemplePilgrimFrenzyCue(nova, 'drowned_templeguard')).toBe(false);
    expect(isTemplePilgrimFrenzyCue(nova, undefined)).toBe(false);
    expect(isTemplePilgrimFrenzyCue({ ...nova, targetId: 8 }, 'drowned_pilgrim')).toBe(false);
    expect(isTemplePilgrimFrenzyCue({ ...nova, fx: 'projectile' }, 'drowned_pilgrim')).toBe(false);
    expect(isTemplePilgrimFrenzyCue({ ...nova, ability: 'x' }, 'drowned_pilgrim')).toBe(false);
    expect(isTemplePilgrimFrenzyCue({ ...nova, type: 'aura' }, 'drowned_pilgrim')).toBe(false);
  });
});

describe('the Nacre Templeguard: the seahorse temple knight', () => {
  it('ships its own body with a clip for every job', () => {
    expect(clipsOf('public/models/creatures/temple_templeguard.glb').sort()).toEqual(
      [
        'Attack',
        'Attack2',
        'Cast',
        'CombatIdle',
        'Death',
        'Hit',
        'Hurl',
        'Idle',
        'Run',
        'TridentSweep',
        'Walk',
      ].sort(),
    );
    const v = visualOf('drowned_templeguard');
    expect(v.url).toMatch(/temple_templeguard\.glb$/);
    expect(v.clips.attack).toEqual(['Attack', 'Attack2']);
    expect(v.clips.combatIdle).toBe('CombatIdle');
    expect(v.clips.death).toBe('Death');
    expect(v.authoredAtlas).toBe(true);
    // Drawn 5.5 to the crest at its 1.1: a little over twice the 2.6 player.
    expect(v.height * (MOBS.drowned_templeguard.scale ?? 1)).toBeCloseTo(5.5, 2);
  });

  it('strikes each cast on its bar end: the sweep and the hurled trident', () => {
    const c = visualOf('drowned_templeguard').clips;
    expect(c.castByAbility?.[TEMPLE_TRIDENT_SWEEP]).toBe('TridentSweep');
    expect(c.castByAbility?.[TEMPLE_SKEWERING_TRIDENT]).toBe('Hurl');
    // Authored to the sim's bars (1.5 s and 1.8 s): played at their own pace,
    // held to the bar and finished as one-shots after it.
    expect(c.castTimeScaleByAbility?.[TEMPLE_TRIDENT_SWEEP]).toBe(1);
    expect(c.castTimeScaleByAbility?.[TEMPLE_SKEWERING_TRIDENT]).toBe(1);
    expect(c.castPlayOut).toEqual(expect.arrayContaining(['TridentSweep', 'Hurl']));
    expect(MOBS.drowned_templeguard.breathCone?.castTime).toBe(1.5);
    expect(MOBS.drowned_templeguard.trashKit?.line?.castTime).toBe(1.8);
    const v = visualOf('drowned_templeguard');
    expect(v.castClipSync).toBe(true);
    // A mob's Onrush is plain fast movement (no cast event), so it runs on Run:
    // the warrior-only rush slots must stay unmapped or they would swallow it.
    expect(c.rush).toBeUndefined();
    expect(c.rushArrival).toBeUndefined();
  });
});

describe('the Pale Choir Acolyte: the moon-jelly priestess', () => {
  it('ships its own body with a clip for every job', () => {
    expect(clipsOf('public/models/creatures/temple_acolyte.glb').sort()).toEqual(
      [
        'Attack',
        'Attack2',
        'Cast',
        'Death',
        'Hit',
        'Idle',
        'Lullaby',
        'Mend',
        'Run',
        'Walk',
      ].sort(),
    );
    const v = visualOf('pale_choir_acolyte');
    expect(v.url).toMatch(/temple_acolyte\.glb$/);
    expect(v.clips.attack).toEqual(['Attack', 'Attack2']);
    expect(v.clips.death).toBe('Death');
    expect(v.authoredAtlas).toBe(true);
    // Drawn 5.2 to the bell's crown at her 1.0: twice the 2.6 player.
    expect(v.height * (MOBS.pale_choir_acolyte.scale ?? 1)).toBeCloseTo(5.2, 2);
  });

  it('throws the Pale Hymn on the windup and sings each cast on its bar', () => {
    const v = visualOf('pale_choir_acolyte');
    const c = v.clips;
    // The Pale Hymn's windup cue plays the attack clips; authored to release
    // at the windup's end, so they play at their own pace.
    expect(MOBS.pale_choir_acolyte.petSpell?.windup).toBe(0.6);
    expect(v.attackTimeScale).toBe(1);
    expect(c.castByAbility?.[TEMPLE_LULLABY]).toBe('Lullaby');
    expect(c.castByAbility?.[TEMPLE_PALE_MENDING]).toBe('Mend');
    expect(c.castTimeScaleByAbility?.[TEMPLE_LULLABY]).toBe(1);
    expect(c.castTimeScaleByAbility?.[TEMPLE_PALE_MENDING]).toBe(1);
    expect(MOBS.pale_choir_acolyte.trashKit?.lullaby?.castTime).toBe(2);
    expect(MOBS.pale_choir_acolyte.trashKit?.mend?.castTime).toBe(2.5);
    expect(v.castClipSync).toBe(true);
    // Kickable hymns: no play-out, so an interrupted song never plays to its end.
    expect(c.castPlayOut ?? []).not.toContain('Lullaby');
    expect(c.castPlayOut ?? []).not.toContain('Mend');
  });
});

describe('the Moonlit Siren: the priestess on her waterspout', () => {
  it('ships its own body with a clip for every job', () => {
    expect(clipsOf('public/models/creatures/temple_siren.glb').sort()).toEqual(
      ['Attack', 'Attack2', 'Cast', 'Death', 'Hit', 'Idle', 'Run', 'Sing', 'Walk'].sort(),
    );
    const v = visualOf('moonlit_siren');
    expect(v.url).toMatch(/temple_siren\.glb$/);
    expect(v.clips.attack).toEqual(['Attack', 'Attack2']);
    expect(v.clips.death).toBe('Death');
    expect(v.authoredAtlas).toBe(true);
    // Drawn 6.0 at her 1.0: 2.3 times the 2.6 player.
    expect(v.height * (MOBS.moonlit_siren.scale ?? 1)).toBeCloseTo(6.0, 2);
  });

  it('lashes on the windup and sings Call the Tide on its bar', () => {
    const v = visualOf('moonlit_siren');
    const c = v.clips;
    // Brine Lash's windup cue plays the attack clips, authored to release at
    // the windup's end, so they play at their own pace.
    expect(MOBS.moonlit_siren.petSpell?.windup).toBe(0.6);
    expect(v.attackTimeScale).toBe(1);
    expect(c.castByAbility?.[TEMPLE_CALL_THE_TIDE]).toBe('Sing');
    expect(c.castTimeScaleByAbility?.[TEMPLE_CALL_THE_TIDE]).toBe(1);
    expect(MOBS.moonlit_siren.trashKit?.call?.castTime).toBe(2.5);
    expect(v.castClipSync).toBe(true);
    // A kicked song never plays to its end.
    expect(c.castPlayOut ?? []).not.toContain('Sing');
  });
});

describe('the pilgrim frenzy cue rides the real enrage', () => {
  it('the nova the sim emits when a pilgrim drops under 30 percent is the cue', () => {
    const events: Array<Record<string, unknown>> = [];
    const ctx = {
      emit: (ev: Record<string, unknown>) => events.push(ev),
      delveRunForMob: () => null,
    };
    const mob = {
      id: 41,
      templateId: 'drowned_pilgrim',
      name: 'Drowned Pilgrim',
      kind: 'mob',
      dead: false,
      enraged: false,
      hp: 25,
      maxHp: 100,
    };
    updateBossMechanics(ctx as never, mob as never);
    expect(mob.enraged).toBe(true);
    const novas = events.filter((ev) => ev.type === 'spellfx' && ev.fx === 'nova');
    expect(novas).toHaveLength(1);
    expect(isTemplePilgrimFrenzyCue(novas[0] as never, 'drowned_pilgrim')).toBe(true);
  });

  it('the temple claims the cue and the dungeon visuals pass the claim on', () => {
    const fx = readFileSync('src/render/drowned_temple/temple_fx.ts', 'utf8');
    expect(fx).toContain('this.playGesture(ev.sourceId, TEMPLE_PILGRIM_FRENZY_GESTURE)');
    const zone = readFileSync('src/render/rift_death_zone.ts', 'utf8');
    expect(zone).toContain('new TempleFx(scene, groundY, world, compileGate, playGesture)');
    expect(zone).toMatch(/const temple = this\.templeFx\.handleEvent\(event\)/);
    expect(zone).toMatch(/\|\| temple \|\|/);
  });
});
