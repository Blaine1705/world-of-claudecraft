// The five-player dungeon boss guides (src/ui/boss_journal/): every page is
// complete, localized, and true to the sim it describes. The generic block
// runs over EVERY registered dungeon journal, so a new dungeon page is covered
// the moment it joins the registry; the per-dungeon blocks pin the facts the
// audit found players misread.

import { describe, expect, it } from 'vitest';
import { mobVisualKey, VISUALS } from '../src/render/characters/manifest';
import { HEROIC_DUNGEON_TUNING } from '../src/sim/content/dungeon_difficulty';
import { finderActivity } from '../src/sim/content/dungeon_finder';
import { MOBS } from '../src/sim/data';
import {
  KORGATH_TUNING,
  KORZUL_TUNING,
  TUSKER_TUNING,
} from '../src/sim/encounters/gravewyrm_sanctum/ids';
import { SCRIPTED_INTERRUPTIBLE_CHANNELS } from '../src/sim/mob/healer_channel';
import { journalModelFor } from '../src/ui/boss_journal/journal_model_spec';
import { formattedJournalValues } from '../src/ui/boss_journal/journal_sections';
import { mechanicFactor } from '../src/ui/boss_journal/journal_tuning';
import {
  dungeonJournalBossView,
  type JournalDifficulty,
  journalContextFor,
  nextJournalBoss,
  RAID_JOURNAL_SOURCE,
} from '../src/ui/boss_journal/journal_view';
import { DUNGEON_JOURNALS, dungeonJournalSourceFor } from '../src/ui/boss_journal/registry';
import { hasTranslation, type TranslationKey, t } from '../src/ui/i18n';
import { hasExplicitAbilityIcon } from '../src/ui/icons';

const TIERS: readonly JournalDifficulty[] = ['normal', 'heroic'];
const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;
const DASHES = /[–—]/;

function rendered(
  key: TranslationKey,
  values?: Readonly<Record<string, number>>,
  percent?: readonly string[],
) {
  return t(key, formattedJournalValues(values, percent));
}

function expectText(
  label: string,
  key: TranslationKey,
  values?: Readonly<Record<string, number>>,
  percent?: readonly string[],
) {
  expect(hasTranslation(key, 'en'), `${label}: missing catalog key ${key}`).toBe(true);
  const text = rendered(key, values, percent);
  expect(text, `${label}: ${key} leaves a placeholder unfilled`).not.toMatch(PLACEHOLDER);
  expect(text, `${label}: ${key} carries an en or em dash`).not.toMatch(DASHES);
  expect(text.trim().length, `${label}: ${key} is empty`).toBeGreaterThan(0);
}

describe.each(DUNGEON_JOURNALS.map((def) => [def.dungeonId, def] as const))(
  'dungeon journal %s',
  (dungeonId, def) => {
    it('lists every Dungeon Finder boss of both tiers, in route order', () => {
      const keys = def.bosses.map((boss) => boss.mobId);
      for (const tier of TIERS) {
        const activity = finderActivity(`${dungeonId}_${tier}`);
        expect(activity, `${dungeonId}_${tier} finder row`).not.toBeNull();
        const finderBosses = activity?.encounters.map((e) => e.mobId) ?? [];
        for (const mobId of finderBosses) expect(keys).toContain(mobId);
        const order = finderBosses.map((mobId) => keys.indexOf(mobId));
        expect(order).toEqual([...order].sort((a, b) => a - b));
      }
      for (const boss of def.bosses) expect(MOBS[boss.mobId], boss.mobId).toBeDefined();
      expect(def.bosses.filter((boss) => boss.rank === 'final')).toHaveLength(1);
    });

    it('resolves every line on both tiers with no missing key or placeholder', () => {
      for (const boss of def.bosses) {
        for (const tier of TIERS) {
          const view = dungeonJournalBossView(boss, tier);
          const label = `${boss.mobId} ${tier}`;
          expectText(label, view.overviewKey, view.overviewValues, view.overviewPercentValues);
          expect(view.phases.length).toBeGreaterThan(0);
          for (const phase of view.phases) {
            expectText(label, phase.nameKey);
            expectText(label, phase.summaryKey, phase.values, phase.percentValues);
            for (const m of phase.mechanics) {
              expectText(`${label} ${m.id}`, m.nameKey, m.values, m.percentValues);
              expectText(`${label} ${m.id}`, m.summaryKey, m.values, m.percentValues);
              expectText(`${label} ${m.id}`, m.responseKey, m.values, m.percentValues);
              expect(m.roles.length, `${m.id} roles`).toBeGreaterThan(0);
              expect(hasExplicitAbilityIcon(m.iconId), `${m.iconId} recipe`).toBe(true);
            }
          }
          expect(view.tips?.map((tip) => tip.role)).toEqual(['tank', 'healer', 'damage']);
          for (const tip of view.tips ?? []) {
            expectText(label, tip.key, tip.values, tip.percentValues);
          }
          for (const choice of view.choices ?? []) {
            expectText(label, choice.nameKey, choice.values, choice.percentValues);
            expectText(label, choice.gainKey, choice.values, choice.percentValues);
            expectText(label, choice.riskKey, choice.values, choice.percentValues);
            expect(hasExplicitAbilityIcon(choice.iconId)).toBe(true);
          }
          for (const note of view.heroicNotes ?? []) {
            expectText(label, note.key, note.values, note.percentValues);
          }
          expect((view.heroicNotes ?? []).length > 0).toBe(tier === 'heroic');
        }
      }
    });

    it('names every cast-bar mechanic exactly as its cast bar, and flags kicks truthfully', () => {
      for (const boss of def.bosses) {
        for (const phase of boss.phases) {
          for (const m of phase.mechanics) {
            if (m.castId) {
              const castKey = `abilityUi.cast.${m.castId}` as TranslationKey;
              expect(hasTranslation(castKey, 'en'), castKey).toBe(true);
              expect(m.nameKey, `${m.id} must read its cast bar name`).toBe(castKey);
              const kickable = Object.hasOwn(SCRIPTED_INTERRUPTIBLE_CHANNELS, m.castId);
              expect(m.flags?.includes('interruptible') ?? false, `${m.id} interruptible`).toBe(
                kickable,
              );
            } else {
              expect(
                m.flags?.includes('interruptible') ?? false,
                `${m.id} has no kickable bar`,
              ).toBe(false);
            }
          }
        }
      }
    });

    it('hides heroic-only mechanics on Normal and marks every tier difference on Heroic', () => {
      for (const boss of def.bosses) {
        const normal = dungeonJournalBossView(boss, 'normal');
        const heroic = dungeonJournalBossView(boss, 'heroic');
        const normalIds = normal.phases.flatMap((p) => p.mechanics.map((m) => m.id));
        const heroicMechanics = heroic.phases.flatMap((p) => p.mechanics);
        for (const phase of boss.phases) {
          for (const m of phase.mechanics) {
            const shown = heroicMechanics.find((h) => h.id === m.id);
            expect(shown, `${m.id} on heroic`).toBeDefined();
            if (m.availability === 'heroic') {
              expect(normalIds).not.toContain(m.id);
              expect(shown?.marks).toEqual(['heroicOnly']);
            } else {
              expect(normalIds).toContain(m.id);
            }
          }
        }
        for (const m of normal.phases.flatMap((p) => p.mechanics)) expect(m.marks).toBeUndefined();
      }
    });

    it('uses the boss real in-game model whenever the guide can build it', () => {
      for (const boss of def.bosses) {
        const model = journalModelFor(boss.mobId);
        const visual = VISUALS[mobVisualKey(boss.mobId)];
        if (!model) {
          expect(visual?.bodyless || visual?.wocCharacter || visual?.modular).toBeTruthy();
          continue;
        }
        expect(model.spec.url).toBe(visual?.url);
        expect(model.spec.height).toBe(visual?.height);
        expect(model.spec.idle).toBe(visual?.clips.idle ?? null);
      }
    });
  },
);

describe('journal room context', () => {
  it('keeps the raid rooms on the raid source and offers each dungeon its own page', () => {
    expect(journalContextFor('nythraxis_boss_arena', null, dungeonJournalSourceFor)?.source).toBe(
      RAID_JOURNAL_SOURCE,
    );
    expect(journalContextFor('some_meadow', null, dungeonJournalSourceFor)).toBeNull();
    expect(journalContextFor(null, null, dungeonJournalSourceFor)).toBeNull();
    for (const def of DUNGEON_JOURNALS) {
      const ctx = journalContextFor(def.dungeonId, null, dungeonJournalSourceFor);
      expect(ctx?.source.id).toBe(def.dungeonId);
      expect(ctx?.bossKey).toBe(def.bosses[0].mobId);
      expect(ctx?.runDifficulty).toBeNull();
    }
  });

  it('suggests the next standing boss and the run difficulty', () => {
    const run = {
      dungeonId: 'gravewyrm_sanctum',
      difficulty: 'heroic' as const,
      bosses: [
        { mobId: 'korgath_the_bound', defeated: true },
        { mobId: 'grand_necromancer_velkhar', defeated: false },
        { mobId: 'korzul_the_gravewyrm', defeated: false },
      ],
    };
    const ctx = journalContextFor('gravewyrm_sanctum', run, dungeonJournalSourceFor);
    expect(ctx?.bossKey).toBe('grand_necromancer_velkhar');
    expect(ctx?.runDifficulty).toBe('heroic');
    // The untracked miniboss before a defeated boss counts as passed; before
    // any defeat it is the first suggestion.
    const keys = ['sledge_tusker', 'korgath_the_bound', 'grand_necromancer_velkhar'];
    expect(nextJournalBoss(keys, run)).toBe('grand_necromancer_velkhar');
    expect(
      nextJournalBoss(keys, {
        ...run,
        bosses: run.bosses.map((b) => ({ ...b, defeated: false })),
      }),
    ).toBe('sledge_tusker');
  });
});

describe('Gravewyrm Sanctum facts', () => {
  const def = DUNGEON_JOURNALS.find((d) => d.dungeonId === 'gravewyrm_sanctum');
  if (!def) throw new Error('sanctum journal missing');
  const boss = (mobId: string) => {
    const found = def.bosses.find((b) => b.mobId === mobId);
    if (!found) throw new Error(mobId);
    return found;
  };
  const mechanic = (mobId: string, id: string, tier: JournalDifficulty) => {
    const found = dungeonJournalBossView(boss(mobId), tier)
      .phases.flatMap((p) => p.mechanics)
      .find((m) => m.id === id);
    if (!found) throw new Error(`${mobId} ${id} ${tier}`);
    return found;
  };

  it('runs the route Tusker, Korgath, Velkhar, Korzul', () => {
    expect(def.bosses.map((b) => [b.mobId, b.rank])).toEqual([
      ['sledge_tusker', 'miniboss'],
      ['korgath_the_bound', 'boss'],
      ['grand_necromancer_velkhar', 'boss'],
      ['korzul_the_gravewyrm', 'final'],
    ]);
  });

  it('explains the chains: 20 percent per intact chain, 80 with all four, one attack per break', () => {
    const lock = mechanic('korgath_the_bound', 'lockbound', 'normal');
    expect(lock.values?.perChain).toBe(KORGATH_TUNING.lockboundPerChain);
    expect(lock.values?.all).toBeCloseTo(KORGATH_TUNING.lockboundPerChain * 4);
    expect(rendered(lock.summaryKey, lock.values, lock.percentValues)).toContain('20%');
    expect(rendered(lock.summaryKey, lock.values, lock.percentValues)).toContain('80%');
    const korgath = dungeonJournalBossView(boss('korgath_the_bound'), 'normal');
    const choice = korgath.choices?.[0];
    if (!choice) throw new Error('Korgath has no choice');
    const risk = rendered(choice.riskKey, choice.values, choice.percentValues);
    for (const cast of ['Maul Arc', 'Chain Flail', 'Threshold Charge', "Foreman's Bellow"]) {
      expect(risk).toContain(cast);
    }
    const freed = korgath.phases.find((p) => p.id === 'freed')?.mechanics.map((m) => m.id);
    expect(freed).toEqual(['maul-arc', 'chain-flail', 'threshold-charge', 'foremans-bellow']);
  });

  it('keeps Re-rivet and Last Link heroic only, and Re-rivet the one kickable bar', () => {
    expect(() => mechanic('korgath_the_bound', 're-rivet', 'normal')).toThrow();
    expect(() => mechanic('korgath_the_bound', 'last-link', 'normal')).toThrow();
    const rivet = mechanic('korgath_the_bound', 're-rivet', 'heroic');
    expect(rivet.flags).toContain('interruptible');
    expect(rivet.values?.delay).toBe(KORGATH_TUNING.rerivetDelay);
    expect(mechanic('korgath_the_bound', 'last-link', 'heroic').values?.every).toBe(
      KORGATH_TUNING.strainEveryLastLink,
    );
  });

  it('shows Strain at the sim range on Normal and at the heroic factor on Heroic', () => {
    const factor = HEROIC_DUNGEON_TUNING.gravewyrm_sanctum.mechanicDamageMultiplierByMob
      ?.korgath_the_bound as number;
    expect(mechanicFactor('gravewyrm_sanctum', 'korgath_the_bound', 'heroic')).toBe(factor);
    expect(mechanicFactor('gravewyrm_sanctum', 'korgath_the_bound', 'normal')).toBe(1);
    const normal = mechanic('korgath_the_bound', 'strain', 'normal');
    const heroic = mechanic('korgath_the_bound', 'strain', 'heroic');
    expect([normal.values?.min, normal.values?.max]).toEqual([
      KORGATH_TUNING.strainMin,
      KORGATH_TUNING.strainMax,
    ]);
    expect([heroic.values?.min, heroic.values?.max]).toEqual([
      Math.round(KORGATH_TUNING.strainMin * factor),
      Math.round(KORGATH_TUNING.strainMax * factor),
    ]);
    expect(heroic.marks).toEqual(['heroicChanged']);
    expect(heroic.compare?.heroic.min).toBe(heroic.values?.min);
  });

  it('pins the Tusker thresholds and the Korzul flights to the sim', () => {
    const tusker = dungeonJournalBossView(boss('sledge_tusker'), 'normal');
    expect(tusker.phases.find((p) => p.id === 'spill')?.values?.health).toBe(
      TUSKER_TUNING.spillAtHpPct,
    );
    expect(tusker.phases.find((p) => p.id === 'enrage')?.values?.health).toBe(
      TUSKER_TUNING.enrageAtHpPct,
    );
    const korzul = dungeonJournalBossView(boss('korzul_the_gravewyrm'), 'heroic');
    expect(korzul.phases.find((p) => p.id === 'flights')?.values).toEqual({
      first: KORZUL_TUNING.flightAtHpPct[0],
      second: KORZUL_TUNING.flightAtHpPct[1],
    });
    const water = mechanic('korzul_the_gravewyrm', 'open-water', 'heroic');
    expect(water.values?.perSecond).toBe(KORZUL_TUNING.quenchPerSecondHeroic);
  });
});
