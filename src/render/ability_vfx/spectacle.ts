// Central spectacle-calibration constants for the per-ability VFX engine,
// tuned against the Ability VFX Gallery with the A/B pixel harness
// (scripts/_tmp_ab_measure.mjs: effect pixel coverage / peak luminance delta /
// bbox vs the gallery ground truth, measured at the DEFAULT chase camera).
//
// The measured gap lived in the 0.3s CRESCENDO of targeted abilities: at
// release/impact the game effect occupied the same screen region as the
// gallery (bbox ~1.0, per-pixel peak ~0.75x) but was sparse inside it —
// coverage 4.5-12.7x smaller (lightning_bolt 12.7:1, heroic_strike 8:1,
// fireball 6:1). Ground novas, shout rings, buff orbits, and persistence were
// already AT gallery parity, so these multipliers deliberately apply only to
// the targeted-crescendo archetypes and leave the radial/held families alone.
//
// Every constant multiplies an authored spawn value at a single seam in
// fx.ts / sequencer.ts; degrade tiers scale off the same seams, so tier
// ratios are preserved. Nothing here changes pool caps, slot counts, or
// per-frame allocation behavior: bigger sprites/ribbons/quads ride the same
// pooled primitives.
import type { AbilityVfxArchetype } from '../ability_vfx_core';

// The archetypes whose release/impact moment measured far below the gallery.
// nova/shout (ground rings at parity), heal/buff/cc (gentle by design), and
// summon/dash/beam (already carried by their own set-pieces) stay at 1x.
const CRESCENDO_ARCHETYPES: ReadonlySet<AbilityVfxArchetype> = new Set([
  'bolt',
  'strike',
  'burst',
  'dot',
] as AbilityVfxArchetype[]);

export function isCrescendoArchetype(arch: AbilityVfxArchetype): boolean {
  return CRESCENDO_ARCHETYPES.has(arch);
}

export const SPECTACLE = {
  // ---- release: the caster's cast-off moment (sequencer.release/transients)
  /** Transient release-star size multiplier (gallery caster flash). */
  releaseStar: 3.0,
  /** Release flash duration in seconds (was 0.10; gallery holds ~0.35s hot). */
  releaseDur: 0.28,
  /** Radial filament sprites fanning out of the release flash (overlay pushes,
   *  immediate-mode: zero pool cost). */
  releaseFilaments: 10,
  /** Vertical shock halo radius at the caster on release (yd, x power). */
  releaseRingR: 2.5,
  /** Release light-pulse intensity multiplier. */
  releaseLight: 2.6,
  /** Release spark-burst count multiplier. */
  releaseSparks: 1.8,

  // ---- travel: the projectile in flight (fx.sequenceBolt)
  /** Styled/comet trail ribbon width multiplier. */
  boltWidth: 2.0,
  /** Projectile head-sprite scale multiplier. */
  boltHead: 1.6,

  /** Release cast-off flipbook size (yd, x power; tier 0). The gallery fires
   *  a full-size explosion sheet AT the caster on release — the single
   *  biggest reason its release frame reads 8x denser than the game's. */
  releaseFlipbook: 4.2,

  // ---- impact: the landing stack (sequencer.impact)
  /** Impact flipbook world-size multiplier. */
  flipbook: 2.3,
  /** Impact spark-burst count multiplier (still capped at 60 in the seam). */
  impactSparkCount: 1.6,
  /** Impact spark-burst power (spread velocity) multiplier. */
  impactSparkPower: 1.3,
  /** Impact light-pulse intensity multiplier (pooled point light, range 7yd:
   *  in a daylight scene the lit ground IS most of the readable coverage). */
  impactLight: 2.6,
  /** Vertical impact halo radius multiplier. */
  vRing: 1.7,
  /** Staggered follow-up ring (ring2/ring3) radius multiplier. */
  followRing: 1.45,
  /** Strike slash-arc scale multiplier (span; width follows via the ribbon
   *  seam's width-with-scale rule). Melee contact measured 8-20x under. */
  strikeArc: 2.1,
  /** Second staggered flipbook 0.22s after the first (tier 0): stretches the
   *  hot window toward the gallery's ~1s aftermath instead of a 0.45s pop. */
  flipbook2Delay: 0.22,
  /** Crescendo flipbook HDR multiplier: colored sheets (flame, void) on the
   *  bright daylit terrain read far dimmer than the gallery's night stage —
   *  brightness, not size, is the honest recovery lever. Rides bloom. */
  flipbookHdr: 1.35,
  /** Finisher impact light pillar (radius yd x power, height yd, seconds).
   *  The gallery's post-impact column IS its impact-phase coverage. */
  pillarR: 1.0,
  pillarH: 6.5,
  pillarDur: 1.1,
  /** Sustained afterglow light: intensity and seconds (crescendo tier 0,
   *  fired with the impact so the lit ground carries the aftermath). */
  sustainLight: 4.5,
  sustainLightDur: 1.8,
  /** Point-light range (yd) for crescendo release/impact pulses (pool default
   *  is 7): in daylight the lit-ground disc IS most of the readable area. */
  lightRange: 10,

  // ---- linger: the afterglow dwell (sequencer.update)
  /** Seconds of post-impact afterglow (fading ground dome + periodic embers)
   *  for SPELL crescendos (bolt/burst/dot) at tier 0 — strikes stay
   *  momentary: metal flashes and is gone (gallery strike linger ~0.005).
   *  Independent of the authored linger so short-linger finishers
   *  (mind_blast) still hold a readable aftermath. */
  afterglowDur: 2.8,
  /** Afterglow ember-burst period in seconds. */
  afterglowEvery: 0.45,
  /** Afterglow dome sprite size (yd). */
  afterglowSize: 1.5,
} as const;

// Ribbon slash arcs widen with their span so a scaled-up arc keeps its
// aspect instead of turning into a thin hoop (applied inside ribbons.ts).
export function slashWidthScale(scale: number): number {
  return 0.55 + 0.45 * scale;
}
