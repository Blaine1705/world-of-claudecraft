// One stride of the Lanternback Troll, synthesised: a heavy barefoot slam under
// a loaded iron throne. Four layers, because a single thump reads as a drum:
//   sub     a 58 -> 36 Hz body drop, the mass
//   knock   a band-limited crack, the foot hitting packed dirt
//   scuff   a broadband drag a beat later, the toes pushing off
//   chain   two inharmonic metal partials, the lanterns answering the step
// Deterministic (xorshift with a fixed seed), so a re-run is byte-identical.
//
//   node scripts/gen_lanternback_troll_sfx.mjs
//
// Writes public/audio/sfx/mount_run_lanternback_troll.mp3 through the shared
// conform step, so it lands on the project standard (mono, 44.1 kHz, 192 kbps,
// -6 dBFS true peak for a sub-second cue) like every other clip.
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conformSfxAudio } from './sfx/conform_audio.mjs';
import { FFMPEG_PATH } from './sfx/ffmpeg_paths.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = join(REPO_ROOT, 'public/audio/sfx/mount_run_lanternback_troll.mp3');
const SOURCE = join(dirname(OUTPUT), '.mount_run_lanternback_troll.source.wav');

const SR = 44100;
const DUR = 0.62;
const n = Math.round(SR * DUR);
const out = new Float32Array(n);

// deterministic noise so a re-run produces byte-identical audio
let seed = 0x9e3779b9;
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

// one-pole state for the shaped noise layers
let lpKnock = 0;
let hpScuff = 0;
let lpScuff = 0;
let phase = 0;

for (let i = 0; i < n; i++) {
  const t = i / SR;
  let s = 0;

  // sub: pitch falls fast, then the tail holds the weight
  const f = 36 + 22 * Math.exp(-t / 0.045);
  phase += (2 * Math.PI * f) / SR;
  s += Math.sin(phase) * env(t, 0, 0.004, 0.15) * 0.95;

  // knock: noise through a low-pass, the leathery crack of the impact
  const nk = rnd();
  lpKnock += (nk - lpKnock) * 0.22; // ~0.22 -> roughly 1.5 kHz corner
  s += lpKnock * env(t, 0.002, 0.002, 0.055) * 1.5;

  // scuff: a brighter drag that lands after the foot has taken the weight
  const ns = rnd();
  lpScuff += (ns - lpScuff) * 0.55;
  hpScuff = 0.88 * (hpScuff + lpScuff - ns);
  s += hpScuff * env(t, 0.045, 0.02, 0.11) * 0.5;

  // chain: the lanterns take the shock a moment later, two detuned partials
  const chainEnv = env(t, 0.075, 0.001, 0.13);
  s +=
    (Math.sin(2 * Math.PI * 2170 * (t - 0.075)) * 0.6 +
      Math.sin(2 * Math.PI * 3310 * (t - 0.075)) * 0.4) *
    chainEnv *
    0.075;

  out[i] = s;
}

// soft-clip, then normalise to -6 dBFS true peak (the sub-1s clip target)
let peak = 0;
for (let i = 0; i < n; i++) {
  out[i] = Math.tanh(out[i] * 1.15);
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
  console.log(`Lanternback Troll stride: wrote ${OUTPUT} (${DUR.toFixed(2)}s)`);
} finally {
  rmSync(SOURCE, { force: true });
}
