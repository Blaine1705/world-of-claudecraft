// src/ui/charselect_hints.ts: the hint lines under a character-select roster
// row. The zone line is what lets an account owner see where every character
// is without logging each one in; it renders through tEntity so it follows the
// active language like every other zone name in the client. The raid-lockout
// rows below it name and time each lockout through the same rule as the
// minimap badge, against a clock the caller passes.
import { describe, expect, it } from 'vitest';
import {
  charselectHintsHtml,
  charselectLockoutRows,
  charselectLockoutsHtml,
  charselectZoneLabel,
} from '../src/ui/charselect_hints';
import { zoneDisplayName } from '../src/ui/entity_i18n';
import { ensureLocaleLoaded, setLanguage, t } from '../src/ui/i18n';

// A fixed wall clock for the countdowns (the roster passes Date.now() in main.ts).
const NOW = 1_800_000_000_000;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('charselectZoneLabel', () => {
  it('names the zone in English', () => {
    setLanguage('en');
    expect(charselectZoneLabel({ online: false, zoneId: 'eastbrook_vale' })).toBe('Eastbrook Vale');
  });

  it('is null when the server sent no zone (older server, or a world-start save)', () => {
    setLanguage('en');
    expect(charselectZoneLabel({ online: false })).toBeNull();
    expect(charselectZoneLabel({ online: false, zoneId: null })).toBeNull();
  });

  it('follows the active language', async () => {
    await ensureLocaleLoaded('ja_JP');
    setLanguage('ja_JP');
    try {
      const label = charselectZoneLabel({ online: false, zoneId: 'eastbrook_vale' });
      expect(label).toBe(zoneDisplayName('eastbrook_vale'));
      expect(label).not.toBe('Eastbrook Vale');
    } finally {
      setLanguage('en');
    }
  });
});

describe('charselectHintsHtml', () => {
  it('renders the zone line for an offline character and nothing else', () => {
    setLanguage('en');
    expect(charselectHintsHtml({ online: false, zoneId: 'mirefen_marsh' }, NOW)).toBe(
      '<span class="char-zone-hint">Current location: Mirefen Marsh</span>',
    );
  });

  it('renders the zone line above the in-world notice for an online character', () => {
    setLanguage('en');
    expect(charselectHintsHtml({ online: true, zoneId: 'mirefen_marsh' }, NOW)).toBe(
      `<span class="char-zone-hint">Current location: Mirefen Marsh</span><span class="char-inworld-hint">${t('character.inWorldHint')}</span>`,
    );
  });

  it('localizes the location prefix with the zone name', async () => {
    await ensureLocaleLoaded('ja_JP');
    setLanguage('ja_JP');
    try {
      const html = charselectHintsHtml({ online: false, zoneId: 'mirefen_marsh' }, NOW);
      expect(html).toContain(zoneDisplayName('mirefen_marsh'));
      expect(html).not.toContain('Current location');
    } finally {
      setLanguage('en');
    }
  });

  it('renders only the in-world notice when there is no zone', () => {
    setLanguage('en');
    expect(charselectHintsHtml({ online: true }, NOW)).toBe(
      `<span class="char-inworld-hint">${t('character.inWorldHint')}</span>`,
    );
    expect(charselectHintsHtml({ online: false }, NOW)).toBe('');
  });

  it('escapes the zone name', () => {
    setLanguage('en');
    // An unknown id falls back to the id text itself; markup in it must not render.
    const html = charselectHintsHtml({ online: false, zoneId: '<b>x</b>' }, NOW);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });
});

describe('charselectLockoutRows', () => {
  it('names and times each lockout through the in-world rule, soonest first', () => {
    setLanguage('en');
    const rows = charselectLockoutRows(
      {
        online: false,
        raidLockouts: {
          nythraxis_boss_arena: NOW + 2 * DAY + 3 * HOUR,
          'nythraxis_boss_arena:heroic': NOW + 5 * HOUR + 12 * MIN,
          'worldboss:thunzharr_waking_peak': NOW + 40 * MIN,
        },
      },
      NOW,
    );
    expect(rows.map((r) => [r.id, r.name, r.time])).toEqual([
      ['worldboss:thunzharr_waking_peak', 'Thunzharr, the Waking Peak', '40m'],
      ['nythraxis_boss_arena:heroic', 'Heroic Nythraxis Raid Arena', '5h 12m'],
      ['nythraxis_boss_arena', 'Nythraxis Raid Arena', '2d 3h'],
    ]);
  });

  it('drops entries that lapsed since the server sent them, and junk values', () => {
    setLanguage('en');
    const rows = charselectLockoutRows(
      {
        online: false,
        raidLockouts: {
          nythraxis_boss_arena: NOW - 1,
          'nythraxis_boss_arena:heroic': NOW,
          junk: Number.NaN,
          also: 'soon' as unknown as number,
          live: NOW + HOUR,
        },
      },
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['live']);
  });

  it('is empty when the server sent no lockouts (older server) or none', () => {
    expect(charselectLockoutRows({ online: false }, NOW)).toEqual([]);
    expect(charselectLockoutRows({ online: false, raidLockouts: null }, NOW)).toEqual([]);
    expect(charselectLockoutRows({ online: false, raidLockouts: {} }, NOW)).toEqual([]);
  });

  it('breaks a countdown tie by id', () => {
    const rows = charselectLockoutRows(
      { online: false, raidLockouts: { zzz: NOW + HOUR, aaa: NOW + HOUR } },
      NOW,
    );
    expect(rows.map((r) => r.id)).toEqual(['aaa', 'zzz']);
  });
});

describe('charselectLockoutsHtml', () => {
  it('renders the label and one chip per locked raid with the locked-to tooltip', () => {
    setLanguage('en');
    const html = charselectLockoutsHtml(
      {
        online: false,
        raidLockouts: {
          nythraxis_boss_arena: NOW + 2 * DAY + 3 * HOUR,
          'worldboss:thunzharr_waking_peak': NOW + 40 * MIN,
        },
      },
      NOW,
    );
    expect(html).toBe(
      '<details class="char-lockout-hint"><summary class="char-lockout-label">Raid lockouts ' +
        '<span class="char-lockout-count ui-num">2</span></summary>' +
        '<span class="char-lockout-item" title="You are locked to Thunzharr, the Waking Peak. Unlocks in 40m.">' +
        '<span class="char-lockout-name">Thunzharr, the Waking Peak</span> ' +
        '<span class="char-lockout-time ui-num">40m</span></span>' +
        '<span class="char-lockout-item" title="You are locked to Nythraxis Raid Arena. Unlocks in 2d 3h.">' +
        '<span class="char-lockout-name">Nythraxis Raid Arena</span> ' +
        '<span class="char-lockout-time ui-num">2d 3h</span></span></details>',
    );
    // Closed by default: the disclosure carries no open attribute.
    expect(html).not.toContain('<details open');
  });

  it('renders nothing when no raid is locked', () => {
    expect(charselectLockoutsHtml({ online: false }, NOW)).toBe('');
    expect(charselectLockoutsHtml({ online: false, raidLockouts: { x: NOW - 1 } }, NOW)).toBe('');
  });

  it('escapes the raid name', () => {
    setLanguage('en');
    // An unknown dungeon id falls back to the id text itself; markup in it must not render.
    const html = charselectLockoutsHtml(
      { online: false, raidLockouts: { '<b>x</b>': NOW + HOUR } },
      NOW,
    );
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('follows the active language for the label', async () => {
    await ensureLocaleLoaded('ja_JP');
    setLanguage('ja_JP');
    try {
      const html = charselectLockoutsHtml(
        { online: false, raidLockouts: { nythraxis_boss_arena: NOW + HOUR } },
        NOW,
      );
      expect(html).toContain(t('character.raidLockouts'));
      expect(html).not.toContain('Raid lockouts');
    } finally {
      setLanguage('en');
    }
  });
});

describe('charselectHintsHtml with lockouts', () => {
  it('places the lockout line between the zone line and the in-world notice', () => {
    setLanguage('en');
    const c = {
      online: true,
      zoneId: 'mirefen_marsh',
      raidLockouts: { nythraxis_boss_arena: NOW + HOUR },
    };
    expect(charselectHintsHtml(c, NOW)).toBe(
      `<span class="char-zone-hint">Current location: Mirefen Marsh</span>${charselectLockoutsHtml(c, NOW)}<span class="char-inworld-hint">${t('character.inWorldHint')}</span>`,
    );
  });

  it('renders a lockout against the clock the caller passes, as main.ts passes Date.now()', () => {
    setLanguage('en');
    const now = Date.now();
    expect(
      charselectHintsHtml(
        { online: false, raidLockouts: { nythraxis_boss_arena: now + DAY } },
        now,
      ),
    ).toContain('char-lockout-hint');
    expect(
      charselectHintsHtml(
        { online: false, raidLockouts: { nythraxis_boss_arena: now - DAY } },
        now,
      ),
    ).toBe('');
  });
});
