// Crucible tier-set ENGINE bonuses (Ignivar raid loot Phase B): the 2-piece
// and 4-piece payloads for the 29 five-piece sets, as TalentEffect records
// accumulated into the wearer's TalentModifiers by src/sim/set_bonus_mods.ts.
//
// Every bonus here modifies the spec's underlying engine (rotation loop,
// resource bank, signature mechanic), never raw stats: that is the maintainer
// ruling (docs/prd/ignivar-raid-loot.md, decision 7), and it is why these live
// on the TALENT seam rather than in item_sets.ts's SetBonusEffect stat
// vocabulary. The canonical design for all 58 bonuses, including the
// per-bonus implementation notes and same-change copy obligations, is
// docs/prd/ignivar-set-bonus-final.md.
//
// Two implementation shapes, often combined:
//  - GENERIC: the tier's `effect` is a plain TalentEffect (ability rows,
//    procs, global mods) that accumulateTalentEffect applies with zero
//    class-module changes.
//  - BESPOKE: the tier's real logic is a call-site bend inside the class
//    module, gated on the wearer flag the resolver registers for every met
//    tier (`setBonusFlag(setId, pieces)` in mods.selected, exactly how talent
//    options gate their call sites). The `effect` then carries only the
//    audited numbers under `tuning`, so tooltip-accuracy tests can pin the
//    authored copy against the implementation constants.
//
// ROLLOUT LEDGER: sets register here (and in item_sets.ts, which owns the
// tooltip text) one class wave at a time, text and engine TOGETHER, so a
// tooltip never promises an unimplemented bonus. The not-yet-registered set
// ids stay pinned ABSENT in tests/ignivar_loot.test.ts until their wave.
//
// Data-as-code: balance numbers live here, never inline in the engine.
// `src/sim`-pure; no rng, no clock.

import type { TalentEffect } from './talents';

export interface SetEngineBonusTier {
  pieces: number;
  effect: TalentEffect;
}

// The wearer flag registered in TalentModifiers.selected for every met tier:
// bespoke call sites gate on it exactly like a talent option id.
export function setBonusFlag(setId: string, pieces: number): string {
  return `setbonus_${setId}_${pieces}pc`;
}

// Audited constants for the bespoke warrior bends (read by the class module
// call sites AND pinned by tests, so the copy cannot drift from the code).
/** Slagbreaker 4pc: seconds refunded from Breachmaker per Redhand cast. */
export const SLAGBREAKER_4PC_BREACHMAKER_REFUND_SEC = 3;
/** Emberfury 2pc: seconds added to every Enrage trigger's duration. */
export const EMBERFURY_2PC_ENRAGE_DURATION_BONUS = 2;
/** Emberfury 4pc: Bloodletting's self-heal fraction of max health (base 0.03). */
export const EMBERFURY_4PC_BLOODLETTING_HEAL_PCT_MAX = 0.08;
/** Forgewall 2pc: absorb granted per rage spent by Iron Resolve (base 4). */
export const FORGEWALL_2PC_ABSORB_PER_RAGE = 5;
/** Forgewall 4pc: seconds refunded from Iron Resolve per Shieldcrack cast. */
export const FORGEWALL_4PC_IRON_RESOLVE_REFUND_SEC = 2;

// Audited constants for the bespoke paladin bends (read by the class-module
// call sites AND pinned by tests, so the copy cannot drift from the code).
/** Dawnforged 2pc: Beacon of Light transfer fraction (base BEACON_HEAL_FRACTION 0.5).
 *  Baked into the beacon AURA VALUE at placement, the ONE source both the
 *  heal.ts transfer arithmetic and the aura mirror read, so the two readers
 *  can never diverge. A gear swap after placement keeps the placed fraction
 *  until the beacon is re-cast (the same at-grant snapshot the Zealfire 4pc
 *  aura bake uses). */
export const DAWNFORGED_2PC_BEACON_HEAL_FRACTION = 0.55;
/** Dawnforged 4pc: the Radiant Resonance empowered Dawn's Embrace cast time
 *  (base RADIANT_RESONANCE_DAWN_CAST_TIME 1.5): instant for wearers. */
export const DAWNFORGED_4PC_DAWN_CAST_TIME = 0;
/** Oathpyre 2pc: Vowkeeper Strike's Solar Reprisal arm chance (base 0.2). */
export const OATHPYRE_2PC_VOWKEEPER_CHANCE = 0.3;
/** Oathpyre 2pc: the block-arm Solar Reprisal chance (base 0.25). */
export const OATHPYRE_2PC_BLOCK_CHANCE = 0.4;
/** Oathpyre 4pc: shield fraction of max health on Solar Reprisal consume. */
export const OATHPYRE_4PC_SHIELD_PCT_MAX = 0.06;
/** Oathpyre 4pc: shield duration in seconds. */
export const OATHPYRE_4PC_SHIELD_DURATION_SEC = 10;
/** Zealfire 2pc: the Final Edict / Dawnfall paired cooldown cut in seconds
 *  (base DAWN_RHYTHM_COOLDOWN_REDUCTION 2). */
export const ZEALFIRE_2PC_DAWN_RHYTHM_CUT_SEC = 3;
/** Zealfire 4pc: Dawn's Wrath Hammer of Wrath damage mult (base 1.2). */
export const ZEALFIRE_4PC_DAWNS_WRATH_DAMAGE_MULT = 1.4;

// Audited constants for the bespoke hunter bends (read by the class-module
// call sites AND pinned by tests, so the copy cannot drift from the code).
/** Packlord 4pc: Pack Command's Stampede reset chance (base
 *  STAMPEDE_RESET_CHANCE 0.2). The threshold moves on the SAME single roll at
 *  tryResetStampede, so no rng stream shift for wearers or non-wearers; the
 *  5-fail bad-luck cap is untouched. */
export const PACKLORD_4PC_STAMPEDE_RESET_CHANCE = 0.3;
/** Coldsight 2pc: extra Focus on Measured Shot, applied by the named module
 *  hook AFTER the Cold Focus absolute rewrite (20 to 25 outside the window,
 *  30 to 35 inside it; Harrier's 1.5x multiplies the result afterward, the
 *  disclosed 38/53). */
export const COLDSIGHT_2PC_MEASURED_SHOT_FOCUS_BONUS = 5;
/** Coldsight 4pc: seconds each Long Draw critical adds to the running Cold
 *  Focus window. */
export const COLDSIGHT_4PC_CRIT_EXTENSION_SEC = 2;
/** Coldsight 4pc: total extension cap per Cold Focus window, in seconds. */
export const COLDSIGHT_4PC_WINDOW_EXTENSION_CAP_SEC = 6;
/** Slagsnare 2pc: Focus a landed Gutting Strike grants (base 15). The
 *  Harrier and Efficient Rhythm riders apply after (preResolved false),
 *  exactly as they do for the base grant. */
export const SLAGSNARE_2PC_GUTTING_STRIKE_FOCUS = 20;
/** Slagsnare 4pc: the once-per-8-sec momentum-preserve lockout; deliberately
 *  MATCHES the Hunting Momentum window by construction. */
export const SLAGSNARE_4PC_MOMENTUM_ICD_SEC = 8;

/** The engine payloads, keyed by set id (the `set` tag on each member item
 *  and the ItemSet id in item_sets.ts). Tiers ascend by pieces. */
export const SET_ENGINE_BONUSES: Record<string, readonly SetEngineBonusTier[]> = {
  // ---- Warrior ----
  slagbreaker: [
    {
      pieces: 2,
      // Redhand's Maiming Strike empower rises 20 -> 30 percent per stack:
      // buffPct scales the selfBuff value at cast (stack cap 2 untouched).
      effect: { ability: [{ ability: 'overpower', buffPct: 0.5 }] },
    },
    {
      pieces: 4,
      // Every SECOND Redhand cast refunds Breachmaker cooldown: n:2 is the
      // adversarial-round sizing (Redhand's two parallel charges sustain ~1
      // cast per 2.5s, so n:1 would out-refund the cooldown's own ticking),
      // and the tooltip text says "every second cast" to match honestly.
      // Generic proc machinery: castNth draws no rng without a chance field,
      // so non-wearers and wearers alike keep their rng streams.
      effect: {
        proc: {
          id: 'set_slagbreaker_4pc',
          name: 'Slagbreaker Momentum',
          trigger: { on: 'castNth', n: 2, abilities: ['overpower'] },
          responses: [
            {
              kind: 'cooldownRefund',
              ability: 'breachmaker',
              seconds: SLAGBREAKER_4PC_BREACHMAKER_REFUND_SEC,
            },
          ],
        },
        tuning: { breachmakerRefundSec: SLAGBREAKER_4PC_BREACHMAKER_REFUND_SEC },
      },
    },
  ],
  emberfury: [
    {
      pieces: 2,
      // Enrage 4 -> 6 sec on BOTH sources: durationFlat rewrites the
      // RESOLVED enrageChance durations (applyTalentMods' rewrite-list
      // extension), so the engine and the tooltip read the same number.
      // Disclosed in the set doc: Enrage carries +25 percent attack speed,
      // a haste-to-swings rage-income coupling watched in tuning.
      effect: {
        ability: [
          { ability: 'bloodthirst', durationFlat: EMBERFURY_2PC_ENRAGE_DURATION_BONUS },
          { ability: 'red_harvest', durationFlat: EMBERFURY_2PC_ENRAGE_DURATION_BONUS },
        ],
        tuning: { enrageDurationBonusSec: EMBERFURY_2PC_ENRAGE_DURATION_BONUS },
      },
    },
    {
      pieces: 4,
      // Bespoke: Bloodletting's enrage roll is SKIPPED (always Enrages;
      // wearers legitimately shift the rng stream, disclosed for seeded
      // suites) and its self-heal rises to 8 percent of max health.
      effect: { tuning: { bloodlettingHealPctMax: EMBERFURY_4PC_BLOODLETTING_HEAL_PCT_MAX } },
    },
  ],
  forgewall: [
    {
      pieces: 2,
      // Iron Resolve converts rage at 5 absorb per point instead of 4: the
      // buffPct row scales the RESOLVED absorbSpentResource mult (4 x 1.25,
      // applyTalentMods' scaleEffect extension), so the dispatch and the
      // tooltip read the same rate. No cross-ability collateral: the row is
      // scoped to iron_resolve alone.
      effect: {
        ability: [{ ability: 'iron_resolve', buffPct: 0.25 }],
        tuning: { absorbPerRage: FORGEWALL_2PC_ABSORB_PER_RAGE },
      },
    },
    {
      pieces: 4,
      // Each Shieldcrack cast (ability id shield_slam) refunds Iron Resolve
      // cooldown. 2 not 3: Colossal Might compounding at 3 drove the
      // effective cooldown under the 10s absorb, destroying the undrained
      // remainder via same-id refresh (the set doc's sizing note).
      effect: {
        proc: {
          id: 'set_forgewall_4pc',
          name: 'Forgewall Tempering',
          trigger: { on: 'castNth', n: 1, abilities: ['shield_slam'] },
          responses: [
            {
              kind: 'cooldownRefund',
              ability: 'iron_resolve',
              seconds: FORGEWALL_4PC_IRON_RESOLVE_REFUND_SEC,
            },
          ],
        },
        tuning: { ironResolveRefundSec: FORGEWALL_4PC_IRON_RESOLVE_REFUND_SEC },
      },
    },
  ],
  // ---- Paladin ----
  dawnforged: [
    {
      pieces: 2,
      // Beacon of Light copies 55 percent instead of 50: bespoke bend at the
      // beacon placement (combat/paladin_beacon.ts bakes the wearer fraction
      // into the aura value; heal.ts's transfer arithmetic reads that value).
      // The healer 2pc pushback rider rides the GENERIC global knob:
      // castPushbackReduction 1 folds into the recalc alongside the stat-set
      // sources (max-combined), so damage taken no longer delays casting.
      effect: {
        global: { castPushbackReduction: 1 },
        tuning: { beaconHealFraction: DAWNFORGED_2PC_BEACON_HEAL_FRACTION },
      },
    },
    {
      pieces: 4,
      // The Radiant Resonance empowered Dawn's Embrace goes 1.5 sec -> instant:
      // bespoke bend on the ONE cast-time knob (radiantResonanceCastTime),
      // keyed on abilityId so the Mending Light instant arm and every other
      // cast stay untouched. Billing and the aura consume ride the existing
      // instant-cast machinery (the Ascension-instant path), so no rng draw
      // moves for anyone.
      effect: { tuning: { radiantResonanceDawnCastTime: DAWNFORGED_4PC_DAWN_CAST_TIME } },
    },
  ],
  oathpyre: [
    {
      pieces: 2,
      // Solar Reprisal arms more often: bespoke chance selection at the ONE
      // grant site (tryGrantSolarReprisal). The same single rng draw happens
      // either way, only the threshold moves, so no stream shift for wearers
      // or non-wearers. No internal cooldown exists: a re-arm while armed
      // refreshes the one aura (same id + source), the disclosed soft cap.
      effect: {
        tuning: {
          vowkeeperArmChance: OATHPYRE_2PC_VOWKEEPER_CHANCE,
          blockArmChance: OATHPYRE_2PC_BLOCK_CHANCE,
        },
      },
    },
    {
      pieces: 4,
      // Consuming Solar Reprisal (any of the THREE consumers: Sunward Disc,
      // Hammer of Grace, or Mending Light; the heal route is deliberate)
      // shields for 6 percent of max health for 10 sec. Fixed aura id, so the
      // three consumers refresh ONE absorb; a refresh replaces the undrained
      // remainder (the same-id semantics disclosed for Forgewall 4pc).
      effect: {
        tuning: {
          shieldPctMaxHp: OATHPYRE_4PC_SHIELD_PCT_MAX,
          shieldDurationSec: OATHPYRE_4PC_SHIELD_DURATION_SEC,
        },
      },
    },
  ],
  zealfire: [
    {
      pieces: 2,
      // Final Edict and Dawnfall cut each other's cooldown by 3 sec instead
      // of 2: bespoke reduction selection fed into triggerPaladinDawnRhythm
      // at both dispatch sites (the fixpoint sizing verified in band by the
      // set doc). Deterministic, no rng involved.
      effect: { tuning: { dawnRhythmCutSec: ZEALFIRE_2PC_DAWN_RHYTHM_CUT_SEC } },
    },
    {
      pieces: 4,
      // Hammer of Wrath under Dawn's Wrath strikes 40 percent harder, up
      // from 20. The wearer mult is baked into the AURA VALUE at grant and
      // the consume reads the aura back, so the HUD's dynamic {pct} print
      // stays honest for every wearer. Multiplicative with Ascension's 1.3
      // (1.82 total), disclosed by the set doc.
      effect: { tuning: { dawnsWrathDamageMult: ZEALFIRE_4PC_DAWNS_WRATH_DAMAGE_MULT } },
    },
  ],
  // ---- Hunter ----
  packlord_emberhide: [
    {
      pieces: 2,
      // Pack Command 4 -> 3 sec: a cooldownPct row on the resolved entry, so
      // the engine's cooldown set and the tooltip's printed cooldown line read
      // the same number. Roughly +13 percent Unleash cadence (the set doc's
      // third-round arithmetic: three casts span two cooldown intervals plus
      // the fixed 8s frenzy lockout); dead inside Howling Rage, accepted.
      effect: { ability: [{ ability: 'pack_command', cooldownPct: -0.25 }] },
    },
    {
      pieces: 4,
      // Bespoke: the Stampede reset roll's threshold rises 0.2 -> 0.3 at the
      // ONE tryResetStampede draw (combat/hunter_packlord.ts). The same single
      // rng draw happens either way, only the threshold moves; the 5-fail
      // bad-luck cap asserts base behavior and stays untouched.
      effect: { tuning: { stampedeResetChance: PACKLORD_4PC_STAMPEDE_RESET_CHANCE } },
    },
  ],
  coldsight_trackers: [
    {
      pieces: 2,
      // Bespoke: +5 Focus on Measured Shot via the named module hook AFTER
      // the Cold Focus absolute rewrite (combat/hunter_coldsight.ts): no
      // flat-resource key exists and an addEffects row would double-map, so
      // the hook bends the resolved gainResource amount (20 -> 25; 30 -> 35
      // inside the window; the shared resolver's Harrier multiplier lands
      // after, the disclosed 38/53).
      effect: { tuning: { measuredShotFocusBonus: COLDSIGHT_2PC_MEASURED_SHOT_FOCUS_BONUS } },
    },
    {
      pieces: 4,
      // Bespoke: Long Draw criticals extend the Cold Focus window 2 sec each,
      // up to 6 per window. The crit already rolled in the shared damage
      // block is observed (one plumbed argument), so no draw moves for
      // anyone; the extension re-derives Apex Instinct (window + 4) and
      // stretches the 2pc's in-window rewrite with it (intra-set
      // compounding, disclosed by the set doc).
      effect: {
        tuning: {
          critExtensionSec: COLDSIGHT_4PC_CRIT_EXTENSION_SEC,
          windowExtensionCapSec: COLDSIGHT_4PC_WINDOW_EXTENSION_CAP_SEC,
        },
      },
    },
  ],
  slagsnare: [
    {
      pieces: 2,
      // Bespoke: the module-constant Gutting Strike focus grant rises
      // 15 -> 20 at the grantHunterFocus call site
      // (combat/hunter_fieldcraft.ts); preResolved stays false so the Harrier
      // and Efficient Rhythm riders apply after, exactly as for the base
      // grant. Deterministic, no rng involved.
      effect: { tuning: { guttingStrikeFocus: SLAGSNARE_2PC_GUTTING_STRIKE_FOCUS } },
    },
    {
      pieces: 4,
      // Bespoke: a Woundrend that consumes 3 Hunting Momentum preserves the
      // stacks, once per 8 sec (the lockout deliberately MATCHES the Momentum
      // window). Scoped to the Woundrend consume site ONLY: the Re-entry
      // consumers still spend the stacks, and payoffs stay at 3-stack value.
      effect: { tuning: { momentumPreserveIcdSec: SLAGSNARE_4PC_MOMENTUM_ICD_SEC } },
    },
  ],
};
