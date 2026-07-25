// The ElevenLabs ability sample pack seam (src/game/ability_sfx_samples.ts):
// per-take normalization math, cached beef-bus saturation curves, strict
// round-robin take selection (no consecutive repeats), and — against the
// shipped pack JSON itself — that every id the router references (release
// families, motif foley, palette impact identities, spec-authored bespoke
// samples, spirit models) actually exists in
// public/audio/sfx/ability_sfx_pack.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AbilitySfxSamples,
  beefCurve,
  MOTIF_SAMPLE,
  normalizeTakeGain,
  RELEASE_FAMILY,
  SPIRIT_VOICE,
} from '../src/game/ability_sfx_samples';
import { ABILITY_VFX_FULL_SPECS } from '../src/render/ability_vfx_full_specs';

const packIds = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(join(__dirname, '../public/audio/sfx/ability_sfx_pack.json'), 'utf8'),
    ) as Record<string, unknown>,
  ),
);

describe('per-take peak normalization (gallery loadPack)', () => {
  it('pulls takes toward the 0.8 target peak', () => {
    expect(normalizeTakeGain(0.8)).toBeCloseTo(1);
    expect(normalizeTakeGain(0.4)).toBeCloseTo(2);
    expect(normalizeTakeGain(1.6)).toBeCloseTo(0.5);
  });

  it('caps boost at 2.5x and never boosts near-silence into noise', () => {
    expect(normalizeTakeGain(0.05)).toBe(2.5);
    expect(normalizeTakeGain(0.01)).toBe(1);
    expect(normalizeTakeGain(0)).toBe(1);
  });
});

describe('beef-bus saturation curves (gallery _beefCurve)', () => {
  it('caches per quantized drive amount', () => {
    expect(beefCurve(0.3)).toBe(beefCurve(0.3));
    expect(beefCurve(0.3)).toBe(beefCurve(0.31)); // same round(amount * 20) bucket
    expect(beefCurve(0.3)).not.toBe(beefCurve(0.45));
  });

  it('is a bounded, endpoint-normalized, monotonic transfer curve', () => {
    const curve = beefCurve(0.45);
    expect(curve).toHaveLength(1024);
    expect(curve[0]).toBeCloseTo(-1, 3);
    expect(curve[1023]).toBeCloseTo(1, 3);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
      expect(Math.abs(curve[i])).toBeLessThanOrEqual(1);
    }
  });
});

describe('round-robin take selection (gallery sample())', () => {
  const fakeBufs = (n: number) =>
    Array.from({ length: n }, (_take, i) => ({ duration: 0.5 + i }) as AudioBuffer);

  it('never plays the same multi-take id twice in a row', () => {
    const samples = new AbilitySfxSamples();
    samples.install('imp_storm', fakeBufs(3), [1, 1.2, 0.9]);
    let previous = samples.pick('imp_storm');
    for (let play = 0; play < 20; play++) {
      const take = samples.pick('imp_storm');
      expect(take).not.toBeNull();
      expect(take?.buf).not.toBe(previous?.buf);
      previous = take;
    }
  });

  it('cycles every take with its own normalization gain', () => {
    const samples = new AbilitySfxSamples();
    const bufs = fakeBufs(3);
    samples.install('rel_fire', bufs, [1, 2, 3]);
    const seen = new Set<number>();
    for (let play = 0; play < 3; play++) {
      const take = samples.pick('rel_fire');
      expect(take).not.toBeNull();
      if (take) {
        expect(take.gain).toBe(bufs.indexOf(take.buf) + 1);
        seen.add(take.gain);
      }
    }
    expect(seen.size).toBe(3);
    expect(samples.loaded).toBe(true);
  });

  it('returns null for ids the pack does not carry', () => {
    const samples = new AbilitySfxSamples();
    expect(samples.pick('imp_missing')).toBeNull();
    expect(samples.loaded).toBe(false);
    expect(samples.state).toBe('idle');
  });
});

describe('the shipped pack covers every routed id', () => {
  it('carries a release recording for all 12 palette families', () => {
    expect(Object.keys(RELEASE_FAMILY)).toHaveLength(12);
    for (const family of Object.values(RELEASE_FAMILY)) {
      expect(packIds.has(`rel_${family}`), `rel_${family}`).toBe(true);
    }
  });

  it('carries an impact identity for all 12 palettes', () => {
    for (const palette of Object.keys(RELEASE_FAMILY)) {
      expect(packIds.has(`imp_${palette}`), `imp_${palette}`).toBe(true);
    }
  });

  it('carries every motif foley recording the router maps to', () => {
    for (const id of Object.values(MOTIF_SAMPLE)) {
      expect(packIds.has(id), id).toBe(true);
    }
  });

  it('carries every spec-authored bespoke impact sample', () => {
    for (const [abilityId, spec] of Object.entries(ABILITY_VFX_FULL_SPECS)) {
      const bespoke = spec.impact?.sample;
      if (bespoke) expect(packIds.has(bespoke), `${abilityId}: ${bespoke}`).toBe(true);
    }
  });

  it('carries a call for every spec-authored spirit model (spider stays mute)', () => {
    // 'spider' is the one authored model without a recording — it degrades
    // silently by design; anything else missing is a routing regression.
    const knownMute = new Set(['spider']);
    for (const [abilityId, spec] of Object.entries(ABILITY_VFX_FULL_SPECS)) {
      const model = spec.spirit?.model;
      if (model && !knownMute.has(model)) {
        expect(packIds.has(`spirit_${model}`), `${abilityId}: spirit_${model}`).toBe(true);
      }
    }
  });

  it('carries the shout, dash, portal, poof, whoosh, heal, and buff ids', () => {
    for (const id of [
      'shout_war',
      'dash',
      'portal',
      'poof',
      'whoosh_blade',
      'whoosh_heavy',
      'heal_holy',
      'heal_nature',
      'buff_raise',
      'buff_morph',
      'buff_veil',
    ]) {
      expect(packIds.has(id), id).toBe(true);
    }
  });

  it('mixes every spirit voice at a sane level', () => {
    for (const [model, [gain]] of Object.entries(SPIRIT_VOICE)) {
      expect(gain, model).toBeGreaterThan(0);
      expect(gain, model).toBeLessThanOrEqual(1);
    }
  });
});
