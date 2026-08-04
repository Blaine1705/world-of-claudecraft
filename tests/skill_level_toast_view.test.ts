// @vitest-environment happy-dom

// Pure-core pins for profession skill level-up toasts: integer floor crossings
// over craft and gathering skill snapshots, silent first init, coalesced
// banner / one-sound-per-drain / reduced-motion batching, and the skill banner
// presentation contracts the HUD arm paints.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audio } from '../src/game/audio';
import { type BannerVariant, Hud } from '../src/ui/hud';
import { professionImageUrl } from '../src/ui/profession_art';
import {
  buildSkillLevelCelebrationPlan,
  computeSkillLevelUps,
  observeSkillLevels,
  skillDisplayLevel,
  skillLevelArtId,
} from '../src/ui/skill_level_toast_view';

describe('skillDisplayLevel', () => {
  it('floors a fractional skill to the player-visible level', () => {
    expect(skillDisplayLevel(24.9)).toBe(24);
    expect(skillDisplayLevel(25)).toBe(25);
    expect(skillDisplayLevel(25.01)).toBe(25);
  });

  it('treats non-positive and non-finite values as 0', () => {
    expect(skillDisplayLevel(0)).toBe(0);
    expect(skillDisplayLevel(-3)).toBe(0);
    expect(skillDisplayLevel(Number.NaN)).toBe(0);
    expect(skillDisplayLevel(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('computeSkillLevelUps', () => {
  it('reports no skill-ups on first observation (null prev), the silent init', () => {
    expect(computeSkillLevelUps(null, { mining: 47, cooking: 12 })).toEqual([]);
  });

  it('reports nothing when floors do not climb (fractional progress only)', () => {
    expect(
      computeSkillLevelUps({ mining: 24.1, cooking: 10 }, { mining: 24.9, cooking: 10.75 }),
    ).toEqual([]);
  });

  it('reports one entry with the reached level on a single floor crossing', () => {
    expect(computeSkillLevelUps({ mining: 24.9 }, { mining: 25.1 })).toEqual([
      { skillId: 'mining', toLevel: 25 },
    ]);
  });

  it('reports one entry per skill when several climb in one drain', () => {
    expect(
      computeSkillLevelUps({ mining: 10.5, cooking: 49.2 }, { mining: 11.0, cooking: 50.0 }),
    ).toEqual([
      { skillId: 'mining', toLevel: 11 },
      { skillId: 'cooking', toLevel: 50 },
    ]);
  });

  it('collapses a multi-level jump to a single entry carrying the final level', () => {
    expect(computeSkillLevelUps({ mining: 1.2 }, { mining: 12.8 })).toEqual([
      { skillId: 'mining', toLevel: 12 },
    ]);
  });

  it('treats a skill key absent from prev as level 0', () => {
    expect(computeSkillLevelUps({}, { cooking: 0.5 })).toEqual([]);
    expect(computeSkillLevelUps({}, { cooking: 1.0 })).toEqual([
      { skillId: 'cooking', toLevel: 1 },
    ]);
  });

  it('never reports a downward move (skills are monotonic)', () => {
    expect(computeSkillLevelUps({ mining: 20 }, { mining: 5 })).toEqual([]);
  });
});

describe('buildSkillLevelCelebrationPlan', () => {
  it('plans nothing for an empty drain', () => {
    expect(buildSkillLevelCelebrationPlan([], false)).toEqual({
      skillUpLogs: [],
      banner: null,
      playSound: false,
      motion: false,
    });
  });

  it('plans logs for every up and coalesces the banner to the LAST', () => {
    const plan = buildSkillLevelCelebrationPlan(
      [
        { skillId: 'mining', toLevel: 11 },
        { skillId: 'cooking', toLevel: 50 },
      ],
      false,
    );
    expect(plan.skillUpLogs).toEqual([
      { skillId: 'mining', toLevel: 11 },
      { skillId: 'cooking', toLevel: 50 },
    ]);
    expect(plan.banner).toEqual({ skillId: 'cooking', toLevel: 50 });
    expect(plan.playSound).toBe(true);
    expect(plan.motion).toBe(true);
  });

  it('reducedMotion trims MOTION only: logs, banner, and sound survive', () => {
    const plan = buildSkillLevelCelebrationPlan([{ skillId: 'mining', toLevel: 12 }], true);
    expect(plan.motion).toBe(false);
    expect(plan.banner).toEqual({ skillId: 'mining', toLevel: 12 });
    expect(plan.playSound).toBe(true);
  });

  it('does not mutate or alias the caller skillUps array', () => {
    const skillUps = [{ skillId: 'mining', toLevel: 12 }];
    const plan = buildSkillLevelCelebrationPlan(skillUps, false);
    expect(plan.skillUpLogs).not.toBe(skillUps);
    expect(plan.skillUpLogs).toEqual(skillUps);
  });
});

describe('observeSkillLevels (silent init + always-on after)', () => {
  it('never baselines an unsynced mirror, even with values present', () => {
    const obs = observeSkillLevels(false, null, { mining: 40 });
    expect(obs).toEqual({ skillUps: [], prev: null });
  });

  it('initializes silently on the first synced observation, copying next', () => {
    const next = { mining: 40, cooking: 12 };
    const obs = observeSkillLevels(true, null, next);
    expect(obs.skillUps).toEqual([]);
    expect(obs.prev).toEqual(next);
    expect(obs.prev).not.toBe(next);
  });

  it('reports floor crossings on later synced observations', () => {
    const prev = { mining: 24.9 };
    const obs = observeSkillLevels(true, prev, { mining: 25.1 });
    expect(obs.skillUps).toEqual([{ skillId: 'mining', toLevel: 25 }]);
    expect(obs.prev).toBe(prev);
    expect(obs.prev?.mining).toBe(25.1);
  });

  it('carries values forward without toasting pure fractional progress', () => {
    const prev = { mining: 24.1 };
    const obs = observeSkillLevels(true, prev, { mining: 24.8 });
    expect(obs.skillUps).toEqual([]);
    expect(obs.prev?.mining).toBe(24.8);
  });
});

describe('skillLevelArtId', () => {
  it('maps gathering and craft ids to the profession art registry prefixes', () => {
    expect(skillLevelArtId('mining')).toBe('gather_mining');
    expect(skillLevelArtId('fishing')).toBe('gather_fishing');
    expect(skillLevelArtId('cooking')).toBe('prof_cooking');
    expect(skillLevelArtId('armorcrafting')).toBe('prof_armorcrafting');
  });

  it('resolves to shipped art URLs for every gathering and craft prefix', () => {
    for (const id of ['mining', 'logging', 'herbalism', 'fishing'] as const) {
      const artId = skillLevelArtId(id);
      expect(artId).toBe(`gather_${id}`);
      expect(professionImageUrl(artId)).toMatch(new RegExp(`/ui/professions/gather_${id}\\.webp$`));
    }
    const cookingArt = skillLevelArtId('cooking');
    expect(cookingArt).toBe('prof_cooking');
    expect(professionImageUrl(cookingArt)).toMatch(/\/ui\/professions\/prof_cooking\.webp$/);
  });
});

interface SkillLevelHudHarness {
  bannerEl: HTMLElement;
  bannerTimer: number | undefined;
  log: ReturnType<typeof vi.fn>;
  combatAnnouncer: { push: ReturnType<typeof vi.fn> };
  handleSkillLevelCelebrations(skillUps: { skillId: string; toLevel: number }[]): void;
  showBanner(
    text: string,
    motion?: boolean,
    decorativeIconUrl?: string,
    variant?: BannerVariant,
    subtext?: string,
  ): void;
}

function skillLevelHud(): SkillLevelHudHarness {
  const hud = Object.create(Hud.prototype) as unknown as SkillLevelHudHarness;
  hud.bannerEl = document.createElement('div');
  hud.bannerTimer = undefined;
  hud.log = vi.fn();
  hud.combatAnnouncer = { push: vi.fn() };
  return hud;
}

describe('skill level celebration HUD behavior', () => {
  const hudCss = readFileSync(join(process.cwd(), 'src/styles/hud.css'), 'utf8');
  const tokensCss = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8');

  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn(
      (query: string) => ({ matches: true, media: query }) as MediaQueryList,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('renders profession art, skill title, level subtext, and announces under reduced motion', () => {
    const achievement = vi.spyOn(audio, 'achievement').mockImplementation(() => {});
    const hud = skillLevelHud();

    hud.handleSkillLevelCelebrations([{ skillId: 'mining', toLevel: 25 }]);

    const icon = hud.bannerEl.querySelector<HTMLImageElement>('img.banner-art');
    const title = hud.bannerEl.querySelector<HTMLElement>('.banner-title');
    const sub = hud.bannerEl.querySelector<HTMLElement>('.banner-subtext');
    expect(icon?.getAttribute('src')).toBe(professionImageUrl('gather_mining'));
    expect(icon?.alt).toBe('');
    expect(title?.textContent).toBeTruthy();
    expect(sub?.textContent).toBeTruthy();
    expect(hud.bannerEl.classList.contains('banner-skill')).toBe(true);
    expect(hud.bannerEl.classList.contains('banner-with-art')).toBe(true);
    expect(hud.bannerEl.classList.contains('has-subtext')).toBe(true);
    expect(hud.bannerEl.classList.contains('banner-no-motion')).toBe(true);
    expect(hud.combatAnnouncer.push).toHaveBeenCalledTimes(1);
    expect(hud.log).toHaveBeenCalledTimes(1);
    expect(achievement).toHaveBeenCalledTimes(1);

    // Skill-ups enqueue as celebrations (class 'deed'), so a later ambient
    // would only park behind the live plate. Clear the slot the way the
    // advance chain does when a celebration ends, then paint an ordinary
    // banner and pin that the skill language does not leak.
    const queueHost = hud as unknown as {
      bannerQueue?: { clear(): void };
      bannerTimer: number | undefined;
    };
    queueHost.bannerQueue?.clear();
    queueHost.bannerTimer = undefined;
    hud.showBanner('Ordinary banner');
    expect(hud.bannerEl.classList.contains('banner-skill')).toBe(false);
    expect(hud.bannerEl.querySelector('img')).toBeNull();
    expect(hud.bannerEl.querySelector('.banner-copy')?.textContent).toBe('Ordinary banner');
  });

  it('keeps the skill banner plate tokens and CSS contract', () => {
    expect(tokensCss).toMatch(/--color-skill-banner-text/);
    expect(tokensCss).toMatch(/--color-skill-banner-border/);
    expect(tokensCss).toMatch(/--color-skill-banner-bg/);
    expect(hudCss).toMatch(/#banner\.banner-skill\s*\{/);
    expect(hudCss).toMatch(/#banner\.banner-skill\.banner-with-art/);
  });
});
