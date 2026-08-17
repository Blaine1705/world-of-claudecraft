// The shared USD spelling (src/ui/usd_text.ts): Intl currency bound to the
// active locale, never a hardcoded "$" prefix. The sweep at the bottom is the
// review's grep-proof made durable: no src/ui module may concatenate a dollar
// sign in front of an interpolation again.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage } from '../src/ui/i18n';
import { usdDollarsText, usdText } from '../src/ui/usd_text';

afterEach(() => {
  setLanguage('en');
});

describe('formatting', () => {
  it('renders cents as symbol-correct currency in English', () => {
    setLanguage('en');
    expect(usdText(100)).toBe('$1.00');
    expect(usdText(2500)).toBe('$25.00');
    // Sub-dollar and zero keep their two fraction digits.
    expect(usdText(5)).toBe('$0.05');
    expect(usdText(0)).toBe('$0.00');
  });

  it('handles negatives through Intl, which a "$" prefix concat never did', () => {
    setLanguage('en');
    // "-$1.00", never the "$-1.00" a `$${n}` template produces.
    expect(usdText(-100)).toBe('-$1.00');
  });

  it('follows a suffix-currency locale instead of forcing a leading dollar', () => {
    setLanguage('fr_FR');
    const line = usdText(100);
    // French places the currency AFTER the amount ("1,00 $US"): the exact
    // token varies by ICU version, so pin the property, not the byte string.
    expect(line.startsWith('$'), line).toBe(false);
    expect(line).toContain('1,00');
  });

  it('the dollar-unit twin agrees with the cents form', () => {
    setLanguage('en');
    expect(usdDollarsText(25)).toBe(usdText(2500));
  });
});

describe('the grep-proof: zero hardcoded currency prefixes in src/ui', () => {
  function tsFilesUnder(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...tsFilesUnder(p));
      else if (name.endsWith('.ts')) out.push(p);
    }
    return out;
  }

  it('no src/ui module concatenates a literal dollar before an interpolation', () => {
    // The `$${...}` template shape IS the defect class the review named
    // (wocUsdText, the Claudium pack labels, the daily-rewards prize lines):
    // a literal "$" glued to a localized number. Catalog English (the
    // translatable "{usd} USD" copy) does not match this shape.
    const offenders: string[] = [];
    for (const file of tsFilesUnder('src/ui')) {
      const src = readFileSync(file, 'utf8');
      if (/`[^`]*\$\$\{/.test(src) || /'\$' \+|"\$" \+/.test(src)) offenders.push(file);
    }
    expect(offenders, 'hardcoded "$" money prefixes (use usd_text.ts)').toEqual([]);
  });

  it('positive control: the scanner sees the shape it hunts', () => {
    expect(/`[^`]*\$\$\{/.test('const x = `$${amount}`;')).toBe(true);
    expect(/`[^`]*\$\$\{/.test('const x = `${amount}`;')).toBe(false);
  });
});
