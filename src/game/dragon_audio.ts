// Vaelgrath's voice: deterministic procedural synthesis for the Emberwake
// world boss (sim/encounters/emberwake.ts). Same approach as
// water_elemental_audio.ts, pure math, no clip files, no generator run, but
// built much heavier, because a colossal dragon has to sound like one next to
// the recorded mob barks it plays alongside.
//
// The recipe every cue shares, in the order a listener hears it:
//   CHEST   a sub-bass fundamental with its own pitch arc. This is the size of
//           the animal; nothing else in the mix conveys it.
//   THROAT  a harmonic stack over that fundamental, slightly detuned so the
//           partials beat against each other instead of reading as one clean
//           organ note.
//   FRY     amplitude modulation in the 15-40Hz band. Below ~40Hz the ear
//           hears a rattle rather than a pitch, which is what turns a loud
//           tone into a *growl*.
//   RASP    band-passed noise riding the same envelope: the air moving past
//           teeth. Without it the cue sounds synthetic.
//   DRIVE   soft saturation that increases with level, so the loudest part of
//           a roar breaks up the way a real throat does.
//
// Every cue is mono on purpose: the SFX engine pans these through a positional
// panner (game/sfx.ts), and a stereo source would be downmixed anyway.

export type DragonCue = 'roar' | 'bite' | 'breath' | 'wing' | 'death';

/** Which SFX key each cue is staged under. The three `mob_dragonkin_vaelgrath_*`
 *  keys are the subfamily voice the existing mob-bark path resolves on its own
 *  (ui/combat_sfx.ts mobVoiceCue -> `mob_<family>_<subfamily>_<action>`, found
 *  via sfx.hasVariants, which counts procedural buffers). The bare `dragon_*`
 *  keys are the mechanic cues the HUD plays off his typed attackAnimation. */
export const DRAGON_SFX_KEYS: Readonly<Record<string, DragonCue>> = {
  mob_dragonkin_vaelgrath_aggro: 'roar',
  mob_dragonkin_vaelgrath_attack: 'bite',
  mob_dragonkin_vaelgrath_death: 'death',
  dragon_breath: 'breath',
  dragon_wing: 'wing',
};

const CUE_SECONDS: Record<DragonCue, number> = {
  roar: 2.6,
  bite: 0.52,
  breath: 1.6,
  wing: 1.0,
  death: 2.4,
};

// Distinct per cue so two of them firing together (a bite landing under a
// roar) are not correlated noise, which would read as one doubled sound.
const CUE_SEEDS: Record<DragonCue, number> = {
  roar: 0x5ea9d3,
  bite: 0x1c77af,
  breath: 0x3fd10b,
  wing: 0x9b42e6,
  death: 0x27c85d,
};

// Headroom under full scale. The engine multiplies by its own SAMPLE_GAIN and
// the per-play gain on top, so leaving a little room here keeps a roar landing
// at point-blank range from clipping the master bus.
const PEAK = 0.92;

function seededNoise(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

/** Soft clip. `drive` above 1 compresses peaks into harmonics instead of
 *  flattening them, and the result is renormalized so raising drive adds grit
 *  without also raising level. */
function saturate(x: number, drive: number): number {
  return Math.tanh(x * drive) / Math.tanh(drive);
}

/** Two-pole state-variable filter, stepped one sample at a time. Cheap enough
 *  to sweep its cutoff per sample, which is what the breath jet and the wing
 *  stroke both need (a static filter reads as a pad, not as moving air). */
interface Svf {
  lp: number;
  bp: number;
}

function svfStep(s: Svf, input: number, cutoffHz: number, q: number, sampleRate: number): void {
  // Guard the coefficient below Nyquist: an unclamped sweep goes unstable and
  // renders a buffer of NaN, which plays as silence with no error anywhere.
  const f = 2 * Math.sin((Math.PI * Math.min(cutoffHz, sampleRate * 0.45)) / sampleRate);
  s.lp += f * s.bp;
  const hp = input - s.lp - q * s.bp;
  s.bp += f * hp;
}

/** Fade the last few milliseconds to zero. Every cue here ends while still
 *  moving, and a buffer that stops mid-cycle clicks on playback. */
function fadeOut(out: Float32Array, sampleRate: number, seconds = 0.012): void {
  const n = Math.min(out.length, Math.floor(seconds * sampleRate));
  for (let i = 0; i < n; i++) out[out.length - n + i] *= 1 - i / n;
}

function normalize(out: Float32Array, peak = PEAK): void {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max <= 1e-6) return;
  const scale = peak / max;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
}

/** Attack ramp shared by the sustained cues: linear over `attack` seconds. */
function rise(t: number, attack: number): number {
  return Math.min(1, t / attack);
}

/** A grain envelope centred at `at` seconds, `width` seconds wide. */
function grain(t: number, at: number, width: number): number {
  const d = (t - at) / width;
  return Math.exp(-d * d);
}

// ---------------------------------------------------------------------------
// THE ROAR. The pull moment, and the one cue a player will remember: a fast
// swell into a held bellow that breaks up at the top, then falls away rattling.
// ---------------------------------------------------------------------------
function renderRoar(out: Float32Array, sampleRate: number, seed: number): void {
  const random = seededNoise(seed);
  const rasp: Svf = { lp: 0, bp: 0 };
  let phase = 0;
  let subPhase = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const p = i / Math.max(1, out.length - 1);

    // Pitch arc: lunges up into the bellow, then sags as the air runs out.
    const f0 = p < 0.28 ? 44 + (p / 0.28) * 24 : 68 - ((p - 0.28) / 0.72) * 32;
    phase += (Math.PI * 2 * f0) / sampleRate;
    subPhase += (Math.PI * 2 * f0 * 0.5) / sampleRate; // the chest octave

    // Throat: an odd-weighted partial stack, each partial detuned a little so
    // they beat instead of locking into one sterile tone.
    let voice = Math.sin(phase) * 1.0;
    voice += Math.sin(phase * 2.001) * 0.58;
    voice += Math.sin(phase * 3.004) * 0.46;
    voice += Math.sin(phase * 4.502) * 0.27;
    voice += Math.sin(phase * 6.007) * 0.17;
    voice += Math.sin(subPhase) * 0.72; // chest
    voice /= 3.2;

    // Vocal fry, accelerating through the roar so the held note keeps moving.
    const fryHz = 21 + p * 17;
    const fry = 0.5 + 0.5 * Math.sin(Math.PI * 2 * fryHz * t);
    voice *= 1 - 0.42 * fry ** 1.6;

    // Air past teeth: a band sweeping up with the pitch, then falling with it.
    svfStep(rasp, random(), 700 + Math.sin(Math.PI * Math.min(1, p * 1.2)) * 1250, 0.4, sampleRate);
    const air = rasp.bp * 1.6;

    // Fast in, held, long tail; the tail keeps a flutter so it decays like a
    // breath running out rather than a fader being pulled down.
    const flutter = p > 0.55 ? 1 - 0.3 * (0.5 + 0.5 * Math.sin(Math.PI * 2 * 11 * t)) : 1;
    const env = rise(t, 0.07) * (p < 0.4 ? 1 : Math.exp(-(p - 0.4) * 4.1)) * flutter;

    out[i] = saturate(env * (voice * 0.82 + air * 0.3), 2.6);
  }
}

// ---------------------------------------------------------------------------
// THE BITE. Jaw snap: a broadband crack, the mass of the head behind it, and a
// short crunch of what the teeth closed on.
// ---------------------------------------------------------------------------
function renderBite(out: Float32Array, sampleRate: number, seed: number): void {
  const random = seededNoise(seed);
  const crack: Svf = { lp: 0, bp: 0 };
  const tear: Svf = { lp: 0, bp: 0 };
  let thudPhase = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const white = random();

    // The snap itself: high, and gone in ~15ms.
    svfStep(crack, white, 2600, 0.7, sampleRate);
    const snap = crack.bp * Math.exp(-t * 190);

    // The head behind it, a falling thump, not a click.
    const thudHz = 74 - Math.min(30, t * 150);
    thudPhase += (Math.PI * 2 * thudHz) / sampleRate;
    const thud = Math.sin(thudPhase) * Math.exp(-t * 13) * 0.9;

    // Bone crunch: three closely spaced grains, so it reads as teeth meeting
    // resistance rather than one clean impact.
    const crunch =
      white * (grain(t, 0.022, 0.012) + grain(t, 0.058, 0.015) + grain(t, 0.097, 0.02)) * 0.55;

    // Wet tear underneath the whole thing.
    svfStep(tear, white, 620, 1.1, sampleRate);
    const wet = tear.bp * Math.exp(-t * 7) * 0.5;

    out[i] = saturate(snap * 0.9 + thud + crunch + wet, 1.9);
  }
}

// ---------------------------------------------------------------------------
// THE BREATH. The arcane-flame lance: a jet of moving air with a furnace under
// it and embers snapping off the front.
// ---------------------------------------------------------------------------
function renderBreath(out: Float32Array, sampleRate: number, seed: number): void {
  const random = seededNoise(seed);
  const jet: Svf = { lp: 0, bp: 0 };
  const body: Svf = { lp: 0, bp: 0 };
  let lowA = 0;
  let lowB = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const p = i / Math.max(1, out.length - 1);
    const white = random();

    // The jet sweeps up as the throat opens and falls back as it closes.
    const cutoff = 320 + Math.sin(Math.PI * Math.min(1, p * 1.05)) * 1400;
    svfStep(jet, white, cutoff, 0.9, sampleRate);
    svfStep(body, white, 240, 1.4, sampleRate);

    // Furnace bed: two low tones a fifth apart, tremolo'd so it churns.
    lowA += (Math.PI * 2 * 56) / sampleRate;
    lowB += (Math.PI * 2 * 84) / sampleRate;
    const churn = 0.72 + 0.28 * Math.sin(Math.PI * 2 * 6.5 * t);
    const furnace = (Math.sin(lowA) * 0.7 + Math.sin(lowB) * 0.4) * churn * 0.42;

    // Embers: sparse, short, and only once the flame is actually out.
    const ember = p > 0.18 && white > 0.986 ? white * 0.8 : 0;

    const env = rise(t, 0.16) * (p < 0.62 ? 1 : Math.exp(-(p - 0.62) * 6.4));
    out[i] = saturate(env * (jet.bp * 1.25 + body.lp * 0.9 + furnace + ember), 1.8);
  }
}

// ---------------------------------------------------------------------------
// THE WING BUFFET. Two strokes: the membrane cracking taut, then the wall of
// air it throws. Pitched entirely low, this is displacement, not a whoosh.
// ---------------------------------------------------------------------------
function renderWing(out: Float32Array, sampleRate: number, seed: number): void {
  const random = seededNoise(seed);
  const air: Svf = { lp: 0, bp: 0 };
  const snap: Svf = { lp: 0, bp: 0 };
  const strokes = [0.02, 0.5];
  let subPhase = 0;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const white = random();

    let moving = 0;
    let crack = 0;
    let pressure = 0;
    for (const s of strokes) {
      const dt = t - s;
      if (dt < 0) continue;
      // Air rushing past: the band falls through the stroke, which is what
      // sells the wing passing you rather than sitting still.
      const swell = Math.min(1, dt / 0.075) * Math.exp(-dt * 4.6);
      moving += swell;
      crack += Math.exp(-dt * 120) * 0.7;
      pressure += Math.exp(-dt * 9) * 0.85;
    }
    if (moving <= 0 && pressure <= 0) continue;

    const nearest = t < 0.5 ? t - strokes[0] : t - strokes[1];
    svfStep(air, white, 880 - Math.min(660, Math.max(0, nearest) * 1500), 1.0, sampleRate);
    svfStep(snap, white, 520, 0.55, sampleRate);

    // The pressure wave you feel more than hear.
    subPhase += (Math.PI * 2 * 38) / sampleRate;
    const sub = Math.sin(subPhase) * pressure * 0.7;

    out[i] = saturate(air.lp * moving * 1.5 + snap.bp * crack * 0.8 + sub, 1.6);
  }
}

// ---------------------------------------------------------------------------
// THE DEATH. The roar that does not hold: pitch collapses, the voice tears into
// a rasping exhale, and a mountain of animal hits the ground.
// ---------------------------------------------------------------------------
function renderDeath(out: Float32Array, sampleRate: number, seed: number): void {
  const random = seededNoise(seed);
  const rasp: Svf = { lp: 0, bp: 0 };
  const debris: Svf = { lp: 0, bp: 0 };
  let phase = 0;
  let subPhase = 0;
  let fallPhase = 0;
  const total = out.length / sampleRate;
  const fallAt = total - 0.62;

  for (let i = 0; i < out.length; i++) {
    const t = i / sampleRate;
    const p = i / Math.max(1, out.length - 1);
    const white = random();

    // Pitch sags the whole way down; nothing about this one lunges.
    const f0 = 62 - p * 34;
    phase += (Math.PI * 2 * f0) / sampleRate;
    subPhase += (Math.PI * 2 * f0 * 0.5) / sampleRate;

    let voice = Math.sin(phase) + Math.sin(phase * 2.003) * 0.5 + Math.sin(phase * 3.007) * 0.3;
    voice += Math.sin(subPhase) * 0.8;
    voice /= 2.6;

    // The rattle deepens as the voice fails, until it is most of the sound.
    const fryHz = 19 + p * 9;
    voice *= 1 - (0.34 + p * 0.4) * (0.5 + 0.5 * Math.sin(Math.PI * 2 * fryHz * t)) ** 1.5;

    // Exhale: takes over from the voice through the second half.
    svfStep(rasp, white, 640 - p * 420, 0.6, sampleRate);
    const breath = rasp.bp * (0.25 + p * 0.95);

    const voiceEnv = rise(t, 0.09) * Math.exp(-p * 3.2);
    const breathEnv = rise(t, 0.09) * Math.exp(-Math.max(0, p - 0.35) * 3.4);

    // He lands. Low, blunt, with grit thrown off it. The debris filter is
    // stepped every sample (not just after impact) so its state is settled by
    // the time the thud opens it up, rather than ringing from a cold start.
    fallPhase += (Math.PI * 2 * 41) / sampleRate;
    svfStep(debris, white, 1500, 1.2, sampleRate);
    const dt = t - fallAt;
    const impact =
      dt < 0
        ? 0
        : Math.sin(fallPhase) * Math.exp(-dt * 11) * 0.95 + debris.bp * Math.exp(-dt * 16) * 0.5;

    out[i] = saturate(voice * voiceEnv * 0.85 + breath * breathEnv * 0.5 + impact, 2.2);
  }
}

const RENDERERS: Record<DragonCue, (o: Float32Array, sr: number, seed: number) => void> = {
  roar: renderRoar,
  bite: renderBite,
  breath: renderBreath,
  wing: renderWing,
  death: renderDeath,
};

/** Deterministic mono samples for one of Vaelgrath's cues. Same cue + same
 *  sample rate always renders the same buffer, so this is directly testable
 *  and never varies between two players in the same fight. */
export function dragonSamples(cue: DragonCue, sampleRate: number): Float32Array {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const out = new Float32Array(Math.max(1, Math.floor(CUE_SECONDS[cue] * rate)));
  RENDERERS[cue](out, rate, CUE_SEEDS[cue]);
  // Guard against a filter that went unstable on an unusual sample rate: one
  // NaN silently poisons the whole buffer at decode time.
  for (let i = 0; i < out.length; i++) {
    if (!Number.isFinite(out[i])) out[i] = 0;
    else out[i] = Math.max(-1, Math.min(1, out[i]));
  }
  normalize(out);
  fadeOut(out, rate);
  return out;
}
