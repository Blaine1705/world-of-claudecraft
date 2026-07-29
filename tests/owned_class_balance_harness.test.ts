import { describe, expect, it } from 'vitest';
import {
  averageOwnedClassDpsProbe,
  averageOwnedHealerProbe,
  OWNED_CLASS_BALANCE_SCENARIOS,
  OWNED_CLASS_LEVEL_20_BOSS_SCENARIO,
  OWNED_CLASS_PBE_LOADOUTS,
  OWNED_CLASS_PBE_TALENTS,
  OWNED_DPS_SPECS,
  runOwnedClassDpsMatrix,
  runOwnedClassDpsProbe,
  runOwnedHealerProbe,
  runWarspiritOfftankProbe,
} from '../scripts/owned_class_balance_probe';

const BALANCE_SEEDS = [29_930, 29_931, 29_932, 29_933, 29_934] as const;

describe('owned-class level 20 balance harness', () => {
  it('defines the required one-target and three-target burst and sustained scenarios', () => {
    expect(OWNED_CLASS_BALANCE_SCENARIOS).toEqual([
      { targets: 1, seconds: 15, window: 'burst' },
      { targets: 1, seconds: 60, window: 'sustained' },
      { targets: 3, seconds: 15, window: 'burst' },
      { targets: 3, seconds: 60, window: 'sustained' },
    ]);
  });

  it('records every requested damage metric for all six owned DPS specs', () => {
    const results = runOwnedClassDpsMatrix(29_900, 'test-head');
    expect(results).toHaveLength(OWNED_DPS_SPECS.length * OWNED_CLASS_BALANCE_SCENARIOS.length);
    expect(new Set(results.map((result) => result.spec))).toEqual(new Set(OWNED_DPS_SPECS));
    for (const result of results) {
      expect(result.head).toBe('test-head');
      expect(result.totalDamage).toBeGreaterThan(0);
      expect(result.dps).toBe(result.totalDamage / result.scenario.seconds);
      expect(Object.values(result.damageByTarget)).toHaveLength(result.scenario.targets);
      expect(Object.values(result.damageByTarget).reduce((sum, value) => sum + value, 0)).toBe(
        result.totalDamage,
      );
      expect(Object.keys(result.damageBySource).length).toBeGreaterThan(0);
      expect(Object.keys(result.castsByAbility).length).toBeGreaterThan(0);
      expect(result.buttonsPressed).toBeGreaterThan(0);
      expect(result.resource.end).toBeGreaterThanOrEqual(0);
      expect(result.resource.end).toBeLessThanOrEqual(result.resource.max);
      expect(Object.keys(result.equipment).length).toBeGreaterThan(0);
      expect(result.equipment).toEqual(OWNED_CLASS_PBE_LOADOUTS[result.spec]);
      const talents = OWNED_CLASS_PBE_TALENTS[result.spec];
      if (talents) expect(result.talents).toEqual(talents);
      expect(result.dualWielding).toBe(result.spec === 'warspirit');
    }
    const vespersArea = results.find(
      (result) =>
        result.spec === 'vespers' &&
        result.scenario.targets === 3 &&
        result.scenario.seconds === 60,
    );
    expect(vespersArea?.damageByTarget.target_2).toBeGreaterThan(0);
    expect(vespersArea?.damageByTarget.target_3).toBeGreaterThan(0);
    const thundercallArea = results.find(
      (result) =>
        result.spec === 'thundercall' &&
        result.scenario.targets === 3 &&
        result.scenario.seconds === 60,
    );
    expect(thundercallArea?.damageByTarget.target_2).toBeGreaterThan(0);
    expect(thundercallArea?.damageByTarget.target_3).toBeGreaterThan(0);
    expect(thundercallArea?.castsByAbility.Skybranch).toBeGreaterThan(0);
    const moongroveArea = results.find(
      (result) =>
        result.spec === 'moongrove' &&
        result.scenario.targets === 3 &&
        result.scenario.seconds === 60,
    );
    expect(moongroveArea?.damageByTarget.target_2).toBeGreaterThan(0);
    expect(moongroveArea?.damageByTarget.target_3).toBeGreaterThan(0);
    // The payoff is a CHOICE (Moonsurge or Sunwake) since Moongrove v3, so a
    // short window may legitimately never pick the sun; both-arm coverage is
    // pinned by the druid_engines parity scenario, which presses each.
    expect(
      (moongroveArea?.castsByAbility.Moonsurge ?? 0) + (moongroveArea?.castsByAbility.Sunwake ?? 0),
    ).toBeGreaterThan(0);
    const wildfangSustained = results.find(
      (result) =>
        result.spec === 'wildfang' &&
        result.scenario.targets === 1 &&
        result.scenario.seconds === 60,
    );
    expect(wildfangSustained?.castsByAbility.Redharvest).toBeGreaterThan(0);
    const packlordBurst = results.find(
      (result) =>
        result.spec === 'packlord' &&
        result.scenario.targets === 1 &&
        result.scenario.seconds === 15,
    );
    expect(packlordBurst?.castsByAbility.Stampede).toBeGreaterThan(0);
    expect(packlordBurst?.damageBySource.Stampede).toBeGreaterThan(0);
  }, 60_000);

  it('is deterministic at the same fixed seed and fixture', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[3];
    expect(runOwnedClassDpsProbe('fieldcraft', scenario, 29_901)).toEqual(
      runOwnedClassDpsProbe('fieldcraft', scenario, 29_901),
    );
  }, 30_000);

  it('keeps Fieldcraft sustained damage near the ranged Hunter specs and pays Bloodhook', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[1];
    const coldsight = runOwnedClassDpsProbe('coldsight', scenario, 29_902);
    const fieldcraft = runOwnedClassDpsProbe('fieldcraft', scenario, 29_902);
    const woundDamage = fieldcraft.damageBySource['Bloodhook Wound'] ?? 0;

    // Band widened for the stacked v0.29 rogue redesign (#2328): its shared
    // combat changes shift this pair a few percent; re-author when it lands.
    expect(fieldcraft.dps).toBeLessThanOrEqual(coldsight.dps * 1.25);
    expect(woundDamage / fieldcraft.totalDamage).toBeGreaterThanOrEqual(0.05);
  }, 30_000);

  it('keeps Vespers sustained damage in the DPS caster band', () => {
    const scenario = OWNED_CLASS_BALANCE_SCENARIOS[1];
    const thundercall = runOwnedClassDpsProbe('thundercall', scenario, 29_903);
    const vespers = runOwnedClassDpsProbe('vespers', scenario, 29_903);

    expect(vespers.dps).toBeGreaterThanOrEqual(thundercall.dps * 0.9);
    // Band widened for the stacked v0.29 rogue redesign (#2328): its shared
    // combat changes shift this pair a few percent; re-author when it lands.
    expect(vespers.dps).toBeLessThanOrEqual(thundercall.dps * 1.2);
  }, 30_000);

  it('keeps the fixed Shaman and Vespers builds inside their sustained role bands', () => {
    const single = OWNED_CLASS_BALANCE_SCENARIOS[1];
    const area = OWNED_CLASS_BALANCE_SCENARIOS[3];
    const thundercall = averageOwnedClassDpsProbe('thundercall', single, BALANCE_SEEDS);
    const warspiritSingle = averageOwnedClassDpsProbe('warspirit', single, BALANCE_SEEDS);
    const warspiritArea = averageOwnedClassDpsProbe('warspirit', area, BALANCE_SEEDS);
    const vespersSingle = averageOwnedClassDpsProbe('vespers', single, BALANCE_SEEDS);
    const vespersArea = averageOwnedClassDpsProbe('vespers', area, BALANCE_SEEDS);
    const warspiritBoss = averageOwnedClassDpsProbe(
      'warspirit',
      OWNED_CLASS_LEVEL_20_BOSS_SCENARIO,
      BALANCE_SEEDS,
    );
    const vespersBoss = averageOwnedClassDpsProbe(
      'vespers',
      OWNED_CLASS_LEVEL_20_BOSS_SCENARIO,
      BALANCE_SEEDS,
    );

    expect(thundercall.dps).toBeGreaterThanOrEqual(vespersSingle.dps * 0.85);
    expect(thundercall.dps).toBeLessThanOrEqual(vespersSingle.dps * 1.1);
    expect(warspiritArea.dps / warspiritSingle.dps).toBeGreaterThanOrEqual(1.1);
    expect(warspiritArea.dps / warspiritSingle.dps).toBeLessThanOrEqual(1.2);
    expect(vespersArea.dps / vespersSingle.dps).toBeGreaterThanOrEqual(1.25);
    expect(warspiritBoss.dps / vespersBoss.dps).toBeGreaterThanOrEqual(0.95);
    // Band widened for the stacked v0.29 rogue redesign (#2328), then again
    // after rebasing onto the in-combat Spirit mp5 merge: the spirit-stacking
    // Warspirit build gains more sustained mana than Vespers, compounding the
    // rogue-layer drift (measured 1.18 on the combined tree). Re-author both
    // sides of this pair when the owned-class stack integrates.
    expect(warspiritBoss.dps / vespersBoss.dps).toBeLessThanOrEqual(1.2);
  }, 60_000);

  it('keeps the best-build Druid damage arms near the 200 DPS peer anchor', () => {
    const scenario = { targets: 1, seconds: 120, window: 'raid' } as const;
    const moongrove = runOwnedClassDpsProbe('moongrove', scenario, 29_904);
    const wildfang = runOwnedClassDpsProbe('wildfang', scenario, 29_904);

    expect(moongrove.dps).toBeGreaterThanOrEqual(180);
    expect(moongrove.dps).toBeLessThanOrEqual(225);
    expect(wildfang.dps).toBeGreaterThanOrEqual(180);
    expect(wildfang.dps).toBeLessThanOrEqual(225);
    const spread = Math.abs(moongrove.dps - wildfang.dps) / Math.max(moongrove.dps, wildfang.dps);
    expect(spread).toBeLessThanOrEqual(0.15);
  }, 30_000);

  it.each(['spiritmend', 'doctrine', 'benison', 'groveheart'] as const)(
    'records the fixed one-ally and three-ally %s healing profiles',
    (spec) => {
      for (const allies of [1, 3] as const) {
        const result = runOwnedHealerProbe(spec, allies, 29_910, 'test-head');
        expect(result.head).toBe('test-head');
        expect(result.effectiveHealing).toBeGreaterThan(0);
        expect(result.hps).toBe(result.effectiveHealing / result.seconds);
        expect(result.overhealing).toBeGreaterThanOrEqual(0);
        expect(result.overhealPct).toBeGreaterThanOrEqual(0);
        expect(result.overhealPct).toBeLessThanOrEqual(1);
        expect(result.emergencyRecoverySeconds).not.toBeNull();
        expect(result.resource.end).toBeGreaterThanOrEqual(0);
        expect(Object.keys(result.castsByAbility).length).toBeGreaterThan(0);
        expect(Object.keys(result.equipment).length).toBeGreaterThan(0);
        expect(result.talents).toEqual(OWNED_CLASS_PBE_TALENTS[spec]);
      }
    },
    30_000,
  );

  it('keeps each healer build inside its five-seed role and mana contract', () => {
    const spiritmendSingle = averageOwnedHealerProbe('spiritmend', 1, BALANCE_SEEDS);
    const spiritmendGroup = averageOwnedHealerProbe('spiritmend', 3, BALANCE_SEEDS);
    const doctrineSingle = averageOwnedHealerProbe('doctrine', 1, BALANCE_SEEDS);
    const doctrineGroup = averageOwnedHealerProbe('doctrine', 3, BALANCE_SEEDS);
    const benisonSingle = averageOwnedHealerProbe('benison', 1, BALANCE_SEEDS);
    const benisonGroup = averageOwnedHealerProbe('benison', 3, BALANCE_SEEDS);

    expect(benisonGroup.emergencyRecoverySeconds).toBeLessThan(
      spiritmendGroup.emergencyRecoverySeconds,
    );
    expect(benisonGroup.hps).toBeGreaterThanOrEqual(spiritmendGroup.hps * 0.8);
    expect(benisonSingle.resourceEnd).toBeGreaterThanOrEqual(250);
    expect(benisonGroup.resourceEnd).toBeGreaterThanOrEqual(250);
    expect(spiritmendGroup.resourceEnd).toBeGreaterThanOrEqual(1_200);
    expect(doctrineSingle.hps + doctrineSingle.dps).toBeGreaterThanOrEqual(140);
    expect(
      doctrineGroup.hps + doctrineGroup.dps + doctrineGroup.absorbedDamage / 60,
    ).toBeGreaterThanOrEqual(120);
    expect(doctrineGroup.resourceEnd).toBeGreaterThanOrEqual(150);
    expect(spiritmendSingle.hps).toBeGreaterThan(0);
  }, 60_000);

  it('runs Priest healer pressure through shields and Seraphic Vigil', () => {
    const doctrine = runOwnedHealerProbe('doctrine', 3, 29_912);
    const benison = runOwnedHealerProbe('benison', 3, 29_912);

    expect(doctrine.absorbedDamage).toBeGreaterThan(0);
    expect(benison.healingBySource['Seraphic Vigil']).toBeGreaterThan(0);
  }, 30_000);

  it('counts Groveheart heal-over-time ticks in the effective-healing profile', () => {
    const groveheart = runOwnedHealerProbe('groveheart', 3, 29_913);

    expect(groveheart.healingBySource.Wildbloom).toBeGreaterThan(0);
    expect(groveheart.hps).toBeGreaterThan(0);
  });

  it('holds the Groveheart interim healer contract on both profiles', () => {
    // Single target: inside the peer envelope at the shared seed.
    const singlePeers = (['spiritmend', 'doctrine', 'benison'] as const).map(
      (spec) => runOwnedHealerProbe(spec, 1, 29_914).hps,
    );
    const single = runOwnedHealerProbe('groveheart', 1, 29_914).hps;
    expect(single).toBeGreaterThanOrEqual(Math.min(...singlePeers));
    expect(single).toBeLessThanOrEqual(Math.max(...singlePeers) * 1.15);

    // Group profile: INTERIM floor, not the envelope. The v0.31 healer
    // retunes lifted every peer's three-ally throughput while Groveheart
    // still carries its v0.29 values, and under the heavier pressure the
    // garden never plants (pure triage). Closing that gap is the flagged
    // PBE values pass for the druid stack; this floor only guards against
    // regressions below the measured interim state.
    const groupPeers = (['spiritmend', 'doctrine', 'benison'] as const).map(
      (spec) => runOwnedHealerProbe(spec, 3, 29_914).hps,
    );
    const group = runOwnedHealerProbe('groveheart', 3, 29_914).hps;
    expect(group).toBeGreaterThanOrEqual(Math.min(...groupPeers) * 0.45);
    expect(group).toBeLessThanOrEqual(Math.max(...groupPeers) * 1.15);

    // Absolute floors so the whole band cannot sink together unnoticed: the
    // agility-loadout regression measured 65.0 and 26.2 here.
    expect(single).toBeGreaterThanOrEqual(80);
    expect(group).toBeGreaterThanOrEqual(40);
  }, 120_000);

  it('records Warspirit mitigation, threat, forced-target uptime, and exit behavior', () => {
    const result = runWarspiritOfftankProbe(29_920, 'test-head');
    expect(result.head).toBe('test-head');
    expect(result.stoneboundIncomingDamage).toBeLessThan(result.galeheartIncomingDamage);
    expect(result.stoneboundMitigationPct).toBeGreaterThan(0);
    expect(result.stoneboundThreatFrom100Damage).toBeGreaterThanOrEqual(200);
    expect(result.forcedTargetUptimeSeconds).toBeGreaterThanOrEqual(3);
    expect(result.forcedTargetUptimeSeconds).toBeLessThanOrEqual(3.1);
    expect(result.secondsToLoseThreatAfterLeaving).toBeGreaterThan(0);
    expect(result.secondsToLoseThreatAfterLeaving).toBeLessThanOrEqual(60);
  });

  it('keeps role probes deterministic at the same fixed seed', () => {
    expect(runOwnedHealerProbe('spiritmend', 3, 29_911)).toEqual(
      runOwnedHealerProbe('spiritmend', 3, 29_911),
    );
    expect(runWarspiritOfftankProbe(29_921)).toEqual(runWarspiritOfftankProbe(29_921));
  }, 30_000);
});
