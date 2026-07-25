import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/sim/data';

describe('MediaWiki ability visibility', () => {
  it('publishes exactly the player-visible abilities', () => {
    const xml = readFileSync(resolve('mediawiki/seed/pages.xml'), 'utf8');
    const actualTitles = [...xml.matchAll(/<title>([^<]+ \(Ability\)(?: \(\d+\))?)<\/title>/g)]
      .map((match) => match[1])
      .sort();
    const titleCounts = new Map<string, number>();
    const expectedTitles = Object.values(ABILITIES)
      .filter((ability) => ability.hiddenFromPlayer !== true)
      .map((ability) => {
        const base = `${ability.name} (Ability)`.replace(
          /[&<>"']/g,
          (char) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ??
            char,
        );
        const count = (titleCounts.get(base) ?? 0) + 1;
        titleCounts.set(base, count);
        return count === 1 ? base : `${base} (${count})`;
      })
      .sort();

    expect(actualTitles).toEqual(expectedTitles);
    expect(xml).not.toContain('<title>Sacred Goad (Ability) (2)</title>');
    expect(xml).not.toContain('[[undefined]]');
  });
});
