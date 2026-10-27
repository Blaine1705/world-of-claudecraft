// The Guardian of the Heat's sounds (src/game/smith_heart_heat_audio_core.ts
// and its adapter smith_heart_heat_audio.ts): every sample it plays ships in
// the manifest (the pack's own: no take of the fight's yet), every cue has a
// sound and the HUD's generic nova or beam never doubles one, a cue's layers
// play at their body or their point, Basalt Fist's charge is fitted to its
// bar once per bar, a Wakefire band's build rises at its place, and a mark
// sounds once in the local player's ear when it lands on them.

import { describe, expect, it } from 'vitest';
import { SFX_CLIPS } from '../src/game/sfx_manifest.generated';
import { HeatAudio, type HeatAudioSink } from '../src/game/smith_heart_heat_audio';
import {
  HEAT_BAR_SOUNDS,
  HEAT_CUE_SOUNDS,
  HEAT_MARK_SOUNDS,
  HEAT_SFX_KEYS,
  HEAT_ZONE_BUILD_SOUND,
  heatBarRate,
  heatSoundClaims,
} from '../src/game/smith_heart_heat_audio_core';
import { HEAT_AURAS, HEAT_CASTS, HEAT_CUES } from '../src/sim/encounters/smith_heart/heat_ids';
import type { Entity, SimEvent } from '../src/sim/types';
import { spellFxCue } from '../src/ui/combat_sfx';

function fakeSink() {
  const plays: { key: string; x: number; y: number; z: number; rate?: number }[] = [];
  const preloaded: string[] = [];
  const sink: HeatAudioSink = {
    playAt: (key, x, y, z, o) => {
      plays.push({ key, x, y, z, rate: o?.rate });
      return true;
    },
    preload: (key) => {
      preloaded.push(key);
    },
  };
  return { sink, plays, preloaded };
}

const body = (id: number, x: number, z: number, extra: Partial<Entity> = {}) =>
  ({
    id,
    pos: { x, y: 0, z },
    dead: false,
    castingAbility: null,
    castTotal: 0,
    auras: [],
    ...extra,
  }) as unknown as Entity;

describe('smith_heart_heat_audio', () => {
  it('ships every sample it plays, gives every cue a sound, and claims exactly its own', () => {
    for (const key of HEAT_SFX_KEYS)
      expect(Object.hasOwn(SFX_CLIPS, key), `${key} in the manifest`).toBe(true);
    for (const cue of Object.values(HEAT_CUES)) {
      expect(heatSoundClaims(cue), cue).toBe(true);
      expect(HEAT_CUE_SOUNDS[cue].length, cue).toBeGreaterThan(0);
    }
    // Nothing but the fight's cues.
    expect(Object.keys(HEAT_CUE_SOUNDS).sort()).toEqual(Object.values(HEAT_CUES).sort());
    expect(heatSoundClaims('flamestrike')).toBe(false);
    expect(heatSoundClaims(undefined)).toBe(false);
    // The fist lands with weight: layered.
    expect(HEAT_CUE_SOUNDS[HEAT_CUES.fist].length).toBeGreaterThanOrEqual(3);
    // The repeating small cues stay soft (they fire every few seconds).
    for (const cue of [HEAT_CUES.bolt, HEAT_CUES.river])
      for (const s of HEAT_CUE_SOUNDS[cue]) expect(s.gain, cue).toBeLessThanOrEqual(0.5);
  });

  it('the HUD never plays its generic sound over a heat cue', () => {
    const ev = (ability: string, fx: 'nova' | 'beam') =>
      spellFxCue({
        type: 'spellfx',
        sourceId: 1,
        targetId: 2,
        school: 'fire',
        fx,
        ability,
      } as Extract<SimEvent, { type: 'spellfx' }>);
    for (const cue of Object.values(HEAT_CUES)) {
      expect(ev(cue, 'nova'), cue).toBeNull();
      expect(ev(cue, 'beam'), cue).toBeNull();
    }
  });

  it("plays a cue's layers at its target, its source or its point", () => {
    const { sink, plays, preloaded } = fakeSink();
    const audio = new HeatAudio(sink);
    const ents = new Map([
      [1, body(1, 10, 20)],
      [2, body(2, -5, 7)],
    ]);
    const of = (id: number) => ents.get(id);
    const ground = () => 3;
    const fx = (ability: string) =>
      ({
        type: 'spellfx',
        sourceId: 1,
        targetId: 2,
        school: 'fire',
        fx: 'beam',
        ability,
      }) as SimEvent;
    // Hearth Flare: the bolt and its impact at the struck player.
    expect(audio.event(fx(HEAT_CUES.flare), of, ground)).toBe(true);
    expect(plays).toHaveLength(HEAT_CUE_SOUNDS[HEAT_CUES.flare].length);
    for (const p of plays) expect(p).toMatchObject({ x: -5, z: 7 });
    // The sink at the guardian (the source).
    plays.length = 0;
    expect(audio.event(fx(HEAT_CUES.sink), of, ground)).toBe(true);
    for (const p of plays) expect(p).toMatchObject({ x: 10, z: 20 });
    // The fist at its point, a yard over the floor.
    plays.length = 0;
    const at = {
      type: 'spellfxAt',
      x: 4,
      z: 6,
      school: 'fire',
      fx: 'burst',
      ability: HEAT_CUES.fist,
    } as unknown as SimEvent;
    expect(audio.event(at, of, ground)).toBe(true);
    expect(plays[0]).toMatchObject({
      key: HEAT_CUE_SOUNDS[HEAT_CUES.fist][0].key,
      x: 4,
      y: 4,
      z: 6,
    });
    expect(audio.event(fx('fireball'), of, ground)).toBe(false);
    expect([...preloaded].sort()).toEqual([...HEAT_SFX_KEYS].sort());
    // A Wakefire band beginning to build.
    audio.zoneBuild(1, 0, 2);
    expect(plays[plays.length - 1]).toMatchObject({ key: HEAT_ZONE_BUILD_SOUND.key, x: 1, z: 2 });
  });

  it("fits Basalt Fist's charge to its bar, once per bar", () => {
    const sound = HEAT_BAR_SOUNDS[HEAT_CASTS.fist];
    expect(heatBarRate(sound, sound.seconds)).toBe(1);
    expect(heatBarRate(sound, 100)).toBe(0.85);
    expect(heatBarRate(sound, 0.1)).toBe(1.2);
    expect(heatBarRate(sound, 0)).toBe(1);
    const { sink, plays } = fakeSink();
    const audio = new HeatAudio(sink);
    const g = body(9, 0, 0, { castingAbility: HEAT_CASTS.fist, castTotal: 3 });
    audio.update(g, null);
    audio.update(g, null);
    expect(plays.filter((p) => p.key === sound.key)).toHaveLength(1);
    expect(plays[0].rate).toBeCloseTo(heatBarRate(sound, 3), 9);
    // The bar ends, then a new one: its charge again; a dead guardian is silent.
    audio.update(body(9, 0, 0), null);
    audio.update(g, null);
    expect(plays.filter((p) => p.key === sound.key)).toHaveLength(2);
    audio.update(body(9, 0, 0), null);
    audio.update(
      body(9, 0, 0, { castingAbility: HEAT_CASTS.fist, castTotal: 3, dead: true }),
      null,
    );
    expect(plays.filter((p) => p.key === sound.key)).toHaveLength(2);
  });

  it('sounds a mark once in my ear as it lands on me, again only after it leaves', () => {
    const { sink, plays } = fakeSink();
    const audio = new HeatAudio(sink);
    const marked = (...ids: string[]) =>
      body(1, 2, 3, { auras: ids.map((id) => ({ id })) as unknown as Entity['auras'] });
    const kindling = HEAT_MARK_SOUNDS[HEAT_AURAS.kindling];
    const hunted = HEAT_MARK_SOUNDS[HEAT_AURAS.hunted];
    audio.update(null, marked());
    audio.update(null, marked(HEAT_AURAS.kindling));
    audio.update(null, marked(HEAT_AURAS.kindling));
    expect(plays.filter((p) => p.key === kindling.key)).toHaveLength(1);
    expect(plays[0]).toMatchObject({ x: 2, z: 3 });
    audio.update(null, marked(HEAT_AURAS.kindling, HEAT_AURAS.hunted));
    expect(plays.filter((p) => p.key === hunted.key)).toHaveLength(1);
    audio.update(null, marked());
    audio.update(null, marked(HEAT_AURAS.kindling));
    expect(plays.filter((p) => p.key === kindling.key)).toHaveLength(2);
    // Someone else's marks are never mine: a dead player hears nothing new.
    audio.update(null, marked());
    audio.update(
      null,
      body(1, 2, 3, {
        dead: true,
        auras: [{ id: HEAT_AURAS.hunted }] as unknown as Entity['auras'],
      }),
    );
    expect(plays.filter((p) => p.key === hunted.key)).toHaveLength(1);
  });
});
