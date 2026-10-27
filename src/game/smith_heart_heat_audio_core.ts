// WHICH sound the Smith's Heart's Guardian of the Heat makes, and WHEN
// (docs/design/raid/smith_heart.md 7.4). Pure: no WebAudio, no DOM. The
// adapter (smith_heart_heat_audio.ts) plays these off the fight's own cues
// (the `spellfx` events heat_ids.ts HEAT_CUES names), the guardian's bars,
// the fight's objects as they change state (a swell starting to roll, a river
// starting to flow, a Wakefire band igniting) and the local player's own
// marks, all mirrored entity state, so offline and online sound the same.
//
//   a cue        a positioned one-shot, layered from one or more samples (the
//                fist landing, a swell rolling, a flare, the sink and the
//                rise, a river, a Falling Cinder, a Wellspawn climbing out
//                and feeding the wellspring, a Kindling Mark, a seed landing
//                and bursting, a Seedflame hatching, Wakefire igniting, a
//                Rolling Cinder landing, struck back and bursting, the
//                wellspring settling at the fall)
//   a bar        Basalt Fist's charge fitted to it
//   the marks    in the local player's ear: a Kindling Mark landing on them,
//                a Rolling Cinder or a Seedflame turning to hunt them
//
// No sample is the fight's own yet: the ElevenLabs credits ran out, so every
// sound is built from the pack's existing samples, pitched and layered here
// (the takes to generate later are `HEAT_*` in scripts/sfx/sfx_prompts.mjs).
// Readable, punchy, never tiring: the bolts and the rivers are soft and short.

import { HEAT_AURAS, HEAT_CASTS, HEAT_CUES } from '../sim/encounters/smith_heart/heat_ids';

export interface HeatSound {
  key: string;
  gain: number;
  rate: number;
  cooldown: number;
  at: 'source' | 'target' | 'point';
}

const S = (
  key: string,
  gain: number,
  at: HeatSound['at'],
  rate = 1,
  cooldown = 0.08,
): HeatSound => ({ key, gain, rate, cooldown, at });

/** The layered one-shot each fight cue plays (keyed by the cue's ability id). */
export const HEAT_CUE_SOUNDS: Readonly<Record<string, readonly HeatSound[]>> = {
  // Basalt Fist lands: a rock's impact, a wrath's blast and a meteor, deep.
  [HEAT_CUES.fist]: [
    S('heart_council_rock_impact', 1, 'point', 0.8, 0.5),
    S('heart_council_wrath_blast', 0.8, 'point', 0.85, 0.5),
    S('meteor', 0.6, 'point', 0.7, 0.5),
  ],
  // A Molten Swell starts to roll: a tide's rush, lower and hotter.
  [HEAT_CUES.swell]: [
    S('hoard_tide_rush', 0.7, 'point', 0.7, 0.3),
    S('flamestrike', 0.35, 'point', 0.75, 0.3),
  ],
  // Hearth Flare on a far player: a fire bolt and its impact.
  [HEAT_CUES.flare]: [
    S('proj_fire', 0.5, 'target', 0.85, 0.25),
    S('impact_fire', 0.45, 'target', 0.9, 0.25),
  ],
  // It sinks into the wellspring; it rises again.
  [HEAT_CUES.sink]: [
    S('hoard_tide_crash', 0.9, 'source', 0.65, 1),
    S('heart_breath_swell', 0.5, 'source', 0.6, 1),
  ],
  [HEAT_CUES.rise]: [
    S('hoard_tide_crash', 0.9, 'source', 0.75, 1),
    S('heart_council_pillar_rise', 0.6, 'source', 0.7, 1),
  ],
  // A river of the first flame starts to flow (soft: three at a time).
  [HEAT_CUES.river]: [S('hoard_tide_rush', 0.45, 'point', 0.8, 0.6)],
  // A Falling Cinder strikes (soft and short: one every few seconds).
  [HEAT_CUES.bolt]: [S('impact_fire', 0.35, 'target', 0.85, 0.15)],
  // A Wellspawn climbs out; one feeds the wellspring (a blast).
  [HEAT_CUES.spawn]: [S('heart_council_pillar_rise', 0.5, 'point', 1.3, 0.2)],
  [HEAT_CUES.feed]: [
    S('heart_council_wrath_blast', 0.9, 'point', 1.05, 0.4),
    S('pyroblast', 0.6, 'point', 0.8, 0.4),
  ],
  // A Wellkeeper marks a player.
  [HEAT_CUES.kindling]: [S('cast_fire', 0.5, 'target', 0.9, 0.3)],
  // A Hearthseed lands; it bursts (a deep detonation).
  [HEAT_CUES.seed]: [S('rift_lava_tick', 0.45, 'point', 0.85, 0.12)],
  [HEAT_CUES.seedBurst]: [
    S('pyroblast', 0.75, 'point', 0.75, 0.15),
    S('impact_warrior_quake', 0.4, 'point', 0.9, 0.15),
  ],
  [HEAT_CUES.hatch]: [S('cast_fire', 0.4, 'point', 1.4, 0.15)],
  // Wakefire ignites a band: a roar of flame over the floor.
  [HEAT_CUES.ignite]: [
    S('flamestrike', 0.95, 'point', 0.7, 0.6),
    S('heart_council_wrath_blast', 0.5, 'point', 1.1, 0.6),
  ],
  // A Rolling Cinder lands, is struck back, bursts on its quarry.
  [HEAT_CUES.cinderLand]: [
    S('meteor', 0.9, 'point', 0.85, 0.5),
    S('impact_warrior_quake', 0.5, 'point', 0.8, 0.5),
  ],
  [HEAT_CUES.cinderKnock]: [
    S('heart_council_rock_impact', 0.6, 'target', 1.2, 0.2),
    S('impact_fire', 0.4, 'target', 0.8, 0.2),
  ],
  [HEAT_CUES.cinderBurst]: [
    S('pyroblast', 0.95, 'point', 0.7, 0.4),
    S('heart_council_wrath_blast', 0.7, 'point', 0.95, 0.4),
  ],
  [HEAT_CUES.settle]: [S('heart_council_pillar_collapse', 0.7, 'source', 0.8, 1)],
};

/** Is this event's ability one the fight's sound plays (the HUD's generic
 *  nova, beam or burst sound skipped for it)? */
export function heatSoundClaims(ability: string | undefined): boolean {
  return ability !== undefined && Object.hasOwn(HEAT_CUE_SOUNDS, ability);
}

/** A bar's charge: its sample and the sample's own length in seconds. */
export interface HeatBarSound {
  key: string;
  seconds: number;
  gain: number;
}

export const HEAT_BAR_SOUNDS: Readonly<Record<string, HeatBarSound>> = {
  [HEAT_CASTS.fist]: { key: 'heart_council_echo_charge', seconds: 2.5, gain: 0.8 },
};

/** A bar's charge fitted to its bar, kept within a breath of its own pitch. */
export function heatBarRate(sound: HeatBarSound, barSeconds: number): number {
  if (!(barSeconds > 0)) return 1;
  return Math.max(0.85, Math.min(1.2, sound.seconds / barSeconds));
}

/** A Wakefire band beginning to build (a rush rising). */
export const HEAT_ZONE_BUILD_SOUND = { key: 'hoard_tide_build', gain: 0.55, rate: 0.85 } as const;

/** The marks in the local player's ear: one landing on them (each its
 *  sample), so a player always hears that the mechanic chose them. */
export const HEAT_MARK_SOUNDS: Readonly<
  Record<string, { key: string; gain: number; rate: number }>
> = {
  [HEAT_AURAS.kindling]: { key: 'debuff_apply', gain: 0.6, rate: 0.85 },
  [HEAT_AURAS.hunted]: { key: 'heart_breath_swell', gain: 0.5, rate: 1.2 },
};

/** Every sample the fight plays, for preloading once. */
export const HEAT_SFX_KEYS: readonly string[] = [
  ...new Set([
    ...Object.values(HEAT_CUE_SOUNDS).flatMap((list) => list.map((s) => s.key)),
    ...Object.values(HEAT_BAR_SOUNDS).map((s) => s.key),
    ...Object.values(HEAT_MARK_SOUNDS).map((s) => s.key),
    HEAT_ZONE_BUILD_SOUND.key,
  ]),
].sort();
