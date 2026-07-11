// TEMPORARY integration freeze for PR #1762 (the warrior level-20 balance
// round). DELETE this file and tests/warrior_balance_freeze.golden.json once
// the PR is integrated and every SANCTIONED pin below has been consciously
// re-minted to its new value.
//
// Purpose: the PR's merge into release/v0.24.0-ptr is textually near-clean,
// so the risk is a SEMANTIC one: a stray hunk or a careless conflict
// resolution silently moving something outside the reviewed balance scope.
// This suite splits the world in two:
//   FROZEN: everything that must stay byte-identical through the merge:
//     every cw_ classic-warrior ability (the side-by-side baseline), every
//     non-warrior class's abilities/kit/specs/rows, every warrior ability
//     OUTSIDE the sanctioned list, and every item except the two greatblades
//     the PR re-declares two-handed (plus wyrmfang's generated heroic
//     variant, which inherits the hand and needs the 2H budget fix).
//   SANCTIONED: the exact changes PR #1762 is allowed to make, pinned to
//     their CURRENT (pre-merge) values. Each pin fails when the PR lands;
//     re-mint it to the PR's value as you verify that change is the one you
//     reviewed. Anything failing in FROZEN is a stop-the-line finding.
//
// Engine-file changes (area_echo, casting_lifecycle, effect_dispatch,
// empower_next) cannot be data-hashed here; they are covered by the parity
// suite (48 of 49 goldens must stay byte-identical; only
// talents_progression legitimately moves, re-minted on the PR side) and the
// warrior class suites.
//
// Mint/re-mint the FROZEN golden:
//   UPDATE_WARRIOR_FREEZE=1 npx vitest run tests/warrior_balance_integration_freeze.test.ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABILITIES, abilitiesKnownAt, CLASSES } from '../src/sim/content/classes';
import { ROW_TREES } from '../src/sim/content/talent_rows';
import { computeTalentModifiers, emptyAllocation, TALENTS } from '../src/sim/content/talents';
import { ITEMS } from '../src/sim/data';
import { weaponHand } from '../src/sim/equipment_rules';
import { ALL_CLASSES, ENRAGE_DMG_DONE, type PlayerClass } from '../src/sim/types';

// The warrior abilities PR #1762 re-tunes (their defs are excluded from the
// FROZEN hash map and pinned individually in SANCTIONED below).
const SANCTIONED_ABILITIES = new Set([
  'overpower',
  'raging_gale',
  'slam',
  'red_harvest',
  'enrage_passive',
  'sweeping_strikes',
  'cleave',
  'mortal_strike',
  'bloodthirst',
  'whirlwind',
]);
// The items the PR declares two-handed (and the integration re-stats to the
// TWOHAND_STAT_MULT budget); wyrmfang's generated heroic variant inherits.
const SANCTIONED_ITEMS = new Set([
  'wyrmfang_greatblade',
  'deathless_greatblade',
  'heroic_wyrmfang_greatblade',
]);
// The one warrior row option the PR reworks (Blood Offering -> Hardened
// Blood). Its OPTION ID must survive (persisted rowPicks reference it).
const SANCTIONED_ROW_OPTION = 'war_row_blood_offering';

const GOLDEN_PATH = join(__dirname, 'warrior_balance_freeze.golden.json');
const UPDATE = process.env.UPDATE_WARRIOR_FREEZE === '1';

// Stable stringify (sorted object keys) so hashes never depend on key order.
// Functions inside defs serialize as undefined and are dropped: acceptable
// for a temporary tripwire (no sanctioned def carries function fields).
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : val,
  );
}
const h = (v: unknown): string => createHash('sha256').update(stable(v)).digest('hex').slice(0, 16);

interface FreezeGolden {
  abilityIds: string[];
  itemIds: string[];
  abilities: Record<string, string>;
  items: Record<string, string>;
  kits: Record<string, string>;
  specs: Record<string, string>;
  rows: Record<string, string>;
}

function currentFreeze(): FreezeGolden {
  const abilities: Record<string, string> = {};
  for (const [id, def] of Object.entries(ABILITIES)) {
    if (!SANCTIONED_ABILITIES.has(id)) abilities[id] = h(def);
  }
  const items: Record<string, string> = {};
  for (const [id, def] of Object.entries(ITEMS)) {
    if (!SANCTIONED_ITEMS.has(id)) items[id] = h(def);
  }
  const kits: Record<string, string> = {};
  for (const cls of ALL_CLASSES) {
    // The warrior kit LIST is sanctioned (whirlwind joins it); pinned below.
    if (cls !== 'warrior') kits[cls] = h(CLASSES[cls].abilities);
  }
  const specs: Record<string, string> = {};
  const rows: Record<string, string> = {};
  for (const cls of ALL_CLASSES) {
    specs[cls] = h(TALENTS[cls] ?? null);
    const tree = ROW_TREES[cls] ?? null;
    const masked = tree?.map((row) => ({
      ...row,
      options: row.options.map((o) =>
        o.id === SANCTIONED_ROW_OPTION ? { id: o.id, masked: 'SANCTIONED(pr-1762)' } : o,
      ),
    }));
    rows[cls] = h(masked ?? null);
  }
  return {
    abilityIds: Object.keys(ABILITIES).sort(),
    itemIds: Object.keys(ITEMS).sort(),
    abilities,
    items,
    kits,
    specs,
    rows,
  };
}

function loadGolden(): FreezeGolden {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as FreezeGolden;
}

function hashDrift(current: Record<string, string>, golden: Record<string, string>): string[] {
  const drifted: string[] = [];
  for (const [id, hash] of Object.entries(golden)) {
    if (current[id] !== hash) drifted.push(id);
  }
  return drifted;
}

describe('FROZEN: nothing outside the sanctioned PR #1762 scope may move', () => {
  it('mints the golden when UPDATE_WARRIOR_FREEZE=1', () => {
    if (!UPDATE && existsSync(GOLDEN_PATH)) return;
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(currentFreeze(), null, 2)}\n`);
  });

  it('the ability and item ID SETS are unchanged (no additions, no removals)', () => {
    const golden = loadGolden();
    const cur = currentFreeze();
    expect(cur.abilityIds).toEqual(golden.abilityIds);
    expect(cur.itemIds).toEqual(golden.itemIds);
  });

  it('every non-sanctioned ability def is byte-identical (cw_ classic kit included)', () => {
    const drifted = hashDrift(currentFreeze().abilities, loadGolden().abilities);
    expect(drifted, `ability defs drifted outside the sanctioned scope: ${drifted}`).toEqual([]);
  });

  it('every non-sanctioned item def is byte-identical', () => {
    const drifted = hashDrift(currentFreeze().items, loadGolden().items);
    expect(drifted, `item defs drifted outside the sanctioned scope: ${drifted}`).toEqual([]);
  });

  it('every non-warrior kit list, all spec defs, and all row trees are byte-identical', () => {
    const cur = currentFreeze();
    const golden = loadGolden();
    for (const [k, v] of Object.entries(golden.kits)) expect(cur.kits[k], `kit ${k}`).toBe(v);
    for (const [k, v] of Object.entries(golden.specs)) expect(cur.specs[k], `specs ${k}`).toBe(v);
    for (const [k, v] of Object.entries(golden.rows)) expect(cur.rows[k], `rows ${k}`).toBe(v);
  });

  it('the reworked row OPTION ID survives (persisted rowPicks reference it)', () => {
    const warriorRows = ROW_TREES.warrior ?? [];
    const ids = warriorRows.flatMap((row) => row.options.map((o) => o.id));
    expect(ids).toContain(SANCTIONED_ROW_OPTION);
  });
});

// Helpers for the abilitiesKnownAt pins (mirrors tests/spec_gating.test.ts).
const modsFor = (spec: string | null) =>
  computeTalentModifiers('warrior', { ...emptyAllocation(), spec });
const knownDef = (spec: string | null, id: string) =>
  abilitiesKnownAt('warrior', 20, modsFor(spec)).find((k) => k.def.id === id);

describe('SANCTIONED: the exact PR #1762 changes, pinned to their CURRENT values', () => {
  // Every pin here FAILS when the PR lands. Re-mint each to the PR's value as
  // you confirm that change is the reviewed one; a value that does not match
  // the PR's stated target is a finding, not a re-mint.

  it('overpower (Redhand): cost 20 (base and rank), fury-only exclusion [PR: cost 15, excludeSpecs +prot]', () => {
    expect(ABILITIES.overpower.cost).toBe(20);
    expect(ABILITIES.overpower.excludeSpecs).toEqual(['fury']);
    expect(stable(ABILITIES.overpower.ranks)).toContain('"cost":20');
  });

  it('raging_gale (Twinstrike): 2x 0.6W+24 [PR: 2x 0.4W+14]', () => {
    const strikes = ABILITIES.raging_gale.effects.filter((e) => e.type === 'weaponStrike');
    expect(strikes).toHaveLength(2);
    for (const s of strikes) {
      expect(s).toMatchObject({ bonus: 24, weaponMult: 0.6 });
    }
  });

  it('slam (Brute Swing): 15-rage spender, no cd, 1.0W+25 [PR: free 4s-cd builder, 0.5W+15, +8 rage]', () => {
    expect(ABILITIES.slam.cost).toBe(15);
    expect(ABILITIES.slam.cooldown ?? 0).toBe(0);
    expect(ABILITIES.slam.effects).toHaveLength(1);
    expect(ABILITIES.slam.effects[0]).toMatchObject({ type: 'weaponStrike', bonus: 25 });
  });

  it('red_harvest: 3x full-weapon+55 [PR: 3x 0.65W+25]', () => {
    const strikes = ABILITIES.red_harvest.effects.filter((e) => e.type === 'weaponStrike');
    expect(strikes).toHaveLength(3);
    for (const s of strikes) {
      expect(s).toMatchObject({ bonus: 55 });
      expect('weaponMult' in s).toBe(false);
    }
  });

  it('cleave (Reaping Arc): cost 20, 20-26 aoe without softCap [PR: cost 15, 30-38 softCap 5]', () => {
    expect(ABILITIES.cleave.cost).toBe(20);
    const aoe = ABILITIES.cleave.effects.find((e) => e.type === 'aoeDamage');
    expect(aoe).toMatchObject({ min: 20, max: 26, radius: 5 });
    expect(aoe && 'softCap' in aoe).toBe(false);
  });

  it('mortal_strike (Maiming Strike): +40 strike, 24 dot [PR: +50 strike, 30 dot]', () => {
    const strike = ABILITIES.mortal_strike.effects.find((e) => e.type === 'weaponStrike');
    expect(strike).toMatchObject({ bonus: 40 });
    const dot = ABILITIES.mortal_strike.effects.find((e) => e.type === 'dot');
    expect(dot).toMatchObject({ total: 24, duration: 6, interval: 3 });
  });

  it('bloodthirst (Bloodletting): 0.6W+35 [PR: 0.5W+30]', () => {
    const strike = ABILITIES.bloodthirst.effects.find((e) => e.type === 'weaponStrike');
    expect(strike).toMatchObject({ bonus: 35, weaponMult: 0.6 });
  });

  it('whirlwind (Bladed Gyre): unlearnable and spec-unrestricted [PR: fury-only, joins the kit]', () => {
    expect(CLASSES.warrior.abilities).not.toContain('whirlwind');
    expect(ABILITIES.whirlwind.specs).toBeUndefined();
  });

  it('the warrior kit list is exactly the current 39 [PR: whirlwind joins between red_harvest and faultline]', () => {
    expect(CLASSES.warrior.abilities).toEqual([
      'heroic_strike',
      'revenge',
      'battle_shout',
      'charge',
      'thunder_clap',
      'hamstring',
      'bloodrage',
      'overpower',
      'raging_gale',
      'raised_guard',
      'pummel',
      'execute',
      'furious_mending',
      'iron_resolve',
      'slam',
      'red_harvest',
      'faultline',
      'heroic_leap',
      'cleave',
      'rallying_cry',
      'emboldening_roar',
      'defiant_bellow',
      'battle_stance',
      'berserker_stance',
      'defensive_stance',
      'demoralizing_shout',
      'intimidating_shout',
      'sunder_armor',
      'taunt',
      'measured_fury',
      'seasoned_soldier',
      'sudden_death',
      'diabolical_twinstrike',
      'cleaving_blows',
      'breachmaker',
      'die_by_sword',
      'sweeping_strikes',
      'deep_wounds',
      'enrage_passive',
    ]);
  });

  it('sweeping_strikes: 75 percent copy metadata [PR: 100 percent, SWEEP_MULT exported at 1]', () => {
    expect(stable(ABILITIES.sweeping_strikes.effects)).toContain('0.75');
  });

  it('Enrage: 11 percent outgoing damage [PR: 7 percent]', () => {
    expect(ENRAGE_DMG_DONE).toBe(0.11);
    expect(ABILITIES.enrage_passive.description).toContain('11%');
  });

  it('execute (Early Grave) per-spec resolution: arms 15 rage, fury free without cd [PR: arms 10, fury 6s cd]', () => {
    expect(knownDef('arms', 'execute')?.cost).toBe(15);
    expect(knownDef(null, 'execute')?.cost).toBe(15);
    const fury = knownDef('fury', 'execute');
    expect(fury?.cost).toBe(0);
    expect(fury?.def.cooldown ?? 0).toBe(0);
  });

  it('Blood Offering row: bloodrage empower [PR: Hardened Blood armor stacks, SAME option id]', () => {
    const rows = ROW_TREES.warrior ?? [];
    const opt = rows.flatMap((r) => r.options).find((o) => o.id === SANCTIONED_ROW_OPTION);
    expect(opt?.name).toBe('Blood Offering');
    expect(stable(opt)).toContain('bloodrage');
  });

  it('the two greatblades are one-handed with 1H stat budgets [PR: hand twohand; re-stat to the 2H budget]', () => {
    // When these flip to twohand, our TWOHAND_STAT_MULT budget suite fails
    // (tests/item_level.test.ts, tests/heroic_loot_flair.test.ts) until they
    // are re-statted (wyrmfang to the 36-point, deathless to the 46-point 2H
    // budget) and makeHeroicVariant learns the 2H budget. That re-stat is
    // part of the sanctioned integration, not a separate balance decision.
    const wyrmfang = ITEMS.wyrmfang_greatblade;
    const deathless = ITEMS.deathless_greatblade;
    expect(wyrmfang.kind === 'weapon' && weaponHand(wyrmfang)).toBe('onehand');
    expect(wyrmfang.stats).toEqual({ str: 11, sta: 7 });
    expect(deathless.kind === 'weapon' && weaponHand(deathless)).toBe('onehand');
    expect(deathless.stats).toEqual({ str: 14, sta: 9 });
  });
});
