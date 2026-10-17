// Gourdlight Eve's own sound effects, synthesized here from first principles (no
// recording, no generator, no third-party sample): oscillators, seeded noise and RBJ
// biquad filters, written as a 44.1 kHz mono master and conformed to the repo's asset
// standard (scripts/sfx/conform_audio.mjs) into public/audio/sfx/<key>.mp3.
//
//   node scripts/sfx/gourdlight_sfx.mjs [--only <key>]
//   then: npm run sfx:manifest
//
// The cues:
//   proj_gourdfall_whistle        a burning pumpkin dropping out of the sky: a falling
//                                 whistle over a rising roar of flame (Gourdfall)
//   impact_gourdfall              it lands: a hollow thump, a wet rind split, a burst of
//                                 flame and a spray of sparks
//   spell_swelling_gourd_pulse    the Swelling Gourd ripening: a deep, wet heartbeat
//   impact_swelling_gourd_burst   the Swelling Gourd bursting over the field
//   mount_idle_emberbristle_broom the Emberbristle Broom hovering at rest: a warm,
//                                 breathing hum with embers ticking (a seamless loop)
//   mount_run_emberbristle_broom  one stride of the broom on the move: a soft swish of
//                                 bristles through the air with an ember flare
//
// Deterministic: a fixed seed per cue (mulberry32), no clock. Original work, recorded in
// CREDITS.md.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conformSfxAudio } from './conform_audio.mjs';
import { FFMPEG_PATH } from './ffmpeg_paths.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT_DIR = join(ROOT, 'public/audio/sfx');
const SR = 44100;
const TAU = Math.PI * 2;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An RBJ biquad (lowpass, highpass, bandpass), its centre movable per sample. */
function biquad(type) {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x, freq, q = 0.707) => {
    const w = (TAU * Math.min(freq, SR * 0.45)) / SR;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (type === 'lp') {
      b0 = (1 - cw) / 2;
      b1 = 1 - cw;
      b2 = (1 - cw) / 2;
    } else if (type === 'hp') {
      b0 = (1 + cw) / 2;
      b1 = -(1 + cw);
      b2 = (1 + cw) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    const a1 = -2 * cw;
    const a2 = 1 - alpha;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

const env = (t, attack, decay) =>
  t < 0 ? 0 : t < attack ? t / attack : Math.exp(-(t - attack) / decay);

/** A pitch-dropping sine thump: the body of an impact or a heartbeat. */
function thump(t, f0, f1, drop, decay) {
  if (t < 0) return 0;
  const f = f1 + (f0 - f1) * Math.exp(-t / drop);
  // phase of an exponentially gliding sine
  const phase = TAU * (f1 * t + (f0 - f1) * drop * (1 - Math.exp(-t / drop)));
  return Math.sin(phase) * env(t, 0.003, decay) * (f > 0 ? 1 : 0);
}

/** Fire: lowpassed noise with crackles (sparse, sharp, high-passed clicks). */
function makeFire(rand, crackleRate) {
  const lp = biquad('lp');
  const hp = biquad('hp');
  let crack = 0;
  return (t, roarHz, level, crackLevel) => {
    const n = rand() * 2 - 1;
    const roar = lp(n, roarHz, 0.9);
    if (rand() < crackleRate / SR) crack = (0.5 + rand()) * (rand() < 0.5 ? -1 : 1);
    crack *= 0.985;
    const c = hp(crack * (rand() * 2 - 1), 2500, 0.8);
    return roar * level + c * crackLevel;
  };
}

function render(seconds, fn) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / SR, i);
  return out;
}

const CUES = {
  proj_gourdfall_whistle: () => {
    const rand = rng(101);
    const fire = makeFire(rand, 60);
    const air = biquad('bp');
    const dur = 0.95;
    return render(dur, (t) => {
      const u = t / dur;
      // the whistle falls from a shriek to a moan as it nears the ground
      const f = 1900 * (420 / 1900) ** u;
      const vib = 1 + 0.012 * Math.sin(TAU * 7 * t);
      const ph = (TAU * 1900 * dur * ((420 / 1900) ** u - 1)) / Math.log(420 / 1900);
      const tone = Math.sin(ph * vib) * 0.35 + Math.sin(ph * 2.01) * 0.06;
      const breath = air(rand() * 2 - 1, f * 1.1, 6) * 0.9;
      const swell = 0.25 + 0.75 * u ** 1.6;
      const roar = fire(t, 500 + 900 * u, 0.55 * u ** 1.3, 0.25 * u);
      const fade = Math.min(1, (dur - t) / 0.03) * Math.min(1, t / 0.08);
      return (tone + breath) * swell * fade * 0.8 + roar * fade;
    });
  },

  impact_gourdfall: () => {
    const rand = rng(202);
    const fire = makeFire(rand, 140);
    const wet = biquad('bp');
    const snap = biquad('hp');
    return render(1.25, (t) => {
      const body = thump(t, 140, 46, 0.05, 0.22) * 1.0;
      const hollow = thump(t, 320, 180, 0.03, 0.07) * 0.35;
      const split =
        wet(rand() * 2 - 1, 700 - 300 * Math.min(1, t / 0.15), 1.4) * env(t, 0.002, 0.07) * 1.6;
      const crack = snap(rand() * 2 - 1, 3000, 0.7) * env(t, 0.0005, 0.012) * 1.2;
      const flame = fire(
        t,
        1400 * Math.exp(-t / 0.5) + 300,
        0.9 * env(t, 0.03, 0.42),
        0.5 * env(t, 0.05, 0.5),
      );
      return body + hollow + split + crack + flame;
    });
  },

  spell_swelling_gourd_pulse: () => {
    const rand = rng(303);
    const squish = biquad('bp');
    const fire = makeFire(rand, 25);
    return render(0.62, (t) => {
      // lub-dub: two deep beats, the second softer, and the rind creaking as it stretches
      const lub = thump(t, 95, 48, 0.04, 0.11);
      const dub = thump(t - 0.17, 85, 44, 0.04, 0.1) * 0.7;
      const creak =
        squish(rand() * 2 - 1, 260 + 140 * Math.sin(TAU * 3 * t), 4) * env(t, 0.04, 0.16) * 0.9;
      const ember = fire(t, 700, 0.12 * env(t, 0.02, 0.3), 0.18 * env(t, 0.02, 0.3));
      const fade = Math.min(1, (0.62 - t) / 0.05);
      return (lub + dub + creak + ember) * fade;
    });
  },

  impact_swelling_gourd_burst: () => {
    const rand = rng(404);
    const fire = makeFire(rand, 220);
    const wet = biquad('bp');
    const debrisF = biquad('bp');
    const hits = [];
    for (let i = 0; i < 26; i++)
      hits.push([0.2 + rand() * 1.4, 300 + rand() * 900, 0.15 + rand() * 0.35]);
    return render(2.6, (t) => {
      const boom = thump(t, 110, 32, 0.09, 0.55) * 1.2;
      const body = thump(t, 260, 90, 0.04, 0.12) * 0.5;
      const splat =
        wet(rand() * 2 - 1, 900 - 500 * Math.min(1, t / 0.3), 1.1) * env(t, 0.003, 0.14) * 1.8;
      const flame = fire(
        t,
        2200 * Math.exp(-t / 0.7) + 260,
        1.1 * env(t, 0.02, 0.85),
        0.6 * env(t, 0.1, 0.9),
      );
      // wet debris pattering down round the field
      let deb = 0;
      for (const [at, hz, lv] of hits) {
        const dt = t - at;
        if (dt >= 0 && dt < 0.12) deb += Math.sin(TAU * hz * dt) * Math.exp(-dt / 0.02) * lv;
      }
      const patter = debrisF(deb, 600, 0.8) * 1.4;
      const fade = Math.min(1, (2.6 - t) / 0.2);
      return (boom + body + splat + flame + patter) * fade;
    });
  },

  mount_idle_emberbristle_broom: () => {
    // a seamless 3 s loop: every partial an integer number of cycles in the period, the
    // noise layers crossfaded tail-into-head
    const P = 3;
    const rand = rng(505);
    const fire = makeFire(rand, 9);
    const air = biquad('bp');
    const N = Math.round(P * SR);
    const noise = render(P + 0.5, (t) =>
      air(rand() * 2 - 1, 520 + 120 * Math.sin((TAU * t) / P), 1.6),
    );
    const embers = render(P + 0.5, (t) => fire(t, 900, 0.0, 0.5));
    const xf = Math.round(0.5 * SR);
    const loopNoise = (i, src) => {
      if (i >= xf) return src[i];
      const k = i / xf;
      return src[i] * k + src[i + N] * (1 - k);
    };
    return render(P, (t, i) => {
      const breathe = 0.8 + 0.2 * Math.sin((TAU * t) / P) + 0.06 * Math.sin((TAU * 3 * t) / P);
      const hum =
        Math.sin(TAU * 110 * t) * 0.32 +
        Math.sin(TAU * (165 + 1 / 3) * t) * 0.14 +
        Math.sin(TAU * 220 * t + 0.7) * 0.07 +
        Math.sin(TAU * (330 + 2 / 3) * t) * 0.03;
      const shimmer = Math.sin(TAU * 880 * t) * Math.sin((TAU * 4 * t) / P) * 0.015;
      return hum * breathe + shimmer + loopNoise(i, noise) * 0.22 + loopNoise(i, embers) * 0.22;
    });
  },

  mount_run_emberbristle_broom: () => {
    const rand = rng(606);
    const bp = biquad('bp');
    const hp = biquad('hp');
    const fire = makeFire(rand, 90);
    const dur = 0.55;
    return render(dur, (t) => {
      const u = t / dur;
      const swell = Math.sin(Math.PI * Math.min(1, u * 1.05)) ** 1.4;
      // a swish of air through bristles: a bandpass sweeping up, rustled by grains
      const swish = bp(rand() * 2 - 1, 380 + 1500 * u, 1.3) * swell * 1.3;
      const grain = 0.6 + 0.4 * Math.sin(TAU * 38 * t + 3 * Math.sin(TAU * 7 * t));
      const rustle = hp(rand() * 2 - 1, 3500, 0.7) * swell * grain * 0.35;
      const hum = Math.sin(TAU * 110 * t) * 0.12 * swell;
      const ember = fire(t, 1100, 0.18 * swell, 0.3 * swell);
      return swish + rustle + hum + ember;
    });
  },
};

/** 16-bit PCM mono WAV. */
function wav(samples) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const k = peak > 0 ? 0.9 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * k)) * 32767), 44 + i * 2);
  }
  return buf;
}

export const GOURDLIGHT_SFX_KEYS = Object.keys(CUES);

const onlyArg = process.argv.indexOf('--only');
const only = onlyArg >= 0 ? process.argv[onlyArg + 1] : null;
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [key, make] of Object.entries(CUES)) {
    if (only && key !== only) continue;
    const samples = make();
    const dest = join(OUT_DIR, `${key}.mp3`);
    const tmp = join(dirname(dest), `.${key}.${process.pid}.source.wav`);
    writeFileSync(tmp, wav(samples));
    try {
      conformSfxAudio({
        inputFile: tmp,
        outputFile: dest,
        duration: samples.length / SR,
        ffmpegPath: FFMPEG_PATH,
        channels: 1,
      });
    } finally {
      rmSync(tmp, { force: true });
    }
    console.log(`wrote ${key}.mp3 (${(samples.length / SR).toFixed(2)} s)`);
  }
}
