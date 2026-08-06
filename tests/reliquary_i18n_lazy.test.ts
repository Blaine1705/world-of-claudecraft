// The reliquary-locale lazy loader seam (the deed_i18n_lazy shape scoped to The
// Reliquary): the page-name tables live in PER-BASE-LOCALE chunks
// (reliquary_i18n.locales/<locale>.ts), so a default-English player downloads
// zero reliquary locale bytes AND a non-en visitor fetches only their own
// locale's chunk (a ja_JP reader never downloads the other four). Every lookup
// (reliquaryPageName/reliquaryPageDesc) stays SYNCHRONOUS: before a locale's
// chunk is resident a non-en read falls back to the authored English (the
// documented absent-table behavior), and ensureReliquaryLocalesLoaded makes that
// locale's table resident behind the same awaits as ensureLocaleLoaded. A failed
// chunk fetch rejects (the caller owns the UI) without crashing, leaving English
// in place, a retry possible, and every OTHER locale still loadable.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../src/ui/i18n';
import {
  ensureReliquaryLocalesLoaded,
  RELIQUARY_LOCALE_LOADERS,
  reliquaryPageName,
} from '../src/ui/reliquary_i18n';

// The loader record is Partial (only the shipped locales carry a chunk); the
// Required view is spy-able without widening the production type.
const loaders = RELIQUARY_LOCALE_LOADERS as Required<typeof RELIQUARY_LOCALE_LOADERS>;
type BaseLocale = keyof typeof loaders;

describe('lazy reliquary locales: per-locale chunks, synchronous lookups around ensureReliquaryLocalesLoaded', () => {
  it('falls back to English pre-load, rejects a failed chunk softly, and a retry lands Japanese', async () => {
    setLanguage('ja_JP');

    // Pre-load: the ja_JP chunk is not resident, so the lookup renders the
    // authored English synchronously; it never blocks and never throws.
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('The Hollow Crypt');

    // Simulate a 404 / network failure on the chunk: the await rejects (the
    // caller owns the UI), English persists, and the cleared in-flight promise
    // leaves a retry possible.
    const failSpy = vi.spyOn(loaders, 'ja_JP').mockRejectedValueOnce(new Error('simulated 404'));
    await expect(ensureReliquaryLocalesLoaded('ja_JP')).rejects.toThrow(/simulated 404/);
    failSpy.mockRestore();
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('The Hollow Crypt');

    // Retry: two concurrent loads coalesce onto ONE import (spy-through, the real
    // chunk still resolves), then the Japanese fill resolves synchronously.
    const loadSpy = vi.spyOn(loaders, 'ja_JP');
    try {
      await Promise.all([
        ensureReliquaryLocalesLoaded('ja_JP'),
        ensureReliquaryLocalesLoaded('ja_JP'),
      ]);
      expect(loadSpy).toHaveBeenCalledTimes(1);
    } finally {
      loadSpy.mockRestore();
    }
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('虚ろの墓所');
    // The desc is release fill: an entry with a name but no desc still falls
    // back to the authored English rather than rendering empty.
    expect(reliquaryPageName('horizons_titles')).toBe('称号');
    setLanguage('en');
  });

  it('fetches ONLY the requested locale chunk (ru_RU), never another locale thunk', async () => {
    const keys = Object.keys(loaders) as BaseLocale[];
    const spies = new Map(keys.map((k) => [k, vi.spyOn(loaders, k)]));
    try {
      await ensureReliquaryLocalesLoaded('ru_RU');
      expect(spies.get('ru_RU')).toHaveBeenCalledTimes(1);
      for (const [k, spy] of spies) {
        if (k !== 'ru_RU') expect(spy, `${k} thunk`).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies.values()) spy.mockRestore();
    }
    setLanguage('ru_RU');
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('Пустая крипта');
    setLanguage('en');
  });

  it('is an instant no-op for en / en_CA and for an already-resident locale', async () => {
    const keys = Object.keys(loaders) as BaseLocale[];
    const spies = keys.map((k) => vi.spyOn(loaders, k));
    try {
      await expect(ensureReliquaryLocalesLoaded('en')).resolves.toBeUndefined();
      await expect(ensureReliquaryLocalesLoaded('en_CA')).resolves.toBeUndefined();
      // ru_RU is resident from the earlier test: never re-fetches any chunk.
      await ensureReliquaryLocalesLoaded('ru_RU');
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('a rejected fetch for one locale leaves a DIFFERENT locale still loadable', async () => {
    // zh_CN and ko_KR are both fresh. A failed zh_CN fetch must not poison
    // ko_KR or block a zh_CN retry.
    const zhFail = vi.spyOn(loaders, 'zh_CN').mockRejectedValueOnce(new Error('simulated 404'));
    await expect(ensureReliquaryLocalesLoaded('zh_CN')).rejects.toThrow(/simulated 404/);
    zhFail.mockRestore();

    // A different locale still loads and renders its own fill.
    await ensureReliquaryLocalesLoaded('ko_KR');
    setLanguage('ko_KR');
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('텅 빈 묘실');

    // zh_CN still renders English (its chunk never became resident).
    setLanguage('zh_CN');
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('The Hollow Crypt');

    // The retry lands zh_CN: the cleared in-flight slot allowed a fresh import.
    await ensureReliquaryLocalesLoaded('zh_CN');
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('空洞墓穴');
    setLanguage('en');
  });

  it('coalesces two concurrent loads of one locale onto a single import', async () => {
    // zh_TW is fresh: two concurrent calls must resolve one shared import.
    const twSpy = vi.spyOn(loaders, 'zh_TW');
    try {
      await Promise.all([
        ensureReliquaryLocalesLoaded('zh_TW'),
        ensureReliquaryLocalesLoaded('zh_TW'),
      ]);
      expect(twSpy).toHaveBeenCalledTimes(1);
    } finally {
      twSpy.mockRestore();
    }
    setLanguage('zh_TW');
    // A set page, so the assertion cannot pass against the zh_CN table.
    expect(reliquaryPageName('conquerors_set_deathlord')).toBe('塚陵領主戰鬥護甲');
    setLanguage('en');
  });

  it('a locale with no chunk yet resolves as a no-op and keeps rendering English', async () => {
    // The Latin locales are release fill: the loader record has no row for them,
    // so ensure resolves without fetching anything and reads stay English.
    const spies = (Object.keys(loaders) as BaseLocale[]).map((k) => vi.spyOn(loaders, k));
    try {
      await expect(ensureReliquaryLocalesLoaded('de_DE')).resolves.toBeUndefined();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    setLanguage('de_DE');
    expect(reliquaryPageName('conquerors_hollow_crypt')).toBe('The Hollow Crypt');
    setLanguage('en');
  });

  it('reliquary_i18n.ts carries no static VALUE import of a per-locale chunk (the eager-bundle regression guard)', () => {
    const src = readFileSync(new URL('../src/ui/reliquary_i18n.ts', import.meta.url), 'utf8');
    // Only a type-only import (erased at build) or the dynamic import() thunks in
    // RELIQUARY_LOCALE_LOADERS may reference a per-locale chunk; a static value
    // import would pull that locale's table back into the eager renderer bundle
    // via hud.ts and reliquary_window.ts.
    expect(src).not.toMatch(
      /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^;]*?from\s+'\.\/reliquary_i18n\.locales\//,
    );
    expect(src).toContain("import('./reliquary_i18n.locales/");
  });
});
