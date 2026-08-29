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

// Audited constants for the bespoke rogue bends (read by the class-module
// call sites AND pinned by tests, so the copy cannot drift from the code).
/** Cinderfang 2pc: energy refunded per qualifying Venom Ritual builder cast
 *  (base VENOM_STAGE_REFUND 15). BOTH refund readers in
 *  combat/rogue_engines.ts (the Venom Dart grant and the Craven Thrust
 *  grant) bend together; the Wicked Slash fallback keeps its existing
 *  exclusion (the anti-self-funding guard), so a non-dagger build forced
 *  onto the fallback feels nothing, disclosed by the set doc. */
export const CINDERFANG_2PC_VENOM_STAGE_REFUND = 20;
/** Smolderstrike 4pc: seconds refunded from Mirrored Blades (blade_flurry)
 *  per Lights Out cast. */
export const SMOLDERSTRIKE_4PC_MIRRORED_BLADES_REFUND_SEC = 6;
/** Ashveil 4pc: the Veiled Edge aura VALUE baked at arm time (base
 *  VEILED_EDGE_BONUS 1). consumeVeiledEdge returns 1 + value, so 2 reads
 *  back as the promised triple. */
export const ASHVEIL_4PC_VEILED_EDGE_BONUS = 2;

// Audited constants for the bespoke priest bends (read by the class-module
// call sites AND pinned by tests, so the copy cannot drift from the code).
/** Emberscreed (Creed of Embers) 2pc: ADDITIVE bonus on the Doctrine link
 *  conversion, applied on BOTH twin branches at placeDoctrineLink (0.3 -> 0.4
 *  base, 0.7 -> 0.8 under Twin Covenant). The bonus is baked into the link
 *  aura VALUE at placement, so old links keep their placed rate for up to the
 *  30 sec duration (snapshot-at-placement, the beacon/Dawn's Wrath posture);
 *  the 0.15 no-link fallback is deliberately untouched. */
export const EMBERSCREED_2PC_DOCTRINE_CONVERSION_BONUS = 0.1;
/** Emberscreed 4pc: seconds the instant Scouring Hymn empower lasts after a
 *  fully consumed Psalm of Warding. */
export const EMBERSCREED_4PC_HYMN_WINDOW_SEC = 10;
/** Emberscreed 4pc: the internal cooldown between empower grants. */
export const EMBERSCREED_4PC_HYMN_ICD_SEC = 15;
/** Benison Dawnweave 2pc: Seraphic Vigil's resolved rescue heal (base 180
 *  x the 1.5 buffPct row; heal_echo is in neither the integral nor the
 *  scalable buff-kind sets, so the resolved value is exactly this flat 270). */
export const BENISON_2PC_VIGIL_RESCUE_HEAL = 270;
/** Benison Dawnweave 4pc: the mend on the Vigil's ally, as a fraction of the
 *  ALLY'S max health, paid over the duration below. */
export const BENISON_4PC_MEND_PCT_MAX = 0.15;
/** Benison Dawnweave 4pc: mend duration in seconds. */
export const BENISON_4PC_MEND_DURATION_SEC = 10;
/** Benison Dawnweave 4pc: seconds between mend ticks (5 ticks total). */
export const BENISON_4PC_MEND_TICK_INTERVAL_SEC = 2;
/** Vesperash 2pc: seconds cut from Call Tithefiend's cooldown (base 30). */
export const VESPERASH_2PC_TITHEFIEND_COOLDOWN_CUT_SEC = 6;
/** Vesperash 4pc: multiplier on the Tithefiend's per-hit mana return (base
 *  TITHEFIEND_MANA_RETURN_RATE 0.01 stays untouched for everyone else). */
export const VESPERASH_4PC_MANA_RETURN_MULT = 2;

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
  // ---- Rogue ----
  cinderfang: [
    {
      pieces: 2,
      // Bespoke: the per-builder energy refund rises 15 -> 20 at BOTH
      // VENOM_STAGE_REFUND readers (the Venom Dart grant and the Craven
      // Thrust grant in combat/rogue_engines.ts). The refund stays per
      // qualifying BUILDER CAST, unconditional at the stage cap, and the
      // Wicked Slash fallback keeps its exclusion (the anti-self-funding
      // guard is NOT widened), so a non-dagger build feels nothing
      // (disclosed by the set doc). Deterministic, no rng involved.
      effect: { tuning: { venomStageRefund: CINDERFANG_2PC_VENOM_STAGE_REFUND } },
    },
    {
      pieces: 4,
      // Venom Dart 8 -> 4 sec: a cooldownFlat row on the resolved entry
      // (applyTalentMods adds after cooldownPct and clamps at 0, so the -4
      // lands at exactly 4), so the engine's cooldown set and the printed
      // cooldown line read the same number. The set doc's honesty note: the
      // dominant effect is the ENERGY economy (the dart is net 10 energy vs
      // Craven Thrust's net 45), and about a third of each wound extension
      // overcaps at the 20 sec pin; stages-per-cycle are unchanged so the
      // 6-vs-5 finisher alternation stays structurally intact.
      effect: { ability: [{ ability: 'venom_dart', cooldownFlat: -4 }] },
    },
  ],
  smolderstrike: [
    {
      pieces: 2,
      // Haymaker (body_blow, the Wicked Slash transform inside the Redline
      // run) hits 20 percent harder: a dmgPct row. The transform re-bake in
      // Sim.resolvedAbility (the applyTalentMods pass keyed by the FINAL id
      // after resolveActionReplacement) is what carries an ability row onto
      // a transformed weaponStrike at all. DELIVERED +17.2 percent: the
      // additive accumulator folds the row beside Thuggery's 0.16 global
      // (1.36 / 1.16, stated by the set doc).
      effect: { ability: [{ ability: 'body_blow', dmgPct: 0.2 }] },
    },
    {
      pieces: 4,
      // Lights Out (knockout_blow, the Dirt Nap transform) refunds Mirrored
      // Blades (blade_flurry), unconditional: the cast funnel reports the
      // TRANSFORMED id, so castNth n:1 sees every Lights Out. Refunds that
      // land while Mirrored Blades is off cooldown are dropped by the
      // talent_procs guard (disclosed). castNth draws no rng without a
      // chance field, so wearers and non-wearers keep their rng streams.
      effect: {
        proc: {
          id: 'set_smolderstrike_4pc',
          name: 'Smolderstrike Rhythm',
          trigger: { on: 'castNth', n: 1, abilities: ['knockout_blow'] },
          responses: [
            {
              kind: 'cooldownRefund',
              ability: 'blade_flurry',
              seconds: SMOLDERSTRIKE_4PC_MIRRORED_BLADES_REFUND_SEC,
            },
          ],
        },
        tuning: { mirroredBladesRefundSec: SMOLDERSTRIKE_4PC_MIRRORED_BLADES_REFUND_SEC },
      },
    },
  ],
  ashveil: [
    {
      pieces: 2,
      // Lurker's Strike hits 25 percent harder: a dmgPct row on the
      // resolved ambush entry. DELIVERED ~+20 percent: the additive
      // accumulator folds the row beside the spec baseline's 0.16 ambush
      // row and the 0.08 global (1.49 / 1.24, stated by the set doc); the
      // in-veil Veiled Edge multiplier applies to the scaled weapon
      // component afterward.
      effect: { ability: [{ ability: 'ambush', dmgPct: 0.25 }] },
    },
    {
      pieces: 4,
      // Bespoke: the Veiled Edge bonus 1 -> 2 is baked into the edge aura
      // VALUE at arm time (the wearer is known at the detonation), and
      // consumeVeiledEdge already returns 1 + edge.value, so the consume
      // reads the triple back dynamically. Deterministic, no rng involved.
      effect: { tuning: { veiledEdgeBonus: ASHVEIL_4PC_VEILED_EDGE_BONUS } },
    },
  ],
  // ---- Priest ----
  emberscreed: [
    {
      pieces: 2,
      // Bespoke: +0.10 ADDITIVE on the Doctrine link conversion, on BOTH twin
      // branches at placeDoctrineLink (combat/priest/doctrine.ts): 0.3 -> 0.4
      // base and 0.7 -> 0.8 under Twin Covenant. The rate is baked into the
      // link aura VALUE at placement, so links placed before a gear change
      // keep their placed rate for up to the 30 sec link duration
      // (snapshot-at-placement); the 0.15 no-link fallback stays untouched.
      // The healer/caster 2pc pushback rider rides the generic global knob.
      // Deterministic, no rng involved.
      effect: {
        global: { castPushbackReduction: 1 },
        tuning: { doctrineConversionBonus: EMBERSCREED_2PC_DOCTRINE_CONVERSION_BONUS },
      },
    },
    {
      pieces: 4,
      // A fully consumed Psalm of Warding makes the next Scouring Hymn
      // (ability id smite) within 10 sec instant, once per 15 sec. Generic
      // proc machinery on the shieldConsumed trigger; the trigger's optional
      // internal cooldown is this bonus's extension of that trigger (the
      // castNth/spellCrit icds-map idiom in combat/talent_procs.ts). Draws no
      // rng; the aura NAME deliberately reuses the localized 'Scouring Hymn'
      // ability string, so no new sim_i18n dictionary row is needed.
      effect: {
        proc: {
          id: 'set_emberscreed_4pc',
          name: 'Scouring Hymn',
          trigger: {
            on: 'shieldConsumed',
            ability: 'power_word_shield',
            icd: EMBERSCREED_4PC_HYMN_ICD_SEC,
          },
          responses: [
            {
              kind: 'empowerNext',
              aura: 'next_cast_instant',
              abilities: ['smite'],
              duration: EMBERSCREED_4PC_HYMN_WINDOW_SEC,
            },
          ],
        },
        tuning: {
          hymnWindowSec: EMBERSCREED_4PC_HYMN_WINDOW_SEC,
          hymnIcdSec: EMBERSCREED_4PC_HYMN_ICD_SEC,
        },
      },
    },
  ],
  benison_dawnweave: [
    {
      pieces: 2,
      // Seraphic Vigil's rescue 180 -> 270: buffPct 0.5 scales the RESOLVED
      // buffTarget heal_echo value (heal_echo is in neither the integral nor
      // the scalable buff-kind sets, so the resolved value is exactly the
      // flat 270 the tooltip promises). The {vigilHeal} description splice
      // reads the same resolved value, so the printed number stays honest
      // for wearers and everyone else. Deterministic, no rng involved.
      effect: {
        ability: [{ ability: 'seraphic_vigil', buffPct: 0.5 }],
        global: { castPushbackReduction: 1 },
        tuning: { vigilRescueHeal: BENISON_2PC_VIGIL_RESCUE_HEAL },
      },
    },
    {
      pieces: 4,
      // Bespoke: when a Vigil triggers, its ally is also mended for 15
      // percent of the ALLY'S max health over 10 sec. Hooked at the
      // vigil-trigger POINT in damage.ts beside priestOnVigilTriggered
      // (which stays talent-gated for Incarnate Spirit; the set arm is
      // flag-gated instead, combat/priest/benison.ts). Replaces the killed
      // cooldown-reset idea: Twin Covenant's charge model deletes the
      // cooldowns entry, making cooldownRefund a hard no-op. Draws no rng.
      effect: {
        tuning: {
          mendPctMaxHp: BENISON_4PC_MEND_PCT_MAX,
          mendDurationSec: BENISON_4PC_MEND_DURATION_SEC,
          mendTickIntervalSec: BENISON_4PC_MEND_TICK_INTERVAL_SEC,
        },
      },
    },
  ],
  vesperash: [
    {
      pieces: 2,
      // Call Tithefiend 30 -> 24 sec: a cooldownFlat row on the resolved
      // entry, so the engine's cooldown set and the HUD's printed cooldown
      // read the same number. Honest sizing note from the set doc: the
      // Gloomtithe bank still saturates roughly 13 of every 24 sec; the gain
      // is about +25 percent full-strength fiend uptime. Deterministic.
      effect: {
        ability: [
          {
            ability: 'summon_tithefiend',
            cooldownFlat: -VESPERASH_2PC_TITHEFIEND_COOLDOWN_CUT_SEC,
          },
        ],
        global: { castPushbackReduction: 1 },
      },
    },
    {
      pieces: 4,
      // Calling the Tithefiend resets Mindfracture (ability id mind_blast):
      // castNth n:1 sees every Call Tithefiend cast and the 'reset' refund
      // clears the whole cooldown (castNth draws no rng without a chance
      // field). The doubled per-hit mana return is a bespoke call-site
      // multiplier in combat/priest/vespers.ts; the base rate constant and
      // its literal test pin stay untouched for everyone else.
      effect: {
        proc: {
          id: 'set_vesperash_4pc',
          name: 'Vesperash Communion',
          trigger: { on: 'castNth', n: 1, abilities: ['summon_tithefiend'] },
          responses: [{ kind: 'cooldownRefund', ability: 'mind_blast', seconds: 'reset' }],
        },
        tuning: { manaReturnMult: VESPERASH_4PC_MANA_RETURN_MULT },
      },
    },
  ],
};
