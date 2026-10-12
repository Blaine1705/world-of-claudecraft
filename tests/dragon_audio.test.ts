// Vaelgrath's procedural voice bank (src/game/dragon_audio.ts). These cues are
// synthesized, not recorded, so nothing downstream would catch a filter that
// went unstable, a buffer that renders silent, or a cue that stopped being
// distinguishable from its neighbour, the game would just play nothing, or
// play mush, with no error. That is what this file pins.

import { describe, expect, it } from 'vitest';
import { DRAGON_SFX_KEYS, type DragonCue, dragonSamples } from '../src/game/dragon_audio';

const CUES = Object.values(DRAGON_SFX_KEYS) as DragonCue[];
const RATES = [44100, 48000];

function rms(s: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / Math.max(1, s.length));
}

function peak(s: Float32Array): number {
  let max = 0;
  for (let i = 0; i < s.length; i++) max = Math.max(max, Math.abs(s[i]));
  return max;
}

/** Share of energy below ~200Hz: the cheap "how much chest does this have"
 *  measure. A two-pole cascade, so the split is steep enough to be meaningful. */
function lowBandFraction(s: Float32Array, sampleRate: number): number {
  const k = 1 - Math.exp((-2 * Math.PI * 200) / sampleRate);
  let a = 0;
  let b = 0;
  let low = 0;
  let all = 0;
  for (let i = 0; i < s.length; i++) {
    a += k * (s[i] - a);
    b += k * (a - b);
    low += b * b;
    all += s[i] * s[i];
  }
  return all > 0 ? low / all : 0;
}

describe('dragon voice bank', () => {
  it('stages a cue for every key the game plays', () => {
    // The three subfamily keys are what ui/combat_sfx mobVoiceCue resolves for
    // emberwake_vaelgrath; the bare dragon_* keys are the mechanic cues.
    expect(Object.keys(DRAGON_SFX_KEYS).sort()).toEqual([
      'dragon_breath',
      'dragon_wing',
      'mob_dragonkin_vaelgrath_aggro',
      'mob_dragonkin_vaelgrath_attack',
      'mob_dragonkin_vaelgrath_death',
    ]);
  });

  for (const rate of RATES) {
    describe(`at ${rate}Hz`, () => {
      it('renders finite, audible samples for every cue', () => {
        for (const cue of CUES) {
          const s = dragonSamples(cue, rate);
          expect(s.length, cue).toBeGreaterThan(rate * 0.4);
          // Scanned rather than asserted per sample: a per-sample expect() over
          // ~100k frames x 5 cues x 2 rates is a million assertions and seconds
          // of runtime for one bit of information.
          let bad = -1;
          for (let i = 0; i < s.length; i++) {
            if (!Number.isFinite(s[i])) {
              bad = i;
              break;
            }
          }
          expect(bad, `${cue} went non-finite at sample ${bad}`).toBe(-1);
          // A silent buffer is the exact failure an unstable filter produces
          // after the NaN guard scrubs it, so assert real signal, not just
          // "no NaN".
          expect(rms(s), cue).toBeGreaterThan(0.05);
        }
      });

      it('normalizes every cue to the same headroom and stays in range', () => {
        for (const cue of CUES) {
          const s = dragonSamples(cue, rate);
          expect(peak(s), cue).toBeCloseTo(0.92, 2);
        }
      });

      it('lands on silence so a cue cannot click when it ends', () => {
        for (const cue of CUES) {
          const s = dragonSamples(cue, rate);
          expect(Math.abs(s[s.length - 1]), cue).toBeLessThan(0.02);
        }
      });
    });
  }

  it('renders identically for the same cue and rate', () => {
    for (const cue of CUES) {
      expect(Array.from(dragonSamples(cue, 48000))).toEqual(Array.from(dragonSamples(cue, 48000)));
    }
  });

  it('gives each cue its own noise, so two firing together do not read as one', () => {
    // Correlated noise across cues is the tell that they share a seed: a bite
    // landing under a roar would then sound like one doubled hit.
    const roar = dragonSamples('roar', 48000);
    const bite = dragonSamples('bite', 48000);
    let dot = 0;
    const n = Math.min(roar.length, bite.length);
    for (let i = 0; i < n; i++) dot += roar[i] * bite[i];
    expect(Math.abs(dot / n)).toBeLessThan(0.05);
  });

  it('separates the cues by weight: air on top, collapsing chest at the bottom', () => {
    const low = Object.fromEntries(
      CUES.map((cue) => [cue, lowBandFraction(dragonSamples(cue, 48000), 48000)]),
    ) as Record<DragonCue, number>;

    // The flame jet is the brightest thing he does; the death is the heaviest.
    expect(low.breath).toBeLessThan(low.roar);
    expect(low.roar).toBeLessThan(low.death);
    expect(low.wing).toBeGreaterThan(0.6); // displacement, not a whoosh
    expect(low.roar).toBeGreaterThan(0.35); // a roar without chest is a scream
  });

  it('opens fast enough to land on the beat that triggered it', () => {
    // The roar fires on the pull and the bite on a swing connecting: a slow
    // fade-in would put the sound behind the event it belongs to.
    for (const cue of ['roar', 'bite'] as const) {
      const s = dragonSamples(cue, 48000);
      const first = Math.floor(48000 * 0.12);
      expect(peak(s.subarray(0, first)), cue).toBeGreaterThan(0.2);
    }
  });
});
