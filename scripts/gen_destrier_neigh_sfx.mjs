// Synthesize the Lantern Hall Destrier's whinny (mount_neigh_lantern_hall_destrier.mp3), the
// call it gives as it rears (src/render/mount_rear_core.ts).
//
//   node scripts/gen_destrier_neigh_sfx.mjs
//
// Original procedural audio, no recordings: a voiced source (a band-limited glottal pulse
// train, its harmonics rolling off) through three vocal-tract resonances, shaped the way a
// horse's whinny runs. A sharp rise into a high squeal, a long descending trill (the pitch and
// the level both shaking at a little over twenty times a second, the "ha-ha-ha" a whinny is
// made of), a lower nicker that slows as it falls, and a breathy snort to end. A seeded PRNG
// drives every random term, so the output is byte-for-byte reproducible. The WAV is written by
// hand and passed through the shared conform step (scripts/sfx/conform_audio.mjs), like the
// other procedural mount takes.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conformSfxAudio } from './sfx/conform_audio.mjs';
import { FFMPEG_PATH } from './sfx/ffmpeg_paths.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = join(REPO_ROOT, 'public/audio/sfx/mount_neigh_lantern_hall_destrier.mp3');
const SOURCE = join(dirname(OUTPUT), '.mount_neigh_lantern_hall_destrier.source.wav');
const RATE = 44100;
const DURATION = 1.6;

/** mulberry32: a small seeded PRNG, so the take never changes between runs. */
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

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Fundamental (Hz) and voiced level over time: the shape of a whinny. */
function contour(t) {
  // rise into the squeal
  if (t < 0.12)
    return { f0: lerp(520, 1180, smooth(0, 0.12, t)), amp: smooth(0, 0.05, t), trill: 0.2 };
  // the long descending trill
  if (t < 0.92) {
    const k = (t - 0.12) / 0.8;
    return { f0: lerp(1180, 560, k ** 0.8), amp: 1 - 0.25 * k, trill: 0.6 + 0.4 * k };
  }
  // the low nicker, slowing as it falls
  if (t < 1.32) {
    const k = (t - 0.92) / 0.4;
    return { f0: lerp(520, 300, k), amp: 0.7 * (1 - smooth(0.6, 1, k)), trill: 1 };
  }
  return { f0: 280, amp: 0, trill: 1 };
}

/** A two-pole resonator (a formant), as a stateful per-sample filter. */
function resonator(freq, bw) {
  const r = Math.exp((-Math.PI * bw) / RATE);
  const c = 2 * r * Math.cos((2 * Math.PI * freq) / RATE);
  const d = -r * r;
  const g = 1 - r;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = g * x + c * y1 + d * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function synth() {
  const n = Math.round(DURATION * RATE);
  const out = new Float32Array(n);
  const rand = rng(1705);
  const formants = [resonator(780, 160), resonator(1650, 220), resonator(2900, 340)];
  const fGain = [1.0, 0.55, 0.22];
  const breathBand = [resonator(1400, 900), resonator(600, 500)];
  let phase = 0;
  let trillPhase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const { f0, amp, trill } = contour(t);
    // the trill: pitch and level shaking together, its rate easing down as the call falls
    const trillHz = lerp(24, 16, smooth(0.1, 1.3, t));
    trillPhase += (2 * Math.PI * trillHz) / RATE;
    const shake = Math.sin(trillPhase);
    const f = f0 * (1 + 0.075 * trill * shake + 0.004 * (rand() - 0.5));
    phase += (2 * Math.PI * f) / RATE;
    // band-limited glottal source: harmonics rolling off at about 9 dB an octave
    let src = 0;
    for (let h = 1; h * f < 9000; h++) src += Math.sin(phase * h) / h ** 1.5;
    const level = amp * (1 - 0.55 * trill * (0.5 - 0.5 * shake));
    let voiced = 0;
    for (let k = 0; k < 3; k++) voiced += formants[k](src * level) * fGain[k];
    // breath under the voice, and the closing snort
    const snort = smooth(1.3, 1.36, t) * (1 - smooth(1.42, 1.58, t));
    const breathy = 0.06 * amp + 0.42 * snort;
    const noise = rand() * 2 - 1;
    const breath = breathBand[0](noise) * 0.6 + breathBand[1](noise) * 0.9;
    out[i] = voiced * 1.6 + breath * breathy;
  }
  // gentle in/out and peak normalize to -3 dBFS before the conform step's own loudness pass
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    out[i] *= smooth(0, 0.01, t) * (1 - smooth(DURATION - 0.06, DURATION, t));
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const norm = peak > 0 ? 0.707 / peak : 1;
  for (let i = 0; i < n; i++) out[i] *= norm;
  return out;
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8);
  head.write('fmt ', 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

mkdirSync(dirname(OUTPUT), { recursive: true });
rmSync(SOURCE, { force: true });
try {
  writeFileSync(SOURCE, wav(synth()));
  conformSfxAudio({
    inputFile: SOURCE,
    outputFile: OUTPUT,
    duration: DURATION,
    ffmpegPath: FFMPEG_PATH,
    channels: 1,
  });
  console.log(`Destrier whinny: wrote ${OUTPUT}`);
} finally {
  rmSync(SOURCE, { force: true });
}
