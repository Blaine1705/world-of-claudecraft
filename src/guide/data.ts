// Presentational data for the Guide. Class brand colors match CLASSES[id].color and are
// mirrored from src/sim/content/; the zone teasers are derived from the generated zone
// list (content.generated.ts) so their names, level bands, and count come from the game
// itself and only the curated blurbs are hand-written. Names reuse existing i18n keys.

import type { TranslationKey } from '../ui/i18n';
import { GUIDE_ZONES } from './content.generated';

export const LEVEL_CAP = 20;

export interface ClassChip {
  id: string;
  nameKey: TranslationKey;
  color: string;
}

// Order groups the three pure archetypes first, then the hybrids, for a calm grid.
export const CLASS_CHIPS: ClassChip[] = [
  { id: 'warrior', nameKey: 'classes.warrior', color: '#d67a54' },
  { id: 'paladin', nameKey: 'classes.paladin', color: '#f58ca0' },
  { id: 'hunter', nameKey: 'classes.hunter', color: '#a6d84f' },
  { id: 'rogue', nameKey: 'classes.rogue', color: '#fcee58' },
  { id: 'priest', nameKey: 'classes.priest', color: '#c6d4f0' },
  { id: 'shaman', nameKey: 'classes.shaman', color: '#4e8aea' },
  { id: 'mage', nameKey: 'classes.mage', color: '#33c1f1' },
  { id: 'warlock', nameKey: 'classes.warlock', color: '#a785e6' },
  { id: 'druid', nameKey: 'classes.druid', color: '#ff8c1a' },
];

export interface ZoneTeaser {
  id: string;
  nameKey: TranslationKey;
  blurbKey: TranslationKey;
  min: number;
  max: number;
}

// Curated copy is keyed by a short slug, which is also the CSS accent hook the home
// zone cards use. The slug is the zone's biome, except The Farshore, which shares the
// Vale's biome and so would otherwise borrow Eastbrook's name and blurb.
const TEASER_SLUGS: Record<string, string> = { farshore_isle: 'farshore' };

// Every teaser row is derived from the generated zone list, so the landing page can
// never fall behind the world again: a new zone shows up on its own and only needs its
// guide.home.world.<slug>Name and <slug>Blurb pair written. Sorted by level band, so
// the grid reads outward from the starting valley.
export const ZONE_TEASERS: ZoneTeaser[] = [...GUIDE_ZONES]
  .sort((a, b) => a.min - b.min || a.max - b.max)
  .map((zone) => {
    const slug = TEASER_SLUGS[zone.id] ?? zone.biome;
    return {
      id: slug,
      nameKey: `guide.home.world.${slug}Name` as TranslationKey,
      blurbKey: `guide.home.world.${slug}Blurb` as TranslationKey,
      min: zone.min,
      max: zone.max,
    };
  });

/** How many zones the world holds, for copy that states the count. */
export const ZONE_COUNT = ZONE_TEASERS.length;
