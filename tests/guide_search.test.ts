// Node-level pins for the Guide search core (src/guide/search.ts): the index contents
// (abilities and public deeds included), the token scoring order, the result cap, and
// the grouped presentation order. The DOM combobox glue stays browser-tested; these
// pins target the pure functions the panel renders from.

import { beforeAll, describe, expect, it } from 'vitest';
import { GUIDE_CLASSES, GUIDE_DEEDS, GUIDE_RELIQUARY } from '../src/guide/content.generated';
import { reliquaryCatalogSections } from '../src/guide/pages/reliquary';
import { buildIndex, groupByType, rank, type SearchEntry } from '../src/guide/search';
import { DEEDS } from '../src/sim/content/deeds';
import type { DeedDef } from '../src/sim/types';
import { setLanguage, t } from '../src/ui/i18n';

const entry = (label: string, type = 'T', href = '#'): SearchEntry => ({
  label,
  type,
  href,
  haystack: label.toLowerCase(),
});

describe('guide search ranking', () => {
  it('requires every token somewhere, in any order', () => {
    const index = [entry('The Hollow Crypt'), entry('The Sunken Bastion')];
    expect(rank(index, 'crypt hollow').map((e) => e.label)).toEqual(['The Hollow Crypt']);
    expect(rank(index, 'hollow crypt').map((e) => e.label)).toEqual(['The Hollow Crypt']);
    expect(rank(index, 'hollow bastion')).toEqual([]);
  });

  it('scores label prefix over word prefix over plain substring', () => {
    const index = [entry('XXalphaXX'), entry('Beta Alpha'), entry('Alphabet Soup')];
    expect(rank(index, 'alpha').map((e) => e.label)).toEqual([
      'Alphabet Soup',
      'Beta Alpha',
      'XXalphaXX',
    ]);
  });

  it('caps the ranked list at ten results', () => {
    const index = Array.from({ length: 30 }, (_, i) => entry(`Wolf ${i}`));
    expect(rank(index, 'wolf').length).toBe(10);
  });

  it('returns nothing for an empty or blank query', () => {
    const index = [entry('Anything')];
    expect(rank(index, '')).toEqual([]);
    expect(rank(index, '   ')).toEqual([]);
  });
});

describe('guide search grouping', () => {
  it('keeps cross-group order by best hit and within-group score order', () => {
    const a1 = entry('A first', 'Alpha');
    const b1 = entry('B first', 'Beta');
    const a2 = entry('A second', 'Alpha');
    expect(groupByType([a1, b1, a2])).toEqual([
      ['Alpha', [a1, a2]],
      ['Beta', [b1]],
    ]);
  });
});

describe('guide search index contents', () => {
  beforeAll(() => {
    setLanguage('en');
  });

  it('indexes every signature ability onto its class page', () => {
    const index = buildIndex();
    const abilityType = t('guide.search.typeAbility');
    for (const c of GUIDE_CLASSES) {
      for (const a of c.signatureAbilities) {
        const hit = index.find((e) => e.label === a.name && e.type === abilityType);
        expect(hit, `signature ability "${a.name}" missing from the index`).toBeDefined();
        expect(hit?.href.endsWith(`classes/${c.id}`), `"${a.name}" links off its class`).toBe(true);
      }
    }
  });

  it('indexes every public deed onto its category section of the roll', () => {
    const index = buildIndex();
    const deedType = t('guide.search.typeDeed');
    const deedHits = index.filter((e) => e.type === deedType);
    expect(deedHits.length).toBe(GUIDE_DEEDS.length);
    for (const d of GUIDE_DEEDS.slice(0, 5)) {
      const hit = deedHits.find((e) => e.label === d.name);
      expect(hit?.href.endsWith(`deeds#deed-cat-${d.category}`), `deed "${d.name}" anchor`).toBe(
        true,
      );
    }
  });

  it('indexes every Reliquary page and relic onto that page section of the catalog', () => {
    const index = buildIndex();
    const pageType = t('guide.search.typeReliquaryPage');
    const relicType = t('guide.search.typeRelic');
    // Exact English labels: the two group headings the panel prints.
    expect([pageType, relicType]).toEqual(['Reliquary Page', 'Relic']);
    const relicTotal = GUIDE_RELIQUARY.reduce((n, p) => n + p.relics.length, 0);
    // Floors so the count parity below can never pass on an empty catalog.
    expect(GUIDE_RELIQUARY.length).toBeGreaterThanOrEqual(28);
    expect(relicTotal).toBeGreaterThanOrEqual(200);
    const pageHits = index.filter((e) => e.type === pageType);
    const relicHits = index.filter((e) => e.type === relicType);
    expect(pageHits.length).toBe(GUIDE_RELIQUARY.length);
    // Every slot, not every distinct name: a relic shown on two pages is indexed
    // once per page so each hit deep-links to the catalog the reader lands on.
    expect(relicHits.length).toBe(relicTotal);
    const catalogHtml = reliquaryCatalogSections(GUIDE_RELIQUARY);
    for (const p of GUIDE_RELIQUARY.slice(0, 5)) {
      const anchor = `reliquary#reliquary-${p.id}`;
      // The deep link resolves: the wiki page really emits this anchor.
      expect(catalogHtml, `page "${p.id}" anchor`).toContain(`id="reliquary-${p.id}"`);
      const pageHit = pageHits.find((e) => e.label === p.name);
      expect(pageHit?.href.endsWith(anchor), `reliquary page "${p.name}" anchor`).toBe(true);
      for (const r of p.relics) {
        const hit = relicHits.find((e) => e.label === r.name && e.href.endsWith(anchor));
        expect(hit, `relic "${r.name}" missing from "${p.name}"`).toBeDefined();
        // The page name rides along as extra, so a page query also surfaces its relics.
        expect(hit?.haystack.includes(p.name.toLowerCase()), `relic "${r.name}" extra`).toBe(true);
      }
    }
  });

  it('finds a Reliquary page and one of its relics by name', () => {
    const index = buildIndex();
    const page = GUIDE_RELIQUARY.find((p) => p.name === 'Gravewyrm Sanctum');
    expect(page, 'the Gravewyrm Sanctum reliquary page').toBeDefined();
    expect(
      page?.relics.some((r) => r.name === 'Gravewyrm Mantle'),
      'the Gravewyrm Mantle relic',
    ).toBe(true);
    const anchor = `reliquary#reliquary-${page?.id}`;
    expect(
      rank(index, 'gravewyrm sanctum').some(
        (e) =>
          e.label === 'Gravewyrm Sanctum' &&
          e.type === t('guide.search.typeReliquaryPage') &&
          e.href.endsWith(anchor),
      ),
      'page name does not resolve in search',
    ).toBe(true);
    expect(
      rank(index, 'gravewyrm mantle').some(
        (e) =>
          e.label === 'Gravewyrm Mantle' &&
          e.type === t('guide.search.typeRelic') &&
          e.href.endsWith(anchor),
      ),
      'relic name does not resolve in search',
    ).toBe(true);
  });

  // Indexing the Reliquary adds relic names to a public corpus, and a hidden deed's
  // reward title once leaked through a title relic (tests/guide.test.ts, the
  // hiddenDeedProse guard). Sweep the built corpus itself, not just the generated data.
  it('keeps every hidden deed out of the search corpus', () => {
    const index = buildIndex();
    const secretsOf = (d: DeedDef): string[] => [
      d.name,
      d.desc,
      ...(d.reward?.kind === 'title' ? [d.reward.text] : []),
    ];
    const hidden = Object.values(DEEDS).filter((d) => d.hidden);
    expect(hidden.length, 'the catalog has hidden deeds; this guard is meaningful').toBeGreaterThan(
      0,
    );
    expect(
      hidden.some((d) => d.reward?.kind === 'title'),
      'the reward-text arm needs a live hidden title deed',
    ).toBe(true);
    const labels = new Set(index.map((e) => e.label));
    for (const d of hidden) {
      for (const secret of secretsOf(d)) {
        expect(
          labels.has(secret),
          `hidden deed "${d.id}" leaked "${secret}" as a search label`,
        ).toBe(false);
        expect(
          index.some((e) => e.haystack.includes(secret.toLowerCase())),
          `hidden deed "${d.id}" leaked "${secret}" into a search haystack`,
        ).toBe(false);
      }
    }
  });
});
