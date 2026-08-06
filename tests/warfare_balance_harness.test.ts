// The phase 0 balance harness, rebuilt against the SHIPPING implementation.
//
// docs/warfare-refactor/00-analysis.md derived every tuning number in this
// program from a model of the PROPOSED values. This file measures the values
// that actually shipped and confirms the two agree, which is the real acceptance
// criterion for the balance work (05-verification.md, "Balance re-check before
// merge"). It is committed rather than left a scratch script so a future tuning
// pass cannot quietly invalidate the anti-hybrid property.
//
// The model is an auto-attack proxy using the engine's own conventions:
//   dps      = (weaponDps + attackPower / 14) * (1 + crit) * hitFactor * (1 + meleeHaste)
//   incoming = dps * (1 - armorReduction(targetArmor, 20)) * (1 + offense) * (1 - defense)
//   ttk      = defenderHealth / incoming
// Reported as a PvE ADVANTAGE RATIO, the ratio of the two time-to-kill values:
// above 1.00 the PvE-geared character wins, below 1.00 the honor-geared one does.
//
// It models auto-attacks only. Abilities also scale off attack power so the
// direction holds, and the 4-piece crowd-control reduction and the 7-piece
// signature proc are excluded, both of which favour the honor-geared character.
// Differences under about 0.05x are inside the model's noise.
//
// Four traps that produced wrong numbers on earlier passes, per 00-analysis.md:
//  - meleeHaste is a FRACTION, not a divisor.
//  - the win condition is the RATIO of time-to-kill values; lower kills faster.
//  - the jewelry stat fraction is applied separately from the armor one, so the
//    row that ships (0.90 armor, 0.75 jewelry) is a different character from the
//    sweep's clean 0.90-everywhere row. Measure the one that ships.
//  - hit rating is not cosmetic: every badge jewelry piece carries 25 rating and
//    no WARFARE piece carries any, so omitting hitFactor flatters the honor kit
//    by roughly 5 percent.
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/sim/data';
import { createPlayer, recalcPlayerStats } from '../src/sim/entity';
import { PVP_DEFENSE_CAP, PVP_OFFENSE_CAP, pvpFractionsFromRatings } from '../src/sim/pvp';
import type { Entity, EquipSlot } from '../src/sim/types';
import { armorReduction } from '../src/sim/types';

type Kit = Partial<Record<EquipSlot, string>>;

// The PvE reference deliberately stacks the maximum realistic set bonuses:
// deathlord covers four slots and crownforged four, overlapping only on helmet,
// so one warrior fills all seven armor slots and collects five bonus tiers at
// once. Exact ids so this is reproducible rather than described.
const PVE_T1_T2: Kit = {
  mainhand: 'deathless_greatblade',
  helmet: 'heroic_deathlords_dread_visage',
  chest: 'heroic_deathlord_warplate',
  legs: 'heroic_deathlord_legguards',
  feet: 'deathlord_sabatons',
  gloves: 'crownforged_gauntlets',
  waist: 'crownforged_girdle',
  shoulder: 'heroic_crownforged_warspaulders',
  neck: 'medallion_of_endless_profit',
  ring1: 'seal_of_the_nine_oaths',
  ring2: 'oath_of_the_round_table',
};

const PVE_BIS: Kit = { ...PVE_T1_T2, mainhand: 'heroic_kingsbane_last_oath' };

// The Strength-mail profile from tests/pvp_honor_gear.test.ts.
const WARFARE_KIT: Kit = {
  mainhand: 'final_argument_greatblade',
  helmet: 'furyforged_warhelm',
  shoulder: 'furyforged_warspaulders',
  chest: 'furyforged_warplate',
  waist: 'furyforged_girdle',
  legs: 'furyforged_legguards',
  gloves: 'furyforged_gauntlets',
  feet: 'furyforged_sabatons',
  neck: 'final_oath_medallion',
  ring1: 'iron_vow_band',
  ring2: 'unbroken_circle',
};

// The build the 7-of-7 capstone exists to kill: abandon the most expensive armor
// piece, which is also the one with the best PvE replacement.
const WARFARE_MINUS_CHEST: Kit = { ...WARFARE_KIT, chest: 'heroic_deathlord_warplate' };

function geared(kit: Kit): Entity {
  // A missing id would silently measure a naked slot and quietly move every
  // ratio, so fail loudly instead.
  for (const [slot, id] of Object.entries(kit)) {
    expect(ITEMS[id], `reference item ${id} (${slot}) must exist`).toBeDefined();
  }
  const e = createPlayer(0, 'warrior', { x: 0, y: 0, z: 0 }, '');
  e.level = 20;
  recalcPlayerStats(e, 'warrior', kit as never, undefined, {});
  return e;
}

function weaponDps(kit: Kit): number {
  const w = kit.mainhand ? ITEMS[kit.mainhand]?.weapon : undefined;
  return w ? (w.min + w.max) / 2 / w.speed : 0;
}

function dpsOf(e: Entity, kit: Kit): number {
  // hitFactor: the engine's base 5 percent miss, less whatever hit the kit buys.
  const hitFactor = 1 - Math.max(0, 0.05 - e.hitBonus);
  return (
    (weaponDps(kit) + e.attackPower / 14) * (1 + e.critChance) * hitFactor * (1 + e.meleeHaste)
  );
}

function timeToKill(attacker: Entity, aKit: Kit, defender: Entity): number {
  const incoming =
    dpsOf(attacker, aKit) *
    (1 - armorReduction(defender.stats.armor, 20)) *
    (1 + attacker.stats.pvpOffense) *
    (1 - defender.stats.pvpDefense);
  return defender.maxHp / incoming;
}

/** Above 1.00 the PvE-geared warrior wins; below 1.00 the honor-geared one does. */
function pveAdvantage(honorKit: Kit, pveKit: Kit): number {
  const honor = geared(honorKit);
  const pve = geared(pveKit);
  return timeToKill(honor, honorKit, pve) / timeToKill(pve, pveKit, honor);
}

function gearWarfareRating(kit: Kit): number {
  return Object.values(kit).reduce((sum, id) => sum + (ITEMS[id]?.pvpOffenseRating ?? 0), 0);
}

describe('WARFARE balance re-check (merge blocker)', () => {
  it('lands the complete kit plus capstone near parity with the reference warrior', () => {
    const ratio = pveAdvantage(WARFARE_KIT, PVE_T1_T2);
    // 00-analysis.md predicted 1.03x for the SHIPPING configuration (0.90 armor,
    // 0.75 jewelry), not the 1.00x of the clean 0.90-everywhere sweep row. The
    // implementation measures 0.988x. Every stat line in that document reproduces
    // exactly (260 attack power, 1,722 health, 7.0% crit against 444 / 1,972 /
    // 10.2%), so the gap is not a stat error: it is ARMOR. The sweep pins attack
    // power and health for its proposed rows but never armor, and section 2.2 of
    // 02-gear-and-sets.md requires WARFARE armor be matched to the same-slot
    // ilvl-31 PvE epic curve, which lifts the kit from the 2,021 that document
    // measured "as shipped" to 2,198. A tougher defender lengthens the PvE
    // character's time to kill and pushes the ratio down by about that 0.04.
    //
    // Inside the model's own stated 0.05x noise floor, and nearer a dead-even
    // fight than the prediction was. The band is deliberately wider than the gap
    // so a routine armor or budget nudge does not red this spuriously; what it
    // still catches is a real regression to either blowout.
    expect(ratio, `measured PvE advantage vs T1+T2 was ${ratio.toFixed(3)}x`).toBeGreaterThan(0.95);
    expect(ratio, `measured PvE advantage vs T1+T2 was ${ratio.toFixed(3)}x`).toBeLessThan(1.1);
  });

  it('still loses to a rift legendary weapon, which is the point of a legendary', () => {
    const ratio = pveAdvantage(WARFARE_KIT, PVE_BIS);
    expect(ratio, `measured PvE advantage vs full BiS was ${ratio.toFixed(3)}x`).toBeGreaterThan(1);
  });

  it('makes abandoning the chest measurably WORSE, which is what the 7-of-7 capstone buys', () => {
    const full = pveAdvantage(WARFARE_KIT, PVE_T1_T2);
    const dropped = pveAdvantage(WARFARE_MINUS_CHEST, PVE_T1_T2);
    // Under the rejected 6-of-7 design this build measured 0.89x against the full
    // kit's 1.03x: the cheaper build won outright and the seventh armor slot was
    // strictly dominated. At 7 of 7, dropping the chest forfeits both the piece's
    // own rating AND the 80/80 capstone, so it must land clearly worse. This is
    // the check a future tuning pass is most likely to invalidate by accident.
    expect(
      dropped,
      `dropping the chest measured ${dropped.toFixed(3)}x against the full kit's ${full.toFixed(3)}x`,
    ).toBeGreaterThan(full + 0.15);
  });

  it('raises the base kit above what ships today rather than regressing it', () => {
    // The rejected 0.77 rating fraction would have landed here at 141 (14.1%),
    // making every partial kit worse per honor spent while prices rose 1.75x.
    // Measured off the ITEMS themselves, not through recalcPlayerStats: a live
    // character in this kit also wears the seven-piece set, so the resolved
    // fraction there is the CAPSTONE value, not the base one.
    const rating = gearWarfareRating(WARFARE_KIT);
    expect(rating, `full 11-slot base WARFARE rating was ${rating}`).toBe(182);
    const base = pvpFractionsFromRatings(rating, rating);
    expect(base.offense).toBeCloseTo(0.182, 6);
    expect(base.defense).toBeCloseTo(0.182, 6);
    expect(base.offense).toBeGreaterThan(0.168); // better per piece than what ships today
  });

  it('records the maximum gear swing the raised caps allow in every hostile context', () => {
    // Global caps: this swing applies to ranked arena and duels as well as
    // battlegrounds. Accepted for this program, with the split-cap lever in
    // PvpCaps pre-identified if live ranked data says it is too wide.
    expect(PVP_OFFENSE_CAP).toBe(0.3);
    expect(PVP_DEFENSE_CAP).toBe(0.3);
    const swing = (1 + PVP_OFFENSE_CAP) / (1 - PVP_DEFENSE_CAP);
    expect(swing, `maximum gear swing is ${swing.toFixed(3)}x`).toBeCloseTo(1.857, 3);
  });
});
