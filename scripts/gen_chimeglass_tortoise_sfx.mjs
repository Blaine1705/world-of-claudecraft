// One stride of the Chimeglass Tortoise, synthesised: a soft clawed pad under a
// swinging bronze bell. The bell IS the mount, so it carries the cue and the
// footfall only grounds it. Four layers:
//   pad     a short 74 -> 52 Hz body settle, a low creature putting a foot down
//   claw    a brief band-limited tick, keratin on packed dirt
//   bell    five INHARMONIC partials (hum/prime/tierce/quint/nominal), the
//           upper ones decaying fastest, which is what separates a bell from a
//           sine chime
//   shell   a slow leather-strap creak as the carapace takes the weight
// Deterministic (xorshift with a fixed seed), so a re-run is byte-identical.
//
//   node scripts/gen_chimeglass_tortoise_sfx.mjs
//
// Writes public/audio/sfx/mount_run_chimeglass_tortoise.mp3 through the shared
// conform step, so it lands on the project standard (mono, 44.1 kHz, 192 kbps)
// like every other clip.
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conformSfxAudio } from './sfx/conform_audio.mjs';
import { FFMPEG_PATH } from './sfx/ffmpeg_paths.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = join(REPO_ROOT, 'public/audio/sfx/mount_run_chimeglass_tortoise.mp3');
const SOURCE = join(dirname(OUTPUT), '.mount_run_chimeglass_tortoise.source.wav');

const SR = 44100;
const DUR = 0.58;
const n = Math.round(SR * DUR);
const out = new Float32Array(n);

let seed = 0x2545f491;
function rnd() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0xffffffff - 0.5;
}

const env = (t, start, attack, decay) => {
  const u = t - start;
  if (u < 0) return 0;
  if (u < attack) return u / attack;
  return Math.exp(-(u - attack) / decay);
};

// A small bronze bell's partial set, as ratios of the prime. These are the
// classic bell intervals (hum an octave down, tierce a minor third up, quint a
// fifth, nominal an octave up); an harmonic stack here would read as a tuned
// pipe rather than as struck metal.
const BELL_HZ = 1180;
const PARTIALS = [
  { ratio: 0.5, gain: 0.5, decay: 0.42 },
  { ratio: 1.0, gain: 1.0, decay: 0.3 },
  { ratio: 1.19, gain: 0.62, decay: 0.2 },
  { ratio: 1.5, gain: 0.4, decay: 0.14 },
  { ratio: 2.0, gain: 0.3, decay: 0.09 },
];

let lpClaw = 0;
let lpCreak = 0;
let hpCreak = 0;
let phase = 0;

const BELL_AT = 0.035; // the bell answers just after the foot lands

for (let i = 0; i < n; i++) {
  const t = i / SR;
  let s = 0;

  // pad: a low settle rather than an impact, this animal is not heavy-footed
  const f = 52 + 22 * Math.exp(-t / 0.05);
  phase += (2 * Math.PI * f) / SR;
  s += Math.sin(phase) * env(t, 0, 0.006, 0.085) * 0.55;

  // claw: a short tick of keratin catching the ground
  const nc = rnd();
  lpClaw += (nc - lpClaw) * 0.42;
  s += lpClaw * env(t, 0.001, 0.0015, 0.022) * 0.85;

  // bell: struck bronze, inharmonic, ringing well past the footfall
  const u = t - BELL_AT;
  if (u > 0) {
    let bell = 0;
    for (const p of PARTIALS) {
      bell += Math.sin(2 * Math.PI * BELL_HZ * p.ratio * u) * p.gain * Math.exp(-u / p.decay);
    }
    // a touch of attack noise so the strike has a clapper in it
    s += bell * 0.115 + rnd() * env(t, BELL_AT, 0.0008, 0.006) * 0.25;
  }

  // shell: the straps creaking as the carapace rolls onto the planted foot
  const nr = rnd();
  lpCreak += (nr - lpCreak) * 0.06;
  hpCreak = 0.9 * (hpCreak + lpCreak - nr);
  s += hpCreak * env(t, 0.06, 0.05, 0.12) * 0.28;

  out[i] = s;
}

// soft-clip, then normalise to -6 dBFS true peak (the sub-1s clip target)
let peak = 0;
for (let i = 0; i < n; i++) {
  out[i] = Math.tanh(out[i] * 1.1);
  peak = Math.max(peak, Math.abs(out[i]));
}
const gain = 10 ** (-6 / 20) / (peak || 1);

const bytes = Buffer.alloc(44 + n * 2);
bytes.write('RIFF', 0);
bytes.writeUInt32LE(36 + n * 2, 4);
bytes.write('WAVEfmt ', 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(SR, 24);
bytes.writeUInt32LE(SR * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write('data', 36);
bytes.writeUInt32LE(n * 2, 40);
for (let i = 0; i < n; i++) {
  bytes.writeInt16LE(
    Math.max(-32768, Math.min(32767, Math.round(out[i] * gain * 32767))),
    44 + i * 2,
  );
}
writeFileSync(SOURCE, bytes);
try {
  conformSfxAudio({
    inputFile: SOURCE,
    outputFile: OUTPUT,
    duration: DUR,
    ffmpegPath: FFMPEG_PATH,
    channels: 1,
  });
  console.log(`Chimeglass Tortoise stride: wrote ${OUTPUT} (${DUR.toFixed(2)}s)`);
} finally {
  rmSync(SOURCE, { force: true });
}
