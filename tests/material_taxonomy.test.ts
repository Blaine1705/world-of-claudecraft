// The honest material taxonomy (src/sim/material_taxonomy.ts): census-style
// membership pins for the derived source-or-reagent junk set behind the bank
// "Deposit materials" sweep and the bags/bank Materials chip. The set is pinned
// by EXACT-set equality against a literal id list (the honest-45 of the
// 2026-08-01 settlement, docs/design/professions-tuning-packet-review.md phase
// 19), swept for class exclusions by KIND against the live catalog (never by
// use type: simple_fishing_pole is use-type 'fishing' and several tools carry
// no use at all), and closed by a completeness tripwire that enumerates the
// ONLY non-poor junk allowed to stay unclassified, so a future junk item must
// be classified here explicitly instead of drifting in or out silently.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENCHANTS } from '../src/sim/content/enchants';
import {
  HARVEST_COMPONENT_ITEMS,
  HARVEST_COMPONENT_SPECIMENS,
} from '../src/sim/content/professions';
// ALL_RECIPES from data (the merged view the module itself reads), not from
// content/recipes: if data.ts ever merges a second recipe source, the
// inclusion arm must ride the same table or it silently tests a subset.
import { ALL_RECIPES, ITEMS } from '../src/sim/data';
import { isMaterialItem, MATERIAL_ITEM_IDS } from '../src/sim/material_taxonomy';
import { NODE_MATERIAL_TABLE } from '../src/sim/professions/gathering';
import { MATERIAL_GRADES } from '../src/sim/professions/material_grades';
import { SALVAGE_MATERIAL_BY_QUALITY } from '../src/sim/professions/salvage';

// The ruled material set, exactly (Q3 to Q6: staples in; grey trash, the five
// oddments, and raw fish out). A diff here is a deliberate taxonomy change:
// re-pin it AND re-check the settlement rulings still hold.
const HONEST_MATERIALS = [
  'arcane_dust',
  'arcane_essence',
  'arcane_shard',
  'arcanite_bar',
  'ashwood_log',
  'bone_fragments',
  'cooking_salt',
  'copper_ore',
  'elderwood_log',
  'fine_ashwood_log',
  'fine_copper_ore',
  'fine_elderwood_log',
  'fine_goldleaf_herb',
  'fine_iron_ore',
  'fine_ironbark_log',
  'fine_silverleaf_herb',
  'fine_sunpetal_herb',
  'fine_thorium_ore',
  'game_meat',
  'glass_vial',
  'goldleaf_herb',
  'homespun_cloth',
  'iron_ore',
  'ironbark_log',
  'linen_scrap',
  'prime_cut',
  'pristine_hide',
  'pristine_silk',
  'pristine_venom_gland',
  'resonant_hide',
  'resonant_links',
  'resonant_steel',
  'resonant_thread',
  'resonant_timber',
  'rough_hide',
  'silverleaf_herb',
  'smithing_flux',
  'spider_leg',
  'spider_silk',
  'spool_of_thread',
  'sunpetal_herb',
  'tanning_agent',
  'thorium_ore',
  'venom_gland',
  'wolf_fang',
] as const;

// The ONLY non-poor junk allowed outside the material set: four rare-mob
// trophies plus the placed keep keepsake (Q4 ruled them out of the sweep).
// A new junk item landing in this assertion's diff must be classified: either
// author it into a source table (a node yield, grade, component, specimen,
// salvage return, or junk-kind reagent) so it derives IN, or add it here as a
// deliberate non-material with the maintainer's sign-off.
const ALLOWED_UNCLASSIFIED_JUNK = [
  'emberwing_cinderscale',
  'gleamstag_charm',
  'guardian_core',
  'last_keep_signet',
  'old_cragmaws_pelt',
] as const;

// The six vendor-buyable crafting staples, ruled IN by name (Q6).
const VENDOR_STAPLES = [
  'arcanite_bar',
  'cooking_salt',
  'glass_vial',
  'smithing_flux',
  'spool_of_thread',
  'tanning_agent',
] as const;

describe('MATERIAL_ITEM_IDS: the honest-45, exactly', () => {
  it('equals the ruled material set by exact-set equality', () => {
    expect([...MATERIAL_ITEM_IDS].sort()).toEqual([...HONEST_MATERIALS]);
  });

  it('contains every vendor staple by name (Q6: staples are IN)', () => {
    for (const id of VENDOR_STAPLES) {
      expect(MATERIAL_ITEM_IDS.has(id), id).toBe(true);
    }
  });

  it('every member is a real, non-poor, junk-kind catalog item', () => {
    for (const id of MATERIAL_ITEM_IDS) {
      const def = ITEMS[id];
      expect(def, `${id} has no ITEMS def`).toBeTruthy();
      expect(def?.kind, `${id} is kind ${def?.kind}`).toBe('junk');
      expect(def?.quality, `${id} is quality poor`).not.toBe('poor');
    }
  });
});

describe('MATERIAL_ITEM_IDS: class exclusions, keyed on KIND against the live catalog', () => {
  it('excludes every non-junk item: tools, equipment, quest, mount, bag, food, and the rest', () => {
    // Kind-keyed on purpose: a use-type sweep would miss simple_fishing_pole
    // (use-type 'fishing') and the tools that carry no use at all. The census
    // below keeps the title honest: the sweep is only as strong as the kinds
    // the catalog actually carries.
    const kinds = new Set(Object.values(ITEMS).map((d) => d.kind));
    const censused = [
      'tool',
      'weapon',
      'armor',
      'held_offhand',
      'quest',
      'mount',
      'bag',
      'food',
      'drink',
      'potion',
      'elixir',
    ] as const;
    for (const kind of censused) {
      expect(kinds.has(kind), `catalog carries no kind-${kind} item`).toBe(true);
    }
    for (const def of Object.values(ITEMS)) {
      if (def.kind === 'junk') continue;
      expect(MATERIAL_ITEM_IDS.has(def.id), `${def.id} (kind ${def.kind})`).toBe(false);
    }
  });

  it('excludes every quality-poor item (grey trash deposits only by hand)', () => {
    for (const def of Object.values(ITEMS)) {
      if (def.quality !== 'poor') continue;
      expect(MATERIAL_ITEM_IDS.has(def.id), def.id).toBe(false);
    }
  });

  it('excludes the named settlement cases: implements, charms, cosmetics, fish, oddments', () => {
    // Belt to the kind sweeps' suspenders: the exact ids the settlement argued
    // over, pinned by name so a kind re-authoring cannot silently re-admit one.
    const ruledOut = [
      'simple_fishing_pole', // kind tool, use-type fishing
      'gatherers_cache', // charm (kind tool by deliberate authoring)
      'artisans_eye', // charm
      'heroic_mark', // kind tool token
      'riding_training', // kind tool token
      'glimmerfin_koi', // raw-fish cooking reagent (kind food, Q5: out)
      'raw_river_perch', // raw-fish cooking reagent (kind food, Q5: out)
      ...ALLOWED_UNCLASSIFIED_JUNK, // the five oddments (Q4: out)
    ];
    for (const id of ruledOut) {
      expect(ITEMS[id], `${id} has no ITEMS def`).toBeTruthy();
      expect(MATERIAL_ITEM_IDS.has(id), id).toBe(false);
    }
  });
});

describe('MATERIAL_ITEM_IDS: every source table is fully represented', () => {
  it('contains every node yield', () => {
    let rows = 0;
    for (const byZone of Object.values(NODE_MATERIAL_TABLE)) {
      for (const row of Object.values(byZone)) {
        rows++;
        expect(MATERIAL_ITEM_IDS.has(row.itemId), row.itemId).toBe(true);
      }
    }
    expect(rows).toBeGreaterThan(0); // non-vacuity: the table really enumerated
  });

  it('contains every fine grade', () => {
    let rows = 0;
    for (const row of Object.values(MATERIAL_GRADES)) {
      rows++;
      expect(MATERIAL_ITEM_IDS.has(row.fineItemId), row.fineItemId).toBe(true);
    }
    expect(rows).toBeGreaterThan(0);
  });

  it('contains every harvest component and every pristine specimen', () => {
    let rows = 0;
    for (const id of Object.values(HARVEST_COMPONENT_ITEMS)) {
      rows++;
      expect(MATERIAL_ITEM_IDS.has(id), id).toBe(true);
    }
    expect(rows).toBeGreaterThan(0);
    rows = 0;
    for (const id of Object.values(HARVEST_COMPONENT_SPECIMENS)) {
      rows++;
      expect(MATERIAL_ITEM_IDS.has(id), id).toBe(true);
    }
    expect(rows).toBeGreaterThan(0);
  });

  it('contains every salvage return', () => {
    let rows = 0;
    for (const id of Object.values(SALVAGE_MATERIAL_BY_QUALITY)) {
      rows++;
      expect(MATERIAL_ITEM_IDS.has(id), id).toBe(true);
    }
    expect(rows).toBeGreaterThan(0);
  });

  it('contains every junk-kind recipe and enchant reagent', () => {
    // The same enumeration recipe as tests/crafting_materials_quality.test.ts
    // (which proves these reagents resolve and are never poor); this arm rides
    // it to prove the junk-kind slice all classifies as materials.
    const reagentIds = new Set<string>();
    for (const r of ALL_RECIPES) for (const rg of r.reagents) reagentIds.add(rg.itemId);
    for (const e of Object.values(ENCHANTS)) for (const rg of e.reagents) reagentIds.add(rg.itemId);
    let junkReagents = 0;
    for (const id of reagentIds) {
      if (ITEMS[id]?.kind !== 'junk') continue;
      junkReagents++;
      expect(MATERIAL_ITEM_IDS.has(id), id).toBe(true);
    }
    // Non-vacuity: the junk slice of the reagent union is most of the set.
    expect(junkReagents).toBeGreaterThan(30);
  });
});

describe('completeness tripwire: unclassified non-poor junk', () => {
  it('is exactly the five allowed oddments, no more and no fewer', () => {
    const unclassified = Object.values(ITEMS)
      .filter((d) => d.kind === 'junk' && d.quality !== 'poor' && !MATERIAL_ITEM_IDS.has(d.id))
      .map((d) => d.id)
      .sort();
    expect(unclassified).toEqual([...ALLOWED_UNCLASSIFIED_JUNK]);
  });
});

describe('isMaterialItem', () => {
  it('answers by set membership on the live defs', () => {
    expect(isMaterialItem(ITEMS.iron_ore)).toBe(true);
    expect(isMaterialItem(ITEMS.arcanite_bar)).toBe(true);
    expect(isMaterialItem(ITEMS.simple_fishing_pole)).toBe(false);
    expect(isMaterialItem(ITEMS.guardian_core)).toBe(false);
  });
});

describe('no src/sim importer (the module-evaluation hard rule)', () => {
  it('no src/sim file other than the module itself imports material_taxonomy', () => {
    // MATERIAL_ITEM_IDS derives at module evaluation by reading the merged
    // ITEMS table; a sim-side importer would pull that derive inside data.ts's
    // evaluation cycle, where load order decides between a crash and a clean
    // run (the module header states the rule), so only a static scan catches
    // it reliably. The regex matches import SPECIFIERS in every form (from
    // clauses, bare side-effect imports, dynamic import()), never a prose
    // mention in a comment.
    const simRoot = fileURLToPath(new URL('../src/sim', import.meta.url));
    const moduleSelf = join(simRoot, 'material_taxonomy.ts');
    const offenders: string[] = [];
    const scanned: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          scanned.push(full);
          if (full === moduleSelf) continue;
          if (
            /(?:from|import)\s*\(?\s*['"][^'"]*material_taxonomy['"]/.test(
              readFileSync(full, 'utf8'),
            )
          ) {
            offenders.push(full);
          }
        }
      }
    };
    walk(simRoot);
    // Non-vacuity BOTH ways: the sweep saw a real population AND actually
    // recursed (117 files sit at the src/sim root, so a count floor alone
    // cannot prove the nested directories were walked).
    expect(scanned.length).toBeGreaterThan(100);
    expect(scanned.some((f) => f.includes(join(simRoot, 'professions') + '/'))).toBe(true);
    expect(scanned).toContain(moduleSelf);
    expect(offenders).toEqual([]);
  });
});
