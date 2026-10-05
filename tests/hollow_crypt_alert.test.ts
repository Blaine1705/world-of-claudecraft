// The Hollow Crypt's wing-boss HUD copy: the encounter alert
// (src/ui/hud/dungeon/crypt_alert_view.ts), pure and driven from real fights
// (it reads only the auras the sim sets, so a real Sim drives it exactly as
// the HUD sees it, offline or mirrored online), the boss-aura tooltips
// (src/ui/crypt_aura_effect.ts: every number from the encounter tuning, and
// the heroic numbers from the same factor combat applies), and the Lady's
// loot display names (the spider placeholder's leftovers renamed, ids frozen).

import { describe, expect, it, vi } from 'vitest';
import { HEROIC_DUNGEON_TUNING } from '../src/sim/content/dungeon_difficulty';
import { ITEMS } from '../src/sim/data';
import {
  BELL_YARD,
  BONECHILL_RAVINE,
  CHORISTER_ID,
  GRAVE_LANTERNS,
  ILVANE_CRESCENDO,
  ILVANE_DIRGE_SILENCE,
  ILVANE_HARMONY,
  ILVANE_ID,
  ILVANE_TUNING,
  LADY_BRIDES_LAMENT,
  LADY_EMBRACE_HOLD,
  LADY_EMBRACED,
  LADY_FROZEN_EMBRACE,
  LADY_ID,
  LADY_LAMENT_DREAD,
  LADY_LINGERING_LAMENT,
  LADY_TUNING,
  MARROW_BLOW_STACKS,
  MARROW_DIRT_IN_EYES,
  MARROW_GRAVE_DIRT,
  MARROW_GRAVE_VIGOR,
  MARROW_ID,
  MARROW_MEASURE,
  MARROW_MEASURED,
  MARROW_TOLLING,
  MARROW_TUNING,
} from '../src/sim/encounters/hollow_crypt';
import { SLIPPERY_DEFAULT_GRIP, SLIPPERY_GROUND_AURA } from '../src/sim/slippery_ground';
import { DT, type Entity } from '../src/sim/types';
import { type AuraEffectInput, auraEffectDescriptor } from '../src/ui/aura_effect';
import { cryptAuraEffectDescriptor, cryptHeroicAmount } from '../src/ui/crypt_aura_effect';
import {
  buildCryptAlertView,
  CRYPT_ALERT_KINDS,
  type CryptAlertEntity,
  type CryptAlertInput,
  type CryptAlertView,
} from '../src/ui/hud/dungeon/crypt_alert_view';
import { t } from '../src/ui/i18n';
import { hudChromeStrings } from '../src/ui/i18n.catalog/hud_chrome';
import { en } from '../src/ui/i18n.resolved.generated/en';
import {
  aura,
  boss,
  cryptFight,
  type Fight,
  live as liveMobs,
  put,
  run,
  took,
  until,
} from './helpers/crypt_boss_fight';

vi.setConfig({ testTimeout: 90_000 });

const M = MARROW_TUNING;
const L = LADY_TUNING;
const I = ILVANE_TUNING;

function input(over: Partial<CryptAlertInput>): CryptAlertInput {
  return { auras: [], targetId: null, entity: () => null, ...over };
}

function live(v: CryptAlertView) {
  if (!v.visible) throw new Error('hidden');
  return v;
}

const kind = (over: Partial<CryptAlertInput>) => {
  const v = buildCryptAlertView(input(over));
  return v.visible ? v.kind : null;
};

describe('the crypt alert view (pure)', () => {
  it('hides when no Crypt mechanic concerns the player', () => {
    expect(buildCryptAlertView(input({})).visible).toBe(false);
    // The Dirge's silence is a plain silence: no alert.
    expect(kind({ auras: [{ id: ILVANE_DIRGE_SILENCE, remaining: 3, duration: 4 }] })).toBeNull();
  });

  it('the grave mark: title, line, and the bar is the time left', () => {
    const v = live(
      buildCryptAlertView(input({ auras: [{ id: MARROW_MEASURED, remaining: 1, duration: 4 }] })),
    );
    expect(v.kind).toBe('measured');
    expect(v.title).toBe(t('hudChrome.cryptAlert.measuredTitle'));
    expect(v.line).toBe(t('hudChrome.cryptAlert.measuredLine'));
    expect(v.progress).toBe(0.25);
    expect(v.progressAria).toBe(t('hudChrome.cryptAlert.timeAria', { seconds: '1' }));
    expect(v.pressable).toBe(false);
  });

  it("the Lament's line follows its value2 hint: 1 hold still, 0 get into the light", () => {
    const at = (value2: number) =>
      live(
        buildCryptAlertView(
          input({ auras: [{ id: LADY_LAMENT_DREAD, remaining: 1.5, duration: 3, value2 }] }),
        ),
      );
    expect(at(1).kind).toBe('lament-sheltered');
    expect(at(1).line).toBe(t('hudChrome.cryptAlert.lamentShelteredLine'));
    expect(at(0).kind).toBe('lament-open');
    expect(at(0).line).toBe(t('hudChrome.cryptAlert.lamentOpenLine'));
    expect(at(0).title).toBe(t('hudChrome.cryptAlert.lamentTitle'));
    expect(at(0).progress).toBe(0.5);
  });

  it('the grave underfoot carries no bar; the Embrace carries its own', () => {
    const grave = live(buildCryptAlertView(input({ auras: [{ id: MARROW_GRAVE_DIRT }] })));
    expect(grave.kind).toBe('grave');
    expect(grave.progress).toBeNull();
    const held = live(
      buildCryptAlertView(input({ auras: [{ id: LADY_EMBRACED, remaining: 3, duration: 12 }] })),
    );
    expect(held.kind).toBe('embraced');
    expect(held.progress).toBe(0.25);
  });

  it('priority: the mark over the Embrace over the Lament over the grave over the target', () => {
    const all = [
      { id: MARROW_MEASURED, remaining: 2, duration: 4 },
      { id: LADY_EMBRACED, remaining: 2, duration: 4 },
      { id: LADY_LAMENT_DREAD, remaining: 2, duration: 3, value2: 0 },
      { id: MARROW_GRAVE_DIRT },
    ];
    const tolling: CryptAlertEntity = { templateId: MARROW_ID, auras: [{ id: MARROW_TOLLING }] };
    const target = { targetId: 9, entity: () => tolling };
    expect(kind({ auras: all, ...target })).toBe('measured');
    expect(kind({ auras: all.slice(1), ...target })).toBe('embraced');
    expect(kind({ auras: all.slice(2), ...target })).toBe('lament-open');
    expect(kind({ auras: all.slice(3), ...target })).toBe('grave');
    expect(kind({ auras: [], ...target })).toBe('toll');
  });

  it('target readouts: only the right boss, alive, with the aura on', () => {
    const harmony = (value: number, templateId = ILVANE_ID, dead = false) =>
      kind({
        targetId: 3,
        entity: () => ({ templateId, dead, auras: [{ id: ILVANE_HARMONY, value }] }),
      });
    expect(harmony(0.6)).toBe('harmony');
    expect(harmony(0)).toBeNull();
    expect(harmony(0.6, CHORISTER_ID)).toBeNull();
    expect(harmony(0.6, ILVANE_ID, true)).toBeNull();
    const v = live(
      buildCryptAlertView(
        input({
          targetId: 3,
          entity: () => ({ templateId: ILVANE_ID, auras: [{ id: ILVANE_HARMONY, value: 0.3 }] }),
        }),
      ),
    );
    expect(v.line).toBe(t('hudChrome.cryptAlert.harmonyLine', { pct: '30' }));
    expect(v.progress).toBeNull();
    // A Tolling aura on anyone but Marrow reads nothing.
    expect(
      kind({
        targetId: 3,
        entity: () => ({ templateId: LADY_ID, auras: [{ id: MARROW_TOLLING }] }),
      }),
    ).toBeNull();
  });

  it('every kind it can return has a class the painter toggles', () => {
    expect([...CRYPT_ALERT_KINDS].sort()).toEqual(
      [
        'measured',
        'embraced',
        'lament-sheltered',
        'lament-open',
        'grave',
        'toll',
        'harmony',
      ].sort(),
    );
  });
});

describe('the crypt alert over real fights', () => {
  const viewFor = (f: Fight, p: Entity, targetId: number | null = null) =>
    buildCryptAlertView({
      auras: p.auras,
      targetId,
      entity: (id) => f.sim.ctx.entities.get(id),
    });

  function holdAll(f: Fight): () => void {
    const hold = [f.tank, ...f.others].map((p) => [p, p.pos.x - f.ox, p.pos.z - f.oz] as const);
    return () => {
      for (const [p, x, z] of hold) if (p.carriedBy === undefined) put(f, p, x, z);
    };
  }

  function marrowFight(difficulty: 'normal' | 'heroic' = 'normal') {
    const f = cryptFight(difficulty, 3, new Set([MARROW_ID]));
    const marrow = boss(f, MARROW_ID);
    put(f, marrow, BELL_YARD.x, BELL_YARD.z);
    put(f, f.tank, BELL_YARD.x, BELL_YARD.z - 2.5);
    const rim = [
      [BELL_YARD.x - 17, BELL_YARD.z + 6],
      [BELL_YARD.x + 17, BELL_YARD.z + 6],
      [BELL_YARD.x, BELL_YARD.z + 18],
    ];
    for (const [i, p] of f.others.entries()) put(f, p, rim[i][0], rim[i][1]);
    marrow.maxHp = 1e6;
    marrow.hp = marrow.maxHp;
    f.sim.ctx.aggroMob(marrow, f.tank, false);
    return { f, marrow };
  }

  it('Marrow: the marked player sees the mark, then the grave; the tank on him sees the Toll', () => {
    const { f, marrow } = marrowFight();
    const keep = holdAll(f);
    expect(until(f, () => marrow.castingAbility === MARROW_MEASURE, M.measureFirst + 1, keep)).toBe(
      true,
    );
    const victim = f.others.find((p) => p.id === marrow.castTargetId) as Entity;
    expect(until(f, () => aura(victim, MARROW_MEASURED) !== undefined, 2, keep)).toBe(true);
    const mark = live(viewFor(f, victim));
    expect(mark.kind).toBe('measured');
    expect(mark.progress).toBeGreaterThan(0.9);
    // Nobody else is warned.
    expect(viewFor(f, f.tank).visible).toBe(false);
    run(f, M.markSeconds + 0.5, keep);
    expect(aura(victim, MARROW_MEASURED)).toBeUndefined();
    expect(live(viewFor(f, victim)).kind).toBe('grave');
    // At 66 percent he strides to the rope, immune: the tank on him reads it.
    marrow.hp = Math.floor(marrow.maxHp * 0.65);
    run(f, DT * 2, keep);
    expect(aura(marrow, MARROW_TOLLING)).toBeDefined();
    expect(live(viewFor(f, f.tank, marrow.id)).kind).toBe('toll');
  });

  it('heroic Grave Dirt burns for exactly the heroic number the tooltip states', () => {
    const { f, marrow } = marrowFight('heroic');
    const keep = holdAll(f);
    run(f, DT, keep);
    const st = marrow.cryptBossFight;
    if (st?.kind !== 'marrow') throw new Error('no fight');
    const victim = f.others[0];
    st.marks.push({ playerId: victim.id, remaining: DT });
    run(f, DT * 2, keep);
    const from = f.hits.length;
    run(f, 2.1, keep);
    const ticks = f.hits
      .slice(from)
      .filter((h) => h.targetId === victim.id && h.ability === 'Grave Dirt');
    expect(ticks.length).toBeGreaterThanOrEqual(2);
    const d = cryptAuraEffectDescriptor({
      id: MARROW_GRAVE_DIRT,
      kind: 'slow',
      value: M.graveSlow,
    });
    for (const h of ticks) expect(h.amount).toBe(d?.nums?.heroic);
  });

  function ladyFight() {
    const f = cryptFight('normal', 3, new Set([LADY_ID]));
    const lady = boss(f, LADY_ID);
    put(f, lady, BONECHILL_RAVINE.x, BONECHILL_RAVINE.z);
    put(f, f.tank, BONECHILL_RAVINE.x, BONECHILL_RAVINE.z - 2.5);
    const spots = [
      [BONECHILL_RAVINE.x - 6, BONECHILL_RAVINE.z + 4],
      [BONECHILL_RAVINE.x + 6, BONECHILL_RAVINE.z + 4],
      [BONECHILL_RAVINE.x, BONECHILL_RAVINE.z + 7],
    ];
    for (const [i, p] of f.others.entries()) put(f, p, spots[i][0], spots[i][1]);
    lady.maxHp = 1e6;
    lady.hp = lady.maxHp;
    f.sim.ctx.aggroMob(lady, f.tank, false);
    return { f, lady };
  }

  it('the Lament: the sheltered hold still, the rest are sent to the light; the wail lands in range', () => {
    const { f, lady } = ladyFight();
    const l0 = GRAVE_LANTERNS[0];
    put(f, f.others[0], l0.x + 0.5, l0.z);
    put(f, f.others[1], l0.x - 0.5, l0.z);
    put(f, f.others[2], l0.x, l0.z + 2.5);
    const keep = holdAll(f);
    expect(
      until(f, () => lady.castingAbility === LADY_BRIDES_LAMENT, L.lamentFirst + 1, keep),
    ).toBe(true);
    run(f, 0.5, keep);
    expect(live(viewFor(f, f.others[0])).kind).toBe('lament-sheltered');
    expect(live(viewFor(f, f.others[1])).kind).toBe('lament-sheltered');
    // Third in the light: the lantern is full, so the hint sends them on.
    expect(live(viewFor(f, f.others[2])).kind).toBe('lament-open');
    expect(live(viewFor(f, f.tank)).kind).toBe('lament-open');
    const from = f.hits.length;
    expect(until(f, () => lady.castingAbility !== LADY_BRIDES_LAMENT, L.lamentCast, keep)).toBe(
      true,
    );
    run(f, DT, keep);
    // The first Lament on a fresh player lands inside the tooltip's normal range.
    const d = cryptAuraEffectDescriptor({ id: LADY_LAMENT_DREAD, kind: 'slow', value: 1 });
    const hit = took(f, f.others[2], "Bride's Lament", from);
    expect(hit).toBeGreaterThanOrEqual(d?.nums?.min ?? Number.NaN);
    expect(hit).toBeLessThanOrEqual(d?.nums?.max ?? Number.NaN);
    // The wail is over: the warning is gone, the Lingering Lament remains.
    expect(viewFor(f, f.others[2]).visible).toBe(false);
    const linger = aura(f.others[2], LADY_LINGERING_LAMENT);
    expect(linger).toBeDefined();
    const ld = auraEffectDescriptor({
      id: LADY_LINGERING_LAMENT,
      kind: 'slow',
      value: 1,
      value2: linger?.value2,
      stacks: linger?.stacks,
    });
    expect(ld?.key).toBe('hudChrome.auraEffect.crypt.lingering');
    expect(ld?.nums?.pct).toBe(Math.round(L.lingerPerStack * 100));
  });

  it('the Embrace: the held player sees it while she holds them', () => {
    const { f, lady } = ladyFight();
    const keep = holdAll(f);
    run(f, DT, keep);
    const s = lady.cryptBossFight;
    if (s?.kind !== 'lady') throw new Error('no lady fight');
    s.lamentTimer = 999;
    s.embraceTimer = 0;
    expect(until(f, () => lady.castingAbility === LADY_FROZEN_EMBRACE, 1, keep)).toBe(true);
    const victim = f.others.find((p) => p.id === lady.castTargetId) as Entity;
    expect(
      until(f, () => lady.castingAbility === LADY_EMBRACE_HOLD, L.embraceCast + 0.2, keep),
    ).toBe(true);
    run(f, L.embraceRise + 0.1, keep);
    expect(aura(victim, LADY_EMBRACED)).toBeDefined();
    expect(live(viewFor(f, victim)).kind).toBe('embraced');
  });

  it('Ilvane: targeting her while her Choristers live reads Harmony with their live share', () => {
    const f = cryptFight('normal', 3, new Set([ILVANE_ID, CHORISTER_ID]));
    const ilvane = boss(f, ILVANE_ID);
    const choir = liveMobs(f, CHORISTER_ID).filter((c) => f.inst.mobIds.includes(c.id));
    put(f, ilvane, 0, 163);
    put(f, f.tank, 0, 160.5);
    f.sim.ctx.aggroMob(ilvane, f.tank, false);
    for (const c of choir) f.sim.ctx.aggroMob(c, f.tank, false);
    run(f, DT * 2);
    const share = aura(ilvane, ILVANE_HARMONY)?.value ?? 0;
    expect(share).toBeCloseTo(choir.length * I.harmonyPer, 9);
    const v = live(viewFor(f, f.tank, ilvane.id));
    expect(v.kind).toBe('harmony');
    expect(v.line).toBe(
      t('hudChrome.cryptAlert.harmonyLine', { pct: String(Math.round(share * 100)) }),
    );
    // Targeting a Chorister reads nothing.
    expect(viewFor(f, f.tank, choir[0].id).visible).toBe(false);
  });
});

describe('the crypt aura tooltips', () => {
  const heroic = (mob: string, n: number) =>
    Math.round(n * (HEROIC_DUNGEON_TUNING.hollow_crypt?.mechanicDamageMultiplierByMob?.[mob] ?? 0));
  const pct = (frac: number) => Math.round(frac * 100);

  const cases: { a: AuraEffectInput; key: string; nums: Record<string, number> }[] = [
    {
      a: { id: MARROW_MEASURED, kind: 'slow', value: 1, value2: M.graveRadius },
      key: 'measured',
      nums: {
        radius: M.graveRadius,
        min: M.graveOpenMin,
        max: M.graveOpenMax,
        heroicMin: heroic(MARROW_ID, M.graveOpenMin),
        heroicMax: heroic(MARROW_ID, M.graveOpenMax),
      },
    },
    {
      a: { id: MARROW_GRAVE_DIRT, kind: 'slow', value: M.graveSlow },
      key: 'graveDirt',
      nums: {
        slow: pct(1 - M.graveSlow),
        damage: M.graveDirtPerSecond,
        heroic: heroic(MARROW_ID, M.graveDirtPerSecond),
        linger: M.unquietLinger,
      },
    },
    {
      a: { id: MARROW_DIRT_IN_EYES, kind: 'slow', value: M.shovelSlow },
      key: 'dirtInEyes',
      nums: { pct: pct(1 - M.shovelSlow) },
    },
    {
      a: {
        id: MARROW_BLOW_STACKS,
        kind: 'vulnerability',
        value: M.blowVulnPerStack * 3,
        stacks: 3,
      },
      key: 'blow',
      nums: {
        pct: pct(M.blowVulnPerStack * 3),
        per: pct(M.blowVulnPerStack),
        stacks: 3,
        max: M.blowMaxStacks,
        seconds: M.blowSeconds,
      },
    },
    {
      a: { id: MARROW_GRAVE_VIGOR, kind: 'buff_haste', value: M.graveVigorHaste },
      key: 'graveVigor',
      nums: { pct: pct(M.graveVigorHaste - 1) },
    },
    {
      a: { id: MARROW_TOLLING, kind: 'buff_dr', value: 0 },
      key: 'tolling',
      nums: {
        min: M.tollMin,
        max: M.tollMax,
        heroicMin: heroic(MARROW_ID, M.tollMin),
        heroicMax: heroic(MARROW_ID, M.tollMax),
      },
    },
    {
      a: { id: LADY_EMBRACED, kind: 'stun', value: 0 },
      key: 'embraced',
      nums: {
        tick: L.embracePerSecond,
        tickHeroic: heroic(LADY_ID, L.embracePerSecond),
        share: pct(L.embraceBreakShare),
        hold: L.embraceHold,
        min: L.dropMin,
        max: L.dropMax,
        heroicMin: heroic(LADY_ID, L.dropMin),
        heroicMax: heroic(LADY_ID, L.dropMax),
      },
    },
    {
      a: { id: LADY_LAMENT_DREAD, kind: 'slow', value: 1, value2: 0 },
      key: 'lament',
      nums: {
        radius: L.lanternRadius,
        cap: L.lanternCap,
        min: L.lamentMin,
        max: L.lamentMax,
        heroicMin: heroic(LADY_ID, L.lamentMin),
        heroicMax: heroic(LADY_ID, L.lamentMax),
      },
    },
    {
      a: {
        id: LADY_LINGERING_LAMENT,
        kind: 'slow',
        value: 1,
        value2: L.lingerPerStack * 2,
        stacks: 2,
      },
      key: 'lingering',
      nums: { pct: pct(L.lingerPerStack * 2), per: pct(L.lingerPerStack), max: L.lingerMaxStacks },
    },
    {
      a: { id: SLIPPERY_GROUND_AURA, kind: 'slow', value: 1, value2: L.iceGrip },
      key: 'slippery',
      nums: { grip: L.iceGrip },
    },
    {
      a: { id: ILVANE_HARMONY, kind: 'buff_dr', value: I.harmonyPer * 2 },
      key: 'harmony',
      nums: { pct: pct(I.harmonyPer * 2), per: pct(I.harmonyPer) },
    },
    {
      a: { id: ILVANE_CRESCENDO, kind: 'buff_haste', value: 1 },
      key: 'crescendo',
      nums: {
        cast: I.dirgeCastCrescendo,
        castNormal: I.dirgeCast,
        every: I.dirgeEveryCrescendo,
        everyNormal: I.dirgeEvery,
        waves: I.organWaveAtCrescendo.length,
        wavesNormal: I.organWaveAt.length,
      },
    },
  ];

  it.each(cases)('$key states its rule with the live numbers', ({ a, key, nums }) => {
    const d = auraEffectDescriptor(a);
    expect(d?.key).toBe(`hudChrome.auraEffect.crypt.${key}`);
    expect(d?.nums).toEqual(nums);
    const text = (hudChromeStrings.auraEffect.crypt as Record<string, string>)[key];
    // Every placeholder is a number the descriptor supplies, every number it
    // supplies is printed, and the copy hardcodes no number of its own.
    const tokens = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    expect(new Set(tokens)).toEqual(new Set(Object.keys(nums)));
    expect(text.replace(/\{\w+\}/g, '')).not.toMatch(/\d/);
  });

  it('the heroic factor is the one combat stamps on the heroic bosses', () => {
    for (const mob of [MARROW_ID, LADY_ID, ILVANE_ID]) {
      const mult = HEROIC_DUNGEON_TUNING.hollow_crypt?.mechanicDamageMultiplierByMob?.[mob];
      expect(mult).toBeGreaterThan(1);
      expect(cryptHeroicAmount(mob, 10)).toBe(Math.round(10 * (mult ?? 0)));
    }
  });

  it('the live per-aura state reads off the aura: blow stacks, Harmony share, the grip', () => {
    const one = cryptAuraEffectDescriptor({
      id: MARROW_BLOW_STACKS,
      kind: 'vulnerability',
      value: M.blowVulnPerStack,
      stacks: 1,
    });
    expect(one?.nums?.pct).toBe(pct(M.blowVulnPerStack));
    expect(one?.nums?.stacks).toBe(1);
    const lone = cryptAuraEffectDescriptor({ id: ILVANE_HARMONY, kind: 'buff_dr', value: 0.3 });
    expect(lone?.nums?.pct).toBe(30);
    const bare = cryptAuraEffectDescriptor({ id: SLIPPERY_GROUND_AURA, kind: 'slow', value: 1 });
    expect(bare?.nums?.grip).toBe(SLIPPERY_DEFAULT_GRIP);
    // The Dirge's silence keeps the generic silence line; anything else falls through.
    expect(cryptAuraEffectDescriptor({ id: ILVANE_DIRGE_SILENCE, kind: 'silence', value: 0 })).toBe(
      null,
    );
    expect(auraEffectDescriptor({ id: ILVANE_DIRGE_SILENCE, kind: 'silence', value: 0 })?.key).toBe(
      'hudChrome.auraEffect.silence',
    );
  });
});

describe("the Lady's loot: the spider leftovers carry bridal frost names", () => {
  const RENAMED: Record<string, string> = {
    bonechill_carapace_vest: 'Bonechill Hauberk',
    rimeweb_hunters_leggings: 'Rime-Laced Leggings',
    rimeweb_fang: "Bride's Icicle",
  };

  it('renames the display names in both English layers, ids frozen', () => {
    const names = en.entities.items as Record<string, { name: string }>;
    for (const [id, name] of Object.entries(RENAMED)) {
      expect(ITEMS[id]?.name).toBe(name);
      expect(names[id]?.name).toBe(name);
    }
    // The heroic twin reads its base name (generated variants never carry their own).
    expect(ITEMS.heroic_rimeweb_fang?.name).toBe("Bride's Icicle");
    // Rimesilk fits a bride's silk and stays.
    expect(ITEMS.rimesilk_mantle?.name).toBe('Rimesilk Mantle');
  });

  it('no Hollow Crypt display name keeps the spider words', () => {
    for (const id of Object.keys(RENAMED))
      expect(ITEMS[id]?.name).not.toMatch(/Rimeweb|Carapace|Fang|Hunter/);
  });
});
