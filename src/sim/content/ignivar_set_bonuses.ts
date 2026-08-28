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
};
